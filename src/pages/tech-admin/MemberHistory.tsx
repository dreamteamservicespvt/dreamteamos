import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { WorkSubmission, AppUser } from "@/types";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, FileText, Image, Trash2, Loader2, TrendingUp, IndianRupee, Video } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/formatters";
import { PRICING } from "@/utils/pricing";

export default function TechAdminMemberHistory() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [member, setMember] = useState<AppUser | null>(null);
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WorkSubmission | null>(null);

  useEffect(() => {
    if (!memberId) return;
    const unsub = onSnapshot(doc(db, "users", memberId), (snap) => {
      if (snap.exists()) setMember({ uid: snap.id, ...snap.data() } as AppUser);
    });
    return unsub;
  }, [memberId]);

  useEffect(() => {
    if (!memberId) return;
    const q = query(collection(db, "work_submissions"), where("techMemberId", "==", memberId));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkSubmission));
      list.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
      setSubmissions(list);
      setLoading(false);
    });
    return unsub;
  }, [memberId]);

  const handleDelete = async (sub: WorkSubmission) => {
    setDeletingId(sub.id);
    try {
      await deleteDoc(doc(db, "work_submissions", sub.id));
      toast({ title: "Deleted", description: "Submission removed." });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const filtered = dateStr ? submissions.filter((s) => s.date === dateStr) : submissions;

  // Revenue calculations
  const revenueStats = useMemo(() => {
    const approvedSubs = filtered.filter((s) => s.status === "approved");
    const totalRevenue = approvedSubs.reduce((sum, s) => sum + (s.calculatedRevenue || 0), 0);
    const totalVideos = approvedSubs.reduce((sum, s) => sum + (s.totalVideos || 0), 0);
    const salary = member?.salary || 0;
    const revenueVsSalary = salary > 0 ? ((totalRevenue / salary) * 100) : 0;
    return { totalRevenue, totalVideos, salary, revenueVsSalary, approvedCount: approvedSubs.length };
  }, [filtered, member?.salary]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg md:text-2xl font-bold text-foreground truncate">{member?.name || "Member"}'s History</h1>
            <p className="text-muted-foreground text-xs md:text-sm mt-0.5 truncate">{submissions.length} submissions · {member?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-11 sm:pl-0">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
        </div>
      </div>

      {/* Revenue Overview */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5">
        <h3 className="font-display font-semibold text-foreground text-xs md:text-base mb-2 md:mb-3">Revenue Overview</h3>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5 md:gap-3">
          <div className="bg-background border border-border rounded-lg p-1.5 md:p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5 md:mb-1">
              <TrendingUp size={10} className="text-primary md:hidden" />
              <TrendingUp size={12} className="text-primary hidden md:block" />
              <p className="text-[8px] md:text-xs text-muted-foreground">Revenue</p>
            </div>
            <p className="font-display font-bold text-xs md:text-lg text-primary">{formatCurrency(revenueStats.totalRevenue)}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-1.5 md:p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5 md:mb-1">
              <IndianRupee size={10} className="text-warning md:hidden" />
              <IndianRupee size={12} className="text-warning hidden md:block" />
              <p className="text-[8px] md:text-xs text-muted-foreground">Salary</p>
            </div>
            <p className="font-display font-bold text-xs md:text-lg text-warning">{formatCurrency(revenueStats.salary)}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-1.5 md:p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5 md:mb-1">
              <Video size={10} className="text-info md:hidden" />
              <Video size={12} className="text-info hidden md:block" />
              <p className="text-[8px] md:text-xs text-muted-foreground">Videos</p>
            </div>
            <p className="font-display font-bold text-xs md:text-lg text-foreground">{revenueStats.totalVideos}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-1.5 md:p-3 text-center">
            <p className="text-[8px] md:text-xs text-muted-foreground mb-0.5 md:mb-1">Approved</p>
            <p className="font-display font-bold text-xs md:text-lg text-success">{revenueStats.approvedCount}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-1.5 md:p-3 text-center">
            <p className="text-[8px] md:text-xs text-muted-foreground mb-0.5 md:mb-1">Rev vs Sal</p>
            <p className={`font-display font-bold text-xs md:text-lg ${revenueStats.salary > 0 ? (revenueStats.revenueVsSalary >= 100 ? "text-success" : revenueStats.revenueVsSalary >= 50 ? "text-warning" : "text-destructive") : "text-muted-foreground"}`}>
              {revenueStats.salary > 0 ? `${revenueStats.revenueVsSalary.toFixed(0)}%` : "N/S"}
            </p>
          </div>
        </div>
        {revenueStats.salary > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] md:text-xs mb-1">
              <span className="text-muted-foreground">Revenue / Salary ratio</span>
              <span className="font-mono text-foreground">{formatCurrency(revenueStats.totalRevenue)} / {formatCurrency(revenueStats.salary)}</span>
            </div>
            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${revenueStats.revenueVsSalary >= 100 ? "bg-success" : revenueStats.revenueVsSalary >= 50 ? "bg-warning" : "bg-destructive"}`}
                style={{ width: `${Math.min(revenueStats.revenueVsSalary, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {[
          { label: "Total", value: filtered.length },
          { label: "Approved", value: filtered.filter((s) => s.status === "approved").length },
          { label: "Pending", value: filtered.filter((s) => s.status === "pending").length },
          { label: "Rejected", value: filtered.filter((s) => s.status === "rejected").length },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-2.5 md:p-3 text-center">
            <p className="text-[10px] md:text-xs text-muted-foreground">{stat.label}</p>
            <p className="font-display font-bold text-lg md:text-xl text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <FileText size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No submissions found{dateStr ? ` for ${format(selectedDate!, "dd/MM/yyyy")}` : ""}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <div key={s.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                  <span className="font-mono text-sm text-foreground font-medium">{s.date}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    s.status === "approved" ? "bg-success/15 text-success"
                    : s.status === "rejected" ? "bg-destructive/15 text-destructive"
                    : "bg-warning/15 text-warning"
                  }`}>{s.status}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    s.aiVerificationResult === "pass" ? "bg-success/15 text-success"
                    : s.aiVerificationResult === "fail" ? "bg-destructive/15 text-destructive"
                    : "bg-warning/15 text-warning"
                  }`}>AI: {s.aiVerificationResult}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {s.driveFolderUrl && (
                    <a href={s.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                      className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Drive Folder">
                      <ExternalLink size={13} />
                    </a>
                  )}
                  {s.screenshotUrl && (
                    <a href={s.screenshotUrl} target="_blank" rel="noopener noreferrer"
                      className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Screenshot">
                      <Image size={13} />
                    </a>
                  )}
                  <button onClick={() => setConfirmDelete(s)} title="Delete"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Videos: <span className="text-foreground font-medium">{s.totalVideos}</span></span>
                {s.calculatedRevenue > 0 && (
                  <span className="text-muted-foreground">Revenue: <span className="text-primary font-bold">{formatCurrency(s.calculatedRevenue)}</span></span>
                )}
              </div>
              {s.items && s.items.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {s.items.map((item, i) => {
                    const unitPrice = item.pricePerUnit || PRICING[item.type]?.[item.duration] || item.adminApprovedPrice || 0;
                    const lineTotal = unitPrice * item.quantity;
                    return (
                      <div key={i} className="flex items-center justify-between bg-accent/30 border border-border/50 rounded-lg px-2 md:px-3 py-1.5 text-[10px] md:text-xs">
                        <span className="text-muted-foreground capitalize">
                          {item.type} <span className="text-foreground font-medium">{item.duration}</span> <span className="text-muted-foreground">×{item.quantity}</span>
                        </span>
                        <span className="font-mono text-foreground">
                          <span className="text-muted-foreground hidden sm:inline">{formatCurrency(unitPrice)} × {item.quantity} = </span>
                          <span className="text-primary font-semibold">{formatCurrency(lineTotal)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-foreground mb-2">Delete Submission?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Delete submission from <strong className="text-foreground">{confirmDelete.date}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 h-9 rounded-lg bg-accent text-foreground text-sm font-medium border border-border">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={deletingId === confirmDelete.id}
                className="flex-1 h-9 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {deletingId === confirmDelete.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
