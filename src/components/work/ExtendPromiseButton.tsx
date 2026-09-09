/**
 * Moving a delivery deadline out, once, when the client is the reason it slipped.
 *
 * ── Why this exists at all ────────────────────────────────────────────────────────────────────
 * The promise the client is sent is conditional, and says so in as many words: 24 hours holds only
 * while they confirm their business details and answer the script quickly. When they don't, the
 * countdown runs on work nobody could start — and the person making it is marked late, chased by
 * an overdue alert, and measured against a deadline they had no part in losing.
 *
 * ── Why exactly once ─────────────────────────────────────────────────────────────────────────
 * A deadline that can be moved twice is not a deadline. "It keeps getting extended" is the precise
 * failure the countdown exists to make visible, so the second attempt is refused — here, and again
 * next to the write in `services/orders.extendOrderPromise`, because two people can be looking at
 * the same overdue job.
 *
 * ── Why three roles can use it ───────────────────────────────────────────────────────────────
 * The tech member is watching an unanswered script; the team leader reviews the queue; the sales
 * member is the one actually talking to the client. Any of them may be first to learn the client
 * has stalled, and routing it through one of them means the extension happens hours late or never.
 */
import { useState } from "react";
import { CalendarClock, Loader2, Lock } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { extendOrderPromise } from "@/services/orders";
import { canExtendPromise, formatHoursLabel, promiseOriginalDueMs } from "@/utils/promiseSla";
import { format } from "date-fns";
import type { Order, WorkAssignment } from "@/types";

export default function ExtendPromiseButton({ order, assignment, compact = false }: {
  order: Order;
  /** The work fulfilling this order, when the caller has it — used for "who holds this now". */
  assignment?: WorkAssignment | null;
  /** A smaller chip, for a row that is already dense (a sale line rather than a queue card). */
  compact?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Pre-filled with the promise's own length again, which is the answer in almost every case — a
  // field already holding the right number is the difference between an extension recorded now and
  // one recorded tomorrow. Still editable: an afternoon's delay on a five-day website is not five
  // more days.
  const [hours, setHours] = useState(() => order.promise?.hours || 24);
  const [reason, setReason] = useState("");

  const verdict = canExtendPromise({
    promise: order.promise,
    role: user?.role,
    uid: user?.uid,
    assigneeUid: assignment?.assignedTo || order.assignedTo,
    soldBy: order.soldBy,
  });

  // Already used: say who used it and why, rather than showing a button that only refuses. This is
  // the answer to "why is this still showing as late" and it belongs on the card.
  if (order.promise?.extension) {
    const e = order.promise.extension;
    return (
      <span
        data-test="promise-extended-note"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        title={`Extended once by ${e.byName || "someone"}${e.reason ? ` — ${e.reason}` : ""}. A promise only moves once.`}
      >
        <Lock size={10} /> Extended by {e.byName || "someone"}
      </span>
    );
  }

  if (!order.promise || !verdict.allowed) return null;

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    const res = await extendOrderPromise({
      order,
      hours,
      reason,
      actor: { uid: user.uid, name: user.name, role: user.role },
      assignment,
    });
    setSaving(false);
    toast({
      title: res.ok ? "Delivery time moved" : "Could not move it",
      description: res.message,
      ...(res.ok ? {} : { variant: "destructive" as const }),
    });
    if (res.ok) setOpen(false);
  };

  const originalDue = promiseOriginalDueMs(order.promise);

  return (
    <>
      <button
        type="button"
        data-test="extend-promise-open"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-full border border-border bg-card font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
          compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px] md:text-xs"
        }`}
        title="Move this delivery time out once, when the client is the reason it slipped"
      >
        <CalendarClock size={compact ? 9 : 11} /> Extend once
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-sm font-semibold text-foreground">Extend the delivery time</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Only when the <b>client</b> held it up — they hadn't confirmed their business details, or
                left the script unanswered. This can be done <b>once</b>, and it is recorded against your name.
              </p>
            </div>

            <div className="rounded-md border border-border bg-background px-2.5 py-2 text-[11px] text-muted-foreground">
              <div><b className="text-foreground">{order.businessName || "Client work"}</b></div>
              <div>
                Promised {order.promise.label}
                {originalDue ? ` · due ${format(new Date(originalDue), "dd MMM, h:mm a")}` : ""}
              </div>
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground">Extend by</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={720}
                  data-test="extend-promise-hours"
                  value={hours}
                  onChange={(e) => setHours(Math.max(1, Math.min(720, Number(e.target.value) || 1)))}
                  className="h-9 w-24 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                />
                <span className="text-xs text-muted-foreground">
                  hours → new total {formatHoursLabel((order.promise.hours || 0) + hours)}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground">What held it up?</label>
              <textarea
                value={reason}
                data-test="extend-promise-reason"
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="e.g. Client took two days to send their business details."
                className="mt-1 h-16 w-full resize-none rounded-md border border-border bg-background p-2 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                data-test="extend-promise-save"
                onClick={submit}
                disabled={saving}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CalendarClock size={12} />}
                Extend
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
