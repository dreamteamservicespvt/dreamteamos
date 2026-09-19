/**
 * Reading and writing a social-media month.
 *
 * ── Why every item change is a transaction ────────────────────────────────────────────────────
 * A campaign's plan is an array inside one document, which is the right shape for reading (one
 * document gets the whole month, which matters on the free tier) and the wrong shape for writing
 * naively: two members editing two different posts at the same time would each write the whole
 * array from their own stale copy, and one of them would lose their work with no error. So every
 * mutation reads, merges by id and writes inside `runTransaction`. Nobody has to remember that;
 * `mutateCampaign` is the only way in.
 *
 * ── Why the order's counters are written from here ────────────────────────────────────────────
 * `OrderProgress.done` is read by the balance-collect gate, by tech payroll and by the Orders
 * queue's pinning. Leaving it as a second, hand-typed copy of what this document already knows
 * would guarantee the two disagree — so every mutation ends by writing the derived counts through
 * to the order, and the order's own editor is switched off for months that have a campaign
 * (`progress.derived`).
 */

import {
  collection, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where,
  Timestamp, updateDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import {
  blankItem, buildInitialItems, cycleFromStart, derivedProgressCounts, isoDay, newItemId,
  smmWatchers, targetsFromCommitments,
} from "@/utils/smmPlan";
import { commitmentsForPackage, platformsForPackage } from "@/utils/smmPricing";
import { normalizePhone, phoneLockId } from "@/utils/phone";
import { POSTABLE_STATUSES } from "@/types/smm";
import type {
  SmmAdDayReport, SmmAdRun, SmmBudgetPayment, SmmCampaign, SmmContentItem, SmmContentKind,
  SmmItemStatus, SmmPaymentRoute, SmmPlatform, SmmRenewalState, SmmTeam,
} from "@/types/smm";
import type { AppUser, Order, OrderProgress, SaleDetail } from "@/types";

export const SMM_CAMPAIGNS = "smm_campaigns";

/** The signed-in person, reduced to what a write needs to record about them. */
export interface SmmActor {
  uid: string;
  name: string;
  role?: string;
}

export function campaignRef(id: string) {
  return doc(db, SMM_CAMPAIGNS, id);
}

/** Firestore refuses `undefined`; a plan built in a form is full of optional fields. */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v)));
}

/* ── Creating the month ─────────────────────────────────────────────────────────────────────── */

export interface CreateCampaignInput {
  orderId: string;
  leadId: string;
  saleItemKey: string;
  clientPhone: string;
  clientPhoneId: string;
  clientName: string;
  businessName: string;
  packageKey: string;
  packageLabel: string;
  amount: number;
  platforms: SmmPlatform[];
  commitments: Record<SmmContentKind, number>;
  soldBy: string;
  soldByName: string;
  salesAdminId?: string | null;
  /** `yyyy-MM-dd` the month runs from. Defaults to today — the day it was sold. */
  startDate?: string;
}

/**
 * Open the month, once.
 *
 * Idempotent on purpose: `upsertOrderForSale` runs again on every edit of the sale, and the plan
 * must not be rebuilt under a team that has already been filling it in for a fortnight. An existing
 * campaign only has its descriptive fields refreshed — the client's name, the business, the price —
 * and the plan itself is left alone. Never throws: a sale must not fail because a plan could not be
 * opened.
 */
