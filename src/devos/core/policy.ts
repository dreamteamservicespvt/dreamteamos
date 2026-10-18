/**
 * The policy — every number the MSRS calls a "proposed default" (Appendix A weights, Appendix B rank gates, XP values,
 * cadence, budgets, thresholds, privacy) in ONE versioned document, `devos_config/policy` (FR-055, NFR-014).
 *
 * ── Rules ─────────────────────────────────────────────────────────────────────────────────────────
 * • Read leniently (`parsePolicy`): anything missing, mistyped or out of range is the default, so a half-saved or old
 *   document never breaks a run.
 * • Saved only through `validatePolicy` (weights total 100 per track, gates climb with the ranks, …) and only with a new
 *   `version`; the old version is kept in `devos_policies/{version}` and every attempt / rank event records the version
 *   it was judged under, so a change never silently rescores history (FR-055, AC-027).
 */
import { DIMENSION_IDS, RANK_LABELS } from "./dimensions.js";
import type { Confidence, DimensionId, Purpose, RankLevel, TrackId } from "./types.js";

export type DevMode = "off" | "pilot" | "live";

export interface RankGate {
  /** % needed on a fresh rank assessment (Appendix B: 70 / 75 / 80 / 85 / 90). */
  assessmentPct: number;
  /** Distinct fresh rank assessments at that % (Advanced: "across two distinct assessments"). */
  assessmentsNeeded: number;
  /** The assessments must spread over this many weeks (Ultra Pro Max: "sustained mastery"). */
  sustainedWeeks: number;
  /** Only assessments this recent count. */
  assessmentWindowDays: number;
  /** The track's critical dimensions must reach this score. */
  criticalMin: number;
  /** No dimension may be below this (a weak critical skill can never be hidden — Appendix A.1). */
  floor: number;
  practicalsNeeded: number;
  practicalMinDifficulty: number;
  practicalMinScore: number;
  transfersNeeded: number;
  retentionsNeeded: number;
  retentionMinGapDays: number;
  minValidAttempts: number;
  /** Confidence the critical dimensions need. */
  minConfidence: Confidence;
  capstone: boolean;
}

export interface DevPolicy {
  version: string;
  mode: DevMode;
  /** In "pilot", only these people get quests and notifications. */
  pilotUids: string[];
  /** Remind active staff who have not started (every `inviteEveryDays`, at most `inviteMax` times). */
  autoInvite: boolean;
  inviteEveryDays: number;
  inviteMax: number;
  /** Which roles are learners by default (the main admin, the owner, opts in). */
  enrollRoles: Record<string, boolean>;
  defaultTrackByRole: Record<string, TrackId>;
  /** Appendix A — each track's column totals 100. */
  weights: Record<TrackId, Record<DimensionId, number>>;
  /** The dimensions a rank cannot be earned without (default: each track's three heaviest). */
  criticalDims: Record<TrackId, DimensionId[]>;
  rankLabels: string[];
  /** Gates for ranks 2–6 (rank 1 = onboarding + baseline). */
  rankGates: Record<2 | 3 | 4 | 5 | 6, RankGate>;
  rankAssessment: { items: number; openItems: number; cooldownDays: number; minutes: number };
  xp: {
    answerValid: number; correctBase: number; openPassed: number; failParticipation: number; failParticipationDailyCap: number;
    questComplete: number; questPerfectBonus: number; practicalPassed: number; retentionPassed: number; transferPassed: number;
    baselineComplete: number; rankUp: number; badge: number; streak: Record<string, number>; dailyItemCap: number;
    lowDifficultyFactor: number; extraPracticeDailyItems: number; difficultyFactor: number[];
  };
  cadence: {
    questItems: number; questDueHour: number; workDays: number[]; weeklyChallenge: boolean; challengeDueHour: number;
    retentionDays: number[]; transferEvery: number; baselineDueDays: number; leagueItems: number; leagueMinutes: number;
    seasonWeeks: number; seasonAnchor: string; teamMissions: boolean; practiceDueHours: number;
  };
  scoring: {
    passMark: number; hintPenalty: number; secondJudgeFor: Purpose[]; lowConfidence: number; nearThreshold: number;
    disagreementTolerance: number; gradeRetryLimit: number; timeGraceSec: number; upAfter: number; downAfter: number;
    upScore: number; downScore: number; recentPerDim: number; halfLifeDays: number;
  };
  dedupe: { lexicalJaccard: number; semanticCosine: number; simhashMaxHamming: number; aiItemMaxServes: number };
  ai: {
    enabled: boolean; dailyCallBudget: number; perUserDailyCalls: number; perTickCalls: number; poolTarget: number;
    generateBatch: number; timeoutMs: number; embeddings: boolean;
  };
  privacy: { boardNames: "full" | "first" | "initials"; boardTopN: number; minEligibleItems: number; minExecutionAssigned: number };
  notifications: { enabled: boolean; quietFromHour: number; quietToHour: number; questReadyHour: number; dueReminderHour: number };
  languages: string[];
  updatedAt?: number;
  updatedBy?: string;
  updatedByName?: string;
  reason?: string;
}

