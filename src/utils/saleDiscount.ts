/**
 * What a sales member may take off a price on their own, and what needs the sales admin.
 *
 * Two different things are called "discount" in this business and they behave differently:
 *
 *  1. **Earned** — the client left a five-star Google review, or referred another business, or
 *     both. This is a published offer with a fixed value, and the member is not negotiating it;
 *     they are applying it. It requires proof, because the whole point is that the client actually
 *     did the thing.
 *
 *  2. **Negotiated** — the bulk volume ladder, or a figure the member agreed on the call. This is
 *     judgement, and it is the member's to exercise up to a limit.
 *
 * The rule that matters: **a member may give away 10% on their own.** Past that the sale needs the
 * sales admin's confirmation before it goes anywhere near the tech team, because a price nobody
 * has agreed is not a price you build against.
 *
 * ── Why the earned discount is capped rather than added up ────────────────────────────────────
 * A review is worth 10% and a referral is worth 10%, and doing both is worth 10% — not 20%. It is
 * a thank-you, not a currency. Each claim still needs its own screenshot, because "they said they
 * left a review" is not a review.
 */

/** What a client earns for a review, a referral, or both. Not per reason — see the header. */
export const EARNED_DISCOUNT_PERCENT = 10;

/**
 * The most a member may take off without asking anybody.
 *
 * Set equal to the earned discount on purpose: applying the published offer is always within a
 * member's own authority, so the common case never needs an approval and the approval queue only
 * ever contains real decisions.
 */
export const MEMBER_DISCOUNT_LIMIT_PERCENT = 10;

/** Proof that a client did the thing they are being thanked for. */
export interface EarnedDiscountProof {
  /** Cloudinary URL of the screenshot. Required — the claim is the screenshot. */
  screenshotUrl: string;
}

/** The reasons a client has earned a discount on this sale. */
export interface EarnedDiscount {
  /** A five-star review on the company's Google Business Profile. */
  review?: EarnedDiscountProof | null;
  /** Another business introduced by this client. */
  referral?: EarnedDiscountProof | null;
}

export type EarnedReason = "review" | "referral";

export const EARNED_REASON_LABEL: Record<EarnedReason, string> = {
  review: "Google 5-star review",
  referral: "Referred another business",
};

/** Which reasons have been claimed AND evidenced. A claim without a screenshot is not a claim. */
export function earnedReasons(earned?: EarnedDiscount | null): EarnedReason[] {
  if (!earned) return [];
  const out: EarnedReason[] = [];
  if (earned.review?.screenshotUrl) out.push("review");
  if (earned.referral?.screenshotUrl) out.push("referral");
  return out;
}

/** 10% if anything was earned, 0 if not. Never 20 — see the header. */
export function earnedDiscountPercent(earned?: EarnedDiscount | null): number {
  return earnedReasons(earned).length > 0 ? EARNED_DISCOUNT_PERCENT : 0;
}

export interface DiscountInput {
  /** The price before anything comes off — quantity × unit for bulk, the package price otherwise. */
  grossAmount: number;
  /** The negotiated discount already applied, in rupees (the bulk ladder, or a manual figure). */
  negotiatedAmount?: number;
  earned?: EarnedDiscount | null;
}

export interface DiscountBreakdown {
  grossAmount: number;
  negotiatedAmount: number;
  negotiatedPercent: number;
  earnedAmount: number;
  earnedPercent: number;
  /** Everything off, in rupees. */
  totalAmount: number;
  /** Everything off, as a percentage of the gross — the figure the 10% rule is tested against. */
  totalPercent: number;
  /** What the client actually pays. Never below zero, however the parts are combined. */
  netAmount: number;
  /** Over what a member may give on their own, so the sales admin has to confirm it. */
  needsApproval: boolean;
  reasons: EarnedReason[];
}

/**
 * Everything that comes off this sale, and whether the total is the member's to give.
 *
 * The earned discount is taken off the GROSS rather than off the already-discounted figure. Two
 * reasons: it is what a client is told ("ten percent off"), and compounding them would make the
 * same two discounts worth different amounts depending on which was applied first, which is
 * impossible to explain to anybody.
 */
