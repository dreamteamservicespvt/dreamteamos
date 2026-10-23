import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Loader2, ShieldCheck, Undo2, Upload } from "lucide-react";
import AiModal, { buttonClass, fieldClass } from "./AiModal";
import { reviewProProof, type Actor } from "@/services/aiAccounts";
import type { FlowAccount } from "@/types/aiAccounts";
import {
  memberProProofRows, PRO_PROOF_STATE, PRO_PROOF_VERDICT, proProofCounts, proProofReviewQueue, proProofStateOf, SEND_BACK_REASONS, type ProProofState,
} from "@/utils/proProof";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const when = (ms?: number) => (ms ? new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/**
 * The "Pro proof" tab (2026-10-23, utils/proProof) — for the tech admin and team leaders: where the team
 * stands (not sent / waiting / confirmed / sent back), each member's numbers worst first, and the list of
 * accounts in any of those states. **Check proofs** walks the waiting ones one at a time — the screenshot
 * beside the account's email and what the app read — with Confirm Pro (C) and Send back (S), and moves on
 * by itself, so the whole team's proofs are a few minutes of work.
 */
export default function ProProofPanel({
  accounts, actor, onSend,
}: {
  accounts: FlowAccount[];
  actor: Actor;
  /** A reviewer sends the proof for an account themselves (the member's screenshot came by WhatsApp). */
  onSend: (account: FlowAccount) => void;
}) {
  const [state, setState] = useState<ProProofState>("submitted");
  const [member, setMember] = useState("");
  const [review, setReview] = useState<{ ids: string[]; index: number } | null>(null);

  const counts = useMemo(() => proProofCounts(accounts), [accounts]);
  const rows = useMemo(() => memberProProofRows(accounts), [accounts]);
  const queue = useMemo(() => proProofReviewQueue(member ? accounts.filter((a) => a.ownerId === member) : accounts), [accounts, member]);
  const shown = useMemo(() => {
    const list = accounts.filter((a) => a.status !== "disabled" && proProofStateOf(a) === state && (!member || a.ownerId === member));
    return state === "submitted" ? proProofReviewQueue(list) : list.sort((a, b) => a.ownerName.localeCompare(b.ownerName) || a.email.localeCompare(b.email));
  }, [accounts, state, member]);

  const tiles: { id: ProProofState; label: string; value: number; tone: string }[] = [
    { id: "none", label: "Not sent", value: counts.none, tone: "text-foreground" },
    { id: "submitted", label: "Waiting for check", value: counts.submitted, tone: "text-info" },
    { id: "confirmed", label: "Pro confirmed", value: counts.confirmed, tone: "text-success" },
    { id: "rejected", label: "Sent back", value: counts.rejected, tone: "text-destructive" },
  ];
  const pct = counts.total ? Math.round((counts.confirmed / counts.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 min-w-0" data-test="pro-proof-summary">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm font-semibold text-foreground inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Pro proof</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <b className="font-display text-xl text-foreground" data-test="pro-proof-confirmed">{counts.confirmed}</b> / {counts.total} accounts confirmed Pro
              <span className="ml-1 text-[11px]">· {counts.sent} sent · {counts.none} not sent</span>
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
          </div>
          <button className={buttonClass.primary} disabled={!queue.length} onClick={() => setReview({ ids: queue.map((a) => a.id), index: 0 })} data-test="pro-proof-start">
            <ShieldCheck className="h-4 w-4" /> {queue.length ? `Check proofs (${queue.length})` : "Nothing to check"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tiles.map((t) => (
            <button key={t.id} onClick={() => setState(t.id)} data-test={`pro-proof-tile-${t.id}`}
              className={cn("rounded-lg border p-2.5 text-left min-w-0 transition-colors", state === t.id ? "border-primary/60 bg-primary/5" : "border-border hover:bg-accent")}>
              <p className="text-[11px] text-muted-foreground truncate">{t.label}</p>
              <p className={cn("font-display text-lg font-bold tabular-nums", t.tone)}>{t.value}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="font-display text-sm font-semibold text-foreground">By member</h3>
          <p className="text-[11px] text-muted-foreground">By the accounts each person opened · tap a row to see only theirs</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-test="pro-proof-members">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-medium px-4 py-2">Member</th>
                <th className="text-right font-medium px-2 py-2">Accounts</th>
                <th className="text-right font-medium px-2 py-2">Sent</th>
                <th className="text-right font-medium px-2 py-2">Not sent</th>
                <th className="text-right font-medium px-2 py-2">Waiting</th>
                <th className="text-right font-medium px-2 py-2">Confirmed</th>
                <th className="text-right font-medium px-4 py-2">Sent back</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid} onClick={() => setMember(member === r.uid ? "" : r.uid)} data-test="pro-proof-member-row"
                  className={cn("border-t border-border cursor-pointer hover:bg-accent/50", member === r.uid && "bg-primary/5")}>
                  <td className="px-4 py-2 text-foreground truncate max-w-[10rem]">{r.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.total}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.sent}</td>
                  <td className={cn("px-2 py-2 text-right tabular-nums", r.none ? "font-semibold text-foreground" : "text-muted-foreground")}>{r.none}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-info">{r.submitted}</td>
                  <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", r.confirmed >= r.total ? "text-success" : "text-foreground")}>{r.confirmed}</td>
                  <td className={cn("px-4 py-2 text-right tabular-nums", r.rejected ? "font-semibold text-destructive" : "text-muted-foreground")}>{r.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-sm font-semibold text-foreground">{PRO_PROOF_STATE[state].label} ({shown.length})</h3>
          {member ? (
            <button className={buttonClass.small} onClick={() => setMember("")} data-test="pro-proof-member-clear">
              {rows.find((r) => r.uid === member)?.name || "Member"} only · show everyone
            </button>
          ) : null}
        </div>
        {shown.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">No account here.</div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {shown.map((a) => {
              const proof = a.proProof;
              const reading = proof?.reading ? PRO_PROOF_VERDICT[proof.reading.verdict] : null;
              return (
                <div key={a.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-2.5 min-w-0" data-test="pro-proof-row">
                  {proof ? (
                    <img src={proof.imageUrl} alt="" loading="lazy" className="h-14 w-20 shrink-0 rounded-md border border-border object-cover bg-muted" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-semibold text-foreground truncate" title={a.email}>{a.email}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {a.ownerName}{proof ? ` · sent ${when(proof.submittedAt)}` : ""}
                      {reading && state === "submitted" ? <> · <span className={reading.tone}>{reading.label}</span></> : null}
                      {proof?.duplicateOf && state === "submitted" ? <> · <span className="text-destructive">same picture as {proof.duplicateOf}</span></> : null}
                    </p>
                    {state === "rejected" && proof?.reason ? <p className="text-[11px] text-destructive truncate" title={proof.reason}>{proof.reason}</p> : null}
                  </div>
                  {proof ? (
                    <button className={buttonClass.small} onClick={() => setReview({ ids: shown.map((x) => x.id), index: shown.indexOf(a) })} data-test="pro-proof-open-review">
                      {state === "submitted" ? "Check" : "View"}
                    </button>
                  ) : (
                    <button className={buttonClass.small} onClick={() => onSend(a)} data-test="pro-proof-send-for"><Upload className="h-3.5 w-3.5" /> Send proof</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ProProofReviewDialog
        open={!!review}
        ids={review?.ids || []}
        index={review?.index || 0}
        onIndex={(index) => setReview((r) => (r ? { ...r, index } : r))}
        accounts={accounts}
        actor={actor}
        onClose={() => setReview(null)}
      />
    </div>
  );
}

/**
 * One proof at a time, from a fixed list (what was on screen when it opened — a proof decided here stays
 * in the list, so Back still finds it). Confirm Pro / Send back decide and move to the next; C and S on
 * the keyboard do the same, ← → move without deciding.
 */
export function ProProofReviewDialog({
  open, ids, index, onIndex, accounts, actor, onClose,
}: {
  open: boolean;
  ids: string[];
  index: number;
  onIndex: (index: number) => void;
  accounts: FlowAccount[];
  actor: Actor;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const account = accounts.find((a) => a.id === ids[index]) || null;
  const proof = account?.proProof || null;
  const done = open && index >= ids.length;

  useEffect(() => { setSendingBack(false); setReason(""); }, [index, open]);

  const go = (to: number) => onIndex(Math.max(0, Math.min(ids.length, to)));

  const decide = async (decision: "confirm" | "send_back") => {
    if (!account || !proof || inFlight.current) return;
    if (decision === "send_back" && !reason.trim()) { setSendingBack(true); return; }
    inFlight.current = true;
    setBusy(true);
    try {
      await reviewProProof(account, decision, actor, { seenAt: proof.submittedAt, reason });
      toast({ title: decision === "confirm" ? "Pro confirmed" : "Sent back", description: account.email });
      go(index + 1);
    } catch (err) {
      toast({ title: "That did not save", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // C = confirm, S = send back, ← → = move. Not while typing a reason.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.("input, textarea, select");
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if ((e.key === "c" || e.key === "C") && proof && proof.status !== "confirmed") void decide("confirm");
      else if ((e.key === "s" || e.key === "S") && proof) setSendingBack(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const state = account ? proProofStateOf(account) : "none";
  const reading = proof?.reading;
  const verdict = reading ? PRO_PROOF_VERDICT[reading.verdict] : null;

  return (
    <AiModal open={open} onClose={onClose} wide testId="pro-proof-review"
      title={done ? "All checked" : `Check the Pro proof · ${Math.min(index + 1, ids.length)} of ${ids.length}`}
      subtitle={done ? undefined : "Confirm when the picture shows the Pro badge and exactly this email. Keys: C confirm · S send back · ← →"}
      footer={done ? <button className={buttonClass.primary} onClick={onClose}>Close</button> : <>
        <button className={buttonClass.ghost} onClick={() => go(index - 1)} disabled={index === 0 || busy} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
        <button className={buttonClass.ghost} onClick={() => go(index + 1)} disabled={busy} data-test="pro-review-skip">Skip <ChevronRight className="h-4 w-4" /></button>
        <button className={cn(buttonClass.ghost, "border-destructive/40 text-destructive")} onClick={() => decide("send_back")} disabled={!proof || busy || (sendingBack && !reason.trim())} data-test="pro-review-send-back">
          <Undo2 className="h-4 w-4" /> Send back
        </button>
        <button className={cn(buttonClass.primary, "bg-success hover:bg-success/90")} onClick={() => decide("confirm")} disabled={!proof || busy || state === "confirmed"} data-test="pro-review-confirm">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm Pro
        </button>
      </>}>
      {done ? (
        <p className="py-6 text-center text-sm text-muted-foreground" data-test="pro-review-done">Every proof in this list has been looked at.</p>
      ) : !account || !proof ? (
        <p className="py-6 text-center text-sm text-muted-foreground">This account is no longer in the list. Skip to the next one.</p>
      ) : (
        <div className="grid gap-3 text-sm">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 min-w-0">
            <p className="text-[11px] text-muted-foreground">This account</p>
            <p className="font-mono text-base font-semibold text-foreground break-all" data-test="pro-review-email">{account.email}</p>
            <p className="text-[11px] text-muted-foreground">
              Opened by {account.ownerName} · sent by {proof.submittedByName} {when(proof.submittedAt)}
              {" · "}<span className={cn("font-semibold", PRO_PROOF_STATE[state].tone, "bg-transparent")}>{PRO_PROOF_STATE[state].label}</span>
              {proof.reviewedByName && state !== "submitted" ? ` by ${proof.reviewedByName}` : ""}
            </p>
          </div>

          {verdict && reading ? (
            <div className={cn("rounded-lg border px-3 py-2 text-xs", reading.verdict === "mismatch" ? "border-destructive/30 bg-destructive/5" : "border-border")} data-test="pro-review-reading">
              <p className={cn("inline-flex items-center gap-1.5 font-semibold", verdict.tone)}>
                {reading.verdict === "match" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} The app read: {verdict.label}
              </p>
              <p className="mt-0.5 text-muted-foreground">{reading.note}{reading.email && reading.verdict !== "mismatch" ? ` (${reading.email})` : ""}</p>
            </div>
          ) : null}
          {proof.duplicateOf ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive" data-test="pro-review-duplicate">
              The same picture was sent for {proof.duplicateOf} too.
            </p>
          ) : null}
          {state === "rejected" && proof.reason ? <p className="text-xs text-destructive">Sent back: {proof.reason}</p> : null}

          <a href={proof.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border bg-muted" title="Open the full picture">
            <img src={proof.imageUrl} alt={`Pro proof for ${account.email}`} className="max-h-[50vh] w-full object-contain" data-test="pro-review-image" />
          </a>
          <a href={proof.imageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3 w-3" /> Open the full picture
          </a>

          {sendingBack ? (
            <div className="grid gap-2 rounded-lg border border-destructive/30 p-3" data-test="pro-review-reasons">
              <p className="text-xs font-medium text-foreground">Why is it sent back? They are told this.</p>
              <div className="flex flex-wrap gap-1.5">
                {SEND_BACK_REASONS.map((r) => (
                  <button key={r} className={cn(buttonClass.small, "h-auto py-1 whitespace-normal text-left shrink max-w-full", reason === r && "border-destructive/60 bg-destructive/10")} onClick={() => setReason(r)}>{r}</button>
                ))}
              </div>
              <input className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or write the reason" data-test="pro-review-reason" />
            </div>
          ) : null}
        </div>
      )}
    </AiModal>
  );
}
