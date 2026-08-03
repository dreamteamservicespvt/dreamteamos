import { describe, it, expect } from "vitest";
import {
  DOCUMENT_REF_CODE, companyInitials, formatDocumentRef, refYear,
} from "@/utils/documentRef";
import { HR_DOCUMENT_ORDER } from "@/types/hr";
import { buildDocument } from "@/utils/hrTemplates";
import type { EmployeeProfile } from "@/types/hr";

/**
 * The reference a letter is known by.
 *
 * "The offer letter we sent in March" is not something anyone can look up; `DTS/OFR/2026/0007` is.
 * These end up printed on paper that outlives the code, so the parts that must never drift — the
 * per-type codes and the zero padding that keeps a series sorting correctly — are pinned here.
 */

describe("the shape of a reference", () => {
  it("reads company / document / year / number", () => {
    expect(formatDocumentRef("Dream Team Services", "offer_letter", 2026, 7))
      .toBe("DTS/OFR/2026/0007");
  });

  it("pads the sequence so the series sorts as text", () => {
    const refs = [1, 9, 10, 100].map((n) => formatDocumentRef("Dream Team Services", "nda", 2026, n));
    expect(refs).toEqual(["DTS/NDA/2026/0001", "DTS/NDA/2026/0009", "DTS/NDA/2026/0010", "DTS/NDA/2026/0100"]);
    expect([...refs].sort()).toEqual(refs);
  });

  it("does not truncate a number that outgrows the padding", () => {
    expect(formatDocumentRef("Dream Team Services", "nda", 2026, 12345)).toBe("DTS/NDA/2026/12345");
  });

  it("follows a change of company name", () => {
    expect(companyInitials("Dream Team Services")).toBe("DTS");
    expect(companyInitials("Dream Team Services Pvt Ltd")).toBe("DTSP");
    expect(companyInitials("Acme Co")).toBe("AC");
  });

  it("never produces an empty prefix, whatever the name is", () => {
    expect(companyInitials("")).toBe("DTS");
    expect(companyInitials("123 456")).toBe("DTS");
    expect(formatDocumentRef("", "offer_letter", 2026, 1)).toBe("DTS/OFR/2026/0001");
  });

  it("gives every document type its own code, and no two the same", () => {
    const codes = HR_DOCUMENT_ORDER.map((t) => DOCUMENT_REF_CODE[t]);
    expect(codes.every(Boolean)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("takes the year from the date printed on the letter, not from today", () => {
    expect(refYear("2024-03-11")).toBe(2024);
    expect(refYear(null)).toBe(new Date().getFullYear());
    expect(refYear("nonsense")).toBe(new Date().getFullYear());
  });
});

describe("the reference on the page", () => {
  const profile = {
    uid: "u1", department: "tech", stage: "probation", engagementType: "full_time",
    designation: "Software Developer", joiningDate: "2026-01-05", ctcMonthly: 25000,
  } as EmployeeProfile;

  const build = (referenceNo: string | null) => buildDocument({
    type: "appointment_letter",
    subject: { name: "Ravi Kumar", employeeId: "DTS-014" },
    profile,
    signatory: { name: "Asha Rao", designation: "Technical Head" },
    issuedOn: "2026-08-03",
    referenceNo,
  });

  it("prints the allocated reference under the title", () => {
    expect(build("DTS/APT/2026/0003").bodyText).toContain("Ref: DTS/APT/2026/0003");
  });

  it("prints no Ref line at all when there is no reference, rather than an empty one", () => {
    expect(build(null).bodyText).not.toMatch(/^Ref:/m);
  });

  it("lets an explicitly typed reference win over the allocated one", () => {
    // The offer letter has always had a hand-typed reference field. An admin who fills it in must
    // see exactly what they typed, not a series number quietly substituted for it.
    const { bodyText } = buildDocument({
      type: "offer_letter",
      subject: { name: "Ravi Kumar" },
      profile,
      signatory: { name: "Asha Rao", designation: "Technical Head" },
      issuedOn: "2026-08-03",
      referenceNo: "DTS/OFR/2026/0009",
      extras: { offerLetterNumber: "HAND/TYPED/1" },
    });
    expect(bodyText).toContain("Ref: HAND/TYPED/1");
    expect(bodyText).not.toContain("DTS/OFR/2026/0009");
  });
});
