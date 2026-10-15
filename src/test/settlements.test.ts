import { describe, it, expect, vi } from "vitest";

// Avoid initialising the real Firebase app (node test env has no IndexedDB).
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn() }));

import {
  commissionRate, countPendingSales, lastSettlementOf, earliestVerifiedSaleDate, totalPaid, settlementRecord,
} from "@/services/settlements";
import { collectionsOf, commissionByPeriod, settlementCoverage } from "@/utils/salesPay";
import type { CommissionSettlement, Lead, SaleDetail } from "@/types";

/**
 * Settlements on the one commission rule (owner, 2026-10-15: "Payroll's rule everywhere").
 *
 * The date-range (`computeCommissionInRange`) and timestamp-cut (`computeUnpaidCommission`) rules these
 * tests used to pin are gone: a settlement now pays ended pay periods — money collected in each, at the
 * period's rate, gated at 75% of its target — records what it paid, and never pays a period Sales Payroll
 * has paid. The rule itself is tested in `commissionRuleOct15.test.ts`; these pin the settlement side.
 */

// Build a Firestore-Timestamp-like value at local noon, so date formatting is tz-stable.
const tsAt = (y: number, m: number, d: number, h = 12) => ({ seconds: Math.floor(new Date(y, m - 1, d, h).getTime() / 1000) });

function sale(amount: number, status: SaleDetail["verificationStatus"], y: number, m: number, d: number, extra: Partial<SaleDetail> = {}): SaleDetail {
  return { amount, verificationStatus: status, category: "promotional", packageKey: "x", submittedAt: tsAt(y, m, d), ...extra } as SaleDetail;
}
let leadSeq = 0;
function lead(items: SaleDetail[], assignedTo = "m1"): Lead {
  leadSeq += 1;
  return { id: `L${leadSeq}`, assignedTo, saleItems: items } as unknown as Lead;
}
const noTarget = () => ({ rate: 5, dailyTarget: 0 });

describe("commissionRate", () => {
  it("is 10% for incentive_10 and 5% otherwise", () => {
    expect(commissionRate("incentive_10")).toBe(10);
    expect(commissionRate("stipend_plus_5")).toBe(5);
    expect(commissionRate(undefined)).toBe(5);
  });
});

describe("what a settlement pays — ended periods, by the money collected in them", () => {
  // Periods: Aug = 10 Aug → 9 Sep, Sep = 10 Sep → 9 Oct, Oct = 10 Oct → 9 Nov 2026.
  const leads = [lead([
    sale(10000, "verified", 2026, 8, 20),
    sale(4000, "verified", 2026, 9, 15),
    sale(3000, "pending", 2026, 9, 16),
    sale(6000, "verified", 2026, 10, 12),   // the running period on 15 Oct
  ])];

  it("lists each period with where it stands, and makes only the ended ones due", () => {
    const r = commissionByPeriod({
      collections: collectionsOf(leads), settlements: [], payrollPaid: new Set(), termsFor: noTarget, todayStr: "2026-10-15",
    });
    expect(r.rows.map(x => [x.period, x.status])).toEqual([
      ["2026-10", "running"], ["2026-09", "due"], ["2026-08", "due"],
    ]);
    expect(r.dueAmount).toBe(500 + 200);
    expect(r.rows.find(x => x.period === "2026-09")?.pendingSaleValue).toBe(3000);
  });

  it("never offers a period Sales Payroll has paid", () => {
    const r = commissionByPeriod({
      collections: collectionsOf(leads), settlements: [], payrollPaid: new Set(["2026-09"]), termsFor: noTarget, todayStr: "2026-10-15",
    });
    expect(r.rows.find(x => x.period === "2026-09")?.status).toBe("payroll");
    expect(r.dueAmount).toBe(500);
  });

  it("records the periods and every collection it paid, so they are never paid again", () => {
    const first = commissionByPeriod({
      collections: collectionsOf(leads), settlements: [], payrollPaid: new Set(), termsFor: noTarget, todayStr: "2026-10-15",
    });
    const record = settlementRecord(first.due);
    expect(record.periods).toEqual(["2026-08", "2026-09"]);
    expect(record.amount).toBe(700);
    expect(record.fromDate).toBe("2026-08-10");
    expect(record.toDate).toBe("2026-10-09");
    expect(record.paidKeys).toHaveLength(2);

    const settled = [{ memberId: "m1", amount: record.amount, paidKeys: record.paidKeys, periods: record.periods, paidAt: tsAt(2026, 10, 15) }] as unknown as CommissionSettlement[];
    const after = commissionByPeriod({
      collections: collectionsOf(leads), settlements: settled, payrollPaid: new Set(), termsFor: noTarget, todayStr: "2026-10-15",
    });
    expect(after.dueAmount).toBe(0);
    expect(after.rows.find(x => x.period === "2026-08")?.status).toBe("settled");
  });

  it("refuses to record a settlement with nothing due", () => {
    expect(() => settlementRecord([])).toThrow();
  });
});

