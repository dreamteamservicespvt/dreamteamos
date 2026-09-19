/**
 * The social-media months this person is allowed to see.
 *
 * ── Why the query depends on who is asking ────────────────────────────────────────────────────
 * A member is on a handful of months and reads them by name (`watchers array-contains`). An admin,
 * a team leader or an SMM leader oversees all of them and reads the active set. Those are two
 * genuinely different queries, and the alternative — one unscoped read of the collection, filtered
 * in the browser — is the pattern this codebase has already had to unpick twice for costing a
 * fortune in reads on the free tier.
 *
 * Keyed on `user.uid` rather than on `user`: `useAuth` hands out a NEW user object on every
 * emission, so a `[user]` dependency re-subscribes — and re-reads — several times per page load.
 * See the note in docs/AI-MEMORY.md about that bug class.
 */
import { useEffect, useMemo, useState } from "react";
import { watchActiveCampaigns, watchCampaign, watchMyCampaigns } from "@/services/smm";
import { isSmmOverseer } from "@/utils/smmPlan";
import type { SmmCampaign } from "@/types/smm";
import type { AppUser } from "@/types";

export type SmmViewer = Pick<AppUser, "uid" | "role" | "name"> & { smmLeader?: boolean };

export function useSmmCampaigns(user: SmmViewer | null | undefined) {
  const [campaigns, setCampaigns] = useState<SmmCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = user?.uid;
  const overseer = isSmmOverseer(user);

  useEffect(() => {
    if (!uid) { setCampaigns([]); setLoading(false); return; }
    setLoading(true);
    const handle = (list: SmmCampaign[]) => {
      /*
        A month whose ORDER was removed is gone, not filed under "Finished".

        Filtered here rather than in the query because a member's read is
        `watchers array-contains uid`, and Firestore will not take an inequality on another field
        alongside that without a composite index this does not need — a member is on a handful of
        months, so the browser can do it for nothing. The overseer's read is already scoped to
        active, so this only ever removes one from the member's own list.
      */
      setCampaigns(list.filter((c) => c.status !== "removed"));
      setLoading(false);
    };
    return overseer ? watchActiveCampaigns(handle) : watchMyCampaigns(uid, handle);
  }, [uid, overseer]);

  /** Newest first, and anything still running above anything finished. */
  const sorted = useMemo(() => {
    const rank = (c: SmmCampaign) => (c.status === "active" ? 0 : 1);
    return [...campaigns].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return (b.cycle?.startDate || "").localeCompare(a.cycle?.startDate || "");
    });
  }, [campaigns]);

  return { campaigns: sorted, loading };
}

/** One month, live. Used by the detail page, which may be deep-linked from a notification. */
export function useSmmCampaign(id: string | undefined) {
  const [campaign, setCampaign] = useState<SmmCampaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setCampaign(null); setLoading(false); return; }
    setLoading(true);
    // A removed month reads as "not available to you" — which is what it is. Somebody following an
    // old notification link to one should be told it is gone, not shown a plan they cannot act on.
    return watchCampaign(id, (c) => {
      setCampaign(c && c.status === "removed" ? null : c);
      setLoading(false);
    });
  }, [id]);

  return { campaign, loading };
}
