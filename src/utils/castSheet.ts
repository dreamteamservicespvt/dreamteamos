/**
 * The cast sheet — one fixed description of every INVENTED person in an ad, written once, in code.
 *
 * ── Why this exists (2026-10-01) ─────────────────────────────────────────────────────────────
 * The special-category pipeline was built for famous characters: the frame prompt says "name them,
 * never describe them", because "Motu" already carries his face, build and clothes. For the human
 * duos the same rule handed the image generator two ROLE LABELS — "Friend" and "Host" — and nothing
 * else, so every frame invented two new people: a different face, age, hair and outfit in every
 * clip, and the video prompts could only "lock the faces in the attached frame" that already
 * disagreed. A person nobody has seen before needs a description, and the same description in every
 * frame, word for word.
 *
 * So each invented person (Normal Ad presenters, the human duos, the Kids) gets ONE line here —
 * age, face, skin, hair, the ordered outfit in one exact colour — chosen deterministically from the
 * business, so a regenerated kit casts the same people and a different client gets different ones.
 * Code stamps it into every frame prompt (withCastSheet), and the video prompt names each speaker by
 * how they look ("the woman in the teal saree") instead of by a label the video model cannot see.
 * The Kids are DRESSED FOR THE AD (2026-10-05) — its theme, a festival, the brand colours — rather
 * than in one fixed outfit per attire choice; see "The Kids, dressed for the ad" below.
 *
 * Since the same day EVERY invented person is first dressed by the wardrobe stylist (`styled`: a model
 * call that sees the logo, checked by utils/castWardrobe) — the owner: "the girl and the boy always get
 * the same outfit; relate them to the video, the business and the logo". The outfits written here are
 * what a run falls back on when the stylist cannot be used: the Kids dressed for the ad, the grown-ups in
 * the ordered attire in the brand palette's colours when the extraction found one.
 *
 * Pure — no React, no Firestore, no model call — so it is unit-tested.
 */
import type { CharacterPack } from "@/services/characterPacks";
import type { CastPerson, StyledOutfit } from "./castWardrobe";

export type CastPosition = "LEFT" | "RIGHT" | "CENTRE";

export interface CastSheetMember {
  /** The pack character's key ("friend", "girl", "presenter"). */
  key: string;
  /** Where they stand in every frame — characters[0] LEFT, characters[1] RIGHT, a lone presenter CENTRE. */
  position: CastPosition;
  /** How the video prompt names them: "the woman in the teal saree". */
  short: string;
  /** The full line every frame carries. */
  description: string;
  /** Just the outfit, for the WARDROBE line that must say the same thing (castWardrobeLine, 2026-10-05). */
  outfit?: string;
}

/**
 * What the ad is about, so the CHILDREN can be dressed for it (2026-10-05).
 *
 * Read only for the Kids entries — the adults keep the attire the team ordered, in a colour of the
 * pair. All optional: with nothing here the children are still dressed differently per client (seeded).
 */
export interface WardrobeTheme {
  /**
   * What this video is about and what the business does, in a few words — the scene plan's motive and
   * setting, the core message's "what they do", the business name. Read first.
   */
  text?: string;
  /**
   * The wider brief (the extracted business details, the team's BUSINESS CONTENT), read only when `text`
   * names no theme — a restaurant that also "caters birthday parties" is still a restaurant. Never the
   * brand palette ("gold" in a palette is not a jeweller) nor an address ("opp. Govt school" is not a
   * school) — `themeTextOf` leaves both out.
   */
  background?: string;
  /** The festival of a festival ad — the children are dressed for it. */
  festival?: string;
  /** The client's brand colours as the extraction wrote them ("Red, white and gold") — the outfits' colours. */
  brandColours?: string;
}

/** The heading stamped onto every frame prompt — see withCastSheet. */
export const CAST_SHEET_HEADING = "CAST SHEET";

type Kind = "woman" | "man" | "girl" | "boy";

