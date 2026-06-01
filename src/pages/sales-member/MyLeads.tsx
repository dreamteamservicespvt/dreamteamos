import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, query, where, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { logActivity } from "@/services/activityLog";
import { uploadToCloudinary } from "@/services/cloudinary";
import { formatCurrency } from "@/utils/formatters";
import { normalizePhone } from "@/utils/phone";
import { format, subDays, startOfDay } from "date-fns";
import type { AppUser, Lead, LeadStatus, SaleDetail } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import {
  Search, Phone, MessageCircle, StickyNote, ChevronDown, ChevronUp,
  Loader2, Check, Upload, ExternalLink, Plus, Trash2, ShoppingBag, X,
} from "lucide-react";

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "not_called", label: "Not Called", color: "bg-muted-foreground/15 text-muted-foreground" },
  { value: "answered", label: "Answered", color: "bg-info/15 text-info" },
  { value: "not_answered", label: "Not Answered", color: "bg-warning/15 text-warning" },
  { value: "call_later", label: "Call Later", color: "bg-role-main-admin/15 text-role-main-admin" },
  { value: "not_interested", label: "Not Interested", color: "bg-destructive/15 text-destructive" },
];

const SALE_CATEGORIES = [
  "wishes", "promotional", "cinematic", "digital_marketing", "website", "logo", "google_listing", "software", "custom",
] as const;

const PACKAGES: Record<string, { label: string; amount: number }[]> = {
  wishes: [
    { label: "20 Seconds", amount: 499 },
    { label: "40 Seconds", amount: 999 },
  ],
  promotional: [
    { label: "15 Seconds", amount: 499 },
    { label: "30 Seconds", amount: 999 },
    { label: "45 Seconds", amount: 1499 },
    { label: "60 Seconds", amount: 1999 },
  ],
  cinematic: [
    { label: "15 Seconds", amount: 999 },
    { label: "30 Seconds", amount: 1999 },
    { label: "45 Seconds", amount: 2999 },
    { label: "60 Seconds", amount: 3999 },
  ],
  digital_marketing: [
    { label: "Meta Campaign Setup", amount: 2000 },
    { label: "Single Post (IG+FB+SEO)", amount: 250 },
    { label: "Monthly Package — Custom", amount: 0 },
  ],
  website: [],
  logo: [
    { label: "Standard Logo", amount: 499 },
    { label: "Premium Logo", amount: 999 },
  ],
  google_listing: [
    { label: "Google Business Listing Setup", amount: 999 },
  ],
  software: [],
  custom: [],
};

