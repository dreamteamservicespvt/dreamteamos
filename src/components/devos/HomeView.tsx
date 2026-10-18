/**
 * My Development Home (the brief §12): today's plan, the active task, rank / XP / streak, the focus skills and why,
 * and practice on demand — one card per thing, in plain words.
 */
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, CheckCircle2, Clock, Flame, Loader2, PlayCircle, Sparkles, Target, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DIMENSIONS, dimensionName, trackName } from "@/devos/core/dimensions";
import { istDay, shortDay, timeLabel } from "@/devos/core/days";
import { rankLabel } from "@/devos/core/policy";
import { evaluateRank } from "@/devos/core/ranks";
import type { DevTask, DimensionId } from "@/devos/core/types";
import { useDevOs } from "./context";
import { Chip, Disclaimer, Loading, Note, Ring, Section, TAP } from "./kit";

const OPEN_STATES = new Set(["assigned", "in_progress", "completed"]);

/** When a task closes, with its clock time ("due 11 PM · in 12 h") — the deadline is the server's, in India time. */
function dueText(ms: number, now: number): string {
  const h = Math.round((ms - now) / 3_600_000);
  if (ms < now) return "past due";
  if (h < 1) return `due ${timeLabel(ms)} · within the hour`;
  if (h < 24) return `due ${timeLabel(ms)} · in ${h} h`;
  return `due ${shortDay(istDay(ms))}, ${timeLabel(ms)}`;
}

export function TaskCard({ task, now }: { task: DevTask; now: number }) {
  const navigate = useNavigate();
  const practical = !task.blueprint?.length;
  const kindIcon = task.kind === "challenge" || task.kind === "mission_part" || task.kind === "capstone" ? Wrench : task.kind === "remediation" ? Sparkles : task.kind === "rank" ? Target : PlayCircle;
  const Icon = kindIcon;
  const grading = task.state === "completed";
  const label = grading ? "Being graded" : task.state === "in_progress" ? "Continue" : practical ? "Open" : "Start";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 min-w-0" data-test={`task-card-${task.kind}`}>
      <div className="flex items-start gap-3 min-w-0">
        <div className={cn("h-10 w-10 shrink-0 rounded-xl grid place-items-center", task.kind === "quest" ? "bg-primary/10 text-primary" : task.kind === "remediation" ? "bg-warning/15 text-amber-700 dark:text-warning" : "bg-muted text-foreground")}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{task.title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.why}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="muted"><Clock className="h-3 w-3" /> ~{task.estMinutes} min</Chip>
        <Chip tone={task.dueAt - now < 6 * 3_600_000 ? "warn" : "muted"}><CalendarClock className="h-3 w-3" /> {dueText(task.dueAt, now)}</Chip>
        {task.blueprint && <Chip tone="muted">{task.blueprint.length} {task.blueprint.length === 1 ? "item" : "items"}</Chip>}
        {task.dims.slice(0, 3).map((d) => <Chip key={d} tone="primary">{dimensionName(d)}</Chip>)}
      </div>
      <Button className={cn("w-full", TAP)} variant={task.kind === "quest" ? "default" : "outline"} disabled={grading} onClick={() => navigate(`/dev-os/play/${task.id}`)} data-test={`task-open-${task.id}`}>
        {grading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}{label}{!grading && <ArrowRight className="h-4 w-4 ml-1" />}
      </Button>
    </div>
  );
}