const LOOKS: Record<Kind, string[]> = {
  woman: [
    "a soft oval face, warm wheatish skin, large dark-brown eyes and long natural black hair in a loose low side braid",
    "a heart-shaped face, fair-wheatish skin, expressive dark eyes and long straight black hair worn open past the shoulders",
    "a round face with high cheekbones, medium-brown skin, bright dark eyes and wavy black hair tied in a neat low bun",
    "a long oval face, dusky skin, almond-shaped dark eyes and shoulder-length black hair with soft waves",
    "a gently squared face with a warm smile, golden-wheatish skin, dark eyes and long black hair in a sleek high ponytail",
  ],
  man: [
    "a strong jawline, medium-brown skin, a neatly trimmed short black beard and short side-parted black hair",
    "an oval face, wheatish skin, clean-shaven, with short neatly combed black hair and a warm smile",
    "a square face, dusky skin, a groomed thin moustache and short textured black hair",
    "a long face with defined cheekbones, fair-wheatish skin, light stubble and short black hair swept back",
    "a round friendly face, medium-brown skin, a short boxed beard and close-cropped black hair",
  ],
  girl: [
    "a round cheerful face, wheatish skin, big bright eyes and two neat black plaits tied with small ribbons",
    "an oval face, medium-brown skin, sparkling dark eyes and shoulder-length black hair held back with a clip",
    "a heart-shaped face, fair-wheatish skin, a bright gap-toothed smile and a short black bob with a fringe",
    "a round face, dusky skin, bright curious eyes and a single long black braid",
  ],
  boy: [
    "a round face, wheatish skin, big curious eyes and short neatly combed black hair",
    "an oval face, medium-brown skin, a wide grin and short spiky black hair",
    "a square face, dusky skin, bright eyes and a short side-parted black haircut",
    "a round face, fair-wheatish skin, dimples and slightly wavy short black hair",
  ],
};

/** Two colours that read as clearly different on screen, so a viewer never confuses the pair. */
const COLOUR_PAIRS: [string, string][] = [
  ["deep maroon", "teal"],
  ["royal blue", "mustard yellow"],
  ["emerald green", "peach"],
  ["deep purple", "cream"],
  ["navy blue", "coral"],
  ["bottle green", "rose pink"],
  ["burnt orange", "sky blue"],
];

/** "a red", "an orange", "an emerald green" — the article a colour takes. */
const an = (colour: string): string => `${/^[aeiou]/i.test(colour) ? "an" : "a"} ${colour}`;

/** The outfit for the ordered attire, with its garment noun for the short name. */
function outfitFor(kind: Kind, attireType: string | undefined, customAttire: string | undefined, colour: string): { outfit: string; garment: string } {
  const custom = (customAttire || "").trim();
  if (attireType === "custom") {
    return { outfit: custom ? `exactly this outfit: ${custom}` : "the outfit described in the client's brief", garment: "" };
  }
  switch (kind) {
    case "woman":
      if (attireType === "traditional") return { outfit: `a designer silk saree in ${colour} with a modest elbow-length blouse and tasteful gold jewellery`, garment: "saree" };
      if (attireType === "shirt_pant") return { outfit: `a crisp ${colour} formal shirt tucked into dark tailored trousers`, garment: "shirt" };
      return { outfit: `a tailored ${colour} formal suit — structured blazer, crisp white inner shirt and slim trousers`, garment: "suit" };
    case "man":
      if (attireType === "traditional") return { outfit: `${an(colour)} silk kurta with a cream Nehru jacket and churidar`, garment: "kurta" };
      if (attireType === "shirt_pant") return { outfit: `a crisp ${colour} formal shirt tucked into dark trousers with a leather belt`, garment: "shirt" };
      return { outfit: `a tailored ${colour} formal suit with a crisp white shirt`, garment: "suit" };
    case "girl":
      if (attireType === "traditional") return { outfit: `${an(colour)} silk pattu langa — a long skirt with a matching blouse — and small gold earrings`, garment: "pattu langa" };
      return { outfit: `a neat knee-length ${colour} dress with a white collar and clean sandals`, garment: "dress" };
    case "boy":
      if (attireType === "traditional") return { outfit: `${an(colour)} kurta with a white pyjama`, garment: "kurta" };
      return { outfit: `a neat ${colour} half-sleeve shirt tucked into navy trousers, with clean shoes`, garment: "shirt" };
  }
}

/* ── The Kids, dressed for the ad (owner, 2026-10-05) ──────────────────────────────────────────── */

