/**
 * Attendance → Pay Salary, one source of truth (2026-10-09) — the pure rules.
 *
 * The grid, the calendars, Payroll, Sales Payroll, the member's My Salary, the payslip and Accounts'
 * Salary Management each counted for themselves and disagreed. These pin the shared pieces they
 * now all read: the attendance tally, the payable figure, the sales incentive rule, the salary
 * route a notification opens, and the payment history.
 */
import { describe, it, expect } from "vitest";
import {
  computeSalary, deductionsFor, isSundayDate, netPayable, payPeriodForMonth, periodDates, salaryMonthDue, tallyAttendance,
} from "@/utils/payrollEngine";
import { summarize, type AttendanceStatus } from "@/services/techAttendance";
import { salesIncentive, salesInPeriod } from "@/utils/salesPay";
import { getSalaryRoute } from "@/utils/roleHelpers";
import { mergeSalaryPayments } from "@/hooks/useSalaryPayments";
import { approvalMarks } from "@/services/leave";
import { generatePayslipPdf } from "@/utils/payslipPdf";
import { DEFAULT_PAYROLL_CONFIG, type PayrollLine, type ResolvedDay } from "@/types/payroll";
import type { Lead } from "@/types";

const JULY = payPeriodForMonth("2026-07", 10); // 10 Jul → 9 Aug 2026
const julyDays = (assign: Record<string, AttendanceStatus>, fill: AttendanceStatus | null = "full"): ResolvedDay[] =>
  periodDates(JULY).map(date => ({ date, status: assign[date] ?? (isSundayDate(date) ? "holiday" : fill) }));
const closed = (days: ResolvedDay[], config = {}) => computeSalary({
  month: "2026-07", monthlySalary: 26000, days, todayStr: "2026-08-20", period: JULY, config,
});

describe("one tally for the grid and the salary", () => {
  it("counts the same Present / Half / Absent / Leave as the salary, for the same days", () => {
    const days = julyDays({
      "2026-07-13": "absent", "2026-07-14": "half", "2026-07-15": "leave",
      "2026-07-16": "leave", "2026-07-17": "leave", "2026-07-22": "holiday",
    });
    const grid = summarize(days);
    const pay = closed(days);
    expect(grid.full).toBe(pay.fullDays);
    expect(grid.half).toBe(pay.halfDays);
    expect(grid.absent).toBe(pay.absentDays);
    expect(grid.leave).toBe(pay.paidLeaveDays + pay.unpaidLeaveDays);
    expect(grid.leavesLeft).toBe(pay.paidLeavesRemaining);
  });

  it("does not count a Sunday the admin marked Present — on the grid or the payslip", () => {
    const days = julyDays({ "2026-07-12": "full" }); // Sunday 12 Jul, marked by hand
    const grid = summarize(days);
    expect(grid.full).toBe(closed(days).fullDays);
    expect(closed(days).fullDays).toBe(26); // the 26 working days, not 27
  });

  /**
   * The quota pass ran BEFORE the Sunday skip: a Sunday marked Leave took one of the two paid
   * slots, so a real weekday's leave became a deduction.
   */
  it("never lets a Sunday marked Leave use up a paid-leave day", () => {
    const days = julyDays({ "2026-07-12": "leave", "2026-07-13": "leave", "2026-07-14": "leave" });
    const c = closed(days);
    expect(c.paidLeaveDays).toBe(2);
    expect(c.unpaidLeaveDays).toBe(0);
    expect(deductionsFor(c).total).toBe(0);
    expect(netPayable(c)).toBe(26000);
  });

  it("reads the allowance from the policy, not a constant two", () => {
    const days = julyDays({ "2026-07-13": "leave", "2026-07-14": "leave", "2026-07-15": "leave" });
    expect(summarize(days, { paidLeaveQuota: 3 }).leavesLeft).toBe(0);
    expect(tallyAttendance(days, { paidLeaveQuota: 3 }).unpaidLeave).toBe(0);
    expect(tallyAttendance(days).unpaidLeave).toBe(1);
  });

  it("pays leave in date order, whatever order the days arrive in", () => {
    const t = tallyAttendance([
      { date: "2026-07-30", status: "leave" },
      { date: "2026-07-13", status: "leave" },
      { date: "2026-07-20", status: "leave" },
    ]);
    expect([...t.paidLeaveDates]).toEqual(["2026-07-13", "2026-07-20"]);
  });
});

