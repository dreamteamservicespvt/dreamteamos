import { describe, it, expect } from "vitest";
import {
  ENGLISH_WORDS, englishWordList, englishWordsRule, latinLettersException, withEnglishWords, withoutEnglishWords,
  withTeluguLetters,
} from "@/utils/englishWords";
import { speakableLine, withoutFixedWords } from "@/utils/spokenNumbers";
import { countSpokenWords } from "@/utils/scriptContract";
import { findHardWords } from "@/services/prompts/everydaySpeech";
import { speakingWindow, wishMoment, wishWordSpan } from "@/utils/wishGesture";
import {
  assembleRealPersonDuoVeoPrompt, assembleRealPersonVeoPrompt, assembleVeoPrompt, castKindOf, lineNeedsWalk,
  planClipMotion, resolveDirection, spokenLinesIn, stagingPath, wishCue,
  type ClipMotionPlan, type MotionChoice, type Performer, type VeoSpeech,
} from "@/services/prompts/motion";
import { modelVeoSubject } from "@/services/prompts";

/**
 * The owner's 2026-10-22 requests for the AI ads (HANDOFF items 1–4):
 *
 *   1–2. A Telugu voice-over writes ఫ్లాట్స్ / స్లాట్స్ / ఏర్పాట్లు … as the English words in English letters ("flats",
 *        "slots", "arrangements") — a Telugu ఫ is "pha" and nobody says ఏర్పాట్లు to a customer — and no complex words
 *        (utils/englishWords; prompts/everydaySpeech's new hard words).
 *   3.   "Unwanted, irrelevant movements and turning or rotating" in the Veo videos: every cast moves only when the words
 *        need it — walks only where a line takes it somewhere, never turns round, no arc shot (prompts/motion history 8).
 *   4.   The namaskaram exactly when the festival wish is said (utils/wishGesture → wishCue in assembleVeoPrompt, and the
 *        real-person templates).
 *
 * Pure functions only — the full pipeline is covered by adPipelineEndToEnd and the motion rules by motionAndVeo.
 */

/** A zero-width non-joiner, as a Telugu writer puts it between a word and its case ending (ఫ్లాట్స్‌లో). */
const ZWNJ = String.fromCodePoint(0x200c);

/** The Telugu greeting a festival ad's first clip says — its wish comes LAST (దసరా హృదయపూర్వక శుభాకాంక్షలు). */
const GREETING = "శ్రీ సాయి మొబైల్స్ తరఫున మా మిత్రులు, శ్రేయోభిలాషులు, కస్టమర్లందరికీ దసరా హృదయపూర్వక శుభాకాంక్షలు";
/** A line that opens with its wish. */
const WISH_FIRST = "దసరా శుభాకాంక్షలు! మా షాప్‌కి రండి, కొత్త మొబైల్స్ మీద ప్రత్యేక ఆఫర్లు ఉన్నాయి.";
/** A line with no wish at all. */
const NO_WISH = "మా షాప్‌కి రండి, కొత్త మొబైల్స్ మీద ప్రత్యేక ఆఫర్లు ఉన్నాయి.";

