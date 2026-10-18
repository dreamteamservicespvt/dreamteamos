import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * "In the notification tab, Mark all read and Clear all are not working — they are not clearing or
 * deleting" (owner, 2026-10-13). Three causes, each pinned here:
 *   1. Both acted on the 50 rows the bell had loaded; months of rows sat behind them, so Clear all
 *      deleted 50 and the next 50 slid straight in.
 *   2. The once-a-day reminders re-sent themselves on every app open more than ten minutes apart —
 *      back as unread after Mark all read, written again from nothing after Clear all.
 *   3. A failure reached only the console.
 * Plus the fallback listener (no composite index) that nothing ever stopped.
 *
 * Checked on the pure rules, on the service against the in-memory Firestore, on the real
 * `sendNotification`, and on the real Topbar.
 */

const flags = vi.hoisted(() => ({ failOrdered: false, refuseStateWrites: false }));
vi.mock("firebase/firestore", async () => {
  const m = await import("./memoryFirestore");
  return {
    ...m,
    // A refused write of the cleared point, as Firestore reports one.
    setDoc: (ref: { path: string }, ...rest: unknown[]) => (flags.refuseStateWrites && ref.path.startsWith("notification_state/")
      ? Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }))
      : (m.setDoc as (...a: unknown[]) => Promise<void>)(ref, ...rest)),
    // A project without the composite index: every ordered notifications query fails, as in Firestore.
    onSnapshot: (target: { type?: string; constraints?: { kind: string }[] }, next: never, error?: (e: Error) => void) => {
      if (flags.failOrdered && target?.type === "query" && target.constraints?.some((c) => c.kind === "orderBy")) {
        queueMicrotask(() => error?.(new Error("The query requires an index")));
        return () => undefined;
      }
      return m.onSnapshot(target as never, next, error);
    },
  };
});
// A signed-in staff member: since 2026-10-18 the push goes only with their ID token.
vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: { getIdToken: async () => "test-id-token" } } }));
vi.mock("@/utils/platform", () => ({ isNative: () => false }));
const sound = vi.hoisted(() => ({ chimes: 0 }));
vi.mock("@/utils/audio", () => ({
  playNotificationSound: () => { sound.chimes += 1; },
  playClickSound: () => undefined,
}));

const mem = await import("./memoryFirestore");
const inbox = await import("@/services/notificationInbox");
const rules = await import("@/utils/notificationInbox");
const { sendNotification } = await import("@/services/notifications");
const { useAuthStore } = await import("@/store/authStore");
const Topbar = (await import("@/components/layout/Topbar")).default;
const { Toaster } = await import("@/components/ui/toaster");
import type { AppUser } from "@/types";
import type { AppNotification } from "@/utils/notificationInbox";

configure({ testIdAttribute: "data-test" });

const ME = { uid: "kiran", name: "Kiran", role: "tech_admin", isActive: true, designation: "CTO" } as AppUser;
const BASE = 1_790_000_000; // seconds; row i is written at BASE + i

function seedRows(count: number, opts: { unreadFrom?: number; userId?: string; prefix?: string } = {}) {
  const { unreadFrom = 0, userId = ME.uid, prefix = "n" } = opts;
  for (let i = 0; i < count; i++) {
    mem.__seed(`notifications/${prefix}${i}`, {
      userId, type: "work_assigned", title: `Job ${i}`, message: `Message ${i}`,
      read: i < unreadFrom, createdAt: new mem.Timestamp(BASE + i, 0),
    });
  }
}
const all = () => mem.__all("notifications") as unknown as (AppNotification & { id: string })[];
const mine = () => all().filter((n) => n.userId === ME.uid);
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

/** What the person's bell holds right now, read through the same listener + rules the hook uses. */
async function bellNow(uid = ME.uid) {
  let clearedUpTo: unknown = null;
  const stopState = inbox.watchInboxState(uid, (c) => { clearedUpTo = c; });
  await flush();
  let rows: AppNotification[] = [];
  const stopRows = inbox.watchNotifications(uid, clearedUpTo, (r) => { rows = r; });
  await flush();
  stopState();
  stopRows();
  return { ...rules.inboxView(rows, clearedUpTo), clearedUpTo };
}

