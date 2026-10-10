import { useEffect, useMemo, useState } from "react";
import {
  attendanceKey, resolveStatus,
  watchCheckedInDaysInRange, watchHolidaysInRange, watchOverridesInRange,
  type AttendanceStatus,
} from "@/services/techAttendance";
import { isBankComplete, watchAllEmployeeBanks, watchPayrollConfig } from "@/services/payroll";
import { isLinePaid, watchPayrollLines, watchPayrollRun } from "@/services/payrollRun";
import { watchPeriodReceipts, type SalaryReceipt } from "@/services/salaryReceipts";
import { useToday } from "@/hooks/useToday";
import {
  computeSalary, currentPayMonth, netPayable, nextPayDay, payPeriodForMonth, payPeriodLabel, periodDates,
  type PayDayInfo, type PayPeriod,
} from "@/utils/payrollEngine";
import {
  DEFAULT_PAYROLL_CONFIG,
  type EmployeeBank, type PayrollConfig, type PayrollLine, type PayrollRun,
  type SalaryComputation,
} from "@/types/payroll";
import type { AppUser } from "@/types";

/**
 * Every employee's payroll for one month, live.
 *
 * Until a salary is paid its figures are derived here from current attendance, so the admin table
 * reflects an attendance edit the instant it happens. Once it is paid, the payment record
 * (`payroll_lines/{month}_{uid}`: the amount transferred and the computation it was priced on) is
 * the row — history must never move.
 *
 * ── What was wrong (2026-10-09) ───────────────────────────────────────────────────────────────
 * • Freezing hung off a `payroll_runs` stage, and nothing in the app ever creates a run. So a paid
 *   row kept re-pricing itself: an attendance correction or a salary edit after payday silently
 *   changed the "Net Payable" beside "Paid", the "Paid" total and the re-downloaded payslip, while
 *   the record said something else. A paid row now shows the record, and `changedSincePaid` says
 *   when today's attendance prices the period differently — the correction is visible, never lost.
 * • "Loaded" was declared when the check-ins answered, whatever the overrides and holidays had
 *   done, and the check-in listener itself answered after the first of its two collections. In
 *   that window leave and holidays read as Absent and every sales member as absent all period.
 *   Every source now has to answer first.
 * • A failed read arrived as an empty result — the same as "no leave, nobody paid". It is an
 *   `error` now, and the page shows it instead of figures.
 *
 * The page passes active members only (owner, 2026-10-10: inactive people are shown nowhere but My Team
 * and Team Management — `roleHelpers.isActiveUser`), so a member is paid while active.
 *
 * Costs the same range-scoped listeners regardless of headcount, plus two equality listeners for
 * the period's accounts receipts.
 */

export interface PayrollRow {
  member: AppUser;
  /** The salary for the period: the paid record once paid, else live from attendance. */
  computation: SalaryComputation;
  /** Always live from attendance. */
  liveComputation: SalaryComputation;
  /** The payment record, once this member has been paid for the period. */
  line: PayrollLine | null;
  bank: EmployeeBank | null;
  /** True when the figures are a payment record (or a locked run) rather than live attendance. */
  frozen: boolean;
  /** What this employee is paid: the amount transferred once paid, else salary less attendance. */
  netSalary: number;
  /** What today's attendance says they should be paid. */
  liveNetSalary: number;
  /** Paid, and today's attendance prices the period differently from the payment. */
  changedSincePaid: boolean;
  /** What the accounts admin has recorded for this period from Salary Management. */
  receipts: SalaryReceipt[];
}

export interface MonthPayrollState {
  loading: boolean;
  /** Attendance or payments could not be read — the figures are not shown as a salary. */
  error: string | null;
  month: string;
  rows: PayrollRow[];
  run: PayrollRun | null;
  config: PayrollConfig;
  payDay: PayDayInfo;
  /** The exact span these salaries cover — the cycle is 10th→9th, not a calendar month. */
  period: PayPeriod;
  totals: {
    gross: number;
    net: number;
    paid: number;
    pending: number;
    averageAttendance: number;
    bankReady: number;
    bankMissing: number;
  };
}

/** Figures stop being live once the run reaches this stage. */
const FROZEN_STAGES = new Set(["locked", "processing", "paid", "completed"]);

const READ_FAILED = "Attendance or payment records could not be loaded, so salaries are not shown. Check the connection and reload before paying anyone.";

