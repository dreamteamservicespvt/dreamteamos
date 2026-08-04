import { describe, it, expect } from "vitest";
import { buildDocument, type DocumentSubject } from "@/utils/hrTemplates";
import { documentSubject, letterEmail } from "@/utils/documentSubject";
import { requiresEmployeeSignature } from "@/utils/hrPolicy";
import { HR_DOCUMENT_LABELS } from "@/types/hr";
import type { EmployeeProfile, HrDocumentType } from "@/types/hr";
import type { AppUser } from "@/types";

/**
 * What a letter says about the person it is for.
 *
 * Three separate facts had gone missing from the paperwork, all in the same way — the record knew
 * them and the template never asked:
 *
 *  • the address it is sent to (the login, revoked on the employee's last day),
 *  • the incentive, which for a sales employee is a large part of what they earn,
 *  • the probation, which read as "Permanent from day one" on any record nobody had filled in.
 */

const profile = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  uid: "u1",
  department: "sales",
  stage: "confirmed",
  engagementType: "full_time",
  designation: "Business Development Executive",
  workLocation: "Kakinada",
  reportingToName: "Chief Business Officer (CBO)",
  joiningDate: "2026-01-05",
  ctcMonthly: 15000,
  workingHours: "10:00 AM – 7:00 PM",
  workingDays: "Monday to Saturday",
  probationReviews: [],
  assets: [],
  kycDocuments: [],
  separation: null,
  ...over,
});

const subject = (over: Partial<DocumentSubject> = {}): DocumentSubject => ({
  name: "Priya Gondela",
  phone: "+919876543210",
  email: "priya.personal@gmail.com",
  employeeId: "DTS007",
  ...over,
});

const letter = (type: HrDocumentType, p = profile(), s = subject()) =>
  buildDocument({
    type,
    subject: s,
    profile: p,
    signatory: { name: "Govardhan", designation: "Chief Executive Officer" },
    issuedOn: "2026-02-01",
  }).bodyText;

describe("the email a letter is addressed to", () => {
  const user = { email: "priya@dreamteam.com" } as AppUser;

  it("prints the personal address, not the login", () => {
    const { email, isPersonal } = letterEmail(user, { personalEmail: "priya.personal@gmail.com" });
    expect(email).toBe("priya.personal@gmail.com");
    expect(isPersonal).toBe(true);
  });

  it("falls back to the login, and says that it did", () => {
    // The fallback has to be reportable, not silent: a letter quietly addressed to an account the
    // employee loses on their last day is the failure this whole path exists to prevent.
    const { email, isPersonal } = letterEmail(user, { personalEmail: null });
    expect(email).toBe("priya@dreamteam.com");
    expect(isPersonal).toBe(false);
  });

  it("ignores a personal email that is only whitespace", () => {
    expect(letterEmail(user, { personalEmail: "   " }).isPersonal).toBe(false);
  });

  it("puts the personal address on the letter itself", () => {
    expect(letter("offer_letter")).toContain("Email: priya.personal@gmail.com");
  });
});

describe("what a sales letter says about incentive and targets", () => {
  const salesSubject = subject({ incentivePercent: 5, dailyTarget: 2000, monthlyTarget: 50000 });

  it("states the incentive and both targets on the offer letter", () => {
    const body = letter("offer_letter", profile(), salesSubject);
    expect(body).toContain("Sales Incentive and Targets");
    expect(body).toContain("5% of the value of every sale");
    expect(body).toContain("Daily target: ₹2,000");
    expect(body).toContain("Monthly target: ₹50,000");
  });

  it("states them on the appointment letter too", () => {
    expect(letter("appointment_letter", profile(), salesSubject)).toContain("Sales Incentive and Targets");
  });

  it("carries the enhanced rate for a member on it", () => {
    const body = letter("offer_letter", profile(), subject({ incentivePercent: 10, monthlyTarget: 80000 }));
    // Read from the record payroll settles against, so the letter can never promise a rate the
    // company does not actually pay.
    expect(body).toContain("10% of the value of every sale");
  });

  it("says nothing about incentive on a tech employee's letter", () => {
    const tech = profile({ department: "tech", designation: "AI Software Engineer" });
    expect(letter("offer_letter", tech, subject())).not.toContain("Sales Incentive");
  });

  it("recognises a sales employee from their title when the record has no department", () => {
    // `department` is supplied by whoever loaded the profile and is blank on every older record.
    const noDept = profile({ department: undefined as never });
    expect(letter("offer_letter", noDept, salesSubject)).toContain("Sales Incentive and Targets");
  });

  it("omits the section entirely when neither an incentive nor a target is set", () => {
    expect(letter("offer_letter", profile(), subject())).not.toContain("Sales Incentive");
  });

  it("prints just the incentive when no target has been set yet", () => {
    const body = letter("offer_letter", profile(), subject({ incentivePercent: 5 }));
    expect(body).toContain("5% of the value of every sale");
    expect(body).not.toContain("Daily target");
  });
});

describe("probation on a record nobody filled in", () => {
  it("reads as the standard probation, not as a permanent job from day one", () => {
    const body = letter("offer_letter", profile({ probationMonths: undefined }));
    expect(body).toContain("subject to successful completion of a 3-month probation");
    expect(body).toContain("You will be on probation for 3 month(s)");
  });

  it("still honours a deliberate zero", () => {
    const body = letter("offer_letter", profile({ probationMonths: 0 }));
    expect(body).toContain("Full-Time (Permanent)");
    expect(body).toContain("does not carry a probation period");
  });

  it("gives an intern none, because a fixed term is not an evaluation", () => {
    const body = letter("offer_letter", profile({ engagementType: "intern", probationMonths: undefined }));
    expect(body).not.toContain("You will be on probation");
  });
});

describe("documentSubject", () => {
  const base = {
    name: "Priya", phone: "+91", email: "priya@dreamteam.com", employeeId: "DTS007",
  };

  it("carries the sales facts for a sales member", () => {
    const s = documentSubject(
      { ...base, role: "sales_member", earningsOption: "incentive_10", dailyTarget: 2000, monthlyTarget: 50000 } as AppUser,
      { personalEmail: "p@gmail.com" },
    );
    expect(s).toMatchObject({ email: "p@gmail.com", incentivePercent: 10, dailyTarget: 2000, monthlyTarget: 50000 });
  });

  it("carries none of them for a tech member", () => {
    const s = documentSubject(
      { ...base, role: "tech_member", dailyTarget: 2000 } as AppUser,
      { personalEmail: "p@gmail.com" },
    );
    expect(s.incentivePercent).toBeNull();
    expect(s.dailyTarget).toBeNull();
  });

  it("defaults a sales member with no earnings option to the standard rate", () => {
    const s = documentSubject({ ...base, role: "sales_member" } as AppUser, { personalEmail: null });
    expect(s.incentivePercent).toBe(5);
  });
});

describe("every document the employee has to sign has somewhere to sign it", () => {
  const types = Object.keys(HR_DOCUMENT_LABELS) as HrDocumentType[];

  it.each(types.filter(requiresEmployeeSignature))("%s carries an employee signature block", (type) => {
    expect(letter(type)).toContain("Employee Signature:");
  });

  it("does not put an unsignable block on a letter nobody is asked to sign", () => {
    // A signature line the signing flow never fills is worse than none — it prints as a permanently
    // blank rule on a letter the employee is meant to keep.
    for (const type of types.filter((t) => !requiresEmployeeSignature(t))) {
      expect(letter(type), `${type} should have no employee signature block`)
        .not.toContain("Employee Signature:");
    }
  });
});
