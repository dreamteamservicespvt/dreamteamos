/**
 * Where one sale has got to on the tech side, on the sale's own row.
 *
 * ── The gap this closes ───────────────────────────────────────────────────────────────────────
 * A sale row carried a chip only once the work was LOCKED — that is, only from the moment the tech
 * team had already started. Everything before that showed nothing, so the three things a client
 * actually rings to ask ("has anyone picked it up", "is it being made", "is it late") were the
 * three the row could not answer, and the member's only recourse was to message the tech team.
 *
 * One chip per SALE, never per lead: a client with three ads on one number asks about them one at
 * a time, and a single roll-up status for the row would be true of none of them.
 *
 * The words and the colours come from `utils/saleStatus` rather than from here, so My Leads and My
 * Clients cannot describe the same sale two different ways. This is the rendering only.
 */
import { Lock, Clock, AlertTriangle, ListChecks, Hourglass } from "lucide-react";
import { saleStatusView } from "@/utils/saleStatus";
import type { Order, SaleDetail } from "@/types";

export default function SaleStatusChip({ item, order, now, showProgress = true }: {
  /** The sale line. Optional — My Clients is built from orders and has no sale item to hand. */
  item?: SaleDetail | null;
  /** The order this sale produced. Absent is meaningful — see `saleStatusView`. */
  order: Order | null | undefined;
  /**
   * Passed in rather than read from the clock here so every chip in a list agrees with every
   * other, and so a test can put the page at a fixed moment.
   */
  now?: number;
  /** "5 of 8 videos created" for a month or a bulk order. Off where the row has no space. */
  showProgress?: boolean;
}) {
  const v = saleStatusView(item, order, now);

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        data-test="sale-status-chip"
        data-stage={v.stage}
        data-delayed={v.delayed ? "yes" : "no"}
        className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium ${v.tone}`}
        title={v.countdown ? `${v.label} · ${v.countdown}` : v.label}
      >
        {v.delayed ? <AlertTriangle size={9} />
          : v.stage === "withheld" ? <Hourglass size={9} />
          : v.stage === "queued" ? <Clock size={9} />
          : <Lock size={9} />}
        {v.label}
      </span>

      {/* The countdown is its own chip so the state and the time can be read separately — "in
          production" is reassuring, "in production, 40m left" is not, and running them together
          in one pill made the second half easy to miss. */}
      {!!v.countdown && (
        <span
          data-test="sale-countdown-chip"
          className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium ${
            v.delayed ? "bg-destructive/15 text-destructive"
              : v.dueSoon ? "bg-warning/20 text-warning"
              : "bg-muted text-muted-foreground"
          }`}
          title={v.extended ? "This delivery time has already been extended once" : "Time against the delivery promise"}
        >
          <Clock size={9} /> {v.countdown}{v.extended ? " · extended" : ""}
        </span>
      )}

      {showProgress && !!v.progress && (
        <span
          data-test="sale-progress-chip"
          className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground"
          title="What this order still owes"
        >
          <ListChecks size={9} /> {v.progress}
        </span>
      )}
    </span>
  );
}
