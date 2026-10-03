/**
 * Where the day's work goes in the Drive.
 *
 * `Name → Month → Day N → Ad type`, and the reason it is computed rather than written on a poster
 * is that "Day 1" is ambiguous the moment you read it on the 14th. Showing somebody the actual
 * folder they need *today* removes the one step where people guess and end up with August work in
 * a July folder.
 *
 * The day number counts within the month, so the 1st is "Day 1" and the 14th is "Day 14" —
 * matching how the team already names them.
 *
 * Pure, so the naming rule is testable and cannot drift between the check-out prompt and anything
 * that later reads these folders.
 */
import { format, getDate } from "date-fns";
import { getClipCount } from "@/utils/assignmentDuration";
import { isPosterCategory } from "@/utils/posterSpec";
import type { WorkAssignment } from "@/types";

/** The folder trail for one person on one day, outermost first. Ad type is chosen by the member. */
export function driveFolderPath(memberName: string, when: Date = new Date()): string[] {
  const name = (memberName || "").trim() || "Your name";
  return [name, format(when, "MMMM"), `Day ${getDate(when)}`];
}

/** The same trail as a single readable string — for a message, a toast, or a stored record. */
export const driveFolderLabel = (memberName: string, when: Date = new Date()): string =>
  driveFolderPath(memberName, when).join(" → ");

/* ── One job's upload, the moment it is finished (2026-10-03) ─────────────────────────────────── */

type JobForDrive = Pick<WorkAssignment, "category" | "clipCount" | "duration" | "uniqueId" | "businessName" | "displayTitle">;

/**
 * The "Ad type" folder this job goes in — the last step of the trail the day card leaves to the
 * member ("2 Clips", "4 Clips"), now worked out from the job itself so there is nothing to guess.
 * A poster job has no clips; its work goes in "Posters".
 */
export function driveAdTypeFolder(job: Pick<WorkAssignment, "category" | "clipCount" | "duration">): string {
  if (isPosterCategory(job.category)) return "Posters";
  const clips = job.clipCount > 0 ? job.clipCount : getClipCount(job.duration || "");
  return `${clips} Clip${clips === 1 ? "" : "s"}`;
}

/** The whole trail for this job, finished `when`: `Name › October › Day 3 › 4 Clips`. */
export function jobDrivePath(memberName: string, job: JobForDrive, when: Date = new Date()): string[] {
  return [...driveFolderPath(memberName, when), driveAdTypeFolder(job)];
}

/**
 * What to call the file: the job's id and the business — `W123 - Sri Sai Silks`.
 *
 * A Day folder holds every video somebody made that day, all called `VID_20261003_….mp4` straight
 * out of the editor. Whoever verifies the work then has to open each one to find the job it belongs
 * to. With the job id in the name, the folder reads like the work list. Characters a file name
 * cannot carry on Windows or Drive are dropped.
 */
export function driveFileName(job: JobForDrive): string {
  const name = (job.businessName || job.displayTitle || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const id = (job.uniqueId || "").trim();
  return [id, name].filter(Boolean).join(" - ") || "Video";
}

/** Whether the member has said this job's file is in their Drive. */
export function isUploadedToDrive(job: Pick<WorkAssignment, "driveUploadedAt">): boolean {
  return !!job.driveUploadedAt;
}

/**
 * The first day a job could be marked uploaded. Jobs finished before it were covered by the day's
 * check-out declaration alone, and showing every one of them as "not uploaded" would bury the few
 * that really are.
 */
export const DRIVE_UPLOAD_TRACKED_FROM = "2026-10-03";

/** A finished job still waiting for its file to go into the Drive. */
export function needsDriveUpload(
  job: Pick<WorkAssignment, "status" | "completedDate" | "driveUploadedAt">,
): boolean {
  if (job.status !== "completed" && job.status !== "verified") return false;
  if (isUploadedToDrive(job)) return false;
  return !!job.completedDate && job.completedDate >= DRIVE_UPLOAD_TRACKED_FROM;
}

/** Today's finished jobs, split by whether they are in the Drive — the list check-out shows. */
export function todaysDriveUploads<T extends Pick<WorkAssignment, "status" | "completedDate" | "driveUploadedAt">>(
  jobs: T[],
  today: string,
): { uploaded: T[]; pending: T[] } {
  const finished = jobs.filter((j) => (j.status === "completed" || j.status === "verified") && j.completedDate === today);
  return {
    uploaded: finished.filter(isUploadedToDrive),
    pending: finished.filter((j) => !isUploadedToDrive(j)),
  };
}
