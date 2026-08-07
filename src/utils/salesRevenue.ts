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
