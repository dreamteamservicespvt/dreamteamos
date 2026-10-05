import { describe, it, expect } from "vitest";
import { getCharacterPack } from "@/services/characterPacks";
import {
  brandColoursIn, castSheetBlock, castSheetFor, kidsThemeOf, kidsWardrobeLine, themeTextOf,
} from "@/utils/castSheet";

/**
 * The Kids, dressed for the ad (owner, 2026-10-05): "for the kids videos the girl and boy are always
 * getting the same type of dress". They wore one outfit per attire choice — a knee-length dress with a
 * white collar and a shirt tucked into navy trousers (or a langa and a kurta) — for a school, a cricket
 * academy and a temple alike. Now the business, the video's concept and the brand colours choose it:
 *
 *   • a festival ad, a temple, a jeweller or a silk house → silk langa and kurta, whatever the attire;
 *   • "Matches the ad" (the old Smart casual) → the theme's own clothes: a school's uniform in its
 *     colours, a sports shop's jersey, a birthday's party wear …; "Traditional" stays ethnic;
 *   • "Custom" is the team's words, untouched; the adults are not changed;
 *   • the same client is dressed the same way on a regenerate; two children of one kind never wear the
 *     same thing (unless it is a uniform, when their hair tells them apart);
 *   • the frame's WARDROBE line says exactly what the cast sheet says;
 *   • an address or a brand palette never decides the theme.
 */

const pack = (id: string) => getCharacterPack(id)!;

describe("what a children's ad is about", () => {
  it("reads a festival first, then the video and the business, then the wider brief", () => {
    expect(kidsThemeOf({ festival: "Diwali", text: "cricket academy" })).toBe("festive");
    expect(kidsThemeOf({ text: "Sri Chaitanya School — admissions open" })).toBe("school");
    expect(kidsThemeOf({ text: "Annadanam at the temple" })).toBe("festive");
    expect(kidsThemeOf({ text: "Lakshmi Jewellers" })).toBe("festive");
    expect(kidsThemeOf({ text: "Birthday wishes" })).toBe("party");
    expect(kidsThemeOf({ text: "cricket and football coaching" })).toBe("sports");
    expect(kidsThemeOf({ text: "kids wear showroom" })).toBe("fashion");
    expect(kidsThemeOf({ text: "children's dental clinic" })).toBe("health");
    expect(kidsThemeOf({ text: "mobile phones and laptops" })).toBe("tech");
    expect(kidsThemeOf({ text: "gated community villas" })).toBe("outing");
    expect(kidsThemeOf({ text: "family biryani restaurant" })).toBe("food");
    expect(kidsThemeOf({ text: "Sharma & Sons" })).toBe("everyday");
    expect(kidsThemeOf(null)).toBe("everyday");
    // The video's words win over the wider brief: a restaurant that also caters birthdays is a restaurant.
    expect(kidsThemeOf({ text: "family biryani restaurant", background: "we also cater birthday parties" })).toBe("food");
    expect(kidsThemeOf({ text: "Sharma & Sons", background: "we also cater birthday parties" })).toBe("party");
  });

  it("never takes the theme from an address, a contact line or the brand palette", () => {
    const text = themeTextOf(
      {
        businessName: "Rice Bowl",
        "Main Services": ["Biryani", "Meals"],
        Address: "Opp. Govt High School, Temple Street",
        "Brand Color Palette": "gold and maroon",
        contact: { phone: "98765 43210", landmark: "near the cricket ground" },
      },
      "Address: near Sai temple\nLandmark: opposite the school\nWe serve the best biryani in town",
    );
    expect(text).toMatch(/Biryani/);
    expect(text).toMatch(/best biryani/);
    expect(text).not.toMatch(/school|temple|gold|cricket/i);
    expect(kidsThemeOf({ background: text })).toBe("food");
  });

  it("reads colour words from a palette, in its order, once each", () => {
    expect(brandColoursIn("Navy blue, golden yellow and white (#ffffff)")).toEqual(["navy blue", "gold", "yellow", "white"]);
    expect(brandColoursIn("Red & Gold")).toEqual(["red", "gold"]);
    expect(brandColoursIn("#ff0000")).toEqual([]);
    expect(brandColoursIn(undefined)).toEqual([]);
  });
});

