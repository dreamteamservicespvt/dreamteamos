/**
 * Raising a penalty for changes beyond the committed brief.
 *
 * Used by both the tech admin (from the Orders queue) and the sales member (from the sale), which
 * is why it takes an `actor` rather than reading the role itself — the two callers are different
 * people doing the same thing, and the entry records which of them did it.
 *
 * The rate is pre-filled from the clip type and stays editable. A standard rate is what we usually
 * charge, not what we always charge, and a member who has agreed ₹300 with a client needs to record
 * ₹300 rather than the ₹250 the table says.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { PENALTY_CLIP_TYPES, PENALTY_RATES, defaultClipType, penaltyAmount } from "@/utils/penalty";
import { addOrderPenalty } from "@/services/orders";
import { formatCurrency } from "@/utils/formatters";
import { useToast } from "@/hooks/use-toast";
import type { AppUser, Order, PenaltyClipType } from "@/types";

export default function PenaltyDialog({ order, actor, onClose }: {
  order: Order;
  actor: Pick<AppUser, "uid" | "name" | "role">;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [clipType, setClipType] = useState<PenaltyClipType>(defaultClipType(order.category, order.bulkAdType));
  const [clips, setClips] = useState(1);
  const [ratePerClip, setRatePerClip] = useState(PENALTY_RATES[defaultClipType(order.category, order.bulkAdType)]);
  const [rateTouched, setRateTouched] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Follow the standard rate while the clip type is still being chosen; stop once it is overridden.
  useEffect(() => {
    if (!rateTouched) setRatePerClip(PENALTY_RATES[clipType]);
  }, [clipType, rateTouched]);

  const total = penaltyAmount(clips, ratePerClip);

  const save = async () => {
    if (clips < 1 || ratePerClip <= 0) {
      toast({ title: "Check the numbers", description: "A penalty needs at least one clip and a rate above zero.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await addOrderPenalty({ order, clips, ratePerClip, clipType, reason, actor });
      toast({ title: "Penalty added", description: `${formatCurrency(total)} for ${clips} clip${clips === 1 ? "" : "s"}. This is not counted as sales revenue.` });
      onClose();
    } catch {
      toast({ title: "Error", description: "Couldn't add the penalty. Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <h3 className="text-center text-lg font-semibold text-foreground">Add a penalty</h3>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Changes beyond the committed brief on <strong className="text-foreground">{order.businessName || "this order"}</strong>.
        </p>

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Clip type</label>
            <select
              value={clipType}
              data-test="penalty-clip-type"
              onChange={(e) => { setRateTouched(false); setClipType(e.target.value as PenaltyClipType); }}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              {PENALTY_CLIP_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label} — {formatCurrency(t.rate)} each</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">How many clips</label>
              <input
                type="number" min={1} value={clips || ""} data-test="penalty-clips"
                onChange={(e) => setClips(Number(e.target.value) || 0)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Rate per clip (₹)</label>
              <input
                type="number" min={0} value={ratePerClip || ""} data-test="penalty-rate"
                onChange={(e) => { setRateTouched(true); setRatePerClip(Number(e.target.value) || 0); }}
                className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Why (optional)</label>
            <textarea
              rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Client changed the script after the ad was made"
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <span className="text-sm text-muted-foreground">Penalty total</span>
            <span className="font-mono text-base font-semibold text-destructive" data-test="penalty-total">{formatCurrency(total)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Charged to the client on top of the sale. It is not sales revenue and does not count towards anyone's incentives.
          </p>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving} data-test="penalty-save"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            {saving ? "Saving…" : `Add ${formatCurrency(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
