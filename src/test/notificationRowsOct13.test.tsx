import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The bell, one notification at a time (owner, 2026-10-13, the follow-ups to the Mark all read / Clear
 * all fix):
 *   1. Messages at the bottom on phones — a toast at the top covered the top bar and the bell.
 *   2. A smaller "9+" badge (pinned in the browser run; here only that it still reads).
 *   3. Dismiss one row (X or swipe) and "Mark as unread".
 *   4. Notifications older than 90 days are cleaned up now and then.
 *   5. The bell's index is kept in the repo.
 * Checked on the pure rules, on the services against the in-memory Firestore, and on the real
 * Topbar and UpdatePopup.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/utils/platform", () => ({ isNative: () => false }));
const sound = vi.hoisted(() => ({ chimes: 0 }));
vi.mock("@/utils/audio", () => ({
  playNotificationSound: () => { sound.chimes += 1; },
  playClickSound: () => undefined,
}));

const mem = await import("./memoryFirestore");
const inbox = await import("@/services/notificationInbox");
const cleanupSvc = await import("@/services/notificationCleanup");
const rules = await import("@/utils/notificationInbox");
const { sendNotification } = await import("@/services/notifications");
const { useAuthStore } = await import("@/store/authStore");
const Topbar = (await import("@/components/layout/Topbar")).default;
const UpdatePopup = (await import("@/components/layout/UpdatePopup")).default;
const { Toaster } = await import("@/components/ui/toaster");
import type { AppUser } from "@/types";
import type { AppNotification } from "@/utils/notificationInbox";

configure({ testIdAttribute: "data-test" });

const ME = { uid: "kiran", name: "Kiran", role: "tech_admin", isActive: true, designation: "CTO" } as AppUser;
const BASE = 1_790_000_000; // seconds; row i is written at BASE + i

function seedRows(count: number, opts: { unreadFrom?: number; userId?: string; prefix?: string; dismissedFrom?: number } = {}) {
  const { unreadFrom = 0, userId = ME.uid, prefix = "n", dismissedFrom = Infinity } = opts;
  for (let i = 0; i < count; i++) {
    mem.__seed(`notifications/${prefix}${i}`, {
      userId, type: "work_assigned", title: `Job ${i}`, message: `Message ${i}`,
      read: i < unreadFrom || i >= dismissedFrom, createdAt: new mem.Timestamp(BASE + i, 0),
      ...(i >= dismissedFrom ? { dismissed: true } : {}),
    });
  }
}
const all = () => mem.__all("notifications") as unknown as (AppNotification & { id: string })[];
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function bellNow(uid = ME.uid, windowSize?: number) {
  let clearedUpTo: unknown = null;
  const stopState = inbox.watchInboxState(uid, (c) => { clearedUpTo = c; });
  await flush();
  let rows: AppNotification[] = [];
  const stopRows = inbox.watchNotifications(uid, clearedUpTo, (r) => { rows = r; }, windowSize);
  await flush();
  stopState();
  stopRows();
  return { ...rules.inboxView(rows, clearedUpTo, windowSize), rows };
}

beforeEach(() => {
  mem.__reset();
  sound.chimes = 0;
  localStorage.clear();
  sessionStorage.clear();
  useAuthStore.setState({ user: null, loading: false });
  global.fetch = vi.fn(() => Promise.resolve({ ok: true } as Response));
});
afterEach(() => cleanup());

describe("1 · messages sit at the bottom on every screen", () => {
  it("the toast viewport is pinned to the bottom (it was at the top below 640px) and clears the home bar", () => {
    render(<Toaster />);
    const viewport = document.querySelector("ol");
    expect(viewport?.className).toMatch(/(^|\s)bottom-0(\s|$)/);
    expect(viewport?.className).not.toMatch(/(^|\s)top-0(\s|$)/);
    expect(viewport?.className).toContain("env(safe-area-inset-bottom)");
  });
});

