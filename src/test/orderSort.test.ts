import { describe, it, expect } from "vitest";
import { sortOrders, countOverdue, orderTakenMs, ORDER_SORT_OPTIONS } from "@/utils/orderSort";
import type { Order } from "@/types";

/**
 * The queue was hard-sorted newest-first, which is backwards for a work queue: the client who has
 * waited longest sinks to the bottom where nobody scrolls. These pin the three orders the tech
 * team actually works in.
 */

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 6, 25, 12, 0, 0);

const order = (id: string, takenHoursAgo: number, dueHoursFromNow?: number): Order => ({
  id,
  createdAt: { seconds: (NOW - takenHoursAgo * HOUR) / 1000 },
  promise: dueHoursFromNow === undefined ? null : { dueAt: { seconds: (NOW + dueHoursFromNow * HOUR) / 1000 } },
} as unknown as Order);

describe("orderTakenMs", () => {
  it("reads a Firestore seconds stamp", () => {
    expect(orderTakenMs(order("a", 2))).toBe(NOW - 2 * HOUR);
  });

  it("reads a Timestamp object with toMillis", () => {
    const o = { createdAt: { toMillis: () => 1234 } } as unknown as Order;
    expect(orderTakenMs(o)).toBe(1234);
  });

  it("is 0 when the stamp is missing, so sorting stays predictable", () => {
    expect(orderTakenMs({} as Order)).toBe(0);
  });
});

describe("sortOrders", () => {
  const oldest = order("oldest", 48);
  const middle = order("middle", 24);
  const newest = order("newest", 1);

  it("puts the longest wait first by default — first come, first served", () => {
    const out = sortOrders([newest, oldest, middle], "fcfs", NOW);
    expect(out.map(o => o.id)).toEqual(["oldest", "middle", "newest"]);
  });

  it("can still show the most recent sale first", () => {
    const out = sortOrders([oldest, newest, middle], "newest", NOW);
    expect(out.map(o => o.id)).toEqual(["newest", "middle", "oldest"]);
  });

  it("never mutates the caller's array — it comes from a live subscription", () => {
    const input = [newest, oldest];
    const before = input.map(o => o.id);
    sortOrders(input, "fcfs", NOW);
    expect(input.map(o => o.id)).toEqual(before);
  });

  describe("overdue first", () => {
    const veryLate = order("veryLate", 50, -20);
    const late = order("late", 10, -2);
    const dueSoon = order("dueSoon", 5, 1);
    const dueLater = order("dueLater", 6, 40);
    const noPromise = order("noPromise", 99);

    it("puts overdue jobs first, worst first", () => {
      const out = sortOrders([dueSoon, late, veryLate], "overdue", NOW);
      expect(out.map(o => o.id)).toEqual(["veryLate", "late", "dueSoon"]);
    });

    it("orders the still-in-time jobs by how soon they are due", () => {
      const out = sortOrders([dueLater, dueSoon], "overdue", NOW);
      expect(out.map(o => o.id)).toEqual(["dueSoon", "dueLater"]);
    });

    /**
     * An order with no promise is not "infinitely late" — it has no deadline at all, so it must not
     * outrank a job that is genuinely past its delivery time.
     */
    it("puts jobs with no promise last, not first", () => {
      const out = sortOrders([noPromise, late, dueSoon], "overdue", NOW);
      expect(out.map(o => o.id)).toEqual(["late", "dueSoon", "noPromise"]);
    });

    it("falls back to first-come between two jobs that both have no promise", () => {
      const a = order("a", 30);
      const b = order("b", 5);
      expect(sortOrders([b, a], "overdue", NOW).map(o => o.id)).toEqual(["a", "b"]);
    });
  });
});

describe("countOverdue", () => {
  it("counts only what is genuinely past its promised time", () => {
    const list = [order("late", 10, -1), order("soon", 2, 1), order("none", 3)];
    expect(countOverdue(list, NOW)).toBe(1);
  });

  it("is 0 for an empty queue", () => {
    expect(countOverdue([], NOW)).toBe(0);
  });
});

describe("the dropdown itself", () => {
  it("offers exactly the three ways of working, oldest-first leading", () => {
    expect(ORDER_SORT_OPTIONS.map(o => o.value)).toEqual(["fcfs", "newest", "overdue"]);
    expect(ORDER_SORT_OPTIONS[0].label).toMatch(/first come, first served/i);
  });
});
