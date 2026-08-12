/**
 * Selling something else to somebody who has already bought.
 *
 * ── Why this hands the job back to the ordinary sale form ─────────────────────────────────────
 * An upsell is not a special kind of sale. It has the same package list, the same discount ladder,
 * the same freeze rules, the same order and the same client record at the end of it — the only
 * thing that makes it an upsell is that the phone number is already in the book. Building a second
 * "quick upsell" form would mean a second copy of the pricing and the discount authority, and the
 * two would drift on the day one of them was corrected.
 *
 * So this does the one thing My Clients cannot: it makes sure the number is the member's own lead,
 * and hands back the lead id. The caller then opens My Leads on that lead with the sale form
 * already open — the same form, the same rules, and the sale flows into orders exactly as any other.
 */
import { claimNumber, fetchNumberLock } from "@/services/numberLock";
import { normalizePhone } from "@/utils/phone";

export interface UpsellTarget {
  ok: boolean;
  /** The lead to open. Present whenever `ok`. */
  leadId?: string;
  /** Why not, in words the member can act on. */
  message: string;
}

/**
 * Make sure this customer is a lead the member can add a sale to, and say which one.
 *
 * The number is very often already theirs — they sold to it before — in which case `claimNumber`
 * reports `already_yours` and says nothing about which lead that is, so the lock is read for the
 * id it has been holding all along.
 */
export async function startUpsell(params: {
  user: { uid: string; name: string };
  phone: string;
  displayName?: string;
}): Promise<UpsellTarget> {
  const { user, phone, displayName } = params;
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, message: "This client has no usable phone number." };

  try {
    const result = await claimNumber({ user, phone: normalized, displayName });

    switch (result.kind) {
      case "created":
        return { ok: true, leadId: result.leadId, message: "Added to your leads — record the sale." };
      case "takeover":
        return {
          ok: true,
          leadId: result.leadId,
          message: `This number was ${result.previousOwnerName}'s and is now yours.`,
        };
      case "already_yours": {
        const lock = await fetchNumberLock(normalized);
        if (lock?.ownerLeadId) {
          return { ok: true, leadId: lock.ownerLeadId, message: "Opening this client's lead." };
        }
        // The lock says it is theirs but names no lead — nothing to open, and inventing one would
        // create a duplicate the number-lock machinery would then have to reconcile.
        return { ok: false, message: "This number is yours but has no lead to add a sale to. Add it from My Leads." };
      }
      case "reserved":
        return {
          ok: false,
          message: `${result.ownerName} has this number reserved until ${result.until.toLocaleString()}.`,
        };
      case "sale_frozen":
        return {
          ok: false,
          message: `${result.saleByName} sold to this client recently — the number is frozen until ${result.until.toLocaleDateString()}.`,
        };
      default:
        return { ok: false, message: "Could not open this client's lead." };
    }
  } catch (err) {
    console.error("[upsell] could not claim the number:", err);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

/** Where the member is sent to record the upsell — My Leads, on that lead, sale form open. */
export function upsellLeadUrl(leadId: string, category: string): string {
  return `/sales/leads?lead=${encodeURIComponent(leadId)}&sale=1&category=${encodeURIComponent(category)}`;
}
