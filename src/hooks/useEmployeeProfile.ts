/**
 * One person's HR record, live.
 *
 * A thin wrapper over `watchEmployeeProfile` for the screens that need a fact or two off the
 * record — a designation, an agreed CTC — without owning the whole employment panel. The Firestore
 * SDK shares one listen stream between identical document subscriptions, so a page that renders
 * both this and `MyEmploymentPanel` still costs a single read.
 */
import { useEffect, useState } from "react";
import { watchEmployeeProfile } from "@/services/hr";
import { departmentOfRole } from "@/utils/hrPolicy";
import { getRoleLabel } from "@/utils/roleHelpers";
import type { AppUser } from "@/types";
import type { Department, EmployeeProfile } from "@/types/hr";

export function useEmployeeProfile(uid?: string | null, department: Department = "tech"): EmployeeProfile | null {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);

  useEffect(() => {
    if (!uid) { setProfile(null); return; }
    return watchEmployeeProfile(uid, department, (p, exists) => setProfile(exists ? p : null));
  }, [uid, department]);

  return profile;
}

/**
 * What to call this person: their job, falling back to what their account is.
 *
 * Used by the chrome — the sidebar and topbar name badges — where "Tech Member" was being shown
 * back to an Associate AI Software Engineer as though it were their role. It is not: it is the
 * permission the account holds.
 *
 * Costs nothing for most people. An admin's designation is already on their user document, which
 * every screen has loaded anyway, so no read happens at all; only a member whose title lives in
 * the HR record needs a subscription, and the Firestore SDK shares one listen stream across every
 * component asking for the same document — so the sidebar, the topbar and the employment panel
 * together are one read, not three. That matters on a free-tier read budget.
 */
export function useMyDesignation(user?: AppUser | null): string {
  const onUserDoc = (user?.designation || "").trim();
  const department = departmentOfRole(user?.role);
  // Skipped entirely when the answer is already known, or when this role keeps no HR record.
  const needsProfile = !onUserDoc && !!department;
  const profile = useEmployeeProfile(needsProfile ? user?.uid : null, department || "tech");

  if (!user) return "";
  return onUserDoc || (profile?.designation || "").trim() || getRoleLabel(user.role);
}
