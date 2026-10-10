import { useEffect, useMemo, useState } from "react";
import { watchMemberReceipts, type SalaryReceipt } from "@/services/salaryReceipts";
import { isLinePaid, watchMemberPayrollHistory } from "@/services/payrollRun";
import { payPeriodLabel } from "@/utils/payrollEngine";
import type { PayrollLine } from "@/types/payroll";

/** One payment a member received, wherever it was recorded. */
export interface SalaryPayment {
  id: string;
  /** `payroll` = marked paid in Payroll / Sales Payroll; `receipt` = sent by Accounts from Salary Management. */
  source: "payroll" | "receipt";
  amount: number;
  /** The period it pays, as printed — "July 2026 (10 Jul – 09 Aug)". */
  periodText: string;
  note?: string;
  fileUrl?: string;
  fileName?: string;
  at: Date | null;
}

const secondsOf = (t: unknown): number | null => {
  const s = (t as { seconds?: number } | null | undefined)?.seconds;
  return typeof s === "number" ? s : null;
};

/** Both records as one list, newest first. Pure — exported for its test. */
export function mergeSalaryPayments(receipts: SalaryReceipt[], lines: PayrollLine[]): SalaryPayment[] {
  const fromReceipts: SalaryPayment[] = receipts.map(r => ({
    id: `receipt_${r.id}`,
    source: "receipt",
    amount: r.amount || 0,
    periodText: r.month || (r.period ? payPeriodLabel(r.period) : ""),
    note: r.note || undefined,
    fileUrl: r.fileUrl,
    fileName: r.fileName,
    at: secondsOf(r.sentAt) !== null ? new Date(secondsOf(r.sentAt)! * 1000) : null,
  }));
  const fromPayroll: SalaryPayment[] = lines.filter(l => isLinePaid(l)).map(l => ({
    id: `payroll_${l.id}`,
    source: "payroll",
    amount: l.netSalary || 0,
    periodText: payPeriodLabel(l.month),
    note: l.transactionId ? `Txn ${l.transactionId}` : undefined,
    fileUrl: l.receiptUrl,
    fileName: l.receiptName,
    at: secondsOf(l.paidAt) !== null ? new Date(secondsOf(l.paidAt)! * 1000) : null,
  }));
  return [...fromReceipts, ...fromPayroll].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
}

/**
 * A member's payment history: Accounts' receipts AND the salaries marked paid in Payroll.
 *
 * ── Why (2026-10-09) ──────────────────────────────────────────────────────────────────────────
 * "Payment history" and "Salary History" read only `salary_receipts`, so a salary the admin paid
 * from Payroll (`payroll_lines`) never appeared there — the member was paid and their history said
 * nothing had arrived. Each entry says where it was recorded.
 */
export function useSalaryPayments(userId: string | undefined): { loading: boolean; payments: SalaryPayment[] } {
  const [receipts, setReceipts] = useState<SalaryReceipt[] | null>(null);
  const [lines, setLines] = useState<PayrollLine[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    const unsubs = [
      watchMemberReceipts(userId, setReceipts),
      watchMemberPayrollHistory(userId, setLines),
    ];
    return () => unsubs.forEach(u => u());
  }, [userId]);

  const payments = useMemo(() => mergeSalaryPayments(receipts || [], lines || []), [receipts, lines]);
  return { loading: receipts === null || lines === null, payments };
}