describe("netPayable — the one payable figure", () => {
  it("is salary less what attendance cost, and equals the earnings of a closed period", () => {
    const c = closed(julyDays({ "2026-07-13": "absent", "2026-07-14": "half" }));
    expect(netPayable(c)).toBeCloseTo(c.currentSalary, 1);
    expect(netPayable(c)).toBeCloseTo(26000 - 1.5 * 1000, 6);
  });

  it("follows the half-day factor in the policy", () => {
    const c = closed(julyDays({ "2026-07-14": "half" }), { halfDayFactor: 0.75 });
    expect(netPayable(c)).toBeCloseTo(26000 - 0.25 * 1000, 6);
  });
});

describe("the sales incentive — Sales Payroll and My Salary use one rule", () => {
  const ts = (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 });
  const lead = (id: string, owner: string, items: Record<string, unknown>[]): Lead =>
    ({ id, assignedTo: owner, saleItems: items } as unknown as Lead);

  it("counts verified money collected inside the period, keeps pending apart, ignores other members", () => {
    const leads = [
      lead("l1", "asha", [
        { amount: 10000, verificationStatus: "verified", submittedAt: ts(new Date(2026, 6, 15, 11)) },
        { amount: 4000, verificationStatus: "pending", submittedAt: ts(new Date(2026, 6, 16, 11)) },
        { amount: 9000, verificationStatus: "verified", submittedAt: ts(new Date(2026, 6, 5, 11)) }, // previous cycle
      ]),
      lead("l2", "ravi", [{ amount: 7000, verificationStatus: "verified", submittedAt: ts(new Date(2026, 6, 20, 11)) }]),
    ];
    const s = salesInPeriod(leads, JULY.start, JULY.end, "asha");
    expect(s.salesBase).toBe(10000);
    expect(s.saleCount).toBe(1);
    expect(s.pendingSaleValue).toBe(4000);
  });

  /**
   * Sales Payroll dated a sale by `toISOString()` — the UTC day. A sale at 00:30 IST on the 10th
   * was the 9th, in the previous cycle. The shared rule dates it by the local day.
   */
  it("dates a sale by its local day, so a sale just after midnight on the 10th is in the new cycle", () => {
    const leads = [lead("l1", "asha", [
      { amount: 5000, verificationStatus: "verified", submittedAt: ts(new Date(2026, 6, 10, 0, 30)) },
    ])];
    expect(salesInPeriod(leads, JULY.start, JULY.end).salesBase).toBe(5000);
  });

  it("withholds the incentive below 75% of the cycle's target, and never without a target", () => {
    // Daily target 1000 × 31 days = 31,000; 75% = 23,250.
    const under = salesIncentive({ salesBase: 20000, rate: 5, dailyTarget: 1000, periodStart: JULY.start });
    expect(under.periodTarget).toBe(31000);
    expect(under.commission).toBe(0);
    expect(under.withheld).toBe(true);
    expect(under.shortfall).toBe(3250);

    const over = salesIncentive({ salesBase: 24000, rate: 5, dailyTarget: 1000, periodStart: JULY.start });
    expect(over.commission).toBe(1200);
    expect(over.withheld).toBe(false);

    const none = salesIncentive({ salesBase: 20000, rate: 10, periodStart: JULY.start });
    expect(none.commission).toBe(2000);
    expect(none.withheld).toBe(false);
  });
});

