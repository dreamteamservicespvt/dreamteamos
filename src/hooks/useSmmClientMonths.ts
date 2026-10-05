/**
 * Every month of one client that this person may see — for the client's calendar (2026-10-05).
 *
 * ── Live where it matters, read once where it does not ────────────────────────────────────────
 * The month being worked on is already live in front of the viewer (the month page's own listener, or
 * the board's), and a post ticked off must move on the calendar at once — so those copies win. The
 * rest of the client's months are history: read with one query when the calendar opens
 * (`fetchClientMonths`) and kept for a few minutes, so flipping between List and Calendar does not read
 * them again. A member's board already holds every month they can see, so it asks for no read at all
 * (`fetchHistory: false`).
 *
 * Keyed on primitives (the client's key, the viewer's uid and role), never on objects — see the note in
 * useSmmCampaigns about re-subscribing on every snapshot.
 */
import { useEffect, useMemo, useState } from "react";
import { fetchClientMonths } from "@/services/smm";
import { canSeeSmmMonth, clientKeyOf, type CalendarViewer } from "@/utils/smmCalendar";
import type { SmmCampaign } from "@/types/smm";

/** How long a client's history read is reused within the session. */
const HISTORY_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; months: SmmCampaign[] }>();

/** Test hook — the cache outlives a component, so a test starts it clean. */
export function __clearClientMonthsCache() { cache.clear(); }

export function useSmmClientMonths({ clientKey, live, viewer, fetchHistory, keepId }: {
  /** `clientKeyOf` the client — their number, or `month:<id>` for a month with none. */
  clientKey: string | null | undefined;
  /** Months already live in front of the viewer; any of this client's are used as they are. */
  live: SmmCampaign[];
  viewer: CalendarViewer | null | undefined;
  /** Read the client's other months (an overseer's board, any month page). */
  fetchHistory: boolean;
  /** A month always shown — the one whose page this is, which its viewer is already looking at. */
  keepId?: string;
}) {
  const phoneId = clientKey && !clientKey.startsWith("month:") ? clientKey : "";
  const wantsRead = fetchHistory && !!phoneId;
  const [fetched, setFetched] = useState<SmmCampaign[] | null>(() => (wantsRead ? fresh(phoneId) : null));
  const [loading, setLoading] = useState(wantsRead && !fresh(phoneId));
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wantsRead) { setFetched(null); setLoading(false); setError(false); return; }
    const hit = fresh(phoneId);
    if (hit) { setFetched(hit); setLoading(false); setError(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchClientMonths(phoneId)
      .then((months) => {
        cache.set(phoneId, { at: Date.now(), months });
        if (!cancelled) { setFetched(months); setLoading(false); }
      })
      .catch((err) => {
        console.error("[smm] client months:", err);
        if (!cancelled) { setFetched(null); setError(true); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [phoneId, wantsRead, attempt]);

  const uid = viewer?.uid;
  const role = viewer?.role;
  const smmLeader = viewer?.smmLeader;
  const months = useMemo(() => {
    const byId = new Map<string, SmmCampaign>();
    for (const c of fetched || []) byId.set(c.id, c);
    for (const c of live) if (clientKey && clientKeyOf(c) === clientKey) byId.set(c.id, c);
    const who = uid ? { uid, role, smmLeader } : null;
    return [...byId.values()]
      .filter((c) => c.status !== "removed" && c.status !== "deleted")
      .filter((c) => c.id === keepId || canSeeSmmMonth(c, who))
      .sort((a, b) => (a.cycle?.startDate || "").localeCompare(b.cycle?.startDate || ""));
  }, [fetched, live, clientKey, uid, role, smmLeader, keepId]);

  const retry = () => { if (phoneId) cache.delete(phoneId); setAttempt((n) => n + 1); };
  return { months, loading, error, retry };
}

function fresh(phoneId: string): SmmCampaign[] | null {
  const hit = phoneId ? cache.get(phoneId) : undefined;
  return hit && Date.now() - hit.at < HISTORY_TTL_MS ? hit.months : null;
}
