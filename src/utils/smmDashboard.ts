/**
 * The Social Media dashboard's numbers (2026-10-04) — every chart on the Overview of /smm.
 *
 * ── Why a dashboard, when the board already had tiles and cards ───────────────────────────────
 * The board answers "show me the months"; a leader's first questions are about all of them at once:
 * are we delivering, who is behind, what is due tomorrow and is it ready, which renewals are coming
 * and what are they worth, who on the team is overloaded, are the ads working. Twenty cards cannot
 * answer any of those — you have to add them up in your head. So the months are added up here, once,
 * into the shapes the charts draw, and the Overview draws them (components/smm/dashboard).
 *
 * Pure — no Firestore, no React — like `smmPlan` and `smmPackage`, whose rules it reuses rather than
 * restates: a month's pace, a piece's colour, a renewal's due date mean the same thing on the
 * dashboard as on the card and the month's own page.
 *
 * ── Which months ──────────────────────────────────────────────────────────────────────────────
 * The ones still in play: active and not history. That includes a month past its last day with no
 * renewal decision — its unposted pieces are still owed and its renewal is still open — and a month
 * about to start. Finished months are read only when somebody asks for them (quota), so trends over
 * the last days count the months running now; the charts say so in their subtitles.
 */
import {
  adTotals, addDays, clientWaitSummary, daysBetween, isOverdue, isPosted, isoDay, teamMembers,
} from "@/utils/smmPlan";
import {
  SMM_TONE_LEGEND, cycleElapsed, cyclePhase, cycleTimeLabel, daysToRenewal, needsSetup, paceOf, renewalDue,
  toneCounts, toneOf, type SmmPace, type SmmTone,
} from "@/utils/smmPackage";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

/** The months the dashboard is about. */
export function dashboardMonths(campaigns: SmmCampaign[]): SmmCampaign[] {
  return campaigns.filter((c) => c.status === "active" && !c.history);
}

const nameOf = (c: Pick<SmmCampaign, "businessName" | "clientName">) => c.businessName || c.clientName || "Untitled";

