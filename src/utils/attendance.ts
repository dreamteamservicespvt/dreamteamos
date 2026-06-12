import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { getWhatsAppUrl } from "@/utils/phone";
import type { AppUser, WorkAssignment } from "@/types";

/** Admin WhatsApp number that receives attendance + work report messages. */
export const ADMIN_WHATSAPP = "9959935203";

export interface TodayWorkStats {
  /** Videos finished today (completed or verified with today's completedDate) */
  completedToday: number;
  /** Tasks not yet started (status: assigned) */
  pending: number;
  /** Tasks being worked on (status: in_progress or editing) */
  inProgress: number;
  /** pending + inProgress */
  activeTotal: number;
}

/** Compute a member's live work snapshot from their assignments. */
export function getTodayWorkStats(assignments: WorkAssignment[], todayStr?: string): TodayWorkStats {
  const today = todayStr || format(new Date(), "yyyy-MM-dd");
  // Count by the assignment's work date (`a.date`) so these numbers line up with
  // the admin's MyTeam / Dashboard / Member History screens, which all bucket by `a.date`.
  const completedToday = assignments.filter(
    (a) => (a.status === "completed" || a.status === "verified") && a.date === today
  ).length;
  const pending = assignments.filter((a) => a.status === "assigned").length;
  const inProgress = assignments.filter((a) => a.status === "in_progress" || a.status === "editing").length;
  return { completedToday, pending, inProgress, activeTotal: pending + inProgress };
}

/** WhatsApp message sent to admin when a member checks in. */
export function buildCheckinMessage(name: string, dateStr: string, stats: TodayWorkStats): string {
  const time = format(new Date(), "hh:mm a");
  return [
    `✅ *CHECK-IN* — ${dateStr}`,
    ``,
    `👤 Name: *${name}*`,
    `🕐 Time: ${time}`,
    ``,
    `📋 *Work Status:*`,
    `▶️ In Progress: ${stats.inProgress}`,
    `⏳ Pending: ${stats.pending}`,
    `🎬 Completed Today: ${stats.completedToday}`,
    ``,
    stats.activeTotal === 0 ? `No active tasks — please assign me work. 🙏` : `Starting work on my tasks now. 💪`,
  ].join("\n");
}

export interface CheckoutReport {
  name: string;
  dateStr: string;
  checkInTime: string;
  checkOutTime: string;
  hoursWorked: string;
  totalVideos: number;
  stats: TodayWorkStats;
  summary: string;
  driveFolderUrl: string;
}

/** WhatsApp message sent to admin when a member checks out (full day report). */
export function buildCheckoutMessage(r: CheckoutReport): string {
  return [
    `🏁 *CHECK-OUT — Daily Work Report* (${r.dateStr})`,
    ``,
    `👤 Name: *${r.name}*`,
    `🕐 In: ${r.checkInTime}  →  Out: ${r.checkOutTime}${r.hoursWorked ? `  (${r.hoursWorked}h)` : ""}`,
    ``,
    `🎬 Videos Completed Today: *${r.totalVideos}*`,
    `▶️ In Progress: ${r.stats.inProgress}`,
    `⏳ Pending: ${r.stats.pending}`,
    ``,
    `📝 *Summary:*`,
    r.summary,
    ``,
    r.driveFolderUrl ? `📁 Drive: ${r.driveFolderUrl}` : ``,
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
}

/** Auto-generated, editable checkout summary text. */
export function buildAutoSummary(stats: TodayWorkStats): string {
  const parts: string[] = [];
  parts.push(`Completed ${stats.completedToday} video${stats.completedToday === 1 ? "" : "s"} today.`);
  if (stats.inProgress > 0) parts.push(`${stats.inProgress} task${stats.inProgress === 1 ? "" : "s"} in progress.`);
  if (stats.pending > 0) parts.push(`${stats.pending} task${stats.pending === 1 ? "" : "s"} pending.`);
  if (stats.inProgress === 0 && stats.pending === 0) parts.push("All assigned work is done.");
  return parts.join(" ");
}

/**
 * Shared check-in routine: creates today's daily_checkins doc with a work
 * snapshot, notifies the tech admin in-app, and returns the WhatsApp URL
 * with the prefilled attendance message (caller opens it).
 */
export async function performCheckIn(user: AppUser, assignments: WorkAssignment[]): Promise<string> {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const stats = getTodayWorkStats(assignments, todayStr);

  await addDoc(collection(db, "daily_checkins"), {
    memberId: user.uid,
    memberName: user.name,
    date: todayStr,
    checkedInAt: serverTimestamp(),
    status: "checked_in",
    checkinPendingTasks: stats.pending,
    checkinInProgressTasks: stats.inProgress,
  });

  await sendNotification({
    userId: user.createdBy,
    type: "check_in",
    title: "Team Check-In",
    message: `${user.name} has checked in for today.`,
    link: `/tech-admin/team/${user.uid}`,
  });

  return getWhatsAppUrl(ADMIN_WHATSAPP, buildCheckinMessage(user.name, todayStr, stats));
}
