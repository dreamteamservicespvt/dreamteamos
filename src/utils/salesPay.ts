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
 * Pure: no Firestore, no clock — the period and the target are passed in. Since 2026-10-15 this file is
 * also the ONE commission rule for every other screen (Settlements, My Performance, the Leaderboard, the
 * P&L) — see the section at the end.
 */
import { format } from "date-fns";
import type { CommissionSettlement, Lead, SaleDetail } from "@/types";
import { collectedInRange, collectionKey, paymentEvents } from "@/utils/salePayments";
import { saleIdOf, timestampMs } from "@/utils/saleIdentity";
import { payPeriodForDate, payPeriodForMonth, payPeriodLabel, type PayPeriod } from "@/utils/payrollEngine";
import {
  INCENTIVE_TARGET_THRESHOLD, incentiveEarned, monthlyTargetFor, targetAchievement,
} from "@/utils/salesTargets";
import { DEFAULT_PAYROLL_CONFIG } from "@/types/payroll";
import { SALES_INCENTIVE_PERCENT, SALES_INCENTIVE_PERCENT_ENHANCED } from "@/utils/salesIncentive";

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

// ═══ One commission rule, on every screen (owner, 2026-10-15: "Payroll's rule everywhere") ════════════

/**
 * ── Why this section exists ───────────────────────────────────────────────────────────────────
 * Commission was priced five ways. Sales Payroll and My Salary: money COLLECTED in the 10th → 9th pay
 * period, at the member's rate, withheld below 75% of the period's target (the rule above, the one the
 * letters state). Settlements: every sale VERIFIED since the last settlement's moment, its whole collected
 * amount, no target gate — so a revoke and a re-approval re-dated a settled sale and paid it again. My
 * Performance: verified sale PRICES since the last "paid through" day. The Leaderboard and the P&L: 5% or
 * 10% of everything, no gate. And Settlements and Sales Payroll could each pay the same sale.
 *
 * One rule now: commission counts in the pay period the money was collected, at the rate that applied in
 * that period (`utils/payTerms`), and only when the member met 75% of that period's target. Every
 * collection has one identity (`salePayments.collectionKey`), so what a payment paid is recorded and is
 * never paid again: a settlement records the collections it paid (`CommissionSettlement.paidKeys`), and a
 * Sales Payroll payment settles its whole period. Settlements never pays a period Sales Payroll has paid;
 * Sales Payroll leaves out every collection a settlement paid.
 */

/** One payment received on one sale, as the commission rule reads it. */
export interface Collection {
  /** `<saleId>#<payment id>` — the identity a payment records it paid. */
  key: string;
  saleId: string;
  leadId: string;
  /** The salesperson (`lead.assignedTo`). */
  ownerId: string | null;
  amount: number;
  /** The local day it was collected. */
  day: string | null;
  status: SaleDetail["verificationStatus"];
  /**
   * When the sale was FIRST approved, epoch ms (falling back to the later stamps an older sale has) — read
   * only to place the settlements made before 2026-10-15, which recorded no keys.
   */
  approvedMs: number;
}

/** Every collection on these leads (one member's, when `ownerId` is given). */
export function collectionsOf(leads: Lead[], ownerId?: string): Collection[] {
  const out: Collection[] = [];
  for (const lead of leads) {
    if (ownerId !== undefined && lead.assignedTo !== ownerId) continue;
    saleItemsOf(lead).forEach((item, index) => {
      const saleId = saleIdOf(lead.id, item, index);
      const approvedMs = timestampMs(item.firstVerifiedAt) || timestampMs(item.verifiedAt)
        || timestampMs(item.submittedAt) || timestampMs(lead.createdAt);
      const seen = new Set<string>();
      for (const p of paymentEvents(item, lead)) {
        if (p.amount <= 0) continue;
        // Two payments written with the same id (a double tap) stay two collections.
        let key = collectionKey(saleId, p.id);
        while (seen.has(key)) key = `${key}~`;
        seen.add(key);
        out.push({
          key, saleId, leadId: lead.id, ownerId: lead.assignedTo ?? null, amount: p.amount, day: p.day,
          status: item.verificationStatus, approvedMs,
        });
      }
    });
  }
  return out;
}

