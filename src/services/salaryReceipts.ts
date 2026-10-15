import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { payPeriodLabel, shiftPayMonth } from "@/utils/payrollEngine";
import { receiptPeriodOf } from "@/utils/receiptPeriod";
import { DEFAULT_PAYROLL_CONFIG } from "@/types/payroll";

/**
 * Salary receipts — what the accounts admin records from Salary Management ("Send Receipt"):
 * an amount, the period it pays, and the proof of transfer.
 *
 * ── Why this module (2026-10-09) ──────────────────────────────────────────────────────────────
 * A salary can be recorded as paid in two places: the tech / sales admin's Payroll ("Mark paid",
 * `payroll_lines`) and the accounts admin's Salary Management (`salary_receipts`). Each used to be
 * blind to the other — Salary Management pre-filled the full monthly salary whatever the
 * attendance, and showed "Not sent" for a salary Payroll had already paid; the member's payment
 * history showed only receipts. The two records stay separate, but every screen now reads both, so
 * a second payment for the same period is always seen before it is made.
 *
 * `period` (the `yyyy-MM` pay-period label, 2026-10-09) is what links a receipt to Payroll. Older
 * receipts carry only `month`, the printed label ("July 2026 (10 Jul – 09 Aug)") — and those sent
 * 2026-08-01 → 2026-10-10 printed the period RUNNING on the send day, one after the one they paid.
 * Which period a receipt pays is therefore always `utils/receiptPeriod.receiptPeriodOf` (2026-10-15),
 * never its label as written.
 */
export interface SalaryReceipt {
  id: string;
  userId: string;
  amount: number;
  /** The period as printed — "July 2026 (10 Jul – 09 Aug)". */
  month: string;
  /** The pay period's `yyyy-MM` label. Absent on receipts sent before 2026-10-09. */
  period?: string;
  note?: string;
  fileUrl?: string;
  fileName?: string;
  sentBy: string;
  sentAt?: { seconds?: number } | null;
}

const toReceipt = (d: { id: string; data: () => unknown }): SalaryReceipt =>
  ({ id: d.id, ...(d.data() as Omit<SalaryReceipt, "id">) });

const newestFirst = (a: SalaryReceipt, b: SalaryReceipt) => (b.sentAt?.seconds || 0) - (a.sentAt?.seconds || 0);

/** Live: one member's receipts, newest first. */
export function watchMemberReceipts(userId: string, cb: (receipts: SalaryReceipt[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "salary_receipts"), where("userId", "==", userId)),
    snap => cb(snap.docs.map(toReceipt).sort(newestFirst)),
    error => { console.error("Salary receipts listener failed:", error); cb([]); },
  );
}

/** The period a receipt pays, printed — "August 2026 (10 Aug – 09 Sep)" — or its own label if unreadable. */
export function receiptPeriodText(r: Pick<SalaryReceipt, "period" | "month" | "sentAt">, cycleStartDay?: number): string {
  const period = receiptPeriodOf(r, cycleStartDay);
  return period ? payPeriodLabel(period, cycleStartDay) : (r.month || "");
}

/**
 * Live: the receipts that pay one pay period, keyed by member.
 *
 * Three equality queries, so none needs a composite index: `period` (new receipts), and the printed
 * label of this period AND of the next one (an older receipt labelled with the period running when it
 * was sent — see `utils/receiptPeriod`). Every candidate is then kept only if `receiptPeriodOf` says it
 * pays THIS period, so a receipt sent on payday for last month's salary moves to last month.
 */
export function watchPeriodReceipts(
  period: string,
  cb: (byMember: Map<string, SalaryReceipt[]>) => void,
  cycleStartDay: number = DEFAULT_PAYROLL_CONFIG.payDayOfMonth,
): () => void {
  const sources: SalaryReceipt[][] = [[], [], []];
  const emit = () => {
    const seen = new Set<string>();
    const map = new Map<string, SalaryReceipt[]>();
    for (const r of sources.flat().sort(newestFirst)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      if (receiptPeriodOf(r, cycleStartDay) !== period) continue;
      map.set(r.userId, [...(map.get(r.userId) || []), r]);
    }
    cb(map);
  };
  const listen = (index: number, field: "period" | "month", value: string) => onSnapshot(
    query(collection(db, "salary_receipts"), where(field, "==", value)),
    snap => { sources[index] = snap.docs.map(toReceipt); emit(); },
    error => { console.error("Period receipts listener failed:", error); },
  );
  const unsubs = [
    listen(0, "period", period),
    listen(1, "month", payPeriodLabel(period, cycleStartDay)),
    listen(2, "month", payPeriodLabel(shiftPayMonth(period, 1), cycleStartDay)),
  ];
  return () => unsubs.forEach(u => u());
}

/** Record a receipt. `period` is the pay period it pays; `month` is that period printed. */
export async function addSalaryReceipt(input: {
  userId: string;
  amount: number;
  period: string;
  month: string;
  note: string;
  fileUrl: string;
  fileName: string;
  sentBy: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, "salary_receipts"), { ...input, sentAt: serverTimestamp() });
  return ref.id;
}

export async function deleteSalaryReceipt(id: string): Promise<void> {
  await deleteDoc(doc(db, "salary_receipts", id));
}
