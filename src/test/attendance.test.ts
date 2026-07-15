import { describe, it, expect } from "vitest";
import { resolveStatus, summarize, isSunday, daysInMonth, MONTHLY_LEAVE_QUOTA } from "../services/techAttendance";
import { fillAgreementText } from "../components/agreement/AgreementView";
import { extractTitle } from "../services/agreements";

const today = "2026-07-15"; // Wednesday

describe("techAttendance.resolveStatus", () => {
  it("checked-in weekday = Full, otherwise Absent", () => {
    expect(resolveStatus({ checkedIn: true, dateStr: "2026-07-14", hasFestivalHoliday: false, todayStr: today })).toBe("full");
    expect(resolveStatus({ checkedIn: false, dateStr: "2026-07-14", hasFestivalHoliday: false, todayStr: today })).toBe("absent");
  });
  it("Sundays and festival days are Holiday", () => {
    expect(resolveStatus({ checkedIn: false, dateStr: "2026-07-19", hasFestivalHoliday: false, todayStr: today })).toBe("holiday"); // Sunday
    expect(resolveStatus({ checkedIn: false, dateStr: "2026-07-14", hasFestivalHoliday: true, todayStr: today })).toBe("holiday");
  });
  it("manual override always wins", () => {
    expect(resolveStatus({ override: "half", checkedIn: true, dateStr: "2026-07-19", hasFestivalHoliday: true, todayStr: today })).toBe("half");
    expect(resolveStatus({ override: "leave", checkedIn: false, dateStr: "2026-07-14", hasFestivalHoliday: false, todayStr: today })).toBe("leave");
  });
  it("future days are null (not yet applicable)", () => {
    expect(resolveStatus({ checkedIn: false, dateStr: "2026-07-20", hasFestivalHoliday: false, todayStr: today })).toBeNull();
  });
  it("today with no check-in yet is pending (null), not Absent", () => {
    expect(resolveStatus({ checkedIn: false, dateStr: today, hasFestivalHoliday: false, todayStr: today })).toBeNull();
    expect(resolveStatus({ checkedIn: true, dateStr: today, hasFestivalHoliday: false, todayStr: today })).toBe("full");
  });
});

describe("techAttendance.summarize", () => {
  it("counts statuses, present-days credit and leaves-left", () => {
    const s = summarize(["full", "full", "half", "absent", "leave", "holiday", null]);
    expect(s.full).toBe(2);
    expect(s.half).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.leave).toBe(1);
    expect(s.presentDays).toBe(2.5);
    expect(s.leavesLeft).toBe(MONTHLY_LEAVE_QUOTA - 1);
  });
});

describe("techAttendance helpers", () => {
  it("isSunday detects Sundays", () => {
    expect(isSunday("2026-07-19")).toBe(true);
    expect(isSunday("2026-07-15")).toBe(false);
  });
  it("daysInMonth returns each day", () => {
    expect(daysInMonth("2026-02")).toHaveLength(28);
    expect(daysInMonth("2026-07")[0]).toBe("2026-07-01");
    expect(daysInMonth("2026-07").at(-1)).toBe("2026-07-31");
  });
});

describe("agreement auto-fill", () => {
  it("fills name, mobile and date placeholders", () => {
    const src = "Employee Name: ____________________\nMobile Number: ____________\nDate: ______";
    const out = fillAgreementText(src, { memberName: "Ravi Kumar", memberPhone: "9876543210", signedDate: "2026-07-15" });
    expect(out).toContain("Employee Name: Ravi Kumar");
    expect(out).toContain("Mobile Number: 9876543210");
    expect(out).toContain("Date: 15 Jul 2026");
    expect(out).not.toContain("____");
  });
  it("extractTitle uses the first non-empty line", () => {
    expect(extractTitle("\n\nDREAM TEAM SERVICES\nFULL-TIME AGREEMENT")).toBe("DREAM TEAM SERVICES");
  });
});
