import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The joining-day information pack, driven through the real form.
 *
 * Three things here are worth pinning at this level rather than in a helper: a photograph and a
 * certificate actually reach Cloudinary and then the employee's record, a mistyped PAN or Aadhaar
 * is refused before it can reach payroll, and the identifiers are not on screen until someone asks
 * for them.
 */

// `vi.hoisted` because the component is imported statically below, and a static import is hoisted
// above ordinary const declarations — the spies have to exist before the mock factories run.
const { saveEmployeeProfile, addKycDocument, removeKycDocument, uploadToCloudinary } = vi.hoisted(() => ({
  saveEmployeeProfile: vi.fn().mockResolvedValue(undefined),
  addKycDocument: vi.fn().mockResolvedValue(undefined),
  removeKycDocument: vi.fn().mockResolvedValue(undefined),
  uploadToCloudinary: vi.fn().mockResolvedValue("https://cdn.test/upload.png"),
}));

vi.mock("@/services/hr", () => ({ saveEmployeeProfile, addKycDocument, removeKycDocument }));
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary }));
vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm: async () => ({ confirmed: true }), ConfirmDialog: null }),
}));

import KycPanel from "@/components/hr/KycPanel";
import type { EmployeeProfile } from "@/types/hr";

const actor = { uid: "a1", name: "Asha Rao" };

const profile = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  uid: "m1", department: "tech", stage: "probation",
  probationReviews: [], assets: [], kycDocuments: [], separation: null,
  ...over,
});

const file = (name: string, type = "image/png") =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

configure({ testIdAttribute: "data-test" });

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no object-URL implementation; the preview only needs a string.
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:preview", writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, writable: true });
  }
});
afterEach(cleanup);