export async function ensureCampaignForOrder(input: CreateCampaignInput): Promise<void> {
  try {
    const ref = campaignRef(input.orderId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      await updateDoc(ref, {
        clientName: input.clientName,
        businessName: input.businessName,
        clientPhone: input.clientPhone,
        clientPhoneId: input.clientPhoneId,
        packageKey: input.packageKey,
        packageLabel: input.packageLabel,
        amount: input.amount,
        soldByName: input.soldByName,
        salesAdminId: input.salesAdminId ?? null,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const team: SmmTeam = { creator: null, publisher: null, marketer: null, assistants: [] };
    const campaign: Omit<SmmCampaign, "createdAt" | "updatedAt"> = {
      id: input.orderId,
      orderId: input.orderId,
      leadId: input.leadId,
      saleItemKey: input.saleItemKey,
      clientPhone: input.clientPhone,
      clientPhoneId: input.clientPhoneId,
      clientName: input.clientName,
      businessName: input.businessName,
      packageKey: input.packageKey,
      packageLabel: input.packageLabel,
      amount: input.amount,
      cycle: cycleFromStart(input.startDate || isoDay(new Date())),
      platforms: input.platforms,
      commitments: input.commitments,
      items: buildInitialItems(input.commitments, input.platforms),
      ads: [],
      budgetPayments: [],
      team,
      soldBy: input.soldBy,
      soldByName: input.soldByName,
      salesAdminId: input.salesAdminId ?? null,
      watchers: smmWatchers(team, input.soldBy),
      status: "active",
      renewal: { state: "none", at: null, byName: null, note: null },
    };

    await setDoc(ref, clean({ ...campaign, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  } catch (err) {
    console.error("[smm] ensureCampaignForOrder failed:", err);
  }
}

/**
 * The campaign a sold month should have, built from the sale itself.
 *
 * Lives here rather than in `services/orders` so the shape of a campaign is decided in one file.
 * The sale carries the add-on count and the committed accounts under `smm`; a sale recorded before
 * that section existed falls back to the package's own quota and platforms, which is exactly what
 * those months were sold as.
 */
export function campaignInputFromSale(params: {
  order: { id: string; leadId: string; saleItemKey: string; clientPhone: string; clientPhoneId: string; clientName?: string; businessName: string; soldBy: string; salesAdminId?: string | null };
  item: SaleDetail;
  soldByName: string;
}): CreateCampaignInput {
  const { order, item, soldByName } = params;
  const sold = item.smm;
  const addOns = sold?.addOns ?? { realVideos: 0 };
  return {
    orderId: order.id,
    leadId: order.leadId,
    saleItemKey: order.saleItemKey,
    clientPhone: order.clientPhone,
    clientPhoneId: order.clientPhoneId,
    clientName: order.clientName || order.businessName,
    businessName: order.businessName,
    packageKey: item.packageKey || "",
    packageLabel: item.packageKey || "Custom month",
    amount: item.amount || 0,
    platforms: sold?.platforms?.length ? sold.platforms : platformsForPackage(item.packageKey),
    commitments: sold?.commitments ?? commitmentsForPackage(item.packageKey, addOns),
    soldBy: order.soldBy,
    soldByName,
    salesAdminId: order.salesAdminId ?? null,
  };
}

/**
 * A month that never came through a sale.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────
 * Most retainers arrive from a sales member and bring an order with them. Some do not: a client
 * rings the tech admin directly, or walks in, or is handed over by somebody who already knows them,
 * and the SMM leader starts running their accounts on Monday. Without this, that month could only
 * be tracked by inventing a fake sale — which attaches a commission to revenue nobody sold — or by
 * keeping it on paper, which is the exact state this section exists to end.
 *
 * It is the same document in every other respect. What it does not have is an order to write
 * counters back to, and a client chat to post into; both are simply absent.
 *
 * The creator becomes the client's owner (`soldBy`), because approvals still have to be chased, ad
 * money still has to be asked for and the renewal still has to be pitched — and a month nobody owns
 * is a month where the client goes quiet and nobody notices.
 */
export async function createDirectCampaign(input: {
  clientName: string;
  businessName: string;
  clientPhone: string;
  packageKey: string;
  packageLabel: string;
  amount: number;
  platforms: SmmPlatform[];
  commitments: Record<SmmContentKind, number>;
  startDate: string;
  days?: number;
}, actor: SmmActor): Promise<string> {
  const ref = doc(collection(db, SMM_CAMPAIGNS));
  const phone = normalizePhone(input.clientPhone);
  const team: SmmTeam = { creator: null, publisher: null, marketer: null, assistants: [] };

  const campaign: Omit<SmmCampaign, "createdAt" | "updatedAt"> = {
    id: ref.id,
    orderId: "",
    leadId: "",
    saleItemKey: "",
    origin: "direct",
    createdBy: actor.uid,
    createdByName: actor.name,
    clientPhone: phone,
    clientPhoneId: phoneLockId(input.clientPhone),
    clientName: input.clientName.trim(),
    businessName: input.businessName.trim() || input.clientName.trim(),
    packageKey: input.packageKey,
    packageLabel: input.packageLabel || input.packageKey || "Custom month",
    amount: Math.max(0, Math.round(input.amount) || 0),
    cycle: cycleFromStart(input.startDate || isoDay(new Date()), input.days ?? 30),
    platforms: input.platforms,
    commitments: input.commitments,
    items: buildInitialItems(input.commitments, input.platforms),
    ads: [],
    budgetPayments: [],
    team,
    soldBy: actor.uid,
    soldByName: actor.name,
    salesAdminId: null,
    watchers: smmWatchers(team, actor.uid),
    status: "active",
    renewal: { state: "none", at: null, byName: null, note: null },
  };

  await setDoc(ref, clean({ ...campaign, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  return ref.id;
}

/* ── Reading ────────────────────────────────────────────────────────────────────────────────── */

/** A Firestore snapshot of a campaign, whichever flavour of snapshot it is. */
type CampaignSnap = { id: string; data: () => unknown };

const fromSnap = (d: CampaignSnap): SmmCampaign => ({ ...(d.data() as SmmCampaign), id: d.id });

/** The campaigns one person is on — their own sales, and the months they were given. */
export function watchMyCampaigns(uid: string, cb: (list: SmmCampaign[]) => void): () => void {
  return onSnapshot(
    query(collection(db, SMM_CAMPAIGNS), where("watchers", "array-contains", uid)),
    (snap) => cb(snap.docs.map(fromSnap)),
    (err) => { console.error("[smm] watchMyCampaigns:", err); cb([]); },
  );
}

/**
 * Every month still running, for the people who oversee them.
 *
 * Filtered to `active` rather than read whole: a finished month is history and belongs on the
 * campaign's own page, not in a live listener that grows for ever on a free-tier quota.
 */
export function watchActiveCampaigns(cb: (list: SmmCampaign[]) => void): () => void {
  return onSnapshot(
    query(collection(db, SMM_CAMPAIGNS), where("status", "==", "active")),
    (snap) => cb(snap.docs.map(fromSnap)),
    (err) => { console.error("[smm] watchActiveCampaigns:", err); cb([]); },
  );
}

export function watchCampaign(id: string, cb: (c: SmmCampaign | null) => void): () => void {
  return onSnapshot(
    campaignRef(id),
    (snap) => cb(snap.exists() ? fromSnap(snap as CampaignSnap) : null),
    (err) => { console.error("[smm] watchCampaign:", err); cb(null); },
  );
}

export async function fetchCampaign(id: string): Promise<SmmCampaign | null> {
  const snap = await getDoc(campaignRef(id));
  return snap.exists() ? fromSnap(snap as CampaignSnap) : null;
}

/* ── The one way in ─────────────────────────────────────────────────────────────────────────── */

/**
 * Read, change, write — atomically, and then make the order agree.
 *
 * `apply` receives the campaign as it is in the database at this instant, not as the screen last
 * saw it, which is what makes two people editing two different posts safe. Returning `null` aborts
 * without a write, so a no-op (ticking a box that is already ticked) costs nothing.
 */
async function mutateCampaign(
  id: string,
  apply: (current: SmmCampaign) => Partial<SmmCampaign> | null,
): Promise<SmmCampaign | null> {
  const ref = campaignRef(id);
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("This campaign no longer exists.");
    const current = { ...(snap.data() as SmmCampaign), id: snap.id };
    const patch = apply(current);
    if (!patch) return null;
    tx.update(ref, clean({ ...patch, updatedAt: serverTimestamp() }));
    return { ...current, ...patch } as SmmCampaign;
  });

  if (next) await syncOrderProgress(next).catch(() => { /* the plan is saved either way */ });
  return next;
}

/** Replace one item by id, leaving every other item exactly as the database had it. */
function withItem(campaign: SmmCampaign, itemId: string, change: (item: SmmContentItem) => SmmContentItem) {
  let found = false;
  const items = campaign.items.map((it) => {
    if (it.id !== itemId) return it;
    found = true;
    return { ...change(it), updatedAt: Timestamp.now() };
  });
  return found ? items : null;
}

/* ── The order's counters ───────────────────────────────────────────────────────────────────── */

/**
 * Write the month's real state onto the order everybody else reads.
 *
 * `derived: true` is what tells `OrderProgressPanel` to stop offering its number boxes: two places
 * to type the same count is two places for it to be wrong, and this one is computed from the plan
 * rather than remembered.
 */
export async function syncOrderProgress(campaign: SmmCampaign): Promise<void> {
  // A directly-added month has no order behind it, so there is nothing to write back to. Not an
  // error — see `SmmOrigin`.
  if (!campaign.orderId) return;
  const ref = doc(db, "orders", campaign.orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const order = snap.data() as Order;

  const progress: OrderProgress = {
    kind: "smm",
    targets: targetsFromCommitments(campaign.commitments),
    done: derivedProgressCounts(campaign),
    tracks: order.progress?.tracks || {},
    completedTracks: order.progress?.completedTracks || [],
    log: order.progress?.log || [],
    completedAt: order.progress?.completedAt ?? null,
    derived: true,
  };

  await updateDoc(ref, { progress: clean(progress), updatedAt: serverTimestamp() });
}

/* ── Content ────────────────────────────────────────────────────────────────────────────────── */

export async function updateItem(
  campaignId: string,
  itemId: string,
  patch: Partial<SmmContentItem>,
): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const items = withItem(c, itemId, (it) => ({ ...it, ...patch }));
    return items ? { items } : null;
  });
}

/**
 * Move one piece of content along.
 *
 * ── The rule this enforces ────────────────────────────────────────────────────────────────────
 * *We do not post anything the client has not approved.* That is a business rule, so it is a
 * guard, not a convention: scheduling or posting without a recorded approval throws, and the caller
 * gets a sentence it can show. The UI does not offer those buttons either — but the UI is the thing
 * most likely to be changed by somebody in a hurry, which is exactly why the rule does not live
 * only there.
 */
export async function setItemStatus(
  campaignId: string,
  itemId: string,
  status: SmmItemStatus,
  actor: SmmActor,
): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const item = c.items.find((i) => i.id === itemId);
    if (!item) return null;
    if (item.status === status) return null;

    if (POSTABLE_STATUSES.includes(status) && item.approval?.state !== "approved") {
      throw new Error("The client has not approved this yet. Record their approval first.");
    }

    const items = withItem(c, itemId, (it) => ({
      ...it,
      status,
      postedAt: status === "posted" ? Timestamp.now() : it.postedAt ?? null,
      publisherUid: status === "posted" ? it.publisherUid || actor.uid : it.publisherUid ?? null,
      publisherName: status === "posted" ? it.publisherName || actor.name : it.publisherName ?? null,
    }));
    return items ? { items } : null;
  });
}

/**
 * Add a piece of content to the plan.
 *
 * `extra` is the one that matters. Work done beyond the package used to happen, get delivered, and
 * be forgotten by the time anybody could charge for it — so the moment one is recorded, the sales
 * member who sold the month is told by name what was made and for whom. They then either collect
 * for it or decide out loud to give it away, and either way it appears in the monthly report.
 */
export async function addItem(
  campaignId: string,
  input: { kind: SmmContentKind; title?: string; uploadDate?: string | null; uploadTime?: string | null; platforms?: SmmPlatform[]; extra?: boolean; notes?: string | null },
  actor: SmmActor,
): Promise<void> {
  const created = await mutateCampaign(campaignId, (c) => {
    const item: SmmContentItem = {
      ...blankItem(input.kind, input.platforms?.length ? input.platforms : c.platforms, !!input.extra),
      title: input.title || "",
      uploadDate: input.uploadDate ?? null,
      uploadTime: input.uploadTime ?? null,
      notes: input.notes ?? null,
      makerUid: c.team.creator?.uid ?? null,
      makerName: c.team.creator?.name ?? null,
      publisherUid: c.team.publisher?.uid ?? null,
      publisherName: c.team.publisher?.name ?? null,
      createdAt: Timestamp.now(),
    };
    return { items: [...c.items, item] };
  });

  if (created && input.extra) {
    const item = created.items[created.items.length - 1];
    await notifySellerOfExtraWork(created, item, actor).catch(() => { /* the work is recorded either way */ });
  }
}

export async function removeItem(campaignId: string, itemId: string): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const items = c.items.filter((i) => i.id !== itemId);
    return items.length === c.items.length ? null : { items };
  });
}

