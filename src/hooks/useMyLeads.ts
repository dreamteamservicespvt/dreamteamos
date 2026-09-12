import { useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useSalesLeadsStore } from "@/store/salesLeadsStore";
import type { Lead } from "@/types";

/**
 * Owns the ONE live "my leads" listener for a signed-in sales member. Mount exactly once — in
 * AppLayout, alongside the other session-wide listeners (notifications, FCM) — never inside an
 * individual page. See store/salesLeadsStore.ts for why this exists.
 *
 * Keyed on `user?.uid` (a stable primitive), not the `user` object itself: the object gets a new
 * identity on every emission of the user-doc listener in useAuth (even for unrelated field
 * changes), and keying a subscription effect on the whole object re-subscribes — and re-reads the
 * member's full lead history — every time that happens.
 */
export function useMyLeadsSync() {
  const uid = useAuthStore((s) => s.user?.uid);
  const role = useAuthStore((s) => s.user?.role);
  const setLeads = useSalesLeadsStore((s) => s.setLeads);
  const reset = useSalesLeadsStore((s) => s.reset);

  useEffect(() => {
    if (!uid || role !== "sales_member") {
      reset();
      return;
    }
    const q = query(collection(db, "leads"), where("assignedTo", "==", uid));
    const unsub = onSnapshot(
      q,
      (snap) => setLeads(uid, snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead))),
      () => setLeads(uid, []),
    );
    return () => {
      unsub();
      reset();
    };
  }, [uid, role, setLeads, reset]);
}

/**
 * Read-only access to the shared "my leads" data synced by `useMyLeadsSync`. Safe to call from
 * any number of components/pages — it never opens its own Firestore listener.
 */
export function useMyLeads(): { leads: Lead[]; loading: boolean } {
  const leads = useSalesLeadsStore((s) => s.leads);
  const loading = useSalesLeadsStore((s) => s.loading);
  return { leads, loading };
}