const W = (o: Record<DimensionId, number>) => o;

/** MSRS Appendix A (proposed defaults — calibrate in the pilot). */
export const DEFAULT_WEIGHTS: Record<TrackId, Record<DimensionId, number>> = {
  sales: W({ cognitive: 5, logical: 7, learning: 10, critical: 10, problem: 12, creativity: 8, decision: 12, communication: 15, emotional: 10, execution: 11 }),
  technical: W({ cognitive: 8, logical: 14, learning: 12, critical: 12, problem: 18, creativity: 8, decision: 8, communication: 5, emotional: 4, execution: 11 }),
  admin: W({ cognitive: 7, logical: 9, learning: 10, critical: 13, problem: 12, creativity: 7, decision: 14, communication: 9, emotional: 8, execution: 11 }),
};

/** The three heaviest dimensions of a weight column (ties broken by the framework order). */
export function heaviest(weights: Record<DimensionId, number>, n = 3): DimensionId[] {
  return [...DIMENSION_IDS].sort((a, b) => (weights[b] - weights[a]) || (DIMENSION_IDS.indexOf(a) - DIMENSION_IDS.indexOf(b))).slice(0, n);
}

/** MSRS Appendix B, made concrete. Every number is configurable. */
export const DEFAULT_RANK_GATES: Record<2 | 3 | 4 | 5 | 6, RankGate> = {
  2: { assessmentPct: 70, assessmentsNeeded: 1, sustainedWeeks: 0, assessmentWindowDays: 45, criticalMin: 45, floor: 30,
    practicalsNeeded: 1, practicalMinDifficulty: 1, practicalMinScore: 60, transfersNeeded: 0, retentionsNeeded: 0,
    retentionMinGapDays: 0, minValidAttempts: 15, minConfidence: "low", capstone: false },
  3: { assessmentPct: 75, assessmentsNeeded: 2, sustainedWeeks: 0, assessmentWindowDays: 60, criticalMin: 55, floor: 40,
    practicalsNeeded: 1, practicalMinDifficulty: 3, practicalMinScore: 65, transfersNeeded: 1, retentionsNeeded: 0,
    retentionMinGapDays: 0, minValidAttempts: 40, minConfidence: "medium", capstone: false },
  4: { assessmentPct: 80, assessmentsNeeded: 2, sustainedWeeks: 0, assessmentWindowDays: 60, criticalMin: 65, floor: 50,
    practicalsNeeded: 2, practicalMinDifficulty: 3, practicalMinScore: 75, transfersNeeded: 2, retentionsNeeded: 1,
    retentionMinGapDays: 7, minValidAttempts: 80, minConfidence: "medium", capstone: false },
  5: { assessmentPct: 85, assessmentsNeeded: 2, sustainedWeeks: 2, assessmentWindowDays: 75, criticalMin: 75, floor: 58,
    practicalsNeeded: 2, practicalMinDifficulty: 4, practicalMinScore: 80, transfersNeeded: 4, retentionsNeeded: 3,
    retentionMinGapDays: 21, minValidAttempts: 140, minConfidence: "high", capstone: false },
  6: { assessmentPct: 90, assessmentsNeeded: 3, sustainedWeeks: 4, assessmentWindowDays: 90, criticalMin: 85, floor: 66,
    practicalsNeeded: 3, practicalMinDifficulty: 5, practicalMinScore: 85, transfersNeeded: 6, retentionsNeeded: 5,
    retentionMinGapDays: 45, minValidAttempts: 220, minConfidence: "high", capstone: true },
};

