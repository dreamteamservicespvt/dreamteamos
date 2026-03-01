import { useState, useEffect } from "react";
import { collection, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { calculateRevenue } from "@/utils/pricing";
import { format } from "date-fns";
import type { AppUser, WorkSubmission } from "@/types";
import { CheckCircle, XCircle, Clock, Video, ExternalLink, Image, RotateCcw, Trash2 } from "lucide-react";
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
      toast({ title: "Deleted", description: "Submission deleted." });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Work Approvals</h1>
          <p className="text-muted-foreground text-sm mt-1">
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

      <div className="flex gap-1.5">
        {([
          { key: "pending" as const, label: "Pending", count: pending.length, activeClass: "bg-warning/15 text-warning border border-warning/30" },
          { key: "approved" as const, label: "Approved", count: approved.length, activeClass: "bg-success/15 text-success border border-success/30" },
          { key: "rejected" as const, label: "Rejected", count: rejected.length, activeClass: "bg-destructive/15 text-destructive border border-destructive/30" },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
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
        <div className="space-y-4">
          {displaySubs.map((sub) => {
            const estimatedRevenue = calculateRevenue(sub.items || []);
            return (
              <div key={sub.id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground">{getMemberName(sub.techMemberId)}</span>
                      <span className="text-xs text-muted-foreground font-mono">{sub.date}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{sub.totalVideos} videos</span>
                      <span className="text-primary font-mono font-semibold">{formatCurrency(sub.status === "approved" ? sub.calculatedRevenue : estimatedRevenue)}</span>
                      {sub.status !== "approved" && <span className="text-muted-foreground/60">(estimated)</span>}
                      <span className={`px-1.5 py-0.5 rounded-full ${
                        sub.aiVerificationResult === "pass" ? "bg-success/15 text-success" :
                        sub.aiVerificationResult === "fail" ? "bg-destructive/15 text-destructive" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        AI: {sub.aiVerificationResult}
                      </span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    sub.status === "pending" ? "bg-warning/15 text-warning" :
                    sub.status === "approved" ? "bg-success/15 text-success" :
                    "bg-destructive/15 text-destructive"
                  }`}>
                    {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                  </span>
                </div>

                {/* Items breakdown */}
                <div className="bg-background border border-border rounded-lg p-3 mb-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pb-1">Type</th>
                        <th className="text-left pb-1">Duration</th>
                        <th className="text-right pb-1">Qty</th>
                        <th className="text-right pb-1">Unit Price</th>
                        <th className="text-right pb-1">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sub.items?.map((item, idx) => {
                        const unitPrice = item.pricePerUnit || (
                          ({ wishes: { "20s": 499, "40s": 999 }, promotional: { "15s": 499, "30s": 999, "45s": 1499, "60s": 1999 }, cinematic: { "15s": 999, "30s": 1999, "45s": 2999, "60s": 3999 } } as any)[item.type]?.[item.duration] || 0
                        );
                        return (
                          <tr key={idx} className="text-foreground">
                            <td className="py-0.5 capitalize">{item.type}</td>
                            <td className="py-0.5">{item.duration}</td>
                            <td className="py-0.5 text-right font-mono">{item.quantity}</td>
                            <td className="py-0.5 text-right font-mono">{formatCurrency(unitPrice)}</td>
                            <td className="py-0.5 text-right font-mono text-primary">{formatCurrency(unitPrice * item.quantity)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Links */}
                <div className="flex items-center gap-4 mb-3">
                  {sub.driveFolderUrl && (
                    <a href={sub.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-info flex items-center gap-1 hover:underline">
                      <ExternalLink size={12} /> Drive Folder
                    </a>
                  )}
                  {sub.screenshotUrl && (
                    <a href={sub.screenshotUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-info flex items-center gap-1 hover:underline">
                      <Image size={12} /> Screenshot
                    </a>
                  )}
                </div>

                {/* Actions — always show relevant actions */}
                <div className="flex gap-2">
                  {sub.status === "pending" && (
                    <>
                      <button onClick={() => handleApprove(sub.id)}
                        className="flex-1 h-9 rounded-lg bg-success/15 text-success font-medium text-sm hover:bg-success/25 transition-colors flex items-center justify-center gap-1">
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button onClick={() => handleReject(sub.id)}
                        className="flex-1 h-9 rounded-lg bg-destructive/15 text-destructive font-medium text-sm hover:bg-destructive/25 transition-colors flex items-center justify-center gap-1">
                        <XCircle size={14} /> Reject
                      </button>
                    </>
                  )}
                  {sub.status === "approved" && (
                    <button onClick={() => handleReject(sub.id)}
                      className="flex-1 h-9 rounded-lg bg-destructive/15 text-destructive font-medium text-sm hover:bg-destructive/25 transition-colors flex items-center justify-center gap-1">
                      <XCircle size={14} /> Reject (Revoke Approval)
                    </button>
                  )}
                  {sub.status === "rejected" && (
                    <>
                      <button onClick={() => handleApprove(sub.id)}
                        className="flex-1 h-9 rounded-lg bg-success/15 text-success font-medium text-sm hover:bg-success/25 transition-colors flex items-center justify-center gap-1">
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button onClick={() => handleRevertToPending(sub.id)}
                        className="flex-1 h-9 rounded-lg bg-warning/15 text-warning font-medium text-sm hover:bg-warning/25 transition-colors flex items-center justify-center gap-1">
                        <RotateCcw size={14} /> Move to Pending
                      </button>
                    </>
                  )}
                  <button onClick={() => handleDelete(sub.id)}
                    className="h-9 px-3 rounded-lg bg-destructive/10 text-destructive font-medium text-sm hover:bg-destructive/20 transition-colors flex items-center justify-center gap-1"
                    title="Delete submission">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
