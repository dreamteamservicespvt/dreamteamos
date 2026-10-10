import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { getAccountSecret } from "@/services/aiAccounts";
import { useToast } from "@/hooks/use-toast";

/**
 * A password, fetched only when someone asks to see or copy it — lists never carry passwords (they
 * live in their own collection, see types/aiAccounts), so opening the page reads none of them. The same
 * for a Flow account's Gemini API key (`kind="apiKey"`, 2026-10-10).
 */
export default function SecretField({ kind, id }: { kind: "flow" | "paid" | "apiKey"; id: string }) {
  const what = kind === "apiKey" ? "API key" : "password";
  const { toast } = useToast();
  const [secret, setSecret] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async (): Promise<string | null> => {
    if (secret !== null) return secret;
    setBusy(true);
    try {
      const value = await getAccountSecret(kind, id);
      setSecret(value);
      return value;
    } catch {
      toast({ title: `Could not load the ${what}`, description: "You may not have access to this account.", variant: "destructive" });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (shown) { setShown(false); return; }
    if ((await load()) !== null) setShown(true);
  };

  const copy = async () => {
    const value = await load();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", description: "Tap Show and copy it by hand.", variant: "destructive" });
    }
  };

  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className="font-mono text-xs text-foreground truncate max-w-[9rem]" data-test="secret-value" title={shown && secret ? secret : undefined}>
        {shown && secret !== null ? (secret || "—") : "••••••••"}
      </span>
      <button type="button" onClick={toggle} aria-label={shown ? `Hide ${what}` : `Show ${what}`} data-test="secret-toggle"
        className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={copy} aria-label={`Copy ${what}`} data-test="secret-copy"
        className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}
