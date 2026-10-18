/**
 * The admin snapshot and the AI management report (FR-050, FR-053, AC-024).
 *
 * The snapshot is built from the profile summaries (one read per person, at most hourly — not from every attempt), so
 * the Control Center opens with ONE document read. The report's facts are computed in code; the AI only words them,
 * every claim must cite fact ids, and a claim whose numbers are not in the facts it cites is marked a hypothesis.
 */
import { addDays, istDay } from "../core/days.js";
import { DIMENSION_IDS, dimensionName } from "../core/dimensions.js";
import { rankLabel, type DevPolicy } from "../core/policy.js";
import type { DevProfile, DevReport, DimensionId, HealthDoc, ReportClaim, ReportFact, TrackId } from "../core/types.js";
import { PATH, type Deps } from "./context.js";
import type { Doc } from "./store.js";

export interface PersonRow {
  uid: string;
  name: string;
  role: string;
  track: TrackId;
  status: DevProfile["status"];
  baseline: DevProfile["onboarding"]["baseline"];
  rank: number;
  rankLabel: string;
  xp: number;
  summary: number | null;
  weakest: { dim: DimensionId; score: number } | null;
  strongest: { dim: DimensionId; score: number } | null;
  measured: number;
  confident: number;
  streak: number;
  lastActiveAt: number | null;
  questToday: "done" | "open" | "none";
  pending: number;
  flags: string[];
}

export interface Snapshot {
  builtAt: number;
  policyVersion: string;
  mode: string;
  people: PersonRow[];
  counts: { profiles: number; active: number; baselineDone: number; active7d: number; byTrack: Record<TrackId, number>; byRank: number[] };
  quests: { today: { assigned: number; done: number }; week: { assigned: number; done: number } };
  outcomes: { attempts: number; passed: number; failed: number; expired: number; systemErrors: number; pending: number };
  dims: Record<TrackId, Record<DimensionId, { avg: number | null; baselineAvg: number | null; n: number }>>;
  effectiveness: { remediationTried: number; remediationPassed: number; retentionTried: number; retentionPassed: number; transferTried: number; transferPassed: number };
  /** What the pool should hold next (the tick fills these): the focus dimensions at each learner's level. */
  targets: { track: TrackId; dim: DimensionId; difficulty: number; kind: "objective" | "open"; demand: number }[];
  health: HealthDoc | null;
  /** Set when built for a department admin: the only tracks it covers (every number in it is theirs alone). */
  scope?: TrackId[];
}

const TRACKS: TrackId[] = ["sales", "technical", "admin"];

