import { describe, it, expect } from "vitest";
import { bareWord, cueForWords, cueLabel, findPhrase, spokenWords, timecode, wordTimings } from "@/utils/wordTiming";

/**
 * An overlay used to arrive with a clip number and nothing finer, so an editor with a four-word
 * overlay and an eight-second clip found the moment by ear. These pin the estimate the cues are built
 * on: every word gets a slot, a phrase can be found in the line, and anything unmatched falls back to
 * the whole clip rather than inventing a precise-looking wrong time.
 */

const line = "మా దగ్గర ఒరిజినల్ స్పేర్ పార్ట్స్ మాత్రమే వాడతాం.";

describe("spreading a clip's seconds across its words", () => {
  it("gives every spoken word a slot, in order, inside the clip", () => {
    const timings = wordTimings(line, 8, 16);
    expect(timings.map((t) => t.word)).toEqual(spokenWords(line));
    expect(timings[0].start).toBe(8);
    expect(timings[timings.length - 1].end).toBe(16);
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i].start).toBeGreaterThanOrEqual(timings[i - 1].start);
      expect(timings[i].end).toBeGreaterThan(timings[i].start);
    }
  });

  it("gives a longer word more time than a short one", () => {
    const [short, long] = wordTimings("మా ఒరిజినల్", 0, 8);
    expect(long.end - long.start).toBeGreaterThan(short.end - short.start);
  });

  it("ignores the speaker labels of a two-character clip", () => {
    expect(spokenWords("[Motu]:  ఎంత బాగున్నాయి! [Patlu]: ఇది లక్ష్మీ.")).toEqual(
      ["ఎంత", "బాగున్నాయి!", "ఇది", "లక్ష్మీ."],
    );
  });

  it("has nothing to time in an empty clip", () => {
    expect(wordTimings("", 0, 8)).toEqual([]);
    expect(wordTimings(line, 8, 8)).toEqual([]);
  });
});

describe("finding the words a cue is anchored to", () => {
  const words = spokenWords(line);

  it("finds a single word and a phrase", () => {
    expect(findPhrase(words, "ఒరిజినల్")).toEqual({ from: 2, to: 2 });
    expect(findPhrase(words, "ఒరిజినల్ స్పేర్ పార్ట్స్")).toEqual({ from: 2, to: 4 });
  });

  it("ignores punctuation the model copied along with the word", () => {
    expect(findPhrase(words, "వాడతాం.")).toEqual({ from: 6, to: 6 });
    expect(bareWord("₹499,")).toBe("499");
  });

  it("falls back to any word of a phrase it half-recognises", () => {
    expect(findPhrase(words, "ఒరిజినల్ జెన్యూన్")).toEqual({ from: 2, to: 2 });
    expect(findPhrase(words, "completely different")).toBeNull();
  });
});

describe("the cue an editor reads", () => {
  it("starts on the word it was asked for and ends on the last one", () => {
    const cue = cueForWords(line, "ఒరిజినల్", "పార్ట్స్", 8, 16);
    expect(cue.matched).toBe(true);
    expect(cue.fromWord).toBe("ఒరిజినల్");
    expect(cue.toWord).toBe("పార్ట్స్");
    expect(cue.start).toBeGreaterThan(8);
    expect(cue.end).toBeLessThanOrEqual(16);
    expect(cue.end).toBeGreaterThan(cue.start);
  });

  it("holds a one-word cue long enough to read, without running past the clip", () => {
    const cue = cueForWords(line, "మా", "మా", 8, 16);
    // Tenths of a second in binary: 9.4 - 8.2 is 1.1999…, so compare with a hair of tolerance.
    expect(cue.end - cue.start).toBeGreaterThan(1.15);
    expect(cue.end).toBeLessThanOrEqual(16);
    const last = cueForWords(line, "వాడతాం", "వాడతాం", 8, 16);
    expect(last.end).toBeLessThanOrEqual(16);
  });

  it("uses the whole clip when the words are not in the line, and says so", () => {
    const cue = cueForWords(line, "something else", "", 8, 16);
    expect(cue).toMatchObject({ start: 8, end: 16, matched: false });
    expect(cueLabel(cue)).toBe("0:08.0 → 0:16.0 · across the whole clip");
  });

  it("reads as a timeline instruction with the words to listen for", () => {
    const cue = cueForWords(line, "ఒరిజినల్", "పార్ట్స్", 8, 16);
    expect(cueLabel(cue)).toMatch(/^0:\d\d\.\d → 0:\d\d\.\d · from “ఒరిజినల్” to “పార్ట్స్”$/);
  });

  it("writes minutes and seconds the way a timeline does", () => {
    expect(timecode(0)).toBe("0:00.0");
    expect(timecode(9.24)).toBe("0:09.2");
    expect(timecode(64.5)).toBe("1:04.5");
  });
});

/**
 * A word at the very end of a clip — the closing "call now" — had nowhere to extend into, so the
 * overlay came and went in seven tenths of a second. It comes up earlier instead.
 */
describe("a cue on the last word of a clip", () => {
  const closing = "మరిన్ని వివరాల కోసం స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి.";

  it("is brought up earlier rather than flashing at the end", () => {
    const cue = cueForWords(closing, "చేయండి", "చేయండి", 24, 32);
    expect(cue.end).toBeLessThanOrEqual(32);
    expect(cue.end - cue.start).toBeGreaterThan(1.15);
    expect(cue.start).toBeGreaterThanOrEqual(24);
  });

  it("never starts before its clip", () => {
    const cue = cueForWords("ఒకటి", "ఒకటి", "ఒకటి", 24, 24.5);
    expect(cue.start).toBeGreaterThanOrEqual(24);
    expect(cue.end).toBeLessThanOrEqual(24.5);
  });
});
