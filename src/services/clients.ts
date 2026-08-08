/**
 * Clients service — the single customer view.
 *
 * A Client (doc id = phoneLockId, one per phone number) is upserted when tech VERIFIES the work
 * for an order. It accumulates every sold/delivered item with attribution, so admins can see a
 * customer's whole history. Reads are scoped (sales admins see only their clients).
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot, setDoc, updateDoc, runTransaction, query, where,
  writeBatch, serverTimestamp, Timestamp, type Query, type DocumentData,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { adminAssignNumber } from "@/services/numberLock";
import { categoryLabel, categoryBilling } from "@/utils/serviceCatalog";
import { formatPhoneDisplay, normalizePhone, phoneLockId } from "@/utils/phone";
import { deliveredAtMs } from "@/utils/workDates";
import type { AppUser, Client, ClientWorkItem, Order, UserRole, WorkAssignment } from "@/types";

/**
 * When a delivered job goes on a client's record.
 *
 * Never "now": a client's last-work date is a fact about the job, not about when somebody
 * happened to press Import. Stamping the import time is what made all 850 clients read
 * "Last work 23 Jul 2026". Falls back to now only when the assignment carries no date at all.
 */
function deliveredAtStamp(a: WorkAssignment): Timestamp {
  const ms = deliveredAtMs(a);
  return ms ? Timestamp.fromMillis(ms) : Timestamp.now();
}

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
        // serverTimestamp() is not allowed inside array elements, and "now" would be a lie —
        // this is when the work was finished.
        deliveredAt: deliveredAtStamp(assignment),
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
            // The seller keeps the customer. Two members who sold to the same business are both
            // on this list, and both see them in their own Clients page.
            soldByIds: Array.from(new Set([...(client.soldByIds || []), order.soldBy].filter(Boolean))),
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
          soldByIds: order.soldBy ? [order.soldBy] : [],
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
 * Scoped clients query.
 *
 * A sales member sees the customers THEY sold to, and nobody else's — `soldByIds` is an array
 * because two members can sell to the same business months apart and both keep it. Sales admins
 * see everything their team sold; tech_admin / main_admin oversee all of it (a bounded collection,
 * one document per delivered customer).
 *
 * Scoped as a query rather than filtered after the fetch, deliberately: this database runs on
 * Firestore's free daily read budget, and reading nine hundred client documents to show a member
 * their forty is how a whole company loses its afternoon.
 */
export function clientsQuery(role: UserRole | undefined, uid: string | undefined): Query<DocumentData> {
  if (role === "sales_member" && uid) {
    return query(collection(db, "clients"), where("soldByIds", "array-contains", uid));
  }
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

/**
 * Register a delivered assignment as a client, on completion.
 *
 * Two gaps this closes:
 *
 *  1. Work created directly in Work Assign has no `orderId`, so it never reached the clients
 *     list at all — those customers were invisible to the upsell pipeline.
 *  2. Waiting for admin *verification* meant a delivered customer sat unreachable until someone
 *     got round to approving the work. Completion is the moment the customer actually has
 *     something, so that is when they become an upsell target.
 *
 * Order-sourced work still flows through `upsertClientOnWorkVerify` for the money side; this
 * only ensures the client record exists. Both are idempotent on `workAssignmentId`.
 */
/**
 * Every sales admin's uid.
 *
 * Used to give unattributed clients visibility to the whole sales side. Never throws — a failed
 * lookup degrades to "no sales admin sees it yet", which the Import button can repair later.
 */
export async function fetchSalesAdminIds(): Promise<string[]> {
  try {
    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "sales_admin")));
    return snap.docs.map((d) => d.id);
  } catch (err) {
    console.error("[clients] could not load sales admins:", err);
    return [];
  }
}

/** Just enough of the originating sale to attribute a delivered job to the person who sold it. */
export interface SaleAttribution {
  soldBy: string;
  soldByName: string;
  saleAmount: number;
  fromAd: boolean;
}

/**
 * A delivered assignment, as the entry that goes on its client's record.
 *
 * ── The bug the `sale` argument exists to fix ─────────────────────────────────────────────────
 * Without it this fell back to `assignment.assignedBy` — the TECH person who handed the job out —
 * and wrote it into a field called `soldBy`. Because completion runs before verification, and
 * `upsertClientOnWorkVerify` skips an order it finds already recorded, that wrong name was the one
 * that stuck: "Sold by" on the Clients page has been naming the tech admin for every order-backed
 * job. Nobody noticed, because nobody had a reason to read that column until sales members were
 * given their own client list — where the same field decides whose customers they are.
 *
 * Work created directly in Work Assign genuinely has no sale behind it. Those keep the assigner as
 * a weak attribution and contribute nobody to `soldByIds`, which is correct: no sales member sold
 * them, so no sales member should see them.
 */
