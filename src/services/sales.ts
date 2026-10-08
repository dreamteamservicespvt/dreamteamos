/**
 * Sales — the one path every sale write takes, keyed on the sale's permanent `saleId` (2026-10-08).
 *
 * ── What was wrong (the owner's report: "editing a sale creates duplicate sales for Tech", "deleted
 *    unassigned sales still appear for Tech members", "sales are not synchronizing") ─────────────
 * 1. A sale had no id. Every writer found it by its POSITION in `leads.saleItems[]` and wrote the
 *    whole list back from the copy it had read earlier — the edit form, the delete button, Sales
 *    Approvals, the payment and penalty mirrors. A form open while another sale was deleted saved over
 *    the wrong sale (two entries with one sale's identity, so two rows for one order), and a list read
 *    before an approval or a payment wrote the old values back over it.
 * 2. The sale and its order were written separately. `updateLead` swallowed its own error, so the
 *    order (the tech side's copy) was written even when the sale was not — an order with no sale — and
 *    the member's retry made a second sale and a second order.
 * 3. Deleting removed the sale first, then asked `cancelOrderForSale` to remove the order, best-effort:
 *    a failure left the order in the queue, its chat was never removed, and its "New order" bells
 *    stayed. Deleting a whole LEAD (My Leads' custom lead, the sales admin's Leads pages) never touched
 *    its sales' orders at all — every one stayed in the tech queue. And a job could be created for an
 *    order deleted a moment earlier (`createWorkAssignment` never re-read it), leaving a job in My Work
 *    for a sale that no longer existed.
 *
 * ── The rules now ─────────────────────────────────────────────────────────────────────────────
 * - Every sale has one immutable `saleId`; its order is `o_<saleId>` (utils/saleIdentity).
 * - CREATE writes the sale and its order in ONE transaction: both or neither.
 * - EDIT finds the sale by id in the lead as it is now, lays on only what the form changed
 *   (utils/saleEdit.mergeSaleEdit), and updates the same order and its job in the same transaction —
 *   never a second sale. A sale the tech team has started can still be edited (not its service), the
 *   assignment is kept, and the tech admin, the team leaders and the member holding the job are told.
 * - DELETE of a sale nobody is working on removes it everywhere in one transaction: the sale, its order,
 *   its client chat, its social-media month — then its bells. A sale with work on it is never deleted.
 *   Deleting a lead deletes its sales the same way, and is refused while any of them has work.
 * - Assigning re-reads the order inside a transaction (services/workAssign), so a deleted sale can
 *   never get a job, and a sale never gets two.
 *
 * Firestore transactions read the latest documents and retry on contention, so two people writing the
 * same lead — a salesperson editing while the sales admin approves — both land.
 */
import {
  collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, Timestamp, where,
  type Transaction,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import {
  afterOrderWrite, newOrderForSale, notifyTechSideOfNewOrder, orderProgressForSale, orderSaleFields,
  orderUpdateForSale, removeOrderNotifications,
} from "@/services/orders";
import { unlinkRenewal } from "@/services/smm";
import { clearedLeadFreezeFields } from "@/services/numberLock";
import {
  findSaleIndex, leadHoldsSaleOf, leadSaleItems, newSaleId, orderIdOfSale, orderIdOfSaleId, timestampMs,
  withSaleIds,
} from "@/utils/saleIdentity";
import {
  jobPatchForSaleEdit, lockedServiceChange, mergeSaleEdit, saleChangeList, saleEditNotice, saleHasWork,
  sameSaleValue, type SaleChange, type SaleEditAudience,
} from "@/utils/saleEdit";
import type { AppUser, Lead, Order, SaleDetail, WorkAssignment } from "@/types";
import type { SmmCampaign } from "@/types/smm";

/* ── Refusals ──────────────────────────────────────────────────────────────────────────────── */

export type SaleWriteErrorCode = "lead_missing" | "sale_missing" | "sale_has_work" | "service_locked";

/** A sale write that was refused, with a sentence the screen can show as it is. */
export class SaleWriteError extends Error {
  constructor(
    readonly code: SaleWriteErrorCode,
    message: string,
    /** The work in the way, when there is some — for the screen to name it. */
    readonly work?: { uniqueId?: string; memberName?: string } | null,
  ) {
    super(message);
    this.name = "SaleWriteError";
  }
}

/** Is this a refusal the person should read (rather than a failure to retry)? */
export function isSaleWriteError(err: unknown): err is SaleWriteError {
  return err instanceof SaleWriteError || (!!err && (err as { name?: string }).name === "SaleWriteError");
}

/**
 * A follow-up that must never fail the write it follows — a bell, a chat refresh, a renewal link. Awaited,
 * whatever it returns (a promise, or nothing at all from a stub), and any error is only logged.
 */
async function quietly(label: string, run: () => unknown): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.warn(`[sales] ${label}:`, err);
  }
}

