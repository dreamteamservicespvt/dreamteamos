import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The popup that asks employees for what the company still needs.
 *
 * It appears every day until it is satisfied, so the behaviour worth pinning is the behaviour
 * that would otherwise make people hate it: it shows only what is actually missing, "I'll do it
 * later" holds for the rest of the day and no longer, and once everything is on file it never
 * appears again. The last one matters most — a prompt that keeps asking after you have answered
 * is the reason people stop reading prompts.
 */

const {
  saveEmployeeProfile, addKycDocument, uploadToCloudinary, watchEmployeeProfile, updateDoc, setUser, state,
} = vi.hoisted(() => ({
  saveEmployeeProfile: vi.fn().mockResolvedValue(undefined),
  addKycDocument: vi.fn().mockResolvedValue(undefined),
  uploadToCloudinary: vi.fn().mockResolvedValue("https://cdn.test/file.jpg"),
  watchEmployeeProfile: vi.fn(),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  setUser: vi.fn(),
  state: { user: {} as Record<string, unknown> },
}));

vi.mock("@/services/hr", () => ({ saveEmployeeProfile, addKycDocument, watchEmployeeProfile }));
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: state.user, setUser }),
}));
// The check-in gate only applies to tech members; these tests are about the prompt itself.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn((_db, _c, id) => ({ id })), query: vi.fn(), where: vi.fn(),
  serverTimestamp: vi.fn(), updateDoc,
  onSnapshot: vi.fn(() => () => {}),
}));
vi.mock("@/services/firebase", () => ({ db: {} }));

import ProfileCompletionPrompt from "@/components/profile/ProfileCompletionPrompt";
import type { EmployeeProfile } from "@/types/hr";

configure({ testIdAttribute: "data-test" });

const FULL: Partial<EmployeeProfile> = {
  surname: "Devi",
  photoUrl: "https://cdn/p.jpg",
  personalEmail: "asha@example.com",
  dob: "1996-08-02",
  bloodGroup: "O+",
  currentAddress: "Flat 4, MG Road",
  permanentAddress: "Door 12, Kakinada",
  emergencyContact: { name: "Ravi", relation: "Brother", phone: "+919000000000" },
  pan: "ABCDE1234F",
  aadhaar: "111122223333",
  kycDocuments: [
    { id: "1", kind: "pan", label: "p.jpg", url: "https://cdn/p.jpg", uploadedAt: null as never, uploadedByName: "A" },
    { id: "2", kind: "aadhaar", label: "a.jpg", url: "https://cdn/a.jpg", uploadedAt: null as never, uploadedByName: "A" },
  ],
};

