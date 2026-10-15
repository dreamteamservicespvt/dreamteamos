/**
 * SMM Delivery Control — what a person's ANSWER changes on a piece, as pure rules (2026-10-15, phase 3 of the
 * plan in `.claude/rules/smm.md` §9.9).
 *
 * ── Why the answers are rules of their own ──────────────────────────────────────────────────────
 * The supervisor (`utils/smmMonitor`) never writes: an alert is quieted only by what a PERSON records —
 * "Do it now" / "Need more time" (`eta`), "Blocked" (`blocker`), a late reason, a move to another week, a
 * reassign, the footage in, a posted link. `services/smmDelivery` saves those inside the month's one
 * transaction (`smm.mutateCampaign`); everything it decides — who may answer, what the new field holds,
 * which history list it joins and how long that list may grow — is here, so the screens, the check-out step
 * and the tests ask the same question. Nothing here reads Firestore or React.
 *
 * ── The limits that keep the loops out (the plan's pre-mortem) ──────────────────────────────────
 *   • Every history list on a piece is capped at `SMM_DELIVERY_ITEM_HISTORY_LIMIT` (10) — a month document
 *     already carries thirty pieces and the ad reports, under Firestore's 1 MiB.
 *   • "Do it now" renews once a day; "Need more time" is today only and at most twice a piece; neither runs
 *     past the deadline (`smmMonitor.etaCheck`).
 *   • A block expires after 24 h unless the person who must clear it confirms it.
 *   • A 3rd reassign needs an admin (`smmMonitor.reassignCheck`); a move to another week needs a reason and
 *     the lead is told; out of the month only the managers (`smmCadence.moveCheck`).
 *   • The plan is written ONCE, when a month is switched on; only rows the planner placed (`by: "auto"`) are
 *     ever re-planned, and only when a manager asks.
 *
 * Written without the `@/` alias, like the rules it builds on, so the server checker could reuse it.
 */
import type { SmmCampaign, SmmContentItem, SmmPlatform } from "../types/smm";
import type {
  SmmApprovalProof, SmmApprovalVia, SmmBlockerKind, SmmDeliverySettings, SmmEtaKind, SmmFootageState, SmmItemBlocker, SmmItemEta,
  SmmItemLateReason, SmmItemMove, SmmItemPlan, SmmItemReassign, SmmLateStep, SmmMonthDelivery, SmmPlanWeek,
} from "../types/smmDelivery";
import { SMM_DELIVERY_ITEM_HISTORY_LIMIT } from "../types/smmDelivery";
import { DEFAULT_SMM_DELIVERY } from "./smmDeliverySettings";
import {
  istDay, planMonth, taskProgress, toMs, type SmmDeliveryItem, type SmmDeliveryMonth, type SmmHolidays, type SmmMonthPlan,
  type SmmPlannedTask, type SmmTaskProgress,
} from "./smmCadence";
import { etaCheck } from "./smmMonitor";

/** Who did it — the services read it from the auth store. */
export interface SmmDeliveryActor {
  uid: string;
  name: string;
  role?: string;
  smmLeader?: boolean;
}

/* ── Who may do what ──────────────────────────────────────────────────────────────────────────── */

/** The people who manage months (switch one on, re-plan, move out of a month, reassign): the plan's "managers". */
export const SMM_DELIVERY_MANAGER_ROLES = ["tech_admin", "tech_team_leader", "main_admin"] as const;

export function isDeliveryManager(user: { role?: string } | null | undefined): boolean {
  return (SMM_DELIVERY_MANAGER_ROLES as readonly string[]).includes(user?.role || "");
}

/** On the month: a seat, `watchers`, or its salesperson — the same answer as `smmPlan.isAssignedToSmm` + `soldBy`. */
export function isOnMonth(month: Pick<SmmCampaign, "team" | "watchers" | "soldBy">, uid: string | null | undefined): boolean {
  if (!uid) return false;
  if (month.watchers?.includes(uid) || month.soldBy === uid) return true;
  const t = month.team;
  return [t?.creator?.uid, t?.publisher?.uid, t?.marketer?.uid, ...(t?.assistants || []).map((a) => a.uid)].includes(uid);
}

