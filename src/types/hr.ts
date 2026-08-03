import type { FieldValue, Timestamp } from "firebase/firestore";
import type { UserRole } from "@/types";

/**
 * Employee lifecycle (HR) domain model.
 *
 * One rule shapes everything here: **an employee's whole HR record is one document**
 * (`employee_profiles/{uid}`). KYC, employment terms, probation reviews, issued assets and the
 * exit record all live together, because every screen that needs one of them needs the others
 * in the same breath — and because a Firestore free-tier budget cannot afford five reads where
 * one will do.
 *
 * The single exception is `hr_documents`: signed paperwork is many-per-employee, immutable once
 * issued, and queried across the team ("who still hasn't signed their NDA?"), so it earns its
 * own collection — exactly like `agreements`, which it deliberately mirrors.
 *
 * Collections
 *   employee_profiles — one per employee, id = uid
 *   hr_documents      — issued letters/agreements awaiting or carrying signatures
 *
 * Existing collections this builds on (unchanged): users, agreements, employee_bank, attendance.
 */

/** A Firestore timestamp field: a `Timestamp` on read, the `serverTimestamp()` sentinel on write. */
export type HrTime = Timestamp | FieldValue;

// ─── Department & engagement ────────────────────────────────────────────────

/** Which side of the company an employee sits on — decides whose signature signs their papers. */
export type Department = "tech" | "sales";

/**
 * How someone is engaged.
 *
 * An internship is its own engagement type, NOT a probation outcome: it has its own duration,
 * stipend and terms, and it does not end in "confirmed full-time" by default. Probation is a
 * phase *inside* full-time / part-time employment, which is why it lives in `EmploymentStage`.
 */
export type EngagementType = "full_time" | "part_time" | "intern" | "contract";

export const ENGAGEMENT_LABELS: Record<EngagementType, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  intern: "Intern",
  contract: "Contract",
};

/** Where someone is in the lifecycle. Moves forward only, except an explicit exit-withdrawal. */
export type EmploymentStage =
  | "offer_issued"    // offer letter sent, not yet accepted
  | "offer_accepted"  // accepted, not yet joined
  | "probation"       // joined, under evaluation
  | "confirmed"       // probation passed (or never applicable, e.g. a short internship)
  | "notice_period"   // resignation/termination recorded, serving notice
  | "exited";         // last working day passed and exit formalities closed

export const STAGE_LABELS: Record<EmploymentStage, string> = {
  offer_issued: "Offer Issued",
  offer_accepted: "Offer Accepted",
  probation: "Probation",
  confirmed: "Confirmed",
  notice_period: "Notice Period",
  exited: "Exited",
};

// ─── KYC / personal record ──────────────────────────────────────────────────

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export type KycDocKind =
  | "photo"
  | "aadhaar"
  | "pan"
  | "education"
  | "experience"
  | "bank_proof"
  | "other";

export const KYC_DOC_LABELS: Record<KycDocKind, string> = {
  photo: "Photograph",
  aadhaar: "Aadhaar",
  pan: "PAN",
  education: "Education certificate",
  experience: "Experience letter",
  bank_proof: "Bank proof",
  other: "Other",
};

/** One uploaded scan. Files live on Cloudinary; only the URL is stored. */
export interface KycDocument {
  id: string;
  kind: KycDocKind;
  label: string;
  url: string;
  /** `Timestamp.now()` — serverTimestamp() is not permitted inside an array. */
  uploadedAt: HrTime;
  uploadedByName: string;
}

// ─── Company assets ─────────────────────────────────────────────────────────

export type AssetKind =
  | "id_card"
  | "laptop"
  | "phone"
  | "sim"
  | "email"
  | "software"
  | "access_card"
  | "other";

export const ASSET_LABELS: Record<AssetKind, string> = {
  id_card: "ID card",
  laptop: "Laptop",
  phone: "Phone",
  sim: "SIM / number",
  email: "Email account",
  software: "Software account",
  access_card: "Keys / access card",
  other: "Other",
};

/**
 * One thing handed to an employee, and its journey back.
 *
 * Assets that arrive later simply get appended — this is a running record, not a one-time form,
 * which is why it is an array on the profile rather than a snapshot taken at joining.
 */
