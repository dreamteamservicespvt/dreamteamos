/**
 * Social Media → Attendance: whose days the Social Media Team Lead sees, and who may see them (2026-10-08).
 *
 * ── The owner's answers ───────────────────────────────────────────────────────────────────────────
 * "Add attendance view for the social media team leader." Asked, the owner chose: the people holding a
 * seat (creator, publisher, marketer, assistant) on a Social Media month RUNNING NOW — the only "Social
 * Media team" the data has, since the lead is a flag on a tech member, not a role with a team of its own;
 * VIEW ONLY — marking a day changes salary and leave already has its approvers; the PAY-CYCLE GRID the
 * admins already read (Team Attendance, 10th → 9th); INSIDE Social Media, beside Cards / Insights /
 * Calendar / Money.
 *
 * Kept pure so who is listed is tested on its own — a person missing here is a person the lead cannot see.
 */
import type { SmmCampaign } from "@/types/smm";
import { cyclePhase } from "@/utils/smmPackage";

/** The view is the Social Media Team Lead's, and the admins who own tech attendance can open it too. */
export function canSeeSmmAttendance(user: { role?: string; smmLeader?: boolean } | null | undefined): boolean {
  if (!user) return false;
  if (user.smmLeader) return true;
  return user.role === "main_admin" || user.role === "tech_admin";
}

export type SmmSeat = "Creator" | "Publisher" | "Marketer" | "Assistant";
const SEAT_ORDER: SmmSeat[] = ["Creator", "Publisher", "Marketer", "Assistant"];

/** One person on the Social Media months running now: their seats and the clients they work on. */
export interface SmmTeamPerson {
  uid: string;
  name: string;
  seats: SmmSeat[];
  /** Business names of the running months they hold a seat on, A–Z. */
  clients: string[];
}

/** A month running today: active, not a past month filled in later, its dates around today. */
export function isRunningMonth(c: SmmCampaign, today: string): boolean {
  return c.status === "active" && !c.history && !!c.cycle && cyclePhase(c.cycle, today) === "running";
}

/**
 * Everybody holding a seat on a month running today, once each, by name — with their seats and clients.
 * A month on hold (ended, no renewal decision yet), one not started and a past month are left out: the
 * owner chose the months running now.
 */
export function smmTeamPeople(campaigns: SmmCampaign[], today: string): SmmTeamPerson[] {
  const byUid = new Map<string, { name: string; seats: Set<SmmSeat>; clients: Set<string> }>();
  const add = (uid: string | undefined, name: string | undefined, seat: SmmSeat, client: string) => {
    if (!uid) return;
    const entry = byUid.get(uid) ?? { name: name || "", seats: new Set<SmmSeat>(), clients: new Set<string>() };
    if (!entry.name && name) entry.name = name;
    entry.seats.add(seat);
    if (client) entry.clients.add(client);
    byUid.set(uid, entry);
  };
  for (const c of campaigns) {
    if (!isRunningMonth(c, today)) continue;
    const client = (c.businessName || c.clientName || "").trim();
    add(c.team?.creator?.uid, c.team?.creator?.name, "Creator", client);
    add(c.team?.publisher?.uid, c.team?.publisher?.name, "Publisher", client);
    add(c.team?.marketer?.uid, c.team?.marketer?.name, "Marketer", client);
    for (const a of c.team?.assistants || []) add(a.uid, a.name, "Assistant", client);
  }
  return [...byUid.entries()]
    .map(([uid, e]) => ({
      uid,
      name: e.name || "Unnamed",
      seats: SEAT_ORDER.filter((s) => e.seats.has(s)),
      clients: [...e.clients].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "Creator · Publisher — 3 clients" — what a row says about a person under their name. */
export function seatLine(person: Pick<SmmTeamPerson, "seats" | "clients">): string {
  const n = person.clients.length;
  return `${person.seats.join(" · ")}${n ? ` — ${n} client${n === 1 ? "" : "s"}` : ""}`;
}
