import { describe, it, expect } from "vitest";
import {
  CORE_MESSAGE_SYSTEM_PROMPT, coreMessageBlock, fallbackCoreMessageBrief, parseCoreMessageBrief, type CoreMessageBrief,
} from "@/services/prompts/coreMessage";
import {
  VOICEOVER_SYSTEM_PROMPT, VOICEOVER_REPAIR_SYSTEM_PROMPT, VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT,
} from "@/services/prompts";
import { CHARACTER_VOICEOVER_SYSTEM_PROMPT } from "@/services/prompts/characterAd";
import { getCharacterPack } from "@/services/characterPacks";
import { MAX_WORDS_PER_CLIP, MIN_WORDS_PER_CLIP } from "@/utils/dialogueFormat";

/**
 * Clip 1 must tell a stranger who the business is, what it does, and why to choose it.
 *
 * The script prompt used to define clip 1 as "an attention-grabbing hook" and nothing more, and no
 * step anywhere decided what the business most wants remembered. These pin the brief that is now
 * worked out first, and that every script, repair and review prompt holds clip 1 to it.
 */

const BRIEF: CoreMessageBrief = {
  businessName: "Sri Sai Motors",
  place: "Nizamabad",
  whatTheyDo: "a two-wheeler service centre",
  corePromise: "same-day service with free pickup and drop",
  proofPoints: ["genuine spare parts", "12 trained mechanics", "washing included"],
  offer: "free oil check this month",
  audience: "bike owners in Nizamabad",
  messageLine: "Sri Sai Motors in Nizamabad services your bike the same day, with free pickup and drop.",
};

