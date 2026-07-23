import { format } from "date-fns";
import { withinPeriod, type PeriodFilter } from "./periodFilter";
import { deliveryDate } from "./workDates";
import { commissionRate } from "@/services/settlements";
import type { AppUser, Lead, SaleDetail, WorkAssignment } from "@/types";

/**
 * Company profit and loss, derived from what the two departments actually did.
 *
 * Sales bring revenue in; tech delivers it. Both cost salary, sales additionally costs
 * commission, and the company has running expenses. This module turns those four streams into
 * one number the owner can act on — pure and testable, with no Firestore in sight.
 *
 * A deliberate choice on double counting: **revenue is counted once, from the sale.** Tech
 * delivery value is reported separately as a productivity measure, never added to income —
 * adding both would double every rupee, since a delivered ad *is* a sale that was already
 * counted.
 */

export interface ExpenseRecord {
  id: string;
  date: string;
  category: string;
  description?: string;
  amount: number;
}

/** Income recorded outside of sales — refunds recovered, interest, one-off billing. */
export interface OtherIncomeRecord {
  id: string;
  date: string;
  category: string;
  description?: string;
  amount: number;
}

export interface DepartmentSummary {
  /** Salary cost for this department in the period. */
  salaryCost: number;
  headcount: number;
}

export interface ProfitBreakdown {
  // Income
  salesRevenue: number;
  otherIncome: number;
  totalIncome: number;

  // Costs
  techSalary: number;
  salesSalary: number;
  salesCommission: number;
  expenses: number;
  totalCost: number;

  netProfit: number;
  /** Net profit as a share of income. Null when there was no income to divide by. */
  marginPercent: number | null;

  // Productivity (never added to income — see the module note)
  techDeliveredValue: number;
  techVideosDelivered: number;
  salesCount: number;

  /** Delivered value per rupee of tech salary. Null when tech salary is zero. */
  techRevenueRatio: number | null;
  /** Sales revenue per rupee of total sales cost (salary + commission). */
  salesRevenueRatio: number | null;

  expensesByCategory: { category: string; amount: number }[];
}

/** Sale line items on a lead, across both the current and legacy shapes. */
function saleItemsOf(lead: Lead): SaleDetail[] {
  return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
}

/** The date a sale counts on. */
function saleDate(item: SaleDetail, lead: Lead): string | null {
  const seconds = (item.submittedAt as { seconds?: number })?.seconds
    ?? (lead.createdAt as { seconds?: number })?.seconds;
  return seconds ? format(new Date(seconds * 1000), "yyyy-MM-dd") : null;
}

export interface ComputeProfitInput {
  filter: PeriodFilter;
  users: AppUser[];
  leads: Lead[];
  assignments: WorkAssignment[];
  expenses: ExpenseRecord[];
  otherIncome?: OtherIncomeRecord[];
  /**
   * How many months of salary the period represents. Salary is monthly, so a single-day view
   * must not charge a whole month against one day's revenue.
   */
  salaryMonths?: number;
}

