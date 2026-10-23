import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, ImagePlus, Loader2 } from "lucide-react";
import AiModal, { buttonClass } from "./AiModal";
import { prepareProProof, submitProProof, type Actor, type PreparedProProof } from "@/services/aiAccounts";
import type { FlowAccount } from "@/types/aiAccounts";
import { PRO_PROOF_VERDICT, proProofPageUrl, proProofStateOf } from "@/utils/proProof";
import { copyText } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Sending one Flow account's Pro proof (2026-10-23, utils/proProof) — from the card's "Send proof" and the
 * progress card's "Send next proof".
 *
 * The member opens https://myaccount.google.com IN THIS ACCOUNT (the button adds `authuser`), takes one
 * screenshot showing the Pro badge, the full email and the address bar, and drops, pastes (Ctrl+V after
 * Win+Shift+S) or picks it here. The app uploads it, works out its hash and reads it at once, so the member
 * sees "Shows another email" or "No Pro badge" BEFORE it goes to the reviewer — the usual mistake (the
 * screenshot of the account next door) is fixed here, not a day later. Sending a flagged picture anyway
 * needs a tick; the reviewer still sees the flag.
 */
export default function ProProofDialog({
  open, onClose, account, accounts, actor, remaining = 0, onSent,
}: {
  open: boolean;
  onClose: () => void;
  account: FlowAccount | null;
  /** Every account this person can see — the same picture already sent for one of them is caught. */
  accounts: FlowAccount[];
  actor: Actor;
  /** Accounts still waiting for a proof after this one; above 0 it offers "Send & next". */
  remaining?: number;
  onSent: (account: FlowAccount, next: boolean) => void;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [prepared, setPrepared] = useState<PreparedProProof | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [anyway, setAnyway] = useState(false);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  // The picture a slow upload / reading belongs to — one picked after it wins.
  const job = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFile(null); setPrepared(null); setError(""); setAnyway(false); setPreparing(false);
    job.current += 1;
  }, [open, account?.id]);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const take = async (picked: File | null | undefined) => {
    if (!picked || !account) return;
    if (!picked.type.startsWith("image/")) return setError("That is not a picture — send a screenshot (PNG or JPG).");
    if (picked.size > 15 * 1024 * 1024) return setError("That picture is over 15 MB — send a normal screenshot.");
    const mine = ++job.current;
    setFile(picked); setPrepared(null); setError(""); setAnyway(false); setPreparing(true);
    try {
      const result = await prepareProProof(picked, account, accounts);
      if (job.current === mine) setPrepared(result);
    } catch (err) {
      if (job.current === mine) setError(err instanceof Error && err.message ? `The upload failed (${err.message}) — check the connection and pick it again.` : "The upload failed — pick it again.");
    } finally {
      if (job.current === mine) setPreparing(false);
    }
  };

  // Paste anywhere in the dialog: Win+Shift+S, then Ctrl+V.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      const pasted = item?.getAsFile();
      if (pasted) { e.preventDefault(); void take(new File([pasted], `pro-proof-${Date.now()}.png`, { type: pasted.type })); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `take` reads the current account through its arguments
  }, [open, account?.id, accounts]);

  if (!account) return null;

  const pageUrl = proProofPageUrl(account.email);
  const sentBack = proProofStateOf(account) === "rejected" ? account.proProof : null;
  const flagged = !!prepared && (prepared.reading.verdict === "mismatch" || !!prepared.duplicate);
  const canSend = !!prepared && !preparing && (!flagged || anyway);

  const send = async (next: boolean) => {
    if (inFlight.current || !prepared || !canSend) return;
    inFlight.current = true;
    setSending(true);
    try {
      await submitProProof(account, prepared, actor);
      toast({ title: "Proof sent for a check", description: account.email });
      onSent(account, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be sent — try again.");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const verdict = prepared ? PRO_PROOF_VERDICT[prepared.reading.verdict] : null;

  return (
    <AiModal open={open} onClose={onClose} title="Send the Pro proof" testId="pro-proof-dialog"
      subtitle={<span className="font-mono text-foreground break-all">{account.email}</span>}
      footer={<>
        <button className={buttonClass.ghost} onClick={onClose} disabled={sending}>Cancel</button>
        {remaining > 0 ? (
          <button className={buttonClass.ghost} onClick={() => send(true)} disabled={!canSend || sending} data-test="pro-proof-send-next">Send &amp; next</button>
        ) : null}
        <button className={buttonClass.primary} onClick={() => send(false)} disabled={!canSend || sending} data-test="pro-proof-send">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send for check
        </button>
      </>}>
      <div className="grid gap-4 text-sm">
        {sentBack ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" data-test="pro-proof-sent-back">
            Sent back by {sentBack.reviewedByName || "a reviewer"}: <b>{sentBack.reason}</b>
          </p>
        ) : null}

        <ol className="grid gap-2 text-xs text-muted-foreground list-decimal pl-4">
          <li>
            Open the Google Account page <b className="text-foreground">in this account</b>.
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <a className={`${buttonClass.small} border-primary/50 bg-primary/10 text-primary`} href={pageUrl} target="_blank" rel="noreferrer" data-test="pro-proof-open">
                <ExternalLink className="h-3.5 w-3.5" /> Open myaccount.google.com
              </a>
              <button className={buttonClass.small} onClick={async () => toast({ title: (await copyText(pageUrl)) ? "Link copied" : "Could not copy the link" })}>
                <Copy className="h-3.5 w-3.5" /> Copy link
              </button>
            </div>
          </li>
          <li>Check it shows the <b className="text-foreground">Pro</b> badge under the picture and the full email <span className="font-mono text-foreground break-all">{account.email}</span>.</li>
          <li>Take a screenshot of the whole screen, with the address bar — on a computer <b className="text-foreground">Win + Shift + S</b>, then <b className="text-foreground">Ctrl + V</b> here.</li>
        </ol>

        <button type="button" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void take(e.dataTransfer.files?.[0]); }}
          className={cn("relative grid place-items-center overflow-hidden rounded-xl border-2 border-dashed text-center transition-colors min-h-[9rem]",
            preview ? "border-border" : "border-primary/40 hover:bg-primary/5")}
          data-test="pro-proof-drop">
          {preview ? (
            <img src={preview} alt="The screenshot to send" className="max-h-64 w-full object-contain" />
          ) : (
            <span className="grid justify-items-center gap-1 p-4 text-xs text-muted-foreground">
              <ImagePlus className="h-6 w-6 text-primary" />
              <span className="text-foreground font-medium">Paste, drop or choose the screenshot</span>
              <span>PNG or JPG</span>
            </span>
          )}
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" data-test="pro-proof-file"
          onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />

        {preparing ? (
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground" data-test="pro-proof-checking">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading and reading the screenshot…
          </p>
        ) : null}

        {prepared && verdict ? (
          <div className={cn("rounded-lg border px-3 py-2 text-xs", flagged ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30")} data-test="pro-proof-reading">
            <p className={cn("inline-flex items-center gap-1.5 font-semibold", verdict.tone)}>
              {prepared.reading.verdict === "match" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {verdict.label}
            </p>
            <p className="mt-0.5 text-muted-foreground">{prepared.reading.note}</p>
            {prepared.duplicate ? (
              <p className="mt-1 font-medium text-destructive" data-test="pro-proof-duplicate">
                This exact picture was already sent for {prepared.duplicate.email}. Take a new screenshot in this account.
              </p>
            ) : null}
            {flagged ? (
              <label className="mt-2 flex min-h-[24px] items-center gap-2 text-foreground cursor-pointer">
                <input type="checkbox" className="h-4 w-4" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} data-test="pro-proof-anyway" />
                The screenshot is right — send it anyway (the reviewer will see this warning)
              </label>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-xs text-destructive" data-test="pro-proof-error">{error}</p> : null}
      </div>
    </AiModal>
  );
}
