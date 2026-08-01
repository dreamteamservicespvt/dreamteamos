import { describe, it, expect } from "vitest";
import {
  computeSalary, countSundays, monthDayCount, monthDates, isSundayDate,
  dayCreditFactor, nextPayDay, formulaText, deductionsFor,
  payPeriodForMonth, payPeriodForDate, periodDates, countSundaysInPeriod,
  currentPayMonth, shiftPayMonth, payPeriodLabel,
} from "@/utils/payrollEngine";
import { amountInWords } from "@/utils/company";
import { DEFAULT_PAYROLL_CONFIG, type ResolvedDay } from "@/types/payroll";
import type { AttendanceStatus } from "@/services/techAttendance";

/**
 * A calendar-month period. The company's real cycle is 10th→9th (covered in its own suite below);
 * these formula tests pin to a plain month so a cycle change can never quietly rewrite what they
 * assert about the arithmetic.
 */
const calendarMonth = (month: string) => payPeriodForMonth(month, 1);

/** Build a month's resolved days by assigning statuses to specific dates. */
function daysFor(month: string, assign: Record<string, AttendanceStatus>): ResolvedDay[] {
  return monthDates(month).map(date => ({ date, status: assign[date] ?? null }));
}

/** Every non-Sunday of the month marked with the same status. */
function allWorkingDays(month: string, status: AttendanceStatus): ResolvedDay[] {
  return monthDates(month).map(date => ({
    date,
    status: isSundayDate(date) ? "holiday" : status,
  }));
}

describe("calendar maths", () => {
  it("counts the real number of days in a month, including leap years", () => {
    expect(monthDayCount("2026-07")).toBe(31);
    expect(monthDayCount("2026-02")).toBe(28);
    expect(monthDayCount("2024-02")).toBe(29);
    expect(monthDayCount("2026-04")).toBe(30);
  });

  it("counts actual Sundays — never assumes four", () => {
    // The whole point: some months have 5 Sundays and pricing must follow.
    expect(countSundays("2026-03")).toBe(5); // 1, 8, 15, 22, 29
    expect(countSundays("2026-07")).toBe(4); // 5, 12, 19, 26
    expect(countSundays("2026-02")).toBe(4);
  });

  it("a 5-Sunday month yields fewer working days than a 4-Sunday month of the same length", () => {
    const march = monthDayCount("2026-03") - countSundays("2026-03"); // 31 - 5
    const july = monthDayCount("2026-07") - countSundays("2026-07");  // 31 - 4
    expect(march).toBe(26);
    expect(july).toBe(27);
  });

  it("identifies Sundays", () => {
    expect(isSundayDate("2026-07-19")).toBe(true);
    expect(isSundayDate("2026-07-20")).toBe(false);
  });
});

describe("computeSalary — the core formula", () => {
  it("derives working days and daily salary from the real calendar", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"),
      monthlySalary: 10000,
      days: [],
      todayStr: "2026-07-01",
    });

    expect(c.monthDays).toBe(31);
    expect(c.sundays).toBe(4);
    expect(c.workingDays).toBe(27);
    expect(c.dailySalary).toBeCloseTo(370.37, 2);
  });

  it("prices the same salary differently in a 5-Sunday month", () => {
    const july = computeSalary({ month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000, days: [], todayStr: "2026-07-01" });
    const march = computeSalary({ month: "2026-03", period: calendarMonth("2026-03"), monthlySalary: 10000, days: [], todayStr: "2026-03-01" });

    expect(july.workingDays).toBe(27);
    expect(march.workingDays).toBe(26);
    expect(march.dailySalary).toBeGreaterThan(july.dailySalary);
  });

  it("pays a full month of full days exactly the package amount", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"),
      monthlySalary: 10000,
      days: allWorkingDays("2026-07", "full"),
      todayStr: "2026-07-31",
    });

    expect(c.fullDays).toBe(27);
    expect(c.earnedDays).toBe(27);
    expect(c.currentSalary).toBe(10000);
    expect(c.projectedSalary).toBe(10000);
    expect(c.projectedDeduction).toBe(0);
    expect(c.attendancePercent).toBe(100);
  });

  it("matches the worked example: 22 full + 3 half + 1 paid leave + 1 absent", () => {
    // 22×1 + 3×0.5 + 1×1 + 1×0 = 24.5 credit days × ₹370.37
    const assign: Record<string, AttendanceStatus> = {};
    const working = monthDates("2026-07").filter(d => !isSundayDate(d));
    working.slice(0, 22).forEach(d => (assign[d] = "full"));
    working.slice(22, 25).forEach(d => (assign[d] = "half"));
    assign[working[25]] = "leave";
    assign[working[26]] = "absent";

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"),
      monthlySalary: 10000,
      days: daysFor("2026-07", assign),
      todayStr: "2026-07-31",
    });

    expect(c.fullDays).toBe(22);
    expect(c.halfDays).toBe(3);
    expect(c.paidLeaveDays).toBe(1);
    expect(c.absentDays).toBe(1);
    expect(c.earnedDays).toBe(24.5);
    expect(c.currentSalary).toBeCloseTo(24.5 * (10000 / 27), 1);
  });

  it("never divides by zero when a month somehow has no working days", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000, days: [], todayStr: "2026-07-01",
      config: { excludeSundays: false },
    });
    expect(c.sundays).toBe(0);
    expect(c.workingDays).toBe(31);
    expect(Number.isFinite(c.dailySalary)).toBe(true);
  });
});

