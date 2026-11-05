/**
 * The Overlay Text Image Generator's prompt — a premium 3D transparent PNG of one overlay's text.
 *
 * ── Why the prompt is assembled here ─────────────────────────────────────────────────────────────
 * The editor drops these PNGs straight over the video, so three things are not negotiable and are
 * exactly what an image model drops when it writes the whole prompt: the text spelled EXACTLY as
 * given, a REAL transparent background (not a white box, not a checkerboard drawn into the pixels),
 * and the canvas. The model's only job is the LOOK — material, colours, finish,
 * one accent — themed to the business or to the festival. Everything else is fixed text here, so every
 * prompt is short, clean and has the same guarantees. Pure, so it is unit-tested.
 *
 * ── The ad's ratio (owner, 2026-11-05: "in every frames, posters and the overlays images prompts must and should
 * mention the ratio of the image based on the ad configuration") ──
 * The prompt starts with the same `ASPECT RATIO:` line as the frames and the B-roll (utils/frameFormat), and the
 * image is a transparent canvas of the VIDEO's own shape — 9:16 or 16:9 — with the lettering centred on it. Until then
 * the PNG was "tightly cropped to the lettering", so its shape was whatever the words made and the prompt named no
 * ratio; a full-frame canvas also drops onto the timeline at the video's size, with no scaling.
 */

import { adRatioOf, withAspectRatio, type AdRatio } from "@/utils/frameFormat";

/** The fixed tail every overlay image prompt carries (the canvas sentence, `overlayCanvasRule`, goes before it). */
export const OVERLAY_IMAGE_RULES =
  "Transparent background — a real alpha-channel PNG with no background, no scene, no backdrop panel, no checkerboard pattern and no drop-shadow box. "
  + "Spell the text exactly as written, letter for letter, and add no other text, logo or watermark.";

/**
 * The canvas: the video's own frame, transparent around the lettering. A 16:9 frame is wide, so its lettering takes a
 * smaller share of the width than in a 9:16 one (the same text reads at about the same size on screen).
 */
export function overlayCanvasRule(ratio: AdRatio): string {
  const shape = ratio === "16:9" ? "16:9 horizontal (landscape)" : "9:16 vertical (portrait)";
  const width = ratio === "16:9" ? "about 60%" : "about 80%";
  return `The canvas is the whole ${shape} video frame, transparent everywhere except the lettering, which sits centred on it at ${width} of the canvas width — never cropped to the text and never another shape.`;
}

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

/** The complete image prompt for one overlay, for an ad of `ratio` (absent or unreadable = the 9:16 default). */
export function overlayImagePrompt(text: string, design: string, fallbackDesign = DEFAULT_OVERLAY_DESIGN, ratio?: string | null): string {
  const words = (text || "").replace(/\s+/g, " ").trim();
  const look = cleanOverlayDesign(design) || fallbackDesign;
  const canvas = adRatioOf(ratio);
  const body = `Premium 3D text "${words}" — ${look}. Bold embossed 3D typography with real depth, a crisp bevel and soft studio lighting, sharp clean edges, readable at a glance on a phone. ${OVERLAY_LEGIBILITY} ${overlayCanvasRule(canvas)} ${OVERLAY_IMAGE_RULES}`;
  return withAspectRatio(body, canvas, "overlay image");
}

/** The design half of a prompt this module built — for refining the look without touching the rules. */
export function overlayDesignOf(prompt: string): string {
  const m = (prompt || "").match(/(?:^|\n)Premium 3D text ".*?" — (.*?)\. Bold embossed 3D typography/);
  return m ? m[1] : "";
}

/** The text a prompt this module built prints ("" when the prompt is not one of them). */
const overlayTextOf = (prompt: string): string => (prompt || "").match(/(?:^|\n)Premium 3D text "(.*?)" — /)?.[1] ?? "";

/**
 * A saved overlay's prompt for an ad of `ratio`: one this module built (any date) is assembled again with its own text
 * and design — an older one loses "tightly cropped" and gains the canvas — and anything else gets the ratio line.
 * Idempotent.
 */
export function overlayPromptForRatio(item: { text?: string; imagePrompt?: string; imageDesign?: string }, ratio?: string | null): string {
  const prompt = item.imagePrompt || "";
  if (!prompt.trim()) return prompt;
  const design = item.imageDesign || overlayDesignOf(prompt);
  const text = overlayTextOf(prompt) || item.text || "";
  if (design && text) return overlayImagePrompt(text, design, DEFAULT_OVERLAY_DESIGN, ratio);
  return withAspectRatio(prompt, ratio, "overlay image");
}
