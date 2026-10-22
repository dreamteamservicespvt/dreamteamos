/**
 * Every frame of a festival ad, dressed for its festival — stamped in code (owner, 2026-10-22).
 *
 * ── Why ───────────────────────────────────────────────────────────────────────────────────────────
 * The owner: "for the festival videos the bottom label, frame background and the poster are not getting the
 * related festival theme." The festival's decorations reached ONE frame prompt variant (the single model's first
 * frame) and nothing else: the scene planner was given only the festival's name and planned plain business
 * zones (clips 2 onward speak no festival words), every character pack got one line ("layer the festival cues
 * naturally"), the last word on each frame was the planned background with no festival in it, and a clip shot in
 * the client's own photograph was told to "add, remove, move or restyle" nothing — so the decorations were
 * forbidden there outright.
 *
 * So, like the background plate and the cast sheet, the festival's dressing is written onto every finished frame
 * by code — the decorations, the floor, the light and the colours of THIS festival (prompts.festivalLook, from the
 * catalogue's own lists) — with the greeting clip the most festive, the business still recognisable in every other
 * clip, and in a client photo the decorations ADDED onto its real walls, counters and floor, nothing removed or
 * moved (utils/locationAssignment.backgroundPlateRule allows exactly that, for a festival ad). Idempotent.
 *
 * Pure; tested in `src/test/adGenOct22.test.ts`.
 */

/** What the stamp needs of a festival's look (prompts.FestivalLook). */
export interface FestivalDressingLook {
  name: string;
  known: boolean;
  decorations: string;
  colours: string;
  floor: string;
  light: string;
}

export const FESTIVAL_DRESSING_HEADING = "FESTIVAL DRESSING";

const unterminated = (s: string) => s.trim().replace(/[\s.;,]+$/, "");

/**
 * A finished frame prompt with its festival's dressing. `wish` marks the greeting clip (the most festive frame);
 * `plate` a clip shot in the client's own photograph (decorations added onto it, nothing in it changed).
 */
export function withFestivalDressing(
  prompt: string,
  look: FestivalDressingLook | null | undefined,
  options: { wish?: boolean; plate?: boolean } = {},
): string {
  if (!look || !prompt.trim() || prompt.includes(FESTIVAL_DRESSING_HEADING)) return prompt;
  const name = look.name.trim();
  const dressed = look.known
    ? `the place is decorated for ${name} — ${unterminated(look.decorations)}; on the floor, ${unterminated(look.floor).replace(/^./, (c) => c.toLowerCase())}; `
      + `the light, ${unterminated(look.light).replace(/^./, (c) => c.toLowerCase())}; the colours lean to ${unterminated(look.colours).replace(/^./, (c) => c.toLowerCase())}`
    : `the place is decorated for ${name} with ${unterminated(look.decorations)}, in ${unterminated(look.colours)}, and ${unterminated(look.light)}`;
  const role = options.wish
    ? `This is the greeting clip: the decorations are generous and frame the cast — the most festive frame of the ad.`
    : `The business stays recognisable — its counters, products and work all still there, the decorations added around them.`;
  const plate = options.plate
    ? ` In the client's photograph the decorations are ADDED onto its real walls, counters, entrance and floor — nothing in the photograph is removed, moved, hidden or rebuilt.`
    : "";
  return `${prompt.trimEnd()}\n\n${FESTIVAL_DRESSING_HEADING} — ${name.toUpperCase()}: ${dressed}, so the frame reads as ${name} at first glance. `
    + `${role}${plate} No written words of the festival anywhere — no festival name, greeting or banner text.`;
}
