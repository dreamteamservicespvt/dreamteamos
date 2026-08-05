import { formatCurrency } from "@/utils/formatters";

/**
 * The sales member's "Total earnings this period" card — salary plus commission on verified
 * sales, the two halves kept separate right up to the total. Shared by My Salary and the
 * Dashboard so the motivating number a member sees is the same on both, always.
 */
interface SalesEarningsCardProps {
  totalEarnings: number;
  salaryPayable: number;
  commission: number;
  /**
   * Set when the incentive was withheld for missing target — the commission above is then zero
   * BECAUSE of the rule, not because nothing was sold. The two look identical on a card and mean
   * completely different things to the person reading it, so the reason is printed.
   */
  incentiveWithheld?: boolean;
  /** What the commission would have been. Only meaningful alongside `incentiveWithheld`. */
  commissionBeforeTarget?: number;
  /** Achievement as a fraction of the cycle's target, for the explanation line. */
  achievement?: number;
  loading?: boolean;
  /** e.g. "Cycle 10 Jul – 09 Aug" — small line under the split. */
  subtitle?: string;
  /** Makes the whole card a button (Dashboard → My Salary for the full breakdown). */
  onClick?: () => void;
}

export default function SalesEarningsCard({
  totalEarnings, salaryPayable, commission, incentiveWithheld, commissionBeforeTarget,
  achievement, loading, subtitle, onClick,
}: SalesEarningsCardProps) {
  if (loading) {
    return <div className="h-[104px] animate-pulse rounded-2xl bg-muted" />;
  }

  const inner = (
    <>
      <p className="text-xs font-medium text-muted-foreground">Total earnings this period</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums text-foreground md:text-4xl">
        {formatCurrency(totalEarnings)}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Salary <strong className="text-foreground">{formatCurrency(salaryPayable)}</strong></span>
        <span>+ Commission <strong className="text-success">{formatCurrency(commission)}</strong></span>
      </div>
      {incentiveWithheld && (
        <p className="mt-2 rounded-lg bg-warning/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-warning" data-test="incentive-withheld">
          <strong>{formatCurrency(commissionBeforeTarget || 0)} commission not earned this cycle.</strong>{" "}
          Incentive is payable only at 75% of target or above — you are at{" "}
          {Math.round((achievement || 0) * 100)}%. It is earned in full once you reach 75%.
        </p>
      )}
      {subtitle && <p className="mt-2 text-[11px] text-muted-foreground">{subtitle}</p>}
    </>
  );

  const className = "block w-full rounded-2xl border border-success/30 bg-gradient-to-br from-success/10 to-transparent p-5 text-left";

  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} transition-colors hover:border-success/50 hover:from-success/15`}>
      {inner}
    </button>
  ) : (
    <section className={className}>{inner}</section>
  );
}
