import { format } from "date-fns";
import { categoryLabel } from "@/utils/serviceCatalog";
import type { Lead, SaleDetail } from "@/types";

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

/** The `yyyy-MM-dd` a sale counts on: when it was recorded, falling back to the lead's own date. */
export function saleDay(item: SaleDetail, lead: Lead): string | null {
  const submitted = (item.submittedAt as { seconds?: number } | undefined)?.seconds;
  if (submitted) return format(new Date(submitted * 1000), "yyyy-MM-dd");
  if (lead.createdAt?.seconds) return format(new Date(lead.createdAt.seconds * 1000), "yyyy-MM-dd");
  return null;
}

/** Every sale on a lead, whichever shape the record uses. */
const saleItemsOf = (lead: Lead): SaleDetail[] =>
  lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);

/**
 * Total and split the sales that fall inside `days`.
 * Pass `null` for every day — the "All Days" view.
 */
export function dayRevenue(leads: Lead[], days: ReadonlySet<string> | null): DayRevenue {
  const sales: SaleDetail[] = [];
  for (const lead of leads) {
    for (const item of saleItemsOf(lead)) {
      if (item.verificationStatus === "rejected") continue;
      if (days) {
        const day = saleDay(item, lead);
        if (!day || !days.has(day)) continue;
      }
      sales.push(item);
    }
  }

  const total = sales.reduce((sum, i) => sum + (i.amount || 0), 0);
  const verified = sales
    .filter((i) => i.verificationStatus === "verified")
    .reduce((sum, i) => sum + (i.amount || 0), 0);

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
