/**
 * Two of Delivery Control's tabs (2026-10-15):
 *
 * **Starting line** — pieces that were already late when their month was switched on (or, in Preview, that would
 * be: switching on today). They NEVER escalate (the plan's pre-mortem: "lateness that already exists never
 * escalates"); a manager plans a catch-up week (this week or up to two ahead, inside the month) or keeps it as that
 * month's pending work. The Social Media Team Lead sees it; the team leaders and admins act.
 *
 * **Alerts log** — one line per alert the supervisor raises now (in Preview: who WOULD get what — "Ravi would
 * get …") and per answer people recorded, newest first; a sentence on top: client delays vs team delays. No charts.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { decideStartingLine } from "@/services/smmDelivery";
import { catchUpWeeks } from "@/utils/smmDeliveryActions";
import { alertLog, dayWords, delaySummary, startingLineRows, timeWords, TASK_TYPE_WORDS } from "@/utils/smmDeliveryView";
import { istDay } from "@/utils/smmCadence";
import type { SmmPlanWeek } from "@/types/smmDelivery";
import { EmptyState, SectionTitle, TAP } from "./kit";
import { useControl } from "./context";

const ReasonsSummary = lazy(() => import("./ai/ReasonsSummary"));

export function StartingLineTab() {
  const { board, data, manager, live, openPiece } = useControl();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const rows = useMemo(() => startingLineRows(board), [board]);
  if (!rows.length) return <EmptyState testId="smm-start-empty">Nothing on the Starting line — no piece was already late when its month was switched on.</EmptyState>;
  const decide = async (campaignId: string, itemId: string, input: Parameters<typeof decideStartingLine>[2], ok: string) => {
    setBusy(itemId);
    try {
      await decideStartingLine(campaignId, itemId, input, { holidays: data.holidays, settings: data.settings });
      toast({ title: ok });
    } catch (e) {
      toast({ title: "Not saved", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3" data-test="smm-start">
      <SectionTitle hint={live ? "Already late when their month was switched on — never escalated. Plan a catch-up, or keep it as that month's pending work." : "Preview: what switching on today would put here. Nothing is saved."}>
        Starting line · {rows.length}
      </SectionTitle>
      <ul className="space-y-2">
        {rows.map((e) => {
          const weeks = e.row ? catchUpWeeks(e.row.plan, board.today) : [];
          return (
            <li key={`${e.campaignId}:${e.itemId}`} data-test="smm-start-row" className="space-y-2 rounded-xl border border-border bg-card p-3">
              <button type="button" className="block w-full text-left" onClick={() => e.row && openPiece(e.row, "details")}>
                <span className="block text-sm font-semibold">{TASK_TYPE_WORDS[e.type].icon} {e.clientName} · {e.row?.title || e.title || TASK_TYPE_WORDS[e.type].noun}</span>
                <span className="block text-xs text-muted-foreground">Week {e.week ?? "—"} · was due {dayWords(e.deadlineDay)}</span>
              </button>
              {manager && live && e.row && (
                <div className="flex flex-wrap gap-2">
                  {weeks.map((w) => (
                    <Button key={w} size="sm" variant="outline" className={TAP} disabled={busy === e.itemId}
                      onClick={() => decide(e.campaignId, e.itemId, { decision: "catch_up", toWeek: w as SmmPlanWeek }, `Catch-up planned in week ${w}`)}>
                      Catch up in week {w}
                    </Button>
                  ))}
                  <Button size="sm" variant="outline" className={TAP} disabled={busy === e.itemId}
                    onClick={() => decide(e.campaignId, e.itemId, { decision: "pending" }, "Kept as this month's pending work")}>
                    Keep as pending work
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AlertsLogTab() {
  const { board, view, user } = useControl();
  const lines = useMemo(() => alertLog(board, {
    onlyUid: view === "member" || view === "salesperson" ? user.uid : undefined,
    salesSide: view === "sales_admin",
  }), [board, view, user.uid]);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? lines : lines.slice(0, 60);
  // The week's reasons, for the AI's short summary (phase 5): every "why not done" given in the last 7 days.
  const reasons = useMemo(() => {
    const since = board.now - 7 * 86_400_000;
    const out: { clientName: string; type: string; step: string; reason: string; note?: string | null; byName: string }[] = [];
    for (const r of board.rows) {
      if (view === "member" && !r.mine) continue;
      for (const lr of r.item.lateReasons || []) {
        if (typeof lr.at === "number" && lr.at >= since) out.push({ clientName: r.plan.name, type: r.task.type, step: lr.step, reason: lr.reason, note: lr.note ?? null, byName: lr.byName });
      }
    }
    return out;
  }, [board.rows, board.now, view]);
  return (
    <div className="space-y-3" data-test="smm-log">
      <p className="rounded-xl border border-border bg-card px-3 py-2 text-sm" data-test="smm-log-summary">{delaySummary(board)}</p>
      {reasons.length > 0 && <Suspense fallback={null}><ReasonsSummary label="The last 7 days" reasons={reasons} /></Suspense>}
      {!lines.length ? <EmptyState testId="smm-log-empty">No alerts and no answers yet.</EmptyState> : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {shown.map((l, i) => (
            <li key={i} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:gap-3" data-test={`smm-log-${l.kind}`}>
              <span className="shrink-0 text-xs text-muted-foreground sm:w-28">{l.kind === "alert" ? "Now" : `${dayWords(istDay(l.at))}, ${timeWords(l.at)}`}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{l.type} · {l.clientName || "—"}</span>{" "}
                <span className="text-muted-foreground">{l.kind === "alert" ? `${l.person} — ${l.text}` : `${l.person}: ${l.text.replace(/^[^:]+: /, "")}`}</span>
              </span>
              <span className={cn("shrink-0 text-xs", l.kind === "alert" ? (l.status === "Shown now" ? "text-viz-late" : "text-muted-foreground") : l.solvedAt ? "text-viz-done" : "text-muted-foreground")}>
                {l.kind === "alert" ? `${l.level} · ${l.status}` : l.solvedAt ? `solved ${dayWords(istDay(l.solvedAt))}` : "open"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {lines.length > 60 && !showAll && <Button variant="outline" className={TAP} onClick={() => setShowAll(true)}>Show all {lines.length}</Button>}
    </div>
  );
}