/** Drive the profile watcher with a fixed record. */
const withProfile = (patch: Partial<EmployeeProfile> = {}) => {
  watchEmployeeProfile.mockImplementation((_uid: string, dept: string, cb: (p: unknown, e: boolean) => void) => {
    cb({ uid: "u1", department: dept, stage: "probation", ...patch }, true);
    return () => {};
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.user = { uid: "u1", name: "Asha Devi", role: "sales_member", isActive: true };
  withProfile();
});
afterEach(cleanup);

describe("who it interrupts", () => {
  it("asks a sales executive with an incomplete record", () => {
    render(<ProfileCompletionPrompt />);
    expect(screen.getByTestId("profile-completion-prompt")).toBeInTheDocument();
    expect(screen.getByText(/Complete your profile, Asha/)).toBeInTheDocument();
  });

  it("never appears for an admin, who has no employment record to complete", () => {
    state.user = { uid: "a1", name: "Ravi", role: "sales_admin", isActive: true };
    render(<ProfileCompletionPrompt />);
    expect(screen.queryByTestId("profile-completion-prompt")).not.toBeInTheDocument();
  });

  it("never appears for an external creator, who is not staff", () => {
    state.user = { uid: "e1", name: "Kiran", role: "tech_member", externalCreator: true };
    render(<ProfileCompletionPrompt />);
    expect(screen.queryByTestId("profile-completion-prompt")).not.toBeInTheDocument();
  });

  it("stops for good once everything is on file", () => {
    withProfile(FULL);
    render(<ProfileCompletionPrompt />);
    // Nothing to ask for, so nothing is shown — not even a "you're done" they have to dismiss.
    expect(screen.queryByTestId("profile-prompt-save")).not.toBeInTheDocument();
  });
});

describe("what it asks for", () => {
  it("shows only the items that are actually missing", () => {
    withProfile({ personalEmail: "asha@example.com", dob: "1996-08-02", bloodGroup: "O+" });
    render(<ProfileCompletionPrompt />);

    expect(screen.queryByTestId("prompt-step-personalEmail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("prompt-step-dob")).not.toBeInTheDocument();
    expect(screen.getByTestId("prompt-step-photo")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-step-pan")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-step-aadhaarCard")).toBeInTheDocument();
    expect(screen.getByTestId("profile-progress")).toHaveTextContent("3 of 12");
  });

  it("still asks for the card after the number has been typed in", () => {
    withProfile({ pan: "ABCDE1234F" });
    render(<ProfileCompletionPrompt />);
    expect(screen.queryByTestId("prompt-step-pan")).not.toBeInTheDocument();
    expect(screen.getByTestId("prompt-step-panCard")).toBeInTheDocument();
  });
});

describe("the full name", () => {
  it("pre-fills both boxes by splitting the name the account already holds", () => {
    render(<ProfileCompletionPrompt />);
    expect((screen.getByTestId("prompt-given-name") as HTMLInputElement).value).toBe("Asha");
    expect((screen.getByTestId("prompt-surname") as HTMLInputElement).value).toBe("Devi");
    expect(screen.getByTestId("prompt-name-preview")).toHaveTextContent("Asha Devi");
  });

  it("asks properly when the account holds only one word", () => {
    state.user = { uid: "u1", name: "Asha", role: "sales_member", isActive: true };
    render(<ProfileCompletionPrompt />);
    expect((screen.getByTestId("prompt-surname") as HTMLInputElement).value).toBe("");
  });

  it("writes the surname to the employment record AND the full name to the account", async () => {
    // The account carries the name chat, payslips and every issued letter read — a surname that
    // only reached the HR record would leave the ID card disagreeing with the topbar.
    render(<ProfileCompletionPrompt />);
    fireEvent.change(screen.getByTestId("prompt-given-name"), { target: { value: "Asha Lakshmi" } });
    fireEvent.change(screen.getByTestId("prompt-surname"), { target: { value: "Devi" } });
    fireEvent.click(screen.getByTestId("profile-prompt-save"));

    await waitFor(() => expect(saveEmployeeProfile).toHaveBeenCalled());
    expect(saveEmployeeProfile.mock.calls[0][1].surname).toBe("Devi");

    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    expect(updateDoc.mock.calls[0][1].name).toBe("Asha Lakshmi Devi");
    // …and the store, so the topbar changes without a reload.
    expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ name: "Asha Lakshmi Devi" }));
  });

  it("does not rewrite the account when the name has not actually changed", async () => {
    render(<ProfileCompletionPrompt />);
    fireEvent.click(screen.getByTestId("profile-prompt-save")); // pre-filled "Asha" + "Devi"
    await waitFor(() => expect(saveEmployeeProfile).toHaveBeenCalled());
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

describe("the two addresses", () => {
  it("copies the current address across when the box is ticked", async () => {
    withProfile({ currentAddress: "Flat 4, MG Road" });
    render(<ProfileCompletionPrompt />);

    fireEvent.click(screen.getByTestId("prompt-same-address"));
    expect((screen.getByTestId("prompt-permanent-address") as HTMLTextAreaElement).value)
      .toBe("Flat 4, MG Road");

    fireEvent.click(screen.getByTestId("profile-prompt-save"));
    await waitFor(() => expect(saveEmployeeProfile).toHaveBeenCalled());
    expect(saveEmployeeProfile.mock.calls[0][1].permanentAddress).toBe("Flat 4, MG Road");
  });

  it("keeps them apart when they genuinely differ", async () => {
    render(<ProfileCompletionPrompt />);
    fireEvent.change(screen.getByTestId("prompt-address"), { target: { value: "Flat 4, MG Road" } });
    fireEvent.change(screen.getByTestId("prompt-permanent-address"), { target: { value: "Door 12, Kakinada" } });
    fireEvent.click(screen.getByTestId("profile-prompt-save"));

    await waitFor(() => expect(saveEmployeeProfile).toHaveBeenCalled());
    const patch = saveEmployeeProfile.mock.calls[0][1];
    expect(patch.currentAddress).toBe("Flat 4, MG Road");
    expect(patch.permanentAddress).toBe("Door 12, Kakinada");
  });
});

describe("filling it in", () => {
  it("saves what was typed, in one write", async () => {
    render(<ProfileCompletionPrompt />);
    fireEvent.change(screen.getByTestId("prompt-personal-email"), { target: { value: "asha@example.com" } });
    fireEvent.change(screen.getByTestId("prompt-address"), { target: { value: "Flat 4, MG Road" } });
    fireEvent.change(screen.getByTestId("prompt-emergency-phone"), { target: { value: "+919000000000" } });
    fireEvent.click(screen.getByTestId("profile-prompt-save"));

    await waitFor(() => expect(saveEmployeeProfile).toHaveBeenCalledTimes(1));
    const patch = saveEmployeeProfile.mock.calls[0][1];
    expect(patch.personalEmail).toBe("asha@example.com");
    expect(patch.currentAddress).toBe("Flat 4, MG Road");
    expect(patch.emergencyContact.phone).toBe("+919000000000");
  });

  it("strips the spaces people type into an Aadhaar", async () => {
    render(<ProfileCompletionPrompt />);
    fireEvent.change(screen.getByTestId("prompt-aadhaar"), { target: { value: "2345 6789 0124" } });
    fireEvent.click(screen.getByTestId("profile-prompt-save"));
    await waitFor(() => expect(saveEmployeeProfile).toHaveBeenCalled());
    expect(saveEmployeeProfile.mock.calls[0][1].aadhaar).toBe("234567890124");
  });

  it("refuses an Aadhaar that fails its checksum, not merely one of the wrong length", () => {
    render(<ProfileCompletionPrompt />);
    fireEvent.change(screen.getByTestId("prompt-aadhaar"), { target: { value: "234567890123" } });
    expect(screen.getByText(/not a valid Aadhaar number/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("profile-prompt-save"));
    expect(saveEmployeeProfile).not.toHaveBeenCalled();
  });

  it("refuses a malformed PAN instead of writing it", () => {
    // A wrong identifier is discovered when payroll needs it, which is far too late.
    render(<ProfileCompletionPrompt />);
    fireEvent.change(screen.getByTestId("prompt-pan"), { target: { value: "NOTAPAN" } });
    expect(screen.getByText(/PAN should look like/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("profile-prompt-save"));
    expect(saveEmployeeProfile).not.toHaveBeenCalled();
  });

  it("does not lose the first card when the second is uploaded straight after", async () => {
    // Both upload buttons are on screen together, and addKycDocument rewrites the whole array
    // from the copy it is handed. Uploading the Aadhaar before the PAN snapshot has reached React
    // state must not write an array that never contained the PAN.
    let push!: (p: Partial<EmployeeProfile>) => void;
    watchEmployeeProfile.mockImplementation((_uid: string, dept: string, cb: (p: unknown, e: boolean) => void) => {
      push = (p) => cb({ uid: "u1", department: dept, stage: "probation", ...p }, true);
      push({});
      return () => {};
    });
    render(<ProfileCompletionPrompt />);

    const panDoc = { id: "1", kind: "pan", label: "p.jpg", url: "https://cdn/p.jpg", uploadedAt: null, uploadedByName: "A" };
    // The PAN card lands in the watcher (as Firestore would deliver it) …
    push({ kycDocuments: [panDoc] as never });

    // … and the Aadhaar is picked in the same tick, before React has re-rendered.
    const input = screen.getByTestId("prompt-step-aadhaarCard").querySelector("input[type=file]")!;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "aadhaar.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => expect(addKycDocument).toHaveBeenCalled());
    const handed = addKycDocument.mock.calls[0][0] as EmployeeProfile;
    expect((handed.kycDocuments || []).map((d) => d.kind)).toContain("pan");
  });

  it("files an uploaded card under the right document kind", async () => {
    render(<ProfileCompletionPrompt />);
    const input = screen.getByTestId("prompt-step-aadhaarCard").querySelector("input[type=file]")!;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "aadhaar.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(addKycDocument).toHaveBeenCalledTimes(1));
    expect(addKycDocument.mock.calls[0][1].kind).toBe("aadhaar");
    expect(addKycDocument.mock.calls[0][1].url).toBe("https://cdn.test/file.jpg");
  });
});

describe("'I'll do it later'", () => {
  it("closes it for the rest of today", () => {
    render(<ProfileCompletionPrompt />);
    fireEvent.click(screen.getByTestId("profile-prompt-later"));
    expect(screen.queryByTestId("profile-completion-prompt")).not.toBeInTheDocument();
  });

  it("comes back tomorrow, because the dismissal is dated", () => {
    render(<ProfileCompletionPrompt />);
    fireEvent.click(screen.getByTestId("profile-prompt-later"));
    cleanup();

    // Same browser, same person, a different day: the stored key no longer matches.
    const keys = Object.keys(localStorage);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^dts_profile_prompt_u1_\d{4}-\d{2}-\d{2}$/);

    localStorage.clear(); // stand in for the date rolling over
    render(<ProfileCompletionPrompt />);
    expect(screen.getByTestId("profile-completion-prompt")).toBeInTheDocument();
  });

  it("is one person's decision, not everyone's on a shared machine", () => {
    render(<ProfileCompletionPrompt />);
    fireEvent.click(screen.getByTestId("profile-prompt-later"));
    cleanup();

    state.user = { uid: "u2", name: "Kiran S", role: "tech_team_leader", isActive: true };
    render(<ProfileCompletionPrompt />);
    expect(screen.getByTestId("profile-completion-prompt")).toBeInTheDocument();
  });
});
