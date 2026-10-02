import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import AiModal, { buttonClass, fieldClass } from "./AiModal";
import {
  editFlowUsage, recordFlowUsage, setActiveFlowAccount, usageForAssignment, type Actor,
} from "@/services/aiAccounts";
import { FLOW_CLIP_SECONDS, type FlowAccount, type FlowClipRow, type FlowClipSeconds, type FlowSettings, type FlowUsageEntry } from "@/types/aiAccounts";
import type { WorkAssignment } from "@/types";
import { accountState, creditsFor, defaultRowsFor, pickDefaultAccount, todayStr } from "@/utils/flowCredits";
import { jobClipCount } from "@/utils/assignmentFormSpec";
import { useToast } from "@/hooks/use-toast";

type Block = { accountId: string; rows: FlowClipRow[] };

/**
 * How many Flow credits an ad used — entered after every ad, before it is marked complete.
 *
 * It starts on the member's "using now" account with the job's own clip count, every clip 8 seconds
 * (what the generator plans), and the credits are worked out as they type. Clips of other lengths are
 * one tap away, because a member often tries 6- or 10-second takes too; and when an account runs out
 * part-way through an ad, the rest goes on the next account in the same entry. The same dialog edits an
 * entry afterwards (mode "edit"), so a wrong number is corrected, not re-entered.
 *
 * A job handed in a second time (back from edits, or after "Undo completion") says what was already
 * recorded for it and starts at 0 clips — offering the whole ad again is how it would be charged twice.
 */
