import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { type ReviewFeedback, type Deliverable } from "@/types/cinematicAds";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  Play,
  Eye,
  Link2,
  MessageSquare,
  ChevronDown,
  Check,
  Clock,
  Send,
  Download,
  Star,
  Flag,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const MAX_REVISION_ROUNDS = 3;

export default function Step6ReviewDelivery() {
  const {
    project,
    setFinalVideo,
    addFeedbackRound,
    toggleDeliverable,
    markDelivered,
  } = useCinematicAdsStore();

  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackTimestamp, setFeedbackTimestamp] = useState("");
  const [showFeedbackHistory, setShowFeedbackHistory] = useState(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  if (!project || !project.clientBrief) return null;

  const handleVideoUpload = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      setFinalVideo(url, file);
      toast.success("Final video uploaded!");
    },
    [setFinalVideo],
  );

  const handleAddFeedback = useCallback(() => {
    if (!feedbackText.trim()) {
      toast.error("Please enter feedback");
      return;
    }
    if (project.feedbackRounds.length >= MAX_REVISION_ROUNDS) {
      toast.error(`Maximum ${MAX_REVISION_ROUNDS} revision rounds reached`);
      return;
    }
    const feedback: ReviewFeedback = {
      id: `fb-${Date.now()}`,
      round: project.feedbackRounds.length + 1,
      timestamp: feedbackTimestamp || undefined,
      comment: feedbackText.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    addFeedbackRound(feedback);
    setFeedbackText("");
    setFeedbackTimestamp("");
    toast.success(`Revision round ${feedback.round} feedback added`);
  }, [feedbackText, feedbackTimestamp, project, addFeedbackRound]);

  const watermarkUrl = project.finalVideoUrl
    ? project.finalVideoUrl
    : null;

  const shareableLink = project.finalVideoUrl
    ? `${window.location.origin}/review/${project.id}`
    : null;

  const allDeliverablesReady = project.deliverables.length > 0 &&
    project.deliverables.every((d) => d.ready);

  const handleMarkDelivered = useCallback(() => {
    if (!allDeliverablesReady) {
      toast.error("Mark all deliverables as ready before delivery");
      return;
    }
    markDelivered();
    toast.success("Project marked as delivered!");
  }, [allDeliverablesReady, markDelivered]);

  return (
    <div className="space-y-6">
      {/* Final Video Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Play className="w-4 h-4" /> Final Video
          </CardTitle>
          <CardDescription className="text-xs">
            Upload the complete edited video for client review
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.finalVideoUrl ? (
            <div className="space-y-3">
              <video
                src={project.finalVideoUrl}
                controls
                className="w-full rounded-lg border aspect-video bg-black"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => videoInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" /> Replace Video
                </Button>
                {shareableLink && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(shareableLink);
                      toast.success("Review link copied!");
                    }}
                  >
                    <Link2 className="w-3.5 h-3.5" /> Copy Review Link
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-lg aspect-video flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => videoInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Upload final edited video</span>
              <span className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM</span>
            </div>
          )}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleVideoUpload(file);
              e.target.value = "";
            }}
          />
        </CardContent>
      </Card>

      {/* Client Feedback & Revisions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Client Feedback & Revisions
              </CardTitle>
              <CardDescription className="text-xs">
                Round {project.feedbackRounds.length}/{MAX_REVISION_ROUNDS} — Timestamp-based feedback
              </CardDescription>
            </div>
            <Badge variant={project.feedbackRounds.length >= MAX_REVISION_ROUNDS ? "destructive" : "secondary"}>
              {project.feedbackRounds.length}/{MAX_REVISION_ROUNDS} rounds
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Feedback */}
          {project.feedbackRounds.length < MAX_REVISION_ROUNDS && (
            <div className="space-y-3 bg-muted/30 rounded-lg p-4">
              <div className="flex gap-2">
                <div className="space-y-1 w-32">
                  <Label className="text-[10px]">Timestamp</Label>
                  <Input
                    placeholder="e.g. 0:15"
                    value={feedbackTimestamp}
                    onChange={(e) => setFeedbackTimestamp(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-[10px]">Feedback</Label>
                  <Textarea
                    placeholder="Describe the change needed…"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    rows={2}
                    className="text-xs"
                  />
                </div>
              </div>
              <Button size="sm" className="gap-1" onClick={handleAddFeedback}>
                <Send className="w-3.5 h-3.5" /> Add Feedback
              </Button>
            </div>
          )}

          {/* Feedback History */}
          {project.feedbackRounds.length > 0 && (
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs w-full justify-start"
                onClick={() => setShowFeedbackHistory(!showFeedbackHistory)}
              >
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showFeedbackHistory && "rotate-180")} />
                Feedback History ({project.feedbackRounds.length} rounds)
              </Button>
              <AnimatePresence>
                {showFeedbackHistory && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-2"
                  >
                    {project.feedbackRounds.map((fb) => (
                      <div
                        key={fb.id}
                        className="bg-muted/50 rounded-lg p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">Round {fb.round}</Badge>
                          {fb.timestamp && (
                            <Badge variant="secondary" className="text-[10px]">
                              <Clock className="w-2.5 h-2.5 mr-0.5" /> {fb.timestamp}
                            </Badge>
                          )}
                          <Badge
                            variant={fb.status === "resolved" ? "default" : fb.status === "pending" ? "secondary" : "destructive"}
                            className="text-[10px]"
                          >
                            {fb.status}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{fb.comment}</p>
                        <p className="text-[10px] text-muted-foreground/60">{new Date(fb.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deliverables Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Flag className="w-4 h-4" /> Deliverables Checklist
          </CardTitle>
          <CardDescription className="text-xs">
            Verify all deliverables before marking as delivered
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {project.deliverables.length > 0 ? (
            project.deliverables.map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted/50"
              >
                <Checkbox
                  checked={d.ready}
                  onCheckedChange={() => toggleDeliverable(d.id)}
                />
                <div className="flex-1">
                  <span className="text-xs font-medium">{d.label}</span>
                  {d.format && (
                    <Badge variant="outline" className="text-[10px] ml-2">{d.format}</Badge>
                  )}
                </div>
                {d.ready && <Check className="w-4 h-4 text-green-500" />}
              </label>
            ))
          ) : (
            <div className="text-xs text-muted-foreground flex items-center gap-2 py-4">
              <AlertCircle className="w-4 h-4" />
              Deliverables will auto-populate from export settings in the editing guide
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mark as Delivered */}
      {!project.delivered && (
        <Button
          className="w-full gap-2"
          size="lg"
          onClick={handleMarkDelivered}
          disabled={!allDeliverablesReady || !project.finalVideoUrl}
        >
          <Star className="w-5 h-5" />
          Mark Project as Delivered
        </Button>
      )}

      {project.delivered && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center"
        >
          <Check className="w-10 h-10 text-green-500 mx-auto mb-2" />
          <p className="font-semibold text-green-600 dark:text-green-400">Project Delivered!</p>
          <p className="text-xs text-muted-foreground mt-1">All assets have been finalized and delivered to the client.</p>
        </motion.div>
      )}
    </div>
  );
}
