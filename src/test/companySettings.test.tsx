import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * The company details stop being a constant in the source code.
 *
 * Moving office, adding an MSME registration or correcting a GSTIN used to need a developer and a
 * deploy, because the letterhead read a hardcoded object. It now reads `company_settings/main`, and
 * the two guarantees that matter are opposites of each other: what is stored must win, and what is
 * *not* stored must fall back to something real rather than printing a blank where a company name
 * should be.
 */

const { assets } = vi.hoisted(() => ({ assets: { current: {} as Record<string, unknown> } }));

vi.mock("@/services/companyAssets", async () => {
  const pure = await vi.importActual<typeof import("@/utils/company")>("@/utils/company");
  return {
    ...pure,
    watchCompanyAssets: (cb: (a: unknown) => void) => { cb(assets.current); return () => {}; },
    fetchCompanyAssets: async () => assets.current,
    saveCompanyAssets: vi.fn(),
  };
});

import AgreementView from "@/components/agreement/AgreementView";

const BODY = "APPOINTMENT LETTER\n\n1. Position\nYou are appointed as AI Ad Creator.\n";

beforeEach(() => { assets.current = {}; });
afterEach(cleanup);

describe("the letterhead reads Settings → Company Documents", () => {
  it("prints the stored name, address, contact details, GSTIN and MSME", () => {
    assets.current = {
      name: "Dream Team Services Pvt Ltd",
      address: ["Plot 9, New Street", "Kakinada", "Andhra Pradesh 533002"],
      website: "example.test",
      email: "hello@example.test",
      phone: "+91 90000 00000",
      gstin: "37AAAAA0000A1Z5",
      msme: "UDYAM-AP-05-0001234",
    };
    render(<AgreementView letterhead bodyText={BODY} memberName="Asha Devi" />);

    expect(screen.getAllByText(/Dream Team Services Pvt Ltd/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Plot 9, New Street/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/UDYAM-AP-05-0001234/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/37AAAAA0000A1Z5/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/hello@example\.test/).length).toBeGreaterThan(0);
  });

  it("shows GSTIN and MSME together on one line, not as two near-identical rows", () => {
    assets.current = { gstin: "37AAAAA0000A1Z5", msme: "UDYAM-AP-05-0001234" };
    render(<AgreementView letterhead bodyText={BODY} memberName="Asha Devi" />);
    expect(screen.getByText(/GSTIN: 37AAAAA0000A1Z5\s+·\s+MSME\/Udyam: UDYAM-AP-05-0001234/)).toBeInTheDocument();
  });

  it("omits the MSME line entirely when there is none, rather than printing an empty label", () => {
    assets.current = { gstin: "37AAAAA0000A1Z5" };
    render(<AgreementView letterhead bodyText={BODY} memberName="Asha Devi" />);
    expect(screen.queryByText(/MSME/)).not.toBeInTheDocument();
  });

  it("falls back to the built-in company when Settings has never been filled in", () => {
    assets.current = {};
    render(<AgreementView letterhead bodyText={BODY} memberName="Asha Devi" />);
    // A letterhead with no company name on it is worse than a stale one.
    expect(screen.getAllByText(/Dream Team Services/).length).toBeGreaterThan(0);
  });

  it("keeps the rest of the letterhead when only one field is stored", () => {
    // The half-filled case: an admin saves an MSME number and nothing else. The address must not
    // vanish from every letter in the app as a side effect.
    assets.current = { msme: "UDYAM-AP-05-0001234" };
    render(<AgreementView letterhead bodyText={BODY} memberName="Asha Devi" />);
    expect(screen.getAllByText(/UDYAM-AP-05-0001234/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Vishnalayam Street/).length).toBeGreaterThan(0);
  });

  it("stays off documents that are somebody else's text reproduced verbatim", () => {
    assets.current = { msme: "UDYAM-AP-05-0001234" };
    render(<AgreementView bodyText={BODY} memberName="Asha Devi" />);
    expect(screen.queryByText(/UDYAM/)).not.toBeInTheDocument();
    expect(screen.queryByText(/computer-generated document/i)).not.toBeInTheDocument();
  });
});
