import { describe, it, expect } from "vitest";
import { castNamesFromFrames, castSheetBlock, castSheetFor, withCastSheet, CAST_SHEET_HEADING } from "@/utils/castSheet";
import {
  characterPackGroups, getCharacterPack, isHumanPack, isKidsPack, packAdKind, packCastGender,
} from "@/services/characterPacks";
import {
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, CHARACTER_VOICEOVER_SYSTEM_PROMPT, characterDirectionBlock, packPerformer,
  packVeoSubject, wardrobeDirective,
} from "@/services/prompts/characterAd";
import { assembleVeoPrompt, planClipMotion } from "@/services/prompts/motion";
import { AttireType, ModelGender } from "@/types/aiPlatform";
import { KIDS_ATTIRE, attireLabel, attireOptionLabel, attireOptionsFor, castLabelFor } from "@/utils/adRequirement";

/**
 * 2026-10-01 — the human duos were built on the cartoon pipeline, where a NAME is the identity. For
 * two invented people the name is a role label ("Friend", "Host"), so the frames invented new people
 * every clip, the script was told both to say and never to say the labels, and the video prompt told a
 * model that sees two women that "ONLY Host speaks". The Kids category is built on the fixed path.
 */

const pack = (id: string) => getCharacterPack(id)!;

describe("the cast sheet — one fixed description of every invented person", () => {
  it("casts two different women, left and right, in two different colours of the ordered outfit", () => {
    const sheet = castSheetFor(pack("human_duo_female"), { attireType: "traditional", seed: "Sri Lakshmi Silks" });
    expect(sheet.map((m) => m.position)).toEqual(["LEFT", "RIGHT"]);
    expect(sheet.map((m) => m.key)).toEqual(["friend", "host"]);
    expect(sheet[0].description).toMatch(/^an Indian woman of about \d+ with .+, wearing a designer silk saree in /);
    expect(sheet[0].short).toMatch(/^the woman in the .+ saree$/);
    expect(sheet[0].short).not.toBe(sheet[1].short);
    // Different faces, not one face twice.
    expect(sheet[0].description.split(", wearing")[0].replace(/of about \d+/, "")).not.toBe(
      sheet[1].description.split(", wearing")[0].replace(/of about \d+/, ""));
  });

  it("is the same cast for the same business, and a different cast for another", () => {
    const a = castSheetFor(pack("human_duo_male"), { attireType: "professional", seed: "Ravi Motors" });
    expect(castSheetFor(pack("human_duo_male"), { attireType: "professional", seed: "Ravi Motors" })).toEqual(a);
    const others = ["Sai Opticals", "Krishna Sweets", "Venkat Mobiles", "Annapurna Mess", "Balaji Steels"]
      .map((seed) => JSON.stringify(castSheetFor(pack("human_duo_male"), { attireType: "professional", seed })));
    expect(new Set([JSON.stringify(a), ...others]).size).toBeGreaterThan(1);
  });

  it("dresses a woman and a man each for themselves, and a custom order in the team's own words", () => {
    const mixed = castSheetFor(pack("human_duo_mixed"), { attireType: "traditional", seed: "x" });
    expect(mixed[0].description).toContain("saree");
    expect(mixed[1].description).toMatch(/kurta with a cream Nehru jacket/);
    const custom = castSheetFor(pack("human_duo_female"), { attireType: "custom", customAttire: "white lab coats", seed: "x" });
    expect(custom[0].description).toContain("exactly this outfit: white lab coats");
    expect(custom.map((m) => m.short)).toEqual(["the woman on the left", "the woman on the right"]);
  });

  it("casts the Normal Ad presenter alone, centred — and nobody whose identity comes from elsewhere", () => {
    const solo = castSheetFor(pack("normal_female"), { attireType: "professional", seed: "x" });
    expect(solo).toHaveLength(1);
    expect(solo[0].position).toBe("CENTRE");
    for (const id of ["duo_motu_patlu", "god_ganesha", "owner_face_female", "solo_motu", "custom_character"]) {
      expect(castSheetFor(pack(id), { attireType: "traditional", seed: "x" }), id).toEqual([]);
    }
    expect(castSheetFor(null)).toEqual([]);
  });

  it("is stamped once, and read back off the frames in position order", () => {
    const sheet = castSheetFor(pack("human_duo_female"), { attireType: "traditional", seed: "Sri Lakshmi Silks" });
    const block = castSheetBlock(sheet);
    expect(block).toContain(`${CAST_SHEET_HEADING} — THE SAME TWO PEOPLE IN EVERY CLIP, EXACTLY AS WRITTEN HERE:`);
    expect(block).toContain("never swap their places");
    const stamped = withCastSheet("Two women at the counter.", block);
    expect(withCastSheet(stamped, block)).toBe(stamped);
    expect(castNamesFromFrames(["📎 ATTACH NOTHING", stamped])).toEqual(sheet.map((m) => m.short));
    expect(castNamesFromFrames(["no sheet here"])).toEqual([]);
    expect(castSheetBlock([])).toBe("");
  });
});

