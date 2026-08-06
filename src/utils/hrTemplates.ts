import { format } from "date-fns";
import { COMPANY_DEFAULTS, resolveCompany, type ResolvedCompany } from "@/utils/company";
import { formatPhoneDisplay } from "@/utils/phone";
import { DAY_OPTIONS, matchDayOption, splitRange } from "@/utils/employmentDefaults";
import {
  defaultProbationMonths, internshipSkillsFor, isInternship, monthsBetween, noticePeriodFor, parseDate,
  probationEndDate, trainingTermsFor,
} from "@/utils/hrPolicy";
import { departmentForTitle } from "@/utils/roleLadder";
import { DEFAULT_PAYROLL_CONFIG } from "@/types/payroll";
import {
  ENGAGEMENT_LABELS, HR_DOCUMENT_LABELS, WORK_ARRANGEMENT_LABELS, WORK_ARRANGEMENT_TERMS, orgUnitLabel,
} from "@/types/hr";
import type { EmployeeProfile, HrDocumentType, IssuedSignatory } from "@/types/hr";

/**
 * The letters the employee lifecycle produces, generated from the employee's own record.
 *
 * Two decisions worth knowing about:
 *
 * 1. **Text, not components.** Every document is built as plain text in the exact shape
 *    `AgreementView` already renders and `downloadAgreementPdf` already paginates — an ALL-CAPS
 *    title block, numbered sections, and signature lines. That means one renderer, one PDF path,
 *    and a document that is still readable if it is ever exported, pasted or mailed as text.
 *
 * 2. **Rendered once, then frozen.** The caller stores the returned `bodyText` on the issued
 *    document. It is never regenerated from the profile afterwards, because a signed letter must
 *    keep saying what the employee actually signed even after their salary or role changes.
 *
 * The wording is a solid professional baseline for an Indian employer, not legal advice: the
 * templates should be reviewed once by an employment/labour-law professional for the state the
 * company operates in. The UI says so at the point of issue.
 */

export interface DocumentSubject {
  name: string;
  phone?: string | null;
  /**
   * The employee's PERSONAL email — the one they keep.
   *
   * Not their login. A company account is issued by the company and revoked when they leave, so an
   * offer letter, a relieving letter or an experience certificate addressed to it is addressed
   * somewhere the person cannot read the day they most need to: at an exit, or when a future
   * employer writes to verify it. The address on the paperwork has to outlive the employment.
   */
  email?: string | null;
  employeeId?: string | null;
  /**
   * Sales facts, printed only on a sales employee's letters.
   *
   * They live on the user record rather than the employment profile — commission rate follows the
   * earnings option payroll actually settles against, and the targets are the ones the leaderboard
   * measures. Read from there rather than re-typed, so a letter can never promise an incentive the
   * payroll does not pay.
   */
  incentivePercent?: number | null;
  dailyTarget?: number | null;
  monthlyTarget?: number | null;
}

export interface DocumentSignatory {
  name: string;
  designation: string;
}

/** Per-document facts that are not part of the standing employee record. */
export interface HrDocumentExtras {
  /** Offer letter — how long the offer stands. */
  offerValidUntil?: string | null;
  /** Offer letter — the company's own reference for this offer, e.g. DTS/OFR/2026/007. */
  offerLetterNumber?: string | null;
  /** Offer letter — the candidate's postal address, where one was collected. */
  candidateAddress?: string | null;
  /** Probation extension — the new probation end date and why. */
  extendedTo?: string | null;
  extensionReason?: string | null;
  /** Increment / promotion. */
  newCtcMonthly?: number | null;
  newDesignation?: string | null;
  effectiveFrom?: string | null;
  /** Warning letter / show cause notice. */
  incident?: string | null;
  incidentDate?: string | null;
  expectation?: string | null;
  /**
   * Show cause notice — the date by which the employee must answer.
   *
   * The whole point of a show cause notice is that it asks a question and waits. One with no
   * deadline is just a warning letter wearing a different title.
   */
  responseByDate?: string | null;
  /** Resignation acceptance — the date the resignation was received. */
  resignationDate?: string | null;
  /** Relieving / experience / settlement letter. */
  lastWorkingDay?: string | null;
  settlementNote?: string | null;
  /** Full & final settlement — the net amount payable, as settled. */
  settlementAmount?: number | null;
  /** Anything else this particular letter must say. Appended as its own section. */
  additionalTerms?: string | null;
}

export interface BuildDocumentInput {
  type: HrDocumentType;
  subject: DocumentSubject;
  profile: EmployeeProfile;
  /**
   * Who signs for the company, in the order their blocks appear at the foot of the letter.
   *
   * Usually one; the NDA carries two. A single `DocumentSignatory` is still accepted so older
   * callers — and the onboarding invite flow, which signs as one named admin — keep working.
   */
  signatory: DocumentSignatory | IssuedSignatory[];
  /** yyyy-MM-dd — the date printed on the letter. */
  issuedOn: string;
  extras?: HrDocumentExtras;
  /**
   * The company as it should be printed. Omitted in tests and older callers, where the built-in
   * defaults are used — a letter must never render "undefined" as its own name.
   */
  company?: ResolvedCompany;
  /** `DTS/OFR/2026/0007`. Printed under the title; omitted entirely when there is none. */
  referenceNo?: string | null;
}

