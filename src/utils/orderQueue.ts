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

/** The assignments that fulfil orders, keyed by the order they belong to. */
export function assignmentsByOrderId(assignments: WorkAssignment[]): Map<string, WorkAssignment> {
  const map = new Map<string, WorkAssignment>();
  for (const a of assignments) {
    if (a.orderId) map.set(a.orderId, a);
  }
  return map;
}

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
