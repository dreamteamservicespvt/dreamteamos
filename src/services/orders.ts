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
  serverTimestamp, Timestamp, arrayUnion, type Query, type DocumentData,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { normalizePhone, phoneLockId } from "@/utils/phone";
import { isAdCategory } from "@/utils/serviceCatalog";
import { promiseDueMs, deadlineState } from "@/utils/promiseSla";
import type { Lead, Order, OrderUpdateNote, SaleDetail, WorkAssignment } from "@/types";

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
      amount: item.amount || 0,
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

    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data() as Order;
      // An order an admin permanently deleted stays deleted — never resurrect it from the sale.
      if (existing.deleted || existing.status === "deleted") return;
      // Reactivate a previously-cancelled order (reject → re-verify); keep any active/assigned state.
      const statusPatch = existing.status === "cancelled" ? { status: "unassigned" as const } : {};
      // saleVerified only ever moves false → true — a later sale-time refresh must not un-verify it.
      const verifiedPatch = params.saleVerified || existing.saleVerified ? { saleVerified: true } : {};
      await updateDoc(ref, { ...saleFields, ...statusPatch, ...verifiedPatch });
    } else {
      await setDoc(ref, {
        ...saleFields,
        status: "unassigned",
        saleVerified: !!params.saleVerified,
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
}): Promise<void> {
  const { leadId, item, itemIndex } = params;
  try {
    const id = orderDocId(leadId, item, itemIndex);
    const ref = doc(db, "orders", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const order = snap.data() as Order;
    // A permanently-deleted order stays deleted — the sale going away doesn't revive it.
    if (order.deleted || order.status === "deleted" || order.status === "cancelled") return;
    if (order.status === "unassigned") {
      await deleteDoc(ref);
      return;
    }
    await updateDoc(ref, { status: "cancelled", updatedAt: serverTimestamp() });
    if (order.techAdminId) {
      await sendNotification({
        userId: order.techAdminId,
        type: "order_cancelled",
        title: "Order Cancelled",
        message: `The sale for "${order.businessName || "a client"}" was reverted — its order/work was cancelled.`,
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
  // Manual/other work, indexed by "phone|category" for an O(1) lookup per order.
  const workKeys = new Set<string>();
  for (const a of assignments) {
    const d = digits(a.businessWhatsapp);
    if (d) workKeys.add(`${d}|${a.category}`);
  }
  return orders.filter((o) => {
    if (o.status !== "unassigned" || o.workAssignmentId) return false;
    const d = digits(o.clientPhone);
    return !!d && workKeys.has(`${d}|${o.category}`);
  });
}

/**
 * Retire the reconcilable orders in one batched write — they leave the active queue (status
 * "verified" drops out of `activeOrdersQuery`) and are flagged so a later re-verify won't revive
 * them. Returns how many were retired.
 */
export async function reconcileManualOrders(orders: Order[]): Promise<number> {
  const BATCH_LIMIT = 400;
  let batch = writeBatch(db);
  let n = 0;
  let total = 0;
  for (const o of orders) {
    batch.update(doc(db, "orders", o.id), {
      status: "verified",
      reconciledManually: true,
      updatedAt: serverTimestamp(),
    });
    n += 1;
    total += 1;
    if (n >= BATCH_LIMIT) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n > 0) await batch.commit();
  return total;
}

/**
 * Permanently delete orders by id, in batches. Returns how many were deleted.
 *
 * This is a *tombstone*, not a hard delete. A hard-deleted order left no trace, so the next time
 * the sale was touched (a re-verify, an edit) `upsertOrderForSale` saw "no doc" and recreated it —
 * the "ghost" orders that kept coming back. Marking the doc `deleted` instead means the order drops
 * out of the active queue AND the recreation paths recognise it and leave it dead.
 */
export async function deleteOrders(orderIds: string[]): Promise<number> {
  const BATCH_LIMIT = 400;
  let batch = writeBatch(db);
  let n = 0;
  let total = 0;
  for (const id of orderIds) {
    batch.update(doc(db, "orders", id), {
      status: "deleted",
      deleted: true,
      deletedAt: serverTimestamp(),
      // Cut the link so a deleted order's work can't later flip it back to a live status.
      workAssignmentId: null,
      updatedAt: serverTimestamp(),
    });
    n += 1;
    total += 1;
    if (n >= BATCH_LIMIT) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n > 0) await batch.commit();
  return total;
}

/** Scoped query for the tech Orders queue — ACTIVE orders only (verified/cancelled drop out). */
export function activeOrdersQuery(): Query<DocumentData> {
  return query(collection(db, "orders"), where("status", "in", [...ACTIVE_ORDER_STATUSES]));
}

/**
 * On-open deadline sweep (no Blaze cron in Phase 1): from the already-loaded orders, notify the
 * assigned member for each ASSIGNED order that is near/overdue and hasn't been notified in the
 * last window. Throttled via `lastDeadlineNotifiedAt`. Fire-and-forget.
 */
export async function notifyDueOrdersOnOpen(orders: Order[], now: number = Date.now()): Promise<void> {
  const THROTTLE_MS = 6 * 60 * 60 * 1000;
  for (const order of orders) {
    if (order.status !== "assigned" || !order.assignedTo || !order.promise) continue;
    const state = deadlineState(promiseDueMs(order.promise), now);
    if (state === "ok") continue;
    const lastMs = tsToMs(order.lastDeadlineNotifiedAt);
    if (lastMs && now - lastMs < THROTTLE_MS) continue;
    try {
      await sendNotification({
        userId: order.assignedTo,
        type: "work_deadline",
        title: state === "overdue" ? "Delivery overdue" : "Delivery due soon",
        message: `"${order.businessName || "Client work"}" is ${state === "overdue" ? "past its" : "near its"} ${order.promise.label} promise. Please deliver.`,
      });
      await updateDoc(doc(db, "orders", order.id), { lastDeadlineNotifiedAt: serverTimestamp() });
    } catch (err) {
      console.error("[orders] deadline notify failed:", err);
    }
  }
}
