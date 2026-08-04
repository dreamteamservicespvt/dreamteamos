/**
 * Orders service — the sales → tech delivery pipeline.
 *
 * An Order is created when a sales admin VERIFIES a sale (replacing the manual WhatsApp "sale"
 * label). The tech team picks orders from the queue and assigns them as `work_assignments`,
 * carrying the business info + delivery promise forward so nothing is re-typed.
 *
 * Quota notes: orders are a small, bounded working set (one per verified-sale-needing-delivery,
 * resolved when delivered). The queue subscribes to ACTIVE orders only via a scoped `in` query.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch,
  orderBy, limit, serverTimestamp, Timestamp, arrayUnion, type Query, type DocumentData,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { logTechActivity, type ActivityActor } from "@/services/activityLog";
import { normalizePhone, phoneLockId } from "@/utils/phone";
import { isAdCategory } from "@/utils/serviceCatalog";
import { promiseDueMs, deadlineState } from "@/utils/promiseSla";
import { initialProgress, isProgressComplete, isTrackComplete, TRACK_FIELDS } from "@/utils/orderProgress";
import { penaltyAmount, totalPenalties } from "@/utils/penalty";
import type {
  AppUser, Lead, Order, OrderProgress, OrderProgressField, OrderTrack, OrderUpdateNote,
  PenaltyClipType, PenaltyEntry, SaleDetail, WorkAssignment,
} from "@/types";

const ACTIVE_ORDER_STATUSES = ["unassigned", "assigned", "completed"] as const;

function tsToMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

/**
 * Deterministic order doc id, stable across `saleItems` index shifts.
 * Prefers the sale's `submittedAt` (set once at sale time, never changes); falls back to the
 * leadId+index key for legacy items with no submittedAt.
 */
export function orderDocId(leadId: string, item: SaleDetail, itemIndex: number): string {
  const subMs = tsToMs(item.submittedAt);
  return subMs ? `o_${leadId}_${subMs}` : `o_${leadId}__${itemIndex}`;
}

