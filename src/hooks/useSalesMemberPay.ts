import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import {
  attendanceKey, resolveStatus,
  watchCheckedInDaysInRange, watchHolidaysInRange, watchOverridesInRange,
  type AttendanceStatus,
} from "@/services/techAttendance";
import { watchAllEmployeeBanks, watchPayrollConfig } from "@/services/payroll";
import { isLinePaid, watchPayrollLines } from "@/services/payrollRun";
import { commissionRate } from "@/services/settlements";
import { watchPeriodReceipts, type SalaryReceipt } from "@/services/salaryReceipts";
import { useToday } from "@/hooks/useToday";
import {
  computeSalary, currentPayMonth, deductionsFor, netPayable, nextPayDay, payPeriodForMonth, payPeriodLabel,
  periodDates, type PayDayInfo, type PayPeriod,
} from "@/utils/payrollEngine";
import { salesIncentive, salesInPeriod } from "@/utils/salesPay";
import { dailyTargetOf } from "@/utils/salesTargets";
import {
  DEFAULT_PAYROLL_CONFIG,
  type EmployeeBank, type PayrollConfig, type PayrollLine, type SalaryComputation,
} from "@/types/payroll";
import type { AppUser, Lead } from "@/types";

/**
 * Every sales member's pay for one period: attendance-driven salary plus the incentive on their
 * own verified sales.
 *
 * Reuses the tech salary engine wholesale — a sales member's salary is calculated identically,
 * so there is exactly one implementation of "what does a day of absence cost" — and, since
 * 2026-10-09, the member's own incentive rule (`utils/salesPay`: money collected in the cycle on
 * verified sales, withheld below 75% of the cycle's target). This page used to count each sale's
 * full price on its UTC submission day with no target gate, so the admin paid a different
 * incentive from the one the member's My Salary showed. A paid member's row is the payment record,
 * as on the tech Payroll — see `useMonthPayroll` for that and the loading/error rules. The page
 * passes active members only (owner, 2026-10-10).
 */

export interface SalesPayRow {
  member: AppUser;
  /** The salary half: the paid record once paid, else live from attendance. */
  computation: SalaryComputation;
  liveComputation: SalaryComputation;
  salaryDeduction: number;
  salaryPayable: number;
  salesBase: number;
  saleCount: number;
  rate: number;
  /** What the rate produces before the target gate. */
  commissionBeforeTarget: number;
  /** The incentive paid (or payable) — 0 when the gate withheld it. */
  commission: number;
  /** The 75% target gate withheld an incentive the sales would otherwise have earned. */
  incentiveWithheld: boolean;
  pendingSaleValue: number;
  pendingSaleCount: number;
  /** Salary + incentive: the amount paid once paid, else the live figure. */
  totalEarnings: number;
  liveTotalEarnings: number;
  frozen: boolean;
  changedSincePaid: boolean;
  receipts: SalaryReceipt[];
  line: PayrollLine | null;
  bank: EmployeeBank | null;
}

export interface SalesMemberPayState {
  loading: boolean;
  error: string | null;
  month: string;
  period: PayPeriod;
  payDay: PayDayInfo;
  rows: SalesPayRow[];
  totals: {
    salary: number;
    commission: number;
    total: number;
    paidCount: number;
    pendingSaleCount: number;
    pendingSaleValue: number;
  };
}

const READ_FAILED = "Attendance, sales or payment records could not be loaded, so pay is not shown. Check the connection and reload before paying anyone.";

