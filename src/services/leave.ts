import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { recordAudit } from "./auditLog";
import { sendNotification } from "./notifications";
import { fetchPayrollConfig } from "./payroll";
import { attendanceKey, clearAttendanceOverride, isSunday, setAttendanceOverride } from "./techAttendance";
import { formatDayCount, payPeriodForDate, payPeriodForMonth, periodDates } from "@/utils/payrollEngine";
import {
  splitLeaveDays, describeLeaveSplit, isWholeDaySplit, type LeaveMark, type LeaveSplit,
} from "@/utils/leaveAllowance";
import { getSalaryRoute } from "@/utils/roleHelpers";
import {
  DEFAULT_PAYROLL_CONFIG, type LeaveDuration, type LeaveRequest, type LeaveStatus,
} from "@/types/payroll";
import type { AppUser, UserRole } from "@/types";

/**
 * Leave requests.
 *
 * Two paid leave days per PAY PERIOD (the 10th → 9th cycle, never the calendar month). Approving a
 * request writes an attendance override for each working day it covers: `leave` for the days that
 * fit inside the allowance, `absent` for the days beyond it.
 *
 * ── Why the overflow is an absence rather than "unpaid leave" ─────────────────────────────────
 * Both earn nothing, so the money is identical — but they are not the same fact about a person. A
 * day recorded as leave reads as a day off that was granted; only an absence reads as a day the
 * company did not agree to. The rule exists to draw that line, so it has to reach the attendance
 * record and not merely the payslip, where an "unpaid leave" row could be mistaken for generosity.
 *
 * The allowance is measured across the whole period, not per request — see utils/leaveAllowance
 * for why that distinction is what makes it an allowance at all.
 *
 * Approving and un-approving are symmetric: un-approving clears the same overrides it wrote,
 * whichever kind they were, so a mistaken approval leaves no trace on anyone's salary.
 *
 * ── Half-day leave (owner, 2026-10-12) ───────────────────────────────────────────────────────
 * A request is a full day (as always) or a HALF day: one working day, of which the member works one half. It uses
 * half a day of the same allowance. Inside it the day is written `half_leave` and paid in full (worked half + paid
 * leave half); past it the day is written `half` — paid as a half day, the half-day version of "leave past the
 * allowance counts as absence". `duration` on the request says which, and undo reads it back (`approvalMarks`).
 */

/** A half-day request? Absent `duration` is a full day — every request made before half days existed. */
export const isHalfDayLeave = (request: Pick<LeaveRequest, "duration">): boolean => request.duration === "half_day";

/** "Half day" / "Full day" — how a request's length is shown on every list. */
export const leaveDurationLabel = (request: Pick<LeaveRequest, "duration">): string =>
  isHalfDayLeave(request) ? "Half day" : "Full day";

/**
 * The working days a request covers. A half-day request is its ONE date, whatever `toDate` holds (it is written
 * equal to `fromDate`; reading only `fromDate` keeps a hand-edited document from becoming a range of half days).
 */
export function requestWorkingDates(request: Pick<LeaveRequest, "fromDate" | "toDate" | "duration">): string[] {
  return isHalfDayLeave(request)
    ? leaveWorkingDates(request.fromDate, request.fromDate)
    : leaveWorkingDates(request.fromDate, request.toDate);
}

/** "half-day leave on 2026-07-22" / "leave 2026-07-20 → 2026-07-22" — a request in an audit line. */
function requestInWords(request: Pick<LeaveRequest, "fromDate" | "toDate" | "duration">): string {
  if (isHalfDayLeave(request)) return `half-day leave on ${request.fromDate}`;
  return `leave ${request.fromDate}${request.toDate !== request.fromDate ? ` → ${request.toDate}` : ""}`;
}

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
  /** Full day (the default) or half day — a half day is `fromDate` alone; `toDate` is ignored and written equal. */
  duration?: LeaveDuration;
}

