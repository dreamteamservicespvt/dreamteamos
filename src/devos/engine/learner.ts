/**
 * The learner's operations (MSRS §9.1 – §9.3): profile, onboarding + baseline, today's quest and the weekly
 * challenge, starting a task, serving items, hints, answering, practice, rank assessments, privacy.
 *
 * Every operation takes the server-verified `Actor` — never a uid from the request body (AC-020) — and works only
 * on that person's own records. Deadlines and time limits are judged on the SERVER clock (FR-029).
 */
import { open } from "../core/crypto.js";
import { addDays, istDay, istEndOfDay, isWorkday, lastWorkdayOfWeek, istAt, weekKeyOf } from "../core/days.js";
import { DIMENSION_BY_ID, DIMENSION_IDS } from "../core/dimensions.js";
import { baselineBlueprint, practiceBlueprint, questBlueprint, rankBlueprint } from "../core/director.js";
import { emptyDimensions, weightedSummary } from "../core/mastery.js";
import { isLearnerUnder, rankLabel, type DevPolicy } from "../core/policy.js";
import { emptySeasonScore } from "../core/progress.js";
import { rankAssessmentOpen } from "../core/ranks.js";
import { scoreObjective } from "../core/scoring.js";
import { seasonOf } from "../core/season.js";
import { cleanAnswers, codingFromAnswers, suggestTrack } from "../core/tracks.js";
import type {
  AttemptResponse, AuditEvent, DevAttempt, DevProfile, DevSession, DevTask, DimensionId, Exposure, Feedback, ItemKey, PublicItem, Purpose,
  QuestionDoc, SeasonScore, TrackId,
} from "../core/types.js";
import { nextChallenge } from "../content/challenges.js";
import { serveNext } from "./bank.js";
import { rebuildBoards, refreshBoardsIfStale } from "./competition.js";
import { assertActive, DevError, loadPolicy, PATH, shortId, type Actor, type Deps } from "./context.js";
import { gradeOpen, openFeedback } from "./grading.js";
import { signRecord } from "./integrity.js";
import { applyAttempt, awayDays, calendarFor, closeAndSettle, settleTask } from "./progress.js";
import { dequeueGrading, enqueueGrading, QUEUE_PATH, withQueued } from "./queue.js";
import { recordCalibration } from "./calibration.js";
import { gradePractical } from "./review.js";
import type { Doc } from "./store.js";

const TRACKS: TrackId[] = ["sales", "technical", "admin"];
const NO_HINTS: Purpose[] = ["baseline", "rank", "league", "capstone"];
const TIMED: Purpose[] = ["rank", "league"];

export function newProfile(actor: Actor, policy: DevPolicy, now: number): DevProfile {
  const track = policy.defaultTrackByRole[actor.role] ?? "admin";
  const day = istDay(now);
  return {
    uid: actor.uid, name: actor.name, role: actor.role, team: actor.team, status: "invited", track,
    trackHistory: [], codingRequired: false, language: "en",
    onboarding: { baseline: "not_started" },
    rank: { level: 1, since: now },
    xp: { total: 0, season: 0, seasonId: "", week: 0, weekKey: weekKeyOf(day), today: 0, day },
    dims: emptyDimensions(), summary: null,
    plan: { focus: [], reasons: [], updatedAt: now },
    streak: { current: 0, best: 0, lastDay: null, freezes: 0 },
    stats: { attempts: 0, passed: 0, failed: 0, expired: 0, systemErrors: 0, pending: 0, tasksDone: 0, tasksExpired: 0, remediationTried: 0, remediationPassed: 0, retentionTried: 0, retentionPassed: 0, transferTried: 0, transferPassed: 0 },
    days: [],
    gates: { assessments: [], practicals: [], transfers: [], retentions: [], validAttempts: 0 },
    badges: [],
    rating: { seasonId: "", value: 1000, rounds: 0, best: 1000 },
    lastActiveAt: null, createdAt: now, updatedAt: now, seenShards: 1,
  };
}

/** The person's profile, created on first use and kept in step with their account (name, role, team). */
export async function ensureProfile(deps: Deps, actor: Actor): Promise<DevProfile> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  const now = deps.now();
  const existing = (await deps.store.get(PATH.user(actor.uid))) as unknown as DevProfile | null;
  if (!existing) {
    const p = newProfile(actor, policy, now);
    await deps.store.set(PATH.user(actor.uid), (await signRecord(deps.secrets, "profile", p)) as unknown as Doc);
    return p;
  }
  if (!existing.onboarding || !existing.dims || !existing.stats || !existing.gates) {
    // A partial document (before 2026-10-18 the roll-over's invite wrote only `invites` + a status) is completed —
    // keeping what it had that matters — instead of being returned half-built (it crashed the person's first visit).
    const repaired: DevProfile = {
      ...newProfile(actor, policy, now),
      ...(existing.invites ? { invites: existing.invites } : {}),
      ...(existing.enrolled !== undefined ? { enrolled: existing.enrolled } : {}),
      ...(existing.boardPrivate !== undefined ? { boardPrivate: existing.boardPrivate } : {}),
      createdAt: typeof existing.createdAt === "number" ? existing.createdAt : now,
    };
    await deps.store.set(PATH.user(actor.uid), (await signRecord(deps.secrets, "profile", repaired)) as unknown as Doc);
    return repaired;
  }
  if (existing.name !== actor.name || existing.role !== actor.role || existing.team !== actor.team) {
    await deps.store.set(PATH.user(actor.uid), { name: actor.name, role: actor.role, team: actor.team, updatedAt: now }, true);
    return { ...existing, name: actor.name, role: actor.role, team: actor.team };
  }
  return existing;
}

export interface OnboardInput {
  consent: boolean;
  answers: unknown;
  track: TrackId;
  language?: string;
}

