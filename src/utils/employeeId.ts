/**
 * Employee numbers: DTS-003, DTS-004, … one per person, never reused.
 *
 * They were typed by hand into the invite form, which is how a company ends up with two people
 * holding DTS-012 and a third holding "dts 12". The number is now proposed from the highest one
 * already issued, so the person onboarding a new joiner confirms a number rather than inventing it.
 */

export const EMPLOYEE_ID_PREFIX = "DTS";

/**
 * Where numbering resumes, whatever the records say.
 *
 * The team was numbered up to DTS-023 on paper long before this app existed, and the numbers
 * between that and here were spent on people who came and went without ever being entered. Reusing
 * them would put a new joiner's payslips under a number that already appears on somebody else's
 * paperwork, so the counter starts clear of the lot.
 */
export const EMPLOYEE_ID_FLOOR = 35;

/** The numeric part of "DTS-014", or 0 for anything that isn't one of ours. */
export function employeeIdNumber(id: string | null | undefined): number {
  const match = /^DTS[-\s]?(\d{1,5})$/i.exec((id || "").trim());
  return match ? parseInt(match[1], 10) : 0;
}

/** "DTS-035" — always three digits, so they sort and line up in a column. */
export function formatEmployeeId(n: number): string {
  return `${EMPLOYEE_ID_PREFIX}-${String(n).padStart(3, "0")}`;
}

/**
 * The number to offer the next joiner: one past the highest issued, never below the floor.
 *
 * Takes whatever the caller has — the team list it already loaded — rather than reading the whole
 * users collection itself, because every screen that needs this has that list on hand and a second
 * read of it would be pure waste on a free-tier quota.
 */
export function nextEmployeeId(existing: (string | null | undefined)[]): string {
  const highest = existing.reduce((max, id) => Math.max(max, employeeIdNumber(id)), 0);
  return formatEmployeeId(Math.max(highest + 1, EMPLOYEE_ID_FLOOR));
}
