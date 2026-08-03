import { format } from "date-fns";
import { COMPANY_DEFAULTS, resolveCompany, type ResolvedCompany } from "@/utils/company";
import { formatPhoneDisplay } from "@/utils/phone";
import {
  internshipSkillsFor, isInternship, noticePeriodFor, parseDate, probationEndDate,
} from "@/utils/hrPolicy";
import { ENGAGEMENT_LABELS, HR_DOCUMENT_LABELS } from "@/types/hr";
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
  email?: string | null;
  employeeId?: string | null;
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
  return signatoriesOf(i).flatMap((s) => [
    "",
    `For ${co.name} — ${s.designation || "Authorised Signatory"} Signature:`,
    `Name: ${s.name}`,
    `Designation: ${s.designation}`,
    `Date: ${longDate(i.issuedOn)}`,
  ]);
};

/** The header block every letter opens with — who it is from, who it is to, and when. */
const letterHead = (
  i: BuildDocumentInput,
  title: string,
  opts: { ref?: string | null; address?: string | null } = {},
): (string | null)[] => {
  const { subject } = i;
  // An explicit per-letter reference (the offer letter has one) wins over the allocated series
  // number, so an admin who types their own reference still sees exactly that on the page.
  const ref = (opts.ref || "").trim() || (i.referenceNo || "").trim();
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
  ];
};

const engagementLabel = (p: EmployeeProfile): string =>
  p.engagementType ? ENGAGEMENT_LABELS[p.engagementType] : "—";

/** "Full-Time Employee (3-month probation)" — the engagement, stated the way the policy asks for. */
export function engagementDescription(p: EmployeeProfile): string {
  const base = engagementLabel(p);
  if (p.engagementType === "intern") return "Intern (fixed-term internship engagement)";
  if (p.engagementType === "contract") return "Contract";
  const months = p.probationMonths ?? 0;
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

  return [
    "This is a structured, supervised internship. You will be trained on the job and given real work under guidance, rather than being left to observe.",
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
    "This letter may be submitted to your college, university or institution for their records and for the grant of permission to undertake this internship. The company has no objection to it being forwarded for that purpose, and will respond to a reasonable verification request from your institution.",
  ];
};

// ─── The templates ──────────────────────────────────────────────────────────

function offerLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const co = companyOf(i);
  const probationEnds = probationEndDate(p);
  return compose([
    ...letterHead(i, "Offer of Employment", {
      ref: extras?.offerLetterNumber,
      address: extras?.candidateAddress,
    }),
    `Dear ${subject.name},`,
    "",
    `We are pleased to offer you the position described below at ${co.name}. This letter sets out the principal terms of the offer. Your employment will additionally be governed by the Appointment Letter / Employment Agreement and the company policies you will be asked to acknowledge on or before joining.`,
    ...numbered([
      {
        title: "Position and Engagement",
        lines: [
          `Designation: ${value(p.designation)}`,
          `Engagement: ${engagementDescription(p)}`,
          `Department: ${p.department === "tech" ? "Technical" : "Sales"}`,
          p.reportingToName ? `Reporting to: ${p.reportingToName}` : null,
        ],
      },
      { title: "Work Location", lines: [value(p.workLocation)] },
      { title: "Date of Joining", lines: [`You are expected to join on ${longDate(p.joiningDate)}.`] },
      {
        title: isInternship(p) ? "Stipend" : "Remuneration",
        lines: [
          isInternship(p)
            ? `Monthly stipend: ${rupees(p.ctcMonthly)}`
            : `Gross monthly salary (CTC): ${rupees(p.ctcMonthly)}`,
          ordinalDay(p.salaryPayDay)
            ? `Payable monthly, on or about the ${ordinalDay(p.salaryPayDay)} of each month, subject to statutory deductions as applicable.`
            : "Payable monthly, subject to statutory deductions as applicable.",
        ],
      },
      {
        title: "Probation",
        lines: [
          (p.probationMonths ?? 0) > 0
            ? `You will be on probation for ${p.probationMonths} month(s) from your date of joining${probationEnds ? `, ending on ${longDate(probationEnds)}` : ""}. Your performance will be evaluated during this period, and your employment will be confirmed in writing on successful completion.`
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
          p.shiftDetails ? `Shift: ${p.shiftDetails}` : null,
        ],
      },
      {
        title: "Leave",
        lines: ["You will be entitled to leave in accordance with the company's leave policy as applicable to you from time to time. Leave is applied for and approved in advance through the company's system, except in an emergency, when it must be intimated at the earliest opportunity. The full policy will be shared with you on joining."],
      },
      {
        title: "Confidentiality",
        lines: ["During the recruitment process and at all times afterwards, you shall keep confidential the terms of this offer and any information about the company, its clients and its work that is not in the public domain. On joining you will be asked to accept the confidentiality and intellectual property terms in full."],
      },
      {
        title: "Conditions of this Offer",
        lines: [
          "This offer is subject to verification of the information and documents you provide, and to your signing the Appointment Letter / Employment Agreement, the Non-Disclosure and Intellectual Property terms, and the acknowledgement of company policies.",
          extras?.offerValidUntil
            ? `Please confirm your acceptance on or before ${longDate(extras.offerValidUntil)}. This offer stands withdrawn if it is not accepted by that date.`
            : "Please confirm your acceptance by signing below.",
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
    ...letterHead(i, intern ? "Internship Appointment Letter and Agreement" : "Appointment Letter and Employment Agreement"),
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
        lines: [`${value(p.workLocation)}. The company may, with reasonable notice, require you to work from another of its locations or from a client site where the role requires it.`],
      },
      {
        title: intern ? "Stipend" : "Remuneration",
        lines: [
          intern
            ? `Monthly stipend: ${rupees(p.ctcMonthly)}, payable monthly${ordinalDay(p.salaryPayDay) ? ` on or about the ${ordinalDay(p.salaryPayDay)} of each month` : ""}.`
            : `Gross monthly salary (CTC): ${rupees(p.ctcMonthly)}, payable monthly${ordinalDay(p.salaryPayDay) ? ` on or about the ${ordinalDay(p.salaryPayDay)} of each month` : ""}. Revisions, if any, are at the discretion of the company and will be communicated in writing.`,
          "Payment is made by bank transfer. You are required to hold a bank account in your own name and to provide its details, together with your PAN, before your first payment is processed.",
          "Statutory deductions — income tax deducted at source (TDS), and Provident Fund and ESI where applicable — will be made as required by law.",
        ],
      },
      {
        title: "Probation and Confirmation",
        lines: [
          (p.probationMonths ?? 0) > 0
            ? `You will be on probation for ${p.probationMonths} month(s) from the date of joining${probationEnds ? `, ending on ${longDate(probationEnds)}` : ""}. During probation your attendance, discipline, work quality, productivity, communication, teamwork, learning ability and adherence to company policies will be evaluated. The company may, where the circumstances warrant it, extend the probation period by written notice stating the extension and the expectations to be met. Your employment will be confirmed in writing on successful completion of probation.`
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
        title: "Leave, Attendance and Punctuality",
        lines: [
          "You will be entitled to leave in accordance with the company's leave policy as applicable to you from time to time. Leave must be applied for and approved through the company's system in advance, except in an emergency, when it must be intimated at the earliest opportunity.",
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
        title: "Intellectual Property",
        lines: ["All work product, inventions, designs, creative material, code, prompts, documentation and other intellectual property created by you in the course of your employment, or using company resources, shall vest solely in the company. You agree to execute any document reasonably required to give effect to this clause. Your confidentiality and intellectual property obligations continue after your employment ends."],
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
        lines: ["On the last working day, or earlier if the company asks, you shall complete a proper handover and return all company property issued to you, including the ID card, laptop, phone, SIM, access cards, documents and any other assets recorded against your name. Your full and final settlement will be processed after the handover and the return of company property are complete, in accordance with company policy and applicable law."],
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
    ...letterHead(i, "Non-Disclosure, Confidentiality and Intellectual Property Agreement"),
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
    ...letterHead(i, "Acknowledgement of Company Policies"),
    `I confirm that the following policies of ${co.name} have been made available to me, that I have read and understood them, and that I agree to comply with them.`,
    "",
    "1. Code of Conduct and Professional Behaviour",
    "Expected standards of conduct with colleagues, clients and partners, including a workplace free of harassment and discrimination.",
    "",
    "2. Attendance, Working Hours and Leave Policy",
    "Check-in and check-out through the company system, applying for leave in advance, and the treatment of paid, unpaid and half-day leave.",
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
    ...letterHead(i, "Confirmation of Employment"),
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
    ...letterHead(i, "Extension of Probation Period"),
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
    ...letterHead(i, "Revision of Remuneration"),
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
    ...letterHead(i, "Promotion Letter"),
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
    ...letterHead(i, "Show Cause Notice"),
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
    ...letterHead(i, "Warning Letter"),
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
    ...letterHead(i, "Acceptance of Resignation"),
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
    ...letterHead(i, "Full and Final Settlement"),
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
    ...letterHead(i, "Relieving Letter"),
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
    ...letterHead(i, "Experience Certificate"),
    "TO WHOMSOEVER IT MAY CONCERN",
    "",
    `This is to certify that ${subject.name}${subject.employeeId ? ` (Employee ID: ${subject.employeeId})` : ""} was employed with ${co.name} from ${longDate(p.joiningDate)} to ${longDate(lwd)}.`,
    "",
    "1. Role",
    `Designation at the time of leaving: ${value(p.designation)}`,
    `Engagement: ${engagementLabel(p)}`,
    `Department: ${p.department === "tech" ? "Technical" : "Sales"}`,
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
