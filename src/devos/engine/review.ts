/**
 * After the answer: practical submissions and their grading, appeals, voiding a platform fault, the AI coach, and
 * replaying a dimension from its evidence (MSRS §8.3, §13.3 "correction / appeal without deleting the original",
 * FR-030, FR-031, FR-039).
 */
import { open } from "../core/crypto.js";
import { istDay } from "../core/days.js";
import { replayDimension } from "../core/mastery.js";
import type { DevPolicy } from "../core/policy.js";
import { weightedSummary } from "../core/mastery.js";
import type {
  DevAttempt, DevCorrection, DevEvidence, DevProfile, DevTask, DimensionId, ItemKey, QuestionDoc, Scoring, TaskSubmission,
} from "../core/types.js";
import { CHALLENGE_BY_ID } from "../content/challenges.js";
import { assertActive, DevError, loadPolicy, PATH, type Actor, type Deps } from "./context.js";
import { gradeOpen, openFeedback } from "./grading.js";
import { signRecord } from "./integrity.js";
import { applyTask } from "./progress.js";
import { dequeueGrading, enqueueGrading, QUEUE_PATH, withQueued } from "./queue.js";
import type { Doc } from "./store.js";

const PRACTICAL = new Set(["challenge", "mission_part", "capstone"]);
const URL_RE = /^https:\/\/[^\s/$.?#].[^\s]*$/i;

/** What is missing or wrong in a submission (empty = acceptable) — checked in code before any AI (FR-031). */
export function submissionProblems(task: Pick<DevTask, "evidence">, fields: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const req of task.evidence ?? []) {
    const v = fields[req.id];
    const empty = v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
    if (empty) {
      if (req.required) problems.push(`${req.label}: required.`);
      continue;
    }
    if (req.kind === "text") {
      if (typeof v !== "string") problems.push(`${req.label}: must be text.`);
      else if (req.required && v.trim().length < 15) problems.push(`${req.label}: write at least a sentence.`);
      else if (v.length > 3000) problems.push(`${req.label}: keep it under 3,000 characters.`);
    } else if (req.kind === "link") {
      if (typeof v !== "string" || !URL_RE.test(v.trim())) problems.push(`${req.label}: paste a full https:// link.`);
    } else if (req.kind === "number") {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) problems.push(`${req.label}: enter a number (0 or more).`);
    } else if (req.kind === "checklist") {
      const items = req.items ?? [];
      if (!Array.isArray(v) || v.length !== items.length || v.some((x) => x !== true)) problems.push(`${req.label}: tick every box (or fix what is missing first).`);
    }
  }
  return problems;
}

/** The submission as one text the judges grade (labels + values, in the evidence order). */
export function submissionText(task: Pick<DevTask, "evidence">, fields: Record<string, unknown>): string {
  return (task.evidence ?? []).map((r) => {
    const v = fields[r.id];
    const shown = Array.isArray(v) ? (r.items ?? []).map((it, i) => `${v[i] ? "[x]" : "[ ]"} ${it}`).join("; ") : String(v ?? "");
    return `${r.label}:\n${shown}`;
  }).join("\n\n");
}

/** `defer` (2026-10-19): save and queue only — the browser then asks `grade` in a request of its own (learner.gradeMine),
 *  so the two judges never race the submit request's 60 s. Without it the practical is graded here, as before. */
