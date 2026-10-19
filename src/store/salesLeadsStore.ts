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
  /**
   * My Leads' duplicate scan, kept for the session (2026-10-19). The scan reads every lead with one
   * of the member's numbers across the company — thousands of reads for a long-serving member — and
   * it ran again on EVERY visit to My Leads. Now it runs once per session; "Recheck" runs it again.
   */
  duplicateScan: { uid: string; leadIds: string[] } | null;
  setDuplicateScan: (scan: { uid: string; leadIds: string[] } | null) => void;
  reset: () => void;
}

export const useSalesLeadsStore = create<SalesLeadsState>((set) => ({
  uid: null,
  leads: [],
  loading: true,
  duplicateScan: null,
  setLeads: (uid, leads) => set({ uid, leads, loading: false }),
  setDuplicateScan: (duplicateScan) => set({ duplicateScan }),
  reset: () => set({ uid: null, leads: [], loading: true, duplicateScan: null }),
}));
