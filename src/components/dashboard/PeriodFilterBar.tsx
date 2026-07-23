import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import DashboardDateRangePicker from "@/components/dashboard/DateRangePicker";
import {
  currentDay, periodLabel, shiftMonth,
  type PeriodFilter, type PeriodMode,
} from "@/utils/periodFilter";

/**
 * Career / This Month / Day / Custom Range switch.
 *
 * One control, used on every screen that shows money, so the same words always mean the same
 * span. Month mode gets prev/next arrows because stepping back a month is the common case.
 */

const MODES: { key: PeriodMode; label: string }[] = [
  { key: "career", label: "Career" },
  { key: "month", label: "This Month" },
  { key: "day", label: "Day" },
  { key: "range", label: "Range" },
];

/** The tech team's month runs 10th → 9th; the button says so rather than leaving it to be discovered. */
const monthLabel = (basis: PeriodFilter["monthBasis"]) => (basis === "cycle" ? "This Month (10–9)" : "This Month");

interface PeriodFilterBarProps {
  value: PeriodFilter;
  onChange: (next: PeriodFilter) => void;
  /** Optional trailing content, e.g. a total. */
  children?: React.ReactNode;
}

export default function PeriodFilterBar({ value, onChange, children }: PeriodFilterBarProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5 sm:flex-row sm:items-center sm:gap-3">
      {/* Mode switch */}
      <div className="flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Time period">
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChange({ ...value, mode: key })}
            aria-pressed={value.mode === key}
            className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs ${
              value.mode === key
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {key === "month" ? monthLabel(value.monthBasis) : label}
          </button>
        ))}
      </div>

      {/* Month stepper */}
      {value.mode === "month" && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange(shiftMonth(value, -1))}
            aria-label="Previous month"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[7.5rem] whitespace-nowrap text-center text-xs font-semibold text-foreground">
            {periodLabel(value)}
          </span>
          <button
            onClick={() => onChange(shiftMonth(value, 1))}
            aria-label="Next month"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {value.mode === "day" && (
        <input
          type="date"
          value={value.day}
          max={currentDay()}
          onChange={e => onChange({ ...value, day: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        />
      )}

      {value.mode === "range" && (
        <DashboardDateRangePicker
          value={value.range}
          onSelect={range => onChange({ ...value, range })}
        />
      )}

      {value.mode === "career" && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" /> All time
        </span>
      )}

      {children && <div className="sm:ml-auto">{children}</div>}
    </div>
  );
}
