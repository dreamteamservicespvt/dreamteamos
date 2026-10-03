/**
 * A social-media month as a package: its dates, its video length, its pace, and who may do what
 * with it (2026-10-03).
 *
 * Pure — no Firestore, no React. `smmPlan` holds what a month owes and what has been delivered;
 * this is the layer above it that every screen of the section turns into a decision: the board's
 * tabs and tiles, the card's pace, the tech side's setup, the renewal. Kept in one file so the
 * board, the month page, the setup dialog and the services cannot hold different opinions about
 * when a month ends or whether it is behind.
 */

import { CLIP_SECONDS, clipChoiceLabel, durationForClips, humanDuration } from "@/utils/assignmentDuration";
import {
  clientWaitSummary, dayToDate, daysBetween, daysLeftInCycle, fulfilment, isOverdue, isPosted, isoDay,
} from "@/utils/smmPlan";
import { SMM_RENEWAL_NOTICE_DAYS } from "@/utils/smmReminders";
import {
  SMM_ITEM_STATUSES,
  type SmmAssignee, type SmmCampaign, type SmmContentItem, type SmmContentKind, type SmmCycle, type SmmItemStatus,
  type SmmRenewalPrefill, type SmmTeam,
} from "@/types/smm";
import type { Lead, OrderTrack, SaleDetail } from "@/types";

/* ── How long each video is ─────────────────────────────────────────────────────────────────── */

/** Four 8-second clips — a 32-second video — is what most months are sold as. */
export const DEFAULT_SMM_CLIPS_PER_VIDEO = 4;

/** The lengths offered first: 16, 32, 48 and 64 seconds. Anything else goes in the custom box. */
export const SMM_CLIP_PRESETS: readonly number[] = [2, 4, 6, 8];

/** The AI studio's own ceiling — it builds at most 120 seconds (see utils/assignmentFormSpec). */
export const MAX_SMM_CLIPS_PER_VIDEO = 15;

/** A typed or stored clip count, made safe: whole, at least 1, at most the studio's ceiling. */
export function normaliseClipsPerVideo(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return DEFAULT_SMM_CLIPS_PER_VIDEO;
  return Math.min(MAX_SMM_CLIPS_PER_VIDEO, v);
}

/** The month's clips per video — 4 when it was never set (every month before 2026-10-03). */
export function clipsPerVideoOf(c?: { clipsPerVideo?: number | null } | null): number {
  return c?.clipsPerVideo ? normaliseClipsPerVideo(c.clipsPerVideo) : DEFAULT_SMM_CLIPS_PER_VIDEO;
}

/** Seconds of finished video for that many clips. */
export function videoSeconds(clips: number): number {
  return normaliseClipsPerVideo(clips) * CLIP_SECONDS;
}

/** "4 clips · 32 sec" — clips first, the way the production side counts. */
export function videoLengthLabel(clips: number): string {
  return clipChoiceLabel(normaliseClipsPerVideo(clips));
}

/** "32s" — the duration string a work assignment and the AI studio speak. */
export function videoDuration(clips: number): string {
  return durationForClips(normaliseClipsPerVideo(clips));
}

/** "4 videos × 32 sec" — the line every card reads. Empty when the month owes no AI video. */
export function videosLine(c: Pick<SmmCampaign, "commitments"> & { clipsPerVideo?: number | null }): string {
  const n = Math.max(0, Math.floor(c.commitments?.ai_ad || 0));
  if (!n) return "";
  return `${n} video${n === 1 ? "" : "s"} × ${humanDuration(videoSeconds(clipsPerVideoOf(c)))}`;
}

/* ── The month's dates ──────────────────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The same day N months on, clamped to that month's last day: 3 Oct → 3 Nov, 31 Jan → 28 Feb
 * (29 in a leap year). Invalid input comes back unchanged.
 */
export function addMonthsIso(iso: string, months: number): string {
  const d = dayToDate(iso);
  if (!d) return iso;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return isoDay(target);
}

/**
 * A month as the business sells it: from the start date to the same date next month.
 *
 * ── Why not thirty days ──────────────────────────────────────────────────────────────────────
 * Until 2026-10-03 a month ran thirty days (sold on the 22nd, ended on the 21st). That is not how
 * the client is billed — "from the 3rd to the 3rd" is — so a month that ended two days before the
 * client expected was a renewal conversation started on the wrong foot. The next month starts on
 * this end date, so a client who renews stays on the same date every month.
 *
 * An end date somebody typed is honoured when it is after the start; anything else falls back to
 * the rule.
 */
