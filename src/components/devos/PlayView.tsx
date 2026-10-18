/**
 * The Assessment Arena (the brief §12): one item at a time, the timer where an assessment needs one, progressive hints,
 * the answer, then the coach — and the session summary at the end. Everything is saved on the server as it happens;
 * leaving and coming back resumes exactly where the person was (NFR-008).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, HelpCircle, Lightbulb, Loader2, Timer, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dimensionName } from "@/devos/core/dimensions";
import type { AttemptResponse, DevAttempt, DevSession, DevTask, PublicItem } from "@/devos/core/types";
import { useDevAttempt, useDevSession, useDevTask } from "@/hooks/useDevOs";
import { useDevOs } from "./context";
import { Chip, DifficultyDots, Empty, Loading, PurposeChip, ScenarioText, Section, TAP } from "./kit";
import { clearDraft, ItemForm } from "./play/ItemForm";
import { ResultPanel, type ResultExtras } from "./play/ResultPanel";
import { PracticalView } from "./play/PracticalView";

interface PlayState { task: DevTask; session: DevSession | null; item: PublicItem | null; slotIndex: number; reason?: string; hints?: string[] }
interface AnswerResult { attempt: DevAttempt; session: DevSession; xpGained: number; xpLines?: { amount: number; reason: string }[]; badges: string[]; rankUp: number | null; taskState: string | null; remediationTaskId: string | null; today?: { reason?: string } }

const TIMED = new Set(["rank", "league"]);

function useCountdown(endsAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : null;
}

export default function PlayView() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user, run, busy, policy, setTodayReason } = useDevOs();
  const { data: task, loading: taskLoading } = useDevTask(user.uid, taskId);
  const { data: session } = useDevSession(user.uid, taskId);
  const [play, setPlay] = useState<PlayState | null>(null);
  const [phase, setPhase] = useState<"loading" | "answering" | "result" | "done" | "error">("loading");
  const [response, setResponse] = useState<AttemptResponse | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [last, setLast] = useState<{ attemptId: string; extras: ResultExtras; fallback: DevAttempt; remediation: string | null } | null>(null);
  const [errorText, setErrorText] = useState("");
  const { data: liveAttempt } = useDevAttempt(user.uid, last?.attemptId);
  const attempt = liveAttempt ?? last?.fallback ?? null;
  const questionBased = !!task?.blueprint?.length;

  const begin = useCallback(async () => {
    if (!taskId) return;
    const r = await run<PlayState>("start", { taskId }, { label: "start" });
    if (!r) { setPhase("error"); setErrorText("This task could not be opened."); return; }
    setPlay(r);
    setHints(r.hints ?? []); // hints already taken on this item before leaving
    setPhase(r.item ? "answering" : "done");
  }, [taskId, run]);

  // A new task in the same mounted page ("Fresh try now") starts from a clean slate.
  useEffect(() => {
    setPlay(null);
    setPhase("loading");
    setLast(null);
    setResponse(null);
    setHints([]);
  }, [taskId]);

  useEffect(() => {
    if (task && task.id === taskId && questionBased && phase === "loading" && !play) void begin();
  }, [task, taskId, questionBased, phase, play, begin]);

  // A new question, its result or the summary opens at its top. The page scrolls inside AppLayout's <main>, not the
  // window — window.scrollTo did nothing and the next question opened scrolled down (found in the browser test) —
  // so the view's own top is scrolled into view, whatever container scrolls.
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [play?.slotIndex, play?.item?.qid, phase]);

  const item = play?.item ?? null;
  const slot = item && session ? session.slots[play!.slotIndex] : null;
  const timed = !!slot && TIMED.has(slot.purpose);
  // The question's own limit or the assessment's total time, whichever ends first — the server closes both.
  const remaining = useCountdown(timed && phase === "answering" && slot?.servedAt && item ? Math.min(slot.servedAt + item.timeLimitSec * 1000, session?.dueAt ?? Infinity) : null);
  const totalLeft = useCountdown(timed && session ? session.dueAt : null);
  const graceMin = Math.max(1, Math.round(policy.scoring.timeGraceSec / 60));

  const submit = async () => {
    if (!play || !item || !response) return;
    const r = await run<AnswerResult>("answer", { taskId, slotIndex: play.slotIndex, response }, { label: "answer" });
    if (!r) return; // not recorded (offline, an error) — the draft stays for another try
    clearDraft(user.uid, item.qid);
    if (r.today) setTodayReason(r.today.reason ?? null); // the baseline just ended: Home reads today's plan as made now
    setLast({ attemptId: r.attempt.id, fallback: r.attempt, extras: { xpGained: r.xpGained, xpLines: r.xpLines, badges: r.badges, rankUp: r.rankUp }, remediation: r.remediationTaskId });
    setPhase("result");
  };

  const next = async () => {
    const r = await run<PlayState>("next", { taskId }, { label: "next" });
    if (!r) return;
    setPlay(r);
    setLast(null);
    setResponse(null);
    setHints(r.hints ?? []);
    setPhase(r.item ? "answering" : "done");
  };

  const askHint = async () => {
    if (!play) return;
    const r = await run<{ hint: string; used: number; left: number }>("hint", { taskId, slotIndex: play.slotIndex }, { label: "hint" });
    if (r?.hint) setHints((h) => (h.includes(r.hint) ? h : [...h, r.hint]));
  };

  const answered = useMemo(() => session?.slots.filter((s) => s.state === "answered" || s.state === "expired" || s.state === "skipped_system").length ?? 0, [session]);
  const total = session?.slots.length ?? task?.blueprint?.length ?? 0;

  if (taskLoading) return <Loading what="Opening the task" />;
  if (!task) return <Empty>This task does not exist or is not yours. <button className="underline" onClick={() => navigate("/dev-os")}>Back to Home</button></Empty>;
  if (!questionBased) return <PracticalView task={task} />;
  if (phase === "error") return <Empty>{errorText} <button className="underline" onClick={() => navigate("/dev-os")}>Back to Home</button></Empty>;

  const header = (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="sm" className="min-h-[40px] -ml-2" onClick={() => navigate("/dev-os")} data-test="play-leave"><ArrowLeft className="h-4 w-4 mr-1" /> Leave (saved)</Button>
      <div className="flex items-center gap-2">
        {totalLeft !== null && phase !== "done" && <span className="text-xs text-muted-foreground tabular-nums" data-test="total-left" title="Time left for the whole assessment">{Math.floor(totalLeft / 60)}:{String(totalLeft % 60).padStart(2, "0")} in all</span>}
        {remaining !== null && <Chip tone={remaining < 30 ? "bad" : "info"}><Timer className="h-3 w-3" /> {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</Chip>}
        <span className="text-xs text-muted-foreground tabular-nums">{Math.min(answered + (phase === "answering" ? 1 : 0), total)} / {total}</span>
      </div>
    </div>
  );
  const progress = (
    <div className="flex gap-1" aria-hidden>
      {(session?.slots ?? []).map((s, i) => (
        <div key={i} className={cn("h-1.5 flex-1 rounded-full", s.state === "answered" ? (s.pending ? "bg-info" : s.passed ? "bg-success" : "bg-destructive/70") : s.state === "served" ? "bg-primary" : s.state === "skipped_system" || s.state === "expired" ? "bg-muted-foreground/30" : "bg-muted")} />
      ))}
    </div>
  );

  if (phase === "loading" || (!play && phase !== "done")) return <div className="max-w-3xl mx-auto space-y-3">{header}<Loading what="Choosing a fresh challenge for you" /></div>;

  if (phase === "done") {
    const res = session?.result;
    // "Grading" only while written answers really wait for a grade — a finished baseline or league round is
    // "completed" for good, with nothing pending (the browser test found a spinner on both).
    const grading = (res?.pending ?? 0) > 0;
    const expired = res?.expired ?? 0;
    // Ended by its clock: a task whose deadline passed is closed ("expired"); a timed assessment is judged as usual.
    const lapsed = task.state === "expired";
    const timeUp = lapsed || play?.reason === "expired";
    const title = grading ? "All answers in — grading the written ones"
      : lapsed ? "Time is up — this task's deadline passed"
      : task.kind === "baseline" ? "Baseline complete — your plan is ready"
      : task.kind === "league" ? (timeUp ? "Time is up — your league entry is in; results on Saturday evening" : "Done — the league results come on Saturday evening")
      : task.kind === "rank" && timeUp ? "Time is up — the assessment is over"
      : "Done!";
    return (
      <div ref={topRef} className="max-w-3xl mx-auto space-y-4 scroll-mt-4" data-test="play-done">
        {header}
        {progress}
        <Section title={title} hint={task.title}>
          {play?.reason === "no_fresh_item" && <p className="text-sm text-muted-foreground mb-2">One question could not be served fresh right now — it was skipped and does not count against you.</p>}
          {expired > 0 && (
            <p className="text-sm text-muted-foreground mb-2" data-test="expired-note">
              {expired} question{expired > 1 ? "s were" : " was"} not answered in time and count{expired > 1 ? "" : "s"} as 0.
              {lapsed && " What you answered in time still counts toward your skills; the task itself is closed, with no task reward."}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/40 p-3"><p className="text-2xl font-bold tabular-nums">{res ? `${res.score}%` : "—"}</p><p className="text-[11px] text-muted-foreground">score</p></div>
            <div className="rounded-xl bg-muted/40 p-3"><p className="text-2xl font-bold tabular-nums">{res ? `${res.correct}/${res.answered + expired}` : `${answered}/${total}`}</p><p className="text-[11px] text-muted-foreground">passed</p></div>
            <div className="rounded-xl bg-muted/40 p-3"><p className="text-2xl font-bold tabular-nums">{res?.pending ?? 0}</p><p className="text-[11px] text-muted-foreground">being graded</p></div>
          </div>
          {grading && <p className="text-sm text-muted-foreground mt-3 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Written answers are graded by two independent graders; the result will appear in History.</p>}
          <div className="flex flex-wrap gap-2 mt-4">
            <Button className={TAP} onClick={() => navigate("/dev-os")} data-test="play-home">Back to Home</Button>
            <Button variant="outline" className={TAP} onClick={() => navigate("/dev-os/history")}>See my answers</Button>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div ref={topRef} className="max-w-3xl mx-auto space-y-3 scroll-mt-4" data-test="play-view">
      {header}
      {progress}
      {item && (
        <Section
          title={<span className="flex flex-wrap items-center gap-2">{dimensionName(item.dim)} <DifficultyDots level={item.difficulty} /></span>}
          hint={slot?.reason}
          right={slot ? <PurposeChip purpose={slot.purpose} /> : null}>
          {item.teaches && <p className="text-xs rounded-lg bg-primary/5 border border-primary/20 px-2 py-1 mb-2 inline-block">Something new to learn first — read it, then use it.</p>}
          <ScenarioText text={item.scenario} />
          <p className="font-semibold mt-3 mb-3">{item.question}</p>
          {phase === "answering" && (
            <>
              <ItemForm uid={user.uid} item={item} disabled={busy === "answer"} onChange={setResponse} />
              {hints.length > 0 && (
                <ul className="mt-3 space-y-1.5" data-test="hints">
                  {hints.map((h, i) => <li key={i} className="text-sm rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300/50 px-3 py-2 flex gap-2"><Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />{h}</li>)}
                </ul>
              )}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 mt-4">
                {item.hintCount > 0 ? (
                  <Button variant="ghost" className={TAP} disabled={hints.length >= item.hintCount || busy === "hint"} onClick={askHint} data-test="hint-button">
                    <HelpCircle className="h-4 w-4 mr-1" /> {hints.length >= item.hintCount ? "No more hints" : `Hint (${item.hintCount - hints.length} left · costs a little score)`}
                  </Button>
                ) : <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> No hints in this one</span>}
                <Button className={cn(TAP, "sm:min-w-[10rem]")} disabled={!response || busy === "answer"} onClick={submit} data-test="submit-answer">
                  {busy === "answer" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}Submit answer
                </Button>
              </div>
              {remaining === 0 && (
                // The timer ran out: say so, and let the person move on (the server closes it as not answered in time).
                <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3 flex flex-col sm:flex-row sm:items-center gap-2" data-test="time-up" role="status">
                  <p className="text-sm flex-1">Time is up. An answer sent in the next {graceMin} minute{graceMin > 1 ? "s" : ""} is still scored; a question left unanswered counts as 0.</p>
                  <Button variant="outline" className={TAP} disabled={busy === "next"} onClick={next} data-test="time-up-next">{busy === "next" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Next question <ArrowRight className="h-4 w-4 ml-1" /></Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-3">Practice scenario — names and numbers are made up.</p>
            </>
          )}
        </Section>
      )}

      {phase === "result" && attempt && (
        <>
          {attempt.outcome === "pending_validation" && !attempt.current ? (
            <Section title="Grading your answer" hint="Two independent graders mark it against the rubric — usually under a minute.">
              <p className="text-sm flex items-center gap-2" data-test="grading"><Loader2 className="h-4 w-4 animate-spin" /> Your answer is saved. You can continue — the result will appear in History.</p>
            </Section>
          ) : <ResultPanel attempt={attempt} extras={last?.extras} />}
          <div className="flex flex-wrap justify-end gap-2">
            {last?.remediation && <Button variant="outline" className={TAP} onClick={() => navigate(`/dev-os/play/${last.remediation}`)}><Zap className="h-4 w-4 mr-1" /> Fresh try now</Button>}
            <Button className={TAP} disabled={busy === "next"} onClick={next} data-test="next-item">{busy === "next" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </>
      )}
    </div>
  );
}