export const DEFAULT_POLICY: DevPolicy = {
  version: "v0-default",
  mode: "live",
  pilotUids: [],
  autoInvite: true,
  inviteEveryDays: 3,
  inviteMax: 5,
  enrollRoles: {
    main_admin: false, tech_admin: true, sales_admin: true, accounts_admin: true, tech_team_leader: true,
    tech_member: true, sales_member: true,
  },
  defaultTrackByRole: {
    main_admin: "admin", tech_admin: "technical", sales_admin: "sales", accounts_admin: "admin",
    tech_team_leader: "technical", tech_member: "technical", sales_member: "sales",
  },
  weights: DEFAULT_WEIGHTS,
  criticalDims: {
    sales: heaviest(DEFAULT_WEIGHTS.sales),
    technical: heaviest(DEFAULT_WEIGHTS.technical),
    admin: heaviest(DEFAULT_WEIGHTS.admin),
  },
  rankLabels: [...RANK_LABELS],
  rankGates: DEFAULT_RANK_GATES,
  rankAssessment: { items: 10, openItems: 2, cooldownDays: 7, minutes: 30 },
  xp: {
    answerValid: 5, correctBase: 10, openPassed: 20, failParticipation: 2, failParticipationDailyCap: 10,
    questComplete: 25, questPerfectBonus: 10, practicalPassed: 80, retentionPassed: 20, transferPassed: 20,
    baselineComplete: 100, rankUp: 150, badge: 25, streak: { "3": 15, "7": 40, "14": 80, "30": 200 },
    dailyItemCap: 250, lowDifficultyFactor: 0.5, extraPracticeDailyItems: 10, difficultyFactor: [1, 1.25, 1.5, 1.75, 2],
  },
  cadence: {
    questItems: 3, questDueHour: 23, workDays: [1, 2, 3, 4, 5, 6], weeklyChallenge: true, challengeDueHour: 19,
    retentionDays: [3, 7, 21, 45], transferEvery: 3, baselineDueDays: 7, leagueItems: 5, leagueMinutes: 20,
    seasonWeeks: 4, seasonAnchor: "2026-10-19", teamMissions: true, practiceDueHours: 24,
  },
  scoring: {
    passMark: 60, hintPenalty: 0.15, secondJudgeFor: ["baseline", "rank", "league", "challenge", "mission", "capstone"],
    lowConfidence: 0.6, nearThreshold: 10, disagreementTolerance: 15, gradeRetryLimit: 3, timeGraceSec: 120,
    upAfter: 2, downAfter: 2, upScore: 80, downScore: 50, recentPerDim: 30, halfLifeDays: 60,
  },
  dedupe: { lexicalJaccard: 0.62, semanticCosine: 0.9, simhashMaxHamming: 9, aiItemMaxServes: 1 },
  ai: {
    enabled: true, dailyCallBudget: 400, perUserDailyCalls: 25, perTickCalls: 12, poolTarget: 3, generateBatch: 4,
    timeoutMs: 25_000, embeddings: true,
  },
  privacy: { boardNames: "full", boardTopN: 10, minEligibleItems: 10, minExecutionAssigned: 5 },
  notifications: { enabled: true, quietFromHour: 20, quietToHour: 9, questReadyHour: 9, dueReminderHour: 17 },
  languages: ["en"],
};

// ── Lenient parsing ─────────────────────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : d;
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v : d);
const TRACK_IDS: TrackId[] = ["sales", "technical", "admin"];
const CONF: Confidence[] = ["none", "low", "medium", "high"];

