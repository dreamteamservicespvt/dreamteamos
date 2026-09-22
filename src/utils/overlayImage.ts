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
 */

/** The fixed tail every overlay image prompt carries. */
export const OVERLAY_IMAGE_RULES =
  "Transparent background — a real alpha-channel PNG with no background, no scene, no backdrop panel, no checkerboard pattern and no drop-shadow box. "
  + "Tightly cropped to the lettering with only a small even margin. "
  + "Spell the text exactly as written, letter for letter, and add no other text, logo or watermark.";

const MAX_DESIGN_LENGTH = 220;

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

/** The complete image prompt for one overlay. */
export function overlayImagePrompt(text: string, design: string, fallbackDesign = "glossy premium metallic lettering in the brand's colours"): string {
  const words = (text || "").replace(/\s+/g, " ").trim();
  const look = cleanOverlayDesign(design) || fallbackDesign;
  return `Premium 3D text "${words}" — ${look}. Bold embossed 3D typography with real depth, a crisp bevel and soft studio lighting, sharp clean edges, readable at a glance on a phone. ${OVERLAY_IMAGE_RULES}`;
}

/** The design half of a prompt this module built — for refining the look without touching the rules. */
export function overlayDesignOf(prompt: string): string {
  const m = (prompt || "").match(/^Premium 3D text ".*?" — (.*?)\. Bold embossed 3D typography/);
  return m ? m[1] : "";
}
