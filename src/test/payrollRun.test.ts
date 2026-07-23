import { describe, it, expect } from "vitest";
import { lineId, runId, resolveMemberDays, computeMemberSalary } from "@/services/payrollRun";
import { DEFAULT_PAYROLL_CONFIG } from "@/types/payroll";
import type { MonthAttendance } from "@/services/payrollRun";
import { attendanceKey } from "@/services/techAttendance";

const emptyAttendance = (): MonthAttendance => ({
  overrides: new Map(),
  holidays: new Set(),
  checkedIn: new Set(),
});

describe("document ids", () => {
  it("keys a run by its month so a month can only have one run", () => {
    expect(runId("2026-07")).toBe("2026-07");
  });

  it("keys a line by month and member so regeneration overwrites rather than duplicates", () => {
    expect(lineId("2026-07", "abc123")).toBe("2026-07_abc123");
  });
});

describe("resolveMemberDays", () => {
  it("covers the 10th→9th pay period, not the calendar month", () => {
    const days = resolveMemberDays("m1", "2026-07", emptyAttendance(), "2026-08-09");
    expect(days[0].date).toBe("2026-07-10");
    expect(days.at(-1)?.date).toBe("2026-08-09");
    expect(days).toHaveLength(31);
  });

  it("marks Sundays as holidays regardless of check-in data", () => {
    const days = resolveMemberDays("m1", "2026-07", emptyAttendance(), "2026-08-09");
    expect(days.find(d => d.date === "2026-07-19")?.status).toBe("holiday"); // a Sunday
  });

  it("derives Full Day from a check-in record", () => {
    const attendance = emptyAttendance();
    attendance.checkedIn.add(attendanceKey("m1", "2026-07-15"));
    const days = resolveMemberDays("m1", "2026-07", attendance, "2026-08-09");
    expect(days.find(d => d.date === "2026-07-15")?.status).toBe("full");
  });

  it("lets a manual override beat a check-in", () => {
    const attendance = emptyAttendance();
    attendance.checkedIn.add(attendanceKey("m1", "2026-07-15"));
    attendance.overrides.set(attendanceKey("m1", "2026-07-15"), "half");
    const days = resolveMemberDays("m1", "2026-07", attendance, "2026-08-09");
    expect(days.find(d => d.date === "2026-07-15")?.status).toBe("half");
  });

  it("keeps each member's attendance separate", () => {
    const attendance = emptyAttendance();
    attendance.checkedIn.add(attendanceKey("m1", "2026-07-15"));
    expect(resolveMemberDays("m2", "2026-07", attendance, "2026-08-09")
      .find(d => d.date === "2026-07-15")?.status).toBe("absent");
  });
});

describe("computeMemberSalary", () => {
  const member = { uid: "m1", salary: 10000 };

  it("evaluates a closed period at its own end, never leaving remaining days", () => {
    // The June cycle is 10 Jun – 9 Jul, so by 22 Jul it is fully closed.
    const c = computeMemberSalary(member, "2026-06", emptyAttendance(), DEFAULT_PAYROLL_CONFIG, "2026-07-22");
    expect(c.remainingWorkingDays).toBe(0);
    expect(c.month).toBe("2026-06");
    expect(c.periodStart).toBe("2026-06-10");
    expect(c.periodEnd).toBe("2026-07-09");
  });

  it("pays nothing when nobody checked in all period", () => {
    const c = computeMemberSalary(member, "2026-06", emptyAttendance(), DEFAULT_PAYROLL_CONFIG, "2026-07-22");
    expect(c.currentSalary).toBe(0);
    expect(c.absentDays).toBe(c.workingDays);
  });

  it("pays the full package when every working day of the cycle is checked in", () => {
    const attendance = emptyAttendance();
    // The June cycle spans 10 Jun – 9 Jul, so check-ins must cover both calendar months.
    const pad = (n: number) => String(n).padStart(2, "0");
    for (let d = 10; d <= 30; d++) attendance.checkedIn.add(attendanceKey("m1", `2026-06-${pad(d)}`));
    for (let d = 1; d <= 9; d++) attendance.checkedIn.add(attendanceKey("m1", `2026-07-${pad(d)}`));

    const c = computeMemberSalary(member, "2026-06", attendance, DEFAULT_PAYROLL_CONFIG, "2026-07-22");
    expect(c.currentSalary).toBe(10000);
  });

  it("only counts attendance inside the cycle — days before the 10th belong to the prior period", () => {
    const attendance = emptyAttendance();
    // Checked in for the first 9 days of June, which fall in MAY's cycle, not June's.
    for (let d = 1; d <= 9; d++) {
      attendance.checkedIn.add(attendanceKey("m1", `2026-06-0${d}`));
    }
    const c = computeMemberSalary(member, "2026-06", attendance, DEFAULT_PAYROLL_CONFIG, "2026-07-22");
    expect(c.fullDays).toBe(0);
    expect(c.currentSalary).toBe(0);
  });

  it("treats a missing salary as zero rather than producing NaN", () => {
    const c = computeMemberSalary({ uid: "m1", salary: undefined as unknown as number }, "2026-06",
      emptyAttendance(), DEFAULT_PAYROLL_CONFIG, "2026-07-22");
    expect(c.currentSalary).toBe(0);
    expect(Number.isFinite(c.dailySalary)).toBe(true);
  });

  it("applies the run's own policy, so a locked month stays explainable", () => {
    const attendance = emptyAttendance();
    attendance.holidays.add("2026-06-15");
    const unpaid = computeMemberSalary(member, "2026-06", attendance,
      { ...DEFAULT_PAYROLL_CONFIG, holidaysPaid: false }, "2026-07-22");
    const paid = computeMemberSalary(member, "2026-06", attendance,
      { ...DEFAULT_PAYROLL_CONFIG, holidaysPaid: true }, "2026-07-22");
    expect(paid.currentSalary).toBeGreaterThan(unpaid.currentSalary);
  });
});
