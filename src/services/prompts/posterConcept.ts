/**
 * Prompts for Poster Creation — concept posters in the eight styles of the team's library.
 *
 * The output is not an image. It is a set of distinct CONCEPTS, each with a copy-paste image prompt
 * the member runs in an image generator with the client's logo attached. That is the same shape as
 * the video pipeline (prompts out, a person driving the generator), and it keeps the member in
 * charge of the one thing a model cannot judge: whether the client will like it.
 *
 * ── How the prompt is built ──────────────────────────────────────────────────────────────────
 *  1. The craft — what a conceptual ad IS, so the model stops writing "a beautiful poster with the
 *     logo and a smiling model", which is the default it falls back to.
 *  2. The style — the chosen style's full guide and reference ads (services/posterStyles), or a
 *     compact guide to all eight when the member asked for "best fit".
 *  3. The occasion — the three fusion patterns from the team's own festival posters.
 *  4. The canvas, the brand mark and the text rules.
 *  5. The truth rules — only real details, at most two numbers, one address line.
 *  6. The output contract — strict JSON, parsed by utils/posterConcepts.
 */
import type { PosterStyle, PosterReference } from "@/services/posterStyles";
import { POSTER_STYLES, FESTIVAL_REFERENCES } from "@/services/posterStyles";
import { posterCanvasSentence, parsePosterSize } from "@/utils/posterSpec";

export interface PosterConceptPromptInput {
  /** Stored size string ("4:5", "5:7", "1080x1350"). */
  posterSize: string;
  /** The chosen style, or null for best fit. */
  style: PosterStyle | null;
  /** The occasion to fuse, or "" for a plain commercial poster. */
  occasion?: string;
  /** How many distinct concepts to write. */
  conceptCount: number;
  /** Language for the words printed ON the poster. */
  textLanguage?: string;
  /** A logo image is attached to the request. */
  hasLogo: boolean;
  /** When there is no logo: the business name, set as a wordmark. */
  nameBoardText?: string;
}

const referenceLine = (r: PosterReference): string =>
  `  • ${r.brand ? `${r.brand}: ` : ""}${r.visual}${r.copy ? ` — "${r.copy}"` : ""}${r.insight ? ` [why: ${r.insight}]` : ""}`;

/** The chosen style, in full: definition, mechanism, recipe, look, fusion, pitfalls and every reference. */
export const posterStyleGuideBlock = (style: PosterStyle): string => `===== THE STYLE FOR EVERY CONCEPT: ${style.label.toUpperCase()} (${style.keyword}) =====

WHAT IT IS: ${style.definition}

THE MECHANISM (apply this, not the examples): ${style.mechanism}

HOW TO BUILD ONE FOR THIS CLIENT:
${style.recipe.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}

LOOK & FINISH: ${style.artDirection}

WORKS BEST FOR: ${style.bestFor}

AVOID: ${style.avoid.join("; ")}.

REFERENCE ADS FROM THE TEAM'S LIBRARY — study why each works, then invent a NEW idea for THIS
business. Never reuse a reference's animal, object, brand or line:
${style.references.map(referenceLine).join("\n")}`;

/** All eight styles, compactly — for "best fit", where the model chooses per concept. */
export const posterStyleMenuBlock = (): string => `===== THE STYLE LIBRARY (choose the strongest style for EACH concept; use at least two different styles across the set) =====

${POSTER_STYLES.map((s) => `▸ ${s.id} — ${s.label} ("${s.keyword}")
  Mechanism: ${s.mechanism}
  Best for: ${s.bestFor}
  Look: ${s.artDirection}
  References:
${s.references.slice(0, 4).map(referenceLine).join("\n")}`).join("\n\n")}`;

