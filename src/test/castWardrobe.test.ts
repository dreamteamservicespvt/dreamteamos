import { describe, it, expect } from "vitest";
import {
  checkStyledCast, isNameableColour, parseStylistReply, styleRuleFor, styledShortName, type CastPerson,
} from "@/utils/castWardrobe";
import { CAST_WARDROBE_SYSTEM_PROMPT, castWardrobeRequest } from "@/services/prompts/castWardrobe";
import { castPeopleFor, castSheetFor, castWardrobeLine, kidsWardrobeLine } from "@/utils/castSheet";
import { getCharacterPack } from "@/services/characterPacks";

const pack = (id: string) => getCharacterPack(id)!;

/**
 * 2026-10-05 — "the girl and the boy always get the same outfit; we need them related to the video
 * context, the business context and the logo." The ordered attire stays the style; the stylist chooses
 * inside it, and this checker decides whether its answer can be used at all.
 */

const MIXED: CastPerson[] = [{ position: "LEFT", kind: "woman", age: 25 }, { position: "RIGHT", kind: "man", age: 30 }];
const TWO_WOMEN: CastPerson[] = [{ position: "LEFT", kind: "woman", age: 24 }, { position: "RIGHT", kind: "woman", age: 27 }];
const KIDS: CastPerson[] = [{ position: "LEFT", kind: "girl", age: 9 }, { position: "RIGHT", kind: "boy", age: 10 }];
const SOLO: CastPerson[] = [{ position: "CENTRE", kind: "woman", age: 23 }];

const saree = (colour: string, rest = "Kanchipuram silk saree with a thin antique-gold zari border, an elbow-length gold blouse and small gold jhumkas") =>
  ({ colour, garment: "saree", outfit: `a ${colour} ${rest}` });
const kurta = (colour: string) =>
  ({ colour, garment: "kurta", outfit: `a ${colour} raw-silk kurta with a cream churidar and a short maroon Nehru jacket with antique buttons` });

describe("the ordered attire stays the style", () => {
  it("keeps a saree a saree, a kurta a kurta, a suit a suit — and a Custom order out of the stylist's hands", () => {
    expect(styleRuleFor("woman", "traditional")!.must[0].test("a teal silk saree")).toBe(true);
    expect(styleRuleFor("man", "traditional")!.must[0].test("a teal kurta")).toBe(true);
    expect(styleRuleFor("man", "professional")!.must[0].test("a navy three-piece suit")).toBe(true);
    expect(styleRuleFor("woman", "shirt_pant")!.must.length).toBe(2);
    expect(styleRuleFor("woman", "custom")).toBeNull();
    expect(styleRuleFor("girl", "custom")).toBeNull();
    // A blank attire is Professional for an adult (as the cast sheet's own outfits read it).
    expect(styleRuleFor("man", undefined)!.brief).toMatch(/formal suit/i);
    // A child's "Matches the ad" lets the ad choose.
    expect(styleRuleFor("boy", "shirt_pant")!.must).toEqual([]);
  });

  it("refuses an outfit outside the ordered style", () => {
    const suitOnSaree = checkStyledCast(MIXED, "traditional", {
      people: [{ position: "LEFT", colour: "royal blue", garment: "blazer", outfit: "a royal blue tailored blazer over a cream silk blouse with slim ivory trousers and pearl studs" }, { position: "RIGHT", ...kurta("ivory") }],
    });
    expect(suitOnSaree.outfits).toBeNull();
    expect(suitOnSaree.problems.join(" ")).toMatch(/LEFT.*outside the ordered style/);

    const kurtaOnSuit = checkStyledCast([MIXED[1]], "professional", { people: [{ position: "RIGHT", ...kurta("ivory") }] });
    expect(kurtaOnSuit.outfits).toBeNull();
  });
});

