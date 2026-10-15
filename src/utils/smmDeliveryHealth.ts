/**
 * SMM Delivery Control — the data health check, run on a month BEFORE it is switched on (2026-10-15, phase 0
 * of the plan in `.claude/rules/smm.md` §9.9).
 *
 * ── Why a check before the switch ───────────────────────────────────────────────────────────────
 * Delivery Control turns each client's month into weekly tasks with deadlines and escalates when they are
 * missed. Everything it decides comes from the month as the team typed it: the dates, the rows, the seats.
 * The owner's months carry hand-typed history — nine posts dated a month early (Dhana Lakshmi), months that
 * owe more rows than they have, posts marked Posted with no date, seats held by somebody who has left — and
 * an alert built on that would chase the wrong person for the wrong day on the first morning. So before a
 * month is switched on, this says in plain sentences what is wrong with it, what will be left out, and
 * what simply needs knowing. It changes nothing: hand-typed dates and titles are always kept.
 *
 * Severity: `block` — the month cannot be planned until it is fixed; `warn` — it can, but this will be
 * wrong or chased until fixed; `info` — worth knowing, nothing to fix.
 * State of a month: `excluded` (history, removed, deleted, finished, ended or on hold — never planned or
 * alerted), `blocked`, `setup` (nobody on it — one SETUP alert to the tech admin), `attention` (warnings),
 * `ready`.
 *
 * Pure: no React, no Firestore. The caller passes the company holidays (null when they could not be read)
 * and, when it has them, the people on the months (to spot a seat held by somebody deactivated).
 */
import { addDays, daysBetween, isPosted, lastOwnDay, postLinks } from "@/utils/smmPlan";
import { addMonthsIso, cyclePhase, dayLabel, hasTeam, isOnHold, shortDayLabel, SMM_SEATS, type SmmSeat } from "@/utils/smmPackage";
// Every year the app has dates for (2026, and 2027 since 2026-10-15 — FESTIVALS itself stays 2026-only for the sales dropdowns).
import { FESTIVAL_CALENDAR } from "@/utils/festivals";
import { SMM_CONTENT_KINDS, type SmmCampaign, type SmmContentItem, type SmmContentKind } from "@/types/smm";

export type SmmHealthSeverity = "block" | "warn" | "info";

export type SmmHealthCode =
  | "excluded"
  | "bad_dates"
  | "too_short"
  | "long_last_week"
  | "nothing_promised"
  | "not_set_up"
  | "starts_later"
  | "seat_empty"
  | "seat_inactive"
  | "owner_inactive"
  | "rows_missing"
  | "rows_extra"
  | "dates_outside"
  | "already_late"
  | "extra_incomplete"
  | "posted_no_date"
  | "posted_no_link"
  | "undated"
  | "carried"
  | "first_month"
  | "starts_on_day_off"
  | "holidays_unknown"
  | "festivals_missing";

export interface SmmHealthFinding {
  code: SmmHealthCode;
  severity: SmmHealthSeverity;
  /** One plain sentence for the screen. */
  message: string;
  /** The pieces it is about, when it is about pieces. */
  itemIds?: string[];
}

export type SmmHealthState = "excluded" | "blocked" | "setup" | "attention" | "ready";

export interface SmmMonthHealth {
  campaignId: string;
  name: string;
  state: SmmHealthState;
  /** Worst first: block, warn, info. */
  findings: SmmHealthFinding[];
}

export interface SmmHealthContext {
  /** yyyy-MM-dd, India time. */
  today: string;
  /** Announced company holidays (`holidays/{date}`); null when they could not be read. */
  holidays: ReadonlySet<string> | null;
  /** The people on the months, by uid — when given, a seat or a piece held by a deactivated person is flagged. */
  users?: ReadonlyMap<string, { isActive?: boolean; name?: string }>;
}

/** The weekly model's four weeks need at least 22 days (week 4 is day 22 → the day before the end date). */
export const SMM_HEALTH_MIN_MONTH_DAYS = 22;
/** Week 4 longer than this many days is said (a month typed longer than a calendar month). */
export const SMM_HEALTH_MAX_LAST_WEEK_DAYS = 10;
/** A client's first month: no post before this day of the month (owner's decision 2). */
export const SMM_FIRST_MONTH_FIRST_POST_DAY = 4;

