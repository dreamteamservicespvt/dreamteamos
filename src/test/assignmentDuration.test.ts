import { describe, it, expect } from "vitest";
import {
  DURATIONS, getClipCount, hasPoster, durationForClips, durationOptionsFor, normalizeClipCount, priceForClips,
} from "@/utils/assignmentDuration";
import { PRICING } from "@/utils/pricing";

describe("getClipCount", () => {
  it("uses the lookup for standard packages", () => {
    expect(getClipCount("16s")).toBe(2);
    expect(getClipCount("64s")).toBe(8);
    expect(getClipCount("20s")).toBe(2); // wishes clips run longer than 8s
  });

  it("falls back to seconds ÷ 8 for custom durations, however long", () => {
    expect(getClipCount("24s")).toBe(3);
    expect(getClipCount("56s")).toBe(7);
    expect(getClipCount("8s")).toBe(1);
    expect(getClipCount("240s")).toBe(30);
  });
});

describe("hasPoster", () => {
  it("keeps the published package answers exactly", () => {
    expect(hasPoster("16s")).toBe(false);
    expect(hasPoster("32s")).toBe(true);
    expect(hasPoster("20s")).toBe(false);
    expect(hasPoster("40s")).toBe(false);
  });

  it("applies the same 4-clip threshold to custom durations", () => {
    expect(hasPoster("24s")).toBe(false);
    expect(hasPoster("56s")).toBe(true);
  });
});

describe("durationForClips", () => {
  it("turns a clip count into the stored duration string", () => {
    expect(durationForClips(3)).toBe("24s");
    expect(durationForClips(1)).toBe("8s");
  });
});

describe("normalizeClipCount", () => {
  it("keeps any positive clip count — there is no upper limit", () => {
    expect(normalizeClipCount(3)).toBe(3);
    expect(normalizeClipCount(15)).toBe(15);
    expect(normalizeClipCount(40)).toBe(40);
    expect(normalizeClipCount(500)).toBe(500);
  });

  it("floors at one clip for empty, zero, negative, or NaN input", () => {
    expect(normalizeClipCount(0)).toBe(1);
    expect(normalizeClipCount(-4)).toBe(1);
    expect(normalizeClipCount(NaN)).toBe(1);
  });

  it("truncates fractional input to a whole clip count", () => {
    expect(normalizeClipCount(3.7)).toBe(3);
  });
});

describe("durationOptionsFor", () => {
  it("returns the standard packages when the current duration is standard", () => {
    expect(durationOptionsFor("promotional", "32s")).toEqual(DURATIONS.promotional);
  });

  it("keeps a custom duration selectable so editing never snaps it back", () => {
    expect(durationOptionsFor("promotional", "24s")).toEqual([...DURATIONS.promotional, "24s"]);
  });

  it("is safe for an unknown category", () => {
    expect(durationOptionsFor("nope")).toEqual([]);
  });
});

describe("priceForClips", () => {
  it("returns the published price for standard clip counts", () => {
    expect(priceForClips("promotional", 2)).toBe(PRICING.promotional["16s"]);
    expect(priceForClips("promotional", 8)).toBe(PRICING.promotional["64s"]);
    expect(priceForClips("cinematic", 4)).toBe(PRICING.cinematic["32s"]);
  });

  it("prices custom clip counts off the category's own per-clip rate", () => {
    // promotional base: ₹499 for 2 clips → ~₹250/clip
    expect(priceForClips("promotional", 3)).toBe(749);
    // cinematic base: ₹999 for 2 clips → ~₹500/clip
    expect(priceForClips("cinematic", 3)).toBe(1499);
  });

  it("stays close to the published ladder rather than drifting", () => {
    for (const duration of DURATIONS.promotional) {
      const derived = priceForClips("promotional", getClipCount(duration));
      expect(Math.abs(derived - PRICING.promotional[duration])).toBeLessThanOrEqual(2);
    }
  });

  it("returns 0 for an unknown category instead of throwing", () => {
    expect(priceForClips("nope", 3)).toBe(0);
  });
});
