import { useEffect, useMemo, useState } from "react";
import {
  attendanceKey, resolveStatus, todayDate,
  watchCheckedInDaysInRange, watchHolidaysInRange, watchOverridesInRange,
  type AttendanceStatus,
} from "@/services/techAttendance";
import { watchAllEmployeeBanks, watchPayrollConfig } from "@/services/payroll";
import { watchPayrollLines, watchPayrollRun } from "@/services/payrollRun";
import {
  computeSalary, currentPayMonth, nextPayDay, payPeriodForMonth, periodDates,
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
 * Before a run is locked the figures are derived here from current attendance, so the admin
 * table reflects an attendance edit the instant it happens. Once locked, the frozen
 * `payroll_lines.computation` takes over — history must never move.
 *
 * Costs three range-scoped listeners regardless of headcount: attendance overrides, holidays,
 * and check-ins are fetched once for the whole pay period and shared across every employee.
 */

export interface PayrollRow {
  member: AppUser;
  computation: SalaryComputation;
  /** The generated line, once payroll has been run for this month. */
  line: PayrollLine | null;
  bank: EmployeeBank | null;
  /** True when the figures come from a locked run rather than live attendance. */
  frozen: boolean;
  /** What this employee will actually be paid. */
  netSalary: number;
}

export interface MonthPayrollState {
  loading: boolean;
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

export function useMonthPayroll(members: AppUser[], month?: string): MonthPayrollState {
  const todayStr = todayDate();

  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<PayrollConfig>(DEFAULT_PAYROLL_CONFIG);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [lines, setLines] = useState<Map<string, PayrollLine>>(new Map());
  const [banks, setBanks] = useState<Map<string, EmployeeBank>>(new Map());
  const [ready, setReady] = useState(false);

  // The period we are actually IN — never the calendar month, which for the first nine days of
  // any month names a period that has not begun.
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
      watchCheckedInDaysInRange(period.start, period.end, set => {
        setCheckedIn(set);
        setReady(true); // the last of the three to settle in practice
      }),
      watchPayrollRun(targetMonth, setRun),
      watchPayrollLines(targetMonth, setLines),
    ];
    return () => unsubs.forEach(u => u());
  }, [targetMonth, period.start, period.end]);

  useEffect(() => watchPayrollConfig(setConfig), []);
  useEffect(() => watchAllEmployeeBanks(setBanks), []);

  const frozen = !!run && FROZEN_STAGES.has(run.status);

  const rows = useMemo<PayrollRow[]>(() => {
    // A locked run is explained by the policy it was generated under, not today's policy.
    const activeConfig = frozen && run?.config ? run.config : config;

    return members.map(member => {
      const line = lines.get(member.uid) ?? null;

      const computation = frozen && line?.computation
        ? line.computation
        : computeSalary({
            month: targetMonth,
            monthlySalary: member.salary || 0,
            days: periodDates(period).map(date => ({
              date,
              status: resolveStatus({
                override: overrides.get(attendanceKey(member.uid, date)),
                checkedIn: checkedIn.has(attendanceKey(member.uid, date)),
                dateStr: date,
                hasFestivalHoliday: holidays.has(date),
                todayStr: todayStr,
              }),
            })),
            todayStr: todayStr,
            config: activeConfig,
            period,
          });

      return {
        member,
        computation,
        line,
        bank: banks.get(member.uid) ?? null,
        frozen,
        netSalary: frozen && line ? line.netSalary : computation.projectedSalary,
      };
    });
  }, [members, targetMonth, period, overrides, checkedIn, holidays, config, lines, banks, frozen, run, todayStr]);

  const totals = useMemo(() => {
    const paidStatuses = new Set(["transferred", "completed"]);
    let gross = 0, net = 0, paid = 0, pending = 0, attendanceSum = 0, bankReady = 0;

    for (const row of rows) {
      gross += row.computation.monthlySalary;
      net += row.netSalary;
      attendanceSum += row.computation.attendancePercent;
      if (row.line && paidStatuses.has(row.line.paymentStatus)) paid += row.netSalary;
      else pending += row.netSalary;
      if (row.bank && row.bank.accountHolderName) bankReady += 1;
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

  const payDay = useMemo(() => nextPayDay(new Date(), config.payDayOfMonth), [config.payDayOfMonth]);

  return { loading: !ready, month: targetMonth, rows, run, config, payDay, totals, period };
}
