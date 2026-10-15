import { describe, it, expect } from "vitest";
import {
  MAX_WORDS_PER_CLIP, MIN_WORDS_PER_CLIP, PREFERRED_WORDS_PER_CLIP, bandDistance, clipWordCountIssue, clipWordCounts,
  clipsAtPace, clipsNeededFor, contractViolations, countSpokenWords, inWordBand, isWordCountIssue, spokenTextOf, spokenWordsOf,
  wordBudgetFor,
} from "@/utils/scriptContract";
import * as dialogueFormat from "@/utils/dialogueFormat";
import { validateDialogueClips, type DialogueClip } from "@/utils/dialogueFormat";
import { TELUGU_SCREEN_CTA, WORD_BAND_TEXT, wordContractBlock } from "@/services/prompts/wordContract";
import { CHARACTER_CATALOGUE } from "@/services/characterCatalogue";
import { getCharacterPack, packSpeakers } from "@/services/characterPacks";
import { CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT, CHARACTER_VOICEOVER_SYSTEM_PROMPT, contractRegisterFor } from "@/services/prompts/characterAd";
import { VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT, VOICEOVER_REPAIR_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "@/services/prompts";
import { VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT } from "@/services/prompts/refine";
import { speakableLine } from "@/utils/spokenNumbers";

/**
 * 2026-10-15 — THE voice-over word contract (utils/scriptContract), owner's rule: every clip of every
 * generated script holds 17–20 spoken words (18–19 preferred, 20 the hard ceiling, 21 never), for every
 * cast, ad type and language; a two-person clip's two lines TOGETHER. One counter, one band, one wording —
 * these tests assert the actual counts of actual text, not only that a prompt mentions "17–20".
 */

/** Exactly `n` distinct English words. */
const en = (n: number) => Array.from({ length: n }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}${Math.floor(i / 26) || ""}`).join(" ");
/** Exactly `n` distinct everyday Telugu words. */
const TE_WORDS = ["మా", "షాప్", "లో", "ప్రతి", "కుటుంబం", "కోసం", "మంచి", "బట్టలు", "ఉన్నాయి", "ఈరోజే", "కొత్త", "డిజైన్లు",
  "చూడండి", "ధరలు", "తక్కువ", "సేవ", "బాగుంటుంది", "మీకు", "నచ్చుతుంది", "అందరికీ", "పెద్ద", "కలెక్షన్", "రంగులు", "చీరలు"];
const te = (n: number) => TE_WORDS.slice(0, n).join(" ");

describe("the one counter — words a listener hears", () => {
  it("counts the boundary cases exactly: 16, 17, 18, 19, 20, 21", () => {
    for (const n of [16, 17, 18, 19, 20, 21]) expect(countSpokenWords(`${en(n)}.`), `${n}`).toBe(n);
    for (const n of [16, 17, 18, 19, 20, 21]) expect(countSpokenWords(`${te(n)}.`), `te ${n}`).toBe(n);
  });

  it("counts Telugu words whole — vowel signs, the virama and the zero-width joiners stay inside a word", () => {
    expect(countSpokenWords(TELUGU_SCREEN_CTA)).toBe(9);
    expect(spokenWordsOf("స్క్రీన్‌పై ఉన్న నంబర్‌కు")).toEqual(["స్క్రీన్‌పై", "ఉన్న", "నంబర్‌కు"]);
    expect(countSpokenWords("మీ బిజినెస్ కోసం బెస్ట్ ఆఫర్!")).toBe(5);
  });

  it("never lets punctuation make a phantom word", () => {
    // A dash, an ellipsis or a danda standing between two words was a word to the old geminiService counter.
    expect(countSpokenWords("Fresh — hot … tasty – today ! ? ,")).toBe(4);
    expect(countSpokenWords("नमस्ते । आइए ॥")).toBe(2);
    expect(countSpokenWords("“Happy Diwali,” she said (warmly) [with joy].")).toBe(7);
    expect(countSpokenWords("…")).toBe(0);
    expect(countSpokenWords("🎉 ✨ Sale ★ today 🎉")).toBe(2);
  });

  it("keeps an apostrophe inside a word one word — the old dialogue counter split \"don't\" in two", () => {
    expect(countSpokenWords("Don't miss Lakshmi's sale, it's here.")).toBe(6);
    expect(spokenWordsOf("don't")).toEqual(["don't"]);
    // An apostrophe at the edge is a quote mark.
    expect(countSpokenWords("'Fresh' cakes")).toBe(2);
  });

  it("counts mixed-language speech word by word — mariyu and brand names included", () => {
    expect(countSpokenWords("మా షాప్ లో చీరలు mariyu బట్టలు Sharma Silks లో దొరుకుతాయి.")).toBe(10);
    expect(countSpokenWords("Tea & Coffee")).toBe(3);
  });

  it("separates words joined by a zero-width space, and counts hyphenated parts as they are said", () => {
    expect(countSpokenWords("hello\u{200B}world")).toBe(2);
    expect(countSpokenWords("one-stop shop")).toBe(3);
  });

  it("never counts clip headers, timestamps or speaker labels", () => {
    const spoken = `${en(18)}.`;
    for (const raw of [
      `0-8: ${spoken}`, `clip-1[0-8sec]: ${spoken}`, `Clip 1 (0-8 sec) - ${spoken}`, `[8-16sec]: ${spoken}`,
      `Scene 2: ${spoken}`, `0-8|motu: ${spoken}`, `[Motu]: ${spoken}`, `[చోటా భీమ్]: ${spoken}`,
    ]) expect(countSpokenWords(spokenTextOf(raw)), raw).toBe(18);
    // Two labelled lines of a two-person clip: only the words.
    expect(countSpokenWords(spokenTextOf(`[Girl]: ${en(9)}?\n[Boy]: ${en(9)}.`))).toBe(18);
    // A plain "Name:" is a label only for a speaker this ad has — "Offer: 20% off" is speech.
    expect(countSpokenWords(spokenTextOf("Motu: hello there friend", ["Motu"]))).toBe(3);
    expect(countSpokenWords(spokenTextOf("Offer: twenty percent off", ["Motu"]))).toBe(4);
  });

  it("counts a line as it will be SPOKEN — a price is the words that are said", () => {
    const raw = "Every saree is just ₹999 today.";
    expect(countSpokenWords(raw)).toBe(6);
    expect(speakableLine(raw, "English")).toBe("Every saree is just nine hundred ninety-nine rupees today.");
    expect(countSpokenWords(speakableLine(raw, "English"))).toBe(10);
  });
});

describe("the one band — 17–20, the same for every cast", () => {
  it("is 17 to 20, 18–19 preferred, and every old band now resolves to it", () => {
    expect([MIN_WORDS_PER_CLIP, MAX_WORDS_PER_CLIP]).toEqual([17, 20]);
    expect(PREFERRED_WORDS_PER_CLIP).toEqual({ min: 18, max: 19 });
    expect(dialogueFormat.MIN_WORDS_PER_CLIP).toBe(17);
    expect(dialogueFormat.MAX_WORDS_PER_CLIP).toBe(20);
    expect("MIN_WORDS_PER_DUO_CLIP" in dialogueFormat).toBe(false);
    expect("MIN_WORDS_PER_KIDS_CLIP" in dialogueFormat).toBe(false);
    for (const n of [1, 2]) expect(wordBudgetFor(n)).toMatchObject({ minClip: 17, maxClip: 20 });
    expect(wordBudgetFor(2, { children: true })).toEqual(wordBudgetFor(2));
  });

  it("rejects 16 and 21, accepts 17, 18, 19 and exactly 20 — one wording for every validator", () => {
    expect(inWordBand(16)).toBe(false);
    for (const n of [17, 18, 19, 20]) expect(inWordBand(n)).toBe(true);
    expect(inWordBand(21)).toBe(false);
    expect(clipWordCountIssue(1, 16)).toBe("Clip 1 must contain 17–20 spoken words, but it has 16.");
    expect(clipWordCountIssue(2, 21, true)).toBe("Clip 2 must contain 17–20 spoken words across both lines together, but it has 21.");
    expect(clipWordCountIssue(3, 20)).toBeNull();
    expect(isWordCountIssue(clipWordCountIssue(2, 21, true)!)).toBe(true);
    expect(isWordCountIssue("Clip 2 leaks CTA or contact language before the final clip.")).toBe(false);
  });

  it("checks a whole script: count, empty, too short, too long, duplicated", () => {
    const ok = [`${en(17)}.`, `${te(18)}.`, `${en(19)} final.`.replace(/^/, "Every "), `${en(20)}!`];
    expect(clipWordCounts(ok)).toEqual([17, 18, 21, 20]);
    expect(contractViolations(ok, 4)).toEqual(["Clip 3 must contain 17–20 spoken words, but it has 21."]);
    expect(contractViolations([`${en(18)}.`, ""], 2)).toEqual(["Clip 2 is empty."]);
    expect(contractViolations([`${en(18)}.`, `${en(18)}!`], 2)).toEqual(["Clip 2 duplicates clip 1."]);
    expect(contractViolations([`${en(18)}.`], 2)).toEqual(["Expected exactly 2 clips but got 1."]);
    expect(contractViolations([`${en(16)}.`, `${en(17)} x.`], 2)).toEqual(["Clip 1 must contain 17–20 spoken words, but it has 16."]);
    expect(bandDistance([16, 17, 20, 23])).toBe(1 + 3);
  });

  it("counts a two-person clip across both lines together — never 17–20 each", () => {
    const speakers = packSpeakers(getCharacterPack("human_duo_mixed")!);
    const clip = (a: number, b: number): DialogueClip => [{ speaker: speakers[0].key, text: `${en(a)}?` }, { speaker: speakers[1].key, text: `${te(b)}.` }];
    expect(validateDialogueClips([clip(8, 8)], 1, speakers)).toContain("Clip 1 must contain 17–20 spoken words across both lines together, but it has 16.");
    for (const [a, b] of [[8, 9], [9, 9], [9, 10], [10, 10]]) expect(validateDialogueClips([clip(a, b)], 1, speakers), `${a}+${b}`).toEqual([]);
    expect(validateDialogueClips([clip(10, 11)], 1, speakers)).toContain("Clip 1 must contain 17–20 spoken words across both lines together, but it has 21.");
  });

  it("holds a single character's one line to the clip band itself", () => {
    const speakers = packSpeakers(getCharacterPack("god_ganesha")!);
    const one = (n: number): DialogueClip => [{ speaker: speakers[0].key, text: `${en(n)}.` }];
    expect(validateDialogueClips([one(16)], 1, speakers)).toEqual(["Clip 1 must contain 17–20 spoken words, but it has 16."]);
    expect(validateDialogueClips([one(20)], 1, speakers)).toEqual([]);
    expect(validateDialogueClips([one(21)], 1, speakers)).toEqual(["Clip 1 must contain 17–20 spoken words, but it has 21."]);
  });

  it("estimates clips from raw text by the same numbers", () => {
    expect(clipsNeededFor(0)).toBe(0);
    expect(clipsNeededFor(20)).toBe(1);
    expect(clipsNeededFor(21)).toBe(2);
    expect(clipsAtPace(37)).toBe(2);
    expect(clipsAtPace(74)).toBe(4);
  });
});

describe("one contract, stated the same way to every writer, repairer, editor and reviewer", () => {
  it("does the closing sentence's arithmetic in code — the 9-word Telugu call line counts inside its clip", () => {
    const block = wordContractBlock({ closingLine: `"${TELUGU_SCREEN_CTA}"`, address: "ఆర్టీసీ బస్ స్టాండ్ ఎదురుగా, కాకినాడ" });
    expect(block).toContain(`is 9 words and counts INSIDE that clip's 17–20, so the rest of the final clip has 8–11 words`);
    expect(block).toContain(`("ఆర్టీసీ బస్ స్టాండ్ ఎదురుగా, కాకినాడ", 5 words) among them`);
    // 9 + 5 fixed words leave 3–6: the final clip is a short invitation, every offer goes earlier (found live, 2026-10-15).
    expect(block).toContain("That leaves the final clip room for only 3–6 other words — a short invitation, nothing more. Put every offer and every fact in an EARLIER clip");
    expect(wordContractBlock({ speakers: 1 })).not.toContain("room for only");
  });

  it("splits a two-person clip evenly and never asks for 17–20 each", () => {
    const pair = wordContractBlock({ speakers: 2, names: ["Motu", "Patlu"] });
    expect(pair).toContain("A clip's TWO lines TOGETHER make the 17–20 — never 17–20 each");
    expect(pair).toContain("about 8–10 words for Motu's line and 8–10 for Patlu's (each line 7–12)");
    expect(wordContractBlock({ speakers: 1 })).toContain("The one speaker's line IS the clip: 17–20 words");
  });

  it("keeps each cast natural inside the same budget — children, deities, cartoons", () => {
    expect(wordContractBlock({ speakers: 2, register: "children" })).toContain("a nine-year-old really says");
    expect(wordContractBlock({ register: "deity" })).toContain("A blessing is calm and unhurried");
    expect(wordContractBlock({ speakers: 2, register: "cartoon" })).toContain("keep their own rhythm and personality");
  });

  it("is in every single-voice prompt — writer, repair, native-speaker review, refine editor", () => {
    const heading = "THE WORD BUDGET — 17–20 SPOKEN WORDS IN EVERY CLIP";
    for (const language of ["Telugu", "English", "Hindi"]) {
      expect(VOICEOVER_SYSTEM_PROMPT(32, 4, "commercial", "", language), language).toContain(heading);
      expect(VOICEOVER_SYSTEM_PROMPT(32, 4, "festival", "Diwali", language), language).toContain(heading);
      expect(VOICEOVER_REPAIR_SYSTEM_PROMPT(32, 4, "commercial", "", language), language).toContain(heading);
      expect(VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT(language), language).toContain(heading);
      expect(VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({ language, clipCount: 4, adType: "commercial" }), language).toContain(heading);
    }
    expect(WORD_BAND_TEXT).toBe("17–20 spoken words (aim for 18–19; 20 is the hard ceiling)");
  });

  /*
    The category matrix, generated from the catalogue itself: every entry's writer and repair prompts carry the
    one contract for ITS cast — a pair's split for two speakers, the single line for one — the register note
    for its kind, and none of the old bands. A deity is never given a two-person contract, a solo never asked
    for two lines, and no entry's own text sets a length.
  */
  for (const pack of CHARACTER_CATALOGUE) {
    it(`${pack.id}: the writer and the repair state the contract for its own cast`, () => {
      const pair = pack.characters.length > 1;
      for (const [adType, festival] of [["commercial", ""], ["festival", "Diwali"]] as const) {
        for (const language of ["Telugu", "English"]) {
          const writer = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, adType, festival, language, "Kakinada");
          const repair = CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(pack, 32, 4, language, "Kakinada", adType, festival);
          for (const p of [writer, repair]) {
            expect(p, `${pack.id}/${adType}/${language}`).toContain("THE WORD BUDGET — 17–20 SPOKEN WORDS IN EVERY CLIP");
            expect(p).toContain(pair ? "A clip's TWO lines TOGETHER make the 17–20" : "The one speaker's line IS the clip");
            expect(p).not.toContain(pair ? "The one speaker's line IS the clip" : "TWO lines TOGETHER");
            expect(p).not.toMatch(/15[–-]17 (?:spoken )?words|13[–-]15 (?:spoken )?words|between 7 and 9 words|(?:six to nine|eight to twelve|nine to thirteen|eight to thirteen) spoken words/);
          }
          const register = contractRegisterFor(pack);
          if (register === "children") expect(writer).toContain("a nine-year-old really says");
          if (register === "deity") expect(writer).toContain("A blessing is calm and unhurried");
          if (register === "cartoon") expect(writer).toContain("keep their own rhythm and personality");
          // Festival and commercial keep their own structure.
          if (adType === "festival") expect(writer).toContain("Clip 1 is the wish and nothing but the wish");
          else expect(writer).not.toContain("Clip 1 is the wish and nothing but the wish");
        }
      }
    });

    it(`${pack.id}: its worked example obeys the very budget it teaches`, () => {
      for (const adType of ["commercial", "festival"] as const) {
        const writer = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, adType, adType === "festival" ? "Diwali" : "", "Telugu", "Kakinada");
        const example = writer.slice(writer.indexOf("A WORKED EXAMPLE"), writer.indexOf("Notice:"));
        const lines = [...example.matchAll(/"([^"]+)"\s*\((\d+) words\)/g)];
        expect(lines.length, pack.id).toBe(4 * pack.characters.length);
        for (const [, text, claimed] of lines) expect(countSpokenWords(text), `${pack.id}: ${text}`).toBe(Number(claimed));
        const per = pack.characters.length;
        for (let i = 0; i < lines.length; i += per) {
          const total = lines.slice(i, i + per).reduce((s, l) => s + Number(l[2]), 0);
          expect(inWordBand(total), `${pack.id}/${adType} clip ${i / per + 1}: ${total}`).toBe(true);
        }
      }
    });
  }
});
