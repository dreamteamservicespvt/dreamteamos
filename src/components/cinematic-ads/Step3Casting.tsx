import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { extractCharacters } from "@/services/cinematicAdsService";
import type { CastCharacter } from "@/types/cinematicAds";
import AssetUploadTile from "./AssetUploadTile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Sparkles,
  Upload,
  Check,
  X,
  Pencil,
  User,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export default function Step3Casting() {
  const {
    project,
    setCharacters,
    updateCharacter,
    setCharacterImage,
    toggleCharacterImageApproval,
    confirmCast,
    setProcessing,
    processing,
    processingMessage,
  } = useCinematicAdsStore();

  const [expandedChar, setExpandedChar] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [promptEdits, setPromptEdits] = useState<Record<string, string>>({});


  const selectedStory = project?.stories.find((s) => s.id === project?.selectedStoryId);

  const handleExtract = useCallback(async () => {
    if (!project?.clientBrief || !selectedStory) return;
    setProcessing(true, "Analyzing story and identifying characters…");
    try {
      const chars = await extractCharacters(selectedStory, project.clientBrief, project.adFormat);
      setCharacters(chars);
      toast.success(`${chars.length} characters identified!`);
    } catch (err: any) {
      console.error("Character extraction failed:", err);
      toast.error(err?.message || "Failed to identify characters");
    } finally {
      setProcessing(false);
    }
  }, [project, selectedStory, setCharacters, setProcessing]);

  /**
   * Cast references are hosted, not held in memory.
   *
   * These used to be `URL.createObjectURL` blobs, which die with the tab — so the faces
   * the whole ad depends on vanished on a refresh, along with their approvals.
   */
  const handleImageUploaded = useCallback(
    (charId: string, imageId: string, url: string) => {
      setCharacterImage(charId, imageId, url);
    },
    [setCharacterImage],
  );

  const handleSavePrompt = useCallback(
    (charId: string) => {
      const newPrompt = promptEdits[charId];
      if (newPrompt !== undefined) {
        updateCharacter(charId, { nanoBananaPrompt: newPrompt });
        setEditingPrompt(null);
        toast.success("Prompt updated");
      }
    },
    [promptEdits, updateCharacter],
  );

  const allImagesApproved = project?.characters.length > 0 &&
    project?.characters.every((c) =>
      c.images.filter((img) => img.type !== "expression").every((img) => img.approved),
    );

  const handleConfirm = useCallback(() => {
    if (!allImagesApproved) {
      toast.error("Please approve all required character images before proceeding");
      return;
    }
    confirmCast();
    toast.success("Cast approved — on to the clips.");
  }, [allImagesApproved, confirmCast]);

  /**
   * The guard sits BELOW every hook, and must stay there.
   *
   * It used to be the first statement in the component, above a row of `useCallback`s — so the
   * moment the project or its brief was cleared while this step was on screen, React saw fewer
   * hooks than the render before and threw, taking the whole page down with it. Hooks run
   * unconditionally; only the markup is conditional.
   */
  if (!project || !project?.clientBrief) return null;
  if (!selectedStory) return null;

  return (
    <div className="space-y-6">
      {/* Extract Characters Button */}
      {project?.characters.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <Button className="w-full gap-2" size="lg" onClick={handleExtract} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {processingMessage}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Identify Characters from Story
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Character Cards */}
      {project?.characters.map((char, idx) => {
        const isExpanded = expandedChar === char.id;
        const isEditingPrompt = editingPrompt === char.id;

        return (
          <motion.div
            key={char.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
          >
            <Card>
              <CardHeader className="cursor-pointer" onClick={() => setExpandedChar(isExpanded ? null : char.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{char.role}</CardTitle>
                      <CardDescription className="text-xs line-clamp-1">
                        {char.physicalDescription}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {char.images.filter((i) => i.approved).length}/{char.images.length} approved
                    </Badge>
                    <ChevronDown className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")} />
                  </div>
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

                      {/* Character Sheet */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Physical Description</p>
                          <p>{char.physicalDescription}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Clothing</p>
                          <p>{char.clothingDescription}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Hairstyle</p>
                          <p>{char.hairstyle}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Accessories</p>
                          <p>{char.accessories || "None"}</p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Personality Notes</p>
                          <p>{char.personalityNotes}</p>
                        </div>
                      </div>

                      <Separator />

                      {/* Nano Banana Prompt */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold flex items-center gap-1">
                            <Sparkles className="w-4 h-4 text-yellow-500" />
                            Nano Banana Prompt
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isEditingPrompt) {
                                handleSavePrompt(char.id);
                              } else {
                                setPromptEdits((p) => ({ ...p, [char.id]: char.nanoBananaPrompt }));
                                setEditingPrompt(char.id);
                              }
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" />
                            {isEditingPrompt ? "Save" : "Edit Prompt"}
                          </Button>
                        </div>

                        {isEditingPrompt ? (
                          <Textarea
                            value={promptEdits[char.id] || ""}
                            onChange={(e) => setPromptEdits((p) => ({ ...p, [char.id]: e.target.value }))}
                            rows={4}
                            className="text-sm font-mono"
                          />
                        ) : (
                          <p className="text-xs font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">
                            {char.nanoBananaPrompt}
                          </p>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(char.nanoBananaPrompt);
                            toast.success("Prompt copied!");
                          }}
                        >
                          Copy Prompt
                        </Button>
                      </div>

                      <Separator />

                      {/* Image Upload Grid */}
                      <div className="space-y-2">
                        <p className="text-sm font-semibold flex items-center gap-1">
                          <ImageIcon className="w-4 h-4" />
                          Character Images
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {char.images.map((img) => (
                            <AssetUploadTile
                              key={img.id}
                              label={img.label}
                              url={img.url}
                              approved={img.approved}
                              onUploaded={(url) => handleImageUploaded(char.id, img.id, url)}
                              onToggleApproved={() => toggleCharacterImageApproval(char.id, img.id)}
                              onClear={() => handleImageUploaded(char.id, img.id, "")}
                            />
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
      {project?.characters.length > 0 && !project?.castConfirmed && (
        <Button className="w-full gap-2" size="lg" onClick={handleConfirm}>
          <ChevronRight className="w-5 h-5" />
          Approve cast and continue to Clips
        </Button>
      )}
    </div>
  );
}