describe("two people who never look alike", () => {
  it("accepts a coordinated pair — a saree and a kurta in two brand colours", () => {
    const { outfits, problems } = checkStyledCast(MIXED, "traditional", { people: [{ position: "LEFT", ...saree("deep teal") }, { position: "RIGHT", ...kurta("ivory") }] });
    expect(problems).toEqual([]);
    expect(outfits!.map((o) => o.colour)).toEqual(["deep teal", "ivory"]);
    expect(styledShortName("woman", outfits![0])).toBe("the woman in the deep teal saree");
    expect(styledShortName("man", outfits![1])).toBe("the man in the ivory kurta");
  });

  it("refuses two grown-ups in one main colour, and two identical outfits", () => {
    const sameColour = checkStyledCast(TWO_WOMEN, "traditional", { people: [{ position: "LEFT", ...saree("maroon") }, { position: "RIGHT", ...saree("maroon", "Banarasi silk saree with a broad gold border, a maroon blouse and a pearl necklace") }] });
    expect(sameColour.outfits).toBeNull();
    expect(sameColour.problems[0]).toMatch(/both wear maroon/);
    const twins = checkStyledCast(TWO_WOMEN, "traditional", { people: [{ position: "LEFT", ...saree("maroon") }, { position: "RIGHT", ...saree("maroon") }] });
    expect(twins.problems[0]).toMatch(/the same/);
  });

  it("lets two children share a school's colours, but never one name for both", () => {
    const uniform = (garment: string, piece: string) => ({ colour: "navy blue", garment, outfit: `a neat navy blue ${piece} over a crisp white half-sleeve shirt, white socks and black school shoes` });
    const ok = checkStyledCast(KIDS, "shirt_pant", { people: [{ position: "LEFT", ...uniform("pinafore", "pinafore") }, { position: "RIGHT", ...uniform("shorts", "pair of shorts with a belt") }] });
    expect(ok.problems).toEqual([]);
    const girls: CastPerson[] = [{ position: "LEFT", kind: "girl", age: 10 }, { position: "RIGHT", kind: "girl", age: 9 }];
    const clash = checkStyledCast(girls, "shirt_pant", { people: [{ position: "LEFT", ...uniform("pinafore", "pinafore") }, { position: "RIGHT", ...uniform("pinafore", "pinafore with a ribbon") }] });
    expect(clash.problems[0]).toMatch(/both would be called "the girl in the navy blue pinafore"/);
  });
});

describe("what nobody wears", () => {
  const one = (kind: CastPerson["kind"], attire: string, raw: object) =>
    checkStyledCast([{ position: "CENTRE", kind, age: kind === "girl" || kind === "boy" ? 9 : 25 }], attire, { people: [{ position: "CENTRE", ...raw }] });

  it("no writing or logo on clothes, no profession's uniform, nothing revealing or bridal", () => {
    expect(one("woman", "professional", { colour: "navy", garment: "blazer", outfit: "a navy tailored blazer with the clinic logo embroidered on the pocket over an ivory blouse and trousers" }).problems[0]).toMatch(/logo/);
    expect(one("woman", "professional", { colour: "white", garment: "blazer", outfit: "a white lab coat worn like a blazer over a teal blouse, formal trousers and a stethoscope" }).problems[0]).toMatch(/lab coat|stethoscope/);
    expect(one("woman", "traditional", { colour: "red", garment: "saree", outfit: "a red bridal Banarasi silk saree with heavy gold zari, a sleeveless blouse and temple jewellery" }).outfits).toBeNull();
    expect(one("man", "professional", { colour: "charcoal", garment: "suit", outfit: "a charcoal suit jacket over a white shirt with tailored shorts and loafers for a summer look" }).problems[0]).toMatch(/shorts/);
  });

  it("children: never a saree, a suit or make-up — but a school uniform is fine", () => {
    expect(one("girl", "shirt_pant", { colour: "pink", garment: "saree", outfit: "a tiny pink silk saree with a gold border, a matching blouse and small earrings" }).outfits).toBeNull();
    expect(one("boy", "shirt_pant", { colour: "navy", garment: "suit", outfit: "a little navy three-piece suit with a white shirt, a bow tie and polished shoes" }).outfits).toBeNull();
    expect(one("girl", "shirt_pant", { colour: "peach", garment: "party frock", outfit: "a twirly peach party frock with a soft tulle skirt, lipstick and a sparkly hairband" }).problems[0]).toMatch(/lipstick/);
    expect(one("boy", "shirt_pant", { colour: "maroon", garment: "school uniform", outfit: "a neat school uniform: a white half-sleeve shirt, maroon shorts, a maroon striped tie and black shoes" }).problems).toEqual([]);
  });

  it("a colour a viewer can name, and a garment the outfit actually names", () => {
    expect(isNameableColour("deep teal")).toBe(true);
    expect(isNameableColour("off-white")).toBe(true);
    expect(isNameableColour("#1E88E5")).toBe(false);
    expect(isNameableColour("brand colour")).toBe(false);
    expect(one("woman", "traditional", { colour: "#1E88E5", garment: "saree", outfit: "a #1E88E5 silk saree with a gold border and an elbow-length blouse" }).problems[0]).toMatch(/not a plain colour/);
    expect(one("woman", "traditional", { colour: "teal", garment: "saree", outfit: "an emerald silk saree with a gold border, an elbow-length blouse and gold studs" }).problems[0]).toMatch(/must name its colour/);
    // "teal saree" as the garment is read as "saree" — the colour is written beside it, never twice.
    const r = one("woman", "traditional", { colour: "Teal", garment: "Teal Saree", outfit: "She wears a teal silk saree with a gold border, an elbow-length blouse and gold studs." });
    expect(r.outfits![0]).toEqual({ colour: "teal", garment: "saree", outfit: "a teal silk saree with a gold border, an elbow-length blouse and gold studs" });
  });
});

