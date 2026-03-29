import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { generateStories, refineStory } from "@/services/cinematicAdsService";
import type { Story, StoryTone } from "@/types/cinematicAds";
import { STORY_TONES } from "@/types/cinematicAds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Pencil,
  Share2,
  CheckCircle2,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export default function Step1StoryGeneration() {
  const {
    project,
    setStories,
    updateStory,
    selectStory,
    confirmStory,
    pushStoryVersionHistory,
    setProcessing,
    processing,
    processingMessage,
  } = useCinematicAdsStore();

  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const [refineInputs, setRefineInputs] = useState<Record<string, string>>({});
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  if (!project || !project.clientBrief) return null;

  const handleGenerate = useCallback(
    async (tone?: StoryTone) => {
      if (!project.clientBrief) return;
      // Save current stories to version history
      if (project.stories.length > 0) {
        pushStoryVersionHistory([...project.stories]);
      }
      setProcessing(true, `Generating 5 ${tone ? tone + " " : ""}story variations…`);
      try {
        const stories = await generateStories(project.clientBrief, tone);
        setStories(stories);
        toast.success("5 stories generated!");
      } catch (err: any) {
        console.error("Story generation failed:", err);
        toast.error(err?.message || "Failed to generate stories");
      } finally {
        setProcessing(false);
      }
    },
    [project, setStories, pushStoryVersionHistory, setProcessing],
  );

  const handleRefine = useCallback(
    async (storyId: string) => {
      const story = project.stories.find((s) => s.id === storyId);
      const feedback = refineInputs[storyId];
      if (!story || !feedback?.trim() || !project.clientBrief) return;

      setRefiningId(storyId);
      try {
        const refined = await refineStory(story, project.clientBrief, feedback);
        updateStory(storyId, { ...refined, id: storyId });
        setRefineInputs((p) => ({ ...p, [storyId]: "" }));
        toast.success("Story refined!");
      } catch (err: any) {
        toast.error(err?.message || "Failed to refine story");
      } finally {
        setRefiningId(null);
      }
    },
    [project, refineInputs, updateStory],
  );

  const handleCopy = useCallback((story: Story) => {
    const text = formatStoryText(story);
    navigator.clipboard.writeText(text);
    setCopied(story.id);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleSelect = useCallback(
    (storyId: string) => {
      selectStory(storyId);
      confirmStory();
      toast.success("Story selected! Proceeding to Casting.");
    },
    [selectStory, confirmStory],
  );

  return (
    <div className="space-y-6">
      {/* Generate Controls */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Button
            className="w-full gap-2"
            size="lg"
            onClick={() => handleGenerate()}
            disabled={processing}
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {processingMessage}
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                {project.stories.length > 0 ? "Regenerate All 5 Stories" : "Generate 5 Stories"}
              </>
            )}
          </Button>

          {/* Tone Quick Toggles */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">Tone:</span>
            {STORY_TONES.map((t) => (
              <Button
                key={t.value}
                variant="outline"
                size="sm"
                onClick={() => handleGenerate(t.value)}
                disabled={processing}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {/* Version History */}
          {project.storyVersionHistory.length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowHistory(!showHistory)}>
              <History className="w-4 h-4" />
              {project.storyVersionHistory.length} Previous Version{project.storyVersionHistory.length !== 1 ? "s" : ""}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Version History Panel */}
      <AnimatePresence>
        {showHistory && project.storyVersionHistory.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-sm">Version History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-60 overflow-y-auto">
                {project.storyVersionHistory.map((ver, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/40">
                    <span>Version {i + 1} — {ver.length} stories</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        pushStoryVersionHistory([...project.stories]);
                        setStories(ver);
                        setShowHistory(false);
                        toast.info("Restored previous version");
                      }}
                    >
                      Restore
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Story Cards */}
      {project.stories.length > 0 && (
        <div className="space-y-4">
          {project.stories.map((story, idx) => {
            const isExpanded = expandedStory === story.id;
            const isRefining = refiningId === story.id;
            const isSelected = project.selectedStoryId === story.id;

            return (
              <motion.div
                key={story.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className={cn("transition-colors", isSelected && "border-primary ring-2 ring-primary/20")}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px]">
                            Story {idx + 1}
                          </Badge>
                          {isSelected && (
                            <Badge className="text-[10px] bg-primary">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Selected
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-base">{story.title}</CardTitle>
                        <CardDescription className="mt-1">{story.conceptSummary}</CardDescription>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setExpandedStory(isExpanded ? null : story.id)}>
                        <ChevronDown
                          className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")}
                        />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {story.emotionalArc.split("→").map((arc, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {arc.trim()}
                        </Badge>
                      ))}
                      <Badge variant="outline" className="text-[10px]">
                        {story.totalDuration}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {story.numberOfScenes} scenes
                      </Badge>
                    </div>
                  </CardHeader>

                  {/* Expanded Scene Breakdown */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                      >
                        <CardContent className="pt-0 space-y-3">
                          <Separator />
                          <p className="text-sm font-semibold">Scene Breakdown</p>
                          {story.scenes.map((scene) => (
                            <div key={scene.sceneNumber} className="p-3 rounded-lg bg-muted/40 space-y-1.5 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">Scene {scene.sceneNumber}</span>
                                <Badge variant="secondary" className="text-[10px]">
                                  {scene.duration}
                                </Badge>
                              </div>
                              <div className="grid gap-1 text-xs">
                                <p><span className="font-medium text-muted-foreground">Visual:</span> {scene.visualDescription}</p>
                                <p><span className="font-medium text-muted-foreground">Camera:</span> {scene.cameraDirection}</p>
                                <p><span className="font-medium text-muted-foreground">VO:</span> {scene.voiceoverText}</p>
                                <p><span className="font-medium text-muted-foreground">VO Tone:</span> {scene.voiceoverTone}</p>
                                <p><span className="font-medium text-muted-foreground">Emotion:</span> {scene.emotionalBeat}</p>
                                <p><span className="font-medium text-muted-foreground">Sound:</span> {scene.soundDesignNotes}</p>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Actions */}
                  <CardContent className="pt-0">
                    <Separator className="mb-3" />

                    {/* Refine input */}
                    <div className="flex gap-2 mb-3">
                      <Input
                        placeholder="Type refinement feedback…"
                        value={refineInputs[story.id] || ""}
                        onChange={(e) => setRefineInputs((p) => ({ ...p, [story.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && handleRefine(story.id)}
                        className="text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRefine(story.id)}
                        disabled={isRefining || !refineInputs[story.id]?.trim()}
                      >
                        {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => handleCopy(story)}>
                        {copied === story.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied === story.id ? "Copied" : "Copy"}
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => handleCopy(story)}>
                        <Share2 className="w-3.5 h-3.5" />
                        Share
                      </Button>
                      {!project.storyConfirmed && (
                        <Button size="sm" className="gap-1 ml-auto" onClick={() => handleSelect(story.id)}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Select This Story
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatStoryText(story: Story): string {
  let text = `🎬 ${story.title}\n\n${story.conceptSummary}\n\nEmotional Arc: ${story.emotionalArc}\nDuration: ${story.totalDuration} | ${story.numberOfScenes} scenes\n\n`;
  story.scenes.forEach((s) => {
    text += `--- Scene ${s.sceneNumber} (${s.duration}) ---\n`;
    text += `Visual: ${s.visualDescription}\n`;
    text += `Camera: ${s.cameraDirection}\n`;
    text += `VO: ${s.voiceoverText}\n`;
    text += `VO Tone: ${s.voiceoverTone}\n`;
    text += `Emotion: ${s.emotionalBeat}\n`;
    text += `Sound: ${s.soundDesignNotes}\n\n`;
  });
  return text;
}
