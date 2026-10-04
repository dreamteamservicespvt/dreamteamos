/**
 * Who is behind — drawn two ways (2026-10-04).
 *
 * ── The pace matrix ───────────────────────────────────────────────────────────────────────────
 * Every client is a dot: across, how much of their month has gone; up, how much of what they were
 * promised is posted. The diagonal is even pace — the month's posts spread over its days — so a dot
 * above it is ahead and a dot below it is behind, and the further below, the further behind. Twenty
 * clients become one picture in which the ones to chase are simply the low dots on the right. The
 * colour is the month's own pace (smmPackage.paceOf), so a dot a hair under the line that is still
 * within a piece of its calendar stays green; late work is a red diamond, because red and green are
 * the pair a colour-blind reader cannot separate and the shape still can.
 *
 * ── The list ──────────────────────────────────────────────────────────────────────────────────
 * The same clients, worst first, each as a bullet: posted as a bar, where it should be by today as a
 * tick, and the shortfall between them tinted. It is also the matrix's table — every dot readable
 * without hovering.
 */
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Hourglass, TrendingDown } from "lucide-react";
import {
  ChartTip, LegendKey, PaceBullet, TableToggle, VizCard, VizTable, useWidth,
} from "@/components/smm/dashboard/chartKit";
import type { SmmHealth, SmmPacePoint } from "@/utils/smmDashboard";

export const HEALTH_COLOR: Record<SmmHealth, string> = {
  good: "rgb(var(--viz-done))",
  warn: "rgb(var(--viz-wait))",
  bad: "rgb(var(--viz-late))",
  idle: "rgb(var(--viz-axis))",
};

const HEALTH_STYLE: Record<SmmHealth, { chip: string; icon: string; Icon: LucideIcon }> = {
  good: { chip: "bg-viz-done/15", icon: "text-viz-done", Icon: CheckCircle2 },
  warn: { chip: "bg-viz-wait/20", icon: "text-viz-wait", Icon: TrendingDown },
  bad: { chip: "bg-viz-late/15", icon: "text-viz-late", Icon: AlertTriangle },
  idle: { chip: "bg-muted", icon: "text-muted-foreground", Icon: Hourglass },
};

/** What a client's state is, in two or three words. */
export function healthLabel(p: SmmPacePoint): string {
  switch (p.health) {
    case "bad": return p.late > 0 ? `${p.late} late` : `${p.behindBy} not posted`;
    case "warn": return `Behind by ${p.behindBy}`;
    case "good": return p.pace.state === "done" ? "All posted" : "On pace";
    default: return p.committed === 0 ? "Nothing promised" : "Not started";
  }
}

