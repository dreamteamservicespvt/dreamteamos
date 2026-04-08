import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { generateFramePrompts } from "@/services/cinematicAdsService";
import { QC_CHECKLIST_ITEMS, type SceneFrame } from "@/types/cinematicAds";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Sparkles,
  Upload,
  Check,
  X,
  Pencil,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  Copy,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export default function Step3FrameGeneration() {
  const {
    project,
    setSceneFrames,
    updateSceneFrame,
    confirmFrames,
    setProcessing,
    processing,
    processingMessage,
  } = useCinematicAdsStore();

  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<number | null>(null);
  const [promptEdits, setPromptEdits] = useState<Record<number, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  if (!project || !project.clientBrief) return null;

  const selectedStory = project.stories.find((s) => s.id === project.selectedStoryId);
  if (!selectedStory) return null;

  const handleGenerate = useCallback(async () => {
    if (!project.clientBrief || !selectedStory) return;
    setProcessing(true, "Generating frame composition prompts…");
    try {
      const frames = await generateFramePrompts(selectedStory, project.characters, project.clientBrief);
      setSceneFrames(frames);
      toast.success(`${frames.length} frame prompts generated!`);
    } catch (err: any) {
      console.error("Frame generation failed:", err);
      toast.error(err?.message || "Failed to generate frame prompts");
    } finally {
      setProcessing(false);
    }
  }, [project, selectedStory, setSceneFrames, setProcessing]);

  const handleImageUpload = useCallback(
    (sceneNum: number, imageId: string, file: File) => {
      const frame = project.sceneFrames.find((f) => f.sceneNumber === sceneNum);
      if (!frame) return;
      const url = URL.createObjectURL(file);
      const updatedImages = frame.images.map((img) =>
        img.id === imageId ? { ...img, file, url } : img,
      );
      updateSceneFrame(sceneNum, { images: updatedImages });
    },
    [project, updateSceneFrame],
  );

  const handleApproveImage = useCallback(
    (sceneNum: number, imageId: string) => {
      const frame = project.sceneFrames.find((f) => f.sceneNumber === sceneNum);
      if (!frame) return;
      const updatedImages = frame.images.map((img) =>
        img.id === imageId ? { ...img, approved: !img.approved } : img,
      );
      updateSceneFrame(sceneNum, { images: updatedImages });
    },
    [project, updateSceneFrame],
  );

  const handleQCToggle = useCallback(
    (sceneNum: number, item: string) => {
      const frame = project.sceneFrames.find((f) => f.sceneNumber === sceneNum);
      if (!frame) return;
      const updated = { ...frame.qcChecklist, [item]: !frame.qcChecklist[item] };
      updateSceneFrame(sceneNum, { qcChecklist: updated });
    },
    [project, updateSceneFrame],
  );

  const handleSavePrompt = useCallback(
    (sceneNum: number) => {
      const newPrompt = promptEdits[sceneNum];
      if (newPrompt !== undefined) {
        updateSceneFrame(sceneNum, { prompt: newPrompt });
        setEditingPrompt(null);
        toast.success("Prompt updated");
      }
    },
    [promptEdits, updateSceneFrame],
  );

  const allQCPassed = project.sceneFrames.length > 0 &&
    project.sceneFrames.every((f) =>
      QC_CHECKLIST_ITEMS.every((item) => f.qcChecklist[item]) &&
      f.images.every((img) => img.approved),
    );

  const handleConfirm = useCallback(() => {
    if (!allQCPassed) {
      toast.error("Complete QC checklist and approve all frames before proceeding");
      return;
    }
    confirmFrames();
    toast.success("Frames approved! Proceeding to Animation Prompts.");
  }, [allQCPassed, confirmFrames]);

  return (
    <div className="space-y-6">
      {/* Generate Frames Button */}
      {project.sceneFrames.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <Button className="w-full gap-2" size="lg" onClick={handleGenerate} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {processingMessage}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Frame Prompts for All Scenes
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Scene Frame Cards */}
      {project.sceneFrames.map((frame, idx) => {
        const scene = selectedStory.scenes.find((s) => s.sceneNumber === frame.sceneNumber);
        const isExpanded = expandedScene === frame.sceneNumber;
        const isEditingPrompt = editingPrompt === frame.sceneNumber;
        const qcCount = QC_CHECKLIST_ITEMS.filter((item) => frame.qcChecklist[item]).length;
        const allApproved = frame.images.every((img) => img.approved);
        const charNames = frame.characterRefs
          .map((id) => project.characters.find((c) => c.id === id)?.role)
          .filter(Boolean);

        return (
          <motion.div
            key={frame.sceneNumber}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06 }}
          >
            <Card className={cn(allApproved && qcCount === QC_CHECKLIST_ITEMS.length && "border-green-500/30")}>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setExpandedScene(isExpanded ? null : frame.sceneNumber)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px]">Scene {frame.sceneNumber}</Badge>
                      <Badge variant="outline" className="text-[10px]">{frame.frameType.replace(/_/g, " ")}</Badge>
                      {allApproved && qcCount === QC_CHECKLIST_ITEMS.length && (
                        <Badge className="text-[10px] bg-green-600">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> QC Passed
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm">{scene?.visualDescription?.slice(0, 80)}…</CardTitle>
                    {charNames.length > 0 && (
                      <CardDescription className="text-xs mt-0.5">
                        Characters: {charNames.join(", ")}
                      </CardDescription>
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

                      {/* Nano Banana Prompt */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold flex items-center gap-1">
                            <Sparkles className="w-4 h-4 text-yellow-500" />
                            Nano Banana Frame Prompt
                          </p>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(frame.prompt);
                                toast.success("Prompt copied!");
                              }}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (isEditingPrompt) {
                                  handleSavePrompt(frame.sceneNumber);
                                } else {
                                  setPromptEdits((p) => ({ ...p, [frame.sceneNumber]: frame.prompt }));
                                  setEditingPrompt(frame.sceneNumber);
                                }
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              {isEditingPrompt ? "Save" : "Edit"}
                            </Button>
                          </div>
                        </div>

                        {isEditingPrompt ? (
                          <Textarea
                            value={promptEdits[frame.sceneNumber] || ""}
                            onChange={(e) => setPromptEdits((p) => ({ ...p, [frame.sceneNumber]: e.target.value }))}
                            rows={5}
                            className="text-xs font-mono"
                          />
                        ) : (
                          <p className="text-xs font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">
                            {frame.prompt}
                          </p>
                        )}

                        {/* Attach Instructions */}
                        {charNames.length > 0 && (
                          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs">
                            <p className="font-semibold text-primary mb-1">📎 Attach these cast images:</p>
                            {charNames.map((name, i) => (
                              <p key={i}>• {name} — Front Portrait + relevant angle</p>
                            ))}
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Frame Image Uploads */}
                      <div className="space-y-2">
                        <p className="text-sm font-semibold flex items-center gap-1">
                          <ImageIcon className="w-4 h-4" />
                          Generated Frames ({frame.images.filter((i) => i.approved).length}/{frame.images.length} approved)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {frame.images.map((img) => {
                            const inputKey = `frame-${frame.sceneNumber}-${img.id}`;
                            return (
                              <div key={img.id} className="space-y-1.5">
                                <p className="text-xs font-medium">{img.label}</p>
                                <div
                                  className={cn(
                                    "border-2 border-dashed rounded-lg aspect-video flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden",
                                    img.approved ? "border-green-500 bg-green-500/5" : "border-muted-foreground/20 hover:border-primary/50",
                                  )}
                                  onClick={() => fileInputRefs.current[inputKey]?.click()}
                                >
                                  {img.url ? (
                                    <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                                  ) : (
                                    <>
                                      <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                                      <span className="text-[10px] text-muted-foreground">Upload Frame</span>
                                    </>
                                  )}
                                  <input
                                    ref={(el) => { fileInputRefs.current[inputKey] = el; }}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleImageUpload(frame.sceneNumber, img.id, file);
                                      e.target.value = "";
                                    }}
                                  />
                                </div>
                                {img.url && (
                                  <Button
                                    variant={img.approved ? "default" : "outline"}
                                    size="sm"
                                    className="w-full h-7 text-xs gap-1"
                                    onClick={() => handleApproveImage(frame.sceneNumber, img.id)}
                                  >
                                    {img.approved ? <Check className="w-3 h-3" /> : null}
                                    {img.approved ? "Approved" : "Approve"}
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <Separator />

                      {/* QC/QA Checklist */}
                      <div className="space-y-2">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                          QA/QC Gate ({qcCount}/{QC_CHECKLIST_ITEMS.length})
                        </p>
                        <div className="grid gap-2">
                          {QC_CHECKLIST_ITEMS.map((item) => (
                            <label key={item} className="flex items-start gap-2 cursor-pointer">
                              <Checkbox
                                checked={!!frame.qcChecklist[item]}
                                onCheckedChange={() => handleQCToggle(frame.sceneNumber, item)}
                                className="mt-0.5"
                              />
                              <span className="text-xs">{item}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        );
      })}

      {/* Confirm Button */}
      {project.sceneFrames.length > 0 && !project.framesConfirmed && (
        <Button className="w-full gap-2" size="lg" onClick={handleConfirm}>
          <ChevronRight className="w-5 h-5" />
          Approve All Frames & Proceed to Animation
        </Button>
      )}
    </div>
  );
}
