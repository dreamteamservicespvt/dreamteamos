import { describe, it, expect } from "vitest";
import { buildDocument } from "@/utils/hrTemplates";
import { CORE_TRAINING, INTERNSHIP_SKILLS, internshipSkillsFor } from "@/utils/hrPolicy";
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

      /**
       * The six subjects, named.
       *
       * This is the specific thing a college weighs when deciding whether to grant permission, so
       * it is pinned by subject rather than by whatever the array happens to hold — dropping one
       * while rewording the list would still pass the test above.
       */
      it.each([
        ["Generative AI", /Generative AI/],
        ["website development", /Website design and development/],
        ["AI chatbots", /AI chatbots/],
        ["AI SaaS", /AI SaaS/],
        ["AI agents", /AI agents/],
        ["AI model development", /AI model development/],
      ])("names %s as a training subject", (_label, pattern) => {
        expect(text()).toMatch(pattern);
      });

      it("says how the training is delivered, not just what it covers", () => {
        expect(text()).toMatch(/guided sessions .* supervised work on live projects/i);
      });

      it("offers the progress report and attendance record a college asks for", () => {
        expect(text()).toMatch(/periodic progress report or an attendance record/i);
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

    it(`${type} swaps the internship section in for the ones an intern does not get`, () => {
      // An intern gains "Internship, Training and Supervision" and loses the performance-review
      // section, which is full-time only. What matters is that both letters stay correctly
      // numbered — the counts themselves are free to differ.
      const asIntern = letter(type, intern());
      const asEmployee = letter(type, employee());
      expect(asIntern).toMatch(/Internship, Training and Supervision/);
      expect(asEmployee).not.toMatch(/Internship, Training and Supervision/);
      for (const ns of [numbersIn(asIntern), numbersIn(asEmployee)]) {
        expect(ns).toEqual(ns.map((_, idx) => idx + 1));
      }
    });
  }
});

describe("the training list", () => {
  it("uses the department's list by default", () => {
    expect(internshipSkillsFor(intern())).toEqual(INTERNSHIP_SKILLS.tech);
    expect(internshipSkillsFor(intern({ department: "sales" }))).toEqual(INTERNSHIP_SKILLS.sales);
  });

  it("teaches the same six subjects whatever department the intern joins", () => {
    // The company trains every intern on the same technical curriculum; only the practical work
    // that follows it differs. A sales intern's letter must not omit it.
    for (const dept of ["tech", "sales"] as const) {
      expect(INTERNSHIP_SKILLS[dept].slice(0, CORE_TRAINING.length)).toEqual(CORE_TRAINING);
    }
  });

  it("prints the full curriculum in a sales intern's letter too", () => {
    const text = letter("offer_letter", intern({ department: "sales" }));
    for (const subject of CORE_TRAINING) expect(text).toContain(subject);
  });

  it("describes each subject, rather than naming it and stopping", () => {
    // "Generative AI" alone tells an examiner nothing; the dash and what follows is the part they
    // can map to a course outcome.
    for (const subject of CORE_TRAINING) {
      expect(subject, subject).toMatch(/ — .{25,}/);
    }
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

describe("the duration line a college copies onto its own form", () => {
  it("gives the months and both dates in the shape they ask for", () => {
    expect(letter("offer_letter", intern()))
      .toContain("Duration: 3 Month(s) (Effective from 02/08/2026 to 02/11/2026)");
  });

  it("is titled as an internship offer letter, not an offer of employment", () => {
    const text = letter("offer_letter", intern());
    expect(text.split("\n")[0]).toBe("INTERNSHIP OFFER LETTER");
    expect(text).not.toMatch(/^OFFER OF EMPLOYMENT$/m);
  });

  it("keeps the employment title for a normal hire", () => {
    expect(letter("offer_letter", employee()).split("\n")[0]).toBe("OFFER OF EMPLOYMENT");
  });

  it("is left off entirely when the dates cannot make one", () => {
    expect(letter("offer_letter", intern({ internshipEndDate: null }))).not.toContain("Duration:");
  });
});

describe("the two optional clauses", () => {
  it("offers an extension when the engagement allows it", () => {
    const text = letter("offer_letter", intern({ internshipExtendable: true }));
    expect(text).toContain("may be extended based on the intern's performance and the company's requirements");
  });

  it("states the early-termination notice", () => {
    expect(letter("offer_letter", intern({ internshipNoticeDays: 7 })))
      .toContain("terminate the internship by giving 7 days' written notice");
  });

  it("honours a different notice period", () => {
    expect(letter("offer_letter", intern({ internshipNoticeDays: 15 })))
      .toContain("giving 15 days' written notice");
  });

  it("omits each clause when it is turned off, rather than printing an empty one", () => {
    const text = letter("offer_letter", intern({ internshipExtendable: false, internshipNoticeDays: null }));
    expect(text).not.toMatch(/may be extended/);
    expect(text).not.toMatch(/written notice/);
    // The rest of the internship block survives.
    expect(text).toMatch(/structured, supervised internship/);
  });

  it("keeps both clauses off a normal employee's letter", () => {
    const text = letter("offer_letter", employee({ internshipExtendable: true, internshipNoticeDays: 7 }));
    expect(text).not.toMatch(/may be extended based on the intern/);
    expect(text).not.toMatch(/terminate the internship/);
  });
});

describe("an internship with no end date recorded", () => {
  it("still reads sensibly rather than printing a dash", () => {
    const text = letter("offer_letter", intern({ internshipEndDate: null }));
    expect(text).toMatch(/fixed term, as communicated to you and to your institution/i);
    expect(text).not.toMatch(/runs from .* to —/);
  });
});
