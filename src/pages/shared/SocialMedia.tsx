/**
 * Social Media Management — every month this person is allowed to see (redrawn 2026-10-04).
 *
 * ── Why one page for six roles ────────────────────────────────────────────────────────────────
 * A sales member, the members delivering a month, the two admins, the team leader and the Social
 * Media Team Lead are all looking at the same object and asking the same first question: which
 * clients are behind. What differs between them is only WHICH months they can see, and that is
 * answered once in `useSmmCampaigns` rather than by six pages drifting apart.
 *
 * ── One clear card per client (2026-10-04) ────────────────────────────────────────────────────
 * The owner found the charts hard to read and asked for each month to be clear in a single card. So
 * the page is the cards (SmmCampaignCard): each says in everyday words whether the month is On track,
 * At risk or Off track and why, shows every promised post in one ring, each kind's count, the days
 * left and the next post. Above them, the same statuses as a row of counts that filter the cards —
 * All, Off track, At risk, On track, Needs setup, Renewals due, Finished — worst first. The charts
 * (components/smm/SmmDashboard) are still one switch away, as Insights, for whoever wants them; the
 * choice is remembered per browser, and the member and salesperson filters scope both.
 *
 * The tech side starts from "Add SMM sale"; a salesperson renews from the card. Every month is
 * somebody's sale (2026-10-03), so the salesperson sees it and is paid for it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, Archive, BarChart3, CheckCircle2, LayoutGrid, Loader2, Megaphone, Plus, RefreshCcw, Search,
  TrendingDown, UserPlus, Users,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSmmCampaigns } from "@/hooks/useSmmCampaigns";
import { closeEndedMonthsOnOpen, fetchFinishedCampaigns, notifyRenewalsDueOnOpen } from "@/services/smm";
import { isSmmOverseer, isoDay } from "@/utils/smmPlan";
import { canRenewSmm, canSetUpSmm, needsSetup, renewalDue } from "@/utils/smmPackage";
import { byGlanceUrgency, monthGlance, type SmmGlance } from "@/utils/smmGlance";
import { overdueItemsFor } from "@/utils/smmReminders";
import SmmCampaignCard from "@/components/smm/SmmCampaignCard";
import SmmAddSaleDialog from "@/components/smm/SmmAddSaleDialog";
import SmmTeamLeadPanel from "@/components/smm/SmmTeamLeadPanel";
import SmmDashboard, { type SmmBoardFilter } from "@/components/smm/SmmDashboard";
import { SmmSetupDialog } from "@/components/smm/SmmSetupForm";
import { useSmmRenewal } from "@/components/smm/useSmmRenewal";
import type { SmmCampaign } from "@/types/smm";

/** The status row: each a count and a filter. `icon` carries the colour; the words never do. */
const FILTERS: { key: SmmBoardFilter; label: string; Icon: LucideIcon; icon: string }[] = [
  { key: "all", label: "All clients", Icon: Users, icon: "text-muted-foreground" },
  { key: "off", label: "Off track", Icon: AlertTriangle, icon: "text-viz-late" },
  { key: "risk", label: "At risk", Icon: TrendingDown, icon: "text-viz-wait" },
  { key: "ok", label: "On track", Icon: CheckCircle2, icon: "text-viz-done" },
  { key: "setup", label: "Needs setup", Icon: UserPlus, icon: "text-viz-wait" },
  { key: "renewals", label: "Renewals due", Icon: RefreshCcw, icon: "text-viz-ready" },
  { key: "done", label: "Finished", Icon: Archive, icon: "text-muted-foreground" },
];

const onTeam = (c: SmmCampaign, uid: string) =>
  [c.team?.creator?.uid, c.team?.publisher?.uid, c.team?.marketer?.uid, ...(c.team?.assistants || []).map((a) => a.uid)]
    .includes(uid);

type View = "cards" | "insights";
/** Which view this browser last used — a convenience, so it may be missing or unreadable. */
const VIEW_KEY = "dts_smm_view";
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "insights" ? "insights" : "cards";
  } catch {
    return "cards";
  }
}