export async function submitPractical(deps: Deps, actor: Actor, input: { taskId: string; fields: Record<string, unknown>; defer?: boolean }): Promise<DevTask> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  const uid = actor.uid;
  const now = deps.now();
  const task = (await deps.store.get(PATH.task(uid, input.taskId))) as unknown as DevTask | null;
  if (!task) throw new DevError(404, "no_task", "That task is not yours or no longer exists.");
  if (!PRACTICAL.has(task.kind)) throw new DevError(400, "not_practical", "This task is answered question by question.");
  if (!["assigned", "in_progress"].includes(task.state)) throw new DevError(409, task.state, "This task was already submitted or closed.");
  if (now > task.dueAt + policy.scoring.timeGraceSec * 1000) throw new DevError(409, "expired", "The deadline for this challenge has passed.");
  const fields: Record<string, string | number | string[] | boolean[]> = {};
  for (const req of task.evidence ?? []) {
    const v = input.fields?.[req.id];
    if (typeof v === "string") fields[req.id] = v.slice(0, 3000);
    else if (typeof v === "number") fields[req.id] = v;
    else if (Array.isArray(v)) fields[req.id] = v.slice(0, 20).map((x) => x === true) as boolean[];
  }
  const problems = submissionProblems(task, fields);
  if (problems.length) throw new DevError(400, "evidence", problems.join(" "));
  const submission: TaskSubmission = { fields, at: now };
  await deps.store.tx(async (t) => {
    const fresh = (await t.get(PATH.task(uid, task.id))) as unknown as DevTask;
    const queue = await t.get(QUEUE_PATH);
    if (!["assigned", "in_progress"].includes(fresh.state)) throw new DevError(409, fresh.state, "This task was already submitted.");
    t.set(PATH.task(uid, task.id), {
      ...fresh, submission, state: "completed", submissionPending: true,
      events: [...fresh.events, { from: fresh.state, to: "completed", at: now, by: uid, reason: "evidence submitted — grading" }],
    } as unknown as Doc);
    // Queued with the save (queue.ts): a request cut off while the judges think still gets graded by the tick.
    t.set(QUEUE_PATH, withQueued(queue, { uid, kind: "task", id: task.id }, now) as unknown as Doc);
  });
  if (!input.defer) await gradePractical(deps, policy, uid, task.id);
  return (await deps.store.get(PATH.task(uid, task.id))) as unknown as DevTask;
}

/** Grade a submitted practical task with two judges, then apply it. Bounded retries; a give-up never counts against them. */
export async function gradePractical(deps: Deps, policy: DevPolicy, uid: string, taskId: string): Promise<boolean> {
  const task = (await deps.store.get(PATH.task(uid, taskId))) as unknown as DevTask | null;
  if (!task || task.state !== "completed" || task.scoring || !task.submission || !task.rubric) return false;
  const exemplar = (task.challengeId && CHALLENGE_BY_ID.get(task.challengeId)?.exemplar) || (task as DevTask & { exemplar?: string }).exemplar;
  const res = await gradeOpen(deps, policy, {
    scenario: task.brief ?? task.title, question: "Grade this submitted practical work against the rubric.",
    rubric: { ...task.rubric, maxWords: 900 }, exemplar, answer: submissionText(task, task.submission.fields as Record<string, unknown>),
    purpose: task.kind === "capstone" ? "capstone" : task.kind === "mission_part" ? "mission" : "challenge",
  });
  const now = deps.now();
  const tries = (task.gradeTries ?? 0) + 1;
  if (!res.scoring) {
    const giveUp = tries >= policy.scoring.gradeRetryLimit;
    await deps.store.set(PATH.task(uid, taskId), giveUp
      ? { gradeTries: tries, submissionPending: false, state: "system_error", events: [...task.events, { from: "completed", to: "system_error", at: now, by: "system", reason: `grading unavailable (${res.reason}) — not counted against you` }] }
      : { gradeTries: tries }, true);
    if (!giveUp) await enqueueGrading(deps, { uid, kind: "task", id: taskId });
    else await dequeueGrading(deps, [{ uid, id: taskId }]).catch(() => undefined);
    return false;
  }
  const scoring: Scoring = { ...res.scoring };
  if (task.kind === "capstone") {
    const impact = scoring.criteria?.find((c) => c.id === "impact");
    if (impact && impact.score >= 3 && scoring.confidence !== "low") scoring.codes = [...scoring.codes, "impact_verified"];
  }
  const feedback = openFeedback(task.rubric, scoring, exemplar ? `A strong submission looks like: ${exemplar}` : "See the rubric for what each level looks like.");
  await deps.store.set(PATH.task(uid, taskId), { scoring, feedback, gradeTries: tries, submissionPending: false }, true);
  await dequeueGrading(deps, [{ uid, id: taskId }]).catch(() => undefined);
  await applyTask(deps, policy, uid, taskId);
  return true;
}

// ── Corrections ─────────────────────────────────────────────────────────────────────────────────

/**
 * Replay one dimension from its (non-void) evidence ledger and store it (FR-037; used after a correction). `adjust`
 * changes other profile fields in the same signed write (a void's counters).
 */
