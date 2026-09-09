import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildPromise, extendPromise, canExtendPromise, promiseDueMs, promiseOriginalDueMs,
  deadlineState,
} from "@/utils/promiseSla";
import type { PromiseDeadline, UserRole } from "@/types";

/**
 * The one extension a delivery promise may be given.
 *
 * The promise we send the client is conditional — 24 hours holds only while they confirm their
 * details and answer the script quickly. When they don't, the clock runs on work nobody could
 * start and the tech member is marked late for a delay they had no part in. So the deadline can be
 * moved, once, by any of the three people who might be first to learn the client has stalled.
 */

const HOUR = 3_600_000;
const START = Date.UTC(2026, 8, 9, 9, 0, 0); // 09:00

const promise24 = (): PromiseDeadline =>
  buildPromise({ presetKey: "promotional_24h", startMs: START });

const by = (role: UserRole = "tech_team_leader") => ({
  uid: "u1", name: "Asha", role, reason: "Client had not sent their details.",
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("extending a promise", () => {
  it("defaults to the promise's own length again — 24 hours becomes 48", () => {
    const next = extendPromise(promise24(), by());
    expect(next.hours).toBe(48);
    expect(promiseDueMs(next)).toBe(START + 48 * HOUR);
    expect(next.label).toBe("2 days (extended)");
  });

  it("takes a different number of hours when one is given", () => {
    // A five-day website that stalled for an afternoon does not need another five days.
    const next = extendPromise(promise24(), { ...by(), hours: 4 });
    expect(next.hours).toBe(28);
    expect(promiseDueMs(next)).toBe(START + 28 * HOUR);
  });

  it("keeps the deadline it was originally given", () => {
    const next = extendPromise(promise24(), by());
    expect(promiseOriginalDueMs(next)).toBe(START + 24 * HOUR);
    // And an un-extended promise answers the same question with its own due date, so a caller can
    // print "promised by X" without first asking whether an extension happened.
    expect(promiseOriginalDueMs(promise24())).toBe(START + 24 * HOUR);
  });

  it("records who moved it and why", () => {
    const next = extendPromise(promise24(), by("tech_member"));
    expect(next.extension?.by).toBe("u1");
    expect(next.extension?.byName).toBe("Asha");
    expect(next.extension?.byRole).toBe("tech_member");
    expect(next.extension?.reason).toBe("Client had not sent their details.");
    expect(next.extension?.hours).toBe(24);
  });

  /**
   * Measured from the original deadline, never from now. Measuring from now would quietly reward
   * leaving it late: a job extended six hours after it was already overdue would get thirty hours
   * rather than twenty-four.
   */
  it("measures the extension from the deadline, not from the moment it is granted", () => {
    vi.setSystemTime(START + 30 * HOUR); // already six hours overdue
    const next = extendPromise(promise24(), by());
    expect(promiseDueMs(next)).toBe(START + 48 * HOUR);
    // Still overdue right now, which is the honest answer — six hours of the extension are spent.
    expect(deadlineState(promiseDueMs(next), START + 49 * HOUR)).toBe("overdue");
  });

  it("blanks an empty reason rather than storing whitespace", () => {
    expect(extendPromise(promise24(), { ...by(), reason: "   " }).extension?.reason).toBeNull();
  });
});

describe("who may extend, and how often", () => {
  const base = { promise: promise24(), assigneeUid: "m1", soldBy: "s1" };

  it("lets the team leader move anything they can see", () => {
    expect(canExtendPromise({ ...base, role: "tech_team_leader", uid: "x" }).allowed).toBe(true);
    expect(canExtendPromise({ ...base, role: "tech_admin", uid: "x" }).allowed).toBe(true);
  });

  it("lets the member holding the work move their own job", () => {
    expect(canExtendPromise({ ...base, role: "tech_member", uid: "m1" }).allowed).toBe(true);
  });

  it("lets the sales member who sold it move their own sale", () => {
    expect(canExtendPromise({ ...base, role: "sales_member", uid: "s1" }).allowed).toBe(true);
  });

  it("shuts out a member with no part in this job", () => {
    const v = canExtendPromise({ ...base, role: "tech_member", uid: "m9" });
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/team leader|making it|sold it/i);
  });

  /** A second move makes the promise mean nothing — which is what the countdown exists to prevent. */
  it("refuses a second extension, and says who used the first", () => {
    const once = extendPromise(promise24(), by());
    const v = canExtendPromise({ ...base, promise: once, role: "tech_team_leader", uid: "x" });
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain("Asha");
    expect(v.reason).toMatch(/only moves once/i);
  });

  it("has nothing to extend on a job with no promise", () => {
    expect(canExtendPromise({ ...base, promise: null, role: "tech_admin", uid: "x" }).allowed).toBe(false);
  });

  it("refuses a signed-out caller", () => {
    expect(canExtendPromise({ ...base, role: "tech_member", uid: undefined }).allowed).toBe(false);
  });
});
