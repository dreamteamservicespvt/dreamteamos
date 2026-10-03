/**
 * The numbers across the top of the board (2026-10-03).
 *
 * Six questions a leader asks before they read a single card — how many clients are running, how
 * much of what was promised is out, what is due this week, what is late, what is stuck with the
 * client, and whose renewal is coming — each a tile, and the tiles that name a pile of work open
 * the tab that holds it.
 */
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CalendarClock, Clock, Megaphone, RefreshCcw, Settings2, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/utils/formatters";
import type { SmmBoardStats as Stats } from "@/utils/smmPackage";

export type SmmBoardTab = "setup" | "active" | "attention" | "renewals" | "done";

export default function SmmBoardStats({ stats, showMoney, onPick }: {
  stats: Stats;
  /** The month's value, for the people who sell and run the side — not for every member. */
  showMoney: boolean;
  onPick?: (tab: SmmBoardTab) => void;
}) {
  const tiles: { key: string; label: string; value: string; sub: string; Icon: LucideIcon; tone: string; tab?: SmmBoardTab; hidden?: boolean }[] = [
    {
      key: "running", label: "Running", value: String(stats.running),
      sub: showMoney ? `${formatCurrency(stats.monthlyValue)} a month` : stats.running === 1 ? "client" : "clients",
      Icon: Megaphone, tone: "text-primary", tab: "active",
    },
    {
      key: "delivered", label: "Delivered", value: `${stats.deliveredPercent}%`,
      sub: `${stats.posted} of ${stats.committed} posted`, Icon: TrendingUp, tone: "text-success",
    },
    { key: "due", label: "Due this week", value: String(stats.dueThisWeek), sub: "not posted yet", Icon: CalendarClock, tone: "text-info" },
    {
      key: "late", label: "Late", value: String(stats.late), sub: "past their date",
      Icon: AlertTriangle, tone: stats.late > 0 ? "text-destructive" : "text-muted-foreground", tab: "attention",
    },
    {
      key: "waiting", label: "With the client", value: String(stats.waiting), sub: "waiting for approval",
      Icon: Clock, tone: stats.waiting > 0 ? "text-warning" : "text-muted-foreground", tab: "attention",
    },
    {
      key: "renewals", label: "Renewals due", value: String(stats.renewalsDue), sub: "ending within 5 days",
      Icon: RefreshCcw, tone: stats.renewalsDue > 0 ? "text-primary" : "text-muted-foreground", tab: "renewals",
    },
    {
      key: "setup", label: "Needs setup", value: String(stats.needsSetup), sub: "nobody on it yet",
      Icon: Settings2, tone: "text-warning", tab: "setup", hidden: stats.needsSetup === 0,
    },
  ];

  return (
    <div data-test="smm-board-stats" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {tiles.filter((t) => !t.hidden).map(({ key, label, value, sub, Icon, tone, tab }) => {
        const body = (
          <>
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Icon size={11} className={tone} /> {label}
            </p>
            <p data-test={`smm-stat-${key}`} className={`mt-0.5 font-mono text-xl font-bold ${tone === "text-muted-foreground" ? "text-foreground" : tone}`}>
              {value}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
          </>
        );
        return tab && onPick ? (
          <button key={key} type="button" onClick={() => onPick(tab)}
            className="min-w-0 rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/30">
            {body}
          </button>
        ) : (
          <div key={key} className="min-w-0 rounded-xl border border-border bg-card p-2.5">{body}</div>
        );
      })}
    </div>
  );
}
