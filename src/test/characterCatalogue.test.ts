import { describe, it, expect } from "vitest";
import { CHARACTER_CATALOGUE } from "@/services/characterCatalogue";
import {
  CHARACTER_FAMILY_ORDER, CHARACTER_PACKS, characterPackGroups, characterPackOptions,
  getCharacterPack, packHighlight, packNameSpellings, packSpeakerAliases, packSpeakers,
} from "@/services/characterPacks";
import {
  CHARACTER_VOICEOVER_SYSTEM_PROMPT, characterCastBlock, characterDirectionBlock,
} from "@/services/prompts/characterAd";

/**
 * The video-requirement catalogue.
 *
 * One sales-member choice has to produce a complete, character-specific production package. What
 * makes that work is not the list of names — it is that each entry carries its own direction, and
 * that the prompt builders read the CAST rather than assuming the two-hander the first pack
 * happened to be. These pin both, plus the compatibility promise to orders already in flight.
 */

describe("the catalogue", () => {
  it("offers every family the sales team sells", () => {
    const families = new Set(CHARACTER_CATALOGUE.map((p) => p.family));
    expect([...families].sort()).toEqual(["custom", "duo", "god", "human", "solo"]);
  });

  it("has no duplicate ids", () => {
    const ids = CHARACTER_CATALOGUE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry an identity anchor, direction and its own negatives", () => {
    for (const p of CHARACTER_CATALOGUE) {
      expect(p.franchise, p.id).toBeTruthy();
      expect(p.styleDirective, p.id).toBeTruthy();
      expect(p.dialogueRhythm, p.id).toBeTruthy();
      expect(p.negatives.length, p.id).toBeGreaterThan(0);
      expect(p.characters.length, p.id).toBeGreaterThan(0);
      // The fields that make one option behave differently from another.
      const direction = [
        "voiceDirection", "expressionDirection", "eyeDirection", "gestureDirection",
        "bodyLanguage", "cameraDirection", "backgroundDirection", "scriptStyle",
      ] as const;
      for (const k of direction) expect(p[k], p.id + "." + k).toBeTruthy();
    }
  });

  it("keeps the house negatives on every entry", () => {
    // The rules that stop an ad being unusable, whoever is fronting it.
    for (const p of CHARACTER_CATALOGUE) {
      const all = p.negatives.join(" | ").toLowerCase();
      expect(all, p.id).toContain("watermark");
      expect(all, p.id).toContain("no background music");
    }
  });

  it("makes every entry genuinely distinct, not one option worn many ways", () => {
    // The failure this guards: a catalogue that lists thirty-two names and gives them all the same
    // direction, so a deity and a cartoon generate identically.
    const voices = CHARACTER_CATALOGUE.map((p) => p.voiceDirection);
    expect(new Set(voices).size).toBe(voices.length);
    const cameras = CHARACTER_CATALOGUE.map((p) => p.cameraDirection);
    expect(new Set(cameras).size).toBe(cameras.length);
  });

  it("only the Real Owner Face entries are built from the client's own face", () => {
    const faces = CHARACTER_CATALOGUE.filter((p) => p.usesClientFace).map((p) => p.id).sort();
    expect(faces).toEqual(["owner_face_female", "owner_face_male"]);
  });

  it("gives duos exactly two speakers and everything else exactly one", () => {
    for (const p of CHARACTER_CATALOGUE) {
      expect(p.characters.length, p.id).toBe(p.family === "duo" ? 2 : 1);
    }
  });
});

describe("orders already in flight", () => {
  it("still resolves the old motu_patlu id", () => {
    // Every sale, order and assignment made before the catalogue existed stores this exact string.
    // An alias resolves it for ever; a data migration could half-succeed.
    const pack = getCharacterPack("motu_patlu");
    expect(pack).not.toBeNull();
    expect(pack!.id).toBe("duo_motu_patlu");
    expect(pack!.label).toBe("Motu & Patlu");
  });

  it("keeps the fixed Telugu spellings that stopped the names drifting", () => {
    const pack = getCharacterPack("motu_patlu")!;
    const spellings = packNameSpellings(pack, "Telugu");
    expect(spellings.find((s) => s.name === "Motu")?.spelling).toBe("మోటూ");
    expect(spellings.find((s) => s.name === "Patlu")?.spelling).toBe("పట్లు");
    expect(spellings.find((s) => s.name === "Patlu")!.variants.length).toBeGreaterThan(0);
  });

  it("keeps Motu speaking first", () => {
    expect(packSpeakers(getCharacterPack("motu_patlu")!).map((s) => s.key)).toEqual(["motu", "patlu"]);
  });

  it("still highlights and parses the pair the way the brief and the script parser expect", () => {
    const pack = getCharacterPack("motu_patlu")!;
    expect(packHighlight(pack)).toContain("*MOTU*");
    expect(packSpeakerAliases(pack)).toEqual(expect.arrayContaining(["motu", "patlu"]));
  });

  it("returns null for nothing and for an id that was never real", () => {
    expect(getCharacterPack("")).toBeNull();
    expect(getCharacterPack(null)).toBeNull();
    expect(getCharacterPack("not_a_pack")).toBeNull();
  });
});

