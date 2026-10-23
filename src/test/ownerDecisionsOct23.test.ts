/**
 * The owner's three decisions of 2026-10-23 (after the live audit of that morning):
 *  1. A deity's festival ad — the deity blesses in its own voice in clip 1, the business's wish is passed on
 *     in the final clip (prompts/characterAd isDeityFestival, prompts/festivalWish deityWishLine).
 *  2. ONE extra improvement round when the best draft still breaks a hard rule (utils/scriptQa nextImprovement).
 *  3. A pair's line over 12 words is a hard rule — repaired by the loop, refused by the final gate
 *     (utils/scriptContract pairLineIssues).
 * (Kids: no change — left out of testing until there is a tool that takes a photoreal child's frame.)
 */
import { describe, expect, it } from "vitest";
import {
  CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT, CHARACTER_VOICEOVER_SYSTEM_PROMPT, isDeityFestival,
} from "@/services/prompts/characterAd";
import { deityWishLine } from "@/services/prompts/festivalWish";
import { SCRIPT_QA_SYSTEM_PROMPT } from "@/services/prompts/scriptQa";
import { VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT } from "@/services/prompts/refine";
import { CHARACTER_CATALOGUE } from "@/services/characterCatalogue";
import { getCharacterPack } from "@/services/characterPacks";
import { nextImprovement, SCRIPT_EXTRA_ROUND_MS, type ScriptQaReport } from "@/utils/scriptQa";
import { MAX_WORDS_PER_LINE, isPairLineIssue, isWordCountIssue, pairLineIssues } from "@/utils/scriptContract";

const GANESHA = getCharacterPack("god_ganesha")!;
const DUO = getCharacterPack(CHARACTER_CATALOGUE.find((p) => p.family === "duo")!.id)!;

