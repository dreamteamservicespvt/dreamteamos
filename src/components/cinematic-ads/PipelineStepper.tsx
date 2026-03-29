import { cn } from "@/lib/utils";
import { PIPELINE_STEPS, type PipelineStepNumber, type StepCompletionStatus } from "@/types/cinematicAds";
import { Check } from "lucide-react";
import { motion } from "framer-motion";

interface PipelineStepperProps {
  currentStep: PipelineStepNumber;
  stepsCompleted: StepCompletionStatus;
  onStepClick: (step: PipelineStepNumber) => void;
}

export default function PipelineStepper({ currentStep, stepsCompleted, onStepClick }: PipelineStepperProps) {
  return (
    <div className="w-full overflow-x-auto py-2 px-1">
      <div className="flex items-center min-w-[640px] gap-0">
        {PIPELINE_STEPS.map((step, i) => {
          const isCompleted = stepsCompleted[step.number as PipelineStepNumber];
          const isCurrent = currentStep === step.number;
          const isAccessible = isCompleted || isCurrent || stepsCompleted[(step.number - 1) as PipelineStepNumber];

          return (
            <div key={step.number} className="flex items-center flex-1">
              <button
                onClick={() => isAccessible && onStepClick(step.number as PipelineStepNumber)}
                disabled={!isAccessible}
                className={cn(
                  "flex flex-col items-center gap-1 w-full group relative",
                  isAccessible ? "cursor-pointer" : "cursor-not-allowed opacity-40",
                )}
              >
                <div className="relative">
                  <motion.div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors",
                      isCompleted
                        ? "bg-primary border-primary text-primary-foreground"
                        : isCurrent
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-muted border-muted-foreground/30 text-muted-foreground",
                    )}
                    animate={isCurrent ? { scale: [1, 1.08, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : step.number}
                  </motion.div>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-tight text-center whitespace-nowrap",
                    isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.shortLabel}
                </span>
              </button>
              {i < PIPELINE_STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-1 rounded-full transition-colors",
                    stepsCompleted[step.number as PipelineStepNumber] ? "bg-primary" : "bg-muted-foreground/20",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
