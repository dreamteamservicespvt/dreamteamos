import { describe, it, expect } from "vitest";
import {
  dailyTargetOf, daysInPayCycle, incentiveEarned, monthlyTargetFor, monthlyTargetOf,
  targetAchievement, INCENTIVE_TARGET_THRESHOLD,
} from "@/utils/salesTargets";
import type { AppUser } from "@/types";

/**
 * One target, derived everywhere else.
 *
 * A member record used to carry three target fields typed in by hand, and the app could not agree
 * what the oldest of them meant — the sales-admin dashboard read `target` as a daily figure while
 * the member's own dashboard read the same field as a monthly one. These pin the replacement: the
 * daily figure is the only thing stored, the monthly one is that across the pay cycle, and the
 * ambiguous field is never consulted again.
 */

const member = (over: Partial<AppUser> = {}) => over as AppUser;

/** Mid-July 2026: the 10 Jul → 9 Aug cycle, which is 31 days. */
const inJuly = new Date("2026-07-15T00:00:00");
/** Mid-February 2027: the 10 Feb → 9 Mar cycle, which is 28 days. */
const inFebruary = new Date("2027-02-15T00:00:00");

describe("daysInPayCycle", () => {
  it("counts the business's own 10th → 9th month, not the calendar one", () => {
    expect(daysInPayCycle(inJuly)).toBe(31);      // 10 Jul → 9 Aug
    expect(daysInPayCycle(inFebruary)).toBe(28);  // 10 Feb → 9 Mar
  });

  it("gives the same answer anywhere inside one cycle", () => {
    // The 5th of August is still in the cycle that opened on 10 July.
    expect(daysInPayCycle(new Date("2026-08-05T00:00:00"))).toBe(31);
    expect(daysInPayCycle(new Date("2026-07-10T00:00:00"))).toBe(31);
  });
});

describe("dailyTargetOf", () => {
  it("reads the one stored figure", () => {
    expect(dailyTargetOf(member({ dailyTarget: 10000 }), inJuly)).toBe(10000);
  });

  /**
   * Migration only: `monthlyTarget` always unambiguously meant a month, so a record written before
   * the form was simplified can be read back without guessing.
   */
  it("recovers the daily figure a stored monthly target implied", () => {
    expect(dailyTargetOf(member({ monthlyTarget: 310000 }), inJuly)).toBe(10000);
  });

  it("prefers the daily figure when both are present", () => {
    expect(dailyTargetOf(member({ dailyTarget: 12000, monthlyTarget: 310000 }), inJuly)).toBe(12000);
  });

  /**
   * The field the two dashboards read two different ways. With the incentive now hanging off the
   * target, a figure wrong by a factor of thirty would cost somebody their commission — so there
   * is no reading of it at all.
   */
  it("never consults the ambiguous legacy target", () => {
    expect(dailyTargetOf(member({ target: 300000 } as Partial<AppUser>), inJuly)).toBe(0);
    expect(dailyTargetOf(member({ target: 10000 } as Partial<AppUser>), inJuly)).toBe(0);
  });

  it("treats an unset, zero or missing record as no target", () => {
    expect(dailyTargetOf(member(), inJuly)).toBe(0);
    expect(dailyTargetOf(member({ dailyTarget: 0 }), inJuly)).toBe(0);
    expect(dailyTargetOf(null, inJuly)).toBe(0);
  });
});

describe("monthlyTargetOf", () => {
  it("is the daily target across the pay cycle", () => {
    expect(monthlyTargetOf(member({ dailyTarget: 10000 }), inJuly)).toBe(310000);
    expect(monthlyTargetOf(member({ dailyTarget: 10000 }), inFebruary)).toBe(280000);
  });

  it("is nothing when no daily target is set", () => {
    expect(monthlyTargetOf(member(), inJuly)).toBe(0);
  });

  it("matches what the form's hint shows an admin as they type", () => {
    expect(monthlyTargetFor(10000, inJuly)).toBe(monthlyTargetOf(member({ dailyTarget: 10000 }), inJuly));
    expect(monthlyTargetFor(0, inJuly)).toBe(0);
  });
});

/**
 * The 75% gate. All-or-nothing by design: a member who reaches 74% of target earns no incentive on
 * the sales they did make, which is why the offer and appointment letters say so in those words.
 */
describe("the incentive gate", () => {
  const target = monthlyTargetOf(member({ dailyTarget: 10000 }), inJuly); // ₹3,10,000

  it("is the same 75% the letters state", () => {
    expect(INCENTIVE_TARGET_THRESHOLD).toBe(0.75);
  });

  it("pays at exactly 75%", () => {
    expect(incentiveEarned(target * 0.75, target)).toBe(true);
  });

  it("pays nothing a shade below it", () => {
    expect(incentiveEarned(target * 0.7499, target)).toBe(false);
    expect(incentiveEarned(target * 0.5, target)).toBe(false);
    expect(incentiveEarned(0, target)).toBe(false);
  });

  it("pays above it", () => {
    expect(incentiveEarned(target, target)).toBe(true);
    expect(incentiveEarned(target * 2, target)).toBe(true);
  });

  /**
   * The one case where withholding would be the app inventing a penalty: a member nobody has set a
   * target for cannot have missed it.
   */
  it("does not withhold from a member who has no target at all", () => {
    expect(incentiveEarned(0, 0)).toBe(true);
    expect(incentiveEarned(50000, 0)).toBe(true);
  });

  it("reports achievement as a fraction, and 0 when there is nothing to measure", () => {
    expect(targetAchievement(target / 2, target)).toBeCloseTo(0.5, 5);
    expect(targetAchievement(50000, 0)).toBe(0);
  });
});
