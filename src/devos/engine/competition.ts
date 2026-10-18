/**
 * Seasons, boards, weekly leagues and team missions (FR-041 – FR-047, MSRS §9.5).
 *
 * • Boards are rebuilt from season scores (one query) — by the tick and, throttled, after answers.
 * • A league round per track per week: opt-in; every participant gets the SAME blueprint (families, forms, difficulty)
 *   with their own fresh instances — equivalent difficulty, nobody can copy another's answer (FR-010); closed on
 *   Saturday evening into a stored result with Elo ratings (separate from XP and mastery — FR-033).
 * • A team mission per track per season with distinct contributions (FR-045).
 * • At a season's end its boards are frozen (`final`) and the winners get a permanent achievement; nothing else resets
 *   (FR-038, FR-044, AC-018).
 */
import { BADGES } from "../core/badges.js";
import { buildBoards, inputsFromScores } from "../core/boards.js";
import { addDays, dayLabel, istAt, istDay, istEndOfDay, mondayOf, weekKeyOf } from "../core/days.js";
import type { DevPolicy } from "../core/policy.js";
import { eloRound, RATING_START, seasonOf } from "../core/season.js";
import type { BoardsDoc, DevProfile, DevSession, DevTask, LeagueRound, SeasonScore, SessionSlot, TeamMission, TrackId } from "../core/types.js";
import { MISSION_CRITERIA, missionFor } from "../content/missions.js";
import { assertActive, DevError, loadPolicy, PATH, type Actor, type Deps } from "./context.js";
import { signRecord } from "./integrity.js";
import { closeAndSettle } from "./progress.js";
import type { Doc } from "./store.js";

