/**
 * Where a piece of content has got to, as the road it actually travels.
 *
 * ── Why a track and not four buttons ──────────────────────────────────────────────────────────
 * The four stages are a sequence, not a menu: planned → being made → scheduled → posted, with the
 * client's approval sitting between the second and the third. Rendered as four identical buttons
 * that told you nothing about the order, people could not see where a post *was* without reading
 * every label, and the locked ones looked broken rather than blocked.
 *
 * So it reads left to right: everything behind the current stage is filled in, the current one is
 * ringed, and the two past the approval gate are visibly held shut until the client has said yes —
 * with the reason on the bar itself rather than in a sentence underneath that nobody reads.
 */
import { Check, Lock, Loader2 } from "lucide-react";
import { SMM_ITEM_STATUSES, type SmmItemStatus } from "@/types/smm";

/** The four a person can choose. Approval moves the rest — see the dialog's own header. */
const STAGES: SmmItemStatus[] = ["planned", "in_progress", "scheduled", "posted"];

/** Stages that may not be entered without a recorded approval. Mirrors POSTABLE_STATUSES. */
const GATED: SmmItemStatus[] = ["scheduled", "posted"];

export default function SmmStageBar({ status, approved, busy, disabled, onPick }: {
  status: SmmItemStatus;
  /** Whether the client's approval is on the record. Unlocks the last two stages. */
  approved: boolean;
  /** The stage currently being written, if any. */
  busy?: string | null;
  disabled?: boolean;
  onPick: (next: SmmItemStatus) => void;
}) {
  /**
   * Where the item is ON THIS BAR.
   *
   * `awaiting_approval` and `changes_requested` are real statuses that are not stages — the thing
   * has been made and is sitting with the client. Both read as "being made" here, because that is
   * the last stage anybody chose and the approval panel above says the rest.
   */
  const current = STAGES.indexOf(status) >= 0 ? STAGES.indexOf(status) : 1;

  return (
    <div data-test="smm-stage-bar" className="flex items-stretch gap-1">
      {STAGES.map((stage, i) => {
        const meta = SMM_ITEM_STATUSES.find((s) => s.key === stage);
        const locked = GATED.includes(stage) && !approved;
        const isCurrent = stage === status;
        const isDone = i < current;
        const working = busy === stage;

        return (
          <button
            key={stage}
            type="button"
            data-test={`smm-set-status-${stage}`}
            disabled={disabled || locked || working}
            onClick={() => onPick(stage)}
            aria-current={isCurrent ? "step" : undefined}
            title={locked ? "Record the client's approval first" : `Mark as ${meta?.label.toLowerCase()}`}
            className={`group relative flex-1 rounded-lg border px-1.5 py-2 text-center transition-colors disabled:cursor-not-allowed ${
              isCurrent
                ? "border-primary bg-primary/15 text-primary"
                : isDone
                  ? "border-success/40 bg-success/10 text-success"
                  : locked
                    ? "border-border/60 bg-muted/40 text-muted-foreground/60"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {/* The connector, so four boxes read as one road rather than four choices. */}
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute -left-1 top-1/2 h-px w-1 -translate-y-1/2 ${
                  isDone || isCurrent ? "bg-success/50" : "bg-border"
                }`}
              />
            )}
            <span className="flex items-center justify-center gap-1">
              {working ? <Loader2 size={11} className="animate-spin" />
                : isDone ? <Check size={11} />
                : locked ? <Lock size={10} />
                : null}
              <span className="text-[11px] font-medium leading-tight">{meta?.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
