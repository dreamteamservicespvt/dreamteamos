/**
 * The top of the dashboard (2026-10-04): one number the page leads with, and the tiles beside it.
 *
 * ── Why "delivered" is the hero ───────────────────────────────────────────────────────────────
 * Everything a retainer is judged on comes back to one question — is what we promised going up? So
 * that is the single large figure: posted against promised, on a meter whose tick is where the
 * months should be by today. A month that is 40% done on its 10th day and one that is 40% done on
 * its 28th look the same as a percentage; against the tick they do not.
 *
 * The tiles are the piles of work, and each opens the list that holds it (the Clients view).
 */
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, Megaphone, RefreshCcw, Settings2, TrendingDown,
} from "lucide-react";
import { Sparkline } from "@/components/smm/dashboard/chartKit";
import { compactRupees, type SmmDashboardKpis, type SmmDeliverySummary } from "@/utils/smmDashboard";

/** The card filters a tile opens (pages/shared/SocialMedia). */
export type SmmBoardFilter = "all" | "off" | "risk" | "ok" | "setup" | "renewals" | "done";

export function DeliveryHero({ delivery, className = "" }: { delivery: SmmDeliverySummary; className?: string }) {
  const { committed, posted, expected, percent, expectedPercent, behindBy, monthsBehind } = delivery;
  const week = delivery.trend.slice(-7).reduce((n, d) => n + d.count, 0);
  const status = committed === 0
    ? { Icon: Clock, icon: "text-muted-foreground", text: "Nothing promised yet" }
    : behindBy > 0
      ? { Icon: TrendingDown, icon: "text-viz-wait", text: `${behindBy} behind pace${monthsBehind > 1 ? ` · ${monthsBehind} clients` : ""}` }
      : { Icon: CheckCircle2, icon: "text-viz-done", text: posted >= committed ? "Everything posted" : "On pace" };

  return (
    <section data-test="smm-dash-delivery" className={`flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Delivered</h2>
        <span data-test="smm-dash-pace" className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
          <status.Icon size={13} className={status.icon} /> {status.text}
        </span>
      </div>

      <div className="mt-3 flex items-end gap-3">
        <p data-test="smm-dash-delivered-percent" className="text-5xl font-semibold leading-none tracking-tight text-foreground">
          {percent}<span className="text-3xl text-muted-foreground">%</span>
        </p>
        <p className="pb-1 text-xs leading-snug text-muted-foreground">
          of what was promised<br />is posted
        </p>
      </div>

      {/* The meter: posted in green over a lighter green track, the tick where today's target is. */}
      <div className="mt-5">
        <div
          className="relative h-2.5 rounded-full bg-viz-done/15"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={committed}
          aria-valuenow={posted}
          aria-label={`${posted} of ${committed} posted; ${expected} expected by today`}
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-viz-done transition-[width] duration-500" style={{ width: `${percent}%` }} />
          {committed > 0 && (
            <span
              data-test="smm-dash-expected-tick"
              title={`Expected by today: ${expected}`}
              className="absolute -top-1.5 h-[22px] w-0.5 -translate-x-1/2 rounded-full bg-foreground"
              style={{ left: `${expectedPercent}%` }}
            />
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><b className="font-semibold text-foreground">{posted}</b> posted of <b className="font-semibold text-foreground">{committed}</b></span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 rounded-full bg-foreground" /> <b className="font-semibold text-foreground">{expected}</b> due by today
          </span>
        </div>
      </div>

      <div className="mt-auto border-t border-border pt-4">
        <div className="mt-1 flex items-end justify-between gap-4">
          <div className="shrink-0">
            <p className="text-[11px] text-muted-foreground">Posts a day · 14 days</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{week} <span className="font-normal text-muted-foreground">this week</span></p>
          </div>
          <div className="min-w-0 max-w-[220px] flex-1">
            <Sparkline values={delivery.trend.map((d) => d.count)} label={`Posts a day over the last 14 days: ${delivery.trend.map((d) => d.count).join(", ")}`} testId="smm-dash-trend" />
          </div>
        </div>
      </div>
    </section>
  );
}

interface Tile {
  key: string;
  label: string;
  value: string;
  sub: string;
  Icon: LucideIcon;
  /** The icon's colour — a stage colour only where the tile means one. */
  icon: string;
  tab: SmmBoardFilter;
}

export function KpiTiles({ kpis, showMoney, onPick, className = "" }: {
  kpis: SmmDashboardKpis;
  /** The months' value, for the people who sell and run the side — not for every member. */
  showMoney: boolean;
  onPick?: (tab: SmmBoardFilter) => void;
  className?: string;
}) {
  const tiles: Tile[] = [
    {
      key: "running", label: "Clients running", value: String(kpis.running),
      sub: showMoney && kpis.monthlyValue > 0
        ? `${compactRupees(kpis.monthlyValue)} a month`
        : kpis.awaitingRenewal > 0 ? `+${kpis.awaitingRenewal} awaiting renewal` : kpis.running === 1 ? "month in progress" : "months in progress",
      Icon: Megaphone, icon: "text-muted-foreground", tab: "all",
    },
    {
      key: "due", label: "Due this week", value: String(kpis.dueThisWeek),
      sub: kpis.dueThisWeek === 1 ? "piece to post in 7 days" : "pieces to post in 7 days",
      Icon: CalendarClock, icon: "text-viz-ready", tab: "all",
    },
    {
      key: "late", label: "Late", value: String(kpis.late),
      sub: kpis.late > 0 ? `across ${kpis.lateMonths} client${kpis.lateMonths === 1 ? "" : "s"}` : "nothing past its date",
      Icon: kpis.late > 0 ? AlertTriangle : CheckCircle2, icon: kpis.late > 0 ? "text-viz-late" : "text-viz-done", tab: "off",
    },
    {
      key: "waiting", label: "With the client", value: String(kpis.waiting),
      sub: kpis.waitDays > 0 ? `${kpis.waitDays} day${kpis.waitDays === 1 ? "" : "s"} lost waiting` : "nothing waiting on them",
      Icon: Clock, icon: kpis.waiting > 0 ? "text-viz-wait" : "text-muted-foreground", tab: "all",
    },
    {
      key: "renewals", label: "Renewals due", value: String(kpis.renewalsDue),
      sub: showMoney && kpis.renewalsValue > 0 ? `${compactRupees(kpis.renewalsValue)} to renew` : "ending within 5 days",
      Icon: RefreshCcw, icon: kpis.renewalsDue > 0 ? "text-viz-ready" : "text-muted-foreground", tab: "renewals",
    },
  ];
  if (kpis.needsSetup > 0) {
    tiles.push({
      key: "setup", label: "Needs setup", value: String(kpis.needsSetup), sub: "nobody on it yet",
      Icon: Settings2, icon: "text-viz-wait", tab: "setup",
    });
  }

  return (
    <div data-test="smm-board-stats" className={`grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 ${className}`}>
      {tiles.map(({ key, label, value, sub, Icon, icon, tab }) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick?.(tab)}
          data-test={`smm-tile-${key}`}
          className="group flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon size={14} className={`shrink-0 ${icon}`} /> <span className="truncate">{label}</span>
          </span>
          <span data-test={`smm-stat-${key}`} className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-foreground">
            {value}
          </span>
          <span className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</span>
        </button>
      ))}
    </div>
  );
}
