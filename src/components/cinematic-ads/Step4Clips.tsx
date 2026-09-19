import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { generateClips, regenerateClip } from "@/services/cinematicAdsService";
import {
  CLIP_TYPES,
  MAX_STORYBOARD_PANELS,
  MIN_STORYBOARD_PANELS,
  QC_CHECKLIST_ITEMS,
  describeAdFormat,
  type Clip,
  type ClipType,
} from "@/types/cinematicAds";
import { clampPanelCount, clipIsMissingCameraMove, formatClipPacket } from "@/utils/cinematicAds";
import AssetUploadTile from "./AssetUploadTile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Copy,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Sparkles,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

/**
 * The clips step.
 *
 * Frames and animation prompts used to live on two separate screens, so building one clip
 * meant bouncing between them to collect its image prompt, its animation prompt and its
 * words. A clip is one unit of work, so it is one card here.
 */
export default function Step4Clips() {
  const {
    project,
    setClips,
    updateClip,
    setClipImage,
    toggleClipImageApproval,
    setClipVideo,
    toggleClipQc,
    confirmClips,
    setProcessing,
    processing,
    processingMessage,
  } = useCinematicAdsStore();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const story = project?.stories.find((s) => s.id === project?.selectedStoryId);

  const copy = useCallback((key: string, text: string, what = "Copied") => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    toast.success(what);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!project?.clientBrief || !story) return;
    setProcessing(true, "Cutting the ad into clips and writing every prompt…");
    try {
      const clips = await generateClips(story, project.characters, project.clientBrief, project.adFormat);
      setClips(clips);
      setExpanded(clips[0]?.id ?? null);
      toast.success(`${clips.length} clips ready`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate the clips");
    } finally {
      setProcessing(false);
    }
  }, [project, story, setClips, setProcessing]);

  /**
   * Change one clip's type and rewrite only that clip.
   *
   * Regenerating the whole set would throw away every frame already generated and
   * approved for the other clips.
   */
  const handleTypeChange = useCallback(
    async (clip: Clip, clipType: ClipType, panelCount?: number) => {
      if (!project?.clientBrief || !story) return;
      if (clipType === clip.clipType && panelCount === clip.panelCount) return;

      setRegeneratingId(clip.id);
      try {
        const fresh = await regenerateClip(
          clip,
          clipType,
          panelCount,
          story,
          project.characters,
          project.clientBrief,
          project.adFormat,
        );
        updateClip(clip.id, fresh);
        toast.success(`Clip ${clip.clipNumber} rewritten as ${CLIP_TYPES.find((t) => t.value === clipType)?.label}`);
      } catch (err: any) {
        toast.error(err?.message || "Could not rewrite that clip");
      } finally {
        setRegeneratingId(null);
      }
    },
    [project, story, updateClip],
  );

  const handleConfirm = useCallback(() => {
    confirmClips();
    toast.success("Clips locked — on to the editing guide.");
  }, [confirmClips]);

  // The guard sits below every hook — see the note in Step 1 about conditional hooks.
  if (!project || !project.clientBrief) return null;

  if (!story) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No story selected yet. Go back to the Story step and pick one.
        </CardContent>
      </Card>
    );
  }

  const clips = project.clips || [];
  const approvedCount = clips.filter((c) => c.approved).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Film className="w-5 h-5" />
            Clips
          </CardTitle>
          <CardDescription>
            Every clip carries its image prompt, its animation prompt and its voice over in one place. Generate the
            frames in your image tool, animate them, and bring both back here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{story.title}</Badge>
            <Badge variant="outline">{describeAdFormat(project.adFormat)}</Badge>
            {clips.length > 0 && (
              <Badge variant="outline">
                {approvedCount}/{clips.length} approved
              </Badge>
            )}
          </div>

          <Button className="w-full gap-2" size="lg" onClick={handleGenerate} disabled={processing}>
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {processingMessage}
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                {clips.length > 0 ? "Regenerate all clips" : "Generate clips for the whole ad"}
              </>
            )}
          </Button>
          {clips.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Regenerating replaces every clip and clears the frames you have uploaded. To change just one clip, use its
              type selector instead.
            </p>
          )}
        </CardContent>
      </Card>

      {clips.map((clip) => (
        <ClipCard
          key={clip.id}
          clip={clip}
          expanded={expanded === clip.id}
          regenerating={regeneratingId === clip.id}
          copiedKey={copiedKey}
          onToggleExpanded={() => setExpanded(expanded === clip.id ? null : clip.id)}
          onTypeChange={handleTypeChange}
          onCopy={copy}
          onUpdate={updateClip}
          onImageUploaded={setClipImage}
          onToggleImageApproval={toggleClipImageApproval}
          onVideoUploaded={setClipVideo}
          onToggleQc={toggleClipQc}
        />
      ))}

      {clips.length > 0 && !project.clipsConfirmed && (
        <Button className="w-full gap-2" size="lg" onClick={handleConfirm}>
          <CheckCircle2 className="w-5 h-5" />
          Lock clips and continue to the Editing Guide
        </Button>
      )}
    </div>
  );
}

