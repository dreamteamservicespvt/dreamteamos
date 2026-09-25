import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

configure({ testIdAttribute: "data-test" });

/**
 * The kit as a whole, rendered: the job strip, the job's spec winning over a reopened kit, a kit made
 * for an older spec saying so, a missing deliverable written on its own, a final script rewriting
 * 5 · 6 · 7, and a finished run never being overwritten by its own save. Firebase and every Gemini
 * call are faked.
 */

const savedKit = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));

vi.mock("firebase/firestore", () => ({
  collection: () => ({}), doc: () => ({}), query: () => ({}), where: () => ({}),
  addDoc: vi.fn(async () => ({ id: "g1" })), updateDoc: vi.fn(async () => {}), setDoc: vi.fn(async () => {}),
  getDoc: vi.fn(async () => (savedKit.current
    ? { exists: () => true, id: "old", data: () => savedKit.current }
    : { exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async () => ({ docs: [], empty: true, forEach: () => {} })),
  serverTimestamp: () => null, onSnapshot: () => () => {},
}));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/appUpdate", () => ({ holdUpdates: () => () => {} }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("@/store/authStore", () => {
  const state = { user: { uid: "u1", name: "Tester", role: "tech_member" } };
  return { useAuthStore: (select: (s: any) => unknown) => select(state) };
});
vi.mock("@/services/geminiService", () => ({
  generateAdAssets: vi.fn(), generatePosterConcepts: vi.fn(), refinePosterConcept: vi.fn(), DEFAULT_POSTER_CONCEPT_COUNT: 3,
  generateStockImagePrompts: vi.fn(), refineStockImagePrompt: vi.fn(), generateOverlayTexts: vi.fn(),
  refineOverlayImagePrompt: vi.fn(), refineSection: vi.fn(), refineVoiceOver: vi.fn(), refineVeoPrompts: vi.fn(),
  regenerateVeoForClips: vi.fn(), extractBusinessNameFromInfo: (info: any) => info?.name || "",
  buildVideoBottomLabel: vi.fn(() => "VIDEO BOTTOM LABEL — rebuilt"), writeVideoPosterPrompt: vi.fn(),
}));

const { default: AIPlatformApp } = await import("@/components/ai-platform/AIPlatformApp");
const gemini = await import("@/services/geminiService");
const firestore = await import("firebase/firestore");

const job = (patch: Record<string, unknown> = {}) => ({
  id: "a1", assignedTo: "u1", assignedBy: "admin", category: "promotional", clipCount: 2, includesEndCredits: true,
  duration: "16s", pricePerUnit: 0, totalPrice: 0, uniqueId: "P42", accessCode: "1234", displayTitle: "Sri Sai Motors",
  businessName: "Sri Sai Motors", status: "in_progress", sessions: [], totalDurationSeconds: 0, date: "2026-09-25",
  modelGender: "female", attireType: "professional", aspectRatio: "9:16", language: "Telugu", realLocationProvided: false,
  ...patch,
}) as any;

const kit = (patch: Record<string, unknown> = {}) => ({
  businessInfo: { name: "Sri Sai Motors", contactNumbers: ["9848012345"] },
  mainFramePrompts: ["Frame one.", "Frame two."], headerPrompt: "LABEL", posterPrompt: "POSTER",
  voiceOverScript: "0-8: Line one.\n8-16: Line two.", veoPrompts: ["Veo one.", "Veo two."],
  hasProductImages: false, productImageCount: 0, stockImagePrompts: null,
  ...patch,
});