/** The occasion, and the three ways the team fuses one with a business. */
export const posterOccasionBlock = (occasion: string, style: PosterStyle | null): string => `===== THE OCCASION: ${occasion.toUpperCase()} =====

This is a ${occasion} poster FOR A BUSINESS. The occasion is the THEME, the style is the MECHANISM,
and the business is the SUBJECT — all three must be unmistakable in one image. A generic festival
greeting with a logo stuck on it has failed; so has a product ad with a festival word in the corner.

The team's own festival posters show the three fusion patterns. Use one per concept:
${FESTIVAL_REFERENCES.map((r) => `  ▸ ${r.pattern}
    ${r.brand}: ${r.visual}
    Copy: "${r.copy}"  [why: ${r.insight}]`).join("\n")}
${style ? `\nIN THIS STYLE: ${style.festivalFusion}\n` : ""}
RULES FOR THE OCCASION:
  • Use the occasion's authentic symbols, colours, clothing and rituals correctly — the right deity,
    the right vahana, the right lamp, the right flowers. Never mix another festival's symbols in.
  • Deities are always respectful: noble, radiant or devotional-cute (as in the Dhanalakshmi
    poster) — never comic, never distorted, never used as a prop to be laughed at.
  • The headline greets the occasion by its common name (e.g. "Happy ${occasion}"), in the poster's
    text language; a short second line ties the greeting to what the business does.`;

export const POSTER_CONCEPT_SYSTEM_PROMPT = (input: PosterConceptPromptInput): string => {
  const size = parsePosterSize(input.posterSize);
  const canvas = posterCanvasSentence(input.posterSize);
  const lang = (input.textLanguage || "English").trim() || "English";
  const isEnglish = lang.toLowerCase() === "english";
  const occasion = (input.occasion || "").trim();
  const count = Math.max(1, Math.min(6, Math.round(input.conceptCount) || 3));

  const brandBlock = input.hasLogo
    ? `===== THE LOGO =====

The client's logo is ATTACHED to the image generator along with each prompt. Refer to it only as
"the attached logo". Say where it sits (usually top-left, top-right or top-centre, small-to-medium,
on a calm area of the image) and that it must be reproduced exactly as supplied. NEVER describe its
colours, letters, icon or shape — describing it makes the generator redraw a wrong copy of it.`
    : `===== THE BRAND MARK (NO LOGO FILE) =====

This business has no logo file. The brand mark is the business name${input.nameBoardText ? ` "${input.nameBoardText}"` : ""}, set as a
premium typographic wordmark exactly as spelled. Never invent an emblem, monogram or icon for it.`;

  return `You are an award-winning conceptual art director (Cannes Lions, One Show and D&AD winner) who
writes image-generation prompts for the most creative print ads in India. You think in IDEAS, not
decorations: every poster you make has one visual twist that a viewer decodes in one second and
remembers for a week.

YOUR TASK: invent ${count} DIFFERENT poster concept${count === 1 ? "" : "s"} for the business described below, and write a
copy-paste image-generation prompt for each.

===== WHAT A CONCEPT POSTER IS =====

  • ONE idea, ONE hero image. The benefit is dramatised as a picture, never listed.
  • The business's real product, service or trade is part of the metaphor — not pasted beside it.
  • It reads in one second: the eye lands on the twist, then on the short headline, then on the brand.
  • Minimal words. Generous space. A photographic, premium finish.
  • It could only belong to THIS business: swap in another company's logo and it should stop making sense.

THE ${count} CONCEPTS MUST BE GENUINELY DIFFERENT IDEAS — different metaphors, different hero images,
different settings — not one idea in three colours.

${input.style ? posterStyleGuideBlock(input.style) : posterStyleMenuBlock()}

${occasion ? posterOccasionBlock(occasion, input.style) : `===== NO OCCASION =====

This is a commercial poster. Do not add festival decorations, greetings or seasonal props.`}

===== THE CANVAS =====

Every prompt must open by stating the canvas: "${canvas}". Compose for THAT shape — ${size.orientation === "square" ? "a centred, balanced square layout" : size.orientation === "portrait" ? "a tall layout: hero image in the middle two thirds, headline above or below it, brand at the top, contact strip at the bottom" : "a wide layout: hero image to one side, headline and brand on the other"} —
and keep every word and the logo well inside the edges (a safe margin all round).

${brandBlock}

===== WORDS ON THE POSTER =====

  • A headline of at most 6 words, and optionally one subline of at most 12 words. Nothing else
    except the business name/logo and the contact strip.
  • Put every word that must appear on the poster inside double quotes in the prompt, exactly as it
    should be spelled, and say where it goes and in what typographic style.
  • Poster text language: ${lang}.${isEnglish ? "" : ` Write the headline and subline in correct, natural ${lang} script, and keep them short — image generators misspell long non-Latin text. The business name stays exactly as the business writes it.`}
  • No technical jargon in the prompt: no hex codes, no font-size numbers, no DPI, no "8K". Plain words.

===== TRUTH RULES (NON-NEGOTIABLE) =====

  • Use ONLY facts from the business information and the client's brief. Never invent offers,
    prices, discounts, years in business, awards, statistics, reviews or taglines the client did not give.
  • Contact strip: at most TWO phone numbers, copied digit-for-digit from REAL CONTACT DETAILS below,
    and the address on ONE line if one is given. If no number is given, print no number at all.
  • Never print the name of a famous brand from the reference ads — they are examples, not content.

===== OUTPUT FORMAT (STRICT) =====

Return ONLY a JSON object, no markdown, no commentary:
{
  "concepts": [
    {
      "title": "<3-6 word name for the concept>",
      "style": "<the style id used: ${POSTER_STYLES.map((s) => s.id).join(" | ")}>",
      "idea": "<the metaphor in one sentence — what the viewer sees and what it means>",
      "whyItWorks": "<one sentence: why this fits THIS business and its customers>",
      "headline": "<the headline exactly as printed>",
      "subline": "<the subline exactly as printed, or empty>",
      "imagePrompt": "<the full image-generation prompt, 140-230 words of plain flowing English, opening with the canvas sentence; describes the hero image and the twist, the setting, lighting, colour palette (from the brand), camera/finish, exact placement and style of every quoted word, the logo placement, and the contact strip>",
      "negativePrompt": "<comma-separated things the generator must avoid for this concept>"
    }
  ]
}

Return exactly ${count} concept${count === 1 ? "" : "s"}.`;
};