/*
  ── Why ──────────────────────────────────────────────────────────────────────────────────────────
  "For the kids videos the girl and boy are always getting the same type of dress" — the owner. The
  children got ONE outfit per attire choice — a knee-length dress with a white collar and a half-sleeve
  shirt tucked into navy trousers (or a langa and a kurta), for a school, a toy shop, a cricket academy
  and a temple's annadanam alike — and only its colour changed, picked from a fixed list by the business
  name. The owner's call: the outfit follows the ad — its business, its concept and the brand colours.

  So the theme is read from what the business does and what THIS video is about (a festival ad is
  dressed for its festival), the garment comes from that theme's wardrobe, and the colours come from
  the brand palette when the extraction found one. "Traditional" keeps them in ethnic wear (its style
  and colour still follow the ad); "Smart casual" — shown as "Matches the ad" — lets the theme choose
  (a school's children wear its uniform, a sports shop's a jersey); "Custom" is the team's own words,
  untouched. Seeded like the faces, so a regenerated kit dresses the same children the same way.
*/

/** What a children's ad is about, as far as their clothes go. */
export type KidsTheme = "festive" | "school" | "sports" | "party" | "fashion" | "health" | "tech" | "outing" | "food" | "everyday";

/**
 * The words that say what an ad is about, most telling first — the first theme with a match wins. A
 * school's sports day is still a school (uniforms); a jeweller's or a silk house's children wear silk.
 */
const KIDS_THEME_WORDS: [KidsTheme, RegExp][] = [
  ["school", /\b(schools?|tuitions?|coaching|kindergarten|play ?schools?|pre-?schools?|montessori|vidyalaya[m]?|academy|abacus|vedic maths|stationery|education(al)?|learning cent(re|er)|classes)\b/i],
  ["festive", /\b(temples?|pooja|puja|devotional|annadanam|weddings?|marriages?|kalyana|jewel{1,2}e?ry|jewel{1,2}ers?|gold ?smiths?|silks?|sarees?|pattu|ethnic wear|traditional wear|sweets?|mithai|festivals?)\b/i],
  ["sports", /\b(sports?|cricket|football|badminton|tennis|swimming|karate|taekwondo|martial arts?|kung ?fu|skating|athletics?|fitness|gym|yoga|cycling|cycles?)\b/i],
  ["party", /\b(birthdays?|party|parties|cakes?|bakery|bakers|ice ?creams?|chocolates?|toys?|toy ?store|games|play ?zone|play ?area|gifts?|balloons?|events?|celebrations?)\b/i],
  ["fashion", /\b(kids'? ?wear|clothing|clothes|fashions?|boutiques?|garments?|readymades?|textiles?|apparel|footwear|shoes)\b/i],
  ["health", /\b(hospitals?|clinics?|dental|dentists?|doctors?|paediatric|pediatric|child ?care|pharmacy|medicals?|health|eye ?care|opticals?)\b/i],
  ["tech", /\b(mobiles?|phones?|electronics|computers?|laptops?|coding|robotics|gaming|software|tablets?)\b/i],
  ["outing", /\b(real estate|villas?|apartments?|flats|plots?|layouts?|properties|builders|resorts?|travels?|tours?|holidays?|water ?parks?|amusement)\b/i],
  ["food", /\b(restaurants?|biryani|food|hotels?|tiffins?|cafes?|café|meals|juices?|pizzas?|burgers?|snacks|mandi|dhaba|kitchens?)\b/i],
];

/**
 * The theme of a children's ad: a festival ad is festive; otherwise the theme the video and the business
 * name mention FIRST, then the one the wider brief mentions first; else everyday.
 *
 * First mention, not a fixed order: "cricket and football coaching" is a sports academy though
 * "coaching" is also a tuition word, and "a school with sports facilities" is a school. The text is
 * written motive first, so the video's concept leads (a toy shop's Diwali greeting is festive).
 */
export function kidsThemeOf(theme: WardrobeTheme | null | undefined): KidsTheme {
  if (theme?.festival?.trim()) return "festive";
  for (const text of [theme?.text || "", theme?.background || ""]) {
    let best: { kind: KidsTheme; at: number } | null = null;
    for (const [kind, words] of KIDS_THEME_WORDS) {
      const at = text.search(words);
      if (at >= 0 && (!best || at < best.at)) best = { kind, at };
    }
    if (best) return best.kind;
  }
  return "everyday";
}

/** Keys and lines that say where the business is, how to reach it or how it looks — never what it is. */
const NOT_A_THEME_KEY = /colou?r|palette|design|font|logo|address|location|landmark|map|phone|mobile|contact|whatsapp|e-?mail|website|social|handle/i;
const NOT_A_THEME_LINE = /^\s*[-•*]?\s*(address|landmark|location|near|opp(osite)?\.?|beside|behind|contact|phone|mobile|cell|whatsapp|e-?mail|website|brand colou?rs?|colou?rs?)\b/i;

/**
 * The words of a business's details that can say what it is: every line of the team's typed brief
 * except its address and contact lines — FIRST, because BUSINESS CONTENT is the authoritative account
 * of the business — then every value of the extracted details except its colours, logo, address and
 * contact keys. For `WardrobeTheme.background`, where the theme mentioned first wins.
 */
export function themeTextOf(details: unknown, brief = ""): string {
  const parts: string[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 4 || node == null) return;
    if (typeof node === "string") { parts.push(node); return; }
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (!NOT_A_THEME_KEY.test(k)) walk(v, depth + 1);
      }
    }
  };
  walk(details, 0);
  const lines = brief.split(/\r?\n/).filter((l) => l.trim() && !NOT_A_THEME_LINE.test(l));
  return [...lines, ...parts.filter((p) => !NOT_A_THEME_LINE.test(p))].join("\n").slice(0, 4000);
}