export async function reconcileDimension(deps: Deps, policy: DevPolicy, uid: string, dim: DimensionId, adjust?: (p: DevProfile) => void): Promise<void> {
  const rows = await deps.store.query(PATH.evidences(uid), [["dim", "==", dim]]);
  const evidence = rows.map((r) => r.data as unknown as DevEvidence & { void?: boolean }).filter((e) => !e.void);
  const now = deps.now();
  const replayed = replayDimension(evidence.map((e) => ({
    score: e.score, difficulty: e.difficulty, quality: e.quality, kind: e.kind, setting: e.setting, sourceId: e.sourceId, at: e.recordedAt, guess: e.guess,
  })), { upScore: policy.scoring.upScore, downScore: policy.scoring.downScore, upAfter: policy.scoring.upAfter, downAfter: policy.scoring.downAfter, recentPerDim: policy.scoring.recentPerDim }, now);
  await deps.store.tx(async (t) => {
    const p = (await t.get(PATH.user(uid))) as unknown as DevProfile;
    const dims = { ...p.dims, [dim]: { ...replayed, retention: p.dims[dim].retention, baseline: p.dims[dim].baseline ?? replayed.baseline } };
    const next = { ...p, dims, summary: weightedSummary(dims, policy.weights[p.track]), updatedAt: now };
    adjust?.(next);
    t.set(PATH.user(uid), (await signRecord(deps.secrets, "profile", next)) as unknown as Doc);
  });
}

async function writeCorrection(deps: Deps, c: DevCorrection) {
  await deps.store.set(PATH.correction(c.id), (await signRecord(deps.secrets, "correction", c)) as unknown as Doc);
}

/** Mark an attempt a platform fault: it never counts against the learner (FR-030). The original stays. */
export async function voidAttempt(deps: Deps, policy: DevPolicy, uid: string, attemptId: string, by: string, reason: string): Promise<DevCorrection> {
  const attempt = (await deps.store.get(PATH.attempt(uid, attemptId))) as unknown as DevAttempt | null;
  if (!attempt) throw new DevError(404, "no_attempt", "That answer does not exist.");
  const id = `void_${uid}_${attemptId}`;
  if (attempt.current?.outcome === "system_error") {
    // Already void: nothing changes twice (the counters below must not be undone again).
    const existing = (await deps.store.get(PATH.correction(id))) as unknown as DevCorrection | null;
    if (existing) return existing;
  }
  const now = deps.now();
  const before = attempt.current ?? { score: attempt.scoring?.score ?? 0, outcome: attempt.outcome };
  const c: DevCorrection = {
    id, uid, attemptId, kind: "void_system_error", reason: reason.slice(0, 500),
    before: { score: before.score, outcome: before.outcome }, after: { score: 0, outcome: "system_error" }, by, at: now,
  };
  await writeCorrection(deps, c);
  await deps.store.set(PATH.attempt(uid, attemptId), { current: { score: 0, outcome: "system_error", correctionId: c.id, at: now } }, true);
  await deps.store.set(PATH.evidence(uid, `ev_${attemptId}`), { void: true, voidedAt: now }, true);
  // Undo what the answer added to the counters when it was applied (with its outcome THEN): a scored answer, passed or
  // failed, evidence toward the gates — and count a platform fault instead (the browser test still read "6 not yet ·
  // 0 system faults" after a void).
  const applied = !!attempt.appliedAt && (attempt.outcome === "passed" || attempt.outcome === "failed" || attempt.outcome === "partial") && !!attempt.scoring;
  const sure = !!attempt.scoring && (attempt.scoring.method === "deterministic" || attempt.scoring.confidence !== "low");
  await reconcileDimension(deps, policy, uid, attempt.dim, applied ? (p) => {
    const s = { ...p.stats };
    s.attempts = Math.max(0, s.attempts - 1);
    if (attempt.outcome === "passed") s.passed = Math.max(0, s.passed - 1);
    else s.failed = Math.max(0, s.failed - 1);
    s.systemErrors += 1;
    p.stats = s;
    p.gates = {
      ...p.gates,
      validAttempts: sure ? Math.max(0, p.gates.validAttempts - 1) : p.gates.validAttempts,
      transfers: p.gates.transfers.filter((x) => x.id !== attemptId),
      retentions: p.gates.retentions.filter((x) => x.id !== attemptId),
    };
  } : undefined);
  return c;
}

