/**
 * The tech side's half of a social-media sale: finding it, and setting its month up (2026-10-03).
 *
 * ── Why every month starts from a sale ────────────────────────────────────────────────────────
 * The salesperson who made a sale has to see it in their own login — as their sale, in their totals,
 * on their commission — and the tech side has to be able to put it into the system when the
 * salesperson did not. Both are true only if the month hangs off a real sale on that salesperson's
 * lead: everything in a sales login reads from their leads and orders. So "Add SMM sale" either
 * finds the sale that already exists for the client's number, or records one on the salesperson's
 * behalf through the ordinary sale form (SaleForm `onBehalfOf`) — never a month with nothing behind it.
 *
 * ── Why a sale that already exists is never recorded again ────────────────────────────────────
 * Removing or purging an order on the tech side leaves the SALE on the salesperson's lead, and it
 * keeps counting in their revenue and commission. Recording that month again as a new sale would pay
 * them twice. `findSmmSalesForPhone` shows every sale already on the number, and `setupSaleMonth`
 * brings its own order back — the order id is derived from the sale's own time, so it is the same
 * order, not a new one.
 *
 * ── The one month with no sale (2026-10-03) ───────────────────────────────────────────────────
 * A client the company was serving before sales were recorded here has no sale to find, and
 * recording one now would put old money into a salesperson's figures today. `addNoSaleMonth` adds
 * that month on its own: in the salesperson's login with its dates, in nobody's revenue or
 * commission, and continued by the salesperson's Renew — a sale — from the next month.
 */
import { collection, doc, getDoc, getDocs, query, setDoc, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { logTechActivity, type ActivityActor } from "@/services/activityLog";
import { adminAssignNumber } from "@/services/numberLock";
import { fetchOrder, orderDocId, restoreOrders, upsertOrderForSale } from "@/services/orders";
import {
  buildNoSaleCampaign, buildSoldCampaign, campaignInputFromSale, campaignRef, fetchCampaign, monthPromise,
  saveMonthSetup, setMonthCommitments, setMonthPlatforms,
} from "@/services/smm";
import { assignSmmMonth, fetchMonthJobs, type SmmAssignResult } from "@/services/smmAssign";
import { releasedToTech } from "@/utils/saleDiscount";
import { dayToDate, isoDay } from "@/utils/smmPlan";
import {
  cleanPlatforms, cycleRangeLabel, cyclesOverlap, hasTeam, isNoSaleMonth, jobsByMember, linksForAccounts, monthCycle,
  monthLabel, needsSetup, noSaleMonthProblem, normaliseClipsPerVideo, saleDay, smmSalesOnLeads,
} from "@/utils/smmPackage";
import { normalizePhone, phoneLockId, phoneVariants } from "@/utils/phone";
import type { AppUser, Lead, Order, SaleDetail, WorkAssignment } from "@/types";
import type { SmmCampaign, SmmContentKind, SmmCycle, SmmPlatform, SmmTeam } from "@/types/smm";

/* ── Finding what is already there ──────────────────────────────────────────────────────────── */

/** Where one recorded sale's month stands — decides what the dialog offers for it. */
export type SmmSaleState =
  | "rejected"     // the sales admin rejected the sale: nothing to set up
  | "held"         // over the salesperson's discount limit, waiting on the sales admin
  | "needs_setup"  // order and month exist, nobody on it yet
  | "live"         // running, with a team
  | "finished"     // closed: renewed, lapsed or completed
  | "history"      // set up after its dates had passed
  | "removed"      // its order was taken out of the queue
  | "deleted"      // its month was deleted
  | "no_order";    // its order was purged (or never made)

export interface SmmSaleRecord {
  leadId: string;
  itemIndex: number;
  item: SaleDetail;
  sellerUid: string;
  sellerName: string;
  /** `yyyy-MM-dd` the sale was made — the default first day of its month. */
  soldDay: string;
  orderId: string;
  order: Order | null;
  campaign: SmmCampaign | null;
  state: SmmSaleState;
  businessName: string;
}

/** Can the tech side set this sale's month up from here? */
export function canSetUpSale(state: SmmSaleState): boolean {
  return state === "needs_setup" || state === "removed" || state === "deleted" || state === "no_order";
}

function stateOf(item: SaleDetail, order: Order | null, campaign: SmmCampaign | null, today: string): SmmSaleState {
  if (item.verificationStatus === "rejected") return "rejected";
  if (!releasedToTech(item)) return "held";
  if (!order) return "no_order";
  if (order.deleted || order.status === "deleted") return "removed";
  if (!campaign) return "removed";
  if (campaign.status === "deleted") return "deleted";
  if (campaign.status === "removed") return "removed";
  if (campaign.history) return "history";
  if (campaign.status !== "active") return "finished";
  return needsSetup(campaign, today) ? "needs_setup" : "live";
}

/** The leads on a number, in every form it gets written down in. */
async function leadsForPhone(phone: string): Promise<Lead[]> {
  const variants = phoneVariants(phone);
  if (variants.length === 0) return [];
  const snap = await getDocs(query(collection(db, "leads"), where("phone", "in", variants.slice(0, 30))));
  return snap.docs.map((d) => ({ ...(d.data() as Lead), id: d.id }));
}

/**
 * Every social-media sale ever recorded for a number, by any salesperson, with where its month
 * stands — oldest first.
 *
 * One query for the leads (an `in` over the forms of the number), then the order and the month of
 * each sale by id, then each distinct salesperson's name. Nothing scans a collection.
 */
export async function findSmmSalesForPhone(phone: string): Promise<SmmSaleRecord[]> {
  const leads = await leadsForPhone(phone);
  const sales = smmSalesOnLeads(leads);
  if (sales.length === 0) return [];
  const today = isoDay(new Date());

  const names = new Map<string, string>();
  await Promise.all([...new Set(sales.map((s) => s.sellerUid))].map(async (uid) => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      names.set(uid, snap.exists() ? (snap.data() as AppUser).name || "Salesperson" : "Salesperson");
    } catch {
      names.set(uid, "Salesperson");
    }
  }));

  return Promise.all(sales.map(async (s) => {
    const orderId = orderDocId(s.leadId, s.item, s.itemIndex);
    const [order, campaign] = await Promise.all([fetchOrder(orderId), fetchCampaign(orderId).catch(() => null)]);
    const lead = leads.find((l) => l.id === s.leadId);
    return {
      leadId: s.leadId,
      itemIndex: s.itemIndex,
      item: s.item,
      sellerUid: s.sellerUid,
      sellerName: names.get(s.sellerUid) || "Salesperson",
      soldDay: saleDay(s.item, today),
      orderId,
      order,
      campaign,
      state: stateOf(s.item, order, campaign, today),
      businessName: s.item.requirement?.businessName?.trim() || lead?.realName || lead?.displayName || "",
    };
  }));
}

