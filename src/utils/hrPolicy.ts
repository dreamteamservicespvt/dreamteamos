import { addDays, addMonths, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import type { UserRole } from "@/types";
import type {
  Department, EmployeeProfile, EmploymentStage, EngagementType, HrDocument, HrDocumentType,
  ProbationMilestone, SeparationType,
} from "@/types/hr";

/**
 * Company HR policy, in one place.
 *
 * Every rule the lifecycle enforces — how long notice runs, when probation ends, when a review is
 * due, what still has to happen before someone is properly onboarded — is expressed here as data
 * and pure functions. Screens ask this file; they never encode a rule themselves. Changing policy
 * is then a single edit with tests around it, not a hunt through a dozen components.
 *
 * Nothing here touches Firestore, so all of it is directly testable.
 */

// ─── Dates ──────────────────────────────────────────────────────────────────

export const ISO = "yyyy-MM-dd";

/** Parse a `yyyy-MM-dd` string, returning null for anything unusable rather than an Invalid Date. */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

export const todayIso = (): string => format(new Date(), ISO);

/** `date + days` as `yyyy-MM-dd`, or null when the input date is unusable. */
export function addDaysIso(value: string | null | undefined, days: number): string | null {
  const d = parseDate(value);
  return d ? format(addDays(d, days), ISO) : null;
}

/** `date + months` as `yyyy-MM-dd`, or null when the input date is unusable. */
export function addMonthsIso(value: string | null | undefined, months: number): string | null {
  const d = parseDate(value);
  return d ? format(addMonths(d, months), ISO) : null;
}

/** Whole days from `from` to `to`. Positive when `to` is later. Null when either date is unusable. */
export function daysBetween(from?: string | null, to?: string | null): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  return a && b ? differenceInCalendarDays(b, a) : null;
}

// ─── Department ─────────────────────────────────────────────────────────────

/**
 * Which department signs this person's paperwork.
 *
 * This is the whole basis of the signature rule: a technical employee's documents carry the tech
 * admin's signature, a sales employee's carry the sales head's. Roles that belong to neither team
 * (main admin, accounts) return null — they are not employees managed through this flow.
 */
export function departmentOfRole(role?: UserRole | null): Department | null {
  if (role === "tech_member" || role === "tech_team_leader" || role === "tech_admin") return "tech";
  if (role === "sales_member" || role === "sales_admin") return "sales";
  return null;
}

export const DEPARTMENT_LABELS: Record<Department, string> = {
  tech: "Technical",
  sales: "Sales",
};

/** The role that signs for a department — the person whose stored signature goes on the letters. */
export const SIGNATORY_ROLE: Record<Department, UserRole> = {
  tech: "tech_admin",
  sales: "sales_admin",
};

export const SIGNATORY_TITLE: Record<Department, string> = {
  tech: "Technical Head",
  sales: "Sales Head",
};

// ─── Notice periods ─────────────────────────────────────────────────────────

/**
 * How much notice applies, and why.
 *
 * `basis` is deliberately part of the answer: an employee told "your notice is 45 days" deserves
 * to be told it is because they hold a team-lead role, and an admin overriding it deserves to see
 * what they are overriding.
 */
export type NoticeBasis =
  | "override"
  | "misconduct"
  | "intern"
  | "probation"
  | "senior"
  | "confirmed";

export interface NoticePeriod {
  days: number;
  basis: NoticeBasis;
  label: string;
}

/** The standard ladder. Longer roles get longer notice; probation stays short by design. */
export const NOTICE_DAYS = {
  intern: 7,
  probation: 15,
  confirmed: 30,
  senior: 45,
} as const;

/**
 * Serious misconduct is not a notice period at all — it is a disciplinary procedure with its own
 * due-process requirements. Surfaced as text so the UI can say so instead of quietly showing "0".
 */
export const MISCONDUCT_NOTE =
  "Serious misconduct follows the disciplinary procedure, not the notice period. Due process applies before any action.";

/**
 * The notice period for an employee, in precedence order:
 * an explicit contractual override, then misconduct, then intern, then probation, then a senior
 * role, and finally the confirmed-employee default.
 */
