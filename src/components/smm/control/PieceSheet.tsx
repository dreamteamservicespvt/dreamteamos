/**
 * One piece, in full (SMM Delivery Control, 2026-10-15, phases 2–3): its step timeline (footage → sent →
 * approved → scheduled → live) with each checkpoint's day, whose step it is and who a missed one counts
 * against; every answer (Why late, Blocked, Do it now / Need more time, Move, Record approval, Posted with links,
 * Footage, Reassign); and its history. Opened from a Today row, the Weeks grid, the Client plan or an alert.
 *
 * In Preview / Off it is read-only — "use the classic month page" — because Delivery Control's answers are
 * switched on with Live (the classic page keeps working either way). Every write goes through
 * `services/smmDelivery` (one transaction on the month) or the classic `services/smm` stage calls, so the
 * approval rule and the view-only Social Media Team Lead's guard hold here exactly as on the classic page.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { requestApproval, setExtraCharge, setItemStatus } from "@/services/smm";
import {
  answerBlocked, answerEta, answerLate, clearBlocker, confirmBlocker, markPostedWithLinks, movePiece, reassignPiece, recordApprovalWithProof,
  setFootage,
} from "@/services/smmDelivery";
import { uploadToCloudinary } from "@/services/cloudinary";
import { fetchMyMonthJobs } from "@/services/smmAssign";
import { monthJobLink } from "@/utils/smmPackage";
import { approvalRequestMessage } from "@/utils/smmMessages";
import { getWhatsAppUrl } from "@/utils/phone";
import { SMM_PLATFORMS, type SmmPlatform } from "@/types/smm";
import type { SmmApprovalVia, SmmBlockerKind, SmmFootageState, SmmLateStep, SmmPlanWeek } from "@/types/smmDelivery";
import { blockerActive, blockerClearer, etaCheck } from "@/utils/smmMonitor";
import {
  isDeliveryManager, lateStepOf, mayAnswerForPiece, SMM_APPROVAL_VIA, SMM_BLOCKER_KINDS, SMM_FOOTAGE_STATES, SMM_LATE_REASONS,
  postLinkProblems,
} from "@/utils/smmDeliveryActions";
import { dayWords, deadlineWords, timeWords, type SmmTaskRow } from "@/utils/smmDeliveryView";
import { toMs } from "@/utils/smmCadence";
import { MarkBadge, TAP } from "./kit";
import { useControl, type SmmPieceAction } from "./context";

const STEP_LABEL: Record<SmmLateStep, string> = {
  footage: "Footage from the client",
  send: "Sent to the client",
  approved: "Client approved",
  live: "Live",
};

const BLAME_WORDS: Record<SmmLateStep, string> = {
  footage: "the client (the salesperson chases)",
  send: "the team (the maker)",
  approved: "the client (the salesperson chases)",
  live: "the publisher",
};

function useRun() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast({ title: ok });
      return true;
    } catch (e) {
      toast({ title: "Not saved", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

/** The step timeline: each checkpoint, done or not, its day, whose it is, who a miss counts against. */
function Timeline({ row }: { row: SmmTaskRow }) {
  const { task, progress: p, item, month } = row;
  const doneAt: Record<SmmLateStep, number | null> = { footage: p.footageAt, send: p.sentAt, approved: p.approvedAt, live: p.liveAt };
  const done = (s: SmmLateStep) =>
    s === "live" ? p.live : s === "approved" ? !!p.approvedAt || ["approved", "scheduled", "posted"].includes(item.status)
      : s === "send" ? !!p.sentAt || !["planned", "in_progress"].includes(item.status)
        : item.footage?.state === "received" || (!item.footage && item.status !== "planned");
  const owner = (s: SmmLateStep) =>
    s === "send" ? task.makerName || "nobody — reassign" : s === "live" ? task.publisherName || "nobody — reassign" : `${month.soldByName || "the salesperson"} (with the client)`;
  if (!task.checkpoints.length) {
    return <p className="text-sm text-muted-foreground">{task.extra ? "Extra work with no needed-by date — give it one in the classic month page." : "Not counted in this month's promise — no deadline."}</p>;
  }
  return (
    <ol className="space-y-2" data-test="smm-piece-timeline">
      {task.checkpoints.map((cp) => {
        const isDone = done(cp.step);
        const missed = p.missed.includes(cp.step);
        return (
          <li key={cp.step} className={cn("rounded-xl border px-3 py-2", missed ? "border-viz-late/40 bg-viz-late/5" : isDone ? "border-viz-done/30 bg-viz-done/5" : "border-border")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{STEP_LABEL[cp.step]}</span>
              <MarkBadge mark={isDone ? "done" : missed ? "late" : "coming"} />
            </div>
            <p className="text-xs text-muted-foreground">
              {cp.step === "live" ? `By ${deadlineWords(cp.day, cp.at)}` : `By ${dayWords(cp.day)}`} · {owner(cp.step)}
              {isDone && doneAt[cp.step] ? ` · done ${dayWords(new Date(doneAt[cp.step]! + 330 * 60_000).toISOString().slice(0, 10))}, ${timeWords(doneAt[cp.step]!)}` : ""}
            </p>
            {missed && <p className="mt-0.5 text-xs font-medium text-viz-late">{p.firstMissed === cp.step ? `Missed first — the delay counts against ${BLAME_WORDS[cp.step]}.` : "Missed too."}</p>}
          </li>
        );
      })}
      {["scheduled", "posted"].includes(item.status) && !p.live && (
        <li className="rounded-xl border border-viz-ready/30 bg-viz-ready/5 px-3 py-2 text-sm">Scheduled{item.uploadDate ? ` for ${dayWords(item.uploadDate)}${item.uploadTime ? `, ${item.uploadTime}` : ""}` : ""}</li>
      )}
    </ol>
  );
}

/** Everything people answered on this piece, newest first. */
function History({ row }: { row: SmmTaskRow }) {
  const it = row.item;
  const lines: { at: number; text: string }[] = [];
  for (const r of it.lateReasons || []) lines.push({ at: toMs(r.at) ?? 0, text: `${r.byName}: why late — ${r.reason}${r.note ? ` (${r.note})` : ""}${r.newTime ? `, new time ${timeWords(r.newTime)}` : ""}` });
  if (it.eta) lines.push({ at: toMs(it.eta.at) ?? 0, text: `${it.eta.byName}: ${it.eta.kind === "focus" ? "doing it now" : "needs more time"} until ${timeWords(it.eta.until)}` });
  if (it.blocker) lines.push({ at: toMs(it.blocker.since) ?? 0, text: `${it.blocker.byName}: blocked — ${SMM_BLOCKER_KINDS.find((k) => k.key === it.blocker!.kind)?.label}${it.blocker.note ? ` (${it.blocker.note})` : ""}${it.blocker.confirmedByUid ? " · confirmed" : ""}` });
  for (const m of it.moves || []) lines.push({ at: toMs(m.at) ?? 0, text: `${m.byName}: moved from week ${m.fromWeek} to ${m.toWeek === "out" ? "the next month" : `week ${m.toWeek}`} — ${m.reason}` });
  for (const r of it.reassigns || []) lines.push({ at: toMs(r.at) ?? 0, text: `${r.byName}: ${r.seat === "maker" ? "making" : "posting"} given to somebody else` });
  if (it.approvalProof) lines.push({ at: it.approvalProof.at, text: `${it.approvalProof.byName}: client ${it.approvalProof.approved ? "approved" : "asked for changes"} — ${it.approvalProof.who}, via ${it.approvalProof.via.replace("_", " ")}` });
  if (it.footage?.at) lines.push({ at: toMs(it.footage.at) ?? 0, text: `${it.footage.byName || ""}: footage — ${SMM_FOOTAGE_STATES.find((s) => s.key === it.footage!.state)?.label}` });
  if (it.startingLine) lines.push({ at: it.startingLine.at, text: `${it.startingLine.byName}: Starting line — ${it.startingLine.decision === "pending" ? "kept as this month's pending work" : "catch-up planned"}` });
  if (!lines.length) return <p className="text-xs text-muted-foreground">No answers yet.</p>;
  return (
    <ul className="space-y-1 text-xs text-muted-foreground" data-test="smm-piece-history">
      {lines.sort((a, b) => b.at - a.at).map((l, i) => (
        <li key={i}><span className="text-foreground">{dayWords(new Date(l.at + 330 * 60_000).toISOString().slice(0, 10))}, {timeWords(l.at)}</span> — {l.text}</li>
      ))}
    </ul>
  );
}

export default function PieceSheet({ row, action, onClose }: { row: SmmTaskRow | null; action: SmmPieceAction; onClose: () => void }) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side={isMobile ? "bottom" : "right"} className="max-h-[92dvh] w-full overflow-y-auto sm:max-w-lg" data-test="smm-piece-sheet">
        {row && <PieceBody key={`${row.key}:${action}`} row={row} action={action} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function PieceBody({ row, action: firstAction, onClose }: { row: SmmTaskRow; action: SmmPieceAction; onClose: () => void }) {
  const { data, user, live, manager, board } = useControl();
  const { busy, run } = useRun();
  const navigate = useNavigate();
  const [action, setAction] = useState<SmmPieceAction>(firstAction);
  const { task, item, month, progress: p } = row;
  const ctx = { holidays: data.holidays, settings: data.settings };
  const actor = { uid: user.uid, name: user.name, role: user.role };
  const canAct = live && mayAnswerForPiece(month, item, user);
  const isSeller = month.soldBy === user.uid || user.role === "sales_admin";
  const step = lateStepOf(p);
  const platforms = (item.platforms?.length ? item.platforms : month.platforms) || [];
  const classicLink = `/smm/${month.id}`;

  const focus = etaCheck({ kind: "focus", eta: item.eta, now: board.now, deadlineAt: task.deadlineAt, settings: data.settings });
  const more = etaCheck({ kind: "more_time", eta: item.eta, now: board.now, deadlineAt: task.deadlineAt, settings: data.settings });

  const buttons: { key: SmmPieceAction; label: string; show: boolean }[] = [
    { key: "more_time", label: "Do it now / More time", show: canAct && !p.live && (p.step === "make" || p.step === "post") },
    { key: "late", label: "Why late", show: canAct && !p.live && (p.state === "late" || p.state === "due_today" || p.state === "checkpoint_missed") },
    { key: "blocked", label: item.blocker ? "The block" : "Blocked", show: (canAct || isSeller) && !p.live },
    { key: "approval", label: "Client's answer", show: canAct && (p.step === "approve" || p.step === "make") },
    { key: "posted", label: "Posted", show: canAct && p.step === "post" },
    { key: "footage", label: "Footage", show: (canAct || isSeller) && live && task.kind === "real_video" && !task.extra && !p.live },
    { key: "move", label: "Move", show: canAct && !p.live && !!task.week },
    { key: "reassign", label: "Reassign", show: live && manager && !p.live },
  ];

  return (
    <div className="space-y-4">
      <SheetHeader className="space-y-1 text-left">
        <SheetDescription className="text-xs">{row.typeLabel} · {row.plan.name}{task.week ? ` · Week ${task.week} of 4` : ""}</SheetDescription>
        <SheetTitle className="text-lg">{row.title}</SheetTitle>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <MarkBadge mark={row.mark} />
          <span className="text-muted-foreground">{row.state}</span>
        </div>
        {row.next && <p className="text-sm text-foreground">Next: {row.next}{row.ownerName ? ` · ${row.ownerName}` : ""}</p>}
        {task.fixed && <p className="text-xs text-muted-foreground">Its own date: {task.fixed === "festival" ? "a festival post" : task.fixed === "extra" ? "extra work's needed-by day" : "a day the client asked for"} — {deadlineWords(task.deadlineDay, task.deadlineAt)}.</p>}
      </SheetHeader>

      <Timeline row={row} />

      {!live && (
        <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground" data-test="smm-piece-preview-note">
          Preview — answers here switch on when Delivery Control goes Live. Update the piece on the classic month page meanwhile.
        </p>
      )}
      {live && !canAct && !isSeller && (
        <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">View only — only the people on this month (or a manager) answer for it.</p>
      )}

      {/* Quick stage moves — the classic calls, so the approval rule holds. */}
      {canAct && !p.live && (
        <div className="flex flex-wrap gap-2">
          {item.status === "planned" && (
            <Button size="sm" className={TAP} disabled={!!busy} data-test="smm-piece-start"
              onClick={() => run("start", () => setItemStatus(month.id, item.id, "in_progress", actor), "Marked as being made")}>
              {busy === "start" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Start making it
            </Button>
          )}
          {(item.status === "in_progress" || item.status === "changes_requested") && (
            <Button size="sm" className={TAP} disabled={!!busy} data-test="smm-piece-sent"
              onClick={() => run("sent", () => requestApproval(month.id, item.id), "Marked as sent to the client")}>
              {busy === "sent" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Sent to the client
            </Button>
          )}
          {item.status === "approved" && (
            <Button size="sm" variant="outline" className={TAP} disabled={!!busy}
              onClick={() => run("sched", () => setItemStatus(month.id, item.id, "scheduled", actor), "Marked as scheduled")}>
              Mark scheduled
            </Button>
          )}
          {/* Phase 7 (2026-10-15): straight into the AI studio on the maker's own month job — the same job,
              code, credits and hand-in My Work uses — marking the piece "being made" on the way. */}
          {user.role === "tech_member" && task.makerUid === user.uid && task.type !== "real_video" && ["planned", "in_progress", "changes_requested"].includes(item.status) && (
            <Button size="sm" variant="outline" className={TAP} disabled={!!busy} data-test="smm-piece-studio"
              onClick={() => run("studio", async () => {
                const jobs = await fetchMyMonthJobs(month, user.uid);
                const job = jobs.find((j) => !["completed", "verified"].includes(j.status)) || jobs[0];
                if (!job) throw new Error("You have no job card on this month yet — ask your team leader to assign it.");
                if (item.status === "planned") await setItemStatus(month.id, item.id, "in_progress", actor);
                navigate(monthJobLink(job.id, month.id, "open"));
              }, "Opening the AI studio…")}>
              Make it in the AI studio
            </Button>
          )}
          {month.clientPhone && (p.step === "approve" || item.status === "in_progress") && (
            <a className={cn("inline-flex items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted", TAP)}
              href={getWhatsAppUrl(month.clientPhone, approvalRequestMessage(month as never, item))} target="_blank" rel="noreferrer">
              WhatsApp the approval message <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
      {live && isSeller && task.extra && p.live && item.extraCharge !== "billed" && item.extraCharge !== "free" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className={TAP} disabled={!!busy} onClick={() => run("bill", () => setExtraCharge(month.id, item.id, "billed", item.extraAmount ?? 0), "Marked billed")}>Billed</Button>
          <Button size="sm" variant="outline" className={TAP} disabled={!!busy} onClick={() => run("free", () => setExtraCharge(month.id, item.id, "free"), "Marked free")}>Free</Button>
        </div>
      )}

      {buttons.some((b) => b.show) && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Answers">
          {buttons.filter((b) => b.show).map((b) => (
            <Button key={b.key} size="sm" variant={action === b.key ? "default" : "outline"} className={TAP} data-test={`smm-piece-act-${b.key}`}
              onClick={() => setAction(b.key)}>{b.label}</Button>
          ))}
        </div>
      )}

      {action === "more_time" && canAct && (
        <div className="space-y-2 rounded-xl border border-border p-3" data-test="smm-form-more-time">
          {item.eta && (toMs(item.eta.until) ?? 0) > board.now && <p className="text-xs text-muted-foreground">Quiet until {timeWords(item.eta.until)} ({item.eta.kind === "focus" ? "doing it now" : "more time"}).</p>}
          <div className="flex flex-wrap gap-2">
            <Button className={TAP} disabled={!!busy || !!focus.problem} onClick={() => run("focus", () => answerEta(month.id, item.id, "focus", ctx), `Quiet for ${data.settings.ladder.focusMinutes} minutes — go!`)}>
              Do it now ({data.settings.ladder.focusMinutes} min)
            </Button>
            <Button variant="outline" className={TAP} disabled={!!busy || !!more.problem} onClick={() => run("more", () => answerEta(month.id, item.id, "more_time", ctx), "More time until this evening")}>
              Need more time (today)
            </Button>
          </div>
          {(focus.problem || more.problem) && <p className="text-xs text-muted-foreground">{focus.problem || more.problem}</p>}
        </div>
      )}

      {action === "late" && canAct && <LateForm row={row} step={step} busy={busy} run={run} onDone={() => setAction("details")} />}
      {action === "blocked" && <BlockForm row={row} busy={busy} run={run} canAct={canAct} />}
      {action === "move" && canAct && <MoveForm row={row} busy={busy} run={run} manager={manager} onDone={onClose} />}
      {action === "approval" && canAct && <ApprovalForm row={row} busy={busy} run={run} onDone={() => setAction("details")} />}
      {action === "posted" && canAct && <PostedForm row={row} platforms={platforms} busy={busy} run={run} onDone={onClose} />}
      {action === "footage" && live && <FootageForm row={row} busy={busy} run={run} />}
      {action === "reassign" && live && manager && <ReassignForm row={row} busy={busy} run={run} onDone={onClose} />}

      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h4>
        <History row={row} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={classicLink} className={cn("inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline", TAP)} data-test="smm-piece-classic">
          Open the classic month page <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <Button variant="outline" className={TAP} onClick={onClose} data-test="smm-piece-close">Close</Button>
      </div>
    </div>
  );
}

type Run = (key: string, fn: () => Promise<unknown>, ok: string) => Promise<boolean>;

function Choice({ options, value, onChange, name }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
          className={cn("rounded-full border px-3 py-1.5 text-sm", TAP, value === o.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LateForm({ row, step, busy, run, onDone }: { row: SmmTaskRow; step: SmmLateStep; busy: string | null; run: Run; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [newTime, setNewTime] = useState("");
  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-test="smm-form-late">
      <Label>Why is it not done?</Label>
      <Choice name="Reason" options={SMM_LATE_REASONS[step].map((r) => ({ key: r, label: r }))} value={reason} onChange={setReason} />
      <Textarea placeholder={reason === "Other" ? "Say why (needed)" : "A note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="smm-late-new" className="text-xs text-muted-foreground">New time (optional)</Label>
        <Input id="smm-late-new" type="datetime-local" className="w-auto" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
      </div>
      <Button className={TAP} disabled={!!busy || !reason} data-test="smm-form-late-save"
        onClick={async () => {
          const ok = await run("late", () => answerLate(row.month.id, row.item.id, { step, reason, note, newTime: newTime ? new Date(newTime).getTime() : null }), "Reason saved — your lead can see it");
          if (ok) onDone();
        }}>
        Save the reason
      </Button>
    </div>
  );
}

function BlockForm({ row, busy, run, canAct }: { row: SmmTaskRow; busy: string | null; run: Run; canAct: boolean }) {
  const { data, user, board } = useControl();
  const [kind, setKind] = useState<SmmBlockerKind | "">("");
  const [note, setNote] = useState("");
  const b = row.item.blocker;
  if (b) {
    const clearer = blockerClearer(b.kind);
    const mayClear = isDeliveryManager(user) || (clearer === "salesperson" && (row.month.soldBy === user.uid || user.role === "sales_admin")) || (clearer === "lead" && !!user.smmLeader);
    const active = blockerActive(row.item, board.now);
    return (
      <div className="space-y-2 rounded-xl border border-border p-3" data-test="smm-form-blocker">
        <p className="text-sm">
          <strong>{b.byName}</strong> is blocked — {SMM_BLOCKER_KINDS.find((k) => k.key === b.kind)?.label}{b.note ? ` (${b.note})` : ""}.
          {b.confirmedByUid ? " Confirmed — it holds until cleared." : active ? ` Holds until ${timeWords(b.expiresAt)} unless ${SMM_BLOCKER_KINDS.find((k) => k.key === b.kind)?.who} confirms it.` : " It has lapsed — the alerts are back."}
        </p>
        <div className="flex flex-wrap gap-2">
          {mayClear && !b.confirmedByUid && <Button size="sm" className={TAP} disabled={!!busy} onClick={() => run("confirm", () => confirmBlocker(row.month.id, row.item.id, { holidays: data.holidays }), "Block confirmed")}>It's real — confirm</Button>}
          {(mayClear || canAct) && <Button size="sm" variant="outline" className={TAP} disabled={!!busy} onClick={() => run("clear", () => clearBlocker(row.month.id, row.item.id), "Block cleared")}>Cleared — it can go on</Button>}
        </div>
      </div>
    );
  }
  if (!canAct) return null;
  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-test="smm-form-blocked">
      <Label>What is in the way?</Label>
      <Choice name="Blocked by" options={SMM_BLOCKER_KINDS.map((k) => ({ key: k.key, label: k.label }))} value={kind} onChange={(v) => setKind(v as SmmBlockerKind)} />
      {kind && <p className="text-xs text-muted-foreground">{SMM_BLOCKER_KINDS.find((k) => k.key === kind)?.who} is asked to clear it. It lapses after {data.settings.ladder.blockHours} hours unless they confirm it.</p>}
      <Textarea placeholder={kind === "other" ? "What is in the way (needed)" : "A note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      <Button className={TAP} disabled={!!busy || !kind} onClick={() => run("block", () => answerBlocked(row.month.id, row.item.id, { kind: kind as SmmBlockerKind, note }, { holidays: data.holidays, settings: data.settings }), "Saved — the right person is asked to clear it")}>
        Save
      </Button>
    </div>
  );
}

function MoveForm({ row, busy, run, manager, onDone }: { row: SmmTaskRow; busy: string | null; run: Run; manager: boolean; onDone: () => void }) {
  const { data } = useControl();
  const from = row.task.week as SmmPlanWeek;
  const [to, setTo] = useState<string>(String(from));
  const [reason, setReason] = useState("");
  const [clientDay, setClientDay] = useState("");
  const weeks = row.plan.weeks;
  const target = to === "out" ? null : weeks[Number(to) - 1];
  const options = [
    ...weeks.map((w) => ({ key: String(w.week), label: `Week ${w.week} · ${dayWords(w.start)} – ${dayWords(w.end)}` })),
    ...(manager ? [{ key: "out", label: "Out of this month" }] : []),
  ];
  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-test="smm-form-move">
      <Label>Move it to</Label>
      <Choice name="Week" options={options} value={to} onChange={setTo} />
      {to !== String(from) && <p className="text-xs text-muted-foreground">{to === "out" ? "It stops being chased here and is carried to the next month." : "Moving to another week needs a reason — the Social Media Team Lead is told."}</p>}
      {target && (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="smm-move-day" className="text-xs text-muted-foreground">A day the client asked for (optional)</Label>
          <Input id="smm-move-day" type="date" className="w-auto" min={target.start} max={target.end} value={clientDay} onChange={(e) => setClientDay(e.target.value)} />
        </div>
      )}
      <Textarea placeholder="Why (needed for another week)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      {row.item.uploadDate && <p className="text-xs text-muted-foreground">Its post date in the classic list ({dayWords(row.item.uploadDate)}) is not changed — change it there when you schedule the post.</p>}
      <Button className={TAP} disabled={!!busy} data-test="smm-form-move-save"
        onClick={async () => {
          const ok = await run("move", () => movePiece(row.month.id, row.item.id, { toWeek: to === "out" ? "out" : (Number(to) as SmmPlanWeek), reason, clientDay: clientDay || null }, { holidays: data.holidays, settings: data.settings }), "Moved");
          if (ok) onDone();
        }}>
        Move it
      </Button>
    </div>
  );
}

function ApprovalForm({ row, busy, run, onDone }: { row: SmmTaskRow; busy: string | null; run: Run; onDone: () => void }) {
  const [approved, setApproved] = useState<"yes" | "no" | "">("");
  const [who, setWho] = useState(row.month.clientName || "");
  const [via, setVia] = useState<SmmApprovalVia>("whatsapp");
  const [note, setNote] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-test="smm-form-approval">
      <Label>What did the client say?</Label>
      <Choice name="Answer" options={[{ key: "yes", label: "✔ Approved" }, { key: "no", label: "Changes asked" }]} value={approved} onChange={(v) => setApproved(v as "yes" | "no")} />
      <Input placeholder="Who said it" value={who} onChange={(e) => setWho(e.target.value)} />
      <Choice name="How" options={SMM_APPROVAL_VIA} value={via} onChange={(v) => setVia(v as SmmApprovalVia)} />
      <Textarea placeholder={approved === "no" ? "What they want changed" : "A note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Label htmlFor="smm-approval-shot" className="text-muted-foreground">Screenshot (optional)</Label>
        <input id="smm-approval-shot" type="file" accept="image/*" className="max-w-[14rem] text-xs"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setUploading(true);
            try { setShot(await uploadToCloudinary(f)); } catch { toast({ title: "The screenshot did not upload", variant: "destructive" }); } finally { setUploading(false); }
          }} />
        {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
        {shot && <span className="text-viz-done">✔ attached</span>}
      </div>
      <Button className={TAP} disabled={!!busy || !approved || uploading} data-test="smm-form-approval-save"
        onClick={async () => {
          const ok = await run("approval", () => recordApprovalWithProof(row.month.id, row.item.id, { approved: approved === "yes", who, via, note, screenshotUrl: shot }), approved === "yes" ? "Approval recorded" : "Changes recorded");
          if (ok) onDone();
        }}>
        Save the client's answer
      </Button>
    </div>
  );
}

function PostedForm({ row, platforms, busy, run, onDone }: { row: SmmTaskRow; platforms: SmmPlatform[]; busy: string | null; run: Run; onDone: () => void }) {
  const [urls, setUrls] = useState<Partial<Record<SmmPlatform, string>>>(() => ({ ...(row.item.postUrls || {}) }));
  const [reason, setReason] = useState("");
  const check = useMemo(() => postLinkProblems({ platforms, postUrls: urls, noLinkReason: reason }), [platforms, urls, reason]);
  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-test="smm-form-posted">
      <Label>Where did it go live?</Label>
      {platforms.map((p) => (
        <div key={p} className="space-y-1">
          <Input placeholder={`${SMM_PLATFORMS.find((x) => x.key === p)?.label || p} link`} value={urls[p] || ""} onChange={(e) => setUrls({ ...urls, [p]: e.target.value })} data-test={`smm-form-posted-${p}`} />
          {check.problems[p] && <p className="text-xs text-viz-late">{check.problems[p]}</p>}
        </div>
      ))}
      {check.missing.length > 0 && (
        <Textarea placeholder="No link — why? (needed when a box is empty)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      )}
      <Button className={TAP} disabled={!!busy || !check.ok} data-test="smm-form-posted-save"
        onClick={async () => {
          const ok = await run("posted", () => markPostedWithLinks(row.month.id, row.item.id, { postUrls: urls, noLinkReason: reason }), "Marked live");
          if (ok) onDone();
        }}>
        It's live
      </Button>
    </div>
  );
}

function FootageForm({ row, busy, run }: { row: SmmTaskRow; busy: string | null; run: Run }) {
  const [state, setState] = useState<SmmFootageState>(row.item.footage?.state || "received");
  const [link, setLink] = useState(row.item.footage?.link || "");
  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-test="smm-form-footage">
      <Label>The client's footage</Label>
      <Choice name="Footage" options={SMM_FOOTAGE_STATES} value={state} onChange={(v) => setState(v as SmmFootageState)} />
      <Input placeholder="Drive / WhatsApp link (optional)" value={link} onChange={(e) => setLink(e.target.value)} />
      <Button className={TAP} disabled={!!busy} onClick={() => run("footage", () => setFootage(row.month.id, row.item.id, { state, link }), "Footage saved")}>Save</Button>
    </div>
  );
}

function ReassignForm({ row, busy, run, onDone }: { row: SmmTaskRow; busy: string | null; run: Run; onDone: () => void }) {
  const { data, board } = useControl();
  const [seat, setSeat] = useState<"maker" | "publisher">(row.progress.step === "post" ? "publisher" : "maker");
  const [to, setTo] = useState("");
  const [candidates, setCandidates] = useState<{ uid: string; name: string }[]>([]);
  useEffect(() => {
    let alive = true;
    import("@/services/smm").then((m) => m.fetchAssignableMembers()).then((list) => { if (alive) setCandidates(list); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const presence = new Map(data.people.map((p) => [p.uid, p.presence]));
  const current = seat === "maker" ? row.task.makerUid : row.task.publisherUid;
  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-test="smm-form-reassign">
      <Label>Give it to somebody else</Label>
      <Choice name="Seat" options={[{ key: "maker", label: "Making it" }, { key: "publisher", label: "Posting it" }]} value={seat} onChange={(v) => setSeat(v as "maker" | "publisher")} />
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {candidates.filter((c) => c.uid !== current).map((c) => {
          const away = presence.get(c.uid) === "away";
          const load = board.monitor.load[c.uid] || 0;
          return (
            <button key={c.uid} type="button" onClick={() => setTo(c.uid)}
              className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm", TAP, to === c.uid ? "border-primary bg-primary/10" : "border-border hover:bg-muted")}>
              <span>{c.name}{away ? " · away today" : ""}</span>
              <span className={cn("text-xs", load > data.settings.ladder.weeklyLoadLimit ? "text-viz-late" : "text-muted-foreground")}>{load} this week</span>
            </button>
          );
        })}
        {!candidates.length && <p className="text-xs text-muted-foreground">Loading people…</p>}
      </div>
      <Button className={TAP} disabled={!!busy || !to} data-test="smm-form-reassign-save"
        onClick={async () => {
          const c = candidates.find((x) => x.uid === to);
          if (!c) return;
          const ok = await run("reassign", () => reassignPiece(row.month.id, row.item.id, seat, c, { settings: data.settings }), `Given to ${c.name} — they are told`);
          if (ok) onDone();
        }}>
        Reassign
      </Button>
    </div>
  );
}
