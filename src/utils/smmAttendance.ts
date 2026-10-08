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

/** One person on the Social Media team: their seats, the clients they work on, and why they are listed. */
export interface SmmTeamPerson {
  uid: string;
  name: string;
  seats: SmmSeat[];
  /** Business names of the board's months they work on, A–Z. */
  clients: string[];
  /** On a month (a seat or a post) — or added to the list by hand by the lead. */
  source: "months" | "added";
}

/**
 * A month on the Social Media board: `active` — running, on hold (ended, no renewal decision yet), not started yet,
 * or waiting for its setup. Renewed, finished, not-renewing, removed and deleted months are off the board.
 */
export function isBoardMonth(c: SmmCampaign): boolean {
  return c.status === "active";
}

/**
 * Everybody working on a month on the board, once each, A–Z: the month's seats (creator, publisher, marketer,
 * assistants) and each post's own maker and publisher — with their seats and clients.
 */
export function smmTeamFromMonths(campaigns: SmmCampaign[]): SmmTeamPerson[] {
  const byUid = new Map<string, { name: string; seats: Set<SmmSeat>; clients: Set<string> }>();
  const add = (uid: string | null | undefined, name: string | null | undefined, seat: SmmSeat, client: string) => {
    if (!uid) return;
    const entry = byUid.get(uid) ?? { name: name || "", seats: new Set<SmmSeat>(), clients: new Set<string>() };
    if (!entry.name && name) entry.name = name;
    entry.seats.add(seat);
    if (client) entry.clients.add(client);
    byUid.set(uid, entry);
  };
  for (const c of campaigns) {
    if (!isBoardMonth(c)) continue;
    const client = (c.businessName || c.clientName || "").trim();
    add(c.team?.creator?.uid, c.team?.creator?.name, "Creator", client);
    add(c.team?.publisher?.uid, c.team?.publisher?.name, "Publisher", client);
    add(c.team?.marketer?.uid, c.team?.marketer?.name, "Marketer", client);
    for (const a of c.team?.assistants || []) add(a.uid, a.name, "Assistant", client);
    // A post may be given to somebody who holds no seat on the month — they work on it all the same.
    for (const item of c.items || []) {
      add(item.makerUid, item.makerName, "Creator", client);
      add(item.publisherUid, item.publisherName, "Publisher", client);
    }
  }
  return [...byUid.entries()]
    .map(([uid, e]) => ({
      uid,
      name: e.name || "Unnamed",
      seats: SEAT_ORDER.filter((s) => e.seats.has(s)),
      clients: [...e.clients].sort((a, b) => a.localeCompare(b)),
      source: "months" as const,
    }))
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
    out.push({ uid, name: nameOf(uid) || "Unnamed", seats: [], clients: [], source: "added" });
    onList.add(uid);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** "Creator · Publisher — 3 clients" — what a card says about a person under their name. */
export function seatLine(person: Pick<SmmTeamPerson, "seats" | "clients" | "source">): string {
  if (person.seats.length === 0) return person.source === "added" ? "Added to the team by the lead" : "";
  const n = person.clients.length;
  return `${person.seats.join(" · ")}${n ? ` — ${n} client${n === 1 ? "" : "s"}` : ""}`;
}

// ─── Today ─────────────────────────────────────────────────────────────────────────────────────────

/** An admin's mark for a day (techAttendance's statuses — kept here as a plain union so this file stays pure). */
export type DayMark = "full" | "half" | "absent" | "leave" | "holiday";

/**
 * What a person's day says today:
 *   present / half — checked in (or marked so) · not_in — no check-in yet, nothing explains it (the people to call)
 *   leave — approved leave · leave_asked — a leave request for today nobody has decided yet · absent — marked absent
 *   holiday — Sunday or an announced holiday · no_checkin — a team leader: they never check in, so nobody can tell
 */
export type TodayKind = "present" | "half" | "not_in" | "leave" | "leave_asked" | "absent" | "holiday" | "no_checkin";

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
}

export interface TodayStatus {
  kind: TodayKind;
  inAt: Date | null;
  outAt: Date | null;
  /** The day comes from an admin's mark, not from a check-in. */
  marked: boolean;
}

const KIND_OF_MARK: Record<DayMark, TodayKind> = { full: "present", half: "half", absent: "absent", leave: "leave", holiday: "holiday" };

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
  if (input.leaveAsked) return { kind: "leave_asked", inAt, outAt, marked: false };
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

/** The four numbers on top: present (and half days), not checked in, on leave (asked or approved), absent. */
export function todayCounts(kinds: TodayKind[]): TodayCounts {
  const c: TodayCounts = { present: 0, notIn: 0, leave: 0, absent: 0 };
  for (const k of kinds) {
    if (k === "present" || k === "half") c.present += 1;
    else if (k === "not_in") c.notIn += 1;
    else if (k === "leave" || k === "leave_asked") c.leave += 1;
    else if (k === "absent") c.absent += 1;
  }
  return c;
}

/** The people with a leave request covering `day` that nobody has decided yet. */
export function leaveAskedOn(requests: { memberId: string; fromDate: string; toDate: string; status?: string }[], day: string): Set<string> {
  const out = new Set<string>();
  for (const r of requests) {
    if (r.status && r.status !== "pending") continue;
    if (r.fromDate <= day && day <= (r.toDate || r.fromDate)) out.add(r.memberId);
  }
  return out;
}