describe("a human duo's script never says its labels — and is never asked to", () => {
  const vo = (id: string, adType = "commercial") =>
    CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack(id), 32, 4, adType, adType === "festival" ? "Diwali" : "", "Telugu", "Kakinada");

  it("opens without addressing anyone by a label, with no 'he' for two women", () => {
    for (const id of ["human_duo_female", "human_duo_male", "human_duo_mixed", "kids_duo_girls", "kids_duo_boys", "kids_duo_mixed"]) {
      const p = vo(id);
      const [a, b] = pack(id).characters.map((c) => c.name);
      expect(p, id).not.toContain(`addresses ${b} BY NAME`);
      expect(p, id).not.toContain(`address ${b} BY NAME`);
      expect(p, id).not.toContain(`answers with "${a}"`);
      expect(p, id).toContain(`Neither speaker ever says "${a}" or "${b}"`);
      expect(p, id).not.toMatch(/\bHe addresses\b/);
      // Two women or two girls are never told "he reacts to something in front of him".
      if (/female|girls/.test(id)) expect(p, id).not.toMatch(/in front of him\b/);
    }
  });

  it("does the same in a festival wish", () => {
    const p = vo("human_duo_female", "festival");
    expect(p).not.toContain("greets Host BY NAME");
    expect(p).toContain('Neither speaker ever says "Friend" or "Host"');
  });

  it("keeps the cartoon introduction for Motu and Patlu", () => {
    const p = vo("duo_motu_patlu");
    expect(p).toContain("address Patlu BY NAME");
    expect(p).toContain('answers with "Motu"');
  });

  it("says who is talking — two people, two children, or two well-known characters", () => {
    expect(vo("human_duo_male")).toContain("two real people visit a real business");
    expect(vo("kids_duo_mixed")).toContain("two real children visit a real business");
    expect(vo("duo_motu_patlu")).toContain("two well-known characters visit a real business");
  });
});

describe("what kind of ad each request asks for", () => {
  it("calls only the cartoons cartoons", () => {
    expect(packAdKind(pack("duo_motu_patlu")).script).toBe("two-character cartoon dialogue script");
    expect(packAdKind(pack("human_duo_female"))).toEqual({ script: "two-person conversation script", ad: "photoreal two-person ad with two real people" });
    expect(packAdKind(pack("kids_duo_boys")).ad).toBe("photoreal ad with two real children");
    expect(packAdKind(pack("normal_male")).script).toBe("presenter script");
    expect(packAdKind(pack("owner_face_female")).ad).toContain("business owner");
    for (const p of [pack("god_shiva"), pack("human_duo_mixed"), pack("kids_duo_girls"), pack("normal_female")]) {
      expect(JSON.stringify(packAdKind(p)), p.id).not.toContain("cartoon");
    }
  });
});