export function computeProfit(input: ComputeProfitInput): ProfitBreakdown {
  const { filter, users, leads, assignments, expenses } = input;
  const otherIncomeRecords = input.otherIncome ?? [];
  const salaryMonths = input.salaryMonths ?? 1;

  // ── Income: verified sales only. Pending sales aren't money yet. ──────────
  let salesRevenue = 0;
  let salesCount = 0;
  const commissionByMember = new Map<string, number>();

  for (const lead of leads) {
    for (const item of saleItemsOf(lead)) {
      if (item.verificationStatus !== "verified") continue;
      const date = saleDate(item, lead);
      if (!withinPeriod(date ?? undefined, filter)) continue;

      const amount = item.amount || 0;
      salesRevenue += amount;
      salesCount += 1;

      const owner = lead.assignedTo;
      if (owner) commissionByMember.set(owner, (commissionByMember.get(owner) ?? 0) + amount);
    }
  }

  const otherIncome = otherIncomeRecords
    .filter(r => withinPeriod(r.date, filter))
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  // ── Commission: each member's own rate applied to their own verified sales ─
  let salesCommission = 0;
  for (const [memberId, base] of commissionByMember) {
    const member = users.find(u => u.uid === memberId);
    salesCommission += Math.round((base * commissionRate(member?.earningsOption)) / 100);
  }

  // ── Salary cost, prorated to the length of the period ─────────────────────
  const activeUsers = users.filter(u => u.isActive !== false);
  const techTeam = activeUsers.filter(u =>
    u.role === "tech_member" || u.role === "tech_team_leader");
  const salesTeam = activeUsers.filter(u => u.role === "sales_member");

  const sumSalary = (people: AppUser[]) =>
    Math.round(people.reduce((sum, u) => sum + (u.salary || 0), 0) * salaryMonths);

  const techSalary = sumSalary(techTeam);
  const salesSalary = sumSalary(salesTeam);

  // ── Expenses ──────────────────────────────────────────────────────────────
  const periodExpenses = expenses.filter(e => withinPeriod(e.date, filter));
  const expenseTotal = periodExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const byCategory = new Map<string, number>();
  for (const e of periodExpenses) {
    byCategory.set(e.category || "Uncategorised", (byCategory.get(e.category || "Uncategorised") ?? 0) + (e.amount || 0));
  }

  // ── Tech productivity — reported, never added to income ───────────────────
  let techDeliveredValue = 0;
  let techVideosDelivered = 0;
  for (const a of assignments) {
    if (a.status !== "completed" && a.status !== "verified") continue;
    if (!withinPeriod(deliveryDate(a) ?? undefined, filter)) continue;
    techDeliveredValue += a.totalPrice || 0;
    techVideosDelivered += 1;
  }

  const totalIncome = salesRevenue + otherIncome;
  const totalCost = techSalary + salesSalary + salesCommission + expenseTotal;
  const netProfit = totalIncome - totalCost;
  const salesCost = salesSalary + salesCommission;

  return {
    salesRevenue,
    otherIncome,
    totalIncome,
    techSalary,
    salesSalary,
    salesCommission,
    expenses: expenseTotal,
    totalCost,
    netProfit,
    marginPercent: totalIncome > 0 ? Math.round((netProfit / totalIncome) * 100) : null,
    techDeliveredValue,
    techVideosDelivered,
    salesCount,
    techRevenueRatio: techSalary > 0 ? Math.round((techDeliveredValue / techSalary) * 100) : null,
    salesRevenueRatio: salesCost > 0 ? Math.round((salesRevenue / salesCost) * 100) : null,
    expensesByCategory: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

/**
 * How many months of salary a period represents.
 *
 * A day view charges 1/30th of a month, a week charges a quarter, and a career view charges the
 * number of months actually elapsed. Without this, a one-day P&L would show a catastrophic loss
 * purely because it billed a full month of salary against a single day of revenue.
 */
export function salaryMonthsFor(filter: PeriodFilter, earliestDate?: string): number {
  const DAYS_PER_MONTH = 30;

  switch (filter.mode) {
    case "day":
      return 1 / DAYS_PER_MONTH;
    case "month":
      return 1;
    case "range": {
      if (!filter.range?.from) return 1;
      const to = filter.range.to ?? filter.range.from;
      const days = Math.max(1, Math.round((to.getTime() - filter.range.from.getTime()) / 86_400_000) + 1);
      return days / DAYS_PER_MONTH;
    }
    case "career":
    default: {
      if (!earliestDate) return 1;
      const start = new Date(`${earliestDate}T00:00:00`);
      const days = Math.max(1, Math.round((Date.now() - start.getTime()) / 86_400_000));
      return days / DAYS_PER_MONTH;
    }
  }
}
