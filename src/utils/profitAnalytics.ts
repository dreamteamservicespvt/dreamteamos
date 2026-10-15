import { format } from "date-fns";
import { periodBounds, withinPeriod, type PeriodFilter } from "./periodFilter";
import { workCountsOn } from "./workDates";
import { isLinePaid, netPayable, payPeriodForDate, payPeriodForMonth, periodDates, shiftPayMonth } from "./payrollEngine";
import { collectionsOf, commissionInWindow, type Collection } from "./salesPay";
import { commissionTermsFor, salaryFor } from "./payTerms";
import type { AppUser, Lead, SaleDetail, WorkAssignment } from "@/types";
import { DEFAULT_PAYROLL_CONFIG, type PayrollLine } from "@/types/payroll";

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
   * The salary payment records (`payroll_lines`) — what was actually paid for a paid period. Absent or empty:
   * every period is priced at the salary that applied in it (`utils/payTerms`).
   */
  payrollLines?: PayrollLine[];
  /** First day of the career view (the earliest sale, as a LOCAL day). Default: today. */
  earliestDate?: string;
  /** Today, `yyyy-MM-dd` — where the career view ends. Default: the clock. */
  todayStr?: string;
  /** The pay cycle's first day of the month. Default: the company's (the 10th). */
  cycleStartDay?: number;
}

