import { useEffect } from "react";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { type PipelineStepNumber } from "@/types/cinematicAds";
import PipelineStepper from "@/components/cinematic-ads/PipelineStepper";
import ProjectAssetsPanel from "@/components/cinematic-ads/ProjectAssetsPanel";
import Step0ClientOnboarding from "@/components/cinematic-ads/Step0ClientOnboarding";
import Step1StoryGeneration from "@/components/cinematic-ads/Step1StoryGeneration";
import Step2Casting from "@/components/cinematic-ads/Step2Casting";
import Step3FrameGeneration from "@/components/cinematic-ads/Step3FrameGeneration";
import Step4AnimationPrompts from "@/components/cinematic-ads/Step4AnimationPrompts";
import Step5EditingGuide from "@/components/cinematic-ads/Step5EditingGuide";
import Step6ReviewDelivery from "@/components/cinematic-ads/Step6ReviewDelivery";
import { Button } from "@/components/ui/button";
import { FolderOpen, Film } from "lucide-react";

const STEP_COMPONENTS: Record<number, React.FC> = {
  0: Step0ClientOnboarding,
  1: Step1StoryGeneration,
  2: Step2Casting,
  3: Step3FrameGeneration,
  4: Step4AnimationPrompts,
  5: Step5EditingGuide,
  6: Step6ReviewDelivery,
};

export default function CinematicAds() {
  const { project, initProject, setAssetsOpen, goToStep } = useCinematicAdsStore();

  useEffect(() => {
    if (!project) {
      initProject();
    }
  }, [project, initProject]);

  if (!project) return null;

  const StepComponent = STEP_COMPONENTS[project.currentStep] || Step0ClientOnboarding;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Film className="w-6 h-6" />
            Cinematic Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI-powered production pipeline for cinematic video advertisements
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setAssetsOpen(true)}>
          <FolderOpen className="w-4 h-4" />
          Project Assets
        </Button>
      </div>

      {/* Pipeline Stepper */}
      <PipelineStepper
        currentStep={project.currentStep}
        stepsCompleted={project.stepsCompleted}
        onStepClick={(step: PipelineStepNumber) => goToStep(step)}
      />

      {/* Current Step */}
      <StepComponent />

      {/* Assets Panel (Sheet) */}
      <ProjectAssetsPanel />
    </div>
  );
}
