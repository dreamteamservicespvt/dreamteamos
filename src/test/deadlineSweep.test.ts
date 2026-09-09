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
/** The `users where role == tech_team_leader` lookup. Counted, so the per-sweep cache is provable. */
const getDocs = vi.fn(async () => ({ docs: [{ id: "leader_1" }, { id: "leader_2" }] }));

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual, updateDoc, getDocs,
    doc: vi.fn(() => ({})), collection: vi.fn(() => ({})), query: vi.fn(() => ({})),
    where: vi.fn(() => ({})), serverTimestamp: () => "TS",
  };
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
  getDocs.mockClear();
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

/**
 * Who a late delivery is actually announced to.
 *
 * It went to the assignee alone — the one person who already knows. The client rings the SALES
 * MEMBER, who had no idea their 24-hour promise had gone; and moving work around is the TEAM
 * LEADER's and the tech admin's job, and neither heard until somebody complained.
 */
describe("who hears about a late delivery", () => {
  const full = (f: Partial<Order> = {}) =>
    order({ soldBy: "seller_1", techAdminId: "admin_1", ...f } as Partial<Order>);

  it("tells the maker, the seller, the tech admin and every team leader", async () => {
    await notifyDueOrdersOnOpen([full()], [work()], NOW);
    expect(recipients().sort())
      .toEqual(["admin_1", "leader_1", "leader_2", "member_new", "seller_1"]);
  });

  it("tells the seller what THEY can do about it, not what the maker should", async () => {
    await notifyDueOrdersOnOpen([full()], [work()], NOW);
    const toSeller = sendNotification.mock.calls
      .map((c) => c[0] as { userId: string; message: string })
      .find((n) => n.userId === "seller_1");
    expect(toSeller?.message).toMatch(/you sold/i);
    expect(toSeller?.message).toMatch(/extend the delivery time once/i);
  });

  /** A leader who assigned a job to themselves is both the assignee and a leader. */
  it("tells nobody twice", async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: "member_new" }] });
    await notifyDueOrdersOnOpen([full()], [work()], NOW);
    const got = recipients();
    expect(new Set(got).size).toBe(got.length);
    expect(got).toContain("member_new");
  });

  it("keys every recipient's alert separately, so re-opening the queue adds nothing", async () => {
    await notifyDueOrdersOnOpen([full()], [work()], NOW);
    const keys = sendNotification.mock.calls.map((c) => (c[0] as { dedupeKey: string }).dedupeKey);
    expect(keys).toContain("work_deadline_o1_overdue_seller_1");
    expect(keys).toContain("work_deadline_o1_overdue_leader_1");
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * A sweep can find a dozen late orders at once and they all belong to the same admin — a lookup
   * per order would be a dozen identical queries on a free-tier read budget.
   */
  it("looks the team leaders up once per sweep, however many orders are late", async () => {
    const late = [full({ id: "o1" }), full({ id: "o2" }), full({ id: "o3" })];
    const works = late.map((o) => work({ id: `w-${o.id}`, orderId: o.id }));
    await notifyDueOrdersOnOpen(late, works, NOW);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it("still alerts when the leader lookup fails, minus the leaders", async () => {
    getDocs.mockRejectedValueOnce(new Error("offline"));
    await notifyDueOrdersOnOpen([full()], [work()], NOW);
    expect(recipients().sort()).toEqual(["admin_1", "member_new", "seller_1"]);
  });

  it("says nothing to anyone about work that is still inside its promise", async () => {
    const onTime = full({ promise: { label: "3 days", hours: 72, dueAt: at(NOW + 48 * 60 * 60 * 1000) } } as Partial<Order>);
    await notifyDueOrdersOnOpen([onTime], [work()], NOW);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
