/**
 * The bell — what a person's notification list shows, and what "Mark all read" and "Clear all" act on.
 *
 * ── Why the bell is cut off at a point in time, not emptied row by row ────────────────────────
 * "Mark all read" and "Clear all" did nothing anyone could see (owner, 2026-10-13). Three reasons:
 *   1. They acted on the 50 rows the bell had loaded. Nothing had ever deleted a notification, so a
 *      person had months of rows behind those 50 — Clear all deleted 50 and the next 50 slid in.
 *   2. The once-a-day reminders (birthdays, social-media posts due, renewals) re-sent themselves on
 *      every app open more than ten minutes apart, rewriting the row as unread — or, after a clear,
 *      writing it again from nothing, because the row was the only record that it had been sent.
 *   3. A failure only reached the console.
 * So Clear all now records ONE point — "everything up to the newest notification I was looking at"
 * (`notification_state/{uid}.clearedUpTo`) — and the bell hides every row at or before it: one
 * write instead of thousands of deletes, instant on every device, and undone by putting the point
 * back. The rows stay where they are, which is also what keeps a once-a-day reminder from coming
 * back (see `once` in services/notifications).
 *
 * ── One at a time (owner, 2026-10-13, later) ─────────────────────────────────────────────────
 * A single row is dismissed (its X, or a sideways swipe) and can be marked unread. Dismissing hides
 * the row the same way Clear all does — a field on the row, not a delete — for the same reason: the
 * kept row is what stops a `once` reminder coming back.
 *
 * Pure: no React, no Firestore. The writes are in services/notificationInbox; the 90-day clean-up
 * in services/notificationCleanup.
 */

/** How many rows the bell holds at first. The panel shows the newest `PANEL_ROWS` of them. */
export const INBOX_WINDOW = 50;

/** How many rows the open bell lists. */
export const PANEL_ROWS = 20;

/** The most rows the bell will load when dismissed rows fill its window — see `nextInboxWindow`. */
export const MAX_INBOX_WINDOW = 200;

/** Firestore writes per batch — the SDK refuses more than 500. */
export const WRITE_CHUNK = 400;

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: any;
  /**
   * The person dismissed this one row (2026-10-13): the bell no longer shows it, on any device. Set
   * with `read: true`, so the popups and "Mark all read" (both read unread rows) agree. Absent = shown.
   */
  dismissed?: boolean;
  dismissedAt?: any;
  /**
   * When the person marked this row unread themselves. UpdatePopup does not pop such a row again —
   * they have seen it, and asked only to be reminded in the bell. A re-sent keyed notification
   * replaces the whole row, so a real second occurrence pops as usual.
   */
  markedUnreadAt?: any;
}

/** A Firestore time to the nanosecond. Milliseconds are not enough: see `isClearedBy`. */
export interface InboxTime {
  seconds: number;
  nanoseconds: number;
}

/**
 * The time a row was written, or null while its server timestamp has not come back yet (a write
 * made from this browser, seconds old). Accepts a Firestore `Timestamp`, a plain `{seconds,
 * nanoseconds}` and anything with `toMillis()`.
 */
export function inboxTimeOf(value: unknown): InboxTime | null {
  const v = value as { seconds?: unknown; nanoseconds?: unknown; toMillis?: () => number } | null | undefined;
  if (!v || typeof v !== "object") return null;
  if (typeof v.seconds === "number") {
    return { seconds: v.seconds, nanoseconds: typeof v.nanoseconds === "number" ? v.nanoseconds : 0 };
  }
  if (typeof v.toMillis === "function") {
    const ms = v.toMillis();
    return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 };
  }
  return null;
}

export function compareInboxTimes(a: InboxTime, b: InboxTime): number {
  return a.seconds !== b.seconds ? a.seconds - b.seconds : a.nanoseconds - b.nanoseconds;
}

/** A stable key for a time — for effect dependencies and "has this row been re-sent?". */
export function inboxTimeKey(value: unknown): string {
  const t = inboxTimeOf(value);
  return t ? `${t.seconds}:${t.nanoseconds}` : "";
}

/**
 * Whether a row is behind the person's "cleared up to" point.
 *
 * At or before it — the newest row on screen when they pressed Clear all is itself cleared. Compared
 * to the nanosecond: rounded to milliseconds, the newest row would sit a fraction AFTER its own
 * rounded time and come straight back. A row whose time is not known yet was written moments ago,
 * after the point, and stays.
 */
export function isClearedBy(createdAt: unknown, clearedUpTo: unknown): boolean {
  const upTo = inboxTimeOf(clearedUpTo);
  if (!upTo) return false;
  const at = inboxTimeOf(createdAt);
  if (!at) return false;
  return compareInboxTimes(at, upTo) <= 0;
}

function newestFirst(a: AppNotification, b: AppNotification): number {
  const x = inboxTimeOf(a.createdAt);
  const y = inboxTimeOf(b.createdAt);
  // Not written yet = newest of all.
  if (!x && !y) return 0;
  if (!x) return -1;
  if (!y) return 1;
  return compareInboxTimes(y, x);
}

/** Whether the bell shows a row: not dismissed, and not behind the cleared point. */
export function isShownInBell(n: AppNotification, clearedUpTo: unknown): boolean {
  return !n.dismissed && !isClearedBy(n.createdAt, clearedUpTo);
}

