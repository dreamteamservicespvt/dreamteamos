/**
 * The four leaderboards (FR-043, AC-029) — computed from season scores, with the formula published beside them.
 * Safe competition (FR-047): only a name (as the privacy setting allows) and the board's number are published; a
 * person who chose privacy appears as "A teammate"; nobody is listed below a minimum amount of evidence; there is no
 * "bottom" list — the app shows the top and the viewer's own neighbourhood.
 */
import type { DevPolicy } from "./policy.js";
import type { BoardEntry, BoardsDoc, SeasonScore, TeamEntry, TrackId } from "./types.js";
import type { SeasonInfo } from "./season.js";

export const BOARD_RULES = (p: DevPolicy): BoardsDoc["rules"] => ({
  mastery: `Mastery Champions: the season's difficulty-weighted performance — each valid answer counts its score at its level (a right answer at expert level is worth more than one at foundation level), weighted by how reliably it was graded. Needs at least ${p.privacy.minEligibleItems} answers this season. XP does not count.`,
  improved: "Most Improved: how much your role-weighted ten-dimension summary has grown since your first answer this season.",
  execution: `Execution Champions: daily quests done on time plus practical challenges passed on time (counted double), as a share of those assigned. Needs at least ${p.privacy.minExecutionAssigned} assigned this season.`,
  team: "Team Champions: each track's average Mastery score of its eligible members (70%) plus its team-mission points per member (30%).",
});

export function displayName(name: string, mode: DevPolicy["privacy"]["boardNames"], hidden: boolean): string {
  if (hidden) return "A teammate";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A teammate";
  if (mode === "full") return name.trim();
  if (mode === "first") return parts[0];
  return parts.map((w) => `${w[0].toUpperCase()}.`).join(" ");
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface BoardInput {
  score: SeasonScore;
  hidden: boolean;
  summary: number | null;
}

/** Board inputs straight from season scores (they carry the summary and privacy since every update). */
export const inputsFromScores = (scores: readonly SeasonScore[]): BoardInput[] =>
  scores.map((s) => ({ score: s, hidden: !!s.hidden, summary: s.summary ?? null }));

export function buildBoards(season: SeasonInfo, inputs: readonly BoardInput[], policy: DevPolicy, now: number, final: boolean): BoardsDoc {
  const rank = (rows: Omit<BoardEntry, "position">[]): BoardEntry[] => {
    const sorted = [...rows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const out: BoardEntry[] = [];
    sorted.forEach((r, i) => out.push({ ...r, position: i > 0 && sorted[i - 1].value === r.value ? out[i - 1].position : i + 1 }));
    return out;
  };
  const name = (x: BoardInput) => displayName(x.score.name, policy.privacy.boardNames, x.hidden);

  const mastery = rank(inputs.filter((x) => x.score.items >= policy.privacy.minEligibleItems && x.score.masteryDen > 0).map((x) => {
    const v = r1(x.score.masteryNum / x.score.masteryDen);
    return { uid: x.score.uid, name: name(x), track: x.score.track, value: v, label: `${v} / 100 · ${x.score.items} answers` };
  }));
  const improved = rank(inputs.filter((x) => x.score.startSummary !== null && x.summary !== null && x.score.items >= Math.ceil(policy.privacy.minEligibleItems * 0.8)).map((x) => {
    const v = r1((x.summary as number) - (x.score.startSummary as number));
    return { uid: x.score.uid, name: name(x), track: x.score.track, value: v, label: `${v >= 0 ? "+" : ""}${v} since the season began` };
  }));
  const execution = rank(inputs.filter((x) => x.score.questsAssigned + x.score.practicalAssigned >= policy.privacy.minExecutionAssigned).map((x) => {
    const done = x.score.questsOnTime + 2 * x.score.practicalOnTime;
    const due = x.score.questsAssigned + 2 * x.score.practicalAssigned;
    const v = due ? r1((done / due) * 100) : 0;
    return { uid: x.score.uid, name: name(x), track: x.score.track, value: v, label: `${v}% on time · ${x.score.questsOnTime}/${x.score.questsAssigned} quests` };
  }));

  const tracks: TrackId[] = ["sales", "technical", "admin"];
  const label: Record<TrackId, string> = { sales: "Sales", technical: "Technical", admin: "Admin & Operations" };
  const teams: TeamEntry[] = tracks.map((t) => {
    const members = inputs.filter((x) => x.score.track === t);
    const eligible = members.filter((x) => x.score.items >= policy.privacy.minEligibleItems && x.score.masteryDen > 0);
    const avgMastery = eligible.length ? eligible.reduce((a, x) => a + x.score.masteryNum / x.score.masteryDen, 0) / eligible.length : 0;
    const missionPer = members.length ? members.reduce((a, x) => a + x.score.missionPoints, 0) / members.length : 0;
    const value = r1(avgMastery * 0.7 + Math.min(100, missionPer * 10) * 0.3);
    return { team: t, label: label[t], value, members: members.length, position: 0, detail: `${eligible.length} eligible · mastery ${r1(avgMastery)} · missions ${r1(missionPer)} pts/person` };
  }).filter((t) => t.members > 0).sort((a, b) => b.value - a.value).map((t, i) => ({ ...t, position: i + 1 }));

  return {
    seasonId: season.id, start: season.start, end: season.end,
    boards: { mastery, improved, execution }, teams, rules: BOARD_RULES(policy), policyVersion: policy.version, builtAt: now, final,
  };
}

/** The viewer's neighbourhood on a board: the 3 above and 3 below them (research lesson 16). */
export function nearYou(entries: readonly BoardEntry[], uid: string, span = 3): BoardEntry[] {
  const i = entries.findIndex((e) => e.uid === uid);
  if (i < 0) return [];
  return entries.slice(Math.max(0, i - span), i + span + 1);
}
