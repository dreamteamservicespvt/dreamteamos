import { describe, it, expect } from "vitest";
import { buildAdPipeline, countByStage, orderBacked, standaloneCount } from "@/utils/adPipeline";
import type { Order, WorkAssignment } from "@/types";

/**
 * The Orders queue and the Work Assign board both showed a number called "Assigned" and the two
 * disagreed. They were counting different populations — orders versus work assignments — and two
 * of the four differences push in opposite directions, so neither number could be checked against
 * the other. These pin the single definition that replaced them.
 */

const order = (id: string, status: string, extra: Partial<Order> = {}): Order =>
  ({ id, status, businessName: `Order ${id}`, ...extra } as unknown as Order);

const work = (id: string, status: string, assignedTo = "m1", orderId?: string): WorkAssignment =>
  ({ id, status, assignedTo, orderId } as unknown as WorkAssignment);

describe("every ad is counted exactly once", () => {
  it("counts an order and the work fulfilling it as one ad", () => {
    const records = buildAdPipeline([order("o1", "assigned")], [work("w1", "assigned", "m1", "o1")]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "o1", stage: "assigned", standalone: false, memberUid: "m1" });
  });

  it("takes the stage from the work, not the order's stale copy", () => {
    const records = buildAdPipeline([order("o1", "assigned")], [work("w1", "in_progress", "m1", "o1")]);
    expect(records[0].stage).toBe("in_progress");
  });

  it("treats work sent back for edits as still in progress", () => {
    const records = buildAdPipeline([order("o1", "assigned")], [work("w1", "editing", "m1", "o1")]);
    expect(records[0].stage).toBe("in_progress");
  });
});

/**
 * Difference 1, and the only legitimate one: `createWorkAssignment` writes `orderId` only when
 * there is a sale to link to, so a walk-in job is real work the Orders queue has never heard of.
 */
describe("work created without an order", () => {
  it("is still counted, and is marked as standalone", () => {
    const records = buildAdPipeline([], [work("w1", "assigned")]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "w1", stage: "assigned", standalone: true });
  });

  it("is exactly the gap between the board and the Orders queue", () => {
    const records = buildAdPipeline(
      [order("o1", "assigned")],
      [work("w1", "assigned", "m1", "o1"), work("w2", "assigned")],
    );
    expect(countByStage(records).assigned).toBe(2);
    expect(countByStage(orderBacked(records)).assigned).toBe(1);
    expect(standaloneCount(records)).toBe(1);
  });
});

/** Differences 3 and 4 — the ones that used to push the two counts the other way. */
describe("the cases that used to make the numbers drift apart", () => {
  it("still counts an order whose assignment was deleted, once", () => {
    const records = buildAdPipeline([order("o1", "assigned")], []);
    expect(records).toHaveLength(1);
    expect(records[0].stage).toBe("assigned");
  });

  /**
   * A verified or cancelled order drops out of the Orders query, but its assignment remains. It
   * must still be one ad — not zero, and not two.
   */
  it("counts work whose order is no longer in the query, once", () => {
    const records = buildAdPipeline([], [work("w1", "verified", "m1", "o-gone")]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ stage: "verified", standalone: true });
  });

  it("never double-counts an order that also has an assignment", () => {
    const records = buildAdPipeline(
      [order("o1", "assigned"), order("o2", "unassigned")],
      [work("w1", "in_progress", "m1", "o1")],
    );
    expect(records).toHaveLength(2);
    expect(countByStage(records)).toMatchObject({ unassigned: 1, in_progress: 1, assigned: 0 });
  });

  it("ignores a deleted order entirely", () => {
    const records = buildAdPipeline([order("o1", "unassigned", { deleted: true } as Partial<Order>)], []);
    expect(records).toEqual([]);
  });
});

/**
 * Difference 2: work abandoned on a member who has left will never move again. Scoping to the
 * current team is what keeps it out of BOTH screens rather than only one.
 */