function parseWeights(raw: unknown): Record<TrackId, Record<DimensionId, number>> {
  const out = {} as Record<TrackId, Record<DimensionId, number>>;
  for (const t of TRACK_IDS) {
    const col = isObj(raw) && isObj(raw[t]) ? (raw[t] as Record<string, unknown>) : {};
    const parsed = {} as Record<DimensionId, number>;
    for (const d of DIMENSION_IDS) parsed[d] = num(col[d], DEFAULT_WEIGHTS[t][d], 0, 100);
    // A column that does not total 100 is not used — the default column is (validatePolicy refuses saving it).
    const total = DIMENSION_IDS.reduce((s, d) => s + parsed[d], 0);
    out[t] = Math.abs(total - 100) < 0.001 ? parsed : { ...DEFAULT_WEIGHTS[t] };
  }
  return out;
}

function parseGate(raw: unknown, d: RankGate): RankGate {
  const r = isObj(raw) ? raw : {};
  return {
    assessmentPct: num(r.assessmentPct, d.assessmentPct, 1, 100),
    assessmentsNeeded: num(r.assessmentsNeeded, d.assessmentsNeeded, 0, 10),
    sustainedWeeks: num(r.sustainedWeeks, d.sustainedWeeks, 0, 52),
    assessmentWindowDays: num(r.assessmentWindowDays, d.assessmentWindowDays, 1, 365),
    criticalMin: num(r.criticalMin, d.criticalMin, 0, 100),
    floor: num(r.floor, d.floor, 0, 100),
    practicalsNeeded: num(r.practicalsNeeded, d.practicalsNeeded, 0, 20),
    practicalMinDifficulty: num(r.practicalMinDifficulty, d.practicalMinDifficulty, 1, 5),
    practicalMinScore: num(r.practicalMinScore, d.practicalMinScore, 0, 100),
    transfersNeeded: num(r.transfersNeeded, d.transfersNeeded, 0, 50),
    retentionsNeeded: num(r.retentionsNeeded, d.retentionsNeeded, 0, 50),
    retentionMinGapDays: num(r.retentionMinGapDays, d.retentionMinGapDays, 0, 365),
    minValidAttempts: num(r.minValidAttempts, d.minValidAttempts, 0, 5000),
    minConfidence: CONF.includes(r.minConfidence as Confidence) ? (r.minConfidence as Confidence) : d.minConfidence,
    capstone: bool(r.capstone, d.capstone),
  };
}

function mergeNums<T extends Record<string, unknown>>(raw: unknown, def: T): T {
  const r = isObj(raw) ? raw : {};
  const out: Record<string, unknown> = { ...def };
  for (const [k, v] of Object.entries(def)) {
    if (typeof v === "number") out[k] = num(r[k], v, 0);
    else if (typeof v === "boolean") out[k] = bool(r[k], v);
    else if (typeof v === "string") out[k] = str(r[k], v);
    else if (Array.isArray(v)) out[k] = Array.isArray(r[k]) && (r[k] as unknown[]).length ? r[k] : v;
    else if (isObj(v)) out[k] = isObj(r[k]) ? { ...v, ...(r[k] as object) } : v;
  }
  return out as T;
}