/** Employee submits a leave request. Nothing hits attendance until someone approves it. */
export async function submitLeaveRequest(
  member: Pick<AppUser, "uid" | "name">,
  input: SubmitLeaveInput,
): Promise<string> {
  const halfDay = input.duration === "half_day";
  // A half day is one date: the day the member works half of.
  const toDate = halfDay ? input.fromDate : input.toDate;
  const days = leaveWorkingDates(input.fromDate, toDate);
  if (days.length === 0) {
    throw new Error(halfDay
      ? "That day is a Sunday — already a day off, so there is nothing to take half of."
      : "That range contains no working days — Sundays are already days off.");
  }

  const ref = await addDoc(collection(db, "leave_requests"), {
    memberId: member.uid,
    memberName: member.name,
    fromDate: input.fromDate,
    toDate,
    // Denormalised to the PAY period, not the calendar month, so quota maths lines up with salary.
    month: periodMonthFor(input.fromDate),
    // Written on every new request; a request without it is a full day (all of them before 2026-10-12). `kind`
    // ("paid" on every request, read by nothing) is no longer written — see LeaveRequest.kind.
    duration: (halfDay ? "half_day" : "full_day") satisfies LeaveDuration,
    reason: input.reason.trim(),
    status: "pending" satisfies LeaveStatus,
    createdAt: serverTimestamp(),
  });

  await recordAudit({
    action: "leave_submitted",
    actor: { uid: member.uid, name: member.name },
    target: { id: member.uid, name: member.name },
    summary: halfDay
      ? `${member.name} requested a half-day leave on ${input.fromDate}`
      : `${member.name} requested leave ${input.fromDate}${toDate !== input.fromDate ? ` → ${toDate}` : ""} (${days.length} working day${days.length === 1 ? "" : "s"})`,
    // Built field by field: Firestore refuses `undefined`, and an audit write that fails is silently lost.
    after: {
      fromDate: input.fromDate, toDate, reason: input.reason,
      duration: halfDay ? "half_day" : "full_day", workingDays: halfDay ? 0.5 : days.length,
    },
  });

  return ref.id;
}

/**
 * Leave a member already holds, split by how much of the allowance each day takes: `full` days weigh a whole day,
 * `half` days (half-day leave) half a day — what `splitLeaveDays` measures a new request against.
 */
export interface LeaveOnRecord {
  full: string[];
  half: string[];
}

/**
 * The days a member's APPROVED requests booked as leave, full and half (pure — the requests are passed in).
 *
 * Deliberately only the days recorded as leave: a day already settled as an absence has been paid
 * for once, and counting it against the allowance again would charge twice for one day off. A
 * half-day request's day is half a day (2026-10-12). `excludeRequestId` keeps a request from being
 * measured against itself when it is re-approved.
 */
export function approvedLeaveOnRequests(requests: LeaveRequest[], excludeRequestId?: string): LeaveOnRecord {
  const out: LeaveOnRecord = { full: [], half: [] };
  for (const r of requests) {
    if (r.status !== "approved" || r.id === excludeRequestId) continue;
    // Days this request itself booked as absence are not leave and never were.
    const absent = new Set(r.absentDates || []);
    const days = requestWorkingDates(r).filter(date => !absent.has(date));
    (isHalfDayLeave(r) ? out.half : out.full).push(...days);
  }
  return out;
}

/** The member's approved requests, read — the fallback when the attendance record cannot be. */
async function approvedLeaveFor(memberId: string, excludeRequestId?: string): Promise<LeaveOnRecord> {
  try {
    const snap = await getDocs(query(
      collection(db, "leave_requests"),
      where("memberId", "==", memberId),
      where("status", "==", "approved"),
    ));
    return approvedLeaveOnRequests(snap.docs.map(d => ({ ...(d.data() as LeaveRequest), id: d.id })), excludeRequestId);
  } catch (err) {
    // A failed lookup must not block an approval. The worst case is a generous split, which the
    // payroll engine's own quota pass still catches at salary time.
    console.error("[leave] could not read the member's approved leave:", err);
    return { full: [], half: [] };
  }
}

/**
 * Every working day this member holds as LEAVE on the attendance record itself — the source the
 * salary is priced from: `leave` marks as full days, `half_leave` marks as half days (2026-10-12).
 *
 * ── Why the record and not the requests (2026-10-09) ─────────────────────────────────────────
 * Counting approved requests missed leave an admin marked straight onto the grid (it belongs to no
 * request), so an approval could hand out a third "paid" leave day: the grid said L, the salary
 * (which applies the allowance itself) deducted it, and nobody could see why. It also kept counting
 * a day the admin had since changed to Present. The record has neither problem. A Sunday never
 * counts — the weekly off is not leave. `excludeDates` keeps a request from being measured against
 * its own days when it is approved again.
 *
 * Falls back to the requests when the record cannot be read.
 */
