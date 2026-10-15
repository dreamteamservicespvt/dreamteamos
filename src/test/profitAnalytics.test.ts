import { describe, it, expect } from "vitest";
import { computeProfit, periodsInWindow, type ExpenseRecord } from "@/utils/profitAnalytics";
import { defaultPeriodFilter, type PeriodFilter } from "@/utils/periodFilter";
import type { AppUser, Lead, WorkAssignment } from "@/types";

const secondsFor = (date: string) => ({ seconds: new Date(`${date}T12:00:00`).getTime() / 1000 });

const july: PeriodFilter = { mode: "month", month: "2026-07", day: "2026-07-15" };
/** The July PAY PERIOD, 10 Jul → 9 Aug — one whole period, so salary is exactly one month (2026-10-15). */
const julyCycle: PeriodFilter = { mode: "month", month: "2026-07", day: "2026-07-15", monthBasis: "cycle" };

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
  id: `a-${Math.random()}`, assignedTo: "t1", status, totalPrice: price, completedDate: date, date,
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
    const p = computeProfit({ filter: julyCycle, users: team, leads: [], assignments: [], expenses: [] });
    expect(p.techSalary).toBe(18000);
    expect(p.salesSalary).toBe(6000);
  });

  it("excludes inactive people from salary cost", () => {
    const p = computeProfit({
      filter: julyCycle, leads: [], assignments: [], expenses: [],
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
      filter: julyCycle,
      users: [user({ uid: "t1", role: "tech_member", salary: 10000 })],
      leads: [lead(50000, "2026-07-15")],
      assignments: [], expenses: [expense(5000, "2026-07-15")],
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
      filter: julyCycle,
      users: [user({ uid: "t1", role: "tech_member", salary: 10000 })],
      leads: [], expenses: [],
      assignments: [assignment(25000, "2026-07-18")],
    });
    expect(p.techRevenueRatio).toBe(250);
  });
});

describe("salary cost — pay period by pay period (2026-10-15)", () => {
  it("counts each pay period for the share of its days inside the window", () => {
    expect(periodsInWindow("2026-07-10", "2026-08-09")).toEqual([{ month: "2026-07", share: 1, end: "2026-08-09" }]);
    const day = periodsInWindow("2026-07-15", "2026-07-15");
    expect(day).toHaveLength(1);
    expect(day[0].share).toBeCloseTo(1 / 31, 5);
    // A calendar month straddles two pay periods.
    expect(periodsInWindow("2026-07-01", "2026-07-31").map(p => p.month)).toEqual(["2026-06", "2026-07"]);
  });

  it("charges a single day one day of its period, not a month", () => {
    const users = [user({ uid: "t1", role: "tech_member", salary: 31000 })];
    const month = computeProfit({ filter: julyCycle, users, leads: [], assignments: [], expenses: [] });
    const day = computeProfit({ filter: { ...julyCycle, mode: "day", day: "2026-07-15" }, users, leads: [], assignments: [], expenses: [] });
    expect(month.techSalary).toBe(31000);
    expect(day.techSalary).toBe(1000);
  });

  it("uses the salary that applied IN the period — a later raise leaves it alone", () => {
    const raised = user({
      uid: "t1", role: "tech_member", salary: 18000,
      payHistory: [{ from: "2026-09", salary: 18000, previous: { salary: 15000 }, at: 1 }],
    });
    expect(computeProfit({ filter: julyCycle, users: [raised], leads: [], assignments: [], expenses: [] }).techSalary).toBe(15000);
    const sept: PeriodFilter = { ...julyCycle, month: "2026-09" };
    expect(computeProfit({ filter: sept, users: [raised], leads: [], assignments: [], expenses: [] }).techSalary).toBe(18000);
  });

  it("charges a paid period what was paid — the salary part of a sales payment — even for someone gone since", () => {
    const gone = user({ uid: "t9", role: "tech_member", salary: 20000, isActive: false });
    const seller = user({ uid: "s1", role: "sales_member", salary: 10000 });
    const p = computeProfit({
      filter: julyCycle, users: [gone, seller], leads: [], assignments: [], expenses: [],
      payrollLines: [
        { id: "2026-07_t9", month: "2026-07", memberId: "t9", netSalary: 17500, paymentStatus: "completed" },
        { id: "2026-07_s1", month: "2026-07", memberId: "s1", netSalary: 11500, paymentStatus: "completed",
          incentive: { salesBase: 30000, rate: 5, amount: 1500 } },
      ] as never,
    });
    expect(p.techSalary).toBe(17500);
    expect(p.salesSalary).toBe(10000);
  });

  it("charges nobody for a period before they joined", () => {
    const joiner = user({ uid: "t2", role: "tech_member", salary: 12000, createdAt: secondsFor("2026-09-01") });
    expect(computeProfit({ filter: julyCycle, users: [joiner], leads: [], assignments: [], expenses: [] }).techSalary).toBe(0);
  });
});

describe("commission — the payroll rule (2026-10-15)", () => {
  it("is withheld for a period under 75% of its target", () => {
    const seller = user({ uid: "s1", role: "sales_member", salary: 0, dailyTarget: 1000 });
    const p = computeProfit({
      filter: julyCycle, users: [seller], assignments: [], expenses: [],
      leads: [lead(10000, "2026-07-15", "verified", "s1")], // 10,000 of a 31,000 target
    });
    expect(p.salesCommission).toBe(0);
  });
});
