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

/**
 * The pay period label (`yyyy-MM`) that TODAY falls inside.
 *
 * ── Why this exists, and why `format(new Date(), "yyyy-MM")` is a bug ─────────────────────────
 * A period is labelled by the month it STARTS in, and it starts on the 10th. So for the first nine
 * days of any month, today's calendar month names a period that has not begun yet: on 1 August the
 * calendar says "2026-08", which is 10 Aug → 9 Sep — a window in the future containing no sales, no
 * attendance and no work.
 *
 * That is exactly what emptied the sales team's commission every month between the 1st and the 9th:
 * every screen defaulted to the calendar month, so a member who had sold all through July opened
 * their salary page on 1 August and saw ₹0. The money was never missing; the screens were pointed at
 * the wrong fortnight.
 *
 * Every screen that needs "the current month" must ask this, never the clock's calendar month.
 */
export function currentPayMonth(
  cycleStartDay: number = DEFAULT_PAYROLL_CONFIG.payDayOfMonth,
  today: Date = new Date(),
): string {
  return payPeriodForDate(today, cycleStartDay).month;
}

/**
 * The pay period whose salary is being paid out now — the one a payment or a receipt made today is for.
 *
 * Not `currentPayMonth`: a cycle is paid AFTER it ends (July's 10 Jul → 9 Aug is paid on 10 Aug), so on
 * payday the period in progress is the one that has just begun, with nothing to pay. All through calendar
 * month M+1 — on the pay day, before it (the cycle is about to close) and after it (a late payment) — the
 * salary being paid is period M. Salary Management defaulted its receipt to the running cycle and checked
 * "already paid in Payroll" against it, so on payday it offered the new cycle's figure and never saw the
 * payment just made (2026-10-10).
 */
export function salaryMonthDue(today: Date = new Date()): string {
  return shiftPayMonth(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`, -1);
}

/** Step a pay-period label by whole months, e.g. the ‹ › buttons on a salary screen. */
export function shiftPayMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const next = new Date(y, m - 1 + delta, 1);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3));

/**
 * "July 2026 (10 Jul – 09 Aug)" — how a pay period must always be written on screen.
 *
 * Naming the period "August" while it runs 10 Jul → 9 Aug is the confusion that made the team
 * think their money had disappeared, so the span is never left implicit: the month name says which
 * period it is, and the dates in brackets say exactly which days it counts.
 */
export function payPeriodLabel(
  month: string,
  cycleStartDay: number = DEFAULT_PAYROLL_CONFIG.payDayOfMonth,
): string {
  const [y, m] = month.split("-").map(Number);
  const name = `${MONTH_NAMES[m - 1] ?? month} ${y}`;
  if (cycleStartDay <= 1) return name; // a calendar-month company needs no bracket
  const { start, end } = payPeriodForMonth(month, cycleStartDay);
  return `${name} (${shortDay(start)} – ${shortDay(end)})`;
}

/** "10 Jul" from a `yyyy-MM-dd`. */
function shortDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${pad(d)} ${SHORT_MONTHS[m - 1] ?? ""}`.trim();
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
    // Holiday work is paid as the holiday it is; its reward is the comp-off credit, not this day.
    case "holiday_work": return config.holidaysPaid ? 1 : 0;
    // A comp-off day is paid in full — when a credit covers it (see tallyAttendance).
    case "comp_off": return 1;
    default: return 0;
  }
}

// ─── Attendance tally ───────────────────────────────────────────────────────

/**
 * What a run of resolved days adds up to — THE count of Present / Half / Absent / Leave / Holiday.
 *
 * ── Why the grid and the salary both call this ─────────────────────────────────────────────────
 * The attendance grid and the calendars used to count for themselves (`techAttendance.summarize`:
 * every marked cell, Sundays included, against a hard-coded allowance of two) while the salary
 * skipped Sundays and read the allowance from policy. A Sunday an admin had marked Present was
 * "1P" on the grid and nothing on the payslip, so the two Present counts disagreed and nobody could
 * say which one was right. There is one count now, and every screen reads it.
 *
 * ── Sundays ────────────────────────────────────────────────────────────────────────────────────
 * The weekly off is already paid (it is out of the denominator), so a mark on a Sunday never
 * changes pay and is never counted (owner, 2026-10-09). That includes Leave: the quota pass used to
 * run before the Sunday skip, so a Sunday marked Leave took one of the two paid-leave slots and
 * pushed a real weekday's leave into a deduction.
 *
 * ── Comp-off (owner, 2026-10-10) ───────────────────────────────────────────────────────────────
 * A holiday the admin marks as worked (`holiday_work`, W — a Sunday or an announced holiday) earns ONE
 * credit for the period, whatever part of the day was worked; it adds no pay itself, so the Sunday rule
 * holds. A `comp_off` day (C) is paid in full out of those credits — never one of the paid leaves — in
 * date order; a C beyond the credits is unpaid. Credits belong to the period they were earned in
 * ("same cycle only"): this tally only ever sees one period, so nothing carries over.
 */
