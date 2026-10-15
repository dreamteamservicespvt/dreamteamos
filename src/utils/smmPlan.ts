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
  type SmmContentKind, type SmmCycle, type SmmExtraWorkType, type SmmItemStatus, type SmmPlatform, type SmmTeam,
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
 *
 * Legacy (months are `smmPackage.monthCycle` since 2026-10-03; only `services/smm.setCycle` uses this).
 * Since 2026-10-15 the end date is the renewal day — the day AFTER the last own day — so `days` own
 * days end on `start + days`: sold on the 22nd, its days run to the 21st and it renews on the 22nd.
 */
export function cycleFromStart(startIso: string, days = 30): SmmCycle {
  const start = dayToDate(startIso) ? startIso : isoDay(new Date());
  return {
    month: start.slice(0, 7),
    startDate: start,
    endDate: addDays(start, Math.max(1, days)),
  };
}

/*
  ── A month's OWN days: start … the day before the end date (owner, 2026-10-15) ─────────────────────
  A month is shown and billed "6 Sep → 6 Oct" — "from the 6th to the 6th" — and that label stays. But
  6 Oct is the RENEWAL DAY: the next month's first day, and the day an undecided month goes On hold
  ("On hold starts on 6 Oct if not renewed"). Until 2026-10-15 the end date was one of the month's own
  days too, so it belonged to two months at once: on 6 Oct both "6 Sep → 6 Oct" and "6 Oct → 6 Nov"
  were running, Insights counted the client twice and added both amounts, the 11 AM status check listed
  both, and every month ran 31–32 days. So a month's own days are `startDate` … `endDate − 1`, and every
  rule asks these helpers rather than comparing `endDate` by hand.
*/

/** The month's last own day — the day before its renewal day (the start, for a month with no days after it). */
export function lastOwnDay(cycle: Pick<SmmCycle, "startDate" | "endDate">): string {
  if (!cycle.endDate || !(cycle.endDate > cycle.startDate)) return cycle.startDate;
  return addDays(cycle.endDate, -1);
}

/** Whether `day` is one of the month's own days (start … the day before the renewal day). */
export function isOwnDay(cycle: Pick<SmmCycle, "startDate" | "endDate">, day: string): boolean {
  return !!day && day >= cycle.startDate && day <= lastOwnDay(cycle);
}

/** How many own days the month has: 6 Sep → 6 Oct is 30 (6 Sep … 5 Oct). At least 1. */
export function ownDayCount(cycle: Pick<SmmCycle, "startDate" | "endDate">): number {
  return Math.max(1, daysBetween(cycle.startDate, lastOwnDay(cycle)) + 1);
}

/**
 * The month's own days left, counting today — which is also the number of days to its renewal day.
 * 5 on 1 Oct for "6 Sep → 6 Oct" (1–5 Oct), 1 on 5 Oct (its last day), 0 on 6 Oct (the renewal day —
 * the month is over), negative after.
 *
 * ── One count for the bell, the card and the chip (2026-10-15) ─────────────────────────────────
 * This used to be `daysBetween(today, end) + 1`, one more than `smmPackage.daysToRenewal`: on 1 Oct the
 * bell said "5 days left" while the card's chip said "Renewal in 4 days", and on 6 Oct the bell said
 * "1 day left", the card "Last day" and the chip "Renewal is today". With the end date as the renewal
 * day the two are the same number, so `daysToRenewal` is this function and every screen counts from it.
 */
export function daysLeftInCycle(cycle: Pick<SmmCycle, "endDate">, today: string): number {
  return daysBetween(today, cycle.endDate);
}

/**
 * A piece dated outside the month's own days (2026-10-15) — it does NOT count toward this month.
 *
 * ── Why a date decides which month a post belongs to ─────────────────────────────────────────
 * The owner's real month: saved as 6 Oct → 6 Nov while 9 of its 10 posts were dated 13 Aug – 9 Sep, and
 * the card said "Completed — All 10 posts are live". Posted is not delivered for THIS month when the
 * post's own date says it went up in another one. So a piece counts toward its month when its upload
 * date is one of the month's own days, or when it has no upload date at all (an undated row, or a
 * legacy one); one dated outside is reported separately, never counted as delivered, and the screens
 * say so with a hint to fix its date. A post dated ON the renewal day belongs to the next month.
 */
