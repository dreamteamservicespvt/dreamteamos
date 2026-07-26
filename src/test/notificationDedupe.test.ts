import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * A tech member submitting work from a phone produced seven to ten identical notifications for the
 * admin. The submit button fired on every tap while five slow writes ran, and every call did an
 * unconditional `addDoc`, so each tap wrote fresh rows.
 *
 * The button no longer allows the repeat, but that only fixes one caller. A dedupe key makes the
 * notification itself idempotent, so nothing downstream can recreate the problem — which is what
 * these pin.
 */

const addDoc = vi.fn(async () => ({ id: "generated" }));
const setDoc = vi.fn(async () => undefined);
const doc = vi.fn((_db: unknown, _col: string, id: string) => ({ __id: id }));

vi.mock("firebase/firestore", () => ({
  addDoc,
  setDoc,
  doc,
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: () => "TS",
}));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/utils/platform", () => ({ isNative: () => false }));

const { sendNotification } = await import("@/services/notifications");

beforeEach(() => {
  addDoc.mockClear();
  setDoc.mockClear();
  doc.mockClear();
  global.fetch = vi.fn(() => Promise.resolve({ ok: true } as Response));
});

afterEach(() => vi.restoreAllMocks());

const base = { userId: "admin1", type: "work_completed", title: "Work Completed", message: "done" };

describe("sendNotification", () => {
  it("still appends a new row when there is no key — a chat message is not an event", async () => {
    await sendNotification(base);
    await sendNotification(base);
    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(setDoc).not.toHaveBeenCalled();
  });

  /** The regression itself: the same event sent repeatedly must occupy one document. */
  it("writes the same document every time for one keyed event", async () => {
    const keyed = { ...base, dedupeKey: "work_completed_job1_admin1" };
    await sendNotification(keyed);
    await sendNotification(keyed);
    await sendNotification(keyed);

    expect(addDoc).not.toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledTimes(3);
    const ids = setDoc.mock.calls.map((c) => (c[0] as { __id: string }).__id);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe("work_completed_job1_admin1");
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
    expect((setDoc.mock.calls[0][0] as { __id: string }).__id).toBe("work_completed_job_1");
  });

  it("marks a re-sent notification unread again, so it cannot be missed", async () => {
    await sendNotification({ ...base, dedupeKey: "k1" });
    expect(setDoc.mock.calls[0][1]).toMatchObject({ read: false, userId: "admin1" });
  });
});