export default function CreditUsageDialog({
  open, onClose, actor, settings, accounts, activeId, mode, assignment, entry, onDone,
}: {
  open: boolean;
  onClose: () => void;
  actor: Actor;
  settings: FlowSettings;
  /** The accounts that can be charged — the ones the member holds; for a manager editing, the team's. */
  accounts: FlowAccount[];
  activeId?: string | null;
  mode: "completion" | "manual" | "edit";
  assignment?: WorkAssignment | null;
  entry?: FlowUsageEntry | null;
  onDone: (result: { credits: number }) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const today = todayStr();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [noUsage, setNoUsage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /** What this person already recorded for this job (completion mode only). */
  const [prior, setPrior] = useState<FlowUsageEntry[]>([]);
  /** Set once the member changes anything — a late answer about earlier entries must not undo their typing. */
  const touched = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setNoUsage(false);
    setPrior([]);
    touched.current = false;
    if (mode === "edit" && entry) {
      setBlocks([{ accountId: entry.accountId, rows: entry.rows.map((r) => ({ ...r })) }]);
      return;
    }
    const start = pickDefaultAccount(accounts, activeId || undefined, actor.uid, today);
    const rows = assignment ? defaultRowsFor(jobClipCount(assignment)) : [{ seconds: 8 as FlowClipSeconds, count: 1 }];
    setBlocks([{ accountId: start, rows }]);
    if (mode !== "completion" || !assignment?.id) return;
    let cancelled = false;
    // Best-effort: if the check cannot run, the dialog simply works as it would for a first hand-in.
    usageForAssignment(actor.uid, assignment.id).then((found) => {
      if (cancelled || found.length === 0) return;
      setPrior(found);
      if (!touched.current) setBlocks((bs) => bs.map((b) => ({ ...b, rows: [{ seconds: 8 as FlowClipSeconds, count: 0 }] })));
    }).catch(() => undefined);
    return () => { cancelled = true; };
    // Only when it opens — a live account snapshot must not reset what the member is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The accounts can still be on their way when the dialog opens (the page was only just loaded):
  // an empty first choice is filled in when they arrive — never one the member already made.
  useEffect(() => {
    if (!open || mode === "edit" || touched.current || accounts.length === 0) return;
    setBlocks((bs) => (bs.length === 1 && !bs[0].accountId
      ? [{ ...bs[0], accountId: pickDefaultAccount(accounts, activeId || undefined, actor.uid, today) }]
      : bs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accounts]);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  /** An entry on an account this person can no longer see (it was moved to someone else). */
  const lostAccount = mode === "edit" && !!entry && !byId.has(entry.accountId);
  const options = useMemo(() => accounts.filter((a) => a.status !== "disabled" || a.id === entry?.accountId), [accounts, entry?.accountId]);

  const edit = (change: (bs: Block[]) => Block[]) => { touched.current = true; setBlocks(change); };
  const setBlock = (i: number, patch: Partial<Block>) => edit((bs) => bs.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const setRow = (i: number, r: number, patch: Partial<FlowClipRow>) =>
    edit((bs) => bs.map((b, k) => (k === i ? { ...b, rows: b.rows.map((row, j) => (j === r ? { ...row, ...patch } : row)) } : b)));
  const priorCredits = prior.reduce((sum, e) => sum + e.credits, 0);

  /** Credits left on an account if this entry is saved — an edited entry's old amount is given back first. */
  const leftAfter = (block: Block) => {
    const account = byId.get(block.accountId);
    if (!account) return null;
    const state = accountState(account, today);
    const giveBack = mode === "edit" && entry && entry.accountId === account.id ? entry.credits : 0;
    return state.remaining + giveBack - creditsFor(block.rows, settings);
  };

  const total = blocks.reduce((sum, b) => sum + creditsFor(b.rows, settings), 0);
  const clipTotal = blocks.reduce((sum, b) => sum + b.rows.reduce((n, r) => n + (Number(r.count) || 0), 0), 0);

  const save = async () => {
    setError("");
    if (lostAccount) return setError("This entry's account is no longer yours — ask your tech admin or team leader to change it.");
    if (!noUsage) {
      if (blocks.some((b) => !b.accountId || !byId.has(b.accountId))) return setError("Choose the Flow account the credits were used from.");
      if (new Set(blocks.map((b) => b.accountId)).size !== blocks.length) return setError("Each account only once — put its clips together.");
      if (total <= 0) return setError("Enter how many clips were generated.");
    }
    setSaving(true);
    try {
      let credits = 0;
      if (mode === "edit" && entry) {
        const account = byId.get(blocks[0].accountId)!;
        await editFlowUsage(entry, { account, rows: blocks[0].rows }, actor, settings);
        credits = creditsFor(blocks[0].rows, settings);
      } else if (!noUsage) {
        credits = await recordFlowUsage(
          blocks.map((b) => ({ account: byId.get(b.accountId)!, rows: b.rows })),
          actor, settings, { assignment: assignment || null, source: mode === "completion" ? "completion" : "manual" }, today,
        );
        // The account the member just worked on is the one they are using now.
        const last = blocks[blocks.length - 1].accountId;
        if (last && last !== activeId) await setActiveFlowAccount(actor.uid, last).catch(() => undefined);
      }
      await onDone({ credits });
    } catch (err) {
      toast({ title: "Could not save the credits", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "edit" ? "Edit credit entry" : mode === "completion" ? "Flow credits used for this ad" : "Record Flow credits";
  const subtitle = mode === "completion"
    ? <>Required before <b>{assignment?.businessName || assignment?.uniqueId || "this job"}</b> is marked complete.</>
    : mode === "edit" && entry ? <>{entry.businessName || entry.uniqueId || "Manual entry"} · {entry.date}</> : "For credits used outside a job — a test or a Tools run.";

  return (
    <AiModal open={open} onClose={saving ? () => undefined : onClose} title={title} subtitle={subtitle} testId="credit-usage-dialog" wide
      footer={<>
        <span className="mr-auto text-sm" data-test="credit-total">
          {noUsage ? <span className="text-muted-foreground">No Flow credits</span>
            : <><b className="text-foreground">{total}</b> <span className="text-muted-foreground">credits · {clipTotal} clip{clipTotal === 1 ? "" : "s"}</span></>}
        </span>
        <button className={buttonClass.ghost} onClick={onClose} disabled={saving}>Cancel</button>
        <button className={buttonClass.primary} onClick={save} disabled={saving || lostAccount} data-test="credit-save">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "completion" ? "Save & mark complete" : "Save"}
        </button>
      </>}
    >
      {lostAccount ? (
        <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
          This entry is on <b>{entry?.accountEmail}</b>, which is no longer yours — ask your tech admin or team leader to change it.
        </div>
      ) : null}
      {options.length === 0 && mode !== "edit" ? (
        <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground" data-test="credit-no-accounts">
          You have no Flow account yet. Add your accounts on <b>My AI Accounts</b>{mode === "completion" ? ", or tick “No Flow credits” below if this job used none." : "."}
        </div>
      ) : null}

      {prior.length > 0 ? (
        <div className="mb-3 rounded-lg border border-info/40 bg-info/10 p-3 text-xs text-foreground" data-test="credit-prior">
          Already recorded for this job: <b>{priorCredits} credits</b>{" "}
          ({prior.map((e) => `${e.rows.map((r) => `${r.count} × ${r.seconds}s`).join(" + ")} on ${e.date}`).join("; ")}).
          {" "}Enter only the clips made since — a re-do after edits — or tick “No Flow credits” if nothing new was generated.
        </div>
      ) : null}

      <fieldset disabled={noUsage} className={noUsage ? "opacity-40" : ""}>
        {blocks.map((block, i) => {
          const account = byId.get(block.accountId);
          const state = account ? accountState(account, today) : null;
          const left = leftAfter(block);
          const blockCredits = creditsFor(block.rows, settings);
          return (
            <div key={i} className="mb-3 rounded-xl border border-border bg-background/60 p-3" data-test="credit-block">
              <div className="flex items-center gap-2">
                <select className={fieldClass} value={block.accountId} onChange={(e) => setBlock(i, { accountId: e.target.value })} data-test="credit-account">
                  <option value="">Choose a Flow account…</option>
                  {options.map((a) => {
                    const s = accountState(a, today);
                    return (
                      <option key={a.id} value={a.id} disabled={s.expired && a.id !== entry?.accountId}>
                        {a.email} — {s.expired ? "expired" : `${s.remaining} left`}{a.id === activeId ? " · using now" : ""}
                      </option>
                    );
                  })}
                </select>
                {blocks.length > 1 ? (
                  <button className={buttonClass.small} onClick={() => edit((bs) => bs.filter((_, k) => k !== i))} aria-label="Remove this account">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="mt-2 space-y-2">
                {block.rows.map((row, r) => (
                  <div key={r} className="flex items-center gap-2">
                    <input className={`${fieldClass} w-16 sm:w-20 text-center`} type="number" min={0} inputMode="numeric" value={row.count}
                      onChange={(e) => setRow(i, r, { count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} data-test="credit-count" aria-label="Clips" />
                    <span className="text-xs text-muted-foreground shrink-0">clips of</span>
                    <select className={`${fieldClass} w-24 sm:w-28`} value={row.seconds} onChange={(e) => setRow(i, r, { seconds: Number(e.target.value) as FlowClipSeconds })} data-test="credit-seconds" aria-label="Clip length">
                      {FLOW_CLIP_SECONDS.map((sec) => <option key={sec} value={sec}>{sec} sec</option>)}
                    </select>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0 tabular-nums sm:w-24 text-right">
                      × {settings.clipCredits[row.seconds]} = <b className="text-foreground">{creditsFor([row], settings)}</b>
                    </span>
                    {block.rows.length > 1 ? (
                      <button className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent" aria-label="Remove row"
                        onClick={() => setBlock(i, { rows: block.rows.filter((_, j) => j !== r) })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
                <button className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => setBlock(i, { rows: [...block.rows, { seconds: FLOW_CLIP_SECONDS.find((s) => !block.rows.some((r) => r.seconds === s)) ?? 8, count: 1 }] })}>
                  <Plus className="h-3 w-3" /> Clips of another length
                </button>
              </div>

              {state ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>This account: <b className="text-foreground">{blockCredits}</b> credits</span>
                  <span>{state.used} / {state.monthly} used this cycle</span>
                  {left !== null && left < 0 ? (
                    <span className="text-destructive inline-flex items-center gap-1" data-test="credit-over">
                      <AlertTriangle className="h-3 w-3" /> {-left} more than it has left — put the rest on another account
                    </span>
                  ) : left !== null ? <span>{left} left after this</span> : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {mode !== "edit" ? (
          <button className={buttonClass.small} onClick={() => edit((bs) => [...bs, {
            accountId: pickDefaultAccount(accounts.filter((a) => !bs.some((b) => b.accountId === a.id)), undefined, actor.uid, today),
            rows: [{ seconds: 8, count: 1 }],
          }])} data-test="credit-add-account">
            <Plus className="h-3.5 w-3.5" /> Part of this ad on another account
          </button>
        ) : null}
      </fieldset>

      {mode === "completion" ? (
        <label className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="mt-0.5" checked={noUsage} onChange={(e) => setNoUsage(e.target.checked)} data-test="credit-none" />
          <span>No Flow credits were used for this job (e.g. the videos were made on Grok, or only uploads were done).</span>
        </label>
      ) : null}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Rates: {FLOW_CLIP_SECONDS.map((s) => `${s}s = ${settings.clipCredits[s]}`).join(" · ")} credits per clip.
      </p>
      {error ? <p className="mt-2 text-xs text-destructive" data-test="credit-error">{error}</p> : null}
    </AiModal>
  );
}
