import { describe, expect, it } from "vitest";
/**
 * The audit after the real-ad check (2026-10-22, night) — the owner: "find all the mistakes like them and
 * solve all them". The same kind as the five found on the real ad: a code swap that breaks a sentence or
 * its meaning, and a line that cannot be said in its 8-second clip.
 */
import {
  MAX_SYLLABLES_PER_CLIP, SYLLABLE_CEILING_PER_CLIP, SYLLABLE_CEILING_PER_PAIR_CLIP,
  clipSyllableIssue, clipSyllableIssues, contractViolations, isSyllableIssue, isWordCountIssue, spokenSyllables,
} from "@/utils/scriptContract";
import { mechanicalCaps } from "@/utils/scriptQa";
import { editProblems, repairDirection } from "@/utils/voiceOverRefine";
import { TELUGU_SCREEN_CTA, wordContractBlock } from "@/services/prompts/wordContract";
import { speakableLine, spellOutNumbers } from "@/utils/spokenNumbers";
import { withoutUnspokenNumbers } from "@/utils/unspokenNumbers";
import { CAMERA_MOVES, planClipMotion, resolveDirection } from "@/services/prompts/motion";
import { SCRIPT_QA_SYSTEM_PROMPT } from "@/services/prompts/scriptQa";
import { MAIN_FRAME_SYSTEM_PROMPT } from "@/services/prompts";

/** The two greeting lines Flow said on the JPN account (2026-10-22). */
const CUT_AT_8S = "స్రీ సాయి కృష్ణ ఇన్‌ఫ్రా రియల్ ఎస్టేట్ వ్యాపార సంస్థ తరఫున మా మిత్రులు, శ్రేయోభిలాషులు, కస్టమర్లందరికీ ఈ పండుగ వేళ హృదయపూర్వక దీపావళి శుభాకాంక్షలు.";
const SAID_IN_786 = "శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రా తరఫున మా మిత్రులు, కస్టమర్లందరికీ దీపావళి శుభాకాంక్షలు! ఈ పండుగ మీ ఇంట సిరులు, సంతోషాలు నింపాలని కోరుకుంటున్నాం.";

describe("a clip must be SAID in eight seconds (syllables, Telugu)", () => {
  it("counts aksharas — a consonant joined by a virama is not its own syllable", () => {
    expect(spokenSyllables("మా")).toBe(1);
    expect(spokenSyllables("కస్టమర్లందరికీ")).toBe(7); // క-స్ట-మ-ర్లం-ద-రి-కీ
    expect(spokenSyllables(TELUGU_SCREEN_CTA)).toBe(23);
    expect(spokenSyllables(SAID_IN_786)).toBe(54);
    // English letters inside a Telugu line count by vowel group; punctuation never counts.
    expect(spokenSyllables("flats mariyu plots.")).toBe(4);
  });

  it("flags a clip over 50 for repair and refuses one over 54 at the final gate", () => {
    expect(clipSyllableIssue(1, MAX_SYLLABLES_PER_CLIP)).toBeNull();
    const issue = clipSyllableIssue(1, 54)!;
    expect(issue).toMatch(/^Clip 1 is too long to say in 8 seconds: 54 syllables, at most 50 fit/);
    expect(isSyllableIssue(issue)).toBe(true);
    expect(isWordCountIssue(issue)).toBe(false);
    // The 54-syllable greeting fitted (just): repaired toward 50, but it may ship.
    expect(contractViolations([SAID_IN_786], 1, false, "Telugu")).toEqual([]);
    expect(spokenSyllables(CUT_AT_8S)).toBeGreaterThan(SYLLABLE_CEILING_PER_CLIP);
    expect(contractViolations([CUT_AT_8S], 1, false, "Telugu").some(isSyllableIssue)).toBe(true);
    // English is not measured, and a caller that names no language keeps the old gate.
    expect(contractViolations([CUT_AT_8S], 1, false, "English").some(isSyllableIssue)).toBe(false);
    expect(contractViolations([CUT_AT_8S], 1).some(isSyllableIssue)).toBe(false);
  });

  it("holds a two-person clip to a lower limit, both lines together", () => {
    const pair = clipSyllableIssue(2, 49, true)!;
    expect(pair).toContain("across both lines together");
    expect(pair).toContain("at most 47 fit");
    const long = `${SAID_IN_786}`;
    expect(spokenSyllables(long)).toBeGreaterThan(SYLLABLE_CEILING_PER_PAIR_CLIP);
    expect(contractViolations([long], 1, true, "Telugu").some(isSyllableIssue)).toBe(true);
    expect(clipSyllableIssues([long, "మా షాప్."], "Telugu", true)).toHaveLength(1);
    expect(clipSyllableIssues([long], "Hindi", true)).toEqual([]);
  });

  it("goes to the repair as it is (it is not a word count) and caps the judge's speakability", () => {
    const issue = clipSyllableIssue(2, 58)!;
    expect(repairDirection([issue])).toBe(issue);
    expect(mechanicalCaps([issue]).speakability).toBe(6);
    // A refine that rewrote clip 2 must land it inside the limit, like the word band.
    expect(editProblems([issue], [issue], [1])).toEqual([issue]);
    expect(editProblems([issue], [issue], [0])).toEqual([]);
  });

  it("is told to every Telugu writer, and only in Telugu", () => {
    expect(wordContractBlock({ language: "Telugu" })).toContain("at most 50 syllables");
    expect(wordContractBlock({ speakers: 2, language: "Telugu" })).toContain("at most 47 syllables (aksharas) in the clip, both lines together");
    expect(wordContractBlock({ language: "English" })).not.toContain("syllables");
    expect(wordContractBlock({})).not.toContain("syllables");
  });
});