const leadRefOf = (leadId: string) => doc(db, "leads", leadId);
const orderRefOf = (orderId: string) => doc(db, "orders", orderId);
const chatRefOf = (orderId: string) => doc(db, "order_chats", orderId);
const campaignRefOf = (orderId: string) => doc(db, "smm_campaigns", orderId);
const jobRefOf = (jobId: string) => doc(db, "work_assignments", jobId);

/** The jobs that point at an order — normally one; several for a bulk order or a social-media month. */
async function jobsForOrder(orderId: string): Promise<WorkAssignment[]> {
  const snap = await getDocs(query(collection(db, "work_assignments"), where("orderId", "==", orderId)));
  return snap.docs.map((d) => ({ ...(d.data() as WorkAssignment), id: d.id }));
}

/** "The tech team is already working on this sale (P012 · Ravi)." */
function workRefusal(what: string, work: { uniqueId?: string; memberName?: string } | null): SaleWriteError {
  const named = [work?.uniqueId, work?.memberName].filter(Boolean).join(" · ");
  return new SaleWriteError(
    "sale_has_work",
    `The tech team is already working on ${what}${named ? ` (${named})` : ""}, so it can't be deleted. `
      + "Edit the sale instead, or ask the tech admin to take the work back first.",
    work,
  );
}

/** The lead's sale list as written: every entry with its id, `saleDetails` mirroring the last. */
function leadSalesPatch(items: SaleDetail[]): Record<string, unknown> {
  return { saleItems: items, saleDetails: items.length ? items[items.length - 1] : null, lastUpdated: serverTimestamp() };
}

/* ── Create ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Record a NEW sale on a lead, and its order, in one transaction.
 *
 * The sale gets its `saleId` here — from its lead and the millisecond it was recorded — and its order
 * is `o_<saleId>`. Saving the same sale again (a retry after a dropped connection) finds it already
 * there and writes nothing. Then, outside the transaction and never fatal: the tech side's "new order"
 * bell, the client's chat and, for a social-media month, its plan.
 */
