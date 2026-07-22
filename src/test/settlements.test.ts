import { describe, it, expect, vi } from "vitest";

// Avoid initialising the real Firebase app (node test env has no IndexedDB).
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn() }));

import {
  commissionRate, computeCommissionInRange, computeUnpaidCommission, countPendingSales,
  lastSettlementOf, earliestVerifiedSaleDate, paidThrough, totalPaid,
} from "@/services/settlements";
import type { CommissionSettlement, Lead, SaleDetail } from "@/types";

// Build a Firestore-Timestamp-like value at local noon, so date formatting is tz-stable.
const tsAt = (y: number, m: number, d: number) => ({ seconds: Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000) });
const tsMs = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

function sale(amount: number, status: SaleDetail["verificationStatus"], y: number, m: number, d: number): SaleDetail {
  return { amount, verificationStatus: status, category: "promotional", packageKey: "x", submittedAt: tsAt(y, m, d) } as SaleDetail;
} 
// Sale with an explicit verification moment (h = hour), used for the timestamp-cut tests.
function verifiedSale(amount: number, y: number, m: number, d: number, h = 12): SaleDetail {
  return { amount, verificationStatus: "verified", category: "promotional", packageKey: "x", submittedAt: tsAt(y, m, d), verifiedAt: { seconds: Math.floor(tsMs(y, m, d, h) / 1000) } } as SaleDetail;
}
function lead(items: SaleDetail[], assignedTo = "m1"): Lead {
  return { id: "L" + Math.random().toString(36).slice(2), assignedTo, saleItems: items } as unknown as Lead;
}

describe("commissionRate", () => {
  it("is 10% for incentive_10 and 5% otherwise", () => {
    expect(commissionRate("incentive_10")).toBe(10);
    expect(commissionRate("stipend_plus_5")).toBe(5);
    expect(commissionRate(undefined)).toBe(5);
  });
});

describe("computeCommissionInRange", () => {
  const leads = [
    lead([
      sale(1000, "verified", 2026, 6, 10),
      sale(500, "pending", 2026, 6, 12),   // excluded: not verified
      sale(2000, "verified", 2026, 6, 20),
      sale(999, "rejected", 2026, 6, 15),  // excluded: rejected
      sale(3000, "verified", 2026, 7, 1),  // excluded: out of range
    ]),
  ];

  it("sums only verified sales within the inclusive range and applies the rate", () => {
    const r = computeCommissionInRange(leads, "2026-06-01", "2026-06-30", 10);
    expect(r.base).toBe(3000);
    expect(r.saleCount).toBe(2);
    expect(r.commission).toBe(300);
  });

  it("applies a 5% rate", () => {
    const r = computeCommissionInRange(leads, "2026-06-01", "2026-06-30", 5);
    expect(r.commission).toBe(150);
  });

  it("treats range boundaries as inclusive", () => {
    const r = computeCommissionInRange(leads, "2026-06-10", "2026-06-20", 10);
    expect(r.base).toBe(3000); // both the 10th and the 20th count
    expect(r.saleCount).toBe(2);
  });

  it("excludes a sale one day before the from date", () => {
    const r = computeCommissionInRange(leads, "2026-06-11", "2026-06-30", 10);
    expect(r.base).toBe(2000); // the 10th drops out
  });

  it("rounds commission to the nearest rupee", () => {
    const r = computeCommissionInRange([lead([sale(999, "verified", 2026, 6, 5)])], "2026-06-01", "2026-06-30", 5);
    expect(r.commission).toBe(50); // 999 * 5% = 49.95 -> 50
  });

  it("falls back to lead.createdAt when a sale item has no submittedAt", () => {
    const l = { id: "Lx", assignedTo: "m1", createdAt: tsAt(2026, 6, 8), saleItems: [{ amount: 400, verificationStatus: "verified", category: "logo", packageKey: "x" }] } as unknown as Lead;
    const r = computeCommissionInRange([l], "2026-06-01", "2026-06-30", 10);
    expect(r.base).toBe(400);
  });
});

