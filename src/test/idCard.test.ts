import { describe, it, expect } from "vitest";
import { buildIdCard, fitBox, idCardNameSize, prettyDate, provisionalEmployeeId, PHOTO_BOX } from "@/utils/idCard";
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
    expect(card.department).toBe("Business Development Department");
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
    expect(buildIdCard(dev, null).department).toBe("Technology Department");
  });
});

/**
 * The card carries the full name, and gives way to it.
 *
 * An initialled short form ("R.Govardhan") was tried and withdrawn: a badge is checked against
 * other documents, and a name that does not match the one on them is worse than a name set in
 * smaller type. So the type size steps down instead of the name being cut.
 */
describe("idCardNameSize", () => {
  it("sets a short name large", () => {
    expect(idCardNameSize("Asha Devi").fontSize).toBe(19);
  });

  it("steps down as the name gets longer", () => {
    const sizes = [
      idCardNameSize("Asha Devi"),
      idCardNameSize("Govardhan Rajulapati"),
      idCardNameSize("Govardhan Sai Rajulapati"),
      idCardNameSize("Chodisetti Siva Naga Satyanarayana"),
    ].map((s) => s.fontSize);
    // Monotonically decreasing — never a longer name in bigger type than a shorter one.
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(new Set(sizes).size).toBeGreaterThan(1);
  });

  it("keeps the longest real name readable rather than shrinking without limit", () => {
    expect(idCardNameSize("Chodisetti Siva Naga Satyanarayana Murthy").fontSize).toBeGreaterThanOrEqual(12);
  });

  it("always leaves the line taller than the type", () => {
    for (const n of ["A", "Asha Devi", "Chodisetti Siva Naga Satyanarayana"]) {
      const { fontSize, lineHeight } = idCardNameSize(n);
      expect(lineHeight, n).toBeGreaterThan(fontSize);
    }
  });

  it("survives an empty name", () => {
    expect(idCardNameSize("").fontSize).toBeGreaterThan(0);
  });
});

describe("what the card puts on each face", () => {
  it("prints the full name, never an abbreviation of it", () => {
    const card = buildIdCard(
      { ...member, name: "Chodisetti Siva Naga Satyanarayana" },
      { ...profile, surname: "Chodisetti" },
    );
    expect(card.name).toBe("Chodisetti Siva Naga Satyanarayana");
  });

  /**
   * The card outlives the job and is shown to people outside the company, so the address on it
   * should be one that still reaches the person once the work login is revoked.
   */
  it("prefers the personal email over the work login", () => {
    expect(buildIdCard(member, { ...profile, personalEmail: "asha.personal@gmail.com" }).email)
      .toBe("asha.personal@gmail.com");
    expect(buildIdCard(member, profile).email).toBe("asha@example.com");
  });

  it("names the department the employee is actually in, not the team that runs them", () => {
    expect(buildIdCard(member, { ...profile, orgUnit: "creative" }).department).toBe("Creative Department");
    expect(buildIdCard(member, { ...profile, orgUnit: "marketing" }).department).toBe("Marketing Department");
    // Nothing chosen falls back to the department's own default.
    expect(buildIdCard(member, profile).department).toBe("Business Development Department");
  });
});

describe("prettyDate", () => {
  it("drops anything it cannot read rather than printing it raw", () => {
    expect(prettyDate("")).toBeNull();
    expect(prettyDate(null)).toBeNull();
    expect(prettyDate("2024")).toBeNull();
  });
});

/**
 * The arithmetic that keeps the downloaded card identical to the one on screen.
 *
 * html2canvas — which makes the PNG and the PDF — does not implement `object-fit`: it stretches an
 * image to whatever box the layout gave it. So the logo and the signatures are given a box of their
 * own aspect ratio instead of being asked to fit one, and the photograph is cropped in pixels to
 * the photo box's aspect before it is ever rendered.
 */
describe("fitBox", () => {
  it("fits a wide image by its width, leaving height to follow", () => {
    expect(fitBox({ width: 600, height: 150 }, 120, 40)).toEqual({ width: 120, height: 30 });
  });

  it("fits a tall image by its height", () => {
    expect(fitBox({ width: 150, height: 600 }, 120, 40)).toEqual({ width: 10, height: 40 });
  });

  it("never returns a box of a different aspect than the picture", () => {
    const natural = { width: 1024, height: 331 };
    const box = fitBox(natural, 132, 40);
    expect(box.width / box.height).toBeCloseTo(natural.width / natural.height, 1);
  });

  it("never scales a small image up past its box", () => {
    expect(fitBox({ width: 40, height: 20 }, 120, 40)).toEqual({ width: 80, height: 40 });
  });

  it("falls back to the full box for an image it could not measure", () => {
    expect(fitBox(null, 120, 40)).toEqual({ width: 120, height: 40 });
    expect(fitBox({ width: 0, height: 0 }, 120, 40)).toEqual({ width: 120, height: 40 });
  });
});

describe("the photo box", () => {
  it("is a portrait ID photograph, and a large one", () => {
    // 4:5 — the shape of a real ID photo, not the square an avatar defaults to.
    expect(PHOTO_BOX.width / PHOTO_BOX.height).toBeCloseTo(0.8, 2);
    // Comfortably larger than the 100px circle it replaced: the face is what a badge is checked on.
    expect(PHOTO_BOX.height).toBeGreaterThan(150);
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