export function buildSnapshot(profiles: DevProfile[], policy: DevPolicy, health: HealthDoc | null, now: number): Snapshot {
  const day = istDay(now);
  const weekAgo = addDays(day, -6);
  const people: PersonRow[] = profiles.map((p) => {
    const measured = DIMENSION_IDS.filter((d) => p.dims[d].score !== null);
    const scored = measured.map((d) => ({ dim: d, score: Math.round(p.dims[d].score as number) })).sort((a, b) => a.score - b.score);
    const today = p.days.find((x) => x.day === day);
    const questDone = today?.questDone ?? 0;
    const flags: string[] = [];
    if (p.integrity?.length) flags.push("integrity");
    if (p.stats.pending > 0) flags.push("pending grading");
    if (p.onboarding.baseline !== "complete") flags.push(p.onboarding.baseline === "in_progress" ? "baseline in progress" : "not started");
    const floor = policy.rankGates[Math.min(6, p.rank.level + 1) as 2 | 3 | 4 | 5 | 6]?.floor ?? 0;
    if (scored.some((s) => s.score < floor)) flags.push("below next floor");
    return {
      uid: p.uid, name: p.name, role: p.role, track: p.track, status: p.status, baseline: p.onboarding.baseline, rank: p.rank.level,
      rankLabel: rankLabel(policy, p.rank.level), xp: p.xp.total, summary: p.summary, weakest: scored[0] ?? null, strongest: scored[scored.length - 1] ?? null,
      measured: measured.length, confident: DIMENSION_IDS.filter((d) => ["medium", "high"].includes(p.dims[d].confidence)).length,
      streak: p.streak.current, lastActiveAt: p.lastActiveAt, questToday: today ? (questDone > 0 ? "done" : today.assigned > 0 ? "open" : "none") : "none",
      pending: p.stats.pending, flags,
    };
  });
  const sum = (f: (p: DevProfile) => number) => profiles.reduce((a, p) => a + f(p), 0);
  const dims = {} as Snapshot["dims"];
  for (const t of TRACKS) {
    dims[t] = {} as Snapshot["dims"][TrackId];
    const ps = profiles.filter((p) => p.track === t && p.onboarding.baseline === "complete");
    for (const d of DIMENSION_IDS) {
      const vals = ps.map((p) => p.dims[d].score).filter((x): x is number => x !== null);
      const base = ps.map((p) => p.dims[d].baseline).filter((x): x is number => x !== null);
      dims[t][d] = { avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, baselineAvg: base.length ? Math.round(base.reduce((a, b) => a + b, 0) / base.length) : null, n: vals.length };
    }
  }
  const demand = new Map<string, { track: TrackId; dim: DimensionId; difficulty: number; kind: "objective" | "open"; demand: number }>();
  for (const p of profiles.filter((x) => x.status === "active")) {
    for (const d of p.plan.focus.length ? p.plan.focus : DIMENSION_IDS.slice(0, 2)) {
      const kind = ["creativity", "communication", "emotional"].includes(d) ? "open" : "objective";
      const k = `${p.track}|${d}|${p.dims[d].level}|${kind}`;
      const cur = demand.get(k) ?? { track: p.track, dim: d, difficulty: p.dims[d].level, kind, demand: 0 };
      cur.demand++;
      demand.set(k, cur);
    }
  }
  const days = (p: DevProfile) => p.days.filter((x) => x.day >= weekAgo);
  return {
    builtAt: now, policyVersion: policy.version, mode: policy.mode, people,
    counts: {
      profiles: profiles.length, active: profiles.filter((p) => p.status === "active").length,
      baselineDone: profiles.filter((p) => p.onboarding.baseline === "complete").length,
      active7d: profiles.filter((p) => p.lastActiveAt !== null && now - (p.lastActiveAt as number) < 7 * 86_400_000).length,
      byTrack: Object.fromEntries(TRACKS.map((t) => [t, profiles.filter((p) => p.track === t).length])) as Record<TrackId, number>,
      byRank: [1, 2, 3, 4, 5, 6].map((r) => profiles.filter((p) => p.rank.level === r && p.onboarding.baseline === "complete").length),
    },
    // Daily quests only: assigned (written when a quest is made) against quests finished — not every finished task.
    quests: {
      today: { assigned: sum((p) => p.days.find((x) => x.day === day)?.assigned ?? 0), done: sum((p) => p.days.find((x) => x.day === day)?.questDone ?? 0) },
      week: { assigned: sum((p) => days(p).reduce((a, x) => a + (x.assigned ?? 0), 0)), done: sum((p) => days(p).reduce((a, x) => a + (x.questDone ?? 0), 0)) },
    },
    outcomes: { attempts: sum((p) => p.stats.attempts), passed: sum((p) => p.stats.passed), failed: sum((p) => p.stats.failed), expired: sum((p) => p.stats.expired), systemErrors: sum((p) => p.stats.systemErrors), pending: sum((p) => p.stats.pending) },
    dims,
    effectiveness: {
      remediationTried: sum((p) => p.stats.remediationTried), remediationPassed: sum((p) => p.stats.remediationPassed),
      retentionTried: sum((p) => p.stats.retentionTried), retentionPassed: sum((p) => p.stats.retentionPassed),
      transferTried: sum((p) => p.stats.transferTried), transferPassed: sum((p) => p.stats.transferPassed),
    },
    targets: [...demand.values()].sort((a, b) => b.demand - a.demand).slice(0, 30),
    health,
  };
}

export async function readAllProfiles(deps: Deps): Promise<DevProfile[]> {
  const rows = await deps.store.query("devos_users");
  return rows.map((r) => r.data as unknown as DevProfile).filter((p) => p && p.uid && p.dims);
}

export async function rebuildSnapshot(deps: Deps, policy: DevPolicy): Promise<Snapshot> {
  const [profiles, health] = await Promise.all([readAllProfiles(deps), deps.store.get(PATH.health) as unknown as Promise<HealthDoc | null>]);
  const snap = buildSnapshot(profiles, policy, health, deps.now());
  await deps.store.set(PATH.snapshot, snap as unknown as Doc);
  return snap;
}