/** Consent, the track (effective-dated), and the baseline task (FR-001, FR-004, MSRS §9.1). */
export async function onboard(deps: Deps, actor: Actor, input: OnboardInput): Promise<{ profile: DevProfile; taskId: string }> {
  assertActive(actor);
  if (input.consent !== true) throw new DevError(400, "consent", "Please read and accept how the Development OS works first.");
  if (!TRACKS.includes(input.track)) throw new DevError(400, "track", "Pick Sales, Technical or Admin.");
  const policy = await loadPolicy(deps);
  await ensureProfile(deps, actor);
  const now = deps.now();
  const answers = cleanAnswers(input.answers);
  const language = policy.languages.includes(input.language ?? "") ? input.language! : policy.languages[0] ?? "en";
  return deps.store.tx(async (t) => {
    const p = (await t.get(PATH.user(actor.uid))) as unknown as DevProfile;
    if (p.onboarding.baseline === "complete") throw new DevError(409, "onboarded", "You have already finished onboarding.");
    const existingTask = p.onboarding.baselineTaskId ? await t.get(PATH.task(actor.uid, p.onboarding.baselineTaskId)) : null;
    const suggested = suggestTrack(answers, policy.defaultTrackByRole[actor.role] ?? "admin");
    const history = [...p.trackHistory];
    if (!history.length || history[history.length - 1].track !== input.track) {
      if (history.length) history[history.length - 1] = { ...history[history.length - 1], to: now };
      history.push({ track: input.track, from: now, by: actor.uid, reason: input.track === suggested ? "chosen at onboarding (as suggested)" : `chosen at onboarding (suggested ${suggested})`, policyVersion: policy.version });
    }
    const next: DevProfile = {
      ...p, status: "active", track: input.track, trackHistory: history, codingRequired: codingFromAnswers(answers), language,
      onboarding: { ...p.onboarding, consentAt: p.onboarding.consentAt ?? now, answers, suggested, baseline: "in_progress", baselineTaskId: "baseline" },
      updatedAt: now,
    };
    if (!existingTask) {
      const blueprint = baselineBlueprint(next);
      const task: DevTask = {
        id: "baseline", uid: actor.uid, kind: "baseline", title: "Your baseline — ten short challenges",
        why: "A first, honest picture of where you are in each of the ten dimensions. There are no wrong reasons to miss — it only sets your starting plan.",
        track: next.track, dims: [...DIMENSION_IDS], day: istDay(now), createdAt: now, dueAt: now + policy.cadence.baselineDueDays * 86_400_000,
        state: "assigned", events: [{ from: null, to: "assigned", at: now, by: "system", reason: "onboarding complete" }],
        blueprint, estMinutes: blueprint.reduce((m, s) => m + (s.type === "open" ? 5 : 2), 0), xpReward: policy.xp.baselineComplete, difficulty: 2, idem: "baseline",
      };
      t.set(PATH.task(actor.uid, task.id), task as unknown as Doc);
    }
    t.set(PATH.user(actor.uid), (await signRecord(deps.secrets, "profile", next)) as unknown as Doc);
    return { profile: next, taskId: "baseline" };
  });
}

// ── Today ────────────────────────────────────────────────────────────────────────────────────────

export interface TodayResult {
  created: string[];
  reason?: string;
}

/**
 * Make sure today's quest and this week's challenge exist for this person (idempotent: deterministic ids). Called by
 * the learner's app on open AND by the tick for everyone — the tick is what makes it run with every browser closed.
 */
export async function ensureTodayFor(deps: Deps, policy: DevPolicy, uid: string, opts: { role: string; externalCreator?: boolean; isActive?: boolean } ): Promise<TodayResult> {
  const now = deps.now();
  const day = istDay(now);
  const profile = (await deps.store.get(PATH.user(uid))) as unknown as DevProfile | null;
  if (!profile) return { created: [], reason: "no_profile" };
  if (profile.status !== "active") return { created: [], reason: profile.status };
  if (!isLearnerUnder(policy, { uid, role: opts.role, externalCreator: opts.externalCreator, isActive: opts.isActive }, profile.enrolled ?? true)) return { created: [], reason: "not_enrolled" };
  if (profile.onboarding.baseline !== "complete") return { created: [], reason: "baseline_first" };
  const { cal } = await calendarFor(deps, policy);
  if (!isWorkday(day, cal)) return { created: [], reason: "day_off" };
  const away = await awayDays(deps, uid);
  if (away.has(day)) return { created: [], reason: "on_leave" };
  const created: string[] = [];
  const season = seasonOf(day, policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);

  const questId = `quest_${day}`;
  const plan = questBlueprint(profile, policy, now);
  const madeQuest = await deps.store.tx(async (t) => {
    if (await t.get(PATH.task(uid, questId))) return false;
    const score = (await t.get(PATH.seasonScore(season.id, uid))) as unknown as SeasonScore | null;
    const fresh = (await t.get(PATH.user(uid))) as unknown as DevProfile;
    // Due at the policy's hour (23:00 IST — it was ignored and the quest closed at midnight); one made less than an hour
    // before that (a baseline finished late in the evening) keeps an hour, up to the end of the day.
    const dueAt = Math.max(istAt(day, policy.cadence.questDueHour), Math.min(istEndOfDay(day), now + 3_600_000));
    const task: DevTask = {
      id: questId, uid, kind: "quest", title: "Today's quest", why: plan.reasons[0] ?? "Your daily practice, chosen from your own evidence.",
      track: profile.track, dims: [...new Set(plan.slots.map((s) => s.dim))], day, createdAt: now, dueAt,
      state: "assigned", events: [{ from: null, to: "assigned", at: now, by: "system", reason: "daily quest" }],
      blueprint: plan.slots, estMinutes: plan.estMinutes, xpReward: policy.xp.questComplete, difficulty: plan.slots[0]?.difficulty ?? 2, idem: questId,
    };
    t.set(PATH.task(uid, questId), task as unknown as Doc);
    const ss = score && score.seasonId === season.id ? score : emptySeasonScore(profile, season.id, now);
    t.set(PATH.seasonScore(season.id, uid), { ...ss, questsAssigned: ss.questsAssigned + 1, updatedAt: now } as unknown as Doc);
    // The day's quest count (the Control Center compares it with the quests finished that day).
    const days = [...(fresh?.days ?? [])];
    const i = days.findIndex((x) => x.day === day);
    if (i >= 0) days[i] = { ...days[i], assigned: (days[i].assigned ?? 0) + 1 };
    else days.push({ day, assigned: 1, done: 0, questDone: 0, items: 0, correct: 0, xp: 0 });
    t.set(PATH.user(uid), { days: days.slice(-21), updatedAt: now }, true);
    return true;
  });
  if (madeQuest) created.push(questId);

  if (policy.cadence.weeklyChallenge) {
    const week = weekKeyOf(day);
    const chId = `challenge_${week}`;
    const def = nextChallenge(profile.track, profile.practicalSeen ?? []);
    if (def) {
      const levels = def.dims.map((d) => profile.dims[d].level);
      const difficulty = Math.max(2, Math.min(5, Math.round(levels.reduce((a, b) => a + b, 0) / levels.length))) as DevTask["difficulty"];
      const due = istAt(lastWorkdayOfWeek(day, cal), policy.cadence.challengeDueHour);
      const madeChallenge = await deps.store.tx(async (t) => {
        if (await t.get(PATH.task(uid, chId))) return false;
        const p = (await t.get(PATH.user(uid))) as unknown as DevProfile;
        const score = (await t.get(PATH.seasonScore(season.id, uid))) as unknown as SeasonScore | null;
        const task: DevTask = {
          id: chId, uid, kind: "challenge", title: def.title, why: `This week's practical challenge for ${def.dims.map((d) => DIMENSION_BY_ID[d].name).join(" and ")} — real work, real evidence.`,
          track: def.track, dims: def.dims, day, createdAt: now, dueAt: due < now ? istEndOfDay(day) : due, state: "assigned",
          events: [{ from: null, to: "assigned", at: now, by: "system", reason: "weekly practical challenge" }],
          brief: def.brief, evidence: def.evidence, rubric: { version: `${def.id}-v1`, criteria: def.criteria, passMark: difficulty >= 4 ? 70 : 60 },
          estMinutes: 45, xpReward: policy.xp.practicalPassed, difficulty, idem: chId, challengeId: def.id,
        };
        t.set(PATH.task(uid, chId), task as unknown as Doc);
        t.set(PATH.user(uid), { practicalSeen: [...(p.practicalSeen ?? []), def.id].slice(-200), updatedAt: now }, true);
        const ss = score && score.seasonId === season.id ? score : emptySeasonScore(profile, season.id, now);
        t.set(PATH.seasonScore(season.id, uid), { ...ss, practicalAssigned: ss.practicalAssigned + 1, updatedAt: now } as unknown as Doc);
        return true;
      });
      if (madeChallenge) created.push(chId);
    }
  }
  return { created };
}

