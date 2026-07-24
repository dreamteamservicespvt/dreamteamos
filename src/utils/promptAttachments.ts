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
}

/** `📎 ATTACH STORE/OFFICE IMAGE #2 — the billing counter` → number 2, zone "the billing counter". */
function readDirective(directive: string): { photoNumber: number | null; zone: string | null } {
  const numbered = directive.match(/IMAGE #(\d+)/);
  if (!numbered) return { photoNumber: null, zone: null };
  const zone = directive.split("—")[1]?.trim() || null;
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
    };
  });
}
