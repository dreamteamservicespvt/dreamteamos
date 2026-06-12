import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { format } from "date-fns";
import type { WorkAssignment, DailyCheckin } from "@/types";
import { motion } from "framer-motion";
import { CheckCircle, Clock, Video, Briefcase, Play, Edit3, AlertCircle, LogIn, LogOut, Loader2, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { performCheckIn } from "@/utils/attendance";
import CheckoutModal from "@/components/attendance/CheckoutModal";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";

export default function TechMemberDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [todayCheckin, setTodayCheckin] = useState<DailyCheckin | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "work_assignments"), where("assignedTo", "==", user.uid)),
      (snap) => {
        setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment)));
        setLoading(false);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "daily_checkins"), where("memberId", "==", user.uid), where("date", "==", todayStr)),
      (snap) => {
        if (!snap.empty) {
          setTodayCheckin({ id: snap.docs[0].id, ...snap.docs[0].data() } as DailyCheckin);
        } else {
          setTodayCheckin(null);
        }
      }
    ));

    return () => unsubs.forEach((u) => u());
  }, [user, todayStr]);

  const handleCheckIn = async () => {
    if (!user) return;
    setCheckingIn(true);
    try {
      const waUrl = await performCheckIn(user, assignments);
      toast({ title: "Checked In!", description: "Opening WhatsApp..." });
      await new Promise((r) => setTimeout(r, 2000));
      window.open(waUrl, "_blank");
    } catch {
      toast({ title: "Error", description: "Failed to check in.", variant: "destructive" });
    } finally {
      setCheckingIn(false);
    }
  };

  const handleUndoCheckIn = async () => {
    if (!todayCheckin || todayCheckin.checkedOutAt) return;
    const { confirmed } = await confirm({ title: "Undo Check-In", description: "Are you sure you want to undo your check-in?", confirmText: "Undo", variant: "destructive" });
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "daily_checkins", todayCheckin.id));
      toast({ title: "Check-in undone", description: "Your check-in has been removed." });
    } catch {
      toast({ title: "Error", description: "Failed to undo check-in.", variant: "destructive" });
    }
  };

  const handleRevertCheckout = async () => {
    if (!todayCheckin || !todayCheckin.checkedOutAt || todayCheckin.status === "approved") return;
    const { confirmed } = await confirm({ title: "Revert Checkout", description: "Revert your checkout? This will bring you back to checked-in state.", confirmText: "Revert", variant: "destructive" });
    if (!confirmed) return;
    try {
      await updateDoc(doc(db, "daily_checkins", todayCheckin.id), {
        checkedOutAt: null,
        status: "checked_in",
        summary: null,
        totalVideos: null,
        driveFolderUrl: null,
        screenshotUrl: null,
        completedTodayAuto: null,
        pendingTasks: null,
        inProgressTasks: null,
        aiVideoCount: null,
        aiConfidence: null,
        aiNotes: null,
        aiVerificationResult: null,
      });
      toast({ title: "Checkout reverted", description: "You are back to checked-in state." });
    } catch {
      toast({ title: "Error", description: "Failed to revert checkout.", variant: "destructive" });
    }
  };

  // Today's assigned tasks + unfinished past tasks
  const activeTasks = assignments.filter(a =>
    ['assigned', 'in_progress', 'editing'].includes(a.status)
  );
  const todayTasks = activeTasks.filter(a => a.date === todayStr);
  const unfinishedPast = activeTasks.filter(a => a.date !== todayStr);

  const verified = assignments.filter(a => a.status === "verified");
  const completed = assignments.filter(a => a.status === "completed");
  const totalVideos = verified.length;
  const stats = [
    { label: "Total Assigned", value: assignments.length, icon: Briefcase, color: "text-info" },
    { label: "Videos Done", value: totalVideos, icon: Video, color: "text-primary" },
    { label: "Verified", value: verified.length, icon: CheckCircle, color: "text-success" },
    { label: "Completed", value: completed.length, icon: Clock, color: "text-warning" },
  ];

  const taskStatusConfig: Record<string, { icon: typeof Play; label: string; color: string }> = {
    assigned: { icon: Play, label: 'New', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    in_progress: { icon: Clock, label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    editing: { icon: Edit3, label: 'Needs Edit', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ConfirmDialog}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Welcome back, {user?.name}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.08 } }}
            className="bg-card border border-border rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} className={s.color} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-display font-bold text-xl text-foreground">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Daily Attendance */}
      <div className="bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            {todayCheckin ? <LogOut size={14} className="text-primary" /> : <LogIn size={14} className="text-success" />}
            Daily Attendance
          </h2>
          <span className="text-[10px] text-muted-foreground font-mono">{todayStr}</span>
        </div>

        {!todayCheckin ? (
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground">You haven't checked in yet.</p>
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              className="h-8 px-4 rounded-lg bg-success text-success-foreground font-semibold text-xs hover:bg-success/90 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
            >
              {checkingIn ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
              Check In
            </button>
          </div>
        ) : !todayCheckin.checkedOutAt ? (
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium text-[10px]">In</span>
              <span className="text-muted-foreground">
                {todayCheckin.checkedInAt?.toDate?.() ? format(todayCheckin.checkedInAt.toDate(), "hh:mm a") : "—"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowCheckout(true)}
                className="h-8 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
              >
                <LogOut size={12} /> Check Out
              </button>
              <button
                onClick={handleUndoCheckIn}
                className="h-8 px-3 rounded-lg border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors inline-flex items-center gap-1"
              >
                <Undo2 size={12} /> Undo
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium text-[10px]">In</span>
              <span className="text-muted-foreground">{todayCheckin.checkedInAt?.toDate?.() ? format(todayCheckin.checkedInAt.toDate(), "hh:mm a") : "—"}</span>
              <span className="text-muted-foreground">→</span>
              <span className="px-1.5 py-0.5 rounded-full bg-info/15 text-info font-medium text-[10px]">Out</span>
              <span className="text-muted-foreground">{todayCheckin.checkedOutAt?.toDate?.() ? format(todayCheckin.checkedOutAt.toDate(), "hh:mm a") : "—"}</span>
              <span className="text-muted-foreground">· {todayCheckin.totalVideos} videos</span>
              {todayCheckin.status === "pending_approval" && (
                <span className="px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium text-[10px]">Pending Approval</span>
              )}
              {todayCheckin.status === "approved" && (
                <span className="px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium text-[10px]">Approved</span>
              )}
              {todayCheckin.status === "rejected" && (
                <span className="px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium text-[10px]">Rejected</span>
              )}
              {todayCheckin.aiVerificationResult && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  todayCheckin.aiVerificationResult === "pass" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                }`}>AI: {todayCheckin.aiVerificationResult}</span>
              )}
            </div>
            {todayCheckin.status !== "approved" && (
              <button
                onClick={handleRevertCheckout}
                className="h-7 px-3 rounded-lg border border-destructive/30 text-destructive text-[10px] font-medium hover:bg-destructive/10 transition-colors inline-flex items-center gap-1 shrink-0 ml-2"
              >
                <Undo2 size={10} /> Revert
              </button>
            )}
          </div>
        )}
      </div>

      {/* Check-Out Modal */}
      {showCheckout && user && todayCheckin && (
        <CheckoutModal
          user={user}
          todayCheckin={todayCheckin}
          assignments={assignments}
          onClose={() => setShowCheckout(false)}
        />
      )}

      {/* Active Work Section */}
      {activeTasks.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase size={16} className="text-primary" />
              <h2 className="font-display font-semibold text-foreground">Active Work</h2>
              <span className="text-xs text-muted-foreground">({activeTasks.length} tasks)</span>
            </div>
            <button onClick={() => navigate('/tech/my-work')} className="text-xs text-primary hover:underline">View All</button>
          </div>
          <div className="p-4 space-y-3">
            {todayTasks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Today's Tasks</p>
                {todayTasks.map(a => {
                  const cfg = taskStatusConfig[a.status];
                  return (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 mb-2 last:mb-0">
                      <div className="flex items-center space-x-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg?.color}`}>{cfg?.label}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.businessName || a.displayTitle}</p>
                          <p className="text-xs text-muted-foreground capitalize">{a.category} · {a.clipCount} clips + EC · {a.duration} · Code: <span className="font-mono">{a.accessCode}</span></p>
                        </div>
                      </div>
                      <button onClick={() => navigate('/tech/my-work')} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">Open</button>
                    </div>
                  );
                })}
              </div>
            )}
            {unfinishedPast.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <AlertCircle size={12} /> Previous Unfinished Tasks
                </p>
                {unfinishedPast.map(a => {
                  const cfg = taskStatusConfig[a.status];
                  return (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/10 mb-2 last:mb-0">
                      <div className="flex items-center space-x-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg?.color}`}>{cfg?.label}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.businessName || a.displayTitle}</p>
                          <p className="text-xs text-muted-foreground capitalize">{a.category} · {a.clipCount} clips + EC · {a.duration} · From: {a.date} · Code: <span className="font-mono">{a.accessCode}</span></p>
                        </div>
                      </div>
                      <button onClick={() => navigate('/tech/my-work')} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">Open</button>
                    </div>
                  );
                })}
              </div>
            )}
            {activeTasks.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No active tasks. You're all caught up!</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
