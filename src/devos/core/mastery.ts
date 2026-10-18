/**
 * The Mastery Engine's arithmetic (MSRS §11.1–11.3, FR-019, FR-024, FR-026, FR-040).
 *
 * ── The estimate (documented, deterministic, replayable — MSRS §11.3) ──────────────────────────────
 * Each dimension holds an ability θ on 0–100. Every item has a difficulty point b (1 → 25, 2 → 40, 3 → 55, 4 → 70,
 * 5 → 85). The chance a person at θ succeeds is p = 1 / (1 + e^-(θ − b)/10). After an answer scored s (0–100):
 *     θ ← θ + K · q · (s/100 − p)
 * so a right answer on a hard item raises θ more than one on an easy item, and a wrong answer on an easy item lowers
 * it more than one on a hard item (the person was expected to fail it). For a k-option choice p = 1/k + (1 − 1/k)·p
 * (a lucky guess proves less). K = 24 / (1 + 0.15·n) shrinks as evidence grows, q is the
 * evidence quality (an objective key 1.0, a confident rubric 0.9, an unsure one 0.5, a verified practical task 1.2,
 * a retention / transfer check 1.1). The same rule replays the evidence ledger in time order (`replayDimension`), so
 * every score can be reproduced (FR-037) and explained item by item in the learner's history.
 *
 * ── What it never does ────────────────────────────────────────────────────────────────────────────
 * • Invent a score: a dimension with no valid evidence is `null` / "not measured yet" (FR-004).
 * • Decay a score with time (FR-040): only the CONFIDENCE drops when evidence goes stale.
 * • Count participation: only scored, valid evidence moves θ (MSRS §11.5).
 */
import type {
  Confidence, Difficulty, DimensionId, DimensionState, EvidenceDigest, EvidenceKind, Scoring, TrackId,
} from "./types.js";
import { DIMENSION_IDS } from "./dimensions.js";
import { addDays } from "./days.js";

export const DIFFICULTY_POINT: Readonly<Record<Difficulty, number>> = { 1: 25, 2: 40, 3: 55, 4: 70, 5: 85 };
export const THETA_START = 45;
const SCALE = 10;
const DAY_MS = 86_400_000;

/**
 * The chance of success. `guess` = 1/k for a k-option choice item: a lucky guess is possible, so a right answer
 * proves less (Pelánek 2016, "Applications of the Elo rating system in adaptive educational systems").
 */
export const expectedSuccess = (theta: number, d: Difficulty, guess = 0): number => {
  const p = 1 / (1 + Math.exp(-(theta - DIFFICULTY_POINT[d]) / SCALE));
  return guess > 0 ? guess + (1 - guess) * p : p;
};

/** K by how much evidence the dimension already has: 24 / (1 + 0.15·n) — fast at first, steady later (Pelánek's α/(1+βn)). */
export function kFactor(n: number): number {
  return 24 / (1 + 0.15 * Math.max(0, n));
}

/** The success rate items are aimed at — challenging but encouraging (~70%; research brief 2026-10-18, lesson 2). */
export const TARGET_SUCCESS = 0.7;

/** Evidence quality (MSRS §11.3 "evidence quality"). */
export function evidenceQuality(kind: EvidenceKind, scoring: Pick<Scoring, "method" | "confidence">): number {
  if (kind === "practical" || kind === "capstone") return scoring.confidence === "low" ? 0.7 : 1.2;
  let q = scoring.method === "deterministic" ? 1 : scoring.confidence === "high" ? 0.9 : scoring.confidence === "medium" ? 0.75 : 0.5;
  if (kind === "retention" || kind === "transfer") q *= 1.1;
  return Math.round(q * 100) / 100;
}

export function emptyDimension(): DimensionState {
  return { score: null, confidence: "none", n: 0, baseline: null, level: 2, run: 0, lastAt: null, recent: [], bestLevel: 0 };
}

