import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The AI Accounts dialogs' frame — the same hand-rolled modal the work screens use, one layer higher
 * (z-[70]) because the credit dialog opens over the full-screen ad generator (z-50).
 */
export default function AiModal({
  open, title, subtitle, onClose, children, footer, wide = false, testId,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div
        data-test={testId}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl sm:rounded-xl border border-border bg-card text-foreground shadow-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
            {subtitle ? <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div> : null}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** The input style every AI Accounts form uses. */
export const fieldClass =
  "w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/50";

export const buttonClass = {
  primary: "h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0",
  ghost: "h-9 px-3 rounded-lg border border-border bg-background text-foreground text-sm font-medium hover:bg-accent disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0",
  small: "h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap shrink-0",
  danger: "h-8 px-2.5 rounded-md border border-destructive/30 bg-destructive/10 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap shrink-0",
};