export async function ensureToday(deps: Deps, actor: Actor): Promise<TodayResult> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  await ensureProfile(deps, actor);
  return ensureTodayFor(deps, policy, actor.uid, { role: actor.role, externalCreator: actor.externalCreator, isActive: actor.isActive });
}

// ── Sessions ─────────────────────────────────────────────────────────────────────────────────────

async function ownTask(deps: Deps, uid: string, taskId: string): Promise<DevTask> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(taskId)) throw new DevError(400, "bad_task", "That task id is not valid.");
  const task = (await deps.store.get(PATH.task(uid, taskId))) as unknown as DevTask | null;
  if (!task) throw new DevError(404, "no_task", "That task is not yours or no longer exists.");
  return task;
}

export interface PlayState {
  task: DevTask;
  session: DevSession | null;
  item: PublicItem | null;
  slotIndex: number;
  reason?: string;
  /** The hints already shown for the item on screen — a person who leaves and comes back sees them again. */
  hints?: string[];
}

/** The hints already shown for a served item (they count in its score whether or not the screen still shows them). */
async function shownHints(deps: Deps, uid: string, qid: string | undefined): Promise<string[]> {
  if (!qid) return [];
  const ex = (await deps.store.get(PATH.exposure(uid, qid))) as unknown as Exposure | null;
  const n = ex?.hintsShown ?? 0;
  if (!n) return [];
  const q = (await deps.store.get(PATH.question(qid))) as unknown as QuestionDoc | null;
  const key = q ? await open<ItemKey>(deps.secrets, q.key) : null;
  return key ? key.hints.slice(0, n) : [];
}

/** Open a question-based task: its session is made from the task's blueprint on first start. */
export async function startTask(deps: Deps, actor: Actor, taskId: string): Promise<PlayState> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  const task = await ownTask(deps, actor.uid, taskId);
  if (!task.blueprint?.length) throw new DevError(400, "practical", "This is a practical task — open it to submit your evidence.");
  const now = deps.now();
  if (["expired", "cancelled", "system_error"].includes(task.state)) throw new DevError(409, task.state, "This task is closed.");
  if (task.kind !== "baseline" && now > task.dueAt + policy.scoring.timeGraceSec * 1000 && ["assigned"].includes(task.state)) throw new DevError(409, "expired", "This task's time is up.");
  const profile = (await deps.store.get(PATH.user(actor.uid))) as unknown as DevProfile | null;
  await deps.store.tx(async (t) => {
    const existing = await t.get(PATH.session(actor.uid, taskId));
    const fresh = (await t.get(PATH.task(actor.uid, taskId))) as unknown as DevTask;
    if (!existing) {
      const purpose = task.blueprint![0].purpose;
      const session: DevSession = {
        id: taskId, uid: actor.uid, taskId, purpose, track: task.track, language: profile?.language ?? "en", policyVersion: policy.version,
        slots: task.blueprint!.map((s) => ({ ...s, state: "pending" })), state: "open", createdAt: now, startedAt: now,
        dueAt: TIMED.includes(purpose) ? Math.min(task.dueAt, now + (purpose === "league" ? policy.cadence.leagueMinutes : policy.rankAssessment.minutes) * 60_000) : task.dueAt,
        forRank: task.forRank, roundId: task.roundId,
      };
      t.set(PATH.session(actor.uid, taskId), session as unknown as Doc);
    }
    if (fresh.state === "assigned") {
      t.set(PATH.task(actor.uid, taskId), { ...fresh, state: "in_progress", events: [...fresh.events, { from: "assigned", to: "in_progress", at: now, by: actor.uid, reason: "started" }] } as unknown as Doc);
    }
  });
  return nextItem(deps, actor, taskId);
}

