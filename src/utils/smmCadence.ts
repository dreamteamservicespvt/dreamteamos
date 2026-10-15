/**
 * SMM Delivery Control — the WEEKLY rules (2026-10-15, phase 1 of the plan in `.claude/rules/smm.md` §9.9).
 *
 * ── Why weeks ───────────────────────────────────────────────────────────────────────────────────
 * The owner: "Social media management is happening, but the work is not done. The board shows the month;
 * people update it if they did the work, else nothing, and we have to inform them manually every time."
 * A month's pieces are born undated (`smmPlan.blankItem`), so nothing was ever late and nothing was ever
 * reminded. This file divides each client's month into four WEEKS, gives every piece a week, and gives
 * every week ONE deadline — its last working day at the deadline hour (19:00). Checkpoints inside the
 * week (sent to the client, approved, footage in) warn early; the deadline stays the week's end.
 *
 * ── The owner's decisions it follows (2026-10-15, final) ────────────────────────────────────────
 *   1. The weeks follow the client's own month: W1 = days 1–7 from `cycle.startDate`, W2 = 8–14,
 *      W3 = 15–21, W4 = day 22 → the day BEFORE `cycle.endDate` (the end date is the renewal day, the
 *      next month's day 1 — so W4 is 7–10 days long).
 *   2. Counts per week: the promise divided by 4, leftovers to W1, then W4, then W2 (4 → 1,1,1,1;
 *      5 → 2,1,1,1; 6 → 2,1,1,2; 7 → 2,2,1,2; 8 → 2,2,2,2), per kind — videos, posters, real videos.
 *   3. A client's FIRST month keeps the full W1 count, but no post before day 4; a real video is never
 *      placed in W1 of a first month. Pieces carried from last month go first, in W1.
 *   4. Working days are Mon–Sat and not a company holiday (`holidays/{date}`); a deadline on a Sunday or a
 *      holiday steps back. A festival post goes on the festival day itself, even a Sunday.
 *   5. Fixed dates instead of the week's end: a festival post, an extra work item ("needed by"), a date
 *      the client asked for.
 *   6. Blame for a late piece goes to the FIRST checkpoint missed: not sent → the maker (team); approval
 *      or footage late → the client (chased by the salesperson); approved but not posted → the publisher.
 *   7. Moving a piece within its week is free; to another week needs a reason and the lead is told; out of
 *      the month only the tech admin / team leader / main admin.
 *
 * ── What it never does ──────────────────────────────────────────────────────────────────────────
 * It never writes `uploadDate`: the classic board, its calendar, `monthGlance` and the old reminders keep
 * reading the team's own dates exactly as before. A date somebody typed is KEPT — a dated piece takes its
 * date's week. The plan is stored (phase 3) as `plan` on each piece (`types/smmDelivery.SmmItemPlan`); a
 * saved plan wins over the planner. The AI (phase 5) writes titles and ideas only; counts and deadlines
 * are these rules'.
 *
 * ── Why it is written without the `@/` alias, with its own date helpers ─────────────────────────
 * The server checker (`api/smm-monitor.ts`, phase 6) runs these same rules when the app is closed, and
 * `api/` cannot resolve the alias (a test asserts it). So it imports nothing but types, the settings file
 * and the festival list, and keeps its own copy of the month's date rule (own days start → end − 1; ended /
 * on hold FROM the end date) — `smmPackage.cyclePhase` / `isOnHold` and `smmDeliveryHealth.excludedReason`
 * say the same, and a parity test holds them together. Every day is a `yyyy-MM-dd` string worked on in UTC
 * arithmetic, and every time of day is India time (the server runs in UTC): a deadline is an instant, ms.
 */
import type { SmmCampaign, SmmContentItem, SmmContentKind, SmmCycle } from "../types/smm";
import type {
  SmmDeliveryCheckpoints, SmmDeliveryItemFields, SmmDeliverySettings, SmmFixedReason, SmmLateStep, SmmPlanWeek,
} from "../types/smmDelivery";
// `.js` on purpose (phase 6): the server checker loads this file as Node ESM, which needs the extension —
// see the note at the top of `smmMonitor.ts`.
import { DEFAULT_SMM_DELIVERY } from "./smmDeliverySettings.js";

/** A piece as Delivery Control reads it: the classic piece plus the optional plan / answers (phase 3 writes them). */
export type SmmDeliveryItem = SmmContentItem & SmmDeliveryItemFields;

/** A month as Delivery Control reads it. `delivery` is set when the month is switched on (phase 3). */
export type SmmDeliveryMonth = Omit<SmmCampaign, "items"> & {
  items: SmmDeliveryItem[];
  delivery?: { activatedAt?: unknown; activatedByName?: string; baselineAt?: unknown; rule?: string } | null;
};

export type SmmHolidays = ReadonlySet<string> | null | undefined;

/** The numbers the weekly rules read from `app_settings/smm_delivery` — passed in, never hard-coded twice. */
export type SmmCadenceSettings = Pick<SmmDeliverySettings, "deadlineHour" | "checkpoints">;

/* ── Days and India time ──────────────────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;
/** India is UTC+5:30 all year (no daylight saving). */
export const IST_OFFSET_MINUTES = 330;
const IST_MS = IST_OFFSET_MINUTES * 60_000;

export function isIsoDay(d: unknown): d is string {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return new Date(t).toISOString().slice(0, 10) === d;
}

