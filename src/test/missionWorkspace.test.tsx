import { describe, it, expect, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import {
  CHATGPT_URL, FLOW_URL, GEMINI_URL, buildMissionTasks, isTaskDone, missionStages, nextTaskId, runSummary, tabKey,
} from "@/components/ai-platform/generation/mission";
import { hasGeneratedAsset, type GenerationRun, type RunFacts } from "@/components/ai-platform/generation/run";
import { MissionWorkspace } from "@/components/ai-platform/generation/MissionWorkspace";
import { promptForPaste } from "@/components/ai-platform/generation/AIGuideSheet";
import type { RunProfile } from "@/utils/generationEta";

/**
 * The Mission Workspace fills the empty Generated Assets area while DTS generates, and hands the
 * member the setup that does not depend on the prompts' text: one ChatGPT tab per clip, the logo in
 * each, the location photos to hand, Flow open. These pin what it asks for, when it leaves, and
 * that it never asks for something the ad does not need.
 */

configure({ testIdAttribute: "data-test" });
afterEach(cleanup);

const FACTS: RunFacts = {
  mode: "video", clipCount: 4, aspectRatio: "9:16", hasLogo: true, nameBoard: false,
  onLocation: false, locationPhotos: 0, castLabel: "", conceptCount: 3,
};
const PROFILE: RunProfile = {
  mode: "video", clipCount: 4, fileCount: 2, locationPhotos: 0, characterPack: false, customScript: false, conceptCount: 3,
};

describe("the first asset", () => {
  // The generator's first snapshot is business info alone, a few seconds into the run.
  it("is not the business-info snapshot that arrives before any asset", () => {
    expect(hasGeneratedAsset(null)).toBe(false);
    expect(hasGeneratedAsset({ businessInfo: { name: "x" }, mainFramePrompts: [], veoPrompts: [], voiceOverScript: "", headerPrompt: "", posterPrompt: "" })).toBe(false);
    expect(hasGeneratedAsset({ mainFramePrompts: ["  "], veoPrompts: [""] })).toBe(false);
  });

  it("is any real asset — the voice-over usually, the concepts for a poster run", () => {
    expect(hasGeneratedAsset({ voiceOverScript: "0-8: hello" })).toBe(true);
    expect(hasGeneratedAsset({ mainFramePrompts: ["frame"] })).toBe(true);
    expect(hasGeneratedAsset({ headerPrompt: "header" })).toBe(true);
    expect(hasGeneratedAsset({ posterConcepts: [{} as any] })).toBe(true);
  });
});

describe("the member's tasks", () => {
  it("opens one ChatGPT tab per clip, then logo, location, Flow, paste", () => {
    const tasks = buildMissionTasks(FACTS);
    expect(tasks.map((t) => t.id)).toEqual(["tabs", "logo", "location", "flow", "paste"]);
    expect(tasks[0]).toMatchObject({ kind: "tabs", tabs: 4, href: CHATGPT_URL, title: "Open 4 ChatGPT tabs" });
    expect(tasks[3]).toMatchObject({ kind: "link", href: FLOW_URL });
    expect(tasks[3].detail).toContain("9:16");
  });

  it("asks for the location photos only when the ad is shot on location", () => {
    const onLocation = buildMissionTasks({ ...FACTS, onLocation: true, locationPhotos: 3 }).find((t) => t.id === "location")!;
    expect(onLocation.kind).toBe("check");
    expect(onLocation.title).toBe("Keep the 3 location photos beside the tabs");
    expect(onLocation.detail).toContain("ATTACH STORE/OFFICE IMAGE #N");

    const ai = buildMissionTasks(FACTS).find((t) => t.id === "location")!;
    expect(ai.kind).toBe("info");
  });

  it("does not ask for a logo that does not exist", () => {
    const nameBoard = buildMissionTasks({ ...FACTS, hasLogo: false, nameBoard: true }).find((t) => t.id === "logo")!;
    expect(nameBoard.kind).toBe("info");
    expect(nameBoard.detail).toContain("name board");
  });

  it("speaks in the singular for a one-clip ad", () => {
    const tasks = buildMissionTasks({ ...FACTS, clipCount: 1 });
    expect(tasks[0].title).toBe("Open 1 ChatGPT tab");
    expect(tasks.find((t) => t.id === "logo")!.title).toBe("Attach the client logo in the tab");
  });

  it("sends a poster run to Gemini, one tab per concept", () => {
    const tasks = buildMissionTasks({ ...FACTS, mode: "poster", conceptCount: 5 });
    expect(tasks[0]).toMatchObject({ kind: "tabs", tabs: 5, href: GEMINI_URL });
    expect(tasks.some((t) => t.href === FLOW_URL)).toBe(false);
  });

  it("counts a tabs task done when every tab is open, or when ticked outright", () => {
    const [tabs] = buildMissionTasks({ ...FACTS, clipCount: 2 });
    expect(isTaskDone(tabs, { [tabKey(tabs, 0)]: true })).toBe(false);
    expect(isTaskDone(tabs, { [tabKey(tabs, 0)]: true, [tabKey(tabs, 1)]: true })).toBe(true);
    expect(isTaskDone(tabs, { tabs: true })).toBe(true);
  });

  it("lights the first actionable task not yet done, skipping notes", () => {
    const tasks = buildMissionTasks(FACTS);
    expect(nextTaskId(tasks, {})).toBe("tabs");
    expect(nextTaskId(tasks, { tabs: true })).toBe("logo");
    expect(nextTaskId(tasks, { tabs: true, logo: true })).toBe("flow");
    expect(nextTaskId(tasks, { tabs: true, logo: true, flow: true })).toBeNull();
  });

  it("summarises the run in one line", () => {
    expect(runSummary({ ...FACTS, castLabel: "Motu Patlu", onLocation: true })).toBe("4 clips · 9:16 · Motu Patlu · shot on location");
    expect(runSummary({ ...FACTS, mode: "poster", conceptCount: 1 })).toBe("1 poster concept");
  });
});

describe("DTS's stages", () => {
  it("follows the run through the brief, the core message, the voice-over, the frames and the video direction", () => {
    const at = (percent: number) => missionStages(PROFILE, [{ percent, at: 0 }]).map((s) => `${s.label}:${s.state}`);
    expect(at(10)).toEqual(["Reading the brief:active", "Core message:upcoming", "Voice-over:upcoming", "Frames & poster:upcoming", "Video direction:upcoming"]);
    expect(at(15)).toEqual(["Reading the brief:done", "Core message:active", "Voice-over:upcoming", "Frames & poster:upcoming", "Video direction:upcoming"]);
    expect(at(20)).toEqual(["Reading the brief:done", "Core message:done", "Voice-over:active", "Frames & poster:upcoming", "Video direction:upcoming"]);
    expect(at(85)).toEqual(["Reading the brief:done", "Core message:done", "Voice-over:done", "Frames & poster:done", "Video direction:active"]);
    expect(at(100).every((s) => s.endsWith(":done"))).toBe(true);
  });

  it("shows the location scout only for an ad shot on location", () => {
    const labels = missionStages({ ...PROFILE, locationPhotos: 4 }, [{ percent: 40, at: 0 }]);
    expect(labels.map((s) => s.label)).toContain("Location scout");
    expect(labels.find((s) => s.label === "Location scout")!.state).toBe("active");
  });
});

describe("pasting from the guide", () => {
  it("hands over the prompt without the member's instruction or markdown fences", () => {
    expect(promptForPaste("📎 ATTACH STORE/OFFICE IMAGE #2 — the counter\n\n```\nA woman at the counter\n```")).toBe("A woman at the counter");
    expect(promptForPaste("Plain prompt")).toBe("Plain prompt");
  });
});

describe("the workspace on screen", () => {
  const run = (facts: Partial<RunFacts> = {}): GenerationRun => ({
    id: Date.now(), profile: PROFILE, checkpoints: [{ percent: 20, at: Date.now() }], facts: { ...FACTS, ...facts },
  });

  function renderWorkspace(r = run()) {
    let done: Record<string, boolean> = {};
    const utils = render(
      <MissionWorkspace run={r} done={done} onToggle={(k, v) => { done = { ...done, [k]: v }; rerender(); }} isDark={false} />,
    );
    function rerender() {
      utils.rerender(<MissionWorkspace run={r} done={done} onToggle={(k, v) => { done = { ...done, [k]: v }; rerender(); }} isDark={false} />);
    }
    return utils;
  }

  it("shows an exact countdown, never a range", () => {
    renderWorkspace();
    const timer = screen.getByRole("timer");
    expect(timer.textContent).toMatch(/^\d+:\d{2}$/);
    expect(screen.getByTestId("mission-workspace").textContent).not.toMatch(/\d\s*[–-]\s*\d+\s*min/);
  });

  it("gives every clip its own tab link, one per click", () => {
    renderWorkspace();
    for (let i = 1; i <= 4; i++) {
      const tab = screen.getByTestId(`mission-tab-${i}`) as HTMLAnchorElement;
      expect(tab.href).toBe(CHATGPT_URL);
      expect(tab.target).toBe("_blank");
    }
  });

  it("ticks the tabs off as they are opened and moves the highlight on", () => {
    renderWorkspace(run({ clipCount: 2 }));
    expect(screen.getByTestId("mission-ready-count").textContent).toBe("0 of 3 ready");
    fireEvent.click(screen.getByTestId("mission-tab-1"));
    fireEvent.click(screen.getByTestId("mission-tab-2"));
    expect(screen.getByTestId("mission-ready-count").textContent).toBe("1 of 3 ready");
    expect(screen.getByTestId("mission-task-logo").textContent).toContain("Next");
  });

  it("lets the member tick a task by hand", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("checkbox", { name: /Attach the client logo/ }));
    expect(screen.getByRole("checkbox", { name: /Attach the client logo/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("names the special category and the location in its summary", () => {
    renderWorkspace(run({ castLabel: "Ganesha", onLocation: true, locationPhotos: 2 }));
    expect(screen.getByTestId("mission-workspace").textContent).toContain("4 clips · 9:16 · Ganesha · shot on location");
  });
});
