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
 * ── Half days (owner, 2026-10-12) ─────────────────────────────────────────────────────────────
 * A half-day request takes HALF a day of the allowance, so the allowance is settled in half-day units: each
 * requested date weighs 1 (full day) or ½ (half day), and leave already on record weighs 1 for Leave and ½ for
 * Half-day leave. Inside the allowance a half day is written `half_leave` (paid in full — the half worked plus the
 * half on leave); past it, `half` (paid as a half day). A full day that finds only half a day left is still written
 * `leave` and the salary pays it ½ — its verdict says half paid, half unpaid. Whole-day requests settle exactly as
 * they always did.
 *
 * Pure and Firestore-free, so the rule that decides whether somebody is paid can be tested without
 * standing up a database.
 */
import { DEFAULT_PAYROLL_CONFIG, type LeaveDuration } from "@/types/payroll";
import { formatDays, payPeriodForDate } from "@/utils/payrollEngine";

/** The attendance mark an approval writes on a day: full days `leave` / `absent`, half days `half_leave` / `half`. */
export type LeaveMark = "leave" | "absent" | "half_leave" | "half";

/** One day of a request, and what it turned out to cost. */
export interface LeaveDayVerdict {
  date: string;
  /**
   * `leave` when the allowance pays any of it (recorded as leave); `absent` when it pays none (recorded as an
   * absence — or, for a half day, as a half day).
   */
  kind: "leave" | "absent";
  /** The `yyyy-MM` pay period this day was settled against. */
  period: string;
  /** How much of the day was asked off: 1 (full day) or ½ (half day). */
  share: number;
  /** Of that, what the allowance pays: 1, ½ or 0. */
  paid: number;
  /** The rest — leave without pay: `share − paid`. */
  unpaid: number;
  /** The attendance mark the approval writes on this day. */
  mark: LeaveMark;
}