const utcOf = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

export function addDaysIso(day: string, n: number): string {
  return new Date(utcOf(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysFrom(a: string, b: string): number {
  return Math.round((utcOf(b) - utcOf(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday — of the date itself, whatever the device's time zone. */
export function weekdayOf(day: string): number {
  return new Date(utcOf(day)).getUTCDay();
}

/** The India-time day an instant falls on. */
export function istDay(ms: number): string {
  return new Date(ms + IST_MS).toISOString().slice(0, 10);
}

/** Minutes since India-time midnight. */
export function istMinuteOfDay(ms: number): number {
  const d = new Date(ms + IST_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function istHour(ms: number): number {
  return Math.floor(istMinuteOfDay(ms) / 60);
}

/** The instant of `hour:minute` India time on `day`. */
export function istMoment(day: string, hour: number, minute = 0): number {
  return utcOf(day) + (hour * 60 + minute) * 60_000 - IST_MS;
}

/** "06:00" on `day` (India time); a missing or broken time reads as `fallbackHour`:00. */
export function istMomentOf(day: string, hhmm: string | null | undefined, fallbackHour: number): number {
  const m = typeof hhmm === "string" ? /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim()) : null;
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return istMoment(day, Number(m[1]), Number(m[2]));
  return istMoment(day, fallbackHour);
}

/**
 * Any stored time as ms: a number, a Date, a Firestore Timestamp (`toMillis` or `seconds`), an ISO string.
 * `null` when it is absent or unreadable — never NaN.
 */
export function toMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "object") {
    const o = v as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof o.toMillis === "function") {
      const t = o.toMillis();
      return Number.isFinite(t) ? t : null;
    }
    if (typeof o.seconds === "number") return o.seconds * 1000 + Math.floor((o.nanoseconds || 0) / 1e6);
  }
  return null;
}

/* ── Working days ─────────────────────────────────────────────────────────────────────────────── */

/** Mon–Sat and not an announced company holiday. Holidays unknown (null) → only Sundays are skipped. */
export function isWorkingDay(day: string, holidays: SmmHolidays): boolean {
  return weekdayOf(day) !== 0 && !holidays?.has(day);
}

/** Guards every day-walking loop: a year of days off in a row is not a calendar, it is a bug. */
const WALK_LIMIT = 400;

/** `n` working days before `day`, not counting `day` itself (n ≤ 0 → `day`). */
export function workingDaysBefore(day: string, n: number, holidays: SmmHolidays): string {
  let d = day;
  let left = Math.max(0, Math.floor(n));
  for (let guard = 0; left > 0 && guard < WALK_LIMIT; guard++) {
    d = addDaysIso(d, -1);
    if (isWorkingDay(d, holidays)) left--;
  }
  return d;
}

/** The `n`-th working day after `day` (n ≤ 0 → `day`). */
export function nthWorkingDayAfter(day: string, n: number, holidays: SmmHolidays): string {
  let d = day;
  let left = Math.max(0, Math.floor(n));
  for (let guard = 0; left > 0 && guard < WALK_LIMIT; guard++) {
    d = addDaysIso(d, 1);
    if (isWorkingDay(d, holidays)) left--;
  }
  return d;
}

/** Working days `d` with `from` < d ≤ `to` (0 when `to` is not after `from`). */
export function workingDaysAfter(from: string, to: string, holidays: SmmHolidays): number {
  let n = 0;
  let d = from;
  for (let guard = 0; d < to && guard < WALK_LIMIT * 2; guard++) {
    d = addDaysIso(d, 1);
    if (isWorkingDay(d, holidays)) n++;
  }
  return n;
}

/* ── The month ────────────────────────────────────────────────────────────────────────────────── */

export const SMM_WEEKS: readonly SmmPlanWeek[] = [1, 2, 3, 4];

/** Four weeks need at least 22 own days (W4 starts on day 22) — `smmDeliveryHealth` blocks shorter months. */
export const SMM_CADENCE_MIN_MONTH_DAYS = 22;

/** A client's first month: no post before this day of the month (owner's decision 2). */
export const SMM_FIRST_POST_DAY = 4;

/** More than this many posts on one day for one client is "bunched" (a soft flag, never an alert). */
export const SMM_MAX_POSTS_PER_DAY = 2;

/** The post time the plan suggests — the classic board's default (`smmPlan.DEFAULT_UPLOAD_TIME`). */
export const SMM_SUGGESTED_TIME = "06:00";

/** The month's own days: start → the day before the end date (the end date is the renewal day). Null when the dates are broken. */
export function ownDaysOf(cycle: Pick<SmmCycle, "startDate" | "endDate"> | null | undefined): { start: string; lastDay: string; days: number } | null {
  const start = cycle?.startDate;
  const end = cycle?.endDate;
  if (!isIsoDay(start) || !isIsoDay(end) || end <= start) return null;
  return { start, lastDay: addDaysIso(end, -1), days: daysFrom(start, end) };
}

/** The month runs today: start ≤ today < end date. */
export function monthRunsOn(c: Pick<SmmCampaign, "cycle">, today: string): boolean {
  const own = ownDaysOf(c.cycle);
  return !!own && today >= own.start && today <= own.lastDay;
}

const renewalDecided = (r: SmmCampaign["renewal"] | null | undefined): boolean =>
  !!r?.nextCampaignId || r?.state === "won" || r?.state === "lost";

export type SmmMonthExclusion = "deleted" | "removed" | "history" | "finished" | "on_hold" | "ended";

/**
 * Why a month is never planned or alerted, or null when it may be — the same rule as
 * `smmDeliveryHealth.excludedReason` (which says it in a sentence). On hold = the month reached its end
 * date (the renewal day) with no renewal decision: no production alerts, only the salesperson's renewal.
 */
export function monthExclusion(c: Pick<SmmCampaign, "status" | "history" | "cycle" | "renewal">, today: string): SmmMonthExclusion | null {
  if (c.status === "deleted") return "deleted";
  if (c.status === "removed") return "removed";
  if (c.history) return "history";
  if (c.status === "completed" || c.status === "renewed" || c.status === "lapsed") return "finished";
  if (isIsoDay(c.cycle?.endDate) && today >= c.cycle.endDate) {
    return isIsoDay(c.cycle?.startDate) && c.status === "active" && !renewalDecided(c.renewal) ? "on_hold" : "ended";
  }
  return null;
}

/** A client's first month (no renewal behind it): no post before day 4, no real video in week 1. */
export function isFirstMonth(c: Pick<SmmCampaign, "renewalOf" | "monthNumber">): boolean {
  return !c.renewalOf && (Number(c.monthNumber) || 1) <= 1;
}

/* ── The weeks ────────────────────────────────────────────────────────────────────────────────── */

export interface SmmWeek {
  week: SmmPlanWeek;
  /** First and last day, inclusive. */
  start: string;
  end: string;
  days: number;
  workingDays: string[];
  /** The week's last working day (stepping back over a Sunday / holiday); its last day if it has none. */
  deadlineDay: string;
  /** `deadlineDay` at the deadline hour, India time (ms). */
  deadlineAt: number;
}

export const weekKey = (campaignId: string, week: SmmPlanWeek | number) => `${campaignId}_w${week}`;

/** The client's four weeks, or null when the dates are broken or the month is shorter than 22 days. */
export function monthWeeks(
  cycle: Pick<SmmCycle, "startDate" | "endDate"> | null | undefined,
  opts: { holidays: SmmHolidays; deadlineHour: number },
): SmmWeek[] | null {
  const own = ownDaysOf(cycle);
  if (!own || own.days < SMM_CADENCE_MIN_MONTH_DAYS) return null;
  return SMM_WEEKS.map((week) => {
    const start = addDaysIso(own.start, (week - 1) * 7);
    const end = week === 4 ? own.lastDay : addDaysIso(start, 6);
    const workingDays: string[] = [];
    for (let d = start; d <= end; d = addDaysIso(d, 1)) if (isWorkingDay(d, opts.holidays)) workingDays.push(d);
    const deadlineDay = workingDays.length ? workingDays[workingDays.length - 1] : end;
    return { week, start, end, days: daysFrom(start, end) + 1, workingDays, deadlineDay, deadlineAt: istMoment(deadlineDay, opts.deadlineHour) };
  });
}

/** The week a day falls in, or null outside the month's own days. */
export function weekOfDay(weeks: readonly SmmWeek[] | null | undefined, day: string | null | undefined): SmmWeek | null {
  if (!weeks || !isIsoDay(day)) return null;
  return weeks.find((w) => day >= w.start && day <= w.end) || null;
}

/* ── How many a week ──────────────────────────────────────────────────────────────────────────── */

/** Where the leftovers of a count ÷ 4 go: week 1, then week 4, then week 2 (owner's decision 1). */
export const SMM_LEFTOVER_ORDER: readonly SmmPlanWeek[] = [1, 4, 2];

/** A count split over the four weeks: 6 → [2, 1, 1, 2]. */
export function splitAcrossWeeks(n: number): [number, number, number, number] {
  const total = Math.max(0, Math.floor(Number(n) || 0));
  const base = Math.floor(total / 4);
  const out: [number, number, number, number] = [base, base, base, base];
  for (let i = 0; i < total % 4; i++) out[SMM_LEFTOVER_ORDER[i] - 1] += 1;
  return out;
}

export const SMM_CADENCE_KINDS: readonly SmmContentKind[] = ["ai_ad", "poster", "real_video"];

/**
 * Each kind's count per week. In a client's first month a real video is never in week 1 (the footage
 * has to come first) — week 1's real videos move to week 2.
 */
export function weekTargets(
  commitments: Partial<Record<SmmContentKind, number>> | null | undefined,
  opts: { firstMonth: boolean },
): Record<SmmContentKind, [number, number, number, number]> {
  const out = {} as Record<SmmContentKind, [number, number, number, number]>;
  for (const kind of SMM_CADENCE_KINDS) {
    const split = splitAcrossWeeks(Number(commitments?.[kind]) || 0);
    if (kind === "real_video" && opts.firstMonth && split[0] > 0) {
      split[1] += split[0];
      split[0] = 0;
    }
    out[kind] = split;
  }
  return out;
}

/* ── Checkpoints ──────────────────────────────────────────────────────────────────────────────── */

export type SmmTaskType = "ai_video" | "poster" | "real_video" | "extra";

export function taskTypeOf(item: Pick<SmmContentItem, "kind" | "extra">): SmmTaskType {
  if (item.extra) return "extra";
  return item.kind === "ai_ad" ? "ai_video" : item.kind === "poster" ? "poster" : "real_video";
}

/** Clips in a video piece: the month's for its own videos; an extra video's from its length ("48s" → 6). */
export function clipsOf(item: Pick<SmmContentItem, "extra" | "extraDuration">, monthClips: number): number {
  if (item.extra && item.extraDuration) {
    const sec = Number(/(\d+)/.exec(String(item.extraDuration))?.[1]);
    if (Number.isFinite(sec) && sec > 0) return Math.max(1, Math.round(sec / 8));
  }
  return monthClips;
}

const isPosterLike = (item: Pick<SmmContentItem, "kind" | "extra" | "extraType">) =>
  item.extra ? item.extraType === "poster" || (!item.extraType && item.kind === "poster") : item.kind === "poster";

/** Working days before the deadline the piece must be SENT to the client. */
export function sendDaysFor(
  item: Pick<SmmContentItem, "kind" | "extra" | "extraType" | "extraDuration">,
  monthClips: number,
  cp: SmmDeliveryCheckpoints,
): number {
  if (item.kind === "real_video" && !item.extra) return cp.sendRealVideo;
  if (isPosterLike(item)) return cp.sendPoster;
  return cp.sendVideo + (clipsOf(item, monthClips) >= cp.longVideoClips ? cp.longVideoExtraDays : 0);
}

export interface SmmTaskCheckpoint {
  step: SmmLateStep;
  day: string;
  /** ms — the end of that working day (the deadline hour); the "live" checkpoint is the deadline itself. */
  at: number;
}

/**
 * A piece's checkpoints, counted back in working days from its deadline: footage (real video) −4,
 * sent −3 (AI video; −4 for a long one) / −2 (poster, real video), approved −1, live at the deadline.
 * None falls before `floorDay` (the week's first working day; for extra work the day it was added) — a
 * checkpoint pulled up to it marks the piece `compressed`.
 */
export function taskCheckpoints(args: {
  item: Pick<SmmContentItem, "kind" | "extra" | "extraType" | "extraDuration">;
  deadlineDay: string;
  deadlineAt: number;
  floorDay: string;
  monthClips: number;
  holidays: SmmHolidays;
  settings: SmmCadenceSettings;
}): { checkpoints: SmmTaskCheckpoint[]; compressed: boolean } {
  const { item, deadlineDay, deadlineAt, holidays, settings } = args;
  const cp = settings.checkpoints;
  const floor = args.floorDay > deadlineDay ? deadlineDay : args.floorDay;
  const steps: [SmmLateStep, number][] = [];
  if (item.kind === "real_video" && !item.extra) steps.push(["footage", cp.footage]);
  steps.push(["send", sendDaysFor(item, args.monthClips, cp)], ["approved", cp.approved]);
  let compressed = false;
  const checkpoints: SmmTaskCheckpoint[] = steps.map(([step, n]) => {
    let day = workingDaysBefore(deadlineDay, n, holidays);
    if (day < floor) {
      day = floor;
      compressed = true;
    }
    return { step, day, at: Math.min(istMoment(day, settings.deadlineHour), deadlineAt) };
  });
  checkpoints.push({ step: "live", day: deadlineDay, at: deadlineAt });
  return { checkpoints, compressed };
}

/* ── The month's plan ─────────────────────────────────────────────────────────────────────────── */

/** Where a piece's week came from: a saved plan, its own fixed date, the team's date, carried, or the planner. */
export type SmmTaskSource = "plan" | "fixed" | "date" | "carried" | "auto";

export interface SmmPlannedTask {
  campaignId: string;
  itemId: string;
  kind: SmmContentKind;
  type: SmmTaskType;
  extra: boolean;
  title: string;
  /** null: a row beyond the promise (not counted), or extra work with no date / dated outside the month. */
  week: SmmPlanWeek | null;
  /** The first day of its week — before it the piece is "not due" yet. */
  weekStart: string | null;
  /** Counted toward the month's promise. Extra work never is. */
  counted: boolean;
  source: SmmTaskSource | null;
  fixed: SmmFixedReason | null;
  /** null: no deadline at all (an uncounted row, or extra work with no needed-by date). */
  deadlineDay: string | null;
  deadlineAt: number | null;
  checkpoints: SmmTaskCheckpoint[];
  compressed: boolean;
  /** The team's own date when it has one in the month, else the plan's suggestion. */
  postDay: string | null;
  /** The plan's soft suggestion (only for pieces with no date of their own). */
  suggestedDate: string | null;
  suggestedTime: string;
  carried: boolean;
  makerUid: string | null;
  makerName: string | null;
  publisherUid: string | null;
  publisherName: string | null;
}

export type SmmPlanProblem = "bad_dates" | "too_short" | "nothing_promised";

export interface SmmMonthPlan {
  campaignId: string;
  name: string;
  exclusion: SmmMonthExclusion | null;
  problem: SmmPlanProblem | null;
  firstMonth: boolean;
  /** The first day a post may go up: the start, or day 4 of a first month. */
  firstPostDay: string | null;
  weeks: SmmWeek[];
  targets: Record<SmmContentKind, [number, number, number, number]>;
  tasks: SmmPlannedTask[];
  /** Promised pieces with no row to work on, by week and kind. */
  missing: { week: SmmPlanWeek; kind: SmmContentKind; count: number }[];
  /** Rows beyond the promise — not counted, not chased. */
  uncounted: string[];
  /** Pieces a manager moved OUT of the month (`moves` ends with "out") — not chased here; carried to the next month. */
  movedOut: string[];
  /** Days with more than two posts for this client (soft). */
  bunched: { day: string; count: number }[];
}

export interface SmmPlanContext {
  /** yyyy-MM-dd, India time. */
  today: string;
  holidays: SmmHolidays;
  settings?: SmmCadenceSettings;
}

const clipsOfMonth = (c: { clipsPerVideo?: number | null }): number => {
  const v = Math.floor(Number(c.clipsPerVideo));
  return Number.isFinite(v) && v >= 1 ? Math.min(15, v) : 4;
};

/** Never touched: no date, no plan, no title, not started, not carried — the first to be left uncounted. */
const untouched = (i: SmmDeliveryItem) =>
  i.status === "planned" && !i.uploadDate && !i.plan && !(i.title || "").trim() && !i.carriedFrom;

const nameOf = (c: Pick<SmmCampaign, "businessName" | "clientName" | "id">) => c.businessName || c.clientName || c.id;

/** Moved out of the month by a manager: its latest move went "out" (and it is not live — a posted piece stays). */
export const movedOutOf = (i: SmmDeliveryItem): boolean =>
  i.status !== "posted" && Array.isArray(i.moves) && i.moves.length > 0 && i.moves[i.moves.length - 1]?.toWeek === "out";

/**
 * The month divided into weekly tasks. Pure — it changes nothing; the caller saves `plan` (phase 3).
 * Excluded months still get their weeks and tasks (the screens show them), but `exclusion` says they are
 * never chased.
 */
export function planMonth(c: SmmDeliveryMonth, ctx: SmmPlanContext): SmmMonthPlan {
  const settings = ctx.settings || DEFAULT_SMM_DELIVERY;
  const firstMonth = isFirstMonth(c);
  const targets = weekTargets(c.commitments, { firstMonth });
  const plan: SmmMonthPlan = {
    campaignId: c.id, name: nameOf(c), exclusion: monthExclusion(c, ctx.today), problem: null, firstMonth,
    firstPostDay: null, weeks: [], targets, tasks: [], missing: [], uncounted: [], movedOut: [], bunched: [],
  };
  const own = ownDaysOf(c.cycle);
  const weeks = monthWeeks(c.cycle, { holidays: ctx.holidays, deadlineHour: settings.deadlineHour });
  if (!own || !weeks) {
    plan.problem = own ? "too_short" : "bad_dates";
    return plan;
  }
  plan.weeks = weeks;
  const firstPostDay = firstMonth ? addDaysIso(own.start, SMM_FIRST_POST_DAY - 1) : own.start;
  plan.firstPostDay = firstPostDay;
  const promised = SMM_CADENCE_KINDS.reduce((s, k) => s + (Number(c.commitments?.[k]) || 0), 0);
  if (promised <= 0) plan.problem = "nothing_promised";

  const items: SmmDeliveryItem[] = Array.isArray(c.items) ? c.items : [];
  const inMonth = (d: unknown): d is string => isIsoDay(d) && d >= own.start && d <= own.lastDay;
  const monthClips = clipsOfMonth(c);
  const team = c.team;
  const owners = (i: SmmDeliveryItem) => ({
    makerUid: i.makerUid || team?.creator?.uid || null,
    makerName: i.makerUid ? i.makerName || null : team?.creator?.name || null,
    publisherUid: i.publisherUid || team?.publisher?.uid || null,
    publisherName: i.publisherUid ? i.publisherName || null : team?.publisher?.name || null,
  });

  const build = (i: SmmDeliveryItem, place: { week: SmmPlanWeek | null; source: SmmTaskSource | null; fixed: SmmFixedReason | null; counted: boolean }): SmmPlannedTask => {
    const w = place.week ? weeks[place.week - 1] : null;
    let deadlineDay: string | null = null;
    let deadlineAt: number | null = null;
    let floorDay = own.start;
    if (place.fixed) {
      deadlineDay = place.fixed === "extra" ? (i.plan?.fixedDate || i.uploadDate)! : i.plan!.fixedDate!;
      // A festival post goes up on the morning of the festival (scheduled the day before); the others by the deadline hour.
      deadlineAt = place.fixed === "festival"
        ? istMomentOf(deadlineDay, i.uploadDate === deadlineDay ? i.uploadTime : null, Number(SMM_SUGGESTED_TIME.slice(0, 2)))
        : istMoment(deadlineDay, settings.deadlineHour);
      const added = toMs(i.createdAt);
      if (i.extra && added) floorDay = istDay(added) > floorDay ? istDay(added) : floorDay;
    } else if (w && place.counted) {
      deadlineDay = w.deadlineDay;
      deadlineAt = w.deadlineAt;
      floorDay = w.workingDays[0] || w.start;
    }
    const cps = deadlineDay && deadlineAt != null
      ? taskCheckpoints({ item: i, deadlineDay, deadlineAt, floorDay, monthClips, holidays: ctx.holidays, settings })
      : { checkpoints: [], compressed: false };
    const ownDay = inMonth(i.uploadDate) ? i.uploadDate : null;
    return {
      campaignId: c.id, itemId: i.id, kind: i.kind, type: taskTypeOf(i), extra: !!i.extra,
      title: (i.title || "").trim() || (i.plan?.title || "").trim(), week: place.week, weekStart: w?.start || null, counted: place.counted,
      source: place.source, fixed: place.fixed, deadlineDay, deadlineAt, checkpoints: cps.checkpoints, compressed: cps.compressed,
      postDay: ownDay || (place.fixed ? deadlineDay : null), suggestedDate: null, suggestedTime: SMM_SUGGESTED_TIME,
      carried: !!i.carriedFrom, ...owners(i),
    };
  };

  for (const kind of SMM_CADENCE_KINDS) {
    const target = targets[kind];
    const total = target.reduce((s, n) => s + n, 0);
    // A piece a manager moved out of the month is not this month's any more (it is carried to the next one).
    for (const r of items.filter((i) => !i.extra && i.kind === kind && movedOutOf(i))) {
      plan.movedOut.push(r.id);
      plan.tasks.push(build(r, { week: null, source: null, fixed: null, counted: false }));
    }
    const rows = items.filter((i) => !i.extra && i.kind === kind && !movedOutOf(i));
    // Rows beyond the promise: the untouched ones from the end first, then the last rows.
    const left = new Set<string>();
    if (rows.length > total) {
      const drop = rows.length - total;
      for (const r of [...rows].reverse()) if (left.size < drop && untouched(r)) left.add(r.id);
      for (const r of [...rows].reverse()) if (left.size < drop) left.add(r.id);
    }
    const counted = rows.filter((r) => !left.has(r.id));
    const assigned = [0, 0, 0, 0];
    const placed = new Map<string, { week: SmmPlanWeek; source: SmmTaskSource; fixed: SmmFixedReason | null }>();
    const put = (r: SmmDeliveryItem, week: SmmPlanWeek, source: SmmTaskSource, fixed: SmmFixedReason | null = null) => {
      placed.set(r.id, { week, source, fixed });
      assigned[week - 1] += 1;
    };
    // 1. Pinned: a fixed date, a saved plan, the team's own date (hand-typed dates are kept).
    for (const r of counted) {
      const fixedDay = r.plan?.fixedDate;
      if (inMonth(fixedDay)) put(r, weekOfDay(weeks, fixedDay)!.week, "fixed", r.plan?.fixedReason || "client_asked");
      else if (r.plan && SMM_WEEKS.includes(r.plan.week)) put(r, r.plan.week, "plan");
      else if (inMonth(r.uploadDate)) put(r, weekOfDay(weeks, r.uploadDate)!.week, "date");
    }
    // 2. Carried from last month: first, in week 1.
    for (const r of counted) if (!placed.has(r.id) && r.carriedFrom) put(r, 1, "carried");
    // 3. The rest: the earliest week still short of its running total.
    const cumTarget = (w: number) => target.slice(0, w).reduce((s, n) => s + n, 0);
    const cumAssigned = (w: number) => assigned.slice(0, w).reduce((s, n) => s + n, 0);
    for (const r of counted) {
      if (placed.has(r.id)) continue;
      const w = (SMM_WEEKS.find((wk) => cumAssigned(wk) < cumTarget(wk)) || 4) as SmmPlanWeek;
      put(r, w, "auto");
    }
    for (const r of rows) {
      const p = placed.get(r.id);
      plan.tasks.push(p ? build(r, { ...p, counted: true }) : build(r, { week: null, source: null, fixed: null, counted: false }));
    }
    for (const id of left) plan.uncounted.push(id);
    // Promised but no row: the shortfall of each week's running total.
    let before = 0;
    for (const wk of SMM_WEEKS) {
      const short = Math.max(0, cumTarget(wk) - cumAssigned(wk));
      if (short > before) plan.missing.push({ week: wk, kind, count: short - before });
      before = Math.max(before, short);
    }
  }

  // Extra work: outside the count, on its own needed-by date.
  for (const e of items.filter((i) => i.extra)) {
    const day = e.plan?.fixedDate || e.uploadDate;
    if (!isIsoDay(day)) plan.tasks.push(build(e, { week: null, source: null, fixed: null, counted: false }));
    else plan.tasks.push(build(e, { week: weekOfDay(weeks, day)?.week || null, source: "fixed", fixed: "extra", counted: false }));
  }

  // Suggested post days for pieces with no day of their own, spread across each week, Mon–Sat.
  const perDay = new Map<string, number>();
  const bump = (d: string) => perDay.set(d, (perDay.get(d) || 0) + 1);
  for (const t of plan.tasks) {
    const stored = items.find((i) => i.id === t.itemId)?.plan?.suggestedDate;
    if (!t.postDay && t.counted && inMonth(stored)) t.suggestedDate = stored;
    const d = t.postDay || t.suggestedDate;
    if (d) bump(d);
  }
  for (const w of weeks) {
    const open = plan.tasks.filter((t) => t.counted && t.week === w.week && !t.postDay && !t.suggestedDate);
    if (!open.length) continue;
    let avail = w.workingDays.filter((d) => d >= firstPostDay && d <= w.deadlineDay);
    if (!avail.length) avail = [w.deadlineDay < firstPostDay ? firstPostDay : w.deadlineDay];
    open.sort((a, b) => Number(b.carried) - Number(a.carried));
    open.forEach((t, i) => {
      const aim = Math.min(avail.length - 1, Math.floor(((i + 0.5) * avail.length) / open.length));
      let best = avail[0];
      let bestScore = Infinity;
      avail.forEach((d, j) => {
        const n = perDay.get(d) || 0;
        const score = (n >= SMM_MAX_POSTS_PER_DAY ? 100 : 0) + Math.abs(j - aim) + n * 0.25;
        if (score < bestScore) {
          bestScore = score;
          best = d;
        }
      });
      t.suggestedDate = best;
      bump(best);
    });
  }
  plan.bunched = [...perDay.entries()].filter(([, n]) => n > SMM_MAX_POSTS_PER_DAY).map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day));
  return plan;
}

/**
 * Weeks whose pieces cannot fit: more than two posts a day (the last resort) over the working days
 * left between the first post day and the deadline. The capacity check sends ONE admin alert for these.
 */
export function crowdedWeeks(plan: SmmMonthPlan): { week: SmmPlanWeek; tasks: number; workingDays: number }[] {
  const out: { week: SmmPlanWeek; tasks: number; workingDays: number }[] = [];
  for (const w of plan.weeks) {
    const tasks = plan.tasks.filter((t) => t.counted && t.week === w.week && !t.fixed).length;
    const days = w.workingDays.filter((d) => d <= w.deadlineDay && (!plan.firstPostDay || d >= plan.firstPostDay)).length;
    if (tasks > SMM_MAX_POSTS_PER_DAY * Math.max(1, days)) out.push({ week: w.week, tasks, workingDays: days });
  }
  return out;
}

/** The festivals inside a week (for the AI's placement, phase 5). */
export function festivalsInWeek<T extends { date: string }>(week: Pick<SmmWeek, "start" | "end">, festivals: readonly T[]): T[] {
  return festivals.filter((f) => f.date >= week.start && f.date <= week.end);
}

/* ── Where a piece has got to ─────────────────────────────────────────────────────────────────── */

export type SmmTaskState =
  | "done" // live
  | "pending_client" // a real video whose footage the client never sent — that month's pending work, never the team's
  | "uncounted" // a row beyond the promise
  | "unscheduled" // extra work with no needed-by date
  | "not_due" // its week has not started
  | "on_track"
  | "checkpoint_missed"
  | "due_today"
  | "late"; // past its deadline, not live

/** What has to happen next, and whose job it is. */
export type SmmTaskStep = "footage" | "make" | "approve" | "post" | null;

/** Who a late piece counts against (the first checkpoint missed). */
export type SmmBlame = "team" | "client" | "publisher";

export interface SmmTaskProgress {
  state: SmmTaskState;
  step: SmmTaskStep;
  /** maker (make), salesperson (footage / approve — the client's side), publisher (post). */
  stepOwner: "maker" | "salesperson" | "publisher" | null;
  live: boolean;
  liveAt: number | null;
  /** Decided once it is live or its deadline passed: live by the deadline. null while undecided. */
  onTime: boolean | null;
  /** Checkpoints whose time has passed without the step done, in order. */
  missed: SmmLateStep[];
  firstMissed: SmmLateStep | null;
  blame: SmmBlame | null;
  nextCheckpoint: SmmTaskCheckpoint | null;
  waitingOnClient: boolean;
  /** When each step was done (ms) — null when not done, or done with no time recorded. */
  footageAt: number | null;
  sentAt: number | null;
  approvedAt: number | null;
}

/** How far a piece has got: planned 0 … posted 5 (changes asked = sent, like waiting). */
export const SMM_STATUS_RANK: Record<string, number> = { planned: 0, in_progress: 1, awaiting_approval: 2, changes_requested: 2, approved: 3, scheduled: 4, posted: 5 };
const STATUS_RANK = SMM_STATUS_RANK;

/** When the piece went live: its upload date + time when set, else when Posted was pressed. */
export function goLiveAt(item: Pick<SmmContentItem, "status" | "uploadDate" | "uploadTime" | "postedAt">): number | null {
  if (item.status !== "posted") return null;
  if (isIsoDay(item.uploadDate)) return istMomentOf(item.uploadDate, item.uploadTime, 0);
  return toMs(item.postedAt);
}

/**
 * The piece at `now`: its state, the next step and its owner, the checkpoints missed and who a late piece
 * counts against. A step done with no recorded time (pieces from before the stamps) counts as on time.
 */
export function taskProgress(task: SmmPlannedTask, item: SmmDeliveryItem, now: number): SmmTaskProgress {
  const rank = STATUS_RANK[item.status] ?? 0;
  const live = item.status === "posted";
  const liveAt = goLiveAt(item);
  const isReal = item.kind === "real_video" && !item.extra;
  // A real video already being made has its footage (pieces from before `footage` was recorded).
  const footageIn = !isReal || item.footage?.state === "received" || (!item.footage && rank >= 1);
  const footageAt = isReal && item.footage?.state === "received" ? toMs(item.footage.at) : null;
  const sent = rank >= 2 || item.approval?.state === "waiting" || item.approval?.state === "changes" || item.approval?.state === "approved";
  const sentAt = sent ? toMs(item.madeAt) ?? toMs(item.approval?.askedAt) : null;
  const approved = rank >= 3 || item.approval?.state === "approved";
  const approvedAt = approved && item.approval?.state === "approved" ? toMs(item.approval?.respondedAt) : null;

  const doneBy = (step: SmmLateStep, at: number): boolean => {
    if (step === "footage") return footageIn && (footageAt == null || footageAt <= at);
    if (step === "send") return sent && (sentAt == null || sentAt <= at);
    if (step === "approved") return approved && (approvedAt == null || approvedAt <= at);
    return live && (liveAt == null || liveAt <= at);
  };
  const missed = task.checkpoints.filter((cp) => cp.at < now && !doneBy(cp.step, cp.at)).map((cp) => cp.step);
  const firstMissed = missed[0] || null;
  const blame: SmmBlame | null = !firstMissed ? null : firstMissed === "send" ? "team" : firstMissed === "live" ? "publisher" : "client";
  const nextCheckpoint = task.checkpoints.find((cp) => cp.at >= now && !doneBy(cp.step, cp.at)) || null;

  let step: SmmTaskStep = null;
  let stepOwner: SmmTaskProgress["stepOwner"] = null;
  if (!live) {
    if (!footageIn) [step, stepOwner] = ["footage", "salesperson"];
    else if (!sent) [step, stepOwner] = ["make", "maker"];
    else if (!approved) [step, stepOwner] = ["approve", "salesperson"];
    else [step, stepOwner] = ["post", "publisher"];
  }
  const waitingOnClient = step === "approve" || step === "footage";

  let state: SmmTaskState;
  const deadline = task.deadlineAt;
  if (live) state = "done";
  else if (!task.counted && !task.extra) state = "uncounted";
  else if (deadline == null) state = "unscheduled";
  else if (isReal && item.footage?.state === "pending_client") state = "pending_client";
  else if (now > deadline) state = "late";
  else if (istDay(now) === task.deadlineDay) state = "due_today";
  else if (missed.length) state = "checkpoint_missed";
  else if (task.weekStart && istDay(now) < task.weekStart) state = "not_due";
  else state = "on_track";

  const onTime = live && deadline != null ? liveAt == null || liveAt <= deadline : deadline != null && now > deadline ? false : null;
  return {
    state, step, stepOwner, live, liveAt, onTime, missed, firstMissed, blame: live && onTime ? null : blame, nextCheckpoint,
    waitingOnClient, footageAt, sentAt, approvedAt,
  };
}

/** On time across pieces whose result is known. Client delays never count against the team. */
export interface SmmOnTimeSummary {
  decided: number;
  onTime: number;
  lateTeam: number;
  latePublisher: number;
  lateClient: number;
  pendingClient: number;
  /** onTime ÷ (onTime + team + publisher lates), 0–100, or null when nothing is decided. */
  percent: number | null;
}

export function onTimeSummary(progress: readonly SmmTaskProgress[], pendingClient = 0): SmmOnTimeSummary {
  const s: SmmOnTimeSummary = { decided: 0, onTime: 0, lateTeam: 0, latePublisher: 0, lateClient: 0, pendingClient, percent: null };
  for (const p of progress) {
    if (p.state === "pending_client") {
      s.pendingClient += 1;
      continue;
    }
    if (p.onTime == null) continue;
    s.decided += 1;
    if (p.onTime) s.onTime += 1;
    else if (p.blame === "client") s.lateClient += 1;
    else if (p.blame === "publisher") s.latePublisher += 1;
    else s.lateTeam += 1;
  }
  const judged = s.onTime + s.lateTeam + s.latePublisher;
  s.percent = judged ? Math.round((s.onTime / judged) * 100) : null;
  return s;
}

/* ── Moving a piece ───────────────────────────────────────────────────────────────────────────── */

export type SmmMoveScope = "same_week" | "other_week" | "out_of_month";

/** A reason must say something the lead can act on. */
export const SMM_MOVE_REASON_MIN = 5;

const MANAGERS = ["tech_admin", "tech_team_leader", "main_admin"];

/**
 * Whether a piece may move, and what follows: within its week — free; to another week — a reason, and the
 * lead is told; out of the month — the tech admin / team leader / main admin only. A piece already past its
 * deadline moves only by them too, so a date can never be moved to escape a late week.
 */
export function moveCheck(args: {
  fromWeek: SmmPlanWeek | null;
  toWeek: SmmPlanWeek | "out";
  reason?: string | null;
  user: { role?: string } | null | undefined;
  /** The piece's deadline has passed and it is not live. */
  late?: boolean;
}): { scope: SmmMoveScope; problem: string; notifyLead: boolean } {
  const manager = MANAGERS.includes(args.user?.role || "");
  const reasonOk = (args.reason || "").trim().length >= SMM_MOVE_REASON_MIN;
  if (args.toWeek === "out") {
    if (!manager) return { scope: "out_of_month", problem: "Only the tech admin, a team leader or the main admin can move a piece out of the month.", notifyLead: false };
    return { scope: "out_of_month", problem: reasonOk ? "" : "Say why it leaves the month.", notifyLead: true };
  }
  if (args.fromWeek === args.toWeek) return { scope: "same_week", problem: "", notifyLead: false };
  if (args.late && !manager) {
    return { scope: "other_week", problem: "Its week has already ended — ask your team leader to move it.", notifyLead: false };
  }
  return { scope: "other_week", problem: reasonOk ? "" : "Say why it moves to another week — the lead is told.", notifyLead: true };
}
