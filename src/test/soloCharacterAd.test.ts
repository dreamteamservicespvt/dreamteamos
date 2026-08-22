import { describe, it, expect } from "vitest";
import { CHARACTER_CATALOGUE } from "@/services/characterCatalogue";
import { getCharacterPack } from "@/services/characterPacks";
import {
  CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT,
  CHARACTER_VOICEOVER_SYSTEM_PROMPT,
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT,
} from "@/services/prompts/characterAd";
import {
  MAX_WORDS_PER_CLIP, MAX_WORDS_PER_LINE, MIN_WORDS_PER_CLIP, MIN_WORDS_PER_LINE, wordBudgetFor,
} from "@/utils/dialogueFormat";

/**
 * A one-speaker ad, end to end.
 *
 * Twenty-three of the thirty-two catalogue entries have a single speaker. The whole prompt stack
 * was written for a two-hander, and each place that assumed a partner produced a different failure:
 * a crash, an impossible word budget, or an instruction with no correct output — "X says, then X
 * replies", "X addresses X by name". None of those are caught by a compiler and all of them reach
 * a paying client as a bad video.
 */

const SOLO = CHARACTER_CATALOGUE.filter((p) => p.characters.length === 1);
const DUO = CHARACTER_CATALOGUE.filter((p) => p.characters.length === 2);

const script = (id: string) =>
  CHARACTER_VOICEOVER_SYSTEM_PROMPT(getCharacterPack(id)!, 32, 4, "commercial", "", "Telugu", "Bodhan");

describe("the word budget", () => {
  it("splits a clip between two speakers", () => {
    expect(wordBudgetFor(2)).toEqual({
      minClip: MIN_WORDS_PER_CLIP, maxClip: MAX_WORDS_PER_CLIP,
      minLine: MIN_WORDS_PER_LINE, maxLine: MAX_WORDS_PER_LINE,
    });
  });

  it("gives the whole clip to a lone speaker", () => {
    // The clip band is a TIMING rule — 8 seconds is 18-20 words whoever says them. The line band
    // only ever existed to split that in two. Applying both to one line is unsatisfiable, which is
    // what made every clip of every solo ad fail validation and fall into the repair loop.
    const solo = wordBudgetFor(1);
    expect(solo.minLine).toBe(MIN_WORDS_PER_CLIP);
    expect(solo.maxLine).toBe(MAX_WORDS_PER_CLIP);
  });

  it("is always satisfiable", () => {
    for (const n of [1, 2]) {
      const b = wordBudgetFor(n);
      // One line per speaker, so n lines must be able to reach the clip minimum and stay under its max.
      expect(b.maxLine * n, `max for ${n}`).toBeGreaterThanOrEqual(b.minClip);
      expect(b.minLine * n, `min for ${n}`).toBeLessThanOrEqual(b.maxClip);
    }
  });
});