interface ClipCardProps {
  clip: Clip;
  expanded: boolean;
  regenerating: boolean;
  copiedKey: string | null;
  onToggleExpanded: () => void;
  onTypeChange: (clip: Clip, clipType: ClipType, panelCount?: number) => void;
  onCopy: (key: string, text: string, what?: string) => void;
  onUpdate: (clipId: string, patch: Partial<Clip>) => void;
  onImageUploaded: (clipId: string, imagePromptId: string, url: string) => void;
  onToggleImageApproval: (clipId: string, imagePromptId: string) => void;
  onVideoUploaded: (clipId: string, url: string) => void;
  onToggleQc: (clipId: string, item: string) => void;
}

function ClipCard({
  clip,
  expanded,
  regenerating,
  copiedKey,
  onToggleExpanded,
  onTypeChange,
  onCopy,
  onUpdate,
  onImageUploaded,
  onToggleImageApproval,
  onVideoUploaded,
  onToggleQc,
}: ClipCardProps) {
  const [panels, setPanels] = useState(clip.panelCount ?? MIN_STORYBOARD_PANELS);
  const missingCamera = clipIsMissingCameraMove(clip);
  const qcDone = QC_CHECKLIST_ITEMS.filter((item) => clip.qcChecklist[item]).length;

  return (
    <Card className={cn("transition-colors", clip.approved && "border-primary/50 ring-1 ring-primary/20")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge variant="secondary" className="text-[10px]">
                Clip {clip.clipNumber}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {clip.duration}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {clip.aspectRatio}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase">
                {clip.platform} · {clip.mode.replace(/_/g, " ")}
              </Badge>
              {clip.approved && (
                <Badge className="text-[10px] bg-primary">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Approved
                </Badge>
              )}
            </div>
            <CardTitle className="text-base">{clip.title}</CardTitle>
            <CardDescription className="mt-0.5">
              Scene{clip.sceneNumbers.length > 1 ? "s" : ""} {clip.sceneNumbers.join(", ")}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onToggleExpanded}>
            <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
          </Button>
        </div>

        {/*
          A clip with no camera movement animates as a locked-off tripod shot, which is the
          single clearest tell of an AI-made ad. Surfaced here rather than discovered after
          the generation has been paid for.
        */}
        {missingCamera && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 mt-2 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <p>
              No camera movement in this clip — it will animate as a static shot. Add a move to the animation prompt
              (dolly in, crane down, handheld follow) before you generate it.
            </p>
          </div>
        )}
      </CardHeader>

      {/* Clip type — the operator's call, not the AI's */}
      <CardContent className="pt-0 space-y-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clip type</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {CLIP_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                disabled={regenerating}
                onClick={() => onTypeChange(clip, t.value, t.value === "storyboard" ? panels : undefined)}
                className={cn(
                  "text-left rounded-lg border p-2.5 transition-colors min-w-0 disabled:opacity-60",
                  clip.clipType === t.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium min-w-0 truncate">{t.label}</span>
                  {clip.clipType === t.value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t.hint}</p>
                <p className="text-[10px] text-muted-foreground/80 mt-0.5">{t.imageCount}</p>
              </button>
            ))}
          </div>

          {clip.clipType === "storyboard" && (
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <p className="text-xs font-medium">Panels in the image</p>
                <Input
                  type="number"
                  min={MIN_STORYBOARD_PANELS}
                  max={MAX_STORYBOARD_PANELS}
                  value={panels}
                  disabled={regenerating}
                  onChange={(e) => setPanels(clampPanelCount(Number(e.target.value)))}
                  className="w-20"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={regenerating || panels === clip.panelCount}
                onClick={() => onTypeChange(clip, "storyboard", panels)}
              >
                Rewrite with {panels} panels
              </Button>
              <p className="text-xs text-muted-foreground w-full">
                {MIN_STORYBOARD_PANELS}–{MAX_STORYBOARD_PANELS} panels. Past {MAX_STORYBOARD_PANELS} the image model
                stops following the board.
              </p>
            </div>
          )}

          {regenerating && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Rewriting this clip…
            </p>
          )}
        </div>

        <Button
          variant="secondary"
          className="w-full gap-2"
          onClick={() => onCopy(`packet-${clip.id}`, formatClipPacket(clip), "Whole clip packet copied")}
        >
          {copiedKey === `packet-${clip.id}` ? <Check className="w-4 h-4" /> : <ClipboardCopy className="w-4 h-4" />}
          {copiedKey === `packet-${clip.id}` ? "Copied" : "Copy whole clip packet"}
        </Button>
      </CardContent>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <CardContent className="pt-0 space-y-4">
              <Separator />

              {/* Image prompts + the frames they produce */}
              <div className="space-y-3">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4" />
                  {clip.imagePrompts.length > 1 ? "Image Prompts" : "Image Prompt"}
                </p>

                {clip.imagePrompts.map((ip) => (
                  <div key={ip.id} className="rounded-lg border p-3 space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium min-w-0">{ip.label}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs shrink-0"
                        onClick={() =>
                          onCopy(
                            `img-${ip.id}`,
                            ip.attachInstructions ? `${ip.prompt}\n\nAttach: ${ip.attachInstructions}` : ip.prompt,
                            "Image prompt copied",
                          )
                        }
                      >
                        {copiedKey === `img-${ip.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedKey === `img-${ip.id}` ? "Copied" : "Copy"}
                      </Button>
                    </div>

                    <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed rounded bg-muted/50 p-2">
                      {ip.prompt || "(empty — regenerate this clip)"}
                    </pre>

                    {ip.attachInstructions && (
                      <p className="text-xs">
                        <span className="font-medium text-muted-foreground">Attach:</span> {ip.attachInstructions}
                      </p>
                    )}

                    <AssetUploadTile
                      label={ip.label}
                      url={ip.imageUrl}
                      approved={ip.approved}
                      onUploaded={(url) => onImageUploaded(clip.id, ip.id, url)}
                      onToggleApproved={() => onToggleImageApproval(clip.id, ip.id)}
                      onClear={() => onImageUploaded(clip.id, ip.id, "")}
                    />
                  </div>
                ))}
              </div>

              {/* Animation prompt */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <Video className="w-4 h-4" />
                    Animation Prompt
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs shrink-0"
                    onClick={() =>
                      onCopy(
                        `anim-${clip.id}`,
                        [
                          clip.animationPrompt,
                          clip.cameraMove ? `Camera: ${clip.cameraMove}` : "",
                          clip.negativePrompt ? `Negative: ${clip.negativePrompt}` : "",
                        ]
                          .filter(Boolean)
                          .join("\n"),
                        "Animation prompt copied",
                      )
                    }
                  >
                    {copiedKey === `anim-${clip.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === `anim-${clip.id}` ? "Copied" : "Copy"}
                  </Button>
                </div>

                <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed rounded bg-muted/50 p-2">
                  {clip.animationPrompt || "(empty — regenerate this clip)"}
                </pre>

                <div className="space-y-1 text-xs">
                  <p className={cn(missingCamera && "text-amber-600")}>
                    <span className="font-medium text-muted-foreground">Camera:</span>{" "}
                    {clip.cameraMove || "not specified"}
                  </p>
                  {clip.negativePrompt && (
                    <p>
                      <span className="font-medium text-muted-foreground">Negative:</span> {clip.negativePrompt}
                    </p>
                  )}
                </div>
              </div>

              {/* The words */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <Mic className="w-4 h-4" />
                    Voice Over
                  </span>
                  {clip.voScript && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs shrink-0"
                      onClick={() => onCopy(`vo-${clip.id}`, clip.voScript, "Voice over copied")}
                    >
                      {copiedKey === `vo-${clip.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedKey === `vo-${clip.id}` ? "Copied" : "Copy"}
                    </Button>
                  )}
                </div>
                <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                  {clip.voScript || "(this clip is silent)"}
                </pre>
                {clip.voTone && <p className="text-xs text-muted-foreground">Tone: {clip.voTone}</p>}
              </div>

              {/* The animated clip itself */}
              <div className="space-y-2">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Film className="w-4 h-4" />
                  Animated Clip
                </p>
                <AssetUploadTile
                  label={`Clip ${clip.clipNumber} video`}
                  url={clip.clipUrl}
                  kind="video"
                  accept="video/*"
                  onUploaded={(url) => onVideoUploaded(clip.id, url)}
                  onClear={() => onVideoUploaded(clip.id, "")}
                />
              </div>

              {/* QC */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  Quality check ({qcDone}/{QC_CHECKLIST_ITEMS.length})
                </p>
                <div className="space-y-1.5">
                  {QC_CHECKLIST_ITEMS.map((item) => (
                    <label key={item} className="flex items-start gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={!!clip.qcChecklist[item]}
                        onCheckedChange={() => onToggleQc(clip.id, item)}
                        className="mt-0.5"
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Button
                variant={clip.approved ? "default" : "outline"}
                className="w-full gap-2"
                onClick={() => onUpdate(clip.id, { approved: !clip.approved })}
              >
                <CheckCircle2 className="w-4 h-4" />
                {clip.approved ? "Approved — click to unapprove" : "Approve this clip"}
              </Button>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
