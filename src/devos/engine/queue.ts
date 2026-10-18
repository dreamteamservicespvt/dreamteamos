/**
 * The grading queue: answers and practical submissions the judges have not settled yet (just submitted, the AI was
 * down, or two judges disagreed). The tick works through it (bounded retries), so nothing waits for a person to come
 * back (FR-057).
 *
 * ── Queued in the same transaction that saves the answer (2026-10-18) ─────────────────────────────
 * An open answer or a practical is saved as "waiting for grading" and then graded inside the same request. It used to
 * join the queue only when that grading FAILED — so a request cut off while the judges were thinking (the function's
 * 60 s on a slow Gemini day) left it waiting forever, with nothing to pick it up. Now the save itself queues it
 * (`withQueued` inside the save's transaction); a grading that finishes takes it out again, and the tick's daily
 * roll-over re-queues anything still waiting that is not in the queue (`stranded`).
 */
import type { Deps } from "./context.js";

export const QUEUE_PATH = "devos_queue/grading";

/** The most items the one queue document holds (the oldest go first — the daily roll-over finds them again). */
export const QUEUE_MAX = 400;

export interface QueueItem { uid: string; kind: "attempt" | "task"; id: string; since: number }

/** The queue document with `item` in it once (queuing again refreshes its time). Pure — for use inside a transaction. */
export function withQueued(doc: Record<string, unknown> | null, item: Omit<QueueItem, "since">, now: number): { items: QueueItem[] } {
  const items = ((doc?.items as QueueItem[] | undefined) ?? []).filter((x) => !(x.uid === item.uid && x.id === item.id));
  return { items: [...items, { ...item, since: now }].slice(-QUEUE_MAX) };
}

/** `since` = when it started waiting (default now; a re-queued item keeps its submission time). */
export async function enqueueGrading(deps: Deps, item: Omit<QueueItem, "since">, since?: number): Promise<void> {
  await deps.store.tx(async (t) => {
    const q = await t.get(QUEUE_PATH);
    t.set(QUEUE_PATH, withQueued(q, item, since ?? deps.now()));
  });
}

export async function dequeueGrading(deps: Deps, done: Pick<QueueItem, "uid" | "id">[]): Promise<void> {
  if (!done.length) return;
  await deps.store.tx(async (t) => {
    const q = await t.get(QUEUE_PATH);
    const before = (q?.items as QueueItem[] | undefined) ?? [];
    const items = before.filter((x) => !done.some((d) => d.uid === x.uid && d.id === x.id));
    if (items.length !== before.length) t.set(QUEUE_PATH, { items });
  });
}

/** Is this item in the queue document? */
export const isQueued = (doc: Record<string, unknown> | null, uid: string, id: string): boolean =>
  ((doc?.items as QueueItem[] | undefined) ?? []).some((x) => x.uid === uid && x.id === id);
