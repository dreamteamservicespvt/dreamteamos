/**
 * Renewals on a runway (2026-10-04) — every coming month end as a mark on the next thirty days.
 *
 * ── Why a line and not a list ─────────────────────────────────────────────────────────────────
 * A renewal is a date and a decision. Laid on a line, the week that holds four of them shows as a
 * cluster before anybody reads a name, the overdue ones sit apart on the left in red, and the ones
 * already renewed are green and need nobody. The next few undecided ones are listed under it with
 * their worth, so the salesperson's calls for the week are right there.
 */
import { useMemo, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ChartTip, LegendKey, VizCard, axisDay, tipDay, useWidth } from "@/components/smm/dashboard/chartKit";
import { addDays } from "@/utils/smmPlan";
import {
  compactRupees, relativeDay, type SmmRenewalMark, type SmmRenewalMarkState, type SmmRenewalRunway,
} from "@/utils/smmDashboard";

const STATE: Record<SmmRenewalMarkState, { color: string; label: string; hollow?: boolean; diamond?: boolean }> = {
  open: { color: "rgb(var(--viz-ink))", label: "Not decided" },
  pitched: { color: "rgb(var(--viz-ready))", label: "Pitched" },
  renewed: { color: "rgb(var(--viz-done))", label: "Renewed" },
  overdue: { color: "rgb(var(--viz-late))", label: "Overdue", diamond: true },
  lost: { color: "rgb(var(--viz-axis))", label: "Not renewing", hollow: true },
};

const BACK = 7;
const AHEAD = 30;
const STEP = 15;