describe("a deity's festival ad: the deity blesses, the business wishes (owner, 2026-10-23)", () => {
  it("applies to a deity in a festival ad only", () => {
    expect(isDeityFestival(GANESHA, "festival")).toBe(true);
    expect(isDeityFestival(GANESHA, "commercial")).toBe(false);
    expect(isDeityFestival(DUO, "festival")).toBe(false);
    expect(isDeityFestival(null, "festival")).toBe(false);
  });

  it("the business's wish has no మా — the deity is not the business", () => {
    const te = deityWishLine("Vinayaka Chavithi", "Telugu");
    expect(te).toContain("తరఫున మిత్రులు, కస్టమర్లందరికీ");
    expect(te).not.toMatch(/తరఫున మా /);
    expect(deityWishLine("Diwali", "English")).toMatch(/wishes all its friends, well-wishers and customers a happy Diwali/);
  });

  it("the writer makes clip 1 the deity's blessing and the final clip the business's wish", () => {
    const p = CHARACTER_VOICEOVER_SYSTEM_PROMPT(GANESHA, 32, 4, "festival", "Vinayaka Chavithi", "Telugu", "Kakinada");
    expect(p).toContain("THE DEITY BLESSES, THE BUSINESS WISHES");
    expect(p).toMatch(/Clip 1 — THE BLESSING \(NOT A HOOK, NOT A SELL, NOT THE BUSINESS SPEAKING\)/);
    expect(p).toMatch(/Clip 4 — THE BUSINESS'S WISH AND THE INVITATION/);
    expect(p).toContain("తరఫున మిత్రులు, కస్టమర్లందరికీ");
    // The old contract — the business sending the wish in clip 1 — is gone for a deity.
    expect(p).not.toContain("ON BEHALF OF THE BUSINESS");
    expect(p).not.toContain("sent by the business by name");
    expect(p).not.toContain("that first mention is clip 1, as the business sending the wish");
    // The audience rule is kept, without its "the business is the one sending" clause doubled into an orphan comma.
    expect(p).not.toContain("comma list,.");
    // A two-clip ad puts the business, the wish and the invitation in clip 2.
    const two = CHARACTER_VOICEOVER_SYSTEM_PROMPT(GANESHA, 16, 2, "festival", "Diwali", "Telugu");
    expect(two).toMatch(/Clip 2 — THE BUSINESS'S WISH AND THE INVITATION: .*what the business does/);
  });

  it("every other cast keeps the business's wish in clip 1", () => {
    const p = CHARACTER_VOICEOVER_SYSTEM_PROMPT(DUO, 32, 4, "festival", "Diwali", "Telugu");
    expect(p).toContain("ON BEHALF OF THE BUSINESS");
    expect(p).not.toContain("THE DEITY BLESSES");
  });

  it("the repair, the refine and the judge hold the same shape", () => {
    const repair = CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(GANESHA, 32, 4, "Telugu", "", "festival", "Diwali");
    expect(repair).toMatch(/own Diwali BLESSING/);
    expect(repair).toMatch(/final clip must still pass on the business's Diwali wish/);
    expect(repair).not.toContain("naming itself as the sender");

    const judge = SCRIPT_QA_SYSTEM_PROMPT({ clipCount: 4, adType: "festival", festivalName: "Diwali", deityBlessing: true, address: "మెయిన్ రోడ్, కాకినాడ" });
    expect(judge).toContain("THE DEITY BLESSES AND THE BUSINESS WISHES");
    expect(judge).not.toContain("CLIP 1 IS THE WISH AND NOTHING ELSE");
    expect(judge).toMatch(/must say the address and the business's festival wish/);

    const refine = VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({
      language: "Telugu", clipCount: 4, adType: "festival", festivalName: "Diwali", register: "deity",
      speakers: [{ key: "deity", name: "Ganesha" }],
    } as Parameters<typeof VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT>[0]);
    expect(refine).toMatch(/Clip 1 stays the deity's own blessing/);
    expect(refine).not.toContain("later clips never mention the festival");
  });
});

const report = (score: number): ScriptQaReport => ({
  overall: score,
  scores: { facts: score, language: score, persuasion: score, clarity: score, relevance: score, speakability: score, cast: score, originality: score },
  problems: [], unsupportedClaims: [], mechanical: [], rewriteBrief: "", verdict: "",
} as unknown as ScriptQaReport);
const standing = (over: Record<string, unknown> = {}) =>
  ({ report: report(8.8), mechanicalIssues: 0, broken: 0, contract: { violations: 0, distance: 0 }, ...over });

describe("one extra round when the best draft still breaks a hard rule (owner, 2026-10-23)", () => {
  it("is given once, when the budget is spent and the contract or the cast is still broken", () => {
    const breaks = standing({ contract: { violations: 1, distance: 1 } });
    for (const spent of [{ passesUsed: 3, stalls: 0, elapsedMs: 0 }, { passesUsed: 1, stalls: 1, elapsedMs: 0 }, { passesUsed: 1, stalls: 0, elapsedMs: 45_000 }]) {
      expect(nextImprovement({ best: breaks, ...spent })).toEqual({ mode: "polish", drafts: 1, extra: true });
      expect(nextImprovement({ best: breaks, ...spent, extraRoundUsed: true })).toHaveProperty("stop");
    }
    expect(nextImprovement({ best: standing({ broken: 1 }), passesUsed: 3, stalls: 0, elapsedMs: 0 })).toEqual({ mode: "rewrite", drafts: 1, extra: true });
    expect(SCRIPT_EXTRA_ROUND_MS).toBeGreaterThan(0);
  });

  it("is never given to a draft that only misses READY on score", () => {
    expect(nextImprovement({ best: standing(), passesUsed: 3, stalls: 0, elapsedMs: 0 })).toEqual({ stop: "passes" });
    expect(nextImprovement({ best: standing(), passesUsed: 1, stalls: 1, elapsedMs: 0 })).toEqual({ stop: "stalled" });
  });
});

describe("a pair's line over 12 words is a hard rule (owner, 2026-10-23)", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ") + ".";

  it("flags a line over 12 words in a two-person clip, and nothing else", () => {
    expect(MAX_WORDS_PER_LINE).toBe(12);
    // The live duo: 7 + 13 = 20 words, inside the clip band, but the boy's 13-word line was cut at 8 s.
    const issues = pairLineIssues([[{ name: "Girl", text: words(7) }, { name: "Boy", text: words(13) }]]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^Clip 1: Boy's line is 13 words/);
    expect(isPairLineIssue(issues[0])).toBe(true);
    // Never read as the clip's word count by the repair ("has N").
    expect(issues[0]).not.toMatch(/has \d+/);
    expect(isWordCountIssue(issues[0])).toBe(false);
    expect(pairLineIssues([[{ name: "Girl", text: words(8) }, { name: "Boy", text: words(12) }]])).toEqual([]);
    // One speaker's line IS the clip — never held to the line limit.
    expect(pairLineIssues([[{ name: "Ganesha", text: words(19) }]])).toEqual([]);
  });
});
