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

const { issueDocument } = vi.hoisted(() => ({
  issueDocument: vi.fn().mockResolvedValue("doc-1"),
}));

vi.mock("@/services/hrDocuments", () => ({ issueDocument }));
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

  it("keeps the letter hidden until the admin asks to see it", () => {
    open();
    expect(screen.queryByText(/Asha Devi/)).not.toBeNull();      // the "To …" line in the header
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