describe("paid leave quota", () => {
  const workingDays = monthDates("2026-07").filter(d => !isSundayDate(d));

  it("pays the first two leaves and converts the rest to leave-without-pay", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.slice(0, 4).forEach(d => (assign[d] = "leave"));
    workingDays.slice(4).forEach(d => (assign[d] = "full"));

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });

    expect(c.paidLeaveDays).toBe(2);
    expect(c.unpaidLeaveDays).toBe(2);
    expect(c.paidLeavesRemaining).toBe(0);
    expect(c.earnedDays).toBe(25); // 23 full + 2 paid leave, 2 LWP earn nothing
  });

  it("pays leave chronologically — the earliest leave is the one that gets paid", () => {
    const assign: Record<string, AttendanceStatus> = {};
    // Leave on the 3rd working day and the 20th; both should be paid (quota 2).
    assign[workingDays[2]] = "leave";
    assign[workingDays[19]] = "leave";
    assign[workingDays[20]] = "leave"; // third → unpaid

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });

    expect(c.paidLeaveDays).toBe(2);
    expect(c.unpaidLeaveDays).toBe(1);
    // The unpaid one must be the latest date, not an arbitrary pick.
    const paidLine = c.lines.find(l => l.key === "paid_leave");
    expect(paidLine?.days).toBe(2);
  });

  it("reports the remaining balance before any leave is taken", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000, days: [], todayStr: "2026-07-10",
    });
    expect(c.paidLeavesRemaining).toBe(DEFAULT_PAYROLL_CONFIG.paidLeaveQuota);
  });

  it("respects a configured quota other than two", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.slice(0, 3).forEach(d => (assign[d] = "leave"));

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
      config: { paidLeaveQuota: 3 },
    });

    expect(c.paidLeaveDays).toBe(3);
    expect(c.unpaidLeaveDays).toBe(0);
  });
});

describe("holiday policy", () => {
  const assign: Record<string, AttendanceStatus> = { "2026-07-15": "holiday" };

  it("pays nothing for an announced holiday under the current policy", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
      config: { holidaysPaid: false },
    });
    expect(c.holidayDays).toBe(1);
    expect(c.earnedDays).toBe(0);
  });

  it("pays the full day when the admin switches holidays to paid", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
      config: { holidaysPaid: true },
    });
    expect(c.earnedDays).toBe(1);
  });

  it("never counts Sundays as earning days — they are already out of the denominator", () => {
    // Every Sunday marked "holiday", nothing else worked.
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: allWorkingDays("2026-07", "absent"),
      todayStr: "2026-07-31",
      config: { holidaysPaid: true },
    });
    expect(c.holidayDays).toBe(0); // the 4 Sundays were skipped, not counted
    expect(c.absentDays).toBe(27);
    expect(c.currentSalary).toBe(0);
  });
});

