import { useState, useEffect, useMemo } from "react";
import { updateDoc, doc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { fetchTeamMembers, subscribeTeamLeads } from "@/services/teamLeads";
import { sendNotification } from "@/services/notifications";
import { logActivity } from "@/services/activityLog";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency, formatDuration } from "@/utils/formatters";
import { useNow } from "@/hooks/useNow";
import { applySaleFreeze, adminReleaseLock, buildLeadFreezeFields, clearedLeadFreezeFields } from "@/services/numberLock";
import { format } from "date-fns";
import type { AppUser, Lead, SaleDetail } from "@/types";
import { CheckCircle, XCircle, ShoppingBag, ExternalLink, RotateCcw, Trash2, CheckSquare, Square, Phone, MessageCircle, AlertTriangle, FileText, Snowflake, Lock, ShieldOff, Loader2 } from "lucide-react";
import { formatPhoneDisplay, getCallUrl, getWhatsAppUrl, normalizePhone } from "@/utils/phone";
import { useToast } from "@/hooks/use-toast";
import DashboardDayPicker from "@/components/dashboard/DayPicker";

type TimestampLike = { toMillis?: () => number; seconds?: number } | null | undefined;
function tsToMs(ts: TimestampLike): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

export default function SalesApprovals() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "verified" | "rejected" | "duplicates" | "frozen">("pending");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  // Live clock for real-time freeze countdowns. Ticks every second only while the Frozen tab is
  // open (so the list re-filters as freezes expire); a lazy tick elsewhere keeps inline counters fresh.
  const now = useNow(tab === "frozen" ? 1000 : 5000);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) return;
    // Quota-friendly: fetch team members once, then listen ONLY to their leads
    // (scoped `in` queries) instead of streaming the entire leads collection.
    let unsubLeads: (() => void) | undefined;
    let cancelled = false;
    fetchTeamMembers(currentUser.uid).then((myMembers) => {
      if (cancelled) return;
      setMembers(myMembers);
      unsubLeads = subscribeTeamLeads(myMembers.map((m) => m.uid), (teamLeads) => {
        setLeads(teamLeads);
        setLoading(false);
      });
    }).catch(() => setLoading(false));
    return () => { cancelled = true; unsubLeads?.(); };
  }, [currentUser?.uid]);

  // Clear selections when tab changes
  useEffect(() => { setSelectedKeys(new Set()); }, [tab]);

  const getAllItems = (lead: Lead): SaleDetail[] => {
    return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
  };

  const getMemberName = (uid: string) => members.find((m) => m.uid === uid)?.name || "Unknown";

  const makeKey = (leadId: string, itemIndex: number) => `${leadId}__${itemIndex}`;

  // ── Single item actions ──────────────────────────────────────────────────

  const handleVerifyItem = async (leadId: string, itemIndex: number) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    try {
      const items = [...getAllItems(lead)];
      const oldItem = items[itemIndex];
      items[itemIndex] = { ...oldItem, verificationStatus: "verified", verifiedAt: Timestamp.now() };
      await updateDoc(doc(db, "leads", leadId), { saleItems: items, lastUpdated: serverTimestamp() });
      await sendNotification({
        userId: lead.assignedTo,
        type: "sale_approved",
        title: "Sale Verified",
        message: `Your sale of ₹${items[itemIndex].amount?.toLocaleString()} for ${lead.displayName} has been verified!`,
      });
      await logActivity({
        actorId: currentUser!.uid,
        actorName: currentUser!.name,
        actorRole: "sales_admin",
        adminId: currentUser!.uid,
        action: "verified_sale",
        details: {
          leadId,
          leadName: lead.displayName,
          memberId: lead.assignedTo,
          memberName: getMemberName(lead.assignedTo),
          amount: oldItem.amount,
          category: oldItem.category,
        },
      });
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, saleItems: items } : l));
      toast({ title: "Verified", description: "Sale item verified." });
    } catch {
      toast({ title: "Error", description: "Failed to verify.", variant: "destructive" });
    }
  };

  const handleRejectItem = async (leadId: string, itemIndex: number) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    try {
      const items = [...getAllItems(lead)];
      const oldItem = items[itemIndex];
      items[itemIndex] = { ...oldItem, verificationStatus: "rejected", verifiedAt: null };
      await updateDoc(doc(db, "leads", leadId), { saleItems: items, lastUpdated: serverTimestamp() });
      await sendNotification({
        userId: lead.assignedTo,
        type: "sale_rejected",
        title: "Sale Rejected",
        message: `Your ${items[itemIndex].category} sale of ₹${items[itemIndex].amount?.toLocaleString()} for ${lead.displayName} has been rejected.`,
      });
      await logActivity({
        actorId: currentUser!.uid,
        actorName: currentUser!.name,
        actorRole: "sales_admin",
        adminId: currentUser!.uid,
        action: "rejected_sale",
        details: {
          leadId,
          leadName: lead.displayName,
          memberId: lead.assignedTo,
          memberName: getMemberName(lead.assignedTo),
          amount: oldItem.amount,
          category: oldItem.category,
        },
      });
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, saleItems: items } : l));
      toast({ title: "Rejected", description: "Sale item rejected." });
    } catch {
      toast({ title: "Error", description: "Failed to reject.", variant: "destructive" });
    }
  };

  const handleRevokeItem = async (leadId: string, itemIndex: number) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    try {
      const items = [...getAllItems(lead)];
      const oldItem = items[itemIndex];
      items[itemIndex] = { ...oldItem, verificationStatus: "pending", verifiedAt: null };
      await updateDoc(doc(db, "leads", leadId), { saleItems: items, lastUpdated: serverTimestamp() });
      await sendNotification({
        userId: lead.assignedTo,
        type: "sale_revoked",
        title: "Sale Approval Revoked",
        message: `Your ${items[itemIndex].category} sale for ${lead.displayName} has been moved back to pending.`,
      });
      await logActivity({
        actorId: currentUser!.uid,
        actorName: currentUser!.name,
        actorRole: "sales_admin",
        adminId: currentUser!.uid,
        action: "revoked_sale",
        details: {
          leadId,
          leadName: lead.displayName,
          memberId: lead.assignedTo,
          memberName: getMemberName(lead.assignedTo),
          amount: oldItem.amount,
          category: oldItem.category,
        },
      });
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, saleItems: items } : l));
      toast({ title: "Revoked", description: "Sale moved back to pending." });
    } catch {
      toast({ title: "Error", description: "Failed to revoke.", variant: "destructive" });
    }
  };

  const handleDeleteItem = async (leadId: string, itemIndex: number) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    try {
      const items = [...getAllItems(lead)];
      const oldItem = items[itemIndex];
      items.splice(itemIndex, 1);
      const updates: Record<string, any> = { saleItems: items, lastUpdated: serverTimestamp() };
      if (items.length === 0) { updates.saleDone = false; updates.saleDetails = null; }
      await updateDoc(doc(db, "leads", leadId), updates);
      await logActivity({
        actorId: currentUser!.uid,
        actorName: currentUser!.name,
        actorRole: "sales_admin",
        adminId: currentUser!.uid,
        action: "deleted_sale",
        details: {
          leadId,
          leadName: lead.displayName,
          memberId: lead.assignedTo,
          memberName: getMemberName(lead.assignedTo),
          amount: oldItem.amount,
          category: oldItem.category,
        },
      });
      if (items.length === 0) {
        setLeads((prev) => prev.filter((l) => l.id !== leadId));
      } else {
        setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, saleItems: items } : l));
      }
      toast({ title: "Deleted", description: "Sale item deleted." });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
  };

  // ── Duplicate dispute: approve one winner, auto-reject the competitors ────
  const handleApproveDuplicateWinner = async (leadId: string, itemIndex: number) => {
    const winner = leads.find((l) => l.id === leadId);
    if (!winner) return;
    const np = normalizePhone(winner.phone);
    try {
      // 1) Verify the chosen item.
      const wItems = [...getAllItems(winner)];
      const wOld = wItems[itemIndex];
      wItems[itemIndex] = { ...wOld, verificationStatus: "verified", verifiedAt: Timestamp.now() };
      await updateDoc(doc(db, "leads", leadId), { saleItems: wItems, lastUpdated: serverTimestamp() });

      // 2) Reject every still-standing competing sale on the SAME number held by OTHER members
      //    (never the winner's own other leads on that number).
      const competitors = leads.filter((l) => l.assignedTo !== winner.assignedTo && normalizePhone(l.phone) === np);
      for (const c of competitors) {
        const cItems = getAllItems(c);
        if (!cItems.some((it) => it.verificationStatus !== "rejected")) continue; // already all rejected
        const newItems = cItems.map((it) =>
          it.verificationStatus === "rejected" ? it : { ...it, verificationStatus: "rejected" as const, verifiedAt: null },
        );
        await updateDoc(doc(db, "leads", c.id), { saleItems: newItems, lastUpdated: serverTimestamp() });
        await sendNotification({
          userId: c.assignedTo,
          type: "sale_rejected",
          title: "Duplicate sale rejected",
          message: `Another member's sale for ${c.displayName || formatPhoneDisplay(c.phone)} was approved, so your competing sale was rejected.`,
        });
      }

      // 3) Notify the winner + log the resolution.
      await sendNotification({
        userId: winner.assignedTo,
        type: "sale_approved",
        title: "Sale Verified",
        message: `Your sale of ₹${wOld.amount?.toLocaleString()} for ${winner.displayName} was approved over the duplicate.`,
      });
      await logActivity({
        actorId: currentUser!.uid,
        actorName: currentUser!.name,
        actorRole: "sales_admin",
        adminId: currentUser!.uid,
        action: "resolved_duplicate_sale",
        details: {
          leadId,
          leadName: winner.displayName,
          phone: np,
          winnerMember: getMemberName(winner.assignedTo),
          amount: wOld.amount,
          category: wOld.category,
          rejectedMembers: competitors.map((c) => getMemberName(c.assignedTo)),
        },
      });

      // 4) Optimistic local update so the dispute resolves immediately.
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id === leadId) return { ...l, saleItems: wItems };
          if (l.assignedTo !== winner.assignedTo && normalizePhone(l.phone) === np) {
            return {
              ...l,
              saleItems: getAllItems(l).map((it) =>
                it.verificationStatus === "rejected" ? it : { ...it, verificationStatus: "rejected" as const, verifiedAt: null },
              ),
            };
          }
          return l;
        }),
      );
      toast({ title: "Duplicate resolved", description: "Approved this sale and rejected the competing one(s)." });
    } catch {
      toast({ title: "Error", description: "Failed to resolve duplicate.", variant: "destructive" });
    }
  };

  // ── Bulk select helpers ──────────────────────────────────────────────────

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = (keys: string[]) => {
    if (keys.every((k) => selectedKeys.has(k))) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(keys));
    }
  };

  // ── Bulk actions (only for pending tab) ─────────────────────────────────

  const handleBulkVerify = async (displayItems: Array<{ lead: Lead; item: SaleDetail; itemIndex: number }>) => {
    const selected = displayItems.filter((li) => selectedKeys.has(makeKey(li.lead.id, li.itemIndex)));
    if (selected.length === 0) return;
    setBulkProcessing(true);
    try {
      // Group by lead to batch updates
      const byLead: Record<string, typeof selected> = {};
      selected.forEach((li) => {
        if (!byLead[li.lead.id]) byLead[li.lead.id] = [];
        byLead[li.lead.id].push(li);
      });

      for (const leadId of Object.keys(byLead)) {
        const lead = leads.find((l) => l.id === leadId)!;
        const items = [...getAllItems(lead)];
        const affected = byLead[leadId];
        const verifiedTs = Timestamp.now();
        affected.forEach(({ itemIndex }) => {
          items[itemIndex] = { ...items[itemIndex], verificationStatus: "verified", verifiedAt: verifiedTs };
        });
        await updateDoc(doc(db, "leads", leadId), { saleItems: items, lastUpdated: serverTimestamp() });
        // Notify member once per lead
        await sendNotification({
          userId: lead.assignedTo,
          type: "sale_approved",
          title: `${affected.length} Sale(s) Verified`,
          message: `${affected.length} of your sale(s) for ${lead.displayName} have been verified.`,
        });
        setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, saleItems: items } : l));
      }

      await logActivity({
        actorId: currentUser!.uid,
        actorName: currentUser!.name,
        actorRole: "sales_admin",
        adminId: currentUser!.uid,
        action: "bulk_verified_sales",
        details: {
          count: selected.length,
          items: selected.map((li) => ({
            leadId: li.lead.id,
            leadName: li.lead.displayName,
            amount: li.item.amount,
            category: li.item.category,
            memberName: getMemberName(li.lead.assignedTo),
          })),
        },
      });

      setSelectedKeys(new Set());
      toast({ title: `Verified ${selected.length} item(s)`, description: "Bulk verification complete." });
    } catch {
      toast({ title: "Error", description: "Bulk verify failed.", variant: "destructive" });
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkReject = async (displayItems: Array<{ lead: Lead; item: SaleDetail; itemIndex: number }>) => {
    const selected = displayItems.filter((li) => selectedKeys.has(makeKey(li.lead.id, li.itemIndex)));
    if (selected.length === 0) return;
    setBulkProcessing(true);
    try {
      const byLead: Record<string, typeof selected> = {};
      selected.forEach((li) => {
        if (!byLead[li.lead.id]) byLead[li.lead.id] = [];
        byLead[li.lead.id].push(li);
      });

      for (const leadId of Object.keys(byLead)) {
        const lead = leads.find((l) => l.id === leadId)!;
        const items = [...getAllItems(lead)];
        const affected = byLead[leadId];
        affected.forEach(({ itemIndex }) => {
          items[itemIndex] = { ...items[itemIndex], verificationStatus: "rejected", verifiedAt: null };
        });
        await updateDoc(doc(db, "leads", leadId), { saleItems: items, lastUpdated: serverTimestamp() });
        await sendNotification({
          userId: lead.assignedTo,
          type: "sale_rejected",
          title: `${affected.length} Sale(s) Rejected`,
          message: `${affected.length} of your sale(s) for ${lead.displayName} have been rejected.`,
        });
        setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, saleItems: items } : l));
      }

      await logActivity({
        actorId: currentUser!.uid,
        actorName: currentUser!.name,
        actorRole: "sales_admin",
        adminId: currentUser!.uid,
        action: "bulk_rejected_sales",
        details: {
          count: selected.length,
          items: selected.map((li) => ({
            leadId: li.lead.id,
            leadName: li.lead.displayName,
            amount: li.item.amount,
            category: li.item.category,
            memberName: getMemberName(li.lead.assignedTo),
          })),
        },
      });

      setSelectedKeys(new Set());
      toast({ title: `Rejected ${selected.length} item(s)`, description: "Bulk rejection complete." });
    } catch {
      toast({ title: "Error", description: "Bulk reject failed.", variant: "destructive" });
    } finally {
      setBulkProcessing(false);
    }
  };

  // ── Build filtered lists ─────────────────────────────────────────────────

  const dateStr = selectedDate ? format(selectedDate, "dd/MM/yyyy") : null;

  type LeadItem = { lead: Lead; item: SaleDetail; itemIndex: number };
  const allLeadItems: LeadItem[] = leads.flatMap((lead) =>
    getAllItems(lead).map((item, idx) => ({ lead, item, itemIndex: idx }))
  );

  // Duplicate detection: a number sold by 2+ different members → dispute (unclear who made the sale).
  const phoneSellers = new Map<string, Map<string, string>>(); // normPhone -> (memberId -> memberName)
  leads.forEach((l) => {
    if (!l.saleDone) return;
    const np = normalizePhone(l.phone);
    if (!phoneSellers.has(np)) phoneSellers.set(np, new Map());
    phoneSellers.get(np)!.set(l.assignedTo, getMemberName(l.assignedTo));
  });
  const getDuplicateOthers = (lead: Lead): string[] => {
    const sellers = phoneSellers.get(normalizePhone(lead.phone));
    if (!sellers || sellers.size < 2) return [];
    return [...sellers.entries()].filter(([id]) => id !== lead.assignedTo).map(([, name]) => name);
  };
  const pending = allLeadItems.filter((li) => li.item.verificationStatus === "pending");
  const verified = allLeadItems.filter((li) => {
    if (li.item.verificationStatus !== "verified") return false;
    if (!dateStr) return true;
    const ts = li.lead.lastUpdated?.seconds;
    if (!ts) return false;
    return format(new Date(ts * 1000), "dd/MM/yyyy") === dateStr;
  });
  const rejected = allLeadItems.filter((li) => {
    if (li.item.verificationStatus !== "rejected") return false;
    if (!dateStr) return true;
    const ts = li.lead.lastUpdated?.seconds;
    if (!ts) return false;
    return format(new Date(ts * 1000), "dd/MM/yyyy") === dateStr;
  });
  // Duplicates: every sale item whose number was sold by 2+ different members (any status).
  // Sorted by number so competing sales sit side by side, then oldest submission first.
  const duplicates = allLeadItems
    .filter((li) => getDuplicateOthers(li.lead).length > 0)
    .sort((a, b) => {
      const pa = normalizePhone(a.lead.phone);
      const pb = normalizePhone(b.lead.phone);
      if (pa !== pb) return pa < pb ? -1 : 1;
      return ((a.item.submittedAt as any)?.seconds || 0) - ((b.item.submittedAt as any)?.seconds || 0);
    });
  // Group competing sales by number → one combined card per disputed number.
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, LeadItem[]>();
    duplicates.forEach((li) => {
      const np = normalizePhone(li.lead.phone);
      if (!map.has(np)) map.set(np, []);
      map.get(np)!.push(li);
    });
    // Within a group: oldest submission first so the earliest claimant is on top.
    for (const arr of map.values()) {
      arr.sort((a, b) => ((a.item.submittedAt as any)?.seconds || 0) - ((b.item.submittedAt as any)?.seconds || 0));
    }
    return [...map.entries()];
  }, [duplicates]);

  // Frozen numbers: every sold lead with an active sale-freeze, soonest-to-unfreeze first.
  // Built straight from `leads` (which the admin already streams) so it needs no extra reads.
  const frozenLeads = leads
    .filter((l) => l.saleFrozen && tsToMs(l.saleFrozenUntil) > now)
    .sort((a, b) => tsToMs(a.saleFrozenUntil) - tsToMs(b.saleFrozenUntil));

  const displayItems =
    tab === "pending" ? pending : tab === "verified" ? verified : tab === "rejected" ? rejected : tab === "duplicates" ? duplicates : [];

  const pendingKeys = pending.map((li) => makeKey(li.lead.id, li.itemIndex));
  const allPendingSelected = pendingKeys.length > 0 && pendingKeys.every((k) => selectedKeys.has(k));
  const someSelected = selectedKeys.size > 0 && tab === "pending";

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Sales Approvals</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            {selectedDate ? `Filtered: ${format(selectedDate, "dd/MM/yyyy")}` : "Verify sales reported by your team"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto">
        <button onClick={() => setTab("pending")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${tab === "pending" ? "bg-warning/15 text-warning border border-warning/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Pending ({pending.length})
        </button>
        <button onClick={() => setTab("verified")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${tab === "verified" ? "bg-success/15 text-success border border-success/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Verified ({verified.length})
        </button>
        <button onClick={() => setTab("rejected")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${tab === "rejected" ? "bg-destructive/15 text-destructive border border-destructive/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Rejected ({rejected.length})
        </button>
        <button onClick={() => setTab("duplicates")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${tab === "duplicates" ? "bg-destructive/15 text-destructive border border-destructive/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          <AlertTriangle size={13} /> Duplicates ({duplicates.length})
        </button>
        <button onClick={() => setTab("frozen")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${tab === "frozen" ? "bg-success/15 text-success border border-success/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          <Snowflake size={13} /> Frozen Numbers ({frozenLeads.length})
        </button>
      </div>

      {/* Bulk action bar — only on Pending tab */}
      {tab === "pending" && pending.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Select all toggle */}
          <button
            onClick={() => toggleSelectAll(pendingKeys)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {allPendingSelected ? (
              <CheckSquare size={16} className="text-primary" />
            ) : (
              <Square size={16} />
            )}
            <span>{allPendingSelected ? "Deselect All" : "Select All"}</span>
            {selectedKeys.size > 0 && (
              <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-medium">
                {selectedKeys.size} selected
              </span>
            )}
          </button>

          {/* Bulk action buttons */}
          {someSelected && (
            <div className="flex gap-2 sm:ml-auto">
              <button
                onClick={() => handleBulkVerify(displayItems)}
                disabled={bulkProcessing}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-success/15 text-success font-medium text-xs hover:bg-success/25 transition-colors disabled:opacity-50"
              >
                <CheckCircle size={13} />
                Verify All ({selectedKeys.size})
              </button>
              <button
                onClick={() => handleBulkReject(displayItems)}
                disabled={bulkProcessing}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-destructive/15 text-destructive font-medium text-xs hover:bg-destructive/25 transition-colors disabled:opacity-50"
              >
                <XCircle size={13} />
                Reject All ({selectedKeys.size})
              </button>
            </div>
          )}

          {!someSelected && (
            <p className="text-xs text-muted-foreground sm:ml-auto">
              Select items above to bulk verify or reject
            </p>
          )}
        </div>
      )}

      {/* Frozen Numbers tab — number-centric, live countdown */}
      {tab === "frozen" ? (
        frozenLeads.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Snowflake size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No numbers are currently frozen.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-1.5 rounded-md bg-success/10 border border-success/30 text-success text-xs p-2.5">
              <Snowflake size={14} className="mt-0.5 shrink-0" />
              <span>These sold numbers are frozen — no other member can claim them until the timer runs out. Counts update live. You can extend or release any freeze.</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {frozenLeads.map((lead) => (
                <FrozenNumberCard
                  key={lead.id}
                  lead={lead}
                  now={now}
                  memberName={getMemberName(lead.assignedTo)}
                  admin={currentUser ? { uid: currentUser.uid, name: currentUser.name } : { uid: "", name: "" }}
                />
              ))}
            </div>
          </div>
        )
      ) : tab === "duplicates" ? (
        duplicateGroups.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <AlertTriangle size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No duplicate sales — no number has been sold by more than one member.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs p-2.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Each card is one number sold by 2+ members. Review both members' proof, then <b>Approve</b> the real one — the competing sale(s) on that number are auto-rejected. You can re-approve a different member anytime, even after a mistaken approval.</span>
            </div>
            {duplicateGroups.map(([phone, items]) => (
              <DuplicateGroupCard
                key={phone}
                phone={phone}
                items={items}
                getMemberName={getMemberName}
                onApproveWinner={handleApproveDuplicateWinner}
                onReject={handleRejectItem}
                onRevoke={handleRevokeItem}
                onDelete={handleDeleteItem}
              />
            ))}
          </div>
        )
      ) : /* Items */ displayItems.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <ShoppingBag size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No {tab} sales</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayItems.map((li, key) => {
            const itemKey = makeKey(li.lead.id, li.itemIndex);
            const isSelected = selectedKeys.has(itemKey);
            const dupOthers = getDuplicateOthers(li.lead);
            return (
              <div
                key={`${li.lead.id}-${li.itemIndex}-${key}`}
                className={`bg-card border rounded-xl p-3 md:p-5 space-y-3 transition-colors ${
                  dupOthers.length > 0 ? "border-destructive/50" : tab === "pending" && isSelected ? "border-primary/50 bg-primary/5" : "border-border"
                }`}
              >
                {dupOthers.length > 0 && (
                  <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs p-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span><b>Duplicate sale.</b> This number was also sold by {dupOthers.join(", ")}. Check both members' proof before deciding who made the sale.</span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    {/* Checkbox for pending items */}
                    {tab === "pending" && (
                      <button
                        onClick={() => toggleSelect(itemKey)}
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      >
                        {isSelected ? (
                          <CheckSquare size={16} className="text-primary" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm md:text-base">{li.lead.displayName || li.lead.phone}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-[10px] md:text-xs text-muted-foreground font-mono">{formatPhoneDisplay(li.lead.phone)}</p>
                        <a
                          href={getCallUrl(li.lead.phone)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-5 h-5 rounded flex items-center justify-center text-info hover:bg-info/10 transition-colors"
                          title="Call"
                        >
                          <Phone size={11} />
                        </a>
                        <a
                          href={getWhatsAppUrl(li.lead.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="w-5 h-5 rounded flex items-center justify-center text-success hover:bg-success/10 transition-colors"
                          title="WhatsApp"
                        >
                          <MessageCircle size={11} />
                        </a>
                      </div>
                    </div>
                  </div>
                  <p className="font-display font-bold text-primary text-base md:text-lg shrink-0">{formatCurrency(li.item.amount || 0)}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Category:</span>{" "}
                    <span className="text-foreground font-medium capitalize">{li.item.category?.replace(/_/g, " ") || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Package:</span>{" "}
                    <span className="text-foreground font-medium">{li.item.packageKey || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sold by:</span>{" "}
                    <span className="text-foreground font-medium">{getMemberName(li.lead.assignedTo)}</span>
                  </div>
                  {li.item.customDescription && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Note:</span>{" "}
                      <span className="text-foreground">{li.item.customDescription}</span>
                    </div>
                  )}
                  {(li.item.submittedAt as any)?.seconds && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Submitted:</span>{" "}
                      <span className="text-foreground font-mono text-[10px]">
                        {format(new Date((li.item.submittedAt as any).seconds * 1000), "dd MMM yyyy, hh:mm a")}
                      </span>
                    </div>
                  )}
                  {li.item.verificationStatus === "verified" && (li.item.verifiedAt as any)?.seconds && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Approved:</span>{" "}
                      <span className="text-success font-mono text-[10px]">
                        {format(new Date((li.item.verifiedAt as any).seconds * 1000), "dd MMM yyyy, hh:mm a")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Duplicate-dispute proof (call record image / note) */}
                {(li.item.proofImageUrl || li.item.proofNote) && (
                  <div className="rounded-md bg-elevated/40 border border-border p-2 space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Sale proof</p>
                    {li.item.proofImageUrl && (
                      <a href={li.item.proofImageUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-info flex items-center gap-1 hover:underline">
                        <ExternalLink size={12} /> View call-record / proof image
                      </a>
                    )}
                    {li.item.proofNote && (
                      <p className="text-xs text-foreground flex items-start gap-1">
                        <FileText size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="whitespace-pre-wrap break-words">{li.item.proofNote}</span>
                      </p>
                    )}
                  </div>
                )}

                {li.item.paymentScreenshotUrl && (
                  <a href={li.item.paymentScreenshotUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-info flex items-center gap-1 hover:underline">
                    <ExternalLink size={12} /> View Payment Screenshot
                  </a>
                )}

                {tab === "pending" && (
                  <div className="flex gap-1.5 md:gap-2 pt-1">
                    <button onClick={() => handleVerifyItem(li.lead.id, li.itemIndex)}
                      className="flex-1 h-8 md:h-9 rounded-lg bg-success/15 text-success font-medium text-xs md:text-sm hover:bg-success/25 transition-colors flex items-center justify-center gap-1">
                      <CheckCircle size={14} /> Verify
                    </button>
                    <button onClick={() => handleRejectItem(li.lead.id, li.itemIndex)}
                      className="flex-1 h-8 md:h-9 rounded-lg bg-destructive/15 text-destructive font-medium text-xs md:text-sm hover:bg-destructive/25 transition-colors flex items-center justify-center gap-1">
                      <XCircle size={14} /> Reject
                    </button>
                    <button onClick={() => handleDeleteItem(li.lead.id, li.itemIndex)}
                      className="w-8 md:w-9 h-8 md:h-9 rounded-lg bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors flex items-center justify-center shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                {tab === "verified" && (
                  <div className="flex gap-1.5 md:gap-2 pt-1">
                    <button onClick={() => handleRevokeItem(li.lead.id, li.itemIndex)}
                      className="flex-1 h-8 md:h-9 rounded-lg bg-warning/15 text-warning font-medium text-xs md:text-sm hover:bg-warning/25 transition-colors flex items-center justify-center gap-1">
                      <RotateCcw size={14} /> Revoke
                    </button>
                    <button onClick={() => handleRejectItem(li.lead.id, li.itemIndex)}
                      className="flex-1 h-8 md:h-9 rounded-lg bg-destructive/15 text-destructive font-medium text-xs md:text-sm hover:bg-destructive/25 transition-colors flex items-center justify-center gap-1">
                      <XCircle size={14} /> Reject
                    </button>
                    <button onClick={() => handleDeleteItem(li.lead.id, li.itemIndex)}
                      className="w-8 md:w-9 h-8 md:h-9 rounded-lg bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors flex items-center justify-center shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                {tab === "rejected" && (
                  <div className="flex gap-1.5 md:gap-2 pt-1">
                    <button onClick={() => handleRevokeItem(li.lead.id, li.itemIndex)}
                      className="flex-1 h-8 md:h-9 rounded-lg bg-warning/15 text-warning font-medium text-xs md:text-sm hover:bg-warning/25 transition-colors flex items-center justify-center gap-1">
                      <RotateCcw size={14} /> To Pending
                    </button>
                    <button onClick={() => handleVerifyItem(li.lead.id, li.itemIndex)}
                      className="flex-1 h-8 md:h-9 rounded-lg bg-success/15 text-success font-medium text-xs md:text-sm hover:bg-success/25 transition-colors flex items-center justify-center gap-1">
                      <CheckCircle size={14} /> Approve
                    </button>
                    <button onClick={() => handleDeleteItem(li.lead.id, li.itemIndex)}
                      className="w-8 md:w-9 h-8 md:h-9 rounded-lg bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors flex items-center justify-center shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                {/* Admin freeze / release — available on active sale cards */}
                {(tab === "pending" || tab === "verified") && currentUser && (
                  <AdminFreezeControl
                    lead={li.lead}
                    admin={{ uid: currentUser.uid, name: currentUser.name }}
                    now={now}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Admin freeze / extend / release control ─── */

function AdminFreezeControl({
  lead,
  admin,
  now,
}: {
  lead: Lead;
  admin: { uid: string; name: string };
  now: number;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(lead.saleFrozenDays || 1);
  const [busy, setBusy] = useState<"freeze" | "release" | null>(null);

  const remainingMs = tsToMs(lead.saleFrozenUntil) - now;
  const isFrozen = !!lead.saleFrozen && remainingMs > 0;

  const freeze = async () => {
    if (!admin.uid) return;
    setBusy("freeze");
    try {
      await applySaleFreeze({ user: admin, phone: lead.phone, days, leadId: lead.id });
      await updateDoc(doc(db, "leads", lead.id), { ...buildLeadFreezeFields(days, admin.name), lastUpdated: serverTimestamp() });
      toast({ title: isFrozen ? "Freeze updated" : "Number frozen", description: `Frozen for ${days} day${days > 1 ? "s" : ""}.` });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to freeze.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const release = async () => {
    if (!admin.uid) return;
    setBusy("release");
    try {
      await adminReleaseLock({ admin, phone: lead.phone });
      await updateDoc(doc(db, "leads", lead.id), { ...clearedLeadFreezeFields(), lastUpdated: serverTimestamp() });
      toast({ title: "Freeze released", description: "This number is claimable again." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to release.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-success/20 bg-success/5 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
          <Snowflake size={12} className="text-success shrink-0" />
          {isFrozen ? (
            <span className="truncate">
              Frozen · <span className="text-success font-medium">{formatDuration(remainingMs)} left</span>
              {lead.saleFrozenByName ? ` · by ${lead.saleFrozenByName}` : ""}
            </span>
          ) : (
            "Not frozen"
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setOpen((o) => !o)}
            className="h-6 px-2 rounded-md bg-success/10 text-success text-[11px] font-medium hover:bg-success/20 transition-colors"
          >
            {isFrozen ? "Extend" : "Freeze"}
          </button>
          {isFrozen && (
            <button
              onClick={release}
              disabled={busy !== null}
              className="h-6 px-2 rounded-md bg-destructive/10 text-destructive text-[11px] font-medium hover:bg-destructive/20 disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              {busy === "release" ? <Loader2 size={11} className="animate-spin" /> : <ShieldOff size={11} />} Release
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-7 px-2 rounded-md bg-card border border-border text-foreground text-xs outline-none focus:border-primary"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>
            ))}
          </select>
          <button
            onClick={freeze}
            disabled={busy !== null}
            className="h-7 px-3 rounded-md bg-success text-white text-[11px] font-medium disabled:opacity-50 flex items-center gap-1 hover:bg-success/90 transition-colors"
          >
            {busy === "freeze" ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
            {isFrozen ? "Update freeze" : "Freeze number"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Frozen number card (Frozen Numbers tab) ─── */

function FrozenNumberCard({
  lead,
  admin,
  now,
  memberName,
}: {
  lead: Lead;
  admin: { uid: string; name: string };
  now: number;
  memberName: string;
}) {
  const remainingMs = tsToMs(lead.saleFrozenUntil) - now;
  const frozenAtMs = tsToMs(lead.saleFrozenAt);
  const untilMs = tsToMs(lead.saleFrozenUntil);

  return (
    <div className="bg-card border border-success/30 rounded-xl p-3 md:p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground text-sm md:text-base">{lead.displayName || formatPhoneDisplay(lead.phone)}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-[10px] md:text-xs text-muted-foreground font-mono">{formatPhoneDisplay(lead.phone)}</p>
            <a href={getCallUrl(lead.phone)} className="w-5 h-5 rounded flex items-center justify-center text-info hover:bg-info/10 transition-colors" title="Call">
              <Phone size={11} />
            </a>
            <a href={getWhatsAppUrl(lead.phone)} target="_blank" rel="noopener noreferrer" className="w-5 h-5 rounded flex items-center justify-center text-success hover:bg-success/10 transition-colors" title="WhatsApp">
              <MessageCircle size={11} />
            </a>
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-success/15 text-success">
          <Snowflake size={12} /> {formatDuration(remainingMs)} left
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Sold by:</span>{" "}
          <span className="text-foreground font-medium">{memberName}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Freeze length:</span>{" "}
          <span className="text-foreground font-medium">{lead.saleFrozenDays || 1} day{(lead.saleFrozenDays || 1) > 1 ? "s" : ""}</span>
        </div>
        {frozenAtMs > 0 && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Frozen at:</span>{" "}
            <span className="text-foreground font-mono text-[10px]">{format(new Date(frozenAtMs), "dd MMM yyyy, hh:mm a")}</span>
          </div>
        )}
        {untilMs > 0 && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Unfreezes:</span>{" "}
            <span className="text-foreground font-mono text-[10px]">{format(new Date(untilMs), "dd MMM yyyy, hh:mm a")}</span>
          </div>
        )}
      </div>

      <AdminFreezeControl lead={lead} admin={admin} now={now} />
    </div>
  );
}

/* ─── Duplicate group card (one number, all competing members' sales) ─── */

function DuplicateGroupCard({
  phone,
  items,
  getMemberName,
  onApproveWinner,
  onReject,
  onRevoke,
  onDelete,
}: {
  phone: string;
  items: { lead: Lead; item: SaleDetail; itemIndex: number }[];
  getMemberName: (uid: string) => string;
  onApproveWinner: (leadId: string, itemIndex: number) => void;
  onReject: (leadId: string, itemIndex: number) => void;
  onRevoke: (leadId: string, itemIndex: number) => void;
  onDelete: (leadId: string, itemIndex: number) => void;
}) {
  const memberCount = new Set(items.map((i) => i.lead.assignedTo)).size;
  const verifiedCount = items.filter((i) => i.item.verificationStatus === "verified").length;

  return (
    <div className="bg-card border border-destructive/40 rounded-xl p-3 md:p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono font-semibold text-foreground text-sm md:text-base">{formatPhoneDisplay(phone)}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <a href={getCallUrl(phone)} className="w-5 h-5 rounded flex items-center justify-center text-info hover:bg-info/10 transition-colors" title="Call"><Phone size={11} /></a>
            <a href={getWhatsAppUrl(phone)} target="_blank" rel="noopener noreferrer" className="w-5 h-5 rounded flex items-center justify-center text-success hover:bg-success/10 transition-colors" title="WhatsApp"><MessageCircle size={11} /></a>
            <span className="text-[10px] text-destructive font-medium inline-flex items-center gap-1"><AlertTriangle size={10} /> {memberCount} members · {items.length} sales</span>
          </div>
        </div>
        {verifiedCount > 1 && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-warning/15 text-warning">
            <AlertTriangle size={11} /> {verifiedCount} verified — should be 1
          </span>
        )}
      </div>

      {/* Competing entries */}
      <div className="space-y-2">
        {items.map((li) => {
          const st = li.item.verificationStatus;
          const submittedSec = (li.item.submittedAt as any)?.seconds;
          return (
            <div
              key={`${li.lead.id}-${li.itemIndex}`}
              className={`rounded-lg border p-2.5 space-y-2 ${st === "verified" ? "border-success/40 bg-success/5" : st === "rejected" ? "border-destructive/30 bg-destructive/5 opacity-70" : "border-border"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm">{getMemberName(li.lead.assignedTo)}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {li.item.category?.replace(/_/g, " ") || "—"}
                    {li.item.packageKey && li.item.packageKey !== "custom" ? ` · ${li.item.packageKey}` : ""}
                    {submittedSec ? ` · ${format(new Date(submittedSec * 1000), "dd MMM, hh:mm a")}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="font-display font-bold text-primary text-sm">{formatCurrency(li.item.amount || 0)}</span>
                  <span className={`font-medium px-2 py-0.5 rounded-full text-[10px] ${st === "verified" ? "bg-success/15 text-success" : st === "rejected" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>
                    {st === "verified" ? "Verified ✓" : st === "rejected" ? "Rejected ✗" : "Pending ⏳"}
                  </span>
                </div>
              </div>

              {/* Proof + screenshot */}
              {(li.item.proofImageUrl || li.item.proofNote || li.item.paymentScreenshotUrl) && (
                <div className="rounded-md bg-elevated/40 border border-border p-2 space-y-1">
                  {li.item.paymentScreenshotUrl && (
                    <a href={li.item.paymentScreenshotUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-info flex items-center gap-1 hover:underline">
                      <ExternalLink size={11} /> Payment screenshot
                    </a>
                  )}
                  {li.item.proofImageUrl && (
                    <a href={li.item.proofImageUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-info flex items-center gap-1 hover:underline">
                      <ExternalLink size={11} /> Call-record / proof image
                    </a>
                  )}
                  {li.item.proofNote && (
                    <p className="text-[11px] text-foreground flex items-start gap-1">
                      <FileText size={11} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="whitespace-pre-wrap break-words">{li.item.proofNote}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-1.5">
                {st !== "verified" ? (
                  <button onClick={() => onApproveWinner(li.lead.id, li.itemIndex)}
                    className="flex-1 h-8 rounded-lg bg-success/15 text-success font-medium text-xs hover:bg-success/25 transition-colors flex items-center justify-center gap-1">
                    <CheckCircle size={13} /> Approve this
                  </button>
                ) : (
                  <button onClick={() => onRevoke(li.lead.id, li.itemIndex)}
                    className="flex-1 h-8 rounded-lg bg-warning/15 text-warning font-medium text-xs hover:bg-warning/25 transition-colors flex items-center justify-center gap-1">
                    <RotateCcw size={13} /> Revoke
                  </button>
                )}
                {st !== "rejected" && (
                  <button onClick={() => onReject(li.lead.id, li.itemIndex)}
                    className="flex-1 h-8 rounded-lg bg-destructive/15 text-destructive font-medium text-xs hover:bg-destructive/25 transition-colors flex items-center justify-center gap-1">
                    <XCircle size={13} /> Reject
                  </button>
                )}
                <button onClick={() => onDelete(li.lead.id, li.itemIndex)}
                  className="w-8 h-8 rounded-lg bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors flex items-center justify-center shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">Approving one auto-rejects the competing sale(s) on this number.</p>
    </div>
  );
}