describe("salaryMonthDue — the period a payment made today is for", () => {
  /** A cycle is paid AFTER it ends: Salary Management defaulted to the running cycle, empty on payday. */
  it("is last month's cycle all through this calendar month — before, on and after payday", () => {
    expect(salaryMonthDue(new Date(2026, 9, 5))).toBe("2026-09");   // before payday: Sep cycle about to close
    expect(salaryMonthDue(new Date(2026, 9, 10))).toBe("2026-09");  // payday: the Oct cycle has just begun
    expect(salaryMonthDue(new Date(2026, 9, 25))).toBe("2026-09");  // a late payment
    expect(salaryMonthDue(new Date(2027, 0, 10))).toBe("2026-12");  // across the year
  });
});

describe("where a salary notification takes the member", () => {
  it("opens the member's own salary page — never a tech route for a sales member", () => {
    expect(getSalaryRoute("sales_member")).toBe("/sales/salary");
    expect(getSalaryRoute("tech_member")).toBe("/tech/salary");
    expect(getSalaryRoute("tech_admin")).toBe("/");
    expect(getSalaryRoute(undefined)).toBe("/");
  });
});

describe("payment history — Payroll payments and Accounts receipts together", () => {
  it("lists both, newest first, each saying where it was recorded; unpaid lines are left out", () => {
    const paid = {
      id: "2026-07_asha", month: "2026-07", memberId: "asha", memberName: "Asha", monthlySalary: 26000,
      netSalary: 25000, computation: {} as PayrollLine["computation"], paymentStatus: "completed",
      paidAt: { seconds: 1786700000 }, transactionId: "UTR9",
    } as unknown as PayrollLine;
    const pending = { ...paid, id: "2026-08_asha", month: "2026-08", paymentStatus: "pending", paidAt: undefined } as PayrollLine;
    const list = mergeSalaryPayments(
      [{ id: "r1", userId: "asha", amount: 3000, month: "June 2026 (10 Jun – 09 Jul)", sentBy: "acc", sentAt: { seconds: 1784000000 } }],
      [paid, pending],
    );
    expect(list.map(p => [p.source, p.amount])).toEqual([["payroll", 25000], ["receipt", 3000]]);
    expect(list[0].periodText).toBe("July 2026 (10 Jul – 09 Aug)");
    expect(list[0].note).toBe("Txn UTR9");
  });
});

describe("what a leave approval wrote", () => {
  it("is leave within the allowance and absent beyond it, Sundays never", () => {
    const marks = approvalMarks({ fromDate: "2026-07-17", toDate: "2026-07-20", absentDates: ["2026-07-20"] });
    expect([...marks]).toEqual([["2026-07-17", "leave"], ["2026-07-18", "leave"], ["2026-07-20", "absent"]]);
  });
});

describe("the sales payslip balances with its incentive", () => {
  const textOf = (pdf: { internal: { pages: unknown[] } }) =>
    (pdf.internal.pages as (string[] | undefined)[]).flatMap(p => p ?? []).join("\n")
      .replace(/\\\(/g, "(").replace(/\\\)/g, ")");
  const amountAfter = (text: string, label: string) => {
    const m = new RegExp(`${label}[\\s\\S]{0,200}?Rs\\. ([\\d,]+)`).exec(text);
    if (!m) throw new Error(`"${label}" not found`);
    return Number(m[1].replace(/,/g, ""));
  };

  it("prints the incentive as an earning, so gross − deductions = net pay", async () => {
    const c = closed(julyDays({ "2026-07-13": "absent" }), DEFAULT_PAYROLL_CONFIG);
    const incentive = 1200;
    const pdf = await generatePayslipPdf({
      month: "2026-07", employeeName: "Asha", role: "Sales Executive", computation: c,
      netPayable: netPayable(c) + incentive, extraEarnings: [["Sales Incentive (5%)", incentive]],
    });
    const text = textOf(pdf as unknown as { internal: { pages: unknown[] } });
    expect(text).toContain("Sales Incentive (5%)");
    const gross = amountAfter(text, "Gross Earnings");
    const ded = amountAfter(text, "Total Deductions");
    const net = amountAfter(text, "NET PAY");
    expect(gross).toBe(26000 + incentive);
    expect(gross - ded).toBe(net);
  });
});
