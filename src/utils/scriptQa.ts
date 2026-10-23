/**
 * Reading the voice-over quality gate's report, and deciding — in code — what happens to the script.
 *
 * The judge (services/prompts/scriptQa) scores eight things against a written rubric and lists problems.
 * What the scores MEAN is decided here, never by the model:
 *   • the overall score is computed here from the dimension scores (the judge sends none);
 *   • a mechanical failure found by code (a clip outside 17–20 words, a missing speaker, Latin letters in a
 *     Telugu line, a leaked call to action…) CAPS the dimension it belongs to, so no rating can hide it;
 *   • a script is "10/10" only when every dimension is 10 after those caps, no claim is unsupported, the
 *     judge lists no problem and code finds no mechanical issue — never because the judge said so;
 *   • otherwise it is polished (targeted edits) or written again, and the best draft is kept.
 * The improvement loop itself (how many passes, when to stop) is decided by nextImprovement below.
 *
 * ── History ─────────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-25: six dimensions, ship at overall ≥ 8. 2026-10-15 (owner: "exceptional, production-ready
 * scripts … a genuine 10/10"): eight dimensions (+ cast integrity, originality & flow), the 17–20 word
 * contract in speakability, a rubric with anchors, scores consistent with the problems listed, mechanical
 * caps, and a loop that keeps improving the best draft until it is 10/10 or the budget is spent.
 */

export const QA_DIMENSIONS = ["facts", "language", "persuasion", "clarity", "relevance", "speakability", "cast", "originality"] as const;
export type QaDimension = (typeof QA_DIMENSIONS)[number];

/** What each dimension is called on screen and in the report. */
export const QA_DIMENSION_LABELS: Record<QaDimension, string> = {
  facts: "Factual accuracy",
  language: "Language quality",
  persuasion: "Persuasion",
  clarity: "Clarity",
  relevance: "Business relevance",
  speakability: "Speakability & timing",
  cast: "Cast integrity",
  originality: "Originality & flow",
};

export interface ScriptQaProblem {
  clip: number;
  issue: string;
  fix: string;
  /** The rubric dimension the problem costs — it can never score 10 while the problem stands. */
  dimension?: QaDimension;
}

export interface ScriptQaReport {
  /** The scores that count: the judge's, held to the problems it listed and to code's mechanical findings. */
  scores: Record<QaDimension, number>;
  /** The judge's scores exactly as it gave them, before any cap. */
  judgeScores: Record<QaDimension, number>;
  /** Weighted in code from `scores` — facts and language weigh most. */
  overall: number;
  unsupportedClaims: string[];
  problems: ScriptQaProblem[];
  rewriteBrief: string;
  /** The mechanical issues code found on this exact script (applied as caps — see withMechanicalChecks). */
  mechanical: string[];
}

/** Below any of these a script is written again rather than polished. */
export const QA_REWRITE_BELOW = { overall: 6.5, facts: 6, language: 6, persuasion: 5.5, relevance: 6, cast: 5 } as const;

/**
 * The weights of the overall score. A wrong fact or a clumsy line is what a client notices first; cast
 * and originality matter, and the hard parts of both are also checked in code.
 */
const WEIGHTS: Record<QaDimension, number> = {
  facts: 0.18, language: 0.18, persuasion: 0.14, clarity: 0.12, relevance: 0.1, speakability: 0.12, cast: 0.08, originality: 0.08,
};

/*
  ── Why the loop stops at "ready", not only at 10/10 (2026-10-16, the owner: "ad deliverables taking lot of
  time … tech is working now, time is getting delayed") ──
  On 2026-10-15 the loop chased a genuine 10/10 for up to 5 passes / 120 s. Live, no script ever reached it
  (9.4–9.8 after 3–4 passes, stopped "stalled"), so nearly EVERY run spent the whole budget polishing a script
  that was already fine — 147–239 s a run instead of ~100 s, with bursts that hit Google's per-minute limit —
  and no frame or video prompt starts until the script is final. A draft that is READY (isReady) now ships at
  once; the hard rules (the cast, 17–20 words, no invented fact, nothing code found) are never relaxed, the
  kit still shows the real score, and `passed` still means a genuine 10/10.
*/
/** The improvement loop's budget — the one place to change it (geminiService runQualityLoop reads these). */
export const SCRIPT_IMPROVEMENT_PASSES = 3;
/** Consecutive passes that find no better draft before the loop stops — one empty round is enough (live: a second rarely helped). */
export const SCRIPT_IMPROVEMENT_STALLS = 1;
/** Wall-clock budget for the improvement passes; after it the best draft so far ships. */
export const SCRIPT_GATE_DEADLINE_MS = 45_000;
/** A script at or above this overall score — with every hard rule met — ships without more passes (isReady). */
export const SCRIPT_READY_SCORE = 9;
/** …and no single dimension below this. */
export const SCRIPT_READY_DIMENSION = 8.5;

