import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Hiring someone, from the admin's side.
 *
 * The form is the only place the terms of an offer are ever typed, and what it produces is signed
 * by the admin the moment it is created. So the two things that matter here are that it refuses to
 * produce a letter it cannot properly sign, and that what the admin previews is what the candidate
 * will read.
 */

const { createInvite, nextOfferSequence } = vi.hoisted(() => ({
  createInvite: vi.fn().mockResolvedValue({
    id: "abc123xyz9",
    accessCode: "4821",
    url: "https://dts.test/join/abc123xyz9",
  }),
  nextOfferSequence: vi.fn().mockResolvedValue(7),
}));

vi.mock("@/services/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/onboarding")>()),
  createInvite,
  nextOfferSequence,
}));

import OnboardInviteModal from "@/components/onboarding/OnboardInviteModal";
import type { AppUser } from "@/types";

configure({ testIdAttribute: "data-test" });

const admin = (over: Partial<AppUser> = {}): AppUser => ({
  uid: "a1", email: "asha@dts.test", name: "Asha Rao", role: "tech_admin",
  createdBy: "", isActive: true, salary: 0, target: 0, phone: "+919000000000",
  signatureUrl: "https://cdn.test/asha.png",
  createdAt: null, updatedAt: null,
  ...over,
});

const open = (signatory: AppUser = admin()) =>
  render(
    <MemoryRouter>
      <OnboardInviteModal
        department="tech"
        signatory={signatory}
        roleOptions={[
          { value: "tech_member", label: "Tech Member" },
          { value: "tech_team_leader", label: "Tech Team Leader" },
        ]}
        settingsPath="/tech-admin/settings"
        onClose={() => {}}
      />
    </MemoryRouter>,
  );

/** Fill in the minimum a letter cannot be written without. */
const fillRequired = () => {
  fireEvent.change(screen.getByTestId("invite-name"), { target: { value: "Ravi Kumar" } });
  fireEvent.change(screen.getByTestId("invite-email"), { target: { value: "Ravi@Example.com " } });
  fireEvent.change(screen.getByTestId("invite-designation"), { target: { value: "Video Editor" } });
  fireEvent.change(screen.getByTestId("invite-ctc"), { target: { value: "25000" } });
  fireEvent.change(screen.getByTestId("invite-phone"), { target: { value: "9876543210" } });
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("before a letter can be sent", () => {
  it("refuses to issue anything until the admin has a signature on file", () => {
    open(admin({ signatureUrl: null }));
    expect(screen.getByTestId("invite-no-signature")).toBeInTheDocument();
    expect(screen.getByTestId("invite-submit")).toBeDisabled();
  });

  it("issues freely once a signature exists", () => {
    open();
    expect(screen.queryByTestId("invite-no-signature")).not.toBeInTheDocument();
    expect(screen.getByTestId("invite-submit")).not.toBeDisabled();
  });

  it("says who the letters will be signed as", () => {
    open();
    expect(screen.getByText(/Signed as Asha Rao · CTO \(Tech Admin\)/)).toBeInTheDocument();
  });

  it("prefers the admin's own designation when they have set one", () => {
    open(admin({ designation: "Head of Engineering" }));
    expect(screen.getByText(/Signed as Asha Rao · Head of Engineering/)).toBeInTheDocument();
  });
});

describe("what the admin previews is what the candidate reads", () => {
  it("shows the offer letter built from the terms typed so far", async () => {
    open();
    fillRequired();
    fireEvent.click(screen.getByText("Preview offer"));
    const preview = await screen.findByTestId("invite-preview");
    expect(preview).toHaveTextContent("OFFER OF EMPLOYMENT");
    expect(preview).toHaveTextContent("Video Editor");
    expect(preview).toHaveTextContent("₹25,000");
    expect(preview).toHaveTextContent("Ravi Kumar");
  });

  it("shows the joining letter too, and it is a different document", async () => {
    open();
    fillRequired();
    fireEvent.click(screen.getByText("Preview joining letter"));
    const preview = await screen.findByTestId("invite-preview");
    expect(preview).toHaveTextContent("APPOINTMENT LETTER");
    expect(preview).toHaveTextContent("Governing Law and Jurisdiction");
  });

  it("suggests an offer number from what this admin has already raised", async () => {
    open();
    await waitFor(() => expect(nextOfferSequence).toHaveBeenCalledWith("a1"));
    await waitFor(() =>
      expect(screen.getByDisplayValue(`DTS/OFR/${new Date().getFullYear()}/007`)).toBeInTheDocument());
  });
});

describe("terms that follow from other terms", () => {
  it("drops probation to nothing when the engagement becomes an internship", async () => {
    open();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();          // probation months
    fireEvent.change(screen.getByDisplayValue("Full-Time"), { target: { value: "intern" } });
    await waitFor(() => expect(screen.getByText("No probation")).toBeInTheDocument());
  });

  it("gives a team leader the longer notice period their role attracts", async () => {
    open();
    fireEvent.change(screen.getByTestId("invite-role"), { target: { value: "tech_team_leader" } });
    await waitFor(() => expect(screen.getByDisplayValue("45")).toBeInTheDocument());
  });

  it("shows when probation ends rather than making the admin count months", () => {
    open();
    fireEvent.change(screen.getByTestId("invite-joining"), { target: { value: "2026-09-01" } });
    expect(screen.getByText("Ends 2026-12-01")).toBeInTheDocument();
  });
});

describe("creating the link", () => {
  it("will not write a letter with the salary or designation missing", async () => {
    open();
    fireEvent.change(screen.getByTestId("invite-name"), { target: { value: "Ravi Kumar" } });
    fireEvent.click(screen.getByTestId("invite-submit"));
    await waitFor(() => expect(createInvite).not.toHaveBeenCalled());
  });

  it("normalises the email and phone before they become someone's login", async () => {
    open();
    fillRequired();
    fireEvent.click(screen.getByTestId("invite-submit"));
    await waitFor(() => expect(createInvite).toHaveBeenCalledTimes(1));
    const { draft } = createInvite.mock.calls[0][0];
    expect(draft.email).toBe("ravi@example.com");
    expect(draft.phone).toBe("+919876543210");
  });

  it("hands over the link and the code, and says nothing exists for them yet", async () => {
    open();
    fillRequired();
    fireEvent.click(screen.getByTestId("invite-submit"));
    expect(await screen.findByTestId("invite-url")).toHaveValue("https://dts.test/join/abc123xyz9");
    expect(screen.getByTestId("invite-code")).toHaveValue("4821");
    expect(screen.getByText(/no account, no password/i)).toBeInTheDocument();
  });

  it("offers to send both on WhatsApp when there is a number to send them to", async () => {
    open();
    fillRequired();
    fireEvent.click(screen.getByTestId("invite-submit"));
    expect(await screen.findByTestId("invite-whatsapp")).toBeInTheDocument();
  });

  it("passes the signatory through, so the letters carry a real signature", async () => {
    open();
    fillRequired();
    fireEvent.click(screen.getByTestId("invite-submit"));
    await waitFor(() => expect(createInvite).toHaveBeenCalledTimes(1));
    const args = createInvite.mock.calls[0][0];
    expect(args.signatory.signatureUrl).toBe("https://cdn.test/asha.png");
    expect(args.designation).toBe("CTO (Tech Admin)");
  });
});
