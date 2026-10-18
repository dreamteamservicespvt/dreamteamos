/**
 * The AI Intelligence Director's deterministic core (MSRS §8.2 "Diagnose", "Choose next activity"; FR-021, FR-024,
 * FR-025, FR-026; the brief §4).
 *
 * The Director decides WHAT to practise next and WHY, from evidence only; the AI writes the content. Priority of a
 * dimension for a person (higher = sooner):
 *     3·weight + gap + 0.8·uncertainty + 0.3·spacing + 0.15·critical + 0.1·recent-struggle + 0.2·below-next-floor
 * weight = the track's Appendix-A weight; gap = how far the ability is from 100; uncertainty = how little evidence there
 * is (a dimension nobody has measured is a priority — evidence first); spacing = days since it was last practised (a
 * week = full); critical = the track's critical dimensions; struggle = the last answers failed; floor = the next
 * rank's floor. Every chosen slot carries a one-sentence reason a person can read (FR-021). No AI call here.
 */
import { DIMENSION_IDS, dimensionName, DIMENSION_BY_ID, TRACK_OBJECTIVES } from "./dimensions.js";
import { daysBetween, istDay } from "./days.js";
import { dueRetention } from "./mastery.js";
import type { DevPolicy } from "./policy.js";
import type { Confidence, Difficulty, DimensionId, DevProfile, ItemType, Purpose, RankLevel, SessionSlot, TrackId } from "./types.js";

const UNCERTAINTY: Record<Confidence, number> = { none: 1, low: 0.6, medium: 0.25, high: 0 };
const TRACKS: TrackId[] = ["sales", "technical", "admin"];

export interface Priority {
  dim: DimensionId;
  value: number;
  reason: string;
}

export function priorities(p: DevProfile, policy: DevPolicy, now: number): Priority[] {
  const day = istDay(now);
  const weights = policy.weights[p.track];
  const critical = new Set(policy.criticalDims[p.track] ?? []);
  const nextFloor = p.rank.level < 6 ? policy.rankGates[(p.rank.level + 1) as 2 | 3 | 4 | 5 | 6].floor : 0;
  return DIMENSION_IDS.map((d) => {
    const s = p.dims[d];
    const w = (weights[d] ?? 10) / 100;
    const score = s.score ?? 45;
    const gap = (100 - score) / 100;
    const unc = UNCERTAINTY[s.confidence];
    const idle = s.lastAt === null ? 7 : Math.max(0, daysBetween(istDay(s.lastAt), day));
    const spacing = Math.min(1, idle / 7);
    const crit = critical.has(d) ? 0.15 : 0;
    const struggle = s.run < 0 ? 0.1 : 0;
    const floor = s.score !== null && s.score < nextFloor ? 0.2 : 0;
    const value = 3 * w + gap + 0.8 * unc + 0.3 * spacing + crit + struggle + floor;
    const why: string[] = [];
    if (s.score === null) why.push("not measured yet — first evidence");
    else if (floor) why.push(`below the next rank's floor (${Math.round(score)} < ${nextFloor})`);
    else if (struggle) why.push("your last answers here missed");
    else if (gap > 0.4) why.push(`your biggest room to grow (${Math.round(score)})`);
    if (crit) why.push(`a critical skill for ${p.track === "admin" ? "Admin" : p.track === "sales" ? "Sales" : "Technical"} work`);
    if (s.score !== null && idle >= 5) why.push(`not practised for ${idle} days`);
    if (!why.length) why.push(`weighted ${weights[d]}% in your track`);
    return { dim: d, value: Math.round(value * 1000) / 1000, reason: `${dimensionName(d)}: ${why.join("; ")}.` };
  }).sort((a, b) => b.value - a.value);
}

/** Which item type a slot of this dimension asks for (open answers where the skill is written / spoken). */
export function typeFor(dim: DimensionId, wantOpen: boolean): ItemType | undefined {
  if (wantOpen && DIMENSION_BY_ID[dim].leansOpen) return "open";
  return undefined; // any objective form
}

function slot(dim: DimensionId, difficulty: Difficulty, purpose: Purpose, reason: string, extra: Partial<SessionSlot> = {}): SessionSlot {
  return { dim, difficulty, purpose, reason, state: "pending", ...extra };
}

/** The baseline: one item per dimension at difficulty 2, open answers for the three written skills (FR-004). */
export function baselineBlueprint(p: DevProfile): SessionSlot[] {
  return DIMENSION_IDS.map((d) =>
    slot(d, 2, "baseline", `Baseline — a first measurement of ${dimensionName(d)}.`, { type: DIMENSION_BY_ID[d].leansOpen ? "open" : undefined, trackOverride: p.track }),
  );
}

export interface QuestPlan {
  slots: SessionSlot[];
  focus: DimensionId[];
  reasons: string[];
  estMinutes: number;
}

/**
 * Today's quest: due retention checks first (fresh items, the level they were learned at), then the top priorities,
 * a transfer check when a dimension has earned one, and an interleaved stretch item — every slot a different
 * dimension, at most one open answer (keeps it 10–15 minutes, MSRS §20.3).
 */
