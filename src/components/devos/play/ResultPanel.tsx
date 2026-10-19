/**
 * After an answer (MSRS §9.2 step 5, FR-022): what happened, the worked solution, the gap in plain words, the
 * criterion-by-criterion grading of a written answer with the quoted evidence, the AI coach, and the appeal.
 */
import { useState } from "react";
import { AlertTriangle, Award, CheckCircle2, ChevronDown, ChevronUp, Loader2, MessageCircleQuestion, Scale, Sparkles, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BADGE_BY_ID } from "@/devos/core/badges";
import { rankLabel } from "@/devos/core/policy";
import type { DevAttempt, GapKind } from "@/devos/core/types";
import { useDevOs } from "../context";
import { ACCENT_TEXT, Chip, OUTCOME_WORD, ScenarioText, TAP, withUnit } from "../kit";

const GAP_WORDS: Record<GapKind, string> = {
  knowledge: "a missing piece of knowledge", assumption: "an assumption the facts did not support", evidence: "how the evidence was read",
  calculation: "a step in the working", tradeoff: "how the trade-offs were weighed", communication: "how it was said", incomplete: "something left out",
  reading: "a detail in the question", none: "",
};

export interface ResultExtras {
  xpGained?: number;
  xpLines?: { amount: number; reason: string }[];
  badges?: string[];
  rankUp?: number | null;
}

