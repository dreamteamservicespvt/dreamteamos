import { useMemo } from "react";
import { commissionRate } from "@/services/settlements";
import { useSalaryMonth, type SalaryMonthState } from "./useSalaryMonth";
import { useMyLeads } from "./useMyLeads";
import { deductionsFor, netPayable } from "@/utils/payrollEngine";
import { salesIncentive, salesInPeriod } from "@/utils/salesPay";

/**
 * A sales member's total earnings for a pay period: salary (attendance-driven, exactly like
 * tech) **plus** commission on their own verified sales.
 *
 * Salary and commission are deliberately kept as separate figures right up to the total — a
 * sales member needs to see which half of their pay is guaranteed and which they earned.
 */

export interface SalesEarnings {
  loading: boolean;
  /** The attendance-driven half, shared with the tech engine. */
  salary: SalaryMonthState;
  /** Monthly salary minus attendance deductions. */
  salaryPayable: number;
  salaryDeduction: number;

  /** Verified sales value in the period. */
  salesBase: number;
  saleCount: number;
  /** Percentage rate this member earns. */
  rate: number;
  /** What the rate produces on the period's verified sales, before the target gate. */
  commissionBeforeTarget: number;
  /** What is actually earned — zero when the target gate withheld it. */
  commission: number;
  /** The target for this pay cycle: the daily figure across it. 0 when none is set. */
  periodTarget: number;
  /** Verified sales as a fraction of `periodTarget`. 0 when there is no target. */
  achievement: number;
  /**
   * True when the incentive was withheld for missing target. Distinct from a commission of zero
   * because there were no sales — the member is owed an explanation, not a blank.
   */
  incentiveWithheld: boolean;
  /** Sales still needed to reach the incentive gate, in rupees. 0 once it is earned. */
  incentiveShortfall: number;
  /** Sales recorded but not yet verified — not paid, but worth surfacing. */
  pendingSaleCount: number;
  pendingSaleValue: number;

  /** salaryPayable + commission — once the period is paid, the amount that was paid. */
  totalEarnings: number;
  /** The live figure (attendance + verified collected sales today), paid or not. */
  liveTotalEarnings: number;
  /** Paid, and the live figure no longer matches what was paid. */
  changedSincePaid: boolean;
}


export interface UseSalesEarningsOptions {
  memberId: string | undefined;
  monthlySalary: number;
  earningsOption?: string;
  /** `yyyy-MM` pay period. */
  month?: string;
  /**
   * The member's daily target. The incentive is withheld for a cycle in which they achieve less
   * than 75% of it across the period (see utils/salesTargets), which is the rule their offer and
   * appointment letters state in those words. Omit it, or leave it 0, and nothing is withheld.
   */
  dailyTarget?: number;
}

export function useSalesEarnings({
  memberId, monthlySalary, earningsOption, month, dailyTarget,
}: UseSalesEarningsOptions): SalesEarnings {
  const salary = useSalaryMonth({ memberId, monthlySalary, month });
  // Shared with Dashboard / My Leads / My Performance — one listener for the whole session
  // (see store/salesLeadsStore.ts) instead of this hook opening its own. Only ever called with
  // the signed-in member's own uid, which is exactly what the shared store is keyed on.
  const { leads, loading: leadsLoading } = useMyLeads();
  const leadsLoaded = !!memberId && !leadsLoading;

  const rate = commissionRate(earningsOption);

  /**
   * Incentives follow the same 10th→9th pay period as salary, so one payday settles one span —
   * and they are counted on MONEY COLLECTED in that span, not on the price agreed (an advance on a
   * ₹50,000 package does not pay a full incentive the day it is booked; the balance pays when it
   * arrives). The rule — the sales counted and the 75% target gate — is `utils/salesPay`, the same
   * one Sales Payroll prices this member with, so the two screens cannot disagree again.
   */
  const sales = useMemo(
    () => salesInPeriod(leads, salary.period.start, salary.period.end),
    [leads, salary.period.start, salary.period.end],
  );
  const incentive = salesIncentive({
    salesBase: sales.salesBase, rate, dailyTarget, periodStart: salary.period.start,
  });

  // The salary half is the engine's own figure — `netPayable` is what Payroll pays too. Once the
  // period is paid, `salary.computation` is the paid record's, so this is what was paid for it.
  const salaryPayable = netPayable(salary.computation);
  const salaryDeduction = deductionsFor(salary.computation).total;
  const liveTotalEarnings = netPayable(salary.liveComputation) + incentive.commission;

  /**
   * A paid period shows the payment: its amount, and the incentive inside it — stored on the line
   * since 2026-10-09; for an older line, whatever the payment held beyond the salary half.
   */
  const paid = salary.paidLine;
  const paidIncentive = paid
    ? (paid.incentive?.amount ?? Math.max(0, Math.round(paid.netSalary - salaryPayable)))
    : null;
  const commission = paidIncentive ?? incentive.commission;
  const totalEarnings = paid ? paid.netSalary : salaryPayable + incentive.commission;

  return {
    loading: salary.loading || !leadsLoaded,
    salary,
    salaryPayable,
    salaryDeduction,
    salesBase: sales.salesBase,
    saleCount: sales.saleCount,
    rate,
    commissionBeforeTarget: incentive.commissionBeforeTarget,
    commission,
    periodTarget: incentive.periodTarget,
    achievement: incentive.achievement,
    incentiveWithheld: incentive.withheld,
    /**
     * The sales still needed to unlock the incentive, in rupees.
     *
     * A gate stated as a percentage is a fact; stated as "₹12,400 more" it is an instruction. The
     * member cannot act on "you are at 61%" without doing the arithmetic themselves, in their head,
     * against a target they may not remember.
     */
    incentiveShortfall: incentive.shortfall,
    pendingSaleCount: sales.pendingSaleCount,
    pendingSaleValue: sales.pendingSaleValue,
    totalEarnings,
    liveTotalEarnings,
    changedSincePaid: !!paid && Math.round(liveTotalEarnings) !== Math.round(paid.netSalary),
  };
}
