import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { buttonClass } from "./AiModal";
import type { FlowAccount } from "@/types/aiAccounts";
import type { ProProofCounts } from "@/utils/proProof";
import { cn } from "@/lib/utils";

/**
 * How many of the accounts a member opened are confirmed Google AI Pro (2026-10-23, utils/proProof), what
 * is waiting or was sent back, and a button straight to the next account that needs a proof — sent-back
 * ones first — so thirty proofs are thirty screenshots and "Send & next", not a hunt through the cards.
 */
export default function ProProofProgress({
  counts, next, onNext,
}: {
  counts: ProProofCounts;
  /** The account "Send next proof" opens. */
  next: FlowAccount | null;
  onNext: () => void;
}) {
  if (counts.total === 0) return null;
  const pct = Math.min(100, Math.round((counts.confirmed / counts.total) * 100));
  const done = counts.confirmed >= counts.total;
  return (
    <div className={cn("bg-card border rounded-xl p-4 min-w-0", done ? "border-success/40" : "border-primary/40")} data-test="pro-proof-progress">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <ShieldCheck className="h-4 w-4 text-primary" />}
            <h3 className="font-display text-sm font-semibold text-foreground">Pro proof</h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            <b className="font-display text-xl text-foreground" data-test="pro-proof-progress-count">{counts.confirmed}</b> / {counts.total} of your accounts confirmed Pro
          </p>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full", done ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground" data-test="pro-proof-progress-detail">
            {done ? "Every account you opened is confirmed Pro — thank you."
              : `${counts.sent} sent · ${counts.submitted} waiting for a check · ${counts.none} not sent yet. Send a screenshot of myaccount.google.com from each account.`}
          </p>
          {counts.rejected > 0 ? (
            <p className="mt-1 text-[11px] font-medium text-destructive" data-test="pro-proof-progress-back">
              {counts.rejected === 1 ? "1 proof was sent back" : `${counts.rejected} proofs were sent back`} — see the reason on the card and send {counts.rejected === 1 ? "it" : "them"} again.
            </p>
          ) : null}
        </div>
        {next ? (
          <button className={cn(buttonClass.primary, "h-auto py-2 flex-col items-start gap-0 sm:max-w-[16rem]")} onClick={onNext} data-test="pro-proof-next">
            <span className="inline-flex items-center gap-1.5">{next.proProof ? "Send again" : "Send next proof"} <ArrowRight className="h-4 w-4" /></span>
            <span className="max-w-full truncate font-mono text-[10px] font-normal opacity-90">{next.email}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
