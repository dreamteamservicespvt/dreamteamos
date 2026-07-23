import type { FieldValue, Timestamp } from "firebase/firestore";
import type { AttendanceStatus } from "@/services/techAttendance";

/**
 * A Firestore timestamp field: a `Timestamp` when read back, the `serverTimestamp()` sentinel
 * when written. Named rather than `any` so the payroll model stays typed end to end.
 */
export type FirestoreTime = Timestamp | FieldValue;

/**
 * Payroll domain model.
 *
 * Designed around one rule: **the monthly figure an employee sees is always derived, never
 * stored** — right up until a payroll run is locked, at which point the computation is frozen
 * onto the run so history can never silently change when attendance is edited later.
 *
 * Collections
 *   salary_packages   — named salary tiers; employees reference one by id
 *   payroll_config    — singleton policy doc (pay day, leave quota, holiday-paid rule)
 *   employee_bank     — one doc per employee, id = uid
 *   leave_requests    — employee-submitted leave, approved by admin/lead
 *   payroll_runs      — one per month, holds the lifecycle state
 *   payroll_lines     — one per employee per run, frozen at lock time
 *   audit_logs        — append-only record of every payroll-affecting action
 *
 * Existing collections this builds on (unchanged): users, attendance, holidays, daily_checkins.
 */

// ─── Salary packages ────────────────────────────────────────────────────────

/**
 * A named salary tier (₹5,000 / ₹8,000 / …). Unlimited packages; an employee references one by
 * id so raising a package raises everyone on it, and history stays correct because locked
 * payroll lines snapshot the amount they were computed with.
 */
export interface SalaryPackage {
  id: string;
  name: string;
  /** Gross monthly amount in rupees. */
  monthlyAmount: number;
  /** Optional grouping for department-level reporting. */
  department?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: FirestoreTime;
  updatedAt?: FirestoreTime;
}

// ─── Policy ─────────────────────────────────────────────────────────────────

/**
 * Company-wide payroll policy. Everything the engine treats as a rule lives here rather than in
 * code, so changing policy never means changing a formula.
 */
export interface PayrollConfig {
  /** Day of month salaries are paid. Company default: the 10th. */
  payDayOfMonth: number;
  /** Paid leaves granted per employee per month; the rest become leave-without-pay. */
  paidLeaveQuota: number;
  /** Fraction of a day's salary a half day earns. */
  halfDayFactor: number;
  /**
   * Whether an announced festival/company holiday is paid.
   *
   * Company policy: **paid**. A holiday is the company choosing to close, so an employee who was
   * ready to work must not lose a day's salary for it. Kept configurable rather than hardcoded so
   * the rule stays visible and reversible, but it should not be turned off casually.
   */
  holidaysPaid: boolean;
  /**
   * Whether Sundays are excluded from working days. Always true today — kept explicit so a
   * six-day/seven-day cycle can be introduced without rewriting the engine.
   */
  excludeSundays: boolean;
  updatedBy?: string;
  updatedAt?: FirestoreTime;
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  payDayOfMonth: 10,
  paidLeaveQuota: 2,
  halfDayFactor: 0.5,
  holidaysPaid: true,
  excludeSundays: true,
};

// ─── Bank / payout details ──────────────────────────────────────────────────

export type PayoutMethod = "upi" | "phonepe" | "google_pay" | "paytm" | "bank_transfer";

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  upi: "UPI",
  phonepe: "PhonePe",
  google_pay: "Google Pay",
  paytm: "Paytm",
  bank_transfer: "Bank Transfer",
};

/**
 * One way to pay an employee. An employee may keep several — a UPI id, a wallet number, a bank
 * account — and mark one as primary; that's the one payroll uses by default.
 */
export interface PayoutAccount {
  /** Client-generated stable id. */
  id: string;
  method: PayoutMethod;
  accountHolderName: string;
  /** UPI id or the phone number the wallet is registered to. */
  upiId?: string;
  phoneNumber?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  qrCodeUrl?: string;
  /** Optional note, e.g. "Salary account" vs "Personal". */
  label?: string;
  /** The account payroll pays into unless told otherwise. Exactly one should be true. */
  isPrimary: boolean;
  /**
   * Admin-verified. A verified account is locked to the employee, so a payout target can't be
   * swapped between approval and transfer.
   */
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: FirestoreTime;
}