describe("prices with a scale are read as the amount, never as rupees + scale", () => {
  it.each([
    ["₹25 లక్షల నుండి ఫ్లాట్స్", "ఇరవై ఐదు లక్షల నుండి flats"],
    ["₹1.5 కోట్లు", "ఒకటిన్నర కోట్లు"],
    ["₹30L కే ఫ్లాట్", "ముప్పై లక్షలకే flat"],
    ["₹2 లక్షలకే ప్లాట్", "రెండు లక్షలకే plot"],
    ["₹1 లక్ష మాత్రమే", "ఒక లక్ష మాత్రమే"],
    ["₹999/- ఆఫర్", "తొమ్మిది వందల తొంభై తొమ్మిది రూపాయలు ఆఫర్"],
    ["₹999 కే", "తొమ్మిది వందల తొంభై తొమ్మిది రూపాయలకే"],
  ])("Telugu: %s", (line, spoken) => {
    expect(speakableLine(line, "Telugu")).toBe(spoken);
  });

  it.each([
    ["Flats from ₹25 lakhs", "Flats from twenty-five lakhs"],
    ["villas at Rs. 1.5 crore", "villas at one point five crore"],
    ["₹5K down payment", "five thousand down payment"],
    ["only ₹1 lakh", "only one lakh"],
    ["₹499 only", "four hundred ninety-nine rupees only"],
  ])("English: %s", (line, spoken) => {
    expect(spellOutNumbers(line, "English")).toBe(spoken);
  });
});

describe("a removed number never leaves a broken sentence", () => {
  it.each([
    ["మా ఫోన్ నంబర్ 98480 12345కి కాల్ చేయండి.", "కాల్ చేయండి."],
    ["వివరాలకు మా నంబర్ 98480 12345 కు ఫోన్ చేయండి.", "వివరాలకు ఫోన్ చేయండి."],
    ["ఈరోజే రండి. మా నంబర్: 98480 12345.", "ఈరోజే రండి."],
    ["కాకినాడ 533005 లో మా షాప్ ఉంది.", "కాకినాడలో మా షాప్ ఉంది."],
    ["హైదరాబాద్ 500001 లో రండి.", "హైదరాబాద్\u{200C}లో రండి."],
    ["Visit us today. Our phone number is 98480 12345.", "Visit us today."],
    ["Call the number 98480 12345 now.", "Call now."],
    ["Call us on 98480 12345 today.", "Call us today."],
  ])("%s", (line, out) => {
    expect(withoutUnspokenNumbers(line)).toBe(out);
  });

  it("leaves a line without such numbers exactly as it is", () => {
    for (const line of ["మా షాప్ మెయిన్ రోడ్‌లో ఉంది.", "Our number one choice for flats.", "మా నంబర్ వన్ షాప్."]) {
      expect(withoutUnspokenNumbers(line)).toBe(line);
    }
  });
});

