import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, Loader2, Search, MessageCircle, UserPlus, Clock, ShoppingBag, CheckCircle2, Sparkles, StickyNote, Hourglass, Sparkle, Trash2, CheckSquare, Square,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery, useFirestoreCollection } from "@/hooks/useFirestore";
import { useNow } from "@/hooks/useNow";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay, getWhatsAppUrl } from "@/utils/phone";
import { categoryLabel, categoryBilling } from "@/utils/serviceCatalog";
import { activeOrdersQuery, notifyDueOrdersOnOpen, findReconcilableOrders, reconcileManualOrders, deleteOrders } from "@/services/orders";
import { requirementSummary } from "@/utils/adRequirement";
import { useToast } from "@/hooks/use-toast";
import { useViewMode } from "@/hooks/useViewMode";
import ViewToggle from "@/components/common/ViewToggle";
import DeadlineChip from "@/components/work/DeadlineChip";
import { format } from "date-fns";
import type { Order, WorkAssignment } from "@/types";

type OrderTab = "unassigned" | "assigned" | "completed";

function fmtTs(ts: any): string {
  const s = ts?.seconds ?? (typeof ts?.toMillis === "function" ? ts.toMillis() / 1000 : 0);
  return s ? format(new Date(s * 1000), "dd MMM, hh:mm a") : "—";
}

