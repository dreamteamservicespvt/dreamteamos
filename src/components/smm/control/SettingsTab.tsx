/**
 * Settings (SMM Delivery Control, 2026-10-15) — the tech admin and the main admin edit; the team leaders see it
 * read-only (owner's decision 14). Off / Preview / Live (Off needs a reason and the owner is told — the service
 * enforces it), the pilot group, the deadline hour, the checkpoints per type, the quiet hours and the escalation
 * timings; the weekly rule in words; "Send me a test alert"; the 30-day rehearsal (the supervisor replayed over
 * the last 30 days on the months as their stamps say they stood — target ≤ 3 full screens per person per day);
 * the supervisor's last check (the server heartbeat) and the switch's history.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { saveSmmDeliveryTunables, setSmmDeliveryMode } from "@/services/smmDeliverySettings";
import { sendTestAlert, switchOnMonths } from "@/services/smmDelivery";
import {
  canManageSmmDelivery, mergeTunables, SMM_DELIVERY_MODES, tunablesInputProblem, tunablesProblem,
} from "@/utils/smmDeliverySettings";
import { addDaysIso, splitAcrossWeeks, toMs } from "@/utils/smmCadence";
import { rehearseSmm, SMM_ALERT_TYPES, type SmmRehearsalReport } from "@/utils/smmMonitor";
import { dayWords, hourWords, timeWords } from "@/utils/smmDeliveryView";
import { istDay } from "@/utils/smmCadence";
import type { SmmDeliveryCheckpoints, SmmDeliveryLadder, SmmDeliveryMode, SmmDeliveryTunables } from "@/types/smmDelivery";
import { SectionTitle, TAP } from "./kit";
import { useControl } from "./context";

const AlertScreenPreview = lazy(() => import("../alerts/AlertScreen").then((m) => ({ default: m.AlertScreenPreview })));

const CHECKPOINT_FIELDS: { key: keyof SmmDeliveryCheckpoints; label: string }[] = [
  { key: "sendVideo", label: "AI video sent to the client — working days before the deadline" },
  { key: "longVideoExtraDays", label: "…extra days for a long video" },
  { key: "longVideoClips", label: "…a long video has at least this many clips" },
  { key: "sendPoster", label: "Poster sent — working days before" },
  { key: "sendRealVideo", label: "Real video sent — working days before" },
  { key: "footage", label: "Real video's footage in — working days before" },
  { key: "approved", label: "Client approved — working days before" },
];

const LADDER_FIELDS: { key: Exclude<keyof SmmDeliveryLadder, "clientChaseDays">; label: string }[] = [
  { key: "deadlineDayHour", label: "Deadline day: full screen from this hour" },
  { key: "repeatHours", label: "After the deadline: ask again every … hours" },
  { key: "leadAfterWorkingDays", label: "Team leads alerted … working days after" },
  { key: "adminAfterWorkingDays", label: "Admins alerted … working days after" },
  { key: "approvalSalespersonDays", label: "Approval waiting: salesperson after … days" },
  { key: "approvalSalesAdminDays", label: "Approval waiting: sales admin after … days" },
  { key: "footageSalesAdminDays", label: "Footage missing: sales admin … working days later" },
  { key: "adReportHour", label: "Ad report due by this hour" },
  { key: "adCampaignStartDays", label: "Ad campaign started within … days of a video going live" },
  { key: "extraUnbilledDays", label: "Extra work unbilled after … days" },
  { key: "focusMinutes", label: "\"Do it now\" — minutes of quiet" },
  { key: "onItHours", label: "\"I'm on it\" — hours of quiet" },
  { key: "blockHours", label: "A block lapses after … hours unless confirmed" },
  { key: "moreTimePerTask", label: "\"Need more time\" — at most per piece" },
  { key: "reassignsBeforeAdmin", label: "Reassigns before an admin must decide" },
  { key: "revisionsBeforeWarning", label: "Revisions before \"the client keeps changing\"" },
  { key: "maxFullScreenPerDay", label: "Rehearsal target: full screens per person per day" },
  { key: "freshMinutes", label: "Full screen only on data synced within … minutes" },
  { key: "weeklyLoadLimit", label: "Pieces one person can make in a week" },
];

function NumberField({ label, value, onChange, disabled, min = 0, max = 99 }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean; min?: number; max?: number }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <Input type="number" inputMode="numeric" min={min} max={max} disabled={disabled} className="h-9 w-20 shrink-0 text-right"
        value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))} />
    </label>
  );
}

/** The weekly rule, in words, from the numbers. */
function ruleWords(t: SmmDeliveryTunables): string[] {
  const s = (n: number) => splitAcrossWeeks(n).join(", ");
  return [
    "A client's month is four weeks of its own: days 1–7, 8–14, 15–21, and day 22 to the day before the renewal day.",
    `Each kind is split ÷ 4, leftovers to weeks 1, 4, then 2 — 4 → ${s(4)}; 6 → ${s(6)}; 8 → ${s(8)}; 10 → ${s(10)}; 12 → ${s(12)}.`,
    `A week's deadline is its last working day (Mon–Sat, not a company holiday) at ${hourWords(t.deadlineHour)}. A festival post, extra work and a day the client asked for keep their own date.`,
    `Inside the week: an AI video is sent ${t.checkpoints.sendVideo} working days before (${t.checkpoints.sendVideo + t.checkpoints.longVideoExtraDays} for ${t.checkpoints.longVideoClips}+ clips), a poster ${t.checkpoints.sendPoster}, a real video ${t.checkpoints.sendRealVideo} (its footage ${t.checkpoints.footage}); approved ${t.checkpoints.approved} day before; live by the deadline.`,
    "A client's first month posts from day 4 and has no real video in week 1; pieces carried from last month go first.",
    `Late work climbs: the owner (deadline day from ${hourWords(t.ladder.deadlineDayHour)}, then every ${t.ladder.repeatHours} h) → the team leads (+${t.ladder.leadAfterWorkingDays} working day) → the tech / main admin (+${t.ladder.adminAfterWorkingDays}). The client's side goes to the salesperson (approval after ${t.ladder.approvalSalespersonDays} days) and the sales admin (${t.ladder.approvalSalesAdminDays} days).`,
    `Quiet hours ${hourWords(t.quietHours.fromHour)}–${hourWords(t.quietHours.toHour)}${t.quietHours.sundays ? ", Sundays" : ""}${t.quietHours.holidays ? ", holidays" : ""}: only critical alerts. Nobody away today is alerted. Lateness that existed when a month was switched on never escalates.`,
  ];
}