/** Colour words in the order a palette might name them — two-word names first, so "navy blue" is not "blue". */
const COLOUR_WORDS = [
  "royal blue", "navy blue", "sky blue", "baby blue", "bottle green", "emerald green", "olive green", "mint green",
  "lime green", "forest green", "dark green", "rose pink", "baby pink", "hot pink", "mustard yellow", "lemon yellow",
  "burnt orange", "deep purple",
  "navy", "maroon", "burgundy", "wine", "red", "crimson", "scarlet", "blue", "teal", "turquoise", "cyan", "aqua",
  "green", "emerald", "olive", "mint", "yellow", "mustard", "gold", "golden", "orange", "saffron", "peach", "coral",
  "pink", "magenta", "purple", "violet", "lavender", "lilac", "brown", "beige", "cream", "ivory",
  "white", "black", "grey", "gray", "silver",
];

/**
 * The colours a brand palette names, in its own order, once each ("golden" read as gold). A hex code
 * names nothing a frame can use; only colour words count.
 */
export function brandColoursIn(palette: string | null | undefined): string[] {
  let text = ` ${(palette || "").toLowerCase()} `;
  const found: { at: number; colour: string }[] = [];
  for (const word of COLOUR_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      found.push({ at: m.index, colour: word === "golden" ? "gold" : word === "gray" ? "grey" : word });
      // Blank it out so "blue" is not found again inside "navy blue".
      text = text.slice(0, m.index) + " ".repeat(word.length) + text.slice(m.index + word.length);
    }
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.colour))];
}

/** Colours a child is not dressed in from head to toe — they stay as trims and accents. */
const ACCENT_ONLY = new Set(["white", "black", "grey", "silver", "cream", "ivory", "beige"]);

/** One outfit: what is written, and the garment the video prompt names them by. A = main colour, B = accent. */
type KidOutfit = { make: (a: string, b: string) => string; garment: string };
type KidWardrobe = { girl: KidOutfit[]; boy: KidOutfit[]; shared?: boolean };

const o = (garment: string, make: (a: string, b: string) => string): KidOutfit => ({ garment, make });