export async function rebuildBoards(deps: Deps, policy: DevPolicy, seasonId?: string, final = false): Promise<BoardsDoc> {
  const now = deps.now();
  const day = istDay(now);
  const current = seasonOf(day, policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const season = seasonId && seasonId !== current.id ? seasonFromId(seasonId, policy) : current;
  const rows = await deps.store.query(PATH.seasonScores(season.id));
  const doc = buildBoards(season, inputsFromScores(rows.map((r) => r.data as unknown as SeasonScore)), policy, now, final);
  await deps.store.set(PATH.boards(season.id), doc as unknown as Doc);
  return doc;
}

function seasonFromId(id: string, policy: DevPolicy) {
  const n = Number(id.replace(/^S/, "")) - 1;
  const len = policy.cadence.seasonWeeks * 7;
  const start = addDays(policy.cadence.seasonAnchor, n * len);
  return { id, index: n + 1, start, end: addDays(start, len - 1) };
}

/** Rebuild the current boards if they are older than `maxAgeMs` (keeps reads low after answers). */
export async function refreshBoardsIfStale(deps: Deps, policy: DevPolicy, maxAgeMs = 180_000): Promise<void> {
  const season = seasonOf(istDay(deps.now()), policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const doc = (await deps.store.get(PATH.boards(season.id))) as unknown as BoardsDoc | null;
  if (doc && deps.now() - doc.builtAt < maxAgeMs) return;
  await rebuildBoards(deps, policy, season.id);
}

/** Close every season that has ended and was not closed yet: final boards + winners' achievements. */
export async function closeEndedSeasons(deps: Deps, policy: DevPolicy): Promise<string[]> {
  const day = istDay(deps.now());
  const current = seasonOf(day, policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const closed: string[] = [];
  for (let i = Math.max(1, current.index - 2); i < current.index; i++) {
    const sid = `S${i}`;
    const meta = await deps.store.get(PATH.season(sid));
    if (meta?.final) continue;
    const boards = await rebuildBoards(deps, policy, sid, true);
    const winners: [string, string, string][] = [];
    if (boards.boards.mastery[0]) winners.push([boards.boards.mastery[0].uid, "mastery", "Mastery Champion"]);
    if (boards.boards.improved[0]) winners.push([boards.boards.improved[0].uid, "improved", "Most Improved"]);
    if (boards.boards.execution[0]) winners.push([boards.boards.execution[0].uid, "execution", "Execution Champion"]);
    for (const [uid, board, title] of winners) {
      const id = `season_${sid}_${board}`;
      await deps.store.set(PATH.achievement(uid, id), { id, uid, badge: id, title: `${title} — season ${sid.slice(1)}`, detail: `Top of the ${title} board for ${boards.start} – ${boards.end}.`, evidence: [`devos_boards/${sid}`], earnedAt: deps.now(), permanent: true });
      await deps.notify.send({ uid, type: "devos_badge", title: `${title} of season ${sid.slice(1)}!`, message: "A permanent award is on your Career page.", link: "/dev-os/rank", key: `devos_season_${sid}_${board}_${uid}`, push: true }).catch(() => false);
    }
    await deps.store.set(PATH.season(sid), { id: sid, start: boards.start, end: boards.end, final: true, closedAt: deps.now(), policyVersion: policy.version });
    closed.push(sid);
  }
  return closed;
}

// ── Leagues ─────────────────────────────────────────────────────────────────────────────────────

const LEAGUE_BLUEPRINT: Omit<SessionSlot, "state">[] = [
  { dim: "logical", difficulty: 3, purpose: "league", family: "order_puzzle", form: "kth", reason: "League — logic" },
  { dim: "cognitive", difficulty: 3, purpose: "league", family: "rule_application", form: "compute", reason: "League — applying a rule" },
  { dim: "critical", difficulty: 3, purpose: "league", family: "claim_check", form: "verdict", reason: "League — judging a claim" },
  { dim: "decision", difficulty: 3, purpose: "league", family: "prioritize_value", form: "first_one", reason: "League — deciding under limits" },
  { dim: "execution", difficulty: 3, purpose: "league", family: "requirement_check", form: "unmet", reason: "League — checking work" },
];

export const leagueIdOf = (week: string, track: TrackId) => `${week}_${track}`;

export async function ensureLeague(deps: Deps, policy: DevPolicy, track: TrackId): Promise<LeagueRound> {
  const now = deps.now();
  const day = istDay(now);
  const week = weekKeyOf(day);
  const id = leagueIdOf(week, track);
  const existing = (await deps.store.get(PATH.league(id))) as unknown as LeagueRound | null;
  if (existing) return existing;
  const season = seasonOf(day, policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const round: LeagueRound = {
    id, track, weekKey: week, seasonId: season.id, opensAt: istAt(mondayOf(day), 0), closesAt: istAt(addDays(mondayOf(day), 5), 20),
    blueprint: LEAGUE_BLUEPRINT.slice(0, Math.max(3, policy.cadence.leagueItems)).map((s) => ({ ...s, state: "pending" })),
    rubricVersion: "league-v1", state: "open", createdAt: now,
  };
  await deps.store.tx(async (t) => {
    if (await t.get(PATH.league(id))) return;
    t.set(PATH.league(id), round as unknown as Doc);
  });
  return round;
}

/** Join this week's league (opt-in). One timed session per person per round. */
export async function joinLeague(deps: Deps, actor: Actor): Promise<{ taskId: string; round: LeagueRound }> {
  assertActive(actor);
  const policy = await loadPolicy(deps);
  const profile = (await deps.store.get(PATH.user(actor.uid))) as unknown as DevProfile | null;
  if (!profile || profile.onboarding.baseline !== "complete") throw new DevError(409, "baseline_first", "Finish your baseline before joining a league.");
  const round = await ensureLeague(deps, policy, profile.track);
  const now = deps.now();
  if (round.state !== "open" || now > round.closesAt) throw new DevError(409, "closed", "This week's league has closed — a new one opens on Monday.");
  const taskId = `league_${round.id}`;
  await deps.store.tx(async (t) => {
    if (await t.get(PATH.task(actor.uid, taskId))) return;
    const task: DevTask = {
      id: taskId, uid: actor.uid, kind: "league", title: `Weekly league — week of ${dayLabel(round.weekKey)}`,
      why: "Same kinds of questions at the same difficulty as everyone in your track, each with its own fresh version. Timed; no hints.",
      track: profile.track, dims: round.blueprint.map((s) => s.dim), day: istDay(now), createdAt: now, dueAt: round.closesAt, state: "assigned",
      events: [{ from: null, to: "assigned", at: now, by: actor.uid, reason: "joined the league" }],
      blueprint: round.blueprint.map((s) => ({ ...s, state: "pending" as const })), estMinutes: policy.cadence.leagueMinutes, xpReward: 0, difficulty: 3, idem: taskId, roundId: round.id,
    };
    t.set(PATH.task(actor.uid, taskId), task as unknown as Doc);
    t.set(PATH.leagueEntry(round.id, actor.uid), { uid: actor.uid, name: profile.name, hidden: !!profile.boardPrivate, joinedAt: now, done: false, score: 0, ms: 0 });
  });
  return { taskId, round };
}

// A finished league session is written as the person's entry by `progress.writeOutput`, in the transaction that settles it.

/** Close rounds whose time is up: standings, Elo, podium awards, notices. */
export async function closeDueLeagues(deps: Deps, policy: DevPolicy): Promise<number> {
  const now = deps.now();
  const day = istDay(now);
  let closed = 0;
  for (const week of [weekKeyOf(day), weekKeyOf(addDays(day, -7))]) {
    for (const track of ["sales", "technical", "admin"] as TrackId[]) {
      const round = (await deps.store.get(PATH.league(leagueIdOf(week, track)))) as unknown as LeagueRound | null;
      if (!round || round.state !== "open" || now < round.closesAt) continue;
      type Entry = { uid: string; name: string; hidden?: boolean; done: boolean; score: number; ms: number };
      let entries = (await deps.store.query(PATH.leagueEntries(round.id))).map((r) => r.data as Entry);
      // Someone who started and did not finish is in the results with what they answered (the rest counts as 0), so
      // walking away from a bad round never protects a rating. Joined but never started = not in this round.
      let settled = 0;
      for (const e of entries.filter((x) => !x.done)) {
        const s = (await deps.store.get(PATH.session(e.uid, `league_${round.id}`))) as unknown as DevSession | null;
        if (!s || !s.slots.some((x) => x.state !== "pending")) continue;
        if (await closeAndSettle(deps, policy, e.uid, `league_${round.id}`, "the league closed before it was answered")) settled++;
      }
      if (settled) entries = (await deps.store.query(PATH.leagueEntries(round.id))).map((r) => r.data as Entry);
      const done = entries.filter((e) => e.done).sort((a, b) => b.score - a.score || a.ms - b.ms);
      const profiles = await Promise.all(done.map((e) => deps.store.get(PATH.user(e.uid)) as unknown as Promise<DevProfile | null>));
      const ratingOf = (p: DevProfile | null) => (p && p.rating?.seasonId === round.seasonId ? p.rating.value : RATING_START);
      const newRatings = eloRound(done.map((e, i) => ({ uid: e.uid, score: e.score, rating: ratingOf(profiles[i]) })));
      const results = done.map((e, i) => ({
        uid: e.uid, name: e.hidden ? "A teammate" : e.name, score: e.score, ms: e.ms, position: i + 1,
        ratingBefore: ratingOf(profiles[i]), ratingAfter: newRatings.get(e.uid) ?? ratingOf(profiles[i]),
      }));
      for (const [i, r] of results.entries()) {
        await deps.store.tx(async (t) => {
          const p = (await t.get(PATH.user(r.uid))) as unknown as DevProfile | null;
          if (!p) return;
          const same = p.rating?.seasonId === round.seasonId;
          const rating = { seasonId: round.seasonId, value: r.ratingAfter, rounds: (same ? p.rating.rounds : 0) + 1, best: Math.max(same ? p.rating.best : RATING_START, r.ratingAfter) };
          const stats = { ...p.stats, leaguePodiums: (p.stats.leaguePodiums ?? 0) + (i < 3 && done.length >= 3 ? 1 : 0) };
          const next = { ...p, rating, stats, updatedAt: now };
          const fresh = BADGES.filter((b) => !p.badges.includes(b.id) && b.earned(next));
          next.badges = [...p.badges, ...fresh.map((b) => b.id)];
          for (const b of fresh) t.set(PATH.achievement(r.uid, b.id), { id: b.id, uid: r.uid, badge: b.id, title: b.title, detail: b.detail, evidence: [round.id], earnedAt: now, permanent: true });
          t.set(PATH.user(r.uid), (await signRecord(deps.secrets, "profile", next)) as unknown as Doc);
        });
        await deps.notify.send({ uid: r.uid, type: "devos_league", title: `League result: #${r.position} of ${results.length}`, message: `You scored ${r.score}%. Rating ${r.ratingBefore} → ${r.ratingAfter}.`, link: "/dev-os/arena", key: `devos_league_${round.id}_${r.uid}`, push: true }).catch(() => false);
      }
      await deps.store.set(PATH.league(round.id), { state: "closed", results, closedAt: now }, true);
      closed++;
    }
  }
  return closed;
}

// ── Team missions ───────────────────────────────────────────────────────────────────────────────

export const missionIdOf = (seasonId: string, track: TrackId) => `${seasonId}_${track}`;

/** Create this season's mission for a track and give each role to a different learner (rotating by season). */
export async function ensureMission(deps: Deps, policy: DevPolicy, track: TrackId, learners: { uid: string; name: string }[]): Promise<TeamMission | null> {
  if (!policy.cadence.teamMissions || learners.length < 2) return null;
  const now = deps.now();
  const day = istDay(now);
  const season = seasonOf(day, policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  const id = missionIdOf(season.id, track);
  const existing = (await deps.store.get(PATH.mission(id))) as unknown as TeamMission | null;
  if (existing) return existing;
  const def = missionFor(track, season.index);
  const ordered = [...learners].sort((a, b) => a.uid.localeCompare(b.uid));
  const shift = season.index % ordered.length;
  const people = [...ordered.slice(shift), ...ordered.slice(0, shift)];
  const due = istAt(addDays(season.end, -1), 17);
  const parts = def.roles.slice(0, Math.min(def.roles.length, people.length)).map((role, i) => ({ role, person: people[i] }));
  const mission: TeamMission = {
    id, track, seasonId: season.id, title: def.title, objective: def.objective, outcomeMeasure: def.outcomeMeasure,
    parts: parts.map(({ role, person }) => ({ uid: person.uid, name: person.name, role: role.role, taskId: `mission_${id}`, state: "assigned" })),
    state: "open", dueAt: due, createdAt: now,
  };
  const made = await deps.store.tx(async (t) => {
    if (await t.get(PATH.mission(id))) return false;
    t.set(PATH.mission(id), mission as unknown as Doc);
    for (const { role, person } of parts) {
      const task: DevTask = {
        id: `mission_${id}`, uid: person.uid, kind: "mission_part", title: `Team mission: ${def.title} — ${role.role}`,
        why: `${def.objective} Your part as ${role.role}; the team's result is measured by: ${def.outcomeMeasure.toLowerCase()}.`,
        track, dims: role.dims, day, createdAt: now, dueAt: due < now ? istEndOfDay(addDays(day, 7)) : due, state: "assigned",
        events: [{ from: null, to: "assigned", at: now, by: "system", reason: `team mission ${id}` }],
        brief: role.brief, evidence: role.evidence, rubric: { version: "mission-v1", criteria: MISSION_CRITERIA, passMark: 60 },
        estMinutes: 60, xpReward: policy.xp.practicalPassed, difficulty: 3, idem: `mission_${id}`, missionId: id,
      };
      t.set(PATH.task(person.uid, task.id), task as unknown as Doc);
    }
    return true;
  });
  if (made) {
    for (const { role, person } of parts) {
      await deps.notify.send({ uid: person.uid, type: "devos_mission", title: `Team mission: ${def.title}`, message: `You are the ${role.role}. ${role.brief.slice(0, 120)}`, link: "/dev-os/arena", key: `devos_mission_${id}_${person.uid}`, push: true }).catch(() => false);
    }
  }
  return made ? mission : ((await deps.store.get(PATH.mission(id))) as unknown as TeamMission);
}

/** Update each open mission's parts from their tasks; close it when every part is settled or it is past due. */
export async function settleMissions(deps: Deps, policy: DevPolicy): Promise<number> {
  const now = deps.now();
  const season = seasonOf(istDay(now), policy.cadence.seasonAnchor, policy.cadence.seasonWeeks);
  let settled = 0;
  const prev = `S${season.index - 1}`;
  for (const sid of [season.id, prev]) {
    for (const track of ["sales", "technical", "admin"] as TrackId[]) {
      const id = missionIdOf(sid, track);
      const m = (await deps.store.get(PATH.mission(id))) as unknown as TeamMission | null;
      if (!m || m.state !== "open") continue;
      const parts = await Promise.all(m.parts.map(async (part) => {
        const task = (await deps.store.get(PATH.task(part.uid, part.taskId))) as unknown as DevTask | null;
        return { ...part, state: task?.state ?? part.state, score: task?.scoring?.score };
      }));
      const finished = parts.every((p) => ["passed", "failed", "expired", "cancelled", "system_error"].includes(p.state));
      const over = now > m.dueAt;
      const scored = parts.filter((p) => typeof p.score === "number");
      const score = scored.length ? Math.round((scored.reduce((a, p) => a + (p.score ?? 0), 0) / parts.length)) : 0;
      await deps.store.set(PATH.mission(id), { parts, ...(finished || over ? { state: finished ? "complete" : "expired", score, closedAt: now } : {}) }, true);
      if (finished || over) settled++;
    }
  }
  return settled;
}

export { DevError };