export function RenewalRunway({ runway, today, showMoney, className = "" }: {
  runway: SmmRenewalRunway;
  today: string;
  showMoney: boolean;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const [active, setActive] = useState<string | null>(null);
  const m = { left: 10, right: 12 };
  const pw = Math.max(80, width - m.left - m.right);
  const sx = (d: number) => m.left + ((Math.max(-BACK + 0.6, Math.min(AHEAD, d)) + BACK) / (AHEAD + BACK)) * pw;

  // Marks on the same day stack upward; overdue ones share the left zone.
  const placed = useMemo(() => {
    const stacks = new Map<number, number>();
    return runway.marks.map((mk) => {
      const day = mk.daysTo < 0 ? -BACK / 2 : mk.daysTo;
      const level = stacks.get(day) || 0;
      stacks.set(day, level + 1);
      return { mk, x: sx(day), level };
    });
  }, [runway.marks, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const levels = Math.max(2, ...placed.map((p) => p.level + 1));
  const top = 22;
  const base = top + levels * STEP + 4;
  const height = base + 26;
  const y = (level: number) => base - 8 - level * STEP;
  const act = placed.find((p) => p.mk.id === active) || null;

  const nearest = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best: (typeof placed)[number] | null = null;
    let bestD = 26 * 26;
    for (const p of placed) {
      const d = (p.x - px) ** 2 + (y(p.level) - py) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  };

  const next = runway.marks
    .filter((mk) => mk.state === "open" || mk.state === "pitched" || mk.state === "overdue")
    .slice(0, 5);
  const money = (n: number) => (showMoney && n > 0 ? compactRupees(n) : "");

  return (
    <VizCard
      testId="smm-dash-renewals"
      className={className}
      title="Renewals"
      subtitle="Every month ending in the next 30 days, on its renewal date."
    >
      <dl className="grid grid-cols-3 gap-2">
        {[
          { key: "week", label: "This week", t: runway.thisWeek },
          { key: "month", label: "Next 30 days", t: runway.upcoming },
          { key: "overdue", label: "Overdue", t: runway.overdue },
        ].map(({ key, label, t }) => (
          <div key={key} className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
            <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
            <dd data-test={`smm-renewal-${key}`} className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-lg font-semibold leading-tight text-foreground">{t.count}</span>
              {money(t.amount) && <span className="truncate text-[11px] text-muted-foreground">{money(t.amount)}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div ref={ref} className="relative mt-4">
        <svg width={width} height={height} className="block select-none"
          onPointerMove={(e) => setActive(nearest(e)?.mk.id ?? null)} onPointerLeave={() => setActive(null)}>
          {/* Overdue zone, then this week. */}
          <rect x={sx(-BACK)} y={top - 4} width={sx(-0.4) - sx(-BACK)} height={base - top + 4} rx={6} fill="rgb(var(--viz-late))" opacity={0.07} />
          <rect x={sx(0)} y={top - 4} width={sx(7) - sx(0)} height={base - top + 4} rx={6} fill="hsl(var(--foreground))" opacity={0.045} />
          <text x={sx(-BACK) + 4} y={top + 6} className="fill-muted-foreground text-[10px]">Overdue</text>
          <text x={sx(0) + 5} y={top + 6} className="fill-muted-foreground text-[10px]">This week</text>
          <line x1={sx(-BACK)} x2={sx(AHEAD)} y1={base} y2={base} stroke="rgb(var(--viz-axis))" strokeWidth={1} />
          <line x1={sx(0)} x2={sx(0)} y1={top - 8} y2={base + 4} stroke="hsl(var(--foreground))" strokeOpacity={0.55} strokeWidth={1.5} />
          {[0, 7, 14, 21, 28].map((d) => (
            <g key={d}>
              <line x1={sx(d)} x2={sx(d)} y1={base} y2={base + 4} stroke="rgb(var(--viz-axis))" />
              <text x={sx(d)} y={base + 17} textAnchor={d === 28 ? "end" : "middle"}
                className={d === 0 ? "fill-foreground text-[10px] font-semibold" : "fill-muted-foreground text-[10px]"}>
                {d === 0 ? "Today" : axisDay(addDays(today, d))}
              </text>
            </g>
          ))}
          {placed.map(({ mk, x, level }) => {
            const s = STATE[mk.state];
            const cy = y(level);
            const big = mk.id === active ? 1.3 : 1;
            return s.diamond ? (
              <path key={mk.id} data-test="smm-renewal-mark" data-state={mk.state}
                d={`M${x},${cy - 6 * big}L${x + 6 * big},${cy}L${x},${cy + 6 * big}L${x - 6 * big},${cy}Z`}
                fill={s.color} stroke="hsl(var(--card))" strokeWidth={2} strokeLinejoin="round" />
            ) : (
              <circle key={mk.id} data-test="smm-renewal-mark" data-state={mk.state} cx={x} cy={cy} r={5 * big}
                fill={s.hollow ? "hsl(var(--card))" : s.color} stroke={s.hollow ? s.color : "hsl(var(--card))"} strokeWidth={s.hollow ? 1.75 : 2} />
            );
          })}
        </svg>
        {act && (
          <ChartTip x={act.x} y={y(act.level)} width={width} below={y(act.level) < 60}>
            <p className="mb-0.5 truncate font-semibold text-foreground">{act.mk.name}</p>
            <p className="text-muted-foreground">{tipDay(act.mk.endDate)} · {relativeDay(act.mk.daysTo)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: STATE[act.mk.state].color }} /> {STATE[act.mk.state].label}
              {money(act.mk.amount) && <span className="text-muted-foreground">· {money(act.mk.amount)}</span>}
            </p>
            {act.mk.soldByName && <p className="text-muted-foreground">{act.mk.soldByName}</p>}
          </ChartTip>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(["open", "pitched", "renewed", "overdue", "lost"] as SmmRenewalMarkState[]).map((k) => (
          <LegendKey key={k} color={STATE[k].color} label={STATE[k].label} shape={STATE[k].diamond ? "diamond" : "dot"} hollow={STATE[k].hollow} />
        ))}
      </div>

      {next.length > 0 && (
        <ul className="-mx-2 mt-3 divide-y divide-border/70 border-t border-border/70">
          {next.map((mk) => <RenewalRow key={mk.id} mk={mk} money={money(mk.amount)} />)}
        </ul>
      )}
      {runway.marks.length === 0 && <p className="mt-3 text-xs text-muted-foreground">No month ends in the next 30 days.</p>}
    </VizCard>
  );
}

function RenewalRow({ mk, money }: { mk: SmmRenewalMark; money: string }) {
  const [, mon, day] = mk.endDate.split("-");
  const s = STATE[mk.state];
  return (
    <li>
      <Link to={`/smm/${mk.id}`} data-test="smm-renewal-row"
        className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50">
        <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-foreground">
          <span className="text-[13px] font-semibold leading-none">{Number(day)}</span>
          <span className="mt-0.5 text-[9px] uppercase leading-none text-muted-foreground">{axisDay(`2000-${mon}-01`).split(" ")[1]}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">{mk.name}</span>
          <span className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 shrink-0 ${s.diamond ? "rotate-45 rounded-[1px]" : "rounded-full"}`} style={{ background: s.color }} />
            {s.label} · {relativeDay(mk.daysTo)}{mk.soldByName ? ` · ${mk.soldByName}` : ""}
          </span>
        </span>
        {money && <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">{money}</span>}
        <ArrowRight size={14} className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
}
