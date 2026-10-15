/**
 * Which pay period an Accounts salary receipt (`salary_receipts`) pays.
 *
 * ── Why this is not just the label (2026-10-15) ───────────────────────────────────────────────
 * A receipt names its period twice: `month`, the printed label ("September 2026 (10 Sep – 09 Oct)"),
 * and since 2026-10-09 `period` ("2026-09"). Between 2026-08-01 and 2026-10-10 Salary Management
 * pre-filled the period RUNNING on the day it was sent, and there was no `period` field. A cycle is paid
 * after it ends, so the receipt for August's salary, sent on payday 10 Sep, went out labelled September —
 * and Payroll then showed September "Receipt sent" and August nothing.
 *
 * Read without a migration: a receipt with no `period` whose labelled period had not ended when it was
 * sent (sent BEFORE that period's last day) belongs to the period before it. A receipt sent on or after
 * the last day keeps its label — on 9 Oct the period due is September itself (`salaryMonthDue`), and a
 * receipt for an earlier period that the accountant picked by hand ("August", sent 10 Sep) is already
 * right. Only the bracketed labels of that window are moved: the older "July 2026" labels (before
 * 2026-08-01) named a calendar month and never defaulted to the running cycle, and a receipt with no
 * send time cannot be placed, so both keep their label.
 *
 * Pure: no Firestore.
 */
import { format } from "date-fns";
import { payPeriodForMonth, shiftPayMonth } from "@/utils/payrollEngine";
import { DEFAULT_PAYROLL_CONFIG } from "@/types/payroll";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** The `yyyy-MM` a printed label names ("September 2026 (10 Sep – 09 Oct)" → "2026-09"), or null. */
export function periodFromLabel(label: string | null | undefined): string | null {
  const m = /^\s*([A-Za-z]+)\s+(\d{4})/.exec(label || "");
  if (!m) return null;
  const index = MONTHS.indexOf(m[1].toLowerCase());
  if (index < 0) return null;
  return `${m[2]}-${String(index + 1).padStart(2, "0")}`;
}

export interface ReceiptLike {
  period?: string | null;
  month?: string | null;
  sentAt?: { seconds?: number } | null;
}

/** The pay period (`yyyy-MM`) a receipt pays, or null when it cannot be read at all. */
export function receiptPeriodOf(
  receipt: ReceiptLike,
  cycleStartDay: number = DEFAULT_PAYROLL_CONFIG.payDayOfMonth,
): string | null {
  if (receipt.period && /^\d{4}-\d{2}$/.test(receipt.period)) return receipt.period;
  const labelled = periodFromLabel(receipt.month);
  if (!labelled) return null;
  // Only the "Month yyyy (dd Mon – dd Mon)" labels came from the running-period default.
  const bracketed = /\(.+\)/.test(receipt.month || "");
  const seconds = receipt.sentAt?.seconds;
  if (!bracketed || typeof seconds !== "number") return labelled;
  const sentDay = format(new Date(seconds * 1000), "yyyy-MM-dd");
  const { end } = payPeriodForMonth(labelled, cycleStartDay);
  return sentDay < end ? shiftPayMonth(labelled, -1) : labelled;
}
