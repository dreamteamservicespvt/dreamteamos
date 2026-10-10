import { format, parse } from "date-fns";
import { CalendarHeart, Loader2 } from "lucide-react";
import type { SalaryComputation } from "@/types/payroll";

/**
 * Comp-off on a Payroll row (owner, 2026-10-10): the holidays this person worked, what those
 * credits have paid for, and — at pay time — one click to turn the absences they still cover into
 * paid Comp Off days.
 *
 * Reads the LIVE computation: applying changes attendance, and attendance is what it describes.
 * Shown only when there is comp-off to speak of.
 */
const day = (d: string) => format(parse(d, "yyyy-MM-dd", new Date()), "dd MMM");

function hasCompOff(c: SalaryComputation): boolean {
  return (c.holidayWorkDays ?? 0) > 0 || (c.compOffDays ?? 0) > 0 || (c.compOffUnpaidDays ?? 0) > 0;
}

export default function CompOffPanel({
  computation: c, toApply, canApply, busy, onApply,
}: {
  computation: SalaryComputation;
  /** Absences the unused credits cover, earliest first. */
  toApply: string[];
  canApply: boolean;
  busy: boolean;
  onApply: () => void;
}) {
  if (!hasCompOff(c)) return null;
  const worked = c.holidayWorkDates ?? [];
  return (
    <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-3.5 text-sm" data-test="comp-off-panel">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <CalendarHeart className="h-3.5 w-3.5 text-teal-600" /> Comp off — holiday work
      </p>
      <p className="text-foreground">
        Worked {c.holidayWorkDays ?? 0} {(c.holidayWorkDays ?? 0) === 1 ? "holiday" : "holidays"}
        {worked.length > 0 && <span className="text-muted-foreground"> ({worked.map(day).join(", ")})</span>}
        {" · "}{c.compOffDays ?? 0} comp off paid · <strong>{c.compOffLeft ?? 0} left</strong>
      </p>
      {(c.compOffUnpaidDays ?? 0) > 0 && (
        <p className="mt-1 text-xs text-destructive">
          {c.compOffUnpaidDays} Comp Off {(c.compOffUnpaidDays ?? 0) === 1 ? "day has" : "days have"} no holiday worked to cover {(c.compOffUnpaidDays ?? 0) === 1 ? "it" : "them"} — unpaid.
        </p>
      )}
      {toApply.length > 0 ? (
        canApply ? (
          <button
            onClick={onApply} disabled={busy} data-test="comp-off-apply"
            className="mt-2.5 flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Apply comp off to {toApply.length} {toApply.length === 1 ? "absence" : "absences"} ({toApply.map(day).join(", ")})
          </button>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {toApply.length} {toApply.length === 1 ? "absence" : "absences"} can be turned into Comp Off.
          </p>
        )
      ) : (c.compOffLeft ?? 0) > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No absence to use it on — unused credits lapse when this pay cycle ends.</p>
      ) : null}
    </div>
  );
}
