/**
 * An invoice's status in plain words — Draft, Unpaid, Overdue, Paid, Cancelled — one colour each.
 * The owner's rule for status (2026-10-04): it must read instantly, in words, not a code or a chart.
 */
import { cn } from "@/lib/utils";
import { DISPLAY_STATUS_LABEL, type InvoiceDisplayStatus } from "@/utils/invoiceDraft";

const TONE: Record<InvoiceDisplayStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  unpaid: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
  overdue: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  cancelled: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25",
};

export function StatusPill({ status, className }: { status: InvoiceDisplayStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center h-5 px-2 rounded-full border text-[11px] font-medium whitespace-nowrap", TONE[status], className)}
      data-test="status-pill" data-status={status}>
      {DISPLAY_STATUS_LABEL[status]}
    </span>
  );
}
