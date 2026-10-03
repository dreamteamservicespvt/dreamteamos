import { useCallback, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import DriveUploadSheet, { type DriveSubmitState } from "./DriveUploadSheet";
import type { WorkAssignment } from "@/types";

/**
 * The Drive step after "Mark complete" (2026-10-03) — one hook, so My Work and Recent Ads, the two
 * places a job is handed in from, open the same sheet the same way (like useCreditGate in front of
 * the completion). `submit` when the member hands a job in; `offer(job, false)` from a job card's
 * "Upload to Drive" button; render `sheet` once anywhere on the page. `onClosed` runs when the sheet
 * goes away — My Work uses it to return a member to the social-media month they came from.
 *
 * ── Why `submit` opens the sheet BEFORE the save (2026-10-04) ────────────────────────────────
 * The sheet used to open after `useCompleteWork` returned, and that is six round trips in a row —
 * the job, the assigner's alert, the team leaders' alert, the order, the client chat, the client
 * record. On mobile data the member stared at the studio for seconds after pressing the button.
 * Nothing on the sheet depends on those writes: the folder, the file name and the Drive link are all
 * known before anything is saved. So it opens at once, says "Submitting…" until the JOB itself is
 * saved (`onSaved`, the first write), and the follow-ups finish behind it. If that save fails, the
 * sheet says so and offers Try again — nothing is ever shown as submitted that is not.
 */
export function useDriveUploadStep(options: { onClosed?: () => void } = {}) {
  const { onClosed } = options;
  const user = useAuthStore((s) => s.user);
  const [current, setCurrent] = useState<{
    assignment: WorkAssignment;
    justCompleted: boolean;
    submit?: { state: DriveSubmitState; onRetry?: () => void };
  } | null>(null);
  /** The job the sheet is open for, so a save finishing after it was closed — or replaced — changes nothing. */
  const openFor = useRef<string | null>(null);

  const offer = useCallback((assignment: WorkAssignment | null | undefined, justCompleted = true) => {
    if (!assignment) return;
    openFor.current = assignment.id;
    setCurrent({ assignment: justCompleted ? asHandedIn(assignment) : assignment, justCompleted });
  }, []);

  const settle = useCallback((jobId: string, state: DriveSubmitState, onRetry?: () => void) => {
    if (openFor.current !== jobId) return;
    setCurrent((c) => (c && c.assignment.id === jobId ? { ...c, submit: { state, onRetry } } : c));
  }, []);

  /**
   * Hand a job in with the Drive step already on screen. `run` does the completion and calls
   * `onSaved` the moment the job is saved; it resolves true when the work is submitted.
   */
  const submit = useCallback(async (
    assignment: WorkAssignment | null | undefined,
    run: (onSaved: () => void) => Promise<boolean>,
  ): Promise<boolean> => {
    if (!assignment) return false;
    openFor.current = assignment.id;
    setCurrent({ assignment: asHandedIn(assignment), justCompleted: true, submit: { state: "saving" } });
    const attempt = async (): Promise<boolean> => {
      settle(assignment.id, "saving");
      const ok = await run(() => settle(assignment.id, "saved"));
      settle(assignment.id, ok ? "saved" : "failed", ok ? undefined : () => { void attempt(); });
      return ok;
    };
    return attempt();
  }, [settle]);

  const sheet = user && current ? (
    <DriveUploadSheet
      key={current.assignment.id}
      assignment={current.assignment}
      user={user}
      justCompleted={current.justCompleted}
      submit={current.submit}
      onClose={() => { openFor.current = null; setCurrent(null); onClosed?.(); }}
    />
  ) : null;

  return { offer, submit, sheet };
}

/**
 * The job as it stands once handed in — the caller's copy was read before the completion was
 * written, and a job handed in again after edits is a new file: the old upload mark does not cover it.
 */
function asHandedIn(assignment: WorkAssignment): WorkAssignment {
  return {
    ...assignment,
    status: "completed",
    completedDate: localDay(),
    driveUploadedAt: undefined,
    driveUploadPath: undefined,
    driveFileName: undefined,
  };
}

function localDay(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
