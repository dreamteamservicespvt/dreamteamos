import { useState, useEffect, useMemo, useRef } from "react";
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
import { normalizePhone, getCallUrl, getWhatsAppUrl, buildLeadGreeting } from "@/utils/phone";
import { useNow } from "@/hooks/useNow";
import { format, subDays, startOfDay, parseISO } from "date-fns";
import type { AppUser, Lead, LeadStatus, Order, SaleDetail, SaleEditEntry, SalePayment } from "@/types";
import {
  collectedOf, newPayment, pendingOf, pendingSales, saleItemsOf, withPayment, type PendingSale,
} from "@/utils/salePayments";
import { collectReadiness } from "@/utils/collectReadiness";
import SaleSection from "@/components/sales/SaleSection";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import NumberTimelineButton from "@/components/sales/NumberTimelineButton";
import PenaltyDialog from "@/components/work/PenaltyDialog";
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

  // Group leads by created date
  const groupLeadsByDate = (memberLeads: Lead[]) => {
    const groups: Record<string, Lead[]> = {};
    memberLeads.forEach((l) => {
      const ts = l.createdAt?.seconds;
      if (!ts) return;
      const dateStr = format(new Date(ts * 1000), "yyyy-MM-dd");
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

function LeadCard({ lead, isDuplicate, pastDayLabel, updateLead, onDelete, expandedNotes, setExpandedNotes, expandedSale, setExpandedSale, ordersById }: LeadCardProps) {
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
              <SaleForm lead={lead} updateLead={updateLead} onDone={() => setExpandedSale(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {penaltyFor && currentUser && (
        <PenaltyDialog order={penaltyFor.order} actor={currentUser} onClose={() => setPenaltyFor(null)} />
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

/* ─── Sale Form ─── */

/** Sentinel for "the client wants a language that isn't in the list yet". */
const LANGUAGE_CUSTOM = "__custom__";

/**
 * The same sale with every trace of a bulk order removed — for one that has just been edited into
 * an ordinary single-video category, where a leftover quantity or discount would keep describing a
 * price that no longer exists.
 */
function withoutBulkFields(item: SaleDetail): SaleDetail {
  const {
    quantity, bulkAdType, unitAmount, suggestedDiscountPercent,
    discountMode, discountAmount, discountPercent, discountEdited, ...rest
  } = item;
  return rest;
}

/**
 * A human-readable list of what changed between two versions of a sale, for the edit log.
 * Only fields a sales member can actually change are compared.
 */
function describeSaleChanges(prev: SaleDetail, next: SaleDetail): string[] {
  const out: string[] = [];
  const pkg = (i: SaleDetail) => (i.packageKey && i.packageKey !== "custom" ? i.packageKey : "Custom");
  if (prev.category !== next.category) out.push(`Service: ${categoryLabel(prev.category)} → ${categoryLabel(next.category)}`);
  // The kind of video is what the tech team builds, so switching it is a bigger change than the
  // package and has to be named — a bulk order that turned cinematic costs twice as much to make.
  if (isBulkCategory(next.category) && effectiveAdCategory(prev.category, prev.bulkAdType) !== effectiveAdCategory(next.category, next.bulkAdType)) {
    out.push(`Video type: ${categoryLabel(effectiveAdCategory(prev.category, prev.bulkAdType))} → ${categoryLabel(effectiveAdCategory(next.category, next.bulkAdType))}`);
  }
  if (pkg(prev) !== pkg(next)) out.push(`Package: ${pkg(prev)} → ${pkg(next)}`);
  if ((prev.customDescription || "") !== (next.customDescription || "")) {
    out.push(`Description: ${prev.customDescription || "—"} → ${next.customDescription || "—"}`);
  }
  // Quantity and discount are the two levers on a bulk price, so a changed total is only half the
  // story — the log has to say which of them moved.
  if ((prev.quantity || 0) !== (next.quantity || 0)) out.push(`Quantity: ${prev.quantity || 0} → ${next.quantity || 0} videos`);
  if ((prev.discountPercent || 0) !== (next.discountPercent || 0) || (prev.discountAmount || 0) !== (next.discountAmount || 0)) {
    const shown = (i: SaleDetail) => (discountSummary(i).replace(" · ", "").replace(" off", "") || "none");
    out.push(`Discount: ${shown(prev)} → ${shown(next)}`);
  }
  if ((prev.amount || 0) !== (next.amount || 0)) out.push(`Amount: ${formatCurrency(prev.amount || 0)} → ${formatCurrency(next.amount || 0)}`);
  if ((prev.promise?.label || "") !== (next.promise?.label || "")) out.push(`Delivery: ${prev.promise?.label || "—"} → ${next.promise?.label || "—"}`);

  const pr = prev.requirement || {};
  const nr = next.requirement || {};
  if ((pr.language || "") !== (nr.language || "")) out.push(`Language: ${pr.language || "—"} → ${nr.language || "—"}`);
  // Changing the occasion changes the whole video, so it is logged by name rather than folded into
  // a generic "requirement updated" — a member already building a Diwali ad has to hear about it.
  if ((pr.festival || "") !== (nr.festival || "")) out.push(`Occasion: ${pr.festival || "—"} → ${nr.festival || "—"}`);
  const model = (v?: string) => (v === "male" ? "Male" : v === "female" ? "Female" : "—");
  if ((pr.modelGender || "") !== (nr.modelGender || "")) out.push(`Model: ${model(pr.modelGender)} → ${model(nr.modelGender)}`);
  const attire = (r: typeof pr) => (r.attireType ? attireLabel(r.attireType, r.customAttire) : "—");
  if (attire(pr) !== attire(nr)) out.push(`Attire: ${attire(pr)} → ${attire(nr)}`);
  if ((pr.aspectRatio || "") !== (nr.aspectRatio || "")) out.push(`Ratio: ${pr.aspectRatio || "—"} → ${nr.aspectRatio || "—"}`);
  if ((pr.notes || "") !== (nr.notes || "")) out.push(`Notes updated`);
  if ((pr.businessName || "") !== (nr.businessName || "")) out.push(`Business: ${pr.businessName || "—"} → ${nr.businessName || "—"}`);
  // Switching the special category or the location source changes what the tech team must produce,
  // so both are logged by name rather than folded into a generic "requirement updated".
  const special = (r: typeof pr) => getCharacterPack(r.specialCategory)?.label || "Normal ad";
  if (special(pr) !== special(nr)) out.push(`Special category: ${special(pr)} → ${special(nr)}`);
  const loc = (r: typeof pr) => (r.realLocationProvided ? "Client's photos" : "Location created");
  if (!!pr.specialCategory && !!nr.specialCategory && loc(pr) !== loc(nr)) out.push(`Location: ${loc(pr)} → ${loc(nr)}`);
  return out;
}

function SaleForm({ lead, updateLead, onDone, editItem }: {
  lead: Lead;
  updateLead: (id: string, data: Record<string, any>) => Promise<void>;
  onDone: () => void;
  /** Present when editing an existing sale rather than adding a new one. */
  editItem?: { index: number; item: SaleDetail };
}) {
  const { toast } = useToast();
  const saleFormUser = useAuthStore((s) => s.user);
  const editing = !!editItem;
  const ed = editItem?.item;
  // Promotional is what the team sells most, so it's the default; the ₹499 "15 Seconds + Poster"
  // package is pre-selected to match, since that is the one they actually sell most of. When
  // editing, everything starts from the saved sale.
  const [category, setCategory] = useState(ed?.category || "promotional");
  const [packageKey, setPackageKey] = useState(
    ed ? (ed.packageKey && ed.packageKey !== "custom" ? ed.packageKey : "") : DEFAULT_PROMOTIONAL_PACKAGE,
  );
  const [customAmount, setCustomAmount] = useState<number>(ed?.amount || 0);
  /**
   * What was sold, for the categories that have no package list to say it. Without this a Custom
   * sale reached the tech team as the string "Custom custom" and somebody had to ring back to ask.
   */
  const [description, setDescription] = useState(ed?.customDescription || "");
  /**
   * Bulk videos: which kind, how many, and the discount given. The kind is chosen first because
   * it decides the price list — a bulk order of cinematic ads is priced as cinematic ads.
   */
  const [bulkAdType, setBulkAdType] = useState<string>(
    () => effectiveAdCategory("bulk_ads", ed?.bulkAdType),
  );
  const [quantity, setQuantity] = useState<number>(ed?.quantity || 5);
  const [discountMode, setDiscountMode] = useState<DiscountMode>(ed?.discountMode || "percent");
  // One box, read in whichever unit the toggle is on. Kept as a single value so switching units
  // cannot leave a stale figure behind in the box the member is no longer looking at.
  const [discountValue, setDiscountValue] = useState<number>(
    () => (ed?.discountMode === "amount" ? ed?.discountAmount ?? 0 : ed?.discountPercent ?? 0),
  );
  const [discountTouched, setDiscountTouched] = useState(false);
  /**
   * What the client did to earn a discount, and the screenshot proving it.
   *
   * Two separate claims because a client can do either or both, and each needs its own evidence —
   * a review screenshot does not prove a referral. What they are jointly worth is decided by
   * utils/saleDiscount, not here.
   */
  const [reviewShot, setReviewShot] = useState(ed?.earnedDiscount?.review?.screenshotUrl || "");
  const [referralShot, setReferralShot] = useState(ed?.earnedDiscount?.referral?.screenshotUrl || "");
  const [earnedUploading, setEarnedUploading] = useState<EarnedReason | null>(null);
  /**
   * A Custom sale that is really a listed service at an unlisted length — a two-minute
   * promotional ad. Naming the service and the seconds is what lets the tech pipeline derive a
   * clip count, a price, a poster and a deadline instead of receiving a free-text note.
   */
  const [customBase, setCustomBase] = useState<string>(ed?.customBaseCategory || "");
  /**
   * The length, counted in CLIPS rather than minutes and seconds.
   *
   * ── Why the unit changed ────────────────────────────────────────────────────────────────────
   * The whole production side is built on 8-second clips, so a length typed in minutes and seconds
   * had to be converted before it meant anything — and the conversion happened silently, after the
   * sale. A member who sold "1 minute" had sold 8 clips (64 seconds); one who sold "45 seconds"
   * had sold 6 clips (48). Neither could tell from this form, so the number quoted to the client
   * and the number the tech team built were routinely different, and nobody found out until the
   * finished ad was the wrong length.
   *
   * Picking clips removes the conversion entirely: the number chosen here IS the number of shots
   * that get made, and the seconds are shown beside it so the member still knows what to tell the
   * client. Seeded from the stored seconds so an existing sale re-opens on the length it holds.
   */
  const [customClips, setCustomClips] = useState<number>(
    () => (ed?.customDurationSeconds ? clipsForSeconds(ed.customDurationSeconds) : 0),
  );
  /**
   * The exact time the member typed, when they entered one — kept ONLY so the rounding can be
   * shown back to them.
   *
   * Clips remain the stored unit; this is not a second source of truth for the length. A client
   * who asks for 45 seconds is buying 6 clips, which is 48, and a form that silently accepts "45"
   * and hands the tech team 48 is how a member quotes one number and the company delivers another.
   * Cleared whenever the length is set as clips, so the time boxes go back to mirroring the clips.
   */
  const [typedSeconds, setTypedSeconds] = useState<number | null>(
    () => ed?.customDurationSeconds ?? null,
  );
  /** The auto-priced figure was overridden, so it stops following the duration. */
  const [customPriceTouched, setCustomPriceTouched] = useState(false);
  /**
   * Whether the client paid only part of the price, and how much they actually handed over.
   *
   * Seeded from what is already on the sale so re-opening one shows the real position rather than
   * resetting it to "paid in full" — which would silently wipe a pending balance on any edit.
   */
  const [advanceCollected, setAdvanceCollected] = useState<boolean>(!!ed?.partialPayment);
  const [advanceAmount, setAdvanceAmount] = useState<number>(
    () => (ed?.partialPayment ? collectedOf(ed) : 0),
  );
  const [screenshotUrl, setScreenshotUrl] = useState(ed?.paymentScreenshotUrl || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [freezeDays, setFreezeDays] = useState(1);
  // Duplicate-sale dispute: another member already sold this number → proof required.
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [dupChecking, setDupChecking] = useState(!editing);
  const [proofUrl, setProofUrl] = useState(ed?.proofImageUrl || "");
  const [proofNote, setProofNote] = useState(ed?.proofNote || "");
  const [proofUploading, setProofUploading] = useState(false);
  // Delivery promise / turnaround SLA the member promises the client (countdown starts at sale).
  const [slaPreset, setSlaPreset] = useState<string>(() => {
    const p = ed?.promise;
    if (p && (p.source === "custom" || p.presetKey === CUSTOM_PRESET_KEY)) return CUSTOM_PRESET_KEY;
    if (p?.presetKey) return p.presetKey;
    const opts = presetsForCategory(effectiveAdCategory(ed?.category || "promotional", ed?.bulkAdType));
    return opts.length > 0 ? opts[0].key : CUSTOM_PRESET_KEY;
  });
  const [customDays, setCustomDays] = useState<number>(() => {
    const p = ed?.promise;
    return p?.hours ? Math.max(1, Math.round(p.hours / 24)) : 1;
  });

  /**
   * The client's ad brief. Captured here because the sales member is the only person who ever
   * speaks to the client — it rides the sale into the tech Orders queue and pre-fills the
   * assignment, so nobody re-types it and nothing is lost in a WhatsApp message.
   * Category and duration are deliberately absent: both are derived from what was sold.
   */
  const [req, setReq] = useState(() => {
    const r = withRequirementDefaults(ed?.requirement);
    return {
      businessName: r.businessName || lead.realName || lead.displayName || "",
      businessWhatsapp: r.businessWhatsapp || normalizePhone(lead.phone),
      language: r.language,
      modelGender: r.modelGender as ModelGender,
      attireType: r.attireType as AttireType,
      customAttire: r.customAttire,
      aspectRatio: r.aspectRatio as "9:16" | "16:9",
      notes: r.notes,
      festival: r.festival,
      specialCategory: r.specialCategory,
      realLocationProvided: r.realLocationProvided,
    };
  });
  const [languages, setLanguages] = useState<string[]>(() => mergeAdLanguages(null));
  const [customLanguage, setCustomLanguage] = useState("");
  useEffect(() => watchAdLanguages(setLanguages), []);

  /**
   * The occasion a wishes video is for. Offered as a list because the same twenty-odd festivals
   * come up all year and typing them invites spelling that the generator's theme lookup will not
   * recognise — with a free-text escape, because a client can want a video for their shop's
   * anniversary and no list will ever cover that.
   */
  const [festivalChoice, setFestivalChoice] = useState<string>(
    () => (isListedFestival(req.festival) ? req.festival : req.festival ? CUSTOM_FESTIVAL_OPTION : ""),
  );
  const [customFestival, setCustomFestival] = useState(
    () => (req.festival && !isListedFestival(req.festival) ? req.festival : ""),
  );

  // Only ad deliverables (wishes / promotional / cinematic) have a model, attire and ratio.
  const isAdSale = isAdCategory(category);
  /**
   * A special category replaces the human model outright — the cartoon duo IS the cast — so while
   * one is selected the model and attire pickers come down instead of collecting a spec that the
   * generator will ignore. Priced identically to a normal ad of the same length.
   */
  const salePack = isAdSale ? getCharacterPack(req.specialCategory) : null;
  const usingCustomLanguage = req.language === LANGUAGE_CUSTOM;
  const resolvedLanguage = usingCustomLanguage ? customLanguage.trim() : req.language;
  const languageMissing = isAdSale && usingCustomLanguage && !resolvedLanguage;
  // A saved language that isn't in the shared list yet stays selectable when editing.
  const langOptions = useMemo(() => {
    if (!req.language || req.language === LANGUAGE_CUSTOM) return languages;
    return languages.some((l) => l.toLowerCase() === req.language.toLowerCase()) ? languages : [req.language, ...languages];
  }, [languages, req.language]);

  const isBulk = isBulkCategory(category);
  /**
   * What is really being sold. A bulk order is N videos of one of the three ad kinds, and every
   * rule that follows — the price list, the delivery presets, the brief — belongs to that kind,
   * not to "bulk".
   */
  const adCategory = effectiveAdCategory(category, isBulk ? bulkAdType : undefined);
  const packages = PACKAGES[adCategory] || [];
  const selectedPkg = packages.find((p) => p.label === packageKey);

  /**
   * Only a greeting video has an occasion — and it must have one, because the generator themes the
   * entire ad from it. A wishes sale with the festival left blank reaches the tech team as "make a
   * wishes video" and someone has to ring the client back to ask what for. Bulk wishes counts too:
   * ten Diwali videos are still ten Diwali videos.
   */
  const isWishesSale = adCategory === "wishes";
  const resolvedFestival = (festivalChoice === CUSTOM_FESTIVAL_OPTION ? customFestival : festivalChoice).trim();
  const festivalMissing = isWishesSale && !resolvedFestival;

  /**
   * A bulk order is priced from the quantity, so the amount is computed rather than picked. The
   * quote also reports whether the applied discount left the ladder — that flag is what the tech
   * admin and the sales admin see, and it has to be derived here rather than trusted from a box.
   */
  const bulkQuote = useMemo(
    () => (isBulk ? quoteBulk(quantity, selectedPkg?.amount || 0, discountValue, discountMode) : null),
    [isBulk, quantity, selectedPkg?.amount, discountValue, discountMode],
  );

  /**
   * A Custom sale built on a real service — the two-minute promotional ad the price list has no
   * row for. The length drives the price the same way it drives the work: whole 8-second clips at
   * the category's own per-clip rate, which is exactly how the tech side already prices a
   * non-standard length (see utils/assignmentDuration.priceForClips).
   */
  const isCustomService = category === "custom" && !!customBase;
  // Seconds are now derived from the clips, not the other way round — see `customClips` above.
  const customTotalSeconds = isCustomService ? secondsForClips(customClips) : 0;
  const suggestedCustomPrice = customClips > 0 ? priceForClips(customBase, customClips) : 0;

  /** Setting the length as clips — a preset or the clip box. The time boxes follow it again. */
  const setClips = (clips: number) => {
    setCustomClips(Math.max(0, clips || 0));
    setTypedSeconds(null);
    setCustomPriceTouched(false);
  };

  /** Setting the length as a time. Converted to whole clips, rounding up. */
  const applyMinSec = (mins: number, secs: number) => {
    const total = mins * 60 + secs;
    setTypedSeconds(total);
    setCustomClips(total > 0 ? clipsForSeconds(total) : 0);
    setCustomPriceTouched(false);
  };

  // The time boxes show what was typed while it is being typed, and mirror the clips otherwise.
  const shownSeconds = typedSeconds ?? customTotalSeconds;
  const customMinutes = Math.floor(shownSeconds / 60);
  const customSecondsPart = shownSeconds % 60;
  /** The typed length, when it was not a whole number of clips and had to be rounded up. */
  const roundedUpFrom = typedSeconds && typedSeconds > 0 && customTotalSeconds !== typedSeconds
    ? typedSeconds
    : null;

  /**
   * The suggestion follows the length until the member types their own figure — after that it is
   * their price, because they are the one who quoted it. Suggested, never imposed.
   */
  useEffect(() => {
    if (!isCustomService || customPriceTouched || suggestedCustomPrice <= 0) return;
    setCustomAmount(suggestedCustomPrice);
  }, [isCustomService, suggestedCustomPrice, customPriceTouched]);

  const amount = isBulk ? (bulkQuote?.amount ?? 0) : (selectedPkg?.amount || customAmount);
  const needsCustomAmount = !isBulk && (packages.length === 0 || (selectedPkg && selectedPkg.amount === 0));

  /**
   * Everything coming off this sale, and whether it is the member's to give.
   *
   * The bulk ladder discount is already inside `amount`, so it is passed as the negotiated part
   * and the gross is the pre-discount figure — otherwise a 10% earned discount on an already
   * discounted total would be measured against the wrong number and the 10% rule would let
   * through prices it should have stopped.
   */
  const earned = useMemo(() => ({
    review: reviewShot ? { screenshotUrl: reviewShot } : null,
    referral: referralShot ? { screenshotUrl: referralShot } : null,
  }), [reviewShot, referralShot]);

  const grossBeforeDiscount = isBulk ? (bulkQuote?.grossAmount ?? 0) : amount;
  const discount = useMemo(() => discountBreakdown({
    grossAmount: grossBeforeDiscount,
    negotiatedAmount: isBulk ? (bulkQuote?.discountAmount ?? 0) : 0,
    earned,
  }), [grossBeforeDiscount, isBulk, bulkQuote?.discountAmount, earned]);

  /** What the client actually pays, once the earned discount is off as well. */
  const finalAmount = discount.netAmount;

  /**
   * What is still owed, if an advance was taken.
   *
   * Clamped to the price, because a member correcting a figure downwards must never leave the sale
   * showing a negative balance — and because "collected more than the price" is a typo, not a debt.
   */
  const advancePending = advanceCollected
    ? Math.max(0, finalAmount - Math.min(advanceAmount, finalAmount))
    : 0;

  /**
   * The payments this sale should carry once saved.
   *
   * Instalments collected AFTER the advance are preserved untouched — the form owns the advance,
   * not the whole payment history, and rewriting the list wholesale on an ordinary edit would
   * erase a balance somebody had already gone out and collected.
   */
  const buildPayments = (): SalePayment[] | null => {
    if (!advanceCollected) return null;
    const prior = (ed?.partialPayment && Array.isArray(ed.payments)) ? ed.payments : [];
    const advance: SalePayment = {
      id: prior[0]?.id || `pay_${Date.now()}`,
      amount: Math.max(0, Math.min(advanceAmount, finalAmount)),
      // The advance was taken when the sale was made; keep its original stamp on an edit so the
      // money does not silently move to a different day — and a different pay cycle.
      collectedAt: prior[0]?.collectedAt || Timestamp.now(),
      note: "Advance at sale",
      screenshotUrl: screenshotUrl || null,
      ...(saleFormUser ? { byId: saleFormUser.uid, byName: saleFormUser.name } : {}),
    };
    return [advance, ...prior.slice(1)];
  };
  /** Categories with no package list (Custom, Software), plus any explicit "custom quote" tier. */
  const showDescription = needsDescription(category) || (!!selectedPkg && selectedPkg.amount === 0);
  const descriptionRequired = needsDescription(category);
  const descriptionMissing = descriptionRequired && !description.trim();
  const hasProof = !!proofUrl || !!proofNote.trim();
  const slaOptions = presetsForCategory(adCategory);

  /**
   * Whether this form can be submitted, and the one thing standing in the way.
   *
   * Derived once and shared by both save buttons: two buttons each working out their own disabled
   * state is two chances for them to disagree, and a member who can submit with one but not the
   * other has no way of telling which of them is wrong.
   */
  const blockReason =
    uploading ? "Uploading screenshot…"
    : !screenshotUrl ? "Upload screenshot to continue"
    : dupChecking ? "Checking…"
    : isDuplicate && !hasProof ? "Add proof to continue"
    : languageMissing ? "Type the language to continue"
    : festivalMissing ? "Pick the occasion to continue"
    : descriptionMissing ? "Say what was sold to continue"
    : amount <= 0 ? "Pick a package or enter an amount"
    : null;
  const blocked = saving || proofUploading || !!blockReason;

  /**
   * Keep the discount box on the ladder while the member is still choosing a quantity, and stop
   * the moment they type their own number — after that it is their figure, not ours, and silently
   * resetting it when they adjusted the count would undo a decision they had already made.
   *
   * The suggestion follows the box's unit: a member working in rupees is offered the ladder in
   * rupees, so the figure in front of them is always the one they would actually quote.
   */
  const bulkSkipFirst = useRef(editing);
  const suggestedForBox = discountMode === "amount"
    ? Math.round(((selectedPkg?.amount || 0) * quantity * suggestedDiscountPercent(quantity)) / 100)
    : suggestedDiscountPercent(quantity);
  useEffect(() => {
    if (!isBulk) return;
    if (bulkSkipFirst.current) { bulkSkipFirst.current = false; return; }
    if (discountTouched) return;
    setDiscountValue(suggestedForBox);
  }, [isBulk, suggestedForBox, discountTouched]);

  // Default the promise to the category's first preset (or custom) whenever the category changes —
  // but not on the first render when editing, or it would overwrite the saved promise. A bulk order
  // takes its kind's presets: bulk cinematic promises days, not the promotional 24 hours.
  const slaSkipFirst = useRef(editing);
  useEffect(() => {
    if (slaSkipFirst.current) { slaSkipFirst.current = false; return; }
    const opts = presetsForCategory(adCategory);
    setSlaPreset(opts.length > 0 ? opts[0].key : CUSTOM_PRESET_KEY);
  }, [adCategory]);

  // A "duplicate dispute" (proof required) exists ONLY while another member's sale is still inside
  // its freeze/validity window. Once that validity has expired, a new sale by anyone is a legitimate
  // SEPARATE sale — no proof needed (e.g. member A sold yesterday, the freeze ended, member B sells
  // a new ad today). The per-number lock is the source of truth and is always readable.
  useEffect(() => {
    // Editing an existing sale is never a duplicate dispute — it's already this member's sale.
    if (editing) { setDupChecking(false); return; }
    let cancelled = false;
    setDupChecking(true);
    (async () => {
      if (!saleFormUser) { setDupChecking(false); return; }
      let dup = false;
      try {
        const lock = await fetchNumberLock(lead.phone);
        const activeFreezeByOther =
          !!lock?.saleFrozen &&
          tsToMs(lock.saleFrozenUntil) > Date.now() &&
          !!lock.saleById &&
          lock.saleById !== saleFormUser.uid;
        dup = activeFreezeByOther;
      } catch { /* lock unreadable → treat as no active dispute */ }
      if (cancelled) return;
      setIsDuplicate(dup);
      setDupChecking(false);
    })();
    return () => { cancelled = true; };
  }, [lead.phone, saleFormUser, editing]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setScreenshotUrl(url);
      toast({ title: "Uploaded", description: "Payment screenshot uploaded." });
    } catch {
      toast({ title: "Error", description: "Upload failed.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleProofUpload = async (file: File) => {
    setProofUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setProofUrl(url);
      toast({ title: "Uploaded", description: "Proof image uploaded." });
    } catch {
      toast({ title: "Error", description: "Upload failed.", variant: "destructive" });
    } finally {
      setProofUploading(false);
    }
  };

  const handleSave = async (opts: { keepOpen?: boolean } = {}) => {
    if (amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }
    if (descriptionMissing) {
      toast({ title: "Say what was sold", description: `Type what this ${categoryLabel(category)} sale is for — the tech team has no package name to go on.`, variant: "destructive" });
      return;
    }
    if (isBulk && quantity < 2) {
      toast({ title: "How many videos?", description: `A bulk order is two videos or more. For a single one, use ${categoryLabel(adCategory)}.`, variant: "destructive" });
      return;
    }
    if (uploading) {
      toast({ title: "Hold on", description: "Wait for the payment screenshot to finish uploading.", variant: "destructive" });
      return;
    }
    if (!screenshotUrl) {
      toast({ title: "Screenshot required", description: "Upload the payment screenshot before adding the sale.", variant: "destructive" });
      return;
    }
    if (isDuplicate && !hasProof) {
      toast({ title: "Proof required", description: "This number was already sold by another member. Upload a call-record image or write a note as proof.", variant: "destructive" });
      return;
    }
    if (languageMissing) {
      toast({ title: "Language needed", description: "Type the custom language the client asked for.", variant: "destructive" });
      return;
    }
    if (festivalMissing) {
      toast({ title: "Which occasion?", description: "Pick the festival this wishes video is for — the tech team themes the whole ad from it.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const promise = buildPromise({
      presetKey: slaPreset || CUSTOM_PRESET_KEY,
      customHours: slaPreset === CUSTOM_PRESET_KEY ? Math.max(1, Math.round(customDays * 24)) : undefined,
      startMs: Date.now(),
    });
    /**
     * The brief that travels with the sale.
     *
     * Every service carries who it is for and what was asked for; only a video carries the parts
     * that describe how to shoot it. Building it this way rather than "ads get a brief, everything
     * else gets null" is what stopped a Google Business Profile reaching the tech team as a
     * category and an amount with no client name on it. `cleanRequirement` strips the blanks, so a
     * member who fills in nothing still stores `null` exactly as before.
     */
    const requirement = cleanRequirement({
      businessName: req.businessName,
      businessWhatsapp: req.businessWhatsapp.trim() ? normalizePhone(req.businessWhatsapp) : "",
      notes: req.notes,
      ...(isAdSale
        ? {
          language: resolvedLanguage,
          modelGender: req.modelGender,
          attireType: req.attireType,
          customAttire: req.attireType === AttireType.CUSTOM ? req.customAttire : "",
          aspectRatio: req.aspectRatio,
          // Only a greeting video has an occasion. Storing one on a promotional ad would follow it
          // into the generator and theme an ad nobody asked to be themed.
          festival: isWishesSale ? resolvedFestival : "",
          specialCategory: req.specialCategory,
          // Only carried alongside a pack — on a normal ad "no real location" is not a fact about
          // the sale, and storing it would put a meaningless flag on every ordinary order.
          realLocationProvided: req.specialCategory ? req.realLocationProvided : undefined,
        }
        : {}),
    });
    // A language the client asked for that isn't in the list yet joins it for everyone.
    if (isAdSale && usingCustomLanguage && resolvedLanguage) await rememberAdLanguage(resolvedLanguage);

    /**
     * What was sold beyond the package name, and — for a bulk order — the arithmetic behind the
     * price. The quantity and unit price are kept alongside the total so the discount stays
     * auditable: without them, "₹7,592" is a number nobody can check a year later.
     */
    const saleShape = {
      customDescription: showDescription ? description.trim() || null : null,
      /*
        A Custom sale that names a real service and a length stops being a note somebody has to
        read. Only stored when both are present — a Custom sale for something genuinely not on the
        list (a software job) still behaves exactly as it always has.
      */
      customBaseCategory: isCustomService ? customBase : null,
      customDurationSeconds: isCustomService && customTotalSeconds > 0 ? customTotalSeconds : null,
      // What was actually collected, versus what was agreed. See utils/salePayments — a sale with
      // no payment list is one that was paid in full, which is the overwhelming majority.
      partialPayment: advanceCollected,
      payments: buildPayments(),
      // What the client earned, with the proof, and what it was worth.
      earnedDiscount: discount.reasons.length > 0 ? earned : null,
      earnedDiscountAmount: discount.earnedAmount || 0,
      /*
        Over 10% total is more than a member may give alone, so the sale waits for the sales admin
        before it reaches the tech team at all — see services/orders.upsertOrderForSale.
      */
      discountNeedsApproval: discount.needsApproval,
      discountApproval: discount.needsApproval
        ? ((editing && ed?.discountApproval === "approved" && ed?.amount === finalAmount)
            ? "approved" as const   // unchanged price on an already-approved sale keeps its approval
            : "pending" as const)
        : null,
      ...(isBulk && bulkQuote
        ? {
            // The kind of video travels with the sale: without it the tech side only knows the
            // order is "bulk", and every price, duration and deadline downstream is keyed by kind.
            bulkAdType,
            quantity: bulkQuote.quantity,
            unitAmount: bulkQuote.unitAmount,
            suggestedDiscountPercent: bulkQuote.suggestedPercent,
            discountMode: bulkQuote.discountMode,
            discountAmount: bulkQuote.discountAmount,
            discountPercent: bulkQuote.discountPercent,
            discountEdited: bulkQuote.edited,
          }
        : {}),
    };

    const existingItems = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);

    // ── Edit an existing sale ────────────────────────────────────────────────
    if (editing && ed && editItem) {
      const updatedItem: SaleDetail = {
        // A sale edited OUT of bulk keeps none of the bulk arithmetic. Spreading the old item
        // wholesale left the quantity and discount behind on what is now a single ad, so the
        // order still announced itself as "×10" and the price no longer reconciled with it.
        ...(isBulk ? ed : withoutBulkFields(ed)),
        category,
        packageKey: packageKey || "custom",
        ...saleShape,
        amount: finalAmount,
        paymentScreenshotUrl: screenshotUrl || null,
        // submittedAt is kept, so the order's deterministic id stays stable.
        promise,
        requirement,
      };
      const changes = describeSaleChanges(ed, updatedItem);
      if (changes.length === 0) { setSaving(false); onDone(); return; }
      updatedItem.editedAt = Timestamp.now();
      updatedItem.editLog = [
        ...(ed.editLog || []),
        { at: Timestamp.now(), byName: saleFormUser?.name || "", changes },
      ];
      const items = existingItems.map((it, i) => (i === editItem.index ? updatedItem : it));
      await updateLead(lead.id, { saleItems: items, saleDetails: items[items.length - 1] });
      // Reflect the change in the tech Orders queue (idempotent; keeps status/assignment).
      try {
        await upsertOrderForSale({
          lead, item: updatedItem, itemIndex: editItem.index,
          soldByName: saleFormUser?.name || lead.displayName || "",
          salesAdminId: saleFormUser?.createdBy || null,
        });
      } catch { /* best-effort */ }
      if (saleFormUser) {
        await logActivity({
          actorId: saleFormUser.uid, actorName: saleFormUser.name, actorRole: "sales_member",
          adminId: saleFormUser.createdBy, action: "edited_sale_item",
          details: { leadId: lead.id, leadName: lead.displayName, amount, category, changes },
        });
      }
      setSaving(false);
      toast({ title: "Sale updated", description: `${changes.length} change${changes.length === 1 ? "" : "s"} saved and logged.` });
      onDone();
      return;
    }

    // ── Add a new sale ───────────────────────────────────────────────────────
    const newItem: SaleDetail = {
      category,
      packageKey: packageKey || "custom",
      ...saleShape,
      amount: finalAmount,
      verificationStatus: "pending",
      paymentScreenshotUrl: screenshotUrl || null,
      submittedAt: Timestamp.now(),
      disputed: isDuplicate,
      proofImageUrl: proofUrl || null,
      proofNote: proofNote.trim() || null,
      promise,
      requirement,
    };
    const updatedItems = [...existingItems, newItem];
    await updateLead(lead.id, { saleDone: true, saleItems: updatedItems, saleDetails: newItem });
    // Push straight to the tech Orders queue — approval is no longer a gate, so the tech team can
    // start immediately. `saleVerified: false` marks it as awaiting the sales admin's sign-off.
    try {
      await upsertOrderForSale({
        lead, item: newItem, itemIndex: updatedItems.length - 1,
        soldByName: saleFormUser?.name || lead.displayName || "",
        salesAdminId: saleFormUser?.createdBy || null,
        saleVerified: false,
      });
    } catch { /* best-effort: the sale is recorded even if the order write fails */ }
    if (saleFormUser) {
      await logActivity({
        actorId: saleFormUser.uid,
        actorName: saleFormUser.name,
        actorRole: "sales_member",
        adminId: saleFormUser.createdBy,
        action: "submitted_sale",
        details: {
          leadId: lead.id,
          leadName: lead.displayName,
          amount,
          category,
          packageKey: packageKey || "custom",
        },
      });
    }
    // Freeze this client so no other member can poach the number while it's sold.
    // Mirror the freeze onto the lead (for the member's list + admin Frozen tab) only after the
    // canonical lock write succeeds, so display never claims a freeze that isn't actually enforced.
    let froze = false;
    if (saleFormUser) {
      try {
        await applySaleFreeze({
          user: { uid: saleFormUser.uid, name: saleFormUser.name },
          phone: lead.phone,
          days: freezeDays,
          leadId: lead.id,
        });
        await updateLead(lead.id, buildLeadFreezeFields(freezeDays, saleFormUser.name));
        froze = true;
      } catch {
        /* non-fatal: the sale is already recorded */
      }
    }
    setSaving(false);
    /*
      What happened, in the terms the member needs.

      An over-discounted sale is NOT with the tech team, and saying it is would have the member
      promise the client a start date that is not going to happen.
    */
    const held = discount.needsApproval;
    const frozenNote = froze
      ? ` Client frozen for ${freezeDays} day${freezeDays > 1 ? "s" : ""}.`
      : "";
    toast({
      title: held ? "Sale saved — waiting on your admin" : "Sale Added",
      description: held
        ? `${formatCurrency(finalAmount)} recorded. ${discount.totalPercent}% off needs your sales admin's approval before it goes to the tech team.${frozenNote}`
        : `Sale of ${formatCurrency(finalAmount)} added & sent to the tech team.${frozenNote}`,
    });
    // Staying open for the next service on the same client, rather than closing and making them
    // find the button again.
    if (opts.keepOpen) { resetForNextService(); return; }
    onDone();
  };

  /**
   * The form, reset for the next service on the same client.
   *
   * Keeps what belongs to the CLIENT — their brief, their business name, their language — and
   * clears what belongs to the SERVICE. A client buying an ad, a logo and a website answers the
   * "who are you" questions once, and making them re-answer three times is how the second and
   * third sale end up never being recorded.
   */
  const resetForNextService = () => {
    setCategory("promotional");
    setPackageKey(DEFAULT_PROMOTIONAL_PACKAGE);
    setCustomAmount(0);
    setDescription("");
    setCustomBase("");
    setCustomClips(0);
    setTypedSeconds(null);
    setCustomPriceTouched(false);
    setQuantity(5);
    setDiscountValue(0);
    setDiscountTouched(false);
    // The screenshot and the earned discount belong to this payment, not the next one.
    setScreenshotUrl("");
    setReviewShot("");
    setReferralShot("");
  };

  return (
    <div className="space-y-3 bg-background border border-border rounded-lg p-3 mt-2">
      {editing ? (
        <div className="bg-info/10 border border-info/30 text-info text-xs rounded-md p-2 flex items-center gap-1.5">
          <Pencil size={12} /> Editing sale — every change is logged and sent to the tech team
        </div>
      ) : discount.needsApproval ? (
        /* The promise this banner makes has to be true. Over the member's own limit the sale does
           NOT go to the tech team, and telling them it does is how a client gets a start date. */
        <div className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          <Lock size={12} /> Held until your admin approves the {discount.totalPercent}% discount
        </div>
      ) : (
        <div className="bg-warning/10 border border-warning/30 text-warning text-xs rounded-md p-2 flex items-center gap-1.5">
          <ExternalLink size={12} /> Sent to the tech team right away — admin will still verify
        </div>
      )}

      <select
        value={category}
        data-test="sale-category"
        onChange={(e) => { setCategory(e.target.value); setPackageKey(""); }}
        className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
      >
        {SALE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{categoryLabel(c)}</option>
        ))}
      </select>

      {/* Which kind of video the bulk order is made of. Asked BEFORE the package because it is
          what decides the price list — bulk cinematic is priced as cinematic, not as promotional. */}
      {isBulk && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Which videos?</label>
          <select
            value={bulkAdType}
            data-test="bulk-type"
            onChange={(e) => {
              setBulkAdType(e.target.value);
              // The new kind has its own package list, so the old selection means nothing here.
              setPackageKey("");
            }}
            className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
          >
            {bulkTypesFor(category).map((t) => (
              <option key={t} value={t}>{categoryLabel(t)}</option>
            ))}
          </select>
        </div>
      )}

      {packages.length > 0 && (
        <select
          value={packageKey}
          data-test="sale-package"
          onChange={(e) => {
            setPackageKey(e.target.value);
            const pkg = packages.find((p) => p.label === e.target.value);
            if (pkg && pkg.amount > 0) setCustomAmount(pkg.amount);
          }}
          className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
        >
          <option value="">Select package</option>
          {packages.map((p) => (
            /* The monthly quota rides in the option text — a member quoting a package on a live
               call should not have to remember that Pro means eight of everything. */
            <option key={p.label} value={p.label}>{packageOptionLabel(p)}</option>
          ))}
        </select>
      )}

      {/* Bulk videos — quantity drives the price, and the ladder suggests a discount the member may
          keep, change or withhold, in percent or in rupees. Whatever they choose is recorded. */}
      {isBulk && bulkQuote && (
        <div className="space-y-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Layers size={13} /> Bulk {categoryLabel(adCategory)} order
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-[11px] text-muted-foreground">How many videos</label>
              <input
                type="number"
                min={2}
                data-test="bulk-quantity"
                value={quantity || ""}
                onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <label className="text-[11px] text-muted-foreground">Discount</label>
                {/* The unit the client was quoted in. Switching converts what is already typed, so
                    the price on screen never jumps because the member changed how they say it. */}
                <div className="flex rounded-md border border-border overflow-hidden">
                  {(["percent", "amount"] as DiscountMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      data-test={`bulk-discount-mode-${m}`}
                      onClick={() => {
                        if (m === discountMode) return;
                        setDiscountValue(m === "amount" ? bulkQuote.discountAmount : bulkQuote.discountPercent);
                        setDiscountMode(m);
                      }}
                      className={`px-2 h-5 text-[10px] font-medium transition-colors ${
                        discountMode === m ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {m === "percent" ? "%" : "₹"}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min={0}
                max={discountMode === "amount" ? maxDiscountAmount(bulkQuote.grossAmount) : MAX_BULK_DISCOUNT_PERCENT}
                data-test="bulk-discount"
                value={discountValue || ""}
                onChange={(e) => { setDiscountTouched(true); setDiscountValue(Number(e.target.value) || 0); }}
                className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
              />
            </div>
          </div>

          {bulkQuote.suggestedPercent > 0 && !bulkQuote.edited && (
            <p className="text-[11px] text-muted-foreground">
              {quantity} videos qualifies for <strong className="text-foreground">{bulkQuote.suggestedPercent}%</strong>
              {" "}({formatCurrency(bulkQuote.suggestedAmount)}) off. You can change or remove it.
            </p>
          )}
          {bulkQuote.edited && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              Suggested {bulkQuote.suggestedPercent}% ({formatCurrency(bulkQuote.suggestedAmount)}), you set{" "}
              {bulkQuote.discountPercent}% ({formatCurrency(bulkQuote.discountAmount)}) — the tech admin and sales admin will see this.
            </p>
          )}
          {discountMode === "amount" && discountValue > maxDiscountAmount(bulkQuote.grossAmount) && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Capped at {formatCurrency(maxDiscountAmount(bulkQuote.grossAmount))} — a bulk discount cannot exceed {MAX_BULK_DISCOUNT_PERCENT}%.
            </p>
          )}
          {quantity > 0 && quantity < 5 && (
            <p className="text-[11px] text-muted-foreground">Discounts start at 5 videos.</p>
          )}

          <div className="space-y-0.5 border-t border-amber-500/20 pt-2 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>{bulkQuote.quantity} × {formatCurrency(bulkQuote.unitAmount)}</span>
              <span className="font-mono">{formatCurrency(bulkQuote.grossAmount)}</span>
            </div>
            {bulkQuote.discountAmount > 0 && (
              <div className="flex justify-between text-green-600 dark:text-green-400">
                <span>Discount {bulkQuote.discountPercent}%</span>
                <span className="font-mono">− {formatCurrency(bulkQuote.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground">
              <span>Client pays</span>
              <span className="font-mono" data-test="bulk-total">{formatCurrency(bulkQuote.amount)}</span>
            </div>
          </div>
        </div>
      )}

      {/*
        Custom, when the client wants a listed service at a length the price list does not carry.

        This is the two-minute promotional ad. Recorded as a free-text note it reached the tech
        team with no duration, no clip count, no price per clip and no deadline, and somebody read
        the note and re-typed all of it — which is where a two-minute sale quietly becomes a
        one-minute build. Naming the service and the seconds makes every rule keyed on a category
        apply to it unchanged.

        Left blank for a Custom sale that genuinely is not one of these (a software job); that
        behaves exactly as it always has.
      */}
      {category === "custom" && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles size={12} className="text-primary" /> Is this one of our services at a different length?
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => { setCustomBase(""); setCustomPriceTouched(false); }}
              data-test="custom-base-none"
              className={`h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors ${
                !customBase ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              No — something else
            </button>
            {CUSTOM_BASE_CATEGORIES.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => { setCustomBase(key); setCustomPriceTouched(false); }}
                data-test={`custom-base-${key}`}
                className={`h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors ${
                  customBase === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {categoryLabel(key)}
              </button>
            ))}
          </div>

          {isCustomService && (
            <div className="space-y-2 border-t border-border pt-2">
              <label className="text-xs font-medium text-muted-foreground">
                How long is the video?
              </label>
              {/*
                Tap a size, don't do arithmetic.

                Each button says the same length twice — the number of clips the tech team will
                build, and the number of seconds the client will watch — so the two halves of the
                company are never describing the ad in different units, and a member on the phone
                can read the seconds straight off the button they just pressed.
              */}
              <div className="flex flex-wrap gap-1.5" data-test="custom-clip-presets">
                {CLIP_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setClips(n)}
                    data-test={`custom-clips-${n}`}
                    className={`h-auto rounded-lg border px-3 py-1.5 text-left transition-colors ${
                      customClips === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <span className="block text-[13px] font-semibold leading-tight">{n} clips</span>
                    <span className="block text-[10px] leading-tight opacity-80">
                      {humanDuration(secondsForClips(n))}
                    </span>
                  </button>
                ))}
              </div>
              {/* Anything not on the row above. Still clips, so it still needs no conversion. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Or type the number of clips:</span>
                <input
                  type="number" min={0} max={200}
                  value={customClips || ""}
                  onChange={(e) => setClips(Number(e.target.value))}
                  data-test="custom-clips-input"
                  className="h-9 w-20 rounded-md border border-border bg-background px-2 text-center font-mono text-sm text-foreground outline-none focus:border-primary"
                />
                {customClips > 0 && (
                  <span className="text-[11px] font-medium text-foreground" data-test="custom-clips">
                    = {humanDuration(customTotalSeconds)} of video
                    {customClips >= 4 ? " + poster" : ""}
                  </span>
                )}
              </div>

              {/*
                The other way round: a client who asked for "one and a half minutes".

                Clips stay the stored unit — they are what gets built and what gets priced — but a
                member should never have to divide by eight on a call. Typing a time converts it
                here, in front of them, and the conversion is shown rather than applied silently:
                a length that is not a whole number of 8-second clips rounds UP, and the member
                needs to see that they are now selling 48 seconds before they quote 45.
              */}
              <div className="flex flex-wrap items-center gap-2" data-test="custom-minsec">
                <span className="text-[11px] text-muted-foreground">Or enter the time:</span>
                <input
                  type="number" min={0} max={30}
                  value={customMinutes || ""}
                  onChange={(e) => applyMinSec(Math.max(0, Number(e.target.value) || 0), customSecondsPart)}
                  data-test="custom-minutes"
                  className="h-9 w-16 rounded-md border border-border bg-background px-2 text-center font-mono text-sm text-foreground outline-none focus:border-primary"
                />
                <span className="text-xs text-muted-foreground">min</span>
                <input
                  type="number" min={0} max={59}
                  value={customSecondsPart || ""}
                  onChange={(e) => applyMinSec(customMinutes, Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
                  data-test="custom-seconds"
                  className="h-9 w-16 rounded-md border border-border bg-background px-2 text-center font-mono text-sm text-foreground outline-none focus:border-primary"
                />
                <span className="text-xs text-muted-foreground">sec</span>
                {customClips > 0 && (
                  <span className="text-[11px] font-semibold text-primary" data-test="custom-minsec-clips">
                    = {customClips} clips
                  </span>
                )}
              </div>
              {/* Said plainly, and only when it actually happened. */}
              {roundedUpFrom !== null && (
                <p className="text-[11px] text-warning" data-test="custom-rounded-up">
                  {roundedUpFrom} sec is not a whole number of {CLIP_SECONDS}-second clips — rounded up
                  to {customClips} clips ({humanDuration(customTotalSeconds)}). The client gets the longer video.
                </p>
              )}
              {suggestedCustomPrice > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {/* Once the member has typed their own figure it stays theirs, even when the
                      length changes — they quoted a price to a client, and a form that quietly
                      re-writes it is a form that changes an agreed price behind their back. */}
                  Our price for this length: <b className="font-mono text-foreground">{formatCurrency(suggestedCustomPrice)}</b>
                  {customPriceTouched && customAmount !== suggestedCustomPrice && (
                    <>
                      {" · "}
                      <button type="button" onClick={() => { setCustomPriceTouched(false); setCustomAmount(suggestedCustomPrice); }}
                        className="font-medium text-primary hover:underline">
                        use it
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {needsCustomAmount && (
        <div className="space-y-1">
          {isCustomService && (
            <label className="text-xs font-medium text-muted-foreground">
              Amount the client is paying
            </label>
          )}
          <input
            type="number"
            min={1}
            value={customAmount || ""}
            onChange={(e) => { setCustomAmount(Number(e.target.value) || 0); setCustomPriceTouched(true); }}
            placeholder="Amount (₹)"
            data-test="sale-custom-amount"
            className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
          />
        </div>
      )}

      {/*
        What the client earned, and the proof of it.

        A published offer rather than a negotiation: applying it is always within a member's own
        authority, which is why the ordinary case never reaches the approval queue. Each claim
        carries its own screenshot, because a review screenshot does not prove a referral — and
        "they said they left one" is not a review.
      */}
      {amount > 0 && (
        <SaleSection
          testId="earned-discount"
          title={`Client discount — ${EARNED_DISCOUNT_PERCENT}% for a review or a referral`}
          icon={<BadgePercent size={13} className="text-success" />}
          active={discount.reasons.length > 0}
          // Re-opening a sale that already carries a discount shows it: folding away something the
          // member is halfway through editing reads as the form having lost it.
          defaultOpen={discount.reasons.length > 0}
          summary={
            discount.reasons.length > 0
              ? `${discount.earnedPercent}% off — ${discount.reasons.map((r) => EARNED_REASON_LABEL[r]).join(" + ")}`
              : "Not applied — tap if the client left a review or referred someone"
          }
        >
          {(["review", "referral"] as EarnedReason[]).map((reason) => {
            const url = reason === "review" ? reviewShot : referralShot;
            const set = reason === "review" ? setReviewShot : setReferralShot;
            return (
              <div key={reason} className="flex items-center gap-2">
                <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 transition-colors ${
                  url ? "border-success/50 bg-success/5" : "border-border hover:border-primary/50"
                }`}>
                  <input
                    type="checkbox"
                    checked={!!url}
                    data-test={`earned-${reason}`}
                    onChange={(e) => {
                      // Unticking clears the proof: a claim with no screenshot is not a claim, and
                      // leaving a stale URL behind would keep the discount alive invisibly.
                      if (!e.target.checked) { set(""); return; }
                      document.getElementById(`earned-file-${reason}`)?.click();
                    }}
                    className="h-3.5 w-3.5 accent-emerald-600"
                  />
                  <span className="flex-1 text-[11.5px] text-foreground">{EARNED_REASON_LABEL[reason]}</span>
                  {earnedUploading === reason && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                  {url && <CheckCircle2 size={13} className="shrink-0 text-success" />}
                </label>
                <input
                  id={`earned-file-${reason}`}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setEarnedUploading(reason);
                    try {
                      set(await uploadToCloudinary(file));
                    } catch {
                      toast({ title: "Upload failed", description: "Could not upload that screenshot.", variant: "destructive" });
                    } finally {
                      setEarnedUploading(null);
                    }
                  }}
                />
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                    title="View the screenshot">
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            );
          })}
          {discount.reasons.length === 0 && (
            <p className="text-[10.5px] leading-relaxed text-muted-foreground">
              Tick one and attach the screenshot. Both together are still {EARNED_DISCOUNT_PERCENT}% —
              it is a thank-you, not a running total.
            </p>
          )}
        </SaleSection>
      )}

      {/* What the client actually pays, once everything is off. */}
      {discount.totalAmount > 0 && (
        <div className="space-y-1 rounded-lg border border-success/30 bg-success/5 p-3 text-xs" data-test="discount-summary">
          <div className="flex justify-between text-muted-foreground">
            <span>Price</span>
            <span className="font-mono">{formatCurrency(discount.grossAmount)}</span>
          </div>
          {discount.earnedAmount > 0 && (
            <div className="flex justify-between text-success">
              <span>{discount.earnedPercent}% — {discount.reasons.map((r) => EARNED_REASON_LABEL[r]).join(" + ")}</span>
              <span className="font-mono">− {formatCurrency(discount.earnedAmount)}</span>
            </div>
          )}
          {discount.negotiatedAmount > 0 && (
            <div className="flex justify-between text-success">
              <span>{discount.negotiatedPercent}% — agreed on the call</span>
              <span className="font-mono">− {formatCurrency(discount.negotiatedAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-success/20 pt-1 font-semibold text-foreground">
            <span>Client pays</span>
            <span className="font-mono" data-test="final-amount">{formatCurrency(finalAmount)}</span>
          </div>
        </div>
      )}

      {/*
        Past 10% the sale stops being the member's to conclude.

        Said here, before they submit, rather than discovered later: the sale is still recorded and
        the client is still theirs — what waits is the handover to the tech team, because work
        started against a price nobody agreed cannot be un-started.
      */}
      {discount.needsApproval && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3" data-test="discount-approval-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-warning">
              {discount.totalPercent}% off needs your sales admin's approval
            </p>
            <p className="text-[10.5px] leading-relaxed text-muted-foreground">
              You can give {MEMBER_DISCOUNT_LIMIT_PERCENT}% on your own. This sale will be saved and
              is yours, but it only goes to the tech team once your admin agrees the price — so tell
              the client the work starts after that.
            </p>
          </div>
        </div>
      )}

      {/* There is no package name to describe this sale, so the member has to. Without it the
          order reaches the tech team saying only "Custom" and somebody has to ring back and ask. */}
      {showDescription && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            What was sold{descriptionRequired ? "" : " (optional)"}
          </label>
          <textarea
            rows={2}
            data-test="sale-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={`e.g. Two-day event shoot with edited highlights`}
            className={`w-full px-3 py-2 rounded-md bg-card border text-foreground text-sm outline-none focus:border-primary resize-none ${descriptionMissing ? "border-destructive/60" : "border-border"}`}
          />
        </div>
      )}

      {/* Delivery promise / turnaround SLA — countdown starts at sale, shown to the tech team */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Clock size={12} /> Delivery promise to client
        </label>
        <div className="flex gap-2">
          <select
            value={slaPreset}
            onChange={(e) => setSlaPreset(e.target.value)}
            className="flex-1 h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
          >
            {slaOptions.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
            <option value={CUSTOM_PRESET_KEY}>Custom…</option>
          </select>
          {slaPreset === CUSTOM_PRESET_KEY && (
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min={1}
                value={customDays || ""}
                onChange={(e) => setCustomDays(Number(e.target.value) || 0)}
                className="w-16 h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          )}
        </div>
      </div>

      {/*
        Who the work is for, and what they asked for — on EVERY service.

        ── Why this is no longer ad-only ─────────────────────────────────────────────────────────
        These two fields used to live inside the ad brief, so a Google Business Profile, a logo or
        a website arrived at the tech team with no business name and no note — just a category and
        an amount. Somebody then messaged the sales member to ask who it was for, which is the
        exact hand-off this whole pipeline exists to remove. The name and the note are not ad
        details: they are the answer to "what am I making, and for whom", and every service has one.

        The genuinely ad-specific fields — language, model, attire, ratio, occasion — stay in the
        block below, because none of them mean anything on a website.
      */}
      <div className="space-y-2.5 rounded-md border border-primary/25 bg-primary/5 p-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <StickyNote size={13} /> Client details
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">Goes straight to the tech team</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">Business name</label>
            <input
              type="text"
              value={req.businessName}
              data-test="sale-business-name"
              onChange={(e) => setReq((r) => ({ ...r, businessName: e.target.value }))}
              placeholder="e.g. Sharma Electronics"
              className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Business WhatsApp</label>
            <input
              type="text"
              value={req.businessWhatsapp}
              data-test="sale-business-whatsapp"
              onChange={(e) => setReq((r) => ({ ...r, businessWhatsapp: e.target.value }))}
              placeholder="e.g. 9876543210"
              className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Notes for the tech team</label>
          <textarea
            value={req.notes}
            data-test="sale-notes"
            onChange={(e) => setReq((r) => ({ ...r, notes: e.target.value }))}
            maxLength={1000}
            placeholder={isAdSale
              ? "Anything else the client asked for — offers, tagline, colours, must-say lines…"
              : "Anything the client asked for — links, logins, colours, what they want it to say…"}
            className="w-full h-16 p-2 rounded-md bg-card border border-border text-foreground text-xs outline-none focus:border-primary resize-none"
          />
        </div>
      </div>

      {/* The rest of the ad brief — the parts that only mean something on a video. */}
      {isAdSale && (
        <div className="space-y-2.5 rounded-md border border-primary/25 bg-primary/5 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Clapperboard size={13} /> Video requirement
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">How the ad should be made</span>
          </div>

          {/* The occasion comes first on a greeting video, because it is what the video IS — the
              generator themes the wardrobe, the decorations, the colours and the script from it. */}
          {isWishesSale && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <PartyPopper size={12} /> Which festival or occasion? *
              </label>
              <select
                value={festivalChoice}
                data-test="sale-festival"
                onChange={(e) => setFestivalChoice(e.target.value)}
                className={`w-full h-9 px-3 rounded-md bg-card border text-foreground text-sm outline-none focus:border-primary ${festivalMissing ? "border-destructive/60" : "border-border"}`}
              >
                <option value="">Select the occasion…</option>
                {WISHES_FESTIVALS.map((f) => <option key={f} value={f}>{f}</option>)}
                {/* A client can want a video for their own anniversary or shop opening — the list
                    is there to save typing, never to limit what can be sold. */}
                <option value={CUSTOM_FESTIVAL_OPTION}>Other occasion…</option>
              </select>
              {festivalChoice === CUSTOM_FESTIVAL_OPTION && (
                <input
                  type="text"
                  data-test="sale-festival-custom"
                  value={customFestival}
                  onChange={(e) => setCustomFestival(e.target.value)}
                  placeholder="e.g. Shop 5th anniversary, Birthday wishes…"
                  className={`w-full h-9 px-3 rounded-md bg-card border text-foreground text-sm outline-none focus:border-primary ${festivalMissing ? "border-destructive/60" : "border-border"}`}
                />
              )}
              <p className="text-[10px] text-muted-foreground">
                The tech team themes the whole video from this — ask the client if you're not sure.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Language</label>
              <select
                value={req.language}
                onChange={(e) => setReq((r) => ({ ...r, language: e.target.value }))}
                className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
              >
                {langOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                <option value={LANGUAGE_CUSTOM}>Other language…</option>
              </select>
              {usingCustomLanguage && (
                <input
                  type="text"
                  value={customLanguage}
                  onChange={(e) => setCustomLanguage(e.target.value)}
                  placeholder="Type the language — it's saved for next time"
                  className="w-full h-9 mt-1.5 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
                />
              )}
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Special category</label>
              <select
                value={req.specialCategory}
                onChange={(e) => setReq((r) => ({ ...r, specialCategory: e.target.value }))}
                className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
              >
                <option value="">Normal ad (with a model)</option>
                {characterPackOptions().map((o) => <option key={o.id} value={o.id}>🎭 {o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Where a cartoon-duo ad is set. The tech member cannot start a "client's photos" job
              until those photos arrive, so this is asked while the client is still on the call. */}
          {salePack && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                <b>{salePack.label}</b> — {salePack.tagline}. Both characters speak in every clip. Same price as a normal ad.
              </p>
              <div>
                <label className="text-[11px] text-muted-foreground">Is the client sending photos of their shop / office?</label>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {([
                    { v: true, label: "📷 Yes — use their business background" },
                    { v: false, label: "🏙️ No — create AI background" },
                  ] as const).map(({ v, label }) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setReq((r) => ({ ...r, realLocationProvided: v }))}
                      className={`h-9 rounded-md text-xs font-medium border transition-colors ${
                        req.realLocationProvided === v
                          ? "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300"
                          : "border-border bg-card text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {req.realLocationProvided && (
                <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  Collect every angle they can send — inside, outside, counter, product shelf. Each clip is set in a
                  different one of their photos, so more photos means a better ad.
                </p>
              )}
            </div>
          )}

          {!salePack && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
            <label className="text-[11px] text-muted-foreground">Model</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[ModelGender.FEMALE, ModelGender.MALE].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setReq((r) => ({ ...r, modelGender: g, attireType: attireForGender(g, r.attireType) }))}
                  className={`h-9 rounded-md text-xs font-medium border transition-colors ${
                    req.modelGender === g ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {g === ModelGender.FEMALE ? "👩 Female" : "👨 Male"}
                </button>
              ))}
            </div>
            </div>
          </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {!salePack && (
            <div>
              <label className="text-[11px] text-muted-foreground">Model attire</label>
              <select
                value={req.attireType}
                onChange={(e) => setReq((r) => ({ ...r, attireType: e.target.value as AttireType }))}
                className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
              >
                {ATTIRE_OPTIONS_BY_GENDER[req.modelGender].map((a) => (
                  <option key={a} value={a}>{ATTIRE_LABELS[a]}</option>
                ))}
              </select>
              {req.attireType === AttireType.CUSTOM && (
                <input
                  type="text"
                  value={req.customAttire}
                  onChange={(e) => setReq((r) => ({ ...r, customAttire: e.target.value }))}
                  placeholder="Describe the exact attire…"
                  className="w-full h-9 mt-1.5 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
                />
              )}
            </div>
            )}
            <div>
              <label className="text-[11px] text-muted-foreground">Aspect ratio</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["9:16", "16:9"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReq((prev) => ({ ...prev, aspectRatio: r }))}
                    className={`h-9 rounded-md text-xs font-mono font-medium border transition-colors ${
                      req.aspectRatio === r ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/*
        How much of it was actually collected.

        ── Why this is on every sale, not just social media ────────────────────────────────────
        Half up front is the norm on a social-media month, with the rest due once the first post is
        made, posted and the campaign is running. On ads it is not supposed to happen — but it does,
        and there was nowhere to say so, which left a member two bad choices: record the full amount
        and take commission on money nobody had handed over, or not record the sale at all. Both are
        worse than an honest number, so the box is here for every category.
      */}
      {finalAmount > 0 && (
        <SaleSection
          testId="advance-block"
          title="Payment collected"
          icon={<IndianRupee size={13} className={advanceCollected ? "text-warning" : "text-muted-foreground"} />}
          active={advanceCollected}
          // Opened for a sale that already has a balance, so nobody has to go looking for it.
          defaultOpen={advanceCollected}
          summary={
            !advanceCollected
              ? `Paid in full — ${formatCurrency(finalAmount)} received`
              : advancePending > 0
                ? `${formatCurrency(advancePending)} still to collect from the client`
                : `Full ${formatCurrency(finalAmount)} collected`
          }
        >
          <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={advanceCollected}
              data-test="advance-toggle"
              onChange={(e) => {
                setAdvanceCollected(e.target.checked);
                // Half is the common case and the one worth pre-filling; it stays editable.
                if (e.target.checked && advanceAmount <= 0) setAdvanceAmount(Math.round(finalAmount / 2));
              }}
              className="mt-0.5 h-3.5 w-3.5 accent-primary"
            />
            <span>
              <b>Advance collected</b> — the client has paid only part of {formatCurrency(finalAmount)} so far
            </span>
          </label>

          {advanceCollected && (
            <div className="space-y-1.5 border-t border-border pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Amount collected now</span>
                <input
                  type="number" min={0} max={finalAmount}
                  value={advanceAmount || ""}
                  data-test="advance-amount"
                  onChange={(e) => setAdvanceAmount(Math.max(0, Math.min(finalAmount, Number(e.target.value) || 0)))}
                  className="h-9 w-28 rounded-md border border-border bg-background px-2 text-right font-mono text-sm text-foreground outline-none focus:border-primary"
                />
                {[0.5, 1].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setAdvanceAmount(Math.round(finalAmount * f))}
                    className="h-7 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                  >
                    {f === 1 ? "Full" : "50%"}
                  </button>
                ))}
              </div>
              {/* The number that matters, said in rupees rather than left to be worked out. */}
              <p
                className={`text-[11px] font-medium ${advancePending > 0 ? "text-warning" : "text-success"}`}
                data-test="advance-pending"
              >
                {advancePending > 0
                  ? `Pending payment: ${formatCurrency(advancePending)} still to collect from the client.`
                  : "Nothing pending — the full amount has been collected."}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Your revenue and commission count {formatCurrency(advanceAmount)} today. The rest counts
                on the day you collect it, and this sale will sit in <b>Pending payments</b> until then.
              </p>
            </div>
          )}
        </SaleSection>
      )}

      <label className="block cursor-pointer">
        <div className={`border border-dashed rounded-md p-3 text-center transition-colors ${screenshotUrl ? "border-success/50" : "border-destructive/40 hover:border-primary/50"}`}>
          {uploading ? (
            <div className="flex items-center gap-2 justify-center text-xs text-primary">
              <Loader2 size={16} className="animate-spin" /> Uploading screenshot…
            </div>
          ) : screenshotUrl ? (
            <div className="flex items-center gap-2 justify-center text-xs text-success">
              <Check size={14} /> Payment screenshot uploaded
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
              <Upload size={14} /> Upload payment screenshot <span className="text-destructive">*</span>
            </div>
          )}
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      </label>

      {/* Duplicate dispute — proof required (another member already sold this number) */}
      {isDuplicate && (
        <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
          <div className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>This number was already sold by another member. Upload a call-record image <b>or</b> write a note as proof of who made the sale.</span>
          </div>
          <label className="block cursor-pointer">
            <div className="border border-dashed border-destructive/40 rounded-md p-2.5 text-center hover:border-destructive/60 transition-colors">
              {proofUploading ? (
                <Loader2 size={16} className="animate-spin text-destructive mx-auto" />
              ) : proofUrl ? (
                <div className="flex items-center gap-2 justify-center text-xs text-success">
                  <Check size={14} /> Proof image uploaded
                </div>
              ) : (
                <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
                  <Upload size={14} /> Upload call-record / proof image
                </div>
              )}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleProofUpload(f); }} />
          </label>
          <textarea
            value={proofNote}
            onChange={(e) => setProofNote(e.target.value)}
            maxLength={500}
            placeholder="…or write a proof note (e.g. called at 3pm, spoke to owner, paid via GPay)"
            className="w-full h-16 p-2 rounded-md bg-card border border-border text-foreground text-xs outline-none focus:border-primary resize-none"
          />
        </div>
      )}

      {/* Freeze duration — protect this sold client from other members. Only when adding: an edit
          doesn't re-freeze (the client is already protected from the original sale). */}
      {!editing && (
        <div className="flex items-center justify-between gap-2 bg-success/5 border border-success/20 rounded-md px-3 h-9">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock size={12} className="text-success" /> Freeze client for
          </span>
          <select
            value={freezeDays}
            onChange={(e) => setFreezeDays(Number(e.target.value))}
            className="h-7 px-2 rounded-md bg-card border border-border text-foreground text-xs outline-none focus:border-primary"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={() => handleSave()}
          data-test="save-sale"
          disabled={blocked}
          className="w-full h-9 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving
            ? "Saving..."
            : blockReason
              || (editing
                ? `Save changes — ${formatCurrency(finalAmount)}`
                : `Add Sale — ${formatCurrency(finalAmount)}`)}
        </button>

        {/*
          The second thing this client bought, without closing anything.

          A client who takes an ad, a logo and a website does it on one call, and the member is
          still on that call. Saving and being returned to a fresh service form — with the client's
          own details still filled in — is the difference between three sales being recorded and
          one being recorded and two being meant to.
        */}
        {!editing && (
          <button
            onClick={() => handleSave({ keepOpen: true })}
            data-test="save-and-add-another"
            disabled={blocked}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            <Plus size={13} /> Save &amp; add another service for this client
          </button>
        )}
      </div>
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