/** The current item of a task's session (serving the next one when needed). */
export async function nextItem(deps: Deps, actor: Actor, taskId: string): Promise<PlayState> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  const task = await ownTask(deps, actor.uid, taskId);
  const purpose = task.blueprint?.[0]?.purpose ?? "practice";
  const r = await serveNext(deps, policy, actor.uid, taskId, !NO_HINTS.includes(purpose));
  if (!r.item && r.session.state !== "open") await settleTask(deps, policy, actor.uid, taskId);
  const latestTask = r.item ? task : ((await deps.store.get(PATH.task(actor.uid, taskId))) as unknown as DevTask);
  const slotIndex = r.session.slots.findIndex((s) => s.state === "served");
  const hints = r.item && !NO_HINTS.includes(purpose) ? await shownHints(deps, actor.uid, r.item.qid) : [];
  return { task: latestTask, session: r.session, item: r.item, slotIndex, reason: r.reason, hints };
}

/** The next hint for the item on screen (FR-023): approach first; never in an assessment. */
export async function hint(deps: Deps, actor: Actor, taskId: string, slotIndex: number): Promise<{ hint: string; used: number; left: number }> {
  assertActive(actor);
  const session = (await deps.store.get(PATH.session(actor.uid, taskId))) as unknown as DevSession | null;
  const slot = session?.slots[slotIndex];
  if (!session || !slot || slot.state !== "served" || !slot.qid) throw new DevError(409, "no_item", "There is no open question to give a hint for.");
  if (NO_HINTS.includes(slot.purpose)) throw new DevError(403, "no_hints", "Hints are off in assessments.");
  const q = (await deps.store.get(PATH.question(slot.qid))) as unknown as QuestionDoc | null;
  const key = q ? await open<ItemKey>(deps.secrets, q.key) : null;
  if (!key) throw new DevError(500, "key", "This question's hints cannot be read.");
  return deps.store.tx(async (t) => {
    const ex = (await t.get(PATH.exposure(actor.uid, slot.qid!))) as unknown as Exposure;
    const used = ex?.hintsShown ?? 0;
    const max = Math.min(3, key.hints.length);
    if (used >= max) return { hint: key.hints[max - 1] ?? "", used, left: 0 };
    t.set(PATH.exposure(actor.uid, slot.qid!), { hintsShown: used + 1 }, true);
    return { hint: key.hints[used], used: used + 1, left: max - used - 1 };
  });
}

// ── Answering ───────────────────────────────────────────────────────────────────────────────────

export interface AnswerInput {
  taskId: string;
  slotIndex: number;
  response: AttemptResponse;
  /**
   * ── Why a written answer can skip grading here (2026-10-19) ──
   * Answers are revealed at the END of a task now (owner: a result after every question broke the flow), so the screen
   * goes straight to the next question. Grading a written answer inside this request held that next question for the
   * judges' 20–60 s — and on Vercel's 60 s limit a baseline's two judges were cut off, leaving it "Being graded" for
   * hours until a cron ran. With `defer` the answer is saved and queued (as always) and returned at once; the browser
   * then asks `grade` in a separate request with its own time. The queue and the tick stay the safety net.
   */
  defer?: boolean;
}

export interface AnswerResult {
  attempt: DevAttempt;
  session: DevSession;
  xpGained: number;
  /** Where the XP came from (the ledger rows' reasons) — a wrong last baseline answer showed "+127 XP" unexplained. */
  xpLines?: { amount: number; reason: string }[];
  badges: string[];
  rankUp: number | null;
  taskState: string | null;
  remediationTaskId: string | null;
  /** When this answer finished the baseline: today's plan as made then (why there is no quest, e.g. "day_off"). */
  today?: { reason?: string };
}

function validResponse(type: PublicItem["type"], r: AttemptResponse, optionCount: number): boolean {
  if (!r || typeof r !== "object") return false;
  if (type === "mcq" || type === "multi") return r.kind === "choice" && Array.isArray(r.selected) && r.selected.length > 0 && r.selected.length <= optionCount && r.selected.every((i) => Number.isInteger(i) && i >= 0 && i < optionCount);
  if (type === "numeric") return r.kind === "number" && typeof r.value === "number" && Number.isFinite(r.value);
  // An order is a permutation of the options — each exactly once.
  if (type === "order") return r.kind === "order" && Array.isArray(r.order) && r.order.length === optionCount && new Set(r.order).size === optionCount && r.order.every((i) => Number.isInteger(i) && i >= 0 && i < optionCount);
  // An empty written answer is refused, not recorded as a 0 that uses the question up (a glitching or crafted client
  // could burn it — the browser test did). A real but very short answer is still graded (and scores 0 under 5 words).
  if (type === "open") return r.kind === "text" && typeof r.text === "string" && r.text.trim().length > 0 && r.text.length <= 6000;
  return false;
}

