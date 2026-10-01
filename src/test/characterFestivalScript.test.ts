import { describe, it, expect } from "vitest";
import { CHARACTER_CATALOGUE } from "@/services/characterCatalogue";
import { getCharacterPack } from "@/services/characterPacks";
import {
  CHARACTER_VOICEOVER_SYSTEM_PROMPT,
  CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT,
} from "@/services/prompts/characterAd";
import {
  MIN_WORDS_PER_DUO_CLIP, MAX_WORDS_PER_DUO_CLIP, MIN_WORDS_PER_LINE, MAX_WORDS_PER_LINE, countSpokenWords,
} from "@/utils/dialogueFormat";

/**
 * Festival Wishes + a Special Category, which is a real thing members sell.
 *
 * The two choices are orthogonal by design — AdType is the TONE, the character pack is WHO is on
 * screen — but only the human-model path ever acted on the festival half. Choosing a cartoon duo or
 * a deity for a Diwali ad changed one tone sentence and left the commercial skeleton standing, so
 * clip 1 came back as a sales hook and the client never got the wishes they paid for.
 *
 * These assert the structural split the ad depends on: clip 1 is the wish and sells nothing, the ad
 * turns at clip 2, and nothing downstream of the generator can quietly put the hook back.
 */

// A named cartoon duo — a human duo's speakers are role labels and are never named (see below).
const DUO = getCharacterPack(CHARACTER_CATALOGUE.find((p) => p.family === "duo")!.id)!;
const HUMAN_DUO = getCharacterPack(CHARACTER_CATALOGUE.find((p) => p.family === "human_duo")!.id)!;
const SOLO = getCharacterPack(CHARACTER_CATALOGUE.find((p) => p.characters.length === 1)!.id)!;

const festival = (pack = DUO, clips = 4, name = "Diwali", place = "Bodhan") =>
  CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, clips * 8, clips, "festival", name, "Telugu", place);

const commercial = (pack = DUO, clips = 4, place = "Bodhan") =>
  CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, clips * 8, clips, "commercial", "", "Telugu", place);

/** Just the worked-example block, so quoted lines elsewhere in the prompt do not count. */
const example = () => {
  const p = festival();
  return p.slice(p.indexOf("A WORKED EXAMPLE"), p.indexOf("Notice:"));
};