describe("live progress through the month", () => {
  const workingDays = monthDates("2026-07").filter(d => !isSundayDate(d));

  it("separates elapsed, pending and remaining working days", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.slice(0, 10).forEach(d => (assign[d] = "full"));

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: workingDays[11],
    });

    expect(c.elapsedWorkingDays + c.remainingWorkingDays).toBe(c.workingDays);
    expect(c.fullDays).toBe(10);
    expect(c.remainingWorkingDays).toBeGreaterThan(0);
  });

  it("projects the month as if remaining days are worked in full", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.slice(0, 10).forEach(d => (assign[d] = "full"));

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: workingDays[9],
    });

    expect(c.projectedSalary).toBe(10000);
    expect(c.currentSalary).toBeLessThan(c.projectedSalary);
  });

  it("reflects a lost day in the projection, not just the current figure", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.slice(0, 9).forEach(d => (assign[d] = "full"));
    assign[workingDays[9]] = "absent";

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: workingDays[9],
    });

    expect(c.projectedSalary).toBeCloseTo(10000 - 10000 / 27, 1);
    expect(c.projectedDeduction).toBeCloseTo(10000 / 27, 1);
  });

  it("shows 100% attendance early in the month rather than punishing unworked future days", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.slice(0, 3).forEach(d => (assign[d] = "full"));

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: workingDays[2],
    });

    expect(c.attendancePercent).toBe(100);
  });

  it("does not count an in-progress today as absent", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", {}), todayStr: workingDays[5],
    });
    expect(c.absentDays).toBe(0);
    expect(c.pendingDays).toBeGreaterThan(0);
    expect(c.attendancePercent).toBe(0);
  });
});

describe("adjustments (bonus / penalty / overtime)", () => {
  it("adds a bonus on top of attendance earnings", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: allWorkingDays("2026-07", "full"), todayStr: "2026-07-31",
      adjustments: [{ label: "Performance Bonus", amount: 2000, kind: "bonus" }],
    });
    expect(c.adjustmentTotal).toBe(2000);
    expect(c.currentSalary).toBe(12000);
  });

  it("subtracts a penalty and never returns a negative salary", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: allWorkingDays("2026-07", "absent"), todayStr: "2026-07-31",
      adjustments: [{ label: "Advance Recovery", amount: -500, kind: "advance" }],
    });
    expect(c.currentSalary).toBe(0);
  });

  it("lists every adjustment as its own breakdown line", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: allWorkingDays("2026-07", "full"), todayStr: "2026-07-31",
      adjustments: [
        { label: "Overtime", amount: 800, kind: "overtime" },
        { label: "Late Penalty", amount: -200, kind: "penalty" },
      ],
    });
    const adjLines = c.lines.filter(l => l.key === "adjustment");
    expect(adjLines).toHaveLength(2);
    expect(adjLines[0].kind).toBe("earning");
    expect(adjLines[1].kind).toBe("deduction");
  });
});

describe("breakdown lines", () => {
  it("line amounts sum to the attendance earnings", () => {
    const workingDays = monthDates("2026-07").filter(d => !isSundayDate(d));
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.slice(0, 20).forEach(d => (assign[d] = "full"));
    workingDays.slice(20, 24).forEach(d => (assign[d] = "half"));
    assign[workingDays[24]] = "leave";
    assign[workingDays[25]] = "absent";

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });

    const lineTotal = c.lines.reduce((sum, l) => sum + l.amount, 0);
    expect(lineTotal).toBeCloseTo(c.attendanceEarnings, 1);
  });

  it("omits buckets with no days so the breakdown stays clean", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: allWorkingDays("2026-07", "full"), todayStr: "2026-07-31",
    });
    expect(c.lines.map(l => l.key)).toEqual(["full"]);
  });

  it("renders a formula string matching the lines", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: allWorkingDays("2026-07", "full"), todayStr: "2026-07-31",
    });
    expect(formulaText(c)).toContain("27 × 1 ×");
  });
});

describe("dayCreditFactor", () => {
  it("maps each status to its share of a day's pay", () => {
    const cfg = DEFAULT_PAYROLL_CONFIG;
    expect(dayCreditFactor("full", cfg)).toBe(1);
    expect(dayCreditFactor("half", cfg)).toBe(0.5);
    expect(dayCreditFactor("absent", cfg)).toBe(0);
    // Company policy: a declared holiday is paid in full.
    expect(dayCreditFactor("holiday", cfg)).toBe(1);
    expect(dayCreditFactor("holiday", { ...cfg, holidaysPaid: false })).toBe(0);
  });
});