describe("English words a Telugu voice-over writes in English letters (owner, 2026-10-22)", () => {
  it("writes ఫ్లాట్స్ / ఫ్లాట్ / ఫ్లాట్లు / స్లాట్స్ as flats / flat / flats / slots", () => {
    expect(ZWNJ).toHaveLength(1);
    expect(withEnglishWords("ఫ్లాట్స్", "Telugu")).toBe("flats");
    expect(withEnglishWords("ఫ్లాట్", "Telugu")).toBe("flat");
    expect(withEnglishWords("ఫ్లాట్లు", "Telugu")).toBe("flats");
    expect(withEnglishWords("స్లాట్స్", "Telugu")).toBe("slots");
  });

  it("keeps a Telugu case ending joined to the English word — through a zero-width joiner too", () => {
    expect(withEnglishWords(`ఫ్లాట్స్${ZWNJ}లో`, "Telugu")).toBe("flatsలో");
    expect(withEnglishWords("ఫ్లాట్లకు", "Telugu")).toBe("flatsకు");
    expect(withEnglishWords("ఏర్పాట్లతో", "Telugu")).toBe("arrangementsతో");
  });

  it("never touches a word that only starts like one — ప్లాట్‌ఫాం (platform) is not a plot", () => {
    expect(withEnglishWords("ప్లాట్ఫాం", "Telugu")).toBe("ప్లాట్ఫాం");
  });

  it("writes the formal nouns as the English word people say — ఏర్పాట్లు → arrangements, సౌకర్యాలు → facilities", () => {
    expect(withEnglishWords("ఏర్పాట్లు", "Telugu")).toBe("arrangements");
    // The noun before a "do" verb is the English verb: never "arrangement చేశాం".
    expect(withEnglishWords("ఏర్పాటు చేశాం", "Telugu")).toBe("arrange చేశాం");
    expect(withEnglishWords("సౌకర్యాలు", "Telugu")).toBe("facilities");
    // సౌకర్యం alone is also "comfort" — only the plural (the facilities of an ad) is replaced.
    expect(withEnglishWords("సౌకర్యంగా", "Telugu")).toBe("సౌకర్యంగా");
  });

  it("changes nothing in any other language", () => {
    for (const language of ["English", "Hindi", "Tamil"]) {
      expect(withEnglishWords("ఫ్లాట్స్", language), language).toBe("ఫ్లాట్స్");
      expect(withEnglishWords("ఏర్పాట్లు చేశాం", language), language).toBe("ఏర్పాట్లు చేశాం");
    }
  });

  it("never changes how many words a clip has — the 17–20 word contract counts the line the same", () => {
    const line = `మా ఫ్లాట్స్${ZWNJ}లో mariyu విల్లాస్ చూడండి, ఏర్పాట్లు అన్నీ రెడీ, ఏర్పాటు చేశాం, సౌకర్యాలు చాలా ఉన్నాయి`;
    const written = withEnglishWords(line, "Telugu");
    expect(written).toBe("మా flatsలో mariyu villas చూడండి, arrangements అన్నీ రెడీ, arrange చేశాం, facilities చాలా ఉన్నాయి");
    expect(countSpokenWords(written)).toBe(countSpokenWords(line));
  });

  it("is applied to every final line by speakableLine — and the 'no Latin letters' check skips these words like mariyu", () => {
    expect(speakableLine(`మా ఫ్లాట్స్${ZWNJ}లో mariyu విల్లాస్ చూడండి`, "Telugu")).toBe("మా flatsలో mariyu villas చూడండి");
    expect(speakableLine("ఫ్లాట్స్", "English")).toBe("ఫ్లాట్స్");
    expect(withoutEnglishWords("మా flatsలో mariyu villas చూడండి")).not.toMatch(/flats|villas/);
    expect(withoutFixedWords("మా flatsలో mariyu villas చూడండి")).not.toMatch(/[A-Za-z]/);
    // Words outside the list keep their Latin letters, so the check still catches them.
    expect(withoutFixedWords("మా shop లో రండి")).toMatch(/shop/);
  });

  it("states the rule for every Telugu writer, and an exception to their 'no Latin letters' rule — '' for other languages", () => {
    const rule = englishWordsRule("Telugu");
    for (const w of ENGLISH_WORDS) expect(rule).toContain(`${w.many} / ${w.one}`);
    expect(rule).toContain("arrangements (never ఏర్పాట్లు)");
    expect(rule).toContain("facilities (never సౌకర్యాలు / సదుపాయాలు / వసతులు)");
    expect(rule).toContain("\"arrange చేశాం\" for ఏర్పాటు చేశాం");
    expect(rule).toContain("flatsలో, plotsకి, arrangementsతో");
    expect(rule).toMatch(/^ONLY these words are written in ENGLISH letters/);
    expect(rule).toContain("టూ బీహెచ్‌కే (never 2BHK)");
    expect(englishWordsRule("English")).toBe("");
    expect(englishWordsRule("Hindi")).toBe("");
    expect(latinLettersException("Telugu")).toBe(` (except mariyu and ONLY these English words in English letters: ${englishWordList()} — every other English word stays in Telugu letters)`);
    expect(englishWordList()).toContain("flats / flat, slots / slot");
    expect(latinLettersException("Hindi")).toBe("");
    expect(latinLettersException("English")).toBe("");
  });

  /**
   * Live run 2 (2026-10-22, gemini-2.5-flash) shipped "రెండుBHK, మూడుBHK flats mariyu open plots" at 7/10: asking
   * was not enough, so the words that stay in Telugu letters are written back in code, like the list the other way.
   */
  it("writes every other English word on the list back in Telugu letters, in code", () => {
    const BHK = "బీహెచ్\u{200C}కే";
    expect(withTeluguLetters("2BHK, 3 BHK mariyu 2-bhk flats", "Telugu")).toBe(`టూ ${BHK}, త్రీ ${BHK} mariyu టూ ${BHK} flats`);
    expect(withTeluguLetters("రెండుBHK, మూడుBHK flats mariyu open plots", "Telugu"))
      .toBe(`రెండు ${BHK}, మూడు ${BHK} flats mariyu ఓపెన్ plots`);
    expect(withTeluguLetters("Bank loanతో, car parking, 24 hour security, Free offer", "Telugu"))
      .toBe("బ్యాంక్ లోన్\u{200C}తో, కార్ పార్కింగ్, 24 hour సెక్యూరిటీ, ఫ్రీ ఆఫర్");
    // Words that only contain a listed one, and the English-letter list itself, are left alone.
    expect(withTeluguLetters("opening bookings carpet shopping arrangements", "Telugu")).toBe("opening bookings carpet shopping arrangements");
    expect(withTeluguLetters("2BHK open plots", "English")).toBe("2BHK open plots");
    expect(withTeluguLetters("2BHK open plots", "Hindi")).toBe("2BHK open plots");
    // Through speakableLine: before the numbers become words, so "2BHK" is never "రెండుBHK"; the counter sees what ships.
    const line = speakableLine("2BHK ఫ్లాట్స్ mariyu open ప్లాట్స్, booking open, bank loan ఏర్పాట్లతో", "Telugu");
    expect(line).toBe(`టూ ${BHK} flats mariyu ఓపెన్ plots, booking ఓపెన్, బ్యాంక్ లోన్ arrangementsతో`);
    expect(withoutEnglishWords(withoutFixedWords(line))).not.toMatch(/[A-Za-z]/);
    expect(countSpokenWords(line)).toBe(11);
    // The prompt names the same words.
    expect(englishWordsRule("Telugu")).toContain(`ఓపెన్, బ్యాంక్, లోన్, పార్కింగ్, కార్, సెక్యూరిటీ, ఆఫర్, ఫ్రీ, సర్వీస్, షాప్, టూ ${BHK} (never 2BHK), త్రీ ${BHK}`);
  });

  it("flags the new complex words — but never inside the business's own name", () => {
    const hits = findHardWords("సరసమైన ధరలో అత్యాధునిక విశాలమైన ఫ్లాట్స్", "Telugu").map((h) => h.found);
    expect(hits).toEqual(["సరసమైన", "అత్యాధునిక", "విశాలమైన"]);
    expect(findHardWords("సరసమైన ధరలో విశాలమైన ఫ్లాట్స్", "Telugu").map((h) => h.say)).toEqual(["తక్కువ", "పెద్ద"]);
    // A name is never "hard": Vishal Mart, Saraswathi Silks, అత్యాధునిక హాస్పిటల్ are what the business is called.
    expect(findHardWords("విశాలమైన షోరూమ్ కి రండి", "Telugu", ["Vishal Mart"])).toEqual([]);
    expect(findHardWords("సరసమైన ధరలు", "Telugu", ["Saraswathi Silks"])).toEqual([]);
    expect(findHardWords("అత్యాధునిక హాస్పిటల్ కి రండి", "Telugu", ["అత్యాధునిక హాస్పిటల్"])).toEqual([]);
    // Telugu only.
    expect(findHardWords("సరసమైన ధరలు", "English")).toEqual([]);
  });
});

