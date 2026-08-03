import { describe, it, expect } from "vitest";
import { buildDocument } from "@/utils/hrTemplates";
import { HR_DOCUMENT_ORDER } from "@/types/hr";
import type { EmployeeProfile, HrDocumentType } from "@/types/hr";

/**
 * The conventions that make a letter read as a company's rather than as a form's.
 *
 * Numbered clauses were already right — that is genuine corporate practice, and how a term gets
 * referred to later ("as per clause 9"). What was missing was the correspondence around them: the
 * confidentiality marking, a subject line naming the role, and a complimentary close before the
 * signature. A letter that runs from its last clause straight into a signature box is a form.
 */

const profile = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  uid: "u1", department: "tech", stage: "probation", engagementType: "full_time",
  designation: "Associate AI Software Engineer", workLocation: "Kakinada, Andhra Pradesh",
  joiningDate: "2026-08-02", probationMonths: 3, ctcMonthly: 25000,
  workingHours: "10:00 AM – 7:00 PM", workingDays: "Monday – Saturday",
  reportingToName: "Senior AI Software Engineer",
  ...over,
} as EmployeeProfile);

const letter = (type: HrDocumentType, over: Partial<EmployeeProfile> = {}) => buildDocument({
  type,
  subject: { name: "Rekha", employeeId: "DTS-022", phone: "+918247848743" },
  profile: profile(over),
  signatory: { name: "G. Govardhan", designation: "Chief Executive Officer" },
  issuedOn: "2026-08-04",
  extras: {
    lastWorkingDay: "2026-10-01", extendedTo: "2026-11-05", newCtcMonthly: 30000,
    newDesignation: "AI Software Engineer", incident: "x",
  },
}).bodyText;

describe("every letter", () => {
  it("is marked private and confidential", () => {
    for (const type of HR_DOCUMENT_ORDER) {
      expect(letter(type), type).toMatch(/^PRIVATE & CONFIDENTIAL$/m);
    }
  });

  it("carries a subject line saying what it is about", () => {
    for (const type of HR_DOCUMENT_ORDER) {
      expect(letter(type), type).toMatch(/^Subject: .+$/m);
    }
  });

  it("closes with a complimentary close before the signature", () => {
    for (const type of HR_DOCUMENT_ORDER) {
      const text = letter(type);
      // Skipped for the policy acknowledgement, which carries no company signature at all — it is
      // the employee's own statement, so there is nothing to sign off.
      if (!/^For .+ Signature:$/m.test(text)) continue;
      expect(text, type).toMatch(/^Yours sincerely,$/m);
      expect(text.indexOf("Yours sincerely,"), type).toBeLessThan(text.search(/^For .+ Signature:$/m));
    }
  });

  it("signs off exactly once, however many offices sign", () => {
    const text = buildDocument({
      type: "nda",
      subject: { name: "Rekha" },
      profile: profile(),
      signatory: [
        { key: "ceo", name: "G. Govardhan", designation: "Chief Executive Officer" },
        { key: "cto", name: "Asha Rao", designation: "Chief Technology Officer" },
      ],
      issuedOn: "2026-08-04",
    }).bodyText;
    expect(text.match(/^Yours sincerely,$/gm)).toHaveLength(1);
    expect(text.match(/^For .+ Signature:$/gm)).toHaveLength(2);
  });

  it("keeps the marking below the reference block, not inside it", () => {
    // The reference block ends at the first line that is not `Label: value`. Putting the marking
    // above it would cut Ref/Date/Name out of the block the renderer lays out as a table.
    const text = letter("offer_letter");
    expect(text.indexOf("Employee Name: Rekha")).toBeLessThan(text.indexOf("PRIVATE & CONFIDENTIAL"));
    expect(text.indexOf("PRIVATE & CONFIDENTIAL")).toBeLessThan(text.indexOf("Dear Rekha,"));
  });
});

describe("the subject line", () => {
  it("names the role on an offer, so a file of forty can be searched", () => {
    expect(letter("offer_letter")).toContain("Subject: Offer of Employment — Associate AI Software Engineer");
  });

  it("says internship rather than employment for an intern", () => {
    const text = letter("offer_letter", { engagementType: "intern", probationMonths: 0 });
    expect(text).toContain("Subject: Offer of Internship — Associate AI Software Engineer");
  });

  it("names the new role on a promotion, which is the point of that letter", () => {
    expect(letter("promotion_letter")).toContain("Subject: Promotion to AI Software Engineer");
  });

  it("still reads properly when no designation is on record", () => {
    const text = letter("offer_letter", { designation: null });
    expect(text).toContain("Subject: Offer of Employment");
    expect(text).not.toMatch(/Subject: .* — \s*$/m);
    expect(text).not.toContain("— —");
  });
});