export interface AssetRecord {
  id: string;
  kind: AssetKind;
  label: string;
  /** Serial number, phone number, account name — whatever identifies this specific item. */
  identifier?: string | null;
  issuedOn: string;            // yyyy-MM-dd
  issuedByName: string;
  note?: string | null;
  /** The employee confirmed receipt from their own profile. Their acknowledgement, not ours. */
  acknowledgedAt?: HrTime | null;
  returnedOn?: string | null;  // yyyy-MM-dd
  returnCondition?: "good" | "damaged" | "lost" | null;
  returnNote?: string | null;
}

// ─── Probation review ───────────────────────────────────────────────────────

export type ProbationMilestone = "day_30" | "day_60" | "day_90" | "adhoc";

export const MILESTONE_LABELS: Record<ProbationMilestone, string> = {
  day_30: "30-day review",
  day_60: "60-day review",
  day_90: "Final (90-day) review",
  adhoc: "Interim review",
};

/** What a probation review actually judges. Straight from the company's evaluation policy. */
export const REVIEW_CRITERIA = [
  { key: "attendance", label: "Attendance" },
  { key: "discipline", label: "Discipline" },
  { key: "quality", label: "Work quality" },
  { key: "productivity", label: "Productivity / targets" },
  { key: "communication", label: "Communication" },
  { key: "teamwork", label: "Teamwork" },
  { key: "learning", label: "Learning ability" },
  { key: "policy", label: "Policy adherence" },
] as const;

export type ReviewCriterionKey = (typeof REVIEW_CRITERIA)[number]["key"];

export type ReviewOutcome = "on_track" | "needs_improvement" | "at_risk";

export const REVIEW_OUTCOME_LABELS: Record<ReviewOutcome, string> = {
  on_track: "On track",
  needs_improvement: "Needs improvement",
  at_risk: "At risk",
};

export interface ProbationReview {
  id: string;
  milestone: ProbationMilestone;
  reviewedOn: string;          // yyyy-MM-dd
  reviewedById: string;
  reviewedByName: string;
  /** 1–5 per criterion. Partial on purpose — a reviewer may not judge every axis. */
  scores: Partial<Record<ReviewCriterionKey, number>>;
  /** Mean of the scores actually given, 1 decimal. Stored so history survives a criteria change. */
  averageScore: number;
  strengths?: string | null;
  improvements?: string | null;
  outcome: ReviewOutcome;
  createdAt: HrTime;
}

// ─── Separation / exit ──────────────────────────────────────────────────────

export type SeparationType = "resignation" | "termination" | "end_of_contract" | "misconduct";

export const SEPARATION_LABELS: Record<SeparationType, string> = {
  resignation: "Resignation",
  termination: "Termination by company",
  end_of_contract: "End of contract / internship",
  misconduct: "Misconduct proceeding",
};

export type SeparationStatus =
  | "submitted"       // received, not yet acknowledged by HR
  | "acknowledged"    // HR confirmed the last working day
  | "serving_notice"  // notice period running
  | "completed"       // exit formalities closed
  | "withdrawn";      // resignation pulled back before the last working day

export const SEPARATION_STATUS_LABELS: Record<SeparationStatus, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  serving_notice: "Serving notice",
  completed: "Exit completed",
  withdrawn: "Withdrawn",
};

/**
 * A separation in progress, from the day it is submitted to the day the relieving letter is issued.
 *
 * Modelled as ONE record on the profile rather than a status flag, because every field here is a
 * question someone asks later: when was it submitted, what notice applied, what was actually
 * served, were the assets returned, was the account disabled, was the settlement paid.
 */
