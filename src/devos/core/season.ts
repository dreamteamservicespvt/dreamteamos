/**
 * Seasons, streaks and competitive rating (FR-041 – FR-044; research brief 2026-10-18 lessons 14–18).
 *
 * • A season is `cadence.seasonWeeks` (default 4) weeks from `cadence.seasonAnchor` (a Monday). Standings reset each
 *   season; mastery, history, rank events and achievements never do (FR-038, FR-044).
 * • A streak counts working days with the daily quest done. Sundays, company holidays and approved leave never break
 *   it (they are not working days for that person); a missed working day is covered by a freeze when one is held
 *   (one earned every 7 days of streak, at most 2 — Duolingo's design: freezes raised daily activity).
 * • The competitive rating is Elo, per league round, reset each season — separate from XP and mastery (FR-033).
 */
import { addDays, daysBetween, isWorkday, type WorkdayContext } from "./days.js";
import type { DevProfile } from "./types.js";

export interface SeasonInfo {
  id: string;
  index: number;
  start: string;
  end: string;
}

export function seasonOf(day: string, anchor: string, weeks: number): SeasonInfo {
  const len = Math.max(1, weeks) * 7;
  // A day before the anchor (the platform opened on Sunday 2026-10-18, the first season starts Monday the 19th)
  // belongs to Season 1: without the floor it was "Season 0", a one-day season whose answers vanished from the
  // boards the next morning and was never closed.
  const index = Math.max(0, Math.floor(daysBetween(anchor, day) / len));
  const start = addDays(anchor, index * len);
  return { id: `S${index + 1}`, index: index + 1, start, end: addDays(start, len - 1) };
}

export type Streak = DevProfile["streak"];

export interface StreakUpdate {
  streak: Streak;
  /** Reached today (3, 7, 14, 30 …) — the XP rule pays these once. */
  milestone: number | null;
  usedFreezes: number;
}

/**
 * The streak after the daily quest is done on `day`. `away` = days this person was on approved leave (not working days
 * for them).
 */
export function advanceStreak(streak: Streak, day: string, cal: WorkdayContext, away: ReadonlySet<string> = new Set()): StreakUpdate {
  if (streak.lastDay === day) return { streak, milestone: null, usedFreezes: 0 };
  let missed = 0;
  if (streak.lastDay) {
    const gap = daysBetween(streak.lastDay, day);
    if (gap < 0) return { streak, milestone: null, usedFreezes: 0 };
    for (let i = 1; i < gap; i++) {
      const d = addDays(streak.lastDay, i);
      if (isWorkday(d, cal) && !away.has(d)) missed++;
    }
  }
  let current: number;
  let freezes = streak.freezes;
  let usedFreezes = 0;
  const used = [...(streak.freezeUsedOn ?? [])];
  if (!streak.lastDay) current = 1;
  else if (missed === 0) current = streak.current + 1;
  else if (missed <= freezes) {
    freezes -= missed;
    usedFreezes = missed;
    used.push(day);
    current = streak.current + 1;
  } else current = 1;
  if (current > 0 && current % 7 === 0) freezes = Math.min(2, freezes + 1);
  const best = Math.max(streak.best, current);
  return {
    streak: { current, best, lastDay: day, freezes, freezeUsedOn: used.slice(-10) },
    milestone: [3, 7, 14, 30, 60, 100].includes(current) ? current : null,
    usedFreezes,
  };
}

/** Is the streak still alive on `today` (no missed working day since the last quest, beyond the freezes held)? */
export function streakAlive(streak: Streak, today: string, cal: WorkdayContext, away: ReadonlySet<string> = new Set()): boolean {
  if (!streak.lastDay) return false;
  const gap = daysBetween(streak.lastDay, today);
  let missed = 0;
  for (let i = 1; i < gap; i++) {
    const d = addDays(streak.lastDay, i);
    if (isWorkday(d, cal) && !away.has(d)) missed++;
  }
  return missed <= streak.freezes;
}

// ── Elo for league rounds ────────────────────────────────────────────────────────────────────────

export const RATING_START = 1000;

/**
 * Pairwise Elo for one round: everybody against everybody, K = 24 split across opponents. Higher score wins; a tie
 * (within 2 points) is a draw. Returns uid → new rating.
 */
export function eloRound(entries: { uid: string; score: number; rating: number }[], k = 24): Map<string, number> {
  const out = new Map(entries.map((e) => [e.uid, e.rating]));
  if (entries.length < 2) return out;
  const per = k / (entries.length - 1);
  for (const a of entries) {
    let delta = 0;
    for (const b of entries) {
      if (a === b) continue;
      const expected = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
      const actual = Math.abs(a.score - b.score) <= 2 ? 0.5 : a.score > b.score ? 1 : 0;
      delta += per * (actual - expected);
    }
    out.set(a.uid, Math.round(a.rating + delta));
  }
  return out;
}