/** The pay period (`yyyy-MM`) a local day falls in. */
export function periodOfDay(day: string, cycleStartDay: number = DEFAULT_PAYROLL_CONFIG.payDayOfMonth): string {
  const [y, m, d] = day.split("-").map(Number);
  return payPeriodForDate(new Date(y, m - 1, d), cycleStartDay).month;
}

/** The terms the rule needs for one period — `commissionRate(payTermsFor(…).earningsOption)` and its target. */
export interface CommissionTerms {
  rate: number;
  dailyTarget: number;
}

/** One period's incentive under the rule, with what was already paid elsewhere left out. */
export interface PeriodIncentive extends SalesIncentive, PeriodSales {
  period: string;
  rate: number;
  /** Verified money in the period whose incentive another payment already paid — not paid again here. */
  settledBase: number;
  settledKeys: string[];
  /** Verified money in the period this incentive is paid on (`salesBase` − `settledBase`). */
  payableBase: number;
  payableKeys: string[];
}

/**
 * The incentive a period earns, the ONE way: the 75% gate is decided on ALL the verified money collected in
 * the period; the incentive is paid on what nobody has paid yet. `exclude` = the collections already paid.
 */
export function periodIncentive(input: {
  collections: Collection[];
  period: PayPeriod;
  rate: number;
  dailyTarget?: number;
  exclude?: ReadonlySet<string> | readonly string[] | null;
}): PeriodIncentive {
  const { period, rate } = input;
  const exclude: ReadonlySet<string> = input.exclude instanceof Set ? input.exclude : new Set(input.exclude ?? []);
  const verifiedSales = new Set<string>();
  const pendingSales = new Set<string>();
  let salesBase = 0, pendingSaleValue = 0, settledBase = 0;
  const settledKeys: string[] = [];
  const payableKeys: string[] = [];
  for (const c of input.collections) {
    if (!c.day || c.day < period.start || c.day > period.end) continue;
    if (c.status === "verified") {
      salesBase += c.amount;
      verifiedSales.add(c.saleId);
      if (exclude.has(c.key)) { settledBase += c.amount; settledKeys.push(c.key); }
      else payableKeys.push(c.key);
    } else if (c.status === "pending") {
      pendingSaleValue += c.amount;
      pendingSales.add(c.saleId);
    }
  }
  const gate = salesIncentive({ salesBase, rate, dailyTarget: input.dailyTarget, periodStart: period.start });
  const earned = incentiveEarned(salesBase, gate.periodTarget);
  const payableBase = salesBase - settledBase;
  const commissionBeforeTarget = Math.round((payableBase * rate) / 100);
  return {
    period: period.month,
    rate,
    salesBase,
    saleCount: verifiedSales.size,
    pendingSaleValue,
    pendingSaleCount: pendingSales.size,
    settledBase,
    settledKeys,
    payableBase,
    payableKeys,
    commissionBeforeTarget,
    commission: earned ? commissionBeforeTarget : 0,
    periodTarget: gate.periodTarget,
    achievement: gate.achievement,
    withheld: !earned && commissionBeforeTarget > 0,
    shortfall: gate.shortfall,
  };
}

/**
 * The collections settlements have paid (one member's settlements and collections).
 *
 * A settlement made since 2026-10-15 says so itself (`paidKeys`). One made before paid "every sale
 * verified since the previous one, as collected by then": a verified collection is covered by the first
 * of those settlements made at or after its sale was first approved, if it had been collected by that
 * settlement's day. A balance collected later was never paid by that model, so it stays payable.
 */
export function settlementCoverage(settlements: CommissionSettlement[], collections: Collection[]): Set<string> {
  const covered = new Set<string>();
  const cuts: number[] = [];
  for (const s of settlements) {
    if (Array.isArray(s.paidKeys)) s.paidKeys.forEach(k => covered.add(k));
    else {
      const ms = timestampMs(s.paidAt);
      if (ms > 0) cuts.push(ms);
    }
  }
  if (cuts.length === 0) return covered;
  cuts.sort((a, b) => a - b);
  for (const c of collections) {
    if (c.status !== "verified" || !c.day) continue;
    const cut = cuts.find(t => c.approvedMs <= t);
    if (cut !== undefined && c.day <= format(new Date(cut), "yyyy-MM-dd")) covered.add(c.key);
  }
  return covered;
}

