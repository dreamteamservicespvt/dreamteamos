import { useState } from "react";
import {
  AlertTriangle, Ban, Check, CheckCircle2, DoorOpen, FileText, KeyRound, Loader2, PackageCheck,
  Send, Undo2, Wallet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import {
  acknowledgeSeparation, completeSeparation, submitSeparation, updateSeparation, withdrawSeparation,
} from "@/services/hr";
import type { Actor } from "@/services/hr";
import {
  MISCONDUCT_NOTE, daysBetween, lastWorkingDayFor, noticePeriodFor, todayIso,
} from "@/utils/hrPolicy";
import { SEPARATION_LABELS, SEPARATION_STATUS_LABELS } from "@/types/hr";
import type { EmployeeProfile, SeparationType } from "@/types/hr";
import { rupees } from "@/utils/hrTemplates";
import { Field, Input, SectionCard, Select, Textarea } from "./ui";

/**
 * Resignation → notice period → handover → asset return → access revoked → final settlement →
 * relieving letter. The exit, as a checklist that has to actually be worked through.
 *
 * Two things it is careful about. The notice period is computed from policy and frozen onto the
 * record at submission, so a later policy change cannot rewrite what someone was told. And a
 * misconduct case is not treated as a notice period at all — it says so, because "terminate
 * instantly for anything we dislike" is precisely the clause an employer should not be encouraged
 * to operate.
 */
export default function SeparationPanel({ profile, actor, mode, onIssueRelieving, onIssueExperience }: {
  profile: EmployeeProfile;
  actor: Actor;
  /** "admin" runs the exit; "employee" can submit or withdraw their own resignation only. */
  mode: "admin" | "employee";
  onIssueRelieving?: () => void;
  onIssueExperience?: () => void;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const isAdmin = mode === "admin";

  const [type, setType] = useState<SeparationType>(isAdmin ? "resignation" : "resignation");
  const [reason, setReason] = useState("");
  const [submittedOn, setSubmittedOn] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const sep = profile.separation && profile.separation.status !== "withdrawn" ? profile.separation : null;

  // What the policy says for this person, for the kind of separation being recorded.
  const notice = noticePeriodFor(profile, { separationType: type });
  const proposedLwd = lastWorkingDayFor(submittedOn, notice.days) || submittedOn;
  const [lastWorkingDay, setLastWorkingDay] = useState("");

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({ title: "Add a reason", description: "A separation record with no reason helps nobody later.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await submitSeparation(profile, {
        type,
        reason: reason.trim(),
        submittedOn,
        lastWorkingDay: lastWorkingDay || null,
      }, actor);
      toast({
        title: isAdmin ? "Separation recorded" : "Resignation submitted",
        description: `Last working day ${lastWorkingDay || proposedLwd}. ${isAdmin ? "" : "Your admin will acknowledge it."}`,
      });
      setReason("");
      setLastWorkingDay("");
    } catch {
      toast({ title: "Error", description: "Could not record it.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const step = async (key: string, run: () => Promise<void>, done: string) => {
    setBusy(key);
    try {
      await run();
      toast({ title: done });
    } catch {
      toast({ title: "Error", description: "Could not update the exit record.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleAcknowledge = async () => {
    if (!sep) return;
    const { confirmed, inputValue } = await confirm({
      title: "Confirm the last working day",
      description: `Policy gives ${sep.noticeDays} days' notice from ${sep.submittedOn}, which is ${sep.lastWorkingDay}. Enter a different date only if an earlier release has been agreed.`,
      confirmText: "Acknowledge",
      withInput: true,
      inputPlaceholder: sep.lastWorkingDay,
    });
    if (!confirmed) return;
    const date = (inputValue || "").trim() || sep.lastWorkingDay;
    await step("ack", () => acknowledgeSeparation(profile, date, actor), "Resignation acknowledged");
  };

  const handleSettlement = async () => {
    if (!sep) return;
    const { confirmed, inputValue } = await confirm({
      title: "Record the final settlement",
      description: "Enter the amount paid. Treatment of any unserved notice follows the contract and applicable law — record it in the note if it applies.",
      confirmText: "Record",
      withInput: true,
      inputPlaceholder: "Amount in ₹",
    });
    if (!confirmed) return;
    const amount = Number((inputValue || "").replace(/[^\d.]/g, "")) || 0;
    await step("settle", () => updateSeparation(profile, {
      finalSettlementAmount: amount,
      finalSettlementOn: todayIso(),
    }, actor), "Settlement recorded");
  };

  const handleComplete = async () => {
    if (!sep) return;
    const outstanding = (profile.assets || []).filter((a) => !a.returnedOn);
    const { confirmed } = await confirm({
      title: "Close this exit?",
      description: outstanding.length
        ? `${outstanding.length} company asset(s) are still not marked returned. Close the exit anyway?`
        : "The employee moves to Exited. Issue the relieving and experience letters if you have not already.",
      confirmText: "Close exit",
      variant: outstanding.length ? "destructive" : "default",
    });
    if (!confirmed) return;
    await step("complete", () => completeSeparation(profile, actor), "Exit completed");
  };

  const handleWithdraw = async () => {
    const { confirmed, inputValue } = await confirm({
      title: "Withdraw this resignation?",
      description: "The employee stays and returns to their previous stage. The record of the withdrawal is kept.",
      confirmText: "Withdraw",
      withInput: true,
      inputPlaceholder: "Reason (optional)",
    });
    if (!confirmed) return;
    await step("withdraw", () => withdrawSeparation(profile, inputValue || "", actor), "Resignation withdrawn");
  };

  // ── No separation in progress ────────────────────────────────────────────
  if (!sep) {
    return (
      <SectionCard
        title={isAdmin ? "Exit" : "Resignation"}
        icon={<DoorOpen size={15} className="text-primary" />}
      >
        {ConfirmDialog}

        {profile.separation?.status === "withdrawn" && (
          <p className="mb-3 rounded-lg border border-border bg-accent/30 px-3 py-2 text-xs text-muted-foreground">
            A resignation submitted on {profile.separation.submittedOn} was withdrawn on {profile.separation.withdrawnOn}
            {profile.separation.withdrawnReason ? ` — ${profile.separation.withdrawnReason}` : ""}.
          </p>
        )}

        <div className="mb-3 rounded-lg border border-border bg-background px-3 py-2.5">
          <p className="text-xs font-medium text-foreground">
            Notice period that applies today: <b data-test="applicable-notice">{notice.days} days</b>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{notice.label}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {isAdmin ? (
            <Select label="Type" value={type} onChange={(e) => setType(e.target.value as SeparationType)} data-test="separation-type">
              {(Object.keys(SEPARATION_LABELS) as SeparationType[]).map((t) => (
                <option key={t} value={t}>{SEPARATION_LABELS[t]}</option>
              ))}
            </Select>
          ) : (
            <Input label="Type" value="Resignation" disabled />
          )}
          <Input label={isAdmin ? "Recorded on" : "Resignation date"} type="date" value={submittedOn}
            onChange={(e) => setSubmittedOn(e.target.value)} />
          <Textarea label={isAdmin ? "Reason *" : "Reason for leaving *"} rows={2} value={reason}
            onChange={(e) => setReason(e.target.value)} className="sm:col-span-2" data-test="separation-reason" />
          <Input label="Last working day" type="date" value={lastWorkingDay || proposedLwd}
            onChange={(e) => setLastWorkingDay(e.target.value)}
            hint={`Policy date is ${proposedLwd}. An earlier date is an agreed early release.`}
            className="sm:col-span-2" data-test="separation-lwd" />
        </div>

        {type === "misconduct" && (
          <p className="mt-3 flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] leading-relaxed text-rose-600 dark:text-rose-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {MISCONDUCT_NOTE}
          </p>
        )}

        <button onClick={handleSubmit} disabled={saving} data-test="separation-submit"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {isAdmin ? "Record separation" : "Submit resignation"}
        </button>
        {!isAdmin && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            You remain an employee until your last working day — attendance, confidentiality and your
            work responsibilities continue as normal.
          </p>
        )}
      </SectionCard>
    );
  }

  // ── A separation is in progress ──────────────────────────────────────────
  const daysLeft = daysBetween(todayIso(), sep.lastWorkingDay);
  const outstandingAssets = (profile.assets || []).filter((a) => !a.returnedOn).length;

  const checklist = [
    {
      key: "ack", label: "Acknowledged by HR", Icon: CheckCircle2,
      doneOn: sep.acknowledgedByName ? `by ${sep.acknowledgedByName}` : null,
      done: sep.status !== "submitted",
      action: isAdmin && sep.status === "submitted" ? { label: "Acknowledge", run: handleAcknowledge } : null,
    },
    {
      key: "handover", label: "Work handover completed", Icon: FileText,
      doneOn: sep.handoverDoneOn,
      done: !!sep.handoverDoneOn,
      action: isAdmin && !sep.handoverDoneOn
        ? {
          label: "Mark done",
          run: () => step("handover", () => updateSeparation(profile, { handoverDoneOn: todayIso(), status: "serving_notice" }, actor), "Handover recorded"),
        }
        : null,
    },
    {
      key: "assets", label: "Company assets returned", Icon: PackageCheck,
      doneOn: sep.assetsReturnedOn ? `${sep.assetsReturnedOn}` : outstandingAssets ? `${outstandingAssets} still out` : null,
      done: !!sep.assetsReturnedOn,
      action: isAdmin && !sep.assetsReturnedOn
        ? { label: "Mark returned", run: () => step("assets", () => updateSeparation(profile, { assetsReturnedOn: todayIso() }, actor), "Assets recorded as returned") }
        : null,
    },
    {
      key: "access", label: "Company access revoked", Icon: KeyRound,
      doneOn: sep.accessRevokedOn,
      done: !!sep.accessRevokedOn,
      action: isAdmin && !sep.accessRevokedOn
        ? { label: "Mark revoked", run: () => step("access", () => updateSeparation(profile, { accessRevokedOn: todayIso() }, actor), "Access recorded as revoked") }
        : null,
    },
    {
      key: "settle", label: "Final settlement", Icon: Wallet,
      doneOn: sep.finalSettlementOn ? `${rupees(sep.finalSettlementAmount)} on ${sep.finalSettlementOn}` : null,
      done: !!sep.finalSettlementOn,
      action: isAdmin && !sep.finalSettlementOn ? { label: "Record", run: handleSettlement } : null,
    },
  ];

  return (
    <SectionCard
      title="Exit in progress"
      icon={<DoorOpen size={15} className="text-primary" />}
      action={
        <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
          {SEPARATION_STATUS_LABELS[sep.status]}
        </span>
      }
    >
      {ConfirmDialog}

      <div className="mb-4 grid gap-x-4 gap-y-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-3">
        <Field label="Type" value={SEPARATION_LABELS[sep.type]} />
        <Field label="Submitted on" value={sep.submittedOn} />
        <Field label="Notice applied" value={`${sep.noticeDays} days`} />
        <Field label="Last working day" value={<span data-test="last-working-day">{sep.lastWorkingDay}</span>} />
        <Field
          label="Time remaining"
          value={sep.status === "completed" ? "Exited"
            : daysLeft === null ? null
              : daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"}` : `${Math.abs(daysLeft)} days past`}
        />
        <Field label="Early release" value={sep.earlyRelease ? `Yes${sep.waivedDays ? ` · ${sep.waivedDays} days not served` : ""}` : "No"} />
        <Field label="Reason" value={sep.reason} className="sm:col-span-3" />
      </div>

      {sep.type === "misconduct" && (
        <p className="mb-4 flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] leading-relaxed text-rose-600 dark:text-rose-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {MISCONDUCT_NOTE}
        </p>
      )}

      <div className="divide-y divide-border rounded-lg border border-border">
        {checklist.map((item) => (
          <div key={item.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <item.Icon size={15} className={item.done ? "text-success" : "text-muted-foreground/50"} />
            <div className="min-w-[140px] flex-1">
              <p className={`text-sm ${item.done ? "font-medium text-foreground" : "text-muted-foreground"}`}>{item.label}</p>
              {item.doneOn && <p className="text-[11px] text-muted-foreground">{item.doneOn}</p>}
            </div>
            {item.done ? (
              <Check size={15} className="text-success" />
            ) : item.action ? (
              <button onClick={item.action.run} disabled={busy === item.key} data-test={`exit-${item.key}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold text-foreground hover:bg-accent disabled:opacity-50">
                {busy === item.key ? <Loader2 size={11} className="animate-spin" /> : null} {item.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={onIssueRelieving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent">
            <FileText size={13} /> Issue relieving letter
          </button>
          <button onClick={onIssueExperience}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent">
            <FileText size={13} /> Issue experience letter
          </button>
          {sep.status !== "completed" && (
            <>
              <button onClick={handleComplete} disabled={busy === "complete"} data-test="close-exit"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy === "complete" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Close exit
              </button>
              <button onClick={handleWithdraw} disabled={busy === "withdraw"}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-accent">
                <Undo2 size={13} /> Withdraw
              </button>
            </>
          )}
        </div>
      )}

      {!isAdmin && sep.status !== "completed" && (
        <div className="mt-4">
          <button onClick={handleWithdraw} disabled={busy === "withdraw"}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50">
            <Ban size={13} /> Withdraw my resignation
          </button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Until your last working day you remain an employee — normal attendance, confidentiality and
            responsibilities continue.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