export interface BuiltDocument {
  title: string;
  bodyText: string;
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

/** `2026-08-01` → `01 Aug 2026`. Falls back to a dash so a letter never prints "Invalid Date". */
export function longDate(iso?: string | null): string {
  const d = parseDate(iso);
  return d ? format(d, "dd MMM yyyy") : "—";
}

/** `2026-08-01` → `01/08/2026`, for the bracketed date range on an internship duration line. */
export function shortDate(iso?: string | null): string {
  const d = parseDate(iso);
  return d ? format(d, "dd/MM/yyyy") : "—";
}

/**
 * The remuneration lines, which change shape entirely when a training period applies.
 *
 * Two salaries, stated separately and in order, and the annual CTC built from the second of them.
 * The last line says so out loud, because the difference between "you will earn ₹3,00,000 a year"
 * and "you will earn ₹8,000 a month for three months and then ₹25,000" is the whole reason a
 * trainee's offer letter gets queried.
 */
const remunerationLines = (p: EmployeeProfile, intern: boolean): (string | null)[] => {
  const t = trainingTermsFor(p);
  const payDay = ordinalDay(p.salaryPayDay);
  const payable = payDay
    ? `Payable monthly, on or about the ${payDay} of each month, subject to statutory deductions as applicable.`
    : "Payable monthly, subject to statutory deductions as applicable.";
  const noun = intern ? "stipend" : "salary";

  if (!t.applies) {
    return [
      intern ? `Monthly stipend: ${rupees(p.ctcMonthly)}` : `Gross monthly salary (CTC): ${rupees(p.ctcMonthly)}`,
      !intern && t.annualCtc !== null ? `Annual CTC: ${rupees(t.annualCtc)}` : null,
      payable,
    ];
  }

  return [
    `Training period: ${t.months} month(s) from the date of joining${t.endsOn ? `, ending on ${longDate(t.endsOn)}` : ""}.`,
    `${intern ? "Stipend" : "Salary"} during the training period: ${rupees(t.trainingSalary)} per month.`,
    `${intern ? "Stipend" : "Salary"} on successful completion of the training period: ${rupees(t.fullSalary)} per month.`,
    t.annualCtc !== null ? `Annual CTC (on completion of training): ${rupees(t.annualCtc)}` : null,
    // Stated explicitly so nobody reads the annual figure as covering the training months.
    `The annual CTC above is calculated on the post-training monthly ${noun}. The ${noun} payable during the training period is stated separately above and does not form part of it.`,
    payable,
  ];
};

/**
 * The probation this employee is actually on.
 *
 * `?? defaultProbationMonths` rather than `?? 0`, and the difference is the whole point: an
 * employment record that has never had the field set is not a record of somebody hired with no
 * probation, it is a record nobody filled in. Reading it as zero printed "Full-Time (Permanent)"
 * on the offer letter — the job confirmed from day one, the opposite of what was agreed — on
 * seventeen of twenty live records. An explicit 0 still means 0, because `??` only catches
 * null and undefined, so an intern or a deliberate no-probation hire is unaffected.
 *
 * The same rule `probationEndDate` has always used, applied to the letters as well.
 */
function probationMonthsOf(p: EmployeeProfile): number {
  return p.probationMonths ?? defaultProbationMonths(p.engagementType);
}

/**
 * Is this a sales employee? The record's own department, falling back to the designation.
 *
 * The fallback earns its place: `department` is supplied by whoever loaded the profile and is blank
 * on anything written before it existed, while the title is always there. A letter that decides
 * "not sales" on missing data prints a tech reporting line on a Business Development Manager's
 * offer, which is the exact failure this is here to stop.
 */
function isSalesEmployee(p: EmployeeProfile): boolean {
  return p.department === "sales" || departmentForTitle(p.designation) === "sales";
}

/**
 * The incentive and target block — a sales letter's most important clause after the salary.
 *
 * ── Why the target FIGURES are not printed ────────────────────────────────────────────────────
 * They used to be: "Daily target: ₹15,000. Monthly target: ₹3,00,000." A number on a signed letter
 * is a term of the contract, and these are not terms — they move with the season, the territory and
 * the package mix, and they are set by the sales admin in the app whenever the business needs them
 * to move. Printing them meant either reissuing the letter every time a target changed or leaving a
 * signed document that contradicts the live one. So the letter states that targets EXIST, how they
 * are set and what turns on them, and the figures stay where they are actually maintained.
 *
 * The incentive percentage is the opposite case and is still printed: it is a rate payroll settles
 * against and does not change without an agreed revision.
 *
 * ── Why this appears for every sales employee, and only for them ──────────────────────────────
 * It no longer reads any target field, so there is nothing to be missing. A sales letter that says
 * nothing about targets is the failure this clause exists to prevent, and it used to happen on
 * exactly the records nobody had filled in yet. Equally, `isSalesEmployee` is the whole gate: a
 * target is a sales instrument, and an engineer's letter carries no trace of one.
 *
 * ── The consequences, and why they are on the letter at all ───────────────────────────────────
 * Two of them, and both cost the employee money, which is precisely why they are written into the
 * document somebody signs rather than explained on the day they first apply:
 *
 *   • Below 75% of target, no incentive is payable for that cycle. Not a reduced rate — none.
 *     (utils/salesTargets.INCENTIVE_TARGET_THRESHOLD is the same 75%; the two move together.)
 *   • Below the 50%–75% band, the salary itself may be revised downward.
 *
 * ── And why training is exempted ──────────────────────────────────────────────────────────────
 * A trainee is being taught the job on a reduced salary. Measuring them against a full target and
 * then withholding the incentive for missing it would penalise somebody for not yet knowing how to
 * do the thing they were hired to be taught. Stated only when the record actually carries a
 * training period, following the same rule as every other conditional clause in this file.
 */
function salesIncentiveSection(i: BuildDocumentInput): Section {
  const { profile: p, subject } = i;
  if (!isSalesEmployee(p)) return null;

  const pct = subject.incentivePercent;
  const hasPct = typeof pct === "number" && Number.isFinite(pct) && pct > 0;
  const training = trainingTermsFor(p);

  return {
    title: hasPct ? "Sales Incentive and Targets" : "Sales Targets",
    lines: [
      hasPct
        ? `Sales Incentive: ${pct}% of the value of every sale made by you and verified by the company, over and above your gross monthly salary.`
        : null,
      hasPct
        ? "The incentive is calculated on verified sales only, and is paid with the salary for the pay cycle in which the sale is verified. A sale that is later reversed, refunded or found to be duplicated is excluded."
        : null,
      hasPct ? "" : null,
      "Your role carries sales targets. The applicable targets are set by the company and communicated to you separately, and they are visible to you at all times in the company's system. Targets apply to sales roles only.",
      "Targets are reviewed periodically and may be revised to reflect your role, your territory, the season and the company's requirements. Consistent achievement of target is a factor in confirmation, revision and promotion.",
      "",
      "Achievement against target is assessed for each pay cycle, and two things turn on it:",
      // The incentive gate. Stated as all-or-nothing because that is what it is — a member who
      // reaches 74% of target earns no incentive on the sales they did make, and somebody signing
      // this letter is entitled to know that before it happens rather than on their payslip.
      hasPct
        ? `  (a) The sales incentive is payable only where you achieve at least 75% of your target for that cycle. Where your achievement is below 75%, no incentive is payable for that cycle, whatever the value of the sales made in it.`
        : "  (a) Any sales incentive applicable to you is payable only where you achieve at least 75% of your target for that cycle. Below 75%, no incentive is payable for that cycle.",
      // The salary consequence. A downward revision somebody first hears about on their payslip is
      // a dispute; one written into the letter they signed is a term.
      "  (b) Where your achievement falls below the required range of 50% to 75% of target, your salary may in addition be revised downward in proportion to your performance against target. Any such revision will be communicated to you in writing before it takes effect, and the salary is restored on sustained achievement of target.",
      training.applies ? "" : null,
      training.applies
        ? `No sales target applies to you during your training period of ${training.months} month(s). Targets, and both of the consequences described above, apply from the end of that period. Your training period is set out in the ${isInternship(p) ? "Stipend" : "Remuneration"} clause of this letter.`
        : null,
    ],
  };
}

/**
 * What a sales employee, specifically, may not take out of the building.
 *
 * The generic intellectual-property clause is written for the people who MAKE things — source code,
 * designs, prompts, creative material — and a sales employee creates none of that. What passes
 * through their hands instead is the client list: the numbers they called, what each client pays,
 * what the company earns and how much it is selling. That is the asset a competitor would pay for
 * and the one a leaver can carry out in a phone, and the letter said nothing about it.
 *
 * Appended to the existing IP clause rather than made a clause of its own, because it is the same
 * obligation — this is what "company property" means for this department.
 *
 * Returns [] for anyone who is not sales, so the tech letters are untouched.
 */
function salesInformationLines(p: EmployeeProfile): string[] {
  if (!isSalesEmployee(p)) return [];
  return [
    "In your role you will handle information that belongs to the company and is confidential to it: client and prospect contact numbers, client lists and lead data, what each client is quoted and pays, the company's revenue, its sales figures and targets, achievement and performance data, pricing and margins, package and discount structures, supplier and partner terms, and any other business information not in the public domain.",
    "None of it may be disclosed to anyone. You shall not reveal, share, forward, copy, photograph, screenshot, export, print or publish any of it to any person outside the company — including clients, prospects, competitors, agencies, your family, or any social media, messaging or group platform — nor to any colleague inside the company who does not need it for their own work.",
    "You shall not keep any of it on a personal device, account, notebook or storage of your own, and you shall not use it for your own benefit or for any other person or business. These obligations apply during your employment and continue without limit of time after it ends.",
  ];
}

/** The same information, said again where it belongs — it is property, and it is returned. */
function salesPropertyLines(p: EmployeeProfile): string[] {
  if (!isSalesEmployee(p)) return [];
  return [
    "Client numbers, lead data, sales records and every other piece of business information you hold or record in the company's system are company property in the same way a laptop or an ID card is. They remain with the company, and any copy in your possession must be returned or deleted on or before your last working day.",
  ];
}

/** `45000` → `₹45,000` in Indian digit grouping. */
export function rupees(amount?: number | null): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

const value = (v?: string | number | null): string => {
  if (typeof v === "number") return String(v);
  const s = (v || "").toString().trim();
  return s || "—";
};

/** Join lines, drop the nulls callers use for "this clause does not apply", collapse triple gaps. */
const compose = (lines: (string | null | undefined)[]): string =>
  lines.filter((l) => l !== null && l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();

const EMPLOYEE_SIGNATURE_BLOCK = (subject: DocumentSubject): (string | null)[] => [
  "",
  "Employee Signature:",
  `Name: ${subject.name}`,
  subject.employeeId ? `Employee ID: ${subject.employeeId}` : null,
  "Date:",
];

/** The company as it should be printed for this build — defaults when the caller gave none. */
const companyOf = (i: BuildDocumentInput): ResolvedCompany => i.company || resolveCompany(null);

/** Whoever signs, normalised to a list — one signatory and many are the same shape downstream. */
const signatoriesOf = (i: BuildDocumentInput): IssuedSignatory[] =>
  Array.isArray(i.signatory)
    ? i.signatory
    : [{ key: "issuer", name: i.signatory.name, designation: i.signatory.designation }];

/**
 * The company's signature blocks, one per signing office.
 *
 * The office is named in the signature line itself rather than left as a generic "Authorised
 * Signatory", because a document carrying two signatures has to say which is which — a reader
 * looking at an NDA needs to see that the CTO signed it as well as the CEO, not two identical
 * boxes. `AgreementView` pairs these lines with the stored signature images in order.
 */
const COMPANY_SIGNATURE_BLOCKS = (i: BuildDocumentInput): (string | null)[] => {
  const co = companyOf(i);
  return [
    // The complimentary close, once, however many offices sign below it. A letter that goes
    // straight from its last clause into a signature box reads as a form; this is the line that
    // makes it correspondence.
    "",
    "Yours sincerely,",
    ...signatoriesOf(i).flatMap((s) => [
      "",
      `For ${co.name} — ${s.designation || "Authorised Signatory"} Signature:`,
      `Name: ${s.name}`,
      `Designation: ${s.designation}`,
      `Date: ${longDate(i.issuedOn)}`,
    ]),
  ];
};

/**
 * The header block every letter opens with — who it is from, who it is to, and when.
 *
 * Ordered the way a corporate letter is ordered: reference and date, the recipient, the
 * confidentiality marking, then the subject. Two conventions here are the ones that most make a
 * letter read as a company's rather than a form's —
 *
 * **Private & Confidential.** Every serious offer, appointment and exit letter carries it. It sits
 * below the recipient block, where a reader meets it before the subject.
 *
 * **A subject line.** The centred title says what kind of letter this is; the subject says what it
 * is *about* — the role, in this case. Naming the position there is what lets somebody find the
 * right letter in a file of forty.
 */
const letterHead = (
  i: BuildDocumentInput,
  title: string,
  opts: { ref?: string | null; address?: string | null; subject?: string | null } = {},
): (string | null)[] => {
  const { subject } = i;
  // An explicit per-letter reference (the offer letter has one) wins over the allocated series
  // number, so an admin who types their own reference still sees exactly that on the page.
  const ref = (opts.ref || "").trim() || (i.referenceNo || "").trim();
  const subjectLine = (opts.subject || "").trim();
  return [
    title.toUpperCase(),
    companyOf(i).name.toUpperCase(),
    "",
    ref ? `Ref: ${ref}` : null,
    `Date: ${longDate(i.issuedOn)}`,
    "",
    `Employee Name: ${subject.name}`,
    subject.employeeId ? `Employee ID: ${subject.employeeId}` : null,
    subject.phone ? `Mobile Number: ${formatPhoneDisplay(subject.phone)}` : null,
    subject.email ? `Email: ${subject.email}` : null,
    opts.address?.trim() ? `Address: ${opts.address.trim()}` : null,
    "",
    // ALL-CAPS, so the renderer sets it as a marking rather than as body text. It has to come
    // after the fields above: a non-`Label: value` line is what closes the reference block.
    "PRIVATE & CONFIDENTIAL",
    subjectLine ? "" : null,
    subjectLine ? `Subject: ${subjectLine}` : null,
    "",
  ];
};

/** "Offer of Employment — Associate AI Software Engineer", where a role is on record. */
const subjectWithRole = (base: string, p: EmployeeProfile): string => {
  const role = (p.designation || "").trim();
  return role ? `${base} — ${role}` : base;
};

const engagementLabel = (p: EmployeeProfile): string =>
  p.engagementType ? ENGAGEMENT_LABELS[p.engagementType] : "—";

/**
 * "Full-Time (Permanent, subject to successful completion of probation)".
 *
 * A category name on its own — "Full-Time" — does not answer the question the reader is actually
 * asking, which is whether the job is permanent and what has to happen for it to become so. It is
 * also the line a bank or a landlord looks for.
 */
function employmentTypeLine(p: EmployeeProfile): string {
  const months = probationMonthsOf(p);
  switch (p.engagementType) {
    case "full_time":
      return months > 0
        ? `Full-Time (Permanent, subject to successful completion of a ${months}-month probation)`
        : "Full-Time (Permanent)";
    case "part_time":
      return months > 0
        ? `Part-Time (subject to successful completion of a ${months}-month probation)`
        : "Part-Time";
    case "intern":
      return "Intern (fixed-term internship engagement)";
    case "contract":
      return "Contract (fixed-term engagement)";
    default:
      return "—";
  }
}

/**
 * The place of work, written as an address somebody could actually post a letter to.
 *
 * A city and a state is where the office roughly is; an address is where it is. The company's own
 * registered address is used, with the employee's specific location named above it when it differs
 * — a client site or a second office.
 */
function officeAddressLines(i: BuildDocumentInput): (string | null)[] {
  const co = companyOf(i);
  const p = i.profile;
  const own = (p.workLocation || "").trim();
  const address = co.address.filter(Boolean);

  /**
   * One address, never two.
   *
   * The work location on the record is now a full postal address by default, and the company's
   * registered address is on file as well — printing both put the same street on the letter twice.
   * A location that already reads as a complete address (a PIN code, or three or more parts) is
   * used on its own; a bare city is printed above the registered address, which supplies the rest.
   */
  const looksComplete = /\b\d{6}\b/.test(own) || own.split(",").filter((s) => s.trim()).length >= 3;
  const place: (string | null)[] = own && looksComplete
    ? [own]
    : address.length === 0
      ? [value(own)]
      : (() => {
        const addressLine = `${co.name}, ${address.join(", ")}`;
        const covered = !own || address.join(", ").toLowerCase().includes(own.split(",")[0].trim().toLowerCase());
        return covered ? [addressLine] : [own, addressLine];
      })();

  // Where the work is done from is a term, not a detail of the address — an employee reading
  // "Kakinada" learns which office they belong to and nothing about whether they are expected in it.
  const arrangement = p.workArrangement;
  return arrangement
    ? [...place, "", `Work Arrangement: ${WORK_ARRANGEMENT_LABELS[arrangement]}`, WORK_ARRANGEMENT_TERMS[arrangement]]
    : place;
}

/**
 * "Weekly Off: Sunday", worked out from the days actually worked.
 *
 * A working-days range says which days are worked and leaves the reader to infer the rest. A
 * weekly off is a term of employment, and terms get written down.
 */
function weeklyOffDays(p: EmployeeProfile): string[] {
  const { from, to } = splitRange(p.workingDays);
  const start = matchDayOption(from);
  const end = matchDayOption(to);
  if (!start || !end) return [];
  const startIdx = DAY_OPTIONS.indexOf(start as (typeof DAY_OPTIONS)[number]);
  const endIdx = DAY_OPTIONS.indexOf(end as (typeof DAY_OPTIONS)[number]);
  if (startIdx < 0 || endIdx < startIdx) return [];
  return DAY_OPTIONS.filter((_, n) => n < startIdx || n > endIdx);
}

function weeklyOffLine(p: EmployeeProfile): string | null {
  const off = weeklyOffDays(p);
  return off.length > 0 ? `Weekly Off: ${off.join(", ")}` : null;
}

/**
 * The days off a letter has to name, and the paid leave that goes with them.
 *
 * ── Why this is its own function ───────────────────────────────────────────────────────────────
 * "In accordance with the company's leave policy as applicable from time to time" is what every
 * letter used to say, and it tells the reader nothing they can act on. Three facts decide whether
 * an employee feels fairly treated in their first month, and all three were only ever said out
 * loud: the weekly off, the public holidays, and how much paid leave there is. An employee who
 * discovers on payday that their third day off was unpaid was not told the terms — they were told
 * that terms exist.
 *
 * The non-accrual rule is the one that most needs writing down. Two days a month that quietly
 * lapse is a different offer from twenty-four days a year, and an employee who saves them up for a
 * wedding in November finds out the difference at the worst possible moment.
 *
 * The quota is read from the payroll configuration rather than typed here, so the letter cannot
 * promise a number the salary engine does not honour.
 */
const PAID_LEAVE_PER_MONTH = DEFAULT_PAYROLL_CONFIG.paidLeaveQuota;

/** `2` → "two". Letters spell small numbers; a bare digit reads like a form field. */
const inWords = (n: number): string =>
  ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);

/**
 * The sentence that proves a letter already states the current terms.
 *
 * Used by the backfill to tell a document that needs the addendum from one that does not, so
 * running it twice cannot staple the same clause on twice.
 */
export const LEAVE_TERMS_MARKER = "Paid leave does not carry forward";

function leaveAndHolidayLines(p: EmployeeProfile): string[] {
  const off = weeklyOffDays(p);
  const offLabel = off.length > 0 ? off.join(", ") : "Sunday";
  const n = PAID_LEAVE_PER_MONTH;
  return [
    `Weekly off: ${offLabel}. ${off.length === 1 ? "That day is" : "Those days are"} a paid day off and ${off.length === 1 ? "is" : "are"} not counted against your leave.`,
    "Public holidays: the company observes the public holidays it declares for the year. The list is published in the company's system, and a declared holiday is a paid day off which is likewise not counted against your leave.",
    `Paid leave: you are entitled to ${inWords(n)} (${n}) days of paid leave for each pay cycle, in addition to the weekly off and the declared public holidays.`,
    // The whole reason this clause exists. Said plainly, in the sentence the employee will quote
    // back, rather than left to be inferred from "for each month".
    `Paid leave does not carry forward. Any of the ${inWords(n)} days not taken within a pay cycle lapses at the end of that cycle; it is not added to the next cycle, and it is not encashed.`,
    `Leave beyond ${inWords(n)} days in a pay cycle is treated as leave without pay and the day is deducted from that cycle's salary.`,
    "Leave is applied for and approved in advance through the company's system, except in an emergency, when it must be intimated at the earliest opportunity.",
  ];
}

/**
 * The same terms, as a block that can be added to a letter that has already gone out.
 *
 * ── Why an addendum and not a rewrite ─────────────────────────────────────────────────────────
 * A letter somebody has signed is a record of what they signed. Editing the clause inside it would
 * leave a page bearing an employee's signature saying something they never read, and there would
 * be nothing on the page to show that had happened. An addendum is what an HR department actually
 * issues for this: the original letter is left exactly as it was, and the new terms arrive
 * underneath it, dated, saying plainly what they are and what they attach to.
 *
 * Carries no signature line of its own — `AgreementView` pairs signature images with signature
 * lines positionally, and a line here would take the employee's signature off the letter.
 */
export function leaveTermsAddendum(p: EmployeeProfile, dateIso?: string): string {
  return compose([
    "",
    "———",
    "",
    "ADDENDUM — WEEKLY OFF, PUBLIC HOLIDAYS AND PAID LEAVE",
    dateIso ? `Effective ${longDate(dateIso)}` : null,
    "",
    "This addendum records, in writing, the terms on days off and paid leave that apply to your engagement. It is issued because the letter above referred to the company's leave policy without setting these terms out, and it forms part of that letter. Nothing else in the letter is changed by it.",
    "",
    ...leaveAndHolidayLines(p),
  ]);
}

/** "Full-Time Employee (3-month probation)" — the engagement, stated the way the policy asks for. */
export function engagementDescription(p: EmployeeProfile): string {
  const base = engagementLabel(p);
  if (p.engagementType === "intern") return "Intern (fixed-term internship engagement)";
  if (p.engagementType === "contract") return "Contract";
  const months = probationMonthsOf(p);
  return months > 0 ? `${base} Employee (${months}-month probation)` : `${base} Employee`;
}

/** `10` → `10th`. The salary payment date reads as a day of the month, not a bare number. */
export function ordinalDay(day?: number | null): string | null {
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31) return null;
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix}`;
}

const additional = (extras?: HrDocumentExtras, startingAt = 90): (string | null)[] =>
  extras?.additionalTerms?.trim()
    ? ["", `${startingAt}. Additional Terms`, extras.additionalTerms.trim()]
    : [];

/**
 * A numbered section, or `null` for one that does not apply to this employee.
 *
 * Sections are numbered by their position among the ones that survive, so adding a block that only
 * appears for interns cannot leave a letter reading "5. Probation … 7. Leave". Hand-numbered
 * headings had exactly that bug waiting in them, and it is the kind nobody notices until it is on
 * paper in somebody's hand.
 */
type Section = { title: string; lines: (string | null)[] } | null;

const numbered = (sections: Section[]): (string | null)[] => {
  const out: (string | null)[] = [];
  let n = 0;
  for (const s of sections) {
    if (!s) continue;
    n += 1;
    out.push("", `${n}. ${s.title}`, ...s.lines);
  }
  return out;
};

/** The trailing "Additional Terms" section, as a `Section` so it numbers itself like the rest. */
const additionalSection = (extras?: HrDocumentExtras): Section =>
  extras?.additionalTerms?.trim()
    ? { title: "Additional Terms", lines: [extras.additionalTerms.trim()] }
    : null;

/**
 * The internship block — the part a college actually reads.
 *
 * An intern hands these letters to their institution to be granted permission to attend, and the
 * person deciding is not looking for the stipend. They are looking for: is this a real, structured
 * training programme, who is supervising it, how long does it run, what will the student learn,
 * and will there be something on paper at the end. A letter that states the designation and the
 * money and stops gets the permission refused, and the student loses the placement.
 *
 * So this states all six, in that order, and says in as many words that the letter may be
 * submitted to the institution — because the next question the college asks is whether the company
 * minds it being forwarded.
 *
 * Returns nothing at all for a non-internship engagement.
 */
const internshipBlock = (
  p: EmployeeProfile,
  opts: { certificate?: boolean } = {},
): (string | null)[] => {
  if (!isInternship(p)) return [];
  const skills = internshipSkillsFor(p);
  const ends = p.internshipEndDate;
  const duration = ends && p.joiningDate
    ? `The internship runs from ${longDate(p.joiningDate)} to ${longDate(ends)}.`
    : ends
      ? `The internship concludes on ${longDate(ends)}.`
      : "The internship is for a fixed term, as communicated to you and to your institution.";

  const months = monthsBetween(p.joiningDate, ends);
  return [
    "This is a structured, supervised internship. You will be trained on the job and given real work under guidance, rather than being left to observe.",
    // The line a college copies onto its own form, in the shape they ask for it.
    months && p.joiningDate && ends
      ? `Duration: ${months} Month(s) (Effective from ${shortDate(p.joiningDate)} to ${shortDate(ends)})`
      : null,
    duration,
    p.reportingToName
      ? `You will be mentored and supervised by ${p.reportingToName}, who will review your work and your progress through the internship.`
      : "You will be mentored and supervised by an assigned member of the team, who will review your work and your progress through the internship.",
    "",
    "During the internship you will be trained in:",
    ...skills.map((s, n) => `  ${n + 1}. ${s}`),
    "",
    "Training is delivered as guided sessions on each subject followed by supervised work on live projects, so that every area above is practised and not only taught.",
    // Colleges commonly require a periodic progress report during the placement, and a student who
    // has to go back and ask for one after the fact often cannot get it in time.
    "A record of the work you carry out is maintained throughout. Where your institution requires a periodic progress report or an attendance record, the company will provide it on request.",
    opts.certificate
      ? "On successful completion — satisfactory attendance, conduct and work — the company will issue an Internship Completion Certificate and, on request, an experience letter stating the period served and the work carried out."
      : "On successful completion the company will issue an Internship Completion Certificate stating the period served and the work carried out.",
    // Both clauses are conditions of the placement, so a college weighing it sees them beside the
    // dates rather than buried in a termination section further down.
    p.internshipExtendable
      ? "Extension: The internship may be extended based on the intern's performance and the company's requirements. Any extension will be confirmed in writing."
      : null,
    (p.internshipNoticeDays ?? 0) > 0
      ? `Early termination: Either party may terminate the internship by giving ${p.internshipNoticeDays} days' written notice.`
      : null,
    "This letter may be submitted to your college, university or institution for their records and for the grant of permission to undertake this internship. The company has no objection to it being forwarded for that purpose, and will respond to a reasonable verification request from your institution.",
  ];
};

