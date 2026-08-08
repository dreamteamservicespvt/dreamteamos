import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, Loader2, Search, MessageCircle, UserPlus, Clock, ShoppingBag, CheckCircle2, Sparkles, StickyNote, Hourglass, Sparkle, Trash2, CheckSquare, Square, Undo2, Copy, Check, Pin, Split, AlertTriangle, Layers, X, Archive, RotateCcw, History, ShieldAlert, Lock, Star,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery, useFirestoreCollection } from "@/hooks/useFirestore";
import { useNow } from "@/hooks/useNow";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay, getWhatsAppUrl } from "@/utils/phone";
import { categoryBilling, bulkCategoryLabel, categoryLabel } from "@/utils/serviceCatalog";
import {
  activeOrdersQuery, notifyDueOrdersOnOpen, findReconcilableOrders, reconcileManualOrders,
  deleteOrders, restoreOrders, revertOrderToUnassigned, fetchOrderHistory, orderExitReason,
  isRestorableOrder, purgeOrders, canPurgeOrders, ORDER_HISTORY_PAGE,
} from "@/services/orders";
import { verifyAssignments } from "@/services/workVerify";
import { requirementSummary } from "@/utils/adRequirement";
import { useToast } from "@/hooks/use-toast";
import { useViewMode } from "@/hooks/useViewMode";
import { useOrderCategory } from "@/hooks/useOrderCategory";
import ViewToggle from "@/components/common/ViewToggle";
import DeadlineChip from "@/components/work/DeadlineChip";
import { format } from "date-fns";
import type { AppUser, Order, WorkAssignment } from "@/types";

import { sortOrders, countOverdue, ORDER_SORT_OPTIONS, type OrderSortMode } from "@/utils/orderSort";
import { hourBucketKey, hourBucketLabel } from "@/utils/orderHours";

import {
  ORDER_QUEUE_TABS, assignmentsByOrderId, orderAssignee, orderQueueStatus, type OrderQueueStatus,
} from "@/utils/orderQueue";
import { unassignWork } from "@/services/workAssign";
import { buildAdPipeline, orderBacked } from "@/utils/adPipeline";
import { isPinnedOrder, progressSummary } from "@/utils/orderProgress";
import { ordersWithPenalties, totalPenalties } from "@/utils/penalty";
import { removeOrderPenalty } from "@/services/orders";
import { discountEditLabel } from "@/utils/bulkDiscount";
import {
  ALL_ORDER_CATEGORIES, matchesOrderCategory, orderCategoryOptionLabel,
  orderCategoryOptions,
} from "@/utils/orderCategoryFilter";
import OrderProgressPanel from "@/components/work/OrderProgressPanel";
import PenaltyDialog from "@/components/work/PenaltyDialog";
import AssignTracksDialog from "@/components/work/AssignTracksDialog";

/**
 * The queue's four delivery columns, the money-changes ledger that hangs off them, and the two
 * history columns.
 *
 * History is the fix for the queue's oldest hole: an order that reached the end of the pipeline
 * simply stopped existing here. `activeOrdersQuery` asks Firestore for three statuses, so 91% of
 * every order ever taken — everything delivered, everything the "already done" sweep retired,
 * everything an admin deleted — was not merely filtered out of the page, it was never fetched. The
 * only honest answer to "where did my order go?" was that nobody could tell you.
 */
type OrderTab = OrderQueueStatus | "changes" | "delivered" | "removed";

/** Delivered and Removed read from a separate, on-demand fetch — not the live active query. */
const HISTORY_TABS: OrderTab[] = ["delivered", "removed"];

function tsSeconds(ts: any): number {
  return ts?.seconds ?? (typeof ts?.toMillis === "function" ? ts.toMillis() / 1000 : 0);
}

function fmtTs(ts: any): string {
  const s = tsSeconds(ts);
  return s ? format(new Date(s * 1000), "dd MMM, hh:mm a") : "—";
}

