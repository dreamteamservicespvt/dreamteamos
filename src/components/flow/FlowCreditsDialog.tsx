/**
 * Recording the Flow credits an ad used — at Mark Complete, by hand, or as a correction.
 *
 * ── Why it is asked at Mark Complete ────────────────────────────────────────────────────────────
 * The only moment anyone reliably knows what an ad cost is the moment it is finished. So finishing a
 * video job asks for it, and the job is not handed in until it is answered: how many clips of each
 * length, on which account. The price list does the sum; the member can correct it, because the team
 * often re-generates a clip or tries something different and the true spend is theirs to state.
 *
 * An ad can run across two accounts (the first ran out half-way), so there can be a row per account.
 * And an ad made entirely elsewhere (Grok, another tool) is recorded as exactly that — "not made in
 * Flow" with a reason — rather than left blank.
 *
 * After the save, if the account the member is using no longer has a clip's worth of credits, it is
 * switched for them to the next best one (utils/flowAccounts nextAccountToUse) and they are told.
 *
 * A job handed in again — sent back for edits, completion undone, reassigned — asks again, because the
 * clips made again cost credits too (utils/flowAccounts flowCreditsQuestion). That round adds to the
 * job's record and can be answered "none this round" in one tick.
 */
import { useMemo, useState } from "react";
import { Loader2, Minus, Plus, Trash2, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  deleteFlowCreditLog, logFlowCredits, recordNoFlowCredits, setFlowAccountInUse, updateFlowCreditLog, type FlowActor,
} from "@/services/flowAccounts";
import type { WorkAssignment } from "@/types";
import type { FlowAccount, FlowClipCounts, FlowCreditLog, FlowSettings, WorkFlowCredits } from "@/types/flowAccounts";
import {
  CLIP_LENGTHS, NO_CLIPS, accountBalance, canUseAccount, cheapestClip, creditsForClips, defaultClips, isoToday,
  nextAccountToUse,
} from "@/utils/flowAccounts";
import { Field, Modal, buttonCls, inputCls } from "./FlowParts";

interface Row {
  key: number;
  accountId: string;
  clips: FlowClipCounts;
  /** "" = use the price list; a number = what the member says was really spent. */
  credits: string;
}

export interface FlowCreditsDialogProps {
  mode: "complete" | "log" | "edit";
  actor: FlowActor;
  settings: FlowSettings;
  /** Every account this person can see — only the ones they hold can be charged. */
  accounts: FlowAccount[];
  /** The job being completed (mode "complete") — its clip count is where the form starts. */
  assignment?: Pick<WorkAssignment, "id" | "uniqueId" | "businessName" | "displayTitle" | "category" | "clipCount"> | null;
  /** The spend being corrected (mode "edit"). */
  log?: FlowCreditLog | null;
  /**
   * Mode "complete" on a job handed in before (sent back for edits, completion undone, reassigned):
   * what is already recorded on it. The form then asks only for THIS round — starting from no clips,
   * with "no Flow credits this round" one tick — and adds to the job's record, never replaces it.
   */
  previous?: WorkFlowCredits | null;
  onClose: () => void;
  /** After a successful save — Mark Complete continues from here. */
  onSaved?: () => void;
  /** Stacking above the full-screen generator. */
  z?: string;
}

