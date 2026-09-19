/**
 * What a sold month owes, what has actually happened, and the arithmetic every screen reads.
 *
 * Pure on purpose — no Firestore, no React. The fulfilment bar, the monthly report, the reminder
 * sweep, the renewal card and the order's own counters are five views of the same numbers, and
 * they get them from here so they cannot disagree. Every one of them has, at some point, been the
 * number somebody quoted to a client.
 */

import {
  SMM_CONTENT_KINDS, SMM_PLATFORMS,
  type SmmAdDayReport, type SmmAdRun, type SmmApproval, type SmmBudgetPayment, type SmmCampaign,
  type SmmContentItem,
  type SmmContentKind, type SmmCycle, type SmmItemStatus, type SmmPlatform, type SmmTeam,
} from "@/types/smm";
import type { OrderProgressCounts } from "@/types";

/* ── Dates ──────────────────────────────────────────────────────────────────────────────────── */

/** `yyyy-MM-dd` for a Date, in local time — the same day the member sees on their own calendar. */
export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A `yyyy-MM-dd` back to a Date at local midnight. Invalid input gives `null`, never `Invalid Date`. */
export function dayToDate(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Whole days from `from` to `to`, both `yyyy-MM-dd`. Negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const a = dayToDate(from);
  const b = dayToDate(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDays(iso: string, n: number): string {
  const d = dayToDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/**
 * The month a campaign covers, from the day it was sold.
 *
 * Thirty days from the sale, not the calendar month — a retainer sold on the 22nd runs to the 21st,
 * and pretending otherwise would give that client eight days of service for a month's money and
 * then bill them again. Editable afterwards, because clients do ask to start on the first.
 */
export function cycleFromStart(startIso: string, days = 30): SmmCycle {
  const start = dayToDate(startIso) ? startIso : isoDay(new Date());
  return {
    month: start.slice(0, 7),
    startDate: start,
    endDate: addDays(start, Math.max(1, days) - 1),
  };
}

/** Days left in the cycle, counting today. Negative once it has run out. */
export function daysLeftInCycle(cycle: SmmCycle, today: string): number {
  return daysBetween(today, cycle.endDate) + 1;
}

/* ── The plan ───────────────────────────────────────────────────────────────────────────────── */

let seq = 0;
/** A stable-enough id for an array element. Not a Firestore id — these live inside one document. */
export function newItemId(prefix = "it"): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * The month as a checklist, the moment the sale is recorded.
 *
 * Every committed piece gets a row straight away — untitled, undated, `planned`. That matters more
 * than it looks: a month that starts as an empty page is a month where the first week goes on
 * "we'll plan it tomorrow", whereas eight blank rows with a counter above them is a thing somebody
 * fills in. The tech team supplies the titles and the dates; nobody has to remember the quota.
 */
export function buildInitialItems(
  commitments: Record<SmmContentKind, number>,
  platforms: SmmPlatform[],
): SmmContentItem[] {
  const out: SmmContentItem[] = [];
  for (const { key } of SMM_CONTENT_KINDS) {
    const n = Math.max(0, Math.floor(commitments[key] || 0));
    for (let i = 0; i < n; i += 1) {
      out.push(blankItem(key, platforms));
    }
  }
  return out;
}

/**
 * When a post goes up unless somebody says otherwise.
 *
 * Six in the morning: the team posts first thing, and typing the same four characters onto thirty
 * items a month is exactly the sort of chore that ends with half of them left blank. Set here
 * rather than in the dialog so a row created from the table, from the quota, or from anywhere else
 * arrives with the same time on it.
 */
export const DEFAULT_UPLOAD_TIME = "06:00";

export function blankItem(kind: SmmContentKind, platforms: SmmPlatform[], extra = false): SmmContentItem {
  return {
    id: newItemId(kind),
    kind,
    title: "",
    uploadDate: null,
    uploadTime: DEFAULT_UPLOAD_TIME,
    platforms: [...platforms],
    status: "planned",
    approval: { state: "not_sent", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] },
    makerUid: null,
    makerName: null,
    publisherUid: null,
    publisherName: null,
    extra,
    extraCharge: extra ? "unbilled" : null,
    extraAmount: null,
    postedAt: null,
    postUrls: null,
    notes: null,
  };
}

/* ── Where an item stands ───────────────────────────────────────────────────────────────────── */

/** Ranked so "has it got at least this far" is a comparison rather than a list of statuses. */
const STATUS_RANK: Record<SmmItemStatus, number> = {
  planned: 0,
  in_progress: 1,
  awaiting_approval: 2,
  changes_requested: 2,
  approved: 3,
  scheduled: 4,
  posted: 5,
};

/** The thing exists — it has been made, whatever the client has since said about it. */
export function isMade(item: SmmContentItem): boolean {
  return STATUS_RANK[item.status] >= STATUS_RANK.awaiting_approval;
}

export function isPosted(item: SmmContentItem): boolean {
  return item.status === "posted";
}

/** Sitting with the client, waiting for a yes. The state that quietly eats a month. */
export function isWaitingOnClient(item: SmmContentItem): boolean {
  return item.approval?.state === "waiting" || item.approval?.state === "changes";
}

/**
 * Whether this item may go up.
 *
 * The rule the business runs on — *nothing is posted without approval* — expressed once, here, so
 * the service that writes the status and the UI that offers the button cannot hold different
 * opinions about it.
 */
export function canPublish(item: SmmContentItem): boolean {
  return item.approval?.state === "approved";
}

/** Past its upload date and still not up. */
export function isOverdue(item: SmmContentItem, today: string): boolean {
  if (!item.uploadDate || isPosted(item)) return false;
  return daysBetween(item.uploadDate, today) > 0;
}

/** Days until it is due. Negative when it is late, `null` when no date has been set. */
export function daysUntilDue(item: SmmContentItem, today: string): number | null {
  if (!item.uploadDate) return null;
  return daysBetween(today, item.uploadDate);
}

/**
 * Where this piece actually went live, one entry per account.
 *
 * Folds the single `postUrl` older items carry into the same shape, so the dialog, the update
 * message and any later report all read one list and nobody has to remember there were two shapes.
 * Only accounts the item was actually posted to appear — a blank box is not a link.
 */
export function postLinks(item: SmmContentItem): { platform: SmmPlatform; label: string; url: string }[] {
  const out: { platform: SmmPlatform; label: string; url: string }[] = [];
  for (const { key, label } of SMM_PLATFORMS) {
    if (!item.platforms?.includes(key)) continue;
    const url = item.postUrls?.[key]?.trim();
    if (url) out.push({ platform: key, label, url });
  }
  // An item from before links were per-account: show the one it has, against its first account.
  if (out.length === 0 && item.postUrl?.trim() && item.platforms?.length) {
    const first = SMM_PLATFORMS.find((p) => item.platforms.includes(p.key));
    if (first) out.push({ platform: first.key, label: first.label, url: item.postUrl.trim() });
  }
  return out;
}

/** Everyone who should be reminded about this piece — whoever makes it and whoever posts it. */
export function itemOwners(item: SmmContentItem): string[] {
  return Array.from(new Set([item.makerUid, item.publisherUid].filter(Boolean) as string[]));
}

/* ── Fulfilment ─────────────────────────────────────────────────────────────────────────────── */

export interface KindProgress {
  kind: SmmContentKind;
  committed: number;
  made: number;
  posted: number;
  /** Delivered beyond what was sold. Shown separately — it is a gift or an invoice, never a target. */
  extra: number;
}

export interface SmmFulfilment {
  byKind: KindProgress[];
  committed: number;
  made: number;
  posted: number;
  extra: number;
  /** 0–100 against what was SOLD, so extra work can never flatter a month that is behind. */
  percent: number;
  complete: boolean;
}

export function fulfilment(campaign: Pick<SmmCampaign, "items" | "commitments">): SmmFulfilment {
  const byKind: KindProgress[] = SMM_CONTENT_KINDS.map(({ key }) => {
    const all = campaign.items.filter((i) => i.kind === key);
    const committed = Math.max(0, Math.floor(campaign.commitments?.[key] || 0));
    const contracted = all.filter((i) => !i.extra);
    return {
      kind: key,
      committed,
      made: contracted.filter(isMade).length,
      posted: contracted.filter(isPosted).length,
      extra: all.filter((i) => i.extra && isPosted(i)).length,
    };
  });

  const committed = byKind.reduce((n, k) => n + k.committed, 0);
  const posted = byKind.reduce((n, k) => n + k.posted, 0);

  return {
    byKind,
    committed,
    made: byKind.reduce((n, k) => n + k.made, 0),
    posted,
    extra: byKind.reduce((n, k) => n + k.extra, 0),
    percent: committed > 0 ? Math.min(100, Math.round((posted / committed) * 100)) : 0,
    complete: committed > 0 && posted >= committed,
  };
}

/** How many of the month's posts went to each account — the per-platform line of the report. */
export function postsByPlatform(items: SmmContentItem[]): { platform: SmmPlatform; label: string; count: number }[] {
  return SMM_PLATFORMS.map(({ key, label }) => ({
    platform: key,
    label,
    count: items.filter((i) => isPosted(i) && i.platforms?.includes(key)).length,
  })).filter((p) => p.count > 0);
}

/* ── Waiting on the client ──────────────────────────────────────────────────────────────────── */

/** Epoch ms from any of the timestamp shapes this data has carried — a Firestore Timestamp, a
 *  plain number, or an ISO string written by an older build. */
function tsToMs(ts: unknown): number {
  if (ts === null || ts === undefined) return 0;
  if (typeof ts === "number") return ts;
  const t = ts as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  const parsed = Date.parse(String(ts));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Whole days one approval has cost, answered or still open. */
export function approvalWaitDays(approval: SmmApproval | null | undefined, now = Date.now()): number {
  const asked = tsToMs(approval?.askedAt);
  if (!asked) return 0;
  const answered = tsToMs(approval?.respondedAt);
  const end = approval?.state === "approved" && answered ? answered : now;
  return Math.max(0, Math.floor((end - asked) / 86_400_000));
}

export interface ClientWaitSummary {
  /** Days lost across the month, added up over every piece that had to wait. */
  totalDays: number;
  /** The single longest wait — the one worth naming when a client says nothing was posted. */
  worstDays: number;
  /** How many pieces are sitting with them right now. */
  openCount: number;
  /** How many follow-ups the team has had to make. */
  chases: number;
}

/**
 * How much of this month was spent waiting for the client to answer.
 *
 * ── Why this number exists ────────────────────────────────────────────────────────────────────
 * The complaint that actually costs renewals is "you people didn't do the work" — made weeks after
 * the fortnight the client spent not picking up the phone. There is no winning that argument from
 * memory. This is the same fortnight, counted from stamps made at the time by the person who was
 * waiting, and it goes on the monthly report as a matter of course rather than being dug out when
 * there is a row. Recorded for every client, not just the difficult ones, because a number that
 * only appears during an argument reads as an excuse.
 */
export function clientWaitSummary(items: SmmContentItem[], now = Date.now()): ClientWaitSummary {
  let totalDays = 0;
  let worstDays = 0;
  let openCount = 0;
  let chases = 0;

  for (const item of items) {
    const days = approvalWaitDays(item.approval, now);
    if (days > 0) {
      totalDays += days;
      worstDays = Math.max(worstDays, days);
    }
    if (isWaitingOnClient(item)) openCount += 1;
    chases += item.approval?.chases?.length || 0;
  }

  return { totalDays, worstDays, openCount, chases };
}

/* ── Ads ────────────────────────────────────────────────────────────────────────────────────── */

/** Every date a run covers, `yyyy-MM-dd`, in order. */
export function adRunDays(run: Pick<SmmAdRun, "startDate" | "days">): string[] {
  const n = Math.max(0, Math.floor(run.days || 0));
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(addDays(run.startDate, i));
  return out;
}

/** What one day of a run is budgeted at — the agreed figure unless that day was overridden. */
export function budgetForDay(run: SmmAdRun, day: string): number {
  const override = run.budgetByDay?.[day];
  return Number.isFinite(override as number) ? Math.max(0, Number(override)) : Math.max(0, Number(run.dailyBudget) || 0);
}

/** Everything the run is planned to spend across its days, with per-day overrides honoured. */
export function plannedSpend(run: SmmAdRun): number {
  return adRunDays(run).reduce((sum, d) => sum + budgetForDay(run, d), 0);
}

export interface AdTotals {
  leads: number;
  spend: number;
  /** Spend ÷ leads, which is the only cost-per-result that survives being added up across days. */
  costPerResult: number;
  reach: number;
  daysReported: number;
}

export function adTotals(reports: SmmAdDayReport[]): AdTotals {
  const leads = reports.reduce((n, r) => n + (Number(r.leads) || 0), 0);
  const spend = reports.reduce((n, r) => n + (Number(r.spend) || 0), 0);
  const reach = reports.reduce((n, r) => n + (Number(r.reach) || 0), 0);
  return {
    leads,
    spend,
    costPerResult: leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0,
    reach,
    daysReported: reports.length,
  };
}

/** Every day report on the campaign, newest first — the month's ad performance in one list. */
export function allAdReports(campaign: Pick<SmmCampaign, "ads">): SmmAdDayReport[] {
  return campaign.ads
    .flatMap((run) => (run.reports || []).map((r) => ({ ...r })))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** The items one run is actually promoting. */
export function itemsForRun(campaign: Pick<SmmCampaign, "items">, run: SmmAdRun): SmmContentItem[] {
  if (run.scope.itemIds?.length) {
    const ids = new Set(run.scope.itemIds);
    return campaign.items.filter((i) => ids.has(i.id));
  }
  if (run.scope.kind === "all") return campaign.items;
  return campaign.items.filter((i) => i.kind === run.scope.kind);
}

/* ── The client's ad money ──────────────────────────────────────────────────────────────────── */

export interface BudgetLedger {
  funded: number;
  spent: number;
  balance: number;
  /** What the running campaigns want tomorrow — the figure the balance has to clear. */
  nextDayNeed: number;
  /** Not enough left to run tomorrow. The one number worth interrupting somebody for. */
  short: boolean;
  /**
   * The client's money we are sitting on: paid to us, not yet proved as forwarded to Meta.
   *
   * It is not ours and it is not working — an ad account with no funds in it while the client
   * believes they have paid is the worst version of this going wrong, because they will only find
   * out when the ads stop. Counted from the payments that took the `via_us` route and have no
   * `metaProofUrl` against them yet.
   */
  heldByUs: number;
  /** Those payments, so the panel can point at the exact ones still to forward. */
  awaitingForward: SmmBudgetPayment[];
}

/**
 * What the client has put in against what the ads have spent.
 *
 * Some clients fund weekly, some top up the day an ad is running, and in both cases the campaign
 * stops dead when the money runs out — usually discovered by the client, which is the worst way for
 * it to be discovered. So the balance is kept, and "can this run tomorrow" is answered before
 * tomorrow.
 */
export function budgetLedger(campaign: Pick<SmmCampaign, "ads" | "budgetPayments">, today: string): BudgetLedger {
  const funded = (campaign.budgetPayments || []).reduce((n, p) => n + (Number(p.amount) || 0), 0);
  const spent = campaign.ads.reduce((n, run) => n + adTotals(run.reports || []).spend, 0);
  const tomorrow = addDays(today, 1);
  const nextDayNeed = campaign.ads
    .filter((run) => run.status === "running" && adRunDays(run).includes(tomorrow))
    .reduce((n, run) => n + budgetForDay(run, tomorrow), 0);
  const balance = Math.round((funded - spent) * 100) / 100;

  // Paid to us, with no proof yet that it reached the ad account.
  const awaitingForward = (campaign.budgetPayments || [])
    .filter((p) => p.route === "via_us" && !p.metaProofUrl);
  const heldByUs = awaitingForward.reduce((n, p) => n + (Number(p.amount) || 0), 0);

  return {
    funded, spent, balance, nextDayNeed,
    short: nextDayNeed > 0 && balance < nextDayNeed,
    heldByUs, awaitingForward,
  };
}

/**
 * Every proof attached to one payment, in the order the money moved.
 *
 * Folds the single `screenshotUrl` older payments carry into the same shape, so a row rendered
 * today shows the evidence somebody uploaded a month ago without anything having to be migrated.
 */
export function paymentProofs(p: SmmBudgetPayment): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  const client = p.clientProofUrl || p.screenshotUrl;
  if (client) out.push({ label: p.route === "via_us" ? "Client → us" : "Client → Meta", url: client });
  if (p.metaProofUrl) out.push({ label: "Us → Meta", url: p.metaProofUrl });
  return out;
}

/* ── Extra work ─────────────────────────────────────────────────────────────────────────────── */

export interface ExtraWorkSummary {
  items: SmmContentItem[];
  unbilled: number;
  billedAmount: number;
  freeCount: number;
}

export function extraWork(items: SmmContentItem[]): ExtraWorkSummary {
  const extras = items.filter((i) => i.extra);
  return {
    items: extras,
    unbilled: extras.filter((i) => (i.extraCharge || "unbilled") === "unbilled").length,
    billedAmount: extras
      .filter((i) => i.extraCharge === "billed")
      .reduce((n, i) => n + (Number(i.extraAmount) || 0), 0),
    freeCount: extras.filter((i) => i.extraCharge === "free").length,
  };
}

/* ── Keeping the order's own counters true ──────────────────────────────────────────────────── */

/**
 * The order's four counters, derived from the plan.
 *
 * `OrderProgress.done` used to be typed in by hand on the Orders queue, and three other features
 * read it: the balance-collect gate (utils/collectReadiness), tech payroll
 * (utils/techProductivity) and the queue's own pinning. Rather than leave a second, hand-maintained
 * copy of the truth next to this one, the campaign computes them and services/smm writes them
 * through — so those three features keep working, unchanged, on numbers nobody has to remember to
 * update.
 */
/**
 * The order's targets, from what was committed at the sale.
 *
 * Deliberately reproduces what the catalogue quota already said for a stock package — a Pro month
 * is 8 videos, 8 posters, 16 posts, 16 stories and 8 run, and that is exactly 8 AI ads + 8 posters
 * planned here, each posted once, each available as a story, with only the videos ever promoted.
 * The numbers are the same; what changes is that they now come from the plan, so a month with three
 * real-video add-ons on top owes eleven videos rather than eight and every screen says so.
 */
export function targetsFromCommitments(commitments: Record<SmmContentKind, number>): OrderProgressCounts {
  const posters = Math.max(0, Math.floor(commitments.poster || 0));
  const videos = Math.max(0, Math.floor(commitments.ai_ad || 0)) + Math.max(0, Math.floor(commitments.real_video || 0));
  const pieces = posters + videos;
  /*
    `stories: 0` on purpose. Stories were a tick box on each item, and the box has gone — so nothing
    can ever move that counter. Leaving a target on it would mean every month sat permanently
    incomplete and pinned to the top of the Orders queue, which is precisely the failure the
    counters exist to prevent. A zero target is simply not shown (see `activeFields`).
  */
  return { ads: videos, posters, posted: pieces, stories: 0, campaigns: videos };
}

export function derivedProgressCounts(campaign: Pick<SmmCampaign, "items" | "ads">): OrderProgressCounts {
  const contracted = campaign.items.filter((i) => !i.extra);
  const promoted = new Set<string>();
  for (const run of campaign.ads) {
    if (run.status === "planned") continue;
    for (const item of itemsForRun(campaign, run)) promoted.add(item.id);
  }

  return {
    ads: contracted.filter((i) => i.kind !== "poster" && isMade(i)).length,
    posters: contracted.filter((i) => i.kind === "poster" && isMade(i)).length,
    posted: contracted.filter(isPosted).length,
    stories: contracted.filter((i) => isPosted(i) && i.story).length,
    campaigns: contracted.filter((i) => promoted.has(i.id)).length,
  };
}

/* ── Team ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * Every uid that may read this campaign through its own `array-contains` query.
 *
 * Admins, team leaders and SMM leaders are deliberately absent: they read the active set instead.
 * Putting them here would mean writing every campaign in the company the day somebody is promoted,
 * and quietly leaving the old ones behind the day somebody is not.
 */
export function smmWatchers(team: SmmTeam, soldBy: string): string[] {
  const ids = [
    soldBy,
    team.creator?.uid,
    team.publisher?.uid,
    team.marketer?.uid,
    ...(team.assistants || []).map((a) => a.uid),
  ].filter(Boolean) as string[];
  return Array.from(new Set(ids));
}

/** Everyone on the month, deduplicated, for a "who is on this" line. */
export function teamMembers(team: SmmTeam): { uid: string; name: string; roles: string[] }[] {
  const map = new Map<string, { uid: string; name: string; roles: string[] }>();
  const add = (a: { uid: string; name: string } | null | undefined, role: string) => {
    if (!a?.uid) return;
    const existing = map.get(a.uid);
    if (existing) existing.roles.push(role);
    else map.set(a.uid, { uid: a.uid, name: a.name, roles: [role] });
  };
  add(team.creator, "Content");
  add(team.publisher, "Posting");
  add(team.marketer, "Marketing");
  for (const a of team.assistants || []) add(a, "Assisting");
  return [...map.values()];
}

/** Whether this person may change the plan: anyone on the month, its seller, or an overseer. */
export function canEditCampaign(
  campaign: Pick<SmmCampaign, "watchers" | "soldBy">,
  user: { uid?: string; role?: string; smmLeader?: boolean } | null | undefined,
): boolean {
  if (!user?.uid) return false;
  if (isSmmOverseer(user)) return true;
  return campaign.watchers?.includes(user.uid) || campaign.soldBy === user.uid;
}

/** The roles that see every campaign in the company, whether or not they are on it. */
export function isSmmOverseer(user: { role?: string; smmLeader?: boolean } | null | undefined): boolean {
  if (!user) return false;
  if (user.smmLeader) return true;
  return ["main_admin", "tech_admin", "sales_admin", "tech_team_leader"].includes(user.role || "");
}

/* ── One line about the month ───────────────────────────────────────────────────────────────── */

/** "6 of 8 posted · 2 waiting on client · ends in 9 days" — the whole state of a month, in a row. */
export function campaignHeadline(campaign: SmmCampaign, today: string): string {
  const f = fulfilment(campaign);
  const wait = clientWaitSummary(campaign.items);
  const left = daysLeftInCycle(campaign.cycle, today);
  const parts = [`${f.posted} of ${f.committed} posted`];
  if (wait.openCount > 0) parts.push(`${wait.openCount} waiting on client`);
  if (left > 0) parts.push(`ends in ${left} day${left === 1 ? "" : "s"}`);
  else if (left === 0) parts.push("last day");
  else parts.push(`ended ${Math.abs(left)} day${Math.abs(left) === 1 ? "" : "s"} ago`);
  return parts.join(" · ");
}
