/**
 * SMM Delivery Control — why work was late, in two or three sentences (2026-10-15, phase 5; the Alerts log's
 * summary on top, and the weekly reasons summary).
 *
 * ── What it says, and who counts what ───────────────────────────────────────────────────────────
 * The counts are code's (`utils/smmAiRules.reasonsNumbers`): a delay at the approval or footage step is the
 * CLIENT's, a piece not sent or not posted is the TEAM's — the same split as the on-time rule, where client
 * delays never count against the team. They are shown as two marked counts (icon + colour + words) whatever
 * the AI does; the AI writes the sentences around them (`services/smmAi.reasonsSummary`), and the plain
 * summary shows first and stays when it cannot.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Hourglass, Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fallbackReasonsSummary, fingerprint, reasonsNumbers, type SmmReasonEntry } from "@/utils/smmAiRules";
import { AiTag } from "./aiShared";
import { loadSmmAi } from "./aiLoader";

export interface ReasonsSummaryProps {
  /** What the reasons cover — "This week", "October". */
  label: string;
  reasons: SmmReasonEntry[];
}

export default function ReasonsSummary({ label, reasons }: ReasonsSummaryProps) {
  const list = useMemo(() => (Array.isArray(reasons) ? reasons : []), [reasons]);
  const print = useMemo(() => fingerprint({ label, reasons: list }), [label, list]);
  const counts = useMemo(() => reasonsNumbers(list), [list]);
  const [summary, setSummary] = useState(() => ({ text: fallbackReasonsSummary({ label, reasons: list }), usedAi: false }));
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const latest = useRef({ label, reasons: list });
  latest.current = { label, reasons: list };
  const run = useRef(0);

  const ask = async (fresh: boolean) => {
    const id = ++run.current;
    setLoading(true);
    try {
      const ai = await loadSmmAi();
      const result = await ai.reasonsSummary(latest.current, { fresh });
      if (id !== run.current) return;
      setSummary({ text: result.text, usedAi: result.usedAi });
      setProblem(result.problem || null);
    } catch (err) {
      if (id === run.current) setProblem(err instanceof Error ? err.message : "The AI could not be reached.");
    } finally {
      if (id === run.current) setLoading(false);
    }
  };

  useEffect(() => {
    setSummary({ text: fallbackReasonsSummary(latest.current), usedAi: false });
    setProblem(null);
    if (latest.current.reasons.length) void ask(false);
    else run.current += 1;
    return () => { run.current += 1; };
    // Keyed on the reasons' content (`print`), not their identity: a parent re-render must not ask again.
  }, [print]);

  return (
    <section data-test="smm-reasons-summary" className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold">Why work was late · {label}</h3>
          <AiTag usedAi={summary.usedAi} />
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Writing" />}
        </div>
        {list.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void ask(true)}
            disabled={loading}
            aria-label="Write the summary again"
            data-test="smm-reasons-refresh"
            className="h-11 w-11 shrink-0 p-0 sm:h-9 sm:w-9"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
      {list.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium" data-test="smm-reasons-counts">
          <span className="inline-flex items-center gap-1 rounded-full bg-viz-wait/15 px-2 py-1">
            <Hourglass className="h-3.5 w-3.5 text-viz-wait" aria-hidden /> Client delays: {counts.client}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-viz-late/15 px-2 py-1">
            <Users className="h-3.5 w-3.5 text-viz-late" aria-hidden /> Team delays: {counts.team}
          </span>
        </div>
      )}
      <p data-test="smm-reasons-text" className="mt-2 text-sm leading-relaxed" aria-live="polite">{summary.text}</p>
      {problem && !summary.usedAi && <p className="mt-1 text-xs text-muted-foreground">Plain text — {problem}</p>}
    </section>
  );
}
