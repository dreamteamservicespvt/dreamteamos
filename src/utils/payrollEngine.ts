import { getDay } from "date-fns";
import type { AttendanceStatus } from "@/services/techAttendance";
import {
  DEFAULT_PAYROLL_CONFIG,
  type PayrollConfig,
  type ResolvedDay,
  type SalaryAdjustment,
  type SalaryComputation,
  type SalaryLine,
} from "@/types/payroll";

/**
 * The salary engine.
 *
 * Pure and deterministic: same inputs → same output, no clock, no network, no Firestore. That is
 * what makes it testable, what lets the UI recompute live on every attendance change without a
 * round trip, and what lets a server job produce a byte-identical figure when a payroll run is
 * locked. Every number the employee sees on their dashboard comes from here.
 *
 * The contract, stated once:
 *
 *   period       = 10th of the month → 9th of the next (the company's pay cycle)
 *   workingDays  = days in period − Sundays     (Sundays counted for real, 4 or 5)
 *   dailySalary  = monthlySalary ÷ workingDays
 *   dayCredit    = 1 (full) · 0.5 (half) · 1 (paid leave) · 0 (absent / unpaid leave)
 *                  holiday → 1, since declared holidays are paid (policy.holidaysPaid)
 *   earnings     = Σ dayCredit × dailySalary  + adjustments
 *
 * Nothing is rounded until the very end, so a month never drifts by a rupee against its own
 * line items.
 */

