import { describe, it, expect } from "vitest";
import { buildIdCard, prettyDate, provisionalEmployeeId } from "@/utils/idCard";
import { idCardFilename } from "@/utils/idCardExport";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";

/**
 * Every member gets an ID card — including the ones the HR module has never heard of.
 *
 * That is the whole difficulty of this feature and the only part worth testing: the card must be
 * complete for someone onboarded properly AND for someone who has only ever had a login, and it
 * must never print "undefined" onto something a person is asked to carry.
 */

const member: AppUser = {
  uid: "abc123XYZ",
  name: "Asha Devi",
  email: "asha@example.com",
  phone: "+919876543210",
  role: "sales_member",
  isActive: true,
} as AppUser;

const profile: EmployeeProfile = {
  uid: "abc123XYZ",
  department: "sales",
  stage: "confirmed",
  designation: "Senior Sales Executive",
  joiningDate: "2024-03-14",
  bloodGroup: "O+",
  photoUrl: "https://cdn.example.com/asha.jpg",
  emergencyContact: { name: "Ravi Devi", relation: "Brother", phone: "+919000000000" },
};

describe("buildIdCard", () => {
  it("prefers the assigned employee ID over anything generated", () => {
    const card = buildIdCard({ ...member, employeeId: "DTS-014" }, profile);
    expect(card.employeeId).toBe("DTS-014");
    expect(card.employeeIdIsProvisional).toBe(false);
  });

  it("stands in a stable number when nobody has assigned one", () => {
    const card = buildIdCard(member, profile);
    expect(card.employeeIdIsProvisional).toBe(true);
    expect(card.employeeId).toBe(provisionalEmployeeId(member.uid));
    // Stable across calls — the same person must not get a new card number each time they look.
    expect(buildIdCard(member, profile).employeeId).toBe(card.employeeId);
  });

  it("builds a complete card for a member with no HR record at all", () => {
    const card = buildIdCard(member, null);
    expect(card.name).toBe("Asha Devi");
    // Falls back to the role's own label rather than leaving the line blank.
    expect(card.designation).toBe("Sales Executive");
    expect(card.department).toBe("Sales");
    expect(card.employeeId).toMatch(/^DTS-/);
    // Nothing invented: what isn't known is null, and the card omits those rows.
    expect(card.bloodGroup).toBeNull();
    expect(card.joinedOn).toBeNull();
    expect(card.emergencyContact).toBeNull();
  });

  it("takes the HR photograph when there is one, and the avatar when there isn't", () => {
    expect(buildIdCard(member, profile).photoUrl).toBe("https://cdn.example.com/asha.jpg");
    expect(buildIdCard({ ...member, avatar: "https://cdn/a.jpg" }, null).photoUrl).toBe("https://cdn/a.jpg");
    expect(buildIdCard(member, null).photoUrl).toBeNull();
  });

  it("reads the joining date as a person would", () => {
    expect(buildIdCard(member, profile).joinedOn).toBe("14 Mar 2024");
  });

  it("spells out who to call in an emergency", () => {
    expect(buildIdCard(member, profile).emergencyContact).toBe("Ravi Devi (Brother) · +919000000000");
  });

  it("puts an expiry on the card of someone serving notice", () => {
    const leaving = { ...profile, separation: { lastWorkingDay: "2026-09-30" } } as EmployeeProfile;
    expect(buildIdCard(member, leaving).validUntil).toBe("30 Sep 2026");
    expect(buildIdCard(member, profile).validUntil).toBeNull();
  });

  it("puts a tech member in the technology department", () => {
    const dev = { ...member, role: "tech_member" } as AppUser;
    expect(buildIdCard(dev, null).department).toBe("Technology");
  });
});

describe("prettyDate", () => {
  it("drops anything it cannot read rather than printing it raw", () => {
    expect(prettyDate("")).toBeNull();
    expect(prettyDate(null)).toBeNull();
    expect(prettyDate("2024")).toBeNull();
  });
});

describe("idCardFilename", () => {
  it("makes a file name out of a person's name", () => {
    expect(idCardFilename("Asha Devi", "png")).toBe("Asha_Devi_ID_Card.png");
  });

  it("survives a name that is all punctuation", () => {
    expect(idCardFilename("!!!", "pdf")).toBe("employee_ID_Card.pdf");
  });
});
