import { describe, it, expect } from "vitest";
import { buildDocument } from "@/utils/hrTemplates";
import { INTERNSHIP_SKILLS, internshipSkillsFor } from "@/utils/hrPolicy";
import type { EmployeeProfile } from "@/types/hr";

/**
 * The two letters an intern hands to their college.
 *
 * A student cannot take up an internship until their institution grants permission, and the person
 * granting it is looking for evidence of structured training — not a stipend figure. A letter that
 * states the designation and the money and stops gets the permission refused and the student loses
 * the placement. So these tests are about what the letter must *say*, not how it is formatted.
 */

const intern = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  uid: "u1", department: "tech", stage: "probation",
  engagementType: "intern",
  designation: "AI Software Engineer Intern",
  workLocation: "Kakinada, Andhra Pradesh",
  joiningDate: "2026-08-02",
  internshipEndDate: "2026-11-02",
  probationMonths: 0,
  ctcMonthly: 5000,
  workingHours: "10:00 AM – 7:00 PM",
  workingDays: "Monday – Saturday",
  reportingToName: "Senior AI Software Engineer",
  ...over,
} as EmployeeProfile);

const employee = (over: Partial<EmployeeProfile> = {}): EmployeeProfile =>
  intern({ engagementType: "full_time", probationMonths: 3, ctcMonthly: 25000, ...over });

const letter = (type: "offer_letter" | "appointment_letter", profile: EmployeeProfile) =>
  buildDocument({
    type,
    subject: { name: "Rekha", employeeId: "DTS-022" },
    profile,
    signatory: { name: "Srinu", designation: "Technical Head" },
    issuedOn: "2026-08-03",
  }).bodyText;

describe("what an internship letter has to tell a college", () => {
  for (const type of ["offer_letter", "appointment_letter"] as const) {
    describe(type, () => {
      const text = () => letter(type, intern());

      it("says it is structured and supervised, not observation", () => {
        expect(text()).toMatch(/structured, supervised internship/i);
        expect(text()).toMatch(/trained on the job and given real work/i);
      });

      it("names the dates the internship runs between", () => {
        expect(text()).toContain("02 Aug 2026");
        expect(text()).toContain("02 Nov 2026");
      });

      it("names who supervises it", () => {
        expect(text()).toMatch(/mentored and supervised by Senior AI Software Engineer/);
      });

      it("lists the skills that will actually be taught", () => {
        const t = text();
        for (const skill of INTERNSHIP_SKILLS.tech) expect(t).toContain(skill);
      });

      it("promises a completion certificate", () => {
        expect(text()).toMatch(/Internship Completion Certificate/);
      });

      it("says the letter may be given to the college, which is the point of it", () => {
        expect(text()).toMatch(/may be submitted to your college, university or institution/i);
        expect(text()).toMatch(/no objection to it being forwarded/i);
      });

      it("calls the money a stipend rather than a salary", () => {
        expect(text()).toMatch(/stipend/i);
        expect(text()).not.toMatch(/Gross monthly salary/);
      });
    });
  }
});

describe("what a normal employee's letter must NOT gain", () => {
  for (const type of ["offer_letter", "appointment_letter"] as const) {
    it(`${type} carries no internship section for a full-time hire`, () => {
      const text = letter(type, employee());
      expect(text).not.toMatch(/structured, supervised internship/i);
      expect(text).not.toMatch(/Internship Completion Certificate/);
      expect(text).not.toMatch(/college, university or institution/i);
      expect(text).toMatch(/Gross monthly salary/);
    });
  }
});

describe("section numbering survives an optional block", () => {
  const numbersIn = (text: string): number[] =>
    text.split("\n")
      .map((l) => l.match(/^(\d+)\.\s+\S/))
      .filter(Boolean)
      .map((m) => Number(m![1]));

  for (const type of ["offer_letter", "appointment_letter"] as const) {
    it(`${type} numbers run 1,2,3… with no gap or repeat, for an employee`, () => {
      const ns = numbersIn(letter(type, employee()));
      expect(ns.length).toBeGreaterThan(5);
      expect(ns).toEqual(ns.map((_, idx) => idx + 1));
    });

    it(`${type} numbers still run 1,2,3… once the internship section is inserted`, () => {
      // The bug this guards: a hand-numbered heading list reading "5. Probation … 7. Leave".
      const ns = numbersIn(letter(type, intern()));
      expect(ns).toEqual(ns.map((_, idx) => idx + 1));
    });

    it(`${type} gains exactly one section when the employee is an intern`, () => {
      expect(numbersIn(letter(type, intern())).length)
        .toBe(numbersIn(letter(type, employee())).length + 1);
    });
  }
});

describe("the training list", () => {
  it("uses the department's list by default", () => {
    expect(internshipSkillsFor(intern())).toEqual(INTERNSHIP_SKILLS.tech);
    expect(internshipSkillsFor(intern({ department: "sales" }))).toEqual(INTERNSHIP_SKILLS.sales);
  });

  it("lets an admin write their own, one per line", () => {
    const own = internshipSkillsFor(intern({ internshipFocus: "Figma basics\n- Motion graphics\n" }));
    expect(own).toEqual(["Figma basics", "Motion graphics"]);
  });

  it("accepts a comma-separated sentence too, because an admin will type that", () => {
    expect(internshipSkillsFor(intern({ internshipFocus: "Figma, Motion graphics, Colour grading" })))
      .toEqual(["Figma", "Motion graphics", "Colour grading"]);
  });

  it("falls back to the department list when the override is only whitespace", () => {
    expect(internshipSkillsFor(intern({ internshipFocus: "   " }))).toEqual(INTERNSHIP_SKILLS.tech);
  });

  it("prints an admin's own list in the letter instead of the default", () => {
    const text = letter("offer_letter", intern({ internshipFocus: "Colour grading in DaVinci Resolve" }));
    expect(text).toContain("Colour grading in DaVinci Resolve");
    expect(text).not.toContain(INTERNSHIP_SKILLS.tech[0]);
  });
});

describe("an internship with no end date recorded", () => {
  it("still reads sensibly rather than printing a dash", () => {
    const text = letter("offer_letter", intern({ internshipEndDate: null }));
    expect(text).toMatch(/fixed term, as communicated to you and to your institution/i);
    expect(text).not.toMatch(/runs from .* to —/);
  });
});
