/**
 * One answer's full record (FR-048, FR-015): the item as it was shown, the answer, the result and feedback, the coach
 * and review, and the facts an audit needs (rubric and policy versions, times, hints, any correction).
 */
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { dimensionName } from "@/devos/core/dimensions";
import { useDevAttempt } from "@/hooks/useDevOs";
import { useDevOs } from "./context";
import { Chip, DifficultyDots, Empty, Loading, PurposeChip, ScenarioText, Section, fmtDateTime } from "./kit";
import { ResultPanel } from "./play/ResultPanel";

export default function AttemptView() {
  const { attemptId } = useParams();
  const { user } = useDevOs();
  const { data: a, loading } = useDevAttempt(user.uid, attemptId);
  if (loading) return <Loading />;
  if (!a) return <Empty>This answer was not found. <Link className="underline" to="/dev-os/history">Back to History</Link></Empty>;
  const yours = a.response.kind === "text" ? a.response.text
    : a.response.kind === "choice" ? a.response.selected.map((i) => a.item.options?.[i]).join("; ")
    : a.response.kind === "number" ? `${a.response.value}${a.item.unit ? ` ${a.item.unit}` : ""}`
    : a.response.order.map((i, n) => `${n + 1}. ${a.item.options?.[i]}`).join("\n");
  return (
    <div className="max-w-3xl mx-auto space-y-4" data-test="attempt-view">
      <Link to="/dev-os/history" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[40px]"><ArrowLeft className="h-4 w-4" /> History</Link>
      <Section title={<span className="flex flex-wrap items-center gap-2">{dimensionName(a.dim)} <DifficultyDots level={a.difficulty} /></span>} right={<PurposeChip purpose={a.purpose} />}>
        <ScenarioText text={a.item.scenario} />
        <p className="font-semibold mt-3">{a.item.question}</p>
        <div className="mt-3 rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground mb-1">Your answer</p><p className="text-sm whitespace-pre-wrap">{yours}</p></div>
      </Section>
      <ResultPanel attempt={a} />
      <Section title="Record" hint="What an audit of this answer can rely on.">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Shown</dt><dd>{fmtDateTime(a.servedAt)}</dd>
          <dt className="text-muted-foreground">Answered</dt><dd>{fmtDateTime(a.submittedAt)} ({Math.round(a.ms / 1000)} s)</dd>
          <dt className="text-muted-foreground">Hints used</dt><dd>{a.hintsUsed}</dd>
          <dt className="text-muted-foreground">Graded by</dt><dd>{a.scoring?.method ?? "—"}{a.scoring?.judges ? ` (${a.scoring.judges.length} grader${a.scoring.judges.length > 1 ? "s" : ""})` : ""}</dd>
          <dt className="text-muted-foreground">Question</dt><dd className="truncate">{a.source === "ai" ? "AI-written, validated" : "computed template"} · v{a.qversion}</dd>
          {a.rubricVersion && <><dt className="text-muted-foreground">Rubric</dt><dd>{a.rubricVersion}</dd></>}
          <dt className="text-muted-foreground">Policy</dt><dd>{a.policyVersion}</dd>
          {a.reasonCode && <><dt className="text-muted-foreground">Reason</dt><dd>{a.reasonCode.replace(/_/g, " ")}</dd></>}
        </dl>
        {a.current && <p className="text-xs mt-2"><Chip tone="info">Corrected</Chip> now {a.current.score}% ({a.current.outcome.replace("_", " ")}) on {fmtDateTime(a.current.at)} — the original result above is kept.</p>}
      </Section>
    </div>
  );
}
