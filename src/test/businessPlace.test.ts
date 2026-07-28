import { describe, expect, it } from "vitest";
import { placeFromAddress, resolvePlaceName } from "@/utils/businessPlace";
import { CHARACTER_VOICEOVER_SYSTEM_PROMPT, CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT } from "@/services/prompts/characterAd";
import { getCharacterPack } from "@/services/characterPacks";
import { validateDialogueClips } from "@/utils/dialogueFormat";

const pack = getCharacterPack("motu_patlu")!;
const speakers = [{ key: "motu", name: "Motu" }, { key: "patlu", name: "Patlu" }];

describe("placeFromAddress", () => {
  it("takes the town before the state and pincode", () => {
    expect(placeFromAddress("Shop No 12, Main Road, Bodhan, Telangana - 503185")).toBe("Bodhan");
  });

  it("reads a segment that names itself as the mandal or district", () => {
    expect(placeFromAddress("2-4-15, Bank Street, Bodhan Mandal, Nizamabad Dist, Telangana")).toBe("Bodhan");
  });

  it("skips street lines, door numbers and landmarks", () => {
    expect(placeFromAddress("Opp Bus Stand, 1st Floor, Armoor, Telangana, India")).toBe("Armoor");
  });

  it("returns nothing rather than guess when there is no address", () => {
    expect(placeFromAddress("")).toBe("");
    expect(placeFromAddress("Not provided")).toBe("");
  });

  it("returns nothing when every segment is a street line", () => {
    expect(placeFromAddress("Near Railway Station, 2nd Cross Road")).toBe("");
  });
});

describe("resolvePlaceName", () => {
  it("prefers an explicit city / town / village field over the address", () => {
    const info = {
      "CONTACT INFORMATION": {
        "Full Address": "Shop 4, Market Road, Armoor, Telangana",
        "City / Town / Village": "Bodhan",
      },
    };
    expect(resolvePlaceName(info)).toBe("Bodhan");
  });

  it("falls back to the address for profiles captured before the field existed", () => {
    const info = { contact: { address: "Main Road, Bodhan, Telangana - 503185" } };
    expect(resolvePlaceName(info)).toBe("Bodhan");
  });

  it("ignores a 'Not provided' place and keeps looking", () => {
    const info = { city: "Not provided", address: "Bank Street, Armoor, Telangana" };
    expect(resolvePlaceName(info)).toBe("Armoor");
  });

  it("is empty when the profile says nothing about where the business is", () => {
    expect(resolvePlaceName({ "Business Name": "Sharma Electronics" })).toBe("");
    expect(resolvePlaceName(null)).toBe("");
  });

  it("strips a trailing qualifier from the place field", () => {
    expect(resolvePlaceName({ village: "Bodhan Village" })).toBe("Bodhan");
  });
});

describe("character voice-over prompt — the town", () => {
  const withPlace = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "commercial", "", "Telugu", "బోధన్");
  const withoutPlace = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "commercial", "", "Telugu", "");

  it("orders the town spoken in clip 1, beside the business name", () => {
    expect(withPlace).toContain("THE TOWN IS: బోధన్");
    expect(withPlace).toMatch(/says it is in బోధన్/);
    expect(withPlace).toContain("SPELL IT EXACTLY AS \"బోధన్\"");
  });

  it("forbids inventing a town when none is known", () => {
    expect(withoutPlace).toContain("NO TOWN WAS PROVIDED");
    expect(withoutPlace).not.toContain("THE TOWN IS:");
  });

  it("carries the rule into the repair pass so it cannot be dropped", () => {
    const repair = CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(pack, 32, 4, "Telugu", "బోధన్");
    expect(repair).toContain("బోధన్");
    expect(CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(pack, 32, 4, "Telugu", "")).toContain("none may be invented");
  });
});

describe("validateDialogueClips — required phrases", () => {
  const clip = (a: string, b: string) => [
    { speaker: "motu", text: a },
    { speaker: "patlu", text: b },
  ];
  // Two clips of legal length, so only the town rule can fail.
  const script = (patluOpening: string) => [
    clip("Patlu why is there such a big queue outside this shop today?", patluOpening),
    clip("Then let us go inside and buy something right now!", "Visit Sharma Electronics today and see the festival offers yourself."),
  ];

  const townRule = {
    label: 'The town "Bodhan"',
    tokens: ["Bodhan", "బోధన్"],
    clip: 1,
  };

  it("flags a script that never says the town", () => {
    const issues = validateDialogueClips(
      script("That is Sharma Electronics Motu and the whole town buys here."),
      2, speakers, { requiredPhrases: [townRule] },
    );
    expect(issues.some((i) => i.includes('The town "Bodhan" is never spoken in clip 1'))).toBe(true);
  });

  it("passes when clip 1 names the town", () => {
    const issues = validateDialogueClips(
      script("That is Sharma Electronics here in Bodhan Motu, everyone buys here."),
      2, speakers, { requiredPhrases: [townRule] },
    );
    expect(issues.filter((i) => i.includes("The town"))).toEqual([]);
  });

  it("does not accept the town appearing only in a later clip", () => {
    const late = [
      clip("Patlu why is there such a big queue outside this shop today?", "That is Sharma Electronics Motu and everyone buys here."),
      clip("Then let us go inside and buy something right now!", "Visit Sharma Electronics in Bodhan today and see the offers."),
    ];
    const issues = validateDialogueClips(late, 2, speakers, { requiredPhrases: [townRule] });
    expect(issues.some((i) => i.includes('The town "Bodhan" is never spoken in clip 1'))).toBe(true);
  });

  it("accepts the native spelling as having said it", () => {
    const issues = validateDialogueClips(
      script("అది షర్మా ఎలక్ట్రానిక్స్ బోధన్ లో ఉంది మోటూ అందరూ ఇక్కడే కొంటారు."),
      2, speakers, { requiredPhrases: [townRule] },
    );
    expect(issues.filter((i) => i.includes("The town"))).toEqual([]);
  });
});
