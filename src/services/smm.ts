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
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc,
  where, Timestamp, updateDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import {
  blankItem, buildInitialItems, cycleFromStart, derivedProgressCounts, extraWorkTitle, extraWorkTypeInfo, isoDay,
  isPosted, newItemId, normaliseDuration, smmWatchers, targetsFromCommitments,
} from "@/utils/smmPlan";
import {
  closingStatus, cyclePhase, hasTeam, monthCycle, monthLabel, normaliseClipsPerVideo, renewalStartDate, saleDay,
  videosLine,
} from "@/utils/smmPackage";
import { dueItemsFor, dueLabel, dueNotificationKey, renewalsDueFor } from "@/utils/smmReminders";
import { commitmentsForPackage, platformsForPackage } from "@/utils/smmPricing";
import { POSTABLE_STATUSES } from "@/types/smm";
import type {
  SmmAdDayReport, SmmAdRun, SmmBudgetPayment, SmmCampaign, SmmCarriedPiece, SmmContentItem, SmmContentKind,
  SmmExtraWorkType, SmmItemStatus, SmmPaymentRoute, SmmPlatform, SmmRenewalState, SmmTeam,
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

/**
 * Firestore refuses `undefined`; a plan built in a form is full of optional fields.
 *
 * A JSON round trip, so it must never be handed a `serverTimestamp()` — the sentinel would come out
 * the other side as a plain map and be stored as one. Stamp those on AFTER cleaning.
 */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v)));
}

/** The team a renewal carries over: the same people in the same seats. */
function carriedTeam(team: SmmTeam | null | undefined): SmmTeam {
  return {
    creator: team?.creator ?? null,
    publisher: team?.publisher ?? null,
    marketer: team?.marketer ?? null,
    assistants: team?.assistants || [],
  };
}

/** Rows made by / posted by the seat holders, for a plan built with a team already on it. */
function withSeatHolders(items: SmmContentItem[], team: SmmTeam): SmmContentItem[] {
  return items.map((it) => ({
    ...it,
    makerUid: it.makerUid || team.creator?.uid || null,
    makerName: it.makerName || team.creator?.name || null,
    publisherUid: it.publisherUid || team.publisher?.uid || null,
    publisherName: it.publisherName || team.publisher?.name || null,
  }));
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
  /** Clips in each AI video, as agreed on the sale. Absent reads as 4 (see utils/smmPackage). */
  clipsPerVideo?: number | null;
  /** The month this sale renews, when the salesperson pressed Renew on it. */
  renewalOf?: string | null;
}

/**
 * The month a sale opens, before anybody has worked on it.
 *
 * One builder for both ways a sold month comes into being — the sale itself (`ensureCampaignForOrder`)
 * and the tech side setting an older sale up again (services/smmSetup) — so the two can never build
 * a different shape. `team` is non-empty only for a renewal, which carries the last month's people.
 */
export function buildSoldCampaign(
  input: CreateCampaignInput,
  options: {
    startDate: string;
    endDate?: string | null;
    team?: SmmTeam;
    renewalOf?: SmmCampaign | null;
    clipsPerVideo?: number | null;
    pageLinks?: SmmCampaign["pageLinks"];
  },
): Omit<SmmCampaign, "createdAt" | "updatedAt"> {
  const team = options.team || { creator: null, publisher: null, marketer: null, assistants: [] };
  const prev = options.renewalOf || null;
  const clips = options.clipsPerVideo ?? input.clipsPerVideo ?? prev?.clipsPerVideo ?? null;
  return {
    id: input.orderId,
    orderId: input.orderId,
    leadId: input.leadId,
    saleItemKey: input.saleItemKey,
    origin: "sale",
    clientPhone: input.clientPhone,
    clientPhoneId: input.clientPhoneId,
    clientName: input.clientName,
    businessName: input.businessName,
    packageKey: input.packageKey,
    packageLabel: input.packageLabel,
    amount: input.amount,
    cycle: monthCycle(options.startDate, options.endDate),
    platforms: input.platforms,
    commitments: input.commitments,
    items: withSeatHolders(buildInitialItems(input.commitments, input.platforms), team),
    ads: [],
    budgetPayments: [],
    team,
    soldBy: input.soldBy,
    soldByName: input.soldByName,
    salesAdminId: input.salesAdminId ?? null,
    watchers: smmWatchers(team, input.soldBy),
    status: "active",
    renewal: { state: "none", at: null, byName: null, note: null, nextCampaignId: null },
    clipsPerVideo: clips ? normaliseClipsPerVideo(clips) : null,
    pageLinks: options.pageLinks ?? prev?.pageLinks ?? null,
    renewalOf: prev?.id ?? null,
    monthNumber: prev ? (prev.monthNumber || 1) + 1 : 1,
  };
}