/** Where a period's incentive stands, for Settlements and the member's own pages. */
export type CommissionPeriodStatus =
  /** Sales Payroll paid this period — its incentive went with the salary (or was withheld there). */
  | "payroll"
  /** Still running: the target gate is decided when it ends. */
  | "running"
  /** Ended, gate met, incentive not paid yet. */
  | "due"
  /** Ended under 75% of the target — no incentive for it. */
  | "withheld"
  /** Everything in it was paid in Settlements. */
  | "settled"
  /** Nothing collected and verified in it. */
  | "none";

export interface CommissionPeriodRow extends PeriodIncentive {
  label: string;
  start: string;
  end: string;
  ended: boolean;
  status: CommissionPeriodStatus;
}

/**
 * Every pay period a member has money in, newest first, with what is owed for each — what Settlements
 * pays and what the member is shown. Only ENDED periods can be due: the 75% gate belongs to the whole
 * period, so it is decided once the period is over.
 */
export function commissionByPeriod(input: {
  collections: Collection[];
  settlements: CommissionSettlement[];
  /** Periods (`yyyy-MM`) Sales Payroll has paid this member. */
  payrollPaid: ReadonlySet<string>;
  termsFor: (period: string) => CommissionTerms;
  todayStr: string;
  cycleStartDay?: number;
}): { rows: CommissionPeriodRow[]; due: CommissionPeriodRow[]; dueAmount: number; covered: Set<string> } {
  const cycleStartDay = input.cycleStartDay ?? DEFAULT_PAYROLL_CONFIG.payDayOfMonth;
  const covered = settlementCoverage(input.settlements, input.collections);
  const running = periodOfDay(input.todayStr, cycleStartDay);
  const months = new Set<string>([running]);
  for (const c of input.collections) {
    if (c.day && (c.status === "verified" || c.status === "pending")) months.add(periodOfDay(c.day, cycleStartDay));
  }
  const rows = [...months]
    .filter(m => m <= running)
    .sort((a, b) => b.localeCompare(a))
    .map((month): CommissionPeriodRow => {
      const period = payPeriodForMonth(month, cycleStartDay);
      const terms = input.termsFor(month);
      const inc = periodIncentive({
        collections: input.collections, period, rate: terms.rate, dailyTarget: terms.dailyTarget, exclude: covered,
      });
      const ended = input.todayStr > period.end;
      const status: CommissionPeriodStatus = input.payrollPaid.has(month) ? "payroll"
        : !ended ? "running"
        : inc.commission > 0 ? "due"
        : inc.withheld ? "withheld"
        : inc.settledBase > 0 && inc.payableBase === 0 ? "settled"
        : "none";
      return { ...inc, label: payPeriodLabel(month, cycleStartDay), start: period.start, end: period.end, ended, status };
    });
  const due = rows.filter(r => r.status === "due");
  return { rows, due, dueAmount: due.reduce((s, r) => s + r.commission, 0), covered };
}

/**
 * The incentive the rule gives the money collected inside a window of days — the Leaderboard's columns,
 * the P&L's commission cost. Each period's gate is decided on ALL of that period's verified money (so far,
 * for the running one); the incentive is the period's rate on the part collected inside the window.
 * `from` / `to` are inclusive `yyyy-MM-dd`; null = unbounded.
 */
