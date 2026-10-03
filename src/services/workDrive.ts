/**
 * A finished job's file, into the member's Drive (2026-10-03).
 *
 * Two writes, both small: the member's word that the file is uploaded, stamped on the job itself
 * (so My Work, Recent Ads and check-out can all say which of today's jobs are still to go up), and —
 * when the member has no Drive folder set at all — one alert to their tech admin, who is the only
 * person who can add it (tech-admin/DriveManagement).
 */
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import type { AppUser, WorkAssignment } from "@/types";

/** Record that this job's file is in the Drive, in this folder, under this name. */
export async function markDriveUploaded(
  assignment: Pick<WorkAssignment, "id">,
  path: string[],
  fileName: string,
): Promise<void> {
  await updateDoc(doc(db, "work_assignments", assignment.id), {
    driveUploadedAt: serverTimestamp(),
    driveUploadPath: path,
    driveFileName: fileName,
  });
}

/**
 * "I have no Drive folder — please add one." Once a day per member, however many times it is
 * pressed: the key carries the member and the day, and the notification layer drops repeats.
 */
export async function askAdminForDriveFolder(user: Pick<AppUser, "uid" | "name" | "createdBy">): Promise<boolean> {
  if (!user.createdBy) return false;
  await sendNotification({
    userId: user.createdBy,
    type: "drive_folder_missing",
    title: "Drive folder needed",
    message: `${user.name || "A team member"} has finished work to upload but has no Drive folder set. Add their folder link in Drive Management.`,
    link: "/tech-admin/drive",
    dedupeKey: `drive_folder_missing_${user.uid}_${format(new Date(), "yyyy-MM-dd")}`,
  });
  return true;
}