export interface AppealResult {
  /** `pending` = the graders could not answer yet; the tick decides it (resumeAppeal) and tells the person. */
  outcome: "changed" | "upheld" | "voided" | "pending";
  message: string;
  correction?: DevCorrection;
}

/** One appeal per answer, within 14 days: an independent re-evaluation first (MSRS §20.3 "Employee appeals"). */
export async function appeal(deps: Deps, actor: Actor, input: { attemptId: string; reason: string }): Promise<AppealResult> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  const uid = actor.uid;
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 10) throw new DevError(400, "reason", "Say in a sentence why you think the result is wrong.");
  const attempt = (await deps.store.get(PATH.attempt(uid, input.attemptId))) as unknown as DevAttempt | null;
  if (!attempt) throw new DevError(404, "no_attempt", "That answer is not yours or does not exist.");
  if (!attempt.scoring || !["passed", "failed"].includes(attempt.outcome)) throw new DevError(409, "not_scored", "Only a scored answer can be appealed.");
  const now = deps.now();
  if (now - attempt.submittedAt > 14 * 86_400_000) throw new DevError(409, "too_late", "Appeals are open for 14 days after an answer.");
  const id = `appeal_${uid}_${attempt.id}`;
  if (await deps.store.get(PATH.correction(id))) throw new DevError(409, "appealed", "This answer was already appealed.");
  const q = (await deps.store.get(PATH.question(attempt.qid))) as unknown as QuestionDoc | null;
  const key = q ? await open<ItemKey>(deps.secrets, q.key) : null;
  const before = attempt.current ?? { score: attempt.scoring.score, outcome: attempt.outcome };
  // Every review is noted on the answer itself, whatever it decided — so the answer shows it was reviewed and offers
  // no second review (the browser test got an error toast from a second "Ask for a review" on an upheld answer).
  const noteOnAnswer = (outcome: AppealResult["outcome"], detail: string) =>
    deps.store.set(PATH.attempt(uid, attempt.id), { appeal: { at: now, outcome, detail: detail.slice(0, 300) } }, true);
  const record = async (outcome: AppealResult["outcome"], after: { score: number; outcome: DevAttempt["outcome"] }, detail: string) => {
    const c: DevCorrection = { id, uid, attemptId: attempt.id, kind: "appeal", reason: reason.slice(0, 500), before: { score: before.score, outcome: before.outcome }, after, by: uid, at: now, detail };
    await writeCorrection(deps, c);
    await noteOnAnswer(outcome, detail);
    return c;
  };

  if (attempt.item.type === "open" && key?.rubric && attempt.response.kind === "text") {
    const res = await gradeOpen(deps, policy, { scenario: attempt.item.scenario, question: attempt.item.question, rubric: key.rubric, exemplar: key.exemplar, answer: attempt.response.text, purpose: "rank" });
    if (!res.scoring) {
      // ── Nobody has to step in (owner, 2026-10-18: "0% human involvement") ── The graders cannot answer right now: the
      // appeal waits in the grading queue, the tick re-grades it (bounded) and tells the person. It used to be "sent to
      // an admin to review" — and nothing ever picked it up.
      const c: DevCorrection = {
        id, uid, attemptId: attempt.id, kind: "appeal", reason: reason.slice(0, 500), before: { score: before.score, outcome: before.outcome },
        after: { score: before.score, outcome: before.outcome }, by: uid, at: now, detail: "Waiting for the graders — re-checked automatically.", pending: true, tries: 0,
      };
      await writeCorrection(deps, c);
      await noteOnAnswer("pending", "Waiting for the graders — it is re-checked automatically, usually within a day.");
      await enqueueGrading(deps, { uid, kind: "appeal", id });
      return { outcome: "pending", message: "The graders are busy right now — your review is queued and runs by itself. The result will show on this answer.", correction: c };
    }
    return resolveOpenAppeal(deps, policy, { id, uid, attempt, reason, before, scoring: res.scoring });
  }

  if (attempt.source === "ai" && deps.ai && attempt.item.options?.length) {
    const solved = await deps.ai.solveItems([{ scenario: attempt.item.scenario, question: attempt.item.question, options: q!.public.options ?? [] }]);
    const a = solved.value?.[0];
    const keyIndex = key?.correct?.[0];
    if (a && a.index !== null && keyIndex !== undefined && (a.index !== keyIndex || a.ambiguous) && a.confidence >= 0.6) {
      const c = await voidAttempt(deps, policy, uid, attempt.id, "system", `Appeal: an independent solver disagreed with the answer key (${reason.slice(0, 120)})`);
      await deps.store.set(PATH.question(attempt.qid), { status: "quarantined", poolState: `${q!.track}|${q!.dim}|${q!.difficulty}|objective|quarantined`, updatedAt: now }, true);
      await noteOnAnswer("voided", "The question looked faulty — it no longer counts and was withdrawn.");
      return { outcome: "voided", message: "You were right to question it — the question looks faulty. It no longer counts and has been withdrawn.", correction: c };
    }
  }
  const c = await record("upheld", before, attempt.source === "template" ? "The answer is computed from the rules in the question." : "The answer key was re-checked.");
  // Short: it is shown as a toast, and the worked answer is already on the screen (the whole explanation in the toast
  // covered the Next button — found in the browser test).
  return { outcome: "upheld", message: attempt.source === "template" ? "Re-checked: the answer is worked out from the rules in the question, and it stands — see the worked answer below." : "Re-checked: the answer key stands — see the worked answer below.", correction: c };
}

