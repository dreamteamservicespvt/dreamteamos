/**
 * ── Written answers are graded while the person is here (2026-10-19) ──
 * A written answer is saved at once and graded in a request of its own (`grade`, engine/learner.gradeMine). Any screen
 * that shows one still "Grading…" (a task's summary, History, the answer itself, Home while the baseline waits) asks for
 * it here — before, an answer whose grading did not finish inside its own request waited for the next cron, up to hours,
 * and held the baseline (and so the plan, the quests and Career) behind it.
 *
 * Asked straight away, then every 20 s while something is still waiting; the same answer at most once a minute from
 * this browser (the server holds its own one-minute claim too), and never two requests at once. Quiet: a failure only
 * means the next try (or the tick) grades it.
 */
import { useEffect, useRef } from "react";
import { callDevOs } from "@/services/devosApi";

const lastAsked = new Map<string, number>();
let inFlight = false;
const AGAIN_MS = 65_000;

/** Ask for one answer (or, with `task`, one submitted practical) now — right after it is sent — counted in the same
 *  once-a-minute rule as the screens. */
export function requestGrade(id: string, kind: "attempt" | "task" = "attempt"): void {
  const k = `${kind}:${id}`;
  if ((lastAsked.get(k) ?? 0) > Date.now() - AGAIN_MS) return;
  lastAsked.set(k, Date.now());
  void callDevOs("grade", kind === "task" ? { taskId: id } : { attemptId: id }).catch(() => undefined);
}

/** A submitted practical still waiting for its grade is graded while its page is open (every 20 s, once a minute). */
export function useAutoGradeTask(task: { id: string; state: string; scoring?: unknown; submission?: unknown } | null | undefined) {
  const waiting = !!task && task.state === "completed" && !task.scoring && !!task.submission;
  const id = task?.id;
  useEffect(() => {
    if (!waiting || !id) return;
    requestGrade(id, "task");
    const t = setInterval(() => requestGrade(id, "task"), 20_000);
    return () => clearInterval(t);
  }, [waiting, id]);
}

export interface Gradable { id: string; outcome: string; current?: unknown; response?: { kind: string } }

export function useAutoGrade(attempts: (Gradable | null | undefined)[], onToday?: (reason: string | null) => void) {
  const waiting = attempts.filter((a): a is Gradable => !!a && a.outcome === "pending_validation" && !a.current && (!a.response || a.response.kind === "text")).map((a) => a.id);
  const key = waiting.join(",");
  const todayRef = useRef(onToday);
  todayRef.current = onToday;

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    let alive = true;
    const tick = async () => {
      if (inFlight || !alive) return;
      const now = Date.now();
      const id = ids.find((x) => (lastAsked.get(`attempt:${x}`) ?? 0) < now - AGAIN_MS);
      if (!id) return;
      lastAsked.set(`attempt:${id}`, now);
      inFlight = true;
      try {
        const r = await callDevOs<{ today?: { reason?: string } }>("grade", { attemptId: id });
        if (r?.today && todayRef.current) todayRef.current(r.today.reason ?? null);
      } catch {
        /* the next try (or the tick) grades it */
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 20_000);
    return () => { alive = false; clearInterval(t); };
  }, [key]);
}