beforeEach(() => {
  mem.__reset();
  flags.failOrdered = false;
  flags.refuseStateWrites = false;
  sound.chimes = 0;
  useAuthStore.setState({ user: null, loading: false });
  global.fetch = vi.fn(() => Promise.resolve({ ok: true } as Response));
});
afterEach(() => cleanup());

describe("the bell's rules (utils/notificationInbox)", () => {
  const row = (id: string, seconds: number | null, read = false, nanoseconds = 0): AppNotification => ({
    id, userId: "u", type: "t", title: id, message: "", read,
    createdAt: seconds === null ? null : { seconds, nanoseconds },
  });

  it("hides every row at or before the cleared point, to the nanosecond", () => {
    const upTo = { seconds: 100, nanoseconds: 123_456_000 };
    expect(rules.isClearedBy({ seconds: 100, nanoseconds: 123_456_000 }, upTo)).toBe(true);
    expect(rules.isClearedBy({ seconds: 99, nanoseconds: 0 }, upTo)).toBe(true);
    // Rounded to milliseconds this one would equal the point; it was written after it and must stay.
    expect(rules.isClearedBy({ seconds: 100, nanoseconds: 123_456_001 }, upTo)).toBe(false);
    expect(rules.isClearedBy(null, upTo)).toBe(false); // written moments ago, time not back yet
    expect(rules.isClearedBy({ seconds: 1, nanoseconds: 0 }, null)).toBe(false); // never cleared
  });

  it("shows newest first, at most the window, and counts unread only among what it shows", () => {
    const rows = [row("old", 1, false), row("pending", null), ...Array.from({ length: 60 }, (_, i) => row(`r${i}`, 10 + i, i % 2 === 0))];
    const view = rules.inboxView(rows, null);
    expect(view.notifications).toHaveLength(rules.INBOX_WINDOW);
    expect(view.notifications[0].id).toBe("pending");
    expect(view.notifications[1].id).toBe("r59");
    expect(view.notifications.some((n) => n.id === "old")).toBe(false);
    expect(view.unreadCount).toBe(view.notifications.filter((n) => !n.read).length);
  });

  it("acts up to the newest written row it can see — not one that has not been written yet", () => {
    const rows = [row("a", 5), row("b", 9, true), row("c", null)];
    expect(rules.newestCreatedAt(rows)).toEqual({ seconds: 9, nanoseconds: 0 });
    expect(rules.newestCreatedAt([row("c", null)])).toBeNull();
  });

  it("chimes for an arrival or a re-sent row — never for a row coming back by Undo or turning read", () => {
    const first = rules.freshArrivals([row("a", 1), row("b", 2)], new Map());
    let seen = first.seen;
    // Undo brings `a` back unchanged; `b` is marked read; neither is news.
    let next = rules.freshArrivals([row("a", 1), row("b", 2, true)], seen);
    expect(next.fresh).toEqual([]);
    seen = next.seen;
    next = rules.freshArrivals([row("c", 3), row("a", 7)], seen); // a new row, and `a` re-sent later
    expect(next.fresh.map((n) => n.id).sort()).toEqual(["a", "c"]);
    // A row seen before its server time came back is not news when the time arrives.
    const pending = rules.freshArrivals([row("p", null)], new Map());
    expect(rules.freshArrivals([row("p", 4)], pending.seen).fresh).toEqual([]);
  });

  it("splits writes under Firestore's 500-per-batch limit", () => {
    expect(rules.chunk(Array.from({ length: 1001 }, (_, i) => i), rules.WRITE_CHUNK).map((c) => c.length)).toEqual([400, 400, 201]);
  });
});

