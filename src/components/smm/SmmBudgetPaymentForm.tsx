/**
 * Recording ad money the client has put behind the campaign.
 *
 * ── Why the route is the first question ───────────────────────────────────────────────────────
 * Most clients put their own card on the ad account and Meta bills them; that is one payment, one
 * proof, and nothing to chase. Some pay US instead, and that is a different thing entirely: their
 * money is sitting in our account until somebody funds the ad account, and the only evidence that
 * ever happened is a second screenshot. So the form asks which it was before it asks anything else,
 * and grows the second upload only when the answer makes one necessary.
 *
 * ── Why the date and time are typed ───────────────────────────────────────────────────────────
 * Clients pay on a Sunday evening and it gets written down on Monday morning. Stamping "now" would
 * quietly move the money to the wrong day, and the day is what the month's report has to agree with.
 */
import { useState } from "react";
import { IndianRupee, Loader2, Plus, Upload, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadToCloudinary } from "@/services/cloudinary";
import { addBudgetPayment } from "@/services/smm";
import type { SmmPaymentRoute } from "@/types/smm";

/** `yyyy-MM-ddTHH:mm` for a Date, which is what `datetime-local` wants. */
function localStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SmmBudgetPaymentForm({ campaignId, actor, onDone }: {
  campaignId: string;
  actor: { uid: string; name: string };
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [route, setRoute] = useState<SmmPaymentRoute>("direct");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(() => localStamp(new Date()));
  const [clientProof, setClientProof] = useState("");
  const [metaProof, setMetaProof] = useState("");
  const [uploading, setUploading] = useState<"client" | "meta" | null>(null);
  const [saving, setSaving] = useState(false);

  const viaUs = route === "via_us";

  const upload = async (which: "client" | "meta", file: File) => {
    setUploading(which);
    try {
      const url = await uploadToCloudinary(file);
      if (which === "client") setClientProof(url); else setMetaProof(url);
    } catch {
      toast({ title: "Upload failed", description: "Try again, or save without it and add it later.", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const blockReason =
    !(Number(amount) > 0) ? "Enter the amount"
    : !clientProof ? (viaUs ? "Upload the client's payment screenshot" : "Upload the payment screenshot")
    : null;

  const save = async () => {
    if (blockReason) { toast({ title: blockReason, variant: "destructive" }); return; }
    setSaving(true);
    try {
      await addBudgetPayment(campaignId, {
        amount: Number(amount),
        route,
        method: method.trim() || null,
        note: note.trim() || null,
        clientProofUrl: clientProof || null,
        metaProofUrl: viaUs ? (metaProof || null) : null,
        atMs: Date.parse(when) || Date.now(),
      }, actor);
      setAmount(""); setMethod(""); setNote(""); setClientProof(""); setMetaProof("");
      setWhen(localStamp(new Date()));
      toast({
        title: "Recorded",
        description: viaUs && !metaProof
          ? "Still to be forwarded to Meta — add that screenshot once it is done."
          : undefined,
      });
      onDone?.();
    } catch {
      toast({ title: "Not saved", description: "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const proofBox = (which: "client" | "meta", label: string, url: string, clear: () => void) => (
    <div className="flex-1">
      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {url ? (
        <div className="mt-0.5 flex h-9 items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 text-[11px] text-success">
          <Check size={12} className="shrink-0" />
          <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline">View</a>
          <button
            onClick={clear}
            aria-label={`Remove ${label}`}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-success/80 hover:bg-success/20"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <label
          data-test={`smm-pay-upload-${which}`}
          className="mt-0.5 flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-background px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent"
        >
          {uploading === which ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading === which ? "Uploading…" : "Screenshot"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(which, f); }}
          />
        </label>
      )}
    </div>
  );

  return (
    <div data-test="smm-budget-form" className="mt-2 space-y-2.5 rounded-lg border border-border bg-background p-3">
      {/* The route decides what the rest of the form even asks for, so it leads. */}
      <div>
        <label className="text-[11px] font-medium text-muted-foreground">How was it paid?</label>
        <div className="mt-1 flex gap-1.5">
          {([
            { key: "direct" as const, label: "Client paid Meta directly", hint: "Their card on the ad account" },
            { key: "via_us" as const, label: "Client paid us", hint: "We fund the ad account" },
          ]).map(({ key, label, hint }) => (
            <button
              key={key}
              type="button"
              data-test={`smm-pay-route-${key}`}
              aria-pressed={route === key}
              onClick={() => setRoute(key)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-left transition-colors ${
                route === key ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
              }`}
            >
              <span className={`block text-[11px] font-medium ${route === key ? "text-primary" : "text-foreground"}`}>{label}</span>
              <span className="block text-[10px] text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Amount</label>
          <IndianRupee size={12} className="absolute left-2.5 top-[26px] text-muted-foreground" />
          <input
            type="number"
            min={0}
            value={amount}
            data-test="smm-budget-amount"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="mt-0.5 h-9 w-full rounded-md border border-border bg-card pl-7 pr-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="w-28">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">How</label>
          <input
            value={method}
            data-test="smm-budget-method"
            onChange={(e) => setMethod(e.target.value)}
            placeholder="GPay"
            className="mt-0.5 h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">When the money moved</label>
        <input
          type="datetime-local"
          value={when}
          data-test="smm-budget-when"
          onChange={(e) => setWhen(e.target.value)}
          className="mt-0.5 h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>

      {/* One proof for a direct payment, two for one that came through us. */}
      <div className="flex gap-2">
        {proofBox("client", viaUs ? "Client → us" : "Client → Meta", clientProof, () => setClientProof(""))}
        {viaUs && proofBox("meta", "Us → Meta", metaProof, () => setMetaProof(""))}
      </div>
      {viaUs && !metaProof && (
        <p data-test="smm-pay-forward-hint" className="text-[11px] text-warning">
          Save it now if you have not funded the ad account yet — it will show as still to forward,
          and you can add that screenshot from the list below.
        </p>
      )}

      <input
        value={note}
        data-test="smm-budget-note"
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary"
      />

      <button
        onClick={save}
        disabled={saving || !!uploading || !!blockReason}
        data-test="smm-budget-add"
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        {saving ? "Saving…" : blockReason || "Record this payment"}
      </button>
    </div>
  );
}