export function ResultPanel({ attempt, extras }: { attempt: DevAttempt; extras?: ResultExtras }) {
  const { policy, run } = useDevOs();
  const { toast } = useToast();
  const [showExemplar, setShowExemplar] = useState(false);
  const [ask, setAsk] = useState("");
  const [coachReply, setCoachReply] = useState<string | null>(null);
  const [coaching, setCoaching] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [appealing, setAppealing] = useState(false);

  const outcome = attempt.current?.outcome ?? attempt.outcome;
  const word = OUTCOME_WORD[outcome];
  const score = attempt.current?.score ?? attempt.scoring?.score;
  const good = outcome === "passed";
  const item = attempt.item;
  const chosen = attempt.response.kind === "choice" ? attempt.response.selected : [];
  const right = attempt.reveal?.correct ?? [];

  const askCoach = async () => {
    if (ask.trim().length < 3) return;
    setCoaching(true);
    const r = await run<{ reply: string }>("coach", { attemptId: attempt.id, ask: ask.trim() }, { label: "coach" });
    setCoaching(false);
    if (r) setCoachReply(r.reply);
  };
  const sendAppeal = async () => {
    setAppealing(true);
    const r = await run<{ outcome: string; message: string }>("appeal", { attemptId: attempt.id, reason: reason.trim() }, { label: "appeal" });
    setAppealing(false);
    if (r) {
      setAppealOpen(false);
      toast({ title: r.outcome === "pending" ? "Review queued" : r.outcome === "upheld" ? "Result re-checked" : "Result updated", description: r.message });
    }
  };

  return (
    <div className="space-y-3" data-test="result-panel">
      <div className={cn("rounded-2xl border p-4 flex items-start gap-3", good ? "border-success/40 bg-success/10" : outcome === "failed" ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/40")} role="status">
        {good ? <CheckCircle2 className="h-6 w-6 text-success shrink-0" /> : outcome === "failed" ? <XCircle className="h-6 w-6 text-destructive shrink-0" /> : <AlertTriangle className="h-6 w-6 text-muted-foreground shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{attempt.feedback?.headline ?? word.word}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Chip tone={word.tone}>{word.word}</Chip>
            {typeof score === "number" && <Chip tone="muted">Score {score}%</Chip>}
            {!!extras?.xpGained && <Chip tone="warn"><Zap className="h-3 w-3" /> +{extras.xpGained} XP</Chip>}
            {attempt.scoring?.confidence && attempt.scoring.method !== "deterministic" && <Chip tone="muted">Grading confidence: {attempt.scoring.confidence}</Chip>}
            {attempt.current && <Chip tone="info">Corrected after review</Chip>}
          </div>
          {/* More than one source (an answer + finishing the baseline, a badge…): say where the XP came from. */}
          {(extras?.xpLines?.length ?? 0) > 1 && <p className="text-[11px] text-muted-foreground mt-1.5" data-test="xp-lines">{extras!.xpLines!.map((x) => x.reason).join(" · ")}</p>}
        </div>
      </div>

      {!!extras?.badges?.length && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 p-3 flex flex-wrap items-center gap-2" data-test="new-badges">
          <Award className="h-5 w-5 text-amber-500" />
          <span className="text-sm font-medium">New badge{extras.badges.length > 1 ? "s" : ""}:</span>
          {extras.badges.map((b) => <Chip key={b} tone="warn">{BADGE_BY_ID.get(b)?.title ?? b}</Chip>)}
        </div>
      )}
      {extras?.rankUp && (
        <div className="rounded-2xl bg-gradient-to-r from-fuchsia-500 via-primary to-sky-500 p-4 text-white text-center shadow-lg" data-test="rank-up">
          <Sparkles className="h-6 w-6 mx-auto" />
          <p className="font-display text-xl font-bold mt-1">Promoted to {rankLabel(policy, extras.rankUp)}!</p>
          <p className="text-sm opacity-90">Every gate passed — the evidence is on your Career page.</p>
        </div>
      )}

      {(item.type === "mcq" || item.type === "multi") && item.options && (
        <ul className="space-y-1.5" aria-label="The options, marked">
          {item.options.map((o, i) => {
            const isRight = right.includes(i);
            const isMine = chosen.includes(i);
            return (
              <li key={i} className={cn("rounded-xl border px-3 py-2 text-sm flex items-start gap-2", isRight ? "border-success/50 bg-success/10" : isMine ? "border-destructive/40 bg-destructive/5" : "border-border")}>
                {isRight ? <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" /> : isMine ? <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" /> : <span className="h-4 w-4 shrink-0" />}
                <span className="flex-1">{o}</span>
                {isMine && <span className="text-[11px] text-muted-foreground">your answer</span>}
              </li>
            );
          })}
        </ul>
      )}
      {item.type === "numeric" && attempt.reveal?.value !== undefined && (
        <p className="text-sm">Correct answer: <strong>{withUnit(attempt.reveal.value, item.unit)}</strong>{attempt.response.kind === "number" && <span className="text-muted-foreground"> · yours: {withUnit(attempt.response.value, item.unit)}</span>}</p>
      )}
      {item.type === "order" && attempt.reveal?.order && (
        <div className="text-sm"><p className="font-medium mb-1">The right order</p><ol className="list-decimal pl-5 space-y-0.5">{attempt.reveal.order.map((i) => <li key={i}>{item.options?.[i]}</li>)}</ol></div>
      )}

      {attempt.feedback && (attempt.feedback.steps.length > 0 || attempt.feedback.explanation) && (
        <div className="rounded-2xl border border-border p-4 space-y-2">
          {attempt.feedback.gap !== "none" && outcome !== "passed" && GAP_WORDS[attempt.feedback.gap] && (
            <p className="text-xs text-muted-foreground">What tripped it up: <span className="text-foreground font-medium">{GAP_WORDS[attempt.feedback.gap]}</span></p>
          )}
          {attempt.feedback.steps.length > 0 && (
            <div><p className="text-sm font-medium mb-1">{outcome === "passed" ? "To go further" : "How to get it next time"}</p>
              <ul className="list-disc pl-5 text-sm space-y-1">{attempt.feedback.steps.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          )}
          {attempt.feedback.explanation && <div><p className="text-sm font-medium mb-1">The worked answer</p><ScenarioText text={attempt.feedback.explanation} /></div>}
          {attempt.feedback.next && <p className={cn("text-sm", ACCENT_TEXT)}>{attempt.feedback.next}</p>}
        </div>
      )}

      {attempt.scoring?.criteria && attempt.item.type === "open" && (
        <div className="rounded-2xl border border-border p-4">
          <p className="text-sm font-medium mb-2">How it was graded</p>
          <ul className="space-y-2">
            {attempt.scoring.criteria.map((c) => (
              <li key={c.id} className="text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{c.label}</span><span className="tabular-nums text-muted-foreground">{c.score}/4 · {c.weight}%</span></div>
                <div className="h-1.5 rounded-full bg-muted mt-1"><div className={cn("h-full rounded-full", c.score >= 3 ? "bg-success" : c.score >= 2 ? "bg-warning" : "bg-destructive")} style={{ width: `${(c.score / 4) * 100}%` }} /></div>
                {c.evidence && <p className="text-xs text-muted-foreground mt-1 italic">“{c.evidence}”</p>}
              </li>
            ))}
          </ul>
          {attempt.reveal?.exemplar && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowExemplar((v) => !v)} className="text-sm font-medium flex items-center gap-1 min-h-[40px]" aria-expanded={showExemplar}>
                See a strong answer {showExemplar ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showExemplar && <p className="text-sm text-muted-foreground rounded-xl bg-muted/50 p-3">{attempt.reveal.exemplar}</p>}
            </div>
          )}
        </div>
      )}

      {outcome !== "pending_validation" && (
        <div className="rounded-2xl border border-border p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5"><MessageCircleQuestion className="h-4 w-4 text-primary" /> Ask the coach</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Textarea value={ask} onChange={(e) => setAsk(e.target.value.slice(0, 500))} rows={2} placeholder="e.g. Why is my answer not right? How do I spot this faster?" className="text-sm" data-test="coach-input" />
            <Button className={cn("sm:self-end", TAP)} disabled={coaching || ask.trim().length < 3} onClick={askCoach} data-test="coach-ask">{coaching && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Ask</Button>
          </div>
          {coachReply && <p className="text-sm rounded-xl bg-primary/5 border border-primary/20 p-3" data-test="coach-reply">{coachReply}</p>}
          {attempt.appeal?.outcome === "pending" ? (
            <p className="text-xs text-muted-foreground flex items-start gap-1 min-h-[32px]" data-test="appeal-pending">
              <Scale className="h-3.5 w-3.5 shrink-0 mt-0.5" /> Review asked on {new Date(attempt.appeal.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — waiting for the graders. It is re-checked automatically, usually within a day, and you will be told.
            </p>
          ) : attempt.appeal ? (
            <p className="text-xs text-muted-foreground flex items-start gap-1 min-h-[32px]" data-test="appeal-done">
              <Scale className="h-3.5 w-3.5 shrink-0 mt-0.5" /> Reviewed on {new Date(attempt.appeal.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: {attempt.appeal.outcome === "upheld" ? "the result stands" : attempt.appeal.outcome === "changed" ? "the score was corrected" : "the question was withdrawn and no longer counts"} — {attempt.appeal.detail}
            </p>
          ) : ["passed", "failed"].includes(attempt.outcome) && !attempt.current && (
            <button type="button" className="text-xs text-muted-foreground underline flex items-center gap-1 min-h-[32px]" onClick={() => setAppealOpen(true)} data-test="appeal-open"><Scale className="h-3.5 w-3.5" /> Think this result is wrong? Ask for a review</button>
          )}
        </div>
      )}

      <Dialog open={appealOpen} onOpenChange={setAppealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask for a review</DialogTitle>
            <DialogDescription>An independent re-check runs first (fresh graders for written answers, a separate solver for choices). The original result is always kept in your history. One review per answer.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} rows={4} placeholder="Say in a sentence why you think it is wrong." data-test="appeal-reason" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAppealOpen(false)}>Cancel</Button>
            <Button disabled={appealing || reason.trim().length < 10} onClick={sendAppeal} data-test="appeal-send">{appealing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Send for review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
