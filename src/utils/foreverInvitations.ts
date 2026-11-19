/**
 * ── Forever Invitations (owner, 2026-11-19) ──
 * A digital invitation (wedding, birthday, house warming …) made from one of our templates. It is
 * not a video ad: no brief, no cast, no package list — the salesperson types the amount the client
 * actually paid, which client it is for, the occasion and the template's name. Pure rules only.
 */
import type { SaleInvitation } from "@/types";

export const FOREVER_INVITATIONS_KEY = "forever_invitations";

export const INVITATION_TYPES: { key: string; label: string }[] = [
  { key: "birthday", label: "Birthday" },
  { key: "wedding", label: "Wedding" },
  { key: "engagement", label: "Engagement" },
  { key: "haldi_mehandi", label: "Haldi & Mehandi" },
  { key: "house_warming", label: "House Warming" },
  { key: "naming_ceremony", label: "Naming Ceremony" },
  { key: "uyyala", label: "Uyyala Function" },
  { key: "seemantham", label: "Seemantham" },
  { key: "half_saree", label: "Half Saree Function" },
  { key: "business_opening", label: "Business Opening" },
  { key: "vardhanthi", label: "Vardhanthi" },
  { key: "custom", label: "Custom" },
];

export function isForeverInvitations(category: string | null | undefined): boolean {
  return category === FOREVER_INVITATIONS_KEY;
}

/** The occasion as the client reads it: the typed one for Custom, else the list's label. */
export function invitationTypeLabel(inv: Pick<SaleInvitation, "type" | "customType"> | null | undefined): string {
  if (!inv?.type) return "";
  if (inv.type === "custom") return inv.customType?.trim() || "";
  return INVITATION_TYPES.find((t) => t.key === inv.type)?.label || inv.type;
}

/** The first thing the form still needs, or null when the invitation is complete. */
export function invitationProblem(inv: SaleInvitation): string | null {
  if (!inv.clientName.trim()) return "Type the client's name.";
  if (inv.clientPhone.replace(/\D/g, "").length < 10) return "Type the client's 10-digit number.";
  if (!inv.type) return "Pick the invitation type.";
  if (inv.type === "custom" && !inv.customType?.trim()) return "Type the custom invitation type.";
  if (!inv.templateName.trim()) return "Type the template name.";
  return null;
}
