/**
 * What the company still needs from an employee, and whether it has it.
 *
 * ── Why this list is defined once ─────────────────────────────────────────────────────────────
 * The same ten items are counted in three places: the daily prompt that asks for them, the "My
 * details" progress bar, and the HR lifecycle's "KYC complete" step. When those lists drifted
 * apart, a member could be told they were finished on one screen and 8/10 on another — so
 * `hrPolicy.kycCompletion` reads this array rather than keeping its own copy.
 *
 * ── Why the shape is data rather than JSX ─────────────────────────────────────────────────────
 * The prompt renders itself from this array: label, hint, which kind of input, and the one
 * question that actually matters — `has()`, is it already on file. Adding an eleventh thing the
 * company needs is then one entry here, not an edit to a form, a progress bar and a checklist.
 */
import type { AppUser } from "@/types";
import type { EmployeeProfile, KycDocKind } from "@/types/hr";

export type ProfileStepKey =
  | "fullName"
  | "photo"
  | "signature"
  | "personalEmail"
  | "dob"
  | "bloodGroup"
  | "currentAddress"
  | "permanentAddress"
  | "emergencyContact"
  | "pan"
  | "panCard"
  | "aadhaar"
  | "aadhaarCard";

/** How the prompt should ask for it. */
export type ProfileStepKind =
  | "name" | "photo" | "signature" | "text" | "email" | "date" | "textarea" | "emergency" | "upload";

/**
 * Splitting a stored name into the two boxes the prompt shows.
 *
 * Most people are already stored as "Asha Devi", so asking for a surname from scratch would make
 * them retype what the company already has — and asking "what is your surname?" next to a name
 * box still holding "Asha Devi" invites the answer "Devi", producing "Asha Devi Devi". So the
 * stored name is split on its last word and both boxes come pre-filled: the usual case is a
 * glance and a Save, and a one-word name still gets asked properly.
 *
 * Once a surname has been recorded it wins, because the person themselves chose where the split
 * falls — which matters for the many Indian names this cannot guess (a two-word surname, a
 * patronymic, an initial that is not a given name).
 */
export function splitName(fullName?: string | null, storedSurname?: string | null): {
  given: string;
  surname: string;
} {
  const full = (fullName || "").trim().replace(/\s+/g, " ");
  const stored = (storedSurname || "").trim();

  if (stored) {
    // Peel the recorded surname off the end when it is there; otherwise leave the name alone.
    const suffix = ` ${stored.toLowerCase()}`;
    const given = full.toLowerCase().endsWith(suffix)
      ? full.slice(0, full.length - suffix.length).trim()
      : full;
    return { given, surname: stored };
  }

  const words = full.split(" ").filter(Boolean);
  if (words.length < 2) return { given: full, surname: "" };
  return { given: words.slice(0, -1).join(" "), surname: words[words.length - 1] };
}

/** The full name as it will be stored and shown everywhere. */
export function joinName(given: string, surname: string): string {
  return `${(given || "").trim()} ${(surname || "").trim()}`.trim().replace(/\s+/g, " ");
}

export interface ProfileStep {
  key: ProfileStepKey;
  label: string;
  /** One line under the field. Says why it is wanted, not what to type. */
  hint: string;
  kind: ProfileStepKind;
  /** For an `upload` step: the document kind that satisfies it. */
  docKind?: KycDocKind;
  placeholder?: string;
  /**
   * Whether it is on file. The user record is optional so the HR module can ask the same
   * question about a profile alone — see `hrPolicy.kycCompletion`.
   */
  has: (profile: EmployeeProfile, user?: AppUser | null) => boolean;
}

const hasDoc = (profile: EmployeeProfile, kind: KycDocKind): boolean =>
  (profile.kycDocuments || []).some((d) => d.kind === kind && !!d.url);

/**
 * The joining pack, in the order it is asked for: who you are, how to reach you, who to call,
 * then the statutory identifiers. Identity documents come last on purpose — they are the items
 * someone has to go and find, and putting them first is how a form gets abandoned at step one.
 */