/**
 * Decide an appeal on a written answer from the fresh judges' scoring (`null` = they could not grade it, after every
 * try): a change of more than the policy's tolerance replaces the score (the original stays, the skill is re-settled),
 * anything else upholds it. Writes the correction (replacing a pending one) and notes it on the answer.
 */
async function resolveOpenAppeal(
  deps: Deps, policy: DevPolicy,
  a: { id: string; uid: string; attempt: DevAttempt; reason: string; before: { score: number; outcome: DevAttempt["outcome"] }; scoring: Scoring | null },
): Promise<AppealResult> {
  const now = deps.now();
  const record = async (outcome: "changed" | "upheld", after: { score: number; outcome: DevAttempt["outcome"] }, detail: string) => {
    const c: DevCorrection = { id: a.id, uid: a.uid, attemptId: a.attempt.id, kind: "appeal", reason: a.reason.slice(0, 500), before: { score: a.before.score, outcome: a.before.outcome }, after, by: a.uid, at: now, detail };
    await writeCorrection(deps, c);
    await deps.store.set(PATH.attempt(a.uid, a.attempt.id), { appeal: { at: now, outcome, detail: detail.slice(0, 300) } }, true);
    return c;
  };
  if (!a.scoring) {
    const c = await record("upheld", a.before, "The graders could not re-check it after several tries, so the original result stands.");
    return { outcome: "upheld", message: "The graders could not re-check it after several tries, so the original result stands.", correction: c };
  }
  const s = a.scoring;
  if (Math.abs(s.score - a.before.score) > policy.scoring.disagreementTolerance) {
    const after = { score: s.score, outcome: (s.passed ? "passed" : "failed") as DevAttempt["outcome"] };
    const c = await record("changed", after, `Re-graded by two independent judges: ${s.score}% (was ${a.before.score}%).`);
    await deps.store.set(PATH.attempt(a.uid, a.attempt.id), { current: { ...after, correctionId: c.id, at: now } }, true);
    await deps.store.set(PATH.evidence(a.uid, `ev_${a.attempt.id}`), { score: after.score, correctedBy: c.id }, true);
    await reconcileDimension(deps, policy, a.uid, a.attempt.dim);
    return { outcome: "changed", message: `Re-graded: your score is now ${after.score}% (it was ${a.before.score}%).`, correction: c };
  }
  const c = await record("upheld", a.before, `Re-graded by two independent judges: ${s.score}% — within ${policy.scoring.disagreementTolerance} points of the original.`);
  return { outcome: "upheld", message: `Two fresh judges scored it ${s.score}%, close to the original ${a.before.score}% — the result stands.`, correction: c };
}

/**
 * The tick's turn on a waiting appeal (`id` = its correction): re-grade it; when the judges answer — or after
 * `gradeRetryLimit` tries — decide it and tell the person. "waiting" = try again on a later run.
 */
