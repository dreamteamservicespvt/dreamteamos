import { useCallback, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import DriveUploadSheet from "./DriveUploadSheet";
import type { WorkAssignment } from "@/types";

/**
 * The Drive step after "Mark complete" (2026-10-03) — one hook, so My Work and Recent Ads, the two
 * places a job is handed in from, open the same sheet the same way (like useCreditGate in front of
 * the completion). `offer` after a successful submit; `offer(job, false)` from a job card's
 * "Upload to Drive" button; render `sheet` once anywhere on the page. `onClosed` runs when the sheet
 * goes away — My Work uses it to return a member to the social-media month they came from.
 */
export function useDriveUploadStep(options: { onClosed?: () => void } = {}) {
  const { onClosed } = options;
  const user = useAuthStore((s) => s.user);
  const [current, setCurrent] = useState<{ assignment: WorkAssignment; justCompleted: boolean } | null>(null);

  const offer = useCallback((assignment: WorkAssignment | null | undefined, justCompleted = true) => {
    if (!assignment) return;
    // The job as it now stands — the caller's copy was read before the completion was written, and a
    // job handed in again after edits is a new file: the old upload mark does not cover it.
    setCurrent({
      assignment: justCompleted
        ? {
          ...assignment,
          status: "completed",
          completedDate: localDay(),
          driveUploadedAt: undefined,
          driveUploadPath: undefined,
          driveFileName: undefined,
        }
        : assignment,
      justCompleted,
    });
  }, []);

  const sheet = user && current ? (
    <DriveUploadSheet
      key={current.assignment.id}
      assignment={current.assignment}
      user={user}
      justCompleted={current.justCompleted}
      onClose={() => { setCurrent(null); onClosed?.(); }}
    />
  ) : null;

  return { offer, sheet };
}

function localDay(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
