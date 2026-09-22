/**
 * Reading, checking and applying the scene plan (services/prompts/scenePlan).
 *
 * Pure — no React, no Firestore, no model calls — so the rules that decide whether a plan is usable
 * and how it lands in each frame prompt are unit-tested on their own.
 */
import type { SceneContext } from "@/types/aiPlatform";
import { CAMERA_MOVES, SHOT_ANGLES, STAGINGS, type MotionChoice } from "@/services/prompts/motion";

const text = (v: unknown, max = 400): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** A background reduced to what makes it "the same place" — for spotting repeats. */
export function backgroundKey(background: string): string {
  return background
    .toLowerCase()
    // Latin letters and digits, plus every Indian script from Devanagari to Malayalam.
    .replace(/[^a-z0-9\u{0900}-\u{0D7F}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .sort()
    .join(" ");
}

const STOP_WORDS = new Set([
  "with", "from", "that", "this", "their", "there", "where", "which", "while", "real", "into", "shop",
  "store", "inside", "behind", "front", "near", "business", "area", "zone", "part", "clearly", "visible",
]);

/**
 * How alike two backgrounds read, 0–1, by the words that carry the place. Two plans that differ by
 * an adjective are still the same corner.
 */
export function backgroundSimilarity(a: string, b: string): number {
  const wa = new Set(backgroundKey(a).split(" ").filter(Boolean));
  const wb = new Set(backgroundKey(b).split(" ").filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / Math.min(wa.size, wb.size);
}

/** 1-based clip numbers whose background repeats an earlier clip's. */
export function repeatedBackgrounds(context: Pick<SceneContext, "clips">, threshold = 0.8): number[] {
  const repeats: number[] = [];
  context.clips.forEach((c, i) => {
    for (let j = 0; j < i; j++) {
      if (backgroundSimilarity(c.background, context.clips[j].background) >= threshold) {
        repeats.push(c.clip);
        return;
      }
    }
  });
  return repeats;
}

/**
 * The model's reply as a scene plan, or null when it is unusable.
 *
 * Usable means: a motive, and exactly one non-empty background for every clip. A plan with a missing
 * clip is rejected outright rather than padded — a padded clip is precisely a repeated background.
 */
export function parseScenePlan(raw: string, clipCount: number): SceneContext | null {
  if (!raw?.trim() || clipCount <= 0) return null;
  let data: any;
  try {
    data = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim());
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const rows: any[] = Array.isArray(data.clips) ? data.clips : [];
  const byClip = new Map<number, SceneContext["clips"][number]>();
  /** A how-to-film choice, kept only when it names one of the plan's own keys. */
  const keyOf = (value: unknown, keys: Record<string, unknown>) =>
    typeof value === "string" && Object.prototype.hasOwnProperty.call(keys, value.trim()) ? value.trim() : undefined;
  rows.forEach((row, position) => {
    const n = Number.isInteger(row?.clip) ? row.clip : position + 1;
    const background = text(row?.background);
    if (n >= 1 && n <= clipCount && background && !byClip.has(n)) {
      const elements = Array.isArray(row?.elements) ? row.elements.map((e: unknown) => text(e, 80)).filter(Boolean).slice(0, 6) : [];
      const staging = keyOf(row?.staging, STAGINGS);
      const camera = keyOf(row?.camera, CAMERA_MOVES);
      const angle = keyOf(row?.angle, SHOT_ANGLES);
      const focus = row?.focus === "speaker" || row?.focus === "both" ? row.focus : undefined;
      byClip.set(n, {
        clip: n, background, elements,
        ...(staging ? { staging } : {}), ...(camera ? { camera } : {}), ...(angle ? { angle } : {}), ...(focus ? { focus } : {}),
      });
    }
  });
  if (byClip.size !== clipCount) return null;
  const motive = text(data.motive, 200);
  if (!motive) return null;
  return {
    motive,
    category: text(data.category, 60) || "business promotion",
    setting: text(data.setting, 200),
    mood: text(data.mood, 120),
    avoid: Array.isArray(data.avoid) ? data.avoid.map((a: unknown) => text(a, 120)).filter(Boolean).slice(0, 8) : [],
    clips: Array.from({ length: clipCount }, (_, i) => byClip.get(i + 1)!),
  };
}

/** The scene plan's how-to-film choices, one per clip, for prompts/motion planClipMotion. */
export function motionChoicesOf(context: SceneContext | null | undefined): MotionChoice[] {
  return (context?.clips || []).map((c) => ({ staging: c.staging, camera: c.camera, angle: c.angle, focus: c.focus }));
}

/** One clip's planned background, as a single line for a prompt. */
export function sceneLineFor(context: SceneContext, clipIndex: number): string {
  const c = context.clips[clipIndex];
  if (!c) return "";
  return c.elements.length ? `${c.background} (with ${c.elements.join(", ")})` : c.background;
}

/** The whole plan, as the block a frame prompt reads. */
export function scenePlanBlock(context: SceneContext): string {
  return [
    `WHAT THIS VIDEO IS ABOUT: ${context.motive}`,
    context.setting ? `THE WORLD EVERY CLIP BELONGS TO: ${context.setting}` : "",
    context.mood ? `MOOD: ${context.mood}` : "",
    "CLIP-BY-CLIP BACKGROUND PLAN (each clip in its own, different background — never the same place twice):",
    ...context.clips.map((_, i) => `  Clip ${i + 1}: ${sceneLineFor(context, i)}`),
    context.avoid.length ? `NEVER SHOW (contradicts the motive): ${context.avoid.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

/** The heading code stamps onto each frame prompt — see withSceneBackground. */
export const SCENE_BACKGROUND_HEADING = "BACKGROUND FOR THIS CLIP";

/**
 * A finished frame prompt, guaranteed to carry its clip's planned background.
 *
 * Stamped in code for the same reason the composition note is: a frame model given a plan in its
 * system prompt still drifts back to the corner it drew last time. Idempotent.
 */
export function withSceneBackground(prompt: string, context: SceneContext | null | undefined, clipIndex: number): string {
  if (!context || !prompt.trim() || prompt.includes(SCENE_BACKGROUND_HEADING)) return prompt;
  const line = sceneLineFor(context, clipIndex);
  if (!line) return prompt;
  return `${prompt.trimEnd()}\n\n${SCENE_BACKGROUND_HEADING}: ${line}. This background is different from every other clip's, and it belongs to ${context.setting || "the same place as the rest of the ad"}.`;
}
