import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { normalizePhone } from "@/utils/phone";
import type { Lead } from "@/types";

export interface DuplicateHolder {
  leadId: string;
  memberId: string;
  saleDone: boolean;
}

/**
 * Find other members who currently hold the same phone number (excluding the given member's
 * own leads and frozen / taken-over leads). Used to detect duplicate-sale disputes — when the
 * same client number ends up with more than one sales member.
 *
 * Reads the shared `leads` collection by phone. If security rules ever deny the cross-member
 * read it degrades gracefully (returns []), so detection failing never blocks a legitimate sale.
 */
export async function findOtherHolders(phone: string, excludeMemberId: string): Promise<DuplicateHolder[]> {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  try {
    const snap = await getDocs(query(collection(db, "leads"), where("phone", "==", normalized)));
    return snap.docs
      .map((d) => ({ leadId: d.id, ...(d.data() as Lead) }))
      .filter((l) => l.assignedTo !== excludeMemberId && !l.frozen)
      .map((l) => ({ leadId: l.leadId, memberId: l.assignedTo, saleDone: !!l.saleDone }));
  } catch {
    return [];
  }
}

/** True when another member has already recorded a sale on this number (i.e. a disputed duplicate). */
export async function isDuplicateSale(phone: string, excludeMemberId: string): Promise<boolean> {
  const others = await findOtherHolders(phone, excludeMemberId);
  return others.some((o) => o.saleDone);
}
