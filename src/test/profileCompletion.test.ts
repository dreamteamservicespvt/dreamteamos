import { describe, it, expect } from "vitest";
import {
  PROFILE_STEPS, joinName, needsProfilePrompt, profileCompletion, profilePromptDismissedKey,
  splitName,
} from "@/utils/profileCompletion";
import type { AppUser } from "@/types";
import type { EmployeeProfile, KycDocument } from "@/types/hr";

/**
 * What the company still needs from an employee.
 *
 * This drives a popup that appears every single day until it is satisfied, which makes two
 * failures unusually expensive: saying something is missing when it is not (an employee is nagged
 * forever and stops reading it), and saying it is complete when it is not (nobody is ever asked
 * again). Both are decided here.
 */

const doc = (kind: KycDocument["kind"]): KycDocument => ({
  id: `${kind}-1`, kind, label: `${kind}.jpg`, url: `https://cdn/${kind}.jpg`,
  uploadedAt: null as never, uploadedByName: "Asha",
});

const FULL: EmployeeProfile = {
  uid: "u1",
  department: "sales",
  stage: "confirmed",
  surname: "Devi",
  photoUrl: "https://cdn/photo.jpg",
  personalEmail: "asha@example.com",
  dob: "1996-08-02",
  bloodGroup: "O+",
  currentAddress: "Flat 4, MG Road, Hyderabad 500001",
  permanentAddress: "Door 12, Kakinada 533001",
  emergencyContact: { name: "Ravi", relation: "Brother", phone: "+919000000000" },
  pan: "ABCDE1234F",
  aadhaar: "111122223333",
  kycDocuments: [doc("pan"), doc("aadhaar")],
};

const member = (over: Partial<AppUser> = {}) =>
  ({ uid: "u1", name: "Asha Devi", role: "sales_member", isActive: true, ...over } as AppUser);

describe("the checklist itself", () => {
  it("asks for every item the company requires, each exactly once", () => {
    expect(PROFILE_STEPS.map((s) => s.key)).toEqual([
      "fullName", "photo", "personalEmail", "dob", "bloodGroup",
      "currentAddress", "permanentAddress", "emergencyContact",
      "pan", "panCard", "aadhaar", "aadhaarCard",
    ]);
    expect(new Set(PROFILE_STEPS.map((s) => s.key)).size).toBe(PROFILE_STEPS.length);
  });

  it("leaves the identity documents until last, so the form is not abandoned at step one", () => {
    const keys = PROFILE_STEPS.map((s) => s.key);
    expect(keys.indexOf("panCard")).toBeGreaterThan(keys.indexOf("photo"));
    expect(keys.indexOf("aadhaarCard")).toBe(keys.length - 1);
  });

  it("gives every step a reason, not just a name", () => {
    for (const step of PROFILE_STEPS) expect(step.hint.length).toBeGreaterThan(10);
  });
});

describe("what is still missing", () => {
  it("is complete when everything is on file", () => {
    const c = profileCompletion(member(), FULL);
    expect(c.complete).toBe(true);
    expect(c.done).toBe(PROFILE_STEPS.length);
    expect(c.percent).toBe(100);
    expect(c.missing).toEqual([]);
  });

  it("treats a brand-new employee with no record as missing everything", () => {
    // Not an error — just their first day. It must not throw on a null profile.
    const c = profileCompletion(member(), null);
    expect(c.done).toBe(0);
    expect(c.percent).toBe(0);
    expect(c.missing).toHaveLength(PROFILE_STEPS.length);
  });

  it("asks for the surname even though the account already has a name", () => {
    // An account name is one free-text string; a payslip needs to know where the given name ends.
    const c = profileCompletion(member({ name: "Asha Devi" }), { ...FULL, surname: null });
    expect(c.missing.map((s) => s.key)).toEqual(["fullName"]);
  });

  it("wants both addresses, not one standing in for the other", () => {
    const c = profileCompletion(member(), { ...FULL, permanentAddress: null });
    expect(c.missing.map((s) => s.key)).toEqual(["permanentAddress"]);
  });

  it("wants a name and a relationship on the emergency contact, not just a number", () => {
    // A number nobody can put a name to is not something anyone would dial in an emergency.
    const bare = { ...FULL, emergencyContact: { name: "", relation: "", phone: "+919000000000" } };
    expect(profileCompletion(member(), bare).missing.map((s) => s.key)).toEqual(["emergencyContact"]);

    const noRelation = { ...FULL, emergencyContact: { name: "Ravi", relation: "", phone: "+919000000000" } };
    expect(profileCompletion(member(), noRelation).missing.map((s) => s.key)).toEqual(["emergencyContact"]);
  });

  it("asks for the card file even when the number has been typed in", () => {
    const c = profileCompletion(member(), { ...FULL, kycDocuments: [] });
    const missing = c.missing.map((s) => s.key);
    expect(missing).toContain("panCard");
    expect(missing).toContain("aadhaarCard");
    expect(missing).not.toContain("pan");
    expect(missing).not.toContain("aadhaar");
  });

  it("does not accept a PAN scan as an Aadhaar scan", () => {
    const c = profileCompletion(member(), { ...FULL, kycDocuments: [doc("pan")] });
    expect(c.missing.map((s) => s.key)).toEqual(["aadhaarCard"]);
  });

  it("ignores whitespace typed into a field", () => {
    // "   " in the address box must not count as an address on file.
    const c = profileCompletion(member(), { ...FULL, currentAddress: "   ", bloodGroup: " " });
    expect(c.missing.map((s) => s.key).sort()).toEqual(["bloodGroup", "currentAddress"]);
  });

  it("needs a reachable number for the emergency contact, not just a name", () => {
    const c = profileCompletion(member(), {
      ...FULL,
      emergencyContact: { name: "Ravi", relation: "Brother", phone: "" },
    });
    expect(c.missing.map((s) => s.key)).toEqual(["emergencyContact"]);
  });

  it("counts an existing avatar as the photo", () => {
    const noPhoto = { ...FULL, photoUrl: null };
    expect(profileCompletion(member(), noPhoto).missing.map((s) => s.key)).toEqual(["photo"]);
    expect(profileCompletion(member({ avatar: "https://cdn/a.jpg" }), noPhoto).complete).toBe(true);
  });
});

