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

import { CAMERA_MOVES, SHOT_ANGLES, STAGINGS, castKindOf, type CameraMoveKey, type StagingKey } from "./motion";

export interface ScenePlanPromptInput {
  clipCount: number;
  adType: string;
  festivalName?: string;
  /** Who is on screen: "a female brand ambassador", "Motu and Patlu", "two real people". */
  subject: string;
  /** Two people or characters share each clip — the camera can follow the speaker. */
  twoHander?: boolean;
  /** A deity is on screen: it never walks (prompts/motion castKindOf). */
  deity?: boolean;
  /** Drawn characters are on screen: a drawn pair walks only together and is filmed only from the side (prompts/motion). */
  cartoon?: boolean;
}

/** The how-to-film options, as the planner reads them: "approach_show (Approach and show)". */
const optionsOf = (record: Record<string, { name: string }>, skip: string[] = []) =>
  Object.entries(record).filter(([k]) => !skip.includes(k)).map(([k, v]) => `${k} (${v.name})`).join(", ");

/**
 * What the planner may choose for this cast — the same rules planClipMotion enforces (castKindOf), so a
 * choice it is offered is a choice the plan can use. The last clip's invitation is set in code.
 */
function filmingOptions(input: ScenePlanPromptInput): { skipStagings: StagingKey[]; skipCameras: CameraMoveKey[]; walks: string; cameras: string } {
  const kind = castKindOf(input.deity ? "deity" : input.cartoon ? "cartoon" : "person", !!input.twoHander);
  switch (kind) {
    case "drawn_pair":
    case "pair":
      return {
        skipStagings: ["walk_invite", "walk_toward"], skipCameras: ["push_in", "arc", "static_locked"],
        walks: `${kind === "drawn_pair" ? "These are two DRAWN characters: they" : "The two"} walk TOGETHER, side by side at one pace, along or across the floor — never toward the camera and never one of them alone. walk_across walks along the counter, display or shelves (give that clip's background a counter or display running beside them, with clear floor ahead); approach_show walks a few steps to a product beside them (put it in view); walk_stop_present walks a few steps, then the promise. turn_present only for a line about the place behind them.`,
        cameras: "side_track travels sideways WITH their walk; lateral_dolly glides sideways past them. The camera never moves toward, away from or around them.",
      };
    case "deity":
      return {
        skipStagings: ["walk_invite", "walk_toward", "walk_across", "walk_stop_present"], skipCameras: ["side_track", "static_locked"],
        walks: "A deity never walks — the life is in the blessing gestures and the moving camera: turn_present to bless the place, approach_show to bless what the line is about.",
        cameras: "push_in for a promise or a hero line; arc to curve a short way around the deity; lateral_dolly to glide sideways past it.",
      };
    default:
      return {
        skipStagings: ["walk_invite"], skipCameras: ["static_locked"],
        walks: "Most clips WALK through the place: walk_toward is a slow walk toward the camera (give that clip's background clear, open floor in front of the presenter); walk_across walks along the counter, display or shelves (give it a counter or display running beside them, with clear floor ahead); approach_show walks a few steps to the product (put it a few steps away, in view); walk_stop_present walks a few steps, then the promise. turn_present for a line about the place behind them.",
        cameras: "side_track ONLY with walk_across (it travels sideways with the walk); push_in for a walk toward the camera, a product, a promise or a hero line; arc to curve a short way around the presenter; lateral_dolly to glide sideways past a turn. The camera never moves backward.",
      };
  }
}

export const SCENE_PLAN_SYSTEM_PROMPT = (input: ScenePlanPromptInput): string => {
  const { clipCount, adType, festivalName, subject, twoHander = false } = input;
  const festival = adType === "festival" && festivalName?.trim() ? festivalName.trim() : "";
  const filming = filmingOptions(input);
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
• ${subject} is IN that background, with open floor to walk on and space to present — never in a doorway, never outside on a road, never in a different building from the world.

STEP 4 — WHAT TO AVOID. Things that would contradict the motive (e.g. for an annadanam: no restaurant billing counter, no menu board, no price tags).

STEP 5 — HOW EACH CLIP IS FILMED. Every clip's video starts from its own still frame and shows only what that frame shows: ONE real action and ONE camera move that follows it, inside that part of the place — never a talking portrait. The variety of the ad comes from STEP 3 (a different real part of the place in every clip: the entrance seen from inside, the counter, the racks, the display, the work area) and from the action. For each clip choose, from what its line says:
• "staging" — one of: ${optionsOf(STAGINGS, filming.skipStagings)}.
  – walk_stop_present for a promise or trust; approach_show when the line names something that can be shown; walk_across or walk_toward when it is about the place itself; turn_present to present the place behind them.
  – ${filming.walks}
  – Mix them across the ad. A festival greeting and the closing invitation are set by the code; never a goodbye.
• "camera" — one of: ${optionsOf(CAMERA_MOVES, filming.skipCameras)}. ${filming.cameras} Never the same move in two neighbouring clips.
• "angle" — one of: ${optionsOf(SHOT_ANGLES)}. Eye level for most; slightly low for a confident hero; slightly high for an overview.${twoHander ? " A pair is always filmed at eye level." : ""}

Return ONLY this JSON, no markdown:
{
  "motive": "<one line: what the video is about>",
  "category": "<business promotion | festival wishes | temple | food donation | birthday wishes | invitation | event | other>",
  "setting": "<the one world all clips are set in, in a phrase>",
  "mood": "<the feeling the frames carry, in a phrase>",
  "avoid": ["<thing that contradicts the motive>", "..."],
  "clips": [
    { "clip": 1, "background": "<the background for clip 1, one clear sentence naming the real place and what is in it>", "elements": ["<real object>", "<real object>", "<real object>"], "staging": "<staging key>", "camera": "<camera key>", "angle": "<angle key>" }
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
