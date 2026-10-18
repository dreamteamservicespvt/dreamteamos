/**
 * Writing a scored result: one transaction reads the profile, the attempt, its session and task and the season score,
 * runs the pure `computeApply`, and writes everything it returns (signed). `attempt.appliedAt` / `task.appliedAt`
 * make it idempotent: a retried request or a racing tick applies a result exactly once (FR-059, AC-022).
 */
import { addDays, istDay, type WorkdayContext } from "../core/days.js";
import type { DevPolicy } from "../core/policy.js";
import { computeApply, computeApplyTask, computeSettle, type ApplyOutput } from "../core/progress.js";
import { seasonOf } from "../core/season.js";
import type { DevAttempt, DevProfile, DevSession, DevTask, SeasonScore } from "../core/types.js";
import { PATH, type Deps } from "./context.js";
import { signRecord } from "./integrity.js";
import type { Doc, DevTx } from "./store.js";

interface Cal { cal: WorkdayContext; awayFor: (uid: string) => Promise<Set<string>> }

const calCache = new WeakMap<Deps, Promise<Set<string>>>();

/** Company holidays (`holidays/{yyyy-MM-dd}`), read once per request. */
async function holidays(deps: Deps): Promise<Set<string>> {
  let p = calCache.get(deps);
  if (!p) {
    p = deps.store.query(PATH.holidays).then((rows) => new Set(rows.map((r) => r.id).filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id)))).catch(() => new Set<string>());
    calCache.set(deps, p);
  }
  return p;
}

/** Days a person was on APPROVED leave (they never break a streak or count as missed). */
export async function awayDays(deps: Deps, uid: string): Promise<Set<string>> {
  try {
    const rows = await deps.store.query(PATH.leaveRequests, [["memberId", "==", uid]]);
    const out = new Set<string>();
    for (const r of rows) {
      const d = r.data;
      if (d.status !== "approved" || typeof d.fromDate !== "string") continue;
      const to = d.duration === "half_day" ? d.fromDate : (typeof d.toDate === "string" ? d.toDate : d.fromDate);
      for (let day = d.fromDate as string, i = 0; day <= (to as string) && i < 60; day = addDays(day, 1), i++) out.add(day);
    }
    return out;
  } catch {
    return new Set();
  }
}

export async function calendarFor(deps: Deps, policy: DevPolicy): Promise<Cal> {
  const h = await holidays(deps);
  return { cal: { workDays: policy.cadence.workDays, holidays: h }, awayFor: (uid) => awayDays(deps, uid) };
}

async function writeOutput(deps: Deps, t: DevTx, uid: string, out: ApplyOutput) {
  const s = deps.secrets;
  const session = out.session;
  t.set(PATH.user(uid), (await signRecord(s, "profile", out.profile)) as unknown as Doc);
  if (out.evidence) t.set(PATH.evidence(uid, out.evidence.id), out.evidence as unknown as Doc);
  for (const x of out.xp) t.set(PATH.xp(uid, x.id), (await signRecord(s, "xp", x)) as unknown as Doc);
  if (out.task) t.set(PATH.task(uid, out.task.id), out.task as unknown as Doc);
  if (session) t.set(PATH.session(uid, session.id), session as unknown as Doc);
  t.set(PATH.seasonScore(out.seasonScore.seasonId, uid), out.seasonScore as unknown as Doc);
  if (out.rankEvent) t.set(PATH.rankEvent(uid, out.rankEvent.id), (await signRecord(s, "rank", out.rankEvent)) as unknown as Doc);
  for (const a of out.achievements) t.set(PATH.achievement(uid, a.id), a as unknown as Doc);
  for (const nt of out.newTasks) t.set(PATH.task(uid, nt.id), nt as unknown as Doc);
  // A finished league session IS the person's entry in the round — written with the result, in this transaction,
  // whichever way the session ended: the last answer, the last question's time running out (no answer to apply — the
  // entry was never marked done and the person dropped out of the results, found 2026-10-18) or the tick closing it.
  const task = out.task;
  if (task?.kind === "league" && task.roundId && task.appliedAt && session?.result) {
    const ms = Math.max(0, (session.completedAt ?? task.appliedAt) - (session.startedAt ?? session.createdAt));
    t.set(PATH.leagueEntry(task.roundId, uid), {
      uid, name: out.profile.name, hidden: !!out.profile.boardPrivate, done: true,
      score: session.result.score, correct: session.result.correct, ms, finishedAt: task.appliedAt,
    } as unknown as Doc, true);
  }
}

async function sendNotices(deps: Deps, uid: string, out: ApplyOutput) {
  for (const n of out.notices) {
    try {
      await deps.notify.send({ uid, type: n.type, title: n.title, message: n.message, link: n.link, key: n.key, push: true });
    } catch (e) {
      deps.log("warn", "devos notice not sent", { key: n.key, e: e instanceof Error ? e.message : e });
    }
  }
}

