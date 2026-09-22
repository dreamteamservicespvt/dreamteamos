/**
 * The scene plan — what the video is ABOUT, and where each clip is set — decided once, before any
 * frame is written.
 *
 * ── Why the frames needed this ───────────────────────────────────────────────────────────────────
 * The frame prompts chose backgrounds from the BUSINESS TYPE alone (services/prompts
 * detectBusinessType → a location ladder for that trade). That breaks in two ways the team kept
 * hitting:
 *   1. The video is often not "about the shop". An annadanam (free food donation) video, a temple
 *      introduction, birthday wishes, a wedding or housewarming invitation — each has its own world,
 *      and a trade ladder has no rung for any of them, so the frames came back as a generic office
 *      or store behind a line about serving food to devotees.
 *   2. Even for a shop, the same ladder was read for every clip, and the frames repeated the same
 *      corner behind different lines.
 *
 * So one call reads everything — the business content, the team's frame instructions (the highest
 * priority when present), the voice-over clip by clip, the ad type and festival — and returns the
 * motive, the world, and one DIFFERENT background per clip that proves that clip's line. The frame
 * prompts are then written against that plan, and each frame carries its planned background.
 */

import { CAMERA_MOVES, SHOT_ANGLES, STAGINGS } from "./motion";

export interface ScenePlanPromptInput {
  clipCount: number;
  adType: string;
  festivalName?: string;
  /** Who is on screen: "a female brand ambassador", "Motu and Patlu", "two real people". */
  subject: string;
  /** Two people or characters share each clip — the camera can follow the speaker. */
  twoHander?: boolean;
  /** A deity is on screen — it never walks. */
  deity?: boolean;
}

/** The how-to-film options, as the planner reads them: "walk_and_talk (Walk and talk)". */
const optionsOf = (record: Record<string, { name: string }>, skip: string[] = []) =>
  Object.entries(record).filter(([k]) => !skip.includes(k)).map(([k, v]) => `${k} (${v.name})`).join(", ");

