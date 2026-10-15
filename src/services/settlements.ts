/**
 * Commission settlements — incentive payouts between a sales admin and a sales member.
 *
 * Since 2026-10-15 (owner: "Payroll's rule everywhere") a settlement pays the incentive of ENDED pay
 * periods under the one commission rule (`utils/salesPay`): money collected in the period, at the rate
 * that applied then, only when 75% of that period's target was met — and never a period Sales Payroll
 * has paid, nor a collection a settlement already paid. Each settlement records the periods and the
 * collections it paid (`settlementRecord`).
 */
import {
  collection, addDoc, doc, updateDoc, query, where, serverTimestamp, type Query, type DocumentData,
} from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { formatCurrency } from "@/utils/formatters";
import { payPeriodLabel } from "@/utils/payrollEngine";
import type { CommissionPeriodRow } from "@/utils/salesPay";
import type { AppUser, CommissionSettlement, Lead, SaleDetail } from "@/types";

/** Member commission rate as a whole percent (5 or 10). */
/**
 * Re-exported from `utils/salesIncentive`, which holds the rate itself.
 *
 * The number moved out to a pure module so the offer letter can state it without pulling Firestore
 * into document generation. It is re-exported here because everything that settles money already
 * reads it from this file, and one rate quoted by payroll and a different one printed on the
 * paperwork is the exact failure worth spending an indirection to prevent.
 */
export { SALES_INCENTIVE_PERCENT, commissionRate } from "@/utils/salesIncentive";

function saleItems(lead: Lead): SaleDetail[] {
  return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
}

/** The sale's date ("yyyy-MM-dd") — when the member recorded it, falling back to the lead date. */
function saleDateStr(item: SaleDetail, lead: Lead): string | null {
  const s = (item.submittedAt as any)?.seconds ?? (lead.createdAt as any)?.seconds;
  return s ? format(new Date(s * 1000), "yyyy-MM-dd") : null;
}

// ── Superseded (2026-10-15) ─────────────────────────────────────────────────────────────────────
// `computeCommissionInRange` (a date range, no target gate), the timestamp-cut `computeUnpaidCommission`
// (everything verified since the last settlement's moment — a re-approval re-dated a settled sale and paid
// it again) and `paidThrough` were three of the five commission rules. The one rule is `utils/salesPay`
// (`commissionByPeriod`, `periodIncentive`, `commissionInWindow`).

/** The member's most recent settlement (by payment moment), or null if never settled. */
export function lastSettlementOf(settlements: CommissionSettlement[], memberId: string): CommissionSettlement | null {
  let latest: CommissionSettlement | null = null;
  for (const s of settlements) {
    if (s.memberId !== memberId) continue;
    if (!latest || ((s.paidAt as any)?.seconds || 0) > ((latest.paidAt as any)?.seconds || 0)) latest = s;
  }
  return latest;
}

/** All of a member's sales still awaiting verification — they join a payout automatically
 *  the moment they're verified, so this is purely informational. */
export function countPendingSales(leads: Lead[]): number {
  let pending = 0;
  for (const lead of leads) {
    for (const it of saleItems(lead)) {
      if (it.verificationStatus === "pending") pending++;
    }
  }
  return pending;
}

/** Earliest verified-sale date for a member (the natural start of the very first settlement). */
export function earliestVerifiedSaleDate(leads: Lead[]): string | null {
  let min: string | null = null;
  for (const lead of leads) {
    for (const it of saleItems(lead)) {
      if (it.verificationStatus !== "verified") continue;
      const d = saleDateStr(it, lead);
      if (d && (!min || d < min)) min = d;
    }
  }
  return min;
}

export function totalPaid(settlements: CommissionSettlement[], memberId: string): number {
  return settlements.filter((s) => s.memberId === memberId).reduce((sum, s) => sum + (s.amount || 0), 0);
}

/**
 * What a settlement of these periods records — pure, so the page, the request and the tests agree.
 *
 * ── Why it records keys (2026-10-15) ──
 * A settlement used to be "everything verified since the last one", found again later by comparing each
 * sale's approval stamp with the settlement's moment. Revoking and re-approving a settled sale moved its
 * stamp past that moment, so the next settlement paid it again; and nothing stopped Sales Payroll from
 * paying the same money with the salary. Now a settlement pays whole ended pay periods under the one rule
 * (`utils/salesPay.commissionByPeriod`) and writes down the periods and every collection it paid.
 */
