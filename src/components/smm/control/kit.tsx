/**
 * SMM Delivery Control — the small shared pieces of its screens (2026-10-15, phase 2): the five marks, the tone
 * colours, the count tiles, a section heading and the empty / error states.
 *
 * ── The look (owner, `dts-owner-ui-preference`) ─────────────────────────────────────────────────
 * The app's normal shadcn / Tailwind, the classic board's `--viz-*` stage colours (`viz-done`, `viz-late` …,
 * validated in light and dark), and every status as MARK + WORD + colour — late is red AND ✖ AND "Late", so a
 * colour-blind reader loses nothing. Buttons are at least 44px tall on phones.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SMM_MARKS, type SmmMark, type SmmTile } from "@/utils/smmDeliveryView";

export const MARK_TONE: Record<SmmMark, string> = {
  done: "bg-viz-done/15 text-viz-done border-viz-done/30",
  coming: "bg-muted text-muted-foreground border-border",
  risk: "bg-viz-wait/15 text-amber-700 dark:text-viz-wait border-viz-wait/40",
  late: "bg-viz-late/15 text-viz-late border-viz-late/40",
  client: "bg-viz-ready/15 text-viz-ready border-viz-ready/30",
};

/** ✖ Late — a mark with its word, in its colour. `compact` shows the glyph with the word for screen readers only. */
export function MarkBadge({ mark, compact = false, className }: { mark: SmmMark; compact?: boolean; className?: string }) {
  const m = SMM_MARKS[mark];
  return (
    <span
      data-mark={mark}
      title={m.word}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold leading-none",
        compact ? "h-6 w-6 justify-center text-xs" : "h-6 px-2 text-xs",
        MARK_TONE[mark],
        className,
      )}
    >
      <span aria-hidden>{m.glyph}</span>
      {compact ? <span className="sr-only">{m.word}</span> : <span>{m.word}</span>}
    </span>
  );
}

/** The legend: every mark with its word (the Weeks tab and the plan). */
export function MarkLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-xs text-muted-foreground", className)} data-test="smm-control-legend">
      {(Object.keys(SMM_MARKS) as SmmMark[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1">
          <MarkBadge mark={k} compact /> {SMM_MARKS[k].word === "Client" ? "Waiting on the client" : SMM_MARKS[k].word}
        </span>
      ))}
    </div>
  );
}

const TILE_TONE: Record<SmmTile["tone"], string> = {
  late: "text-viz-late",
  risk: "text-amber-700 dark:text-viz-wait",
  client: "text-viz-ready",
  neutral: "text-foreground",
  done: "text-viz-done",
};

/** The count tiles that filter Today (2 × 2 on phones). */
export function Tiles({ tiles, active, onPick }: { tiles: SmmTile[]; active: string | null; onPick: (key: string | null) => void }) {
  return (
    <div data-test="smm-control-tiles" className="grid grid-cols-2 gap-2 sm:[grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
      {tiles.map((t, i) => {
        const on = active === t.key;
        const wide = i === 0 && tiles.length % 2 === 1;
        return (
          <button
            key={t.key}
            type="button"
            data-test={`smm-control-tile-${t.key}`}
            aria-pressed={on}
            onClick={() => onPick(on ? null : t.key)}
            className={cn(
              "flex min-h-[4.5rem] flex-col items-start justify-between rounded-2xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-muted/60",
              wide && "col-span-2 sm:col-span-1",
              on ? "border-primary ring-2 ring-primary/30" : "border-border",
            )}
          >
            <span className={cn("text-2xl font-bold tabular-nums leading-none", t.count ? TILE_TONE[t.tone] : "text-muted-foreground")}>{t.count}</span>
            <span className="mt-1 text-xs font-medium text-muted-foreground">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SectionTitle({ children, hint, right }: { children: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{children}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div data-test={testId} className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** A part that could not be drawn — the rest of the page and the classic view still work. */
export function PartError({ what }: { what: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-viz-late/40 bg-viz-late/10 px-4 py-3 text-sm text-viz-late">
      ✖ {what} couldn't load — the classic view still works.
    </div>
  );
}

/** A phone-safe button size (44px tall below 640px). */
export const TAP = "min-h-[44px] sm:min-h-[36px]";
