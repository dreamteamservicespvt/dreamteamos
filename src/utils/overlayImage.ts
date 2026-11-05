/**
 * The Overlay Text Image Generator's prompt — a premium 3D transparent PNG of one overlay's text.
 *
 * ── Why the prompt is assembled here ─────────────────────────────────────────────────────────────
 * The editor drops these PNGs straight over the video, so three things are not negotiable and are
 * exactly what an image model drops when it writes the whole prompt: the text spelled EXACTLY as
 * given, a REAL transparent background (not a white box, not a checkerboard drawn into the pixels),
 * and a tight crop around the lettering. The model's only job is the LOOK — material, colours, finish,
 * one accent — themed to the business or to the festival. Everything else is fixed text here, so every
 * prompt is short, clean and has the same guarantees. Pure, so it is unit-tested.
 *
 * ── No ratio on the overlay TEXT (owner, 2026-11-05, later: "overlay images ratio based on the ad configuration, but
 * not the overlay texts; we need the overlay texts with the transparent background, where we can download and directly
 * add the overlay") ──
 * Earlier that day every overlay prompt started with the ad's ASPECT RATIO line and asked for a canvas of the video's
 * shape. ChatGPT then drew a full 9:16 picture — the lettering small in the middle of a WHITE frame — which cannot be
 * dropped over a clip. The ratio belongs to the pictures (frames, B-roll, posters: utils/frameFormat); an overlay text
 * is a transparent PNG the shape of its words. The prompt now says TRANSPARENT first, on its own line, and never names
 * a ratio; a kit saved with the ratio canvas is rebuilt without it (currentOverlayPrompt).
 */

/** The first line of every overlay prompt: the one thing an image tool must not miss. */
export const OVERLAY_TRANSPARENT_LINE =
  "TRANSPARENT PNG: only the lettering, on a fully transparent background (a real alpha channel) — no white, no colour, no canvas or frame around it.";

/** The fixed tail every overlay image prompt carries. */
export const OVERLAY_IMAGE_RULES =
  "Transparent background — a real alpha-channel PNG with no background, no scene, no backdrop panel, no white or coloured canvas, no checkerboard pattern and no drop-shadow box. "
  + "Tightly cropped to the lettering with only a small even margin — the image is the shape of the words, never a full video frame. "
  + "Spell the text exactly as written, letter for letter, and add no other text, logo or watermark.";

/**
 * Reads over ANY picture (2026-11-05 — the owner: the text images "are coming in the same colour" as the B-roll and
 * "mixed with" them). Both were themed to the same festival / brand palette, so gold letters sat on a gold-lit scene.
 * The look stays the business's or the festival's; this fixed sentence guarantees the contrast whatever the look says.
 */
export const OVERLAY_LEGIBILITY =
  "Stands out over any video or photograph: a bright, high-contrast letter face with a thick, clean contrasting outline "
  + "(dark around light letters, light around dark letters) and a soft dark shadow on the letters only — never letters in "
  + "the same deep colours as a festive or brand-coloured scene.";

const MAX_DESIGN_LENGTH = 220;

export const DEFAULT_OVERLAY_DESIGN = "glossy premium metallic lettering in the brand's colours";

/**
 * The model's design note, cleaned: one short phrase, with anything that would put a background
 * behind the text taken out — the rules above already say what the background is.
 */
export function cleanOverlayDesign(design: string): string {
  return (design || "")
    .replace(/\s+/g, " ")
    .replace(/["“”]/g, "'")
    .split(/(?<=[.;])\s+/)
    .filter((part) => !/\b(?:background|backdrop|scene|wallpaper|behind the text|on a (?:wall|board|table))\b/i.test(part))
    .join(" ")
    .replace(/[.;,\s]+$/, "")
    .slice(0, MAX_DESIGN_LENGTH)
    .trim();
}

/** The complete image prompt for one overlay — never a ratio: the PNG is the shape of its words. */
export function overlayImagePrompt(text: string, design: string, fallbackDesign = DEFAULT_OVERLAY_DESIGN): string {
  const words = (text || "").replace(/\s+/g, " ").trim();
  const look = cleanOverlayDesign(design) || fallbackDesign;
  return `${OVERLAY_TRANSPARENT_LINE}

Premium 3D text "${words}" — ${look}. Bold embossed 3D typography with real depth, a crisp bevel and soft studio lighting, sharp clean edges, readable at a glance on a phone. ${OVERLAY_LEGIBILITY} ${OVERLAY_IMAGE_RULES}`;
}

/** The design half of a prompt this module built — for refining the look without touching the rules. */
export function overlayDesignOf(prompt: string): string {
  const m = (prompt || "").match(/(?:^|\n)Premium 3D text ".*?" — (.*?)\. Bold embossed 3D typography/);
  return m ? m[1] : "";
}

/** The text a prompt this module built prints ("" when the prompt is not one of them). */
const overlayTextOf = (prompt: string): string => (prompt || "").match(/(?:^|\n)Premium 3D text "(.*?)" — /)?.[1] ?? "";

/** A leading "ASPECT RATIO: …" line (an overlay saved on 2026-11-05 carried one) and the blank lines after it. */
const RATIO_LINE = /^\s*ASPECT RATIO:[^\n]*\n+/;

/**
 * A saved overlay's prompt as today's rules write it: one this module built (any date) is assembled again with its own
 * text and design — the 2026-11-05 ratio line and video-frame canvas go, the transparent line and the tight crop come
 * back — and anything else only loses a leading ratio line. Idempotent.
 */
export function currentOverlayPrompt(item: { text?: string; imagePrompt?: string; imageDesign?: string }): string {
  const prompt = item.imagePrompt || "";
  if (!prompt.trim()) return prompt;
  const design = item.imageDesign || overlayDesignOf(prompt);
  const text = overlayTextOf(prompt) || item.text || "";
  if (design && text) return overlayImagePrompt(text, design, DEFAULT_OVERLAY_DESIGN);
  return prompt.replace(RATIO_LINE, "");
}
