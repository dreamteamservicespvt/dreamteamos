import { useMemo, useState } from "react";
import { Star, Loader2, Upload, Check, MessageCircle, ExternalLink, Video, Gift } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { uploadToCloudinary } from "@/services/cloudinary";
import { myReviewTasksQuery, uploadReviewScreenshot, uploadFeedbackVideo } from "@/services/reviews";
import { formatPhoneDisplay, getWhatsAppUrl } from "@/utils/phone";
import { useToast } from "@/hooks/use-toast";
import type { ReviewTask } from "@/types";

const STATUS_LABEL: Record<string, string> = {
  requested: "Collect 5★ review",
  review_uploaded: "Awaiting admin verification",
  verified: "Upload feedback video",
  completed: "Completed",
};

export default function MyReviews() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const q = useMemo(() => (user ? myReviewTasksQuery(user.uid) : null), [user?.uid]);
  const { data: tasks, loading } = useFirestoreQuery<ReviewTask>(q, [user?.uid]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [tasks],
  );

  const handleScreenshot = async (task: ReviewTask, file: File) => {
    setBusyId(task.id);
    try {
      const url = await uploadToCloudinary(file);
      await uploadReviewScreenshot(task.id, url);
      toast({ title: "Screenshot uploaded", description: "Admin will verify the 5★ review." });
    } catch {
      toast({ title: "Error", description: "Upload failed.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleVideo = async (task: ReviewTask, file: File) => {
    setBusyId(task.id);
    try {
      const url = await uploadToCloudinary(file);
      await uploadFeedbackVideo(task.id, url);
      toast({ title: "Video uploaded", description: "Feedback video saved for our social media." });
    } catch {
      toast({ title: "Error", description: "Upload failed.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 md:p-5 shadow-sm">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          <Star className="w-3 h-3" /> Reviews & feedback
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">My Reviews</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Collect a 5★ review (client gets 10% off), upload the screenshot, then the feedback video.</p>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No review tasks</p>
          <p className="text-sm">Your admin will assign review collection here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((t) => {
            const busy = busyId === t.id;
            return (
              <div key={t.id} className="bg-card border rounded-xl p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="font-semibold text-foreground text-sm md:text-base">{t.clientName || formatPhoneDisplay(t.clientPhone)}</h3>
                  <span className={`text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.status === "completed" || t.status === "verified" ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : t.status === "review_uploaded" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-muted text-muted-foreground"}`}>
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                  {!!t.loyaltyDiscountPercent && <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400"><Gift size={10} /> {t.loyaltyDiscountPercent}% off earned</span>}
                  <a href={getWhatsAppUrl(t.clientPhone)} target="_blank" rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-medium">
                    <MessageCircle className="w-3 h-3" /> {formatPhoneDisplay(t.clientPhone)}
                  </a>
                </div>

                {/* Step 1: 5★ screenshot */}
                {(t.status === "requested" || t.status === "review_uploaded") && (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${busy ? "opacity-60 pointer-events-none" : ""} bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25`}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      <span>{t.status === "review_uploaded" ? "Re-upload 5★ screenshot" : "Upload 5★ screenshot"}</span>
                      <input type="file" accept="image/*" className="hidden" disabled={busy}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScreenshot(t, f); e.currentTarget.value = ""; }} />
                    </label>
                    {t.reviewScreenshotUrl && (
                      <a href={t.reviewScreenshotUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink size={11} /> View uploaded</a>
                    )}
                    {t.status === "review_uploaded" && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Check size={12} /> Sent for verification</span>}
                  </div>
                )}

                {/* Step 2: feedback video (after 5★ verified) */}
                {(t.status === "verified" || t.status === "completed") && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-green-600 dark:text-green-400 inline-flex items-center gap-1"><Check size={12} /> 5★ verified</span>
                    {t.status === "completed" && t.feedbackVideoUrl ? (
                      <a href={t.feedbackVideoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink size={11} /> View feedback video</a>
                    ) : (
                      <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${busy ? "opacity-60 pointer-events-none" : ""} bg-primary/10 text-primary hover:bg-primary/20`}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />}
                        <span>{t.status === "completed" ? "Re-upload feedback video" : "Upload feedback video"}</span>
                        <input type="file" accept="video/*" className="hidden" disabled={busy}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideo(t, f); e.currentTarget.value = ""; }} />
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
