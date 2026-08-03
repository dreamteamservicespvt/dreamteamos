import { useState } from "react";
import { Check, Copy, Eye, EyeOff, ExternalLink, KeyRound, PartyPopper, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { IssuedCredentials } from "@/types/onboarding";

/**
 * The other side of the signature: what the person came for.
 *
 * This screen is shown once, at the end of a journey the candidate cannot repeat, so it has to be
 * impossible to leave by accident without the password. Hence copy buttons on both fields, a reveal
 * rather than a permanently-masked field, and a plain warning that this is the only time it is shown
 * on screen — their admin can send it again, but they should not have to ask.
 */
export default function CredentialsStep({ credentials, name }: {
  credentials: IssuedCredentials;
  name: string;
}) {
  const { toast } = useToast();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);

  const copy = async (what: "email" | "password", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1800);
    } catch {
      toast({ title: "Could not copy", description: "Please select and copy it by hand.", variant: "destructive" });
    }
  };

  const firstName = name.trim().split(/\s+/)[0] || name;

  return (
    <div className="space-y-4" data-test="credentials-step">
      <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-5 text-center">
        <PartyPopper className="mx-auto mb-2 h-8 w-8 text-success" />
        <h2 className="text-lg font-bold text-foreground">Welcome aboard, {firstName}!</h2>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Both letters are signed and saved to your employee record. Here is your login for the
          platform — you will find your signed copies inside it any time you need them.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <KeyRound className="h-3.5 w-3.5" /> Your login
        </p>

        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Email</label>
        <div className="mb-3 flex items-center gap-2">
          <input
            readOnly
            value={credentials.email}
            data-test="credentials-email"
            className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground outline-none"
          />
          <button
            onClick={() => copy("email", credentials.email)}
            title="Copy email"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {copied === "email" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>

        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Password</label>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              readOnly
              type={revealed ? "text" : "password"}
              value={credentials.password}
              data-test="credentials-password"
              className="h-11 w-full rounded-lg border border-border bg-background px-3 pr-10 font-mono text-sm text-foreground outline-none"
            />
            <button
              onClick={() => setRevealed((v) => !v)}
              title={revealed ? "Hide" : "Show"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={() => copy("password", credentials.password)}
            title="Copy password"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {copied === "password" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>

        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-accent/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Save this somewhere safe now. You can change your password any time from your profile, and
          your admin can send it to you again if you lose it.
        </p>
      </div>

      <a
        href={credentials.loginUrl}
        data-test="credentials-open"
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Open the platform <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}