export function noticePeriodFor(
  profile: Pick<EmployeeProfile, "engagementType" | "stage" | "seniorRole" | "noticeDaysOverride" | "confirmedOn">,
  opts: { separationType?: SeparationType } = {},
): NoticePeriod {
  if (typeof profile.noticeDaysOverride === "number" && profile.noticeDaysOverride >= 0) {
    return { days: profile.noticeDaysOverride, basis: "override", label: "Contractual (agreed in writing)" };
  }
  if (opts.separationType === "misconduct") {
    return { days: 0, basis: "misconduct", label: "Disciplinary procedure — notice does not apply" };
  }
  if (profile.engagementType === "intern") {
    return { days: NOTICE_DAYS.intern, basis: "intern", label: "Intern" };
  }
  if (isUnderProbation(profile)) {
    return { days: NOTICE_DAYS.probation, basis: "probation", label: "During probation" };
  }
  if (profile.seniorRole) {
    return { days: NOTICE_DAYS.senior, basis: "senior", label: "Team lead / senior role" };
  }
  return { days: NOTICE_DAYS.confirmed, basis: "confirmed", label: "Confirmed employee" };
}

/** True while someone is joined but not yet confirmed. Interns are never "on probation". */
export function isUnderProbation(
  profile: Pick<EmployeeProfile, "stage" | "engagementType" | "confirmedOn">,
): boolean {
  if (profile.engagementType === "intern") return false;
  if (profile.confirmedOn) return false;
  return profile.stage === "probation";
}

/**
 * The last working day a notice period lands on.
 * Day 0 is the day notice is given, so 30 days' notice given on the 1st ends on the 31st.
 */
export function lastWorkingDayFor(submittedOn: string, noticeDays: number): string | null {
  return addDaysIso(submittedOn, Math.max(0, noticeDays));
}

// ─── Probation ──────────────────────────────────────────────────────────────

/** Default probation length for a new engagement. Interns and contracts serve none. */
export function defaultProbationMonths(engagement?: EngagementType): number {
  return engagement === "intern" || engagement === "contract" ? 0 : 3;
}

/**
 * When probation ends: joining date + probation months, unless it has been formally extended,
 * in which case the extension date is the real answer.
 */
export function probationEndDate(
  profile: Pick<EmployeeProfile, "joiningDate" | "probationMonths" | "probationExtendedTo" | "engagementType">,
): string | null {
  if (profile.probationExtendedTo) return profile.probationExtendedTo;
  const months = profile.probationMonths ?? defaultProbationMonths(profile.engagementType);
  if (!months) return null;
  return addMonthsIso(profile.joiningDate, months);
}

const MILESTONE_DAYS: Record<Exclude<ProbationMilestone, "adhoc">, number> = {
  day_30: 30,
  day_60: 60,
  day_90: 90,
};

/** The date a given 30/60/90 review falls due, counted from the joining date. */
export function milestoneDueDate(joiningDate: string | null | undefined, milestone: ProbationMilestone): string | null {
  if (milestone === "adhoc") return null;
  return addDaysIso(joiningDate, MILESTONE_DAYS[milestone]);
}

export interface MilestoneState {
  milestone: ProbationMilestone;
  dueOn: string | null;
  done: boolean;
  /** Due date has passed and no review was recorded. */
  overdue: boolean;
}

/**
 * The 30/60/90 review schedule and what has actually happened against it — the thing an admin
 * needs to see at a glance, rather than a list of reviews they have to date-match themselves.
 */
export function probationSchedule(
  profile: Pick<EmployeeProfile, "joiningDate" | "probationReviews" | "engagementType" | "confirmedOn" | "probationMonths" | "probationExtendedTo">,
  today: string = todayIso(),
): MilestoneState[] {
  const reviews = profile.probationReviews || [];
  return (["day_30", "day_60", "day_90"] as ProbationMilestone[]).map((milestone) => {
    const dueOn = milestoneDueDate(profile.joiningDate, milestone);
    const done = reviews.some((r) => r.milestone === milestone);
    const elapsed = dueOn ? (daysBetween(dueOn, today) ?? -1) >= 0 : false;
    return { milestone, dueOn, done, overdue: !done && elapsed && !profile.confirmedOn };
  });
}

/** Days left in probation. Negative once it has run out; null when there is no probation. */
export function probationDaysRemaining(
  profile: Pick<EmployeeProfile, "joiningDate" | "probationMonths" | "probationExtendedTo" | "engagementType">,
  today: string = todayIso(),
): number | null {
  const end = probationEndDate(profile);
  return end ? daysBetween(today, end) : null;
}

// ─── KYC completeness ───────────────────────────────────────────────────────

const KYC_REQUIRED: { key: string; label: string; has: (p: EmployeeProfile) => boolean }[] = [
  { key: "photo", label: "Photograph", has: (p) => !!p.photoUrl },
  { key: "dob", label: "Date of birth", has: (p) => !!p.dob },
  { key: "address", label: "Current address", has: (p) => !!p.currentAddress },
  { key: "emergency", label: "Emergency contact", has: (p) => !!p.emergencyContact?.phone },
  { key: "pan", label: "PAN", has: (p) => !!p.pan },
  { key: "aadhaar", label: "Aadhaar", has: (p) => !!p.aadhaar },
];

