import { format, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CYCLE_START_DAY, cycleForDate } from "./performanceCycle";

/**
 * The one time filter used everywhere money is shown.
 *
 * Career / This Month / Day / Custom Range — the same vocabulary on the tech dashboard, My Team,
 * Work Reports and the profit page, so "this month" always means the same thing no matter which
 * screen you read it on.
 *
 * "This month" is not the same month everywhere, though. The tech team's performance month runs
 * 10th → 9th (see utils/performanceCycle) and their salary, output and reporting are all anchored
 * to it; the sales side runs on calendar months. That is what `monthBasis` selects. Everything
 * downstream — bounds, labels, stepping — follows from the filter itself, so a screen picks its
 * basis once and every total on it agrees.
 */

export type PeriodMode = "career" | "month" | "day" | "range";

/** How "This Month" is measured: the calendar, or the tech team's 10th → 9th cycle. */
export type MonthBasis = "calendar" | "cycle";

export interface PeriodFilter {
  mode: PeriodMode;
  /**
   * `yyyy-MM` when mode is "month". For a calendar basis that is the month itself; for a cycle
   * basis it is the month the cycle *starts* in (`2026-07` → 10 Jul 2026 → 09 Aug 2026).
   */
  month: string;
  /** `yyyy-MM-dd` when mode is "day". */
  day: string;
  /** Used when mode is "range". */
  range?: DateRange;
  /** Defaults to "calendar" when absent, so existing screens are untouched. */
  monthBasis?: MonthBasis;
}

export const currentMonth = (): string => format(new Date(), "yyyy-MM");
export const currentDay = (): string => format(new Date(), "yyyy-MM-dd");

/** The month the 10→9 cycle containing today starts in. */
export const currentCycleMonth = (): string => format(cycleForDate(new Date()).from, "yyyy-MM");

export const defaultPeriodFilter = (basis: MonthBasis = "calendar"): PeriodFilter => ({
  // Defaults to the current month, per the brief — career totals are opt-in.
  mode: "month",
  month: basis === "cycle" ? currentCycleMonth() : currentMonth(),
  day: currentDay(),
  monthBasis: basis,
});

/** The 10→9 cycle whose start month is `yyyy-MM`, as inclusive `yyyy-MM-dd` bounds. */
function cycleBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const { from, to } = cycleForDate(new Date(y, m - 1, CYCLE_START_DAY));
  return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
}

/**
 * Resolve a filter to inclusive `yyyy-MM-dd` bounds.
 * `null` means unbounded — the career view, where everything counts.
 */
export function periodBounds(filter: PeriodFilter): { from: string; to: string } | null {
  switch (filter.mode) {
    case "career":
      return null;
    case "day":
      return { from: filter.day, to: filter.day };
    case "range": {
      if (!filter.range?.from) return null;
      const from = format(startOfDay(filter.range.from), "yyyy-MM-dd");
      const to = format(startOfDay(filter.range.to ?? filter.range.from), "yyyy-MM-dd");
      return from <= to ? { from, to } : { from: to, to: from };
    }
    case "month":
    default: {
      if (filter.monthBasis === "cycle") return cycleBounds(filter.month);
      const [y, m] = filter.month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      return { from: `${filter.month}-01`, to: `${filter.month}-${String(lastDay).padStart(2, "0")}` };
    }
  }
}

/** Whether a `yyyy-MM-dd` date falls inside the filter. Career includes everything. */
export function withinPeriod(dateStr: string | undefined, filter: PeriodFilter): boolean {
  if (!dateStr) return false;
  const bounds = periodBounds(filter);
  if (!bounds) return true;
  return dateStr >= bounds.from && dateStr <= bounds.to;
}

/** Human label for the active filter, e.g. "July 2026" or "01 Jul – 15 Jul 2026". */
export function periodLabel(filter: PeriodFilter): string {
  const bounds = periodBounds(filter);
  if (!bounds) return "All time";

  switch (filter.mode) {
    case "day":
      return format(new Date(`${filter.day}T00:00:00`), "dd MMM yyyy");
    case "month":
      // A cycle is spelled out in full — calling 10 Jul → 09 Aug "July" is exactly the confusion
      // this filter exists to remove.
      if (filter.monthBasis === "cycle") {
        return `${format(new Date(`${bounds.from}T00:00:00`), "dd MMM")} – ${format(new Date(`${bounds.to}T00:00:00`), "dd MMM yyyy")}`;
      }
      return format(new Date(`${filter.month}-01T00:00:00`), "MMMM yyyy");
    default: {
      const from = new Date(`${bounds.from}T00:00:00`);
      const to = new Date(`${bounds.to}T00:00:00`);
      return bounds.from === bounds.to
        ? format(from, "dd MMM yyyy")
        : `${format(from, "dd MMM")} – ${format(to, "dd MMM yyyy")}`;
    }
  }
}

/** Shift the selected month by whole months, keeping the filter in month mode. */
export function shiftMonth(filter: PeriodFilter, delta: number): PeriodFilter {
  const [y, m] = filter.month.split("-").map(Number);
  const next = new Date(y, m - 1 + delta, 1);
  return { ...filter, mode: "month", month: format(next, "yyyy-MM") };
}
