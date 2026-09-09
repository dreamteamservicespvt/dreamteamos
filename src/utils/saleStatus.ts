/**
 * Where a sale has got to on the tech side, in one line, for the person who sold it.
 *
 * ── The gap this closes ───────────────────────────────────────────────────────────────────────
 * A sale row used to show a chip only once the work was LOCKED — that is, only from the moment the
 * tech team had already started. Everything before that showed nothing at all, so the three states
 * a seller is actually asked about by a client on the phone — "has anyone picked it up", "is it
 * being made", "is it late" — were the three the row could not answer. The member's only recourse
 * was to message the tech team, which is the exact hand-off the orders queue exists to remove.
 *
 * ── Why it is derived rather than stored ──────────────────────────────────────────────────────
 * There is no new field here and nothing to keep in step. The order already knows its own status,
 * who is holding it, what it still owes and when it was promised; this reads those four and says
 * what they mean. A stored "sale status" would be a fifth copy of facts that already disagree with
 * each other often enough (see `notifyDueOrdersOnOpen` on why the order's own `assignedTo` goes
 * stale), and it would be wrong the first time anybody moved a job.
 *
 * One sale, one status. A lead with three ads on it shows three of these, because the client asks
 * about them one at a time.
 */
import { promiseDueMs, deadlineState, formatRemaining } from "@/utils/promiseSla";
import { releasedToTech } from "@/utils/saleDiscount";
import { progressSummary, isProgressComplete } from "@/utils/orderProgress";
import type { Order, SaleDetail } from "@/types";

export type SaleStage =
  /** Over the member's discount authority — no order exists until the sales admin agrees the price. */
  | "withheld"
  /** In the tech queue, nobody on it yet. */
  | "queued"
  /** Somebody is making it. */
  | "in_production"
  /** Made and handed over. */
  | "delivered"
  /** Delivered and signed off by the tech side. */
  | "verified"
  /** Pulled out of the queue. */
  | "cancelled";

export interface SaleStatusView {
  stage: SaleStage;
  /** The chip's words — short enough for a phone, specific enough to read out to a client. */
  label: string;
  /** Who is making it, when that is known. */
  assigneeName?: string | null;
  /** True once the promised time has passed and the work is not delivered. */
  delayed: boolean;
  /** True in the last few hours before the promise. */
  dueSoon: boolean;
  /** "3h 20m left" / "5h overdue". Empty when there is no promise or the work is finished. */
  countdown: string;
  /** Whether this promise has already had its one extension. */
  extended: boolean;
  /** "5 of 8 videos created · 3 of 16 posts published", for a month or a bulk order. */
  progress: string;
  /** Tailwind classes for the chip. Kept here so every screen shows the same state the same way. */
  tone: string;
}

const TONES: Record<SaleStage, string> = {
  withheld: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  queued: "bg-muted text-muted-foreground",
  in_production: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  delivered: "bg-success/15 text-success",
  verified: "bg-success/20 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

/** The chip is red the moment the promise is blown, whatever stage the work is at. */
const DELAYED_TONE = "bg-destructive/15 text-destructive";
const DUE_SOON_TONE = "bg-warning/20 text-warning";

/**
 * What this sale's status chip should say.
 *
 * `order` is optional throughout. A sale whose order has not been written yet — the seconds after
 * it is recorded, or a sale the queue has not loaded — reads as queued rather than as an error:
 * "waiting for the tech team" is true of it, and a blank chip is what this exists to remove.
 */
export function saleStatusView(
  item: SaleDetail,
  order: Order | null | undefined,
  now: number = Date.now(),
): SaleStatusView {
  const stage = saleStage(item, order);
  const finished = stage === "delivered" || stage === "verified" || stage === "cancelled";

  const dueMs = order?.promise ? promiseDueMs(order.promise) : 0;
  const state = finished ? "ok" : deadlineState(dueMs, now);
  const delayed = state === "overdue";
  const dueSoon = state === "near";

  const progress = order?.progress && !isProgressComplete(order.progress)
    ? progressSummary(order.progress)
    : "";

  return {
    stage,
    label: stageLabel(stage, order, delayed),
    assigneeName: order?.assignedToName || null,
    delayed,
    dueSoon,
    countdown: dueMs && !finished ? formatRemaining(dueMs, now) : "",
    extended: !!order?.promise?.extension,
    progress,
    tone: delayed ? DELAYED_TONE : dueSoon ? DUE_SOON_TONE : TONES[stage],
  };
}

function saleStage(item: SaleDetail, order: Order | null | undefined): SaleStage {
  // No order and an unapproved discount is the one case that is genuinely NOT in the queue. Every
  // other missing order is a sale the queue simply has not caught up with, which is "queued".
  if (!order) return releasedToTech(item) ? "queued" : "withheld";

  switch (order.status) {
    case "verified": return "verified";
    case "completed": return "delivered";
    case "assigned": return "in_production";
    case "cancelled":
    case "deleted": return releasedToTech(item) ? "cancelled" : "withheld";
    default: return "queued";
  }
}

function stageLabel(stage: SaleStage, order: Order | null | undefined, delayed: boolean): string {
  switch (stage) {
    case "withheld": return "Held — sales admin to approve the price";
    // "Late" rather than "delayed" on a job nobody has started: the useful fact is that it has not
    // been picked up, not that a clock ran out on nobody.
    case "queued": return delayed ? "Not picked up — overdue" : "Waiting for the tech team";
    case "in_production":
      return order?.assignedToName
        ? `${delayed ? "Overdue with" : "Being made by"} ${order.assignedToName}`
        : delayed ? "Overdue in production" : "In production";
    case "delivered": return "Delivered";
    case "verified": return "Delivered & signed off";
    case "cancelled": return "Cancelled";
  }
}