/** Every theme's clothes for the children. `shared`: both wear the same colours (a uniform, a team kit). */
const KIDS_WARDROBE: Record<Exclude<KidsTheme, "festive">, KidWardrobe> = {
  school: {
    shared: true,
    girl: [
      o("school uniform", (a, b) => `a neat school uniform — a crisp white half-sleeve shirt, ${an(a)} pinafore dress, ${an(a)}-and-${b} striped tie, white socks and black school shoes`),
      o("school uniform", (a, b) => `a neat school uniform — a crisp white half-sleeve shirt, ${an(a)} pleated skirt, ${an(a)}-and-${b} striped tie, white socks and black school shoes`),
    ],
    boy: [
      o("school uniform", (a, b) => `a neat school uniform — a crisp white half-sleeve shirt, ${a} shorts, ${an(a)}-and-${b} striped tie, white socks and black school shoes`),
      o("school uniform", (a, b) => `a neat school uniform — a crisp white half-sleeve shirt tucked into ${a} trousers, ${an(a)}-and-${b} striped tie and black school shoes`),
    ],
  },
  sports: {
    shared: true,
    girl: [
      o("jersey", (a, b) => `${an(a)} sports jersey with ${b} trim, matching ${a} track shorts, white socks and sports shoes, hair tied back`),
      o("tracksuit", (a, b) => `${an(a)} zip-up track jacket with ${b} stripes over a white T-shirt, ${a} track pants and sports shoes, hair tied back`),
    ],
    boy: [
      o("jersey", (a, b) => `${an(a)} sports jersey with ${b} trim, matching ${a} shorts, white socks and sports shoes`),
      o("tracksuit", (a, b) => `${an(a)} zip-up track jacket with ${b} stripes over a white T-shirt, ${a} track pants and sports shoes`),
    ],
  },
  party: {
    girl: [
      o("party frock", (a) => `a twirly knee-length ${a} party frock with a soft tulle skirt and a matching hairband, with shiny shoes`),
      o("party top", (a, b) => `a sparkly ${a} party top with a flared ${b} skirt, a small hair clip and ballet flats`),
    ],
    boy: [
      o("waistcoat", (a, b) => `a smart ${a} waistcoat over a crisp ${b === "white" ? "light blue" : "white"} shirt, dark trousers and polished shoes`),
      o("bow tie", (a) => `${an(a)} bow tie with a crisp white shirt, ${a} braces, dark trousers and polished shoes`),
    ],
  },
  fashion: {
    girl: [
      o("denim jacket", (a) => `a trendy light denim jacket over ${an(a)} printed dress, with white sneakers`),
      o("co-ord set", (a) => `a stylish ${a} co-ord set — a printed top and matching flared pants — with white sneakers`),
    ],
    boy: [
      o("bomber jacket", (a) => `a trendy ${a} bomber jacket over a white graphic T-shirt, slim jeans and white sneakers`),
      o("printed shirt", (a) => `a stylish ${a} printed shirt worn open over a white T-shirt, beige chinos and sneakers`),
    ],
  },
  health: {
    girl: [o("frock", (a) => `a soft ${a} cotton frock with a small round collar and clean sandals`)],
    boy: [o("polo T-shirt", (a) => `a soft ${a} cotton polo T-shirt with beige shorts and clean sandals`)],
  },
  tech: {
    girl: [
      o("hoodie", (a) => `${an(a)} hoodie over a white T-shirt, blue jeans and sneakers`),
      o("pinafore", (a, b) => `${an(a)} denim pinafore over ${an(b === a ? "white" : b)} striped T-shirt, with sneakers`),
    ],
    boy: [
      o("hoodie", (a) => `${an(a)} hoodie over a graphic T-shirt, jeans and sneakers`),
      o("overshirt", (a) => `${an(a)} overshirt over a white round-neck T-shirt, jeans and sneakers`),
    ],
  },
  outing: {
    girl: [
      o("summer dress", (a) => `a breezy ${a} floral summer dress with a sun hat and sandals`),
      o("capri set", (a) => `${an(a)} printed top with matching capri pants and sandals`),
    ],
    boy: [
      o("polo T-shirt", (a) => `${an(a)} polo T-shirt with beige cotton shorts, a cap and sneakers`),
      o("checked shirt", (a) => `${an(a)} checked half-sleeve shirt with cargo shorts and sneakers`),
    ],
  },
  food: {
    girl: [
      o("printed top", (a, b) => `a cheerful ${a} printed top with ${an(b === a ? "denim" : b)} skirt and sandals`),
      o("frock", (a) => `${an(a)} smocked cotton frock with sandals`),
    ],
    boy: [
      o("graphic T-shirt", (a) => `a cheerful ${a} graphic T-shirt with denim shorts and sneakers`),
      o("checked shirt", (a) => `${an(a)} half-sleeve checked shirt with jeans and sneakers`),
    ],
  },
  everyday: {
    girl: [
      o("dress", (a) => `a neat knee-length ${a} dress with a white collar and clean sandals`),
      o("frock", (a) => `${an(a)} smocked frock with a white cardigan and ballet flats`),
      o("top and skirt", (a) => `${an(a)} top with a flared denim skirt and sandals`),
    ],
    boy: [
      o("shirt", (a) => `a neat ${a} half-sleeve shirt tucked into navy trousers, with clean shoes`),
      o("polo T-shirt", (a) => `${an(a)} polo T-shirt with beige chinos and sneakers`),
      o("checked shirt", (a) => `${an(a)} checked shirt with dark jeans and sneakers`),
    ],
  },
};