export async function recordSale(params: {
  leadId: string;
  /** The new sale as the form built it. Its `saleId` is set here; `submittedAt` too, when absent. */
  item: SaleDetail;
  soldByName: string;
  salesAdminId: string | null;
  /** Ring the tech side's "new order" bell (default). */
  announce?: boolean;
}): Promise<{ saleId: string; orderId: string; itemIndex: number; item: SaleDetail; lead: Lead }> {
  const { leadId, soldByName, salesAdminId } = params;
  const submittedAt = params.item.submittedAt || Timestamp.now();
  const recordedMs = timestampMs(submittedAt);
  const fields: SaleDetail = { ...params.item, submittedAt };
  delete (fields as { saleId?: string }).saleId;

  const result = await runTransaction(db, async (tx) => {
    const leadSnap = await tx.get(leadRefOf(leadId));
    if (!leadSnap.exists()) {
      throw new SaleWriteError("lead_missing", "This client's lead no longer exists, so the sale was not saved.");
    }
    const lead = { ...(leadSnap.data() as Lead), id: leadSnap.id };
    const items = withSaleIds(leadId, leadSaleItems(lead));
    /*
      The id is the millisecond the sale was recorded. The same id already on the lead is either THIS
      sale saved again (a retry — identical content: nothing more to write) or a different sale recorded
      in the same millisecond, which takes the next free millisecond instead of being mistaken for it.
    */
    let saleId = newSaleId(leadId, recordedMs);
    for (let ms = recordedMs, i = 0; i < 1000; i += 1) {
      const at = findSaleIndex(leadId, items, saleId);
      if (at < 0) break;
      const { saleId: _held, ...held } = items[at];
      if (sameSaleValue(held, fields)) return { lead, itemIndex: at, created: false, item: items[at] };
      ms += 1;
      saleId = newSaleId(leadId, ms);
    }
    const item: SaleDetail = { ...fields, saleId };
    const orderId = orderIdOfSaleId(saleId);
    const orderSnap = await tx.get(orderRefOf(orderId));

    const next = [...items, item];
    tx.update(leadRefOf(leadId), { ...leadSalesPatch(next), saleDone: true });
    const saleFields = orderSaleFields(lead, item, next.length - 1, soldByName, salesAdminId);
    const progress = orderProgressForSale(item);
    if (!orderSnap.exists()) {
      tx.set(orderRefOf(orderId), newOrderForSale(saleFields, progress, item.verificationStatus === "verified"));
      return { lead, itemIndex: next.length - 1, created: true, item };
    }
    const patch = orderUpdateForSale(orderSnap.data() as Order, saleFields, progress);
    if (patch) tx.update(orderRefOf(orderId), patch);
    return { lead, itemIndex: next.length - 1, created: false, item };
  });

  const item = result.item;
  const saleId = item.saleId as string;
  const orderId = orderIdOfSaleId(saleId);
  const saleFields = orderSaleFields(result.lead, item, result.itemIndex, soldByName, salesAdminId);
  // A renewal announces itself — "renewed, same team on it" — from `ensureCampaignForOrder`.
  const announce = params.announce !== false && !(item.category === "social_media_management" && item.smm?.renewalOf);
  if (result.created && announce) {
    await quietly("new-order bell", () => notifyTechSideOfNewOrder({
      id: orderId, businessName: saleFields.businessName, category: item.category, soldByName, promise: item.promise ?? null,
    }));
  }
  await quietly("after recording the sale", () => afterOrderWrite({ orderId, lead: result.lead, item, saleFields, soldByName, salesAdminId }));
  return { saleId, orderId, itemIndex: result.itemIndex, item, lead: result.lead };
}

/* ── Edit ──────────────────────────────────────────────────────────────────────────────────── */

export interface SaleEditResult {
  /** False when the form changed nothing (or the sale already reads exactly that). */
  changed: boolean;
  changes: SaleChange[];
  item: SaleDetail | null;
  itemIndex: number;
  /** The tech side had started — the edit reached the job and they were told. */
  hasWork: boolean;
  orderId: string;
}

/**
 * Save an edit of an existing sale — the same sale, by its id.
 *
 * `base` is the copy the form opened on and `next` the copy it built on Save; only what the form
 * changed is laid onto the sale as it is now (an approval or a payment that arrived meanwhile is
 * kept). In the same transaction the sale's order is brought up to date — its status, job and
 * assignee untouched — and, when the tech side has started, the job is too (only the fields the edit
 * changed; see `jobPatchForSaleEdit`). A sale the tech side has started cannot change its service.
 *
 * Throws `SaleWriteError` when the sale is gone or the edit touches what is locked.
 */