describe("the moment of the festival wish in a spoken line (utils/wishGesture)", () => {
  it("finds a Telugu greeting's wish at the END of the clip — where it is said", () => {
    expect(wishWordSpan(GREETING)).toEqual([8, 10]);
    const m = wishMoment(GREETING)!;
    expect(m.from).toBeGreaterThanOrEqual(4);
    expect(m.to).toBeLessThanOrEqual(8);
    expect(m.to - m.from).toBeGreaterThanOrEqual(2);
    expect(m.label).toBe(`${m.from}–${m.to}s`);
  });

  it("finds a wish that opens the line near the start", () => {
    const m = wishMoment(WISH_FIRST)!;
    expect(m.from).toBeLessThanOrEqual(1);
    expect(m.to).toBeLessThanOrEqual(3);
  });

  it("reads an English wish — and never 'our happy customers'", () => {
    expect(wishMoment("Happy Diwali to all our customers")).not.toBeNull();
    expect(wishWordSpan("Happy Diwali to all our customers")).toEqual([0, 1]);
    expect(wishWordSpan("Wishing you all a very happy Diwali")![0]).toBe(0);
    expect(wishMoment("our happy customers")).toBeNull();
    expect(wishMoment("Thank you to all our happy customers")).toBeNull();
  });

  it("keeps a pair speaker's wish inside their own half of the clip", () => {
    expect(speakingWindow("4–8s")).toEqual([4, 8]);
    expect(speakingWindow("0-4s")).toEqual([0, 4]);
    expect(speakingWindow(undefined)).toEqual([0, 8]);
    expect(speakingWindow("8–4s")).toEqual([0, 8]);
    for (const at of ["0–4s", "4–8s"]) {
      const [start, end] = speakingWindow(at);
      for (const line of [GREETING, WISH_FIRST]) {
        const m = wishMoment(line, [start, end])!;
        expect(m.from, `${at} ${line}`).toBeGreaterThanOrEqual(start);
        expect(m.to, `${at} ${line}`).toBeLessThanOrEqual(end);
      }
    }
  });

  it("finds nothing in a line without a wish", () => {
    expect(wishWordSpan(NO_WISH)).toBeNull();
    expect(wishMoment(NO_WISH)).toBeNull();
    expect(wishMoment("")).toBeNull();
  });
});