export function discountBreakdown(input: DiscountInput): DiscountBreakdown {
  const grossAmount = Math.max(0, Math.round(Number(input.grossAmount) || 0));
  const negotiatedAmount = Math.max(0, Math.round(Number(input.negotiatedAmount) || 0));
  const reasons = earnedReasons(input.earned);
  const earnedPercent = earnedDiscountPercent(input.earned);
  const earnedAmount = Math.round((grossAmount * earnedPercent) / 100);

  // Capped at the gross: two discounts that together exceed the price mean the client pays nothing,
  // not that the company owes them money.
  const totalAmount = Math.min(grossAmount, negotiatedAmount + earnedAmount);
  const totalPercent = grossAmount > 0 ? (totalAmount / grossAmount) * 100 : 0;
  const negotiatedPercent = grossAmount > 0 ? (negotiatedAmount / grossAmount) * 100 : 0;

  return {
    grossAmount,
    negotiatedAmount,
    negotiatedPercent: round1(negotiatedPercent),
    earnedAmount,
    earnedPercent,
    totalAmount,
    totalPercent: round1(totalPercent),
    netAmount: Math.max(0, grossAmount - totalAmount),
    /*
      Strictly greater than the limit. Exactly 10% — which is what applying the published offer
      produces — is the member's to give, so the ordinary case never lands in the approval queue.
      Rounded first, so a rupee of rounding on an odd price does not manufacture an approval.
    */
    needsApproval: round1(totalPercent) > MEMBER_DISCOUNT_LIMIT_PERCENT,
    reasons,
  };
}

/** One decimal place — enough to tell 10% from 10.4%, without printing 10.000000001%. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Where a sale stands with the sales admin, when its discount was over the member's limit. */
export type DiscountApproval = "pending" | "approved" | "rejected";

/**
 * Whether this sale may be handed to the tech team yet.
 *
 * A sale whose discount is within the member's own authority goes straight through, exactly as
 * before. One that is over it waits — the tech team must never start building against a price
 * nobody has agreed, because the work is the expensive part and it cannot be un-made.
 */
export function releasedToTech(sale: {
  discountNeedsApproval?: boolean;
  discountApproval?: DiscountApproval | null;
}): boolean {
  if (!sale.discountNeedsApproval) return true;
  return sale.discountApproval === "approved";
}

/** "18% off — ₹900 (10% review + referral, 8% agreed)", for a card that has to justify a price. */
export function discountExplanation(b: DiscountBreakdown): string {
  if (b.totalAmount <= 0) return "";
  const parts: string[] = [];
  if (b.earnedAmount > 0) {
    parts.push(`${b.earnedPercent}% ${b.reasons.map((r) => EARNED_REASON_LABEL[r].toLowerCase()).join(" + ")}`);
  }
  if (b.negotiatedAmount > 0) parts.push(`${b.negotiatedPercent}% agreed`);
  return `${b.totalPercent}% off — ₹${b.totalAmount.toLocaleString("en-IN")}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}


/**
 * What came off one sale, for a screen that has to show it at a glance.
 *
 * Works from the stored sale rather than from a live form, so the approvals queue, a receipt and a
 * client's history all describe the same discount the same way — and so a sale saved before a rule
 * changed still reads correctly, because it reports what was recorded rather than recomputing it.
 */
export function saleDiscountOf(item: {
  amount?: number;
  discountAmount?: number | null;
  discountPercent?: number | null;
  earnedDiscountAmount?: number | null;
  quantity?: number | null;
  unitAmount?: number | null;
}): { amount: number; percent: number; label: string } {
  const negotiated = Math.max(0, Math.round(Number(item.discountAmount) || 0));
  const earned = Math.max(0, Math.round(Number(item.earnedDiscountAmount) || 0));
  const amount = negotiated + earned;
  if (amount <= 0) return { amount: 0, percent: 0, label: "" };

  // The price before anything came off: what they paid, plus what they did not.
  const net = Math.max(0, Math.round(Number(item.amount) || 0));
  const gross = net + amount;
  const percent = gross > 0 ? Math.round((amount / gross) * 1000) / 10 : 0;

  const parts = [`${percent}% off`, `₹${amount.toLocaleString("en-IN")}`];
  if (earned > 0 && negotiated > 0) parts.push("review/referral + agreed");
  else if (earned > 0) parts.push("review/referral");

  return { amount, percent, label: parts.join(" · ") };
}


/**
 * A discount the member typed, in rupees, whichever unit they typed it in.
 *
 * ── Why a percentage rounds DOWN ──────────────────────────────────────────────────────────────
 * 10% of ₹99 is ₹9.90. Rounded to ₹10 that is 10.1% of the price — past the 10% a member may give
 * on their own — so asking for exactly ten percent held the order back from the tech team and told
 * the member to go and find their admin. Rounding down cannot turn a permitted discount into a
 * forbidden one, and it costs the client at most a rupee.
 *
 * A figure typed in rupees is exact and is taken as given.
 */
export function negotiatedFromInput(
  mode: "percent" | "amount",
  value: number,
  grossAmount: number,
): number {
  const gross = Math.max(0, Math.round(Number(grossAmount) || 0));
  const v = Math.max(0, Number(value) || 0);
  if (gross <= 0 || v <= 0) return 0;
  const off = mode === "amount" ? Math.round(v) : Math.floor((gross * v) / 100);
  return Math.max(0, Math.min(gross, off));
}
