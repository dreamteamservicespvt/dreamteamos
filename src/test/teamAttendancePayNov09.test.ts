/**
 * 2026-11-09 — Team Attendance: the salary line under each tech member (owner: "show salary count to the tech lead,
 * based on the attendance of the tech team members") and 🎉 for a holiday instead of the Sunday "—".
 */
import { describe, expect, it } from "vitest";
import {
  computeSalary, deductionsFor, netPayable, payPeriodForMonth, payableDays, periodDates,
} from "@/utils/payrollEngine";
import { memberPeriodPay } from "@/utils/teamAttendancePay";
import { dayLabel, dayMark, HOLIDAY_MARK, isSunday } from "@/services/techAttendance";
import type { AttendanceStatus } from "@/services/techAttendance";
import type { PayrollLine } from "@/types/payroll";

const MONTH = "2026-07";
const period = payPeriodForMonth(MONTH, 10); // 10 Jul → 9 Aug
const dates = periodDates(period);
const AFTER = "2026-08-20"; // the period has ended

/** Every working day Full, Sundays holiday, with the given exceptions. */
function days(exceptions: Record<string, AttendanceStatus> = {}) {
  return dates.map((date) => ({ date, status: (exceptions[date] ?? (isSunday(date) ? "holiday" : "full")) as AttendanceStatus }));
}
const workingDays = dates.filter((d) => !isSunday(d)).length;
const firstWorking = dates.filter((d) => !isSunday(d));

describe("payableDays", () => {
  it("a full period pays every working day", () => {
    const c = computeSalary({ month: MONTH, monthlySalary: 26000, days: days(), todayStr: AFTER, period });
    expect(payableDays(c)).toBe(workingDays);
  });

  it("one absence and one half day cost 1½ days, and days × rate is netPayable", () => {
    const c = computeSalary({
      month: MONTH, monthlySalary: 26000, todayStr: AFTER, period,
      days: days({ [firstWorking[0]]: "absent", [firstWorking[1]]: "half" }),
    });
    expect(payableDays(c)).toBe(workingDays - 1.5);
    expect(Math.round(payableDays(c) * c.dailySalary)).toBe(Math.round(netPayable(c)));
  });

  it("does not depend on the salary (no salary set)", () => {
    const c = computeSalary({ month: MONTH, monthlySalary: 0, days: days({ [firstWorking[0]]: "absent" }), todayStr: AFTER, period });
    expect(payableDays(c)).toBe(workingDays - 1);
  });

  it("each deduction row carries the weight its amount uses", () => {
    const c = computeSalary({
      month: MONTH, monthlySalary: 26000, todayStr: AFTER, period,
      days: days({ [firstWorking[0]]: "absent", [firstWorking[1]]: "half" }),
    });
    for (const r of deductionsFor(c).rows) expect(r.amount).toBeCloseTo(r.days * r.weight * c.dailySalary, 6);
  });
});

describe("memberPeriodPay", () => {
  it("an ended period: Payroll's amount and days, Due", () => {
    const d = days({ [firstWorking[0]]: "absent" });
    const pay = memberPeriodPay({ member: { salary: 26000 }, month: MONTH, period, days: d, todayStr: AFTER });
    const c = computeSalary({ month: MONTH, monthlySalary: 26000, days: d, todayStr: AFTER, period });
    expect(pay).toMatchObject({
      amount: Math.round(netPayable(c)), payableDays: workingDays - 1, workingDays, paid: false, noSalary: false, running: false,
    });
  });

  it("the salary of THAT period (payHistory), not today's", () => {
    const member = {
      salary: 40000,
      payHistory: [{ from: "2026-09", salary: 40000, previous: { salary: 26000 }, at: 1, byUid: "a", byName: "A" }],
    } as never;
    const pay = memberPeriodPay({ member, month: MONTH, period, days: days(), todayStr: AFTER });
    expect(pay.amount).toBe(26000);
  });

  it("a paid period shows the amount paid, whatever attendance says now", () => {
    const line = { paymentStatus: "completed", netSalary: 25000, computation: undefined } as unknown as PayrollLine;
    const pay = memberPeriodPay({
      member: { salary: 26000 }, month: MONTH, period, days: days({ [firstWorking[0]]: "absent" }), todayStr: AFTER, line,
    });
    expect(pay.paid).toBe(true);
    expect(pay.amount).toBe(25000);
  });

  it("an unpaid line (pending) is not paid", () => {
    const line = { paymentStatus: "pending", netSalary: 1 } as unknown as PayrollLine;
    const pay = memberPeriodPay({ member: { salary: 26000 }, month: MONTH, period, days: days(), todayStr: AFTER, line });
    expect(pay.paid).toBe(false);
    expect(pay.amount).toBe(26000);
  });

  it("no salary set → noSalary, the days still counted", () => {
    const pay = memberPeriodPay({ member: {}, month: MONTH, period, days: days(), todayStr: AFTER });
    expect(pay.noSalary).toBe(true);
    expect(pay.payableDays).toBe(workingDays);
  });

  it("a running period counts the days to come as worked and says how many", () => {
    const today = firstWorking[5];
    const d = dates.map((date) => ({
      date,
      status: (isSunday(date) ? "holiday" : date < today ? "full" : null) as AttendanceStatus | null,
    }));
    const pay = memberPeriodPay({ member: { salary: 26000 }, month: MONTH, period, days: d, todayStr: today });
    expect(pay.running).toBe(true);
    expect(pay.daysToCome).toBe(workingDays - 5);
    expect(pay.amount).toBe(26000);
    expect(pay.payableDays).toBe(workingDays);
  });
});

describe("dayMark / dayLabel — Sunday vs holiday", () => {
  const sunday = dates.find((d) => isSunday(d))!;
  const weekday = firstWorking[0];

  it("a plain Sunday keeps — and says Sunday", () => {
    expect(dayMark("holiday", sunday, false)).toBe("—");
    expect(dayLabel("holiday", sunday, false)).toBe("Sunday");
  });

  it("an announced holiday shows 🎉 and says Holiday (on a Sunday too)", () => {
    expect(dayMark("holiday", weekday, true)).toBe(HOLIDAY_MARK);
    expect(dayMark("holiday", sunday, true)).toBe(HOLIDAY_MARK);
    expect(dayLabel("holiday", weekday, true)).toBe("Holiday");
  });

  it("a weekday hand-marked holiday shows 🎉", () => {
    expect(dayMark("holiday", weekday, false)).toBe(HOLIDAY_MARK);
  });

  it("other marks are unchanged", () => {
    expect(dayMark("full", weekday, true)).toBe("P");
    expect(dayMark("holiday_work", sunday, false)).toBe("W");
    expect(dayLabel("absent", weekday, false)).toBe("Absent");
  });
});
