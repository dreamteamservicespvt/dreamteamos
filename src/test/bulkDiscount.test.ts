import { describe, it, expect } from "vitest";
import {
  suggestedDiscountPercent, clampDiscountPercent, quoteBulk, MAX_BULK_DISCOUNT_PERCENT,
  maxDiscountAmount, discountSummary,
} from "@/utils/bulkDiscount";

describe("suggested discount ladder", () => {
  it("offers nothing below five ads", () => {
    expect(suggestedDiscountPercent(0)).toBe(0);
    expect(suggestedDiscountPercent(1)).toBe(0);
    expect(suggestedDiscountPercent(4)).toBe(0);
  });

  it("steps 5% / 10% / 20% at 5, 10 and 20", () => {
    expect(suggestedDiscountPercent(5)).toBe(5);
    expect(suggestedDiscountPercent(9)).toBe(5);
    expect(suggestedDiscountPercent(10)).toBe(10);
    expect(suggestedDiscountPercent(19)).toBe(10);
    expect(suggestedDiscountPercent(20)).toBe(20);
  });

  it("caps at 20% however many are bought", () => {
    expect(suggestedDiscountPercent(200)).toBe(MAX_BULK_DISCOUNT_PERCENT);
  });
});

describe("clampDiscountPercent", () => {
  it("keeps a typed percent inside 0…20", () => {
    expect(clampDiscountPercent(-5)).toBe(0);
    expect(clampDiscountPercent(0)).toBe(0);
    expect(clampDiscountPercent(12)).toBe(12);
    expect(clampDiscountPercent(90)).toBe(20);
  });

  it("survives a half-typed box", () => {
    expect(clampDiscountPercent(NaN)).toBe(0);
  });
});

describe("quoteBulk", () => {
  it("prices 8 × ₹999 with the suggested 5%", () => {
    const q = quoteBulk(8, 999);
    expect(q.grossAmount).toBe(7992);
    expect(q.discountPercent).toBe(5);
    expect(q.discountAmount).toBe(400);
    expect(q.amount).toBe(7592);
    expect(q.edited).toBe(false);
  });

  it("gross minus discount always reconciles to the amount", () => {
    for (const qty of [3, 5, 7, 10, 13, 20, 33]) {
      const q = quoteBulk(qty, 1499);
      expect(q.grossAmount - q.discountAmount).toBe(q.amount);
    }
  });

  it("honours a discount the member removed entirely", () => {
    const q = quoteBulk(12, 999, 0);
    expect(q.discountPercent).toBe(0);
    expect(q.amount).toBe(q.grossAmount);
    // Withholding the ladder's offer is itself a departure the admins should see.
    expect(q.edited).toBe(true);
  });

  it("flags a discount pushed above the suggestion", () => {
    const q = quoteBulk(6, 999, 15);
    expect(q.suggestedPercent).toBe(5);
    expect(q.discountPercent).toBe(15);
    expect(q.edited).toBe(true);
  });

  it("does not flag a member who re-typed the same number the ladder offered", () => {
    expect(quoteBulk(10, 999, 10).edited).toBe(false);
  });

  it("never lets a typed percent exceed the cap", () => {
    expect(quoteBulk(25, 1999, 80).discountPercent).toBe(20);
  });

  it("treats a blank quantity as nothing sold rather than a negative price", () => {
    const q = quoteBulk(0, 999);
    expect(q.amount).toBe(0);
    expect(q.grossAmount).toBe(0);
  });
});

describe("quoteBulk in rupees", () => {
  it("takes a flat discount and reports what it is worth as a percent", () => {
    const q = quoteBulk(10, 1000, 1500, "amount");
    expect(q.grossAmount).toBe(10000);
    expect(q.discountAmount).toBe(1500);
    expect(q.discountPercent).toBe(15);
    expect(q.amount).toBe(8500);
    expect(q.discountMode).toBe("amount");
  });

  it("holds the 20% ceiling however many rupees are typed", () => {
    const q = quoteBulk(10, 1000, 9000, "amount");
    expect(q.discountAmount).toBe(maxDiscountAmount(10000));
    expect(q.discountAmount).toBe(2000);
    expect(q.discountPercent).toBe(MAX_BULK_DISCOUNT_PERCENT);
    expect(q.amount).toBe(8000);
  });

  it("does not flag a member who typed the exact rupee value of the ladder's offer", () => {
    // 10 × ₹1,000 suggests 10% = ₹1,000. Typing that in rupees is the same decision, not a change.
    const q = quoteBulk(10, 1000, 1000, "amount");
    expect(q.suggestedAmount).toBe(1000);
    expect(q.edited).toBe(false);
  });

  it("flags a flat discount that departs from the ladder", () => {
    const q = quoteBulk(10, 1000, 1500, "amount");
    expect(q.edited).toBe(true);
  });

  it("gross minus discount reconciles in rupee mode too", () => {
    for (const value of [0, 137, 999, 5000]) {
      const q = quoteBulk(13, 1499, value, "amount");
      expect(q.grossAmount - q.discountAmount).toBe(q.amount);
    }
  });

  it("survives a blank box and a zero-priced order", () => {
    expect(quoteBulk(10, 1000, NaN, "amount").discountAmount).toBe(0);
    const empty = quoteBulk(0, 0, 500, "amount");
    expect(empty.discountAmount).toBe(0);
    expect(empty.discountPercent).toBe(0);
    expect(empty.amount).toBe(0);
  });
});

describe("discountSummary", () => {
  it("shows the discount in the unit it was given in", () => {
    expect(discountSummary({ discountMode: "amount", discountAmount: 2000, discountPercent: 20 }))
      .toBe(" · ₹2,000 off");
    expect(discountSummary({ discountMode: "percent", discountAmount: 2000, discountPercent: 20 }))
      .toBe(" · 20% off");
  });

  it("says nothing when no discount was given", () => {
    expect(discountSummary({ discountPercent: 0 })).toBe("");
    expect(discountSummary({})).toBe("");
    // A legacy sale predates the mode field and is a percentage by definition.
    expect(discountSummary({ discountPercent: 10 })).toBe(" · 10% off");
  });
});