describe("profile photograph upload", () => {
  it("uploads the file and stores the returned URL on the employee's record", async () => {
    render(<KycPanel profile={profile()} actor={actor} />);

    fireEvent.change(screen.getByTestId("photo-input"), { target: { files: [file("ravi.jpg", "image/jpeg")] } });

    await waitFor(() => expect(uploadToCloudinary).toHaveBeenCalledTimes(1));
    expect(uploadToCloudinary.mock.calls[0][0].name).toBe("ravi.jpg");
    await waitFor(() =>
      expect(saveEmployeeProfile).toHaveBeenCalledWith("m1", { photoUrl: "https://cdn.test/upload.png" }, actor));
  });

  it("shows the photograph once it is on file", () => {
    render(<KycPanel profile={profile({ photoUrl: "https://cdn.test/ravi.jpg" })} actor={actor} />);
    expect(screen.getByAltText("Employee")).toHaveAttribute("src", "https://cdn.test/ravi.jpg");
  });

  it("clears the input so re-picking the same file after a failure still fires", async () => {
    render(<KycPanel profile={profile()} actor={actor} />);
    const input = screen.getByTestId("photo-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("ravi.jpg")] } });
    await waitFor(() => expect(uploadToCloudinary).toHaveBeenCalled());
    expect(input.value).toBe("");
  });

  it("does not wipe the record when the upload fails", async () => {
    uploadToCloudinary.mockRejectedValueOnce(new Error("network"));
    render(<KycPanel profile={profile()} actor={actor} />);
    fireEvent.change(screen.getByTestId("photo-input"), { target: { files: [file("ravi.jpg")] } });
    await waitFor(() => expect(uploadToCloudinary).toHaveBeenCalled());
    expect(saveEmployeeProfile).not.toHaveBeenCalled();
  });
});

describe("KYC document upload", () => {
  it("uploads the certificate and files it under the chosen kind", async () => {
    render(<KycPanel profile={profile()} actor={actor} />);

    fireEvent.change(screen.getByTestId("kyc-doc-input"), { target: { files: [file("pan-card.pdf", "application/pdf")] } });

    await waitFor(() => expect(addKycDocument).toHaveBeenCalledTimes(1));
    const [, doc] = addKycDocument.mock.calls[0];
    expect(doc).toMatchObject({
      kind: "aadhaar",           // the picker's default
      label: "pan-card.pdf",
      url: "https://cdn.test/upload.png",
      uploadedByName: "Asha Rao",
    });
  });

  it("lists uploaded files with a link to open them", () => {
    render(<KycPanel actor={actor} profile={profile({
      kycDocuments: [{ id: "k1", kind: "education", label: "degree.pdf", url: "https://cdn.test/degree.pdf", uploadedAt: null, uploadedByName: "Asha Rao" }],
    })} />);
    const link = screen.getByText("degree.pdf");
    expect(link).toHaveAttribute("href", "https://cdn.test/degree.pdf");
    // The label also exists as a <select> option, so assert on the row's own chip.
    expect(within(link.parentElement!).getByText("Education certificate")).toBeInTheDocument();
  });
});

describe("PAN and Aadhaar", () => {
  const openEditor = () => fireEvent.click(screen.getByTestId("edit-kyc"));

  it("saves a valid PAN and Aadhaar, stripped of the spaces people type", async () => {
    render(<KycPanel profile={profile()} actor={actor} />);
    openEditor();

    fireEvent.change(screen.getByTestId("kyc-pan"), { target: { value: "abcde1234f" } });
    fireEvent.change(screen.getByTestId("kyc-aadhaar"), { target: { value: "2345 6789 0124" } });
    fireEvent.click(screen.getByTestId("save-kyc"));

    await waitFor(() => expect(saveEmployeeProfile).toHaveBeenCalledTimes(1));
    const [uid, patch] = saveEmployeeProfile.mock.calls[0];
    expect(uid).toBe("m1");
    expect(patch.pan).toBe("ABCDE1234F");
    expect(patch.aadhaar).toBe("234567890124");
  });

  it("refuses a malformed PAN instead of writing it", async () => {
    render(<KycPanel profile={profile()} actor={actor} />);
    openEditor();

    fireEvent.change(screen.getByTestId("kyc-pan"), { target: { value: "ABCD1234F" } });
    expect(screen.getByTestId("pan-error")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("save-kyc"));
    await waitFor(() => expect(saveEmployeeProfile).not.toHaveBeenCalled());
  });

  it("refuses an Aadhaar that fails its checksum, not merely one of the wrong length", async () => {
    render(<KycPanel profile={profile()} actor={actor} />);
    openEditor();

    // Twelve digits, right shape, wrong check digit — the case a length check would let through.
    fireEvent.change(screen.getByTestId("kyc-aadhaar"), { target: { value: "234567890123" } });
    expect(screen.getByTestId("aadhaar-error")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("save-kyc"));
    await waitFor(() => expect(saveEmployeeProfile).not.toHaveBeenCalled());
  });

  it("accepts a record with no identifiers yet — papers do not always arrive on day one", async () => {
    render(<KycPanel profile={profile()} actor={actor} />);
    openEditor();
    fireEvent.change(screen.getByTestId("kyc-dob"), { target: { value: "2001-04-12" } });
    fireEvent.click(screen.getByTestId("save-kyc"));

    await waitFor(() => expect(saveEmployeeProfile).toHaveBeenCalledTimes(1));
    const [, patch] = saveEmployeeProfile.mock.calls[0];
    expect(patch.pan).toBeNull();
    expect(patch.aadhaar).toBeNull();
    expect(patch.dob).toBe("2001-04-12");
  });

  it("keeps both identifiers masked until they are explicitly revealed", () => {
    render(<KycPanel actor={actor} profile={profile({ pan: "ABCDE1234F", aadhaar: "234567890124" })} />);

    expect(screen.queryByText("ABCDE1234F")).not.toBeInTheDocument();
    expect(screen.getByText(/•••• •••• 0124/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("reveal-ids"));
    expect(screen.getByText("ABCDE1234F")).toBeInTheDocument();
    expect(screen.getByText("2345 6789 0124")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("reveal-ids"));
    expect(screen.queryByText("ABCDE1234F")).not.toBeInTheDocument();
  });
});

describe("read-only viewer", () => {
  it("offers no way to edit or upload anything", () => {
    render(<KycPanel profile={profile()} actor={actor} readOnly />);
    expect(screen.queryByTestId("edit-kyc")).not.toBeInTheDocument();
    expect(screen.queryByTestId("photo-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kyc-doc-input")).not.toBeInTheDocument();
  });
});

describe("completeness", () => {
  it("says what is still missing rather than only a percentage", () => {
    render(<KycPanel actor={actor} profile={profile({ dob: "2001-04-12", pan: "ABCDE1234F" })} />);
    // The ten items the daily prompt asks for — one list, so the two screens cannot disagree.
    expect(screen.getByText(/2 of 12 on file/)).toBeInTheDocument();
    expect(screen.getByText(/Still needed:/)).toHaveTextContent("Profile photo");
    expect(screen.getByText(/Still needed:/)).toHaveTextContent("Aadhaar number");
    // The number being on file does not mean the card has been uploaded.
    expect(screen.getByText(/Still needed:/)).toHaveTextContent("PAN card");
  });
});