function tsToMs(ts: unknown): number {
  if (ts === null || ts === undefined) return 0;
  if (typeof ts === "number") return ts;
  const t = ts as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  const parsed = Date.parse(String(ts));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The day a piece went live: the stamp made when it was marked posted, or — for a piece posted before
 * that stamp existed, or marked posted without one — the day it was planned for.
 */
export function postedDay(item: Pick<SmmContentItem, "postedAt" | "uploadDate">): string | null {
  const ms = tsToMs(item.postedAt);
  return ms ? isoDay(new Date(ms)) : item.uploadDate || null;
}

/** The last `n` days ending today, oldest first. */
export function lastDays(today: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(addDays(today, -i));
  return out;
}

/* ── The headline numbers ───────────────────────────────────────────────────────────────────── */

export interface SmmDashboardKpis {
  /** Inside their dates or about to start. */
  running: number;
  /** Past their last day with no renewal decision — still in play. */
  awaitingRenewal: number;
  /** What the running months bring in, together (a no-sale month is 0). */
  monthlyValue: number;
  /** Pieces due in the next seven days, not yet posted. */
  dueThisWeek: number;
  /** Pieces past their date and not posted. */
  late: number;
  /** How many months have at least one late piece. */
  lateMonths: number;
  /** Pieces sitting with the client for an answer, right now. */
  waiting: number;
  /** Days lost waiting on the client, added up over every piece that had to wait. */
  waitDays: number;
  renewalsDue: number;
  /** What the months due for renewal are worth. */
  renewalsValue: number;
  needsSetup: number;
}

export function dashboardKpis(months: SmmCampaign[], today: string, now = Date.now()): SmmDashboardKpis {
  const weekEnd = addDays(today, 6);
  let dueThisWeek = 0;
  let late = 0;
  let lateMonths = 0;
  let waiting = 0;
  let waitDays = 0;
  let running = 0;
  let awaitingRenewal = 0;
  let monthlyValue = 0;
  let renewalsDue = 0;
  let renewalsValue = 0;
  let setup = 0;

  for (const c of months) {
    const phase = cyclePhase(c.cycle, today);
    if (phase === "ended") awaitingRenewal += 1;
    else {
      running += 1;
      monthlyValue += Number(c.amount) || 0;
    }
    let lateHere = 0;
    for (const i of c.items) {
      if (isPosted(i)) continue;
      if (isOverdue(i, today)) lateHere += 1;
      else if (i.uploadDate && i.uploadDate >= today && i.uploadDate <= weekEnd) dueThisWeek += 1;
    }
    late += lateHere;
    if (lateHere > 0) lateMonths += 1;
    const wait = clientWaitSummary(c.items, now);
    waiting += wait.openCount;
    waitDays += wait.totalDays;
    if (renewalDue(c, today)) {
      renewalsDue += 1;
      renewalsValue += Number(c.amount) || 0;
    }
    if (needsSetup(c, today)) setup += 1;
  }

  return {
    running, awaitingRenewal, monthlyValue, dueThisWeek, late, lateMonths, waiting, waitDays,
    renewalsDue, renewalsValue, needsSetup: setup,
  };
}

/* ── Delivery: what was promised, what is out, what should be out by now ────────────────────── */

export interface SmmDeliverySummary {
  committed: number;
  posted: number;
  /** Posts there should be by today across the months, each month's quota spread over its days. */
  expected: number;
  /** 0–100, posted against committed. */
  percent: number;
  /** 0–100, expected against committed — the tick on the meter. */
  expectedPercent: number;
  /** Posts short of where the months together should be. */
  behindBy: number;
  monthsBehind: number;
  monthsOnTrack: number;
  monthsTotal: number;
  /** Posts that went up on each of the last days, oldest first — the sparkline. */
  trend: { day: string; count: number }[];
}

/**
 * Posts out against posts promised, and against where they should be by today.
 *
 * The expectation is per month by its own calendar — a month on its 5th day is expected to have a
 * sixth of its quota out, one past its last day all of it, one not started none — then added up.
 * Unlike `paceOf`'s, a month that finished early is still only "expected" to be where its calendar
 * says, so the tick never jumps ahead of the date because somebody worked fast.
 */
export function deliverySummary(months: SmmCampaign[], today: string, trendDays = 14): SmmDeliverySummary {
  let committed = 0;
  let posted = 0;
  let expected = 0;
  let behindBy = 0;
  let monthsBehind = 0;
  let monthsOnTrack = 0;
  const window = lastDays(today, trendDays);
  const perDay = new Map(window.map((d) => [d, 0]));

  for (const c of months) {
    const pace = paceOf(c, today);
    committed += pace.committed;
    posted += pace.posted;
    const phase = cyclePhase(c.cycle, today);
    expected += phase === "upcoming" ? 0
      : phase === "ended" ? pace.committed
      : Math.floor(pace.committed * cycleElapsed(c.cycle, today));
    if (pace.state === "behind" || pace.state === "ended_short") {
      behindBy += pace.behindBy;
      monthsBehind += 1;
    } else if (pace.state === "on_track" || pace.state === "done") {
      monthsOnTrack += 1;
    }
    for (const item of c.items) {
      if (!isPosted(item)) continue;
      const day = postedDay(item);
      if (day && perDay.has(day)) perDay.set(day, (perDay.get(day) || 0) + 1);
    }
  }

  const pct = (n: number) => (committed > 0 ? Math.min(100, Math.round((n / committed) * 100)) : 0);
  return {
    committed, posted, expected,
    percent: pct(posted),
    expectedPercent: pct(expected),
    behindBy, monthsBehind, monthsOnTrack,
    monthsTotal: months.length,
    trend: window.map((day) => ({ day, count: perDay.get(day) || 0 })),
  };
}

/* ── Stages: where every promised piece is ──────────────────────────────────────────────────── */

/** A piece's stage, plus the promises with no row yet. */
export type SmmStageKey = SmmTone | "unplanned";

/**
 * Left to right on the bar: done first, late last — the same order as a card's blocks, with the
 * promises nobody has planned yet just before the late ones (they are owed, and nothing exists).
 */
export const SMM_STAGE_ORDER: { key: SmmStageKey; label: string }[] = [
  ...SMM_TONE_LEGEND.filter((t) => t.tone !== "late").map((t) => ({ key: t.tone as SmmStageKey, label: t.label })),
  { key: "unplanned", label: "Not planned yet" },
  { key: "late", label: "Late" },
];

export interface SmmStageSlice {
  key: SmmStageKey;
  label: string;
  count: number;
  /** 0–100 of every promised piece, rounded. */
  percent: number;
}

export interface SmmStageBreakdown {
  slices: SmmStageSlice[];
  total: number;
  /** Pieces with a row but no date — they cannot be late, and they cannot go up either. */
  undated: number;
}

/** Every piece the months promised, by how far it has got. Extra work is left out — it was not sold. */
export function stageBreakdown(months: SmmCampaign[], today: string): SmmStageBreakdown {
  const counts: Record<SmmStageKey, number> = { done: 0, ready: 0, wait: 0, work: 0, idle: 0, unplanned: 0, late: 0 };
  let undated = 0;
  for (const c of months) {
    const t = toneCounts(c, today);
    for (const k of Object.keys(counts) as SmmStageKey[]) counts[k] += t[k] || 0;
    undated += c.items.filter((i) => !i.extra && !isPosted(i) && !i.uploadDate).length;
  }
  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  return {
    slices: SMM_STAGE_ORDER.map(({ key, label }) => ({
      key, label, count: counts[key], percent: total > 0 ? Math.round((counts[key] / total) * 100) : 0,
    })),
    total,
    undated,
  };
}

/* ── The posting calendar: what was due each day, and what is coming ────────────────────────── */

export interface SmmScheduleItem {
  campaignId: string;
  business: string;
  title: string;
  tone: SmmTone;
}

export interface SmmScheduleDay {
  day: string;
  counts: Record<SmmTone, number>;
  total: number;
  isToday: boolean;
  isPast: boolean;
  items: SmmScheduleItem[];
}

/** Bottom to top in a column: posted at the foot, late on top where the eye lands first. */
export const SMM_SCHEDULE_STACK: SmmTone[] = ["done", "ready", "wait", "work", "idle", "late"];

/**
 * Every dated piece from `back` days ago to `ahead` days on, by the day it was planned for.
 *
 * Planned day, not posted day, on purpose: the question is "was each day's work done, and is the
 * coming days' work ready" — tomorrow's column showing two approved and one still with the client is
 * the thing worth seeing a day early. Extra work is included: it is a post to make like any other.
 */
export function scheduleDays(months: SmmCampaign[], today: string, back = 13, ahead = 14): SmmScheduleDay[] {
  return scheduleBetween(months, today, addDays(today, -back), addDays(today, ahead));
}

/** The same, over any run of days — a month's own dates on its report. */
export function scheduleBetween(months: SmmCampaign[], today: string, from: string, to: string): SmmScheduleDay[] {
  const days: SmmScheduleDay[] = [];
  const index = new Map<string, SmmScheduleDay>();
  const n = Math.max(0, Math.min(400, daysBetween(from, to)));
  for (let i = 0; i <= n; i += 1) {
    const day = addDays(from, i);
    const entry: SmmScheduleDay = {
      day,
      counts: { done: 0, ready: 0, wait: 0, work: 0, idle: 0, late: 0 },
      total: 0,
      isToday: day === today,
      isPast: day < today,
      items: [],
    };
    days.push(entry);
    index.set(day, entry);
  }
  for (const c of months) {
    for (const item of c.items) {
      if (!item.uploadDate) continue;
      const entry = index.get(item.uploadDate);
      if (!entry) continue;
      const tone = toneOf(item, today);
      entry.counts[tone] += 1;
      entry.total += 1;
      entry.items.push({ campaignId: c.id, business: nameOf(c), title: item.title?.trim() || "Untitled", tone });
    }
  }
  return days;
}

/* ── Pace: every client, time gone against work out ─────────────────────────────────────────── */

/** good: keeping pace · warn: behind pace · bad: work past its date, or a month that ended short · idle: not started. */
export type SmmHealth = "good" | "warn" | "bad" | "idle";

export interface SmmPacePoint {
  id: string;
  name: string;
  packageLabel: string;
  soldByName: string;
  /** 0–1, how much of the month has gone. */
  elapsed: number;
  /** 0–1, posted against committed. */
  delivered: number;
  posted: number;
  committed: number;
  expected: number;
  behindBy: number;
  late: number;
  waiting: number;
  health: SmmHealth;
  pace: SmmPace;
  /** "12 days left", "Ended 2 days ago". */
  timeLabel: string;
  endDate: string;
}

export function healthOf(pace: SmmPace, late: number): SmmHealth {
  if (pace.committed === 0) return "idle";
  if (late > 0 || pace.state === "ended_short") return "bad";
  if (pace.state === "behind") return "warn";
  if (pace.state === "upcoming") return "idle";
  return "good";
}

export function pacePoints(months: SmmCampaign[], today: string): SmmPacePoint[] {
  return months.map((c) => {
    const pace = paceOf(c, today);
    const late = c.items.filter((i) => isOverdue(i, today)).length;
    const phase = cyclePhase(c.cycle, today);
    return {
      id: c.id,
      name: nameOf(c),
      packageLabel: c.packageLabel || "",
      soldByName: c.soldByName || "",
      elapsed: phase === "upcoming" ? 0 : cycleElapsed(c.cycle, today),
      delivered: pace.committed > 0 ? Math.min(1, pace.posted / pace.committed) : 0,
      posted: pace.posted,
      committed: pace.committed,
      expected: phase === "upcoming" ? 0
        : phase === "ended" ? pace.committed
        : Math.floor(pace.committed * cycleElapsed(c.cycle, today)),
      behindBy: pace.behindBy,
      late,
      waiting: clientWaitSummary(c.items).openCount,
      health: healthOf(pace, late),
      pace,
      timeLabel: cycleTimeLabel(c.cycle, today),
      endDate: c.cycle.endDate,
    };
  });
}

const HEALTH_RANK: Record<SmmHealth, number> = { bad: 0, warn: 1, idle: 2, good: 3 };

/** Who needs somebody most first: late work, then furthest behind, then the ones ending soonest. */
export function byUrgency(points: SmmPacePoint[]): SmmPacePoint[] {
  return [...points].sort((a, b) =>
    HEALTH_RANK[a.health] - HEALTH_RANK[b.health]
    || b.late - a.late
    || b.behindBy - a.behindBy
    || a.endDate.localeCompare(b.endDate)
    || a.name.localeCompare(b.name));
}

/* ── Renewals: the coming month ends, and what they are worth ───────────────────────────────── */

export type SmmRenewalMarkState = "renewed" | "pitched" | "open" | "overdue" | "lost";

export interface SmmRenewalMark {
  id: string;
  name: string;
  endDate: string;
  /** Days from today to the renewal date — negative once it has passed. */
  daysTo: number;
  state: SmmRenewalMarkState;
  amount: number;
  soldByName: string;
}

export interface SmmRenewalTotal {
  count: number;
  amount: number;
}

export interface SmmRenewalRunway {
  /** Soonest first. */
  marks: SmmRenewalMark[];
  /** Undecided renewals in the next seven days (today included). */
  thisWeek: SmmRenewalTotal;
  /** Undecided renewals within the window. */
  upcoming: SmmRenewalTotal;
  /** Past their date with no decision. */
  overdue: SmmRenewalTotal;
  renewed: SmmRenewalTotal;
}

export function renewalStateOf(c: SmmCampaign, today: string): SmmRenewalMarkState {
  if (c.renewal?.nextCampaignId || c.renewal?.state === "won") return "renewed";
  if (c.renewal?.state === "lost") return "lost";
  if (daysToRenewal(c.cycle, today) < 0) return "overdue";
  if (c.renewal?.state === "pitched") return "pitched";
  return "open";
}

/** Every month whose renewal date falls before `ahead` days from today — overdue ones included. */
export function renewalRunway(months: SmmCampaign[], today: string, ahead = 30): SmmRenewalRunway {
  const marks: SmmRenewalMark[] = months
    .map((c) => ({
      id: c.id,
      name: nameOf(c),
      endDate: c.cycle.endDate,
      daysTo: daysToRenewal(c.cycle, today),
      state: renewalStateOf(c, today),
      amount: Number(c.amount) || 0,
      soldByName: c.soldByName || "",
    }))
    .filter((m) => m.daysTo <= ahead)
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name));

  const total = (pick: (m: SmmRenewalMark) => boolean): SmmRenewalTotal => {
    const list = marks.filter(pick);
    return { count: list.length, amount: list.reduce((n, m) => n + m.amount, 0) };
  };
  const undecided = (m: SmmRenewalMark) => m.state === "open" || m.state === "pitched";
  return {
    marks,
    thisWeek: total((m) => undecided(m) && m.daysTo >= 0 && m.daysTo <= 6),
    upcoming: total((m) => undecided(m) && m.daysTo >= 0),
    overdue: total((m) => m.state === "overdue"),
    renewed: total((m) => m.state === "renewed"),
  };
}