export function HealthChip({ point }: { point: SmmPacePoint }) {
  const { chip, icon, Icon } = HEALTH_STYLE[point.health];
  return (
    <span data-test="smm-health" data-health={point.health}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground ${chip}`}>
      <Icon size={12} className={icon} /> {healthLabel(point)}
    </span>
  );
}

/* ── The matrix ─────────────────────────────────────────────────────────────────────────────── */

interface Placed { p: SmmPacePoint; x: number; y: number }

/**
 * Dots on the same spot are spread round it in a small ring, so three new months that all sit at
 * "nothing gone, nothing posted" read as three dots, not one.
 */
function spread(list: Placed[], bounds: { x0: number; x1: number; y0: number; y1: number }): Placed[] {
  const groups = new Map<string, Placed[]>();
  for (const d of list) {
    const key = `${Math.round(d.x / 9)}:${Math.round(d.y / 9)}`;
    groups.set(key, [...(groups.get(key) || []), d]);
  }
  const out: Placed[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]); continue; }
    const cx = g.reduce((n, d) => n + d.x, 0) / g.length;
    const cy = g.reduce((n, d) => n + d.y, 0) / g.length;
    g.forEach((d, i) => {
      const ring = i < 6 ? 0 : 1;
      const inRing = ring === 0 ? Math.min(6, g.length) : g.length - 6;
      const idx = ring === 0 ? i : i - 6;
      const r = ring === 0 ? 8 : 16;
      const a = (idx / inRing) * Math.PI * 2 - Math.PI / 2;
      out.push({
        p: d.p,
        x: Math.max(bounds.x0, Math.min(bounds.x1, cx + Math.cos(a) * r)),
        y: Math.max(bounds.y0, Math.min(bounds.y1, cy + Math.sin(a) * r)),
      });
    });
  }
  return out;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Mark({ d, active }: { d: Placed; active: boolean }) {
  const { health } = d.p;
  const s = active ? 1.35 : 1;
  if (health === "bad") {
    const h = 6.5 * s;
    return (
      <path data-test="smm-pace-dot" data-health={health}
        d={`M${d.x},${d.y - h}L${d.x + h},${d.y}L${d.x},${d.y + h}L${d.x - h},${d.y}Z`}
        fill={HEALTH_COLOR.bad} stroke="hsl(var(--card))" strokeWidth={2} strokeLinejoin="round" />
    );
  }
  if (health === "idle") {
    return <circle data-test="smm-pace-dot" data-health={health} cx={d.x} cy={d.y} r={4.5 * s}
      fill="hsl(var(--card))" stroke={HEALTH_COLOR.idle} strokeWidth={1.75} />;
  }
  return <circle data-test="smm-pace-dot" data-health={health} cx={d.x} cy={d.y} r={5 * s}
    fill={HEALTH_COLOR[health]} stroke="hsl(var(--card))" strokeWidth={2} />;
}

export function PaceMatrix({ points, onOpen, className = "" }: {
  points: SmmPacePoint[];
  onOpen: (id: string) => void;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [table, setTable] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const height = width < 420 ? 236 : 272;
  const m = { top: 18, right: 14, bottom: 30, left: 36 };
  const pw = Math.max(80, width - m.left - m.right);
  const ph = height - m.top - m.bottom;
  const sx = (v: number) => m.left + v * pw;
  const sy = (v: number) => m.top + (1 - v) * ph;

  const placed = useMemo(
    () => spread(points.map((p) => ({ p, x: sx(p.elapsed), y: sy(p.delivered) })), {
      x0: m.left + 6, x1: m.left + pw - 6, y0: m.top + 6, y1: m.top + ph - 6,
    }),
    [points, width], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Keyboard order: left to right, low to high.
  const order = useMemo(() => [...placed].sort((a, b) => a.x - b.x || b.y - a.y), [placed]);
  const activeDot = placed.find((d) => d.p.id === active) || null;

  /*
    Names on the worst few only — a name on every dot is noise nobody reads. Placed beside the dot,
    flipped to the left near the right edge, skipped where it would land on a name already drawn.
  */
  const labels = useMemo(() => {
    const worst = placed
      .filter((d) => d.p.health === "bad" || d.p.health === "warn")
      .sort((a, b) => (a.p.health === b.p.health ? b.p.behindBy + b.p.late - (a.p.behindBy + a.p.late) : a.p.health === "bad" ? -1 : 1))
      .slice(0, 3);
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const out: { id: string; x: number; y: number; anchor: "start" | "end"; text: string }[] = [];
    for (const d of worst) {
      const text = d.p.name.length > 18 ? `${d.p.name.slice(0, 17)}…` : d.p.name;
      const w = text.length * 6.2;
      const right = d.x + 10 + w < m.left + pw;
      const x = right ? d.x + 10 : d.x - 10;
      const box = { x0: right ? x : x - w, x1: right ? x + w : x, y0: d.y - 12, y1: d.y + 4 };
      if (boxes.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
      boxes.push(box);
      out.push({ id: d.p.id, x, y: d.y + 4, anchor: right ? "start" : "end", text });
    }
    return out;
  }, [placed, pw]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearest = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: Placed | null = null;
    let bestD = 28 * 28;
    for (const d of placed) {
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!order.length) return;
    const i = order.findIndex((d) => d.p.id === active);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setActive(order[(i + 1) % order.length].p.id);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(order[(i - 1 + order.length) % order.length].p.id);
    } else if (e.key === "Enter" && active) {
      onOpen(active);
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  const counts = {
    good: points.filter((p) => p.health === "good").length,
    warn: points.filter((p) => p.health === "warn").length,
    bad: points.filter((p) => p.health === "bad").length,
    idle: points.filter((p) => p.health === "idle").length,
  };
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <VizCard
      testId="smm-dash-pace-matrix"
      className={className}
      title="Pace of every client"
      subtitle="Across: how much of the month has gone. Up: how much is posted. Below the line is behind."
      action={<TableToggle on={table} onToggle={() => setTable((t) => !t)} testId="smm-pace-table-toggle" />}
    >
      {table ? (
        <VizTable
          testId="smm-pace-table"
          head={["Client", "Month gone", "Posted", "Due by today", "Status"]}
          rows={points.map((p) => [p.name, pct(p.elapsed), `${p.posted}/${p.committed}`, String(p.expected), healthLabel(p)])}
        />
      ) : (
        <>
          <div
            ref={ref}
            className="relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
            role="group"
            aria-label={`Pace of ${points.length} clients: ${counts.good} on pace, ${counts.warn} behind, ${counts.bad} with late work, ${counts.idle} not started. Use the arrow keys to read each client, Enter to open.`}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
          >
            <svg
              width={width}
              height={height}
              className="block cursor-crosshair select-none"
              onPointerMove={(e) => setActive(nearest(e)?.p.id ?? null)}
              onPointerLeave={() => setActive(null)}
              onClick={(e) => { const d = nearest(e as unknown as PointerEvent<SVGSVGElement>); if (d) onOpen(d.p.id); }}
            >
              {/* Behind-pace half, barely tinted — the dots carry the verdict, this only says where "behind" lives. */}
              <path d={`M${sx(0)},${sy(0)}L${sx(1)},${sy(0)}L${sx(1)},${sy(1)}Z`} fill="rgb(var(--viz-wait))" opacity={0.07} />
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={sx(0)} x2={sx(1)} y1={sy(t)} y2={sy(t)} stroke="rgb(var(--viz-grid))" strokeWidth={1} />
                  <line x1={sx(t)} x2={sx(t)} y1={sy(0)} y2={sy(1)} stroke="rgb(var(--viz-grid))" strokeWidth={1} />
                  <text x={m.left - 8} y={sy(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px]">{pct(t)}</text>
                  <text x={sx(t)} y={sy(0) + 16} textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">{pct(t)}</text>
                </g>
              ))}
              <line x1={sx(0)} x2={sx(1)} y1={sy(0)} y2={sy(0)} stroke="rgb(var(--viz-axis))" strokeWidth={1} />
              {/* Even pace. */}
              <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="hsl(var(--foreground))" strokeOpacity={0.4} strokeWidth={1.5} strokeLinecap="round" />
              <text x={sx(0) + 6} y={sy(1) + 12} className="fill-muted-foreground text-[10px]">Ahead</text>
              <text x={sx(1) - 6} y={sy(0) - 8} textAnchor="end" className="fill-muted-foreground text-[10px]">Behind</text>
              <text x={sx(1)} y={height - 2} textAnchor="end" className="fill-muted-foreground text-[10px] font-medium">Month gone →</text>
              <text x={4} y={10} className="fill-muted-foreground text-[10px] font-medium">↑ Posted</text>

              {activeDot && (
                <g pointerEvents="none">
                  <line x1={activeDot.x} x2={activeDot.x} y1={activeDot.y} y2={sy(0)} stroke="hsl(var(--foreground))" strokeOpacity={0.25} />
                  <line x1={sx(0)} x2={activeDot.x} y1={activeDot.y} y2={activeDot.y} stroke="hsl(var(--foreground))" strokeOpacity={0.25} />
                </g>
              )}
              {/* Healthy first, so a late diamond is never hidden under a green dot. */}
              {[...placed]
                .sort((a, b) => ({ good: 0, idle: 1, warn: 2, bad: 3 }[a.p.health] - { good: 0, idle: 1, warn: 2, bad: 3 }[b.p.health]))
                .map((d) => <Mark key={d.p.id} d={d} active={d.p.id === active} />)}
              {labels.map((l) => (
                <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor} pointerEvents="none"
                  className="fill-foreground text-[11px] font-medium" style={{ paintOrder: "stroke", stroke: "hsl(var(--card))", strokeWidth: 3 }}>
                  {l.text}
                </text>
              ))}
            </svg>

            {activeDot && (
              <ChartTip x={activeDot.x} y={activeDot.y} width={width} below={activeDot.y < 110}>
                <p className="mb-1 truncate font-semibold text-foreground">{activeDot.p.name}</p>
                <p className="text-muted-foreground">
                  <b className="font-semibold text-foreground">{activeDot.p.posted}</b> of {activeDot.p.committed} posted ·{" "}
                  <b className="font-semibold text-foreground">{activeDot.p.expected}</b> due by today
                </p>
                <p className="text-muted-foreground">{activeDot.p.timeLabel}{activeDot.p.waiting ? ` · ${activeDot.p.waiting} with the client` : ""}</p>
                <div className="mt-1.5"><HealthChip point={activeDot.p} /></div>
              </ChartTip>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <LegendKey color={HEALTH_COLOR.good} label={`On pace · ${counts.good}`} />
            <LegendKey color={HEALTH_COLOR.warn} label={`Behind pace · ${counts.warn}`} />
            <LegendKey color={HEALTH_COLOR.bad} label={`Late work · ${counts.bad}`} shape="diamond" />
            {counts.idle > 0 && <LegendKey color={HEALTH_COLOR.idle} label={`Not started · ${counts.idle}`} hollow />}
            <LegendKey color="hsl(var(--foreground) / 0.5)" label="Even pace" shape="line" />
          </div>
        </>
      )}
    </VizCard>
  );
}

/* ── The list ───────────────────────────────────────────────────────────────────────────────── */

function Bullet({ p }: { p: SmmPacePoint }) {
  return (
    <PaceBullet posted={p.posted} expected={p.expected} committed={p.committed}
      severity={p.health === "bad" ? "bad" : "warn"} tick={p.health !== "idle"} />
  );
}

export function ClientPaceList({ points, className = "", initial = 6 }: {
  /** Already in the order to show — worst first. */
  points: SmmPacePoint[];
  className?: string;
  initial?: number;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? points : points.slice(0, initial);
  return (
    <VizCard
      testId="smm-dash-client-list"
      className={className}
      title="Clients, worst first"
      subtitle={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Bar: posted</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-0.5 rounded-full bg-foreground" /> due by today</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-viz-wait/50" /> shortfall</span>
      </span>}
    >
      <ul className="-mx-2 divide-y divide-border/70">
        {shown.map((p) => (
          <li key={p.id}>
            <Link to={`/smm/${p.id}`} data-test="smm-dash-client-row"
              /* A fixed last column, so every row's bullet starts and ends at the same place. */
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/50 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_7.5rem]">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-foreground">{p.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {p.packageLabel ? `${p.packageLabel} · ` : ""}{p.timeLabel}
                </span>
              </span>
              <span className="col-span-2 row-start-2 flex min-w-0 items-center gap-2.5 sm:col-span-1 sm:row-start-auto">
                <Bullet p={p} />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  <b className="font-semibold text-foreground">{p.posted}</b>/{p.committed}
                </span>
              </span>
              <span className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">
                <HealthChip point={p} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {points.length > initial && (
        <button type="button" onClick={() => setAll((v) => !v)} data-test="smm-dash-client-more"
          className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <ChevronDown size={14} className={all ? "rotate-180" : ""} /> {all ? "Show fewer" : `Show all ${points.length}`}
        </button>
      )}
      {points.length === 0 && (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Clock size={15} /> No months running.</p>
      )}
    </VizCard>
  );
}
