import { collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { format, getDay } from "date-fns";
import { tallyAttendance } from "@/utils/payrollEngine";
import { sendNotification } from "@/services/notifications";
import { getSalaryRoute } from "@/utils/roleHelpers";
import type { PayrollConfig, ResolvedDay } from "@/types/payroll";
import type { UserRole } from "@/types";

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

/**
 * A day's status. Two came with comp-off (owner, 2026-10-10):
 *  • `holiday_work` (W) — the admin marks a Sunday or an announced holiday on which the person worked. It adds no pay
 *    by itself (a Sunday never changes pay); it earns ONE comp-off credit for that pay cycle, a half day included.
 *  • `comp_off` (C) — a working day the person is paid for in return. Paid like a full day, never one of the two paid
 *    leaves. Credits are good for the cycle they were earned in only; a C beyond them is unpaid.
 * Both are only ever admin marks (`attendance` overrides) — nothing derives them from check-ins.
 */
export type AttendanceStatus = "full" | "half" | "absent" | "leave" | "holiday" | "holiday_work" | "comp_off";

export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; short: string; tone: string }> = {
  full: { label: "Full Day", short: "P", tone: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  half: { label: "Half Day", short: "H", tone: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  absent: { label: "Absent", short: "A", tone: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
  leave: { label: "Leave", short: "L", tone: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  holiday: { label: "Holiday", short: "—", tone: "bg-slate-400/15 text-slate-500 border-slate-400/30" },
  holiday_work: { label: "Worked on holiday", short: "W", tone: "bg-violet-500/15 text-violet-600 border-violet-500/30" },
  comp_off: { label: "Comp Off", short: "C", tone: "bg-teal-500/15 text-teal-600 border-teal-500/30" },
};

/**
 * Paid leaves allowed per member per pay period — the policy default. The live figure is
 * `PayrollConfig.paidLeaveQuota`, which `summarize` reads when it is given the config.
 */
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

/**
 * Turn absences into Comp Off days, paid out of the holiday-work credits (owner, 2026-10-10).
 *
 * Payroll's "Apply comp-off" passes the earliest absences the period's unused credits cover
 * (`payrollEngine.compOffToApply`); each becomes a `comp_off` mark, exactly as if set on the grid,
 * and the member is told once which days — paid now, for the holidays they worked.
 */
export async function applyCompOff(
  member: { uid: string; name?: string; role?: UserRole },
  dates: string[],
  by: { uid: string; name?: string },
): Promise<void> {
  if (dates.length === 0) return;
  await Promise.all(dates.map((date) => setAttendanceOverride(member, date, "comp_off", by)));
  const days = dates.map((d) => format(new Date(`${d}T00:00:00`), "dd MMM")).join(", ");
  sendNotification({
    userId: member.uid,
    type: "attendance_update",
    title: "Comp Off Added",
    message: `For the holiday${dates.length === 1 ? "" : "s"} you worked, ${days} ${dates.length === 1 ? "is" : "are"} now Comp Off — paid.`,
    link: getSalaryRoute(member.role),
    meta: { status: "comp_off", date: dates[0] },
  }).catch(() => undefined);
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
  /** Holidays worked (W) — each one comp-off credit for the period. */
  holidayWork: number;
  /** Comp Off days (C) paid out of those credits. */
  compOff: number;
  /** Comp Off days beyond the credits — unpaid. */
  compOffUnpaid: number;
  /** Credits still unused in the period. */
  compOffLeft: number;
}

/**
 * The P / H / A / L counts for a run of days, as the grid and the calendars show them.
 *
 * Takes the DAYS, not bare statuses, because it is the salary engine's own tally
 * (`payrollEngine.tallyAttendance`): a Sunday's mark is not counted, leave is paid in date order up
 * to the policy's allowance, and a half day earns the policy's factor. Counting statuses here on
 * their own is how the grid once said 1P for a Sunday the payslip never paid.
 */
export function summarize(days: ResolvedDay[], config?: Partial<PayrollConfig>): AttendanceSummary {
  const t = tallyAttendance(days, config);
  return {
    full: t.full,
    half: t.half,
    absent: t.absent,
    leave: t.leave,
    holiday: t.holiday,
    presentDays: t.presentDays,
    leavesLeft: t.leavesLeft,
    holidayWork: t.holidayWork,
    compOff: t.compOff,
    compOffUnpaid: t.compOffUnpaid,
    compOffLeft: t.compOffLeft,
  };
}

/**
 * Does a check-in record make its member Present on its date?
 *
 * A tech record (`daily_checkins`) exists only because somebody checked in. A sales record
 * (`salesCheckins/{uid}_{date}`) is different: it is one document per member per day that the
 * check-OUT writes as well, so a check-out made after midnight used to create the NEXT day's
 * document with no check-in on it — and that day was counted Present and paid. A sales record
 * counts only when it carries a check-in (the field is present the moment the check-in is
 * written, even while its server time is still pending).
 */
export function isCheckInRecord(source: "daily_checkins" | "salesCheckins", data: unknown): data is { memberId: string; date: string } {
  const c = (data ?? {}) as { memberId?: string; date?: string };
  if (!c.memberId || !c.date) return false;
  return source === "daily_checkins" || Object.prototype.hasOwnProperty.call(c, "checkInAt");
}

/** Called when a listener cannot read its collection — so a screen can say so instead of showing nothing as fact. */
export type ListenerError = (error: unknown) => void;

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

/**
 * Every day (yyyy-MM-dd) between two dates, inclusive.
 *
 * The attendance calendars run on the pay cycle — 10th → 9th — rather than the calendar month,
 * because that is the span everything else about a month here is measured over: the salary, the
 * leave quota, the deductions and the commission. A grid that showed 1–31 while the payslip
 * settled 10 → 9 meant the days a member counted and the days they were paid for were different
 * days, and reconciling the two by hand is exactly the thing nobody can do reliably.
 */
export function daysBetween(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const end = new Date(`${endDate}T00:00:00`);
  for (let d = new Date(`${startDate}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

/** All days (yyyy-MM-dd) of a calendar month. Kept for callers that are genuinely month-scoped. */
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

// ─── Date-range listeners ───────────────────────────────────────────────────
// The salary cycle runs 10th → 9th, so it straddles two calendar months. These range-scoped
// listeners replace the month-scoped ones wherever a pay period is involved.
//
// ── Errors ────────────────────────────────────────────────────────────────────────────────────
// Each takes an optional `onError`. Without one, a failed read reports an empty result, as these
// always did — fine for a calendar. A salary screen passes one: an empty override list is not
// "nobody was on leave", it is "we could not read the leave", and pricing a month from it marks
// every leave and holiday day Absent with nothing on screen to say the figure is wrong.

/** Live overrides between two dates (inclusive). Returns unsubscribe. */
export function watchOverridesInRange(
  startDate: string,
  endDate: string,
  cb: (byKey: Map<string, AttendanceStatus>) => void,
  onError?: ListenerError,
): () => void {
  const q = query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate));
  return onSnapshot(
    q,
    (snap) => {
      const map = new Map<string, AttendanceStatus>();
      snap.docs.forEach((d) => {
        const a = d.data() as AttendanceOverride;
        if (a.memberId && a.date && a.status) map.set(attendanceId(a.memberId, a.date), a.status);
      });
      cb(map);
    },
    (error) => (onError ? onError(error) : cb(new Map())),
  );
}

/** Live announced holidays between two dates (inclusive). Returns unsubscribe. */
export function watchHolidaysInRange(
  startDate: string,
  endDate: string,
  cb: (dates: Set<string>) => void,
  onError?: ListenerError,
): () => void {
  const q = query(collection(db, "holidays"), where("date", ">=", startDate), where("date", "<=", endDate));
  return onSnapshot(
    q,
    (snap) => cb(new Set(snap.docs.map((d) => d.id))),
    (error) => (onError ? onError(error) : cb(new Set())),
  );
}

/**
 * Live announced holidays between two dates, as the full records.
 *
 * `watchHolidaysInRange` above returns only the dates, which is all the payroll engine needs. A
 * calendar also has to NAME the holiday it is showing, so it gets the records.
 */
export function watchHolidayRecordsInRange(
  startDate: string,
  endDate: string,
  cb: (byDate: Map<string, Holiday>) => void,
): () => void {
  const q = query(collection(db, "holidays"), where("date", ">=", startDate), where("date", "<=", endDate));
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

/** One person's check-in on one day: when they came in and, once they have checked out, when they left. */
export interface DayCheckin {
  inAt: Date | null;
  outAt: Date | null;
}

const tsDate = (t: unknown): Date | null => {
  if (t instanceof Date) return t;
  const d = (t as { toDate?: () => Date } | null)?.toDate?.();
  return d instanceof Date ? d : null;
};

/**
 * Live: every tech check-in on one day, by member, with its times.
 *
 * The Social Media Team Lead's TODAY board (2026-10-08) says "In at 9:42 AM", not only P — so it needs the
 * records, not the keys `watchCheckedInDaysInRange` gives. One equality on `date`: the day's few documents.
 * A check-in just made reads `checkedInAt` null until the server stamps it — "Checked in", no time, for a second.
 */
export function watchCheckinsOnDay(date: string, cb: (byMember: Map<string, DayCheckin>) => void): () => void {
  return onSnapshot(
    query(collection(db, "daily_checkins"), where("date", "==", date)),
    (snap) => {
      const map = new Map<string, DayCheckin>();
      snap.docs.forEach((d) => {
        const c = d.data() as { memberId?: string; checkedInAt?: unknown; checkedOutAt?: unknown };
        if (!c.memberId) return;
        const next = { inAt: tsDate(c.checkedInAt), outAt: tsDate(c.checkedOutAt) };
        const prev = map.get(c.memberId);
        // Two records for one day should not happen; if it does, the earliest arrival and the latest departure.
        map.set(c.memberId, prev ? {
          inAt: prev.inAt && next.inAt ? (prev.inAt < next.inAt ? prev.inAt : next.inAt) : prev.inAt || next.inAt,
          outAt: prev.outAt && next.outAt ? (prev.outAt > next.outAt ? prev.outAt : next.outAt) : prev.outAt || next.outAt,
        } : next);
      });
      cb(map);
    },
    () => cb(new Map()),
  );
}

/** Live member/day check-in keys between two dates (inclusive). Returns unsubscribe. */
export function watchCheckedInDaysInRange(
  startDate: string,
  endDate: string,
  cb: (set: Set<string>) => void,
  onError?: ListenerError,
): () => void {
  /**
   * BOTH check-in collections, unioned.
   *
   * The tech side writes `daily_checkins`; a sales member's check-in button has always written
   * `salesCheckins` instead. Everything that decides attendance — this function, and so the salary
   * engine behind it — only ever read the first, which meant a sales member could check in every
   * working day of a cycle and still be scored Absent for every one of them. Their pay came out of
   * that number.
   *
   * Reading both here rather than making the sales side write a second doc fixes the cycles already
   * behind us too: the check-ins were recorded correctly all along, they were being read from the
   * wrong place.
   */
  const range = [where("date", ">=", startDate), where("date", "<=", endDate)];
  const fromTech = new Set<string>();
  const fromSales = new Set<string>();

  /**
   * Nothing is reported until BOTH collections have answered once.
   *
   * Emitting after the first one made the union half a truth: whichever collection answered first
   * was the whole story for a moment, so on the sales payroll every member read Absent for every
   * day until `salesCheckins` caught up — and a screen that marks itself "loaded" on the first
   * report priced the month from that.
   */
  const answered = { daily_checkins: false, salesCheckins: false };
  const emit = () => {
    if (answered.daily_checkins && answered.salesCheckins) cb(new Set([...fromTech, ...fromSales]));
  };

  const collect = (source: "daily_checkins" | "salesCheckins", into: Set<string>) =>
    (snap: { docs: { data: () => unknown }[] }) => {
      into.clear();
      snap.docs.forEach((d) => {
        const c = d.data();
        if (isCheckInRecord(source, c)) into.add(attendanceId(c.memberId, c.date));
      });
      answered[source] = true;
      emit();
    };

  const failed = (source: "daily_checkins" | "salesCheckins", into: Set<string>) => (error: unknown) => {
    if (onError) { onError(error); return; }
    // No handler: the old behaviour — this half counts as empty and the other still reports.
    into.clear();
    answered[source] = true;
    emit();
  };

  const unsubs = [
    onSnapshot(query(collection(db, "daily_checkins"), ...range), collect("daily_checkins", fromTech), failed("daily_checkins", fromTech)),
    onSnapshot(query(collection(db, "salesCheckins"), ...range), collect("salesCheckins", fromSales), failed("salesCheckins", fromSales)),
  ];
  return () => unsubs.forEach((u) => u());
}
