/**
 * The running state of a multi-deliverable order — a social-media month or a bulk ad order.
 *
 * One component for all three audiences (tech admin, team leader, assigned member) because they
 * are all looking at the same object and the same counters. What differs is only *which* counters
 * a person may move, and that question is answered once in `utils/orderProgress.editableFields`
 * rather than by three near-identical panels drifting apart.
 *
 * Counters are set to a value rather than nudged by one. Two people can have the same month open
 * at once, and "set it to 5" from a screen showing 4 corrects itself on the next render, whereas
 * two "+1"s from the same stale 4 silently becomes 6.
 */
import { useState } from "react";
import { CheckCircle2, Loader2, Users, ChevronDown, ChevronUp } from "lucide-react";
import {
  activeFields, activeTracks, editableFields, isTrackComplete, isProgressComplete,
  progressPercent, PROGRESS_FIELD_LABELS, TRACK_FIELDS,
} from "@/utils/orderProgress";
import { updateOrderProgress, setOrderTrackComplete } from "@/services/orders";
import { useToast } from "@/hooks/use-toast";
import { ORDER_TRACKS } from "@/types";
import type { AppUser, Order, OrderProgressField, OrderTrack } from "@/types";

export default function OrderProgressPanel({ order, user, compact = false }: {
  order: Order;
  user: Pick<AppUser, "uid" | "name" | "role"> | null;
  /** Cards in a grid get the bar and counters without the per-job breakdown. */
  compact?: boolean;
}) {
  const progress = order.progress;
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(!compact);

  if (!progress) return null;

  const fields = activeFields(progress);
  const canEdit = new Set<OrderProgressField>(editableFields(progress, user?.role, user?.uid));
  const complete = isProgressComplete(progress);
  const percent = progressPercent(progress);

  const setCount = async (field: OrderProgressField, value: number) => {
    if (!user) return;
    setBusy(field);
    try {
      await updateOrderProgress({ order, field, value, actor: user });
    } catch {
      toast({ title: "Not saved", description: "Couldn't update the count. Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const toggleTrack = async (track: OrderTrack, next: boolean) => {
    if (!user) return;
    setBusy(track);
    try {
      await setOrderTrackComplete({ order, track, complete: next, actor: user });
    } catch {
      toast({ title: "Not saved", description: "Couldn't update that job. Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  /** A member may close a job only if they own every counter inside it. */
  const canCloseTrack = (t: OrderTrack) =>
    TRACK_FIELDS[t].filter((f) => (progress.targets[f] || 0) > 0).every((f) => canEdit.has(f));

  return (
    <div
      data-test="order-progress"
      className={`rounded-lg border p-2.5 ${complete ? "border-green-500/30 bg-green-500/5" : "border-purple-500/30 bg-purple-500/5"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
          {complete
            ? <><CheckCircle2 size={13} className="text-green-600 dark:text-green-400" /> <span className="text-green-600 dark:text-green-400">Fully delivered</span></>
            : <>{progress.kind === "smm" ? "This month's delivery" : "Bulk order"} — {percent}%</>}
        </div>
        {compact && (
          <button onClick={() => setOpen((v) => !v)} className="text-muted-foreground hover:text-foreground">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${complete ? "bg-green-500" : "bg-purple-500"}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {open && (
        <>
          <div className="mt-2.5 space-y-1.5">
            {fields.map((f) => {
              const done = progress.done[f] || 0;
              const target = progress.targets[f] || 0;
              const editable = canEdit.has(f);
              return (
                <div key={f} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{PROGRESS_FIELD_LABELS[f]}</span>
                  <div className="flex items-center gap-1.5">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        max={target}
                        data-test={`progress-${f}`}
                        defaultValue={done}
                        key={`${f}-${done}`}
                        disabled={busy === f}
                        onBlur={(e) => setCount(f, Number(e.target.value))}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="h-7 w-14 rounded-md border border-border bg-card px-2 text-right font-mono text-xs text-foreground outline-none focus:border-primary disabled:opacity-50"
                      />
                    ) : (
                      // Same width as the input above it, so a member's editable and read-only
                      // counters line up in one column instead of stepping in and out.
                      <span className="inline-block w-14 pr-2 text-right font-mono text-xs font-semibold text-foreground">{done}</span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">of {target}</span>
                    {busy === f && <Loader2 size={11} className="animate-spin text-muted-foreground" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Who holds each job, and whether it is closed. Shown to everyone on the order — a
              member needs to see that the uploads are done without asking the person doing them. */}
          {!compact && activeTracks(progress).length > 1 && (
            <div className="mt-2.5 space-y-1 border-t border-border/50 pt-2">
              {activeTracks(progress).map((t) => {
                const owner = progress.tracks?.[t];
                const done = isTrackComplete(progress, t);
                const label = ORDER_TRACKS.find((x) => x.key === t)?.label || t;
                return (
                  <div key={t} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs">
                      <Users size={11} className="text-muted-foreground" />
                      <span className={done ? "text-green-600 line-through dark:text-green-400" : "text-foreground"}>{label}</span>
                      <span className="text-[10px] text-muted-foreground">{owner?.name || "unassigned"}</span>
                    </span>
                    {canCloseTrack(t) ? (
                      <button
                        data-test={`track-toggle-${t}`}
                        disabled={busy === t}
                        onClick={() => toggleTrack(t, !done)}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50 ${done ? "bg-green-500/15 text-green-600 dark:text-green-400" : "border border-border text-muted-foreground hover:bg-accent"}`}
                      >
                        {busy === t ? "…" : done ? "Done" : "Mark done"}
                      </button>
                    ) : (
                      <span className={`text-[10px] ${done ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {done ? "Done" : "In progress"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
