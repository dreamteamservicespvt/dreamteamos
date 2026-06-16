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
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, query, where,
  serverTimestamp, type Query, type DocumentData,
} from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { normalizePhone, phoneLockId } from "@/utils/phone";
import { isAdCategory, categoryLabel } from "@/utils/serviceCatalog";
import { promiseDueMs, deadlineState } from "@/utils/promiseSla";
import type { AppUser, Lead, Order, SaleDetail, WorkAssignment } from "@/types";

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

function generateAccessCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
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
  verifierUid: string;
  soldByName: string;
}): Promise<void> {
  const { lead, item, itemIndex, verifierUid, soldByName } = params;
  try {
    const id = orderDocId(lead.id, item, itemIndex);
    const ref = doc(db, "orders", id);
    const phone = normalizePhone(lead.phone);
    const saleFields = {
      clientPhone: phone,
      clientPhoneId: phoneLockId(lead.phone),
      businessName: lead.realName || lead.displayName || "",
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
      salesAdminId: verifierUid,
      promise: item.promise ?? null,
      updatedAt: serverTimestamp(),
    };

    const snap = await getDoc(ref);
    if (snap.exists()) {
      const status = (snap.data() as Order).status;
      // Reactivate a previously-cancelled order (reject → re-verify); keep any active/assigned state.
      const statusPatch = status === "cancelled" ? { status: "unassigned" as const } : {};
      await updateDoc(ref, { ...saleFields, ...statusPatch });
    } else {
      await setDoc(ref, {
        ...saleFields,
        status: "unassigned",
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
    if (order.status === "unassigned") {
      await deleteDoc(ref);
      return;
    }
    if (order.status === "cancelled") return;
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

/**
 * Assign an order to a tech member: creates the `work_assignments` doc (business info + promise
 * carried from the order, nothing re-typed), links both ways, and notifies the member.
 * Returns the new work_assignment id.
 */
export async function assignOrderToMember(params: {
  order: Order;
  member: AppUser;
  assignerUid: string;
  category: string;
  duration: string;
  clipCount: number;
  pricePerUnit: number;
  totalPrice: number;
  uniqueId: string;
}): Promise<string> {
  const { order, member, assignerUid, category, duration, clipCount, pricePerUnit, totalPrice, uniqueId } = params;
  const accessCode = generateAccessCode();
  const today = format(new Date(), "yyyy-MM-dd");

  const workRef = await addDoc(collection(db, "work_assignments"), {
    assignedTo: member.uid,
    assignedBy: assignerUid,
    assignedAt: serverTimestamp(),
    assignedAtIso: new Date().toISOString(),
    category,
    clipCount,
    includesEndCredits: false,
    duration,
    pricePerUnit,
    totalPrice,
    uniqueId,
    accessCode,
    businessName: order.businessName,
    clientName: order.businessName,
    ...(order.clientPhone ? { businessWhatsapp: order.clientPhone } : {}),
    displayTitle: `${categoryLabel(category)} - ${uniqueId}`,
    status: "assigned",
    sessions: [],
    totalDurationSeconds: 0,
    date: today,
    orderId: order.id,
    ...(order.promise ? { promise: order.promise } : {}),
  });

  await updateDoc(doc(db, "orders", order.id), {
    status: "assigned",
    workAssignmentId: workRef.id,
    assignedTo: member.uid,
    assignedToName: member.name,
    techAdminId: assignerUid,
    updatedAt: serverTimestamp(),
  });

  await sendNotification({
    userId: member.uid,
    type: "work_assigned",
    title: "New Work Assigned",
    message: `You've been assigned "${order.businessName || categoryLabel(category)}" (${uniqueId}).${order.promise ? ` Deliver within ${order.promise.label}.` : ""} Access code: ${accessCode}`,
  });

  return workRef.id;
}

/** Mark an order's work as completed by the member (before tech verification). Never throws. */
export async function markOrderCompleted(orderId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "orders", orderId), {
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