/** The policy as stored, read leniently. Never throws. */
export function parsePolicy(raw: unknown): DevPolicy {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_POLICY;
  const weights = parseWeights(r.weights);
  const crit = isObj(r.criticalDims) ? r.criticalDims : {};
  const criticalDims = {} as Record<TrackId, DimensionId[]>;
  for (const t of TRACK_IDS) {
    const list = Array.isArray(crit[t]) ? (crit[t] as unknown[]).filter((x): x is DimensionId => DIMENSION_IDS.includes(x as DimensionId)) : [];
    criticalDims[t] = list.length ? [...new Set(list)] : heaviest(weights[t]);
  }
  const gatesRaw = isObj(r.rankGates) ? r.rankGates : {};
  const rankGates = {} as DevPolicy["rankGates"];
  for (const lvl of [2, 3, 4, 5, 6] as const) rankGates[lvl] = parseGate(gatesRaw[String(lvl)], d.rankGates[lvl]);
  const labels = Array.isArray(r.rankLabels) && (r.rankLabels as unknown[]).length === 6 && (r.rankLabels as unknown[]).every((x) => typeof x === "string" && x.trim())
    ? (r.rankLabels as string[]) : [...d.rankLabels];
  const mode: DevMode = r.mode === "off" || r.mode === "pilot" || r.mode === "live" ? r.mode : d.mode;
  const roleMap = (raw: unknown, def: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...def };
    if (isObj(raw)) for (const [k, v] of Object.entries(raw)) if (k in def) out[k] = v;
    return out;
  };
  const enroll = roleMap(r.enrollRoles, d.enrollRoles) as Record<string, unknown>;
  const tracks = roleMap(r.defaultTrackByRole, d.defaultTrackByRole) as Record<string, unknown>;
  const privacyRaw = isObj(r.privacy) ? r.privacy : {};
  const scoring = mergeNums(r.scoring, d.scoring);
  if (!Array.isArray(scoring.secondJudgeFor)) scoring.secondJudgeFor = d.scoring.secondJudgeFor;
  const cadence = mergeNums(r.cadence, d.cadence);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cadence.seasonAnchor)) cadence.seasonAnchor = d.cadence.seasonAnchor;
  if (!cadence.retentionDays.every((x) => typeof x === "number" && x > 0)) cadence.retentionDays = d.cadence.retentionDays;
  const xp = mergeNums(r.xp, d.xp);
  if (!(Array.isArray(xp.difficultyFactor) && xp.difficultyFactor.length === 5)) xp.difficultyFactor = d.xp.difficultyFactor;
  return {
    version: str(r.version, d.version),
    mode,
    pilotUids: Array.isArray(r.pilotUids) ? (r.pilotUids as unknown[]).filter((x): x is string => typeof x === "string") : [],
    autoInvite: bool(r.autoInvite, d.autoInvite),
    inviteEveryDays: num(r.inviteEveryDays, d.inviteEveryDays, 1, 60),
    inviteMax: num(r.inviteMax, d.inviteMax, 0, 50),
    enrollRoles: Object.fromEntries(Object.entries(enroll).map(([k, v]) => [k, typeof v === "boolean" ? v : !!d.enrollRoles[k]])),
    defaultTrackByRole: Object.fromEntries(Object.entries(tracks).map(([k, v]) => [k, TRACK_IDS.includes(v as TrackId) ? (v as TrackId) : d.defaultTrackByRole[k]])),
    weights,
    criticalDims,
    rankLabels: labels,
    rankGates,
    rankAssessment: mergeNums(r.rankAssessment, d.rankAssessment),
    xp,
    cadence,
    scoring,
    dedupe: mergeNums(r.dedupe, d.dedupe),
    ai: mergeNums(r.ai, d.ai),
    privacy: {
      boardNames: privacyRaw.boardNames === "first" || privacyRaw.boardNames === "initials" || privacyRaw.boardNames === "full"
        ? privacyRaw.boardNames : d.privacy.boardNames,
      boardTopN: num(privacyRaw.boardTopN, d.privacy.boardTopN, 3, 100),
      minEligibleItems: num(privacyRaw.minEligibleItems, d.privacy.minEligibleItems, 0, 500),
      minExecutionAssigned: num(privacyRaw.minExecutionAssigned, d.privacy.minExecutionAssigned, 0, 500),
    },
    notifications: mergeNums(r.notifications, d.notifications),
    languages: Array.isArray(r.languages) && (r.languages as unknown[]).length ? (r.languages as string[]) : d.languages,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : undefined,
    updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : undefined,
    updatedByName: typeof r.updatedByName === "string" ? r.updatedByName : undefined,
    reason: typeof r.reason === "string" ? r.reason : undefined,
  };
}