describe("a human duo's frames are written from the cast sheet", () => {
  const sheet = castSheetBlock(castSheetFor(pack("human_duo_female"), { attireType: "traditional", seed: "x" }));
  const frame = (id: string, castSheet = "") => CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack(id), {
    segmentCount: 3, clipSummaries: ["one", "two", "three"], locationMode: "ai_generated", locationPlan: "",
    aspectRatio: "9:16", adType: "commercial", castSheet,
  });

  it("describes the people in the sheet's words — never by their labels", () => {
    const p = frame("human_duo_female", sheet);
    expect(p).toContain(sheet);
    expect(p).toContain("Describe the people ONLY in the CAST SHEET's words, never in new ones");
    expect(p).not.toContain("naming them is enough");
    expect(p).toContain("exactly as the CAST SHEET describes them");
    expect(p).toContain("POSITIONS: exactly as the CAST SHEET places them");
    expect(p).toContain("POSITION LOCK: the CAST SHEET's LEFT person ALWAYS stands on the LEFT");
    expect(p).toContain("TWO REAL PEOPLE");
  });

  it("leaves a cartoon pair named, never described", () => {
    const p = frame("duo_motu_patlu");
    expect(p).toContain("naming them is enough");
    expect(p).not.toContain(CAST_SHEET_HEADING);
  });
});

describe("a human duo's video names each speaker by how they look", () => {
  it("says which woman speaks, where she stands, and keeps the other quiet", () => {
    const names = castSheetFor(pack("human_duo_female"), { attireType: "traditional", seed: "Sri Lakshmi Silks" }).map((m) => m.short);
    const s = packVeoSubject(pack("human_duo_female"), names);
    const speech = s.speech([{ name: names[0], text: "one" }, { name: names[1], text: "two" }]);
    expect(speech.map((x) => x.speaker)).toEqual(names);
    expect(speech.map((x) => x.position)).toEqual(["on the LEFT of the frame", "on the RIGHT of the frame"]);
    const p = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(3, "commercial", packPerformer(pack("human_duo_female")), { twoHander: true })[1],
      identityLock: s.identityLock, language: "Telugu", speech, cast: s.cast, castPlural: s.castPlural,
      twoHander: s.twoHander, scaleAnchor: s.scaleAnchor, sides: s.sides, pairNames: s.pairNames,
    });
    expect(p).toContain(`0–4s — ${names[0]} (on the LEFT of the frame), with `);
    expect(p).toContain(`4–8s — ${names[1]} (on the RIGHT of the frame), with `);
    expect(p).toContain("Only the one speaking moves their lips; the other listens with the mouth closed and reacts.");
    expect(p).not.toMatch(/\b(?:Friend|Host)\b/);
    // Each keeps her side while they walk, and their heights never change.
    expect(p).toContain(`— ${names[0]} on the left and ${names[1]} on the right —`);
    expect(p).toContain(`Heights never change: Two adult women of normal height for the room`);
    // Without a cast sheet (an old kit), the labels are still a working fallback.
    expect(packVeoSubject(pack("human_duo_female")).speech([{ name: "Friend", text: "a" }, { name: "Host", text: "b" }])[1].speaker).toBe("Host");
  });

  it("takes every lean and step toward the camera out of the pair's direction", () => {
    const video = characterDirectionBlock(pack("human_duo_male"), "video");
    expect(video).not.toMatch(/\blean toward the product\b/);
    expect(video).toContain("a nod");
  });
});