export function emptyDimensions(): Record<DimensionId, DimensionState> {
  return Object.fromEntries(DIMENSION_IDS.map((d) => [d, emptyDimension()])) as Record<DimensionId, DimensionState>;
}

/** Confidence from the amount and freshness of evidence (stale evidence lowers confidence, never the score). */
export function confidenceOf(n: number, lastAt: number | null, now: number, staleDays = 60): Confidence {
  if (!n || lastAt === null) return "none";
  let level = n < 3 ? 1 : n < 8 ? 2 : 3;
  if (now - lastAt > staleDays * DAY_MS) level -= 1;
  return (["none", "low", "medium", "high"] as const)[Math.max(1, level)];
}

/** The difficulty that challenges this ability without overwhelming it: success expected about 70% of the time. */
export function difficultyForTheta(theta: number): Difficulty {
  let best: Difficulty = 1;
  let bestGap = Infinity;
  for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
    const gap = Math.abs(expectedSuccess(theta, d) - TARGET_SUCCESS);
    if (gap < bestGap) {
      bestGap = gap;
      best = d;
    }
  }
  return best;
}

export interface EvidenceInput {
  score: number;
  difficulty: Difficulty;
  quality: number;
  kind: EvidenceKind;
  setting: string;
  sourceId: string;
  at: number;
  /** 1/k for a k-option single-choice item (guessing correction); 0 otherwise. */
  guess?: number;
}

export interface AdaptRules {
  upScore: number;
  downScore: number;
  upAfter: number;
  downAfter: number;
  recentPerDim: number;
}

/**
 * The dimension after one more piece of valid evidence (pure). Updates θ, n, confidence, the adaptive level (FR-024:
 * harder after demonstrated mastery, scaffolded after repeated difficulty), the best level passed and the recent list.
 */
export function applyEvidence(state: DimensionState, ev: EvidenceInput, rules: AdaptRules, now = ev.at): DimensionState {
  const theta = state.score ?? THETA_START;
  const p = expectedSuccess(theta, ev.difficulty, ev.guess ?? 0);
  const next = Math.max(0, Math.min(100, theta + kFactor(state.n) * ev.quality * (ev.score / 100 - p)));
  const n = state.n + 1;
  let run = state.run;
  if (ev.score >= rules.upScore) run = run > 0 ? run + 1 : 1;
  else if (ev.score < rules.downScore) run = run < 0 ? run - 1 : -1;
  else run = 0;
  let level = difficultyForTheta(next);
  if (run >= rules.upAfter) level = Math.min(5, level + 1) as Difficulty;
  if (-run >= rules.downAfter) level = Math.max(1, level - 1) as Difficulty;
  const digest: EvidenceDigest = { s: Math.round(ev.score), d: ev.difficulty, q: ev.quality, t: ev.at, k: ev.kind, g: ev.setting, i: ev.sourceId };
  if (ev.guess) digest.c = ev.guess;
  const recent = [...state.recent, digest].slice(-Math.max(5, rules.recentPerDim));
  const rounded = Math.round(next * 10) / 10;
  return {
    ...state,
    score: rounded,
    baseline: state.baseline ?? (ev.kind === "baseline" || state.n === 0 ? rounded : state.baseline),
    n,
    confidence: confidenceOf(n, ev.at, now),
    level,
    run: run >= rules.upAfter || -run >= rules.downAfter ? 0 : run,
    lastAt: ev.at,
    recent,
    bestLevel: ev.score >= 60 ? Math.max(state.bestLevel, ev.difficulty) : state.bestLevel,
  };
}

/** Replay a dimension from its full evidence ledger, oldest first (reconcile / audit — FR-037, NFR-009). */
export function replayDimension(evidence: readonly EvidenceInput[], rules: AdaptRules, now: number): DimensionState {
  let s = emptyDimension();
  for (const ev of [...evidence].sort((a, b) => a.at - b.at)) s = applyEvidence(s, ev, rules, now);
  return { ...s, confidence: confidenceOf(s.n, s.lastAt, now) };
}