export interface KycCompletion {
  done: number;
  total: number;
  percent: number;
  missing: string[];
  complete: boolean;
}

/** How much of the joining-day information pack is actually on file. */
export function kycCompletion(profile: EmployeeProfile): KycCompletion {
  const missing = KYC_REQUIRED.filter((f) => !f.has(profile)).map((f) => f.label);
  const done = KYC_REQUIRED.length - missing.length;
  return {
    done,
    total: KYC_REQUIRED.length,
    percent: Math.round((done / KYC_REQUIRED.length) * 100),
    missing,
    complete: missing.length === 0,
  };
}

/**
 * Show a government identifier without putting it on screen in full.
 * Everything but the last four characters becomes a bullet, spaced in fours so it still reads
 * like an Aadhaar/PAN rather than a blob.
 */
export function maskIdentifier(value?: string | null, visible = 4): string {
  const raw = (value || "").replace(/\s+/g, "");
  if (!raw) return "—";
  if (raw.length <= visible) return raw;
  const hidden = "•".repeat(raw.length - visible) + raw.slice(-visible);
  return hidden.replace(/(.{4})/g, "$1 ").trim();
}

// ─── Document expectations ──────────────────────────────────────────────────

/**
 * The paperwork every employee is expected to have signed once they have joined.
 * Straight from the flow: appointment letter, NDA/IP terms, and policy acknowledgement.
 */
export const CORE_EMPLOYMENT_DOCS: HrDocumentType[] = [
  "appointment_letter",
  "nda",
  "policy_acknowledgement",
];

/** Which document types make sense to issue at a given stage — keeps the picker honest. */
export function documentTypesForStage(stage: EmploymentStage): HrDocumentType[] {
  switch (stage) {
    case "offer_issued":
    case "offer_accepted":
      return ["offer_letter", "appointment_letter", "nda", "policy_acknowledgement"];
    case "probation":
      return ["appointment_letter", "nda", "policy_acknowledgement", "confirmation_letter", "probation_extension", "warning_letter"];
    case "confirmed":
      return ["appointment_letter", "nda", "policy_acknowledgement", "increment_letter", "warning_letter", "confirmation_letter"];
    case "notice_period":
      return ["relieving_letter", "experience_letter", "warning_letter"];
    case "exited":
      return ["relieving_letter", "experience_letter"];
    default:
      return ["offer_letter"];
  }
}

/** Documents whose whole point is the employee's signature on them. */
const SIGNATURE_REQUIRED: HrDocumentType[] = [
  "offer_letter",
  "appointment_letter",
  "nda",
  "policy_acknowledgement",
  "probation_extension",
  "warning_letter",
];

export const requiresEmployeeSignature = (type: HrDocumentType): boolean =>
  SIGNATURE_REQUIRED.includes(type);

// ─── Lifecycle tracker ──────────────────────────────────────────────────────

export type StepStatus = "done" | "current" | "pending";

export interface LifecycleStep {
  key: string;
  label: string;
  detail: string;
  status: StepStatus;
}

const signedTypes = (docs: HrDocument[]): Set<HrDocumentType> =>
  new Set(docs.filter((d) => d.status === "signed").map((d) => d.type));

const issuedTypes = (docs: HrDocument[]): Set<HrDocumentType> =>
  new Set(docs.map((d) => d.type));

/**
 * The employee's journey as a checklist — offer through exit — with the first unfinished step
 * marked "current". This is the spine of the profile page: one glance says where someone is and
 * what the company still owes them.
 */
