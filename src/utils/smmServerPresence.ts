/**
 * SMM Delivery Control — who is at work TODAY, worked out on the server from the raw attendance documents
 * (2026-10-15, phase 6: the server checker `api/smm-monitor.ts`).
 *
 * ── Why the server needs this ───────────────────────────────────────────────────────────────────
 * The supervisor is leave-aware (the plan's pre-mortem): nobody on leave or absent gets alerts, and their work
 * goes to the lead as "away — reassign?". In the app that answer comes from the Attendance board
 * (`utils/smmAttendance.todayStatusOf`). The server checker runs with the app closed, reads the same documents
 * with the Admin SDK, and must give the same answer — so this is the board's rule, kept to the minimum the
 * alerts need, then mapped with `smmMonitor.presenceFromToday`.
 *
 * ── Why a copy and not an import ───────────────────────────────────────────────────────────────
 * `smmAttendance` imports through the `@/` alias (`@/utils/smmPackage`, `@/types/smm`), which the server cannot
 * load. The rule is small; a parity test (`smmServerCheckerOct15`) runs both on the same inputs so they cannot
 * drift apart.
 *
 * ── The documents (the board's sources, people.md §9.13) ───────────────────────────────────────
 *   • `attendance/{uid}_{day}` — an admin's mark (`status`); an approved leave is written as one. Wins.
 *   • `daily_checkins` with `date == day` — `memberId`, `checkedInAt`, `checkedOutAt`. The record existing is
 *     the check-in (a fresh one reads `checkedInAt` null until the server stamps it).
 *   • Sunday, or `holidays/{day}` — a day off.
 *   • `leave_requests` covering the day — pending ones as on the board ("asked"); an APPROVED one only when its
 *     mark is missing (the mark is the record; this keeps somebody on leave unalerted if the approval's mark
 *     never landed). A half-day request covers its one date only.
 *   • Only a `tech_member` checks in (as on the board): anybody else with nothing on record is "no check-in
 *     record" → at work. Sales members' own check-ins (`salesCheckins`) are not read — they count as at work.
 *
 * Pure and alias-free (the server loads it as Node ESM — hence the `.js` on the runtime imports).
 */
import { presenceFromToday, type SmmMonitorPerson, type SmmPresence } from "./smmMonitor.js";
import { weekdayOf } from "./smmCadence.js";

/** An admin's mark for a day (the attendance statuses — `techAttendance.AttendanceStatus`). */
export type ServerDayMark = "full" | "half" | "absent" | "leave" | "half_leave" | "holiday" | "holiday_work" | "comp_off";

/** The board's kinds (`smmAttendance.TodayKind`). */
export type ServerTodayKind =
  | "present" | "half" | "not_in" | "leave" | "leave_asked" | "half_leave" | "half_leave_asked" | "absent" | "holiday"
  | "no_checkin";

const MARKS: readonly ServerDayMark[] = ["full", "half", "absent", "leave", "half_leave", "holiday", "holiday_work", "comp_off"];

/** The board's reading of a mark (comp-off: worked on a holiday = here; a Comp Off day = a paid day away). */
const KIND_OF_MARK: Record<ServerDayMark, ServerTodayKind> = {
  full: "present", half: "half", absent: "absent", leave: "leave", half_leave: "half_leave", holiday: "holiday",
  holiday_work: "present", comp_off: "leave",
};

export interface ServerTodayInput {
  checksIn: boolean;
  mark?: ServerDayMark | null;
  checkin?: { inAt: unknown; outAt: unknown } | null;
  dayOff: boolean;
  leaveAsked: boolean;
  leaveAskedHalf?: boolean;
  /** An approved request covers today and no mark says otherwise (the fallback described above). */
  leaveApproved?: boolean;
  leaveApprovedHalf?: boolean;
}

/** One person's day, in the board's order: a mark, a check-in, the day off, a leave request, no record. */
export function serverTodayKind(input: ServerTodayInput): ServerTodayKind {
  if (input.mark) return KIND_OF_MARK[input.mark];
  if (input.checkin) return "present";
  if (input.dayOff) return "holiday";
  if (input.leaveAsked) return input.leaveAskedHalf ? "half_leave_asked" : "leave_asked";
  if (input.leaveApproved) return input.leaveApprovedHalf ? "half_leave" : "leave";
  if (!input.checksIn) return "no_checkin";
  return "not_in";
}

