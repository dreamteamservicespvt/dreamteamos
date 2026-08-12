import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { logActivity } from "@/services/activityLog";
import { uploadToCloudinary } from "@/services/cloudinary";
import { claimNumber, applySaleFreeze, releaseLockForLead, buildLeadFreezeFields, fetchNumberLock, clearSaleFreeze, clearedLeadFreezeFields } from "@/services/numberLock";
import { findMemberDuplicates, resolveNonSaleDuplicates } from "@/services/duplicateLeads";
import { formatCurrency, formatDuration } from "@/utils/formatters";
import { leadActivityDay, leadActivityMs } from "@/utils/leadActivity";
import { normalizePhone, getCallUrl, getWhatsAppUrl, buildLeadGreeting } from "@/utils/phone";
import { useNow } from "@/hooks/useNow";
import { format, subDays, startOfDay, parseISO } from "date-fns";
import type { AppUser, Lead, LeadStatus, Order, SaleDetail, SaleEditEntry, SalePayment } from "@/types";
import {
  collectedOf, newPayment, pendingOf, pendingSales, saleItemsOf, withPayment, type PendingSale,
} from "@/utils/salePayments";
import { collectReadiness } from "@/utils/collectReadiness";
import SaleSection from "@/components/sales/SaleSection";
import SaleForm from "@/components/sales/SaleForm";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import NumberTimelineButton from "@/components/sales/NumberTimelineButton";
import PenaltyDialog from "@/components/work/PenaltyDialog";
import SalesOrderChat from "@/components/order-chat/SalesOrderChat";
import {
  SALE_CATEGORIES, PACKAGES, categoryLabel, isAdCategory, isBulkCategory, needsDescription,
  packageOptionLabel, bulkTypesFor, effectiveAdCategory, bulkCategoryLabel,
  DEFAULT_PROMOTIONAL_PACKAGE, CUSTOM_BASE_CATEGORIES,
} from "@/utils/serviceCatalog";
import {
  CLIP_PRESETS, CLIP_SECONDS, clipsForSeconds, humanDuration, priceForClips, secondsForClips,
} from "@/utils/assignmentDuration";
import {
  discountBreakdown, EARNED_DISCOUNT_PERCENT, EARNED_REASON_LABEL, MEMBER_DISCOUNT_LIMIT_PERCENT,
  type EarnedReason,
} from "@/utils/saleDiscount";
import {
  quoteBulk, suggestedDiscountPercent, maxDiscountAmount, discountSummary,
  MAX_BULK_DISCOUNT_PERCENT, type DiscountMode,
} from "@/utils/bulkDiscount";
import { presetsForCategory, buildPromise, CUSTOM_PRESET_KEY } from "@/utils/promiseSla";
import { AttireType, ModelGender, ATTIRE_OPTIONS_BY_GENDER } from "@/types/aiPlatform";
import { ATTIRE_LABELS, DEFAULT_REQUIREMENT, attireForGender, attireLabel, cleanRequirement, withRequirementDefaults } from "@/utils/adRequirement";
import { characterPackOptions, getCharacterPack } from "@/services/characterPacks";
import { watchAdLanguages, rememberAdLanguage, mergeAdLanguages } from "@/services/adLanguages";
import { upsertOrderForSale, cancelOrderForSale, addOrderUpdateNote, orderDocId } from "@/services/orders";
import { buildClientSaleMessage } from "@/utils/salesMessage";
import { dayRevenue, saleDay, type DayRevenue } from "@/utils/salesRevenue";
import {
  Search, Phone, MessageCircle, StickyNote, ChevronDown, ChevronUp, Clock, IndianRupee,
  Loader2, Check, Upload, ExternalLink, Plus, Trash2, ShoppingBag, X, Lock, AlertTriangle, Snowflake, FileText, RotateCcw, Clapperboard, Copy, Pencil, History, Send, Layers, PartyPopper, Sparkles, BadgePercent, CheckCircle2,
} from "lucide-react";
import { CUSTOM_FESTIVAL_OPTION, WISHES_FESTIVALS, isListedFestival } from "@/utils/festivals";

type TimestampLike = { toMillis?: () => number; seconds?: number } | null | undefined;
function tsToMs(ts: TimestampLike): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "not_called", label: "Not Called", color: "bg-muted-foreground/15 text-muted-foreground" },
  { value: "answered", label: "Answered", color: "bg-info/15 text-info" },
  { value: "not_answered", label: "Not Answered", color: "bg-warning/15 text-warning" },
  { value: "call_later", label: "Call Later", color: "bg-role-main-admin/15 text-role-main-admin" },
  { value: "not_interested", label: "Not Interested", color: "bg-destructive/15 text-destructive" },
];

// Sale categories + packages now live in the canonical DTS catalog (single source of truth,
// shared with Orders and the Clients "Our Works" breakdown): src/utils/serviceCatalog.ts

function fmtSaleTs(ts: any): string | null {
  const s = ts?.seconds;
  return s ? format(new Date(s * 1000), "dd MMM, hh:mm a") : null;
}