const clampScore = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : NaN;
};

const isDimension = (v: unknown): v is QaDimension => typeof v === "string" && (QA_DIMENSIONS as readonly string[]).includes(v);

/** The weighted overall score, to one decimal. */
export function overallScore(scores: Record<QaDimension, number>): number {
  const total = QA_DIMENSIONS.reduce((sum, d) => sum + scores[d] * WEIGHTS[d], 0);
  return Math.round(total * 10) / 10;
}

/**
 * The judge's own findings made consistent: an unsupported claim caps facts at 4, and every problem it
 * lists caps its dimension at 9 — a judge cannot name a fault and still give that dimension a 10.
 */
function consistentScores(judge: Record<QaDimension, number>, problems: ScriptQaProblem[], unsupported: string[]): Record<QaDimension, number> {
  const scores = { ...judge };
  if (unsupported.length > 0) scores.facts = Math.min(scores.facts, 4);
  for (const p of problems) if (p.dimension) scores[p.dimension] = Math.min(scores[p.dimension], 9);
  return scores;
}

/**
 * The judge's JSON reply, or null when it cannot be trusted: not JSON, or any of the eight scores missing
 * or not a number. A partial report is not guessed at — a missing score is not a 10.
 */
export function parseScriptQa(raw: string): ScriptQaReport | null {
  if (!raw?.trim()) return null;
  let data: any;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    data = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    return null;
  }
  const rawScores = data?.scores && typeof data.scores === "object" ? data.scores : {};
  const judgeScores = {} as Record<QaDimension, number>;
  for (const d of QA_DIMENSIONS) {
    const v = clampScore(rawScores[d]);
    if (Number.isNaN(v)) return null;
    judgeScores[d] = v;
  }
  const unsupportedClaims = Array.isArray(data.unsupportedClaims)
    ? data.unsupportedClaims.filter((c: unknown): c is string => typeof c === "string" && !!c.trim()).map((c: string) => c.trim())
    : [];
  const problems: ScriptQaProblem[] = Array.isArray(data.problems)
    ? data.problems
      .filter((p: any) => p && typeof p === "object" && (p.issue || p.fix))
      .map((p: any) => ({
        clip: Number.isFinite(Number(p.clip)) ? Math.max(0, Math.round(Number(p.clip))) : 0,
        issue: String(p.issue || "").trim(),
        fix: String(p.fix || "").trim(),
        ...(isDimension(p.dimension) ? { dimension: p.dimension } : {}),
      }))
    : [];
  const scores = consistentScores(judgeScores, problems, unsupportedClaims);
  return {
    scores,
    judgeScores,
    overall: overallScore(scores),
    unsupportedClaims,
    problems,
    rewriteBrief: typeof data.rewriteBrief === "string" ? data.rewriteBrief.trim() : "",
    mechanical: [],
  };
}

/**
 * Which dimension a mechanical issue costs, and the most it may then score. Matched on the wording the
 * validators use (geminiService validateVoiceOverSegments, utils/dialogueFormat, prompts/everydaySpeech,
 * utils/spokenAddress, utils/speakingPosition, prompts/festivalWish, utils/scriptContract). An issue no
 * rule knows still blocks a 10/10 (isPerfect) without capping a dimension.
 */
