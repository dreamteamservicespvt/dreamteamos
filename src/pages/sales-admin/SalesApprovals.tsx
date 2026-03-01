import { useState, useEffect } from "react";
import { collection, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import type { AppUser, Lead, SaleDetail } from "@/types";
import { CheckCircle, XCircle, ShoppingBag, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DashboardDayPicker from "@/components/dashboard/DayPicker";

export default function SalesApprovals() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "verified" | "rejected">("pending");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    let myMemberIds: string[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      const myMembers = allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser?.uid);
      setMembers(myMembers);
      myMemberIds = myMembers.map((m) => m.uid);
    }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => {
      const salesLeads = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Lead))
        .filter((l) => myMemberIds.includes(l.assignedTo) && l.saleDone);
      setLeads(salesLeads);
      setLoading(false);
    }));
    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid]);

  const getAllItems = (lead: Lead): SaleDetail[] => {
    return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
  };

  const handleVerifyItem = async (leadId: string, itemIndex: number) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    try {
      const items = [...getAllItems(lead)];
      items[itemIndex] = { ...items[itemIndex], verificationStatus: "verified" };
      await updateDoc(doc(db, "leads", leadId), {
        saleItems: items,
        lastUpdated: serverTimestamp(),
      });
      if (lead) {
        await addDoc(collection(db, "notifications"), {
          userId: lead.assignedTo,
          type: "sale_approved",
          title: "Sale Verified",
          message: `Your sale of ₹${items[itemIndex].amount?.toLocaleString()} for ${lead.displayName} has been verified!`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
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
      items[itemIndex] = { ...items[itemIndex], verificationStatus: "rejected" };
      await updateDoc(doc(db, "leads", leadId), {
        saleItems: items,
        lastUpdated: serverTimestamp(),
      });
      if (lead) {
        await addDoc(collection(db, "notifications"), {
          userId: lead.assignedTo,
          type: "sale_rejected",
          title: "Sale Rejected",
          message: `Your ${items[itemIndex].category} sale of ₹${items[itemIndex].amount?.toLocaleString()} for ${lead.displayName} has been rejected.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
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
      items[itemIndex] = { ...items[itemIndex], verificationStatus: "pending" };
      await updateDoc(doc(db, "leads", leadId), {
        saleItems: items,
        lastUpdated: serverTimestamp(),
      });
      if (lead) {
        await addDoc(collection(db, "notifications"), {
          userId: lead.assignedTo,
          type: "sale_revoked",
          title: "Sale Approval Revoked",
          message: `Your ${items[itemIndex].category} sale for ${lead.displayName} has been moved back to pending.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
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
      items.splice(itemIndex, 1);
      const updates: Record<string, any> = {
        saleItems: items,
        lastUpdated: serverTimestamp(),
      };
      if (items.length === 0) {
        updates.saleDone = false;
        updates.saleDetails = null;
      }
      await updateDoc(doc(db, "leads", leadId), updates);
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

  const getMemberName = (uid: string) => members.find((m) => m.uid === uid)?.name || "Unknown";

  const dateStr = selectedDate ? format(selectedDate, "dd/MM/yyyy") : null;

  // Build flat list of lead+item pairs for filtering
  type LeadItem = { lead: Lead; item: SaleDetail; itemIndex: number };
  const allLeadItems: LeadItem[] = leads.flatMap((lead) =>
    getAllItems(lead).map((item, idx) => ({ lead, item, itemIndex: idx }))
  );
  // Pending always shows all; verified filters by date
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
  const displayItems = tab === "pending" ? pending : tab === "verified" ? verified : rejected;

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
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Sales Approvals</h1>
          <p className="text-muted-foreground text-sm mt-1">
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

      <div className="flex gap-1.5">
        <button onClick={() => setTab("pending")}
          className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors ${tab === "pending" ? "bg-warning/15 text-warning border border-warning/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Pending ({pending.length})
        </button>
        <button onClick={() => setTab("verified")}
          className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors ${tab === "verified" ? "bg-success/15 text-success border border-success/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Verified ({verified.length})
        </button>
        <button onClick={() => setTab("rejected")}
          className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors ${tab === "rejected" ? "bg-destructive/15 text-destructive border border-destructive/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Rejected ({rejected.length})
        </button>
      </div>

      {displayItems.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <ShoppingBag size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No {tab} sales</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayItems.map((li, key) => (
            <div key={`${li.lead.id}-${li.itemIndex}-${key}`} className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{li.lead.displayName || li.lead.phone}</p>
                  <p className="text-xs text-muted-foreground font-mono">{li.lead.phone}</p>
                </div>
                <p className="font-display font-bold text-primary text-lg">{formatCurrency(li.item.amount || 0)}</p>
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
              </div>

              {li.item.paymentScreenshotUrl && (
                <a href={li.item.paymentScreenshotUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-info flex items-center gap-1 hover:underline">
                  <ExternalLink size={12} /> View Payment Screenshot
                </a>
              )}

              {tab === "pending" && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleVerifyItem(li.lead.id, li.itemIndex)}
                    className="flex-1 h-9 rounded-lg bg-success/15 text-success font-medium text-sm hover:bg-success/25 transition-colors flex items-center justify-center gap-1">
                    <CheckCircle size={14} /> Verify
                  </button>
                  <button onClick={() => handleRejectItem(li.lead.id, li.itemIndex)}
                    className="flex-1 h-9 rounded-lg bg-destructive/15 text-destructive font-medium text-sm hover:bg-destructive/25 transition-colors flex items-center justify-center gap-1">
                    <XCircle size={14} /> Reject
                  </button>
                  <button onClick={() => handleDeleteItem(li.lead.id, li.itemIndex)}
                    className="w-9 h-9 rounded-lg bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors flex items-center justify-center shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              {tab === "verified" && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleRevokeItem(li.lead.id, li.itemIndex)}
                    className="flex-1 h-9 rounded-lg bg-warning/15 text-warning font-medium text-sm hover:bg-warning/25 transition-colors flex items-center justify-center gap-1">
                    <RotateCcw size={14} /> Revoke
                  </button>
                  <button onClick={() => handleRejectItem(li.lead.id, li.itemIndex)}
                    className="flex-1 h-9 rounded-lg bg-destructive/15 text-destructive font-medium text-sm hover:bg-destructive/25 transition-colors flex items-center justify-center gap-1">
                    <XCircle size={14} /> Reject
                  </button>
                  <button onClick={() => handleDeleteItem(li.lead.id, li.itemIndex)}
                    className="w-9 h-9 rounded-lg bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors flex items-center justify-center shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              {tab === "rejected" && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleRevokeItem(li.lead.id, li.itemIndex)}
                    className="flex-1 h-9 rounded-lg bg-warning/15 text-warning font-medium text-sm hover:bg-warning/25 transition-colors flex items-center justify-center gap-1">
                    <RotateCcw size={14} /> To Pending
                  </button>
                  <button onClick={() => handleVerifyItem(li.lead.id, li.itemIndex)}
                    className="flex-1 h-9 rounded-lg bg-success/15 text-success font-medium text-sm hover:bg-success/25 transition-colors flex items-center justify-center gap-1">
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button onClick={() => handleDeleteItem(li.lead.id, li.itemIndex)}
                    className="w-9 h-9 rounded-lg bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors flex items-center justify-center shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
