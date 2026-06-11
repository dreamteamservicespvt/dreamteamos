import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { formatCurrency } from "@/utils/formatters";
import { format, subDays } from "date-fns";
import type { AppUser, Lead, LeadStatus, SaleDetail } from "@/types";
import { ArrowLeft, ShoppingBag, Phone, MessageCircle, Search } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import { formatPhoneDisplay, getCallUrl, getWhatsAppUrl } from "@/utils/phone";

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "not_called", label: "Not Called", color: "bg-muted text-muted-foreground" },
  { value: "answered", label: "Answered", color: "bg-success/15 text-success" },
  { value: "not_answered", label: "No Answer", color: "bg-warning/15 text-warning" },
  { value: "call_later", label: "Call Later", color: "bg-info/15 text-info" },
  { value: "not_interested", label: "Not Interested", color: "bg-destructive/15 text-destructive" },
];

type SaleRow = { lead: Lead; item: SaleDetail; itemIndex: number };
type VerifFilter = "all" | "pending" | "verified" | "rejected";

function getSaleDate(item: SaleDetail, lead: Lead): string | null {
  const ts = (item.submittedAt as any)?.seconds;
  if (ts) return format(new Date(ts * 1000), "yyyy-MM-dd");
  if (lead.createdAt?.seconds) return format(new Date(lead.createdAt.seconds * 1000), "yyyy-MM-dd");
  return null;
}

function buildRecentDays() {
  return Array.from({ length: 5 }, (_, i) => {
    const d = subDays(new Date(), i);
    return { dateStr: format(d, "yyyy-MM-dd"), label: format(d, "dd/MM") };
  });
}

