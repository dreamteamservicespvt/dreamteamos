import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildInviteLetters, draftProbationEnd, inviteProfile, suggestOfferNumber } from "@/utils/onboardingLetters";
import { newAccessCode, newInviteId, buildInviteMessage, isOpen } from "@/services/onboarding";
import { ordinalDay } from "@/utils/hrTemplates";
import { stepForStatus } from "@/types/onboarding";
import { SIGNATORY_TITLE } from "@/utils/hrPolicy";
import type { InviteDraft, OnboardingInvite } from "@/types/onboarding";

const draft = (over: Partial<InviteDraft> = {}): InviteDraft => ({
  department: "tech",
  role: "tech_member",
  name: "Ravi Kumar",
  email: "ravi@example.com",
  phone: "+919876543210",
  address: "12-3-4 Main Road, Kakinada",
  designation: "Video Editor",
  engagementType: "full_time",
  employeeId: "DTS-014",
  reportingToName: "Asha Rao",
  workLocation: "Kakinada, Andhra Pradesh",
  joiningDate: "2026-09-01",
  probationMonths: 3,
  offerValidUntil: "2026-08-10",
  ctcMonthly: 25000,
  salaryPayDay: 10,
  workingDays: "Monday to Saturday",
  workingHours: "10:00 AM – 7:00 PM",
  shiftDetails: null,
  noticeDays: 15,
  offerLetterNumber: "DTS/OFR/2026/007",
  ...over,
});

const signatory = { name: "Asha Rao", designation: SIGNATORY_TITLE.tech };
const letters = (over: Partial<InviteDraft> = {}) =>
  buildInviteLetters({ draft: draft(over), signatory, issuedOn: "2026-08-03" });

describe("the terms an invite carries into its letters", () => {
  it("turns the typed terms into the profile shape the templates already read", () => {
    const p = inviteProfile(draft());
    expect(p.designation).toBe("Video Editor");
    expect(p.ctcMonthly).toBe(25000);
    expect(p.salaryPayDay).toBe(10);
    expect(p.department).toBe("tech");
  });

  it("records the agreed notice period as an override, not a policy rung", () => {
    // What the person was told must survive a later change to company policy.
    expect(inviteProfile(draft({ noticeDays: 21 })).noticeDaysOverride).toBe(21);
  });

  it("marks a team leader as a senior role, which is what their notice period hangs off", () => {
    expect(inviteProfile(draft()).seniorRole).toBe(false);
    expect(inviteProfile(draft({ role: "tech_team_leader" })).seniorRole).toBe(true);
  });

  it("works out when probation ends from the joining date", () => {
    expect(draftProbationEnd(draft())).toBe("2026-12-01");
    expect(draftProbationEnd(draft({ probationMonths: 0 }))).toBeNull();
  });
});

describe("the offer letter a candidate opens", () => {
  it("states the position, the money, the dates and the deadline", () => {
    const { bodyText } = letters().offer;
    expect(bodyText).toContain("Ravi Kumar");
    expect(bodyText).toContain("Video Editor");
    expect(bodyText).toContain("₹25,000");
    expect(bodyText).toContain("01 Sep 2026");            // joining date
    expect(bodyText).toContain("Kakinada, Andhra Pradesh");
    expect(bodyText).toContain("10 Aug 2026");            // offer valid until
    expect(bodyText).toMatch(/stands withdrawn/);
  });

  it("carries the company's own reference and the candidate's address", () => {
    const { bodyText } = letters().offer;
    expect(bodyText).toContain("Ref: DTS/OFR/2026/007");
    expect(bodyText).toContain("Address: 12-3-4 Main Road, Kakinada");
  });

  it("covers leave and confidentiality, which an offer is expected to mention", () => {
    const { bodyText } = letters().offer;
    expect(bodyText).toMatch(/^\d+\. Leave$/m);
    expect(bodyText).toMatch(/^\d+\. Confidentiality$/m);
  });

  it("says which day of the month salary lands on", () => {
    expect(letters().offer.bodyText).toContain("on or about the 10th of each month");
  });

  it("leaves both signature blocks in place — the company's and the candidate's", () => {
    const { bodyText } = letters().offer;
    // The company block opens "For <company> — <office> Signature:". That leading "For" is what
    // AgreementView keys on to render it as the company's side, so it is worth pinning.
    expect(bodyText).toMatch(/^For .+ — .+ Signature:$/m);
    expect(bodyText).toMatch(/^Employee Signature:/m);
    expect(bodyText).toContain("CTO (Tech Admin)");
  });
});