export async function resumeAppeal(deps: Deps, policy: DevPolicy, uid: string, id: string): Promise<"resolved" | "waiting"> {
  const c = (await deps.store.get(PATH.correction(id))) as unknown as DevCorrection | null;
  if (!c?.pending) return "resolved";
  const attempt = (await deps.store.get(PATH.attempt(uid, c.attemptId))) as unknown as DevAttempt | null;
  const q = attempt ? ((await deps.store.get(PATH.question(attempt.qid))) as unknown as QuestionDoc | null) : null;
  const key = q ? await open<ItemKey>(deps.secrets, q.key) : null;
  let scoring: Scoring | null = null;
  if (attempt && key?.rubric && attempt.response.kind === "text") {
    scoring = (await gradeOpen(deps, policy, { scenario: attempt.item.scenario, question: attempt.item.question, rubric: key.rubric, exemplar: key.exemplar, answer: attempt.response.text, purpose: "rank" })).scoring ?? null;
  }
  const tries = (c.tries ?? 0) + 1;
  if (!scoring && attempt && key?.rubric && tries < policy.scoring.gradeRetryLimit) {
    await deps.store.set(PATH.correction(id), { tries }, true); // `tries` is not signed (integrity.signedFields)
    return "waiting";
  }
  if (!attempt) {
    await deps.store.set(PATH.correction(id), { pending: false, detail: "The answer no longer exists." }, true);
    return "resolved";
  }
  const r = await resolveOpenAppeal(deps, policy, { id, uid, attempt, reason: c.reason, before: c.before, scoring });
  await deps.notify.send({ uid, type: "devos_result", title: "Your review is done", message: r.message.slice(0, 200), link: `/dev-os/history/${attempt.id}`, key: `devos_appeal_${id}`, push: true }).catch(() => false);
  return "resolved";
}

// ── The coach ───────────────────────────────────────────────────────────────────────────────────

/** Ask the coach about an answered item: explanations and teaching, never a future item's answer (MSRS §8.2 "Coach"). */
export async function coach(deps: Deps, actor: Actor, input: { attemptId: string; ask: string }): Promise<{ reply: string; source: "ai" | "rules" }> {
  assertActive(actor);
  const uid = actor.uid;
  const ask = String(input.ask ?? "").trim().slice(0, 500);
  if (ask.length < 3) throw new DevError(400, "ask", "Type your question for the coach.");
  const attempt = (await deps.store.get(PATH.attempt(uid, input.attemptId))) as unknown as DevAttempt | null;
  if (!attempt) throw new DevError(404, "no_attempt", "That answer is not yours or does not exist.");
  if (attempt.outcome === "pending_validation") throw new DevError(409, "pending", "Wait for the grading to finish first.");
  const now = deps.now();
  const day = istDay(now);
  const prof = (await deps.store.get(PATH.user(uid))) as unknown as DevProfile & { coachDay?: { day: string; n: number } };
  const used = prof.coachDay?.day === day ? prof.coachDay.n : 0;
  const fallback = () => {
    const hintsText = attempt.feedback?.steps?.length ? ` Method: ${attempt.feedback.steps.join(" ")}` : "";
    return `${attempt.reveal?.explanation ?? attempt.feedback?.explanation ?? "Re-read the situation and the rule it gives."}${hintsText}`;
  };
  if (!deps.ai || used >= 20) return { reply: fallback(), source: "rules" };
  const correctText = attempt.reveal?.correct?.length && attempt.item.options
    ? attempt.reveal.correct.map((i) => attempt.item.options![i]).join("; ")
    : attempt.reveal?.value !== undefined ? String(attempt.reveal.value) : attempt.reveal?.order ? attempt.reveal.order.map((i) => attempt.item.options?.[i]).join(" → ") : attempt.reveal?.exemplar ?? "";
  const answerText = attempt.response.kind === "text" ? attempt.response.text
    : attempt.response.kind === "choice" ? attempt.response.selected.map((i) => attempt.item.options?.[i]).join("; ")
    : attempt.response.kind === "number" ? String(attempt.response.value) : attempt.response.order.map((i) => attempt.item.options?.[i]).join(" → ");
  const res = await deps.ai.coach({ scenario: attempt.item.scenario, question: attempt.item.question, answerText, correctText, explanation: attempt.reveal?.explanation ?? "", ask });
  await deps.store.set(PATH.user(uid), { coachDay: { day, n: used + 1 } }, true);
  if (!res.value) return { reply: fallback(), source: "rules" };
  return { reply: res.value.slice(0, 1500), source: "ai" };
}
