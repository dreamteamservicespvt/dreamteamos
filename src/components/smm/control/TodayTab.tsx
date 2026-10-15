/**
 * Today (SMM Delivery Control, 2026-10-15) — everybody lands here. One card per client-week ("Lakshmi Jewellers ·
 * Week 2 of 4 · deadline Wed 28 Oct, 7 PM · 2 days left · 0 of 2 live"), grouped worst first: Week ends today ·
 * Late (week ended) · Checkpoint missed · This week · Next week · Waiting on client · Extra work with no date ·
 * Done (collapsed). Each piece row: its type, its state in words, its next checkpoint, ONE main button, and ⋯
 * for Need more time / Blocked / Move / the classic month page.
 *
 * Per role (the plan's table): a member their own pieces with a "My week" brief on top; the Social Media Team Lead
 * everyone's, by client-week or by person (she acts on her own); the team leaders and admins "Needs you" first;
 * a salesperson the client's side of their months (approvals, footage, extras to bill, reports, renewals); the sales
 * admin what was escalated to them.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { requestApproval, setItemStatus } from "@/services/smm";
import { mayAnswerForPiece } from "@/utils/smmDeliveryActions";
import {
  isClientJob, reportDue, SMM_TODAY_GROUPS, sortRows, tileRows, todayCards, dayWords, type SmmTaskRow, type SmmTodayGroup, type SmmWeekCard, type SmmTile,
} from "@/utils/smmDeliveryView";
import { SMM_ALERT_LEVEL_RANK, type SmmAlert } from "@/utils/smmMonitor";
import { EmptyState, MarkBadge, SectionTitle, TAP } from "./kit";
import { useControl, type SmmPieceAction } from "./context";

const BriefCard = lazy(() => import("./ai/BriefCard"));
const MyCreditForecast = lazy(() => import("./CreditForecast"));

/** The one main button a row offers, by its step and who is looking. */
function mainAction(row: SmmTaskRow, canAct: boolean, isSeller: boolean, live: boolean): { label: string; action: SmmPieceAction | "start" | "sent" } {
  const { progress: p, item } = row;
  if (!live) return { label: "Details", action: "details" };
  if (p.live) {
    if (row.task.extra && isSeller && item.extraCharge !== "billed" && item.extraCharge !== "free") return { label: "Bill it", action: "details" };
    return { label: "Details", action: "details" };
  }
  if (!canAct && !isSeller) return { label: "Details", action: "details" };
  if (p.step === "footage") return isSeller || canAct ? { label: "Footage", action: "footage" } : { label: "Details", action: "details" };
  if (p.step === "approve") return { label: "Client's answer", action: "approval" };
  if (!canAct) return { label: "Details", action: "details" };
  if (p.state === "late") return { label: "Why late?", action: "late" };
  if (p.step === "make") return item.status === "planned" ? { label: "Start", action: "start" } : { label: "Sent to client", action: "sent" };
  if (p.step === "post") return { label: "Posted…", action: "posted" };
  return { label: "Details", action: "details" };
}

