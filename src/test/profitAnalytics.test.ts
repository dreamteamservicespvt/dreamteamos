import { describe, it, expect } from "vitest";
import { computeProfit, salaryMonthsFor, type ExpenseRecord } from "@/utils/profitAnalytics";
import { defaultPeriodFilter, type PeriodFilter } from "@/utils/periodFilter";
import type { AppUser, Lead, WorkAssignment } from "@/types";

const secondsFor = (date: string) => ({ seconds: new Date(`${date}T12:00:00`).getTime() / 1000 });

const july: PeriodFilter = { mode: "month", month: "2026-07", day: "2026-07-15" };

const user = (fields: Partial<AppUser>): AppUser => ({
  uid: "u1", email: "", name: "Someone", role: "tech_member", createdBy: "admin",
  isActive: true, salary: 10000, target: 0, phone: "", createdAt: null, updatedAt: null,
  ...fields,
} as AppUser);

const lead = (amount: number, date: string, status: "verified" | "pending" = "verified", assignedTo = "s1"): Lead => ({
  id: `l-${Math.random()}`, assignedTo, createdAt: secondsFor(date),
  saleItems: [{ category: "promotional", packageKey: "p", amount, verificationStatus: status, submittedAt: secondsFor(date) }],
} as unknown as Lead);

const assignment = (price: number, date: string, status: WorkAssignment["status"] = "verified"): WorkAssignment => ({
  id: `a-${Math.random()}`, assignedTo: "t1", status, totalPrice: price, completedDate: date,
} as unknown as WorkAssignment);

const expense = (amount: number, date: string, category = "Software/Tools"): ExpenseRecord =>
  ({ id: `e-${Math.random()}`, date, category, amount });

describe("computeProfit — income", () => {
  it("counts only verified sales", () => {
    const p = computeProfit({
      filter: july, users: [], assignments: [], expenses: [],
      leads: [lead(5000, "2026-07-15"), lead(3000, "2026-07-16", "pending")],
    });
    expect(p.salesRevenue).toBe(5000);
    expect(p.salesCount).toBe(1);
  });

  it("ignores sales outside the period", () => {
    const p = computeProfit({
      filter: july, users: [], assignments: [], expenses: [],
      leads: [lead(5000, "2026-07-15"), lead(9000, "2026-06-20")],
    });
    expect(p.salesRevenue).toBe(5000);
  });

  it("includes other income but keeps it separate from sales", () => {
    const p = computeProfit({
      filter: july, users: [], assignments: [], expenses: [], leads: [lead(5000, "2026-07-15")],
      otherIncome: [{ id: "o1", date: "2026-07-20", category: "Interest", amount: 1000 }],
    });
    expect(p.salesRevenue).toBe(5000);
    expect(p.otherIncome).toBe(1000);
    expect(p.totalIncome).toBe(6000);
  });

  it("counts everything in career mode", () => {
    const career: PeriodFilter = { ...july, mode: "career" };
    const p = computeProfit({
      filter: career, users: [], assignments: [], expenses: [],
      leads: [lead(5000, "2026-07-15"), lead(9000, "2024-01-20")],
    });
    expect(p.salesRevenue).toBe(14000);
  });
});

describe("computeProfit — the double-counting trap", () => {
  it("never adds delivered ad value to income", () => {
    // The same ₹5,000 ad appears as a sale AND as a delivered assignment. Counting both would
    // report ₹10,000 of income from ₹5,000 of actual money.
    const p = computeProfit({
      filter: july, users: [], expenses: [],
      leads: [lead(5000, "2026-07-15")],
      assignments: [assignment(5000, "2026-07-18")],
    });
    expect(p.totalIncome).toBe(5000);
    expect(p.techDeliveredValue).toBe(5000);
    expect(p.salesRevenue).toBe(5000);
  });
});

