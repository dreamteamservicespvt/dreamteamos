/**
 * Scoring (FR-016 – FR-019, MSRS §13.2).
 *
 * • Objective items are scored HERE, in code, from the stored key — never by a model (FR-016, AC-010).
 * • Open answers are scored by AI judges against the stored, versioned rubric; this file decides whether a judge's
 *   output may be used at all (`checkJudgeOutput`), how two judges are reconciled (`reconcileJudges`) and what the
 *   final score is. A verdict that fails a check is discarded — a score is never invented (FR-018, MSRS §13.2).
 * • Hints cost `hintPenalty` of the item each (FR-023: hint use counts in the scoring rules).
 */
import type {
  AttemptResponse, Confidence, CriterionScore, GapKind, ItemKey, ItemType, JudgeVerdict, Rubric, Scoring,
} from "./types.js";

export interface ObjectiveResult {
  score: number;
  correct: boolean;
  /** The key, mapped to the learner's option order (for the reveal). */
  revealCorrect?: number[];
  revealOrder?: number[];
  codes: string[];
}

/** shown index → original index */
const toOriginal = (shown: number, order?: number[]) => (order && order[shown] !== undefined ? order[shown] : shown);
/** original index → shown index */
const toShown = (orig: number, order?: number[]) => (order ? order.indexOf(orig) : orig);

/**
 * Score an objective answer. `optionOrder[i]` = the original index of the option shown in position i.
 * Returns null when the response does not fit the item type (the caller refuses it as a bad request).
 */
export function scoreObjective(
  type: ItemType, key: ItemKey, response: AttemptResponse, optionOrder: number[] | undefined, hints: number, hintPenalty: number,
): ObjectiveResult | null {
  const codes: string[] = [];
  let raw = 0;
  let correct = false;
  let revealCorrect: number[] | undefined;
  let revealOrder: number[] | undefined;

  if (type === "mcq" || type === "multi") {
    if (response.kind !== "choice" || !key.correct?.length) return null;
    const optionCount = optionOrder?.length ?? Math.max(...key.correct) + 1;
    const picked = [...new Set(response.selected)];
    if (picked.some((i) => !Number.isInteger(i) || i < 0 || i >= optionCount)) return null;
    if (type === "mcq" && picked.length !== 1) return null;
    const chosen = new Set(picked.map((i) => toOriginal(i, optionOrder)));
    const want = new Set(key.correct);
    revealCorrect = key.correct.map((o) => toShown(o, optionOrder)).sort((a, b) => a - b);
    if (type === "mcq") {
      correct = want.has([...chosen][0]);
      raw = correct ? 100 : 0;
    } else {
      let hit = 0;
      let wrong = 0;
      for (const c of chosen) (want.has(c) ? hit++ : wrong++);
      correct = hit === want.size && wrong === 0;
      raw = Math.max(0, (hit - wrong) / want.size) * 100;
    }
  } else if (type === "numeric") {
    if (response.kind !== "number" || !Number.isFinite(response.value) || key.value === undefined) return null;
    const tol = key.tolerance ?? 0;
    correct = Math.abs(response.value - key.value) <= tol + 1e-9;
    raw = correct ? 100 : 0;
  } else if (type === "order") {
    if (response.kind !== "order" || !key.order?.length) return null;
    const n = key.order.length;
    const asOriginal = response.order.map((i) => toOriginal(i, optionOrder));
    if (asOriginal.length !== n || new Set(asOriginal).size !== n || asOriginal.some((i) => i < 0 || i >= n)) return null;
    let same = 0;
    for (let i = 0; i < n; i++) if (asOriginal[i] === key.order[i]) same++;
    correct = same === n;
    raw = (same / n) * 100;
    revealOrder = key.order.map((o) => toShown(o, optionOrder));
  } else {
    return null;
  }
  const penalty = Math.min(0.9, Math.max(0, hints) * hintPenalty);
  if (hints > 0) codes.push("hint_penalty");
  return { score: Math.round(raw * (1 - penalty)), correct, revealCorrect, revealOrder, codes };
}

