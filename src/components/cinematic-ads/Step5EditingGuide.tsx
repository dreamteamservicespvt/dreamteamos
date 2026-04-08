import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { generateEditingGuide } from "@/services/cinematicAdsService";
import { type EditingGuide } from "@/types/cinematicAds";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Sparkles,
  ClipboardCopy,
  Download,
  ChevronRight,
  Film,
  Music,
  Type,
  Palette,
  Settings2,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function Step5EditingGuide() {
  const {
    project,
    setEditingGuide,
    confirmEditingGuide,
    setProcessing,
    processing,
    processingMessage,
  } = useCinematicAdsStore();

  const [activeTab, setActiveTab] = useState("assembly");

  if (!project || !project.clientBrief) return null;

  const selectedStory = project.stories.find((s) => s.id === project.selectedStoryId);
  if (!selectedStory) return null;

  const guide = project.editingGuide;

  const handleGenerate = useCallback(async () => {
    if (!project.clientBrief || !selectedStory) return;
    setProcessing(true, "Generating comprehensive editing guide…");
    try {
      const generated = await generateEditingGuide(selectedStory, project.animationPrompts, project.clientBrief);
      setEditingGuide(generated);
      toast.success("Editing guide generated!");
    } catch (err: any) {
      console.error("Editing guide failed:", err);
      toast.error(err?.message || "Failed to generate editing guide");
    } finally {
      setProcessing(false);
    }
  }, [project, selectedStory, setEditingGuide, setProcessing]);

  const handleCopyAll = useCallback(() => {
    if (!guide) return;
    const text = JSON.stringify(guide, null, 2);
    navigator.clipboard.writeText(text);
    toast.success("Full editing guide copied to clipboard!");
  }, [guide]);

  const handleDownloadPDF = useCallback(() => {
    if (!guide) return;
    // Create a rich text blob for download
    const content = formatGuideAsText(guide);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `editing-guide-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Guide downloaded!");
  }, [guide]);

  const handleConfirm = useCallback(() => {
    confirmEditingGuide();
    toast.success("Editing guide confirmed! Proceeding to Review & Delivery.");
  }, [confirmEditingGuide]);

  // Generate
  if (!guide) {
    return (
      <div className="space-y-6">
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
                  Generate Complete Editing Guide
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Top Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" className="gap-1" onClick={handleCopyAll}>
          <ClipboardCopy className="w-3.5 h-3.5" /> Copy Full Guide
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={handleDownloadPDF}>
          <Download className="w-3.5 h-3.5" /> Download
        </Button>
      </div>

      {/* Tabbed Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="assembly" className="gap-1 text-xs">
            <Film className="w-3.5 h-3.5" /> Assembly
          </TabsTrigger>
          <TabsTrigger value="audio" className="gap-1 text-xs">
            <Music className="w-3.5 h-3.5" /> Audio
          </TabsTrigger>
          <TabsTrigger value="text" className="gap-1 text-xs">
            <Type className="w-3.5 h-3.5" /> Text
          </TabsTrigger>
          <TabsTrigger value="color" className="gap-1 text-xs">
            <Palette className="w-3.5 h-3.5" /> Color
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1 text-xs">
            <Settings2 className="w-3.5 h-3.5" /> Export
          </TabsTrigger>
        </TabsList>

        {/* Assembly & Sequencing */}
        <TabsContent value="assembly" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4" /> Assembly & Sequencing Order
              </CardTitle>
              <CardDescription className="text-xs">
                Arrange clips in this order for the final timeline
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-12">#</TableHead>
                    <TableHead className="text-xs">Clip / Scene</TableHead>
                    <TableHead className="text-xs">Duration</TableHead>
                    <TableHead className="text-xs">Transition</TableHead>
                    <TableHead className="text-xs">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guide.assembly.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs font-mono">{idx + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{item.clipLabel}</TableCell>
                      <TableCell className="text-xs">{item.duration}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{item.transition}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.notes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audio Layering */}
        <TabsContent value="audio" className="space-y-4 mt-4">
          {guide.audioLayers.map((layer, idx) => (
            <Card key={idx}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Music className="w-4 h-4" /> {layer.type.toUpperCase()}
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px]">
                    {layer.startTime} → {layer.endTime}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Description</span>
                    <span>{layer.description}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Volume</span>
                    <span>{layer.volume}</span>
                  </div>
                  {layer.fadeIn && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fade In</span>
                      <span>{layer.fadeIn}</span>
                    </div>
                  )}
                  {layer.fadeOut && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fade Out</span>
                      <span>{layer.fadeOut}</span>
                    </div>
                  )}
                  {layer.notes && (
                    <p className="text-muted-foreground mt-1">{layer.notes}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Text Overlays */}
        <TabsContent value="text" className="space-y-4 mt-4">
          {guide.textOverlays.map((overlay, idx) => (
            <Card key={idx}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{overlay.text}</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{overlay.timing}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Font</span>
                    <span className="font-medium">{overlay.font}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Size</span>
                    <span className="font-medium">{overlay.size}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Position</span>
                    <span className="font-medium">{overlay.position}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Color</span>
                    <div className="flex items-center gap-1">
                      <div
                        className="w-3 h-3 rounded-sm border"
                        style={{ backgroundColor: overlay.color }}
                      />
                      <span className="font-mono">{overlay.color}</span>
                    </div>
                  </div>
                  {overlay.animation && (
                    <div>
                      <span className="text-muted-foreground block">Animation</span>
                      <span className="font-medium">{overlay.animation}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Color Grading */}
        <TabsContent value="color" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Palette className="w-4 h-4" /> Color Grading Specification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 text-xs">
                {guide.colorGrading && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-muted-foreground block mb-1">Overall Look</span>
                        <span>{guide.colorGrading.overallLook}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-1">Temperature</span>
                        <span>{guide.colorGrading.temperature}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-1">Contrast</span>
                        <span>{guide.colorGrading.contrast}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-1">Saturation</span>
                        <span>{guide.colorGrading.saturation}</span>
                      </div>
                    </div>
                    {guide.colorGrading.highlights && (
                      <div>
                        <span className="text-muted-foreground block mb-1">Highlights</span>
                        <span>{guide.colorGrading.highlights}</span>
                      </div>
                    )}
                    {guide.colorGrading.shadows && (
                      <div>
                        <span className="text-muted-foreground block mb-1">Shadows</span>
                        <span>{guide.colorGrading.shadows}</span>
                      </div>
                    )}
                    {guide.colorGrading.notes && (
                      <div>
                        <span className="text-muted-foreground block mb-1">Additional Notes</span>
                        <p className="text-muted-foreground">{guide.colorGrading.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Settings */}
        <TabsContent value="export" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="w-4 h-4" /> Export Settings per Platform
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Platform</TableHead>
                    <TableHead className="text-xs">Resolution</TableHead>
                    <TableHead className="text-xs">Frame Rate</TableHead>
                    <TableHead className="text-xs">Codec</TableHead>
                    <TableHead className="text-xs">Bitrate</TableHead>
                    <TableHead className="text-xs">Format</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guide.exportSettings.map((setting, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs font-medium">{setting.platform}</TableCell>
                      <TableCell className="text-xs font-mono">{setting.resolution}</TableCell>
                      <TableCell className="text-xs">{setting.frameRate}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{setting.codec}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{setting.bitrate}</TableCell>
                      <TableCell className="text-xs font-mono">{setting.format}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm */}
      {!project.editingGuideConfirmed && (
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 gap-2" onClick={handleGenerate} disabled={processing}>
            <Sparkles className="w-4 h-4" /> Regenerate
          </Button>
          <Button className="flex-1 gap-2" size="lg" onClick={handleConfirm}>
            <ChevronRight className="w-5 h-5" />
            Confirm Guide & Proceed to Review
          </Button>
        </div>
      )}
    </motion.div>
  );
}

function formatGuideAsText(guide: EditingGuide): string {
  let text = "=== EDITING GUIDE ===\n\n";

  text += "--- ASSEMBLY & SEQUENCING ---\n";
  guide.assembly.forEach((item, idx) => {
    text += `${idx + 1}. ${item.clipLabel} | ${item.duration} | Transition: ${item.transition} | ${item.notes}\n`;
  });

  text += "\n--- AUDIO LAYERS ---\n";
  guide.audioLayers.forEach((layer) => {
    text += `[${layer.type.toUpperCase()}] ${layer.description} | ${layer.startTime}-${layer.endTime} | Vol: ${layer.volume}\n`;
  });

  text += "\n--- TEXT OVERLAYS ---\n";
  guide.textOverlays.forEach((overlay) => {
    text += `"${overlay.text}" | Font: ${overlay.font} ${overlay.size} | Position: ${overlay.position} | Color: ${overlay.color} | ${overlay.timing}\n`;
  });

  if (guide.colorGrading) {
    text += "\n--- COLOR GRADING ---\n";
    text += `Look: ${guide.colorGrading.overallLook} | Temp: ${guide.colorGrading.temperature} | Contrast: ${guide.colorGrading.contrast} | Sat: ${guide.colorGrading.saturation}\n`;
  }

  text += "\n--- EXPORT SETTINGS ---\n";
  guide.exportSettings.forEach((s) => {
    text += `${s.platform}: ${s.resolution} @ ${s.frameRate} | ${s.codec} | ${s.bitrate} | ${s.format}\n`;
  });

  return text;
}
