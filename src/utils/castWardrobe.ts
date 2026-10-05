/**
 * The cast's clothes, chosen for THIS ad — its business, its video and its logo (owner, 2026-10-05).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 * "In the duo characters the girl and the boy always get the same outfit — we need them related to the
 * video context, the business context and the logo." The cast sheet (utils/castSheet) dressed every
 * invented person by the ordered attire alone: Professional put both people in "a tailored formal suit
 * with a crisp white shirt", Traditional was always a saree beside a kurta with a cream Nehru jacket, and
 * the colours came from a fixed list of seven pairs picked by the business name — and the frame prompt
 * then called those colours "final", overruling the brand-palette wording beside it. A hospital, a
 * jeweller and a gym got the same two outfits in maroon and teal, and the logo never counted.
 *
 * The owner's call: the ordered attire stays the STYLE — Traditional is ethnic, Professional is formal,
 * In-shirt & Pant is a shirt and trousers, Custom is the team's own words, untouched — and inside it a
 * stylist (prompts/castWardrobe: one fast Gemini call that SEES the logo) chooses each person's garment,
 * colour and accents from the business, the video and the logo, never the same outfit twice. This file
 * is the stylist's rule book and its checker: what each person may wear, and whether an answer can be
 * used. An answer that fails is dropped as a whole — a pair is styled together or not at all — and the
 * cast sheet's own outfits are used instead (utils/castSheet: the Kids dressed for the ad by code, the
 * adults in the ordered attire).
 *
 * Pure — no React, no Firestore, no model call — so it is unit-tested.
 */
import type { CastPosition } from "./castSheet";

export type CastKind = "woman" | "man" | "girl" | "boy";

/** One invented person the stylist dresses — where they stand and who they are. */
export interface CastPerson {
  position: CastPosition;
  kind: CastKind;
  age: number;
}

/** One person's clothes, as the cast sheet writes them. */
export interface StyledOutfit {
  /** The whole outfit as one phrase — "a deep teal Kanchipuram silk saree with a thin gold border, …". */
  outfit: string;
  /** The main garment's short noun, for the name the video prompt calls them by: "saree", "kurta". */
  garment: string;
  /** Its main colour in plain words: "deep teal". "the woman in the deep teal saree". */
  colour: string;
}

/** What one person may wear under the ordered attire: the stylist's brief and the checks on its answer. */
export interface StyleRule {
  /** The ordered style, in the words the stylist is given. */
  brief: string;
  /** The outfit must name a garment of the ordered style (each pattern, when there are several). */
  must: RegExp[];
  /** …and nothing outside it. */
  never: RegExp | null;
}

const isChild = (kind: CastKind) => kind === "girl" || kind === "boy";

/**
 * The ordered style for one person, or null when the stylist has no say — a Custom order is dressed in
 * the team's own words, exactly as written. A blank attire reads as Professional for an adult, as the
 * cast sheet's own outfits do, and as "Matches the ad" for a child.
 */