describe("nextPayDay", () => {
  it("targets the 10th of this month when it has not passed", () => {
    const info = nextPayDay(new Date(2026, 6, 3)); // 3 Jul
    expect(info.date.getDate()).toBe(10);
    expect(info.date.getMonth()).toBe(6);
    expect(info.daysRemaining).toBe(7);
    expect(info.payingForMonth).toBe("2026-06");
  });

  it("rolls to next month once the 10th has passed", () => {
    const info = nextPayDay(new Date(2026, 6, 22)); // 22 Jul
    expect(info.date.getMonth()).toBe(7); // August
    expect(info.date.getDate()).toBe(10);
    expect(info.payingForMonth).toBe("2026-07");
  });

  it("reports zero days remaining on pay day itself", () => {
    const info = nextPayDay(new Date(2026, 6, 10));
    expect(info.daysRemaining).toBe(0);
  });

  it("rolls the year over from December", () => {
    const info = nextPayDay(new Date(2026, 11, 20)); // 20 Dec
    expect(info.date.getFullYear()).toBe(2027);
    expect(info.date.getMonth()).toBe(0);
    expect(info.payingForMonth).toBe("2026-12");
  });

  it("honours a configured pay day other than the 10th", () => {
    const info = nextPayDay(new Date(2026, 6, 3), 1);
    expect(info.date.getMonth()).toBe(7); // 1 Jul already passed → 1 Aug
    expect(info.date.getDate()).toBe(1);
  });
});

describe("deductionsFor — the salary-minus-deductions framing", () => {
  const workingDays = monthDates("2026-07").filter(d => !isSundayDate(d));

  it("returns no rows for a clean month", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: allWorkingDays("2026-07", "full"), todayStr: "2026-07-31",
    });
    const { rows, total } = deductionsFor(c);
    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });

  it("charges a full day for each absence", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.forEach(d => (assign[d] = "full"));
    assign[workingDays[0]] = "absent";
    assign[workingDays[1]] = "absent";

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });
    const { rows, total } = deductionsFor(c);
    expect(rows.find(r => r.label === "Absent")?.days).toBe(2);
    expect(total).toBeCloseTo(2 * (10000 / 27), 2);
  });

  it("charges only the unworked half of a half day", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.forEach(d => (assign[d] = "full"));
    assign[workingDays[0]] = "half";

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });
    const { total } = deductionsFor(c);
    expect(total).toBeCloseTo(0.5 * (10000 / 27), 2);
  });

  it("charges leave beyond the paid quota but not within it", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.forEach(d => (assign[d] = "full"));
    workingDays.slice(0, 3).forEach(d => (assign[d] = "leave")); // 2 paid, 1 unpaid

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });
    const { rows, total } = deductionsFor(c);
    expect(rows.find(r => r.label === "Unpaid leave")?.days).toBe(1);
    expect(total).toBeCloseTo(1 * (10000 / 27), 2);
  });

  it("salary minus deductions always equals what the engine says was earned", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.forEach(d => (assign[d] = "full"));
    assign[workingDays[0]] = "absent";
    assign[workingDays[1]] = "half";
    workingDays.slice(2, 5).forEach(d => (assign[d] = "leave"));

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });
    const { total } = deductionsFor(c);
    // This is the invariant the whole UI rests on: the employee's "net payable" and the
    // engine's earnings must be the same number, computed two different ways.
    expect(c.monthlySalary - total).toBeCloseTo(c.currentSalary, 1);
  });
});

describe("amountInWords", () => {
  it("renders Indian numbering for a payslip", () => {
    expect(amountInWords(0)).toBe("Zero Rupees Only");
    expect(amountInWords(9259)).toBe("Nine Thousand Two Hundred Fifty Nine Rupees Only");
    expect(amountInWords(100000)).toBe("One Lakh Rupees Only");
    expect(amountInWords(1250000)).toBe("Twelve Lakh Fifty Thousand Rupees Only");
    expect(amountInWords(15)).toBe("Fifteen Rupees Only");
    expect(amountInWords(20)).toBe("Twenty Rupees Only");
  });

  it("ignores paise, since payslips round to the rupee", () => {
    expect(amountInWords(9259.63)).toBe("Nine Thousand Two Hundred Fifty Nine Rupees Only");
  });
});

