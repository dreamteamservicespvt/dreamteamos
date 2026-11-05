/**
 * Pausing a running SMM month (owner, 2026-11-05) — the pure rules.
 *
 * ── Why a pause exists ─────────────────────────────────────────────────────────────────────────
 * A client sometimes says mid-month "hold the work for some days". Before, the month's clock kept
 * running (the client lost paid days), Delivery Control and the 11 AM / 5 PM check kept chasing work
 * nobody may do, the renewal rang on the old date, and nothing recorded who stopped it or why. This
 * reverses the 2026-10-15 decision "no mid-month pause" (smm.md). The word on screen is **Paused** —
 * "On hold" already means "ended, renewal undecided".
 *
 * ── The rules (owner's instruction "make yourself the best decision", taken 2026-11-05) ────────
 *   1. Paused days are not the client's paid days: the renewal day (`cycle.endDate`) moves forward by
 *      exactly the paused days; the amount stays.
 *   2. A pause has a start day (today or later) and a REQUIRED restart day; paused days are
 *      from … until − 1. "Paused now" is derived, so the restart needs no write and no scheduler.
 *   3. A reason is required (a note for "Other"); the client's message screenshot is optional.
 *   4. At most `SMM_PAUSE_MAX_DAYS` paused days in a month (all its pauses together); only the main /
 *      tech admin may go past it (`canExceed`).
 *   5. Only a running month (or one not started yet) can be paused, never from its renewal day on,
 *      and never once its next month exists (that month's dates would overlap).
 *
 * ── Why it is written without the `@/` alias ─────────────────────────────────────────────────────
 * `utils/smmCadence` imports it, and the server checker (`api/smm-monitor.ts`) runs smmCadence as Node
 * ESM, which cannot resolve the alias and needs `.js` on every runtime import. So it imports only
 * types and keeps its own two-line date helpers (smmCadence imports this file, not the other way round).
 */
import type { SmmCampaign, SmmPause, SmmPauseReason, SmmPauseRecord } from "../types/smm.js";

export const SMM_PAUSE_MAX_DAYS = 15;
/** Earlier pauses kept on the month. */
export const SMM_PAUSE_HISTORY_LIMIT = 10;

export const SMM_PAUSE_REASONS: ReadonlyArray<{ key: SmmPauseReason; label: string }> = [
  { key: "client_asked", label: "Client asked" },
  { key: "festival", label: "Festival / function" },
  { key: "payment_pending", label: "Payment pending" },
  { key: "shop_closed", label: "Shop closed / renovation" },
  { key: "other", label: "Other" },
];

export const pauseReasonLabel = (k: SmmPauseReason | string | null | undefined): string =>
  SMM_PAUSE_REASONS.find((r) => r.key === k)?.label || "Other";

/* ── Days (yyyy-MM-dd, UTC arithmetic — the same as smmCadence) ─────────────────────────────── */

const DAY_MS = 86_400_000;
const isDay = (d: unknown): d is string => {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
};
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d: string, n: number) => new Date(utc(d) + n * DAY_MS).toISOString().slice(0, 10);
const between = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY_MS);

type PauseHolder = Pick<SmmCampaign, "pause" | "pauses">;
type PauseMonth = PauseHolder & Pick<SmmCampaign, "cycle" | "status" | "history" | "renewal">;

/** Paused days of one pause: from … until − 1 (0 when broken). */
export function pauseDays(from: string, until: string): number {
  return isDay(from) && isDay(until) && until > from ? between(from, until) : 0;
}

/** The renewal day once this pause is applied to the renewal day it had before. */
export function endAfterPause(endBefore: string, from: string, until: string): string {
  return addDays(endBefore, pauseDays(from, until));
}

const validPause = (p: SmmPause | null | undefined): p is SmmPause =>
  !!p && isDay(p.from) && isDay(p.until) && p.until > p.from;

/** The pause in force today (from ≤ today < until), or null. */
export function activePause(c: PauseHolder, today: string): SmmPause | null {
  const p = c.pause;
  return validPause(p) && p.from <= today && today < p.until ? p : null;
}

/** A pause that starts later (today < from), or null. */
export function upcomingPause(c: PauseHolder, today: string): SmmPause | null {
  const p = c.pause;
  return validPause(p) && today < p.from ? p : null;
}

