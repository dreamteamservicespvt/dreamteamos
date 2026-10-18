/**
 * My History (FR-048, FR-049, AC-008, AC-009): every answer and task, newest first, never overwritten — failed and
 * system-error ones included — each opening its full record.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DIMENSIONS, dimensionName } from "@/devos/core/dimensions";
import { dayLabel } from "@/devos/core/days";
import type { DimensionId, Outcome } from "@/devos/core/types";
import { useDevAttempts, useDevTasks } from "@/hooks/useDevOs";
import { useDevOs } from "./context";
import { Chip, DifficultyDots, Empty, Loading, OUTCOME_WORD, PurposeChip, Section, fmtDateTime } from "./kit";

export default function HistoryView() {
  const { user, tasks } = useDevOs();
  const [max, setMax] = useState(40);
  const { data: attempts, loading } = useDevAttempts(user.uid, max);
  const [dim, setDim] = useState<DimensionId | "all">("all");
  const [outcome, setOutcome] = useState<Outcome | "all">("all");
  const [view, setView] = useState<"answers" | "tasks">("answers");
  // The page-wide task listener holds the newest 40; "Show older tasks" opens a longer one, only while it is needed
  // (the whole history must be reachable — MSRS FR-048 — without reading it all on every visit).
  const [taskMax, setTaskMax] = useState(0);
  const { data: olderTasks } = useDevTasks(taskMax ? user.uid : undefined, taskMax || 1);
  const allTasks = taskMax ? olderTasks : tasks;
  const shown = useMemo(() => attempts.filter((a) => (dim === "all" || a.dim === dim) && (outcome === "all" || (a.current?.outcome ?? a.outcome) === outcome)), [attempts, dim, outcome]);
  const closed = allTasks.filter((t) => !["assigned", "in_progress"].includes(t.state));

  return (
    <div className="space-y-4" data-test="history-view">
      <div className="flex gap-1.5">
        {(["answers", "tasks"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={cn("rounded-xl px-3 py-2 text-sm min-h-[40px] border", view === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>{v === "answers" ? "Answers" : "Tasks"}</button>
        ))}
      </div>
      {view === "answers" ? (
        <Section title="Every answer" hint="Kept permanently. A correction after a review is added on top — the original result stays."
          right={
            <div className="flex flex-wrap gap-2">
              <select value={dim} onChange={(e) => setDim(e.target.value as DimensionId | "all")} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" aria-label="Filter by skill">
                <option value="all">All skills</option>{DIMENSIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome | "all")} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" aria-label="Filter by result">
                <option value="all">All results</option>{(Object.keys(OUTCOME_WORD) as Outcome[]).map((o) => <option key={o} value={o}>{OUTCOME_WORD[o].word}</option>)}
              </select>
            </div>
          }>
          {loading ? <Loading /> : shown.length ? (
            <ul className="divide-y divide-border">
              {shown.map((a) => {
                const o = a.current?.outcome ?? a.outcome;
                const score = a.current?.score ?? a.scoring?.score;
                return (
                  <li key={a.id}>
                    <Link to={`/dev-os/history/${a.id}`} className="flex items-center gap-3 py-3 hover:bg-muted/40 rounded-lg px-1 -mx-1" data-test={`history-row-${a.id}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.item.question}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-xs text-muted-foreground">{fmtDateTime(a.submittedAt)}</span>
                          <Chip tone="primary">{dimensionName(a.dim)}</Chip>
                          <PurposeChip purpose={a.purpose} />
                          <DifficultyDots level={a.difficulty} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Chip tone={OUTCOME_WORD[o].tone}>{OUTCOME_WORD[o].word}</Chip>
                        {typeof score === "number" && <p className="text-xs text-muted-foreground mt-1 tabular-nums">{score}%</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>No answers yet{dim !== "all" || outcome !== "all" ? " with these filters" : ""}.</Empty>}
          {attempts.length >= max && <Button variant="outline" className="mt-3 w-full min-h-[44px]" onClick={() => setMax((m) => m + 40)}>Show older answers</Button>}
        </Section>
      ) : (
        <Section title="Tasks" hint="Quests, challenges, fresh tries, assessments — with how each ended.">
          {closed.length ? (
            <ul className="divide-y divide-border">
              {closed.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0"><Link to={`/dev-os/play/${t.id}`} className="text-sm font-medium hover:underline inline-flex items-center min-h-[24px]">{t.title}</Link><p className="text-xs text-muted-foreground">{dayLabel(t.day)} · {t.events[t.events.length - 1]?.reason}</p></div>
                  {/* A baseline / league round ends "completed" for good — it reads "done", not like a task being graded. */}
                  <Chip tone={t.state === "passed" ? "good" : t.state === "failed" ? "bad" : t.state === "completed" ? "info" : "muted"}>{t.state === "completed" && (t.kind === "baseline" || t.kind === "league") ? "done" : t.state === "completed" ? "being graded" : t.state.replace("_", " ")}</Chip>
                </li>
              ))}
            </ul>
          ) : <Empty>No finished tasks yet.</Empty>}
          {allTasks.length >= (taskMax || 40) && (
            <Button variant="outline" className="mt-3 w-full min-h-[44px]" onClick={() => setTaskMax((m) => (m || 40) + 40)} data-test="history-older-tasks">Show older tasks</Button>
          )}
        </Section>
      )}
    </div>
  );
}