describe("scoping to the people still on the team", () => {
  const orders = [order("o1", "assigned"), order("o2", "assigned"), order("o3", "unassigned")];
  const assignments = [
    work("w1", "assigned", "current", "o1"),
    work("w2", "in_progress", "departed", "o2"),
    work("w3", "assigned", "departed"),
  ];

  it("drops work held by someone no longer on the team", () => {
    const records = buildAdPipeline(orders, assignments, { memberUids: new Set(["current"]) });
    expect(records.map(r => r.id).sort()).toEqual(["o1", "o3"]);
  });

  // Nobody holds an unassigned order, so it belongs to whoever picks it up.
  it("always keeps unassigned orders, whoever is on the team", () => {
    const records = buildAdPipeline(orders, assignments, { memberUids: new Set(["nobody"]) });
    expect(records.map(r => r.id)).toEqual(["o3"]);
  });

  it("counts everything when no scope is given", () => {
    expect(buildAdPipeline(orders, assignments)).toHaveLength(4);
  });
});

/**
 * The invariant the whole fix exists for: whatever the data, the Work Assign board and the Orders
 * queue agree on every stage, and the difference is exactly the work with no sale behind it.
 *
 * Built from a dataset containing all four ways the two used to drift — including the two that
 * pushed the counts in opposite directions, which is why the discrepancy could not be eyeballed.
 */
describe("the board and the Orders queue can always be reconciled", () => {
  const orders = [
    order("o-waiting", "unassigned"),
    order("o-assigned", "assigned"),
    order("o-working", "assigned"),
    order("o-done", "completed"),
    order("o-ghost-assignment", "assigned"),          // its assignment was deleted
    order("o-departed", "assigned"),                   // held by someone who left
    order("o-deleted", "unassigned", { deleted: true } as Partial<Order>),
  ];
  const assignments = [
    work("w1", "assigned", "current", "o-assigned"),
    work("w2", "in_progress", "current", "o-working"),
    work("w3", "completed", "current", "o-done"),
    work("w4", "in_progress", "departed", "o-departed"),
    work("w-manual-a", "assigned", "current"),         // no order behind it
    work("w-manual-b", "in_progress", "current"),      // no order behind it
    work("w-orphan", "verified", "current", "o-gone"), // order no longer in the query
  ];

  const team = new Set(["current"]);
  const board = buildAdPipeline(orders, assignments, { memberUids: team });
  const queue = orderBacked(board);

  it("counts each ad once — no ad is lost and none is counted twice", () => {
    const ids = board.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Every order except the deleted one and the departed member's, plus every standalone.
    expect(board).toHaveLength(8);
  });

  it("agrees stage by stage once the sale-less work is set aside", () => {
    const boardCounts = countByStage(board);
    const queueCounts = countByStage(queue);

    for (const stage of ["unassigned", "assigned", "in_progress", "completed"] as const) {
      const gap = board.filter(r => r.standalone && r.stage === stage).length;
      expect(boardCounts[stage] - gap).toBe(queueCounts[stage]);
    }
  });

  it("makes the whole difference exactly the standalone work", () => {
    expect(board.length - queue.length).toBe(standaloneCount(board));
  });

  it("keeps a departed member's abandoned work out of BOTH, not just one", () => {
    expect(board.some(r => r.memberUid === "departed")).toBe(false);
    expect(queue.some(r => r.memberUid === "departed")).toBe(false);
  });

  it("still counts an order whose assignment vanished, on both", () => {
    expect(board.find(r => r.id === "o-ghost-assignment")?.stage).toBe("assigned");
    expect(queue.find(r => r.id === "o-ghost-assignment")?.stage).toBe("assigned");
  });
});

describe("countByStage", () => {
  it("reports every stage, including the ones with nothing in them", () => {
    expect(countByStage([])).toEqual({
      unassigned: 0, assigned: 0, in_progress: 0, completed: 0, verified: 0,
    });
  });

  it("adds up to the number of ads", () => {
    const records = buildAdPipeline(
      [order("o1", "unassigned"), order("o2", "assigned"), order("o3", "completed")],
      [work("w1", "in_progress", "m1", "o2"), work("w2", "verified")],
    );
    const counts = countByStage(records);
    expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(records.length);
    expect(counts).toMatchObject({ unassigned: 1, in_progress: 1, completed: 1, verified: 1 });
  });
});
