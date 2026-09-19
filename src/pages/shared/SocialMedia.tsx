/**
 * Social Media Management — every month this person is allowed to see.
 *
 * ── Why one page for six roles ────────────────────────────────────────────────────────────────
 * A sales member, the two members delivering the month, their junior, the two admins, the team
 * leader and the SMM leader are all looking at the same object and asking the same first question:
 * which clients are behind. What differs between them is only WHICH months they can see, and that
 * is answered once in `useSmmCampaigns` rather than by six pages drifting apart — which is exactly
 * what happened to Work Assign, where the admin's and the team leader's copies are still
 * near-duplicate files.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Megaphone, Search, Plus } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSmmCampaigns } from "@/hooks/useSmmCampaigns";
import { clientWaitSummary, fulfilment, isSmmOverseer, isoDay } from "@/utils/smmPlan";
import { overdueItemsFor } from "@/utils/smmReminders";
import SmmCampaignCard from "@/components/smm/SmmCampaignCard";
import SmmNewCampaignDialog from "@/components/smm/SmmNewCampaignDialog";
import type { SmmCampaign } from "@/types/smm";

type Tab = "active" | "attention" | "done";

export default function SocialMedia() {
  const user = useAuthStore((s) => s.user);
  const { campaigns, loading } = useSmmCampaigns(user);
  const today = isoDay(new Date());
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  /**
   * Who may start a month by hand.
   *
   * The SMM leader, the two admins and the tech team leader — the people a client who comes to
   * us directly actually reaches. A sales member records the same thing as a sale, which is
   * right: theirs comes with a commission and an order, and this one deliberately does not.
   */
  const canCreate = isSmmOverseer(user);

  /**
   * "Needs attention" is the tab this page exists for.
   *
   * A month is on it when something is actually late, when the client is sitting on an approval, or
   * when nobody has been put on it at all. Those are the three ways a retainer quietly fails, and
   * all three are invisible on a list sorted by date.
   */
  const needsAttention = (c: SmmCampaign): boolean => {
    if (c.status !== "active") return false;
    const late = c.items.some((i) => i.uploadDate && i.status !== "posted" && i.uploadDate < today);
    const waiting = clientWaitSummary(c.items).openCount > 0;
    const unassigned = !c.team.creator && !c.team.publisher && !c.team.marketer;
    return late || waiting || unassigned;
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns
      .filter((c) => (tab === "done" ? c.status !== "active" : tab === "attention" ? needsAttention(c) : c.status === "active"))
      .filter((c) => !q || `${c.businessName} ${c.clientName} ${c.soldByName}`.toLowerCase().includes(q));
  }, [campaigns, tab, search, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({
    active: campaigns.filter((c) => c.status === "active").length,
    attention: campaigns.filter(needsAttention).length,
    done: campaigns.filter((c) => c.status !== "active").length,
  }), [campaigns, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const myLate = user ? overdueItemsFor(campaigns, user.uid, today).length : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
          <Megaphone className="text-primary" size={22} /> Social Media Management
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {myLate > 0
            ? `${myLate} of your posts ${myLate === 1 ? "is" : "are"} past its date.`
            : "Every monthly client, what they were promised, and where it has got to."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canCreate && (
          <button
            data-test="smm-new"
            onClick={() => setCreating(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={14} /> Start a month
          </button>
        )}
        <div className="inline-flex rounded-xl border border-border bg-card p-0.5">
          {([
            { key: "active" as const, label: "Running" },
            { key: "attention" as const, label: "Needs attention" },
            { key: "done" as const, label: "Finished" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              data-test={`smm-tab-${key}`}
              onClick={() => setTab(key)}
              className={`h-8 rounded-lg px-3 text-xs font-medium transition-colors ${
                tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {label} <span className="opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            data-test="smm-search"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Client or business"
            className="h-8 w-full rounded-xl border border-border bg-card pl-8 pr-3 text-xs text-foreground outline-none focus:border-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
      ) : shown.length === 0 ? (
        <p data-test="smm-empty" className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {tab === "attention"
            ? "Nothing needs chasing. Every month is on schedule."
            : tab === "done"
              ? "No finished months yet."
              : canCreate
                ? "No social media months running. One appears the moment a sale is made — or start one here for a client who came to us directly."
                : "No social media months running. They appear here the moment one is sold."}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => <SmmCampaignCard key={c.id} campaign={c} viewerUid={user?.uid} />)}
        </div>
      )}

      {creating && user && (
        <SmmNewCampaignDialog
          user={user}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); navigate(`/smm/${id}`); }}
        />
      )}
    </div>
  );
}
