/**
 * The volume discount on a bulk video order.
 *
 * Buying several videos of one kind at once earns a discount that grows with the quantity, capped
 * at 20%. The ladder is *suggested*, never imposed: the sales member can take it away entirely or
 * set something else, because the discount is a negotiating position and the person on the call is
 * the one who knows whether it needs to be spent. It may be given as a percentage or as a flat
 * rupee figure — whichever the client was actually quoted.
 *
 * What is NOT negotiable is that the change is visible. A price that moved off the ladder is
 * flagged to the tech admin and the sales admin, who are the two people entitled to ask why.
 */
import { formatCurrency } from "./formatters";

/** Quantity → suggested percent. Read top-down; the first threshold met wins. */
export const BULK_DISCOUNT_TIERS: { minQuantity: number; percent: number }[] = [
  { minQuantity: 20, percent: 20 },
  { minQuantity: 10, percent: 10 },
  { minQuantity: 5, percent: 5 },
];

/** The most that can be given, however the ladder or the member is read. */
export const MAX_BULK_DISCOUNT_PERCENT = 20;

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

/**
 * How the member expressed the discount. Some clients are quoted "10% off", others "₹2,000 off";
 * making the member convert between the two on a live call is how the wrong number gets typed.
 */
export type DiscountMode = "percent" | "amount";

/**
 * The most rupees that may come off this order — the 20% ceiling, expressed in money.
 *
 * The cap lives on the *amount* rather than only on the percent so that both boxes are governed by
 * one rule: whichever unit the member types in, no more than a fifth of the order can be given away.
 */
export function maxDiscountAmount(grossAmount: number): number {
  const gross = Math.max(0, Number(grossAmount) || 0);
  return Math.floor((gross * MAX_BULK_DISCOUNT_PERCENT) / 100);
}

/** Keeps a typed rupee discount inside 0…20% of the order. */
export function clampDiscountAmount(amount: number, grossAmount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(maxDiscountAmount(grossAmount), Math.round(amount));
}

export interface BulkQuote {
  quantity: number;
  unitAmount: number;
  /** quantity × unitAmount, before the discount. */
  grossAmount: number;
  /** Which box the member typed in. The other figure below is derived from it. */
  discountMode: DiscountMode;
  discountPercent: number;
  discountAmount: number;
  /** What the client actually pays — the figure that becomes the sale's `amount`. */
  amount: number;
  suggestedPercent: number;
  /** What the ladder's suggestion is worth in rupees at this quantity and price. */
  suggestedAmount: number;
  /** The applied discount differs from what the ladder offered. */
  edited: boolean;
}

/**
 * Price a bulk order.
 *
 * `discountValue` is what the member left in the box, read in `mode`'s unit. Pass `undefined` to
 * take the ladder's suggestion — that is the state the form opens in, before anyone has touched it.
 *
 * Whichever unit is typed, BOTH figures come back filled in: the percent is what every existing
 * reader (the approvals row, the Orders badge, the edit log) already knows how to show, and the
 * amount is what the member actually agreed with the client.
 */
export function quoteBulk(
  quantity: number,
  unitAmount: number,
  discountValue?: number,
  mode: DiscountMode = "percent",
): BulkQuote {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  const unit = Math.max(0, Number(unitAmount) || 0);
  const grossAmount = qty * unit;
  const suggested = suggestedDiscountPercent(qty);
  // Rounded once, on the discount rather than the total, so gross − discount always reconciles.
  const suggestedAmount = Math.round((grossAmount * suggested) / 100);

  let discountAmount: number;
  let discountPercent: number;
  if (mode === "amount") {
    discountAmount = discountValue === undefined
      ? clampDiscountAmount(suggestedAmount, grossAmount)
      : clampDiscountAmount(discountValue, grossAmount);
    // Derived, and only ever a display of the money: the rupees are what was agreed.
    discountPercent = grossAmount > 0 ? Math.round((discountAmount / grossAmount) * 100) : 0;
  } else {
    discountPercent = clampDiscountPercent(discountValue === undefined ? suggested : discountValue);
    discountAmount = Math.round((grossAmount * discountPercent) / 100);
  }

  return {
    quantity: qty,
    unitAmount: unit,
    grossAmount,
    discountMode: mode,
    discountPercent,
    discountAmount,
    amount: grossAmount - discountAmount,
    suggestedPercent: suggested,
    suggestedAmount,
    // Compared in money, not percent, so a member who types the exact rupee equivalent of the
    // ladder's offer is not flagged for having "changed" a price they did not change.
    edited: discountAmount !== suggestedAmount,
  };
}

/** "Edited discount 10% → 15%" — the badge the two admins see. */
export function discountEditLabel(suggested: number, applied: number): string {
  return `Edited discount ${suggested}% → ${applied}%`;
}

/**
 * " · 10% off" / " · ₹2,000 off" — a sold discount in the unit it was agreed in.
 *
 * Shown in the member's own unit rather than always as a percent because that is the number they
 * quoted the client, and it is the number the client will repeat back when they query the invoice.
 */
export function discountSummary(sale: {
  discountMode?: "percent" | "amount" | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
}): string {
  if (sale.discountMode === "amount" && sale.discountAmount) {
    return ` · ${formatCurrency(sale.discountAmount)} off`;
  }
  return sale.discountPercent ? ` · ${sale.discountPercent}% off` : "";
}