export function lifecycleSteps(
  profile: EmployeeProfile,
  docs: HrDocument[] = [],
  opts: { employeeId?: string | null; today?: string } = {},
): LifecycleStep[] {
  const today = opts.today || todayIso();
  const signed = signedTypes(docs);
  const issued = issuedTypes(docs);
  const kyc = kycCompletion(profile);
  const assets = profile.assets || [];
  const reviews = profile.probationReviews || [];
  const sep = profile.separation;
  const joined = !!profile.joiningDate && (daysBetween(profile.joiningDate, today) ?? -1) >= 0;

  const coreSigned = CORE_EMPLOYMENT_DOCS.filter((t) => signed.has(t));

  const raw: { key: string; label: string; detail: string; done: boolean; skip?: boolean }[] = [
    {
      key: "offer",
      label: "Offer letter issued",
      detail: profile.offerIssuedOn
        ? `Issued ${profile.offerIssuedOn}`
        : issued.has("offer_letter") ? "Issued" : "Role, salary, joining date and conditions in writing",
      done: !!profile.offerIssuedOn || issued.has("offer_letter"),
    },
    {
      key: "offer_accepted",
      label: "Offer accepted",
      detail: profile.offerAcceptedOn
        ? `Accepted ${profile.offerAcceptedOn}`
        : signed.has("offer_letter") ? "Signed by the candidate" : "Awaiting the candidate's signature",
      done: !!profile.offerAcceptedOn || signed.has("offer_letter"),
    },
    {
      key: "kyc",
      label: "Employee information & KYC",
      detail: kyc.complete ? "Complete" : `${kyc.done}/${kyc.total} on file — missing ${kyc.missing.join(", ")}`,
      done: kyc.complete,
    },
    {
      key: "documents",
      label: "Employment documents signed",
      detail: `${coreSigned.length}/${CORE_EMPLOYMENT_DOCS.length} signed — appointment letter, NDA/IP, policies`,
      done: coreSigned.length === CORE_EMPLOYMENT_DOCS.length,
    },
    {
      key: "assets",
      label: "Employee ID & assets issued",
      detail: assets.length
        ? `${assets.length} item${assets.length === 1 ? "" : "s"} recorded${opts.employeeId ? ` · ID ${opts.employeeId}` : ""}`
        : "Laptop, phone/SIM, email, access — recorded and acknowledged",
      done: assets.length > 0 && !!opts.employeeId,
    },
    {
      key: "joined",
      label: "Joined",
      detail: profile.joiningDate ? `${joined ? "Joined" : "Joins"} ${profile.joiningDate}` : "Joining date not set",
      done: joined,
    },
    {
      key: "probation",
      label: "Probation reviews",
      detail: profile.engagementType === "intern"
        ? "Not applicable to an internship"
        : reviews.length
          ? `${reviews.length} review${reviews.length === 1 ? "" : "s"} recorded`
          : "30-day, 60-day and final 90-day evaluation",
      done: profile.engagementType === "intern" ? true : reviews.length > 0,
      skip: profile.engagementType === "intern",
    },
    {
      key: "confirmed",
      label: "Confirmation",
      detail: profile.confirmedOn
        ? `Confirmed ${profile.confirmedOn}`
        : profile.probationExtendedTo
          ? `Probation extended to ${profile.probationExtendedTo}`
          : "Confirmation letter after successful probation",
      done: !!profile.confirmedOn,
      skip: profile.engagementType === "intern",
    },
    {
      key: "exit",
      label: "Exit & final settlement",
      detail: sep
        ? sep.status === "completed"
          ? `Exited ${sep.completedOn || sep.lastWorkingDay}`
          : `${sep.type === "resignation" ? "Resigned" : "Separation"} — last working day ${sep.lastWorkingDay}`
        : "Handover, asset return, access revoked, settlement, relieving letter",
      done: sep?.status === "completed",
    },
  ];

  let currentAssigned = false;
  return raw.map((step) => {
    let status: StepStatus;
    if (step.done) status = "done";
    else if (!currentAssigned) { status = "current"; currentAssigned = true; }
    else status = "pending";
    return { key: step.key, label: step.label, detail: step.detail, status };
  });
}

// ─── Stage helpers ──────────────────────────────────────────────────────────

/** Tailwind classes for a stage chip, so the same stage never reads two colours on two screens. */
export const STAGE_TONE: Record<EmploymentStage, string> = {
  offer_issued: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  offer_accepted: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  probation: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  confirmed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  notice_period: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  exited: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

/**
 * The stage a profile should be in given its own facts.
 *
 * Used to suggest — never to silently overwrite. An admin can hold someone in a stage on purpose,
 * and a derived value that quietly disagreed with the record would be worse than no suggestion.
 */
export function deriveStage(profile: EmployeeProfile, today: string = todayIso()): EmploymentStage {
  const sep = profile.separation;
  if (sep && sep.status !== "withdrawn") {
    const past = (daysBetween(sep.lastWorkingDay, today) ?? -1) > 0;
    if (sep.status === "completed" || past) return "exited";
    return "notice_period";
  }
  if (profile.confirmedOn) return "confirmed";
  const joined = !!profile.joiningDate && (daysBetween(profile.joiningDate, today) ?? -1) >= 0;
  if (joined) return profile.engagementType === "intern" ? "confirmed" : "probation";
  if (profile.offerAcceptedOn) return "offer_accepted";
  return "offer_issued";
}