export function useMonthPayroll(members: AppUser[], month?: string): MonthPayrollState {
  const todayStr = useToday();

  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<PayrollConfig>(DEFAULT_PAYROLL_CONFIG);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [lines, setLines] = useState<Map<string, PayrollLine>>(new Map());
  const [banks, setBanks] = useState<Map<string, EmployeeBank>>(new Map());
  const [receipts, setReceipts] = useState<Map<string, SalaryReceipt[]>>(new Map());
  const [ready, setReady] = useState({ overrides: false, holidays: false, checkins: false, lines: false });
  const [error, setError] = useState<string | null>(null);

  // The period we are actually IN — never the calendar month, which for the first nine days of
  // any month names a period that has not begun.
  const targetMonth = month ?? currentPayMonth(config.payDayOfMonth);

  const period = useMemo(
    () => payPeriodForMonth(targetMonth, config.payDayOfMonth),
    [targetMonth, config.payDayOfMonth],
  );
  const periodText = payPeriodLabel(targetMonth, config.payDayOfMonth);

  useEffect(() => {
    setReady({ overrides: false, holidays: false, checkins: false, lines: false });
    setError(null);
    const failed = (error: unknown) => {
      console.error("[payroll] read failed:", error);
      setError(READ_FAILED);
    };
    const mark = (key: keyof typeof ready) => setReady(r => (r[key] ? r : { ...r, [key]: true }));
    const unsubs = [
      watchOverridesInRange(period.start, period.end, map => { setOverrides(map); mark("overrides"); }, failed),
      watchHolidaysInRange(period.start, period.end, set => { setHolidays(set); mark("holidays"); }, failed),
      // Reports only once BOTH check-in collections have answered.
      watchCheckedInDaysInRange(period.start, period.end, set => { setCheckedIn(set); mark("checkins"); }, failed),
      watchPayrollRun(targetMonth, setRun),
      watchPayrollLines(targetMonth, map => { setLines(map); mark("lines"); }, failed),
      watchPeriodReceipts(targetMonth, periodText, setReceipts),
    ];
    return () => unsubs.forEach(u => u());
  }, [targetMonth, period.start, period.end, periodText]);

  useEffect(() => watchPayrollConfig(setConfig), []);
  useEffect(() => watchAllEmployeeBanks(setBanks), []);

  const runFrozen = !!run && FROZEN_STAGES.has(run.status);

  const rows = useMemo<PayrollRow[]>(() => {
    // A locked run is explained by the policy it was generated under, not today's policy.
    const activeConfig = runFrozen && run?.config ? run.config : config;

    return members
      .map(member => {
        const line = lines.get(member.uid) ?? null;
        const paid = isLinePaid(line);

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
          config: activeConfig,
          period,
        });
        const liveNetSalary = netPayable(liveComputation);

        const frozen = (paid || runFrozen) && !!line?.computation;
        const computation = frozen && line ? line.computation : liveComputation;
        const netSalary = frozen && line ? line.netSalary : liveNetSalary;

        return {
          member,
          computation,
          liveComputation,
          line,
          bank: banks.get(member.uid) ?? null,
          frozen,
          netSalary,
          liveNetSalary,
          changedSincePaid: paid && Math.round(liveNetSalary) !== Math.round(netSalary),
          receipts: receipts.get(member.uid) ?? [],
        };
      });
  }, [members, targetMonth, period, overrides, checkedIn, holidays, config, lines, banks, runFrozen, run, todayStr, receipts]);

  const totals = useMemo(() => {
    let gross = 0, net = 0, paid = 0, pending = 0, attendanceSum = 0, bankReady = 0;

    for (const row of rows) {
      gross += row.computation.monthlySalary;
      net += row.netSalary;
      attendanceSum += row.computation.attendancePercent;
      if (isLinePaid(row.line)) paid += row.netSalary;
      else pending += row.netSalary;
      // The same test as the Mark paid button. This read `bank.accountHolderName`, a legacy field
      // `normalizeBank` never sets, so the page warned that EVERY employee could not be paid.
      if (isBankComplete(row.bank)) bankReady += 1;
    }

    return {
      gross: Math.round(gross),
      net: Math.round(net),
      paid: Math.round(paid),
      pending: Math.round(pending),
      averageAttendance: rows.length ? Math.round(attendanceSum / rows.length) : 0,
      bankReady,
      bankMissing: rows.length - bankReady,
    };
  }, [rows]);

  const payDay = useMemo(() => nextPayDay(new Date(), config.payDayOfMonth), [config.payDayOfMonth, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !ready.overrides || !ready.holidays || !ready.checkins || !ready.lines;
  return { loading, error, month: targetMonth, rows, run, config, payDay, totals, period };
}
