/**
 * The policy editor (FR-055, NFR-014): every MSRS "proposed default" as a setting. Problems are shown live (weights
 * must total 100 per track, gates must climb with the ranks…); saving needs a reason, creates a new version, and is
 * audited. Old answers keep the version they were judged under (AC-027).
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DIMENSIONS, DIMENSION_IDS, TRACKS } from "@/devos/core/dimensions";
import { validatePolicy, type DevPolicy } from "@/devos/core/policy";
import type { DimensionId, TrackId } from "@/devos/core/types";
import { useDevOs } from "../context";
import { BAD_TEXT, Chip, Note, Section } from "../kit";
import { useAdminData } from "./AdminView";

const ROLES = ["main_admin", "tech_admin", "sales_admin", "accounts_admin", "tech_team_leader", "tech_member", "sales_member"];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function Num({ label, value, onChange, step = 1, min, max, w = "w-20" }: { label?: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; w?: string }) {
  return (
    <label className="text-xs inline-flex flex-col gap-1">
      {label && <span className="text-muted-foreground">{label}</span>}
      <Input type="number" step={step} min={min} max={max} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(Number(e.target.value))} className={cn("h-9 text-sm tabular-nums", w)} />
    </label>
  );
}

export default function PolicyView() {
  const { policy, run, busy } = useDevOs();
  const { toast } = useToast();
  const { data: staff } = useAdminData<{ uid: string; name: string; role: string }[]>("admin.staff");
  const [draft, setDraft] = useState<DevPolicy>(() => clone(policy));
  const [reason, setReason] = useState("");
  useEffect(() => { setDraft(clone(policy)); }, [policy]);
  const problems = useMemo(() => validatePolicy(draft), [draft]);
  const set = (fn: (d: DevPolicy) => void) => setDraft((d) => { const n = clone(d); fn(n); return n; });
  const changed = JSON.stringify(draft) !== JSON.stringify(policy);

  const save = async () => {
    const r = await run<DevPolicy>("admin.policy", { policy: draft, reason: reason.trim() }, { label: "policy" });
    if (r) { toast({ title: `Saved as ${r.version}`, description: "It applies from now on; earlier answers keep the version they were judged under." }); setReason(""); }
  };

  return (
    <div className="space-y-4" data-test="policy-view">
      <Section title="Policy" hint={`Current version ${policy.version}${policy.updatedByName ? ` · by ${policy.updatedByName}` : ""}${policy.reason ? ` · “${policy.reason}”` : ""}`}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium mb-1">Mode</p>
            <div className="flex gap-1.5">
              {(["live", "pilot", "off"] as const).map((m) => (
                <button key={m} onClick={() => set((d) => { d.mode = m; })} className={cn("rounded-xl px-3 py-2 text-sm border min-h-[40px]", draft.mode === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>{m === "live" ? "Live" : m === "pilot" ? "Pilot group only" : "Off"}</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Off pauses quests, notices and the scheduled work; nobody's records change.</p>
            {draft.mode === "pilot" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(staff ?? []).map((s) => {
                  const on = draft.pilotUids.includes(s.uid);
                  return <button key={s.uid} onClick={() => set((d) => { d.pilotUids = on ? d.pilotUids.filter((x) => x !== s.uid) : [...d.pilotUids, s.uid]; })} className={cn("rounded-full px-2.5 py-1 text-xs border", on ? "bg-primary/10 border-primary text-foreground" : "border-border")}>{s.name}</button>;
                })}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Who takes part (by role)</p>
            <ul className="space-y-1">
              {ROLES.map((r) => (
                <li key={r} className="flex items-center justify-between gap-2 text-sm">
                  <span>{r.replace(/_/g, " ")}</span>
                  <span className="flex items-center gap-2">
                    <select className="h-8 rounded-lg border border-border bg-background px-1 text-xs" value={draft.defaultTrackByRole[r]} onChange={(e) => set((d) => { d.defaultTrackByRole[r] = e.target.value as TrackId; })} aria-label={`Default track for ${r}`}>{TRACKS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                    <Switch checked={!!draft.enrollRoles[r]} onCheckedChange={(v) => set((d) => { d.enrollRoles[r] = v; })} aria-label={`Enrol ${r}`} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Skill weights per track" hint="Each column must total 100. Weights shape only the overall summary — every skill is still tracked on its own, and ★ critical skills gate the ranks.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[36rem]">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Skill</th>{TRACKS.map((t) => <th key={t.id}>{t.name}</th>)}</tr></thead>
            <tbody>
              {DIMENSIONS.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-1.5">{d.name}</td>
                  {TRACKS.map((t) => {
                    const crit = draft.criticalDims[t.id].includes(d.id);
                    return (
                      <td key={t.id} className="py-1.5">
                        <span className="inline-flex items-center gap-1">
                          <Num value={draft.weights[t.id][d.id]} onChange={(v) => set((x) => { x.weights[t.id][d.id] = v; })} w="w-16" />
                          {/* A filled star = critical, an outline one = not (shape and colour both say it; 24 px to tap). */}
                          <button type="button" className={cn("inline-flex items-center justify-center min-h-[24px] min-w-[24px] text-base leading-none", crit ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")} title="Critical skill" aria-label={`${d.name}: critical skill for ${t.name}`} aria-pressed={crit} onClick={() => set((x) => { x.criticalDims[t.id] = crit ? x.criticalDims[t.id].filter((y) => y !== d.id) : [...x.criticalDims[t.id], d.id as DimensionId]; })}>{crit ? "★" : "☆"}</button>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-border font-medium"><td className="py-1.5">Total</td>{TRACKS.map((t) => { const total = DIMENSION_IDS.reduce((s, d) => s + (draft.weights[t.id][d] || 0), 0); return <td key={t.id} className={cn(total !== 100 && BAD_TEXT)}>{total}</td>; })}</tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Rank gates" hint="A promotion needs every gate of its rank (MSRS Appendix B defaults). Promotion is automatic once all pass.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[52rem]">
            <thead><tr className="text-left text-xs text-muted-foreground"><th>Rank</th><th>Assessment %</th><th>Assessments</th><th>Critical min</th><th>Floor</th><th>Practicals</th><th>Practical score</th><th>Transfers</th><th>Retentions</th><th>Min answers</th></tr></thead>
            <tbody>
              {([2, 3, 4, 5, 6] as const).map((lvl) => {
                const g = draft.rankGates[lvl];
                const upd = (k: keyof typeof g) => (v: number) => set((d) => { (d.rankGates[lvl] as unknown as Record<string, number>)[k] = v; });
                return (
                  <tr key={lvl} className="border-t border-border">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{draft.rankLabels[lvl - 1]}</td>
                    <td><Num value={g.assessmentPct} onChange={upd("assessmentPct")} w="w-16" /></td>
                    <td><Num value={g.assessmentsNeeded} onChange={upd("assessmentsNeeded")} w="w-14" /></td>
                    <td><Num value={g.criticalMin} onChange={upd("criticalMin")} w="w-16" /></td>
                    <td><Num value={g.floor} onChange={upd("floor")} w="w-16" /></td>
                    <td><Num value={g.practicalsNeeded} onChange={upd("practicalsNeeded")} w="w-14" /></td>
                    <td><Num value={g.practicalMinScore} onChange={upd("practicalMinScore")} w="w-16" /></td>
                    <td><Num value={g.transfersNeeded} onChange={upd("transfersNeeded")} w="w-14" /></td>
                    <td><Num value={g.retentionsNeeded} onChange={upd("retentionsNeeded")} w="w-14" /></td>
                    <td><Num value={g.minValidAttempts} onChange={upd("minValidAttempts")} w="w-20" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Daily rhythm and seasons">
          <div className="flex flex-wrap gap-3">
            <Num label="Items per quest" value={draft.cadence.questItems} onChange={(v) => set((d) => { d.cadence.questItems = v; })} />
            <Num label="Transfer check after N passes" value={draft.cadence.transferEvery} onChange={(v) => set((d) => { d.cadence.transferEvery = v; })} />
            <Num label="Season weeks" value={draft.cadence.seasonWeeks} onChange={(v) => set((d) => { d.cadence.seasonWeeks = v; })} />
            <Num label="League items" value={draft.cadence.leagueItems} onChange={(v) => set((d) => { d.cadence.leagueItems = v; })} />
            <label className="text-xs inline-flex flex-col gap-1"><span className="text-muted-foreground">Retention days (comma)</span><Input className="h-9 w-40 text-sm" value={draft.cadence.retentionDays.join(", ")} onChange={(e) => set((d) => { d.cadence.retentionDays = e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => x > 0); })} /></label>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-sm">
            <label className="flex items-center gap-2"><Switch checked={draft.cadence.weeklyChallenge} onCheckedChange={(v) => set((d) => { d.cadence.weeklyChallenge = v; })} /> Weekly practical challenge</label>
            <label className="flex items-center gap-2"><Switch checked={draft.cadence.teamMissions} onCheckedChange={(v) => set((d) => { d.cadence.teamMissions = v; })} /> Team missions</label>
          </div>
        </Section>
        <Section title="Scoring and fairness">
          <div className="flex flex-wrap gap-3">
            <Num label="Pass mark %" value={draft.scoring.passMark} onChange={(v) => set((d) => { d.scoring.passMark = v; })} />
            <Num label="Hint costs (0–0.5)" step={0.05} value={draft.scoring.hintPenalty} onChange={(v) => set((d) => { d.scoring.hintPenalty = v; })} />
            <Num label="Judges may differ by" value={draft.scoring.disagreementTolerance} onChange={(v) => set((d) => { d.scoring.disagreementTolerance = v; })} />
            <Num label="Grading retries" value={draft.scoring.gradeRetryLimit} onChange={(v) => set((d) => { d.scoring.gradeRetryLimit = v; })} />
            <Num label="Same-wording threshold" step={0.01} value={draft.dedupe.lexicalJaccard} onChange={(v) => set((d) => { d.dedupe.lexicalJaccard = v; })} />
            <Num label="Same-meaning max distance" value={draft.dedupe.simhashMaxHamming} onChange={(v) => set((d) => { d.dedupe.simhashMaxHamming = v; })} />
          </div>
        </Section>
        <Section title="XP (engagement only — never a rank)">
          <div className="flex flex-wrap gap-3">
            <Num label="Answer" value={draft.xp.answerValid} onChange={(v) => set((d) => { d.xp.answerValid = v; })} />
            <Num label="Correct (×level)" value={draft.xp.correctBase} onChange={(v) => set((d) => { d.xp.correctBase = v; })} />
            <Num label="Written passed" value={draft.xp.openPassed} onChange={(v) => set((d) => { d.xp.openPassed = v; })} />
            <Num label="Quest done" value={draft.xp.questComplete} onChange={(v) => set((d) => { d.xp.questComplete = v; })} />
            <Num label="Practical passed" value={draft.xp.practicalPassed} onChange={(v) => set((d) => { d.xp.practicalPassed = v; })} />
            <Num label="Daily item cap" value={draft.xp.dailyItemCap} onChange={(v) => set((d) => { d.xp.dailyItemCap = v; })} />
          </div>
        </Section>
        <Section title="AI, privacy and notices">
          <div className="flex flex-wrap gap-3">
            <Num label="AI calls per day" value={draft.ai.dailyCallBudget} onChange={(v) => set((d) => { d.ai.dailyCallBudget = v; })} />
            <Num label="Pool target per slot" value={draft.ai.poolTarget} onChange={(v) => set((d) => { d.ai.poolTarget = v; })} />
            <Num label="Board top N" value={draft.privacy.boardTopN} onChange={(v) => set((d) => { d.privacy.boardTopN = v; })} />
            <Num label="Board min answers" value={draft.privacy.minEligibleItems} onChange={(v) => set((d) => { d.privacy.minEligibleItems = v; })} />
            <Num label="Quiet from (h)" value={draft.notifications.quietFromHour} onChange={(v) => set((d) => { d.notifications.quietFromHour = v; })} />
            <Num label="Quiet to (h)" value={draft.notifications.quietToHour} onChange={(v) => set((d) => { d.notifications.quietToHour = v; })} />
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-sm">
            <label className="flex items-center gap-2"><Switch checked={draft.ai.enabled} onCheckedChange={(v) => set((d) => { d.ai.enabled = v; })} /> AI on</label>
            <label className="flex items-center gap-2"><Switch checked={draft.notifications.enabled} onCheckedChange={(v) => set((d) => { d.notifications.enabled = v; })} /> Notices on</label>
            <label className="flex items-center gap-2"><Switch checked={draft.autoInvite} onCheckedChange={(v) => set((d) => { d.autoInvite = v; })} /> Invite people who have not started</label>
            <label className="flex items-center gap-2">Names on boards
              <select className="h-8 rounded-lg border border-border bg-background px-1 text-xs" value={draft.privacy.boardNames} onChange={(e) => set((d) => { d.privacy.boardNames = e.target.value as DevPolicy["privacy"]["boardNames"]; })}><option value="full">Full name</option><option value="first">First name</option><option value="initials">Initials</option></select>
            </label>
          </div>
        </Section>
      </div>

      <Section title="Save" hint="A new version is created; it applies from now on.">
        {problems.length > 0 && <ul className="mb-3 space-y-1">{problems.map((p) => <li key={p}><Chip tone="bad">{p}</Chip></li>)}</ul>}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you changing it? (kept with the version)" className="flex-1" data-test="policy-reason" />
          <Button className="min-h-[40px]" disabled={!changed || problems.length > 0 || reason.trim().length < 5 || busy === "policy"} onClick={save} data-test="policy-save">{busy === "policy" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Save new version</Button>
        </div>
        {!changed && <Note className="mt-2">No changes yet.</Note>}
      </Section>
    </div>
  );
}
