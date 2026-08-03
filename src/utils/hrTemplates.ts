import { format } from "date-fns";
import { COMPANY } from "@/utils/company";
import { formatPhoneDisplay } from "@/utils/phone";
import { parseDate, probationEndDate, noticePeriodFor } from "@/utils/hrPolicy";
import { ENGAGEMENT_LABELS, HR_DOCUMENT_LABELS } from "@/types/hr";
import type { EmployeeProfile, HrDocumentType } from "@/types/hr";

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
  /** Warning letter. */
  incident?: string | null;
  incidentDate?: string | null;
  expectation?: string | null;
  /** Relieving / experience letter. */
  lastWorkingDay?: string | null;
  settlementNote?: string | null;
  /** Anything else this particular letter must say. Appended as its own section. */
  additionalTerms?: string | null;
}

export interface BuildDocumentInput {
  type: HrDocumentType;
  subject: DocumentSubject;
  profile: EmployeeProfile;
  signatory: DocumentSignatory;
  /** yyyy-MM-dd — the date printed on the letter. */
  issuedOn: string;
  extras?: HrDocumentExtras;
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
  "Date:",
];

const COMPANY_SIGNATURE_BLOCK = (signatory: DocumentSignatory, issuedOn: string): (string | null)[] => [
  "",
  `For ${COMPANY.name} — Authorised Signatory Signature:`,
  `Name: ${signatory.name}`,
  `Designation: ${signatory.designation}`,
  `Date: ${longDate(issuedOn)}`,
];

/** The header block every letter opens with — who it is from, who it is to, and when. */
const letterHead = (
  title: string,
  subject: DocumentSubject,
  issuedOn: string,
  opts: { ref?: string | null; address?: string | null } = {},
): (string | null)[] => [
  title.toUpperCase(),
  COMPANY.name.toUpperCase(),
  "",
  opts.ref?.trim() ? `Ref: ${opts.ref.trim()}` : null,
  `Date: ${longDate(issuedOn)}`,
  "",
  `Employee Name: ${subject.name}`,
  subject.employeeId ? `Employee ID: ${subject.employeeId}` : null,
  subject.phone ? `Mobile Number: ${formatPhoneDisplay(subject.phone)}` : null,
  subject.email ? `Email: ${subject.email}` : null,
  opts.address?.trim() ? `Address: ${opts.address.trim()}` : null,
  "",
];

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

// ─── The templates ──────────────────────────────────────────────────────────

function offerLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const probationEnds = probationEndDate(p);
  return compose([
    ...letterHead("Offer of Employment", subject, i.issuedOn, {
      ref: extras?.offerLetterNumber,
      address: extras?.candidateAddress,
    }),
    `Dear ${subject.name},`,
    "",
    `We are pleased to offer you the position described below at ${COMPANY.name}. This letter sets out the principal terms of the offer. Your employment will additionally be governed by the Appointment Letter / Employment Agreement and the company policies you will be asked to acknowledge on or before joining.`,
    "",
    "1. Position and Engagement",
    `Designation: ${value(p.designation)}`,
    `Engagement: ${engagementDescription(p)}`,
    `Department: ${p.department === "tech" ? "Technical" : "Sales"}`,
    p.reportingToName ? `Reporting to: ${p.reportingToName}` : null,
    "",
    "2. Work Location",
    value(p.workLocation),
    "",
    "3. Date of Joining",
    `You are expected to join on ${longDate(p.joiningDate)}.`,
    "",
    "4. Remuneration",
    `Gross monthly salary (CTC): ${rupees(p.ctcMonthly)}`,
    ordinalDay(p.salaryPayDay)
      ? `Salary is payable monthly, on or about the ${ordinalDay(p.salaryPayDay)} of each month, subject to statutory deductions as applicable.`
      : "Salary is payable monthly, subject to statutory deductions as applicable.",
    "",
    "5. Probation",
    (p.probationMonths ?? 0) > 0
      ? `You will be on probation for ${p.probationMonths} month(s) from your date of joining${probationEnds ? `, ending on ${longDate(probationEnds)}` : ""}. Your performance will be evaluated during this period, and your employment will be confirmed in writing on successful completion.`
      : "This engagement does not carry a probation period.",
    "",
    "6. Working Hours and Days",
    `Working hours: ${value(p.workingHours)}`,
    `Working days: ${value(p.workingDays)}`,
    p.shiftDetails ? `Shift: ${p.shiftDetails}` : null,
    "",
    "7. Leave",
    "You will be entitled to leave in accordance with the company's leave policy as applicable to you from time to time. Leave is applied for and approved in advance through the company's system, except in an emergency, when it must be intimated at the earliest opportunity. The full policy will be shared with you on joining.",
    "",
    "8. Confidentiality",
    "During the recruitment process and at all times afterwards, you shall keep confidential the terms of this offer and any information about the company, its clients and its work that is not in the public domain. On joining you will be asked to accept the confidentiality and intellectual property terms in full.",
    "",
    "9. Conditions of this Offer",
    "This offer is subject to verification of the information and documents you provide, and to your signing the Appointment Letter / Employment Agreement, the Non-Disclosure and Intellectual Property terms, and the acknowledgement of company policies.",
    extras?.offerValidUntil
      ? `Please confirm your acceptance on or before ${longDate(extras.offerValidUntil)}. This offer stands withdrawn if it is not accepted by that date.`
      : "Please confirm your acceptance by signing below.",
    ...additional(extras, 10),
    "",
    "We look forward to welcoming you to the team.",
    ...COMPANY_SIGNATURE_BLOCK(i.signatory, i.issuedOn),
    "",
    "ACCEPTANCE",
    "I have read and understood the terms of this offer and I accept them.",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function appointmentLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const probationEnds = probationEndDate(p);
  // Stated as a figure as well as a ladder: an employee who has to work out which rung they are on
  // to know their own notice period has not really been told it.
  const notice = noticePeriodFor(p);
  return compose([
    ...letterHead("Appointment Letter and Employment Agreement", subject, i.issuedOn),
    `Dear ${subject.name},`,
    "",
    `With reference to your acceptance of our offer, we are pleased to confirm your appointment at ${COMPANY.name} on the following terms and conditions.`,
    "",
    "1. Position, Engagement and Reporting",
    `Designation: ${value(p.designation)}`,
    `Engagement: ${engagementDescription(p)}`,
    p.reportingToName ? `Reporting to: ${p.reportingToName}` : null,
    `Date of joining: ${longDate(p.joiningDate)}`,
    "",
    "2. Place of Work",
    `${value(p.workLocation)}. The company may, with reasonable notice, require you to work from another of its locations or from a client site where the role requires it.`,
    "",
    "3. Remuneration",
    `Gross monthly salary (CTC): ${rupees(p.ctcMonthly)}, payable monthly${ordinalDay(p.salaryPayDay) ? ` on or about the ${ordinalDay(p.salaryPayDay)} of each month` : ""}. Revisions, if any, are at the discretion of the company and will be communicated in writing.`,
    "Salary is paid by bank transfer. You are required to hold a bank account in your own name and to provide its details, together with your PAN, before your first salary is processed.",
    "Statutory deductions — income tax deducted at source (TDS), and Provident Fund and ESI where applicable — will be made from your salary as required by law.",
    "",
    "4. Probation and Confirmation",
    (p.probationMonths ?? 0) > 0
      ? `You will be on probation for ${p.probationMonths} month(s) from the date of joining${probationEnds ? `, ending on ${longDate(probationEnds)}` : ""}. During probation your attendance, discipline, work quality, productivity, communication, teamwork, learning ability and adherence to company policies will be evaluated. The company may, where the circumstances warrant it, extend the probation period by written notice stating the extension and the expectations to be met. Your employment will be confirmed in writing on successful completion of probation.`
      : "This engagement does not carry a probation period.",
    "",
    "5. Working Hours, Days and Shift",
    `Working hours: ${value(p.workingHours)}. Working days: ${value(p.workingDays)}.`,
    p.shiftDetails ? `Shift: ${p.shiftDetails}.` : null,
    "You may be required to work such additional hours as are reasonably necessary for the proper performance of your duties.",
    "",
    "6. Leave, Attendance and Punctuality",
    "You will be entitled to leave in accordance with the company's leave policy as applicable to you from time to time. Leave must be applied for and approved through the company's system in advance, except in an emergency, when it must be intimated at the earliest opportunity.",
    "You are required to record your attendance through the company's system on every working day, and to be available and working within your working hours. Persistent late arrival, unrecorded attendance or absence without intimation is treated as a matter of discipline and may be dealt with under the company's disciplinary policy.",
    "",
    "7. Remote Work",
    "Where the company permits you to work remotely, whether occasionally or as a regular arrangement, the same working hours, attendance recording, availability, confidentiality and data-protection obligations apply as they do at the workplace. Permission to work remotely is granted at the company's discretion and may be withdrawn.",
    "",
    "8. Your Responsibilities",
    "You shall perform the duties assigned to you diligently and to the standard the role requires; comply with the company's policies as amended from time to time; maintain the confidentiality of company and client information; take proper care of company assets issued to you; observe the code of conduct in your dealings with colleagues, clients and partners; record your attendance and apply for leave as required; report to your reporting manager and keep them informed of the progress of your work; and act at all times in the company's best interests.",
    "",
    "9. Confidentiality",
    "You shall not, during your employment or at any time after it ends, disclose or use any confidential information of the company, its clients or its partners, except as required for the proper performance of your duties or by law. Confidential information includes client data, pricing, business plans, source code, prompts, creative assets, processes and any information not in the public domain.",
    "",
    "10. Intellectual Property",
    "All work product, inventions, designs, creative material, code, prompts, documentation and other intellectual property created by you in the course of your employment, or using company resources, shall vest solely in the company. You agree to execute any document reasonably required to give effect to this clause. Your confidentiality and intellectual property obligations continue after your employment ends.",
    "",
    "11. Conduct and Discipline",
    "You shall comply with the company's policies, maintain professional conduct, and act in the company's best interests. Misconduct will be dealt with under the company's misconduct and disciplinary policy, which provides for the process to be followed before any action is taken.",
    "",
    "12. Conflict of Interest",
    "You shall not, during your employment, engage in any business, employment or activity that conflicts with the company's interests or with the proper performance of your duties, without the company's prior written consent. You shall disclose to the company any personal, financial or family interest that could reasonably be seen as a conflict.",
    "",
    "13. Non-Solicitation",
    "For twelve months after your employment ends, you shall not solicit, for yourself or for any other person or business, any client of the company you dealt with in the last twelve months of your employment, nor induce any employee of the company to leave it. This clause is limited to what is reasonable to protect the company's legitimate business interests and does not restrain you from taking up lawful employment of your choice.",
    "",
    "14. Background Verification",
    "This appointment is subject to verification of the information, documents and references you have provided. If any of it is found to be false or materially misleading, the company may withdraw this appointment or end your employment, following the process the disciplinary policy and applicable law require.",
    "",
    "15. Notice Period and Termination",
    "Either party may end this employment by giving written notice in accordance with the notice period applicable to your stage of employment, as set out in the company's notice policy and summarised below:",
    "Intern — 7 days. Full-time or part-time employee during probation — 15 days. Confirmed employee — 30 days. Team lead or other critical senior role — 45 days.",
    `The notice period applicable to you at the date of this letter is ${notice.days} day(s) — ${notice.label.toLowerCase()}.`,
    "The notice period may be shortened or waived by mutual written agreement. Payment in lieu of unserved notice may be agreed in writing, subject to applicable law. Termination on grounds of misconduct follows the disciplinary procedure and applicable law rather than this clause.",
    "",
    "16. Return of Company Property",
    "On the last working day, or earlier if the company asks, you shall complete a proper handover and return all company property issued to you, including the ID card, laptop, phone, SIM, access cards, documents and any other assets recorded against your name. Your full and final settlement will be processed after the handover and the return of company property are complete, in accordance with company policy and applicable law.",
    "",
    "17. Amendment and Governing Terms",
    "This letter, together with the company policies referred to in it, constitutes the terms of your employment. The company may amend its policies from time to time and will inform you of material changes. No change to the terms of this letter is effective unless made in writing. Nothing in this letter overrides any right you have under applicable law.",
    "",
    "18. Governing Law and Jurisdiction",
    "This letter and your employment are governed by the laws of India, and the courts having jurisdiction over the place of work stated above shall have jurisdiction over any dispute arising from them.",
    ...additional(extras, 19),
    "",
    "Please sign below to confirm that you have read, understood and accepted these terms.",
    ...COMPANY_SIGNATURE_BLOCK(i.signatory, i.issuedOn),
    "",
    "ACCEPTED AND AGREED",
    `Place: ${value(p.workLocation)}`,
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function nda(i: BuildDocumentInput): string {
  const { subject, extras } = i;
  return compose([
    ...letterHead("Non-Disclosure, Confidentiality and Intellectual Property Agreement", subject, i.issuedOn),
    `This agreement is entered into between ${COMPANY.name} ("the Company") and ${subject.name} ("the Employee") in connection with the Employee's employment with the Company.`,
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
    ...COMPANY_SIGNATURE_BLOCK(i.signatory, i.issuedOn),
    "",
    "ACCEPTED AND AGREED",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function policyAcknowledgement(i: BuildDocumentInput): string {
  const { subject, extras } = i;
  return compose([
    ...letterHead("Acknowledgement of Company Policies", subject, i.issuedOn),
    `I confirm that the following policies of ${COMPANY.name} have been made available to me, that I have read and understood them, and that I agree to comply with them.`,
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
    ...COMPANY_SIGNATURE_BLOCK(i.signatory, i.issuedOn),
  ]);
}

function confirmationLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  return compose([
    ...letterHead("Confirmation of Employment", subject, i.issuedOn),
    `Dear ${subject.name},`,
    "",
    `We are pleased to inform you that you have successfully completed your probation period at ${COMPANY.name}.`,
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
    ...COMPANY_SIGNATURE_BLOCK(i.signatory, i.issuedOn),
  ]);
}

function probationExtension(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  return compose([
    ...letterHead("Extension of Probation Period", subject, i.issuedOn),
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
    ...COMPANY_SIGNATURE_BLOCK(i.signatory, i.issuedOn),
    "",
    "ACKNOWLEDGED",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function incrementLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const promoted = !!extras?.newDesignation && extras.newDesignation !== p.designation;
  return compose([
    ...letterHead(promoted ? "Promotion and Revision of Remuneration" : "Revision of Remuneration", subject, i.issuedOn),
    `Dear ${subject.name},`,
    "",
    "In recognition of your performance and contribution, we are pleased to inform you of the following revision.",
    "",
    "1. Revision",
    promoted ? `Designation: ${value(p.designation)} → ${value(extras?.newDesignation)}` : `Designation: ${value(p.designation)} (unchanged)`,
    `Gross monthly salary: ${rupees(p.ctcMonthly)} → ${rupees(extras?.newCtcMonthly)}`,
    `Effective from: ${longDate(extras?.effectiveFrom || i.issuedOn)}`,
    "",
    "2. Continuing Terms",
    "All other terms of your employment remain unchanged and continue to be governed by your Appointment Letter / Employment Agreement.",
    ...additional(extras, 3),
    "",
    "We thank you for your work and look forward to your continued contribution.",
    ...COMPANY_SIGNATURE_BLOCK(i.signatory, i.issuedOn),
  ]);
}

function warningLetter(i: BuildDocumentInput): string {
  const { subject, extras } = i;
  return compose([
    ...letterHead("Warning Letter", subject, i.issuedOn),
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
    ...COMPANY_SIGNATURE_BLOCK(i.signatory, i.issuedOn),
    "",
    "ACKNOWLEDGEMENT OF RECEIPT",
    "Signing below records receipt of this letter. It is not an admission of the matters recorded in it.",
    ...EMPLOYEE_SIGNATURE_BLOCK(subject),
  ]);
}

function relievingLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const sep = p.separation;
  const lwd = extras?.lastWorkingDay || sep?.lastWorkingDay || null;
  return compose([
    ...letterHead("Relieving Letter", subject, i.issuedOn),
    "TO WHOMSOEVER IT MAY CONCERN",
    "",
    `This is to certify that ${subject.name}${subject.employeeId ? ` (Employee ID: ${subject.employeeId})` : ""} was employed with ${COMPANY.name} as ${value(p.designation)} from ${longDate(p.joiningDate)} to ${longDate(lwd)}.`,
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
    ...COMPANY_SIGNATURE_BLOCK(i.signatory, i.issuedOn),
  ]);
}

function experienceLetter(i: BuildDocumentInput): string {
  const { profile: p, subject, extras } = i;
  const lwd = extras?.lastWorkingDay || p.separation?.lastWorkingDay || null;
  return compose([
    ...letterHead("Experience Certificate", subject, i.issuedOn),
    "TO WHOMSOEVER IT MAY CONCERN",
    "",
    `This is to certify that ${subject.name}${subject.employeeId ? ` (Employee ID: ${subject.employeeId})` : ""} was employed with ${COMPANY.name} from ${longDate(p.joiningDate)} to ${longDate(lwd)}.`,
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
    ...COMPANY_SIGNATURE_BLOCK(i.signatory, i.issuedOn),
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
  warning_letter: warningLetter,
  relieving_letter: relievingLetter,
  experience_letter: experienceLetter,
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
  increment_letter: ["newDesignation", "newCtcMonthly", "effectiveFrom"],
  warning_letter: ["incident", "incidentDate", "expectation"],
  relieving_letter: ["lastWorkingDay", "settlementNote"],
  experience_letter: ["lastWorkingDay"],
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
  lastWorkingDay: "Last working day",
  settlementNote: "Settlement note",
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
  lastWorkingDay: "date",
  settlementNote: "textarea",
  additionalTerms: "textarea",
};

/** Fields a document cannot sensibly be issued without. */
export const EXTRA_FIELD_REQUIRED: Partial<Record<HrDocumentType, (keyof HrDocumentExtras)[]>> = {
  probation_extension: ["extendedTo"],
  increment_letter: ["newCtcMonthly"],
  warning_letter: ["incident"],
  relieving_letter: ["lastWorkingDay"],
  experience_letter: ["lastWorkingDay"],
};
