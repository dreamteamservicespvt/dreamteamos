import { describe, it, expect } from "vitest";
import {
  AGREEMENT_TOKENS, fillTokens, tokenizeForBulk, tokensUsed, untokenizedPersonalValues,
} from "@/utils/agreementTokens";
import { buildDocument } from "@/utils/hrTemplates";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";

/**
 * One edited document becoming everybody's own copy.
 *
 * The whole reason this exists is a single failure that must never happen: a letter generated from
 * Asha's record, edited, and sent to eight people tells all eight of them Asha's salary. So the
 * tests that matter here are the ones about what does NOT leak.
 */

const asha = {
  uid: "m1", name: "Asha Devi", phone: "+919876543210", email: "asha@example.com", employeeId: "DTS-014",
} as AppUser;

const ravi = {
  uid: "m2", name: "Ravi Kumar", phone: "+919812345678", email: "ravi@example.com", employeeId: "DTS-021",
} as AppUser;

const profileOf = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  uid: "m1", department: "tech", stage: "probation", engagementType: "full_time",
  designation: "AI Ad Creator", joiningDate: "2026-01-05", ctcMonthly: 25000,
  workLocation: "Kakinada, Andhra Pradesh", reportingToName: "Priya Sharma",
  workingHours: "10:00 AM – 7:00 PM", workingDays: "Monday to Saturday",
  ...over,
} as EmployeeProfile);

const ashaSubject = { member: asha, profile: profileOf() };
const raviSubject = {
  member: ravi,
  profile: profileOf({ uid: "m2", designation: "Sales Executive", ctcMonthly: 32000, joiningDate: "2025-11-03" }),
};

const letterFor = (member: AppUser, profile: EmployeeProfile) => buildDocument({
  type: "appointment_letter",
  subject: { name: member.name, phone: member.phone, email: member.email, employeeId: member.employeeId },
  profile,
  signatory: { name: "G. Govardhan", designation: "Chief Executive Officer" },
  issuedOn: "2026-08-03",
}).bodyText;

describe("turning one person's letter into a template", () => {
  it("swaps their name, ID, salary and dates for tokens", () => {
    const text = tokenizeForBulk(letterFor(asha, profileOf()), ashaSubject);
    expect(text).toContain("{{employee_name}}");
    expect(text).toContain("{{employee_id}}");
    expect(text).toContain("{{salary}}");
    expect(text).toContain("{{joining_date}}");
    expect(text).toContain("{{designation}}");
  });

  it("leaves none of the reference employee's own values behind", () => {
    const text = tokenizeForBulk(letterFor(asha, profileOf()), ashaSubject);
    expect(text).not.toContain("Asha Devi");
    expect(text).not.toContain("DTS-014");
    expect(text).not.toContain("₹25,000");
    expect(text).not.toContain("05 Jan 2026");
    expect(untokenizedPersonalValues(text, ashaSubject)).toEqual([]);
  });

  it("gives the next person THEIR figures, not the first person's", () => {
    const template = tokenizeForBulk(letterFor(asha, profileOf()), ashaSubject);
    const forRavi = fillTokens(template, raviSubject);

    expect(forRavi).toContain("Ravi Kumar");
    expect(forRavi).toContain("₹32,000");
    expect(forRavi).toContain("Sales Executive");
    expect(forRavi).toContain("03 Nov 2025");
    // The one that matters.
    expect(forRavi).not.toContain("Asha Devi");
    expect(forRavi).not.toContain("₹25,000");
    expect(forRavi).not.toContain("DTS-014");
  });

  it("survives a round trip back to the person it came from", () => {
    const original = letterFor(asha, profileOf());
    const restored = fillTokens(tokenizeForBulk(original, ashaSubject), ashaSubject);
    expect(restored).toBe(original);
  });

  it("replaces the longer designation first, so no fragment is left behind", () => {
    // "Senior AI Ad Creator" must not be matched as "AI Ad Creator" and leave a stray "Senior ".
    const profile = profileOf({ designation: "Senior AI Ad Creator" });
    const text = tokenizeForBulk(
      "Designation: Senior AI Ad Creator\nRole: Senior AI Ad Creator reports to the lead.",
      { member: asha, profile },
    );
    expect(text).not.toMatch(/Senior (?!AI)/);
    expect(text).toContain("{{designation}}");
  });
});

describe("what it refuses to touch", () => {
  it("leaves a value too short to match safely alone", () => {
    // A two-character designation would match inside ordinary words and shred the letter.
    const profile = profileOf({ designation: "QA" });
    const text = tokenizeForBulk("The QA team requires quality assurance.", { member: asha, profile });
    expect(text).toBe("The QA team requires quality assurance.");
  });

  it("reports a personal value it could not tokenize rather than hiding it", () => {
    const leaked = untokenizedPersonalValues("Asha Devi earns ₹25,000 a month.", ashaSubject);
    expect(leaked).toContain("Employee name");
    expect(leaked).toContain("Monthly salary");
  });

  it("says nothing is leaking when nothing is", () => {
    expect(untokenizedPersonalValues("{{employee_name}} earns {{salary}}.", ashaSubject)).toEqual([]);
  });
});

describe("filling in", () => {
  it("shows an em dash rather than the machinery when a value is missing", () => {
    const filled = fillTokens("ID: {{employee_id}}", { member: { name: "X" } as AppUser, profile: null });
    expect(filled).toBe("ID: —");
    expect(filled).not.toContain("{{");
  });

  it("fills every token it defines, leaving none on the page", () => {
    const all = AGREEMENT_TOKENS.map((t) => t.token).join(" ");
    expect(fillTokens(all, raviSubject)).not.toMatch(/\{\{/);
  });

  it("resolves {{date}} to the day it is sent", () => {
    expect(fillTokens("Dated {{date}}", ashaSubject, new Date("2026-08-03T00:00:00")))
      .toBe("Dated 03 Aug 2026");
  });

  it("reports which tokens a draft actually uses", () => {
    expect(tokensUsed("Hello {{employee_name}}, your pay is {{salary}}."))
      .toEqual(["{{employee_name}}", "{{salary}}"]);
  });

  it("leaves a pasted agreement that uses no tokens completely alone", () => {
    const pasted = "NON-DISCLOSURE AGREEMENT\n\nEmployee Name: ____\nDate: ____";
    expect(fillTokens(pasted, raviSubject)).toBe(pasted);
  });
});