export function useSalesMemberPay(members: AppUser[], month?: string): SalesMemberPayState {
  const todayStr = useToday();

  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<PayrollConfig>(DEFAULT_PAYROLL_CONFIG);
  const [lines, setLines] = useState<Map<string, PayrollLine>>(new Map());
  const [banks, setBanks] = useState<Map<string, EmployeeBank>>(new Map());
  const [receipts, setReceipts] = useState<Map<string, SalaryReceipt[]>>(new Map());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ready, setReady] = useState({ overrides: false, holidays: false, checkins: false, lines: false, leads: false });
  const [error, setError] = useState<string | null>(null);

  // The period we are actually IN. Taking the calendar month instead put every sales member's
  // commission in a period that had not started yet for the first nine days of every month.
  const targetMonth = month ?? currentPayMonth(config.payDayOfMonth);

  const period = useMemo(
    () => payPeriodForMonth(targetMonth, config.payDayOfMonth),
    [targetMonth, config.payDayOfMonth],
  );
  const periodText = payPeriodLabel(targetMonth, config.payDayOfMonth);

  useEffect(() => {
    setReady(r => ({ ...r, overrides: false, holidays: false, checkins: false, lines: false }));
    setError(null);
    const failed = (error: unknown) => {
      console.error("[sales payroll] read failed:", error);
      setError(READ_FAILED);
    };
    const mark = (key: "overrides" | "holidays" | "checkins" | "lines") =>
      setReady(r => (r[key] ? r : { ...r, [key]: true }));
    const unsubs = [
      watchOverridesInRange(period.start, period.end, map => { setOverrides(map); mark("overrides"); }, failed),
      watchHolidaysInRange(period.start, period.end, set => { setHolidays(set); mark("holidays"); }, failed),
      watchCheckedInDaysInRange(period.start, period.end, set => { setCheckedIn(set); mark("checkins"); }, failed),
      watchPayrollLines(targetMonth, map => { setLines(map); mark("lines"); }, failed),
      watchPeriodReceipts(targetMonth, periodText, setReceipts),
    ];
    return () => unsubs.forEach(u => u());
  }, [targetMonth, period.start, period.end, periodText]);

  useEffect(() => watchPayrollConfig(setConfig), []);
  useEffect(() => watchAllEmployeeBanks(setBanks), []);

  // Sales are read once for everyone rather than per member — one listener, not N.
  useEffect(() => onSnapshot(
    collection(db, "leads"),
    snap => {
      setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
      setReady(r => (r.leads ? r : { ...r, leads: true }));
    },
    error => {
      console.error("Sales pay lead listener failed:", error);
      setError(READ_FAILED);
    },
  ), []);

  /** Each member's leads — the sales are theirs when the lead is assigned to them. */
  const leadsByOwner = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const lead of leads) {
      if (!lead.assignedTo) continue;
      map.set(lead.assignedTo, [...(map.get(lead.assignedTo) || []), lead]);
    }
    return map;
  }, [leads]);

  const rows = useMemo<SalesPayRow[]>(() => {
    return members
      .map(member => {
        const liveComputation = computeSalary({
          month: targetMonth,
          monthlySalary: member.salary || 0,
          days: periodDates(period).map(date => ({
            date,
            status: resolveStatus({
              override: overrides.get(attendanceKey(member.uid, date)),
              checkedIn: checkedIn.has(attendanceKey(member.uid, date)),
              dateStr: date,
              hasFestivalHoliday: holidays.has(date),
              todayStr,
            }),
          })),
          todayStr,
          config,
          period,
        });

        const sales = salesInPeriod(leadsByOwner.get(member.uid) || [], period.start, period.end);
        const rate = commissionRate(member.earningsOption);
        const incentive = salesIncentive({
          salesBase: sales.salesBase, rate, dailyTarget: dailyTargetOf(member), periodStart: period.start,
        });
        const liveTotalEarnings = netPayable(liveComputation) + incentive.commission;

        const line = lines.get(member.uid) ?? null;
        const paid = isLinePaid(line) && !!line?.computation;
        const computation = paid && line ? line.computation : liveComputation;
        const salaryPayable = netPayable(computation);
        const commission = paid && line
          ? (line.incentive?.amount ?? Math.max(0, Math.round(line.netSalary - salaryPayable)))
          : incentive.commission;
        const totalEarnings = paid && line ? line.netSalary : salaryPayable + commission;

        return {
          member,
          computation,
          liveComputation,
          salaryDeduction: deductionsFor(computation).total,
          salaryPayable,
          salesBase: paid && line?.incentive ? line.incentive.salesBase : sales.salesBase,
          saleCount: sales.saleCount,
          rate: paid && line?.incentive ? line.incentive.rate : rate,
          commissionBeforeTarget: incentive.commissionBeforeTarget,
          commission,
          incentiveWithheld: paid && line?.incentive ? !!line.incentive.withheld : incentive.withheld,
          pendingSaleValue: sales.pendingSaleValue,
          pendingSaleCount: sales.pendingSaleCount,
          totalEarnings,
          liveTotalEarnings,
          frozen: paid,
          changedSincePaid: paid && Math.round(liveTotalEarnings) !== Math.round(totalEarnings),
          receipts: receipts.get(member.uid) ?? [],
          line,
          bank: banks.get(member.uid) ?? null,
        };
      });
  }, [members, targetMonth, period, overrides, checkedIn, holidays, config, todayStr, leadsByOwner, lines, banks, receipts]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    salary: acc.salary + r.salaryPayable,
    commission: acc.commission + r.commission,
    total: acc.total + r.totalEarnings,
    paidCount: acc.paidCount + (isLinePaid(r.line) ? 1 : 0),
    pendingSaleCount: acc.pendingSaleCount + r.pendingSaleCount,
    pendingSaleValue: acc.pendingSaleValue + r.pendingSaleValue,
  }), { salary: 0, commission: 0, total: 0, paidCount: 0, pendingSaleCount: 0, pendingSaleValue: 0 }), [rows]);

  const payDay = useMemo(() => nextPayDay(new Date(), config.payDayOfMonth), [config.payDayOfMonth, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !ready.overrides || !ready.holidays || !ready.checkins || !ready.lines || !ready.leads;
  return { loading, error, month: targetMonth, period, payDay, rows, totals };
}
