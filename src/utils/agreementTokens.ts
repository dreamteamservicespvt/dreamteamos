/**
 * `{{employee_name}}` — how one piece of text becomes everybody's own copy.
 *
 * An admin loading a document template into the agreement editor is doing one of two things. If it
 * is going to one person, the letter can simply be generated with that person's facts in it and
 * edited freely. If it is going to eight people, it cannot: a letter generated for Asha and sent
 * to eight people tells all eight of them Asha's salary.
 *
 * So a bulk template is **tokenized** — the reference employee's own values are swapped out for
 * tokens before the admin ever sees the text — and **filled** again per recipient at send time.
 * The admin edits one document and eight people receive their own.
 *
 * Tokenizing works by exact string replacement of values that are already known, rather than by
 * asking the templates to emit placeholders. That keeps the whole letter-writing engine untouched
 * and unaware of this: there is still exactly one place an offer letter is worded.
 *
 * Pure — no Firestore, no React.
 */
import { format } from "date-fns";
import { formatPhoneDisplay } from "@/utils/phone";
import { longDate, rupees } from "@/utils/hrTemplates";
import { DEPARTMENT_LABELS } from "@/utils/hrPolicy";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";

export interface TokenSubject {
  member: Pick<AppUser, "name" | "phone" | "email" | "employeeId">;
  profile?: EmployeeProfile | null;
}

/**
 * Every token, and how to read it off an employee.
 *
 * Order matters: the list is applied longest-value-first when tokenizing, so a designation that
 * happens to contain the department name does not get half-swallowed by the shorter match.
 */
export const AGREEMENT_TOKENS: {
  token: string;
  label: string;
  read: (s: TokenSubject) => string;
}[] = [
  { token: "{{employee_name}}", label: "Employee name", read: (s) => (s.member.name || "").trim() },
  { token: "{{employee_id}}", label: "Employee ID", read: (s) => (s.member.employeeId || "").trim() },
  { token: "{{mobile}}", label: "Mobile number", read: (s) => (s.member.phone ? formatPhoneDisplay(s.member.phone) : "") },
  { token: "{{email}}", label: "Email", read: (s) => (s.member.email || "").trim() },
  { token: "{{designation}}", label: "Designation", read: (s) => (s.profile?.designation || "").trim() },
  { token: "{{department}}", label: "Department", read: (s) => (s.profile?.department ? DEPARTMENT_LABELS[s.profile.department] : "") },
  { token: "{{joining_date}}", label: "Joining date", read: (s) => (s.profile?.joiningDate ? longDate(s.profile.joiningDate) : "") },
  { token: "{{salary}}", label: "Monthly salary", read: (s) => (typeof s.profile?.ctcMonthly === "number" ? rupees(s.profile.ctcMonthly) : "") },
  { token: "{{manager_name}}", label: "Reporting manager", read: (s) => (s.profile?.reportingToName || "").trim() },
  { token: "{{work_location}}", label: "Work location", read: (s) => (s.profile?.workLocation || "").trim() },
];

const escape = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Values too short or too common to swap safely.
 *
 * A one- or two-character designation, or an employee ID of "7", would match half the prose in the
 * letter and quietly shred it. A value that cannot be tokenized safely is simply left as it is —
 * a shared literal is a smaller problem than a mangled document, and the admin can see it.
 */
const SAFE_MIN_LENGTH = 3;

const isSafeToSwap = (value: string): boolean =>
  value.trim().length >= SAFE_MIN_LENGTH;

/**
 * Swap one employee's real values out of a generated letter and put tokens in their place.
 *
 * Longest value first, so "Senior AI Ad Creator" is replaced before "AI Ad Creator" could match
 * inside it and leave a stray "Senior " behind.
 */
export function tokenizeForBulk(text: string, subject: TokenSubject): string {
  const swaps = AGREEMENT_TOKENS
    .map((t) => ({ token: t.token, value: t.read(subject) }))
    .filter((s) => isSafeToSwap(s.value))
    .sort((a, b) => b.value.length - a.value.length);

  let out = text;
  for (const { token, value } of swaps) {
    out = out.replace(new RegExp(escape(value.trim()), "g"), token);
  }
  return out;
}

/**
 * Put a specific employee's values back in.
 *
 * A token with nothing behind it becomes an em dash rather than being left on the page: an
 * employee reading "{{designation}}" in their own agreement has been shown the machinery, which is
 * worse than being shown a blank.
 */
export function fillTokens(text: string, subject: TokenSubject, today = new Date()): string {
  let out = text;
  for (const t of AGREEMENT_TOKENS) {
    const value = t.read(subject).trim();
    out = out.replace(new RegExp(escape(t.token), "g"), value || "—");
  }
  // Two conveniences that belong to the send, not to the employee.
  out = out.replace(/\{\{date\}\}/g, format(today, "dd MMM yyyy"));
  return out;
}

/** Which tokens a piece of text actually uses — drives the "these fill per person" hint. */
export function tokensUsed(text: string): string[] {
  return AGREEMENT_TOKENS.filter((t) => text.includes(t.token)).map((t) => t.token);
}

/**
 * Personal figures still written out in full, which a bulk send would copy to everybody.
 *
 * Reported rather than fixed. Some of them genuinely cannot be tokenized safely (a two-word
 * designation that also appears in a clause), and the admin is the one who knows whether this
 * letter is meant to carry them. Silence here would be the dangerous choice.
 */
export function untokenizedPersonalValues(text: string, subject: TokenSubject): string[] {
  return AGREEMENT_TOKENS
    .filter((t) => {
      const value = t.read(subject).trim();
      return value.length > 0 && text.includes(value);
    })
    .map((t) => t.label);
}
