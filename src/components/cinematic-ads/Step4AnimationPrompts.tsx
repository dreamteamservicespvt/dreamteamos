import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { generateAnimationPrompts } from "@/services/cinematicAdsService";
import { type AnimationPrompt } from "@/types/cinematicAds";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Sparkles,
  Video,
  Upload,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Play,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const PLATFORM_INFO = {
  veo: { name: "Google Veo 3.1", strengths: "Best for: Complex motion, camera movement, cinematic sequences, smooth transitions" },
  grok: { name: "Grok Imagine", strengths: "Best for: Dramatic stills-to-motion, stylized animation, strong identity preservation" },
};

const ANIMATION_MODES = [
  { value: "text_to_video", label: "Text → Video" },
  { value: "image_to_video", label: "Image → Video" },
  { value: "start_end_frames", label: "Start + End Frames → Video" },
];

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"];
const DURATIONS = ["3s", "5s", "8s", "10s"];

export default function Step4AnimationPrompts() {
  const {
    project,
    setAnimationPrompts,
    updateAnimationPrompt,
    confirmAnimation,
    setProcessing,
    processing,
    processingMessage,
  } = useCinematicAdsStore();

  const [expandedClip, setExpandedClip] = useState<number | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<number | null>(null);
  const [promptEdits, setPromptEdits] = useState<Record<number, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  if (!project || !project.clientBrief) return null;

  const selectedStory = project.stories.find((s) => s.id === project.selectedStoryId);
  if (!selectedStory) return null;

  const handleGenerate = useCallback(async () => {
    if (!project.clientBrief || !selectedStory) return;
    setProcessing(true, "Generating animation prompts with platform recommendations…");
    try {
      const prompts = await generateAnimationPrompts(selectedStory, project.sceneFrames, project.clientBrief);
      setAnimationPrompts(prompts);
      toast.success(`${prompts.length} animation prompts generated!`);
    } catch (err: any) {
      console.error("Animation prompts failed:", err);
      toast.error(err?.message || "Failed to generate animation prompts");
    } finally {
      setProcessing(false);
    }
  }, [project, selectedStory, setAnimationPrompts, setProcessing]);

  const handleClipUpload = useCallback(
    (clipNum: number, file: File) => {
      const url = URL.createObjectURL(file);
      updateAnimationPrompt(clipNum, { clipUrl: url, clipFile: file });
      toast.success(`Clip uploaded for Scene ${clipNum}`);
    },
    [updateAnimationPrompt],
  );

  const handleApproveClip = useCallback(
    (clipNum: number) => {
      const prompt = project.animationPrompts.find((p) => p.sceneNumber === clipNum);
      if (!prompt) return;
      updateAnimationPrompt(clipNum, { approved: !prompt.approved });
    },
    [project, updateAnimationPrompt],
  );

  const handleSavePrompt = useCallback(
    (clipNum: number) => {
      const newPrompt = promptEdits[clipNum];
      if (newPrompt !== undefined) {
        updateAnimationPrompt(clipNum, { prompt: newPrompt });
        setEditingPrompt(null);
        toast.success("Prompt updated");
      }
    },
    [promptEdits, updateAnimationPrompt],
  );

  const allApproved = project.animationPrompts.length > 0 &&
    project.animationPrompts.every((p) => p.approved);

  const handleConfirm = useCallback(() => {
    if (!allApproved) {
      toast.error("Approve all animation clips before proceeding");
      return;
    }
    confirmAnimation();
    toast.success("Animation confirmed! Proceeding to Editing Guide.");
  }, [allApproved, confirmAnimation]);

  return (
    <div className="space-y-6">
      {/* Platform Selection Matrix Legend */}
      {project.animationPrompts.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clapperboard className="w-4 h-4" />
              Animation Platform Guide
            </CardTitle>
            <CardDescription className="text-xs">
              AI will recommend the optimal platform for each scene. You can override after generation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(PLATFORM_INFO).map(([key, info]) => (
              <div key={key} className="flex items-start gap-3 bg-muted/50 rounded-lg p-3">
                <Badge variant={key === "veo" ? "default" : "secondary"} className="mt-0.5">{info.name}</Badge>
                <p className="text-xs text-muted-foreground">{info.strengths}</p>
              </div>
            ))}
            <Separator />
            <Button className="w-full gap-2" size="lg" onClick={handleGenerate} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {processingMessage}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Animation Prompts for All Scenes
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Animation Prompt Cards */}
      {project.animationPrompts.map((ap, idx) => {
        const isExpanded = expandedClip === ap.sceneNumber;
        const isEditingPromptLocal = editingPrompt === ap.sceneNumber;
        const frame = project.sceneFrames.find((f) => f.sceneNumber === ap.sceneNumber);

        return (
          <motion.div
            key={ap.sceneNumber}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06 }}
          >
            <Card className={cn(ap.approved && "border-green-500/30")}>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setExpandedClip(isExpanded ? null : ap.sceneNumber)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">Scene {ap.sceneNumber}</Badge>
                    <Badge variant={ap.platform === "veo" ? "default" : "secondary"} className="text-[10px]">
                      {ap.platform === "veo" ? "Veo 3.1" : "Grok Imagine"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{ap.mode.replace(/_/g, " ")}</Badge>
                    {ap.approved && (
                      <Badge className="text-[10px] bg-green-600"><Check className="w-3 h-3 mr-1" /> Approved</Badge>
                    )}
                  </div>
                  <ChevronDown className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")} />
                </div>
              </CardHeader>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    <CardContent className="pt-0 space-y-4">
                      <Separator />

                      {/* Platform & Mode Selectors */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Platform</Label>
                          <Select
                            value={ap.platform}
                            onValueChange={(val) => updateAnimationPrompt(ap.sceneNumber, { platform: val as "veo" | "grok" })}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="veo">Google Veo 3.1</SelectItem>
                              <SelectItem value="grok">Grok Imagine</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Mode</Label>
                          <Select
                            value={ap.mode}
                            onValueChange={(val) => updateAnimationPrompt(ap.sceneNumber, { mode: val as AnimationPrompt["mode"] })}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ANIMATION_MODES.map((m) => (
                                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Duration</Label>
                          <Select
                            value={ap.duration || "5s"}
                            onValueChange={(val) => updateAnimationPrompt(ap.sceneNumber, { duration: val })}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DURATIONS.map((d) => (
                                <SelectItem key={d} value={d}>{d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Aspect Ratio</Label>
                          <Select
                            value={ap.aspectRatio || "16:9"}
                            onValueChange={(val) => updateAnimationPrompt(ap.sceneNumber, { aspectRatio: val })}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ASPECT_RATIOS.map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Animation Prompt */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold flex items-center gap-1">
                            <Video className="w-4 h-4 text-purple-500" />
                            Animation Prompt
                          </p>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(ap.prompt);
                                toast.success("Prompt copied!");
                              }}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (isEditingPromptLocal) {
                                  handleSavePrompt(ap.sceneNumber);
                                } else {
                                  setPromptEdits((p) => ({ ...p, [ap.sceneNumber]: ap.prompt }));
                                  setEditingPrompt(ap.sceneNumber);
                                }
                              }}
                            >
                              {isEditingPromptLocal ? "Save" : "Edit"}
                            </Button>
                          </div>
                        </div>

                        {isEditingPromptLocal ? (
                          <Textarea
                            value={promptEdits[ap.sceneNumber] || ""}
                            onChange={(e) => setPromptEdits((p) => ({ ...p, [ap.sceneNumber]: e.target.value }))}
                            rows={4}
                            className="text-xs font-mono"
                          />
                        ) : (
                          <p className="text-xs font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">
                            {ap.prompt}
                          </p>
                        )}
                      </div>

                      {/* Attach Instructions */}
                      {frame && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-primary">📎 Frame attachments for this animation:</p>
                          <div className="flex gap-2 flex-wrap">
                            {frame.images
                              .filter((img) => img.approved && img.url)
                              .map((img) => (
                                <div key={img.id} className="relative">
                                  <img
                                    src={img.url!}
                                    alt={img.label}
                                    className="w-16 h-10 rounded border object-cover"
                                  />
                                  <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] text-white text-center px-0.5 truncate rounded-b">
                                    {img.label}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      <Separator />

                      {/* Video Clip Upload */}
                      <div className="space-y-2">
                        <p className="text-sm font-semibold flex items-center gap-1">
                          <Play className="w-4 h-4" />
                          Generated Clip
                        </p>

                        {ap.clipUrl ? (
                          <div className="space-y-2">
                            <video
                              src={ap.clipUrl}
                              controls
                              className="w-full rounded-lg border aspect-video bg-black"
                            />
                            <div className="flex gap-2">
                              <Button
                                variant={ap.approved ? "default" : "outline"}
                                size="sm"
                                className="flex-1 gap-1"
                                onClick={() => handleApproveClip(ap.sceneNumber)}
                              >
                                {ap.approved ? <Check className="w-3.5 h-3.5" /> : null}
                                {ap.approved ? "Approved" : "Approve Clip"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const key = `clip-${ap.sceneNumber}`;
                                  fileInputRefs.current[key]?.click();
                                }}
                              >
                                Replace
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="border-2 border-dashed rounded-lg aspect-video flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                            onClick={() => {
                              const key = `clip-${ap.sceneNumber}`;
                              fileInputRefs.current[key]?.click();
                            }}
                          >
                            <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                            <span className="text-xs text-muted-foreground">Upload generated video clip</span>
                            <span className="text-[10px] text-muted-foreground mt-0.5">MP4, MOV, WebM</span>
                          </div>
                        )}

                        <input
                          ref={(el) => { fileInputRefs.current[`clip-${ap.sceneNumber}`] = el; }}
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleClipUpload(ap.sceneNumber, file);
                            e.target.value = "";
                          }}
                        />
                      </div>
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        );
      })}

      {/* Regenerate All Button */}
      {project.animationPrompts.length > 0 && !project.animationConfirmed && (
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 gap-2" onClick={handleGenerate} disabled={processing}>
            <Sparkles className="w-4 h-4" />
            Regenerate All
          </Button>
          <Button className="flex-1 gap-2" size="lg" onClick={handleConfirm}>
            <ChevronRight className="w-5 h-5" />
            Confirm Animation & Proceed
          </Button>
        </div>
      )}
    </div>
  );
}
