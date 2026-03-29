import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { extractCharacters } from "@/services/cinematicAdsService";
import type { CastCharacter, CharacterImage } from "@/types/cinematicAds";
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

export default function Step2Casting() {
  const {
    project,
    setCharacters,
    updateCharacter,
    confirmCast,
    setProcessing,
    processing,
    processingMessage,
  } = useCinematicAdsStore();

  const [expandedChar, setExpandedChar] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [promptEdits, setPromptEdits] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  if (!project || !project.clientBrief) return null;

  const selectedStory = project.stories.find((s) => s.id === project.selectedStoryId);
  if (!selectedStory) return null;

  const handleExtract = useCallback(async () => {
    if (!project.clientBrief || !selectedStory) return;
    setProcessing(true, "Analyzing story and identifying characters…");
    try {
      const chars = await extractCharacters(selectedStory, project.clientBrief);
      setCharacters(chars);
      toast.success(`${chars.length} characters identified!`);
    } catch (err: any) {
      console.error("Character extraction failed:", err);
      toast.error(err?.message || "Failed to identify characters");
    } finally {
      setProcessing(false);
    }
  }, [project, selectedStory, setCharacters, setProcessing]);

  const handleImageUpload = useCallback(
    (charId: string, imageId: string, file: File) => {
      const char = project.characters.find((c) => c.id === charId);
      if (!char) return;
      const url = URL.createObjectURL(file);
      const updatedImages = char.images.map((img) =>
        img.id === imageId
          ? {
              ...img,
              file,
              url,
              versions: [...img.versions, { file, url, timestamp: Date.now() }],
            }
          : img,
      );
      updateCharacter(charId, { images: updatedImages });
    },
    [project, updateCharacter],
  );

  const handleApproveImage = useCallback(
    (charId: string, imageId: string, approved: boolean) => {
      const char = project.characters.find((c) => c.id === charId);
      if (!char) return;
      const updatedImages = char.images.map((img) =>
        img.id === imageId ? { ...img, approved } : img,
      );
      updateCharacter(charId, { images: updatedImages });
    },
    [project, updateCharacter],
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

  const allImagesApproved = project.characters.length > 0 &&
    project.characters.every((c) =>
      c.images.filter((img) => img.type !== "expression").every((img) => img.approved),
    );

  const handleConfirm = useCallback(() => {
    if (!allImagesApproved) {
      toast.error("Please approve all required character images before proceeding");
      return;
    }
    confirmCast();
    toast.success("Cast approved! Proceeding to Frame Generation.");
  }, [allImagesApproved, confirmCast]);

  return (
    <div className="space-y-6">
      {/* Extract Characters Button */}
      {project.characters.length === 0 && (
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
      {project.characters.map((char, idx) => {
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
                            <ImageSlot
                              key={img.id}
                              image={img}
                              charId={char.id}
                              onUpload={handleImageUpload}
                              onApprove={handleApproveImage}
                              fileInputRefs={fileInputRefs}
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
      {project.characters.length > 0 && !project.castConfirmed && (
        <Button className="w-full gap-2" size="lg" onClick={handleConfirm}>
          <ChevronRight className="w-5 h-5" />
          Approve All Cast & Proceed to Frame Generation
        </Button>
      )}
    </div>
  );
}

function ImageSlot({
  image,
  charId,
  onUpload,
  onApprove,
  fileInputRefs,
}: {
  image: CharacterImage;
  charId: string;
  onUpload: (charId: string, imageId: string, file: File) => void;
  onApprove: (charId: string, imageId: string, approved: boolean) => void;
  fileInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
}) {
  const inputKey = `${charId}-${image.id}`;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{image.label}</p>
      <div
        className={cn(
          "border-2 border-dashed rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden",
          image.approved
            ? "border-green-500 bg-green-500/5"
            : image.url
              ? "border-muted-foreground/30"
              : "border-muted-foreground/20 hover:border-primary/50",
        )}
        onClick={() => fileInputRefs.current[inputKey]?.click()}
      >
        {image.url ? (
          <img src={image.url} alt={image.label} className="w-full h-full object-cover" />
        ) : (
          <>
            <Upload className="w-6 h-6 text-muted-foreground mb-1" />
            <span className="text-[10px] text-muted-foreground">Upload</span>
          </>
        )}
        <input
          ref={(el) => { fileInputRefs.current[inputKey] = el; }}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(charId, image.id, file);
            e.target.value = "";
          }}
        />
      </div>
      {image.url && (
        <div className="flex gap-1">
          <Button
            variant={image.approved ? "default" : "outline"}
            size="sm"
            className="flex-1 h-7 text-xs gap-1"
            onClick={() => onApprove(charId, image.id, !image.approved)}
          >
            {image.approved ? <Check className="w-3 h-3" /> : null}
            {image.approved ? "Approved" : "Approve"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => fileInputRefs.current[inputKey]?.click()}
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