export default function FlowCreditsDialog({ mode, actor, settings, accounts, assignment, log, previous, onClose, onSaved, z }: FlowCreditsDialogProps) {
  const { toast } = useToast();
  const today = isoToday();
  const costs = settings.clipCosts;
  /** A later round of a job whose credits are already in — see `previous`. */
  const again = mode === "complete" && !!previous;
  /** The accounts this person may charge: ones they hold, not expired or blocked. */
  const usable = useMemo(
    () => accounts.filter((a) => canUseAccount(a, actor.uid, today) || a.id === log?.accountId),
    [accounts, actor.uid, today, log?.accountId],
  );
  const inUse = usable.find((a) => a.inUseBy === actor.uid) || null;
  const firstAccount = log?.accountId || inUse?.id || nextAccountToUse(accounts, actor.uid, today, { costs })?.id || usable[0]?.id || "";

  const [rows, setRows] = useState<Row[]>(() => [{
    key: 1,
    accountId: firstAccount,
    // A later round re-makes a few clips, not the whole ad: start from none.
    clips: log ? { ...NO_CLIPS, ...log.clips } : again ? { ...NO_CLIPS } : defaultClips(assignment?.clipCount || 0),
    credits: log && log.manual ? String(log.credits) : "",
  }]);
  const [notInFlow, setNotInFlow] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(log?.note || "");
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const creditsOf = (row: Row) => (row.credits.trim() === "" ? creditsForClips(row.clips, costs) : Math.max(0, Number(row.credits) || 0));
  const total = rows.reduce((sum, row) => sum + creditsOf(row), 0);

  /** What each account would have left after this — the same account in two rows is counted once. */
  const leftAfter = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return null;
    const before = accountBalance(account, today, costs).remaining + (log && log.accountId === accountId ? log.credits : 0);
    return before - rows.filter((r) => r.accountId === accountId).reduce((sum, r) => sum + creditsOf(r), 0);
  };

  const rowProblems = rows.map((row) => {
    if (!row.accountId) return "Choose the account these clips were made on.";
    if (creditsOf(row) <= 0 && mode !== "edit") return "Enter the clips (or the credits) this account was used for.";
    return "";
  });
  const blocked = !notInFlow && rowProblems.some(Boolean);
  // "Not made in Flow" needs to say where it was made; "none this round" needs nothing.
  const reasonMissing = notInFlow && !again && !reason.trim();

  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const bump = (key: number, clip: keyof FlowClipCounts, by: number) => setRows((rs) => rs.map((r) => (
    r.key === key ? { ...r, clips: { ...r.clips, [clip]: Math.max(0, (r.clips[clip] || 0) + by) } } : r
  )));
  const addRow = () => {
    const taken = new Set(rows.map((r) => r.accountId));
    const next = usable.filter((a) => !taken.has(a.id))
      .sort((a, b) => accountBalance(b, today, costs).remaining - accountBalance(a, today, costs).remaining)[0];
    setRows((rs) => [...rs, { key: Math.max(...rs.map((r) => r.key)) + 1, accountId: next?.id || "", clips: { ...NO_CLIPS }, credits: "" }]);
  };

  /** The account in use ran dry: move the member on to the next one, and say so. */
  const switchIfDrained = async () => {
    if (!inUse) return;
    const spentOnIt = rows.filter((r) => r.accountId === inUse.id).reduce((sum, r) => sum + creditsOf(r), 0);
    const remaining = accountBalance(inUse, today, costs).remaining - spentOnIt;
    if (remaining >= cheapestClip(costs)) return;
    const after = accounts.map((a) => {
      const spent = rows.filter((r) => r.accountId === a.id).reduce((sum, r) => sum + creditsOf(r), 0);
      if (!spent) return a;
      const cycle = accountBalance(a, today, costs).cycleStart;
      return { ...a, used: { ...a.used, [cycle]: (a.used?.[cycle] || 0) + spent } };
    });
    const next = nextAccountToUse(after, actor.uid, today, { exclude: inUse.id, costs });
    try {
      await setFlowAccountInUse({ uid: actor.uid, name: actor.name || "" }, next?.id ?? null, accounts);
      toast({
        title: `${inUse.email} is out of credits`,
        description: next ? `Switched you to ${next.email} — use that one in Flow now.` : "None of your accounts has credits left this month. Ask your team leader for one.",
      });
    } catch { /* the credits are recorded either way */ }
  };

  const save = async () => {
    setTried(true);
    if (saving || blocked || reasonMissing) return;
    setSaving(true);
    try {
      if (mode === "edit" && log) {
        const row = rows[0];
        await updateFlowCreditLog(log, {
          accountId: row.accountId, clips: row.clips, credits: row.credits.trim() === "" ? undefined : creditsOf(row), note,
        }, actor, settings);
        toast({ title: "Usage corrected" });
      } else if (notInFlow && assignment) {
        // A later round with nothing new leaves the job's record as it is — writing "not made in Flow"
        // over it would wipe the credits the first round recorded.
        if (!again) await recordNoFlowCredits(assignment.id, reason, actor);
      } else {
        await logFlowCredits({
          entries: rows.map((r) => ({
            accountId: r.accountId,
            clips: r.clips,
            credits: r.credits.trim() === "" ? undefined : creditsOf(r),
            note,
          })),
          user: actor,
          assignment: assignment || null,
          settings,
        });
        await switchIfDrained();
        if (mode === "log") toast({ title: "Usage recorded", description: `${total.toLocaleString("en-IN")} credits` });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("[FlowCreditsDialog] save failed:", err);
      toast({ title: "Couldn't record the credits", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!log || saving) return;
    setSaving(true);
    try {
      await deleteFlowCreditLog(log);
      toast({ title: "Usage removed", description: `${log.credits} credits given back to ${log.accountEmail}.` });
      onClose();
    } catch {
      toast({ title: "Couldn't remove it", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "complete"
    ? (again ? "Flow credits for this round" : "Flow credits used for this ad")
    : mode === "edit" ? "Correct this usage" : "Record Flow credit usage";
  const jobName = `${assignment?.businessName || assignment?.displayTitle || "This job"}${assignment?.uniqueId ? ` · ${assignment.uniqueId}` : ""}`;
  const subtitle = mode === "complete"
    ? (again ? `${jobName} — handed in before. Record only what this round used.` : `${jobName} — required before the ad is handed in.`)
    : mode === "edit" ? `${log?.businessName || "Manual entry"} · ${log?.date || ""}` : "Credits spent outside a job — a test, a re-try, a client's extra.";

  return (
    <Modal
      z={z}
      wide
      testId="flow-credits-dialog"
      title={title}
      subtitle={subtitle}
      onClose={() => !saving && onClose()}
      footer={(
        <>
          {mode === "edit" && (
            <button data-test="credits-delete" className={`${buttonCls.danger} mr-auto h-9`} onClick={remove} disabled={saving}>
              <Trash2 size={14} /> Remove
            </button>
          )}
          <button className={buttonCls.secondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button data-test="credits-save" className={buttonCls.primary} onClick={save} disabled={saving || (tried && (blocked || reasonMissing))}>
            {saving && <Loader2 size={15} className="animate-spin" />}
            {mode === "complete"
              ? (notInFlow ? (again ? "Mark complete" : "Save & mark complete") : `Save ${total.toLocaleString("en-IN")} credits & mark complete`)
              : "Save"}
          </button>
        </>
      )}
    >
      {again && previous && (
        <p data-test="credits-already" className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Already recorded on this job:{" "}
          <b className="text-foreground">{previous.none ? "made outside Flow" : `${previous.total.toLocaleString("en-IN")} credits`}</b>
          {previous.recordedAt ? ` · ${new Date(previous.recordedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}.
          {" "}Add the clips made again since — the edits and the re-tries.
        </p>
      )}
      {usable.length === 0 && !notInFlow ? (
        <div data-test="credits-no-accounts" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          You have no Flow account to charge yet. Add yours in <b>Flow Accounts</b> (or ask your team leader to assign one){mode !== "complete" ? "." : again ? ", or tick “No Flow credits used in this round” below." : ", or tick “Not made in Flow” below if this ad was made in another tool."}
        </div>
      ) : (
        <div className={notInFlow ? "pointer-events-none opacity-40" : ""}>
          {rows.map((row, i) => {
            const account = accounts.find((a) => a.id === row.accountId);
            const left = row.accountId ? leftAfter(row.accountId) : null;
            const calculated = creditsForClips(row.clips, costs);
            return (
              <div key={row.key} data-test={`credits-row-${i}`} className="mb-3 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[220px] flex-1">
                    <Field label={i === 0 ? "Account used" : "Also used"}>
                      <select data-test={`credits-account-${i}`} value={row.accountId} onChange={(e) => setRow(row.key, { accountId: e.target.value })} className={inputCls}>
                        <option value="">Choose the account…</option>
                        {usable.map((a) => {
                          const b = accountBalance(a, today, costs);
                          return (
                            <option key={a.id} value={a.id}>
                              {a.email} — {b.remaining.toLocaleString("en-IN")} left{a.inUseBy === actor.uid ? " (using now)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </Field>
                  </div>
                  {rows.length > 1 && (
                    <button aria-label="Remove this account" className={buttonCls.small} onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CLIP_LENGTHS.map(({ key, seconds }) => (
                    <div key={key} className="rounded-lg bg-muted/50 p-2">
                      <div className="text-[11px] text-muted-foreground">{seconds}s clips · {costs[key]} each</div>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <button type="button" aria-label={`Fewer ${seconds}-second clips`} data-test={`clips-${key}-minus-${i}`}
                          onClick={() => bump(row.key, key, -1)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background hover:bg-accent">
                          <Minus size={13} />
                        </button>
                        <input data-test={`clips-${key}-${i}`} inputMode="numeric" value={row.clips[key] || 0}
                          onChange={(e) => setRow(row.key, { clips: { ...row.clips, [key]: Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0) } })}
                          className="h-7 w-10 rounded-md border border-border bg-background text-center text-sm font-semibold text-foreground outline-none focus:border-primary" />
                        <button type="button" aria-label={`More ${seconds}-second clips`} data-test={`clips-${key}-plus-${i}`}
                          onClick={() => bump(row.key, key, 1)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background hover:bg-accent">
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  <Field label="Credits used" hint={row.credits.trim() === "" ? `Calculated: ${calculated} credits — type a different figure if the real spend was different.` : `Price list says ${calculated}; you are recording what was really spent.`}>
                    <input data-test={`credits-amount-${i}`} inputMode="numeric" value={row.credits} placeholder={String(calculated)}
                      onChange={(e) => setRow(row.key, { credits: e.target.value.replace(/\D/g, "") })} className={cn(inputCls, "w-32")} />
                  </Field>
                  {account && left !== null && (
                    <div data-test={`credits-left-${i}`} className={`text-right text-xs ${left < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {left < 0
                        ? <>More than this account has left this month — add the rest on another account.</>
                        : <><b className="text-foreground">{left.toLocaleString("en-IN")}</b> credits left on it after this</>}
                    </div>
                  )}
                </div>
                {tried && rowProblems[i] && <p className="mt-2 text-[11px] text-red-500">{rowProblems[i]}</p>}
              </div>
            );
          })}

          {mode !== "edit" && usable.length > rows.length && (
            <button data-test="credits-add-row" onClick={addRow} className={`${buttonCls.small} mb-3`}>
              <Plus size={13} /> The ad also used another account
            </button>
          )}

          <Field label="Note (optional)">
            <input data-test="credits-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. re-generated clip 3 twice" className={inputCls} />
          </Field>
        </div>
      )}

      {mode === "complete" && (
        <div className="mt-3 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input data-test="credits-not-flow" type="checkbox" checked={notInFlow} onChange={(e) => setNotInFlow(e.target.checked)} />
            {again ? "No Flow credits used in this round" : "Not made in Flow — no Flow credits were used"}
          </label>
          {notInFlow && !again && (
            <div className="mt-2">
              <input data-test="credits-not-flow-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Where was it made? e.g. Grok, ChatGPT, edited only" className={inputCls} />
              {tried && reasonMissing && <p className="mt-1 text-[11px] text-red-500">Say where the ad was made.</p>}
            </div>
          )}
        </div>
      )}

      {mode !== "edit" && !notInFlow && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <Zap size={14} className="text-primary" />
          This ad: <b data-test="credits-total" className="text-foreground">{total.toLocaleString("en-IN")} credits</b>
        </div>
      )}
    </Modal>
  );
}