export function computeProfit(input: ComputeProfitInput): ProfitBreakdown {
  const { filter, users, leads, assignments, expenses } = input;
  const otherIncomeRecords = input.otherIncome ?? [];
  const cycleStartDay = input.cycleStartDay ?? DEFAULT_PAYROLL_CONFIG.payDayOfMonth;
  const todayStr = input.todayStr ?? format(new Date(), "yyyy-MM-dd");

  // ── Income: verified sales only. Pending sales aren't money yet. ──────────
  let salesRevenue = 0;
  let salesCount = 0;

  for (const lead of leads) {
    for (const item of saleItemsOf(lead)) {
      if (item.verificationStatus !== "verified") continue;
      const date = saleDate(item, lead);
      if (!withinPeriod(date ?? undefined, filter)) continue;
      salesRevenue += item.amount || 0;
      salesCount += 1;
    }
  }

  const otherIncome = otherIncomeRecords
    .filter(r => withinPeriod(r.date, filter))
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  // The window the P&L covers, as days — the career view runs from the first sale to today.
  const bounds = periodBounds(filter);
  const window = bounds ?? { from: input.earliestDate ?? todayStr, to: todayStr };

  /*
    ── Commission: the ONE rule (owner, 2026-10-15) ──────────────────────────────────────────────
    It was each member's TODAY's rate on the verified sale PRICES dated in the window — no 75% target gate,
    and a plan changed later re-priced every past period. Now it is `utils/salesPay.commissionInWindow`: the
    money collected inside the window, at the rate that applied in its pay period, only when that period
    reached 75% of its target — what Sales Payroll and Settlements pay.
  */
  const collectionsByOwner = new Map<string, Collection[]>();
  for (const c of collectionsOf(leads)) {
    if (!c.ownerId) continue;
    collectionsByOwner.set(c.ownerId, [...(collectionsByOwner.get(c.ownerId) || []), c]);
  }
  let salesCommission = 0;
  for (const [memberId, collections] of collectionsByOwner) {
    const member = users.find(u => u.uid === memberId);
    salesCommission += commissionInWindow({
      collections,
      from: bounds ? bounds.from : null,
      to: bounds ? bounds.to : null,
      termsFor: (period) => commissionTermsFor(member, period),
      cycleStartDay,
    }).commission;
  }

  /*
    ── Salary cost: what each pay period actually cost, for the days of it inside the window (2026-10-15) ──
    It was TODAY's active staff × TODAY's salary × the window's length in 30-day months, for any period —
    a raise re-priced last year, a leaver vanished from the months they were paid, a joiner was charged for
    months before they joined. Now, pay period by pay period: a period someone was PAID for costs what was
    paid (the payment record, the salary part only — a sales incentive is the commission line); one not paid
    (yet) costs the salary that applied in it, for the people employed then. Each period counts for the share
    of its days that fall inside the window.

    ── A period still running costs its days so far (2026-10-15) ──
    An unpaid period that has not ended is charged only for its days up to and including today — elapsed ÷ the
    period's days. Charging it in full set a whole month's salary against half a month's sales and expenses, so a
    P&L opened on the 20th showed a loss the period would not make (the Accounts Dashboard shows the running period
    by default, so it read worst exactly where it is looked at most). A period not started yet costs nothing. A
    PAID period costs what was paid, even when it was paid early — that money has left the company.
  */
  const linesByKey = new Map<string, PayrollLine>();
  for (const line of input.payrollLines ?? []) {
    if (isLinePaid(line)) linesByKey.set(`${line.month}_${line.memberId}`, line);
  }
  const staff = users.filter(u => !u.externalCreator
    && (u.role === "tech_member" || u.role === "tech_team_leader" || u.role === "sales_member"));
  let techSalary = 0;
  let salesSalary = 0;
  for (const { month, share, end, shareToDate } of periodsInWindow(window.from, window.to, cycleStartDay, todayStr)) {
    for (const u of staff) {
      const line = linesByKey.get(`${month}_${u.uid}`);
      let cost = 0;
      let part = share;
      if (line) cost = salaryPartOf(line, u);
      else if (u.isActive !== false && employedBy(u, end)) {
        cost = salaryFor(u, month);
        part = shareToDate ?? share; // not paid: only the days up to today (all of them once it has ended)
      }
      if (u.role === "sales_member") salesSalary += cost * part;
      else techSalary += cost * part;
    }
  }
  techSalary = Math.round(techSalary);
  salesSalary = Math.round(salesSalary);

  // ── Expenses ──────────────────────────────────────────────────────────────
  const periodExpenses = expenses.filter(e => withinPeriod(e.date, filter));
  const expenseTotal = periodExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const byCategory = new Map<string, number>();
  for (const e of periodExpenses) {
    byCategory.set(e.category || "Uncategorised", (byCategory.get(e.category || "Uncategorised") ?? 0) + (e.amount || 0));
  }

  /*
    ── Tech productivity — reported, never added to income ───────────────────
    Delivered work counts on the day it was ASSIGNED (`utils/workDates.workCountsOn`, 2026-10-15) — the rule
    Work Reports, My Team and the dashboards use. It counted on the completion day, so the same job sat in a
    different period here than on every other screen.
  */
  let techDeliveredValue = 0;
  let techVideosDelivered = 0;
  for (const a of assignments) {
    if (a.status !== "completed" && a.status !== "verified") continue;
    if (!withinPeriod(workCountsOn(a), filter)) continue;
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
 * The salary half of a payment record — what was paid, less a sales incentive inside it (the P&L counts
 * commission on its own line). An older sales payment without its incentive recorded: the computation's
 * payable salary.
 */
function salaryPartOf(line: PayrollLine, member: AppUser): number {
  if (line.incentive) return Math.max(0, (line.netSalary || 0) - (line.incentive.amount || 0));
  const sales = (line.memberRole ?? member.role) === "sales_member";
  if (sales && line.computation && Array.isArray(line.computation.lines)) return netPayable(line.computation);
  return line.netSalary || 0;
}

/** Was this person on the books by `day`? Their account's creation day; unknown counts as yes. */
function employedBy(u: AppUser, day: string): boolean {
  const seconds = (u.createdAt as { seconds?: number } | null | undefined)?.seconds;
  if (!seconds) return true;
  return format(new Date(seconds * 1000), "yyyy-MM-dd") <= day;
}

/**
 * The pay periods a window of days touches, each with the share of its days inside the window — a whole
 * period inside counts 1, one day of a 31-day period counts 1/31. Replaces the 30-day-month proration
 * (`salaryMonthsFor`, removed 2026-10-15), which charged every window today's salary list.
 *
 * With `todayStr`, each entry also carries `shareToDate`: the share of its days inside the window that are
 * not after today (today included — a day being worked is a day being paid for). Equal to `share` for a
 * period that has ended; less for the period running now; 0 for one not started.
 */
export function periodsInWindow(
  from: string,
  to: string,
  cycleStartDay: number = DEFAULT_PAYROLL_CONFIG.payDayOfMonth,
  todayStr?: string,
): { month: string; share: number; end: string; shareToDate?: number }[] {
  if (!from || !to || from > to) return [];
  const [fy, fm, fd] = from.split("-").map(Number);
  let month = payPeriodForDate(new Date(fy, fm - 1, fd), cycleStartDay).month;
  const out: { month: string; share: number; end: string; shareToDate?: number }[] = [];
  for (let guard = 0; guard < 600; guard += 1) {
    const period = payPeriodForMonth(month, cycleStartDay);
    if (period.start > to) break;
    const days = periodDates(period);
    const insideDays = days.filter(d => d >= from && d <= to);
    if (insideDays.length > 0) {
      const entry: { month: string; share: number; end: string; shareToDate?: number } =
        { month, share: insideDays.length / days.length, end: period.end };
      if (todayStr) entry.shareToDate = insideDays.filter(d => d <= todayStr).length / days.length;
      out.push(entry);
    }
    month = shiftPayMonth(month, 1);
  }
  return out;
}
