/**
 * Commission settlements — payouts between a sales admin and a sales member.
 *
 * A member earns commission on their VERIFIED sales (10% for `incentive_10`, otherwise 5% — the
 * same rule the leaderboard uses). The admin pays this out for sequential, non-overlapping date
 * ranges and marks each one paid, so both sides always know "paid through <date>" and what's left.
 */
import {
  collection, addDoc, query, where, serverTimestamp, type Query, type DocumentData,
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