describe("the director's possessive becomes her / his, never she's", () => {
  const plan = planClipMotion(2, "festival")[1];
  it.each([
    ["The presenter's hands open toward the counter.", "Her hands open toward the counter."],
    ["She smiles; the model's right hand rises toward the logo.", "She smiles; her right hand rises toward the logo."],
    ["The model flat stays in view while the model gestures to it.", "The model flat stays in view while she gestures to it."],
  ])("%s", (action, out) => {
    expect(resolveDirection(plan, { action }, "She").action.replace(/\.$/, ""))
      .toBe(out.replace(/\.$/, ""));
  });

  it("uses his for a male presenter", () => {
    expect(resolveDirection(plan, { action: "The presenter's palm opens toward the shelf." }, "He").action)
      .toMatch(/^His palm opens toward the shelf/);
  });
});

describe("the judge is told what the final clip has room for", () => {
  const base = { language: "Telugu", adType: "festival", festivalName: "Diwali", clipCount: 2 } as const;
  it("names the fixed words and the room, and that a 2-clip wishes ad has no clip for a list of offers", () => {
    const prompt = SCRIPT_QA_SYSTEM_PROMPT({ ...base, closingLine: `"${TELUGU_SCREEN_CTA}"`, address: "మెయిన్ రోడ్, సర్పవరం, కాకినాడ" });
    expect(prompt).toContain("THE FINAL CLIP'S ROOM: clip 2 must say the closing call line and the address (13 words), which leaves at most 7 words");
    expect(prompt).toContain("no clip has room for a list of offers");
  });
  it("says nothing about room when the final clip has no fixed words", () => {
    expect(SCRIPT_QA_SYSTEM_PROMPT({ ...base, language: "English" })).not.toContain("FINAL CLIP'S ROOM");
    expect(SCRIPT_QA_SYSTEM_PROMPT({ ...base, adType: "commercial", clipCount: 4, closingLine: `"${TELUGU_SCREEN_CTA}"` }))
      .not.toContain("no clip has room for a list of offers");
  });
});

describe("the frame prompt asks for one framing and one jewellery rule", () => {
  it("a three-quarter shot everywhere — the frame and the video's push-in agree", () => {
    expect(CAMERA_MOVES.push_in.framing).toMatch(/^a three-quarter shot \(head to knees\)/);
    for (const attire of ["traditional", "professional"]) {
      for (const adType of ["festival", "commercial"]) {
        const prompt = MAIN_FRAME_SYSTEM_PROMPT(attire, adType, adType === "festival" ? "Diwali" : "", "9:16", "real estate flats");
        expect(prompt).not.toMatch(/Close mid-shot only|mid-shot framing only|close-up and dominant/);
        expect(prompt).not.toContain("For professional suit outputs, Clip 1");
      }
    }
  });
  it("a festival saree frame carries semi-jewellery only — never the heavy 'celebrity-level' line above it", () => {
    const prompt = MAIN_FRAME_SYSTEM_PROMPT("traditional", "festival", "Diwali", "9:16", "real estate flats");
    expect(prompt).toContain("JEWELLERY (SEMI-JEWELLERY — MANDATORY)");
    expect(prompt).not.toMatch(/CELEBRITY-LEVEL JEWELLERY|worth lakhs/);
  });
});

describe("the business name is said in the script's letters", () => {
  it("swaps the English-letter name for its spoken spelling, a Telugu ending kept", async () => {
    const { withNativeName, needsNativeName } = await import("@/utils/businessName");
    const te = "శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రా";
    expect(needsNativeName("SRI SAI KRISHNA INFRA")).toBe(true);
    expect(needsNativeName(te)).toBe(false);
    expect(withNativeName("SRI SAI KRISHNA INFRA కాకినాడలో రియల్ ఎస్టేట్.", "SRI SAI KRISHNA INFRA", te)).toBe(`${te} కాకినాడలో రియల్ ఎస్టేట్.`);
    expect(withNativeName("Sri Sai Krishna Infraలో flats.", "SRI SAI KRISHNA INFRA", te)).toBe(`${te}లో flats.`);
    expect(withNativeName("Sri. Sai-Krishna  Infra తరఫున", "SRI SAI KRISHNA INFRA", te)).toBe(`${te} తరఫున`);
    // Never part of a longer English word, and nothing changes without a spelling.
    expect(withNativeName("SRI SAI KRISHNA INFRASTRUCTURE", "SRI SAI KRISHNA INFRA", te)).toBe("SRI SAI KRISHNA INFRASTRUCTURE");
    expect(withNativeName("SRI SAI KRISHNA INFRA", "SRI SAI KRISHNA INFRA", "")).toBe("SRI SAI KRISHNA INFRA");
  });
});

