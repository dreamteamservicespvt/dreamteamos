import {
  addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { recordAudit } from "./auditLog";
import { sendNotification } from "./notifications";
import { clearAttendanceOverride, isSunday, setAttendanceOverride } from "./techAttendance";
import { payPeriodForDate, payPeriodForMonth, periodDates } from "@/utils/payrollEngine";
import { DEFAULT_PAYROLL_CONFIG, type LeaveRequest, type LeaveStatus } from "@/types/payroll";
import type { AppUser } from "@/types";

/**
 * Leave requests.
 *
 * An approved leave writes an attendance override of `leave` for each working day it covers.
 * From there the salary engine takes over: the first `paidLeaveQuota` leave days in a pay period
 * are paid, everything beyond earns nothing — the employee still sees the day as Leave rather
 * than Absent, but it costs them a day's salary exactly as an absence would.
 *
 * Approving and un-approving are symmetric: un-approving clears the same overrides it wrote, so
 * a mistaken approval leaves no trace on anyone's salary.
 */

/** Every date in an inclusive range. */
export function datesBetween(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const cursor = new Date(fy, fm - 1, fd);
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  while (iso(cursor) <= toDate) {
    out.push(iso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * The days a leave request actually consumes. Sundays are already non-working days, so marking
 * them as leave would wrongly burn quota for time nobody was due to work.
 */
export function leaveWorkingDates(fromDate: string, toDate: string): string[] {
  return datesBetween(fromDate, toDate).filter(d => !isSunday(d));
}

// ─── Reading ────────────────────────────────────────────────────────────────

/** Live leave requests for one member, newest first. */
export function watchMemberLeaveRequests(memberId: string, cb: (requests: LeaveRequest[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "leave_requests"), where("memberId", "==", memberId)),
    snap => {
      const requests = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
      requests.sort((a, b) => b.fromDate.localeCompare(a.fromDate));
      cb(requests);
    },
    error => {
      console.error("Leave request listener failed:", error);
      cb([]);
    },
  );
}

/** Live leave requests awaiting a decision, oldest first so nobody waits indefinitely. */
export function watchPendingLeaveRequests(cb: (requests: LeaveRequest[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "leave_requests"), where("status", "==", "pending")),
    snap => {
      const requests = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
      requests.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
      cb(requests);
    },
    error => {
      console.error("Pending leave listener failed:", error);
      cb([]);
    },
  );
}

/** Live leave requests across all members for a given pay period. */
export function watchLeaveRequestsInRange(
  startDate: string,
  endDate: string,
  cb: (requests: LeaveRequest[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "leave_requests"), where("fromDate", ">=", startDate), where("fromDate", "<=", endDate)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest))),
    error => {
      console.error("Leave range listener failed:", error);
      cb([]);
    },
  );
}

// ─── Quota ──────────────────────────────────────────────────────────────────

export interface LeaveBalance {
  quota: number;
  /** Working days already approved as leave inside this pay period. */
  used: number;
  remaining: number;
  /** Of the days in a pending request, how many would still be paid. */
  wouldBePaid: number;
  wouldBeUnpaid: number;
}

/**
 * How much paid leave a member has left in the pay period containing `fromDate`, and how a
 * request of `requestedDays` would split across paid and unpaid.
 *
 * Shown before submitting so nobody discovers their leave was unpaid on payday.
 */
export function leaveBalanceFor(
  approvedLeaveDates: string[],
  fromDate: string,
  requestedDays: number,
  quota = DEFAULT_PAYROLL_CONFIG.paidLeaveQuota,
  cycleStartDay = DEFAULT_PAYROLL_CONFIG.payDayOfMonth,
): LeaveBalance {
  const [y, m, d] = fromDate.split("-").map(Number);
  const period = payPeriodForDate(new Date(y, m - 1, d), cycleStartDay);
  const inPeriod = new Set(periodDates(period));

  const used = approvedLeaveDates.filter(date => inPeriod.has(date)).length;
  const remaining = Math.max(0, quota - used);
  const wouldBePaid = Math.min(requestedDays, remaining);

  return { quota, used, remaining, wouldBePaid, wouldBeUnpaid: Math.max(0, requestedDays - wouldBePaid) };
}

/** The pay period a date falls into, as a `yyyy-MM` label. */
export function periodMonthFor(dateStr: string, cycleStartDay = DEFAULT_PAYROLL_CONFIG.payDayOfMonth): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return payPeriodForDate(new Date(y, m - 1, d), cycleStartDay).month;
}

// ─── Writing ────────────────────────────────────────────────────────────────

export interface SubmitLeaveInput {
  fromDate: string;
  toDate: string;
  reason: string;
}

/** Employee submits a leave request. Nothing hits attendance until someone approves it. */
export async function submitLeaveRequest(
  member: Pick<AppUser, "uid" | "name">,
  input: SubmitLeaveInput,
): Promise<string> {
  const days = leaveWorkingDates(input.fromDate, input.toDate);
  if (days.length === 0) {
    throw new Error("That range contains no working days — Sundays are already days off.");
  }

  const ref = await addDoc(collection(db, "leave_requests"), {
    memberId: member.uid,
    memberName: member.name,
    fromDate: input.fromDate,
    toDate: input.toDate,
    // Denormalised to the PAY period, not the calendar month, so quota maths lines up with salary.
    month: periodMonthFor(input.fromDate),
    kind: "paid",
    reason: input.reason.trim(),
    status: "pending" satisfies LeaveStatus,
    createdAt: serverTimestamp(),
  });

  await recordAudit({
    action: "leave_submitted",
    actor: { uid: member.uid, name: member.name },
    target: { id: member.uid, name: member.name },
    summary: `${member.name} requested leave ${input.fromDate}${input.toDate !== input.fromDate ? ` → ${input.toDate}` : ""} (${days.length} working day${days.length === 1 ? "" : "s"})`,
    after: { ...input, workingDays: days.length },
  });

  return ref.id;
}

