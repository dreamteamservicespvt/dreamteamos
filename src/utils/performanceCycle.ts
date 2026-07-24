import { addMonths, isValid, startOfDay } from 'date-fns';
import type { WorkAssignment } from '@/types';

/**
 * The tech team's performance month is a fixed 10th → 9th cycle (e.g. 10 Jul → 9 Aug), not a
 * calendar month. Work-done reporting is anchored to it.
 */

/** First day of the performance cycle — the 10th. */
export const CYCLE_START_DAY = 10;

/** The 10th → 9th cycle that contains `date`. */
export function cycleForDate(date: Date): { from: Date; to: Date } {
  const anchor = date.getDate() >= CYCLE_START_DAY
    ? new Date(date.getFullYear(), date.getMonth(), CYCLE_START_DAY)
    : new Date(date.getFullYear(), date.getMonth() - 1, CYCLE_START_DAY);
  const end = addMonths(anchor, 1);
  end.setDate(CYCLE_START_DAY - 1);
  return { from: startOfDay(anchor), to: startOfDay(end) };
}

/** An assignment counts as a delivered video once it reaches one of these states. */
export const DONE_STATUSES: ReadonlySet<WorkAssignment['status']> = new Set(['completed', 'verified']);

const dayToDate = (day?: string | null): Date | null => {
  if (!day) return null;
  const parsed = new Date(`${day}T00:00:00`);
  return isValid(parsed) ? parsed : null;
};

const stampToDate = (ts: any): Date | null => {
  const parsed: Date | null = ts?.toDate?.() ?? (typeof ts?.seconds === 'number' ? new Date(ts.seconds * 1000) : null);
  return parsed && isValid(parsed) ? parsed : null;
};

/**
 * The day a piece of work counts on: **the day it was assigned**.
 *
 * A tech member works that day's ads and only that day's — work handed out on the 15th is the
 * 15th's output, full stop. Completion and approval stamps are deliberately ignored: the member
 * may tap "complete" the next morning and an admin may approve days later, and neither of those
 * clerical moments should move a job into a different day's column. That drift is exactly what
 * made the daily figures disagree with what the team actually did.
 *
 * Falls back through `date` → `assignedAt` → `assignedAtIso`, since records were written by
 * different versions of the app; null only when the record carries no assignment date at all.
 */
export function workDayOf(a: WorkAssignment): Date | null {
  const assigned = dayToDate(a.date)
    ?? stampToDate(a.assignedAt)
    ?? (a.assignedAtIso ? dayToDate(a.assignedAtIso.slice(0, 10)) : null);
  return assigned ? startOfDay(assigned) : null;
}