describe("reading the stylist", () => {
  it("reads a fenced or chatty JSON reply, and nothing from a reply without one", () => {
    expect(parseStylistReply('```json\n{"people":[{"position":"CENTRE"}]}\n```')).toEqual({ people: [{ position: "CENTRE" }] });
    expect(parseStylistReply("Sure! Here you go: {\"palette\":\"red\"}")).toEqual({ palette: "red" });
    expect(parseStylistReply("no json")).toBeNull();
    expect(parseStylistReply("{broken")).toBeNull();
  });

  it("matches people by position, and reads a reply without positions in order", () => {
    const swapped = checkStyledCast(MIXED, "traditional", { people: [{ position: "RIGHT", ...kurta("ivory") }, { position: "LEFT", ...saree("deep teal") }] });
    expect(swapped.outfits!.map((o) => o.garment)).toEqual(["saree", "kurta"]);
    const ordered = checkStyledCast(MIXED, "traditional", [saree("deep teal"), kurta("ivory")]);
    expect(ordered.outfits!.map((o) => o.garment)).toEqual(["saree", "kurta"]);
    expect(checkStyledCast(MIXED, "traditional", { people: [{ position: "LEFT", ...saree("deep teal") }] }).problems).toEqual(["RIGHT: missing"]);
    expect(checkStyledCast(SOLO, "custom", { people: [] }).outfits).toBeNull();
  });
});

