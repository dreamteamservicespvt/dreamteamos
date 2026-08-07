/**
 * A bulk order, as the individual videos it is actually made of.
 *
 * ── Why this exists next to `orderProgress` rather than inside it ─────────────────────────────
 * `orderProgress` counts deliverables: "5 of 8 ads". That is the right shape for a social-media
 * month, where the eight ads are interchangeable and one member owns the whole leg. A bulk order
 * is the opposite: ten videos shared out across the team, and the questions people actually ask
 * are "who has video 6", "which ones are still free" and "has Kiran finished hers". A counter
 * cannot answer any of those — so the team answered them on paper, and a video with nobody on it
 * was discovered at the deadline.
 *
 * So a bulk order carries a LIST, one entry per video, each with an owner and a status. The count
 * is then derived from the list rather than kept beside it, which is what stops the two disagreeing.
 *
 * ── Why nothing needs migrating ───────────────────────────────────────────────────────────────
 * Every bulk order already in the queue predates this list. `bulkVideosOf` builds one on demand
 * from the quantity the order was sold with, and seeds it from the existing `progress.done.ads`
 * count so an order that was half finished under the old model does not read as untouched. The
 * list is only written to Firestore the first time somebody actually assigns or completes a video.
 */
import { isBulkCategory } from "@/utils/serviceCatalog";
import type { AppUser, BulkVideoSlot, Order } from "@/types";

/** Is this an order whose work is a set of individually-owned videos? */
export function isBulkVideoOrder(order: Pick<Order, "category"> | null | undefined): boolean {
  return !!order && isBulkCategory(order.category || "");
}

/** How many videos this order owes. Falls back to the progress target, then to one. */
export function bulkVideoCount(order: Order): number {
  const q = Math.floor(Number(order.quantity) || 0);
  if (q > 0) return q;
  const target = order.progress?.targets?.ads || 0;
  return target > 0 ? target : 1;
}

/**
 * The videos of a bulk order, in order.
 *
 * When the order has no list yet, one is derived: `n` videos, the first `done.ads` of them marked
 * completed so an order part-finished under the counting model carries its progress across. The
 * derived list is not written anywhere — it is what the screens render until the first real
 * assignment, at which point `services/bulkVideos` persists it.
 */
export function bulkVideosOf(order: Order): BulkVideoSlot[] {
  const total = bulkVideoCount(order);
  const stored = Array.isArray(order.bulkVideos) ? order.bulkVideos : null;

  if (stored && stored.length > 0) {
    // Trust the stored list, but keep it the right length: a quantity corrected upwards after the
    // fact must not leave the extra videos invisible, and one corrected down must not leave
    // phantom slots nobody owes. Existing entries are never rewritten.
    const byNumber = new Map(stored.map((s) => [s.n, s]));
    return Array.from({ length: total }, (_, i) => byNumber.get(i + 1) ?? blankSlot(i + 1));
  }

  const alreadyDone = Math.min(total, Math.max(0, order.progress?.done?.ads || 0));
  return Array.from({ length: total }, (_, i) => (
    i < alreadyDone
      ? { n: i + 1, status: "completed" as const, completedByName: null }
      : blankSlot(i + 1)
  ));
}

function blankSlot(n: number): BulkVideoSlot {
  return { n, status: "pending" };
}

export interface BulkVideoStats {
  total: number;
  /** Has an owner and is not finished — work in somebody's hands right now. */
  assigned: number;
  completed: number;
  /** Nobody on it yet. This is the number that matters: unassigned work is invisible work. */
  unassigned: number;
  /** Everything not yet finished, assigned or not — what the client is still waiting for. */
  pending: number;
  percent: number;
}