// ── Rubrics and judges ───────────────────────────────────────────────────────────────────────────

/** Weighted percentage of a set of 0–4 criterion scores. */
export function rubricPercent(criteria: readonly CriterionScore[]): number {
  const totalWeight = criteria.reduce((s, c) => s + (c.weight > 0 ? c.weight : 0), 0);
  if (!totalWeight) return 0;
  const got = criteria.reduce((s, c) => s + (c.weight > 0 ? (Math.min(4, Math.max(0, c.score)) / 4) * c.weight : 0), 0);
  return Math.round((got / totalWeight) * 100);
}

export function rubricPassed(rubric: Rubric, criteria: readonly CriterionScore[], percent: number): boolean {
  const failedCritical = rubric.criteria.some((rc) => rc.critical && (criteria.find((c) => c.id === rc.id)?.score ?? 0) === 0);
  return !failedCritical && percent >= rubric.passMark;
}

// Dashes and the ellipsis character fold to a space too: a judge copying "posts — for" as "posts - for" quotes truly.
const squash = (s: string) => s.toLowerCase().replace(/[\s"'“”‘’`.,;:!?()[\]{}\-–—…]+/g, " ").trim();

/**
 * Is a judge's quoted evidence really in the answer? Judges shorten a long quote with "..." / "…" (seen live,
 * 2026-10-18: "Each month we plan your posts... Nothing is posted until you approve it..."), so each part between the
 * elisions must be in the answer, in order. Parts of fewer than 3 characters prove nothing and are ignored.
 */
export function quoteInAnswer(evidence: string, answer: string): boolean {
  const hay = squash(answer);
  const parts = evidence.split(/\.{3,}|…/).map(squash).filter((p) => p.length >= 3);
  if (!parts.length) return false;
  let from = 0;
  for (const p of parts) {
    const at = hay.indexOf(p, from);
    if (at < 0) return false;
    from = at + p.length;
  }
  return true;
}

/**
 * A judge's confidence on 0–1. Asked for 0–1, models still answer on other scales — live on 2026-10-18,
 * gemini-2.5-flash answered `5` (a five-point scale) on every verdict, and the strict 0–1 check refused them ALL, so no
 * open answer could ever be graded. Read 0–1 as is, ≤ 5 as a five-point scale, ≤ 10 as ten points, ≤ 100 as a
 * percentage ("85", "85%"), and the words high / medium / low. null = absent or unreadable.
 */
export function readConfidence(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === "number" && Number.isFinite(v)) n = v;
  else if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    const words: Record<string, number> = { "very high": 0.95, high: 0.9, medium: 0.6, moderate: 0.6, low: 0.3, "very low": 0.15 };
    if (t in words) return words[t];
    const m = /^(\d+(?:\.\d+)?)\s*(%)?$/.exec(t);
    if (m) n = m[2] ? Number(m[1]) / 100 : Number(m[1]);
  }
  if (n === null || n < 0) return null;
  if (n <= 1) return n;
  if (n <= 5) return n / 5;
  if (n <= 10) return n / 10;
  if (n <= 100) return n / 100;
  return null;
}

/** The confidence given to a verdict that stated none: below the policy's low-confidence line, so a second judge checks. */
export const ASSUMED_CONFIDENCE = 0.5;

/** Phrases that try to steer a grader — the answer is graded as content, never obeyed (MSRS §16, prompt injection). */
const INJECTION = [
  /ignore\s+(all|any|the|previous|prior|above|earlier)\s+(instructions|rules|prompts?|directions)/i,
  /(give|award|assign|mark)\s+(me|this|this answer)?\s*(full|maximum|max|perfect|100\s*%?|top)\s*(marks|score|points|grade)/i,
  /(system|developer)\s+(prompt|message|instructions)/i,
  /<\/?\s*(system|assistant|instructions?|judge)\s*>/i,
  /you\s+are\s+(now\s+)?(a|an|the)\s+(judge|grader|assistant|ai)/i,
  /score\s*[:=]\s*(100|4\/4)/i,
  /disregard\s+(the|your)\s+(rubric|criteria|instructions)/i,
];