describe("3 · the rules for one row (utils/notificationInbox)", () => {
  const row = (id: string, seconds: number, extra: Partial<AppNotification> = {}): AppNotification => ({
    id, userId: "u", type: "t", title: id, message: "", read: false, createdAt: { seconds, nanoseconds: 0 }, ...extra,
  });

  it("a dismissed row is not shown and not counted", () => {
    const view = rules.inboxView([row("a", 3), row("b", 2, { dismissed: true, read: true }), row("c", 1)], null);
    expect(view.notifications.map((n) => n.id)).toEqual(["a", "c"]);
    expect(view.unreadCount).toBe(2);
  });

  it("loads more only when dismissed rows leave the panel short — a step at a time, never past the cap", () => {
    expect(rules.nextInboxWindow(50, 30, 12)).toBe(50); // everything there is, is loaded
    expect(rules.nextInboxWindow(50, 50, 20)).toBe(50); // the panel is full
    expect(rules.nextInboxWindow(50, 50, 19)).toBe(100);
    expect(rules.nextInboxWindow(150, 150, 3)).toBe(200);
    expect(rules.nextInboxWindow(200, 200, 0)).toBe(rules.MAX_INBOX_WINDOW);
  });

  it("a swipe dismisses past a third of the row (at most 96px) or on a clear flick — a nudge springs back", () => {
    expect(rules.isDismissSwipe(-96, 0, 360)).toBe(true);
    expect(rules.isDismissSwipe(100, 0, 360)).toBe(true);
    expect(rules.isDismissSwipe(80, 0, 360)).toBe(false);
    expect(rules.isDismissSwipe(40, 900, 360)).toBe(true); // a flick to the right
    // A firm short flick framer-motion measured at ~475 px/s in the browser run — it sprang back at 500.
    expect(rules.isDismissSwipe(-48, -475, 390)).toBe(true);
    expect(rules.isDismissSwipe(40, 200, 360)).toBe(false); // a slow nudge
    expect(rules.isDismissSwipe(40, -900, 360)).toBe(false); // flicked back the other way
    expect(rules.isDismissSwipe(10, 2000, 360)).toBe(false); // barely moved
  });

  it("an older row the bell only now loads is not an arrival — a newer one is", () => {
    const first = rules.freshArrivals([row("a", 100), row("b", 90)], new Map());
    // The window grew past dismissed rows: `old` was always there, it is just loaded now.
    const grown = rules.freshArrivals([row("a", 100), row("b", 90), row("old", 10)], first.seen);
    expect(grown.fresh).toEqual([]);
    const arrived = rules.freshArrivals([row("new", 101), ...[row("a", 100), row("b", 90), row("old", 10)]], grown.seen);
    expect(arrived.fresh.map((n) => n.id)).toEqual(["new"]);
  });
});

describe("3 · dismiss and mark unread (services/notificationInbox)", () => {
  it("dismiss hides the row on every device and marks it read; Undo brings it back as it was", async () => {
    seedRows(3); // all unread
    await inbox.dismissNotification("n2");
    let bell = await bellNow();
    expect(bell.notifications.map((n) => n.id)).toEqual(["n1", "n0"]);
    expect(bell.unreadCount).toBe(2);
    expect(mem.__read("notifications/n2")).toMatchObject({ dismissed: true, read: true });
    expect(all()).toHaveLength(3); // hidden, not deleted

    await inbox.undoDismissNotification("n2", false);
    bell = await bellNow();
    expect(bell.notifications.map((n) => n.id)).toEqual(["n2", "n1", "n0"]);
    expect(bell.unreadCount).toBe(3);
    expect(mem.__read("notifications/n2")?.dismissed).toBeUndefined();
  });

  it("dismissing a row that was deleted meanwhile is not an error", async () => {
    await expect(inbox.dismissNotification("gone")).resolves.toBeUndefined();
  });

  it("mark as unread brings the dot and the badge back, and says the person has seen it", async () => {
    seedRows(2, { unreadFrom: 2 }); // both read
    await inbox.markNotificationUnread("n0");
    const bell = await bellNow();
    expect(bell.unreadCount).toBe(1);
    expect(mem.__read("notifications/n0")?.markedUnreadAt).toBeTruthy();
  });

  it("a dismissed once-a-day reminder stays dismissed; a keyed EVENT that really happens again comes back", async () => {
    const remind = { userId: ME.uid, type: "birthday", title: "🎂", message: "Ravi", dedupeKey: `birthday_ravi_2026-10-13_${ME.uid}`, once: true };
    await sendNotification(remind);
    await inbox.dismissNotification(remind.dedupeKey);
    await sendNotification(remind); // somebody else's app opens later the same day
    expect(mem.__read(`notifications/${remind.dedupeKey}`)?.dismissed).toBe(true);

    const id = `work_completed_j1_${ME.uid}`;
    mem.__seed(`notifications/${id}`, {
      userId: ME.uid, type: "work_completed", title: "Done", message: "done", read: true, dismissed: true,
      createdAt: mem.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000),
    });
    await sendNotification({ userId: ME.uid, type: "work_completed", title: "Done", message: "done", dedupeKey: id });
    const bell = await bellNow();
    expect(bell.notifications.map((n) => n.id)).toContain(id);
  });

  it("the listener can be asked for more than the first 50", async () => {
    seedRows(120, { dismissedFrom: 80 }); // the newest 40 dismissed
    const small = await bellNow(ME.uid, 50);
    expect(small.notifications).toHaveLength(10);
    const grown = await bellNow(ME.uid, 100);
    expect(grown.notifications).toHaveLength(60);
    expect(grown.notifications[0].id).toBe("n79");
  });
});