/**
 * The salesperson's own lead for this number — the one a sale recorded on their behalf goes on.
 *
 * Their existing lead when they have one (the common case: they spoke to this client). Otherwise
 * the number is put on their leads through the sales admin's own assignment path, which keeps every
 * lock rule: refused while another salesperson holds the number inside its 24-hour reservation or a
 * sale freeze, and the dialog says who has it.
 */
export async function leadForSeller(params: {
  seller: { uid: string; name: string };
  phone: string;
  displayName: string;
  actor: { uid: string; name: string };
}): Promise<{ ok: true; lead: Lead } | { ok: false; message: string }> {
  const { seller, phone, displayName, actor } = params;
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, message: "Enter the client's WhatsApp number." };

  const theirs = (await leadsForPhone(normalized)).find((l) => l.assignedTo === seller.uid && !l.frozen);
  if (theirs) return { ok: true, lead: theirs };

  const result = await adminAssignNumber({ admin: actor, member: seller, phone: normalized, displayName });
  const fetchLead = async (id: string | null | undefined) => {
    if (!id) return null;
    const snap = await getDoc(doc(db, "leads", id));
    return snap.exists() ? ({ ...(snap.data() as Lead), id: snap.id }) : null;
  };
  switch (result.kind) {
    case "created":
    case "takeover": {
      const lead = await fetchLead(result.leadId);
      return lead ? { ok: true, lead } : { ok: false, message: "The lead could not be read back. Try again." };
    }
    case "already_with_member": {
      const lock = await getDoc(doc(db, "numberLocks", normalized.replace(/[^0-9]/g, "")));
      const lead = await fetchLead(lock.exists() ? (lock.data() as { ownerLeadId?: string }).ownerLeadId : null);
      return lead
        ? { ok: true, lead }
        : { ok: false, message: `${seller.name} holds this number but has no lead for it. Ask them to add it in My Leads.` };
    }
    case "reserved":
      return { ok: false, message: `${result.ownerName} has this number reserved until ${result.until.toLocaleString()}.` };
    case "sale_frozen":
      return { ok: false, message: `${result.saleByName} sold to this client recently, so the number is held until ${result.until.toLocaleDateString()}.` };
    default:
      return { ok: false, message: "Could not put this number on their leads." };
  }
}