export function injectionSuspected(answer: string): boolean {
  return INJECTION.some((re) => re.test(answer));
}

export interface JudgeCheck {
  verdict: JudgeVerdict | null;
  problems: string[];
  /** Quotes the judge gave that are not in the answer (hallucinated evidence). */
  fabricated: number;
  /** Positive scores with no quote at all. */
  unquoted: number;
  /** The judge stated no readable confidence; `ASSUMED_CONFIDENCE` was used (which asks for a second judge). */
  assumedConfidence: boolean;
}

/**
 * Turn a judge model's parsed JSON into a verdict, or refuse it. Refused when: a rubric criterion is missing or
 * duplicated, a score is not a whole number 0–4, an unknown criterion appears, or more than one quoted "evidence" is
 * not actually in the answer (the judge made it up). A confidence on another scale is read (`readConfidence`); a
 * missing one is assumed low — it never throws a sound verdict away (2026-10-18, see `readConfidence`).
 */
export function checkJudgeOutput(raw: unknown, rubric: Rubric, answer: string, model: string, at: number): JudgeCheck {
  const problems: string[] = [];
  const out: JudgeCheck = { verdict: null, problems, fabricated: 0, unquoted: 0, assumedConfidence: false };
  if (!raw || typeof raw !== "object") {
    problems.push("not an object");
    return out;
  }
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.criteria) ? r.criteria : null;
  if (!list) {
    problems.push("criteria missing");
    return out;
  }
  const want = new Map(rubric.criteria.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const crit: CriterionScore[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") { problems.push("bad criterion entry"); continue; }
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" ? c.id : "";
    const def = want.get(id);
    if (!def) { problems.push(`unknown criterion ${id || "(none)"}`); continue; }
    if (seen.has(id)) { problems.push(`criterion ${id} twice`); continue; }
    seen.add(id);
    const score = c.score;
    if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 4) {
      problems.push(`criterion ${id}: score ${String(score)} is not 0–4`);
      continue;
    }
    let evidence = typeof c.evidence === "string" ? c.evidence.trim() : "";
    if (evidence && !squash(evidence.replace(/\.{3,}|…/g, " "))) evidence = ""; // only dots — no quote at all
    if (evidence) {
      if (!quoteInAnswer(evidence, answer)) {
        out.fabricated++;
        evidence = "";
      }
    } else if (score > 0) {
      out.unquoted++;
    }
    crit.push({ id, label: def.label, weight: def.weight, score, evidence: evidence || undefined, note: typeof c.note === "string" ? c.note.slice(0, 300) : undefined });
  }
  for (const id of want.keys()) if (!seen.has(id)) problems.push(`criterion ${id} missing`);
  const read = readConfidence(r.confidence);
  out.assumedConfidence = read === null;
  const confidence = read ?? ASSUMED_CONFIDENCE;
  if (out.fabricated > 1) problems.push(`${out.fabricated} quoted passages are not in the answer`);
  if (problems.length) return out;
  const gaps = Array.isArray(r.gaps) ? r.gaps.filter((g): g is string => typeof g === "string").slice(0, 5).map((g) => g.slice(0, 200)) : [];
  out.verdict = {
    model,
    score: rubricPercent(crit),
    criteria: rubric.criteria.map((rc) => crit.find((c) => c.id === rc.id)!),
    confidence: Math.max(0, confidence - 0.1 * out.fabricated - 0.03 * out.unquoted),
    summary: typeof r.summary === "string" ? r.summary.slice(0, 400) : "",
    gaps,
    at,
  };
  return out;
}

export interface Reconciled {
  state: "final" | "need_second" | "need_adjudication" | "pending";
  score?: number;
  criteria?: CriterionScore[];
  disagreement?: number;
  confidence?: Confidence;
}