describe("the namaskaram, placed by code on the wish words (wishCue in assembleVeoPrompt)", () => {
  const model = modelVeoSubject("female");
  const build = (plan: ClipMotionPlan, line: string, direction?: { action: string }) => assembleVeoPrompt({
    aspectRatio: "9:16", plan, direction, identityLock: model.identityLock, language: "Telugu",
    speech: [{ voice: model.voice, line }], cast: model.cast, castPlural: model.castPlural,
  });
  const festival = planClipMotion(4, "festival", "person", { lines: [GREETING, NO_WISH, NO_WISH, NO_WISH] });

  it("puts the greeting's namaskaram AFTER the action, timed to the wish — and never in the action itself", () => {
    expect(festival[0].role).toBe("wish");
    const p = build(festival[0], GREETING);
    const action = "she faces the camera with a warm, festive smile and greets the viewer, the hands relaxed until the wish.";
    const cue = `Exactly as she says the festival wish (about ${wishMoment(GREETING)!.label}), she joins both palms together at the chest in a namaskaram with a slight, respectful bow of the head and holds it through those words`;
    expect(p).toContain(action);
    expect(p).toContain(cue);
    expect(p.indexOf(cue)).toBeGreaterThan(p.indexOf(action));
    expect(action).not.toMatch(/namaste|namaskar|palms? together|bow/i);
    expect(p.match(/namaskaram/g)).toHaveLength(1);
    expect(spokenLinesIn(p)).toEqual([GREETING]);
  });

  it("refuses a director's namaste on the greeting and still adds the code's timed one", () => {
    const p = build(festival[0], GREETING, { action: "She joins her palms in a namaste and bows warmly to the viewer" });
    expect(p).not.toContain("namaste");
    expect(p).toContain("Exactly as she says the festival wish (about");
    // A usable action is kept, and the cue follows it.
    const kept = build(festival[0], GREETING, { action: "She smiles warmly at the viewer with an open palm on the business name" });
    expect(kept).toContain(": she smiles warmly at the viewer with an open palm on the business name. Exactly as she says the festival wish");
  });

  it("still gives the greeting its namaskaram, untimed, when no wish word is found in the line", () => {
    const p = build(festival[0], "శ్రీ సాయి మొబైల్స్ తరఫున అందరికీ నమస్కారం");
    expect(p).toContain("Exactly as she says the festival wish, she joins both palms together at the chest in a namaskaram");
    expect(p).not.toMatch(/festival wish \(about/);
  });

  it("gives any other clip a namaskaram only when its own line wishes", () => {
    expect(festival[1].role).not.toBe("wish");
    expect(build(festival[1], NO_WISH)).not.toMatch(/namaskaram|festival wish/);
    expect(wishCue(festival[1], [{ voice: "v", line: NO_WISH }], "She")).toBe("");
    const closing = build(festival[3], "దీపావళి శుభాకాంక్షలు, ఈరోజే మా షాప్‌కి రండి");
    expect(closing).toContain("Exactly as she says the festival wish (about 0–");
    // A commercial ad's clip that happens to wish gets it too.
    const commercial = planClipMotion(2, "commercial")[1];
    expect(build(commercial, "Happy Diwali to all our customers, come to our shop today")).toContain("in a namaskaram");
  });

  it("has a deity raise the blessing palm instead — never a namaskaram", () => {
    const deity = planClipMotion(4, "festival", "deity")[0];
    const cue = wishCue(deity, [{ voice: "v", line: "అందరికీ దసరా శుభాకాంక్షలు" }], "Ganesha");
    expect(cue).toContain("Exactly as the festival wish is said (about 0–8s), Ganesha raises the blessing palm toward the viewer.");
    expect(cue).not.toMatch(/namaskaram|palms together/);
  });

  it("has a pair join their palms together on the line of whoever says the wish, inside that speaker's half", () => {
    const pair = planClipMotion(4, "festival", "person", { twoHander: true })[0];
    const speech: VeoSpeech[] = [
      { speaker: "Priya", at: "0–4s", position: "on the LEFT of the frame", voice: "a warm voice", line: "నమస్కారం అండి, మా షాప్ కి స్వాగతం" },
      { speaker: "Kavya", at: "4–8s", position: "on the RIGHT of the frame", voice: "a bright voice", line: GREETING },
    ];
    const cue = wishCue(pair, speech, "Both people", true);
    const m = wishMoment(GREETING, [4, 8])!;
    expect(m.from).toBeGreaterThanOrEqual(4);
    expect(cue).toBe(` Exactly as Kavya says the festival wish (about ${m.label}), both join their palms together at the chest in a namaskaram with a slight, respectful bow of the head and hold it through those words, then lower their hands with warm smiles — the hands stay relaxed until then.`);
    const p = assembleVeoPrompt({
      aspectRatio: "9:16", plan: pair, identityLock: "both people's exact faces", language: "Telugu", speech,
      cast: "Both people", castPlural: true, twoHander: true,
    });
    expect(p).toContain(cue.trim());
    expect(spokenLinesIn(p)).toEqual([speech[0].line, GREETING]);
  });
});

describe("a director's action that turns the body or does a namaste is refused (motion TURNS / NAMASTE)", () => {
  const inPlace = planClipMotion(4, "commercial")[1];

  it("falls back to the plan's action for a turn, a spin or a namaste", () => {
    expect(inPlace.walks).toBe(false);
    for (const action of [
      "she turns around to show the shelves",
      "she spins",
      "she joins her palms in a namaste",
      "she rotates slowly toward the display",
      "she turns away from the camera to point at the rack",
      "she folds her hands and bows",
    ]) expect(resolveDirection(inPlace, { action }, "She").action, action).toBe(stagingPath(inPlace, "She"));
  });

  it("keeps a turn of the head toward what she presents — a gesture, not the body", () => {
    const action = "she turns her head toward the shelf and presents it with an open palm";
    expect(resolveDirection(inPlace, { action }, "She").action).toBe(action);
  });
});

describe("the real-person templates add the namaskaram only on a wishing line", () => {
  it("one owner: the owner's template, with the timed namaskaram only when the line wishes", () => {
    const wishing = assembleRealPersonVeoPrompt({ gender: "female", line: GREETING });
    expect(wishing).toContain(`with appropriate gestures — and exactly as she says the wishes (about ${wishMoment(GREETING)!.label}), a namaskaram: both palms joined at the chest with a slight bow`);
    expect(spokenLinesIn(wishing)).toEqual([GREETING]);
    // Without a wish it is exactly the owner's template (2026-10-08).
    expect(assembleRealPersonVeoPrompt({ gender: "male", line: NO_WISH }))
      .toBe(`With a very sweet voice he needs to say :-\n\n${NO_WISH}\n\nwith appropriate gestures\n\nNegative prompt :-\nNo text on the screen`);
    expect(assembleRealPersonVeoPrompt({ gender: "male", line: GREETING })).toContain("exactly as he says the wishes");
  });

  it("two owners: both join their palms exactly as the owner who wishes says it — and nothing when nobody wishes", () => {
    const seats = [{ kind: "man", side: "LEFT" }, { kind: "woman", side: "RIGHT" }] as const;
    const wishing = assembleRealPersonDuoVeoPrompt({ seats: [...seats], lines: [{ seat: 0, line: GREETING }, { seat: 1, line: NO_WISH }] });
    expect(wishing).toContain("with appropriate gestures — only the one speaking moves their lips; the other listens and reacts. Exactly as the man on the LEFT says the wishes, both join their palms at the chest in a namaskaram with a slight bow.");
    expect(spokenLinesIn(wishing)).toEqual([GREETING, NO_WISH]);
    const second = assembleRealPersonDuoVeoPrompt({ seats: [...seats], lines: [{ seat: 0, line: NO_WISH }, { seat: 1, line: GREETING }] });
    expect(second).toContain("Exactly as the woman on the RIGHT says the wishes");
    const plain = assembleRealPersonDuoVeoPrompt({ seats: [...seats], lines: [{ seat: 0, line: NO_WISH }, { seat: 1, line: NO_WISH }] });
    expect(plain).not.toMatch(/namaskaram|wishes/);
  });
});

/**
 * The owner's choice, 2026-10-22 — "move only when the words need it" — over every cast, every length, both ad types and
 * every mix of the client's photos: no plan ever uses the retired arc, and a clip walks if and only if its words take
 * the cast somewhere (or the scene plan judged so), never in the festival greeting and never for a deity.
 */
describe("every cast moves only when the words need it — no arc, no walk without words that walk", () => {
  const PERFORMERS: Performer[] = ["person", "cartoon", "deity"];
  /** Lines that walk (lineNeedsWalk) mixed with lines that do not — a product, a promise, an invitation to the viewer. */
  const MIXED = [
    "Come with me, let's go inside and see!", "See our new silk saree collection.", "రా, లోపలికి వెళ్దాం!",
    "Trusted for twenty years.", "ఈరోజే రండి.", "Follow me to the counter.", "Visit us today.", "పదండి, షోరూమ్ చూద్దాం!",
  ];

  it("never plans the arc, and walks exactly the clips whose words take them somewhere", () => {
    for (const performer of PERFORMERS) for (const twoHander of [false, true]) for (const adType of ["commercial", "festival"]) {
      for (let n = 1; n <= 8; n++) {
        for (const photos of ["none", "all", "mixed"] as const) {
          const plates = Array.from({ length: n }, (_, i) => photos === "all" || (photos === "mixed" && i % 2 === 0));
          const lines = Array.from({ length: n }, (_, i) => MIXED[(i + n) % MIXED.length]);
          // The scene plan asks for the arc on every clip — it is never used.
          const choices: MotionChoice[] = Array.from({ length: n }, () => ({ camera: "arc" }));
          const plan = planClipMotion(n, adType, performer, { twoHander, plates, lines, choices });
          const deity = castKindOf(performer, twoHander) === "deity";
          for (const clip of plan) {
            const at = `${performer}${twoHander ? " pair" : ""} ${adType} ${n} ${photos}, clip ${clip.clip + 1}: ${lines[clip.clip]}`;
            expect(clip.camera.key, at).not.toBe("arc");
            expect(clip.walks, at).toBe(lineNeedsWalk(lines[clip.clip]) && clip.role !== "wish" && !deity);
            expect(clip.staging.walks, at).toBe(clip.walks);
            expect(clip.walksWhenNeeded, at).toBe(true);
          }
        }
      }
    }
  });

  it("takes the scene plan's own walk judgment over the words — still never for the greeting or a deity", () => {
    for (const performer of PERFORMERS) for (const twoHander of [false, true]) {
      const lines = ["Let's go inside!", "Let's go inside!", "a", "b"];
      const choices: MotionChoice[] = [{ walk: true }, { walk: false }, { walk: true }, { walk: false }];
      const deity = castKindOf(performer, twoHander) === "deity";
      const commercial = planClipMotion(4, "commercial", performer, { twoHander, lines, choices });
      expect(commercial.map((c) => c.walks), `${performer} ${twoHander}`).toEqual(deity ? [false, false, false, false] : [true, false, true, false]);
      const festival = planClipMotion(4, "festival", performer, { twoHander, lines, choices });
      expect(festival[0].walks, `${performer} ${twoHander} greeting`).toBe(false);
    }
  });
});