describe("a solo script prompt", () => {
  it("never tells the character to address or answer themselves", () => {
    for (const pack of SOLO) {
      const name = pack.characters[0].name;
      const out = script(pack.id);
      expect(out, pack.id).not.toContain(`${name} answers with "${name}"`);
      expect(out, pack.id).not.toContain(`addresses ${name} BY NAME`);
      expect(out, pack.id).not.toContain(`Then ${name} replies`);
    }
  });

  it("asks for one line a clip, not two", () => {
    for (const pack of SOLO) {
      const out = script(pack.id);
      expect(out, pack.id).not.toContain("EXACTLY 2 lines");
      expect(out, pack.id).toContain("EXACTLY 1 line");
    }
  });

  it("shows a one-speaker worked example", () => {
    // The example is labelled "COPY THE SHAPE", so a two-speaker example IS the instruction.
    for (const pack of SOLO.slice(0, 5)) {
      const out = script(pack.id);
      const example = out.slice(out.indexOf("A WORKED EXAMPLE"));
      const name = pack.characters[0].name;
      // Every example line belongs to the one character.
      const speakerLines = example.split("\n").filter((l) => /^\s{2}\S.*:\s*"/.test(l));
      expect(speakerLines.length, pack.id).toBeGreaterThan(0);
      for (const line of speakerLines) expect(line, `${pack.id}: ${line}`).toContain(name);
    }
  });

  it("quotes the solo budget, so the example and the rule agree", () => {
    const out = script(SOLO[0].id);
    expect(out).toContain(`${MIN_WORDS_PER_CLIP} and ${MAX_WORDS_PER_CLIP}`);
    // …and never the two-speaker line band, which a single line cannot meet.
    expect(out).not.toContain(`between ${MIN_WORDS_PER_LINE} and ${MAX_WORDS_PER_LINE} words`);
  });

  it("carries the same rules into the repair prompt", () => {
    // Repair is where a failed script lands; re-imposing the impossible pair there is what made
    // the loop unable to ever succeed.
    for (const pack of SOLO.slice(0, 5)) {
      const out = CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(pack, 32, 4, "Telugu", "Bodhan");
      expect(out, pack.id).toContain(`${MIN_WORDS_PER_CLIP}-${MAX_WORDS_PER_CLIP} spoken words per clip`);
      expect(out, pack.id).not.toContain(`each line ${MIN_WORDS_PER_LINE}-${MAX_WORDS_PER_LINE} words`);
    }
  });
});

describe("a duo script prompt is unchanged", () => {
  it("still asks for two lines and the two-speaker budget", () => {
    const out = script("duo_motu_patlu");
    expect(out).toContain("EXACTLY 2 lines");
    expect(out).toContain(`between ${MIN_WORDS_PER_LINE} and ${MAX_WORDS_PER_LINE} words`);
    expect(out).toContain("THE TWO CHARACTERS");
  });

  it("still runs the two-hander beat and example", () => {
    const out = script("duo_motu_patlu");
    expect(out).toContain("addresses Patlu BY NAME");
    expect(out).toContain("Patlu:");
  });
});

describe("the frame prompt names the real cast", () => {
  const frame = (id: string) => CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack(id)!, {
    segmentCount: 4,
    clipSummaries: ["a", "b", "c", "d"],
    locationMode: "ai_generated",
    locationPlan: "",
    aspectRatio: "9:16",
    adType: "commercial",
    festivalName: "",
    businessContext: "{}",
  });

  it("never hard-codes Motu and Patlu into another entry's continuation line", () => {
    // It used to, for all 32 — so every clip after the first told the generator to draw the wrong
    // characters, in an ad that is not about them.
    for (const pack of [...SOLO, ...DUO].filter((p) => p.id !== "duo_motu_patlu")) {
      expect(frame(pack.id), pack.id).not.toContain("the same Motu and Patlu");
    }
  });

  it("refers back to this entry's own cast", () => {
    expect(frame("god_shiva")).toContain("the same Shiva exactly as in the attached reference");
    expect(frame("duo_motu_patlu")).toContain("the same Motu and Patlu exactly as in the attached reference");
  });
});

/**
 * Nothing in the catalogue may name its own word count.
 *
 * ── The generation this exists because of ───────────────────────────────────────────
 * A Presenter ad came back with ten words a clip against a budget of eighteen to twenty. The
 * budget was right and the prompt stated it plainly — but the entry’s own scriptStyle said
 * “Everyday spoken sentences, six to fourteen words”, and a model handed two numbers obeys the
 * more specific one. The clip band is a TIMING rule owned by wordBudgetFor and injected once; an
 * entry that restates it in smaller numbers silently overrides it for that character alone, which
 * is the hardest kind of wrong to notice because every other character stays correct.
 *
 * A PACE is fine and stays allowed — “two words per second” describes delivery, not length.
 */
describe("the catalogue never sets its own word count", () => {
  const RANGE = new RegExp(String.raw`\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d{1,2})[\s-]*(?:to|and|-|\u2013)[\s-]*(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d{1,2})\s+words?\b`, "gi");
  const CAP = new RegExp(String.raw`\b(?:under|below|max(?:imum)?|at most|no more than)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d{1,2})\s+words?\b`, "gi");

  it("states no clip or line length of its own", () => {
    const offences: string[] = [];
    for (const pack of CHARACTER_CATALOGUE) {
      const fields: Record<string, unknown> = pack as unknown as Record<string, unknown>;
      for (const key of Object.keys(fields)) {
        const value = fields[key];
        if (typeof value !== "string") continue;
        for (const re of [RANGE, CAP]) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(value))) {
            // “about four words per second” is a pace, not a length — allowed.
            const after = value.slice(m.index + m[0].length, m.index + m[0].length + 12);
            if (/^s*(per|a)s+second/i.test(after)) continue;
            offences.push(`${pack.id}.${key}: "${m[0]}"`);
          }
        }
      }
    }
    expect(offences, offences.join(" | ")).toEqual([]);
  });

  it("lets the prompt be the only place a clip length is stated", () => {
    const out = script("normal_female");
    expect(out).toContain(`${MIN_WORDS_PER_CLIP} and ${MAX_WORDS_PER_CLIP}`);
    expect(out).not.toContain("six to fourteen words");
  });
});

