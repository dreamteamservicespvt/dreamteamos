/**
 * The person's preferences — what their work involves, the tools they use, whether they code, and their track — as ONE
 * set of controls, used by the onboarding (`StartView`) and by the Profile's edit form (`ProfileView`), so the two can
 * never ask different questions (2026-10-19).
 */
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRACKS } from "@/devos/core/dimensions";
import { ONBOARDING_QUESTIONS } from "@/devos/core/tracks";
import type { TrackId } from "@/devos/core/types";
import { Chip } from "./kit";

export type Answers = Record<string, string[]>;

export function toggleAnswer(a: Answers, q: string, id: string, multi: boolean): Answers {
  const cur = a[q] ?? [];
  return { ...a, [q]: multi ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id] };
}

/** The labels of what was picked for one question (unknown ids — an option removed later — are left out). */
export function pickedLabels(answers: Answers | undefined, qid: string): string[] {
  const q = ONBOARDING_QUESTIONS.find((x) => x.id === qid);
  return (answers?.[qid] ?? []).map((id) => q?.options.find((o) => o.id === id)?.label).filter((x): x is string => !!x);
}

export function WorkQuestions({ answers, onChange }: { answers: Answers; onChange: (a: Answers) => void }) {
  return (
    <div className="space-y-5">
      {ONBOARDING_QUESTIONS.map((q) => (
        <fieldset key={q.id}>
          <legend className="text-sm font-medium mb-2">{q.text}</legend>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => {
              const on = (answers[q.id] ?? []).includes(o.id);
              return (
                <button key={o.id} type="button" onClick={() => onChange(toggleAnswer(answers, q.id, o.id, q.multi))} aria-pressed={on}
                  className={cn("rounded-xl border px-3 py-2 text-sm text-left transition-colors min-h-[44px]", on ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-muted")}
                  data-test={`devos-q-${q.id}-${o.id}`}>
                  {on && <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-primary" />}{o.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function TrackPicker({ value, suggested, onChange }: { value: TrackId; suggested: TrackId; onChange: (t: TrackId) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Development track">
      {TRACKS.map((t) => (
        <button key={t.id} type="button" role="radio" onClick={() => onChange(t.id)} aria-checked={value === t.id} aria-pressed={value === t.id}
          className={cn("rounded-2xl border p-4 text-left transition-colors", value === t.id ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted")}
          data-test={`devos-track-${t.id}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{t.name}</p>
            {t.id === suggested && <Chip tone="primary">Suggested</Chip>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{t.purpose}</p>
        </button>
      ))}
    </div>
  );
}