/**
 * May this person answer for this piece ("Do it now", "Need more time", "Blocked", a late reason)? The owner
 * of the step it is on — the maker while it is being made, the publisher once approved — anybody holding a
 * seat on the month, and the managers. The view-only Social Media Team Lead answers only on months she is on
 * (her other answers go to her own `smm_alert_state`); the service guard says the same.
 */
export function mayAnswerForPiece(
  month: Pick<SmmCampaign, "team" | "watchers" | "soldBy">,
  item: Pick<SmmContentItem, "makerUid" | "publisherUid">,
  user: SmmDeliveryActor | null | undefined,
): boolean {
  if (!user?.uid) return false;
  if (isDeliveryManager(user)) return true;
  if (item.makerUid === user.uid || item.publisherUid === user.uid) return true;
  return isOnMonth(month, user.uid);
}

/** Switching a month on, re-planning it, catching its Starting line up: the managers only. */
export function switchOnProblem(
  month: SmmDeliveryMonth,
  plan: SmmMonthPlan,
  user: SmmDeliveryActor | null | undefined,
): string {
  if (!isDeliveryManager(user)) return "Only the tech admin, a team leader or the main admin can switch a month on.";
  if (plan.exclusion) return EXCLUSION_WORDS[plan.exclusion];
  if (plan.problem === "bad_dates") return "Its dates are missing or wrong — fix them in Edit setup first.";
  if (plan.problem === "too_short") return "It is shorter than 22 days, so it cannot be split into four weeks.";
  if (plan.problem === "nothing_promised") return "It promises no videos or posters yet — set its counts in Edit setup.";
  if (!month.team?.creator?.uid && !month.team?.publisher?.uid) return "Nobody is on it yet — set up its team first.";
  return "";
}

export const EXCLUSION_WORDS: Record<NonNullable<SmmMonthPlan["exclusion"]>, string> = {
  deleted: "This month was deleted.",
  removed: "This month was taken off the board.",
  history: "This is a past (history) month — it is never chased.",
  finished: "This month is finished.",
  on_hold: "This month ended without a renewal decision (On hold) — only the salesperson's renewal runs.",
  ended: "This month has ended.",
};

/* ── The stamps the classic writes leave (phase 3) ───────────────────────────────────────────── */

const RANK: Record<string, number> = { planned: 0, in_progress: 1, awaiting_approval: 2, changes_requested: 2, approved: 3, scheduled: 4, posted: 5 };

/**
 * What a stage change stamps on a piece, once: `startedAt` the first time it leaves "Planned", `madeAt` the
 * first time it is sent to the client (the "sent" checkpoint reads it — before this the only clue was
 * `approval.askedAt`, which a chase also sets). Called by `smm.setItemStatus` / `smm.requestApproval`, so the
 * classic board's own buttons feed Delivery Control without a second write. ms, never overwritten.
 */
export function statusStamps(
  item: object,
  status: string,
  now: number,
): Partial<Pick<SmmDeliveryItem, "startedAt" | "madeAt">> {
  // Typed loosely: the classic `SmmContentItem` does not declare these fields (they live in types/smmDelivery).
  const it = item as Pick<SmmDeliveryItem, "startedAt" | "madeAt">;
  const out: Partial<Pick<SmmDeliveryItem, "startedAt" | "madeAt">> = {};
  const rank = RANK[status] ?? 0;
  if (rank >= 1 && it.startedAt == null) out.startedAt = now;
  if (rank >= 2 && it.madeAt == null) out.madeAt = now;
  return out;
}

/** A client asking for changes is one more revision (the 3rd tells the salesperson and an admin). */
export function revisionStamp(item: object, approved: boolean): Partial<Pick<SmmDeliveryItem, "revisions">> {
  return approved ? {} : { revisions: (Number((item as Pick<SmmDeliveryItem, "revisions">).revisions) || 0) + 1 };
}