/** The month's current pause has run out (until ≤ today) and belongs in `pauses[]`. */
export function pauseIsOver(c: PauseHolder, today: string): boolean {
  const p = c.pause;
  return validPause(p) && p.until <= today;
}

/**
 * Every paused day of the month — earlier pauses and the current / upcoming one — sorted, each once.
 * Delivery Control treats these as days off, so the weeks re-spread over the days left.
 */
export function pausedDaysOf(c: PauseHolder): string[] {
  const set = new Set<string>();
  const add = (from: string, until: string) => {
    const n = pauseDays(from, until);
    for (let i = 0; i < n && i < 400; i++) set.add(addDays(from, i));
  };
  for (const r of c.pauses || []) if (r) add(r.from, r.endedOn || r.until);
  if (validPause(c.pause)) add(c.pause.from, c.pause.until);
  return [...set].sort();
}

export const pausedTotal = (c: PauseHolder): number => pausedDaysOf(c).length;

/** Paused days already used by earlier pauses (the current one left out). */
const earlierPausedDays = (c: PauseHolder): number => pausedDaysOf({ pauses: c.pauses, pause: null }).length;

/* ── Checks: a sentence when refused, null when it may go ahead ─────────────────────────────── */

export interface PauseInput {
  from: string;
  until: string;
  reasonKind: SmmPauseReason | "" | null | undefined;
  note?: string | null;
}

export interface PauseCtx {
  today: string;
  /** The main / tech admin — may go past `SMM_PAUSE_MAX_DAYS`. */
  canExceed?: boolean;
}

const fmt = (d: string): string => {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1];
  return `${Number(d.slice(8, 10))} ${m}`;
};
export const pauseDayLabel = (d: string): string => (isDay(d) ? fmt(d) : d);

/** Why this month cannot be paused at all (before any dates), or null. */
export function monthPauseBlock(c: PauseMonth, today: string): string | null {
  if (c.status !== "active" || c.history) return "Only a running month can be paused.";
  const start = c.cycle?.startDate;
  const end = c.cycle?.endDate;
  if (!isDay(start) || !isDay(end) || end <= start) return "This month's dates are missing — fix them with Edit setup first.";
  if (today >= end) return "This month has ended — it cannot be paused.";
  if (c.renewal?.nextCampaignId) return "Its next month already exists; move that month's dates first.";
  return null;
}

const capProblem = (used: number, adding: number, ctx: PauseCtx): string | null => {
  if (ctx.canExceed || used + adding <= SMM_PAUSE_MAX_DAYS) return null;
  const left = Math.max(0, SMM_PAUSE_MAX_DAYS - used);
  return `A month can be paused for at most ${SMM_PAUSE_MAX_DAYS} days in all (${left} left). Only the main admin or the tech admin can go past it.`;
};

/** Can this new pause be set? */
export function pauseProblem(c: PauseMonth, input: PauseInput, ctx: PauseCtx): string | null {
  const block = monthPauseBlock(c, ctx.today);
  if (block) return block;
  if (validPause(c.pause) && !pauseIsOver(c, ctx.today)) return "This month is already paused — change its restart day instead.";
  const { from, until } = input;
  if (!isDay(from)) return "Pick the first paused day.";
  if (!isDay(until)) return "Pick the day work restarts.";
  if (from < ctx.today) return "A pause cannot start in the past.";
  if (from < c.cycle.startDate) return `A pause cannot start before the month does (${fmt(c.cycle.startDate)}).`;
  if (from >= c.cycle.endDate) return `A pause must start before the renewal day (${fmt(c.cycle.endDate)}).`;
  if (until <= from) return "The restart day must be after the first paused day.";
  if (!input.reasonKind) return "Pick why the month is paused.";
  if (input.reasonKind === "other" && String(input.note || "").trim().length < 3) return "Write why the month is paused.";
  return capProblem(earlierPausedDays(c), pauseDays(from, until), ctx);
}

/**
 * Can the current / upcoming pause restart on `until` instead? Restart today = resume now. A restart on
 * (or before) its first day is "cancel the pause" — `cancelPauseProblem`.
 */
