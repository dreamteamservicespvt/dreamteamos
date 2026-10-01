import { describe, it, expect } from "vitest";
import {
  CHARACTER_VOICEOVER_SYSTEM_PROMPT, CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT, CHARACTER_MULTI_FRAME_SYSTEM_PROMPT,
  PEOPLE_DUO_VOICEOVER_SYSTEM_PROMPT, addressBlock, castLineBlock, needsCastLine, wardrobeDirective, withTrueScale,
} from "@/services/prompts/characterAd";
import { realLocationLock, REAL_LOCATION_LOCK_HEADING, packLocationSubject } from "@/services/prompts/realLocation";
import { getCharacterPack, isHumanPack, isKidsPack, isPeopleDuo, packCastGender, screenNameOf } from "@/services/characterPacks";
import {
  KIDS_ATTIRE, attireLabel, attireOptionLabel, attireOptionsFor, castLabelFor, resolveModelSpec,
} from "@/utils/adRequirement";
import { AttireType, ModelGender } from "@/types/aiPlatform";
import { addressIssue, addressPartsForSpeech, missingAddressParts, spokenAddressPhrase, type AddressPart } from "@/utils/spokenAddress";
import { castLineOf, withCastLine } from "@/utils/castLine";
import { validateDialogueClips, wordBudgetFor, MIN_WORDS_PER_KIDS_CLIP, MAX_WORDS_PER_KIDS_CLIP } from "@/utils/dialogueFormat";

const ADDRESS: AddressPart[] = [
  { latin: "Main Road", spoken: "మెయిన్ రోడ్" },
  { latin: "near Clock Tower", spoken: "క్లాక్ టవర్ దగ్గర" },
  { latin: "Kakinada", spoken: "కాకినాడ" },
];
const SPOKEN = spokenAddressPhrase(ADDRESS);

describe("the address, as it is said in an ad", () => {
  it("keeps the street, the landmark and the town — never the door number, pincode, state or country", () => {
    expect(addressPartsForSpeech("D.No 5-12, Main Road, near Clock Tower, Kakinada")).toEqual(["Main Road", "near Clock Tower", "Kakinada"]);
    expect(addressPartsForSpeech("12-4 Main Road, Gandhi Nagar, Kakinada - 533001, Andhra Pradesh")).toEqual(["Main Road", "Gandhi Nagar", "Kakinada"]);
    expect(addressPartsForSpeech("Shop No. 3, Sri Ram Complex, Near RTC Bus Stand, Rajahmundry, East Godavari Dist., AP 533101"))
      .toEqual(["Sri Ram Complex", "Near RTC Bus Stand", "Rajahmundry"]);
    expect(addressPartsForSpeech("Flat 201, Lakshmi Towers, Beach Road, Visakhapatnam, India")).toEqual(["Lakshmi Towers", "Beach Road", "Visakhapatnam"]);
  });

  it("has nothing to say when there is no address, or only a number", () => {
    expect(addressPartsForSpeech("")).toEqual([]);
    expect(addressPartsForSpeech(undefined)).toEqual([]);
    expect(addressPartsForSpeech("#21")).toEqual([]);
  });

  it("hears the address through case endings, joiners and spacing", () => {
    expect(missingAddressParts("కాకినాడ మెయిన్ రోడ్‌లో, క్లాక్ టవర్ దగ్గర ఉన్న మా షాప్‌కి రండి.", ADDRESS)).toEqual([]);
    expect(missingAddressParts("కాకినాడలో మా షాప్‌కి రండి.", ADDRESS)).toEqual(["మెయిన్ రోడ్", "క్లాక్ టవర్ దగ్గర"]);
    const english = ADDRESS.map((p) => ({ latin: p.latin, spoken: p.latin }));
    expect(missingAddressParts("Come to us at Main Road, near Clock Tower, Kakinada!", english)).toEqual([]);
  });

  it("asks the final clip for exactly what it left out — and checks nothing it cannot spell", () => {
    expect(addressIssue(4, "కాకినాడలో మా షాప్‌కి రండి.", ADDRESS)).toMatch(/^Clip 4 must say where the business is — the address "మెయిన్ రోడ్, క్లాక్ టవర్ దగ్గర, కాకినాడ"/);
    expect(addressIssue(4, "anything", [])).toBeNull();
    // The ad-language spelling could not be fetched: a Telugu line can never contain "Main Road".
    expect(addressIssue(4, "కాకినాడలో రండి.", [{ latin: "Main Road", spoken: "" }])).toBeNull();
  });
});

