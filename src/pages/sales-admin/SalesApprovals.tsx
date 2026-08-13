import { useState, useEffect, useCallback, useMemo } from "react";
import { updateDoc, doc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { fetchTeamMembers, subscribeTeamLeads } from "@/services/teamLeads";
import { sendNotification } from "@/services/notifications";
import { logActivity } from "@/services/activityLog";
import { upsertOrderForSale, cancelOrderForSale } from "@/services/orders";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency, formatDuration } from "@/utils/formatters";
import { discountEditLabel, discountSummary } from "@/utils/bulkDiscount";
import { EARNED_REASON_LABEL, MEMBER_DISCOUNT_LIMIT_PERCENT, earnedReasons, saleDiscountOf } from "@/utils/saleDiscount";
import { bulkCategoryLabel, categoryLabel } from "@/utils/serviceCatalog";
import { useNow } from "@/hooks/useNow";
import { applySaleFreeze, adminReleaseLock, buildLeadFreezeFields, clearedLeadFreezeFields, clearSaleFreeze } from "@/services/numberLock";
import { format, subDays, startOfDay } from "date-fns";
import type { AppUser, Lead, SaleDetail } from "@/types";
import { CheckCircle, XCircle, ShoppingBag, ExternalLink, RotateCcw, Trash2, CheckSquare, Square, Phone, MessageCircle, AlertTriangle, FileText, Snowflake, Lock, ShieldOff, Loader2, Search, X, BadgePercent } from "lucide-react";
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

