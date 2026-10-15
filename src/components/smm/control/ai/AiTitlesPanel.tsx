/**
 * SMM Delivery Control — "Suggest titles" for a client's month (2026-10-15, phase 5; `.claude/rules/smm.md` §9.9 "Phase 5").
 *
 * ── What a person sees ──────────────────────────────────────────────────────────────────────────
 * Every piece of the month not live yet, by week ("Week 2 · due Wed 28 Oct"), with its type (🎬 / 🖼 / 📹 / ⭐)
 * and its title as the board shows it. "Suggest titles" asks the AI for a title, the idea, a caption and
 * hashtags per piece (and a festival from that piece's own week); each suggestion is editable, each row has a
 * tick, and "Accept ticked" hands ONLY the ticked rows to the page (`onAccept` → the plan, phase 3).
 *
 * ── The rules it keeps (owner's plan, 2026-10-15) ──────────────────────────────────────────────
 *   • A person accepts the titles — nothing is saved by suggesting.
 *   • A title somebody already gave a piece is never replaced unless they tick that row: such rows start
 *     unticked, and a row ticked automatically is unticked the moment a title appears on its piece.
 *   • Preview saves nothing: the AI can be tried, the button says "would set — not saved" and is off.
 *   • The client's last two months' titles go to the AI (`smm.fetchClientMonths`, one read); if that read
 *     fails the panel says so and carries on.
 *   • When Gemini fails the titles stay blank for a person, with an honest line saying so.
 * The counts, weeks and deadlines are the rules' (`utils/smmCadence`); the AI only writes words.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fetchClientMonths } from "@/services/smm";
import {
  SMM_AI_LIMITS, cleanAcceptedEntry, dayLabel, normalizeHashtags, pastTitlesOf, titleTasksOf, typeMetaOf,
  type SmmFestivalPick, type SmmTitleTask,
} from "@/utils/smmAiRules";
import type { SmmDeliveryMonth, SmmMonthPlan } from "@/utils/smmCadence";
import { AiTag } from "./aiShared";
import { loadSmmAi } from "./aiLoader";

/** One accepted row — the shape `services/smmDelivery.acceptPlanSuggestions` takes (`SmmAcceptedSuggestion`). */
export interface SmmAiAcceptEntry {
  itemId: string;
  title: string;
  idea: string;
  caption: string;
  hashtags: string[];
  festival: { name: string; date: string } | null;
}

export interface AiTitlesPanelProps {
  month: SmmDeliveryMonth;
  plan: SmmMonthPlan;
  /** yyyy-MM-dd, India time. */
  today: string;
  /** May this person save titles on this month (on the month, or a manager)? */
  canAccept: boolean;
  /** Delivery Control is in Preview: the AI may be tried, nothing is saved. */
  preview: boolean;
  onAccept: (entries: SmmAiAcceptEntry[]) => Promise<void>;
}

interface Row {
  title: string;
  idea: string;
  caption: string;
  /** As typed: "#Diwali #Gold". */
  tags: string;
  festival: SmmFestivalPick | null;
  /** null = the panel's own choice (blank title on the board → ticked); true / false = the person's. */
  ticked: boolean | null;
  saved: boolean;
}

type Phase = "idle" | "loading" | "done";

const rowHasWords = (r: Row) => !!(r.title.trim() || r.idea.trim() || r.caption.trim() || r.festival);

/** Ticked? A row the person never touched is ticked only when its piece has no title on the board yet. */
const isTicked = (r: Row | undefined, t: SmmTitleTask) =>
  !!r && !r.saved && rowHasWords(r) && (r.ticked ?? (!t.currentTitle && !!r.title.trim()));

const weekHeading = (plan: SmmMonthPlan, week: number | null) => {
  if (!week) return "Outside the weekly count";
  const w = plan.weeks.find((x) => x.week === week);
  return w ? `Week ${week} · due ${dayLabel(w.deadlineDay)}` : `Week ${week}`;
};