export async function updateSale(params: {
  leadId: string;
  saleId: string;
  base: SaleDetail;
  next: SaleDetail;
  editor: { uid?: string | null; name: string };
  soldByName: string;
  salesAdminId: string | null;
  knownLanguages?: string[];
}): Promise<SaleEditResult> {
  const { leadId, saleId, base, next, editor, soldByName, salesAdminId, knownLanguages } = params;
  const orderId = orderIdOfSaleId(saleId);
  const queriedJobs = await jobsForOrder(orderId);

  const result = await runTransaction(db, async (tx) => {
    const leadSnap = await tx.get(leadRefOf(leadId));
    if (!leadSnap.exists()) throw new SaleWriteError("lead_missing", "This client's lead no longer exists.");
    const orderSnap = await tx.get(orderRefOf(orderId));
    const order = orderSnap.exists() ? ({ ...(orderSnap.data() as Order), id: orderId }) : null;
    // Every job pointing at this order, and the one the order points at (assigned a moment ago).
    const jobIds = new Set(queriedJobs.map((j) => j.id));
    if (order?.workAssignmentId) jobIds.add(order.workAssignmentId);
    const jobs: WorkAssignment[] = [];
    for (const id of jobIds) {
      const snap = await tx.get(jobRefOf(id));
      if (snap.exists()) jobs.push({ ...(snap.data() as WorkAssignment), id });
    }

    const lead = { ...(leadSnap.data() as Lead), id: leadSnap.id };
    const items = withSaleIds(leadId, leadSaleItems(lead));
    const index = findSaleIndex(leadId, items, saleId);
    if (index < 0) {
      throw new SaleWriteError("sale_missing", "This sale no longer exists — it may have been deleted. Nothing was saved.");
    }
    const fresh = items[index];
    const merged = mergeSaleEdit(fresh, base, next);
    const changes = saleChangeList(fresh, merged);
    const hasWork = saleHasWork(order) || jobs.length > 0;
    if (changes.length === 0) {
      return { changed: false, changes, item: fresh, index, hasWork, order, jobs, lead, created: false, saleFields: null as null | ReturnType<typeof orderSaleFields> };
    }
    if (hasWork) {
      const locked = lockedServiceChange(fresh, merged);
      if (locked) throw new SaleWriteError("service_locked", locked);
    }

    const at = Timestamp.now();
    const saved: SaleDetail = {
      ...merged,
      saleId,
      editedAt: at,
      editLog: [...(fresh.editLog || []), { at, byName: editor.name || "", changes: changes.map((c) => c.text) }],
    };
    const nextItems = items.map((it, i) => (i === index ? saved : it));
    tx.update(leadRefOf(leadId), leadSalesPatch(nextItems));

    const saleFields = orderSaleFields(lead, saved, index, soldByName, salesAdminId);
    const progress = orderProgressForSale(saved);
    let created = false;
    if (!order) {
      // A sale with no order (one held back under an older rule) gets it now, under its own id.
      tx.set(orderRefOf(orderId), newOrderForSale(saleFields, progress, saved.verificationStatus === "verified"));
      created = true;
    } else {
      const patch = orderUpdateForSale(order, saleFields, progress);
      if (patch) {
        tx.update(orderRefOf(orderId), patch);
        // The job follows its sale: only what this edit changed, and never a social-media month's
        // job — its month's setup owns those.
        const nextOrder = { ...order, ...patch, id: orderId } as Order;
        for (const job of jobs) {
          if (job.smmCampaignId || job.category === "social_media_management") continue;
          const jobPatch = jobPatchForSaleEdit(order, nextOrder, job, knownLanguages);
          if (Object.keys(jobPatch).length > 0) tx.update(jobRefOf(job.id), jobPatch);
        }
      }
    }
    return { changed: true, changes, item: saved, index, hasWork, order, jobs, lead, created, saleFields };
  });

  if (result.changed && result.item && result.saleFields) {
    const announce = !(result.item.category === "social_media_management" && result.item.smm?.renewalOf);
    if (result.created && announce) {
      const created = result.saleFields;
      const saved = result.item;
      await quietly("new-order bell", () => notifyTechSideOfNewOrder({
        id: orderId, businessName: created.businessName, category: saved.category, soldByName,
        promise: saved.promise ?? null,
      }));
    }
    const { lead: savedLead, item: savedItem, saleFields: savedFields } = result;
    await quietly("after editing the sale", () => afterOrderWrite({
      orderId, lead: savedLead, item: savedItem, saleFields: savedFields, soldByName, salesAdminId,
    }));
    if (result.hasWork && result.order) {
      await notifySaleEdited({
        orderId,
        saleId,
        order: result.order,
        jobs: result.jobs,
        business: result.saleFields.businessName,
        editorName: editor.name,
        editorUid: editor.uid || null,
        changes: result.changes,
        stamp: timestampMs(result.item.editedAt),
      });
    }
  }
  return {
    changed: result.changed,
    changes: result.changes,
    item: result.item,
    itemIndex: result.index,
    hasWork: result.hasWork,
    orderId,
  };
}

/**
 * Tell the tech side a sale they are working on was edited — a popup (`sale_edited`) for every tech
 * admin and team leader and for each member holding one of its jobs, with what changed (no money for
 * the leaders and members). One notification per person per edit. Never throws.
 */
