import { useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { useToast } from "@/hooks/use-toast";
import { getTodayWorkStats, buildAutoSummary, buildCheckoutMessage, ADMIN_WHATSAPP } from "@/utils/attendance";
import { getWhatsAppUrl } from "@/utils/phone";
import type { AppUser, DailyCheckin, WorkAssignment } from "@/types";
import { Clock, LogOut, Loader2, User, Video } from "lucide-react";

interface CheckoutModalProps {
  user: AppUser;
  todayCheckin: DailyCheckin;
  assignments: WorkAssignment[];
  onClose: () => void;
}

export default function CheckoutModal({ user, todayCheckin, assignments, onClose }: CheckoutModalProps) {
  const { toast } = useToast();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const stats = useMemo(() => getTodayWorkStats(assignments, todayStr), [assignments, todayStr]);

  const [videosDone, setVideosDone] = useState<number>(stats.completedToday);
  const [pending, setPending] = useState<number>(stats.pending);
  const [submitting, setSubmitting] = useState(false);

  const checkInTime = todayCheckin.checkedInAt?.toDate?.() ? format(todayCheckin.checkedInAt.toDate(), "hh:mm a") : "—";

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Auto-built, human-readable summary stored on the record + sent to WhatsApp
      const reportStats = { ...stats, completedToday: videosDone, pending };
      const summary = buildAutoSummary(reportStats);

      await updateDoc(doc(db, "daily_checkins", todayCheckin.id), {
        checkedOutAt: serverTimestamp(),
        status: "pending_approval",
        memberName: user.name,
        summary,
        totalVideos: videosDone,
        completedTodayAuto: stats.completedToday,
        pendingTasks: pending,
        inProgressTasks: stats.inProgress,
      });

      await sendNotification({
        userId: user.createdBy,
        type: "check_out",
        title: "Work Submitted for Approval",
        message: `${user.name} checked out — ${videosDone} videos done, ${pending} pending. Tap to review & approve.`,
        link: `/tech-admin/team/${user.uid}`,
      });

      const checkOutTime = format(new Date(), "hh:mm a");
      const inMs = todayCheckin.checkedInAt?.toDate?.()?.getTime?.() || 0;
      const hoursWorked = inMs ? ((Date.now() - inMs) / 3600000).toFixed(1) : "";
      const waUrl = getWhatsAppUrl(ADMIN_WHATSAPP, buildCheckoutMessage({
        name: user.name,
        dateStr: todayStr,
        checkInTime,
        checkOutTime,
        hoursWorked,
        totalVideos: videosDone,
        stats: reportStats,
        summary,
        driveFolderUrl: "",
      }));

      toast({ title: "Checked Out!", description: "Day report saved. Opening WhatsApp..." });
      onClose();
      await new Promise((r) => setTimeout(r, 1500));
      window.open(waUrl, "_blank");
    } catch {
      toast({ title: "Error", description: "Failed to check out.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => !submitting && onClose()}>
      <div className="bg-card border border-border rounded-xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-display font-bold text-foreground text-lg">Check Out</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Confirm your work for today & submit.</p>
        </div>

        {/* Name + check-in (read-only) */}
        <div className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2.5 text-xs">
          <span className="flex items-center gap-1.5 text-foreground font-medium"><User size={13} className="text-primary" /> {user.name}</span>
          <span className="flex items-center gap-1 text-muted-foreground"><Clock size={11} /> In at {checkInTime}</span>
        </div>

        {/* Editable fields */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Number of Videos Done Today</label>
            <input
              type="number"
              min={0}
              value={videosDone}
              onChange={(e) => setVideosDone(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full h-11 rounded-lg border border-border bg-background px-3 text-base text-foreground focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Number of Pending Videos</label>
            <input
              type="number"
              min={0}
              value={pending}
              onChange={(e) => setPending(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full h-11 rounded-lg border border-border bg-background px-3 text-base text-foreground focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          {stats.inProgress > 0 && (
            <p className="text-[11px] text-muted-foreground">{stats.inProgress} task{stats.inProgress === 1 ? "" : "s"} currently in progress (auto-tracked).</p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 h-10 rounded-lg bg-accent text-foreground text-sm font-medium border border-border"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            {submitting ? "Submitting..." : "Submit & Check Out"}
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
          <Video size={10} /> Report goes to admin on website + WhatsApp
        </p>
      </div>
    </div>
  );
}
