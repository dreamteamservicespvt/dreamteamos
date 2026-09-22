import { describe, it, expect } from "vitest";
import { sameWords, scriptWords, splitScriptVerbatim, verbatimScriptText } from "@/utils/customScript";
import { isClipHeaderLine, parseLabeledClips } from "@/utils/voiceOverFormat";

/**
 * A member's pasted script is the business's own words and ships word for word. Three things used to
 * change it: the model-output cleaner deleting "& @ #", a model "split" that was allowed to rewrite, and
 * clip headers the parser did not recognise (which made a labelled script look unlabelled). These pin
 * all three shut.
 */

describe("the gentle cleaner", () => {
  it("keeps every letter, number and ordinary symbol the member typed", () => {
    const line = "Sri Lakshmi Silks & Sarees — 20% off @ Main Road #1, ₹999 only!";
    expect(verbatimScriptText(line)).toBe(line);
  });

  it("removes only what can never be spoken: emoji, decorations and chat bold markers", () => {
    expect(verbatimScriptText("🎉 **Grand Opening** ★ today ✨")).toBe("Grand Opening today");
    expect(verbatimScriptText("మా  షాప్‌కి   రండి")).toBe("మా షాప్‌కి రండి");
  });
});

describe("comparing two versions of a script", () => {
  it("ignores punctuation, case and spacing — and nothing else", () => {
    expect(scriptWords("Hello, World!  Come in.")).toEqual(["hello", "world", "come", "in"]);
    expect(sameWords("Come to us today.", "come to us   today")).toBe(true);
    expect(sameWords("Come to us today.", "Visit us today.")).toBe(false);
    expect(sameWords("Come to us today.", "Come to us today now.")).toBe(false);
  });
});

describe("splitting unlabelled text at sentence ends", () => {
  const text = "First sentence is here. Second one follows now! Third sentence arrives? Fourth and last one.";

  it("never changes, adds or drops a word", () => {
    for (const count of [1, 2, 3, 4]) {
      const clips = splitScriptVerbatim(text, count);
      expect(clips).toHaveLength(count);
      expect(sameWords(text, clips.join(" "))).toBe(true);
    }
  });

  it("cuts at sentence boundaries, as evenly as the sentences allow", () => {
    expect(splitScriptVerbatim(text, 2)).toEqual([
      "First sentence is here. Second one follows now!",
      "Third sentence arrives? Fourth and last one.",
    ]);
  });

  it("breaks a sentence only when there are fewer sentences than clips — at a comma first", () => {
    const clips = splitScriptVerbatim("We open early, we close late, and we never rush you.", 2);
    expect(clips).toHaveLength(2);
    expect(clips[0].endsWith(",")).toBe(true);
    expect(sameWords("We open early, we close late, and we never rush you.", clips.join(" "))).toBe(true);
  });

  it("reads Telugu sentence ends too", () => {
    const telugu = "మా షాప్ లో అన్ని బ్రాండ్లు ఉన్నాయి. ఫ్రీ డెలివరీ కూడా ఇస్తాం.";
    expect(splitScriptVerbatim(telugu, 2)).toEqual(["మా షాప్ లో అన్ని బ్రాండ్లు ఉన్నాయి.", "ఫ్రీ డెలివరీ కూడా ఇస్తాం."]);
  });
});

/**
 * Every header shape a member realistically pastes. A header that was missed made the whole script
 * look unlabelled, and unlabelled text was where the words got changed.
 */
describe("clip headers the parser recognises", () => {
  const shapes: [string, string][] = [
    ["clip-1[0-8sec]: Namaste.", "Namaste."],
    ["Clip 1 [0-8 sec]: Namaste.", "Namaste."],
    ["clip1: Namaste.", "Namaste."],
    ["CLIP-1 (0-8 sec) - Namaste.", "Namaste."],
    ["**clip-1[0-8sec]:** Namaste.", "Namaste."],
    ["clip-1[0-8sec] Namaste.", "Namaste."],
    ["Clip 1 – 0-8 sec: Namaste.", "Namaste."],
    ["- Clip 1: Namaste.", "Namaste."],
    ["Scene 1: Namaste.", "Namaste."],
    ["0-8: Namaste.", "Namaste."],
    ["0–8 sec: Namaste.", "Namaste."],
    ["[0-8sec]: Namaste.", "Namaste."],
    ["clip-1[0-8sec]： Namaste.", "Namaste."],
    ["Segment 1: Namaste.", "Namaste."],
  ];

  for (const [line, text] of shapes) {
    it(`reads "${line}"`, () => {
      expect(isClipHeaderLine(line)).toBe(true);
      expect(parseLabeledClips(`${line}\nclip-2[8-16sec]: Two.`)).toEqual([text, "Two."]);
    });
  }

  it("never mistakes prose for a header", () => {
    expect(isClipHeaderLine("Clip 1 is the best part of the ad")).toBe(false);
    expect(isClipHeaderLine("98480-12345: call us now")).toBe(false);
    expect(isClipHeaderLine("We are open 9 to 5 every day.")).toBe(false);
    expect(parseLabeledClips("Just a paragraph about the shop.\nAnother line.")).toEqual([]);
  });

  it("keeps a member's clip text exactly, symbols included", () => {
    const script = "clip-1[0-8sec]: Sri Lakshmi Silks & Sarees @ Main Road!\nclip-2[8-16sec]: #1 in town — 20% off.";
    expect(parseLabeledClips(script).map(verbatimScriptText)).toEqual([
      "Sri Lakshmi Silks & Sarees @ Main Road!",
      "#1 in town — 20% off.",
    ]);
  });
});
