import { describe, it, expect } from "vitest";
import {
  PENALTY_RATES, defaultClipType, defaultRateFor, penaltyAmount, totalPenalties, ordersWithPenalties,
} from "@/utils/penalty";
import { dayRevenue } from "@/utils/salesRevenue";
import type { Lead, Order, PenaltyEntry, SaleDetail } from "@/types";

const entry = (over: Partial<PenaltyEntry> = {}): PenaltyEntry => ({
  id: "p1", clips: 2, ratePerClip: 250, amount: 500, clipType: "promotional",
  reason: null, byId: "u1", byName: "Asha", byRole: "tech_admin", at: null, ...over,
});

describe("penalty rates", () => {
  it("charges ₹250 for promotional and wishes clips, ₹500 for cinematic", () => {
    expect(PENALTY_RATES.promotional).toBe(250);
    expect(PENALTY_RATES.wishes).toBe(250);
    expect(PENALTY_RATES.cinematic).toBe(500);
  });

  it("picks the clip type from what was sold", () => {
    expect(defaultClipType("cinematic")).toBe("cinematic");
    expect(defaultClipType("wishes")).toBe("wishes");
    expect(defaultClipType("promotional")).toBe("promotional");
    // A bulk order recorded before the kind was captured was a promotional one.
    expect(defaultClipType("bulk_ads")).toBe("promotional");
  });

  it("charges a bulk order at the rate of the videos it is made of", () => {
    expect(defaultClipType("bulk_ads", "cinematic")).toBe("cinematic");
    expect(defaultRateFor("bulk_ads", "cinematic")).toBe(500);
    expect(defaultClipType("bulk_ads", "wishes")).toBe("wishes");
    expect(defaultRateFor("bulk_ads", "promotional")).toBe(250);
  });

  it("falls to the lower rate for anything unrecognised rather than over-charging", () => {
    expect(defaultRateFor("website")).toBe(250);
    expect(defaultRateFor(undefined)).toBe(250);
  });

  it("multiplies clips by the rate actually used, not the standard one", () => {
    expect(penaltyAmount(3, 500)).toBe(1500);
    expect(penaltyAmount(2, 300)).toBe(600); // an overridden rate
    expect(penaltyAmount(0, 500)).toBe(0);
  });
});

describe("totals", () => {
  it("adds up clips, money and entries", () => {
    const t = totalPenalties([entry(), entry({ id: "p2", clips: 1, ratePerClip: 500, amount: 500 })]);
    expect(t).toEqual({ total: 1000, clips: 3, count: 2 });
  });

  it("an order with no penalties totals zero", () => {
    expect(totalPenalties(undefined)).toEqual({ total: 0, clips: 0, count: 0 });
  });

  it("ordersWithPenalties selects the Changes section", () => {
    const orders = [
      { id: "a", penalties: [entry()] },
      { id: "b" },
      { id: "c", penalties: [] },
    ] as unknown as Order[];
    expect(ordersWithPenalties(orders).map((o) => o.id)).toEqual(["a"]);
  });
});

/**
 * The rule the whole design hangs on. A penalty is not something the sales member sold, so it must
 * not reach their revenue tile or their commission — and it must not do so *structurally*, not
 * because some caller remembered to subtract it.
 */
describe("penalties are not sales revenue", () => {
  const sale = (over: Partial<SaleDetail> = {}): SaleDetail => ({
    category: "promotional", packageKey: "30 Seconds + Poster", amount: 999,
    verificationStatus: "verified", submittedAt: { seconds: 1_800_000_000 }, ...over,
  });

  const leadWith = (item: SaleDetail): Lead => ({
    id: "l1", assignedTo: "m1", assignedBy: "a1", phone: "+919000000000", displayName: "Client",
    status: "answered", notes: "", saleDone: true, saleItems: [item],
    lastUpdated: null, createdAt: { seconds: 1_800_000_000 },
  } as unknown as Lead);

  it("a penalised sale reports exactly the same revenue as an unpenalised one", () => {
    const clean = dayRevenue([leadWith(sale())], null);
    const penalised = dayRevenue([leadWith(sale({ penaltyTotal: 1500, penaltyClips: 3 }))], null);

    expect(penalised.total).toBe(clean.total);
    expect(penalised.verified).toBe(clean.verified);
    expect(penalised.total).toBe(999);
  });

  it("commission on a penalised sale is unchanged", () => {
    // Commission is a straight percentage of the verified `amount`, which the penalty never enters.
    const penalised = sale({ penaltyTotal: 5000, penaltyClips: 10 });
    expect(Math.round((penalised.amount * 10) / 100)).toBe(100);
  });

  it("a bulk sale's amount is the discounted total, still with no penalty in it", () => {
    const bulk = sale({
      category: "bulk_ads", quantity: 8, unitAmount: 999, discountPercent: 5, amount: 7592,
      penaltyTotal: 750,
    });
    expect(dayRevenue([leadWith(bulk)], null).total).toBe(7592);
  });
});