/** Add several blank rows at once — a leader planning next week does not want a dialog per post. */
export async function addItems(
  campaignId: string,
  kind: SmmContentKind,
  count: number,
  extra: boolean,
): Promise<void> {
  const n = Math.max(1, Math.min(30, Math.floor(count) || 1));
  await mutateCampaign(campaignId, (c) => ({
    items: [
      ...c.items,
      ...Array.from({ length: n }, () => ({
        ...blankItem(kind, c.platforms, extra),
        makerUid: c.team.creator?.uid ?? null,
        makerName: c.team.creator?.name ?? null,
        publisherUid: c.team.publisher?.uid ?? null,
        publisherName: c.team.publisher?.name ?? null,
        createdAt: Timestamp.now(),
      })),
    ],
  }));
}

/* ── Approvals ──────────────────────────────────────────────────────────────────────────────── */

/** Sent to the client. The clock on their answer starts here, and it is what the report counts. */
export async function requestApproval(campaignId: string, itemId: string): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const items = withItem(c, itemId, (it) => ({
      ...it,
      status: "awaiting_approval" as SmmItemStatus,
      approval: {
        ...it.approval,
        state: "waiting",
        askedAt: it.approval?.askedAt || Timestamp.now(),
        respondedAt: null,
      },
    }));
    return items ? { items } : null;
  });
}

