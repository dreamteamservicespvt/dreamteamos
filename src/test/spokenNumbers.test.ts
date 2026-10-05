import { describe, it, expect } from "vitest";
import {
  englishNumberWords, englishOrdinal, fixedWordsIn, speakableLine, spellOutNumbers, teluguNumberWords, withFixedWords,
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

/**
 * The team reads this word off the page. They want it there as "mariyu" — the Latin spelling — in
 * the voice-over script and in the video prompt's spoken line, and nowhere is it explained: the
 * written word IS the spelling to say.
 */
describe("mariyu, in Latin, everywhere", () => {
  it("writes the Telugu word and every variant spelling as mariyu", () => {
    expect(withFixedWords("బట్టలు మరియు నగలు, చీరలు మరియూ పంచెలు.")).toBe("బట్టలు mariyu నగలు, చీరలు mariyu పంచెలు.");
    expect(speakableLine("2 చీరలు మరీయు 3 పంచెలు", "Telugu")).toBe("రెండు చీరలు mariyu మూడు పంచెలు");
  });

  it("catches the spacings and the misspelled Latin forms too", () => {
    for (const wrong of ["మరియు", "మరీయూ", "మరి యు", "మరీ యూ", "mariyoo", "MARIYU"]) {
      expect(withFixedWords(`టీ ${wrong} కాఫీ.`), wrong).toBe("టీ mariyu కాఫీ.");
    }
  });

  it("is never flagged as a hard word, and the writers are told which spelling to use", () => {
    expect(findHardWords("చీరలు mariyu పంచెలు", "Telugu")).toEqual([]);
    expect(everydaySpeechRules("Telugu")).toContain('write it exactly mariyu');
    expect(everydaySpeechRules("Telugu")).toContain("Numbers are always WORDS, never digits");
  });

  it("can still say which fixed words a script carries", () => {
    expect(fixedWordsIn(["చీరలు mariyu పంచెలు"])).toEqual(["mariyu"]);
    expect(fixedWordsIn(["చీరలు"])).toEqual([]);
  });
});

describe("the scene plan chooses how each clip is filmed", () => {
  it("keeps only the choices that name the plan's own keys — and reads an action key saved before the dynamic pass", () => {
    const ctx = parseScenePlan(JSON.stringify({
      motive: "a saree showroom", setting: "the showroom", mood: "premium", avoid: [],
      clips: [
        { clip: 1, background: "the entrance display", staging: "approach_show", camera: "arc", angle: "eye_level", focus: "speaker" },
        { clip: 2, background: "the silk racks", staging: "walk_and_talk", camera: "follow_tracking", angle: "worms_eye" },
      ],
    }), 2)!;
    // A retired move or angle (follow tracking, worm's eye) is dropped like any unknown key; an action key from
    // before the 2026-10-05 dynamic pass ("walk_and_talk") is read as today's ("walk_toward") — planClipMotion
    // still decides whether this cast may take it.
    expect(motionChoicesOf(ctx)).toEqual([
      { staging: "approach_show", camera: "arc", angle: "eye_level", focus: "speaker" },
      { staging: "walk_toward", camera: undefined, angle: undefined, focus: undefined },
    ]);
  });

  // The planner is offered exactly what planClipMotion lets this cast do (prompts/motion castKindOf).
  it("offers the planner only what this cast may do — a walk wherever it may walk, never a move beyond the frame or backward", () => {
    const drawn = SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 3, adType: "commercial", subject: "Motu and Patlu", twoHander: true, cartoon: true });
    expect(drawn).toContain("STEP 5 — HOW EACH CLIP IS FILMED");
    expect(drawn).toContain("ONE real action and ONE camera move that follows it");
    expect(drawn).toContain("never a talking portrait");
    expect(drawn).toContain("walk_across (Walk along the display)");
    expect(drawn).toContain("side_track (Side Tracking Shot)");
    expect(drawn).toContain("lateral_dolly (Lateral Dolly)");
    expect(drawn).toContain("These are two DRAWN characters: they walk TOGETHER, side by side at one pace, along or across the floor — never toward the camera");
    expect(drawn).not.toMatch(/walk_toward \(|walk_invite \(|push_in \(|arc \(|static_locked|tracking \(|rack_focus|handheld|follow_tracking|over_the_shoulder|crane|orbit/);
    expect(drawn).not.toContain('"focus"');
    expect(drawn).toContain("A pair is always filmed at eye level.");
    const people = SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 3, adType: "commercial", subject: "the two presenters", twoHander: true });
    expect(people).toContain("The two walk TOGETHER, side by side at one pace");
    expect(people).toContain("approach_show (Approach and show)");
    expect(people).not.toContain("push_in (Push In)");
    const solo = SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 3, adType: "commercial", subject: "the model" });
    expect(solo).toContain("push_in (Push In)");
    expect(solo).toContain("walk_toward (Walk toward the camera)");
    expect(solo).toContain("arc (Arc Shot)");
    expect(solo).toContain("Most clips WALK through the place");
    expect(solo).toContain("side_track ONLY with walk_across");
    expect(solo).toContain("The camera never moves backward.");
    expect(solo).not.toContain('"focus"');
    expect(solo).not.toMatch(/static_locked|walk_invite \(/);
    const deity = SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 3, adType: "commercial", subject: "Ganesha", deity: true });
    expect(deity).not.toMatch(/walk_toward \(|walk_across \(|walk_stop_present \(|side_track \(/);
    expect(deity).toContain("turn_present (Turn and present)");
    expect(deity).toContain("A deity never walks");
  });
});