/** What is wrong with a policy someone wants to save — empty = fine (FR-055). */
export function validatePolicy(p: DevPolicy): string[] {
  const problems: string[] = [];
  for (const t of TRACK_IDS) {
    const col = p.weights[t];
    const total = DIMENSION_IDS.reduce((s, d) => s + (Number(col?.[d]) || 0), 0);
    if (Math.abs(total - 100) > 0.001) problems.push(`The ${t} weights total ${total}, not 100.`);
    if (DIMENSION_IDS.some((d) => !(col?.[d] >= 0))) problems.push(`Every ${t} weight must be 0 or more.`);
    if (!p.criticalDims[t]?.length) problems.push(`Pick at least one critical dimension for ${t}.`);
  }
  const levels = [2, 3, 4, 5, 6] as const;
  for (let i = 1; i < levels.length; i++) {
    const a = p.rankGates[levels[i - 1]];
    const b = p.rankGates[levels[i]];
    const label = `${p.rankLabels[levels[i] - 1]}`;
    if (b.assessmentPct < a.assessmentPct) problems.push(`${label} needs a lower assessment % than the rank below it.`);
    if (b.criticalMin < a.criticalMin) problems.push(`${label}'s critical minimum is below the rank below it.`);
    if (b.floor < a.floor) problems.push(`${label}'s floor is below the rank below it.`);
    if (b.minValidAttempts < a.minValidAttempts) problems.push(`${label} needs fewer attempts than the rank below it.`);
  }
  for (const lvl of levels) {
    const g = p.rankGates[lvl];
    if (g.floor > g.criticalMin) problems.push(`${p.rankLabels[lvl - 1]}: the floor is above the critical minimum.`);
    if (g.assessmentsNeeded < 1) problems.push(`${p.rankLabels[lvl - 1]} must need at least one fresh assessment.`);
  }
  if (p.rankLabels.length !== 6 || p.rankLabels.some((l) => !l.trim())) problems.push("All six rank labels are needed.");
  if (p.cadence.questItems < 1 || p.cadence.questItems > 8) problems.push("A daily quest holds 1 to 8 items.");
  if (!Number.isInteger(p.cadence.questDueHour) || p.cadence.questDueHour < 12 || p.cadence.questDueHour > 23) problems.push("The daily quest is due at a whole hour from 12 to 23.");
  if (!Number.isInteger(p.cadence.challengeDueHour) || p.cadence.challengeDueHour < 9 || p.cadence.challengeDueHour > 23) problems.push("The weekly challenge is due at a whole hour from 9 to 23.");
  if (p.scoring.passMark < 30 || p.scoring.passMark > 95) problems.push("The pass mark must be between 30 and 95.");
  if (p.scoring.hintPenalty < 0 || p.scoring.hintPenalty > 0.5) problems.push("A hint may cost 0 to 50% of an item.");
  if (p.ai.dailyCallBudget < 0) problems.push("The AI budget cannot be negative.");
  if (p.dedupe.lexicalJaccard < 0.3 || p.dedupe.lexicalJaccard > 0.95) problems.push("The wording-similarity threshold must be 0.3–0.95.");
  if (p.notifications.quietFromHour === p.notifications.quietToHour) problems.push("Quiet hours need a length.");
  return problems;
}

/** The next version name: v1, v2, … (the stored number is what audits and attempts cite). */
export function nextPolicyVersion(current: string): string {
  const m = /^v(\d+)/.exec(current);
  return `v${m ? Number(m[1]) + 1 : 1}`;
}

export const rankLabel = (p: Pick<DevPolicy, "rankLabels">, level: RankLevel | number): string =>
  p.rankLabels[Math.min(6, Math.max(1, Math.round(level))) - 1] ?? RANK_LABELS[0];

/** Is this person a learner under the policy right now (mode, pilot group, role enrolment, explicit status)? */
export function isLearnerUnder(p: DevPolicy, user: { uid: string; role: string; externalCreator?: boolean; isActive?: boolean }, explicitlyEnrolled?: boolean): boolean {
  if (user.externalCreator || user.isActive === false) return false;
  if (p.mode === "off") return false;
  if (p.mode === "pilot" && !p.pilotUids.includes(user.uid)) return false;
  return explicitlyEnrolled ?? !!p.enrollRoles[user.role];
}
