import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Reading a letter before it is sent.
 *
 * These letters go out under the company's signature and land in an employee's profile the
 * instant they are issued — there is no recall. So the two guarantees worth pinning are that
 * nothing leaves the building until the admin presses Issue, and that the words they previewed
 * are byte-for-byte the words that get stored. A preview that renders anything other than the
 * document itself is worse than no preview, because it is trusted.
 */

const { issueDocument, allocateReference } = vi.hoisted(() => ({
  issueDocument: vi.fn().mockResolvedValue("doc-1"),
  /** The reference series lives in Firestore; the number itself is not what this file is about. */
  allocateReference: vi.fn().mockResolvedValue("DTS/OFR/2026/0007"),
}));

vi.mock("@/services/hrDocuments", () => ({ issueDocument, allocateReference }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import IssueDocumentDialog from "@/components/hr/IssueDocumentDialog";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";

configure({ testIdAttribute: "data-test" });

const member = {
  uid: "m1", name: "Asha Devi", email: "asha@example.com", phone: "+919876543210",
  role: "sales_member", isActive: true, employeeId: "DTS-014",
} as AppUser;

const profile = {
  uid: "m1", department: "sales", stage: "probation",
  designation: "Sales Executive", joiningDate: "2026-01-05", ctcMonthly: 25000,
  engagementType: "full_time", workingHours: "10:00 – 19:00", workingDays: "Mon–Sat",
} as EmployeeProfile;

const signatory = (over: Partial<AppUser> = {}) => ({
  uid: "a1", name: "Ravi Kumar", email: "ravi@example.com", role: "sales_admin",
  isActive: true, designation: "Head of Sales", signatureUrl: "https://cdn.test/sign.png",
  ...over,
} as AppUser);

const open = (signer: AppUser = signatory()) =>
  render(
    <MemoryRouter>
      <IssueDocumentDialog
        member={member}
        profile={profile}
        signatory={signer}
        settingsPath="/sales-admin/settings"
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("previewing a document before it is sent", () => {
  it("issues nothing merely by opening the dialog or previewing", () => {
    open();
    fireEvent.click(screen.getByText("Preview"));
    expect(issueDocument).not.toHaveBeenCalled();
  });

  it("keeps the rendered letter hidden until the admin asks to see it", () => {
    open();
    // The text of the letter is in the editable box from the start — that is the composer. What
    // waits for Preview is the letter as PAPER: letterhead, signature block, the thing that gets
    // captured to PDF.
    expect((screen.getByTestId("issue-document-body") as HTMLTextAreaElement).value).toContain("Asha Devi");
    expect(document.querySelector('[data-pdf="body"]')).toBeNull();

    fireEvent.click(screen.getByText("Preview"));
    expect(document.querySelector('[data-pdf="body"]')).not.toBeNull();

    fireEvent.click(screen.getByText("Hide preview"));
    expect(document.querySelector('[data-pdf="body"]')).toBeNull();
  });

  it("shows the employee's own terms in the preview, not a blank template", () => {
    open();
    fireEvent.click(screen.getByText("Preview"));
    const letter = document.querySelector('[data-pdf="body"]')?.textContent || "";
    expect(letter).toContain("Sales Executive");
    expect(letter).toContain("25,000");
  });

  it("sends the letter the admin was reading, edits and all", async () => {
    // A warning letter, because its wording comes from what the admin types — so if the preview
    // and the stored copy were built from different sources this is where they would diverge.
    open();
    fireEvent.change(screen.getByTestId("document-type"), { target: { value: "warning_letter" } });
    fireEvent.change(screen.getByTestId("extra-incident"), {
      target: { value: "Left a client call unanswered for three days." },
    });

    fireEvent.click(screen.getByText("Preview"));
    const previewed = document.querySelector('[data-pdf="body"]')?.textContent || "";
    expect(previewed).toContain("Left a client call unanswered for three days.");

    fireEvent.click(screen.getByTestId("issue-document-submit"));
    await waitFor(() => expect(issueDocument).toHaveBeenCalledTimes(1));

    const doc = issueDocument.mock.calls[0][0].document;
    expect(doc.type).toBe("warning_letter");
    expect(doc.bodyText).toContain("Left a client call unanswered for three days.");
  });

  /**
   * The letter is the admin's to rewrite.
   *
   * The generator gets a letter most of the way there and cannot know the clause that was actually
   * negotiated. What matters is that a hand-edited paragraph is the thing that gets stored and
   * shown — an editable box whose contents were quietly replaced at issue time would be worse than
   * no box at all.
   */
  describe("editing the letter by hand", () => {
    const typeInto = (text: string) =>
      fireEvent.change(screen.getByTestId("issue-document-body"), { target: { value: text } });

    it("issues the admin's own wording, not the generated letter", async () => {
      open();
      typeInto("OFFER OF EMPLOYMENT\n\nDate: 05 January 2026\n\nWe are pleased to offer you the moon.");

      fireEvent.click(screen.getByTestId("issue-document-submit"));
      await waitFor(() => expect(issueDocument).toHaveBeenCalledTimes(1));

      const doc = issueDocument.mock.calls[0][0].document;
      expect(doc.bodyText).toContain("We are pleased to offer you the moon.");
      expect(doc.bodyText).not.toContain("Working Hours");
    });

    it("previews what was typed, so the paper and the stored copy cannot diverge", () => {
      open();
      typeInto("A LETTER\n\nEntirely rewritten by hand.");
      fireEvent.click(screen.getByText("Preview"));
      expect(document.querySelector('[data-pdf="body"]')?.textContent || "")
        .toContain("Entirely rewritten by hand.");
    });

    it("still numbers a hand-written letter from the register", async () => {
      open();
      typeInto("OFFER OF EMPLOYMENT\n\nDate: 05 January 2026\n\nShort and to the point.");

      fireEvent.click(screen.getByTestId("issue-document-submit"));
      await waitFor(() => expect(issueDocument).toHaveBeenCalledTimes(1));

      const doc = issueDocument.mock.calls[0][0].document;
      expect(doc.referenceNo).toBe("DTS/OFR/2026/0007");
      // Printed above the date, where a reader of a business letter looks for it.
      expect(doc.bodyText).toContain("Ref: DTS/OFR/2026/0007\nDate: 05 January 2026");
    });

    it("puts the generated letter back when the edit was a mistake", () => {
      open();
      typeInto("Scrapped.");
      fireEvent.click(screen.getByTestId("reset-letter"));
      expect((screen.getByTestId("issue-document-body") as HTMLTextAreaElement).value)
        .toContain("Sales Executive");
    });

    it("drops the edits when the admin switches to a different letter", () => {
      open();
      typeInto("Notes about the offer letter.");
      fireEvent.change(screen.getByTestId("document-type"), { target: { value: "warning_letter" } });
      const box = screen.getByTestId("issue-document-body") as HTMLTextAreaElement;
      expect(box.value).not.toContain("Notes about the offer letter.");
      expect(box.value).toContain("WARNING");
    });
  });

  it("will not send a letter whose facts are still missing", () => {
    // The preview would otherwise show a warning letter with a blank incident and issue it.
    open();
    fireEvent.change(screen.getByTestId("document-type"), { target: { value: "warning_letter" } });
    fireEvent.click(screen.getByTestId("issue-document-submit"));
    expect(issueDocument).not.toHaveBeenCalled();
  });

  it("carries the issuing admin's signature onto what is stored", async () => {
    open();
    fireEvent.click(screen.getByTestId("issue-document-submit"));
    await waitFor(() => expect(issueDocument).toHaveBeenCalled());
    const doc = issueDocument.mock.calls[0][0].document;
    expect(doc.companySignatureUrl).toBe("https://cdn.test/sign.png");
    expect(doc.issuedByName).toBe("Ravi Kumar");
    expect(doc.memberId).toBe("m1");
  });

  it("refuses to send anything from an admin who has no signature yet", () => {
    open(signatory({ signatureUrl: undefined }));
    expect(screen.getByTestId("no-signature-warning")).toBeInTheDocument();
    const submit = screen.getByTestId("issue-document-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(submit);
    expect(issueDocument).not.toHaveBeenCalled();
  });
});
