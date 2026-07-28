import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * "Your delivery is overdue" was reaching the wrong people, for work that was already done.
 *
 * The sweep read two fields the ORDER keeps about itself — who it went to, and whether it is
 * finished — and both go stale. Reassigning a job rewrites the assignment and left the order's copy
 * behind, so the alert chased a member who had not held that job for days; and an order whose
 * completion write never landed stayed "assigned" forever and kept chasing finished work.
 *
 * These pin the join to the work assignment, which is the truth on both counts.
 */

const sendNotification = vi.fn(async (_params: Record<string, unknown>) => undefined);
const updateDoc = vi.fn(async () => undefined);

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, updateDoc, doc: vi.fn(() => ({})), serverTimestamp: () => "TS" };
});

const { notifyDueOrdersOnOpen } = await import("@/services/orders");
import type { Order, WorkAssignment } from "@/types";

const NOW = Date.parse("2026-07-28T10:00:00Z");
const at = (ms: number) => ({ seconds: Math.floor(ms / 1000) });
/** A promise that fell due two days ago: comfortably overdue. */
const overduePromise = { label: "24 hours", hours: 24, dueAt: at(NOW - 2 * 24 * 60 * 60 * 1000) };

const order = (f: Partial<Order> = {}): Order => ({
  id: "o1",
  status: "assigned",
  assignedTo: "member_old",
  businessName: "Sharma Electronics",
  promise: overduePromise,
  lastDeadlineNotifiedAt: null,
  ...f,
} as Order);

const work = (f: Partial<WorkAssignment> = {}): WorkAssignment => ({
  id: "w1", orderId: "o1", assignedTo: "member_new", status: "in_progress", ...f,
} as WorkAssignment);

const recipients = () => sendNotification.mock.calls.map((c) => (c[0] as { userId: string }).userId);

beforeEach(() => {
  sendNotification.mockClear();
  updateDoc.mockClear();
});

describe("notifyDueOrdersOnOpen", () => {
  it("alerts the member who is holding the work now, not the one the order remembers", async () => {
    await notifyDueOrdersOnOpen([order()], [work()], NOW);
    expect(recipients()).toEqual(["member_new"]);
  });

  it("stays silent when the work is already completed, whatever the order still says", async () => {
    await notifyDueOrdersOnOpen([order()], [work({ status: "completed" })], NOW);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("stays silent when the work has been verified", async () => {
    await notifyDueOrdersOnOpen([order()], [work({ status: "verified" })], NOW);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("falls back to the order's own assignee when no work record is loaded", async () => {
    await notifyDueOrdersOnOpen([order()], [], NOW);
    expect(recipients()).toEqual(["member_old"]);
  });

  it("says nothing about work that is still comfortably inside its promise", async () => {
    const onTime = order({ promise: { label: "3 days", hours: 72, dueAt: at(NOW + 48 * 60 * 60 * 1000) } } as Partial<Order>);
    await notifyDueOrdersOnOpen([onTime], [work()], NOW);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("respects the six-hour throttle", async () => {
    const justTold = order({ lastDeadlineNotifiedAt: at(NOW - 60_000) } as Partial<Order>);
    await notifyDueOrdersOnOpen([justTold], [work()], NOW);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("keys the alert to the order, its state and its recipient, so re-opening the queue adds nothing", async () => {
    await notifyDueOrdersOnOpen([order()], [work()], NOW);
    expect(sendNotification.mock.calls[0]?.[0]).toMatchObject({
      dedupeKey: "work_deadline_o1_overdue_member_new",
      type: "work_deadline",
    });
  });

  it("skips an order with nobody on it at all", async () => {
    await notifyDueOrdersOnOpen([order({ assignedTo: null } as Partial<Order>)], [], NOW);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
