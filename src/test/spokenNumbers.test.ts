import { describe, it, expect } from "vitest";
import {
  englishNumberWords, englishOrdinal, pronunciationNotes, speakableLine, spellOutNumbers, teluguNumberWords, withFixedWords,
} from "@/utils/spokenNumbers";
import { findHardWords, everydaySpeechRules } from "@/services/prompts/everydaySpeech";
import { parseScenePlan, motionChoicesOf } from "@/utils/scenePlan";
import { SCENE_PLAN_SYSTEM_PROMPT } from "@/services/prompts/scenePlan";

/**
 * Two words-only rules for every voice-over: numbers are spoken as WORDS, never digits, and మరియు is
 * written exactly మరియు (said "mariyu"). Plus the scene plan choosing how each clip is filmed.
 */

describe("numbers as Telugu words", () => {
  const cases: [number, string][] = [
    [7, "ఏడు"], [15, "పదిహేను"], [21, "ఇరవై ఒకటి"], [99, "తొంభై తొమ్మిది"], [100, "వంద"], [150, "నూట యాభై"],
    [500, "ఐదు వందలు"], [999, "తొమ్మిది వందల తొంభై తొమ్మిది"], [1000, "వెయ్యి"], [2500, "రెండు వేల ఐదు వందలు"],
    [21000, "ఇరవై ఒక వేలు"], [100000, "ఒక లక్ష"], [250000, "రెండు లక్షల యాభై వేలు"], [10000000, "ఒక కోటి"],
    [2026, "రెండు వేల ఇరవై ఆరు"],
  ];
  for (const [n, words] of cases) it(`${n} → ${words}`, () => expect(teluguNumberWords(n)).toBe(words));
});

describe("numbers as English words, in the Indian grouping", () => {
  it("says lakhs and crores the way Indian ads do", () => {
    expect(englishNumberWords(999)).toBe("nine hundred ninety-nine");
    expect(englishNumberWords(150000)).toBe("one lakh fifty thousand");
    expect(englishNumberWords(25000000)).toBe("two crore fifty lakh");
    expect(englishOrdinal(1)).toBe("first");
    expect(englishOrdinal(22)).toBe("twenty-second");
    expect(englishOrdinal(40)).toBe("fortieth");
  });
});

describe("a whole line, spoken", () => {
  it("spells out prices, percentages, grouped numbers and years in a Telugu line", () => {
    expect(spellOutNumbers("కేవలం ₹999 కే, 20% తగ్గింపు, 1,00,000 మంది, 2026 లో.", "Telugu"))
      .toBe("కేవలం తొమ్మిది వందల తొంభై తొమ్మిది రూపాయలకే, ఇరవై శాతం తగ్గింపు, ఒక లక్ష మంది, రెండు వేల ఇరవై ఆరు లో.");
  });

  it("does the same in English, and reads a phone number digit by digit", () => {
    expect(spellOutNumbers("Only Rs. 1,500/- with 2.5% off, open 9:30 daily, our 1st branch, call 98480 12345.", "English"))
      .toBe("Only one thousand five hundred rupees with two point five percent off, open nine thirty daily, our first branch, call nine eight four eight zero one two three four five.");
  });

  it("never mistakes an amount for a phone number", () => {
    expect(spellOutNumbers("100000 customers", "English")).toBe("one lakh customers");
  });

  it("leaves a line with no digits, or a language it has no words for, alone", () => {
    expect(spellOutNumbers("మా షాప్ కి రండి.", "Telugu")).toBe("మా షాప్ కి రండి.");
    expect(spellOutNumbers("हिंदी 25", "Hindi")).toBe("हिंदी 25");
  });
});

describe("మరియు, exactly", () => {
  it("writes every variant spelling the one way", () => {
    expect(withFixedWords("బట్టలు మరీయు నగలు, చీరలు మరియూ పంచెలు.")).toBe("బట్టలు మరియు నగలు, చీరలు మరియు పంచెలు.");
    expect(speakableLine("2 చీరలు మరీయు 3 పంచెలు", "Telugu")).toBe("రెండు చీరలు మరియు మూడు పంచెలు");
  });

  it("is never flagged as a hard word any more, and the writers are told to use it exactly", () => {
    expect(findHardWords("చీరలు మరియు పంచెలు", "Telugu")).toEqual([]);
    expect(everydaySpeechRules("Telugu")).toContain('write it exactly మరియు (said "mariyu")');
    expect(everydaySpeechRules("Telugu")).toContain("Numbers are always WORDS, never digits");
  });

  it("catches the spacings and the half-transliterated forms too", () => {
    for (const wrong of ["మరీయూ", "మరి యు", "మరీ యూ", "mariyu", "MARIYU"]) {
      expect(withFixedWords(`టీ ${wrong} కాఫీ.`), wrong).toBe("టీ మరియు కాఫీ.");
    }
  });

  it("gives Veo its pronunciation", () => {
    expect(pronunciationNotes(["చీరలు మరియు పంచెలు"])).toEqual(['మరియు = "mariyu"']);
    expect(pronunciationNotes(["చీరలు"])).toEqual([]);
  });
});

describe("the scene plan chooses how each clip is filmed", () => {
  it("keeps only the choices that name the plan's own keys", () => {
    const ctx = parseScenePlan(JSON.stringify({
      motive: "a saree showroom", setting: "the showroom", mood: "premium", avoid: [],
      clips: [
        { clip: 1, background: "the entrance display", staging: "walk_and_talk", camera: "follow_tracking", angle: "eye_level", focus: "speaker" },
        { clip: 2, background: "the silk racks", staging: "moonwalk", camera: "zoom", angle: "sideways" },
      ],
    }), 2)!;
    expect(motionChoicesOf(ctx)).toEqual([
      { staging: "walk_and_talk", camera: "follow_tracking", angle: "eye_level", focus: "speaker" },
      { staging: undefined, camera: undefined, angle: undefined, focus: undefined },
    ]);
  });

  it("offers the planner the stagings, moves and angles — and no walking for a deity", () => {
    const p = SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 3, adType: "commercial", subject: "Motu and Patlu", twoHander: true });
    expect(p).toContain("STEP 5 — HOW EACH CLIP IS FILMED");
    expect(p).toContain("walk_and_talk (Walk and talk)");
    expect(p).toContain("follow_tracking (Follow Tracking)");
    expect(p).toContain("over_the_shoulder (Over-the-shoulder)");
    expect(p).toContain('"focus"');
    const deity = SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 3, adType: "commercial", subject: "Ganesha", deity: true });
    expect(deity).not.toContain("walk_and_talk (Walk and talk)");
  });
});