export interface LeaveSplit {
  days: LeaveDayVerdict[];
  /** Days the allowance pays any of — recorded as leave (`leave`, or `half_leave` for a half day). */
  leaveDates: string[];
  /** Days it pays none of — recorded as an absence (`absent`, or `half` for a half day). */
  absentDates: string[];
  /** Leave the allowance pays, in days — halves included (a half day inside it is ½). */
  paidDays: number;
  /** Leave past the allowance, in days — halves included. */
  unpaidDays: number;
  /** Per pay period, so the UI can explain *why* a day fell outside the allowance. */
  periods: {
    period: string;
    quota: number;
    /** Leave already used in this period before this request, in days (a half-day leave counts ½). */
    alreadyUsed: number;
    /** What this request takes from the allowance in this period, in days. */
    leaveDays: number;
    /** What it asks past the allowance in this period, in days. */
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
   * Full day (absent — every request before 2026-10-12) or half day. A half-day request is one date and takes half a
   * day of the allowance; `half_day` makes every requested date weigh ½.
   */
  duration?: LeaveDuration;
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
   * Days already held as HALF-day leave (`half_leave` marks, or approved half-day requests) — half a day of the
   * allowance each. A date in both lists is one day: the full-day entry counts it.
   */
  alreadyApprovedHalfLeaveDates?: string[];
  /**
   * Days already used, per `yyyy-MM` pay period, when the caller has a better count than the date
   * list can give — it overrides the dates for those periods. May end in a half (1.5).
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

/** What is left of an allowance, in whole half days — the unit leave is spent in. Never below nothing. */
const halfDaysLeft = (n: number): number => Math.max(0, Math.floor(n * 2 + 1e-9) / 2);

/**
 * Settle a request against the allowance.
 *
 * Days are taken in date order within each period, so the earliest days off are the paid ones —
 * which is both the intuitive reading and what the payroll engine does when it splits leave for a
 * period on its own. Each day takes what it weighs (1, or ½ for a half day) from what is left; a full
 * day that finds only half a day left is half paid.
 */
export function splitLeaveDays(input: SplitLeaveInput): LeaveSplit {
  const quota = input.quota ?? DEFAULT_PAYROLL_CONFIG.paidLeaveQuota;
  const cycleStartDay = input.cycleStartDay ?? DEFAULT_PAYROLL_CONFIG.payDayOfMonth;
  const requested = [...new Set(input.requestedDates)].sort();
  const share = input.duration === "half_day" ? 0.5 : 1;

  // What is already spent, per period. A date requested twice is still one day off.
  const alreadyUsed = new Map<string, number>();
  const fullDates = new Set(input.alreadyApprovedLeaveDates || []);
  for (const date of fullDates) {
    const period = periodOf(date, cycleStartDay);
    alreadyUsed.set(period, (alreadyUsed.get(period) ?? 0) + 1);
  }
  for (const date of new Set(input.alreadyApprovedHalfLeaveDates || [])) {
    if (fullDates.has(date)) continue; // one day, one mark — the full day already counted it
    const period = periodOf(date, cycleStartDay);
    alreadyUsed.set(period, (alreadyUsed.get(period) ?? 0) + 0.5);
  }
  // An explicit count wins for the periods it names — see `alreadyUsedByPeriod`.
  for (const [period, used] of Object.entries(input.alreadyUsedByPeriod || {})) {
    alreadyUsed.set(period, used);
  }

  const spent = new Map<string, number>();
  const days: LeaveDayVerdict[] = requested.map((date) => {
    const period = periodOf(date, cycleStartDay);
    const used = (alreadyUsed.get(period) ?? 0) + (spent.get(period) ?? 0);
    const paid = Math.min(share, halfDaysLeft(quota - used));
    if (paid > 0) spent.set(period, (spent.get(period) ?? 0) + paid);
    const kind = paid > 0 ? "leave" : "absent";
    const mark: LeaveMark = share < 1 ? (paid > 0 ? "half_leave" : "half") : kind;
    return { date, kind, period, share, paid, unpaid: share - paid, mark };
  });

  const sum = (list: LeaveDayVerdict[], pick: (d: LeaveDayVerdict) => number) => list.reduce((n, d) => n + pick(d), 0);
  const periods = [...new Set(days.map((d) => d.period))].sort().map((period) => {
    const inPeriod = days.filter((d) => d.period === period);
    return {
      period,
      quota,
      alreadyUsed: alreadyUsed.get(period) ?? 0,
      leaveDays: sum(inPeriod, (d) => d.paid),
      absentDays: sum(inPeriod, (d) => d.unpaid),
    };
  });

  return {
    days,
    leaveDates: days.filter((d) => d.kind === "leave").map((d) => d.date),
    absentDates: days.filter((d) => d.kind === "absent").map((d) => d.date),
    paidDays: sum(days, (d) => d.paid),
    unpaidDays: sum(days, (d) => d.unpaid),
    periods,
  };
}

/** True when every day of the split is a whole day, wholly paid or wholly not — the only kind before half days. */
export function isWholeDaySplit(split: Pick<LeaveSplit, "days">): boolean {
  return split.days.every((d) => d.share === 1 && (d.paid === 0 || d.paid === 1));
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One line of plain English for the person about to lose a day's pay. */
export function describeLeaveSplit(split: LeaveSplit): string {
  const leave = split.leaveDates.length;
  const absent = split.absentDates.length;

  // Whole days — worded exactly as before half-day leave existed.
  if (isWholeDaySplit(split)) {
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

  // A half-day request: one date, from the allowance or not. Paid in full inside it; past it, a half day's pay
  // (the half-day factor) — worded so it is true whatever the policy's factor is.
  if (split.days.length === 1 && split.days[0].share < 1) {
    return split.days[0].paid > 0
      ? "Half a day, within your paid leave allowance — the day is paid in full."
      : "Half a day — your paid leave for this pay period is already used, so it is unpaid: the day is recorded and paid as a half day.";
  }

  // Full days where the allowance ran out halfway through one of them.
  const paid = formatDays(split.paidDays);
  const unpaid = formatDays(split.unpaidDays);
  if (split.unpaidDays === 0) return `${capitalise(paid)}, all within your paid leave allowance.`;
  if (split.paidDays === 0) return `${capitalise(unpaid)} — your paid leave for this pay period is already used, so it is unpaid.`;
  return `${capitalise(paid)} of paid leave, then ${unpaid} unpaid.`;
}
