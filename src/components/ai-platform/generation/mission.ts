/**
 * What the member does while DTS generates — and where DTS is in its own work.
 *
 * ── Why the wait is a workspace and not a loading screen ───────────────────────────────────────
 * A generation hands the member a stack of prompts that are only useful once they are somewhere
 * else: each Main Frame prompt goes into its own ChatGPT tab with the client's logo (and, for an ad
 * shot on location, the named location photo) attached, and the frames then go into Flow with the
 * video prompts. None of that setup depends on the prompts' text. So every minute spent watching a
 * progress bar is a minute of setup done afterwards instead — this turns that minute into the setup.
 *
 * Pure data, so the workspace and the reopened guide render the same list from the same facts.
 */
import type { Checkpoint } from "@/utils/generationEta";
import { planFor, segmentAt, type RunProfile } from "@/utils/generationEta";
import type { RunFacts } from "./run";

export const CHATGPT_URL = "https://chatgpt.com/";
export const FLOW_URL = "https://labs.google/fx/tools/flow";
/** Posters run in Gemini, whose image model takes the attached logo. See PosterConceptsPanel. */
export const GEMINI_URL = "https://gemini.google.com/app";

export type MissionTaskKind =
  /** Open N browser tabs — one link per tab, because a page may open only one tab per click. */
  | "tabs"
  /** Open one external tool. */
  | "link"
  /** Something to do by hand; the member ticks it. */
  | "check"
  /** Nothing to do — says so, so its absence is not mistaken for a forgotten step. */
  | "info";

