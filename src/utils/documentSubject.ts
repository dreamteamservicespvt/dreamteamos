/**
 * Who a letter is addressed to, assembled from the two records that know it.
 *
 * One function, because "which email goes on the paperwork" is a decision that must not be made
 * three times in three dialogs. It was: the issue dialog, the missing-letters panel and the
 * onboarding flow each built their own subject, and each reached for `user.email` — the login.
 *
 * A login is issued by the company and revoked when the person leaves. An offer letter, a relieving
 * letter or an experience certificate addressed to it is addressed somewhere the reader cannot
 * reach on the two occasions the document matters most: at the exit, and when a future employer
 * writes to verify it. So the personal email is the one that prints, and the login is only a
 * fallback for a record that has not been given one yet.
 *
 * Pure — no React, no Firestore.
 */
import { commissionRate } from "@/utils/salesIncentive";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";
import type { DocumentSubject } from "@/utils/hrTemplates";

/** True for the roles whose letters state an incentive and a target. */
function isSalesRole(user: Pick<AppUser, "role">): boolean {
  return user.role === "sales_member" || user.role === "sales_admin";
}

/**
 * The address that goes on the paperwork, and whether it is the right kind.
 *
 * Returned together so a caller can both print it and warn about it — a letter quietly falling back
 * to the login email is the failure this exists to prevent, and silence is how it stayed unnoticed.
 */
export function letterEmail(
  user: Pick<AppUser, "email">,
  profile: Pick<EmployeeProfile, "personalEmail">,
): { email: string | null; isPersonal: boolean } {
  const personal = (profile.personalEmail || "").trim();
  if (personal) return { email: personal, isPersonal: true };
  const login = (user.email || "").trim();
  return { email: login || null, isPersonal: false };
}

/** Everything a template needs about the person the letter is for. */
export function documentSubject(
  user: Pick<AppUser, "name" | "phone" | "email" | "employeeId" | "role" | "earningsOption" | "dailyTarget" | "monthlyTarget">,
  profile: Pick<EmployeeProfile, "personalEmail">,
): DocumentSubject {
  const sales = isSalesRole(user);
  return {
    name: user.name,
    phone: user.phone,
    email: letterEmail(user, profile).email,
    employeeId: user.employeeId,
    // Read from the record payroll actually settles against, so a letter can never promise a rate
    // the company does not pay. Absent entirely for a non-sales employee.
    incentivePercent: sales ? commissionRate(user.earningsOption) : null,
    dailyTarget: sales ? user.dailyTarget ?? null : null,
    monthlyTarget: sales ? user.monthlyTarget ?? null : null,
  };
}
