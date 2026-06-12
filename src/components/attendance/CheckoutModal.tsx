import { useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { useToast } from "@/hooks/use-toast";
import { getTodayWorkStats, buildCheckoutMessage, formatDurationBetween, ADMIN_WHATSAPP } from "@/utils/attendance";
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

  // Everything except the note is fetched automatically — only the note is editable.
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const inMs = todayCheckin.checkedInAt?.toDate?.()?.getTime?.() || 0;
  const checkInTime = inMs ? format(todayCheckin.checkedInAt.toDate(), "hh:mm a") : "—";

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const checkOutTime = format(new Date(), "hh:mm a");
      const totalDuration = formatDurationBetween(inMs, Date.now());

      await updateDoc(doc(db, "daily_checkins", todayCheckin.id), {
        checkedOutAt: serverTimestamp(),
        status: "pending_approval",
        memberName: user.name,
        summary: note.trim() || null,
        totalVideos: stats.completedToday,
        completedTodayAuto: stats.completedToday,
        pendingTasks: stats.pending,
        inProgressTasks: stats.inProgress,
      });

      await sendNotification({
        userId: user.createdBy,
        type: "check_out",
        title: "Work Submitted for Approval",
        message: `${user.name} checked out — ${stats.completedToday} videos done, ${stats.pending} pending. Tap to review & approve.`,
        link: `/tech-admin/team/${user.uid}`,
      });

      const waUrl = getWhatsAppUrl(ADMIN_WHATSAPP, buildCheckoutMessage({
        name: user.name,
        dateStr: todayStr,
        checkInTime,
        checkOutTime,
        totalDuration,
        totalVideos: stats.completedToday,
        stats,
        note: note.trim(),
      }));

      toast({ title: "Checked Out!", description: "Today's report saved. Opening WhatsApp..." });
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
          <h3 className="font-display font-bold text-foreground text-lg">Today Work Report</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Auto-filled from your work. Add a note & check out.</p>
        </div>

        {/* Name + check-in (read-only, fetched) */}
        <div className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2.5 text-xs">
          <span className="flex items-center gap-1.5 text-foreground font-medium"><User size={13} className="text-primary" /> {user.name}</span>
          <span className="flex items-center gap-1 text-muted-foreground"><Clock size={11} /> In at {checkInTime}</span>
        </div>

        {/* Auto stats (read-only) */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-success/10 rounded-lg p-2 text-center">
            <p className="font-display font-bold text-success text-lg">{stats.completedToday}</p>
            <p className="text-[10px] text-muted-foreground">Videos Done</p>
          </div>
          <div className="bg-warning/10 rounded-lg p-2 text-center">
            <p className="font-display font-bold text-warning text-lg">{stats.inProgress}</p>
            <p className="text-[10px] text-muted-foreground">In Progress</p>
          </div>
          <div className="bg-info/10 rounded-lg p-2 text-center">
            <p className="font-display font-bold text-info text-lg">{stats.pending}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </div>
        </div>

        {/* Only editable field: Note */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Note <span className="text-muted-foreground/60">(optional)</span></label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything to add for the admin about today's work?"
            className="w-full h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:ring-1 focus:ring-primary outline-none"
          />
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
