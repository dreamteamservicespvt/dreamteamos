import { describe, it, expect } from "vitest";
import { clipFitDistance, contractDistance, clipWordCountIssue, clipSyllableIssue, spokenSyllables } from "@/utils/scriptContract";
import { isBetterRepair, numberedWords, parseClipDialogueEdits, parseClipTextEdits, repairDirection } from "@/utils/voiceOverRefine";
import { VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT } from "@/services/prompts/refine";

/**
 * The owner's screenshots of 2026-10-30, three Telugu runs that stopped on the final gate:
 *   "Clip 1 must contain 17–20 spoken words across both lines together, but it has 16. Clip 1 is too long to say in
 *    8 seconds: 52 syllables across both lines together, at most 51 fit."
 * The repairs were ranked by WORDS only, and told "add a detail" and "use shorter words" as two directions — so an
 * edit that fixed the words broke the syllables and was kept, and the next one swung back.
 */

// 17 short words — a clip that passes both halves.
const SHORT = Array.from({ length: 17 }, () => "మా").join(" ");
// 17 words of five syllables each (85) — far over a pair's ceiling of 51.
const LONG = Array.from({ length: 17 }, () => "రకరకాల").join(" ");
// 16 words of three syllables (48).
const SHORT_BY_ONE = Array.from({ length: 16 }, () => "తక్కువ").join(" ");

describe("which repair is nearer — words AND syllables (Telugu)", () => {
  it("counts syllables over the ceiling, about three to a word", () => {
    expect(spokenSyllables(LONG)).toBe(85);
    expect(clipFitDistance(SHORT, true, "Telugu")).toBe(0);
    expect(clipFitDistance(SHORT_BY_ONE, true, "Telugu")).toBe(1);
    // 85 − 51 = 34 syllables over → 12 "words" away, though its word count is inside 17–20.
    expect(clipFitDistance(LONG, true, "Telugu")).toBe(12);
    // English is held to words only.
    expect(clipFitDistance(LONG, true, "English")).toBe(0);
    expect(contractDistance([SHORT, SHORT_BY_ONE, LONG], true, "Telugu")).toBe(13);
  });

  it("an edit that reaches 17 words by breaking the syllable ceiling is never kept over one a word short", () => {
    const before = { issues: ["x"], distance: contractDistance([SHORT_BY_ONE], true, "Telugu") };
    const after = { issues: [], distance: contractDistance([LONG], true, "Telugu") };
    expect(isBetterRepair(before, after)).toBe(false);
  });
});

describe("the direction for a clip short on words AND long on syllables", () => {
  const issues = [clipWordCountIssue(1, 16, true)!, clipSyllableIssue(1, 52, true, 47)!];

  it("is one direction — more, shorter words — never 'add a detail'", () => {
    const d = repairDirection(issues);
    expect(d).toMatch(/MORE, SHORTER everyday words/);
    expect(d).toMatch(/at least 17 words \(1 more\) and at most 47 syllables \(5 fewer\)/);
    expect(d).not.toMatch(/one more real, specific detail/);
    expect(d).not.toMatch(/too long to say in 8 seconds/);
  });

  it("a short clip with no syllables to spare is told the same", () => {
    const d = repairDirection([clipWordCountIssue(2, 15, true)!], 17, 20, { syllables: 46, max: 47 });
    expect(d).toMatch(/MORE, SHORTER everyday words/);
  });

  it("a short clip with room is told how many syllables the new words may carry", () => {
    const d = repairDirection([clipWordCountIssue(2, 16)!], 17, 20, { syllables: 36, max: 50 });
    expect(d).toMatch(/ADD at least 1 word/);
    expect(d).toMatch(/may carry 14 syllables together — short words only/);
  });

  it("without syllables (another language) the old direction is unchanged", () => {
    expect(repairDirection([clipWordCountIssue(2, 16)!])).toMatch(/ADD at least 1 word .*one more real, specific detail/);
    expect(repairDirection([clipWordCountIssue(3, 22)!])).toMatch(/REMOVE at least 2 words/);
  });

  it("the numbered words show the syllables and mark the long ones", () => {
    expect(numberedWords(["మా", "దొరుకుతాయి"], { syllables: true })).toBe("2 words, 6 syllables: 1·మా 2·దొరుకుతాయి(5)");
    expect(numberedWords(["మా", "దొరుకుతాయి"])).toBe("2 words: 1·మా 2·దొరుకుతాయి");
  });
});

/**
 * The second live finding of 2026-10-30: with the syllables fixed, both live runs (a 6-clip ad, a duo) still stopped
 * on the gate at 16 words. Told to ADD words, the editor wrote a free sentence of 14–16 Telugu words pass after pass.
 * Live A/B on that script: as a sentence 4 of 16 clips landed in 17–20, as a list of words 14 of 16. The editor now
 * answers in word lists; an answer written the old way is still read.
 */
describe("the editor answers in word lists", () => {
  it("asks for a list of words, one voice and a pair", () => {
    const one = VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({ language: "Telugu", clipCount: 6, adType: "commercial" });
    expect(one).toContain(`"words": ["<word 1>"`);
    expect(one).toContain("18 or 19 items (17–20 allowed)");
    // …reached with words that say something, never padding (live 2026-10-30: the list format first padded).
    expect(one).toContain("Never a word the clip already says");
    expect(one).not.toContain(`"text": "<the edited spoken line>"`);
    const pair = VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({
      language: "Telugu", clipCount: 4, adType: "commercial",
      speakers: [{ key: "girl", name: "Girl" }, { key: "boy", name: "Boy" }],
    });
    expect(pair).toContain(`{ "speaker": "girl", "words": ["<Girl's word 1>"`);
    expect(pair).toContain("the lines of one clip together 18 or 19 items (17–20 allowed), each line at most 12");
  });

  it("joins a clip's words in order, and still reads the old text answer", () => {
    const reply = JSON.stringify({ clips: [
      { clip: 2, words: ["మీకు", " కావాల్సిన ", "flatsలో", "", "ఉన్నాయి."] },
      { clip: 3, text: "పాత జవాబు ఇది." },
      { clip: 9, words: ["ఇది", "వద్దు"] },
    ] });
    const edits = parseClipTextEdits("```json\n" + reply + "\n```", [1, 2]);
    expect(edits.get(1)).toBe("మీకు కావాల్సిన flatsలో ఉన్నాయి.");
    expect(edits.get(2)).toBe("పాత జవాబు ఇది.");
    expect(edits.has(8)).toBe(false);
    // An empty list falls back to text, and to nothing when there is none.
    expect(parseClipTextEdits(JSON.stringify({ clips: [{ clip: 1, words: [] }] }), [0]).size).toBe(0);
  });

  it("joins each speaker's words in a pair's clip", () => {
    const reply = JSON.stringify({ clips: [{ clip: 1, lines: [
      { speaker: "girl", words: ["మా", "షాప్‌కి", "రండి,"] },
      { speaker: "boy", text: "ధరలు తక్కువ." },
    ] }] });
    expect(parseClipDialogueEdits(reply, [0]).get(0)).toEqual([
      { speaker: "girl", text: "మా షాప్‌కి రండి," },
      { speaker: "boy", text: "ధరలు తక్కువ." },
    ]);
  });
});
