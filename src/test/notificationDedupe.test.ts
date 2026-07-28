import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * A tech member submitting work from a phone produced seven to ten identical notifications for the
 * admin. The submit button fired on every tap while five slow writes ran, and every call did an
 * unconditional `addDoc`, so each tap wrote fresh rows.
 *
 * The button no longer allows the repeat, but that only fixes one caller. A dedupe key makes the
 * notification itself idempotent, so nothing downstream can recreate the problem — which is what
 * these pin.
 *
 * The key alone was not enough, though: it collapsed the in-app ROW while the phone alert was still
 * fired on every call, so the burst was invisible in the bell and very visible on the recipient's
 * phone. The collapse-window tests below pin the second half of that.
 */

const addDoc = vi.fn(async () => ({ id: "generated" }));
const setDoc = vi.fn(async (_ref: { __id: string }, _payload: Record<string, unknown>) => undefined);
const doc = vi.fn((_db: unknown, _col: string, id: string) => ({ __id: id }));

/** Stands in for what is already in Firestore, keyed by document id. */
let stored: Record<string, Record<string, unknown>> = {};
const getDoc = vi.fn(async (ref: { __id: string }) => ({
  exists: () => stored[ref.__id] !== undefined,
  data: () => stored[ref.__id],
}));

vi.mock("firebase/firestore", () => ({
  addDoc,
  setDoc,
  doc,
  getDoc,
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: () => "TS",
}));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/utils/platform", () => ({ isNative: () => false }));

const { sendNotification } = await import("@/services/notifications");

let pushes: number;

beforeEach(() => {
  addDoc.mockClear();
  setDoc.mockClear();
  doc.mockClear();
  getDoc.mockClear();
  stored = {};
  pushes = 0;
  global.fetch = vi.fn(() => {
    pushes += 1;
    return Promise.resolve({ ok: true } as Response);
  });
});

afterEach(() => vi.restoreAllMocks());

const base = { userId: "admin1", type: "work_completed", title: "Work Completed", message: "done" };

/** Records what a previous send left behind, so the next call sees a real existing row. */
const alreadySent = (id: string, overrides: Record<string, unknown> = {}) => {
  stored[id] = { userId: base.userId, title: base.title, message: base.message, createdAt: { toMillis: () => Date.now() }, ...overrides };
};

describe("sendNotification", () => {
  it("still appends a new row when there is no key — a chat message is not an event", async () => {
    await sendNotification(base);
    await sendNotification(base);
    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(setDoc).not.toHaveBeenCalled();
  });

  /** The regression itself: the same event sent repeatedly must occupy one document. */
  it("writes one document for one keyed event", async () => {
    await sendNotification({ ...base, dedupeKey: "work_completed_job1_admin1" });
    expect(addDoc).not.toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect((setDoc.mock.calls[0]?.[0] as { __id: string }).__id).toBe("work_completed_job1_admin1");
  });

  it("keeps one notification per recipient, not one for the whole event", async () => {
    await sendNotification({ ...base, userId: "a", dedupeKey: "work_completed_job1_a" });
    await sendNotification({ ...base, userId: "b", dedupeKey: "work_completed_job1_b" });
    const ids = setDoc.mock.calls.map((c) => (c[0] as { __id: string }).__id);
    expect(new Set(ids).size).toBe(2);
  });

  // Firestore ids cannot contain "/" — a key built from a path would throw at the worst moment.
  it("makes a key safe to use as a document id", async () => {
    await sendNotification({ ...base, dedupeKey: "work/completed job#1" });
    expect((setDoc.mock.calls[0]?.[0] as { __id: string }).__id).toBe("work_completed_job_1");
  });

  it("marks a first-time notification unread, so it cannot be missed", async () => {
    await sendNotification({ ...base, dedupeKey: "k1" });
    expect(setDoc.mock.calls[0]?.[1]).toMatchObject({ read: false, userId: "admin1" });
  });

  describe("the phone alert", () => {
    it("fires once for a first-time keyed event", async () => {
      await sendNotification({ ...base, dedupeKey: "k1" });
      expect(pushes).toBe(1);
    });

    /** The complaint, exactly: one submit, one alert on the recipient's phone. */
    it("does not fire again for a repeat of the same event moments later", async () => {
      alreadySent("k1");
      await sendNotification({ ...base, dedupeKey: "k1" });
      expect(pushes).toBe(0);
      expect(setDoc).not.toHaveBeenCalled();
    });

    it("fires again when the same key genuinely recurs later", async () => {
      alreadySent("k1", { createdAt: { toMillis: () => Date.now() - 60 * 60 * 1000 } });
      await sendNotification({ ...base, dedupeKey: "k1" });
      expect(pushes).toBe(1);
      expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it("fires when the key matches but the news has changed", async () => {
      alreadySent("k1", { message: "an older message" });
      await sendNotification({ ...base, dedupeKey: "k1" });
      expect(pushes).toBe(1);
    });

    it("treats an unresolved server timestamp as a write from seconds ago", async () => {
      alreadySent("k1", { createdAt: null });
      await sendNotification({ ...base, dedupeKey: "k1" });
      expect(pushes).toBe(0);
    });

    it("sends rather than stays silent when the existence check fails", async () => {
      getDoc.mockRejectedValueOnce(new Error("offline"));
      await sendNotification({ ...base, dedupeKey: "k1" });
      expect(pushes).toBe(1);
      expect(setDoc).toHaveBeenCalledTimes(1);
    });
  });
});
