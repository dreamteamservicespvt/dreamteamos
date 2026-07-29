/**
 * The volume discount on a bulk ad order.
 *
 * Buying several promotional ads at once earns a discount that grows with the quantity, capped at
 * 20%. The ladder is *suggested*, never imposed: the sales member can take it away entirely or set
 * something else, because the discount is a negotiating position and the person on the call is the
 * one who knows whether it needs to be spent.
 *
 * What is NOT negotiable is that the change is visible. A price that moved off the ladder is
 * flagged to the tech admin and the sales admin, who are the two people entitled to ask why.
 */

/** Quantity → suggested percent. Read top-down; the first threshold met wins. */
export const BULK_DISCOUNT_TIERS: { minQuantity: number; percent: number }[] = [
  { minQuantity: 20, percent: 20 },
  { minQuantity: 10, percent: 10 },
  { minQuantity: 5, percent: 5 },
];

/** The most that can be given, however the ladder or the member is read. */
export const MAX_BULK_DISCOUNT_PERCENT = 20;

/** Only packages at this price or above are discountable — the ₹499 entry ad is not. */
export const BULK_MIN_PACKAGE_AMOUNT = 999;

/** What the ladder offers at this quantity. 0 below the first threshold. */
export function suggestedDiscountPercent(quantity: number): number {
  if (!Number.isFinite(quantity)) return 0;
  const tier = BULK_DISCOUNT_TIERS.find((t) => quantity >= t.minQuantity);
  return tier ? tier.percent : 0;
}

/** Keeps a typed percent inside 0…20, so a slip of the keyboard cannot give the shop away. */
export function clampDiscountPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(MAX_BULK_DISCOUNT_PERCENT, Math.round(percent));
}

export interface BulkQuote {
  quantity: number;
  unitAmount: number;
  /** quantity × unitAmount, before the discount. */
  grossAmount: number;
  discountPercent: number;
  discountAmount: number;
  /** What the client actually pays — the figure that becomes the sale's `amount`. */
  amount: number;
  suggestedPercent: number;
  /** The applied percent differs from what the ladder offered. */
  edited: boolean;
}

/**
 * Price a bulk order.
 *
 * `discountPercent` is what the member left in the box. Pass `undefined` to take the ladder's
 * suggestion — that is the state the form opens in, before anyone has touched it.
 */
export function quoteBulk(
  quantity: number,
  unitAmount: number,
  discountPercent?: number,
): BulkQuote {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  const unit = Math.max(0, Number(unitAmount) || 0);
  const suggested = suggestedDiscountPercent(qty);
  const applied = clampDiscountPercent(discountPercent === undefined ? suggested : discountPercent);

  const grossAmount = qty * unit;
  // Rounded once, on the discount rather than the total, so gross − discount always reconciles.
  const discountAmount = Math.round((grossAmount * applied) / 100);

  return {
    quantity: qty,
    unitAmount: unit,
    grossAmount,
    discountPercent: applied,
    discountAmount,
    amount: grossAmount - discountAmount,
    suggestedPercent: suggested,
    edited: applied !== suggested,
  };
}

/** "Edited discount 10% → 15%" — the badge the two admins see. */
export function discountEditLabel(suggested: number, applied: number): string {
  return `Edited discount ${suggested}% → ${applied}%`;
}