export default function Orders() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const ordersQuery = useMemo(() => activeOrdersQuery(), []);
  const { data: orders, loading } = useFirestoreQuery<Order>(ordersQuery, []);
  const { data: assignments } = useFirestoreCollection<WorkAssignment>("work_assignments");
  useNow(30000); // keep deadline chips ticking

  // Assigning happens on Work Assign, where the sales member's brief pre-fills the whole form —
  // an admin can adjust anything before it goes out instead of re-typing it into a second modal.
  const workAssignBase = user?.role === "tech_team_leader" ? "/team-leader/work-assign" : "/tech-admin/work-assign";

  const [tab, setTab] = useState<OrderTab>("unassigned");
  const [search, setSearch] = useState("");
  const [view, setView] = useViewMode("orders");

  // Manual selection → delete, with a confirmation step. Selections are cleared whenever the
  // visible set changes (tab / search), so you can never delete something you can't see.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { setSelected(new Set()); }, [tab, search]);
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Orders that duplicate work the team already did by hand — offered as a one-click cleanup so the
  // queue reflects what's actually outstanding, not the backlog of already-delivered manual jobs.
  const reconcilable = useMemo(() => findReconcilableOrders(orders, assignments), [orders, assignments]);
  const [cleaning, setCleaning] = useState(false);
  const [confirmClean, setConfirmClean] = useState(false);
  const runCleanup = async () => {
    setCleaning(true);
    try {
      const n = await reconcileManualOrders(reconcilable);
      toast({ title: "Queue cleaned up", description: `${n} order${n === 1 ? "" : "s"} already handled manually were cleared.` });
      setConfirmClean(false);
    } catch {
      toast({ title: "Error", description: "Couldn't clean up the queue. Try again.", variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  };

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

  // Select-all operates on exactly what's on screen (current tab + search).
  const visibleIds = useMemo(() => visible.map((o) => o.id), [visible]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected((prev) => {
    if (visibleIds.every((id) => prev.has(id))) {
      const next = new Set(prev);
      visibleIds.forEach((id) => next.delete(id));
      return next;
    }
    return new Set([...prev, ...visibleIds]);
  });

  const runDelete = async () => {
    setDeleting(true);
    try {
      const ids = [...selected];
      const n = await deleteOrders(ids);
      toast({ title: "Deleted", description: `${n} order${n === 1 ? "" : "s"} removed from the queue.` });
      setSelected(new Set());
      setConfirmDelete(false);
    } catch {
      toast({ title: "Error", description: "Couldn't delete the selected orders. Try again.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 md:p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              <Sparkles className="w-3 h-3" /> Sales → delivery
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Orders</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Every sale lands here to be assigned and delivered — no approval needed to start.</p>
          </div>
          {/* One-click cleanup for orders that duplicate manually-done work. */}
          {reconcilable.length > 0 && (
            <button
              onClick={() => setConfirmClean(true)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
              title="Remove unassigned orders that already have matching work done in Work Assign">
              <Sparkle className="w-3.5 h-3.5" /> Clean up already-done ({reconcilable.length})
            </button>
          )}
        </div>
      </div>

      {/* Cleanup confirmation */}
      {confirmClean && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !cleaning && setConfirmClean(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15">
              <Sparkle className="h-5 w-5 text-amber-500" />
            </div>
            <h3 className="text-center text-lg font-semibold text-foreground">Clean up the queue?</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              <strong className="text-foreground">{reconcilable.length}</strong> unassigned order{reconcilable.length === 1 ? "" : "s"} already
              {" "}have matching work in Work Assign — the tech team did them by hand before the Orders queue existed.
              They'll be marked done and removed from here. Nothing else is affected.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button onClick={() => setConfirmClean(false)} disabled={cleaning}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                Cancel
              </button>
              <button onClick={runCleanup} disabled={cleaning}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50">
                {cleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkle className="h-4 w-4" />}
                {cleaning ? "Cleaning…" : `Remove ${reconcilable.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

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
        <ViewToggle mode={view} onChange={setView} />
      </div>

      {/* Selection toolbar — select all on screen, or pick individually, then delete. */}
      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={toggleAll}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-card text-xs md:text-sm font-medium text-foreground transition-colors hover:bg-accent/50">
            {allVisibleSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
            {allVisibleSelected ? "Clear selection" : `Select all (${visible.length})`}
          </button>
          {selected.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <button onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-destructive/40 bg-destructive/10 text-xs md:text-sm font-medium text-destructive transition-colors hover:bg-destructive/20">
                <Trash2 className="w-3.5 h-3.5" /> Delete selected ({selected.size})
              </button>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <h3 className="text-center text-lg font-semibold text-foreground">Delete {selected.size} order{selected.size === 1 ? "" : "s"}?</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {tab === "unassigned"
                ? "These orders will be permanently removed and won't come back — even if the sale is verified again. This can't be undone."
                : "These orders will be permanently removed and won't come back, even if the sale is verified again. Any work already assigned stays in Work Done & Reports — only the order entry is deleted. This can't be undone."}
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                Cancel
              </button>
              <button onClick={runDelete} disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-50">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? "Deleting…" : `Delete ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List / grid */}
      <div className={view === "grid" ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : "space-y-3"}>
        {visible.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground lg:col-span-2">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No {tab} orders</p>
          </div>
        ) : visible.map((o) => (
          <div key={o.id} className={`bg-card border rounded-xl p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow ${selected.has(o.id) ? "border-primary/60 ring-1 ring-primary/30" : ""}`}>
            <div className="flex items-start gap-3">
              {/* Per-order select checkbox */}
              <button onClick={() => toggleOne(o.id)} aria-label={selected.has(o.id) ? "Deselect order" : "Select order"}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors">
                {selected.has(o.id) ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5" />}
              </button>
              <div className="flex flex-1 min-w-0 flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="font-semibold text-card-foreground text-sm md:text-base truncate">{o.businessName || "Unnamed client"}</h3>
                  <span className="text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">{categoryLabel(o.category)}</span>
                  {categoryBilling(o.category) === "monthly" && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500">Monthly</span>
                  )}
                  {/* Approval isn't a gate anymore, but the tech team should still see which sales
                      the sales admin hasn't signed off on yet. */}
                  {o.saleVerified === false && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400" title="The sales admin hasn't verified this sale yet">
                      <Hourglass size={9} /> Pending approval
                    </span>
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
                  {o.status !== "unassigned" && o.assignedToName && <span>Assigned to: <strong className="text-foreground">{o.assignedToName}</strong></span>}
                </div>

                {/* The client's brief, exactly as the sales member captured it. */}
                {requirementSummary(o.requirement).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {requirementSummary(o.requirement).map((chip) => (
                      <span key={chip} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{chip}</span>
                    ))}
                  </div>
                )}
                {o.requirement?.notes && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <StickyNote size={11} className="mt-0.5 shrink-0" />
                    <span className="whitespace-pre-wrap">{o.requirement.notes}</span>
                  </p>
                )}

                {/* Update notes the sales member sent after the order was assigned. */}
                {!!o.updateNotes?.length && (
                  <div className="mt-2 space-y-1 rounded-lg border border-blue-500/25 bg-blue-500/5 p-2">
                    <p className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                      <MessageCircle size={10} /> Client updates ({o.updateNotes.length})
                    </p>
                    {o.updateNotes.map((n, i) => (
                      <p key={i} className="text-xs text-foreground">
                        <span className="whitespace-pre-wrap">{n.text}</span>
                        <span className="ml-1 text-[10px] text-muted-foreground">— {n.byName || "sales"} · {fmtTs(n.at)}</span>
                      </p>
                    ))}
                  </div>
                )}

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
                  <button onClick={() => navigate(`${workAssignBase}?order=${encodeURIComponent(o.id)}`)}
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
          </div>
        ))}
      </div>

    </div>
  );
}
