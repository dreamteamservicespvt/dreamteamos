/**
 * Number requests — the rules, with no Firestore (owner, 2026-10-19).
 *
 * A member who finds a number held by a colleague (a duplicate the colleague kept, their 24-hour
 * reservation, a client they sold to) may ask for it. The colleague holding it may give it, or the sales
 * admin. A number the holder has SOLD to is the sales admin's call alone: the holder's sales stay theirs,
 * but taking the client relationship off a seller is not something two members settle between themselves.
 */
import type { NumberRequest, UserRole } from "@/types";

/** One open request per number per requester: asking twice finds the same document. */
export function numberRequestId(phone: string, requesterId: string): string {
  return `nr_${(phone || "").replace(/\D/g, "")}_${requesterId}`;
}

/** The roles that may give any number, sold or not. */
export const NUMBER_REQUEST_ADMIN_ROLES: UserRole[] = ["sales_admin", "main_admin"];

/** Whether a lead counts as sold for this rule — any sale line, or the old single sale. */
export function leadHasSale(lead: { saleDone?: boolean; saleItems?: unknown[] | null; saleDetails?: unknown } | null | undefined): boolean {
  if (!lead) return false;
  return !!lead.saleDone || (Array.isArray(lead.saleItems) && lead.saleItems.length > 0) || !!lead.saleDetails;
}

/** `reason` is set when `ok` is false (a plain shape: the project's TS is non-strict, so unions don't narrow). */
export type DecideCheck = { ok: boolean; reason?: string };

/** May this person approve or decline this request? `hasSale` is the holder's lead as it is NOW. */
export function mayDecideNumberRequest(
  req: Pick<NumberRequest, "status" | "holderId" | "holderHasSale">,
  actor: { uid: string; role: UserRole | string },
  hasSale: boolean = req.holderHasSale,
): DecideCheck {
  if (req.status !== "pending") return { ok: false, reason: "This request has already been decided." };
  if (NUMBER_REQUEST_ADMIN_ROLES.includes(actor.role as UserRole)) return { ok: true };
  if (actor.uid !== req.holderId) return { ok: false, reason: "Only the member holding the number or the sales admin can decide this." };
  if (hasSale) return { ok: false, reason: "This number has a sale on it — only the sales admin can give it." };
  return { ok: true };
}
