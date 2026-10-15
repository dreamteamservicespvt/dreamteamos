/**
 * Client plan (SMM Delivery Control, 2026-10-15) — one client's month as four weeks of tasks. A header (day x of y,
 * week n, the team and the salesperson, one sentence on how it stands); before it is switched on, the data health
 * check and **Switch on this month** (the tech admin / a team leader / the main admin — the one write Preview
 * allows: it saves the plan and the starting point, alerts still wait for Live); then weeks 1–4, each with its
 * deadline, its checkpoints in words per type and its pieces; then extra work, the client's pending work, what was
 * owed from last month and what moved out. Money, ads and the report stay on the classic month page (linked).
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, Power, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";
import { acceptPlanSuggestions, replanMonth, switchOnMonth } from "@/services/smmDelivery";
import { monthHealth } from "@/utils/smmDeliveryHealth";
import { sendDaysFor, workingDaysBefore, type SmmPlannedTask } from "@/utils/smmCadence";
import { switchOnProblem } from "@/utils/smmDeliveryActions";
import { dayOfMonth, dayWords, deadlineWords, monthSentence, hourWords, type SmmMonthView } from "@/utils/smmDeliveryView";
import { EmptyState, SectionTitle, TAP } from "./kit";
import { TaskRow } from "./TodayTab";
import { useControl } from "./context";
import type { SmmDeliverySettings } from "@/types/smmDelivery";

const AiTitlesPanel = lazy(() => import("./ai/AiTitlesPanel"));
const ClientUpdateDialog = lazy(() => import("./ai/ClientUpdateDialog"));

const HEALTH_TONE: Record<string, string> = {
  block: "border-viz-late/40 bg-viz-late/5 text-viz-late",
  warn: "border-viz-wait/50 bg-viz-wait/5 text-amber-800 dark:text-viz-wait",
  info: "border-border bg-muted/40 text-muted-foreground",
};

/** "Video: send by Sat 24 Oct · approved by Tue 27 · live by Wed 28, 7 PM" — the week's checkpoints per type. */
function checkpointLines(mv: SmmMonthView, week: number, settings: SmmDeliverySettings, holidays: ReadonlySet<string>): string[] {
  const w = mv.plan.weeks[week - 1];
  if (!w) return [];
  const cp = settings.checkpoints;
  const deadlineHour = settings.deadlineHour;
  const clips = Number(mv.month.clipsPerVideo) || 4;
  const kinds: [string, SmmPlannedTask["kind"]][] = [["Video", "ai_ad"], ["Poster", "poster"], ["Real video", "real_video"]];
  const lines: string[] = [];
  for (const [label, kind] of kinds) {
    if (!(mv.plan.targets[kind]?.[week - 1] > 0)) continue;
    const send = workingDaysBefore(w.deadlineDay, sendDaysFor({ kind, extra: false }, clips, cp), holidays);
    const approved = workingDaysBefore(w.deadlineDay, cp.approved, holidays);
    const footage = kind === "real_video" ? `footage by ${dayWords(workingDaysBefore(w.deadlineDay, cp.footage, holidays))} · ` : "";
    lines.push(`${label}: ${footage}send by ${dayWords(send < w.start ? w.start : send)} · approved by ${dayWords(approved < w.start ? w.start : approved)} · live by ${dayWords(w.deadlineDay)}, ${hourWords(deadlineHour)}`);
  }
  return lines;
}