beforeEach(() => {
  savedKit.current = null;
  vi.mocked(gemini.generateStockImagePrompts).mockResolvedValue([{ id: 1, clip: 1, concept: "The bay", prompt: "A service bay." }] as any);
  vi.mocked(gemini.generateOverlayTexts).mockResolvedValue([{ clip: 1, text: "SAME-DAY SERVICE", soundEffect: "whoosh" }] as any);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const run = async () => {
  fireEvent.change(screen.getByTestId("business-content"), { target: { value: "Sri Sai Motors — bike service. Call 9848012345." } });
  fireEvent.click(screen.getByLabelText(/NO LOGO/));
  fireEvent.change(screen.getByPlaceholderText("BUSINESS NAME"), { target: { value: "Sri Sai Motors" } });
  fireEvent.click(screen.getByText("Start Generation"));
  await screen.findByText("Deliverables");
};

describe("which ad this is", () => {
  it("names the business, the kind of ad and its clips at every width", () => {
    render(<AIPlatformApp assignment={job()} assignmentId="a1" onClose={() => {}} />);
    const strip = screen.getByTestId("job-strip");
    expect(screen.getByTestId("job-strip-name").textContent).toBe("Sri Sai Motors");
    expect(strip.textContent).toContain("Promotional");
    expect(strip.textContent).toContain("2 clips + EC · 16s");
    expect(strip.textContent).toContain("9:16");
    // Not hidden behind a breakpoint any more.
    expect(strip.className).not.toMatch(/hidden/);
  });
});

describe("a job changed after its kit was made", () => {
  it("opens on the job's CURRENT attire, and says the kit on screen was made for the old one", async () => {
    // The kit saved while the job still said a saree; the admin has since changed it to a suit.
    savedKit.current = {
      ...kit({ posterPrompt: "" }), adType: "commercial", festivalName: "", gender: "female", attireType: "traditional",
      customAttire: "", aspectRatio: "9:16", language: "Telugu", characterPack: null, locationMode: "ai_generated",
      duration: 16, creationMode: "video",
    };
    render(<AIPlatformApp assignment={job({ savedGenerationId: "old" })} assignmentId="a1" onClose={() => {}} />);

    const banner = await screen.findByTestId("stale-kit");
    expect(banner.textContent).toMatch(/Attire:/);
    expect(banner.textContent).toMatch(/Saree|Traditional/i);
    // The locked field shows the job's value, not the restored kit's.
    fireEvent.click(screen.getByTestId("section-configuration"));
    expect(screen.getByText("Professional (Formal Suit)")).toBeTruthy();
    expect(screen.queryByText("Traditional (Designer Saree)")).toBeNull();
  });
});

describe("a deliverable that is missing", () => {
  it("is shown as missing with its own Generate — not left out while the status says Completed", async () => {
    vi.mocked(gemini.generateAdAssets).mockResolvedValue(kit({ posterPrompt: "" }) as any);
    vi.mocked(gemini.writeVideoPosterPrompt).mockResolvedValue("POSTER — written on its own");
    render(<AIPlatformApp onClose={() => {}} />);
    await run();

    const state = await screen.findByTestId("row-state-poster");
    expect(state.textContent).toContain("Missing");
    fireEvent.click(state.closest(".ag-row")!.querySelector("button")!);
    await waitFor(() => expect(gemini.writeVideoPosterPrompt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId("row-state-poster")).toBeNull());
  });
});

describe("the final voice-over script", () => {
  it("becomes the voice-over and rewrites 5 · 6 · 7 from it, showing each one's progress", async () => {
    vi.mocked(gemini.generateAdAssets).mockResolvedValue(kit() as any);
    vi.mocked(gemini.regenerateVeoForClips).mockResolvedValue([{ index: 0, prompt: "New veo one." }, { index: 1, prompt: "New veo two." }]);
    render(<AIPlatformApp onClose={() => {}} />);
    await run();
    await waitFor(() => expect(gemini.generateOverlayTexts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("final-script-open"));
    const panel = screen.getByTestId("final-script-panel");
    expect(panel.textContent).toContain("clip-1[0-8sec]: …");
    fireEvent.change(screen.getByTestId("final-script-input"), {
      target: { value: "clip-1[0-8sec]: Final line one.\nclip-2[8-16sec]: Final line two." },
    });
    expect(screen.getByTestId("final-script-reading").textContent).toMatch(/Reads as 2 clips/);
    fireEvent.click(screen.getByTestId("final-script-apply"));

    await waitFor(() => {
      expect(screen.getByTestId("final-script-progress-veo").textContent).toContain("Updated");
      expect(screen.getByTestId("final-script-progress-stock").textContent).toContain("Updated");
      expect(screen.getByTestId("final-script-progress-overlay").textContent).toContain("Updated");
    });
    const script = "0-8: Final line one.\n8-16: Final line two.";
    expect(vi.mocked(gemini.regenerateVeoForClips).mock.calls[0][0]).toBe(script);
    expect(vi.mocked(gemini.generateStockImagePrompts).mock.calls.at(-1)?.[0]).toBe(script);
    expect(vi.mocked(gemini.generateOverlayTexts).mock.calls.at(-1)?.[0]).toBe(script);
    expect(screen.getByTestId("row-state-veo").textContent).toContain("Updated from final script");
    expect(screen.getByTestId("row-state-voiceOver").textContent).toContain("Final script");
  });

  it("is offered on row 4 itself, highlighted and explained, without opening the row", async () => {
    vi.mocked(gemini.generateAdAssets).mockResolvedValue(kit() as any);
    render(<AIPlatformApp onClose={() => {}} />);
    await run();

    const callout = screen.getByTestId("final-script-callout");
    // Inside deliverable 4, and visible while that row is still shut.
    expect(callout.closest(".ag-row")?.textContent).toContain("Voice Over Script");
    expect(screen.getByLabelText(/Expand 4\. Voice Over Script/)).toBeTruthy();
    expect(callout.textContent).toMatch(/client/);
    expect(callout.textContent).toMatch(/ChatGPT or Gemini/);
    expect(screen.getByTestId("final-script-open").textContent).toContain("Input Final Script");

    // Opened, it walks through the three steps, and can start from the script already in the kit.
    fireEvent.click(screen.getByTestId("final-script-open"));
    const panel = screen.getByTestId("final-script-panel");
    for (const step of ["Copy the format", "Paste the final script", "Update the kit"]) expect(panel.textContent).toContain(step);
    expect(screen.getByTestId("final-script-copy-ai").textContent).toContain("ChatGPT / Gemini");
    fireEvent.click(screen.getByTestId("final-script-load-current"));
    expect((screen.getByTestId("final-script-input") as HTMLTextAreaElement).value)
      .toBe("clip-1[0-8sec]: Line one.\nclip-2[8-16sec]: Line two.");
    expect(screen.getByTestId("final-script-reading").textContent).toMatch(/Reads as 2 clips/);
  });

  it("refuses a script with the wrong number of clips before spending anything on it", async () => {
    vi.mocked(gemini.generateAdAssets).mockResolvedValue(kit() as any);
    render(<AIPlatformApp onClose={() => {}} />);
    await run();
    fireEvent.click(screen.getByTestId("final-script-open"));
    fireEvent.change(screen.getByTestId("final-script-input"), { target: { value: "clip-1[0-8sec]: Only one." } });
    expect(screen.getByTestId("final-script-reading").textContent).toMatch(/has 1 clip; this kit has 2 frames/);
    expect((screen.getByTestId("final-script-apply") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("a finished run", () => {
  /**
   * The "completed, but some deliverables are missing" glitch: saving the run points the job at the
   * new document, and that used to re-load the document over the screen while B-roll and overlays
   * were still arriving.
   */
  it("is never re-loaded over itself when the job is pointed at its new save", async () => {
    vi.mocked(gemini.generateAdAssets).mockResolvedValue(kit() as any);
    const { rerender } = render(<AIPlatformApp assignment={job()} assignmentId="a1" onClose={() => {}} />);
    await run();
    await waitFor(() => expect(firestore.addDoc).toHaveBeenCalled());
    const reads = vi.mocked(firestore.getDoc).mock.calls.length;
    savedKit.current = kit({ stockImagePrompts: null, overlayTexts: null });

    // The live job now carries the id the save returned.
    rerender(<AIPlatformApp assignment={job({ savedGenerationId: "g1" })} assignmentId="a1" onClose={() => {}} />);
    await waitFor(() => expect(gemini.generateOverlayTexts).toHaveBeenCalled());
    expect(vi.mocked(firestore.getDoc).mock.calls.length).toBe(reads);
    await waitFor(() => expect(screen.queryByTestId("row-state-stock")).toBeNull());
  });
});
