import { formatCurrency } from "@/utils/formatters";

/**
 * The sales member's "Total earnings this period" card — salary plus incentives on verified
 * sales, the two halves kept separate right up to the total. Shared by My Salary and the
 * Dashboard so the motivating number a member sees is the same on both, always.
 */
interface SalesEarningsCardProps {
  totalEarnings: number;
  salaryPayable: number;
  commission: number;
  /**
   * Set when the incentive has not reached its target gate yet — `commission` above is then zero
   * BECAUSE of the rule, not because nothing was sold. The two look identical on a card and mean
   * completely different things to the person reading it, so the reason is printed.
   */
  incentiveWithheld?: boolean;
  /** What the incentive has built up to. Only meaningful alongside `incentiveWithheld`. */
  commissionBeforeTarget?: number;
  /** Achievement as a fraction of the cycle's target, for the explanation line. */
  achievement?: number;
  /** Sales still needed to unlock the incentive, in rupees — the actionable half of the warning. */
  incentiveShortfall?: number;
  loading?: boolean;
  /** e.g. "Cycle 10 Jul – 09 Aug" — small line under the split. */
  subtitle?: string;
  /** Makes the whole card a button (Dashboard → My Salary for the full breakdown). */
  onClick?: () => void;
}

export default function SalesEarningsCard({
  totalEarnings, salaryPayable, commission, incentiveWithheld, commissionBeforeTarget,
  achievement, incentiveShortfall, loading, subtitle, onClick,
}: SalesEarningsCardProps) {
  if (loading) {
    return <div className="h-[104px] animate-pulse rounded-2xl bg-muted" />;
  }

  /*
    The headline is salary PLUS the incentive built up so far, even before the 75% gate opens.

    It used to show salary alone until the gate, which is what the payslip would pay that minute and
    the least useful thing to put in front of somebody mid-cycle: their own work simply did not
    appear. Adding it in is only honest as long as the condition travels with the number, so the
    line directly beneath it always names the accrued figure and says it settles at 75%.
  */
  const accruedIncentive = incentiveWithheld ? (commissionBeforeTarget || 0) : commission;
  const headlineTotal = incentiveWithheld ? salaryPayable + accruedIncentive : totalEarnings;

  const inner = (
    <>
      <p className="text-xs font-medium text-muted-foreground">Total earnings this period</p>
      <p data-test="earnings-total" className="mt-1 font-display text-3xl font-bold tabular-nums text-foreground md:text-4xl">
        {formatCurrency(headlineTotal)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Salary <strong className="text-foreground">{formatCurrency(salaryPayable)}</strong></span>
        <span data-test={incentiveWithheld ? "commission-pending" : "commission-earned"}>
          + Incentives{" "}
          <strong className={incentiveWithheld ? "text-foreground" : "text-success"}>
            {formatCurrency(accruedIncentive)}
          </strong>
          {incentiveWithheld && <span className="ml-1 text-[11px]">&nbsp;so far</span>}
        </span>
      </div>
      {incentiveWithheld && (
        /*
          Information, not an alarm — and now also the condition on the headline above it.

          It once said "commission NOT EARNED" in warning colour, which turned the one card meant to
          motivate somebody into a notice of something withheld. It reads instead as the next rung on
          a ladder: the incentive is counted in the total, the sentence says plainly what settles it,
          and the bar makes the remaining distance feel finite.
        */
        <div className="mt-2.5 rounded-lg bg-muted/40 px-2.5 py-2" data-test="incentive-withheld">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">
              Includes <strong className="text-foreground">{formatCurrency(accruedIncentive)}</strong> incentives,
              settled at 75% of target
            </span>
            <span className="shrink-0 font-semibold text-foreground">
              {Math.round((achievement || 0) * 100)}% there
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-success transition-[width] duration-700"
              style={{ width: `${Math.min(100, ((achievement || 0) / 0.75) * 100)}%` }}
            />
          </div>
          {incentiveShortfall && incentiveShortfall > 0 && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">{formatCurrency(incentiveShortfall)}</strong> more in
              approved sales locks it in.
            </p>
          )}
        </div>
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
