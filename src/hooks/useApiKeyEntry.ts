import { useEffect, useRef, useState } from "react";
import { checkGeminiApiKey } from "@/services/aiAccounts";
import type { FlowAccount } from "@/types/aiAccounts";
import { accountWithKey, apiKeyFingerprint, apiKeyProblem, normaliseApiKey, type KeyCheck } from "@/utils/geminiKeys";
import { useToast } from "@/hooks/use-toast";

/**
 * Entering the Gemini API key made in one Flow account (2026-10-10, utils/geminiKeys) — shared by the key
 * dialog on a card (ApiKeyDialog) and the "Add a Flow account" form, which asks for the key with the
 * account (owner, 2026-10-10), so both check and refuse a key exactly the same way. The steps and the box
 * are components/ai-accounts/ApiKeyField (ApiKeySteps).
 */

export interface ApiKeyEntry {
  value: string;
  setValue: (value: string) => void;
  /** The key out of what was pasted (normaliseApiKey). */
  key: string;
  /** Why this can't be saved before Google is even asked — a typo, a key cut short, a key already used. */
  blocker: string | null;
  /** Google's answer for the key as it stands now, once it is in. */
  result: KeyCheck | null;
  checking: boolean;
  setError: (message: string) => void;
  /** What the status line shows in red, if anything. */
  shownError: string | null;
  /** Google's answer for the key as typed — the one already asked, or asked now (Save pressed before it came). */
  resolve: () => Promise<KeyCheck>;
  paste: () => Promise<void>;
}

/**
 * The key being entered, checked with Google as soon as it is pasted (so the person sees ✓ before Save),
 * and refused when it is the key already on this account or on another account the person can see.
 */
export function useApiKeyEntry({
  active, resetKey, email, accounts, accountId, currentFingerprint,
}: {
  /** False while the form is closed (or the key is skipped): nothing is checked. */
  active: boolean;
  /** Everything is cleared when this changes (another account opened). */
  resetKey?: string;
  /** The account the key is made in — named in the duplicate message. */
  email: string;
  accounts: Pick<FlowAccount, "id" | "email" | "apiKey">[];
  /** The account being keyed, when it already exists. */
  accountId?: string;
  /** Its current key's fingerprint — pasting the same key again is refused. */
  currentFingerprint?: string;
}): ApiKeyEntry {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState<{ key: string; result: KeyCheck } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const latestKey = useRef("");

  useEffect(() => {
    setValue(""); setChecked(null); setChecking(false); setError("");
  }, [resetKey]);

  const key = normaliseApiKey(value);
  const problem = value.trim() ? apiKeyProblem(key) : null;
  const fingerprint = key ? apiKeyFingerprint(key) : "";
  const elsewhere = key && !problem ? accountWithKey(accounts, fingerprint, accountId) : null;
  const blocker = !value.trim() ? null
    : problem
    || (currentFingerprint && currentFingerprint === fingerprint ? "This is the key already saved on this account." : null)
    || (elsewhere ? `This key is already saved on ${elsewhere.email}. Each account needs its own key — make it while signed in to ${email || "this account"}.` : null);
  const result = checked?.key === key ? checked.result : null;

  useEffect(() => {
    latestKey.current = key;
    if (!active || !key || blocker) { setChecking(false); return; }
    if (checked?.key === key) return;
    setChecking(true);
    const timer = setTimeout(async () => {
      const answer = await checkGeminiApiKey(key);
      if (latestKey.current !== key) return;
      setChecked({ key, result: answer });
      setChecking(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [active, key, blocker, checked?.key]);

  const resolve = async (): Promise<KeyCheck> => {
    const answer = result || (await checkGeminiApiKey(key));
    setChecked({ key, result: answer });
    return answer;
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) { setValue(text); setError(""); }
      else toast({ title: "The clipboard is empty", description: "Copy the key in AI Studio first." });
    } catch {
      toast({ title: "Paste it into the box", description: "Long-press the box (or press Ctrl+V) to paste." });
    }
  };

  const shownError = error || (value.trim() ? blocker : null) || (result?.status === "failed" ? result.message || "Google refused this key." : null);

  return {
    value, setValue: (v) => { setValue(v); setError(""); }, key, blocker, result, checking, setError, shownError, resolve, paste,
  };
}