export default function MemberSalesHistory() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [member, setMember] = useState<AppUser | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Initialise state directly from URL params (fixes "All history" bug) ─
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    const p = searchParams.get("date");
    if (!p) return undefined;
    const d = new Date(p + "T12:00:00");
    return isNaN(d.getTime()) ? undefined : d;
  });
  const [viewTab, setViewTab] = useState<"leads" | "sales">(() =>
    searchParams.get("tab") === "sales" ? "sales" : "leads"
  );

  // ── Sales tab filters ────────────────────────────────────────────────────
  const [salesSearch, setSalesSearch] = useState("");
  const [verifFilter, setVerifFilter] = useState<VerifFilter>("all");
  const [salesDay, setSalesDay] = useState<string>("all");

  // Quick day filter (shared between both tabs via selectedDate)
  const recentDays = useMemo(buildRecentDays, []);
  const [dayDropOpen, setDayDropOpen] = useState(false);

  const effectiveDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;

  const handleQuickDay = (dateStr: string | null) => {
    setSelectedDate(dateStr ? new Date(dateStr + "T12:00:00") : undefined);
    setDayDropOpen(false);
  };

  const currentQuickLabel = effectiveDateStr
    ? (recentDays.find((d) => d.dateStr === effectiveDateStr)?.label ?? format(selectedDate!, "dd/MM/yyyy"))
    : "All Days";

  // ── Data fetching ────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      const u = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)).find((u) => u.uid === memberId);
      setMember(u || null);
    }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => {
      const memberLeads = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Lead))
        .filter((l) => l.assignedTo === memberId);
      memberLeads.sort((a, b) => (b.lastUpdated?.seconds || 0) - (a.lastUpdated?.seconds || 0));
      setLeads(memberLeads);
      setLoading(false);
    }));
    return () => unsubs.forEach((u) => u());
  }, [memberId]);

  // ── Leads tab: filter by lead createdAt ──────────────────────────────────
  const filteredLeads = effectiveDateStr
    ? leads.filter((l) => {
        const ts = l.createdAt?.seconds;
        if (!ts) return false;
        return format(new Date(ts * 1000), "yyyy-MM-dd") === effectiveDateStr;
      })
    : leads;

  // ── Sales tab: filter by submittedAt + search + verif status ─────────────
  const allSaleRows: SaleRow[] = leads.flatMap((lead) => {
    const items = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
    return items
      .filter((item) => {
        if (effectiveDateStr) {
          const d = getSaleDate(item, lead);
          if (d !== effectiveDateStr) return false;
        } else if (salesDay !== "all") {
          const d = getSaleDate(item, lead);
          const dayDateStr = recentDays[parseInt(salesDay)]?.dateStr;
          if (!d || d !== dayDateStr) return false;
        }
        if (verifFilter !== "all" && item.verificationStatus !== verifFilter) return false;
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

  const verifiedRows = allSaleRows.filter((r) => r.item.verificationStatus === "verified");
  const totalRevenue = verifiedRows.reduce((s, r) => s + (r.item.amount || 0), 0);
  const saleDoneLeads = filteredLeads.filter((l) => l.saleDone).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6" onClick={() => setDayDropOpen(false)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={() => navigate(-1)}
            className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg md:text-2xl font-bold text-foreground truncate">{member?.name || "Member"}</h1>
            <p className="text-muted-foreground text-xs md:text-sm mt-0.5">
              {effectiveDateStr ? `Filtered: ${format(new Date(effectiveDateStr + "T12:00:00"), "dd/MM/yyyy")}` : "All history"}
            </p>
          </div>
        </div>

        {/* Date controls: quick dropdown + calendar */}
        <div className="flex items-center gap-2 pl-10 sm:pl-0" onClick={(e) => e.stopPropagation()}>
          {/* Quick day dropdown */}
          <div className="relative">
            <button
              onClick={() => setDayDropOpen((o) => !o)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-card border border-border text-xs text-foreground hover:bg-accent transition-colors min-w-[120px] justify-between"
            >
              <span>{currentQuickLabel}</span>
              <span className="text-muted-foreground">▾</span>
            </button>
            {dayDropOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[180px]">
                {recentDays.map((d) => (
                  <button key={d.dateStr}
                    onClick={() => handleQuickDay(d.dateStr)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      effectiveDateStr === d.dateStr ? "bg-primary/15 text-primary font-medium" : "text-foreground hover:bg-accent"
                    }`}
                  >
                    {d.label === recentDays[0].label ? `Today (${d.label})` : d.label === recentDays[1].label ? `Yesterday (${d.label})` : `${d.label}`}
                  </button>
                ))}
                <button onClick={() => handleQuickDay(null)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${!effectiveDateStr ? "bg-primary/15 text-primary font-medium" : "text-foreground hover:bg-accent"}`}>
                  All Days
                </button>
              </div>
            )}
          </div>

          {/* Calendar */}
          <DashboardDayPicker selectedDate={selectedDate} onSelect={(d) => setSelectedDate(d)} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
        {[
          { label: "Total Leads", value: filteredLeads.length, color: "text-primary" },
          { label: "Called", value: filteredLeads.filter((l) => l.status !== "not_called").length, color: "text-info" },
          { label: "Verif. Pending", value: leads.flatMap((l) => (l.saleItems || (l.saleDetails ? [l.saleDetails] : [])).filter((i) => i.verificationStatus === "pending")).length, color: "text-warning" },
          { label: "Sale Done", value: saleDoneLeads, color: "text-success" },
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
          Leads ({filteredLeads.length})
        </button>
        <button onClick={() => setViewTab("sales")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${viewTab === "sales" ? "bg-success/15 text-success border border-success/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Sales ({allSaleRows.length})
        </button>
      </div>

      {/* ── Sales Tab Filters ─────────────────────────────────────────────── */}
      {viewTab === "sales" && (
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, phone, category..."
              value={salesSearch}
              onChange={(e) => setSalesSearch(e.target.value)}
              className="w-full h-9 pl-8 pr-3 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
          {/* Day filter */}
          <select
            value={salesDay}
            onChange={(e) => setSalesDay(e.target.value)}
            className="h-9 px-3 rounded-lg bg-card border border-border text-sm text-foreground outline-none focus:border-primary transition-colors"
          >
            {recentDays.map((d, i) => (
              <option key={d.dateStr} value={String(i)}>
                {i === 0 ? `Today (${d.label})` : i === 1 ? `Yesterday (${d.label})` : `${d.label}`}
              </option>
            ))}
            <option value="all">All Days</option>
          </select>
          {/* Verification status filter */}
          <select
            value={verifFilter}
            onChange={(e) => setVerifFilter(e.target.value as VerifFilter)}
            className="h-9 px-3 rounded-lg bg-card border border-border text-sm text-foreground outline-none focus:border-primary transition-colors"
          >
            <option value="all">All Status ({allSaleRows.length})</option>
            <option value="pending">Pending ({allSaleRows.filter((r) => r.item.verificationStatus === "pending").length})</option>
            <option value="verified">Verified ({verifiedRows.length})</option>
            <option value="rejected">Rejected ({allSaleRows.filter((r) => r.item.verificationStatus === "rejected").length})</option>
          </select>
        </div>
      )}

      {/* ── Leads Tab ─────────────────────────────────────────────────────── */}
      {viewTab === "leads" && (
        filteredLeads.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Phone size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No leads found{effectiveDateStr ? " for this date" : ""}</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Desktop table */}
            <table className="w-full text-sm hidden md:table">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Lead</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Notes</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Sale</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((l, i) => {
                  const statusInfo = STATUS_OPTIONS.find((s) => s.value === l.status);
                  const saleItems = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
                  const saleTotal = saleItems.reduce((s, item) => s + (item.amount || 0), 0);
                  return (
                    <tr key={l.id} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{l.displayName || l.phone}</p>
                        {l.realName && <p className="text-[10px] text-muted-foreground">{l.realName}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-muted-foreground">{formatPhoneDisplay(l.phone)}</span>
                          <a href={getCallUrl(l.phone)} className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success/10"><Phone size={12} /></a>
                          <a href={getWhatsAppUrl(l.phone)} target="_blank" rel="noopener noreferrer" className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success/10"><MessageCircle size={12} /></a>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo?.color || ""}`}>{statusInfo?.label || l.status}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words truncate">{l.notes || "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {l.saleDone
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success">₹{saleTotal.toLocaleString()} ({saleItems.length})</span>
                          : <span className="text-xs text-muted-foreground">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {l.lastUpdated?.seconds
                          ? <span className="text-[10px] text-muted-foreground font-mono">
                              {format(new Date(l.lastUpdated.seconds * 1000), "dd/MM/yyyy HH:mm")}
                            </span>
                          : <span className="text-[10px] text-muted-foreground">—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2 p-2">
              {filteredLeads.map((l) => {
                const statusInfo = STATUS_OPTIONS.find((s) => s.value === l.status);
                const saleItems = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
                const saleTotal = saleItems.reduce((s, item) => s + (item.amount || 0), 0);
                return (
                  <div key={l.id} className={`bg-background border rounded-lg p-3 space-y-2 ${l.saleDone ? "border-success/40" : "border-border"}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-foreground text-sm">{l.displayName || l.phone}</p>
                        {l.realName && <p className="text-[10px] text-muted-foreground">{l.realName}</p>}
                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{formatPhoneDisplay(l.phone)}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusInfo?.color || ""}`}>{statusInfo?.label}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-2">
                        {l.saleDone && <span className="px-2 py-0.5 rounded-full bg-success/15 text-success font-medium">₹{saleTotal.toLocaleString()}</span>}
                        {l.notes && <span className="truncate max-w-[120px]">{l.notes}</span>}
                      </div>
                      {l.lastUpdated?.seconds && <span className="font-mono">{format(new Date(l.lastUpdated.seconds * 1000), "dd/MM")}</span>}
                    </div>
                    <div className="flex gap-2">
                      <a href={getCallUrl(l.phone)} className="flex-1 h-7 rounded-md bg-info/10 text-info text-[10px] font-medium flex items-center justify-center gap-1"><Phone size={10} /> Call</a>
                      <a href={getWhatsAppUrl(l.phone)} target="_blank" rel="noopener noreferrer" className="flex-1 h-7 rounded-md bg-success/10 text-success text-[10px] font-medium flex items-center justify-center gap-1"><MessageCircle size={10} /> WhatsApp</a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* ── Sales Tab ─────────────────────────────────────────────────────── */}
      {viewTab === "sales" && (
        allSaleRows.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <ShoppingBag size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No sales found{effectiveDateStr ? " for this date" : ""}</p>
            {effectiveDateStr && <p className="text-muted-foreground text-xs mt-1">Sales are filtered by the date the member submitted them</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allSaleRows.map((r, key) => {
              const submittedTs = (r.item.submittedAt as any)?.seconds || r.lead.lastUpdated?.seconds;
              return (
                <div key={`${r.lead.id}-${r.itemIndex}-${key}`} className="bg-card border border-border rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground">{r.lead.displayName || r.lead.phone}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">{formatPhoneDisplay(r.lead.phone)}</span>
                        <a href={getCallUrl(r.lead.phone)} className="text-info hover:bg-info/10 w-5 h-5 rounded flex items-center justify-center"><Phone size={10} /></a>
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
                    {submittedTs && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Submitted:</span>{" "}
                        <span className="text-foreground font-mono text-[10px]">
                          {format(new Date(submittedTs * 1000), "dd MMM yyyy, hh:mm a")}
                        </span>
                      </div>
                    )}
                    {r.item.verificationStatus === "verified" && (r.item.verifiedAt as any)?.seconds && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Approved:</span>{" "}
                        <span className="text-success font-mono text-[10px]">
                          {format(new Date((r.item.verifiedAt as any).seconds * 1000), "dd MMM yyyy, hh:mm a")}
                        </span>
                      </div>
                    )}
                  </div>
                  {r.item.paymentScreenshotUrl && (
                    <a href={r.item.paymentScreenshotUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-info flex items-center gap-1 hover:underline">
                      <ShoppingBag size={11} /> View Payment Screenshot
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