export interface AttendanceTally {
  full: number;
  half: number;
  absent: number;
  /** Every working day marked Leave, paid or not — what the grid's "L" counts. */
  leave: number;
  paidLeave: number;
  unpaidLeave: number;
  holiday: number;
  /** Working days with no status yet: today before the check-in, or a day still to come. */
  pending: number;
  /** Presence credit: full = 1, half = the configured half-day factor. */
  presentDays: number;
  /** Paid leave still available in the period. */
  leavesLeft: number;
  /** Which leave days were paid — the earliest `paidLeaveQuota` of them, in date order. */
  paidLeaveDates: Set<string>;
  /** Holidays worked (W), Sundays included — one comp-off credit each. */
  holidayWork: number;
  holidayWorkDates: string[];
  /** Comp Off days (C) a credit covers — paid like a full day. */
  compOff: number;
  /** Comp Off days beyond the credits — unpaid. */
  compOffUnpaid: number;
  /** Credits not used yet in this period. */
  compOffLeft: number;
}

export function tallyAttendance(days: ResolvedDay[], config?: Partial<PayrollConfig>): AttendanceTally {
  const cfg: PayrollConfig = { ...DEFAULT_PAYROLL_CONFIG, ...config };

  // One status per date (the last one given wins). Holiday work is read off EVERY day first — it is
  // usually a Sunday — and then the weekly off is left out of the counting.
  const all = new Map<string, AttendanceStatus | null>();
  for (const d of days) all.set(d.date, d.status ?? null);
  const holidayWorkDates = [...all].filter(([, s]) => s === "holiday_work").map(([date]) => date).sort();
  const byDate = new Map<string, AttendanceStatus | null>();
  for (const [date, status] of all) {
    if (cfg.excludeSundays && isSundayDate(date)) continue;
    byDate.set(date, status);
  }

  /**
   * Leave is granted in date order: the first `paidLeaveQuota` leave days are paid, everything
   * after is leave without pay. Sorting matters — leave on the 3rd and the 25th must have the 3rd
   * paid, not whichever row happened to load first.
   */
  const leaveDates = [...byDate].filter(([, s]) => s === "leave").map(([date]) => date).sort();
  const paidLeaveDates = new Set(leaveDates.slice(0, Math.max(0, cfg.paidLeaveQuota)));

  // Comp-off days are covered by the period's credits in date order, like leave by its allowance.
  const compOffDates = [...byDate].filter(([, s]) => s === "comp_off").map(([date]) => date).sort();
  const coveredCompOff = new Set(compOffDates.slice(0, holidayWorkDates.length));

  const t: AttendanceTally = {
    full: 0, half: 0, absent: 0, leave: 0, paidLeave: 0, unpaidLeave: 0, holiday: 0, pending: 0,
    presentDays: 0, leavesLeft: 0, paidLeaveDates,
    holidayWork: holidayWorkDates.length, holidayWorkDates, compOff: 0, compOffUnpaid: 0, compOffLeft: 0,
  };
  for (const [date, status] of byDate) {
    switch (status) {
      case "full": t.full += 1; break;
      case "half": t.half += 1; break;
      case "absent": t.absent += 1; break;
      case "holiday": t.holiday += 1; break;
      // Worked on an announced weekday holiday: still that holiday for pay (the credit is counted above).
      case "holiday_work": t.holiday += 1; break;
      case "leave":
        t.leave += 1;
        if (paidLeaveDates.has(date)) t.paidLeave += 1; else t.unpaidLeave += 1;
        break;
      case "comp_off":
        if (coveredCompOff.has(date)) t.compOff += 1; else t.compOffUnpaid += 1;
        break;
      default: t.pending += 1;
    }
  }
  t.presentDays = t.full + t.half * cfg.halfDayFactor;
  t.leavesLeft = Math.max(0, cfg.paidLeaveQuota - t.paidLeave);
  t.compOffLeft = Math.max(0, t.holidayWork - t.compOff);
  return t;
}

/**
 * The absences a period's unused comp-off credits can turn into paid Comp Off days — the earliest
 * ones first, as many as there are credits. What Payroll's "Apply comp-off" writes (owner,
 * 2026-10-10: holiday work is settled against absences at pay time). Only Absent days: a leave the
 * person took stays a leave.
 */
