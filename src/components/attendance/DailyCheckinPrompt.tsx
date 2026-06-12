import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { getTodayWorkStats, performCheckIn } from "@/utils/attendance";
import type { WorkAssignment } from "@/types";
import { LogIn, Loader2, Sun, X } from "lucide-react";

/**
 * Shown automatically to tech members on the first website open of each day.
 * Checking in records attendance and opens WhatsApp with the prefilled
 * attendance + work-status message for the admin.
 */
export default function DailyCheckinPrompt() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const dismissKey = user ? `dts_checkin_prompt_${user.uid}_${todayStr}` : "";

  const [hasCheckin, setHasCheckin] = useState<boolean | null>(null);
  const [assignments, setAssignments] = useState<WorkAssignment[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDismissed(Boolean(localStorage.getItem(dismissKey)));

    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(
      query(collection(db, "daily_checkins"), where("memberId", "==", user.uid), where("date", "==", todayStr)),
      (snap) => setHasCheckin(!snap.empty)
    ));
    unsubs.push(onSnapshot(
      query(collection(db, "work_assignments"), where("assignedTo", "==", user.uid)),
      (snap) => setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment)))
    ));
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, todayStr, dismissKey]);

  const stats = useMemo(() => getTodayWorkStats(assignments || [], todayStr), [assignments, todayStr]);

  if (!user || user.role !== "tech_member") return null;
  const show = hasCheckin === false && assignments !== null && !dismissed;

  const handleLater = () => {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  const handleCheckIn = async () => {
    if (!user || checkingIn) return;
    setCheckingIn(true);
    try {
      const waUrl = await performCheckIn(user, assignments || []);
      toast({ title: "Checked In!", description: "Attendance recorded. Opening WhatsApp..." });
      await new Promise((r) => setTimeout(r, 1500));
      window.open(waUrl, "_blank");
    } catch {
      toast({ title: "Error", description: "Failed to check in.", variant: "destructive" });
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            className="bg-card border border-border rounded-xl w-full max-w-sm p-5 space-y-4 relative"
          >
            <button onClick={handleLater} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors">
              <X size={16} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                <Sun size={20} />
              </div>
              <div>
                <h3 className="font-display font-bold text-foreground">Good day, {user.name}!</h3>
                <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, dd MMM yyyy")} · Mark your attendance</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-warning/10 rounded-lg p-2 text-center">
                <p className="font-display font-bold text-warning text-lg">{stats.inProgress}</p>
                <p className="text-[10px] text-muted-foreground">In Progress</p>
              </div>
              <div className="bg-info/10 rounded-lg p-2 text-center">
                <p className="font-display font-bold text-info text-lg">{stats.pending}</p>
                <p className="text-[10px] text-muted-foreground">Pending</p>
              </div>
              <div className="bg-success/10 rounded-lg p-2 text-center">
                <p className="font-display font-bold text-success text-lg">{stats.completedToday}</p>
                <p className="text-[10px] text-muted-foreground">Done Today</p>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Checking in records your attendance and sends your work status to the admin on WhatsApp.
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleLater}
                className="flex-1 h-10 rounded-lg bg-accent text-foreground text-sm font-medium border border-border"
              >
                Later
              </button>
              <button
                onClick={handleCheckIn}
                disabled={checkingIn}
                className="flex-[2] h-10 rounded-lg bg-success text-success-foreground text-sm font-semibold hover:bg-success/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {checkingIn ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                {checkingIn ? "Checking In..." : "Check In Now"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
