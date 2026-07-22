import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { cycleForDate, CYCLE_START_DAY, DONE_STATUSES, completionDate } from "@/utils/performanceCycle";
import type { WorkAssignment } from "@/types";

const label = (d: Date) => format(d, "yyyy-MM-dd");

describe("cycleForDate", () => {
  it("runs the 10th → 9th of the next month", () => {
    const { from, to } = cycleForDate(new Date(2026, 6, 22)); // 22 Jul 2026
    expect(label(from)).toBe("2026-07-10");
    expect(label(to)).toBe("2026-08-09");
  });

  it("puts a date before the 10th in the previous month's cycle", () => {
    const { from, to } = cycleForDate(new Date(2026, 6, 3)); // 3 Jul 2026
    expect(label(from)).toBe("2026-06-10");
    expect(label(to)).toBe("2026-07-09");
  });

  it("treats the 10th itself as the first day of a new cycle", () => {
    expect(label(cycleForDate(new Date(2026, 6, 10)).from)).toBe("2026-07-10");
  });

  it("treats the 9th as the last day of the running cycle", () => {
    const { from, to } = cycleForDate(new Date(2026, 6, 9));
    expect(label(from)).toBe("2026-06-10");
    expect(label(to)).toBe("2026-07-09");
  });

  it("rolls the year over correctly across December", () => {
    const { from, to } = cycleForDate(new Date(2026, 11, 15)); // 15 Dec 2026
    expect(label(from)).toBe("2026-12-10");
    expect(label(to)).toBe("2027-01-09");

    const january = cycleForDate(new Date(2027, 0, 5)); // 5 Jan 2027
    expect(label(january.from)).toBe("2026-12-10");
    expect(label(january.to)).toBe("2027-01-09");
  });

  it("handles February's short month without spilling into March", () => {
    const { from, to } = cycleForDate(new Date(2026, 1, 20)); // 20 Feb 2026
    expect(label(from)).toBe("2026-02-10");
    expect(label(to)).toBe("2026-03-09");
  });

  it("produces contiguous, non-overlapping cycles", () => {
    const first = cycleForDate(new Date(2026, 2, 15));
    const next = cycleForDate(new Date(2026, 3, 15));
    const dayAfterFirstEnds = new Date(first.to);
    dayAfterFirstEnds.setDate(dayAfterFirstEnds.getDate() + 1);
    expect(label(dayAfterFirstEnds)).toBe(label(next.from));
  });

  it("starts on the documented day", () => {
    expect(CYCLE_START_DAY).toBe(10);
  });
});

describe("DONE_STATUSES", () => {
  it("counts completed and verified work, and nothing earlier", () => {
    expect(DONE_STATUSES.has("completed")).toBe(true);
    expect(DONE_STATUSES.has("verified")).toBe(true);
    expect(DONE_STATUSES.has("assigned")).toBe(false);
    expect(DONE_STATUSES.has("in_progress")).toBe(false);
    expect(DONE_STATUSES.has("editing")).toBe(false);
  });
});

describe("completionDate", () => {
  const make = (fields: Partial<WorkAssignment>) => fields as WorkAssignment;

  it("prefers the recorded completedDate", () => {
    expect(label(completionDate(make({ completedDate: "2026-07-15" }))!)).toBe("2026-07-15");
  });

  it("falls back to the completedAt timestamp", () => {
    const seconds = new Date(2026, 6, 15, 13, 30).getTime() / 1000;
    expect(label(completionDate(make({ completedAt: { seconds } }))!)).toBe("2026-07-15");
  });

  it("falls back to verifiedAt when nothing else is recorded", () => {
    const seconds = new Date(2026, 6, 16, 9, 0).getTime() / 1000;
    expect(label(completionDate(make({ verifiedAt: { seconds } }))!)).toBe("2026-07-16");
  });

  it("returns null rather than guessing when no timestamp is usable", () => {
    expect(completionDate(make({}))).toBeNull();
    expect(completionDate(make({ completedDate: "not-a-date" }))).toBeNull();
  });
});
