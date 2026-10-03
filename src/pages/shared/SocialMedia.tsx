/**
 * Social Media Management — every month this person is allowed to see (board redrawn 2026-10-03).
 *
 * ── Why one page for six roles ────────────────────────────────────────────────────────────────
 * A sales member, the members delivering a month, the two admins, the team leader and the Social
 * Media Team Lead are all looking at the same object and asking the same first question: which
 * clients are behind. What differs between them is only WHICH months they can see, and that is
 * answered once in `useSmmCampaigns` rather than by six pages drifting apart.
 *
 * ── The board ─────────────────────────────────────────────────────────────────────────────────
 * Numbers across the top (each opens the pile it counts), then the months as cards in five tabs —
 * the ones nobody is on yet, the running ones, the ones in trouble, the ones whose renewal is due,
 * and the finished ones. The tech side starts from "Add SMM sale"; a salesperson renews from the
 * card. There is no longer a way to start a month with no sale behind it (2026-10-03): every month
 * is somebody's sale, so the salesperson sees it and is paid for it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Megaphone, Plus, Search } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSmmCampaigns } from "@/hooks/useSmmCampaigns";
import { closeEndedMonthsOnOpen, fetchFinishedCampaigns, notifyRenewalsDueOnOpen } from "@/services/smm";
import { isSmmOverseer, isoDay } from "@/utils/smmPlan";
import {
  boardStats, canRenewSmm, canSetUpSmm, cyclePhase, needsAttention, needsSetup, renewalDue,
} from "@/utils/smmPackage";
import { overdueItemsFor } from "@/utils/smmReminders";
import SmmCampaignCard from "@/components/smm/SmmCampaignCard";
import SmmAddSaleDialog from "@/components/smm/SmmAddSaleDialog";
import SmmTeamLeadPanel from "@/components/smm/SmmTeamLeadPanel";
import SmmBoardStats, { type SmmBoardTab } from "@/components/smm/SmmBoardStats";
import { SmmSetupDialog } from "@/components/smm/SmmSetupForm";
import { ToneLegend } from "@/components/smm/SmmVisuals";
import { useSmmRenewal } from "@/components/smm/useSmmRenewal";
import type { SmmCampaign } from "@/types/smm";

const TABS: { key: SmmBoardTab; label: string }[] = [
  { key: "setup", label: "Needs setup" },
  { key: "active", label: "Running" },
  { key: "attention", label: "Needs attention" },
  { key: "renewals", label: "Renewals" },
  { key: "done", label: "Finished" },
];

const onTeam = (c: SmmCampaign, uid: string) =>
  [c.team?.creator?.uid, c.team?.publisher?.uid, c.team?.marketer?.uid, ...(c.team?.assistants || []).map((a) => a.uid)]
    .includes(uid);

export default function SocialMedia() {
  const user = useAuthStore((s) => s.user);
  const { campaigns, loading } = useSmmCampaigns(user);
  const today = isoDay(new Date());
  const navigate = useNavigate();
  const overseer = isSmmOverseer(user);
  const canSetUp = canSetUpSmm(user);
  const isSeller = user?.role === "sales_member";
  const [tab, setTab] = useState<SmmBoardTab>("active");
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
    if (tab !== "done" || !overseer || finished) return;
    fetchFinishedCampaigns().then(setFinished);
  }, [tab, overseer, finished]);

  const live = useMemo(() => campaigns.filter((c) => c.status === "active"), [campaigns]);
  const doneList = useMemo(
    () => (overseer ? (finished || []) : campaigns.filter((c) => c.status !== "active")),
    [overseer, finished, campaigns],
  );

  const inTab = (c: SmmCampaign, key: SmmBoardTab): boolean => {
    switch (key) {
      case "setup": return needsSetup(c, today);
      case "attention": return needsAttention(c, today);
      case "renewals": return renewalDue(c, today);
      case "active": return c.status === "active" && !c.history && cyclePhase(c.cycle, today) !== "ended";
      default: return c.status !== "active" || !!c.history;
    }
  };

  const base = tab === "done" ? doneList : live;
  const counts = useMemo(() => Object.fromEntries(TABS.map(({ key }) => [
    key,
    key === "done" ? (overseer && !finished ? null : doneList.length) : live.filter((c) => inTab(c, key)).length,
  ])) as Record<SmmBoardTab, number | null>, [live, doneList, overseer, finished, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // The people to filter by, from the months in front of the viewer.
  const members = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of base) {
      for (const p of [c.team?.creator, c.team?.publisher, c.team?.marketer, ...(c.team?.assistants || [])]) {
        if (p?.uid) map.set(p.uid, p.name);
      }
    }
    return [...map.entries()].map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [base]);
  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of base) if (c.soldBy) map.set(c.soldBy, c.soldByName);
    return [...map.entries()].map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [base]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return base
      .filter((c) => inTab(c, tab))
      .filter((c) => !memberFilter || onTeam(c, memberFilter))
      .filter((c) => !sellerFilter || c.soldBy === sellerFilter)
      .filter((c) => !q || `${c.businessName} ${c.clientName} ${c.soldByName} ${c.clientPhone}`.toLowerCase().includes(q))
      .sort((a, b) => (tab === "done"
        ? (b.cycle?.startDate || "").localeCompare(a.cycle?.startDate || "")
        : (a.cycle?.endDate || "").localeCompare(b.cycle?.endDate || "")));
  }, [base, tab, search, memberFilter, sellerFilter, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => boardStats(live, today), [live, today]);
  const myLate = user ? overdueItemsFor(campaigns, user.uid, today).length : 0;

  const empty: Record<SmmBoardTab, string> = {
    setup: "Every month has a team on it.",
    active: canSetUp
      ? "No social media months running. A month appears the moment a sale is recorded — or add a salesperson's sale with Add SMM sale."
      : "No social media months running. They appear here the moment one is sold.",
    attention: "Nothing needs chasing. Every month is on schedule.",
    renewals: "No renewals due in the next five days.",
    done: "No finished months yet.",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
            <Megaphone className="text-primary" size={22} /> Social Media Management
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {myLate > 0
              ? `${myLate} of your posts ${myLate === 1 ? "is" : "are"} past its date.`
              : "Every monthly client, what they were promised, and where it has got to."}
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

      {!loading && <SmmBoardStats stats={stats} showMoney={overseer || isSeller} onPick={setTab} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-border bg-card p-0.5">
          {TABS.map(({ key, label }) => (
            <button key={key} data-test={`smm-tab-${key}`} onClick={() => setTab(key)}
              className={`h-8 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}>
              {label}{counts[key] !== null ? <span className="ml-1 opacity-70">{counts[key]}</span> : null}
            </button>
          ))}
        </div>
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} data-test="smm-search" onChange={(e) => setSearch(e.target.value)}
            placeholder="Client, business or number"
            className="h-8 w-full rounded-xl border border-border bg-card pl-8 pr-3 text-xs text-foreground outline-none focus:border-primary" />
        </div>
        {members.length > 1 && (
          <select value={memberFilter} data-test="smm-filter-member" onChange={(e) => setMemberFilter(e.target.value)}
            className="h-8 rounded-xl border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary">
            <option value="">Every member</option>
            {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
          </select>
        )}
        {!isSeller && sellers.length > 1 && (
          <select value={sellerFilter} data-test="smm-filter-seller" onChange={(e) => setSellerFilter(e.target.value)}
            className="h-8 rounded-xl border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary">
            <option value="">Every salesperson</option>
            {sellers.map((s) => <option key={s.uid} value={s.uid}>{s.name}</option>)}
          </select>
        )}
      </div>

      <ToneLegend />

      {loading || (tab === "done" && overseer && !finished) ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
      ) : shown.length === 0 ? (
        <p data-test="smm-empty" className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {empty[tab]}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <SmmCampaignCard
              key={c.id}
              campaign={c}
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
