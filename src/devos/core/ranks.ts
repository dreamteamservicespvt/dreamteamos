/**
 * Rank gates (FR-035 – FR-040, MSRS Appendix B, B.1 promotion invariants).
 *
 * A promotion needs EVERY gate of the next rank:
 *   assessment  — fresh rank assessments at the policy % (distinct, recent, spread over weeks for the top rank);
 *   dimensions  — every dimension measured, no dimension below the floor, the track's critical dimensions at their
 *                 minimum with enough confidence (a weighted total can never hide a weak critical skill — Appendix A.1);
 *   practical   — verified practical challenges at a difficulty and quality;
 *   transfer    — passed transfer checks in distinct dimensions (the skill used in a new context);
 *   retention   — passed delayed retention checks (fresh items, after a gap);
 *   evidence    — enough valid scored attempts (no promotion on a handful of answers);
 *   capstone    — the expert capstone + verified impact (Ultra Pro Max only).
 * XP is not an input (AC-016). Pending, disputed or low-confidence results never count (AC-012): they are not written
 * into the counters this reads. Pure — the engine records the promotion as a `RankEvent` with the policy version and
 * the evidence ids (FR-037), and a rank never drops (FR-040).
 */
import { DIMENSION_IDS, dimensionName } from "./dimensions.js";
import type { DevPolicy, RankGate } from "./policy.js";
import { rankLabel } from "./policy.js";
import type { Confidence, DevProfile, GateResult, RankEvaluation, RankLevel } from "./types.js";

const CONF_ORDER: Confidence[] = ["none", "low", "medium", "high"];
const confAtLeast = (c: Confidence, min: Confidence) => CONF_ORDER.indexOf(c) >= CONF_ORDER.indexOf(min);
const DAY_MS = 86_400_000;

export function evaluateRank(profile: DevProfile, policy: DevPolicy, now: number): RankEvaluation {
  const current = profile.rank.level;
  if (current >= 6) return { current, next: null, eligible: false, gates: [], policyVersion: policy.version };
  const next = (current + 1) as RankLevel;
  if (profile.onboarding.baseline !== "complete") {
    return {
      current, next, eligible: false, policyVersion: policy.version,
      gates: [{ id: "onboarding", label: "Baseline", passed: false, detail: "Finish your baseline across all ten dimensions.", todo: "Complete the baseline.", evidenceIds: [] }],
    };
  }
  const gate = policy.rankGates[next as 2 | 3 | 4 | 5 | 6];
  const gates = [
    assessmentGate(profile, gate, next, now),
    dimensionsGate(profile, policy, gate),
    practicalGate(profile, gate),
    transferGate(profile, gate),
    retentionGate(profile, gate),
    evidenceGate(profile, gate),
  ];
  if (gate.capstone) gates.push(capstoneGate(profile, gate));
  const relevant = gates.filter((g) => !(g.id === "transfer" && gate.transfersNeeded === 0) && !(g.id === "retention" && gate.retentionsNeeded === 0));
  return { current, next, eligible: relevant.every((g) => g.passed), gates: relevant, policyVersion: policy.version };
}

function assessmentGate(p: DevProfile, g: RankGate, level: RankLevel, now: number): GateResult {
  const since = now - g.assessmentWindowDays * DAY_MS;
  const good = p.gates.assessments
    .filter((a) => a.level === level && a.valid && a.score >= g.assessmentPct && a.at >= since)
    .sort((a, b) => a.at - b.at);
  let passed = good.length >= g.assessmentsNeeded;
  let spread = "";
  if (passed && g.sustainedWeeks > 0) {
    const span = (good[good.length - 1].at - good[0].at) / DAY_MS;
    passed = span >= g.sustainedWeeks * 7;
    spread = passed ? "" : ` — spread them over ${g.sustainedWeeks} weeks`;
  }
  const best = Math.max(0, ...p.gates.assessments.filter((a) => a.level === level && a.valid).map((a) => a.score));
  return {
    id: "assessment",
    label: "Fresh rank assessment",
    passed,
    detail: `${Math.min(good.length, g.assessmentsNeeded)} of ${g.assessmentsNeeded} fresh assessment${g.assessmentsNeeded > 1 ? "s" : ""} at ${g.assessmentPct}%+${best ? ` (best ${best}%)` : ""}${spread}`,
    todo: passed ? undefined : `Take the rank assessment and score ${g.assessmentPct}% or more.`,
    evidenceIds: good.map((a) => a.sessionId),
  };
}

function dimensionsGate(p: DevProfile, policy: DevPolicy, g: RankGate): GateResult {
  const missing = DIMENSION_IDS.filter((d) => p.dims[d].score === null);
  const below = DIMENSION_IDS.filter((d) => p.dims[d].score !== null && (p.dims[d].score as number) < g.floor);
  const critical = policy.criticalDims[p.track] ?? [];
  const critShort = critical.filter((d) => (p.dims[d].score ?? 0) < g.criticalMin || !confAtLeast(p.dims[d].confidence, g.minConfidence));
  const passed = !missing.length && !below.length && !critShort.length;
  const bits: string[] = [];
  if (missing.length) bits.push(`${missing.length} not measured yet`);
  if (below.length) bits.push(`${below.map(dimensionName).join(", ")} below ${g.floor}`);
  if (critShort.length) bits.push(`${critShort.map(dimensionName).join(", ")} need ${g.criticalMin}+ (${g.minConfidence} confidence)`);
  return {
    id: "dimensions",
    label: "Every dimension, critical ones strong",
    passed,
    detail: passed ? `All ten at ${g.floor}+; ${critical.map(dimensionName).join(", ")} at ${g.criticalMin}+` : bits.join("; "),
    // Each skill once — a weak critical skill is also "below" (the browser test read "Problem-Solving, Problem-Solving").
    todo: passed ? undefined : `Practise ${[...new Set([...missing, ...below, ...critShort])].slice(0, 3).map(dimensionName).join(", ")}.`,
    evidenceIds: [],
  };
}

