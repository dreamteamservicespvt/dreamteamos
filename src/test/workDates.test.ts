import { describe, it, expect } from "vitest";
import { workCountsOn, deliveryDate } from "@/utils/workDates";
import type { WorkAssignment } from "@/types";

/**
 * Which month a piece of work lands in.
 *
 * The bug these guard against: the tech dashboard bucketed everything by the *assigned* date, so
 * a month whose output was all carried over from the previous month read as zero videos.
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
  it("dates unfinished work by the day it was assigned", () => {
    expect(workCountsOn(make({ status: "assigned" }))).toBe("2026-06-30");
    expect(workCountsOn(make({ status: "in_progress" }))).toBe("2026-06-30");
  });

  it("dates finished work by the day it was delivered, not assigned", () => {
    const a = make({ status: "verified", date: "2026-06-30", completedDate: "2026-07-02" });
    expect(workCountsOn(a)).toBe("2026-07-02");
  });

  it("counts completed work the same way as verified work", () => {
    const a = make({ status: "completed", date: "2026-06-30", completedDate: "2026-07-02" });
    expect(workCountsOn(a)).toBe("2026-07-02");
  });

  it("falls back to completedAt when completedDate was never written", () => {
    const a = make({ status: "verified", date: "2026-06-30", completedAt: ts("2026-07-03T10:00:00") });
    expect(workCountsOn(a)).toBe("2026-07-03");
  });

  it("falls back to verifiedAt when there is no completion stamp at all", () => {
    const a = make({ status: "verified", date: "2026-06-30", verifiedAt: ts("2026-07-04T10:00:00") });
    expect(workCountsOn(a)).toBe("2026-07-04");
  });

  it("falls back to the assigned date for legacy records with no stamps", () => {
    expect(workCountsOn(make({ status: "verified" }))).toBe("2026-06-30");
  });

  it("returns undefined rather than an empty string when nothing is dated", () => {
    expect(workCountsOn(make({ status: "assigned", date: "" }))).toBeUndefined();
  });

  it("prefers completedDate over the timestamps", () => {
    const a = make({
      status: "verified",
      completedDate: "2026-07-02",
      completedAt: ts("2026-07-09T10:00:00"),
      verifiedAt: ts("2026-07-10T10:00:00"),
    });
    expect(workCountsOn(a)).toBe("2026-07-02");
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