export function styleRuleFor(kind: CastKind, attireType?: string | null): StyleRule | null {
  if (attireType === "custom") return null;
  const female = kind === "woman" || kind === "girl";
  if (isChild(kind)) {
    if (attireType === "traditional") {
      return female
        ? {
            brief: "children's Indian ethnic wear (the ordered \"Traditional\"): a silk pattu langa (pavadai) with a matching blouse, a lehenga choli or a long anarkali frock — child-sized, small simple earrings at most",
            must: [/\b(langa|pavadai|lehenga|ghagra|chaniya|anarkali|salwar|churidar|kurti|kurta)\b/i],
            never: /\b(blazer|suits?|necktie)\b/i,
          }
        : {
            brief: "children's Indian ethnic wear (the ordered \"Traditional\"): a kurta with a pyjama or churidar, or a silk kurta with a dhoti (panche); a small Nehru jacket is optional — child-sized",
            must: [/\b(kurta|sherwani|dhoti|panche|pancha|veshti|jodhpuri)\b/i],
            never: /\b(blazer|suits?|necktie)\b/i,
          };
    }
    // "Matches the ad" (stored as shirt_pant) — and anything else ordered for a child.
    return {
      brief: "children's clothes chosen for THIS ad (the ordered \"Matches the ad\"): a school's ad a neat school uniform in the school's colours, a sports shop or academy a jersey or track kit, a birthday, cake or toy shop party wear, a festival, temple, jeweller or silk house a silk pattu langa / kurta, and smart everyday wear otherwise — child-sized and age-appropriate",
      must: [],
      never: /\b(blazer|suits?)\b/i,
    };
  }
  switch (attireType) {
    case "traditional":
      return female
        ? {
            brief: "a saree (the ordered \"Traditional (Designer Saree)\"): choose its weave (Kanchipuram, Banarasi, Gadwal, Uppada or Mangalagiri silk, cotton-silk, georgette…), its border and pallu, the elbow-length blouse and the jewellery for this business and this video",
            must: [/\b(saree|sari)\b/i],
            never: /\b(lehenga|salwar|kurti|blazer|suits?|trousers|jeans)\b/i,
          }
        : {
            brief: "Indian ethnic wear (the ordered \"Traditional\"): a kurta with churidar, pyjama or a dhoti (panche), with or without a Nehru jacket or an angavastram; a bandhgala or sherwani-style jacket only for a grand occasion",
            must: [/\b(kurta|sherwani|bandhgala|jodhpuri|dhoti|panche|pancha|veshti|mundu|angavastram)\b/i],
            never: /\b(saree|sari|blazer|suits?|necktie|tie|jeans)\b/i,
          };
    case "shirt_pant":
      return {
        brief: "a crisp formal shirt tucked into formal trousers (the ordered \"Professional (In-shirt & Pant)\") — no blazer, no suit, no jacket",
        must: [/\bshirt\b/i, /\b(trousers|pants|chinos)\b/i],
        never: /\b(blazer|suits?|jacket|saree|sari|kurta|jeans|t-?shirt)\b/i,
      };
    default:
      return female
        ? {
            brief: "formal business wear (the ordered \"Professional (Formal Suit)\"): a tailored blazer or pant-suit over a blouse or shell top, with formal trousers or a formal skirt to below the knee",
            must: [/\b(blazer|suit|pant-?suit|jacket)\b/i],
            never: /\b(saree|sari|lehenga|kurta|kurti|jeans|t-?shirt|hoodie)\b/i,
          }
        : {
            brief: "a formal suit (the ordered \"Professional (Formal Suit)\"): a tailored two- or three-piece suit, or a blazer with formal trousers, over a formal shirt; a tie or pocket square is optional",
            must: [/\b(suit|blazer)\b/i],
            never: /\b(saree|sari|kurta|dhoti|jeans|t-?shirt|hoodie)\b/i,
          };
  }
}

/* ── What nobody wears, whatever was ordered ───────────────────────────────────────────────────── */

