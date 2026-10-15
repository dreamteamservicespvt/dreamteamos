/**
 * One social-media month, at a glance, in plain words (2026-10-04) — what every client card says.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────────────────────
 * The owner's verdict on the charts: hard to read. A person opening Social Media wants each client
 * answered in one look — is it fine, how much is done, what is left, what is next — not a picture
 * to decode. So every month is boiled down here to:
 *
 *   • one STATUS in everyday words — On track, At risk, Off track, Completed, Not started, Needs setup,
 *     and (2026-10-05) On hold for a month that ended without a renewal — with a one-line REASON
 *     ("3 posts are late", "2 posts behind schedule", "Ended 4 Oct — not renewed yet");
 *   • how many of the promised posts are live, and where the rest are, in five buckets anybody
 *     understands — Posted, In progress, Waiting for client, Not started, Late — which the card draws
 *     as one ring;
 *   • each kind's own count, the days left, the next post, and where the renewal stands.
 *
 * Pure, and built on the rules every other screen uses (smmPlan, smmPackage), so a card can never
 * disagree with the month's page about whether a post is late.
 */
import { clientWaitSummary, daysBetween, fulfilment, isOverdue, isPosted, postedDayOf } from "@/utils/smmPlan";
import {
  DATED_OUTSIDE_HINT, cycleElapsed, cyclePhase, cycleTimeLabel, datedOutsideLine, daysToRenewal, isOnHold, needsSetup,
  ownDaysLabel, paceOf, renewalDue, renewalWhenLabel, shortDayLabel, splitByMonthDates, toneCounts,
} from "@/utils/smmPackage";
import type { SmmCampaign, SmmContentItem, SmmContentKind } from "@/types/smm";

export type SmmGlanceStatus =
  | "setup" | "history" | "nothing" | "done" | "not_started" | "off_track" | "at_risk" | "on_track" | "on_hold";

/** The colour family of a status: green fine, amber watch it, red act now, grey nothing yet. */
export type SmmGlanceTone = "good" | "warn" | "bad" | "idle";

/**
 * Where a promised post is, in the words the card uses. `outside` (2026-10-15): posted, but dated
 * outside the month's own days — it is not this month's post, so it is not "Posted" here.
 */
export type SmmBucket = "posted" | "progress" | "waiting" | "notStarted" | "late" | "outside";

/**
 * In the order the ring draws them, clockwise from the top. Late sits between "waiting" and "not
 * started" on purpose: in a ring the last colour touches the first, and red beside green is the one
 * pair a colour-blind reader cannot tell apart (checked with the dataviz palette validator). "Posted
 * outside its dates" (2026-10-15) comes last, a neutral grey beside green, and is listed only when a
 * month has one (`RingLegend`).
 */
export const SMM_BUCKETS: { key: SmmBucket; label: string; hint: string }[] = [
  { key: "posted", label: "Posted", hint: "live on the client's pages" },
  { key: "progress", label: "In progress", hint: "being made, or approved and scheduled" },
  { key: "waiting", label: "Waiting for client", hint: "sent to the client for approval" },
  { key: "late", label: "Late", hint: "past its date and not posted" },
  { key: "notStarted", label: "Not started", hint: "planned, or not planned yet" },
  { key: "outside", label: "Posted outside its dates", hint: "live, but its upload date is not one of this month's days — it does not count toward this month" },
];

export const SMM_STATUS_LABEL: Record<SmmGlanceStatus, string> = {
  setup: "Needs setup",
  history: "History",
  nothing: "Nothing promised",
  done: "Completed",
  not_started: "Not started",
  off_track: "Off track",
  at_risk: "At risk",
  on_track: "On track",
  on_hold: "On hold",
};

/** On hold is grey — paused, nothing for the team to make — not a warning colour (2026-10-05). */
const STATUS_TONE: Record<SmmGlanceStatus, SmmGlanceTone> = {
  setup: "warn",
  history: "idle",
  nothing: "idle",
  done: "good",
  not_started: "idle",
  off_track: "bad",
  at_risk: "warn",
  on_track: "good",
  on_hold: "idle",
};

/**
 * Who needs somebody first, on the board: off track, then nobody on it, then at risk … done last. On
 * hold sits after on track: the team has nothing left to make on it — the next move is the salesperson's.
 */
const STATUS_RANK: Record<SmmGlanceStatus, number> = {
  off_track: 0, setup: 1, at_risk: 2, not_started: 3, on_track: 4, on_hold: 5, done: 6, nothing: 7, history: 8,
};

export interface SmmGlanceNext {
  title: string;
  day: string;
  /** "Today", "Tomorrow", "Fri", "18 Oct". */
  dayLabel: string;
  /** "6:00 AM", or null when no time was set. */
  timeLabel: string | null;
}

