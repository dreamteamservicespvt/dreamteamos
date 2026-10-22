/**
 * The poster ANALYSIS — the one Gemini call behind every poster prompt (owner, 2026-10-12).
 *
 * "First analyze all available business information, product/service, ad type, campaign purpose, and
 * requirements, then intelligently select the ONE most suitable conceptual ad style … Do not randomly
 * select the type, do not use multiple types, do not generate long technical prompts, and do not lose
 * important business context."
 *
 * So the model no longer writes the poster prompt at all. It reads the business and answers four short
 * fields in JSON — the type (one id of the eight in utils/posterAdType), why, the main benefit, and a
 * short summary of the business — and utils/posterAdType assembles the prompt in code, in the owner's
 * exact three sentences plus one Format line. What it replaced: Poster Creation asked for one to six
 * 140–230-word art-directed concepts at temperature 0.95 with "at least two different styles across the
 * set", and the video kit's poster row was a separate 150–220-word "premium designed poster" prompt
 * (`POSTER_SYSTEM_PROMPT`, removed with `generatePosterPrompt`).
 *
 * Used by Poster Creation (`geminiService.generatePosterConcepts` / `refinePosterConcept`) and by the
 * video kit's "3. Poster Design" row (`writeVideoPosterPrompt`, `refineSection` case "poster").
 */
// The brief's sale-name line is a reference only (utils/businessName, 2026-10-22): BUSINESS NAME above is the final one.
import { withoutSaleNameLine } from "@/utils/businessName";
import { POSTER_AD_TYPES, MAX_BENEFIT_WORDS, MAX_CHANGES_WORDS, MAX_SUMMARY_WORDS, type PosterAdType } from "@/utils/posterAdType";

/** The eight, one line each, ids first — what the model chooses from. */
const typeMenu = (): string =>
  POSTER_AD_TYPES.map((t) => `  • ${t.id} — "${t.name}": fits when ${t.fitsWhen}.`).join("\n");

/** The rules for the business information, shared by the first analysis and a refine. */
const businessInformationRules = `  • At most ${MAX_SUMMARY_WORDS} words, one plain-English paragraph: the business's name, what it offers (its real
    products or services), the main benefit, and — only when they are given — the client's must-haves (an offer, a
    launch, a product, a line they asked for) and the occasion.
  • Only facts from the business information and the client's brief. Never invent an offer, price, discount, year,
    award, statistic, review or tagline.
  • No phone number, address, email, website or social handle — the app adds the verified contact details itself.
  • Never name an ad style and never describe a picture: the designer invents the visual from the style and the benefit.
  • No markdown, no quotation marks around it.`;

const jsonContract = (adTypeHint: string) => `Return ONLY this JSON object, nothing else:
{
  "adType": "${adTypeHint}",
  "reason": "<one sentence, at most 30 words: why this style fits THIS business and its main benefit>",
  "benefit": "<the main product/service benefit, at most ${MAX_BENEFIT_WORDS} words>",
  "businessInformation": "<the paragraph>"
}`;

/** The first analysis: one type (or the fixed one) and the business information. */
export const POSTER_ANALYSIS_SYSTEM_PROMPT = (input: { fixedType: PosterAdType | null }): string => {
  const fixed = input.fixedType;
  return `You are a senior creative strategist at an Indian advertising agency. Before a designer makes ONE minimalist
conceptual poster, you read everything known about the business and decide two things: the ONE conceptual ad style
that fits it best, and the few facts the poster must carry.

STEP 1 — ANALYSE (think; do not write this out): who the business is; what it sells (the product or service); the ONE
main benefit a customer gets from it; the kind of ad (a commercial poster, or a poster for an occasion); the campaign's
purpose; and everything the client's brief says the poster must carry.

STEP 2 — ${fixed
    ? `THE AD STYLE IS FIXED: "${fixed.name}" (id ${fixed.id}). The team chose it. Do not choose another; return its id.`
    : `CHOOSE THE ONE AD STYLE that shows this business's main benefit most strongly, from these eight (ids first):
${typeMenu()}
Choose from the business and its benefit — never at random, and exactly one. When two fit, take the one whose picture
says the benefit most directly. When nothing points anywhere, take product_benefit.`}

STEP 3 — WRITE THE BUSINESS INFORMATION the poster prompt will carry:
${businessInformationRules}

${jsonContract(fixed ? fixed.id : "<one id from the list>")}`;
};