describe("every script prompt asks for the address in the final clip — and invents none", () => {
  const motu = getCharacterPack("duo_motu_patlu")!;
  const mixed = getCharacterPack("human_duo_mixed")!;

  it("puts the address in the cartoon pair's close, said by the second speaker", () => {
    const p = CHARACTER_VOICEOVER_SYSTEM_PROMPT(motu, 32, 4, "commercial", "", "Telugu", "కాకినాడ", null, SPOKEN);
    expect(p).toContain("SAY WHERE TO COME — THE ADDRESS, IN THE FINAL CLIP (MANDATORY)");
    expect(p).toContain(`THE ADDRESS IS: ${SPOKEN}`);
    expect(p).toContain(`In the same clip, Patlu says WHERE the business is — the address: "${SPOKEN}"`);
    // The town is still said in clip 1, and may come back inside the address.
    expect(p).toContain("except inside the address in the final clip");
  });

  it("says no address at all when none was verified", () => {
    const p = CHARACTER_VOICEOVER_SYSTEM_PROMPT(motu, 32, 4, "commercial", "", "Telugu");
    expect(p).toContain("NO ADDRESS WAS PROVIDED");
    expect(p).not.toContain("SAY WHERE TO COME");
    expect(addressBlock("", 4)).toContain("Never invent one");
  });

  it("keeps the address through the repair pass", () => {
    const repair = CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(motu, 32, 4, "Telugu", "కాకినాడ", "commercial", "", SPOKEN);
    expect(repair).toContain(`The FINAL clip says where to come — the address "${SPOKEN}"`);
    expect(repair).toContain("it may be said once more inside the address in the final clip");
    expect(CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(motu, 32, 4, "Telugu")).toContain("No address, street, landmark, town or village is spoken anywhere");
  });

  it("gives two real people the address too", () => {
    const p = CHARACTER_VOICEOVER_SYSTEM_PROMPT(mixed, 32, 4, "commercial", "", "Telugu", "కాకినాడ", null, SPOKEN);
    expect(p).toContain(`saying WHERE the business is — the address: "${SPOKEN}"`);
    expect(p).toContain(`THE ADDRESS IS: ${SPOKEN}`);
  });

  it("gives the final clip room for the address in the dialogue check", () => {
    const speakers = [{ key: "a", name: "A" }, { key: "b", name: "B" }];
    const words = (n: number, w = "word") => `${Array.from({ length: n }, () => w).join(" ")}.`;
    const clips = [
      [{ speaker: "a", text: words(8) }, { speaker: "b", text: words(8, "fact") }],
      [{ speaker: "a", text: words(6, "where") }, { speaker: "b", text: words(11, "address") }],
    ];
    expect(validateDialogueClips(clips, 2, speakers).join(" ")).toMatch(/Clip 2/);
    expect(validateDialogueClips(clips, 2, speakers, { finalClipSlack: 2 })).toEqual([]);
  });
});

describe("two real people talk like people, not like a cartoon double act", () => {
  const mixed = getCharacterPack("human_duo_mixed")!;
  const female = getCharacterPack("human_duo_female")!;

  it("has its own prompt: no names, no labels spoken, no yes-or-no set-ups, no chain of 'yes' answers", () => {
    const p = CHARACTER_VOICEOVER_SYSTEM_PROMPT(mixed, 32, 4, "commercial", "", "Telugu");
    expect(p).toBe(PEOPLE_DUO_VOICEOVER_SYSTEM_PROMPT(mixed, 32, 4, "commercial", "", "Telugu"));
    expect(p).toContain('"Girl" and "Boy" are LABELS');
    expect(p).toContain("NO NAMES. Never say \"Girl\" or \"Boy\"");
    expect(p).toContain("NEVER asks a yes-or-no question");
    expect(p).toContain('An answer that starts with "yes" ("అవును", "ఔను") may appear at most ONCE in the whole ad');
    expect(p).not.toContain("BOTH NAMES, EACH EXACTLY ONCE");
    expect(p).not.toMatch(/addresses \S+ BY NAME/);
    expect(p).not.toContain("cartoon");
  });

  it("refers to them by what the picture shows", () => {
    const p = PEOPLE_DUO_VOICEOVER_SYSTEM_PROMPT(mixed, 32, 4, "commercial", "", "Telugu");
    expect(p).toContain("spoken by two real people — the woman and the man");
    expect(screenNameOf(female, female.characters[0])).toBe("the woman on the LEFT");
    expect(isPeopleDuo(female)).toBe(true);
    expect(isPeopleDuo(getCharacterPack("duo_motu_patlu"))).toBe(false);
  });

  it("speaks no label anywhere in its worked example", () => {
    for (const pack of [mixed, female, getCharacterPack("kids_duo_male")!]) {
      const p = PEOPLE_DUO_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "commercial", "", "Telugu", "", null, SPOKEN);
      const example = p.slice(p.indexOf("A WORKED EXAMPLE"), p.indexOf("Notice:"));
      const spoken = [...example.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join(" ");
      for (const c of pack.characters) expect(spoken, pack.id).not.toContain(c.name);
    }
  });

  it("names nobody in the repair pass either", () => {
    const repair = CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(mixed, 32, 4, "Telugu");
    expect(repair).toContain("You repair Telugu two-person ad scripts");
    expect(repair).toContain('Nobody is named: "Girl" and "Boy" are labels, never spoken in any spelling');
    expect(repair).not.toContain("is spoken exactly once and");
  });

  it("opens a wishes ad with the wish from the business, not a greeting by name", () => {
    const p = PEOPLE_DUO_VOICEOVER_SYSTEM_PROMPT(mixed, 32, 4, "festival", "Diwali", "Telugu");
    expect(p).toContain("Clip 1 — THE WISHES (NOT A HOOK, NOT A SELL)");
    expect(p).toContain("ON BEHALF OF THE BUSINESS");
    expect(p).toContain("Clip 2 — THE TURN");
  });
});

