/**
 * The owner, 2026-11-05: "in every frames, posters and the overlays images prompts must and should mention the ratio of
 * the image based on the ad configuration." Later that day: "overlay images ratio based on the ad configuration, but not
 * the overlay texts; we need the overlay texts with the transparent background, where we can download and directly add
 * the overlay" — ChatGPT had drawn the text small in the middle of a white 9:16 canvas.
 * So: frames and B-roll carry the kit's ratio; an overlay TEXT prompt never does — transparent first, cropped to the words.
 */
import { describe, expect, it } from "vitest";
import { currentOverlayPrompt, overlayDesignOf, overlayImagePrompt, OVERLAY_TRANSPARENT_LINE } from "@/utils/overlayImage";
import { withKitImageRatio } from "@/utils/kitImageRatio";
import { posterFormatLine } from "@/utils/posterAdType";

const firstLine = (p: string) => p.split("\n")[0];
const NO_RATIO = /ASPECT RATIO|9\s*:\s*16|16\s*:\s*9|canvas width|video frame,/i;

describe("overlay text prompts: a transparent PNG cropped to the words, never a ratio", () => {
  it("starts with the transparent line, asks for a tight crop and names no ratio", () => {
    const p = overlayImagePrompt("GRAND OPENING", "ruby red letters with a gold outline");
    expect(firstLine(p)).toBe(OVERLAY_TRANSPARENT_LINE);
    expect(p).toMatch(/real alpha-channel PNG/);
    expect(p).toMatch(/no white or coloured canvas/);
    expect(p).toMatch(/Tightly cropped to the lettering/);
    expect(p).not.toMatch(NO_RATIO);
    expect(overlayDesignOf(p)).toBe("ruby red letters with a gold outline");
  });

  it("an overlay saved with the ratio canvas (2026-11-05) is rebuilt without it; the old tight-crop one too; idempotent", () => {
    const withCanvas = `ASPECT RATIO: 16:9 horizontal (landscape) — compose the whole overlay image for this canvas.\n\nPremium 3D text "FREE DELIVERY" — saffron letters. Bold embossed 3D typography with real depth. The canvas is the whole 16:9 horizontal (landscape) video frame, transparent everywhere except the lettering, which sits centred on it at about 60% of the canvas width — never cropped to the text and never another shape.`;
    const older = `Premium 3D text "FREE DELIVERY" — saffron letters. Bold embossed 3D typography with real depth. Tightly cropped to the lettering with only a small even margin.`;
    const want = overlayImagePrompt("FREE DELIVERY", "saffron letters");
    expect(currentOverlayPrompt({ text: "FREE DELIVERY", imagePrompt: withCanvas })).toBe(want);
    expect(currentOverlayPrompt({ text: "FREE DELIVERY", imagePrompt: older })).toBe(want);
    expect(currentOverlayPrompt({ text: "FREE DELIVERY", imagePrompt: want, imageDesign: "saffron letters" })).toBe(want);
    // A prompt this module never built only loses a leading ratio line.
    expect(currentOverlayPrompt({ imagePrompt: "ASPECT RATIO: 9:16 vertical (portrait) — x.\n\nShiny text SALE" })).toBe("Shiny text SALE");
  });
});

describe("a saved kit reopened gets the kit's ratio on its frames and B-roll, not on its overlay texts", () => {
  it("frames and B-roll stamped (9:16 mentions corrected in a 16:9 kit), overlays without a ratio; idempotent", () => {
    const kit = {
      mainFramePrompts: ["A 9:16 vertical frame of the shop.", ""],
      stockImagePrompts: [{ prompt: "Fresh sweets on a tray, 9:16 vertical", clip: 1 }, { clip: 2 }],
      overlayTexts: [{ text: "OFFER", imageDesign: "gold letters", imagePrompt: `ASPECT RATIO: 9:16 vertical (portrait) — compose the whole overlay image for this canvas.\n\nPremium 3D text "OFFER" — gold letters. Bold embossed 3D typography.` }, { text: "x" }],
    };
    const out = withKitImageRatio(kit, "16:9");
    expect(firstLine(out.mainFramePrompts![0])).toMatch(/^ASPECT RATIO: 16:9/);
    expect(out.mainFramePrompts![0]).not.toMatch(/9:16/);
    expect(out.mainFramePrompts![1]).toBe("");
    expect(firstLine(out.stockImagePrompts![0].prompt)).toMatch(/^ASPECT RATIO: 16:9/);
    expect(out.stockImagePrompts![0].clip).toBe(1);
    expect(out.stockImagePrompts![1]).toEqual({ clip: 2 });
    expect(out.overlayTexts![0].imagePrompt).toBe(overlayImagePrompt("OFFER", "gold letters"));
    expect(out.overlayTexts![0].imagePrompt).not.toMatch(NO_RATIO);
    expect(out.overlayTexts![1]).toEqual({ text: "x" });
    expect(withKitImageRatio(out, "16:9")).toEqual(out);
  });
});

describe("posters already name their ratio in the Format line", () => {
  it("9:16 and 16:9", () => {
    expect(posterFormatLine({ posterSize: "9:16", hasLogo: true })).toMatch(/^9:16 vertical poster\./);
    expect(posterFormatLine({ posterSize: "16:9", hasLogo: true })).toMatch(/^16:9 horizontal poster\./);
  });
});
