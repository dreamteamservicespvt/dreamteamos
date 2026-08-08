/**
 * Which hour a sale landed in, for reading the unassigned queue.
 *
 * The queue arrives as one undifferentiated column of cards, and the question the team actually
 * asks of it is "what came in while I was away?" — sales arrive in bursts, ten in one evening hour
 * and none for the rest of the day. Knowing an order is from *last night's six o'clock* rather
 * than from this morning is what decides who gets assigned it and what the client is told.
 *
 * These are labels only. Nothing here reorders anything: the caller walks the list in whatever
 * order it is already sorted and starts a new group when the key changes, so grouping never
 * fights first-come-first-served or the overdue sort.
 */
import { format, isSameDay, startOfHour } from "date-fns";

/** Firestore timestamp, Date, or epoch ms — the queue holds all three shapes over its history. */
function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === "number") return new Date(ts);
  const t = ts as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return new Date(t.toMillis());
  if (typeof t.seconds === "number") return new Date(t.seconds * 1000);
  return null;
}

/**
 * The bucket an order belongs to. Orders with no usable stamp share the `"unknown"` bucket rather
 * than each becoming a group of one — a heading per undated card would be noise, not clarity.
 */
export function hourBucketKey(ts: unknown): string {
  const d = toDate(ts);
  return d ? format(startOfHour(d), "yyyy-MM-dd-HH") : "unknown";
}

/** "6 – 7 PM". The span, not the instant: an order is *from* an hour, not *at* one. */
function hourSpan(d: Date): string {
  const next = new Date(d.getTime() + 60 * 60 * 1000);
  return `${format(d, "h a")} – ${format(next, "h a")}`;
}

/**
 * What the heading reads.
 *
 * Today and yesterday are named, because that is how anyone talks about the last two days and a
 * date there would have to be decoded. Anything older gets the full date, since "Tuesday" stops
 * being unambiguous the moment there are two of them.
 */
export function hourBucketLabel(ts: unknown, now: Date = new Date()): string {
  const d = toDate(ts);
  if (!d) return "No date recorded";

  const bucket = startOfHour(d);
  const yesterday = new Date(now.getTime() - 86400000);

  const day = isSameDay(bucket, now) ? "Today"
    : isSameDay(bucket, yesterday) ? "Yesterday"
    : format(bucket, "dd MMM yyyy");

  return `${day} (${hourSpan(bucket)})`;
}
