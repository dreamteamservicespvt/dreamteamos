import { Check, Circle, Dot } from "lucide-react";
import type { LifecycleStep } from "@/utils/hrPolicy";

/**
 * The employee's journey, offer through exit, as one horizontal strip.
 *
 * Deliberately the first thing on the profile page: an admin opening a member wants to know where
 * that person is and what the company still owes them, and the answer should not require reading
 * five tabs. Exactly one step is marked "current" — the first thing outstanding.
 */
export default function LifecycleTracker({ steps }: { steps: LifecycleStep[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-test="lifecycle-tracker">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {steps.map((step, idx) => {
          const done = step.status === "done";
          const current = step.status === "current";
          return (
            <div key={step.key} className="flex w-[160px] shrink-0 flex-col gap-1.5 md:w-auto md:flex-1">
              {/* The rail: a marker, then the line that carries the eye to the next step. */}
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? "border-success bg-success text-success-foreground"
                      : current
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground/40"
                  }`}
                >
                  {done ? <Check size={11} strokeWidth={3} /> : current ? <Dot size={16} strokeWidth={4} /> : <Circle size={7} />}
                </span>
                {idx < steps.length - 1 && (
                  <span className={`h-px flex-1 ${done ? "bg-success/50" : "bg-border"}`} />
                )}
              </div>
              <div className="min-w-0 pr-2">
                <p className={`break-words text-xs font-semibold leading-tight ${current ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </p>
                {/* Wraps inside its 160px column instead of running under the next step — the
                    detail is the half of this strip that says what is actually outstanding. */}
                <p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
