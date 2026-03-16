import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import type { WorkAssignment, AppUser, DailyCheckin } from "@/types";
import { format, subDays, startOfDay } from "date-fns";
import { ArrowLeft, FileText, Loader2, TrendingUp, IndianRupee, Video, CheckCircle2, XCircle, ExternalLink, Image, Clock, Calendar, ChevronDown } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import { formatCurrency, formatDate, formatTime } from "@/utils/formatters";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";

export default function TechAdminMemberHistory() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [member, setMember] = useState<AppUser | null>(null);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinDayFilter, setCheckinDayFilter] = useState<string>("0");
  const [checkinCalDate, setCheckinCalDate] = useState<Date | undefined>(undefined);
  const [assignDayFilter, setAssignDayFilter] = useState<string>("0");
  const [assignCalDate, setAssignCalDate] = useState<Date | undefined>(undefined);
  const [showCheckins, setShowCheckins] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [viewScreenshot, setViewScreenshot] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) return;
    const unsub = onSnapshot(doc(db, "users", memberId), (snap) => {
      if (snap.exists()) setMember({ uid: snap.id, ...snap.data() } as AppUser);
    });
    return unsub;
  }, [memberId]);

  useEffect(() => {
    if (!memberId) return;
    const q = query(collection(db, "work_assignments"), where("assignedTo", "==", memberId));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment));
      list.sort((a, b) => (b.assignedAt?.seconds || 0) - (a.assignedAt?.seconds || 0));
      setAssignments(list);
      setLoading(false);
    });
    return unsub;
  }, [memberId]);

  useEffect(() => {
    if (!memberId) return;
    const q = query(collection(db, "daily_checkins"), where("memberId", "==", memberId));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DailyCheckin));
      list.sort((a, b) => b.date.localeCompare(a.date));
      setCheckins(list);
    });
    return unsub;
  }, [memberId]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const activeStatuses = ['assigned', 'in_progress', 'editing'];

  const recentDays = useMemo(() => {
    const days: { date: Date; dateStr: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = subDays(new Date(), i);
      const today = startOfDay(new Date());
      const target = startOfDay(d);
      const diffMs = today.getTime() - target.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const label = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : `${diffDays} days ago`;
      days.push({ date: startOfDay(d), dateStr: format(d, "yyyy-MM-dd"), label });
    }
    return days;
  }, []);

  const filteredCheckins = useMemo(() => {
    if (checkinCalDate) {
      const dateStr = format(checkinCalDate, "yyyy-MM-dd");
      return checkins.filter((c) => c.date === dateStr);
    }
    if (checkinDayFilter === "all") return checkins;
    const dayIndex = parseInt(checkinDayFilter);
    const dayDateStr = recentDays[dayIndex]?.dateStr;
    if (dayIndex === 0) {
      // Today + pending from any date
      return checkins.filter((c) => c.date === dayDateStr || c.status === "pending_approval");
    }
    if (dayDateStr) return checkins.filter((c) => c.date === dayDateStr);
    return checkins.filter((c) => c.date === todayStr);
  }, [checkins, checkinDayFilter, checkinCalDate, todayStr, recentDays]);

  const filteredAssignments = useMemo(() => {
    let result = [...assignments];
    if (assignCalDate) {
      const dateStr = format(assignCalDate, "yyyy-MM-dd");
      return result.filter((a) => a.date === dateStr);
    }
    if (assignDayFilter === "all") return result;
    const dayIndex = parseInt(assignDayFilter);
    const dayDateStr = recentDays[dayIndex]?.dateStr;
    if (dayIndex === 0) {
      // Today + active from any date
      const todayTasks = result.filter((a) => a.date === dayDateStr);
      const activePast = result.filter((a) => a.date !== dayDateStr && activeStatuses.includes(a.status));
      return [...todayTasks, ...activePast];
    }
    if (dayDateStr) return result.filter((a) => a.date === dayDateStr);
    return result;
  }, [assignments, assignDayFilter, assignCalDate, recentDays, activeStatuses]);

  const approvedCount = checkins.filter((c) => c.status === "approved").length;
  const totalHours = checkins
    .filter((c) => c.status === "approved" && c.checkedInAt && c.checkedOutAt)
    .reduce((sum, c) => {
      const inTime = c.checkedInAt?.toDate?.()?.getTime?.() || 0;
      const outTime = c.checkedOutAt?.toDate?.()?.getTime?.() || 0;
      return sum + (outTime > inTime ? (outTime - inTime) / 3600000 : 0);
    }, 0);

  const handleApprove = async (ci: DailyCheckin) => {
    setApprovingId(ci.id);
    try {
      await updateDoc(doc(db, "daily_checkins", ci.id), {
        status: "approved",
        approvedBy: currentUser?.uid,
        approvedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "notifications"), {
        userId: ci.memberId,
        type: "approved",
        title: "Day Approved",
        message: `Your check-in for ${ci.date} has been approved.`,
        read: false,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Approved", description: `Check-in for ${ci.date} approved.` });
    } catch {
      toast({ title: "Error", description: "Failed to approve.", variant: "destructive" });
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (ci: DailyCheckin) => {
    const { confirmed, inputValue: note } = await confirm({ title: "Reject Check-In", description: "Provide a reason for rejection (optional).", confirmText: "Reject", variant: "destructive", withInput: true, inputPlaceholder: "Reason for rejection..." });
    if (!confirmed) return;
    setRejectingId(ci.id);
    try {
      await updateDoc(doc(db, "daily_checkins", ci.id), {
        status: "rejected",
        rejectionNote: note ?? "",
      });
      await addDoc(collection(db, "notifications"), {
        userId: ci.memberId,
        type: "rejected",
        title: "Day Rejected",
        message: `Your check-in for ${ci.date} was rejected.${note ? ` Reason: ${note}` : ""}`,
        read: false,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Rejected", description: `Check-in for ${ci.date} rejected.` });
    } catch {
      toast({ title: "Error", description: "Failed to reject.", variant: "destructive" });
    } finally {
      setRejectingId(null);
    }
  };

  const getAssignedStamp = (assignment: WorkAssignment) => {
    const ts = assignment.assignedAt as any;
    const assignedDate = ts?.toDate?.()
      || (typeof ts?.seconds === "number" ? new Date(ts.seconds * 1000) : undefined)
      || (assignment.assignedAtIso ? new Date(assignment.assignedAtIso) : undefined)
      || (assignment.date ? new Date(`${assignment.date}T00:00:00`) : undefined);
    if (!assignedDate || Number.isNaN(assignedDate.getTime())) return assignment.date || "—";
    return `${formatDate(assignedDate)} ${formatTime(assignedDate)}`;
  };

  const revenueStats = useMemo(() => {
    const verified = filteredAssignments.filter((a) => a.status === "verified");
    const totalRevenue = verified.reduce((sum, a) => sum + (a.totalPrice || 0), 0);
    const totalVideos = verified.length;
    const salary = member?.salary || 0;
    const revenueVsSalary = salary > 0 ? ((totalRevenue / salary) * 100) : 0;
    return { totalRevenue, totalVideos, salary, revenueVsSalary, verifiedCount: verified.length };
  }, [filteredAssignments, member?.salary]);

  const statusColor = (s: string) =>
    s === "verified" ? "bg-success/15 text-success"
    : s === "completed" ? "bg-info/15 text-info"
    : s === "in_progress" ? "bg-warning/15 text-warning"
    : s === "editing" ? "bg-orange-500/15 text-orange-500"
    : "bg-muted text-muted-foreground";

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
      {ConfirmDialog}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground truncate">{member?.name || "Member"}'s History</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-0.5 truncate">{assignments.length} assignments · {member?.email}</p>
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
            <p className="text-[8px] md:text-xs text-muted-foreground mb-0.5 md:mb-1">Verified</p>
            <p className="font-display font-bold text-xs md:text-lg text-success">{revenueStats.verifiedCount}</p>
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

      {/* Attendance Summary */}
      <div className="grid grid-cols-2 gap-2 md:gap-3">
        <div className="bg-card border border-border rounded-xl p-2.5 md:p-3 text-center">
          <p className="text-[10px] md:text-xs text-muted-foreground">Approved Days</p>
          <p className="font-display font-bold text-lg md:text-xl text-success">{approvedCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-2.5 md:p-3 text-center">
          <p className="text-[10px] md:text-xs text-muted-foreground">Total Hours</p>
          <p className="font-display font-bold text-lg md:text-xl text-foreground">{totalHours.toFixed(1)}h</p>
        </div>
      </div>

      {/* Check-In Records (Collapsible) */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowCheckins(!showCheckins)}
          className="w-full p-3 md:p-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
        >
          <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Calendar size={16} className="text-primary" /> Check-In Records
            <span className="text-xs font-normal text-muted-foreground">({checkins.length})</span>
            {checkins.filter(c => c.status === "pending_approval").length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning font-medium">
                {checkins.filter(c => c.status === "pending_approval").length} pending
              </span>
            )}
          </h3>
          <ChevronDown size={16} className={`text-muted-foreground transition-transform ${showCheckins ? "rotate-180" : ""}`} />
        </button>

        {showCheckins && (
          <>
            <div className="px-3 md:px-4 pb-2 flex items-center gap-2 flex-wrap border-t border-border pt-3">
              {!checkinCalDate && (
                <select value={checkinDayFilter} onChange={(e) => setCheckinDayFilter(e.target.value)}
                  className="border rounded-lg px-2 md:px-3 py-2 text-xs md:text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
                  {recentDays.map((d, i) => (
                    <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, "dd/MM")})</option>
                  ))}
                  <option value="all">All Days</option>
                </select>
              )}
              <DashboardDayPicker selectedDate={checkinCalDate} onSelect={(d) => { setCheckinCalDate(d); if (d) setCheckinDayFilter("0"); }} />
              {checkinCalDate && (
                <button onClick={() => setCheckinCalDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
              )}
            </div>

            <div className="p-3 md:p-4 space-y-3">
              {filteredCheckins.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No check-in records for this period.</p>
              ) : (
                filteredCheckins.map((ci) => {
                  const inTime = ci.checkedInAt?.toDate?.() ? format(ci.checkedInAt.toDate(), "hh:mm a") : "—";
                  const outTime = ci.checkedOutAt?.toDate?.() ? format(ci.checkedOutAt.toDate(), "hh:mm a") : null;
                  const inMs = ci.checkedInAt?.toDate?.()?.getTime?.() || 0;
                  const outMs = ci.checkedOutAt?.toDate?.()?.getTime?.() || 0;
                  const hours = outMs > inMs ? ((outMs - inMs) / 3600000).toFixed(1) : null;

                  const statusBadge = ci.status === "approved"
                    ? "bg-success/15 text-success"
                    : ci.status === "rejected"
                    ? "bg-destructive/15 text-destructive"
                    : ci.status === "pending_approval"
                    ? "bg-warning/15 text-warning"
                    : "bg-info/15 text-info";

                  const statusLabel = ci.status === "pending_approval" ? "Pending" : ci.status === "checked_in" ? "Working" : ci.status;

                  return (
                    <div key={ci.id} className="bg-background border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-foreground">{ci.date}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${statusBadge}`}>{statusLabel}</span>
                        </div>
                        {ci.status === "pending_approval" && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleApprove(ci)}
                              disabled={approvingId === ci.id}
                              className="h-7 px-3 rounded-lg bg-success text-success-foreground text-[10px] font-semibold hover:bg-success/90 disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              {approvingId === ci.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />} Approve
                            </button>
                            <button
                              onClick={() => handleReject(ci)}
                              disabled={rejectingId === ci.id}
                              className="h-7 px-3 rounded-lg bg-destructive text-destructive-foreground text-[10px] font-semibold hover:bg-destructive/90 disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              {rejectingId === ci.id ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />} Reject
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        <span>In: <span className="text-foreground">{inTime}</span></span>
                        {outTime && <span>Out: <span className="text-foreground">{outTime}</span></span>}
                        {hours && <span><Clock size={10} className="inline" /> <span className="text-foreground">{hours}h</span></span>}
                        {ci.totalVideos != null && <span><Video size={10} className="inline" /> <span className="text-foreground">{ci.totalVideos} videos</span></span>}
                        {ci.aiVerificationResult && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            ci.aiVerificationResult === "pass" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                          }`}>AI: {ci.aiVerificationResult} ({ci.aiVideoCount})</span>
                        )}
                      </div>

                      {ci.summary && <p className="text-xs text-foreground">{ci.summary}</p>}
                      {ci.rejectionNote && <p className="text-xs text-destructive">Rejection: {ci.rejectionNote}</p>}

                      <div className="flex items-center gap-3">
                        {ci.driveFolderUrl && (
                          <a href={ci.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline inline-flex items-center gap-1">
                            <ExternalLink size={10} /> Drive Folder
                          </a>
                        )}
                        {ci.screenshotUrl && (
                          <button onClick={() => setViewScreenshot(ci.screenshotUrl!)}
                            className="text-[10px] text-primary hover:underline inline-flex items-center gap-1">
                            <Image size={10} /> Screenshot
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Screenshot Viewer Modal */}
      {viewScreenshot && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewScreenshot(null)}>
          <div className="max-w-2xl max-h-[80vh] overflow-auto">
            <img src={viewScreenshot} alt="Screenshot" className="rounded-xl border border-border" />
          </div>
        </div>
      )}

      {/* Assignments Section */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 md:p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
            <FileText size={16} className="text-primary" /> Work Assignments
          </h3>
          <div className="flex items-center gap-2">
            {!assignCalDate && (
              <select value={assignDayFilter} onChange={(e) => setAssignDayFilter(e.target.value)}
                className="border rounded-lg px-2 md:px-3 py-2 text-xs md:text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
                {recentDays.map((d, i) => (
                  <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, "dd/MM")})</option>
                ))}
                <option value="all">All Days</option>
              </select>
            )}
            <DashboardDayPicker selectedDate={assignCalDate} onSelect={(d) => { setAssignCalDate(d); if (d) setAssignDayFilter("0"); }} />
            {assignCalDate && (
              <button onClick={() => setAssignCalDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="p-3 md:p-4 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 border-b border-border">
          {[
            { label: "Total", value: filteredAssignments.length },
            { label: "Verified", value: filteredAssignments.filter((a) => a.status === "verified").length },
            { label: "Completed", value: filteredAssignments.filter((a) => a.status === "completed").length },
            { label: "In Progress", value: filteredAssignments.filter((a) => a.status === "in_progress" || a.status === "assigned").length },
          ].map((stat) => (
            <div key={stat.label} className="bg-background border border-border rounded-lg p-2 md:p-2.5 text-center">
              <p className="text-[10px] md:text-xs text-muted-foreground">{stat.label}</p>
              <p className="font-display font-bold text-lg md:text-xl text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="p-3 md:p-4 space-y-3">
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-6">
              <FileText size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No assignments found for this period.</p>
            </div>
          ) : (
            filteredAssignments.map((a) => (
              <div key={a.id} className="bg-background border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    <span className="font-mono text-sm text-foreground font-medium">{a.date}</span>
                    <span className="font-mono text-sm text-foreground font-medium">Assigned: {getAssignedStamp(a)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor(a.status)}`}>{a.status}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-accent text-muted-foreground capitalize">{a.category}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <span className="text-muted-foreground">{a.businessName || a.displayTitle}</span>
                  <span className="text-muted-foreground">Clips: <span className="text-foreground font-medium">{a.clipCount}</span></span>
                  <span className="text-muted-foreground">Duration: <span className="text-foreground font-medium">{a.duration}</span></span>
                  <span className="text-muted-foreground">Revenue: <span className="text-primary font-bold">{formatCurrency(a.totalPrice)}</span></span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