function getSaleDate(item: SaleDetail, lead: Lead): string | null {
  const ts = (item.submittedAt as any)?.seconds;
  if (ts) return format(new Date(ts * 1000), "yyyy-MM-dd");
  if (lead.createdAt?.seconds) return format(new Date(lead.createdAt.seconds * 1000), "yyyy-MM-dd");
  return null;
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<string>("0");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [viewTab, setViewTab] = useState<"leads" | "sales">("leads");
  const [salesSearch, setSalesSearch] = useState("");
  const [salesDay, setSalesDay] = useState<string>("all");
  const [salesStatus, setSalesStatus] = useState<string>("all");
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
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

  // Filter by search + status
  const filtered = leads.filter((l) => {
    const matchSearch =
      !search ||
      l.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      l.phone?.includes(search) ||
      l.realName?.toLowerCase().includes(search.toLowerCase());
    let matchStatus = statusFilter === "all" || l.status === statusFilter;
    if (statusFilter === "sale_done") matchStatus = !!l.saleDone;
    if (statusFilter === "verification_pending") {
      const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
      matchStatus = items.some((i: any) => i.verificationStatus === "pending");
    }
    if (statusFilter === "verified_sales") {
      const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
      matchStatus = items.some((i: any) => i.verificationStatus === "verified");
    }
    return matchSearch && matchStatus;
  });

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
          const d = getSaleDate(item, lead);
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

  const groupedLeads = groupLeadsByDate(filtered);

  // Get leads for the currently selected day — with special uncalled past leads logic for "Today"
  const activeDayLeads = useMemo(() => {
    if (selectedDate) return groupedLeads[format(selectedDate, "yyyy-MM-dd")] || [];
    if (dayFilter === "all") return filtered;

    const dayIndex = parseInt(dayFilter);
    const dayDateStr = recentDays[dayIndex]?.dateStr;
    const dayLeads = groupedLeads[dayDateStr] || [];

    // Special: if viewing Today (index 0), also include uncalled leads from past days
    if (dayIndex === 0) {
      const uncalledPast = filtered.filter((l) => {
        if (l.status !== "not_called") return false;
        const ts = l.createdAt?.seconds;
        if (!ts) return false;
        const leadDateStr = format(new Date(ts * 1000), "yyyy-MM-dd");
        return leadDateStr !== dayDateStr; // from a different day
      });
      return [...dayLeads, ...uncalledPast];
    }

    return dayLeads;
  }, [selectedDate, dayFilter, filtered, groupedLeads, recentDays]);

  // Status counts for dropdown — based on active day leads, not all filtered
  const statusCounts = useMemo(() => {
    const src = activeDayLeads;
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
  }, [activeDayLeads]);

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

  const deleteCustomLead = (id: string, displayName: string) => {
    // Cancel any already-pending delete for this lead
    const existing = pendingDeletesRef.current.get(id);
    if (existing) {
      clearTimeout(existing.timeoutId);
      clearInterval(existing.intervalId);
      pendingDeletesRef.current.delete(id);
    }

    let secondsLeft = 5;
    const label = displayName || "Custom lead";

    const { dismiss, update } = toast({
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
        update({ description: `"${label}" will be deleted in ${secondsLeft}s` });
      }
    }, 1000);

    const timeoutId = setTimeout(async () => {
      clearInterval(intervalId);
      pendingDeletesRef.current.delete(id);
      dismiss();
      try {
        await deleteDoc(doc(db, "leads", id));
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

      {/* Stats Cards – based on active day leads */}
      {(() => {
        const dayLeads = activeDayLeads;
        const calledCount = dayLeads.filter((l) => l.status !== "not_called").length;
        const saleDone = dayLeads.filter((l) => l.saleDone).length;
        const pendingVerif = dayLeads.filter((l) => {
          const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
          return items.some((i: any) => i.verificationStatus === "pending");
        }).length;
        const vItems = dayLeads.flatMap((l) => {
          const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
          return items.filter((i: any) => i.verificationStatus === "verified");
        });
        const rev = vItems.reduce((s: number, i: any) => s + (i.amount || 0), 0);
        return (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
            {[
              { label: "Total Leads", value: dayLeads.length, color: "text-primary" },
              { label: "Called", value: calledCount, color: "text-info" },
              { label: "Verif. Pending", value: pendingVerif, color: "text-warning" },
              { label: "Sale Done", value: saleDone, color: "text-success" },
              { label: "Revenue", value: formatCurrency(rev), color: "text-primary" },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-2.5 md:p-4">
                <p className="text-[10px] md:text-xs text-muted-foreground">{s.label}</p>
                <p className={`font-display font-bold text-base md:text-xl ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        );
      })()}

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

          {/* Lead Cards */}
          {activeDayLeads.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Phone size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No leads found{search || statusFilter !== "all" ? " for these filters" : selectedDate ? " on this date" : " for this day"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeDayLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  pastDayLabel={getLeadPastDayLabel(lead)}
                  updateLead={updateLead}
                  onDelete={lead.isCustomEntry ? () => deleteCustomLead(lead.id, lead.displayName) : undefined}
                  expandedNotes={expandedNotes}
                  setExpandedNotes={setExpandedNotes}
                  expandedSale={expandedSale}
                  setExpandedSale={setExpandedSale}
                />
              ))}
            </div>
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
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      )}
    </div>
  );
}

/* ─── Lead Card ─── */

interface LeadCardProps {
  lead: Lead;
  pastDayLabel: string | null;
  updateLead: (id: string, data: Record<string, any>) => Promise<void>;
  onDelete?: () => void;
  expandedNotes: string | null;
  setExpandedNotes: (id: string | null) => void;
  expandedSale: string | null;
  setExpandedSale: (id: string | null) => void;
}

function LeadCard({ lead, pastDayLabel, updateLead, onDelete, expandedNotes, setExpandedNotes, expandedSale, setExpandedSale }: LeadCardProps) {
  const { toast } = useToast();
  const currentUser = useAuthStore((s) => s.user);
  const [notes, setNotes] = useState(lead.notes || "");
  const [saleDone, setSaleDone] = useState(lead.saleDone || false);
  const [showSalesList, setShowSalesList] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const allSaleItems = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);

  // Sync from props
  useEffect(() => { setNotes(lead.notes || ""); }, [lead.notes]);
  useEffect(() => { setSaleDone(lead.saleDone || false); }, [lead.saleDone]);

  const handleDeleteSaleItem = async (itemIndex: number) => {
    const deletedItem = allSaleItems[itemIndex];
    const items = [...allSaleItems];
    items.splice(itemIndex, 1);
    const updates: Record<string, any> = { saleItems: items };
    if (items.length === 0) {
      updates.saleDone = false;
      updates.saleDetails = null;
    }
    await updateLead(lead.id, updates);
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
    toast({ title: "Deleted", description: "Sale item removed." });
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateLead(lead.id, { notes: val }), 500);
  };

  const cleanPhone = lead.phone?.replace(/[^0-9]/g, "") || "";
  const statusInfo = STATUS_OPTIONS.find((s) => s.value === lead.status);

  return (
    <div className={`bg-card border rounded-xl p-4 space-y-3 transition-colors ${
      lead.saleDone ? "border-success/40" : "border-border"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 mr-2">
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
          {lead.realName && <p className="text-xs text-muted-foreground">{lead.realName}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
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
        <p className="text-sm font-mono text-muted-foreground">{lead.phone}</p>
        <select
          value={lead.status}
          onChange={(e) => updateLead(lead.id, { status: e.target.value })}
          className={`h-8 px-3 rounded-full text-xs font-medium border-0 outline-none cursor-pointer ${statusInfo?.color || "bg-muted text-muted-foreground"}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <a
          href={`tel:${cleanPhone}`}
          onClick={() => { try { updateLead(lead.id, {}); } catch {} }}
          className="flex-1 h-9 rounded-lg bg-info/10 text-info text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-info/20 transition-colors"
        >
          <Phone size={13} /> Call
        </a>
        <WhatsAppButton phone={cleanPhone} onActivity={() => { try { updateLead(lead.id, {}); } catch {} }} />
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
            <button
              onClick={() => setExpandedSale(expandedSale === lead.id ? null : lead.id)}
              className="h-7 px-3 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors flex items-center gap-1"
            >
              <Plus size={12} /> Add Sale
            </button>
          </div>
        </div>

        {/* Show sales: always show if 0-1 items, collapsible if 2+ */}
        {(allSaleItems.length < 2 || showSalesList) && allSaleItems.map((item, idx) => (
          <div key={idx} className={`text-xs rounded-lg p-2 space-y-1.5 ${item.verificationStatus === "verified" ? "bg-success/10 border border-success/20" : "bg-warning/10 border border-warning/20"}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-foreground capitalize">{item.category?.replace(/_/g, " ")}</span>
                {item.packageKey && item.packageKey !== "custom" && <span className="text-muted-foreground"> • {item.packageKey}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium text-foreground">{formatCurrency(item.amount)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${item.verificationStatus === "verified" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                  {item.verificationStatus === "verified" ? "✓" : "⏳"}
                </span>
                {item.verificationStatus === "pending" && (
                  <button
                    onClick={() => handleDeleteSaleItem(idx)}
                    className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete sale"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
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
          </div>
        ))}

        {/* Add Sale Form */}
        <AnimatePresence>
          {expandedSale === lead.id && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <SaleForm lead={lead} updateLead={updateLead} onDone={() => setExpandedSale(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
    if (normalized.replace(/[^0-9]/g, "").length < 10) {
      toast({ title: "Error", description: "Enter a valid phone number (at least 10 digits).", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "leads"), {
        assignedTo: user.uid,
        assignedBy: user.uid,
        phone: normalized,
        displayName: name.trim() || normalized,
        realName: null,
        status: "answered" as LeadStatus,
        notes: "",
        saleDone: false,
        saleDetails: null,
        saleItems: [],
        isCustomEntry: true,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      toast({ title: "Lead Added", description: "Custom lead created. Use the 'Add Sale' button on the card to record the sale." });
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to create lead.", variant: "destructive" });
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
              inputMode="numeric"
              pattern="[0-9]*"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="9876543210"
              autoFocus
              maxLength={10}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">+91 will be added automatically</p>
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

function WhatsAppButton({ phone, onActivity }: { phone: string; onActivity?: () => void }) {
  return (
    <a
      href={`https://wa.me/${phone}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onActivity?.()}
      className="flex-1 h-9 rounded-lg bg-success/10 text-success text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-success/20 transition-colors"
    >
      <MessageCircle size={13} /> WhatsApp
    </a>
  );
}

/* ─── Sale Form ─── */

function SaleForm({ lead, updateLead, onDone }: { lead: Lead; updateLead: (id: string, data: Record<string, any>) => Promise<void>; onDone: () => void }) {
  const { toast } = useToast();
  const saleFormUser = useAuthStore((s) => s.user);
  const [category, setCategory] = useState("wishes");
  const [packageKey, setPackageKey] = useState("");
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const packages = PACKAGES[category] || [];
  const selectedPkg = packages.find((p) => p.label === packageKey);
  const amount = selectedPkg?.amount || customAmount;
  const needsCustomAmount = packages.length === 0 || (selectedPkg && selectedPkg.amount === 0);

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

  const handleSave = async () => {
    if (amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const newItem: SaleDetail = {
      category,
      packageKey: packageKey || "custom",
      customDescription: needsCustomAmount ? `Custom ${category}` : null,
      amount,
      verificationStatus: "pending",
      paymentScreenshotUrl: screenshotUrl || null,
      submittedAt: Timestamp.now(),
    };
    // Append to existing saleItems array
    const existingItems = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
    const updatedItems = [...existingItems, newItem];
    await updateLead(lead.id, { saleDone: true, saleItems: updatedItems, saleDetails: newItem });
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
    setSaving(false);
    toast({ title: "Sale Added", description: `Sale of ${formatCurrency(amount)} added.` });
    onDone();
  };

  return (
    <div className="space-y-3 bg-background border border-border rounded-lg p-3 mt-2">
      <div className="bg-warning/10 border border-warning/30 text-warning text-xs rounded-md p-2 flex items-center gap-1.5">
        <ExternalLink size={12} /> Verification needed — admin will review
      </div>

      <select
        value={category}
        onChange={(e) => { setCategory(e.target.value); setPackageKey(""); }}
        className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
      >
        {SALE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>
        ))}
      </select>

      {packages.length > 0 && (
        <select
          value={packageKey}
          onChange={(e) => {
            setPackageKey(e.target.value);
            const pkg = packages.find((p) => p.label === e.target.value);
            if (pkg && pkg.amount > 0) setCustomAmount(pkg.amount);
          }}
          className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
        >
          <option value="">Select package</option>
          {packages.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label} {p.amount > 0 ? `— ${formatCurrency(p.amount)}` : ""}
            </option>
          ))}
        </select>
      )}

      {needsCustomAmount && (
        <input
          type="number"
          min={1}
          value={customAmount || ""}
          onChange={(e) => setCustomAmount(Number(e.target.value) || 0)}
          placeholder="Amount (₹)"
          className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
        />
      )}

      <label className="block cursor-pointer">
        <div className="border border-dashed border-border rounded-md p-3 text-center hover:border-primary/50 transition-colors">
          {uploading ? (
            <Loader2 size={16} className="animate-spin text-primary mx-auto" />
          ) : screenshotUrl ? (
            <div className="flex items-center gap-2 justify-center text-xs text-success">
              <Check size={14} /> Payment screenshot uploaded
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
              <Upload size={14} /> Upload payment screenshot
            </div>
          )}
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      </label>

      <button
        onClick={handleSave}
        disabled={saving || amount <= 0}
        className="w-full h-9 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {saving ? "Saving..." : `Add Sale — ${formatCurrency(amount)}`}
      </button>
    </div>
  );
}