export async function answer(deps: Deps, actor: Actor, input: AnswerInput): Promise<AnswerResult> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  const uid = actor.uid;
  const { taskId, slotIndex } = input;
  const attemptId = `${taskId}_${slotIndex}`;
  const already = (await deps.store.get(PATH.attempt(uid, attemptId))) as unknown as DevAttempt | null;
  const sessionNow = (await deps.store.get(PATH.session(uid, taskId))) as unknown as DevSession | null;
  if (already && sessionNow) return { attempt: already, session: sessionNow, xpGained: 0, badges: [], rankUp: null, taskState: null, remediationTaskId: null };
  if (!sessionNow) throw new DevError(404, "no_session", "Start the task first.");
  const slot = sessionNow.slots[slotIndex];
  if (!slot || slot.state !== "served" || !slot.qid || !slot.item) throw new DevError(409, "no_item", "This question is not open for an answer.");
  const q = (await deps.store.get(PATH.question(slot.qid))) as unknown as QuestionDoc | null;
  const key = q ? await open<ItemKey>(deps.secrets, q.key) : null;
  if (!q || !key) throw new DevError(500, "key", "This question could not be scored; it will not count against you.");
  const item = slot.item;
  if (!validResponse(item.type, input.response, item.options?.length ?? 0)) throw new DevError(400, "bad_answer", "That answer is not in the right form for this question.");
  const exposure = (await deps.store.get(PATH.exposure(uid, slot.qid))) as unknown as Exposure | null;
  const now = deps.now();
  const servedAt = slot.servedAt ?? now;
  const hints = exposure?.hintsShown ?? 0;
  const grace = policy.scoring.timeGraceSec * 1000;
  let outcome: DevAttempt["outcome"] = "pending_validation";
  let reasonCode: string | undefined;
  // The baseline has no deadline (it stays open, a week at a time): before, its session kept the first week's date, so
  // after a week every answer was recorded as "expired" and those skills were never measured.
  if (sessionNow.purpose !== "baseline" && now > sessionNow.dueAt + grace) { outcome = "expired"; reasonCode = "deadline"; }
  else if (TIMED.includes(slot.purpose) && now - servedAt > item.timeLimitSec * 1000 + grace) { outcome = "expired"; reasonCode = "time_limit"; }

  const profile = (await deps.store.get(PATH.user(uid))) as unknown as DevProfile;
  const base: DevAttempt = {
    id: attemptId, uid, sessionId: taskId, taskId, purpose: slot.purpose, track: profile.track, dim: slot.dim, difficulty: q.difficulty,
    qid: q.id, qversion: q.version, family: q.family, form: q.form, setting: q.setting, source: q.source, item,
    response: input.response, servedAt, submittedAt: now, ms: Math.max(0, now - servedAt), hintsUsed: hints, language: profile.language,
    rubricVersion: key.rubric?.version, policyVersion: policy.version, outcome, reasonCode, createdAt: now,
  };
  let attempt: DevAttempt = base;
  if (outcome === "expired") {
    attempt = { ...base, feedback: { headline: reasonCode === "time_limit" ? "Time ran out on this one." : "This task's deadline passed before the answer arrived.", steps: [], explanation: key.explanation, gap: "none" } };
  } else if (item.type !== "open") {
    const res = scoreObjective(item.type, key, input.response, exposure?.optionOrder, hints, policy.scoring.hintPenalty);
    if (!res) throw new DevError(400, "bad_answer", "That answer is not in the right form for this question.");
    const passed = res.correct;
    const remediable = !passed && ["quest", "practice", "transfer", "retention"].includes(slot.purpose);
    const fb: Feedback = {
      headline: passed ? (hints ? `Correct — with ${hints} hint${hints > 1 ? "s" : ""}.` : "Correct.") : "Not quite — here is how to see it.",
      steps: passed ? [] : key.hints,
      explanation: key.explanation,
      gap: passed ? "none" : q.gap ?? "reading",
      next: remediable ? "A fresh try at this skill, in a new situation, is waiting in your tasks." : undefined,
    };
    attempt = {
      ...base, outcome: passed ? "passed" : "failed",
      scoring: { method: "deterministic", score: res.score, passed, correct: res.correct, confidence: "high", codes: res.codes, at: now },
      reveal: { correct: res.revealCorrect, value: key.value, order: res.revealOrder, explanation: key.explanation },
      feedback: fb,
    };
  }
  // Record the attempt (and the slot) before anything is shown (FR-015, AC-008).
  const signed = await signRecord(deps.secrets, "attempt", attempt);
  const recorded = await deps.store.tx(async (t) => {
    const existing = (await t.get(PATH.attempt(uid, attemptId))) as unknown as DevAttempt | null;
    const s = (await t.get(PATH.session(uid, taskId))) as unknown as DevSession;
    const p = (await t.get(PATH.user(uid))) as unknown as DevProfile;
    // An open answer joins the grading queue with its save (queue.ts): read before any write, as transactions need.
    const queue = attempt.outcome === "pending_validation" ? await t.get(QUEUE_PATH) : null;
    if (existing) return { attempt: existing, session: s, fresh: false };
    const minute = Math.floor(now / 60_000);
    const rate = p.rate && p.rate.minute === minute ? p.rate.count + 1 : 1;
    if (rate > 20) throw new DevError(429, "too_fast", "Too many answers in a minute — slow down a little.");
    const sl = s.slots[slotIndex];
    s.slots[slotIndex] = {
      ...sl, state: attempt.outcome === "expired" ? "expired" : "answered", attemptId,
      score: attempt.scoring?.score, passed: attempt.scoring?.passed, pending: attempt.outcome === "pending_validation" || undefined,
    };
    if (s.slots.every((x) => x.state === "answered" || x.state === "expired" || x.state === "skipped_system")) {
      s.state = "complete";
      s.completedAt = now;
    }
    t.set(PATH.attempt(uid, attemptId), signed as unknown as Doc);
    t.set(PATH.session(uid, taskId), s as unknown as Doc);
    t.set(PATH.exposure(uid, slot.qid!), { state: attempt.outcome === "expired" ? "expired" : "answered", answeredAt: now }, true);
    t.set(PATH.user(uid), { rate: { minute, count: rate }, lastActiveAt: now, updatedAt: now, ...(attempt.outcome === "pending_validation" ? { stats: { ...p.stats, pending: p.stats.pending + 1 } } : {}) }, true);
    t.set(PATH.question(q.id), { stats: { answered: (q.stats?.answered ?? 0) + 1, correct: (q.stats?.correct ?? 0) + (attempt.scoring?.passed ? 1 : 0), totalMs: (q.stats?.totalMs ?? 0) + attempt.ms, flags: q.stats?.flags ?? 0 } }, true);
    if (attempt.outcome === "pending_validation") t.set(QUEUE_PATH, withQueued(queue, { uid, kind: "attempt", id: attemptId }, now) as unknown as Doc);
    return { attempt: signed as DevAttempt, session: s, fresh: true };
  });
  if (!recorded.fresh) return { attempt: recorded.attempt, session: recorded.session, xpGained: 0, badges: [], rankUp: null, taskState: null, remediationTaskId: null };

  if (item.type === "open" && attempt.outcome === "pending_validation") {
    const graded = input.defer ? null : await finishOpenGrading(deps, policy, uid, attemptId);
    if (graded) return graded;
    const s = (await deps.store.get(PATH.session(uid, taskId))) as unknown as DevSession;
    return { attempt: recorded.attempt, session: s, xpGained: 0, badges: [], rankUp: null, taskState: null, remediationTaskId: null };
  }
  // Calibration counts every scored answer to its pattern (FR-013; an expired one says nothing about the question).
  if (attempt.outcome === "passed" || attempt.outcome === "failed") await recordCalibration(deps, q, attempt.outcome === "passed", attempt.ms);
  return applyAndSummarize(deps, policy, uid, attemptId, taskId);
}

