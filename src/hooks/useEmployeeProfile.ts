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
import type { Department, EmployeeProfile } from "@/types/hr";

export function useEmployeeProfile(uid?: string | null, department: Department = "tech"): EmployeeProfile | null {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);

  useEffect(() => {
    if (!uid) { setProfile(null); return; }
    return watchEmployeeProfile(uid, department, (p, exists) => setProfile(exists ? p : null));
  }, [uid, department]);

  return profile;
}
