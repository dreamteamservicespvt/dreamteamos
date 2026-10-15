/**
 * SMM Delivery Control — the "My week" / "This morning" brief (2026-10-15, phase 5).
 *
 * ── Why it shows the plain text first ───────────────────────────────────────────────────────────
 * The brief is written by Gemini, which can be slow or down (11 of 30 keys were dead on 2026-10-10). The card
 * never waits for it: it shows the brief cached for this person (this week / today), else the rules' plain
 * template at once (`utils/smmAiRules.fallbackWeekBrief` / `fallbackMorningBrief`), and swaps in the AI's text
 * when it arrives. A small tag says which one is on screen ("✨ AI" / "Plain"); Refresh asks again, ignoring
 * the cache. Every count in the AI's text was put there by code (`fillBrief`), never by the model.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fallbackMorningBrief, fallbackWeekBrief, fingerprint, morningBriefCacheKey, readBriefCache, weekBriefCacheKey,
  type MemberWeekBriefInput, type MorningBriefInput,
} from "@/utils/smmAiRules";
import { AiTag } from "./aiShared";
import { loadSmmAi } from "./aiLoader";

export type BriefCardProps =
  | { kind: "morning"; input: MorningBriefInput }
  | { kind: "week"; input: MemberWeekBriefInput };

const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** What the card shows before the AI answers: this person's cached brief, else the plain template. */
function initialBrief(props: BriefCardProps): { text: string; usedAi: boolean } {
  try {
    const key = props.kind === "week" ? weekBriefCacheKey(props.input.uid, props.input.today) : morningBriefCacheKey(props.input.uid, props.input.today);
    const cached = readBriefCache(storage(), key);
    if (cached) return cached;
    return { text: props.kind === "week" ? fallbackWeekBrief(props.input) : fallbackMorningBrief(props.input), usedAi: false };
  } catch {
    return { text: props.kind === "week" ? "Your week's tasks are below." : "Good morning.", usedAi: false };
  }
}

export default function BriefCard(props: BriefCardProps) {
  const { kind } = props;
  const print = useMemo(() => `${kind}:${fingerprint(props.input)}`, [kind, props.input]);
  const [brief, setBrief] = useState(() => initialBrief(props));
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const run = useRef(0);

  const ask = async (fresh: boolean) => {
    const id = ++run.current;
    const p = latest.current;
    setLoading(true);
    if (fresh) setProblem(null);
    try {
      const ai = await loadSmmAi();
      const result = p.kind === "week" ? await ai.memberWeekBrief(p.input, { fresh }) : await ai.morningBrief(p.input, { fresh });
      if (id !== run.current) return;
      setBrief({ text: result.text, usedAi: result.usedAi });
      setProblem(result.problem || null);
    } catch (err) {
      if (id !== run.current) return;
      // The AI module could not load: the plain text stays.
      setProblem(err instanceof Error ? err.message : "The AI could not be reached.");
    } finally {
      if (id === run.current) setLoading(false);
    }
  };

  // A new input (another person, another day, other numbers): its own cached / plain text, then the AI.
  useEffect(() => {
    const first = initialBrief(latest.current);
    setBrief(first);
    setProblem(null);
    if (!first.usedAi) void ask(false);
    else run.current += 1;
    return () => { run.current += 1; };
    // Keyed on the input's content (`print`), not its identity: a parent re-render must not ask again.
  }, [print]);

  const title = kind === "week" ? "My week" : "This morning";
  return (
    <section data-test={`smm-brief-${kind}`} className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <AiTag usedAi={brief.usedAi} />
          {loading && (
            <span data-test="smm-brief-loading" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Writing…
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void ask(true)}
          disabled={loading}
          data-test="smm-brief-refresh"
          aria-label={`Write the ${title.toLowerCase()} brief again`}
          className="h-11 w-11 shrink-0 p-0 sm:h-9 sm:w-9"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
        </Button>
      </div>
      <p data-test="smm-brief-text" className="mt-1.5 whitespace-pre-line text-sm leading-relaxed" aria-live="polite">{brief.text}</p>
      {problem && !brief.usedAi && (
        <p data-test="smm-brief-problem" className="mt-1 text-xs text-muted-foreground">Plain text — {problem}</p>
      )}
    </section>
  );
}
