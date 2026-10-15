/**
 * Turning "attach image #2" into something a person can act on without thinking.
 *
 * A number is the wrong unit for this job. The member is holding a folder of photos the client sent
 * and a prompt that says "#2" — so they have to remember what order they dragged files in, count
 * down the upload list, and hope. Every step there is a chance to attach the wrong one, and they
 * are doing it under time pressure with several ads on the go.
 *
 * So the prompt's directive is resolved here into the actual photograph: its thumbnail and its file
 * name. The UI then shows the picture itself, and there is nothing left to work out.
 *
 * Kept pure — object URLs are made by the caller, which owns their lifetime — so the mapping from
 * directive to photo can be tested without a browser.
 */
import { splitAttachmentDirective } from "./locationAssignment";
import { OWNER_IMAGE_ATTACHMENT } from "./frameBrand";

export interface PromptAttachment {
  /** The full human-facing line, e.g. "📎 ATTACH STORE/OFFICE IMAGE #2 — the billing counter". */
  directive: string;
  /** 1-based position in the Store / Office Image list, or null when nothing must be attached. */
  photoNumber: number | null;
  /** The zone the scout named, when it named one — "the billing counter". */
  zone: string | null;
  /** Preview URL for that photo, when the file is still in the form. */
  url: string | null;
  /** The uploaded file's own name, so it can be matched in a file picker. */
  fileName: string | null;
  /**
   * The owner photos this prompt needs, in the order to attach them — "Owner photo 1 — the man, LEFT", then
   * "Owner photo 2 — the woman, RIGHT" on a Real Owner Duo; one entry on a single Real Owner Face. Empty on
   * every other ad. (2026-10-14: the reader knew only "IMAGE #n", so an owner frame was shown as "Nothing to
   * attach" while its prompt asked for the owners' faces — and on a duo, for both, in order.)
   */
  ownerPhotos: string[];
}

/**
 * The owner photos a directive asks for (utils/frameBrand writes them): the duo's "OWNER PHOTO 1 (the man,
 * LEFT) and OWNER PHOTO 2 (the woman, RIGHT), in that order", or the single owner's OWNER IMAGE.
 */
function readOwnerPhotos(directive: string): string[] {
  const duo = [...directive.matchAll(/OWNER PHOTO (\d+) \(the (man|woman), (LEFT|RIGHT|CENTRE)\)/g)]
    .map((m) => `Owner photo ${m[1]} — the ${m[2]}, ${m[3]}`);
  if (duo.length > 0) return duo;
  return directive.includes(OWNER_IMAGE_ATTACHMENT) ? ["Owner image — the client's face photo"] : [];
}

/** How a toast or a tooltip says it: "owner photo 1, then owner photo 2" / "the owner image". */
export function ownerPhotosInWords(ownerPhotos: string[]): string {
  return ownerPhotos.length > 1
    ? ownerPhotos.map((p) => p.split(" — ")[0].toLowerCase()).join(", then ")
    : ownerPhotos.length === 1 ? "the owner image" : "";
}

/** `📎 ATTACH STORE/OFFICE IMAGE #2 — the billing counter` → number 2, zone "the billing counter". */
function readDirective(directive: string): { photoNumber: number | null; zone: string | null } {
  const numbered = directive.match(/IMAGE #(\d+)/);
  if (!numbered) return { photoNumber: null, zone: null };
  // The owner's photo(s) are joined onto the same line with "  +  " (utils/frameBrand) — not part of the zone.
  const zone = directive.split("—")[1]?.split(/\s+\+\s+/)[0]?.trim() || null;
  return { photoNumber: Number(numbered[1]), zone };
}

/**
 * Resolves each prompt's directive against the uploaded photos.
 *
 * `photoUrls` and `fileNames` are indexed exactly as the Store / Office Image list is, so a
 * directive naming photo #2 resolves to position 1. A prompt with no directive — every normal
 * human-model ad — yields nothing, and the UI shows what it always did.
 */
export function buildPromptAttachments(
  prompts: string[],
  photoUrls: (string | null)[] = [],
  fileNames: (string | null)[] = [],
): (PromptAttachment | null)[] {
  return prompts.map((prompt) => {
    const { directive } = splitAttachmentDirective(prompt);
    if (!directive) return null;

    const { photoNumber, zone } = readDirective(directive);
    // A photo that has since been removed from the form leaves the directive intact but the
    // preview empty — better a correct instruction with no thumbnail than a thumbnail of the
    // wrong picture.
    const index = photoNumber === null ? -1 : photoNumber - 1;
    return {
      directive,
      photoNumber,
      zone,
      url: index >= 0 ? photoUrls[index] ?? null : null,
      fileName: index >= 0 ? fileNames[index] ?? null : null,
      ownerPhotos: readOwnerPhotos(directive),
    };
  });
}
