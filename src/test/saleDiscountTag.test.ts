import { describe, it, expect } from "vitest";
import {
  saleDiscountOf, discountBreakdown, negotiatedFromInput, MEMBER_DISCOUNT_LIMIT_PERCENT,
} from "@/utils/saleDiscount";

/**
 * What an approver is shown about a price that was reduced.
 *
 * The gap this closes: the queue only ever warned about discounts past a member's own authority, so
 * an ordinary reduction — a few hundred rupees off, entirely within the rules — looked identical to
 * a sale at full price. "Select all → Verify" is the fastest way through a morning, and it was also
 * the fastest way to agree a price nobody had looked at.
 */

describe("what came off a sale", () => {
  it("says nothing when nothing came off", () => {
    expect(saleDiscountOf({ amount: 999 })).toEqual({ amount: 0, percent: 0, label: "" });
  });

  /** The percentage is of the ORIGINAL price, which is what the client was quoted. */
  it("reports a negotiated discount against the price before it", () => {
    const d = saleDiscountOf({ amount: 900, discountAmount: 100 });
    expect(d.amount).toBe(100);
    expect(d.percent).toBe(10);
    expect(d.label).toContain("10% off");
  });

  it("counts an earned discount too", () => {
    const d = saleDiscountOf({ amount: 900, earnedDiscountAmount: 100 });
    expect(d.amount).toBe(100);
    expect(d.label).toContain("review/referral");
  });

  it("adds the two together and names both", () => {
    const d = saleDiscountOf({ amount: 800, discountAmount: 100, earnedDiscountAmount: 100 });
    expect(d.amount).toBe(200);
    expect(d.percent).toBe(20);
    expect(d.label).toContain("review/referral + agreed");
  });

  it("survives a sale with no figures on it at all", () => {
    expect(saleDiscountOf({}).amount).toBe(0);
  });
});

/**
 * The authority rule, now reachable from an ordinary sale as well as a bulk one.
 *
 * A member may give MEMBER_DISCOUNT_LIMIT_PERCENT on their own; past that the order is held back
 * from the tech team until the sales admin agrees the price.
 */
describe("who may give the discount", () => {
  it("lets a member give up to their own limit without approval", () => {
    const b = discountBreakdown({ grossAmount: 1000, negotiatedAmount: 100 });
    expect(b.totalPercent).toBe(MEMBER_DISCOUNT_LIMIT_PERCENT);
    expect(b.needsApproval).toBe(false);
    expect(b.netAmount).toBe(900);
  });

  it("sends anything past it to the sales admin", () => {
    const b = discountBreakdown({ grossAmount: 1000, negotiatedAmount: 150 });
    expect(b.needsApproval).toBe(true);
  });

  /**
   * The published offer plus a negotiated reduction can cross the line together, and it is the
   * TOTAL that decides — otherwise 10% earned plus 10% agreed would pass as two allowed halves.
   */
  it("measures the two kinds of discount together, not separately", () => {
    const b = discountBreakdown({
      grossAmount: 1000,
      negotiatedAmount: 100,
      earned: { review: { screenshotUrl: "x" } },
    });
    expect(b.totalPercent).toBe(20);
    expect(b.needsApproval).toBe(true);
  });

  it("never lets a discount make the price negative", () => {
    const b = discountBreakdown({ grossAmount: 500, negotiatedAmount: 900 });
    expect(b.netAmount).toBe(0);
  });
});


/**
 * Turning what the member typed into rupees.
 *
 * The case that matters is the boring one: a member asking for exactly the percentage they are
 * allowed to give must not be told they need permission.
 */
describe("converting a typed discount into rupees", () => {
  it("never lets rounding push a permitted percentage over the limit", () => {
    // 10% of 99 is 9.90. Rounded up to 10 that is 10.1% — and the sale would have been held.
    const off = negotiatedFromInput("percent", MEMBER_DISCOUNT_LIMIT_PERCENT, 99);
    const b = discountBreakdown({ grossAmount: 99, negotiatedAmount: off });

    expect(off).toBe(9);
    expect(b.needsApproval).toBe(false);
  });

  it("holds for a whole range of awkward prices", () => {
    for (const price of [99, 249, 499, 999, 1499, 1999, 2499, 7592]) {
      const off = negotiatedFromInput("percent", MEMBER_DISCOUNT_LIMIT_PERCENT, price);
      expect(
        discountBreakdown({ grossAmount: price, negotiatedAmount: off }).needsApproval,
        `${price} should not need approval at ${MEMBER_DISCOUNT_LIMIT_PERCENT}%`,
      ).toBe(false);
    }
  });

  it("takes a rupee figure exactly as typed", () => {
    expect(negotiatedFromInput("amount", 150, 999)).toBe(150);
  });

  it("never gives away more than the price", () => {
    expect(negotiatedFromInput("amount", 5000, 999)).toBe(999);
    expect(negotiatedFromInput("percent", 200, 999)).toBe(999);
  });

  it("is nothing when there is nothing to discount", () => {
    expect(negotiatedFromInput("percent", 10, 0)).toBe(0);
    expect(negotiatedFromInput("amount", 0, 999)).toBe(0);
    expect(negotiatedFromInput("percent", -5, 999)).toBe(0);
  });
});
