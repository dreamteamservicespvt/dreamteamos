import { useState, useMemo, useEffect, useRef } from "react";
import {
  ClipboardList, Loader2, Search, MessageCircle, UserPlus, X, Clock, ShoppingBag, CheckCircle2, Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreCollection, useFirestoreQuery } from "@/hooks/useFirestore";
import { useNow } from "@/hooks/useNow";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay, getWhatsAppUrl, normalizePhone } from "@/utils/phone";
import { categoryLabel, isAdCategory, categoryBilling } from "@/utils/serviceCatalog";
import { activeOrdersQuery, assignOrderToMember, nextWorkUniqueId, notifyDueOrdersOnOpen } from "@/services/orders";
import { PRICING } from "@/utils/pricing";
import DeadlineChip from "@/components/work/DeadlineChip";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { AppUser, Order, WorkAssignment } from "@/types";
import { DURATIONS, getClipCount } from "@/utils/assignmentDuration";

type OrderTab = "unassigned" | "assigned" | "completed";

function fmtTs(ts: any): string {
  const s = ts?.seconds ?? (typeof ts?.toMillis === "function" ? ts.toMillis() / 1000 : 0);
  return s ? format(new Date(s * 1000), "dd MMM, hh:mm a") : "—";
}

export default function Orders() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const ordersQuery = useMemo(() => activeOrdersQuery(), []);
  const { data: orders, loading } = useFirestoreQuery<Order>(ordersQuery, []);
  const { data: allUsers } = useFirestoreCollection<AppUser>("users");
  const { data: allAssignments } = useFirestoreCollection<WorkAssignment>("work_assignments");
  useNow(30000); // keep deadline chips ticking

  // Tech members: all active for a tech_admin; team-scoped (same creating admin) for a team leader.
  const techMembers = useMemo(() => {
    const base = allUsers.filter((u) => u.role === "tech_member" && u.isActive);
    if (user?.role === "tech_team_leader") return base.filter((u) => u.createdBy === user.createdBy);
    return base;
  }, [allUsers, user]);

  const [tab, setTab] = useState<OrderTab>("unassigned");
  const [search, setSearch] = useState("");

  // One-time deadline sweep when the queue first loads.
  const sweptRef = useRef(false);
  useEffect(() => {
    if (loading || sweptRef.current || orders.length === 0) return;
    sweptRef.current = true;
    notifyDueOrdersOnOpen(orders);
  }, [loading, orders]);

  const counts = useMemo(() => ({
    unassigned: orders.filter((o) => o.status === "unassigned").length,
    assigned: orders.filter((o) => o.status === "assigned").length,
    completed: orders.filter((o) => o.status === "completed").length,
  }), [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return orders
      .filter((o) => o.status === tab)
      .filter((o) => {
        if (!q) return true;
        if (o.businessName?.toLowerCase().includes(q)) return true;
        if (categoryLabel(o.category).toLowerCase().includes(q)) return true;
        if (o.soldByName?.toLowerCase().includes(q)) return true;
        if (qDigits && o.clientPhone?.replace(/\D/g, "").includes(qDigits)) return true;
        return false;
      })
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [orders, tab, search]);

  // ── Assign modal ──────────────────────────────────────────────────────────
  const [assignTarget, setAssignTarget] = useState<Order | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<AppUser | null>(null);
  const [duration, setDuration] = useState("");
  const [price, setPrice] = useState(0);
  const [assigning, setAssigning] = useState(false);

  const openAssign = (order: Order) => {
    setAssignTarget(order);
    setSelectedMember(null);
    setMemberSearch("");
    if (isAdCategory(order.category)) {
      const durs = DURATIONS[order.category] || [];
      const firstDur = durs[0] || "";
      setDuration(firstDur);
      setPrice(PRICING[order.category]?.[firstDur] ?? order.amount ?? 0);
    } else {
      setDuration("");
      setPrice(order.amount ?? 0);
    }
  };

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return techMembers;
    const qDigits = q.replace(/\D/g, "");
    return techMembers.filter((m) => {
      if (m.name.toLowerCase().includes(q)) return true;
      if (qDigits && m.phone) {
        const pd = normalizePhone(m.phone).replace(/\D/g, "");
        if (pd.includes(qDigits)) return true;
      }
      return false;
    });
  }, [techMembers, memberSearch]);

  const confirmAssign = async () => {
    if (!assignTarget || !selectedMember || !user) return;
    setAssigning(true);
    try {
      const ad = isAdCategory(assignTarget.category);
      const clipCount = ad ? getClipCount(duration) : 0;
      const uniqueId = nextWorkUniqueId(assignTarget.category, allAssignments);
      await assignOrderToMember({
        order: assignTarget,
        member: selectedMember,
        assignerUid: user.uid,
        category: assignTarget.category,
        duration: ad ? duration : "—",
        clipCount,
        pricePerUnit: price,
        totalPrice: price,
        uniqueId,
      });
      toast({ title: "Assigned", description: `Order assigned to ${selectedMember.name}.` });
      setAssignTarget(null);
    } catch {
      toast({ title: "Error", description: "Failed to assign order.", variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const memberName = (uid?: string | null) => techMembers.find((m) => m.uid === uid)?.name || allUsers.find((u) => u.uid === uid)?.name || "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 md:p-5 shadow-sm">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <Sparkles className="w-3 h-3" /> Verified sales → delivery
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Orders</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Approved sales waiting to be assigned and delivered by the tech team.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(["unassigned", "assigned", "completed"] as OrderTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs md:text-sm font-medium border transition-colors ${tab === t ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-accent/50"}`}
          >
            <span className="capitalize">{t}</span>
            <span className={`px-1.5 rounded-full text-[10px] ${tab === t ? "bg-primary-foreground/20" : "bg-muted"}`}>{counts[t]}</span>
          </button>
        ))}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search business, category, seller, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {visible.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No {tab} orders</p>
          </div>
        ) : visible.map((o) => (
          <div key={o.id} className="bg-card border rounded-xl p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="font-semibold text-card-foreground text-sm md:text-base truncate">{o.businessName || "Unnamed client"}</h3>
                  <span className="text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">{categoryLabel(o.category)}</span>
                  {categoryBilling(o.category) === "monthly" && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500">Monthly</span>
                  )}
                  <DeadlineChip promise={o.promise} />
                </div>
                <div className="flex flex-wrap gap-x-3 md:gap-x-4 gap-y-1 text-xs md:text-sm text-muted-foreground">
                  <span>Amount: <strong className="text-foreground">{formatCurrency(o.amount)}</strong></span>
                  {o.packageKey && o.packageKey !== "custom" && <span>Package: <strong className="text-foreground">{o.packageKey}</strong></span>}
                  <span>Sold by: <strong className="text-foreground">{o.soldByName}</strong></span>
                  {o.fromAd && <span className="text-info">From ad</span>}
                  <span>Sold: <strong className="text-foreground">{fmtTs(o.createdAt)}</strong></span>
                  {o.promise && <span className="inline-flex items-center gap-1"><Clock size={11} /> Promise: <strong className="text-foreground">{o.promise.label}</strong></span>}
                  {o.status !== "unassigned" && <span>Assigned to: <strong className="text-foreground">{o.assignedToName || memberName(o.assignedTo)}</strong></span>}
                </div>
                {o.clientPhone && (
                  <div className="mt-2">
                    <a href={getWhatsAppUrl(o.clientPhone)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors text-xs font-medium">
                      <MessageCircle className="w-3.5 h-3.5" /> {formatPhoneDisplay(o.clientPhone)}
                    </a>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {o.status === "unassigned" && (
                  <button onClick={() => openAssign(o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                    <UserPlus className="w-3.5 h-3.5" /> Assign
                  </button>
                )}
                {o.status === "assigned" && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg">
                    <ClipboardList className="w-3.5 h-3.5" /> In progress
                  </span>
                )}
                {o.status === "completed" && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Awaiting verify
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Assign modal */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !assigning && setAssignTarget(null)}>
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Assign order</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{assignTarget.businessName || "Unnamed client"} · {categoryLabel(assignTarget.category)} · {formatCurrency(assignTarget.amount)}</p>
              </div>
              <button onClick={() => setAssignTarget(null)} disabled={assigning} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"><X className="w-4 h-4" /></button>
            </div>

            {/* Member picker */}
            <label className="block text-sm font-medium text-muted-foreground mb-1">Assign to</label>
            {selectedMember ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 mb-3">
                <span className="text-sm text-foreground">✓ {selectedMember.name}</span>
                <button onClick={() => setSelectedMember(null)} className="text-xs text-muted-foreground hover:text-foreground">Change</button>
              </div>
            ) : (
              <div className="relative mb-3">
                <input type="text" placeholder="Search member…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20" />
                {memberSearch && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredMembers.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">No members found</div>
                    ) : filteredMembers.map((m) => (
                      <button key={m.uid} type="button" onClick={() => { setSelectedMember(m); setMemberSearch(""); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors text-foreground">{m.name}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Duration (ad categories only) */}
            {isAdCategory(assignTarget.category) && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Duration</label>
                <select value={duration} onChange={(e) => { setDuration(e.target.value); setPrice(PRICING[assignTarget.category]?.[e.target.value] ?? price); }}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20">
                  {(DURATIONS[assignTarget.category] || []).map((d) => (
                    <option key={d} value={d}>{d} ({getClipCount(d)} clips)</option>
                  ))}
                </select>
              </div>
            )}

            {/* Price */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted-foreground mb-1">Tech price (₹)</label>
              <input type="number" min={0} value={price} onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border outline-none focus:ring-2 focus:ring-primary/20" />
            </div>

            <button onClick={confirmAssign} disabled={assigning || !selectedMember}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              <span>{assigning ? "Assigning…" : "Assign & notify member"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