/** They answered. Recorded against a name, because an approval nobody signed for is hearsay. */
export async function recordApproval(
  campaignId: string,
  itemId: string,
  outcome: { approved: boolean; note?: string | null },
  actor: SmmActor,
): Promise<void> {
  const next = await mutateCampaign(campaignId, (c) => {
    const items = withItem(c, itemId, (it) => ({
      ...it,
      status: (outcome.approved ? "approved" : "changes_requested") as SmmItemStatus,
      approval: {
        ...it.approval,
        state: outcome.approved ? "approved" : "changes",
        askedAt: it.approval?.askedAt || Timestamp.now(),
        respondedAt: Timestamp.now(),
        note: outcome.note ?? null,
        byName: actor.name,
      },
    }));
    return items ? { items } : null;
  });

  // Whoever has to act on it next — the maker on a change, the publisher on a yes.
  if (!next) return;
  const item = next.items.find((i) => i.id === itemId);
  if (!item) return;
  const target = outcome.approved ? item.publisherUid : item.makerUid;
  if (!target || target === actor.uid) return;
  await sendNotification({
    userId: target,
    type: outcome.approved ? "smm_approved" : "smm_changes",
    title: outcome.approved ? "Client approved" : "Client asked for changes",
    message: `${next.businessName} — ${item.title?.trim() || "untitled"}${outcome.note ? `: ${outcome.note}` : ""}`,
    link: `/smm/${campaignId}`,
    dedupeKey: `smm_approval_${itemId}_${outcome.approved ? "yes" : "no"}_${target}`,
  }).catch(() => { /* the decision is recorded either way */ });
}