export default function AiTitlesPanel({ month, plan, today, canAccept, preview, onAccept }: AiTitlesPanelProps) {
  const tasks = useMemo(() => {
    try {
      return titleTasksOf(month, plan, { today });
    } catch {
      return [];
    }
  }, [month, plan, today]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [usedAi, setUsedAi] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pastNote, setPastNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const withoutTitle = tasks.filter((t) => !t.currentTitle).length;
  const ticked = tasks.filter((t) => isTicked(rows[t.itemId], t));
  const acceptDisabled = preview || !canAccept || saving || ticked.length === 0;

  const suggest = async () => {
    if (phase === "loading") return;
    setPhase("loading");
    setSaveMsg(null);
    setPastNote(null);
    let pastTitles: string[] = [];
    try {
      const months = await fetchClientMonths(month.clientPhoneId);
      pastTitles = pastTitlesOf(months, month, 2);
    } catch {
      setPastNote("Couldn't read the last two months' titles — repeats were not checked.");
    }
    let result: { suggestions: { itemId: string; title: string; idea: string; caption: string; hashtags: string[]; festival: SmmFestivalPick | null }[]; usedAi: boolean; problem?: string };
    try {
      const ai = await loadSmmAi();
      result = await ai.suggestWeekTasks({ month, plan, pastTitles, today, itemIds: tasks.map((t) => t.itemId) });
    } catch (err) {
      // The AI module itself could not load (offline, an old tab after a deploy): blank titles, as on any failure.
      result = { suggestions: tasks.map((t) => ({ itemId: t.itemId, title: "", idea: "", caption: "", hashtags: [], festival: null })), usedAi: false, problem: err instanceof Error ? err.message : undefined };
    }
    if (!alive.current) return;
    const next: Record<string, Row> = {};
    for (const s of result.suggestions) {
      next[s.itemId] = { title: s.title, idea: s.idea, caption: s.caption, tags: s.hashtags.join(" "), festival: s.festival, ticked: null, saved: false };
    }
    setRows(next);
    setUsedAi(result.usedAi);
    setProblem(result.problem || null);
    setPhase("done");
  };

  const edit = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const accept = async () => {
    if (acceptDisabled) return;
    const entries: SmmAiAcceptEntry[] = ticked.map((t) => {
      const r = rows[t.itemId];
      return cleanAcceptedEntry({ itemId: t.itemId, title: r.title, idea: r.idea, caption: r.caption, hashtags: normalizeHashtags(r.tags), festival: r.festival });
    });
    setSaving(true);
    setSaveMsg(null);
    try {
      await onAccept(entries);
      if (!alive.current) return;
      setRows((r) => {
        const copy = { ...r };
        for (const e of entries) copy[e.itemId] = { ...copy[e.itemId], saved: true, ticked: false };
        return copy;
      });
      setSaveMsg({ ok: true, text: `Saved ${entries.length} ${entries.length === 1 ? "piece" : "pieces"}.` });
    } catch (err) {
      if (alive.current) setSaveMsg({ ok: false, text: err instanceof Error && err.message ? err.message : "Couldn't save — try again." });
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  const weeks = [...new Set(tasks.map((t) => t.week))];

  return (
    <section data-test="smm-ai-titles" className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-viz-ready" aria-hidden /> Titles &amp; ideas
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The weekly rules set how many and when; the AI only suggests the words. Nothing changes until you accept.
          </p>
          <p className="mt-1 text-xs text-muted-foreground" data-test="smm-ai-titles-count">
            {tasks.length} {tasks.length === 1 ? "piece" : "pieces"} not live yet · {withoutTitle} without a title
          </p>
        </div>
        <Button
          type="button"
          onClick={suggest}
          disabled={phase === "loading" || tasks.length === 0}
          data-test="smm-ai-suggest"
          className="h-11 shrink-0 gap-2 sm:h-10"
        >
          {phase === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {phase === "loading" ? "Writing titles…" : phase === "done" ? "Suggest again" : "Suggest titles"}
        </Button>
      </header>

      {preview && (
        <p data-test="smm-ai-preview" className="mt-3 rounded-lg border border-viz-wait/40 bg-viz-wait/10 px-3 py-2 text-sm">
          Preview — you can try the AI, but accepting would set titles and is not saved.
        </p>
      )}

      {phase === "done" && (
        <div className="mt-3 space-y-1" aria-live="polite">
          {usedAi ? (
            <p data-test="smm-ai-ready" className="flex flex-wrap items-center gap-2 text-sm">
              <AiTag usedAi />
              <span>Suggestions ready — edit them, tick the ones to keep, then accept.</span>
            </p>
          ) : (
            <p data-test="smm-ai-failed" className="flex items-start gap-2 rounded-lg border border-viz-wait/40 bg-viz-wait/10 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-viz-wait" aria-hidden />
              <span>
                <strong>Gemini is busy — titles left blank for you.</strong>
                {tasks.some((t) => rows[t.itemId]?.festival) && " The week's festival is still suggested where there is one."}
              </span>
            </p>
          )}
          {problem && <p data-test="smm-ai-problem" className="text-xs text-muted-foreground">{problem}</p>}
          {pastNote && <p data-test="smm-ai-past-note" className="text-xs text-muted-foreground">{pastNote}</p>}
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground" data-test="smm-ai-empty">Every piece of this month is live — nothing to title.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {weeks.map((week) => (
            <div key={String(week)} className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold">{weekHeading(plan, week)}</h4>
              <ul className="space-y-2">
                {tasks.filter((t) => t.week === week).map((t) => (
                  <TitleRow
                    key={t.itemId}
                    task={t}
                    row={rows[t.itemId]}
                    ticked={isTicked(rows[t.itemId], t)}
                    onEdit={(patch) => edit(t.itemId, patch)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {phase === "done" && (
        <footer className="mt-4 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            {saveMsg && (
              <p data-test="smm-ai-save-msg" className={cn("flex items-center gap-1.5", saveMsg.ok ? "text-viz-done" : "text-viz-late")}>
                {saveMsg.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
                {saveMsg.text}
              </p>
            )}
            {!preview && !canAccept && (
              <p className="text-muted-foreground" data-test="smm-ai-cannot-accept">Only the people on this month (or a manager) can accept titles.</p>
            )}
          </div>
          <Button
            type="button"
            onClick={accept}
            disabled={acceptDisabled}
            data-test="smm-ai-accept"
            className="h-11 shrink-0 gap-2 sm:h-10"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {preview ? `Would set ${ticked.length} — not saved` : `Accept ticked (${ticked.length})`}
          </Button>
        </footer>
      )}
    </section>
  );
}

function TitleRow({ task, row, ticked, onEdit }: {
  task: SmmTitleTask;
  row: Row | undefined;
  ticked: boolean;
  onEdit: (patch: Partial<Row>) => void;
}) {
  const meta = typeMetaOf(task.type);
  const id = `smm-ai-${task.itemId}`;
  const canTick = !!row && !row.saved && rowHasWords(row);
  return (
    <li data-test="smm-ai-row" data-item={task.itemId} className="min-w-0 rounded-lg border border-border bg-background p-2.5 sm:p-3">
      <div className="flex min-w-0 items-start gap-2">
        {row && (
          <label htmlFor={id} className="-m-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center sm:h-9 sm:w-9">
            <Checkbox
              id={id}
              checked={ticked}
              disabled={!canTick}
              onCheckedChange={(v) => onEdit({ ticked: v === true })}
              aria-label={`Accept the suggestion for ${task.currentTitle || meta.label}`}
              data-test="smm-ai-tick"
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              <span aria-hidden>{meta.icon}</span> {meta.label}
            </span>
            <span className={cn("min-w-0 truncate text-sm", task.currentTitle ? "font-medium" : "italic text-muted-foreground")}>
              {task.currentTitle || "No title yet"}
            </span>
            {task.fixed && task.deadlineDay && (
              <span className="shrink-0 text-xs text-muted-foreground">· fixed {dayLabel(task.deadlineDay)}</span>
            )}
            {row?.saved && (
              <span data-test="smm-ai-row-saved" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-viz-done">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Saved
              </span>
            )}
          </div>
          {row && task.currentTitle && !ticked && !row.saved && (
            <p className="mt-1 text-xs text-muted-foreground">Has a title — not changed unless you tick it.</p>
          )}
        </div>
      </div>

      {row && !row.saved && (
        <div className="mt-2 grid min-w-0 gap-2 sm:pl-11">
          <Input
            value={row.title}
            maxLength={SMM_AI_LIMITS.title}
            placeholder="Title (left blank for you)"
            onChange={(e) => onEdit({ title: e.target.value })}
            aria-label="Suggested title"
            data-test="smm-ai-title-input"
            className="h-11 sm:h-10"
          />
          <Textarea
            value={row.idea}
            maxLength={SMM_AI_LIMITS.idea}
            rows={2}
            placeholder="Idea"
            onChange={(e) => onEdit({ idea: e.target.value })}
            aria-label="Idea"
            className="min-h-[44px] text-sm"
          />
          <Textarea
            value={row.caption}
            maxLength={SMM_AI_LIMITS.caption}
            rows={3}
            placeholder="Caption draft"
            onChange={(e) => onEdit({ caption: e.target.value })}
            aria-label="Caption draft"
            className="min-h-[44px] text-sm"
          />
          <Input
            value={row.tags}
            placeholder="#hashtags"
            onChange={(e) => onEdit({ tags: e.target.value })}
            aria-label="Hashtags"
            className="h-11 text-sm sm:h-10"
          />
          {!task.fixed && task.festivals.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <label htmlFor={`${id}-fest`} className="text-muted-foreground">Festival</label>
              <select
                id={`${id}-fest`}
                data-test="smm-ai-festival"
                value={row.festival?.date || ""}
                onChange={(e) => {
                  const f = task.festivals.find((x) => x.date === e.target.value) || null;
                  onEdit({ festival: f ? { name: f.name, date: f.date } : null });
                }}
                className="h-11 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm sm:h-9"
              >
                <option value="">None</option>
                {task.festivals.map((f) => (
                  <option key={`${f.date}-${f.name}`} value={f.date}>{`${f.name} · ${dayLabel(f.date)}`}</option>
                ))}
              </select>
              {row.festival && (
                <button
                  type="button"
                  onClick={() => onEdit({ festival: null })}
                  className="inline-flex h-11 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground sm:h-8"
                  aria-label="Remove the festival"
                >
                  <X className="h-3.5 w-3.5" aria-hidden /> Remove
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
