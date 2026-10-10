import { ArrowRight, CheckCircle2, KeyRound } from "lucide-react";
import { buttonClass } from "./AiModal";
import type { FlowAccount } from "@/types/aiAccounts";
import { cn } from "@/lib/utils";

/**
 * How many of the accounts a member opened carry a Gemini API key (2026-10-10, utils/geminiKeys), and a
 * button straight to the next one that needs a key — so thirty keys are thirty taps of "Save & next",
 * not a hunt through the cards.
 */
export default function ApiKeyProgress({
  total, withKey, failed, next, onNext,
}: {
  total: number;
  withKey: number;
  failed: number;
  /** The account "Add next key" opens. */
  next: FlowAccount | null;
  onNext: () => void;
}) {
  if (total === 0) return null;
  const pct = Math.min(100, Math.round((withKey / total) * 100));
  const done = withKey >= total;
  return (
    <div className={cn("bg-card border rounded-xl p-4 min-w-0", done ? "border-success/40" : "border-primary/40")} data-test="api-key-progress">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <KeyRound className="h-4 w-4 text-primary" />}
            <h3 className="font-display text-sm font-semibold text-foreground">Gemini API keys</h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            <b className="font-display text-xl text-foreground" data-test="api-key-progress-count">{withKey}</b> / {total} of your accounts have a key
          </p>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full", done ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {done ? "Every account you opened has a working key — thank you." : "Add the free key made in each account you opened. DTS AdGen writes its prompts with these keys."}
          </p>
          {failed > 0 ? (
            <p className="mt-1 text-[11px] font-medium text-destructive" data-test="api-key-progress-failed">
              {failed === 1 ? "1 key stopped working" : `${failed} keys stopped working`} — replace {failed === 1 ? "it" : "them"} with a new key.
            </p>
          ) : null}
        </div>
        {next ? (
          <button className={cn(buttonClass.primary, "h-auto py-2 flex-col items-start gap-0 sm:max-w-[16rem]")} onClick={onNext} data-test="api-key-next">
            <span className="inline-flex items-center gap-1.5">{next.apiKey ? "Replace next key" : "Add next key"} <ArrowRight className="h-4 w-4" /></span>
            <span className="max-w-full truncate font-mono text-[10px] font-normal opacity-90">{next.email}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