describe("a phrase said again in a later clip", () => {
  it("finds five words in a row repeated, never the name or the closing line", async () => {
    const { repeatedPhraseIssues } = await import("@/utils/scriptContract");
    const clips = [
      "శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రా కాకినాడలో టూ బీహెచ్‌కే mariyu త్రీ బీహెచ్‌కే flats, plots దొరుకుతాయి.",
      "మా దగ్గర టూ బీహెచ్‌కే mariyu త్రీ బీహెచ్‌కే flats ఇరవై ఐదు లక్షల నుండి దొరుకుతాయి.",
      "శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రా కాకినాడ ఆఫీస్‌కి ఈరోజే రండి.",
    ];
    const issues = repeatedPhraseIssues(clips, ["శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రా కాకినాడ"]);
    expect(issues).toEqual([`Clip 2 repeats clip 1's words "టూ బీహెచ్‌కే mariyu త్రీ బీహెచ్‌కే" — say something new in it.`]);
    expect(repeatedPhraseIssues(["ఒకటి రెండు మూడు నాలుగు.", "ఒకటి రెండు మూడు నాలుగు ఐదు."])).toEqual([]);
  });
});

describe("more of the same kind, from the live runs", () => {
  it("joins a case ending left loose after the business name", async () => {
    const { withNativeName } = await import("@/utils/businessName");
    expect(withNativeName("SRI SAI KRISHNA INFRA లో plots.", "SRI SAI KRISHNA INFRA", "శ్రీ సాయి కృష్ణ ఇన్ఫ్రా")).toBe("శ్రీ సాయి కృష్ణ ఇన్ఫ్రాలో plots.");
  });
  it("writes the English 'and' in Telugu letters as mariyu, never inside another word", () => {
    expect(speakableLine("స్కూల్స్ అండ్ బస్ స్టాండ్ దగ్గర.", "Telugu")).toBe("స్కూల్స్ mariyu బస్ స్టాండ్ దగ్గర.");
    expect(speakableLine("మా బ్రాండ్ షాప్.", "Telugu")).toBe("మా బ్రాండ్ షాప్.");
  });
  it("a festival greeting that names a product is sent back", async () => {
    const { wishAudienceIssues } = await import("@/services/prompts/festivalWish");
    const sells = "మీ అందరికీ మంచి flats mariyu plots అందిస్తున్న శ్రీ సాయి తరఫున మా మిత్రులు, కస్టమర్లందరికీ దీపావళి శుభాకాంక్షలు!";
    expect(wishAudienceIssues(sells, 1, "Telugu").some((i) => i.includes('sells nothing, but it names "flats"'))).toBe(true);
    const clean = "శ్రీ సాయి తరఫున మా మిత్రులు, కస్టమర్లందరికీ దీపావళి శుభాకాంక్షలు! మీ ఇంట వెలుగులు నిండాలి.";
    expect(wishAudienceIssues(clean, 1, "Telugu")).toEqual([]);
  });
});

describe("a quoted name taken out of a director's action leaves a whole sentence", () => {
  it("keeps the full stop the quote ended, and drops the preposition it leaves", async () => {
    const { withoutQuotedSpeech } = await import("@/services/prompts/motion");
    expect(withoutQuotedSpeech(`She extends one open palm in a warm welcome on "శ్రీ సాయి కృష్ణ ఇన్ఫ్రా." Her arm then presents the reception.`))
      .toBe("She extends one open palm in a warm welcome. Her arm then presents the reception");
    expect(withoutQuotedSpeech(`She extends one open palm in a warm welcome on "శ్రీ సాయి కృష్ణ ఇన్ఫ్రా" Her arm then presents the reception.`))
      .toBe("She extends one open palm in a warm welcome. Her arm then presents the reception");
    expect(withoutQuotedSpeech(`She lifts her hand on the words "మా ఆఫర్", showing the counter.`)).toBe("She lifts her hand, showing the counter");
  });
});

