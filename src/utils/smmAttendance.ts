/**
 * Social Media → Attendance: the TODAY board the Social Media Team Lead opens before her daily meeting.
 *
 * ── How it got here ─────────────────────────────────────────────────────────────────────────────
 * 2026-10-08: "Add attendance view for the social media team leader" — built as the pay-cycle grid (10th → 9th)
 * of the people on the months RUNNING today. The same evening, live, the owner: "don't show all months — only
 * today. Some members are not showing. She holds a meeting every day; people don't join, she calls them one by
 * one and they say they are absent. She needs to know who is absent BEFORE the meeting." Asked, the owner chose:
 *   • a TODAY board, grouped with the call list first — who has not checked in (call them), who is not coming
 *     (leave / absent — no need to call), who is present and since when;
 *   • the team filled in automatically and editable by the lead;
 *   • Call and WhatsApp buttons beside everybody she may have to chase.
 *
 * ── Why people were missing ───────────────────────────────────────────────────────────────────────
 * (1) Only RUNNING months were read: a month on hold (ended, no renewal decision — five on the board that day),
 * one not started yet and one waiting for setup dropped their people. (2) A post can name its own maker and
 * publisher (`makerUid` / `publisherUid`); only the month's seats were read. (3) A team leader on a seat never
 * checks in, so they were left off the grid and named in small print. (4) Today, a person who had not checked in
 * showed a blank cell — `techAttendance.resolveStatus` marks Absent only once the day is over — so the lead could
 * not tell "not here" from "fine". Now: every month on the board (status `active`), seats AND posts; team leaders
 * listed as "no check-in record"; today's not-checked-in is said in words, in the first group.
 *
 * Pure, so who is on the list and what each person's day says are tested on their own — a person missing here
 * is a person the lead cannot see, and a wrong word here is a call she makes for nothing.
 */
import type { SmmCampaign } from "@/types/smm";
import { cyclePhase } from "@/utils/smmPackage";

/** The view is the Social Media Team Lead's, and the admins who own tech attendance can open it too. */
export function canSeeSmmAttendance(user: { role?: string; smmLeader?: boolean } | null | undefined): boolean {
  if (!user) return false;
  if (user.smmLeader) return true;
  return user.role === "main_admin" || user.role === "tech_admin";
}

/** Whoever sees the board may correct who is on it (owner, 2026-10-08: "the lead can add or remove people"). */
export const canEditSmmTeam = canSeeSmmAttendance;

export type SmmSeat = "Creator" | "Publisher" | "Marketer" | "Assistant";
const SEAT_ORDER: SmmSeat[] = ["Creator", "Publisher", "Marketer", "Assistant"];

/** Where a client's month stands today: being worked, not started yet, or past its last day (on hold). */
export type HandleState = "running" | "upcoming" | "ended";

/**
 * One Social Media client a person handles, and what they do for it (owner, 2026-10-08, on the TODAY board: "in
 * the cards, for each member, write what social media handling they are doing" — the card said only "Creator ·
 * Publisher · Marketer — 2 clients", the names hidden in a tooltip).
 */
export interface SmmHandle {
  client: string;
  /** Their seats on that client's month, plus Creator / Publisher for a post given to them. */
  seats: SmmSeat[];
  state: HandleState;
  /** The month's first day — "starts 20 Oct" for one not started yet. */
  startDate: string;
}

/** One person on the Social Media team: their seats, the clients they work on, and why they are listed. */
export interface SmmTeamPerson {
  uid: string;
  name: string;
  seats: SmmSeat[];
  /** Business names of the board's months they work on, A–Z. */
  clients: string[];
  /** Each client and what they do for it — the months running now first, then upcoming, then ended; A–Z within. */
  handles: SmmHandle[];
  /** On a month (a seat or a post) — or added to the list by hand by the lead. */
  source: "months" | "added";
}

const STATE_ORDER: Record<HandleState, number> = { running: 0, upcoming: 1, ended: 2 };

/**
 * A month on the Social Media board: `active` — running, on hold (ended, no renewal decision yet), not started yet,
 * or waiting for its setup. Renewed, finished, not-renewing, removed and deleted months are off the board.
 */
export function isBoardMonth(c: SmmCampaign): boolean {
  return c.status === "active";
}

/**
 * Everybody working on a month on the board, once each, A–Z: the month's seats (creator, publisher, marketer,
 * assistants) and each post's own maker and publisher — with their seats, their clients, and what they do for each.
 * A client with two months on the board (a next month already set up) is one line: its seats together, its state
 * the most current one.
 */