function workItemFromAssignment(
  assignment: WorkAssignment,
  deliveredByName?: string | null,
  sale?: SaleAttribution | null,
): ClientWorkItem {
  return {
    orderId: assignment.orderId || `assignment_${assignment.id}`,
    workAssignmentId: assignment.id,
    category: assignment.category,
    title: assignment.businessName
      ? `${categoryLabel(assignment.category)} — ${assignment.businessName}`
      : categoryLabel(assignment.category),
    billing: categoryBilling(assignment.category),
    soldBy: sale?.soldBy || assignment.assignedBy || "",
    soldByName: sale?.soldByName || "",
    saleAmount: sale?.saleAmount ?? (assignment.totalPrice || 0),
    fromAd: sale?.fromAd ?? false,
    deliveredBy: assignment.assignedTo,
    deliveredByName: deliveredByName || null,
    deliveredAmount: assignment.totalPrice || 0,
    deliveredAt: deliveredAtStamp(assignment),
  };
}

/**
 * The same entry, for work that came from a sale.
 *
 * The order is the authority on everything about the SALE — who sold it, for how much, under which
 * package, and whether it came from an ad. The assignment only knows about the delivery. Building
 * the item from the assignment for order-driven work is what put a tech admin's uid in `soldBy`,
 * an empty string in `soldByName` and the tech price in `saleAmount`.
 */
function workItemFromOrder(
  order: Order,
  assignment: WorkAssignment,
  deliveredByName?: string | null,
): ClientWorkItem {
  return {
    orderId: order.id,
    workAssignmentId: assignment.id,
    category: order.category,
    packageKey: order.packageKey,
    title: order.businessName
      ? `${categoryLabel(order.category)} — ${order.businessName}`
      : categoryLabel(order.category),
    billing: categoryBilling(order.category),
    soldBy: order.soldBy,
    soldByName: order.soldByName,
    saleAmount: order.amount || 0,
    fromAd: !!order.fromAd,
    deliveredBy: assignment.assignedTo,
    deliveredByName: deliveredByName || null,
    deliveredAmount: assignment.totalPrice || 0,
    deliveredAt: deliveredAtStamp(assignment),
  };
}

