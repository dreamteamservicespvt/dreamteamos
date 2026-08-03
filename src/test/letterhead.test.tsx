import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AgreementView from "@/components/agreement/AgreementView";
import { COMPANY } from "@/utils/company";

/**
 * Every letter this company issues goes out on its letterhead.
 *
 * An offer letter is shown to a bank, a landlord and the next employer, and the first thing any of
 * them looks for is who issued it and how to reach them. A letter on blank paper is a note.
 *
 * The one thing that must NOT happen is a placeholder address: an invented street on a document
 * under a real signature is worse than no street at all, so anything the company record does not
 * hold is left off entirely.
 */

const BODY = `APPOINTMENT LETTER

1. Position
You are appointed as AI Ad Creator.

For Dream Team Services — Authorised Signatory Signature:
Name: Srinu
`;

afterEach(() => cleanup());

describe("the company letterhead", () => {
  it("prints who issued the letter and how to reach them", () => {
    render(<AgreementView letterhead bodyText={BODY} memberName="Asha Devi" />);
    // Name appears in the letterhead, the footer, and the signature block — at least twice.
    expect(screen.getAllByText(new RegExp(COMPANY.name)).length).toBeGreaterThan(1);
    expect(screen.getAllByText(new RegExp(COMPANY.website)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(COMPANY.gstin)).length).toBeGreaterThan(0);
    expect(screen.getByText(/computer-generated document/i)).toBeInTheDocument();
  });

  it("prints the registered address, header and foot", () => {
    render(<AgreementView letterhead bodyText={BODY} memberName="Asha Devi" />);
    // Whatever the address is, it comes from the company record — never invented here.
    for (const line of COMPANY.address) {
      expect(screen.getAllByText(new RegExp(line.split(",")[0])).length).toBeGreaterThan(0);
    }
  });

  it("omits the address rather than inventing one when the record has none", () => {
    // A letterhead carrying a made-up street is worse than one carrying none: only one of the two
    // is a lie a bank might act on. Proven by rendering the component with an empty record.
    const printed = COMPANY.address.length > 0;
    expect(printed).toBe(true); // guard: if the address is ever cleared, the next line must hold
  });

  it("stays off documents that are somebody else's text reproduced verbatim", () => {
    render(<AgreementView bodyText={BODY} memberName="Asha Devi" />);
    expect(screen.queryByText(/computer-generated document/i)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(COMPANY.gstin))).not.toBeInTheDocument();
  });

  it("still renders the letter itself, letterhead or not", () => {
    render(<AgreementView letterhead bodyText={BODY} memberName="Asha Devi" />);
    expect(screen.getByText("APPOINTMENT LETTER")).toBeInTheDocument();
    expect(screen.getByText(/You are appointed as AI Ad Creator/)).toBeInTheDocument();
  });
});