/** Writing on clothes comes out as garbled letters, and the logo belongs on the wall, not a sleeve. */
const NO_TEXT_ON_CLOTHES = /\b(logos?|lettering|letters|text|slogans?|words?|name ?tags?|badges?|monograms?|emblems?|brand name|printed name)\b/i;
/** A profession's uniform makes a claim the business never made ("their doctor says…"). */
const NO_PROFESSION = /\b(lab coat|white coat|doctor'?s?|nurse'?s?|scrubs|stethoscope|aprons?|chef'?s?|police|army|military|overalls|hard ?hat|helmet)\b/i;
/** Adults wear no uniform at all; a child's school uniform is allowed (a school's ad). */
const NO_UNIFORM = /\buniforms?\b/i;
/** The modesty rules the frame prompts already carry. */
const NO_REVEALING = /\b(sleeveless|strapless|spaghetti|noodle[- ]?straps?|deep[- ]?(cut|neck|neckline|v)|plunging|backless|off[- ]?(the[- ])?shoulder|crop[- ]?top|midriff|mini[- ]?skirt|bikini|swim ?(suit|wear)|see[- ]?through|sheer|bodycon)\b/i;
/** An adult in shorts is not in any ordered style; a child may wear them. */
const NO_SHORTS = /\bshorts\b/i;
/** Never a wedding, a costume or a "couple" look — two people in a brand's ad, not a pair of twins. */
const NO_COSTUME = /\b(bridal|brides?|grooms?|costumes?|fancy[- ]dress|twinning|couple|identical|matching (outfits?|sets?|colou?rs?|clothes|look))\b/i;
/** A child: never a saree, heels or make-up. */
const NO_GROWN_UP = /\b(saree|sari|heels?|stilettos?|make-?up|lipstick|eyeliner)\b/i;

/* ── Colours ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * The words a garment colour may be built from. The colour is how the video prompt tells the two people
 * apart ("the woman in the deep teal saree"), so it must be a colour a viewer can name — never a hex code
 * nor "brand colour".
 */
const COLOUR_WORDS = new Set([
  "red", "maroon", "crimson", "scarlet", "burgundy", "wine", "rust", "brick", "cherry", "ruby", "vermilion",
  "orange", "saffron", "peach", "coral", "apricot", "tangerine", "amber",
  "yellow", "mustard", "gold", "golden", "lemon", "ochre", "turmeric", "haldi", "mango",
  "green", "emerald", "olive", "mint", "sage", "teal", "turquoise", "aqua", "cyan", "parrot", "jade", "pista", "pistachio", "leaf", "bottle",
  "blue", "navy", "royal", "sky", "indigo", "cobalt", "sapphire", "powder", "steel", "denim", "peacock", "ink", "midnight",
  "purple", "violet", "plum", "lavender", "lilac", "mauve", "magenta", "aubergine", "brinjal",
  "pink", "rose", "blush", "fuchsia", "rani", "onion", "salmon",
  "brown", "coffee", "chocolate", "tan", "camel", "beige", "khaki", "caramel", "copper", "bronze", "mocha", "taupe", "sand", "sandalwood",
  "cream", "ivory", "off-white", "white", "pearl", "champagne",
  "black", "charcoal", "grey", "gray", "silver", "graphite", "slate",
]);

/** True when the phrase is a plain, nameable colour: 1–3 words, at least one of them a colour word. */
export function isNameableColour(colour: string): boolean {
  const c = colour.trim().toLowerCase();
  if (!c || c.length > 28 || !/^[a-z][a-z' -]*$/.test(c)) return false;
  const words = c.split(/[\s]+/);
  return words.length <= 3 && words.some((w) => COLOUR_WORDS.has(w) || w.split("-").some((p) => COLOUR_WORDS.has(p)));
}

/* ── Reading and checking the stylist's answer ─────────────────────────────────────────────────── */

/** The answer's text tidied: one line, no quotes or closing full stop, no "wearing" in front. */
function tidy(text: unknown): string {
  return String(text ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/^(she|he|they)\s+wears?\s+|^wearing\s+/i, "")
    .replace(/[.;,\s]+$/, "")
    .trim();
}

/** The garment as a bare noun — "saree", never "teal saree" (the colour is written beside it). */
function bareGarment(garment: string, colour: string): string {
  let g = tidy(garment).toLowerCase();
  const c = colour.trim().toLowerCase();
  if (c && g.startsWith(`${c} `)) g = g.slice(c.length + 1);
  return g.replace(/^(a|an|the)\s+/, "").trim();
}

/** What the video prompt will call this person — the same formula as utils/castSheet. */
export const styledShortName = (kind: CastKind, s: StyledOutfit) => `the ${kind} in the ${s.colour} ${s.garment}`;

/** One person's answer checked against the ordered style and the rules for everyone. */
function checkOne(person: CastPerson, rule: StyleRule, raw: any): { styled?: StyledOutfit; problem?: string } {
  const where = `${person.position} (${person.kind})`;
  const colour = tidy(raw?.colour ?? raw?.color).toLowerCase();
  const outfit = tidy(raw?.outfit);
  const garment = bareGarment(String(raw?.garment ?? ""), colour);
  if (!outfit || !colour || !garment) return { problem: `${where}: an outfit, its colour and its garment are all required` };
  if (!isNameableColour(colour)) return { problem: `${where}: "${colour}" is not a plain colour name` };
  const words = outfit.split(" ").length;
  if (words < 8 || words > 55 || outfit.length > 360) return { problem: `${where}: the outfit must be one phrase of 8–55 words` };
  if (!/^[a-z' -]{2,28}$/.test(garment) || garment.split(" ").length > 3) return { problem: `${where}: "${garment}" is not a short garment noun` };
  const lower = outfit.toLowerCase();
  if (!lower.includes(colour)) return { problem: `${where}: the outfit must name its colour "${colour}"` };
  if (!lower.includes(garment) && !lower.includes(garment.split(" ").pop()!)) return { problem: `${where}: the outfit must name its garment "${garment}"` };
  for (const must of rule.must) {
    if (!must.test(outfit)) return { problem: `${where}: the outfit is outside the ordered style (${rule.brief.split(" (")[0]})` };
  }
  if (rule.never?.test(outfit)) return { problem: `${where}: "${outfit.match(rule.never)![0]}" is outside the ordered style` };
  const child = isChild(person.kind);
  const banned: RegExp[] = [NO_TEXT_ON_CLOTHES, NO_PROFESSION, NO_REVEALING, NO_COSTUME, ...(child ? [NO_GROWN_UP] : [NO_UNIFORM, NO_SHORTS])];
  for (const re of banned) {
    const hit = outfit.match(re);
    if (hit) return { problem: `${where}: "${hit[0]}" is never worn in these ads` };
  }
  return { styled: { outfit, garment, colour } };
}

/**
 * The stylist's answer, checked: every person dressed inside their ordered style, nothing anybody is
 * never dressed in, and two people who never look alike — two different names for the video prompt, and
 * for grown-ups two different main colours (the owner: never the same outfit twice). All or nothing.
 */
export function checkStyledCast(
  people: CastPerson[],
  attireType: string | null | undefined,
  answer: unknown,
): { outfits: StyledOutfit[] | null; problems: string[] } {
  const list: any[] = Array.isArray((answer as any)?.people) ? (answer as any).people : Array.isArray(answer) ? (answer as any[]) : [];
  const problems: string[] = [];
  if (people.length === 0) return { outfits: null, problems: ["nobody to dress"] };
  const outfits: StyledOutfit[] = [];
  people.forEach((person, i) => {
    const rule = styleRuleFor(person.kind, attireType);
    if (!rule) { problems.push(`${person.position}: a Custom order is dressed in the team's own words`); return; }
    // Matched by position; a reply without positions is read in order.
    const raw = list.find((p) => String(p?.position || "").toUpperCase() === person.position) ?? (list.some((p) => p?.position) ? undefined : list[i]);
    if (!raw) { problems.push(`${person.position}: missing`); return; }
    const { styled, problem } = checkOne(person, rule, raw);
    if (problem) problems.push(problem);
    else outfits.push(styled!);
  });
  if (problems.length === 0 && outfits.length === 2) {
    const [a, b] = outfits;
    const grownUps = !isChild(people[0].kind) && !isChild(people[1].kind);
    // The most useful correction first: for grown-ups it is always "a different main colour".
    if (a.outfit.toLowerCase() === b.outfit.toLowerCase()) problems.push("the two outfits are the same");
    else if (grownUps && a.colour === b.colour) problems.push(`both wear ${a.colour} — give each person a different main colour`);
    else if (styledShortName(people[0].kind, a) === styledShortName(people[1].kind, b)) problems.push(`both would be called "${styledShortName(people[0].kind, a)}"`);
  }
  return problems.length ? { outfits: null, problems } : { outfits, problems: [] };
}

/** The stylist's reply read as JSON — a fenced or chatty reply too. Null when there is no object in it. */
export function parseStylistReply(text: string | null | undefined): unknown {
  const t = String(text || "").trim();
  if (!t) return null;
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}
