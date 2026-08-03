import { describe, it, expect } from "vitest";
import {
  EXTRA_FIELDS, EXTRA_FIELD_REQUIRED, buildDocument, engagementDescription, longDate, rupees,
  withReference,
} from "@/utils/hrTemplates";
import type { BuildDocumentInput } from "@/utils/hrTemplates";
import { HR_DOCUMENT_ORDER } from "@/types/hr";
import type { EmployeeProfile, HrDocumentType } from "@/types/hr";

const profile = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  uid: "u1",
  department: "tech",
  stage: "probation",
  engagementType: "full_time",
  designation: "Software Developer",
  workLocation: "Kakinada, Andhra Pradesh",
  joiningDate: "2026-01-05",
  probationMonths: 3,
  ctcMonthly: 25000,
  workingHours: "10:00 AM – 7:00 PM",
  workingDays: "Monday to Saturday",
  reportingToName: "Asha Rao",
  probationReviews: [],
  assets: [],
  kycDocuments: [],
  separation: null,
  ...over,
});

const input = (type: HrDocumentType, over: Partial<BuildDocumentInput> = {}): BuildDocumentInput => ({
  type,
  subject: { name: "Ravi Kumar", phone: "+919876543210", email: "ravi@example.com", employeeId: "DTS-014" },
  profile: profile(),
  signatory: { name: "Asha Rao", designation: "Technical Head" },
  issuedOn: "2026-01-01",
  ...over,
});

/**
 * Every type there is, taken from the union rather than listed by hand.
 *
 * A hardcoded list silently stops covering a document the day somebody adds one — which is exactly
 * when these guarantees matter most, because a brand-new template is the one most likely to print
 * "undefined" into a letter going out under the company's signature.
 */
const ALL_TYPES: HrDocumentType[] = HR_DOCUMENT_ORDER;

