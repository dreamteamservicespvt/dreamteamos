import type { UserRole } from "@/types";
import type { Department, EngagementType, HrTime } from "@/types/hr";

/**
 * A pending hire: `onboarding_invites/{id}`.
 *
 * ── Why one self-contained document ───────────────────────────────────────────────────────────
 * Everything about a person who has been offered a job — the terms an admin typed, both letters in
 * full, the company's signature, and their own two signatures as they arrive — lives here and
 * nowhere else. Until they accept, they have no account, no employment record and no documents,
 * because they have not agreed to anything yet. A candidate who never replies leaves exactly one
 * document behind, which an admin can revoke and forget.
 *
 * When they finish, this document is fanned out into the records the rest of the app already reads
 * (users, employee_profiles, hr_documents, member_credentials) and is never read again except as
 * history. See api/onboarding.ts.
 *
 * ── Why the letters are stored, not regenerated ───────────────────────────────────────────────
 * `offerLetter.bodyText` and `joiningLetter.bodyText` are rendered once, when the link is created,
 * and frozen — the same discipline `HrDocument.bodyText` follows. A signed letter must keep saying
 * what the person actually signed, whatever the admin edits or the policy says afterwards.
 *
 * ── The rule that must be set outside this repository ─────────────────────────────────────────
 * This document holds a salary, and after completion a readable password. Like member_credentials,
 * its protection is access control set in the Firebase console:
 *
 *   match /onboarding_invites/{id} {
 *     allow read, write: if request.auth != null
 *       && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
 *          in ['main_admin', 'tech_admin', 'sales_admin'];
 *   }
 *
 * The candidate never reads it directly — every step of their journey goes through the serverless
 * endpoint, which is why no rule has to be opened to the public for this feature to work.
 */

export type InviteStatus =
  | "sent"            // link created, nothing signed yet
  | "offer_accepted"  // offer signed; the joining letter is the next step
  | "completed"       // both signed, account created
  | "declined"        // the candidate refused one of the letters, with a reason
  | "revoked";        // the admin cancelled it

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  sent: "Link sent",
  offer_accepted: "Offer accepted",
  completed: "Joined",
  declined: "Declined",
  revoked: "Cancelled",
};

/** A letter as it was written at invite time, and never rewritten. */
export interface FrozenLetter {
  title: string;
  bodyText: string;
  issuedOn: string;   // yyyy-MM-dd
}

export interface OnboardingInvite {
  id: string;
  department: Department;
  role: UserRole;

  /** Four digits, checked on the server. Never sent to the candidate's browser. */
  accessCode: string;
  failedAttempts?: number;
  /** Epoch ms. The link stops answering until this passes. */
  lockedUntil?: number;

  // ── The person ──
  name: string;
  /** Lower-cased. This becomes their login. */
  email: string;
  /**
   * The address the employee keeps — their own, not the company's.
   *
   * Collected here so it exists from the first document onward. Every letter prints it, because the
   * login is revoked when someone leaves and that is precisely when a relieving letter, a full and
   * final settlement or an employment verification has to reach them. Seeded onto the employment
   * record at completion, where the rest of the lifecycle reads it.
   */
  personalEmail?: string | null;
  phone: string;
  address?: string | null;

  // ── The position ──
  designation: string;
  engagementType: EngagementType;
  employeeId?: string | null;
  reportingToName?: string | null;
  workLocation: string;

  // ── Dates ──
  joiningDate: string;                  // yyyy-MM-dd
  probationMonths: number;
  offerValidUntil?: string | null;      // yyyy-MM-dd

  // ── Money ──
  ctcMonthly: number;
  /** Day of the month salary is paid, printed on the joining letter. */
  salaryPayDay?: number | null;
  /** Sales only — seeded onto the user document so targets work from day one. */
  target?: number | null;
  dailyTarget?: number | null;
  monthlyTarget?: number | null;
  /** Tech only. */
  googleDriveBaseUrl?: string | null;

  // ── Schedule ──
  workingDays: string;
  workingHours: string;
  shiftDetails?: string | null;
  noticeDays: number;

