/**
 * SMM Delivery Control — the WRITES (2026-10-15, phase 3 of the plan in `.claude/rules/smm.md` §9.9).
 *
 * ── What writes, and what never does ────────────────────────────────────────────────────────────
 * The supervisor (`utils/smmMonitor`, the app's alert host, the server checker) only READS. Everything that
 * changes a month here is a person's deliberate act: switching a month on (its plan saved once), an answer to
 * an alert ("Do it now", "Need more time", "Blocked", a late reason), a move to another week, a reassign, the
 * footage in, an approval with its proof, a post with its links, the check-out step's reasons. Each is ONE
 * transaction on the month through `smm.mutateCampaign` — the classic board's own way in, which re-reads the
 * month, refuses the view-only Social Media Team Lead on a month she is not on (`assertMayChangeMonth`), and
 * keeps the order's counters in step. A month document rewrites its whole `items` array on every save, so the
 * answers are few and small (every history list is capped at 10, `utils/smmDeliveryActions.withCap`).
 *
 * The answers of people who are not on the piece — a lead's "I'm on it" / "Escalate" / "Remind", an admin's
 * "I'm on it", a salesperson's "Called" — go to their OWN document, `smm_alert_state/{uid}` (the lead is
 * view-only on other months, 2026-10-12). Only that person writes it; the supervisor reads them all.
 *
 * Who is signed in is read from the auth store (`useAuthStore.getState().user`, the live `users/{uid}`), as
 * the other SMM guards do; nobody signed in (a script, a test with no user) cannot answer.
 *
 * ── Preview ─────────────────────────────────────────────────────────────────────────────────────
 * In Preview the screens write nothing of their own — except "Switch on this month", a manager's explicit act
 * that saves the month's plan and its starting point so it is ready when Delivery Control goes Live (alerts
 * still wait for Live).
 */
import { collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { fetchCampaign, mutateCampaign, recordApproval, setItemStatus } from "@/services/smm";
import { useAuthStore } from "@/store/authStore";
import { DEFAULT_SMM_DELIVERY } from "@/utils/smmDeliverySettings";
import { istDay, planMonth, taskProgress, type SmmDeliveryItem, type SmmDeliveryMonth, type SmmHolidays } from "@/utils/smmCadence";
import { reassignCheck, blockerClearer } from "@/utils/smmMonitor";
import { moveCheck } from "@/utils/smmCadence";
import {
  activationItems, approvalProofOf, blockerAnswer, deliveryStamp, etaAnswer, isDeliveryManager, lateReasonAnswer, mayAnswerForPiece,
  moveEntry, movedPlan, postLinkProblems, reassignEntry, replanItems, switchOnProblem, withCap, type SmmDeliveryActor,
} from "@/utils/smmDeliveryActions";
import type { SmmCampaign, SmmPlatform } from "@/types/smm";
import type {
  SmmAlertStateDoc, SmmAlertStateEntry, SmmApprovalVia, SmmBlockerKind, SmmDeliverySettings, SmmEtaKind, SmmFootageState, SmmItemPlan,
  SmmLateStep, SmmPlanWeek,
} from "@/types/smmDelivery";
import { SMM_ALERT_STATE_KEEP_DAYS } from "@/types/smmDelivery";

/** What the planner needs to know about the calendar and the company's numbers. */
export interface SmmDeliveryCtx {
  holidays: SmmHolidays;
  settings?: SmmDeliverySettings;
  /** ms — the tests pin it; the app uses the clock. */
  now?: number;
}

/** The signed-in person, or a sentence the screen can show. */
function actorOrThrow(): SmmDeliveryActor {
  const u = useAuthStore.getState().user;
  if (!u?.uid) throw new Error("Sign in again to answer.");
  return { uid: u.uid, name: u.name || "Someone", role: u.role, smmLeader: !!u.smmLeader };
}

const nowOf = (ctx?: { now?: number }) => ctx?.now ?? Date.now();

/** One piece changed inside the month's transaction; `change` returns the new piece, or throws a sentence. */
async function changePiece(
  campaignId: string,
  itemId: string,
  change: (item: SmmDeliveryItem, month: SmmDeliveryMonth) => SmmDeliveryItem | null,
): Promise<SmmCampaign | null> {
  return mutateCampaign(campaignId, (c) => {
    const month = c as unknown as SmmDeliveryMonth;
    const item = month.items.find((i) => i.id === itemId);
    if (!item) throw new Error("This piece is no longer on the month.");
    const next = change(item, month);
    if (!next) return null;
    const items = month.items.map((i) => (i.id === itemId ? { ...next, updatedAt: Date.now() } : i));
    return { items } as unknown as Partial<SmmCampaign>;
  });
}

function assertMayAnswer(month: SmmDeliveryMonth, item: SmmDeliveryItem, actor: SmmDeliveryActor): void {
  if (!mayAnswerForPiece(month, item, actor)) throw new Error("Only the people on this month (or a manager) can answer for this piece.");
}

/** The piece's deadline as the rules give it now (the screens pass theirs, the services re-check it). */
function deadlineOf(month: SmmDeliveryMonth, itemId: string, ctx: SmmDeliveryCtx, now: number): { deadlineAt: number | null; late: boolean; week: SmmPlanWeek | null } {
  const plan = planMonth(month, { today: istDay(now), holidays: ctx.holidays, settings: ctx.settings });
  const task = plan.tasks.find((t) => t.itemId === itemId);
  const item = month.items.find((i) => i.id === itemId);
  if (!task || !item) return { deadlineAt: null, late: false, week: null };
  const p = taskProgress(task, item, now);
  return { deadlineAt: task.deadlineAt, late: p.state === "late", week: task.week };
}

/* ── Switching a month on ─────────────────────────────────────────────────────────────────────── */

/**
 * Switch one month on: its plan saved on the pieces the planner placed, and its starting point (`delivery`) —
 * lateness that already exists now is the Starting line and never escalates. Done once; a month already on is
 * left as it is (re-plan is its own, deliberate act). Managers only.
 */
export async function switchOnMonth(campaignId: string, ctx: SmmDeliveryCtx): Promise<{ planned: number; already: boolean }> {
  const actor = actorOrThrow();
  if (!isDeliveryManager(actor)) throw new Error("Only the tech admin, a team leader or the main admin can switch a month on.");
  const now = nowOf(ctx);
  let planned = 0;
  let already = false;
  await mutateCampaign(campaignId, (c) => {
    const month = c as unknown as SmmDeliveryMonth;
    if (month.delivery?.baselineAt) {
      already = true;
      return null;
    }
    const plan = planMonth(month, { today: istDay(now), holidays: ctx.holidays, settings: ctx.settings });
    const problem = switchOnProblem(month, plan, actor);
    if (problem) throw new Error(problem);
    const next = activationItems(month, plan, "auto", now);
    planned = next.planned;
    return { items: next.items, delivery: deliveryStamp(actor, now) } as unknown as Partial<SmmCampaign>;
  });
  return { planned, already };
}

/** Switch several months on, each on its own (one failing never stops the others). */
export async function switchOnMonths(ids: string[], ctx: SmmDeliveryCtx): Promise<{ done: number; already: number; failed: { id: string; message: string }[] }> {
  const out = { done: 0, already: 0, failed: [] as { id: string; message: string }[] };
  for (const id of ids) {
    try {
      const r = await switchOnMonth(id, ctx);
      if (r.already) out.already += 1;
      else out.done += 1;
    } catch (e) {
      out.failed.push({ id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/** Re-plan on purpose: only the pieces the planner placed move; a person's choices stay. Managers only. */
export async function replanMonth(campaignId: string, ctx: SmmDeliveryCtx): Promise<{ planned: number }> {
  const actor = actorOrThrow();
  if (!isDeliveryManager(actor)) throw new Error("Only the tech admin, a team leader or the main admin can re-plan a month.");
  const now = nowOf(ctx);
  let planned = 0;
  await mutateCampaign(campaignId, (c) => {
    const month = c as unknown as SmmDeliveryMonth;
    const next = replanItems(month, { today: istDay(now), holidays: ctx.holidays, settings: ctx.settings }, now);
    planned = next.planned;
    return { items: next.items } as unknown as Partial<SmmCampaign>;
  });
  return { planned };
}

/* ── The owner's answers ──────────────────────────────────────────────────────────────────────── */

/** "Do it now" (45 min of quiet, renewed once a day) or "Need more time" (today only, twice a piece). */
export async function answerEta(campaignId: string, itemId: string, kind: SmmEtaKind, ctx: SmmDeliveryCtx): Promise<void> {
  const actor = actorOrThrow();
  const now = nowOf(ctx);
  await changePiece(campaignId, itemId, (item, month) => {
    assertMayAnswer(month, item, actor);
    const { deadlineAt } = deadlineOf(month, itemId, ctx, now);
    const r = etaAnswer({ kind, item, deadlineAt, actor, now, settings: ctx.settings });
    if (r.problem) throw new Error(r.problem);
    return { ...item, eta: r.eta };
  });
}

/** "Blocked" — the block then chases whoever must clear it; it lapses after 24 h unless they confirm it. */
export async function answerBlocked(campaignId: string, itemId: string, input: { kind: SmmBlockerKind; note?: string | null }, ctx: SmmDeliveryCtx): Promise<void> {
  const actor = actorOrThrow();
  const now = nowOf(ctx);
  await changePiece(campaignId, itemId, (item, month) => {
    assertMayAnswer(month, item, actor);
    const r = blockerAnswer({ kind: input.kind, note: input.note, actor, now, settings: ctx.settings });
    if (r.problem) throw new Error(r.problem);
    return { ...item, blocker: r.blocker };
  });
}

/** Who may confirm or clear a block: the person who must clear it (the salesperson for the client's side, the
 *  admins for Flow credits, the leads otherwise) — and the managers. */
function mayClearBlock(month: SmmDeliveryMonth, item: SmmDeliveryItem, actor: SmmDeliveryActor): boolean {
  if (isDeliveryManager(actor)) return true;
  const kind = item.blocker?.kind;
  if (!kind) return false;
  const who = blockerClearer(kind);
  if (who === "salesperson") return month.soldBy === actor.uid || actor.role === "sales_admin";
  if (who === "lead") return !!actor.smmLeader;
  return false;
}

/** The person who must clear a block says it is real — it then holds until it is cleared. */
export async function confirmBlocker(campaignId: string, itemId: string, ctx: SmmDeliveryCtx = { holidays: null }): Promise<void> {
  const actor = actorOrThrow();
  const now = nowOf(ctx);
  await changePiece(campaignId, itemId, (item, month) => {
    if (!item.blocker) return null;
    if (!mayClearBlock(month, item, actor)) throw new Error("Only the person who must clear this block (or a manager) can confirm it.");
    return { ...item, blocker: { ...item.blocker, confirmedByUid: actor.uid, confirmedAt: now } };
  });
}

/** The block is gone: the owner's alerts come back if the piece is still behind. */
export async function clearBlocker(campaignId: string, itemId: string): Promise<void> {
  const actor = actorOrThrow();
  await changePiece(campaignId, itemId, (item, month) => {
    if (!item.blocker) return null;
    if (!mayClearBlock(month, item, actor) && !mayAnswerForPiece(month, item, actor)) throw new Error("You cannot clear this block.");
    return { ...item, blocker: null };
  });
}

/** A one-tap "why not done" (+ an optional new time). */
export async function answerLate(
  campaignId: string,
  itemId: string,
  input: { step: SmmLateStep; reason: string; note?: string | null; newTime?: number | null },
  ctx: SmmDeliveryCtx = { holidays: null },
): Promise<void> {
  const actor = actorOrThrow();
  const now = nowOf(ctx);
  await changePiece(campaignId, itemId, (item, month) => {
    assertMayAnswer(month, item, actor);
    const r = lateReasonAnswer({ ...input, actor, now });
    if (r.problem || !r.entry) throw new Error(r.problem);
    return { ...item, lateReasons: withCap(item.lateReasons, r.entry) };
  });
}

/**
 * The check-out step's answers: one reason per unfinished piece, saved per month in ONE transaction each.
 * Returns the months that could not be saved (the person still checks out — the reasons are help, not a gate
 * on going home; the screen says which did not save).
 */
export async function saveCheckoutReasons(
  entries: { campaignId: string; itemId: string; step: SmmLateStep; reason: string; note?: string | null; newTime?: number | null }[],
  ctx: { now?: number } = {},
): Promise<{ saved: number; failed: { campaignId: string; message: string }[] }> {
  const actor = actorOrThrow();
  const now = nowOf(ctx);
  const byMonth = new Map<string, typeof entries>();
  for (const e of entries) byMonth.set(e.campaignId, [...(byMonth.get(e.campaignId) || []), e]);
  const out = { saved: 0, failed: [] as { campaignId: string; message: string }[] };
  for (const [campaignId, list] of byMonth) {
    try {
      await mutateCampaign(campaignId, (c) => {
        const month = c as unknown as SmmDeliveryMonth;
        let changed = 0;
        const items = month.items.map((item) => {
          const e = list.find((x) => x.itemId === item.id);
          if (!e || !mayAnswerForPiece(month, item, actor)) return item;
          const r = lateReasonAnswer({ ...e, actor, now });
          if (!r.entry) return item;
          changed += 1;
          return { ...item, lateReasons: withCap(item.lateReasons, r.entry), updatedAt: now };
        });
        out.saved += changed;
        return changed ? ({ items } as unknown as Partial<SmmCampaign>) : null;
      });
    } catch (e) {
      out.failed.push({ campaignId, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/* ── The client's side ────────────────────────────────────────────────────────────────────────── */

/** A real video's footage: received / unusable / the client never sent it (that month's pending work). */
export async function setFootage(campaignId: string, itemId: string, input: { state: SmmFootageState; link?: string | null }, ctx: { now?: number } = {}): Promise<void> {
  const actor = actorOrThrow();
  const now = nowOf(ctx);
  await changePiece(campaignId, itemId, (item, month) => {
    if (item.kind !== "real_video" || item.extra) throw new Error("Only a real video needs footage.");
    if (!mayAnswerForPiece(month, item, actor) && actor.role !== "sales_admin") throw new Error("Only the people on this month can record its footage.");
    const link = (input.link || "").trim() || item.footage?.link || null;
    return { ...item, footage: { state: input.state, link, at: now, byName: actor.name } };
  });
}

/**
 * The client's answer recorded from Delivery Control: the classic `recordApproval` (which tells the maker or
 * the publisher), plus who at the client said it, how, and an optional screenshot. When the tech side records
 * it, the salesperson is told (the plan: "the salesperson is told when the tech side records one").
 */
export async function recordApprovalWithProof(
  campaignId: string,
  itemId: string,
  input: { approved: boolean; who: string; via: SmmApprovalVia; note?: string | null; screenshotUrl?: string | null },
  ctx: { now?: number } = {},
): Promise<void> {
  const actor = actorOrThrow();
  const now = nowOf(ctx);
  const proof = approvalProofOf({ ...input, actor, now });
  if (proof.problem || !proof.proof) throw new Error(proof.problem);
  await recordApproval(campaignId, itemId, { approved: input.approved, note: input.note ?? null }, actor);
  const after = await changePiece(campaignId, itemId, (item) => ({ ...item, approvalProof: proof.proof }));
  if (after?.soldBy && after.soldBy !== actor.uid) {
    const item = after.items.find((i) => i.id === itemId);
    await sendNotification({
      userId: after.soldBy,
      type: input.approved ? "smm_approved" : "smm_changes",
      title: input.approved ? "Your client approved a piece" : "Your client asked for changes",
      message: `${after.businessName} — ${item?.title?.trim() || "a piece"} (${proof.proof.who}, via ${input.via.replace("_", " ")}; recorded by ${actor.name}).`,
      link: `/smm/control/${campaignId}`,
      dedupeKey: `smm_approval_seller_${itemId}_${input.approved ? "yes" : "no"}_${now}`,
    }).catch(() => { /* the decision is recorded either way */ });
  }
}

/**
 * "Posted": a link for every account the piece covers, or a reason there is none (owner's decision 9) — then
 * the classic `setItemStatus("posted")`, which keeps the approval rule (nothing goes up unapproved).
 */
export async function markPostedWithLinks(
  campaignId: string,
  itemId: string,
  input: { postUrls: Partial<Record<SmmPlatform, string>>; noLinkReason?: string | null },
): Promise<void> {
  const actor = actorOrThrow();
  await changePiece(campaignId, itemId, (item, month) => {
    assertMayAnswer(month, item, actor);
    const platforms = (item.platforms?.length ? item.platforms : month.platforms) || [];
    const check = postLinkProblems({ platforms, postUrls: input.postUrls, noLinkReason: input.noLinkReason });
    // A wrong link in a box is the more useful sentence; then a box left empty with no reason.
    if (!check.ok) throw new Error(Object.values(check.problems)[0] || check.reasonProblem || "Check the links.");
    const postUrls: Partial<Record<SmmPlatform, string>> = { ...(item.postUrls || {}) };
    for (const p of platforms) {
      const v = (input.postUrls[p] || "").trim();
      if (v) postUrls[p] = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    }
    return { ...item, postUrls, noLinkReason: check.missing.length ? (input.noLinkReason || "").trim() : null };
  });
  await setItemStatus(campaignId, itemId, "posted", actor);
}

/* ── Moving and reassigning ───────────────────────────────────────────────────────────────────── */

/** The Social Media Team Lead(s), for "the lead is told". One equality read, when a move needs it. */
async function smmLeads(): Promise<{ uid: string; name: string }[]> {
  try {
    const snap = await getDocs(query(collection(db, "users"), where("smmLeader", "==", true)));
    return snap.docs
      .map((d) => ({ uid: d.id, ...(d.data() as { name?: string; isActive?: boolean }) }))
      .filter((u) => u.isActive !== false)
      .map((u) => ({ uid: u.uid, name: u.name || "" }));
  } catch {
    return [];
  }
}

/**
 * Move a piece to another week of its month (a reason; the lead is told), to a day the client asked for (its
 * deadline becomes that day), or out of the month (managers only — it stops being chased here and is carried to
 * the next month with the classic "Move them here"). A piece already late moves only by a manager, so a date
 * can never be moved to escape a late week (`smmCadence.moveCheck`).
 */
export async function movePiece(
  campaignId: string,
  itemId: string,
  input: { toWeek: SmmPlanWeek | "out"; reason: string; clientDay?: string | null },
  ctx: SmmDeliveryCtx,
): Promise<{ notifyLead: boolean }> {
  const actor = actorOrThrow();
  const now = nowOf(ctx);
  let notifyLead = false;
  let fromWeek: SmmPlanWeek | null = null;
  const after = await changePiece(campaignId, itemId, (item, month) => {
    assertMayAnswer(month, item, actor);
    const where = deadlineOf(month, itemId, ctx, now);
    fromWeek = where.week;
    if (!fromWeek) throw new Error("This piece has no week yet (a row beyond the promise, or extra work with no date).");
    const check = moveCheck({ fromWeek, toWeek: input.toWeek, reason: input.reason, user: actor, late: where.late });
    if (check.problem) throw new Error(check.problem);
    notifyLead = check.notifyLead;
    if (input.clientDay) {
      const plan = planMonth(month, { today: istDay(now), holidays: ctx.holidays, settings: ctx.settings });
      const w = plan.weeks.find((wk) => input.clientDay! >= wk.start && input.clientDay! <= wk.end);
      if (!w || (input.toWeek !== "out" && w.week !== input.toWeek)) throw new Error("That day is not in the week you picked.");
    }
    const entry = moveEntry(fromWeek, input.toWeek, input.reason || (input.toWeek === fromWeek ? "Same week" : ""), actor, now);
    if (input.toWeek === "out") {
      const plan: SmmItemPlan = { ...(item.plan || { week: fromWeek, by: actor.uid }), plannedAt: now, by: actor.uid };
      return { ...item, plan, moves: withCap(item.moves, entry) };
    }
    if (check.scope === "same_week" && !input.clientDay) {
      return { ...item, plan: { ...(item.plan || { week: fromWeek }), week: fromWeek, plannedAt: now, by: actor.uid } };
    }
    return { ...item, plan: movedPlan(item, input.toWeek, actor, now, input.clientDay), moves: withCap(item.moves, entry) };
  });
  if (notifyLead && after) {
    const item = after.items.find((i) => i.id === itemId);
    const to = input.toWeek === "out" ? "out of the month" : `to week ${input.toWeek}`;
    for (const lead of (await smmLeads()).filter((l) => l.uid !== actor.uid)) {
      await sendNotification({
        userId: lead.uid,
        type: "smm_moved",
        title: "A social media piece was moved",
        message: `${after.businessName}: ${item?.title?.trim() || "a piece"} moved from week ${fromWeek} ${to} by ${actor.name} — ${input.reason.trim()}`,
        link: `/smm/control/${campaignId}`,
        dedupeKey: `smm_moved_${itemId}_${now}_${lead.uid}`,
      }).catch(() => undefined);
    }
  }
  return { notifyLead };
}

/**
 * Give a piece's step to somebody else (the team leaders and admins). The new owner gets a fresh lead time
 * (the supervisor keeps them quiet until the end of the next working day) and a 3rd reassign needs the tech /
 * main admin (no ping-pong). The new owner is told.
 */
export async function reassignPiece(
  campaignId: string,
  itemId: string,
  seat: "maker" | "publisher",
  member: { uid: string; name: string },
  ctx: { now?: number; settings?: SmmDeliverySettings } = {},
): Promise<void> {
  const actor = actorOrThrow();
  if (!isDeliveryManager(actor)) throw new Error("Only a team leader, the tech admin or the main admin can reassign a piece.");
  const now = nowOf(ctx);
  const after = await changePiece(campaignId, itemId, (item) => {
    const problem = reassignCheck(item, actor, ctx.settings || DEFAULT_SMM_DELIVERY);
    if (problem) throw new Error(problem);
    const from = seat === "maker" ? item.makerUid : item.publisherUid;
    if (from === member.uid) return null;
    const entry = reassignEntry(seat, from, member.uid, actor, now);
    return seat === "maker"
      ? { ...item, makerUid: member.uid, makerName: member.name, reassigns: withCap(item.reassigns, entry), eta: null, blocker: null }
      : { ...item, publisherUid: member.uid, publisherName: member.name, reassigns: withCap(item.reassigns, entry), eta: null, blocker: null };
  });
  if (after && member.uid !== actor.uid) {
    const item = after.items.find((i) => i.id === itemId);
    await sendNotification({
      userId: member.uid,
      type: "smm_reassigned",
      title: seat === "maker" ? "A social media piece is yours to make" : "A social media piece is yours to post",
      message: `${after.businessName}: ${item?.title?.trim() || "a piece"} — given to you by ${actor.name}.`,
      link: `/smm/control/${campaignId}`,
      dedupeKey: `smm_reassigned_${itemId}_${seat}_${member.uid}_${now}`,
    }).catch(() => undefined);
  }
}

/* ── The Starting line ────────────────────────────────────────────────────────────────────────── */

/**
 * A piece that was already late when its month was switched on: a manager plans a catch-up week (≤ 2 weeks
 * ahead, inside the month) or keeps it as that month's pending work. Either way it leaves the list.
 */
export async function decideStartingLine(
  campaignId: string,
  itemId: string,
  input: { decision: "catch_up"; toWeek: SmmPlanWeek } | { decision: "pending" },
  ctx: SmmDeliveryCtx,
): Promise<void> {
  const actor = actorOrThrow();
  if (!isDeliveryManager(actor)) throw new Error("Only the tech admin, a team leader or the main admin decides the Starting line.");
  const now = nowOf(ctx);
  await changePiece(campaignId, itemId, (item, month) => {
    const stamp = { decision: input.decision, at: now, byUid: actor.uid, byName: actor.name };
    if (input.decision === "pending") return { ...item, startingLine: stamp };
    const where = deadlineOf(month, itemId, ctx, now);
    const entry = moveEntry(where.week || 1, input.toWeek, "Catch-up (Starting line)", actor, now);
    return { ...item, plan: movedPlan(item, input.toWeek, actor, now), moves: withCap(item.moves, entry), startingLine: stamp };
  });
}

/* ── Titles (phase 5's AI suggestions, accepted by a person) ─────────────────────────────────── */

export interface SmmAcceptedSuggestion {
  itemId: string;
  title: string;
  idea: string;
  caption: string;
  hashtags: string[];
  festival: { name: string; date: string } | null;
}

/**
 * A person accepts AI titles: they go on each piece's `plan` (never over a title the team typed on the piece
 * itself — `title` on the piece stays theirs). A festival suggestion inside the piece's own week fixes its
 * deadline on the festival day ("festival"). A piece with no saved plan gets the planner's week with it.
 */
export async function acceptPlanSuggestions(campaignId: string, entries: SmmAcceptedSuggestion[], ctx: SmmDeliveryCtx): Promise<{ saved: number }> {
  const actor = actorOrThrow();
  const now = nowOf(ctx);
  let saved = 0;
  await mutateCampaign(campaignId, (c) => {
    const month = c as unknown as SmmDeliveryMonth;
    const plan = planMonth(month, { today: istDay(now), holidays: ctx.holidays, settings: ctx.settings });
    let changed = 0;
    const items = month.items.map((item) => {
      const e = entries.find((x) => x.itemId === item.id);
      if (!e) return item;
      if (!mayAnswerForPiece(month, item, actor)) throw new Error("Only the people on this month (or a manager) can accept its titles.");
      const task = plan.tasks.find((t) => t.itemId === item.id);
      const week = (item.plan?.week || task?.week) as SmmPlanWeek | null;
      if (!week) return item;
      const wk = plan.weeks[week - 1];
      const festivalOk = !!e.festival && !!wk && e.festival.date >= wk.start && e.festival.date <= wk.end && !item.plan?.fixedDate;
      changed += 1;
      const base: SmmItemPlan = item.plan || { week, suggestedDate: task?.suggestedDate || null, plannedAt: now, by: "auto" };
      return {
        ...item,
        plan: {
          ...base,
          title: e.title.trim().slice(0, 60) || base.title || null,
          idea: e.idea.trim().slice(0, 200) || null,
          caption: e.caption.trim().slice(0, 400) || null,
          hashtags: e.hashtags.slice(0, 8),
          ...(festivalOk ? { fixedDate: e.festival!.date, fixedReason: "festival" as const } : {}),
        },
        updatedAt: now,
      };
    });
    saved = changed;
    return changed ? ({ items } as unknown as Partial<SmmCampaign>) : null;
  });
  return { saved };
}

/* ── `smm_alert_state/{uid}` — answers that are not on a piece ────────────────────────────────── */

export const SMM_ALERT_STATE = "smm_alert_state";

/**
 * A lead's / admin's / salesperson's / marketer's answer on an alert about somebody else's piece (or a week, a
 * month, an ad run): "I'm on it" (4 h of quiet), "Escalate" (the admins at once), "Remind", "Called",
 * "WhatsApp". Only the person writes their own document; entries older than two weeks are dropped as it is
 * written.
 */
export async function answerAlert(subject: string, kind: SmmAlertStateEntry["kind"], note?: string | null, ctx: { now?: number } = {}): Promise<void> {
  const actor = actorOrThrow();
  const now = nowOf(ctx);
  const ref = doc(db, SMM_ALERT_STATE, actor.uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = (snap.exists() ? (snap.data() as SmmAlertStateDoc).answers : null) || {};
    const keep = now - SMM_ALERT_STATE_KEEP_DAYS * 86_400_000;
    const answers: Record<string, SmmAlertStateEntry> = {};
    for (const [k, v] of Object.entries(prev)) if (v && typeof v.at === "number" && v.at >= keep) answers[k] = v;
    answers[subject] = { kind, at: now, byName: actor.name, note: (note || "").trim().slice(0, 200) || null };
    tx.set(ref, { answers, updatedAt: serverTimestamp() });
  });
}

/** Everybody's answers, as the supervisor reads them: uid → subject → { kind, at }. */
export type SmmAlertAnswers = Record<string, Record<string, { kind: SmmAlertStateEntry["kind"]; at: number }>>;

function answersOf(docs: { id: string; data: () => unknown }[]): SmmAlertAnswers {
  const out: SmmAlertAnswers = {};
  for (const d of docs) {
    const a = (d.data() as SmmAlertStateDoc | undefined)?.answers || {};
    const mine: Record<string, { kind: SmmAlertStateEntry["kind"]; at: number }> = {};
    for (const [k, v] of Object.entries(a)) if (v && typeof v.at === "number") mine[k] = { kind: v.kind, at: v.at };
    out[d.id] = mine;
  }
  return out;
}

/** Every person's answers — for the managers' and leads' screens (a lead's Escalate reaches the admins). A handful of small documents. */
export function watchAlertAnswers(cb: (answers: SmmAlertAnswers) => void): () => void {
  return onSnapshot(
    collection(db, SMM_ALERT_STATE),
    (snap) => cb(answersOf(snap.docs)),
    (err) => { console.error("[smmDelivery] watchAlertAnswers:", err); cb({}); },
  );
}

/** One person's own answers (a member's screen needs only theirs). */
export function watchMyAlertAnswers(uid: string, cb: (answers: SmmAlertAnswers) => void): () => void {
  return onSnapshot(
    doc(db, SMM_ALERT_STATE, uid),
    (snap) => cb(snap.exists() ? answersOf([{ id: uid, data: () => snap.data() }]) : {}),
    (err) => { console.error("[smmDelivery] watchMyAlertAnswers:", err); cb({}); },
  );
}

/**
 * "Remind" (the lead): a bell + push to the piece's owner, once a day per piece, and the lead's answer recorded
 * (so her own alert on it quiets).
 */
export async function remindOwner(month: Pick<SmmCampaign, "id" | "businessName">, itemId: string, owner: { uid: string; name?: string | null }, what: string): Promise<void> {
  const actor = actorOrThrow();
  const now = Date.now();
  if (!owner.uid) throw new Error("Nobody owns this piece — reassign it instead.");
  await sendNotification({
    userId: owner.uid,
    type: "smm_remind",
    title: `${actor.name} reminded you`,
    message: `${month.businessName}: ${what}`,
    link: `/smm/control/${month.id}`,
    dedupeKey: `smm_remind_${itemId}_${istDay(now)}_${owner.uid}`,
    once: true,
  });
  await answerAlert(itemId, "remind", null, { now }).catch(() => undefined);
}

/** "Send me a test alert" (Settings): a bell + push to the person themself, to check sound and the phone. */
export async function sendTestAlert(): Promise<void> {
  const actor = actorOrThrow();
  await sendNotification({
    userId: actor.uid,
    type: "smm_test",
    title: "🎬 AI VIDEO · Test client",
    message: "This is a test alert from SMM Delivery Control. If you can read this on your phone, alerts reach you.",
    link: "/smm/control",
  });
}

/* ── Reading the months, with how fresh they are ─────────────────────────────────────────────── */

export interface SmmMonthsMeta {
  /** The answer came from the device's cache, not the server (offline, or the first paint). */
  fromCache: boolean;
  /** ms — when a SERVER-confirmed answer last arrived (null until one has). */
  serverAt: number | null;
}

/**
 * The months a person may see, live, with the snapshot's metadata — the alert host shows a full screen only on
 * server-confirmed data synced in the last few minutes (the plan's "fresh data only"). The SAME two queries as
 * the classic board (`smm.watchActiveCampaigns` for the overseers, `watchMyCampaigns` for everyone else), so
 * the SDK shares one watch between them: no extra reads when both are open. Removed / deleted months dropped.
 */
export function watchDeliveryMonths(
  viewer: { uid: string; overseer: boolean },
  cb: (months: SmmDeliveryMonth[], meta: SmmMonthsMeta) => void,
): () => void {
  let serverAt: number | null = null;
  const q = viewer.overseer
    ? query(collection(db, "smm_campaigns"), where("status", "==", "active"))
    : query(collection(db, "smm_campaigns"), where("watchers", "array-contains", viewer.uid));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const fromCache = !!snap.metadata?.fromCache;
      if (!fromCache) serverAt = Date.now();
      const months = snap.docs
        .map((d) => ({ ...(d.data() as SmmCampaign), id: d.id }) as unknown as SmmDeliveryMonth)
        .filter((m) => m.status !== "removed" && m.status !== "deleted");
      cb(months, { fromCache, serverAt });
    },
    (err) => { console.error("[smmDelivery] watchDeliveryMonths:", err); cb([], { fromCache: true, serverAt }); },
  );
}

/**
 * The server's clock, from the Date header of a tiny no-cache file the app already serves (`/version.json`) —
 * a phone set a day ahead must not call everything late (the plan's "device clock sane"). Null when it cannot
 * be read (offline): the caller then trusts nothing it would show full screen.
 */
export async function fetchServerNow(): Promise<number | null> {
  try {
    const started = Date.now();
    const res = await fetch(`/version.json?clock=${started}`, { method: "HEAD", cache: "no-store" });
    const date = res.headers.get("date");
    if (!date) return null;
    const t = Date.parse(date);
    if (Number.isNaN(t)) return null;
    // The header has whole seconds; half the round trip is the best guess at "now" on the server.
    return t + Math.round((Date.now() - started) / 2);
  } catch {
    return null;
  }
}

/** A month as Delivery Control reads it, fresh — for a sheet opened from a notification. */
export async function fetchDeliveryMonth(id: string): Promise<SmmDeliveryMonth | null> {
  return (await fetchCampaign(id)) as unknown as SmmDeliveryMonth | null;
}