export function settlementRecord(rows: CommissionPeriodRow[]): {
  periods: string[]; paidKeys: string[]; fromDate: string; toDate: string; rate: number; salesBase: number;
  amount: number; saleCount: number; breakdown: { period: string; salesBase: number; rate: number; amount: number }[];
} {
  const paying = rows.filter((r) => r.commission > 0).sort((a, b) => a.period.localeCompare(b.period));
  if (paying.length === 0) throw new Error("Nothing is due to settle.");
  return {
    periods: paying.map((r) => r.period),
    paidKeys: paying.flatMap((r) => r.payableKeys),
    fromDate: paying[0].start,
    toDate: paying[paying.length - 1].end,
    // One figure for the history line; the breakdown keeps each period's own rate.
    rate: paying[paying.length - 1].rate,
    salesBase: paying.reduce((s, r) => s + r.payableBase, 0),
    amount: paying.reduce((s, r) => s + r.commission, 0),
    saleCount: paying.reduce((s, r) => s + r.saleCount, 0),
    breakdown: paying.map((r) => ({ period: r.period, salesBase: r.payableBase, rate: r.rate, amount: r.commission })),
  };
}

/** Record a commission payment for the due periods and notify the member. */
export async function createSettlement(params: {
  member: AppUser;
  admin: AppUser;
  /** The due periods being paid — `commissionByPeriod(...).due`. */
  rows: CommissionPeriodRow[];
  note?: string;
}): Promise<void> {
  const { member, admin, rows, note } = params;
  const record = settlementRecord(rows);
  await addDoc(collection(db, "commission_settlements"), {
    memberId: member.uid,
    memberName: member.name,
    adminId: admin.uid,
    fromDate: record.fromDate,
    toDate: record.toDate,
    commissionRate: record.rate,
    salesBase: record.salesBase,
    amount: record.amount,
    saleCount: record.saleCount,
    periods: record.periods,
    paidKeys: record.paidKeys,
    breakdown: record.breakdown,
    note: note?.trim() || null,
    paidAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  await sendNotification({
    userId: member.uid,
    type: "commission_paid",
    title: "Incentives paid",
    message: `${formatCurrency(record.amount)} incentives paid for ${record.periods.map((p) => payPeriodLabel(p)).join(", ")}.`,
    link: "/sales/settlements",
  });
}

/** All settlements an admin has made (scoped, cheap — low volume). */
export function adminSettlementsQuery(adminUid: string): Query<DocumentData> {
  return query(collection(db, "commission_settlements"), where("adminId", "==", adminUid));
}

/** A member's own settlements. */
export function memberSettlementsQuery(memberId: string): Query<DocumentData> {
  return query(collection(db, "commission_settlements"), where("memberId", "==", memberId));
}

// ── Settlement requests — a member asks their admin to review & pay the unpaid period ──────

export interface SettlementRequest {
  id: string;
  memberId: string;
  memberName: string;
  adminId: string;
  fromDate: string;
  toDate: string;
  amount: number;
  saleCount: number;
  status: "pending" | "resolved";
  requestedAt: any;
}

/** Member asks their admin to pay out the currently unpaid period. Notifies the admin with a
 *  deep link straight into that member's settlement detail so they can review and pay. */
export async function requestSettlement(params: {
  member: AppUser;
  adminId: string;
  fromDate: string;
  toDate: string;
  amount: number;
  saleCount: number;
}): Promise<void> {
  const { member, adminId, fromDate, toDate, amount, saleCount } = params;
  await addDoc(collection(db, "settlement_requests"), {
    memberId: member.uid,
    memberName: member.name,
    adminId,
    fromDate,
    toDate,
    amount,
    saleCount,
    status: "pending",
    requestedAt: serverTimestamp(),
  });
  await sendNotification({
    userId: adminId,
    type: "settlement_requested",
    title: "Settlement requested",
    message: `${member.name} requested their incentive settlement of ${formatCurrency(amount)} for ${fromDate} → ${toDate}.`,
    link: `/sales-admin/settlements?member=${member.uid}`,
  });
}

/** A member's own pending settlement request(s), if any. */
export function memberPendingRequestsQuery(memberId: string): Query<DocumentData> {
  return query(collection(db, "settlement_requests"), where("memberId", "==", memberId), where("status", "==", "pending"));
}

/** Every pending settlement request addressed to this admin, across their whole team. */
export function adminPendingRequestsQuery(adminId: string): Query<DocumentData> {
  return query(collection(db, "settlement_requests"), where("adminId", "==", adminId), where("status", "==", "pending"));
}

/** Clears a member's pending request(s) once the admin has paid them out. */
export async function resolvePendingRequests(memberId: string, pending: SettlementRequest[]): Promise<void> {
  const mine = pending.filter((r) => r.memberId === memberId && r.status === "pending");
  await Promise.all(mine.map((r) => updateDoc(doc(db, "settlement_requests", r.id), { status: "resolved", resolvedAt: serverTimestamp() })));
}
