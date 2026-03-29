import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { PIPELINE_STEPS } from "@/types/cinematicAds";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FolderOpen,
  FileText,
  Image as ImageIcon,
  Video,
  BookOpen,
  Package,
  Users,
  Film,
} from "lucide-react";

const SECTION_ICONS: Record<number, any> = {
  0: FileText,
  1: BookOpen,
  2: Users,
  3: ImageIcon,
  4: Video,
  5: Film,
  6: Package,
};

export default function ProjectAssetsPanel() {
  const { project, assetsOpen, setAssetsOpen } = useCinematicAdsStore();

  if (!project) return null;

  return (
    <Sheet open={assetsOpen} onOpenChange={setAssetsOpen}>
      <SheetContent side="right" className="w-[360px] sm:w-[400px] p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-sm flex items-center gap-2">
            <FolderOpen className="w-4 h-4" /> Project Assets
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-70px)]">
          <div className="px-4 pb-4 space-y-4">
            {/* Step 0: Client Materials */}
            <AssetSection step={0} title="Client Materials">
              {project.uploadedFiles.length > 0 ? (
                <div className="space-y-1">
                  {project.uploadedFiles.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-xs py-1">
                      <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="truncate flex-1">{f.name}</span>
                      <Badge variant="outline" className="text-[9px]">{f.category}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState />
              )}
            </AssetSection>

            {/* Step 1: Approved Story */}
            <AssetSection step={1} title="Approved Story">
              {project.selectedStoryId ? (
                <div className="text-xs space-y-1">
                  {project.stories
                    .filter((s) => s.id === project.selectedStoryId)
                    .map((s) => (
                      <div key={s.id}>
                        <p className="font-medium">{s.title}</p>
                        <p className="text-muted-foreground line-clamp-2">{s.conceptSummary}</p>
                        <Badge variant="secondary" className="text-[9px] mt-1">{s.scenes.length} scenes</Badge>
                      </div>
                    ))}
                </div>
              ) : (
                <EmptyState />
              )}
            </AssetSection>

            {/* Step 2: Cast Gallery */}
            <AssetSection step={2} title="Cast Gallery">
              {project.characters.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {project.characters.map((char) => {
                    const approvedImg = char.images.find((img) => img.approved && img.url);
                    return (
                      <div key={char.id} className="text-center">
                        {approvedImg ? (
                          <img
                            src={approvedImg.url!}
                            alt={char.role}
                            className="w-full aspect-square rounded-lg border object-cover"
                          />
                        ) : (
                          <div className="w-full aspect-square rounded-lg border bg-muted flex items-center justify-center">
                            <Users className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <p className="text-[9px] mt-0.5 truncate">{char.role}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState />
              )}
            </AssetSection>

            {/* Step 3: Scene Frames */}
            <AssetSection step={3} title="Scene Frames">
              {project.sceneFrames.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {project.sceneFrames.flatMap((frame) =>
                    frame.images
                      .filter((img) => img.url)
                      .map((img) => (
                        <div key={img.id} className="relative">
                          <img
                            src={img.url!}
                            alt={img.label}
                            className={cn(
                              "w-full aspect-video rounded border object-cover",
                              img.approved && "ring-1 ring-green-500",
                            )}
                          />
                          <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[7px] text-white text-center px-0.5 truncate rounded-b">
                            S{frame.sceneNumber} - {img.label}
                          </span>
                        </div>
                      )),
                  )}
                </div>
              ) : (
                <EmptyState />
              )}
            </AssetSection>

            {/* Step 4: Animated Clips */}
            <AssetSection step={4} title="Animated Clips">
              {project.animationPrompts.some((a) => a.clipUrl) ? (
                <div className="space-y-2">
                  {project.animationPrompts
                    .filter((a) => a.clipUrl)
                    .map((a) => (
                      <div key={a.sceneNumber} className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <Video className="w-3 h-3 text-muted-foreground" />
                          <span>Scene {a.sceneNumber}</span>
                          {a.approved && (
                            <Badge className="text-[8px] bg-green-600">Approved</Badge>
                          )}
                        </div>
                        <video
                          src={a.clipUrl!}
                          className="w-full aspect-video rounded border bg-black"
                          muted
                        />
                      </div>
                    ))}
                </div>
              ) : (
                <EmptyState />
              )}
            </AssetSection>

            {/* Step 5: Editing Guide */}
            <AssetSection step={5} title="Editing Guide">
              {project.editingGuide ? (
                <div className="text-xs space-y-1">
                  <p>{project.editingGuide.assembly.length} assembly items</p>
                  <p>{project.editingGuide.audioLayers.length} audio layers</p>
                  <p>{project.editingGuide.textOverlays.length} text overlays</p>
                  <p>{project.editingGuide.exportSettings.length} export presets</p>
                </div>
              ) : (
                <EmptyState />
              )}
            </AssetSection>

            {/* Step 6: Final Exports */}
            <AssetSection step={6} title="Final Exports">
              {project.finalVideoUrl ? (
                <div className="space-y-2">
                  <video
                    src={project.finalVideoUrl}
                    className="w-full aspect-video rounded border bg-black"
                    muted
                  />
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={project.delivered ? "default" : "secondary"} className="text-[9px]">
                      {project.delivered ? "Delivered" : "Pending Delivery"}
                    </Badge>
                    {project.feedbackRounds.length > 0 && (
                      <Badge variant="outline" className="text-[9px]">
                        {project.feedbackRounds.length} feedback rounds
                      </Badge>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState />
              )}
            </AssetSection>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function AssetSection({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  const Icon = SECTION_ICONS[step] || FileText;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold">{title}</p>
        <Badge variant="outline" className="text-[9px] ml-auto">Step {step}</Badge>
      </div>
      {children}
      <Separator />
    </div>
  );
}

function EmptyState() {
  return <p className="text-[10px] text-muted-foreground py-1">No assets yet</p>;
}
