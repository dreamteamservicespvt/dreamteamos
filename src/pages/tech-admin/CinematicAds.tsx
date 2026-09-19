import { useEffect } from "react";
import { useCinematicAdsStore, castingIsSkipped } from "@/store/cinematicAdsStore";
import { useAuthStore } from "@/store/authStore";
import { type PipelineStepNumber } from "@/types/cinematicAds";
import PipelineStepper from "@/components/cinematic-ads/PipelineStepper";
import ProjectAssetsPanel from "@/components/cinematic-ads/ProjectAssetsPanel";
import ProjectList from "@/components/cinematic-ads/ProjectList";
import Step0ClientOnboarding from "@/components/cinematic-ads/Step0ClientOnboarding";
import Step1StoryGeneration from "@/components/cinematic-ads/Step1StoryGeneration";
import Step2StoryboardPreview from "@/components/cinematic-ads/Step2StoryboardPreview";
import Step3Casting from "@/components/cinematic-ads/Step3Casting";
import Step4Clips from "@/components/cinematic-ads/Step4Clips";
import Step5EditingGuide from "@/components/cinematic-ads/Step5EditingGuide";
import Step6ReviewDelivery from "@/components/cinematic-ads/Step6ReviewDelivery";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, Check, FolderOpen, Film, Loader2 } from "lucide-react";

const STEP_COMPONENTS: Record<number, React.FC> = {
  0: Step0ClientOnboarding,
  1: Step1StoryGeneration,
  2: Step2StoryboardPreview,
  3: Step3Casting,
  4: Step4Clips,
  5: Step5EditingGuide,
  6: Step6ReviewDelivery,
};

export default function CinematicAds() {
  const user = useAuthStore((s) => s.user);
  const { project, saving, saveError, setAssetsOpen, goToStep, closeProject, saveNow, refreshProjects } =
    useCinematicAdsStore();

  /**
   * Leaving a project flushes its pending autosave.
   *
   * Autosave is debounced, so closing within a couple of seconds of the last edit would
   * otherwise drop that edit on the floor.
   */
  useEffect(() => {
    return () => {
      if (useCinematicAdsStore.getState().project) void useCinematicAdsStore.getState().saveNow();
    };
  }, []);

  if (!user?.uid) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading your account…
      </div>
    );
  }

  // No project open: the list is the screen.
  if (!project) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Film className="w-6 h-6" />
            Cinematic Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            The production pipeline for cinematic video ads — brief, story, board, clips, delivery.
          </p>
        </div>
        <ProjectList userId={user.uid} />
      </div>
    );
  }

  const StepComponent = STEP_COMPONENTS[project.currentStep] || Step0ClientOnboarding;

  const handleBackToList = async () => {
    await saveNow();
    closeProject();
    void refreshProjects(user.uid);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1" onClick={() => void handleBackToList()}>
            <ArrowLeft className="w-4 h-4" />
            All projects
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2 min-w-0">
            <Film className="w-6 h-6 shrink-0" />
            <span className="truncate">{project.name}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving…
              </>
            ) : saveError ? (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertCircle className="w-3.5 h-3.5" />
                {saveError}
              </span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => setAssetsOpen(true)}>
          <FolderOpen className="w-4 h-4" />
          Project Assets
        </Button>
      </div>

      <PipelineStepper
        currentStep={project.currentStep}
        stepsCompleted={project.stepsCompleted}
        skippedSteps={castingIsSkipped(project) ? [3] : []}
        onStepClick={(step: PipelineStepNumber) => goToStep(step)}
      />

      <StepComponent />

      <ProjectAssetsPanel />
    </div>
  );
}