export default function HomeView() {
  const { user, profile, profileLoading, tasks, policy, run, busy, canSeeAdmin, todayReason } = useDevOs();
  const navigate = useNavigate();
  const now = Date.now();
  const today = istDay(now);
  // A finished league round is "completed" until the round closes — its results are on the Arena, it is not being
  // graded (the browser test found it on Home as a disabled, spinning "Being graded").
  const open = useMemo(() => tasks.filter((t) => OPEN_STATES.has(t.state) && t.kind !== "baseline" && !(t.kind === "league" && t.state === "completed"))
    .sort((a, b) => (a.kind === "quest" ? -1 : 0) - (b.kind === "quest" ? -1 : 0) || a.dueAt - b.dueAt), [tasks]);
  const doneToday = tasks.filter((t) => t.day === today && ["passed", "failed"].includes(t.state));
  const evaluation = useMemo(() => (profile && profile.onboarding.baseline === "complete" ? evaluateRank(profile, policy, now) : null), [profile, policy, now]);

  if (profileLoading) return <Loading what="Opening your development space" />;

  const practise = async (dim: DimensionId) => {
    const r = await run<{ taskId: string }>("practice", { dim }, { label: `practice:${dim}` });
    if (r?.taskId) navigate(`/dev-os/play/${r.taskId}`);
  };

  if (!profile || profile.status === "invited" || profile.onboarding.baseline === "not_started") {
    return (
      <div className="space-y-4">
        <section className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-sky-500/10 p-5 sm:p-8">
          <p className="text-sm text-muted-foreground">Hello {user.name?.split(" ")[0]} 👋</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mt-1 leading-tight">Grow ten work skills, a few minutes a day</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Short, fresh challenges from your own kind of work — never the same question twice. A coach explains every miss,
            the system plans what you practise next, and you earn ranks from Basic to Ultra Pro Max by showing real skill.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button className={TAP} onClick={() => navigate("/dev-os/start")} data-test="devos-get-started">Get started <ArrowRight className="h-4 w-4 ml-1" /></Button>
            {canSeeAdmin && <Button variant="outline" className={TAP} asChild><Link to="/dev-os/admin">Open the Control Center</Link></Button>}
          </div>
        </section>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {DIMENSIONS.map((d) => (
            <div key={d.id} className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{d.no}</p>
              <p className="font-medium text-sm leading-tight">{d.name}</p>
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3">{d.measures}</p>
            </div>
          ))}
        </div>
        <Disclaimer />
      </div>
    );
  }

  if (profile.onboarding.baseline === "in_progress") {
    return (
      <div className="space-y-4">
        <Section title="Finish your baseline" hint="Ten short challenges, one for each skill — it sets your starting plan. Hints are off; take your time.">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm flex-1">You can stop at any point and continue later — every answer is saved.</p>
            <Button className={TAP} onClick={() => navigate("/dev-os/play/baseline")} data-test="devos-continue-baseline">Continue the baseline <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </Section>
        <Disclaimer />
      </div>
    );
  }

  const passed = evaluation?.gates.filter((g) => g.passed).length ?? 0;
  const gates = evaluation?.gates.length ?? 0;
  return (
    <div className="space-y-4" data-test="devos-home">
      <section className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-fuchsia-500/10 p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Ring value={profile.summary} size={84} label="Overall" />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Hello {user.name?.split(" ")[0]} · {trackName(profile.track)} track</p>
              <p className="font-display text-xl sm:text-2xl font-bold leading-tight">{profile.summary === null ? "Building your picture" : `Overall ${Math.round(profile.summary)} / 100`}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Role-weighted across the ten skills · <Link to="/dev-os/skills" className="underline inline-flex items-center min-h-[24px]">see each skill</Link></p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 md:w-[26rem]">
            <div className="rounded-2xl bg-card/80 border border-border p-3 text-center">
              <Zap className="h-4 w-4 mx-auto text-amber-500" aria-hidden />
              <p className="font-bold tabular-nums mt-1">{profile.xp.total.toLocaleString("en-IN")}</p>
              <p className="text-[11px] text-muted-foreground">XP · +{profile.xp.weekKey ? profile.xp.week : 0} this week</p>
            </div>
            <div className="rounded-2xl bg-card/80 border border-border p-3 text-center">
              <Flame className={cn("h-4 w-4 mx-auto", profile.streak.current ? "text-orange-500" : "text-muted-foreground")} aria-hidden />
              <p className="font-bold tabular-nums mt-1">{profile.streak.current}</p>
              <p className="text-[11px] text-muted-foreground">day streak{profile.streak.freezes ? ` · ${profile.streak.freezes} freeze` : ""}</p>
            </div>
            <Link to="/dev-os/rank" className="rounded-2xl bg-card/80 border border-border p-3 text-center hover:bg-muted transition-colors">
              <Target className="h-4 w-4 mx-auto text-primary" aria-hidden />
              <p className="font-bold tabular-nums mt-1">{evaluation?.next ? `${passed}/${gates}` : "Top"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{evaluation?.next ? `gates to ${rankLabel(policy, evaluation.next)}` : "rank reached"}</p>
            </Link>
          </div>
        </div>
      </section>

      <Section title="Today" hint={open.length ? "Your plan for today, chosen from your own answers." : "Nothing waiting right now."} id="devos-today">
        {open.length ? (
          <>
            {/* Today's quest done while other tasks remain (the weekly challenge…): say so — the browser test saw no word of it. */}
            {tasks.some((t) => t.kind === "quest" && t.day === today && ["passed", "failed"].includes(t.state)) && (
              <p className="text-sm flex items-center gap-2 mb-3" data-test="quest-done"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Today's quest is done. The tasks below are extra this week.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{open.slice(0, 6).map((t) => <TaskCard key={t.id} task={t} now={now} />)}</div>
          </>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm flex-1 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
              {doneToday.length ? `Done for today — ${doneToday.length} task${doneToday.length > 1 ? "s" : ""} finished.`
                : todayReason === "day_off" ? "No quest today — it is a day off (a Sunday or a company holiday). Your next quest arrives on the next working day; practise any skill below if you like."
                : todayReason === "on_leave" ? "No quest today — you are on leave, and your streak is safe. Your next quest arrives when you are back."
                : "Your next quest arrives on the next working day. Practise any skill below meanwhile."}
            </p>
          </div>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Your focus" hint="What the system will train next, and why.">
          {profile.plan.focus.length ? (
            <ul className="space-y-2">
              {profile.plan.focus.map((d, i) => (
                <li key={d} className="rounded-xl bg-muted/40 p-3">
                  <p className="font-medium text-sm">{dimensionName(d)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{profile.plan.reasons[i]?.replace(`${dimensionName(d)}: `, "")}</p>
                </li>
              ))}
            </ul>
          ) : <Note>Your focus appears after the first answers.</Note>}
        </Section>
        <Section title="Practise a skill" hint="Extra practice counts for learning; XP stops after a daily limit so it stays fair.">
          <div className="flex flex-wrap gap-2">
            {DIMENSIONS.map((d) => (
              <Button key={d.id} variant="outline" size="sm" className="min-h-[40px]" disabled={!!busy} onClick={() => practise(d.id)} data-test={`practise-${d.id}`}>
                {busy === `practice:${d.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}{d.short}
              </Button>
            ))}
          </div>
        </Section>
      </div>
      <Disclaimer />
    </div>
  );
}