async function applyAndSummarize(deps: Deps, policy: DevPolicy, uid: string, attemptId: string, taskId: string): Promise<AnswerResult> {
  const out = await applyAttempt(deps, policy, uid, attemptId);
  const attempt = (await deps.store.get(PATH.attempt(uid, attemptId))) as unknown as DevAttempt;
  const session = (await deps.store.get(PATH.session(uid, taskId))) as unknown as DevSession;
  if (out) await refreshBoardsIfStale(deps, policy).catch((e) => deps.log("warn", "boards not refreshed", e instanceof Error ? e.message : e));
  let today: TodayResult | null = null;
  if (out?.task?.kind === "baseline" && out.profile.onboarding.baseline === "complete") {
    // The plan starts the moment the baseline ends: today's quest (on a working day) now, not at the next page open or
    // the tick — the browser test finished a Monday baseline and found "Nothing waiting". Its reason goes back with the
    // answer, so a Sunday says "a day off" in the same visit (it said so only after reopening).
    today = await ensureTodayFor(deps, policy, uid, { role: out.profile.role, isActive: true })
      .catch((e) => { deps.log("warn", "first quest not created", e instanceof Error ? e.message : e); return null; });
  }
  return {
    ...(today ? { today: { reason: today.reason } } : {}),
    attempt, session,
    xpGained: out ? out.xp.reduce((a, x) => a + x.amount, 0) : 0,
    xpLines: out ? out.xp.filter((x) => x.amount > 0).map((x) => ({ amount: x.amount, reason: x.reason })) : [],
    badges: out ? out.achievements.map((a) => a.badge) : [],
    rankUp: out?.rankEvent ? out.rankEvent.newRank : null,
    taskState: out?.task?.state ?? null,
    remediationTaskId: out?.newTasks[0]?.id ?? null,
  };
}

/**
 * Grade a pending open answer and apply it. Used right after the answer (when the AI answers in time) and by the tick
 * (bounded by `gradeRetryLimit`; after that the attempt becomes a system error that never counts against the
 * learner — FR-030).
 */
export async function finishOpenGrading(deps: Deps, policy: DevPolicy, uid: string, attemptId: string): Promise<AnswerResult | null> {
  const attempt = (await deps.store.get(PATH.attempt(uid, attemptId))) as unknown as DevAttempt | null;
  if (!attempt || attempt.outcome !== "pending_validation" || attempt.response.kind !== "text") return null;
  const q = (await deps.store.get(PATH.question(attempt.qid))) as unknown as QuestionDoc | null;
  const key = q ? await open<ItemKey>(deps.secrets, q.key) : null;
  if (!key?.rubric) return null;
  const res = await gradeOpen(deps, policy, {
    scenario: attempt.item.scenario, question: attempt.item.question, rubric: key.rubric, exemplar: key.exemplar,
    answer: attempt.response.text, purpose: attempt.purpose,
  });
  const now = deps.now();
  const tries = (attempt.gradeTries ?? 0) + 1;
  if (!res.scoring) {
    const giveUp = tries >= policy.scoring.gradeRetryLimit;
    await deps.store.tx(async (t) => {
      const a = (await t.get(PATH.attempt(uid, attemptId))) as unknown as DevAttempt;
      if (a.outcome !== "pending_validation") return;
      const patch: Partial<DevAttempt> = { gradeTries: tries };
      if (giveUp) {
        patch.outcome = "system_error";
        patch.reasonCode = res.reason ?? "grading_unavailable";
        patch.feedback = { headline: "We could not grade this answer reliably, so it does not count against you.", steps: [], explanation: key.explanation, gap: "none" };
        patch.reveal = { explanation: key.explanation, exemplar: key.exemplar };
      }
      t.set(PATH.attempt(uid, attemptId), patch as unknown as Doc, true);
      if (giveUp) {
        const s = (await t.get(PATH.session(uid, attempt.sessionId))) as unknown as DevSession | null;
        if (s) {
          const i = s.slots.findIndex((x) => x.attemptId === attemptId);
          if (i >= 0) s.slots[i] = { ...s.slots[i], pending: undefined, score: undefined, passed: undefined, state: "skipped_system" };
          t.set(PATH.session(uid, attempt.sessionId), s as unknown as Doc);
        }
      }
    });
    if (giveUp) {
      await dequeueGrading(deps, [{ uid, id: attemptId }]).catch(() => undefined);
      await deps.notify.send({ uid, type: "devos_result", title: "An answer could not be graded", message: "It will not count against you — try a fresh one from your Development OS.", link: "/dev-os", key: `devos_ungraded_${uid}_${attemptId}`, push: false }).catch(() => false);
      await settleTask(deps, policy, uid, attempt.taskId!);
    } else {
      // The tick tries again (bounded) — nobody has to come back for it.
      await enqueueGrading(deps, { uid, kind: "attempt", id: attemptId });
    }
    return null;
  }
  const scoring = res.scoring;
  const feedback = openFeedback(key.rubric, scoring, key.explanation);
  const outcome = scoring.passed ? "passed" : "failed";
  const final: DevAttempt = { ...attempt, scoring, outcome, feedback, reveal: { explanation: key.explanation, exemplar: key.exemplar }, gradeTries: tries };
  const signed = await signRecord(deps.secrets, "attempt", final);
  const written = await deps.store.tx(async (t) => {
    const a = (await t.get(PATH.attempt(uid, attemptId))) as unknown as DevAttempt;
    if (a.outcome !== "pending_validation") return false;
    const s = (await t.get(PATH.session(uid, attempt.sessionId))) as unknown as DevSession | null;
    const p = (await t.get(PATH.user(uid))) as unknown as DevProfile;
    t.set(PATH.attempt(uid, attemptId), signed as unknown as Doc);
    if (s) {
      const i = s.slots.findIndex((x) => x.attemptId === attemptId);
      if (i >= 0) s.slots[i] = { ...s.slots[i], score: scoring.score, passed: scoring.passed, pending: undefined };
      t.set(PATH.session(uid, attempt.sessionId), s as unknown as Doc);
    }
    t.set(PATH.user(uid), { stats: { ...p.stats, pending: Math.max(0, p.stats.pending - 1) }, updatedAt: now }, true);
    return true;
  });
  if (!written) return null;
  await dequeueGrading(deps, [{ uid, id: attemptId }]).catch(() => undefined); // graded — out of the queue (the tick would also tidy it)
  if (q) await recordCalibration(deps, q, outcome === "passed", attempt.ms);
  const result = await applyAndSummarize(deps, policy, uid, attemptId, attempt.taskId!);
  if (deps.now() - attempt.submittedAt > 120_000) {
    await deps.notify.send({ uid, type: "devos_result", title: `Your answer was graded: ${scoring.score}%`, message: feedback.headline, link: `/dev-os/history/${attemptId}`, key: `devos_graded_${uid}_${attemptId}`, push: true }).catch(() => false);
  }
  return result;
}

