/**
 * What a sales employee earns on top of their salary.
 *
 * Lives here rather than in `services/settlements` so the letters can state it without dragging
 * Firestore into document generation — an offer letter is written before the person has a user
 * record at all, and `hrTemplates` is deliberately pure. Settlements re-exports these, so payroll
 * and the paperwork can never quote two different numbers.
 */

/** The standard rate. Everyone is on this unless they have been moved to the higher option. */
export const SALES_INCENTIVE_PERCENT = 5;

/** The enhanced rate, for members on `incentive_10`. */
export const SALES_INCENTIVE_PERCENT_ENHANCED = 10;

/** The rate this member actually earns, from their earnings option. */
export function commissionRate(option?: string): number {
  return option === "incentive_10" ? SALES_INCENTIVE_PERCENT_ENHANCED : SALES_INCENTIVE_PERCENT;
}