export const PROFILE_STEPS: ProfileStep[] = [
  {
    key: "fullName",
    label: "Your full name",
    hint: "Name and surname, exactly as they appear on your Aadhaar or PAN — this is the name printed on your ID card, your payslips and every letter the company issues you.",
    kind: "name",
    // The surname is what is actually being asked for: the account already carries a name, and
    // recording where the split falls is what turns it into a full legal name we can print.
    has: (p) => !!p.surname?.trim(),
  },
  {
    key: "photo",
    label: "Profile photo",
    hint: "Shown on your ID card, in chat, on calls and across every team list.",
    kind: "photo",
    // Either copy counts. The prompt writes both, so this only matters for anyone who uploaded
    // an avatar before the HR record existed — they are not asked for the same face twice.
    has: (p, u) => !!(p.photoUrl || u?.avatar),
  },
  {
    key: "personalEmail",
    label: "Personal email",
    hint: "Used to reach you about payroll and documents if your work login ever stops working.",
    kind: "email",
    placeholder: "you@example.com",
    has: (p) => !!p.personalEmail?.trim(),
  },
  {
    key: "dob",
    label: "Date of birth",
    hint: "Required on payroll records — and it is how the team knows to wish you.",
    kind: "date",
    has: (p) => !!p.dob,
  },
  {
    key: "bloodGroup",
    label: "Blood group",
    hint: "Printed on your ID card, where it is useful to someone who does not know you.",
    kind: "text",
    placeholder: "O+",
    has: (p) => !!p.bloodGroup?.trim(),
  },
  {
    key: "currentAddress",
    label: "Current address",
    hint: "Where you actually live now — used for statutory records and anything posted to you.",
    kind: "textarea",
    placeholder: "Flat / house, street, area, city, PIN",
    has: (p) => !!p.currentAddress?.trim(),
  },
  {
    key: "permanentAddress",
    label: "Permanent address",
    hint: "Your home town address, if it differs from where you live now. Tick the box to copy the address above.",
    kind: "textarea",
    placeholder: "House, street, village / town, district, state, PIN",
    has: (p) => !!p.permanentAddress?.trim(),
  },
  {
    key: "emergencyContact",
    label: "Emergency contact",
    hint: "One person we would call if something happened to you at work.",
    kind: "emergency",
    // All three, not just the number. A number nobody can put a name or a relationship to is
    // not something anyone would dial in an actual emergency.
    has: (p) => !!(
      p.emergencyContact?.name?.trim()
      && p.emergencyContact?.relation?.trim()
      && p.emergencyContact?.phone?.trim()
    ),
  },
  {
    key: "pan",
    label: "PAN number",
    hint: "Needed to run payroll and file tax on your behalf.",
    kind: "text",
    placeholder: "ABCDE1234F",
    has: (p) => !!p.pan?.trim(),
  },
  {
    key: "panCard",
    label: "PAN card",
    hint: "A photo or scan of the card itself.",
    kind: "upload",
    docKind: "pan",
    has: (p) => hasDoc(p, "pan"),
  },
  {
    key: "aadhaar",
    label: "Aadhaar number",
    hint: "Your identity of record with the company.",
    kind: "text",
    placeholder: "1111 2222 3333",
    has: (p) => !!p.aadhaar?.trim(),
  },
  {
    key: "aadhaarCard",
    label: "Aadhaar card",
    hint: "A photo or scan of the card itself.",
    kind: "upload",
    docKind: "aadhaar",
    has: (p) => hasDoc(p, "aadhaar"),
  },
  /**
   * Last on purpose, and asked for as a photograph rather than a finger-drawn scribble.
   *
   * It goes on appointment letters, confirmations and relieving letters, where it may one day be
   * held next to the signature on someone's bank mandate — and a signature drawn on a phone screen
   * resembles that about as much as handwriting with a stick. Asking for the real one, on paper,
   * is the difference between a document that stands up and one that only looks like it does.
   */
  {
    key: "signature",
    label: "Your signature",
    hint: "Sign on a plain sheet of paper, take a clear photo or screenshot of it, and upload that here. It goes on the letters the company issues you.",
    kind: "signature",
    has: (p) => !!p.signatureUrl,
  },
];

export interface ProfileCompletion {
  done: number;
  total: number;
  percent: number;
  /** The steps still outstanding, in asking order. */
  missing: ProfileStep[];
  complete: boolean;
}

/** How much of the pack is on file for this person. */
export function profileCompletion(
  user: AppUser | null | undefined,
  profile: EmployeeProfile | null | undefined,
): ProfileCompletion {
  // No profile record yet means nothing has been given — not an error, just the first day.
  const p = profile || ({} as EmployeeProfile);
  const missing = PROFILE_STEPS.filter((step) => !step.has(p, user));
  const done = PROFILE_STEPS.length - missing.length;
  return {
    done,
    total: PROFILE_STEPS.length,
    percent: Math.round((done / PROFILE_STEPS.length) * 100),
    missing,
    complete: missing.length === 0,
  };
}

/**
 * Who is asked. Employees only.
 *
 * Admins are excluded because they have no employment record to complete — the company does not
 * hold a PAN card for the person who issues them. External creators are excluded because they
 * are outside people with tool access, not staff.
 */
export function needsProfilePrompt(user: AppUser | null | undefined): boolean {
  if (!user || user.externalCreator) return false;
  return user.role === "sales_member" || user.role === "tech_member" || user.role === "tech_team_leader";
}

/**
 * The key that holds "not today".
 *
 * Scoped to the person AND the day, so "I'll do it later" means exactly that: it comes back
 * tomorrow. A single un-dated flag would be a permanent dismissal, which is the one behaviour
 * this feature must not have.
 */
export function profilePromptDismissedKey(uid: string, day: string): string {
  return `dts_profile_prompt_${uid}_${day}`;
}
