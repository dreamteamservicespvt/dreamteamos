/**
 * Every month of one client that this person may see — for the client's calendar (2026-10-05).
 *
 * ── Live where it matters, read once where it does not ────────────────────────────────────────
 * The month being worked on is already live in front of the viewer (the month page's own listener, or
 * the board's), and a post ticked off must move on the calendar at once — so those copies win. The
 * rest of the client's months are history: read with one query when the calendar opens
 * (`fetchClientMonths`) and kept for a few minutes, so flipping between List and Calendar does not read
 * them again. A member's board already holds every month they can see, so it asks for no read at all
 * (`fetchHistory: false`). The kept read is dropped when a month is added for the client in this session
 * (`forgetClientMonths`), or when a month on screen points to one the read does not hold (2026-10-05 —
 * an earlier month listed in front of the current one stayed off its calendar for five minutes).
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
/** `links`: the month links (see below) the read was made for — so it is not repeated for the same ones. */
const cache = new Map<string, { at: number; months: SmmCampaign[]; links: string }>();

/** Test hook — the cache outlives a component, so a test starts it clean. */
export function __clearClientMonthsCache() { cache.clear(); }

/**
 * Forget a client's months read earlier in the session — called when a month is added for them (Add SMM
 * sale), so their calendar shows it at once instead of after the few minutes the read is kept for.
 */
export function forgetClientMonths(phoneId: string | null | undefined) {
  if (phoneId) cache.delete(phoneId);
}

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
  /*
    The months this client's live months point to — the month before (`renewalOf`) and after
    (`renewal.nextCampaignId`) — that are not live themselves, as one string. A kept read that holds none
    of one was made before that month existed: an earlier month listed in front of this one (2026-10-05)
    or a renewal, perhaps added by somebody else. Then the read is made again, once for these links.
  */
  const liveIds = live.filter((c) => clientKey && clientKeyOf(c) === clientKey).map((c) => c.id);
  const links = [...new Set(
    live.filter((c) => clientKey && clientKeyOf(c) === clientKey)
      .flatMap((c) => [c.renewalOf, c.renewal?.nextCampaignId])
      .filter((id): id is string => !!id && !liveIds.includes(id)),
  )].sort().join(",");
  const [fetched, setFetched] = useState<SmmCampaign[] | null>(() => (wantsRead ? fresh(phoneId, links) : null));
  const [loading, setLoading] = useState(wantsRead && !fresh(phoneId, links));
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wantsRead) { setFetched(null); setLoading(false); setError(false); return; }
    const hit = fresh(phoneId, links);
    if (hit) { setFetched(hit); setLoading(false); setError(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchClientMonths(phoneId)
      .then((months) => {
        cache.set(phoneId, { at: Date.now(), months, links });
        if (!cancelled) { setFetched(months); setLoading(false); }
      })
      .catch((err) => {
        console.error("[smm] client months:", err);
        if (!cancelled) { setFetched(null); setError(true); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [phoneId, wantsRead, attempt, links]);

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

/**
 * A kept read still good for these links: not too old, and holding every month they point to — or made
 * for exactly these links already (a link to a month the read cannot return must not re-read every time).
 */
function fresh(phoneId: string, links: string): SmmCampaign[] | null {
  const hit = phoneId ? cache.get(phoneId) : undefined;
  if (!hit || Date.now() - hit.at >= HISTORY_TTL_MS) return null;
  const covered = links.split(",").filter(Boolean).every((id) => hit.months.some((c) => c.id === id));
  return covered || hit.links === links ? hit.months : null;
}
