import { describe, it, expect } from "vitest";
import {
  VOICEOVER_SYSTEM_PROMPT, VEO_SEGMENT_SYSTEM_PROMPT, MULTI_FRAME_SYSTEM_PROMPT,
} from "@/services/prompts";
import { getCharacterPack } from "@/services/characterPacks";

/**
 * The character-pack work must not touch the ad pipeline that is already earning money.
 *
 * These are canaries, not style checks: they pin the load-bearing clauses of the standard
 * single-model prompts and assert that nothing from the cartoon format has leaked into them.
 * If a future edit to the character feature changes the normal path, this file fails first.
 */

describe("standard voice-over prompt is untouched by the character work", () => {
  const prompt = VOICEOVER_SYSTEM_PROMPT(32, 4, "commercial", "", "Telugu", "female");

  it("still asks for ONE spoken line per clip", () => {
    expect(prompt).toContain("Each clip line must contain ONE complete spoken sentence only.");
    expect(prompt).toContain("0-8: [clip 1 spoken line]");
  });

  it("carries no two-character contract", () => {
    const lower = prompt.toLowerCase();
    expect(lower).not.toContain("motu");
    expect(lower).not.toContain("patlu");
    expect(lower).not.toContain("both characters");
    expect(prompt).not.toContain("|motu:");
  });

  it("keeps its own word budget, not the two-hander budget", () => {
    // The single-speaker pipeline is calibrated at 18 words; the two-hander uses 16.
    expect(prompt).not.toContain("EXACTLY 16 spoken words");
  });
});

describe("standard Veo prompt is untouched", () => {
  const female = VEO_SEGMENT_SYSTEM_PROMPT(4, "female");
  const male = VEO_SEGMENT_SYSTEM_PROMPT(4, "male");

  it("still frames a single presenter speaking to camera", () => {
    expect(female).toContain("With a very sweet voice she needs to say:");
    expect(male).toContain("With a warm, confident voice he needs to say:");
    expect(female).toContain("CRITICAL EYE CONTACT RULE");
  });

  it("has no cartoon staging or second speaker", () => {
    const lower = female.toLowerCase();
    expect(lower).not.toContain("motu");
    expect(lower).not.toContain("cartoon");
    expect(lower).not.toContain("replies, in a");
  });
});

describe("standard main-frame prompt is untouched", () => {
  const prompt = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 2, ["a", "b"], "ctx", "female", "", false, "");

  it("has no cartoon-character staging", () => {
    const lower = prompt.toLowerCase();
    expect(lower).not.toContain("motu");
    expect(lower).not.toContain("patlu");
    expect(lower).not.toContain("character bible");
  });
});

describe("packs are opt-in", () => {
  it("no pack means no pack — a normal ad is unaffected", () => {
    expect(getCharacterPack(undefined)).toBeNull();
    expect(getCharacterPack(null)).toBeNull();
    expect(getCharacterPack("")).toBeNull();
  });
});
