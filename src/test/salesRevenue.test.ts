import { describe, expect, it } from "vitest";
import { dayRevenue, saleDay } from "@/utils/salesRevenue";
import type { Lead, SaleDetail } from "@/types";

/**
 * A sales member's "Revenue" tile showed nothing for the day they were having.
 *
 * Two independent reasons, both pinned here: the total was read off the leads CREATED that day
 * rather than the sales MADE that day, and it only counted sales a sales admin had already
 * approved — which never happens on the same day.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

const sale = (f: Partial<SaleDetail> = {}): SaleDetail => ({
  category: "promotional",
  packageKey: "p1",
  amount: 499,
  verificationStatus: "pending",
  submittedAt: at("2026-07-28T09:00:00"),
  ...f,
} as SaleDetail);

const lead = (items: SaleDetail[], createdAt = at("2026-07-28T08:00:00")): Lead =>
  ({ id: "l1", saleItems: items, createdAt } as Lead);

const TODAY = new Set(["2026-07-28"]);

describe("saleDay", () => {
  it("counts a sale on the day it was recorded", () => {
    expect(saleDay(sale(), lead([]))).toBe("2026-07-28");
  });

  it("falls back to the lead's own date for sales recorded before submittedAt existed", () => {
    expect(saleDay(sale({ submittedAt: undefined }), lead([], at("2026-07-20T10:00:00")))).toBe("2026-07-20");
  });
});

describe("dayRevenue", () => {
  it("counts a sale made today on a lead assigned last week", () => {
    // The exact case that showed nothing: old lead, today's sale.
    const old = lead([sale({ amount: 999 })], at("2026-07-20T10:00:00"));
    expect(dayRevenue([old], TODAY).total).toBe(999);
  });

  it("counts a sale the moment it is made, before an admin has approved it", () => {
    expect(dayRevenue([lead([sale({ verificationStatus: "pending" })])], TODAY).total).toBe(499);
  });

  it("reports approved and awaiting-approval money separately", () => {
    const l = lead([
      sale({ amount: 499, verificationStatus: "verified" }),
      sale({ amount: 999, verificationStatus: "pending" }),
    ]);
    const r = dayRevenue([l], TODAY);
    expect(r).toMatchObject({ total: 1498, verified: 499, pending: 999, count: 2 });
  });

  it("leaves out rejected sales — those did not happen", () => {
    const l = lead([sale({ amount: 499 }), sale({ amount: 999, verificationStatus: "rejected" })]);
    expect(dayRevenue([l], TODAY).total).toBe(499);
  });

  it("leaves out sales made on another day", () => {
    const l = lead([sale({ amount: 499 }), sale({ amount: 999, submittedAt: at("2026-07-27T09:00:00") })]);
    expect(dayRevenue([l], TODAY).total).toBe(499);
  });

  it("counts every day when no window is given", () => {
    const l = lead([sale({ amount: 499 }), sale({ amount: 999, submittedAt: at("2026-07-27T09:00:00") })]);
    expect(dayRevenue([l], null).total).toBe(1498);
  });

  it("splits the day by ticket price, biggest first", () => {
    const l = lead([
      sale({ amount: 499 }),
      sale({ amount: 499 }),
      sale({ amount: 999, category: "cinematic" }),
      sale({ amount: 499 }),
    ]);
    const { breakdown } = dayRevenue([l], TODAY);
    expect(breakdown.map((r) => [r.amount, r.count])).toEqual([[999, 1], [499, 3]]);
  });

  it("names the categories sold at each price", () => {
    const l = lead([sale({ amount: 499, category: "promotional" }), sale({ amount: 499, category: "wishes" })]);
    const row = dayRevenue([l], TODAY).breakdown[0];
    expect(row.categories.sort()).toEqual(["Promotional Ad", "Wishes"]);
  });

  it("reads the older single-sale shape as well as saleItems", () => {
    const legacy = { id: "l2", saleDetails: sale({ amount: 1999 }), createdAt: at("2026-07-28T08:00:00") } as unknown as Lead;
    expect(dayRevenue([legacy], TODAY).total).toBe(1999);
  });

  it("is a clean zero when nothing was sold", () => {
    expect(dayRevenue([lead([])], TODAY)).toMatchObject({ total: 0, count: 0, breakdown: [] });
  });
});
