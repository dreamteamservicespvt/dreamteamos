/**
 * Who may open SMM Delivery Control, and which view of it they get (2026-10-15). Kept in a file of its own with no
 * imports, so the classic Social Media page can show the button without loading the weekly rules.
 */
import type { SmmDeliverySettings } from "../types/smmDelivery";

/* ── Who is looking ───────────────────────────────────────────────────────────────────────────── */

export type SmmControlView = "member" | "lead" | "team_leader" | "admin" | "salesperson" | "sales_admin";

export interface SmmControlViewer {
  uid: string;
  name?: string;
  role?: string;
  smmLeader?: boolean;
}

/** The view a person gets. A Tech Team Leader or admin with the lead flag keeps their role's view. */
export function controlViewOf(user: SmmControlViewer | null | undefined): SmmControlView | null {
  const role = user?.role || "";
  if (role === "main_admin" || role === "tech_admin") return "admin";
  if (role === "tech_team_leader") return "team_leader";
  if (role === "sales_admin") return "sales_admin";
  if (role === "sales_member") return "salesperson";
  if (role === "tech_member") return user?.smmLeader ? "lead" : "member";
  return null;
}

/**
 * Who sees the "✨ Delivery Control" button on the classic page (owner's decisions 14–15): in Preview the tech
 * admin, the main admin, the tech team leaders and the Social Media Team Lead; at Live all six Social Media
 * roles; while Off only the two who can turn it back on.
 */
export function canSeeControlButton(user: SmmControlViewer | null | undefined, mode: SmmDeliverySettings["mode"]): boolean {
  const view = controlViewOf(user);
  if (!view) return false;
  if (mode === "off") return view === "admin";
  if (mode === "live") return true;
  return view === "admin" || view === "team_leader" || view === "lead";
}

/** May open the page at all (the button's audience, plus anybody already on it while Live). */
export const canOpenControl = canSeeControlButton;


/**
 * Delivery Control's alerts cover this person now: Live, and in the pilot group when there is one. While they
 * are covered the old soft reminders (the 11 AM / 5 PM status check, the due bells on open, the check-out's due
 * card) step aside — the alerts replace them (owner's decision 7); everybody else keeps them exactly as before.
 */
export function coveredByDelivery(settings: Pick<SmmDeliverySettings, "mode" | "pilotUids">, uid: string | null | undefined): boolean {
  if (!uid || settings.mode !== "live") return false;
  return !settings.pilotUids.length || settings.pilotUids.includes(uid);
}

