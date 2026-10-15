/**
 * The FULL-SCREEN SMM alert (SMM Delivery Control, 2026-10-15, phase 4).
 *
 * ── What the owner asked for ────────────────────────────────────────────────────────────────────
 * "Very big, urgent full-screen alerts naming the type (video, poster, real video, extra …), escalating until the
 * work is done." So: one screen, every alert for this person on it worst first (the Monday storm is ONE screen,
 * not ten), each naming its type in words (🎬 AI VIDEO · Lakshmi Jewellers), one plain sentence, and the answers
 * that person can give. It can only be ANSWERED, never closed — each answer quiets its alert (Do it now 45 min,
 * Need more time today, Blocked until whoever must clear it acts, a late reason, a lead's "I'm on it" 4 h …), and
 * the screen goes when nothing is left. The colour climbs with the level (amber → orange → red → critical) and
 * the level is said in words too.
 *
 * The answers write through `services/smmDelivery` / `services/smm` exactly as the Delivery Control page does.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, MessageCircle, Phone, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { addApprovalChase, setExtraCharge } from "@/services/smm";
import {
  answerAlert, answerBlocked, answerEta, answerLate, clearBlocker, confirmBlocker, recordApprovalWithProof, remindOwner, setFootage,
} from "@/services/smmDelivery";
import { getCallUrl, getWhatsAppUrl } from "@/utils/phone";
import { approvalChaseMessage } from "@/utils/smmMessages";
import { lateStepOf, SMM_APPROVAL_VIA, SMM_BLOCKER_KINDS, SMM_LATE_REASONS } from "@/utils/smmDeliveryActions";
import { SMM_ALERT_LEVEL_RANK, type SmmAlert, type SmmAlertLevel } from "@/utils/smmMonitor";
import { deadlineWords, type SmmTaskRow } from "@/utils/smmDeliveryView";
import type { SmmApprovalVia, SmmBlockerKind, SmmDeliverySettings } from "@/types/smmDelivery";
import type { AppUser } from "@/types";

const LEVEL: Record<SmmAlertLevel, { word: string; bg: string; ring: string }> = {
  notice: { word: "Notice", bg: "bg-slate-800", ring: "ring-slate-500" },
  watch: { word: "Watch", bg: "bg-slate-800", ring: "ring-slate-500" },
  amber: { word: "Behind", bg: "bg-amber-600", ring: "ring-amber-300" },
  full: { word: "Urgent", bg: "bg-orange-600", ring: "ring-orange-300" },
  red: { word: "LATE", bg: "bg-red-700", ring: "ring-red-300" },
  critical: { word: "CRITICAL", bg: "bg-red-900", ring: "ring-red-400" },
};

export interface AlertScreenProps {
  alerts: SmmAlert[];
  /** The main admin's one combined critical screen. */
  combined: boolean;
  user: AppUser;
  /** The pieces the alerts are about (month id:item id → row). */
  rows: Map<string, SmmTaskRow>;
  /** Phone numbers by uid (owners, salespeople) and the month's client phone. */
  phoneOf: (uid: string | null | undefined) => string | null;
  settings: SmmDeliverySettings;
  holidays: ReadonlySet<string>;
  /** "Open it": the host gives the person ten minutes on the page (as the bar) before the full screen returns. */
  onOpen?: () => void;
  /** Test mode (Settings → "Send me a test alert"): answers do nothing and Close appears. */
  test?: boolean;
  onClose?: () => void;
}

type Busy = string | null;