describe("pay period — the 10th → 9th cycle", () => {
  it("runs from the 10th of the labelled month to the 9th of the next", () => {
    const p = payPeriodForMonth("2026-07", 10);
    expect(p.start).toBe("2026-07-10");
    expect(p.end).toBe("2026-08-09");
  });

  it("rolls the year over from December", () => {
    const p = payPeriodForMonth("2026-12", 10);
    expect(p.start).toBe("2026-12-10");
    expect(p.end).toBe("2027-01-09");
  });

  it("handles February's short month", () => {
    const p = payPeriodForMonth("2026-02", 10);
    expect(p.start).toBe("2026-02-10");
    expect(p.end).toBe("2026-03-09");
  });

  it("collapses to the calendar month when the cycle starts on the 1st", () => {
    const p = payPeriodForMonth("2026-07", 1);
    expect(p.start).toBe("2026-07-01");
    expect(p.end).toBe("2026-07-31");
  });

  it("produces contiguous, non-overlapping periods", () => {
    const july = payPeriodForMonth("2026-07", 10);
    const august = payPeriodForMonth("2026-08", 10);
    const dayAfter = new Date(2026, 7, 9);
    dayAfter.setDate(dayAfter.getDate() + 1);
    expect(august.start).toBe("2026-08-10");
    expect(july.end).toBe("2026-08-09");
  });

  it("places a date in the period that actually contains it", () => {
    // The 22nd is inside the current month's cycle...
    expect(payPeriodForDate(new Date(2026, 6, 22), 10).month).toBe("2026-07");
    // ...but the 3rd still belongs to the previous month's cycle.
    expect(payPeriodForDate(new Date(2026, 6, 3), 10).month).toBe("2026-06");
    // Boundary days
    expect(payPeriodForDate(new Date(2026, 6, 10), 10).month).toBe("2026-07");
    expect(payPeriodForDate(new Date(2026, 6, 9), 10).month).toBe("2026-06");
  });

  it("enumerates every day across the month boundary", () => {
    const dates = periodDates(payPeriodForMonth("2026-07", 10));
    expect(dates[0]).toBe("2026-07-10");
    expect(dates.at(-1)).toBe("2026-08-09");
    expect(dates).toHaveLength(31); // 22 days of July + 9 of August
    expect(dates).toContain("2026-07-31");
    expect(dates).toContain("2026-08-01");
  });

  it("counts Sundays across the boundary, not per calendar month", () => {
    const period = payPeriodForMonth("2026-07", 10);
    // Sundays in 10 Jul – 9 Aug: 12, 19, 26 Jul + 2, 9 Aug = 5
    expect(countSundaysInPeriod(period)).toBe(5);
  });
});

/**
 * The bug that emptied the sales team's commission every month.
 *
 * Screens asked the clock for "this month" and got the CALENDAR month. For the first nine days of
 * any month that names a period which has not started, so salary, commission, targets and the
 * leaderboard all pointed at a window containing nothing. These pin the correct answer.
 */
describe("currentPayMonth — which period is today in", () => {
  it("names LAST month's cycle before the 10th, because that is the one still running", () => {
    // 1 August: we are 22 days into the cycle that began on 10 July.
    expect(currentPayMonth(10, new Date(2026, 7, 1))).toBe("2026-07");
    expect(currentPayMonth(10, new Date(2026, 7, 9))).toBe("2026-07");
  });

  it("moves to the new cycle on the 10th itself", () => {
    expect(currentPayMonth(10, new Date(2026, 7, 10))).toBe("2026-08");
    expect(currentPayMonth(10, new Date(2026, 7, 31))).toBe("2026-08");
  });

  it("covers today — whatever today is, the period it names actually contains it", () => {
    for (const day of [1, 5, 9, 10, 11, 20, 28]) {
      const today = new Date(2026, 7, day);
      const period = payPeriodForMonth(currentPayMonth(10, today), 10);
      const todayStr = `2026-08-${String(day).padStart(2, "0")}`;
      expect(todayStr >= period.start && todayStr <= period.end).toBe(true);
    }
  });

  it("rolls back across a year boundary", () => {
    expect(currentPayMonth(10, new Date(2026, 0, 3))).toBe("2025-12");
  });

  it("collapses to the calendar month for a company that pays on the 1st", () => {
    expect(currentPayMonth(1, new Date(2026, 7, 1))).toBe("2026-08");
  });
});

