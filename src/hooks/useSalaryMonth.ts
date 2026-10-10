import { useEffect, useMemo, useState } from "react";
import {
  attendanceKey, resolveStatus,
  watchCheckedInDaysInRange, watchHolidaysInRange, watchOverridesInRange,
  type AttendanceStatus,
} from "@/services/techAttendance";
import { watchPayrollConfig } from "@/services/payroll";
import { isLinePaid, watchPayrollLine } from "@/services/payrollRun";
import { useToday } from "@/hooks/useToday";
import {
  computeSalary, currentPayMonth, netPayable, nextPayDay, payPeriodForMonth, periodDates,
  type PayDayInfo, type PayPeriod,
} from "@/utils/payrollEngine";
import {
  DEFAULT_PAYROLL_CONFIG, type PayrollConfig, type PayrollLine, type ResolvedDay, type SalaryComputation,
} from "@/types/payroll";

/**
 * Live salary for one employee for one month.
 *
 * Subscribes to the three sources that can change a day's status — manual overrides, announced
 * holidays, and check-in records — then recomputes locally. Because the engine is pure, an
 * attendance edit anywhere in the company lands on the employee's screen in the time it takes
 * Firestore to push the change, with no refresh and no extra read.
 *
 * ── Once the period is paid (2026-10-09) ─────────────────────────────────────────────────────
 * The payment record (`payroll_lines/{month}_{uid}`) is what the admin paid and what the payslip
 * states, so `computation` becomes that record's frozen computation and `paidLine` carries the
 * amount. `liveComputation` keeps following attendance, and `changedSincePaid` says when the two no
 * longer agree — an attendance correction after payday is shown, never silently written over the
 * money that was actually transferred.
 */

export interface SalaryMonthState {
  loading: boolean;
  /**
   * Set when attendance could not be read. The figures are then NOT a salary — a failed read used
   * to arrive as "no check-ins, no leave", pricing every day Absent with nothing to say so.
   */
  error: string | null;
  /** `yyyy-MM` being viewed. */
  month: string;
  /** Per-day resolved attendance, for the calendar — always live. */
  days: ResolvedDay[];
  /** Fast lookup for a single date. */
  statusByDate: Map<string, AttendanceStatus | null>;
  /** The salary for the period: the paid record once paid, else live from attendance. */
  computation: SalaryComputation;
  /** Always live from attendance, paid or not. */
  liveComputation: SalaryComputation;
  /** The payment record, once this period has been paid. */
  paidLine: PayrollLine | null;
  /** Paid, and today's attendance prices the period differently from what was paid. */
  changedSincePaid: boolean;
  config: PayrollConfig;
  payDay: PayDayInfo;
  /** True when viewing a period that has already ended. */
  isPastMonth: boolean;
  /** The exact span this salary covers — the cycle is 10th→9th, not a calendar month. */
  period: PayPeriod;
}

export interface UseSalaryMonthOptions {
  memberId: string | undefined;
  monthlySalary: number;
  /** `yyyy-MM`; defaults to the current month. */
  month?: string;
}

const READ_FAILED = "Attendance could not be loaded, so this salary cannot be shown right now. Check the connection and reload.";

export function useSalaryMonth({ memberId, monthlySalary, month }: UseSalaryMonthOptions): SalaryMonthState {
  const todayStr = useToday();

  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<PayrollConfig>(DEFAULT_PAYROLL_CONFIG);
  const [line, setLine] = useState<PayrollLine | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The period we are actually IN, not the calendar month. Between the 1st and the 9th those are
  // different periods, and taking the calendar month pointed every figure at a fortnight that had
  // not started yet — see payrollEngine.currentPayMonth.
  const targetMonth = month ?? currentPayMonth(config.payDayOfMonth);

  // Each source is tracked separately so a slow one never blocks the others from rendering.
  const [ready, setReady] = useState({ overrides: false, holidays: false, checkins: false, line: false, config: false });

  const period = useMemo(
    () => payPeriodForMonth(targetMonth, config.payDayOfMonth),
    [targetMonth, config.payDayOfMonth],
  );

  const failed = (error: unknown) => {
    console.error("[salary] attendance read failed:", error);
    setError(READ_FAILED);
  };

  useEffect(() => {
    setReady(r => ({ ...r, overrides: false }));
    return watchOverridesInRange(period.start, period.end, map => {
      setOverrides(map);
      setReady(r => (r.overrides ? r : { ...r, overrides: true }));
    }, failed);
  }, [period.start, period.end]);

  useEffect(() => {
    setReady(r => ({ ...r, holidays: false }));
    return watchHolidaysInRange(period.start, period.end, set => {
      setHolidays(set);
      setReady(r => (r.holidays ? r : { ...r, holidays: true }));
    }, failed);
  }, [period.start, period.end]);

  useEffect(() => {
    setReady(r => ({ ...r, checkins: false }));
    // Reports only once BOTH check-in collections have answered (see watchCheckedInDaysInRange).
    return watchCheckedInDaysInRange(period.start, period.end, set => {
      setCheckedIn(set);
      setReady(r => (r.checkins ? r : { ...r, checkins: true }));
    }, failed);
  }, [period.start, period.end]);

  useEffect(() => {
    if (!memberId) return;
    setReady(r => ({ ...r, line: false }));
    return watchPayrollLine(targetMonth, memberId, next => {
      setLine(next);
      setReady(r => (r.line ? r : { ...r, line: true }));
    }, failed);
  }, [targetMonth, memberId]);

  useEffect(() => {
    const unsub = watchPayrollConfig(next => {
      setConfig(next);
      setReady(r => (r.config ? r : { ...r, config: true }));
    });
    return unsub;
  }, []);

  // A new period starts with a clean slate: an error belonged to the reads that were replaced.
  useEffect(() => { setError(null); }, [period.start, period.end, memberId]);

  const days = useMemo<ResolvedDay[]>(() => {
    if (!memberId) return [];
    return periodDates(period).map(date => ({
      date,
      status: resolveStatus({
        override: overrides.get(attendanceKey(memberId, date)),
        checkedIn: checkedIn.has(attendanceKey(memberId, date)),
        dateStr: date,
        hasFestivalHoliday: holidays.has(date),
        todayStr,
      }),
    }));
  }, [memberId, period, overrides, checkedIn, holidays, todayStr]);

  const statusByDate = useMemo(
    () => new Map(days.map(d => [d.date, d.status])),
    [days],
  );

  const liveComputation = useMemo(
    () => computeSalary({
      month: targetMonth,
      monthlySalary,
      days,
      todayStr,
      config,
      period,
    }),
    [targetMonth, monthlySalary, days, todayStr, config, period],
  );

  const paidLine = isLinePaid(line) ? line : null;
  const computation = paidLine?.computation ?? liveComputation;
  const changedSincePaid = !!paidLine && Math.round(netPayable(liveComputation)) !== Math.round(netPayable(computation));

  const payDay = useMemo(() => nextPayDay(new Date(), config.payDayOfMonth), [config.payDayOfMonth, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    loading: !memberId || !ready.overrides || !ready.holidays || !ready.checkins || !ready.line,
    error,
    month: targetMonth,
    days,
    statusByDate,
    computation,
    liveComputation,
    paidLine,
    changedSincePaid,
    config,
    payDay,
    isPastMonth: todayStr > period.end,
    period,
  };
}
