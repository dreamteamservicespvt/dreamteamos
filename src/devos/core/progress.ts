/**
 * Applying a scored result to a learner (MSRS §9.2 step 6, FR-033 – FR-039): pure, so it can be tested and replayed.
 *
 * In one pass, from one scored attempt (or one graded practical task):
 *   evidence → the dimension's ability estimate, confidence, adaptive level and retention boxes;
 *   XP (an immutable ledger row keyed by its source — FR-034), the day's numbers, the season's numbers;
 *   the gate counters (valid answers, transfer / retention passes, rank assessments, practicals);
 *   the task's completion (quest XP, the streak) when the session's last slot is in;
 *   a fresh retry after a miss (AC-013); new achievements; and — only when every gate passes — the next rank.
 * XP never feeds a gate (AC-016). Expired and system-error results change only their counters (FR-030).
 */
import { BADGE_BY_ID, newBadges } from "./badges.js";
import { istDay, weekKeyOf, type WorkdayContext } from "./days.js";
import { priorities, remediationSlot } from "./director.js";
import { applyEvidence, effectiveValue, evidenceQuality, scheduleRetention, weightedSummary } from "./mastery.js";
import { rankLabel, type DevPolicy } from "./policy.js";
import { evaluateRank } from "./ranks.js";
import { advanceStreak, seasonOf } from "./season.js";
import type {
  Achievement, DayStat, DevAttempt, DevEvidence, DevProfile, DevSession, DevTask, EvidenceKind, Purpose, RankEvent, RankLevel,
  SeasonScore, TaskState, XpTransaction,
} from "./types.js";
import { practicalXp, questXp, streakXp, xpForAttempt } from "./xp.js";

export interface Notice {
  type: string;
  title: string;
  message: string;
  key: string;
  link: string;
}

export interface ApplyOutput {
  profile: DevProfile;
  evidence: DevEvidence | null;
  xp: XpTransaction[];
  task: DevTask | null;
  /** The session with its result, when the task completed (null = unchanged). */
  session: DevSession | null;
  seasonScore: SeasonScore;
  rankEvent: RankEvent | null;
  achievements: Achievement[];
  newTasks: DevTask[];
  notices: Notice[];
}