export function TaskRow({ row, showClient = false }: { row: SmmTaskRow; showClient?: boolean }) {
  const { user, live, openPiece, manager } = useControl();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const canAct = live && mayAnswerForPiece(row.month, row.item, user);
  const isSeller = row.month.soldBy === user.uid || user.role === "sales_admin";
  const main = mainAction(row, canAct, isSeller, live);
  const actor = { uid: user.uid, name: user.name, role: user.role };

  const press = async () => {
    if (main.action === "start" || main.action === "sent") {
      setBusy(true);
      try {
        if (main.action === "start") await setItemStatus(row.month.id, row.item.id, "in_progress", actor);
        else await requestApproval(row.month.id, row.item.id);
        toast({ title: main.action === "start" ? "Marked as being made" : "Marked as sent to the client" });
      } catch (e) {
        toast({ title: "Not saved", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
      } finally {
        setBusy(false);
      }
      return;
    }
    openPiece(row, main.action);
  };

  return (
    <li data-test="smm-task-row" data-item={row.task.itemId} data-mark={row.mark}
      className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center">
      <button type="button" onClick={() => openPiece(row, "details")} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
        <MarkBadge mark={row.mark} compact className="mt-0.5" />
        <span className="min-w-0">
          <span className="line-clamp-2 block break-words text-sm font-semibold text-foreground">
            <span className="mr-1.5 text-xs font-medium text-muted-foreground">{row.typeLabel}</span>
            {showClient ? `${row.plan.name} · ` : ""}{row.title}
          </span>
          <span className={cn("block text-xs", row.mark === "late" ? "text-viz-late" : row.mark === "risk" ? "text-amber-700 dark:text-viz-wait" : "text-muted-foreground")}>
            {row.state}{row.task.fixed ? ` · its own date ${dayWords(row.task.deadlineDay)}` : ""}
          </span>
          {row.next && <span className="block text-xs text-muted-foreground">{row.next}{row.ownerName ? ` · ${row.ownerName}` : ""}{row.nobody ? " · nobody owns it" : ""}</span>}
          {row.item.blocker && <span className="block text-xs text-amber-700 dark:text-viz-wait">⏸ Blocked — {row.item.blocker.byName}</span>}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
        <Button size="sm" className={TAP} variant={main.action === "details" ? "outline" : "default"} disabled={busy}
          data-test="smm-task-main" onClick={press}>{main.label}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className={cn("h-11 w-11 sm:h-9 sm:w-9")} aria-label="More" data-test="smm-task-more"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canAct && !row.progress.live && <DropdownMenuItem onSelect={() => openPiece(row, "more_time")}>Do it now / Need more time</DropdownMenuItem>}
            {(canAct || isSeller) && !row.progress.live && <DropdownMenuItem onSelect={() => openPiece(row, "blocked")}>Blocked</DropdownMenuItem>}
            {canAct && !row.progress.live && row.task.week && <DropdownMenuItem onSelect={() => openPiece(row, "move")}>Move</DropdownMenuItem>}
            {live && manager && !row.progress.live && <DropdownMenuItem onSelect={() => openPiece(row, "reassign")}>Reassign</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => openPiece(row, "details")}>Details and history</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to={`/smm/${row.month.id}`}>Open the classic month page</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function WeekCardView({ card }: { card: SmmWeekCard }) {
  const { openMonth } = useControl();
  return (
    <article data-test="smm-week-card" data-group={card.group} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <button type="button" onClick={() => openMonth(card.month.id)} className={cn("min-w-0 text-left", TAP)}>
          <span className="block truncate text-sm font-semibold text-foreground">{card.plan.name}{card.week ? ` · Week ${card.week.week} of 4` : ""}</span>
          <span className="block text-xs text-muted-foreground">{card.heading.split(" · ").slice(card.week ? 2 : 1).join(" · ")}</span>
        </button>
        {card.week && <span className={cn("text-xs font-semibold", card.live === card.total ? "text-viz-done" : "text-muted-foreground")}>{card.live} of {card.total} live</span>}
      </header>
      <ul className="space-y-2">{card.rows.map((r) => <TaskRow key={r.key} row={r} />)}</ul>
    </article>
  );
}

function NeedsYou({ alerts }: { alerts: SmmAlert[] }) {
  const { openMonth } = useControl();
  if (!alerts.length) return null;
  return (
    <section className="space-y-2" data-test="smm-needs-you">
      <SectionTitle hint="Raised for you by the supervisor, worst first.">Needs you · {alerts.length}</SectionTitle>
      <ul className="space-y-2">
        {alerts.map((a) => (
          <li key={a.key} className={cn("rounded-xl border p-3", SMM_ALERT_LEVEL_RANK[a.level] >= SMM_ALERT_LEVEL_RANK.red ? "border-viz-late/50 bg-viz-late/5" : "border-viz-wait/50 bg-viz-wait/5")}>
            <p className="text-sm font-semibold">{a.title}</p>
            <p className="text-sm text-muted-foreground">{a.message}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {!a.deliverNow && <span>{a.heldBecause === "preview" ? "Preview — you would get this" : `Held — ${a.heldBecause?.replace("_", " ")}`}</span>}
              {a.campaignId && <button type="button" className="font-medium text-primary hover:underline" onClick={() => openMonth(a.campaignId)}>Open the client plan</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Grouping = "week" | "person";

export default function TodayTab({ tile, tiles }: { tile: string | null; tiles: SmmTile[] }) {
  const { board, view, user, data } = useControl();
  const [grouping, setGrouping] = useState<Grouping>("week");
  const [showDone, setShowDone] = useState(false);
  const active = tiles.find((t) => t.key === tile);

  // The sales side's Today is the client's side; a tile shows ITS pieces as one flat list (below), so the count on the
  // tile is exactly what appears — week 4's footage and a live extra to bill included (browser check, 2026-10-15).
  const rowFilter = useMemo(() => (view === "salesperson" || view === "sales_admin" ? isClientJob : undefined), [view]);
  const tilePieces = useMemo(() => (active?.filter ? sortRows(tileRows(board).filter(active.filter)) : null), [board, active]);

  const cards = useMemo(() => todayCards(board, { rowFilter }), [board, rowFilter]);
  const needsYou = useMemo(() => board.myAlerts.filter((a) => a.level !== "watch" && a.level !== "notice"), [board.myAlerts]);
  const groups = SMM_TODAY_GROUPS.map((g) => ({ ...g, cards: cards.filter((c) => c.group === g.key) })).filter((g) => g.cards.length);

  const byPerson = useMemo(() => {
    if (grouping !== "person") return [];
    const map = new Map<string, { name: string; rows: SmmTaskRow[] }>();
    for (const c of cards) {
      if (c.group === "done") continue;
      for (const r of c.rows) {
        if (r.mark === "done") continue;
        const k = r.ownerUid || "_nobody";
        const e = map.get(k) || { name: r.ownerUid ? r.ownerName || "Someone" : "Nobody owns it", rows: [] };
        e.rows.push(r);
        map.set(k, e);
      }
    }
    return [...map.entries()].map(([uid, v]) => ({ uid, ...v })).sort((a, b) => (a.uid === user.uid ? -1 : b.uid === user.uid ? 1 : b.rows.length - a.rows.length));
  }, [grouping, cards, user.uid]);

  const reports = view === "salesperson" ? board.months.filter((m) => reportDue(m, board.today)) : [];
  const renewals = view === "salesperson" ? board.months.filter((m) => m.plan.exclusion === "on_hold") : [];
  const myWeek = view === "member" || view === "lead";

  return (
    <div className="space-y-4" data-test="smm-today">
      {myWeek && (
        <Suspense fallback={null}>
          <BriefCard kind="week" input={{
            uid: user.uid, name: user.name, today: board.today,
            tasks: board.rows.filter((r) => r.mine && r.mark !== "done" && r.progress.state !== "uncounted" && r.progress.state !== "not_due").map((r) => ({
              clientName: r.plan.name, type: r.task.type, title: r.title, deadlineDay: r.task.deadlineDay, state: r.progress.state,
              nextStep: r.progress.step, nextDay: r.progress.nextCheckpoint?.day || null,
            })),
          }} />
        </Suspense>
      )}

      {/* Everyone else's morning brief (phase 5): the numbers are the tiles' own, the AI only words them. */}
      {!myWeek && (
        <Suspense fallback={null}>
          <BriefCard kind="morning" input={{
            uid: user.uid, name: user.name, role: user.role, today: board.today,
            numbers: Object.fromEntries(tiles.map((t) => [t.label, t.count])),
            top: board.rows.filter((r) => r.mark === "late").slice(0, 3).map((r) => `${r.plan.name}: ${r.title} (${r.ownerName || "nobody"})`),
          }} />
        </Suspense>
      )}

      {/* Phase 7: what this week's AI videos will cost in Flow credits, against what the maker holds. */}
      {myWeek && <Suspense fallback={null}><MyCreditForecast /></Suspense>}

      {(view === "admin" || view === "team_leader" || view === "sales_admin") && (!active || active.key === "needs_you" || active.key === "escalated") && <NeedsYou alerts={active?.key === "escalated" ? needsYou.filter((a) => a.audience === "sales_admin") : needsYou} />}
      {active && (active.key === "needs_you" || active.key === "escalated") && !needsYou.length && <EmptyState testId="smm-today-empty">Nothing needs you right now.</EmptyState>}

      {(view === "lead" || view === "team_leader" || view === "admin") && (
        <div className="flex flex-wrap items-center gap-2 text-xs" role="radiogroup" aria-label="Group by">
          <span className="text-muted-foreground">Show by</span>
          {(["week", "person"] as Grouping[]).map((g) => (
            <button key={g} type="button" role="radio" aria-checked={grouping === g} onClick={() => setGrouping(g)}
              className={cn("rounded-full border px-3 py-1", TAP, grouping === g ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
              {g === "week" ? "Client-week" : "Person"}
            </button>
          ))}
          {view === "lead" && <span className="text-muted-foreground">You answer only for your own pieces.</span>}
        </div>
      )}

      {active && <p className="text-sm text-muted-foreground">Showing: <strong className="text-foreground">{active.label}</strong>.</p>}

      {active ? (
        tilePieces ? (
          tilePieces.length
            ? <ul className="space-y-2" data-test="smm-today-tile-list">{tilePieces.map((r) => <TaskRow key={r.key} row={r} showClient />)}</ul>
            : <EmptyState testId="smm-today-empty">Nothing here right now.</EmptyState>
        ) : null
      ) : grouping === "person" ? (
        byPerson.length ? byPerson.map((p) => (
          <section key={p.uid} className="space-y-2">
            <SectionTitle>{p.uid === user.uid ? "You" : p.name} · {p.rows.length}</SectionTitle>
            <ul className="space-y-2">{p.rows.map((r) => <TaskRow key={r.key} row={r} showClient />)}</ul>
          </section>
        )) : <EmptyState testId="smm-today-empty">Nothing open — every piece is live or not due yet.</EmptyState>
      ) : groups.length ? (
        groups.map((g) => g.key === "done" ? (
          <section key={g.key} className="space-y-2">
            <button type="button" onClick={() => setShowDone((s) => !s)} className={cn("flex items-center gap-1 text-sm font-semibold text-muted-foreground", TAP)} aria-expanded={showDone}>
              <ChevronDown className={cn("h-4 w-4 transition-transform", showDone ? "rotate-0" : "-rotate-90")} /> Done · {g.cards.length}
            </button>
            {showDone && <div className="grid gap-3 lg:grid-cols-2">{g.cards.map((c) => <WeekCardView key={c.key} card={c} />)}</div>}
          </section>
        ) : (
          <section key={g.key} className="space-y-2" data-test={`smm-today-group-${g.key}`}>
            <SectionTitle hint={g.hint}>{g.label} · {g.cards.length}</SectionTitle>
            <div className="grid gap-3 lg:grid-cols-2">{g.cards.map((c) => <WeekCardView key={c.key} card={c} />)}</div>
          </section>
        ))
      ) : (
        <EmptyState testId="smm-today-empty">
          {data.monthsLoaded ? (view === "salesperson" ? "Nothing waiting on your clients right now." : view === "member" ? "Nothing on your plate this week and next." : "Nothing open this week and next.") : "Loading…"}
        </EmptyState>
      )}

      {reports.length > 0 && (!active || active.key === "reports") && (
        <section className="space-y-2" data-test="smm-today-reports">
          <SectionTitle hint="The month's last week: send the monthly report and talk about the renewal.">Reports due · {reports.length}</SectionTitle>
          <ul className="space-y-1.5">{reports.map((m) => (
            <li key={m.month.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
              <span className="min-w-0 truncate">{m.plan.name}</span>
              <Link to={`/smm/${m.month.id}?tab=report`} className={cn("shrink-0 font-medium text-primary hover:underline", TAP, "inline-flex items-center")}>Open the report</Link>
            </li>
          ))}</ul>
        </section>
      )}
      {renewals.length > 0 && !active && (
        <section className="space-y-2" data-test="smm-today-renewals">
          <SectionTitle hint="Ended without a decision — no production alerts until you renew.">On hold — renewal · {renewals.length}</SectionTitle>
          <ul className="space-y-1.5">{renewals.map((m) => (
            <li key={m.month.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
              <span className="min-w-0 truncate">{m.plan.name}</span>
              <Link to={`/smm/${m.month.id}`} className={cn("shrink-0 font-medium text-primary hover:underline", TAP, "inline-flex items-center")}>Renew from the month page</Link>
            </li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
