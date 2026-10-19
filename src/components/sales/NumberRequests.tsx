/**
 * Number requests on screen (owner, 2026-10-19) — see services/numberRequests for the flow.
 *
 * `NumberRequestAction` is the requester's side: who holds the number, and "Request this number" (or
 * where the request stands). `NumberRequestsPanel` is the deciding side: the holder's My Leads and the
 * sales admin's Leads Management list what is waiting, with Give / Decline.
 */
import { useEffect, useState } from "react";
import { Loader2, ArrowRightLeft, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { decideNumberRequest, findNumberHolding, requestNumber, type NumberHolder, type NumberHolding } from "@/services/numberRequests";
import { mayDecideNumberRequest } from "@/utils/numberRequest";
import type { NumberRequest, UserRole } from "@/types";

export function NumberRequestAction({ phone, requesterLeadId, user, myRequest, compact }: {
  phone: string;
  requesterLeadId: string | null;
  user: { uid: string; name: string; createdBy?: string | null };
  /** This member's latest request for this number, from their requests listener. */
  myRequest?: NumberRequest | null;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [holding, setHolding] = useState<NumberHolding | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    findNumberHolding(phone, user.uid)
      .then((h) => { if (!cancelled) setHolding(h); })
      .catch(() => { if (!cancelled) setHolding({ holder: null, leftLeadIds: [] }); });
    return () => { cancelled = true; };
  }, [phone, user.uid]);

  const holder: NumberHolder | null | undefined = holding === undefined ? undefined : holding.holder;
  /** Nobody active holds it — only a departed member's lead, or nothing: hers to take, no one to ask. */
  const free = holding !== undefined && !holding.holder;
  const left = free && holding!.leftLeadIds.length > 0;
  // A request waiting on someone who has left (or nobody) can never be decided: offer Take it back instead.
  const pending = myRequest?.status === "pending" && !free;
  const declined = myRequest?.status === "declined";
  const holderName = holder?.name;

  const ask = async () => {
    setBusy(true);
    try {
      const res = await requestNumber({ requester: user, phone, requesterLeadId });
      if (res.kind === "requested") {
        toast({
          title: "Request sent",
          description: res.holder.hasSale
            ? `${res.holder.name} sold to this number, so the sales admin decides. You'll be told.`
            : `${res.holder.name} or the sales admin can give it to you. You'll be told.`,
        });
      } else if (res.kind === "already_pending") {
        toast({ title: "Already requested", description: `Waiting for ${res.holderName} or the sales admin.` });
      } else if (res.kind === "reopened") {
        toast({
          title: "Number is yours",
          description: res.fromLeftMember
            ? "The member who had it has left the team — it is in your list now."
            : "Nobody else holds it now — your lead is back in your list.",
        });
        setHolding({ holder: null, leftLeadIds: [] });
      } else {
        toast({ title: "Nobody holds this number", description: "Add it with Add Custom Lead." });
      }
    } catch (err) {
      toast({ title: "Not sent", description: err instanceof Error && err.message ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "mt-1"}`} data-test="number-request">
      <span className="min-w-0">
        {holding === undefined
          ? "Checking who has it…"
          : holderName
            ? <>Now with <b className="font-semibold">{holderName}</b>{holder?.hasSale ? " (sold)" : ""}.</>
            : left
              ? "The member who had it has left the team — you can take it."
              : "Nobody else holds it now."}
      </span>
      {pending ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" data-test="number-request-pending">
          <Loader2 size={11} className="animate-spin" />
          Requested — waiting for {myRequest!.holderHasSale ? "the sales admin" : `${myRequest!.holderName} or the sales admin`}
        </span>
      ) : (
        <button
          type="button"
          onClick={ask}
          disabled={busy || holding === undefined || (free && !left && !requesterLeadId)}
          data-test="number-request-button"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowRightLeft size={13} />}
          {free ? (requesterLeadId ? "Take it back" : "Take this number") : declined ? "Ask again" : "Request this number"}
        </button>
      )}
      {declined && !pending && (
        <span className="text-[11px] text-muted-foreground">Last request declined by {myRequest!.decidedByName || "the holder"}.</span>
      )}
    </div>
  );
}

export function NumberRequestsPanel({ requests, actor, adminView }: {
  requests: NumberRequest[];
  actor: { uid: string; name: string; role: UserRole | string };
  /** The sales admin's list: names the holder on each row. */
  adminView?: boolean;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  if (requests.length === 0) return null;

  const decide = async (r: NumberRequest, approve: boolean) => {
    if (approve) {
      const { confirmed } = await confirm({
        title: "Give this number?",
        description: `${r.phone} goes to ${r.requesterName}. ${adminView ? `${r.holderName}'s` : "Your"} lead on it is closed${r.holderHasSale ? " — its sales stay where they are" : ""}.`,
        confirmText: "Give it",
      });
      if (!confirmed) return;
    }
    setBusyId(r.id);
    const res = await decideNumberRequest({ requestId: r.id, actor, approve });
    setBusyId(null);
    toast({ title: res.ok ? (approve ? "Number given" : "Declined") : "Not done", description: res.message, variant: res.ok ? undefined : "destructive" });
  };

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2" data-test="number-requests-panel">
      {ConfirmDialog}
      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <ArrowRightLeft size={14} className="text-primary" /> Number requests ({requests.length})
      </p>
      {requests.map((r) => {
        const may = mayDecideNumberRequest(r, actor);
        return (
          <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg bg-card border border-border p-2.5" data-test="number-request-row">
            <div className="min-w-0 flex-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{r.requesterName}</span> asks for{" "}
              <span className="font-mono text-foreground">{r.phone}</span>
              {r.displayName && r.displayName !== r.phone ? <> ({r.displayName})</> : null}
              {adminView ? <> — now with <span className="text-foreground">{r.holderName}</span></> : null}
              {r.holderHasSale ? <span className="ml-1 rounded bg-success/15 px-1.5 py-0.5 text-[10px] text-success">sold</span> : null}
            </div>
            {may.ok ? (
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => decide(r, true)}
                  className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                >
                  {busyId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Give
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => decide(r, false)}
                  className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground inline-flex items-center gap-1 hover:bg-accent disabled:opacity-50"
                >
                  <X size={12} /> Decline
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground shrink-0">{may.reason}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