describe("computeUnpaidCommission (timestamp-cut model)", () => {
  it("pays every verified sale after the last settlement's payment moment", () => {
    const leads = [lead([
      verifiedSale(1000, 2026, 6, 9),               // before cut → already paid
      verifiedSale(2000, 2026, 6, 10, 14),          // verified AFTER the 10th-noon cut → unpaid
      verifiedSale(3000, 2026, 6, 12),              // unpaid
    ])];
    const cutMs = tsMs(2026, 6, 10, 12); // last settlement made 10 Jun 12:00
    const r = computeUnpaidCommission(leads, cutMs, 5);
    expect(r.base).toBe(5000);   // the 2000 (same day, later) + 3000 — the 10th's remaining sales are NOT lost
    expect(r.saleCount).toBe(2);
    expect(r.commission).toBe(250);
  });

  it("with no prior settlement (cut = 0) pays all verified sales", () => {
    const leads = [lead([verifiedSale(1000, 2026, 6, 1), verifiedSale(500, 2026, 6, 2), sale(9999, "pending", 2026, 6, 3)])];
    const r = computeUnpaidCommission(leads, 0, 10);
    expect(r.base).toBe(1500);   // pending excluded
    expect(r.saleCount).toBe(2);
  });

  it("falls back to submittedAt then createdAt when verifiedAt is missing", () => {
    // Legacy verified sale (no verifiedAt) submitted after the cut still gets paid.
    const l = lead([sale(700, "verified", 2026, 6, 15)]);
    const cutMs = tsMs(2026, 6, 10, 12);
    expect(computeUnpaidCommission([l], cutMs, 10).base).toBe(700);
    // And one submitted before the cut is treated as already paid.
    const l2 = lead([sale(700, "verified", 2026, 6, 5)]);
    expect(computeUnpaidCommission([l2], cutMs, 10).base).toBe(0);
  });
});

describe("lastSettlementOf & countPendingSales", () => {
  it("lastSettlementOf returns the most recent by paidAt", () => {
    const settlements = [
      { memberId: "m1", amount: 100, paidAt: tsAt(2026, 6, 10) },
      { memberId: "m1", amount: 200, paidAt: tsAt(2026, 6, 20) },
      { memberId: "m2", amount: 300, paidAt: tsAt(2026, 6, 25) },
    ] as unknown as CommissionSettlement[];
    expect(lastSettlementOf(settlements, "m1")?.amount).toBe(200);
    expect(lastSettlementOf(settlements, "m3")).toBeNull();
  });

  it("countPendingSales counts only pending items", () => {
    const leads = [lead([sale(1, "pending", 2026, 6, 1), sale(1, "verified", 2026, 6, 2), sale(1, "pending", 2026, 6, 3), sale(1, "rejected", 2026, 6, 4)])];
    expect(countPendingSales(leads)).toBe(2);
  });
});

describe("earliestVerifiedSaleDate", () => {
  it("returns the earliest verified sale date", () => {
    const leads = [lead([sale(100, "verified", 2026, 6, 20), sale(100, "verified", 2026, 6, 5), sale(100, "pending", 2026, 6, 1)])];
    expect(earliestVerifiedSaleDate(leads)).toBe("2026-06-05");
  });
  it("returns null when there are no verified sales", () => {
    expect(earliestVerifiedSaleDate([lead([sale(100, "pending", 2026, 6, 1)])])).toBeNull();
  });
});

describe("paidThrough & totalPaid", () => {
  const settlements = [
    { memberId: "m1", toDate: "2026-06-10", amount: 500 },
    { memberId: "m1", toDate: "2026-06-20", amount: 700 },
    { memberId: "m2", toDate: "2026-06-25", amount: 900 },
  ] as CommissionSettlement[];

  it("paidThrough is the latest toDate for that member", () => {
    expect(paidThrough(settlements, "m1")).toBe("2026-06-20");
    expect(paidThrough(settlements, "m2")).toBe("2026-06-25");
    expect(paidThrough(settlements, "m3")).toBeNull();
  });

  it("totalPaid sums only that member's settlements", () => {
    expect(totalPaid(settlements, "m1")).toBe(1200);
    expect(totalPaid(settlements, "m2")).toBe(900);
    expect(totalPaid(settlements, "m3")).toBe(0);
  });
});
