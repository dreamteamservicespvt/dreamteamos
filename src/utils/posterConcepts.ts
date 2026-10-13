/**
 * A poster as plain text — what "Copy all" and the Tools history put on the clipboard.
 *
 * Since 2026-10-12 a poster run makes ONE prompt in ONE conceptual ad type, decided and assembled by
 * utils/posterAdType (the model's reply is read there, `parsePosterAnalysis`, and the prompt is built in
 * code). The readers this file used to hold for the old one-to-six-concept replies — `parsePosterConcepts`,
 * `normalizePosterConcept`, `enforceCanvas`, `stripInventedNumbers`, `finalizePosterConcepts` — went with the
 * prompt that produced them. A generation saved before then still holds old concepts, so both shapes copy.
 */
import type { PosterConcept } from "@/types/aiPlatform";

/** One poster as plain text: the ad type, why, and the prompt — or, for an older concept, its idea and words. */
export function posterConceptAsText(c: PosterConcept, index?: number): string {
  if (c.adTypeName) {
    return [
      `Ad type: ${c.adTypeName}`,
      c.reason ? `Why: ${c.reason}` : null,
      "",
      c.imagePrompt,
    ].filter((l): l is string => l !== null).join("\n");
  }
  const head = `${index !== undefined ? `Concept ${index + 1}: ` : ""}${c.title}`;
  return [
    head,
    c.idea ? `Idea: ${c.idea}` : null,
    c.headline ? `Headline: ${c.headline}` : null,
    c.subline ? `Subline: ${c.subline}` : null,
    "",
    c.imagePrompt,
    c.negativePrompt ? `\nAvoid: ${c.negativePrompt}` : null,
  ].filter((l): l is string => l !== null).join("\n");
}