export const EVIDENCE_KIND: Record<Purpose, EvidenceKind> = {
  baseline: "baseline", quest: "practice", practice: "practice", remediation: "practice", transfer: "transfer",
  retention: "retention", rank: "assessment", league: "league", challenge: "practical", mission: "practical", capstone: "capstone",
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function emptySeasonScore(p: DevProfile, seasonId: string, now: number): SeasonScore {
  return {
    uid: p.uid, name: p.name, track: p.track, team: p.team, seasonId, masteryNum: 0, masteryDen: 0, items: 0,
    questsAssigned: 0, questsOnTime: 0, practicalAssigned: 0, practicalOnTime: 0, startSummary: p.summary, missionPoints: 0, updatedAt: now,
  };
}

function today(p: DevProfile, day: string): DayStat & { itemXp?: number; failXp?: number; practice?: number } {
  let d = p.days.find((x) => x.day === day) as (DayStat & { itemXp?: number; failXp?: number; practice?: number }) | undefined;
  if (!d) {
    d = { day, assigned: 0, done: 0, items: 0, correct: 0, xp: 0, itemXp: 0, failXp: 0, practice: 0 };
    p.days = [...p.days, d].slice(-21);
  }
  return d;
}

/** Roll the XP counters into the right day / week / season, then add. */
function addXp(p: DevProfile, amount: number, day: string, seasonId: string) {
  const week = weekKeyOf(day);
  if (p.xp.seasonId !== seasonId) { p.xp.seasonId = seasonId; p.xp.season = 0; }
  if (p.xp.weekKey !== week) { p.xp.weekKey = week; p.xp.week = 0; }
  if (p.xp.day !== day) { p.xp.day = day; p.xp.today = 0; }
  p.xp.total += amount;
  p.xp.season += amount;
  p.xp.week += amount;
  p.xp.today += amount;
  today(p, day).xp += amount;
}

function xpRow(p: DevProfile, id: string, amount: number, reason: string, sourceType: XpTransaction["sourceType"], sourceId: string, policy: DevPolicy, now: number, seasonId: string): XpTransaction {
  return { id, uid: p.uid, amount, reason, sourceType, sourceId, ruleVersion: policy.version, seasonId, day: istDay(now), recordedAt: now };
}

export interface ApplyContext {
  policy: DevPolicy;
  now: number;
  cal: WorkdayContext;
  /** Days this person was on approved leave (they never break a streak). */
  away: ReadonlySet<string>;
}

/** Task-level completion once every slot of its session is in (and none is still being graded). */
function completeTask(p: DevProfile, task: DevTask, session: DevSession, out: ApplyOutput, ctx: ApplyContext, seasonId: string) {
  if (task.appliedAt) return;
  const slots = session.slots;
  const done = slots.every((s) => s.state === "answered" || s.state === "expired" || s.state === "skipped_system");
  if (!done) return;
  const pending = slots.filter((s) => s.state === "answered" && s.pending).length;
  const scored = slots.filter((s) => s.state === "answered" && !s.pending && typeof s.score === "number");
  const passedN = scored.filter((s) => s.passed).length;
  // ── Why an item left to run out counts as 0 ── It is part of what the person was asked. Leaving it out of the score
  // (as before 2026-10-18) let anyone wait out the hardest questions of a rank assessment or a league and keep a higher
  // percentage. A platform fault (`skipped_system`) still never counts against them.
  const expiredN = slots.filter((s) => s.state === "expired").length;
  const counted = scored.length + expiredN;
  const score = counted ? Math.round(scored.reduce((a, s) => a + (s.score ?? 0), 0) / counted) : 0;
  session.result = { score, passed: false, answered: scored.length + pending, correct: passedN, pending, expired: expiredN };
  if (pending > 0) {
    if (task.state !== "completed") {
      task.events = [...task.events, { from: task.state, to: "completed", at: ctx.now, by: "system", reason: "all answers in — waiting for grading" }];
      task.state = "completed";
    }
    out.task = task;
    return;
  }
  const { policy, now } = ctx;
  const day = istDay(now);
  const tally = `${passedN} of ${counted} passed (${score}%)${expiredN ? ` — ${expiredN} not answered in time, counted as 0` : ""}`;
  // A timed assessment (rank, league) ENDS when its time does — what was not answered counts as 0 and the task is
  // judged as usual. Any other task (a quest, practice, a retry, a check) whose deadline passed before every item was in
  // is EXPIRED, not done: no quest XP, no "quest done", no streak, no "perfect" — before, one right answer out of three
  // settled at the deadline as a perfect quest. The items answered in time already counted, one by one. The baseline
  // never expires (its items carry no deadline — `answer`, `serveNext`).
  if (expiredN > 0 && !["rank", "league", "baseline"].includes(task.kind)) {
    task.events = [...task.events, { from: task.state, to: "expired", at: now, by: "system", reason: `the deadline passed — ${tally}` }];
    task.state = "expired";
    task.appliedAt = now;
    out.task = task;
    p.stats.tasksExpired += 1;
    return;
  }
  let next: TaskState;
  if (task.kind === "baseline" || task.kind === "league") next = "completed";
  else if (task.kind === "rank") {
    const gate = policy.rankGates[(session.forRank ?? Math.min(6, p.rank.level + 1)) as 2 | 3 | 4 | 5 | 6];
    next = score >= (gate?.assessmentPct ?? 70) ? "passed" : "failed";
  } else next = counted && passedN / counted >= 0.6 ? "passed" : "failed";
  session.result.passed = next === "passed" || (next === "completed" && score >= 60);
  task.events = [...task.events, { from: task.state, to: next, at: now, by: "system", reason: tally }];
  task.state = next;
  task.appliedAt = now;
  out.task = task;
  p.stats.tasksDone += 1;
  today(p, day).done += 1;
  const onTime = now <= task.dueAt;

  if (task.kind === "baseline") {
    p.onboarding.baseline = "complete";
    p.onboarding.completedAt = now;
    out.xp.push(xpRow(p, "xp_baseline", policy.xp.baselineComplete, `Baseline complete +${policy.xp.baselineComplete}`, "task", task.id, policy, now, seasonId));
    addXp(p, policy.xp.baselineComplete, day, seasonId);
  }
  if (task.kind === "quest") {
    (p.stats as Record<string, number>).questsDone = (p.stats.questsDone ?? 0) + 1;
    const d = today(p, task.day ?? day);
    d.questDone = (d.questDone ?? 0) + 1;
    const perfect = scored.length > 0 && passedN === scored.length;
    if (perfect) (p.stats as Record<string, number>).perfectQuests = (p.stats.perfectQuests ?? 0) + 1;
    const award = questXp(policy, perfect);
    out.xp.push(xpRow(p, `xp_t_${task.id}`, award.amount, award.reason, "task", task.id, policy, now, seasonId));
    addXp(p, award.amount, day, seasonId);
    if (onTime && task.day === day) {
      const st = advanceStreak(p.streak, day, ctx.cal, ctx.away);
      p.streak = st.streak;
      const sx = st.milestone ? streakXp(policy, st.milestone) : null;
      if (sx) {
        out.xp.push(xpRow(p, `xp_streak_${day}`, sx.amount, sx.reason, "streak", `streak_${day}`, policy, now, seasonId));
        addXp(p, sx.amount, day, seasonId);
      }
    }
    if (onTime) out.seasonScore.questsOnTime += 1;
  }
  if (task.kind === "rank") {
    const level = (session.forRank ?? Math.min(6, p.rank.level + 1)) as RankLevel;
    // Valid = it measured enough: at most one platform fault. Items left to run out are the person's (counted as 0), so
    // an assessment started and walked away from is a valid 0% — it counts as taken, and the cooldown applies.
    const skipped = slots.filter((s) => s.state === "skipped_system").length;
    p.gates.assessments = [...p.gates.assessments, { level, score, at: now, sessionId: session.id, valid: skipped <= 1 && counted >= Math.max(3, slots.length - 2) }].slice(-30);
  }
}

/**
 * Apply one scored attempt. `session` and `task` are the documents AFTER the answer was recorded in them (or null).
 * Returns everything to write; the caller writes it in one transaction and sends the notices after it commits.
 */
export function computeApply(
  profileIn: DevProfile, attempt: DevAttempt, sessionIn: DevSession | null, taskIn: DevTask | null, seasonScoreIn: SeasonScore | null, ctx: ApplyContext,
): ApplyOutput {
  const { policy, now } = ctx;
  const p = clone(profileIn);
  const day = istDay(now);
  const season = seasonOf(day, policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const out: ApplyOutput = {
    profile: p, evidence: null, xp: [], task: null, session: null,
    seasonScore: seasonScoreIn && seasonScoreIn.seasonId === season.id ? clone(seasonScoreIn) : emptySeasonScore(p, season.id, now),
    rankEvent: null, achievements: [], newTasks: [], notices: [],
  };
  const session = sessionIn ? clone(sessionIn) : null;
  const task = taskIn ? clone(taskIn) : null;
  const scoring = attempt.scoring;
  const outcome = attempt.current?.outcome ?? attempt.outcome;

  if (outcome === "expired") p.stats.expired += 1;
  else if (outcome === "system_error") p.stats.systemErrors += 1;
  else if ((outcome === "passed" || outcome === "failed" || outcome === "partial") && scoring) {
    const kind = EVIDENCE_KIND[attempt.purpose];
    const quality = evidenceQuality(kind, scoring);
    const guess = attempt.item.type === "mcq" && attempt.item.options?.length ? 1 / attempt.item.options.length : 0;
    const score = attempt.current?.score ?? scoring.score;
    const passed = outcome === "passed";
    const dim = attempt.dim;
    const before = p.dims[dim];
    const personLevel = before.level;
    p.dims[dim] = applyEvidence(before, { score, difficulty: attempt.difficulty, quality, kind, setting: attempt.setting, sourceId: attempt.id, at: now, guess },
      { upScore: policy.scoring.upScore, downScore: policy.scoring.downScore, upAfter: policy.scoring.upAfter, downAfter: policy.scoring.downAfter, recentPerDim: policy.scoring.recentPerDim }, now);
    p.dims[dim] = scheduleRetention(p.dims[dim], { level: attempt.difficulty, passed, wasRetention: attempt.purpose === "retention", day, intervals: policy.cadence.retentionDays });
    out.evidence = {
      id: `ev_${attempt.id}`, uid: p.uid, dim, kind, sourceType: "attempt", sourceId: attempt.id, score, difficulty: attempt.difficulty,
      quality, confidence: scoring.confidence, setting: attempt.setting, family: attempt.family, policyVersion: policy.version, recordedAt: now,
      ...(guess ? { guess } : {}),
    };
    // Counters
    p.stats.attempts += 1;
    if (passed) p.stats.passed += 1; else p.stats.failed += 1;
    if (passed && attempt.difficulty >= 4) (p.stats as Record<string, number>).hardCorrect = (p.stats.hardCorrect ?? 0) + 1;
    if (attempt.purpose === "remediation") { p.stats.remediationTried += 1; if (passed) p.stats.remediationPassed += 1; }
    if (attempt.purpose === "retention") { p.stats.retentionTried += 1; if (passed) p.stats.retentionPassed += 1; }
    if (attempt.purpose === "transfer") { p.stats.transferTried += 1; if (passed) p.stats.transferPassed += 1; }
    // Gate counters only take valid evidence the graders were sure of (AC-012).
    const sure = scoring.method === "deterministic" || scoring.confidence !== "low";
    if (sure) {
      p.gates.validAttempts += 1;
      if (passed && score >= 70 && attempt.purpose === "transfer") p.gates.transfers = [...p.gates.transfers, { dim, at: now, id: attempt.id }].slice(-40);
      if (passed && attempt.purpose === "retention") {
        const first = before.recent.filter((r) => r.k !== "retention" && r.d <= attempt.difficulty && r.s >= 60).map((r) => r.t).sort((a, b) => a - b)[0];
        const gapDays = first ? Math.floor((now - first) / 86_400_000) : 0;
        p.gates.retentions = [...p.gates.retentions, { dim, gapDays, at: now, id: attempt.id }].slice(-40);
      }
    }
    // XP
    const td = today(p, day);
    const award = xpForAttempt(
      { open: attempt.item.type === "open", difficulty: attempt.difficulty, purpose: attempt.purpose, outcome, passed, hints: attempt.hintsUsed, personLevel },
      { itemXp: td.itemXp ?? 0, failXp: td.failXp ?? 0, practiceItems: td.practice ?? 0 }, policy,
    );
    td.items += 1;
    if (passed) td.correct += 1;
    if (attempt.purpose === "practice") td.practice = (td.practice ?? 0) + 1;
    if (award.amount > 0) {
      out.xp.push(xpRow(p, `xp_a_${attempt.id}`, award.amount, award.reason, "attempt", attempt.id, policy, now, season.id));
      addXp(p, award.amount, day, season.id);
      td.itemXp = (td.itemXp ?? 0) + award.amount;
      if (!passed) td.failXp = (td.failXp ?? 0) + award.amount;
    }
    // Season numbers (the Mastery board): difficulty-weighted performance, quality-weighted.
    out.seasonScore.masteryNum = Math.round((out.seasonScore.masteryNum + effectiveValue(score, attempt.difficulty) * quality) * 100) / 100;
    out.seasonScore.masteryDen = Math.round((out.seasonScore.masteryDen + quality) * 100) / 100;
    out.seasonScore.items += 1;
    // A fresh retry after a miss (not in assessments, leagues, the baseline or another retry's own chain twice).
    if (!passed && ["quest", "practice", "transfer", "retention"].includes(attempt.purpose)) {
      const slot = remediationSlot(dim, attempt.difficulty, attempt.setting, attempt.family);
      out.newTasks.push({
        id: `fix_${attempt.id}`, uid: p.uid, kind: "remediation", title: `Fresh try: ${slot.reason?.split(" — ")[0]?.replace("A fresh try at ", "") ?? dim}`,
        why: "You missed one — the coach explained the method; now try it in a new situation.", track: p.track, dims: [dim], day,
        createdAt: now, dueAt: now + policy.cadence.practiceDueHours * 3_600_000 * 2, state: "assigned",
        events: [{ from: null, to: "assigned", at: now, by: "system", reason: `after a missed answer (${attempt.id})` }],
        blueprint: [slot], estMinutes: 3, xpReward: Math.round(policy.xp.correctBase * 1.5), difficulty: slot.difficulty, idem: `fix_${attempt.id}`,
      });
    }
  }

  p.lastActiveAt = now;
  if (task && session) {
    completeTask(p, task, session, out, ctx, season.id);
    if (session.result) out.session = session;
  }
  return finish(p, out, ctx, season.id);
}

/**
 * Settle a task whose session finished without a new attempt to apply (its last slot was skipped by the system, or
 * the tick closes it). Runs the same completion as `computeApply`.
 */
export function computeSettle(profileIn: DevProfile, sessionIn: DevSession, taskIn: DevTask, seasonScoreIn: SeasonScore | null, ctx: ApplyContext): ApplyOutput {
  const { policy, now } = ctx;
  const p = clone(profileIn);
  const season = seasonOf(istDay(now), policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const session = clone(sessionIn);
  const out: ApplyOutput = {
    profile: p, evidence: null, xp: [], task: null, session: null, rankEvent: null, achievements: [], newTasks: [], notices: [],
    seasonScore: seasonScoreIn && seasonScoreIn.seasonId === season.id ? clone(seasonScoreIn) : emptySeasonScore(p, season.id, now),
  };
  completeTask(p, clone(taskIn), session, out, ctx, season.id);
  if (session.result) out.session = session;
  return finish(p, out, ctx, season.id);
}

/** A graded practical task (weekly challenge, mission part, capstone). */
export function computeApplyTask(profileIn: DevProfile, taskIn: DevTask, seasonScoreIn: SeasonScore | null, ctx: ApplyContext): ApplyOutput {
  const { policy, now } = ctx;
  const p = clone(profileIn);
  const task = clone(taskIn);
  const day = istDay(now);
  const season = seasonOf(day, policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const out: ApplyOutput = {
    profile: p, evidence: null, xp: [], task, session: null, rankEvent: null, achievements: [], newTasks: [], notices: [],
    seasonScore: seasonScoreIn && seasonScoreIn.seasonId === season.id ? clone(seasonScoreIn) : emptySeasonScore(p, season.id, now),
  };
  if (task.appliedAt || !task.scoring) return finish(p, out, ctx, season.id);
  const sc = task.scoring;
  const passed = sc.passed;
  const kind: EvidenceKind = task.kind === "capstone" ? "capstone" : "practical";
  const quality = evidenceQuality(kind, sc);
  const rules = { upScore: policy.scoring.upScore, downScore: policy.scoring.downScore, upAfter: policy.scoring.upAfter, downAfter: policy.scoring.downAfter, recentPerDim: policy.scoring.recentPerDim };
  // A practical task is evidence for each dimension it targets (the rubric is the same, so the score is shared).
  for (const dim of task.dims) {
    p.dims[dim] = applyEvidence(p.dims[dim], { score: sc.score, difficulty: task.difficulty, quality, kind, setting: `practical:${task.id}`, sourceId: task.id, at: now }, rules, now);
  }
  out.evidence = {
    id: `ev_task_${task.id}`, uid: p.uid, dim: task.dims[0], kind, sourceType: "task", sourceId: task.id, score: sc.score, difficulty: task.difficulty,
    quality, confidence: sc.confidence, setting: `practical:${task.id}`, family: task.kind, policyVersion: policy.version, recordedAt: now,
  };
  const st = p.stats as Record<string, number>;
  if (passed) st.practicalPassed = (p.stats.practicalPassed ?? 0) + 1;
  else st.practicalFailed = (p.stats.practicalFailed ?? 0) + 1;
  if (passed && task.kind === "mission_part") st.missionParts = (p.stats.missionParts ?? 0) + 1;
  if (passed && sc.confidence !== "low") {
    if (task.kind === "capstone") p.gates.capstone = { taskId: task.id, score: sc.score, at: now, impact: sc.codes.includes("impact_verified") };
    else p.gates.practicals = [...p.gates.practicals, { difficulty: task.difficulty, score: sc.score, at: now, taskId: task.id, kind: task.kind }].slice(-30);
  }
  const onTime = (task.submission?.at ?? now) <= task.dueAt;
  if (passed) {
    const award = practicalXp(policy, task.difficulty);
    out.xp.push(xpRow(p, `xp_t_${task.id}`, award.amount, award.reason, "task", task.id, policy, now, season.id));
    addXp(p, award.amount, day, season.id);
  }
  if (onTime && passed) out.seasonScore.practicalOnTime += 1;
  out.seasonScore.masteryNum = Math.round((out.seasonScore.masteryNum + effectiveValue(sc.score, task.difficulty) * quality) * 100) / 100;
  out.seasonScore.masteryDen = Math.round((out.seasonScore.masteryDen + quality) * 100) / 100;
  if (task.kind === "mission_part" && passed) out.seasonScore.missionPoints += Math.round(sc.score / 10);
  const next: TaskState = passed ? "passed" : "failed";
  task.events = [...task.events, { from: task.state, to: next, at: now, by: "system", reason: `rubric ${sc.score}% (${sc.confidence} confidence)` }];
  task.state = next;
  task.appliedAt = now;
  p.stats.tasksDone += 1;
  today(p, day).done += 1;
  p.lastActiveAt = now;
  return finish(p, out, ctx, season.id);
}

/** Summary, plan, badges and the rank check — common to both. */
function finish(p: DevProfile, out: ApplyOutput, ctx: ApplyContext, seasonId: string): ApplyOutput {
  const { policy, now } = ctx;
  const day = istDay(now);
  p.summary = weightedSummary(p.dims, policy.weights[p.track]);
  const pr = priorities(p, policy, now);
  p.plan = { focus: pr.slice(0, 2).map((x) => x.dim), reasons: pr.slice(0, 2).map((x) => x.reason), updatedAt: now };
  for (const b of newBadges(p)) {
    p.badges = [...p.badges, b.id];
    out.achievements.push({ id: b.id, uid: p.uid, badge: b.id, title: b.title, detail: b.detail, evidence: [], earnedAt: now, permanent: true });
    out.xp.push(xpRow(p, `xp_badge_${b.id}`, policy.xp.badge, `Badge: ${b.title} +${policy.xp.badge}`, "badge", b.id, policy, now, seasonId));
    addXp(p, policy.xp.badge, day, seasonId);
    out.notices.push({ type: "devos_badge", title: `New badge: ${b.title}`, message: b.detail, key: `devos_badge_${p.uid}_${b.id}`, link: "/dev-os/rank" });
  }
  const ev = evaluateRank(p, policy, now);
  if (ev.eligible && ev.next) {
    const level = ev.next;
    const id = `rank_${level}`;
    out.rankEvent = {
      id, uid: p.uid, oldRank: p.rank.level, newRank: level, gates: ev.gates, evidenceIds: [...new Set(ev.gates.flatMap((g) => g.evidenceIds))],
      policyVersion: policy.version, effectiveAt: now,
    };
    p.rank = { level, since: now, eventId: id };
    out.xp.push(xpRow(p, `xp_rank_${level}`, policy.xp.rankUp, `Promoted to ${rankLabel(policy, level)} +${policy.xp.rankUp}`, "rank", id, policy, now, seasonId));
    addXp(p, policy.xp.rankUp, day, seasonId);
    out.notices.push({ type: "devos_rankup", title: `You are now ${rankLabel(policy, level)}!`, message: "Every gate passed — the evidence is in your Career page.", key: `devos_rank_${p.uid}_${level}`, link: "/dev-os/rank" });
  }
  p.updatedAt = now;
  out.seasonScore = { ...out.seasonScore, name: p.name, track: p.track, team: p.team, summary: p.summary, hidden: !!p.boardPrivate, updatedAt: now };
  return out;
}

export const badgeTitle = (id: string) => BADGE_BY_ID.get(id)?.title ?? id;
