/**
 * A practical task (weekly challenge, team-mission part, capstone): the brief, the evidence the rubric needs, and the
 * result once two graders have marked it (FR-031). Required fields, links and the checklist are checked by the server
 * before any AI looks at it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DevTask } from "@/devos/core/types";
import { useDevOs } from "../context";
import { readPracticalDraft, writePracticalDraft } from "../drafts";
import { Chip, GOOD_TEXT, BAD_TEXT, Note, ScenarioText, Section, TAP, fmtDateTime } from "../kit";
import { requestGrade, useAutoGradeTask } from "../useAutoGrade";

type Fields = Record<string, string | number | boolean[]>;

export function PracticalView({ task }: { task: DevTask }) {
  const { user, run, busy } = useDevOs();
  const uid = user.uid;
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  useAutoGradeTask(task);
  // Unsent evidence is kept in this browser per person and task (`../drafts`), so leaving the page loses nothing.
  const [fields, setFields] = useState<Fields>(() => readPracticalDraft<Fields>(uid, task.id) as Fields);
  const isOpen = task.state === "assigned" || task.state === "in_progress";
  useEffect(() => {
    if (!isOpen) { writePracticalDraft(uid, task.id, null); return; } // submitted or closed: nothing to keep
    const t = setTimeout(() => writePracticalDraft(uid, task.id, fields), 400);
    return () => clearTimeout(t);
  }, [fields, uid, task.id, isOpen]);
  const set = (id: string, v: string | number | boolean[]) => setFields((f) => ({ ...f, [id]: v }));
  const open = task.state === "assigned" || task.state === "in_progress";
  const missing = useMemo(() => (task.evidence ?? []).filter((r) => {
    if (!r.required) return false;
    const v = fields[r.id];
    if (r.kind === "checklist") return !(Array.isArray(v) && v.length === (r.items?.length ?? 0) && v.every(Boolean));
    if (r.kind === "number") return typeof v !== "number";
    return typeof v !== "string" || v.trim().length < (r.kind === "text" ? 15 : 8);
  }).length, [fields, task.evidence]);

  const submit = async () => {
    // Saved and queued at once; the two judges run in a request of their own (`grade`), so a slow AI day never cuts the
    // submit off, and the grade arrives on this page by itself (useAutoGradeTask, 2026-10-19).
    const r = await run<DevTask>("submit", { taskId: task.id, fields, defer: true }, { label: "submit" });
    if (!r) return; // not submitted — the draft stays
    writePracticalDraft(uid, task.id, null);
    requestGrade(task.id, "task");
    // The result opens at the top of the view (the page scrolls inside AppLayout's <main>, not the window).
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={rootRef} className="space-y-4 scroll-mt-4" data-test="practical-view">
      {/* The section tabs are hidden while a task is open, so the way back is here (a phone had none — browser test). */}
      <button type="button" onClick={() => navigate("/dev-os")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[40px]" data-test="practical-leave">
        <ArrowLeft className="h-4 w-4" /> {open ? "Home (what you typed is kept on this device)" : "Home"}
      </button>
      <Section title={task.title} hint={`Due ${fmtDateTime(task.dueAt)} · about ${task.estMinutes} minutes`}
        right={<Chip tone={task.state === "passed" ? "good" : task.state === "failed" ? "bad" : task.state === "completed" ? "info" : "muted"}>{task.state === "completed" ? "Grading…" : task.state === "assigned" || task.state === "in_progress" ? "To do" : task.state[0].toUpperCase() + task.state.slice(1).replace("_", " ")}</Chip>}>
        <p className="text-sm text-muted-foreground mb-2">{task.why}</p>
        {task.brief && <ScenarioText text={task.brief} />}
        {task.rubric && (
          <div className="mt-3 rounded-xl bg-muted/40 p-3">
            <p className="text-xs font-medium mb-1">How it is graded (passes at {task.rubric.passMark}%)</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">{task.rubric.criteria.map((c) => <li key={c.id}><span className="text-foreground">{c.label}</span> ({c.weight}%) — {c.anchors[4]}</li>)}</ul>
          </div>
        )}
      </Section>

      {task.state === "completed" && (
        <Section title="Grading your work" hint="Two independent graders mark it against the rubric — this usually takes under a minute.">
          <p className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Waiting for the graders… this page updates by itself; you can also leave — the result will be here.</p>
        </Section>
      )}

      {task.scoring && (
        <Section title="Result" right={<Chip tone={task.state === "passed" ? "good" : "bad"}>{task.scoring.score}%</Chip>}>
          {task.feedback && <p className="font-medium text-sm mb-2">{task.feedback.headline}</p>}
          <ul className="space-y-2">
            {(task.scoring.criteria ?? []).map((c) => (
              <li key={c.id} className="text-sm">
                <div className="flex justify-between gap-2"><span className="font-medium">{c.label}</span><span className="text-muted-foreground tabular-nums">{c.score}/4</span></div>
                {c.evidence && <p className="text-xs text-muted-foreground italic">“{c.evidence}”</p>}
              </li>
            ))}
          </ul>
          {task.feedback?.steps.length ? <ul className="list-disc pl-5 text-sm mt-3 space-y-1">{task.feedback.steps.map((s, i) => <li key={i}>{s}</li>)}</ul> : null}
        </Section>
      )}

      {task.state === "expired" && <Note>The deadline passed before this was submitted. It does not reduce your skills — a new challenge comes next week.</Note>}
      {task.state === "system_error" && <Note>We could not grade this one reliably — it does not count against you.</Note>}

      {open && (
        <Section title="Your evidence" hint="Fill in every required part. Be specific — real numbers and examples score higher than long text.">
          <div className="space-y-4">
            {(task.evidence ?? []).map((r) => (
              <div key={r.id}>
                <label className="text-sm font-medium" htmlFor={`ev-${r.id}`}>{r.label}{r.required && <span className={BAD_TEXT}> *</span>}</label>
                {r.kind === "text" && <Textarea id={`ev-${r.id}`} rows={4} className="mt-1" value={(fields[r.id] as string) ?? ""} onChange={(e) => set(r.id, e.target.value.slice(0, 3000))} data-test={`ev-${r.id}`} />}
                {r.kind === "link" && <Input id={`ev-${r.id}`} type="url" className="mt-1" placeholder="https://…" value={(fields[r.id] as string) ?? ""} onChange={(e) => set(r.id, e.target.value)} data-test={`ev-${r.id}`} />}
                {r.kind === "number" && <Input id={`ev-${r.id}`} inputMode="decimal" className="mt-1 max-w-[12rem]" value={fields[r.id] === undefined ? "" : String(fields[r.id])} onChange={(e) => { const v = Number(e.target.value); set(r.id, e.target.value === "" || !Number.isFinite(v) ? "" : v); }} data-test={`ev-${r.id}`} />}
                {r.kind === "checklist" && (
                  <div className="mt-1 space-y-1.5">
                    {(r.items ?? []).map((it, i) => {
                      const arr = (fields[r.id] as boolean[]) ?? (r.items ?? []).map(() => false);
                      return (
                        <label key={i} className="flex items-center gap-2 text-sm min-h-[36px] cursor-pointer">
                          <Checkbox checked={!!arr[i]} onCheckedChange={(v) => { const n = [...arr]; n[i] = v === true; set(r.id, n); }} data-test={`ev-${r.id}-${i}`} />{it}
                        </label>
                      );
                    })}
                  </div>
                )}
                {r.hint && <p className="text-xs text-muted-foreground mt-1">{r.hint}</p>}
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-4">
            <p className={cn("text-xs", missing ? "text-muted-foreground" : GOOD_TEXT)}>{missing ? `${missing} required part${missing > 1 ? "s" : ""} still empty` : <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Ready to submit</span>}</p>
            <Button className={TAP} disabled={!!missing || busy === "submit"} onClick={submit} data-test="practical-submit">
              {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}Submit for grading
            </Button>
          </div>
        </Section>
      )}
      {!open && <Button variant="outline" className={TAP} onClick={() => navigate("/dev-os")}>Back to Home</Button>}
    </div>
  );
}