// ─── The templates ──────────────────────────────────────────────────────────

function offerLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const co = companyOf(i);
  const intern = isInternship(p);
  const probationEnds = probationEndDate(p);
  const notice = noticePeriodFor({ ...p, stage: "confirmed" });
  return compose([
    ...letterHead(i, intern ? "Internship Offer Letter" : "Offer of Employment", {
      ref: extras?.offerLetterNumber,
      address: extras?.candidateAddress,
      subject: subjectWithRole(intern ? "Offer of Internship" : "Offer of Employment", p),
    }),
    `Dear ${subject.name},`,
    "",
    `We are pleased to offer you the position described below at ${co.name}. This letter sets out the principal terms of the offer. Your employment will additionally be governed by the Appointment Letter / Employment Agreement and the company policies you will be asked to acknowledge on or before joining.`,
    ...numbered([
      {
        title: "Position and Engagement",
        lines: [
          `Designation: ${value(p.designation)}`,
          // Spelled out rather than left as a category: "Full-Time" alone does not say whether the
          // job is permanent, and that is the first thing a candidate — or their bank — asks.
          `Employment Type: ${employmentTypeLine(p)}`,
          `Department: ${orgUnitLabel(p)}`,
          p.reportingToName ? `Reporting to: ${p.reportingToName}` : null,
        ],
      },
      { title: "Work Location", lines: officeAddressLines(i) },
      { title: "Date of Joining", lines: [`You are expected to join on ${longDate(p.joiningDate)}.`] },
      {
        title: intern ? "Stipend" : "Remuneration",
        lines: remunerationLines(p, intern),
      },
      // Immediately after the salary, because for a sales employee it IS part of the salary.
      salesIncentiveSection(i),
      {
        title: "Probation",
        lines: [
          probationMonthsOf(p) > 0
            ? `You will be on probation for ${probationMonthsOf(p)} month(s) from your date of joining${probationEnds ? `, ending on ${longDate(probationEnds)}` : ""}. Your performance will be evaluated during this period, and your employment will be confirmed in writing on successful completion.`
            : isInternship(p)
              ? "This is a fixed-term internship and does not carry a probation period."
              : "This engagement does not carry a probation period.",
        ],
      },
      // Only for an intern — and numbered by position, so the sections below renumber themselves.
      isInternship(p)
        ? { title: "Internship, Training and Supervision", lines: internshipBlock(p) }
        : null,
      {
        title: "Working Hours and Days",
        lines: [
          `Working hours: ${value(p.workingHours)}`,
          `Working days: ${value(p.workingDays)}`,
          // Named explicitly. "Monday to Saturday" states which days are worked and leaves the
          // reader to infer the rest; a weekly off is a term, and terms get written down.
          weeklyOffLine(p),
          p.shiftDetails ? `Shift: ${p.shiftDetails}` : null,
          "You are expected to report ten minutes before the start of working hours.",
        ],
      },
      /*
        Full-time only, and deliberately so.
        A review cycle is a commitment about a career, and it belongs on the letter of somebody
        building one here. Promising it to an intern on a fixed three-month term, or to a
        part-timer, would be stating a term the engagement cannot outlive.
      */
      p.engagementType === "full_time"
        ? {
          title: "Performance Review and Salary Revision",
          lines: [
            "Your performance will be reviewed at three months, six months and one year from your date of joining, and annually thereafter.",
            "A salary revision may be granted at any of these reviews on the basis of your performance, your contribution and the company's requirements. Any revision will be communicated to you in writing.",
            "A review is an assessment, not an automatic increase; the amount and the timing of any revision remain at the company's discretion.",
          ],
        }
        : null,
      {
        title: "Weekly Off, Public Holidays and Leave",
        lines: [
          ...leaveAndHolidayLines(p),
          "The full leave policy will be shared with you on joining. Where it is more generous than the terms above, the policy applies.",
        ],
      },
      /*
        Notice period, on the offer rather than only on the appointment letter.
        It is the term a candidate most often finds out about at the point they try to leave, and
        the one they are most entitled to know before they accept.
      */
      {
        title: "Notice Period",
        lines: intern
          ? [`This internship may be ended early by either party on ${p.internshipNoticeDays ?? 7} days' written notice.`]
          : [
            `On successful confirmation of employment, either party may end the employment by giving ${notice.days} days' written notice in writing, or salary in lieu of the notice period, subject to applicable law and company policy.`,
            "During probation a shorter notice period applies, as set out in the Appointment Letter and the company's notice policy.",
          ],
      },
      {
        title: "Confidentiality",
        lines: ["During the recruitment process and at all times afterwards, you shall keep confidential the terms of this offer and any information about the company, its clients and its work that is not in the public domain. On joining you will be asked to accept the confidentiality terms in full."],
      },
      /*
        Spelled out on the offer, not merely referenced.
        For a company whose product IS what its people make, the clause that says who owns the
        output is not boilerplate — it is the most consequential term in the letter, and a
        candidate is entitled to read it before accepting rather than on their first day.
      */
      {
        title: "Intellectual Property and Company Information",
        lines: [
          `Any software, source code, designs, prompts, datasets, models, documentation, advertisements, creative material, websites and any other intellectual property created by you in the course of your employment, or using ${co.name}'s resources, time or confidential information, shall belong exclusively to ${co.name}.`,
          ...salesInformationLines(p),
          "You agree to execute any document reasonably required to give effect to this, and your obligations under it continue after your employment ends.",
        ],
      },
      {
        title: "Company Property",
        lines: [
          `Any laptop, ID card, SIM, access card, accounts, documents or other property issued to you remains the property of ${co.name} at all times.`,
          ...salesPropertyLines(p),
          "All of it must be returned in working condition on or before your last working day, and your full and final settlement is processed after it has been.",
        ],
      },
      {
        title: "Background Verification",
        lines: ["This offer is subject to satisfactory verification of your educational qualifications, identity documents and previous employment, where applicable. An offer may be withdrawn, or employment ended, if any information provided is found to be false or materially misleading."],
      },
      {
        title: "Company Policies",
        lines: ["By accepting this offer you agree to comply with the company's policies as amended from time to time, including those on attendance and punctuality, leave, code of conduct, information security, data protection and confidentiality."],
      },
      {
        title: "Validity of this Offer",
        lines: [
          extras?.offerValidUntil
            ? `This offer is valid until ${longDate(extras.offerValidUntil)}. If it is not accepted on or before that date it stands withdrawn.`
            : "Please confirm your acceptance by signing and returning this letter at the earliest.",
          "This offer is further subject to your signing the Appointment Letter / Employment Agreement, the Non-Disclosure and Intellectual Property terms, and the acknowledgement of company policies on or before joining.",
        ],
      },
      additionalSection(extras),
    ]),
    "",
    "We look forward to welcoming you to the team.",
    ...COMPANY_SIGNATURE_BLOCKS(i),
    "",
    "ACCEPTANCE",
    "I have read and understood the terms of this offer and I accept them.",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function appointmentLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const co = companyOf(i);
  const probationEnds = probationEndDate(p);
  // Stated as a figure as well as a ladder: an employee who has to work out which rung they are on
  // to know their own notice period has not really been told it.
  const notice = noticePeriodFor(p);
  const intern = isInternship(p);
  return compose([
    ...letterHead(i, intern ? "Internship Appointment Letter and Agreement" : "Appointment Letter and Employment Agreement", {
      subject: subjectWithRole(intern ? "Appointment as Intern" : "Appointment and Terms of Employment", p),
    }),
    `Dear ${subject.name},`,
    "",
    intern
      ? `With reference to your acceptance of our offer, we are pleased to confirm your internship at ${co.name} on the following terms and conditions.`
      : `With reference to your acceptance of our offer, we are pleased to confirm your appointment at ${co.name} on the following terms and conditions.`,
    ...numbered([
      {
        title: "Position, Engagement and Reporting",
        lines: [
          `Designation: ${value(p.designation)}`,
          `Engagement: ${engagementDescription(p)}`,
          p.reportingToName ? `Reporting to: ${p.reportingToName}` : null,
          `Date of joining: ${longDate(p.joiningDate)}`,
        ],
      },
      {
        title: "Place of Work",
        lines: [
          ...officeAddressLines(i),
          "The company may, with reasonable notice, require you to work from another of its locations or from a client site where the role requires it.",
        ],
      },
      {
        title: intern ? "Stipend" : "Remuneration",
        lines: [
          ...remunerationLines(p, intern),
          intern ? null : "Revisions, if any, are at the discretion of the company and will be communicated in writing.",
          "Payment is made by bank transfer. You are required to hold a bank account in your own name and to provide its details, together with your PAN, before your first payment is processed.",
          "Statutory deductions — income tax deducted at source (TDS), and Provident Fund and ESI where applicable — will be made as required by law.",
        ],
      },
      // The other half of a sales employee's pay, and the targets confirmation turns on.
      salesIncentiveSection(i),
      {
        title: "Probation and Confirmation",
        lines: [
          probationMonthsOf(p) > 0
            ? `You will be on probation for ${probationMonthsOf(p)} month(s) from the date of joining${probationEnds ? `, ending on ${longDate(probationEnds)}` : ""}. During probation your attendance, discipline, work quality, productivity, communication, teamwork, learning ability and adherence to company policies will be evaluated. The company may, where the circumstances warrant it, extend the probation period by written notice stating the extension and the expectations to be met. Your employment will be confirmed in writing on successful completion of probation.`
            : intern
              ? "This is a fixed-term internship and does not carry a probation period. Your attendance, conduct and work will be reviewed through the internship by your supervisor."
              : "This engagement does not carry a probation period.",
        ],
      },
      // Only for an intern, and numbered by position — every section below renumbers itself.
      intern
        ? { title: "Internship, Training and Supervision", lines: internshipBlock(p, { certificate: true }) }
        : null,
      {
        title: "Working Hours, Days and Shift",
        lines: [
          `Working hours: ${value(p.workingHours)}. Working days: ${value(p.workingDays)}.`,
          p.shiftDetails ? `Shift: ${p.shiftDetails}.` : null,
          intern
            ? "Where your institution requires you to attend classes or examinations, the company will accommodate reasonable adjustments to these hours on prior written request."
            : "You may be required to work such additional hours as are reasonably necessary for the proper performance of your duties.",
        ],
      },
      {
        title: "Weekly Off, Public Holidays, Leave and Attendance",
        lines: [
          ...leaveAndHolidayLines(p),
          "You are required to record your attendance through the company's system on every working day, and to be available and working within your working hours. Persistent late arrival, unrecorded attendance or absence without intimation is treated as a matter of discipline and may be dealt with under the company's disciplinary policy.",
        ],
      },
      {
        title: "Remote Work",
        lines: ["Where the company permits you to work remotely, whether occasionally or as a regular arrangement, the same working hours, attendance recording, availability, confidentiality and data-protection obligations apply as they do at the workplace. Permission to work remotely is granted at the company's discretion and may be withdrawn."],
      },
      {
        title: "Your Responsibilities",
        lines: ["You shall perform the duties assigned to you diligently and to the standard the role requires; comply with the company's policies as amended from time to time; maintain the confidentiality of company and client information; take proper care of company assets issued to you; observe the code of conduct in your dealings with colleagues, clients and partners; record your attendance and apply for leave as required; report to your reporting manager and keep them informed of the progress of your work; and act at all times in the company's best interests."],
      },
      {
        title: "Confidentiality",
        lines: ["You shall not, during your employment or at any time after it ends, disclose or use any confidential information of the company, its clients or its partners, except as required for the proper performance of your duties or by law. Confidential information includes client data, pricing, business plans, source code, prompts, creative assets, processes and any information not in the public domain."],
      },
      {
        title: "Intellectual Property and Company Information",
        lines: [
          "All work product, inventions, designs, creative material, code, prompts, documentation and other intellectual property created by you in the course of your employment, or using company resources, shall vest solely in the company. You agree to execute any document reasonably required to give effect to this clause. Your confidentiality and intellectual property obligations continue after your employment ends.",
          ...salesInformationLines(p),
        ],
      },
      {
        title: "Conduct and Discipline",
        lines: ["You shall comply with the company's policies, maintain professional conduct, and act in the company's best interests. Misconduct will be dealt with under the company's misconduct and disciplinary policy, which provides for the process to be followed before any action is taken."],
      },
      {
        title: "Conflict of Interest",
        lines: ["You shall not, during your employment, engage in any business, employment or activity that conflicts with the company's interests or with the proper performance of your duties, without the company's prior written consent. You shall disclose to the company any personal, financial or family interest that could reasonably be seen as a conflict."],
      },
      {
        title: "Non-Solicitation",
        lines: ["For twelve months after your employment ends, you shall not solicit, for yourself or for any other person or business, any client of the company you dealt with in the last twelve months of your employment, nor induce any employee of the company to leave it. This clause is limited to what is reasonable to protect the company's legitimate business interests and does not restrain you from taking up lawful employment of your choice."],
      },
      {
        title: "Background Verification",
        lines: ["This appointment is subject to verification of the information, documents and references you have provided. If any of it is found to be false or materially misleading, the company may withdraw this appointment or end your employment, following the process the disciplinary policy and applicable law require."],
      },
      {
        title: intern ? "Completion and Early Termination" : "Notice Period and Termination",
        lines: intern
          ? [
            "This internship ends on the date stated above without further notice. Either party may end it earlier by giving seven (7) days' written notice.",
            "Where the internship is ended early by the company for any reason other than misconduct, a certificate stating the period actually served will still be issued, so that your institution has a record of the time completed.",
          ]
          : [
            "Either party may end this employment by giving written notice in accordance with the notice period applicable to your stage of employment, as set out in the company's notice policy and summarised below:",
            "Intern — 7 days. Full-time or part-time employee during probation — 15 days. Confirmed employee — 30 days. Team lead or other critical senior role — 45 days.",
            `The notice period applicable to you at the date of this letter is ${notice.days} day(s) — ${notice.label.toLowerCase()}.`,
            "The notice period may be shortened or waived by mutual written agreement. Payment in lieu of unserved notice may be agreed in writing, subject to applicable law. Termination on grounds of misconduct follows the disciplinary procedure and applicable law rather than this clause.",
          ],
      },
      {
        title: "Return of Company Property",
        lines: [
          "On the last working day, or earlier if the company asks, you shall complete a proper handover and return all company property issued to you, including the ID card, laptop, phone, SIM, access cards, documents and any other assets recorded against your name. Your full and final settlement will be processed after the handover and the return of company property are complete, in accordance with company policy and applicable law.",
          ...salesPropertyLines(p),
        ],
      },
      {
        title: "Amendment and Governing Terms",
        lines: ["This letter, together with the company policies referred to in it, constitutes the terms of your engagement. The company may amend its policies from time to time and will inform you of material changes. No change to the terms of this letter is effective unless made in writing. Nothing in this letter overrides any right you have under applicable law."],
      },
      {
        title: "Governing Law and Jurisdiction",
        lines: ["This letter and your engagement are governed by the laws of India, and the courts having jurisdiction over the place of work stated above shall have jurisdiction over any dispute arising from them."],
      },
      additionalSection(extras),
    ]),
    "",
    "Please sign below to confirm that you have read, understood and accepted these terms.",
    ...COMPANY_SIGNATURE_BLOCKS(i),
    "",
    "ACCEPTED AND AGREED",
    `Place: ${value(p.workLocation)}`,
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function nda(i: BuildDocumentInput): string {
  const { subject, extras } = i;
  const co = companyOf(i);
  return compose([
    ...letterHead(i, "Non-Disclosure, Confidentiality and Intellectual Property Agreement", {
      subject: "Confidentiality and intellectual property undertaking",
    }),
    `This agreement is entered into between ${co.name} ("the Company") and ${subject.name} ("the Employee") in connection with the Employee's employment with the Company.`,
    "",
    "1. Confidential Information",
    "Confidential Information means all non-public information relating to the Company, its clients, vendors and partners, in any form, including client lists and contact details, pricing and commercials, business and marketing plans, creative assets, scripts, prompts, source code, designs, processes, credentials, financial information and employee information.",
    "",
    "2. Obligations of the Employee",
    "The Employee shall keep all Confidential Information strictly confidential; use it solely for the performance of their duties; not copy, transmit, publish or share it with any person inside or outside the Company who does not need it for their work; and take reasonable care to protect it from loss or unauthorised access.",
    "",
    "3. Client Material",
    "Material belonging to a client — including footage, logos, photographs, brand assets and business information — shall be used only for that client's work, and shall not be reused, published or shown to any other party without written permission.",
    "",
    "4. Intellectual Property",
    "All intellectual property created by the Employee in the course of employment, or using Company time, data, tools or resources, shall vest solely in the Company. The Employee assigns to the Company all rights in such work product and waives any moral rights to the extent permitted by law.",
    "",
    "5. Company Systems and Credentials",
    "Access credentials issued to the Employee are personal and shall not be shared. The Employee shall not install unauthorised software on Company devices, nor use Company accounts for personal purposes.",
    "",
    "6. Duration",
    "The obligations in this agreement apply during employment and continue after it ends, for as long as the information remains confidential.",
    "",
    "7. Return of Information",
    "On the last working day, or earlier on request, the Employee shall return or securely delete all Confidential Information in their possession, including copies held on personal devices or accounts.",
    "",
    "8. Consequences of Breach",
    "A breach of this agreement is treated as serious misconduct and may lead to disciplinary action under the Company's disciplinary policy, and to such legal remedies as are available to the Company under applicable law.",
    ...additional(extras, 9),
    ...COMPANY_SIGNATURE_BLOCKS(i),
    "",
    "ACCEPTED AND AGREED",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function policyAcknowledgement(i: BuildDocumentInput): string {
  const { subject, extras } = i;
  const co = companyOf(i);
  return compose([
    ...letterHead(i, "Acknowledgement of Company Policies", {
      subject: "Acknowledgement of company policies",
    }),
    `I confirm that the following policies of ${co.name} have been made available to me, that I have read and understood them, and that I agree to comply with them.`,
    "",
    "1. Code of Conduct and Professional Behaviour",
    "Expected standards of conduct with colleagues, clients and partners, including a workplace free of harassment and discrimination.",
    "",
    "2. Attendance, Working Hours and Leave Policy",
    "Check-in and check-out through the company system, applying for leave in advance, and the treatment of paid, unpaid and half-day leave.",
    `I understand in particular that the weekly off and the public holidays declared by the company are paid days off which do not count against my leave; that my paid leave is ${inWords(PAID_LEAVE_PER_MONTH)} (${PAID_LEAVE_PER_MONTH}) days per pay cycle; that unused paid leave lapses at the end of the pay cycle and is neither carried forward nor encashed; and that leave taken beyond that entitlement is leave without pay.`,
    "",
    "3. Confidentiality, Data Protection and IT Usage",
    "Handling of client and company information, use of company accounts and devices, and the prohibition on sharing credentials.",
    "",
    "4. Company Asset Policy",
    "Care, permitted use and return of assets issued to me, and my acknowledgement of every asset recorded against my name.",
    "",
    "5. Misconduct and Disciplinary Policy",
    "The categories of misconduct and the process the company follows before any disciplinary action is taken.",
    "",
    "6. Notice Period and Exit Policy",
    "The notice period applicable to my stage of employment, handover expectations, return of assets and final settlement.",
    ...additional(extras, 7),
    "",
    "I understand that these policies may be updated from time to time and that I will be informed of material changes.",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
    ...COMPANY_SIGNATURE_BLOCKS(i),
  ]);
}

function confirmationLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const co = companyOf(i);
  return compose([
    ...letterHead(i, "Confirmation of Employment", { subject: subjectWithRole("Confirmation of Employment", p) }),
    `Dear ${subject.name},`,
    "",
    `We are pleased to inform you that you have successfully completed your probation period at ${co.name}.`,
    "",
    "1. Confirmation",
    `Your employment is confirmed with effect from ${longDate(extras?.effectiveFrom || p.confirmedOn || i.issuedOn)}. You are now a confirmed ${engagementLabel(p)} employee in the role of ${value(p.designation)}.`,
    "",
    "2. Continuing Terms",
    "Your employment continues on the terms of your existing Appointment Letter / Employment Agreement, which remains in force. This letter does not replace that agreement; it records the completion of your probation.",
    "",
    "3. Notice Period",
    "With effect from your confirmation, the notice period applicable to a confirmed employee applies to your employment, as set out in your Appointment Letter and the company's notice policy.",
    extras?.newCtcMonthly
      ? "\n4. Revised Remuneration\nYour gross monthly salary is revised to " + rupees(extras.newCtcMonthly) + ` with effect from ${longDate(extras.effectiveFrom || i.issuedOn)}.`
      : null,
    ...additional(extras, extras?.newCtcMonthly ? 5 : 4),
    "",
    "Thank you for your contribution during your probation. We look forward to your continued association with us.",
    ...COMPANY_SIGNATURE_BLOCKS(i),
  ]);
}

function probationExtension(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  return compose([
    ...letterHead(i, "Extension of Probation Period", { subject: subjectWithRole("Extension of Probation Period", p) }),
    `Dear ${subject.name},`,
    "",
    `This letter is with reference to the probation period under your Appointment Letter dated ${longDate(p.joiningDate)}.`,
    "",
    "1. Extension",
    `Your probation period is extended up to ${longDate(extras?.extendedTo)}. Your employment continues on the existing terms during the extended period.`,
    "",
    "2. Reason for the Extension",
    value(extras?.extensionReason) === "—"
      ? "The company requires a further period to evaluate your suitability for confirmation."
      : value(extras?.extensionReason),
    "",
    "3. Expectations During the Extended Period",
    value(extras?.expectation) === "—"
      ? "You are expected to meet the standards set out in your role — attendance, discipline, work quality, productivity, communication, teamwork and adherence to company policies — and these will be reviewed before the end of the extended period."
      : value(extras?.expectation),
    "",
    "4. Outcome",
    "At the end of the extended period the company will either confirm your employment in writing, or take such action as the Appointment Letter and applicable law permit.",
    ...additional(extras, 5),
    ...COMPANY_SIGNATURE_BLOCKS(i),
    "",
    "ACKNOWLEDGED",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function incrementLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  return compose([
    ...letterHead(i, "Revision of Remuneration", { subject: subjectWithRole("Revision of Remuneration", p) }),
    `Dear ${subject.name},`,
    "",
    "In recognition of your performance and contribution, we are pleased to inform you of the following revision to your remuneration.",
    "",
    "1. Revision",
    `Designation: ${value(p.designation)} (unchanged)`,
    `Gross monthly salary: ${rupees(p.ctcMonthly)} → ${rupees(extras?.newCtcMonthly)}`,
    `Effective from: ${longDate(extras?.effectiveFrom || i.issuedOn)}`,
    "",
    "2. Continuing Terms",
    "All other terms of your employment remain unchanged and continue to be governed by your Appointment Letter / Employment Agreement.",
    ...additional(extras, 3),
    "",
    "We thank you for your work and look forward to your continued contribution.",
    ...COMPANY_SIGNATURE_BLOCKS(i),
  ]);
}

/**
 * A promotion, which is a change of role — not merely a bigger number.
 *
 * Kept separate from the increment letter because the two say different things: an increment
 * rewards the work already being done, a promotion changes what the person is responsible for and
 * who they answer to. An employee showing this to a future employer is proving the role, and a
 * letter headed "Revision of Remuneration" does not prove it.
 */
function promotionLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const revised = typeof extras?.newCtcMonthly === "number";
  return compose([
    ...letterHead(i, "Promotion Letter", { subject: `Promotion to ${value(extras?.newDesignation)}` }),
    `Dear ${subject.name},`,
    "",
    "In recognition of your performance, your growing contribution and the responsibility you have taken on, we are pleased to inform you of your promotion as set out below.",
    "",
    "1. Promotion",
    `Designation: ${value(p.designation)} → ${value(extras?.newDesignation)}`,
    p.reportingToName ? `Reporting to: ${p.reportingToName}` : null,
    `Effective from: ${longDate(extras?.effectiveFrom || i.issuedOn)}`,
    "",
    "2. Remuneration",
    revised
      ? `Gross monthly salary: ${rupees(p.ctcMonthly)} → ${rupees(extras?.newCtcMonthly)}, effective from the same date and subject to statutory deductions as applicable.`
      : "Your existing remuneration continues unchanged with this promotion. Any revision will be communicated separately in writing.",
    "",
    "3. Responsibilities",
    "You are expected to carry out the duties of your new role, together with such other duties as may reasonably be assigned to you, to the standard the role requires. Your reporting manager will discuss the expectations of the role with you.",
    "",
    "4. Continuing Terms",
    "All other terms of your employment remain unchanged and continue to be governed by your Appointment Letter / Employment Agreement, including your obligations of confidentiality and intellectual property.",
    ...additional(extras, 5),
    "",
    "We congratulate you and look forward to your contribution in your new role.",
    ...COMPANY_SIGNATURE_BLOCKS(i),
  ]);
}

/**
 * The letter that asks before it concludes.
 *
 * A warning letter records a finding; a show cause notice records an allegation and asks the
 * employee to answer it by a date. Issuing the finding without ever having asked the question is
 * the single most common way a disciplinary process is found to be unfair afterwards — which is
 * why this sits above the warning letter in the list, not below it.
 */
function showCauseNotice(i: BuildDocumentInput): string {
  const { subject, extras } = i;
  const by = extras?.responseByDate;
  return compose([
    ...letterHead(i, "Show Cause Notice", { subject: "Notice to show cause" }),
    `Dear ${subject.name},`,
    "",
    "This notice is issued to bring to your attention the matter recorded below and to give you an opportunity to explain it before the company takes any view on it. Nothing has been decided, and no conclusion has been drawn against you at this stage.",
    "",
    "1. The Matter",
    value(extras?.incident),
    extras?.incidentDate ? `Date of the incident/observation: ${longDate(extras.incidentDate)}` : null,
    "",
    "2. Why This Is of Concern",
    "The conduct described above appears, on the face of it, to be inconsistent with the obligations set out in your Appointment Letter / Employment Agreement and the company's policies.",
    "",
    "3. You Are Required to Show Cause",
    by
      ? `You are required to submit your written explanation to your reporting manager on or before ${longDate(by)}, stating why the company should not proceed further in this matter.`
      : "You are required to submit your written explanation to your reporting manager within three (3) working days of receiving this notice, stating why the company should not proceed further in this matter.",
    "You may set out any facts, circumstances or documents you wish the company to take into account.",
    "",
    "4. If No Explanation Is Received",
    "If no explanation is received within the time allowed, the company will proceed on the material available to it. Your explanation, if submitted, will be considered before any decision is taken.",
    "",
    "5. Status",
    "This notice is not a punishment and does not by itself record any finding against you.",
    ...additional(extras, 6),
    ...COMPANY_SIGNATURE_BLOCKS(i),
    "",
    "ACKNOWLEDGEMENT OF RECEIPT",
    "Signing below records receipt of this notice only. It is not an admission of the matter recorded in it.",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function warningLetter(i: BuildDocumentInput): string {
  const { subject, extras } = i;
  return compose([
    ...letterHead(i, "Warning Letter", { subject: "Written warning" }),
    `Dear ${subject.name},`,
    "",
    "This letter is issued to formally record a concern with your conduct or performance and to give you an opportunity to respond and to correct it.",
    "",
    "1. The Concern",
    value(extras?.incident),
    extras?.incidentDate ? `Date of the incident/observation: ${longDate(extras.incidentDate)}` : null,
    "",
    "2. Expected Correction",
    value(extras?.expectation) === "—"
      ? "You are expected to correct this immediately and to maintain the standards set out in your Appointment Letter and the company's policies."
      : value(extras?.expectation),
    "",
    "3. Your Response",
    "If you disagree with anything recorded above, or wish to explain the circumstances, you may submit your written response to your reporting manager. Your response will be considered before any further step is taken.",
    "",
    "4. Consequences",
    "A repetition, or a failure to correct the matter, may lead to further action under the company's misconduct and disciplinary policy, which provides for the process to be followed before any action is taken.",
    ...additional(extras, 5),
    ...COMPANY_SIGNATURE_BLOCKS(i),
    "",
    "ACKNOWLEDGEMENT OF RECEIPT",
    "Signing below records receipt of this letter. It is not an admission of the matters recorded in it.",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

/**
 * The company's written answer to a resignation.
 *
 * Worth its own letter because it is the document that fixes the last working day. Until the
 * company has accepted in writing, the employee has told it they are leaving and nothing more —
 * and the notice period, the handover and the settlement all count from a date that nobody has yet
 * agreed. This is also where an early release or a waiver of notice gets recorded, which is
 * precisely the term that gets argued about later.
 */
function resignationAcceptance(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const sep = p.separation;
  const submitted = extras?.resignationDate || sep?.submittedOn || null;
  const lwd = extras?.lastWorkingDay || sep?.lastWorkingDay || null;
  const early = sep?.earlyRelease;
  const waived = sep?.waivedDays ?? 0;
  return compose([
    ...letterHead(i, "Acceptance of Resignation", { subject: "Acceptance of your resignation" }),
    `Dear ${subject.name},`,
    "",
    `We acknowledge receipt of your resignation dated ${longDate(submitted)}, and write to confirm that it has been accepted.`,
    "",
    "1. Last Working Day",
    `Your last working day with the company will be ${longDate(lwd)}.`,
    early
      ? "This date has been brought forward from the date your full notice period would otherwise have ended, by mutual agreement."
      : null,
    waived > 0
      ? `${waived} day(s) of the applicable notice period have not been served. Their treatment will follow the terms of your Appointment Letter / Employment Agreement.`
      : null,
    "",
    "2. Until Your Last Working Day",
    "You are expected to continue discharging your duties, to remain available during your working hours, and to complete a full handover of your work, files, credentials and any work in progress to the person nominated by your reporting manager.",
    "",
    "3. Company Property",
    "All company property issued to you — including any laptop, phone, SIM, access card, accounts and credentials — must be returned on or before your last working day.",
    "",
    "4. Continuing Obligations",
    "Your obligations of confidentiality and intellectual property survive the end of your employment and continue to bind you after your last working day.",
    "",
    "5. Settlement and Documents",
    "Your full and final settlement will be processed in accordance with company policy and applicable law after the handover and return of company property are complete. Your relieving letter and experience certificate will be issued on completion of the exit formalities.",
    ...additional(extras, 6),
    "",
    "We thank you for your contribution and wish you well.",
    ...COMPANY_SIGNATURE_BLOCKS(i),
  ]);
}

/**
 * What the employee is finally owed, on paper.
 *
 * Every figure here is already recorded on the separation record — this letter is the statement of
 * it, which is the thing an employee can actually keep, question, or show to somebody. It is signed
 * by the employee for the same reason: a settlement nobody acknowledged is the one that gets
 * reopened.
 */
function fullFinalSettlement(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const sep = p.separation;
  const lwd = extras?.lastWorkingDay || sep?.lastWorkingDay || null;
  const amount = typeof extras?.settlementAmount === "number"
    ? extras.settlementAmount
    : sep?.finalSettlementAmount ?? null;
  return compose([
    ...letterHead(i, "Full and Final Settlement", { subject: "Full and final settlement of dues" }),
    `Dear ${subject.name},`,
    "",
    `This letter sets out the full and final settlement of your dues consequent to the cessation of your employment with effect from ${longDate(lwd)}.`,
    "",
    "1. Period of Employment",
    `From ${longDate(p.joiningDate)} to ${longDate(lwd)}, as ${value(p.designation)}.`,
    "",
    "2. Settlement Amount",
    amount !== null
      ? `Net amount payable: ${rupees(amount)}, arrived at after accounting for salary due for the period worked, any leave encashment, any reimbursements, and any recoveries and statutory deductions applicable.`
      : "The net amount payable has been computed after accounting for salary due for the period worked, any leave encashment, any reimbursements, and any recoveries and statutory deductions applicable.",
    sep?.finalSettlementOn ? `Settled on: ${longDate(sep.finalSettlementOn)}` : null,
    value(extras?.settlementNote) === "—" ? null : value(extras?.settlementNote),
    "",
    "3. Mode of Payment",
    "The amount will be credited to the bank account registered with the company against your record. Please ensure those details are current.",
    "",
    "4. Company Property",
    sep?.assetsReturnedOn
      ? `All company property issued to you was returned as on ${longDate(sep.assetsReturnedOn)}.`
      : "This settlement is subject to the return of all company property issued to you.",
    "",
    "5. Continuing Obligations",
    "Your obligations of confidentiality and intellectual property survive the end of your employment and are unaffected by this settlement.",
    "",
    "6. Confirmation",
    "Please review the above. If you consider anything to be incorrect or omitted, raise it in writing before signing. Signing below records your acknowledgement of this statement of settlement.",
    ...additional(extras, 7),
    ...COMPANY_SIGNATURE_BLOCKS(i),
    "",
    "ACKNOWLEDGEMENT",
    "I acknowledge the settlement set out above.",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function relievingLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const co = companyOf(i);
  const sep = p.separation;
  const lwd = extras?.lastWorkingDay || sep?.lastWorkingDay || null;
  return compose([
    ...letterHead(i, "Relieving Letter", { subject: subjectWithRole("Relieving from services", p) }),
    "TO WHOMSOEVER IT MAY CONCERN",
    "",
    `This is to certify that ${subject.name}${subject.employeeId ? ` (Employee ID: ${subject.employeeId})` : ""} was employed with ${co.name} as ${value(p.designation)} from ${longDate(p.joiningDate)} to ${longDate(lwd)}.`,
    "",
    "1. Relieving",
    `${subject.name} has been relieved from the services of the company with effect from the close of business on ${longDate(lwd)}.`,
    "",
    "2. Handover and Company Property",
    sep?.assetsReturnedOn
      ? `Work handover has been completed and all company property issued has been returned as on ${longDate(sep.assetsReturnedOn)}.`
      : "Work handover has been completed and company property issued has been returned.",
    "",
    "3. Settlement",
    value(extras?.settlementNote) === "—"
      ? (sep?.finalSettlementOn
        ? `Full and final settlement has been processed on ${longDate(sep.finalSettlementOn)}.`
        : "Full and final settlement will be processed in accordance with company policy and applicable law.")
      : value(extras?.settlementNote),
    ...additional(extras, 4),
    "",
    "We thank them for their services and wish them well in their future endeavours.",
    ...COMPANY_SIGNATURE_BLOCKS(i),
  ]);
}

function experienceLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const co = companyOf(i);
  const lwd = extras?.lastWorkingDay || p.separation?.lastWorkingDay || null;
  return compose([
    ...letterHead(i, "Experience Certificate", { subject: subjectWithRole("Certificate of experience", p) }),
    "TO WHOMSOEVER IT MAY CONCERN",
    "",
    `This is to certify that ${subject.name}${subject.employeeId ? ` (Employee ID: ${subject.employeeId})` : ""} was employed with ${co.name} from ${longDate(p.joiningDate)} to ${longDate(lwd)}.`,
    "",
    "1. Role",
    `Designation at the time of leaving: ${value(p.designation)}`,
    `Engagement: ${engagementLabel(p)}`,
    `Department: ${orgUnitLabel(p)}`,
    "",
    "2. Conduct",
    "During the above period their conduct and performance were found to be satisfactory.",
    ...additional(extras, 3),
    "",
    "This certificate is issued on request for whatever purpose it may serve.",
    ...COMPANY_SIGNATURE_BLOCKS(i),
  ]);
}

const BUILDERS: Record<HrDocumentType, (i: BuildDocumentInput) => string> = {
  offer_letter: offerLetter,
  appointment_letter: appointmentLetter,
  nda,
  policy_acknowledgement: policyAcknowledgement,
  confirmation_letter: confirmationLetter,
  probation_extension: probationExtension,
  increment_letter: incrementLetter,
  promotion_letter: promotionLetter,
  show_cause_notice: showCauseNotice,
  warning_letter: warningLetter,
  resignation_acceptance: resignationAcceptance,
  relieving_letter: relievingLetter,
  experience_letter: experienceLetter,
  full_final_settlement: fullFinalSettlement,
};

/** Build a document's title and full body text from the employee's record. */
export function buildDocument(input: BuildDocumentInput): BuiltDocument {
  const bodyText = BUILDERS[input.type](input);
  return {
    title: `${HR_DOCUMENT_LABELS[input.type]} — ${input.subject.name}`,
    bodyText,
  };
}

/**
 * Print the allocated reference number onto a letter that has already been written.
 *
 * The number is taken at the moment of issue — that is what makes it a register entry rather than
 * a guess — but by then the letter may have been edited by hand, so rebuilding it from the profile
 * to bake the number in would silently throw those edits away. This puts the line where
 * `letterHead` would have put it: immediately above the date, which is where a reader of an Indian
 * business letter looks for it.
 *
 * Leaves the text alone when it already carries a reference (an offer letter with one typed in),
 * and when there is no date line to anchor to — a letter that has been rewritten past recognition
 * still gets its number, in the register, where the search box can find it.
 */
export function withReference(bodyText: string, referenceNo?: string | null): string {
  const ref = (referenceNo || "").trim();
  if (!ref) return bodyText;
  const lines = bodyText.split("\n");
  if (lines.some((l) => /^\s*Ref:\s*\S/i.test(l))) return bodyText;
  const dateAt = lines.findIndex((l) => /^\s*Date:\s*\S/i.test(l));
  if (dateAt < 0) return bodyText;
  lines.splice(dateAt, 0, `Ref: ${ref}`);
  return lines.join("\n");
}

/**
 * The facts a document type needs beyond the standing profile, so the issue form can ask for
 * exactly those and nothing more.
 */
export const EXTRA_FIELDS: Record<HrDocumentType, (keyof HrDocumentExtras)[]> = {
  offer_letter: ["offerLetterNumber", "candidateAddress", "offerValidUntil"],
  appointment_letter: [],
  nda: [],
  policy_acknowledgement: [],
  confirmation_letter: ["effectiveFrom", "newCtcMonthly"],
  probation_extension: ["extendedTo", "extensionReason", "expectation"],
  increment_letter: ["newCtcMonthly", "effectiveFrom"],
  promotion_letter: ["newDesignation", "newCtcMonthly", "effectiveFrom"],
  show_cause_notice: ["incident", "incidentDate", "responseByDate"],
  warning_letter: ["incident", "incidentDate", "expectation"],
  resignation_acceptance: ["resignationDate", "lastWorkingDay"],
  relieving_letter: ["lastWorkingDay", "settlementNote"],
  experience_letter: ["lastWorkingDay"],
  full_final_settlement: ["lastWorkingDay", "settlementAmount", "settlementNote"],
};

/** Human labels for those extra fields. */
export const EXTRA_FIELD_LABELS: Record<keyof HrDocumentExtras, string> = {
  offerValidUntil: "Offer valid until",
  offerLetterNumber: "Offer letter number",
  candidateAddress: "Candidate address",
  extendedTo: "Probation extended to",
  extensionReason: "Reason for extension",
  newCtcMonthly: "Revised gross monthly salary (₹)",
  newDesignation: "New designation",
  effectiveFrom: "Effective from",
  incident: "What happened",
  incidentDate: "Date of the incident",
  expectation: "What is expected now",
  responseByDate: "Explanation due by",
  resignationDate: "Resignation received on",
  lastWorkingDay: "Last working day",
  settlementNote: "Settlement note",
  settlementAmount: "Net amount payable (₹)",
  additionalTerms: "Additional terms",
};

/** Which of those fields are dates, numbers or long text — drives the input type in the form. */
export const EXTRA_FIELD_KIND: Record<keyof HrDocumentExtras, "date" | "number" | "text" | "textarea"> = {
  offerValidUntil: "date",
  offerLetterNumber: "text",
  candidateAddress: "textarea",
  extendedTo: "date",
  extensionReason: "textarea",
  newCtcMonthly: "number",
  newDesignation: "text",
  effectiveFrom: "date",
  incident: "textarea",
  incidentDate: "date",
  expectation: "textarea",
  responseByDate: "date",
  resignationDate: "date",
  lastWorkingDay: "date",
  settlementNote: "textarea",
  settlementAmount: "number",
  additionalTerms: "textarea",
};

/** Fields a document cannot sensibly be issued without. */
export const EXTRA_FIELD_REQUIRED: Partial<Record<HrDocumentType, (keyof HrDocumentExtras)[]>> = {
  probation_extension: ["extendedTo"],
  increment_letter: ["newCtcMonthly"],
  // A promotion letter with no new designation is not a promotion letter.
  promotion_letter: ["newDesignation"],
  show_cause_notice: ["incident"],
  warning_letter: ["incident"],
  // The date the resignation was received is what the notice period is counted from.
  resignation_acceptance: ["lastWorkingDay"],
  relieving_letter: ["lastWorkingDay"],
  experience_letter: ["lastWorkingDay"],
  full_final_settlement: ["lastWorkingDay"],
};