/** Numeric judge confidence (0–1) + agreement → the stored confidence word (FR-019). */
export function confidenceWord(c: number, disagreement: number | undefined, tolerance: number): Confidence {
  if (disagreement !== undefined && disagreement > tolerance) return "low";
  if (c >= 0.8 && (disagreement === undefined || disagreement <= tolerance / 2)) return "high";
  if (c >= 0.6) return "medium";
  return "low";
}

export interface ReconcileRules {
  /** A second judge is required (high-impact purpose, injection suspected …). */
  requireSecond: boolean;
  passMark: number;
  lowConfidence: number;
  nearThreshold: number;
  tolerance: number;
}

/**
 * What to do with the verdicts so far (FR-018):
 *  one verdict → final unless a second is required, it is unsure, or it sits within `nearThreshold` of the pass mark;
 *  two → final when they agree within `tolerance` (the mean), else ask an adjudicator;
 *  three → final when the adjudicator is within `tolerance` of either (the mean of that pair), else pending.
 */
export function reconcileJudges(verdicts: readonly JudgeVerdict[], rules: ReconcileRules): Reconciled {
  const v = verdicts.filter(Boolean);
  if (!v.length) return { state: "pending" };
  if (v.length === 1) {
    const a = v[0];
    const unsure = a.confidence < rules.lowConfidence || Math.abs(a.score - rules.passMark) <= rules.nearThreshold;
    if (rules.requireSecond || unsure) return { state: "need_second" };
    return { state: "final", score: a.score, criteria: a.criteria, confidence: confidenceWord(a.confidence, undefined, rules.tolerance) };
  }
  const [a, b] = v;
  const d = Math.abs(a.score - b.score);
  if (v.length === 2) {
    if (d > rules.tolerance) return { state: "need_adjudication", disagreement: d };
    return { state: "final", ...merge([a, b]), disagreement: d, confidence: confidenceWord((a.confidence + b.confidence) / 2, d, rules.tolerance) };
  }
  const c = v[2];
  const pairs: [JudgeVerdict, JudgeVerdict][] = [[a, c], [b, c]];
  const agreeing = pairs.filter(([x, y]) => Math.abs(x.score - y.score) <= rules.tolerance)
    .sort((p, q) => Math.abs(p[0].score - p[1].score) - Math.abs(q[0].score - q[1].score));
  if (!agreeing.length) return { state: "pending", disagreement: d };
  const [x, y] = agreeing[0];
  return { state: "final", ...merge([x, y]), disagreement: d, confidence: confidenceWord(Math.min(x.confidence, y.confidence), Math.abs(x.score - y.score), rules.tolerance) };
}

/** Per-criterion mean (rounded to the 0–4 scale), weighted percentage of that. */
function merge(vs: readonly JudgeVerdict[]): { score: number; criteria: CriterionScore[] } {
  const base = vs[0].criteria;
  const criteria = base.map((c) => {
    const scores = vs.map((v) => v.criteria.find((x) => x.id === c.id)?.score ?? 0);
    const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
    const evidence = vs.map((v) => v.criteria.find((x) => x.id === c.id)?.evidence).find(Boolean);
    return { ...c, score: Math.round(mean * 2) / 2, evidence };
  });
  const score = Math.round(vs.reduce((s, v) => s + v.score, 0) / vs.length);
  return { score, criteria };
}

/** The final Scoring of an open answer once reconciled. */
export function openScoring(rubric: Rubric, r: Reconciled, verdicts: JudgeVerdict[], codes: string[], at: number): Scoring {
  const criteria = r.criteria ?? [];
  const score = r.score ?? 0;
  const method = verdicts.length >= 3 ? "rubric_ai_adjudicated" : verdicts.length === 2 ? "rubric_ai_2" : "rubric_ai";
  return {
    method,
    score,
    passed: rubricPassed(rubric, criteria, score),
    criteria,
    judges: verdicts,
    disagreement: r.disagreement,
    confidence: r.confidence ?? "low",
    codes,
    at,
  };
}

/** The gap the coach names for a wrong objective answer, by family default (FR-022). */
export function gapFor(defaultGap: GapKind, correct: boolean): GapKind {
  return correct ? "none" : defaultGap;
}