/**
 * Open the month, once.
 *
 * Idempotent on purpose: `upsertOrderForSale` runs again on every edit of the sale, and the plan
 * must not be rebuilt under a team that has already been filling it in for a fortnight. An existing
 * campaign only has its descriptive fields refreshed — the client's name, the business, the price —
 * and the plan itself is left alone. Never throws: a sale must not fail because a plan could not be
 * opened.
 *
 * ── A renewal continues the month before it (2026-10-03) ──────────────────────────────────────
 * When the salesperson pressed Renew, the sale names the month it renews. The new month then starts
 * where that one ends (or today, if the client had a gap), carries its team, its video length and the
 * client's page links, and is counted as month N+1 — and the old month is marked renewed, linked
 * forward, and closed once its own last day passes. The same people are given their jobs straight
 * away (services/smmAssign), because the whole point of a renewal is that nothing stops.
 */
export async function ensureCampaignForOrder(input: CreateCampaignInput): Promise<void> {
  try {
    const ref = campaignRef(input.orderId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const existing = snap.data() as SmmCampaign;
      // Deleted on purpose (deleteCampaign): editing or re-approving the sale must not bring it back.
      if (existing.status === "deleted") return;
      await updateDoc(ref, {
        /*
          A month taken off the board with its order comes back with it.

          `cancelOrderForSale` marks the campaign `removed` when a sale is deleted or over-discounted
          past the member's authority; re-approving the sale calls this again, so this is where it
          has to be revived. Only `removed` is reversed — a month that genuinely finished or renewed
          keeps the status it earned.
        */
        ...(existing.status === "removed" ? { status: "active" as const } : {}),
        // The sale is where the video length is agreed; the month takes it once and is then the
        // tech side's to change, so a later edit of the sale never undoes their setup.
        ...(!existing.clipsPerVideo && input.clipsPerVideo
          ? { clipsPerVideo: normaliseClipsPerVideo(input.clipsPerVideo) } : {}),
        clientName: input.clientName,
        // A month the tech side renamed keeps its name through every later edit of the sale.
        ...(existing.businessNameEdited ? {} : { businessName: input.businessName }),
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

    const prevRaw = input.renewalOf ? await fetchCampaign(input.renewalOf).catch(() => null) : null;
    const prev = prevRaw && prevRaw.status !== "deleted" && prevRaw.status !== "removed" ? prevRaw : null;
    const today = isoDay(new Date());
    const startDate = prev ? renewalStartDate(prev.cycle, today) : (input.startDate || today);
    const team = prev ? carriedTeam(prev.team) : undefined;
    const campaign = buildSoldCampaign(input, { startDate, team, renewalOf: prev });

    await setDoc(ref, {
      ...clean({
        ...campaign,
        // A renewal is set up from the month before it; a first month waits for the tech side.
        ...(prev && hasTeam(team) ? { setupAt: Timestamp.now(), setupByName: "Renewal — same team as before" } : {}),
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (prev) {
      await linkRenewal(prev, campaign as SmmCampaign, input.soldByName).catch((err) => {
        console.warn("[smm] could not link the renewal:", err);
      });
      return;
    }
    await notifySmmLeadsOfNewMonth(input.orderId, input.businessName || input.clientName, input.soldByName);
  } catch (err) {
    console.error("[smm] ensureCampaignForOrder failed:", err);
  }
}

/**
 * The second half of a renewal: the old month points forward, the team gets its new jobs, and the
 * tech side is told.
 *
 * The old month stays `active` until its own last day — renewing early must not hide the posts it
 * still owes — and `closeEndedMonthsOnOpen` files it as renewed once that day has passed.
 */
async function linkRenewal(prev: SmmCampaign, next: SmmCampaign, soldByName: string): Promise<void> {
  const today = isoDay(new Date());
  await mutateCampaign(prev.id, (c) => ({
    renewal: {
      ...(c.renewal || { state: "none" }),
      state: "won",
      at: Timestamp.now(),
      byName: soldByName,
      nextCampaignId: next.id,
    },
    ...(cyclePhase(c.cycle, today) === "ended" ? { status: "renewed" as const } : {}),
  }));

  // The same people, straight away. Whoever set the last month up is recorded as the assigner, so
  // completion still reports to the tech side and not to the salesperson who sold the renewal.
  let assigned: string[] = [];
  if (hasTeam(next.team)) {
    try {
      const { assignSmmMonth } = await import("@/services/smmAssign");
      const assignerUid = prev.setupByUid || (await fetchOrderTechAdmin(prev.orderId)) || next.soldBy;
      const result = await assignSmmMonth({
        campaignId: next.id,
        team: next.team,
        assigner: { uid: assignerUid, name: prev.setupByName && !prev.setupByName.startsWith("Renewal") ? prev.setupByName : "Renewal" },
        actor: null,
      });
      assigned = result.created.map((c) => c.name);
    } catch (err) {
      console.warn("[smm] renewal jobs not created:", err);
    }
  }

  const who = assigned.length > 0
    ? `Same team on it: ${assigned.join(", ")}.`
    : "It needs a team — open it and set it up.";
  const length = videosLine(next);
  for (const uid of await techSideUids()) {
    await sendNotification({
      userId: uid,
      type: "smm_renewed",
      title: "Social media month renewed",
      message: `${next.businessName || next.clientName} renewed for ${monthLabel(next.cycle.startDate)} (${next.packageLabel}${length ? ` · ${length}` : ""}) — sold by ${soldByName}. ${who}`,
      link: `/smm/${next.id}`,
      dedupeKey: `smm_renewed_${next.id}_${uid}`,
    }).catch(() => undefined);
  }
}

/** Who set the last month up, read off its order when the month itself predates `setupByUid`. */
async function fetchOrderTechAdmin(orderId: string | null | undefined): Promise<string | null> {
  if (!orderId) return null;
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    return snap.exists() ? ((snap.data() as Order).techAdminId || null) : null;
  } catch {
    return null;
  }
}

/** Every active tech admin and tech team leader — the people a renewal or a new month is announced to. */
async function techSideUids(): Promise<string[]> {
  try {
    const snap = await getDocs(query(collection(db, "users"), where("role", "in", ["tech_admin", "tech_team_leader"])));
    return snap.docs.filter((d) => (d.data() as AppUser).isActive !== false).map((d) => d.id);
  } catch (err) {
    console.warn("[smm] tech side lookup failed:", err);
    return [];
  }
}

/**
 * The campaign a sold month should have, built from the sale itself.
 *
 * Lives here rather than in `services/orders` so the shape of a campaign is decided in one file.
 * The sale carries the add-on count and the committed accounts under `smm`; a sale recorded before
 * that section existed falls back to the package's own quota and platforms, which is exactly what
 * those months were sold as. The month starts on the day the sale was made — which is today for a
 * sale being recorded now, and the original day for an older sale whose order is being rebuilt.
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
    startDate: saleDay(item, isoDay(new Date())),
    clipsPerVideo: sold?.clipsPerVideo ?? null,
    renewalOf: sold?.renewalOf ?? null,
  };
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
    tx.update(ref, { ...clean(patch), updatedAt: serverTimestamp() });
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
  input: {
    kind: SmmContentKind; title?: string; uploadDate?: string | null; uploadTime?: string | null; platforms?: SmmPlatform[];
    extra?: boolean; notes?: string | null;
    /** What the extra work is, and a video's length (2026-10-01) — the kind and title follow from it. */
    extraType?: SmmExtraWorkType | null; extraDuration?: string | null;
  },
  actor: SmmActor,
): Promise<void> {
  const typeInfo = input.extra && input.extraType ? extraWorkTypeInfo(input.extraType) : null;
  const duration = typeInfo?.video ? normaliseDuration(input.extraDuration) : "";
  const kind = typeInfo ? typeInfo.kind : input.kind;
  const created = await mutateCampaign(campaignId, (c) => {
    const item: SmmContentItem = {
      ...blankItem(kind, input.platforms?.length ? input.platforms : c.platforms, !!input.extra),
      ...(typeInfo ? { extraType: input.extraType, extraDuration: duration || null } : {}),
      title: input.title?.trim() || (typeInfo ? extraWorkTitle(input.extraType!, duration) : ""),
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

/**
 * The tech side's setup of a month — its dates, its video length and the client's page links —
 * stamped with who did it. The team is written separately by services/smmAssign, together with the
 * jobs it implies. Returns the month as saved.
 */
export async function saveMonthSetup(
  campaignId: string,
  setup: {
    cycle: SmmCampaign["cycle"];
    clipsPerVideo: number;
    pageLinks: SmmCampaign["pageLinks"];
    setupByName: string;
    setupByUid: string;
  },
): Promise<SmmCampaign | null> {
  return mutateCampaign(campaignId, () => ({
    cycle: setup.cycle,
    clipsPerVideo: normaliseClipsPerVideo(setup.clipsPerVideo),
    pageLinks: setup.pageLinks ?? null,
    setupAt: Timestamp.now(),
    setupByName: setup.setupByName,
    setupByUid: setup.setupByUid,
  }));
}

export async function setCommitments(
  campaignId: string,
  commitments: Record<SmmContentKind, number>,
  platforms?: SmmPlatform[],
): Promise<void> {
  await mutateCampaign(campaignId, () => ({ commitments, ...(platforms ? { platforms } : {}) }));
}

/** A row nobody has touched: no title, no date, not started, never sent to the client, not carried in. */
const untouchedRow = (i: SmmContentItem) =>
  !i.extra && !i.carriedFrom && i.status === "planned" && !i.title?.trim() && !i.uploadDate
  && (!i.approval || i.approval.state === "not_sent") && !i.notes?.trim();

/**
 * Change how many videos, posters and real videos the month owes (2026-10-03) — the tech side's call
 * at setup, when the client asked for more or less than the package.
 *
 * The plan follows in the same transaction: a higher count gets new blank rows (already on the seat
 * holders), a lower count loses rows only where nobody has touched them, from the end. A row with a
 * title, a date, a status or an approval on it is never removed — the month then simply shows more
 * rows than it owes, which is honest. The order's counters follow through `syncOrderProgress`.
 */
export async function setMonthCommitments(
  campaignId: string,
  commitments: Record<SmmContentKind, number>,
): Promise<void> {
  await mutateCampaign(campaignId, (c) => {
    const next: Record<SmmContentKind, number> = {
      poster: Math.max(0, Math.floor(commitments.poster || 0)),
      ai_ad: Math.max(0, Math.floor(commitments.ai_ad || 0)),
      real_video: Math.max(0, Math.floor(commitments.real_video || 0)),
    };
    let items = [...c.items];
    for (const kind of Object.keys(next) as SmmContentKind[]) {
      const rows = items.filter((i) => i.kind === kind && !i.extra);
      if (rows.length < next[kind]) {
        const add = Array.from({ length: next[kind] - rows.length }, () => ({
          ...blankItem(kind, c.platforms),
          makerUid: c.team?.creator?.uid ?? null,
          makerName: c.team?.creator?.name ?? null,
          publisherUid: c.team?.publisher?.uid ?? null,
          publisherName: c.team?.publisher?.name ?? null,
          createdAt: Timestamp.now(),
        }));
        items = [...items, ...add];
      } else if (rows.length > next[kind]) {
        let spare = rows.length - next[kind];
        const drop = new Set<string>();
        for (const row of [...rows].reverse()) {
          if (spare === 0) break;
          if (untouchedRow(row)) { drop.add(row.id); spare -= 1; }
        }
        items = items.filter((i) => !drop.has(i.id));
      }
    }
    const same = (Object.keys(next) as SmmContentKind[]).every((k) => (c.commitments?.[k] || 0) === next[k])
      && items.length === c.items.length;
    return same ? null : { commitments: next, items };
  });
}

/**
 * Record where the renewal conversation stands — pitched, or not renewing.
 *
 * "Renewed" is no longer typed here (2026-10-03): a renewal is a sale the salesperson records, and
 * that sale marks this month won and links it forward (`ensureCampaignForOrder`). A month whose
 * client is not renewing closes as lapsed — now if its last day has passed, otherwise when it does.
 */
export async function setRenewal(
  campaignId: string,
  state: SmmRenewalState,
  actor: SmmActor,
  note?: string | null,
): Promise<void> {
  const today = isoDay(new Date());
  await mutateCampaign(campaignId, (c) => ({
    renewal: {
      state,
      at: Timestamp.now(),
      byName: actor.name,
      note: note ?? null,
      nextCampaignId: c.renewal?.nextCampaignId ?? null,
    },
    ...(state === "won" ? { status: "renewed" as const } : {}),
    ...(state === "lost" && c.status === "active" && cyclePhase(c.cycle, today) === "ended"
      ? { status: "lapsed" as const } : {}),
  }));
}

export async function setCampaignStatus(campaignId: string, status: SmmCampaign["status"]): Promise<void> {
  await mutateCampaign(campaignId, () => ({ status }));
}

/**
 * File every month that has run out of days and has a decision behind it — renewed or lapsed.
 *
 * There is no scheduler on this stack, so it runs when an overseer opens the board, exactly like the
 * order deadline sweep. A month past its end with NO decision is left running on purpose: it shows
 * under Renewals and Needs attention until the salesperson renews it or says the client is not
 * renewing, because a renewal nobody decided is the one that silently lapses. Never throws.
 */
export async function closeEndedMonthsOnOpen(campaigns: SmmCampaign[], today: string): Promise<number> {
  let closed = 0;
  for (const c of campaigns) {
    const status = closingStatus(c, today);
    if (!status) continue;
    try {
      await mutateCampaign(c.id, (cur) => (closingStatus(cur, today) === status ? { status } : null));
      closed += 1;
    } catch (err) {
      console.warn("[smm] could not close", c.id, err);
    }
  }
  return closed;
}

/**
 * The finished months, read once when somebody opens the Finished tab.
 *
 * Overseers read only the active set live (a listener on every month ever run would grow for ever
 * on a free-tier quota), which is why this tab used to be empty for them. One query, on demand.
 */
export async function fetchFinishedCampaigns(): Promise<SmmCampaign[]> {
  try {
    const snap = await getDocs(query(collection(db, SMM_CAMPAIGNS), where("status", "in", ["completed", "renewed", "lapsed"])));
    return snap.docs.map((d) => fromSnap(d as CampaignSnap))
      .sort((a, b) => (b.cycle?.startDate || "").localeCompare(a.cycle?.startDate || ""));
  } catch (err) {
    console.error("[smm] fetchFinishedCampaigns:", err);
    return [];
  }
}

/**
 * Move pieces a month owed and never posted into the next month.
 *
 * ── Why move, and why they count ──────────────────────────────────────────────────────────────
 * The client paid for them, so they are still owed — dropping them when the month closes is how a
 * client ends up two posts short with nobody able to say where they went. Moving (not copying)
 * keeps each piece in exactly one place. They are added to the next month's commitments, because
 * that month now owes them, and each carries where it came from. The old month keeps its own
 * commitments untouched and records what left it, so its report still says honestly that those
 * pieces were not posted in its own dates.
 *
 * One transaction across both documents: a piece is never in both months, nor in neither.
 */
export async function moveUnpostedToMonth(
  fromId: string,
  toId: string,
  itemIds: string[],
  actor: SmmActor,
): Promise<number> {
  const fromRef = campaignRef(fromId);
  const toRef = campaignRef(toId);
  const moved = await runTransaction(db, async (tx) => {
    const [fromSnap, toSnap] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    if (!fromSnap.exists() || !toSnap.exists()) throw new Error("One of the two months no longer exists.");
    const from = { ...(fromSnap.data() as SmmCampaign), id: fromSnap.id };
    const to = { ...(toSnap.data() as SmmCampaign), id: toSnap.id };

    const wanted = new Set(itemIds);
    const pieces = from.items.filter((i) => wanted.has(i.id) && !i.extra && !isPosted(i));
    if (pieces.length === 0) return 0;

    const label = monthLabel(from.cycle.startDate);
    const commitments = { ...to.commitments };
    for (const p of pieces) commitments[p.kind] = (commitments[p.kind] || 0) + 1;
    const carriedOut: SmmCarriedPiece[] = [
      ...(from.carriedOut || []),
      ...pieces.map((p) => ({
        itemId: p.id, title: p.title?.trim() || "", kind: p.kind, toCampaignId: to.id, at: Timestamp.now(), byName: actor.name,
      })),
    ];

    tx.update(fromRef, {
      ...clean({ items: from.items.filter((i) => !pieces.some((p) => p.id === i.id)), carriedOut }),
      updatedAt: serverTimestamp(),
    });
    tx.update(toRef, {
      ...clean({
        commitments,
        items: [
          ...to.items,
          ...pieces.map((p) => ({ ...p, carriedFrom: { campaignId: from.id, label }, updatedAt: Timestamp.now() })),
        ],
      }),
      updatedAt: serverTimestamp(),
    });
    return pieces.length;
  });

  if (moved > 0) {
    // Both orders' counters follow their plans.
    const [from, to] = await Promise.all([fetchCampaign(fromId), fetchCampaign(toId)]);
    if (from) await syncOrderProgress(from).catch(() => undefined);
    if (to) await syncOrderProgress(to).catch(() => undefined);
  }
  return moved;
}

/** An overseer nudging the salesperson about a renewal that is due — once a day, however many clicks. */
export async function remindSellerToRenew(campaign: SmmCampaign, actor: SmmActor): Promise<void> {
  if (!campaign.soldBy || campaign.soldBy === actor.uid) return;
  await sendNotification({
    userId: campaign.soldBy,
    type: "smm_renewal_reminder",
    title: "Renewal due — your client",
    message: `${actor.name || "The tech side"} asks you to renew ${campaign.businessName || campaign.clientName}'s social media month (ends ${campaign.cycle.endDate}). Open it and press Renew.`,
    link: `/smm/${campaign.id}`,
    dedupeKey: `smm_renew_remind_${campaign.id}_${isoDay(new Date())}`,
  });
}

/**
 * Tell a salesperson which of their months are due for renewal — once per month per day.
 *
 * Called when they open their dashboard or the board; the dedupe key carries the day, so opening
 * the app six times is one bell and the next day is a new one.
 */
export async function notifyRenewalsDueOnOpen(
  campaigns: SmmCampaign[],
  user: Pick<AppUser, "uid">,
  today: string,
): Promise<void> {
  for (const r of renewalsDueFor(campaigns, user.uid, today).slice(0, 5)) {
    await sendNotification({
      userId: user.uid,
      type: "smm_renewal_due",
      title: r.daysLeft > 0 ? "Social media renewal due" : "Social media month has ended",
      message: r.daysLeft > 0
        ? `${r.businessName} — ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"} left (${r.postedOfCommitted} posted). Press Renew to continue next month.`
        : `${r.businessName} — the month has ended (${r.postedOfCommitted} posted). Renew it, or mark that they are not renewing.`,
      link: `/smm/${r.campaignId}`,
      dedupeKey: `smm_renewal_due_${r.campaignId}_${user.uid}_${today}`,
    }).catch(() => { /* a missed bell must not stop the next one */ });
  }
}

/**
 * Delete a month (2026-10-01) — main admin, tech admin, tech team leader or the Social Media Team
 * Lead (smmPlan.canDeleteSmmCampaign).
 *
 * A month added directly has nothing behind it, so its document is simply deleted. A SOLD month is
 * keyed on its order, and `ensureCampaignForOrder` runs again whenever the sale is edited or
 * re-approved — a deleted document would come straight back as a fresh, empty month. So a sold month
 * is kept as a tombstone, `status: "deleted"`, which every list and page treats as gone and which
 * `ensureCampaignForOrder` never revives (unlike `removed`, which follows its order back).
 */
export async function deleteCampaign(campaign: Pick<SmmCampaign, "id" | "orderId">, actor: SmmActor): Promise<void> {
  if (!campaign.orderId) {
    await deleteDoc(campaignRef(campaign.id));
    return;
  }
  await updateDoc(campaignRef(campaign.id), {
    status: "deleted",
    deletedAt: serverTimestamp(),
    deletedByName: actor.name || "",
    updatedAt: serverTimestamp(),
  });
}

/**
 * Put back a month deleted a moment ago — the Undo on the delete toast (2026-10-03).
 *
 * Given the month exactly as it was before the delete. A sold month was only tombstoned, so its
 * status comes back and the delete stamps go; a month started directly was erased, so it is written
 * back whole. Either way the plan, ads, money and team are what they were.
 */
export async function undoDeleteCampaign(before: SmmCampaign): Promise<void> {
  if (before.orderId) {
    await updateDoc(campaignRef(before.id), {
      status: before.status === "deleted" ? "active" : before.status,
      deletedAt: null,
      deletedByName: null,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  const { createdAt: _created, updatedAt: _updated, ...rest } = before;
  await setDoc(campaignRef(before.id), { ...clean(rest), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

/* ── The Social Media Team Lead ─────────────────────────────────────────────────────────────── */

/**
 * The people running the whole social-media side (`users.smmLeader`, 2026-10-01 naming: "Social
 * Media Team Lead"). A tech member keeps their own role and screens and gains every month in the
 * company — seeing, assigning, starting and deleting them. Live, and one equality filter.
 */
export function watchSmmTeamLeads(cb: (leads: { uid: string; name: string; role?: string }[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "users"), where("smmLeader", "==", true)),
    (snap) => cb(snap.docs
      .map((d) => ({ uid: d.id, ...(d.data() as AppUser) }))
      .filter((u) => u.isActive !== false)
      .map((u) => ({ uid: u.uid, name: u.name, role: u.role }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))),
    (err) => { console.error("[smm] watchSmmTeamLeads:", err); cb([]); },
  );
}

/** Make someone the Social Media Team Lead, or stand them down — and tell them either way. */
export async function setSmmTeamLead(member: { uid: string; name: string }, lead: boolean, actor: SmmActor): Promise<void> {
  await updateDoc(doc(db, "users", member.uid), { smmLeader: lead, updatedAt: serverTimestamp() });
  await sendNotification({
    userId: member.uid,
    type: "smm_lead",
    title: lead ? "You are the Social Media Team Lead" : "Social Media Team Lead role removed",
    message: lead
      ? `${actor.name || "Your admin"} made you the Social Media Team Lead: you now see, assign and manage every social media month.`
      : `${actor.name || "Your admin"} removed your Social Media Team Lead role. You keep the months you are on.`,
    link: "/smm",
  }).catch(() => { /* the role is changed either way */ });
}

/**
 * Tell the Social Media Team Lead(s) a new month has been sold, so it gets a team the same day.
 * Never throws: a sale must not fail because a bell could not ring.
 */
async function notifySmmLeadsOfNewMonth(campaignId: string, businessName: string, soldByName: string): Promise<void> {
  try {
    const snap = await getDocs(query(collection(db, "users"), where("smmLeader", "==", true)));
    for (const d of snap.docs) {
      if ((d.data() as AppUser).isActive === false) continue;
      await sendNotification({
        userId: d.id,
        type: "smm_new_month",
        title: "New social media month",
        message: `${businessName} — sold by ${soldByName}. Put a team on it.`,
        link: `/smm/${campaignId}`,
        dedupeKey: `smm_new_${campaignId}_${d.id}`,
      }).catch(() => undefined);
    }
  } catch (err) {
    console.warn("[smm] notifySmmLeadsOfNewMonth:", err);
  }
}

/**
 * Take a month off the board with the order it belongs to — or put it back.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────
 * Removing an order from the tech queue used to leave its month running: the campaign was keyed on
 * the order, but nothing told it the order had gone. The member who had been assigned kept seeing
 * the client on their Social Media list, kept being reminded about posts for it, and kept being
 * able to record work against a job that no longer existed.
 *
 * Never throws and never creates: a month that has no campaign (an ordinary ad order, a sale from
 * before this section existed) is simply not one of these, and removing its order must not fail
 * because of that.
 */
export async function setCampaignRemovedForOrders(
  orderIds: string[],
  removed: boolean,
): Promise<void> {
  await Promise.all(orderIds.map(async (orderId) => {
    try {
      const snap = await getDoc(campaignRef(orderId));
      if (!snap.exists()) return;
      const current = snap.data() as SmmCampaign;
      // Putting one back only ever revives a month this took away; a month that had genuinely
      // finished or renewed keeps the status it earned.
      if (!removed && current.status !== "removed") return;
      await updateDoc(campaignRef(orderId), {
        status: removed ? "removed" : "active",
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("[smm] setCampaignRemovedForOrders:", err);
    }
  }));
}

/**
 * Erase the months belonging to orders being purged.
 *
 * Purging is the one deletion in the pipeline that leaves nothing behind — the order goes, the
 * client chat goes, and the month's plan goes with them. Anything less would leave a campaign
 * pointing at an order id that resolves to nothing.
 */
export async function deleteCampaignsForOrders(orderIds: string[]): Promise<void> {
  await Promise.all(orderIds.map(async (orderId) => {
    try {
      await deleteDoc(campaignRef(orderId));
    } catch (err) {
      console.error("[smm] deleteCampaignsForOrders:", err);
    }
  }));
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
