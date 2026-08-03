import { describe, it, expect } from "vitest";
import {
  NOTICE_DAYS, addDaysIso, daysBetween, defaultProbationMonths, departmentOfRole, deriveStage,
  documentTypesForStage, formatAadhaar, isUnderProbation, isValidAadhaar, isValidPan, kycCompletion,
  lastWorkingDayFor, lifecycleSteps, maskIdentifier, milestoneDueDate, noticePeriodFor,
  probationDaysRemaining, probationEndDate, probationSchedule, requiresEmployeeSignature,
} from "@/utils/hrPolicy";
import type { EmployeeProfile, HrDocument, HrDocumentType, ProbationReview } from "@/types/hr";

const profile = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  uid: "u1",
  department: "tech",
  stage: "probation",
  engagementType: "full_time",
  joiningDate: "2026-01-01",
  probationMonths: 3,
  probationReviews: [],
  assets: [],
  kycDocuments: [],
  separation: null,
  ...over,
});

const review = (over: Partial<ProbationReview> = {}): ProbationReview => ({
  id: "r1",
  milestone: "day_30",
  reviewedOn: "2026-01-31",
  reviewedById: "a1",
  reviewedByName: "Asha",
  scores: { attendance: 4, quality: 4 },
  averageScore: 4,
  outcome: "on_track",
  createdAt: null,
  ...over,
});

const issued = (type: HrDocumentType, status: HrDocument["status"] = "signed"): HrDocument => ({
  memberId: "u1",
  memberName: "Ravi",
  department: "tech",
  type,
  title: type,
  bodyText: "",
  issuedById: "a1",
  issuedByName: "Asha",
  issuedOn: "2026-01-01",
  createdAt: null,
  requiresEmployeeSignature: true,
  status,
});

describe("notice periods", () => {
  it("follows the company ladder — intern 7, probation 15, confirmed 30, senior 45", () => {
    expect(NOTICE_DAYS).toEqual({ intern: 7, probation: 15, confirmed: 30, senior: 45 });
  });

  it("gives an intern seven days, whatever stage they are in", () => {
    expect(noticePeriodFor(profile({ engagementType: "intern" })).days).toBe(7);
    expect(noticePeriodFor(profile({ engagementType: "intern", stage: "confirmed" })).days).toBe(7);
  });

  it("gives fifteen days during probation", () => {
    const n = noticePeriodFor(profile());
    expect(n.days).toBe(15);
    expect(n.basis).toBe("probation");
  });

  it("gives thirty days once confirmed", () => {
    const n = noticePeriodFor(profile({ stage: "confirmed", confirmedOn: "2026-04-01" }));
    expect(n.days).toBe(30);
    expect(n.basis).toBe("confirmed");
  });

  it("gives a confirmed team lead forty-five days", () => {
    const n = noticePeriodFor(profile({ stage: "confirmed", confirmedOn: "2026-04-01", seniorRole: true }));
    expect(n.days).toBe(45);
    expect(n.basis).toBe("senior");
  });

  it("keeps a senior role on the shorter probation notice until they are confirmed", () => {
    // Probation is short by design; seniority lengthens notice only once employment is confirmed.
    expect(noticePeriodFor(profile({ seniorRole: true })).days).toBe(15);
  });

  it("lets a written contractual term override the ladder, including zero", () => {
    expect(noticePeriodFor(profile({ noticeDaysOverride: 60 })).days).toBe(60);
    expect(noticePeriodFor(profile({ noticeDaysOverride: 0 })).basis).toBe("override");
  });

  it("does not treat misconduct as a notice period at all", () => {
    const n = noticePeriodFor(profile({ stage: "confirmed", confirmedOn: "2026-04-01" }), { separationType: "misconduct" });
    expect(n.days).toBe(0);
    expect(n.basis).toBe("misconduct");
  });

  it("counts the last working day from the day notice is given", () => {
    // Resigning on 1 September with 30 days' notice ends on 1 October — 30 days served.
    expect(lastWorkingDayFor("2026-09-01", 30)).toBe("2026-10-01");
    expect(lastWorkingDayFor("2026-09-01", 0)).toBe("2026-09-01");
  });
});

