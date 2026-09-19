import { useCallback, useState } from "react";
import { useCinematicAdsStore, castingIsSkipped } from "@/store/cinematicAdsStore";
import { generateStoryboardPrompts } from "@/services/cinematicAdsService";
import { MAX_STORYBOARD_PANELS, describeAdFormat } from "@/types/cinematicAds";
import AssetUploadTile from "./AssetUploadTile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Check, CheckCircle2, Copy, Info, LayoutGrid, Loader2, Mic, Sparkles } from "lucide-react";
import { toast } from "sonner";

/**
 * The storyboard gate.
 *
 * One board showing the whole ad before any per-clip work begins. It exists so a story
 * that reads well on paper but falls apart as pictures gets caught here — before anyone
 * pays to generate cast references and a dozen frames from it.
 */
export default function Step2StoryboardPreview() {
  const {
    project,
    setStoryboardBoards,
    setBoardImage,
    setStoryboardChangeNote,
    approveStoryboard,
    sendStoryboardBack,
    setProcessing,
    processing,
    processingMessage,
  } = useCinematicAdsStore();

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const story = project?.stories.find((s) => s.id === project?.selectedStoryId);

  const handleGenerate = useCallback(async () => {
    if (!project?.clientBrief || !story) return;
    setProcessing(true, "Writing the storyboard prompt…");
    try {
      const boards = await generateStoryboardPrompts(story, project.clientBrief, project.adFormat);
      setStoryboardBoards(boards);
      toast.success(boards.length > 1 ? `${boards.length} boards ready` : "Storyboard prompt ready");
    } catch (err: any) {
      toast.error(err?.message || "Failed to write the storyboard prompt");
    } finally {
      setProcessing(false);
    }
  }, [project, story, setStoryboardBoards, setProcessing]);

  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Prompt copied");
  }, []);

  const handleApprove = useCallback(() => {
    approveStoryboard();
    toast.success(
      castingIsSkipped(project)
        ? "Board approved — this ad has no characters, so casting is skipped."
        : "Board approved — on to casting.",
    );
  }, [approveStoryboard, project]);

  const handleSendBack = useCallback(() => {
    sendStoryboardBack();
    toast.info("Back to the story. Your note is saved with the project.");
  }, [sendStoryboardBack]);

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

  const boards = project.storyboard?.boards || [];
  const allBoardsUploaded = boards.length > 0 && boards.every((b) => b.imageUrl);

  return (
    <div className="space-y-6">
      {/* What we are looking at */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <LayoutGrid className="w-5 h-5" />
            Storyboard Preview
          </CardTitle>
          <CardDescription>
            See the whole ad as one board before committing to frames and clips. Generate the prompt, run it in your
            image tool, and upload the board back here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{story.title}</Badge>
            <Badge variant="outline">{story.numberOfScenes} scenes</Badge>
            <Badge variant="outline">{story.totalDuration}</Badge>
            <Badge variant="outline">{describeAdFormat(project.adFormat)}</Badge>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              A board never holds more than {MAX_STORYBOARD_PANELS} panels. Past that an image model stops following
              the layout, so a longer ad is split across two boards instead.
            </p>
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
                {boards.length > 0 ? "Rewrite the storyboard prompt" : "Generate storyboard prompt"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* The boards */}
      {boards.map((board) => (
        <Card key={board.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <CardTitle className="text-base">{board.label}</CardTitle>
                <CardDescription>
                  Scenes {board.firstScene}–{board.lastScene} · {board.panelCount} panels
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 shrink-0"
                onClick={() => handleCopy(board.id, board.prompt)}
              >
                {copiedId === board.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === board.id ? "Copied" : "Copy prompt"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed rounded-lg bg-muted/50 p-3">
              {board.prompt}
            </pre>

            <AssetUploadTile
              label={board.label}
              url={board.imageUrl}
              onUploaded={(url) => setBoardImage(board.id, url)}
              onClear={() => setBoardImage(board.id, "")}
            />
          </CardContent>
        </Card>
      ))}

      {/* The script, read beside the picture */}
      {story.voScript && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Mic className="w-4 h-4" />
                Voice Over Script
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => handleCopy("vo", story.voScript || "")}
              >
                {copiedId === "vo" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === "vo" ? "Copied" : "Copy"}
              </Button>
            </div>
            <CardDescription>Read this against the board — the words and the pictures have to agree.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{story.voScript}</pre>
          </CardContent>
        </Card>
      )}

      {/* The gate */}
      {boards.length > 0 && !project.storyboardConfirmed && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Does this look right?</CardTitle>
            <CardDescription>
              {allBoardsUploaded
                ? "Approve to carry on, or send it back to the story with a note."
                : "Upload the generated board above so you can judge it before approving."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={project.storyboard?.changeNote || ""}
              onChange={(e) => setStoryboardChangeNote(e.target.value)}
              placeholder="What needs to change? e.g. 'Scene 3 feels staged — make the shop busier and cut the handshake.'"
              className="min-h-[80px]"
            />
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-1.5" onClick={handleSendBack}>
                <ArrowLeft className="w-4 h-4" />
                Story needs changes
              </Button>
              <Button className="gap-1.5 ml-auto" onClick={handleApprove} disabled={!allBoardsUploaded}>
                <CheckCircle2 className="w-4 h-4" />
                Approve board
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {project.storyboardConfirmed && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-6 flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            Board approved.
            {castingIsSkipped(project)
              ? " This ad has no characters, so casting is skipped — go straight to Clips."
              : " Next: casting."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
