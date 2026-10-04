/**
 * The work itself (2026-10-04): where every promised piece has got to, and the posting calendar.
 *
 * ── Why the calendar is stacked by stage ──────────────────────────────────────────────────────
 * A column per day of what was planned that day. Behind today the question is "did each day's posts
 * go up" — green if they did, red if they did not. Ahead of today it is "is the coming work ready",
 * and that is the column worth seeing a day early: tomorrow's three posts as two approved and one
 * still with the client is a phone call today instead of an apology tomorrow. Same colours as every
 * other screen of the section, so the board, the cards and this read as one thing.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import {
  ChartTip, LegendKey, TableToggle, TipRow, VizCard, VizTable, axisDay, columnPath, niceScale, rectPath, tipDay, useWidth,
} from "@/components/smm/dashboard/chartKit";
import { TONE_BG, TONE_RGB } from "@/components/smm/SmmVisuals";
import { SMM_TONE_LEGEND, type SmmTone } from "@/utils/smmPackage";
import {
  SMM_SCHEDULE_STACK, relativeDay, type SmmScheduleDay, type SmmStageBreakdown, type SmmStageKey,
} from "@/utils/smmDashboard";

const STAGE_BG: Record<SmmStageKey, string> = {
  ...TONE_BG,
  // Owed and nothing exists yet: an outline, so "not planned" is a stage you can see, not a gap.
  unplanned: "bg-transparent ring-1 ring-inset ring-viz-axis",
};

const TONE_LABEL: Record<SmmTone, string> = Object.fromEntries(SMM_TONE_LEGEND.map((t) => [t.tone, t.label])) as Record<SmmTone, string>;

/* ── The pipeline ───────────────────────────────────────────────────────────────────────────── */

export function StagePipeline({ breakdown, className = "" }: { breakdown: SmmStageBreakdown; className?: string }) {
  const [hover, setHover] = useState<SmmStageKey | null>(null);
  const { slices, total, undated } = breakdown;
  const drawn = slices.filter((s) => s.count > 0);
  const posted = slices.find((s) => s.key === "done")?.count || 0;

  return (
    <VizCard
      testId="smm-dash-stages"
      className={className}
      title="Where every promised piece is"
      subtitle={total > 0 ? `${total} piece${total === 1 ? "" : "s"} promised · ${posted} posted` : "Nothing promised yet"}
    >
      <div
        className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[5px]"
        role="img"
        aria-label={drawn.map((s) => `${s.label} ${s.count}`).join(", ") || "Nothing promised"}
      >
        {drawn.length === 0 && <div className="h-full w-full bg-muted" />}
        {drawn.map((s) => (
          <div
            key={s.key}
            data-test={`smm-stage-seg-${s.key}`}
            onPointerEnter={() => setHover(s.key)}
            onPointerLeave={() => setHover(null)}
            className={`h-full min-w-[3px] transition-opacity duration-150 ${STAGE_BG[s.key]} ${hover && hover !== s.key ? "opacity-30" : ""}`}
            style={{ flexGrow: s.count, flexBasis: 0 }}
          />
        ))}
      </div>

      {/* The legend is the table: every stage, its count and its share — hover one to find it in the bar. */}
      <ul data-test="smm-stage-legend" className="mt-4">
        {slices.map((s) => (
          <li
            key={s.key}
            onPointerEnter={() => s.count && setHover(s.key)}
            onPointerLeave={() => setHover(null)}
            className={`flex items-center gap-2 border-b border-border/60 py-2 text-xs transition-opacity ${s.count === 0 ? "opacity-45" : ""} ${hover && hover !== s.key ? "opacity-50" : ""}`}
          >
            <span className={`h-2.5 w-2.5 shrink-0 ${s.key === "late" ? "rotate-45 rounded-[1px]" : "rounded-[3px]"} ${STAGE_BG[s.key]}`} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
            <span data-test={`smm-stage-count-${s.key}`} className="font-semibold tabular-nums text-foreground">{s.count}</span>
            <span className="w-9 text-right tabular-nums text-muted-foreground">{s.percent}%</span>
          </li>
        ))}
      </ul>

      {undated > 0 && (
        <p data-test="smm-stage-undated" className="mt-3 text-xs text-muted-foreground">
          <b className="font-semibold text-foreground">{undated}</b> piece{undated === 1 ? " has" : "s have"} no date yet — {undated === 1 ? "it" : "they"} can't go late, and can't go up.
        </p>
      )}
    </VizCard>
  );
}

