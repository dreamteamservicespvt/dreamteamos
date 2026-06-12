import { collection, doc, getDocs, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { normalizePhone } from "@/utils/phone";
import type { Lead, LeadStatus } from "@/types";

export interface DuplicateHolder {
  leadId: string;
  memberId: string;
  saleDone: boolean;
  status: LeadStatus;
  createdAtSeconds: number;
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
      .map((l) => ({
        leadId: l.leadId,
        memberId: l.assignedTo,
        saleDone: !!l.saleDone,
        status: l.status,
        createdAtSeconds: (l.createdAt as any)?.seconds || 0,
      }));
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
 * Batches phone lookups into `in` queries (≤10 each), all run in PARALLEL so even large lead
 * lists resolve in roughly one round-trip (the count must appear as soon as My Leads opens).
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
    const batches: string[][] = [];
    for (let i = 0; i < phones.length; i += 10) batches.push(phones.slice(i, i + 10));
    const snaps = await Promise.all(
      batches.map((batch) => getDocs(query(collection(db, "leads"), where("phone", "in", batch)))),
    );

    const othersByPhone: Record<string, DuplicateHolder[]> = {};
    snaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const data = d.data() as Lead;
        if (data.assignedTo === memberId || data.frozen) return;
        const np = normalizePhone(data.phone);
        if (!othersByPhone[np]) othersByPhone[np] = [];
        othersByPhone[np].push({
          leadId: d.id,
          memberId: data.assignedTo,
          saleDone: !!data.saleDone,
          status: data.status,
          createdAtSeconds: (data.createdAt as any)?.seconds || 0,
        });
      });
    });
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

export interface DuplicateResolution {
  /** My lead-ids whose duplicate was settled (no longer shown in the Duplicates tab). */
  resolvedMyLeadIds: Set<string>;
  /** How many of MY leads were frozen (the other member kept the number). */
  frozeMineCount: number;
  /** How many duplicates I WON (the other member's lead was frozen). */
  wonCount: number;
}

/**
 * Auto-resolve duplicates among old admin-added numbers where NO sale is involved on either side.
 *
 * Rule (per business policy):
 *  - the first member to ENGAGE the number (status changed away from "not_called") keeps it,
 *    even if their lead was added later — calling first beats being added first;
 *  - if both or neither engaged, the earlier-created lead wins (first added);
 *  - ties broken by lead id so both members' clients compute the same winner.
 *
 * The loser's lead is frozen (frozenReason "duplicate_resolved") exactly like a takeover, so it
 * drops out of duplicate detection and its member can't keep working it. Duplicates where ANY
 * side has recorded a sale are left alone — those go through the proof/dispute flow instead.
 *
 * Deterministic + idempotent: whichever member's client runs first applies the same outcome.
 * All writes are best-effort; a permission failure just leaves the pair unresolved (still shown).
 */
export async function resolveNonSaleDuplicates(
  myLeads: Lead[],
  dupMap: Record<string, DuplicateHolder[]>,
  me: { uid: string; name: string },
): Promise<DuplicateResolution> {
  const res: DuplicateResolution = { resolvedMyLeadIds: new Set(), frozeMineCount: 0, wonCount: 0 };

  for (const [myLeadId, holders] of Object.entries(dupMap)) {
    const mine = myLeads.find((l) => l.id === myLeadId);
    if (!mine || mine.frozen) continue;
    // Any sale on either side → dispute flow (proof + admin decision), don't auto-resolve.
    if (mine.saleDone || holders.some((h) => h.saleDone)) continue;

    type Contender = { leadId: string; isMine: boolean; engaged: boolean; createdAt: number };
    const contenders: Contender[] = [
      {
        leadId: mine.id,
        isMine: true,
        engaged: mine.status !== "not_called",
        createdAt: (mine.createdAt as any)?.seconds || 0,
      },
      ...holders.map((h) => ({
        leadId: h.leadId,
        isMine: false,
        engaged: h.status !== "not_called",
        createdAt: h.createdAtSeconds,
      })),
    ];

    const engagedOnes = contenders.filter((c) => c.engaged);
    const pool = engagedOnes.length === 1 ? engagedOnes : contenders;
    // Earliest created wins within the pool; deterministic tie-break on leadId.
    const winner = [...pool].sort((a, b) => (a.createdAt - b.createdAt) || (a.leadId < b.leadId ? -1 : 1))[0];
    const losers = contenders.filter((c) => c.leadId !== winner.leadId);

    let allOk = true;
    for (const loser of losers) {
      try {
        await updateDoc(doc(db, "leads", loser.leadId), {
          frozen: true,
          frozenAt: Timestamp.now(),
          frozenReason: "duplicate_resolved",
          takenOverBy: winner.isMine ? me.name : "another member (duplicate rule)",
          lastUpdated: serverTimestamp(),
        });
        if (loser.isMine) res.frozeMineCount++;
      } catch {
        allOk = false; // couldn't write (likely rules) — leave this pair visible as a duplicate
      }
    }
    if (allOk) {
      res.resolvedMyLeadIds.add(myLeadId);
      if (winner.isMine) res.wonCount++;
    }
  }
  return res;
}
