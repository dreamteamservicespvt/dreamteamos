import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { recordAudit } from "./auditLog";
import { attendanceKey, isCheckInRecord, resolveStatus, todayDate, type AttendanceStatus } from "./techAttendance";
import { fetchPayrollConfig } from "./payroll";
import { commissionRate } from "./settlements";
import { computeSalary, netPayable, payPeriodForMonth, payPeriodLabel, periodDates } from "@/utils/payrollEngine";
import { salesIncentive, salesInPeriod } from "@/utils/salesPay";
import { dailyTargetOf } from "@/utils/salesTargets";
import { getSalaryRoute } from "@/utils/roleHelpers";
import { sendNotification } from "./notifications";
import type {
  PayoutMethod, PayrollConfig, PayrollLine, PayrollLineIncentive, PayrollRun,
  PaymentStatus, ResolvedDay, SalaryComputation,
} from "@/types/payroll";
import type { AppUser, Lead } from "@/types";

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

/**
 * Has this salary actually been paid?
 *
 * The ONE test. `markSalaryPaid` writes `completed`; `transferred` is the other paid stage of the
 * type. The Payroll page tested `completed` while its own totals tested both, so a line could be
 * "Pending" in the row and counted in "Paid" above it.
 */
export function isLinePaid(line: Pick<PayrollLine, "paymentStatus"> | null | undefined): boolean {
  return !!line && (line.paymentStatus === "completed" || line.paymentStatus === "transferred");
}

/** Live payroll run for a month, or null if it hasn't been generated yet. */
export function watchPayrollRun(
  month: string,
  cb: (run: PayrollRun | null) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "payroll_runs", runId(month)),
    snap => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as PayrollRun) : null),
    error => {
      console.error("Payroll run listener failed:", error);
      if (onError) onError(error); else cb(null);
    },
  );
}

/**
 * Live payroll lines for a month, keyed by member id.
 *
 * With `onError`, a failed read is reported rather than turned into "nobody has been paid" — which
 * on the Payroll page would offer to pay, a second time, everyone already paid.
 */
export function watchPayrollLines(
  month: string,
  cb: (byMember: Map<string, PayrollLine>) => void,
  onError?: (error: unknown) => void,
): () => void {
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
      if (onError) onError(error); else cb(new Map());
    },
  );
}

/**
 * Live: one member's payment record for one period, or null while unpaid.
 *
 * A single document (`payroll_lines/{month}_{uid}`), so the member's own salary page can show what
 * was actually paid for a period — the same record the Payroll page shows — for one read.
 */
