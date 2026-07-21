/**
 * Commission settlements — payouts between a sales admin and a sales member.
 *
 * A member earns commission on their VERIFIED sales (10% for `incentive_10`, otherwise 5% — the
 * same rule the leaderboard uses). The admin pays this out for sequential, non-overlapping date
 * ranges and marks each one paid, so both sides always know "paid through <date>" and what's left.
 */
import {
  collection, addDoc, doc, updateDoc, query, where, serverTimestamp, type Query, type DocumentData,
} from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { formatCurrency } from "@/utils/formatters";
import type { AppUser, CommissionSettlement, Lead, SaleDetail } from "@/types";

/** Member commission rate as a whole percent (5 or 10). */
export function commissionRate(option?: string): number {
  return option === "incentive_10" ? 10 : 5;
}

function saleItems(lead: Lead): SaleDetail[] {
  return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
}

/** The sale's date ("yyyy-MM-dd") — when the member recorded it, falling back to the lead date. */
function saleDateStr(item: SaleDetail, lead: Lead): string | null {
  const s = (item.submittedAt as any)?.seconds ?? (lead.createdAt as any)?.seconds;
  return s ? format(new Date(s * 1000), "yyyy-MM-dd") : null;
}

export interface RangeCommission {
  base: number;        // verified sales total in range
  commission: number;  // base * rate / 100, rounded
  saleCount: number;
}

/** Commission for a member's VERIFIED sales dated within [fromDate, toDate] (inclusive). */
export function computeCommissionInRange(leads: Lead[], fromDate: string, toDate: string, rate: number): RangeCommission {
  let base = 0;
  let saleCount = 0;
  for (const lead of leads) {
    for (const it of saleItems(lead)) {
      if (it.verificationStatus !== "verified") continue;
      const d = saleDateStr(it, lead);
      if (!d || d < fromDate || d > toDate) continue;
      base += it.amount || 0;
      saleCount++;
    }
  }
  return { base, commission: Math.round((base * rate) / 100), saleCount };
}

/** Sales dated within [fromDate, toDate] still awaiting verification. A settlement only pays
 *  VERIFIED sales, and once a day is behind "paid through" it is never revisited — so any
 *  pending sale in the range would silently fall out of every future settlement. Surface the
 *  count so the admin verifies (or rejects) them BEFORE marking the period paid. */
export function countPendingInRange(leads: Lead[], fromDate: string, toDate: string): number {
  let pending = 0;
  for (const lead of leads) {
    for (const it of saleItems(lead)) {
      if (it.verificationStatus !== "pending") continue;
      const d = saleDateStr(it, lead);
      if (!d || d < fromDate || d > toDate) continue;
      pending++;
    }
  }
  return pending;
}

// ── Timestamp-cut settlement model ─────────────────────────────────────────────
// A settlement pays EVERYTHING verified up to the exact moment it is marked (paidAt).
// The next settlement pays everything verified AFTER that moment. Cutting by the payment
// timestamp instead of a calendar date means a sale submitted/approved later on the very
// day of a settlement simply falls into the next payout — it can never be skipped, which
// the old "paid through <date>, resume next day" model allowed.

/** Millisecond timestamp when a verified sale became payable — its verification moment,
 *  falling back to submission time for legacy items that predate verifiedAt stamping. */
function verifiedAtMs(item: SaleDetail, lead: Lead): number {
  const s = (item.verifiedAt as any)?.seconds ?? (item.submittedAt as any)?.seconds ?? (lead.createdAt as any)?.seconds;
  return s ? s * 1000 : 0;
}

/** The member's most recent settlement (by payment moment), or null if never settled. */
export function lastSettlementOf(settlements: CommissionSettlement[], memberId: string): CommissionSettlement | null {
  let latest: CommissionSettlement | null = null;
  for (const s of settlements) {
    if (s.memberId !== memberId) continue;
    if (!latest || ((s.paidAt as any)?.seconds || 0) > ((latest.paidAt as any)?.seconds || 0)) latest = s;
  }
  return latest;
}

/** Commission on every VERIFIED sale not covered by the last settlement — i.e. verified
 *  after the moment that settlement was marked (pass 0 when never settled). */
export function computeUnpaidCommission(leads: Lead[], lastPaidAtMs: number, rate: number): RangeCommission {
  let base = 0;
  let saleCount = 0;
  for (const lead of leads) {
    for (const it of saleItems(lead)) {
      if (it.verificationStatus !== "verified") continue;
      if (verifiedAtMs(it, lead) <= lastPaidAtMs) continue;
      base += it.amount || 0;
      saleCount++;
    }
  }
  return { base, commission: Math.round((base * rate) / 100), saleCount };
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

/** Latest settled date for a member ("paid through"), or null if never settled. */
export function paidThrough(settlements: CommissionSettlement[], memberId: string): string | null {
  let max: string | null = null;
  for (const s of settlements) {
    if (s.memberId !== memberId) continue;
    if (!max || s.toDate > max) max = s.toDate;
  }
  return max;
}

export function totalPaid(settlements: CommissionSettlement[], memberId: string): number {
  return settlements.filter((s) => s.memberId === memberId).reduce((sum, s) => sum + (s.amount || 0), 0);
}

/** Record a commission payment and notify the member. */
export async function createSettlement(params: {
  member: AppUser;
  admin: AppUser;
  fromDate: string;
  toDate: string;
  rate: number;
  salesBase: number;
  amount: number;
  saleCount: number;
  note?: string;
}): Promise<void> {
  const { member, admin, fromDate, toDate, rate, salesBase, amount, saleCount, note } = params;
  await addDoc(collection(db, "commission_settlements"), {
    memberId: member.uid,
    memberName: member.name,
    adminId: admin.uid,
    fromDate,
    toDate,
    commissionRate: rate,
    salesBase,
    amount,
    saleCount,
    note: note?.trim() || null,
    paidAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  await sendNotification({
    userId: member.uid,
    type: "commission_paid",
    title: "Commission paid",
    message: `${formatCurrency(amount)} commission paid for ${fromDate} → ${toDate} (${rate}% of ${formatCurrency(salesBase)}).`,
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
    message: `${member.name} requested their commission settlement of ${formatCurrency(amount)} for ${fromDate} → ${toDate}.`,
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