export interface PosterAnalysisUserInput {
  businessInfo: unknown;
  businessName: string;
  /** The team's BUSINESS CONTENT — the client's requirements, the authoritative facts. */
  clientBrief?: string;
  /** The occasion's name ("Diwali"), or "" for a commercial poster. */
  occasion?: string;
}

/** The kind of ad and its purpose, in one line — what "ad type, campaign purpose" means for a poster. */
export function posterPurposeLine(occasion?: string): string {
  const o = (occasion || "").trim();
  return o
    ? `A ${o} poster for this business — it greets ${o} and ties the occasion to what the business offers.`
    : "A commercial poster for this business — it promotes its main product or service.";
}

/** The user turn: the purpose, the name, the client's brief and the extracted business information. */
export const POSTER_ANALYSIS_USER_PROMPT = (p: PosterAnalysisUserInput): string => `Analyse this business for ONE minimalist conceptual poster.

AD TYPE AND CAMPAIGN PURPOSE: ${posterPurposeLine(p.occasion)}
BUSINESS NAME: ${p.businessName || "as in the business information"}

${withoutSaleNameLine(p.clientBrief) ? `THE CLIENT'S OWN BRIEF (the requirements — honour them):
${withoutSaleNameLine(p.clientBrief)}

` : ""}BUSINESS INFORMATION:
${JSON.stringify(p.businessInfo ?? {}, null, 2)}`;

/**
 * A refine: the team asks for a change to a poster prompt. The type changes only when the request asks for
 * another style (never when the team fixed it); the business information changes only where asked.
 *
 * Since 2026-10-13 (owner: "poster refine prompt is not working") the answer carries everything else a request
 * can ask for, in fields the app assembles: the "Changes:" line (design requests — before, they had nowhere
 * to go, because the business information may not describe a picture), the contact details to print (only
 * from the verified list), the language of the words, and what could not be applied — so the member is told
 * instead of getting the same prompt back.
 */