async function leaveDatesOnRecord(memberId: string, excludeDates: Set<string>, excludeRequestId?: string): Promise<LeaveOnRecord> {
  try {
    const snap = await getDocs(query(collection(db, "attendance"), where("memberId", "==", memberId)));
    const marks = snap.docs
      .map(d => d.data() as { date?: string; status?: string })
      .filter(a => !!a.date && !excludeDates.has(a.date) && !isSunday(a.date));
    return {
      full: marks.filter(a => a.status === "leave").map(a => a.date as string),
      half: marks.filter(a => a.status === "half_leave").map(a => a.date as string),
    };
  } catch (err) {
    console.error("[leave] could not read the member's attendance; counting approved requests instead:", err);
    return approvedLeaveFor(memberId, excludeRequestId);
  }
}

/**
 * Where this member's salary-and-leave page is, for the notification's link.
 *
 * Every leave notification linked `/tech/salary`, a tech-member route — a sales member's "Leave
 * Approved" opened a page their role cannot see. One read of the member's user record.
 */
async function salaryLinkFor(memberId: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, "users", memberId));
    return getSalaryRoute((snap.data() as { role?: UserRole } | undefined)?.role);
  } catch {
    return getSalaryRoute(null);
  }
}

/**
 * Approve a request, marking each day as either leave or an absence.
 *
 * ── Why the classification happens here ───────────────────────────────────────────────────────
 * Two paid days per pay period; everything past them is an absence. That verdict has to reach the
 * ATTENDANCE record, not just the payslip — an absence that shows as "Leave" on the calendar is
 * indistinguishable from an approved day off, which is exactly the distinction the rule exists to
 * make. So the split is decided at approval and written into the overrides themselves.
 *
 * The allowance is measured against the leave already on the member's attendance record in that
 * period (see `leaveDatesOnRecord`), so the third day off in a cycle is unpaid whether it arrives
 * on its own, inside a batch, or after an admin marked leave on the grid — and against the live
 * policy's allowance and cycle, the ones the salary uses.
 *
 * Returns the split, so the approver is told what the approval actually did (the panel used to
 * report its own pre-approval estimate, "all paid", for a request that had just become absences).
 *
 * A half-day request (2026-10-12) is settled the same way at half the weight: `half_leave` when half a day of the
 * allowance is left, `half` when it is not; leave already on record counts `half_leave` marks as half a day.
 */
export async function approveLeaveRequest(
  request: LeaveRequest,
  actor: { uid: string; name?: string },
): Promise<LeaveSplit> {
  const halfDay = isHalfDayLeave(request);
  const days = requestWorkingDates(request);
  const [policy, used, link] = await Promise.all([
    fetchPayrollConfig(),
    leaveDatesOnRecord(request.memberId, new Set(days), request.id),
    salaryLinkFor(request.memberId),
  ]);
  const split = splitLeaveDays({
    requestedDates: days,
    duration: halfDay ? "half_day" : "full_day",
    alreadyApprovedLeaveDates: used.full,
    alreadyApprovedHalfLeaveDates: used.half,
    quota: policy.paidLeaveQuota,
    cycleStartDay: policy.payDayOfMonth,
  });

  await Promise.all(split.days.map(day =>
    setAttendanceOverride(
      { uid: request.memberId, name: request.memberName },
      day.date,
      // leave / absent for a full day; half_leave / half for a half day.
      day.mark,
      actor,
    ),
  ));

  await updateDoc(doc(db, "leave_requests", request.id), {
    status: "approved" satisfies LeaveStatus,
    // Recorded on the request so the decision is auditable, and so a later request measuring the
    // allowance can tell which of these days were leave and which were already absence.
    leaveDates: split.leaveDates,
    absentDates: split.absentDates,
    reviewedBy: actor.uid,
    reviewedByName: actor.name || "",
    reviewedAt: serverTimestamp(),
  });

  const range = `${request.fromDate}${request.toDate !== request.fromDate ? ` → ${request.toDate}` : ""}`;
  await recordAudit({
    action: "leave_approved",
    actor,
    target: { id: request.memberId, name: request.memberName },
    month: request.month,
    summary: isWholeDaySplit(split) && !halfDay
      ? `Approved ${request.memberName}'s leave ${range} — ${split.leaveDates.length} paid leave, ${split.absentDates.length} absence`
      : `Approved ${request.memberName}'s ${requestInWords(request)} — ${formatDayCount(split.paidDays)} paid leave, ${formatDayCount(split.unpaidDays)} unpaid`,
    before: { status: request.status },
    after: {
      status: "approved", duration: halfDay ? "half_day" : "full_day",
      leaveDates: split.leaveDates, absentDates: split.absentDates, paidDays: split.paidDays, unpaidDays: split.unpaidDays,
    },
  });

  const when = `${request.fromDate}${request.toDate !== request.fromDate ? ` to ${request.toDate}` : ""}`;
  await sendNotification({
    userId: request.memberId,
    type: "leave_approved",
    title: halfDay ? "Half-day Leave Approved" : "Leave Approved",
    // Said plainly and up front. Discovering on payday that half the week was unpaid is the
    // complaint this whole rule has to avoid causing. A half day always says how it is paid.
    message: halfDay
      ? `Your half-day leave on ${request.fromDate} ${split.unpaidDays > 0 ? "is approved" : "has been approved"}. ${describeLeaveSplit(split)}`
      : split.unpaidDays > 0
        ? `Your leave for ${when} is approved. ${describeLeaveSplit(split)}`
        : `Your leave for ${when} has been approved.`,
    link,
  }).catch(() => undefined);

  return split;
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

  const what = isHalfDayLeave(request) ? "half-day leave" : "leave";
  await recordAudit({
    action: "leave_rejected",
    actor,
    target: { id: request.memberId, name: request.memberName },
    month: request.month,
    summary: `Rejected ${request.memberName}'s ${what} ${request.fromDate}: ${note.trim() || "no reason given"}`,
    before: { status: request.status },
    after: { status: "rejected", note },
  });

  await sendNotification({
    userId: request.memberId,
    type: "leave_rejected",
    title: "Leave Not Approved",
    message: note.trim()
      ? `Your ${what} request for ${request.fromDate} was not approved: ${note.trim()}`
      : `Your ${what} request for ${request.fromDate} was not approved.`,
    link: await salaryLinkFor(request.memberId),
  }).catch(() => undefined);
}

