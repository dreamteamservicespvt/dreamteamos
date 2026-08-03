import { describe, it, expect, afterEach } from "vitest";
import { cleanup, configure, render, screen } from "@testing-library/react";
import AgreementView from "@/components/agreement/AgreementView";
import { DOCUMENT_SIGNATORIES, canIssue, resolveSignatories } from "@/utils/hrPolicy";
import { officerOf, resolveCompany, type CompanyAssets } from "@/utils/company";
import { buildDocument } from "@/utils/hrTemplates";
import { HR_DOCUMENT_ORDER } from "@/types/hr";
import type { EmployeeProfile } from "@/types/hr";

/**
 * Who signs the company's letters, and whether their signature actually lands on the page.
 *
 * The company signs its own paperwork: an offer letter carries the CEO's signature whichever admin
 * generated it, and the NDA carries the CTO's as well, because it is the CTO who is affirming what
 * counts as confidential technical material. The rule is worth pinning because the failure mode is
 * silent — a letter renders perfectly, goes out, and simply has no signature on it.
 */

configure({ testIdAttribute: "data-test" });
afterEach(cleanup);

const assets: CompanyAssets = {
  name: "Dream Team Services",
  ceoName: "G. Govardhan",
  ceoDesignation: "Chief Executive Officer",
  ceoSignatureUrl: "https://cdn.test/ceo.png",
  ctoName: "Asha Rao",
  ctoDesignation: "Chief Technology Officer",
  ctoSignatureUrl: "https://cdn.test/cto.png",
};

const officers = (a: CompanyAssets) => ({ ceo: officerOf(a, "ceo"), cto: officerOf(a, "cto") });

const issuer = { name: "Ravi Kumar", designation: "Sales Admin", signatureUrl: "https://cdn.test/ravi.png" };

const profile = {
  uid: "m1", department: "tech", stage: "probation",
  designation: "AI Ad Creator", joiningDate: "2026-01-05", ctcMonthly: 25000,
  engagementType: "full_time",
} as EmployeeProfile;

const build = (type: Parameters<typeof buildDocument>[0]["type"], a: CompanyAssets = assets) =>
  buildDocument({
    type,
    subject: { name: "Asha Devi", employeeId: "DTS-014" },
    profile,
    signatory: resolveSignatories(type, officers(a), issuer),
    issuedOn: "2026-08-03",
    company: resolveCompany(a),
  });

describe("which office signs which letter", () => {
  it("puts BOTH officers on every document the company issues", () => {
    for (const type of HR_DOCUMENT_ORDER) {
      expect(resolveSignatories(type, officers(assets), issuer).map((s) => s.key), type)
        .toEqual(["ceo", "cto"]);
    }
  });

  it("names them in a fixed order, so two letters never disagree about who signs first", () => {
    const signers = resolveSignatories("offer_letter", officers(assets), issuer);
    expect(signers[0].name).toBe("G. Govardhan");
    expect(signers[1].name).toBe("Asha Rao");
  });

  it("falls back to the issuing admin when no office has a signature on file", () => {
    const signers = resolveSignatories("offer_letter", officers({}), issuer);
    expect(signers).toEqual([{
      key: "issuer", name: "Ravi Kumar", designation: "Sales Admin", signatureUrl: "https://cdn.test/ravi.png",
    }]);
  });

  it("signs with whoever IS configured when only one office has a signature on file", () => {
    const ceoOnly = { ...assets, ctoName: null, ctoSignatureUrl: null };
    expect(resolveSignatories("nda", officers(ceoOnly), issuer).map((s) => s.key)).toEqual(["ceo"]);
  });

  it("refuses to issue when nobody at all can sign", () => {
    const nobody = resolveSignatories("offer_letter", officers({}), { name: "Ravi", designation: "Admin" });
    expect(canIssue(nobody, "offer_letter")).toBe(false);
  });

  it("issues once at least one office can sign", () => {
    const ceoOnly = { ...assets, ctoName: null, ctoSignatureUrl: null };
    expect(canIssue(resolveSignatories("offer_letter", officers(ceoOnly), issuer), "offer_letter")).toBe(true);
  });

  it("names an office for every document type, so none can be issued unsigned by accident", () => {
    for (const type of HR_DOCUMENT_ORDER) {
      expect(DOCUMENT_SIGNATORIES[type], type).toBeDefined();
      expect(DOCUMENT_SIGNATORIES[type].length, type).toBeGreaterThan(0);
    }
  });
});

