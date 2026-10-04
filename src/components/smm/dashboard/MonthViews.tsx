/**
 * One month, drawn (2026-10-04) — the top of the month's Report tab.
 *
 * The same pictures as the dashboard, for one client: the promise as a meter with today's target on
 * it and a bullet per kind, and the ads as leads a day across the month's own dates. This is the page
 * the salesperson has open when they ask for the renewal, so it has to show the month at a glance —
 * the dashboard's language, so nobody learns two.
 */
import { useState } from "react";
import { PaceChip } from "@/components/smm/SmmVisuals";
import { ChartTip, PaceBullet, VizCard, axisDay, columnPath, niceScale, tipDay, useWidth } from "@/components/smm/dashboard/chartKit";
import { formatCurrency } from "@/utils/formatters";
import { daysLeftInCycle, fulfilment, isOverdue, postsByPlatform } from "@/utils/smmPlan";
import { cycleElapsed, cyclePhase, paceOf } from "@/utils/smmPackage";
import { SMM_CONTENT_KINDS, type SmmCampaign } from "@/types/smm";

const KIND_LABEL: Record<string, string> = { ai_ad: "Videos", poster: "Posters", real_video: "Real videos" };

export function MonthDelivery({ campaign, today, className = "" }: { campaign: SmmCampaign; today: string; className?: string }) {
  const f = fulfilment(campaign);
  const pace = paceOf(campaign, today);
  const phase = cyclePhase(campaign.cycle, today);
  const elapsed = phase === "upcoming" ? 0 : cycleElapsed(campaign.cycle, today);
  const due = (n: number) => (phase === "upcoming" ? 0 : phase === "ended" ? n : Math.floor(n * elapsed));
  const expected = due(f.committed);
  const daysLeft = daysLeftInCycle(campaign.cycle, today);
  const platforms = postsByPlatform(campaign.items);
  const late = campaign.items.filter((i) => isOverdue(i, today)).length;
  const expectedPct = f.committed > 0 ? Math.min(100, (expected / f.committed) * 100) : 0;

  return (
    <VizCard
      testId="smm-month-delivery"
      className={className}
      title="Promise tracker"
      subtitle={daysLeft > 1 ? `${daysLeft} days left in the month` : daysLeft === 1 ? "Last day of the month" : "The month has ended"}
      action={!campaign.history ? <PaceChip pace={pace} /> : undefined}
    >
      <div className="flex items-end gap-3">
        <p data-test="smm-fulfilment-percent" className="text-5xl font-semibold leading-none tracking-tight text-foreground">
          {f.percent}<span className="text-3xl text-muted-foreground">%</span>
        </p>
        <p className="pb-1 text-xs leading-snug text-muted-foreground">of what was promised<br />is posted</p>
      </div>

      <div className="mt-5">
        <div className="relative h-2.5 rounded-full bg-viz-done/15" role="meter" aria-valuemin={0} aria-valuemax={f.committed}
          aria-valuenow={f.posted} aria-label={`${f.posted} of ${f.committed} posted; ${expected} due by today`}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-viz-done" style={{ width: `${f.percent}%` }} />
          {f.committed > 0 && phase !== "upcoming" && (
            <span className="absolute -top-1.5 h-[22px] w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${expectedPct}%` }} />
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <b className="font-semibold text-foreground">{f.posted}</b> posted of <b className="font-semibold text-foreground">{f.committed}</b>
            {f.extra > 0 ? <> · <b className="font-semibold text-foreground">{f.extra}</b> extra delivered</> : null}
          </span>
          {phase !== "upcoming" && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-0.5 rounded-full bg-foreground" /> <b className="font-semibold text-foreground">{expected}</b> due by today
            </span>
          )}
        </div>
      </div>

      <ul className="mt-5 space-y-3 border-t border-border pt-4">
        {f.byKind.filter((k) => k.committed > 0).map((k) => (
          <li key={k.kind} data-test={`smm-kind-${k.kind}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs">
            <span className="truncate text-muted-foreground">{KIND_LABEL[k.kind] || SMM_CONTENT_KINDS.find((c) => c.key === k.kind)?.label}</span>
            <PaceBullet posted={k.posted} expected={due(k.committed)} committed={k.committed}
              severity={late > 0 ? "bad" : "warn"} tick={phase !== "upcoming"} />
            <span className="whitespace-nowrap tabular-nums text-muted-foreground">
              <b className="font-semibold text-foreground">{k.posted}</b>/{k.committed} posted · {k.made} made
            </span>
          </li>
        ))}
      </ul>

      {platforms.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          Where they went:
          {platforms.map((p) => (
            <span key={p.platform} className="rounded-full bg-muted px-2 py-0.5 text-foreground">
              {p.label} <b className="font-semibold">{p.count}</b>
            </span>
          ))}
        </div>
      )}
    </VizCard>
  );
}

/** Leads a day across the month — one series, the best day labelled, the rest in the tooltip and the totals. */
export function AdsDaily({ series, className = "" }: {
  series: { day: string; leads: number; spend: number; reported: boolean }[];
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const height = 168;
  const m = { top: 18, right: 6, bottom: 26, left: 28 };
  const pw = Math.max(60, width - m.left - m.right);
  const ph = height - m.top - m.bottom;
  const n = Math.max(1, series.length);
  const slot = pw / n;
  const colW = Math.min(18, Math.max(3, slot * 0.6));
  const { top, ticks } = niceScale(Math.max(0, ...series.map((s) => s.leads)), 3);
  const sy = (v: number) => m.top + ph - (v / top) * ph;
  const best = series.reduce((bi, s, i) => (s.leads > (series[bi]?.leads ?? -1) ? i : bi), 0);
  const act = active !== null ? series[active] : null;
  const reported = series.filter((s) => s.reported).length;

  return (
    <VizCard
      testId="smm-month-ads-daily"
      className={className}
      title="Leads a day"
      subtitle={`From the day reports — ${reported} of ${series.length} day${series.length === 1 ? "" : "s"} reported so far. A faint tick is a day nobody reported.`}
    >
      <div ref={ref} className="relative">
        <svg width={width} height={height} className="block select-none" onPointerLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + pw} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? "rgb(var(--viz-axis))" : "rgb(var(--viz-grid))"} />
              <text x={m.left - 7} y={sy(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px]">{t}</text>
            </g>
          ))}
          {series.map((s, i) => {
            const x = m.left + i * slot + (slot - colW) / 2;
            const h = (s.leads / top) * ph;
            return (
              <g key={s.day} data-test="smm-ads-day" opacity={active !== null && active !== i ? 0.45 : 1}>
                {s.reported
                  ? <path d={columnPath(x, sy(0) - h, colW, h, Math.min(4, colW / 2))} fill={i === best && s.leads > 0 ? "hsl(var(--foreground))" : "rgb(var(--viz-ink))"} />
                  : <rect x={x + colW / 2 - 1} y={sy(0) - 3} width={2} height={3} rx={1} fill="rgb(var(--viz-axis))" />}
                {i === best && s.leads > 0 && (
                  <text x={x + colW / 2} y={sy(0) - h - 5} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">{s.leads}</text>
                )}
                {(i % 7 === 0 || i === series.length - 1) && (
                  <text x={x + colW / 2} y={height - 8} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">
                    {axisDay(s.day)}
                  </text>
                )}
                <rect x={m.left + i * slot} y={m.top} width={slot} height={ph} fill="transparent" onPointerEnter={() => setActive(i)} />
              </g>
            );
          })}
        </svg>
        {act && (
          <ChartTip x={m.left + active! * slot + slot / 2} y={sy(act.leads)} width={width}>
            <p className="mb-1 font-semibold text-foreground">{tipDay(act.day)}</p>
            {act.reported ? (
              <>
                <p className="text-muted-foreground"><b className="font-semibold text-foreground">{act.leads}</b> leads</p>
                <p className="text-muted-foreground"><b className="font-semibold text-foreground">{formatCurrency(act.spend)}</b> spent{act.leads > 0 ? ` · ${formatCurrency(Math.round(act.spend / act.leads))} a lead` : ""}</p>
              </>
            ) : <p className="text-muted-foreground">Not reported.</p>}
          </ChartTip>
        )}
      </div>
    </VizCard>
  );
}