export interface MissionTask {
  id: string;
  kind: MissionTaskKind;
  title: string;
  detail: string;
  href?: string;
  linkLabel?: string;
  /** For "tabs": how many to open. */
  tabs?: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The parallel work for this run, in the order it is worth doing. */
export function buildMissionTasks(facts: RunFacts): MissionTask[] {
  if (facts.mode === "poster") return posterTasks(facts);

  const n = Math.max(1, facts.clipCount);
  const tasks: MissionTask[] = [
    {
      id: "tabs",
      kind: "tabs",
      title: `Open ${plural(n, "ChatGPT tab")}`,
      detail: n === 1
        ? "One tab for the Main Frame prompt. Opening it now means the prompt goes straight in."
        : `One tab per clip, in order. Main Frame prompt 1 goes into tab 1, prompt 2 into tab 2, and so on.`,
      href: CHATGPT_URL,
      tabs: n,
    },
    logoTask(facts, n, "tab"),
    facts.onLocation
      ? {
          id: "location",
          kind: "check",
          title: `Keep the ${plural(facts.locationPhotos, "location photo")} beside the tabs`,
          detail: "This ad is shot in the client's own premises. Each Main Frame prompt names the exact photo "
            + "to attach, as \"ATTACH STORE/OFFICE IMAGE #N\", so have them in one folder, numbered in upload order.",
        }
      : {
          id: "location",
          kind: "info",
          title: "Background is built by AI",
          detail: "No location photos go into the tabs for this ad. If the client sends photos of their "
            + "premises, set Background to Real before the next run and every clip is shot in them.",
        },
    {
      id: "flow",
      kind: "link",
      title: "Open Flow and keep it ready",
      detail: `Start a ${facts.aspectRatio} project for ${plural(n, "cinematic clip")}. The frames go in first, `
        + "then each clip's video prompt.",
      href: FLOW_URL,
      linkLabel: "Open Flow",
    },
    {
      id: "paste",
      kind: "info",
      title: "Paste each prompt as it lands",
      detail: "The voice-over arrives first, then the frames, poster and video prompts. Copy each Main Frame "
        + "prompt into its own tab — the AI Guide keeps this list open beside you.",
    },
  ];
  return tasks;
}

function posterTasks(facts: RunFacts): MissionTask[] {
  const n = Math.max(1, facts.conceptCount);
  return [
    {
      id: "tabs",
      kind: "tabs",
      title: `Open ${plural(n, "Gemini tab")}`,
      detail: "One tab per poster concept. Gemini's image model takes the attached logo with each prompt.",
      href: GEMINI_URL,
      tabs: n,
    },
    logoTask(facts, n, "tab"),
    {
      id: "paste",
      kind: "info",
      title: "Concepts arrive together",
      detail: "Every concept lands at once when DTS finishes. Paste each image prompt into its own tab.",
    },
  ];
}

function logoTask(facts: RunFacts, n: number, unit: string): MissionTask {
  if (facts.hasLogo) {
    return {
      id: "logo",
      kind: "check",
      title: n === 1 ? `Attach the client logo in the ${unit}` : `Attach the client logo in every ${unit}`,
      detail: n === 1
        ? "The prompt refers to \"the attached logo\" and never describes it, so the file has to be there."
        : `Drop the same logo file into all ${n} ${unit}s now. Every prompt refers to "the attached logo" and never describes it.`,
    };
  }
  return {
    id: "logo",
    kind: "info",
    title: "No logo to attach",
    detail: facts.nameBoard
      ? "This ad renders the business name as a name board, so the tabs need no logo file."
      : "No logo was provided for this run.",
  };
}

/** The tasks a member can act on — the ones that count towards "ready". */
export const actionableTasks = (tasks: MissionTask[]) => tasks.filter((t) => t.kind !== "info");

/**
 * Whether a task is done.
 *
 * A "tabs" task is done when every tab in it has been opened, or when the member ticks it outright
 * — they may already have the tabs open from the last ad.
 */
export function isTaskDone(task: MissionTask, done: Record<string, boolean>): boolean {
  if (done[task.id]) return true;
  if (task.kind === "tabs" && task.tabs) {
    return Array.from({ length: task.tabs }, (_, i) => done[tabKey(task, i)]).every(Boolean);
  }
  return false;
}

export const tabKey = (task: MissionTask, index: number) => `${task.id}:${index + 1}`;

/** The first thing still worth doing, which the workspace highlights. */
export function nextTaskId(tasks: MissionTask[], done: Record<string, boolean>): string | null {
  return actionableTasks(tasks).find((t) => !isTaskDone(t, done))?.id ?? null;
}

// ── DTS's side of the work ──────────────────────────────────────────────────────────────────────

export type StageState = "done" | "active" | "upcoming";

export interface MissionStage {
  key: string;
  label: string;
  state: StageState;
}

/** What each stretch of the plan is, in words a member reads. Several stretches can share one. */
const STAGE_OF: Record<string, { key: string; label: string }> = {
  "video.prep": { key: "brief", label: "Reading the brief" },
  "video.extract": { key: "brief", label: "Reading the brief" },
  "video.script": { key: "script", label: "Voice-over" },
  "video.scout": { key: "scout", label: "Location scout" },
  "video.assets": { key: "assets", label: "Frames, poster & video prompts" },
  "poster.prep": { key: "brief", label: "Reading the brief" },
  "poster.extract": { key: "brief", label: "Reading the brief" },
  "poster.handoff": { key: "brief", label: "Reading the brief" },
  "poster.concepts": { key: "concepts", label: "Poster concepts" },
  "poster.fill": { key: "concepts", label: "Poster concepts" },
};

/** The pipeline as a few named stages, with where this run is in it. */
export function missionStages(profile: RunProfile, checkpoints: Checkpoint[]): MissionStage[] {
  const plan = planFor(profile);
  const stages: { key: string; label: string }[] = [];
  for (const seg of plan) {
    const stage = STAGE_OF[seg.key];
    if (stage && !stages.some((s) => s.key === stage.key)) stages.push(stage);
  }
  const last = checkpoints[checkpoints.length - 1]?.percent ?? 0;
  if (last >= 100) return stages.map((s) => ({ ...s, state: "done" }));
  const activeKey = STAGE_OF[segmentAt(plan, last).key]?.key;
  const activeIndex = Math.max(0, stages.findIndex((s) => s.key === activeKey));
  return stages.map((s, i) => ({
    ...s,
    state: i < activeIndex ? "done" : i === activeIndex ? "active" : "upcoming",
  }));
}

/** One line describing the run, e.g. "4 clips · 9:16 · Motu Patlu · shot on location". */
export function runSummary(facts: RunFacts): string {
  if (facts.mode === "poster") return plural(Math.max(1, facts.conceptCount), "poster concept");
  return [
    plural(Math.max(1, facts.clipCount), "clip"),
    facts.aspectRatio,
    facts.castLabel || null,
    facts.onLocation ? "shot on location" : null,
  ].filter(Boolean).join(" · ");
}
