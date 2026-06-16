import { describe, it, expect, vi } from "vitest";

// Avoid initialising the real Firebase app (node test env has no IndexedDB).
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn() }));

import {
  commissionRate, computeCommissionInRange, earliestVerifiedSaleDate, paidThrough, totalPaid,
} from "@/services/settlements";
import type { CommissionSettlement, Lead, SaleDetail } from "@/types";

// Build a Firestore-Timestamp-like value at local noon, so date formatting is tz-stable.
const tsAt = (y: number, m: number, d: number) => ({ seconds: Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000) });

function sale(amount: number, status: SaleDetail["verificationStatus"], y: number, m: number, d: number): SaleDetail {
  return { amount, verificationStatus: status, category: "promotional", packageKey: "x", submittedAt: tsAt(y, m, d) } as SaleDetail;
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