describe("frames: the only words in the picture, and a clean background stamp", () => {
  it("every frame says the logo (or the name board) is the only writing, before the attach line", async () => {
    const { withOnlyLogoText, ONLY_TEXT_HEADING } = await import("@/utils/frameBrand");
    const stamped = withOnlyLogoText("Motu and Patlu by a layout chart of open plots.\n📎 ATTACH: the logo");
    expect(stamped).toMatch(/TEXT IN THE IMAGE: the attached logo is the ONLY new readable writing in the picture\. Every chart, layout plan, brochure/);
    expect(stamped.indexOf(ONLY_TEXT_HEADING)).toBeLessThan(stamped.indexOf("📎"));
    expect(withOnlyLogoText(stamped)).toBe(stamped);
    expect(withOnlyLogoText("A shop.", { nameBoard: "Sri Sai Krishna Infra" })).toContain('the name board reading "Sri Sai Krishna Infra" is the ONLY');
    expect(withOnlyLogoText("A shop.", { plate: true })).toContain("writing the photograph already shows stays as it is");
  });
  it("the planned background reads as one sentence", async () => {
    const { withSceneBackground } = await import("@/utils/scenePlan");
    const out = withSceneBackground("Frame.", { setting: "The well-lit corporate lounge of the office.", clips: [{ background: "The front reception desk.", elements: [] }] } as never, 0);
    expect(out).toContain("and it belongs to the well-lit corporate lounge of the office.");
    expect(out).not.toContain("..");
  });
});

describe("a Telugu case ending written apart is joined to its word", () => {
  it("joins లో / కి / కు / ను / తో, keeps నుండి apart, and leaves English alone", async () => {
    const { withJoinedEndings } = await import("@/utils/spokenNumbers");
    expect(withJoinedEndings("సర్పవరం కాకినాడ లో ఉన్న ఇన్ఫ్రా లో flats లో.", "Telugu")).toBe("సర్పవరం కాకినాడలో ఉన్న ఇన్ఫ్రాలో flatsలో.");
    expect(withJoinedEndings("మా షాప్ కి రండి.", "Telugu")).toBe("మా షాప్\u{200C}కి రండి.");
    expect(withJoinedEndings("కాకినాడ నుండి వచ్చారు.", "Telugu")).toBe("కాకినాడ నుండి వచ్చారు.");
    expect(withJoinedEndings("Come to us.", "English")).toBe("Come to us.");
    expect(speakableLine("కాకినాడ లో మా ఆఫీస్.", "Telugu")).toBe("కాకినాడలో మా ఆఫీస్.");
  });
});

describe("a villa or plot the business never mentioned is an issue (2026-10-23)", () => {
  /** The live brief: flats and open plots in Kakinada, nothing else. */
  const brief = "Promotional ad for our real estate business. 2BHK and 3BHK flats from ₹25 lakhs and open plots from ₹8 lakhs in Kakinada.";
  it("names the invented villas in the clip that says them, as live (deity and duo runs)", async () => {
    const { unofferedWordIssues } = await import("@/utils/englishWords");
    const issues = unofferedWordIssues([
      "శ్రీ సాయి కృష్ణ ఇన్ఫ్రా దగ్గర flats, plots mariyu villas.",
      "ఎనిమిది లక్షలకే ఓపెన్ plots mariyu విల్లాలు ఉన్నాయి.",
    ], brief);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/^Clip 1 says villas, but the business never mentions any/);
    expect(issues[1]).toMatch(/^Clip 2 says villas/);
    expect(mechanicalCaps(issues)).toEqual({ facts: 4 });
  });
  it("accepts what the business said, in any words that mean it", async () => {
    const { unofferedWordIssues } = await import("@/utils/englishWords");
    expect(unofferedWordIssues(["Our flats and plots, and apartments near the bus stand."], brief)).toEqual([]);
    expect(unofferedWordIssues(["Open plots in Kakinada."], "Open sites in a new venture.")).toEqual([]);
    expect(unofferedWordIssues(["Book your plot today."], "")).toEqual([]);
    expect(unofferedWordIssues(["Book your flat today."], "Open plots only.")[0]).toMatch(/says flats \/ apartments/);
  });
  it("tells every Telugu writer the list is spelling, never something to offer", async () => {
    const { englishWordsRule } = await import("@/utils/englishWords");
    expect(englishWordsRule("Telugu")).toContain("SPELLING rule only, never something to say");
  });
});