/* ── History lists ───────────────────────────────────────────────────────────────────────────── */

/** The list with `entry` added at the end, keeping the newest `limit` (the 1 MiB month document). */
export function withCap<T>(list: readonly T[] | null | undefined, entry: T, limit = SMM_DELIVERY_ITEM_HISTORY_LIMIT): T[] {
  const out = [...(list || []), entry];
  return out.length > limit ? out.slice(out.length - limit) : out;
}

/* ── Switching a month on ─────────────────────────────────────────────────────────────────────── */

/**
 * The plan saved on each piece when a month is switched on — ONLY for pieces the planner placed (carried or
 * "auto"). A piece the team already dated keeps reading its own date (a later change of that date must move
 * it, which a saved week would stop), a fixed date or a saved plan is kept as it is, and rows beyond the
 * promise and extra work get nothing (they are never counted). `uploadDate` is never written.
 */
export function activationItems(
  month: SmmDeliveryMonth,
  plan: SmmMonthPlan,
  by: string,
  now: number,
): { items: SmmDeliveryItem[]; planned: number } {
  const placed = new Map(plan.tasks.filter((t) => t.counted && t.week && (t.source === "auto" || t.source === "carried")).map((t) => [t.itemId, t]));
  let planned = 0;
  const items = (month.items || []).map((it) => {
    const t = placed.get(it.id);
    if (!t || it.plan) return it;
    planned += 1;
    const p: SmmItemPlan = { week: t.week as SmmPlanWeek, suggestedDate: t.suggestedDate || null, plannedAt: now, by };
    return { ...it, plan: p };
  });
  return { items, planned };
}

/** The month's `delivery` stamp: when it was switched on — lateness that existed then is the Starting line. */
export function deliveryStamp(actor: SmmDeliveryActor, now: number): SmmMonthDelivery {
  return { activatedAt: now, activatedByName: actor.name, baselineAt: now, rule: "front_back_v1" };
}

/**
 * Re-planning, on purpose: only pieces the planner placed (`plan.by === "auto"`) lose their plan and are placed
 * again; a week a person chose, a fixed date, the team's own dates and accepted titles stay. An accepted
 * title/idea on an auto row is carried onto its new plan.
 */
export function replanItems(
  month: SmmDeliveryMonth,
  ctx: { today: string; holidays: SmmHolidays; settings?: SmmDeliverySettings },
  now: number,
): { items: SmmDeliveryItem[]; planned: number } {
  const kept = new Map<string, SmmItemPlan>();
  const stripped = (month.items || []).map((it) => {
    if (it.plan?.by !== "auto") return it;
    kept.set(it.id, it.plan);
    return { ...it, plan: null };
  });
  const bare = { ...month, items: stripped };
  const plan = planMonth(bare, { today: ctx.today, holidays: ctx.holidays, settings: ctx.settings });
  const { items, planned } = activationItems(bare, plan, "auto", now);
  return {
    planned,
    items: items.map((it) => {
      const before = kept.get(it.id);
      if (!before || !it.plan) return it;
      return { ...it, plan: { ...it.plan, title: before.title ?? null, idea: before.idea ?? null, caption: before.caption ?? null, hashtags: before.hashtags ?? null } };
    }),
  };
}

/* ── Answers ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * "Do it now" (focus) or "Need more time": the new `eta`, or the sentence why not (`smmMonitor.etaCheck`).
 * Counters: "Do it now" counts per India day (renewed once), "Need more time" per piece, ever.
 */
