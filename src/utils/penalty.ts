/**
 * Penalty charges — what we bill when a client asks for changes beyond the committed brief, or
 * asks for them after the ad has already been made.
 *
 * ── Why a penalty is not revenue ──────────────────────────────────────────────────────────────
 * A penalty is money the client owes for wasting production time. It is not something the sales
 * member sold, so it must never reach their commission, their revenue tiles, or the profit split.
 *
 * The way that is guaranteed here is structural rather than careful: a penalty is stored in its own
 * field and is never added into `SaleDetail.amount` or `Order.amount`. Every existing revenue
 * reader — `utils/salesRevenue`, `hooks/useSalesEarnings`, the profit analytics — sums `amount`,
 * so all of them exclude penalties without knowing penalties exist. There is nothing to remember
 * and no second place to keep in step.
 */
import { effectiveAdCategory } from "@/utils/serviceCatalog";
import type { Order, PenaltyClipType, PenaltyEntry, SaleDetail } from "@/types";

/** Standard rate per clip. A default the person recording the penalty may override, not a rule. */
export const PENALTY_RATES: Record<PenaltyClipType, number> = {
  promotional: 250,
  wishes: 250,
  cinematic: 500,
};

export const PENALTY_CLIP_TYPES: { key: PenaltyClipType; label: string; rate: number }[] = [
  { key: "promotional", label: "Promotional clip", rate: PENALTY_RATES.promotional },
  { key: "wishes", label: "Wishes clip", rate: PENALTY_RATES.wishes },
  { key: "cinematic", label: "Cinematic clip", rate: PENALTY_RATES.cinematic },
];

/**
 * The clip type to charge at, guessed from what was sold. A bulk order is charged at the rate of
 * the kind of video it is made of — ten cinematic ads cost the same to re-do as one, per clip —
 * and anything unrecognised falls to the lower of the two rates rather than over-charging by
 * default.
 */
export function defaultClipType(category: string | undefined, bulkAdType?: string | null): PenaltyClipType {
  const resolved = effectiveAdCategory(category || "", bulkAdType);
  if (resolved === "cinematic") return "cinematic";
  if (resolved === "wishes") return "wishes";
  return "promotional";
}

export function defaultRateFor(category: string | undefined, bulkAdType?: string | null): number {
  return PENALTY_RATES[defaultClipType(category, bulkAdType)];
}

/** clips × ratePerClip, floored at zero. Stored on the entry so a later rate change cannot rewrite it. */
export function penaltyAmount(clips: number, ratePerClip: number): number {
  const c = Math.max(0, Math.floor(Number(clips) || 0));
  const r = Math.max(0, Number(ratePerClip) || 0);
  return Math.round(c * r);
}

export interface PenaltyTotals {
  total: number;
  clips: number;
  count: number;
}

export function totalPenalties(entries: PenaltyEntry[] | undefined): PenaltyTotals {
  const list = entries || [];
  return {
    total: list.reduce((sum, p) => sum + (p.amount || 0), 0),
    clips: list.reduce((sum, p) => sum + (p.clips || 0), 0),
    count: list.length,
  };
}

/** Orders carrying at least one penalty — the population of the Orders → Changes section. */
export function ordersWithPenalties(orders: Order[]): Order[] {
  return orders.filter((o) => (o.penalties?.length || 0) > 0);
}

/**
 * Proof that penalties stay out of revenue, expressed as a function so a test can assert it and a
 * future reader can see the intent: what a member earns from a sale is its `amount`, full stop.
 */
export function saleRevenueAmount(item: Pick<SaleDetail, "amount">): number {
  return item.amount || 0;
}
