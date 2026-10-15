/**
 * The app-wide SMM alert host (SMM Delivery Control, 2026-10-15, phase 4) — mounted once in `AppLayout`.
 *
 * ── What it does ────────────────────────────────────────────────────────────────────────────────
 * While Delivery Control is LIVE and covers this person (`coveredByDelivery`: Live, and in the pilot group when
 * there is one), it runs the supervisor (`utils/smmMonitor`, the same rules as the server checker) on the months
 * this person can see, and shows THEIR alerts that are due now:
 *   • a full screen (`AlertScreen`) — every full-screen alert on one screen, worst first; answered, never closed;
 *   • a slim red bar instead while the full screen must wait: in the AI studio (the "studio strip" — the full
 *     screen comes on exit), on the Delivery Control page itself (the person is already working on it), while a
 *     call / another popup / a window of their own holds the screen, or when the data is not fresh;
 *   • sound + vibration + a blinking tab when a NEW alert arrives — one tab per device plays it (BroadcastChannel).
 *
 * ── The rules it keeps (the plan's pre-mortem) ──────────────────────────────────────────────────
 *   • One popup coordinator: the full screen opens only through `tryOpenPopup("smm_alert")` (never over a call,
 *     the studio, the check-in gate or another popup; ten minutes after a different popup — a critical skips only
 *     that gap) and reports itself while open, so the others wait for it.
 *   • Fresh data only: a full screen only on server-confirmed months synced in the last few minutes and a device
 *     clock that agrees with the server's (`screenProblem`); otherwise the bar says "Showing 10:42 data — alerts paused".
 *   • Quiet hours, leave, the pilot group and Preview are the supervisor's own holds (`heldBecause`) — held alerts
 *     never show here.
 *   • It never writes. Only the person's answers write; the bell and push come from the server checker alone
 *     ("one sender" — `smm_urgent` is NOT a popup type of `UpdatePopup`).
 *   • It sits in an error boundary (AppLayout) and returns nothing on any problem: the app always works without it.
 */
import { lazy, Suspense } from "react";
import { useAuthStore } from "@/store/authStore";
import { controlViewOf, coveredByDelivery } from "@/utils/smmControlAccess";
import { useSmmDeliverySettings } from "../control/useSmmDeliverySettings";
import type { AppUser } from "@/types";

const LiveAlertHost = lazy(() => import("./LiveAlertHost"));

export default function SmmAlertHost() {
  const user = useAuthStore((s) => s.user) as AppUser | null;
  const { settings } = useSmmDeliverySettings();
  const covered = !!user && !user.externalCreator && !!controlViewOf(user) && coveredByDelivery(settings, user.uid);
  if (!user || !covered) return null;
  return <Suspense fallback={null}><LiveAlertHost user={user} /></Suspense>;
}