export async function upsertClientOnWorkComplete(params: {
  assignment: WorkAssignment;
  deliveredByName?: string | null;
  /**
   * Sales admins who should be able to see this client. Directly-assigned work has no sale and
   * therefore no owning admin, so every sales admin gets visibility — otherwise the customer is
   * invisible to the very people who run upsells. Pass it in to avoid a lookup per client.
   *
   * Ignored for order-driven work, which has exactly one owning admin: the one on the order.
   */
  salesAdminIds?: string[];
}): Promise<void> {
  const { assignment, deliveredByName } = params;

  try {
    /**
     * ── Why the order is read first ─────────────────────────────────────────────────────────────
     * Completion is the moment the client record is created, and for a sold job the order holds
     * facts the assignment simply does not have. Two of them were being lost:
     *
     *  1. **The customer's number.** It is optional on an assignment (`workAssign` omits the field
     *     when the box is left blank, and both edit forms write it back as ""), so any sold job
     *     assigned without re-typing the number bailed out here — and the client never appeared in
     *     the list at all. The order always carries `clientPhoneId`; it is the join key the whole
     *     pipeline is built on.
     *  2. **Who sold it, and for how much.** Falling back to assignment data wrote the tech
     *     admin's uid into `soldBy`, an empty `soldByName`, and the tech price into `saleAmount`,
     *     with `totalSaleAmount` left at 0. `upsertClientOnWorkVerify` could not repair it later:
     *     it matches on `orderId`, saw the entry already present, and skipped — so the wrong
     *     attribution was permanent and every sold client read as a ₹0 sale by nobody.
     */
    const order = assignment.orderId
      ? await getDoc(doc(db, "orders", assignment.orderId))
          .then((s) => (s.exists() ? ({ id: s.id, ...s.data() } as Order) : null))
          .catch(() => null)
      : null;

    // The order's own id wins: it is the key Orders, reviews and the verify path all use, so
    // preferring the assignment's copy is how one customer ends up with two client documents.
    const phone = order?.clientPhone
      || (assignment.businessWhatsapp ? normalizePhone(assignment.businessWhatsapp) : "");
    // Without a number there is nobody to upsell to, so there is nothing useful to record.
    if (!phone) return;

    const phoneId = order?.clientPhoneId || normalizePhone(phone).replace(/\D/g, "");
    if (!phoneId) return;

    // Only fetched when it is actually needed — a sold job's visibility comes from its order.
    const salesAdminIds = order?.salesAdminId
      ? [order.salesAdminId]
      : params.salesAdminIds ?? await fetchSalesAdminIds();

    const clientRef = doc(db, "clients", phoneId);

    await runTransaction(db, async (tx) => {
      const clientSnap = await tx.get(clientRef);
      const item = order
        ? workItemFromOrder(order, assignment, deliveredByName)
        : workItemFromAssignment(assignment, deliveredByName);

      if (clientSnap.exists()) {
        const client = clientSnap.data() as Client;
        // Idempotent: re-completing the same assignment must not double-count revenue. Matched on
        // the order too, so a job re-assigned after being taken back is still the same sale.
        const already = (client.works || []).some(
          (w) => w.workAssignmentId === assignment.id || (!!order && w.orderId === order.id),
        );
        if (already) return;

        tx.update(clientRef, {
          works: [...(client.works || []), item],
          totalSaleAmount: (client.totalSaleAmount || 0) + item.saleAmount,
          totalDeliveredAmount: (client.totalDeliveredAmount || 0) + (item.deliveredAmount || 0),
          workCount: (client.workCount || 0) + 1,
          salesAdminIds: Array.from(new Set([...(client.salesAdminIds || []), ...salesAdminIds])),
          // The seller keeps the customer, and it is what their own Clients page queries on. Only
          // order-driven work contributes: a direct assignment's `assignedBy` is the tech person
          // who handed it out, and putting them here would match a "my clients" query.
          ...(order?.soldBy
            ? { soldByIds: Array.from(new Set([...(client.soldByIds || []), order.soldBy])) }
            : {}),
          name: client.name || order?.businessName || assignment.businessName || "",
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(clientRef, {
          phone: order?.clientPhone || normalizePhone(phone),
          phoneId,
          name: order?.businessName || assignment.businessName || assignment.clientName || "",
          businessCategory: "",
          email: null,
          logoUrl: null,
          visitingCardUrl: null,
          googleBusinessUrl: null,
          websiteUrl: null,
          socialMedia: null,
          works: [item],
          // A direct assignment carries no sale, so its value stays 0 until an order links up.
          totalSaleAmount: item.saleAmount,
          totalDeliveredAmount: item.deliveredAmount || 0,
          workCount: 1,
          // Unattributed delivery → visible to every sales admin, so the upsell can be picked up.
          salesAdminIds,
          soldByIds: order?.soldBy ? [order.soldBy] : [],
          firstSoldBy: order?.soldBy || assignment.assignedBy || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (err) {
    console.error("[clients] upsertClientOnWorkComplete failed:", err);
  }
}

// ─── Backfill ───────────────────────────────────────────────────────────────

export interface ClientBackfillResult {
  /** Delivered assignments examined. */
  scanned: number;
  /** Jobs newly written onto a client record. */
  imported: number;
  /** Already recorded and correct — a re-run does no work for these. */
  alreadyPresent: number;
  /** Already recorded, but with a wrong delivery date that this run corrected. */
  repaired: number;
  /** Delivered work with no WhatsApp number, so there is nobody to upsell. */
  missingPhone: number;
  /** Client documents actually written. */
  clientsWritten: number;
  /** Records whose sales attribution was wrong (the tech assigner) and has been corrected. */
  reattributed: number;
}

/** A stamp is "the same" if it agrees to the minute — Firestore precision noise is not a change. */
function sameStamp(a: unknown, b: Timestamp): boolean {
  const seconds = (a as { seconds?: number } | undefined)?.seconds;
  return typeof seconds === "number" && Math.abs(seconds - b.seconds) < 60;
}

/**
 * Bring every already-delivered assignment into Clients, and repair what is already there.
 *
 * `upsertClientOnWorkComplete` only fires for work completed from now on, and before it existed
 * clients were created solely on admin *verify* of order-sourced work. Everything else — every
 * job assigned directly in Work Assign, and every job completed before that fix — never reached
 * the upsell pipeline at all. This sweeps the whole history so the client list reflects every
 * customer the team has actually delivered to.
 *
 * Two things it deliberately does *not* do, both of which it used to:
 *
 *  1. **Re-read every client, every run.** The whole clients collection is read once up front,
 *     so a second run costs one collection read instead of one document read per delivered job.
 *     A sweep over already-imported history now finishes in seconds and writes nothing.
 *  2. **Write one job at a time.** Jobs are grouped by client and written in batches, so a client
 *     with twenty ads is one write rather than twenty, and totals are recomputed from the merged
 *     list rather than incremented (which is how a re-run could ever double-count).
 *
 * It also fixes records the old import damaged: a work item stamped with the import time instead
 * of the delivery time gets its real `deliveredAt` back, which is what "Last work" reads.
 */
export async function backfillClientsFromDeliveredWork(
  assignments: WorkAssignment[],
  memberNameFor: (uid: string) => string,
  onProgress?: (done: number, total: number) => void,
): Promise<ClientBackfillResult> {
  const delivered = assignments.filter(
    (a) => a.status === "completed" || a.status === "verified",
  );

  const result: ClientBackfillResult = {
    scanned: delivered.length,
    imported: 0,
    alreadyPresent: 0,
    repaired: 0,
    missingPhone: 0,
    clientsWritten: 0,
    reattributed: 0,
  };

  /**
   * Every order, once, so each delivered job can be attributed to the person who actually sold it.
   *
   * One collection read for the whole sweep — the alternative is a document read per job, which on
   * eight hundred jobs is most of a day's free budget. It is also the repair for the bug described
   * on `workItemFromAssignment`: history written before that fix has the tech assigner in
   * `soldBy`, and every sales member's own Clients list is built from that field.
   */
  const saleByOrderId = new Map<string, SaleAttribution>();
  try {
    const snap = await getDocs(collection(db, "orders"));
    snap.docs.forEach((d) => {
      const o = d.data() as Order;
      if (o.soldBy) {
        saleByOrderId.set(d.id, {
          soldBy: o.soldBy,
          soldByName: o.soldByName || "",
          saleAmount: o.amount || 0,
          fromAd: !!o.fromAd,
        });
      }
    });
  } catch (err) {
    // Attribution simply stays as it is. Everything else about the sweep still works.
    console.error("[clients] backfill could not preload orders:", err);
  }

  // Group by client, oldest first, so a client's work history reads in the order it happened.
  const ordered = [...delivered].sort((a, b) => (deliveredAtMs(a) ?? 0) - (deliveredAtMs(b) ?? 0));
  const byPhoneId = new Map<string, WorkAssignment[]>();
  for (const a of ordered) {
    const phoneId = a.businessWhatsapp ? normalizePhone(a.businessWhatsapp).replace(/\D/g, "") : "";
    if (!phoneId) {
      result.missingPhone += 1;
      continue;
    }
    const list = byPhoneId.get(phoneId);
    if (list) list.push(a);
    else byPhoneId.set(phoneId, [a]);
  }

  // Both fetched once for the whole sweep rather than per client.
  const salesAdminIds = await fetchSalesAdminIds();
  const existingClients = new Map<string, Client>();
  try {
    const snap = await getDocs(collection(db, "clients"));
    snap.docs.forEach((d) => existingClients.set(d.id, d.data() as Client));
  } catch (err) {
    // Unreadable clients collection → treat everything as new. Writes stay idempotent per client
    // because each one is merged from the doc we do hold, so the worst case is redundant work.
    console.error("[clients] backfill could not preload clients:", err);
  }

  let batch = writeBatch(db);
  let batched = 0;
  const BATCH_LIMIT = 400; // Firestore caps a batch at 500 ops; leave headroom.
  const flush = async () => {
    if (batched === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    batched = 0;
  };

  let processed = 0;
  for (const [phoneId, items] of byPhoneId) {
    processed += 1;
    onProgress?.(processed, byPhoneId.size);

    const client = existingClients.get(phoneId);
    const works: ClientWorkItem[] = [...(client?.works || [])];
    const positionOf = new Map<string, number>();
    works.forEach((w, i) => { if (w.workAssignmentId) positionOf.set(w.workAssignmentId, i); });

    let changed = false;
    for (const a of items) {
      const sale = a.orderId ? saleByOrderId.get(a.orderId) || null : null;
      const item = workItemFromAssignment(a, memberNameFor(a.assignedTo), sale);
      const at = positionOf.get(a.id);

      if (at === undefined) {
        positionOf.set(a.id, works.length);
        works.push(item);
        result.imported += 1;
        changed = true;
        continue;
      }

      // Present already — but two things about an old record can still be wrong.
      let fixed = false;

      // An import-time stamp needs correcting to the real delivery date.
      if (!sameStamp(works[at].deliveredAt, item.deliveredAt)) {
        works[at] = { ...works[at], deliveredAt: item.deliveredAt };
        result.repaired += 1;
        fixed = true;
      }

      // And the seller may be recorded as the tech person who handed the job out.
      if (sale && (works[at].soldBy !== sale.soldBy || !works[at].soldByName)) {
        works[at] = { ...works[at], soldBy: sale.soldBy, soldByName: sale.soldByName };
        result.reattributed += 1;
        fixed = true;
      }

      if (fixed) changed = true;
      else result.alreadyPresent += 1;
    }

    /**
     * Who sold this customer anything, ever — recomputed from the merged list rather than added to.
     *
     * Only order-backed work contributes: `soldBy` on a directly-assigned job is the tech assigner,
     * and putting them in here would show a tech admin's uid to a query that means "my clients".
     */
    const soldByIds = Array.from(new Set(
      works
        .filter((w) => w.orderId && saleByOrderId.has(w.orderId))
        .map((w) => saleByOrderId.get(w.orderId!)!.soldBy)
        .filter(Boolean),
    ));
    const existingSoldByIds = client?.soldByIds || [];
    const soldByChanged = soldByIds.length !== existingSoldByIds.length
      || soldByIds.some((uid) => !existingSoldByIds.includes(uid));
    if (soldByChanged) changed = true;

    if (!changed) continue;

    // Totals recomputed from the merged list, never incremented — a re-run can't drift.
    const totalDeliveredAmount = works.reduce((sum, w) => sum + (w.deliveredAmount || 0), 0);
    const first = items[0];

    if (client) {
      batch.update(doc(db, "clients", phoneId), {
        works,
        workCount: works.length,
        totalDeliveredAmount,
        soldByIds,
        name: client.name || first.businessName || first.clientName || "",
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(doc(db, "clients", phoneId), {
        phone: normalizePhone(first.businessWhatsapp!),
        phoneId,
        name: first.businessName || first.clientName || "",
        businessCategory: "",
        email: null,
        logoUrl: null,
        visitingCardUrl: null,
        googleBusinessUrl: null,
        websiteUrl: null,
        socialMedia: null,
        works,
        // Direct assignments carry no sale record, so sale value stays 0 until an order links up.
        totalSaleAmount: 0,
        totalDeliveredAmount,
        workCount: works.length,
        // Unattributed delivery → visible to every sales admin, so the upsell can be picked up.
        salesAdminIds,
        soldByIds,
        firstSoldBy: soldByIds[0] || first.assignedBy || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    result.clientsWritten += 1;
    batched += 1;
    if (batched >= BATCH_LIMIT) {
      try {
        await flush();
      } catch (err) {
        // One bad batch must not abort the sweep — log it and carry on with a fresh batch.
        console.error("[clients] backfill batch failed:", err);
        batch = writeBatch(db);
        batched = 0;
      }
    }
  }

  try {
    await flush();
  } catch (err) {
    console.error("[clients] backfill final batch failed:", err);
  }

  return result;
}

// ── One-time backfill record ────────────────────────────────────────────────

/**
 * Proof that the legacy import has been run.
 *
 * Delivered work flows into Clients automatically now (see upsertClientOnWorkComplete), so the
 * "Import delivered work" sweep is a one-off for jobs finished before that existed. Recording it
 * in Firestore rather than localStorage means the banner disappears for the whole company once
 * anyone runs it, not just on the browser that did.
 */
export interface ClientBackfillRecord {
  completedAt: unknown;
  scanned: number;
  imported: number;
  /** Delivery dates corrected on records the first import stamped with the import time. */
  repaired?: number;
  byUid: string;
  byName: string;
}

const BACKFILL_DOC = () => doc(db, "app_settings", "clients_backfill");

export function watchClientBackfill(cb: (record: ClientBackfillRecord | null) => void): () => void {
  return onSnapshot(
    BACKFILL_DOC(),
    (snap) => cb(snap.exists() ? (snap.data() as ClientBackfillRecord) : null),
    // A missing doc and an unreadable one both mean "we don't know it ran" — show the banner.
    () => cb(null),
  );
}

export async function recordClientBackfill(
  result: ClientBackfillResult,
  by: { uid: string; name: string },
): Promise<void> {
  await setDoc(BACKFILL_DOC(), {
    completedAt: serverTimestamp(),
    scanned: result.scanned,
    imported: result.imported,
    repaired: result.repaired,
    byUid: by.uid,
    byName: by.name,
  } satisfies ClientBackfillRecord);
}