describe("the signature actually landing on the page", () => {
  /**
   * The regression this file exists for.
   *
   * The company block used to read "For <company> — Authorised Signatory Signature:" and the
   * renderer decided a line was company-side by looking for the word "signatory". Naming the real
   * office instead ("Chief Executive Officer") made that test fail, and a failed test there does
   * not throw — it quietly renders an empty ruled box where the signature should be.
   */
  it("renders the CEO's signature image, not an empty ruled box", () => {
    const { bodyText } = build("offer_letter");
    render(
      <AgreementView
        bodyText={bodyText}
        memberName="Asha Devi"
        companySignatories={resolveSignatories("offer_letter", officers(assets), issuer)}
        companySignedDate="2026-08-03"
      />,
    );
    const signatures = screen.getAllByAltText("signature") as HTMLImageElement[];
    expect(signatures.map((i) => i.src)).toContain("https://cdn.test/ceo.png");
    // Exactly one ruled box is expected — the employee has not signed yet. The bug this pins
    // produced extra ones, where the company's signatures should have been.
    expect(screen.getAllByText(/Awaiting signature/)).toHaveLength(1);
  });

  it("renders two different signatures on an NDA, in the order the letter names them", () => {
    const { bodyText } = build("nda");
    render(
      <AgreementView
        bodyText={bodyText}
        memberName="Asha Devi"
        companySignatories={resolveSignatories("nda", officers(assets), issuer)}
        companySignedDate="2026-08-03"
      />,
    );
    const srcs = (screen.getAllByAltText("signature") as HTMLImageElement[]).map((i) => i.src);
    expect(srcs).toContain("https://cdn.test/ceo.png");
    expect(srcs).toContain("https://cdn.test/cto.png");
    expect(srcs.indexOf("https://cdn.test/ceo.png")).toBeLessThan(srcs.indexOf("https://cdn.test/cto.png"));
  });

  it("presses the seal once, not once per signature", () => {
    const { bodyText } = build("nda");
    const { container } = render(
      <AgreementView
        bodyText={bodyText}
        memberName="Asha Devi"
        companySignatories={resolveSignatories("nda", officers(assets), issuer)}
        companyStampUrl="https://cdn.test/stamp.png"
      />,
    );
    expect(container.querySelectorAll("img[data-stamp]")).toHaveLength(1);
  });

  it("still renders documents issued before offices existed, from the single old field", () => {
    render(
      <AgreementView
        bodyText={"OFFER\n\nFor Dream Team Services — Authorised Signatory Signature:\nName: Ravi Kumar"}
        memberName="Asha Devi"
        companySignatureUrl="https://cdn.test/legacy.png"
        companySignedName="Ravi Kumar"
        companyDesignation="Sales Admin"
      />,
    );
    const srcs = (screen.getAllByAltText("signature") as HTMLImageElement[]).map((i) => i.src);
    expect(srcs).toContain("https://cdn.test/legacy.png");
  });
});

describe("the company on the letter", () => {
  it("prints the name from Settings, not the built-in default", () => {
    const { bodyText } = build("offer_letter", { ...assets, name: "Dream Team Services Pvt Ltd" });
    expect(bodyText).toContain("DREAM TEAM SERVICES PVT LTD");
    expect(bodyText).toContain("at Dream Team Services Pvt Ltd");
  });

  it("falls back to the built-in name when Settings has never been filled in", () => {
    const { bodyText } = build("offer_letter", {});
    expect(bodyText).toContain("DREAM TEAM SERVICES");
  });
});
