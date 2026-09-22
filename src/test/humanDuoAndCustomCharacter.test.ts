import { describe, it, expect } from "vitest";
import {
  attireOptionsFor, buildAssignmentRequirementsMessage, castLabelFor, isDressableSpec, MIXED_DUO_ATTIRE,
  needsCharacterDescription, resolveModelSpec,
} from "@/utils/adRequirement";
import { getCharacterPack, packCastGender, packModelGender, packSpeakers, withCustomCharacter, isHumanPack } from "@/services/characterPacks";
import { wardrobeDirective, packVeoSubject } from "@/services/prompts/characterAd";
import { describeSpecChanges } from "@/utils/assignmentSpecDiff";
import { AttireType, ModelGender } from "@/types/aiPlatform";

/**
 * Three new ad types — a male duo, a female duo, a male & female duo — sold, assigned and made like
 * every other special category; and the Custom Character, which used to be sold with nowhere to say
 * who the character is.
 */

describe("the human duos", () => {
  it("are real people, two of them, each casting their own gender", () => {
    for (const [id, cast] of [["human_duo_female", "female"], ["human_duo_male", "male"], ["human_duo_mixed", "mixed"]] as const) {
      const pack = getCharacterPack(id)!;
      expect(isHumanPack(pack), id).toBe(true);
      expect(packSpeakers(pack), id).toHaveLength(2);
      expect(packCastGender(pack), id).toBe(cast);
    }
    // The mixed duo has no single gender to hand a single-gender form field.
    expect(packModelGender(getCharacterPack("human_duo_mixed"))).toBeNull();
  });

  it("offers attire that dresses both people", () => {
    expect(attireOptionsFor("human_duo_mixed", ModelGender.FEMALE)).toEqual(MIXED_DUO_ATTIRE);
    expect(attireOptionsFor("human_duo_male", ModelGender.FEMALE)).toContain(AttireType.SHIRT_PANT);
    expect(isDressableSpec("human_duo_female")).toBe(true);
    expect(castLabelFor("human_duo_female")).toBe("👩👩 both women");
    expect(castLabelFor("human_duo_male")).toBe("👨👨 both men");
    expect(castLabelFor("human_duo_mixed")).toBe("👩👨 woman & man");
  });

  it("keeps the mixed duo's attire to what suits both of them", () => {
    const spec = resolveModelSpec({ characterPack: "human_duo_mixed", modelGender: ModelGender.MALE, attireType: AttireType.SHIRT_PANT });
    expect(MIXED_DUO_ATTIRE).toContain(spec.attireType);
  });

  it("dresses the woman and the man each for themselves from one choice", () => {
    const w = wardrobeDirective("traditional", "", "mixed");
    expect(w).toMatch(/^the woman wears .*saree.*; the man wears .*kurta/);
    expect(wardrobeDirective("custom", "matching white outfits", "mixed")).toBe("exactly this, for the two of them: matching white outfits");
  });

  it("puts the duo in the work brief, with its cast", () => {
    const msg = buildAssignmentRequirementsMessage({
      category: "promotional", duration: "32s", clipCount: 4, characterPack: "human_duo_female", attireType: "traditional",
    });
    expect(msg).toContain("👔 *Attire (👩👩 both women):*");
  });

  it("tells the video two real people speak, each on their own side", () => {
    const pack = getCharacterPack("human_duo_mixed")!;
    const s = packVeoSubject(pack);
    expect(s.cast).toBe("Both people");
    expect(s.twoHander).toBe(true);
    const [left, right] = s.speech(pack.characters.map((c, i) => ({ name: c.name, text: i === 0 ? "a" : "b" })));
    expect(left.position).toBe("on the LEFT of the frame");
    expect(right.position).toBe("on the RIGHT of the frame");
  });
});

describe("the Custom Character", () => {
  it("asks for a description, and only for the custom entry", () => {
    expect(needsCharacterDescription("custom_character")).toBe(true);
    expect(needsCharacterDescription("duo_motu_patlu")).toBe(false);
    expect(needsCharacterDescription(undefined)).toBe(false);
  });

  it("writes the description into the character every prompt reads", () => {
    const pack = withCustomCharacter(getCharacterPack("custom_character"), "a friendly talking mango in a cricket cap")!;
    expect(pack.franchise).toContain('"a friendly talking mango in a cricket cap"');
    for (const c of pack.characters) expect(c.persona).toContain("a friendly talking mango in a cricket cap");
  });

  it("leaves every other entry, and an empty description, untouched", () => {
    const motu = getCharacterPack("duo_motu_patlu");
    expect(withCustomCharacter(motu, "anything")).toBe(motu);
    const custom = getCharacterPack("custom_character");
    expect(withCustomCharacter(custom, "  ")).toBe(custom);
  });

  it("puts the character in the work brief", () => {
    const msg = buildAssignmentRequirementsMessage({
      category: "promotional", duration: "16s", clipCount: 2, characterPack: "custom_character", customCharacter: "a talking mango",
    });
    expect(msg).toContain("🎭 *Character:* a talking mango");
  });

  it("interrupts the member when the character is re-described", () => {
    const base = { characterPack: "custom_character", customCharacter: "a talking mango" };
    const changes = describeSpecChanges(base as any, { ...base, customCharacter: "a dancing coconut" } as any);
    expect(changes.some((c) => c.label === "Character" && c.to === "a dancing coconut")).toBe(true);
  });
});
