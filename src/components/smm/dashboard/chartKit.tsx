/**
 * The parts every chart on the Social Media dashboard is built from (2026-10-04).
 *
 * ── Why hand-drawn SVG and not the chart library ──────────────────────────────────────────────
 * Recharts is in the bundle for the older dashboards, but every chart here needs something it does
 * not do well: bars that round only at the data end and stack with a 2px gap, a matrix whose dots
 * sit on a pace diagonal and spread apart when they overlap, a calendar whose columns stack by stage,
 * a tooltip that also opens on the keyboard. Each of those is a few lines of SVG, measured to the
 * pixel the card actually has, and the look is the same in every chart because they share these.
 *
 * The rules they follow (one family of marks, so the page reads as one system): thin marks, a 4px
 * rounded data end that is square at the baseline, hairline solid grids, words in the text colours
 * and never in a data colour, a legend whenever two things are coloured, a table behind every chart.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";

/** The width the element actually has — charts are drawn to it rather than scaled to fit. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.round(w));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A dashboard card: a title that says what is drawn, a subtitle that says what it covers. */
export function VizCard({ title, subtitle, action, children, className = "", testId }: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section data-test={testId} className={`min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** Chart ⇄ table. Every value a chart draws can be read without hovering — here. */
export function TableToggle({ on, onToggle, testId }: { on: boolean; onToggle: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      data-test={testId}
      title={on ? "Show the chart" : "Show as a table"}
      aria-label={on ? "Show the chart" : "Show as a table"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {on ? <BarChart3 size={15} /> : <Table2 size={15} />}
    </button>
  );
}

/** The accessible twin of a chart — plain rows, numbers aligned. */
export function VizTable({ head, rows, testId }: { head: string[]; rows: ReactNode[][]; testId?: string }) {
  return (
    <div data-test={testId} className="max-h-80 overflow-auto rounded-xl border border-border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/60 last:border-0">
              {r.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2 text-foreground ${ci > 0 ? "text-right tabular-nums" : "max-w-[14rem] truncate"}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The hover card. Placed over the chart at (x, y), kept inside its width, never catching the pointer.
 * The value leads and the label follows — the reader already knows which mark they pointed at.
 */
export function ChartTip({ x, y, width, children, below = false, side = false }: {
  x: number;
  y: number;
  width: number;
  children: ReactNode;
  below?: boolean;
  /** Beside the point instead of over it, top-aligned at `y` — for a column, so the column stays in view. */
  side?: boolean;
}) {
  const half = 104;
  const style = side
    ? (x < width * 0.6
      ? { left: x + 14, top: y, transform: "none" }
      : { left: x - 14, top: y, transform: "translateX(-100%)" })
    : {
      left: Math.max(half, Math.min(width - half, x)),
      top: y,
      transform: below ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 12px))",
    };
  return (
    <div
      role="tooltip"
      data-test="smm-chart-tip"
      className="pointer-events-none absolute z-20 w-max max-w-[208px] rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-lg backdrop-blur-sm"
      style={style}
    >
      {children}
    </div>
  );
}

/** One line of a tooltip: a short stroke of the mark's colour, the number, then what it is. */
export function TipRow({ color, value, label, diamond = false }: { color: string; value: ReactNode; label: string; diamond?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {diamond
        ? <span className="h-2 w-2 shrink-0 rotate-45 rounded-[1px]" style={{ background: color }} />
        : <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      <span className="truncate text-muted-foreground">{label}</span>
    </div>
  );
}

/** A legend key: the mark's shape in its colour, the words in the text colour. */
export function LegendKey({ color, label, shape = "dot", hollow = false }: {
  color: string;
  label: string;
  shape?: "dot" | "diamond" | "bar" | "line";
  hollow?: boolean;
}) {
  const style = hollow ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { background: color };
  const cls = shape === "diamond" ? "h-2 w-2 rotate-45 rounded-[1px]"
    : shape === "bar" ? "h-2.5 w-2.5 rounded-[3px]"
    : shape === "line" ? "h-0.5 w-3.5 rounded-full"
    : "h-2.5 w-2.5 rounded-full";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className={`shrink-0 ${cls}`} style={style} /> {label}
    </span>
  );
}

/**
 * A clean top for a count axis: 0, step, 2·step… with three or four lines, whole numbers only.
 * The top is never below the largest value, and never 0 (an empty chart still has a scale).
 */
export function niceScale(max: number, lines = 3): { top: number; step: number; ticks: number[] } {
  const m = Math.max(0, max);
  /*
    Small counts keep a scale of at least `lines`: a month with one post a day would otherwise get a
    top of 1, and every column would be a full-height block.
  */
  if (m <= lines) return { top: lines, step: 1, ticks: Array.from({ length: lines + 1 }, (_, i) => i) };
  const raw = m / lines;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  const step = Math.max(1, Math.ceil(nice * pow));
  const top = step * Math.ceil(m / step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return { top, step, ticks };
}

/** A column: 4px round at the data end, square where it stands on the baseline. */
export function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** A plain rectangle — the inner segments of a stack, which have no data end. */
export function rectPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0 || w <= 0) return "";
  return `M${x},${y}h${w}v${h}h${-w}Z`;
}

/**
 * The small trend in a tile: a 2px line in the quiet ink, a faint wash under it, and the latest
 * point marked — the one number the reader is comparing against the rest.
 */
export function Sparkline({ values, height = 36, label, testId }: { values: number[]; height?: number; label: string; testId?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(160);
  const n = values.length;
  const max = Math.max(1, ...values);
  const pad = 4;
  const w = Math.max(40, width);
  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i * (w - pad * 2)) / (n - 1));
  const y = (v: number) => pad + (1 - v / max) * (height - pad * 2);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = n > 1 ? `${line}L${x(n - 1).toFixed(1)},${height - pad}L${x(0).toFixed(1)},${height - pad}Z` : "";
  const last = n ? values[n - 1] : 0;
  return (
    <div ref={ref} data-test={testId} className="w-full" role="img" aria-label={label}>
      <svg width={w} height={height} className="block overflow-visible">
        {area && <path d={area} fill="rgb(var(--viz-ink))" opacity={0.1} />}
        {n > 1 && <path d={line} fill="none" stroke="rgb(var(--viz-ink))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {n > 0 && (
          <circle cx={x(n - 1)} cy={y(last)} r={4} fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={2} />
        )}
      </svg>
    </div>
  );
}

/**
 * A bullet: posted as a green bar over a lighter green track, a tick where it should be by today,
 * and the shortfall between the two tinted by how bad it is.
 */
export function PaceBullet({ posted, expected, committed, severity, tick = true, label }: {
  posted: number;
  expected: number;
  committed: number;
  /** Colours the shortfall: late work is red, merely behind is amber. */
  severity?: "bad" | "warn";
  tick?: boolean;
  label?: string;
}) {
  const of = Math.max(1, committed);
  const done = Math.min(100, (posted / of) * 100);
  const due = Math.min(100, (expected / of) * 100);
  const short = Math.max(0, due - done);
  return (
    <div className="relative h-2 w-full rounded-full bg-viz-done/15" role="img"
      aria-label={label ?? `${posted} of ${committed} posted, ${expected} due by today`}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-viz-done" style={{ width: `${done}%` }} />
      {short > 0 && (
        <div className={`absolute inset-y-0 rounded-r-full ${severity === "bad" ? "bg-viz-late/45" : "bg-viz-wait/50"}`}
          style={{ left: `${done}%`, width: `${short}%` }} />
      )}
      {tick && committed > 0 && (
        <span className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${due}%` }} />
      )}
    </div>
  );
}

/** "3 Oct" from `yyyy-MM-dd`, for axes. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function axisDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Mon 3 Oct" for a tooltip heading. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function tipDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`;
}