export function restartProblem(c: PauseMonth, until: string, ctx: PauseCtx): string | null {
  const p = c.pause;
  if (!validPause(p) || pauseIsOver(c, ctx.today)) return "This month is not paused.";
  if (c.renewal?.nextCampaignId) return "Its next month already exists; move that month's dates first.";
  if (!isDay(until)) return "Pick the day work restarts.";
  if (until < ctx.today) return "The restart day cannot be in the past.";
  if (until <= p.from) return "The restart day must be after the first paused day — or cancel the pause.";
  return capProblem(earlierPausedDays(c), pauseDays(p.from, until), ctx);
}

/** Can the pause be cancelled outright (no paused day kept)? Only before it starts, or on its first day. */
export function cancelPauseProblem(c: PauseHolder, today: string): string | null {
  const p = c.pause;
  if (!validPause(p) || pauseIsOver(c, today)) return "This month is not paused.";
  if (today > p.from) return "The pause has already started — resume it instead.";
  return null;
}

/* ── Records and sentences ──────────────────────────────────────────────────────────────────── */

/** The current pause as a record for `pauses[]` (newest last, capped). */
export function closedPauses(c: PauseHolder, endedOn: string, endedByName?: string | null): SmmPauseRecord[] {
  const list = [...(c.pauses || [])];
  const p = c.pause;
  if (validPause(p)) {
    const until = endedOn < p.until ? endedOn : p.until;
    const days = pauseDays(p.from, until);
    if (days > 0) list.push({ ...p, until, days, endedOn: until, endedByName: endedByName ?? null });
  }
  return list.slice(-SMM_PAUSE_HISTORY_LIMIT);
}

const range = (from: string, lastDay: string): string => {
  if (from === lastDay) return fmt(from);
  return from.slice(0, 7) === lastDay.slice(0, 7)
    ? `${Number(from.slice(8, 10))}–${fmt(lastDay)}`
    : `${fmt(from)}–${fmt(lastDay)}`;
};

/**
 * "Paused 10–14 Nov · back on 15 Nov · renewal moved to 11 Dec" (now) /
 * "Pauses 10–14 Nov · back on 15 Nov · renewal moved to 11 Dec" (upcoming) / null.
 */
export function pauseSentence(c: PauseHolder & Pick<SmmCampaign, "cycle">, today: string): string | null {
  const p = activePause(c, today) || upcomingPause(c, today);
  if (!p) return null;
  const verb = p.from <= today ? "Paused" : "Pauses";
  const renewal = isDay(c.cycle?.endDate) ? ` · renewal moved to ${fmt(c.cycle.endDate)}` : "";
  return `${verb} ${range(p.from, addDays(p.until, -1))} · back on ${fmt(p.until)}${renewal}`;
}

/** One short reason line: "Client asked — shop painting". */
export function pauseReasonLine(p: Pick<SmmPause, "reasonKind" | "note">): string {
  const note = String(p.note || "").trim();
  return note ? `${pauseReasonLabel(p.reasonKind)} — ${note}` : pauseReasonLabel(p.reasonKind);
}

/* ── Who, and what a pause writes (pure — `services/smmPause` runs these inside one transaction) ── */

type PauseUser = { uid?: string | null; role?: string | null } | null | undefined;

/** The SMM admins by role (`smmPlan.isSmmAdmin`'s list, kept here so this file stays alias-free). */
const PAUSE_ADMIN_ROLES = ["main_admin", "tech_admin", "sales_admin", "tech_team_leader"];

/**
 * Who may pause, resume or change a pause (decision 3): the month's salesperson — it is their client's
 * request — and the SMM admins. Not the members, not the view-only Social Media Team Lead.
 */
export function canPauseMonth(user: PauseUser, month: Pick<SmmCampaign, "soldBy">): boolean {
  if (!user?.uid) return false;
  return PAUSE_ADMIN_ROLES.includes(user.role || "") || month.soldBy === user.uid;
}

/** Only the main admin and the tech admin may pause past `SMM_PAUSE_MAX_DAYS` (decision 5). */
export const canExceedPauseCap = (user: PauseUser): boolean => user?.role === "main_admin" || user?.role === "tech_admin";

type PauseItem = SmmCampaign["items"][number] & { plan?: { fixedReason?: string | null; fixedDate?: string | null; suggestedDate?: string | null } | null };

/**
 * Every piece not posted yet dated on or after `fromDay` moves `delta` days (the plan's dates too), so
 * the work the client paused is waiting when they restart. Posted pieces and festival posts keep their
 * day — a Diwali post is due on Diwali, paused or not. `delta` 0 → the same array.
 */
