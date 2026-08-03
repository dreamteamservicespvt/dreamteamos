import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The signature a head of department stores once and every document they issue then carries.
 *
 * Both ways of giving it must work — drawing it on screen and photographing/uploading one on
 * paper — because an admin on a laptop and an admin on a phone reach for different ones. The draw
 * path needs a real canvas, so it is exercised in the browser pass; here the upload path, the
 * stored state, replacing and removing are pinned.
 */

// `vi.hoisted` because the component is imported statically below, and a static import is hoisted
// above ordinary const declarations — the spies have to exist before the mock factories run.
const {
  saveCompanySignature, clearCompanySignature, saveSignatoryDesignation, uploadToCloudinary, setUser, state,
} = vi.hoisted(() => ({
  saveCompanySignature: vi.fn().mockResolvedValue(undefined),
  clearCompanySignature: vi.fn().mockResolvedValue(undefined),
  saveSignatoryDesignation: vi.fn().mockResolvedValue(undefined),
  uploadToCloudinary: vi.fn().mockResolvedValue("https://cdn.test/sign.png"),
  setUser: vi.fn(),
  /** Mutable so each test can decide who is signed in. */
  state: { user: {} as Record<string, unknown> },
}));

vi.mock("@/services/hr", () => ({ saveCompanySignature, clearCompanySignature, saveSignatoryDesignation }));
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: state.user, setUser }),
}));
vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm: async () => ({ confirmed: true }), ConfirmDialog: null }),
}));
// Background-stripping needs a real canvas and a real Image decode; jsdom has neither, and it is
// not what this file is about. The production code already falls back to the original file when
// normalization fails — here it simply passes straight through.
vi.mock("@/utils/signatureImage", () => ({
  normalizeSignatureFile: async (f: File) => f,
  normalizeSignatureUrl: async () => null,
}));

import CompanySignatureCard from "@/components/hr/CompanySignatureCard";

const techAdmin = (over: Record<string, unknown> = {}) => ({
  uid: "a1", email: "asha@example.com", name: "Asha Rao", role: "tech_admin",
  createdBy: "", isActive: true, salary: 0, target: 0, phone: "+919000000000",
  ...over,
});

configure({ testIdAttribute: "data-test" });

beforeEach(() => {
  vi.clearAllMocks();
  state.user = techAdmin();
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:preview", writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, writable: true });
  }
});
afterEach(cleanup);

describe("both ways of giving a signature", () => {
  it("offers drawing and uploading side by side", () => {
    render(<CompanySignatureCard />);
    expect(screen.getByTestId("signature-mode-draw")).toBeInTheDocument();
    expect(screen.getByTestId("signature-mode-upload")).toBeInTheDocument();
  });

  it("uploads a photographed signature and stores it against the admin", async () => {
    render(<CompanySignatureCard />);

    fireEvent.click(screen.getByTestId("signature-mode-upload"));
    fireEvent.change(screen.getByTestId("signature-file"), {
      target: { files: [new File([new Uint8Array([1, 2, 3])], "sign.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("signature-save"));

    await waitFor(() => expect(uploadToCloudinary).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(saveCompanySignature).toHaveBeenCalledWith("a1", "https://cdn.test/sign.png", "CTO (Tech Admin)"));
  });

  it("cannot be saved before anything has been drawn or picked", () => {
    render(<CompanySignatureCard />);
    expect(screen.getByTestId("signature-save")).toBeDisabled();
  });

  it("defaults the printed designation from the role — tech signs as CTO, sales as CEO", () => {
    render(<CompanySignatureCard />);
    expect(screen.getByTestId("signatory-designation")).toHaveValue("CTO (Tech Admin)");

    cleanup();
    state.user = techAdmin({ role: "sales_admin" });
    render(<CompanySignatureCard />);
    expect(screen.getByTestId("signatory-designation")).toHaveValue("CEO (Sales Admin)");
  });
});

describe("once a signature is on file", () => {
  beforeEach(() => {
    state.user = techAdmin({
      signatureUrl: "https://cdn.test/existing.png",
      designation: "Technical Head",
      signatureUpdatedAt: { seconds: 1767225600 },
    });
  });

  it("shows it rather than asking for it again", () => {
    render(<CompanySignatureCard />);
    expect(screen.getByTestId("signature-preview")).toHaveAttribute("src", "https://cdn.test/existing.png");
    expect(screen.getByText("On file")).toBeInTheDocument();
    expect(screen.queryByTestId("signature-mode-draw")).not.toBeInTheDocument();
  });

  it("can be replaced, which brings both options back", () => {
    render(<CompanySignatureCard />);
    fireEvent.click(screen.getByRole("button", { name: /replace signature/i }));
    expect(screen.getByTestId("signature-mode-draw")).toBeInTheDocument();
    expect(screen.getByTestId("signature-mode-upload")).toBeInTheDocument();
  });

  it("can be removed without touching documents already issued", async () => {
    render(<CompanySignatureCard />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => expect(clearCompanySignature).toHaveBeenCalledWith("a1"));
    expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ signatureUrl: null }));
  });

  it("lets the designation be corrected without re-uploading the signature", async () => {
    render(<CompanySignatureCard />);
    fireEvent.change(screen.getByTestId("signatory-designation"), { target: { value: "Director — Technology" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveSignatoryDesignation).toHaveBeenCalledWith("a1", "Director — Technology"));
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });
});
