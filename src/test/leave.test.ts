import { describe, it, expect } from "vitest";
import {
  datesBetween, leaveWorkingDates, leaveBalanceFor, periodMonthFor, approvedLeaveDatesIn,
} from "@/services/leave";
import type { LeaveRequest } from "@/types/payroll";

const request = (fields: Partial<LeaveRequest>): LeaveRequest => ({
  id: "r1", memberId: "m1", memberName: "Ravi",
  fromDate: "2026-07-15", toDate: "2026-07-15", month: "2026-07",
  kind: "paid", reason: "", status: "approved", createdAt: null,
  ...fields,
} as LeaveRequest);

describe("datesBetween", () => {
  it("includes both ends of the range", () => {
    expect(datesBetween("2026-07-15", "2026-07-17")).toEqual(["2026-07-15", "2026-07-16", "2026-07-17"]);
  });

  it("handles a single day", () => {
    expect(datesBetween("2026-07-15", "2026-07-15")).toEqual(["2026-07-15"]);
  });

  it("crosses a month boundary", () => {
    expect(datesBetween("2026-07-30", "2026-08-02"))
      .toEqual(["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"]);
  });

  it("returns nothing when the range is inverted", () => {
    expect(datesBetween("2026-07-17", "2026-07-15")).toEqual([]);
  });
});

describe("leaveWorkingDates", () => {
  it("drops Sundays — they are already days off, so leave must not burn quota on them", () => {
    // 19 Jul 2026 is a Sunday.
    expect(leaveWorkingDates("2026-07-17", "2026-07-21"))
      .toEqual(["2026-07-17", "2026-07-18", "2026-07-20", "2026-07-21"]);
  });

  it("returns nothing for a Sunday-only request", () => {
    expect(leaveWorkingDates("2026-07-19", "2026-07-19")).toEqual([]);
  });

  it("counts a full working week as six days", () => {
    expect(leaveWorkingDates("2026-07-13", "2026-07-19")).toHaveLength(6);
  });
});

describe("periodMonthFor — leave belongs to a pay period, not a calendar month", () => {
  it("puts a date on or after the 10th in that month's cycle", () => {
    expect(periodMonthFor("2026-07-15")).toBe("2026-07");
    expect(periodMonthFor("2026-07-10")).toBe("2026-07");
  });

  it("puts a date before the 10th in the previous month's cycle", () => {
    expect(periodMonthFor("2026-07-03")).toBe("2026-06");
    expect(periodMonthFor("2026-07-09")).toBe("2026-06");
  });

  it("rolls back across a year boundary", () => {
    expect(periodMonthFor("2027-01-05")).toBe("2026-12");
  });
});

describe("leaveBalanceFor", () => {
  it("reports the full quota when no leave has been taken", () => {
    const b = leaveBalanceFor([], "2026-07-15", 1);
    expect(b.used).toBe(0);
    expect(b.remaining).toBe(2);
    expect(b.wouldBePaid).toBe(1);
    expect(b.wouldBeUnpaid).toBe(0);
  });

  it("splits a request that exceeds the remaining quota", () => {
    const b = leaveBalanceFor(["2026-07-14"], "2026-07-15", 3);
    expect(b.used).toBe(1);
    expect(b.remaining).toBe(1);
    expect(b.wouldBePaid).toBe(1);
    expect(b.wouldBeUnpaid).toBe(2);
  });

  it("marks everything unpaid once the quota is spent", () => {
    const b = leaveBalanceFor(["2026-07-14", "2026-07-16"], "2026-07-20", 2);
    expect(b.remaining).toBe(0);
    expect(b.wouldBePaid).toBe(0);
    expect(b.wouldBeUnpaid).toBe(2);
  });

  it("ignores leave from a different pay period", () => {
    // 5 Jul falls in the JUNE cycle, so it must not consume July's quota.
    const b = leaveBalanceFor(["2026-07-05"], "2026-07-15", 1);
    expect(b.used).toBe(0);
    expect(b.remaining).toBe(2);
  });

  it("counts leave in the August tail of a July cycle against July", () => {
    const b = leaveBalanceFor(["2026-08-03"], "2026-07-15", 1);
    expect(b.used).toBe(1);
    expect(b.remaining).toBe(1);
  });

  it("respects a configured quota other than two", () => {
    const b = leaveBalanceFor([], "2026-07-15", 5, 3);
    expect(b.remaining).toBe(3);
    expect(b.wouldBePaid).toBe(3);
    expect(b.wouldBeUnpaid).toBe(2);
  });
});

describe("approvedLeaveDatesIn", () => {
  it("counts only approved requests", () => {
    const dates = approvedLeaveDatesIn([
      request({ fromDate: "2026-07-15", toDate: "2026-07-15", status: "approved" }),
      request({ id: "r2", fromDate: "2026-07-16", toDate: "2026-07-16", status: "pending" }),
      request({ id: "r3", fromDate: "2026-07-17", toDate: "2026-07-17", status: "rejected" }),
    ], "2026-07");
    expect(dates).toEqual(["2026-07-15"]);
  });

  it("expands a multi-day request and drops its Sundays", () => {
    const dates = approvedLeaveDatesIn([
      request({ fromDate: "2026-07-17", toDate: "2026-07-20" }),
    ], "2026-07");
    expect(dates).toEqual(["2026-07-17", "2026-07-18", "2026-07-20"]);
  });

  it("excludes leave that falls outside the pay period", () => {
    const dates = approvedLeaveDatesIn([
      request({ fromDate: "2026-07-05", toDate: "2026-07-05" }), // June cycle
    ], "2026-07");
    expect(dates).toEqual([]);
  });
});
