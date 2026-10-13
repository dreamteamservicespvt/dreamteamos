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
import { POSTER_AD_TYPES, MAX_BENEFIT_WORDS, MAX_SUMMARY_WORDS, type PosterAdType } from "@/utils/posterAdType";

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

${p.clientBrief?.trim() ? `THE CLIENT'S OWN BRIEF (the requirements — honour them):
${p.clientBrief.trim()}

` : ""}BUSINESS INFORMATION:
${JSON.stringify(p.businessInfo ?? {}, null, 2)}`;

/**
 * A refine: the team asks for a change to a poster prompt. The type changes only when the request asks for
 * another style (never when the team fixed it); the business information changes only where asked.
 */
export const POSTER_REFINE_ANALYSIS_SYSTEM_PROMPT = (input: { currentType: PosterAdType | null; fixedType: PosterAdType | null }): string => {
  const { currentType, fixedType } = input;
  const keep = fixedType ?? currentType;
  return `You chose the ad style and wrote the business information for a minimalist conceptual poster prompt. The team
wants a change. Apply exactly the requested change and keep everything else as it is.

THE AD STYLE: ${fixedType
    ? `fixed by the team as "${fixedType.name}" (id ${fixedType.id}). Never change it, whatever the request says.`
    : `now ${currentType ? `"${currentType.name}" (id ${currentType.id})` : "not set"}. Change it ONLY when the request asks for a
different style or type of ad; then choose ONE of these eight (ids first):
${typeMenu()}`}

THE BUSINESS INFORMATION: change only what the request asks (add, remove or reword a fact); keep the rest word for word.
${businessInformationRules}

${jsonContract(keep ? `${keep.id}, unless the request asks for another style` : "<one id from the list>")}`;
};

/** The refine's user turn: the prompt as it stands, the request, and the facts to check it against. */
export const POSTER_REFINE_ANALYSIS_USER_PROMPT = (p: PosterAnalysisUserInput & {
  currentPrompt: string;
  currentBusinessInformation?: string;
  instruction: string;
}): string => `THE POSTER PROMPT AS IT STANDS:
${p.currentPrompt.trim()}
${p.currentBusinessInformation?.trim() ? `
ITS BUSINESS INFORMATION (the part you wrote): ${p.currentBusinessInformation.trim()}
` : ""}
THE REQUESTED CHANGE:
${p.instruction.trim()}

${POSTER_ANALYSIS_USER_PROMPT(p)}`;