export function questBlueprint(p: DevProfile, policy: DevPolicy, now: number, recentOpenDims: DimensionId[] = []): QuestPlan {
  const day = istDay(now);
  const n = Math.max(1, policy.cadence.questItems);
  const slots: SessionSlot[] = [];
  const used = new Set<DimensionId>();
  let openUsed = false;

  for (const r of dueRetention(p.dims, day)) {
    if (slots.length >= Math.min(n - 1, 2) || used.has(r.dim)) continue;
    used.add(r.dim);
    slots.push(slot(r.dim, r.level, "retention", `Retention check — do you still have ${dimensionName(r.dim)} at level ${r.level} (learned earlier, due ${r.due})?`));
  }

  const ranked = priorities(p, policy, now);
  const transferDim = transferCandidate(p, policy);
  for (const pr of ranked) {
    if (slots.length >= n) break;
    if (used.has(pr.dim)) continue;
    const s = p.dims[pr.dim];
    if (transferDim === pr.dim && !slots.some((x) => x.purpose === "transfer")) {
      used.add(pr.dim);
      const settings = [...new Set(s.recent.slice(-6).map((r) => r.g))];
      const other = TRACKS.filter((t) => t !== p.track);
      slots.push(slot(pr.dim, Math.max(1, s.level - 1) as Difficulty, "transfer",
        `Transfer check — use ${dimensionName(pr.dim)} in a situation you have not practised.`,
        { avoidSettings: settings, trackOverride: s.n % 2 === 0 ? other[s.n % other.length] : undefined }));
      continue;
    }
    const wantOpen = !openUsed && DIMENSION_BY_ID[pr.dim].leansOpen && !recentOpenDims.includes(pr.dim);
    const type = typeFor(pr.dim, wantOpen);
    if (type === "open") openUsed = true;
    used.add(pr.dim);
    slots.push(slot(pr.dim, s.level, "quest", pr.reason, { type }));
  }

  // Interleave: swap the last slot for a stretch item in a strong dimension once in a while (every 3rd day).
  const strong = DIMENSION_IDS.filter((d) => !used.has(d) && (p.dims[d].score ?? 0) >= 70 && p.dims[d].level < 5);
  if (strong.length && slots.length >= 3 && Number(day.slice(-2)) % 3 === 0) {
    const d = strong[0];
    slots[slots.length - 1] = slot(d, Math.min(5, p.dims[d].level + 1) as Difficulty, "quest",
      `Stretch — ${dimensionName(d)} is a strength; one level harder keeps it growing.`);
  }
  const focus = ranked.slice(0, 2).map((r) => r.dim);
  return {
    slots,
    focus,
    reasons: ranked.slice(0, 2).map((r) => r.reason),
    estMinutes: slots.reduce((m, s) => m + (s.type === "open" ? 5 : 3), 0),
  };
}

/**
 * A dimension that has earned a transfer check: the last `transferEvery` evidence items passed (score ≥ 70) and no
 * transfer check in the last two weeks for it.
 */
export function transferCandidate(p: DevProfile, policy: DevPolicy): DimensionId | null {
  const every = Math.max(2, policy.cadence.transferEvery);
  const twoWeeks = 14 * 86_400_000;
  const latest = Math.max(0, ...DIMENSION_IDS.map((d) => p.dims[d].lastAt ?? 0));
  for (const d of DIMENSION_IDS) {
    const r = p.dims[d].recent;
    if (r.length < every) continue;
    const tail = r.slice(-every);
    if (!tail.every((x) => x.s >= 70)) continue;
    if (tail.some((x) => x.k === "transfer")) continue;
    if (p.gates.transfers.some((t) => t.dim === d && latest - t.at < twoWeeks)) continue;
    return d;
  }
  return null;
}

/**
 * The fresh retry after a miss (FR-022, AC-013): the same dimension and — when it was a template — the same kind of
 * reasoning (family) the coach just explained, one level easier, in a situation the person has not seen.
 */
export function remediationSlot(dim: DimensionId, difficulty: Difficulty, setting: string, family: string): SessionSlot {
  return slot(dim, Math.max(1, difficulty - 1) as Difficulty, "remediation",
    `A fresh try at ${dimensionName(dim)} — a new situation, one step easier, after the method was explained.`,
    { avoidSettings: [setting], family: family && family !== "ai" ? family : undefined });
}

/** Extra practice (on request): the top priority, or a dimension the person picked. */
export function practiceBlueprint(p: DevProfile, policy: DevPolicy, now: number, dim?: DimensionId): SessionSlot[] {
  const d = dim ?? priorities(p, policy, now)[0].dim;
  return [slot(d, p.dims[d].level, "practice", dim ? `Practice you chose: ${dimensionName(d)}.` : priorities(p, policy, now)[0].reason)];
}

const RANK_DIFFICULTY: Record<RankLevel, Difficulty> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 5 };

/** A rank assessment: fresh items at the target rank's difficulty, the critical dimensions twice (Appendix B). */
export function rankBlueprint(p: DevProfile, policy: DevPolicy, level: RankLevel): SessionSlot[] {
  const crit = policy.criticalDims[p.track] ?? [];
  const d = RANK_DIFFICULTY[level];
  // Every one of the ten skills once, critical ones first; only an assessment longer than ten repeats the critical
  // ones. (Doubling them first left a 10-item Technical assessment without Communication, Emotional Intelligence and
  // Execution — and with one open item where the policy asks for two; found in the browser test.)
  const order: DimensionId[] = [...crit, ...DIMENSION_IDS.filter((x) => !crit.includes(x)), ...crit, ...crit];
  const total = Math.max(4, policy.rankAssessment.items);
  const chosen = order.slice(0, total);
  let open = Math.max(0, policy.rankAssessment.openItems);
  return chosen.map((dim, i) => {
    const wantOpen = open > 0 && DIMENSION_BY_ID[dim].leansOpen && !chosen.slice(0, i).includes(dim);
    if (wantOpen) open--;
    return slot(dim, i % 3 === 2 && d < 5 ? ((d + 1) as Difficulty) : d, "rank",
      `Rank assessment — ${dimensionName(dim)} at the level ${level} needs.`, { type: wantOpen ? "open" : undefined });
  });
}

/** The objective of a slot, in the person's track words (what the AI generator is asked to target). */
export function objectiveFor(track: TrackId, dim: DimensionId): string {
  return TRACK_OBJECTIVES[track][dim];
}
