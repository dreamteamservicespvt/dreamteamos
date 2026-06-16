import { Clock } from "lucide-react";
import { useNow } from "@/hooks/useNow";
import { promiseDueMs, deadlineState, formatRemaining } from "@/utils/promiseSla";
import type { PromiseDeadline } from "@/types";

/**
 * Live delivery-promise countdown chip. Colours by state (ok / near / overdue) and ticks every
 * 30s. Shown on Orders cards, WorkAssign cards, and the tech member's MyWork cards.
 */
export default function DeadlineChip({ promise, className = "" }: { promise?: PromiseDeadline | null; className?: string }) {
  const now = useNow(30000);
  if (!promise) return null;
  const due = promiseDueMs(promise);
  if (!due) return null;
  const state = deadlineState(due, now);
  const styles =
    state === "overdue"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : state === "near"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-medium border ${styles} ${className}`}
      title={`Delivery promise: ${promise.label}`}
    >
      <Clock size={11} /> {formatRemaining(due, now)}
    </span>
  );
}
