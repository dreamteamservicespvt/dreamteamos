import {
  collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { recordAudit } from "./auditLog";
import { attendanceKey, resolveStatus, todayDate, type AttendanceStatus } from "./techAttendance";
import { computeSalary, payPeriodForMonth, periodDates } from "@/utils/payrollEngine";
import { sendNotification } from "./notifications";
import type {
  PayoutMethod, PayrollConfig, PayrollLine, PayrollRun,
  PaymentStatus, ResolvedDay, SalaryComputation,
} from "@/types/payroll";
import type { AppUser } from "@/types";

/**
 * Salary payment records.
 *
 * Salaries are derived live from attendance, so nothing needs "generating". A `payroll_lines`
 * doc is written only when the admin actually pays someone — it records what was paid, when,
 * how, and against which computation, freezing that snapshot so a payslip reissued years later
 * shows exactly what was transferred.
 *
 * Every payment can be undone. Reversal is a first-class action, not an edge case, because the
 * cost of a mis-click here is someone's salary being wrong.
 */

export const runId = (month: string) => month;
export const lineId = (month: string, memberId: string) => `${month}_${memberId}`;

// ─── Reading ────────────────────────────────────────────────────────────────

/** Live payroll run for a month, or null if it hasn't been generated yet. */
export function watchPayrollRun(month: string, cb: (run: PayrollRun | null) => void): () => void {
  return onSnapshot(
    doc(db, "payroll_runs", runId(month)),
    snap => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as PayrollRun) : null),
    error => {
      console.error("Payroll run listener failed:", error);
      cb(null);
    },
  );
}

/** Live payroll lines for a month, keyed by member id. */
export function watchPayrollLines(month: string, cb: (byMember: Map<string, PayrollLine>) => void): () => void {
  return onSnapshot(
    query(collection(db, "payroll_lines"), where("month", "==", month)),
    snap => {
      const map = new Map<string, PayrollLine>();
      snap.docs.forEach(d => {
        const line = { id: d.id, ...d.data() } as PayrollLine;
        map.set(line.memberId, line);
      });
      cb(map);
    },
    error => {
      console.error("Payroll lines listener failed:", error);
      cb(new Map());
    },
  );
}

/** Every payroll line for one employee, newest month first — their salary history. */
export function watchMemberPayrollHistory(memberId: string, cb: (lines: PayrollLine[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "payroll_lines"), where("memberId", "==", memberId)),
    snap => {
      const lines = snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollLine));
      lines.sort((a, b) => b.month.localeCompare(a.month));
      cb(lines);
    },
    error => {
      console.error("Payroll history listener failed:", error);
      cb([]);
    },
  );
}

// ─── Month-wide computation ─────────────────────────────────────────────────

/** The three attendance sources for a month, fetched once and reused for every employee. */
export interface MonthAttendance {
  overrides: Map<string, AttendanceStatus>;
  holidays: Set<string>;
  checkedIn: Set<string>;
}

/**
 * One fetch of everything needed to price a whole pay period — 3 reads regardless of headcount.
 * Scoped by date range, not month, because the cycle runs 10th→9th across two calendar months.
 */
export async function fetchMonthAttendance(month: string, cycleStartDay?: number): Promise<MonthAttendance> {
  const period = payPeriodForMonth(month, cycleStartDay);
  const range = [where("date", ">=", period.start), where("date", "<=", period.end)];

  const [overrideSnap, holidaySnap, checkinSnap] = await Promise.all([
    getDocs(query(collection(db, "attendance"), ...range)),
    getDocs(query(collection(db, "holidays"), ...range)),
    getDocs(query(collection(db, "daily_checkins"), ...range)),
  ]);

  const overrides = new Map<string, AttendanceStatus>();
  overrideSnap.docs.forEach(d => {
    const a = d.data() as { memberId?: string; date?: string; status?: AttendanceStatus };
    if (a.memberId && a.date && a.status) overrides.set(attendanceKey(a.memberId, a.date), a.status);
  });

  const holidays = new Set(holidaySnap.docs.map(d => d.id));

  const checkedIn = new Set<string>();
  checkinSnap.docs.forEach(d => {
    const c = d.data() as { memberId?: string; date?: string };
    if (c.memberId && c.date) checkedIn.add(attendanceKey(c.memberId, c.date));
  });

  return { overrides, holidays, checkedIn };
}