/** The five numbers every bulk screen shows, derived from the list so they cannot disagree. */
export function bulkVideoStats(slots: BulkVideoSlot[]): BulkVideoStats {
  const total = slots.length;
  const completed = slots.filter((s) => s.status === "completed").length;
  const assigned = slots.filter((s) => s.status !== "completed" && !!s.assignedTo).length;
  const unassigned = total - completed - assigned;
  return {
    total,
    assigned,
    completed,
    unassigned,
    pending: total - completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/** The same, straight from an order. */
export function bulkStatsOf(order: Order): BulkVideoStats {
  return bulkVideoStats(bulkVideosOf(order));
}

/** Every video of this order that belongs to one person. */
export function slotsForMember(slots: BulkVideoSlot[], uid: string | undefined): BulkVideoSlot[] {
  if (!uid) return [];
  return slots.filter((s) => s.assignedTo === uid);
}

export interface MemberBulkProgress {
  uid: string;
  name: string;
  assigned: number;
  completed: number;
  pending: number;
  percent: number;
}

/**
 * How each member is doing across a set of videos — busiest first, then whoever has most left.
 *
 * Ordered this way because the question it answers is "who do I give the next one to", and the
 * person at the bottom of this list is the answer.
 */
export function memberProgress(slots: BulkVideoSlot[]): MemberBulkProgress[] {
  const by = new Map<string, MemberBulkProgress>();
  for (const s of slots) {
    if (!s.assignedTo) continue;
    const row = by.get(s.assignedTo) || {
      uid: s.assignedTo,
      name: s.assignedToName || "Member",
      assigned: 0,
      completed: 0,
      pending: 0,
      percent: 0,
    };
    row.assigned += 1;
    if (s.status === "completed") row.completed += 1;
    by.set(s.assignedTo, row);
  }
  return Array.from(by.values())
    .map((r) => ({ ...r, pending: r.assigned - r.completed, percent: Math.round((r.completed / r.assigned) * 100) }))
    .sort((a, b) => b.pending - a.pending || b.assigned - a.assigned);
}

/** Member progress across MANY orders — the team view on the Bulk Video Orders section. */
export function memberProgressAcross(orders: Order[]): MemberBulkProgress[] {
  return memberProgress(orders.flatMap(bulkVideosOf));
}

export interface ClientBulkProgress {
  order: Order;
  clientName: string;
  stats: BulkVideoStats;
  members: MemberBulkProgress[];
}

/**
 * Client-wise progress, the unfinished first.
 *
 * A finished order is a record; an unfinished one is a job. Sorting by "least complete" puts the
 * client furthest from delivery at the top, which is the one somebody has to do something about.
 */
export function clientProgress(orders: Order[]): ClientBulkProgress[] {
  return orders
    .map((order) => {
      const slots = bulkVideosOf(order);
      return {
        order,
        clientName: order.businessName || order.clientName || "Client",
        stats: bulkVideoStats(slots),
        members: memberProgress(slots),
      };
    })
    .sort((a, b) => {
      const aDone = a.stats.percent >= 100;
      const bDone = b.stats.percent >= 100;
      if (aDone !== bDone) return aDone ? 1 : -1;
      // Then the one with most still to make — the biggest outstanding commitment.
      return b.stats.pending - a.stats.pending;
    });
}

/** Totals across every bulk order on screen, for the headline row. */
export function totalBulkStats(orders: Order[]): BulkVideoStats {
  return bulkVideoStats(orders.flatMap(bulkVideosOf));
}

/**
 * Who may hand videos out: the two admins and the team leader.
 *
 * A member cannot assign — including to themselves. Bulk work is shared out deliberately, and
 * self-service picking is how the easy videos go first and the awkward ones are left for whoever
 * looks last.
 */
export function canAssignBulkVideos(role: string | undefined): boolean {
  return role === "tech_admin" || role === "main_admin" || role === "tech_team_leader";
}

/**
 * Who may tick a video off: whoever it belongs to, plus the people who hand them out.
 *
 * The owner, because they are the one who made it. The admins and leader, because a member on
 * leave with two videos finished and unticked must not block the whole order.
 */
export function canCompleteBulkVideo(
  slot: BulkVideoSlot,
  user: Pick<AppUser, "uid" | "role"> | null | undefined,
): boolean {
  if (!user) return false;
  if (canAssignBulkVideos(user.role)) return true;
  return !!slot.assignedTo && slot.assignedTo === user.uid;
}

/** "3 of 10 done · 4 with the team · 3 unassigned" — one line for a card. */
export function bulkSummary(stats: BulkVideoStats): string {
  const parts = [`${stats.completed} of ${stats.total} done`];
  if (stats.assigned > 0) parts.push(`${stats.assigned} with the team`);
  if (stats.unassigned > 0) parts.push(`${stats.unassigned} unassigned`);
  return parts.join(" · ");
}
