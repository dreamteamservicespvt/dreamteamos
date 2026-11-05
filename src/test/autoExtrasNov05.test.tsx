import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

configure({ testIdAttribute: "data-test" });

/**
 * 2026-11-05 — the owner: "in the ads platform after generating the 1 to 5 deliverables then automatically generate
 * the remaining 6, 7 deliverables." Rows 6 (B-roll) and 7 (overlays) are filled by the studio itself
 * (`fillMissingExtras`) whenever a video kit has 1 – 5 without them: after a run that could not write them, after a
 * first attempt that failed, and when a saved kit is reopened. The text comes first, the B-roll is written knowing it.
 * Firebase and every Gemini call are faked.
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
  generateAdAssets: vi.fn(), generatePosterConcepts: vi.fn(), refinePosterConcept: vi.fn(), refineVideoPoster: vi.fn(), DEFAULT_POSTER_CONCEPT_COUNT: 3,
  generateStockImagePrompts: vi.fn(), refineStockImagePrompt: vi.fn(), generateOverlayTexts: vi.fn(),
  refineOverlayImagePrompt: vi.fn(), refineSection: vi.fn(), refineVoiceOver: vi.fn(), refineVeoPrompts: vi.fn(),
  regenerateVeoForClips: vi.fn(), extractBusinessNameFromInfo: (info: any) => info?.name || "",
  buildVideoBottomLabel: vi.fn(() => "VIDEO BOTTOM LABEL"), writeVideoPosterPrompt: vi.fn(),
}));

const { default: AIPlatformApp } = await import("@/components/ai-platform/AIPlatformApp");
const gemini = await import("@/services/geminiService");

const job = (patch: Record<string, unknown> = {}) => ({
  id: "a1", assignedTo: "u1", assignedBy: "admin", category: "promotional", clipCount: 2, includesEndCredits: true,
  duration: "16s", pricePerUnit: 0, totalPrice: 0, uniqueId: "P42", accessCode: "1234", displayTitle: "Sri Sai Motors",
  businessName: "Sri Sai Motors", status: "in_progress", sessions: [], totalDurationSeconds: 0, date: "2026-11-05",
  modelGender: "female", attireType: "professional", aspectRatio: "9:16", language: "Telugu", realLocationProvided: false,
  ...patch,
}) as any;

const OVERLAYS = [{ clip: 1, text: "SAME-DAY SERVICE", soundEffect: "whoosh" }];
const BROLL = [{ id: 1, clip: 1, concept: "The bay", prompt: "A service bay." }];

/** Deliverables 1 – 5, without 6 and 7. */
const kit = (patch: Record<string, unknown> = {}) => ({
  businessInfo: { name: "Sri Sai Motors", contactNumbers: ["9848012345"] },
  mainFramePrompts: ["Frame one.", "Frame two."], headerPrompt: "LABEL", posterPrompt: "POSTER",
  voiceOverScript: "0-8: Line one.\n8-16: Line two.", veoPrompts: ["Veo one.", "Veo two."],
  hasProductImages: false, productImageCount: 0, stockImagePrompts: null, overlayTexts: null,
  ...patch,
});

beforeEach(() => {
  savedKit.current = null;
  vi.mocked(gemini.generateStockImagePrompts).mockResolvedValue(BROLL as any);
  vi.mocked(gemini.generateOverlayTexts).mockResolvedValue(OVERLAYS as any);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const run = async () => {
  fireEvent.change(screen.getByTestId("business-content"), { target: { value: "Sri Sai Motors — bike service. Call 9848012345." } });
  fireEvent.click(screen.getByLabelText(/NO LOGO/));
  fireEvent.change(screen.getByPlaceholderText("BUSINESS NAME"), { target: { value: "Sri Sai Motors" } });
  fireEvent.click(screen.getByText("Start Generation"));
  await screen.findByText("Deliverables");
};

/** Rows 6 and 7 hold content (no Writing… / Missing / Failed state chip). */
const bothFilled = async () => waitFor(() => {
  expect(screen.queryByTestId("row-state-stock")).toBeNull();
  expect(screen.queryByTestId("row-state-overlay")).toBeNull();
}, { timeout: 8000 });

describe("after a run that wrote 1 – 5 only", () => {
  it("writes 7 then 6 by itself — the B-roll knowing the overlays", async () => {
    vi.mocked(gemini.generateAdAssets).mockResolvedValue(kit() as any);
    render(<AIPlatformApp onClose={() => {}} />);
    await run();
    await bothFilled();
    expect(gemini.generateOverlayTexts).toHaveBeenCalledTimes(1);
    expect(gemini.generateStockImagePrompts).toHaveBeenCalledTimes(1);
    const order = (fn: any) => vi.mocked(fn).mock.invocationCallOrder[0];
    expect(order(gemini.generateOverlayTexts)).toBeLessThan(order(gemini.generateStockImagePrompts));
    expect((vi.mocked(gemini.generateStockImagePrompts).mock.calls[0][7] as any).overlays).toEqual(OVERLAYS);
  }, 20000);

  it("treats an empty overlay list as missing", async () => {
    vi.mocked(gemini.generateAdAssets).mockResolvedValue(kit({ overlayTexts: [], stockImagePrompts: BROLL }) as any);
    render(<AIPlatformApp onClose={() => {}} />);
    await run();
    await bothFilled();
    expect(gemini.generateOverlayTexts).toHaveBeenCalledTimes(1);
    expect(gemini.generateStockImagePrompts).not.toHaveBeenCalled();
  }, 20000);

  it("tries each one a second time when the first attempt fails", async () => {
    vi.mocked(gemini.generateAdAssets).mockResolvedValue(kit() as any);
    vi.mocked(gemini.generateOverlayTexts).mockRejectedValueOnce(new Error("busy"));
    vi.mocked(gemini.generateStockImagePrompts).mockRejectedValueOnce(new Error("busy"));
    render(<AIPlatformApp onClose={() => {}} />);
    await run();
    await bothFilled();
    expect(gemini.generateOverlayTexts).toHaveBeenCalledTimes(2);
    expect(gemini.generateStockImagePrompts).toHaveBeenCalledTimes(2);
  }, 20000);

  it("asks nothing more when the run already wrote both", async () => {
    vi.mocked(gemini.generateAdAssets).mockResolvedValue(kit({ overlayTexts: OVERLAYS, stockImagePrompts: BROLL }) as any);
    render(<AIPlatformApp onClose={() => {}} />);
    await run();
    await new Promise((r) => setTimeout(r, 300));
    expect(gemini.generateOverlayTexts).not.toHaveBeenCalled();
    expect(gemini.generateStockImagePrompts).not.toHaveBeenCalled();
  }, 20000);
});

describe("a saved kit reopened without 6 and 7", () => {
  it("gets them on opening the job", async () => {
    savedKit.current = {
      ...kit(), adType: "commercial", festivalName: "", gender: "female", attireType: "professional",
      customAttire: "", aspectRatio: "9:16", language: "Telugu", characterPack: null, locationMode: "ai_generated",
      duration: 16, creationMode: "video",
    };
    render(<AIPlatformApp assignment={job({ savedGenerationId: "old" })} assignmentId="a1" onClose={() => {}} />);
    await screen.findByText("Deliverables");
    await bothFilled();
    expect(gemini.generateAdAssets).not.toHaveBeenCalled();
    expect(gemini.generateOverlayTexts).toHaveBeenCalledTimes(1);
    expect(gemini.generateStockImagePrompts).toHaveBeenCalledTimes(1);
  }, 20000);
});
