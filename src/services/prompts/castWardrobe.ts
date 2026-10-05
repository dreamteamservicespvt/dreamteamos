/**
 * The wardrobe stylist — what each invented person in an ad wears, chosen for THIS business, THIS video
 * and THIS logo (owner, 2026-10-05).
 *
 * ── Why it is a model call ───────────────────────────────────────────────────────────────────────
 * The owner's words: "the girl and the boy always get the same outfit — we need them related to the video
 * context, the business context and the logo, whatever is good." Code can read a business type and a
 * palette the extraction wrote down, but the extraction is told NOT to describe the logo (it is placed as
 * a file), so code never knew the logo's colours — and "what is good" for a paediatric clinic's Sankranti
 * greeting is a judgement, not a table lookup. So one fast call LOOKS at the logo with the business and
 * the video in front of it, and answers in a fixed JSON shape that code checks before anything is used
 * (utils/castWardrobe `checkStyledCast`). It runs while the script is being written, so it adds no wait.
 *
 * The ordered attire is never overruled: each person is given the style the team ordered for them
 * (`styleRuleFor`) and the checker refuses anything outside it. A Custom order never reaches this call.
 */
import { styleRuleFor, type CastPerson } from "@/utils/castWardrobe";

/** Everything the stylist reads. Only `people` is required; every other line is left out when empty. */
export interface CastWardrobeInput {
  people: CastPerson[];
  attireType?: string | null;
  businessName?: string;
  /** What the business does, in a customer's words (the core message). */
  whatTheyDo?: string;
  /** The one reason to choose them (the core message). */
  corePromise?: string;
  audience?: string;
  /** "commercial" or "festival". */
  adType?: string;
  festivalName?: string;
  /** The festival's traditional look (prompts.getFestivalTheme: its saree colours and mood), as a hint. */
  festivalLook?: string;
  /** The brand palette the extraction wrote, when it found one. */
  brandPalette?: string;
  /** The team's BUSINESS CONTENT box — what the business is and what this video is for, in their words. */
  brief?: string;
  /**
   * The team's FRAME / BACKGROUND INSTRUCTIONS and what the client asked for in a voice note — the
   * highest-priority direction of the run, so a wish about clothes or colours in it is followed.
   */
  direction?: string;
  /** True when the client's logo image is attached to the call. */
  hasLogo: boolean;
  /** What was wrong with the last answer, for the one retry. */
  problems?: string[];
}

export const CAST_WARDROBE_SYSTEM_PROMPT = `You are the wardrobe stylist of a premium Indian television commercial. You dress the people who appear in ONE ad for ONE client, so that what they wear belongs to this business, this video and this brand — never a stock outfit that any ad could use.

HOW YOU CHOOSE
1. THE ORDERED STYLE IS FIXED. Each person comes with the style the client ordered (a saree, a kurta, a formal suit, a shirt and trousers, children's ethnic wear…). Stay inside it. You choose everything within it: the exact garment, the fabric and weave, the cut, the border, the second colour, the jewellery and accessories.
2. THE LOGO DECIDES THE COLOURS. When the client's logo is attached, look at it and take the outfit colours from it: one person's main colour is the logo's dominant colour (in a rich, wearable shade of it), the other's is its second colour or a tone that sits beside it — so together the two read as this brand. A palette written in the brief counts the same. With neither, take the colours from the business's own world (a hospital's calm teal and ivory, a sweet shop's saffron and maroon, a solar company's green and sky blue). Never two near-identical shades; never a dull, washed-out or grey look.
3. THE BUSINESS DECIDES THE FEEL. A hospital, clinic or pharmacy: calm, clean, minimal jewellery. A jeweller, silk house or wedding business: rich silk and more jewellery. A school or coaching centre: neat and trustworthy. A restaurant, sweet shop or caterer: warm and inviting. A gym or sports shop: fresh and energetic (still inside the ordered style). A showroom, builder or office: polished and premium.
4. THE VIDEO DECIDES THE OCCASION. A festival greeting is dressed for that festival (its traditional colours, beside one brand colour). A temple, pooja, annadanam or wedding invitation is dressed as a family dresses for the temple. A promotion is dressed as the brand at its best.
5. TWO PEOPLE ARE COORDINATED BUT NEVER ALIKE. They belong to one brand, so their colours work together — but each has a DIFFERENT main colour and, wherever the style allows, a different garment or cut. Never twinning, never a "couple" look, never the same outfit in two colours with nothing else changed. Children in a school's ad may share the school's uniform colours, but each child's garment still differs (a pinafore and shorts, a skirt and trousers).

NEVER
• Any writing on clothes — no logo, letters, words, name, badge or emblem on any garment (the logo belongs on the wall of the premises, not on a sleeve). Do not even mention a logo in the outfit.
• A profession's uniform — no doctor's coat, lab coat, scrubs, stethoscope, apron, chef's whites, police or army look (for adults, no uniform at all).
• Bridal or costume looks, heavy bridal jewellery, a "couple" look.
• Sleeveless, strapless, deep-cut, off-shoulder, sheer, short or tight clothes. Adults never wear shorts.
• For children: child-sized, age-appropriate clothes only — never a saree, a blazer or a suit, never heels or make-up.

ANSWER — JSON only, nothing before or after it:
{
  "palette": "<one line: the colours you took, and from where (the logo, the palette, the business, the festival)>",
  "people": [
    { "position": "<LEFT | RIGHT | CENTRE, exactly as given>", "colour": "<the main colour in 1–3 plain words, e.g. deep teal, mustard yellow, ivory>", "garment": "<the main garment as a short noun, 1–3 words, no colour: saree, kurta, blazer, suit, pattu langa, school uniform>", "outfit": "<ONE phrase of 15–40 words that starts with a or an and contains the exact colour words and the exact garment word: the garment, fabric and weave, the second colour as a border or accent, the blouse / shirt / inner layer, footwear if it shows, the jewellery and accessories>" }
  ]
}
Example of one person (for the shape only — never copy it): { "position": "LEFT", "colour": "deep teal", "garment": "saree", "outfit": "a deep teal Kanchipuram silk saree with a thin antique-gold zari border and buttis, an elbow-length gold silk blouse, small gold jhumkas, a few thin gold bangles and a small bindi" }`;