export function monthCycle(startIso: string, endIso?: string | null): SmmCycle {
  const start = dayToDate(startIso) ? startIso : isoDay(new Date());
  const end = endIso && dayToDate(endIso) && endIso > start ? endIso : addMonthsIso(start, 1);
  return { month: start.slice(0, 7), startDate: start, endDate: end };
}

export type SmmPhase = "upcoming" | "running" | "ended";

/** Before its first day, inside its dates, or past its last day. */
export function cyclePhase(cycle: SmmCycle, today: string): SmmPhase {
  if (today < cycle.startDate) return "upcoming";
  if (today > cycle.endDate) return "ended";
  return "running";
}

/** How much of the month has gone, 0 to 1 — today counts as gone, so the last day reads 1. */
export function cycleElapsed(cycle: SmmCycle, today: string): number {
  const total = daysBetween(cycle.startDate, cycle.endDate) + 1;
  if (total <= 0) return 1;
  const gone = daysBetween(cycle.startDate, today) + 1;
  return Math.max(0, Math.min(1, gone / total));
}

/**
 * "12 days left", "Last day", "Starts in 3 days", "Ended yesterday" — one sentence for every screen.
 *
 * The card used to say "Last day" on the day AFTER a month ended: the count it read is inclusive,
 * so it is 1 on the last day and 0 the day after, and 0 had been given the wrong words.
 */
export function cycleTimeLabel(cycle: SmmCycle, today: string): string {
  if (today < cycle.startDate) {
    const n = daysBetween(today, cycle.startDate);
    return n === 1 ? "Starts tomorrow" : `Starts in ${n} days`;
  }
  const left = daysLeftInCycle(cycle, today);
  if (left > 1) return `${left} days left`;
  if (left === 1) return "Last day";
  const ago = 1 - left;
  return ago === 1 ? "Ended yesterday" : `Ended ${ago} days ago`;
}