async function notifySaleEdited(params: {
  orderId: string;
  saleId: string;
  order: Order;
  jobs: WorkAssignment[];
  business: string;
  editorName: string;
  editorUid: string | null;
  changes: SaleChange[];
  stamp: number;
}): Promise<void> {
  const { orderId, saleId, order, jobs, business, editorName, editorUid, changes, stamp } = params;
  try {
    const smm = order.category === "social_media_management";
    const snap = await getDocs(query(collection(db, "users"), where("role", "in", ["tech_admin", "tech_team_leader"])));
    const recipients = new Map<string, SaleEditAudience>();
    for (const d of snap.docs) {
      const u = d.data() as AppUser;
      if (u.isActive === false) continue;
      recipients.set(d.id, u.role === "tech_admin" ? "tech_admin" : "tech_team_leader");
    }
    // The people holding its work. A seat held by a team leader reads as a team leader.
    const holders = new Set(jobs.map((j) => j.assignedTo).filter(Boolean));
    if (order.assignedTo) holders.add(order.assignedTo);
    for (const uid of holders) if (!recipients.has(uid)) recipients.set(uid, "tech_member");
    if (editorUid) recipients.delete(editorUid);

    const firstJob = jobs[0] || null;
    const uniqueId = jobs.length === 1 ? firstJob?.uniqueId : null;
    const memberUid = order.assignedTo || firstJob?.assignedTo || "";
    const linkFor = (audience: SaleEditAudience): string => {
      if (smm) return `/smm/${orderId}`;
      if (audience === "tech_member") return "/tech/my-work";
      const base = audience === "tech_admin" ? "/tech-admin" : "/team-leader";
      return memberUid ? `${base}/work-assign/${memberUid}` : `${base}/orders`;
    };

    await Promise.all([...recipients.entries()].map(([uid, audience]) => {
      const notice = saleEditNotice({ audience, business, uniqueId, editorName, changes });
      return quietly("sale_edited bell", () => sendNotification({
        userId: uid,
        type: "sale_edited",
        title: notice.title,
        message: notice.message,
        link: linkFor(audience),
        meta: { saleId, orderId, uniqueId: uniqueId || null, changes: notice.lines },
        // One edit is one event for each person; the next edit is a new one.
        dedupeKey: `sale_edited_${saleId}_${stamp}_${uid}`,
      }));
    }));
  } catch (err) {
    console.error("[sales] could not tell the tech side about the edit:", err);
  }
}

/* ── Delete ────────────────────────────────────────────────────────────────────────────────── */

export interface SaleDeleteResult {
  /** False when the sale was already gone (somebody else deleted it). */
  deleted: boolean;
  item: SaleDetail | null;
  /** The lead has no sale left — the caller lifts the number's sale freeze. */
  noSalesLeft: boolean;
  orderId: string;
}

/** What a sale still has on the tech side, read in the transaction before anything is removed. */
interface TechSide {
  order: Order | null;
  chatExists: boolean;
  chatAssignment: string | null;
  campaign: SmmCampaign | null;
}

async function readTechSide(tx: Transaction, orderId: string): Promise<TechSide> {
  const [orderSnap, chatSnap, campaignSnap] = [
    await tx.get(orderRefOf(orderId)),
    await tx.get(chatRefOf(orderId)),
    await tx.get(campaignRefOf(orderId)),
  ];
  const chat = chatSnap.exists() ? (chatSnap.data() as { assignmentId?: string | null }) : null;
  return {
    order: orderSnap.exists() ? ({ ...(orderSnap.data() as Order), id: orderId }) : null,
    chatExists: chatSnap.exists(),
    chatAssignment: chat?.assignmentId || null,
    campaign: campaignSnap.exists() ? ({ ...(campaignSnap.data() as SmmCampaign), id: orderId }) : null,
  };
}

/** Remove a sale's tech-side documents inside the transaction. */
function removeTechSide(tx: Transaction, orderId: string, side: TechSide): void {
  if (side.order) tx.delete(orderRefOf(orderId));
  if (side.chatExists) tx.delete(chatRefOf(orderId));
  if (side.campaign) tx.delete(campaignRefOf(orderId));
}

/** After a sale's tech side is gone: its bells, and the month a deleted renewal had renewed. */
async function afterTechSideRemoved(orderId: string, side: TechSide): Promise<void> {
  await removeOrderNotifications(orderId, { smm: !!side.campaign || side.order?.category === "social_media_management" });
  const renewed = side.campaign?.renewalOf;
  if (renewed) await quietly("un-renew the month before", () => unlinkRenewal(renewed, orderId));
}

