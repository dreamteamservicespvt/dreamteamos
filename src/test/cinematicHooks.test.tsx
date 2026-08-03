import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * A step must survive its project disappearing underneath it.
 *
 * Every Cinematic Ads step used to start with `if (!project) return null;` — above a row of
 * `useCallback`s. React counts hooks per render, so the moment the project or its brief was
 * cleared while a step was on screen, the next render declared fewer hooks than the last and React
 * threw "Rendered fewer hooks than expected", taking the whole page down with it. The guard now
 * sits below every hook: hooks run unconditionally, only the markup is conditional.
 *
 * This mounts a step WITH a project and then takes it away, which is the exact sequence that
 * crashed. If the guard ever creeps back above the hooks, this fails.
 */

const state = vi.hoisted(() => ({ project: null as unknown }));

vi.mock("@/store/cinematicAdsStore", () => ({
  useCinematicAdsStore: () => ({
    project: state.project,
    setStories: vi.fn(),
    updateStory: vi.fn(),
    selectStory: vi.fn(),
    confirmStory: vi.fn(),
    pushStoryVersionHistory: vi.fn(),
    setProcessing: vi.fn(),
    processing: false,
    processingMessage: "",
  }),
}));
vi.mock("@/services/geminiService", () => ({
  generateStories: vi.fn(),
  refineStory: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const Step1 = (await import("@/components/cinematic-ads/Step1StoryGeneration")).default;

const withBrief = {
  clientBrief: { businessName: "Sharma Electronics" },
  stories: [],
  selectedStoryId: null,
  storyVersionHistory: [],
};

afterEach(() => cleanup());

describe("a cinematic step whose project vanishes", () => {
  it("renders nothing instead of throwing when the brief is cleared mid-session", () => {
    state.project = withBrief;
    const { rerender } = render(<Step1 />);
    expect(document.body.textContent?.trim().length).toBeGreaterThan(0);

    // The project is reset — "start over", a failed load, a switched client.
    state.project = null;
    expect(() => rerender(<Step1 />)).not.toThrow();
    expect(document.body.textContent?.trim()).toBe("");
  });

  it("comes back when the project returns, still without throwing", () => {
    state.project = null;
    const { rerender } = render(<Step1 />);
    expect(document.body.textContent?.trim()).toBe("");

    state.project = withBrief;
    expect(() => rerender(<Step1 />)).not.toThrow();
    expect(document.body.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("survives a brief that is missing while the project itself exists", () => {
    state.project = { ...withBrief, clientBrief: null };
    expect(() => render(<Step1 />)).not.toThrow();
    expect(document.body.textContent?.trim()).toBe("");
  });
});
