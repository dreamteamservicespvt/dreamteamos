import { Target } from "lucide-react";
import { prettyDate } from "./FlowAccountDialog";
import type { TargetProgress } from "@/utils/flowCredits";
import { cn } from "@/lib/utils";

const STATUS: Record<TargetProgress["status"], { label: string; tone: string }> = {
  done: { label: "Target reached", tone: "bg-success/15 text-success" },
  ahead: { label: "Ahead of pace", tone: "bg-success/15 text-success" },
  on_track: { label: "On track", tone: "bg-info/15 text-info" },
  behind: { label: "Behind pace", tone: "bg-warning/20 text-foreground" },
  missed: { label: "Deadline passed", tone: "bg-destructive/15 text-destructive" },
};

/** A member's progress toward the Flow account target — how many, by when, and the pace still needed. */
export default function TargetCard({ progress, deadline, dailyTarget }: { progress: TargetProgress; deadline: string; dailyTarget: number }) {
  const pct = Math.min(100, Math.round((progress.added / Math.max(1, progress.target)) * 100));
  const status = STATUS[progress.status];
  return (
    <div className="bg-card border border-border rounded-xl p-4" data-test="target-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target className="h-4 w-4 text-primary shrink-0" />
          <h3 className="font-display text-sm font-semibold text-foreground truncate">Flow account target</h3>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0", status.tone)} data-test="target-status">{status.label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-foreground" data-test="target-count">
        {progress.added}<span className="text-base font-medium text-muted-foreground"> / {progress.target} accounts</span>
      </p>
      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {progress.remaining === 0
          ? "All accounts added — thank you."
          : progress.daysLeft === 0
            ? `${progress.remaining} still to add — the deadline was ${prettyDate(deadline)}.`
            : <>{progress.remaining} to go by <b className="text-foreground">{prettyDate(deadline)}</b> ({progress.daysLeft} day{progress.daysLeft === 1 ? "" : "s"} left) — <b className="text-foreground">{progress.perDayNeeded} a day</b> from today. Plan: {dailyTarget} a day; {progress.expectedByNow} should be in by today.</>}
      </p>
    </div>
  );
}