export default function SocialMedia() {
  const user = useAuthStore((s) => s.user);
  const { campaigns, loading } = useSmmCampaigns(user);
  const today = isoDay(new Date());
  const navigate = useNavigate();
  const overseer = isSmmOverseer(user);
  const canSetUp = canSetUpSmm(user);
  const isSeller = user?.role === "sales_member";
  const [view, setView] = useState<View>(readView);
  const [filter, setFilter] = useState<SmmBoardFilter>("all");
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [settingUp, setSettingUp] = useState<SmmCampaign | null>(null);
  const [finished, setFinished] = useState<SmmCampaign[] | null>(null);
  const { renew, renewingId } = useSmmRenewal(user);

  /*
    Months past their last day that have a decision behind them — renewed, or not renewing — are filed
    away when an overseer opens the board. There is no scheduler; this is the same on-open sweep the
    order deadlines use. Once per visit.
  */
  const swept = useRef(false);
  useEffect(() => {
    if (!overseer || loading || swept.current || campaigns.length === 0) return;
    swept.current = true;
    closeEndedMonthsOnOpen(campaigns, today).catch(() => undefined);
  }, [overseer, loading, campaigns, today]);

  // The salesperson's renewal bells — once per month per day, however often they open the board.
  const rang = useRef(false);
  useEffect(() => {
    if (!isSeller || !user || loading || rang.current) return;
    rang.current = true;
    notifyRenewalsDueOnOpen(campaigns, user, today).catch(() => undefined);
  }, [isSeller, user, loading, campaigns, today]);

  // Overseers read only the running months live; the finished ones are read when asked for.
  useEffect(() => {
    if (view !== "cards" || filter !== "done" || !overseer || finished) return;
    fetchFinishedCampaigns().then(setFinished);
  }, [view, filter, overseer, finished]);

  const pickView = (v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* private window — the default is fine */ }
  };
  // A tile on Insights opens the cards it counts.
  const openFilter = (f: SmmBoardFilter) => {
    setFilter(f);
    pickView("cards");
  };

  const scope = (c: SmmCampaign) =>
    (!memberFilter || onTeam(c, memberFilter)) && (!sellerFilter || c.soldBy === sellerFilter);

  const live = useMemo(() => campaigns.filter((c) => c.status === "active" && !c.history), [campaigns]);
  const doneList = useMemo(
    () => (overseer ? (finished || []) : campaigns.filter((c) => c.status !== "active" || c.history)),
    [overseer, finished, campaigns],
  );

  // Every card's status, worked out once — the counts, the filters and the order all read it.
  const withGlance = useMemo(
    () => live.map((c) => ({ c, glance: monthGlance(c, today) })),
    [live, today],
  );
  const scoped = useMemo(() => withGlance.filter(({ c }) => scope(c)), [withGlance, memberFilter, sellerFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const inFilter = (x: { c: SmmCampaign; glance: SmmGlance }, key: SmmBoardFilter): boolean => {
    switch (key) {
      case "off": return x.glance.status === "off_track";
      case "risk": return x.glance.status === "at_risk";
      case "ok": return x.glance.status === "on_track" || x.glance.status === "done";
      case "setup": return needsSetup(x.c, today);
      case "renewals": return renewalDue(x.c, today);
      default: return true;
    }
  };

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(({ key }) => [
    key,
    key === "done"
      ? (overseer && !finished ? null : doneList.filter(scope).length)
      : scoped.filter((x) => inFilter(x, key)).length,
  ])) as Record<SmmBoardFilter, number | null>, [scoped, doneList, overseer, finished, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // The people to filter by, from the months in front of the viewer.
  const pool = filter === "done" ? doneList : live;
  const members = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of pool) {
      for (const p of [c.team?.creator, c.team?.publisher, c.team?.marketer, ...(c.team?.assistants || [])]) {
        if (p?.uid) map.set(p.uid, p.name);
      }
    }
    return [...map.entries()].map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pool]);
  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of pool) if (c.soldBy) map.set(c.soldBy, c.soldByName);
    return [...map.entries()].map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pool]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (c: SmmCampaign) => !q || `${c.businessName} ${c.clientName} ${c.soldByName} ${c.clientPhone}`.toLowerCase().includes(q);
    if (filter === "done") {
      return doneList.filter(scope).filter(match)
        .sort((a, b) => (b.cycle?.startDate || "").localeCompare(a.cycle?.startDate || ""))
        .map((c) => ({ c, glance: monthGlance(c, today) }));
    }
    return byGlanceUrgency(scoped.filter((x) => inFilter(x, filter) && match(x.c)));
  }, [scoped, doneList, filter, search, today, memberFilter, sellerFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const myLate = user ? overdueItemsFor(campaigns, user.uid, today).length : 0;

  const empty: Record<SmmBoardFilter, string> = {
    all: canSetUp
      ? "No social media months running. A month appears the moment a sale is recorded — or add a salesperson's sale with Add SMM sale."
      : "No social media months running. They appear here the moment one is sold.",
    off: "No client is off track. Nothing is late.",
    risk: "No client is behind schedule.",
    ok: "No client is on track right now — see Off track and At risk.",
    setup: "Every month has a team on it.",
    renewals: "No renewals due in the next five days.",
    done: "No finished months yet.",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
            <Megaphone className="text-primary" size={22} /> Social Media Management
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {myLate > 0
              ? `${myLate} of your posts ${myLate === 1 ? "is" : "are"} past its date.`
              : "Every monthly client — how much is done, whether it is on track, and what is next."}
          </p>
        </div>
        {canSetUp && (
          <button data-test="smm-add-sale-open" onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            <Plus size={15} /> Add SMM sale
          </button>
        )}
      </div>

      {/* Who runs the whole side — appointed here by the tech admin (SmmTeamLeadPanel). */}
      {user && overseer && <SmmTeamLeadPanel user={user} />}

      {view === "cards" && !loading && (
        /* The statuses as counts — each one filters the cards below. */
        <div data-test="smm-status-filters" role="tablist" aria-label="Show clients"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-7">
          {FILTERS.filter((f) => f.key !== "setup" || (counts.setup ?? 0) > 0 || filter === "setup").map(({ key, label, Icon, icon }) => {
            const on = filter === key;
            const n = counts[key];
            return (
              <button key={key} type="button" role="tab" aria-selected={on} data-test={`smm-tab-${key}`}
                onClick={() => setFilter(key)}
                className={`flex min-w-[8.5rem] shrink-0 flex-col items-start rounded-2xl border px-3.5 py-3 text-left transition-all sm:min-w-0 ${
                  on ? "border-foreground/30 bg-card shadow-sm ring-1 ring-foreground/15" : "border-border bg-card/60 hover:border-foreground/20 hover:bg-card"
                }`}>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                  <Icon size={14} className={icon} /> {label}
                </span>
                <span data-test={`smm-count-${key}`} className="mt-1.5 text-2xl font-semibold leading-none tracking-tight text-foreground">
                  {n === null ? <span className="text-sm font-medium text-muted-foreground">View</span> : n}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search, the people filters, and the view — one row, above the content they scope. */}
      <div className="flex flex-wrap items-center gap-2">
        {view === "cards" && (
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} data-test="smm-search" onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, business or number"
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary" />
          </div>
        )}
        <div className={`flex flex-wrap items-center gap-2 ${view === "cards" ? "" : "flex-1"}`}>
          {members.length > 1 && (
            <select value={memberFilter} data-test="smm-filter-member" onChange={(e) => setMemberFilter(e.target.value)}
              aria-label="Filter by member"
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary">
              <option value="">Every member</option>
              {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
            </select>
          )}
          {!isSeller && sellers.length > 1 && (
            <select value={sellerFilter} data-test="smm-filter-seller" onChange={(e) => setSellerFilter(e.target.value)}
              aria-label="Filter by salesperson"
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary">
              <option value="">Every salesperson</option>
              {sellers.map((s) => <option key={s.uid} value={s.uid}>{s.name}</option>)}
            </select>
          )}
        </div>
        <div role="tablist" aria-label="View" className="ml-auto inline-flex rounded-xl border border-border bg-muted/60 p-1">
          {([
            { key: "cards" as const, label: "Cards", Icon: LayoutGrid },
            { key: "insights" as const, label: "Insights", Icon: BarChart3 },
          ]).map(({ key, label, Icon }) => (
            <button key={key} type="button" role="tab" aria-selected={view === key} data-test={`smm-view-${key}`}
              onClick={() => pickView(key)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all ${
                view === key ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === "insights" ? (
        loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
        ) : (
          <SmmDashboard
            campaigns={live.filter(scope)}
            today={today}
            showMoney={overseer || isSeller}
            showTeam={overseer}
            onPick={openFilter}
            onAddSale={canSetUp ? () => setAdding(true) : undefined}
          />
        )
      ) : loading || (filter === "done" && overseer && !finished) ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
      ) : shown.length === 0 ? (
        <p data-test="smm-empty" className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {search.trim() ? "No client matches that search." : empty[filter]}
        </p>
      ) : (
        /* As many columns as fit cards of at least 340px — the card is built for that width. */
        <div data-test="smm-cards" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr))]">
          {shown.map(({ c, glance }) => (
            <SmmCampaignCard
              key={c.id}
              campaign={c}
              glance={glance}
              viewerUid={user?.uid}
              onSetUp={canSetUp ? setSettingUp : undefined}
              onRenew={user && canRenewSmm(c, user) ? renew : undefined}
              renewing={renewingId === c.id}
            />
          ))}
        </div>
      )}

      {adding && user && (
        <SmmAddSaleDialog user={user} onClose={() => setAdding(false)}
          onCreated={(id) => { setAdding(false); navigate(`/smm/${id}`); }} />
      )}
      {settingUp && user && (
        <SmmSetupDialog campaign={settingUp} user={user} onClose={() => setSettingUp(null)} />
      )}
    </div>
  );
}
