import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DailyCheckin, WorkAssignment } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, LogIn, LogOut, Loader2, Undo2, Sparkles, Sun, Sunrise, Moon,
  Video, ClipboardCheck, ShieldCheck, ShieldAlert, TimerReset,
} from "lucide-react";
import { performCheckIn } from "@/utils/attendance";
import CheckoutModal from "@/components/attendance/CheckoutModal";
import MyDayCalendar from "@/components/attendance/MyDayCalendar";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import {
  ATTENDANCE_META, AttendanceStatus, Holiday, attendanceKey, resolveStatus,
  todayDate, todayMonth, watchCheckedInDays, watchHolidays, watchOverrides,
} from "@/services/techAttendance";

/** Live ticking elapsed-time string between two instants, formatted HH:MM:SS. */
const useElapsed = (since: Date | null): string => {
  const [, force] = useState(0);
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [since]);
  if (!since) return "00:00:00";
  const diff = Math.max(0, Date.now() - since.getTime());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
};

const greeting = (hour: number) => {
  if (hour < 12) return { text: "Good morning", Icon: Sunrise };
  if (hour < 17) return { text: "Good afternoon", Icon: Sun };
  return { text: "Good evening", Icon: Moon };
};

export default function TechMemberDashboard() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [todayCheckin, setTodayCheckin] = useState<DailyCheckin | null>(null);
  // Not rendered on this attendance-only dashboard — kept only so Check-In can report
  // accurate pending/in-progress task counts in its WhatsApp message (see performCheckIn).
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [now, setNow] = useState(new Date());

  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Map<string, Holiday>>(new Map());
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());

  const todayStr = todayDate();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      onSnapshot(
        query(collection(db, "daily_checkins"), where("memberId", "==", user.uid), where("date", "==", todayStr)),
        (snap) => {
          setTodayCheckin(!snap.empty ? ({ id: snap.docs[0].id, ...snap.docs[0].data() } as DailyCheckin) : null);
          setLoading(false);
        }
      ),
      onSnapshot(
        query(collection(db, "work_assignments"), where("assignedTo", "==", user.uid)),
        (snap) => setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment)))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user, todayStr]);

  useEffect(() => {
    const month = todayMonth();
    const unsubs = [
      watchOverrides(month, setOverrides),
      watchHolidays(month, setHolidays),
      watchCheckedInDays(month, setCheckedIn),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const todayAttendance = useMemo(() => {
    if (!user) return null;
    return resolveStatus({
      override: overrides.get(attendanceKey(user.uid, todayStr)),
      checkedIn: checkedIn.has(attendanceKey(user.uid, todayStr)) || !!todayCheckin,
      dateStr: todayStr,
      hasFestivalHoliday: holidays.has(todayStr),
      todayStr,
    });
  }, [user, overrides, checkedIn, holidays, todayCheckin, todayStr]);

  const { text: greetText, Icon: GreetIcon } = greeting(now.getHours());

  const checkedInAt = todayCheckin?.checkedInAt?.toDate?.() || null;
  const checkedOutAt = todayCheckin?.checkedOutAt?.toDate?.() || null;
  const elapsed = useElapsed(todayCheckin && !checkedOutAt ? checkedInAt : null);

  const handleCheckIn = async () => {
    if (!user) return;
    setCheckingIn(true);
    try {
      const waUrl = await performCheckIn(user, assignments);
      toast({ title: "Checked In!", description: "Opening WhatsApp..." });
      await new Promise((r) => setTimeout(r, 1500));
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
        checkedOutAt: null, status: "checked_in", summary: null, totalVideos: null,
        driveFolderUrl: null, screenshotUrl: null, completedTodayAuto: null,
        pendingTasks: null, inProgressTasks: null, aiVideoCount: null, aiConfidence: null,
        aiNotes: null, aiVerificationResult: null,
      });
      toast({ title: "Checkout reverted", description: "You are back to checked-in state." });
    } catch {
      toast({ title: "Error", description: "Failed to revert checkout.", variant: "destructive" });
    }
  };

  if (loading || !user) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-56 bg-muted rounded-2xl animate-pulse" />
        <div className="h-96 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  const phase: "pre" | "in" | "out" = !todayCheckin ? "pre" : !checkedOutAt ? "in" : "out";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {ConfirmDialog}

      {/* Greeting header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-muted-foreground text-xs flex items-center gap-1.5 mb-0.5">
            <GreetIcon size={13} /> {greetText}
          </p>
          <h1 className="font-display text-2xl font-bold text-foreground">{user.name}</h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-foreground tabular-nums">{format(now, "hh:mm:ss a")}</p>
          <p className="text-xs text-muted-foreground">{format(now, "EEEE, dd MMMM yyyy")}</p>
        </div>
      </div>

      {/* Hero attendance card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-border shadow-lg"
      >
        <div className={cnPhase(phase)} />
        <div className="relative p-6 sm:p-7">
          <AnimatePresence mode="wait">
            {phase === "pre" && (
              <motion.div key="pre" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col sm:flex-row items-center sm:items-center justify-between gap-5 text-center sm:text-left">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 bg-white/10 px-2.5 py-1 rounded-full mb-3">
                    <Sparkles size={12} /> Ready when you are
                  </div>
                  <h2 className="text-2xl font-display font-bold text-white">You haven't checked in yet</h2>
                  <p className="text-white/70 text-sm mt-1">Mark your attendance to start today's work day.</p>
                </div>
                <button onClick={handleCheckIn} disabled={checkingIn}
                  className="h-14 px-8 rounded-xl bg-white text-emerald-700 font-display font-bold text-base hover:bg-white/90 disabled:opacity-60 transition-all shadow-xl shadow-black/10 inline-flex items-center gap-2 shrink-0 active:scale-95">
                  {checkingIn ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                  {checkingIn ? "Checking in…" : "Check In Now"}
                </button>
              </motion.div>
            )}

            {phase === "in" && (
              <motion.div key="in" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" /> Checked In · {checkedInAt ? format(checkedInAt, "hh:mm a") : "—"}
                  </div>
                  <button onClick={handleUndoCheckIn}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-white/70 hover:text-white transition-colors">
                    <Undo2 size={11} /> Undo check-in
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-5">
                  <div>
                    <p className="text-white/70 text-xs mb-1">Time on the clock today</p>
                    <p className="font-mono text-4xl sm:text-5xl font-bold text-white tabular-nums tracking-tight">{elapsed}</p>
                  </div>
                  <button onClick={() => setShowCheckout(true)}
                    className="h-14 px-8 rounded-xl bg-white text-blue-700 font-display font-bold text-base hover:bg-white/90 transition-all shadow-xl shadow-black/10 inline-flex items-center gap-2 shrink-0 active:scale-95">
                    <LogOut size={18} /> Check Out
                  </button>
                </div>
              </motion.div>
            )}

            {phase === "out" && (
              <motion.div key="out" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 px-2.5 py-1 rounded-full">
                    <CheckCircle2 size={13} /> Day complete
                  </div>
                  {todayCheckin?.status !== "approved" && (
                    <button onClick={handleRevertCheckout}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-white/70 hover:text-white transition-colors">
                      <TimerReset size={11} /> Revert checkout
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatChip icon={LogIn} label="Check-in" value={checkedInAt ? format(checkedInAt, "hh:mm a") : "—"} />
                  <StatChip icon={LogOut} label="Check-out" value={checkedOutAt ? format(checkedOutAt, "hh:mm a") : "—"} />
                  <StatChip icon={Video} label="Videos" value={String(todayCheckin?.totalVideos ?? 0)} />
                  <StatChip
                    icon={todayCheckin?.status === "approved" ? ShieldCheck : todayCheckin?.status === "rejected" ? ShieldAlert : ClipboardCheck}
                    label="Day report"
                    value={todayCheckin?.status === "pending_approval" ? "Pending" : todayCheckin?.status === "approved" ? "Approved" : todayCheckin?.status === "rejected" ? "Rejected" : "Submitted"}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Today's official attendance status */}
      {todayAttendance && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-sm text-muted-foreground">Today's official attendance status</span>
          <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border", ATTENDANCE_META[todayAttendance].tone)}>
            {ATTENDANCE_META[todayAttendance].label}
          </span>
        </motion.div>
      )}

      {/* Check-Out Modal */}
      {showCheckout && user && todayCheckin && (
        <CheckoutModal user={user} todayCheckin={todayCheckin} assignments={assignments} onClose={() => setShowCheckout(false)} />
      )}

      {/* Full attendance history & calendar */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <MyDayCalendar memberId={user.uid} />
      </motion.div>
    </div>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-white/70 text-[10px] mb-1"><Icon size={11} /> {label}</div>
      <div className="text-white font-semibold text-sm truncate">{value}</div>
    </div>
  );
}

function cnPhase(phase: "pre" | "in" | "out"): string {
  const base = "absolute inset-0 bg-gradient-to-br";
  if (phase === "pre") return `${base} from-emerald-500 via-emerald-600 to-teal-700`;
  if (phase === "in") return `${base} from-blue-500 via-blue-600 to-indigo-700`;
  return `${base} from-slate-600 via-slate-700 to-slate-800`;
}
