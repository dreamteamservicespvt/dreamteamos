/**
 * ONE definition of "an ad" and what stage it is at.
 *
 * The Orders queue and the Work Assign status board both showed a number called "Assigned", and
 * the two disagreed — because they were counting different things and using the same word for it.
 * Orders counted ORDERS; the board counted WORK ASSIGNMENTS. Those populations differ in four ways,
 * and two of them push the count in opposite directions, so neither number could be checked
 * against the other:
 *
 *  1. Work created straight from Work Assign has no order behind it. `createWorkAssignment` only
 *     writes `orderId` when there is a sale to link to, so a walk-in job is real work that the
 *     Orders queue has never heard of.
 *  2. The board scopes to members still on the team; Orders did not, so work left on a deactivated
 *     member still counted there.
 *  3. An order marked assigned whose assignment was deleted still reads as "assigned" to Orders,
 *     while the board sees no work at all.
 *  4. Verified and cancelled orders drop out of the Orders query entirely, but their assignments
 *     remain.
 *
 * So the unit is defined here, once: an AD is an order together with the work fulfilling it, or —
 * when there is no order — the assignment on its own. Every ad is counted exactly once, both
 * screens read from this, and the number means the same thing on each.
 */
import { orderQueueStatus, type OrderQueueStatus } from "./orderQueue";
import type { Order, WorkAssignment } from "@/types";

/** `verified` is a stage the Orders queue never shows, but the board does. */
export type AdStage = OrderQueueStatus | "verified";

export interface AdRecord {
  /** Stable id: the order's when there is one, otherwise the assignment's. */
  id: string;
  stage: AdStage;
  order?: Order;
  assignment?: WorkAssignment;
  /**
   * True when no order backs this — work created directly in Work Assign. These are the ads the
   * Orders queue legitimately cannot show, and the only reason the two screens can still differ.
   */
  standalone: boolean;
  memberUid: string | null;
}

export interface BuildAdPipelineOptions {
  /**
   * Restrict to work held by these members. Unassigned orders are always included — nobody holds
   * them yet, so they belong to whoever picks them up.
   *
   * A team leader passes their own team; the tech admin passes everyone still active, which is
   * what keeps a deactivated member's abandoned work out of both screens.
   */
  memberUids?: Set<string>;
}

/** The stage a lone assignment sits at, with `editing` treated as still being worked on. */
function stageOfAssignment(a: WorkAssignment): AdStage {
  if (a.status === "editing" || a.status === "in_progress") return "in_progress";
  if (a.status === "completed") return "completed";
  if (a.status === "verified") return "verified";
  return "assigned";
}

/**
 * Every ad, exactly once.
 *
 * Order-backed ads take their stage from the order joined to its assignment — the same call the
 * Orders queue makes — so the shared population can never drift between the two screens.
 */
export function buildAdPipeline(
  orders: Order[],
  assignments: WorkAssignment[],
  options: BuildAdPipelineOptions = {},
): AdRecord[] {
  const { memberUids } = options;

  const byOrderId = new Map<string, WorkAssignment>();
  for (const a of assignments) {
    if (a.orderId) byOrderId.set(a.orderId, a);
  }

  const records: AdRecord[] = [];
  const claimedOrderIds = new Set<string>();

  for (const order of orders) {
    if (order.deleted) continue;
    const assignment = byOrderId.get(order.id);
    const memberUid = assignment?.assignedTo || order.assignedTo || null;
    const stage = orderQueueStatus(order, byOrderId) as AdStage;

    /**
     * Someone else's work is not this board's business — but only when we actually KNOW whose it
     * is. An unassigned order belongs to whoever picks it up, and an order whose assignment has
     * vanished has no recorded owner at all; dropping either for being "out of scope" would hide
     * work that is genuinely stuck, which is how it stays stuck. Missing data must never make a
     * job invisible — only a known owner outside the team does.
     */
    if (memberUids && stage !== "unassigned" && memberUid && !memberUids.has(memberUid)) continue;

    claimedOrderIds.add(order.id);
    records.push({ id: order.id, stage, order, assignment, standalone: false, memberUid });
  }

  for (const a of assignments) {
    // Counted already as part of its order. An `orderId` pointing at an order we cannot see —
    // verified, cancelled, or outside this query — leaves the assignment to stand on its own,
    // which is right: it is still one real ad and must be counted once.
    if (a.orderId && claimedOrderIds.has(a.orderId)) continue;
    if (memberUids && !memberUids.has(a.assignedTo)) continue;

    records.push({
      id: a.id,
      stage: stageOfAssignment(a),
      assignment: a,
      standalone: true,
      memberUid: a.assignedTo ?? null,
    });
  }

  return records;
}

/** How many ads sit at each stage. */
export function countByStage(records: AdRecord[]): Record<AdStage, number> {
  const out: Record<AdStage, number> = {
    unassigned: 0, assigned: 0, in_progress: 0, completed: 0, verified: 0,
  };
  for (const r of records) out[r.stage] += 1;
  return out;
}

/**
 * The ads the Orders queue can show — the ones with a sale behind them.
 *
 * Exported so the difference between the two screens is a named thing rather than a mystery: any
 * gap between the board and Orders is exactly the standalone records, and can be shown as such.
 */
export function orderBacked(records: AdRecord[]): AdRecord[] {
  return records.filter((r) => !r.standalone);
}

export function standaloneCount(records: AdRecord[]): number {
  return records.filter((r) => r.standalone).length;
}
