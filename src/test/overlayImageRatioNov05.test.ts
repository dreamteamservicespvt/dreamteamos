/**
 * The owner, 2026-11-05: "in every frames, posters and the overlays images prompts must and should mention the ratio of
 * the image based on the ad configuration." The overlays named no ratio (a PNG tightly cropped to the text); a kit saved
 * before that day had frames / B-roll / overlays without the ratio line.
 */
import { describe, expect, it } from "vitest";
import { overlayDesignOf, overlayImagePrompt, overlayPromptForRatio } from "@/utils/overlayImage";
import { withKitImageRatio } from "@/utils/kitImageRatio";
import { posterFormatLine } from "@/utils/posterAdType";

const firstLine = (p: string) => p.split("\n")[0];

describe("overlay image prompts name the ad's ratio", () => {
  it("a 16:9 ad's overlay is a 16:9 canvas, said first and in the body, with no 9:16 anywhere", () => {
    const p = overlayImagePrompt("GRAND OPENING", "ruby red letters with a gold outline", undefined, "16:9");
    expect(firstLine(p)).toBe("ASPECT RATIO: 16:9 horizontal (landscape) — compose the whole overlay image for this canvas.");
    expect(p).toContain("The canvas is the whole 16:9 horizontal (landscape) video frame");
    expect(p).toContain("about 60% of the canvas width");
    expect(p).not.toMatch(/9\s*:\s*16/);
    expect(p).not.toMatch(/tightly cropped/i);
    expect(overlayDesignOf(p)).toBe("ruby red letters with a gold outline");
  });

  it("a 9:16 ad (and no ratio at all) gets 9:16", () => {
    for (const ratio of ["9:16", undefined, "", "weird"]) {
      const p = overlayImagePrompt("OFFER", "gold letters", undefined, ratio);
      expect(firstLine(p)).toBe("ASPECT RATIO: 9:16 vertical (portrait) — compose the whole overlay image for this canvas.");
      expect(p).toContain("about 80% of the canvas width");
      expect(p).not.toMatch(/16\s*:\s*9/);
    }
  });

  it("an older saved overlay (tightly cropped, no ratio) is rebuilt with its own text and look; a re-stamp changes nothing", () => {
    const old = `Premium 3D text "FREE DELIVERY" — saffron letters. Bold embossed 3D typography with real depth. Tightly cropped to the lettering with only a small even margin.`;
    const once = overlayPromptForRatio({ text: "FREE DELIVERY", imagePrompt: old }, "16:9");
    expect(once).toBe(overlayImagePrompt("FREE DELIVERY", "saffron letters", undefined, "16:9"));
    expect(overlayPromptForRatio({ text: "FREE DELIVERY", imagePrompt: once, imageDesign: "saffron letters" }, "16:9")).toBe(once);
    // A prompt this module never built just gets the ratio line.
    expect(firstLine(overlayPromptForRatio({ imagePrompt: "Shiny text SALE" }, "16:9"))).toMatch(/^ASPECT RATIO: 16:9/);
  });
});

describe("a saved kit reopened gets the kit's ratio on every image prompt", () => {
  it("frames, B-roll and overlays — 9:16 mentions corrected in a 16:9 kit; idempotent", () => {
    const kit = {
      mainFramePrompts: ["A 9:16 vertical frame of the shop.", ""],
      stockImagePrompts: [{ prompt: "Fresh sweets on a tray, 9:16 vertical", clip: 1 }, { clip: 2 }],
      overlayTexts: [{ text: "OFFER", imageDesign: "gold letters", imagePrompt: `Premium 3D text "OFFER" — gold letters. Bold embossed 3D typography. Tightly cropped.` }, { text: "x" }],
    };
    const out = withKitImageRatio(kit, "16:9");
    expect(firstLine(out.mainFramePrompts![0])).toMatch(/^ASPECT RATIO: 16:9/);
    expect(out.mainFramePrompts![0]).not.toMatch(/9:16/);
    expect(out.mainFramePrompts![1]).toBe("");
    expect(firstLine(out.stockImagePrompts![0].prompt)).toMatch(/^ASPECT RATIO: 16:9/);
    expect(out.stockImagePrompts![0].clip).toBe(1);
    expect(out.stockImagePrompts![1]).toEqual({ clip: 2 });
    expect(firstLine(out.overlayTexts![0].imagePrompt)).toMatch(/^ASPECT RATIO: 16:9/);
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