/**
 * Payout details, one doc per employee (`employee_bank/{uid}`).
 *
 * The legacy single-method fields are still read so existing records keep working — see
 * services/payroll.normalizeBank, which folds them into `accounts` on the way in.
 */
export interface EmployeeBank {
  uid: string;
  accounts: PayoutAccount[];
  updatedAt?: FirestoreTime;

  /** @deprecated Legacy single-account shape; migrated on read. */
  method?: PayoutMethod;
  /** @deprecated */ accountHolderName?: string;
  /** @deprecated */ upiId?: string;
  /** @deprecated */ phoneNumber?: string;
  /** @deprecated */ bankName?: string;
  /** @deprecated */ accountNumber?: string;
  /** @deprecated */ ifsc?: string;
  /** @deprecated */ verified?: boolean;
}

/** Which fields a given payout method actually requires. Drives both the form and validation. */
export const REQUIRED_BANK_FIELDS: Record<PayoutMethod, (keyof PayoutAccount)[]> = {
  upi: ["accountHolderName", "upiId"],
  phonepe: ["accountHolderName", "phoneNumber"],
  google_pay: ["accountHolderName", "phoneNumber"],
  paytm: ["accountHolderName", "phoneNumber"],
  bank_transfer: ["accountHolderName", "bankName", "accountNumber", "ifsc"],
};

// ─── Leave ──────────────────────────────────────────────────────────────────

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveKind = "paid" | "unpaid" | "half_day";

export interface LeaveRequest {
  id: string;
  memberId: string;
  memberName: string;
  /** yyyy-MM-dd; inclusive range. Single-day leave has fromDate === toDate. */
  fromDate: string;
  toDate: string;
  /** Denormalised for month queries — the month of `fromDate`. */
  month: string;
  kind: LeaveKind;
  reason: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: FirestoreTime;
  reviewNote?: string;
  createdAt: FirestoreTime;
}

// ─── Payroll lifecycle ──────────────────────────────────────────────────────

/**
 * Payroll run stages, in order. A run only ever moves forward except for an explicit
 * `reopen`, which is itself audit-logged.
 */
export type PayrollRunStatus =
  | "draft"        // generated, figures still live
  | "review"       // admin reviewing
  | "approved"     // signed off, figures frozen onto lines
  | "locked"       // no further edits permitted
  | "processing"   // transfers initiated
  | "paid"         // all transfers done
  | "completed";   // reconciled and closed

export const PAYROLL_RUN_STAGES: PayrollRunStatus[] = [
  "draft", "review", "approved", "locked", "processing", "paid", "completed",
];

/** Per-employee payment state within a run. */
export type PaymentStatus =
  | "pending"
  | "approved"
  | "processing"
  | "transferred"
  | "completed"
  | "failed"
  | "cancelled"
  | "recalculation_required";

export interface PayrollRun {
  /** Document id is the month, `yyyy-MM`, so a month can only ever have one run. */
  id: string;
  month: string;
  status: PayrollRunStatus;
  /** Policy snapshot the run was generated under — locked history stays explainable. */
  config: PayrollConfig;
  employeeCount: number;
  totalAmount: number;
  generatedBy: string;
  generatedAt: FirestoreTime;
  approvedBy?: string;
  approvedAt?: FirestoreTime;
  lockedBy?: string;
  lockedAt?: FirestoreTime;
  paidAt?: FirestoreTime;
  notes?: string;
}

/**
 * One employee's frozen payroll for one month (`payroll_lines/{month}_{uid}`).
 * `computation` is the full engine output, stored verbatim so a salary slip can be regenerated
 * years later without re-deriving anything from attendance.
 */
export interface PayrollLine {
  id: string;
  month: string;
  memberId: string;
  memberName: string;
  packageId?: string;
  monthlySalary: number;
  netSalary: number;
  computation: SalaryComputation;
  paymentStatus: PaymentStatus;
  /** Payout snapshot taken at transfer time. */
  paidVia?: PayoutMethod;
  transactionId?: string;
  paidAt?: FirestoreTime;
  paidBy?: string;
  /** Uploaded proof of transfer (screenshot or PDF), stored on Cloudinary. */
  receiptUrl?: string;
  receiptName?: string;
  failureReason?: string;
  updatedAt?: FirestoreTime;
}