describe("the stylist's brief", () => {
  it("gives each person the ordered style, the business, the logo and the video", () => {
    const text = castWardrobeRequest({
      people: MIXED, attireType: "traditional", businessName: "Sri Sai Children's Hospital", whatTheyDo: "a children's hospital",
      brandPalette: "Blue and green", hasLogo: true, adType: "festival", festivalName: "Sankranti", festivalLook: "crimson silk with gold zari",
      brief: "Sankranti wishes from the hospital",
    });
    expect(text).toMatch(/LEFT — a woman of about 25\. Ordered style: a saree/);
    expect(text).toMatch(/RIGHT — a man of about 30\. Ordered style: Indian ethnic wear/);
    expect(text).toContain("What it does: a children's hospital");
    expect(text).toContain("Brand palette (from the extraction): Blue and green");
    expect(text).toContain("LOGO is attached");
    expect(text).toMatch(/A Sankranti festival greeting from this business\. The festival's traditional look, as a guide: crimson silk/);
    expect(text).not.toMatch(/\n\n\n/);
    const retry = castWardrobeRequest({ people: SOLO, attireType: "professional", hasLogo: false, problems: ["CENTRE: \"logo\" is never worn in these ads"] });
    expect(retry).toContain("No logo is attached");
    expect(retry).toContain("A promotional ad for this business.");
    expect(retry).toMatch(/YOUR LAST ANSWER COULD NOT BE USED[\s\S]*CENTRE: "logo"/);
  });

  it("asks for the shape the checker reads, and for colours from the logo", () => {
    expect(CAST_WARDROBE_SYSTEM_PROMPT).toMatch(/THE LOGO DECIDES THE COLOURS/);
    expect(CAST_WARDROBE_SYSTEM_PROMPT).toMatch(/"position"[\s\S]*"colour"[\s\S]*"garment"[\s\S]*"outfit"/);
    expect(CAST_WARDROBE_SYSTEM_PROMPT).toMatch(/NEVER ALIKE/);
  });
});

describe("the cast sheet wears the stylist's answer", () => {
  it("knows who the stylist dresses — and nobody whose look comes from elsewhere", () => {
    expect(castPeopleFor(pack("human_duo_mixed"))).toEqual(MIXED);
    expect(castPeopleFor(pack("kids_duo_mixed"))).toEqual(KIDS);
    expect(castPeopleFor(pack("normal_female"))).toEqual(SOLO);
    for (const id of ["duo_motu_patlu", "god_ganesha", "owner_face_female", "custom_character"]) expect(castPeopleFor(pack(id)), id).toEqual([]);
    expect(castPeopleFor(null)).toEqual([]);
  });

  it("dresses everyone by the styled outfits, ahead of the Kids' wardrobe and the ordered attire — never a Custom order", () => {
    const styled = [saree("deep teal"), kurta("ivory")];
    const sheet = castSheetFor(pack("human_duo_mixed"), { attireType: "traditional", seed: "IconoIQ", styled });
    expect(sheet.map((m) => m.short)).toEqual(["the woman in the deep teal saree", "the man in the ivory kurta"]);
    expect(sheet[0].description).toMatch(new RegExp(`^an Indian woman of about 25 with .+, wearing ${styled[0].outfit}$`));
    expect(sheet.map((m) => m.outfit)).toEqual(styled.map((s) => s.outfit));
    // The same faces as without the stylist — only the clothes change.
    const plain = castSheetFor(pack("human_duo_mixed"), { attireType: "traditional", seed: "IconoIQ" });
    expect(sheet.map((m) => m.description.split(", wearing")[0])).toEqual(plain.map((m) => m.description.split(", wearing")[0]));

    const kids = castSheetFor(pack("kids_duo_mixed"), { attireType: "shirt_pant", seed: "Little Stars", styled: [
      { colour: "red", garment: "pinafore", outfit: "a neat red pinafore over a crisp white half-sleeve shirt, white socks and black school shoes" },
      { colour: "yellow", garment: "school shirt", outfit: "a neat yellow school shirt tucked into navy shorts, white socks and black school shoes" },
    ] });
    expect(kids.map((m) => m.short)).toEqual(["the girl in the red pinafore", "the boy in the yellow school shirt"]);

    const custom = castSheetFor(pack("human_duo_mixed"), { attireType: "custom", customAttire: "white kurtas", seed: "x", styled });
    expect(custom[0].description).toContain("exactly this outfit: white kurtas");
    // A styled list that does not fit the cast is ignored.
    expect(castSheetFor(pack("human_duo_mixed"), { attireType: "traditional", seed: "IconoIQ", styled: [styled[0]] })).toEqual(plain);
  });

  it("without the stylist, grown-ups wear the brand palette's colours — two different ones", () => {
    const red = castSheetFor(pack("human_duo_mixed"), { attireType: "traditional", seed: "x", theme: { brandColours: "Red, white and gold" } });
    expect(red.map((m) => m.short)).toEqual(["the woman in the red saree", "the man in the gold kurta"]);
    const one = castSheetFor(pack("human_duo_female"), { attireType: "professional", seed: "x", theme: { brandColours: "Navy blue" } });
    expect(one[0].short).toBe("the woman in the navy blue suit");
    expect(one[1].short).not.toBe(one[0].short);
    // White, black and cream stay accents; with no wearable colour the seeded pair is kept.
    expect(castSheetFor(pack("human_duo_mixed"), { attireType: "traditional", seed: "x", theme: { brandColours: "Black and white" } }))
      .toEqual(castSheetFor(pack("human_duo_mixed"), { attireType: "traditional", seed: "x" }));
  });

  it("writes the WARDROBE line in the sheet's own words, for a pair and for a lone presenter", () => {
    const sheet = castSheetFor(pack("human_duo_mixed"), { attireType: "traditional", seed: "IconoIQ", styled: [saree("deep teal"), kurta("ivory")] });
    expect(castWardrobeLine(sheet)).toBe(`the woman on the left wears ${saree("deep teal").outfit}; the man on the right wears ${kurta("ivory").outfit}`);
    const solo = castSheetFor(pack("normal_female"), { attireType: "traditional", seed: "x" });
    expect(castWardrobeLine(solo)).toMatch(/^the woman wears a designer silk saree in /);
    expect(kidsWardrobeLine(sheet)).toBe("");
    expect(castWardrobeLine([])).toBe("");
  });
});
