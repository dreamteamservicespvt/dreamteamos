import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { AppUser, Lead } from "@/types";

/**
 * Free-plan quota helpers.
 *
 * The old pattern — `onSnapshot(collection(db, "leads"))` + client-side filtering — re-reads
 * EVERY lead in the org on each page open, and `onSnapshot(collection(db, "users"))` does the
 * same for users. With several admins/members navigating all day this alone blew through the
 * 50K/day free read quota. These helpers scope reads to just the current admin's team.
 */

/** One-time fetch of a sales admin's team members (users change rarely — no listener needed). */
export async function fetchTeamMembers(adminUid: string): Promise<AppUser[]> {
  const snap = await getDocs(
    query(collection(db, "users"), where("role", "==", "sales_member"), where("createdBy", "==", adminUid)),
  );
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
}

/**
 * Live-listen to ONLY the given members' leads, using chunked `in` queries (10 ids per query)
 * instead of streaming the whole collection. Emits the merged list after every change, once all
 * chunks have delivered their first snapshot.
 */
export function subscribeTeamLeads(memberIds: string[], cb: (leads: Lead[]) => void): () => void {
  const ids = [...new Set(memberIds)].filter(Boolean);
  if (ids.length === 0) {
    cb([]);
    return () => {};
  }
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

  const results = new Map<number, Lead[]>();
  const unsubs = chunks.map((chunk, idx) =>
    onSnapshot(
      query(collection(db, "leads"), where("assignedTo", "in", chunk)),
      (snap) => {
        results.set(idx, snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
        if (results.size === chunks.length) cb([...results.values()].flat());
      },
      () => {
        // A failed chunk (rules / quota) must not hang the page in "loading" forever —
        // treat it as empty and still emit what the other chunks delivered.
        results.set(idx, []);
        if (results.size === chunks.length) cb([...results.values()].flat());
      },
    ),
  );
  return () => unsubs.forEach((u) => u());
}

/** Live-listen to a single member's leads (member detail / history pages). */
export function subscribeMemberLeads(memberId: string, cb: (leads: Lead[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "leads"), where("assignedTo", "==", memberId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead))),
    () => cb([]), // error → emit empty so the page renders instead of hanging
  );
}
