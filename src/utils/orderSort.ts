/**
 * The order the tech team works the queue in.
 *
 * The queue used to be hard-sorted newest-first, which is the wrong default for a work queue: the
 * client who has been waiting longest sits at the bottom of the list where nobody scrolls, and the
 * one who bought five minutes ago gets picked up first. First-come-first-served is the fair
 * default, and the two other orders exist because both are real ways of working:
 *
 *   fcfs     — oldest sale first. Whoever waited longest is served first.
 *   newest   — the old behaviour, for when someone is looking for a sale they just took.
 *   overdue  — past the promised delivery time, worst first. What you sort by when catching up.
 */
import { promiseDueMs } from "./promiseSla";
import { isPinnedOrder } from "./orderProgress";
import type { Order } from "@/types";

export type OrderSortMode = "fcfs" | "newest" | "overdue";

export const ORDER_SORT_OPTIONS: { value: OrderSortMode; label: string }[] = [
  { value: "fcfs", label: "Oldest first (first come, first served)" },
  { value: "newest", label: "Newest first" },
  { value: "overdue", label: "Overdue first" },
];

/** When the sale was taken, in ms. 0 when the stamp is missing, so it sorts predictably. */
export function orderTakenMs(order: Order): number {
  const ts: any = order.createdAt;
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

/**
 * Sorts a copy of the list — the caller's array is left alone, since it usually comes straight
 * from a Firestore subscription that other views are reading too.
 *
 * Overdue mode puts everything past its promise first, most overdue at the top; everything still
 * within time follows in first-come order, and orders with no promise at all come last rather than
 * being treated as infinitely late.
 *
 * Ahead of all three modes sits a pin: an unfinished social-media month or bulk order stays at the
 * top until every counter is met. Those two run over days while single ads land and clear around
 * them, so on any ordinary sort they sink out of sight while still owing the client work.
 */
export function sortOrders(orders: Order[], mode: OrderSortMode, nowMs: number = Date.now()): Order[] {
  const within = (a: Order, b: Order): number => {
    if (mode === "newest") return orderTakenMs(b) - orderTakenMs(a);

    if (mode === "overdue") {
      const dueA = promiseDueMs(a.promise);
      const dueB = promiseDueMs(b.promise);
      const lateA = dueA > 0 && nowMs >= dueA;
      const lateB = dueB > 0 && nowMs >= dueB;
      if (lateA !== lateB) return lateA ? -1 : 1;
      // Both late: the one that blew its deadline earliest is the most overdue.
      if (lateA && lateB) return dueA - dueB;
      // Neither late: a job with a deadline outranks one with none, then soonest-due first.
      if ((dueA > 0) !== (dueB > 0)) return dueA > 0 ? -1 : 1;
      if (dueA > 0 && dueB > 0) return dueA - dueB;
      return orderTakenMs(a) - orderTakenMs(b);
    }

    return orderTakenMs(a) - orderTakenMs(b);
  };

  return [...orders].sort((a, b) => {
    const pinA = isPinnedOrder(a);
    const pinB = isPinnedOrder(b);
    if (pinA !== pinB) return pinA ? -1 : 1;
    return within(a, b);
  });
}

/** How many of these orders are past their promised delivery time — for the dropdown's badge. */
export function countOverdue(orders: Order[], nowMs: number = Date.now()): number {
  return orders.filter((o) => {
    const due = promiseDueMs(o.promise);
    return due > 0 && nowMs >= due;
  }).length;
}
