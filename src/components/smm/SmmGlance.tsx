/**
 * One month at a glance (2026-10-04) — the picture every client card, and the month's own page, draws.
 *
 * ── Designed to be read, not decoded ──────────────────────────────────────────────────────────
 * Top to bottom it answers the questions in the order people ask them:
 *   1. Is it fine?          a status in everyday words, its colour, and the reason in one sentence;
 *   2. How much is done?    one ring — the promised posts, posted in green — with "6/16 posted" in the
 *                           middle and every other part of the ring named with its count beside it;
 *   3. Of what?             each kind (videos, posters, real videos) as its own short bar;
 *   4. How long is left?    the month's dates and the days left;
 *   5. What is next?        the next post, and when.
 * Three colours carry meaning everywhere — green fine, amber watch it, red act now — and the words
 * are always in the text colour, so nothing depends on telling colours apart.
 */
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, Archive, CalendarClock, CalendarDays, CheckCircle2, CircleCheckBig, Hourglass, MinusCircle,
  PauseCircle, TrendingDown, UserPlus,
} from "lucide-react";
import { shortDayLabel } from "@/utils/smmPackage";
import {
  SMM_BUCKETS, type SmmBucket, type SmmGlance, type SmmGlanceStatus, type SmmGlanceTone,
} from "@/utils/smmGlance";

export const BUCKET_COLOR: Record<SmmBucket, string> = {
  posted: "rgb(var(--viz-done))",
  progress: "rgb(var(--viz-ready))",
  waiting: "rgb(var(--viz-wait))",
  late: "rgb(var(--viz-late))",
  notStarted: "rgb(var(--viz-idle))",
};

/** The stripe across the top of a card, and the status pill's tint. */
export const TONE_STYLE: Record<SmmGlanceTone, { stripe: string; pill: string; icon: string }> = {
  good: { stripe: "bg-viz-done", pill: "bg-viz-done/15", icon: "text-viz-done" },
  warn: { stripe: "bg-viz-wait", pill: "bg-viz-wait/20", icon: "text-viz-wait" },
  bad: { stripe: "bg-viz-late", pill: "bg-viz-late/15", icon: "text-viz-late" },
  idle: { stripe: "bg-viz-axis/40", pill: "bg-muted", icon: "text-muted-foreground" },
};

const STATUS_ICON: Record<SmmGlanceStatus, LucideIcon> = {
  on_track: CheckCircle2,
  done: CircleCheckBig,
  at_risk: TrendingDown,
  off_track: AlertTriangle,
  not_started: Hourglass,
  setup: UserPlus,
  history: Archive,
  nothing: MinusCircle,
  on_hold: PauseCircle,
};

