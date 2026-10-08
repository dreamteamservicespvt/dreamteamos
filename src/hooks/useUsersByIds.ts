/**
 * The user records of a specific handful of people, read once by document id.
 *
 * Social Media → Attendance (2026-10-08) needs to know who of the people on the running months is a tech
 * member who checks in, whether they are still active, and how they are employed — for perhaps ten
 * people. Team Attendance listens to the whole `users` collection; this reads only those ids, once per
 * set of ids (a person's role or employment does not change while the view is open). The project runs on
 * the Firebase free tier, so a keyed read is the cheap one.
 *
 * Firestore caps an `in` query at 30 values, so the ids are read in chunks of 30 and merged.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { AppUser } from "@/types";

const CHUNK = 30;

export function useUsersByIds(uids: string[]): { users: Map<string, AppUser>; loading: boolean } {
  // Sorted + joined so the same people in another order do not read again.
  const key = useMemo(() => Array.from(new Set(uids.filter(Boolean))).sort().join(","), [uids]);
  const [state, setState] = useState<{ key: string; users: Map<string, AppUser> }>({ key: "", users: new Map() });

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setState({ key, users: new Map() });
      return;
    }
    let cancelled = false;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    Promise.all(chunks.map((chunk) => getDocs(query(collection(db, "users"), where(documentId(), "in", chunk)))))
      .then((snaps) => {
        if (cancelled) return;
        const users = new Map<string, AppUser>();
        snaps.forEach((snap) => snap.docs.forEach((d) => users.set(d.id, { uid: d.id, ...d.data() } as AppUser)));
        setState({ key, users });
      })
      .catch((error) => {
        console.error("[useUsersByIds] read failed:", error);
        if (!cancelled) setState({ key, users: new Map() });
      });
    return () => { cancelled = true; };
  }, [key]);

  return { users: state.users, loading: state.key !== key };
}