describe("computeProfit — costs", () => {
  const team = [
    user({ uid: "t1", role: "tech_member", salary: 10000 }),
    user({ uid: "t2", role: "tech_member", salary: 8000 }),
    user({ uid: "s1", role: "sales_member", salary: 6000, earningsOption: "incentive_10" }),
  ];

  it("splits salary by department", () => {
    const p = computeProfit({ filter: july, users: team, leads: [], assignments: [], expenses: [] });
    expect(p.techSalary).toBe(18000);
    expect(p.salesSalary).toBe(6000);
  });

  it("excludes inactive people from salary cost", () => {
    const p = computeProfit({
      filter: july, leads: [], assignments: [], expenses: [],
      users: [...team, user({ uid: "t3", role: "tech_member", salary: 99999, isActive: false })],
    });
    expect(p.techSalary).toBe(18000);
  });

  it("applies each member's own commission rate", () => {
    const p = computeProfit({
      filter: july, users: team, assignments: [], expenses: [],
      leads: [lead(10000, "2026-07-15", "verified", "s1")], // 10% option
    });
    expect(p.salesCommission).toBe(1000);
  });

  it("defaults to 5% when no earnings option is set", () => {
    const p = computeProfit({
      filter: july, assignments: [], expenses: [],
      users: [user({ uid: "s2", role: "sales_member", salary: 0 })],
      leads: [lead(10000, "2026-07-15", "verified", "s2")],
    });
    expect(p.salesCommission).toBe(500);
  });

  it("sums expenses in the period and groups them by category", () => {
    const p = computeProfit({
      filter: july, users: [], leads: [], assignments: [],
      expenses: [
        expense(2000, "2026-07-05", "Marketing"),
        expense(1500, "2026-07-10", "Marketing"),
        expense(500, "2026-07-11", "Software/Tools"),
        expense(9999, "2026-06-01", "Marketing"), // outside the period
      ],
    });
    expect(p.expenses).toBe(4000);
    expect(p.expensesByCategory[0]).toEqual({ category: "Marketing", amount: 3500 });
  });
});

describe("computeProfit — the bottom line", () => {
  it("computes net profit and margin", () => {
    const p = computeProfit({
      filter: july,
      users: [user({ uid: "t1", role: "tech_member", salary: 10000 })],
      leads: [lead(50000, "2026-07-15")],
      assignments: [], expenses: [expense(5000, "2026-07-05")],
    });
    // 50,000 income − (10,000 tech salary + 2,500 commission + 5,000 expenses)
    expect(p.totalCost).toBe(17500);
    expect(p.netProfit).toBe(32500);
    expect(p.marginPercent).toBe(65);
  });

  it("reports a loss honestly rather than clamping at zero", () => {
    const p = computeProfit({
      filter: july,
      users: [user({ uid: "t1", role: "tech_member", salary: 30000 })],
      leads: [lead(5000, "2026-07-15")], assignments: [], expenses: [],
    });
    expect(p.netProfit).toBeLessThan(0);
    expect(p.marginPercent).toBeLessThan(0);
  });

  it("returns a null margin rather than dividing by zero income", () => {
    const p = computeProfit({ filter: july, users: [], leads: [], assignments: [], expenses: [] });
    expect(p.marginPercent).toBeNull();
    expect(p.techRevenueRatio).toBeNull();
  });

  it("reports how much delivered value each rupee of tech salary produced", () => {
    const p = computeProfit({
      filter: july,
      users: [user({ uid: "t1", role: "tech_member", salary: 10000 })],
      leads: [], expenses: [],
      assignments: [assignment(25000, "2026-07-18")],
    });
    expect(p.techRevenueRatio).toBe(250);
  });
});

describe("salaryMonthsFor — salary must match the length of the period", () => {
  it("charges a full month for a month view", () => {
    expect(salaryMonthsFor({ ...defaultPeriodFilter(), mode: "month" })).toBe(1);
  });

  it("charges roughly a thirtieth for a single day", () => {
    // Without this a one-day P&L would bill a whole month of salary against one day of revenue.
    expect(salaryMonthsFor({ ...defaultPeriodFilter(), mode: "day" })).toBeCloseTo(1 / 30, 5);
  });

  it("scales with the length of a custom range", () => {
    const months = salaryMonthsFor({
      ...defaultPeriodFilter(), mode: "range",
      range: { from: new Date(2026, 6, 1), to: new Date(2026, 6, 15) },
    });
    expect(months).toBeCloseTo(15 / 30, 5);
  });

  it("spans the whole history in career mode", () => {
    const months = salaryMonthsFor({ ...defaultPeriodFilter(), mode: "career" }, "2026-01-01");
    expect(months).toBeGreaterThan(1);
  });

  it("prorated salary actually reduces the cost", () => {
    const users = [user({ uid: "t1", role: "tech_member", salary: 30000 })];
    const monthly = computeProfit({ filter: july, users, leads: [], assignments: [], expenses: [], salaryMonths: 1 });
    const daily = computeProfit({ filter: july, users, leads: [], assignments: [], expenses: [], salaryMonths: 1 / 30 });
    expect(monthly.techSalary).toBe(30000);
    expect(daily.techSalary).toBe(1000);
  });
});
