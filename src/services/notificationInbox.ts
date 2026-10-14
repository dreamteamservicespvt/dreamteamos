/**
 * A person's own bell: listening to it, marking it read, clearing it, and undoing a clear.
 * (Sending a notification to somebody is services/notifications.)
 *
 * Every action works on ALL of the person's rows, not just the ones the bell has loaded, and acts
 * only up to the newest row they were looking at — a notification arriving while the request is on
 * its way stays new. Why the bell is cleared by a point in time rather than by deleting rows: see
 * utils/notificationInbox.
 *
 * Reads: the bell is one listener on the newest `INBOX_WINDOW` rows after the cleared point (more
 * only when dismissed rows fill it — utils `nextInboxWindow`), plus one on the person's
 * `notification_state` document. "Mark all read" reads only the unread rows
 * (`userId ==` and `read ==`, both equalities — Firestore merges the single-field indexes, the same
 * query UpdatePopup has always run), and writes only those.
 */
import {
  collection, deleteField, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import {
  INBOX_WINDOW, WRITE_CHUNK, chunk, isClearedBy, type AppNotification,
} from "@/utils/notificationInbox";

const ROWS = "notifications";
/** One document per person: `{ clearedUpTo, clearedAt }`. Absent = never cleared. */
const STATE = "notification_state";

const rowsOf = (snap: { docs: { id: string; data: () => unknown }[] }): AppNotification[] =>
  snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as AppNotification));

/** Where this person last cleared their bell to. Never fails the bell: an error reads as "never cleared". */
export function watchInboxState(uid: string, onState: (clearedUpTo: unknown | null) => void): () => void {
  return onSnapshot(
    doc(db, STATE, uid),
    (snap) => onState(snap.exists() ? (snap.data()?.clearedUpTo ?? null) : null),
    (err) => {
      console.warn("[notifications] could not read where the bell was cleared to:", err);
      onState(null);
    },
  );
}

/**
 * The bell's rows, newest first, after the cleared point.
 *
 * The ordered query needs the composite index (userId, createdAt desc) — kept in the repo since
 * 2026-10-13 (`firestore.indexes.json`). Where it fails, the person's
 * rows are read unordered and sorted in the browser (utils `inboxView`) — slower, never empty. The
 * fallback listener is torn down with the first: it used to be returned from the error callback,
 * where nothing ever called it, so it outlived the page and the sign-out.
 */
export function watchNotifications(
  uid: string,
  clearedUpTo: unknown | null,
  onRows: (rows: AppNotification[]) => void,
  windowSize = INBOX_WINDOW,
): () => void {
  let stopped = false;
  let stopFallback: (() => void) | null = null;
  const primary = query(
    collection(db, ROWS),
    where("userId", "==", uid),
    ...(clearedUpTo ? [where("createdAt", ">", clearedUpTo)] : []),
    orderBy("createdAt", "desc"),
    limit(windowSize),
  );
  const stopPrimary = onSnapshot(primary, (snap) => onRows(rowsOf(snap)), (err) => {
    console.warn("Notification query error, using fallback:", err);
    if (stopped || stopFallback) return;
    stopFallback = onSnapshot(
      query(collection(db, ROWS), where("userId", "==", uid)),
      (snap) => onRows(rowsOf(snap)),
      (fallbackErr) => console.error("[notifications] the bell could not be read:", fallbackErr),
    );
  });
  return () => {
    stopped = true;
    stopPrimary();
    stopFallback?.();
  };
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, ROWS, id), { read: true });
  } catch (err) {
    console.error("Failed to mark notification as read:", err);
  }
}

const isNotFound = (err: unknown) => (err as { code?: string } | null)?.code === "not-found";