const SEVERITY_ORDER: Record<SmmHealthSeverity, number> = { block: 0, warn: 1, info: 2 };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nameOf = (c: Pick<SmmCampaign, "businessName" | "clientName" | "id">) => c.businessName || c.clientName || c.id;
const isIso = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00`));
/** How a kind is said in a sentence — "videos", not the board's "AI Ads". */
const KIND_WORDS: Record<SmmContentKind, string> = { ai_ad: "video", poster: "poster", real_video: "real video" };
const kindWords = (kind: SmmContentKind, n: number) => plural(n, KIND_WORDS[kind]);

/** Why a month is never planned or alerted, or null when it may be. */
export function excludedReason(c: SmmCampaign, today: string): string | null {
  if (c.status === "deleted") return "Deleted — not part of Delivery Control.";
  if (c.status === "removed") return "Its order was removed — not part of Delivery Control.";
  if (c.history) return "Recorded after its dates (a past month) — not planned or alerted.";
  if (c.status === "completed" || c.status === "renewed" || c.status === "lapsed") return "Finished — not planned or alerted.";
  if (c.cycle && isIso(c.cycle.startDate) && isIso(c.cycle.endDate) && isOnHold(c, today)) {
    return `On hold — it ended on ${dayLabel(c.cycle.endDate)} and the renewal is not done. No production alerts, only the salesperson's renewal.`;
  }
  if (c.cycle && isIso(c.cycle.endDate) && cyclePhase(c.cycle, today) === "ended") return "Ended — not planned or alerted.";
  return null;
}