const NOUN: Record<CastPerson["kind"], string> = { woman: "a woman", man: "a man", girl: "a girl", boy: "a boy" };

/** The user message: the people with their ordered style, then the business and the video. */
export function castWardrobeRequest(input: CastWardrobeInput): string {
  const people = input.people.map((p) => {
    const rule = styleRuleFor(p.kind, input.attireType);
    return `• ${p.position} — ${NOUN[p.kind]} of about ${p.age}. Ordered style: ${rule?.brief ?? "the team's own description"}.`;
  });
  const festival = input.adType === "festival" && input.festivalName?.trim();
  const lines = [
    `DRESS ${input.people.length === 1 ? "THIS PERSON" : `THESE ${input.people.length} PEOPLE`} (they appear in every clip of the ad, in these positions):`,
    ...people,
    "",
    "THE BUSINESS",
    input.businessName?.trim() ? `Name: ${input.businessName.trim()}` : "",
    input.whatTheyDo?.trim() ? `What it does: ${input.whatTheyDo.trim()}` : "",
    input.corePromise?.trim() ? `Why customers choose it: ${input.corePromise.trim()}` : "",
    input.audience?.trim() ? `Who the ad speaks to: ${input.audience.trim()}` : "",
    input.brandPalette?.trim() ? `Brand palette (from the extraction): ${input.brandPalette.trim()}` : "",
    input.hasLogo
      ? "The client's LOGO is attached as an image — take the outfit colours from it."
      : "No logo is attached — take the colours from the palette above, or from the business's own world.",
    "",
    "THE VIDEO",
    festival
      ? `A ${input.festivalName!.trim()} festival greeting from this business.${input.festivalLook?.trim() ? ` The festival's traditional look, as a guide: ${input.festivalLook.trim()}` : ""}`
      : "A promotional ad for this business.",
    input.brief?.trim() ? `What the team says this business and this video are about:\n"""\n${input.brief.trim().slice(0, 1800)}\n"""` : "",
    input.direction?.trim()
      ? `\nTHE TEAM'S AND THE CLIENT'S DIRECTION (highest priority — if it asks for particular clothes or colours, follow it inside the ordered style; ignore what it says about anything else):\n"""\n${input.direction.trim().slice(0, 1200)}\n"""`
      : "",
    input.problems?.length
      ? `\nYOUR LAST ANSWER COULD NOT BE USED — fix exactly these and answer again:\n${input.problems.map((p) => `• ${p}`).join("\n")}`
      : "",
  ];
  return lines.filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== "")).join("\n").trim();
}
