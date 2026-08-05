import { differenceInCalendarDays } from "date-fns";
import { cycleForDate } from "@/utils/performanceCycle";
import type { AppUser } from "@/types";

/**
 * A sales member's target, from the one number anybody actually sets.
 *
 * ── Why there is only one number now ──────────────────────────────────────────────────────────
 * A member record used to carry three: `target`, `dailyTarget` and `monthlyTarget`, all typed in by
 * hand on three different forms. Nothing kept them consistent, and the app never agreed on what the
 * oldest of them meant — the sales-admin dashboard read `target` as a DAILY figure while the
 * member's own dashboard read the same field as a MONTHLY one. The same record therefore showed a
 * member two different targets depending on who was looking, and an admin filling the form had to
 * guess which box mattered.
 *
 * So the daily target is the only figure that is set, and the monthly one is derived from it. There
 * is nothing left to keep in sync because there is nothing left to disagree.
 *
 * ── How the monthly figure is derived ─────────────────────────────────────────────────────────
 * Daily target × the number of days in the pay cycle the date falls in. The cycle is the business's
 * own 10th → 9th month (see utils/performanceCycle), not the calendar month, so the figure a member
 * is measured against covers exactly the period their revenue is counted over. It is 28–31 days
 * depending on the month, which is why this is a function of a date rather than a constant.
 */

/** Days in the 10th → 9th pay cycle containing `on` — 28 to 31, depending on the month. */
export function daysInPayCycle(on: Date = new Date()): number {
  const { from, to } = cycleForDate(on);
  return differenceInCalendarDays(to, from) + 1;
}

/** The one target that is stored. Anything that is not a positive number means "not set". */
type TargetBearing = Pick<AppUser, "dailyTarget" | "monthlyTarget">;

/**
 * The member's daily target, or 0 when nobody has set one.
 *
 * The `monthlyTarget` fallback is migration only, for records written before the form was
 * simplified: that field is unambiguous (it always meant a month), so a stored monthly figure can
 * be turned back into the daily one it implies without guessing. It disappears from a record the
 * first time an admin saves a daily target.
 *
 * The legacy `target` field is deliberately NOT consulted. It is the field the two dashboards read
 * two different ways, so there is no reading of it that is safe — and with the 75% incentive gate
 * now hanging off the target, a figure that is wrong by a factor of thirty would cost somebody
 * their commission. A member with nothing set has no target, which withholds nothing from anyone.
 */
export function dailyTargetOf(user?: TargetBearing | null, on: Date = new Date()): number {
  const daily = user?.dailyTarget;
  if (typeof daily === "number" && daily > 0) return Math.round(daily);

  const legacyMonthly = user?.monthlyTarget;
  if (typeof legacyMonthly === "number" && legacyMonthly > 0) {
    return Math.round(legacyMonthly / daysInPayCycle(on));
  }
  return 0;
}

/** The daily target scaled to the pay cycle `on` falls in. 0 when no daily target is set. */
export function monthlyTargetOf(user?: TargetBearing | null, on: Date = new Date()): number {
  const daily = dailyTargetOf(user, on);
  return daily > 0 ? daily * daysInPayCycle(on) : 0;
}

/** What a given daily target works out to for the cycle — for the hint under the input. */
export function monthlyTargetFor(dailyTarget: number, on: Date = new Date()): number {
  return dailyTarget > 0 ? Math.round(dailyTarget) * daysInPayCycle(on) : 0;
}

/**
 * The share of target below which the incentive is not earned at all.
 *
 * Not a sliding scale: at or above this, the incentive is paid at the member's full rate; below it
 * no incentive is payable for that cycle, whatever the value of the sales made. It is stated on the
 * offer and appointment letters in exactly those words (see utils/hrTemplates), so this constant
 * and the letters have to move together.
 */
export const INCENTIVE_TARGET_THRESHOLD = 0.75;

/** Achievement as a fraction of the cycle's target. 0 when there is no target to measure against. */
export function targetAchievement(revenue: number, monthlyTarget: number): number {
  if (!(monthlyTarget > 0)) return 0;
  return revenue / monthlyTarget;
}

/**
 * Is the incentive earned for this cycle?
 *
 * True when there is no target at all — a member nobody has set a target for cannot have missed it,
 * and withholding their commission on the strength of a blank field would be the app inventing a
 * penalty nobody imposed.
 */
export function incentiveEarned(revenue: number, monthlyTarget: number): boolean {
  if (!(monthlyTarget > 0)) return true;
  return targetAchievement(revenue, monthlyTarget) >= INCENTIVE_TARGET_THRESHOLD;
}
