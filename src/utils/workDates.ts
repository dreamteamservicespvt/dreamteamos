import { format } from "date-fns";
import type { WorkAssignment } from "@/types";

/**
 * Which day a piece of work counts on: **the day it was assigned**.
 *
 * A tech member works that day's ads and only that day's, so a job belongs to the day it was
 * handed out — whatever status it later reaches. Completion and approval stamps are deliberately
 * ignored: tapping "complete" the next morning, or an admin approving days later, are clerical
 * moments that must not shift a job into another day's column.
 *
 * This is the same rule as `workDayOf` in utils/performanceCycle, so the dashboards, My Team and
 * Work Done & Reports all bucket a job on exactly the same day.
 */
export function workCountsOn(a: WorkAssignment): string | undefined {
  if (a.date) return a.date;
  const seconds = (a.assignedAt as { seconds?: number } | undefined)?.seconds;
  if (seconds) return format(new Date(seconds * 1000), "yyyy-MM-dd");
  return a.assignedAtIso ? a.assignedAtIso.slice(0, 10) : undefined;
}

/**
 * The date a *delivered* assignment counts on, or null when it isn't delivered yet.
 * Used by revenue and profit, which must never count work that hasn't shipped.
 */
export function deliveryDate(a: WorkAssignment): string | null {
  if (a.completedDate) return a.completedDate;
  const seconds = (a.completedAt as { seconds?: number } | undefined)?.seconds
    ?? (a.verifiedAt as { seconds?: number } | undefined)?.seconds;
  return seconds ? format(new Date(seconds * 1000), "yyyy-MM-dd") : null;
}

/**
 * When a delivered assignment was actually finished, in epoch ms.
 *
 * The precise stamps come first; a record that only carries `completedDate` is placed at midday
 * so rendering it in any nearby timezone still shows the day the work was done. Returns null
 * when the record says nothing about being finished — the caller must not invent a date, which
 * is exactly the bug that made every client's "last work" read as the day of the import.
 */
/**
 * When the work was handed out, to the minute.
 *
 * The same source of truth `workCountsOn` uses, kept precise instead of truncated to a day, so a
 * queue can show "2 days ago, 4:15 pm" — the difference between an order that arrived this morning
 * and one that has been sitting since Tuesday. Falls back to midday of the assigned day when only
 * a date is on record, so it still sorts sensibly against precise stamps.
 */
export function assignedAtMs(a: WorkAssignment): number | null {
  const seconds = (a.assignedAt as { seconds?: number } | undefined)?.seconds;
  if (seconds) return seconds * 1000;

  const iso = a.assignedAtIso ? Date.parse(a.assignedAtIso) : NaN;
  if (Number.isFinite(iso)) return iso;

  const parsed = a.date ? Date.parse(`${a.date}T12:00:00`) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function deliveredAtMs(a: WorkAssignment): number | null {
  const seconds = (a.completedAt as { seconds?: number } | undefined)?.seconds
    ?? (a.verifiedAt as { seconds?: number } | undefined)?.seconds;
  if (seconds) return seconds * 1000;

  const day = a.completedDate || a.date;
  const parsed = day ? Date.parse(`${day}T12:00:00`) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
