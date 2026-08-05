import { describe, it, expect } from "vitest";
import { buildPublicBadge } from "@/services/publicBadge";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";

/**
 * What the whole internet may read about an employee.
 *
 * This is the one document in the system with no authentication in front of it — an ID card's QR
 * opens it in whatever phone scanned the badge. The expensive failure is not a stale field; it is
 * a field creeping in that belongs to the HR record. Everything here must already be printed on
 * the card the person handed over, so verification tells a stranger nothing new.
 */

const user = (over: Partial<AppUser> = {}): AppUser & { uid: string } =>
  ({ uid: "u1", name: "Asha Devi", role: "tech_member", employeeId: "DTS-005", isActive: true, ...over } as never);

const profile = (over: Partial<EmployeeProfile> = {}): Partial<EmployeeProfile> => ({
  department: "tech",
  designation: "AI Ad Creator",
  joiningDate: "2026-01-10",
  photoUrl: "https://cdn/photo.jpg",
  stage: "confirmed",
  ...over,
});

describe("what the public badge exposes", () => {
  it("carries only what is printed on the card", () => {
    const badge = buildPublicBadge(user(), profile());
    expect(Object.keys(badge).sort()).toEqual([
      "active", "department", "designation", "employeeId",
      "joiningDate", "lastWorkingDay", "name", "photoUrl",
    ]);
  });

  it("never leaks the identity documents, address, pay or contact details", () => {
    const badge = buildPublicBadge(
      user({ phone: "+919000000000", email: "asha@company.com" }),
      profile({
        pan: "ABCDE1234F",
        aadhaar: "111122223333",
        currentAddress: "Flat 4, MG Road",
        permanentAddress: "Door 12, Kakinada",
        ctcMonthly: 24000,
        personalEmail: "asha@example.com",
        emergencyContact: { name: "Ravi", relation: "Brother", phone: "+919111111111" },
        bloodGroup: "O+",
        dob: "1996-08-02",
      } as Partial<EmployeeProfile>),
    );
    const printed = JSON.stringify(badge);
    for (const secret of [
      "ABCDE1234F", "111122223333", "MG Road", "Kakinada", "24000",
      "asha@example.com", "asha@company.com", "+919000000000", "+919111111111",
      "O+", "1996-08-02",
    ]) {
      expect(printed).not.toContain(secret);
    }
  });
});

describe("whether the card is valid", () => {
  it("says employed for someone still on the team", () => {
    expect(buildPublicBadge(user(), profile()).active).toBe(true);
  });

  it("says not employed once the account is deactivated", () => {
    expect(buildPublicBadge(user({ isActive: false }), profile()).active).toBe(false);
  });

  it("says not employed once HR marks them exited, whatever the login says", () => {
    const badge = buildPublicBadge(user(), profile({ stage: "exited" }));
    expect(badge.active).toBe(false);
  });

  it("gives the last working day so an old card explains itself", () => {
    const badge = buildPublicBadge(user({ isActive: false }), profile({
      stage: "exited",
      separation: { lastWorkingDay: "2026-06-30" } as never,
    }));
    expect(badge.lastWorkingDay).toBe("2026-06-30");
  });

  it("treats someone serving notice as still employed — because they are", () => {
    expect(buildPublicBadge(user(), profile({ stage: "notice_period" })).active).toBe(true);
  });
});

describe("filling the gaps", () => {
  it("falls back to the avatar when there is no formal photograph", () => {
    const badge = buildPublicBadge(user({ avatar: "https://cdn/avatar.jpg" }), profile({ photoUrl: null }));
    expect(badge.photoUrl).toBe("https://cdn/avatar.jpg");
  });

  it("works for a member with no HR record at all", () => {
    const badge = buildPublicBadge(user(), null);
    expect(badge.name).toBe("Asha Devi");
    expect(badge.employeeId).toBe("DTS-005");
    expect(badge.department).toBe("Technology Department");
    expect(badge.active).toBe(true);
  });

  it("reads the department from the role when HR has not set one", () => {
    expect(buildPublicBadge(user({ role: "sales_member" }), null).department).toBe("Business Development Department");
    expect(buildPublicBadge(user({ role: "tech_team_leader" }), null).department).toBe("Technology Department");
  });
});
