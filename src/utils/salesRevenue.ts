import { categoryLabel } from "@/utils/serviceCatalog";
import { collectedInDays, saleDay, saleItemsOf } from "@/utils/salePayments";
import type { Lead, SaleDetail } from "@/types";

// Re-exported: these moved to utils/salePayments, which owns the sale-money model, and a dozen
// screens already import them from here.
export { saleDay, saleItemsOf };

/**
 * What a sales member earned in a given stretch of days, and what it was made of.
 *
 * ── Why this is not "the leads created that day" ──────────────────────────────────────────────
 * My Leads buckets leads by the day the LEAD was created, and the revenue tile used to be read off
 * that bucket. Most sales are follow-up calls on older numbers, so a sale closed today on a lead
 * assigned last week landed in last week's total and today's tile showed nothing at all.
 *
 * A sale belongs to the day it was MADE. That is `submittedAt`, which is stamped once when the
 * member records the sale and never moves.
 *
 * ── Why pending sales count ───────────────────────────────────────────────────────────────────
 * The tile also only added up sales a sales admin had already approved. Approval lands later, often
 * the next day, so "today's revenue" read ₹0 for the whole of today however much was sold. What the
 * member wants to see is what they brought in; whether the paperwork has caught up is a separate
 * fact, so it is reported alongside rather than used as a filter. Rejected sales are excluded —
 * those did not happen.
 */

/** One price point, e.g. three ₹499 packages. Grouped by price because that is what gets quoted. */
export interface RevenuePriceRow {
  amount: number;
  count: number;
  /** Display names of the categories sold at this price. */
  categories: string[];
}

export interface DayRevenue {
  /** Everything sold in the window, approved or not. */
  total: number;
  verified: number;
  /** Sold but still waiting on a sales admin. */
  pending: number;
  count: number;
  /** Largest ticket first — the order a member reads their own day in. */
  breakdown: RevenuePriceRow[];
}

/**
 * Total and split the sales that fall inside `days`.
 * Pass `null` for every day — the "All Days" view.
 */
export function dayRevenue(leads: Lead[], days: ReadonlySet<string> | null): DayRevenue {
  /**
   * ── Why this counts MONEY COLLECTED, not sale values ────────────────────────────────────────
   * A sale is what the client agreed to pay; a payment is what they actually handed over, and the
   * two are not the same day when half is taken up front and the rest on delivery. Totalling
   * `amount` on the sale's day credited a member with money they had not been given, and then
   * credited them with nothing at all on the day they finally collected the balance — which is
   * the day they did the work of collecting it.
   *
   * A sale nobody marked partial is one payment of the full price on the day of the sale, so for
   * the overwhelming majority of sales this is the same arithmetic it always was.
   */
  const sales: SaleDetail[] = [];
  let total = 0;
  let verified = 0;

  for (const lead of leads) {
    for (const item of saleItemsOf(lead)) {
      if (item.verificationStatus === "rejected") continue;
      const collected = collectedInDays(item, lead, days);
      if (collected <= 0) continue;
      total += collected;
      if (item.verificationStatus === "verified") verified += collected;
      sales.push(item);
    }
  }

  /**
   * The breakdown stays grouped by TICKET PRICE, not by what was collected.
   *
   * "Three 499s and a 999" is how a member reads their own day, and it stays true whether or not
   * one of those clients paid half. What they collected is the headline above it; what they sold
   * is what this list is for.
   */
  const byPrice = new Map<number, { amount: number; count: number; categories: Set<string> }>();
  for (const item of sales) {
    const amount = item.amount || 0;
    const row = byPrice.get(amount) || { amount, count: 0, categories: new Set<string>() };
    row.count += 1;
    if (item.category) row.categories.add(categoryLabel(item.category));
    byPrice.set(amount, row);
  }

  return {
    total,
    verified,
    pending: total - verified,
    count: sales.length,
    breakdown: Array.from(byPrice.values())
      .sort((a, b) => b.amount - a.amount)
      .map(({ amount, count, categories }) => ({ amount, count, categories: Array.from(categories) })),
  };
}

/*
  ── What "revenue" means — ONE rule for every screen (owner-delegated decision, 2026-10-18) ──────────────────
  Revenue is APPROVED sales: a sale a sales admin verified, at its agreed `amount`, on the day the sale was MADE
  (`saleDay` — its `submittedAt` as a local, India, day; else the lead's creation day), across `saleItems` and the
  legacy `saleDetails` alike. It is the rule the P&L (`profitAnalytics.computeProfit`), the Leaderboard and Payroll
  already used, and since this date it is the only one.

  Why: the first whole-app audit (2026-10-18) found "revenue" meaning three things. The Accounts Dashboard put
  "Revenue (verified sales) ₹2,998" beside a chart that counted PENDING sales at full contract value (₹10,000 on one
  day) plus the tech side's delivered value — the same work a second time; Revenue Overview, the main admin's Sales
  Department and the Sales Dashboard counted pending sales too; the main admin's Dashboard and Accounts took only the
  LAST sale on each lead, for all time. The owner delegated the choice ("take the best decision"): approved sales,
  because that is the money the company's own P&L and pay already stand on.

  - A sale AWAITING approval (pending, or an older record with no status) is never added into a revenue total or
    chart. A screen that used to count it shows it as its own labelled figure — "Awaiting approval: ₹X (n sales)".
  - A REJECTED sale did not happen and counts nowhere.
  - Money actually COLLECTED (`dayRevenue` above, `utils/salePayments`) is a third figure and stays where a screen
    already shows it. The tech side's delivered value is a productivity measure, never revenue (`profitAnalytics`).
  (Before this, 2026-10-15 → 10-18, the charts used `salesBookedByDay` / `salesBookedByOwner`: pending counted.)
*/