export function compOffToApply(days: ResolvedDay[], config?: Partial<PayrollConfig>): string[] {
  const cfg: PayrollConfig = { ...DEFAULT_PAYROLL_CONFIG, ...config };
  const left = tallyAttendance(days, cfg).compOffLeft;
  if (left <= 0) return [];
  return days
    .filter(d => d.status === "absent" && !(cfg.excludeSundays && isSundayDate(d.date)))
    .map(d => d.date)
    .sort()
    .slice(0, left);
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

  // The period's days, each with its status (a day not given is pending), counted by the one tally
  // the attendance grid uses too — Sundays out, leave paid in date order.
  const tally = tallyAttendance(
    dates.map(date => ({ date, status: byDate.get(date) ?? null })),
    config,
  );
  const fullDays = tally.full, halfDays = tally.half;
  const paidLeaveDays = tally.paidLeave, unpaidLeaveDays = tally.unpaidLeave;
  const absentDays = tally.absent, holidayDays = tally.holiday, pendingDays = tally.pending;
  const compOffDays = tally.compOff, compOffUnpaidDays = tally.compOffUnpaid;
  const earnedDays = fullDays + halfDays * config.halfDayFactor + paidLeaveDays
    + (config.holidaysPaid ? holidayDays : 0) + compOffDays;

  // Working days that have happened, and of those the ones still unresolved (today before the
  // check-in) — the attendance % is measured over the resolved ones.
  let elapsedWorkingDays = 0;
  let unresolvedElapsed = 0;
  for (const date of dates) {
    // Sundays are not working days at all: they are already out of the denominator.
    if (config.excludeSundays && isSundayDate(date)) continue;
    if (date > todayStr) continue;
    elapsedWorkingDays += 1;
    if ((byDate.get(date) ?? null) === null) unresolvedElapsed += 1;
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
  const resolvedElapsed = elapsedWorkingDays - unresolvedElapsed;
  const attendancePercent = resolvedElapsed > 0
    ? round2((earnedDays / resolvedElapsed) * 100)
    : 0;

  const lines = buildLines(
    { fullDays, halfDays, paidLeaveDays, unpaidLeaveDays, absentDays, holidayDays, compOffDays, compOffUnpaidDays },
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
    holidayWorkDays: tally.holidayWork,
    holidayWorkDates: tally.holidayWorkDates,
    compOffDays,
    compOffUnpaidDays,
    compOffLeft: tally.compOffLeft,
    lines,
    adjustments,
  };
}

/** The human-readable breakdown: one row per bucket, plus a row per adjustment. */
function buildLines(
  counts: {
    fullDays: number; halfDays: number; paidLeaveDays: number;
    unpaidLeaveDays: number; absentDays: number; holidayDays: number;
    compOffDays: number; compOffUnpaidDays: number;
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
  if (counts.compOffDays) lines.push(line("comp_off", "Comp Off (holiday work)", counts.compOffDays, 1));
  if (counts.compOffUnpaidDays) lines.push(line("comp_off_unpaid", "Comp Off without credit", counts.compOffUnpaidDays, 0));

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
  key: "absent" | "half" | "unpaid_leave" | "unpaid_holiday" | "comp_off_unpaid";
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
    // A Comp Off day no holiday-work credit covers (absent on computations frozen before comp-off existed).
    { key: "comp_off_unpaid", label: "Comp off without credit", days: c.compOffUnpaidDays ?? 0, amount: (c.compOffUnpaidDays ?? 0) * rate },
  ];

  // Holidays only cost the employee when company policy says they're unpaid.
  if (c.lines.some(l => l.key === "holiday" && l.factor === 0)) {
    rows.push({ key: "unpaid_holiday", label: "Unpaid holidays", days: c.holidayDays, amount: c.holidayDays * rate });
  }

  const kept = rows.filter(r => r.days > 0);
  return { rows: kept, total: kept.reduce((sum, r) => sum + r.amount, 0) };
}

/**
 * The salary payable for a period: the monthly salary, less what attendance cost, plus any
 * adjustment — the one figure the Payroll table, the member's My Salary, the payslip and the
 * accounts receipt all show.
 *
 * Each of them used to subtract for itself, which is how two screens describing the same month
 * could drift by a rounding or by a rule one of them forgot.
 */
export function netPayable(c: SalaryComputation): number {
  return Math.max(0, c.monthlySalary - deductionsFor(c).total + (c.adjustmentTotal || 0));
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