/**
 * The image prompt must never order a character nobody sold.
 *
 * ── The two generations this exists because of ────────────────────────────────────────────────
 * A Real Owner Face ad came back with the client's real photographed face standing beside an
 * invented cartoon man. A Ganesha ad was told to frame "a second, unstated character". Both had the
 * same cause: this prompt was written for a two-hander and its lines are INSTRUCTIONS — "each
 * showing BOTH characters together", "stage the two characters", "the classic two-hander". On a
 * single-character entry the generator does as it is told, and no amount of hard negatives further
 * down can undo a positive instruction to include somebody.
 */
describe("the image prompt stages only who was sold", () => {
  const frame = (id: string, locationMode: "real_provided" | "ai_generated" = "real_provided") =>
    CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack(id)!, {
      segmentCount: 2,
      clipSummaries: ["a", "b"],
      locationMode,
      locationPlan: "",
      aspectRatio: "9:16",
      adType: "commercial",
      festivalName: "",
      businessContext: "{}",
    });

  it("never asks for a second figure in a one-character ad", () => {
    const banned = ["BOTH characters", "the two characters", "two-hander", "both characters"];
    for (const pack of SOLO) {
      const out = frame(pack.id);
      for (const phrase of banned) {
        expect(out, `${pack.id} still says "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it("says out loud that nobody else appears", () => {
    // A negative is not enough on its own, but paired with removing the positive it is what stops
    // the generator inventing a companion to fill the frame.
    for (const pack of SOLO.slice(0, 6)) {
      expect(frame(pack.id), pack.id).toContain("is the ONLY character in the frame");
    }
  });

  it("still stages a duo as a two-hander", () => {
    const out = frame("duo_motu_patlu");
    expect(out).toContain("BOTH characters visible in every frame");
    expect(out).toContain("two-hander");
  });
});

/**
 * A deity fronting an ad is PRESENTING a business.
 *
 * A seated murti reads as a statue parked in the corner of a clinic — which is what came back — and
 * the festive dressing was gated on "only for frames that must be generated", so a job with the
 * client's own shop photos got a plain room with a god standing in it and no occasion at all. The
 * client is buying an auspicious frame; the decoration is the product.
 */
describe("god ads", () => {
  const GODS = CHARACTER_CATALOGUE.filter((p) => p.family === "god");

  it("covers every deity offered", () => {
    expect(GODS.length).toBe(6);
  });

  it("stands the deity rather than seating them", () => {
    for (const god of GODS) {
      const posture = [god.bodyLanguage, god.styleDirective, god.cameraDirection].join(" ");
      // "Never seated" is the instruction, so only a POSITIVE seating clause is a failure.
      const positives = posture.match(/\b(sits|seated|sitting)\b/gi) || [];
      const negatives = posture.match(/never\s+(sits|seated|sitting)\b/gi) || [];
      expect(positives.length, `${god.id}: ${posture.slice(0, 120)}`).toBe(negatives.length);
      expect(posture.toLowerCase(), god.id).toContain("standing");
    }
  });

  it("dresses the scene whether or not the client sent photos", () => {
    for (const god of GODS) {
      expect(god.backgroundDirection, god.id).toContain("FESTIVE DRESSING IS NEVER OPTIONAL");
      expect(god.backgroundDirection, god.id).toMatch(/torana|rangoli|kolam|garland/i);
    }
  });

  it("keeps the decoration on top of the real premises, never replacing them", () => {
    for (const god of GODS) {
      expect(god.backgroundDirection, god.id).toMatch(/never replace|onto that real space/i);
    }
  });
});
