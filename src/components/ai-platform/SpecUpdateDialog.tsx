/**
 * "Your specification was changed" — shown the moment an admin edits a job the member is holding.
 *
 * This has to be a dialog rather than a toast, and it has to be acknowledged. A member who misses
 * the change spends the next half hour producing an ad to the old spec, and nobody finds out until
 * it is delivered — so the one thing this must not do is let the change go unread.
 *
 * It shows the change AS a change ("Attire: Traditional → Professional") because that is what tells
 * someone what to do differently; a screen that silently swapped its own fields would leave them
 * wondering whether they had misremembered.
 */
import { createPortal } from 'react-dom';
import { RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SpecChange } from '@/utils/assignmentSpecDiff';

interface SpecUpdateDialogProps {
  changes: SpecChange[];
  /** True when prompts are already on screen — they were made to the OLD spec. */
  hasExistingOutputs: boolean;
  isDark: boolean;
  onAcknowledge: () => void;
}

export default function SpecUpdateDialog({
  changes, hasExistingOutputs, isDark, onAcknowledge,
}: SpecUpdateDialogProps) {
  // Portalled: the platform's own panels use backdrop-blur, which would otherwise trap a fixed
  // overlay inside the card that contains it.
  return createPortal(
    <div
      data-test="spec-update-dialog"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
    >
      <div className={cn(
        "w-full max-w-lg rounded-2xl border shadow-2xl",
        isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white",
      )}>
        <div className="p-5">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
            <RefreshCw className="h-6 w-6 text-amber-500" />
          </div>
          <h3 className={cn("text-center text-lg font-bold", isDark ? "text-white" : "text-slate-900")}>
            Your ad specification was updated
          </h3>
          <p className={cn("mt-1 text-center text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
            Your admin changed this job. Here is exactly what is different — make the ad to the new
            spec.
          </p>

          <div className={cn(
            "mt-4 divide-y rounded-xl border",
            isDark ? "divide-slate-700 border-slate-700 bg-slate-800/50" : "divide-slate-200 border-slate-200 bg-slate-50",
          )}>
            {changes.map((c) => (
              <div key={c.label} className="px-3 py-2.5">
                <p className={cn("text-[11px] font-semibold uppercase tracking-wide", isDark ? "text-slate-400" : "text-slate-500")}>
                  {c.label}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                  <span className={cn("line-through", isDark ? "text-slate-500" : "text-slate-400")}>{c.from}</span>
                  <ArrowRight className={cn("h-3.5 w-3.5 shrink-0", isDark ? "text-slate-500" : "text-slate-400")} />
                  <span className={cn("font-semibold", isDark ? "text-emerald-300" : "text-emerald-700")}>{c.to}</span>
                </div>
              </div>
            ))}
          </div>

          {/* The expensive case: they have already generated to the old spec and would otherwise
              hand that in without realising. */}
          {hasExistingOutputs && (
            <div className={cn(
              "mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs",
              isDark ? "border-amber-600/50 bg-amber-950/30 text-amber-200" : "border-amber-400 bg-amber-50 text-amber-800",
            )}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                The prompts already on your screen were made with the <b>old</b> spec. Generate again
                so the ad matches what is above — otherwise it will be delivered wrong.
              </span>
            </div>
          )}

          <button
            type="button"
            data-test="spec-update-ack"
            onClick={onAcknowledge}
            className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Got it — use the updated spec
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