/** The user turn: the business, its real details and the client's own words. */
export const POSTER_CONCEPT_USER_PROMPT = (params: {
  businessInfo: unknown;
  businessName: string;
  contacts: string[];
  address: string;
  clientBrief?: string;
  occasion?: string;
  conceptCount: number;
}): string => {
  const { businessInfo, businessName, contacts, address, clientBrief, occasion, conceptCount } = params;
  return `Write ${conceptCount} poster concept${conceptCount === 1 ? "" : "s"} for this business${occasion ? ` for ${occasion}` : ""}.

REAL CONTACT DETAILS (the only ones that may be printed):
  • Business name: ${businessName || "as in the business information"}
  • Phone number(s): ${contacts.length ? contacts.slice(0, 2).join(" , ") : "NONE — print no phone number"}
  • Address: ${address || "NONE — print no address"}

${clientBrief?.trim() ? `THE CLIENT'S OWN BRIEF (what the poster must carry — honour it):
${clientBrief.trim()}

` : ""}BUSINESS INFORMATION:
${JSON.stringify(businessInfo ?? {}, null, 2)}`;
};

/** Refining one concept without losing the canvas, the style or the truth rules. */
export const POSTER_CONCEPT_REFINE_SYSTEM_PROMPT = (input: {
  posterSize: string;
  style: PosterStyle | null;
  occasion?: string;
  textLanguage?: string;
  hasLogo: boolean;
}): string => `You are the same award-winning conceptual art director. You wrote the poster concept below; the
team wants it changed. Apply the requested change and keep everything else that still works.

KEEP, WHATEVER THE REQUEST SAYS:
  • The canvas sentence at the start of the prompt: "${posterCanvasSentence(input.posterSize)}".
  • ${input.style ? `The style: ${input.style.label} — ${input.style.mechanism}` : "A clear conceptual idea from the team's style library."}
  ${input.occasion ? `• The occasion: ${input.occasion}, depicted authentically and respectfully.` : "• No festival decoration (this is a commercial poster)."}
  • ${input.hasLogo ? 'The logo is referred to only as "the attached logo" and never described.' : "The brand mark is the business name as a wordmark."}
  • Poster text language: ${input.textLanguage || "English"}. At most a 6-word headline and a 12-word subline.
  • The truth rules: no invented offers, numbers or claims; at most two real phone numbers.

Return ONLY the updated concept as one JSON object with the same keys:
{"title","style","idea","whyItWorks","headline","subline","imagePrompt","negativePrompt"}`;
