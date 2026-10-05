/**
 * "‹ Sep · October 2026 · Nov ›" and "This month" — the month picker of the renewal money screens
 * (2026-10-05). The same shape as the client calendar's, which the owner chose: the arrows and the way
 * back to today are always there.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthKeyShort, monthKeyTitle, shiftMonthKey } from "@/utils/smmRenewalMoney";

export default function MonthStepper({ value, current, onChange, testId = "smm-money-month" }: {
  /** The month shown, "yyyy-MM". */
  value: string;
  /** Today's month, "yyyy-MM". */
  current: string;
  onChange: (ym: string) => void;
  testId?: string;
}) {
  const prev = shiftMonthKey(value, -1);
  const next = shiftMonthKey(value, 1);
  return (
    <div className="flex items-center gap-1.5" data-test={testId}>
      <button type="button" onClick={() => onChange(prev)} aria-label={`Show ${monthKeyTitle(prev)}`} data-test={`${testId}-prev`}
        className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-card px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <ChevronLeft size={15} /> {monthKeyShort(prev)}
      </button>
      <span data-test={`${testId}-title`} className="min-w-0 whitespace-nowrap px-1 text-sm font-semibold text-foreground">
        {monthKeyTitle(value)}
      </span>
      <button type="button" onClick={() => onChange(next)} aria-label={`Show ${monthKeyTitle(next)}`} data-test={`${testId}-next`}
        className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-card px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        {monthKeyShort(next)} <ChevronRight size={15} />
      </button>
      {value !== current && (
        <button type="button" onClick={() => onChange(current)} data-test={`${testId}-today`}
          className="inline-flex h-9 items-center rounded-lg px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10">
          This month
        </button>
      )}
    </div>
  );
}
