/**
 * My Career and Rank (FR-035 – FR-038, the brief §7): the six ranks, what the next one needs (gate by gate, with
 * what to do), the rank assessment, every promotion with its evidence and policy version, XP history (kept separate
 * from mastery), achievements and personal bests.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Award, CheckCircle2, Loader2, Lock, Medal, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BADGES } from "@/devos/core/badges";
import { rankLabel } from "@/devos/core/policy";
import { evaluateRank, rankAssessmentOpen } from "@/devos/core/ranks";
import type { RankLevel } from "@/devos/core/types";
import { useCareer, useDevXp } from "@/hooks/useDevOs";
import { useDevOs } from "./context";
import { ACCENT_TEXT, Chip, Empty, GOOD_TEXT, Loading, Note, RANK_STYLE, RANK_TIER, RankEmblem, Section, TAP, fmtDate } from "./kit";

const LEVELS: RankLevel[] = [1, 2, 3, 4, 5, 6];

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
  // Every baseline answer is in, a written one still being graded (the baseline task is "completed", not yet applied).
  const baselineWaiting = tasks.some((t) => t.kind === "baseline" && t.state === "completed");
  const earned = new Map(badges.map((b) => [b.badge, b]));
  const bestLevel = Math.max(0, ...Object.values(profile.dims).map((d) => d.bestLevel));

  return (
    <div className="space-y-4" data-test="career-view">
      {/* ── A path, not a row of boxes (2026-10-19, owner: "make it like a timeline or flow chart") ── The six ranks as
          one line you travel along — down the page on a phone, across it on a wide screen — each with its badge. */}
      <Section title="Your rank journey" hint="Earned by demonstrated skill — never by time, XP or the number of questions answered.">
        <ol className="flex flex-col lg:flex-row lg:items-start" data-test="rank-path">
          {LEVELS.map((lvl, i) => {
            const reached = profile.rank.level >= lvl;
            const current = profile.rank.level === lvl;
            const isNext = profile.rank.level + 1 === lvl;
            const s = RANK_STYLE[lvl];
            const lineIn = profile.rank.level >= lvl ? "bg-primary" : "bg-border";
            const lineOut = profile.rank.level > lvl ? "bg-primary" : "bg-border";
            return (
              <li key={lvl} className="flex items-stretch gap-3 lg:flex-col lg:items-center lg:flex-1 lg:gap-2 min-w-0" aria-current={current ? "step" : undefined} data-test={`rank-step-${lvl}`}>
                <div className="flex flex-col items-center lg:flex-row lg:w-full">
                  <div className={cn("hidden lg:block h-1 flex-1 rounded-full", i === 0 ? "invisible" : lineIn)} />
                  {/* One size for every badge (the current one is marked by its ring, which takes no layout space), so the path
                      lines meet the badges straight at 390 px and 1440 px (a bigger current badge stepped the line). */}
                  <div className={cn("rounded-full", current && "ring-2 ring-primary ring-offset-2 ring-offset-card")}>
                    <RankEmblem level={lvl} size={52} locked={!reached} />
                  </div>
                  <div className={cn("hidden lg:block h-1 flex-1 rounded-full", i === LEVELS.length - 1 ? "invisible" : lineOut)} />
                  {i < LEVELS.length - 1 && <div className={cn("lg:hidden w-1 flex-1 min-h-[18px]", lineOut)} />}
                </div>
                <div className="min-w-0 pb-4 lg:pb-0 lg:text-center lg:px-1 pt-2 lg:pt-0">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rank {lvl} · {RANK_TIER[lvl].name}</p>
                  <p className={cn("font-semibold text-sm leading-tight", reached ? s.text : "text-muted-foreground")}>{rankLabel(policy, lvl)}</p>
                  <p className="text-[11px] mt-0.5">
                    {current ? <span className={GOOD_TEXT}>Your rank · since {fmtDate(profile.rank.since)}</span>
                      : reached ? <span className="text-muted-foreground">Passed</span>
                      : isNext ? <span className={ACCENT_TEXT}>Next to earn</span>
                      : <span className="text-muted-foreground inline-flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden /> Locked</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      {profile.onboarding.baseline !== "complete" ? (
        // Before 2026-10-19 this case fell through to "You hold the top rank — Ultra Pro Max", shown to a Basic person
        // whose baseline was still open (the gates are measured from the baseline on).
        <Section title="Finish your baseline first" hint="The gates for your next rank are measured from your baseline on." id="career-baseline-first">
          <p className="text-sm">
            {baselineWaiting
              ? "All your baseline answers are in — your written answers are being graded now. Your gates appear here as soon as they are."
              : "Answer the rest of your baseline (one short challenge per skill). Then this page shows every gate for your next rank and what to do for each."}
          </p>
          {!baselineWaiting && <Button className={cn(TAP, "mt-3")} onClick={() => navigate("/dev-os/play/baseline")}>Continue the baseline</Button>}
        </Section>
      ) : evaluation?.next ? (
        <Section title={`Next: ${rankLabel(policy, evaluation.next)}`} hint="Every gate must pass. A strong overall score can never hide a weak critical skill."
          right={<Chip tone={evaluation.eligible ? "good" : "muted"}>{evaluation.gates.filter((g) => g.passed).length} / {evaluation.gates.length} gates</Chip>}>
          {/* The gates as a flow: one step after another, ticked as each passes, ending in the promotion. */}
          <ol className="relative" data-test="gate-flow">
            {evaluation.gates.map((g, i) => (
              <li key={g.id} className="flex gap-3" data-test={`gate-${g.id}`}>
                <div className="flex flex-col items-center">
                  {g.passed ? <CheckCircle2 className="h-6 w-6 text-success shrink-0" /> : <span className="h-6 w-6 shrink-0 rounded-full border-2 border-muted-foreground/40 grid place-items-center text-[11px] font-semibold text-muted-foreground">{i + 1}</span>}
                  <div className={cn("w-0.5 flex-1 min-h-[12px] my-1 rounded-full", g.passed ? "bg-success/50" : "bg-border")} />
                </div>
                <div className="min-w-0 pb-3"><p className="font-medium text-sm">{g.label}</p><p className="text-xs text-muted-foreground">{g.detail}</p>{!g.passed && g.todo && <p className={cn("text-xs mt-0.5", ACCENT_TEXT)}>{g.todo}</p>}</div>
              </li>
            ))}
            <li className="flex gap-3 items-center">
              <RankEmblem level={evaluation.next} size={28} locked={!evaluation.eligible} />
              <p className="text-sm font-medium">{evaluation.eligible ? "Every gate passed — promotion is automatic" : `Promotion to ${rankLabel(policy, evaluation.next)}`}</p>
            </li>
          </ol>
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
      ) : profile.rank.level >= 6 ? (
        <Section title="You hold the top rank" hint="Keep your skills fresh — retention checks and leagues continue.">
          <div className="flex items-center gap-3"><RankEmblem level={6} size={48} /><p className="text-sm">{rankLabel(policy, 6)} — congratulations.</p></div>
        </Section>
      ) : null}

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
