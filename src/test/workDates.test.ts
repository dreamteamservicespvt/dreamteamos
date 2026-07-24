import { describe, it, expect } from "vitest";
import { workCountsOn, deliveryDate } from "@/utils/workDates";
import type { WorkAssignment } from "@/types";

/**
 * Which day a piece of work lands on.
 *
 * The rule: a tech member works that day's ads and only that day's, so a job counts on the day it
 * was ASSIGNED. Completion and approval stamps are clerical and must never move it — approving
 * yesterday's work this morning used to push it into today's column.
 */

const make = (over: Partial<WorkAssignment>): WorkAssignment => ({
  id: "a1",
  assignedTo: "m1",
  assignedBy: "lead1",
  assignedAt: null,
  category: "promotional",
  clipCount: 5,
  includesEndCredits: false,
  duration: "30s",
  pricePerUnit: 1000,
  totalPrice: 1000,
  uniqueId: "U1",
  accessCode: "X1",
  displayTitle: "Promotional - U1",
  status: "assigned",
  sessions: [],
  totalDurationSeconds: 0,
  date: "2026-06-30",
  ...over,
} as WorkAssignment);

const ts = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000) });

describe("workCountsOn", () => {
  it("dates work by the day it was assigned, whatever its status", () => {
    expect(workCountsOn(make({ status: "assigned" }))).toBe("2026-06-30");
    expect(workCountsOn(make({ status: "in_progress" }))).toBe("2026-06-30");
    expect(workCountsOn(make({ status: "completed" }))).toBe("2026-06-30");
    expect(workCountsOn(make({ status: "verified" }))).toBe("2026-06-30");
  });

  it("ignores completedDate — marking it done later must not move the work", () => {
    const a = make({ status: "verified", date: "2026-06-30", completedDate: "2026-07-02" });
    expect(workCountsOn(a)).toBe("2026-06-30");
  });

  it("ignores completedAt and verifiedAt too — approval never sets the day", () => {
    const a = make({
      status: "verified",
      date: "2026-06-30",
      completedAt: ts("2026-07-03T10:00:00"),
      verifiedAt: ts("2026-07-04T10:00:00"),
    });
    expect(workCountsOn(a)).toBe("2026-06-30");
  });

  it("falls back to the assignedAt stamp when no date string was written", () => {
    const a = make({ status: "verified", date: "", assignedAt: ts("2026-06-30T20:11:00") });
    expect(workCountsOn(a)).toBe("2026-06-30");
  });

  it("falls back to assignedAtIso as a last resort", () => {
    const a = make({ status: "verified", date: "", assignedAt: null, assignedAtIso: "2026-06-30T20:11:06.000Z" });
    expect(workCountsOn(a)).toBe("2026-06-30");
  });

  it("returns undefined rather than an empty string when nothing is dated", () => {
    expect(workCountsOn(make({ status: "assigned", date: "" }))).toBeUndefined();
  });
});

describe("deliveryDate", () => {
  it("is null for work that has not shipped, so revenue cannot count it", () => {
    expect(deliveryDate(make({ status: "assigned" }))).toBeNull();
    expect(deliveryDate(make({ status: "in_progress" }))).toBeNull();
  });

  it("returns the delivery day once the work is done", () => {
    expect(deliveryDate(make({ status: "verified", completedDate: "2026-07-02" }))).toBe("2026-07-02");
  });

  it("never falls back to the assigned date — undelivered work has no delivery date", () => {
    expect(deliveryDate(make({ status: "verified", date: "2026-06-30" }))).toBeNull();
  });
});