  offerLetterNumber: string;

  offerLetter: FrozenLetter;
  joiningLetter: FrozenLetter;

  // ── The company side, captured when the link is created ──
  issuedById: string;
  issuedByName: string;
  /** "CTO (Tech Admin)" or "CEO (Sales Admin)", unless the admin set their own in Settings. */
  issuedByDesignation: string;
  issuedOn: string;                     // yyyy-MM-dd
  companySignatureUrl: string;
  /** The company seal as it stood when the invite was created. */
  companyStampUrl?: string | null;

  // ── The candidate's side ──
  offerSignatureUrl?: string | null;
  offerAcceptedOn?: string | null;      // yyyy-MM-dd
  offerAcceptedAt?: HrTime | null;
  joiningSignatureUrl?: string | null;
  joiningAcceptedOn?: string | null;    // yyyy-MM-dd
  joiningAcceptedAt?: HrTime | null;

  status: InviteStatus;
  declinedStep?: "offer" | "joining" | null;
  declinedReason?: string | null;
  declinedAt?: HrTime | null;

  // ── Produced at completion ──
  createdUid?: string | null;
  /** Readable, like member_credentials — the admin has to be able to send it again. */
  generatedPassword?: string | null;
  completedAt?: HrTime | null;

  createdAt: HrTime;
  createdBy: string;
}

/**
 * What the admin actually types: the terms, and nothing the system produces for itself.
 *
 * Everything omitted here — the id, the code, both rendered letters, the company signature, the
 * candidate's signatures, the status, the account that comes out at the end — is derived or
 * captured, never entered. Keeping the form's shape as a type means a field added to the invite
 * cannot be silently forgotten by the form, or vice versa.
 */
export type InviteDraft = Omit<
  OnboardingInvite,
  | "id" | "accessCode" | "failedAttempts" | "lockedUntil"
  | "offerLetter" | "joiningLetter"
  | "issuedById" | "issuedByName" | "issuedByDesignation" | "issuedOn" | "companySignatureUrl"
  | "offerSignatureUrl" | "offerAcceptedOn" | "offerAcceptedAt"
  | "joiningSignatureUrl" | "joiningAcceptedOn" | "joiningAcceptedAt"
  | "status" | "declinedStep" | "declinedReason" | "declinedAt"
  | "createdUid" | "generatedPassword" | "completedAt" | "createdAt" | "createdBy"
>;

/**
 * What the candidate's browser is allowed to know.
 *
 * Built on the server by `publicView` and returned from every action. The access code, the failure
 * counters, the generated password and the new uid are all absent by construction rather than by
 * being deleted afterwards — a projection you have to remember to strip is one you eventually
 * forget to strip.
 */
export interface InvitePublicView {
  id: string;
  status: InviteStatus;
  name: string;
  email: string;
  phone: string;
  department: Department;
  designation: string;
  joiningDate: string;
  offerValidUntil?: string | null;
  /** True once the offer's acceptance deadline has passed with no acceptance. */
  expired: boolean;

  offerLetter: FrozenLetter;
  joiningLetter: FrozenLetter;

  issuedByName: string;
  issuedByDesignation: string;
  companySignatureUrl: string;
  companyStampUrl?: string | null;

  offerSignatureUrl?: string | null;
  offerAcceptedOn?: string | null;
  joiningSignatureUrl?: string | null;
  joiningAcceptedOn?: string | null;

  declinedStep?: "offer" | "joining" | null;
  declinedReason?: string | null;
}

/** Handed over exactly once, when the joining letter is signed. */
export interface IssuedCredentials {
  email: string;
  password: string;
  loginUrl: string;
}

/** Which screen the candidate belongs on, given what they have signed. */
export function stepForStatus(status: InviteStatus): "offer" | "joining" | "credentials" | "closed" {
  if (status === "completed") return "credentials";
  if (status === "offer_accepted") return "joining";
  if (status === "declined" || status === "revoked") return "closed";
  return "offer";
}