describe("Kids — two girls, two boys, a boy and a girl", () => {
  const girls = getCharacterPack("kids_duo_female")!;
  const boys = getCharacterPack("kids_duo_male")!;
  const pair = getCharacterPack("kids_duo_mixed")!;

  it("are real children on the people's two-speaker system", () => {
    for (const p of [girls, boys, pair]) {
      expect(isKidsPack(p), p.id).toBe(true);
      expect(isHumanPack(p), p.id).toBe(true);
      expect(isPeopleDuo(p), p.id).toBe(true);
      expect(p.characters).toHaveLength(2);
    }
    expect(packCastGender(girls)).toBe("female");
    expect(packCastGender(boys)).toBe("male");
    expect(packCastGender(pair)).toBe("mixed");
  });

  it("speak shorter lines — children speak more slowly", () => {
    expect(wordBudgetFor(2, { children: true })).toEqual({ minClip: MIN_WORDS_PER_KIDS_CLIP, maxClip: MAX_WORDS_PER_KIDS_CLIP, minLine: 6, maxLine: 8 });
    const p = PEOPLE_DUO_VOICEOVER_SYSTEM_PROMPT(girls, 32, 4, "commercial", "", "Telugu");
    expect(p).toContain(`between ${MIN_WORDS_PER_KIDS_CLIP} and ${MAX_WORDS_PER_KIDS_CLIP} spoken words across both`);
    expect(p).toContain("CHILDREN'S WORDS");
    expect(p).toContain("spoken by two real children — the younger girl and the elder girl");
    expect(CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(girls, 32, 4, "Telugu")).toContain(`${MIN_WORDS_PER_KIDS_CLIP}-${MAX_WORDS_PER_KIDS_CLIP} spoken words per clip`);
  });

  it("are dressed in children's wear from the same four stored choices", () => {
    expect(attireOptionsFor("kids_duo_female", ModelGender.FEMALE)).toEqual(KIDS_ATTIRE);
    expect(attireOptionLabel(AttireType.TRADITIONAL, "kids_duo_female")).toBe("Traditional (Pattu Langa / Kurta)");
    expect(attireOptionLabel(AttireType.SHIRT_PANT, "kids_duo_male")).toBe("School Uniform");
    expect(attireOptionLabel(AttireType.TRADITIONAL, "human_duo_female")).toBe("Traditional (Designer Saree)");
    expect(attireLabel(AttireType.PROFESSIONAL, "", "kids_duo_mixed")).toBe("Smart Casual (Party Wear)");
    expect(castLabelFor("kids_duo_mixed")).toBe("👦👧 boy & girl");
    expect(castLabelFor("kids_duo_male")).toBe("👦👦 both boys");
    // A school uniform is a real choice for a child of either gender.
    expect(resolveModelSpec({ characterPack: "kids_duo_female", modelGender: ModelGender.FEMALE, attireType: AttireType.SHIRT_PANT }).attireType)
      .toBe(AttireType.SHIRT_PANT);
    expect(wardrobeDirective("traditional", "", "female", { children: true })).toContain("pattu langa");
    expect(wardrobeDirective("shirt_pant", "", "mixed", { children: true })).toMatch(/^the girl wears a neat school uniform.*; the boy wears a neat school uniform/);
    expect(wardrobeDirective("traditional", "", "female")).toContain("saree");
  });

  it("are framed whole, at a child's size in the room, and described once in a CAST line", () => {
    const p = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pair, {
      segmentCount: 2, clipSummaries: ["one", "two"], locationMode: "ai_generated", locationPlan: "ladder",
      aspectRatio: "9:16", adType: "commercial",
    });
    expect(p).toContain("TWO REAL CHILDREN");
    expect(p).toContain("TRUE SCALE IN THE ROOM: they are real children of about the same height");
    expect(p).toContain("THE CAST LINE (CLIP 1 WRITES IT, EVERY CLIP CARRIES IT)");
    expect(p).toContain("the boy ALWAYS stands on the LEFT of the frame and the girl ALWAYS on the RIGHT");
    expect(p).not.toMatch(/the same Boy and Girl/);
    expect(packLocationSubject(pair).who).toBe("the two children");
  });

  it("wear what was ordered — the outfit reaches the frame prompt", () => {
    const p = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pair, {
      segmentCount: 2, clipSummaries: ["one", "two"], locationMode: "ai_generated", locationPlan: "ladder",
      aspectRatio: "9:16", adType: "festival", festivalName: "Diwali",
      wardrobe: wardrobeDirective("traditional", "", "mixed", { children: true }),
    });
    expect(p).toContain("WARDROBE (as ordered — this overrides any outfit STAGING offers): the girl wears a traditional children's pattu langa");
  });
});

