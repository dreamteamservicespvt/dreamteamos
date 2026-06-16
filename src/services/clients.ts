/**
 * Clients service — the single customer view.
 *
 * A Client (doc id = phoneLockId, one per phone number) is upserted when tech VERIFIES the work
 * for an order. It accumulates every sold/delivered item with attribution, so admins can see a
 * customer's whole history. Reads are scoped (sales admins see only their clients).
 */
import {
  collection, doc, getDoc, updateDoc, runTransaction, query, where,
  serverTimestamp, Timestamp, type Query, type DocumentData,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { adminAssignNumber } from "@/services/numberLock";
import { categoryLabel, categoryBilling } from "@/utils/serviceCatalog";
import { formatPhoneDisplay, phoneLockId } from "@/utils/phone";
import type { AppUser, Client, ClientWorkItem, Order, UserRole, WorkAssignment } from "@/types";

/**
 * On tech verification of an order-driven work assignment: append the delivered item to the client
 * (creating the client doc on first delivery) and flip the order to "verified". Transactional +
 * idempotent per orderId. No-op for manual assignments (no orderId). Never throws.
 */
export async function upsertClientOnWorkVerify(params: {
  assignment: WorkAssignment;
  deliveredByName?: string | null;
}): Promise<void> {
  const { assignment, deliveredByName } = params;
  if (!assignment.orderId) return; // manual assignment, not part of the orders pipeline
  try {
    const orderRef = doc(db, "orders", assignment.orderId);
    await runTransaction(db, async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) return;
      const order = orderSnap.data() as Order;
      if (!order.clientPhoneId) return;

      const clientRef = doc(db, "clients", order.clientPhoneId);
      const clientSnap = await tx.get(clientRef);

      const item: ClientWorkItem = {
        orderId: assignment.orderId!,
        workAssignmentId: assignment.id,
        category: order.category,
        packageKey: order.packageKey,
        title: order.businessName ? `${categoryLabel(order.category)} — ${order.businessName}` : categoryLabel(order.category),
        billing: categoryBilling(order.category),
        soldBy: order.soldBy,
        soldByName: order.soldByName,
        saleAmount: order.amount || 0,
        fromAd: !!order.fromAd,
        deliveredBy: assignment.assignedTo,
        deliveredByName: deliveredByName || null,
        deliveredAmount: assignment.totalPrice || 0,
        deliveredAt: Timestamp.now(), // serverTimestamp() is not allowed inside array elements
      };

      if (clientSnap.exists()) {
        const client = clientSnap.data() as Client;
        // Idempotency: if this order already recorded, only ensure the order is flipped.
        if (!(client.works || []).some((w) => w.orderId === item.orderId)) {
          tx.update(clientRef, {
            works: [...(client.works || []), item],
            totalSaleAmount: (client.totalSaleAmount || 0) + item.saleAmount,
            totalDeliveredAmount: (client.totalDeliveredAmount || 0) + (item.deliveredAmount || 0),
            workCount: (client.workCount || 0) + 1,
            salesAdminIds: Array.from(new Set([...(client.salesAdminIds || []), order.salesAdminId])),
            name: client.name || order.businessName || "",
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        tx.set(clientRef, {
          phone: order.clientPhone,
          phoneId: order.clientPhoneId,
          name: order.businessName || "",
          businessCategory: "",
          email: null,
          logoUrl: null,
          visitingCardUrl: null,
          googleBusinessUrl: null,
          websiteUrl: null,
          socialMedia: null,
          works: [item],
          totalSaleAmount: item.saleAmount,
          totalDeliveredAmount: item.deliveredAmount || 0,
          workCount: 1,
          salesAdminIds: [order.salesAdminId],
          firstSoldBy: order.soldBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(orderRef, {
        status: "verified",
        verifiedAt: serverTimestamp(),
        deliveredAmount: item.deliveredAmount || 0,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    console.error("[clients] upsertClientOnWorkVerify failed:", err);
  }
}

/**
 * Scoped clients query. Sales admins see only clients their team sold to (array-contains);
 * tech_admin / main_admin oversee all clients (bounded collection — one doc per delivered customer).
 */
export function clientsQuery(role: UserRole | undefined, uid: string | undefined): Query<DocumentData> {
  if (role === "sales_admin" && uid) {
    return query(collection(db, "clients"), where("salesAdminIds", "array-contains", uid));
  }
  return query(collection(db, "clients"));
}

/** Admin-only profile edit (logo, website, social, etc.). */
export async function updateClientProfile(phoneId: string, patch: Partial<Client>): Promise<void> {
  await updateDoc(doc(db, "clients", phoneId), { ...patch, updatedAt: serverTimestamp() });
}

/** One-off fetch of a single client (detail view). */
export async function fetchClient(phoneId: string): Promise<Client | null> {
  const snap = await getDoc(doc(db, "clients", phoneId));
  return snap.exists() ? (snap.data() as Client) : null;
}

/**
 * Upsell: assign an existing client's number to a sales member with a pitch for a service gap.
 * Reuses the number-lock machinery (`adminAssignNumber`) so the lead flows through the normal
 * sell → order → work → client pipeline; the new lead is enriched with the client name + pitch note.
 */
export async function assignUpsellLead(params: {
  client: Client;
  member: AppUser;
  admin: AppUser;
  categoryKey: string;
}): Promise<{ ok: boolean; message: string }> {
  const { client, member, admin, categoryKey } = params;
  const pitch = categoryLabel(categoryKey);
  const result = await adminAssignNumber({
    admin: { uid: admin.uid, name: admin.name },
    member: { uid: member.uid, name: member.name },
    phone: client.phone,
    displayName: client.name || formatPhoneDisplay(client.phone),
  });

  if (result.kind === "created" || result.kind === "takeover") {
    await updateDoc(doc(db, "leads", result.leadId), {
      realName: client.name || null,
      notes: `Upsell to existing client — pitch: ${pitch}`,
    });
    await sendNotification({
      userId: member.uid,
      type: "upsell_assigned",
      title: "Upsell lead assigned",
      message: `${client.name || "A client"} (existing customer) — pitch ${pitch}.`,
    });
    return { ok: true, message: `Assigned to ${member.name} — pitch ${pitch}.` };
  }

  // The chosen member already holds this number (e.g. they made the original sale) — that's fine:
  // enrich their existing lead with the pitch instead of failing.
  if (result.kind === "already_with_member") {
    try {
      const lockSnap = await getDoc(doc(db, "numberLocks", phoneLockId(client.phone)));
      const leadId = lockSnap.exists() ? (lockSnap.data() as any).ownerLeadId : null;
      if (leadId) {
        await updateDoc(doc(db, "leads", leadId), {
          realName: client.name || null,
          notes: `Upsell to existing client — pitch: ${pitch}`,
        });
      }
    } catch { /* best-effort enrichment */ }
    await sendNotification({
      userId: member.uid,
      type: "upsell_assigned",
      title: "Upsell reminder",
      message: `${client.name || "A client"} is already in your leads — pitch ${pitch} (existing customer).`,
    });
    return { ok: true, message: `${member.name} already has this client — pitch ${pitch} added to their lead.` };
  }

  const blocked: Record<string, string> = {
    sale_frozen: "This number is currently sale-frozen by another member — try again after the freeze ends.",
    reserved: "This number is still within another member's 24h reservation window.",
  };
  return { ok: false, message: blocked[result.kind] || "Could not assign this number." };
}