/* ── The posting calendar ───────────────────────────────────────────────────────────────────── */

/** "Tomorrow: 3 to post — 2 approved, 1 with the client." The line that makes the chart worth opening. */
function tomorrowLine(days: SmmScheduleDay[]): string {
  const i = days.findIndex((d) => d.isToday);
  const t = i >= 0 ? days[i + 1] : undefined;
  if (!t) return "";
  if (t.total === 0) return "Nothing planned for tomorrow.";
  const c = t.counts;
  const parts = [
    c.done ? `${c.done} already posted` : "",
    c.ready ? `${c.ready} approved` : "",
    c.wait ? `${c.wait} with the client` : "",
    c.work ? `${c.work} being made` : "",
    c.idle ? `${c.idle} not started` : "",
  ].filter(Boolean);
  return `Tomorrow: ${t.total} to post${parts.length ? ` — ${parts.join(", ")}` : ""}.`;
}

export function PostingCalendar({ days, className = "", title = "Posting calendar", lead }: {
  days: SmmScheduleDay[];
  className?: string;
  title?: string;
  /** What the run of days is — defaults to the dashboard's two weeks either side of today. */
  lead?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [table, setTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  const height = 212;
  const m = { top: 12, right: 6, bottom: 30, left: 28 };
  const pw = Math.max(60, width - m.left - m.right);
  const ph = height - m.top - m.bottom;

  // On a phone, fewer days — always keeping today in view, a little more ahead than behind.
  const shown = useMemo(() => {
    const maxN = Math.max(10, Math.floor(pw / 13));
    if (days.length <= maxN) return days;
    const todayIdx = Math.max(0, days.findIndex((d) => d.isToday));
    const start = Math.max(0, Math.min(days.length - maxN, todayIdx - Math.floor(maxN * 0.42)));
    return days.slice(start, start + maxN);
  }, [days, pw]);

  const n = shown.length;
  const slot = pw / Math.max(1, n);
  const colW = Math.min(22, Math.max(4, slot * 0.62));
  const { top, ticks } = niceScale(Math.max(0, ...shown.map((d) => d.total)), 3);
  const sy = (v: number) => m.top + ph - (v / top) * ph;
  const slotX = (i: number) => m.left + i * slot;
  const todayAt = shown.findIndex((d) => d.isToday);
  const gap = 2;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setActive((a) => Math.min(n - 1, a === null ? Math.max(0, todayAt) : a + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setActive((a) => Math.max(0, a === null ? Math.max(0, todayAt) : a - 1)); }
    else if (e.key === "Escape") setActive(null);
  };

  const act = active !== null ? shown[active] : null;
  const anything = days.some((d) => d.total > 0);

  return (
    <VizCard
      testId="smm-dash-calendar"
      className={className}
      title={title}
      subtitle={<>{lead ?? "Every dated piece on the day it is planned for — two weeks back, two ahead."}{" "}
        <span data-test="smm-dash-tomorrow" className="font-medium text-foreground">{tomorrowLine(days)}</span></>}
      action={<TableToggle on={table} onToggle={() => setTable((t) => !t)} testId="smm-calendar-table-toggle" />}
    >
      {table ? (
        <VizTable
          testId="smm-calendar-table"
          head={["Day", "Posted", "Approved", "With client", "Being made", "Planned", "Late"]}
          rows={days.filter((d) => d.total > 0).map((d) => [
            `${tipDay(d.day)}${d.isToday ? " (today)" : ""}`,
            d.counts.done, d.counts.ready, d.counts.wait, d.counts.work, d.counts.idle, d.counts.late,
          ].map(String))}
        />
      ) : (
        <>
          <div
            ref={ref}
            className="relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
            role="group"
            aria-label="Posting calendar. Use the left and right arrow keys to read each day."
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
          >
            <svg width={width} height={height} className="block select-none" onPointerLeave={() => setActive(null)}>
              {/* Today is a line, not a band: a grey band read as one more grey ("Planned") column. */}
              {todayAt >= 0 && (
                <line x1={slotX(todayAt) + slot / 2} x2={slotX(todayAt) + slot / 2} y1={m.top - 4} y2={sy(0)}
                  stroke="hsl(var(--foreground))" strokeOpacity={0.45} strokeWidth={1} />
              )}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={m.left} x2={m.left + pw} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? "rgb(var(--viz-axis))" : "rgb(var(--viz-grid))"} strokeWidth={1} />
                  <text x={m.left - 7} y={sy(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px]">{t}</text>
                </g>
              ))}
              {shown.map((d, i) => {
                const x = slotX(i) + (slot - colW) / 2;
                const tones = SMM_SCHEDULE_STACK.filter((t) => d.counts[t] > 0);
                let cursor = sy(0);
                const segs = tones.map((tone, k) => {
                  const h = (d.counts[tone] / top) * ph;
                  const yTop = cursor - h;
                  const bottom = k === 0 ? cursor : cursor - gap;
                  cursor = yTop;
                  const isTop = k === tones.length - 1;
                  const segH = Math.max(1, bottom - yTop);
                  return (
                    <path key={tone} data-tone={tone}
                      d={isTop ? columnPath(x, yTop, colW, segH, Math.min(4, colW / 2)) : rectPath(x, yTop, colW, segH)}
                      fill={TONE_RGB[tone]} />
                  );
                });
                const weekly = todayAt >= 0 ? (i - todayAt) % 7 === 0 : i % 7 === 0;
                return (
                  <g key={d.day} data-test="smm-calendar-col" data-day={d.day} opacity={active !== null && active !== i ? 0.45 : 1}>
                    {segs}
                    {(weekly || d.isToday) && (
                      <text x={slotX(i) + slot / 2} y={height - 10} textAnchor="middle"
                        className={d.isToday ? "fill-foreground text-[10px] font-semibold" : "fill-muted-foreground text-[10px]"}>
                        {d.isToday ? "Today" : axisDay(d.day)}
                      </text>
                    )}
                    {/* The hit area is the whole day, not the painted column. */}
                    <rect x={slotX(i)} y={m.top} width={slot} height={ph} fill="transparent"
                      onPointerEnter={() => setActive(i)} />
                  </g>
                );
              })}
            </svg>

            {act && (
              <ChartTip x={slotX(active!) + slot / 2} y={m.top} width={width} side>
                <p className="mb-1 font-semibold text-foreground">
                  {tipDay(act.day)} <span className="font-normal text-muted-foreground">· {relativeDay(daysFrom(days, act))}</span>
                </p>
                {act.total === 0 ? (
                  <p className="text-muted-foreground">Nothing planned.</p>
                ) : (
                  <>
                    {[...SMM_SCHEDULE_STACK].reverse().filter((t) => act.counts[t] > 0).map((t) => (
                      <TipRow key={t} color={TONE_RGB[t]} value={act.counts[t]} label={TONE_LABEL[t]} diamond={t === "late"} />
                    ))}
                    <div className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
                      {act.items.slice(0, 4).map((it, k) => (
                        <p key={k} className="truncate text-[11px] text-muted-foreground">
                          <span className="text-foreground">{it.business}</span> · {it.title}
                        </p>
                      ))}
                      {act.items.length > 4 && <p className="text-[11px] text-muted-foreground">+{act.items.length - 4} more</p>}
                    </div>
                  </>
                )}
              </ChartTip>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {SMM_TONE_LEGEND.map(({ tone, label }) => (
              <LegendKey key={tone} color={TONE_RGB[tone]} label={label} shape="bar" />
            ))}
          </div>
          {!anything && <p className="mt-2 text-xs text-muted-foreground">No piece has a date in these days yet.</p>}
        </>
      )}
    </VizCard>
  );
}

/** Days from today to this day, for the tooltip's "Tomorrow" / "In 3 days". */
function daysFrom(days: SmmScheduleDay[], d: SmmScheduleDay): number {
  const t = days.findIndex((x) => x.isToday);
  const i = days.indexOf(d);
  return t >= 0 && i >= 0 ? i - t : 0;
}