/** Does this sale count as revenue? Approved (verified) only. */
export function isApprovedSale(item: Pick<SaleDetail, "verificationStatus"> | null | undefined): boolean {
  return item?.verificationStatus === "verified";
}

/** A sale still waiting for a sales admin — neither approved nor rejected (a missing status included). */
export function isAwaitingApproval(item: Pick<SaleDetail, "verificationStatus"> | null | undefined): boolean {
  return !!item && item.verificationStatus !== "verified" && item.verificationStatus !== "rejected";
}

export interface RevenueTotals {
  /** Approved sales' agreed amounts — THE revenue figure. */
  revenue: number;
  /** How many approved sales. */
  count: number;
  /** Sales awaiting approval — shown beside revenue, never inside it. */
  awaiting: number;
  awaitingCount: number;
}

/** Which sale days to count; `null` / absent = every day ("All" / career). */
export type SaleDayFilter = ((day: string) => boolean) | null | undefined;

/**
 * Revenue (approved sales) and the sales awaiting approval, for the days `inDay` accepts — optionally only the
 * sales of one salesperson (`lead.assignedTo`). A sale with no day is counted only when every day is.
 */
export function revenueTotals(leads: Lead[], opts: { inDay?: SaleDayFilter; ownerId?: string } = {}): RevenueTotals {
  const out: RevenueTotals = { revenue: 0, count: 0, awaiting: 0, awaitingCount: 0 };
  for (const lead of leads) {
    if (opts.ownerId && lead.assignedTo !== opts.ownerId) continue;
    for (const item of saleItemsOf(lead)) {
      if (item.verificationStatus === "rejected") continue;
      if (opts.inDay) {
        const day = saleDay(item, lead);
        if (!day || !opts.inDay(day)) continue;
      }
      if (isApprovedSale(item)) {
        out.revenue += item.amount || 0;
        out.count += 1;
      } else {
        out.awaiting += item.amount || 0;
        out.awaitingCount += 1;
      }
    }
  }
  return out;
}

/** Revenue (approved sales) per sale day, `yyyy-MM-dd` → ₹. Days with no approved sale are absent. */
export function revenueByDay(leads: Lead[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const lead of leads) {
    for (const item of saleItemsOf(lead)) {
      if (!isApprovedSale(item)) continue;
      const day = saleDay(item, lead);
      if (!day) continue;
      byDay.set(day, (byDay.get(day) ?? 0) + (item.amount || 0));
    }
  }
  return byDay;
}

/** Revenue (approved sales) per salesperson (`lead.assignedTo`), for the days `inDay` accepts. */
export function revenueByOwner(leads: Lead[], inDay?: SaleDayFilter): Map<string, number> {
  const byOwner = new Map<string, number>();
  for (const lead of leads) {
    if (!lead.assignedTo) continue;
    const { revenue } = revenueTotals([lead], { inDay });
    if (revenue) byOwner.set(lead.assignedTo, (byOwner.get(lead.assignedTo) ?? 0) + revenue);
  }
  return byOwner;
}

/**
 * The last `n` CALENDAR days ending on `today` (inclusive), oldest first, as `yyyy-MM-dd`.
 *
 * "Last 7 days" charts took the last 7 DATES THAT HAD DATA (`slice(-7)` over the days present), so a quiet week
 * stretched the chart back a month and a day with no sale simply vanished. Now a day with nothing is a 0.
 */
export function lastCalendarDays(today: string, n: number): string[] {
  const [y, m, d] = today.split("-").map(Number);
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = new Date(y, (m || 1) - 1, (d || 1) - i, 12); // midday: no DST edge can move the day
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    days.push(`${date.getFullYear()}-${mm}-${dd}`);
  }
  return days;
}

/** Revenue per day for exactly these days (0 where nothing was approved), in the order given. */
export function revenueSeries(leads: Lead[], days: string[]): { date: string; revenue: number }[] {
  const byDay = revenueByDay(leads);
  return days.map((date) => ({ date, revenue: byDay.get(date) ?? 0 }));
}

/** "Awaiting approval: ₹1,999 (1 sale)" — the one wording for the figure shown beside revenue. */
export function awaitingApprovalLabel(totals: Pick<RevenueTotals, "awaiting" | "awaitingCount">): string {
  const n = totals.awaitingCount;
  return `Awaiting approval: ₹${new Intl.NumberFormat("en-IN").format(totals.awaiting)} (${n} sale${n === 1 ? "" : "s"})`;
}