/** The health of one month. */
export function monthHealth(c: SmmCampaign, ctx: SmmHealthContext): SmmMonthHealth {
  const findings: SmmHealthFinding[] = [];
  const add = (code: SmmHealthCode, severity: SmmHealthSeverity, message: string, itemIds?: string[]) =>
    findings.push(itemIds?.length ? { code, severity, message, itemIds } : { code, severity, message });
  const done = (state: SmmHealthState): SmmMonthHealth => ({
    campaignId: c.id,
    name: nameOf(c),
    state,
    findings: findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
  });

  const excluded = excludedReason(c, ctx.today);
  if (excluded) {
    add("excluded", "info", excluded);
    return done("excluded");
  }

  /* ── Can it be planned at all? ─────────────────────────────────────────────────────────── */
  const start = c.cycle?.startDate;
  const end = c.cycle?.endDate;
  if (!isIso(start) || !isIso(end) || end <= start) {
    add("bad_dates", "block", "Its dates are missing or the end is not after the start — correct them in Edit setup.");
    return done("blocked");
  }
  const length = daysBetween(start, end);
  if (length < SMM_HEALTH_MIN_MONTH_DAYS) {
    add("too_short", "block", `It runs only ${plural(length, "day")} (${shortDayLabel(start)} → ${dayLabel(end)}) — four weeks need at least ${SMM_HEALTH_MIN_MONTH_DAYS}. Correct the end date in Edit setup.`);
  } else if (length - 21 > SMM_HEALTH_MAX_LAST_WEEK_DAYS) {
    add("long_last_week", "warn", `It runs ${length} days (${shortDayLabel(start)} → ${dayLabel(end)}), so week 4 is ${length - 21} days long. A month normally ends on the same date next month (${dayLabel(addMonthsIso(start, 1))}).`);
  }
  const commitments = c.commitments || ({} as SmmCampaign["commitments"]);
  const promised = SMM_CONTENT_KINDS.reduce((s, k) => s + (Number(commitments[k.key]) || 0), 0);
  if (promised <= 0) add("nothing_promised", "block", "Nothing is promised — no videos, posters or real videos to plan. Set the counts in Edit setup.");

  /* ── Who does the work ─────────────────────────────────────────────────────────────────── */
  const team = c.team;
  const noTeam = !hasTeam(team);
  if (noTeam) {
    add("not_set_up", "warn", "Nobody is on this month yet — the tech admin gets one SETUP alert until somebody is.");
  } else {
    const empty = (["creator", "publisher"] as SmmSeat[]).filter((s) => !team?.[s]?.uid);
    for (const seat of empty) {
      const label = SMM_SEATS.find((x) => x.seat === seat)?.label || seat;
      add("seat_empty", "warn", `Nobody holds "${label}" — its tasks would have no owner, so they go to the admins as "nobody owns".`);
    }
    if (ctx.users) {
      for (const { seat, label } of SMM_SEATS) {
        const holder = team?.[seat];
        if (holder?.uid && ctx.users.get(holder.uid)?.isActive === false) {
          add("seat_inactive", "warn", `${holder.name || "The person"} holds "${label}" but is deactivated — give the seat to somebody working.`);
        }
      }
    }
  }
  if (cyclePhase(c.cycle, ctx.today) === "upcoming") {
    add("starts_later", "info", `Starts on ${dayLabel(start)} — it is planned now, and nothing is due before its first day.`);
  }

  /* ── The rows ──────────────────────────────────────────────────────────────────────────── */
  const items: SmmContentItem[] = Array.isArray(c.items) ? c.items : [];
  const own = items.filter((i) => !i.extra);
  for (const k of SMM_CONTENT_KINDS) {
    const want = Number(commitments[k.key]) || 0;
    const have = own.filter((i) => i.kind === k.key).length;
    if (have < want) add("rows_missing", "warn", `${kindWords(k.key, want)} promised but only ${plural(have, "row")} — ${want - have} would be planned with no row to work on. Set the counts again in Edit setup to add the rows.`);
    if (have > want) add("rows_extra", "warn", `${plural(have, `${KIND_WORDS[k.key]} row`)} for ${want} promised — the ${have - want} beyond the promise are not counted. Mark ${have - want === 1 ? "it" : "them"} as extra work, or remove the untouched ones.`);
  }

  // The month's own days are start → the day BEFORE the end date: the end date is the renewal day, the next month's
  // first day (owner, 2026-10-15) — and week 4 ends the day before it. Read through the one helper every rule uses.
  const lastDay = lastOwnDay({ startDate: start, endDate: end });
  const outside = items.filter((i) => isIso(i.uploadDate) && (i.uploadDate! < start || i.uploadDate! > lastDay));
  if (outside.length) {
    add("dates_outside", "warn", `${plural(outside.length, "piece")} ${outside.length === 1 ? "is" : "are"} dated outside the month (${shortDayLabel(start)} → ${dayLabel(lastDay)}) — correct the date in the Content list, or it is planned in the wrong week.`, outside.map((i) => i.id));
  }

  const open = items.filter((i) => !isPosted(i));
  const late = open.filter((i) => isIso(i.uploadDate) && i.uploadDate! < ctx.today && i.uploadDate! >= start);
  if (late.length) {
    add("already_late", "warn", `${plural(late.length, "piece")} ${late.length === 1 ? "was" : "were"} due before today and ${late.length === 1 ? "is" : "are"} not live. ${late.length === 1 ? "It goes" : "They go"} to the Starting line — plan a catch-up or keep ${late.length === 1 ? "it" : "them"} as this month's pending work — and never escalate${late.length === 1 ? "s" : ""}.`, late.map((i) => i.id));
  }

  const extrasIncomplete = open.filter((i) => i.extra && (!isIso(i.uploadDate) || !(i.makerUid || i.publisherUid)));
  if (extrasIncomplete.length) {
    add("extra_incomplete", "warn", `${plural(extrasIncomplete.length, "piece")} of extra work ${extrasIncomplete.length === 1 ? "has" : "have"} no needed-by date or no owner — extra work keeps its own date, so give it both.`, extrasIncomplete.map((i) => i.id));
  }

  if (ctx.users) {
    const gone = open.filter((i) => [i.makerUid, i.publisherUid].some((uid) => uid && ctx.users!.get(uid)?.isActive === false));
    if (gone.length) {
      add("owner_inactive", "warn", `${plural(gone.length, "piece")} ${gone.length === 1 ? "is" : "are"} given to somebody deactivated — reassign ${gone.length === 1 ? "it" : "them"} or ${gone.length === 1 ? "it goes" : "they go"} to the admins as "nobody owns".`, gone.map((i) => i.id));
    }
  }

  const postedNoDate = items.filter((i) => isPosted(i) && !isIso(i.uploadDate));
  if (postedNoDate.length) {
    add("posted_no_date", "info", `${plural(postedNoDate.length, "posted piece")} ${postedNoDate.length === 1 ? "has" : "have"} no upload date — on time is then judged by when Posted was pressed.`, postedNoDate.map((i) => i.id));
  }
  const postedNoLink = items.filter((i) => isPosted(i) && postLinks(i).length === 0);
  if (postedNoLink.length) {
    add("posted_no_link", "info", `${plural(postedNoLink.length, "posted piece")} ${postedNoLink.length === 1 ? "has" : "have"} no link — from Live, Posted asks for a link for each account (or why there is none).`, postedNoLink.map((i) => i.id));
  }
  const undated = open.filter((i) => !i.extra && !isIso(i.uploadDate));
  if (undated.length) {
    add("undated", "info", `${plural(undated.length, "piece")} ${undated.length === 1 ? "has" : "have"} no date yet — the plan gives ${undated.length === 1 ? "it" : "each"} a week and suggests a day; the team still sets the real post date.`, undated.map((i) => i.id));
  }
  const carried = open.filter((i) => i.carriedFrom);
  if (carried.length) {
    add("carried", "info", `${plural(carried.length, "piece")} carried from last month ${carried.length === 1 ? "goes" : "go"} first, in week 1.`, carried.map((i) => i.id));
  }

  /* ── The calendar around it ────────────────────────────────────────────────────────────── */
  const firstMonth = !c.renewalOf && (Number(c.monthNumber) || 1) <= 1;
  if (firstMonth) {
    add("first_month", "info", `The client's first month: the first post is not before ${dayLabel(addDays(start, SMM_FIRST_MONTH_FIRST_POST_DAY - 1))}, so week 1's pieces share fewer working days.`);
  }
  const startDay = new Date(`${start}T00:00:00`).getDay();
  if (startDay === 0) add("starts_on_day_off", "info", `It starts on a Sunday (${dayLabel(start)}) — week 1's first working day is the Monday.`);
  else if (ctx.holidays?.has(start)) add("starts_on_day_off", "info", `It starts on a company holiday (${dayLabel(start)}) — week 1 begins on the next working day.`);
  if (ctx.holidays === null) {
    add("holidays_unknown", "warn", "Company holidays could not be read — only Sundays are skipped until they can.");
  }
  const lastYear = Number(end.slice(0, 4));
  const missingYears: number[] = [];
  for (let y = Number(start.slice(0, 4)); y <= lastYear; y++) {
    if (!FESTIVAL_CALENDAR.some((f) => f.date.startsWith(`${y}-`))) missingYears.push(y);
  }
  if (missingYears.length) {
    add("festivals_missing", "info", `Festival dates for ${missingYears.join(" and ")} are not in the app yet — no festival post is placed on those days until they are added.`);
  }

  const has = (s: SmmHealthSeverity) => findings.some((f) => f.severity === s);
  if (has("block")) return done("blocked");
  if (noTeam) return done("setup");
  return done(has("warn") ? "attention" : "ready");
}

export interface SmmHealthSummary {
  months: SmmMonthHealth[];
  counts: Record<SmmHealthState, number>;
}

/** Every month, worst first (blocked, setup, attention, ready, excluded), then by name. */
export function deliveryHealth(campaigns: readonly SmmCampaign[], ctx: SmmHealthContext): SmmHealthSummary {
  const order: Record<SmmHealthState, number> = { blocked: 0, setup: 1, attention: 2, ready: 3, excluded: 4 };
  const months = campaigns.map((c) => monthHealth(c, ctx)).sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
  const counts: Record<SmmHealthState, number> = { blocked: 0, setup: 0, attention: 0, ready: 0, excluded: 0 };
  for (const m of months) counts[m.state] += 1;
  return { months, counts };
}
