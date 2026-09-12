import { create } from "zustand";
import type { Lead } from "@/types";

/**
 * The signed-in sales member's own leads ("leads" where assignedTo == their uid), held ONCE for
 * the whole session.
 *
 * Before this store existed, Dashboard, My Leads, My Performance and My Salary (via
 * useSalesEarnings) each opened their OWN `onSnapshot` on the identical query — so a member
 * clicking between those four pages a few times a day re-read their entire lead history from
 * scratch on every single visit. `useMyLeadsSync` (see hooks/useMyLeads.ts) is mounted exactly
 * once, in AppLayout, and every page now just reads this store instead of subscribing itself.
 */
interface SalesLeadsState {
  uid: string | null;
  leads: Lead[];
  loading: boolean;
  setLeads: (uid: string, leads: Lead[]) => void;
  reset: () => void;
}

export const useSalesLeadsStore = create<SalesLeadsState>((set) => ({
  uid: null,
  leads: [],
  loading: true,
  setLeads: (uid, leads) => set({ uid, leads, loading: false }),
  reset: () => set({ uid: null, leads: [], loading: true }),
}));