export function smmTeamFromMonths(campaigns: SmmCampaign[], today: string): SmmTeamPerson[] {
  type Handle = { seats: Set<SmmSeat>; state: HandleState; startDate: string };
  const byUid = new Map<string, { name: string; seats: Set<SmmSeat>; handles: Map<string, Handle> }>();
  const add = (
    uid: string | null | undefined, name: string | null | undefined, seat: SmmSeat,
    client: string, state: HandleState, startDate: string,
  ) => {
    if (!uid) return;
    const entry = byUid.get(uid) ?? { name: name || "", seats: new Set<SmmSeat>(), handles: new Map<string, Handle>() };
    if (!entry.name && name) entry.name = name;
    entry.seats.add(seat);
    if (client) {
      const h = entry.handles.get(client);
      if (!h) entry.handles.set(client, { seats: new Set([seat]), state, startDate });
      else {
        h.seats.add(seat);
        if (STATE_ORDER[state] < STATE_ORDER[h.state]) Object.assign(h, { state, startDate });
      }
    }
    byUid.set(uid, entry);
  };
  for (const c of campaigns) {
    if (!isBoardMonth(c)) continue;
    const client = (c.businessName || c.clientName || "").trim();
    const phase = c.cycle ? cyclePhase(c.cycle, today) : "running";
    const state: HandleState = phase === "upcoming" ? "upcoming" : phase === "ended" ? "ended" : "running";
    const start = c.cycle?.startDate || "";
    add(c.team?.creator?.uid, c.team?.creator?.name, "Creator", client, state, start);
    add(c.team?.publisher?.uid, c.team?.publisher?.name, "Publisher", client, state, start);
    add(c.team?.marketer?.uid, c.team?.marketer?.name, "Marketer", client, state, start);
    for (const a of c.team?.assistants || []) add(a.uid, a.name, "Assistant", client, state, start);
    // A post may be given to somebody who holds no seat on the month — they work on it all the same.
    for (const item of c.items || []) {
      add(item.makerUid, item.makerName, "Creator", client, state, start);
      add(item.publisherUid, item.publisherName, "Publisher", client, state, start);
    }
  }
  return [...byUid.entries()]
    .map(([uid, e]) => {
      const handles: SmmHandle[] = [...e.handles.entries()]
        .map(([client, h]) => ({ client, seats: SEAT_ORDER.filter((s) => h.seats.has(s)), state: h.state, startDate: h.startDate }))
        .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.client.localeCompare(b.client));
      return {
        uid,
        name: e.name || "Unnamed",
        seats: SEAT_ORDER.filter((s) => e.seats.has(s)),
        clients: [...e.handles.keys()].sort((a, b) => a.localeCompare(b)),
        handles,
        source: "months" as const,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The lead's corrections, kept in `app_settings/smm_team`: people added by hand, people taken off the list. */
export interface SmmTeamEdits {
  added: string[];
  removed: string[];
}

export const NO_TEAM_EDITS: SmmTeamEdits = { added: [], removed: [] };

/**
 * The team the board shows: the people on the months, minus those the lead took off, plus those she added.
 * Taken off wins over everything — the lead said this person is not in her meeting.
 */
export function applyTeamEdits(
  fromMonths: SmmTeamPerson[],
  edits: SmmTeamEdits,
  nameOf: (uid: string) => string = () => "",
): SmmTeamPerson[] {
  const removed = new Set(edits.removed);
  const out = fromMonths.filter((p) => !removed.has(p.uid));
  const onList = new Set(out.map((p) => p.uid));
  for (const uid of edits.added) {
    if (!uid || removed.has(uid) || onList.has(uid)) continue;
    // Somebody added by hand who is also on a month keeps the month's entry (the loop above already has them).
    if (fromMonths.some((p) => p.uid === uid)) continue;
    out.push({ uid, name: nameOf(uid) || "Unnamed", seats: [], clients: [], handles: [], source: "added" });
    onList.add(uid);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The card's heading over the clients: "Handles 2 clients", or why there are none. */
export function handlesHeading(person: Pick<SmmTeamPerson, "handles" | "source">): string {
  const n = person.handles.length;
  if (n > 0) return `Handles ${n} client${n === 1 ? "" : "s"}`;
  return person.source === "added" ? "Added to the team by the lead — no Social Media client yet" : "No Social Media client yet";
}

// ─── Today ─────────────────────────────────────────────────────────────────────────────────────────

/** An admin's mark for a day (techAttendance's statuses — kept here as a plain union so this file stays pure). */
export type DayMark = "full" | "half" | "absent" | "leave" | "half_leave" | "holiday" | "holiday_work" | "comp_off";

/**
 * What a person's day says today:
 *   present / half — checked in (or marked so) · not_in — no check-in yet, nothing explains it (the people to call)
 *   leave — approved leave · leave_asked — a leave request for today nobody has decided yet · absent — marked absent
 *   half_leave — an approved half-day leave · half_leave_asked — a half-day request for today nobody decided yet
 *   holiday — Sunday or an announced holiday · no_checkin — a team leader: they never check in, so nobody can tell
 */
export type TodayKind =
  | "present" | "half" | "not_in" | "leave" | "leave_asked" | "half_leave" | "half_leave_asked" | "absent" | "holiday"
  | "no_checkin";

export interface TodayInput {
  /** Whether this person checks in at all — a tech member does; a tech team leader never has. */
  checksIn: boolean;
  /** An admin's mark for today (`attendance/{uid}_{day}`) — an approved leave is written as one. */
  mark?: DayMark | null;
  /** Today's check-in, if any: when they came in and, if they have, when they left. */
  checkin?: { inAt: Date | null; outAt: Date | null } | null;
  /** Today is a Sunday or an announced holiday. */
  dayOff: boolean;
  /** A leave request covering today is waiting for a decision. */
  leaveAsked: boolean;
  /** …and it is a HALF-day request (2026-10-12) — the member is away for half of today only. */
  leaveAskedHalf?: boolean;
}

export interface TodayStatus {
  kind: TodayKind;
  inAt: Date | null;
  outAt: Date | null;
  /** The day comes from an admin's mark, not from a check-in. */
  marked: boolean;
}

// Comp-off (2026-10-10): working on a holiday is being here today; a Comp Off day is a paid day away — no need to call.
// Half-day leave (2026-10-12): approved time off for half of today — accounted for, no need to call.
const KIND_OF_MARK: Record<DayMark, TodayKind> = {
  full: "present", half: "half", absent: "absent", leave: "leave", half_leave: "half_leave", holiday: "holiday",
  holiday_work: "present", comp_off: "leave",
};

/**
 * One person's day, in the same order of authority as the salary's (`techAttendance.resolveStatus`): an admin's mark
 * first, then a check-in, then the day off — except that a check-in on a day off still says "present": this board
 * answers "who is here", and the person is.
 */
export function todayStatusOf(input: TodayInput): TodayStatus {
  const inAt = input.checkin?.inAt ?? null;
  const outAt = input.checkin?.outAt ?? null;
  if (input.mark) return { kind: KIND_OF_MARK[input.mark], inAt, outAt, marked: true };
  if (input.checkin) return { kind: "present", inAt, outAt, marked: false };
  if (input.dayOff) return { kind: "holiday", inAt, outAt, marked: false };
  if (input.leaveAsked) return { kind: input.leaveAskedHalf ? "half_leave_asked" : "leave_asked", inAt, outAt, marked: false };
  if (!input.checksIn) return { kind: "no_checkin", inAt, outAt, marked: false };
  return { kind: "not_in", inAt, outAt, marked: false };
}

/** The board's groups, in the order she reads them before the meeting: who to call, who is not coming, who is here. */
export type TodayGroup = "call" | "away" | "present" | "unknown" | "off";
export const TODAY_GROUP_ORDER: TodayGroup[] = ["call", "away", "present", "unknown", "off"];

export const TODAY_GROUP_OF: Record<TodayKind, TodayGroup> = {
  not_in: "call",
  leave: "away",
  leave_asked: "away",
  // Away for half the day with leave behind it (or asked for) — nobody needs to chase them before the meeting.
  half_leave: "away",
  half_leave_asked: "away",
  absent: "away",
  present: "present",
  half: "present",
  no_checkin: "unknown",
  holiday: "off",
};

/** Whose card carries Call and WhatsApp: everybody whose presence today nobody can vouch for. */
export const callable = (kind: TodayKind): boolean => kind === "not_in" || kind === "no_checkin";

export interface TodayCounts {
  present: number;
  notIn: number;
  leave: number;
  absent: number;
}

/** The four numbers on top: present (and half days), not checked in, on leave (asked or approved, full or half day), absent. */
export function todayCounts(kinds: TodayKind[]): TodayCounts {
  const c: TodayCounts = { present: 0, notIn: 0, leave: 0, absent: 0 };
  for (const k of kinds) {
    if (k === "present" || k === "half") c.present += 1;
    else if (k === "not_in") c.notIn += 1;
    else if (k === "leave" || k === "leave_asked" || k === "half_leave" || k === "half_leave_asked") c.leave += 1;
    else if (k === "absent") c.absent += 1;
  }
  return c;
}

/** A leave request as the board reads it. `duration` absent = a full day (every request before 2026-10-12). */
type AskedRequest = { memberId: string; fromDate: string; toDate: string; status?: string; duration?: string };

/** Does an undecided request cover `day`? A half-day request covers its one date only. */
const asksFor = (r: AskedRequest, day: string): boolean => {
  if (r.status && r.status !== "pending") return false;
  const to = r.duration === "half_day" ? r.fromDate : (r.toDate || r.fromDate);
  return r.fromDate <= day && day <= to;
};

/** The people with a leave request covering `day` that nobody has decided yet. */
export function leaveAskedOn(requests: AskedRequest[], day: string): Set<string> {
  const out = new Set<string>();
  for (const r of requests) if (asksFor(r, day)) out.add(r.memberId);
  return out;
}

/**
 * Of those, the people whose undecided request for `day` is only a HALF day (2026-10-12) — the board says "Asked for
 * a half-day leave". Somebody who also asked for the whole day is not among them: the whole day is what they asked.
 */
export function halfDayLeaveAskedOn(requests: AskedRequest[], day: string): Set<string> {
  const half = new Set<string>();
  const full = new Set<string>();
  for (const r of requests) {
    if (!asksFor(r, day)) continue;
    (r.duration === "half_day" ? half : full).add(r.memberId);
  }
  for (const uid of full) half.delete(uid);
  return half;
}