export function shiftItemsForPause<T extends PauseItem>(items: T[], fromDay: string, delta: number): T[] {
  if (!delta) return items;
  const move = (d: string | null | undefined) => (isDay(d) && d >= fromDay ? addDays(d, delta) : d);
  return items.map((it) => {
    if (it.status === "posted" || it.plan?.fixedReason === "festival") return it;
    const uploadDate = move(it.uploadDate);
    const plan = it.plan
      ? { ...it.plan, ...(it.plan.fixedDate ? { fixedDate: move(it.plan.fixedDate) } : {}), ...(it.plan.suggestedDate ? { suggestedDate: move(it.plan.suggestedDate) } : {}) }
      : it.plan;
    if (uploadDate === it.uploadDate && plan === it.plan) return it;
    return { ...it, uploadDate: uploadDate ?? it.uploadDate, ...(it.plan ? { plan } : {}) };
  });
}

export interface PauseActor { uid: string; name: string; role?: string | null }
export type PausePatch = Pick<SmmCampaign, "cycle" | "items"> & { pause: SmmPause | null; pauses: SmmPauseRecord[] | null };

/** The month after a new pause — or throws the refusal sentence. */
export function pausePatch(
  c: PauseMonth & Pick<SmmCampaign, "items" | "soldBy">,
  input: PauseInput & { proofUrl?: string | null },
  actor: PauseActor,
  today: string,
  at: number,
): PausePatch {
  if (!canPauseMonth(actor, c)) throw new Error("Only the month's salesperson or an admin can pause it.");
  const problem = pauseProblem(c, input, { today, canExceed: canExceedPauseCap(actor) });
  if (problem) throw new Error(problem);
  // A finished pause still sitting in `pause` goes to the record first.
  const pauses = pauseIsOver(c, today) ? closedPauses(c, c.pause!.until) : (c.pauses || null);
  const days = pauseDays(input.from, input.until);
  const pause: SmmPause = {
    from: input.from, until: input.until, reasonKind: input.reasonKind as SmmPauseReason,
    note: String(input.note || "").trim() || null, proofUrl: input.proofUrl || null,
    endBefore: c.cycle.endDate, at, byUid: actor.uid, byName: actor.name,
  };
  return {
    cycle: { ...c.cycle, endDate: endAfterPause(c.cycle.endDate, input.from, input.until) },
    items: shiftItemsForPause(c.items, input.from, days),
    pause,
    pauses,
  };
}

/** The month after "restart on `until`" (resume now = today; extend = later) — or throws. */
export function restartPatch(
  c: PauseMonth & Pick<SmmCampaign, "items" | "soldBy">,
  until: string,
  actor: PauseActor,
  today: string,
): PausePatch {
  if (!canPauseMonth(actor, c)) throw new Error("Only the month's salesperson or an admin can change the pause.");
  const problem = restartProblem(c, until, { today, canExceed: canExceedPauseCap(actor) });
  if (problem) throw new Error(problem);
  const p = c.pause!;
  const delta = between(p.until, until);
  const items = shiftItemsForPause(c.items, p.until, delta);
  const cycle = { ...c.cycle, endDate: endAfterPause(p.endBefore, p.from, until) };
  // Restarting today ends the pause now: it goes to the record. A later restart keeps it current.
  if (until <= today) return { cycle, items, pause: null, pauses: closedPauses(c, until, actor.name) };
  return { cycle, items, pause: { ...p, until }, pauses: c.pauses || null };
}

/** The month with an upcoming (or first-day) pause taken back as if it never was — or throws. */
export function cancelPausePatch(
  c: PauseMonth & Pick<SmmCampaign, "items" | "soldBy">,
  actor: PauseActor,
  today: string,
): PausePatch {
  if (!canPauseMonth(actor, c)) throw new Error("Only the month's salesperson or an admin can cancel the pause.");
  const problem = cancelPauseProblem(c, today);
  if (problem) throw new Error(problem);
  const p = c.pause!;
  return {
    cycle: { ...c.cycle, endDate: p.endBefore },
    items: shiftItemsForPause(c.items, p.until, -pauseDays(p.from, p.until)),
    pause: null,
    pauses: c.pauses || null,
  };
}