describe("the joining letter that makes someone an employee", () => {
  const body = () => letters().joining.bodyText;

  it("states every clause the company's paperwork checklist asks for", () => {
    for (const clause of [
      "Remuneration", "Probation and Confirmation", "Working Hours, Days and Shift",
      "Leave, Attendance and Punctuality", "Remote Work", "Your Responsibilities",
      "Confidentiality", "Intellectual Property", "Conduct and Discipline",
      "Conflict of Interest", "Non-Solicitation", "Background Verification",
      "Notice Period and Termination", "Return of Company Property",
      "Amendment and Governing Terms", "Governing Law and Jurisdiction",
    ]) {
      expect(body(), clause).toContain(clause);
    }
  });

  it("spells out how someone gets paid, not just how much", () => {
    expect(body()).toContain("bank account in your own name");
    expect(body()).toMatch(/Provident Fund and ESI/);
    expect(body()).toContain("on or about the 10th of each month");
  });

  it("tells the employee their own notice period rather than only the ladder", () => {
    expect(body()).toMatch(/notice period applicable to you at the date of this letter is 15 day/);
    expect(letters({ noticeDays: 45 }).joining.bodyText).toMatch(/is 45 day/);
  });

  it("names the date probation ends, so nobody has to count months", () => {
    expect(body()).toContain("01 Dec 2026");
  });

  it("is governed by Indian law and signed at a stated place", () => {
    expect(body()).toContain("laws of India");
    expect(body()).toContain("Place: Kakinada, Andhra Pradesh");
  });

  it("prints the employee ID it was issued with", () => {
    expect(body()).toContain("DTS-014");
  });

  it("never leaves an unresolved placeholder, whatever is left blank", () => {
    const sparse = letters({
      address: null, employeeId: null, reportingToName: null, shiftDetails: null,
      offerValidUntil: null, salaryPayDay: null,
    });
    expect(sparse.joining.bodyText).not.toMatch(/undefined|NaN|Invalid Date|\[object/);
    expect(sparse.offer.bodyText).not.toMatch(/undefined|NaN|Invalid Date|\[object/);
  });

  it("says plainly that an intern serves no probation instead of printing a zero", () => {
    const intern = letters({ engagementType: "intern", probationMonths: 0 });
    expect(intern.joining.bodyText).toMatch(/does not carry a probation period/);
  });
});

describe("the letters are frozen when the link is made", () => {
  it("stamps both with the same issue date the company signed on", () => {
    const { offer, joining } = letters();
    expect(offer.issuedOn).toBe("2026-08-03");
    expect(joining.issuedOn).toBe("2026-08-03");
  });

  it("titles each letter after the person it belongs to", () => {
    const { offer, joining } = letters();
    expect(offer.title).toContain("Ravi Kumar");
    expect(joining.title).toContain("Ravi Kumar");
    expect(offer.title).not.toBe(joining.title);
  });
});

describe("the link and the code guarding it", () => {
  it("mints an id that is short enough to paste and long enough not to guess", () => {
    const id = newInviteId();
    expect(id).toHaveLength(10);
    expect(id).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]+$/);
  });

  it("does not mint the same id twice", () => {
    const ids = new Set(Array.from({ length: 200 }, newInviteId));
    expect(ids.size).toBe(200);
  });

  it("mints a four-digit code", () => {
    for (let i = 0; i < 50; i++) expect(newAccessCode()).toMatch(/^\d{4}$/);
  });

  it("spreads codes across the range rather than favouring a corner of it", () => {
    const first = new Set(Array.from({ length: 300 }, () => newAccessCode()[0]));
    expect(first.size).toBeGreaterThan(7);
  });

  it("sends the link and the code together, with the code marked as private", () => {
    const message = buildInviteMessage({
      name: "Ravi", designation: "Video Editor",
      url: "https://x.test/join/abc", code: "4821", companyName: "Dream Team Services",
    });
    expect(message).toContain("https://x.test/join/abc");
    expect(message).toContain("4821");
    expect(message).toMatch(/do not share/i);
  });
});

