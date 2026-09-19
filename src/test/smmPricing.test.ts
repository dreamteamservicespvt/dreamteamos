/**
 * Pricing a social-media month.
 *
 * The case that matters most is the one the whole feature was asked for: the member types what the
 * client agreed to pay, and the discount has to fall out of it correctly — because that discount is
 * what the 10% authority rule is tested against, and getting it wrong either lets an unapproved
 * price reach the tech team or holds up a price that never needed approving.
 */
import { describe, it, expect } from "vitest";
import {
  SMM_REAL_VIDEO_RATE, addOnsTotal, commitmentsForPackage, platformsForPackage, quoteSmm,
  totalCommitted, valueForMode,
} from "@/utils/smmPricing";
import { discountBreakdown } from "@/utils/saleDiscount";

describe("add-ons", () => {
  it("prices real videos at the per-video rate", () => {
    expect(addOnsTotal({ realVideos: 10 })).toBe(10 * SMM_REAL_VIDEO_RATE);
    expect(addOnsTotal({ realVideos: 0 })).toBe(0);
    expect(addOnsTotal(null)).toBe(0);
  });

  it("ignores a negative or fractional count rather than pricing it", () => {
    expect(addOnsTotal({ realVideos: -4 })).toBe(0);
    expect(addOnsTotal({ realVideos: 2.7 })).toBe(2 * SMM_REAL_VIDEO_RATE);
  });
});

describe("quoteSmm — the price the client committed to", () => {
  it("adds the add-ons to the package to get the quoted price", () => {
    const q = quoteSmm({ packageAmount: 20000, addOns: { realVideos: 10 }, mode: "final", value: 0 });
    expect(q.grossAmount).toBe(25000);
    expect(q.addOnAmount).toBe(5000);
  });

  it("derives the discount from the committed price", () => {
    const q = quoteSmm({ packageAmount: 20000, addOns: { realVideos: 10 }, mode: "final", value: 22000 });
    expect(q.discountAmount).toBe(3000);
    expect(q.finalAmount).toBe(22000);
    expect(q.discountPercent).toBe(12);
  });

  it("derives the final amount from a discount in rupees", () => {
    const q = quoteSmm({ packageAmount: 20000, addOns: { realVideos: 10 }, mode: "amount", value: 3000 });
    expect(q.finalAmount).toBe(22000);
    expect(q.discountAmount).toBe(3000);
  });

  it("derives the final amount from a percentage, rounding the discount DOWN", () => {
    // 10% of 25,000 is exact; the rounding rule only shows on an odd gross.
    expect(quoteSmm({ packageAmount: 25000, mode: "percent", value: 10 }).discountAmount).toBe(2500);
    // 10% of 10,999 is 1,099.9 → 1,099, which is under 10% and so stays within a member's own
    // authority. Rounding up would make asking for exactly ten percent need an admin.
    const odd = quoteSmm({ packageAmount: 10999, mode: "percent", value: 10 });
    expect(odd.discountAmount).toBe(1099);
    expect(odd.discountPercent).toBeLessThanOrEqual(10);
  });

  it("reads an empty committed-price box as 'not bargained yet', never as a free month", () => {
    // This is the form's default state. Read as ₹0 committed it would open every social-media sale
    // at 100% off, held for an admin, with a price of zero in front of a member who typed nothing.
    const q = quoteSmm({ packageAmount: 20000, mode: "final", value: 0 });
    expect(q.discountAmount).toBe(0);
    expect(q.finalAmount).toBe(20000);
  });

  it("treats a committed price above the quote as no discount, not a negative one", () => {
    const q = quoteSmm({ packageAmount: 20000, mode: "final", value: 30000 });
    expect(q.discountAmount).toBe(0);
    expect(q.finalAmount).toBe(20000);
  });

  it("never discounts more than the whole price", () => {
    expect(quoteSmm({ packageAmount: 20000, mode: "amount", value: 90000 }).finalAmount).toBe(0);
    expect(quoteSmm({ packageAmount: 20000, mode: "percent", value: 500 }).finalAmount).toBe(0);
  });

  it("handles a custom-priced month with no package", () => {
    const q = quoteSmm({ packageAmount: 0, addOns: { realVideos: 4 }, mode: "final", value: 1500 });
    expect(q.grossAmount).toBe(2000);
    expect(q.discountAmount).toBe(500);
  });
});

describe("the discount this produces is the one the authority rule sees", () => {
  it("keeps a modest bargain within the member's own 10%", () => {
    const q = quoteSmm({ packageAmount: 20000, mode: "final", value: 18500 });
    const d = discountBreakdown({ grossAmount: q.grossAmount, negotiatedAmount: q.discountAmount });
    expect(d.needsApproval).toBe(false);
  });

  it("holds a heavy bargain back for the sales admin", () => {
    const q = quoteSmm({ packageAmount: 20000, mode: "final", value: 15000 });
    const d = discountBreakdown({ grossAmount: q.grossAmount, negotiatedAmount: q.discountAmount });
    expect(d.totalPercent).toBe(25);
    expect(d.needsApproval).toBe(true);
  });
});

describe("valueForMode — switching units must not move the price", () => {
  it("re-reads the same quote in whichever unit is chosen", () => {
    const q = quoteSmm({ packageAmount: 20000, addOns: { realVideos: 10 }, mode: "final", value: 22000 });
    expect(valueForMode(q, "final")).toBe(22000);
    expect(valueForMode(q, "amount")).toBe(3000);
    expect(valueForMode(q, "percent")).toBe(12);

    // And re-quoting from the switched value lands on the same final amount.
    const again = quoteSmm({ packageAmount: 20000, addOns: { realVideos: 10 }, mode: "amount", value: valueForMode(q, "amount") });
    expect(again.finalAmount).toBe(q.finalAmount);
  });
});

describe("what a package commits us to", () => {
  it("reads the quota as posters and AI ads, and takes real videos from the add-on", () => {
    const c = commitmentsForPackage("Pro Package", { realVideos: 3 });
    expect(c.poster).toBe(8);
    expect(c.ai_ad).toBe(8);
    expect(c.real_video).toBe(3);
    expect(totalCommitted(c)).toBe(19);
  });

  it("commits to nothing countable for a package with no quota", () => {
    const c = commitmentsForPackage("", null);
    expect(c).toEqual({ poster: 0, ai_ad: 0, real_video: 0 });
  });

  it("opens with the accounts the package covers", () => {
    expect(platformsForPackage("Starter Package")).toEqual(["instagram", "facebook"]);
    expect(platformsForPackage("Pro Package")).toEqual(["instagram", "facebook", "youtube", "linkedin"]);
    expect(platformsForPackage(null)).toEqual([]);
  });
});