/**
 * Approve a request and mark those days as leave on the attendance record.
 *
 * The engine decides paid vs. unpaid from the period's quota — this only records *that* the
 * person was on leave, never whether it was paid.
 */
export async function approveLeaveRequest(
  request: LeaveRequest,
  actor: { uid: string; name?: string },
): Promise<void> {
  const days = leaveWorkingDates(request.fromDate, request.toDate);

  await Promise.all(days.map(date =>
    setAttendanceOverride({ uid: request.memberId, name: request.memberName }, date, "leave", actor),
  ));

  await updateDoc(doc(db, "leave_requests", request.id), {
    status: "approved" satisfies LeaveStatus,
    reviewedBy: actor.uid,
    reviewedByName: actor.name || "",
    reviewedAt: serverTimestamp(),
  });

  await recordAudit({
    action: "leave_approved",
    actor,
    target: { id: request.memberId, name: request.memberName },
    month: request.month,
    summary: `Approved ${request.memberName}'s leave ${request.fromDate}${request.toDate !== request.fromDate ? ` → ${request.toDate}` : ""} (${days.length} day${days.length === 1 ? "" : "s"})`,
    before: { status: request.status },
    after: { status: "approved", days },
  });

  await sendNotification({
    userId: request.memberId,
    type: "leave_approved",
    title: "Leave Approved",
    message: `Your leave for ${request.fromDate}${request.toDate !== request.fromDate ? ` to ${request.toDate}` : ""} has been approved.`,
    link: "/tech/salary",
  }).catch(() => undefined);
}

export async function rejectLeaveRequest(
  request: LeaveRequest,
  note: string,
  actor: { uid: string; name?: string },
): Promise<void> {
  await updateDoc(doc(db, "leave_requests", request.id), {
    status: "rejected" satisfies LeaveStatus,
    reviewedBy: actor.uid,
    reviewedByName: actor.name || "",
    reviewedAt: serverTimestamp(),
    reviewNote: note.trim(),
  });

  await recordAudit({
    action: "leave_rejected",
    actor,
    target: { id: request.memberId, name: request.memberName },
    month: request.month,
    summary: `Rejected ${request.memberName}'s leave ${request.fromDate}: ${note.trim() || "no reason given"}`,
    before: { status: request.status },
    after: { status: "rejected", note },
  });

  await sendNotification({
    userId: request.memberId,
    type: "leave_rejected",
    title: "Leave Not Approved",
    message: note.trim()
      ? `Your leave request for ${request.fromDate} was not approved: ${note.trim()}`
      : `Your leave request for ${request.fromDate} was not approved.`,
    link: "/tech/salary",
  }).catch(() => undefined);
}

/**
 * Undo a decision, putting the request back to pending.
 *
 * Un-approving clears exactly the attendance overrides the approval wrote, so a mistaken
 * approval cannot leave phantom leave days silently reducing someone's salary.
 */
export async function undoLeaveDecision(
  request: LeaveRequest,
  actor: { uid: string; name?: string },
): Promise<void> {
  if (request.status === "approved") {
    const days = leaveWorkingDates(request.fromDate, request.toDate);
    await Promise.all(days.map(date => clearAttendanceOverride(request.memberId, date)));
  }

  await updateDoc(doc(db, "leave_requests", request.id), {
    status: "pending" satisfies LeaveStatus,
    reviewNote: "",
  });

  await recordAudit({
    action: request.status === "approved" ? "leave_rejected" : "leave_approved",
    actor,
    target: { id: request.memberId, name: request.memberName },
    month: request.month,
    summary: `Undid the ${request.status} decision on ${request.memberName}'s leave ${request.fromDate}`,
    before: { status: request.status },
    after: { status: "pending" },
  });
}

/** Employee withdraws their own request before it's decided. */
export async function cancelLeaveRequest(
  request: LeaveRequest,
  actor: { uid: string; name?: string },
): Promise<void> {
  await updateDoc(doc(db, "leave_requests", request.id), {
    status: "cancelled" satisfies LeaveStatus,
  });

  await recordAudit({
    action: "leave_submitted",
    actor,
    target: { id: request.memberId, name: request.memberName },
    month: request.month,
    summary: `${request.memberName} withdrew their leave request for ${request.fromDate}`,
    before: { status: request.status },
    after: { status: "cancelled" },
  });
}

/** Approved leave dates for a member inside a pay period — for quota display. */
export function approvedLeaveDatesIn(requests: LeaveRequest[], month: string, cycleStartDay?: number): string[] {
  const inPeriod = new Set(periodDates(payPeriodForMonth(month, cycleStartDay)));
  return requests
    .filter(r => r.status === "approved")
    .flatMap(r => leaveWorkingDates(r.fromDate, r.toDate))
    .filter(date => inPeriod.has(date));
}
