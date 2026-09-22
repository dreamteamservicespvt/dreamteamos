/**
 * What a finished frame prompt tells the member to attach — the logo, the owner's face — made true.
 *
 * Pure — no React, no Firestore — so both rewrites are unit-tested.
 */

/**
 * Every way a prompt refers to a logo FILE — "the attached logo", "the uploaded brand logo", "the
 * client's logo image" — which only makes sense when a logo was attached.
 */
const LOGO_FILE_REFERENCE =
  /\b(?:the\s+|this\s+|your\s+)?(?:exact\s+)?(?:attached|uploaded|provided|supplied|given)\s+(?:business\s+|brand\s+|client'?s\s+|company\s+)?logo(?:\s+(?:image|file|artwork))?\b/gi;
/**
 * A sentence that asks for a logo to be attached — meaningless with nothing to attach. Run after the
 * reference rewrite, so "place the attached logo on the wall" has already become a name board and
 * only an instruction like "Attach the logo with this prompt" is left for this to remove.
 */
const ATTACH_LOGO_SENTENCE = /[^.\n]*\battach(?:ing)?\s+(?:the\s+|your\s+|a\s+)?(?:business\s+|brand\s+)?logo\b[^.\n]*\.?/gi;

/**
 * A frame prompt for an ad with NO logo file, with every "attached logo" turned into the business
 * name board.
 *
 * ── Why this is done in code ──────────────────────────────────────────────────────────────────────
 * With "No logo (name board)" selected the frames still said "place the attached logo…", so members
 * went looking for a logo the client never had. The system prompt already says name board; the model
 * still copied "attached logo" out of the rules it was given. This is the last word on it.
 */
export function nameBoardInPlaceOfLogo(prompt: string, businessName: string): string {
  if (!prompt) return prompt;
  const name = (businessName || "").trim().toUpperCase();
  const board = name ? `business name board reading "${name}"` : "business name board";
  return prompt
    .replace(LOGO_FILE_REFERENCE, (match) => (/^[A-Z]/.test(match) ? `The ${board}` : `the ${board}`))
    .replace(ATTACH_LOGO_SENTENCE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const OWNER_IMAGE_ATTACHMENT = "the OWNER IMAGE (the client's face photo)";

/**
 * A Real Owner Face frame prompt, told — on the line the member reads first — to attach the owner's
 * photo. Joined onto an existing 📎/🎨 line so utils/locationAssignment.splitAttachmentDirective still
 * finds one directive line above the body. Idempotent.
 */
export function withOwnerImageDirective(prompt: string): string {
  if (!prompt || prompt.includes(OWNER_IMAGE_ATTACHMENT)) return prompt;
  const match = prompt.match(/^\s*((?:📎|🎨)[^\n]*)\n+([\s\S]*)$/);
  if (match) {
    const line = match[1].trim();
    const joined = line.startsWith("🎨")
      ? `📎 ATTACH ${OWNER_IMAGE_ATTACHMENT} only — no store photo for this clip; the location below is generated.`
      : `${line}  +  ${OWNER_IMAGE_ATTACHMENT}`;
    return `${joined}\n\n${match[2]}`;
  }
  return `📎 ATTACH ${OWNER_IMAGE_ATTACHMENT} — the person in this frame must be exactly them.\n\n${prompt}`;
}