describe("Mark all read (services/notificationInbox)", () => {
  it("marks EVERY unread row, including the ones behind the bell's 50 — the badge cannot come back", async () => {
    seedRows(120); // all unread
    seedRows(3, { userId: "someone_else", prefix: "x" });
    const before = await bellNow();
    const upTo = rules.newestCreatedAt(before.notifications);
    const onScreen = before.notifications.filter((n) => !n.read).map((n) => n.id);
    expect(onScreen).toHaveLength(50);

    const changed = await inbox.markAllNotificationsRead(ME.uid, upTo, onScreen);
    expect(changed).toBe(120);
    expect(mine().every((n) => n.read)).toBe(true);
    expect(all().filter((n) => n.userId === "someone_else").every((n) => !n.read)).toBe(true);
    expect((await bellNow()).unreadCount).toBe(0);
  });

  it("leaves a notification that arrived after the newest one on screen unread — nobody has seen it", async () => {
    seedRows(5);
    const upTo = new mem.Timestamp(BASE + 4, 0);
    mem.__seed("notifications/late", { userId: ME.uid, type: "t", title: "Late", message: "", read: false, createdAt: new mem.Timestamp(BASE + 99, 0) });
    await inbox.markAllNotificationsRead(ME.uid, upTo, ["n4"]);
    expect(mem.__read("notifications/late")?.read).toBe(false);
    expect(mine().filter((n) => n.id !== "late").every((n) => n.read)).toBe(true);
  });

  it("still finishes when a row was deleted meanwhile (a deleted sale takes its bells with it)", async () => {
    seedRows(4);
    await inbox.markAllNotificationsRead(ME.uid, new mem.Timestamp(BASE + 3, 0), ["n0", "gone", "n3"]);
    expect(mine().every((n) => n.read)).toBe(true);
  });
});

describe("Clear all (services/notificationInbox)", () => {
  it("empties the bell for good — the 50 behind do not slide in — and Undo puts it back exactly", async () => {
    seedRows(120, { unreadFrom: 100 }); // rows 0–99 read, 100–119 unread
    const before = await bellNow();
    expect(before.notifications).toHaveLength(50);

    const upTo = rules.newestCreatedAt(before.notifications);
    const receipt = await inbox.clearNotifications(ME.uid, upTo, null, before.notifications.filter((n) => !n.read).map((n) => n.id));
    const after = await bellNow();
    expect(after.notifications).toEqual([]);
    expect(after.unreadCount).toBe(0);
    // Hidden, not deleted, and marked read so the popups (UpdatePopup reads unread rows) agree.
    expect(mine()).toHaveLength(120);
    expect(mine().every((n) => n.read)).toBe(true);
    expect(receipt?.markedRead).toHaveLength(20);

    await inbox.undoClearNotifications(receipt!);
    const undone = await bellNow();
    expect(undone.notifications).toHaveLength(50);
    expect(undone.unreadCount).toBe(20);
    expect(mem.__read(`notification_state/${ME.uid}`)?.clearedUpTo).toBeUndefined();
  });

  it("shows what arrives after the clear", async () => {
    seedRows(10);
    const before = await bellNow();
    await inbox.clearNotifications(ME.uid, rules.newestCreatedAt(before.notifications), null, []);
    mem.__seed("notifications/new1", { userId: ME.uid, type: "work_assigned", title: "New job", message: "", read: false, createdAt: new mem.Timestamp(BASE + 500, 0) });
    const after = await bellNow();
    expect(after.notifications.map((n) => n.id)).toEqual(["new1"]);
    expect(after.unreadCount).toBe(1);
  });

  it("a second clear moves the point on, and its Undo goes back to the first one", async () => {
    seedRows(3);
    const first = await bellNow();
    await inbox.clearNotifications(ME.uid, rules.newestCreatedAt(first.notifications), null, []);
    mem.__seed("notifications/b", { userId: ME.uid, type: "t", title: "B", message: "", read: false, createdAt: new mem.Timestamp(BASE + 50, 0) });
    const second = await bellNow();
    const receipt = await inbox.clearNotifications(ME.uid, rules.newestCreatedAt(second.notifications), second.clearedUpTo, ["b"]);
    expect((await bellNow()).notifications).toEqual([]);
    await inbox.undoClearNotifications(receipt!);
    expect((await bellNow()).notifications.map((n) => n.id)).toEqual(["b"]);
  });
});