export default function PlanTab({ monthId, onPickMonth }: { monthId: string | null; onPickMonth: (id: string) => void }) {
  const { board, data, user, live, manager } = useControl();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const months = useMemo(() => [...board.months].filter((m) => m.month.status === "active").sort((a, b) => a.plan.name.localeCompare(b.plan.name)), [board.months]);
  const mv = months.find((m) => m.month.id === monthId) || null;
  const health = useMemo(() => (mv ? monthHealth(mv.month as never, { today: board.today, holidays: data.holidaysLoaded ? data.holidays : null, users: data.users }) : null), [mv, board.today, data.holidays, data.holidaysLoaded, data.users]);

  if (!months.length) return <EmptyState testId="smm-plan-empty">No months to show.</EmptyState>;

  const picker = (
    <Select value={mv?.month.id || ""} onValueChange={onPickMonth}>
      <SelectTrigger className={cn("w-full sm:w-80", TAP)} data-test="smm-plan-picker"><SelectValue placeholder="Pick a client" /></SelectTrigger>
      <SelectContent>
        {months.map((m) => <SelectItem key={m.month.id} value={m.month.id}>{m.plan.name}{m.late ? ` · ${m.late} late` : ""}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  if (!mv) return <div className="space-y-3">{picker}<EmptyState>Pick a client to see their month as four weeks.</EmptyState></div>;

  const { plan, month } = mv;
  const team = month.team;
  const problem = switchOnProblem(month, plan, user);
  const ctx = { holidays: data.holidays, settings: data.settings };

  const doSwitchOn = async () => {
    const lateNow = mv.rows.filter((r) => r.mark === "late").length;
    const { confirmed: ok } = await confirm({
      title: `Switch on ${plan.name}?`,
      description: `Its plan is saved (each piece keeps the week shown here) and today becomes its starting point${lateNow ? ` — the ${lateNow} piece${lateNow === 1 ? "" : "s"} already late go to the Starting line and are never escalated` : ""}. ${live ? "Alerts run for it from now." : "Alerts wait until Delivery Control goes Live."}`,
      confirmText: "Switch on",
    });
    if (!ok) return;
    setBusy("on");
    try {
      const r = await switchOnMonth(month.id, ctx);
      toast({ title: r.already ? "It was already switched on" : `Switched on — ${r.planned} piece${r.planned === 1 ? "" : "s"} given a week` });
    } catch (e) {
      toast({ title: "Not switched on", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  const doReplan = async () => {
    const { confirmed: ok } = await confirm({ title: "Re-plan this month?", description: "Only the pieces the planner placed move to new weeks; weeks people chose, fixed dates and the team's own dates stay.", confirmText: "Re-plan" });
    if (!ok) return;
    setBusy("replan");
    try {
      const r = await replanMonth(month.id, ctx);
      toast({ title: `Re-planned — ${r.planned} piece${r.planned === 1 ? "" : "s"} placed` });
    } catch (e) {
      toast({ title: "Not re-planned", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const counted = mv.rows.filter((r) => r.task.counted);
  const extra = mv.rows.filter((r) => r.task.extra);
  const pending = mv.rows.filter((r) => r.progress.state === "pending_client");
  const carried = mv.rows.filter((r) => r.task.carried);
  const movedOut = mv.rows.filter((r) => plan.movedOut?.includes(r.task.itemId));
  const uncounted = mv.rows.filter((r) => r.progress.state === "uncounted" && !plan.movedOut?.includes(r.task.itemId));
  const canAcceptTitles = live && (manager || mv.rows.some((r) => r.mine));

  return (
    <div className="space-y-4" data-test="smm-plan">
      {ConfirmDialog}
      <div className="flex flex-wrap items-center gap-2">{picker}
        <Link to={`/smm/${month.id}`} className={cn("inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline", TAP)} data-test="smm-plan-classic">
          Classic month page <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <header className="rounded-2xl border border-border bg-card p-4" data-test="smm-plan-header">
        <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
        <p className="text-sm text-muted-foreground">
          {dayOfMonth(plan, board.today)}{mv.currentWeek ? ` · Week ${mv.currentWeek} of 4` : ""}
          {plan.weeks.length ? ` · ${dayWords(plan.weeks[0].start)} – ${dayWords(plan.weeks[3].end)}` : ""}
          {plan.firstMonth ? " · first month (no post before day 4)" : ""}
        </p>
        <p className="mt-1 text-sm text-foreground">{monthSentence(mv, board.today)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Makes: {team?.creator?.name || "nobody"} · Posts: {team?.publisher?.name || "nobody"} · Ads: {team?.marketer?.name || "nobody"} · Salesperson: {month.soldByName || "—"}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {mv.switchedOn ? (
            <span className="rounded-full border border-viz-done/40 bg-viz-done/10 px-2 py-1 font-medium text-viz-done">✔ Switched on — plan saved</span>
          ) : (
            <span className="rounded-full border border-dashed border-border px-2 py-1 text-muted-foreground" data-test="smm-plan-would-set">
              {live ? "Not switched on — supervised from when Delivery Control went Live; the weeks below are not saved yet" : "Preview — the weeks below would be set, not saved"}
            </span>
          )}
          {manager && !mv.switchedOn && (
            <Button size="sm" className={TAP} disabled={!!busy || !!problem} onClick={doSwitchOn} data-test="smm-plan-switch-on" title={problem || undefined}>
              {busy === "on" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Power className="mr-1 h-4 w-4" />} Switch on this month
            </Button>
          )}
          {manager && mv.switchedOn && live && (
            <Button size="sm" variant="outline" className={TAP} disabled={!!busy} onClick={doReplan}>
              {busy === "replan" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-1 h-4 w-4" />} Re-plan
            </Button>
          )}
          {(month.soldBy === user.uid || manager || user.role === "sales_admin") && (
            <Button size="sm" variant="outline" className={TAP} onClick={() => setUpdateOpen(true)} data-test="smm-plan-client-update">Client's weekly update</Button>
          )}
        </div>
        {manager && !mv.switchedOn && problem && <p className="mt-1 text-xs text-viz-late">{problem}</p>}
      </header>

      {!mv.switchedOn && health && health.findings.length > 0 && (
        <section className="space-y-2" data-test="smm-plan-health">
          <SectionTitle hint="Checked before switching on — nothing here is changed by it.">Data health check</SectionTitle>
          <ul className="space-y-1.5">
            {health.findings.map((f, i) => <li key={`${f.code}${i}`} className={cn("rounded-xl border px-3 py-2 text-sm", HEALTH_TONE[f.severity])}>{f.message}</li>)}
          </ul>
        </section>
      )}

      {plan.weeks.map((w) => {
        const rows = counted.filter((r) => r.task.week === w.week);
        const extraHere = extra.filter((r) => r.task.week === w.week);
        const missing = plan.missing.filter((m) => m.week === w.week).reduce((s, m) => s + m.count, 0);
        const current = mv.currentWeek === w.week;
        return (
          <section key={w.week} data-test="smm-plan-week" className={cn("space-y-2 rounded-2xl border p-3 sm:p-4", current ? "border-primary/60" : "border-border")}>
            <SectionTitle hint={`${dayWords(w.start)} – ${dayWords(w.end)} · deadline ${deadlineWords(w.deadlineDay, w.deadlineAt)}${current ? " · this week" : ""}`}>
              Week {w.week} · {rows.length} piece{rows.length === 1 ? "" : "s"}
            </SectionTitle>
            <ul className="text-xs text-muted-foreground">{checkpointLines(mv, w.week, data.settings, data.holidays).map((l) => <li key={l}>{l}</li>)}</ul>
            {rows.length ? <ul className="space-y-2">{rows.map((r) => <TaskRow key={r.key} row={r} />)}</ul> : <p className="text-sm text-muted-foreground">Nothing this week.</p>}
            {missing > 0 && <p className="text-xs text-viz-late">{missing} promised piece{missing === 1 ? " has" : "s have"} no row to work on — add {missing === 1 ? "it" : "them"} on the classic month page.</p>}
            {extraHere.length > 0 && <ul className="space-y-2">{extraHere.map((r) => <TaskRow key={r.key} row={r} />)}</ul>}
          </section>
        );
      })}

      {extra.filter((r) => !r.task.week).length > 0 && (
        <section className="space-y-2"><SectionTitle hint="Outside the count, on its own needed-by day.">Extra work</SectionTitle>
          <ul className="space-y-2">{extra.filter((r) => !r.task.week).map((r) => <TaskRow key={r.key} row={r} />)}</ul></section>
      )}
      {pending.length > 0 && (
        <section className="space-y-2"><SectionTitle hint="The client never sent the footage — this month's pending work, never counted against the team.">Client's pending work</SectionTitle>
          <ul className="space-y-2">{pending.map((r) => <TaskRow key={r.key} row={r} />)}</ul></section>
      )}
      {carried.length > 0 && (
        <section className="space-y-2"><SectionTitle hint="Owed from last month — first, in week 1.">Owed from last month</SectionTitle>
          <ul className="space-y-2">{carried.map((r) => <TaskRow key={r.key} row={r} />)}</ul></section>
      )}
      {movedOut.length > 0 && (
        <section className="space-y-2"><SectionTitle hint="A manager moved these out — carry them to the next month with the classic “Move them here”.">Moved out of this month</SectionTitle>
          <ul className="space-y-2">{movedOut.map((r) => <TaskRow key={r.key} row={r} />)}</ul></section>
      )}
      {uncounted.length > 0 && (
        <p className="text-xs text-muted-foreground">{uncounted.length} row{uncounted.length === 1 ? " is" : "s are"} beyond the promise — not counted, not chased.</p>
      )}
      {plan.bunched.length > 0 && (
        <p className="text-xs text-muted-foreground">Bunched (soft): {plan.bunched.map((b) => `${dayWords(b.day)} has ${b.count} posts`).join(", ")}.</p>
      )}

      <Suspense fallback={null}>
        <AiTitlesPanel month={month} plan={plan} today={board.today} canAccept={canAcceptTitles} preview={!live}
          onAccept={async (entries) => {
            const r = await acceptPlanSuggestions(month.id, entries, ctx);
            toast({ title: `${r.saved} title${r.saved === 1 ? "" : "s"} saved on the plan` });
          }} />
        {updateOpen && (
          <ClientUpdateDialog open={updateOpen} onOpenChange={setUpdateOpen} phone={month.clientPhone || null}
            input={{
              clientName: plan.name, week: mv.currentWeek || 1,
              live: mv.rows.filter((r) => r.progress.live && r.task.week === mv.currentWeek).map((r) => ({ title: r.title, type: r.task.type, links: Object.values(r.item.postUrls || {}).filter(Boolean) as string[] })),
              coming: mv.rows.filter((r) => !r.progress.live && r.task.counted && r.task.week === mv.currentWeek).map((r) => ({ title: r.title, type: r.task.type, day: r.task.postDay || r.task.suggestedDate })),
              waitingOnClient: mv.rows.filter((r) => r.progress.step === "approve" || r.progress.step === "footage").map((r) => ({ title: r.title, type: r.task.type, since: r.progress.sentAt ? new Date(r.progress.sentAt + 330 * 60_000).toISOString().slice(0, 10) : null })),
            }} />
        )}
      </Suspense>
    </div>
  );
}
