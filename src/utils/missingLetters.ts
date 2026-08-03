/**
 * Who on the team is missing the letters every employee should hold.
 *
 * Pure, and separate from the panel that renders it, so the rule that decides whether somebody can
 * safely be issued a letter — the one that stops a blank salary going out under an admin's
 * signature — can be tested without rendering anything.
 */
import type { AppUser } from "@/types";
import type { EmployeeProfile, HrDocument, HrDocumentType } from "@/types/hr";

/** The two letters every employee should hold. Order matters: offer first, then appointment. */
const CORE: HrDocumentType[] = ["offer_letter", "appointment_letter"];

export interface MissingLettersRow {
  member: AppUser;
  profile: EmployeeProfile;
  missing: HrDocumentType[];
  /** Why this person cannot be issued to yet — empty when they are ready. */
  blockers: string[];
}

/**
 * Who is missing what, and who cannot be written to yet.
 *
 * A letter is generated from the employment record, so a record with no designation, joining date
 * or salary produces a letter with holes in it. Those people are surfaced with the reason rather
 * than silently skipped — the admin needs to know whose terms to fill in.
 */
export function findMissingLetters(
  members: AppUser[],
  profiles: Map<string, EmployeeProfile>,
  documents: HrDocument[],
): MissingLettersRow[] {
  const byMember = new Map<string, Set<HrDocumentType>>();
  documents.forEach((d) => {
    if (!byMember.has(d.memberId)) byMember.set(d.memberId, new Set());
    byMember.get(d.memberId)!.add(d.type);
  });

  return members
    .filter((m) => m.isActive !== false && !m.externalCreator)
    .map((member) => {
      const profile = profiles.get(member.uid);
      const held = byMember.get(member.uid) || new Set<HrDocumentType>();
      const missing = CORE.filter((t) => !held.has(t));
      const blockers: string[] = [];
      if (!profile) blockers.push("no employment record");
      else {
        if (!profile.designation?.trim()) blockers.push("no designation");
        if (!profile.joiningDate) blockers.push("no joining date");
        if (!profile.ctcMonthly && profile.ctcMonthly !== 0) blockers.push("no salary");
      }
      return { member, profile: (profile || { uid: member.uid }) as EmployeeProfile, missing, blockers };
    })
    .filter((row) => row.missing.length > 0)
    .sort((a, b) => a.member.name.localeCompare(b.member.name));
}
