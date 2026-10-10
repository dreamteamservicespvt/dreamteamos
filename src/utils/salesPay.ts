/**
 * A sales member's incentive for one pay period — the ONE rule, used by the sales admin's Sales
 * Payroll and by the member's own My Salary / Dashboard alike.
 *
 * ── Why this exists (2026-10-09) ──────────────────────────────────────────────────────────────
 * The two screens priced the same incentive two ways. The member's page (`useSalesEarnings`)
 * counted money COLLECTED inside the 10th → 9th cycle on verified sales and withheld the incentive
 * below 75% of the cycle's target — the rule their offer and appointment letters state. Sales
 * Payroll (`useSalesMemberPay`) counted each sale's full price on the day it was submitted — the
 * UTC day, so a sale made before 05:30 IST landed in the previous day, and on the 10th in the
 * previous cycle — and never applied the target gate. So the admin paid one figure while the
 * member was shown another, for the same sales. Both now ask this module.
 *
 * Pure: no Firestore, no clock — the period and the target are passed in.
 */
import type { Lead, SaleDetail } from "@/types";
import { collectedInRange } from "@/utils/salePayments";
import {
  INCENTIVE_TARGET_THRESHOLD, incentiveEarned, monthlyTargetFor, targetAchievement,
} from "@/utils/salesTargets";

export interface PeriodSales {
  /** Verified money collected inside the period — what the incentive rate applies to. */
  salesBase: number;
  saleCount: number;
  /** Collected inside the period on sales still awaiting verification — not paid, but shown. */
  pendingSaleValue: number;
  pendingSaleCount: number;
}

const saleItemsOf = (lead: Lead): SaleDetail[] =>
  lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);

/**
 * Money collected in `[start, end]` on a member's sales, verified and pending.
 *
 * A sale is the member's when its lead is assigned to them (`lead.assignedTo`) — the ownership both
 * screens have always used. `ownerId` omitted means "these leads are already one member's".
 */
export function salesInPeriod(leads: Lead[], start: string, end: string, ownerId?: string): PeriodSales {
  const out: PeriodSales = { salesBase: 0, saleCount: 0, pendingSaleValue: 0, pendingSaleCount: 0 };
  for (const lead of leads) {
    if (ownerId !== undefined && lead.assignedTo !== ownerId) continue;
    for (const item of saleItemsOf(lead)) {
      // Counted on the day the money arrived (a sale nobody marked partial: its own day, in full).
      const collected = collectedInRange(item, lead, start, end);
      if (collected <= 0) continue;
      if (item.verificationStatus === "verified") {
        out.salesBase += collected;
        out.saleCount += 1;
      } else if (item.verificationStatus === "pending") {
        out.pendingSaleValue += collected;
        out.pendingSaleCount += 1;
      }
    }
  }
  return out;
}

export interface SalesIncentive {
  /** What the rate produces on the period's verified sales, before the target gate. */
  commissionBeforeTarget: number;
  /** What is actually earned — 0 when the gate withheld it. */
  commission: number;
  /** The cycle's target (daily target × days in the cycle). 0 when none is set. */
  periodTarget: number;
  achievement: number;
  /** True when the gate withheld an incentive the sales would otherwise have earned. */
  withheld: boolean;
  /** Sales still needed to unlock it, in rupees. 0 once earned. */
  shortfall: number;
}

/**
 * The incentive the period's verified sales earn.
 *
 * All-or-nothing at 75% of the cycle's target, as the letters say. No target set means nothing is
 * withheld — a blank field must not cost anyone their commission.
 */
export function salesIncentive(input: {
  salesBase: number;
  /** Percent — `services/settlements.commissionRate(member.earningsOption)`. */
  rate: number;
  /** The member's daily target (`utils/salesTargets.dailyTargetOf`); 0 or absent = none. */
  dailyTarget?: number;
  /** First day of the pay period, `yyyy-MM-dd` — fixes how many days the target spans. */
  periodStart: string;
}): SalesIncentive {
  const commissionBeforeTarget = Math.round((input.salesBase * input.rate) / 100);
  const periodTarget = input.dailyTarget && input.dailyTarget > 0
    ? monthlyTargetFor(input.dailyTarget, new Date(`${input.periodStart}T00:00:00`))
    : 0;
  const earned = incentiveEarned(input.salesBase, periodTarget);
  return {
    commissionBeforeTarget,
    commission: earned ? commissionBeforeTarget : 0,
    periodTarget,
    achievement: targetAchievement(input.salesBase, periodTarget),
    withheld: !earned && commissionBeforeTarget > 0,
    shortfall: earned ? 0 : Math.max(0, Math.ceil(periodTarget * INCENTIVE_TARGET_THRESHOLD - input.salesBase)),
  };
}