export interface SeparationRecord {
  type: SeparationType;
  reason: string;
  /** The date the resignation/termination was recorded — the notice-period anchor. */
  submittedOn: string;         // yyyy-MM-dd
  submittedById: string;
  submittedByName: string;
  /** Notice policy applied at submission time, snapshotted so a later policy change can't rewrite it. */
  noticeDays: number;
  /** submittedOn + noticeDays by default; editable, because early release is a mutual decision. */
  lastWorkingDay: string;      // yyyy-MM-dd
  /** The last working day was brought forward by agreement. */
  earlyRelease?: boolean;
  /** Notice days not served. Their treatment follows the contract — this only records the fact. */
  waivedDays?: number;
  status: SeparationStatus;
  acknowledgedByName?: string | null;
  acknowledgedAt?: HrTime | null;
  // Exit checklist — handover → assets → access → settlement
  handoverNotes?: string | null;
  handoverDoneOn?: string | null;
  assetsReturnedOn?: string | null;
  accessRevokedOn?: string | null;
  finalSettlementAmount?: number | null;
  finalSettlementOn?: string | null;
  finalSettlementNote?: string | null;
  completedOn?: string | null;
  withdrawnOn?: string | null;
  withdrawnReason?: string | null;
}

// ─── The employee profile ───────────────────────────────────────────────────

export interface EmployeeProfile {
  uid: string;
  department: Department;
  stage: EmploymentStage;

  // Personal / KYC — collected on joining day, kept current afterwards
  photoUrl?: string | null;
  /**
   * The employee's own signature, as an image.
   *
   * Photographed off paper rather than drawn with a finger: a signature traced on a phone screen
   * looks nothing like the one on the person's bank records, and these are the papers where that
   * comparison gets made. Held on the employment record so it is asked for once, not per document.
   */
  signatureUrl?: string | null;
  signatureUpdatedAt?: unknown;
  /**
   * Family name, recorded separately from `users.name`.
   *
   * The account only ever held one free-text name, which is fine for a chat list and useless for
   * a payslip: nothing could say where the given name ended. Storing the surname explicitly makes
   * the split the employee's own decision rather than a guess at the last word — which guesses
   * wrong for a two-word surname, a patronymic, or an initial written first.
   */
  surname?: string | null;
  dob?: string | null;             // yyyy-MM-dd
  personalEmail?: string | null;
  altPhone?: string | null;
  bloodGroup?: string | null;
  currentAddress?: string | null;
  permanentAddress?: string | null;
  emergencyContact?: EmergencyContact | null;
  /** Government identifiers. Displayed masked; only revealed on an explicit click. */
  pan?: string | null;
  aadhaar?: string | null;
  kycDocuments?: KycDocument[];
  kycCompletedOn?: string | null;

  // Employment terms — the same set the offer letter and appointment letter are built from
  engagementType?: EngagementType;
  designation?: string | null;
  workLocation?: string | null;
  reportingToName?: string | null;
  joiningDate?: string | null;     // yyyy-MM-dd
  /** 0 means no probation (a short internship, say). Defaults to 3 for full/part-time. */
  probationMonths?: number | null;
  /**
   * The salary once training is complete — and the figure the annual CTC is built from.
   *
   * Deliberately the *post-training* number rather than an average. Somebody trains for three
   * months on a lower figure and then earns this; quoting a blended annual sum would state a
   * salary they are never actually paid, on a letter they will show to a bank.
   */
  ctcMonthly?: number | null;

  /**
   * A paid training period at a lower salary, before the real one starts.
   *
   * Separate from `probationMonths`, which is an *evaluation* window and drives reviews, the
   * lifecycle stage and the notice ladder. This is purely about money: how long the trainee rate
   * applies and what it is. They often run for the same number of months, and they are still two
   * different facts — an employee can be past training and still on probation.
   *
   * Both blank means no training period, and every letter reads exactly as it did before.
   */
  trainingMonths?: number | null;
  trainingSalaryMonthly?: number | null;
  /**
   * Day of the month salary is paid, printed on the appointment letter.
   *
   * On the employment record rather than a per-letter question because it is a standing fact about
   * how this person is paid, and a letter that had to be told it every time would print a different
   * answer each time someone forgot.
   */
  salaryPayDay?: number | null;
  workingHours?: string | null;
  workingDays?: string | null;
  /** Named shift, where the role has one ("General shift", "2 PM – 11 PM"). Most roles have none. */
  shiftDetails?: string | null;

