/**
 * Team (SMM Delivery Control, 2026-10-15) — one card per person: today's attendance (present / leave / half day /
 * not checked in), their clients, pieces due this week / late / waiting on the client, this week's load against
 * the limit, and what they answered today. Call and WhatsApp for everyone; Remind (the Social Media Team Lead and
 * the managers — about their oldest late piece); Reassign (team leaders and admins, from the piece sheet, showing
 * load and leave). On-time % only for the tech admin and the main admin (owner's decision 13). For the sales
 * admin the tab is "Salespeople": each salesperson's approvals waiting, footage to collect and extras to bill.
 */
import { useMemo, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { remindOwner } from "@/services/smmDelivery";
import { getCallUrl, getWhatsAppUrl } from "@/utils/phone";
import { isClientJob, isExtraToBill, seesOnTimePercent, teamCards } from "@/utils/smmDeliveryView";
import { EmptyState, TAP } from "./kit";
import { CreditLine, useCreditForecasts } from "./CreditForecast";
import { canManageAiAccounts } from "@/utils/flowCredits";
import { useControl } from "./context";

const PRESENCE_WORDS: Record<string, { word: string; tone: string }> = {
  working: { word: "At work", tone: "text-viz-done" },
  half_in: { word: "Half day — in", tone: "text-amber-700 dark:text-viz-wait" },
  away: { word: "Away today", tone: "text-viz-late" },
  unknown: { word: "No check-in record", tone: "text-muted-foreground" },
};

function ContactButtons({ phone }: { phone?: string | null }) {
  if (!phone) return <span className="text-xs text-muted-foreground">No phone number on their profile</span>;
  return (
    <>
      <a href={getCallUrl(phone)} className={cn("inline-flex items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted", TAP)}><Phone className="h-4 w-4" /> Call</a>
      <a href={getWhatsAppUrl(phone)} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted", TAP)}><MessageCircle className="h-4 w-4" /> WhatsApp</a>
    </>
  );
}

function Salespeople() {
  const { board, data } = useControl();
  const rows = useMemo(() => {
    const by = new Map<string, { uid: string; name: string; approvals: number; footage: number; extras: number; clients: Set<string> }>();
    for (const mv of board.months) {
      if (!mv.month.soldBy || mv.plan.exclusion) continue;
      const e = by.get(mv.month.soldBy) || { uid: mv.month.soldBy, name: mv.month.soldByName || "", approvals: 0, footage: 0, extras: 0, clients: new Set<string>() };
      e.clients.add(mv.plan.name);
      for (const r of mv.rows) {
        if (!isClientJob(r)) continue;
        if (r.progress.step === "approve") e.approvals += 1;
        if (r.progress.step === "footage") e.footage += 1;
        if (isExtraToBill(r)) e.extras += 1;
      }
      by.set(e.uid, e);
    }
    return [...by.values()].sort((a, b) => b.approvals + b.footage - (a.approvals + a.footage));
  }, [board.months]);
  if (!rows.length) return <EmptyState>No salespeople with running months.</EmptyState>;
  return (
    <div className="grid gap-3 md:grid-cols-2" data-test="smm-team-sales">
      {rows.map((s) => (
        <article key={s.uid} className="space-y-2 rounded-2xl border border-border bg-card p-3">
          <h3 className="text-sm font-semibold">{data.users.get(s.uid)?.name || s.name || "Salesperson"}</h3>
          <p className="text-xs text-muted-foreground">{s.clients.size} client{s.clients.size === 1 ? "" : "s"} · {s.approvals} approval{s.approvals === 1 ? "" : "s"} waiting · {s.footage} footage to collect · {s.extras} extra{s.extras === 1 ? "" : "s"} to bill</p>
          <div className="flex flex-wrap gap-2"><ContactButtons phone={data.users.get(s.uid)?.phone} /></div>
        </article>
      ))}
    </div>
  );
}

export default function TeamTab() {
  const { board, data, view, user, live } = useControl();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const cards = useMemo(() => teamCards(board, data.settings, (uid) => data.users.get(uid)?.name || ""), [board, data.settings, data.users]);
  const cardUids = useMemo(() => cards.map((c) => c.uid), [cards]);
  // Only someone who sees the team's Flow accounts (the AI Accounts managers) can forecast other people's credits.
  const showCredits = canManageAiAccounts(user);
  const credits = useCreditForecasts(showCredits ? cardUids : []);
  if (view === "sales_admin") return <Salespeople />;
  if (!cards.length) return <EmptyState testId="smm-team-empty">Nobody is on a running month yet.</EmptyState>;
  const presence = new Map(data.people.map((p) => [p.uid, p.presence || "unknown"]));
  const showPct = seesOnTimePercent(view);
  // A reminder is a bell and a push — Live only (Preview alerts nobody).
  const canRemind = live && (view === "lead" || view === "team_leader" || view === "admin");

  const remind = async (uid: string) => {
    const late = board.rows.filter((r) => r.ownerUid === uid && r.mark === "late").sort((a, b) => (a.task.deadlineAt ?? 0) - (b.task.deadlineAt ?? 0))[0]
      || board.rows.filter((r) => r.ownerUid === uid && (r.mark === "risk")).sort((a, b) => (a.task.deadlineAt ?? 0) - (b.task.deadlineAt ?? 0))[0];
    if (!late) return;
    setBusy(uid);
    try {
      await remindOwner(late.month, late.task.itemId, { uid }, `${late.title} (${late.typeLabel}) — ${late.state}`);
      toast({ title: "Reminded", description: `${data.users.get(uid)?.name || "They"} got a bell and a push about ${late.plan.name}.` });
    } catch (e) {
      toast({ title: "Not sent", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-test="smm-team">
      {cards.map((c) => {
        const u = data.users.get(c.uid);
        if (u && (u.isActive === false || u.externalCreator)) return null;
        const pres = PRESENCE_WORDS[presence.get(c.uid) || "unknown"] || PRESENCE_WORDS.unknown;
        const over = c.load > c.limit;
        const hasLate = board.rows.some((r) => r.ownerUid === c.uid && (r.mark === "late" || r.mark === "risk"));
        return (
          <article key={c.uid} data-test="smm-team-card" className="space-y-2 rounded-2xl border border-border bg-card p-3">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{c.uid === user.uid ? `${c.name} (you)` : c.name}</h3>
              <span className={cn("text-xs font-medium", pres.tone)}>{pres.word}</span>
            </header>
            <p className="text-xs text-muted-foreground">{c.clients.length} client{c.clients.length === 1 ? "" : "s"}: {c.clients.slice(0, 4).join(", ")}{c.clients.length > 4 ? ` +${c.clients.length - 4}` : ""}</p>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/50 p-2"><dt className="text-[11px] text-muted-foreground">Due this week</dt><dd className="text-lg font-bold tabular-nums">{c.due}</dd></div>
              <div className="rounded-lg bg-muted/50 p-2"><dt className="text-[11px] text-muted-foreground">Late</dt><dd className={cn("text-lg font-bold tabular-nums", c.late ? "text-viz-late" : "")}>{c.late}</dd></div>
              <div className="rounded-lg bg-muted/50 p-2"><dt className="text-[11px] text-muted-foreground">Waiting on client</dt><dd className="text-lg font-bold tabular-nums">{c.waiting}</dd></div>
            </dl>
            <p className={cn("text-xs", over ? "font-semibold text-viz-late" : "text-muted-foreground")}>This week: {c.load} piece{c.load === 1 ? "" : "s"} to make (limit {c.limit}){over ? " — too many, give some to somebody else" : ""}</p>
            {showPct && c.onTime.percent != null && (
              <p className="text-xs text-muted-foreground" data-test="smm-team-ontime">On time: <strong className="text-foreground">{c.onTime.percent}%</strong> of {c.onTime.onTime + c.onTime.lateTeam + c.onTime.latePublisher} decided ({c.onTime.lateClient} late because of the client, not counted)</p>
            )}
            {showCredits && <CreditLine forecast={credits.get(c.uid)} compact />}
            {c.answersToday.length > 0 && (
              <ul className="space-y-0.5 text-xs text-muted-foreground">{c.answersToday.slice(0, 3).map((a, i) => <li key={i}>• {a}</li>)}</ul>
            )}
            <div className="flex flex-wrap gap-2">
              <ContactButtons phone={u?.phone} />
              {canRemind && c.uid !== user.uid && hasLate && (
                <Button size="sm" variant="outline" className={TAP} disabled={busy === c.uid} onClick={() => remind(c.uid)} data-test="smm-team-remind">Remind</Button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
