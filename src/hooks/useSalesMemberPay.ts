import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import {
  attendanceKey, resolveStatus, todayDate,
  watchCheckedInDaysInRange, watchHolidaysInRange, watchOverridesInRange,
  type AttendanceStatus,
} from "@/services/techAttendance";
import { watchAllEmployeeBanks, watchPayrollConfig } from "@/services/payroll";
import { watchPayrollLines } from "@/services/payrollRun";
import { commissionRate } from "@/services/settlements";
import {
  computeSalary, currentPayMonth, deductionsFor, nextPayDay, payPeriodForMonth, periodDates,
  type PayDayInfo, type PayPeriod,
} from "@/utils/payrollEngine";
import {
  DEFAULT_PAYROLL_CONFIG,
  type EmployeeBank, type PayrollConfig, type PayrollLine, type SalaryComputation,
} from "@/types/payroll";
import type { AppUser, Lead, SaleDetail } from "@/types";

/**
 * Every sales member's pay for one period: attendance-driven salary plus commission on their own
 * verified sales.
 *
 * Reuses the tech salary engine wholesale — a sales member's salary is calculated identically,
 * so there is exactly one implementation of "what does a day of absence cost".
 */

export interface SalesPayRow {
  member: AppUser;
  computation: SalaryComputation;
  salaryDeduction: number;
  salaryPayable: number;
  salesBase: number;
  saleCount: number;
  rate: number;
  commission: number;
  pendingSaleValue: number;
  pendingSaleCount: number;
  totalEarnings: number;
  line: PayrollLine | null;
  bank: EmployeeBank | null;
}

export interface SalesMemberPayState {
  loading: boolean;
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

const saleItemsOf = (lead: Lead): SaleDetail[] =>
  lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);

const saleDateOf = (item: SaleDetail, lead: Lead): string | null => {
  const seconds = (item.submittedAt as { seconds?: number })?.seconds
    ?? (lead.createdAt as { seconds?: number })?.seconds;
  return seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null;
};

export function useSalesMemberPay(members: AppUser[], month?: string): SalesMemberPayState {
  const todayStr = todayDate();

  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<PayrollConfig>(DEFAULT_PAYROLL_CONFIG);
  const [lines, setLines] = useState<Map<string, PayrollLine>>(new Map());
  const [banks, setBanks] = useState<Map<string, EmployeeBank>>(new Map());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ready, setReady] = useState(false);

  // The period we are actually IN. Taking the calendar month instead put every sales member's
  // commission in a period that had not started yet for the first nine days of every month.
  const targetMonth = month ?? currentPayMonth(config.payDayOfMonth);

  const period = useMemo(
    () => payPeriodForMonth(targetMonth, config.payDayOfMonth),
    [targetMonth, config.payDayOfMonth],
  );

  useEffect(() => {
    setReady(false);
    const unsubs = [
      watchOverridesInRange(period.start, period.end, setOverrides),
      watchHolidaysInRange(period.start, period.end, setHolidays),
      watchCheckedInDaysInRange(period.start, period.end, set => { setCheckedIn(set); setReady(true); }),
      watchPayrollLines(targetMonth, setLines),
    ];
    return () => unsubs.forEach(u => u());
  }, [targetMonth, period.start, period.end]);

  useEffect(() => watchPayrollConfig(setConfig), []);
  useEffect(() => watchAllEmployeeBanks(setBanks), []);

  // Sales are read once for everyone rather than per member — one listener, not N.
  useEffect(() => onSnapshot(
    collection(db, "leads"),
    snap => setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead))),
    error => { console.error("Sales pay lead listener failed:", error); setLeads([]); },
  ), []);

  /** Verified and pending sale totals per member for this period. */
  const salesByMember = useMemo(() => {
    const map = new Map<string, { base: number; count: number; pendingValue: number; pendingCount: number }>();

    for (const lead of leads) {
      const owner = lead.assignedTo;
      if (!owner) continue;

      for (const item of saleItemsOf(lead)) {
        const date = saleDateOf(item, lead);
        if (!date || date < period.start || date > period.end) continue;

        const entry = map.get(owner) ?? { base: 0, count: 0, pendingValue: 0, pendingCount: 0 };
        if (item.verificationStatus === "verified") {
          entry.base += item.amount || 0;
          entry.count += 1;
        } else if (item.verificationStatus === "pending") {
          entry.pendingValue += item.amount || 0;
          entry.pendingCount += 1;
        }
        map.set(owner, entry);
      }
    }
    return map;
  }, [leads, period]);

  const rows = useMemo<SalesPayRow[]>(() => members.map(member => {
    const computation = computeSalary({
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

    const { total: salaryDeduction } = deductionsFor(computation);
    const salaryPayable = Math.max(0, computation.monthlySalary - salaryDeduction);

    const sales = salesByMember.get(member.uid) ?? { base: 0, count: 0, pendingValue: 0, pendingCount: 0 };
    const rate = commissionRate(member.earningsOption);
    const commission = Math.round((sales.base * rate) / 100);

    return {
      member,
      computation,
      salaryDeduction,
      salaryPayable,
      salesBase: sales.base,
      saleCount: sales.count,
      rate,
      commission,
      pendingSaleValue: sales.pendingValue,
      pendingSaleCount: sales.pendingCount,
      totalEarnings: salaryPayable + commission,
      line: lines.get(member.uid) ?? null,
      bank: banks.get(member.uid) ?? null,
    };
  }), [members, targetMonth, period, overrides, checkedIn, holidays, config, todayStr, salesByMember, lines, banks]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    salary: acc.salary + r.salaryPayable,
    commission: acc.commission + r.commission,
    total: acc.total + r.totalEarnings,
    paidCount: acc.paidCount + (r.line?.paymentStatus === "completed" ? 1 : 0),
    pendingSaleCount: acc.pendingSaleCount + r.pendingSaleCount,
    pendingSaleValue: acc.pendingSaleValue + r.pendingSaleValue,
  }), { salary: 0, commission: 0, total: 0, paidCount: 0, pendingSaleCount: 0, pendingSaleValue: 0 }), [rows]);

  const payDay = useMemo(() => nextPayDay(new Date(), config.payDayOfMonth), [config.payDayOfMonth]);

  return { loading: !ready, month: targetMonth, period, payDay, rows, totals };
}