/** One more follow-up on a client who has gone quiet. Each is a day the month did not move. */
export async function addApprovalChase(
  campaignId: string,
  itemId: string,
  actor: SmmActor,
  via?: string,
): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const items = withItem(c, itemId, (it) => ({
      ...it,
      approval: {
        ...it.approval,
        state: it.approval?.state === "not_sent" ? "waiting" : it.approval.state,
        askedAt: it.approval?.askedAt || Timestamp.now(),
        chases: [...(it.approval?.chases || []), { at: Timestamp.now(), byName: actor.name, via: via ?? null }],
      },
    }));
    return items ? { items } : null;
  });
}

/* ── Team ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * Who is on the month.
 *
 * Existing items keep whoever they already had — a leader adding a junior halfway through the month
 * must not silently reassign the six posts somebody else has already half-built. Only items with
 * nobody on them inherit the new seat holder.
 */
export async function setCampaignTeam(campaignId: string, team: SmmTeam): Promise<void> {
  await mutateCampaign(campaignId, (c) => ({
    team,
    watchers: smmWatchers(team, c.soldBy),
    items: c.items.map((it) => ({
      ...it,
      makerUid: it.makerUid || team.creator?.uid || null,
      makerName: it.makerName || team.creator?.name || null,
      publisherUid: it.publisherUid || team.publisher?.uid || null,
      publisherName: it.publisherName || team.publisher?.name || null,
    })),
  }));
}

