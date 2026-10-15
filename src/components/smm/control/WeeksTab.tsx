/**
 * Weeks (SMM Delivery Control, 2026-10-15) — one row per client, worst first; the four columns are that client's
 * own weeks. Each cell: "2 + 2 · due Wed 21 Oct" and one mark per piece (✔ done · ◷ coming · ⚠ at risk · ✖ late
 * · ⏸ client), the current week ringed, extra work (⭐) in its week outside the count, a promised piece with no row
 * said in words. On a phone: one card per client with four week rows. On-hold months sit at the bottom with no
 * marks — no production alerts.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { dayWords, monthSentence, SMM_MARKS, weekCells, type SmmMonthView } from "@/utils/smmDeliveryView";
import { EmptyState, MarkBadge, MarkLegend, MARK_TONE } from "./kit";
import { useControl } from "./context";

function Cell({ mv, cell, onPick }: { mv: SmmMonthView; cell: ReturnType<typeof weekCells>[number]; onPick: (itemId: string) => void }) {
  return (
    <div data-test="smm-week-cell" data-current={cell.current || undefined}
      className={cn("min-w-0 rounded-xl border p-2", cell.current ? "border-primary ring-2 ring-primary/30" : "border-border")}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
        <span className="font-semibold text-foreground">W{cell.week.week} · {cell.counts}</span>
        <span className="text-muted-foreground">{cell.due}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {cell.marks.map((m) => (
          <button key={m.itemId} type="button" title={m.label} aria-label={m.label} onClick={() => onPick(m.itemId)}
            className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-1 text-xs font-semibold", MARK_TONE[m.mark])}>
            {m.extra ? "⭐" : SMM_MARKS[m.mark].glyph}
          </button>
        ))}
        {cell.missing > 0 && <span className="text-[11px] text-viz-late">+{cell.missing} promised, no row</span>}
        {!cell.marks.length && !cell.missing && <span className="text-[11px] text-muted-foreground">nothing</span>}
      </div>
      {cell.extras > 0 && <p className="mt-1 text-[11px] text-muted-foreground">⭐ {cell.extras} extra (not counted)</p>}
    </div>
  );
}

export default function WeeksTab() {
  const { board, openPiece, openMonth } = useControl();
  const rows = useMemo(() => board.months.filter((m) => !m.plan.exclusion || m.plan.exclusion === "on_hold"), [board.months]);
  const running = rows.filter((m) => !m.plan.exclusion && m.plan.weeks.length);
  const held = rows.filter((m) => m.plan.exclusion === "on_hold");
  const broken = rows.filter((m) => !m.plan.exclusion && !m.plan.weeks.length);
  const pick = (mv: SmmMonthView, itemId: string) => {
    const r = mv.rows.find((x) => x.task.itemId === itemId);
    if (r) openPiece(r, "details");
  };
  if (!rows.length) return <EmptyState testId="smm-weeks-empty">No running months to show.</EmptyState>;
  return (
    <div className="space-y-3" data-test="smm-weeks">
      <MarkLegend />
      {running.map((mv) => {
        const cells = weekCells(mv, board.today);
        return (
          <article key={mv.month.id} data-test="smm-weeks-row" className="rounded-2xl border border-border bg-card p-3">
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <button type="button" className="min-w-0 text-left" onClick={() => openMonth(mv.month.id)}>
                <span className="block truncate text-sm font-semibold text-foreground">{mv.plan.name}</span>
                <span className="block text-xs text-muted-foreground">{monthSentence(mv, board.today)}</span>
              </button>
              <span className="flex items-center gap-1.5 text-xs">
                {mv.late > 0 && <MarkBadge mark="late" className="h-5" />}
                {!mv.switchedOn && <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground">not switched on</span>}
              </span>
            </header>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {cells.map((c) => <Cell key={c.week.week} mv={mv} cell={c} onPick={(id) => pick(mv, id)} />)}
            </div>
          </article>
        );
      })}
      {broken.map((mv) => (
        <article key={mv.month.id} className="rounded-2xl border border-dashed border-border p-3 text-sm">
          <strong>{mv.plan.name}</strong> — <span className="text-muted-foreground">{monthSentence(mv, board.today)}</span>
        </article>
      ))}
      {held.length > 0 && (
        <section className="space-y-2" data-test="smm-weeks-on-hold">
          <h3 className="text-sm font-semibold text-muted-foreground">On hold — no alerts · {held.length}</h3>
          {held.map((mv) => (
            <button key={mv.month.id} type="button" onClick={() => openMonth(mv.month.id)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 p-3 text-left text-sm">
              <span className="min-w-0 truncate">{mv.plan.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">ended {dayWords(mv.plan.weeks[3]?.end || mv.month.cycle?.endDate)}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