describe("festival wishes in a special-category script", () => {
  it("makes clip 1 the wish instead of the hook", () => {
    const p = festival();
    expect(p).toContain("Clip 1 — THE WISHES (NOT A HOOK, NOT A SELL)");
    expect(p).not.toContain("Clip 1 — THE HOOK");
  });

  // The bug was not a missing greeting, it was a greeting sharing the clip with a sales line.
  it("forbids anything else in clip 1", () => {
    const p = festival();
    expect(p).toContain("Clip 1 CONTAINS NOTHING ELSE");
    expect(p).toMatch(/No product, no service, no offer, no price/);
    expect(p).toMatch(/One selling word in clip 1 and the ad has failed/);
  });

  it("names the business as the sender of the wish", () => {
    expect(festival()).toMatch(/ON BEHALF OF THE BUSINESS, naming the business as the one sending the/);
  });

  it("turns the ad into a promotion at clip 2 and drops the festival there", () => {
    const p = festival();
    expect(p).toContain("Clip 2 — THE TURN");
    expect(p).toMatch(/Diwali is finished and is\s*\n?never mentioned again in any later clip/);
  });

  it("keeps proof and close clips after the turn", () => {
    const p = festival(DUO, 5);
    expect(p).toContain("Clip 3 — PROOF");
    expect(p).toContain("Clip 4 — PROOF");
    expect(p).toContain("Clip 5 — CLOSE");
  });

  /**
   * The hook section bans greetings outright, and a wish IS a greeting. Left unbranched it is the
   * clearest instruction in the prompt telling the model not to write the clip we just asked for.
   */
  it("moves the ban on greetings off clip 1 and onto the turn", () => {
    const p = festival();
    expect(p).toContain("CLIP 1 IS THE WISH. THE HOOK IS CLIP 2'S JOB");
    expect(p).toContain("NEVER write clip 2 with any of these");
    expect(p).toMatch(/clip 1's Diwali wish is the sole exception/);
  });

  it("moves the town out of clip 1 and into the turn", () => {
    const p = festival();
    expect(p).toMatch(/spoken EXACTLY ONCE, in CLIP 2/);
    expect(p).toMatch(/NOT in clip 1\. Clip 1 is the Diwali wish and carries no town/);
    expect(p).toMatch(/does clip 2 contain the town's name\? If not, rewrite clip 2/);
  });

  it("shows a festival-shaped worked example, not a commercial one", () => {
    const p = festival();
    expect(p).toContain("clip-1 (the WISH — the business sends it, and nothing at all is sold)");
    expect(p).toContain("clip-2 (the TURN");
    expect(p).not.toContain("clip-1 (the hook");
  });

  /**
   * The example is the strongest instruction in the prompt — a model copies a shape far more
   * literally than it follows prose. An example whose lines break the word budget therefore
   * teaches the script straight into the repair loop, where the wish is what gets rewritten.
   */
  it("writes a festival example that obeys the word budget it teaches", () => {
    const lines = [...example().matchAll(/"([^"]+)"\s*\((\d+) words\)/g)];
    expect(lines).toHaveLength(8);

    for (const [, text, claimed] of lines) {
      expect(countSpokenWords(text), text).toBe(Number(claimed));
      expect(Number(claimed), text).toBeGreaterThanOrEqual(MIN_WORDS_PER_LINE);
      expect(Number(claimed), text).toBeLessThanOrEqual(MAX_WORDS_PER_LINE);
    }

    for (let i = 0; i < lines.length; i += 2) {
      const clipTotal = Number(lines[i][2]) + Number(lines[i + 1][2]);
      expect(clipTotal, `clip ${i / 2 + 1}`).toBeGreaterThanOrEqual(MIN_WORDS_PER_DUO_CLIP);
      expect(clipTotal, `clip ${i / 2 + 1}`).toBeLessThanOrEqual(MAX_WORDS_PER_DUO_CLIP);
    }
  });

  // "Friend" and "Host" are how the script tells two people apart — never words either one says.
  it("never has a human duo call each other by their role labels", () => {
    for (const p of [festival(HUMAN_DUO), commercial(HUMAN_DUO)]) {
      const ex = p.slice(p.indexOf("A WORKED EXAMPLE"), p.indexOf("Notice:"));
      const spoken = [...ex.matchAll(/"([^"]+)"/g)].map(m => m[1]).join(" ");
      for (const c of HUMAN_DUO.characters) expect(spoken).not.toContain(c.name);
      expect(p).toContain("NO NAMES FOR THE SPEAKERS");
    }
  });

  it("keeps both names in the wish clip and nowhere else", () => {
    const spoken = [...example().matchAll(/"([^"]+)"/g)].map(m => m[1]);
    const said = (name: string) => spoken.filter(l => l.includes(name)).length;
    expect(said(DUO.characters[0].name)).toBe(1);
    expect(said(DUO.characters[1].name)).toBe(1);
    expect(spoken[0]).toContain(DUO.characters[1].name);
    expect(spoken[1]).toContain(DUO.characters[0].name);
  });

  // The catalogue writes each character's job around a commercial clip 1 — "she hooks the viewer
  // and names the business and its town". Left standing it is a direct contradiction of the wish.
  it("overrides the character's own clip-1 direction", () => {
    const p = festival();
    expect(p).toContain("THIS OVERRIDES THE PERFORMANCE DIRECTION ABOVE");
    expect(p).toMatch(/where they say clip 1 hooks the viewer/);
    expect(p).toMatch(/that is now clip 2/);
  });

  it("exempts clip 1 from the every-clip-must-sell rule", () => {
    expect(festival()).toMatch(/Clip 1 is exempt from rule 4 and from it alone/);
  });

  it("ends with a clip-1 self-check", () => {
    const p = festival();
    expect(p).toContain("CHECK CLIP 1 BEFORE YOU OUTPUT");
    expect(p).toMatch(/Is it free of any call to action/);
    expect(p).toMatch(/Is it free of the town "Bodhan"/);
  });

  // The catalogue is mostly single-speaker entries, where "greet your partner by name" has no
  // correct output at all.
  it("writes the wish for one speaker without inventing a second", () => {
    const p = festival(SOLO);
    const [only] = SOLO.characters;
    expect(p).toContain(`${only.name} wishes the viewer and their family a`);
    expect(p).not.toContain(`${only.name} greets ${only.name} BY NAME`);
  });

  it("keeps the two-clip ad legible: wish, then everything else", () => {
    const p = festival(DUO, 2);
    expect(p).toContain("Clip 1 — THE WISHES");
    expect(p).toContain("Clip 2 — THE TURN AND THE CLOSE");
    expect(p).not.toContain("Clip 2 — THE TURN (this is where");
  });

  /**
   * A custom duration of eight seconds is one clip. There is no clip 2 to move the hook or the
   * town into, so every instruction that points at one would have no correct output.
   */
  it("still wishes when the single clip is the whole ad", () => {
    const p = festival(DUO, 1);
    expect(p).toContain("Clip 1 — THE WISHES");
    expect(p).toMatch(/There is only this one clip/);
    expect(p).toMatch(/This ad is one clip long/);
  });

  it("never points a one-clip ad at a turn it does not have", () => {
    const p = festival(DUO, 1);
    for (const pointer of [
      "THE HOOK IS CLIP 2",
      "in CLIP 2",
      "The town belongs in clip 2",
      "Does the ad then TURN at clip 2",
      "From clip 2 the ad becomes",
      "From clip 2 the tone becomes",
      "applies from clip 2 onward",
      "that is now clip 2",
    ]) expect(p, pointer).not.toContain(pointer);

    // And the repair pass must not reintroduce one either.
    const r = CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(DUO, 8, 1, "Telugu", "Bodhan", "festival", "Diwali");
    expect(r).not.toContain("clip 2");
    expect(r).toMatch(/This ad is one clip long/);
  });

  /**
   * `festivalName` reaches here empty whenever a member picked the ad type but not the occasion.
   * The instructions can say "the festival"; a quoted spoken line cannot.
   */
  it("reads as a sentence when no festival was named", () => {
    const p = festival(DUO, 4, "");
    expect(p).toContain("Clip 1 — THE WISHES");
    expect(p).not.toContain("a very happy the festival");
    expect(p).toContain("happy festival ON BEHALF OF THE BUSINESS");
  });
});

describe("commercial scripts are untouched by the festival branch", () => {
  it("keeps the hook in clip 1", () => {
    const p = commercial();
    expect(p).toContain("Clip 1 — THE HOOK");
    expect(p).not.toContain("THE WISHES");
    expect(p).not.toContain("CHECK CLIP 1 BEFORE YOU OUTPUT");
  });

  it("keeps the town in clip 1", () => {
    const p = commercial();
    expect(p).toMatch(/spoken EXACTLY ONCE, in CLIP 1/);
    expect(p).toMatch(/does clip 1 contain the town's name/);
  });
});

/**
 * The repair pass runs whenever validation finds a fault — a word count, a missing name. It restates
 * the structure, so an unbranched copy of "clip 1 must be a hook" is enough to delete a correct
 * wish on the way past.
 */
describe("the repair pass preserves the wish", () => {
  const repair = (name = "Diwali", place = "బోధన్") =>
    CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(DUO, 32, 4, "Telugu", place, "festival", name);

  it("demands clip 1 still be the wish", () => {
    const p = repair();
    expect(p).toMatch(/Clip 1 must still be the Diwali WISH — the business wishing the viewer/);
    expect(p).toMatch(/keep every product, service, offer, price, reason to buy and call to action out of it/);
    expect(p).not.toMatch(/Clip 1's first line must still be a hook/);
  });

  it("demands the turn at clip 2", () => {
    expect(repair()).toMatch(/Clip 2 must still be the TURN/);
  });

  it("keeps the festival out of later clips", () => {
    expect(repair()).toMatch(/Diwali is spoken ONLY in clip 1/);
  });

  it("repairs the town into clip 2, not clip 1", () => {
    expect(repair()).toMatch(/spoken exactly ONCE, in clip 2/);
  });

  it("leaves the commercial repair contract exactly as it was", () => {
    const p = CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(DUO, 32, 4, "Telugu", "బోధన్");
    expect(p).toMatch(/Clip 1's first line must still be a hook that provokes/);
    expect(p).toMatch(/spoken exactly ONCE, in clip 1/);
    expect(p).not.toContain("WISH");
  });
});