export function StatusPill({ glance, size = "md" }: { glance: SmmGlance; size?: "md" | "lg" }) {
  const Icon = STATUS_ICON[glance.status];
  const tone = TONE_STYLE[glance.tone];
  return (
    <span data-test="smm-status" data-status={glance.status}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold text-foreground ${tone.pill} ${
        size === "lg" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
      }`}>
      <Icon size={size === "lg" ? 15 : 13} className={tone.icon} /> {glance.label}
    </span>
  );
}

/** The ring: every promised post, coloured by where it is, with the posted count in the middle. */
export function StatusRing({ glance, size = 112, stroke = 12 }: { glance: SmmGlance; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const parts = SMM_BUCKETS.filter((b) => glance.buckets[b.key] > 0);
  const gap = parts.length > 1 ? 3 : 0;
  let offset = 0;
  const label = glance.total === 0
    ? "Nothing promised this month"
    : `${glance.posted} of ${glance.total} posted. ${SMM_BUCKETS.map((b) => `${glance.buckets[b.key]} ${b.label.toLowerCase()}`).join(", ")}.`;
  return (
    <div data-test="smm-ring" className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--viz-axis) / 0.18)" strokeWidth={stroke} />
        {glance.total > 0 && parts.map((b) => {
          const len = (glance.buckets[b.key] / glance.total) * c;
          const dash = Math.max(0.75, len - gap);
          const el = (
            <circle key={b.key} data-bucket={b.key} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={BUCKET_COLOR[b.key]} strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {glance.total > 0 ? (
          <>
            <span data-test="smm-ring-count" className="text-[22px] font-semibold leading-none tracking-tight text-foreground">
              {glance.posted}<span className="text-[15px] font-medium text-muted-foreground">/{glance.total}</span>
            </span>
            <span className="mt-1 text-[11px] text-muted-foreground">{glance.status === "done" ? "all posted" : "posted"}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No posts</span>
        )}
      </div>
    </div>
  );
}

/** What each part of the ring is, with its count — the ring's key, and its table. */
export function RingLegend({ glance }: { glance: SmmGlance }) {
  return (
    <ul data-test="smm-ring-legend" className="min-w-0 flex-1 space-y-1.5">
      {SMM_BUCKETS.map((b) => {
        const n = glance.buckets[b.key];
        return (
          <li key={b.key} title={b.hint} className={`flex items-center gap-2 text-[13px] ${n === 0 ? "opacity-40" : ""}`}>
            <span className={`h-2.5 w-2.5 shrink-0 ${b.key === "late" ? "rotate-45 rounded-[2px]" : "rounded-full"}`}
              style={{ background: BUCKET_COLOR[b.key] }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{b.label}</span>
            <span data-test={`smm-bucket-${b.key}`} className="font-semibold tabular-nums text-foreground">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** One short bar per kind the month owes: posted of promised. */
export function KindBars({ glance }: { glance: SmmGlance }) {
  if (glance.kinds.length === 0) return null;
  return (
    <div data-test="smm-kind-bars" className="space-y-2">
      {glance.kinds.map((k) => (
        <div key={k.kind} data-test={`smm-kind-row-${k.kind}`} className="grid grid-cols-[5.25rem_minmax(0,1fr)_2.75rem] items-center gap-3 text-xs">
          <span className="truncate text-muted-foreground">{k.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-viz-done/15">
            <span className="block h-full rounded-full bg-viz-done" style={{ width: `${k.total ? Math.min(100, (k.posted / k.total) * 100) : 0}%` }} />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">
            <b className="font-semibold text-foreground">{k.posted}</b>/{k.total}
          </span>
        </div>
      ))}
      {glance.extra > 0 && (
        <p className="text-[11px] text-muted-foreground">+ {glance.extra} extra piece{glance.extra === 1 ? "" : "s"} beyond the package</p>
      )}
    </div>
  );
}

/** The month's dates, the days left, and how much of the month has gone. */
export function TimeBar({ glance }: { glance: SmmGlance }) {
  const gone = Math.round(glance.monthGone * 100);
  return (
    <div data-test="smm-time">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
          <CalendarDays size={13} className="shrink-0" /> {shortDayLabel(glance.startDate)} – {shortDayLabel(glance.endDate)}
        </span>
        <span data-test="smm-time-left" className="shrink-0 font-medium text-foreground">{glance.timeLabel}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-viz-axis/20" role="img" aria-label={`${gone}% of the month has gone`}>
        <div className="h-full rounded-full bg-foreground/35" style={{ width: `${gone}%` }} />
      </div>
    </div>
  );
}

export function NextPost({ glance }: { glance: SmmGlance }) {
  if (!glance.next) return null;
  const { title, dayLabel, timeLabel } = glance.next;
  return (
    <div data-test="smm-next-post" className="flex min-w-0 items-center gap-2 rounded-xl bg-foreground/[0.05] px-3 py-2 text-xs">
      <CalendarClock size={14} className="shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">Next post</span>
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{title}</span>
      <span className="shrink-0 text-muted-foreground">{dayLabel}{timeLabel ? `, ${timeLabel}` : ""}</span>
    </div>
  );
}

/**
 * The whole glance. `card`: one column, for the board. `wide`: the ring beside the details, for the
 * month's own page.
 */
export function MonthGlance({ glance, layout = "card" }: { glance: SmmGlance; layout?: "card" | "wide" }) {
  if (layout === "wide") {
    return (
      <div data-test="smm-glance" className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex items-center gap-5">
          <StatusRing glance={glance} size={124} stroke={13} />
          {/* Kept narrow, so each count sits right beside its words instead of across the page. */}
          <div className="flex min-w-0 max-w-[15rem] flex-1"><RingLegend glance={glance} /></div>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-4">
          <KindBars glance={glance} />
          <TimeBar glance={glance} />
          <NextPost glance={glance} />
        </div>
      </div>
    );
  }
  return (
    <div data-test="smm-glance" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-4">
        <StatusRing glance={glance} />
        <RingLegend glance={glance} />
      </div>
      <KindBars glance={glance} />
      <TimeBar glance={glance} />
      <NextPost glance={glance} />
    </div>
  );
}
