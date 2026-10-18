/**
 * My Career and Rank (FR-035 – FR-038, the brief §7): the six ranks, what the next one needs (gate by gate, with
 * what to do), the rank assessment, every promotion with its evidence and policy version, XP history (kept separate
 * from mastery), achievements and personal bests.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Award, CheckCircle2, Circle, Loader2, Lock, Medal, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BADGES } from "@/devos/core/badges";
import { rankLabel } from "@/devos/core/policy";
import { evaluateRank, rankAssessmentOpen } from "@/devos/core/ranks";
import type { RankLevel } from "@/devos/core/types";
import { useCareer, useDevXp } from "@/hooks/useDevOs";
import { useDevOs } from "./context";
import { ACCENT_TEXT, Chip, Empty, Loading, Note, RANK_STYLE, Section, TAP, fmtDate } from "./kit";

export default function CareerView() {
  const { user, profile, profileLoading, policy, run, busy, tasks } = useDevOs();
  const navigate = useNavigate();
  const now = Date.now();
  const { ranks, badges, loading } = useCareer(user.uid);
  const { data: xp } = useDevXp(user.uid, 40);
  const evaluation = useMemo(() => (profile && profile.onboarding.baseline === "complete" ? evaluateRank(profile, policy, now) : null), [profile, policy, now]);
  const assessment = useMemo(() => (profile ? rankAssessmentOpen(profile, policy, now) : null), [profile, policy, now]);
  if (profileLoading || loading) return <Loading />;
  if (!profile || profile.onboarding.baseline === "not_started") return <Empty>Your career starts with the baseline.</Empty>;

  const startRank = async () => {
    const r = await run<{ taskId: string }>("rank", {}, { label: "rank" });
    if (r?.taskId) navigate(`/dev-os/play/${r.taskId}`);
  };
  // A started assessment is continued, never started twice (the server answers the same way — learner.startRankAssessment).
  const openRank = tasks.find((t) => t.kind === "rank" && (t.state === "assigned" || t.state === "in_progress"));
  const earned = new Map(badges.map((b) => [b.badge, b]));
  const bestLevel = Math.max(0, ...Object.values(profile.dims).map((d) => d.bestLevel));

  return (
    <div className="space-y-4" data-test="career-view">
      <Section title="The six ranks" hint="Earned by demonstrated skill — never by time, XP or the number of questions answered.">
        <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {([1, 2, 3, 4, 5, 6] as RankLevel[]).map((lvl) => {
            const reached = profile.rank.level >= lvl;
            const s = RANK_STYLE[lvl];
            return (
              <li key={lvl} className={cn("rounded-2xl border p-3 text-center", reached ? "border-transparent bg-gradient-to-br text-white shadow-sm " + s.bg : "border-border bg-card text-muted-foreground")} aria-current={profile.rank.level === lvl ? "step" : undefined}>
                <p className="text-xs opacity-80">Rank {lvl}</p>
                <p className="font-semibold text-sm leading-tight">{rankLabel(policy, lvl)}</p>
                {profile.rank.level === lvl && <p className="text-[10px] mt-1 opacity-90">since {fmtDate(profile.rank.since)}</p>}
                {!reached && <Lock className="h-3.5 w-3.5 mx-auto mt-1 opacity-60" aria-hidden />}
              </li>
            );
          })}
        </ol>
      </Section>

      {evaluation?.next ? (
        <Section title={`Next: ${rankLabel(policy, evaluation.next)}`} hint="Every gate must pass. A strong overall score can never hide a weak critical skill."
          right={<Chip tone={evaluation.eligible ? "good" : "muted"}>{evaluation.gates.filter((g) => g.passed).length} / {evaluation.gates.length} gates</Chip>}>
          <ul className="space-y-2">
            {evaluation.gates.map((g) => (
              <li key={g.id} className={cn("rounded-xl border p-3 flex gap-3", g.passed ? "border-success/30 bg-success/5" : "border-border")} data-test={`gate-${g.id}`}>
                {g.passed ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
                <div className="min-w-0"><p className="font-medium text-sm">{g.label}</p><p className="text-xs text-muted-foreground">{g.detail}</p>{!g.passed && g.todo && <p className={cn("text-xs mt-0.5", ACCENT_TEXT)}>{g.todo}</p>}</div>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl bg-muted/40 p-3 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <p className="text-sm flex items-start gap-2"><Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />{openRank ? "Your rank assessment is open — continue where you left off." : assessment?.why}</p>
              {openRank
                ? <Button className={TAP} onClick={() => navigate(`/dev-os/play/${openRank.id}`)} data-test="continue-rank">Continue the rank assessment</Button>
                : <Button className={TAP} disabled={!assessment?.open || busy === "rank"} onClick={startRank} data-test="start-rank">{busy === "rank" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Start the rank assessment</Button>}
            </div>
            {!openRank && assessment?.open && (
              <p className="text-xs text-muted-foreground" data-test="rank-rules">
                Once you start, it counts as taken: you have {policy.rankAssessment.minutes} minutes, each question has its own timer, a
                question left unanswered counts as 0, and the next assessment opens {policy.rankAssessment.cooldownDays} days later.
              </p>
            )}
          </div>
        </Section>
      ) : <Section title="You hold the top rank" hint="Keep your skills fresh — retention checks and leagues continue."><p className="text-sm">Ultra Pro Max — congratulations.</p></Section>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Promotions" hint="Each is recorded with the gates it passed, the evidence and the policy version.">
          {ranks.length ? (
            <ul className="space-y-2">
              {[...ranks].sort((a, b) => b.effectiveAt - a.effectiveAt).map((e) => (
                <li key={e.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex justify-between gap-2"><span className="font-medium">{rankLabel(policy, e.oldRank)} → {rankLabel(policy, e.newRank)}</span><span className="text-muted-foreground text-xs">{fmtDate(e.effectiveAt)}</span></div>
                  <p className="text-xs text-muted-foreground mt-1">Policy {e.policyVersion} · {e.gates.length} gates passed · {e.evidenceIds.length} evidence records</p>
                </li>
              ))}
            </ul>
          ) : <Note>Your first promotion will be recorded here.</Note>}
        </Section>
        <Section title="Personal bests">
          <ul className="grid grid-cols-2 gap-2 text-center">
            <li className="rounded-xl bg-muted/40 p-3"><p className="text-xl font-bold tabular-nums">{profile.streak.best}</p><p className="text-[11px] text-muted-foreground">longest streak</p></li>
            <li className="rounded-xl bg-muted/40 p-3"><p className="text-xl font-bold tabular-nums">{bestLevel || "—"}</p><p className="text-[11px] text-muted-foreground">hardest level passed</p></li>
            <li className="rounded-xl bg-muted/40 p-3"><p className="text-xl font-bold tabular-nums">{profile.rating.best}</p><p className="text-[11px] text-muted-foreground">best league rating</p></li>
            <li className="rounded-xl bg-muted/40 p-3"><p className="text-xl font-bold tabular-nums">{profile.stats.perfectQuests ?? 0}</p><p className="text-[11px] text-muted-foreground">perfect quests</p></li>
          </ul>
        </Section>
      </div>

      <Section title="Achievements" hint="Permanent — a new season, a later miss or a policy change never takes one away.">
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {[...BADGES.filter((b) => !b.id.startsWith("specialist_") || earned.has(b.id)), ...badges.filter((b) => b.badge.startsWith("season_")).map((b) => ({ id: b.badge, title: b.title, detail: b.detail }))].map((b) => {
            const has = earned.get(b.id);
            return (
              <li key={b.id} className={cn("rounded-xl border p-3", has ? "border-amber-300/60 bg-amber-50 dark:bg-amber-500/10" : "border-border opacity-60")} data-test={`badge-${b.id}`}>
                <div className="flex items-center gap-2">{has ? (b.id.startsWith("season_") ? <Medal className="h-4 w-4 text-amber-500" /> : <Award className="h-4 w-4 text-amber-500" />) : <Lock className="h-4 w-4" />}<span className="font-medium text-sm leading-tight">{b.title}</span></div>
                <p className="text-[11px] text-muted-foreground mt-1">{b.detail}</p>
                {has && <p className="text-[10px] text-muted-foreground mt-1">{fmtDate(has.earnedAt)}</p>}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="XP history" hint="XP rewards effort and correct work. It is shown here — and never used to decide a rank." right={<Chip tone="warn"><Zap className="h-3 w-3" /> {profile.xp.total.toLocaleString("en-IN")}</Chip>}>
        {xp.length ? (
          <ul className="divide-y divide-border text-sm">
            {xp.map((x) => <li key={x.id} className="py-2 flex justify-between gap-3"><span className="min-w-0 truncate">{x.reason}</span><span className="text-muted-foreground text-xs whitespace-nowrap">{fmtDate(x.recordedAt)}</span></li>)}
          </ul>
        ) : <Note>Your XP history appears with your first answers.</Note>}
      </Section>
    </div>
  );
}