/** Why an order left the queue, said in the words the team uses — and who to ask about it. */
const EXIT_META: Record<string, { label: string; className: string }> = {
  delivered: { label: "Delivered & verified", className: "bg-green-500/15 text-green-600 dark:text-green-400" },
  swept: { label: "Cleared as already-done", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  deleted: { label: "Deleted from the queue", className: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelled (sale reverted)", className: "bg-muted text-muted-foreground" },
};

export default function Orders() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const ordersQuery = useMemo(() => activeOrdersQuery(), []);
  const { data: orders, loading } = useFirestoreQuery<Order>(ordersQuery, []);
  const { data: assignments } = useFirestoreCollection<WorkAssignment>("work_assignments");
  const { data: allUsers } = useFirestoreCollection<AppUser>("users");
  useNow(30000); // keep deadline chips ticking

  // Assigning happens on Work Assign, where the sales member's brief pre-fills the whole form —
  // an admin can adjust anything before it goes out instead of re-typing it into a second modal.
  // A team leader manages delivery, not the commercials — same rule as Work Done & Reports, so
  // the rupee figures stay with the tech admin.
  const isTeamLeader = user?.role === "tech_team_leader";
  /** Money: the sale amount, penalty rupees, edited discounts. Tech admin only. */
  const showSalesInfo = !isTeamLeader;
  /**
   * Who sold it — shown to the leader as well, and deliberately not grouped with the money above.
   *
   * A leader running delivery has to reach the seller constantly: the brief is thin, the client
   * wants a change, the promise date is impossible. Withholding the name meant walking the order
   * back through the tech admin to find out whose sale it was, on every one of these. It is also
   * already on their own Work Assign screen ("· sold by …"), so hiding it here only made the two
   * pages disagree. The commercial figure is the thing a leader has no business seeing; the
   * colleague's name is not.
   */
  const showSeller = true;
  const workAssignBase = isTeamLeader ? "/team-leader/work-assign" : "/tech-admin/work-assign";

  /**
   * A team leader manages delivery, not money. They see that a client was charged for changes and
   * how many clips it cost the team — never the rupee figure, and they cannot raise one. Same rule
   * that already keeps the sale amount off their copy of this page.
   */
  const canChargePenalty = !isTeamLeader;
  const penalisedOrders = useMemo(() => ordersWithPenalties(orders), [orders]);

  const [tab, setTab] = useState<OrderTab>("unassigned");
  const [penaltyFor, setPenaltyFor] = useState<Order | null>(null);
  const [splitFor, setSplitFor] = useState<Order | null>(null);
  const [search, setSearch] = useState("");
  /**
   * Which kind of work is being looked at. Deliberately ONE piece of state for the whole page:
   * pick "Cinematic" on Not assigned and it stays picked on Assigned, In progress and Changes, so
   * following one kind of job through the queue is a matter of clicking tabs, not re-filtering.
   */
  const [category, setCategory] = useOrderCategory("orders");
  /** First-come-first-served by default: whoever has waited longest is served first. */
  const [sortMode, setSortMode] = useState<OrderSortMode>("fcfs");
  const [view, setView] = useViewMode("orders");

  /**
   * Orders that have left the queue, fetched only when a history tab is opened.
   *
   * Not a live subscription and not part of the page load: there are 700+ of these against ~40 live
   * ones, and this app runs on Firestore's free daily read budget. Paying for the whole archive on
   * every visit to a page whose job is the 40 would be the wrong trade — so history is a bounded,
   * newest-first page you ask for, with "Load older" when the answer isn't in it yet.
   */
  const [history, setHistory] = useState<Order[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(ORDER_HISTORY_PAGE);
  const [historyExhausted, setHistoryExhausted] = useState(false);

  const loadHistory = useCallback(async (max: number) => {
    setHistoryLoading(true);
    try {
      const { rows, scanned } = await fetchOrderHistory(max);
      setHistory(rows);
      setHistoryLoaded(true);
      // Fewer orders read than asked for means the collection ran out — there is no "older" left.
      setHistoryExhausted(scanned < max);
    } catch {
      toast({ title: "Couldn't load history", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  }, [toast]);

  const isHistoryTab = HISTORY_TABS.includes(tab);
  useEffect(() => {
    if (!isHistoryTab || historyLoaded || historyLoading) return;
    loadHistory(ORDER_HISTORY_PAGE);
  }, [isHistoryTab, historyLoaded, historyLoading, loadHistory]);

  const loadOlder = async () => {
    const next = historyLimit + ORDER_HISTORY_PAGE;
    setHistoryLimit(next);
    await loadHistory(next);
  };

  /** Delivered work vs. everything that was removed — two very different facts about a sale. */
  const delivered = useMemo(() => history.filter((o) => orderExitReason(o) === "delivered"), [history]);
  const removed = useMemo(
    () => history.filter((o) => { const r = orderExitReason(o); return r === "deleted" || r === "swept" || r === "cancelled"; }),
    [history],
  );

  // Manual selection → delete, with a confirmation step. Selections are cleared whenever the
  // visible set changes (tab / search), so you can never delete something you can't see.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { setSelected(new Set()); }, [tab, search, category]);
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
      const n = await reconcileManualOrders(reconcilable, user);
      toast({ title: "Queue cleaned up", description: `${n} order${n === 1 ? "" : "s"} already handled manually were cleared.` });
      setConfirmClean(false);
    } catch {
      toast({ title: "Error", description: "Couldn't clean up the queue. Try again.", variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  };

  // One-time deadline sweep when the queue first loads. Waits for the assignments too: without
  // them the sweep cannot tell delivered work from outstanding work, nor who is holding it now.
  const sweptRef = useRef(false);
  useEffect(() => {
    if (loading || sweptRef.current || orders.length === 0 || assignments.length === 0) return;
    sweptRef.current = true;
    notifyDueOrdersOnOpen(orders, assignments);
  }, [loading, orders, assignments]);

  /** Orders joined to the work fulfilling them — the source of the "in progress" column. */
  const byOrderId = useMemo(() => assignmentsByOrderId(assignments), [assignments]);
  const queueStatusOf = useMemo(
    () => (o: Order) => orderQueueStatus(o, byOrderId),
    [byOrderId],
  );
  const memberNameOf = useMemo(() => {
    const map = new Map(allUsers.map((u) => [u.uid, u.name]));
    return (uid?: string | null) => (uid ? map.get(uid) || null : null);
  }, [allUsers]);

  /**
   * Who can be given a job. External creators are outside people with tool access only — they are
   * not on the team and must never appear in a work picker (see AppUser.externalCreator).
   */
  const assignableMembers = useMemo(
    () => allUsers
      .filter((u) => u.role === "tech_member" && u.isActive !== false && !u.externalCreator)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [allUsers],
  );

  /**
   * Counted through utils/adPipeline — the same definition the Work Assign status board uses.
   *
   * These two screens both showed a number called "Assigned" and the two disagreed, because each
   * counted a different population. Reading from one shared classifier is what makes them
   * reconcilable: the only remaining difference is work created with no sale behind it, which the
   * board names on screen and this queue cannot show at all.
   */
  const counts = useMemo(() => {
    const out: Record<OrderTab, number> = {
      unassigned: 0, assigned: 0, in_progress: 0, completed: 0, changes: 0, delivered: 0, removed: 0,
    };
    for (const rec of orderBacked(buildAdPipeline(orders, assignments))) {
      // The tab badges count what the filter would actually show. Leaving them on the unfiltered
      // total made every tab claim more work than it listed the moment a filter was on.
      if (rec.order && !matchesOrderCategory(rec.order, category)) continue;
      if (rec.stage in out) out[rec.stage as OrderTab] += 1;
    }
    out.changes = penalisedOrders.filter((o) => matchesOrderCategory(o, category)).length;
    // History counts are of what has been loaded, so they read 0 until the tab is first opened.
    out.delivered = delivered.filter((o) => matchesOrderCategory(o, category)).length;
    out.removed = removed.filter((o) => matchesOrderCategory(o, category)).length;
    return out;
  }, [orders, assignments, penalisedOrders, category, delivered, removed]);

  /** This tab's orders, past the search box — before the category filter, which is built from them. */
  const inTab = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const source =
      tab === "changes" ? penalisedOrders
      : tab === "delivered" ? delivered
      : tab === "removed" ? removed
      : orders.filter((o) => queueStatusOf(o) === tab);
    return source
      .filter((o) => {
        if (!q) return true;
        if (o.businessName?.toLowerCase().includes(q)) return true;
        if (o.clientName?.toLowerCase().includes(q)) return true;
        // Searching "cinematic" must find a bulk cinematic order, whose own category is "bulk".
        if (bulkCategoryLabel(o.category, o.bulkAdType).toLowerCase().includes(q)) return true;
        if (o.soldByName?.toLowerCase().includes(q)) return true;
        if (qDigits && o.clientPhone?.replace(/\D/g, "").includes(qDigits)) return true;
        return false;
      });
  }, [orders, penalisedOrders, delivered, removed, tab, search, queueStatusOf]);

  /**
   * What the dropdown offers, and how many of each are in front of you right now.
   *
   * Counted from `inTab` — before the category filter is applied — so picking one category does not
   * collapse every other option to zero and strand you on it.
   */
  const categoryOptions = useMemo(
    () => orderCategoryOptions(inTab, category),
    [inTab, category],
  );

  const visible = useMemo(() => {
    const filtered = inTab.filter((o) => matchesOrderCategory(o, category));
    // History reads newest-first. The queue's sort answers "who has waited longest"; history
    // answers "what just happened", and first-come-first-served would bury today under June.
    if (isHistoryTab) {
      return [...filtered].sort((a, b) => tsSeconds(b.updatedAt) - tsSeconds(a.updatedAt));
    }
    return sortOrders(filtered, sortMode);
  }, [inTab, category, sortMode, isHistoryTab]);

  /**
   * The hour each waiting order arrived in, as headings down the Not-assigned list.
   *
   * Sales arrive in bursts — ten in one evening hour, none for the rest of the day — and the queue
   * flattened all of that into one column of cards. Knowing a job came from *last night's six
   * o'clock* rather than from this morning is what decides who is given it and what the client is
   * told when they ring.
   *
   * A heading is emitted wherever the bucket differs from the row above it, so this NEVER reorders
   * anything: it labels the list the chosen sort already produced.
   *
   * ── Why the run key carries the pin ───────────────────────────────────────────────────────────
   * Every sort here hoists pinned work (an unfinished month or bulk order) above everything else,
   * so the clock restarts partway down the list — the first six headings climb through the day,
   * then it jumps back to last Tuesday. Seen on real data that reads as a bug rather than as a
   * sort, and the same hour genuinely appearing twice is the part that looks broken.
   *
   * Folding the pin into the key means the boundary always gets its own heading, and the heading
   * says "Pinned" — one word that explains why the hours start again. Merging the two runs instead
   * would be a claim about ordering that the list does not make.
   */
  const hourGroups = useMemo(() => {
    if (tab !== "unassigned") return null;
    const heading = new Map<string, { label: string; pinned: boolean }>();
    const runSize = new Map<string, number>();
    let currentKey: string | null = null;
    let currentHead: string | null = null;
    for (const o of visible) {
      const pinned = isPinnedOrder(o);
      const key = `${pinned ? "pinned" : "queue"}-${hourBucketKey(o.createdAt)}`;
      if (key !== currentKey) {
        currentKey = key;
        currentHead = o.id;
        heading.set(o.id, { label: hourBucketLabel(o.createdAt), pinned });
        runSize.set(o.id, 0);
      }
      if (currentHead) runSize.set(currentHead, (runSize.get(currentHead) || 0) + 1);
    }
    return { heading, runSize };
  }, [tab, visible]);

  /** Overdue count for what's in view, so the sort option can say how many are waiting. */
  const overdueInTab = useMemo(
    () => countOverdue(orders.filter((o) => queueStatusOf(o) === tab && matchesOrderCategory(o, category))),
    [orders, tab, queueStatusOf, category],
  );

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

  /**
   * Take work back off a member and return this order to the queue.
   *
   * The order goes to "unassigned", which is also what re-opens it for the sales member to edit —
   * the sale is theirs again until someone picks it up. Handled here as well as on the member's own
   * page because the Orders queue is where an admin notices the wrong person has it.
   */
  /**
   * Copy the client's number, with the tick that confirms it landed.
   *
   * Copied raw rather than as the formatted display text: what gets pasted is dialled or looked up,
   * and "+91 98765 43210" with its spaces is not the same string as the number itself.
   */
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const copyPhone = (orderId: string, phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(orderId);
    setTimeout(() => setCopiedPhone((current) => (current === orderId ? null : current)), 2000);
  };

  const [confirmUnassign, setConfirmUnassign] = useState<Order | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const runUnassign = async () => {
    if (!confirmUnassign) return;
    const order = confirmUnassign;
    const work = byOrderId.get(order.id);
    setUnassigning(true);
    try {
      if (work) {
        await unassignWork({
          assignmentId: work.id,
          assignedTo: work.assignedTo,
          assignedToName: memberNameOf(work.assignedTo),
          orderId: order.id,
          title: order.businessName || order.clientName,
          actor: user,
        });
      } else {
        // No assignment left to remove — just put the order back where it belongs.
        await revertOrderToUnassigned(order.id);
      }
      toast({
        title: "Back in the queue",
        description: `"${order.businessName || "This order"}" is not assigned any more — assign it to someone else, or let the sales member edit it.`,
      });
      setConfirmUnassign(null);
    } catch {
      toast({ title: "Error", description: "Couldn't unassign this order. Try again.", variant: "destructive" });
    } finally {
      setUnassigning(false);
    }
  };

  /** The selected rows, as orders — every bulk action needs the docs, not just their ids. */
  const selectedOrders = useMemo(
    () => [...orders, ...history].filter((o) => selected.has(o.id)),
    [orders, history, selected],
  );

  const runDelete = async () => {
    setDeleting(true);
    try {
      const n = await deleteOrders(selectedOrders, user);
      toast({
        title: "Removed from the queue",
        description: `${n} order${n === 1 ? "" : "s"} moved to Removed. You can put ${n === 1 ? "it" : "them"} back from there.`,
      });
      setSelected(new Set());
      setConfirmDelete(false);
      // Whatever was just deleted belongs in the history list now, so it can be found and restored.
      if (historyLoaded) await loadHistory(historyLimit);
    } catch {
      toast({ title: "Error", description: "Couldn't delete the selected orders. Try again.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Put removed orders back in the queue.
   *
   * The counterpart that never existed: deleting and sweeping were both one click and neither could
   * be undone, so a sale whose order was removed by mistake stayed removed and unpaid-for work
   * quietly never happened. Only offered for orders that CAN come back — delivered work is done.
   */
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const restorable = useMemo(() => selectedOrders.filter(isRestorableOrder), [selectedOrders]);
  const runRestore = async () => {
    setRestoring(true);
    try {
      const n = await restoreOrders(restorable, user);
      toast({
        title: "Back in the queue",
        description: `${n} order${n === 1 ? "" : "s"} returned to Not assigned — assign ${n === 1 ? "it" : "them"} from there.`,
      });
      setSelected(new Set());
      setConfirmRestore(false);
      await loadHistory(historyLimit);
    } catch {
      toast({ title: "Error", description: "Couldn't restore the selected orders. Try again.", variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  /**
   * Clear removed orders out for good — the second key on a two-stage bin.
   *
   * A team leader can take a job out of the queue (it lands in Removed, and can be put back). Only
   * the tech admin can erase it from there, because that step is not reversible and the sale behind
   * the order is money: afterwards the single line in Activity History is the entire record.
   */
  const canPurge = canPurgeOrders(user?.role);
  const [purging, setPurging] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const purgeable = useMemo(
    () => (canPurge ? selectedOrders.filter((o) => orderExitReason(o) !== "delivered") : []),
    [canPurge, selectedOrders],
  );
  const runPurge = async () => {
    setPurging(true);
    try {
      const n = await purgeOrders(purgeable, user);
      toast({
        title: "Permanently deleted",
        description: `${n} order${n === 1 ? "" : "s"} erased. The only record now is the entry in Activity History.`,
      });
      setSelected(new Set());
      setConfirmPurge(false);
      await loadHistory(historyLimit);
    } catch {
      toast({ title: "Error", description: "Couldn't delete those orders permanently. Try again.", variant: "destructive" });
    } finally {
      setPurging(false);
    }
  };

  /**
   * Approve delivered work without leaving the queue.
   *
   * The Completed column said "Awaiting verify" and gave nobody anything to click — the actual
   * verify lived on two other screens. So an admin working the queue could see what was waiting on
   * them and had to go somewhere else to do it, which is how two jobs sat verified-but-not-closed.
   */
  const [verifyFor, setVerifyFor] = useState<Order | null>(null);
  const [verifying, setVerifying] = useState(false);
  const runVerify = async () => {
    if (!verifyFor || !user) return;
    const work = byOrderId.get(verifyFor.id);
    if (!work) {
      toast({ title: "Nothing to verify", description: "This order has no work assignment behind it.", variant: "destructive" });
      setVerifyFor(null);
      return;
    }
    setVerifying(true);
    try {
      await verifyAssignments([work], user.uid, (uid) => memberNameOf(uid) || "Unknown", user);
      toast({
        title: "Verified",
        description: `"${verifyFor.businessName || "This order"}" is delivered. It moves to the Delivered tab and onto the client's record.`,
      });
      setVerifyFor(null);
    } catch {
      toast({ title: "Error", description: "Couldn't verify this order. Try again.", variant: "destructive" });
    } finally {
      setVerifying(false);
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

      {/* Tabs — the four delivery columns, Changes when anything has been charged for, and the two
          history columns that make an order's whole life reachable from one page. */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          ...ORDER_QUEUE_TABS,
          ...(penalisedOrders.length > 0 ? [{ key: "changes" as const, label: "Changes" }] : []),
          { key: "delivered" as const, label: "Delivered" },
          { key: "removed" as const, label: "Removed" },
        ].map(({ key: t, label }) => (
          <button
            key={t}
            data-test={`orders-tab-${t}`}
            onClick={() => setTab(t as OrderTab)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs md:text-sm font-medium border transition-colors ${tab === t ? "bg-primary text-primary-foreground border-primary" : t === "changes" ? "bg-card text-destructive border-destructive/40 hover:bg-destructive/10" : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-accent/50"}`}
          >
            {(t === "delivered" || t === "removed") && <History className="w-3.5 h-3.5" />}
            <span>{label}</span>
            {/* History counts only mean something once history has been fetched — until then the
                badge would claim "0 delivered", which is a lie about 600-odd delivered ads. */}
            <span className={`px-1.5 rounded-full text-[10px] ${tab === t ? "bg-primary-foreground/20" : "bg-muted"}`}>
              {HISTORY_TABS.includes(t as OrderTab) && !historyLoaded ? "…" : counts[t as OrderTab]}
            </span>
          </button>
        ))}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={showSeller ? "Search business, category, seller, phone…" : "Search business, category, phone…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {/* Kind of work. Stays put as you move between tabs, so one job type can be followed all
            the way through the queue; the count on each option is how many are in THIS tab. */}
        <select
          value={category}
          data-test="orders-category-filter"
          onChange={(e) => setCategory(e.target.value)}
          title="Show only one kind of work"
          className={`h-9 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 ${
            category === ALL_ORDER_CATEGORIES
              ? "border-border/70 bg-background text-foreground"
              : "border-primary/50 bg-primary/10 text-primary font-medium"
          }`}
        >
          {categoryOptions.map((o) => (
            <option key={o.key} value={o.key}>{orderCategoryOptionLabel(o)}</option>
          ))}
        </select>
        {/* The queue's sort answers "who has waited longest", which is not a question you can ask
            of finished work — history is always newest-change-first, so the control is not offered. */}
        {!isHistoryTab && (
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as OrderSortMode)}
            title="Order of the queue"
            className="h-9 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
          >
            {ORDER_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}{o.value === "overdue" && overdueInTab > 0 ? ` (${overdueInTab})` : ""}
              </option>
            ))}
          </select>
        )}
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
              {/* Restore comes first on the history tabs — putting a wrongly-removed order back is
                  the reason anyone opens Removed, and it must not sit behind the delete button. */}
              {restorable.length > 0 && (
                <button data-test="orders-restore" onClick={() => setConfirmRestore(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-primary/40 bg-primary/10 text-xs md:text-sm font-medium text-primary transition-colors hover:bg-primary/20">
                  <RotateCcw className="w-3.5 h-3.5" /> Put back in the queue ({restorable.length})
                </button>
              )}
              {/* On a live tab this moves the order to Removed. On Removed there is nothing left to
                  move it to, so the only remaining action is the permanent one — and that is the
                  tech admin's alone. */}
              {tab !== "delivered" && tab !== "removed" && (
                <button onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-destructive/40 bg-destructive/10 text-xs md:text-sm font-medium text-destructive transition-colors hover:bg-destructive/20">
                  <Trash2 className="w-3.5 h-3.5" /> Remove selected ({selected.size})
                </button>
              )}
              {tab === "removed" && canPurge && purgeable.length > 0 && (
                <button data-test="orders-purge" onClick={() => setConfirmPurge(true)}
                  title="Erase these orders from the system. Only Activity History will remember them."
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-destructive bg-destructive/20 text-xs md:text-sm font-semibold text-destructive transition-colors hover:bg-destructive/30">
                  <ShieldAlert className="w-3.5 h-3.5" /> Delete permanently ({purgeable.length})
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Restore confirmation */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !restoring && setConfirmRestore(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/15">
              <RotateCcw className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-center text-lg font-semibold text-foreground">Put {restorable.length} order{restorable.length === 1 ? "" : "s"} back?</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {restorable.length === 1 ? "It goes" : "They go"} back to <strong className="text-foreground">Not assigned</strong> with no member on
              {restorable.length === 1 ? " it" : " them"}, ready to be assigned. The sale behind
              {restorable.length === 1 ? " it is" : " them are"} untouched, and the clean-up sweep won't take
              {restorable.length === 1 ? " it" : " them"} again.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button onClick={() => setConfirmRestore(false)} disabled={restoring}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                Cancel
              </button>
              <button onClick={runRestore} disabled={restoring}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {restoring ? "Restoring…" : `Restore ${restorable.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify confirmation — closing out delivered work without leaving the queue. */}
      {verifyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !verifying && setVerifyFor(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-green-500/15">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-center text-lg font-semibold text-foreground">Verify this delivery?</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              <strong className="text-foreground">{verifyFor.businessName || "This order"}</strong> is marked done by the member.
              Verifying approves it, tells them, records the delivery on the client's record and moves the order to
              {" "}<strong className="text-foreground">Delivered</strong>.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button onClick={() => setVerifyFor(null)} disabled={verifying}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                Cancel
              </button>
              <button data-test="order-verify-confirm" onClick={runVerify} disabled={verifying}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {verifying ? "Verifying…" : "Verify"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <h3 className="text-center text-lg font-semibold text-foreground">Remove {selected.size} order{selected.size === 1 ? "" : "s"} from the queue?</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {selected.size === 1 ? "It moves" : "They move"} to the <strong className="text-foreground">Removed</strong> tab
              and stop appearing in the queue, even if the sale is verified again. Any work already assigned stays in
              Work Done &amp; Reports. You can put {selected.size === 1 ? "it" : "them"} back from Removed at any time.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                Cancel
              </button>
              <button onClick={runDelete} disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-50">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? "Removing…" : `Remove ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent deletion — the one action in this pipeline that leaves nothing behind. */}
      {confirmPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !purging && setConfirmPurge(false)}>
          <div className="w-full max-w-md rounded-xl border border-destructive/50 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/20">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
            <h3 className="text-center text-lg font-semibold text-foreground">
              Permanently delete {purgeable.length} order{purgeable.length === 1 ? "" : "s"}?
            </h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {purgeable.length === 1 ? "This order is" : "These orders are"} erased from the system.
              {purgeable.length === 1 ? " It" : " They"} cannot be put back, and will not show in the queue,
              in Removed, or anywhere else.
            </p>
            <p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
              The only remaining record will be one line in <strong className="text-foreground">Activity History</strong>,
              naming you, the date, and what was deleted. The sale itself is not touched.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button onClick={() => setConfirmPurge(false)} disabled={purging}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                Cancel
              </button>
              <button data-test="orders-purge-confirm" onClick={runPurge} disabled={purging}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-50">
                {purging ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                {purging ? "Deleting…" : `Delete ${purgeable.length} for good`}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmUnassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !unassigning && setConfirmUnassign(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15">
              <Undo2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-center text-lg font-semibold text-foreground">Unassign this order?</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              <strong className="text-foreground">{confirmUnassign.businessName || "This order"}</strong> goes back to{" "}
              <strong className="text-foreground">Not assigned</strong>, so it can be given to someone else. The member is
              told it was removed, and the sales member can edit the sale again until it is picked up.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button onClick={() => setConfirmUnassign(null)} disabled={unassigning}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                Cancel
              </button>
              <button onClick={runUnassign} disabled={unassigning}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50">
                {unassigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                {unassigning ? "Unassigning…" : "Unassign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* What a history tab is, said once, so nobody has to guess why these are not in the queue. */}
      {isHistoryTab && (
        <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            {tab === "delivered"
              ? "Orders that were delivered and verified. They have left the queue and are on the client's record — shown here so a finished job can still be found."
              : "Orders taken out of the queue — deleted by an admin, or cleared by \"already done\" clean-up. The sale behind each one still exists, so anything removed by mistake can be put back."}
            {" "}Showing the {historyLimit} most recently changed orders.
          </p>
        </div>
      )}

      {/* Said out loud on arrival, not after a selection — a leader who sees no delete button reads
          the page as broken. The reversible half of the bin is still theirs; only emptying it is not. */}
      {tab === "removed" && !canPurge && (
        <div data-test="orders-purge-denied" className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            You can put any of these back in the queue. Only the tech admin can delete them
            permanently — once erased, the sale's order exists nowhere but Activity History.
          </p>
        </div>
      )}

      {/* List / grid */}
      <div className={view === "grid" ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : "space-y-3"}>
        {isHistoryTab && historyLoading && !historyLoaded ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground lg:col-span-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading history…
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground lg:col-span-2">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">
              {tab === "changes" ? "Nothing charged for changes"
                : tab === "delivered" ? "No delivered orders"
                : tab === "removed" ? "Nothing has been removed"
                : `No ${tab.replace(/_/g, " ")} orders`}
              {/* An empty tab with a filter on is almost always the filter, not an empty queue —
                  say which one is hiding things and offer the way out in the same breath. */}
              {category !== ALL_ORDER_CATEGORIES && ` in ${categoryLabel(category)}`}
            </p>
            {category !== ALL_ORDER_CATEGORIES && (
              <button onClick={() => setCategory(ALL_ORDER_CATEGORIES)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/50">
                <X className="h-3.5 w-3.5" /> Show all services
              </button>
            )}
          </div>
        ) : visible.map((o) => {
          const hourHeading = hourGroups?.heading.get(o.id);
          const hourCount = hourGroups?.runSize.get(o.id) || 0;
          return (
          <Fragment key={o.id}>
          {hourHeading && (
            <div data-test="orders-hour-heading"
              className="col-span-full flex flex-wrap items-center gap-2 pt-1 first:pt-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-[11px] font-semibold text-foreground">
                <Clock size={11} className="text-muted-foreground" /> {hourHeading.label}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {hourCount} {hourCount === 1 ? "ad" : "ads"}
              </span>
              {/* Says why the clock starts over here — these were lifted out of date order. */}
              {hourHeading.pinned && (
                <span data-test="orders-hour-pinned"
                  title="Months and bulk orders stay at the top until every counter is met, so they are out of date order"
                  className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                  <Pin size={9} /> Pinned
                </span>
              )}
              <span className="h-px flex-1 bg-border/70" />
            </div>
          )}
          <div className={`bg-card border rounded-xl p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow ${selected.has(o.id) ? "border-primary/60 ring-1 ring-primary/30" : ""}`}>
            <div className="flex items-start gap-3">
              {/* Per-order select checkbox */}
              <button onClick={() => toggleOne(o.id)} aria-label={selected.has(o.id) ? "Deselect order" : "Select order"}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors">
                {selected.has(o.id) ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5" />}
              </button>
              {/* Grid cards are half-width, so the Assign button stacks below the details there. */}
              <div className={`flex min-w-0 flex-1 gap-3 ${view === "grid" ? "flex-col" : "flex-col md:flex-row md:items-start md:justify-between"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="font-semibold text-card-foreground text-sm md:text-base truncate">{o.businessName || "Unnamed client"}</h3>
                  {/* A bulk order names the kind of video too: "Bulk Videos" alone does not tell
                      whoever assigns it whether this is a 24-hour wishes job or a cinematic one. */}
                  <span data-test="order-category" className="text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">{bulkCategoryLabel(o.category, o.bulkAdType)}</span>
                  {categoryBilling(o.category) === "monthly" && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500">Monthly</span>
                  )}
                  {/* Says why this one is sitting at the top of the list rather than in date order. */}
                  {isPinnedOrder(o) && (
                    <span data-test="order-pinned" title={progressSummary(o.progress)}
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400">
                      <Pin size={9} /> Pinned until delivered
                    </span>
                  )}
                  {!!o.quantity && o.quantity > 1 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <Layers size={9} /> {o.quantity} videos
                    </span>
                  )}
                  {/* A price that left the discount ladder. The tech admin is one of the two people
                      entitled to ask why, so it is on the card rather than buried in the sale. */}
                  {showSalesInfo && o.discountEdited && (
                    <span data-test="order-discount-edited"
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={9} /> {discountEditLabel(o.suggestedDiscountPercent || 0, o.discountPercent || 0)}
                    </span>
                  )}
                  {!!o.penaltyClips && (
                    <span data-test="order-penalty-chip"
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
                      <AlertTriangle size={9} /> {o.penaltyClips} clip{o.penaltyClips === 1 ? "" : "s"} charged
                      {showSalesInfo && o.penaltyTotal ? ` · ${formatCurrency(o.penaltyTotal)}` : ""}
                    </span>
                  )}
                  {/* On a history card, the first thing to say is why this order is not in the
                      queue — and, where we know it, who took it out. */}
                  {(() => {
                    const reason = orderExitReason(o);
                    const meta = reason ? EXIT_META[reason] : null;
                    if (!meta) return null;
                    return (
                      <span data-test="order-exit-reason"
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${meta.className}`}>
                        <Archive size={9} /> {meta.label}
                      </span>
                    );
                  })()}
                  {/*
                    What the customer thought of it.

                    On the card rather than a page behind it, because this is the only screen where
                    a delivered job and the person who delivered it are in front of you at the same
                    time — and a two-star ad that nobody ever reads about is a client who quietly
                    stops answering the phone. The comment is the tooltip: the score is the alarm,
                    the sentence is the detail.
                  */}
                  {o.clientReview && (
                    <span data-test="order-client-review"
                      title={o.clientReview.comment || "The client rated this ad from their chat"}
                      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        Math.min(o.clientReview.work, o.clientReview.service) <= 3
                          ? "bg-destructive/15 text-destructive"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }`}>
                      <Star size={9} className="fill-current" />
                      {o.clientReview.work}/5 work · {o.clientReview.service}/5 service
                    </span>
                  )}
                  {/* Approval isn't a gate anymore, but the tech team should still see which sales
                      the sales admin hasn't signed off on yet. */}
                  {o.saleVerified === false && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400" title="The sales admin hasn't verified this sale yet">
                      <Hourglass size={9} /> Pending approval
                    </span>
                  )}
                  {/* A promise only means something while the job is still owed. "1d 19h overdue"
                      on an order that was delivered in July — or deleted in August — is a clock
                      still running on work nobody is doing. */}
                  {!isHistoryTab && <DeadlineChip promise={o.promise} />}
                </div>
                <div className="flex flex-wrap gap-x-3 md:gap-x-4 gap-y-1 text-xs md:text-sm text-muted-foreground">
                  {showSalesInfo && <span>Amount: <strong className="text-foreground">{formatCurrency(o.amount)}</strong></span>}
                  {o.packageKey && o.packageKey !== "custom" && <span>Package: <strong className="text-foreground">{o.packageKey}</strong></span>}
                  {o.clientName && o.clientName !== o.businessName && (
                    <span>Client: <strong className="text-foreground">{o.clientName}</strong></span>
                  )}
                  {showSeller && o.soldByName && (
                    <span>Sold by: <strong className="text-foreground">{o.soldByName}</strong></span>
                  )}
                  {o.fromAd && <span className="text-info">From ad</span>}
                  {/* When the sale was taken — the thing first-come-first-served is ordered by,
                      so it has to be readable on every card, not only in the sort. */}
                  <span className="inline-flex items-center gap-1" title="When this ad was taken">
                    <Clock size={11} /> Taken: <strong className="text-foreground">{fmtTs(o.createdAt)}</strong>
                  </span>
                  {o.promise && <span className="inline-flex items-center gap-1"><Clock size={11} /> Promise: <strong className="text-foreground">{o.promise.label}</strong></span>}
                  {/* Who took it out of the queue, and when. Orders removed before this was
                      recorded show the date alone — which is still more than the queue used to say. */}
                  {(o.deleted || o.status === "deleted") && (
                    <span data-test="order-removed-by" className="inline-flex items-center gap-1">
                      <Trash2 size={11} /> Deleted{o.deletedByName ? <> by <strong className="text-foreground">{o.deletedByName}</strong></> : null}
                      : <strong className="text-foreground">{fmtTs(o.deletedAt)}</strong>
                    </span>
                  )}
                  {o.reconciledManually && (
                    <span className="inline-flex items-center gap-1">
                      <Sparkle size={11} /> Cleared{o.retiredByName ? <> by <strong className="text-foreground">{o.retiredByName}</strong></> : null}
                      {tsSeconds(o.retiredAt) ? <>: <strong className="text-foreground">{fmtTs(o.retiredAt)}</strong></> : null}
                    </span>
                  )}
                  {o.restoredAt && (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <RotateCcw size={11} /> Put back{o.restoredByName ? ` by ${o.restoredByName}` : ""}: {fmtTs(o.restoredAt)}
                    </span>
                  )}
                  {/* Who has it. A button, not text: the next question after "who?" is always
                      "what else are they on?", and that answer lives on their own page. */}
                  {(() => {
                    const who = orderAssignee(o, byOrderId, memberNameOf);
                    if (queueStatusOf(o) === "unassigned" || !who.name) return null;
                    return (
                      <span className="inline-flex items-center gap-1">
                        Assigned to:{" "}
                        {who.uid ? (
                          <button
                            type="button"
                            data-test="order-member"
                            onClick={() => navigate(`${workAssignBase}/${who.uid}`)}
                            title={`Open ${who.name}'s work`}
                            className="font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            {who.name}
                          </button>
                        ) : (
                          <strong className="text-foreground">{who.name}</strong>
                        )}
                      </span>
                    );
                  })()}
                </div>

                {/* What a month or a bulk order still owes. Editable here by the admin and the
                    team leader, who are the two people fielding "where is it?" from the client. */}
                {o.progress && (
                  <div className="mt-2">
                    <OrderProgressPanel order={o} user={user} />
                  </div>
                )}

                {/* The changes ledger. The clip count is the delivery fact a team leader needs;
                    the money is the tech admin's, so only they see the rupees. */}
                {!!o.penalties?.length && (
                  <div className="mt-2 space-y-1 rounded-lg border border-destructive/25 bg-destructive/5 p-2" data-test="order-penalties">
                    <p className="flex items-center justify-between text-[10px] font-semibold text-destructive">
                      <span className="flex items-center gap-1"><AlertTriangle size={10} /> Changes charged</span>
                      <span>
                        {totalPenalties(o.penalties).clips} clip{totalPenalties(o.penalties).clips === 1 ? "" : "s"}
                        {showSalesInfo ? ` · ${formatCurrency(totalPenalties(o.penalties).total)}` : ""}
                      </span>
                    </p>
                    {o.penalties.map((p) => (
                      <div key={p.id} className="flex items-start justify-between gap-2 text-xs text-foreground">
                        <span className="min-w-0">
                          {p.clips} {p.clipType} clip{p.clips === 1 ? "" : "s"}
                          {showSalesInfo ? ` × ${formatCurrency(p.ratePerClip)}` : ""}
                          {p.reason ? <span className="text-muted-foreground"> — {p.reason}</span> : null}
                          <span className="ml-1 text-[10px] text-muted-foreground">by {p.byName} · {fmtTs(p.at)}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {showSalesInfo && <span className="font-mono font-medium text-destructive">{formatCurrency(p.amount)}</span>}
                          {canChargePenalty && (
                            <button
                              data-test="penalty-remove"
                              title="Remove this penalty"
                              onClick={() => removeOrderPenalty({ order: o, penaltyId: p.id, actor: user })}
                              className="text-muted-foreground transition-colors hover:text-destructive"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">Charged to the client — not counted as sales revenue.</p>
                  </div>
                )}

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
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <a href={getWhatsAppUrl(o.clientPhone)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors text-xs font-medium">
                      <MessageCircle className="w-3.5 h-3.5" /> {formatPhoneDisplay(o.clientPhone)}
                    </a>
                    {/* WhatsApp is not the only way this number gets used — it goes into a dialer,
                        a handover message, a spreadsheet. Same control as the member's assignment
                        card, so the two screens behave identically. */}
                    <button
                      type="button"
                      data-test="copy-client-phone"
                      onClick={() => copyPhone(o.id, o.clientPhone)}
                      title="Copy contact number"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent text-xs transition-colors"
                    >
                      {copiedPhone === o.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPhone === o.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}
              </div>
              <div className={`flex flex-wrap items-center gap-2 ${view === "grid" ? "w-full" : ""}`}>
                {/* A removed order's only action is coming back. Everything else on this card —
                    assign, penalty, unassign — belongs to an order that is still in the pipeline. */}
                {isHistoryTab ? (
                  <>
                    {isRestorableOrder(o) && (
                      <button
                        data-test="order-restore-one"
                        onClick={() => { setSelected(new Set([o.id])); setConfirmRestore(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                        <RotateCcw className="w-3.5 h-3.5" /> Put back in the queue
                      </button>
                    )}
                    {tab === "removed" && canPurge && (
                      <button
                        data-test="order-purge-one"
                        onClick={() => { setSelected(new Set([o.id])); setConfirmPurge(true); }}
                        title="Erase this order. Only Activity History will remember it."
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-destructive/50 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors">
                        <ShieldAlert className="w-3.5 h-3.5" /> Delete permanently
                      </button>
                    )}
                  </>
                ) : <>
                {/* A month splits three ways, so it gets its own assigner rather than the single-
                    member form — that form can only hand the whole thing to one person. */}
                {o.status === "unassigned" && o.progress ? (
                  <button data-test="order-split-assign" onClick={() => setSplitFor(o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                    <Split className="w-3.5 h-3.5" /> Assign jobs
                  </button>
                ) : o.status === "unassigned" && (
                  <button onClick={() => navigate(`${workAssignBase}?order=${encodeURIComponent(o.id)}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                    <UserPlus className="w-3.5 h-3.5" /> Assign
                  </button>
                )}
                {/* Re-splitting a month that is already out — people move off jobs mid-month. */}
                {o.progress && o.status !== "unassigned" && (
                  <button data-test="order-resplit" onClick={() => setSplitFor(o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border text-muted-foreground rounded-lg hover:bg-accent hover:text-foreground transition-colors">
                    <Split className="w-3.5 h-3.5" /> Re-assign jobs
                  </button>
                )}
                {canChargePenalty && (
                  <button data-test="order-add-penalty" onClick={() => setPenaltyFor(o)}
                    title="Charge for changes beyond the committed brief"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-destructive/40 bg-destructive/5 text-destructive rounded-lg hover:bg-destructive/15 transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5" /> Penalty
                  </button>
                )}
                {queueStatusOf(o) === "assigned" && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg">
                    <ClipboardList className="w-3.5 h-3.5" /> Assigned
                  </span>
                )}
                {queueStatusOf(o) === "in_progress" && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-lg">
                    <Clock className="w-3.5 h-3.5" /> In progress
                  </span>
                )}
                {/* Pull it back to the queue. Only while work is in flight — taking back finished
                    work would throw away what the member delivered. */}
                {(queueStatusOf(o) === "assigned" || queueStatusOf(o) === "in_progress") && (
                  <button
                    data-test="order-unassign"
                    onClick={() => setConfirmUnassign(o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 rounded-lg transition-colors">
                    <Undo2 className="w-3.5 h-3.5" /> Unassign
                  </button>
                )}
                {/* "Awaiting verify" used to be a label with nothing behind it — the verify itself
                    lived on two other screens. Now the person looking at the waiting job can
                    close it out here, which is the whole point of a queue. */}
                {queueStatusOf(o) === "completed" && o.status !== "verified" && (
                  byOrderId.get(o.id) ? (
                    <button
                      data-test="order-verify"
                      onClick={() => setVerifyFor(o)}
                      title="Approve the delivered work and close this order"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verify delivery
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Awaiting verify
                    </span>
                  )
                )}
                </>}
              </div>
              </div>
            </div>
          </div>
          </Fragment>
          );
        })}
      </div>

      {/* Older history, on request — nobody pays for reads they didn't ask for. */}
      {isHistoryTab && historyLoaded && !historyExhausted && (
        <div className="flex justify-center">
          <button data-test="orders-load-older" onClick={loadOlder} disabled={historyLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-xs md:text-sm font-medium text-foreground transition-colors hover:bg-accent/50 disabled:opacity-50">
            {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
            {historyLoading ? "Loading…" : "Load older orders"}
          </button>
        </div>
      )}

      {penaltyFor && user && (
        <PenaltyDialog order={penaltyFor} actor={user} onClose={() => setPenaltyFor(null)} />
      )}

      {splitFor && user && (
        <AssignTracksDialog
          order={splitFor}
          members={assignableMembers}
          assignments={assignments}
          assignerUid={user.uid}
          assigner={user}
          onClose={() => setSplitFor(null)}
        />
      )}
    </div>
  );
}