/** "3 Oct 2026". */
export function dayLabel(iso: string | null | undefined): string {
  const d = dayToDate(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "—";
}

/** "3 Oct" — for places that already say which year it is. */
export function shortDayLabel(iso: string | null | undefined): string {
  const d = dayToDate(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : "—";
}

/** "October 2026" — what a month is called, from the day it started. */
export function monthLabel(iso: string | null | undefined): string {
  const d = dayToDate(iso);
  return d ? `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` : "";
}

/** "3 Oct → 3 Nov 2026" — a month's dates in one breath. */
export function cycleRangeLabel(cycle: SmmCycle): string {
  return `${shortDayLabel(cycle.startDate)} → ${dayLabel(cycle.endDate)}`;
}

/* ── Pace: time gone against work posted ────────────────────────────────────────────────────── */

export type SmmPaceState = "done" | "on_track" | "behind" | "upcoming" | "ended_short" | "nothing";

export interface SmmPace {
  state: SmmPaceState;
  /** How many posts short of where the month should be by now. */
  behindBy: number;
  /** Posts there should be by today if they were spread evenly over the month. */
  expected: number;
  posted: number;
  committed: number;
}

/**
 * Whether the month is keeping up with its own calendar.
 *
 * ── Why this and not the percentage ───────────────────────────────────────────────────────────
 * "50% posted" means two opposite things on the 5th and on the 28th. The question a leader scanning
 * twenty clients asks is "who is behind", and that is the posts done against the posts there should
 * be by now — the month's quota spread evenly over its days, rounded down so a month is never
 * called behind for a post that is not due yet.
 */
export function paceOf(campaign: Pick<SmmCampaign, "items" | "commitments" | "cycle">, today: string): SmmPace {
  const f = fulfilment(campaign);
  const base = { posted: f.posted, committed: f.committed };
  if (f.committed === 0) return { state: "nothing", behindBy: 0, expected: 0, ...base };
  if (f.complete) return { state: "done", behindBy: 0, expected: f.committed, ...base };
  const phase = cyclePhase(campaign.cycle, today);
  if (phase === "upcoming") return { state: "upcoming", behindBy: 0, expected: 0, ...base };
  if (phase === "ended") {
    return { state: "ended_short", behindBy: f.committed - f.posted, expected: f.committed, ...base };
  }
  const expected = Math.floor(f.committed * cycleElapsed(campaign.cycle, today));
  const behindBy = Math.max(0, expected - f.posted);
  return { state: behindBy > 0 ? "behind" : "on_track", behindBy, expected, ...base };
}

/** The pace in words: "On track", "Behind by 2", "All posted", "2 not posted". */
export function paceLabel(p: SmmPace): string {
  switch (p.state) {
    case "done": return "All posted";
    case "on_track": return "On track";
    case "behind": return `Behind by ${p.behindBy}`;
    case "upcoming": return "Not started yet";
    case "ended_short": return `${p.behindBy} not posted`;
    default: return "Nothing committed";
  }
}

/* ── One block per piece, for the bars ──────────────────────────────────────────────────────── */

/** The colour a piece is drawn in. `late` overrides everything that is not posted. */
export type SmmTone = "idle" | "work" | "wait" | "ready" | "done" | "late";

export interface SmmSegment {
  id: string;
  tone: SmmTone;
  title: string;
  uploadDate: string | null;
  status: SmmItemStatus;
}

export function toneOf(item: SmmContentItem, today: string): SmmTone {
  if (isPosted(item)) return "done";
  if (isOverdue(item, today)) return "late";
  return SMM_ITEM_STATUSES.find((s) => s.key === item.status)?.tone || "idle";
}

/** Furthest along on the left, so the bar fills like a bar; anything late sits at the end in red. */
const TONE_ORDER: Record<SmmTone, number> = { done: 0, ready: 1, wait: 2, work: 3, idle: 4, late: 5 };

/** The legend, in bar order. One list for every screen, so a colour means the same thing everywhere. */
export const SMM_TONE_LEGEND: { tone: SmmTone; label: string }[] = [
  { tone: "done", label: "Posted" },
  { tone: "ready", label: "Approved / scheduled" },
  { tone: "wait", label: "With the client" },
  { tone: "work", label: "Being made" },
  { tone: "idle", label: "Planned" },
  { tone: "late", label: "Late" },
];

/** One block per piece the month owes of this kind — extra work is a gift or an invoice, not a target. */
export function kindSegments(items: SmmContentItem[], kind: SmmContentKind, today: string): SmmSegment[] {
  return items
    .filter((i) => i.kind === kind && !i.extra)
    .map((i) => ({
      id: i.id,
      tone: toneOf(i, today),
      title: i.title?.trim() || "Untitled",
      uploadDate: i.uploadDate,
      status: i.status,
    }))
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

/* ── What needs whom ────────────────────────────────────────────────────────────────────────── */

/** Somebody holds at least one of the three jobs. Assistants alone are not a team. */
export function hasTeam(team: SmmTeam | null | undefined): boolean {
  return !!(team?.creator?.uid || team?.publisher?.uid || team?.marketer?.uid);
}

/** A running (or about to start) month with nobody on it — the tech side's half of the handover. */
export function needsSetup(c: SmmCampaign, today: string): boolean {
  if (c.status !== "active" || c.history) return false;
  if (cyclePhase(c.cycle, today) === "ended") return false;
  return !hasTeam(c.team);
}

/** A month ending within the notice window — or already ended — with no renewal decision. */
export function renewalDue(c: SmmCampaign, today: string, withinDays = SMM_RENEWAL_NOTICE_DAYS): boolean {
  if (c.status !== "active" || c.history) return false;
  if (c.renewal?.nextCampaignId || c.renewal?.state === "won" || c.renewal?.state === "lost") return false;
  return daysLeftInCycle(c.cycle, today) <= withinDays;
}

/**
 * The three ways a running month quietly fails: work past its date, the client sitting on an
 * approval, or the month running out with nobody saying what happens next.
 */
export function needsAttention(c: SmmCampaign, today: string): boolean {
  if (c.status !== "active" || c.history) return false;
  const late = c.items.some((i) => isOverdue(i, today));
  const waiting = clientWaitSummary(c.items).openCount > 0;
  const endedOpen = cyclePhase(c.cycle, today) === "ended";
  return late || waiting || endedOpen;
}

/**
 * What a month that has run out of days should now be filed as — or null to leave it running.
 *
 * Renewed once the salesperson's renewal has opened the next month, lapsed once they have said the
 * client is not renewing. Anything else stays active past its end on purpose: that is a renewal
 * nobody has decided, and it belongs in front of people rather than filed away. There is no
 * scheduler on this stack, so this runs when an overseer opens the board (services/smm).
 */
export function closingStatus(c: SmmCampaign, today: string): "renewed" | "lapsed" | null {
  if (c.status !== "active" || c.history) return null;
  if (cyclePhase(c.cycle, today) !== "ended") return null;
  if (c.renewal?.nextCampaignId || c.renewal?.state === "won") return "renewed";
  if (c.renewal?.state === "lost") return "lapsed";
  return null;
}

/* ── Renewal ────────────────────────────────────────────────────────────────────────────────── */

/**
 * The day a renewal month starts: the old month's end date when renewed in time, so the client stays
 * on the same date every month — or the day it was renewed, when that is later (the client had a gap).
 */
export function renewalStartDate(prev: SmmCycle, today: string): string {
  return today <= prev.endDate ? prev.endDate : today;
}

/** What the sale form opens on when the salesperson presses Renew on this month. */
export function renewalPrefillOf(c: SmmCampaign, today: string): SmmRenewalPrefill {
  return {
    campaignId: c.id,
    businessName: c.businessName || c.clientName,
    packageKey: c.packageKey,
    platforms: c.platforms || [],
    clipsPerVideo: c.clipsPerVideo ?? null,
    monthLabel: monthLabel(c.cycle.startDate),
    nextStart: renewalStartDate(c.cycle, today),
  };
}

/** Where the Renew button sends the salesperson: their lead for this client, sale form open on SMM. */
export function renewalLeadUrl(leadId: string, campaignId: string): string {
  return `/sales/leads?lead=${encodeURIComponent(leadId)}&sale=1&category=social_media_management&renew=${encodeURIComponent(campaignId)}`;
}

/* ── The team, as jobs ──────────────────────────────────────────────────────────────────────── */

export type SmmSeat = "creator" | "publisher" | "marketer";

/** The order's three tracks, seat by seat — assigning a seat IS assigning that track. */
export const SEAT_TRACKS: Record<SmmSeat, OrderTrack> = {
  creator: "ad_creation",
  publisher: "social_upload",
  marketer: "digital_marketing",
};

export const SMM_SEATS: { seat: SmmSeat; label: string; short: string }[] = [
  { seat: "creator", label: "Makes the content", short: "makes" },
  { seat: "publisher", label: "Posts it", short: "posts" },
  { seat: "marketer", label: "Runs the ads", short: "runs ads" },
];

/**
 * Each person on the month with the jobs they hold — ONE entry per person however many seats, because
 * somebody holding two of the three gets one job card naming both, not two cards for one month.
 */
export function jobsByMember(team: SmmTeam): { uid: string; name: string; tracks: OrderTrack[] }[] {
  const map = new Map<string, { uid: string; name: string; tracks: OrderTrack[] }>();
  for (const { seat } of SMM_SEATS) {
    const who = team[seat];
    if (!who?.uid) continue;
    const entry = map.get(who.uid) || { uid: who.uid, name: who.name, tracks: [] };
    entry.tracks.push(SEAT_TRACKS[seat]);
    map.set(who.uid, entry);
  }
  return [...map.values()];
}

/** The seats as `OrderProgress.tracks` stores them. */
export function tracksFromTeam(team: SmmTeam): Partial<Record<OrderTrack, SmmAssignee>> {
  const out: Partial<Record<OrderTrack, SmmAssignee>> = {};
  for (const { seat } of SMM_SEATS) {
    const who = team[seat];
    if (who?.uid) out[SEAT_TRACKS[seat]] = { uid: who.uid, name: who.name };
  }
  return out;
}

/** The order's tracks back as seats — what the split dialog on Orders hands the month. */
export function teamFromTracks(
  tracks: Partial<Record<OrderTrack, SmmAssignee>>,
  assistants: SmmAssignee[] = [],
): SmmTeam {
  return {
    creator: tracks.ad_creation ?? null,
    publisher: tracks.social_upload ?? null,
    marketer: tracks.digital_marketing ?? null,
    assistants,
  };
}

/* ── Sales already recorded for a number ────────────────────────────────────────────────────── */

export interface SmmSaleOnLead {
  leadId: string;
  itemIndex: number;
  item: SaleDetail;
  /** Whoever owns the lead — the salesperson the sale belongs to. */
  sellerUid: string;
  soldAtMs: number;
}

function tsToMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  const t = ts as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
}

/**
 * Every social-media sale on these leads, oldest first.
 *
 * Reads the legacy single `saleDetails` too — a lead from before `saleItems` existed still holds a
 * sale, and a lookup that skipped it would offer to record that month a second time.
 */
export function smmSalesOnLeads(leads: Lead[]): SmmSaleOnLead[] {
  const out: SmmSaleOnLead[] = [];
  for (const lead of leads) {
    const items = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
    items.forEach((item, itemIndex) => {
      if (item?.category !== "social_media_management") return;
      out.push({ leadId: lead.id, itemIndex, item, sellerUid: lead.assignedTo, soldAtMs: tsToMs(item.submittedAt) });
    });
  }
  return out.sort((a, b) => a.soldAtMs - b.soldAtMs);
}

/** The day a sale was made, `yyyy-MM-dd` — the default first day of the month it sold. */
export function saleDay(item: Pick<SaleDetail, "submittedAt">, fallback: string): string {
  const ms = tsToMs(item.submittedAt);
  return ms ? isoDay(new Date(ms)) : fallback;
}

/* ── The board ──────────────────────────────────────────────────────────────────────────────── */

export interface SmmBoardStats {
  /** Months inside their dates (or about to start). */
  running: number;
  /** What those months bring in, together. */
  monthlyValue: number;
  committed: number;
  posted: number;
  deliveredPercent: number;
  /** Pieces due in the next seven days, not yet posted. */
  dueThisWeek: number;
  late: number;
  /** Pieces sitting with the client for an answer. */
  waiting: number;
  renewalsDue: number;
  needsSetup: number;
}

/** The six numbers across the top of the board, from the months the viewer can see. */
export function boardStats(campaigns: SmmCampaign[], today: string): SmmBoardStats {
  const live = campaigns.filter((c) => c.status === "active" && !c.history);
  const running = live.filter((c) => cyclePhase(c.cycle, today) !== "ended");
  const weekEnd = isoDay(new Date((dayToDate(today) ?? new Date()).getTime() + 6 * 86_400_000));

  let committed = 0;
  let posted = 0;
  for (const c of running) {
    const f = fulfilment(c);
    committed += f.committed;
    posted += f.posted;
  }

  let dueThisWeek = 0;
  let late = 0;
  let waiting = 0;
  for (const c of live) {
    for (const i of c.items) {
      if (isPosted(i)) continue;
      if (isOverdue(i, today)) late += 1;
      else if (i.uploadDate && i.uploadDate >= today && i.uploadDate <= weekEnd) dueThisWeek += 1;
    }
    waiting += clientWaitSummary(c.items).openCount;
  }

  return {
    running: running.length,
    monthlyValue: running.reduce((n, c) => n + (Number(c.amount) || 0), 0),
    committed,
    posted,
    deliveredPercent: committed > 0 ? Math.min(100, Math.round((posted / committed) * 100)) : 0,
    dueThisWeek,
    late,
    waiting,
    renewalsDue: live.filter((c) => renewalDue(c, today)).length,
    needsSetup: live.filter((c) => needsSetup(c, today)).length,
  };
}

/* ── Who may do what ────────────────────────────────────────────────────────────────────────── */

type Viewer = { uid?: string; role?: string; smmLeader?: boolean } | null | undefined;

/**
 * Record a social-media sale for the salesperson who made it ("Add SMM sale").
 *
 * It creates a sale — money, commission, an approval — so it is kept to the three people who run the
 * tech side. The Social Media Team Lead sets months up but does not write sales.
 */
export function canRecordSmmSaleForSeller(user: Viewer): boolean {
  return ["main_admin", "tech_admin", "tech_team_leader"].includes(user?.role || "");
}

/** Set a month up — dates, video length, page links, team — and change any of it later. */
export function canSetUpSmm(user: Viewer): boolean {
  if (!user) return false;
  if (user.smmLeader) return true;
  return ["main_admin", "tech_admin", "tech_team_leader"].includes(user.role || "");
}

/**
 * Renew a month: its own salesperson, through a sale, and nobody else (2026-10-03). The renewal is
 * a sale like any other — approved by the sales admin, paid by the existing commission formula.
 */
export function canRenewSmm(c: Pick<SmmCampaign, "soldBy">, user: Viewer): boolean {
  return user?.role === "sales_member" && !!user.uid && c.soldBy === user.uid;
}
