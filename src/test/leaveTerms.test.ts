import { describe, it, expect } from "vitest";
import { LEAVE_TERMS_MARKER, buildDocument, leaveTermsAddendum } from "@/utils/hrTemplates";
import { documentsNeedingLeaveTerms } from "@/services/hrDocuments";
import type { BuildDocumentInput } from "@/utils/hrTemplates";
import type { EmployeeProfile, HrDocument, HrDocumentType } from "@/types/hr";

/**
 * The three facts a letter has to state about time off.
 *
 * These were the terms everybody knew and nobody had written down: the weekly off, the public
 * holidays, and two paid leave days a pay cycle that vanish if they are not taken. The last one is
 * the one that gets argued about, so it is the one asserted hardest here.
 */

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
  probationReviews: [],
  assets: [],
  kycDocuments: [],
  separation: null,
  ...over,
});

const input = (type: HrDocumentType, over: Partial<BuildDocumentInput> = {}): BuildDocumentInput => ({
  type,
  subject: { name: "Ravi Kumar", email: "ravi@example.com" },
  profile: profile(),
  signatory: { name: "Asha Rao", designation: "Technical Head" },
  issuedOn: "2026-01-01",
  ...over,
});

const LETTERS: HrDocumentType[] = ["offer_letter", "appointment_letter"];

describe("leave terms on the letters", () => {
  it("names Sunday as the weekly off, worked out from the days actually worked", () => {
    for (const type of LETTERS) {
      const { bodyText } = buildDocument(input(type));
      expect(bodyText, type).toContain("Weekly off: Sunday");
    }
  });

  it("names the second weekly off too, when the employee works a five-day week", () => {
    const p = profile({ workingDays: "Monday to Friday" });
    const { bodyText } = buildDocument(input("appointment_letter", { profile: p }));
    expect(bodyText).toContain("Saturday, Sunday");
  });

  it("states the public holidays as paid days that do not eat into leave", () => {
    for (const type of LETTERS) {
      const { bodyText } = buildDocument(input(type));
      expect(bodyText, type).toContain("Public holidays");
      expect(bodyText, type).toContain("not counted against your leave");
    }
  });

  it("states two paid leave days per pay cycle", () => {
    for (const type of LETTERS) {
      const { bodyText } = buildDocument(input(type));
      expect(bodyText, type).toContain("two (2) days of paid leave for each pay cycle");
    }
  });

  it("says in as many words that unused leave lapses rather than rolling over", () => {
    for (const type of LETTERS) {
      const { bodyText } = buildDocument(input(type));
      expect(bodyText, type).toContain(LEAVE_TERMS_MARKER);
      expect(bodyText, type).toContain("lapses at the end of that cycle");
      expect(bodyText, type).toContain("it is not added to the next cycle");
    }
  });

  it("no longer palms the employee off with 'in accordance with the company's leave policy'", () => {
    for (const type of LETTERS) {
      const { bodyText } = buildDocument(input(type));
      expect(bodyText, type).not.toContain("entitled to leave in accordance with the company's leave policy");
    }
  });

  it("makes the policy acknowledgement acknowledge the actual terms, not just that a policy exists", () => {
    const { bodyText } = buildDocument(input("policy_acknowledgement"));
    expect(bodyText).toContain("neither carried forward nor encashed");
  });
});

describe("the addendum for letters already issued", () => {
  const doc = (over: Partial<HrDocument>): HrDocument => ({
    id: "d1",
    memberId: "u1",
    memberName: "Ravi Kumar",
    type: "offer_letter",
    title: "Offer Letter",
    bodyText: "OFFER OF EMPLOYMENT\n\n1. Leave\nYou will be entitled to leave in accordance with the company's leave policy.",
    issuedOn: "2026-01-01",
    issuedById: "a1",
    issuedByName: "Asha Rao",
    requiresEmployeeSignature: true,
    status: "issued",
    ...over,
  } as HrDocument);

  it("states the same terms the new letters state", () => {
    const text = leaveTermsAddendum(profile(), "2026-08-06");
    expect(text).toContain("Weekly off: Sunday");
    expect(text).toContain("Public holidays");
    expect(text).toContain("two (2) days of paid leave");
    expect(text).toContain(LEAVE_TERMS_MARKER);
  });

  it("carries no signature line, which would take the signature off the letter above it", () => {
    // AgreementView pairs signature images with signature lines positionally.
    expect(leaveTermsAddendum(profile())).not.toMatch(/Signature:/);
  });

  it("picks up signed letters as well as unsigned ones", () => {
    const targets = documentsNeedingLeaveTerms([
      doc({ id: "signed", status: "signed" }),
      doc({ id: "issued", status: "issued" }),
    ]);
    expect(targets.map((d) => d.id).sort()).toEqual(["issued", "signed"]);
  });

  it("leaves alone a letter that already carries the terms, so running it twice is safe", () => {
    const already = doc({ bodyText: `Anything at all.\n${leaveTermsAddendum(profile())}` });
    expect(documentsNeedingLeaveTerms([already])).toHaveLength(0);
  });

  it("leaves alone the letters the terms have nothing to do with", () => {
    const targets = documentsNeedingLeaveTerms([
      doc({ type: "relieving_letter" }),
      doc({ type: "warning_letter" }),
      doc({ type: "nda" }),
    ]);
    expect(targets).toHaveLength(0);
  });
});
