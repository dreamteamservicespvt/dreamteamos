import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { commissionRate } from "@/services/settlements";
import { useSalaryMonth, type SalaryMonthState } from "./useSalaryMonth";
import { withinPeriod, type PeriodFilter } from "@/utils/periodFilter";
import { deductionsFor } from "@/utils/payrollEngine";
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
  commission: number;
  /** Sales recorded but not yet verified — not paid, but worth surfacing. */
  pendingSaleCount: number;
  pendingSaleValue: number;

  /** salaryPayable + commission. */
  totalEarnings: number;
}

function saleItemsOf(lead: Lead): SaleDetail[] {
  return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
}

function saleDateOf(item: SaleDetail, lead: Lead): string | null {
  const seconds = (item.submittedAt as { seconds?: number })?.seconds
    ?? (lead.createdAt as { seconds?: number })?.seconds;
  return seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null;
}

export interface UseSalesEarningsOptions {
  memberId: string | undefined;
  monthlySalary: number;
  earningsOption?: string;
  /** `yyyy-MM` pay period. */
  month?: string;
}

export function useSalesEarnings({
  memberId, monthlySalary, earningsOption, month,
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
    // Commission follows the same 10th→9th pay period as salary, so one payday settles one span.
    const filter: PeriodFilter = {
      mode: "range",
      month: salary.period.month,
      day: salary.period.start,
      range: {
        from: new Date(`${salary.period.start}T00:00:00`),
        to: new Date(`${salary.period.end}T00:00:00`),
      },
    };

    let salesBase = 0, saleCount = 0, pendingSaleValue = 0, pendingSaleCount = 0;

    for (const lead of leads) {
      for (const item of saleItemsOf(lead)) {
        const date = saleDateOf(item, lead);
        if (!withinPeriod(date ?? undefined, filter)) continue;

        if (item.verificationStatus === "verified") {
          salesBase += item.amount || 0;
          saleCount += 1;
        } else if (item.verificationStatus === "pending") {
          pendingSaleValue += item.amount || 0;
          pendingSaleCount += 1;
        }
      }
    }

    return { salesBase, saleCount, pendingSaleValue, pendingSaleCount };
  }, [leads, salary.period]);

  const { total: salaryDeduction } = deductionsFor(salary.computation);
  const salaryPayable = Math.max(0, salary.computation.monthlySalary - salaryDeduction);
  const commission = Math.round((sales.salesBase * rate) / 100);

  return {
    loading: salary.loading || !leadsLoaded,
    salary,
    salaryPayable,
    salaryDeduction,
    salesBase: sales.salesBase,
    saleCount: sales.saleCount,
    rate,
    commission,
    pendingSaleCount: sales.pendingSaleCount,
    pendingSaleValue: sales.pendingSaleValue,
    totalEarnings: salaryPayable + commission,
  };
}
