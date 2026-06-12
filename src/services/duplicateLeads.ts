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

/**
 * For a member's own leads, find which ones are duplicates — i.e. another member also holds the
 * same number. Returns a map of the member's leadId → the other members' holdings on that number.
 * Batches phone lookups into `in` queries (≤10 each) so it scales to large lead lists.
 */
export async function findMemberDuplicates(
  memberLeads: { id: string; phone: string; frozen?: boolean }[],
  memberId: string,
): Promise<Record<string, DuplicateHolder[]>> {
  const phoneToLeadIds = new Map<string, string[]>();
  for (const l of memberLeads) {
    if (l.frozen) continue;
    const np = normalizePhone(l.phone);
    if (!np) continue;
    if (!phoneToLeadIds.has(np)) phoneToLeadIds.set(np, []);
    phoneToLeadIds.get(np)!.push(l.id);
  }
  const phones = [...phoneToLeadIds.keys()];
  const result: Record<string, DuplicateHolder[]> = {};
  if (phones.length === 0) return result;

  try {
    const othersByPhone: Record<string, DuplicateHolder[]> = {};
    for (let i = 0; i < phones.length; i += 10) {
      const batch = phones.slice(i, i + 10);
      const snap = await getDocs(query(collection(db, "leads"), where("phone", "in", batch)));
      snap.docs.forEach((d) => {
        const data = d.data() as Lead;
        if (data.assignedTo === memberId || data.frozen) return;
        const np = normalizePhone(data.phone);
        if (!othersByPhone[np]) othersByPhone[np] = [];
        othersByPhone[np].push({ leadId: d.id, memberId: data.assignedTo, saleDone: !!data.saleDone });
      });
    }
    for (const [np, leadIds] of phoneToLeadIds) {
      const holders = othersByPhone[np];
      if (holders && holders.length > 0) {
        for (const lid of leadIds) result[lid] = holders;
      }
    }
  } catch {
    return {};
  }
  return result;
}
