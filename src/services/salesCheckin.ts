import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { getWhatsAppUrl } from "@/utils/phone";
import { format } from "date-fns";
import type { Lead, SaleDetail } from "@/types";

/** WhatsApp number that receives every check-in / check-out report. */
export const REPORT_WHATSAPP_NUMBER = "9959935203";

/**
 * Daily attendance record for a sales member.
 * One doc per member per day in `salesCheckins`, id = `${memberId}_${yyyy-MM-dd}` so
 * check-in/check-out upserts are idempotent and month queries are simple.
 */
export interface SalesCheckin {
  id?: string;
  memberId: string;
  memberName: string;
  date: string;            // "yyyy-MM-dd"
  month: string;           // "yyyy-MM" — for attendance queries
  checkInAt?: any;
  checkOutAt?: any;
  reportText?: string;     // the progress message sent at check-out
  totalSalesAmount?: number;
  salesCount?: number;
  updatedAt: any;
}

const checkinId = (memberId: string, date: string) => `${memberId}_${date}`;

export async function recordCheckIn(user: { uid: string; name: string }): Promise<void> {
  const date = format(new Date(), "yyyy-MM-dd");
  await setDoc(
    doc(db, "salesCheckins", checkinId(user.uid, date)),
    {
      memberId: user.uid,
      memberName: user.name,
      date,
      month: format(new Date(), "yyyy-MM"),
      checkInAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function recordCheckOut(
  user: { uid: string; name: string },
  report: { reportText: string; totalSalesAmount: number; salesCount: number },
): Promise<void> {
  const date = format(new Date(), "yyyy-MM-dd");
  await setDoc(
    doc(db, "salesCheckins", checkinId(user.uid, date)),
    {
      memberId: user.uid,
      memberName: user.name,
      date,
      month: format(new Date(), "yyyy-MM"),
      checkOutAt: serverTimestamp(),
      ...report,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Live subscription to today's check-in doc for a member. */
export function watchTodayCheckin(
  memberId: string,
  cb: (checkin: SalesCheckin | null) => void,
): () => void {
  const date = format(new Date(), "yyyy-MM-dd");
  return onSnapshot(doc(db, "salesCheckins", checkinId(memberId, date)), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as SalesCheckin) : null);
  });
}

/** All of a member's check-ins for a month ("yyyy-MM"), oldest first. */
export async function fetchMonthCheckins(memberId: string, month: string): Promise<SalesCheckin[]> {
  const snap = await getDocs(
    query(collection(db, "salesCheckins"), where("memberId", "==", memberId), where("month", "==", month)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as SalesCheckin))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ─── Report message builders ─── */

export function buildCheckInMessage(name: string): string {
  return `✅ Check-In\n${name}\n${format(new Date(), "dd MMM yyyy, hh:mm a")}`;
}

/**
 * Build the check-out progress report from today's sale items, in the agreed format:
 *   alekhya
 *   499 : 2
 *   999 : 2
 *   Today total sales : ₹2,996
 */
export function buildCheckOutReport(
  name: string,
  leads: Lead[],
): { reportText: string; totalSalesAmount: number; salesCount: number } {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const items: SaleDetail[] = leads.flatMap((l) => l.saleItems || (l.saleDetails ? [l.saleDetails] : []));
  const todayItems = items.filter((i) => {
    const s = (i.submittedAt as any)?.seconds;
    return s && format(new Date(s * 1000), "yyyy-MM-dd") === todayStr;
  });

  const byAmount = new Map<number, number>();
  let total = 0;
  todayItems.forEach((i) => {
    const amt = i.amount || 0;
    byAmount.set(amt, (byAmount.get(amt) || 0) + 1);
    total += amt;
  });

  const lines = [
    `🕔 Check-Out`,
    name,
    ...[...byAmount.entries()].sort((a, b) => a[0] - b[0]).map(([amt, count]) => `${amt} : ${count}`),
    `Today total sales : ₹${total.toLocaleString("en-IN")}`,
    format(new Date(), "dd MMM yyyy, hh:mm a"),
  ];
  return { reportText: lines.join("\n"), totalSalesAmount: total, salesCount: todayItems.length };
}

/** WhatsApp deep-link to the report number with a prefilled message. */
export function reportWhatsAppUrl(message: string): string {
  return getWhatsAppUrl(REPORT_WHATSAPP_NUMBER, message);
}