function useAnswer() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<Busy>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast({ title: ok });
    } catch (e) {
      toast({ title: "Not saved", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

const btn = "min-h-[48px] border-white/40 bg-white/10 text-base text-white hover:bg-white/20 hover:text-white";
const btnMain = "min-h-[48px] bg-white text-base font-semibold text-slate-900 hover:bg-white/90";

/** One alert's answers, by who it is addressed to. */
function Answers({ alert, props }: { alert: SmmAlert; props: AlertScreenProps }) {
  const navigate = useNavigate();
  const { busy, run } = useAnswer();
  const [form, setForm] = useState<"" | "late" | "blocked" | "approval">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const row = props.rows.get(`${alert.campaignId}:${alert.itemIds[0] || ""}`) || null;
  const ctx = { holidays: props.holidays, settings: props.settings };
  const actor = { uid: props.user.uid, name: props.user.name };
  const subject = alert.subject;
  const open = () => {
    props.onOpen?.();
    navigate(alert.campaignId ? `/smm/control/${alert.campaignId}` : "/smm/control");
  };
  if (props.test) {
    return <div className="flex flex-wrap gap-2"><Button className={btnMain} onClick={props.onClose}>It works — close the test</Button></div>;
  }
  const onIt = (
    <Button variant="outline" className={btn} disabled={!!busy} onClick={() => run("onit", () => answerAlert(subject, "on_it"), `Quiet for ${props.settings.ladder.onItHours} hours on this one`)}>
      I'm on it
    </Button>
  );
  const openBtn = <Button variant="outline" className={btn} onClick={open}>Open it (10 min)</Button>;
  const ownerPhone = props.phoneOf(row?.ownerUid || null);
  const clientPhone = row?.month.clientPhone || null;

  if (alert.audience === "owner" && row) {
    const step = lateStepOf(row.progress);
    const late = alert.reason === "deadline_passed";
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {!late && <Button className={btnMain} disabled={!!busy} onClick={() => run("focus", () => answerEta(row.month.id, row.item.id, "focus", ctx), `Quiet for ${props.settings.ladder.focusMinutes} minutes — go!`)}>Do it now</Button>}
          {!late && <Button variant="outline" className={btn} disabled={!!busy} onClick={() => run("more", () => answerEta(row.month.id, row.item.id, "more_time", ctx), "More time until this evening")}>Need more time</Button>}
          {late && <Button className={btnMain} onClick={() => setForm("late")}>Say why it is late</Button>}
          <Button variant="outline" className={btn} onClick={() => setForm(form === "blocked" ? "" : "blocked")}>Blocked</Button>
          {openBtn}
        </div>
        {form === "late" && (
          <div className="space-y-2 rounded-xl bg-black/20 p-3">
            <div className="flex flex-wrap gap-1.5">{SMM_LATE_REASONS[step].map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={cn("min-h-[44px] rounded-full border px-3 text-sm", reason === r ? "border-white bg-white text-slate-900" : "border-white/40 text-white")}>{r}</button>
            ))}</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={reason === "Other" ? "Say why (needed)" : "A note (optional)"} className="bg-white/90 text-slate-900" rows={2} />
            <Button className={btnMain} disabled={!!busy || !reason} onClick={() => run("late", () => answerLate(row.month.id, row.item.id, { step, reason, note }), "Reason saved — your lead can see it")}>Save</Button>
          </div>
        )}
        {form === "blocked" && (
          <div className="space-y-2 rounded-xl bg-black/20 p-3">
            <div className="flex flex-wrap gap-1.5">{SMM_BLOCKER_KINDS.map((k) => (
              <button key={k.key} type="button" onClick={() => setReason(k.key)} className={cn("min-h-[44px] rounded-full border px-3 text-sm", reason === k.key ? "border-white bg-white text-slate-900" : "border-white/40 text-white")}>{k.label}</button>
            ))}</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={reason === "other" ? "What is in the way (needed)" : "A note (optional)"} className="bg-white/90 text-slate-900" rows={2} />
            <Button className={btnMain} disabled={!!busy || !reason} onClick={() => run("block", () => answerBlocked(row.month.id, row.item.id, { kind: reason as SmmBlockerKind, note }, ctx), "Saved — the right person is asked to clear it")}>Save</Button>
          </div>
        )}
      </div>
    );
  }

  if (alert.reason === "approval_waiting" && alert.audience === "salesperson" && row) {
    const message = approvalChaseMessage(row.month as never, row.item, Math.max(1, Math.round((Date.now() - (row.progress.sentAt || Date.now())) / 86_400_000)));
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {clientPhone && <a href={getWhatsAppUrl(clientPhone, message)} target="_blank" rel="noreferrer" onClick={() => void addApprovalChase(row.month.id, row.item.id, actor, "whatsapp")}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-4", btnMain)}><MessageCircle className="h-5 w-5" /> WhatsApp</a>}
          {clientPhone && <a href={getCallUrl(clientPhone)} onClick={() => void addApprovalChase(row.month.id, row.item.id, actor, "call")}
            className={cn("inline-flex items-center gap-1.5 rounded-md border px-4", btn)}><Phone className="h-5 w-5" /> Call client</a>}
          <Button variant="outline" className={btn} onClick={() => setForm(form === "approval" ? "" : "approval")}>Approved / Changes asked</Button>
          <Button variant="outline" className={btn} disabled={!!busy} onClick={() => run("na", () => addApprovalChase(row.month.id, row.item.id, actor, "not_answering"), "Logged — the client is not answering")}>Not answering</Button>
        </div>
        {form === "approval" && (
          <div className="space-y-2 rounded-xl bg-black/20 p-3">
            <div className="flex flex-wrap gap-1.5">{SMM_APPROVAL_VIA.map((v) => (
              <button key={v.key} type="button" onClick={() => setReason(v.key)} className={cn("min-h-[44px] rounded-full border px-3 text-sm", reason === v.key ? "border-white bg-white text-slate-900" : "border-white/40 text-white")}>{v.label}</button>
            ))}</div>
            <div className="flex flex-wrap gap-2">
              <Button className={btnMain} disabled={!!busy || !reason} onClick={() => run("yes", () => recordApprovalWithProof(row.month.id, row.item.id, { approved: true, who: row.month.clientName || "the client", via: reason as SmmApprovalVia, note }), "Approval recorded")}>✔ Approved</Button>
              <Button variant="outline" className={btn} disabled={!!busy || !reason} onClick={() => run("no", () => recordApprovalWithProof(row.month.id, row.item.id, { approved: false, who: row.month.clientName || "the client", via: reason as SmmApprovalVia, note }), "Changes recorded")}>Changes asked</Button>
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What they said (optional)" className="bg-white/90 text-slate-900" rows={2} />
          </div>
        )}
      </div>
    );
  }

  if (alert.reason === "footage_missing" && row) {
    return (
      <div className="flex flex-wrap gap-2">
        {clientPhone && <a href={getCallUrl(clientPhone)} className={cn("inline-flex items-center gap-1.5 rounded-md border px-4", btn)}><Phone className="h-5 w-5" /> Call client</a>}
        <Button className={btnMain} disabled={!!busy} onClick={() => run("rcv", () => setFootage(row.month.id, row.item.id, { state: "received" }), "Footage received")}>Received</Button>
        <Button variant="outline" className={btn} disabled={!!busy} onClick={() => run("later", () => answerAlert(subject, "on_it", "Client says later"), "Logged — the client says later")}>Client says later</Button>
        <Button variant="outline" className={btn} disabled={!!busy} onClick={() => run("never", () => setFootage(row.month.id, row.item.id, { state: "pending_client" }), "Kept as this month's pending work")}>Client won't send it</Button>
      </div>
    );
  }

  if (alert.reason === "extra_unbilled" && row) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button className={btnMain} disabled={!!busy} onClick={() => run("bill", () => setExtraCharge(row.month.id, row.item.id, "billed", row.item.extraAmount ?? 0), "Marked billed")}>Billed</Button>
        <Button variant="outline" className={btn} disabled={!!busy} onClick={() => run("free", () => setExtraCharge(row.month.id, row.item.id, "free"), "Marked free")}>Free</Button>
        {openBtn}
      </div>
    );
  }

  if (alert.reason === "blocked" && row) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button className={btnMain} disabled={!!busy} onClick={() => run("conf", () => confirmBlocker(row.month.id, row.item.id, ctx), "Block confirmed — it holds until cleared")}>It's real — confirm</Button>
        <Button variant="outline" className={btn} disabled={!!busy} onClick={() => run("clr", () => clearBlocker(row.month.id, row.item.id), "Block cleared")}>Cleared</Button>
        {onIt}
      </div>
    );
  }

  if (alert.audience === "lead") {
    return (
      <div className="flex flex-wrap gap-2">
        {ownerPhone && <a href={getCallUrl(ownerPhone)} onClick={() => void answerAlert(subject, "called")} className={cn("inline-flex items-center gap-1.5 rounded-md px-4", btnMain)}><Phone className="h-5 w-5" /> Call {row?.ownerName || ""}</a>}
        {ownerPhone && <a href={getWhatsAppUrl(ownerPhone)} target="_blank" rel="noreferrer" onClick={() => void answerAlert(subject, "whatsapp")} className={cn("inline-flex items-center gap-1.5 rounded-md border px-4", btn)}><MessageCircle className="h-5 w-5" /> WhatsApp</a>}
        {row?.ownerUid && <Button variant="outline" className={btn} disabled={!!busy} onClick={() => run("remind", () => remindOwner(row.month, row.item.id, { uid: row.ownerUid! }, `${row.title} — ${row.state}`), "Reminded")}>Remind</Button>}
        {onIt}
        <Button variant="outline" className={btn} disabled={!!busy} onClick={() => run("esc", () => answerAlert(subject, "escalate"), "Escalated — the admins are told now")}>Escalate</Button>
        {openBtn}
      </div>
    );
  }

  if (alert.audience === "sales_admin") {
    const sellerPhone = props.phoneOf(row?.month.soldBy || null);
    return (
      <div className="flex flex-wrap gap-2">
        {sellerPhone && <a href={getCallUrl(sellerPhone)} onClick={() => void answerAlert(subject, "called")} className={cn("inline-flex items-center gap-1.5 rounded-md px-4", btnMain)}><Phone className="h-5 w-5" /> Call salesperson</a>}
        {clientPhone && <a href={getCallUrl(clientPhone)} onClick={() => void answerAlert(subject, "called")} className={cn("inline-flex items-center gap-1.5 rounded-md border px-4", btn)}><Phone className="h-5 w-5" /> Call client</a>}
        {onIt}
      </div>
    );
  }

  // Admins (escalations, setup, nobody owns, overload, a crowded week) and the marketer.
  return (
    <div className="flex flex-wrap gap-2">
      {alert.audience === "marketer" && row && <Button className={btnMain} onClick={() => { props.onOpen?.(); navigate(`/smm/${row.month.id}?tab=ads`); }}>Open the ads</Button>}
      {alert.audience === "marketer" && !row && alert.campaignId && <Button className={btnMain} onClick={() => { props.onOpen?.(); navigate(`/smm/${alert.campaignId}?tab=ads`); }}>Open the ads</Button>}
      {alert.audience !== "marketer" && <Button className={btnMain} onClick={open}>{alert.reason === "month_unstaffed" ? "Set up its team" : "Reassign / move"}</Button>}
      {ownerPhone && <a href={getCallUrl(ownerPhone)} onClick={() => void answerAlert(subject, "called")} className={cn("inline-flex items-center gap-1.5 rounded-md border px-4", btn)}><Phone className="h-5 w-5" /> Call {row?.ownerName || ""}</a>}
      {onIt}
    </div>
  );
}