/** Active salespeople, by name — who a sale can be recorded for. Read once, when the dialog needs it. */
export async function fetchSalesPeople(): Promise<{ uid: string; name: string; createdBy?: string | null }[]> {
  try {
    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "sales_member")));
    return snap.docs
      .map((d) => ({ ...(d.data() as AppUser), uid: d.id }))
      .filter((u) => u.isActive !== false)
      .map((u) => ({ uid: u.uid, name: u.name, createdBy: u.createdBy || null }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (err) {
    console.error("[smmSetup] fetchSalesPeople:", err);
    return [];
  }
}

/** The sale form's lead writer, for a lead that is not the signed-in member's own. */
export async function updateLeadDoc(id: string, data: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, "leads", id), { ...data, lastUpdated: serverTimestamp() });
}

/** Tell the salesperson a sale was recorded in their name, and where it now waits. */
export async function notifySellerOfEnteredSale(params: {
  sellerUid: string;
  actorName: string;
  businessName: string;
  item: SaleDetail;
  leadId: string;
}): Promise<void> {
  const { sellerUid, actorName, businessName, item, leadId } = params;
  await sendNotification({
    userId: sellerUid,
    type: "smm_sale_entered",
    title: "A social media sale was recorded for you",
    message: `${actorName} recorded ${businessName || "a client"}'s social media month in your name — ${item.packageKey || "custom"}, ₹${(item.amount || 0).toLocaleString("en-IN")}. It counts as your sale once the sales admin verifies it.`,
    link: `/sales/leads?lead=${encodeURIComponent(leadId)}`,
    dedupeKey: `smm_sale_entered_${leadId}_${(item.submittedAt as { seconds?: number } | undefined)?.seconds ?? ""}`,
  }).catch(() => undefined);
}

/* ── Setting the month up ───────────────────────────────────────────────────────────────────── */

export interface MonthSetupInput {
  /** The month's name — the business or page name it is known by. Absent leaves it as it is. */
  businessName?: string;
  /**
   * How many videos, posters and real videos the month owes — the sale's numbers unless the tech side
   * agreed different ones with the client. Absent leaves them as they are.
   */
  commitments?: Record<SmmContentKind, number>;
  startDate: string;
  endDate: string;
  clipsPerVideo: number;
  pageLinks?: Partial<Record<SmmPlatform, string>> | null;
  /**
   * The accounts the month covers (2026-10-05) — "Accounts it covers" in setup. Absent leaves them as
   * they are: the no-sale step picks them beside its package and passes them on its own.
   */
  platforms?: SmmPlatform[];
  team: SmmTeam;
}

/**
 * Rename a month (2026-10-03) — the business or page name the board, its page, the top bar and the
 * team's job cards all show.
 *
 * Marked as the tech side's own name (`businessNameEdited`), so an edit or approval of the sale no
 * longer copies the sale's business name back over it. The month's job cards follow, because a member
 * looking for "the Sri Sai Silks Instagram" in My Work should find it under the same name. The order
 * keeps the name from the sale — that is the salesperson's record of what they sold. Returns false when
 * there was nothing to change.
 */
export async function renameMonth(campaignId: string, name: string): Promise<boolean> {
  const next = name.trim().replace(/\s+/g, " ");
  if (!next) throw new Error("Give the month a name.");
  const before = await fetchCampaign(campaignId);
  if (!before) throw new Error("This month no longer exists.");
  if ((before.businessName || "").trim() === next) return false;
  await updateDoc(campaignRef(campaignId), { businessName: next, businessNameEdited: true, updatedAt: serverTimestamp() });
  for (const job of await fetchMonthJobs(before)) {
    await updateDoc(doc(db, "work_assignments", job.id), { businessName: next }).catch(() => undefined);
  }
  return true;
}

export interface SetupActor extends ActivityActor {
  uid: string;
  name: string;
}

export interface MonthSetupResult {
  campaignId: string;
  history: boolean;
  assign: SmmAssignResult | null;
}