/** How long one `grade` claim on an answer holds (a request is cut off at 60 s; the tick may take it after that). */
export const GRADE_CLAIM_MS = 60_000;

/**
 * The learner's own written answers (and submitted practicals) that wait for a grade, graded NOW (2026-10-19): one per request (a baseline answer
 * needs two judges — 20–60 s — inside Vercel's 60 s), the given one or the oldest of theirs in the queue. Before, an
 * answer whose grading did not finish inside its own request waited for the next cron (up to hours) and read "Being
 * graded" the whole time — with the baseline, and so the plan, quests and Career, held behind it. Only the caller's own
 * answers (`actor.uid`); a claim (`gradeClaimAt`) lets one request grade an answer at a time, at most once a minute, so
 * a reloading or double-opened page never stacks AI calls or burns its bounded tries (`gradeRetryLimit`).
 */
export async function gradeMine(deps: Deps, actor: Actor, target: { attemptId?: string; taskId?: string } = {}): Promise<{ graded: number; waiting: number; today?: { reason?: string } }> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  const uid = actor.uid;
  type Job = { kind: "attempt" | "task"; id: string };
  const mine = async () => (((await deps.store.get(QUEUE_PATH))?.items as { uid: string; kind: string; id: string; since: number }[] | undefined) ?? [])
    .filter((x) => x.uid === uid && (x.kind === "attempt" || x.kind === "task"));
  const queued: Job[] = (await mine()).sort((a, b) => a.since - b.since).map((x) => ({ kind: x.kind as Job["kind"], id: x.id }));
  const asked: Job[] = [
    ...(target.attemptId ? [{ kind: "attempt" as const, id: target.attemptId }] : []),
    ...(target.taskId ? [{ kind: "task" as const, id: target.taskId }] : []),
  ];
  const candidates = [...asked, ...queued.filter((q) => !asked.some((a) => a.kind === q.kind && a.id === q.id))];
  let graded = 0;
  let today: { reason?: string } | undefined;
  for (const job of candidates.slice(0, 3)) {
    if (!/^[A-Za-z0-9_.-]{1,120}$/.test(job.id)) continue;
    const now = deps.now();
    // Claimed in a transaction: only something of the caller's that is really waiting, and not taken in the last minute.
    const claimed = await deps.store.tx(async (t) => {
      if (job.kind === "attempt") {
        const a = (await t.get(PATH.attempt(uid, job.id))) as unknown as DevAttempt | null;
        if (!a || a.outcome !== "pending_validation" || a.response.kind !== "text") return false;
        if ((a.gradeClaimAt ?? 0) > now - GRADE_CLAIM_MS) return false;
        t.set(PATH.attempt(uid, job.id), { gradeClaimAt: now } as unknown as Doc, true);
        return true;
      }
      const k = (await t.get(PATH.task(uid, job.id))) as unknown as DevTask | null;
      if (!k || k.state !== "completed" || k.scoring || !k.submission) return false;
      if ((k.gradeClaimAt ?? 0) > now - GRADE_CLAIM_MS) return false;
      t.set(PATH.task(uid, job.id), { gradeClaimAt: now } as unknown as Doc, true);
      return true;
    });
    if (!claimed) continue;
    if (job.kind === "attempt") {
      const r = await finishOpenGrading(deps, policy, uid, job.id);
      if (r) {
        graded++;
        if (r.today) today = r.today;
      }
    } else if (await gradePractical(deps, policy, uid, job.id)) graded++; // it takes itself out of the queue
    break; // one grading per request — its judges need the time
  }
  return { graded, waiting: (await mine()).length, ...(today ? { today } : {}) };
}

// ── The learner's own profile ───────────────────────────────────────────────────────────────────

/**
 * The person changes what they told the onboarding (their work, tools, coding) and their track (2026-10-19, owner: "keep
 * option user also edit that category and skills preferences"). The track change is effective-dated in `trackHistory`
 * exactly like an admin's (`adminSetTrack`) and recorded as the person's own; a track only changes the training content
 * (situations and weights) — never a permission (FR-002). Tasks already made keep their track; new ones use the new one.
 */
export async function updatePreferences(deps: Deps, actor: Actor, input: { answers: unknown; track: TrackId }): Promise<{ profile: DevProfile }> {
  assertActive(actor);
  if (!TRACKS.includes(input.track)) throw new DevError(400, "track", "Pick Sales, Technical or Admin.");
  const policy = await loadPolicy(deps);
  await ensureProfile(deps, actor);
  const now = deps.now();
  const answers = cleanAnswers(input.answers);
  if (!(answers.work ?? []).length) throw new DevError(400, "answers", "Pick at least one thing your work involves.");
  const out = await deps.store.tx(async (t) => {
    const p = (await t.get(PATH.user(actor.uid))) as unknown as DevProfile;
    if (p.onboarding.baseline === "not_started") throw new DevError(409, "not_onboarded", "Start with the onboarding first.");
    const suggested = suggestTrack(answers, policy.defaultTrackByRole[actor.role] ?? "admin");
    const history = [...p.trackHistory];
    const changed = p.track !== input.track;
    if (changed) {
      if (history.length) history[history.length - 1] = { ...history[history.length - 1], to: now };
      history.push({ track: input.track, from: now, by: actor.uid, reason: "changed by the person in their profile", policyVersion: policy.version });
    }
    const next: DevProfile = {
      ...p, track: input.track, trackHistory: history, codingRequired: codingFromAnswers(answers),
      onboarding: { ...p.onboarding, answers, suggested },
      ...(changed ? { summary: weightedSummary(p.dims, policy.weights[input.track]) } : {}),
      updatedAt: now,
    };
    t.set(PATH.user(actor.uid), (await signRecord(deps.secrets, "profile", next)) as unknown as Doc);
    return { profile: next, changed, from: p.track };
  });
  if (out.changed) {
    // Audited like an admin's change (admin.audit is not imported here: admin.ts imports this module).
    const ev: AuditEvent = { id: shortId("au_"), actor: actor.uid, actorName: actor.name, action: "self_set_track", target: actor.uid, at: now, policyVersion: policy.version, detail: `${out.from} → ${input.track}` };
    await deps.store.set(PATH.audit(ev.id), (await signRecord(deps.secrets, "audit", ev)) as unknown as Doc).catch(() => undefined);
  }
  return { profile: out.profile };
}