describe("a re-approved sale is not paid twice (audit item 4)", () => {
  it("a settlement's keys cover the sale whatever happens to its approval stamp", () => {
    const original = sale(8000, "verified", 2026, 8, 20, { verifiedAt: tsAt(2026, 8, 21) });
    const leads = [lead([original])];
    const first = commissionByPeriod({
      collections: collectionsOf(leads), settlements: [], payrollPaid: new Set(), termsFor: noTarget, todayStr: "2026-09-20",
    });
    const record = settlementRecord(first.due);
    const settled = [{ memberId: "m1", paidKeys: record.paidKeys, paidAt: tsAt(2026, 9, 20) }] as unknown as CommissionSettlement[];

    // Revoked and approved again a month later: verifiedAt moves past the settlement.
    const reApproved = [lead([{ ...original, verifiedAt: tsAt(2026, 10, 14) }])];
    reApproved[0].id = leads[0].id;
    const again = commissionByPeriod({
      collections: collectionsOf(reApproved), settlements: settled, payrollPaid: new Set(), termsFor: noTarget, todayStr: "2026-10-15",
    });
    expect(again.dueAmount).toBe(0);
  });

  it("an older settlement (no keys) covers what it paid by the FIRST approval, which a revoke keeps", () => {
    // Paid by the old model on 25 Aug: everything approved by then. Later revoked and re-approved on 14 Oct.
    const legacy = [{ memberId: "m1", amount: 400, paidAt: tsAt(2026, 8, 25) }] as unknown as CommissionSettlement[];
    const item = sale(8000, "verified", 2026, 8, 20, { verifiedAt: tsAt(2026, 10, 14), firstVerifiedAt: tsAt(2026, 8, 21) });
    const covered = settlementCoverage(legacy, collectionsOf([lead([item])]));
    expect(covered.size).toBe(1);
  });

  it("an older settlement never covered a balance collected after it — that is still owed", () => {
    const legacy = [{ memberId: "m1", amount: 250, paidAt: tsAt(2026, 8, 25) }] as unknown as CommissionSettlement[];
    const item = sale(10000, "verified", 2026, 8, 20, {
      verifiedAt: tsAt(2026, 8, 21),
      partialPayment: true,
      payments: [
        { id: "adv", amount: 5000, collectedAt: tsAt(2026, 8, 20) },
        { id: "bal", amount: 5000, collectedAt: tsAt(2026, 9, 2) },
      ],
    });
    const collections = collectionsOf([lead([item])]);
    const covered = settlementCoverage(legacy, collections);
    expect([...covered].map(k => k.split("#")[1])).toEqual(["adv"]);
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

describe("totalPaid", () => {
  const settlements = [
    { memberId: "m1", toDate: "2026-06-10", amount: 500 },
    { memberId: "m1", toDate: "2026-06-20", amount: 700 },
    { memberId: "m2", toDate: "2026-06-25", amount: 900 },
  ] as CommissionSettlement[];

  it("sums only that member's settlements", () => {
    expect(totalPaid(settlements, "m1")).toBe(1200);
    expect(totalPaid(settlements, "m2")).toBe(900);
    expect(totalPaid(settlements, "m3")).toBe(0);
  });
});