/**
 * The month's deadline on its order and on every open job — what the queue and My Work count down to.
 * A month with no order (a no-sale month) has only its jobs to carry it.
 */
async function applyMonthPromise(campaign: Pick<SmmCampaign, "id" | "orderId" | "cycle">): Promise<void> {
  const promise = monthPromise(campaign.cycle);
  if (campaign.orderId) {
    await updateDoc(doc(db, "orders", campaign.orderId), { promise, updatedAt: serverTimestamp() }).catch(() => undefined);
  }
  for (const job of await fetchMonthJobs(campaign)) {
    if (job.status === "completed" || job.status === "verified") continue;
    await updateDoc(doc(db, "work_assignments", job.id), { promise }).catch(() => undefined);
  }
}

/**
 * The tech side's setup, on a month that exists: its dates, its video length, the client's page
 * links and its team — and then the jobs (services/smmAssign).
 *
 * Used for a sold month waiting under "Needs setup", for changing a month's setup later, and as the
 * last step of `setupSaleMonth`. The salesperson is told the first time a month is set up, so they
 * know who is on their client.
 */
export async function applyMonthSetup(
  campaignId: string,
  setup: MonthSetupInput,
  actor: SetupActor,
  opts: { existingAssignments?: WorkAssignment[] } = {},
): Promise<MonthSetupResult> {
  if (setup.businessName?.trim()) await renameMonth(campaignId, setup.businessName);
  if (setup.commitments) await setMonthCommitments(campaignId, setup.commitments);
  // After the counts, so rows added for a higher count move to the new accounts with the rest.
  if (setup.platforms) await setMonthPlatforms(campaignId, setup.platforms);
  const before = await fetchCampaign(campaignId);
  if (!before) throw new Error("This month no longer exists.");
  const cycle = monthCycle(setup.startDate, setup.endDate);
  const firstSetup = !before.setupAt;

  const after = await saveMonthSetup(campaignId, {
    cycle,
    clipsPerVideo: normaliseClipsPerVideo(setup.clipsPerVideo),
    pageLinks: cleanLinks(setup.pageLinks, setup.platforms ? before.platforms : null),
    setupByName: actor.name,
    setupByUid: actor.uid,
  });
  // A sold month's deadline goes on its order first, so the jobs created next copy it from there.
  if (before.orderId) await applyMonthPromise(after || { ...before, cycle });

  const assign = await assignSmmMonth({
    campaignId,
    team: setup.team,
    assigner: { uid: actor.uid, name: actor.name, role: actor.role, createdBy: actor.createdBy },
    actor,
    existingAssignments: opts.existingAssignments,
  });

  // A month with no order has nothing for a new job to copy the deadline from: every job is given it.
  if (!before.orderId) await applyMonthPromise(after || { ...before, cycle });

  const noSale = isNoSaleMonth(before);
  if (firstSetup && before.soldBy && before.soldBy !== actor.uid) {
    const people = jobsByMember(setup.team).map((m) => m.name).join(", ");
    const what = `${before.businessName || before.clientName} · ${cycleRangeLabel(cycle)}${people ? ` — ${people} on it` : ""}`;
    await sendNotification({
      userId: before.soldBy,
      type: "smm_month_setup",
      title: noSale ? "A client's social media month was added for you" : "Your client's social media month is set up",
      message: noSale
        ? `${what}. It was run before sales were recorded in the app, so it is not counted in your sales or commission. Renew it when it ends — the renewal is your sale.`
        : `${what}. Follow its progress in Social Media.`,
      link: `/smm/${campaignId}`,
      dedupeKey: `smm_setup_${campaignId}_${before.soldBy}`,
    }).catch(() => undefined);
  }

  await logTechActivity({
    actor,
    action: "set_up_smm_month",
    details: {
      campaignId,
      businessName: before.businessName,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      clipsPerVideo: normaliseClipsPerVideo(setup.clipsPerVideo),
      ...(setup.platforms ? { platforms: cleanPlatforms(setup.platforms) } : {}),
      team: jobsByMember(setup.team).map((m) => ({ uid: m.uid, name: m.name, tracks: m.tracks })),
      ...(noSale ? { noSale: true, sellerName: before.soldByName } : {}),
    },
  });

  return { campaignId, history: false, assign };
}