/** Put one post on one person — the split that a table row actually needs. */
export async function assignItem(
  campaignId: string,
  itemId: string,
  seat: "maker" | "publisher",
  member: { uid: string; name: string } | null,
): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const items = withItem(c, itemId, (it) => (seat === "maker"
      ? { ...it, makerUid: member?.uid ?? null, makerName: member?.name ?? null }
      : { ...it, publisherUid: member?.uid ?? null, publisherName: member?.name ?? null }));
    return items ? { items } : null;
  });
}

/* ── Ads ────────────────────────────────────────────────────────────────────────────────────── */

export async function addAdRun(
  campaignId: string,
  input: { name: string; scope: SmmAdRun["scope"]; startDate: string; days: number; dailyBudget: number },
): Promise<void> {
  await mutateCampaign(campaignId, (c) => ({
    ads: [...c.ads, {
      id: newItemId("ad"),
      name: input.name,
      scope: input.scope,
      startDate: input.startDate,
      days: Math.max(1, Math.floor(input.days) || 1),
      dailyBudget: Math.max(0, Math.round(input.dailyBudget) || 0),
      budgetByDay: {},
      status: "planned" as const,
      reports: [],
      createdAt: Timestamp.now(),
    }],
  }));
}

export async function updateAdRun(campaignId: string, runId: string, patch: Partial<SmmAdRun>): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    let found = false;
    const ads = c.ads.map((r) => {
      if (r.id !== runId) return r;
      found = true;
      return { ...r, ...patch, updatedAt: Timestamp.now() };
    });
    return found ? { ads } : null;
  });
}

export async function removeAdRun(campaignId: string, runId: string): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const ads = c.ads.filter((r) => r.id !== runId);
    return ads.length === c.ads.length ? null : { ads };
  });
}

/**
 * Change what one day is budgeted at, leaving the agreed daily figure alone.
 *
 * Clients raise it on a Saturday and drop it on a Monday, and the agreed number is still the agreed
 * number — that is why the override is a separate map rather than an edit to `dailyBudget`. Setting
 * a day back to the agreed figure removes its override rather than storing a duplicate.
 */
export async function setDayBudget(campaignId: string, runId: string, day: string, amount: number | null): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const run = c.ads.find((r) => r.id === runId);
    if (!run) return null;
    const next = { ...(run.budgetByDay || {}) };
    if (amount === null || amount === run.dailyBudget) delete next[day];
    else next[day] = Math.max(0, Math.round(amount));
    return { ads: c.ads.map((r) => (r.id === runId ? { ...r, budgetByDay: next, updatedAt: Timestamp.now() } : r)) };
  });
}