/** Apply a scored attempt (once). Returns the output, or null when it was already applied / not appliable. */
export async function applyAttempt(deps: Deps, policy: DevPolicy, uid: string, attemptId: string): Promise<ApplyOutput | null> {
  const { cal, awayFor } = await calendarFor(deps, policy);
  const away = await awayFor(uid);
  const now = deps.now();
  const season = seasonOf(istDay(now), policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const out = await deps.store.tx(async (t) => {
    const attempt = (await t.get(PATH.attempt(uid, attemptId))) as unknown as DevAttempt | null;
    if (!attempt || attempt.appliedAt) return null;
    if (attempt.outcome === "pending_validation") return null;
    const profile = (await t.get(PATH.user(uid))) as unknown as DevProfile | null;
    if (!profile) return null;
    const session = attempt.sessionId ? ((await t.get(PATH.session(uid, attempt.sessionId))) as unknown as DevSession | null) : null;
    const task = attempt.taskId ? ((await t.get(PATH.task(uid, attempt.taskId))) as unknown as DevTask | null) : null;
    const score = (await t.get(PATH.seasonScore(season.id, uid))) as unknown as SeasonScore | null;
    const res = computeApply(profile, attempt, session, task, score, { policy, now, cal, away });
    await writeOutput(deps, t, uid, res);
    t.set(PATH.attempt(uid, attemptId), { appliedAt: now }, true);
    return res;
  });
  if (out) await sendNotices(deps, uid, out);
  return out;
}

/** Settle a task whose session ended without an attempt to apply (once). */
export async function settleTask(deps: Deps, policy: DevPolicy, uid: string, taskId: string): Promise<ApplyOutput | null> {
  const { cal, awayFor } = await calendarFor(deps, policy);
  const away = await awayFor(uid);
  const now = deps.now();
  const season = seasonOf(istDay(now), policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const out = await deps.store.tx(async (t) => {
    const task = (await t.get(PATH.task(uid, taskId))) as unknown as DevTask | null;
    const session = (await t.get(PATH.session(uid, taskId))) as unknown as DevSession | null;
    if (!task || !session || task.appliedAt) return null;
    const profile = (await t.get(PATH.user(uid))) as unknown as DevProfile | null;
    if (!profile) return null;
    const score = (await t.get(PATH.seasonScore(season.id, uid))) as unknown as SeasonScore | null;
    const res = computeSettle(profile, session, task, score, { policy, now, cal, away });
    if (!res.task && !res.session) return null;
    await writeOutput(deps, t, uid, res);
    return res;
  });
  if (out) await sendNotices(deps, uid, out);
  return out;
}

/**
 * Close a session whose time is over — every item not yet answered becomes "expired" (counted as 0) — and settle its
 * task (once). Wherever an unfinished session is found past its deadline the same thing happens: serving the next item,
 * the tick's sweep, a league closing, a new rank assessment. Returns null when there was nothing to close or settle.
 */
export async function closeAndSettle(deps: Deps, policy: DevPolicy, uid: string, taskId: string, why: string): Promise<ApplyOutput | null> {
  await closeSession(deps, uid, taskId, why);
  return settleTask(deps, policy, uid, taskId);
}

/** The closing half of `closeAndSettle` (the caller settles): returns the session as it now is. */
export async function closeSession(deps: Deps, uid: string, taskId: string, why: string): Promise<DevSession | null> {
  const now = deps.now();
  return deps.store.tx(async (t) => {
    const s = (await t.get(PATH.session(uid, taskId))) as unknown as DevSession | null;
    if (!s || s.state !== "open") return s;
    const shown = s.slots.filter((x) => x.state === "served" && x.qid).map((x) => x.qid as string);
    s.slots = s.slots.map((x) => (x.state === "pending" || x.state === "served" ? { ...x, state: "expired" as const, reason: x.reason ? `${x.reason} — ${why}` : why } : x));
    s.state = "expired";
    s.completedAt = now;
    t.set(PATH.session(uid, taskId), s as unknown as Doc);
    for (const qid of shown) t.set(PATH.exposure(uid, qid), { state: "expired" } as unknown as Doc, true);
    return s;
  });
}

/** Apply a graded practical task (once). */
export async function applyTask(deps: Deps, policy: DevPolicy, uid: string, taskId: string): Promise<ApplyOutput | null> {
  const { cal, awayFor } = await calendarFor(deps, policy);
  const away = await awayFor(uid);
  const now = deps.now();
  const season = seasonOf(istDay(now), policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const out = await deps.store.tx(async (t) => {
    const task = (await t.get(PATH.task(uid, taskId))) as unknown as DevTask | null;
    if (!task || task.appliedAt || !task.scoring) return null;
    const profile = (await t.get(PATH.user(uid))) as unknown as DevProfile | null;
    if (!profile) return null;
    const score = (await t.get(PATH.seasonScore(season.id, uid))) as unknown as SeasonScore | null;
    const res = computeApplyTask(profile, task, score, { policy, now, cal, away });
    await writeOutput(deps, t, uid, res);
    return res;
  });
  if (out) await sendNotices(deps, uid, out);
  return out;
}
