import { useState, useEffect } from "react";
import { collection, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { calculateRevenue } from "@/utils/pricing";
import { format } from "date-fns";
import type { AppUser, WorkSubmission } from "@/types";
import { CheckCircle, XCircle, Clock, Video, ExternalLink, Image, RotateCcw, Trash2, CheckSquare, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DashboardDayPicker from "@/components/dashboard/DayPicker";

export default function WorkApprovals() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    let myMemberIds: string[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      const myMembers = allUsers.filter((u) => u.role === "tech_member" && u.createdBy === currentUser?.uid);
      setMembers(myMembers);
      myMemberIds = myMembers.map((m) => m.uid);
    }));
    unsubs.push(onSnapshot(collection(db, "work_submissions"), (snap) => {
      const subs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WorkSubmission))
        .filter((s) => myMemberIds.includes(s.techMemberId))
        .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
      setSubmissions(subs);
      setLoading(false);
    }));
    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid]);

  const handleApprove = async (subId: string) => {
    const sub = submissions.find((s) => s.id === subId);
    if (!sub) return;
    try {
      // Calculate revenue using pricing utils
      const revenue = calculateRevenue(sub.items || []);
      
      await updateDoc(doc(db, "work_submissions", subId), {
        status: "approved",
        approvedBy: currentUser?.uid,
        approvedAt: serverTimestamp(),
        calculatedRevenue: revenue,
      });
      await addDoc(collection(db, "notifications"), {
        userId: sub.techMemberId,
        type: "work_approved",
        title: "Work Approved",
        message: `Your submission for ${sub.date} (${sub.totalVideos} videos, ${formatCurrency(revenue)}) has been approved!`,
        read: false,
        createdAt: serverTimestamp(),
      });
      setSubmissions((prev) => prev.map((s) => s.id === subId ? { ...s, status: "approved", calculatedRevenue: revenue } : s));
      toast({ title: "Approved", description: `Work approved — Revenue: ${formatCurrency(revenue)}` });
    } catch {
      toast({ title: "Error", description: "Failed to approve.", variant: "destructive" });
    }
  };

  const handleReject = async (subId: string) => {
    const sub = submissions.find((s) => s.id === subId);
    try {
      await updateDoc(doc(db, "work_submissions", subId), {
        status: "rejected",
        approvedBy: currentUser?.uid,
        approvedAt: serverTimestamp(),
        calculatedRevenue: 0,
      });
      if (sub) {
        await addDoc(collection(db, "notifications"), {
          userId: sub.techMemberId,
          type: "work_rejected",
          title: "Work Rejected",
          message: `Your submission for ${sub.date} has been rejected. Please review and resubmit.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      setSubmissions((prev) => prev.map((s) => s.id === subId ? { ...s, status: "rejected", calculatedRevenue: 0 } : s));
      toast({ title: "Rejected", description: "Work submission rejected." });
    } catch {
      toast({ title: "Error", description: "Failed to reject.", variant: "destructive" });
    }
  };

  const handleRevertToPending = async (subId: string) => {
    try {
      await updateDoc(doc(db, "work_submissions", subId), {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        calculatedRevenue: 0,
      });
      setSubmissions((prev) => prev.map((s) => s.id === subId ? { ...s, status: "pending", calculatedRevenue: 0 } : s));
      toast({ title: "Reverted", description: "Submission moved back to pending." });
    } catch {
      toast({ title: "Error", description: "Failed to revert.", variant: "destructive" });
    }
  };

  const handleDelete = async (subId: string) => {
    if (!confirm("Delete this submission permanently?")) return;
    try {
      await deleteDoc(doc(db, "work_submissions", subId));
      setSubmissions((prev) => prev.filter((s) => s.id !== subId));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(subId); return next; });
      toast({ title: "Deleted", description: "Submission deleted." });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} submission(s) permanently?`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => deleteDoc(doc(db, "work_submissions", id))));
      setSubmissions((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      toast({ title: "Deleted", description: `${selectedIds.size} submission(s) deleted.` });
      setSelectedIds(new Set());
    } catch {
      toast({ title: "Error", description: "Failed to delete some submissions.", variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const getMemberName = (uid: string) => members.find((m) => m.uid === uid)?.name || "Unknown";

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;

  // Pending always shows ALL (no date filter) so admin can take action
  const pending = submissions.filter((s) => s.status === "pending");
  const approved = submissions.filter((s) => s.status === "approved" && (!dateStr || s.date === dateStr));
  const rejected = submissions.filter((s) => s.status === "rejected" && (!dateStr || s.date === dateStr));

  const displaySubs = tab === "pending" ? pending : tab === "approved" ? approved : rejected;

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Work Approvals</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            {selectedDate ? `Filtered to ${format(selectedDate, "dd/MM/yyyy")}` : "Review and approve work submissions from your team"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {([
          { key: "pending" as const, label: "Pending", count: pending.length, activeClass: "bg-warning/15 text-warning border border-warning/30" },
          { key: "approved" as const, label: "Approved", count: approved.length, activeClass: "bg-success/15 text-success border border-success/30" },
          { key: "rejected" as const, label: "Rejected", count: rejected.length, activeClass: "bg-destructive/15 text-destructive border border-destructive/30" },
        ]).map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setSelectedIds(new Set()); }}
            className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key ? t.activeClass : "bg-card border border-border text-muted-foreground hover:bg-accent"
            }`}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {displaySubs.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Video size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No {tab} submissions</p>
        </div>
      ) : (
        <>
          {/* Select All / Bulk Delete bar */}
          <div className="flex items-center justify-between">
            <button onClick={() => {
              if (selectedIds.size === displaySubs.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(displaySubs.map((s) => s.id)));
              }
            }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {selectedIds.size === displaySubs.length && displaySubs.length > 0
                ? <CheckSquare size={14} className="text-primary" />
                : <Square size={14} />}
              {selectedIds.size === displaySubs.length && displaySubs.length > 0 ? 'Deselect All' : 'Select All'}
              {selectedIds.size > 0 && <span className="text-primary font-medium">({selectedIds.size})</span>}
            </button>
            {selectedIds.size > 0 && (
              <button onClick={handleBulkDelete} disabled={bulkDeleting}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-50">
                <Trash2 size={12} />
                {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
              </button>
            )}
          </div>

          {/* 2-column grid on desktop, 1-column on mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {displaySubs.map((sub) => {
              const estimatedRevenue = calculateRevenue(sub.items || []);
              const isSelected = selectedIds.has(sub.id);
              return (
                <div key={sub.id} className={`bg-card border rounded-xl p-3 md:p-4 transition-colors ${isSelected ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                  {/* Header row with checkbox */}
                  <div className="flex items-start gap-2 mb-2">
                    <button onClick={() => toggleSelect(sub.id)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors">
                      {isSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground text-sm truncate">{getMemberName(sub.techMemberId)}</span>
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">{sub.date}</span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                          sub.status === "pending" ? "bg-warning/15 text-warning" :
                          sub.status === "approved" ? "bg-success/15 text-success" :
                          "bg-destructive/15 text-destructive"
                        }`}>
                          {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                        <span>{sub.totalVideos} video{sub.totalVideos !== 1 ? 's' : ''}</span>
                        <span className="text-primary font-mono font-semibold text-xs">{formatCurrency(sub.status === "approved" ? sub.calculatedRevenue : estimatedRevenue)}</span>
                        <span className={`px-1 py-0.5 rounded-full ${
                          sub.aiVerificationResult === "pass" ? "bg-success/15 text-success" :
                          sub.aiVerificationResult === "fail" ? "bg-destructive/15 text-destructive" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          AI: {sub.aiVerificationResult}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Items breakdown - compact */}
                  <div className="bg-background border border-border rounded-lg p-2 mb-2">
                    <div className="space-y-1">
                      {sub.items?.map((item, idx) => {
                        const unitPrice = item.pricePerUnit || (
                          ({ wishes: { "20s": 499, "40s": 999 }, promotional: { "16s": 499, "32s": 999, "48s": 1499, "64s": 1999 }, cinematic: { "16s": 998, "32s": 1998, "48s": 2998, "64s": 3998 } } as any)[item.type]?.[item.duration] || 0
                        );
                        return (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="capitalize text-foreground font-medium">{item.type}</span>
                              <span className="text-muted-foreground">{item.duration} ×{item.quantity}</span>
                            </div>
                            <span className="font-mono text-primary">{formatCurrency(unitPrice * item.quantity)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Links */}
                  {(sub.driveFolderUrl || sub.screenshotUrl) && (
                    <div className="flex items-center gap-3 mb-2">
                      {sub.driveFolderUrl && (
                        <a href={sub.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-info flex items-center gap-1 hover:underline">
                          <ExternalLink size={10} /> Drive
                        </a>
                      )}
                      {sub.screenshotUrl && (
                        <a href={sub.screenshotUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-info flex items-center gap-1 hover:underline">
                          <Image size={10} /> Screenshot
                        </a>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    {sub.status === "pending" && (
                      <>
                        <button onClick={() => handleApprove(sub.id)}
                          className="flex-1 h-7 md:h-8 rounded-lg bg-success/15 text-success font-medium text-[10px] md:text-xs hover:bg-success/25 transition-colors flex items-center justify-center gap-1">
                          <CheckCircle size={12} /> Approve
                        </button>
                        <button onClick={() => handleReject(sub.id)}
                          className="flex-1 h-7 md:h-8 rounded-lg bg-destructive/15 text-destructive font-medium text-[10px] md:text-xs hover:bg-destructive/25 transition-colors flex items-center justify-center gap-1">
                          <XCircle size={12} /> Reject
                        </button>
                      </>
                    )}
                    {sub.status === "approved" && (
                      <button onClick={() => handleReject(sub.id)}
                        className="flex-1 h-7 md:h-8 rounded-lg bg-destructive/15 text-destructive font-medium text-[10px] md:text-xs hover:bg-destructive/25 transition-colors flex items-center justify-center gap-1">
                        <XCircle size={12} /> Revoke
                      </button>
                    )}
                    {sub.status === "rejected" && (
                      <>
                        <button onClick={() => handleApprove(sub.id)}
                          className="flex-1 h-7 md:h-8 rounded-lg bg-success/15 text-success font-medium text-[10px] md:text-xs hover:bg-success/25 transition-colors flex items-center justify-center gap-1">
                          <CheckCircle size={12} /> Approve
                        </button>
                        <button onClick={() => handleRevertToPending(sub.id)}
                          className="flex-1 h-7 md:h-8 rounded-lg bg-warning/15 text-warning font-medium text-[10px] md:text-xs hover:bg-warning/25 transition-colors flex items-center justify-center gap-1">
                          <RotateCcw size={12} /> Pending
                        </button>
                      </>
                    )}
                    <button onClick={() => handleDelete(sub.id)}
                      className="h-7 md:h-8 px-2 rounded-lg bg-destructive/10 text-destructive text-[10px] md:text-xs hover:bg-destructive/20 transition-colors flex items-center justify-center shrink-0"
                      title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
