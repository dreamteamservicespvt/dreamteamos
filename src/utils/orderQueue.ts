/**
 * Where an order actually stands, as the tech team sees it.
 *
 * An order's own `status` only knows "assigned" — it has no idea whether the member has started.
 * That lives on the work assignment. So the queue's four columns are a JOIN, not a field: an order
 * is "in progress" when the assignment fulfilling it is being worked on.
 *
 * Without this the Orders page could only say "assigned", and an admin looking for the jobs that
 * are actually moving had to go to a different screen to find out.
 */
import type { Order, WorkAssignment } from "@/types";

export type OrderQueueStatus = "unassigned" | "assigned" | "in_progress" | "completed";

export const ORDER_QUEUE_TABS: { key: OrderQueueStatus; label: string }[] = [
  { key: "unassigned", label: "Not assigned" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
];

/**
 * All the assignments that fulfil orders, keyed by the order they belong to.
 *
 * This was one assignment per order, which held right up until a social-media month could be split
 * three ways — ad creation to one member, uploading and marketing to another. So it is a list now,
 * and `assignmentsByOrderId` below keeps returning a single assignment for the many call sites
 * that only ever want "who has this".
 */
export function allAssignmentsByOrderId(assignments: WorkAssignment[]): Map<string, WorkAssignment[]> {
  const map = new Map<string, WorkAssignment[]>();
  for (const a of assignments) {
    if (!a.orderId) continue;
    const list = map.get(a.orderId);
    if (list) list.push(a);
    else map.set(a.orderId, [a]);
  }
  return map;
}

/**
 * The single assignment that best represents an order's state.
 *
 * For a split order that is the one furthest from finished — a month is not "completed" because
 * the ad creator is done while the uploads have not started. Picking the least-advanced assignment
 * is what stops a partly-done month from disappearing out of the active queue.
 */
export function assignmentsByOrderId(assignments: WorkAssignment[]): Map<string, WorkAssignment> {
  const map = new Map<string, WorkAssignment>();
  for (const [orderId, list] of allAssignmentsByOrderId(assignments)) {
    map.set(orderId, list.reduce((least, a) => (WORK_RANK[a.status] < WORK_RANK[least.status] ? a : least)));
  }
  return map;
}

/** How far along a work status is. Lower is less advanced, so the minimum is the laggard. */
const WORK_RANK: Record<WorkAssignment["status"], number> = {
  assigned: 0, editing: 1, in_progress: 2, completed: 3, verified: 4,
};

/**
 * The column this order belongs in.
 *
 * `editing` counts as in progress: the work has come back for changes, so it is on someone's desk
 * rather than finished. An order marked assigned whose assignment has vanished falls back to
 * "assigned" — the order is still the truth about whether it has been handed out.
 */
export function orderQueueStatus(
  order: Order,
  byOrderId: Map<string, WorkAssignment>,
): OrderQueueStatus {
  if (order.status === "unassigned") return "unassigned";
  if (order.status === "completed" || order.status === "verified") return "completed";
  if (order.status !== "assigned") return "assigned";

  const work = byOrderId.get(order.id);
  if (!work) return "assigned";

  if (work.status === "in_progress" || work.status === "editing") return "in_progress";
  if (work.status === "completed" || work.status === "verified") return "completed";
  return "assigned";
}

/** Who is doing it. Prefers the assignment, which survives the order's copy going stale. */
export function orderAssignee(
  order: Order,
  byOrderId: Map<string, WorkAssignment>,
  nameOf: (uid?: string | null) => string | null,
): { uid: string | null; name: string | null } {
  const work = byOrderId.get(order.id);
  const uid = work?.assignedTo || order.assignedTo || null;
  return { uid, name: nameOf(uid) || order.assignedToName || null };
}