export type SmmRenewalGlanceState = "none" | "due" | "overdue" | "renewed" | "lost";

export interface SmmGlance {
  status: SmmGlanceStatus;
  label: string;
  /** One sentence: why the status is what it is. */
  reason: string;
  tone: SmmGlanceTone;
  posted: number;
  total: number;
  /** 0–100. */
  percent: number;
  buckets: Record<SmmBucket, number>;
  /** Each kind the month owes, with its own count. */
  kinds: { kind: SmmContentKind; label: string; posted: number; total: number }[];
  /** Extra pieces delivered beyond the package — said, never counted in the ring. */
  extra: number;
  /**
   * Promised pieces dated outside the month's own days, posted or not (2026-10-15) — and the amber line
   * that says so ("3 posts are dated outside 6 Sep – 5 Oct"), "" when there are none, with its hint.
   */
  datedOutside: number;
  outsideLine: string;
  outsideHint: string;
  /** "13 days left", "Starts in 3 days", "Ended yesterday". */
  timeLabel: string;
  /** 0–1, how much of the month has gone. */
  monthGone: number;
  startDate: string;
  endDate: string;
  next: SmmGlanceNext | null;
  renewal: { state: SmmRenewalGlanceState; label: string };
}

const KIND_LABEL: Record<SmmContentKind, string> = { ai_ad: "Videos", poster: "Posters", real_video: "Real videos" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "06:00" → "6:00 AM", "18:30" → "6:30 PM". Anything unreadable → null. */
export function clockLabel(hhmm: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * "Up today, 6:00 AM", "Up yesterday", "Up 3d ago" — when a posted piece went up (2026-10-15), for the
 * Content list's chip.
 *
 * ── From its upload date, not from when Posted was pressed ───────────────────────────────────
 * It counted from `postedAt`, stamped when somebody pressed Posted — and the team often marks a month's
 * posts together, days later, so "Up 10d ago" sat right beside an upload date two months earlier. The
 * upload date (and its time) is the day the post went up, the day the calendar draws it on
 * (`smmPlan.postedDayOf`); the press is used only when no upload date was given. A posted piece dated in
 * the future (a date typed wrong) says its date rather than a negative count.
 */
export function postedUpLabel(item: Pick<SmmContentItem, "postedAt" | "uploadDate" | "uploadTime">, today: string): string {
  const day = postedDayOf(item);
  if (!day) return "Up";
  const ago = daysBetween(day, today);
  const time = item.uploadDate ? clockLabel(item.uploadTime) : null;
  if (ago < 0) return `Up · dated ${shortDayLabel(day)}`;
  if (ago === 0) return time ? `Up today, ${time}` : "Up today";
  if (ago === 1) return time ? `Up yesterday, ${time}` : "Up yesterday";
  return `Up ${ago}d ago`;
}

/** "Today", "Tomorrow", a weekday within the week, else "18 Oct". */
export function upcomingDayLabel(day: string, today: string): string {
  const d = daysBetween(today, day);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  const [y, mo, da] = day.split("-").map(Number);
  if (d > 1 && d < 7) return WEEKDAYS[new Date(y, mo - 1, da).getDay()];
  return `${da} ${MONTHS[mo - 1]}`;
}

/**
 * The renewal chip. Counted from `daysToRenewal` — the same number as the card's time line and the
 * bell (2026-10-15) — and worded by `renewalWhenLabel`, like the renewals card and the Money tab.
 */
function renewalGlance(c: SmmCampaign, today: string): SmmGlance["renewal"] {
  if (c.renewal?.nextCampaignId || c.renewal?.state === "won") return { state: "renewed", label: "Renewed" };
  if (c.renewal?.state === "lost") return { state: "lost", label: "Not renewing" };
  if (!renewalDue(c, today)) return { state: "none", label: "" };
  const d = daysToRenewal(c.cycle, today);
  if (d < 0) return { state: "overdue", label: "Renewal overdue" };
  return { state: "due", label: renewalWhenLabel(d) };
}

export function monthGlance(c: SmmCampaign, today: string): SmmGlance {
  const t = toneCounts(c, today);
  const buckets: Record<SmmBucket, number> = {
    posted: t.done,
    progress: t.ready + t.work,
    waiting: t.wait,
    notStarted: t.idle + t.unplanned,
    late: t.late,
    outside: t.outside,
  };
  const total = t.total;
  const posted = buckets.posted;
  const f = fulfilment(c);
  const phase = cyclePhase(c.cycle, today);
  const pace = paceOf(c, today);
  const lateCount = c.items.filter((i) => isOverdue(i, today)).length;
  const waiting = clientWaitSummary(c.items).openCount;
  // Promised pieces dated outside the month's own days, posted or not — the amber line (2026-10-15).
  const datedOutside = splitByMonthDates(c.items.filter((i) => !i.extra), c.cycle).outside.length;
  // Truly not live, wherever dated: a post live under another month's date is live, just not this month's.
  // Pieces moved into the next month are owed there, not here (`toneCounts.moved`, 2026-10-15).
  const notLive = c.items.filter((i) => !i.extra && !isPosted(i)).length + t.unplanned;
  const movedNote = t.moved > 0 ? ` · ${plural(t.moved, "post", "posts")} moved to the next month` : "";

  const upcoming = c.items
    .filter((i) => !isPosted(i) && i.uploadDate && i.uploadDate >= today)
    .sort((a, b) => (a.uploadDate! + (a.uploadTime || "")).localeCompare(b.uploadDate! + (b.uploadTime || "")))[0];
  const next: SmmGlanceNext | null = upcoming
    ? {
      title: upcoming.title?.trim() || "Untitled post",
      day: upcoming.uploadDate!,
      dayLabel: upcomingDayLabel(upcoming.uploadDate!, today),
      timeLabel: clockLabel(upcoming.uploadTime),
    }
    : null;

  let status: SmmGlanceStatus;
  let reason: string;
  if (isOnHold(c, today)) {
    // Ended with no renewal decision (owner, 2026-10-05) — before history: an old client's last month is
    // on hold too. A history month's blank rows are a record left blank, not posts that failed to go up.
    status = "on_hold";
    // On hold from the renewal day (the end date) on — "Ended 6 Oct" for "6 Sep → 6 Oct" (2026-10-15).
    reason = `Ended ${shortDayLabel(c.cycle.endDate)} — not renewed yet`
      + (!c.history && notLive > 0 ? ` · ${plural(notLive, "post", "posts")} not live` : "") + movedNote;
  } else if (c.history) {
    status = "history";
    reason = "Recorded after the month ended";
  } else if (needsSetup(c, today)) {
    status = "setup";
    reason = "Nobody is assigned to this month yet";
  } else if (total === 0) {
    status = "nothing";
    reason = "No posts were promised this month";
  } else if (posted >= total) {
    // Only posts dated on the month's own days count as posted (2026-10-15): the owner's month whose 10
    // posts were live but 9 of them dated 13 Aug – 9 Sep read "Completed — All 10 posts are live".
    status = "done";
    reason = (total === 1 ? "The post is live" : `All ${total} posts are live`) + movedNote;
  } else if (phase === "upcoming") {
    status = "not_started";
    reason = cycleTimeLabel(c.cycle, today);
  } else if (lateCount > 0) {
    status = "off_track";
    reason = `${plural(lateCount, "post is", "posts are")} late`;
  } else if (t.outside > 0 && posted + t.outside >= total) {
    // Everything is live, but some of it under dates outside the month: the work may be done — the dates
    // say it was another month's. Amber: fix the dates (or the month), not the work.
    status = "at_risk";
    reason = `${plural(t.outside, "post is", "posts are")} dated outside ${ownDaysLabel(c.cycle)}`;
  } else if (phase === "ended") {
    status = "off_track";
    reason = `Month ended with ${plural(notLive, "post", "posts")} not live${movedNote}`;
  } else if (pace.state === "behind") {
    status = "at_risk";
    reason = `${plural(pace.behindBy, "post", "posts")} behind schedule`;
  } else {
    status = "on_track";
    reason = waiting > 0
      ? `${plural(waiting, "post is", "posts are")} waiting for the client's approval`
      : "Everything is on schedule";
  }

  return {
    status,
    label: SMM_STATUS_LABEL[status],
    reason,
    tone: STATUS_TONE[status],
    posted,
    total,
    percent: total > 0 ? Math.min(100, Math.round((posted / total) * 100)) : 0,
    buckets,
    kinds: f.byKind.filter((k) => k.committed > 0).map((k) => ({
      kind: k.kind, label: KIND_LABEL[k.kind], posted: Math.min(k.posted, k.committed), total: k.committed,
    })),
    extra: c.items.filter((i) => i.extra).length,
    datedOutside,
    outsideLine: datedOutsideLine(datedOutside, c.cycle),
    outsideHint: datedOutside > 0 ? DATED_OUTSIDE_HINT : "",
    timeLabel: cycleTimeLabel(c.cycle, today),
    monthGone: phase === "upcoming" ? 0 : cycleElapsed(c.cycle, today),
    startDate: c.cycle.startDate,
    endDate: c.cycle.endDate,
    next,
    renewal: renewalGlance(c, today),
  };
}

/** Worst first; then the month ending soonest. */
export function byGlanceUrgency<T extends { glance: SmmGlance }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    STATUS_RANK[a.glance.status] - STATUS_RANK[b.glance.status]
    || b.glance.buckets.late - a.glance.buckets.late
    || a.glance.endDate.localeCompare(b.glance.endDate));
}
