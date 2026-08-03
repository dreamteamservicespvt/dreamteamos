import { describe, it, expect } from "vitest";
import { findMissingLetters } from "@/utils/missingLetters";
import { nextEmployeeId, employeeIdNumber, formatEmployeeId } from "@/utils/employeeId";
import type { AppUser } from "@/types";
import type { EmployeeProfile, HrDocument } from "@/types/hr";

/**
 * Backfilling letters to a team that was hired before the app issued any.
 *
 * The expensive mistake here is not missing somebody — it is issuing a letter built from an empty
 * employment record, because that prints a blank salary and joining date under an admin's real
 * signature and lands in the employee's account instantly. So anyone whose terms are incomplete is
 * surfaced with the reason and left alone.
 */

const member = (uid: string, over: Partial<AppUser> = {}): AppUser =>
  ({ uid, name: uid, role: "tech_member", isActive: true, ...over } as AppUser);

const profile = (uid: string, over: Partial<EmployeeProfile> = {}): EmployeeProfile =>
  ({
    uid, department: "tech", stage: "confirmed",
    designation: "AI Ad Creator", joiningDate: "2026-01-10", ctcMonthly: 12000,
    ...over,
  } as EmployeeProfile);

const issued = (memberId: string, type: HrDocument["type"]): HrDocument =>
  ({ id: `${memberId}-${type}`, memberId, type, status: "issued" } as HrDocument);

describe("who is missing their letters", () => {
  it("lists everyone holding neither letter", () => {
    const rows = findMissingLetters(
      [member("asha"), member("ravi")],
      new Map([["asha", profile("asha")], ["ravi", profile("ravi")]]),
      [],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].missing).toEqual(["offer_letter", "appointment_letter"]);
    expect(rows[0].blockers).toEqual([]);
  });

  it("asks only for the one a person is actually missing", () => {
    const rows = findMissingLetters(
      [member("asha")],
      new Map([["asha", profile("asha")]]),
      [issued("asha", "offer_letter")],
    );
    expect(rows[0].missing).toEqual(["appointment_letter"]);
  });

  it("leaves out anyone who already holds both", () => {
    const rows = findMissingLetters(
      [member("asha")],
      new Map([["asha", profile("asha")]]),
      [issued("asha", "offer_letter"), issued("asha", "appointment_letter")],
    );
    expect(rows).toHaveLength(0);
  });

  it("blocks a letter that would print a blank salary or joining date", () => {
    const rows = findMissingLetters(
      [member("asha"), member("ravi"), member("kiran")],
      new Map([
        ["asha", profile("asha", { ctcMonthly: null })],
        ["ravi", profile("ravi", { joiningDate: null })],
        // kiran has no employment record at all
      ]),
      [],
    );
    const by = Object.fromEntries(rows.map((r) => [r.member.uid, r.blockers]));
    expect(by.asha).toContain("no salary");
    expect(by.ravi).toContain("no joining date");
    expect(by.kiran).toContain("no employment record");
  });

  it("counts a salary of zero as a real answer, not a missing one", () => {
    // An unpaid intern is a legitimate engagement; a blank field is the thing to catch.
    const rows = findMissingLetters(
      [member("asha")],
      new Map([["asha", profile("asha", { ctcMonthly: 0 })]]),
      [],
    );
    expect(rows[0].blockers).toEqual([]);
  });

  it("ignores people who have left and outside creators", () => {
    const rows = findMissingLetters(
      [member("gone", { isActive: false }), member("vendor", { externalCreator: true })],
      new Map(),
      [],
    );
    expect(rows).toHaveLength(0);
  });
});

describe("employee numbers", () => {
  it("reads our own format and ignores anything else", () => {
    expect(employeeIdNumber("DTS-014")).toBe(14);
    expect(employeeIdNumber("dts 7")).toBe(7);
    expect(employeeIdNumber("EMP-014")).toBe(0);
    expect(employeeIdNumber(null)).toBe(0);
  });

  it("always writes three digits, so a column of them lines up", () => {
    expect(formatEmployeeId(3)).toBe("DTS-003");
    expect(formatEmployeeId(35)).toBe("DTS-035");
    expect(formatEmployeeId(120)).toBe("DTS-120");
  });

  it("resumes past the numbers spent on people who came and went", () => {
    // The team is numbered to 023 on paper; numbering restarts clear of the gap.
    const team = ["DTS-003", "DTS-014", "DTS-023", null, "", "not-an-id"];
    expect(nextEmployeeId(team)).toBe("DTS-035");
  });

  it("keeps counting once the floor is passed", () => {
    expect(nextEmployeeId(["DTS-035"])).toBe("DTS-036");
    expect(nextEmployeeId(["DTS-035", "DTS-041"])).toBe("DTS-042");
  });

  it("never proposes a number somebody already holds", () => {
    const team = ["DTS-100", "DTS-099"];
    expect(nextEmployeeId(team)).toBe("DTS-101");
  });
});