/** Sequential, readable work id (W001 / P002 / C003 / O004) — mirrors the WorkAssign convention. */
export function nextWorkUniqueId(category: string, existing: WorkAssignment[]): string {
  const prefix = category === "wishes" ? "W" : category === "promotional" ? "P" : category === "cinematic" ? "C" : "O";
  const same = existing.filter((a) => a.uniqueId?.startsWith(prefix));
  const max = same.reduce((m, a) => {
    const n = parseInt(a.uniqueId?.slice(1) || "0", 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/**
 * Create (or refresh) the Order for a just-verified sale item. Idempotent: re-verifying the same
 * sale never duplicates, and an order that progressed past "unassigned" keeps its lifecycle.
 * Never throws — the sales-approval flow must not break if this fails.
 */
export async function upsertOrderForSale(params: {
  lead: Lead;
  item: SaleDetail;
  itemIndex: number;
  soldByName: string;
  /** The sales admin who owns this order for client-visibility. Defaults to `verifierUid`. */
  salesAdminId?: string | null;
  /** The verifying sales admin, when this fires on approval. Absent when it fires at sale time. */
  verifierUid?: string | null;
  /** True when a sales admin has approved the sale. Sale-time creation passes false. */
  saleVerified?: boolean;
}): Promise<void> {
  const { lead, item, itemIndex, soldByName } = params;
  const salesAdminId = params.salesAdminId ?? params.verifierUid ?? null;
  try {
    const id = orderDocId(lead.id, item, itemIndex);
    const ref = doc(db, "orders", id);
    const phone = normalizePhone(lead.phone);
    const saleFields = {
      clientPhone: phone,
      clientPhoneId: phoneLockId(lead.phone),
      // The business this ad is FOR — taken from what the sales member typed on this sale, not
      // from the lead. The lead name is the *client*, and one client can order ads for several
      // different businesses, so only the per-sale business name is meaningful to the tech team.
      businessName: item.requirement?.businessName?.trim() || lead.realName || lead.displayName || "",
      // The client behind the sale, kept alongside so the queue can show both when they differ.
      clientName: lead.realName || lead.displayName || "",
      category: item.category,
      packageKey: item.packageKey || "custom",
      customDescription: item.customDescription ?? null,
      amount: item.amount || 0,
      // Bulk videos — which kind, how many, at what unit price, and whether the member moved the
      // discount. The tech side needs the kind and the count to know what the job actually is;
      // the two admins need the rest.
      quantity: item.quantity ?? null,
      bulkAdType: item.bulkAdType ?? null,
      unitAmount: item.unitAmount ?? null,
      suggestedDiscountPercent: item.suggestedDiscountPercent ?? null,
      discountMode: item.discountMode ?? null,
      discountAmount: item.discountAmount ?? null,
      discountPercent: item.discountPercent ?? null,
      discountEdited: item.discountEdited ?? false,
      leadId: lead.id,
      saleItemIndex: itemIndex,
      saleItemKey: `${lead.id}__${itemIndex}`,
      saleSubmittedAtMs: tsToMs(item.submittedAt),
      soldBy: lead.assignedTo,
      soldByName,
      fromAd: isAdCategory(item.category),
      salesAdminId,
      promise: item.promise ?? null,
      // The client's ad brief, captured at sale time — pre-fills New Assignment for the tech team.
      requirement: item.requirement ?? null,
      updatedAt: serverTimestamp(),
    };

    // What this order still owes, for the two kinds that owe more than a single ad.
    const progress = initialProgress({
      category: item.category,
      packageKey: item.packageKey,
      quantity: item.quantity,
      bulkAdType: item.bulkAdType,
    });

    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data() as Order;
      // An order an admin permanently deleted stays deleted — never resurrect it from the sale.
      if (existing.deleted || existing.status === "deleted") return;
      // Reactivate a previously-cancelled order (reject → re-verify); keep any active/assigned state.
      const statusPatch = existing.status === "cancelled" ? { status: "unassigned" as const } : {};
      // saleVerified only ever moves false → true — a later sale-time refresh must not un-verify it.
      const verifiedPatch = params.saleVerified || existing.saleVerified ? { saleVerified: true } : {};
      /**
       * Progress is seeded, never re-seeded. This runs again on every sale edit, and rewriting it
       * would reset counters the tech team had spent a fortnight filling in — so an order that
       * already has progress keeps exactly what it has, and only one that has none (a sale edited
       * INTO a bulk or monthly category) gets it now.
       */
      const progressPatch = !existing.progress && progress ? { progress } : {};
      await updateDoc(ref, { ...saleFields, ...statusPatch, ...verifiedPatch, ...progressPatch });
    } else {
      await setDoc(ref, {
        ...saleFields,
        status: "unassigned",
        saleVerified: !!params.saleVerified,
        progress,
        penalties: [],
        penaltyTotal: 0,
        penaltyClips: 0,
        workAssignmentId: null,
        assignedTo: null,
        assignedToName: null,
        techAdminId: null,
        lastDeadlineNotifiedAt: null,
        createdAt: serverTimestamp(),
        completedAt: null,
        verifiedAt: null,
        deliveredAmount: null,
      });
    }
  } catch (err) {
    console.error("[orders] upsertOrderForSale failed:", err);
  }
}

/**
 * Append a sales member's update note to an assigned order and tell the people doing the work.
 *
 * Once an order is assigned, work has started — the sale can no longer be edited or deleted freely,
 * so this is how the sales member passes on a change the client asked for. Never throws.
 */
export async function addOrderUpdateNote(params: {
  order: Order;
  text: string;
  byName: string;
}): Promise<void> {
  const { order, text, byName } = params;
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    const note: OrderUpdateNote = { at: Timestamp.now(), byName, text: trimmed };
    await updateDoc(doc(db, "orders", order.id), {
      updateNotes: arrayUnion(note),
      updatedAt: serverTimestamp(),
    });
    const recipients = [order.assignedTo, order.techAdminId].filter((u): u is string => !!u);
    for (const userId of Array.from(new Set(recipients))) {
      await sendNotification({
        userId,
        type: "order_update_note",
        title: "Client update on an order",
        message: `${byName} added a note for "${order.businessName || "an order"}": ${trimmed}`,
        link: "/tech/my-work",
      });
    }
  } catch (err) {
    console.error("[orders] addOrderUpdateNote failed:", err);
  }
}

/**
 * An order's source sale left "verified" (rejected / revoked / deleted). Remove it from the tech
 * queue: delete if still unassigned, otherwise mark cancelled and notify the tech admin.
 * Never throws.
 */
export async function cancelOrderForSale(params: {
  leadId: string;
  item: SaleDetail;
  itemIndex: number;
  /**
   * Set when a sales member deleted the sale outright (rather than an admin rejecting it). Work
   * already assigned is flagged instead of disappearing, so the tech side finds out.
   */
  deletedByName?: string | null;
}): Promise<void> {
  const { leadId, item, itemIndex, deletedByName } = params;
  try {
    const id = orderDocId(leadId, item, itemIndex);
    const ref = doc(db, "orders", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const order = { id: snap.id, ...snap.data() } as Order;
    // A permanently-deleted order stays deleted — the sale going away doesn't revive it.
    if (order.deleted || order.status === "deleted" || order.status === "cancelled") return;

    // Nothing has started yet: the order can simply go.
    if (order.status === "unassigned") {
      await deleteDoc(ref);
      return;
    }

    // Work is already out with a member. Cancel the order, but make the reason loud: flag the
    // work assignment itself and tell the people holding it, so nobody keeps building a dead ad.
    await updateDoc(ref, {
      status: "cancelled",
      ...(deletedByName ? { saleDeleted: true, saleDeletedByName: deletedByName, saleDeletedAt: Timestamp.now() } : {}),
      updatedAt: serverTimestamp(),
    });

    if (order.workAssignmentId && deletedByName) {
      try {
        await updateDoc(doc(db, "work_assignments", order.workAssignmentId), {
          saleDeleted: true,
          saleDeletedByName: deletedByName,
          saleDeletedAt: Timestamp.now(),
        });
      } catch { /* the order is already flagged; a missing work doc is not fatal */ }
    }

    const business = order.businessName || "a client";
    const recipients = [order.assignedTo, order.techAdminId].filter((u): u is string => !!u);
    for (const userId of Array.from(new Set(recipients))) {
      await sendNotification({
        userId,
        type: "order_cancelled",
        title: deletedByName ? "Sale deleted — stop this work" : "Order Cancelled",
        message: deletedByName
          ? `${deletedByName} deleted the sale for "${business}". The work assigned for it is no longer needed — check before continuing.`
          : `The sale for "${business}" was reverted — its order/work was cancelled.`,
        link: "/tech/my-work",
      });
    }
  } catch (err) {
    console.error("[orders] cancelOrderForSale failed:", err);
  }
}

/** Mark an order's work as completed by the member (before tech verification). Never throws. */
export async function markOrderCompleted(orderId: string): Promise<void> {
  try {
    const ref = doc(db, "orders", orderId);
    const snap = await getDoc(ref);
    // A deleted order stays deleted — completing its (orphaned) work must not resurrect it.
    if (snap.exists() && ((snap.data() as Order).deleted || (snap.data() as Order).status === "deleted")) return;
    await updateDoc(ref, {
      status: "completed",
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[orders] markOrderCompleted failed:", err);
  }
}

/**
 * Send an order's work back to "in progress" (member undid completion, or admin sent it back for
 * edits). Only affects already-delivered states so the order re-enters the active queue and its
 * deadline alerts resume. Re-verification is idempotent, so reverting a verified order is safe.
 * Never throws.
 */
export async function revertOrderToAssigned(orderId: string): Promise<void> {
  try {
    const ref = doc(db, "orders", orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const status = (snap.data() as Order).status;
    if (status !== "completed" && status !== "verified") return;
    await updateDoc(ref, { status: "assigned", completedAt: null, updatedAt: serverTimestamp() });
  } catch (err) {
    console.error("[orders] revertOrderToAssigned failed:", err);
  }
}

/**
 * The unassigned order for a client's number, if one is waiting.
 *
 * The tech team often assigns work straight from Work Assign instead of picking the order out of
 * the queue. Without this, the sale's order sat in "unassigned" forever while the work was already
 * being done. Matching on the client's phone number lets a manual assignment adopt its order, so
 * both sides stay in step. Prefers an order of the same category; otherwise takes the oldest one.
 * Never throws.
 */
export async function findUnassignedOrderForPhone(phone: string, category?: string): Promise<Order | null> {
  const phoneId = phoneLockId(phone);
  if (!phoneId) return null;
  try {
    const snap = await getDocs(query(
      collection(db, "orders"),
      where("clientPhoneId", "==", phoneId),
      where("status", "==", "unassigned"),
    ));
    const candidates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Order))
      .filter((o) => !o.deleted && !o.workAssignmentId)
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    if (candidates.length === 0) return null;
    return candidates.find((o) => o.category === category) ?? candidates[0];
  } catch (err) {
    console.error("[orders] findUnassignedOrderForPhone failed:", err);
    return null;
  }
}

/** One-off fetch of a single order — used when Work Assign opens from the Orders queue. */
export async function fetchOrder(orderId: string): Promise<Order | null> {
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Order) : null;
  } catch (err) {
    console.error("[orders] fetchOrder failed:", err);
    return null;
  }
}

/**
 * Send an assigned order back to the unassigned queue — the tech team deleted its work assignment,
 * so the sale is un-delivered but not lost. Clears the assignment links; the order can be picked
 * up again (or, once back in "unassigned", deleted by the sales member). Never throws.
 */
export async function revertOrderToUnassigned(orderId: string): Promise<void> {
  try {
    const ref = doc(db, "orders", orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const status = (snap.data() as Order).status;
    // "deleted" included: a purged order must never be flipped back into the queue.
    if (status === "unassigned" || status === "cancelled" || status === "verified" || status === "deleted") return;
    await updateDoc(ref, {
      status: "unassigned",
      workAssignmentId: null,
      assignedTo: null,
      assignedToName: null,
      techAdminId: null,
      completedAt: null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[orders] revertOrderToUnassigned failed:", err);
  }
}

/**
 * The unassigned orders that are really duplicates of work the tech team already did by hand.
 *
 * Before the sales→orders pipeline existed, tech members were assigned ad work directly in Work
 * Assign. Those sales still generate an order, so the queue fills with entries for jobs that are
 * already being handled outside it. An order is "already handled" when a work assignment exists
 * for the same client number and category that this order didn't create. Pure, so it can be
 * previewed and tested before anything is written.
 */
export function findReconcilableOrders(orders: Order[], assignments: WorkAssignment[]): Order[] {
  const digits = (v?: string | null) => (v ? normalizePhone(v).replace(/\D/g, "") : "");
  const DAY_MS = 24 * 60 * 60 * 1000;
  /** Work can predate its order slightly (the sale was recorded after the job went out). */
  const GRACE_MS = 7 * DAY_MS;

  const assignedMs = (a: WorkAssignment): number => {
    const stamp = (a.assignedAt as { seconds?: number } | undefined)?.seconds;
    if (stamp) return stamp * 1000;
    const day = a.date || a.assignedAtIso?.slice(0, 10);
    const parsed = day ? Date.parse(`${day}T12:00:00`) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // Candidate work, grouped by "phone|category" and oldest first, each usable only once.
  const pool = new Map<string, { ms: number; used: boolean }[]>();
  for (const a of assignments) {
    const d = digits(a.businessWhatsapp);
    if (!d) continue;
    const key = `${d}|${a.category}`;
    const list = pool.get(key);
    const entry = { ms: assignedMs(a), used: false };
    if (list) list.push(entry);
    else pool.set(key, [entry]);
  }
  for (const list of pool.values()) list.sort((x, y) => x.ms - y.ms);

  return orders
    // An order somebody deliberately put back is never swept again — otherwise "restore" and
    // "clean up already-done" fight each other and the sweep always wins.
    .filter((o) => o.status === "unassigned" && !o.workAssignmentId && !o.deleted && !o.restoredAt)
    // Oldest order first, so the oldest matching job is claimed by the oldest order.
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .filter((o) => {
      const d = digits(o.clientPhone);
      if (!d) return false;
      const list = pool.get(`${d}|${o.category}`);
      if (!list) return false;

      // The job must plausibly BE this sale's job: not one from long before the sale existed.
      // Without this, a repeat client's brand-new order matched the ad we did for them months
      // ago and was swept out of the queue as "already done".
      const orderMs = (o.createdAt?.seconds || 0) * 1000;
      const earliest = orderMs ? orderMs - GRACE_MS : Number.NEGATIVE_INFINITY;

      // One job can only account for one order — two sales need two jobs.
      const match = list.find((w) => !w.used && w.ms >= earliest);
      if (!match) return false;
      match.used = true;
      return true;
    });
}

/**
 * Retire the reconcilable orders in one batched write — they leave the active queue (status
 * "verified" drops out of `activeOrdersQuery`) and are flagged so a later re-verify won't revive
 * them. Returns how many were retired.
 */
export async function reconcileManualOrders(orders: Order[], actor?: ActivityActor | null): Promise<number> {
  const BATCH_LIMIT = 400;
  let batch = writeBatch(db);
  let n = 0;
  let total = 0;
  for (const o of orders) {
    batch.update(doc(db, "orders", o.id), {
      status: "verified",
      reconciledManually: true,
      // Who swept it, so "why is this order not in the queue?" has an answer on the order itself.
      ...(actor ? { retiredBy: actor.uid, retiredByName: actor.name } : {}),
      retiredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    n += 1;
    total += 1;
    if (n >= BATCH_LIMIT) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n > 0) await batch.commit();
  await logTechActivity({
    actor, action: "cleaned_up_orders",
    details: { count: total, orders: summariseOrders(orders) },
  });
  return total;
}

/** The few fields that make a log line readable a month later, without copying the whole doc. */
function summariseOrders(orders: Order[]): { id: string; businessName: string; category: string; amount: number }[] {
  return orders.slice(0, 25).map((o) => ({
    id: o.id,
    businessName: o.businessName || o.clientName || "",
    category: o.category,
    amount: o.amount || 0,
  }));
}

/**
 * Permanently delete orders by id, in batches. Returns how many were deleted.
 *
 * This is a *tombstone*, not a hard delete. A hard-deleted order left no trace, so the next time
 * the sale was touched (a re-verify, an edit) `upsertOrderForSale` saw "no doc" and recreated it —
 * the "ghost" orders that kept coming back. Marking the doc `deleted` instead means the order drops
 * out of the active queue AND the recreation paths recognise it and leave it dead.
 *
 * The actor is recorded because this is destructive and silent: the SALE survives a deleted order,
 * so a client who has paid can end up with nothing to deliver and no trace of who decided that.
 */
export async function deleteOrders(orders: Order[], actor?: ActivityActor | null): Promise<number> {
  const BATCH_LIMIT = 400;
  let batch = writeBatch(db);
  let n = 0;
  let total = 0;
  for (const o of orders) {
    batch.update(doc(db, "orders", o.id), {
      status: "deleted",
      deleted: true,
      deletedAt: serverTimestamp(),
      ...(actor ? { deletedBy: actor.uid, deletedByName: actor.name || "" } : {}),
      // Cut the link so a deleted order's work can't later flip it back to a live status.
      workAssignmentId: null,
      updatedAt: serverTimestamp(),
    });
    n += 1;
    total += 1;
    if (n >= BATCH_LIMIT) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n > 0) await batch.commit();
  await logTechActivity({
    actor, action: "deleted_orders",
    details: { count: total, orders: summariseOrders(orders) },
  });
  return total;
}

/**
 * Put removed orders back in the queue — the undo for a delete or a "clean up already-done" sweep.
 *
 * Both of those are one click and neither could be taken back, which is how three paid-for sales
 * became one deliverable job with nobody able to say what happened to the other two. Restoring
 * clears every flag that keeps an order out of the queue AND out of `upsertOrderForSale`'s
 * recreation path, so the order behaves exactly like a fresh unassigned one.
 *
 * Deliberately NOT offered for an order that was genuinely delivered: that work is done, and
 * pushing it back into "not assigned" would ask the team to build the same ad twice.
 */
export async function restoreOrders(orders: Order[], actor?: ActivityActor | null): Promise<number> {
  const BATCH_LIMIT = 400;
  let batch = writeBatch(db);
  let n = 0;
  let total = 0;
  for (const o of orders) {
    batch.update(doc(db, "orders", o.id), {
      status: "unassigned",
      deleted: false,
      deletedAt: null,
      deletedBy: null,
      deletedByName: null,
      reconciledManually: false,
      retiredAt: null,
      retiredBy: null,
      retiredByName: null,
      // A restored order is nobody's yet — it goes back to the front of the queue, not to whoever
      // happened to hold it before it was removed.
      workAssignmentId: null,
      assignedTo: null,
      assignedToName: null,
      techAdminId: null,
      completedAt: null,
      ...(actor ? { restoredBy: actor.uid, restoredByName: actor.name || "" } : {}),
      restoredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    n += 1;
    total += 1;
    if (n >= BATCH_LIMIT) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n > 0) await batch.commit();
  await logTechActivity({
    actor, action: "restored_orders",
    details: { count: total, orders: summariseOrders(orders) },
  });
  return total;
}

/** Scoped query for the tech Orders queue — ACTIVE orders only (verified/cancelled drop out). */
export function activeOrdersQuery(): Query<DocumentData> {
  return query(collection(db, "orders"), where("status", "in", [...ACTIVE_ORDER_STATUSES]));
}

/** How many past orders one page of history pulls. */
export const ORDER_HISTORY_PAGE = 300;

/**
 * The orders that have LEFT the queue — delivered, swept as already-done, or deleted.
 *
 * Ordered by `updatedAt` rather than filtered by status, for two reasons. Firestore would need a
 * composite index for `status == x` + `orderBy(createdAt)`, which is a deploy nobody can do from
 * inside the app; and "most recently changed" is the right window anyway — the question this
 * answers is "what happened to the order I was just looking for", not "list everything ever sold".
 *
 * Not a live subscription and not loaded with the page: history is only fetched when someone opens
 * a history tab, so the daily read budget still goes on the ~40 orders that are actually in play.
 */
export async function fetchOrderHistory(
  max: number = ORDER_HISTORY_PAGE,
): Promise<{ rows: Order[]; scanned: number }> {
  try {
    const snap = await getDocs(query(
      collection(db, "orders"),
      orderBy("updatedAt", "desc"),
      limit(max),
    ));
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Order))
      .filter((o) => !(ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status));
    // `scanned` is orders read, not rows returned — the caller needs it to know whether asking for
    // more would find anything, which the filtered count cannot tell it.
    return { rows, scanned: snap.size };
  } catch (err) {
    console.error("[orders] fetchOrderHistory failed:", err);
    return { rows: [], scanned: 0 };
  }
}

/**
 * Why an order is no longer in the queue — the one thing the queue could never tell anyone.
 *
 * "verified" covers both work that was delivered and verified AND the backlog that the "clean up
 * already-done" button retired, which are very different facts about a sale. They are separated
 * here by the flag that sweep leaves behind.
 */
export type OrderExitReason = "delivered" | "swept" | "deleted" | "cancelled";

export function orderExitReason(order: Order): OrderExitReason | null {
  if (order.deleted || order.status === "deleted") return "deleted";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "verified") return order.reconciledManually ? "swept" : "delivered";
  return null;
}

/** A swept or deleted order can come back; delivered work cannot be un-delivered. */
export function isRestorableOrder(order: Order): boolean {
  const reason = orderExitReason(order);
  return reason === "deleted" || reason === "swept" || reason === "cancelled";
}

/**
 * On-open deadline sweep (no Blaze cron in Phase 1): from the already-loaded orders, notify whoever
 * is CURRENTLY doing each still-outstanding order that is near/overdue. Throttled via
 * `lastDeadlineNotifiedAt`. Fire-and-forget.
 *
 * ── Why this needs the work assignments, not just the orders ──────────────────────────────────
 * An order carries its own copy of who it went to and whether it is done, and both copies go stale:
 *
 *   • `assignedTo` is written once when the order is handed out and is NOT rewritten when an admin
 *     moves the job to someone else. Reading it sent "your delivery is overdue" to a member who had
 *     not had that job for days, while the person actually doing it heard nothing. (utils/orderQueue
 *     already knew this — `orderAssignee` prefers the assignment for exactly this reason.)
 *   • `status` stays "assigned" whenever `markOrderCompleted` could not run — the work had no order
 *     linked to it when it was completed, or the write failed. The work is finished; the order does
 *     not know, and keeps chasing it.
 *
 * The work assignment is the truth on both counts, so the sweep now joins to it: no alert is ever
 * sent for work that is already delivered, and the one that is sent goes to the person holding it.
 */
export async function notifyDueOrdersOnOpen(
  orders: Order[],
  assignments: WorkAssignment[] = [],
  now: number = Date.now(),
): Promise<void> {
  const THROTTLE_MS = 6 * 60 * 60 * 1000;
  const byOrderId = new Map<string, WorkAssignment>();
  for (const a of assignments) if (a.orderId) byOrderId.set(a.orderId, a);

  for (const order of orders) {
    if (order.status !== "assigned" || !order.promise) continue;

    const work = byOrderId.get(order.id);
    // Delivered work is never late, whatever the order still says.
    if (work && (work.status === "completed" || work.status === "verified")) continue;

    // The member holding it now. The assignment wins; the order's copy is only a fallback for
    // orders whose work record hasn't loaded (or predates the link).
    const assignee = work?.assignedTo || order.assignedTo;
    if (!assignee) continue;

    const state = deadlineState(promiseDueMs(order.promise), now);
    if (state === "ok") continue;
    const lastMs = tsToMs(order.lastDeadlineNotifiedAt);
    if (lastMs && now - lastMs < THROTTLE_MS) continue;
    try {
      await sendNotification({
        userId: assignee,
        type: "work_deadline",
        title: state === "overdue" ? "Delivery overdue" : "Delivery due soon",
        message: `"${order.businessName || "Client work"}" is ${state === "overdue" ? "past its" : "near its"} ${order.promise.label} promise. Please deliver.`,
        // One alert per order per state per recipient: whoever opens the queue next re-runs this
        // sweep, and without a key every admin who opened the page added another row.
        dedupeKey: `work_deadline_${order.id}_${state}_${assignee}`,
      });
      await updateDoc(doc(db, "orders", order.id), { lastDeadlineNotifiedAt: serverTimestamp() });
    } catch (err) {
      console.error("[orders] deadline notify failed:", err);
    }
  }
}

// ─── Multi-deliverable progress (social media month / bulk ads) ───────────────────────────────

/** Everyone who should hear about a change on this order, deduped, minus whoever made it. */
function progressAudience(order: Order, actorUid: string): string[] {
  const tracked = Object.values(order.progress?.tracks || {}).map((a) => a?.uid);
  return Array.from(new Set([...tracked, order.assignedTo, order.techAdminId]))
    .filter((u): u is string => !!u && u !== actorUid);
}

/**
 * Move one counter on an order.
 *
 * Written as an absolute value rather than an increment because two people can be looking at the
 * same month at once, and "set it to 5" from a screen showing 4 is a mistake that corrects itself
 * on the next render — whereas two "+1"s from the same stale 4 silently becomes 6.
 *
 * The whole progress object is rewritten in one update so `done`, the log and the completion stamp
 * can never disagree with each other.
 */
export async function updateOrderProgress(params: {
  order: Order;
  field: OrderProgressField;
  value: number;
  actor: Pick<AppUser, "uid" | "name">;
}): Promise<void> {
  const { order, field, value, actor } = params;
  const progress = order.progress;
  if (!progress) return;

  const target = progress.targets[field] || 0;
  // Clamped to the quota: a month owes eight ads, and "12 of 8 delivered" is a typo, not news.
  const next = Math.max(0, Math.min(target, Math.floor(Number(value) || 0)));
  const from = progress.done[field] || 0;
  if (next === from) return;

  const done = { ...progress.done, [field]: next };
  const updated: OrderProgress = {
    ...progress,
    done,
    log: [...(progress.log || []), { at: Timestamp.now(), byName: actor.name, field, from, to: next }].slice(-100),
  };
  const nowComplete = isProgressComplete(updated);
  updated.completedAt = nowComplete ? (progress.completedAt ?? Timestamp.now()) : null;

  await updateDoc(doc(db, "orders", order.id), { progress: updated, updatedAt: serverTimestamp() });

  // Tell the rest of the team, so a split job's other members see the shared count move.
  const label = order.businessName || "an order";
  for (const userId of progressAudience(order, actor.uid)) {
    await sendNotification({
      userId,
      type: nowComplete ? "order_progress_complete" : "order_progress",
      title: nowComplete ? "Order fully delivered" : "Progress updated",
      message: nowComplete
        ? `Everything on "${label}" is now delivered.`
        : `${actor.name} updated "${label}": ${next} of ${target} ${field}.`,
      link: "/tech/my-work",
      // One notification per order per counter per value — re-saving the same number is not news.
      dedupeKey: `order_progress_${order.id}_${field}_${next}_${userId}`,
    });
  }
}

/**
 * Mark one of the three jobs finished (or re-open it).
 *
 * Marking done also fills that job's counters to their target: a member saying "uploading is
 * finished" while the posted count sits at 3 of 8 leaves the order in a state nobody can read.
 * The two statements mean the same thing, so they are written together.
 */
export async function setOrderTrackComplete(params: {
  order: Order;
  track: OrderTrack;
  complete: boolean;
  actor: Pick<AppUser, "uid" | "name">;
}): Promise<void> {
  const { order, track, complete, actor } = params;
  const progress = order.progress;
  if (!progress) return;

  const completedTracks = complete
    ? Array.from(new Set([...(progress.completedTracks || []), track]))
    : (progress.completedTracks || []).filter((t) => t !== track);

  const done = { ...progress.done };
  if (complete) {
    for (const f of TRACK_FIELDS[track]) {
      if ((progress.targets[f] || 0) > 0) done[f] = progress.targets[f];
    }
  }

  const updated: OrderProgress = {
    ...progress,
    done,
    completedTracks,
    log: [
      ...(progress.log || []),
      { at: Timestamp.now(), byName: actor.name, field: track, from: null, to: complete ? 1 : 0 },
    ].slice(-100),
  };
  const nowComplete = isProgressComplete(updated);
  updated.completedAt = nowComplete ? (progress.completedAt ?? Timestamp.now()) : null;

  await updateDoc(doc(db, "orders", order.id), { progress: updated, updatedAt: serverTimestamp() });

  const label = order.businessName || "an order";
  const jobName = track.replace(/_/g, " ");
  for (const userId of progressAudience(order, actor.uid)) {
    await sendNotification({
      userId,
      type: "order_track_complete",
      title: complete ? "A job is finished" : "A job was re-opened",
      message: complete
        ? `${actor.name} marked ${jobName} complete on "${label}".`
        : `${actor.name} re-opened ${jobName} on "${label}".`,
      link: "/tech/my-work",
      dedupeKey: `order_track_${order.id}_${track}_${complete ? "done" : "open"}_${userId}`,
    });
  }
}

/** Put each job on a member. Recorded on the order; the work assignments are created separately. */
export async function setOrderTracks(params: {
  order: Order;
  tracks: Partial<Record<OrderTrack, { uid: string; name: string }>>;
}): Promise<void> {
  const { order, tracks } = params;
  if (!order.progress) return;
  await updateDoc(doc(db, "orders", order.id), {
    progress: { ...order.progress, tracks },
    updatedAt: serverTimestamp(),
  });
}

// ─── Penalties ───────────────────────────────────────────────────────────────────────────────

/**
 * Charge a penalty for changes beyond what was committed.
 *
 * Recorded on the ORDER because both sides can add one — the sales member from the sale and the
 * tech admin from the queue — and the order is the document both roles already read and write.
 * A compact total is mirrored back onto the lead's sale item so the sales member's own screens
 * show it without paying for a second read.
 *
 * The penalty is never added to `order.amount` or the sale's `amount`. That is the whole point:
 * every revenue reader sums `amount`, so none of them can accidentally pay commission on a fine.
 */
export async function addOrderPenalty(params: {
  order: Order;
  clips: number;
  ratePerClip: number;
  clipType: PenaltyClipType;
  reason?: string | null;
  actor: Pick<AppUser, "uid" | "name" | "role"> & { createdBy?: string };
}): Promise<PenaltyEntry> {
  const { order, clips, ratePerClip, clipType, reason, actor } = params;

  const entry: PenaltyEntry = {
    id: `pen_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    clips: Math.max(1, Math.floor(Number(clips) || 0)),
    ratePerClip: Math.max(0, Number(ratePerClip) || 0),
    amount: penaltyAmount(clips, ratePerClip),
    clipType,
    reason: reason?.trim() || null,
    byId: actor.uid,
    byName: actor.name,
    byRole: actor.role,
    at: Timestamp.now(),
  };

  const totals = totalPenalties([...(order.penalties || []), entry]);
  await updateDoc(doc(db, "orders", order.id), {
    penalties: arrayUnion(entry),
    penaltyTotal: totals.total,
    penaltyClips: totals.clips,
    updatedAt: serverTimestamp(),
  });

  await mirrorPenaltyToSale(order, totals.total, totals.clips);

  // The tech admin decides what happens to the job; the sales member owns the client conversation.
  // Both need to know a charge was raised, whichever of them raised it.
  const recipients = Array.from(new Set([order.techAdminId, order.soldBy, order.assignedTo]))
    .filter((u): u is string => !!u && u !== actor.uid);
  for (const userId of recipients) {
    await sendNotification({
      userId,
      type: "order_penalty",
      title: "Penalty added",
      message: `${actor.name} added a penalty of ${entry.clips} clip${entry.clips === 1 ? "" : "s"} on "${order.businessName || "an order"}".`,
      link: "/tech-admin/orders",
      dedupeKey: `order_penalty_${entry.id}_${userId}`,
    });
  }

  // Money charged to a client on the tech side's say-so, so it belongs in the tech feed too.
  if (actor.role === "tech_admin" || actor.role === "tech_team_leader") {
    await logTechActivity({
      actor,
      action: "added_penalty",
      details: {
        orderId: order.id,
        businessName: order.businessName || order.clientName || "",
        clips: entry.clips,
        amount: entry.amount,
        clipType: entry.clipType,
        reason: entry.reason,
      },
    });
  }

  return entry;
}

/** Remove a penalty raised in error. Totals are recomputed from what is left. */
export async function removeOrderPenalty(params: {
  order: Order;
  penaltyId: string;
  actor?: ActivityActor | null;
}): Promise<void> {
  const { order, penaltyId, actor } = params;
  const existing = order.penalties || [];
  const removed = existing.find((p) => p.id === penaltyId);
  const remaining = existing.filter((p) => p.id !== penaltyId);
  if (remaining.length === existing.length) return;

  const totals = totalPenalties(remaining);
  await updateDoc(doc(db, "orders", order.id), {
    penalties: remaining,
    penaltyTotal: totals.total,
    penaltyClips: totals.clips,
    updatedAt: serverTimestamp(),
  });
  await mirrorPenaltyToSale(order, totals.total, totals.clips);

  if (actor && (actor.role === "tech_admin" || actor.role === "tech_team_leader")) {
    await logTechActivity({
      actor,
      action: "removed_penalty",
      details: {
        orderId: order.id,
        businessName: order.businessName || order.clientName || "",
        clips: removed?.clips ?? 0,
        amount: removed?.amount ?? 0,
      },
    });
  }
}

/**
 * Copy the penalty total onto the originating sale line.
 *
 * Best-effort and deliberately non-fatal: the order is the record that matters, and a sale whose
 * lead has since been deleted must not stop a tech admin from charging for wasted work.
 */
async function mirrorPenaltyToSale(order: Order, penaltyTotal: number, penaltyClips: number): Promise<void> {
  if (!order.leadId) return;
  try {
    const leadRef = doc(db, "leads", order.leadId);
    const snap = await getDoc(leadRef);
    if (!snap.exists()) return;
    const lead = snap.data() as Lead;
    const items = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
    const index = order.saleItemIndex;
    if (index == null || !items[index]) return;
    const updated = items.map((it, i) => (i === index ? { ...it, penaltyTotal, penaltyClips } : it));
    await updateDoc(leadRef, { saleItems: updated, saleDetails: updated[updated.length - 1] });
  } catch (err) {
    console.error("[orders] mirrorPenaltyToSale failed:", err);
  }
}
