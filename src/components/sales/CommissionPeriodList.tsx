import { formatCurrency } from "@/utils/formatters";
import type { CommissionPeriodRow, CommissionPeriodStatus } from "@/utils/salesPay";

/**
 * A member's incentive, pay period by pay period — the one commission rule as both sides read it
 * (2026-10-15): Settlements (the admin pays the due rows) and the member's own Settlements / My Performance.
 *
 * Each row says, in words, where that period's incentive stands — due, paid with the salary in Sales
 * Payroll, paid in Settlements, withheld under 75% of the target, or still running — so nobody has to work
 * out from a date range what has been paid. Status in plain words, one chip per row (the owner's
 * preference for status visuals).
 */

const STATUS: Record<CommissionPeriodStatus, { label: string; className: string }> = {
  due: { label: "Due", className: "bg-warning/15 text-warning" },
  payroll: { label: "Paid with salary", className: "bg-success/15 text-success" },
  settled: { label: "Paid in Settlements", className: "bg-success/15 text-success" },
  withheld: { label: "Under 75% of target", className: "bg-muted text-muted-foreground" },
  running: { label: "Running", className: "bg-info/15 text-info" },
  none: { label: "Nothing to pay", className: "bg-muted text-muted-foreground" },
};

export default function CommissionPeriodList({ rows, max = 6 }: { rows: CommissionPeriodRow[]; max?: number }) {
  const shown = rows.slice(0, max);
  if (shown.length === 0) return null;
  return (
    <div className="border border-border rounded-lg divide-y divide-border" data-test="commission-periods">
      {shown.map((r) => {
        const s = STATUS[r.status];
        const detail = r.status === "running"
          ? `${formatCurrency(r.salesBase)} so far · decided when it ends`
          : r.status === "withheld"
            ? `${formatCurrency(r.salesBase)} of ${formatCurrency(Math.round(r.periodTarget * 0.75))} needed`
            : `${r.rate}% of ${formatCurrency(r.status === "due" ? r.payableBase : r.salesBase)}`;
        const amount = r.status === "due" ? r.commission
          : r.status === "running" ? (r.withheld ? r.commissionBeforeTarget : r.commission)
          : r.status === "settled" ? Math.round((r.settledBase * r.rate) / 100)
          : null;
        return (
          <div key={r.period} data-test="commission-period" data-status={r.status}
            className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{r.label}</p>
              <p className="truncate text-[10px] text-muted-foreground">{detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {amount !== null && amount > 0 && (
                <span className={`font-mono tabular-nums ${r.status === "due" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {formatCurrency(amount)}
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.className}`}>{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
