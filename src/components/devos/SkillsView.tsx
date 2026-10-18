/**
 * My Skill Profile (the brief §12, FR-049): the ten dimensions — score, baseline, confidence and how much evidence it
 * rests on, the level of the next challenge, the recent evidence, retention checks, and practice. Nothing is shown as a
 * number until it has been measured (FR-004).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DIMENSIONS, TRACK_OBJECTIVES } from "@/devos/core/dimensions";
import { dimensionWord } from "@/devos/core/mastery";
import type { DimensionId } from "@/devos/core/types";
import { useDevOs } from "./context";
import { BAD_TEXT, Bar, Chip, DifficultyDots, Disclaimer, Empty, GOOD_TEXT, Loading, Note, Section, fmtDate } from "./kit";

const KIND_WORD: Record<string, string> = { baseline: "baseline", practice: "practice", assessment: "assessment", transfer: "transfer", retention: "retention", practical: "practical task", capstone: "capstone", league: "league" };

export default function SkillsView() {
  const { profile, profileLoading, policy, run, busy } = useDevOs();
  const navigate = useNavigate();
  const [open, setOpen] = useState<DimensionId | null>(null);
  if (profileLoading) return <Loading />;
  if (!profile || profile.onboarding.baseline === "not_started") return <Empty>Your skills appear after your baseline. <button className="underline" onClick={() => navigate("/dev-os/start")}>Start now</button></Empty>;
  const weights = policy.weights[profile.track];
  const critical = new Set(policy.criticalDims[profile.track]);
  const practise = async (dim: DimensionId) => {
    const r = await run<{ taskId: string }>("practice", { dim }, { label: `practice:${dim}` });
    if (r?.taskId) navigate(`/dev-os/play/${r.taskId}`);
  };
  return (
    <div className="space-y-4" data-test="skills-view">
      <Section title="Your ten skills" hint="Each moves only with real answers. A right answer at a harder level counts more; one old miss never drags it down forever.">
        <ul className="divide-y divide-border">
          {DIMENSIONS.map((d) => {
            const s = profile.dims[d.id];
            const isFocus = profile.plan.focus.includes(d.id);
            const w = dimensionWord(s, isFocus);
            const expanded = open === d.id;
            return (
              <li key={d.id} className="py-3" data-test={`skill-${d.id}`}>
                <button type="button" className="w-full text-left" onClick={() => setOpen(expanded ? null : d.id)} aria-expanded={expanded}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-medium truncate">{d.name}</span>
                      {critical.has(d.id) && <span title="A critical skill for your track"><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" aria-label="critical skill" /></span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Chip tone={w.tone === "good" ? "good" : w.tone === "ok" ? "info" : w.tone === "focus" ? "warn" : "muted"}>{w.word}</Chip>
                      <span className="w-9 text-right font-bold tabular-nums">{s.score === null ? "—" : Math.round(s.score)}</span>
                      {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                  <Bar className="mt-2" value={s.score} baseline={s.baseline} tone={w.tone === "good" ? "good" : w.tone === "focus" ? "warn" : w.tone === "none" ? "muted" : "primary"} />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {s.n ? `Based on ${s.n} answer${s.n > 1 ? "s" : ""} · ${s.confidence} confidence` : "No evidence yet"} · {weights[d.id]}% of your track's overall · next challenge level <DifficultyDots level={s.level} />
                  </p>
                </button>
                {expanded && (
                  <div className="mt-3 rounded-xl bg-muted/40 p-3 space-y-2 text-sm">
                    <p><span className="font-medium">What it measures:</span> {d.measures}</p>
                    <p><span className="font-medium">In your work:</span> {TRACK_OBJECTIVES[profile.track][d.id]}</p>
                    {s.baseline !== null && s.score !== null && <p className="text-xs text-muted-foreground">Baseline {Math.round(s.baseline)} → now {Math.round(s.score)} ({s.score - s.baseline >= 0 ? "+" : ""}{Math.round(s.score - s.baseline)})</p>}
                    {s.recent.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">Recent evidence</p>
                        <ul className="text-xs space-y-0.5">
                          {[...s.recent].reverse().slice(0, 6).map((r, i) => (
                            <li key={i} className="flex justify-between gap-2"><span className="text-muted-foreground">{fmtDate(r.t)} · {KIND_WORD[r.k] ?? r.k} · level {r.d}</span><span className={cn("tabular-nums font-medium", r.s >= 60 ? GOOD_TEXT : BAD_TEXT)}>{r.s}%</span></li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {s.retention?.length ? <p className="text-xs text-muted-foreground">Next retention check: {s.retention.map((r) => `level ${r.level} on ${r.due}`).join(", ")}</p> : null}
                    <Button size="sm" className="min-h-[40px]" disabled={!!busy} onClick={() => practise(d.id)} data-test={`skill-practise-${d.id}`}>
                      {busy === `practice:${d.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Practise {d.short}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <Note className="mt-3">★ = a critical skill for your track: a rank can never be earned while one of these is weak, however strong the others are.</Note>
      </Section>
      <Disclaimer />
    </div>
  );
}