describe("the children's clothes", () => {
  it("puts a school's children in its uniform, in the school's colours", () => {
    const sheet = castSheetFor(pack("kids_duo_mixed"), {
      attireType: "shirt_pant", seed: "Sri Chaitanya School",
      theme: { text: "Sri Chaitanya School admissions open", brandColours: "Navy blue and gold" },
    });
    expect(sheet.map((m) => m.short)).toEqual(["the girl in the navy blue school uniform", "the boy in the navy blue school uniform"]);
    for (const m of sheet) expect(m.outfit).toMatch(/school uniform — a crisp white half-sleeve shirt.+navy blue-and-gold striped tie/);
    expect(sheet[0].outfit).toMatch(/pinafore|pleated skirt/);
    expect(sheet[1].outfit).toMatch(/shorts|trousers/);
  });

  it("gives a sports academy's children the team kit, and a birthday party wear in two colours", () => {
    const sports = castSheetFor(pack("kids_duo_boys"), {
      attireType: "shirt_pant", seed: "Champions Cricket Academy", theme: { text: "cricket coaching", brandColours: "red and white" },
    });
    for (const m of sports) expect(m.outfit).toMatch(/^a red (sports jersey with white trim|zip-up track jacket with white stripes)/);
    // Two boys in one kit are told apart by their hair.
    expect(sports[0].short).not.toBe(sports[1].short);
    expect(sports[0].short).toMatch(/^the boy with .+ in the red (jersey|tracksuit)$/);

    const party = castSheetFor(pack("kids_duo_girls"), { attireType: "shirt_pant", seed: "Cake Studio", theme: { text: "Birthday wishes" } });
    expect(party[0].outfit).not.toBe(party[1].outfit);
    expect(party.map((m) => m.short).every((s) => /party (frock|top)$/.test(s))).toBe(true);
  });

  it("dresses a festival, a temple or a jeweller's children in silk, whatever the attire", () => {
    const diwali = castSheetFor(pack("kids_duo_mixed"), { attireType: "shirt_pant", seed: "x", theme: { festival: "Diwali", brandColours: "orange, purple" } });
    expect(diwali[0].outfit).toMatch(/orange/);
    expect(diwali[0].outfit).toMatch(/pattu langa|lehenga choli|anarkali frock/);
    expect(diwali[1].outfit).toMatch(/purple/);
    expect(diwali[1].outfit).toMatch(/kurta/);
    // "an orange", never "a orange".
    for (const m of diwali) expect(m.outfit).not.toMatch(/\ba (orange|emerald|olive|ivory|aqua)\b/);

    const temple = castSheetFor(pack("kids_duo_mixed"), { attireType: "traditional", seed: "y", theme: { text: "Annadanam at the temple", brandColours: "maroon and gold" } });
    expect(temple[0].outfit).toBe("a maroon silk pattu langa — a long skirt with a matching blouse and a gold zari border — and small gold earrings");
    expect(temple[1].outfit).toMatch(/^a gold silk kurta with a cream dhoti \(panche\)/);
  });

  it("keeps a Custom order in the team's own words, and never touches the adults", () => {
    const custom = castSheetFor(pack("kids_duo_mixed"), {
      attireType: "custom", customAttire: "white lab coats over school uniforms", seed: "x", theme: { text: "school" },
    });
    expect(custom.every((m) => m.description.endsWith("wearing exactly this outfit: white lab coats over school uniforms"))).toBe(true);

    const adults = castSheetFor(pack("human_duo_female"), { attireType: "traditional", seed: "Sri Lakshmi Silks", theme: { text: "school" } });
    expect(adults.every((m) => /saree/.test(m.description))).toBe(true);
    expect(adults).toEqual(castSheetFor(pack("human_duo_female"), { attireType: "traditional", seed: "Sri Lakshmi Silks" }));
  });

  it("dresses the same client the same way every time, and different clients differently", () => {
    const opts = { attireType: "shirt_pant", seed: "Green Valley Villas", theme: { text: "villas", brandColours: "green" } };
    expect(castSheetFor(pack("kids_duo_mixed"), opts)).toEqual(castSheetFor(pack("kids_duo_mixed"), opts));
    const garments = new Set(
      ["Ravi Stores", "Sai Traders", "Om Agencies", "Kiran & Co", "Lucky Mart", "Star Enterprises", "Vijaya Stores", "Ganesh Traders"]
        .map((seed) => castSheetFor(pack("kids_duo_mixed"), { attireType: "shirt_pant", seed })[0].short.replace(/^the girl in the [\w ]+? (?=dress|frock|top)/, "")),
    );
    expect(garments.size).toBeGreaterThan(1);
  });

  it("never puts a child in a saree, a suit or a blazer", () => {
    for (const id of ["kids_duo_mixed", "kids_duo_girls", "kids_duo_boys"]) {
      for (const text of ["school", "temple", "birthday", "cricket", "kids wear", "clinic", "mobiles", "villas", "biryani", "shop"]) {
        for (const attireType of ["traditional", "shirt_pant"]) {
          for (const m of castSheetFor(pack(id), { attireType, seed: text, theme: { text } })) {
            expect(m.description, `${id} ${text} ${attireType}`).not.toMatch(/\b(saree|suit|blazer)\b/i);
            expect(m.description).toMatch(/child-sized/);
          }
        }
      }
    }
  });
});

describe("the frame's WARDROBE line", () => {
  it("says exactly what the cast sheet says, child by child", () => {
    const sheet = castSheetFor(pack("kids_duo_mixed"), { attireType: "shirt_pant", seed: "s", theme: { text: "school", brandColours: "maroon" } });
    const line = kidsWardrobeLine(sheet);
    expect(line).toBe(`the girl on the left wears ${sheet[0].outfit}; the boy on the right wears ${sheet[1].outfit}`);
    for (const m of sheet) expect(castSheetBlock(sheet)).toContain(m.outfit!);
    expect(kidsWardrobeLine([])).toBe("");
    // Adults get no such line — their WARDROBE stays the ordered attire.
    expect(kidsWardrobeLine(castSheetFor(pack("human_duo_mixed"), { attireType: "traditional", seed: "x" }))).toBe("");
  });
});