/**
 * Delete a sale nobody on the tech side has started — permanently, everywhere, at once: the sale, its
 * order, its client chat and its social-media month in one transaction, then the order's bells.
 *
 * A sale with work on it (a job, an assignment, a month set up, a delivery) is NEVER deleted: throws
 * `SaleWriteError("sale_has_work")` naming the job. Deleting a sale that is already gone is a no-op.
 */
export async function deleteSale(params: { leadId: string; saleId: string }): Promise<SaleDeleteResult> {
  const { leadId, saleId } = params;
  const orderId = orderIdOfSaleId(saleId);
  // A job made for this order — even one the order lost track of — means the work has started.
  const jobs = await jobsForOrder(orderId);
  if (jobs.length > 0) throw workRefusal("this sale", { uniqueId: jobs[0].uniqueId });

  const result = await runTransaction(db, async (tx) => {
    const leadSnap = await tx.get(leadRefOf(leadId));
    const side = await readTechSide(tx, orderId);
    if (!leadSnap.exists()) return { deleted: false, item: null, noSalesLeft: false, side };
    const items = withSaleIds(leadId, leadSaleItems(leadSnap.data() as Lead));
    const index = findSaleIndex(leadId, items, saleId);
    if (index < 0) return { deleted: false, item: null, noSalesLeft: items.length === 0, side };
    if (saleHasWork(side.order) || side.chatAssignment) {
      throw workRefusal("this sale", { memberName: side.order?.assignedToName || undefined });
    }
    const left = items.filter((_, i) => i !== index);
    const noSalesLeft = left.length === 0;
    tx.update(leadRefOf(leadId), {
      ...leadSalesPatch(left),
      // No sales left → the number is no longer sold: lift the lead's freeze mirror too.
      ...(noSalesLeft ? { saleDone: false, ...clearedLeadFreezeFields() } : {}),
    });
    removeTechSide(tx, orderId, side);
    return { deleted: true, item: items[index], noSalesLeft, side };
  });

  if (result.deleted) await afterTechSideRemoved(orderId, result.side);
  return { deleted: result.deleted, item: result.item, noSalesLeft: result.noSalesLeft, orderId };
}

/**
 * Delete a whole lead — and with it every sale on it, the same way `deleteSale` deletes one.
 *
 * Until 2026-10-08 deleting a lead (My Leads' custom lead, the sales admin's Leads pages) removed the
 * lead document only, and every order of its sales stayed in the tech queue with nothing behind it. A
 * lead holding a sale the tech side has started is refused (`SaleWriteError("sale_has_work")`).
 * Returns how many sales went with it. A lead already gone is a no-op.
 */
export async function deleteLeadWithSales(leadId: string): Promise<{ deleted: boolean; removedSales: number }> {
  const leadSnap = await getDoc(leadRefOf(leadId));
  if (!leadSnap.exists()) return { deleted: false, removedSales: 0 };
  const orderIds = leadSaleItems(leadSnap.data() as Lead).map((it, i) => orderIdOfSale(leadId, it, i));
  for (const orderId of orderIds) {
    const jobs = await jobsForOrder(orderId);
    if (jobs.length > 0) throw workRefusal("a sale on this lead", { uniqueId: jobs[0].uniqueId });
  }

  const result = await runTransaction(db, async (tx) => {
    const fresh = await tx.get(leadRefOf(leadId));
    if (!fresh.exists()) return { deleted: false, sides: [] as { orderId: string; side: TechSide }[] };
    const ids = leadSaleItems(fresh.data() as Lead).map((it, i) => orderIdOfSale(leadId, it, i));
    const sides: { orderId: string; side: TechSide }[] = [];
    for (const orderId of ids) sides.push({ orderId, side: await readTechSide(tx, orderId) });
    for (const { side } of sides) {
      if (saleHasWork(side.order) || side.chatAssignment) {
        throw workRefusal("a sale on this lead", { memberName: side.order?.assignedToName || undefined });
      }
    }
    tx.delete(leadRefOf(leadId));
    for (const { orderId, side } of sides) removeTechSide(tx, orderId, side);
    return { deleted: true, sides };
  });

  if (result.deleted) {
    for (const { orderId, side } of result.sides) await afterTechSideRemoved(orderId, side);
  }
  return { deleted: result.deleted, removedSales: result.sides.length };
}

/* ── Changing sales in place (approvals, payments) ─────────────────────────────────────────── */