  /**
   * When a fixed-term internship ends.
   *
   * A standing fact about the engagement rather than a per-letter question, for the same reason
   * `salaryPayDay` is: a letter that had to be told it every time would print a different answer
   * each time somebody forgot. It matters more than most fields here because an intern's college
   * asks for the dates in writing before granting permission to attend.
   */
  internshipEndDate?: string | null;
  /**
   * Whether the letters offer to extend the internship on performance.
   *
   * A clause a college reads closely: an internship that can be extended is one whose end date is
   * not a promise, and they want to know which it is before granting permission.
   */
  internshipExtendable?: boolean;
  /** Written notice, in days, for ending the internship early. Blank means the clause is omitted. */
  internshipNoticeDays?: number | null;
  /**
   * What this intern will actually be trained on, where it differs from the department default.
   *
   * Interns hand their offer and joining letters to a college to get permission to attend, and
   * what that college is looking for is evidence of structured learning — not a salary figure.
   * Left blank, the letters print the department's standard training list.
   */
  internshipFocus?: string | null;
  /** Team lead or other critical senior role — attracts the longer notice period. */
  seniorRole?: boolean;
  /** Set only when this person's contract genuinely differs from policy. */
  noticeDaysOverride?: number | null;

  /**
   * The employee entered their own employment terms and no admin has confirmed them yet.
   *
   * Employees fill this in themselves — they know their own joining date and what they were
   * offered, and waiting on an admin leaves the record empty. But these same fields are what the
   * offer letter and the appointment letter print, under the company's signature, so a figure
   * nobody at the company has agreed to must not silently become a signed document. The flag is
   * what lets both be true: the employee fills it, the admin confirms it, and issuing a document
   * on unconfirmed terms warns first.
   */
  termsSelfDeclared?: boolean;
  termsSelfDeclaredOn?: string | null;
  termsConfirmedByName?: string | null;
  termsConfirmedOn?: string | null;

  // Offer
  offerIssuedOn?: string | null;
  offerAcceptedOn?: string | null;

  // Probation
  probationReviews?: ProbationReview[];
  /** Set when probation is extended rather than concluded. Stage stays "probation". */
  probationExtendedTo?: string | null;
  probationExtensionNote?: string | null;
  confirmedOn?: string | null;

  // Assets
  assets?: AssetRecord[];

  // Exit
  separation?: SeparationRecord | null;

  createdAt?: HrTime;
  updatedAt?: HrTime;
  updatedByName?: string;
}

// ─── Issued documents ───────────────────────────────────────────────────────

/**
 * The paperwork the lifecycle produces.
 *
 * The order of this union — and of every list derived from it — is the order an employment
 * actually happens in: hire, employ, discipline, part. That ordering is load-bearing, not
 * cosmetic. It is what the Issue-a-document dropdown shows, and an admin reaching for the next
 * letter scans down the list expecting to find it below the last one they sent. Sorting these
 * alphabetically would put "Experience Letter" above "Offer Letter" and make the list useless.
 *
 * Two pairs are deliberately merged rather than split into four types: the appointment letter
 * carries the full employment agreement, and the NDA carries the IP-assignment terms. Splitting
 * them would mean chasing two more signatures for clauses the employee has already signed.
 */
export type HrDocumentType =
  // Recruitment & joining
  | "offer_letter"
  | "appointment_letter"
  | "nda"
  | "policy_acknowledgement"
  // During employment
  | "confirmation_letter"
  | "probation_extension"
  | "increment_letter"
  | "promotion_letter"
  // Conduct — show cause first, warning only after an answer. That order is the due process.
  | "show_cause_notice"
  | "warning_letter"
  // Exit
  | "resignation_acceptance"
  | "relieving_letter"
  | "experience_letter"
  | "full_final_settlement";

export const HR_DOCUMENT_LABELS: Record<HrDocumentType, string> = {
  offer_letter: "Offer Letter",
  appointment_letter: "Appointment Letter / Employment Agreement",
  nda: "NDA, Confidentiality & IP Agreement",
  policy_acknowledgement: "Company Policy Acknowledgement",
  confirmation_letter: "Confirmation Letter",
  probation_extension: "Probation Extension Letter",
  increment_letter: "Increment Letter",
  promotion_letter: "Promotion Letter",
  show_cause_notice: "Show Cause Notice",
  warning_letter: "Warning Letter",
  resignation_acceptance: "Resignation Acceptance Letter",
  relieving_letter: "Relieving Letter",
  experience_letter: "Experience Letter",
  full_final_settlement: "Full & Final Settlement Letter",
};

