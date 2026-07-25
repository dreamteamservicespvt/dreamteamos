import { describe, it, expect } from "vitest";
import {
  ORDER_QUEUE_TABS, assignmentsByOrderId, orderAssignee, orderQueueStatus,
} from "@/utils/orderQueue";
import type { Order, WorkAssignment } from "@/types";

/**
 * The Orders queue's columns are a JOIN, not a field. An order's own status only knows "assigned"
 * — whether anyone has actually started lives on the work assignment — so an admin looking for the
 * jobs that are moving had to go to a different screen to find out.
 */

const order = (id: string, status: string, extra: Partial<Order> = {}): Order =>
  ({ id, status, businessName: "Sharma", ...extra } as unknown as Order);

const work = (orderId: string, status: string, assignedTo = "m1"): WorkAssignment =>
  ({ id: `w_${orderId}`, orderId, status, assignedTo } as unknown as WorkAssignment);

const index = (...items: WorkAssignment[]) => assignmentsByOrderId(items);

describe("orderQueueStatus", () => {
  it("leaves an unassigned order alone", () => {
    expect(orderQueueStatus(order("o1", "unassigned"), index())).toBe("unassigned");
  });

  it("says assigned while nobody has started", () => {
    expect(orderQueueStatus(order("o1", "assigned"), index(work("o1", "assigned")))).toBe("assigned");
  });

  it("says in progress once the member is working on it", () => {
    expect(orderQueueStatus(order("o1", "assigned"), index(work("o1", "in_progress")))).toBe("in_progress");
  });

  // Work sent back for changes is on someone's desk, not finished.
  it("treats work sent back for edits as in progress", () => {
    expect(orderQueueStatus(order("o1", "assigned"), index(work("o1", "editing")))).toBe("in_progress");
  });

  it("says completed when the work is delivered, even if the order lags behind", () => {
    expect(orderQueueStatus(order("o1", "assigned"), index(work("o1", "completed")))).toBe("completed");
    expect(orderQueueStatus(order("o1", "assigned"), index(work("o1", "verified")))).toBe("completed");
  });

  it("trusts the order when it already says completed or verified", () => {
    expect(orderQueueStatus(order("o1", "completed"), index())).toBe("completed");
    expect(orderQueueStatus(order("o1", "verified"), index())).toBe("completed");
  });

  /**
   * The order is the truth about whether it was handed out. A missing assignment must not quietly
   * move it back to the unassigned column, where someone would assign it a second time.
   */
  it("stays assigned when the assignment has gone missing", () => {
    expect(orderQueueStatus(order("o1", "assigned"), index())).toBe("assigned");
  });

  it("ignores an assignment belonging to a different order", () => {
    expect(orderQueueStatus(order("o1", "assigned"), index(work("o2", "in_progress")))).toBe("assigned");
  });
});

describe("assignmentsByOrderId", () => {
  it("indexes only the assignments that fulfil an order", () => {
    const map = assignmentsByOrderId([
      work("o1", "assigned"),
      { id: "w_loose", status: "assigned" } as unknown as WorkAssignment,
    ]);
    expect(map.size).toBe(1);
    expect(map.get("o1")?.id).toBe("w_o1");
  });
});

describe("orderAssignee", () => {
  const nameOf = (uid?: string | null) => (uid === "m1" ? "Kusuma" : null);

  it("names the member from the assignment", () => {
    const who = orderAssignee(order("o1", "assigned"), index(work("o1", "in_progress", "m1")), nameOf);
    expect(who).toEqual({ uid: "m1", name: "Kusuma" });
  });

  // The order's own copy is a snapshot taken at assignment time; the assignment is current.
  it("prefers the assignment over the order's stored copy", () => {
    const o = order("o1", "assigned", { assignedTo: "old", assignedToName: "Old Name" } as Partial<Order>);
    const who = orderAssignee(o, index(work("o1", "assigned", "m1")), nameOf);
    expect(who.uid).toBe("m1");
    expect(who.name).toBe("Kusuma");
  });

  it("falls back to the name stored on the order when the member record is gone", () => {
    const o = order("o1", "assigned", { assignedTo: "ghost", assignedToName: "Left The Team" } as Partial<Order>);
    expect(orderAssignee(o, index(), nameOf).name).toBe("Left The Team");
  });

  it("has nobody for an unassigned order", () => {
    expect(orderAssignee(order("o1", "unassigned"), index(), nameOf)).toEqual({ uid: null, name: null });
  });
});

describe("the queue's columns", () => {
  it("offers the four states in the order work moves through them", () => {
    expect(ORDER_QUEUE_TABS.map(t => t.key)).toEqual(["unassigned", "assigned", "in_progress", "completed"]);
  });
});
