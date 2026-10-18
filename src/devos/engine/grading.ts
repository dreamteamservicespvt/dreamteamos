/**
 * Grading open answers against a stored rubric (FR-017 – FR-019, MSRS §8.3, §13.2).
 *
 * judge 1 → checked (schema, every criterion, quotes that must exist in the answer) → reconcile:
 *   final | a second, independent judge (high-impact purpose, low confidence, near the pass mark, injection suspected)
 *   → agree within tolerance: final (the mean) | disagree: an adjudicator (judge 3) → final | `pending_validation`.
 * A judge whose output fails a check is asked once more; at most 5 judge calls per answer (FR-027). With no AI at all
 * the answer stays pending (saved, never invented) and the tick grades it later. An empty answer is scored 0 in code.
 */
import { checkJudgeOutput, injectionSuspected, openScoring, reconcileJudges } from "../core/scoring.js";
import type { DevPolicy } from "../core/policy.js";
import type { AiCallLog, Feedback, JudgeVerdict, Purpose, Rubric, Scoring } from "../core/types.js";
import type { Deps } from "./context.js";

export interface GradeInput {
  scenario: string;
  question: string;
  rubric: Rubric;
  exemplar?: string;
  answer: string;
  purpose: Purpose;
}

export interface GradeResult {
  scoring: Scoring | null;
  /** Discarded verdicts and their reasons (kept for the audit trail). */
  rejected: { judge: number; reason: string }[];
  calls: AiCallLog[];
  reason?: string;
}

export const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

export async function gradeOpen(deps: Deps, policy: DevPolicy, input: GradeInput): Promise<GradeResult> {
  const now = deps.now();
  const codes: string[] = [];
  const calls: AiCallLog[] = [];
  const rejected: { judge: number; reason: string }[] = [];
  const words = wordCount(input.answer);
  if (words < 5) {
    const criteria = input.rubric.criteria.map((c) => ({ id: c.id, label: c.label, weight: c.weight, score: 0, note: "No answer to grade." }));
    return {
      scoring: { method: "deterministic", score: 0, passed: false, criteria, confidence: "high", codes: ["empty_answer"], at: now },
      rejected, calls,
    };
  }
  let answer = input.answer;
  const limit = (input.rubric.maxWords ?? 150) * 2;
  if (words > limit) {
    answer = (answer.match(/\S+/g) ?? []).slice(0, limit).join(" ");
    codes.push("over_length");
  }
  const injection = injectionSuspected(answer);
  if (injection) codes.push("injection_suspected");
  if (!deps.ai) return { scoring: null, rejected, calls, reason: "ai_unavailable" };

  const verdicts: JudgeVerdict[] = [];
  const rules = {
    requireSecond: injection || policy.scoring.secondJudgeFor.includes(input.purpose),
    passMark: input.rubric.passMark,
    lowConfidence: policy.scoring.lowConfidence,
    nearThreshold: policy.scoring.nearThreshold,
    tolerance: policy.scoring.disagreementTolerance,
  };
  let budget = 5;
  const ask = async (judge: 1 | 2 | 3): Promise<JudgeVerdict | null> => {
    for (let tryNo = 0; tryNo < 2 && budget > 0; tryNo++) {
      budget--;
      const res = await deps.ai!.judge({
        scenario: input.scenario, question: input.question, rubric: input.rubric, exemplar: input.exemplar, answer, judge,
        earlier: judge === 3 ? verdicts.map((v) => v.score) : undefined,
      });
      calls.push(...res.calls);
      if (res.value === null) {
        rejected.push({ judge, reason: res.error ?? "no answer from the model" });
        continue;
      }
      const check = checkJudgeOutput(res.value, input.rubric, answer, res.model, deps.now());
      if (check.verdict) {
        if (check.fabricated && !codes.includes("evidence_unverified")) codes.push("evidence_unverified");
        if (check.assumedConfidence && !codes.includes("confidence_assumed")) codes.push("confidence_assumed");
        return check.verdict;
      }
      rejected.push({ judge, reason: check.problems.join("; ") });
    }
    return null;
  };

  let rec = reconcileJudges([], rules);
  const first = await ask(1);
  if (!first) return { scoring: null, rejected, calls, reason: "judge_failed" };
  verdicts.push(first);
  rec = reconcileJudges(verdicts, rules);
  if (rec.state === "need_second") {
    const second = await ask(2);
    if (second) {
      verdicts.push(second);
      rec = reconcileJudges(verdicts, rules);
    } else if (!rules.requireSecond) {
      // The second judge was only a precaution — the first verdict stands, marked as single-judged.
      rec = { state: "final", score: first.score, criteria: first.criteria, confidence: "low" };
      codes.push("single_judge");
    } else {
      return { scoring: null, rejected, calls, reason: "second_judge_failed" };
    }
  }
  if (rec.state === "need_adjudication") {
    const third = await ask(3);
    if (third) {
      verdicts.push(third);
      rec = reconcileJudges(verdicts, rules);
    } else rec = { state: "pending", disagreement: rec.disagreement };
  }
  if (rec.state !== "final") {
    codes.push("judges_disagree");
    return { scoring: null, rejected, calls, reason: "judges_disagree" };
  }
  if (injection && rec.confidence === "high") rec.confidence = "medium";
  return { scoring: openScoring(input.rubric, rec, verdicts, codes, now), rejected, calls };
}

/** The coach's feedback for a graded open answer: what was missing, said as what good looks like (FR-022). */
export function openFeedback(rubric: Rubric, scoring: Scoring, explanation: string): Feedback {
  const crit = scoring.criteria ?? [];
  const weak = crit.filter((c) => c.score <= 2).sort((a, b) => a.score - b.score || b.weight - a.weight);
  const gaps = scoring.judges?.flatMap((j) => j.gaps).filter(Boolean) ?? [];
  const steps = weak.slice(0, 3).map((c) => {
    const def = rubric.criteria.find((x) => x.id === c.id);
    return `${c.label}: ${def ? def.anchors[4] : "aim for the top level"}.`;
  });
  // Criterion names are quoted as written: lower-cased they read as broken English ("strong on correct and fits the
  // reader", found in the browser test).
  const quote = (label: string) => `“${label}”`;
  const strong = crit.filter((c) => c.score >= 3).map((c) => quote(c.label));
  return {
    headline: scoring.passed
      ? `Passed with ${scoring.score}%${strong.length ? ` — strong on ${strong.slice(0, 2).join(" and ")}` : ""}.`
      : `${scoring.score}% — not yet at the ${rubric.passMark}% this needs${weak[0] ? `; start with ${quote(weak[0].label)}` : ""}.`,
    steps: steps.length ? steps : gaps.slice(0, 3),
    explanation,
    gap: weak.some((c) => /evidence|fact|assum/i.test(c.id)) ? "evidence" : weak.some((c) => /next|step|verify|order/i.test(c.id)) ? "incomplete" : weak.length ? "communication" : "none",
  };
}