/** Ethnic wear — "Traditional", and what a festive ad's children wear when the attire leaves it to the ad. */
const KIDS_TRADITIONAL: KidWardrobe = {
  girl: [
    o("pattu langa", (a, b) => `${an(a)} silk pattu langa — a long skirt with a matching blouse and ${an(b)} zari border — and small gold earrings`),
    o("lehenga", (a, b) => `${an(a)} lehenga choli with ${b} embroidery and a light dupatta, with small gold earrings`),
    o("anarkali frock", (a, b) => `a long ${a} silk anarkali frock with ${an(b)} zari border and small gold earrings`),
  ],
  boy: [
    o("kurta", (a) => `${an(a)} kurta with a white pyjama`),
    o("dhoti and kurta", (a, b) => `${an(a)} silk kurta with a cream dhoti (panche) and ${an(b)} border`),
    o("Nehru jacket", (a, b) => `a cream kurta and churidar with a short ${a} Nehru jacket with ${b} buttons`),
  ],
};

/** Hair, as a few words — to tell two children of one kind apart when they are dressed alike. */
const HAIR_TAGS: Record<"girl" | "boy", string[]> = {
  girl: ["plaits", "a hair clip", "a bob", "a long braid"],
  boy: ["combed hair", "spiky hair", "side-parted hair", "wavy hair"],
};

/**
 * The two children's colours: main and accent for each, from the brand palette when it names wearable
 * colours, else a pair from the list. A uniform or a team kit is one set of colours for both.
 */
function kidColours(palette: string[], fallback: [string, string], shared: boolean): [string, string][] {
  const wearable = palette.filter((c) => !ACCENT_ONLY.has(c));
  const main1 = wearable[0] || fallback[0];
  const main2 = wearable.find((c) => c !== main1) || (fallback[0] === main1 ? fallback[1] : fallback.find((c) => c !== main1) || fallback[1]);
  const accentFor = (main: string) => palette.find((c) => c !== main) || (main === "gold" ? "white" : "gold");
  if (shared) return [[main1, accentFor(main1)], [main1, accentFor(main1)]];
  return [[main1, accentFor(main1)], [main2, accentFor(main2)]];
}

/** A temple, pooja or annadanam — silk langa and dhoti, the clothes a family wears to the temple. */
const TEMPLE_WORDS = /\b(temples?|pooja|puja|devotional|annadanam|gudi)\b/i;

/**
 * How each child of a Kids entry is dressed for this ad: the outfit, the garment the video prompt names,
 * and its main colour. Null for a Custom order — the team's words are used as they are (`outfitFor`).
 */
function dressKids(
  kinds: { kind: Kind }[],
  options: { attireType?: string; theme?: WardrobeTheme },
  seed: string,
  fallback: [string, string],
): { outfit: string; garment: string; colour: string }[] | null {
  if (options.attireType === "custom") return null;
  const theme = kidsThemeOf(options.theme);
  // A festive ad (a festival, a temple, a jeweller, a silk house) dresses them in silk whatever the attire.
  const traditional = options.attireType === "traditional" || theme === "festive";
  const wardrobe = traditional ? KIDS_TRADITIONAL : KIDS_WARDROBE[theme as Exclude<KidsTheme, "festive">];
  const colours = kidColours(brandColoursIn(options.theme?.brandColours), fallback, !!wardrobe.shared);
  const temple = traditional && TEMPLE_WORDS.test(`${options.theme?.text || ""}\n${options.theme?.background || ""}`);
  const chosen: KidOutfit[] = [];
  return kinds.map(({ kind }, i) => {
    const list = wardrobe[kind === "boy" ? "boy" : "girl"];
    let outfit = temple
      ? list[kind === "boy" ? 1 : 0]
      : list[hashOf(`${seed}|${theme}|${traditional ? "silk" : "ad"}|${kind}`) % list.length];
    // Two girls (or two boys) wear two different things — unless it is a uniform or a team kit.
    if (i > 0 && kinds[0].kind === kind && !wardrobe.shared && list.length > 1 && chosen[0] === outfit) {
      outfit = list[(list.indexOf(outfit) + 1) % list.length];
    }
    chosen.push(outfit);
    const [a, b] = colours[i] || colours[0];
    return { outfit: outfit.make(a, b), garment: outfit.garment, colour: a };
  });
}

