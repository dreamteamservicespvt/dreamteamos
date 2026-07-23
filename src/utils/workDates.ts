import { format } from "date-fns";
import type { WorkAssignment } from "@/types";

/**
 * Which day a piece of work counts on.
 *
 * Work assigned on 30 June and delivered on 2 July is July's output, not June's — the team did
 * it in July and expects to see it in July. Bucketing everything by `date` (the *assigned* day)
 * made a month whose work was all carried over from the previous month read as zero.
 *
 * So: finished work counts on the day it was finished, unfinished work on the day it was
 * assigned. Falls back through completedDate → completedAt → verifiedAt → assigned date, because
 * older records were written before completedDate existed.
 */
export function workCountsOn(a: WorkAssignment): string | undefined {
  const done = a.status === "verified" || a.status === "completed";
  if (!done) return a.date || undefined;

  if (a.completedDate) return a.completedDate;

  const seconds = (a.completedAt as { seconds?: number } | undefined)?.seconds
    ?? (a.verifiedAt as { seconds?: number } | undefined)?.seconds;
  if (seconds) return format(new Date(seconds * 1000), "yyyy-MM-dd");

  return a.date || undefined;
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
export function deliveredAtMs(a: WorkAssignment): number | null {
  const seconds = (a.completedAt as { seconds?: number } | undefined)?.seconds
    ?? (a.verifiedAt as { seconds?: number } | undefined)?.seconds;
  if (seconds) return seconds * 1000;

  const day = a.completedDate || a.date;
  const parsed = day ? Date.parse(`${day}T12:00:00`) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