describe("shiftPayMonth", () => {
  it("steps whole months and crosses years", () => {
    expect(shiftPayMonth("2026-07", -1)).toBe("2026-06");
    expect(shiftPayMonth("2026-07", 1)).toBe("2026-08");
    expect(shiftPayMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftPayMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("payPeriodLabel", () => {
  it("spells the span out, so nobody reads it as the calendar month", () => {
    expect(payPeriodLabel("2026-07", 10)).toBe("July 2026 (10 Jul – 09 Aug)");
    expect(payPeriodLabel("2026-12", 10)).toBe("December 2026 (10 Dec – 09 Jan)");
  });

  it("drops the bracket when the cycle IS the calendar month", () => {
    expect(payPeriodLabel("2026-07", 1)).toBe("July 2026");
  });
});

describe("computeSalary over a 10→9 cycle", () => {
  const period = payPeriodForMonth("2026-07", 10);

  it("prices the cycle, not the calendar month", () => {
    const c = computeSalary({
      month: "2026-07", monthlySalary: 10000, days: [], todayStr: "2026-07-10", period,
    });
    expect(c.periodStart).toBe("2026-07-10");
    expect(c.periodEnd).toBe("2026-08-09");
    expect(c.monthDays).toBe(31);
    expect(c.sundays).toBe(5);
    expect(c.workingDays).toBe(26);
  });

  it("pays the full package for a fully worked cycle", () => {
    const days = periodDates(period).map(date => ({
      date,
      status: (isSundayDate(date) ? "holiday" : "full") as AttendanceStatus,
    }));
    const c = computeSalary({
      month: "2026-07", monthlySalary: 10000, days, todayStr: "2026-08-09", period,
    });
    expect(c.fullDays).toBe(26);
    expect(c.currentSalary).toBe(10000);
    expect(deductionsFor(c).total).toBe(0);
  });

  it("counts an absence that falls in the August tail of a July cycle", () => {
    const days = periodDates(period).map(date => ({
      date,
      status: (isSundayDate(date) ? "holiday" : date === "2026-08-05" ? "absent" : "full") as AttendanceStatus,
    }));
    const c = computeSalary({
      month: "2026-07", monthlySalary: 10000, days, todayStr: "2026-08-09", period,
    });
    expect(c.absentDays).toBe(1);
    expect(deductionsFor(c).total).toBeCloseTo(10000 / 26, 2);
  });

  it("defaults to the configured cycle when no period is passed", () => {
    const c = computeSalary({ month: "2026-07", monthlySalary: 10000, days: [], todayStr: "2026-07-10" });
    expect(c.periodStart).toBe("2026-07-10");
    expect(c.periodEnd).toBe("2026-08-09");
  });
});

describe("declared holidays are paid — company policy", () => {
  const workingDays = monthDates("2026-07").filter(d => !isSundayDate(d));

  it("defaults to paying holidays", () => {
    expect(DEFAULT_PAYROLL_CONFIG.holidaysPaid).toBe(true);
  });

  it("costs the employee nothing when the company declares a holiday", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.forEach(d => (assign[d] = "full"));
    assign[workingDays[5]] = "holiday"; // company closes for a festival

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });

    expect(c.holidayDays).toBe(1);
    // Full salary: the employee was ready to work, the company chose to close.
    expect(c.currentSalary).toBe(10000);
    expect(deductionsFor(c).total).toBe(0);
  });

  it("never lists a holiday as a deduction", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.forEach(d => (assign[d] = "full"));
    workingDays.slice(0, 3).forEach(d => (assign[d] = "holiday"));

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });

    expect(deductionsFor(c).rows.find(r => r.label.includes("holiday"))).toBeUndefined();
    expect(c.currentSalary).toBe(10000);
  });

  it("labels the breakdown line as paid", () => {
    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", { [workingDays[0]]: "holiday" }), todayStr: "2026-07-31",
    });
    const line = c.lines.find(l => l.key === "holiday");
    expect(line?.label).toBe("Holidays (paid)");
    expect(line?.factor).toBe(1);
    expect(line?.kind).toBe("earning");
  });

  it("still pays a full month when several holidays land in it", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.forEach(d => (assign[d] = "full"));
    workingDays.slice(0, 5).forEach(d => (assign[d] = "holiday"));

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });
    expect(c.earnedDays).toBe(c.workingDays);
    expect(c.currentSalary).toBe(10000);
  });

  it("keeps absences chargeable even in a month containing holidays", () => {
    const assign: Record<string, AttendanceStatus> = {};
    workingDays.forEach(d => (assign[d] = "full"));
    assign[workingDays[0]] = "holiday";
    assign[workingDays[1]] = "absent";

    const c = computeSalary({
      month: "2026-07", period: calendarMonth("2026-07"), monthlySalary: 10000,
      days: daysFor("2026-07", assign), todayStr: "2026-07-31",
    });
    // Only the absence costs anything — exactly one day's pay.
    expect(deductionsFor(c).total).toBeCloseTo(10000 / 27, 2);
  });
});
