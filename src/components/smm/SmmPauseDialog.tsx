/**
 * Pausing a running SMM month (owner, 2026-11-05) — the screens: the **Pause month** dialog, the same
 * dialog to change the restart day, and the **Paused** banner on the month's page with Resume now /
 * Change restart day / Cancel pause and the earlier pauses.
 *
 * ── Why the dialog says the new renewal day before it saves ───────────────────────────────────────
 * A pause moves the client's renewal day (paused days are not paid days). The person pressing Pause is
 * usually the salesperson on the phone with the client, so the line under the dates — "Renewal moves
 * 6 Dec → 11 Dec · 5 paused days (10 of 15 left)" — is what they read back to the client. Every check
 * is `utils/smmPause` (the same rules the service runs inside its transaction), so the button is off
 * exactly when the save would be refused, with the same sentence.
 *
 * ── Why a restart day is required ─────────────────────────────────────────────────────────────────
 * "Paused" is derived from the dates (from ≤ today < back on), so the month restarts by itself with no
 * scheduler; an open-ended pause would wait for somebody to remember it. Resume now ends it early.
 */
import { useMemo, useState } from "react";
import { CalendarClock, History, Loader2, Pause, Play, Upload, X, XCircle } from "lucide-react";
import { uploadToCloudinary } from "@/services/cloudinary";
import { cancelUpcomingPause, changePauseRestart, pauseMonth } from "@/services/smmPause";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { addDays } from "@/utils/smmPlan";
import {
  SMM_PAUSE_MAX_DAYS, SMM_PAUSE_REASONS, activePause, cancelPauseProblem, canExceedPauseCap, canPauseMonth,
  endAfterPause, pauseDayLabel, pauseDays, pauseProblem, pauseReasonLine, pauseSentence, pausedTotal,
  restartProblem, safeProofUrl, upcomingPause,
} from "@/utils/smmPause";
import type { SmmCampaign, SmmPauseReason } from "@/types/smm";

type PauseUser = { uid: string; name: string; role?: string | null };

const actorOf = (u: PauseUser) => ({ uid: u.uid, name: u.name, role: u.role ?? null });

/** "+3 days" etc. — counted from the first paused day, so "+7" is a week off. */
const QUICK_DAYS = [3, 7, 15];

const inputCls = "mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary";

/**
 * `mode: "new"` sets a pause; `mode: "restart"` changes the current / upcoming pause's restart day
 * (the first paused day and the reason stay).
 */