/** Writes one patch to one row; a row deleted meanwhile (a deleted sale's bells) is already gone. */
async function patchRow(id: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await updateDoc(doc(db, ROWS, id), patch);
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

/**
 * Dismiss one notification (its X, or a swipe): gone from the bell on every device, not deleted —
 * the kept row is what stops a `once` reminder from being written again. Marked read too, so
 * UpdatePopup and "Mark all read" (both read unread rows) leave it alone. Throws when refused.
 */
export function dismissNotification(id: string): Promise<void> {
  return patchRow(id, { dismissed: true, dismissedAt: serverTimestamp(), read: true });
}

/** Undo a dismiss: the row is back, read or unread as it was. */
export function undoDismissNotification(id: string, wasRead: boolean): Promise<void> {
  return patchRow(id, { dismissed: deleteField(), dismissedAt: deleteField(), read: wasRead });
}

/**
 * "Mark as unread": the dot and the badge come back. `markedUnreadAt` tells UpdatePopup the person
 * has already seen it, so it reminds them in the bell without popping up in the middle of the screen
 * again. Throws when refused.
 */
export function markNotificationUnread(id: string): Promise<void> {
  return patchRow(id, { read: false, markedUnreadAt: serverTimestamp() });
}

/**
 * Writes one patch to many rows, in batches. Returns the ids written.
 *
 * A row deleted meanwhile (a deleted sale takes its "new order" bells with it) fails its whole
 * batch with not-found — so that batch is retried row by row and the missing row skipped. Any other
 * failure (offline for good, refused) is thrown: the person is told, nothing is half-claimed.
 */
async function patchRows(ids: string[], patch: Record<string, unknown>): Promise<string[]> {
  const written: string[] = [];
  for (const part of chunk(ids, WRITE_CHUNK)) {
    const batch = writeBatch(db);
    for (const id of part) batch.update(doc(db, ROWS, id), patch);
    try {
      await batch.commit();
      written.push(...part);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      for (const id of part) {
        try {
          await updateDoc(doc(db, ROWS, id), patch);
          written.push(id);
        } catch (one) {
          if (!isNotFound(one)) throw one;
        }
      }
    }
  }
  return written;
}

/**
 * Every unread row of this person written at or before `upTo` → read. Returns the ids changed.
 *
 * The rows already on screen go first, in one batch, from what the bell holds: Firestore shows a
 * write to its own listeners before the server answers, so the dots and the badge go at once. Then
 * the unread rows the bell is not holding — older than its window — so none of them turns up later
 * and UpdatePopup, which pops unread rows, agrees with the bell.
 */
async function markReadUpTo(uid: string, upTo: unknown, onScreenUnread: string[]): Promise<string[]> {
  const first = await patchRows(onScreenUnread, { read: true });
  const done = new Set(onScreenUnread);
  const rest = await getDocs(query(collection(db, ROWS), where("userId", "==", uid), where("read", "==", false)));
  const more = rest.docs
    .filter((d) => !done.has(d.id) && isClearedBy((d.data() as { createdAt?: unknown }).createdAt, upTo))
    .map((d) => d.id);
  const second = await patchRows(more, { read: true });
  return [...first, ...second];
}

/** "Mark all read": every unread notification up to the newest one on screen. Returns how many. */
export async function markAllNotificationsRead(uid: string, upTo: unknown, onScreenUnread: string[]): Promise<number> {
  if (!upTo) return 0;
  return (await markReadUpTo(uid, upTo, onScreenUnread)).length;
}

/** What a clear changed — everything Undo needs to put it back. */
export interface ClearReceipt {
  uid: string;
  /** The point before this clear (null = never cleared). */
  previous: unknown | null;
  /** The rows this clear turned from unread to read. */
  markedRead: string[];
}

/**
 * "Clear all": hides every notification up to the newest one on screen, on every device.
 *
 * One write moves the person's cleared point; their listeners see it at once. The rows it hides are
 * also marked read, so the popups (UpdatePopup reads unread rows) do not bring back what was just
 * cleared. Throws when the point could not be saved — the bell then shows the rows again by itself.
 */
export async function clearNotifications(
  uid: string,
  upTo: unknown,
  previous: unknown | null,
  onScreenUnread: string[],
): Promise<ClearReceipt | null> {
  if (!upTo) return null;
  await setDoc(doc(db, STATE, uid), { clearedUpTo: upTo, clearedAt: serverTimestamp() }, { merge: true });
  let markedRead: string[] = [];
  try {
    markedRead = await markReadUpTo(uid, upTo, onScreenUnread);
  } catch (err) {
    // The bell is cleared — that is what was asked. Rows left unread behind the point are hidden.
    console.error("[notifications] cleared, but some rows could not be marked read:", err);
  }
  return { uid, previous, markedRead };
}

/** Undo a clear: the rows it marked read are unread again, then the point goes back. */
export async function undoClearNotifications(receipt: ClearReceipt): Promise<void> {
  await patchRows(receipt.markedRead, { read: false });
  await setDoc(
    doc(db, STATE, receipt.uid),
    { clearedUpTo: receipt.previous ?? deleteField(), clearedAt: serverTimestamp() },
    { merge: true },
  );
}
