/**
 * The people and the ads (2026-10-04).
 *
 * Team: one bar per person, as long as everything they hold and split by how far it has got — the
 * person with a long red end is the one to sit down with, the one with a short bar has room for the
 * next client. Ads: what the campaigns brought in, what they cost, and which clients they worked for.
 * Only drawn when some month in view has a campaign at all.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LegendKey, Sparkline, VizCard } from "@/components/smm/dashboard/chartKit";
import { formatCurrency } from "@/utils/formatters";
import { compactRupees, type SmmAdsSummary, type SmmWorkloadRow } from "@/utils/smmDashboard";

const WORK_SEGMENTS: { key: keyof Pick<SmmWorkloadRow, "posted" | "inFlight" | "waiting" | "notStarted" | "late">; label: string; bg: string; color: string }[] = [
  { key: "posted", label: "Posted", bg: "bg-viz-done", color: "rgb(var(--viz-done))" },
  { key: "inFlight", label: "Moving", bg: "bg-viz-ready", color: "rgb(var(--viz-ready))" },
  { key: "waiting", label: "With the client", bg: "bg-viz-wait", color: "rgb(var(--viz-wait))" },
  { key: "notStarted", label: "Not started", bg: "bg-viz-idle", color: "rgb(var(--viz-idle))" },
  { key: "late", label: "Late", bg: "bg-viz-late", color: "rgb(var(--viz-late))" },
];

export function TeamWorkload({ rows, className = "", initial = 8 }: { rows: SmmWorkloadRow[]; className?: string; initial?: number }) {
  const [all, setAll] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const shown = all ? rows : rows.slice(0, initial);

  return (
    <VizCard
      testId="smm-dash-team"
      className={className}
      title="Team load"
      subtitle="Each person's pieces across the months — what they make and what they post."
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {WORK_SEGMENTS.map((s) => <LegendKey key={s.key} color={s.color} label={s.label} shape="bar" />)}
      </div>
      <ul className="space-y-1">
        {shown.map((r) => (
          <li
            key={r.uid}
            data-test="smm-dash-team-row"
            tabIndex={0}
            onPointerEnter={() => setHover(r.uid)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(r.uid)}
            onBlur={() => setHover(null)}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-lg px-1 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[9rem_minmax(0,1fr)_8.5rem]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-foreground">{r.name}</span>
              <span className="block text-[11px] text-muted-foreground">{r.months} client{r.months === 1 ? "" : "s"}</span>
            </span>
            <span className="flex h-2.5 min-w-0 items-center" role="img"
              aria-label={`${r.name}: ${WORK_SEGMENTS.map((s) => `${r[s.key]} ${s.label.toLowerCase()}`).join(", ")}`}>
              <span className="flex h-full gap-[2px] overflow-hidden rounded-[4px]" style={{ width: `${(r.total / max) * 100}%` }}>
                {WORK_SEGMENTS.filter((s) => r[s.key] > 0).map((s) => (
                  <span key={s.key} className={`h-full min-w-[3px] ${s.bg}`} style={{ flexGrow: r[s.key], flexBasis: 0 }} />
                ))}
              </span>
            </span>
            {/* Hover or focus a person for the whole split; otherwise what is open and what is late. */}
            <span className="col-span-2 text-[11px] text-muted-foreground sm:col-span-1 sm:text-right">
              {/* Somebody only running the ads makes and posts nothing — said, rather than an empty bar and "0 open". */}
              {r.total === 0
                ? "No posts of their own"
                : hover === r.uid
                  ? WORK_SEGMENTS.filter((s) => r[s.key] > 0).map((s) => `${r[s.key]} ${s.label.toLowerCase()}`).join(" · ")
                  : <><b className="font-semibold text-foreground">{r.open}</b> open{r.late > 0 && <> · <b className="font-semibold text-foreground">{r.late}</b> late</>}</>}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > initial && (
        <button type="button" onClick={() => setAll((v) => !v)}
          className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <ChevronDown size={14} className={all ? "rotate-180" : ""} /> {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
      {rows.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nobody is on a month yet.</p>}
    </VizCard>
  );
}

export function AdsPerformance({ ads, className = "" }: { ads: SmmAdsSummary; className?: string }) {
  const top = ads.byClient.slice(0, 5);
  const maxLeads = Math.max(1, ...top.map((c) => c.leads));
  const metrics = [
    { key: "leads", label: "Leads", value: ads.leads.toLocaleString("en-IN"), spark: ads.series.map((s) => s.leads) },
    { key: "spend", label: "Ad spend", value: compactRupees(ads.spend), spark: ads.series.map((s) => s.spend) },
    {
      key: "cpl", label: "Cost per lead", value: ads.leads > 0 ? formatCurrency(ads.costPerResult) : "—",
      note: `${ads.daysReported} day${ads.daysReported === 1 ? "" : "s"} reported`,
    },
  ];
  return (
    <VizCard
      testId="smm-dash-ads"
      className={className}
      title="Ads"
      subtitle={`${ads.runsLive} campaign${ads.runsLive === 1 ? "" : "s"} running · trends over the last 14 days`}
    >
      <div className="grid grid-cols-3 gap-3">
        {metrics.map((mt) => (
          <div key={mt.key} className="min-w-0">
            <p className="truncate text-[11px] text-muted-foreground">{mt.label}</p>
            <p data-test={`smm-dash-ads-${mt.key}`} className="mt-0.5 truncate text-xl font-semibold tracking-tight text-foreground">{mt.value}</p>
            <div className="mt-1.5 h-8">
              {mt.spark
                ? <Sparkline values={mt.spark} height={30} label={`${mt.label} a day over the last 14 days`} />
                : <p className="pt-2 text-[11px] text-muted-foreground">{mt.note}</p>}
            </div>
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <div className="mt-4 border-t border-border/70 pt-3">
          <p className="mb-2 text-[11px] text-muted-foreground">Leads by client</p>
          <ul className="space-y-2">
            {top.map((c) => (
              <li key={c.id} data-test="smm-dash-ads-client" className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs">
                <span className="truncate text-foreground">{c.name}</span>
                <span className="flex h-2 min-w-0 items-center">
                  <span className="h-full rounded-r-[4px] rounded-l-[1px] bg-viz-ink" style={{ width: `${Math.max(2, (c.leads / maxLeads) * 100)}%` }} />
                </span>
                <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                  <b className="font-semibold text-foreground">{c.leads}</b>{c.leads > 0 ? ` · ${formatCurrency(c.costPerResult)}/lead` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ads.daysReported === 0 && <p className="mt-3 text-xs text-muted-foreground">No day has been reported yet.</p>}
    </VizCard>
  );
}