/** A stable, well-spread number for a string (FNV-1a). */
function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Who each character of an invented-person pack is: woman / man / girl / boy, and their age. */
function kindsOf(pack: CharacterPack): { kind: Kind; age: number }[] | null {
  const n = pack.characters.length;
  const id = pack.id;
  if (pack.family === "kids") {
    if (/girls/.test(id)) return [{ kind: "girl", age: 10 }, { kind: "girl", age: 9 }];
    if (/boys/.test(id)) return [{ kind: "boy", age: 10 }, { kind: "boy", age: 9 }];
    return [{ kind: "girl", age: 9 }, { kind: "boy", age: 10 }];
  }
  if (pack.family === "human_duo") {
    if (/female/.test(id)) return [{ kind: "woman", age: 24 }, { kind: "woman", age: 27 }];
    if (/_male$/.test(id)) return [{ kind: "man", age: 28 }, { kind: "man", age: 32 }];
    return [{ kind: "woman", age: 25 }, { kind: "man", age: 30 }];
  }
  if (pack.family === "human" && !pack.usesClientFace && n === 1) {
    return [/(^|_)male$/.test(id) ? { kind: "man", age: 29 } : { kind: "woman", age: 23 }];
  }
  return null;
}

const NOUN: Record<Kind, string> = { woman: "Indian woman", man: "Indian man", girl: "Indian girl", boy: "Indian boy" };

const positionOf = (count: number, i: number): CastPosition => count === 1 ? "CENTRE" : i === 0 ? "LEFT" : "RIGHT";

/**
 * Who the wardrobe stylist dresses for this pack — each invented person's place, kind and age, in cast
 * sheet order — or [] when the pack invents nobody (a famous character, a deity, the owner's face).
 */
export function castPeopleFor(pack: CharacterPack | null | undefined): CastPerson[] {
  const kinds = pack ? kindsOf(pack) : null;
  return kinds ? kinds.map(({ kind, age }, i) => ({ position: positionOf(kinds.length, i), kind, age })) : [];
}

/**
 * The cast sheet for a pack whose people are invented — or [] for every pack whose identity comes
 * from elsewhere (a famous character, a deity, the owner's photograph, a custom description).
 *
 * `seed` is what makes the casting stable for one client and different for the next: the business's
 * name, falling back to anything that identifies the job.
 *
 * `styled` is the wardrobe stylist's checked answer (utils/castWardrobe), one outfit per person in this
 * order: it dresses everyone when it is given, ahead of the Kids' wardrobe and the ordered attire below.
 * A Custom order is never styled — the team's own words are the outfit.
 */
export function castSheetFor(
  pack: CharacterPack | null | undefined,
  options: { attireType?: string; customAttire?: string; seed?: string; theme?: WardrobeTheme; styled?: StyledOutfit[] | null } = {},
): CastSheetMember[] {
  if (!pack) return [];
  const kinds = kindsOf(pack);
  if (!kinds) return [];
  const seed = (options.seed || "").trim().toLowerCase() || pack.id;
  const h = hashOf(`${pack.id}|${seed}`);
  const [pairA, pairB] = COLOUR_PAIRS[h % COLOUR_PAIRS.length];
  /*
    The grown-ups' colours: the brand palette's first two wearable colours when the extraction found
    them (the owner: the outfits follow the logo), else the seeded pair — as before. A palette of one
    colour keeps the pair's other colour for the second person, so the two never match.
  */
  const brand = pack.family === "kids" ? [] : brandColoursIn(options.theme?.brandColours).filter((c) => !ACCENT_ONLY.has(c));
  const colourA = brand[0] ?? pairA;
  const colourB = brand.find((c) => c !== colourA) ?? (pairB !== colourA ? pairB : pairA);
  const used = new Map<Kind, number>();
  const styled = options.attireType !== "custom" && options.styled?.length === kinds.length ? options.styled : null;
  // The Kids are dressed for the ad (2026-10-05); the adults keep the ordered attire in the colours above.
  const kids = !styled && pack.family === "kids" ? dressKids(kinds, options, seed, [pairA, pairB]) : null;
  // Two children of one kind in the same uniform or kit read alike — their hair tells them apart.
  const alike = !!kids && kids.length === 2 && kinds[0].kind === kinds[1].kind
    && kids[0].garment === kids[1].garment && kids[0].colour === kids[1].colour;

  return kinds.map(({ kind, age }, i) => {
    const looks = LOOKS[kind];
    // Two people of the same kind never share a look: the second skips past the first's.
    const first = used.get(kind);
    const index = first === undefined
      ? hashOf(`${seed}|${kind}|${i}`) % looks.length
      : (first + 1 + (hashOf(`${seed}|${kind}|again`) % (looks.length - 1))) % looks.length;
    used.set(kind, index);
    const dressed = styled?.[i] ?? kids?.[i];
    const colour = dressed?.colour ?? (i === 0 ? colourA : colourB);
    const { outfit, garment } = dressed ?? outfitFor(kind, options.attireType, options.customAttire, colour);
    const position = positionOf(kinds.length, i);
    const hair = alike && (kind === "girl" || kind === "boy") ? ` with ${HAIR_TAGS[kind][index % HAIR_TAGS[kind].length]}` : "";
    const short = garment
      ? `the ${kind}${hair} in the ${colour} ${garment}`
      : position === "CENTRE" ? `the ${kind}` : `the ${kind} on the ${position.toLowerCase()}`;
    const child = kind === "girl" || kind === "boy";
    return {
      key: pack.characters[i]?.key ?? String(i),
      position,
      short,
      description: `${child ? "a real" : "an"} ${NOUN[kind]} of about ${age}${child ? ", child-sized," : ""} with ${looks[index]}, wearing ${outfit}`,
      outfit,
    };
  });
}