/* ── The team: who holds how much, and how far it has got ───────────────────────────────────── */

export interface SmmWorkloadRow {
  uid: string;
  name: string;
  /** Months they are on, in any seat. */
  months: number;
  posted: number;
  /** Approved or scheduled, or being made — moving, nobody needs to chase it. */
  inFlight: number;
  /** With the client. */
  waiting: number;
  notStarted: number;
  late: number;
  /** Everything not posted yet. */
  open: number;
  total: number;
}

/**
 * Each person's pieces across the months, by stage.
 *
 * A piece belongs to whoever makes it and whoever posts it — the item's own maker and publisher, or,
 * where those were never set, the month's content and posting seats (which is who the reminders go
 * to). One person holding both is counted once.
 */
export function teamWorkload(months: SmmCampaign[], today: string): SmmWorkloadRow[] {
  const rows = new Map<string, SmmWorkloadRow>();
  const row = (uid: string, name: string) => {
    let r = rows.get(uid);
    if (!r) {
      r = { uid, name, months: 0, posted: 0, inFlight: 0, waiting: 0, notStarted: 0, late: 0, open: 0, total: 0 };
      rows.set(uid, r);
    }
    if (!r.name && name) r.name = name;
    return r;
  };

  for (const c of months) {
    for (const m of teamMembers(c.team || { assistants: [] })) row(m.uid, m.name).months += 1;
    for (const item of c.items) {
      const owners = new Map<string, string>();
      const maker = item.makerUid ? { uid: item.makerUid, name: item.makerName || "" } : c.team?.creator;
      const publisher = item.publisherUid ? { uid: item.publisherUid, name: item.publisherName || "" } : c.team?.publisher;
      for (const p of [maker, publisher]) if (p?.uid) owners.set(p.uid, p.name || "");
      if (owners.size === 0) continue;
      const tone = toneOf(item, today);
      for (const [uid, name] of owners) {
        const r = row(uid, name);
        r.total += 1;
        if (tone === "done") r.posted += 1;
        else {
          r.open += 1;
          if (tone === "late") r.late += 1;
          else if (tone === "wait") r.waiting += 1;
          else if (tone === "idle") r.notStarted += 1;
          else r.inFlight += 1;
        }
      }
    }
  }

  return [...rows.values()]
    .filter((r) => r.total > 0 || r.months > 0)
    .map((r) => ({ ...r, name: r.name || "Unnamed" }))
    .sort((a, b) => b.late - a.late || b.open - a.open || a.name.localeCompare(b.name));
}

