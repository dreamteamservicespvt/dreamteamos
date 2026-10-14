import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAuthStore } from "@/store/authStore";
import { playNotificationSound } from "@/utils/audio";
import {
  clearNotifications, dismissNotification, markAllNotificationsRead, markNotificationRead, markNotificationUnread,
  undoClearNotifications, undoDismissNotification, watchInboxState, watchNotifications, type ClearReceipt,
} from "@/services/notificationInbox";
import { CLEANUP_DELAY_MS, cleanUpOldNotificationsOnOpen } from "@/services/notificationCleanup";
import {
  INBOX_WINDOW, freshArrivals, inboxTimeKey, inboxView, newestCreatedAt, nextInboxWindow, type AppNotification,
} from "@/utils/notificationInbox";

export type { AppNotification } from "@/utils/notificationInbox";
export type { ClearReceipt } from "@/services/notificationInbox";

/**
 * Rows that must not make a sound here.
 *
 * A call already has a ringtone, playing over the incoming-call popup. The bell chiming underneath
 * it was the third of three alerts for one event — notification, popup, chime — and the one that
 * made the other two feel like a bug. The row is still written and still readable in the bell; it
 * just does not announce itself twice.
 */
const SILENT_NOTIFICATION_TYPES = new Set(["voice_call", "video_call", "order_chat_call"]);

/** Which bulk action is running, so its button can say so and cannot be pressed twice. */
export type InboxBusy = "read" | "clear" | null;

/**
 * The signed-in person's bell. "Mark all read" and "Clear all" act on every notification they have
 * (not only the rows loaded here) up to the newest one on screen; both change the list at once and
 * throw when they could not be saved, for the caller to say so. One row can be dismissed or marked
 * unread (2026-10-13). Rules: utils/notificationInbox.
 */
export function useNotifications() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  /** `loaded` = the first answer of the rows listener has arrived (until then nothing may chime). */
  const [feed, setFeed] = useState<{ loaded: boolean; rows: AppNotification[] }>({ loaded: false, rows: [] });
  const [inbox, setInbox] = useState<{ loaded: boolean; clearedUpTo: unknown | null }>({ loaded: false, clearedUpTo: null });
  /** How many rows the listener asks for — grows only past dismissed rows (utils `nextInboxWindow`). */
  const [windowSize, setWindowSize] = useState(INBOX_WINDOW);
  const [busy, setBusy] = useState<InboxBusy>(null);
  const busyRef = useRef<InboxBusy>(null);
  /** Rows seen this session (id → written time), so only a real arrival chimes. */
  const seenRef = useRef<{ primed: boolean; seen: Map<string, string> }>({ primed: false, seen: new Map() });

  // Where this person last cleared to — read first, so the rows query can start after it.
  useEffect(() => {
    setFeed({ loaded: false, rows: [] });
    setInbox({ loaded: false, clearedUpTo: null });
    setWindowSize(INBOX_WINDOW);
    seenRef.current = { primed: false, seen: new Map() };
    if (!uid) return;
    return watchInboxState(uid, (clearedUpTo) => setInbox({ loaded: true, clearedUpTo }));
  }, [uid]);

  // Now and then: notifications older than 90 days, company-wide, once a day (services/notificationCleanup).
  useEffect(() => {
    if (!uid) return;
    const timer = setTimeout(() => { void cleanUpOldNotificationsOnOpen(uid); }, CLEANUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [uid]);

  const clearedKey = inboxTimeKey(inbox.clearedUpTo);
  useEffect(() => {
    if (!uid || !inbox.loaded) return;
    return watchNotifications(uid, inbox.clearedUpTo, (rows) => setFeed({ loaded: true, rows }), windowSize);
    // Keyed on the cleared point's value: a new state object with the same point must not re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, inbox.loaded, clearedKey, windowSize]);

  // The cleared point is applied here as well as in the query, so a clear hides its rows the moment
  // it is written (before the listener is re-made) and the fallback query is filtered too.
  const { notifications, unreadCount } = useMemo(
    () => inboxView(feed.rows, inbox.clearedUpTo, windowSize),
    [feed.rows, inbox.clearedUpTo, windowSize],
  );

  // Dismissed rows filling the window: ask for more, so the panel stays full.
  useEffect(() => {
    if (!feed.loaded) return;
    const next = nextInboxWindow(windowSize, feed.rows.length, notifications.length);
    if (next !== windowSize) setWindowSize(next);
  }, [feed.loaded, feed.rows.length, notifications.length, windowSize]);

  // The first answer only records what is there; after that, a real arrival chimes.
  useEffect(() => {
    if (!feed.loaded) return;
    const { fresh, seen } = freshArrivals(notifications, seenRef.current.seen);
    const wasPrimed = seenRef.current.primed;
    seenRef.current = { primed: true, seen };
    if (wasPrimed && fresh.some((n) => !SILENT_NOTIFICATION_TYPES.has(n.type))) playNotificationSound();
  }, [notifications, feed.loaded]);

  const markAsRead = useCallback((notifId: string) => markNotificationRead(notifId), []);
  /** The row's dot and the badge come back; throws when it could not be saved. */
  const markAsUnread = useCallback((notifId: string) => markNotificationUnread(notifId), []);
  /** One row out of the bell, on every device; throws when it could not be saved. */
  const dismiss = useCallback((n: AppNotification) => dismissNotification(n.id), []);
  const undoDismiss = useCallback((n: AppNotification) => undoDismissNotification(n.id, n.read), []);

  /** Runs one bulk action at a time; a second press while one runs is ignored. */
  const runBusy = useCallback(async <T,>(kind: Exclude<InboxBusy, null>, fn: () => Promise<T>): Promise<T | null> => {
    if (busyRef.current) return null;
    busyRef.current = kind;
    setBusy(kind);
    try {
      return await fn();
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, []);

  /** Every unread notification up to the newest on screen → read. Resolves to how many; throws on failure. */
  const markAllAsRead = useCallback(async (): Promise<number> => {
    if (!uid || unreadCount === 0) return 0;
    const upTo = newestCreatedAt(notifications);
    const onScreen = notifications.filter((n) => !n.read).map((n) => n.id);
    return (await runBusy("read", () => markAllNotificationsRead(uid, upTo, onScreen))) ?? 0;
  }, [uid, unreadCount, notifications, runBusy]);

  /** Hides every notification up to the newest on screen. Resolves to what Undo needs; throws on failure. */
  const clearAll = useCallback(async (): Promise<ClearReceipt | null> => {
    if (!uid || notifications.length === 0) return null;
    const upTo = newestCreatedAt(notifications);
    const onScreen = notifications.filter((n) => !n.read).map((n) => n.id);
    return runBusy("clear", () => clearNotifications(uid, upTo, inbox.clearedUpTo, onScreen));
  }, [uid, notifications, inbox.clearedUpTo, runBusy]);

  const undoClear = useCallback((receipt: ClearReceipt) => undoClearNotifications(receipt), []);

  return {
    notifications, unreadCount, busy, markAsRead, markAsUnread, dismiss, undoDismiss, markAllAsRead, clearAll, undoClear,
  };
}