// ─── Engine output ──────────────────────────────────────────────────────────

/** Why a day earned what it earned. One entry per attendance status present in the month. */
export interface SalaryLine {
  /** Stable key for styling/tests. */
  key: SalaryLineKey;
  label: string;
  /** Number of days in this bucket. */
  days: number;
  /** Share of a day's salary each of these days earns (1, 0.5, 0). */
  factor: number;
  /** days × factor × dailySalary, rounded to 2dp. */
  amount: number;
  kind: "earning" | "deduction" | "neutral";
}

export type SalaryLineKey =
  | "full"
  | "half"
  | "paid_leave"
  | "unpaid_leave"
  | "absent"
  | "holiday"
  | "adjustment";

/**
 * A future-ready extra on top of attendance earnings: bonus, incentive, overtime, penalty,
 * advance recovery, tax. The engine treats these uniformly so adding a category is data, not code.
 */
export interface SalaryAdjustment {
  id?: string;
  label: string;
  /** Positive adds, negative deducts. */
  amount: number;
  kind: "bonus" | "incentive" | "overtime" | "penalty" | "advance" | "tax" | "other";
  note?: string;
}

/** The complete, transparent salary calculation for one employee for one month. */
export interface SalaryComputation {
  month: string;
  /** First day this salary covers (`yyyy-MM-dd`) — the cycle is 10th→9th, not a calendar month. */
  periodStart: string;
  /** Last day this salary covers, inclusive. */
  periodEnd: string;
  monthlySalary: number;

  // Calendar — all derived from the real period, never assumed
  /** Days in the pay period. */
  monthDays: number;
  sundays: number;
  /** Announced holidays falling on a non-Sunday working day. */
  holidayCount: number;
  workingDays: number;
  /** monthlySalary ÷ workingDays, unrounded — round only at display/total time. */
  dailySalary: number;

  // Attendance buckets
  fullDays: number;
  halfDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  holidayDays: number;
  /** Working days not yet resolved (today in progress, or still in the future). */
  pendingDays: number;

  /** Working-day credit already earned: full=1, half=0.5, paid leave=1, holiday per policy. */
  earnedDays: number;
  /** Working days already passed, whatever their status. */
  elapsedWorkingDays: number;
  /** workingDays − elapsedWorkingDays. */
  remainingWorkingDays: number;

  // Money
  /** Earned so far from attendance, before adjustments. */
  attendanceEarnings: number;
  adjustmentTotal: number;
  /** Pay if the month ended today. */
  currentSalary: number;
  /** Pay if every remaining working day is a full day — the realistic take-home. */
  projectedSalary: number;
  /** monthlySalary − projectedSalary; what imperfect attendance is costing. */
  projectedDeduction: number;

  /** Attendance % over elapsed working days. */
  attendancePercent: number;
  paidLeaveQuota: number;
  paidLeavesRemaining: number;

  lines: SalaryLine[];
  adjustments: SalaryAdjustment[];
}

/** Per-day resolved attendance the engine consumes. `null` = not yet applicable. */
export type ResolvedDay = { date: string; status: AttendanceStatus | null };

// ─── Audit ──────────────────────────────────────────────────────────────────

export type AuditAction =
  | "attendance_override_set"
  | "attendance_override_cleared"
  | "holiday_created"
  | "holiday_deleted"
  | "leave_submitted"
  | "leave_approved"
  | "leave_rejected"
  | "salary_package_created"
  | "salary_package_updated"
  | "salary_package_assigned"
  | "payroll_generated"
  | "payroll_approved"
  | "payroll_locked"
  | "payroll_reopened"
  | "payroll_paid"
  | "payment_status_changed"
  | "bank_details_updated"
  | "bank_details_verified"
  | "config_updated";

/** Append-only. Never updated, never deleted. */
export interface AuditLog {
  id: string;
  action: AuditAction;
  /** Who performed it. */
  actorId: string;
  actorName: string;
  /** Who/what it was performed on. */
  targetId?: string;
  targetName?: string;
  month?: string;
  /** Human-readable one-liner for the activity feed. */
  summary: string;
  /** Before/after for anything numeric or status-like. */
  before?: unknown;
  after?: unknown;
  createdAt: FirestoreTime;
}