describe("invented people carry one CAST line through every frame", () => {
  it("asks clip 1 for it, for every cast of invented people — and only them", () => {
    expect(needsCastLine(getCharacterPack("human_duo_mixed")!)).toBe(true);
    expect(needsCastLine(getCharacterPack("normal_female")!)).toBe(true);
    expect(needsCastLine(getCharacterPack("kids_duo_male")!)).toBe(true);
    expect(needsCastLine(getCharacterPack("owner_face_male")!)).toBe(false);
    expect(needsCastLine(getCharacterPack("duo_motu_patlu")!)).toBe(false);
    const block = castLineBlock(getCharacterPack("human_duo_mixed")!);
    expect(block).toContain('BEGIN with ONE line that starts "CAST:"');
    expect(block).toContain("for each of them — the woman, then the man —");
    expect(block).toContain('Never use the script labels ("Girl", "Boy")');
  });

  it("frames the human duo with no labels — 'Girl and Boy' would draw two children", () => {
    const p = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack("human_duo_mixed")!, {
      segmentCount: 3, clipSummaries: ["one", "two", "three"], locationMode: "ai_generated", locationPlan: "ladder",
      aspectRatio: "9:16", adType: "commercial",
    });
    expect(p).toContain('"the same woman and man exactly as in the attached reference');
    expect(p).not.toContain("the same Girl and Boy");
    expect(p).toContain("Begin with THE CAST LINE,\n   copied word for word from clip 1.");
  });

  it("is copied by code onto every frame that lacks it", () => {
    const frames = withCastLine([
      "CAST: on the LEFT a woman of about 25, oval face, long black braid, teal silk saree; on the RIGHT a man of about 32, short beard, navy kurta.\n\nThe saree section…",
      "The same woman and man at the billing counter…",
      "CAST: something else\n\nThe entrance…",
    ]);
    expect(castLineOf(frames[0])).toContain("teal silk saree");
    expect(frames[1].startsWith("CAST: on the LEFT a woman of about 25")).toBe(true);
    expect(castLineOf(frames[2])).toBe("something else");
    expect(withCastLine(["no cast here", "frame 2"])).toEqual(["no cast here", "frame 2"]);
  });
});

describe("a pair's size in the room is on every frame", () => {
  it("stamps Motu and Patlu's true scale once, and leaves a pack without one alone", () => {
    const motu = getCharacterPack("duo_motu_patlu")!;
    const stamped = withTrueScale("Motu and Patlu in the saree section.", motu);
    expect(stamped).toContain("TRUE SCALE IN THE ROOM: Motu and Patlu are grown men");
    expect(withTrueScale(stamped, motu)).toBe(stamped);
    expect(withTrueScale("Doraemon and Nobita.", getCharacterPack("duo_doraemon_nobita"))).toBe("Doraemon and Nobita.");
  });
});

describe("a frame built on the client's photograph is an edit of it", () => {
  it("says so in every such prompt, once", () => {
    const stamped = realLocationLock("The woman stands at the counter.", "STORE/OFFICE IMAGE #2 (the billing counter)", "the model");
    expect(stamped).toContain(REAL_LOCATION_LOCK_HEADING);
    expect(stamped).toContain("Use the attached STORE/OFFICE IMAGE #2 (the billing counter) as the EXACT background");
    expect(stamped).toContain("enhance and upscale it to a sharp, clean 8K image");
    expect(stamped).toContain("nothing added, removed or moved");
    expect(stamped).toContain("crop\nthe photograph — never extend it with invented space");
    expect(realLocationLock(stamped, "x", "y")).toBe(stamped);
  });

  it("never decorates a deity's real photograph", () => {
    const ganesha = getCharacterPack("god_ganesha")!;
    expect(ganesha.backgroundDirection).toContain("a client's own photograph is used exactly as photographed and is never decorated");
  });
});