/** Resolve one employee's day-by-day attendance across a pay period. */
export function resolveMemberDays(
  memberId: string,
  month: string,
  attendance: MonthAttendance,
  todayStr: string,
  cycleStartDay?: number,
): ResolvedDay[] {
  return periodDates(payPeriodForMonth(month, cycleStartDay)).map(date => ({
    date,
    status: resolveStatus({
      override: attendance.overrides.get(attendanceKey(memberId, date)),
      checkedIn: attendance.checkedIn.has(attendanceKey(memberId, date)),
      dateStr: date,
      hasFestivalHoliday: attendance.holidays.has(date),
      todayStr,
    }),
  }));
}

/**
 * Price a pay period for one employee. The single place both the live admin table and any
 * server-side job go through, so two views of the same salary can never disagree.
 */
export function computeMemberSalary(
  member: Pick<AppUser, "uid" | "salary">,
  month: string,
  attendance: MonthAttendance,
  config: PayrollConfig,
  todayStr = todayDate(),
): SalaryComputation {
  const period = payPeriodForMonth(month, config.payDayOfMonth);
  // Pass the real date: once a period has closed every one of its days is already in the past,
  // so elapsed/remaining and past/today/future all resolve correctly without clamping.
  return computeSalary({
    month,
    monthlySalary: member.salary || 0,
    days: resolveMemberDays(member.uid, month, attendance, todayStr, config.payDayOfMonth),
    todayStr,
    config,
    period,
  });
}

// ─── Paying ─────────────────────────────────────────────────────────────────

export interface PaySalaryInput {
  month: string;
  member: Pick<AppUser, "uid" | "name" | "salary">;
  /** What is actually being transferred, after deductions. */
  netSalary: number;
  /** The computation this payment settles — frozen onto the record for the payslip. */
  computation: SalaryComputation;
}

export interface PaySalaryExtras {
  transactionId?: string;
  receiptUrl?: string;
  receiptName?: string;
  paidVia?: PayoutMethod;
}

/**
 * Record a salary payment. Safe to call again to attach a receipt or correct a reference —
 * it merges onto the same document rather than creating a second payment record.
 */
export async function markSalaryPaid(
  input: PaySalaryInput,
  actor: { uid: string; name?: string },
  extras: PaySalaryExtras = {},
): Promise<void> {
  const { month, member, netSalary, computation } = input;

  await setDoc(
    doc(db, "payroll_lines", lineId(month, member.uid)),
    {
      month,
      memberId: member.uid,
      memberName: member.name,
      monthlySalary: member.salary || 0,
      netSalary,
      computation,
      paymentStatus: "completed" satisfies PaymentStatus,
      paidAt: serverTimestamp(),
      paidBy: actor.uid,
      ...(extras.transactionId ? { transactionId: extras.transactionId } : {}),
      ...(extras.receiptUrl ? { receiptUrl: extras.receiptUrl } : {}),
      ...(extras.receiptName ? { receiptName: extras.receiptName } : {}),
      ...(extras.paidVia ? { paidVia: extras.paidVia } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await recordAudit({
    action: "payroll_paid",
    actor,
    target: { id: member.uid, name: member.name },
    month,
    summary: `Paid ${member.name} ₹${Math.round(netSalary).toLocaleString("en-IN")} for ${month}`,
    after: { netSalary, ...extras },
  });

  await sendNotification({
    userId: member.uid,
    type: "salary_paid",
    title: "Salary Paid",
    message: `Your salary of ₹${Math.round(netSalary).toLocaleString("en-IN")} for ${month} has been paid.`,
    link: "/tech/salary",
  }).catch(() => undefined);
}

/**
 * Reverse a recorded payment.
 *
 * Deletes the record outright rather than flipping a status flag: a payment that didn't happen
 * should leave no trace on the employee's salary screen. The audit log keeps the history of both
 * the payment and its reversal, so nothing is actually lost.
 */
export async function undoSalaryPayment(
  line: PayrollLine,
  actor: { uid: string; name?: string },
): Promise<void> {
  await deleteDoc(doc(db, "payroll_lines", lineId(line.month, line.memberId)));

  await recordAudit({
    action: "payroll_reopened",
    actor,
    target: { id: line.memberId, name: line.memberName },
    month: line.month,
    summary: `Undid ₹${Math.round(line.netSalary).toLocaleString("en-IN")} payment to ${line.memberName} for ${line.month}`,
    before: {
      netSalary: line.netSalary,
      transactionId: line.transactionId ?? null,
      receiptUrl: line.receiptUrl ?? null,
    },
  });

  await sendNotification({
    userId: line.memberId,
    type: "salary_updated",
    title: "Salary Payment Reversed",
    message: `The recorded payment for ${line.month} was reversed by an admin. Please check with them if this is unexpected.`,
    link: "/tech/salary",
  }).catch(() => undefined);
}