export function etaAnswer(args: {
  kind: SmmEtaKind;
  item: Pick<SmmDeliveryItem, "eta">;
  deadlineAt: number | null;
  actor: SmmDeliveryActor;
  now: number;
  settings?: SmmDeliverySettings;
}): { problem: string; eta: SmmItemEta | null } {
  const { kind, item, actor, now } = args;
  const check = etaCheck({ kind, eta: item.eta, now, deadlineAt: args.deadlineAt, settings: args.settings });
  if (check.problem || check.until == null) return { problem: check.problem || "Not possible now.", eta: null };
  const today = istDay(now);
  const prev = item.eta;
  const focusUsed = kind === "focus" ? (prev?.day === today ? prev.focusUsed || 0 : 0) + 1 : prev?.day === today ? prev?.focusUsed || 0 : 0;
  const moreTimeUsed = (prev?.moreTimeUsed || 0) + (kind === "more_time" ? 1 : 0);
  return {
    problem: "",
    eta: { kind, until: check.until, at: now, day: today, byUid: actor.uid, byName: actor.name, focusUsed, moreTimeUsed },
  };
}

/** The blocker kinds, in the words the owner sees (the plan's "Blocked" list). */
export const SMM_BLOCKER_KINDS: { key: SmmBlockerKind; label: string; who: string }[] = [
  { key: "client_approval", label: "Waiting for the client's approval", who: "the salesperson" },
  { key: "client_footage", label: "Waiting for the client's footage", who: "the salesperson" },
  { key: "page_access", label: "No access to the client's page", who: "the salesperson" },
  { key: "flow_credits", label: "Out of Flow credits", who: "the tech admin" },
  { key: "on_leave", label: "I'm on leave", who: "the team lead" },
  { key: "other", label: "Something else", who: "the team lead" },
];

export const SMM_BLOCKER_NOTE_MAX = 200;

export function blockerAnswer(args: {
  kind: SmmBlockerKind;
  note?: string | null;
  actor: SmmDeliveryActor;
  now: number;
  settings?: SmmDeliverySettings;
}): { problem: string; blocker: SmmItemBlocker | null } {
  const note = (args.note || "").trim().slice(0, SMM_BLOCKER_NOTE_MAX);
  if (args.kind === "other" && note.length < 5) return { problem: "Say what is in the way.", blocker: null };
  const hours = (args.settings || DEFAULT_SMM_DELIVERY).ladder.blockHours;
  return {
    problem: "",
    blocker: {
      kind: args.kind, note: note || null, since: args.now, byUid: args.actor.uid, byName: args.actor.name,
      expiresAt: args.now + hours * 3_600_000, confirmedByUid: null, confirmedAt: null,
    },
  };
}

/** One-tap reasons for "why not done", per step (the alert's answer and the check-out step). */
export const SMM_LATE_REASONS: Record<SmmLateStep, string[]> = {
  footage: ["Client has not sent it", "Client sent unusable footage", "Client is travelling / busy", "Other"],
  send: [
    "Too much work today", "Waiting for the client's material", "Flow credits ran out", "Gemini / the studio was down",
    "Client changed the brief", "I was on leave", "Other",
  ],
  approved: ["Client has not replied", "Client asked for changes", "Client is travelling / busy", "Other"],
  live: ["No page access", "Waiting for the posting time", "Forgot to post", "Client asked to hold it", "Other"],
};

export function lateReasonAnswer(args: {
  step: SmmLateStep;
  reason: string;
  note?: string | null;
  newTime?: number | null;
  actor: SmmDeliveryActor;
  now: number;
}): { problem: string; entry: SmmItemLateReason | null } {
  const reason = (args.reason || "").trim();
  const note = (args.note || "").trim().slice(0, SMM_BLOCKER_NOTE_MAX);
  if (!reason) return { problem: "Pick a reason.", entry: null };
  if (reason === "Other" && note.length < 5) return { problem: "Say why in a few words.", entry: null };
  if (args.newTime != null && args.newTime <= args.now) return { problem: "The new time must be later than now.", entry: null };
  return {
    problem: "",
    entry: { step: args.step, reason, note: note || null, newTime: args.newTime ?? null, at: args.now, byUid: args.actor.uid, byName: args.actor.name },
  };
}

/** The late step a piece is on — what a "why not done" answers. */
export function lateStepOf(p: Pick<SmmTaskProgress, "step" | "firstMissed">): SmmLateStep {
  if (p.step === "footage") return "footage";
  if (p.step === "make") return "send";
  if (p.step === "approve") return "approved";
  if (p.step === "post") return "live";
  return p.firstMissed || "live";
}