describe("probation", () => {
  it("defaults to three months for employees and none for interns or contractors", () => {
    expect(defaultProbationMonths("full_time")).toBe(3);
    expect(defaultProbationMonths("part_time")).toBe(3);
    expect(defaultProbationMonths("intern")).toBe(0);
    expect(defaultProbationMonths("contract")).toBe(0);
  });

  it("ends probation at joining + probation months", () => {
    expect(probationEndDate(profile())).toBe("2026-04-01");
  });

  it("lets a formal extension replace the computed end date", () => {
    expect(probationEndDate(profile({ probationExtendedTo: "2026-06-01" }))).toBe("2026-06-01");
  });

  it("has no end date when there is no probation", () => {
    expect(probationEndDate(profile({ probationMonths: 0 }))).toBeNull();
  });

  it("schedules the 30/60/90 reviews from the joining date", () => {
    expect(milestoneDueDate("2026-01-01", "day_30")).toBe("2026-01-31");
    expect(milestoneDueDate("2026-01-01", "day_60")).toBe("2026-03-02");
    expect(milestoneDueDate("2026-01-01", "day_90")).toBe("2026-04-01");
    expect(milestoneDueDate("2026-01-01", "adhoc")).toBeNull();
  });

  it("flags a passed milestone with no review as overdue, and a recorded one as done", () => {
    const schedule = probationSchedule(profile({ probationReviews: [review()] }), "2026-03-10");
    const [d30, d60, d90] = schedule;
    expect(d30.done).toBe(true);
    expect(d30.overdue).toBe(false);
    expect(d60.done).toBe(false);
    expect(d60.overdue).toBe(true);   // due 2 March, today is 10 March, nothing recorded
    expect(d90.overdue).toBe(false);  // not due yet
  });

  it("stops nagging about reviews once the employee is confirmed", () => {
    const schedule = probationSchedule(profile({ confirmedOn: "2026-02-01" }), "2026-06-01");
    expect(schedule.every((s) => !s.overdue)).toBe(true);
  });

  it("counts down the days left in probation and goes negative once it has run out", () => {
    expect(probationDaysRemaining(profile(), "2026-03-01")).toBe(31);
    expect(probationDaysRemaining(profile(), "2026-04-11")).toBe(-10);
  });

  it("treats someone as on probation only while joined and unconfirmed, never an intern", () => {
    expect(isUnderProbation(profile())).toBe(true);
    expect(isUnderProbation(profile({ confirmedOn: "2026-04-01" }))).toBe(false);
    expect(isUnderProbation(profile({ engagementType: "intern" }))).toBe(false);
  });
});

describe("departments and signatories", () => {
  it("routes technical roles to tech and sales roles to sales", () => {
    expect(departmentOfRole("tech_member")).toBe("tech");
    expect(departmentOfRole("tech_team_leader")).toBe("tech");
    expect(departmentOfRole("tech_admin")).toBe("tech");
    expect(departmentOfRole("sales_member")).toBe("sales");
    expect(departmentOfRole("sales_admin")).toBe("sales");
  });

  it("has no department for roles that are not employees of either team", () => {
    expect(departmentOfRole("main_admin")).toBeNull();
    expect(departmentOfRole("accounts_admin")).toBeNull();
    expect(departmentOfRole(undefined)).toBeNull();
  });
});

describe("KYC completeness", () => {
  it("reports what is still missing rather than a bare percentage", () => {
    const k = kycCompletion(profile({ photoUrl: "u", dob: "2000-01-01" }));
    expect(k.complete).toBe(false);
    expect(k.done).toBe(2);
    expect(k.total).toBe(13);
    expect(k.missing).toContain("PAN number");
    expect(k.missing).toContain("Aadhaar number");
  });

  it("is complete only when every required item is on file", () => {
    const k = kycCompletion(profile({
      photoUrl: "u", dob: "2000-01-01", currentAddress: "Kakinada",
      surname: "Rao", permanentAddress: "Rajahmundry",
      personalEmail: "a@b.com", bloodGroup: "O+",
      emergencyContact: { name: "A", relation: "Father", phone: "+919999999999" },
      pan: "ABCDE1234F", aadhaar: "111122223333",
      signatureUrl: "https://cdn/sign.png",
      kycDocuments: [
        { id: "1", kind: "pan", label: "pan.jpg", url: "https://cdn/pan.jpg", uploadedAt: null as never, uploadedByName: "A" },
        { id: "2", kind: "aadhaar", label: "aadhaar.jpg", url: "https://cdn/aadhaar.jpg", uploadedAt: null as never, uploadedByName: "A" },
      ],
    }));
    expect(k.complete).toBe(true);
    expect(k.percent).toBe(100);
  });

  it("counts an avatar as the photograph when the reader is known", () => {
    // Anyone who uploaded a profile picture before the HR record existed must not be asked for
    // the same face a second time.
    const p = profile({ dob: "2000-01-01" });
    expect(kycCompletion(p).missing).toContain("Profile photo");
    expect(kycCompletion(p, { avatar: "https://cdn/a.jpg" } as never).missing).not.toContain("Profile photo");
  });
});

