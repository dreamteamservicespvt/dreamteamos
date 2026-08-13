import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { commissionRate } from "@/services/settlements";
import { useSalaryMonth, type SalaryMonthState } from "./useSalaryMonth";
import { collectedInRange } from "@/utils/salePayments";
import { deductionsFor } from "@/utils/payrollEngine";
import {
  incentiveEarned, monthlyTargetFor, targetAchievement, INCENTIVE_TARGET_THRESHOLD,
} from "@/utils/salesTargets";
import type { Lead, SaleDetail } from "@/types";

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

  /** salaryPayable + commission. */
  totalEarnings: number;
}

function saleItemsOf(lead: Lead): SaleDetail[] {
  return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoaded, setLeadsLoaded] = useState(false);

  useEffect(() => {
    if (!memberId) return;
    setLeadsLoaded(false);
    return onSnapshot(
      query(collection(db, "leads"), where("assignedTo", "==", memberId)),
      snap => {
        setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
        setLeadsLoaded(true);
      },
      error => {
        console.error("Sales earnings lead listener failed:", error);
        setLeads([]);
        setLeadsLoaded(true);
      },
    );
  }, [memberId]);

  const rate = commissionRate(earningsOption);

  const sales = useMemo(() => {
    /**
     * Incentives follow the same 10th→9th pay period as salary, so one payday settles one span —
     * and they are counted on MONEY COLLECTED in that span, not on the price agreed.
     *
     * That second half was the discrepancy. This counted `item.amount` in full on the day the sale
     * was submitted, while the leaderboard, the dashboard's revenue line and its target bars all
     * count what the client actually paid, on the day they paid it. So the same card could say "11%
     * achieved" against the monthly target and "10% there" against the incentive gate — two
     * different answers to one question, on one screen — and a member's incentive on their own
     * salary page disagreed with the leaderboard's figure for them.
     *
     * Collected is the right basis of the two: an advance on a ₹50,000 package should not pay a
     * full incentive on the day it is booked, and the balance should pay when it arrives.
     */
    const { start, end } = salary.period;

    let salesBase = 0, saleCount = 0, pendingSaleValue = 0, pendingSaleCount = 0;

    for (const lead of leads) {
      for (const item of saleItemsOf(lead)) {
        const collected = collectedInRange(item, lead, start, end);
        if (collected <= 0) continue;

        if (item.verificationStatus === "verified") {
          salesBase += collected;
          saleCount += 1;
        } else if (item.verificationStatus === "pending") {
          pendingSaleValue += collected;
          pendingSaleCount += 1;
        }
      }
    }

    return { salesBase, saleCount, pendingSaleValue, pendingSaleCount };
  }, [leads, salary.period]);

  const { total: salaryDeduction } = deductionsFor(salary.computation);
  const salaryPayable = Math.max(0, salary.computation.monthlySalary - salaryDeduction);
  const commissionBeforeTarget = Math.round((sales.salesBase * rate) / 100);

  /**
   * The target gate, measured over the same 10th → 9th cycle the commission is.
   *
   * All-or-nothing rather than tapered: below 75% of the cycle's target no incentive is payable on
   * the sales that WERE made, which is what the member's letter says in those words.
   * `incentiveEarned` returns true when no target is set, so a member nobody has given a target
   * loses nothing to a blank field.
   */
  const periodTarget = dailyTarget && dailyTarget > 0
    ? monthlyTargetFor(dailyTarget, new Date(`${salary.period.start}T00:00:00`))
    : 0;
  const earned = incentiveEarned(sales.salesBase, periodTarget);
  const commission = earned ? commissionBeforeTarget : 0;

  return {
    loading: salary.loading || !leadsLoaded,
    salary,
    salaryPayable,
    salaryDeduction,
    salesBase: sales.salesBase,
    saleCount: sales.saleCount,
    rate,
    commissionBeforeTarget,
    commission,
    periodTarget,
    achievement: targetAchievement(sales.salesBase, periodTarget),
    incentiveWithheld: !earned && commissionBeforeTarget > 0,
    /**
     * The sales still needed to unlock the incentive, in rupees.
     *
     * A gate stated as a percentage is a fact; stated as "₹12,400 more" it is an instruction. The
     * member cannot act on "you are at 61%" without doing the arithmetic themselves, in their head,
     * against a target they may not remember.
     */
    incentiveShortfall: earned
      ? 0
      : Math.max(0, Math.ceil(periodTarget * INCENTIVE_TARGET_THRESHOLD - sales.salesBase)),
    pendingSaleCount: sales.pendingSaleCount,
    pendingSaleValue: sales.pendingSaleValue,
    totalEarnings: salaryPayable + commission,
  };
}
