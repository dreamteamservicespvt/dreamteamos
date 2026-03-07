import { useState, useEffect, useCallback } from "react";
import {
  collection, addDoc, query, where, getDocs, serverTimestamp, doc, updateDoc, deleteDoc, onSnapshot,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { uploadToCloudinary } from "@/services/cloudinary";
import { verifyScreenshot, type VerificationResult } from "@/services/gemini";
import { calculateRevenue } from "@/utils/pricing";
import type { WorkItem, WorkSubmission } from "@/types";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Upload, ExternalLink, Loader2, Check, AlertTriangle,
  XCircle, Send, ImageIcon, FolderOpen, Edit2, Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const WORK_TYPES = ["wishes", "promotional", "cinematic"] as const;

const DURATIONS: Record<string, string[]> = {
  wishes: ["20s", "40s"],
  promotional: ["15s", "30s", "48s", "60s", "custom"],
  cinematic: ["15s", "30s", "48s", "60s", "custom"],
};

interface WorkRow {
  id: string;
  type: typeof WORK_TYPES[number];
  duration: string;
  customDuration: number | null;
  quantity: number;
}

function newRow(): WorkRow {
  return { id: crypto.randomUUID(), type: "wishes", duration: "20s", customDuration: null, quantity: 1 };
}

export default function SubmitWork() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();

  const [rows, setRows] = useState<WorkRow[]>([newRow()]);
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [todaySubmissions, setTodaySubmissions] = useState<(WorkSubmission & { id: string })[]>([]);
  const [checkingToday, setCheckingToday] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const totalVideos = rows.reduce((s, r) => s + r.quantity, 0);

  // Real-time listener for today's submissions
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "work_submissions"),
      where("techMemberId", "==", user.uid),
      where("date", "==", today)
    );
    const unsub = onSnapshot(q, (snap) => {
      const subs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkSubmission & { id: string }));
      subs.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
      setTodaySubmissions(subs);
      setCheckingToday(false);
    });
    return unsub;
  }, [user, today]);

  const updateRow = (id: string, updates: Partial<WorkRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...updates };
        if (updates.type) {
          updated.duration = DURATIONS[updates.type][0];
          updated.customDuration = null;
        }
        if (updates.duration && updates.duration !== "custom") {
          updated.customDuration = null;
        }
        return updated;
      })
    );
  };

  const handleScreenshotUpload = async (file: File) => {
    setScreenshotFile(file);
    setUploading(true);
    setUploadProgress(0);
    setVerificationResult(null);
    try {
      const url = await uploadToCloudinary(file, setUploadProgress);
      setScreenshotUrl(url);
      toast({ title: "Uploaded", description: "Screenshot uploaded successfully." });

      setVerifying(true);
      try {
        const result = await verifyScreenshot(url);
        setVerificationResult(result);
      } catch {
        setVerificationResult({ videoCount: 0, confidence: "low", notes: "AI verification failed" });
      } finally {
        setVerifying(false);
      }
    } catch {
      toast({ title: "Upload Failed", description: "Could not upload screenshot.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const items: WorkItem[] = rows.map((r) => ({
        type: r.type,
        duration: r.duration,
        customDuration: r.customDuration,
        quantity: r.quantity,
        pricePerUnit: 0,
      }));

      // Pre-calculate revenue for display (admin can override)
      const estimatedRevenue = calculateRevenue(items);

      if (editingId) {
        // Update existing submission
        await updateDoc(doc(db, "work_submissions", editingId), {
          totalVideos,
          aiVerificationResult: verificationResult
            ? verificationResult.videoCount === totalVideos ? "pass" : "fail"
            : "pending",
          driveFolderUrl,
          screenshotUrl,
          items,
          calculatedRevenue: estimatedRevenue,
          status: "pending", // Reset to pending when edited
        });
        toast({ title: "Updated!", description: "Your submission has been updated and sent for re-approval." });
      } else {
        // Create new submission
        await addDoc(collection(db, "work_submissions"), {
          techMemberId: user.uid,
          submittedAt: serverTimestamp(),
          date: today,
          status: "pending",
          totalVideos,
          aiVerificationResult: verificationResult
            ? verificationResult.videoCount === totalVideos ? "pass" : "fail"
            : "pending",
          driveFolderUrl,
          screenshotUrl,
          items,
          calculatedRevenue: estimatedRevenue,
        });
        toast({ title: "Submitted!", description: "Your work has been submitted for approval." });
      }

      // Reset form and refresh
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to submit work.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setRows([newRow()]);
    setDriveFolderUrl("");
    setScreenshotFile(null);
    setScreenshotUrl("");
    setUploadProgress(0);
    setVerificationResult(null);
    setEditingId(null);
  };

  const startEdit = (sub: WorkSubmission & { id: string }) => {
    setEditingId(sub.id);
    setRows(sub.items.map((item) => ({
      id: crypto.randomUUID(),
      type: item.type as any,
      duration: item.duration,
      customDuration: item.customDuration || null,
      quantity: item.quantity,
    })));
    setDriveFolderUrl(sub.driveFolderUrl || "");
    setScreenshotUrl(sub.screenshotUrl || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (subId: string) => {
    if (!confirm("Delete this submission?")) return;
    try {
      await deleteDoc(doc(db, "work_submissions", subId));
      toast({ title: "Deleted", description: "Submission removed." });
      
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
  };

  if (checkingToday) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  const canSubmit = rows.length > 0 && totalVideos > 0 && screenshotUrl && !submitting;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {editingId ? "Edit Submission" : "Submit Today's Work"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          {todaySubmissions.length > 0 && !editingId && (
            <span className="ml-2 text-primary">• {todaySubmissions.length} submission(s) today</span>
          )}
        </p>
      </div>

      {/* Today's Existing Submissions */}
      {todaySubmissions.length > 0 && !editingId && (
        <div className="space-y-3">
          <h2 className="font-display font-semibold text-foreground text-sm">Today's Submissions</h2>
          {todaySubmissions.map((sub) => (
            <div key={sub.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-sm font-medium text-foreground">{sub.totalVideos} video{sub.totalVideos !== 1 ? "s" : ""}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      sub.status === "approved" ? "bg-success/15 text-success"
                      : sub.status === "rejected" ? "bg-destructive/15 text-destructive"
                      : "bg-warning/15 text-warning"
                    }`}>
                      {sub.status}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      sub.aiVerificationResult === "pass" ? "bg-success/15 text-success"
                      : sub.aiVerificationResult === "fail" ? "bg-destructive/15 text-destructive"
                      : "bg-warning/15 text-warning"
                    }`}>
                      AI: {sub.aiVerificationResult}
                    </span>
                  </div>
                  {sub.items && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {sub.items.map((item, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-muted-foreground capitalize">
                          {item.type} {item.duration} ×{item.quantity}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => startEdit(sub)} title="Edit"
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => handleDelete(sub.id)} title="Delete"
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingId && (
        <div className="bg-info/10 border border-info/30 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm text-info font-medium">Editing submission — will be sent for re-approval</span>
          <button onClick={resetForm} className="text-xs text-info hover:underline">Cancel Edit</button>
        </div>
      )}

      {/* Section A: Work Items */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-foreground">Video Entries</h2>
          <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded-md">
            Total: {totalVideos} video{totalVideos !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-3">
          {rows.map((row, idx) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 bg-background border border-border rounded-lg p-3"
            >
              <span className="text-[11px] text-muted-foreground font-mono mt-2.5 w-5 shrink-0">{idx + 1}.</span>

              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <select
                  value={row.type}
                  onChange={(e) => updateRow(row.id, { type: e.target.value as any })}
                  className="h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary transition-colors"
                >
                  {WORK_TYPES.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>

                <select
                  value={row.duration}
                  onChange={(e) => updateRow(row.id, { duration: e.target.value })}
                  className="h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary transition-colors"
                >
                  {DURATIONS[row.type].map((d) => (
                    <option key={d} value={d}>{d === "custom" ? "Custom" : d}</option>
                  ))}
                </select>

                {row.duration === "custom" && (
                  <input
                    type="number"
                    min={1}
                    max={300}
                    placeholder="Seconds"
                    value={row.customDuration || ""}
                    onChange={(e) => updateRow(row.id, { customDuration: Number(e.target.value) || null })}
                    className="h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary transition-colors"
                  />
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={row.quantity}
                    onChange={(e) => updateRow(row.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    className="h-9 w-full px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary transition-colors"
                    placeholder="Qty"
                  />
                </div>
              </div>

              <button
                onClick={() => setRows((p) => p.filter((r) => r.id !== row.id))}
                disabled={rows.length === 1}
                className="w-8 h-8 mt-0.5 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          ))}
        </div>

        <button
          onClick={() => setRows((p) => [...p, newRow()])}
          className="h-9 px-4 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center gap-2"
        >
          <Plus size={14} /> Add Row
        </button>
      </div>

      {/* Section B: Drive Upload */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-display font-semibold text-foreground">Drive Folder</h2>

        {user?.googleDriveBaseUrl && (
          <a href={user.googleDriveBaseUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <FolderOpen size={15} /> Open Your Drive Folder
            <ExternalLink size={12} />
          </a>
        )}

        <p className="text-xs text-muted-foreground">
          Create a folder named <span className="text-foreground font-mono">{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}</span> and upload your videos, then paste the URL below.
        </p>

        <div className="flex gap-2">
          <input
            type="url" value={driveFolderUrl} onChange={(e) => setDriveFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 h-10 px-4 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none text-sm font-body"
          />
          {driveFolderUrl && (
            <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer"
              className="h-10 w-10 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
              <ExternalLink size={15} />
            </a>
          )}
        </div>
      </div>

      {/* Section C: Screenshot & AI Verification */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-display font-semibold text-foreground">Screenshot Verification</h2>

        <label className="block cursor-pointer">
          <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            screenshotUrl ? "border-success/50 bg-success/5" : "border-border hover:border-primary/50"
          }`}>
            {uploading ? (
              <div className="space-y-2">
                <Loader2 size={24} className="animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Uploading... {uploadProgress}%</p>
                <div className="w-48 h-1.5 bg-border rounded-full mx-auto overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            ) : screenshotUrl ? (
              <div className="space-y-2">
                <Check size={24} className="text-success mx-auto" />
                <p className="text-sm text-success">Screenshot uploaded</p>
                <img src={screenshotUrl} alt="Screenshot" className="max-h-40 mx-auto rounded-md border border-border" />
              </div>
            ) : (
              <div className="space-y-2">
                <ImageIcon size={24} className="text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Drop screenshot here or click to browse</p>
              </div>
            )}
          </div>
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScreenshotUpload(f); }} />
        </label>

        <AnimatePresence>
          {verifying && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-sm text-muted-foreground bg-background border border-border rounded-lg p-3">
              <Loader2 size={16} className="animate-spin text-info" />
              AI is analyzing your screenshot...
            </motion.div>
          )}
          {verificationResult && !verifying && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-start gap-3 text-sm rounded-lg p-4 border ${
                verificationResult.videoCount === totalVideos
                  ? "bg-success/5 border-success/30 text-success"
                  : "bg-warning/5 border-warning/30 text-warning"
              }`}
            >
              {verificationResult.videoCount === totalVideos ? (
                <Check size={18} className="shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium">
                  {verificationResult.videoCount === totalVideos
                    ? `AI Verified — ${verificationResult.videoCount} videos detected ✓`
                    : `AI detected ${verificationResult.videoCount} videos, you claimed ${totalVideos}`}
                </p>
                <p className="text-xs mt-0.5 opacity-75">{verificationResult.notes} (Confidence: {verificationResult.confidence})</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {submitting ? "Submitting..." : editingId ? "Update Submission" : "Submit Work"}
      </button>
    </div>
  );
}
