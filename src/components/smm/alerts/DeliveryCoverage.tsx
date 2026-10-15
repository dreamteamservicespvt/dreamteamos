/**
 * The old soft SMM reminders step aside for the people SMM Delivery Control covers (2026-10-15, phase 4; owner's
 * decision 7): the 11 AM / 5 PM post-status check, the due card at check-in / check-out and its "due soon" bells.
 * Covered = Live, and in the pilot group when there is one (`smmControlAccess.coveredByDelivery`) — for everybody
 * else they behave exactly as before. While the settings are still loading nothing changes (the old reminder shows
 * as it always did), so a slow read never hides a reminder from somebody who is not covered.
 */
import type { ReactNode } from "react";
import { useAuthStore } from "@/store/authStore";
import { coveredByDelivery } from "@/utils/smmControlAccess";
import { useSmmDeliverySettings } from "../control/useSmmDeliverySettings";

export function useCoveredByDelivery(): boolean {
  const uid = useAuthStore((s) => s.user?.uid);
  const { settings, loaded } = useSmmDeliverySettings();
  return loaded && coveredByDelivery(settings, uid);
}

/** `children` for everybody Delivery Control does not cover; `covered` (default nothing) for those it does. */
export function UnlessCoveredByDelivery({ children, covered = null }: { children: ReactNode; covered?: ReactNode }) {
  return <>{useCoveredByDelivery() ? covered : children}</>;
}
