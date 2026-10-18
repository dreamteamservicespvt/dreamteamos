/**
 * The Arena (FR-041 – FR-047): the season, four boards with their formulas, the weekly league and the team mission.
 * Safe competition: the top of each board and the viewer's own neighbourhood — never a "bottom" list; a person can
 * appear as "A teammate".
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info, Loader2, Swords, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { nearYou } from "@/devos/core/boards";
import { dayLabel, daysBetween, istDay, weekKeyOf } from "@/devos/core/days";
import { trackName } from "@/devos/core/dimensions";
import { seasonOf } from "@/devos/core/season";
import type { BoardEntry, BoardId } from "@/devos/core/types";
import { useBoards, useLeague, useMission } from "@/hooks/useDevOs";
import { useDevOs } from "./context";
import { Chip, Empty, Loading, Note, Section, TAP, fmtDateTime } from "./kit";

const BOARD_TABS: { id: BoardId; label: string }[] = [
  { id: "mastery", label: "Mastery Champions" }, { id: "improved", label: "Most Improved" },
  { id: "execution", label: "Execution Champions" }, { id: "team", label: "Team Champions" },
];

function Row({ e, me }: { e: BoardEntry; me: boolean }) {
  return (
    <li className={cn("flex items-center gap-3 rounded-xl px-3 py-2", me ? "bg-primary/10 ring-1 ring-primary/40" : "odd:bg-muted/30")}>
      <span className={cn("w-7 text-center font-bold tabular-nums", e.position <= 3 && "text-amber-700 dark:text-amber-400")}>{e.position}</span>
      <span className="flex-1 min-w-0 truncate text-sm">{e.name}{me && " (you)"}</span>
      <span className="text-xs text-muted-foreground hidden sm:inline">{trackName(e.track)}</span>
      <span className="text-sm font-semibold tabular-nums">{e.label.split(" · ")[0]}</span>
    </li>
  );
}

export default function ArenaView() {
  const { user, profile, profileLoading, policy, tasks, run, busy } = useDevOs();
  const navigate = useNavigate();
  const today = istDay(Date.now());
  const season = useMemo(() => seasonOf(today, policy.cadence.seasonAnchor, policy.cadence.seasonWeeks), [today, policy]);
  const { data: boards, loading } = useBoards(season.id);
  const [tab, setTab] = useState<BoardId>("mastery");
  const roundId = profile ? `${weekKeyOf(today)}_${profile.track}` : undefined;
  const { data: round } = useLeague(roundId);
  const { data: mission } = useMission(profile ? `${season.id}_${profile.track}` : undefined);
  if (profileLoading) return <Loading />;
  if (!profile || profile.onboarding.baseline !== "complete") return <Empty>The Arena opens after your baseline.</Empty>;

  const leagueTask = tasks.find((t) => t.kind === "league" && t.roundId === roundId);
  const join = async () => {
    const r = await run<{ taskId: string }>("league.join", {}, { label: "league" });
    if (r?.taskId) navigate(`/dev-os/play/${r.taskId}`);
  };
  const entries = tab === "team" ? [] : boards?.boards[tab] ?? [];
  const near = nearYou(entries, user.uid);
  const myResult = round?.results?.find((r) => r.uid === user.uid);

  return (
    <div className="space-y-4" data-test="arena-view">
      <Section title={`Season ${season.index}`} hint={`${dayLabel(season.start)} – ${dayLabel(season.end)} · ${Math.max(0, daysBetween(today, season.end) + 1)} days left · standings reset each season; your skills, ranks and badges never do`}
        right={
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch checked={!!profile.boardPrivate} onCheckedChange={(v) => run("privacy", { hidden: v }, { label: "privacy" })} data-test="privacy-toggle" />
            <span>Show me as "A teammate"</span>
          </label>
        }>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1" role="tablist">
          {BOARD_TABS.map((b) => (
            <button key={b.id} role="tab" aria-selected={tab === b.id} onClick={() => setTab(b.id)}
              className={cn("whitespace-nowrap rounded-xl px-3 py-2 text-sm min-h-[40px] border", tab === b.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")} data-test={`board-${b.id}`}>
              {b.label}
            </button>
          ))}
        </div>
        {loading ? <Loading what="Loading the boards" /> : !boards ? <Note className="mt-3">The boards fill in as people answer this season.</Note> : (
          <div className="mt-3 space-y-3">
            {tab === "team" ? (
              <ul className="space-y-2">
                {boards.teams.length ? boards.teams.map((t) => (
                  <li key={t.team} className={cn("rounded-xl border p-3 flex items-center gap-3", t.team === profile.track ? "border-primary/50 bg-primary/5" : "border-border")}>
                    <span className="w-7 text-center font-bold text-lg">{t.position}</span>
                    <div className="flex-1 min-w-0"><p className="font-medium">{t.label}</p><p className="text-xs text-muted-foreground">{t.detail}</p></div>
                    <span className="font-bold tabular-nums">{t.value}</span>
                  </li>
                )) : <Note>No team results yet.</Note>}
              </ul>
            ) : entries.length ? (
              <>
                <ol className="space-y-1">{entries.slice(0, policy.privacy.boardTopN).map((e) => <Row key={e.uid} e={e} me={e.uid === user.uid} />)}</ol>
                {near.length > 0 && !entries.slice(0, policy.privacy.boardTopN).some((e) => e.uid === user.uid) && (
                  <div><p className="text-xs text-muted-foreground mb-1">Around you</p><ol className="space-y-1">{near.map((e) => <Row key={e.uid} e={e} me={e.uid === user.uid} />)}</ol></div>
                )}
                {!entries.some((e) => e.uid === user.uid) && <Note>You appear on this board once you have enough answers this season.</Note>}
              </>
            ) : <Note>Nobody qualifies for this board yet this season.</Note>}
            <p className="text-xs text-muted-foreground flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />{boards.rules[tab]}</p>
            <p className="text-[11px] text-muted-foreground">Updated {fmtDateTime(boards.builtAt)}</p>
          </div>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Weekly league" hint={`${trackName(profile.track)} track · opt-in · five timed questions, the same difficulty for everyone, each person's own version`}>
          {round?.state === "closed" && round.results ? (
            <div className="space-y-2">
              <p className="text-sm">{myResult ? `You finished #${myResult.position} of ${round.results.length} with ${myResult.score}% · rating ${myResult.ratingBefore} → ${myResult.ratingAfter}.` : `${round.results.length} took part this week.`}</p>
              <ol className="space-y-1">{round.results.slice(0, 5).map((r) => <li key={r.uid} className="flex justify-between text-sm rounded-lg px-2 py-1 odd:bg-muted/30"><span>{r.position}. {r.name}</span><span className="tabular-nums">{r.score}%</span></li>)}</ol>
            </div>
          ) : leagueTask ? (
            <div className="space-y-2">
              <p className="text-sm">{leagueTask.state === "assigned" || leagueTask.state === "in_progress" ? "You have joined — finish before Saturday 8 PM." : "Done — results on Saturday evening."}</p>
              {leagueTask.state === "assigned" && <p className="text-xs text-muted-foreground" data-test="league-rules">Once you start you have {policy.cadence.leagueMinutes} minutes; a question left unanswered counts as 0.</p>}
              {(leagueTask.state === "assigned" || leagueTask.state === "in_progress") && <Button className={TAP} onClick={() => navigate(`/dev-os/play/${leagueTask.id}`)} data-test="league-continue"><Swords className="h-4 w-4 mr-1" /> {leagueTask.state === "assigned" ? "Start" : "Continue"}</Button>}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Your league rating this season: <span className="text-foreground font-semibold">{profile.rating.seasonId === season.id ? profile.rating.value : 1000}</span>. Joining is optional and never affects your skills or rank.</p>
              {/* Join opens the first timed question at once, so the rules are said here, before the clock starts. */}
              <p className="text-xs text-muted-foreground" data-test="league-rules">Joining starts it: {round?.blueprint.length ?? policy.cadence.leagueItems} timed questions, {policy.cadence.leagueMinutes} minutes in all, no hints; a question left unanswered counts as 0. Starting and walking away still counts.</p>
              <Button className={TAP} disabled={busy === "league"} onClick={join} data-test="league-join">{busy === "league" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Swords className="h-4 w-4 mr-1" />}Join this week's league</Button>
            </div>
          )}
        </Section>
        <Section title="Team mission" hint="A real improvement for your team this season, with a part for each person.">
          {mission ? (
            <div className="space-y-2">
              <p className="font-medium text-sm">{mission.title}</p>
              <p className="text-xs text-muted-foreground">{mission.objective} Measured by: {mission.outcomeMeasure}.</p>
              <ul className="space-y-1">
                {mission.parts.map((p) => {
                  const mine = p.uid === user.uid;
                  // Safe competition (FR-047): a teammate's part reads only "done" or "not done yet" — never a public "failed".
                  const chip = mine
                    ? { tone: (p.state === "passed" ? "good" : p.state === "failed" ? "bad" : p.state === "completed" ? "info" : "muted") as "good" | "bad" | "info" | "muted", text: p.state === "assigned" ? "to do" : p.state.replace("_", " ") }
                    : { tone: (p.state === "passed" ? "good" : "muted") as "good" | "muted", text: p.state === "passed" ? "done" : "not done yet" };
                  return (
                    <li key={p.uid} className={cn("flex items-center justify-between gap-2 text-sm rounded-lg px-2 py-1.5", mine ? "bg-primary/10" : "odd:bg-muted/30")}>
                      <span className="flex items-center gap-1.5 min-w-0"><Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="truncate">{p.role} — {mine ? "you" : p.name}</span></span>
                      <Chip tone={chip.tone}>{chip.text}</Chip>
                    </li>
                  );
                })}
              </ul>
              {mission.parts.some((p) => p.uid === user.uid) && <Button variant="outline" className={TAP} onClick={() => navigate(`/dev-os/play/mission_${mission.id}`)}>Open my part</Button>}
              {mission.state !== "open" && <p className="text-xs text-muted-foreground">Mission {mission.state} · team score {mission.score ?? 0}%</p>}
            </div>
          ) : <Note>This season's team mission is set up on the morning after at least two people in your track have finished their baseline — with a part for everyone who has.</Note>}
        </Section>
      </div>
    </div>
  );
}