/* ── Ads: leads, spend and cost per lead across the months ──────────────────────────────────── */

export interface SmmAdsSummary {
  leads: number;
  spend: number;
  costPerResult: number;
  reach: number;
  daysReported: number;
  /** Campaigns marked running right now. */
  runsLive: number;
  /** Any campaign at all on the months in view — the card is not drawn without one. */
  hasAds: boolean;
  /** The last days, oldest first. */
  series: { day: string; leads: number; spend: number }[];
  /** Clients with at least one day reported, most leads first. */
  byClient: { id: string; name: string; leads: number; spend: number; costPerResult: number }[];
}

export function adsSummary(months: SmmCampaign[], today: string, days = 14): SmmAdsSummary {
  const all = months.flatMap((c) => c.ads.flatMap((run) => run.reports || []));
  /*
    A day's figures are read off Meta the next morning, so until somebody enters today's the trend
    ends yesterday — otherwise every sparkline would end in a drop to nothing each morning.
  */
  const end = all.some((r) => r.date === today) ? today : addDays(today, -1);
  const window = lastDays(end, days);
  const perDay = new Map(window.map((d) => [d, { leads: 0, spend: 0 }]));
  for (const r of all) {
    const slot = perDay.get(r.date);
    if (!slot) continue;
    slot.leads += Number(r.leads) || 0;
    slot.spend += Number(r.spend) || 0;
  }
  const totals = adTotals(all);
  const byClient = months
    .map((c) => {
      const t = adTotals(c.ads.flatMap((run) => run.reports || []));
      return { id: c.id, name: nameOf(c), leads: t.leads, spend: t.spend, costPerResult: t.costPerResult, days: t.daysReported };
    })
    .filter((c) => c.days > 0)
    .map(({ days: _days, ...rest }) => rest)
    .sort((a, b) => b.leads - a.leads || a.spend - b.spend || a.name.localeCompare(b.name));

  return {
    ...totals,
    runsLive: months.reduce((n, c) => n + c.ads.filter((r) => r.status === "running").length, 0),
    hasAds: months.some((c) => c.ads.length > 0),
    series: window.map((day) => ({ day, ...(perDay.get(day) || { leads: 0, spend: 0 }) })),
    byClient,
  };
}