/**
 * One day's results, entered or corrected.
 *
 * Keyed on the date, so re-entering a day fixes it rather than double-counting it — which matters,
 * because the commonest reason to open this dialog twice is that the first reading of a dashboard
 * screenshot was wrong.
 */
export async function saveAdDayReport(
  campaignId: string,
  runId: string,
  report: Omit<SmmAdDayReport, "at"> & { at?: unknown },
): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const run = c.ads.find((r) => r.id === runId);
    if (!run) return null;
    const entry: SmmAdDayReport = { ...report, at: Timestamp.now() } as SmmAdDayReport;
    const reports = [...(run.reports || []).filter((r) => r.date !== report.date), entry]
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return { ads: c.ads.map((r) => (r.id === runId ? { ...r, reports, updatedAt: Timestamp.now() } : r)) };
  });
}

export async function removeAdDayReport(campaignId: string, runId: string, date: string): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const run = c.ads.find((r) => r.id === runId);
    if (!run) return null;
    const reports = (run.reports || []).filter((r) => r.date !== date);
    return { ads: c.ads.map((r) => (r.id === runId ? { ...r, reports } : r)) };
  });
}

/* ── The client's ad money ──────────────────────────────────────────────────────────────────── */

/**
 * Record ad money the client has put behind the campaign.
 *
 * `atMs` is passed rather than assumed, because clients pay on a Sunday and it gets written down on
 * a Monday — and the day the money moved is the day the report has to agree with. It defaults to
 * now, which is the common case.
 */
export async function addBudgetPayment(
  campaignId: string,
  input: {
    amount: number;
    route?: SmmPaymentRoute;
    method?: string | null;
    note?: string | null;
    clientProofUrl?: string | null;
    metaProofUrl?: string | null;
    /** Epoch ms the money actually moved. Defaults to now. */
    atMs?: number | null;
  },
  actor: SmmActor,
): Promise<void> {
  const route: SmmPaymentRoute = input.route === "via_us" ? "via_us" : "direct";
  await mutateCampaign(campaignId, (c) => ({
    budgetPayments: [...c.budgetPayments, {
      id: newItemId("pay"),
      amount: Math.max(0, Math.round(input.amount) || 0),
      at: input.atMs ? Timestamp.fromMillis(input.atMs) : Timestamp.now(),
      method: input.method ?? null,
      note: input.note ?? null,
      route,
      clientProofUrl: input.clientProofUrl ?? null,
      // A direct payment never has a second leg: the client paid Meta, we were not involved.
      metaProofUrl: route === "via_us" ? (input.metaProofUrl ?? null) : null,
      byName: actor.name,
    } as SmmBudgetPayment],
  }));
}

/**
 * Prove that money the client paid US actually reached the ad account.
 *
 * Separate from recording the payment because the two legs genuinely happen at different times —
 * the client pays in the evening, somebody funds the account the next morning — and the gap between
 * them is exactly what `budgetLedger.heldByUs` is counting.
 */
export async function attachMetaProof(
  campaignId: string,
  paymentId: string,
  metaProofUrl: string | null,
): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    let found = false;
    const budgetPayments = c.budgetPayments.map((p) => {
      if (p.id !== paymentId) return p;
      found = true;
      return { ...p, metaProofUrl: metaProofUrl || null };
    });
    return found ? { budgetPayments } : null;
  });
}

export async function removeBudgetPayment(campaignId: string, paymentId: string): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const budgetPayments = c.budgetPayments.filter((p) => p.id !== paymentId);
    return budgetPayments.length === c.budgetPayments.length ? null : { budgetPayments };
  });
}

/* ── Extra work, settled ────────────────────────────────────────────────────────────────────── */

export async function setExtraCharge(
  campaignId: string,
  itemId: string,
  charge: "billed" | "free" | "unbilled",
  amount?: number | null,
): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const items = withItem(c, itemId, (it) => ({
      ...it,
      extraCharge: charge,
      extraAmount: charge === "billed" ? Math.max(0, Math.round(Number(amount) || 0)) : null,
    }));
    return items ? { items } : null;
  });
}

