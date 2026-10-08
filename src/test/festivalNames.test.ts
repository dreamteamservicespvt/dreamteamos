/**
 * దసరా — the festival's one Telugu spelling (owner, 2026-10-08: "Dusshera spelling is coming incorrect in
 * the voice over script … the correct spelling is దసరా"). utils/festivalNames, and where it reaches: every
 * final script line (speakableLine) and the festival-wish wording every script prompt carries.
 */
import { describe, it, expect } from "vitest";
import {
  teluguFestivalName, festivalNameIn, festivalSpellingRule, withFestivalSpellings,
} from "@/utils/festivalNames";
import { speakableLine } from "@/utils/spokenNumbers";
import { wishAudienceRule, wishOpeningLine } from "@/services/prompts/festivalWish";

describe("the festival's Telugu name", () => {
  it("is దసరా for every way the lists and the team spell it", () => {
    for (const name of ["Dussehra", "Dasara", "dusshera", "Dussera", "Dasera", "Dussehra / Vijayadashami"]) {
      expect(teluguFestivalName(name), name).toBe("దసరా");
    }
    expect(teluguFestivalName("Diwali")).toBeNull();
    expect(teluguFestivalName("")).toBeNull();
  });

  it("is used for a Telugu script only", () => {
    expect(festivalNameIn("Dussehra", "Telugu")).toBe("దసరా");
    expect(festivalNameIn("Dussehra", undefined)).toBe("దసరా"); // Telugu is the default
    expect(festivalNameIn("Dussehra", "English")).toBe("Dussehra");
    expect(festivalNameIn("Diwali", "Telugu")).toBe("Diwali");
    expect(festivalSpellingRule("Dussehra", "Telugu")).toBe(
      `Write the festival's name in Telugu exactly as దసరా — every time, never a transliteration of "Dussehra".`,
    );
    expect(festivalSpellingRule("Dussehra", "Hindi")).toBe("");
    expect(festivalSpellingRule("Diwali", "Telugu")).toBe("");
  });
});

describe("every final Telugu script line spells it దసరా", () => {
  it("corrects the transliterations the writer produced", () => {
    const cases: [string, string][] = [
      ["మా అందరికీ దుస్సెహ్రా శుభాకాంక్షలు", "మా అందరికీ దసరా శుభాకాంక్షలు"],
      ["దుస్సేహ్రా పండుగ", "దసరా పండుగ"],
      ["దుస్సేరా శుభాకాంక్షలు", "దసరా శుభాకాంక్షలు"],
      ["దుసెరా", "దసరా"],
      ["దసెరా సందర్భంగా", "దసరా సందర్భంగా"],
      ["దస్సరా పండుగ", "దసరా పండుగ"],
      ["దసరాా శుభాకాంక్షలు", "దసరా శుభాకాంక్షలు"],
      ["దశరా", "దసరా"],
      ["దసర పండుగ", "దసరా పండుగ"],
      // A case ending stays on the word.
      ["దుస్సెహ్రాకు ముందు", "దసరాకు ముందు"],
      // The Latin word inside a Telugu line.
      ["మా అందరికీ Dussehra శుభాకాంక్షలు", "మా అందరికీ దసరా శుభాకాంక్షలు"],
    ];
    for (const [given, want] of cases) expect(withFestivalSpellings(given, "Telugu"), given).toBe(want);
  });

  it("never touches the right spelling, another word, or another language", () => {
    for (const fine of ["దసరా శుభాకాంక్షలు", "దసరాలో కొత్త చీరలు", "దసరాకు ముందే రండి", "దశరథ మహారాజు", "విజయదశమి శుభాకాంక్షలు"]) {
      expect(withFestivalSpellings(fine, "Telugu"), fine).toBe(fine);
    }
    expect(withFestivalSpellings("Happy Dussehra from all of us", "English")).toBe("Happy Dussehra from all of us");
  });

  it("is applied with the numbers and mariyu — in speakableLine — for Telugu only", () => {
    expect(speakableLine("దుస్సెహ్రా కి 20% తగ్గింపు మరియు ఉచిత డెలివరీ", "Telugu")).toBe("దసరా కి ఇరవై శాతం తగ్గింపు mariyu ఉచిత డెలివరీ");
    expect(speakableLine("Happy Dussehra", "English")).toBe("Happy Dussehra");
  });
});

describe("the script prompts name it దసరా", () => {
  it("the Telugu greeting and its rule carry the Telugu name and the spelling rule", () => {
    expect(wishOpeningLine("Dussehra", "Telugu")).toContain("కస్టమర్లందరికీ దసరా హృదయపూర్వక శుభాకాంక్షలు");
    expect(wishOpeningLine("Dussehra", "Telugu")).not.toContain("Dussehra");
    const rule = wishAudienceRule("Dussehra", "Telugu");
    expect(rule).toContain("the one sending the దసరా wish.");
    expect(rule).toContain("Write the festival's name in Telugu exactly as దసరా");
  });

  it("leaves every other festival and language as it was", () => {
    expect(wishOpeningLine("Diwali", "Telugu")).toContain("Diwali");
    expect(wishAudienceRule("Diwali", "Telugu")).not.toContain("Write the festival's name");
    expect(wishOpeningLine("Dussehra", "English")).toContain("warm Dussehra wishes");
  });
});