// ── The report ──────────────────────────────────────────────────────────────────────────────────

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function reportFacts(s: Snapshot): ReportFact[] {
  const f: ReportFact[] = [];
  f.push({ id: "f1", text: `${s.counts.baselineDone} of ${s.counts.profiles} people have finished their baseline; ${s.counts.active7d} were active in the last 7 days.`, value: s.counts.baselineDone });
  f.push({ id: "f2", text: `This week ${s.quests.week.done} of ${s.quests.week.assigned} daily quests were completed (${pct(s.quests.week.done, s.quests.week.assigned)}%).`, value: pct(s.quests.week.done, s.quests.week.assigned) });
  let n = 3;
  for (const t of TRACKS) {
    const cells = DIMENSION_IDS.map((d) => ({ d, ...s.dims[t][d] })).filter((c) => c.avg !== null);
    if (!cells.length) continue;
    const weakest = [...cells].sort((a, b) => (a.avg as number) - (b.avg as number))[0];
    const grown = cells.filter((c) => c.baselineAvg !== null).map((c) => ({ ...c, gain: (c.avg as number) - (c.baselineAvg as number) })).sort((a, b) => b.gain - a.gain)[0];
    f.push({ id: `f${n++}`, text: `${t === "admin" ? "Admin" : t[0].toUpperCase() + t.slice(1)} track: the weakest dimension on average is ${dimensionName(weakest.d)} (${weakest.avg}).`, value: weakest.avg as number });
    if (grown && grown.gain > 0) f.push({ id: `f${n++}`, text: `${t === "admin" ? "Admin" : t[0].toUpperCase() + t.slice(1)} track: ${dimensionName(grown.d)} grew the most since the baseline (+${grown.gain}).`, value: grown.gain });
  }
  const e = s.effectiveness;
  if (e.remediationTried) f.push({ id: `f${n++}`, text: `${e.remediationPassed} of ${e.remediationTried} fresh retries after a miss were passed (${pct(e.remediationPassed, e.remediationTried)}%).`, value: pct(e.remediationPassed, e.remediationTried) });
  if (e.retentionTried) f.push({ id: `f${n++}`, text: `${e.retentionPassed} of ${e.retentionTried} retention checks were passed (${pct(e.retentionPassed, e.retentionTried)}%).`, value: pct(e.retentionPassed, e.retentionTried) });
  if (s.outcomes.pending) f.push({ id: `f${n++}`, text: `${s.outcomes.pending} written answers are waiting for grading.`, value: s.outcomes.pending });
  if (s.outcomes.systemErrors) f.push({ id: `f${n++}`, text: `${s.outcomes.systemErrors} answers were platform faults and did not count against anyone.`, value: s.outcomes.systemErrors });
  const ai = s.health?.ai;
  if (ai && ai.calls) f.push({ id: `f${n++}`, text: `AI calls today: ${ai.calls} (${ai.failures} failed).`, value: ai.calls });
  const notStarted = s.people.filter((p) => p.baseline === "not_started").length;
  if (notStarted) f.push({ id: `f${n++}`, text: `${notStarted} people have not started yet.`, value: notStarted });
  return f;
}

/** Keep a claim only if every cited fact exists; mark it a hypothesis if a number in it is not in its cited facts. */
export function verifyClaims(claims: { text: string; facts: string[]; kind?: string }[], facts: ReportFact[]): ReportClaim[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  return claims.filter((c) => c.facts.length && c.facts.every((id) => byId.has(id))).map((c) => {
    const cited = c.facts.map((id) => byId.get(id)!.text).join(" ");
    const numbers = c.text.match(/\d+(?:\.\d+)?/g) ?? [];
    const consistent = numbers.every((num) => cited.includes(num));
    return { text: c.text, facts: c.facts, kind: c.kind === "hypothesis" || !consistent ? "hypothesis" : "fact" };
  });
}

function ruleActions(s: Snapshot): string[] {
  const out: string[] = [];
  const notStarted = s.people.filter((p) => p.baseline === "not_started").length;
  if (notStarted) out.push(`Ask the ${notStarted} people who have not started to take their 20-minute baseline.`);
  if (s.quests.week.assigned && s.quests.week.done / s.quests.week.assigned < 0.6) out.push("Quest completion is under 60% — ask team leaders to protect 10 minutes a day for it.");
  if (s.outcomes.pending) out.push("Some written answers are waiting for grading — check the AI status in Automation.");
  if (!out.length) out.push("Keep the daily quests going; review each person's weakest dimension in their one-to-one.");
  return out.slice(0, 4);
}

export async function generateReport(deps: Deps, policy: DevPolicy, snap: Snapshot, scope = "company"): Promise<DevReport> {
  const now = deps.now();
  const day = istDay(now);
  const facts = reportFacts(snap);
  let claims: ReportClaim[] = facts.slice(0, 6).map((f) => ({ text: f.text, facts: [f.id], kind: "fact" }));
  let nextActions = ruleActions(snap);
  let generator: DevReport["generator"] = "template";
  let model: string | undefined;
  if (deps.ai && policy.ai.enabled && facts.length >= 2) {
    const r = await deps.ai.report({ scope, facts: facts.map((f) => ({ id: f.id, text: f.text })) });
    if (r.value) {
      const verified = verifyClaims(r.value.claims, facts);
      if (verified.length >= 2) {
        claims = verified;
        nextActions = r.value.nextActions.length ? r.value.nextActions : nextActions;
        generator = "ai";
        model = r.model;
      }
    }
  }
  const report: DevReport = { id: `${day}_${scope}`, scope, period: { from: addDays(day, -6), to: day }, facts, claims, nextActions, generator, model, generatedAt: now };
  await deps.store.set(PATH.report(report.id), report as unknown as Doc);
  return report;
}
