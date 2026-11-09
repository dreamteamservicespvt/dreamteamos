/**
 * ── Team Attendance's salary line (owner, 2026-11-09: "show salary count to the tech lead, based on the attendance
 * of the tech team members") ──
 *
 * One member's pay for one pay period as the attendance grid shows it: the days the period pays and the amount.
 * It is NOT a second salary rule: the figures are Payroll's own — `computeSalary` on the same resolved days, the
 * salary of THAT period (`payTerms.salaryFor`), `netPayable` for the amount and `payableDays` for the days — so the
 * grid, Payroll, My Salary and the payslip can never disagree. Once Payroll has paid the period, the payment record
 * is the figure (as in `useMonthPayroll`): history never moves after payday.
 *
 * View only: the team leader sees the result, never the salary itself or the per-day rate, and pays nothing.
 */
import { computeSalary, isLinePaid, netPayable, payableDays, type PayPeriod } from "@/utils/payrollEngine";
import { salaryFor, type PayTermsBearer } from "@/utils/payTerms";
import type { PayrollConfig, PayrollLine, ResolvedDay } from "@/types/payroll";

export interface MemberPeriodPay {
  /** The amount for the period: the amount paid once Payroll paid it, else salary less what attendance cost. */
  amount: number;
  /** Days the period pays (may end in a half) — of `workingDays`. */
  payableDays: number;
  workingDays: number;
  /** Payroll has paid this period (the payment record is the figure). */
  paid: boolean;
  /** No salary recorded for this member in the period — the amount means nothing, only the days are shown. */
  noSalary: boolean;
  /** The period has not ended: days still to come are counted as worked (as in Payroll). */
  running: boolean;
  /** Days of the period still to come, today included while unresolved — what `running` assumes are worked. */
  daysToCome: number;
}

export function memberPeriodPay(input: {
  member: PayTermsBearer;
  /** The pay month label, `yyyy-MM`. */
  month: string;
  period: PayPeriod;
  days: ResolvedDay[];
  todayStr: string;
  config?: Partial<PayrollConfig>;
  /** The period's payment record for this member, if any (`payroll_lines/{month}_{uid}`). */
  line?: PayrollLine | null;
}): MemberPeriodPay {
  const { member, month, period, days, todayStr, config, line } = input;
  const monthlySalary = salaryFor(member, month);
  const live = computeSalary({ month, monthlySalary, days, todayStr, config, period });
  const paid = isLinePaid(line);
  const frozen = paid && line?.computation ? line.computation : null;
  const c = frozen ?? live;
  return {
    amount: Math.round(paid && line ? line.netSalary : netPayable(live)),
    payableDays: payableDays(c),
    workingDays: c.workingDays,
    paid,
    noSalary: !paid && !(monthlySalary > 0),
    running: todayStr <= period.end,
    daysToCome: live.pendingDays,
  };
}