/**
 * The document list, grouped the way the dropdown shows it.
 *
 * One array, so the picker, the checklist and any future report all walk the same order and none
 * of them can drift from the others.
 */
export const HR_DOCUMENT_GROUPS: { label: string; types: HrDocumentType[] }[] = [
  {
    label: "Recruitment & joining",
    types: ["offer_letter", "appointment_letter", "nda", "policy_acknowledgement"],
  },
  {
    label: "During employment",
    types: ["confirmation_letter", "probation_extension", "increment_letter", "promotion_letter"],
  },
  {
    label: "Conduct",
    types: ["show_cause_notice", "warning_letter"],
  },
  {
    label: "Exit",
    types: ["resignation_acceptance", "relieving_letter", "experience_letter", "full_final_settlement"],
  },
];

/** Every type, in lifecycle order. The single source of ordering for lists that are not grouped. */
export const HR_DOCUMENT_ORDER: HrDocumentType[] = HR_DOCUMENT_GROUPS.flatMap((g) => g.types);

export type HrDocumentStatus = "issued" | "signed" | "declined";

/**
 * One company-side signature on an issued document, frozen as it stood the day it went out.
 *
 * A letter is a record of what was issued, so the name, title and signature image are copied onto
 * the document rather than read live from company settings. A CEO who leaves next year must not
 * silently un-sign every letter the company ever sent.
 */
export interface IssuedSignatory {
  /** Which office signed — `ceo`, `cto`, or `issuer` when it fell back to the admin who issued it. */
  key: "ceo" | "cto" | "issuer";
  name: string;
  designation: string;
  signatureUrl?: string | null;
}

/**
 * One issued document.
 *
 * `bodyText` is the fully rendered text, frozen at issue time. It is never regenerated from the
 * profile afterwards — a signed letter must keep saying what the employee actually signed, even
 * after their salary, designation or notice period changes.
 */
export interface HrDocument {
  id?: string;
  memberId: string;
  memberName: string;
  memberPhone?: string;
  memberRole?: UserRole;
  department: Department;
  type: HrDocumentType;
  title: string;
  bodyText: string;

  // Company side — signed the moment it is issued, using the signatory's stored signature
  issuedById: string;
  issuedByName: string;
  issuedByDesignation?: string;

  /**
   * Who signed for the company, in the order their blocks appear on the page.
   *
   * Usually one (the CEO); the NDA carries two, because confidentiality and IP assignment are the
   * CTO's to affirm as much as the CEO's. Absent on documents issued before officers existed —
   * those fall back to the single `companySignatureUrl` below, which is why it is still here.
   */
  signatories?: IssuedSignatory[];

  /** @deprecated Superseded by `signatories`. Still read for documents issued before it existed. */
  companySignatureUrl?: string | null;

  /**
   * The company's own reference for this letter — `DTS/OFR/2026/0007`.
   *
   * Allocated once at issue and never recomputed, so the number on the employee's copy is the
   * number in the register even after other letters are issued or deleted around it.
   */
  referenceNo?: string | null;
  /**
   * The company seal as it stood the day this went out.
   *
   * Stored ON the document rather than read live, for the same reason the signature is: a letter
   * is a record of what was issued, and a stamp replaced next year must not silently reprint
   * itself onto every letter the company ever sent.
   */
  companyStampUrl?: string | null;
  issuedOn: string;                 // yyyy-MM-dd
  createdAt: HrTime;

  // Employee side
  requiresEmployeeSignature: boolean;
  status: HrDocumentStatus;
  employeeSignatureUrl?: string | null;
  signedName?: string | null;
  signedDate?: string | null;       // yyyy-MM-dd
  signedAt?: HrTime | null;
  declinedReason?: string | null;
  declinedAt?: HrTime | null;

  /**
   * When the employee first opened it, and when they first took a copy away.
   *
   * "Issued" and "read" are different facts, and only one of them is currently provable. An
   * employee disputing a warning letter they say they never saw is exactly the moment somebody
   * wants this, and it cannot be backfilled later.
   */
  firstViewedAt?: HrTime | null;
  lastDownloadedAt?: HrTime | null;
  downloadCount?: number;
}
