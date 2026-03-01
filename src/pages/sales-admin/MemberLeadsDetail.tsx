import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { normalizePhone, formatPhoneDisplay, getWhatsAppUrl, getCallUrl } from "@/utils/phone";
import { formatCurrency } from "@/utils/formatters";
import { format, subDays, startOfDay } from "date-fns";
import type { AppUser, Lead, LeadStatus, SaleDetail } from "@/types";
import { ArrowLeft, Phone, Plus, Loader2, Search, Trash2, MessageCircle, StickyNote, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnimatePresence, motion } from "framer-motion";
import DashboardDayPicker from "@/components/dashboard/DayPicker";

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "not_called", label: "Not Called", color: "bg-muted text-muted-foreground" },
  { value: "answered", label: "Answered", color: "bg-success/15 text-success" },
  { value: "not_answered", label: "No Answer", color: "bg-warning/15 text-warning" },
  { value: "call_later", label: "Call Later", color: "bg-info/15 text-info" },
  { value: "not_interested", label: "Not Interested", color: "bg-destructive/15 text-destructive" },
];

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

export default function MemberLeadsDetail() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [member, setMember] = useState<AppUser | null>(null);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [viewTab, setViewTab] = useState<"leads" | "sales">("leads");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<string>("0");

  // Add leads form
  const [showAdd, setShowAdd] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [adding, setAdding] = useState(false);

  // Fetch all team members + listen to leads for this member
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Get all sales members (for reassign dropdown)
    getDocs(collection(db, "users")).then((snap) => {
      const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      const teamMembers = allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser?.uid);
      setMembers(teamMembers);
      setMember(allUsers.find((u) => u.uid === memberId) || null);
    });

    // Real-time leads for this member
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => {
      const memberLeads = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Lead))
        .filter((l) => l.assignedTo === memberId);
      memberLeads.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setLeads(memberLeads);
      setLoading(false);
    }));

    return () => unsubs.forEach((u) => u());
  }, [memberId, currentUser?.uid]);

  // Filter leads by search + status
  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.phone.includes(q) || l.displayName?.toLowerCase().includes(q) || l.notes?.toLowerCase().includes(q) || l.realName?.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats from filtered leads
  const saleDoneLeads = filtered.filter((l) => l.saleDone).length;
  const allSaleRows: SaleRow[] = filtered.flatMap((lead) => {
    const items = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
    return items.map((item, idx) => ({ lead, item, itemIndex: idx }));
  });
  const verified = allSaleRows.filter((r) => r.item.verificationStatus === "verified");
  const totalRevenue = verified.reduce((s, r) => s + (r.item.amount || 0), 0);

  // Last 5 days
  const recentDays = useMemo(() => {
    const days: { date: Date; dateStr: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = subDays(new Date(), i);
      days.push({ date: startOfDay(d), dateStr: format(d, "yyyy-MM-dd"), label: getDayLabel(d) });
    }
    return days;
  }, []);

  // Group leads by date
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

  // Get leads for the currently selected day filter
  const activeDayLeads = selectedDate
    ? (groupedLeads[format(selectedDate, "yyyy-MM-dd")] || [])
    : dayFilter === "all"
      ? filtered
      : (groupedLeads[recentDays[parseInt(dayFilter)]?.dateStr] || []);

  // Handlers
  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim() || !memberId) {
      toast({ title: "Error", description: "Enter phone numbers.", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const lines = bulkText.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      const existingCount = leads.length;

      for (let i = 0; i < lines.length; i++) {
        const phone = normalizePhone(lines[i].split(",")[0].trim());
        const displayName = `C${existingCount + i + 1}`;
        await addDoc(collection(db, "leads"), {
          assignedTo: memberId,
          assignedBy: currentUser?.uid || "",
          phone,
          displayName,
          status: "not_called",
          notes: "",
          saleDone: false,
          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp(),
        });

        await addDoc(collection(db, "notifications"), {
          userId: memberId,
          type: "lead_assigned",
          title: "New Lead Assigned",
          message: `You have a new lead: ${displayName}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      setBulkText("");
      setShowAdd(false);
      toast({ title: "Leads Added", description: `${lines.length} leads assigned.` });
    } catch {
      toast({ title: "Error", description: "Failed to add leads.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (leadId: string) => {
    if (!confirm("Delete this lead?")) return;
    try {
      await deleteDoc(doc(db, "leads", leadId));
      toast({ title: "Deleted", description: "Lead removed." });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
  };

  const handleReassign = async (leadId: string, newMemberId: string) => {
    try {
      await updateDoc(doc(db, "leads", leadId), { assignedTo: newMemberId, lastUpdated: serverTimestamp() });
    } catch {
      toast({ title: "Error", description: "Failed to reassign.", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={() => navigate("/sales-admin/leads")}
            className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg md:text-2xl font-bold text-foreground truncate">{member?.name || "Member"}</h1>
            <p className="text-muted-foreground text-xs md:text-sm mt-0.5">
              {selectedDate ? `Filtered: ${format(selectedDate, "dd/MM/yyyy")}` : "All history"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-10 sm:pl-0">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
          <button
            onClick={() => { setBulkText(""); setShowAdd(!showAdd); }}
            className="h-8 md:h-9 px-3 md:px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs md:text-sm flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> Add Leads
          </button>
        </div>
      </div>

      {/* Add Leads Form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleBulkAdd} className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-3">
              <h3 className="font-display font-semibold text-foreground text-sm">Add Leads for {member?.name}</h3>
              <p className="text-xs text-muted-foreground">Enter one phone number per line. Names auto-generated (C1, C2…)</p>
              <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={4} placeholder={"9876543210\n9123456789\n8765432109"}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono placeholder:text-muted-foreground/40 resize-none" />
              <div className="flex items-center gap-2">
                <button type="submit" disabled={adding}
                  className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  {adding ? "Adding..." : "Add Leads"}
                </button>
                <button type="button" onClick={() => setShowAdd(false)}
                  className="h-9 px-4 rounded-lg bg-accent text-foreground text-xs font-medium border border-border hover:bg-accent/80">
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {[
          { label: "Total Leads", value: filtered.length, color: "text-primary" },
          { label: "Sale Done", value: saleDoneLeads, color: "text-success" },
          { label: "Verified Sales", value: verified.length, color: "text-success" },
          { label: "Revenue", value: formatCurrency(totalRevenue), color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-2.5 md:p-4">
            <p className="text-[10px] md:text-xs text-muted-foreground">{s.label}</p>
            <p className={`font-display font-bold text-base md:text-xl ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

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
          {/* Search + Filter */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary">
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
                  : `Showing leads from ${recentDays[parseInt(dayFilter)]?.label}`
              }
            </p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${activeDayLeads.length > 0 ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"}`}>
              {activeDayLeads.length} leads
            </span>
          </div>

          {activeDayLeads.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Phone size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No leads found{search || statusFilter !== "all" ? " for these filters" : selectedDate ? " on this date" : " for this day"}</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <LeadsList leads={activeDayLeads} members={members} isMobile={isMobile} expandedNotes={expandedNotes} setExpandedNotes={setExpandedNotes} onDelete={handleDelete} onReassign={handleReassign} />
            </div>
          )}
        </div>
      )}

      {/* ─── SALES TAB ─── */}
      {viewTab === "sales" && (
        allSaleRows.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <ShoppingBag size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No sales found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allSaleRows.map((r, key) => (
              <div key={`${r.lead.id}-${r.itemIndex}-${key}`} className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{r.lead.displayName || r.lead.phone}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground font-mono">{formatPhoneDisplay(r.lead.phone)}</span>
                      <a href={getCallUrl(r.lead.phone)} className="text-success hover:bg-success/10 w-5 h-5 rounded flex items-center justify-center"><Phone size={10} /></a>
                      <a href={getWhatsAppUrl(r.lead.phone)} target="_blank" rel="noopener noreferrer" className="text-success hover:bg-success/10 w-5 h-5 rounded flex items-center justify-center"><MessageCircle size={10} /></a>
                    </div>
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
        )
      )}
    </div>
  );
}

/* ─── Leads List (shared for day sections & calendar view) ─── */
function LeadsList({ leads, members, isMobile, expandedNotes, setExpandedNotes, onDelete, onReassign }: {
  leads: Lead[];
  members: AppUser[];
  isMobile: boolean;
  expandedNotes: string | null;
  setExpandedNotes: (id: string | null) => void;
  onDelete: (id: string) => void;
  onReassign: (id: string, uid: string) => void;
}) {
  if (isMobile) {
    return (
      <div className="p-3 space-y-2">
        {leads.map((l) => {
          const statusInfo = STATUS_OPTIONS.find((s) => s.value === l.status);
          return (
            <div key={l.id} className={`bg-background border rounded-xl p-3 space-y-2.5 ${l.saleDone ? "border-success/40" : "border-border"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display font-bold text-foreground text-sm">{l.displayName || l.phone}</p>
                  {l.realName && <p className="text-[10px] text-muted-foreground">{l.realName}</p>}
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{formatPhoneDisplay(l.phone)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusInfo?.color}`}>{statusInfo?.label}</span>
                  {l.saleDone && (() => {
                    const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
                    const total = items.reduce((s, i) => s + (i.amount || 0), 0);
                    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">₹{total.toLocaleString()}</span>;
                  })()}
                </div>
              </div>

              <div className="flex gap-1.5">
                <a href={getCallUrl(l.phone)} className="flex-1 h-7 rounded-lg bg-info/10 text-info text-[10px] font-medium flex items-center justify-center gap-1 hover:bg-info/20">
                  <Phone size={11} /> Call
                </a>
                <a href={getWhatsAppUrl(l.phone)} target="_blank" rel="noopener noreferrer"
                  className="flex-1 h-7 rounded-lg bg-success/10 text-success text-[10px] font-medium flex items-center justify-center gap-1 hover:bg-success/20">
                  <MessageCircle size={11} /> WA
                </a>
                <button onClick={() => setExpandedNotes(expandedNotes === l.id ? null : l.id)}
                  className="flex-1 h-7 rounded-lg bg-accent text-foreground text-[10px] font-medium flex items-center justify-center gap-1 border border-border">
                  <StickyNote size={11} /> Notes
                </button>
                <button onClick={() => onDelete(l.id)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border shrink-0">
                  <Trash2 size={11} />
                </button>
              </div>

              {/* Reassign */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground">Reassign:</span>
                <select value={l.assignedTo} onChange={(e) => onReassign(l.id, e.target.value)}
                  className="h-6 px-1.5 rounded bg-card border border-border text-foreground text-[10px] outline-none focus:border-primary flex-1">
                  {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                </select>
              </div>

              <AnimatePresence>
                {expandedNotes === l.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="bg-card border border-border rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground whitespace-pre-wrap">{l.notes || "No notes yet"}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }

  // Desktop table
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-elevated/30">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Lead</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Phone</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Notes</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Sale</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Last Activity</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Reassign</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l, i) => {
            const statusInfo = STATUS_OPTIONS.find((s) => s.value === l.status);
            return (
              <tr key={l.id} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground text-xs">{l.displayName || l.phone}</p>
                  {l.realName && <p className="text-[10px] text-muted-foreground">{l.realName}</p>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{formatPhoneDisplay(l.phone)}</span>
                    <a href={getCallUrl(l.phone)} className="w-5 h-5 rounded flex items-center justify-center text-success hover:bg-success/10" title="Call"><Phone size={11} /></a>
                    <a href={getWhatsAppUrl(l.phone)} target="_blank" rel="noopener noreferrer" className="w-5 h-5 rounded flex items-center justify-center text-success hover:bg-success/10" title="WhatsApp"><MessageCircle size={11} /></a>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusInfo?.color || ""}`}>
                    {statusInfo?.label || l.status}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  <p className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words line-clamp-2">{l.notes || "—"}</p>
                </td>
                <td className="px-4 py-3 text-center">
                  {l.saleDone ? (() => {
                    const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
                    const total = items.reduce((s, i) => s + (i.amount || 0), 0);
                    return (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">
                        ₹{total.toLocaleString()} ({items.length})
                      </span>
                    );
                  })() : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {l.lastUpdated?.seconds ? (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(l.lastUpdated.seconds * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      {" "}
                      {new Date(l.lastUpdated.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                  ) : <span className="text-[10px] text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <select value={l.assignedTo} onChange={(e) => onReassign(l.id, e.target.value)}
                    className="h-6 px-1.5 rounded bg-background border border-border text-foreground text-[10px] outline-none focus:border-primary">
                    {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => onDelete(l.id)}
                    className="w-6 h-6 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