/** Refresh every dimension's confidence for staleness (the tick runs it; scores are untouched). */
export function refreshConfidence(dims: Record<DimensionId, DimensionState>, now: number): Record<DimensionId, DimensionState> {
  const out = { ...dims };
  for (const d of DIMENSION_IDS) out[d] = { ...dims[d], confidence: confidenceOf(dims[d].n, dims[d].lastAt, now) };
  return out;
}

// ── Spaced retention (FR-026) ───────────────────────────────────────────────────────────────────

/**
 * After a pass at `level` that was not itself a retention check: make sure a retention check is scheduled for that
 * level (box 0 → the first interval). After a retention check: pass → next box (graduated after the last interval),
 * fail → back to box 0. At most two levels are tracked per dimension (the highest).
 */
export function scheduleRetention(state: DimensionState, opts: { level: Difficulty; passed: boolean; wasRetention: boolean; day: string; intervals: number[] }): DimensionState {
  const list = [...(state.retention ?? [])];
  const at = list.findIndex((r) => r.level === opts.level);
  if (opts.wasRetention) {
    if (at < 0) return state;
    const box = opts.passed ? list[at].box + 1 : 0;
    if (box >= opts.intervals.length) list.splice(at, 1);
    else list[at] = { level: opts.level, box, due: addDays(opts.day, opts.intervals[box]) };
  } else if (opts.passed && at < 0) {
    list.push({ level: opts.level, box: 0, due: addDays(opts.day, opts.intervals[0]) });
  }
  list.sort((a, b) => b.level - a.level);
  return { ...state, retention: list.slice(0, 2) };
}

/** Retention checks due on or before `day`: [{dim, level, box}] oldest due first. */
export function dueRetention(dims: Record<DimensionId, DimensionState>, day: string): { dim: DimensionId; level: Difficulty; box: number; due: string }[] {
  const out: { dim: DimensionId; level: Difficulty; box: number; due: string }[] = [];
  for (const d of DIMENSION_IDS) for (const r of dims[d].retention ?? []) if (r.due <= day) out.push({ dim: d, level: r.level, box: r.box, due: r.due });
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

// ── The role-weighted summary (MSRS §11.2) ──────────────────────────────────────────────────────

/** Σ weight × score / 100, or null until every dimension is measured (it never hides a missing one). */
export function weightedSummary(dims: Record<DimensionId, DimensionState>, weights: Record<DimensionId, number>): number | null {
  let total = 0;
  for (const d of DIMENSION_IDS) {
    const s = dims[d]?.score;
    if (s === null || s === undefined) return null;
    total += (weights[d] / 100) * s;
  }
  return Math.round(total * 10) / 10;
}

/** Dimensions below a floor — shown next to any weighted total (Appendix A.1: a total never hides a weak skill). */
export function weakDimensions(dims: Record<DimensionId, DimensionState>, floor: number): DimensionId[] {
  return DIMENSION_IDS.filter((d) => dims[d].score !== null && (dims[d].score as number) < floor);
}

/** The word a learner reads for a dimension (the owner's rule: plain words, one picture). */
export function dimensionWord(state: DimensionState, isFocus: boolean): { word: string; tone: "good" | "ok" | "focus" | "none" } {
  if (state.score === null) return { word: "Not measured yet", tone: "none" };
  if (isFocus) return { word: "Focus now", tone: "focus" };
  if (state.score >= 75) return { word: "Strong", tone: "good" };
  if (state.score >= 55) return { word: "Growing", tone: "ok" };
  return { word: "Building", tone: "focus" };
}

/** Effective performance of one evidence item for the season's Mastery board: the score at the item's difficulty. */
export function effectiveValue(score: number, d: Difficulty): number {
  return (Math.max(0, Math.min(100, score)) / 100) * (DIFFICULTY_POINT[d] + 15);
}

export type { TrackId };