/** Days in a `yyyy-MM` month. */
export function monthDayCount(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// ─── Pay period ─────────────────────────────────────────────────────────────

/**
 * The stretch of days one salary payment covers.
 *
 * The company's cycle runs from the 10th of one month to the 9th of the next, paid on the 10th —
 * so a salary period is *not* a calendar month and must be modelled explicitly. A period is
 * labelled by the month it starts in: "July 2026" means 10 Jul → 9 Aug, paid 10 Aug.
 */
export interface PayPeriod {
  /** `yyyy-MM` this cycle belongs to — the month it starts in. */
  month: string;
  /** First day, inclusive (`yyyy-MM-dd`). */
  start: string;
  /** Last day, inclusive (`yyyy-MM-dd`). */
  end: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The pay period for a given month label.
 *
 * `cycleStartDay` of 1 collapses this to the plain calendar month, so a company that pays on
 * calendar months needs no special-casing anywhere downstream.
 */
export function payPeriodForMonth(
  month: string,
  cycleStartDay: number = DEFAULT_PAYROLL_CONFIG.payDayOfMonth,
): PayPeriod {
  const [y, m] = month.split("-").map(Number);

  if (cycleStartDay <= 1) {
    return { month, start: `${month}-01`, end: `${month}-${pad(monthDayCount(month))}` };
  }

  const start = new Date(y, m - 1, cycleStartDay);
  // Ends the day before the next cycle opens.
  const end = new Date(y, m, cycleStartDay - 1);
  return { month, start: iso(start), end: iso(end) };
}

/** The pay period containing a given date. */
export function payPeriodForDate(
  date: Date,
  cycleStartDay: number = DEFAULT_PAYROLL_CONFIG.payDayOfMonth,
): PayPeriod {
  // Before the cycle start day, we're still inside the previous month's period.
  const anchor = date.getDate() >= cycleStartDay
    ? date
    : new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return payPeriodForMonth(`${anchor.getFullYear()}-${pad(anchor.getMonth() + 1)}`, cycleStartDay);
}

/** Every `yyyy-MM-dd` in a period, in order. */
export function periodDates(period: PayPeriod): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = period.start.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  while (iso(cursor) <= period.end) {
    out.push(iso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** How many Sundays fall inside a period — counted, never assumed. */
export function countSundaysInPeriod(period: PayPeriod): number {
  return periodDates(period).filter(isSundayDate).length;
}

/**
 * How many Sundays a month actually has. Never assume four — July 2026 has four, March 2026 has
 * five, and using the wrong count silently misprices every single day of the month.
 */
export function countSundays(month: string): number {
  const [y, m] = month.split("-").map(Number);
  const last = monthDayCount(month);
  let count = 0;
  for (let d = 1; d <= last; d++) {
    if (getDay(new Date(y, m - 1, d)) === 0) count += 1;
  }
  return count;
}

/** Every `yyyy-MM-dd` in the month, in order. */
export function monthDates(month: string): string[] {
  const last = monthDayCount(month);
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** True when the given `yyyy-MM-dd` falls on a Sunday. */
export function isSundayDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  return getDay(new Date(y, m - 1, d)) === 0;
}

/** Round to 2 decimals without float dust (0.1 + 0.2 problems). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The share of a day's salary each attendance status earns.
 * Exported because the calendar legend and the slip both explain these to the employee.
 */
export function dayCreditFactor(status: AttendanceStatus, config: PayrollConfig): number {
  switch (status) {
    case "full": return 1;
    case "half": return config.halfDayFactor;
    case "absent": return 0;
    // A declared holiday is the company closing, not the employee choosing not to work.
    case "holiday": return config.holidaysPaid ? 1 : 0;
    // "leave" is resolved into paid/unpaid by the quota pass before it reaches here.
    case "leave": return 1;
    default: return 0;
  }
}

export interface ComputeSalaryInput {
  month: string;
  /** Gross monthly salary from the employee's package. */
  monthlySalary: number;
  /** Resolved attendance for the period. Days may be omitted; missing days count as pending. */
  days: ResolvedDay[];
  /** Today as `yyyy-MM-dd` — decides which working days count as elapsed vs. remaining. */
  todayStr: string;
  config?: Partial<PayrollConfig>;
  adjustments?: SalaryAdjustment[];
  /**
   * The stretch of days this salary covers. Defaults to the cycle derived from `month` and the
   * configured pay day, so callers that just pass a month still get the company's 10th→9th cycle.
   */
  period?: PayPeriod;
}

/**
 * Compute one employee's salary for one month.
 *
 * `days` should come from `techAttendance.resolveStatus`, which already applies the
 * override → holiday → check-in precedence. This function owns only the money.
 */
export function computeSalary(input: ComputeSalaryInput): SalaryComputation {
  const config: PayrollConfig = { ...DEFAULT_PAYROLL_CONFIG, ...input.config };
  const { month, monthlySalary, todayStr } = input;
  const adjustments = input.adjustments ?? [];

  const period = input.period ?? payPeriodForMonth(month, config.payDayOfMonth);
  const dates = periodDates(period);

  const monthDays = dates.length;
  const sundays = config.excludeSundays ? countSundaysInPeriod(period) : 0;

  // Working days come straight from the calendar, never from the attendance records — an
  // employee with no data yet must still see the correct denominator on day one of the period.
  const workingDays = Math.max(0, monthDays - sundays);

  const byDate = new Map(input.days.map(d => [d.date, d.status]));

  /**
   * Leave is granted in chronological order: the first `paidLeaveQuota` leave days of the month
   * are paid, everything after becomes leave-without-pay. Sorting matters — an employee who
   * takes leave on the 3rd and the 25th must have the 3rd paid, not whichever row loaded first.
   */
  const leaveDates = dates
    .filter(date => byDate.get(date) === "leave")
    .sort();
  const paidLeaveDates = new Set(leaveDates.slice(0, config.paidLeaveQuota));

  let fullDays = 0, halfDays = 0, paidLeaveDays = 0, unpaidLeaveDays = 0;
  let absentDays = 0, holidayDays = 0, pendingDays = 0;
  let earnedDays = 0;
  let elapsedWorkingDays = 0;

  for (const date of dates) {
    // Sundays are not working days at all: they are already out of the denominator, so they
    // must not add credit either.
    if (config.excludeSundays && isSundayDate(date)) continue;

    const status = byDate.get(date) ?? null;
    const isElapsed = date <= todayStr;

    if (status === null) {
      // Unresolved: today still in progress, or a future day. Neither earned nor lost yet.
      pendingDays += 1;
      if (isElapsed) elapsedWorkingDays += 1;
      continue;
    }

    if (isElapsed) elapsedWorkingDays += 1;

    switch (status) {
      case "full":
        fullDays += 1;
        earnedDays += 1;
        break;
      case "half":
        halfDays += 1;
        earnedDays += config.halfDayFactor;
        break;
      case "absent":
        absentDays += 1;
        break;
      case "holiday":
        holidayDays += 1;
        if (config.holidaysPaid) earnedDays += 1;
        break;
      case "leave":
        if (paidLeaveDates.has(date)) {
          paidLeaveDays += 1;
          earnedDays += 1;
        } else {
          unpaidLeaveDays += 1;
        }
        break;
    }
  }

  const dailySalary = workingDays > 0 ? monthlySalary / workingDays : 0;
  const remainingWorkingDays = Math.max(0, workingDays - elapsedWorkingDays);

  const attendanceEarnings = earnedDays * dailySalary;
  const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);

  const currentSalary = Math.max(0, round2(attendanceEarnings + adjustmentTotal));

  // Projection assumes every remaining working day is worked in full — the honest "if nothing
  // changes" number, not a best case built on days already lost.
  const projectedEarnings = (earnedDays + remainingWorkingDays) * dailySalary;
  const projectedSalary = Math.max(0, round2(projectedEarnings + adjustmentTotal));
  const projectedDeduction = round2(Math.max(0, monthlySalary - projectedSalary));

  // Attendance % is measured against days that have actually happened, so it reads 100% on the
  // 2nd of the month rather than a demoralising 7%.
  const resolvedElapsed = elapsedWorkingDays - pendingDaysElapsed(byDate, dates, todayStr, config);
  const attendancePercent = resolvedElapsed > 0
    ? round2((earnedDays / resolvedElapsed) * 100)
    : 0;

  const lines = buildLines(
    { fullDays, halfDays, paidLeaveDays, unpaidLeaveDays, absentDays, holidayDays },
    dailySalary,
    config,
    adjustments,
  );

  return {
    month,
    periodStart: period.start,
    periodEnd: period.end,
    monthlySalary,
    monthDays,
    sundays,
    holidayCount: holidayDays,
    workingDays,
    dailySalary,
    fullDays,
    halfDays,
    paidLeaveDays,
    unpaidLeaveDays,
    absentDays,
    holidayDays,
    pendingDays,
    earnedDays: round2(earnedDays),
    elapsedWorkingDays,
    remainingWorkingDays,
    attendanceEarnings: round2(attendanceEarnings),
    adjustmentTotal: round2(adjustmentTotal),
    currentSalary,
    projectedSalary,
    projectedDeduction,
    attendancePercent,
    paidLeaveQuota: config.paidLeaveQuota,
    paidLeavesRemaining: Math.max(0, config.paidLeaveQuota - paidLeaveDays),
    lines,
    adjustments,
  };
}

/** Elapsed working days that are still unresolved — excluded from the attendance % denominator. */
function pendingDaysElapsed(
  byDate: Map<string, AttendanceStatus | null>,
  dates: string[],
  todayStr: string,
  config: PayrollConfig,
): number {
  let count = 0;
  for (const date of dates) {
    if (config.excludeSundays && isSundayDate(date)) continue;
    if (date > todayStr) continue;
    if ((byDate.get(date) ?? null) === null) count += 1;
  }
  return count;
}

/** The human-readable breakdown: one row per bucket, plus a row per adjustment. */
function buildLines(
  counts: {
    fullDays: number; halfDays: number; paidLeaveDays: number;
    unpaidLeaveDays: number; absentDays: number; holidayDays: number;
  },
  dailySalary: number,
  config: PayrollConfig,
  adjustments: SalaryAdjustment[],
): SalaryLine[] {
  const line = (
    key: SalaryLine["key"], label: string, days: number, factor: number,
  ): SalaryLine => ({
    key,
    label,
    days,
    factor,
    amount: round2(days * factor * dailySalary),
    kind: factor > 0 ? "earning" : days > 0 ? "deduction" : "neutral",
  });

  const lines: SalaryLine[] = [];
  if (counts.fullDays) lines.push(line("full", "Full Days", counts.fullDays, 1));
  if (counts.halfDays) lines.push(line("half", "Half Days", counts.halfDays, config.halfDayFactor));
  if (counts.paidLeaveDays) lines.push(line("paid_leave", "Paid Leave", counts.paidLeaveDays, 1));
  if (counts.unpaidLeaveDays) lines.push(line("unpaid_leave", "Leave Without Pay", counts.unpaidLeaveDays, 0));
  if (counts.absentDays) lines.push(line("absent", "Absent", counts.absentDays, 0));
  if (counts.holidayDays) {
    lines.push(line("holiday", config.holidaysPaid ? "Holidays (paid)" : "Holidays (unpaid)",
      counts.holidayDays, config.holidaysPaid ? 1 : 0));
  }

  for (const adj of adjustments) {
    lines.push({
      key: "adjustment",
      label: adj.label,
      days: 0,
      factor: 0,
      amount: round2(adj.amount),
      kind: adj.amount >= 0 ? "earning" : "deduction",
    });
  }

  return lines;
}

// ─── Pay day ────────────────────────────────────────────────────────────────

export interface PayDayInfo {
  /** The next pay date on or after `from`. */
  date: Date;
  /** Whole days from `from` until then; 0 means today is pay day. */
  daysRemaining: number;
  /** The month being paid out — the one that just ended. */
  payingForMonth: string;
}

/**
 * When the next salary lands. Company pays on the `payDayOfMonth` (default the 10th) for the
 * month that just closed, so on 22 Jul the next pay date is 10 Aug covering July.
 */
export function nextPayDay(from: Date, payDayOfMonth = DEFAULT_PAYROLL_CONFIG.payDayOfMonth): PayDayInfo {
  const y = from.getFullYear();
  const m = from.getMonth();

  // This month's pay day if it hasn't passed, otherwise next month's.
  const thisMonthPayDay = new Date(y, m, payDayOfMonth);
  const target = from.getDate() <= payDayOfMonth ? thisMonthPayDay : new Date(y, m + 1, payDayOfMonth);

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysRemaining = Math.max(0, Math.round((startOfDay(target) - startOfDay(from)) / 86_400_000));

  // Pay day settles the previous month.
  const paidMonth = new Date(target.getFullYear(), target.getMonth() - 1, 1);
  const payingForMonth = `${paidMonth.getFullYear()}-${String(paidMonth.getMonth() + 1).padStart(2, "0")}`;

  return { date: target, daysRemaining, payingForMonth };
}

export interface DeductionRow {
  /** Stable identity, so a UI can phrase the row without string-matching its label. */
  key: "absent" | "half" | "unpaid_leave" | "unpaid_holiday";
  label: string;
  days: number;
  amount: number;
}

/**
 * Salary framed the way people actually think about it: the monthly figure, minus what
 * imperfect attendance cost. Shared by the employee dashboard, the admin table, and the payslip
 * so all three subtract exactly the same things.
 */
export function deductionsFor(c: SalaryComputation): { rows: DeductionRow[]; total: number } {
  const rate = c.dailySalary;
  // A half day earns its factor, so it costs the remainder. Read the factor back off the line
  // the engine produced rather than assuming 0.5, so a policy change flows through automatically.
  const halfFactor = c.lines.find(l => l.key === "half")?.factor ?? 0.5;

  const rows: DeductionRow[] = [
    { key: "absent", label: "Absent", days: c.absentDays, amount: c.absentDays * rate },
    { key: "half", label: "Half days", days: c.halfDays, amount: c.halfDays * rate * (1 - halfFactor) },
    { key: "unpaid_leave", label: "Unpaid leave", days: c.unpaidLeaveDays, amount: c.unpaidLeaveDays * rate },
  ];

  // Holidays only cost the employee when company policy says they're unpaid.
  if (c.lines.some(l => l.key === "holiday" && l.factor === 0)) {
    rows.push({ key: "unpaid_holiday", label: "Unpaid holidays", days: c.holidayDays, amount: c.holidayDays * rate });
  }

  const kept = rows.filter(r => r.days > 0);
  return { rows: kept, total: kept.reduce((sum, r) => sum + r.amount, 0) };
}

/**
 * The formula as a string, for the "how is this calculated" panel. Kept next to the engine so
 * the explanation can never drift from the arithmetic it describes.
 */
export function formulaText(c: SalaryComputation): string {
  const parts = c.lines
    .filter(l => l.days > 0)
    .map(l => `${l.days} × ${l.factor} × ₹${c.dailySalary.toFixed(2)}`);
  const adj = c.adjustments.map(a => `${a.amount >= 0 ? "+" : "−"} ₹${Math.abs(a.amount).toFixed(2)}`);
  return [...parts, ...adj].join("  +  ") || "—";
}
