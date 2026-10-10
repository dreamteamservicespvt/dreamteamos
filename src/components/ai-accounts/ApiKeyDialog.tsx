import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import AiModal, { buttonClass } from "./AiModal";
import { ApiKeySteps } from "./ApiKeyField";
import { saveFlowApiKey, type Actor } from "@/services/aiAccounts";
import type { FlowAccount } from "@/types/aiAccounts";
import { useApiKeyEntry } from "@/hooks/useApiKeyEntry";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Adding (or replacing) the Gemini API key made in one Flow account (2026-10-10, utils/geminiKeys) — from
 * the card's "Add API key" / "Replace key" and the progress card's "Add next key". A new Flow account is
 * asked for its key in its own form (FlowAccountDialog); this is for the accounts added before, a key added
 * later, and a key that stopped working.
 *
 * It walks the member through AI Studio — opened in THIS account — with the key's name and project
 * ready to copy, then checks the pasted key with Google before it is saved: a typo, a key cut short, an
 * invalid or leaked key, or the same key already on another account is caught here, not weeks later in
 * a failed ad. "Save & next" moves straight on to the next account without a key.
 */
export default function ApiKeyDialog({
  open, onClose, account, accounts, actor, remaining = 0, showSteps = true, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  account: FlowAccount | null;
  /** Every account this person can see — a key already saved on one of them is refused. */
  accounts: FlowAccount[];
  actor: Actor;
  /** Accounts still waiting for a key after this one; above 0 it offers "Save & next". */
  remaining?: number;
  /** Open with every step shown (folded for someone who has saved a key before). */
  showSteps?: boolean;
  onSaved: (account: FlowAccount, next: boolean) => void;
}) {
  const { toast } = useToast();
  const [stepsOpen, setStepsOpen] = useState(showSteps);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const entry = useApiKeyEntry({
    active: open && !!account,
    resetKey: `${open}:${account?.id || ""}`,
    email: account?.email || "",
    accounts,
    accountId: account?.id,
    currentFingerprint: account?.apiKey?.fingerprint,
  });

  useEffect(() => {
    if (open) setStepsOpen(showSteps);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- folded or not per account opened, not when the hint changes
  }, [open, account?.id]);

  if (!account) return null;

  const save = async (next: boolean) => {
    if (inFlight.current) return;
    if (!entry.value.trim()) return entry.setError("Paste the API key.");
    if (entry.blocker) return entry.setError(entry.blocker);
    inFlight.current = true;
    setSaving(true);
    try {
      const answer = await entry.resolve();
      if (answer.status === "failed") { entry.setError(answer.message || "Google refused this key."); return; }
      await saveFlowApiKey(account, entry.key, answer, actor);
      toast({
        title: account.apiKey ? "API key replaced" : "API key saved",
        description: answer.status === "working" ? `${account.email} — Google accepted it.` : `${account.email} — saved; Google could not be reached to check it yet.`,
      });
      onSaved(account, next);
    } catch (err) {
      toast({ title: "Could not save the key", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <AiModal
      open={open}
      onClose={onClose}
      testId="api-key-dialog"
      title={account.apiKey ? "Replace the Gemini API key" : "Add a Gemini API key"}
      subtitle={<span className="font-mono text-foreground break-all">{account.email}</span>}
      footer={<>
        <button className={buttonClass.ghost} onClick={onClose} disabled={saving}>Cancel</button>
        <button className={remaining > 0 ? buttonClass.ghost : buttonClass.primary} onClick={() => save(false)} disabled={saving} data-test="api-key-save">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save key
        </button>
        {remaining > 0 ? (
          <button className={buttonClass.primary} onClick={() => save(true)} disabled={saving} data-test="api-key-save-next">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save &amp; next ({remaining} left)
          </button>
        ) : null}
      </>}
    >
      <div className="grid gap-4">
        <p className="text-xs text-muted-foreground">
          Every Flow account can make its own free Gemini key. The team uses these keys to write the prompts in DTS AdGen — one key per account.
        </p>

        {account.apiKey ? (
          <div className={cn("rounded-lg border px-3 py-2 text-xs", account.apiKey.status === "failed" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/40 text-muted-foreground")}>
            {account.apiKey.status === "failed"
              ? <>The key on this account stopped working: {account.apiKey.message || "Google refused it."} Make a new one and paste it below.</>
              : <>This account already has a key. A new key you save here replaces it.</>}
          </div>
        ) : null}

        <ApiKeySteps entry={entry} email={account.email} stepsOpen={stepsOpen} onShowSteps={() => setStepsOpen(true)} />
      </div>
    </AiModal>
  );
}