/**
 * One month's ads, day by day across its own dates up to today — the report's "leads a day" chart.
 * Days with nothing reported are 0 and say so (`reported: false`), so a gap in the reporting is not
 * mistaken for a day the ads brought nobody.
 */
export function adDaily(
  campaign: Pick<SmmCampaign, "ads" | "cycle">,
  today: string,
): { day: string; leads: number; spend: number; reported: boolean }[] {
  const end = today < campaign.cycle.endDate ? today : campaign.cycle.endDate;
  const n = daysBetween(campaign.cycle.startDate, end);
  if (n < 0) return [];
  const map = new Map<string, { leads: number; spend: number; reported: boolean }>();
  for (const run of campaign.ads) {
    for (const r of run.reports || []) {
      const cur = map.get(r.date) || { leads: 0, spend: 0, reported: false };
      map.set(r.date, { leads: cur.leads + (Number(r.leads) || 0), spend: cur.spend + (Number(r.spend) || 0), reported: true });
    }
  }
  const out: { day: string; leads: number; spend: number; reported: boolean }[] = [];
  for (let i = 0; i <= Math.min(400, n); i += 1) {
    const day = addDays(campaign.cycle.startDate, i);
    out.push({ day, ...(map.get(day) || { leads: 0, spend: 0, reported: false }) });
  }
  return out;
}

/* ── Formatting the figures ─────────────────────────────────────────────────────────────────── */

/**
 * Rupees for a tile: in full under a lakh ("₹45,000"), then lakh and crore the way the business says
 * them ("₹1.2L", "₹3.4Cr"). A tile has room for five characters, not nine.
 */
export function compactRupees(n: number): string {
  const v = Math.round(Number(n) || 0);
  const trim = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
  if (Math.abs(v) >= 1e7) return `₹${trim(v / 1e7)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${trim(v / 1e5)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

/** "Today", "Tomorrow", "In 3 days", "2 days ago". */
export function relativeDay(daysTo: number): string {
  if (daysTo === 0) return "Today";
  if (daysTo === 1) return "Tomorrow";
  if (daysTo === -1) return "Yesterday";
  return daysTo > 0 ? `In ${daysTo} days` : `${-daysTo} days ago`;
}

/** Whole days between two `yyyy-MM-dd` dates (re-exported for the charts' axes). */
export { daysBetween };