/** Whole, non-negative counts, capped at a month's worth of daily posting. */
export function cleanCommitments(c: Partial<Record<SmmContentKind, number>> | null | undefined): Record<SmmContentKind, number> {
  const n = (v: unknown) => Math.max(0, Math.min(60, Math.floor(Number(v) || 0)));
  return { poster: n(c?.poster), ai_ad: n(c?.ai_ad), real_video: n(c?.real_video) };
}

/**
 * The page links worth keeping. Given the month's accounts, only theirs: a link for an account the month
 * no longer covers has no box in the form, so nobody could see or correct it (2026-10-05).
 */
const cleanLinks = (links: MonthSetupInput["pageLinks"], platforms?: SmmPlatform[] | null) => {
  if (!links) return null;
  if (platforms) return linksForAccounts(links, platforms);
  const out: Partial<Record<SmmPlatform, string>> = {};
  for (const [k, v] of Object.entries(links)) if (v?.trim()) out[k as SmmPlatform] = v.trim();
  return Object.keys(out).length ? out : null;
};

/**
 * Set up the month of a sale already on a salesperson's lead — whatever happened to it on the tech
 * side since.
 *
 *   • The sale is NOT recorded again: its revenue and commission were counted when it was made.
 *   • Its order is brought back: restored when it was removed, rebuilt from the sale (under the
 *     same id) when it was purged.
 *   • A month that was removed or deleted is replaced by a fresh plan on the dates given; a month
 *     still live keeps its plan and only takes the new setup.
 *   • Dates entirely in the past make it HISTORY: recorded with its package, salesperson and dates,
 *     filed as finished, no jobs for anybody and no deadline to miss. Its order leaves the queue as
 *     delivered, so the sale cannot quietly rebuild a live one later.
 */
