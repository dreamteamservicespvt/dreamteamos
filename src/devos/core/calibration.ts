/**
 * Question calibration (FR-013, MSRS §13.1 — "flag poor items for automatic quarantine").
 *
 * Items here are single-use: a template instance is generated for one person, an AI item is served to one person by
 * default — so one item never collects enough answers to judge it. What does collect them is the PATTERN an item comes
 * from: a template family + form at a difficulty, or the AI pool's track + dimension at a difficulty. Every scored
 * answer adds to its pattern's counters (`engine/calibration`); once a day a pattern with enough answers is judged:
 * almost nobody passing it at its level means it is misleading, broken or mis-levelled; almost everybody passing a
 * hard one means it is too easy or gives its answer away. A flagged pattern is not served for `FLAG_DAYS`, then comes
 * back with fresh counters and is measured again — no admin has to clear it (MSRS §8.1, zero routine involvement).
 * The adaptive engine aims at ~70 % success, so honest patterns sit well inside these bounds.
 */

export const CALIBRATION_MIN_ANSWERS = 20;
export const CALIBRATION_FLAG_DAYS = 14;
/** Below this pass rate a pattern is flagged at any level. */
export const CALIBRATION_FLOOR = 0.15;
/** Above this pass rate a pattern at difficulty 3+ is flagged. */
export const CALIBRATION_CEILING = 0.97;

export interface PatternSource {
  source: "template" | "ai";
  family: string;
  form: string;
  track: string;
  dim: string;
  difficulty: number;
}

/** The pattern an item comes from (also its document id in `devos_calibration` — no "/" in it). */
export function patternKeyOf(q: PatternSource): string {
  return q.source === "ai" ? `ai~${q.track}.${q.dim}~d${q.difficulty}` : `${q.family}~${q.form}~d${q.difficulty}`;
}

export interface PatternStats {
  n: number;
  correct: number;
  difficulty: number;
}

/** Why a pattern should be withdrawn for now, or null when it looks sound (or has too few answers to tell). */
export function judgePattern(s: PatternStats): string | null {
  if (s.n < CALIBRATION_MIN_ANSWERS) return null;
  const rate = s.correct / s.n;
  const pct = Math.round(rate * 100);
  if (rate < CALIBRATION_FLOOR) return `Only ${pct}% of ${s.n} answers passed at level ${s.difficulty} — likely misleading, broken or set too hard.`;
  if (s.difficulty >= 3 && rate > CALIBRATION_CEILING) return `${pct}% of ${s.n} answers passed at level ${s.difficulty} — too easy for its level, or it gives the answer away.`;
  return null;
}