export function itemDatedOutside(
  item: Pick<SmmContentItem, "uploadDate">,
  cycle: Pick<SmmCycle, "startDate" | "endDate"> | null | undefined,
): boolean {
  if (!cycle?.startDate || !item.uploadDate) return false;
  return !isOwnDay(cycle, item.uploadDate);
}

/** Posted AND inside the month's days — what "delivered this month" means (no cycle: posted, as before). */
export function isDeliveredInMonth(
  item: SmmContentItem,
  cycle: Pick<SmmCycle, "startDate" | "endDate"> | null | undefined,
): boolean {
  return isPosted(item) && !itemDatedOutside(item, cycle);
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
 *
 * ── The one exception: a history month (owner, 2026-10-05) ───────────────────────────────────────
 * A month recorded after it ended (`history`) is the team writing down work it already did, posted
 * long ago with the client's yes given at the time and never recorded here. Asking for "They
 * approved" on every one of those posts was three presses per post to fill in a past month, and
 * proved nothing. So in a history month a post may be marked posted directly; a running month keeps
 * the rule. Pass the month whenever it is known — without it the rule applies.
 */
export function canPublish(item: SmmContentItem, campaign?: Pick<SmmCampaign, "history"> | null): boolean {
  if (campaign?.history) return true;
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
  /**
   * Promised pieces (not extra work) dated outside the month's own days, posted or not (2026-10-15) —
   * never counted in `posted`. 0 when the month's dates were not given.
   */
  datedOutside: number;
}

/**
 * What the month owes and what it has delivered.
 *
 * Given the month's `cycle` (every campaign has one), a piece counts as posted only when it went up on
 * one of the month's own days or has no upload date (`isDeliveredInMonth`, 2026-10-15) — so the card,
 * the pace, the renewal popup and the client's monthly report cannot say "All 10 posts are live" for a
 * month whose posts are dated a month before it. Without a cycle every posted piece counts, as before.
 */
export function fulfilment(
  campaign: Pick<SmmCampaign, "items" | "commitments"> & { cycle?: SmmCycle | null },
): SmmFulfilment {
  const cycle = campaign.cycle || null;
  const byKind: KindProgress[] = SMM_CONTENT_KINDS.map(({ key }) => {
    const all = campaign.items.filter((i) => i.kind === key);
    const committed = Math.max(0, Math.floor(campaign.commitments?.[key] || 0));
    const contracted = all.filter((i) => !i.extra);
    return {
      kind: key,
      committed,
      made: contracted.filter(isMade).length,
      posted: contracted.filter((i) => isDeliveredInMonth(i, cycle)).length,
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
    datedOutside: campaign.items.filter((i) => !i.extra && itemDatedOutside(i, cycle)).length,
  };
}

/**
 * How many of the month's posts went to each account — the per-platform line of the report. Given the
 * month's dates, only the posts that went up on its own days count (2026-10-15, as `fulfilment`).
 */
export function postsByPlatform(
  items: SmmContentItem[],
  cycle?: Pick<SmmCycle, "startDate" | "endDate"> | null,
): { platform: SmmPlatform; label: string; count: number }[] {
  return SMM_PLATFORMS.map(({ key, label }) => ({
    platform: key,
    label,
    count: items.filter((i) => isDeliveredInMonth(i, cycle) && i.platforms?.includes(key)).length,
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

/**
 * The day reports for the month's OWN days only, newest first (2026-10-15) — what "this month's ads"
 * means on the report tiles, the client's monthly report, the renewal ask and the renewal popup.
 *
 * ── Why not every report ─────────────────────────────────────────────────────────────────────
 * The report tab's tiles added up every report on the month while its "leads a day" chart covered only
 * the month's dates — a run started before the month (or reported after it) made the two disagree, and
 * the client was sent leads from another month as this one's. A run's own panel still shows all of its
 * days (`SmmAdsPanel`), and the ad money ledger counts every rupee (`budgetLedger`): money is money.
 */
export function monthAdReports(campaign: Pick<SmmCampaign, "ads" | "cycle">): SmmAdDayReport[] {
  const all = allAdReports(campaign);
  if (!campaign.cycle?.startDate) return all;
  return all.filter((r) => isOwnDay(campaign.cycle, r.date));
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

/** Whether this person is personally assigned to this social media campaign. */
export function isAssignedToSmm(
  campaign: Pick<SmmCampaign, "watchers" | "team"> | null | undefined,
  uid: string | null | undefined,
): boolean {
  if (!campaign || !uid) return false;
  if (campaign.watchers?.includes(uid)) return true;
  const t = campaign.team;
  if (t) {
    if (t.creator?.uid === uid || t.publisher?.uid === uid || t.marketer?.uid === uid) return true;
    if (t.assistants?.some((a) => a.uid === uid)) return true;
  }
  return false;
}

/** Whether the user has administrative privileges over SMM (tech admins, main admin, tech team leader, sales admin). */
export function isSmmAdmin(user: { role?: string } | null | undefined): boolean {
  if (!user) return false;
  return ["main_admin", "tech_admin", "sales_admin", "tech_team_leader"].includes(user.role || "");
}

/**
 * Whether this person may WORK on this month — change its plan, posts, approvals, ads, money and
 * messages: an SMM admin by role (`isSmmAdmin`), the month's salesperson, or somebody on the month
 * (`isAssignedToSmm`). The ONE answer the month page, its panels and the service guard
 * (services/smm `assertMayChangeMonth`) all ask.
 *
 * ── The Social Media Team Lead is a hybrid (owner, 2026-10-12) ──────────────────────────────────
 * The lead (`smmLeader` on a tech member) SEES every month — `isSmmOverseer` — but sight is not a
 * right to change: on a month somebody else works she is view-only (no edit, delete or management of
 * that person's work). On a month she is personally on (a seat, so `watchers`) she has exactly what
 * any member on it has — and this function gives it to her for the same reason it gives it to them.
 * Her flag adds nothing here on purpose: before 2026-10-12 `isSmmOverseer` answered this question, so
 * the lead could edit every month in the company.
 */
export function canEditCampaign(
  campaign: Pick<SmmCampaign, "watchers" | "soldBy" | "team">,
  user: { uid?: string; role?: string; smmLeader?: boolean } | null | undefined,
): boolean {
  if (!user?.uid) return false;
  if (isSmmAdmin(user)) return true;
  if (campaign.soldBy === user.uid) return true;
  return isAssignedToSmm(campaign, user.uid);
}

/** The roles that see every campaign in the company, whether or not they are on it. */
export function isSmmOverseer(user: { role?: string; smmLeader?: boolean } | null | undefined): boolean {
  if (!user) return false;
  if (user.smmLeader) return true;
  return isSmmAdmin(user);
}

/**
 * The Social Media Team Lead whose role does not already run Social Media (owner, 2026-10-12): she
 * sees every month and every person's work, and works only the months she is on — `canEditCampaign`.
 * A Tech Team Leader or an admin with the flag keeps their role's full rights (`isSmmAdmin`), so the
 * flag never takes anything away from a role that had it.
 */
export function isViewOnlySmmLead(user: { role?: string; smmLeader?: boolean } | null | undefined): boolean {
  return !!user?.smmLeader && !isSmmAdmin(user);
}

/** What a view-only lead is told when she reaches for a month somebody else works — the UI and the service guard. */
export const SMM_VIEW_ONLY_MESSAGE =
  "View only — as the Social Media Team Lead you can see this month, but only the people on it (and the admins) can change it.";

/**
 * Who sees Social Media → Money, the company's renewals and their rupees (2026-10-05, owner: "only for
 * the tech admin and the sales admin") — and the main admin, who sees everything.
 */
export function canSeeSmmMoney(user: { role?: string } | null | undefined): boolean {
  return ["main_admin", "tech_admin", "sales_admin"].includes(user?.role || "");
}

/**
 * Who may delete a month outright: the main admin, the tech admin, and the tech team leader (added
 * 2026-10-03 — the owner's call, since the team leader creates and sets months up too). Narrower than
 * `isSmmOverseer` on purpose — deleting throws away a month's plan, ads and money trail. The Social Media
 * Team Lead could delete until 2026-10-12, when the owner made her view-only (`isViewOnlySmmLead`).
 */
export function canDeleteSmmCampaign(user: { role?: string; smmLeader?: boolean } | null | undefined): boolean {
  if (!user) return false;
  return user.role === "main_admin" || user.role === "tech_admin" || user.role === "tech_team_leader";
}

/** Who may appoint or remove the Social Media Team Lead: the tech admin and the main admin. */
export function canAppointSmmLead(user: { role?: string } | null | undefined): boolean {
  return user?.role === "tech_admin" || user?.role === "main_admin";
}

/* ── Extra work: what it is ─────────────────────────────────────────────────────────────────── */

/**
 * The kinds of extra work a month can carry, chosen from a list (2026-10-01).
 *
 * Each maps onto one of the plan's content kinds, so it counts and is planned like any other row —
 * a poster is a poster, and every video is made with the AI ad pipeline — while the TYPE and the
 * DURATION say what was actually made, which is what the seller charges for.
 */
export const SMM_EXTRA_WORK_TYPES: { key: SmmExtraWorkType; label: string; kind: SmmContentKind; video: boolean }[] = [
  { key: "poster", label: "Poster", kind: "poster", video: false },
  { key: "promotional", label: "Promotional video", kind: "ai_ad", video: true },
  { key: "wishes", label: "Wishes video", kind: "ai_ad", video: true },
  { key: "cinematic", label: "Cinematic video", kind: "ai_ad", video: true },
];

/** The lengths offered for a video — the same presets Work Assign uses (8-second clips). */
export const SMM_EXTRA_DURATIONS = ["16s", "32s", "48s", "64s"] as const;

export function extraWorkTypeInfo(type: SmmExtraWorkType) {
  return SMM_EXTRA_WORK_TYPES.find((t) => t.key === type) || SMM_EXTRA_WORK_TYPES[0];
}

/** "32s" → "32 sec"; a bare number is read as seconds. Anything unreadable gives "". */
export function durationLabel(duration?: string | null): string {
  const n = parseInt(String(duration || "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? `${n} sec` : "";
}

/** Normalises a duration typed or chosen to "<n>s", or "" when it is not a sensible length. */
export function normaliseDuration(duration?: string | number | null): string {
  const n = parseInt(String(duration ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n >= 4 && n <= 600 ? `${n}s` : "";
}

/** "Promotional video · 32 sec", "Poster" — the extra item's title and the line everybody reads. */
export function extraWorkTitle(type: SmmExtraWorkType, duration?: string | null): string {
  const info = extraWorkTypeInfo(type);
  const len = info.video ? durationLabel(duration) : "";
  return len ? `${info.label} · ${len}` : info.label;
}

/** Why an extra-work entry cannot be added yet, or "" when it can. A video needs its length. */
export function extraWorkProblem(type: SmmExtraWorkType, duration?: string | null): string {
  if (!SMM_EXTRA_WORK_TYPES.some((t) => t.key === type)) return "Choose what the extra work is.";
  if (extraWorkTypeInfo(type).video && !normaliseDuration(duration)) return "Choose the video's duration.";
  return "";
}

/* ── One line about the month ───────────────────────────────────────────────────────────────── */

/** "6 of 8 posted · 2 waiting on client · ends in 9 days" — the whole state of a month, in a row. */
export function campaignHeadline(campaign: SmmCampaign, today: string): string {
  const f = fulfilment(campaign);
  const wait = clientWaitSummary(campaign.items);
  const left = daysLeftInCycle(campaign.cycle, today);
  const parts = [`${f.posted} of ${f.committed} posted`];
  if (wait.openCount > 0) parts.push(`${wait.openCount} waiting on client`);
  // `left` counts today: 1 on the last own day, 0 on the renewal day (the end date — 2026-10-15).
  if (left > 1) parts.push(`ends in ${left} days`);
  else if (left === 1) parts.push("last day");
  else if (left === 0) parts.push("ended today");
  else parts.push(`ended ${-left} day${-left === 1 ? "" : "s"} ago`);
  return parts.join(" · ");
}

/**
 * The day a posted piece went up, as the section shows it (2026-10-15): its UPLOAD date — the Content
 * list's column, the day the calendar draws it on — and only when it has none, the day Posted was
 * pressed (`postedAt`). The team often marks a month's posts posted together, days later: counting from
 * the press put "Up 10d ago" beside an upload date two months earlier, and piled Insights' posts-a-day
 * sparkline onto one day. Null when there is neither.
 */
export function postedDayOf(item: Pick<SmmContentItem, "postedAt" | "uploadDate">): string | null {
  if (item.uploadDate) return item.uploadDate;
  const ms = tsToMs(item.postedAt);
  return ms ? isoDay(new Date(ms)) : null;
}