export async function setupSaleMonth(params: {
  leadId: string;
  itemIndex: number;
  setup: MonthSetupInput;
  actor: SetupActor;
  existingAssignments?: WorkAssignment[];
}): Promise<MonthSetupResult> {
  const { leadId, itemIndex, setup, actor } = params;
  const leadSnap = await getDoc(doc(db, "leads", leadId));
  if (!leadSnap.exists()) throw new Error("That sale's lead no longer exists.");
  const lead = { ...(leadSnap.data() as Lead), id: leadSnap.id };
  const items = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
  const item = items[itemIndex];
  if (!item || item.category !== "social_media_management") throw new Error("That is not a social media sale.");
  if (item.verificationStatus === "rejected") throw new Error("The sales admin rejected this sale, so it has no month.");
  if (!releasedToTech(item)) throw new Error("This sale is waiting for the sales admin to approve its discount. Set it up once they have.");

  const today = isoDay(new Date());
  const cycle = monthCycle(setup.startDate, setup.endDate);
  const history = cycle.endDate < today;
  const orderId = orderDocId(lead.id, item, itemIndex);
  const sellerSnap = await getDoc(doc(db, "users", lead.assignedTo)).catch(() => null);
  const seller = sellerSnap?.exists() ? (sellerSnap.data() as AppUser) : null;
  const soldByName = seller?.name || "Salesperson";
  const salesAdminId = seller?.createdBy || null;

  // ── The order ────────────────────────────────────────────────────────────────────────────────
  let order = await fetchOrder(orderId);
  if (order && (order.deleted || order.status === "deleted")) {
    await restoreOrders([order], actor);
    order = await fetchOrder(orderId);
  }
  if (!order || order.status === "cancelled") {
    await upsertOrderForSale({
      lead, item, itemIndex, soldByName, salesAdminId,
      saleVerified: item.verificationStatus === "verified",
      announce: false,
    });
    order = await fetchOrder(orderId);
  }
  if (!order) throw new Error("The order for this sale could not be rebuilt. Try again.");

  // ── The month ────────────────────────────────────────────────────────────────────────────────
  const existing = await fetchCampaign(orderId);
  const replace = !existing || existing.status === "removed" || existing.status === "deleted";
  let renamed = false;
  if (replace) {
    const input = campaignInputFromSale({
      order: {
        id: orderId,
        leadId: lead.id,
        saleItemKey: order.saleItemKey || `${lead.id}__${itemIndex}`,
        clientPhone: order.clientPhone,
        clientPhoneId: order.clientPhoneId,
        clientName: order.clientName,
        businessName: order.businessName,
        soldBy: lead.assignedTo,
        salesAdminId,
      },
      item,
      soldByName,
    });
    const previous = await previousMonthOf(order.clientPhoneId, cycle.startDate, orderId);
    // The name typed at setup wins over the sale's, and is kept from then on.
    const typedName = setup.businessName?.trim().replace(/\s+/g, " ") || "";
    if (typedName && typedName !== input.businessName) {
      input.businessName = typedName;
      renamed = true;
    }
    // So do the counts agreed at setup — the plan is built from them.
    if (setup.commitments) input.commitments = cleanCommitments(setup.commitments);
    // And the accounts ticked at setup — every piece of the plan is put on them.
    if (setup.platforms && cleanPlatforms(setup.platforms).length) input.platforms = cleanPlatforms(setup.platforms);
    const campaign = buildSoldCampaign(input, {
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      clipsPerVideo: setup.clipsPerVideo,
      pageLinks: cleanLinks(setup.pageLinks, setup.platforms ? input.platforms : null),
      renewalOf: previous,
    });
    await setDoc(campaignRef(orderId), {
      ...JSON.parse(JSON.stringify({
        ...campaign,
        // A live month is stamped by `applyMonthSetup` below, which also tells the salesperson; a
        // history month goes no further, so it is stamped here.
        ...(history
          ? { history: true, status: "completed", setupAt: Timestamp.now(), setupByName: actor.name, setupByUid: actor.uid }
          : {}),
        ...(renamed ? { businessNameEdited: true } : {}),
      }, (_k, v) => (v === undefined ? null : v))),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (previous) {
      // The month before it now points forward, and is filed as renewed if it has ended.
      await updateDoc(campaignRef(previous.id), {
        renewal: { ...(previous.renewal || { state: "none" }), state: "won", nextCampaignId: orderId, at: Timestamp.now(), byName: actor.name },
        ...(previous.status === "active" && previous.cycle.endDate < today ? { status: "renewed" } : {}),
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
    }
  }

  // ── History: a record, not work ──────────────────────────────────────────────────────────────
  if (history) {
    if (!replace && setup.businessName?.trim()) await renameMonth(orderId, setup.businessName);
    if (!replace && setup.commitments) await setMonthCommitments(orderId, setup.commitments);
    if (!replace && setup.platforms) await setMonthPlatforms(orderId, setup.platforms);
    if (!replace) {
      await updateDoc(campaignRef(orderId), {
        cycle,
        clipsPerVideo: normaliseClipsPerVideo(setup.clipsPerVideo),
        history: true,
        status: "completed",
        setupAt: Timestamp.now(),
        setupByName: actor.name,
        setupByUid: actor.uid,
        updatedAt: serverTimestamp(),
      });
    }
    if (order.status === "unassigned" || order.status === "assigned") {
      await updateDoc(doc(db, "orders", orderId), {
        status: "verified",
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await logTechActivity({
      actor,
      action: "set_up_smm_month",
      details: { campaignId: orderId, businessName: order.businessName, startDate: cycle.startDate, endDate: cycle.endDate, history: true },
    });
    return { campaignId: orderId, history: true, assign: null };
  }

  return applyMonthSetup(orderId, setup, actor, { existingAssignments: params.existingAssignments });
}

/**
 * The client's month just before this one, when this one continues it — so a run of old sales set
 * up one after another reads as Month 1 → Month 2 rather than unrelated months.
 *
 * Continuous means it ended within a week of this one's start. A month further back is a client who
 * came back after a gap, and is a first month again.
 */
async function previousMonthOf(clientPhoneId: string, startDate: string, ownId: string): Promise<SmmCampaign | null> {
  if (!clientPhoneId) return null;
  try {
    const snap = await getDocs(query(collection(db, "smm_campaigns"), where("clientPhoneId", "==", clientPhoneId)));
    const start = dayToDate(startDate)?.getTime() ?? 0;
    const candidates = snap.docs
      .map((d) => ({ ...(d.data() as SmmCampaign), id: d.id }))
      .filter((c) => c.id !== ownId && c.status !== "deleted" && c.status !== "removed")
      .filter((c) => c.cycle?.startDate < startDate)
      .filter((c) => !c.renewal?.nextCampaignId || c.renewal.nextCampaignId === ownId)
      .filter((c) => {
        const end = dayToDate(c.cycle?.endDate)?.getTime() ?? 0;
        return Math.abs(start - end) <= 7 * 86_400_000;
      })
      .sort((a, b) => b.cycle.startDate.localeCompare(a.cycle.startDate));
    return candidates[0] || null;
  } catch (err) {
    console.warn("[smmSetup] previous month lookup failed:", err);
    return null;
  }
}

/** Whether a month's setup would have nobody on it — the form refuses that for a running month. */
export function setupProblem(setup: MonthSetupInput, today: string): string {
  const cycle = monthCycle(setup.startDate, setup.endDate);
  if (setup.businessName !== undefined && !setup.businessName.trim()) return "Give the month a name.";
  if (setup.platforms && cleanPlatforms(setup.platforms).length === 0) return "Tick at least one account the month covers.";
  if (setup.commitments) {
    const c = cleanCommitments(setup.commitments);
    if (c.ai_ad + c.poster + c.real_video === 0) return "The month must owe at least one video or poster.";
  }
  if (!dayToDate(setup.startDate)) return "Pick the day the month starts.";
  if (setup.endDate && setup.endDate <= setup.startDate) return "The month must end after it starts.";
  if (cycle.endDate >= today && !hasTeam(setup.team)) return "Put somebody on the month — at least who makes the content.";
  return "";
}

/** "October 2026 · 3 Oct → 3 Nov 2026" — a month named in a sentence. */
export function monthTitle(cycle: SmmCycle): string {
  return `${monthLabel(cycle.startDate)} · ${cycleRangeLabel(cycle)}`;
}

/* ── A month with no sale behind it (2026-10-03) ────────────────────────────────────────────── */

/**
 * Why a no-sale month cannot go on these dates for this number, or "" when it can.
 *
 * Three things it must never do:
 *   • sit on top of a month the client already has, of any kind — one period, one month;
 *   • sit on top of a sale recorded for that period, even one whose month was deleted or whose order
 *     was removed: that sale is already counted for its salesperson, and its own month comes back with
 *     "Set up this sale";
 *   • come after a recorded sale at all. Once a client has been sold here, every later month is a
 *     renewal — the salesperson's sale, on their commission — and a no-sale month in its place would
 *     quietly take that from them.
 */
export async function noSaleMonthClash(phone: string, cycle: SmmCycle): Promise<string> {
  const phoneId = phoneLockId(phone);
  const [monthsSnap, sales] = await Promise.all([
    getDocs(query(collection(db, "smm_campaigns"), where("clientPhoneId", "==", phoneId))),
    findSmmSalesForPhone(phone),
  ]);

  for (const d of monthsSnap.docs) {
    const c = { ...(d.data() as SmmCampaign), id: d.id };
    // A sold month that was deleted or removed is checked below, through its sale.
    if (c.status === "deleted" || c.status === "removed" || !c.cycle) continue;
    if (cyclesOverlap(c.cycle, cycle)) {
      return `${c.businessName || c.clientName || "This client"} already has a month on these dates (${cycleRangeLabel(c.cycle)}). Open it from the board instead.`;
    }
  }

  for (const s of sales) {
    if (s.state === "rejected") continue;
    const saleCycle = s.campaign?.cycle || monthCycle(s.soldDay);
    if (cyclesOverlap(saleCycle, cycle)) {
      return s.state === "held"
        ? `${s.sellerName}'s sale for these dates (${cycleRangeLabel(saleCycle)}) is waiting for the sales admin to approve its discount — the month comes from that sale.`
        : `${s.sellerName} recorded a sale for these dates (${cycleRangeLabel(saleCycle)}), already counted as their sale. Use "Set up this sale" on it instead.`;
    }
    if (saleCycle.startDate < cycle.startDate) {
      return `${s.businessName || "This client"} has been a recorded sale since ${monthLabel(saleCycle.startDate)} (${s.sellerName}), so a later month is a renewal — ${s.sellerName} records it with Renew, and it counts as their sale.`;
    }
  }
  return "";
}

export interface NoSaleMonthInput {
  /** The client's WhatsApp number. */
  phone: string;
  /** The salesperson who looks after the client — the month shows in their login, in their name. */
  seller: { uid: string; name: string; createdBy?: string | null };
  /** A catalogue package's name, or "" for a month agreed outside the packages. */
  packageKey: string;
  platforms: SmmPlatform[];
  /** The month itself. Its name and counts are required here — there is no sale to take them from. */
  setup: MonthSetupInput & { businessName: string; commitments: Record<SmmContentKind, number> };
  actor: SetupActor;
  existingAssignments?: WorkAssignment[];
}

/** Everything wrong with a no-sale month before anything is read, or "" — the form's button reads it. */
export function noSaleSetupProblem(input: Pick<NoSaleMonthInput, "phone" | "seller" | "setup">, today: string): string {
  return noSaleMonthProblem({ phone: input.phone, sellerUid: input.seller?.uid || "", startDate: input.setup.startDate }, today)
    || setupProblem(input.setup, today);
}

/**
 * Add a social-media month that had no sale (2026-10-03) — a client the company was already serving
 * before sales were recorded in the app.
 *
 * It is a month like any other on the board and in the team's work: the same plan, approvals, posts,
 * reports and, while it runs, the same job cards in My Work (services/smmAssign). What it never has is
 * a sale: no lead is touched, no order is made, its amount is 0 — so nothing reaches any revenue
 * figure, leaderboard or commission. It names the salesperson who looks after the client, and that is
 * what puts it on their Social Media page with its dates. When it ends, their Renew records the next
 * month as a real sale, linked to this one as month 2.
 *
 * A month whose dates are already over is recorded as history (no jobs, filed as finished); one the
 * client is in the middle of is set up and given out straight away. One that has not started is refused
 * — new business is a sale.
 */
export async function addNoSaleMonth(params: NoSaleMonthInput): Promise<MonthSetupResult> {
  const { seller, packageKey, platforms, setup, actor } = params;
  const today = isoDay(new Date());
  const phone = normalizePhone(params.phone);
  const problem = noSaleSetupProblem({ phone, seller, setup }, today);
  if (problem) throw new Error(problem);

  const cycle = monthCycle(setup.startDate, setup.endDate);
  const clash = await noSaleMonthClash(phone, cycle);
  if (clash) throw new Error(clash);

  const history = cycle.endDate < today;
  const name = setup.businessName.trim().replace(/\s+/g, " ");
  const phoneId = phoneLockId(phone);
  const ref = doc(collection(db, "smm_campaigns"));
  const previous = await previousMonthOf(phoneId, cycle.startDate, ref.id);
  const campaign = buildNoSaleCampaign(ref.id, {
    clientPhone: phone,
    clientPhoneId: phoneId,
    clientName: name,
    businessName: name,
    packageKey,
    packageLabel: packageKey || "Custom month",
    platforms,
    commitments: cleanCommitments(setup.commitments),
    soldBy: seller.uid,
    soldByName: seller.name,
    salesAdminId: seller.createdBy || null,
  }, {
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    clipsPerVideo: setup.clipsPerVideo,
    pageLinks: cleanLinks(setup.pageLinks),
    renewalOf: previous,
  }, actor);

  await setDoc(ref, {
    ...JSON.parse(JSON.stringify(campaign, (_k, v) => (v === undefined ? null : v))),
    // A running month is stamped by `applyMonthSetup` below; a history month goes no further.
    ...(history
      ? { history: true, status: "completed", setupAt: Timestamp.now(), setupByName: actor.name, setupByUid: actor.uid }
      : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (previous) {
    // The client's month before it — added the same way, as history — now points forward.
    await updateDoc(campaignRef(previous.id), {
      renewal: { ...(previous.renewal || { state: "none" }), state: "won", nextCampaignId: ref.id, at: Timestamp.now(), byName: actor.name },
      ...(previous.status === "active" && previous.cycle.endDate < today ? { status: "renewed" } : {}),
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);
  }

  if (!history) return applyMonthSetup(ref.id, setup, actor, { existingAssignments: params.existingAssignments });

  await sendNotification({
    userId: seller.uid,
    type: "smm_month_setup",
    title: "An earlier social media month was recorded for you",
    message: `${name} · ${cycleRangeLabel(cycle)} — run before sales were recorded in the app, so it is not counted in your sales or commission. It is on your Social Media page for the record.`,
    link: `/smm/${ref.id}`,
    dedupeKey: `smm_setup_${ref.id}_${seller.uid}`,
  }).catch(() => undefined);
  await logTechActivity({
    actor,
    action: "set_up_smm_month",
    details: {
      campaignId: ref.id, businessName: name, startDate: cycle.startDate, endDate: cycle.endDate,
      history: true, noSale: true, sellerName: seller.name,
    },
  });
  return { campaignId: ref.id, history: true, assign: null };
}
