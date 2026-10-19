/**
 * The Assessment Arena (the brief §12): one item at a time, the timer where an assessment needs one, progressive hints,
 * the answer — then straight to the next one; the summary at the end reveals every answer with its worked solution, the
 * coach and the review (2026-10-19). Everything is saved on the server as it happens;
 * leaving and coming back resumes exactly where the person was (NFR-008).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Award, CheckCircle2, ChevronDown, ChevronUp, Clock, HelpCircle, Lightbulb, Loader2, Sparkles, Timer, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dimensionName } from "@/devos/core/dimensions";
import type { AttemptResponse, DevAttempt, DevSession, DevTask, PublicItem } from "@/devos/core/types";
import { BADGE_BY_ID } from "@/devos/core/badges";
import { rankLabel } from "@/devos/core/policy";
import { useDevAttempt, useDevSession, useDevTask } from "@/hooks/useDevOs";
import { useDevOs } from "./context";
import { Chip, DifficultyDots, Empty, Loading, OUTCOME_WORD, PurposeChip, ScenarioText, Section, TAP, withUnit } from "./kit";
import { clearDraft, ItemForm } from "./play/ItemForm";
import { ResultPanel } from "./play/ResultPanel";
import { requestGrade, useAutoGrade } from "./useAutoGrade";
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
  // ── No result between questions (2026-10-19, owner) ── "Do not reveal the answer immediately — reveal the answers in
  // the end after submitting": a result after every question cost time and confidence before the next one. Each answer is
  // saved (and scored) on the server as before, the screen goes straight to the next question, and the summary at the end
  // reveals every answer with its worked solution, the coach and the review.
  const [phase, setPhase] = useState<"loading" | "answering" | "done" | "error">("loading");
  const [response, setResponse] = useState<AttemptResponse | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  // What the answers earned on the way (shown together at the end): XP, badges, a promotion, fresh tries after a miss.
  const [earned, setEarned] = useState<{ xp: number; badges: string[]; rankUp: number | null; remediation: string[] }>({ xp: 0, badges: [], rankUp: null, remediation: [] });
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState("");
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
    setEarned({ xp: 0, badges: [], rankUp: null, remediation: [] });
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

  const next = async () => {
    const r = await run<PlayState>("next", { taskId }, { label: "next" });
    if (!r) return;
    setPlay(r);
    setResponse(null);
    setHints(r.hints ?? []);
    setPhase(r.item ? "answering" : "done");
  };

  // Submit = save the answer, then straight to the next question. A written answer is graded in its own request
  // (`defer`, then `grade`), so the next question never waits for the graders.
  const submit = async () => {
    if (!play || !item || !response || sending) return;
    setSending(true);
    try {
      const r = await run<AnswerResult>("answer", { taskId, slotIndex: play.slotIndex, response, defer: true }, { label: "answer" });
      if (!r) return; // not recorded (offline, an error) — the draft stays for another try
      clearDraft(user.uid, item.qid);
      if (r.today) setTodayReason(r.today.reason ?? null); // the baseline just ended: Home reads today's plan as made now
      if (r.attempt.outcome === "pending_validation") requestGrade(r.attempt.id);
      setEarned((e) => ({
        xp: e.xp + (r.xpGained ?? 0),
        badges: [...new Set([...e.badges, ...(r.badges ?? [])])],
        rankUp: r.rankUp ?? e.rankUp,
        remediation: r.remediationTaskId && !e.remediation.includes(r.remediationTaskId) ? [...e.remediation, r.remediationTaskId] : e.remediation,
      }));
      await next();
    } finally {
      setSending(false);
    }
  };

  // Leave = back to the screen the task was opened from (Career for a rank assessment, Arena for a league…); Home when
  // it was opened directly (a notification, a fresh tab). Everything is saved, so leaving loses nothing.
  const leave = () => (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate("/dev-os"));

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
      <Button variant="ghost" size="sm" className="min-h-[40px] -ml-2" onClick={leave} data-test="play-leave"><ArrowLeft className="h-4 w-4 mr-1" /> Leave (saved)</Button>
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
        // While answering, an answered question is only "done" (no right / wrong colour — that is for the end).
        <div key={i} className={cn("h-1.5 flex-1 rounded-full", s.state === "answered" ? (phase !== "done" ? "bg-primary/45" : s.pending ? "bg-info" : s.passed ? "bg-success" : "bg-destructive/70") : s.state === "served" ? "bg-primary" : s.state === "skipped_system" || s.state === "expired" ? "bg-muted-foreground/30" : "bg-muted")} />
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
            <div className="rounded-xl bg-muted/40 p-3"><p className="text-2xl font-bold tabular-nums">{res ? `${res.score}%` : "—"}</p><p className="text-[11px] text-muted-foreground">{grading ? "score so far" : "score"}</p></div>
            <div className="rounded-xl bg-muted/40 p-3"><p className="text-2xl font-bold tabular-nums">{res ? `${res.correct}/${res.answered + expired}` : `${answered}/${total}`}</p><p className="text-[11px] text-muted-foreground">passed</p></div>
            <div className="rounded-xl bg-muted/40 p-3"><p className="text-2xl font-bold tabular-nums">{res?.pending ?? 0}</p><p className="text-[11px] text-muted-foreground">still grading</p></div>
          </div>
          {grading && <p className="text-sm text-muted-foreground mt-3 flex items-center gap-2" data-test="grading-note"><Loader2 className="h-4 w-4 animate-spin shrink-0" /> Your written answers are being checked by two independent AI graders against the rubric — usually within a minute or two. This page updates by itself.</p>}
          {(earned.xp > 0 || earned.badges.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3" data-test="earned">
              {earned.xp > 0 && <Chip tone="warn"><Zap className="h-3 w-3" /> +{earned.xp} XP</Chip>}
              {earned.badges.map((b) => <Chip key={b} tone="warn"><Award className="h-3 w-3" /> {BADGE_BY_ID.get(b)?.title ?? b}</Chip>)}
            </div>
          )}
          {earned.rankUp && (
            <div className="mt-3 rounded-2xl bg-gradient-to-r from-fuchsia-500 via-primary to-sky-500 p-4 text-white text-center shadow-lg" data-test="rank-up">
              <Sparkles className="h-6 w-6 mx-auto" />
              <p className="font-display text-xl font-bold mt-1">Promoted to {rankLabel(policy, earned.rankUp)}!</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <Button className={TAP} onClick={() => navigate("/dev-os")} data-test="play-home">Back to Home</Button>
            {earned.remediation[0] && <Button variant="outline" className={TAP} onClick={() => navigate(`/dev-os/play/${earned.remediation[0]}`)} data-test="fresh-try"><Zap className="h-4 w-4 mr-1" /> Fresh try now</Button>}
          </div>
        </Section>
        <AnswerReview uid={user.uid} slots={session?.slots ?? []} />
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
              <ItemForm uid={user.uid} item={item} disabled={sending} onChange={setResponse} />
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
                <Button className={cn(TAP, "sm:min-w-[10rem]")} disabled={!response || sending} onClick={submit} data-test="submit-answer">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}{answered + 1 >= total ? "Submit and see results" : "Submit and next"}
                </Button>
              </div>
              {remaining === 0 && (
                // The timer ran out: say so, and let the person move on (the server closes it as not answered in time).
                <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3 flex flex-col sm:flex-row sm:items-center gap-2" data-test="time-up" role="status">
                  <p className="text-sm flex-1">Time is up. An answer sent in the next {graceMin} minute{graceMin > 1 ? "s" : ""} is still scored; a question left unanswered counts as 0.</p>
                  <Button variant="outline" className={TAP} disabled={busy === "next"} onClick={next} data-test="time-up-next">{busy === "next" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Next question <ArrowRight className="h-4 w-4 ml-1" /></Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-3">Practice scenario — names and numbers are made up. Your answers are revealed together at the end.</p>
            </>
          )}
        </Section>
      )}
    </div>
  );
}

/**
 * The reveal at the end: every question of the task, in order, with the person's answer and its result; one tap opens
 * the worked solution, the coach and the review (the same panel History uses). Written answers still being graded say
 * so and are graded while the page is open (useAutoGrade); the list updates live.
 */
