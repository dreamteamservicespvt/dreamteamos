import { useEffect, useMemo, useState } from "react";
import {
  attendanceKey, resolveStatus, todayDate,
  watchCheckedInDaysInRange, watchHolidaysInRange, watchOverridesInRange,
  type AttendanceStatus,
} from "@/services/techAttendance";
import { watchPayrollConfig } from "@/services/payroll";
import {
  computeSalary, currentPayMonth, nextPayDay, payPeriodForMonth, periodDates,
  type PayDayInfo, type PayPeriod,
} from "@/utils/payrollEngine";
import { DEFAULT_PAYROLL_CONFIG, type PayrollConfig, type ResolvedDay, type SalaryComputation } from "@/types/payroll";

/**
 * Live salary for one employee for one month.
 *
 * Subscribes to the three sources that can change a day's status — manual overrides, announced
 * holidays, and check-in records — then recomputes locally. Because the engine is pure, an
 * attendance edit anywhere in the company lands on the employee's screen in the time it takes
 * Firestore to push the change, with no refresh and no extra read.
 */

export interface SalaryMonthState {
  loading: boolean;
  /** `yyyy-MM` being viewed. */
  month: string;
  /** Per-day resolved attendance, for the calendar. */
  days: ResolvedDay[];
  /** Fast lookup for a single date. */
  statusByDate: Map<string, AttendanceStatus | null>;
  computation: SalaryComputation;
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

export function useSalaryMonth({ memberId, monthlySalary, month }: UseSalaryMonthOptions): SalaryMonthState {
  const todayStr = todayDate();

  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<PayrollConfig>(DEFAULT_PAYROLL_CONFIG);

  // The period we are actually IN, not the calendar month. Between the 1st and the 9th those are
  // different periods, and taking the calendar month pointed every figure at a fortnight that had
  // not started yet — see payrollEngine.currentPayMonth.
  const targetMonth = month ?? currentPayMonth(config.payDayOfMonth);

  // Each source is tracked separately so a slow one never blocks the others from rendering.
  const [ready, setReady] = useState({ overrides: false, holidays: false, checkins: false, config: false });

  const period = useMemo(
    () => payPeriodForMonth(targetMonth, config.payDayOfMonth),
    [targetMonth, config.payDayOfMonth],
  );

  useEffect(() => {
    return watchOverridesInRange(period.start, period.end, map => {
      setOverrides(map);
      setReady(r => (r.overrides ? r : { ...r, overrides: true }));
    });
  }, [period.start, period.end]);

  useEffect(() => {
    return watchHolidaysInRange(period.start, period.end, set => {
      setHolidays(set);
      setReady(r => (r.holidays ? r : { ...r, holidays: true }));
    });
  }, [period.start, period.end]);

  useEffect(() => {
    return watchCheckedInDaysInRange(period.start, period.end, set => {
      setCheckedIn(set);
      setReady(r => (r.checkins ? r : { ...r, checkins: true }));
    });
  }, [period.start, period.end]);

  useEffect(() => {
    const unsub = watchPayrollConfig(next => {
      setConfig(next);
      setReady(r => (r.config ? r : { ...r, config: true }));
    });
    return unsub;
  }, []);

  // Reset readiness when switching months so the skeleton shows for the new month's data.
  useEffect(() => {
    setReady(r => ({ ...r, overrides: false, holidays: false, checkins: false }));
  }, [targetMonth]);

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

  const computation = useMemo(
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

  const payDay = useMemo(() => nextPayDay(new Date(), config.payDayOfMonth), [config.payDayOfMonth]);

  return {
    loading: !memberId || !ready.overrides || !ready.holidays || !ready.checkins,
    month: targetMonth,
    days,
    statusByDate,
    computation,
    config,
    payDay,
    isPastMonth: todayStr > period.end,
    period,
  };
}
