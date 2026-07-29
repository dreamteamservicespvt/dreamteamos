import { describe, it, expect } from "vitest";
import { sortOrders } from "@/utils/orderSort";
import { assignmentsByOrderId, allAssignmentsByOrderId, orderQueueStatus } from "@/utils/orderQueue";
import type { Order, OrderProgress, WorkAssignment } from "@/types";

const HOUR = 3600_000;
const NOW = 1_800_000_000_000;

const order = (id: string, takenMs: number, progress?: OrderProgress | null): Order =>
  ({ id, createdAt: { seconds: takenMs / 1000 }, progress: progress ?? null, status: "unassigned" }) as unknown as Order;

const unfinished = (): OrderProgress => ({
  kind: "smm",
  targets: { ads: 8, posters: 8, posted: 8, campaigns: 8 },
  done: { ads: 2, posters: 0, posted: 0, campaigns: 0 },
  tracks: {}, completedTracks: [], log: [],
});

const finished = (): OrderProgress => ({ ...unfinished(), done: { ads: 8, posters: 8, posted: 8, campaigns: 8 } });

describe("multi-deliverable orders pin to the top", () => {
  const oldSingle = order("old-single", NOW - 40 * HOUR);
  const newSingle = order("new-single", NOW - 1 * HOUR);
  const month = order("month", NOW - 2 * HOUR, unfinished());

  it("pins ahead of first-come-first-served, even against an older order", () => {
    expect(sortOrders([oldSingle, newSingle, month], "fcfs", NOW).map((o) => o.id))
      .toEqual(["month", "old-single", "new-single"]);
  });

  it("pins ahead of newest-first", () => {
    expect(sortOrders([oldSingle, newSingle, month], "newest", NOW).map((o) => o.id))
      .toEqual(["month", "new-single", "old-single"]);
  });

  it("pins ahead of overdue, which would otherwise outrank everything", () => {
    const overdue = { ...order("overdue", NOW - 30 * HOUR), promise: { dueAt: { seconds: (NOW - HOUR) / 1000 } } } as unknown as Order;
    expect(sortOrders([overdue, month], "overdue", NOW).map((o) => o.id)).toEqual(["month", "overdue"]);
  });

  it("releases the pin once every counter is met", () => {
    // It stops jumping the queue and takes its ordinary first-come place — taken 2h ago, so
    // behind the 40h-old order and ahead of the 1h-old one.
    const done = order("month", NOW - 2 * HOUR, finished());
    expect(sortOrders([oldSingle, newSingle, done], "fcfs", NOW).map((o) => o.id))
      .toEqual(["old-single", "month", "new-single"]);
  });

  it("a released month no longer outranks a newer order under newest-first", () => {
    const done = order("month", NOW - 2 * HOUR, finished());
    expect(sortOrders([newSingle, done], "newest", NOW).map((o) => o.id)).toEqual(["new-single", "month"]);
  });

  it("keeps ordinary orders in their usual order among themselves", () => {
    expect(sortOrders([newSingle, oldSingle], "fcfs", NOW).map((o) => o.id))
      .toEqual(["old-single", "new-single"]);
  });

  it("orders two pinned jobs against each other by the same rule", () => {
    const older = order("older-month", NOW - 50 * HOUR, unfinished());
    expect(sortOrders([month, older], "fcfs", NOW).map((o) => o.id)).toEqual(["older-month", "month"]);
  });

  it("leaves the caller's array untouched", () => {
    const input = [oldSingle, month];
    sortOrders(input, "fcfs", NOW);
    expect(input.map((o) => o.id)).toEqual(["old-single", "month"]);
  });
});

describe("a split order's assignments", () => {
  const work = (id: string, orderId: string, status: WorkAssignment["status"]): WorkAssignment =>
    ({ id, orderId, status, assignedTo: `m-${id}` }) as unknown as WorkAssignment;

  it("collects every member working the same order", () => {
    const all = allAssignmentsByOrderId([
      work("w1", "month", "completed"),
      work("w2", "month", "assigned"),
      work("w3", "other", "assigned"),
    ]);
    expect(all.get("month")!.map((a) => a.id)).toEqual(["w1", "w2"]);
    expect(all.get("other")!).toHaveLength(1);
  });

  it("represents the order by whoever is furthest behind", () => {
    // Otherwise one member finishing early would report the whole month as delivered.
    const byId = assignmentsByOrderId([
      work("w1", "month", "completed"),
      work("w2", "month", "in_progress"),
    ]);
    expect(byId.get("month")!.id).toBe("w2");
  });

  it("only calls a split order completed when everyone is done", () => {
    const assigned = { id: "month", status: "assigned" } as unknown as Order;
    const partly = assignmentsByOrderId([work("w1", "month", "completed"), work("w2", "month", "assigned")]);
    expect(orderQueueStatus(assigned, partly)).toBe("assigned");

    const all = assignmentsByOrderId([work("w1", "month", "completed"), work("w2", "month", "verified")]);
    expect(orderQueueStatus(assigned, all)).toBe("completed");
  });

  it("still behaves as before for an ordinary one-assignment order", () => {
    const byId = assignmentsByOrderId([work("w1", "single", "in_progress")]);
    expect(byId.get("single")!.id).toBe("w1");
    expect(byId.size).toBe(1);
  });
});