/**
 * What the approval of `request` wrote on each of its days — `leave` within the allowance,
 * `absent` beyond it. A request approved before the split was recorded wrote `leave` on every day.
 * A half-day request's one day holds `half_leave` within the allowance, `half` beyond it (2026-10-12).
 */
export function approvalMarks(
  request: Pick<LeaveRequest, "fromDate" | "toDate" | "leaveDates" | "absentDates" | "duration">,
): Map<string, LeaveMark> {
  const absent = new Set(request.absentDates || []);
  const half = isHalfDayLeave(request);
  return new Map(requestWorkingDates(request).map((date): [string, LeaveMark] => [
    date,
    absent.has(date) ? (half ? "half" : "absent") : (half ? "half_leave" : "leave"),
  ]));
}

/**
 * Undo a decision, putting the request back to pending.
 *
 * Un-approving clears the attendance overrides the approval wrote, so a mistaken approval cannot
 * leave phantom leave days silently reducing someone's salary — but ONLY a day still holding the
 * mark the approval put there. It used to clear every day of the request, so a day an admin had
 * since corrected by hand (Leave → Present, say) was wiped back to whatever the check-ins said.
 * If a day cannot be read, it is cleared, as before. A half-day request's day is cleared only while it
 * still holds the `half_leave` or `half` its approval wrote (`approvalMarks` reads `duration`).
 */
export async function undoLeaveDecision(
  request: LeaveRequest,
  actor: { uid: string; name?: string },
): Promise<void> {
  if (request.status === "approved") {
    const marks = approvalMarks(request);
    await Promise.all([...marks].map(async ([date, wrote]) => {
      try {
        const snap = await getDoc(doc(db, "attendance", attendanceKey(request.memberId, date)));
        if (!snap.exists()) return;
        if ((snap.data() as { status?: string }).status !== wrote) return; // changed by hand since — keep it
      } catch {
        // Unreadable: clear it, the old behaviour — a phantom leave day costs someone pay.
      }
      await clearAttendanceOverride(request.memberId, date);
    }));
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
    summary: `Undid the ${request.status} decision on ${request.memberName}'s ${isHalfDayLeave(request) ? "half-day leave" : "leave"} ${request.fromDate}`,
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
    summary: `${request.memberName} withdrew their ${isHalfDayLeave(request) ? "half-day leave" : "leave"} request for ${request.fromDate}`,
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