/* ── Moves and reassigns ──────────────────────────────────────────────────────────────────────── */

export function moveEntry(fromWeek: SmmPlanWeek, toWeek: SmmPlanWeek | "out", reason: string, actor: SmmDeliveryActor, now: number): SmmItemMove {
  return { fromWeek, toWeek, reason: reason.trim(), at: now, byUid: actor.uid, byName: actor.name };
}

/**
 * The piece's new plan after a move to another week (or to a day the client asked for, which IS its deadline).
 * A person placed it, so it is never re-planned (`by` = their uid). Accepted titles stay.
 */
export function movedPlan(item: Pick<SmmDeliveryItem, "plan">, toWeek: SmmPlanWeek, actor: SmmDeliveryActor, now: number, clientDay?: string | null): SmmItemPlan {
  return {
    ...(item.plan || {}),
    week: toWeek,
    suggestedDate: null,
    fixedDate: clientDay || null,
    fixedReason: clientDay ? "client_asked" : null,
    plannedAt: now,
    by: actor.uid,
  };
}

export function reassignEntry(seat: "maker" | "publisher", fromUid: string | null | undefined, toUid: string, actor: SmmDeliveryActor, now: number): SmmItemReassign {
  return { seat, fromUid: fromUid || null, toUid, at: now, byUid: actor.uid, byName: actor.name };
}

/* ── Footage, approval, posting ──────────────────────────────────────────────────────────────── */

export const SMM_FOOTAGE_STATES: { key: SmmFootageState; label: string }[] = [
  { key: "needed", label: "Footage needed" },
  { key: "received", label: "Footage received" },
  { key: "unusable", label: "Footage unusable — asked again" },
  { key: "pending_client", label: "Client didn't send it — pending (not counted against the team)" },
];

export const SMM_APPROVAL_VIA: { key: SmmApprovalVia; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "call", label: "Phone call" },
  { key: "client_chat", label: "Client chat in the app" },
  { key: "in_person", label: "In person" },
  { key: "other", label: "Other" },
];

export function approvalProofOf(args: {
  approved: boolean; who: string; via: SmmApprovalVia; screenshotUrl?: string | null; actor: SmmDeliveryActor; now: number;
}): { problem: string; proof: SmmApprovalProof | null } {
  const who = (args.who || "").trim().slice(0, 80);
  if (who.length < 2) return { problem: "Say who at the client answered.", proof: null };
  return {
    problem: "",
    proof: { approved: args.approved, who, via: args.via, screenshotUrl: args.screenshotUrl || null, at: args.now, byUid: args.actor.uid, byName: args.actor.name },
  };
}

/** The domains a post link must be on, per account (a link pasted into the wrong box is caught here). */
export const SMM_PLATFORM_DOMAINS: Record<SmmPlatform, string[]> = {
  instagram: ["instagram.com", "instagr.am"],
  facebook: ["facebook.com", "fb.com", "fb.watch", "m.facebook.com"],
  youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com", "lnkd.in"],
  x: ["x.com", "twitter.com", "t.co"],
};

export const SMM_NO_LINK_REASON_MIN = 5;

/**
 * "Posted" needs a link for each account the piece covers, or a "no link — why?" answer (owner's decision 9).
 * A link must be a web address on that account's site; when the month's page link for that account names a
 * page, a link to a different page is only a warning (a reel's link does not carry the page name).
 */