const KIND_OF = /^the (woman|man|girl|boy)\b/;

/**
 * The WARDROBE line in the cast sheet's own words — "the woman on the left wears …; the man on the right
 * wears …" (a lone presenter: "the woman wears …") — so the frame prompt's two descriptions of the
 * outfits can never disagree: a fixed "smart dress" line beside a sheet that says "school uniform" (the
 * Kids), or "a saree in a colour drawn from the brand palette" beside a sheet that says "deep teal" (every
 * cast, 2026-10-05). "" when there is no sheet.
 */
export function castWardrobeLine(members: CastSheetMember[]): string {
  return members
    .filter((m) => m.outfit && KIND_OF.test(m.short))
    .map((m) => `the ${m.short.match(KIND_OF)![1]}${m.position === "CENTRE" ? "" : ` on the ${m.position.toLowerCase()}`} wears ${m.outfit}`)
    .join("; ");
}

/** The WARDROBE line for the children of a cast (the Kids entries) — see castWardrobeLine. */
export function kidsWardrobeLine(members: CastSheetMember[]): string {
  return castWardrobeLine(members.filter((m) => /^the (girl|boy)\b/.test(m.short)));
}

/** The block every frame of the ad carries, word for word. */
export function castSheetBlock(members: CastSheetMember[]): string {
  if (members.length === 0) return "";
  const who = members.length === 1
    ? members[0].short.replace(/^the (\w+).*$/, "$1").toUpperCase()
    : members.every((m) => /^the (girl|boy)\b/.test(m.short)) ? "TWO CHILDREN" : "TWO PEOPLE";
  const lines = members.map((m) => `• ${m.position} — ${m.short}: ${m.description}`).join("\n");
  return `${CAST_SHEET_HEADING} — THE SAME ${who} IN EVERY CLIP, EXACTLY AS WRITTEN HERE:
${lines}
Never change a face, an age, a hairstyle, an outfit or a colour between clips${members.length > 1 ? ", and never swap their places" : ""}.`;
}

/** A finished frame prompt, guaranteed to carry the cast sheet. Idempotent. */
export function withCastSheet(prompt: string, block: string): string {
  if (!block || !prompt.trim() || prompt.includes(CAST_SHEET_HEADING)) return prompt;
  return `${prompt.trimEnd()}\n\n${block}`;
}

/**
 * The short names read back off a stamped frame prompt, in position order (LEFT, RIGHT, CENTRE) —
 * so a video prompt rebuilt later (a refine, a regenerate) names the SAME people the frames were made
 * with, whatever the form says now. [] when the prompt carries no cast sheet.
 */
export function castNamesFromFrames(framePrompts: string[] = []): string[] {
  const stamped = framePrompts.find((p) => p?.includes(CAST_SHEET_HEADING));
  if (!stamped) return [];
  const rows = [...stamped.matchAll(/^• (LEFT|RIGHT|CENTRE) — ([^:\n]+):/gm)];
  const order: Record<string, number> = { LEFT: 0, CENTRE: 0, RIGHT: 1 };
  return rows.sort((a, b) => order[a[1]] - order[b[1]]).map((r) => r[2].trim());
}
