import { describe, it, expect } from "vitest";
import {
  DEFAULT_POSTER_SIZE, POSTER_RATIO_PRESETS, assignmentSizeLabel, isValidPosterSize, parsePosterSize,
  pixelsForRatio, posterCanvasSentence, posterSizeLabel, tryParsePosterSize,
} from "@/utils/posterSpec";

/**
 * A poster's size is one string that travels assignment → AI Platform → prompt. These pin the
 * three shapes it can take, and that nothing a member types can reach an image model as garbage.
 */

describe("parsePosterSize", () => {
  it("defaults to 4:5 at 1080×1350", () => {
    expect(DEFAULT_POSTER_SIZE).toBe("4:5");
    const s = parsePosterSize(undefined);
    expect(s).toMatchObject({ kind: "preset", ratio: "4:5", width: 1080, height: 1350, orientation: "portrait" });
  });

  it("reads all four presets with the shorter side at 1080", () => {
    expect(POSTER_RATIO_PRESETS.map((p) => p.value)).toEqual(["4:5", "3:4", "1:1", "9:16"]);
    expect(parsePosterSize("3:4")).toMatchObject({ kind: "preset", width: 1080, height: 1440 });
    expect(parsePosterSize("1:1")).toMatchObject({ kind: "preset", width: 1080, height: 1080, orientation: "square" });
    expect(parsePosterSize("9:16")).toMatchObject({ kind: "preset", width: 1080, height: 1920 });
  });

  it("reduces a typed ratio and recognises a preset typed the long way", () => {
    expect(parsePosterSize("8:10")).toMatchObject({ kind: "preset", ratio: "4:5", value: "4:5" });
    expect(parsePosterSize("5:7")).toMatchObject({ kind: "ratio", ratio: "5:7", width: 1080, height: 1512 });
    expect(parsePosterSize(" 5 / 7 ")).toMatchObject({ kind: "ratio", ratio: "5:7" });
  });

  it("holds the shorter side at 1080 for a landscape ratio", () => {
    expect(parsePosterSize("16:9")).toMatchObject({ kind: "ratio", width: 1920, height: 1080, orientation: "landscape" });
    expect(pixelsForRatio(3, 2)).toEqual({ width: 1620, height: 1080 });
  });

  it("keeps exact pixels, and describes an odd size by its nearest simple ratio", () => {
    expect(parsePosterSize("1080x1350")).toMatchObject({ kind: "pixels", ratio: "4:5", ratioExact: true, width: 1080, height: 1350 });
    expect(parsePosterSize("2480 × 3508")).toMatchObject({ kind: "pixels", width: 2480, height: 3508, ratioExact: false });
    expect(parsePosterSize("1200X1800px")).toMatchObject({ kind: "pixels", ratio: "2:3", value: "1200x1800" });
  });

  it("refuses sizes an image model cannot use, and falls back to 4:5", () => {
    for (const bad of ["", "abc", "0:5", "5:0", "101:5", "50x50", "20000x1000", "4:5:6"]) {
      expect(tryParsePosterSize(bad)).toBeNull();
      expect(isValidPosterSize(bad)).toBe(false);
      expect(parsePosterSize(bad).value).toBe("4:5");
    }
  });
});

describe("labels", () => {
  it("reads the same way on a card, a chip and a brief", () => {
    expect(posterSizeLabel("4:5")).toBe("4:5 · 1080×1350 px");
    expect(posterSizeLabel("1080x1920")).toBe("1080×1920 px (9:16)");
    expect(posterSizeLabel("2480x3508")).toMatch(/^2480×3508 px \(≈\d+:\d+\)$/);
  });

  it("states the canvas exactly for the model", () => {
    expect(posterCanvasSentence("4:5")).toBe("a 4:5 portrait (taller than wide) poster, exactly 1080 × 1350 pixels");
    expect(posterCanvasSentence("1:1")).toBe("a 1:1 square poster, exactly 1080 × 1080 pixels");
    expect(posterCanvasSentence("2480x3508")).toContain("approximately");
  });

  it("describes a poster job without clips, and a video job as before", () => {
    expect(assignmentSizeLabel({ category: "poster", clipCount: 0, posterSize: "1:1" })).toBe("Poster 1:1");
    expect(assignmentSizeLabel({ category: "poster", clipCount: 0, posterSize: "4:5", posterCount: 3 })).toBe("Poster 4:5 × 3");
    expect(assignmentSizeLabel({ category: "promotional", clipCount: 4 })).toBe("4 clips + EC");
  });
});