export default function SettingsTab() {
  const { data, user, board } = useControl();
  const { toast } = useToast();
  const s = data.settings;
  const canEdit = canManageSmmDelivery(user);
  const [draft, setDraft] = useState<SmmDeliveryTunables>(() => mergeTunables(s, {}));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [offReason, setOffReason] = useState("");
  const [askOff, setAskOff] = useState(false);
  const [rehearsal, setRehearsal] = useState<SmmRehearsalReport | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const live = s.mode === "live";

  // A fresh copy when the saved settings change and nothing is being edited.
  const savedKey = JSON.stringify(mergeTunables(s, {}));
  const [lastKey, setLastKey] = useState(savedKey);
  if (savedKey !== lastKey && !dirty) {
    setLastKey(savedKey);
    setDraft(mergeTunables(s, {}));
  }

  const edit = (patch: Partial<SmmDeliveryTunables>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const problem = tunablesInputProblem(draft) || tunablesProblem(draft);

  const switchMode = async (mode: SmmDeliveryMode) => {
    if (mode === "off" && !askOff) {
      setAskOff(true);
      return;
    }
    setBusy(mode);
    try {
      await setSmmDeliveryMode(mode, mode === "off" ? offReason : null);
      toast({ title: `SMM Delivery Control is ${mode === "off" ? "off" : mode === "live" ? "Live" : "in Preview"}` });
      setAskOff(false);
      setOffReason("");
    } catch (e) {
      toast({ title: "Not changed", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const unswitched = board.months.filter((m) => !m.switchedOn && m.running && !m.plan.exclusion && !m.plan.problem);
  const switchOnAll = async () => {
    setBusy("all");
    try {
      const r = await switchOnMonths(unswitched.map((m) => m.month.id), { holidays: data.holidays, settings: s });
      toast({ title: `${r.done} month${r.done === 1 ? "" : "s"} switched on`, description: r.failed.length ? `${r.failed.length} could not be: ${r.failed.map((f) => f.message).join("; ")}` : undefined, variant: r.failed.length ? "destructive" : undefined });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      await saveSmmDeliveryTunables(draft);
      setDirty(false);
      toast({ title: "Settings saved" });
    } catch (e) {
      toast({ title: "Not saved", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const rehearse = () => {
    const fromDay = addDaysIso(board.today, -30);
    setRehearsal(rehearseSmm({ months: data.months, settings: s, holidays: data.holidays, people: data.people }, { fromDay, days: 30 }));
  };

  const lastRun = toMs(s.lastRunAt);
  const lastRunAge = lastRun ? Math.round((board.now - lastRun) / 60_000) : null;
  const pilotCandidates = data.people.filter((p) => p.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6" data-test="smm-settings">
      {!canEdit && <p className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">View only — the tech admin and the main admin change these.</p>}

      <section className="space-y-2">
        <SectionTitle hint="Only the tech admin and the main admin switch it. Turning it off needs a reason — the owner is told.">Off · Preview · Live</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Mode">
          {SMM_DELIVERY_MODES.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={s.mode === m.key} disabled={!canEdit || !!busy || s.mode === m.key}
              data-test={`smm-settings-mode-${m.key}`} onClick={() => switchMode(m.key)}
              className={cn("rounded-2xl border p-3 text-left disabled:cursor-default", TAP, s.mode === m.key ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60")}>
              <span className="block text-sm font-semibold">{m.label}{s.mode === m.key ? " · now" : ""}</span>
              <span className="block text-xs text-muted-foreground">{m.detail}</span>
            </button>
          ))}
        </div>
        {askOff && canEdit && (
          <div className="space-y-2 rounded-xl border border-viz-late/40 p-3" data-test="smm-settings-off">
            <Label htmlFor="smm-off-reason">Why turn it off? The owner is told.</Label>
            <Textarea id="smm-off-reason" value={offReason} onChange={(e) => setOffReason(e.target.value)} rows={2} />
            <div className="flex gap-2">
              <Button variant="destructive" className={TAP} disabled={!!busy || offReason.trim().length < 5} onClick={() => switchMode("off")}>Turn it off</Button>
              <Button variant="outline" className={TAP} onClick={() => setAskOff(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {s.mode === "off" && s.offReason && <p className="text-xs text-muted-foreground">Off since {s.offByName ? `${s.offByName}: ` : ""}“{s.offReason}”.</p>}
        {live && canEdit && unswitched.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
            <span className="min-w-0 flex-1">{unswitched.length} running month{unswitched.length === 1 ? " is" : "s are"} supervised but not switched on (their plans are not saved).</span>
            <Button size="sm" className={TAP} disabled={!!busy} onClick={switchOnAll} data-test="smm-settings-switch-all">
              {busy === "all" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Switch them all on
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle hint="The supervisor that runs when the app is closed (every 30 minutes, 9 AM – 8 PM).">The supervisor's last check</SectionTitle>
        <p className={cn("text-sm", live && (lastRunAge == null || lastRunAge > 45) ? "text-viz-late" : "text-muted-foreground")} data-test="smm-settings-heartbeat">
          {lastRun ? `Checked ${lastRunAge! < 1 ? "just now" : `${lastRunAge} min ago`} (${dayWords(istDay(lastRun))}, ${timeWords(lastRun)})` : "Not checked yet — the server checker is not set up, so alerts reach people only while the app is open."}
          {s.lastRunSummary ? ` · ${s.lastRunSummary.months} months, ${s.lastRunSummary.alerts} alerts, ${s.lastRunSummary.delivered} sent` : ""}
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle hint="While anybody is ticked, only they get alerts in Live (the rest are shown as 'not in the pilot').">Pilot group</SectionTitle>
        <div className="flex flex-wrap gap-1.5" data-test="smm-settings-pilot">
          {pilotCandidates.map((p) => {
            const on = draft.pilotUids.includes(p.uid);
            return (
              <button key={p.uid} type="button" disabled={!canEdit} aria-pressed={on}
                onClick={() => edit({ pilotUids: on ? draft.pilotUids.filter((u) => u !== p.uid) : [...draft.pilotUids, p.uid] })}
                className={cn("rounded-full border px-3 py-1 text-sm", TAP, on ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                {on ? "✔ " : ""}{p.name || p.uid}
              </button>
            );
          })}
          {!pilotCandidates.length && <span className="text-xs text-muted-foreground">Nobody to pick yet.</span>}
        </div>
        <p className="text-xs text-muted-foreground">{draft.pilotUids.length ? `${draft.pilotUids.length} in the pilot.` : "Nobody ticked — everybody gets alerts in Live."}</p>
      </section>

      <section className="space-y-2">
        <SectionTitle>The week's deadline and checkpoints</SectionTitle>
        <NumberField label="A week's deadline hour (its last working day)" value={draft.deadlineHour} min={9} max={23} disabled={!canEdit} onChange={(v) => edit({ deadlineHour: v })} />
        <div className="grid gap-2 md:grid-cols-2">
          {CHECKPOINT_FIELDS.map((f) => (
            <NumberField key={f.key} label={f.label} value={draft.checkpoints[f.key]} disabled={!canEdit} onChange={(v) => edit({ checkpoints: { ...draft.checkpoints, [f.key]: v } })} />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <SectionTitle>Quiet hours</SectionTitle>
        <div className="grid gap-2 md:grid-cols-2">
          <NumberField label="From (hour, evening)" value={draft.quietHours.fromHour} max={23} disabled={!canEdit} onChange={(v) => edit({ quietHours: { ...draft.quietHours, fromHour: v } })} />
          <NumberField label="Until (hour, morning)" value={draft.quietHours.toHour} max={23} disabled={!canEdit} onChange={(v) => edit({ quietHours: { ...draft.quietHours, toHour: v } })} />
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"><span className="text-muted-foreground">All of Sunday is quiet</span>
            <Switch disabled={!canEdit} checked={draft.quietHours.sundays} onCheckedChange={(v) => edit({ quietHours: { ...draft.quietHours, sundays: v } })} /></label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"><span className="text-muted-foreground">Company holidays are quiet</span>
            <Switch disabled={!canEdit} checked={draft.quietHours.holidays} onCheckedChange={(v) => edit({ quietHours: { ...draft.quietHours, holidays: v } })} /></label>
        </div>
      </section>

      <section className="space-y-2">
        <SectionTitle>Escalation and limits</SectionTitle>
        <div className="grid gap-2 md:grid-cols-2">
          {LADDER_FIELDS.map((f) => (
            <NumberField key={f.key} label={f.label} value={draft.ladder[f.key]} max={f.key === "focusMinutes" ? 240 : f.key === "weeklyLoadLimit" ? 60 : 99}
              disabled={!canEdit} onChange={(v) => edit({ ladder: { ...draft.ladder, [f.key]: v } })} />
          ))}
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Client chased on these days</span>
            <Input disabled={!canEdit} className="h-9 w-28 text-right" value={draft.ladder.clientChaseDays.join(", ")}
              onChange={(e) => edit({ ladder: { ...draft.ladder, clientChaseDays: e.target.value.split(/[,\s]+/).filter(Boolean).map(Number) } })} />
          </label>
        </div>
      </section>

      {canEdit && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 p-2 backdrop-blur">
          <Button className={TAP} disabled={!dirty || !!problem || !!busy} onClick={save} data-test="smm-settings-save">
            {busy === "save" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save the numbers
          </Button>
          {dirty && <Button variant="outline" className={TAP} onClick={() => { setDraft(mergeTunables(s, {})); setDirty(false); }}>Undo changes</Button>}
          {problem && dirty && <span className="text-xs text-viz-late">{problem}</span>}
        </div>
      )}

      <section className="space-y-2">
        <SectionTitle>The weekly rule, in words</SectionTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground" data-test="smm-settings-rule">
          {ruleWords(draft).map((l) => <li key={l}>{l}</li>)}
        </ul>
      </section>

      <section className="space-y-2">
        <SectionTitle hint="A bell and a push to you, and the full-screen alert shown here.">Test</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className={TAP} disabled={!!busy} data-test="smm-settings-test"
            onClick={async () => {
              setTestOpen(true);
              try { await sendTestAlert(); toast({ title: "Test alert sent to you" }); } catch (e) { toast({ title: "The test bell was not sent", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
            }}>Send me a test alert</Button>
          <Button variant="outline" className={TAP} onClick={rehearse} data-test="smm-settings-rehearse">Run the 30-day rehearsal</Button>
        </div>
        {testOpen && <Suspense fallback={null}><AlertScreenPreview onClose={() => setTestOpen(false)} /></Suspense>}
        {rehearsal && (
          <div className="space-y-2 rounded-xl border border-border p-3 text-sm" data-test="smm-settings-rehearsal">
            <p>
              The last 30 days replayed (nobody answering — the worst case): <strong>{rehearsal.totalScreens}</strong> full screens for {new Set(rehearsal.personDays.map((d) => d.uid)).size} people.{" "}
              {rehearsal.overTarget ? <span className="text-viz-late">{rehearsal.overTarget} person-day{rehearsal.overTarget === 1 ? " was" : "s were"} above the target of {rehearsal.target} a day.</span> : <span className="text-viz-done">Every person-day was within the target of {rehearsal.target}.</span>}
            </p>
            {rehearsal.personDays.length > 0 && (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {rehearsal.personDays.slice(0, 8).map((d) => <li key={`${d.uid}${d.day}`}>{d.name || d.uid} · {dayWords(d.day)} · {d.screens} screen{d.screens === 1 ? "" : "s"} ({d.alerts} alert{d.alerts === 1 ? "" : "s"})</li>)}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">By type: {Object.entries(rehearsal.byType).map(([k, n]) => `${SMM_ALERT_TYPES[k as keyof typeof SMM_ALERT_TYPES]?.label || k} ${n}`).join(" · ") || "none"}.</p>
            <p className="text-xs text-muted-foreground">Answers stop the repeats — the real number is lower once people press Do it now, Need more time, Blocked or give a reason.</p>
          </div>
        )}
      </section>

      {(s.history || []).length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Switch history</SectionTitle>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {[...(s.history || [])].reverse().map((h, i) => <li key={i}>{dayWords(istDay(h.at))}, {timeWords(h.at)} — {h.byName}: {h.mode}{h.reason ? ` (“${h.reason}”)` : ""}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