export function postLinkProblems(args: {
  platforms: readonly SmmPlatform[];
  postUrls: Partial<Record<SmmPlatform, string>> | null | undefined;
  noLinkReason?: string | null;
}): { problems: Partial<Record<SmmPlatform, string>>; missing: SmmPlatform[]; ok: boolean; reasonProblem: string } {
  const problems: Partial<Record<SmmPlatform, string>> = {};
  const missing: SmmPlatform[] = [];
  for (const p of args.platforms) {
    const raw = (args.postUrls?.[p] || "").trim();
    if (!raw) {
      missing.push(p);
      continue;
    }
    let host = "";
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      host = u.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      problems[p] = "That is not a web link.";
      continue;
    }
    if (!SMM_PLATFORM_DOMAINS[p].some((d) => host === d || host.endsWith(`.${d}`))) {
      problems[p] = `That link is not on ${p === "x" ? "X" : p[0].toUpperCase() + p.slice(1)}.`;
    }
  }
  const reason = (args.noLinkReason || "").trim();
  const reasonProblem = missing.length && reason.length < SMM_NO_LINK_REASON_MIN ? "Add the link, or say why there is no link." : "";
  return { problems, missing, ok: !Object.keys(problems).length && !reasonProblem, reasonProblem };
}

/* ── The check-out step ───────────────────────────────────────────────────────────────────────── */

export interface SmmCheckoutTask {
  campaignId: string;
  clientName: string;
  itemId: string;
  task: SmmPlannedTask;
  progress: SmmTaskProgress;
  step: SmmLateStep;
  /** Why it is asked about: due today, late, or a checkpoint missed. */
  why: "due_today" | "late" | "checkpoint_missed";
}

/**
 * At check-out, every unfinished piece of THIS person that is due today, late, or past a checkpoint needs a
 * one-tap "why not done" (owner's decision 8). Theirs = the step is theirs: the maker while it is being made,
 * the publisher once approved (the client's side is the salesperson's, never a tech member's). A piece already
 * answered today (a late reason given today) is not asked again; months that are not chased are left out.
 */
export function checkoutTasksFor(args: {
  uid: string;
  months: readonly SmmDeliveryMonth[];
  now: number;
  holidays: SmmHolidays;
  settings?: SmmDeliverySettings;
}): SmmCheckoutTask[] {
  const today = istDay(args.now);
  const out: SmmCheckoutTask[] = [];
  for (const month of args.months) {
    let plan: SmmMonthPlan;
    try {
      plan = planMonth(month, { today, holidays: args.holidays, settings: args.settings });
    } catch {
      continue;
    }
    if (plan.exclusion || plan.problem === "bad_dates" || plan.problem === "too_short") continue;
    const items = new Map((month.items || []).map((i) => [i.id, i]));
    for (const task of plan.tasks) {
      const item = items.get(task.itemId);
      if (!item) continue;
      const p = taskProgress(task, item, args.now);
      if (p.state !== "due_today" && p.state !== "late" && p.state !== "checkpoint_missed") continue;
      const owner = p.step === "make" ? task.makerUid : p.step === "post" ? task.publisherUid : null;
      if (owner !== args.uid) continue;
      if ((item.lateReasons || []).some((r) => istDay(toMs(r.at) ?? 0) === today && r.byUid === args.uid)) continue;
      out.push({ campaignId: month.id, clientName: plan.name, itemId: task.itemId, task, progress: p, step: lateStepOf(p), why: p.state });
    }
  }
  const rank = { late: 0, due_today: 1, checkpoint_missed: 2 } as const;
  return out.sort((a, b) => rank[a.why] - rank[b.why] || (a.task.deadlineAt ?? 0) - (b.task.deadlineAt ?? 0));
}

/* ── The Starting line ────────────────────────────────────────────────────────────────────────── */

/** A Starting-line piece's decision: a catch-up week (≤ 2 weeks ahead) or kept as that month's pending work. */
export type SmmStartingLineDecision = "catch_up" | "pending";

/** The weeks a catch-up may go to: this week and up to two after it, inside the month. */
export function catchUpWeeks(plan: Pick<SmmMonthPlan, "weeks">, today: string): SmmPlanWeek[] {
  const current = plan.weeks.find((w) => today >= w.start && today <= w.end)?.week
    ?? (plan.weeks[0] && today < plan.weeks[0].start ? 1 : null);
  if (!current) return [];
  return plan.weeks.map((w) => w.week).filter((w) => w >= current && w <= current + 2) as SmmPlanWeek[];
}
