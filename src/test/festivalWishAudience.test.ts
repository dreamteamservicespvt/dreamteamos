import { describe, it, expect } from "vitest";
import {
  WISH_AUDIENCE_LINE, WISH_AUDIENCE_TELUGU, wishAudienceIssues, wishAudienceRule, wishOpeningLine,
} from "@/services/prompts/festivalWish";
import { VOICEOVER_REPAIR_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "@/services/prompts";
import { CHARACTER_VOICEOVER_SYSTEM_PROMPT } from "@/services/prompts/characterAd";
import { VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT } from "@/services/prompts/refine";
import { getCharacterPack } from "@/services/characterPacks";
import { findHardWords } from "@/services/prompts/everydaySpeech";
import { clipIndexesFromIssues } from "@/utils/voiceOverRefine";

/**
 * A festival wish is addressed to the business's own people — మిత్రులు, శ్రేయోభిలాషులు and
 * customers — the way the team writes it on every card. Scripts were opening with a generic "to you
 * and your family" instead, which is anyone's greeting rather than this business's.
 */

describe("the greeting's address", () => {
  it("names all three groups, as a comma list", () => {
    expect(WISH_AUDIENCE_LINE).toBe("మిత్రులు, శ్రేయోభిలాషులు, కస్టమర్లందరికీ");
    expect(WISH_AUDIENCE_TELUGU.map((g) => g.english)).toEqual(["friends", "well-wishers", "customers"]);
  });

  // "మరియు" is written Telugu, never spoken — the address is a plain list instead.
  it("uses no bookish word a script would then be repaired for", () => {
    expect(WISH_AUDIENCE_LINE).not.toContain("మరియు");
    expect(findHardWords(WISH_AUDIENCE_LINE, "Telugu")).toEqual([]);
  });

  it("shapes the opening line for Telugu, and in English for other languages", () => {
    expect(wishOpeningLine("Diwali", "Telugu")).toContain(`తరఫున మా ${WISH_AUDIENCE_LINE} Diwali`);
    expect(wishOpeningLine("Diwali", "Hindi")).toBe("warm Diwali wishes from {Business Name} to all its friends, well-wishers and customers");
    expect(wishOpeningLine("", "Telugu")).toContain("the festival");
  });
});

describe("checking the wish clip really greets them", () => {
  const wish = `మా మిత్రులు, శ్రేయోభిలాషులు, కస్టమర్లందరికీ లక్ష్మీ స్వీట్స్ తరఫున దీపావళి శుభాకాంక్షలు.`;

  it("passes a wish that greets all three", () => {
    expect(wishAudienceIssues(wish, 1, "Telugu")).toEqual([]);
  });

  it("names exactly what is missing, for the clip that must be fixed", () => {
    const issues = wishAudienceIssues("మా కస్టమర్లందరికీ దీపావళి శుభాకాంక్షలు.", 1, "Telugu");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"మిత్రులు" (friends)');
    expect(issues[0]).toContain('"శ్రేయోభిలాషులు" (well-wishers)');
    expect(issues[0]).not.toContain("(customers)");
    // It reads as a clip problem, so the clip-level repair picks it up.
    expect(clipIndexesFromIssues(issues, 4)).toEqual([0]);
  });

  it("leaves other languages to their own prompt wording", () => {
    expect(wishAudienceIssues("Happy Diwali to all our customers", 1, "Hindi")).toEqual([]);
    expect(wishAudienceIssues("", 1, "Telugu")).toEqual([]);
  });
});

describe("every prompt that writes or edits a wish carries the rule", () => {
  it("is in the writer, the repair pass and the reviewer's structure", () => {
    const writer = VOICEOVER_SYSTEM_PROMPT(32, 4, "festival", "Diwali", "Telugu");
    expect(writer).toContain(WISH_AUDIENCE_LINE);
    expect(writer).toContain("The wish is addressed to the business's own people");
    expect(VOICEOVER_REPAIR_SYSTEM_PROMPT(32, 4, "festival", "Diwali", "Telugu")).toContain(WISH_AUDIENCE_LINE);
  });

  it("is in the character-ad wish beat and the refine editor", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    expect(CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "festival", "Diwali", "Telugu")).toContain(WISH_AUDIENCE_LINE);
    expect(VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4, adType: "festival", festivalName: "Diwali" }))
      .toContain(WISH_AUDIENCE_LINE);
  });

  it("stays out of a commercial ad, which has no wish", () => {
    expect(VOICEOVER_SYSTEM_PROMPT(32, 4, "commercial", "", "Telugu")).not.toContain(WISH_AUDIENCE_LINE);
    expect(wishAudienceRule("Diwali", "Telugu")).toContain("మరియు");  // ...only as the thing to avoid
  });
});
