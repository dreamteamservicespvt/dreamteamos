/**
 * My Learning Path (the brief §12, FR-021, FR-026): what the plan is working on and why, what comes next (today's
 * quest, retention checks, the weekly challenge), what the next rank still needs, and how the plan is chosen.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, Circle, Route } from "lucide-react";
import { dimensionName } from "@/devos/core/dimensions";
import { dayLabel, istDay, shortDay, timeLabel } from "@/devos/core/days";
import { dueRetention } from "@/devos/core/mastery";
import { rankLabel } from "@/devos/core/policy";
import { evaluateRank } from "@/devos/core/ranks";
import { useDevOs } from "./context";
import { Chip, Empty, Loading, Note, PurposeChip, Section } from "./kit";

export default function PathView() {
  const { profile, profileLoading, tasks, policy } = useDevOs();
  const now = Date.now();
  const evaluation = useMemo(() => (profile && profile.onboarding.baseline === "complete" ? evaluateRank(profile, policy, now) : null), [profile, policy, now]);
  if (profileLoading) return <Loading />;
  if (!profile || profile.onboarding.baseline !== "complete") return <Empty>Your path appears after the baseline. <Link className="underline" to="/dev-os">Back to Home</Link></Empty>;
  const today = istDay(now);
  const upcomingRetention = Object.entries(profile.dims).flatMap(([d, s]) => (s.retention ?? []).map((r) => ({ dim: d, ...r }))).sort((a, b) => (a.due < b.due ? -1 : 1));
  const dueNow = dueRetention(profile.dims, today);
  const openTasks = tasks.filter((t) => ["assigned", "in_progress"].includes(t.state));
  return (
    <div className="space-y-4" data-test="path-view">
      <Section title="What your plan is working on" hint={`Updated ${new Date(profile.plan.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}>
        <ol className="space-y-2">
          {profile.plan.focus.map((d, i) => (
            <li key={d} className="flex gap-3 rounded-xl bg-muted/40 p-3">
              <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold grid place-items-center shrink-0">{i + 1}</span>
              <div><p className="font-medium text-sm">{dimensionName(d)}</p><p className="text-xs text-muted-foreground">{profile.plan.reasons[i]?.replace(`${dimensionName(d)}: `, "")}</p></div>
            </li>
          ))}
        </ol>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Coming up" hint="Your open tasks and their items.">
          {openTasks.length ? (
            <ul className="space-y-2">
              {openTasks.map((t) => (
                <li key={t.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2"><Link to={`/dev-os/play/${t.id}`} className="font-medium text-sm hover:underline">{t.title}</Link><Chip tone="muted"><CalendarClock className="h-3 w-3" /> {shortDay(istDay(t.dueAt))}, {timeLabel(t.dueAt)}</Chip></div>
                  {t.blueprint && <div className="flex flex-wrap gap-1 mt-2">{t.blueprint.map((s, i) => <span key={i} className="inline-flex items-center gap-1"><PurposeChip purpose={s.purpose} /><span className="text-xs">{dimensionName(s.dim)}</span></span>)}</div>}
                </li>
              ))}
            </ul>
          ) : <Note>Nothing open right now — your next quest arrives on the next working day.</Note>}
        </Section>
        <Section title="Retention checks" hint="Short checks days or weeks later, with fresh questions, to prove the learning lasted.">
          {upcomingRetention.length ? (
            <ul className="space-y-1.5 text-sm">
              {upcomingRetention.slice(0, 8).map((r, i) => (
                <li key={i} className="flex justify-between gap-2"><span>{dimensionName(r.dim as never)} · level {r.level}</span><Chip tone={r.due <= today ? "warn" : "muted"}>{r.due <= today ? "due now" : dayLabel(r.due)}</Chip></li>
              ))}
            </ul>
          ) : <Note>Pass items and they will be scheduled here ({policy.cadence.retentionDays.join(", ")} days later).</Note>}
          {dueNow.length > 0 && <p className="text-xs text-muted-foreground mt-2">{dueNow.length} due — they appear in your next quest.</p>}
        </Section>
      </div>

      {evaluation?.next && (
        <Section title={`On the way to ${rankLabel(policy, evaluation.next)}`} hint="Every gate must pass. XP never counts towards a rank." right={<Link to="/dev-os/rank" className="text-sm underline inline-flex items-center min-h-[24px]">Career</Link>}>
          <ul className="space-y-2">
            {evaluation.gates.map((g) => (
              <li key={g.id} className="flex gap-2 text-sm">
                {g.passed ? <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" /> : <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                <div><p className="font-medium">{g.label}</p><p className="text-xs text-muted-foreground">{g.detail}{!g.passed && g.todo ? ` — ${g.todo}` : ""}</p></div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="How your plan is chosen" hint="No guesswork and no generic 30-day plan — it changes as your evidence changes.">
        <div className="flex gap-3 text-sm text-muted-foreground"><Route className="h-5 w-5 text-primary shrink-0" />
          <p>Each day the system looks at every skill: how important it is for your track, how far it is from 100, how little evidence there is yet, how long since you practised it, and whether you recently missed items there. The top skills become today's focus; due retention checks come first; once a skill is going well it gets a <em>transfer check</em> — the same skill in a situation you have never practised. Items are aimed at the level you get right about 70% of the time: challenging, not crushing.</p>
        </div>
      </Section>
    </div>
  );
}