describe("the brief", () => {
  it("is decided from the facts only, the client's instructions first", () => {
    expect(CORE_MESSAGE_SYSTEM_PROMPT).toMatch(/Use ONLY facts present in the business information/);
    expect(CORE_MESSAGE_SYSTEM_PROMPT).toMatch(/The client's own instructions come first/);
    expect(CORE_MESSAGE_SYSTEM_PROMPT).toMatch(/corePromise is ONE idea/);
  });

  it("reads a model reply, fenced or not, and drops 'Not provided'", () => {
    const parsed = parseCoreMessageBrief("```json\n" + JSON.stringify({ ...BRIEF, offer: "Not provided" }) + "\n```")!;
    expect(parsed.businessName).toBe("Sri Sai Motors");
    expect(parsed.offer).toBe("");
    expect(parsed.proofPoints).toHaveLength(3);
  });

  it("refuses a brief with no name or no promise", () => {
    expect(parseCoreMessageBrief(JSON.stringify({ ...BRIEF, corePromise: "" }))).toBeNull();
    expect(parseCoreMessageBrief("not json")).toBeNull();
  });

  it("falls back to the extracted profile, whatever its key names", () => {
    const brief = fallbackCoreMessageBrief({
      businessIdentity: { "Business Name": "Sri Sai Motors", "Industry/Business Type": "Two-wheeler service", "Brand Tagline": "Same-day service" },
      servicesProducts: { "Main Services": "servicing, washing, spare parts" },
      contact: { "City / Town / Village": "Nizamabad" },
    });
    expect(brief.businessName).toBe("Sri Sai Motors");
    expect(brief.corePromise).toBe("Same-day service");
    expect(brief.place).toBe("Nizamabad");
    expect(brief.proofPoints).toEqual(["servicing", "washing", "spare parts"]);
  });
});

describe("the brief inside a script prompt", () => {
  it("sets the clip test on the message clip", () => {
    const block = coreMessageBlock(BRIEF, 1);
    expect(block).toContain("CORE PROMISE: same-day service with free pickup and drop");
    expect(block).toMatch(/someone who hears ONLY clip 1, once, with no picture/);
    expect(block).toMatch(/A hook may be the way clip 1 opens; it is never a\s+replacement for the message/);
    expect(block).toContain("EVERY WORD SELLS");
  });

  it("renders nothing without a brief", () => {
    expect(coreMessageBlock(null)).toBe("");
  });
});

describe("the voice-over prompt", () => {
  const commercial = VOICEOVER_SYSTEM_PROMPT(32, 4, "commercial", "", "Telugu", "female", BRIEF);

  it("makes clip 1 the core message, not a bare hook", () => {
    expect(commercial).toContain("Clip 1 (0-8) = THE CORE MESSAGE");
    expect(commercial).toMatch(/business NAME, WHAT it does, and its CORE PROMISE/);
    expect(commercial).toMatch(/NEVER a bare question, a greeting, a welcome, a slogan, or a teaser/);
    expect(commercial).not.toContain("= a strong, attention-grabbing OPENING HOOK");
  });

  it("carries the brief and the clip-1 self-check", () => {
    expect(commercial).toContain("THE CORE MESSAGE (THE SPINE OF THIS AD)");
    expect(commercial).toContain("Clip 1 passes the test");
  });

  it("uses the 18–22 word band", () => {
    expect(commercial).toContain(`BETWEEN ${MIN_WORDS_PER_CLIP} to ${MAX_WORDS_PER_CLIP} spoken words`);
    expect(commercial).toContain(`Every clip has between ${MIN_WORDS_PER_CLIP} to ${MAX_WORDS_PER_CLIP} spoken words`);
  });

  it("moves the message to clip 2 when clip 1 is a festival wish", () => {
    const festival = VOICEOVER_SYSTEM_PROMPT(32, 4, "festival", "Diwali", "Telugu", "female", BRIEF);
    expect(festival).toContain("Clip 2 is the CORE MESSAGE clip");
    expect(festival).toMatch(/someone who hears ONLY clip 2/);
    expect(festival).toContain("Clip 1 must contain zero business promotion");
  });

  it("puts message and call to action together in a one-clip ad", () => {
    expect(VOICEOVER_SYSTEM_PROMPT(8, 1, "commercial", "", "Telugu", "female", BRIEF)).toContain("ONE-CLIP MODE");
  });

  it("still works with no brief", () => {
    const plain = VOICEOVER_SYSTEM_PROMPT(32, 4, "commercial", "", "Telugu");
    expect(plain).toContain("Clip 1 (0-8) = THE CORE MESSAGE");
    expect(plain).not.toContain("THE SPINE OF THIS AD");
  });
});

describe("the repair and review passes hold clip 1 to the message", () => {
  it("never lets a word-count repair strip the message", () => {
    const repair = VOICEOVER_REPAIR_SYSTEM_PROMPT(32, 4, "commercial", "", "Telugu", BRIEF);
    expect(repair).toMatch(/Never repair a word count by removing any of those three/);
    expect(repair).toContain("CORE PROMISE: same-day service");
  });

  it("runs the clip test and reports it", () => {
    const review = VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT("Telugu", BRIEF, 1);
    expect(review).toContain("A MESSAGE CLIP THAT DOES NOT LAND");
    expect(review).toContain("WASTED WORDS");
    expect(review).toContain("Then run the CLIP 1 TEST");
    expect(review).toContain('"messageClipTest"');
  });
});

describe("the character script", () => {
  const pack = getCharacterPack("duo_motu_patlu")!;

  it("names the business, what it does and the core promise in clip 1", () => {
    const p = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "commercial", "", "Telugu", "Nizamabad", BRIEF);
    expect(p).toContain("THE CORE MESSAGE (THE SPINE OF THIS AD)");
    expect(p).toMatch(/Clip 1 — THE HOOK[\s\S]*saying plainly what it does and the core promise that makes it worth choosing/);
  });

  it("puts the message in clip 2 of a festival ad", () => {
    const p = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "festival", "Diwali", "Telugu", "", BRIEF);
    expect(p).toMatch(/someone who hears ONLY clip 2/);
  });
});