async function notifySellerOfExtraWork(campaign: SmmCampaign, item: SmmContentItem, actor: SmmActor): Promise<void> {
  if (!campaign.soldBy || campaign.soldBy === actor.uid) return;
  await sendNotification({
    userId: campaign.soldBy,
    type: "smm_extra_work",
    title: "Extra work done for your client",
    message: `${campaign.businessName}: ${item.title?.trim() || "an extra item"} — beyond the committed package. Collect for it, or mark it free.`,
    link: `/smm/${campaign.id}`,
    dedupeKey: `smm_extra_${item.id}_${campaign.soldBy}`,
  });
}

/* ── Cycle, renewal, closing the month ──────────────────────────────────────────────────────── */

export async function setCycle(campaignId: string, startDate: string, days: number): Promise<void> {
  await mutateCampaign(campaignId, () => ({ cycle: cycleFromStart(startDate, days) }));
}

export async function setCommitments(
  campaignId: string,
  commitments: Record<SmmContentKind, number>,
  platforms?: SmmPlatform[],
): Promise<void> {
  await mutateCampaign(campaignId, () => ({ commitments, ...(platforms ? { platforms } : {}) }));
}

export async function setRenewal(
  campaignId: string,
  state: SmmRenewalState,
  actor: SmmActor,
  note?: string | null,
): Promise<void> {
  await mutateCampaign(campaignId, () => ({
    renewal: { state, at: Timestamp.now(), byName: actor.name, note: note ?? null },
    ...(state === "won" ? { status: "renewed" as const } : {}),
  }));
}

export async function setCampaignStatus(campaignId: string, status: SmmCampaign["status"]): Promise<void> {
  await mutateCampaign(campaignId, () => ({ status }));
}

/* ── Telling people what is due ─────────────────────────────────────────────────────────────── */

/**
 * Push whatever is due to the people who owe it, once per item per day.
 *
 * Called when somebody opens the app, exactly like `notifyDueOrdersOnOpen` — there is no scheduler
 * on this stack. `dedupeKey` carries the day, so six app opens on a Tuesday is one alert and the
 * same item genuinely becoming due tomorrow is a new one.
 */
export async function notifySmmDueOnOpen(
  campaigns: SmmCampaign[],
  user: Pick<AppUser, "uid" | "name">,
  today: string,
): Promise<void> {
  const { dueItemsFor, dueLabel, dueNotificationKey } = await import("@/utils/smmReminders");
  const due = dueItemsFor(campaigns, user.uid, today);
  for (const d of due.slice(0, 5)) {
    await sendNotification({
      userId: user.uid,
      type: "smm_due",
      title: d.overdue ? "Social media post is late" : "Social media post due soon",
      message: `${d.businessName} — ${dueLabel(d)}`,
      link: `/smm/${d.campaignId}`,
      dedupeKey: dueNotificationKey(d.item.id, user.uid, today),
    }).catch(() => { /* a missed bell must not stop the next one */ });
  }
}

/**
 * The tech people a month can be put on.
 *
 * A one-time `getDocs` rather than a listener, and scoped by role: staff records change once a
 * month, and this is only read when somebody opens a campaign they are allowed to assign. The
 * whole-collection `onSnapshot(users)` pattern is what blew the free-tier read quota twice before —
 * see the header of services/teamLeads.
 */
export async function fetchAssignableMembers(): Promise<{ uid: string; name: string }[]> {
  try {
    const { getDocs, collection: coll, query: q, where: w } = await import("firebase/firestore");
    const snap = await getDocs(
      q(coll(db, "users"), w("role", "in", ["tech_member", "tech_team_leader"])),
    );
    return snap.docs
      .map((d) => ({ uid: d.id, ...(d.data() as AppUser) }))
      .filter((u) => u.isActive !== false && !u.externalCreator)
      .map((u) => ({ uid: u.uid, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error("[smm] fetchAssignableMembers:", err);
    return [];
  }
}
