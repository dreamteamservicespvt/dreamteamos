import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import type { AppUser, Lead, LeadStatus, SaleDetail } from "@/types";
import { ArrowLeft, ShoppingBag, Phone, MessageCircle } from "lucide-react";
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

export default function MemberSalesHistory() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<AppUser | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [viewTab, setViewTab] = useState<"leads" | "sales">("leads");

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

  const dateStr = selectedDate ? format(selectedDate, "dd/MM/yyyy") : null;

  // Filter leads by date
  const filteredLeads = dateStr
    ? leads.filter((l) => {
        const ts = l.lastUpdated?.seconds;
        if (!ts) return false;
        return format(new Date(ts * 1000), "dd/MM/yyyy") === dateStr;
      })
    : leads;

  // Build flat sale rows from filtered leads
  const allRows: SaleRow[] = filteredLeads.flatMap((lead) => {
    const items = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
    return items.map((item, idx) => ({ lead, item, itemIndex: idx }));
  });

  const verified = allRows.filter((r) => r.item.verificationStatus === "verified");
  const totalRevenue = verified.reduce((s, r) => s + (r.item.amount || 0), 0);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/sales-admin/team")}
            className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">{member?.name || "Member"}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {selectedDate ? `Filtered: ${format(selectedDate, "dd/MM/yyyy")}` : "All history"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Leads", value: filteredLeads.length, color: "text-primary" },
          { label: "Sale Done", value: saleDoneLeads, color: "text-success" },
          { label: "Verified Sales", value: verified.length, color: "text-success" },
          { label: "Revenue", value: formatCurrency(totalRevenue), color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`font-display font-bold text-xl ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* View Toggle */}
      <div className="flex gap-1.5">
        <button onClick={() => setViewTab("leads")}
          className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors ${viewTab === "leads" ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Leads ({filteredLeads.length})
        </button>
        <button onClick={() => setViewTab("sales")}
          className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors ${viewTab === "sales" ? "bg-success/15 text-success border border-success/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Sales ({allRows.length})
        </button>
      </div>

      {/* Leads Tab */}
      {viewTab === "leads" && (
        filteredLeads.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Phone size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No leads found{selectedDate ? " for this date" : ""}</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
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
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo?.color || ""}`}>
                          {statusInfo?.label || l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words truncate">{l.notes || "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {l.saleDone ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success">
                            ₹{saleTotal.toLocaleString()} ({saleItems.length})
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Sales Tab */}
      {viewTab === "sales" && (
        allRows.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <ShoppingBag size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No sales found{selectedDate ? " for this date" : ""}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allRows.map((r, key) => (
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
