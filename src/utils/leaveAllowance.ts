/**
 * How a leave request splits into leave and absence.
 *
 * The rule: **two paid leave days per pay period, and the period is the 10th → 9th pay cycle, not
 * the calendar month.** Everything past the two is an absence — not "unpaid leave", an absence, on
 * the payslip and on the attendance record both.
 *
 * ── Why the allowance is spent across the whole period, not per request ───────────────────────
 * Because otherwise it is not an allowance. Somebody taking two days a week, one request at a
 * time, would never exceed "2 per request" and would never be marked absent. So a new request is
 * measured against what the person has ALREADY had approved inside the same period, which is what
 * makes the third day of the month cost them whether it arrives on its own or in a batch.
 *
 * ── Why the split is per pay period ──────────────────────────────────────────────────────────
 * A request from the 8th to the 12th straddles two pay cycles, and each cycle carries its own two
 * days. Splitting the request as one lump against one period would either give away four paid days
 * or charge two absences that the second period has plenty of room for. Days are therefore grouped
 * by the period they fall in and each group is settled against that period's own remaining
 * allowance.
 *
 * Pure and Firestore-free, so the rule that decides whether somebody is paid can be tested without
 * standing up a database.
 */
import { DEFAULT_PAYROLL_CONFIG } from "@/types/payroll";
import { payPeriodForDate } from "@/utils/payrollEngine";

/** One day of a request, and what it turned out to cost. */
export interface LeaveDayVerdict {
  date: string;
  /** `leave` is within the allowance and paid; `absent` is beyond it and is not. */
  kind: "leave" | "absent";
  /** The `yyyy-MM` pay period this day was settled against. */
  period: string;
}

export interface LeaveSplit {
  days: LeaveDayVerdict[];
  /** Days that stay within the allowance — paid, and recorded as leave. */
  leaveDates: string[];
  /** Days beyond it — unpaid, and recorded as an absence. */
  absentDates: string[];
  /** Per pay period, so the UI can explain *why* a day fell outside the allowance. */
  periods: {
    period: string;
    quota: number;
    /** Days already approved as leave in this period before this request. */
    alreadyUsed: number;
    leaveDays: number;
    absentDays: number;
  }[];
}

/** The pay period a `yyyy-MM-dd` belongs to, as a `yyyy-MM` label. */
function periodOf(date: string, cycleStartDay: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return payPeriodForDate(new Date(y, m - 1, d), cycleStartDay).month;
}

export interface SplitLeaveInput {
  /** The working days being requested — Sundays already removed. */
  requestedDates: string[];
  /**
   * Working days already approved as leave for this person, any period. Only those landing in the
   * same period as a requested day matter, and this filters them itself so callers can pass the
   * member's whole history without slicing it first.
   *
   * Days ALREADY recorded as an absence must not appear here: they have been paid for once
   * already, and counting them again would charge the allowance twice for one day off.
   */
  alreadyApprovedLeaveDates?: string[];
  /**
   * Days already used, per `yyyy-MM` pay period, when the caller has a better count than the date
   * list can give — it overrides the dates for those periods.
   *
   * The employee's own panel uses it: leave marked straight onto the attendance grid by an admin
   * belongs to no request at all, so counting requests would under-report what they have spent and
   * promise them a paid day they no longer have. The salary engine reads attendance, so its count
   * is the true one for the period being viewed.
   */
  alreadyUsedByPeriod?: Record<string, number>;
  quota?: number;
  cycleStartDay?: number;
}

/**
 * Settle a request against the allowance.
 *
 * Days are taken in date order within each period, so the earliest days off are the paid ones —
 * which is both the intuitive reading and what the payroll engine does when it splits leave for a
 * period on its own.
 */
export function splitLeaveDays(input: SplitLeaveInput): LeaveSplit {
  const quota = input.quota ?? DEFAULT_PAYROLL_CONFIG.paidLeaveQuota;
  const cycleStartDay = input.cycleStartDay ?? DEFAULT_PAYROLL_CONFIG.payDayOfMonth;
  const requested = [...new Set(input.requestedDates)].sort();

  // What is already spent, per period. A date requested twice is still one day off.
  const alreadyUsed = new Map<string, number>();
  for (const date of new Set(input.alreadyApprovedLeaveDates || [])) {
    const period = periodOf(date, cycleStartDay);
    alreadyUsed.set(period, (alreadyUsed.get(period) ?? 0) + 1);
  }
  // An explicit count wins for the periods it names — see `alreadyUsedByPeriod`.
  for (const [period, used] of Object.entries(input.alreadyUsedByPeriod || {})) {
    alreadyUsed.set(period, used);
  }

  const spent = new Map<string, number>();
  const days: LeaveDayVerdict[] = requested.map((date) => {
    const period = periodOf(date, cycleStartDay);
    const used = (alreadyUsed.get(period) ?? 0) + (spent.get(period) ?? 0);
    const kind = used < quota ? "leave" : "absent";
    if (kind === "leave") spent.set(period, (spent.get(period) ?? 0) + 1);
    return { date, kind, period };
  });

  const periods = [...new Set(days.map((d) => d.period))].sort().map((period) => ({
    period,
    quota,
    alreadyUsed: alreadyUsed.get(period) ?? 0,
    leaveDays: days.filter((d) => d.period === period && d.kind === "leave").length,
    absentDays: days.filter((d) => d.period === period && d.kind === "absent").length,
  }));

  return {
    days,
    leaveDates: days.filter((d) => d.kind === "leave").map((d) => d.date),
    absentDates: days.filter((d) => d.kind === "absent").map((d) => d.date),
    periods,
  };
}

/** One line of plain English for the person about to lose a day's pay. */
export function describeLeaveSplit(split: LeaveSplit): string {
  const leave = split.leaveDates.length;
  const absent = split.absentDates.length;

  if (absent === 0) {
    return leave === 1
      ? "1 day, within your paid leave allowance."
      : `${leave} days, all within your paid leave allowance.`;
  }
  if (leave === 0) {
    return `${absent} day${absent === 1 ? "" : "s"} — your paid leave for this pay period is already used, so ${absent === 1 ? "it counts" : "these count"} as absence and ${absent === 1 ? "is" : "are"} unpaid.`;
  }
  return `${leave} paid leave day${leave === 1 ? "" : "s"}, then ${absent} day${absent === 1 ? "" : "s"} counted as absence and unpaid.`;
}