describe("the picker", () => {
  it("groups the entries and drops nothing", () => {
    const groups = characterPackGroups();
    expect(groups.map((g) => g.family)).toEqual(CHARACTER_FAMILY_ORDER);
    const total = groups.reduce((n, g) => n + g.options.length, 0);
    expect(total).toBe(CHARACTER_CATALOGUE.length);
  });

  it("still offers a flat list for anything that wants one", () => {
    expect(characterPackOptions().length).toBe(CHARACTER_CATALOGUE.length);
  });

  it("registers every entry", () => {
    expect(Object.keys(CHARACTER_PACKS).length).toBe(CHARACTER_CATALOGUE.length);
  });
});

describe("the prompts a tech member actually receives", () => {
  const script = (id: string) =>
    CHARACTER_VOICEOVER_SYSTEM_PROMPT(getCharacterPack(id)!, 32, 4, "commercial", "", "Telugu", "Bodhan");

  it("asks a duo for two lines a clip", () => {
    const out = script("duo_motu_patlu");
    expect(out).toContain("THE TWO CHARACTERS");
    expect(out).toContain("0-8|motu:");
    expect(out).toContain("0-8|patlu:");
  });

  it("asks a single deity for ONE line a clip, and never invents a partner", () => {
    // The bug this guards: the contract used to be a hard-coded two-hander, so asking for Shiva
    // produced a second speaker purely to fill the format.
    const pack = getCharacterPack("god_shiva")!;
    const out = script("god_shiva");
    expect(out).toContain("THE CHARACTER");
    expect(out).not.toContain("THE TWO CHARACTERS");
    expect(out).toContain("0-8|" + pack.characters[0].key + ":");
    expect(out).toContain("never a second voice answering");
  });

  it("carries the character's own performance direction into the script", () => {
    const out = script("god_ganesha");
    expect(out).toContain("HOW THIS CHARACTER PERFORMS");
    expect(out).toContain("VOICE & MODULATION");
    expect(out).toContain("HAND GESTURES");
  });

  it("tells a Real Owner Face job that the face comes from the client's photo", () => {
    const block = characterCastBlock(getCharacterPack("owner_face_male")!);
    expect(block).toContain("IS THE CLIENT THEMSELF");
    expect(block).toContain("Do NOT beautify");
    // …and never sends the model looking for a recognisable existing character.
    expect(block).not.toContain("exactly as they appear on screen in that show");
  });

  it("treats a deity devotionally rather than as a cartoon", () => {
    const block = characterCastBlock(getCharacterPack("god_lakshmi")!);
    expect(block).toContain("devotional accuracy");
    expect(block).not.toContain("inspired by");
  });

  it("still tells a cartoon to be the real one from its show", () => {
    const block = characterCastBlock(getCharacterPack("duo_tom_jerry")!);
    expect(block).toContain("REAL, ORIGINAL character");
    expect(block).toContain("exactly as they appear on screen in that show");
  });

  /**
   * The catch-all. A template that silently renders "undefined" still produces a prompt, still
   * reaches a tech member, and still generates a video — it just quietly drops whatever was
   * supposed to be there. Rendering all thirty-two is cheap; discovering it on a client ad is not.
   */
  it("renders cleanly for every single entry in the catalogue", () => {
    for (const pack of CHARACTER_CATALOGUE) {
      const out = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "commercial", "", "Telugu", "Bodhan");
      expect(out, pack.id).not.toContain("undefined");
      expect(out, pack.id).not.toContain("[object Object]");
      // An unresolved template literal would mean a branch never closed.
      expect(out, pack.id).not.toContain("${");
      expect(out.length, pack.id).toBeGreaterThan(1000);
      // The character has to be named in their own script prompt.
      expect(out, pack.id).toContain(pack.characters[0].name);
    }
  });
  it("emits nothing at all for a pack carrying no direction", () => {
    // The compatibility promise: a pack written before these fields existed produces the prompt it
    // always did, with no empty heading floating in it.
    const bare = { ...getCharacterPack("duo_motu_patlu")! };
    const direction = [
      "voiceDirection", "expressionDirection", "eyeDirection", "gestureDirection",
      "bodyLanguage", "cameraDirection", "backgroundDirection", "scriptStyle",
    ];
    for (const k of direction) delete (bare as Record<string, unknown>)[k];
    expect(characterDirectionBlock(bare)).toBe("");
  });
});
