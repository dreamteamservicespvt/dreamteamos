/**
 * The pictures of a social-media month (2026-10-03) — the timeline, the bars, the colours, the pace.
 *
 * ── Why pictures ──────────────────────────────────────────────────────────────────────────────
 * A leader with twenty clients does not read twenty sentences; they look for the red. So a month is
 * drawn the same way everywhere it appears: its dates as a bar with today on it and every post as a
 * dot on its day, and what it owes as one block per piece, coloured by how far that piece has got.
 * One file, so a colour means the same thing on the board, the card and the month's own page.
 */
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Clock, Hourglass, TrendingDown, TrendingUp } from "lucide-react";
import { daysBetween } from "@/utils/smmPlan";
import {
  SMM_TONE_LEGEND, cycleElapsed, cyclePhase, cycleTimeLabel, paceLabel, shortDayLabel, toneOf,
  type SmmPace, type SmmSegment, type SmmTone,
} from "@/utils/smmPackage";
import type { SmmContentItem, SmmCycle } from "@/types/smm";

/**
 * The fill for each tone. Kept beside the legend so the two cannot disagree.
 *
 * ── Why these colours (2026-10-04) ────────────────────────────────────────────────────────────
 * "Approved" used to be the brand orange — beside the amber of "with the client" and the red of
 * "late", three warm colours a leader had to tell apart at a glance, and the first two collapse into
 * one for a colour-blind reader. The stages are now one validated scale (index.css `--viz-*`):
 * green posted, two blues for the work moving along (approved deeper, being made lighter), amber
 * waiting on the client, grey not started, red late — the same on the dashboard's charts.
 */
export const TONE_BG: Record<SmmTone, string> = {
  done: "bg-viz-done",
  ready: "bg-viz-ready",
  wait: "bg-viz-wait",
  work: "bg-viz-work",
  idle: "bg-viz-idle",
  late: "bg-viz-late",
};

/** The same colours for SVG marks, which take a colour value rather than a class. */
export const TONE_RGB: Record<SmmTone, string> = {
  done: "rgb(var(--viz-done))",
  ready: "rgb(var(--viz-ready))",
  wait: "rgb(var(--viz-wait))",
  work: "rgb(var(--viz-work))",
  idle: "rgb(var(--viz-idle))",
  late: "rgb(var(--viz-late))",
};

/**
 * The same tones as soft chips — for anything that carries a title. The words stay in the text
 * colour: amber or light-blue text on a light card is unreadable, and the tint already says which.
 */
export const TONE_CHIP: Record<SmmTone, string> = {
  done: "bg-viz-done/15 text-foreground border-viz-done/40",
  ready: "bg-viz-ready/15 text-foreground border-viz-ready/40",
  wait: "bg-viz-wait/20 text-foreground border-viz-wait/50",
  work: "bg-viz-work/20 text-foreground border-viz-work/50",
  idle: "bg-muted text-muted-foreground border-border",
  late: "bg-viz-late/15 text-foreground border-viz-late/50",
};

/** Which tone wins when several pieces share a day: the one that needs somebody most. */
const URGENCY: Record<SmmTone, number> = { late: 5, idle: 4, work: 3, wait: 2, ready: 1, done: 0 };