function getDayLabel(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

export default function SalesApprovals() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "verified" | "rejected" | "duplicates" | "frozen">("pending");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  // Quick Today/Yesterday/last-5-days filter (same pattern used in Work Assign) — defaults to
  // Today. An exact calendar date picked below takes precedence over this quick filter.
  const [dayFilter, setDayFilter] = useState<string>("0");
  /**
   * Free-text search and a single-member filter, shared by every tab.
   *
   * Deliberately outside the tab state: an admin hunting for one sale does not know, and should
   * not have to know, whether it is sitting in Pending, Verified or Rejected — so the same query
   * narrows all of them and the tab counts show where it ended up.
   */
  const [search, setSearch] = useState("");
  const [soldBy, setSoldBy] = useState<string>("all");
  const recentDays = useMemo(() => {
    const days: { date: Date; dateStr: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = subDays(new Date(), i);
      days.push({ date: startOfDay(d), dateStr: format(d, "dd/MM/yyyy"), label: getDayLabel(d) });
    }
    return days;
  }, []);
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

  /**
   * Verifying a sale is agreeing its price.
   *
   * A sale discounted past what a member may give on their own has been sitting out of the tech
   * queue entirely, waiting for exactly this decision — so approving it here is what releases it.
   * Keeping them as one action rather than two is deliberate: an admin who has just looked at the
   * amount, the payment screenshot and the discount and pressed Verify has made the decision, and
   * a second button asking them to make it again is a second button that gets forgotten, leaving
   * the sale verified and the work never started.
   */
  const approveOnVerify = (item: SaleDetail): SaleDetail => ({
    ...item,
    verificationStatus: "verified",
    verifiedAt: Timestamp.now(),
    ...(item.discountNeedsApproval
      ? {
          discountApproval: "approved" as const,
          discountApprovedBy: currentUser?.name || null,
          discountApprovedAt: Timestamp.now(),
          discountRejectionReason: null,
        }
      : {}),
  });

  // ── Single item actions ──────────────────────────────────────────────────

  const handleVerifyItem = async (leadId: string, itemIndex: number) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    try {
      const items = [...getAllItems(lead)];
      const oldItem = items[itemIndex];
      items[itemIndex] = approveOnVerify(oldItem);
      await updateDoc(doc(db, "leads", leadId), { saleItems: items, lastUpdated: serverTimestamp() });
      // Verified sale → create/refresh the Order so it enters the tech "Orders" queue.
      await upsertOrderForSale({ lead, item: items[itemIndex], itemIndex, verifierUid: currentUser!.uid, saleVerified: true, soldByName: getMemberName(lead.assignedTo) });
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
      // Sale left "verified" → pull its Order out of the tech queue.
      await cancelOrderForSale({ leadId, item: oldItem, itemIndex });
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
      // Back to pending → pull its Order out of the tech queue.
      await cancelOrderForSale({ leadId, item: oldItem, itemIndex });
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
      // Cancel its Order before the splice reshuffles indexes (order id is keyed on submittedAt).
      await cancelOrderForSale({ leadId, item: oldItem, itemIndex });
      items.splice(itemIndex, 1);
      const updates: Record<string, any> = { saleItems: items, lastUpdated: serverTimestamp() };
      // No sales left → the number is no longer "sold", so lift the sale-freeze (type 2)
      // but KEEP the lead with the member (the number itself is not deleted).
      const noSalesLeft = items.length === 0;
      if (noSalesLeft) { updates.saleDone = false; updates.saleDetails = null; Object.assign(updates, clearedLeadFreezeFields()); }
      await updateDoc(doc(db, "leads", leadId), updates);
      if (noSalesLeft) {
        try {
          await clearSaleFreeze({ phone: lead.phone, actor: currentUser ? { uid: currentUser.uid, name: currentUser.name } : undefined });
        } catch { /* freeze clear is best-effort */ }
      }
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
      wItems[itemIndex] = approveOnVerify(wOld);
      await updateDoc(doc(db, "leads", leadId), { saleItems: wItems, lastUpdated: serverTimestamp() });
      // Winner verified → create its Order for the tech queue.
      await upsertOrderForSale({ lead: winner, item: wItems[itemIndex], itemIndex, verifierUid: currentUser!.uid, saleVerified: true, soldByName: getMemberName(winner.assignedTo) });

      // 2) Reject every still-standing competing sale on the SAME number held by OTHER members.
      //    Never touch the winner's own leads, nor frozen/taken-over or admin-cleared leads —
      //    those are legitimate earlier/separate sales, not part of this dispute.
      const competitors = leads.filter(
        (l) => l.assignedTo !== winner.assignedTo && normalizePhone(l.phone) === np && !l.frozen && !l.duplicateCleared,
      );
      for (const c of competitors) {
        const cItems = getAllItems(c);
        if (!cItems.some((it) => it.verificationStatus !== "rejected")) continue; // already all rejected
        const newItems = cItems.map((it) =>
          it.verificationStatus === "rejected" ? it : { ...it, verificationStatus: "rejected" as const, verifiedAt: null },
        );
        await updateDoc(doc(db, "leads", c.id), { saleItems: newItems, lastUpdated: serverTimestamp() });
        // Any previously-verified competing sale must drop out of the tech queue too.
        for (let ci = 0; ci < cItems.length; ci++) {
          await cancelOrderForSale({ leadId: c.id, item: cItems[ci], itemIndex: ci });
        }
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
          if (l.assignedTo !== winner.assignedTo && normalizePhone(l.phone) === np && !l.frozen && !l.duplicateCleared) {
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

  // ── "Not a duplicate" — mark a number's competing sales as legitimate separate sales ──
  // Both sales stand and go through normal approval; the number leaves the Duplicates tab.
  const handleMarkNotDuplicate = async (phone: string) => {
    const np = normalizePhone(phone);
    const affected = leads.filter((l) => normalizePhone(l.phone) === np && l.saleDone && !l.frozen);
    if (affected.length === 0) return;
    try {
      await Promise.all(
        affected.map((l) => updateDoc(doc(db, "leads", l.id), { duplicateCleared: true, lastUpdated: serverTimestamp() })),
      );
      setLeads((prev) => prev.map((l) => (normalizePhone(l.phone) === np && !l.frozen ? { ...l, duplicateCleared: true } : l)));
      await logActivity({
        actorId: currentUser!.uid,
        actorName: currentUser!.name,
        actorRole: "sales_admin",
        adminId: currentUser!.uid,
        action: "resolved_duplicate_sale",
        details: { phone: np, outcome: "marked_separate_sales", members: affected.map((l) => getMemberName(l.assignedTo)) },
      });
      toast({ title: "Marked as separate sales", description: "These are no longer treated as a duplicate — both sales can be approved normally." });
    } catch {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
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
        affected.forEach(({ itemIndex }) => {
          items[itemIndex] = approveOnVerify(items[itemIndex]);
        });
        await updateDoc(doc(db, "leads", leadId), { saleItems: items, lastUpdated: serverTimestamp() });
        // Each verified sale → an Order in the tech queue.
        for (const { itemIndex } of affected) {
          await upsertOrderForSale({ lead, item: items[itemIndex], itemIndex, verifierUid: currentUser!.uid, saleVerified: true, soldByName: getMemberName(lead.assignedTo) });
        }
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
        // Each rejected sale → pull its Order from the tech queue.
        for (const { itemIndex } of affected) {
          await cancelOrderForSale({ leadId, item: items[itemIndex], itemIndex });
        }
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

  // An exact calendar date (selectedDate) takes precedence; otherwise fall back to the quick
  // Today/Yesterday/last-5-days dropdown (dayFilter). "all" (from either) means no date filter.
  const dateStr = selectedDate
    ? format(selectedDate, "dd/MM/yyyy")
    : dayFilter !== "all"
      ? recentDays[parseInt(dayFilter)]?.dateStr ?? null
      : null;
  // "Today" also surfaces any older item still awaiting verification, so a still-pending sale
  // never silently disappears from view just because a day has passed (mirrors Work Assign).
  const isTodayFilter = !selectedDate && dayFilter === "0";

  type LeadItem = { lead: Lead; item: SaleDetail; itemIndex: number };
  const allLeadItems: LeadItem[] = leads.flatMap((lead) =>
    getAllItems(lead).map((item, idx) => ({ lead, item, itemIndex: idx }))
  );

  /**
   * Everything about one sale, flattened into a string the search box matches against.
   *
   * ── Why one blob rather than a field picker ───────────────────────────────────────────────────
   * An admin looking for a sale does not know which field they remember it by. It might be the
   * client's name, half a phone number, the member who sold it, "cinematic", "45 Seconds", the
   * business on the ad, or the amount. A search that only covered names would fail on most of
   * those, and a row of per-field boxes asks the admin to classify their own memory before they
   * can use it. Everything printed on the card is searchable, because everything printed on the
   * card is something somebody will type.
   *
   * The phone is included both as typed and as digits only, so "9876" finds "+91 98765 43210".
   */
  const searchBlobFor = useCallback((li: LeadItem): string => {
    const { lead, item } = li;
    return [
      lead.displayName,
      lead.realName,
      lead.phone,
      lead.phone.replace(/\D/g, ""),
      getMemberName(lead.assignedTo),
      categoryLabel(item.category),
      item.category,
      item.packageKey,
      item.customDescription,
      item.requirement?.businessName,
      item.bulkAdType ? categoryLabel(item.bulkAdType) : "",
      // Both forms of the money, because the admin reads "₹61,457" off the card and types it back
      // with the comma, while the stored figure is 61457.
      item.amount ? String(item.amount) : "",
      item.amount ? item.amount.toLocaleString("en-IN") : "",
      lead.notes,
    ].filter(Boolean).join(" ").toLowerCase();
  }, [getMemberName]);

  const searchTerms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

  /**
   * The search and the member filter, applied to every tab alike.
   *
   * All terms must match, in any order and any field — typing "kusuma cinematic" finds Kusuma's
   * cinematic sales rather than everything mentioning either word.
   */
  const matchesFilters = useCallback((li: LeadItem): boolean => {
    if (soldBy !== "all" && li.lead.assignedTo !== soldBy) return false;
    if (searchTerms.length === 0) return true;
    const blob = searchBlobFor(li);
    return searchTerms.every((t) => blob.includes(t));
  }, [soldBy, searchTerms.join(" "), searchBlobFor]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Members who actually have a sale in view, so the dropdown never offers an empty result. */
  const sellersInView = useMemo(() => {
    const byId = new Map<string, string>();
    allLeadItems.forEach(({ lead }) => {
      if (!byId.has(lead.assignedTo)) byId.set(lead.assignedTo, getMemberName(lead.assignedTo));
    });
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allLeadItems.length, members]); // eslint-disable-line react-hooks/exhaustive-deps

  // Duplicate DISPUTE detection based on the freeze/validity window.
  // Two members on the same number are a dispute ONLY if their sale-protection (freeze) windows
  // OVERLAP. Sequential sales — a later member selling after the earlier member's validity ended —
  // are separate legitimate sales, not a dispute. Frozen/taken-over and admin-cleared leads excluded.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const numberWindows = new Map<string, { memberId: string; start: number; end: number }[]>();
  leads.forEach((l) => {
    if (!l.saleDone || l.frozen || l.duplicateCleared) return;
    const subs = getAllItems(l)
      .map((i) => ((i.submittedAt as any)?.seconds ? (i.submittedAt as any).seconds * 1000 : 0))
      .filter((n) => n > 0);
    const start = subs.length ? Math.min(...subs) : (l.createdAt?.seconds ? l.createdAt.seconds * 1000 : 0);
    const freezeEnd = tsToMs(l.saleFrozenUntil);
    const end = freezeEnd > 0 ? freezeEnd : start + ONE_DAY_MS; // fallback: minimum 1-day validity
    const np = normalizePhone(l.phone);
    if (!numberWindows.has(np)) numberWindows.set(np, []);
    numberWindows.get(np)!.push({ memberId: l.assignedTo, start, end });
  });
  const disputedByNumber = new Map<string, Set<string>>(); // normPhone -> memberIds in a real dispute
  for (const [np, windows] of numberWindows) {
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const a = windows[i], b = windows[j];
        if (a.memberId === b.memberId) continue;
        if (a.start <= b.end && b.start <= a.end) { // overlapping protection windows → dispute
          if (!disputedByNumber.has(np)) disputedByNumber.set(np, new Set());
          disputedByNumber.get(np)!.add(a.memberId).add(b.memberId);
        }
      }
    }
  }
  const getDuplicateOthers = (lead: Lead): string[] => {
    const members = disputedByNumber.get(normalizePhone(lead.phone));
    if (!members || !members.has(lead.assignedTo) || members.size < 2) return [];
    return [...members].filter((id) => id !== lead.assignedTo).map((id) => getMemberName(id));
  };
  const pendingSubmittedDateStr = (li: LeadItem): string | null => {
    const ts = (li.item.submittedAt as any)?.seconds;
    return ts ? format(new Date(ts * 1000), "dd/MM/yyyy") : null;
  };
  const pending = allLeadItems.filter((li) => {
    if (li.item.verificationStatus !== "pending") return false;
    if (!matchesFilters(li)) return false;
    // Today (the default) or no filter at all → never hide work still awaiting verification,
    // regardless of when it was submitted. A specific single day (Yesterday / N days ago / an
    // exact calendar date) filters strictly to that day.
    if (!dateStr || isTodayFilter) return true;
    return pendingSubmittedDateStr(li) === dateStr;
  });
  const verified = allLeadItems.filter((li) => {
    if (li.item.verificationStatus !== "verified") return false;
    if (!matchesFilters(li)) return false;
    if (!dateStr) return true;
    const ts = li.lead.lastUpdated?.seconds;
    if (!ts) return false;
    return format(new Date(ts * 1000), "dd/MM/yyyy") === dateStr;
  });
  const rejected = allLeadItems.filter((li) => {
    if (li.item.verificationStatus !== "rejected") return false;
    if (!matchesFilters(li)) return false;
    if (!dateStr) return true;
    const ts = li.lead.lastUpdated?.seconds;
    if (!ts) return false;
    return format(new Date(ts * 1000), "dd/MM/yyyy") === dateStr;
  });
  // Duplicates: every sale item whose number was sold by 2+ different members (any status).
  // Sorted by number so competing sales sit side by side, then oldest submission first.
  const duplicates = allLeadItems
    .filter((li) => getDuplicateOthers(li.lead).length > 0 && matchesFilters(li))
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
    /*
      A frozen NUMBER matches if any of the sales on it does.
      One number can carry several services — an ad, a logo and a website — so testing only the
      first would hide the number when the admin searched for the second thing sold on it.
    */
    .filter((l) => {
      const items = getAllItems(l);
      if (items.length === 0) return matchesFilters({ lead: l, item: {} as SaleDetail, itemIndex: 0 });
      return items.some((item, idx) => matchesFilters({ lead: l, item, itemIndex: idx }));
    })
    .sort((a, b) => tsToMs(a.saleFrozenUntil) - tsToMs(b.saleFrozenUntil));

  const displayItems =
    tab === "pending" ? pending : tab === "verified" ? verified : tab === "rejected" ? rejected : tab === "duplicates" ? duplicates : [];

  const pendingKeys = pending.map((li) => makeKey(li.lead.id, li.itemIndex));
  const allPendingSelected = pendingKeys.length > 0 && pendingKeys.every((k) => selectedKeys.has(k));

  /** Discounted sales in the pending queue, and how many are past a member's own authority. */
  const discountedPending = useMemo(() => {
    let total = 0;
    let overLimit = 0;
    for (const li of pending) {
      if (saleDiscountOf(li.item).amount <= 0) continue;
      total += 1;
      if (li.item.discountNeedsApproval && li.item.discountApproval !== "approved") overLimit += 1;
    }
    return { total, overLimit };
  }, [pending]);
  const someSelected = selectedKeys.size > 0 && tab === "pending";

  // Totals — the filtered-list total is always visible (no selection needed); the selected
  // total appears alongside it once the admin ticks contacts to verify.
  const filteredTotal = displayItems.reduce((sum, li) => sum + (li.item.amount || 0), 0);
  const selectedTotal = tab === "pending"
    ? displayItems.filter((li) => selectedKeys.has(makeKey(li.lead.id, li.itemIndex))).reduce((sum, li) => sum + (li.item.amount || 0), 0)
    : 0;

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
            {selectedDate ? `Filtered: ${format(selectedDate, "dd/MM/yyyy")}` : dayFilter !== "all" ? `Filtered: ${recentDays[parseInt(dayFilter)]?.label}` : "Verify sales reported by your team"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!selectedDate && (
            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}
              className="h-9 rounded-lg border border-border bg-card px-3 text-xs md:text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20">
              {recentDays.map((d, i) => (
                <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, "dd/MM")})</option>
              ))}
              <option value="all">All Days</option>
            </select>
          )}
          <DashboardDayPicker selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setDayFilter("all"); }} />
          {(selectedDate || dayFilter !== "0") && (
            <button onClick={() => { setSelectedDate(undefined); setDayFilter("0"); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
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

      {/*
        Search and member filter.

        Below the tabs rather than beside the date controls in the header: the header row is
        already full on a phone, and these two narrow what is IN the tabs, so they read correctly
        sitting between the tabs and the list they act on. The counts in the tabs above update
        with them, which is how an admin sees that the sale they searched for is in Verified.
      */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-test="approvals-search"
            placeholder="Search name, number, sold by, package, business, amount…"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-8 text-xs text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 md:text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {/* Side by side on a phone, so the two controls do not eat two rows between the tabs
            and the list they filter. */}
        <div className="flex items-center gap-2">
          <select
            value={soldBy}
            onChange={(e) => setSoldBy(e.target.value)}
            data-test="approvals-sold-by"
            aria-label="Filter by who sold it"
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20 sm:flex-none md:text-sm"
          >
            <option value="all">All members ({sellersInView.length})</option>
            {sellersInView.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {(search || soldBy !== "all") && (
            <button
              onClick={() => { setSearch(""); setSoldBy("all"); }}
              data-test="approvals-clear-filters"
              className="h-9 shrink-0 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Total for the current tab + date filter — always visible, no selection required */}
      {(tab === "pending" || tab === "verified" || tab === "rejected") && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
          <span className="text-xs md:text-sm text-muted-foreground capitalize">{tab} total ({displayItems.length} sale{displayItems.length === 1 ? "" : "s"})</span>
          <span className="font-display font-bold text-foreground text-base md:text-lg">{formatCurrency(filteredTotal)}</span>
        </div>
      )}

      {/*
        How many of the sales waiting here had money taken off.

        Said once, above the queue, because the failure this prevents is a batch approval: "Select
        all → Verify" is the fastest way through a morning's pending sales and it is also the
        fastest way to agree a price nobody looked at. One line naming the count is enough to make
        somebody open those cards first — every discounted sale carries a tag, and the ones past a
        member's own limit say so in orange.
      */}
      {tab === "pending" && discountedPending.total > 0 && (
        <div data-test="approvals-discount-heads-up"
          className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 ${
            discountedPending.overLimit > 0
              ? "border-warning/40 bg-warning/10"
              : "border-info/30 bg-info/10"
          }`}>
          <BadgePercent size={14} className={`mt-0.5 shrink-0 ${discountedPending.overLimit > 0 ? "text-warning" : "text-info"}`} />
          <p className={`text-xs leading-relaxed ${discountedPending.overLimit > 0 ? "text-warning" : "text-info"}`}>
            <b>{discountedPending.total} of these {pending.length === 1 ? "sale has" : "sales have"} a discount</b>
            {discountedPending.overLimit > 0 && (
              <> — {discountedPending.overLimit} past the {MEMBER_DISCOUNT_LIMIT_PERCENT}% a member may
              give alone, and held from the tech team until you agree the price</>
            )}
            . Worth opening those before verifying in bulk.
          </p>
        </div>
      )}

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
                {selectedKeys.size} selected · {formatCurrency(selectedTotal)}
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
                onMarkNotDuplicate={handleMarkNotDuplicate}
              />
            ))}
          </div>
        )
      ) : /* Items */ displayItems.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          {/* An empty list because of a filter is a different fact from an empty list, and saying
              which one it is saves the admin wondering whether the sale was deleted. */}
          {search || soldBy !== "all" ? (
            <>
              <Search size={32} className="mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Nothing in <span className="capitalize">{tab}</span> matches
                {search ? <> “<b className="text-foreground">{search}</b>”</> : null}
                {soldBy !== "all" ? <> for <b className="text-foreground">{sellersInView.find((m) => m.id === soldBy)?.name}</b></> : null}.
              </p>
              <button
                onClick={() => { setSearch(""); setSoldBy("all"); }}
                className="mt-3 text-xs font-medium text-primary hover:underline"
              >
                Clear the filters
              </button>
            </>
          ) : (
            <>
              <ShoppingBag size={32} className="mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No {tab} sales</p>
            </>
          )}
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
                    <span data-test="approval-category" className="text-foreground font-medium">
                      {li.item.category ? bulkCategoryLabel(li.item.category, li.item.bulkAdType) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Package:</span>{" "}
                    <span className="text-foreground font-medium">{li.item.packageKey || "—"}</span>
                  </div>
                  {/* A bulk order's price is quantity × unit × discount. Approving it means
                      approving that arithmetic, so all three are on the card rather than a total.
                      The discount is shown in the unit the member gave it in. */}
                  {!!li.item.quantity && li.item.quantity > 1 && (
                    <div>
                      <span className="text-muted-foreground">Quantity:</span>{" "}
                      <span className="text-foreground font-medium">
                        {li.item.quantity} × {formatCurrency(li.item.unitAmount || 0)}
                        {discountSummary(li.item).replace(" · ", " − ").replace(" off", "")}
                      </span>
                    </div>
                  )}
                  {/*
                    Any discount at all, said on the card.

                    The warning below only fires past the member's own limit, which left the
                    ordinary case invisible: a price quietly reduced by a few hundred rupees looked
                    identical to one that was not. An approver checking a figure needs to know it
                    was reduced even when nobody needed permission — that is the whole job.
                  */}
                  {saleDiscountOf(li.item).amount > 0 && (
                    <div className="col-span-2">
                      <span data-test="approval-discount-tag"
                        title="The price the client was quoted, less what was taken off"
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          li.item.discountNeedsApproval
                            ? "bg-warning/15 text-warning"
                            : "bg-info/15 text-info"
                        }`}>
                        <BadgePercent size={9} />
                        {saleDiscountOf(li.item).label}
                      </span>
                    </div>
                  )}
                  {li.item.discountEdited && !!li.item.quantity && li.item.quantity > 1 && (
                    <div className="col-span-2">
                      <span data-test="approval-discount-edited"
                        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        <AlertTriangle size={9} />
                        {discountEditLabel(li.item.suggestedDiscountPercent || 0, li.item.discountPercent || 0)}
                      </span>
                    </div>
                  )}

                  {/* What the client did to earn a discount, with the proof one tap away. This is
                      the evidence the admin is actually approving. */}
                  {earnedReasons(li.item.earnedDiscount).length > 0 && (
                    <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                      {earnedReasons(li.item.earnedDiscount).map((reason) => {
                        const url = li.item.earnedDiscount?.[reason]?.screenshotUrl;
                        return (
                          <a key={reason} href={url || "#"} target="_blank" rel="noopener noreferrer"
                            data-test={`approval-earned-${reason}`}
                            className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success hover:bg-success/25">
                            <ExternalLink size={9} /> {EARNED_REASON_LABEL[reason]}
                          </a>
                        );
                      })}
                      {!!li.item.earnedDiscountAmount && (
                        <span className="text-[10px] text-muted-foreground">
                          − {formatCurrency(li.item.earnedDiscountAmount)}
                        </span>
                      )}
                    </div>
                  )}

                  {/*
                    A sale the tech team has not been given, and will not be until this card is
                    approved. Stated in exactly those terms: the reason it is worth an admin's
                    attention is not that the price is unusual, it is that a client is waiting and
                    nobody has started.
                  */}
                  {li.item.discountNeedsApproval && li.item.discountApproval !== "approved" && (
                    <div className="col-span-2">
                      <div data-test="approval-discount-hold"
                        className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5">
                        <Lock size={11} className="mt-0.5 shrink-0 text-warning" />
                        <p className="text-[10px] leading-relaxed text-warning">
                          <b>Held from the tech team.</b> This is more than the {MEMBER_DISCOUNT_LIMIT_PERCENT}%
                          a member may give alone, so no work has started. Verifying agrees the price
                          and releases it.
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Charged to the client for changes beyond the brief. Shown here so the admin
                      knows why the client owes more than the sale — and it is deliberately not
                      added to the sale amount, so it never reaches the member's commission. */}
                  {!!li.item.penaltyTotal && (
                    <div className="col-span-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                        <AlertTriangle size={9} /> Penalty {formatCurrency(li.item.penaltyTotal)}
                        {li.item.penaltyClips ? ` · ${li.item.penaltyClips} clip${li.item.penaltyClips === 1 ? "" : "s"}` : ""} — not sales revenue
                      </span>
                    </div>
                  )}
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
  onMarkNotDuplicate,
}: {
  phone: string;
  items: { lead: Lead; item: SaleDetail; itemIndex: number }[];
  getMemberName: (uid: string) => string;
  onApproveWinner: (leadId: string, itemIndex: number) => void;
  onReject: (leadId: string, itemIndex: number) => void;
  onRevoke: (leadId: string, itemIndex: number) => void;
  onDelete: (leadId: string, itemIndex: number) => void;
  onMarkNotDuplicate: (phone: string) => void;
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

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
        <p className="text-[10px] text-muted-foreground">Approving one auto-rejects the competing sale(s).</p>
        <button
          onClick={() => onMarkNotDuplicate(phone)}
          className="shrink-0 h-7 px-2.5 rounded-md bg-info/10 text-info text-[11px] font-medium hover:bg-info/20 transition-colors inline-flex items-center gap-1"
          title="These are legitimate separate sales by different members (e.g. a repeat sale after the earlier freeze ended) — keep both, not a dispute"
        >
          <CheckCircle size={12} /> Not a duplicate — separate sales
        </button>
      </div>
    </div>
  );
}
