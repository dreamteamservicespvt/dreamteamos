import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { format } from "date-fns";
import type { WorkAssignment, DailyCheckin } from "@/types";
import { motion } from "framer-motion";
import { CheckCircle, Clock, Video, Briefcase, Play, Edit3, AlertCircle, LogIn, LogOut, Loader2, Upload, Image, ExternalLink, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getWhatsAppUrl } from "@/utils/phone";
import { uploadToCloudinary } from "@/services/cloudinary";
import { verifyScreenshot } from "@/services/gemini";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";

const ADMIN_WHATSAPP = "9959935203";

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
  const [checkoutForm, setCheckoutForm] = useState({ summary: "", totalVideos: 0, driveFolderUrl: "" });
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      await addDoc(collection(db, "daily_checkins"), {
        memberId: user.uid,
        date: todayStr,
        checkedInAt: serverTimestamp(),
        status: "checked_in",
      });

      // Notify tech admin
      await addDoc(collection(db, "notifications"), {
        userId: user.createdBy,
        type: "check_in",
        title: "Team Check-In",
        message: `${user.name} has checked in for today.`,
        read: false,
        link: `/tech-admin/team/${user.uid}`,
        createdAt: serverTimestamp(),
      });

      toast({ title: "Checked In!", description: "Opening WhatsApp..." });

      // 2-second delay then open WhatsApp
      const waUrl = getWhatsAppUrl(ADMIN_WHATSAPP, `Hi, I have checked in for today (${todayStr}). Please assign me work. – ${user.name}`);
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

  const handleCheckout = async () => {
    if (!user || !todayCheckin) return;
    if (!checkoutForm.summary.trim() || checkoutForm.totalVideos <= 0 || !checkoutForm.driveFolderUrl.trim() || !screenshotFile) {
      toast({ title: "Missing fields", description: "Fill all fields and attach a screenshot.", variant: "destructive" });
      return;
    }

    setSubmittingCheckout(true);
    try {
      // Upload screenshot
      const screenshotUrl = await uploadToCloudinary(screenshotFile, setUploadProgress);

      // AI verification
      let aiResult: { videoCount: number; confidence: string; notes: string } = { videoCount: 0, confidence: "low", notes: "Verification skipped" };
      try {
        aiResult = await verifyScreenshot(screenshotUrl);
      } catch {
        // continue without AI verification
      }

      // Update the checkin doc
      await updateDoc(doc(db, "daily_checkins", todayCheckin.id), {
        checkedOutAt: serverTimestamp(),
        status: "pending_approval",
        summary: checkoutForm.summary.trim(),
        totalVideos: checkoutForm.totalVideos,
        driveFolderUrl: checkoutForm.driveFolderUrl.trim(),
        screenshotUrl,
        aiVideoCount: aiResult.videoCount,
        aiConfidence: aiResult.confidence,
        aiNotes: aiResult.notes,
        aiVerificationResult: Math.abs(aiResult.videoCount - checkoutForm.totalVideos) <= 1 ? "pass" : "mismatch",
      });

      // Notify tech admin
      await addDoc(collection(db, "notifications"), {
        userId: user.createdBy,
        type: "check_out",
        title: "Work Submitted for Approval",
        message: `${user.name} checked out — ${checkoutForm.totalVideos} videos. Tap to review & approve.`,
        read: false,
        link: `/tech-admin/team/${user.uid}`,
        createdAt: serverTimestamp(),
      });

      setShowCheckout(false);
      setCheckoutForm({ summary: "", totalVideos: 0, driveFolderUrl: "" });
      setScreenshotFile(null);
      toast({ title: "Checked Out!", description: `Daily summary submitted. AI counted ${aiResult.videoCount} videos.` });
    } catch {
      toast({ title: "Error", description: "Failed to check out.", variant: "destructive" });
    } finally {
      setSubmittingCheckout(false);
      setUploadProgress(0);
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
      {showCheckout && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => !submittingCheckout && setShowCheckout(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-foreground text-lg">Daily Check-Out</h3>

            <div className="bg-info/10 border border-info/20 rounded-lg p-3 text-xs text-info space-y-1">
              <p className="font-semibold">Instructions:</p>
              <p>1. Create a folder named <span className="font-mono font-bold">{todayStr}</span> in your Drive</p>
              <p>2. Upload all today's completed videos into that folder</p>
              <p>3. Paste the folder URL below & attach a screenshot</p>
              <p>4. Your submission will be sent to admin for approval</p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Daily Summary</label>
              <textarea
                value={checkoutForm.summary}
                onChange={(e) => setCheckoutForm((p) => ({ ...p, summary: e.target.value }))}
                placeholder="What did you work on today?"
                className="w-full h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:ring-1 focus:ring-primary outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">Total Videos</label>
                <input
                  type="number"
                  min={0}
                  value={checkoutForm.totalVideos || ""}
                  onChange={(e) => setCheckoutForm((p) => ({ ...p, totalVideos: parseInt(e.target.value) || 0 }))}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">Google Drive URL</label>
                <input
                  type="url"
                  value={checkoutForm.driveFolderUrl}
                  onChange={(e) => setCheckoutForm((p) => ({ ...p, driveFolderUrl: e.target.value }))}
                  placeholder="https://drive.google.com/..."
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Drive Screenshot (for AI verification)</label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)} />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                {screenshotFile ? (
                  <>
                    <Image size={16} className="text-success" />
                    <span className="text-xs text-success font-medium truncate max-w-[200px]">{screenshotFile.name}</span>
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    <span className="text-xs">Click to upload screenshot</span>
                  </>
                )}
              </button>
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowCheckout(false)}
                disabled={submittingCheckout}
                className="flex-1 h-9 rounded-lg bg-accent text-foreground text-sm font-medium border border-border"
              >
                Cancel
              </button>
              <button
                onClick={handleCheckout}
                disabled={submittingCheckout}
                className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submittingCheckout ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                Submit & Check Out
              </button>
            </div>
          </div>
        </div>
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