describe("government identifiers", () => {
  it("accepts a well-formed PAN, however it was typed", () => {
    expect(isValidPan("ABCDE1234F")).toBe(true);
    expect(isValidPan("abcde1234f")).toBe(true);
    expect(isValidPan(" ABCDE 1234 F ")).toBe(true);
  });

  it("rejects a PAN of the wrong shape", () => {
    expect(isValidPan("ABCD1234F")).toBe(false);    // four letters
    expect(isValidPan("ABCDE12345")).toBe(false);   // trailing digit
    expect(isValidPan("ABCDE1234")).toBe(false);    // too short
    expect(isValidPan("")).toBe(false);
    expect(isValidPan(null)).toBe(false);
  });

  it("accepts an Aadhaar whose Verhoeff check digit is right", () => {
    expect(isValidAadhaar("234567890124")).toBe(true);
    expect(isValidAadhaar("2345 6789 0124")).toBe(true);
    expect(isValidAadhaar("999888777669")).toBe(true);
  });

  it("rejects one that is the right length but fails the checksum", () => {
    // This is the case a bare length check lets through — a single mistyped digit.
    expect(isValidAadhaar("234567890123")).toBe(false);
    expect(isValidAadhaar("234567890125")).toBe(false);
  });

  it("catches a transposition, which is what mistyping actually looks like", () => {
    expect(isValidAadhaar("234567890124")).toBe(true);
    expect(isValidAadhaar("235467890124")).toBe(false);  // 4 and 5 swapped
  });

  it("rejects Aadhaar numbers that cannot exist", () => {
    expect(isValidAadhaar("012345678901")).toBe(false);  // never starts 0
    expect(isValidAadhaar("112345678901")).toBe(false);  // never starts 1
    expect(isValidAadhaar("23456789012")).toBe(false);   // eleven digits
    expect(isValidAadhaar("")).toBe(false);
  });

  it("prints an Aadhaar the way it appears on the card", () => {
    expect(formatAadhaar("234567890124")).toBe("2345 6789 0124");
    expect(formatAadhaar("2345 6789 0124")).toBe("2345 6789 0124");
  });
});

describe("identifier masking", () => {
  it("shows only the last four characters", () => {
    expect(maskIdentifier("111122223333")).toBe("•••• •••• 3333");
    expect(maskIdentifier("ABCDE1234F")).toBe("•••• ••23 4F");
  });

  it("does not pretend to mask something too short to mask", () => {
    expect(maskIdentifier("123")).toBe("123");
    expect(maskIdentifier("")).toBe("—");
    expect(maskIdentifier(null)).toBe("—");
  });
});

describe("document expectations", () => {
  it("asks for a signature on the documents whose point is the signature", () => {
    expect(requiresEmployeeSignature("offer_letter")).toBe(true);
    expect(requiresEmployeeSignature("appointment_letter")).toBe(true);
    expect(requiresEmployeeSignature("nda")).toBe(true);
    expect(requiresEmployeeSignature("policy_acknowledgement")).toBe(true);
  });

  it("does not ask an employee to sign the letters the company issues to them", () => {
    expect(requiresEmployeeSignature("confirmation_letter")).toBe(false);
    expect(requiresEmployeeSignature("relieving_letter")).toBe(false);
    expect(requiresEmployeeSignature("experience_letter")).toBe(false);
    expect(requiresEmployeeSignature("increment_letter")).toBe(false);
  });

  it("offers exit paperwork only once someone is leaving", () => {
    expect(documentTypesForStage("offer_issued")).toContain("offer_letter");
    expect(documentTypesForStage("notice_period")).toContain("relieving_letter");
    expect(documentTypesForStage("probation")).not.toContain("relieving_letter");
  });
});