function AnswerReview({ uid, slots }: { uid: string; slots: DevSession["slots"] }) {
  const [open, setOpen] = useState<number | null>(null);
  const rows = slots.map((s, i) => ({ s, i })).filter(({ s }) => s.attemptId || s.state === "expired" || s.state === "skipped_system");
  if (!rows.length) return null;
  return (
    <Section title="Your answers" hint="Tap a question to see the worked answer, ask the coach or ask for a review.">
      <ol className="space-y-2" data-test="answer-review">
        {rows.map(({ s, i }) => (
          <ReviewRow key={i} uid={uid} n={i + 1} slot={s} open={open === i} onToggle={() => setOpen((o) => (o === i ? null : i))} />
        ))}
      </ol>
    </Section>
  );
}

function answerText(a: DevAttempt): string {
  const r = a.response;
  if (r.kind === "text") return r.text;
  if (r.kind === "choice") return r.selected.map((x) => a.item.options?.[x]).join("; ");
  if (r.kind === "number") return withUnit(r.value, a.item.unit);
  return r.order.map((x, k) => `${k + 1}. ${a.item.options?.[x]}`).join(" → ");
}

function ReviewRow({ uid, n, slot, open, onToggle }: { uid: string; n: number; slot: DevSession["slots"][number]; open: boolean; onToggle: () => void }) {
  const { data: a } = useDevAttempt(uid, slot.attemptId);
  useAutoGrade([a]);
  const outcome = a ? (a.current?.outcome ?? a.outcome) : slot.state === "expired" ? "expired" : slot.state === "skipped_system" ? "system_error" : null;
  const score = a?.current?.score ?? a?.scoring?.score;
  const pending = outcome === "pending_validation";
  const word = outcome ? OUTCOME_WORD[outcome] : null;
  const Icon = outcome === "passed" ? CheckCircle2 : outcome === "failed" ? XCircle : pending ? Loader2 : Clock;
  return (
    <li className={cn("rounded-xl border", outcome === "passed" ? "border-success/40" : outcome === "failed" ? "border-destructive/30" : "border-border")} data-test={`review-${n}`}>
      <button type="button" onClick={onToggle} disabled={!a} aria-expanded={open} className="w-full flex items-start gap-3 p-3 text-left min-h-[44px]">
        <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", outcome === "passed" ? "text-success" : outcome === "failed" ? "text-destructive" : pending ? "text-info animate-spin" : "text-muted-foreground")} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Question {n} · {dimensionName(slot.dim)}</p>
          <p className="text-sm font-medium">{a?.item.question ?? "Not answered in time"}</p>
          {a && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">Your answer: {answerText(a)}</p>}
          {pending && <p className="text-xs text-blue-700 dark:text-info mt-0.5">The AI graders are checking this written answer — the result appears here by itself.</p>}
        </div>
        <div className="text-right shrink-0">
          {word && <Chip tone={word.tone}>{word.word}</Chip>}
          {typeof score === "number" && <p className="text-xs text-muted-foreground mt-1 tabular-nums">{score}%</p>}
        </div>
        {a && (open ? <ChevronUp className="h-4 w-4 shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 shrink-0 mt-1" />)}
      </button>
      {open && a && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          <ScenarioText text={a.item.scenario} />
          {pending ? <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Still being graded.</p> : <ResultPanel attempt={a} />}
        </div>
      )}
    </li>
  );
}