/* ── The raw documents ───────────────────────────────────────────────────────────────────────── */

export interface ServerUserDoc {
  uid: string;
  name?: unknown;
  role?: unknown;
  smmLeader?: unknown;
  isActive?: unknown;
}

export interface ServerAttendanceDocs {
  /** Today, India time (`yyyy-MM-dd`). */
  day: string;
  /** `attendance` documents (any day — only `date == day` is used). */
  marks: readonly Record<string, unknown>[];
  /** `daily_checkins` documents (any day — only `date == day` is used). */
  checkins: readonly Record<string, unknown>[];
  /** The company holidays; null = could not be read (Sundays only). */
  holidays: ReadonlySet<string> | null;
  /** `leave_requests` documents (any — only pending / approved ones covering `day` are used). */
  leaveRequests: readonly Record<string, unknown>[];
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Does this request cover `day`? A half day covers its one date; a missing `toDate` reads as one day. */
function covers(r: Record<string, unknown>, day: string): boolean {
  const from = str(r.fromDate);
  if (!from) return false;
  const to = r.duration === "half_day" ? from : str(r.toDate) || from;
  return from <= day && day <= to;
}

/** uid → requests of this status covering `day`, and which of those people asked only for a half day. */
function leaveOn(requests: readonly Record<string, unknown>[], day: string, status: string) {
  const all = new Set<string>();
  const full = new Set<string>();
  const half = new Set<string>();
  for (const r of requests) {
    const uid = str(r.memberId);
    if (!uid || r.status !== status || !covers(r, day)) continue;
    all.add(uid);
    (r.duration === "half_day" ? half : full).add(uid);
  }
  // Somebody who also asked for the whole day is on a whole day (as `smmAttendance.halfDayLeaveAskedOn`).
  for (const uid of full) half.delete(uid);
  return { all, half };
}

/**
 * Everybody's presence today: the board's kind, then `presenceFromToday` (a check-out ends the day; a half day
 * is "in" while checked in). People with nothing on record are "working" (tech members not checked in yet
 * included — they are the ones the lead calls, and their work still has to be done).
 */
export function presenceByUid(users: readonly ServerUserDoc[], docs: ServerAttendanceDocs): Map<string, SmmPresence> {
  const day = docs.day;
  const marks = new Map<string, ServerDayMark>();
  for (const m of docs.marks) {
    const uid = str(m.memberId);
    if (uid && m.date === day && MARKS.includes(m.status as ServerDayMark)) marks.set(uid, m.status as ServerDayMark);
  }
  const checkins = new Map<string, { inAt: unknown; outAt: unknown }>();
  for (const c of docs.checkins) {
    const uid = str(c.memberId);
    if (uid && c.date === day) checkins.set(uid, { inAt: c.checkedInAt ?? null, outAt: c.checkedOutAt ?? null });
  }
  const dayOff = weekdayOf(day) === 0 || !!docs.holidays?.has(day);
  const asked = leaveOn(docs.leaveRequests, day, "pending");
  const approved = leaveOn(docs.leaveRequests, day, "approved");

  const out = new Map<string, SmmPresence>();
  for (const u of users) {
    const checkin = checkins.get(u.uid) || null;
    const kind = serverTodayKind({
      checksIn: u.role === "tech_member",
      mark: marks.get(u.uid) || null,
      checkin,
      dayOff,
      leaveAsked: asked.all.has(u.uid),
      leaveAskedHalf: asked.half.has(u.uid),
      leaveApproved: approved.all.has(u.uid),
      leaveApprovedHalf: approved.half.has(u.uid),
    });
    out.set(u.uid, presenceFromToday(kind, { checkedIn: !!checkin, checkedOut: !!checkin?.outAt }));
  }
  return out;
}

/** The supervisor's people (`SmmMonitorPerson`) from the `users` documents and today's attendance. */
export function monitorPeopleFrom(users: readonly ServerUserDoc[], docs: ServerAttendanceDocs): SmmMonitorPerson[] {
  const presence = presenceByUid(users, docs);
  return users.map((u) => ({
    uid: u.uid,
    name: str(u.name),
    role: str(u.role) || undefined,
    smmLeader: u.smmLeader === true,
    isActive: u.isActive !== false,
    presence: presence.get(u.uid) || "unknown",
  }));
}
