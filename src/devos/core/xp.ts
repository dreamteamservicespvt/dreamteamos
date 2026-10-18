/**
 * XP — experience and engagement points (MSRS §11.5, FR-033, FR-034, FR-046).
 *
 * XP is NOT mastery: it never unlocks a rank (`ranks.ts` never reads it — AC-016). It rewards verified effort and
 * correct work, with anti-farming rules:
 *   • a daily cap on item XP (`dailyItemCap`);
 *   • items far below the person's level earn `lowDifficultyFactor` (default ½);
 *   • a failed answer earns at most a small, capped participation amount (and only if the policy allows it);
 *   • extra practice beyond `extraPracticeDailyItems` a day earns nothing (practice stays allowed — for learning);
 *   • system errors, expiries and answers still being validated earn nothing until they are valid.
 * Every award is an immutable ledger row whose id is its idempotency key (`xp_<source>`), so a replay never pays twice.
 */
import type { DevPolicy } from "./policy.js";
import type { Difficulty, Outcome, Purpose } from "./types.js";

export interface AttemptXpInput {
  open: boolean;
  difficulty: Difficulty;
  purpose: Purpose;
  outcome: Outcome;
  passed: boolean;
  hints: number;
  /** The person's adaptive level in that dimension when the item was served. */
  personLevel: Difficulty;
}

export interface XpDayState {
  itemXp: number;
  failXp: number;
  practiceItems: number;
}

export interface XpAward {
  amount: number;
  /** Plain words for the ledger and the toast: "Correct (hard item) +18". */
  reason: string;
  parts: string[];
}

export function factorOf(policy: DevPolicy, d: Difficulty): number {
  return policy.xp.difficultyFactor[d - 1] ?? 1;
}

/** XP for one scored attempt, given what the person already earned today. */
export function xpForAttempt(input: AttemptXpInput, day: XpDayState, policy: DevPolicy): XpAward {
  const x = policy.xp;
  const parts: string[] = [];
  if (input.outcome !== "passed" && input.outcome !== "failed" && input.outcome !== "partial") {
    return { amount: 0, reason: "No XP until the answer is valid", parts };
  }
  if (input.purpose === "practice" && day.practiceItems >= x.extraPracticeDailyItems) {
    return { amount: 0, reason: "Extra practice beyond today's limit (still counts for learning)", parts: ["practice_limit"] };
  }
  let amount: number;
  if (input.passed) {
    const base = input.open ? x.openPassed : x.correctBase;
    amount = x.answerValid + base * factorOf(policy, input.difficulty);
    parts.push(input.open ? "answer passed" : "correct");
    if (input.hints > 0) {
      amount *= Math.max(0.1, 1 - input.hints * policy.scoring.hintPenalty);
      parts.push(`${input.hints} hint${input.hints > 1 ? "s" : ""}`);
    }
    if (input.purpose === "retention") { amount += x.retentionPassed; parts.push("retention check"); }
    if (input.purpose === "transfer") { amount += x.transferPassed; parts.push("transfer check"); }
  } else {
    const room = Math.max(0, x.failParticipationDailyCap - day.failXp);
    amount = Math.min(x.failParticipation, room);
    parts.push("participation");
  }
  if (input.difficulty < input.personLevel - 1) {
    amount *= x.lowDifficultyFactor;
    parts.push("below your level");
  }
  const capped = Math.max(0, Math.min(Math.round(amount), x.dailyItemCap - day.itemXp));
  if (capped < Math.round(amount)) parts.push("daily cap");
  return { amount: capped, reason: describe(parts, capped), parts };
}

function describe(parts: string[], amount: number): string {
  const label = parts.length ? parts.join(" · ") : "answer";
  return `${label[0].toUpperCase()}${label.slice(1)} +${amount}`;
}

export function questXp(policy: DevPolicy, perfect: boolean): XpAward {
  const amount = policy.xp.questComplete + (perfect ? policy.xp.questPerfectBonus : 0);
  return { amount, reason: perfect ? `Daily quest — all correct +${amount}` : `Daily quest complete +${amount}`, parts: ["quest"] };
}

export function practicalXp(policy: DevPolicy, d: Difficulty): XpAward {
  const amount = Math.round(policy.xp.practicalPassed * factorOf(policy, d));
  return { amount, reason: `Practical challenge passed +${amount}`, parts: ["practical"] };
}

/** Streak milestone XP (3, 7, 14, 30 days by default) — only on the day the milestone is reached. */
export function streakXp(policy: DevPolicy, current: number): XpAward | null {
  const amount = policy.xp.streak[String(current)];
  return amount ? { amount, reason: `${current}-day streak +${amount}`, parts: ["streak"] } : null;
}
