/**
 * A part of the sale form that starts folded away.
 *
 * ── Why anything is hidden at all ─────────────────────────────────────────────────────────────
 * Recording a sale is the thing a member does most, usually on a phone, often with the client
 * still on the line. The form had grown to the point where the fields for the ordinary sale —
 * package, amount, screenshot — were separated by two blocks that most sales never touch: the
 * review/referral discount, and the advance-payment split. Neither is rare enough to remove and
 * neither is common enough to lead with, which is exactly what a fold is for.
 *
 * ── Why the summary line matters more than the fold ───────────────────────────────────────────
 * A collapsed section that says nothing is a section people forget exists, and forgetting the
 * advance box is how a half-paid sale gets recorded as paid in full. So the header always states
 * the current position in words — "Not applied", "10% off", "₹20,000 still to collect" — and turns
 * a colour when it holds something. Closed is the resting state, never a hiding place: anything
 * actually set is legible without opening it.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface SaleSectionProps {
  title: string;
  /** One line saying what this section currently holds. Shown whether open or closed. */
  summary: string;
  icon: ReactNode;
  children: ReactNode;
  /**
   * True when the section holds something — it is then tinted and its summary emphasised, so a
   * discount or an outstanding balance is impossible to miss on a closed form.
   */
  active?: boolean;
  /**
   * Opened on mount. Used when re-opening a sale that already has something in here: hiding a
   * discount somebody is halfway through editing reads as the form having lost it.
   */
  defaultOpen?: boolean;
  testId?: string;
}

export default function SaleSection({
  title, summary, icon, children, active = false, defaultOpen = false, testId,
}: SaleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      data-test={testId}
      data-open={open ? "yes" : "no"}
      data-active={active ? "yes" : "no"}
      className={`rounded-lg border transition-colors ${
        active ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-test={testId ? `${testId}-toggle` : undefined}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-foreground">{title}</span>
          <span
            data-test={testId ? `${testId}-summary` : undefined}
            className={`block truncate text-[11px] ${active ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            {summary}
          </span>
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && <div className="space-y-2 border-t border-border/60 p-2.5">{children}</div>}
    </div>
  );
}