describe("every document", () => {
  it("opens with an ALL-CAPS title block, which is what the renderer treats as the heading", () => {
    for (const type of ALL_TYPES) {
      const { bodyText } = buildDocument(input(type));
      const first = bodyText.split("\n")[0];
      expect(first, type).toBe(first.toUpperCase());
      expect(first.length, type).toBeGreaterThan(3);
    }
  });

  it("carries the company's signature block, naming the office that signs it", () => {
    for (const type of ALL_TYPES) {
      const { bodyText } = buildDocument(input(type));
      // "For <company> — <office> Signature:". The leading "For" is what AgreementView keys on to
      // render this as the company's side rather than a blank ruled box.
      expect(bodyText, type).toMatch(/^For .+ — .+ Signature:$/m);
      expect(bodyText, type).toContain("Asha Rao");
      expect(bodyText, type).toContain("Technical Head");
    }
  });

  it("names the employee and titles itself after them", () => {
    for (const type of ALL_TYPES) {
      const built = buildDocument(input(type));
      expect(built.bodyText, type).toContain("Ravi Kumar");
      expect(built.title, type).toContain("Ravi Kumar");
    }
  });

  it("never prints an unresolved placeholder or an invalid date", () => {
    for (const type of ALL_TYPES) {
      const { bodyText } = buildDocument(input(type, { extras: { lastWorkingDay: "2026-10-01", extendedTo: "2026-07-05", newCtcMonthly: 30000, incident: "x" } }));
      expect(bodyText, type).not.toMatch(/undefined|NaN|Invalid Date|\[object/);
    }
  });
});

describe("signature blocks", () => {
  const NEEDS_EMPLOYEE_SIGNATURE: HrDocumentType[] = [
    "offer_letter", "appointment_letter", "nda", "policy_acknowledgement", "probation_extension",
    "show_cause_notice", "warning_letter", "full_final_settlement",
  ];
  const COMPANY_ONLY: HrDocumentType[] = [
    "confirmation_letter", "increment_letter", "promotion_letter", "resignation_acceptance",
    "relieving_letter", "experience_letter",
  ];

  it("gives the employee a place to sign on everything they must accept", () => {
    for (const type of NEEDS_EMPLOYEE_SIGNATURE) {
      expect(buildDocument(input(type)).bodyText, type).toMatch(/^Employee Signature:/m);
    }
  });

  it("leaves no employee signature line on letters the company simply issues", () => {
    for (const type of COMPANY_ONLY) {
      expect(buildDocument(input(type)).bodyText, type).not.toMatch(/^Employee Signature:/m);
    }
  });
});

describe("offer letter", () => {
  it("states everything the offer is required to state", () => {
    const { bodyText } = buildDocument(input("offer_letter"));
    expect(bodyText).toContain("Software Developer");                 // role / designation
    // Spelled out, so the letter says whether the job is permanent rather than only its category.
    expect(bodyText).toContain("Employment Type: Full-Time (Permanent, subject to successful completion of a 3-month probation)");
    expect(bodyText).toContain("Kakinada, Andhra Pradesh");           // work location
    expect(bodyText).toContain("05 Jan 2026");                        // joining date
    expect(bodyText).toContain("₹25,000");                            // salary / CTC
    expect(bodyText).toContain("10:00 AM – 7:00 PM");                 // working hours
    expect(bodyText).toContain("Monday to Saturday");                 // working days
    expect(bodyText).toMatch(/ACCEPTANCE/);
  });

  it("states the deadline when the offer has one", () => {
    const { bodyText } = buildDocument(input("offer_letter", { extras: { offerValidUntil: "2025-12-20" } }));
    expect(bodyText).toContain("20 Dec 2025");
    expect(bodyText).toMatch(/stands withdrawn/);
  });

  it("says plainly when there is no probation instead of printing a zero", () => {
    const { bodyText } = buildDocument(input("offer_letter", { profile: profile({ engagementType: "intern", probationMonths: 0 }) }));
    expect(bodyText).toMatch(/does not carry a probation period/);
    expect(bodyText).toContain("Intern (fixed-term internship engagement)");
  });
});

describe("appointment letter", () => {
  it("spells out the notice ladder rather than leaving it to policy nobody has read", () => {
    const { bodyText } = buildDocument(input("appointment_letter"));
    expect(bodyText).toMatch(/Intern — 7 days/);
    expect(bodyText).toMatch(/probation — 15 days/);
    expect(bodyText).toMatch(/Confirmed employee — 30 days/);
    expect(bodyText).toMatch(/senior role — 45 days/);
  });

  it("keeps the balance the policy asks for — notice on both sides, misconduct handled separately", () => {
    const { bodyText } = buildDocument(input("appointment_letter"));
    expect(bodyText).toMatch(/Either party may end this employment/);
    expect(bodyText).toMatch(/shortened or waived by mutual written agreement/);
    expect(bodyText).toMatch(/disciplinary procedure and applicable law/);
  });

  it("covers confidentiality, IP, leave, conduct and return of property", () => {
    const { bodyText } = buildDocument(input("appointment_letter"));
    for (const clause of ["Confidentiality", "Intellectual Property", "Leave", "Conduct and Discipline", "Return of Company Property"]) {
      expect(bodyText, clause).toContain(clause);
    }
  });
});

describe("confirmation letter", () => {
  it("continues the existing agreement instead of replacing it", () => {
    const { bodyText } = buildDocument(input("confirmation_letter", {
      profile: profile({ confirmedOn: "2026-04-05" }),
    }));
    expect(bodyText).toMatch(/does not replace that agreement/);
    expect(bodyText).toContain("05 Apr 2026");
  });

  it("adds a revised salary section only when there is a revision", () => {
    expect(buildDocument(input("confirmation_letter")).bodyText).not.toMatch(/Revised Remuneration/);
    const withRaise = buildDocument(input("confirmation_letter", { extras: { newCtcMonthly: 30000, effectiveFrom: "2026-04-01" } }));
    expect(withRaise.bodyText).toMatch(/Revised Remuneration/);
    expect(withRaise.bodyText).toContain("₹30,000");
  });
});

describe("exit paperwork", () => {
  const leaving = profile({
    confirmedOn: "2026-04-01",
    separation: {
      type: "resignation", reason: "Higher studies", submittedOn: "2026-09-01",
      submittedById: "u1", submittedByName: "Ravi Kumar", noticeDays: 30,
      lastWorkingDay: "2026-10-01", status: "acknowledged",
      assetsReturnedOn: "2026-10-01", finalSettlementOn: "2026-10-10",
    },
  });

  it("relieves the employee on the last working day and records the settlement", () => {
    const { bodyText } = buildDocument(input("relieving_letter", { profile: leaving, extras: { lastWorkingDay: "2026-10-01" } }));
    expect(bodyText).toContain("01 Oct 2026");
    expect(bodyText).toContain("10 Oct 2026");
    expect(bodyText).toMatch(/TO WHOMSOEVER IT MAY CONCERN/);
  });

  it("states the full period of service on the experience certificate", () => {
    const { bodyText } = buildDocument(input("experience_letter", { profile: leaving, extras: { lastWorkingDay: "2026-10-01" } }));
    expect(bodyText).toContain("05 Jan 2026");
    expect(bodyText).toContain("01 Oct 2026");
    expect(bodyText).toContain("DTS-014");
  });
});

describe("warning letter", () => {
  it("records the concern and gives the employee a right of reply", () => {
    const { bodyText } = buildDocument(input("warning_letter", {
      extras: { incident: "Absent for three days without intimation.", incidentDate: "2026-05-04" },
    }));
    expect(bodyText).toContain("Absent for three days without intimation.");
    expect(bodyText).toContain("04 May 2026");
    expect(bodyText).toMatch(/submit your written response/);
    expect(bodyText).toMatch(/not an admission/);
  });
});

describe("issue-form metadata", () => {
  it("asks for the extra facts a document cannot be written without", () => {
    expect(EXTRA_FIELD_REQUIRED.probation_extension).toEqual(["extendedTo"]);
    expect(EXTRA_FIELD_REQUIRED.warning_letter).toEqual(["incident"]);
    expect(EXTRA_FIELD_REQUIRED.relieving_letter).toEqual(["lastWorkingDay"]);
  });

  it("asks for nothing extra on documents built entirely from the profile", () => {
    expect(EXTRA_FIELDS.appointment_letter).toEqual([]);
    expect(EXTRA_FIELDS.nda).toEqual([]);
    expect(EXTRA_FIELDS.policy_acknowledgement).toEqual([]);
  });

  it("never marks a field required that the form does not ask for", () => {
    for (const [type, required] of Object.entries(EXTRA_FIELD_REQUIRED)) {
      const asked = EXTRA_FIELDS[type as HrDocumentType];
      for (const field of required || []) expect(asked, `${type}.${field}`).toContain(field);
    }
  });
});

describe("formatting helpers", () => {
  it("prints dates the way a letter should read", () => {
    expect(longDate("2026-01-05")).toBe("05 Jan 2026");
    expect(longDate(null)).toBe("—");
    expect(longDate("rubbish")).toBe("—");
  });

  it("prints rupees in Indian grouping and refuses to invent a figure", () => {
    expect(rupees(2500000)).toBe("₹25,00,000");
    expect(rupees(null)).toBe("—");
    expect(rupees(undefined)).toBe("—");
  });

  it("describes the engagement the way the policy asks — probation inside the type, not after it", () => {
    expect(engagementDescription(profile())).toBe("Full-Time Employee (3-month probation)");
    expect(engagementDescription(profile({ engagementType: "part_time", probationMonths: 3 }))).toBe("Part-Time Employee (3-month probation)");
    expect(engagementDescription(profile({ engagementType: "intern" }))).toMatch(/^Intern/);
    expect(engagementDescription(profile({ probationMonths: 0 }))).toBe("Full-Time Employee");
  });
});

/**
 * Numbering a letter that has already been written.
 *
 * The register number is allocated at the moment of issue, but by then an admin may have rewritten
 * the letter by hand — so it is printed onto the text rather than baked in by regenerating it,
 * which would throw those edits away. What has to hold is that the number lands where a reader
 * looks for it, and that a letter which already carries one is left alone.
 */
describe("printing a reference onto a written letter", () => {
  const letter = [
    "OFFER OF EMPLOYMENT",
    "DREAM TEAM SERVICES",
    "",
    "Date: 05 Jan 2026",
    "",
    "Employee Name: Asha Devi",
  ].join("\n");

  it("puts the number immediately above the date", () => {
    expect(withReference(letter, "DTS/OFR/2026/0007"))
      .toContain("DREAM TEAM SERVICES\n\nRef: DTS/OFR/2026/0007\nDate: 05 Jan 2026");
  });

  it("matches where the generator would have put it", () => {
    const generated = buildDocument(input("offer_letter", { referenceNo: "DTS/OFR/2026/0007" }));
    const printed = withReference(
      buildDocument(input("offer_letter", { referenceNo: null })).bodyText,
      "DTS/OFR/2026/0007",
    );
    expect(printed).toBe(generated.bodyText);
  });

  it("never gives a letter a second reference", () => {
    const already = "OFFER\n\nRef: DTS/OFR/2026/0001\nDate: 05 Jan 2026";
    expect(withReference(already, "DTS/OFR/2026/0007")).toBe(already);
  });

  it("leaves the text alone when there is no number, and when there is nowhere to put one", () => {
    expect(withReference(letter, null)).toBe(letter);
    expect(withReference(letter, "   ")).toBe(letter);
    expect(withReference("Rewritten from scratch.", "DTS/OFR/2026/0007")).toBe("Rewritten from scratch.");
  });
});
