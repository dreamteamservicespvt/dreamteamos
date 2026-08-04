import { buildDocument } from "@/utils/hrTemplates";
import { SALES_INCENTIVE_PERCENT } from "@/utils/salesIncentive";
import { todayIso, probationEndDate } from "@/utils/hrPolicy";
import type { EmployeeProfile } from "@/types/hr";
import type { FrozenLetter, InviteDraft } from "@/types/onboarding";

/**
 * The bridge from a pending hire to the two letters they will be asked to sign.
 *
 * ── Why this shapes an EmployeeProfile instead of writing its own templates ───────────────────
 * There must be exactly one place in this codebase where an offer letter is worded. The templates
 * in utils/hrTemplates already are that place, and they read an `EmployeeProfile`. A candidate has
 * no employment record yet — that is the whole point of the invite — so this builds the profile the
 * templates expect out of the terms the admin typed.
 *
 * The result is that an offer letter generated from an onboarding link and one issued later from
 * the Issue Document dialog are byte-identical for the same facts. Two template sets would have
 * drifted within a month, and the drift would only ever be discovered by a candidate reading
 * something the company did not mean to say.
 */

/**
 * The invite's terms, in the shape the letter templates read.
 *
 * Not written to Firestore — it exists for the length of one render. The real
 * `employee_profiles/{uid}` document is created from the same fields when the candidate finishes.
 */
export function inviteProfile(draft: InviteDraft): EmployeeProfile {
  return {
    uid: "",
    department: draft.department,
    stage: "offer_issued",
    engagementType: draft.engagementType,
    designation: draft.designation,
    workLocation: draft.workLocation,
    reportingToName: draft.reportingToName || null,
    joiningDate: draft.joiningDate,
    probationMonths: draft.probationMonths,
    ctcMonthly: draft.ctcMonthly,
    salaryPayDay: draft.salaryPayDay ?? null,
    workingHours: draft.workingHours,
    workingDays: draft.workingDays,
    shiftDetails: draft.shiftDetails || null,
    // The notice period was agreed when the terms were agreed, so it is an override rather than a
    // ladder rung: the letter must keep saying what this person was actually told, even if policy
    // moves under them later.
    noticeDaysOverride: draft.noticeDays,
    seniorRole: draft.role === "tech_team_leader",
    probationReviews: [],
    assets: [],
    kycDocuments: [],
    separation: null,
  };
}

export interface BuildLettersInput {
  draft: InviteDraft;
  signatory: { name: string; designation: string };
  /** yyyy-MM-dd — the date printed on both letters. Defaults to today. */
  issuedOn?: string;
}

/**
 * Both letters, rendered and ready to be frozen onto the invite.
 *
 * Called once when the link is created, and never again: what the candidate reads on day one is
 * what they sign on day three, whatever anyone edits in between.
 */
export function buildInviteLetters(input: BuildLettersInput): { offer: FrozenLetter; joining: FrozenLetter } {
  const { draft, signatory } = input;
  const issuedOn = input.issuedOn || todayIso();
  const profile = inviteProfile(draft);
  const subject = {
    name: draft.name,
    phone: draft.phone,
    // The personal address, falling back to the login only when the admin left it blank — the same
    // rule `documentSubject` applies everywhere else letters are written.
    email: draft.personalEmail?.trim() || draft.email,
    employeeId: draft.employeeId || null,
    // Sales hires are offered an incentive and a target from day one, so both belong on the offer
    // letter they sign rather than being explained to them afterwards.
    incentivePercent: draft.department === "sales" ? SALES_INCENTIVE_PERCENT : null,
    dailyTarget: draft.dailyTarget ?? null,
    monthlyTarget: draft.monthlyTarget ?? null,
  };

  const offer = buildDocument({
    type: "offer_letter",
    subject,
    profile,
    signatory,
    issuedOn,
    extras: {
      offerLetterNumber: draft.offerLetterNumber,
      candidateAddress: draft.address || null,
      offerValidUntil: draft.offerValidUntil || null,
    },
  });

  const joining = buildDocument({
    type: "appointment_letter",
    subject,
    profile,
    signatory,
    issuedOn,
  });

  return {
    offer: { ...offer, issuedOn },
    joining: { ...joining, issuedOn },
  };
}

/** The probation end date the form shows live as the admin types. */
export const draftProbationEnd = (draft: Pick<InviteDraft, "joiningDate" | "probationMonths" | "engagementType">): string | null =>
  probationEndDate({
    joiningDate: draft.joiningDate,
    probationMonths: draft.probationMonths,
    engagementType: draft.engagementType,
    probationExtendedTo: null,
  });

/**
 * `DTS/OFR/2026/007` — the company's own reference for an offer.
 *
 * Sequence per calendar year, so the number says when the offer was made without anyone decoding
 * it. Suggested, never enforced: an admin who numbers their offers differently must be able to
 * type what their filing system actually uses.
 */
export const suggestOfferNumber = (sequence: number, year = new Date().getFullYear()): string =>
  `DTS/OFR/${year}/${String(Math.max(1, sequence)).padStart(3, "0")}`;