/** The colours, named — under any bar or timeline that uses them. */
export function ToneLegend({ className = "" }: { className?: string }) {
  return (
    <div data-test="smm-tone-legend" className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground ${className}`}>
      {SMM_TONE_LEGEND.map(({ tone, label }) => (
        <span key={tone} className="inline-flex items-center gap-1">
          {/* Late is a diamond here as on the timeline, so the key matches the mark. */}
          <span className={`h-2 w-2 ${tone === "late" ? "rotate-45 rounded-[1px]" : "rounded-full"} ${TONE_BG[tone]}`} /> {label}
        </span>
      ))}
    </div>
  );
}

/**
 * One kind of content as a bar of blocks — one block per piece the month owes, furthest along on the
 * left. A promise the plan does not have a row for yet still gets an empty block: it is still owed.
 */
export function KindBar({ label, icon: Icon, segments, committed, posted, note, testId }: {
  label: string;
  icon?: LucideIcon;
  segments: SmmSegment[];
  committed: number;
  posted: number;
  /** Small text after the count — "48 sec each", "1 from Sep". */
  note?: string;
  testId?: string;
}) {
  const missing = Math.max(0, committed - segments.length);
  const blocks: { key: string; tone: SmmTone; title: string }[] = [
    ...segments.map((s) => ({ key: s.id, tone: s.tone, title: s.title })),
    ...Array.from({ length: missing }, (_, i) => ({ key: `missing-${i}`, tone: "idle" as SmmTone, title: "Not planned yet" })),
  ];
  return (
    <div data-test={testId} className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex min-w-0 items-center gap-1 truncate text-muted-foreground">
          {Icon && <Icon size={11} className="shrink-0" />} {label}
        </span>
        <span className="shrink-0 font-mono text-foreground">
          {posted}/{committed}
          {note ? <span className="ml-1 font-sans text-[10px] text-muted-foreground">{note}</span> : null}
        </span>
      </div>
      <div className="mt-1 flex h-2 gap-0.5" role="img" aria-label={`${label}: ${posted} of ${committed} posted`}>
        {blocks.length === 0
          ? <span className="h-2 flex-1 rounded-sm bg-muted" />
          : blocks.map((b) => (
            <span key={b.key} title={b.title} data-tone={b.tone} className={`h-2 min-w-[3px] flex-1 rounded-sm ${TONE_BG[b.tone]}`} />
          ))}
      </div>
    </div>
  );
}

/**
 * The month's dates as a bar: the part already gone shaded, today marked, and — when the items are
 * given — every dated post as a dot on its day, coloured by the most urgent piece due that day.
 */
export function MonthTimeline({ cycle, today, items, size = "sm", showLabels = true }: {
  cycle: SmmCycle;
  today: string;
  items?: SmmContentItem[];
  size?: "sm" | "lg";
  showLabels?: boolean;
}) {
  const span = Math.max(1, daysBetween(cycle.startDate, cycle.endDate));
  const at = (iso: string) => Math.max(0, Math.min(100, (daysBetween(cycle.startDate, iso) / span) * 100));
  const phase = cyclePhase(cycle, today);
  const gone = phase === "upcoming" ? 0 : cycleElapsed(cycle, today) * 100;

  const byDay = new Map<string, { tone: SmmTone; count: number; titles: string[] }>();
  for (const item of items || []) {
    if (!item.uploadDate || item.uploadDate < cycle.startDate || item.uploadDate > cycle.endDate) continue;
    const tone = toneOf(item, today);
    const cur = byDay.get(item.uploadDate);
    const title = item.title?.trim() || "Untitled";
    if (!cur) byDay.set(item.uploadDate, { tone, count: 1, titles: [title] });
    else {
      cur.count += 1;
      cur.titles.push(title);
      if (URGENCY[tone] > URGENCY[cur.tone]) cur.tone = tone;
    }
  }

  const barH = size === "lg" ? "h-3" : "h-2";
  const dot = size === "lg" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  return (
    <div data-test="smm-timeline" className="min-w-0">
      {/* The track has to read in both themes: `bg-muted` vanished against a dark card, and the dots
          for days still to come looked as if they floated past the end of the month. */}
      <div className={`relative ${barH} rounded-full bg-viz-axis/25`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/15" style={{ width: `${gone}%` }} />
        {[...byDay.entries()].map(([day, d]) => (
          <span
            key={day}
            data-test="smm-timeline-dot"
            data-tone={d.tone}
            title={`${shortDayLabel(day)} — ${d.titles.join(", ")}`}
            /* A late day is a diamond as well as red: red and green look alike to a colour-blind
               reader, and late beside posted is exactly the pair this bar has to tell apart. */
            className={`absolute top-1/2 ${dot} -translate-x-1/2 -translate-y-1/2 ring-2 ring-card ${
              d.tone === "late" ? "rotate-45 rounded-[2px]" : "rounded-full"
            } ${TONE_BG[d.tone]}`}
            style={{ left: `${at(day)}%` }}
          >
            {size === "lg" && d.count > 1 && (
              <span className={`absolute -right-2 -top-2.5 rounded-full bg-foreground px-1 text-[8px] font-bold leading-3 text-background ${
                d.tone === "late" ? "-rotate-45" : ""
              }`}>
                {d.count}
              </span>
            )}
          </span>
        ))}
        {phase === "running" && (
          <span
            data-test="smm-timeline-today"
            title="Today"
            className="absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 rounded bg-foreground"
            style={{ left: `${at(today)}%` }}
          />
        )}
      </div>
      {showLabels && (
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>{shortDayLabel(cycle.startDate)}</span>
          <span data-test="smm-timeline-left" className={`font-medium ${phase === "ended" ? "text-destructive" : "text-foreground"}`}>
            {cycleTimeLabel(cycle, today)}
          </span>
          <span>{shortDayLabel(cycle.endDate)}</span>
        </div>
      )}
    </div>
  );
}

/* The icon carries the colour and the words stay readable — an amber word on a light card is not. */
const PACE_STYLE: Record<SmmPace["state"], { cls: string; icon: string; Icon: LucideIcon }> = {
  done: { cls: "bg-viz-done/15", icon: "text-viz-done", Icon: CheckCircle2 },
  on_track: { cls: "bg-viz-done/10", icon: "text-viz-done", Icon: TrendingUp },
  behind: { cls: "bg-viz-wait/20", icon: "text-viz-wait", Icon: TrendingDown },
  upcoming: { cls: "bg-muted", icon: "text-muted-foreground", Icon: Hourglass },
  ended_short: { cls: "bg-viz-late/15", icon: "text-viz-late", Icon: AlertTriangle },
  nothing: { cls: "bg-muted", icon: "text-muted-foreground", Icon: Clock },
};

/** "On track" / "Behind by 2" / "All posted" — the one word a scanning eye wants. */
export function PaceChip({ pace }: { pace: SmmPace }) {
  const { cls, icon, Icon } = PACE_STYLE[pace.state];
  return (
    <span data-test="smm-pace" data-pace={pace.state}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-foreground ${cls}`}>
      <Icon size={11} className={icon} /> {paceLabel(pace)}
    </span>
  );
}
