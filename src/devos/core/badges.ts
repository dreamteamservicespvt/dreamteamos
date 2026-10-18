/**
 * Achievements (FR-038): permanent once earned — a season reset, a later failure or a policy change never removes one.
 * Each is earned from stored counters, so it can be re-checked from the ledgers.
 */
import { DIMENSION_IDS, DIMENSION_BY_ID } from "./dimensions.js";
import type { DevProfile, DimensionId } from "./types.js";

export interface BadgeDef {
  id: string;
  title: string;
  detail: string;
  /** Lucide icon name the UI shows. */
  icon: string;
  earned(p: DevProfile): boolean;
}

const stat = (p: DevProfile, k: string) => ((p.stats as Record<string, number>)[k] ?? 0);

const SPECIALISTS: BadgeDef[] = DIMENSION_IDS.map((d: DimensionId) => ({
  id: `specialist_${d}`,
  title: `${DIMENSION_BY_ID[d].short} specialist`,
  detail: `${DIMENSION_BY_ID[d].name} at 85+ with high confidence.`,
  icon: "Gem",
  earned: (p: DevProfile) => (p.dims[d]?.score ?? 0) >= 85 && p.dims[d]?.confidence === "high",
}));

export const BADGES: readonly BadgeDef[] = [
  { id: "first_steps", title: "First steps", detail: "Completed the baseline across all ten dimensions.", icon: "Footprints", earned: (p) => p.onboarding.baseline === "complete" },
  { id: "first_quest", title: "Quest starter", detail: "Completed a first daily quest.", icon: "Flag", earned: (p) => stat(p, "questsDone") >= 1 },
  { id: "streak_7", title: "One-week streak", detail: "Daily quests on 7 working days in a row.", icon: "Flame", earned: (p) => p.streak.best >= 7 },
  { id: "streak_30", title: "Thirty-day streak", detail: "Daily quests on 30 working days in a row.", icon: "Flame", earned: (p) => p.streak.best >= 30 },
  { id: "comeback", title: "Comeback", detail: "Passed a fresh retry after missing the first one.", icon: "RotateCcw", earned: (p) => p.stats.remediationPassed >= 1 },
  { id: "deep_thinker", title: "Deep thinker", detail: "Answered 5 expert-level items correctly.", icon: "Brain", earned: (p) => stat(p, "hardCorrect") >= 5 },
  { id: "retention_5", title: "It stuck", detail: "Passed 5 retention checks — learning that lasted.", icon: "Anchor", earned: (p) => p.stats.retentionPassed >= 5 },
  { id: "transfer_3", title: "Transfer", detail: "Used 3 skills well in situations never practised.", icon: "Shuffle", earned: (p) => p.stats.transferPassed >= 3 },
  { id: "all_rounder", title: "All-rounder", detail: "Every dimension at 60 or more.", icon: "Hexagon", earned: (p) => DIMENSION_IDS.every((d) => (p.dims[d]?.score ?? 0) >= 60) },
  { id: "practical_pro", title: "Practical pro", detail: "Passed 3 practical challenges.", icon: "Wrench", earned: (p) => stat(p, "practicalPassed") >= 3 },
  { id: "team_player", title: "Team player", detail: "Delivered a verified part of a team mission.", icon: "Users", earned: (p) => stat(p, "missionParts") >= 1 },
  { id: "league_podium", title: "Podium", detail: "Finished in the top 3 of a weekly league.", icon: "Medal", earned: (p) => stat(p, "leaguePodiums") >= 1 },
  ...SPECIALISTS,
];

export const BADGE_BY_ID: ReadonlyMap<string, BadgeDef> = new Map(BADGES.map((b) => [b.id, b]));

/** Badges earned now that the profile does not hold yet. */
export function newBadges(p: DevProfile): BadgeDef[] {
  const held = new Set(p.badges);
  return BADGES.filter((b) => !held.has(b.id) && b.earned(p));
}
