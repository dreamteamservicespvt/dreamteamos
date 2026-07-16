import { collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { format, getDay } from "date-fns";

/**
 * Tech attendance.
 *
 * Effective daily status precedence (highest first):
 *   1. MANUAL override        → `attendance/{memberId}_{date}` doc (set by admin / team lead)
 *   2. HOLIDAY                 → Sunday (auto) OR an announced festival day in `holidays/{date}`
 *   3. AUTO (from check-in)    → checked in that day => Full Day, otherwise Absent
 *
 * Only manual overrides and announced holidays are persisted; Full/Absent are derived from the
 * existing `daily_checkins` records, so we never write a row for every member every day.
 */

export type AttendanceStatus = "full" | "half" | "absent" | "leave" | "holiday";

export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; short: string; tone: string }> = {
  full: { label: "Full Day", short: "P", tone: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  half: { label: "Half Day", short: "H", tone: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  absent: { label: "Absent", short: "A", tone: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
  leave: { label: "Leave", short: "L", tone: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  holiday: { label: "Holiday", short: "—", tone: "bg-slate-400/15 text-slate-500 border-slate-400/30" },
};

/** Paid leaves allowed per member per month. */
export const MONTHLY_LEAVE_QUOTA = 2;

export interface AttendanceOverride {
  memberId: string;
  date: string; // yyyy-MM-dd
  month: string; // yyyy-MM
  status: AttendanceStatus;
  markedBy: string;
  markedByName?: string;
  markedAt: Timestamp;
}

export interface Holiday {
  date: string; // yyyy-MM-dd
  label: string;
  createdBy: string;
}

const attendanceId = (memberId: string, date: string) => `${memberId}_${date}`;

/** True when the given yyyy-MM-dd is a Sunday. */
export const isSunday = (dateStr: string): boolean => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return getDay(new Date(y, m - 1, d)) === 0;
};

/** Admin / team-lead sets an explicit attendance status for one member on one day. */
export async function setAttendanceOverride(
  member: { uid: string; name?: string },
  dateStr: string,
  status: AttendanceStatus,
  by: { uid: string; name?: string },
): Promise<void> {
  await setDoc(
    doc(db, "attendance", attendanceId(member.uid, dateStr)),
    {
      memberId: member.uid,
      memberName: member.name || "",
      date: dateStr,
      month: dateStr.slice(0, 7),
      status,
      markedBy: by.uid,
      markedByName: by.name || "",
      markedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Remove a manual override so the day falls back to the auto (check-in derived) status. */
export async function clearAttendanceOverride(memberId: string, dateStr: string): Promise<void> {
  await deleteDoc(doc(db, "attendance", attendanceId(memberId, dateStr)));
}

/** Announce a festival / one-off holiday for a given day (applies to everyone). */
export async function announceHoliday(dateStr: string, label: string, by: { uid: string }): Promise<void> {
  await setDoc(doc(db, "holidays", dateStr), {
    date: dateStr,
    label: label.trim() || "Holiday",
    createdBy: by.uid,
    createdAt: serverTimestamp(),
  });
}

/** Remove a wrongly announced holiday. */
export async function deleteHoliday(dateStr: string): Promise<void> {
  await deleteDoc(doc(db, "holidays", dateStr));
}

/** Live listener for announced holidays in a month. Returns unsubscribe. */
export function watchHolidays(month: string, cb: (byDate: Map<string, Holiday>) => void): () => void {
  const q = query(collection(db, "holidays"), where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
  return onSnapshot(
    q,
    (snap) => {
      const map = new Map<string, Holiday>();
      snap.docs.forEach((d) => map.set(d.id, d.data() as Holiday));
      cb(map);
    },
    () => cb(new Map()),
  );
}

/** Live listener for manual overrides in a month. Returns unsubscribe. */
export function watchOverrides(month: string, cb: (byKey: Map<string, AttendanceStatus>) => void): () => void {
  const q = query(collection(db, "attendance"), where("month", "==", month));
  return onSnapshot(
    q,
    (snap) => {
      const map = new Map<string, AttendanceStatus>();
      snap.docs.forEach((d) => {
        const a = d.data() as AttendanceOverride;
        map.set(attendanceId(a.memberId, a.date), a.status);
      });
      cb(map);
    },
    () => cb(new Map()),
  );
}

/**
 * Resolve the effective status for one member on one day.
 * `checkedIn` = the member has a daily_checkins record for that date.
 * `hasFestivalHoliday` = an announced holiday exists for that date.
 * `isFuture` days return null (not yet applicable).
 */
export function resolveStatus(params: {
  override?: AttendanceStatus;
  checkedIn: boolean;
  dateStr: string;
  hasFestivalHoliday: boolean;
  todayStr: string;
}): AttendanceStatus | null {
  const { override, checkedIn, dateStr, hasFestivalHoliday, todayStr } = params;
  if (override) return override; // manual override always wins
  if (isSunday(dateStr) || hasFestivalHoliday) return "holiday"; // Sundays/festivals apply even in the future
  if (dateStr > todayStr) return null; // future working day — not applicable yet
  if (checkedIn) return "full";
  if (dateStr === todayStr) return null; // today still in progress — don't pre-mark Absent
  return "absent"; // a past working day with no check-in
}

export interface AttendanceSummary {
  full: number;
  half: number;
  absent: number;
  leave: number;
  holiday: number;
  /** working-day presence credit: full = 1, half = 0.5 */
  presentDays: number;
  leavesLeft: number;
}

export function summarize(statuses: (AttendanceStatus | null)[]): AttendanceSummary {
  const s: AttendanceSummary = { full: 0, half: 0, absent: 0, leave: 0, holiday: 0, presentDays: 0, leavesLeft: MONTHLY_LEAVE_QUOTA };
  for (const st of statuses) {
    if (!st) continue;
    s[st] += 1;
  }
  s.presentDays = s.full + s.half * 0.5;
  s.leavesLeft = Math.max(0, MONTHLY_LEAVE_QUOTA - s.leave);
  return s;
}

/** One-time fetch: which member/day pairs have a daily_checkins record in a month. */
export async function fetchCheckedInDays(month: string): Promise<Set<string>> {
  const snap = await getDocs(
    query(collection(db, "daily_checkins"), where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`)),
  );
  const set = new Set<string>();
  snap.docs.forEach((d) => {
    const c = d.data() as { memberId?: string; date?: string };
    if (c.memberId && c.date) set.add(attendanceId(c.memberId, c.date));
  });
  return set;
}

/** Live version of fetchCheckedInDays. */
export function watchCheckedInDays(month: string, cb: (set: Set<string>) => void): () => void {
  const q = query(collection(db, "daily_checkins"), where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
  return onSnapshot(
    q,
    (snap) => {
      const set = new Set<string>();
      snap.docs.forEach((d) => {
        const c = d.data() as { memberId?: string; date?: string };
        if (c.memberId && c.date) set.add(attendanceId(c.memberId, c.date));
      });
      cb(set);
    },
    () => cb(new Set()),
  );
}

/** All days (yyyy-MM-dd) of a month up to and including today (or the full month if past). */
export function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(`${month}-${String(d).padStart(2, "0")}`);
  return out;
}

export const todayMonth = () => format(new Date(), "yyyy-MM");
export const todayDate = () => format(new Date(), "yyyy-MM-dd");
export const attendanceKey = attendanceId;
