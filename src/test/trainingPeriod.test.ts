import { describe, it, expect } from "vitest";
import { buildDocument } from "@/utils/hrTemplates";
import { trainingTermsFor, monthsBetween } from "@/utils/hrPolicy";
import type { EmployeeProfile } from "@/types/hr";

/**
 * A paid training period at a lower rate, and the salary that follows it.
 *
 * One rule governs all of this: **the annual CTC is built from the post-training salary alone.**
 * Someone who trains for three months on ₹8,000 and then earns ₹25,000 has an annual CTC of
 * ₹3,00,000 — not a blended number they are never actually paid. The letter goes to a bank, and
 * the figure on it has to be the figure the payslips will show.
 */

const profile = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  uid: "u1", department: "tech", stage: "probation", engagementType: "full_time",
  designation: "Associate AI Software Engineer", workLocation: "Kakinada, Andhra Pradesh",
  joiningDate: "2026-08-02", probationMonths: 3, ctcMonthly: 25000,
  workingHours: "10:00 AM – 7:00 PM", workingDays: "Monday – Saturday",
  reportingToName: "Senior AI Software Engineer",
  ...over,
} as EmployeeProfile);

const trainee = (over: Partial<EmployeeProfile> = {}) =>
  profile({ trainingMonths: 3, trainingSalaryMonthly: 8000, ...over });

const letter = (type: "offer_letter" | "appointment_letter", p: EmployeeProfile) => buildDocument({
  type,
  subject: { name: "Rekha", employeeId: "DTS-022" },
  profile: p,
  signatory: { name: "Srinu", designation: "Technical Head" },
  issuedOn: "2026-08-04",
}).bodyText;

describe("the CTC is the post-training salary, never a blend", () => {
  it("computes the annual CTC from the full salary only", () => {
    const t = trainingTermsFor(trainee());
    expect(t.applies).toBe(true);
    expect(t.fullSalary).toBe(25000);
    expect(t.annualCtc).toBe(300000);
    // The blended figure a naive average would produce — must never appear.
    expect(t.annualCtc).not.toBe(3 * 8000 + 9 * 25000);
  });

  it("works out when training ends from the joining date", () => {
    expect(trainingTermsFor(trainee()).endsOn).toBe("2026-11-02");
  });

  for (const type of ["offer_letter", "appointment_letter"] as const) {
    describe(type, () => {
      const text = () => letter(type, trainee());

      it("states the training period and when it ends", () => {
        expect(text()).toContain("Training period: 3 month(s)");
        expect(text()).toContain("02 Nov 2026");
      });

      it("states both salaries, separately", () => {
        expect(text()).toContain("during the training period: ₹8,000 per month");
        expect(text()).toContain("on successful completion of the training period: ₹25,000 per month");
      });

      it("states the annual CTC as the post-training figure", () => {
        expect(text()).toContain("Annual CTC (on completion of training): ₹3,00,000");
      });

      it("says out loud that the training salary is not part of the CTC", () => {
        expect(text()).toMatch(/does not form part of it/);
      });
    });
  }
});

describe("no training period configured", () => {
  it("reads exactly as it always did", () => {
    const text = letter("offer_letter", profile());
    expect(text).toContain("Gross monthly salary (CTC): ₹25,000");
    expect(text).not.toMatch(/Training period/);
    expect(text).not.toMatch(/does not form part of it/);
  });

  it("needs BOTH a length and a rate — a length alone is not a training period", () => {
    expect(trainingTermsFor(profile({ trainingMonths: 3 })).applies).toBe(false);
    expect(trainingTermsFor(profile({ trainingSalaryMonthly: 8000 })).applies).toBe(false);
    expect(letter("offer_letter", profile({ trainingMonths: 3 }))).not.toMatch(/Training period/);
  });

  it("still prints an annual CTC for an ordinary salaried hire", () => {
    expect(letter("offer_letter", profile())).toContain("Annual CTC: ₹3,00,000");
  });
});

describe("an intern on a training rate", () => {
  const p = trainee({ engagementType: "intern", probationMonths: 0, ctcMonthly: 12000, trainingSalaryMonthly: 5000 });

  it("calls both figures a stipend", () => {
    const text = letter("offer_letter", p);
    expect(text).toContain("Stipend during the training period: ₹5,000 per month");
    expect(text).toContain("Stipend on successful completion of the training period: ₹12,000 per month");
    expect(text).not.toContain("Salary during the training period");
  });
});

describe("months between two dates", () => {
  it("reads a three-month internship as three months", () => {
    expect(monthsBetween("2026-08-02", "2026-11-02")).toBe(3);
  });

  it("does not round a part month up", () => {
    expect(monthsBetween("2026-08-02", "2026-11-01")).toBe(2);
  });

  it("returns null rather than zero or a negative for unusable input", () => {
    expect(monthsBetween(null, "2026-11-02")).toBeNull();
    expect(monthsBetween("2026-11-02", "2026-08-02")).toBeNull();
    expect(monthsBetween("2026-08-02", "2026-08-02")).toBeNull();
  });
});
