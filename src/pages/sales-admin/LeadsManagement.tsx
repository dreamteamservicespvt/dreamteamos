import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { normalizePhone, formatPhoneDisplay, getWhatsAppUrl, getCallUrl } from "@/utils/phone";
import { format } from "date-fns";
import type { AppUser, Lead, LeadStatus } from "@/types";
import { Phone, Plus, X, Loader2, Search, Trash2, MessageCircle, StickyNote, ChevronDown, ChevronUp } from "lucide-react";
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

export default function LeadsManagement() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Bulk add form
  const [showAdd, setShowAdd] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [adding, setAdding] = useState(false);

  // Fetch members once, then listen to leads in real-time
  useEffect(() => {
    const fetchMembers = async () => {
      const usersSnap = await getDocs(collection(db, "users"));
      const allUsers = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      const myMembers = allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser?.uid);
      setMembers(myMembers);
      if (myMembers.length > 0) setAssignTo(myMembers[0].uid);
      return myMembers;
    };

    let unsub: (() => void) | undefined;

    fetchMembers().then((myMembers) => {
      // Real-time listener for all leads assigned to my team members
      const leadsRef = collection(db, "leads");
      unsub = onSnapshot(leadsRef, (snap) => {
        const memberIds = myMembers.map((m) => m.uid);
        const allLeads = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Lead))
          .filter((l) => memberIds.includes(l.assignedTo) || l.assignedBy === currentUser?.uid);
        allLeads.sort((a, b) => (b.lastUpdated?.seconds || 0) - (a.lastUpdated?.seconds || 0));
        setLeads(allLeads);
        setLoading(false);
      });
    });

    return () => { unsub?.(); };
  }, [currentUser?.uid]);

  const getNextDisplayName = (memberUid: string, offset: number) => {
    const memberLeads = leads.filter((l) => l.assignedTo === memberUid);
    return `C${memberLeads.length + offset + 1}`;
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTo || !bulkText.trim()) {
      toast({ title: "Error", description: "Select a member and enter phone numbers.", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const lines = bulkText.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      const existingCount = leads.filter((l) => l.assignedTo === assignTo).length;

      for (let i = 0; i < lines.length; i++) {
        const phone = normalizePhone(lines[i].split(",")[0].trim());
        const displayName = `C${existingCount + i + 1}`;
        await addDoc(collection(db, "leads"), {
          assignedTo: assignTo,
          assignedBy: currentUser?.uid || "",
          phone,
          displayName,
          status: "not_called",
          notes: "",
          saleDone: false,
          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp(),
        });

        // Create notification for lead assignment
        await addDoc(collection(db, "notifications"), {
          userId: assignTo,
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

  const getMemberName = (uid: string) => members.find((m) => m.uid === uid)?.name || "Unknown";

  const dateStr = selectedDate ? format(selectedDate, "dd/MM/yyyy") : null;

  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (memberFilter !== "all" && l.assignedTo !== memberFilter) return false;
    if (dateStr) {
      const ts = l.lastUpdated?.seconds;
      if (!ts) return false;
      if (format(new Date(ts * 1000), "dd/MM/yyyy") !== dateStr) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return l.phone.includes(q) || l.displayName?.toLowerCase().includes(q) || l.notes?.toLowerCase().includes(q) || l.realName?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Leads Management</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            {selectedDate ? `Filtered: ${format(selectedDate, "dd/MM/yyyy")}` : "Real-time view of all leads"} • {filtered.length} leads
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
          <button onClick={() => setShowAdd(!showAdd)}
            className="h-9 px-3 md:px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs md:text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors">
            <Plus size={14} /> Add Leads
          </button>
        </div>
      </div>

      {/* Bulk Add Form */}
      {showAdd && (
        <form onSubmit={handleBulkAdd} className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h3 className="font-display font-semibold text-foreground">Bulk Add Leads</h3>
          <p className="text-xs text-muted-foreground">Enter one phone number per line. Names will be auto-generated (e.g., R1, R2).</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={5} placeholder={"9876543210\n9123456789\n8765432109"}
              className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono placeholder:text-muted-foreground/40 resize-none" />
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Assign To</label>
                <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary">
                  {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={adding}
                className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {adding ? "Adding..." : "Add Leads"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filters */}
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
        <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary">
          <option value="all">All Members</option>
          {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
        </select>
      </div>

      {/* Lead Cards (mobile) / Table (desktop) */}
      {isMobile ? (
        <MobileLeadCards leads={filtered} members={members} getMemberName={getMemberName} onDelete={handleDelete} onReassign={handleReassign} expandedNotes={expandedNotes} setExpandedNotes={setExpandedNotes} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Lead</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assigned To</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Notes</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Sale</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Activity</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  <Phone size={32} className="mx-auto mb-2 opacity-30" />
                  <p>No leads found</p>
                </td></tr>
              ) : (
                filtered.map((l, i) => {
                  const statusInfo = STATUS_OPTIONS.find((s) => s.value === l.status);
                  return (
                    <tr key={l.id} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{l.displayName || l.phone}</p>
                        {l.realName && <p className="text-[10px] text-muted-foreground">{l.realName}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-muted-foreground">{formatPhoneDisplay(l.phone)}</span>
                          <a href={getCallUrl(l.phone)} className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success/10" title="Call"><Phone size={12} /></a>
                          <a href={getWhatsAppUrl(l.phone)} target="_blank" rel="noopener noreferrer" className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success/10" title="WhatsApp"><MessageCircle size={12} /></a>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select value={l.assignedTo} onChange={(e) => handleReassign(l.id, e.target.value)}
                          className="h-7 px-2 rounded bg-background border border-border text-foreground text-xs outline-none focus:border-primary">
                          {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo?.color || ""}`}>
                          {statusInfo?.label || l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[250px]">
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{l.notes || "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {l.saleDone ? (() => {
                          const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
                          const total = items.reduce((s, i) => s + (i.amount || 0), 0);
                          return (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success">
                              ₹{total.toLocaleString()} ({items.length})
                            </span>
                          );
                        })() : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-left">
                        {l.lastUpdated?.seconds ? (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(l.lastUpdated.seconds * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                            {" "}
                            {new Date(l.lastUpdated.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                          </span>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDelete(l.id)}
                          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Mobile Lead Cards ─── */
function MobileLeadCards({ leads, members, getMemberName, onDelete, onReassign, expandedNotes, setExpandedNotes }: {
  leads: Lead[]; members: AppUser[]; getMemberName: (uid: string) => string;
  onDelete: (id: string) => void; onReassign: (id: string, uid: string) => void;
  expandedNotes: string | null; setExpandedNotes: (id: string | null) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Phone size={32} className="mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-muted-foreground text-sm">No leads found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leads.map((l) => {
        const statusInfo = STATUS_OPTIONS.find((s) => s.value === l.status);
        return (
          <div key={l.id} className={`bg-card border rounded-xl p-4 space-y-3 ${l.saleDone ? "border-success/40" : "border-border"}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display font-bold text-foreground">{l.displayName || l.phone}</p>
                {l.realName && <p className="text-xs text-muted-foreground">{l.realName}</p>}
                <p className="text-xs font-mono text-muted-foreground mt-0.5">{formatPhoneDisplay(l.phone)}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusInfo?.color}`}>{statusInfo?.label}</span>
                {l.saleDone && <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">₹{l.saleDetails?.amount?.toLocaleString()}</span>}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Assigned: <strong className="text-foreground">{getMemberName(l.assignedTo)}</strong></span>
              {l.lastUpdated?.seconds && (
                <span className="font-mono text-[10px]">
                  {new Date(l.lastUpdated.seconds * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  {" "}
                  {new Date(l.lastUpdated.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <a href={getCallUrl(l.phone)} className="flex-1 h-8 rounded-lg bg-info/10 text-info text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-info/20">
                <Phone size={12} /> Call
              </a>
              <a href={getWhatsAppUrl(l.phone)} target="_blank" rel="noopener noreferrer"
                className="flex-1 h-8 rounded-lg bg-success/10 text-success text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-success/20">
                <MessageCircle size={12} /> WhatsApp
              </a>
              <button onClick={() => setExpandedNotes(expandedNotes === l.id ? null : l.id)}
                className="flex-1 h-8 rounded-lg bg-accent text-foreground text-xs font-medium flex items-center justify-center gap-1.5 border border-border">
                <StickyNote size={12} /> Notes
              </button>
              <button onClick={() => onDelete(l.id)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border">
                <Trash2 size={12} />
              </button>
            </div>

            {/* Notes expand */}
            <AnimatePresence>
              {expandedNotes === l.id && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="bg-background border border-border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{l.notes || "No notes yet"}</p>
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
