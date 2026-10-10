import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where,
} from "firebase/firestore";
import { db } from "./firebase";

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
 * receipts carry only `month`, the printed label ("July 2026 (10 Jul – 09 Aug)"), and are matched
 * on that.
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

/**
 * Live: the receipts that pay one pay period, keyed by member.
 *
 * Matched on `period` (new receipts) OR the printed label (older ones) — two equality queries, so
 * neither needs a composite index.
 */
export function watchPeriodReceipts(
  period: string,
  periodLabel: string,
  cb: (byMember: Map<string, SalaryReceipt[]>) => void,
): () => void {
  let byPeriod: SalaryReceipt[] = [];
  let byLabel: SalaryReceipt[] = [];
  const emit = () => {
    const seen = new Set<string>();
    const map = new Map<string, SalaryReceipt[]>();
    for (const r of [...byPeriod, ...byLabel].sort(newestFirst)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      map.set(r.userId, [...(map.get(r.userId) || []), r]);
    }
    cb(map);
  };
  const unsubs = [
    onSnapshot(
      query(collection(db, "salary_receipts"), where("period", "==", period)),
      snap => { byPeriod = snap.docs.map(toReceipt); emit(); },
      error => { console.error("Period receipts listener failed:", error); },
    ),
    onSnapshot(
      query(collection(db, "salary_receipts"), where("month", "==", periodLabel)),
      snap => { byLabel = snap.docs.map(toReceipt); emit(); },
      error => { console.error("Period receipts listener failed:", error); },
    ),
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
