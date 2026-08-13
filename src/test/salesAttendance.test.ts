import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A sales member checking in has to make them Present — which it did not.
 *
 * The tech side writes `daily_checkins`; the sales check-in button has always written its own
 * `salesCheckins` collection instead. Everything that resolves attendance read only the first, so a
 * sales member could check in every working day of a cycle and still be scored Absent for all of
 * them. Salary is deducted per absent day, so this came out of their pay.
 *
 * The two collections are read together now. These tests pin that: one check-in in EITHER place is
 * a check-in, in the live listener the salary screens use and in the one-shot fetch payroll
 * finalisation uses.
 */

const listeners: Record<string, (snap: { docs: { data: () => unknown }[] }) => void> = {};
const snapshots: Record<string, { memberId: string; date: string }[]> = {};

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, name: string) => name),
  query: vi.fn((name: string) => name),
  where: vi.fn(() => ({})),
  doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(async (name: string) => ({
    docs: (snapshots[name] || []).map((d) => ({ id: `${d.memberId}_${d.date}`, data: () => d })),
  })),
  setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), addDoc: vi.fn(),
  onSnapshot: vi.fn((name: string, cb: (snap: { docs: { data: () => unknown }[] }) => void) => {
    listeners[name] = cb;
    cb({ docs: [] });
    return () => { delete listeners[name]; };
  }),
  serverTimestamp: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), writeBatch: vi.fn(),
  Timestamp: { fromDate: vi.fn() },
}));

import { watchCheckedInDaysInRange, attendanceKey, resolveStatus } from "@/services/techAttendance";
import { fetchMonthAttendance } from "@/services/payrollRun";

/** Push a snapshot into whichever collection's listener is registered. */
const emit = (name: string, rows: { memberId: string; date: string }[]) =>
  listeners[name]?.({ docs: rows.map((r) => ({ data: () => r })) });

beforeEach(() => {
  for (const k of Object.keys(listeners)) delete listeners[k];
  for (const k of Object.keys(snapshots)) delete snapshots[k];
});

describe("who counts as checked in", () => {
  it("counts a sales member's own check-in", () => {
    let latest = new Set<string>();
    watchCheckedInDaysInRange("2026-08-10", "2026-09-09", (s) => { latest = s; });

    // The bug, exactly: nothing in daily_checkins, a check-in in salesCheckins.
    emit("salesCheckins", [{ memberId: "sales1", date: "2026-08-12" }]);

    expect(latest.has(attendanceKey("sales1", "2026-08-12"))).toBe(true);
  });

  it("still counts a tech member's, and keeps both at once", () => {
    let latest = new Set<string>();
    watchCheckedInDaysInRange("2026-08-10", "2026-09-09", (s) => { latest = s; });

    emit("daily_checkins", [{ memberId: "tech1", date: "2026-08-12" }]);
    emit("salesCheckins", [{ memberId: "sales1", date: "2026-08-12" }]);

    expect(latest.has(attendanceKey("tech1", "2026-08-12"))).toBe(true);
    expect(latest.has(attendanceKey("sales1", "2026-08-12"))).toBe(true);
  });

  /**
   * Each listener replaces only its own half. Emitting from one collection must not wipe what the
   * other reported, or the set would flicker to Absent every time the other side wrote a doc.
   */
  it("does not drop one collection when the other updates", () => {
    let latest = new Set<string>();
    watchCheckedInDaysInRange("2026-08-10", "2026-09-09", (s) => { latest = s; });

    emit("salesCheckins", [{ memberId: "sales1", date: "2026-08-12" }]);
    emit("daily_checkins", [{ memberId: "tech1", date: "2026-08-13" }]);
    emit("daily_checkins", [{ memberId: "tech1", date: "2026-08-13" }, { memberId: "tech2", date: "2026-08-13" }]);

    expect(latest.has(attendanceKey("sales1", "2026-08-12"))).toBe(true);
    expect(latest.size).toBe(3);
  });

  /** A day removed from a collection has to leave the set — an override deleting a check-in. */
  it("forgets a check-in that was removed", () => {
    let latest = new Set<string>();
    watchCheckedInDaysInRange("2026-08-10", "2026-09-09", (s) => { latest = s; });

    emit("salesCheckins", [{ memberId: "sales1", date: "2026-08-12" }]);
    emit("salesCheckins", []);

    expect(latest.size).toBe(0);
  });
});

describe("the payroll run that actually pays people", () => {
  it("reads the sales check-ins too", async () => {
    snapshots["salesCheckins"] = [{ memberId: "sales1", date: "2026-08-12" }];
    snapshots["daily_checkins"] = [{ memberId: "tech1", date: "2026-08-12" }];

    const { checkedIn } = await fetchMonthAttendance("2026-08");

    expect(checkedIn.has(attendanceKey("sales1", "2026-08-12"))).toBe(true);
    expect(checkedIn.has(attendanceKey("tech1", "2026-08-12"))).toBe(true);
  });
});

/**
 * The rule the calendar and the payslip share. Restated here because the sales calendar is new and
 * "present by default when they check in" is the thing that was asked for.
 */
describe("what a checked-in day resolves to", () => {
  const base = { dateStr: "2026-08-12", hasFestivalHoliday: false, todayStr: "2026-08-13" };

  it("is Present", () => {
    expect(resolveStatus({ ...base, checkedIn: true })).toBe("full");
  });

  it("is Absent on a past working day with no check-in", () => {
    expect(resolveStatus({ ...base, checkedIn: false })).toBe("absent");
  });

  it("leaves today blank rather than pre-marking somebody absent", () => {
    expect(resolveStatus({ ...base, dateStr: "2026-08-13", checkedIn: false })).toBeNull();
  });

  /** An admin correcting the record has to win over the raw check-in. */
  it("lets an override beat the check-in", () => {
    expect(resolveStatus({ ...base, checkedIn: true, override: "leave" })).toBe("leave");
  });
});
