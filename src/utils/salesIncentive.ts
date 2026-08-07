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

/** The two plans a sales employee can be put on. */
export type SalesEarningsOption = "stipend_plus_5" | "incentive_10";

/**
 * What each plan is CALLED on screen.
 *
 * ── Why the stored key still says "stipend" ───────────────────────────────────────────────────
 * `stipend_plus_5` is the value written on every existing user record. Renaming it would mean a
 * migration over live data to change a word nobody outside this file ever sees, and any record
 * missed would silently fall back to the 5% default — so the key is left alone and only the
 * label moved. The money it describes is a salary, not a stipend: a stipend is what an intern is
 * paid, and calling a salaried executive's pay one had people asking whether they were staff.
 *
 * ── Why the labels live here ──────────────────────────────────────────────────────────────────
 * They were written out by hand on four screens — "Stipend + 5%", "Stipend + 5% incentive",
 * "Option 1 — Stipend (up to ₹5,000) + 5% Incentives" and "10% incentive" — which is how the
 * same plan came to have four names. One definition next to the rates it describes means the
 * next rename is one edit.
 */
export const EARNINGS_PLAN_LABELS: Record<SalesEarningsOption, string> = {
  stipend_plus_5: `Salary + ${SALES_INCENTIVE_PERCENT}%`,
  incentive_10: `${SALES_INCENTIVE_PERCENT_ENHANCED}% Incentive`,
};

/** The plan's name, or a plain "Not assigned" for somebody who has not been put on one. */
export function earningsPlanLabel(option?: string): string {
  return EARNINGS_PLAN_LABELS[option as SalesEarningsOption] || "Not assigned";
}
