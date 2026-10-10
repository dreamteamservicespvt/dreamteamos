import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import { Receipt, ExternalLink } from "lucide-react";
import { useSalaryPayments } from "@/hooks/useSalaryPayments";

/**
 * A member's salary history on their profile — every payment, whether the admin marked it paid in
 * Payroll or Accounts sent a receipt (see `useSalaryPayments`: this listed receipts only, so salaries
 * paid from Payroll never showed here).
 */
export default function SalaryTimeline({ userId }: { userId: string }) {
  const { loading, payments } = useSalaryPayments(userId);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="text-center py-6">
        <Receipt size={24} className="mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground">No salary payments yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0" data-test="salary-timeline">
      {payments.map((p, i) => (
        <div key={p.id} className="flex gap-3">
          {/* Timeline line */}
          <div className="flex flex-col items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-success mt-1.5 shrink-0" />
            {i < payments.length - 1 && <div className="w-px flex-1 bg-border" />}
          </div>
          {/* Content */}
          <div className="pb-4 min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-foreground text-sm">{formatCurrency(p.amount)}</span>
              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                {p.at ? format(p.at, "dd MMM yyyy") : "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground/70">{p.periodText}</span>
              <span> · {p.source === "payroll" ? "Paid via Payroll" : "Receipt from Accounts"}</span>
              {p.note && <span> · {p.note}</span>}
            </p>
            {p.fileUrl && (
              <a
                href={p.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink size={11} />
                {p.fileName || "View Receipt"}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