export const SCENE_PLAN_SYSTEM_PROMPT = (input: ScenePlanPromptInput): string => {
  const { clipCount, adType, festivalName, subject, twoHander = false, deity = false } = input;
  const festival = adType === "festival" && festivalName?.trim() ? festivalName.trim() : "";
  return `You are the production designer of a premium Indian television commercial. Before a single frame is drawn, you decide what this video is really ABOUT and where each of its ${clipCount} clips is set.

YOU RECEIVE:
• BUSINESS CONTENT — the facts the team gave about the client.
• FRAME / BACKGROUND INSTRUCTIONS — what the team wants the frames to look like. When present, this is the HIGHEST priority: follow it exactly, and only fill in what it leaves open.
• BUSINESS INFORMATION — everything extracted from the visiting card, flyers, photos and voice notes.
• THE VOICE-OVER, clip by clip — what is said in each 8-second clip.
• AD TYPE${festival ? ` — a ${festival} festival greeting` : ""}.

STEP 1 — THE MOTIVE. Decide what this video is actually about, from ALL of the above — not only from the business type. Examples of how different the answer can be:
• an annadanam / free food donation → a temple or community dining hall, devotees seated in rows being served on banana leaves, big serving vessels, volunteers, prasadam;
• a temple introduction → the temple's own gopuram, courtyard, mandapam, sanctum entrance, lamps and bells;
• birthday wishes → a warmly decorated birthday setting: balloons, a cake table, lights, family warmth;
• a wedding / housewarming / opening ceremony / naming ceremony invitation → that event's venue and decoration: mandap, flower arches, entrance torans, welcome setup, auspicious lamps;
• festival wishes from a business → the business's own premises dressed for ${festival || "that festival"} with its exact decorations;
• an ordinary business promotion → the real working premises of THAT business.

STEP 2 — THE WORLD. One setting all clips belong to, so the ad is one coherent place (the same temple, the same venue, the same shop) — never a jump to somewhere unrelated.

STEP 3 — ONE BACKGROUND PER CLIP. For each clip, the background that PROVES what that clip says, inside that world:
• read that clip's line and show the real thing it talks about — the food being served when it talks about food, the sanctum when it talks about the deity, the cake when it talks about the celebration, the stock when it talks about the products;
• EVERY clip's background is DIFFERENT from every other clip's — a different part of the place with different real things in it. Two clips that look like the same corner is a failure;
• realistic, photographable and Indian; real objects only; no readable text, banners, posters or signage apart from the client's own logo or name board;
• ${subject} stands IN that background, with space to present from where they stand — never in a doorway, never outside on a road, never in a different building from the world.

STEP 4 — WHAT TO AVOID. Things that would contradict the motive (e.g. for an annadanam: no restaurant billing counter, no menu board, no price tags).

STEP 5 — HOW EACH CLIP IS FILMED. A premium ad is dynamic: not every clip the same. For each clip choose, from what its line says, the kind of video and its background:
• "staging" — one of: ${optionsOf(STAGINGS, deity ? ["walk_and_talk", "welcome_invite"] : ["welcome_invite"])}.
  – stand_present for a promise, trust, a greeting or a wish; show_product when the line names something that can be shown; present_space when it is about the place itself${deity ? "" : "; walk_and_talk when the line suits a walk through the place AND that clip's background has a clear, open stretch of floor (an aisle, open floor) — plan that floor into the background"}.
  – Mix them across the ad. The last clip always invites the viewer in — the code sets it; never a goodbye.
• "camera" — one of: ${optionsOf(CAMERA_MOVES, ["handheld", "static_locked"])}. Match it to the staging: follow_tracking or truck for a walk, push_in or tilt_down for a product, pan / dolly_out / crane_down for the space, dolly_in or arc for a promise, orbit for a hero introduction, pull_back or crane_up to end. Never the same move in two neighbouring clips.
• "angle" — one of: ${optionsOf(SHOT_ANGLES)}. Eye level for most; low angle for a powerful hero; high angle for an overview; over-the-shoulder for a conversation or a product reveal.${twoHander ? `
• "focus" — "speaker" when the camera should ease in on whoever is talking (Motu while Motu speaks, then Patlu) or "both" for a two-shot. Use "speaker" on some clips, not all.` : ""}

Return ONLY this JSON, no markdown:
{
  "motive": "<one line: what the video is about>",
  "category": "<business promotion | festival wishes | temple | food donation | birthday wishes | invitation | event | other>",
  "setting": "<the one world all clips are set in, in a phrase>",
  "mood": "<the feeling the frames carry, in a phrase>",
  "avoid": ["<thing that contradicts the motive>", "..."],
  "clips": [
    { "clip": 1, "background": "<the background for clip 1, one clear sentence naming the real place and what is in it>", "elements": ["<real object>", "<real object>", "<real object>"], "staging": "<staging key>", "camera": "<camera key>", "angle": "<angle key>"${twoHander ? ', "focus": "speaker | both"' : ""} }
  ]
}
There must be exactly ${clipCount} objects in "clips", numbered 1 to ${clipCount}.`;
};

/** The user message for the scene plan call. */
export function scenePlanUserPrompt(input: {
  businessContent: string;
  frameInstructions: string;
  businessInfo: unknown;
  clipLines: string[];
  adType: string;
  festivalName?: string;
}): string {
  const lines = input.clipLines.map((l, i) => `Clip ${i + 1}: ${l}`).join("\n");
  return `BUSINESS CONTENT (from the team):
${input.businessContent.trim() || "(none typed)"}

FRAME / BACKGROUND INSTRUCTIONS (HIGHEST PRIORITY):
${input.frameInstructions.trim() || "(none — decide from the content, the business information and the voice-over)"}

BUSINESS INFORMATION:
${JSON.stringify(input.businessInfo ?? {}, null, 2)}

AD TYPE: ${input.adType}${input.adType === "festival" && input.festivalName ? `\nFESTIVAL: ${input.festivalName}` : ""}

THE VOICE-OVER, CLIP BY CLIP:
${lines}

Write the scene plan now.`;
}
