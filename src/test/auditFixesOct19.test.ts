import { describe, expect, it } from "vitest";
import {
  awaitingApprovalLabel, isApprovedSale, isAwaitingApproval, lastCalendarDays, revenueByDay, revenueByOwner,
  revenueSeries, revenueTotals,
} from "@/utils/salesRevenue";
import { rangeCaption, revenueReport } from "@/utils/revenueReport";
import { breadcrumbLabel, isStaffMember } from "@/utils/roleHelpers";
import { formatRupeeAxis } from "@/utils/formatters";
import type { AppUser, Lead, SaleDetail, WorkAssignment } from "@/types";

/**
 * The whole-app audit's fixes (2026-10-18 / 19): revenue = approved sales on their own day, pending shown beside it
 * (D-05), external creators never counted as staff (D-04), breadcrumbs in words (D-09), chart axes that never repeat
 * a label.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });
const sale = (amount: number, status: SaleDetail["verificationStatus"], day: string): SaleDetail =>
  ({ category: "promotional", packageKey: "p", amount, verificationStatus: status, submittedAt: at(`${day}T10:00:00`) } as SaleDetail);
const lead = (id: string, owner: string, items: SaleDetail[]): Lead =>
  ({ id, assignedTo: owner, saleItems: items, createdAt: at("2026-10-01T09:00:00") } as Lead);

const LEADS = [
  lead("a", "u_sm", [sale(1999, "verified", "2026-10-16"), sale(10000, "pending", "2026-10-17")]),
  lead("b", "u_sm2", [sale(999, "verified", "2026-10-15"), sale(500, "rejected", "2026-10-15")]),
  lead("c", "u_sm", [sale(199, undefined as any, "2026-10-18")]),
];

describe("revenue = approved sales (D-05)", () => {
  it("knows approved, awaiting and rejected", () => {
    expect(isApprovedSale({ verificationStatus: "verified" })).toBe(true);
    expect(isApprovedSale({ verificationStatus: "pending" })).toBe(false);
    expect(isAwaitingApproval({ verificationStatus: "pending" })).toBe(true);
    expect(isAwaitingApproval({} as any)).toBe(true);
    expect(isAwaitingApproval({ verificationStatus: "rejected" })).toBe(false);
    expect(isAwaitingApproval(null)).toBe(false);
  });

  it("totals approved sales and keeps pending apart; rejected counts nowhere", () => {
    expect(revenueTotals(LEADS)).toEqual({ revenue: 2998, count: 2, awaiting: 10199, awaitingCount: 2 });
  });

  it("filters by day and by salesperson", () => {
    const only16 = (d: string) => d === "2026-10-16";
    expect(revenueTotals(LEADS, { inDay: only16 }).revenue).toBe(1999);
    expect(revenueTotals(LEADS, { ownerId: "u_sm2" })).toEqual({ revenue: 999, count: 1, awaiting: 0, awaitingCount: 0 });
  });

  it("groups by day and by owner", () => {
    expect(Object.fromEntries(revenueByDay(LEADS))).toEqual({ "2026-10-16": 1999, "2026-10-15": 999 });
    expect(Object.fromEntries(revenueByOwner(LEADS))).toEqual({ u_sm: 1999, u_sm2: 999 });
  });

  it("charts calendar days, 0 on a quiet day, across a month's edge", () => {
    expect(lastCalendarDays("2026-11-02", 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(revenueSeries(LEADS, lastCalendarDays("2026-10-17", 3))).toEqual([
      { date: "2026-10-15", revenue: 999 }, { date: "2026-10-16", revenue: 1999 }, { date: "2026-10-17", revenue: 0 },
    ]);
  });

  it("words the awaiting figure", () => {
    expect(awaitingApprovalLabel({ awaiting: 1999, awaitingCount: 1 })).toBe("Awaiting approval: ₹1,999 (1 sale)");
    expect(awaitingApprovalLabel({ awaiting: 10199, awaitingCount: 2 })).toBe("Awaiting approval: ₹10,199 (2 sales)");
  });
});

describe("revenueReport", () => {
  const users = [
    { uid: "u_sm", name: "Ravi", role: "sales_member" },
    { uid: "u_sm2", name: "Divya", role: "sales_member" },
    { uid: "u_tm", name: "Teja", role: "tech_member" },
    { uid: "u_ext", name: "Outsider", role: "tech_member", externalCreator: true },
    { uid: "u_off", name: "Former", role: "sales_member", isActive: false },
  ] as AppUser[];
  const assignments = [
    { id: "w1", assignedTo: "u_tm", status: "verified", totalPrice: 120, date: "2026-10-18" },
    { id: "w2", assignedTo: "u_ext", status: "verified", totalPrice: 300, date: "2026-10-18" },
    { id: "w3", assignedTo: "u_tm", status: "completed", totalPrice: 60, date: "2026-10-18" },
  ] as WorkAssignment[];

  it("7 days: approved revenue, pending apart, work value beside it, staff rows only", () => {
    const r = revenueReport({ leads: LEADS, assignments, users, range: "7", today: "2026-10-19" });
    expect(r.totals.revenue).toBe(2998);
    expect(r.totals.awaiting).toBe(10199);
    expect(r.techDelivered).toBe(420);
    expect(r.chart).toHaveLength(7);
    expect(r.chart[0].date).toBe("2026-10-13");
    expect(r.rows.map((x) => x.member.uid)).toEqual(["u_sm", "u_sm2", "u_tm"]);
  });

  it("All: every day that had revenue, oldest first", () => {
    const r = revenueReport({ leads: LEADS, assignments, users, range: "all", today: "2026-10-19" });
    expect(r.chart.map((p) => p.date)).toEqual(["2026-10-15", "2026-10-16"]);
    expect(rangeCaption("all")).toBe("every day with revenue");
    expect(rangeCaption("30")).toBe("last 30 days");
  });
});

describe("staff, breadcrumbs, axis", () => {
  it("an external creator or an inactive person is not staff (D-04)", () => {
    expect(isStaffMember({ isActive: true })).toBe(true);
    expect(isStaffMember({})).toBe(true);
    expect(isStaffMember({ externalCreator: true })).toBe(false);
    expect(isStaffMember({ isActive: false })).toBe(false);
    expect(isStaffMember(null)).toBe(false);
  });

  it("names a page by its menu entry, never a slug (D-09)", () => {
    expect(breadcrumbLabel(["main-admin", "revenue"], 1, "main_admin")).toBe("Revenue Overview");
    expect(breadcrumbLabel(["dev-os"], 0, "tech_admin")).toBe("Development OS");
    expect(breadcrumbLabel(["sales-admin", "hr"], 1, "sales_admin")).toBe("HR & Documents");
    expect(breadcrumbLabel(["tech-admin", "ai-accounts"], 1, null)).toBe("AI Accounts");
    expect(breadcrumbLabel(["smm"], 0, "sales_member")).toBe("Social Media");
    expect(breadcrumbLabel(["main-admin"], 0, "main_admin")).toBe("Main Admin");
  });

  it("never gives two ticks of a nice scale the same label", () => {
    const ticks = [0, 500, 1000, 1500, 2000].map(formatRupeeAxis);
    expect(ticks).toEqual(["₹0", "₹500", "₹1k", "₹1.5k", "₹2k"]);
    expect(new Set([0, 250, 500, 750, 1000, 1250].map(formatRupeeAxis)).size).toBe(6);
    expect(formatRupeeAxis(150000)).toBe("₹1.5L");
    expect(formatRupeeAxis(23000000)).toBe("₹2.3Cr");
  });
});
