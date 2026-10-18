/**
 * One person's full development record for an admin (FR-051): skills, every answer (failed and system-error ones
 * included), tasks, XP, promotions, reviews — and the admin actions, each audited: change track (effective-dated),
 * pause / resume, void an answer as a platform fault, re-grade a waiting answer, integrity check, export.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { DIMENSIONS, TRACKS, dimensionName, trackName } from "@/devos/core/dimensions";
import { dayLabel, istDay } from "@/devos/core/days";
import { rankLabel } from "@/devos/core/policy";
import type { DevAttempt, DevProfile, DevTask, TrackId, XpTransaction } from "@/devos/core/types";
import { useDevOs } from "../context";
import { BAD_TEXT, Bar, Chip, DifficultyDots, Empty, Loading, OUTCOME_WORD, PurposeChip, RankBadge, Ring, Section, fmtDate, fmtDateTime, timeAgo } from "../kit";
import { useAdminData } from "./AdminView";

interface Detail { profile: DevProfile; attempts: DevAttempt[]; tasks: DevTask[]; xp: XpTransaction[]; rankEvents: Record<string, unknown>[]; achievements: Record<string, unknown>[]; corrections: Record<string, unknown>[] }

export default function PersonView() {
  const { uid } = useParams();
  const { policy, isPlatformAdmin, run, busy } = useDevOs();
  const { toast } = useToast();
  const { data, loading, reload } = useAdminData<Detail>("admin.person", { uid });
  const [trackOpen, setTrackOpen] = useState(false);
  const [newTrack, setNewTrack] = useState<TrackId>("sales");
  const [reason, setReason] = useState("");
  const [voidFor, setVoidFor] = useState<DevAttempt | null>(null);
  const [withdraw, setWithdraw] = useState(false);

  if (loading && !data) return <Loading what="Loading the record" />;
  if (!data) return <Empty>This record could not be loaded. <Link className="underline" to="/dev-os/admin/people">Back</Link></Empty>;
  const p = data.profile;

  const act = async (action: string, body: Record<string, unknown>, done: string) => {
    const r = await run(action, body, { label: action });
    if (r !== null) { toast({ title: done }); await reload(); }
    return r;
  };
  const exportJson = async () => {
    const r = await run<unknown>("admin.export", { uid }, { label: "export" });
    if (!r) return;
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `devos-${p.name.replace(/\s+/g, "-").toLowerCase()}-${istDay(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const integrity = async () => {
    const r = await run<{ profile: string; xpTampered: number; attemptsTampered: number; rankTampered: number; ledgerMismatch: boolean; repaired: boolean }>("admin.integrity", { uid, repair: true }, { label: "integrity" });
    if (r) toast({ title: r.xpTampered || r.attemptsTampered || r.rankTampered || r.profile === "tampered" ? "Problems found" : "Records check out", description: `Profile ${r.profile}; tampered XP ${r.xpTampered}, answers ${r.attemptsTampered}, promotions ${r.rankTampered}${r.repaired ? " — the profile was rebuilt from the ledgers" : ""}.` });
    await reload();
  };

  return (
    <div className="space-y-4" data-test="admin-person">
      <Link to="/dev-os/admin/people" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[40px]"><ArrowLeft className="h-4 w-4" /> People</Link>
      <Section title={p.name} hint={`${p.role.replace(/_/g, " ")} · ${trackName(p.track)} track · joined ${fmtDate(p.createdAt)} · last active ${timeAgo(p.lastActiveAt)}`}
        right={<RankBadge level={p.rank.level} label={rankLabel(policy, p.rank.level)} />}>
        <div className="flex flex-wrap items-center gap-4">
          <Ring value={p.summary} size={72} label="Overall" />
          <div className="text-sm space-y-0.5">
            <p>{p.xp.total.toLocaleString("en-IN")} XP · streak {p.streak.current} (best {p.streak.best})</p>
            <p>{p.stats.attempts} answers · {p.stats.passed} passed · {p.stats.failed} not yet · {p.stats.expired} expired · {p.stats.systemErrors} system faults</p>
            <p className="text-xs text-muted-foreground">Status {p.status}{p.enrolled === false ? " (not enrolled)" : ""} · baseline {p.onboarding.baseline}{p.integrity?.length ? ` · integrity notes: ${p.integrity.length}` : ""}</p>
          </div>
        </div>
        {isPlatformAdmin && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" variant="outline" className="min-h-[38px]" onClick={() => { setNewTrack(p.track === "sales" ? "technical" : "sales"); setReason(""); setTrackOpen(true); }}>Change track</Button>
            <Button size="sm" variant="outline" className="min-h-[38px]" disabled={!!busy} onClick={() => act("admin.enrol", { uid, enrolled: p.status === "paused", reason: p.status === "paused" ? "resumed by admin" : "paused by admin" }, p.status === "paused" ? "Resumed" : "Paused")}>{p.status === "paused" ? "Resume" : "Pause"}</Button>
            <Button size="sm" variant="outline" className="min-h-[38px]" disabled={busy === "integrity"} onClick={integrity}>{busy === "integrity" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}Integrity check</Button>
            <Button size="sm" variant="outline" className="min-h-[38px]" disabled={busy === "export"} onClick={exportJson}><Download className="h-3.5 w-3.5 mr-1" />Export (logged)</Button>
          </div>
        )}
      </Section>

      <Section title="Skills" hint="Bar = now, line = baseline. Scores are estimates from practice tasks — not job performance.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {DIMENSIONS.map((d) => {
            const s = p.dims[d.id];
            return (
              <li key={d.id}>
                <div className="flex justify-between text-sm"><span>{d.name}</span><span className="tabular-nums font-medium">{s.score === null ? "—" : Math.round(s.score)}</span></div>
                <Bar value={s.score} baseline={s.baseline} className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-0.5">{s.n} answers · {s.confidence} confidence · level {s.level}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Answers" hint="Newest first, every one kept.">
        {data.attempts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[44rem]">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">When</th><th>Skill</th><th>Kind</th><th>Result</th><th>Score</th><th>Graded by</th><th /></tr></thead>
              <tbody>
                {data.attempts.map((a) => {
                  const o = a.current?.outcome ?? a.outcome;
                  return (
                    <tr key={a.id} className="border-t border-border align-top">
                      <td className="py-2 text-xs whitespace-nowrap">{fmtDateTime(a.submittedAt)}</td>
                      <td><span className="text-xs">{dimensionName(a.dim)}</span> <DifficultyDots level={a.difficulty} /></td>
                      <td><PurposeChip purpose={a.purpose} /></td>
                      <td><Chip tone={OUTCOME_WORD[o].tone}>{OUTCOME_WORD[o].word}</Chip>{a.current && <span className="block text-[10px] text-muted-foreground">corrected</span>}</td>
                      <td className="tabular-nums">{a.current?.score ?? a.scoring?.score ?? "—"}</td>
                      <td className="text-xs text-muted-foreground">{a.scoring?.method ?? "—"}{a.scoring?.confidence ? ` · ${a.scoring.confidence}` : ""}</td>
                      <td className="text-right whitespace-nowrap">
                        {isPlatformAdmin && a.outcome === "pending_validation" && <Button size="sm" variant="ghost" className="h-8" disabled={!!busy} onClick={() => act("admin.regrade", { uid, attemptId: a.id }, "Re-graded")}>Re-grade</Button>}
                        {isPlatformAdmin && o !== "system_error" && <Button size="sm" variant="ghost" className={`h-8 ${BAD_TEXT}`} onClick={() => { setReason(""); setWithdraw(false); setVoidFor(a); }}>Void</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty>No answers yet.</Empty>}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Tasks">
          {data.tasks.length ? <ul className="divide-y divide-border text-sm">{data.tasks.slice(0, 25).map((t) => <li key={t.id} className="py-1.5 flex justify-between gap-2"><span className="truncate">{t.title} <span className="text-xs text-muted-foreground">{dayLabel(t.day)}</span></span><Chip tone={t.state === "passed" ? "good" : t.state === "failed" ? "bad" : t.state === "expired" ? "muted" : "info"}>{t.state === "completed" && (t.kind === "baseline" || t.kind === "league") ? "done" : t.state.replace("_", " ")}</Chip></li>)}</ul> : <Empty>No tasks.</Empty>}
        </Section>
        <Section title="Promotions, reviews, XP">
          <ul className="text-sm space-y-1">
            {data.rankEvents.map((e) => <li key={String(e.id)}>Promoted {rankLabel(policy, Number(e.oldRank))} → {rankLabel(policy, Number(e.newRank))} on {fmtDate(Number(e.effectiveAt))} (policy {String(e.policyVersion)})</li>)}
            {data.corrections.map((c) => <li key={String(c.id)} className="text-xs">{String(c.kind).replace(/_/g, " ")}: {(c.before as { score: number }).score}% → {(c.after as { score: number }).score}% — {String(c.reason)}</li>)}
            {!data.rankEvents.length && !data.corrections.length && <li className="text-muted-foreground text-xs">No promotions or reviews yet.</li>}
          </ul>
          <p className="text-xs text-muted-foreground mt-3">Latest XP: {data.xp.slice(0, 5).map((x) => `${x.reason}`).join(" · ") || "none"}</p>
        </Section>
      </div>

      <Dialog open={trackOpen} onOpenChange={setTrackOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change track</DialogTitle><DialogDescription>From now on the person's challenges come from this track. Their past answers keep the track they were made in.</DialogDescription></DialogHeader>
          <div className="grid gap-2">
            {TRACKS.map((t) => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="radio" name="track" checked={newTrack === t.id} onChange={() => setNewTrack(t.id)} /> {t.name}</label>)}
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (kept in their history)" />
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setTrackOpen(false)}>Cancel</Button><Button disabled={reason.trim().length < 5 || !!busy} onClick={async () => { if (await act("admin.track", { uid, track: newTrack, reason }, "Track changed")) setTrackOpen(false); }}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!voidFor} onOpenChange={(o) => !o && setVoidFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Void as a platform fault</DialogTitle><DialogDescription>Use when the question or the system was at fault. The answer stops counting (its skill is recalculated without it); the original stays in the record and this action is audited.</DialogDescription></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What went wrong?" />
          {/* FR-013: a faulty QUESTION (not just this answer) is withdrawn — never served again, and every answer to it voided. */}
          <label className="flex items-start gap-2 text-sm min-h-[40px]">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={withdraw} onChange={(e) => setWithdraw(e.target.checked)} data-test="void-withdraw" />
            <span>The question itself is faulty — withdraw it: it is never served again and every answer to it stops counting.</span>
          </label>
          <DialogFooter><Button variant="ghost" onClick={() => setVoidFor(null)}>Cancel</Button><Button variant="destructive" disabled={reason.trim().length < 5 || !!busy} onClick={async () => {
            if (!voidFor) return;
            const ok = withdraw
              ? await act("admin.quarantine", { qid: voidFor.qid, reason }, "Question withdrawn — its answers no longer count")
              : await act("admin.void", { uid, attemptId: voidFor.id, reason }, "Voided");
            if (ok !== null) setVoidFor(null);
          }} data-test="void-confirm">{withdraw ? "Withdraw and void" : "Void it"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