describe("the Kids category — two real children", () => {
  it("is sold, assigned and generated from the same picker, after the human duos", () => {
    const groups = characterPackGroups();
    const families = groups.map((g) => g.family);
    expect(families.indexOf("kids")).toBe(families.indexOf("human_duo") + 1);
    const kids = groups.find((g) => g.family === "kids")!;
    expect(kids.label).toBe("Kids (Real Children)");
    expect(kids.options.map((o) => o.id)).toEqual(["kids_duo_girls", "kids_duo_boys", "kids_duo_mixed"]);
  });

  it("is a photoreal pair of real children with the human pipeline's protections", () => {
    for (const id of ["kids_duo_girls", "kids_duo_boys", "kids_duo_mixed"]) {
      const p = pack(id);
      expect(isKidsPack(p), id).toBe(true);
      expect(isHumanPack(p), id).toBe(true);
      expect(packPerformer(p), id).toBe("person");
      expect(p.characters, id).toHaveLength(2);
      expect(p.scaleAnchor, id).toContain("the top of a normal shop counter (about 90 cm) reaches their chest");
      expect(p.negatives.join(" "), id).toMatch(/No adult anywhere in frame/);
      expect(p.negatives.join(" "), id).toMatch(/real photoreal children/);
      for (const c of p.characters) expect(c.labelSpellings?.length, `${id}.${c.key}`).toBeGreaterThan(0);
    }
    expect(packCastGender(pack("kids_duo_girls"))).toBe("female");
    expect(packCastGender(pack("kids_duo_boys"))).toBe("male");
    expect(packCastGender(pack("kids_duo_mixed"))).toBe("mixed");
    expect(pack("kids_duo_mixed").negatives.join(" ")).toContain("No romantic or couple-like staging");
  });

  it("casts children of 9 and 10, child-sized, in a child's outfit", () => {
    // Since 2026-10-05 the Kids are dressed for the ad (kidsWardrobeOct05.test): ethnic wear stays ethnic.
    const sheet = castSheetFor(pack("kids_duo_mixed"), { attireType: "traditional", seed: "Happy Kids Store" });
    expect(sheet[0].description).toMatch(/^a real Indian girl of about 9, child-sized, with .+(pattu langa|lehenga|anarkali)/);
    expect(sheet[1].description).toMatch(/^a real Indian boy of about 10, child-sized, with .+kurta/);
    expect(castSheetBlock(sheet)).toContain("THE SAME TWO CHILDREN IN EVERY CLIP");
    // Two boys are dressed alike in kind but never identically.
    const smart = castSheetFor(pack("kids_duo_boys"), { attireType: "shirt_pant", seed: "x" });
    expect(smart[0].outfit).not.toBe(smart[1].outfit);
    expect(smart.every((m) => !/suit|blazer|saree/i.test(m.description))).toBe(true);
  });

  it("offers a child's attire, in a child's words, on every form", () => {
    expect(attireOptionsFor("kids_duo_boys", ModelGender.MALE)).toEqual(KIDS_ATTIRE);
    expect(attireOptionsFor("kids_duo_mixed", ModelGender.FEMALE)).toEqual([AttireType.TRADITIONAL, AttireType.SHIRT_PANT, AttireType.CUSTOM]);
    expect(attireOptionLabel(AttireType.TRADITIONAL, "kids_duo_girls")).toBe("Traditional (Ethnic wear)");
    expect(attireOptionLabel(AttireType.SHIRT_PANT, "kids_duo_boys")).toBe("Matches the ad");
    expect(attireOptionLabel(AttireType.TRADITIONAL, "human_duo_female")).toBe("Traditional (Designer Saree)");
    expect(attireLabel(AttireType.TRADITIONAL, "", "kids_duo_mixed")).toBe("Traditional (Ethnic wear)");
    expect(attireLabel(AttireType.CUSTOM, "school uniforms", "kids_duo_mixed")).toBe("school uniforms");
    expect(castLabelFor("kids_duo_mixed")).toBe("👧👦 girl & boy");
    expect(castLabelFor("kids_duo_girls")).toBe("👧👧 both girls");
  });

  it("dresses the frames as children — never a saree, a suit or jewellery beyond tiny earrings", () => {
    const w = wardrobeDirective("traditional", "", "mixed", true);
    expect(w).toMatch(/^the girl wears a traditional silk pattu langa/);
    expect(w).toContain("the boy wears a neat traditional kurta");
    expect(wardrobeDirective("traditional", "", "female", true)).not.toMatch(/saree|blouse with/i);
    expect(wardrobeDirective("professional", "", "male", true)).not.toMatch(/suit|blazer/i);
  });

  it("has its script, frame and video built for children", () => {
    const k = pack("kids_duo_girls");
    const script = CHARACTER_VOICEOVER_SYSTEM_PROMPT(k, 24, 3, "commercial", "", "Telugu", "");
    expect(script).toContain("NO NAMES FOR THE SPEAKERS");
    expect(script).toContain("Simple everyday words a nine-year-old really says");
    const frame = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(k, {
      segmentCount: 3, clipSummaries: ["a", "b", "c"], locationMode: "ai_generated", locationPlan: "",
      aspectRatio: "9:16", adType: "commercial",
    });
    expect(frame).toContain("TWO REAL CHILDREN");
    expect(frame).toContain("never give either child a cartoon or drawn look");
    const s = packVeoSubject(k);
    expect(s.identityLock).toBe("both children's exact faces, hair, outfits, ages and heights");
    expect(s.cast).toBe("Both children");
    expect(s.twoHander).toBe(true);
  });
});