describe("a once-a-day reminder stays read or cleared (services/notifications `once`)", () => {
  const ID = `birthday_ravi_2026-10-13_${ME.uid}`;
  const birthday = { userId: ME.uid, type: "birthday", title: "🎂 Birthday today", message: "It is Ravi's birthday", dedupeKey: ID, once: true };
  const anHourAgo = () => mem.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
  /** This morning's reminder, already in the bell — past the ten-minute window that used to be the only guard. */
  const sentThisMorning = (id: string, fields: Record<string, unknown>) =>
    mem.__seed(`notifications/${id}`, { ...fields, read: false, createdAt: anHourAgo() });

  it("is not written again by the next app open after Mark all read — the badge does not come back", async () => {
    sentThisMorning(ID, birthday);
    const before = await bellNow();
    await inbox.markAllNotificationsRead(ME.uid, rules.newestCreatedAt(before.notifications), [ID]);
    await sendNotification(birthday); // the same sweep from somebody else's app
    expect(mem.__read(`notifications/${ID}`)?.read).toBe(true);
    expect((await bellNow()).unreadCount).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled(); // and no second phone alert
  });

  it("is not brought back by the next sweep after Clear all", async () => {
    sentThisMorning(ID, birthday);
    const before = await bellNow();
    await inbox.clearNotifications(ME.uid, rules.newestCreatedAt(before.notifications), null, [ID]);
    await sendNotification(birthday);
    expect((await bellNow()).notifications).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("an EVENT key (no `once`) still comes back as new when it genuinely happens again later", async () => {
    const id = `work_completed_j1_${ME.uid}`;
    const event = { userId: ME.uid, type: "work_completed", title: "Work Completed", message: "done", dedupeKey: id };
    sentThisMorning(id, event);
    const before = await bellNow();
    await inbox.clearNotifications(ME.uid, rules.newestCreatedAt(before.notifications), null, [id]);
    await sendNotification(event); // resubmitted after edits, an hour on
    const after = await bellNow();
    expect(after.notifications.map((n) => n.id)).toEqual([id]);
    expect(after.unreadCount).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("the bell without the composite index", () => {
  it("falls back to an unordered read, still sorted and windowed — and stops it on sign-out", async () => {
    flags.failOrdered = true;
    seedRows(70);
    let rows: AppNotification[] = [];
    let calls = 0;
    const stop = inbox.watchNotifications(ME.uid, null, (r) => { rows = r; calls += 1; });
    await flush();
    const view = rules.inboxView(rows, null);
    expect(view.notifications).toHaveLength(50);
    expect(view.notifications[0].id).toBe("n69");
    stop();
    const heard = calls;
    mem.__seed("notifications/after", { userId: ME.uid, type: "t", title: "x", message: "", read: false, createdAt: new mem.Timestamp(BASE + 999, 0) });
    await flush();
    expect(calls).toBe(heard); // the fallback listener is gone too (it used to outlive the page)
  });
});

describe("the real bell in the Topbar", () => {
  async function openBell() {
    useAuthStore.setState({ user: ME, loading: false });
    render(
      <MemoryRouter initialEntries={["/tech-admin/dashboard"]}>
        <Topbar />
        <Toaster />
      </MemoryRouter>,
    );
    await flush();
    await flush();
    fireEvent.click(screen.getByTestId("notif-bell"));
    await flush();
  }

  it("Mark all read: the badge and every dot go at once, and every unread row in the database is read", async () => {
    seedRows(120); // all unread — far more than the bell holds
    await openBell();
    expect(screen.getByTestId("notif-badge")).toHaveTextContent("9+");
    expect(screen.getAllByTestId("notif-row")).toHaveLength(20);

    fireEvent.click(screen.getByTestId("notif-mark-all-read"));
    await flush();
    await waitFor(() => expect(screen.queryByTestId("notif-badge")).toBeNull());
    expect(document.querySelectorAll('[data-test="notif-row"][data-unread="true"]')).toHaveLength(0);
    expect(screen.queryByTestId("notif-mark-all-read")).toBeNull();
    await waitFor(() => expect(mine().every((n) => n.read)).toBe(true));
    expect(sound.chimes).toBe(0);
  });

  it("Clear all: the bell empties and stays empty, Undo brings it back, a new one still arrives and chimes", async () => {
    seedRows(120, { unreadFrom: 110 });
    await openBell();
    fireEvent.click(screen.getByTestId("notif-clear-all"));
    await flush();
    await waitFor(() => expect(screen.queryAllByTestId("notif-row")).toHaveLength(0));
    expect(screen.getByText("No notifications")).toBeInTheDocument();
    expect(screen.queryByTestId("notif-badge")).toBeNull();
    expect(await screen.findByText("Notifications cleared")).toBeInTheDocument();

    // A real pointer: mousedown first. The toast is outside the bell, and the bell closes on an outside
    // mousedown — which hid the rows Undo brought back (seen in the browser run). Undo keeps it open.
    const undo = screen.getByTestId("notif-undo-clear");
    fireEvent.mouseDown(undo);
    fireEvent.click(undo);
    await flush();
    await waitFor(() => expect(screen.getAllByTestId("notif-row")).toHaveLength(20));
    expect(screen.getByTestId("notif-badge")).toHaveTextContent("9+");
    expect(sound.chimes).toBe(0); // rows coming back are not news
    // The cleared toast goes and no other takes its place: the rows coming back say it. (On a phone a toast
    // sat over the bell's buttons until the toasts moved to the bottom — notificationRowsOct13.)
    await waitFor(() => expect(screen.queryByText("Notifications cleared")).toBeNull());
    expect(screen.queryByText("Notifications restored")).toBeNull();
    // So the very next press works — straight after Undo.
    fireEvent.click(screen.getByTestId("notif-mark-all-read"));
    await waitFor(() => expect(screen.queryByTestId("notif-badge")).toBeNull());
    expect(mine().every((n) => n.read)).toBe(true);

    fireEvent.click(screen.getByTestId("notif-clear-all"));
    await flush();
    await waitFor(() => expect(screen.queryAllByTestId("notif-row")).toHaveLength(0));
    await act(async () => {
      mem.__seed("notifications/fresh", { userId: ME.uid, type: "work_assigned", title: "Fresh job", message: "", read: false, createdAt: new mem.Timestamp(BASE + 5000, 0) });
    });
    await flush();
    await waitFor(() => expect(screen.getAllByTestId("notif-row")).toHaveLength(1));
    expect(screen.getByText("Fresh job")).toBeInTheDocument();
    expect(sound.chimes).toBe(1);

    // Anywhere else outside the bell still closes it.
    fireEvent.mouseDown(document.body);
    // The panel fades out (AnimatePresence keeps it mounted until its exit animation ends).
    await waitFor(() => expect(screen.queryAllByTestId("notif-row")).toHaveLength(0));
    expect(screen.getByTestId("notif-badge")).toHaveTextContent("1");
  });

  it("says so when the clear could not be saved, and keeps the rows", async () => {
    seedRows(3);
    await openBell();
    flags.refuseStateWrites = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fireEvent.click(screen.getByTestId("notif-clear-all"));
    await flush();
    expect(await screen.findByText("Could not clear your notifications")).toBeInTheDocument();
    expect(screen.getAllByTestId("notif-row")).toHaveLength(3);
    expect(screen.getByTestId("notif-clear-all")).not.toBeDisabled(); // free to try again
    errors.mockRestore();
  });
});
