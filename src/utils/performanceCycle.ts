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

/**
 * The day an assignment counts on: when the member marked it complete, falling back to when it
 * was verified. Returns null when neither timestamp is usable, so it can't land in a bucket by
 * accident.
 */
export function completionDate(a: WorkAssignment): Date | null {
  if (a.completedDate) {
    const parsed = new Date(`${a.completedDate}T00:00:00`);
    if (isValid(parsed)) return startOfDay(parsed);
  }
  for (const ts of [a.completedAt, a.verifiedAt]) {
    const parsed: Date | null = ts?.toDate?.() ?? (typeof ts?.seconds === 'number' ? new Date(ts.seconds * 1000) : null);
    if (parsed && isValid(parsed)) return startOfDay(parsed);
  }
  return null;
}