function practicalGate(p: DevProfile, g: RankGate): GateResult {
  const ok = p.gates.practicals.filter((x) => x.difficulty >= g.practicalMinDifficulty && x.score >= g.practicalMinScore && x.kind !== "capstone");
  const passed = ok.length >= g.practicalsNeeded;
  return {
    id: "practical",
    label: "Practical challenges",
    passed,
    detail: `${Math.min(ok.length, g.practicalsNeeded)} of ${g.practicalsNeeded} at level ${g.practicalMinDifficulty}+ scoring ${g.practicalMinScore}%+`,
    todo: passed ? undefined : "Complete your weekly practical challenge well.",
    evidenceIds: ok.map((x) => x.taskId),
  };
}

function transferGate(p: DevProfile, g: RankGate): GateResult {
  const dims = [...new Set(p.gates.transfers.map((t) => t.dim))];
  const passed = dims.length >= g.transfersNeeded;
  return {
    id: "transfer",
    label: "Learning transfer",
    passed,
    detail: `${Math.min(dims.length, g.transfersNeeded)} of ${g.transfersNeeded} transfer checks passed (different dimensions)`,
    todo: passed ? undefined : "Pass the transfer checks in your daily quests (the same skill in a new situation).",
    evidenceIds: p.gates.transfers.map((t) => t.id),
  };
}

function retentionGate(p: DevProfile, g: RankGate): GateResult {
  const ok = p.gates.retentions.filter((r) => r.gapDays >= g.retentionMinGapDays);
  const passed = ok.length >= g.retentionsNeeded;
  return {
    id: "retention",
    label: "Retention over time",
    passed,
    detail: `${Math.min(ok.length, g.retentionsNeeded)} of ${g.retentionsNeeded} retention checks passed ${g.retentionMinGapDays}+ days later`,
    todo: passed ? undefined : "Retention checks arrive in your quests on their own — pass them when they come.",
    evidenceIds: ok.map((r) => r.id),
  };
}

function evidenceGate(p: DevProfile, g: RankGate): GateResult {
  const passed = p.gates.validAttempts >= g.minValidAttempts;
  return {
    id: "evidence",
    label: "Enough evidence",
    passed,
    detail: `${Math.min(p.gates.validAttempts, g.minValidAttempts)} of ${g.minValidAttempts} valid scored answers`,
    todo: passed ? undefined : `Answer ${g.minValidAttempts - p.gates.validAttempts} more items (daily quests count).`,
    evidenceIds: [],
  };
}

function capstoneGate(p: DevProfile, g: RankGate): GateResult {
  const c = p.gates.capstone;
  const passed = !!c && c.score >= g.practicalMinScore && c.impact;
  return {
    id: "capstone",
    label: "Expert capstone + verified impact",
    passed,
    detail: c ? `Capstone ${c.score}%${c.impact ? " · impact verified" : " · impact not verified yet"}` : "Not started",
    todo: passed ? undefined : "Complete the capstone with evidence of a real improvement.",
    evidenceIds: c ? [c.taskId] : [],
  };
}

/** May this person start a rank assessment now (evidence gate met, cooldown since the last one passed)? */
export function rankAssessmentOpen(p: DevProfile, policy: DevPolicy, now: number): { open: boolean; why: string; level: RankLevel | null } {
  if (p.rank.level >= 6) return { open: false, why: `You hold the top rank, ${rankLabel(policy, 6)}.`, level: null };
  const level = (p.rank.level + 1) as RankLevel;
  if (p.onboarding.baseline !== "complete") return { open: false, why: "Finish your baseline first.", level };
  const g = policy.rankGates[level as 2 | 3 | 4 | 5 | 6];
  // The assessment is the last step: it opens once the evidence gate is met, so it cannot be ground at from day one.
  if (p.gates.validAttempts < g.minValidAttempts) {
    return { open: false, why: `Answer ${g.minValidAttempts - p.gates.validAttempts} more items to unlock the ${rankLabel(policy, level)} assessment.`, level };
  }
  // …and only once every OTHER gate is passed: taken earlier, even 100% could not promote, and the cooldown would then
  // block the attempt that could (the browser test could start it with two skills below the floor).
  const other = evaluateRank(p, policy, now).gates.filter((x) => x.id !== "assessment" && !x.passed);
  if (other.length) {
    return { open: false, why: `The ${rankLabel(policy, level)} assessment opens once every other gate is passed — still to do: ${other.map((x) => x.label.toLowerCase()).join("; ")}.`, level };
  }
  const last = p.gates.assessments.filter((a) => a.level === level).sort((a, b) => b.at - a.at)[0];
  if (last && now - last.at < policy.rankAssessment.cooldownDays * DAY_MS) {
    const days = Math.ceil((policy.rankAssessment.cooldownDays * DAY_MS - (now - last.at)) / DAY_MS);
    return { open: false, why: `Your next ${rankLabel(policy, level)} assessment opens in ${days} day${days > 1 ? "s" : ""} (practise the gaps meanwhile).`, level };
  }
  return { open: true, why: `The ${rankLabel(policy, level)} assessment is open.`, level };
}