describe("splitting a stored name into name and surname", () => {
  it("pre-fills both boxes from a two-word name, so it is a glance and a Save", () => {
    expect(splitName("Asha Devi")).toEqual({ given: "Asha", surname: "Devi" });
  });

  it("treats only the last word as the surname on a longer name", () => {
    expect(splitName("Asha Lakshmi Devi")).toEqual({ given: "Asha Lakshmi", surname: "Devi" });
  });

  it("asks properly when the account holds only one word", () => {
    expect(splitName("Asha")).toEqual({ given: "Asha", surname: "" });
  });

  it("lets a recorded surname win over the guess", () => {
    // The employee chose where the split falls; a two-word surname is not guessable.
    expect(splitName("Asha Lakshmi Devi", "Lakshmi Devi")).toEqual({ given: "Asha", surname: "Lakshmi Devi" });
  });

  it("does not chop the name when the recorded surname is not on the end of it", () => {
    expect(splitName("Asha Devi", "Rao")).toEqual({ given: "Asha Devi", surname: "Rao" });
  });

  it("survives a blank or messy stored name", () => {
    expect(splitName("")).toEqual({ given: "", surname: "" });
    expect(splitName(null)).toEqual({ given: "", surname: "" });
    expect(splitName("  Asha   Devi  ")).toEqual({ given: "Asha", surname: "Devi" });
  });

  it("round-trips: what is split apart joins back to the same name", () => {
    for (const name of ["Asha Devi", "Asha", "Asha Lakshmi Devi"]) {
      const { given, surname } = splitName(name);
      expect(joinName(given, surname)).toBe(name);
    }
  });

  it("never produces a double space or a trailing one", () => {
    expect(joinName("Asha", "")).toBe("Asha");
    expect(joinName("", "Devi")).toBe("Devi");
    expect(joinName("  Asha  ", "  Devi  ")).toBe("Asha Devi");
  });
});

describe("who gets asked", () => {
  it("asks employees", () => {
    expect(needsProfilePrompt(member({ role: "sales_member" }))).toBe(true);
    expect(needsProfilePrompt(member({ role: "tech_member" }))).toBe(true);
    expect(needsProfilePrompt(member({ role: "tech_team_leader" }))).toBe(true);
  });

  it("does not ask admins, who have no employment record to complete", () => {
    expect(needsProfilePrompt(member({ role: "main_admin" }))).toBe(false);
    expect(needsProfilePrompt(member({ role: "tech_admin" }))).toBe(false);
    expect(needsProfilePrompt(member({ role: "sales_admin" }))).toBe(false);
    expect(needsProfilePrompt(member({ role: "accounts_admin" }))).toBe(false);
  });

  it("does not ask external creators, who are not staff", () => {
    expect(needsProfilePrompt(member({ role: "tech_member", externalCreator: true }))).toBe(false);
  });

  it("does not ask when nobody is signed in", () => {
    expect(needsProfilePrompt(null)).toBe(false);
    expect(needsProfilePrompt(undefined)).toBe(false);
  });
});

describe("'I'll do it later'", () => {
  it("means today, not forever", () => {
    // A single undated flag would be a permanent dismissal — the one behaviour this must not have.
    expect(profilePromptDismissedKey("u1", "2026-08-02")).not.toBe(profilePromptDismissedKey("u1", "2026-08-03"));
  });

  it("is one person's decision, not everyone's on that browser", () => {
    expect(profilePromptDismissedKey("u1", "2026-08-02")).not.toBe(profilePromptDismissedKey("u2", "2026-08-02"));
  });

  it("is stable for the same person on the same day", () => {
    expect(profilePromptDismissedKey("u1", "2026-08-02")).toBe(profilePromptDismissedKey("u1", "2026-08-02"));
  });
});