describe("4 · the 90-day clean-up (services/notificationCleanup)", () => {
  const NOW = new Date("2026-10-13T10:00:00+05:30");
  const daysAgo = (d: number) => mem.Timestamp.fromMillis(NOW.getTime() - d * 24 * 60 * 60 * 1000);
  function seedAged(prefix: string, count: number, ageDays: number, userId = ME.uid) {
    for (let i = 0; i < count; i++) {
      mem.__seed(`notifications/${prefix}${i}`, { userId, type: "t", title: "x", message: "", read: false, createdAt: daysAgo(ageDays) });
    }
  }

  it("deletes every row older than 90 days, for everybody — and nothing newer", async () => {
    seedAged("old", 5, 91);
    seedAged("theirs", 4, 200, "ravi");
    seedAged("edge", 2, 89);
    seedAged("new", 3, 1);
    const deleted = await cleanupSvc.cleanUpOldNotificationsOnOpen(ME.uid, NOW);
    expect(deleted).toBe(9);
    expect(all().map((n) => n.id).sort()).toEqual(["edge0", "edge1", "new0", "new1", "new2"]);
    expect(mem.__read("app_settings/notification_cleanup")).toMatchObject({ day: "2026-10-13", byUid: ME.uid, deleted: 9 });
  });

  it("runs once a day across the company: this device does not look again, another device finds the day taken", async () => {
    seedAged("old", 3, 100);
    expect(await cleanupSvc.cleanUpOldNotificationsOnOpen(ME.uid, NOW)).toBe(3);
    seedAged("later", 2, 100); // more old rows turn up the same day
    expect(await cleanupSvc.cleanUpOldNotificationsOnOpen(ME.uid, NOW)).toBe(0);
    localStorage.clear(); // a second phone
    expect(await cleanupSvc.cleanUpOldNotificationsOnOpen("ravi", NOW)).toBe(0);
    expect(all()).toHaveLength(2);
    // Tomorrow, whoever opens first takes them.
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(await cleanupSvc.cleanUpOldNotificationsOnOpen("ravi", tomorrow)).toBe(2);
  });

  it("deletes in batches under Firestore's limit and stops at the day's cap — the rest go on later days", async () => {
    seedAged("old", 950, 120);
    expect(await cleanupSvc.deleteNotificationsBefore(rules.cleanupCutoff(NOW), 900)).toBe(900);
    expect(all()).toHaveLength(50);
    expect(await cleanupSvc.deleteNotificationsBefore(rules.cleanupCutoff(NOW))).toBe(50);
    expect(all()).toHaveLength(0);
  });

  it("the cut-off is 90 days", () => {
    expect(rules.NOTIFICATION_KEEP_DAYS).toBe(90);
    expect(NOW.getTime() - rules.cleanupCutoff(NOW).getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });
});

describe("5 · the bell's index is in the repo", () => {
  it("firestore.indexes.json holds (userId ↑, createdAt ↓) on notifications, and firebase.json points at it", () => {
    const root = resolve(__dirname, "../..");
    const spec = JSON.parse(readFileSync(resolve(root, "firestore.indexes.json"), "utf8"));
    expect(spec.indexes).toContainEqual({
      collectionGroup: "notifications",
      queryScope: "COLLECTION",
      fields: [{ fieldPath: "userId", order: "ASCENDING" }, { fieldPath: "createdAt", order: "DESCENDING" }],
    });
    const config = JSON.parse(readFileSync(resolve(root, "firebase.json"), "utf8"));
    expect(config.firestore.indexes).toBe("firestore.indexes.json");
    // The rules are pasted by hand from docs/firestore-rules.md; a deploy from here must not touch them.
    expect(config.firestore.rules).toBeUndefined();
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
  const rowTitled = (title: string) => screen.getByText(title).closest('[data-test="notif-row"]') as HTMLElement;

  it("2 · the badge still reads, and is out of the way of a screen reader (the bell's label says the count)", async () => {
    seedRows(12);
    await openBell();
    expect(screen.getByTestId("notif-badge")).toHaveTextContent("9+");
    expect(screen.getByTestId("notif-badge")).toHaveAttribute("aria-hidden");
    expect(screen.getByTestId("notif-bell")).toHaveAttribute("aria-label", "Notifications, 12 unread");
  });

  it("X dismisses one row (the rest stay, the bell stays open), and Undo brings it back unread", async () => {
    seedRows(3);
    await openBell();
    expect(screen.getByTestId("notif-badge")).toHaveTextContent("3");
    fireEvent.click(within(rowTitled("Job 2")).getByTestId("notif-dismiss"));
    await flush();
    await waitFor(() => expect(screen.queryByText("Job 2")).toBeNull());
    expect(screen.getAllByTestId("notif-row")).toHaveLength(2);
    expect(screen.getByTestId("notif-badge")).toHaveTextContent("2");
    expect(mem.__read("notifications/n2")).toMatchObject({ dismissed: true, read: true });
    expect(await screen.findByText("Notification dismissed")).toBeInTheDocument();

    const undo = screen.getByTestId("notif-undo-dismiss");
    fireEvent.mouseDown(undo);
    fireEvent.click(undo);
    await flush();
    await waitFor(() => expect(screen.getAllByTestId("notif-row")).toHaveLength(3));
    expect(screen.getByTestId("notif-badge")).toHaveTextContent("3");
    expect(mem.__read("notifications/n2")?.read).toBe(false);
    expect(sound.chimes).toBe(0); // a row coming back is not news
  });

  it("the envelope marks a read row unread and an unread row read — without opening it or closing the bell", async () => {
    seedRows(2, { unreadFrom: 1 }); // n0 read, n1 unread
    await openBell();
    expect(screen.getByTestId("notif-badge")).toHaveTextContent("1");

    const readRow = rowTitled("Job 0");
    expect(within(readRow).getByTestId("notif-toggle-read")).toHaveAttribute("aria-label", "Mark as unread");
    fireEvent.click(within(readRow).getByTestId("notif-toggle-read"));
    await flush();
    await waitFor(() => expect(screen.getByTestId("notif-badge")).toHaveTextContent("2"));
    expect(rowTitled("Job 0")).toHaveAttribute("data-unread", "true");
    expect(mem.__read("notifications/n0")?.markedUnreadAt).toBeTruthy();

    fireEvent.click(within(rowTitled("Job 1")).getByTestId("notif-toggle-read"));
    await flush();
    await waitFor(() => expect(screen.getByTestId("notif-badge")).toHaveTextContent("1"));
    expect(screen.getAllByTestId("notif-row")).toHaveLength(2); // still open
    expect(sound.chimes).toBe(0);
  });

  it("dismissed rows filling the first 50 do not empty the panel — it loads further back, without a chime", async () => {
    seedRows(120, { dismissedFrom: 80, unreadFrom: 70 }); // newest 40 dismissed; 70–79 unread
    await openBell();
    await waitFor(() => expect(screen.getAllByTestId("notif-row")).toHaveLength(20));
    expect(screen.getAllByTestId("notif-row")[0]).toHaveTextContent("Job 79");
    expect(screen.getByTestId("notif-badge")).toHaveTextContent("9+");
    expect(sound.chimes).toBe(0);
  });
});

describe("UpdatePopup and a row marked unread", () => {
  const MEMBER = { uid: "asha", name: "Asha", role: "tech_member", isActive: true } as AppUser;
  const job = (extra: Record<string, unknown> = {}) => mem.__seed("notifications/job1", {
    userId: MEMBER.uid, type: "work_assigned", title: "New job assigned", message: "Ravi Textiles", read: false,
    createdAt: mem.Timestamp.fromMillis(Date.now() - 60_000), ...extra,
  });
  const renderPopup = async () => {
    useAuthStore.setState({ user: MEMBER, loading: false });
    render(<MemoryRouter><UpdatePopup /></MemoryRouter>);
    await flush();
  };

  it("an unread new job still pops up", async () => {
    job();
    await renderPopup();
    expect(screen.getByText("New job assigned")).toBeInTheDocument();
  });

  it("a job the person marked unread in the bell does not pop up again — the bell's dot is the reminder", async () => {
    job({ markedUnreadAt: mem.Timestamp.fromMillis(Date.now()) });
    await renderPopup();
    expect(screen.queryByText("New job assigned")).toBeNull();
  });
});
