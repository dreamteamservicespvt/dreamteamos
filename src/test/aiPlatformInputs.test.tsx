import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";

configure({ testIdAttribute: "data-test" });

/**
 * The AI platform's input side, rendered: the two content boxes, the document route, the owner's
 * photo slot, the Custom Character description, and the two-person script format. Firebase, the
 * store and every Gemini call are faked — nothing here generates anything.
 */

vi.mock("firebase/firestore", () => ({
  collection: () => ({}), doc: () => ({}), query: () => ({}), where: () => ({}),
  addDoc: vi.fn(async () => ({ id: "g1" })), updateDoc: vi.fn(async () => {}), setDoc: vi.fn(async () => {}),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async () => ({ docs: [], empty: true, forEach: () => {} })),
  serverTimestamp: () => null, onSnapshot: () => () => {},
}));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/appUpdate", () => ({ holdUpdates: () => () => {} }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
// One stable user object, as the real store keeps — a new object per render re-runs every [user] effect.
vi.mock("@/store/authStore", () => {
  const state = { user: { uid: "u1", name: "Tester", role: "tech_admin" } };
  return { useAuthStore: (select: (s: any) => unknown) => select(state) };
});
vi.mock("@/services/geminiService", () => ({
  generateAdAssets: vi.fn(), generatePosterConcepts: vi.fn(), refinePosterConcept: vi.fn(), DEFAULT_POSTER_CONCEPT_COUNT: 3,
  generateStockImagePrompts: vi.fn(), refineStockImagePrompt: vi.fn(), generateOverlayTexts: vi.fn(),
  refineOverlayImagePrompt: vi.fn(), refineSection: vi.fn(), refineVoiceOver: vi.fn(), refineVeoPrompts: vi.fn(),
  regenerateVeoForClips: vi.fn(), extractBusinessNameFromInfo: () => "",
}));

const { default: AIPlatformApp } = await import("@/components/ai-platform/AIPlatformApp");
const gemini = await import("@/services/geminiService");

afterEach(cleanup);

const open = () => render(<AIPlatformApp onClose={() => {}} />);
const choosePack = (id: string) =>
  fireEvent.change(screen.getByDisplayValue("No — normal ad with a model"), { target: { value: id } });

describe("the AI platform inputs", () => {
  it("has a BUSINESS CONTENT box and a FRAME / BACKGROUND INSTRUCTIONS box", () => {
    open();
    expect(screen.getByTestId("business-content")).toBeTruthy();
    expect(screen.getByTestId("frame-instructions")).toBeTruthy();
  });

  it("highlights the route for a PDF or document: extract it in Gemini, paste it as text", () => {
    open();
    const guide = screen.getByTestId("document-guidance");
    expect(guide.textContent).toMatch(/Gemini/);
    expect(guide.textContent).toMatch(/BUSINESS CONTENT/);
    expect(screen.getByTestId("copy-extraction-prompt")).toBeTruthy();
    // No upload box takes documents any more.
    for (const input of Array.from(document.querySelectorAll("input[type=file]"))) {
      expect((input as HTMLInputElement).accept, input.outerHTML).not.toMatch(/pdf|\.docx?|\.txt/i);
    }
  });

  it("asks for the owner's photo only for a Real Owner Face ad", () => {
    open();
    expect(screen.queryByTestId("owner-image-slot")).toBeNull();
    choosePack("owner_face_male");
    expect(screen.getByTestId("owner-image-slot").textContent).toMatch(/UPLOAD OWNER IMAGE/i);
  });

  it("asks who the Custom Character is", () => {
    open();
    expect(screen.queryByTestId("platform-custom-character")).toBeNull();
    choosePack("custom_character");
    expect(screen.getByTestId("platform-custom-character")).toBeTruthy();
  });

  it("offers the three human duos", () => {
    open();
    const select = screen.getByDisplayValue("No — normal ad with a model") as HTMLSelectElement;
    const ids = Array.from(select.options).map((o) => o.value);
    expect(ids).toEqual(expect.arrayContaining(["human_duo_female", "human_duo_male", "human_duo_mixed"]));
  });

  it("shows what it heard and planned, and makes each overlay an image prompt with its own refine", async () => {
    vi.mocked(gemini.generateAdAssets).mockResolvedValue({
      businessInfo: { name: "Sharma Electronics" },
      mainFramePrompts: ["Frame one.", "Frame two."],
      headerPrompt: "VIDEO BOTTOM LABEL — …",
      posterPrompt: "{}",
      voiceOverScript: "0-8: Line one.\n8-16: Line two.",
      veoPrompts: ["Veo one.", "Veo two."],
      hasProductImages: false, productImageCount: 0, stockImagePrompts: null,
      voiceBrief: { transcript: "we open at six", summary: "Open at 6 am.", requirements: ["Say we open at 6 am"], conflicts: [] },
      sceneContext: {
        motive: "a two-wheeler service centre", category: "business promotion", setting: "the workshop", mood: "confident",
        avoid: [], clips: [{ clip: 1, background: "the service bay", elements: [] }, { clip: 2, background: "the spare-parts rack", elements: [] }],
      },
    } as any);
    vi.mocked(gemini.generateOverlayTexts).mockResolvedValue([
      { clip: 1, text: "SAME-DAY SERVICE", soundEffect: "whoosh", fromWord: "Line", toWord: "one",
        imagePrompt: 'Premium 3D text "SAME-DAY SERVICE" — brushed steel letters.', imageDesign: "brushed steel letters" },
    ] as any);

    open();
    fireEvent.click(screen.getByLabelText(/NO LOGO/));
    fireEvent.change(screen.getByPlaceholderText("BUSINESS NAME"), { target: { value: "Sharma Electronics" } });
    fireEvent.click(screen.getByText("Start Generation"));

    expect((await screen.findByTestId("voice-brief")).textContent).toContain("Say we open at 6 am");
    expect(screen.getByTestId("scene-plan").textContent).toContain("the spare-parts rack");
    expect(screen.getByText("2. VIDEO BOTTOM LABEL")).toBeTruthy();

    const generator = screen.getByTestId("overlay-image-generator");
    expect(generator.textContent).toContain("7. Overlay Text Image Generator");
    fireEvent.click(screen.getAllByText("Generate").find((el) => generator.contains(el))!);
    expect((await screen.findByTestId("overlay-image-prompt")).textContent).toContain('"SAME-DAY SERVICE"');
    expect(screen.getByTestId("overlay-cue").textContent).toBe("From “Line” → To “one”");
    expect(screen.getByTestId("overlay-refine")).toBeTruthy();
    // The frames were asked for with the name board — no logo, and no logo file sent.
    expect(vi.mocked(gemini.generateAdAssets).mock.calls[0][0]).toMatchObject({ noLogo: true, logoNameText: "SHARMA ELECTRONICS" });
  });

  it("shows a two-person category the speaker-line format for a custom script", () => {
    open();
    choosePack("human_duo_female");
    fireEvent.click(screen.getByLabelText(/Use Custom Script/));
    const format = screen.getByTestId("custom-script-duo-format").textContent || "";
    expect(format).toContain("[Friend]:");
    expect(format).toContain("[Host]:");
  });
});