describe("lifecycle tracker", () => {
  it("marks exactly one step as current — the first thing still outstanding", () => {
    const steps = lifecycleSteps(profile(), []);
    expect(steps.filter((s) => s.status === "current")).toHaveLength(1);
    expect(steps[0].status).toBe("current");   // no offer recorded yet
  });

  it("walks forward as the record fills in", () => {
    const steps = lifecycleSteps(
      profile({ offerIssuedOn: "2025-12-01", offerAcceptedOn: "2025-12-05" }),
      [issued("offer_letter")],
    );
    expect(steps.find((s) => s.key === "offer")?.status).toBe("done");
    expect(steps.find((s) => s.key === "offer_accepted")?.status).toBe("done");
    expect(steps.find((s) => s.key === "kyc")?.status).toBe("current");
  });

  /**
   * A date on the record and a letter in the register are two different facts.
   *
   * The strip reads "Offer letter issued ✓" off either of them, which is right — an offer sent by
   * email and recorded in Employment terms really was issued. What was wrong was saying it the
   * same way in both cases: an admin looking at a green tick beside a Documents tab reading "No
   * documents issued yet" has no way to tell which half of the screen is lying to them.
   */
  it("says when the offer step is standing on a date with no letter behind it", () => {
    const steps = lifecycleSteps(profile({ offerIssuedOn: "2025-12-01", offerAcceptedOn: "2025-12-05" }), []);
    expect(steps.find((s) => s.key === "offer")?.status).toBe("done");
    expect(steps.find((s) => s.key === "offer")?.detail).toContain("no letter on file");
    expect(steps.find((s) => s.key === "offer_accepted")?.detail).toContain("no signed letter on file");
  });

  it("says nothing of the sort once the letter is actually there", () => {
    const steps = lifecycleSteps(
      profile({ offerIssuedOn: "2025-12-01", offerAcceptedOn: "2025-12-05" }),
      [issued("offer_letter")],
    );
    expect(steps.find((s) => s.key === "offer")?.detail).not.toContain("no letter on file");
    expect(steps.find((s) => s.key === "offer_accepted")?.detail).not.toContain("no signed letter on file");
  });

  it("counts the employment documents as done only when all three are signed", () => {
    const partial = lifecycleSteps(profile(), [issued("appointment_letter"), issued("nda")]);
    expect(partial.find((s) => s.key === "documents")?.status).not.toBe("done");

    const all = lifecycleSteps(profile(), [
      issued("appointment_letter"), issued("nda"), issued("policy_acknowledgement"),
    ]);
    expect(all.find((s) => s.key === "documents")?.status).toBe("done");
  });

  it("does not hold an issued-but-unsigned document against the employee as signed", () => {
    const steps = lifecycleSteps(profile(), [
      issued("appointment_letter", "issued"), issued("nda", "issued"), issued("policy_acknowledgement", "issued"),
    ]);
    expect(steps.find((s) => s.key === "documents")?.status).not.toBe("done");
  });

  it("skips probation for an internship instead of leaving it permanently outstanding", () => {
    const steps = lifecycleSteps(profile({ engagementType: "intern" }), []);
    expect(steps.find((s) => s.key === "probation")?.status).toBe("done");
    expect(steps.find((s) => s.key === "probation")?.detail).toMatch(/internship/i);
  });
});

describe("stage derivation", () => {
  it("suggests probation once a full-time employee has joined", () => {
    expect(deriveStage(profile(), "2026-02-01")).toBe("probation");
  });

  it("does not put a joined employee on probation before their joining date", () => {
    expect(deriveStage(profile({ offerAcceptedOn: "2025-12-05" }), "2025-12-20")).toBe("offer_accepted");
  });

  it("suggests confirmed once confirmation is recorded", () => {
    expect(deriveStage(profile({ confirmedOn: "2026-04-01" }), "2026-05-01")).toBe("confirmed");
  });

  it("moves to notice period while a separation is live, and exited after the last working day", () => {
    const leaving = profile({
      confirmedOn: "2026-04-01",
      separation: {
        type: "resignation", reason: "Higher studies", submittedOn: "2026-09-01",
        submittedById: "u1", submittedByName: "Ravi", noticeDays: 30,
        lastWorkingDay: "2026-10-01", status: "acknowledged",
      },
    });
    expect(deriveStage(leaving, "2026-09-15")).toBe("notice_period");
    expect(deriveStage(leaving, "2026-10-05")).toBe("exited");
  });

  it("puts a withdrawn resignation back where it came from", () => {
    const withdrawn = profile({
      confirmedOn: "2026-04-01",
      separation: {
        type: "resignation", reason: "—", submittedOn: "2026-09-01",
        submittedById: "u1", submittedByName: "Ravi", noticeDays: 30,
        lastWorkingDay: "2026-10-01", status: "withdrawn",
      },
    });
    expect(deriveStage(withdrawn, "2026-09-15")).toBe("confirmed");
  });
});

describe("date helpers", () => {
  it("adds days across a month boundary", () => {
    expect(addDaysIso("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("returns null rather than an invalid date for unusable input", () => {
    expect(addDaysIso(null, 5)).toBeNull();
    expect(addDaysIso("not-a-date", 5)).toBeNull();
    expect(daysBetween("2026-01-01", undefined)).toBeNull();
  });

  it("counts days forward as positive and backward as negative", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-01-31", "2026-01-01")).toBe(-30);
  });
});
