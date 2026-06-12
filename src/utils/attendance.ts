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

/** WhatsApp message sent to admin when a member checks in. Plain text, no emojis. */
export function buildCheckinMessage(name: string, dateStr: string, stats: TodayWorkStats): string {
  const time = format(new Date(), "hh:mm a");
  return [
    `*CHECK-IN* — ${dateStr}`,
    ``,
    `*${name}*`,
    `Checked in at ${time}`,
    ``,
    `*My Work:*`,
    `In Progress: ${stats.inProgress}`,
    `Pending: ${stats.pending}`,
    ``,
    `Please assign me the work — I will start the work now.`,
  ].join("\n");
}

export interface CheckoutReport {
  name: string;
  dateStr: string;
  checkInTime: string;
  checkOutTime: string;
  totalVideos: number;
  stats: TodayWorkStats;
  /** Member's editable note for the day. */
  note: string;
}

/** WhatsApp message sent to admin when a member checks out (Today Work Report). Plain text, no emojis. */
export function buildCheckoutMessage(r: CheckoutReport): string {
  return [
    `*TODAY WORK REPORT* — ${r.dateStr}`,
    ``,
    `*${r.name}*`,
    `In: ${r.checkInTime}  →  Out: ${r.checkOutTime}`,
    ``,
    `Videos Completed: *${r.totalVideos}*`,
    `In Progress: ${r.stats.inProgress}`,
    `Pending: ${r.stats.pending}`,
    ...(r.note ? [``, `*Note:* ${r.note}`] : []),
    ``,
    `Thank you! I will continue the work tomorrow.`,
  ].join("\n");
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
