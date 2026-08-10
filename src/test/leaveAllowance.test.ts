import { describe, it, expect } from "vitest";
import { splitLeaveDays, describeLeaveSplit } from "@/utils/leaveAllowance";

/**
 * Two paid leave days per PAY PERIOD; everything past them is an absence.
 *
 * The two things that make this a rule rather than a label:
 *   - the allowance is spent across the whole period, so the third day off costs whether it
 *     arrives on its own or inside a batch;
 *   - the period is the 10th → 9th cycle, and a request can straddle two of them.
 */

describe("settling a request against the allowance", () => {
  it("pays the first two days and marks the rest absent", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16"],
    });

    expect(split.leaveDates).toEqual(["2026-07-13", "2026-07-14"]);
    expect(split.absentDates).toEqual(["2026-07-15", "2026-07-16"]);
  });

  it("pays a short request in full", () => {
    const split = splitLeaveDays({ requestedDates: ["2026-07-13", "2026-07-14"] });
    expect(split.absentDates).toEqual([]);
  });

  /** The whole point of an allowance: it is spent across the period, not reset per request. */
  it("counts leave already taken in the same period", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-20", "2026-07-21"],
      alreadyApprovedLeaveDates: ["2026-07-13"],
    });

    expect(split.leaveDates).toEqual(["2026-07-20"]);
    expect(split.absentDates).toEqual(["2026-07-21"]);
  });

  it("marks everything absent once the allowance is gone", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-20", "2026-07-21"],
      alreadyApprovedLeaveDates: ["2026-07-13", "2026-07-14"],
    });

    expect(split.leaveDates).toEqual([]);
    expect(split.absentDates).toEqual(["2026-07-20", "2026-07-21"]);
  });

  /**
   * Leave in a DIFFERENT pay cycle must not reach into this one. 8 July is in the June cycle
   * (10 Jun – 9 Jul); 13 July is in the July one.
   */
  it("does not spend one period's allowance on another period's leave", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-13", "2026-07-14"],
      alreadyApprovedLeaveDates: ["2026-07-06", "2026-07-07"],
    });

    expect(split.absentDates).toEqual([]);
  });

  /**
   * A request from the 8th to the 13th crosses the pay boundary, and each side carries its own
   * two days. Settling it as one lump would either give away four paid days or charge absences a
   * period with room to spare never earned.
   */
  it("gives each pay period its own allowance when a request straddles the boundary", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11"],
    });

    // Two in the June cycle, two in the July one — all four paid.
    expect(split.absentDates).toEqual([]);
    expect(split.periods).toHaveLength(2);
    expect(split.periods.map(p => p.period)).toEqual(["2026-06", "2026-07"]);
    expect(split.periods.every(p => p.leaveDays === 2)).toBe(true);
  });

  it("charges only the period that is out of allowance when a request straddles", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11"],
      // The June cycle is already spent; July is untouched.
      alreadyApprovedLeaveDates: ["2026-06-15", "2026-06-16"],
    });

    expect(split.absentDates).toEqual(["2026-07-08", "2026-07-09"]);
    expect(split.leaveDates).toEqual(["2026-07-10", "2026-07-11"]);
  });

  it("pays the earliest days, so the split does not depend on the order given", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-16", "2026-07-13", "2026-07-15", "2026-07-14"],
    });
    expect(split.leaveDates).toEqual(["2026-07-13", "2026-07-14"]);
  });

  it("counts a duplicated date once", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-13", "2026-07-13", "2026-07-14"],
    });
    expect(split.leaveDates.length + split.absentDates.length).toBe(2);
    expect(split.absentDates).toEqual([]);
  });

  /**
   * Leave an admin marked straight onto the attendance grid belongs to no request, so the caller
   * can override the count for a period it knows better than the date list does.
   */
  it("lets the caller state what a period has already used", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-13", "2026-07-14"],
      alreadyUsedByPeriod: { "2026-07": 2 },
    });
    expect(split.absentDates).toEqual(["2026-07-13", "2026-07-14"]);
  });

  it("reports what each period spent, for explaining the verdict", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-20", "2026-07-21", "2026-07-22"],
      alreadyApprovedLeaveDates: ["2026-07-13"],
    });

    expect(split.periods).toEqual([
      { period: "2026-07", quota: 2, alreadyUsed: 1, leaveDays: 1, absentDays: 2 },
    ]);
  });

  it("handles an empty request without inventing days", () => {
    const split = splitLeaveDays({ requestedDates: [] });
    expect(split.leaveDates).toEqual([]);
    expect(split.absentDates).toEqual([]);
    expect(split.periods).toEqual([]);
  });
});

describe("what the employee is told", () => {
  it("says nothing alarming when it is all within the allowance", () => {
    const split = splitLeaveDays({ requestedDates: ["2026-07-13", "2026-07-14"] });
    expect(describeLeaveSplit(split)).toContain("within your paid leave allowance");
  });

  it("names the absence when there is one", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-13", "2026-07-14", "2026-07-15"],
    });
    const text = describeLeaveSplit(split);
    expect(text).toContain("2 paid leave days");
    expect(text).toContain("1 day counted as absence");
  });

  it("says so plainly when the whole request is absence", () => {
    const split = splitLeaveDays({
      requestedDates: ["2026-07-20"],
      alreadyApprovedLeaveDates: ["2026-07-13", "2026-07-14"],
    });
    expect(describeLeaveSplit(split)).toContain("already used");
  });
});