/**
 * Change one or more sales on a lead, found by their ids in the lead as it is now — in a transaction.
 *
 * For Sales Approvals and the payment panel, which used to change `items[i]` of the list they had read
 * and write the whole list back: an approval could undo an edit saved a moment earlier, or drop a sale
 * added meanwhile (and that sale's order stayed in the tech queue with no sale behind it). Sales not
 * found (deleted meanwhile) are skipped. Returns the lead as written and where each changed sale sits,
 * for the order calls that follow.
 */
export async function mutateSaleItems(
  leadId: string,
  saleIds: string[],
  mutate: (item: SaleDetail) => SaleDetail,
): Promise<{ lead: Lead; items: SaleDetail[]; changed: { saleId: string; index: number; before: SaleDetail; item: SaleDetail }[] }> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(leadRefOf(leadId));
    if (!snap.exists()) throw new SaleWriteError("lead_missing", "This lead no longer exists.");
    const lead = { ...(snap.data() as Lead), id: snap.id };
    const items = withSaleIds(leadId, leadSaleItems(lead));
    const changed: { saleId: string; index: number; before: SaleDetail; item: SaleDetail }[] = [];
    for (const saleId of new Set(saleIds)) {
      const index = findSaleIndex(leadId, items, saleId);
      if (index < 0) continue;
      const before = items[index];
      const item = { ...mutate(before), saleId: before.saleId };
      items[index] = item;
      changed.push({ saleId, index, before, item });
    }
    if (changed.length > 0) tx.update(leadRefOf(leadId), leadSalesPatch(items));
    return { lead: { ...lead, saleItems: items }, items, changed };
  });
}

/* ── Orders whose sale is gone (cleanup on open) ───────────────────────────────────────────── */

/** Orders already checked this session — each costs a read of its lead, once. */
const checkedOrders = new Set<string>();

/** Tests only: forget what was checked, as a new session would. */
export function __resetOrphanChecksForTests(): void {
  checkedOrders.clear();
}

/**
 * Remove waiting orders whose sale no longer exists — left by the deletes that did not reach the tech
 * side before 2026-10-08 (a lead deleted with its sales, a delete whose order removal failed).
 *
 * Runs when the tech queue opens (no scheduler on this stack). Only an order nobody has started —
 * `unassigned`, no job pointing at it — and only when its lead is gone or provably no longer holds its
 * sale (`leadHoldsSaleOf`, lenient: a matching id, recorded millisecond or second keeps it). Re-checked
 * inside a transaction before anything is removed. One read per lead, once a session. Returns how many
 * it removed. Never throws.
 */
export async function healOrphanOrdersOnOpen(orders: Order[]): Promise<number> {
  const candidates = orders.filter((o) => o.status === "unassigned" && !o.workAssignmentId && !o.deleted
    && !!o.leadId && !checkedOrders.has(o.id));
  if (candidates.length === 0) return 0;
  for (const o of candidates) checkedOrders.add(o.id);

  const leads = new Map<string, Lead | null>();
  let removed = 0;
  for (const order of candidates) {
    try {
      if (!leads.has(order.leadId)) {
        const snap = await getDoc(leadRefOf(order.leadId));
        leads.set(order.leadId, snap.exists() ? ({ ...(snap.data() as Lead), id: snap.id }) : null);
      }
      if (leadHoldsSaleOf(order, leads.get(order.leadId))) continue;
      if ((await jobsForOrder(order.id)).length > 0) continue;

      const side = await runTransaction(db, async (tx) => {
        const leadSnap = await tx.get(leadRefOf(order.leadId));
        const now = await readTechSide(tx, order.id);
        const lead = leadSnap.exists() ? (leadSnap.data() as Lead) : null;
        if (!now.order || now.order.status !== "unassigned" || now.order.workAssignmentId || now.chatAssignment) return null;
        if (leadHoldsSaleOf(now.order, lead)) return null;
        removeTechSide(tx, order.id, now);
        return now;
      });
      if (side) {
        await afterTechSideRemoved(order.id, side);
        removed += 1;
      }
    } catch (err) {
      // Proves nothing — left alone, and tried again next session (not on every snapshot: a read
      // that keeps failing must not cost a read each time the queue changes).
      console.warn("[sales] orphan check failed for", order.id, err);
    }
  }
  return removed;
}
