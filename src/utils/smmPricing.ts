/**
 * Pricing a social-media month: the package, the add-ons, and the figure the client actually
 * agreed to.
 *
 * ── Why "committed price" is an input and not an output ───────────────────────────────────────
 * Everywhere else in this app a price is built up: pick a package, apply a discount, read the
 * total. A monthly retainer is not sold that way. The member quotes ₹22,000, the client says
 * ₹18,000, and what gets written down is ₹18,000 — the discount is a *consequence* of the
 * haggling, not the thing anybody negotiated. Making the member work out that ₹18,000 is ₹4,000
 * off, and type the ₹4,000, is asking them to do arithmetic on a call and get it wrong.
 *
 * So both directions are offered and they are the same number seen from two ends: type the price
 * the client committed to and the discount falls out; type the discount and the final amount falls
 * out. Everything downstream — the 10% authority rule, the approval hold, commission — reads the
 * discount in rupees, exactly as it always has. Nothing else in the pipeline learns a new concept.
 */

import { SMM_CONTENT_KINDS, type SmmContentKind, type SmmPlatform } from "@/types/smm";
import { packageDeliverables, packagePlatforms } from "@/utils/serviceCatalog";

/**
 * Editing one video the client shot, and posting it. ₹500 covers both.
 *
 * Not in any package, and deliberately so: it depends entirely on the client having footage worth
 * posting, which most do not until a month or two in. It is the commonest thing asked for on top
 * of a package, which is exactly why it needs a rate rather than a conversation every time.
 */
export const SMM_REAL_VIDEO_RATE = 500;

/** How the member is entering the negotiation: what it costs off, or what they pay. */
export type SmmPriceMode = "amount" | "percent" | "final";

export interface SmmAddOns {
  /** Client-supplied footage we edit and post, at `SMM_REAL_VIDEO_RATE` each. */
  realVideos: number;
}

export const NO_ADDONS: SmmAddOns = { realVideos: 0 };

/** What the add-ons come to, and the line to show for them. */
export function addOnsTotal(addOns: SmmAddOns | null | undefined): number {
  const n = Math.max(0, Math.floor(Number(addOns?.realVideos) || 0));
  return n * SMM_REAL_VIDEO_RATE;
}

export interface SmmQuoteInput {
  /** The package's own price. 0 for a custom-priced month. */
  packageAmount: number;
  addOns?: SmmAddOns | null;
  mode: SmmPriceMode;
  /**
   * What the member typed, read in whichever unit `mode` is on: rupees off, percent off, or the
   * price the client committed to.
   */
  value: number;
}

export interface SmmQuote {
  packageAmount: number;
  addOnAmount: number;
  /** Package + add-ons, before anything came off. What the client was quoted. */
  grossAmount: number;
  /** In rupees, however it was typed. This is what the sale stores. */
  discountAmount: number;
  /** One decimal place, for the badge and for the 10% authority test. */
  discountPercent: number;
  /** What the client pays. */
  finalAmount: number;
}

/** One decimal place — enough to tell 10% from 10.4%, without printing 10.000000001%. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The whole quote, from whichever end the member entered it.
 *
 * A committed price above the gross is not a negative discount — a client who agrees to pay more
 * than they were quoted has simply agreed the quote — so it clamps to zero off. A committed price
 * below zero clamps to the whole gross. Neither is a case anybody types on purpose; both are cases
 * a number box allows, and a price is not the place to find out what happens then.
 */
export function quoteSmm(input: SmmQuoteInput): SmmQuote {
  const packageAmount = Math.max(0, Math.round(Number(input.packageAmount) || 0));
  const addOnAmount = addOnsTotal(input.addOns);
  const grossAmount = packageAmount + addOnAmount;
  const value = Number(input.value) || 0;

  let discountAmount: number;
  if (input.mode === "final") {
    /*
      An empty box means "we have not bargained yet", not "they pay nothing".

      This is the default state of the form, so reading a blank as ₹0 committed made every
      social-media sale open at 100% off — a full discount, an approval hold, and a price of zero
      staring back at a member who had typed nothing at all. A month genuinely given away free is
      recorded as a discount, which is what it is.
    */
    if (value <= 0) {
      discountAmount = 0;
    } else {
      const committed = Math.round(value);
      discountAmount = Math.max(0, Math.min(grossAmount, grossAmount - committed));
    }
  } else if (input.mode === "percent") {
    // Rounded DOWN, for the same reason `negotiatedFromInput` does it: rounding ten percent up
    // turns a discount the member may give into one that needs their admin's signature.
    const pct = Math.max(0, value);
    discountAmount = grossAmount > 0 ? Math.max(0, Math.min(grossAmount, Math.floor((grossAmount * pct) / 100))) : 0;
  } else {
    discountAmount = Math.max(0, Math.min(grossAmount, Math.round(value)));
  }

  return {
    packageAmount,
    addOnAmount,
    grossAmount,
    discountAmount,
    discountPercent: grossAmount > 0 ? round1((discountAmount / grossAmount) * 100) : 0,
    finalAmount: Math.max(0, grossAmount - discountAmount),
  };
}

/**
 * What to put in the box when the member switches units, so the price does not jump under them.
 *
 * Switching from "₹4,000 off" to percent should show 18.2, not 4000; switching to "price they
 * committed to" should show 18,000. Without this the same figure is read in a new unit and the
 * quote silently becomes something nobody agreed.
 */
export function valueForMode(quote: SmmQuote, mode: SmmPriceMode): number {
  if (mode === "final") return quote.finalAmount;
  if (mode === "percent") return quote.discountPercent;
  return quote.discountAmount;
}

/**
 * What a package promises, as the three kinds this section plans in.
 *
 * The catalogue counts a month in `ads` and `posters` (see utils/serviceCatalog.PackageDeliverables)
 * because that is what the tech side has always tracked. This section plans in posters, AI ads and
 * real videos — the same ads, named for what they actually are, plus the add-on the catalogue has
 * no row for. Real videos are never part of a package, so they come only from what was sold on top.
 */
export function commitmentsForPackage(
  packageKey: string | null | undefined,
  addOns?: SmmAddOns | null,
): Record<SmmContentKind, number> {
  const quota = packageKey ? packageDeliverables("social_media_management", packageKey) : undefined;
  return {
    poster: Math.max(0, Math.floor(quota?.posters ?? 0)),
    ai_ad: Math.max(0, Math.floor(quota?.ads ?? 0)),
    real_video: Math.max(0, Math.floor(Number(addOns?.realVideos) || 0)),
  };
}

/** Total pieces of content a month owes. The denominator of the fulfilment bar. */
export function totalCommitted(commitments: Record<SmmContentKind, number>): number {
  return SMM_CONTENT_KINDS.reduce((n, k) => n + (commitments[k.key] || 0), 0);
}

/**
 * The accounts a package covers, as platform keys.
 *
 * The catalogue stores them as display names ("Instagram", "YouTube") because they are read back
 * to the client in their confirmation. This maps them onto the keys the campaign stores, so the
 * sale form opens with the right boxes ticked and nobody has to remember which tier includes
 * LinkedIn.
 */
export function platformsForPackage(packageKey: string | null | undefined): SmmPlatform[] {
  const names = packagePlatforms("social_media_management", packageKey).map((p) => p.toLowerCase());
  const known: SmmPlatform[] = ["instagram", "facebook", "youtube", "linkedin", "x"];
  return known.filter((k) => names.includes(k));
}