/**
 * What the bell shows: the rows after the cleared point and not dismissed, newest first, at most
 * `window`, and how many of THOSE are unread — so the badge never counts a row the list cannot show
 * and "Mark all read" visibly empties it.
 */
export function inboxView(
  rows: AppNotification[],
  clearedUpTo: unknown,
  window = INBOX_WINDOW,
): { notifications: AppNotification[]; unreadCount: number } {
  const notifications = rows
    .filter((n) => isShownInBell(n, clearedUpTo))
    .sort(newestFirst)
    .slice(0, window);
  return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
}

/**
 * How many rows the bell should load, given what the last load gave.
 *
 * Dismissed rows still come back from the bell's query: Firestore cannot ask for "not dismissed"
 * when older rows have no such field at all. So a person who dismisses notifications one by one —
 * keeping the few still to be dealt with — fills the window with rows nobody shows, and the kept
 * ones fall out of the bell behind them. When the window came back full and the panel cannot fill
 * its `PANEL_ROWS`, the bell loads `INBOX_WINDOW` more, up to `MAX_INBOX_WINDOW`. It only grows, a
 * step at a time, so it cannot loop.
 */
export function nextInboxWindow(current: number, loaded: number, shown: number): number {
  if (loaded < current) return current; // the query returned everything there is
  if (shown >= PANEL_ROWS) return current;
  return Math.min(MAX_INBOX_WINDOW, current + INBOX_WINDOW);
}

/**
 * Whether a sideways drag of a row dismisses it: far enough (a third of the row, at most 96px), or a
 * quick flick that has clearly started. Anything less springs back.
 *
 * The flick speed is 300 px/s, not 500: framer-motion measures it per animation frame, and in the
 * browser run a firm ~48px flick in 65 ms (≈700 px/s) came back as 472–478 px/s in two of three tries
 * and sprang back. A drag only starts sideways (direction lock; vertical stays a scroll), so a
 * 24px+ sideways movement at that speed is always meant.
 */
export function isDismissSwipe(offsetX: number, velocityX: number, rowWidth: number): boolean {
  const distance = Math.abs(offsetX);
  const far = Math.min(96, Math.max(48, rowWidth / 3));
  if (distance >= far) return true;
  return distance >= 24 && Math.abs(velocityX) >= 300 && Math.sign(velocityX) === Math.sign(offsetX);
}

/**
 * The newest written time among these rows — the point "Clear all" and "Mark all read" act up to.
 * Returned as the row's own value, so the exact Firestore Timestamp is what gets stored. Rows that
 * arrive after it (while the request is on its way) are left alone: nobody has seen them yet.
 */
export function newestCreatedAt(rows: AppNotification[]): unknown | null {
  let best: unknown = null;
  let bestTime: InboxTime | null = null;
  for (const n of rows) {
    const t = inboxTimeOf(n.createdAt);
    if (t && (!bestTime || compareInboxTimes(t, bestTime) > 0)) {
      best = n.createdAt;
      bestTime = t;
    }
  }
  return best;
}

/**
 * Which rows just ARRIVED — the ones that may chime.
 *
 * A row is new when its id has not been seen this session AND it is newer than every row seen so far
 * (or so new its time is not back yet), or when it was seen with a written time and now has a later
 * one (a keyed notification re-sent: a real second occurrence). A row coming back by Undo, turning
 * read or unread, or an older row the bell only now loads (its window grew past dismissed rows, or
 * the server filled in what the cache lacked) is not an arrival — the old rule ("the unread count
 * went up") chimed for an Undo. Returns the updated record of what has been seen; the caller keeps it.
 */
export function freshArrivals(
  rows: AppNotification[],
  seen: ReadonlyMap<string, string>,
): { fresh: AppNotification[]; seen: Map<string, string> } {
  const next = new Map(seen);
  const fresh: AppNotification[] = [];
  let newestSeen: InboxTime | null = null;
  for (const key of seen.values()) {
    const [s, ns] = key.split(":").map(Number);
    if (key && (!newestSeen || compareInboxTimes({ seconds: s, nanoseconds: ns }, newestSeen) > 0)) {
      newestSeen = { seconds: s, nanoseconds: ns };
    }
  }
  for (const n of rows) {
    const key = inboxTimeKey(n.createdAt);
    const at = inboxTimeOf(n.createdAt);
    const before = seen.get(n.id);
    const isNew = before === undefined
      ? !at || !newestSeen || compareInboxTimes(at, newestSeen) > 0
      : before !== "" && key !== "" && key !== before;
    if (isNew && !n.read) fresh.push(n);
    // A row seen before its time came back keeps being "seen" once the time arrives.
    if (before === undefined || key !== "") next.set(n.id, key);
  }
  return { fresh, seen: next };
}

// ── The 90-day clean-up (owner, 2026-10-13: "clean up notifications older than about 90 days") ──

/** Notifications older than this many days are deleted, read or not, by services/notificationCleanup. */
export const NOTIFICATION_KEEP_DAYS = 90;

/**
 * The most rows one day's clean-up deletes. A first run may meet months of backlog; at most this many
 * reads and deletes a day keeps it far inside the free daily quota (50K reads, 20K deletes), and the
 * rest goes on the following days.
 */
export const CLEANUP_DAILY_MAX = 2000;

/** Rows written before this moment are old enough to delete. */
export function cleanupCutoff(now: Date, keepDays = NOTIFICATION_KEEP_DAYS): Date {
  return new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000);
}

/** `list` in pieces of at most `size`. */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