describe("a phone number is a run of digit words, never 'టూ బీహెచ్‌కే, త్రీ బీహెచ్‌కే' (2026-10-23)", () => {
  it("passes the live client-photo clip 2 and still catches a number read digit by digit", async () => {
    const { speaksDigitRun } = await import("@/utils/unspokenNumbers");
    expect(speaksDigitRun("ఇరవై నాలుగు గంటల సెక్యూరిటీ, కార్ పార్కింగ్ facilitiesతో టూ బీహెచ్‌కే, త్రీ బీహెచ్‌కే flats ఉన్నాయి.")).toBe(false);
    expect(speaksDigitRun("రెండు mariyu మూడు బెడ్‌రూమ్‌ల flats.")).toBe(false);
    expect(speaksDigitRun("నైన్ ఎయిట్ ఫోర్ ఎయిట్ జీరో కి కాల్ చేయండి.")).toBe(true);
    expect(speaksDigitRun("తొమ్మిది, ఎనిమిది, నాలుగు, ఎనిమిది.")).toBe(true);
  });
});

describe("the single real owner is named by the photograph and framed three-quarter (2026-10-23)", () => {
  it("never names the label, never asks a full figure", async () => {
    const { getCharacterPack } = await import("@/services/characterPacks");
    const { singleOwnerName } = await import("@/services/prompts/characterAd");
    const pack = getCharacterPack("owner_face_male")!;
    expect(singleOwnerName(pack)).toBe("the man in the attached owner image");
    expect(singleOwnerName(getCharacterPack("owner_face_female")!)).toBe("the woman in the attached owner image");
  });
});

describe("a clip in the client's photograph describes no other place (2026-10-23)", () => {
  it("replaces the template's invented reception, Background list and environment layer with the photograph", async () => {
    const { withBackgroundPlate } = await import("@/utils/locationAssignment");
    const frame = [
      "Create an ultra-realistic commercial promotional portrait for \"X\" using the attached official logo as branding reference.",
      "",
      "Generate a premium real-estate office reception environment and place a confident young Indian girl standing in front of the front desk.",
      "",
      "Pose:",
      "- Standing centered, facing the camera",
      "",
      "Background:",
      "- A polished marble and wood reception counter and upscale corporate seating",
      "- Attached official logo mounted behind the counter",
      "",
      "Visual Style:",
      "- Ultra-realistic DSLR photography",
      "REAL ENVIRONMENT LAYER: high-end interior finishes and warm wood accents.",
    ].join("\n");
    const out = withBackgroundPlate(frame, { clip: 0, photoIndex: 0 } as any);
    expect(out).not.toMatch(/Generate a premium|marble|corporate seating|high-end interior/);
    expect(out).toContain("In the attached Store/Office Image #1, exactly as it is (see BACKGROUND PLATE below), place a confident young Indian girl");
    expect(out).toContain("Background: the attached Store/Office Image #1, exactly as it is");
    expect(out).toContain("Pose:\n- Standing centered, facing the camera");
    expect(out).toContain("Visual Style:\n- Ultra-realistic DSLR photography");
    expect(out).toMatch(/BACKGROUND PLATE \(STRICT\): .*the logo or name board, on a surface the photograph already has/);
    expect(withBackgroundPlate(out, { clip: 0, photoIndex: 0 } as any)).toBe(out);
  });
});

describe("the one presenter wears what the job ordered, in the copied prompt (2026-10-23)", () => {
  it("stamps the ordered outfit once, before the attach line, overriding the writer's suit", async () => {
    const { withOrderedOutfit } = await import("@/utils/frameBrand");
    const { wardrobeDirective } = await import("@/services/prompts/characterAd");
    const saree = wardrobeDirective("traditional", "", "female");
    const frame = "Main Character:\n- Wearing a tailored professional power suit in deep navy blue\n📎 ATTACH the logo";
    const out = withOrderedOutfit(frame, saree);
    expect(out).toContain(`OUTFIT (AS ORDERED): ${saree} — this overrides any other outfit named in this prompt`);
    expect(out.indexOf("OUTFIT (AS ORDERED)")).toBeLessThan(out.indexOf("📎"));
    expect(withOrderedOutfit(out, saree)).toBe(out);
    expect(withOrderedOutfit("x", "")).toBe("x");
  });
});