// ── More tasks on request ───────────────────────────────────────────────────────────────────────

export async function startPractice(deps: Deps, actor: Actor, dim?: DimensionId): Promise<{ taskId: string }> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  const profile = await ensureProfile(deps, actor);
  if (profile.onboarding.baseline !== "complete") throw new DevError(409, "baseline_first", "Finish your baseline first.");
  if (dim && !DIMENSION_IDS.includes(dim)) throw new DevError(400, "dim", "Unknown dimension.");
  const now = deps.now();
  const day = istDay(now);
  const existing = await deps.store.query(PATH.tasks(actor.uid), [["day", "==", day]]);
  const practiceToday = existing.filter((r) => r.data.kind === "practice").length;
  if (practiceToday >= 8) throw new DevError(429, "practice_limit", "That's plenty of practice for today — come back tomorrow (learning sticks better with rest).");
  const open = existing.find((r) => r.data.kind === "practice" && ["assigned", "in_progress"].includes(String(r.data.state)) && (!dim || (r.data.dims as string[])?.[0] === dim));
  if (open) return { taskId: open.id };
  const id = `practice_${day}_${practiceToday + 1}`;
  const slots = practiceBlueprint(profile, policy, now, dim);
  const task: DevTask = {
    id, uid: actor.uid, kind: "practice", title: `Practice: ${DIMENSION_BY_ID[slots[0].dim].name}`, why: slots[0].reason ?? "Extra practice.",
    track: profile.track, dims: [slots[0].dim], day, createdAt: now, dueAt: now + policy.cadence.practiceDueHours * 3_600_000, state: "assigned",
    events: [{ from: null, to: "assigned", at: now, by: actor.uid, reason: "practice on request" }],
    blueprint: slots, estMinutes: 3, xpReward: policy.xp.correctBase, difficulty: slots[0].difficulty, idem: id,
  };
  await deps.store.set(PATH.task(actor.uid, id), task as unknown as Doc);
  return { taskId: id };
}

export async function startRankAssessment(deps: Deps, actor: Actor): Promise<{ taskId: string }> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  let profile = await ensureProfile(deps, actor);
  const now = deps.now();
  // One rank assessment at a time, and a started one counts as taken. One still within its time is continued; one whose
  // time ran out is closed now — what was not answered counts as 0 — and recorded, so the cooldown applies. Before,
  // walking away and starting again the next day fished for an easier draw, with no cooldown.
  const openRank = (await deps.store.query(PATH.tasks(actor.uid), [["kind", "==", "rank"]]))
    .map((r) => r.data as unknown as DevTask)
    .filter((t) => t.state === "assigned" || t.state === "in_progress");
  let closedOne = false;
  for (const t of openRank) {
    const s = (await deps.store.get(PATH.session(actor.uid, t.id))) as unknown as DevSession | null;
    const over = s ? s.state !== "open" || now > s.dueAt : now > t.dueAt;
    if (!over) return { taskId: t.id };
    if (s && (await closeAndSettle(deps, policy, actor.uid, t.id, "the assessment's time ran out before it was answered"))) closedOne = true;
  }
  if (closedOne) profile = await ensureProfile(deps, actor);
  const gate = rankAssessmentOpen(profile, policy, now);
  if (!gate.open || !gate.level) throw new DevError(409, "rank_closed", gate.why);
  const day = istDay(now);
  const id = `rank_${gate.level}_${day}`;
  const existing = (await deps.store.get(PATH.task(actor.uid, id))) as unknown as DevTask | null;
  if (existing) return { taskId: id };
  const slots = rankBlueprint(profile, policy, gate.level);
  const task: DevTask = {
    id, uid: actor.uid, kind: "rank", title: `${rankLabel(policy, gate.level)} assessment`,
    why: `Fresh questions at the level ${rankLabel(policy, gate.level)} needs — ${policy.rankGates[gate.level as 2 | 3 | 4 | 5 | 6].assessmentPct}% to pass this gate. No hints; each question has a time limit.`,
    track: profile.track, dims: [...new Set(slots.map((s) => s.dim))], day, createdAt: now, dueAt: istEndOfDay(addDays(day, 1)), state: "assigned",
    events: [{ from: null, to: "assigned", at: now, by: actor.uid, reason: "rank assessment requested" }],
    blueprint: slots, estMinutes: policy.rankAssessment.minutes, xpReward: 0, difficulty: slots[0].difficulty, idem: id, forRank: gate.level,
  };
  await deps.store.set(PATH.task(actor.uid, id), task as unknown as Doc);
  return { taskId: id };
}

export async function setBoardPrivacy(deps: Deps, actor: Actor, hidden: boolean): Promise<void> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  await ensureProfile(deps, actor);
  const now = deps.now();
  await deps.store.set(PATH.user(actor.uid), { boardPrivate: !!hidden, updatedAt: now }, true);
  // At once, not at the next answer or rebuild (the browser test still saw the name on the boards): the season score
  // carries the flag the boards are built from, and this season's boards are rebuilt now.
  const season = seasonOf(istDay(now), policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  if (await deps.store.get(PATH.seasonScore(season.id, actor.uid))) {
    await deps.store.set(PATH.seasonScore(season.id, actor.uid), { hidden: !!hidden, updatedAt: now }, true);
  }
  await rebuildBoards(deps, policy, season.id);
}