const MECHANICAL_CAPS: { test: RegExp; dimension: QaDimension; cap: number }[] = [
  { test: /must contain \d+[–-]\d+ spoken words|'s line must be \d+[–-]\d+ words/, dimension: "speakability", cap: 5 },
  // A clip Flow cannot say in eight seconds (utils/scriptContract clipSyllableIssue, 2026-10-22).
  { test: /is too long to say in 8 seconds/, dimension: "speakability", cap: 6 },
  // Five words in a row said again in a later clip (utils/scriptContract repeatedPhraseIssues, 2026-10-22).
  { test: /repeats clip \d+'s words/, dimension: "originality", cap: 6 },
  { test: /phone\/contact number|speak a phone|spoken numbers/i, dimension: "speakability", cap: 6 },
  { test: /must end with spoken punctuation/, dimension: "speakability", cap: 9 },
  { test: /Latin letters or digits|contains digits in spoken/, dimension: "language", cap: 6 },
  { test: /uses words people do not say in everyday/, dimension: "language", cap: 8 },
  { test: /is missing .+'s line|has no line from|must speak in position|speaks \d+ times|not in this ad|line is empty|spoken lines — one for|says ".+" out loud|name is spoken \d+ times|name is never spoken/, dimension: "cast", cap: 5 },
  { test: /duplicates clip|both characters say the same|repeated adjacent words|Expected exactly \d+ clips|Structured output contains/, dimension: "originality", cap: 5 },
  { test: /leaks CTA|on-screen call CTA/, dimension: "persuasion", cap: 8 },
  { test: /address/i, dimension: "clarity", cap: 7 },
  { test: /sends the viewer somewhere else/, dimension: "clarity", cap: 8 },
  { test: /festival wish and must greet|is never spoken in clip/, dimension: "relevance", cap: 8 },
];

/** The caps code's mechanical findings put on the scores. */
export function mechanicalCaps(issues: string[]): Partial<Record<QaDimension, number>> {
  const caps: Partial<Record<QaDimension, number>> = {};
  for (const issue of issues) {
    for (const rule of MECHANICAL_CAPS) {
      if (!rule.test.test(issue)) continue;
      caps[rule.dimension] = Math.min(caps[rule.dimension] ?? 10, rule.cap);
      break;
    }
  }
  return caps;
}

/**
 * The report for THIS exact script once code has checked it: the mechanical issues are recorded and cap
 * their dimensions, and the overall score is computed again. A perfect rating can never cover a clip
 * outside 17–20 words, a missing speaker, a wrong script or a broken call to action.
 */
export function withMechanicalChecks(report: ScriptQaReport, issues: string[]): ScriptQaReport {
  const caps = mechanicalCaps(issues);
  const scores = { ...report.scores };
  for (const d of QA_DIMENSIONS) if (typeof caps[d] === "number") scores[d] = Math.min(scores[d], caps[d]!);
  return { ...report, scores, overall: overallScore(scores), mechanical: [...issues] };
}

/** 10/10 — every dimension 10, no unsupported claim, no problem left, nothing mechanical. Nothing less. */
export function isPerfect(report: ScriptQaReport): boolean {
  return QA_DIMENSIONS.every((d) => report.scores[d] >= 10)
    && report.unsupportedClaims.length === 0
    && report.problems.length === 0
    && report.mechanical.length === 0;
}

/**
 * Good enough to ship without another pass: no unsupported claim, nothing mechanical on the exact text, the
 * overall at least SCRIPT_READY_SCORE and every dimension at least SCRIPT_READY_DIMENSION. (The cast and the
 * word contract are checked by nextImprovement beside it.) Listed problems do not block it — the judge lists
 * one on nearly every script, and each already caps its dimension at 9.
 */
export function isReady(report: ScriptQaReport): boolean {
  return report.unsupportedClaims.length === 0
    && report.mechanical.length === 0
    && report.overall >= SCRIPT_READY_SCORE
    && QA_DIMENSIONS.every((d) => report.scores[d] >= SCRIPT_READY_DIMENSION);
}

export type QaDecision = "pass" | "polish" | "rewrite";

/** What happens next — decided from the scores, never from the judge's own opinion of its verdict. */
export function qaDecision(report: ScriptQaReport): QaDecision {
  if (isPerfect(report)) return "pass";
  const s = report.scores;
  if (report.overall < QA_REWRITE_BELOW.overall || s.facts < QA_REWRITE_BELOW.facts || s.language < QA_REWRITE_BELOW.language
    || s.persuasion < QA_REWRITE_BELOW.persuasion || s.relevance < QA_REWRITE_BELOW.relevance || s.cast < QA_REWRITE_BELOW.cast) {
    return "rewrite";
  }
  return "polish";
}

/** The report as instructions a writer or an editor can act on, one per line. */
export function qaInstructions(report: ScriptQaReport): string[] {
  const out: string[] = [];
  for (const claim of report.unsupportedClaims) {
    out.push(`${claim.replace(/\s+/g, " ")} — remove it, or replace it with a fact the business information actually gives.`);
  }
  for (const p of report.problems) {
    const where = p.clip > 0 ? `Clip ${p.clip}: ` : "";
    const what = p.dimension ? ` [${QA_DIMENSION_LABELS[p.dimension]}]` : "";
    out.push(`${where}${p.issue}${p.fix ? ` — ${p.fix}` : ""}${what}`);
  }
  for (const issue of report.mechanical) out.push(issue);
  const weak = QA_DIMENSIONS.filter((d) => report.scores[d] < 10);
  if (weak.length > 0) out.push(`Below 10/10 on: ${weak.map((d) => `${QA_DIMENSION_LABELS[d]} ${report.scores[d]}/10`).join(", ")}.`);
  return out;
}

/** A draft as the gate compares it. */
export interface DraftStanding {
  report: ScriptQaReport | null;
  /** Mechanical issues of any kind on this draft. */
  mechanicalIssues: number;
  /** Problems that make it NOT this ad's cast (utils/dialogueFormat castIntegrityIssues). */
  broken?: number;
  /** The word contract on the exact text (utils/scriptContract contractViolations): violations and distance. */
  contract?: { violations: number; distance: number };
}

/**
 * Is `b` a better draft than `a`?
 *   1. keeps the ad's cast (2026-10-08 — a duo draft that lost the man's lines scored HIGHER and shipped);
 *   2. obeys the word contract — fewer clips outside 17–20 words (or duplicated / missing), then nearer
 *      the band (2026-10-15: a polished draft with a 23-word clip used to beat a valid one on score);
 *   3. was judged at all; 4. invents no fact; 5. the higher overall score; 6. fewer mechanical problems.
 */
export function isBetterDraft(a: DraftStanding, b: DraftStanding): boolean {
  const aBroken = a.broken ?? 0;
  const bBroken = b.broken ?? 0;
  if (aBroken !== bBroken) return bBroken < aBroken;
  const aContract = a.contract ?? { violations: 0, distance: 0 };
  const bContract = b.contract ?? { violations: 0, distance: 0 };
  if (aContract.violations !== bContract.violations) return bContract.violations < aContract.violations;
  if (aContract.distance !== bContract.distance) return bContract.distance < aContract.distance;
  if (!b.report) return !a.report && b.mechanicalIssues < a.mechanicalIssues;
  if (!a.report) return true;
  const aClean = a.report.unsupportedClaims.length === 0;
  const bClean = b.report.unsupportedClaims.length === 0;
  if (aClean !== bClean) return bClean;
  if (b.report.overall !== a.report.overall) return b.report.overall > a.report.overall;
  return b.mechanicalIssues < a.mechanicalIssues;
}

/** Why the improvement loop stopped. */
export type ImprovementStop = "perfect" | "ready" | "passes" | "stalled" | "deadline" | "unscored";

export interface ImprovementState {
  best: DraftStanding;
  /** Improvement drafts already written (each costs at least one writer call and one judge call). */
  passesUsed: number;
  /** Consecutive rounds that produced no better draft. */
  stalls: number;
  elapsedMs: number;
  /** The one extra round (SCRIPT_EXTRA_ROUND) has been spent (2026-10-23). */
  extraRoundUsed?: boolean;
  limits?: { passes?: number; stalls?: number; deadlineMs?: number };
}

/** `extra`: this is the one round past the budget, for a best draft that still breaks a hard rule (2026-10-23). */
export type ImprovementStep = { stop: ImprovementStop } | { mode: "polish" | "rewrite"; drafts: number; extra?: true };

/*
  ── One more round when the best draft still breaks a hard rule (2026-10-23 — the owner's decision) ──
  Live on 2026-10-23 a Kids run stopped "stalled" with a 16-word clip and two passes left, and a duo shipped a
  13-word line that Flow cut: a draft that breaks the cast or the contract can never ship, so stopping there cost
  the member a whole Generate (the final gate refuses it). When the budget (passes, stalls or the deadline) is
  spent and the best draft still breaks a hard rule, the loop now writes ONE more draft — never a second — with
  its own time budget (SCRIPT_EXTRA_ROUND_MS). A draft that only misses READY on score never gets it.
*/
/** The extra round's own wall-clock budget — the main deadline may already be spent. */
export const SCRIPT_EXTRA_ROUND_MS = 25_000;

/**
 * The improvement loop's next step — pure, so its bounds are testable without a model.
 *
 * It stops when the best draft is 10/10 or READY (isReady — and obeys the contract and its cast), when the passes are spent
 * (SCRIPT_IMPROVEMENT_PASSES), after SCRIPT_IMPROVEMENT_STALLS rounds in a row found nothing better, when
 * the wall-clock budget is gone, or when nothing directs an improvement (the judge cannot run and code
 * finds nothing to fix) — except that a best draft still breaking the cast or the contract when the budget is spent
 * gets ONE extra round (`extra`, SCRIPT_EXTRA_ROUND_MS; 2026-10-23). Otherwise: a broken cast or a script weak at its core is written again — two
 * drafts side by side on the first round — and anything else is polished with targeted edits.
 */
export function nextImprovement(state: ImprovementState): ImprovementStep {
  const passes = state.limits?.passes ?? SCRIPT_IMPROVEMENT_PASSES;
  const stallLimit = state.limits?.stalls ?? SCRIPT_IMPROVEMENT_STALLS;
  const deadline = state.limits?.deadlineMs ?? SCRIPT_GATE_DEADLINE_MS;
  const { best } = state;
  const broken = best.broken ?? 0;
  const violations = best.contract?.violations ?? 0;
  if (broken === 0 && violations === 0 && best.report && isPerfect(best.report)) return { stop: "perfect" };
  if (broken === 0 && violations === 0 && best.report && isReady(best.report)) return { stop: "ready" };
  const spent: ImprovementStop | null = state.passesUsed >= passes ? "passes"
    : state.stalls >= stallLimit ? "stalled"
      : state.elapsedMs >= deadline ? "deadline" : null;
  if (spent) {
    if ((broken > 0 || violations > 0) && !state.extraRoundUsed) return { mode: broken > 0 ? "rewrite" : "polish", drafts: 1, extra: true };
    return { stop: spent };
  }
  const remaining = passes - state.passesUsed;
  const firstRound = state.passesUsed === 0;
  if (broken > 0) return { mode: "rewrite", drafts: firstRound ? Math.min(2, remaining) : 1 };
  if (!best.report) {
    return violations > 0 || best.mechanicalIssues > 0 ? { mode: "polish", drafts: 1 } : { stop: "unscored" };
  }
  const decision = qaDecision(best.report);
  if (decision === "rewrite") return { mode: "rewrite", drafts: firstRound ? Math.min(2, remaining) : 1 };
  return { mode: "polish", drafts: 1 };
}

/** What the kit shows about the script's check. */
export interface ScriptQaSummary {
  /** The overall score code computed for the draft that shipped, 0–10 (0 when it could not be scored — see `unscored`). */
  score: number;
  /** True only for a genuine 10/10 (isPerfect) on a script that obeys the word contract. Before 2026-10-15: overall ≥ 8. */
  passed: boolean;
  /** Drafts judged in all (the first plus every improvement draft). */
  drafts: number;
  /** The scores that count (after the mechanical caps) for the draft that shipped. */
  scores: Record<QaDimension, number>;
  /** Up to three things still keeping it from 10/10, when it is not. */
  notes: string[];
  /** Improvement passes spent after the first draft (2026-10-15; absent on older kits). */
  passes?: number;
  /** Why the loop stopped (2026-10-15). */
  stopReason?: ImprovementStop;
  /** Spoken words per clip of the shipped script, counted in code (2026-10-15). */
  clipWords?: number[];
  /**
   * The exact voice-over text that was checked and shipped (2026-10-15). The studio shows the check only
   * while the kit's script is still this text — a refine or a final script afterwards is a different script.
   */
  checkedScript?: string;
  /** True when no judge could score the shipped script (quota, a broken reply) — `score` is then 0, not a rating. */
  unscored?: boolean;
}

export function qaSummary(
  report: ScriptQaReport,
  drafts: number,
  extra: { passes?: number; stopReason?: ImprovementStop; clipWords?: number[]; checkedScript?: string } = {},
): ScriptQaSummary {
  const perfect = isPerfect(report);
  return {
    score: report.overall,
    passed: perfect,
    drafts,
    scores: report.scores,
    notes: perfect ? [] : qaInstructions(report).slice(0, 3),
    ...extra,
  };
}

/** The summary of a script no judge could score — its word counts are still real. */
export function unscoredSummary(
  drafts: number,
  mechanical: string[],
  extra: { passes?: number; stopReason?: ImprovementStop; clipWords?: number[]; checkedScript?: string } = {},
): ScriptQaSummary {
  return {
    score: 0,
    passed: false,
    drafts,
    scores: {} as Record<QaDimension, number>,
    notes: ["The quality judge could not score this script (no answer from Gemini) — read it through before use.", ...mechanical].slice(0, 3),
    unscored: true,
    ...extra,
  };
}
