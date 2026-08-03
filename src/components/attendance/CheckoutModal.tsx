import { useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { useToast } from "@/hooks/use-toast";
import { getTodayWorkStats, buildCheckoutMessage, ADMIN_WHATSAPP } from "@/utils/attendance";
import { getWhatsAppUrl } from "@/utils/phone";
import { driveFolderPath } from "@/utils/driveUpload";
import type { AppUser, DailyCheckin, WorkAssignment } from "@/types";
import {
  AlertTriangle, ArrowRight, Clock, LogOut, Loader2, User, Video, UploadCloud, ExternalLink,
} from "lucide-react";

interface CheckoutModalProps {
  user: AppUser;
  todayCheckin: DailyCheckin;
  assignments: WorkAssignment[];
  onClose: () => void;
}

/**
 * Check-out, in the order the day actually ends: upload the work, then report it.
 *
 * The upload used to come *after* check-out, as a reminder that could be dismissed with "I'll
 * upload it" — which meant the day was already closed and approved before anyone found out the
 * work was not there. Since unuploaded work does not count for the day, that ordering told people
 * the opposite of the rule it was trying to enforce.
 *
 * It is a declaration rather than a verified upload: the app cannot see inside somebody's Drive,
 * and people legitimately upload from another device. What it does is make the claim explicit,
 * stamp it on the check-in, and put the folder structure in front of them at the moment they need
 * it — which is the difference between a rule everyone has read and a rule everyone follows.
 */
export default function CheckoutModal({ user, todayCheckin, assignments, onClose }: CheckoutModalProps) {
  const { toast } = useToast();
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const stats = useMemo(() => getTodayWorkStats(assignments, todayStr), [assignments, todayStr]);

  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  /** Upload first, then the report. Leaving is only possible from the last step. */
  const [step, setStep] = useState<"upload" | "form" | "done">("upload");
  const [confirmed, setConfirmed] = useState(false);
  const [waUrl, setWaUrl] = useState<string>("");

  const inMs = todayCheckin.checkedInAt?.toDate?.()?.getTime?.() || 0;
  const checkInTime = inMs ? format(todayCheckin.checkedInAt.toDate(), "hh:mm a") : "—";
  const path = driveFolderPath(user.name, now);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const checkOutTime = format(new Date(), "hh:mm a");

      await updateDoc(doc(db, "daily_checkins", todayCheckin.id), {
        checkedOutAt: serverTimestamp(),
        status: "pending_approval",
        memberName: user.name,
        summary: note.trim() || null,
        totalVideos: stats.completedToday,
        completedTodayAuto: stats.completedToday,
        pendingTasks: stats.pending,
        inProgressTasks: stats.inProgress,
        // The declaration, on the record. An admin reviewing the day can see it was made, and the
        // folder it was made about, without having to ask.
        workUploadedConfirmed: true,
        workUploadedAt: serverTimestamp(),
        workUploadedPath: path,
      });

      await sendNotification({
        userId: user.createdBy,
        type: "check_out",
        title: "Work Submitted for Approval",
        message: `${user.name} checked out — ${stats.completedToday} videos done, ${stats.pending} pending. Tap to review & approve.`,
        link: `/tech-admin/team/${user.uid}`,
        // One check-out is one notification. The button is already disabled while this runs, but a
        // fast double-tap can beat a state flag to the next paint; the key makes that harmless.
        dedupeKey: `check_out_${todayCheckin.id}`,
      });

      setWaUrl(getWhatsAppUrl(ADMIN_WHATSAPP, buildCheckoutMessage({
        name: user.name,
        dateStr: todayStr,
        checkInTime,
        checkOutTime,
        totalVideos: stats.completedToday,
        stats,
        note: note.trim(),
      })));

      toast({ title: "Checked out", description: "Today's report has been sent for approval." });
      setStep("done");
    } catch {
      toast({ title: "Error", description: "Failed to check out.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  /** Leave the flow: send the WhatsApp report to the admin (as before) and close. */
  const finish = () => {
    if (waUrl) window.open(waUrl, "_blank");
    onClose();
  };

  // ── Step 1 · Upload the day's work ──────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
        <div
          className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-5"
          onClick={(e) => e.stopPropagation()}
          data-test="checkout-upload-step"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <UploadCloud className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-foreground">Upload today's work first</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Check-out is how your work gets verified, backed up, and kept for future testimonials.
                Upload everything you made today before you finish.
              </p>
            </div>
          </div>

          {/* The structure, shown as the actual path they need today — not a generic example. */}
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Where it goes
            </p>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {path.map((part, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  {idx > 0 && <span className="text-muted-foreground">›</span>}
                  <span className="rounded-md border border-border bg-card px-1.5 py-0.5 font-medium text-foreground">
                    {part}
                  </span>
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground">›</span>
                <span className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-muted-foreground">
                  Ad type
                </span>
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Create today's day folder if it is not there yet, then a folder inside it for the kind
              of ad — for example <b className="text-foreground">2 Clips</b> or{" "}
              <b className="text-foreground">4 Clips</b> — and put that work in it.
            </p>
          </div>

          <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            <li>• A proper backup of everything the team has made.</li>
            <li>• A portfolio we can show to new clients.</li>
            <li>• Everything kept safely and in one system.</li>
          </ul>

          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <p className="text-[11px] leading-relaxed text-foreground">
              If the day's work is not uploaded to the Drive,{" "}
              <b>that work will not be counted for the day.</b>
            </p>
          </div>

          {user.googleDriveBaseUrl ? (
            <a
              href={user.googleDriveBaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-test="open-drive"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <UploadCloud size={16} /> Open my Drive folder <ExternalLink size={13} className="opacity-70" />
            </a>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-600">
              No Drive folder is set for you yet — ask your admin to add it, then upload your work there.
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              data-test="confirm-uploaded"
              className="mt-0.5 rounded border-border"
            />
            <span className="text-xs leading-relaxed text-foreground">
              I have uploaded today's work to the Drive, in the folders shown above.
            </span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-10 flex-1 rounded-lg border border-border bg-accent text-sm font-medium text-foreground"
            >
              Not yet
            </button>
            <button
              onClick={() => setStep("form")}
              disabled={!confirmed}
              data-test="continue-to-report"
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              Continue <ArrowRight size={14} />
            </button>
          </div>
          {!confirmed && (
            <p className="text-center text-[10px] text-muted-foreground">
              Tick the box above once your work is uploaded to continue to check-out.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Step 3 · Checked out ────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={finish}>
        <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-5 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <LogOut className="h-7 w-7 text-success" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-foreground">Checked out</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Today's report has gone to your admin for approval. Finishing also sends it on WhatsApp.
            </p>
          </div>
          <button
            onClick={finish}
            className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Send to admin &amp; finish
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2 · Today's report ─────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !submitting && onClose()}>
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">Today Work Report</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Auto-filled from your work. Add a note &amp; check out.</p>
        </div>

        {/* Name + check-in (read-only, fetched) */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground"><User size={13} className="text-primary" /> {user.name}</span>
          <span className="flex items-center gap-1 text-muted-foreground"><Clock size={11} /> In at {checkInTime}</span>
        </div>

        {/* Auto stats (read-only) */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-success/10 p-2 text-center">
            <p className="font-display text-lg font-bold text-success">{stats.completedToday}</p>
            <p className="text-[10px] text-muted-foreground">Videos Done</p>
          </div>
          <div className="rounded-lg bg-warning/10 p-2 text-center">
            <p className="font-display text-lg font-bold text-warning">{stats.inProgress}</p>
            <p className="text-[10px] text-muted-foreground">In Progress</p>
          </div>
          <div className="rounded-lg bg-info/10 p-2 text-center">
            <p className="font-display text-lg font-bold text-info">{stats.pending}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[11px] text-foreground">
          <UploadCloud size={13} className="shrink-0 text-success" />
          Work uploaded to {path.join(" › ")}
        </div>

        {/* Only editable field: Note */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Note <span className="text-muted-foreground/60">(optional)</span></label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything to add for the admin about today's work?"
            className="h-20 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setStep("upload")}
            disabled={submitting}
            className="h-10 flex-1 rounded-lg border border-border bg-accent text-sm font-medium text-foreground"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            data-test="submit-checkout"
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            {submitting ? "Submitting..." : "Submit & Check Out"}
          </button>
        </div>

        <p className="flex items-center justify-center gap-1 text-center text-[10px] text-muted-foreground">
          <Video size={10} /> Report goes to admin on website + WhatsApp
        </p>
      </div>
    </div>
  );
}