export const POSTER_REFINE_ANALYSIS_SYSTEM_PROMPT = (input: {
  currentType: PosterAdType | null;
  fixedType: PosterAdType | null;
  /** A logo file goes with the prompt; without one the business name is the wordmark. Default true. */
  hasLogo?: boolean;
  /** The business has a verified address the poster may print. */
  hasAddress?: boolean;
  /** The language the poster's words are in now. */
  textLanguage?: string;
}): string => {
  const { currentType, fixedType } = input;
  const keep = fixedType ?? currentType;
  const hasLogo = input.hasLogo !== false;
  const language = (input.textLanguage || "").trim() || "English";
  return `You chose the ad style and wrote the business information for a minimalist conceptual poster prompt. The team
wants a change. Apply exactly the requested change and keep everything else as it is.

The app assembles the prompt from your answer: its three fixed sentences, the business information, a "Changes:" line,
the verified contact details and a Format line (the size, the ${hasLogo ? "logo" : "business name as the wordmark"}, the language of the words). Put each
part of the request in the field it belongs to.

THE AD STYLE: ${fixedType
    ? `fixed by the team as "${fixedType.name}" (id ${fixedType.id}). Never change it, whatever the request says.`
    : `now ${currentType ? `"${currentType.name}" (id ${currentType.id})` : "not set"}. Change it ONLY when the request asks for a
different style or type of ad; then choose ONE of these eight (ids first):
${typeMenu()}`}

THE BUSINESS INFORMATION ("businessInformation"): change only what the request asks (add, remove or reword a fact about
the business — an offer, a product, a service, a line); keep the rest word for word. A fact the team's request gives
counts as given.
${businessInformationRules}

THE CHANGES LINE ("changes"): the team's requests about the PICTURE and the DESIGN — colours, background, mood, lighting,
what to show or leave out, a person or object, a headline or tagline to print, the ${hasLogo ? "logo's size or place" : "business name's size or place"},
the layout, the lettering. Return the WHOLE line as it should now read: every change already on it (given below) that
this request does not undo or replace, plus this request's design changes.
  • Short, plain instructions to the designer, at most ${MAX_CHANGES_WORDS} words in all, in English. Words to print on the poster go
    in double quotes, exactly as the team wrote them.
  • Never a phone number, address, email, website or ad-style name, and never the business information or anything
    the Format line already says (the size, the ${hasLogo ? "logo" : "wordmark"}, the language) again.
  • "" when the poster carries no design requests.${hasLogo ? "" : `
  • There is no logo file: the business name is the wordmark. Never write the word "logo"; say "the business name".`}

THE CONTACT DETAILS ("numbers", "address"): the app prints only the business's VERIFIED numbers and address, listed
below, each marked "printed now" or "left out". Change them only when the request asks to leave one out or to bring one
back.
  • "numbers": every verified number the poster should print after this request, copied from the list ([] for none).
  • "address": ${input.hasAddress ? "true to print the verified address, false to leave it out" : "false — this business has no verified address"}.
  • You can never add a number or an address that is not in the list.

THE LANGUAGE OF THE WORDS ON THE POSTER ("textLanguage"): now ${language}. Only when the request asks for another language,
its name in English ("Telugu", "English and Telugu"); otherwise "".

WHAT COULD NOT BE APPLIED ("notApplied"): one short sentence naming any part of the request that cannot be done here, and
where to change it — the poster's size or shape (it comes from the Poster Size setting)${fixedType ? ", or a different ad style (the team fixed the style)" : ""}.
"" when everything was applied. Never mention phone numbers or the address here — the app reports those itself.

Return ONLY this JSON object, nothing else:
{
  "adType": "${keep ? `${keep.id}, unless the request asks for another style` : "<one id from the list>"}",
  "reason": "<one sentence, at most 30 words: why this style fits THIS business and its main benefit>",
  "benefit": "<the main product/service benefit, at most ${MAX_BENEFIT_WORDS} words>",
  "businessInformation": "<the paragraph>",
  "changes": "<the whole Changes line, or \\"\\">",
  "numbers": ["<each verified number to print, as listed>"],
  "address": ${input.hasAddress ? "<true or false>" : "false"},
  "textLanguage": "<a language, or \\"\\">",
  "notApplied": "<one sentence, or \\"\\">"
}`;
};

/** One verified contact detail, as the refine is shown it. */
export interface PosterRefineContact {
  display: string;
  whatsapp?: boolean;
  printed: boolean;
}

/** The refine's user turn: the prompt as it stands, its parts, the verified contacts, the request, and the facts. */
export const POSTER_REFINE_ANALYSIS_USER_PROMPT = (p: PosterAnalysisUserInput & {
  currentPrompt: string;
  currentBusinessInformation?: string;
  /** The Changes line the prompt carries now ("" when none). */
  currentChanges?: string;
  /** The verified numbers, each marked printed now or left out. */
  contacts?: PosterRefineContact[];
  /** The verified address ("" when none) and whether the prompt prints it now. */
  address?: { text: string; printed: boolean };
  instruction: string;
}): string => {
  const contactLines = [
    ...(p.contacts || []).map((c) => `  • ${c.display}${c.whatsapp ? " (WhatsApp)" : ""} — ${c.printed ? "printed now" : "left out"}`),
    ...(p.address?.text ? [`  • Address: ${p.address.text} — ${p.address.printed ? "printed now" : "left out"}`] : []),
  ];
  return `THE POSTER PROMPT AS IT STANDS:
${p.currentPrompt.trim()}
${p.currentBusinessInformation?.trim() ? `
ITS BUSINESS INFORMATION (the part you wrote): ${p.currentBusinessInformation.trim()}
` : ""}
ITS CHANGES LINE NOW: ${p.currentChanges?.trim() || "(none yet)"}

THE VERIFIED CONTACT DETAILS (the only ones a poster may print):
${contactLines.length ? contactLines.join("\n") : "  None — this business gave no phone number or address."}

THE REQUESTED CHANGE:
${p.instruction.trim()}

${POSTER_ANALYSIS_USER_PROMPT(p)}`;
};