describe("where the candidate is up to", () => {
  it("sends them to the step matching what they have already signed", () => {
    expect(stepForStatus("sent")).toBe("offer");
    expect(stepForStatus("offer_accepted")).toBe("joining");
    expect(stepForStatus("completed")).toBe("credentials");
    expect(stepForStatus("declined")).toBe("closed");
    expect(stepForStatus("revoked")).toBe("closed");
  });

  it("counts only unfinished invites as still open, so the team list stays honest", () => {
    const invite = (status: OnboardingInvite["status"]) => ({ status } as OnboardingInvite);
    expect(isOpen(invite("sent"))).toBe(true);
    expect(isOpen(invite("offer_accepted"))).toBe(true);
    expect(isOpen(invite("completed"))).toBe(false);
    expect(isOpen(invite("declined"))).toBe(false);
    expect(isOpen(invite("revoked"))).toBe(false);
  });
});

describe("small print", () => {
  it("prints a pay day as a day of the month, and refuses an impossible one", () => {
    expect(ordinalDay(1)).toBe("1st");
    expect(ordinalDay(2)).toBe("2nd");
    expect(ordinalDay(3)).toBe("3rd");
    expect(ordinalDay(4)).toBe("4th");
    expect(ordinalDay(11)).toBe("11th");
    expect(ordinalDay(21)).toBe("21st");
    expect(ordinalDay(31)).toBe("31st");
    expect(ordinalDay(0)).toBeNull();
    expect(ordinalDay(32)).toBeNull();
    expect(ordinalDay(null)).toBeNull();
  });

  it("suggests an offer number that says which year it belongs to", () => {
    expect(suggestOfferNumber(7, 2026)).toBe("DTS/OFR/2026/007");
    expect(suggestOfferNumber(123, 2026)).toBe("DTS/OFR/2026/123");
  });

  it("signs technical papers as CTO and sales papers as CEO", () => {
    expect(SIGNATORY_TITLE.tech).toBe("CTO (Tech Admin)");
    expect(SIGNATORY_TITLE.sales).toBe("CEO (Sales Admin)");
  });
});

/**
 * The one invariant that cannot be checked by calling anything: the projection the server hands to
 * a candidate's browser must never learn to include a secret.
 *
 * `publicView` is inside a serverless function that initialises firebase-admin on import, so it
 * cannot be imported here. Reading the source is blunt, but it pins the thing that actually matters
 * — someone adding a field to that function and not noticing which one they added.
 */
describe("what the candidate's browser is allowed to know", () => {
  const source = readFileSync(resolve(__dirname, "../../api/onboarding.ts"), "utf8");
  const publicViewBody = source.slice(
    source.indexOf("function publicView"),
    source.indexOf("function generatePassword"),
  );

  it("has a projection to check", () => {
    expect(publicViewBody.length).toBeGreaterThan(200);
  });

  it("never sends the access code that guards the link", () => {
    expect(publicViewBody).not.toMatch(/accessCode/);
  });

  it("never sends the generated password", () => {
    expect(publicViewBody).not.toMatch(/generatedPassword/);
  });

  it("never sends the failure counters a brute-forcer would want to read", () => {
    expect(publicViewBody).not.toMatch(/failedAttempts|lockedUntil/);
  });

  it("still sends the two letters, which are the whole point of the page", () => {
    expect(publicViewBody).toMatch(/offerLetter/);
    expect(publicViewBody).toMatch(/joiningLetter/);
  });
});