export function watchPayrollLine(
  month: string,
  memberId: string,
  cb: (line: PayrollLine | null) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "payroll_lines", lineId(month, memberId)),
    snap => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as PayrollLine) : null),
    error => {
      console.error("Payroll line listener failed:", error);
      if (onError) onError(error); else cb(null);
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

  // Two check-in collections, because the sales side writes its own — see
  // `watchCheckedInDaysInRange`. Missing the second one scored every sales member Absent.
  const [overrideSnap, holidaySnap, checkinSnap, salesCheckinSnap] = await Promise.all([
    getDocs(query(collection(db, "attendance"), ...range)),
    getDocs(query(collection(db, "holidays"), ...range)),
    getDocs(query(collection(db, "daily_checkins"), ...range)),
    getDocs(query(collection(db, "salesCheckins"), ...range)),
  ]);

  const overrides = new Map<string, AttendanceStatus>();
  overrideSnap.docs.forEach(d => {
    const a = d.data() as { memberId?: string; date?: string; status?: AttendanceStatus };
    if (a.memberId && a.date && a.status) overrides.set(attendanceKey(a.memberId, a.date), a.status);
  });

  const holidays = new Set(holidaySnap.docs.map(d => d.id));

  // The same "is this a check-in" rule the live listener uses — a sales record a late check-out
  // wrote for the next day is not one (see techAttendance.isCheckInRecord).
  const checkedIn = new Set<string>();
  const collect = (source: "daily_checkins" | "salesCheckins") => (d: { data: () => unknown }) => {
    const c = d.data();
    if (isCheckInRecord(source, c)) checkedIn.add(attendanceKey(c.memberId, c.date));
  };
  checkinSnap.docs.forEach(collect("daily_checkins"));
  salesCheckinSnap.docs.forEach(collect("salesCheckins"));

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

/** What a member is owed for a period, priced on demand — for Accounts' Salary Management. */
export interface PeriodPay {
  /** Salary less attendance deductions, plus a sales member's incentive. */
  amount: number;
  salaryPayable: number;
  incentive: number;
  /** The attendance computation — null for a role the attendance system does not cover. */
  computation: SalaryComputation | null;
  /** The payment Payroll has already recorded for this period, if any. */
  paidLine: PayrollLine | null;
}

/** Roles whose salary is priced from attendance — the people Payroll and Sales Payroll pay. */
export function isAttendancePaid(member: Pick<AppUser, "role" | "externalCreator">): boolean {
  return (member.role === "tech_member" && !member.externalCreator) || member.role === "sales_member";
}

/**
 * Price one member's pay period exactly as Payroll / Sales Payroll would, on demand.
 *
 * ── Why (2026-10-09) ──────────────────────────────────────────────────────────────────────────
 * Salary Management's "Send Receipt" pre-filled the full monthly salary whatever the attendance,
 * and could not see that Payroll had already paid the period — a separate, conflicting figure for
 * the same salary, and a standing invitation to pay it twice. It now starts from this: the same
 * engine, the same attendance reads, the same incentive rule, and the payment already recorded.
 *
 * A role the attendance system does not cover (admins, accounts, team leaders) is its monthly
 * salary, as before. One read of the period's attendance (the four range queries Payroll uses),
 * the policy, the payment record, and — for a sales member — their own leads.
 */
export async function priceMemberForPeriod(member: AppUser, month: string): Promise<PeriodPay> {
  const config = await fetchPayrollConfig();
  const lineSnap = await getDoc(doc(db, "payroll_lines", lineId(month, member.uid)));
  const line = lineSnap.exists() ? ({ id: lineSnap.id, ...lineSnap.data() } as PayrollLine) : null;
  const paidLine = isLinePaid(line) ? line : null;

  if (!isAttendancePaid(member)) {
    const salary = member.salary || 0;
    return { amount: salary, salaryPayable: salary, incentive: 0, computation: null, paidLine };
  }

  const attendance = await fetchMonthAttendance(month, config.payDayOfMonth);
  const computation = computeMemberSalary(member, month, attendance, config);
  const salaryPayable = netPayable(computation);

  let incentive = 0;
  if (member.role === "sales_member") {
    const period = payPeriodForMonth(month, config.payDayOfMonth);
    const snap = await getDocs(query(collection(db, "leads"), where("assignedTo", "==", member.uid)));
    const leads = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
    const sales = salesInPeriod(leads, period.start, period.end);
    incentive = salesIncentive({
      salesBase: sales.salesBase,
      rate: commissionRate(member.earningsOption),
      dailyTarget: dailyTargetOf(member),
      periodStart: period.start,
    }).commission;
  }

  return { amount: salaryPayable + incentive, salaryPayable, incentive, computation, paidLine };
}

// ─── Paying ─────────────────────────────────────────────────────────────────

export interface PaySalaryInput {
  month: string;
  member: Pick<AppUser, "uid" | "name" | "salary"> & Partial<Pick<AppUser, "role">>;
  /** What is actually being transferred, after deductions. */
  netSalary: number;
  /** The computation this payment settles — frozen onto the record for the payslip. */
  computation: SalaryComputation;
  /** A sales member's incentive inside `netSalary`, frozen with it so the slip can itemise it. */
  incentive?: PayrollLineIncentive;
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
      ...(member.role ? { memberRole: member.role } : {}),
      // The salary this payment was priced on — the computation's, not whatever the profile says
      // now: an edit to the salary between pricing and paying must not split the record in two.
      monthlySalary: computation.monthlySalary ?? (member.salary || 0),
      netSalary,
      computation,
      ...(input.incentive ? { incentive: input.incentive } : {}),
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
    message: `Your salary of ₹${Math.round(netSalary).toLocaleString("en-IN")} for ${payPeriodLabel(month)} has been paid.`,
    link: getSalaryRoute(member.role),
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
    message: `The recorded payment for ${payPeriodLabel(line.month)} was reversed by an admin. Please check with them if this is unexpected.`,
    link: getSalaryRoute(line.memberRole),
  }).catch(() => undefined);
}
