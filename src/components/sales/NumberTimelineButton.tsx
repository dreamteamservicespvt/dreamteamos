import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { History, Lock, Loader2, ShieldOff, AlertTriangle, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { fetchNumberLock, adminReleaseLock } from "@/services/numberLock";
import type { Lead, NumberLock, NumberLockAction } from "@/types";

const ACTION_LABELS: Record<NumberLockAction, string> = {
  claimed: "Added",
  taken_over: "Taken over",
  sold: "Sale made — frozen",
  admin_override: "Lock released",
};

const ACTION_DOT: Record<NumberLockAction, string> = {
  claimed: "bg-info",
  taken_over: "bg-warning",
  sold: "bg-success",
  admin_override: "bg-destructive",
};

type TimestampLike = { toMillis?: () => number; seconds?: number } | null | undefined;

function tsToDate(ts: TimestampLike): Date | null {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return new Date(ts.toMillis());
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return null;
}

/**
 * Small clickable history icon next to a phone number. Opens a popover showing the full
 * timeline of who added/took over/sold the number, plus an admin-only "release lock" action.
 */
export default function NumberTimelineButton({ phone, lead }: { phone: string; lead?: Lead }) {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [lock, setLock] = useState<NumberLock | null>(null);
  const [loading, setLoading] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const isAdmin = user?.role === "sales_admin" || user?.role === "main_admin";

  const load = async () => {
    setLoading(true);
    try {
      setLock(await fetchNumberLock(phone));
    } catch {
      setLock(null);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) load();
  };

  const handleRelease = async () => {
    if (!user) return;
    setReleasing(true);
    try {
      await adminReleaseLock({ admin: { uid: user.uid, name: user.name }, phone });
      toast({ title: "Lock released", description: "This number can now be added by anyone." });
      await load();
    } catch {
      toast({ title: "Error", description: "Failed to release lock.", variant: "destructive" });
    } finally {
      setReleasing(false);
    }
  };

  const entries = [...(lock?.timeline || [])].sort((a, b) => {
    const am = tsToDate(a.at)?.getTime() || 0;
    const bm = tsToDate(b.at)?.getTime() || 0;
    return bm - am; // newest first
  });

  const frozenUntil = tsToDate(lock?.saleFrozenUntil);
  const isFrozen = !!(lock?.saleFrozen && frozenUntil && frozenUntil.getTime() > Date.now());

  // Who originally added this number (earliest "claimed" entry in the lock timeline).
  const addedBy = [...(lock?.timeline || [])]
    .filter((e) => e.action === "claimed")
    .sort((a, b) => (tsToDate(a.at)?.getTime() || 0) - (tsToDate(b.at)?.getTime() || 0))[0];

  // Why the member's own lead is frozen (taken over vs duplicate-rule), from the lead itself.
  const leadFrozen = !!lead?.frozen;
  const keptByName = lead?.takenOverBy && !lead.takenOverBy.includes("duplicate rule") ? lead.takenOverBy : null;
  const leadFrozenReason =
    lead?.frozenReason === "duplicate_resolved"
      ? keptByName
        ? `Duplicate — kept by ${keptByName} (worked it first)`
        : "Duplicate — kept by the member who worked it first"
      : leadFrozen
        ? `Taken over${lead?.takenOverBy ? ` by ${lead.takenOverBy}` : " after its 24h validity"}`
        : null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Number history"
          onClick={(e) => e.stopPropagation()}
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
        >
          <History size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-display font-semibold text-sm text-foreground">Number History</h4>
          <span className="text-[10px] font-mono text-muted-foreground">{phone}</span>
        </div>

        {/* Who added it / current owner */}
        {(addedBy || lock?.ownerName) && (
          <div className="mb-2 flex items-start gap-1.5 rounded-md bg-info/10 border border-info/30 text-info text-[11px] p-2">
            <UserCheck size={12} className="mt-0.5 shrink-0" />
            <span>
              {addedBy ? <>Added by <b>{addedBy.byName}</b>{addedBy.at && tsToDate(addedBy.at) ? ` · ${format(tsToDate(addedBy.at)!, "dd MMM yyyy")}` : ""}</> : null}
              {lock?.ownerName && (!addedBy || lock.ownerName !== addedBy.byName) ? (
                <>{addedBy ? <br /> : null}Currently with <b>{lock.ownerName}</b></>
              ) : null}
            </span>
          </div>
        )}

        {/* Why this member's lead is frozen (duplicate rule / takeover) */}
        {leadFrozenReason && (
          <div className="mb-2 flex items-start gap-1.5 rounded-md bg-warning/10 border border-warning/30 text-warning text-[11px] p-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{leadFrozenReason}</span>
          </div>
        )}

        {isFrozen && (
          <div className="mb-2 flex items-start gap-1.5 rounded-md bg-success/10 border border-success/30 text-success text-[11px] p-2">
            <Lock size={12} className="mt-0.5 shrink-0" />
            <span>
              Frozen until {frozenUntil ? format(frozenUntil, "dd MMM yyyy") : "—"}
              {lock?.saleByName ? ` · sold by ${lock.saleByName}` : ""}
            </span>
          </div>
        )}

        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No history yet for this number.</p>
        ) : (
          <div className="space-y-0 max-h-64 overflow-y-auto">
            {entries.map((e, i) => {
              const d = tsToDate(e.at);
              return (
                <div key={i} className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${ACTION_DOT[e.action] || "bg-muted-foreground"}`} />
                    {i < entries.length - 1 && <div className="w-px flex-1 bg-border" />}
                  </div>
                  <div className="pb-3 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {ACTION_LABELS[e.action] || e.action}
                        {e.action === "sold" && e.freezeDays ? ` (${e.freezeDays}d)` : ""}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {d ? format(d, "dd MMM, HH:mm") : "—"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      <span className="text-foreground/70 font-medium">{e.byName}</span>
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isAdmin && lock && (
          <button
            onClick={handleRelease}
            disabled={releasing}
            className="mt-1 w-full h-8 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-destructive/20 disabled:opacity-50 transition-colors"
          >
            {releasing ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
            {releasing ? "Releasing..." : "Release lock / clear freeze"}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
