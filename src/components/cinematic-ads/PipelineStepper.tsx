import { cn } from "@/lib/utils";
import { PIPELINE_STEPS, type PipelineStepNumber, type StepCompletionStatus } from "@/types/cinematicAds";
import { Check, Minus } from "lucide-react";
import { motion } from "framer-motion";

interface PipelineStepperProps {
  currentStep: PipelineStepNumber;
  stepsCompleted: StepCompletionStatus;
  /** Steps this ad format does not need, e.g. casting for an ad with no people. */
  skippedSteps?: PipelineStepNumber[];
  onStepClick: (step: PipelineStepNumber) => void;
}

export default function PipelineStepper({
  currentStep,
  stepsCompleted,
  skippedSteps = [],
  onStepClick,
}: PipelineStepperProps) {
  return (
    <div className="w-full overflow-x-auto py-2 px-1">
      <div className="flex items-center min-w-[640px] gap-0">
        {PIPELINE_STEPS.map((step, i) => {
          const number = step.number as PipelineStepNumber;
          const isSkipped = skippedSteps.includes(number);
          const isCompleted = stepsCompleted[number];
          const isCurrent = currentStep === step.number;

          /*
            A skipped step must not gate the one after it.
            Casting is skipped for a no-people ad and is therefore never marked complete,
            so without this the Clips step would stay locked behind it forever.
          */
          const previousSatisfied =
            number === 0 ||
            stepsCompleted[(number - 1) as PipelineStepNumber] ||
            skippedSteps.includes((number - 1) as PipelineStepNumber);
          const isAccessible = !isSkipped && (isCompleted || isCurrent || previousSatisfied);

          return (
            <div key={step.number} className="flex items-center flex-1">
              <button
                onClick={() => isAccessible && onStepClick(number)}
                disabled={!isAccessible}
                title={isSkipped ? `${step.label} — not needed for this ad type` : step.label}
                className={cn(
                  "flex flex-col items-center gap-1 w-full group relative",
                  isAccessible ? "cursor-pointer" : "cursor-not-allowed opacity-40",
                )}
              >
                <div className="relative">
                  <motion.div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors",
                      isSkipped
                        ? "bg-muted border-dashed border-muted-foreground/40 text-muted-foreground"
                        : isCompleted
                          ? "bg-primary border-primary text-primary-foreground"
                          : isCurrent
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-muted border-muted-foreground/30 text-muted-foreground",
                    )}
                    animate={isCurrent && !isSkipped ? { scale: [1, 1.08, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {isSkipped ? (
                      <Minus className="w-4 h-4" />
                    ) : isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      step.number
                    )}
                  </motion.div>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-tight text-center whitespace-nowrap",
                    isSkipped
                      ? "text-muted-foreground line-through"
                      : isCurrent
                        ? "text-primary"
                        : isCompleted
                          ? "text-foreground"
                          : "text-muted-foreground",
                  )}
                >
                  {step.shortLabel}
                </span>
              </button>
              {i < PIPELINE_STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-1 rounded-full transition-colors",
                    isCompleted || isSkipped ? "bg-primary" : "bg-muted-foreground/20",
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