export default function AlertScreen(props: AlertScreenProps) {
  const top = props.alerts[0];
  if (!top) return null;
  const lvl = LEVEL[top.level];
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="smm-alert-title" data-test="smm-alert-screen" data-level={top.level}
      className={cn("fixed inset-0 z-[90] flex flex-col overflow-y-auto text-white", lvl.bg)}>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6 sm:py-10">
        <header className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/80">
            {top.level === "critical" ? <Siren className="h-5 w-5 animate-pulse" /> : <AlertTriangle className="h-5 w-5 animate-pulse" />}
            {lvl.word}{props.combined ? " · everything late, on one screen" : ""}{props.alerts.length > 1 ? ` · ${props.alerts.length} alerts` : ""}
          </p>
          <h1 id="smm-alert-title" className="text-2xl font-black leading-tight sm:text-4xl">{top.title}</h1>
        </header>
        <ul className="space-y-3">
          {props.alerts.map((a) => (
            <li key={a.key} data-test="smm-alert-item" data-reason={a.reason} className={cn("space-y-3 rounded-2xl bg-black/25 p-4 ring-2", LEVEL[a.level].ring)}>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/70">{LEVEL[a.level].word} · {a.title}</p>
                <p className="mt-1 text-lg font-semibold leading-snug sm:text-xl">{a.message}</p>
                {a.deadlineAt != null && SMM_ALERT_LEVEL_RANK[a.level] >= SMM_ALERT_LEVEL_RANK.amber && (
                  <p className="mt-1 text-sm text-white/80">Deadline: {deadlineWords(new Date(a.deadlineAt + 330 * 60_000).toISOString().slice(0, 10), a.deadlineAt)}</p>
                )}
              </div>
              <Answers alert={a} props={props} />
            </li>
          ))}
        </ul>
        <p className="text-center text-sm font-medium text-white/90">{props.test ? "This is a test." : "Answer each one to clear this screen — it cannot be closed."}</p>
      </div>
    </div>
  );
}

/** Settings → "Send me a test alert": the real screen with a made-up alert; Close ends it. */
export function AlertScreenPreview({ onClose }: { onClose: () => void }) {
  const [busy] = useState(false);
  const sample: SmmAlert = {
    key: "test", subject: "test", uid: "", name: "", audience: "owner", level: "red", type: "ai_video", reason: "deadline_passed",
    campaignId: "", clientName: "Test client", itemIds: [], week: 2, title: "🎬 AI VIDEO · Test client",
    message: "Test client: the video \"Diwali offer\" was due Wed 28 Oct, 7 PM and is not live. Do it now, or say why it is late.",
    deadlineAt: null, fullScreen: true, critical: false, deliverNow: true, heldBecause: null,
  };
  if (busy) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <AlertScreen alerts={[sample]} combined={false} user={{ uid: "", name: "" } as AppUser} rows={new Map()} phoneOf={() => null}
      settings={{} as SmmDeliverySettings} holidays={new Set()} test onClose={onClose} />
  );
}