export function commissionInWindow(input: {
  collections: Collection[];
  from: string | null;
  to: string | null;
  termsFor: (period: string) => CommissionTerms;
  cycleStartDay?: number;
}): { base: number; commission: number } {
  const cycleStartDay = input.cycleStartDay ?? DEFAULT_PAYROLL_CONFIG.payDayOfMonth;
  const byPeriod = new Map<string, { all: number; inWindow: number }>();
  for (const c of input.collections) {
    if (c.status !== "verified" || !c.day) continue;
    const month = periodOfDay(c.day, cycleStartDay);
    const row = byPeriod.get(month) ?? { all: 0, inWindow: 0 };
    row.all += c.amount;
    if ((!input.from || c.day >= input.from) && (!input.to || c.day <= input.to)) row.inWindow += c.amount;
    byPeriod.set(month, row);
  }
  let base = 0, commission = 0;
  for (const [month, { all, inWindow }] of byPeriod) {
    if (inWindow <= 0) continue;
    base += inWindow;
    const terms = input.termsFor(month);
    const start = payPeriodForMonth(month, cycleStartDay).start;
    const target = terms.dailyTarget > 0 ? monthlyTargetFor(terms.dailyTarget, new Date(`${start}T00:00:00`)) : 0;
    if (incentiveEarned(all, target)) commission += Math.round((inWindow * terms.rate) / 100);
  }
  return { base, commission };
}

// ═══ The running period's earnings estimate (My Performance, 2026-10-15) ═══════════════════════════════

/** Option 1's salary part: up to ₹5,000, reached at ₹30,000 collected (unchanged since the plans began). */
export const PLAN_ESTIMATE_SALARY_MAX = 5000;
export const PLAN_ESTIMATE_SALES_FOR_FULL_SALARY = 30000;

export interface PlanEstimate {
  period: string;
  /** Verified money collected in the period so far. */
  salesBase: number;
  /** The period's target (0 = none set — nothing withheld). */
  periodTarget: number;
  achievement: number;
  /** 75% of the target reached so far (or no target). The gate is decided when the period ends. */
  gateMetSoFar: boolean;
  /** Collections still needed to reach 75%, in rupees. 0 once reached. */
  shortfall: number;
  /** Salary + 5%: the proportional salary, the 5% incentive (0 while under the gate), their total. */
  option1: { salary: number; incentive: number; incentiveBeforeTarget: number; total: number };
  /** 10% incentive: the incentive (0 while under the gate). */
  option2: { incentive: number; incentiveBeforeTarget: number; total: number };
}

/**
 * What the period running now would earn on each plan if it ended today — an ESTIMATE.
 *
 * ── Why (2026-10-15) ──────────────────────────────────────────────────────────────────────────
 * My Performance's "Option 1 / Option 2" card multiplied the period's money by 5% and 10% with no target
 * gate, so a member at 40% of their target was shown an incentive Sales Payroll would never pay. It now
 * reads the ONE rule (`periodIncentive`): money collected in the period on verified sales, the incentive
 * only at 75% of the period's target (the target that applied in it, `utils/payTerms`). Both plans are
 * priced with the plan's own rate — the comparison is the point for somebody not on a plan yet. The
 * salary part of Option 1 is the plan's proportional salary, not an incentive, so the gate never touches it.
 */
export function runningPlanEstimate(input: {
  collections: Collection[];
  period: PayPeriod;
  /** The daily target that applies in the period; 0 / absent = none. */
  dailyTarget?: number;
}): PlanEstimate {
  const at = (rate: number) => periodIncentive({
    collections: input.collections, period: input.period, rate, dailyTarget: input.dailyTarget,
  });
  const five = at(SALES_INCENTIVE_PERCENT);
  const ten = at(SALES_INCENTIVE_PERCENT_ENHANCED);
  const salesBase = five.salesBase;
  const salary = Math.min(PLAN_ESTIMATE_SALARY_MAX, (salesBase / PLAN_ESTIMATE_SALES_FOR_FULL_SALARY) * PLAN_ESTIMATE_SALARY_MAX);
  const gateMetSoFar = incentiveEarned(salesBase, five.periodTarget);
  return {
    period: input.period.month,
    salesBase,
    periodTarget: five.periodTarget,
    achievement: five.achievement,
    gateMetSoFar,
    shortfall: five.shortfall,
    option1: {
      salary,
      incentive: five.commission,
      incentiveBeforeTarget: five.commissionBeforeTarget,
      total: salary + five.commission,
    },
    option2: { incentive: ten.commission, incentiveBeforeTarget: ten.commissionBeforeTarget, total: ten.commission },
  };
}