function getDayLabel(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

type SaleRow = { lead: Lead; item: SaleDetail; itemIndex: number };

export default function MyLeads() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<string>("0");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [viewTab, setViewTab] = useState<"leads" | "sales" | "duplicates">("leads");
  const [salesSearch, setSalesSearch] = useState("");
  const [salesDay, setSalesDay] = useState<string>("all");
  const [salesStatus, setSalesStatus] = useState<string>("all");
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [expandedSale, setExpandedSale] = useState<string | null>(null);

  /**
   * Arriving from an upsell in My Clients.
   *
   * The member has already chosen the client and what they are selling them; this opens that
   * lead's sale form on that category so the journey is one continuous act rather than "now go and
   * find them again in a list of four hundred". The parameters are cleared once used, so a refresh
   * — or Back into this entry — does not reopen a form they deliberately closed.
   */
  const [leadParams, setLeadParams] = useSearchParams();
  const upsellRequest = {
    leadId: leadParams.get("lead"),
    category: leadParams.get("category") || undefined,
    wantsSale: leadParams.get("sale") === "1",
  };
  useEffect(() => {
    if (!upsellRequest.leadId || !upsellRequest.wantsSale) return;
    if (!leads.some(l => l.id === upsellRequest.leadId)) return;  // still loading, or not theirs
    setExpandedSale(upsellRequest.leadId);
    const next = new URLSearchParams(leadParams);
    next.delete("sale");
    setLeadParams(next, { replace: true });
  }, [upsellRequest.leadId, upsellRequest.wantsSale, leads, leadParams, setLeadParams]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [duplicateLeadIds, setDuplicateLeadIds] = useState<Set<string>>(new Set());
  const [dupLoading, setDupLoading] = useState(true);
  // Render leads 10 at a time ("Show 10 more") — resets whenever the visible set changes.
  const [visibleLeadCount, setVisibleLeadCount] = useState(10);
  useEffect(() => { setVisibleLeadCount(10); }, [dayFilter, statusFilter, search, selectedDate, viewTab]);
  const pendingDeletesRef = useRef<Map<string, { timeoutId: ReturnType<typeof setTimeout>; intervalId: ReturnType<typeof setInterval> }>>(new Map());

  // Realtime listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "leads"), where("assignedTo", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
      list.sort((a, b) => {
        // Custom entries always at the top (newest first among custom)
        if (a.isCustomEntry && !b.isCustomEntry) return -1;
        if (!a.isCustomEntry && b.isCustomEntry) return 1;
        if (a.isCustomEntry && b.isCustomEntry) return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);

        /**
         * Just-sold leads first, then the calling queue.
         *
         * Oldest-first is the right order for numbers still to be rung — it is the queue. But it is
         * the wrong place to put the lead somebody has this second finished selling to: at the
         * bottom of a fifty-row day, which is why sellers were resorting to "All days" and a
         * search. A lead that has been worked since it arrived floats up, newest first; everything
         * untouched keeps its queue order underneath.
         */
        const aWorked = leadActivityMs(a) > (a.createdAt?.seconds || 0) * 1000;
        const bWorked = leadActivityMs(b) > (b.createdAt?.seconds || 0) * 1000;
        if (aWorked !== bWorked) return aWorked ? -1 : 1;
        if (aWorked && bWorked) return leadActivityMs(b) - leadActivityMs(a);

        // Regular leads: oldest first (daily workflow order)
        return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
      });
      setLeads(list);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // The member's own orders, so each sale row knows whether the tech team has started work on it
  // (and must therefore be locked from edit/delete). `soldBy` is the selling member's uid.
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "orders"), where("soldBy", "==", user.uid));
    return onSnapshot(q, (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order))), () => {});
  }, [user]);

  const ordersById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  // Detect duplicates — numbers another member also holds (dispute flag).
  // IMPORTANT (quota): this does cross-member reads, so it runs ONCE per page mount, not on every
  // lead change. Keying it on a changing value (e.g. the phone set) caused a feedback loop —
  // resolveNonSaleDuplicates freezes leads, which changed the key, which re-ran the scan — burning
  // through the Firestore daily read quota. A manual "Recheck" button lets the member refresh on demand.
  const dupRanRef = useRef(false);
  const runDuplicateScan = async () => {
    if (!user) return;
    // Exclude frozen (taken-over) and admin-cleared ("separate sales") leads from detection.
    const nonFrozen = leads.filter((l) => !l.frozen && !l.duplicateCleared);
    if (nonFrozen.length === 0) { setDuplicateLeadIds(new Set()); setDupLoading(false); return; }
    setDupLoading(true);
    try {
      const map = await findMemberDuplicates(
        nonFrozen.map((l) => ({ id: l.id, phone: l.phone, frozen: l.frozen })),
        user.uid,
      );
      // Old admin-added duplicates with no sale on either side get auto-resolved:
      // first member to engage (status ≠ not_called) keeps the number, otherwise first added wins.
      const resolution = await resolveNonSaleDuplicates(leads, map, { uid: user.uid, name: user.name });
      setDuplicateLeadIds(new Set(Object.keys(map).filter((id) => !resolution.resolvedMyLeadIds.has(id))));
      if (resolution.frozeMineCount > 0) {
        toast({
          title: "Duplicate numbers released",
          description: `${resolution.frozeMineCount} of your duplicate number(s) went to the member who worked them first.`,
        });
      }
      if (resolution.wonCount > 0) {
        toast({
          title: "Duplicate numbers kept",
          description: `You kept ${resolution.wonCount} duplicate number(s) — you worked them first.`,
        });
      }
    } catch {
      /* leave previous result; never block the page on a quota/permission error */
    } finally {
      setDupLoading(false);
    }
  };

  // Run the scan exactly once, after the first batch of leads has loaded.
  useEffect(() => {
    if (!user || loading || dupRanRef.current) return;
    dupRanRef.current = true;
    runDuplicateScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  // Search and status filters are kept separate: the dropdown counts must come from the
  // search+day window only, NOT the status-filtered list (otherwise selecting "Answered"
  // makes every other status count read 0).
  const matchesSearch = (l: Lead) =>
    !search ||
    l.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    l.phone?.includes(search) ||
    l.realName?.toLowerCase().includes(search.toLowerCase());

  const matchesStatus = (l: Lead) => {
    if (statusFilter === "all") return true;
    const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
    if (statusFilter === "sale_done") return !!l.saleDone;
    if (statusFilter === "verification_pending") return items.some((i: any) => i.verificationStatus === "pending");
    if (statusFilter === "verified_sales") return items.some((i: any) => i.verificationStatus === "verified");
    return l.status === statusFilter;
  };

  const searchFiltered = leads.filter(matchesSearch);
  const filtered = searchFiltered.filter(matchesStatus);

  // Last 5 days for day filter
  const recentDays = useMemo(() => {
    const days: { date: Date; dateStr: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = subDays(new Date(), i);
      days.push({ date: startOfDay(d), dateStr: format(d, "yyyy-MM-dd"), label: getDayLabel(d) });
    }
    return days;
  }, []);

  // Sale rows (for sales tab) — filtered by salesSearch + salesDay
  const allSaleRows: SaleRow[] = leads.flatMap((lead) => {
    const items = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
    return items
      .filter((item) => {
        if (salesStatus !== "all") {
          if (item.verificationStatus !== salesStatus) return false;
        }
        if (salesDay !== "all") {
          const d = saleDay(item, lead);
          const dayDateStr = recentDays[parseInt(salesDay)]?.dateStr;
          if (!d || d !== dayDateStr) return false;
        }
        if (salesSearch) {
          const q = salesSearch.toLowerCase();
          const matchName = lead.displayName?.toLowerCase().includes(q);
          const matchPhone = lead.phone?.includes(q);
          const matchCat = item.category?.toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchCat) return false;
        }
        return true;
      })
      .map((item, idx) => ({ lead, item, itemIndex: idx }));
  });

  /**
   * Group leads by the day they were last WORKED, not the day they were handed out.
   *
   * A number claimed three weeks ago and sold to this morning belongs in today — that is where the
   * person who just sold it will look for it. Grouping by `createdAt` left it in the three-week-old
   * bucket, so after every upsell the seller had to switch to "All days" and search the number by
   * hand. See utils/leadActivity.
   */
  const groupLeadsByDate = (memberLeads: Lead[]) => {
    const groups: Record<string, Lead[]> = {};
    memberLeads.forEach((l) => {
      const dateStr = leadActivityDay(l);
      if (!dateStr) return;
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(l);
    });
    return groups;
  };

  // Apply the active day window (calendar date / day dropdown, incl. "Today + uncalled past")
  // to any list. Used twice: on the status-filtered list for display, and on the
  // search-only list for the dropdown counts.
  const applyDayWindow = (src: Lead[]): Lead[] => {
    const groups = groupLeadsByDate(src);
    if (selectedDate) return groups[format(selectedDate, "yyyy-MM-dd")] || [];
    if (dayFilter === "all") return src;

    const dayIndex = parseInt(dayFilter);
    const dayDateStr = recentDays[dayIndex]?.dateStr;
    const dayLeads = groups[dayDateStr] || [];

    // Special: if viewing Today (index 0), also include uncalled leads from past days
    if (dayIndex === 0) {
      const uncalledPast = src.filter((l) => {
        if (l.status !== "not_called") return false;
        const ts = l.createdAt?.seconds;
        if (!ts) return false;
        const leadDateStr = format(new Date(ts * 1000), "yyyy-MM-dd");
        return leadDateStr !== dayDateStr; // from a different day
      });
      return [...dayLeads, ...uncalledPast];
    }

    return dayLeads;
  };

  const activeDayLeads = applyDayWindow(filtered);            // what's displayed
  const dayWindowLeads = applyDayWindow(searchFiltered);      // counts/stats — independent of status filter

  /**
   * The money this member actually brought in over the selected window.
   *
   * Counted from the SALES, not from the leads showing above — see utils/salesRevenue for why the
   * two give different answers and which one is right.
   */
  const revenue = useMemo(() => {
    if (selectedDate) return dayRevenue(leads, new Set([format(selectedDate, "yyyy-MM-dd")]));
    if (dayFilter === "all") return dayRevenue(leads, null);
    const day = recentDays[parseInt(dayFilter)]?.dateStr;
    return dayRevenue(leads, new Set(day ? [day] : []));
  }, [leads, selectedDate, dayFilter, recentDays]);

  const [showRevenueBreakdown, setShowRevenueBreakdown] = useState(false);

  // Status counts for dropdown — from the day window WITHOUT the status filter applied
  const statusCounts = useMemo(() => {
    const src = dayWindowLeads;
    const counts: Record<string, number> = { all: src.length };
    STATUS_OPTIONS.forEach((s) => { counts[s.value] = src.filter((l) => l.status === s.value).length; });
    counts.sale_done = src.filter((l) => l.saleDone).length;
    counts.verification_pending = src.filter((l) => {
      const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
      return items.some((i: any) => i.verificationStatus === "pending");
    }).length;
    counts.verified_sales = src.filter((l) => {
      const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
      return items.some((i: any) => i.verificationStatus === "verified");
    }).length;
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, search, selectedDate, dayFilter, recentDays]);

  // Calendar date indicators — performance per day
  const dateIndicators = useMemo(() => {
    const indicators: Record<string, "good" | "average" | "bad"> = {};
    const allGrouped = groupLeadsByDate(leads); // use raw leads, not filtered
    Object.entries(allGrouped).forEach(([dateStr, dayLeads]) => {
      const total = dayLeads.length;
      if (total === 0) return;
      const called = dayLeads.filter((l) => l.status !== "not_called").length;
      const pct = Math.round((called / total) * 100);
      if (pct >= 70) indicators[dateStr] = "good";
      else if (pct >= 40) indicators[dateStr] = "average";
      else indicators[dateStr] = "bad";
    });
    return indicators;
  }, [leads]);

  // Helper: get "From X days ago" label for leads shown in today view from past days
  const getLeadPastDayLabel = (lead: Lead): string | null => {
    // Only show label when viewing Today
    if (selectedDate || dayFilter !== "0") return null;
    const ts = lead.createdAt?.seconds;
    if (!ts) return null;
    const leadDateStr = format(new Date(ts * 1000), "yyyy-MM-dd");
    const todayStr = recentDays[0]?.dateStr;
    if (leadDateStr === todayStr) return null; // today's lead, no label
    return getDayLabel(new Date(ts * 1000));
  };

  const updateLead = async (id: string, data: Record<string, any>) => {
    try {
      await updateDoc(doc(db, "leads", id), { ...data, lastUpdated: serverTimestamp() });
    } catch {
      toast({ title: "Error", description: "Failed to update lead.", variant: "destructive" });
    }
  };

  const deleteCustomLead = (id: string, displayName: string, phone: string) => {
    // Cancel any already-pending delete for this lead
    const existing = pendingDeletesRef.current.get(id);
    if (existing) {
      clearTimeout(existing.timeoutId);
      clearInterval(existing.intervalId);
      pendingDeletesRef.current.delete(id);
    }

    let secondsLeft = 5;
    const label = displayName || "Custom lead";

    const { dismiss, update, id: toastId } = toast({
      title: "Deleting lead",
      description: `"${label}" will be deleted in ${secondsLeft}s`,
      variant: "destructive",
      duration: 6000,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            const pending = pendingDeletesRef.current.get(id);
            if (pending) {
              clearTimeout(pending.timeoutId);
              clearInterval(pending.intervalId);
              pendingDeletesRef.current.delete(id);
            }
            dismiss();
            toast({ title: "Cancelled", description: "Lead delete cancelled." });
          }}
        >
          Undo
        </ToastAction>
      ),
    });

    const intervalId = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) {
        update({ id: toastId, description: `"${label}" will be deleted in ${secondsLeft}s` });
      }
    }, 1000);

    const timeoutId = setTimeout(async () => {
      clearInterval(intervalId);
      pendingDeletesRef.current.delete(id);
      dismiss();
      try {
        await deleteDoc(doc(db, "leads", id));
        // Release the number lock so it can be re-added immediately (only if still owned by this member).
        if (phone) {
          try {
            await releaseLockForLead({ user: { uid: user!.uid, name: user!.name }, phone, leadId: id });
          } catch { /* non-fatal: lead is already deleted */ }
        }
        await logActivity({
          actorId: user!.uid,
          actorName: user!.name,
          actorRole: "sales_member",
          adminId: user!.createdBy,
          action: "deleted_lead",
          details: { leadId: id, leadName: displayName },
        });
      } catch {
        toast({ title: "Error", description: "Failed to delete lead.", variant: "destructive" });
      }
    }, 5000);

    pendingDeletesRef.current.set(id, { timeoutId, intervalId });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Custom Lead Modal */}
      {showCustomModal && user && (
        <AddCustomLeadModal user={user} onClose={() => setShowCustomModal(false)} />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">My Leads</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-0.5">
            {selectedDate ? `Filtered: ${format(selectedDate, "dd/MM/yyyy")}` : `${leads.length} leads assigned to you`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCustomModal(true)}
            className="h-8 md:h-9 px-3 md:px-4 rounded-lg bg-success/10 text-success border border-success/30 text-xs font-medium flex items-center gap-1.5 hover:bg-success/20 transition-colors"
          >
            <Plus size={13} /> Add Custom Lead
          </button>
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} dateIndicators={dateIndicators} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards – based on the day window (independent of the status filter) */}
      {(() => {
        const dayLeads = dayWindowLeads;
        const calledCount = dayLeads.filter((l) => l.status !== "not_called").length;
        const saleDone = dayLeads.filter((l) => l.saleDone).length;
        const pendingVerif = dayLeads.filter((l) => {
          const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
          return items.some((i: any) => i.verificationStatus === "pending");
        }).length;
        return (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
            {[
              { label: "Total Leads", value: dayLeads.length, color: "text-primary" },
              { label: "Called", value: calledCount, color: "text-info" },
              { label: "Verif. Pending", value: pendingVerif, color: "text-warning" },
              { label: "Sale Done", value: saleDone, color: "text-success" },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-2.5 md:p-4">
                <p className="text-[10px] md:text-xs text-muted-foreground">{s.label}</p>
                <p className={`font-display font-bold text-base md:text-xl ${s.color}`}>{s.value}</p>
              </div>
            ))}
            {/* Revenue opens its own split — "how many 499, how many 999" is the question a member
                asks the moment they see the total. */}
            <button
              type="button"
              data-test="revenue-card"
              onClick={() => setShowRevenueBreakdown(true)}
              className="bg-card border border-border rounded-xl p-2.5 md:p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                Revenue <ChevronDown size={10} className="opacity-50 -rotate-90" />
              </p>
              <p className="font-display font-bold text-base md:text-xl text-primary">{formatCurrency(revenue.total)}</p>
              <p className="text-[9px] md:text-[10px] text-muted-foreground mt-0.5 truncate">
                {revenue.count === 0
                  ? "No sales yet"
                  : revenue.pending > 0
                    ? `${formatCurrency(revenue.verified)} verified`
                    : `${revenue.count} sale${revenue.count === 1 ? "" : "s"}`}
              </p>
            </button>
          </div>
        );
      })()}

      {/* Revenue breakdown */}
      {showRevenueBreakdown && (
        <RevenueBreakdownModal
          revenue={revenue}
          periodLabel={
            selectedDate
              ? format(selectedDate, "dd MMM yyyy")
              : dayFilter === "all"
                ? "All days"
                : `${recentDays[parseInt(dayFilter)]?.label ?? ""} (${recentDays[parseInt(dayFilter)] ? format(recentDays[parseInt(dayFilter)].date, "dd MMM") : ""})`
          }
          onClose={() => setShowRevenueBreakdown(false)}
        />
      )}

      {/* Money still to collect — see PendingPaymentsPanel for why it sits above everything else. */}
      <PendingPaymentsPanel
        leads={leads}
        ordersById={ordersById}
        onCollect={async (row, amount, note) => {
          const items = saleItemsOf(row.lead).slice();
          const current = items[row.index];
          if (!current) return;
          const updated: SaleDetail = {
            ...current,
            partialPayment: true,
            payments: withPayment(
              current,
              newPayment({
                amount,
                note: note || "Balance collected",
                collectedAt: Timestamp.now(),
                by: user ? { uid: user.uid, name: user.name } : null,
              }),
              row.lead,
            ),
          };
          items[row.index] = updated;
          await updateLead(row.lead.id, { saleItems: items, saleDetails: items[items.length - 1] });
          toast({
            title: "Payment recorded",
            description: pendingOf(updated, row.lead) > 0
              ? `${formatCurrency(pendingOf(updated, row.lead))} still pending.`
              : "This sale is fully paid.",
          });
        }}
      />

      {/* View Toggle */}
      <div className="flex gap-1.5">
        <button onClick={() => setViewTab("leads")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${viewTab === "leads" ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Leads ({filtered.length})
        </button>
        <button onClick={() => setViewTab("sales")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${viewTab === "sales" ? "bg-success/15 text-success border border-success/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Sales ({allSaleRows.length})
        </button>
        <button onClick={() => setViewTab("duplicates")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors flex items-center gap-1.5 ${viewTab === "duplicates" ? "bg-destructive/15 text-destructive border border-destructive/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          <AlertTriangle size={13} /> Duplicates {dupLoading ? <Loader2 size={11} className="animate-spin" /> : `(${duplicateLeadIds.size})`}
        </button>
        {viewTab === "duplicates" && (
          <button
            onClick={() => { if (!dupLoading) runDuplicateScan(); }}
            disabled={dupLoading}
            title="Re-scan for duplicate numbers"
            className="h-8 md:h-9 px-3 rounded-lg text-xs md:text-sm font-medium bg-card border border-border text-muted-foreground hover:bg-accent transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {dupLoading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Recheck
          </button>
        )}
      </div>

      {/* ─── LEADS TAB ─── */}
      {viewTab === "leads" && (
        <div className="space-y-4">
          {/* Search + Status dropdown + Day dropdown */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary">
              <option value="all">All Status ({statusCounts.all})</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label} ({statusCounts[s.value] || 0})</option>)}
              <option disabled>───────────</option>
              <option value="sale_done">Sale Done ({statusCounts.sale_done || 0})</option>
              <option value="verification_pending">Verif. Pending ({statusCounts.verification_pending || 0})</option>
              <option value="verified_sales">Verified Sales ({statusCounts.verified_sales || 0})</option>
            </select>
            {!selectedDate && (
              <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}
                className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary">
                {recentDays.map((d, i) => (
                  <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, "dd/MM")})</option>
                ))}
                <option value="all">All Days</option>
              </select>
            )}
          </div>

          {/* Day header + lead count */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedDate
                ? `Showing leads from ${format(selectedDate, "dd/MM/yyyy")}`
                : dayFilter === "all"
                  ? "Showing all leads"
                  : dayFilter === "0"
                    ? "Today's leads + uncalled past leads"
                    : `Showing leads from ${recentDays[parseInt(dayFilter)]?.label}`
              }
            </p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${activeDayLeads.length > 0 ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"}`}>
              {activeDayLeads.length} leads
            </span>
          </div>

          {/* Lead Cards — rendered 10 at a time to keep the page light */}
          {activeDayLeads.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Phone size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No leads found{search || statusFilter !== "all" ? " for these filters" : selectedDate ? " on this date" : " for this day"}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeDayLeads.slice(0, visibleLeadCount).map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    isDuplicate={duplicateLeadIds.has(lead.id)}
                    pastDayLabel={getLeadPastDayLabel(lead)}
                    updateLead={updateLead}
                    onDelete={lead.isCustomEntry ? () => deleteCustomLead(lead.id, lead.displayName, lead.phone) : undefined}
                    expandedNotes={expandedNotes}
                    setExpandedNotes={setExpandedNotes}
                    expandedSale={expandedSale}
                    upsellCategory={upsellRequest.category}
                    setExpandedSale={setExpandedSale}
                    ordersById={ordersById}
                  />
                ))}
              </div>
              {activeDayLeads.length > visibleLeadCount && (
                <button
                  onClick={() => setVisibleLeadCount((c) => c + 10)}
                  className="w-full h-10 rounded-xl bg-card border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors flex items-center justify-center gap-2"
                >
                  <ChevronDown size={15} /> Show 10 more ({activeDayLeads.length - visibleLeadCount} remaining)
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── SALES TAB ─── */}
      {viewTab === "sales" && (
        <div className="space-y-4">
          {/* Sales filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                placeholder="Search by name, phone, category..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
              />
            </div>
            <select
              value={salesStatus}
              onChange={(e) => setSalesStatus(e.target.value)}
              className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
            </select>
            <select
              value={salesDay}
              onChange={(e) => setSalesDay(e.target.value)}
              className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary"
            >
              {recentDays.map((d, i) => (
                <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, "dd/MM")})</option>
              ))}
              <option value="all">All Days</option>
            </select>
          </div>
          {allSaleRows.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <ShoppingBag size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No sales found{salesSearch || salesDay !== "all" ? " for these filters" : ""}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allSaleRows.map((r, key) => (
              <div key={`${r.lead.id}-${r.itemIndex}-${key}`} className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{r.lead.displayName || r.lead.phone}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{r.lead.phone}</p>
                  </div>
                  <p className="font-display font-bold text-primary text-lg">{formatCurrency(r.item.amount || 0)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Category:</span>{" "}
                    <span className="text-foreground font-medium capitalize">{r.item.category?.replace(/_/g, " ") || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Package:</span>{" "}
                    <span className="text-foreground font-medium">{r.item.packageKey || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{" "}
                    <span className={`font-medium ${r.item.verificationStatus === "verified" ? "text-success" : r.item.verificationStatus === "rejected" ? "text-destructive" : "text-warning"}`}>
                      {r.item.verificationStatus === "verified" ? "Verified ✓" : r.item.verificationStatus === "rejected" ? "Rejected ✗" : "Pending ⏳"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Lead Status:</span>{" "}
                    <span className="text-foreground font-medium capitalize">{r.lead.status?.replace(/_/g, " ")}</span>
                  </div>
                  {fmtSaleTs(r.item.submittedAt) && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Submitted:</span>{" "}
                      <span className="text-foreground font-mono text-[10px]">{fmtSaleTs(r.item.submittedAt)}</span>
                    </div>
                  )}
                  {r.item.verificationStatus === "verified" && fmtSaleTs(r.item.verifiedAt) && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Approved:</span>{" "}
                      <span className="text-success font-mono text-[10px]">{fmtSaleTs(r.item.verifiedAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      )}

      {/* ─── DUPLICATES TAB ─── */}
      {viewTab === "duplicates" && (() => {
        const dupLeads = leads.filter((l) => duplicateLeadIds.has(l.id));
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs p-2.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>These numbers are also held by another sales executive. If you both record a sale, you'll be asked to upload proof (call-record image or note) so the admin can decide who made the sale.</span>
            </div>
            {dupLeads.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <AlertTriangle size={32} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No duplicate numbers — none of your numbers are held by another member.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {dupLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    isDuplicate
                    pastDayLabel={getLeadPastDayLabel(lead)}
                    updateLead={updateLead}
                    onDelete={lead.isCustomEntry ? () => deleteCustomLead(lead.id, lead.displayName, lead.phone) : undefined}
                    expandedNotes={expandedNotes}
                    setExpandedNotes={setExpandedNotes}
                    expandedSale={expandedSale}
                    upsellCategory={upsellRequest.category}
                    setExpandedSale={setExpandedSale}
                    ordersById={ordersById}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Lead Card ─── */

interface LeadCardProps {
  lead: Lead;
  isDuplicate?: boolean;
  pastDayLabel: string | null;
  updateLead: (id: string, data: Record<string, any>) => Promise<void>;
  onDelete?: () => void;
  expandedNotes: string | null;
  setExpandedNotes: (id: string | null) => void;
  expandedSale: string | null;
  setExpandedSale: (id: string | null) => void;
  /** This member's orders, keyed by order-doc id, so each sale row knows its delivery status. */
  ordersById: Map<string, Order>;
  /** What an upsell arriving from My Clients was for, so the sale form opens on it. */
  upsellCategory?: string;
}

/**
 * Money the member has sold but not yet been given.
 *
 * ── Why it is a section of its own, above the leads ───────────────────────────────────────────
 * A pending balance is invisible work. The sale is recorded, the client is happy, the job is with
 * the tech team — and the only thing keeping the money from arriving is somebody remembering to
 * ask for it. Buried inside a sale row on a lead somewhere down a list of two hundred, nobody
 * remembers. It is the single highest-value thing on this page, so it sits at the top of it.
 *
 * ── Why "ready to collect" comes first ────────────────────────────────────────────────────────
 * The balance on a social-media month is not due on a date, it is due on a delivery: the client
 * agreed to pay the rest once the first post is created, posted and the campaign is running. The
 * tech team records exactly that on the order as they go — so the sale can promote itself the
 * moment the work lands, and the member finds out by opening the page they already open. Chasing
 * before then is chasing for nothing and spends goodwill they will need when it genuinely is due.
 *
 * Collapsed when nothing is outstanding: an empty panel every day is how a panel gets ignored.
 */
function PendingPaymentsPanel({ leads, ordersById, onCollect }: {
  leads: Lead[];
  ordersById: Map<string, Order>;
  onCollect: (row: PendingSale, amount: number, note: string) => Promise<void>;
}) {
  const [collecting, setCollecting] = useState<PendingSale | null>(null);
  /**
   * Closed until the member asks for it.
   *
   * Nothing is hidden by closing it: the header still carries the total owed, how many sales it is
   * spread across, and how many are ready to collect right now — which is the whole answer for
   * anyone just passing through. Opening it is for the member who has decided to work the list, and
   * the rows below it are long enough that leaving them expanded pushed the leads themselves off
   * the first screen every single visit.
   */
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const list = pendingSales(leads).map((row) => ({
      row,
      readiness: collectReadiness(ordersById.get(orderDocId(row.lead.id, row.item, row.index))),
    }));
    // Ready first, then the biggest balance — the two things that decide who to ring next.
    return list.sort((a, b) => {
      if (a.readiness.ready !== b.readiness.ready) return a.readiness.ready ? -1 : 1;
      return b.row.pending - a.row.pending;
    });
  }, [leads, ordersById]);

  const total = rows.reduce((sum, r) => sum + r.row.pending, 0);
  const readyCount = rows.filter((r) => r.readiness.ready).length;

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5" data-test="pending-payments">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <IndianRupee size={15} className="shrink-0 text-warning" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            Pending payments · {formatCurrency(total)}
          </span>
          <span className="block text-[11px] text-muted-foreground" data-test="pending-payments-summary">
            {rows.length} sale{rows.length === 1 ? "" : "s"} to collect
            {readyCount > 0 ? ` · ${readyCount} ready now` : ""}
          </span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-1.5 px-2 pb-2">
          {rows.map(({ row, readiness }) => (
            <div
              key={`${row.lead.id}-${row.index}`}
              data-test="pending-payment-row"
              data-ready={readiness.ready ? "yes" : "no"}
              className={`rounded-lg border bg-card p-2.5 ${
                readiness.ready ? "border-success/50" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {row.lead.realName || row.lead.displayName}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {categoryLabel(row.item.category)}
                    {row.soldOn ? ` · sold ${format(parseISO(row.soldOn), "dd MMM")}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm font-bold text-warning">{formatCurrency(row.pending)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    of {formatCurrency(row.price)} · got {formatCurrency(row.collected)}
                  </p>
                </div>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    readiness.ready ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {readiness.ready ? <Check size={10} /> : <Clock size={10} />} {readiness.reason}
                </span>
                <div className="flex items-center gap-1.5">
                  {row.lead.phone && (
                    <a
                      href={getWhatsAppUrl(row.lead.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                    >
                      <MessageCircle size={11} /> Remind
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setCollecting(row)}
                    data-test="pending-collect"
                    className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Collect
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {collecting && (
        <CollectPaymentModal
          row={collecting}
          onClose={() => setCollecting(null)}
          onSave={async (amount, note) => { await onCollect(collecting, amount, note); setCollecting(null); }}
        />
      )}
    </div>
  );
}

/** Recording money that has just been handed over. Defaults to the whole balance — the usual case. */
function CollectPaymentModal({ row, onSave, onClose }: {
  row: PendingSale;
  onSave: (amount: number, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(row.pending);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const capped = Math.max(0, Math.min(amount, row.pending));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        role="dialog"
        aria-label="Collect payment"
        data-test="collect-payment"
        onClick={(e) => e.stopPropagation()}
        className="w-full space-y-3 rounded-t-2xl border border-border bg-card p-5 md:max-w-sm md:rounded-2xl"
      >
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">Collect payment</h3>
          <p className="text-xs text-muted-foreground">
            {row.lead.realName || row.lead.displayName} — {formatCurrency(row.pending)} outstanding
          </p>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Amount received now</label>
          <input
            type="number" min={0} max={row.pending}
            value={amount || ""}
            data-test="collect-amount"
            onChange={(e) => setAmount(Math.max(0, Math.min(row.pending, Number(e.target.value) || 0)))}
            className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-right font-mono text-sm text-foreground outline-none focus:border-primary"
          />
          {/* Part of a balance is still progress — a client paying 2,000 of 5,000 must be recordable. */}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {capped >= row.pending
              ? "This settles the sale in full."
              : `${formatCurrency(row.pending - capped)} will stay pending.`}
          </p>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Cash / UPI / cheque…"
            className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        {/* Said out loud, because it is the point of recording it here rather than in a notebook. */}
        <p className="rounded-md bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
          {formatCurrency(capped)} counts towards your revenue and commission <b>today</b>.
        </p>

        <div className="flex gap-2">
          <button
            type="button" onClick={onClose}
            className="h-10 flex-1 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || capped <= 0}
            data-test="collect-save"
            onClick={async () => { setSaving(true); try { await onSave(capped, note); } finally { setSaving(false); } }}
            className="inline-flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? "Saving…" : `Record ${formatCurrency(capped)}`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * The day's money, split by ticket price.
 *
 * "How much did I make today" is immediately followed by "made up of what" — three 499s and a 999
 * is a different day from one 1,999, and the member is the one who has to know which. Grouping by
 * price rather than package is deliberate: that is the number they quote on the phone.
 */
function RevenueBreakdownModal({
  revenue, periodLabel, onClose,
}: { revenue: DayRevenue; periodLabel: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        role="dialog"
        aria-label="Revenue breakdown"
        data-test="revenue-breakdown"
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md bg-card border border-border rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-foreground text-lg">Revenue</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-xl bg-primary/10 border border-primary/20 p-4">
          <p className="font-display font-bold text-2xl text-primary">{formatCurrency(revenue.total)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {revenue.count} sale{revenue.count === 1 ? "" : "s"}
            {revenue.pending > 0 && (
              <> · <span className="text-success">{formatCurrency(revenue.verified)} verified</span>
                {" · "}<span className="text-warning">{formatCurrency(revenue.pending)} awaiting approval</span></>
            )}
          </p>
        </div>

        {revenue.breakdown.length === 0 ? (
          <div className="text-center py-8">
            <ShoppingBag size={28} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No sales in this period yet.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">By package price</p>
            {revenue.breakdown.map((row) => (
              <div key={row.amount} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono font-semibold text-foreground text-sm">
                    {formatCurrency(row.amount)} <span className="text-muted-foreground font-sans font-normal">× {row.count}</span>
                  </p>
                  {row.categories.length > 0 && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {row.categories.join(", ")}
                    </p>
                  )}
                </div>
                <p className="font-display font-bold text-primary shrink-0">{formatCurrency(row.amount * row.count)}</p>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function LeadCard({ lead, isDuplicate, pastDayLabel, updateLead, onDelete, expandedNotes, setExpandedNotes, expandedSale, setExpandedSale, ordersById, upsellCategory }: LeadCardProps) {
  const { toast } = useToast();
  const currentUser = useAuthStore((s) => s.user);
  const [notes, setNotes] = useState(lead.notes || "");
  const [saleDone, setSaleDone] = useState(lead.saleDone || false);
  const [showSalesList, setShowSalesList] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Which sale row is being edited / has its edit-log or update-note composer open.
  const [editingSaleIdx, setEditingSaleIdx] = useState<number | null>(null);
  const [logOpenIdx, setLogOpenIdx] = useState<number | null>(null);
  const [noteIdx, setNoteIdx] = useState<number | null>(null);
  /** The sale row whose penalty dialog is open. Keyed by order, since that is where it is stored. */
  const [penaltyFor, setPenaltyFor] = useState<{ order: Order; idx: number } | null>(null);
  /** The order whose client chat is being read — the order IS the room. */
  const [chatFor, setChatFor] = useState<Order | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const allSaleItems = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);

  /** The order this sale row produced (stable per sale via the deterministic order id). */
  const orderFor = (item: SaleDetail, idx: number) => ordersById.get(orderDocId(lead.id, item, idx));
  /** Assigned = the tech team has started work → the sale is locked from edit/delete. */
  const isLocked = (order?: Order) => !!order && order.status !== "unassigned" && order.status !== "cancelled";

  // Sync from props
  useEffect(() => { setNotes(lead.notes || ""); }, [lead.notes]);
  useEffect(() => { setSaleDone(lead.saleDone || false); }, [lead.saleDone]);

  const handleDeleteSaleItem = async (itemIndex: number) => {
    const deletedItem = allSaleItems[itemIndex];
    // Once work is out with a member, deleting is still allowed — but it can't be silent, so the
    // member confirms and the tech side is told the sale was deleted (see cancelOrderForSale).
    const started = isLocked(orderFor(deletedItem, itemIndex));
    if (started && !window.confirm(
      "The tech team has already started this work.\n\n"
      + "Deleting the sale will cancel the order and tell them it was deleted by you, so they stop.\n\n"
      + "Delete it anyway?"
    )) return;

    const items = [...allSaleItems];
    items.splice(itemIndex, 1);
    const updates: Record<string, any> = { saleItems: items };
    const noSalesLeft = items.length === 0;
    if (noSalesLeft) {
      updates.saleDone = false;
      updates.saleDetails = null;
      // No sales left → lift the sale-freeze (the number stays in this member's leads).
      Object.assign(updates, clearedLeadFreezeFields());
    }
    await updateLead(lead.id, updates);
    // Remove the matching order across the platform so it never lingers in the tech Orders queue.
    // Passing the member's name flags already-assigned work as "sale deleted" rather than
    // letting the job quietly disappear from under whoever is building it.
    try {
      await cancelOrderForSale({ leadId: lead.id, item: deletedItem, itemIndex, deletedByName: currentUser?.name || null });
    } catch { /* best-effort */ }
    if (noSalesLeft && currentUser) {
      try { await clearSaleFreeze({ phone: lead.phone, actor: { uid: currentUser.uid, name: currentUser.name } }); } catch { /* best-effort */ }
    }
    if (currentUser) {
      await logActivity({
        actorId: currentUser.uid,
        actorName: currentUser.name,
        actorRole: "sales_member",
        adminId: currentUser.createdBy,
        action: "deleted_sale_item",
        details: {
          leadId: lead.id,
          leadName: lead.displayName,
          amount: deletedItem?.amount,
          category: deletedItem?.category,
        },
      });
    }
    toast({
      title: "Deleted",
      description: started
        ? "Sale removed. The tech team has been told it was deleted so they stop the work."
        : "Sale removed — and cleared from the tech queue.",
    });
  };

  const copyClientMessage = (item: SaleDetail) => {
    navigator.clipboard.writeText(buildClientSaleMessage(lead, item));
    toast({ title: "Copied", description: "Client confirmation copied — paste it in WhatsApp." });
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateLead(lead.id, { notes: val }), 500);
  };

  const statusInfo = STATUS_OPTIONS.find((s) => s.value === lead.status);
  const frozen = !!lead.frozen;

  return (
    <div className={`bg-card border rounded-xl p-4 space-y-3 transition-colors ${
      frozen ? "border-warning/40 opacity-60" : lead.saleDone ? "border-success/40" : "border-border"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 mr-1">
          <input
            type="text"
            defaultValue={lead.displayName || ""}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val && val !== lead.displayName) updateLead(lead.id, { displayName: val });
            }}
            className="font-display font-bold text-foreground text-lg bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-full transition-colors"
            title="Click to edit name"
          />
          {lead.realName && <p className="text-xs text-muted-foreground truncate">{lead.realName}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 min-w-0 max-w-[60%]">
          {frozen && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/20 flex items-center gap-1">
              <Lock size={9} />
              {lead.frozenReason === "duplicate_resolved"
                ? `Duplicate — kept by ${lead.takenOverBy && !lead.takenOverBy.includes("duplicate rule") ? lead.takenOverBy : "the member who worked it first"}`
                : `Taken over${lead.takenOverBy ? ` by ${lead.takenOverBy}` : ""}`}
            </span>
          )}
          {!frozen && lead.saleFrozen && <FrozenBadge until={lead.saleFrozenUntil} />}
          {isDuplicate && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/20 flex items-center gap-1" title="Another member also holds this number">
              <AlertTriangle size={9} /> Duplicate
            </span>
          )}
          {lead.isCustomEntry && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
              Custom
            </span>
          )}
          {lead.saleDone && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">Sale ✓</span>
          )}
          {pastDayLabel && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning">
              From {pastDayLabel}
            </span>
          )}
          {onDelete && (
            confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-destructive font-medium whitespace-nowrap">Sure?</span>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Cancel"
                >
                  <X size={11} />
                </button>
                <button
                  onClick={() => { setConfirmDelete(false); onDelete(); }}
                  className="h-6 px-2 rounded flex items-center justify-center gap-1 bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors text-[10px] font-medium"
                  title="Confirm delete"
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete custom lead"
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )
          )}
        </div>
      </div>

      {/* Phone + Status on same line */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-mono text-muted-foreground">{lead.phone}</p>
          <NumberTimelineButton phone={lead.phone} lead={lead} />
        </div>
        <select
          value={lead.status}
          onChange={(e) => updateLead(lead.id, { status: e.target.value })}
          disabled={frozen}
          className={`h-8 px-3 rounded-full text-xs font-medium border-0 outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${statusInfo?.color || "bg-muted text-muted-foreground"}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <a
          href={frozen ? undefined : getCallUrl(lead.phone)}
          onClick={() => { if (frozen) return; try { updateLead(lead.id, {}); } catch {} }}
          aria-disabled={frozen}
          className={`flex-1 h-9 rounded-lg bg-info/10 text-info text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-info/20 transition-colors ${frozen ? "pointer-events-none opacity-50" : ""}`}
        >
          <Phone size={13} /> Call
        </a>
        <WhatsAppButton phone={lead.phone} clientName={lead.realName || lead.displayName} senderName={currentUser?.name} disabled={frozen} onActivity={() => { try { updateLead(lead.id, {}); } catch {} }} />
        <button
          onClick={() => setExpandedNotes(expandedNotes === lead.id ? null : lead.id)}
          className="flex-1 h-9 rounded-lg bg-accent text-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-accent/80 transition-colors border border-border"
        >
          <StickyNote size={13} /> Notes
          {expandedNotes === lead.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Notes */}
      <AnimatePresence>
        {expandedNotes === lead.id && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              maxLength={1000}
              placeholder="Add notes..."
              className="w-full h-24 p-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary resize-none font-body"
            />
            <p className="text-[10px] text-muted-foreground text-right">{notes.length}/1000</p>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Sale Section */}
      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">Sales ({allSaleItems.length})</span>
          <div className="flex items-center gap-1">
            {allSaleItems.length >= 2 && (
              <button
                onClick={() => setShowSalesList(!showSalesList)}
                className="h-7 px-2 rounded-md bg-accent text-foreground text-xs font-medium hover:bg-accent/80 transition-colors flex items-center gap-1"
              >
                {showSalesList ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showSalesList ? "Hide" : "Show"}
              </button>
            )}
            {/*
              One client often buys several things at once — a promotional ad, a logo and a website
              on the same call. Each is its own service with its own package, price, deadline and
              production track, so each is its own sale line; what was missing was any sign that a
              second one could be added at all. Saying "Add another service" once there is a sale
              on the client is the whole difference between the feature existing and being used.
            */}
            <button
              onClick={() => setExpandedSale(expandedSale === lead.id ? null : lead.id)}
              disabled={frozen}
              data-test="add-sale"
              title={frozen ? "This number was taken over by another member" : "Add a service this client bought"}
              className="h-7 px-3 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={12} /> {allSaleItems.length > 0 ? "Add another service" : "Add Sale"}
            </button>
          </div>
        </div>

        {/* Show sales: always show if 0-1 items, collapsible if 2+ */}
        {(allSaleItems.length < 2 || showSalesList) && allSaleItems.map((item, idx) => {
          const order = orderFor(item, idx);
          const locked = isLocked(order);
          const editing = editingSaleIdx === idx;
          return (
          <div key={idx} className={`text-xs rounded-lg p-2 space-y-1.5 ${item.verificationStatus === "verified" ? "bg-success/10 border border-success/20" : "bg-warning/10 border border-warning/20"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* A bulk line says which kind of video it is — "bulk ads" alone does not. */}
                <span className="font-medium text-foreground">{bulkCategoryLabel(item.category, item.bulkAdType)}</span>
                {item.packageKey && item.packageKey !== "custom" && <span className="text-muted-foreground"> • {item.packageKey}</span>}
                {/* For a bulk order the count is the sale — "₹7,592" alone says nothing. */}
                {!!item.quantity && item.quantity > 1 && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    ×{item.quantity}{discountSummary(item)}
                  </span>
                )}
                {item.customDescription && <span className="text-muted-foreground"> • {item.customDescription}</span>}
                {/*
                  What was actually sold, not just which category it fell under.

                  "Promotional Ad • p1" is the same line whether the member sold an ordinary ad or a
                  Motu & Patlu one at a different price — so the thing that made the sale special was
                  invisible to the person who made it, and there was no way to check a client's
                  question about it without opening the edit form. The cartoon duo and the occasion
                  are the two answers people actually go looking for.
                */}
                {getCharacterPack(item.requirement?.specialCategory) && (
                  <span
                    data-test="sale-pack-chip"
                    className="inline-flex items-center gap-0.5 rounded bg-purple-500/15 px-1 py-0.5 text-[9px] font-medium text-purple-600 dark:text-purple-400"
                    title="Special cartoon duo sold with this ad"
                  >
                    🎭 {getCharacterPack(item.requirement?.specialCategory)!.label}
                  </span>
                )}
                {!!item.requirement?.festival && (
                  <span
                    data-test="sale-occasion-chip"
                    className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400"
                    title="The occasion this greeting video is for"
                  >
                    <PartyPopper size={9} /> {item.requirement.festival}
                  </span>
                )}
                {/* A penalty is the client's, not the member's — shown so they know it was raised,
                    and deliberately outside the sale amount so it never enters their commission. */}
                {!!item.penaltyTotal && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-destructive/15 text-destructive"
                    title="Penalty for changes beyond the committed brief — not part of your sale value">
                    <AlertTriangle size={9} /> Penalty {formatCurrency(item.penaltyTotal)}
                    {item.penaltyClips ? ` · ${item.penaltyClips} clip${item.penaltyClips === 1 ? "" : "s"}` : ""}
                  </span>
                )}
                {!!item.editLog?.length && (
                  <button onClick={() => setLogOpenIdx(logOpenIdx === idx ? null : idx)}
                    className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-info/15 text-info hover:bg-info/25 transition-colors"
                    title="See what changed">
                    <History size={9} /> edited
                  </button>
                )}
                {locked && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400" title="The tech team has started this work">
                    <Lock size={9} /> {order?.status === "completed" ? "Delivered" : order?.status === "verified" ? "Done" : "In production"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium text-foreground">{formatCurrency(item.amount)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${item.verificationStatus === "verified" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                  {item.verificationStatus === "verified" ? "✓" : "⏳"}
                </span>
              </div>
            </div>

            {/* An outstanding balance, said on the sale itself — the chase list at the top of the
                page is for working through them; this is for anyone who arrived at the sale first. */}
            {pendingOf(item, lead) > 0 && (
              <div
                data-test="sale-pending-tag"
                className="flex flex-wrap items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-medium text-warning"
              >
                <IndianRupee size={10} className="shrink-0" />
                Pending payment: {formatCurrency(pendingOf(item, lead))}
                <span className="font-normal opacity-80">
                  · {formatCurrency(collectedOf(item, lead))} of {formatCurrency(item.amount)} collected
                </span>
              </div>
            )}

            {/* Edit-log — plain record of every change made after the sale was added */}
            {logOpenIdx === idx && !!item.editLog?.length && (
              <div className="rounded bg-background/70 border border-border p-1.5 space-y-1">
                {item.editLog.map((e, i) => (
                  <div key={i} className="text-[9px] text-muted-foreground">
                    <span className="font-medium text-foreground">{fmtSaleTs(e.at) || "edited"}</span>
                    {e.byName ? ` · ${e.byName}` : ""}
                    <ul className="list-disc list-inside">{e.changes.map((c, j) => <li key={j}>{c}</li>)}</ul>
                  </div>
                ))}
              </div>
            )}

            {/* Action row — copy to client always; edit/delete only until work starts, then a note */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => copyClientMessage(item)}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-success/10 text-success text-[11px] font-medium hover:bg-success/20 transition-colors"
                title="Copy an order confirmation to send the client">
                <Copy size={11} /> Copy for client
              </button>
              <a href={getWhatsAppUrl(lead.phone, buildClientSaleMessage(lead, item))} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-success/10 text-success text-[11px] font-medium hover:bg-success/20 transition-colors"
                title="Send the confirmation to the client on WhatsApp">
                <MessageCircle size={11} /> Send
              </a>
              {!locked ? (
                <>
                  <button onClick={() => { setEditingSaleIdx(editing ? null : idx); setNoteIdx(null); }}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors">
                    <Pencil size={11} /> {editing ? "Close" : "Edit"}
                  </button>
                  <button onClick={() => handleDeleteSaleItem(idx)}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors text-[11px] font-medium"
                    title="Delete sale">
                    <Trash2 size={11} /> Delete
                  </button>
                </>
              ) : (
                <button onClick={() => { setNoteIdx(noteIdx === idx ? null : idx); setEditingSaleIdx(null); }}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-medium hover:bg-blue-500/20 transition-colors">
                  <Send size={11} /> {noteIdx === idx ? "Close" : "Send update note"}
                </button>
              )}
              {/*
                Into the client's chat with the tech team.

                The reason this button exists: clients give their photos, their logo and their
                last-minute changes to the person who SOLD them the ad, and until now that person
                had nowhere to put them — they were re-typed into an update note, or forwarded, or
                lost. Posted here, everyone working on the ad has the original.

                Available from the moment of sale, not from the assignment: the room opens with
                the order precisely so the brief can be captured while the client is still on the
                phone. The customer is not let in until somebody is given the job.
              */}
              {order && (
                <button
                  data-test="sale-open-chat"
                  onClick={() => setChatFor(order)}
                  title="Open the client's chat with the team"
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors">
                  <MessageCircle size={11} /> Client chat
                </button>
              )}
              {/* The member is the one on the call when a client asks for changes past the brief,
                  so they can raise the charge there and then rather than relaying it to tech.
                  It needs an order to hang off — that is where penalties are recorded. */}
              {order && (
                <button
                  data-test="sale-add-penalty"
                  onClick={() => setPenaltyFor({ order, idx })}
                  title="Charge for changes beyond what was committed"
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-destructive/10 text-destructive text-[11px] font-medium hover:bg-destructive/20 transition-colors">
                  <AlertTriangle size={11} /> Penalty
                </button>
              )}
            </div>

            {/* Update-note composer — the only way to change an order once work has started */}
            {noteIdx === idx && order && (
              <UpdateNoteComposer order={order} byName={currentUser?.name || ""} onDone={() => setNoteIdx(null)} />
            )}

            {/* Inline edit form — reuses the full sale form, in "edit this item" mode */}
            {editing && !locked && (
              <SaleForm lead={lead} updateLead={updateLead} onDone={() => setEditingSaleIdx(null)}
                editItem={{ index: idx, item }} />
            )}

            {item.paymentScreenshotUrl && (
              <a
                href={item.paymentScreenshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <ExternalLink size={10} /> View Payment Screenshot
              </a>
            )}
            {item.proofImageUrl && (
              <a
                href={item.proofImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-destructive hover:underline ml-2"
              >
                <ExternalLink size={10} /> Sale proof
              </a>
            )}
            {item.proofNote && (
              <p className="flex items-start gap-1 text-[10px] text-foreground/80 bg-destructive/5 border border-destructive/20 rounded p-1.5">
                <FileText size={10} className="mt-0.5 shrink-0 text-destructive" />
                <span className="whitespace-pre-wrap break-words">{item.proofNote}</span>
              </p>
            )}
            <div className="flex flex-col gap-0.5 text-[9px] text-muted-foreground font-mono pt-0.5">
              {fmtSaleTs(item.submittedAt) && <span>Submitted: {fmtSaleTs(item.submittedAt)}</span>}
              {item.editedAt && fmtSaleTs(item.editedAt) && (
                <span className="text-info">Edited: {fmtSaleTs(item.editedAt)}</span>
              )}
              {item.verificationStatus === "verified" && fmtSaleTs(item.verifiedAt) && (
                <span className="text-success">Approved: {fmtSaleTs(item.verifiedAt)}</span>
              )}
            </div>
          </div>
          );
        })}

        {/* Freeze / extend an already-added number (available once a sale exists) */}
        {!frozen && allSaleItems.length > 0 && (
          <FreezeControl lead={lead} updateLead={updateLead} />
        )}

        {/* Add Sale Form */}
        <AnimatePresence>
          {expandedSale === lead.id && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <SaleForm lead={lead} updateLead={updateLead} onDone={() => setExpandedSale(null)}
                initialCategory={upsellCategory} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {penaltyFor && currentUser && (
        <PenaltyDialog order={penaltyFor.order} actor={currentUser} onClose={() => setPenaltyFor(null)} />
      )}

      {chatFor && currentUser && (
        <SalesOrderChat
          order={chatFor}
          soldBy={{ uid: currentUser.uid, name: currentUser.name }}
          onClose={() => setChatFor(null)}
        />
      )}
    </div>
  );
}

/* ─── Add Custom Lead Modal ─── */

function AddCustomLeadModal({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      toast({ title: "Error", description: "Phone number is required.", variant: "destructive" });
      return;
    }
    const normalized = normalizePhone(trimmed);
    const digitCount = normalized.replace(/[^0-9]/g, "").length;
    if (digitCount < 10 || digitCount > 15) {
      toast({ title: "Error", description: "Enter a valid phone number (10–15 digits including country code).", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const result = await claimNumber({
        user: { uid: user.uid, name: user.name },
        phone: normalized,
        displayName: name.trim(),
      });

      if (result.kind === "reserved") {
        toast({
          title: "Number already taken",
          description: `Already added by ${result.ownerName}. Reserved until ${format(result.until, "dd MMM, h:mm a")}. You can't add it yet.`,
          variant: "destructive",
        });
        return;
      }
      if (result.kind === "sale_frozen") {
        toast({
          title: "Client sold & frozen",
          description: `Sold by ${result.saleByName}, frozen until ${format(result.until, "dd MMM yyyy")}. You can't add this client.`,
          variant: "destructive",
        });
        return;
      }
      if (result.kind === "already_yours") {
        toast({ title: "Already yours", description: "This number is already in your leads." });
        return;
      }
      if (result.kind === "takeover") {
        toast({
          title: "Number added to you",
          description: `This number was added by ${result.previousOwnerName}, but its 24-hour validity is over, so it's now added to you.`,
        });
      } else {
        toast({ title: "Lead Added", description: "Custom lead created. Use the 'Add Sale' button on the card to record the sale." });
      }
      onClose();
    } catch (e: any) {
      // Surface the real cause instead of a generic message.
      const code = e?.code || "";
      const text = e?.message || "";
      const isQuota = code === "resource-exhausted" || /quota|resource-exhausted|too many requests/i.test(text);
      const isPerm = code === "permission-denied" || /permission/i.test(text);
      const msg = isQuota
        ? "The database has hit today's free usage limit. Please try again later — or ask the admin to upgrade the Firebase plan (Blaze) to remove this limit."
        : isPerm
          ? "Couldn't reserve this number (permission denied on the number-lock). Ask the admin to update Firestore rules for the 'numberLocks' collection."
          : text
            ? `Failed to create lead: ${text}`
            : "Failed to create lead.";
      toast({ title: isQuota ? "Daily limit reached" : "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-lg text-foreground">Add Custom Lead</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone Number *</label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                // Allow digits, spaces, dashes, parens, dots and a single leading "+"
                let v = e.target.value.replace(/[^0-9+\s\-().]/g, "");
                v = v.replace(/(?!^)\+/g, ""); // "+" only allowed at the start
                setPhone(v);
              }}
              placeholder="9876543210 or +1 415 555 0100"
              autoFocus
              maxLength={20}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Any format works. 10-digit numbers get +91 automatically; for international start with + and the country code.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Name / Business Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="bg-info/10 border border-info/30 text-info text-xs rounded-md p-2.5 leading-relaxed">
            This lead will appear in your My Leads list. Use the "Add Sale" button on the card to record the sale and get commission.
          </div>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? "Creating..." : "Create Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── WhatsApp Button ─── */

function WhatsAppButton({ phone, clientName, senderName, onActivity, disabled }: { phone: string; clientName?: string; senderName?: string; onActivity?: () => void; disabled?: boolean }) {
  const greeting = buildLeadGreeting(clientName, senderName);
  return (
    <a
      href={disabled ? undefined : getWhatsAppUrl(phone, greeting)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => { if (disabled) return; onActivity?.(); }}
      aria-disabled={disabled}
      className={`flex-1 h-9 rounded-lg bg-success/10 text-success text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-success/20 transition-colors ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <MessageCircle size={13} /> WhatsApp
    </a>
  );
}

/* ─── Update-note composer (post-assignment) ─── */

/** Once an order is assigned, the sales member can't edit it — they send the tech team a note. */
function UpdateNoteComposer({ order, byName, onDone }: { order: Order; byName: string; onDone: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await addOrderUpdateNote({ order, text, byName });
      toast({ title: "Update sent", description: "The tech team has been notified of your note." });
      onDone();
    } catch {
      toast({ title: "Error", description: "Couldn't send the note.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-1.5 rounded-md border border-blue-500/25 bg-blue-500/5 p-2">
      <p className="text-[10px] text-muted-foreground">Work has started — send a note instead of editing:</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        placeholder="e.g. Client wants the offer changed to 20% off, and the logo in the top-right."
        className="w-full h-14 p-2 rounded-md bg-card border border-border text-foreground text-xs outline-none focus:border-primary resize-none"
      />
      <button
        onClick={send}
        disabled={sending || !text.trim()}
        className="h-7 px-3 rounded-md bg-blue-600 text-white text-[11px] font-medium disabled:opacity-50 inline-flex items-center gap-1 hover:bg-blue-700 transition-colors"
      >
        {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Send to tech team
      </button>
    </div>
  );
}


/* ─── Frozen badge (live countdown) ─── */

/** Self-contained green pill that ticks every second and disappears when the freeze expires. */
function FrozenBadge({ until }: { until: any }) {
  const now = useNow(1000);
  const ms = tsToMs(until) - now;
  if (ms <= 0) return null;
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/20 flex items-center gap-1"
      title={`Frozen until ${format(new Date(tsToMs(until)), "dd MMM yyyy, hh:mm a")}`}
    >
      <Snowflake size={9} /> Frozen · {formatDuration(ms)} left
    </span>
  );
}

/* ─── Freeze control (freeze / extend an already-added number) ─── */

function FreezeControl({
  lead,
  updateLead,
}: {
  lead: Lead;
  updateLead: (id: string, data: Record<string, any>) => Promise<void>;
}) {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const now = useNow(1000);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(lead.saleFrozenDays || 1);
  const [busy, setBusy] = useState(false);

  const remainingMs = tsToMs(lead.saleFrozenUntil) - now;
  const isFrozen = !!lead.saleFrozen && remainingMs > 0;

  const apply = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await applySaleFreeze({ user: { uid: user.uid, name: user.name }, phone: lead.phone, days, leadId: lead.id });
      await updateLead(lead.id, buildLeadFreezeFields(days, user.name));
      toast({
        title: isFrozen ? "Freeze updated" : "Number frozen",
        description: `Protected from other members for ${days} day${days > 1 ? "s" : ""}.`,
      });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Could not freeze this number.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-success/20 bg-success/5 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
          <Snowflake size={12} className="text-success shrink-0" />
          {isFrozen ? (
            <span className="truncate">Frozen · <span className="text-success font-medium">{formatDuration(remainingMs)} left</span></span>
          ) : (
            "Not frozen — protect this number from other members"
          )}
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="h-6 px-2 rounded-md bg-success/10 text-success text-[11px] font-medium hover:bg-success/20 transition-colors shrink-0"
        >
          {isFrozen ? "Extend" : "Freeze"}
        </button>
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
            onClick={apply}
            disabled={busy}
            className="h-7 px-3 rounded-md bg-success text-white text-[11px] font-medium disabled:opacity-50 flex items-center gap-1 hover:bg-success/90 transition-colors"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
            {isFrozen ? "Update freeze" : "Freeze number"}
          </button>
        </div>
      )}
    </div>
  );
}
