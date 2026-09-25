/**
 * Reading the voice-over quality gate's report, and deciding — in code — what happens to the script.
 *
 * The judge (services/prompts/scriptQa) scores six things and lists problems. What the scores MEAN is
 * decided here, not by the model: a script ships only when every score clears its bar and no claim is
 * unsupported; a script with fixable problems is polished; a script that is weak at its core is
 * written again. Every new draft is judged again, and the best one is kept. See geminiService.
 */

export const QA_DIMENSIONS = ["facts", "language", "persuasion", "clarity", "relevance", "speakability"] as const;
export type QaDimension = (typeof QA_DIMENSIONS)[number];

export interface ScriptQaProblem {
  clip: number;
  issue: string;
  fix: string;
}

export interface ScriptQaReport {
  scores: Record<QaDimension, number>;
  /** Weighted in code — facts and language weigh most, because a wrong fact or a clumsy line is what a client notices. */
  overall: number;
  unsupportedClaims: string[];
  problems: ScriptQaProblem[];
  rewriteBrief: string;
}

/** The bar a script must clear to ship without another draft. */
export const QA_PASS = { overall: 8, each: 7, facts: 9 } as const;
/** Below any of these a script is written again rather than polished. */
export const QA_REWRITE_BELOW = { overall: 6.5, facts: 6, language: 6, persuasion: 5.5, relevance: 6 } as const;

const WEIGHTS: Record<QaDimension, number> = {
  facts: 0.22, language: 0.24, persuasion: 0.18, clarity: 0.14, relevance: 0.12, speakability: 0.10,
};

const clampScore = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : NaN;
};

/** The weighted overall score, to one decimal. */
export function overallScore(scores: Record<QaDimension, number>): number {
  const total = QA_DIMENSIONS.reduce((sum, d) => sum + scores[d] * WEIGHTS[d], 0);
  return Math.round(total * 10) / 10;
}

/** The judge's JSON reply, or null when it cannot be trusted (missing scores, not JSON). */
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
  const scores = {} as Record<QaDimension, number>;
  for (const d of QA_DIMENSIONS) {
    const v = clampScore(rawScores[d]);
    if (Number.isNaN(v)) return null;
    scores[d] = v;
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
      }))
    : [];
  // An unsupported claim is a facts problem whatever the judge scored it.
  if (unsupportedClaims.length > 0) scores.facts = Math.min(scores.facts, 4);
  return {
    scores,
    overall: overallScore(scores),
    unsupportedClaims,
    problems,
    rewriteBrief: typeof data.rewriteBrief === "string" ? data.rewriteBrief.trim() : "",
  };
}

export type QaDecision = "pass" | "polish" | "rewrite";

/** What happens next — decided from the scores, never from the judge's own opinion of its verdict. */
export function qaDecision(report: ScriptQaReport): QaDecision {
  const s = report.scores;
  const clean = report.unsupportedClaims.length === 0;
  if (clean && report.overall >= QA_PASS.overall && s.facts >= QA_PASS.facts && QA_DIMENSIONS.every((d) => s[d] >= QA_PASS.each)) {
    return "pass";
  }
  if (report.overall < QA_REWRITE_BELOW.overall || s.facts < QA_REWRITE_BELOW.facts || s.language < QA_REWRITE_BELOW.language
    || s.persuasion < QA_REWRITE_BELOW.persuasion || s.relevance < QA_REWRITE_BELOW.relevance) {
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
    out.push(`${where}${p.issue}${p.fix ? ` — ${p.fix}` : ""}`);
  }
  const weak = QA_DIMENSIONS.filter((d) => report.scores[d] < QA_PASS.each);
  if (weak.length > 0) out.push(`Scored weakest on: ${weak.map((d) => `${d} ${report.scores[d]}/10`).join(", ")}.`);
  return out;
}

/**
 * Is `b` a better draft than `a`? A draft with no invented facts always beats one with any; otherwise
 * the higher overall score wins, and a tie goes to the draft with fewer mechanical problems.
 */
export function isBetterDraft(
  a: { report: ScriptQaReport | null; mechanicalIssues: number },
  b: { report: ScriptQaReport | null; mechanicalIssues: number },
): boolean {
  if (!b.report) return false;
  if (!a.report) return true;
  const aClean = a.report.unsupportedClaims.length === 0;
  const bClean = b.report.unsupportedClaims.length === 0;
  if (aClean !== bClean) return bClean;
  if (b.report.overall !== a.report.overall) return b.report.overall > a.report.overall;
  return b.mechanicalIssues < a.mechanicalIssues;
}

/** What the kit shows about the script's check: its score, whether it passed, and how many drafts it took. */
export interface ScriptQaSummary {
  score: number;
  passed: boolean;
  drafts: number;
  /** The judge's scores for the draft that shipped. */
  scores: Record<QaDimension, number>;
  /** Up to three things the judge still wanted, when it did not pass. */
  notes: string[];
}

export function qaSummary(report: ScriptQaReport, drafts: number): ScriptQaSummary {
  return {
    score: report.overall,
    passed: qaDecision(report) === "pass",
    drafts,
    scores: report.scores,
    notes: qaDecision(report) === "pass" ? [] : qaInstructions(report).slice(0, 3),
  };
}