export function SmmPauseDialog({ campaign, user, today, mode, onClose }: {
  campaign: SmmCampaign;
  user: PauseUser;
  today: string;
  mode: "new" | "restart";
  onClose: () => void;
}) {
  const { toast } = useToast();
  const current = mode === "restart" ? campaign.pause || null : null;
  const canExceed = canExceedPauseCap(user);
  const [from, setFrom] = useState(current?.from || today);
  const [until, setUntil] = useState(current?.until || addDays(today, 7));
  const [reasonKind, setReasonKind] = useState<SmmPauseReason | "">("");
  const [note, setNote] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "upload" | "save">("");

  // The renewal day the dates give, and the days used against the cap (this pause included).
  const endBefore = current ? current.endBefore : campaign.cycle.endDate;
  const days = pauseDays(from, until);
  const usedBefore = pausedTotal({ pauses: campaign.pauses, pause: null });
  const left = SMM_PAUSE_MAX_DAYS - usedBefore - days;
  const newEnd = days > 0 ? endAfterPause(endBefore, from, until) : null;

  const problem = useMemo(() => (mode === "new"
    ? pauseProblem(campaign, { from, until, reasonKind, note }, { today, canExceed })
    : restartProblem(campaign, until, { today, canExceed })),
  [mode, campaign, from, until, reasonKind, note, today, canExceed]);

  const pickFrom = (d: string) => {
    // Keep the length of the pause when the first day moves — "+7" stays a week.
    const len = pauseDays(from, until) || 7;
    setFrom(d);
    if (d) setUntil(addDays(d, len));
  };

  const handleFile = async (file: File) => {
    setBusy("upload");
    try {
      setProofUrl(await uploadToCloudinary(file));
    } catch {
      toast({ title: "Screenshot not uploaded", description: "Try again, or pause without it.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    if (problem || busy) return;
    setBusy("save");
    try {
      const next = mode === "new"
        ? await pauseMonth(campaign.id, { from, until, reasonKind: reasonKind as SmmPauseReason, note: note.trim() || null, proofUrl }, actorOf(user))
        : await changePauseRestart(campaign.id, until, actorOf(user));
      toast({
        title: mode === "new" ? "Month paused" : "Restart day changed",
        description: pauseSentence(next, today) || `Renewal ${pauseDayLabel(next.cycle.endDate)}.`,
      });
      onClose();
    } catch (err) {
      toast({ title: "Not saved", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const lastDay = addDays(campaign.cycle.endDate, -1);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="smm-pause-title"
        data-test="smm-pause-dialog"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-md sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id="smm-pause-title" className="text-base font-semibold text-foreground">
              {mode === "new" ? "Pause this month" : "Change the restart day"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {campaign.businessName} · paused days are not counted — the renewal day moves by the same days.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" disabled={!!busy}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="smm-pause-from" className="text-[11px] font-medium text-muted-foreground">First paused day</label>
              <input id="smm-pause-from" type="date" data-test="smm-pause-from" value={from} min={today} max={lastDay}
                disabled={mode === "restart"} onChange={(e) => pickFrom(e.target.value)} className={`${inputCls} disabled:opacity-60`} />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="smm-pause-until" className="text-[11px] font-medium text-muted-foreground">Work restarts on</label>
              <input id="smm-pause-until" type="date" data-test="smm-pause-until" value={until}
                min={mode === "restart" ? today : addDays(from || today, 1)}
                onChange={(e) => setUntil(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pause length">
            {QUICK_DAYS.map((n) => {
              const d = addDays(from || today, n);
              const on = until === d;
              return (
                <button key={n} type="button" data-test={`smm-pause-quick-${n}`} aria-pressed={on} onClick={() => setUntil(d)}
                  className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${on
                    ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-accent"}`}>
                  {n} days
                </button>
              );
            })}
            {mode === "restart" && current && current.from <= today && (
              <button type="button" data-test="smm-pause-quick-today" aria-pressed={until === today} onClick={() => setUntil(today)}
                className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${until === today
                  ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-accent"}`}>
                Today
              </button>
            )}
          </div>

          {mode === "new" && (
            <>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Why</p>
                <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Why the month is paused">
                  {SMM_PAUSE_REASONS.map((r) => (
                    <button key={r.key} type="button" data-test={`smm-pause-reason-${r.key}`} aria-pressed={reasonKind === r.key}
                      onClick={() => setReasonKind(r.key)}
                      className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${reasonKind === r.key
                        ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-accent"}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="smm-pause-note" className="text-[11px] font-medium text-muted-foreground">
                  Note {reasonKind === "other" ? "(needed)" : "(optional)"}
                </label>
                <textarea id="smm-pause-note" data-test="smm-pause-note" rows={2} value={note} maxLength={300}
                  onChange={(e) => setNote(e.target.value)} placeholder="What the client said"
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary" />
              </div>
              <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent focus-within:border-primary">
                {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {busy === "upload" ? "Uploading…" : proofUrl ? "Client's message attached — tap to replace" : "Client's message screenshot (optional)"}
                <input type="file" accept="image/*" data-test="smm-pause-proof" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
            </>
          )}

          {/* What the dates do — read back to the client. */}
          <div data-test="smm-pause-effect" className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-foreground">
            {newEnd ? (
              <>
                Renewal moves <b>{pauseDayLabel(endBefore)}</b> → <b>{pauseDayLabel(newEnd)}</b> · {days} paused day{days === 1 ? "" : "s"}
                {canExceed && left < 0
                  ? <> (over the {SMM_PAUSE_MAX_DAYS}-day limit — allowed for admins)</>
                  : <> ({Math.max(0, left)} of {SMM_PAUSE_MAX_DAYS} left)</>}
              </>
            ) : mode === "restart" && until === current?.from ? (
              "That cancels the pause."
            ) : (
              "Pick the first paused day and the day work restarts."
            )}
          </div>

          {problem && (
            <p data-test="smm-pause-problem" role="alert" className="text-xs font-medium text-destructive">{problem}</p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={!!busy}
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-accent">
            Back
          </button>
          <button type="button" data-test="smm-pause-save" onClick={save} disabled={!!problem || !!busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : mode === "new" ? <Pause size={14} /> : <CalendarClock size={14} />}
            {mode === "new" ? "Pause month" : "Save restart day"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The month page's Paused banner — the pause in force or coming, its reason, who set it and the
 * screenshot, with Resume now / Change restart day / Cancel pause for those who may pause; and the
 * month's earlier pauses (folded). Renders nothing for a month never paused.
 */
export function SmmPauseBanner({ campaign, user, today }: { campaign: SmmCampaign; user: PauseUser | null; today: string }) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<"" | "resume" | "cancel">("");
  const now = activePause(campaign, today);
  const coming = now ? null : upcomingPause(campaign, today);
  const p = now || coming;
  const earlier = campaign.pauses || [];
  if (!p && earlier.length === 0) return null;
  const mayAct = !!user && canPauseMonth(user, campaign);
  const mayCancel = !!p && !cancelPauseProblem(campaign, today);
  const mayResume = !!now && !restartProblem(campaign, today, { today, canExceed: true });

  const run = async (kind: "resume" | "cancel") => {
    if (!user) return;
    const ok = await confirm({
      title: kind === "resume" ? "Restart the work today?" : "Cancel this pause?",
      description: kind === "resume"
        ? "The pause ends today and the renewal day moves back by the days not used."
        : "The month will not be paused, and the renewal day goes back to what it was.",
      confirmText: kind === "resume" ? "Restart today" : "Cancel pause",
    });
    if (!ok) return;
    setBusy(kind);
    try {
      const next = kind === "resume"
        ? await changePauseRestart(campaign.id, today, actorOf(user))
        : await cancelUpcomingPause(campaign.id, actorOf(user));
      toast({ title: kind === "resume" ? "Work restarted" : "Pause cancelled", description: `Renewal ${pauseDayLabel(next.cycle.endDate)}.` });
    } catch (err) {
      toast({ title: "Not saved", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div data-test="smm-pause-banner" className={`rounded-xl border p-3 text-xs ${p ? "border-info/40 bg-info/10" : "border-border bg-card"}`}>
      {p && (
        <div className="flex flex-wrap items-start gap-2">
          <Pause size={15} className="mt-px shrink-0 text-info" aria-hidden />
          <div className="min-w-[12rem] flex-1">
            <p data-test="smm-pause-sentence" className="font-semibold text-foreground">{pauseSentence(campaign, today)}</p>
            <p className="mt-0.5 text-muted-foreground">
              Why: {pauseReasonLine(p)} · by {p.byName}
              {safeProofUrl(p.proofUrl) && (
                <> · <a href={safeProofUrl(p.proofUrl)!} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">client's message</a></>
              )}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {now ? "Nothing is chased or due while it is paused." : "Work goes on until the pause starts."}
            </p>
          </div>
          {mayAct && (
            <div className="flex flex-wrap gap-1.5">
              {mayResume && (
                <button type="button" data-test="smm-pause-resume" onClick={() => run("resume")} disabled={!!busy}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {busy === "resume" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Restart today
                </button>
              )}
              <button type="button" data-test="smm-pause-change" onClick={() => setChanging(true)} disabled={!!busy}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 font-medium text-foreground hover:bg-accent disabled:opacity-50">
                <CalendarClock size={13} /> Change restart day
              </button>
              {mayCancel && (
                <button type="button" data-test="smm-pause-cancel" onClick={() => run("cancel")} disabled={!!busy}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 bg-card px-3 font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
                  {busy === "cancel" ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />} Cancel pause
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {earlier.length > 0 && (
        <details data-test="smm-pause-history" className={p ? "mt-2 border-t border-info/30 pt-2" : ""}>
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
            <History size={13} aria-hidden /> Earlier pauses ({earlier.length}) · {pausedTotal({ pauses: earlier, pause: null })} days in all
          </summary>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            {[...earlier].reverse().map((r, i) => (
              <li key={`${r.from}_${i}`}>
                {pauseDayLabel(r.from)} – {pauseDayLabel(addDays(r.endedOn || r.until, -1))} · {r.days} day{r.days === 1 ? "" : "s"} · {pauseReasonLine(r)} · by {r.byName}
                {r.endedByName ? ` · ended by ${r.endedByName}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {changing && user && (
        <SmmPauseDialog campaign={campaign} user={user} today={today} mode="restart" onClose={() => setChanging(false)} />
      )}
      {ConfirmDialog}
    </div>
  );
}
