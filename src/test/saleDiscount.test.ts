import { describe, it, expect } from "vitest";
import {
  EARNED_DISCOUNT_PERCENT, MEMBER_DISCOUNT_LIMIT_PERCENT, discountBreakdown, discountExplanation,
  earnedDiscountPercent, earnedReasons, releasedToTech,
} from "@/utils/saleDiscount";

/**
 * The rules that decide what a client pays and who is allowed to decide it.
 *
 * Every number in this file is money leaving the company, so the cases pinned here are the ones a
 * sales member will actually hit on a call: the client who left a review, the one who left a
 * review AND sent a friend, and the one being given a figure the member is not entitled to give.
 */

const shot = (url = "https://cdn.test/proof.png") => ({ screenshotUrl: url });

describe("what a client earns", () => {
  it("gives nothing when nothing was claimed", () => {
    expect(earnedDiscountPercent(null)).toBe(0);
    expect(earnedDiscountPercent({})).toBe(0);
  });

  it("gives 10% for a Google review", () => {
    expect(earnedDiscountPercent({ review: shot() })).toBe(EARNED_DISCOUNT_PERCENT);
  });

  it("gives 10% for a referral", () => {
    expect(earnedDiscountPercent({ referral: shot() })).toBe(EARNED_DISCOUNT_PERCENT);
  });

  it("still gives 10% for both — it is a thank-you, not a currency", () => {
    const both = { review: shot("a.png"), referral: shot("b.png") };
    expect(earnedDiscountPercent(both)).toBe(10);
    expect(earnedReasons(both)).toEqual(["review", "referral"]);
  });

  it("ignores a claim with no screenshot behind it", () => {
    // "They said they left a review" is not a review.
    expect(earnedDiscountPercent({ review: { screenshotUrl: "" } })).toBe(0);
    expect(earnedReasons({ referral: null })).toEqual([]);
  });
});

describe("what comes off the price", () => {
  it("takes the earned discount off the gross", () => {
    const b = discountBreakdown({ grossAmount: 1000, earned: { review: shot() } });
    expect(b.earnedAmount).toBe(100);
    expect(b.netAmount).toBe(900);
    expect(b.totalPercent).toBe(10);
  });

  it("adds a negotiated discount to an earned one rather than compounding them", () => {
    // Compounding would make the same two discounts worth different amounts depending on the
    // order they were applied in, which is impossible to explain to a client.
    const b = discountBreakdown({ grossAmount: 1000, negotiatedAmount: 80, earned: { review: shot() } });
    expect(b.earnedAmount).toBe(100);
    expect(b.negotiatedAmount).toBe(80);
    expect(b.totalAmount).toBe(180);
    expect(b.netAmount).toBe(820);
  });

  it("never hands money back when the discounts exceed the price", () => {
    const b = discountBreakdown({ grossAmount: 500, negotiatedAmount: 900, earned: { review: shot() } });
    expect(b.netAmount).toBe(0);
    expect(b.totalAmount).toBe(500);
  });

  it("copes with a free line without dividing by zero", () => {
    const b = discountBreakdown({ grossAmount: 0, earned: { review: shot() } });
    expect(b.totalPercent).toBe(0);
    expect(b.netAmount).toBe(0);
    expect(b.needsApproval).toBe(false);
  });
});

describe("who is allowed to give it", () => {
  it("lets a member apply the published offer on their own", () => {
    // Exactly 10% is the ordinary case; it must never reach the approval queue.
    const b = discountBreakdown({ grossAmount: 1000, earned: { review: shot() } });
    expect(b.totalPercent).toBe(MEMBER_DISCOUNT_LIMIT_PERCENT);
    expect(b.needsApproval).toBe(false);
  });

  it("lets a member give up to 10% of their own accord", () => {
    expect(discountBreakdown({ grossAmount: 1000, negotiatedAmount: 100 }).needsApproval).toBe(false);
  });

  it("asks the sales admin past 10%", () => {
    expect(discountBreakdown({ grossAmount: 1000, negotiatedAmount: 101 }).needsApproval).toBe(true);
  });

  it("asks when a bulk ladder discount and an earned one add up past the limit", () => {
    // 8% ladder + 10% review = 18%, which is the case the rule exists for.
    const b = discountBreakdown({ grossAmount: 10000, negotiatedAmount: 800, earned: { referral: shot() } });
    expect(b.totalPercent).toBe(18);
    expect(b.needsApproval).toBe(true);
  });

  it("does not manufacture an approval out of a rupee of rounding", () => {
    // ₹333 at 10% is ₹33.3, stored as ₹33 — which must not read as 9.9% one way or 10.1% the other.
    const b = discountBreakdown({ grossAmount: 333, earned: { review: shot() } });
    expect(b.needsApproval).toBe(false);
  });
});

describe("whether the tech team may start", () => {
  it("releases a sale nobody had to approve", () => {
    expect(releasedToTech({})).toBe(true);
    expect(releasedToTech({ discountNeedsApproval: false })).toBe(true);
  });

  it("holds one that is waiting on the sales admin", () => {
    // The work is the expensive part and it cannot be un-made, so it does not start against a
    // price nobody has agreed.
    expect(releasedToTech({ discountNeedsApproval: true })).toBe(false);
    expect(releasedToTech({ discountNeedsApproval: true, discountApproval: "pending" })).toBe(false);
  });

  it("keeps holding one the sales admin turned down", () => {
    expect(releasedToTech({ discountNeedsApproval: true, discountApproval: "rejected" })).toBe(false);
  });

  it("releases it the moment the sales admin agrees the price", () => {
    expect(releasedToTech({ discountNeedsApproval: true, discountApproval: "approved" })).toBe(true);
  });
});

describe("explaining a price that moved", () => {
  it("says what came off and why", () => {
    const b = discountBreakdown({ grossAmount: 10000, negotiatedAmount: 800, earned: { review: shot() } });
    const text = discountExplanation(b);
    expect(text).toContain("18% off");
    expect(text).toContain("₹1,800");
    expect(text).toContain("google 5-star review");
    expect(text).toContain("8% agreed");
  });

  it("says nothing at all when nothing came off", () => {
    expect(discountExplanation(discountBreakdown({ grossAmount: 999 }))).toBe("");
  });
});
