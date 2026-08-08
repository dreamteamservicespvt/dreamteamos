/**
 * What the ad is doing, said the same way everywhere a client chat is shown.
 *
 * The sales member's list of chats, the chat header itself and the sale row in My Leads all answer
 * the same question — "where has this got to?" — and answering it in three different vocabularies
 * is how a member ends up ringing the tech side to ask what "editing" means. One table.
 *
 * `verified` is called **Delivered** rather than "Verified": approval is an internal step, and the
 * fact anybody outside the tech team actually wants is that the ad has gone out.
 */
import type { WorkAssignmentStatus } from "@/types";

export interface WorkStatusChip {
  label: string;
  /** Tailwind classes for a pill. Deliberately not role-conditional — a status is a status. */
  className: string;
}

export const WORK_STATUS_CHIP: Record<WorkAssignmentStatus, WorkStatusChip> = {
  assigned: {
    label: "Assigned",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  in_progress: {
    label: "In progress",
    className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  },
  editing: {
    label: "In changes",
    className: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  completed: {
    label: "Completed",
    className: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  verified: {
    label: "Delivered",
    className: "bg-green-600/20 text-green-700 dark:text-green-300",
  },
};

/** A sale nobody has picked up yet — no assignment, so no `WorkAssignmentStatus` to describe it. */
export const NOT_ASSIGNED_CHIP: WorkStatusChip = {
  label: "Not assigned",
  className: "bg-muted text-muted-foreground",
};

/** The chip for a room, falling back to "Not assigned" when the status is missing or unknown. */
export function workStatusChip(status?: WorkAssignmentStatus | null): WorkStatusChip {
  return (status && WORK_STATUS_CHIP[status]) || NOT_ASSIGNED_CHIP;
}
