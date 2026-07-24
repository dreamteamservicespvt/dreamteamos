/**
 * Deciding which of the client's photographs backs which clip.
 *
 * The client sends several photos of their business and every one of them should be used — a
 * different real place behind every clip is what makes the ad feel like it was shot there.
 *
 * ── Division of labour (deliberate) ───────────────────────────────────────────────────────────
 * The mechanical rule is guaranteed HERE, in code: never repeat a photo while an unused one
 * remains, and never point at an unusable one. The *judgement* — which backdrop best proves this
 * particular line of dialogue — is left to the model, which can read the Telugu dialogue and look
 * at the attached images at the same time. Keyword-matching English photo tags against Telugu
 * dialogue in code would be guesswork; the model does that part properly.
 *
 * So: this function hands the model a correct, no-repeat starting assignment, and the prompt
 * permits a swap when a different photo clearly suits the line better — but never a repeat.
 */

/** One photograph, as described by the location-index pass. */
export interface LocationPhoto {
  /** 0-based position in the uploaded file list. */
  index: number;
  zone: string;
  shows?: string;
  lighting?: string;
  cameraHeight?: string;
  bestFor?: string;
  /** False when the photo is too dark/blurry or shows nothing about the business. */
  usable: boolean;
}

export interface ClipLocation {
  /** 0-based clip number. */
  clip: number;
  /** Position in the uploaded file list, or null when this clip's location must be generated. */
  photoIndex: number | null;
}

/**
 * Assigns at most one photo to each clip: every usable photo is used exactly once, and any clip
 * left over has its location generated instead.
 *
 * This deliberately does NOT cycle back to the start when there are fewer photos than clips. A
 * client who sends one photo for a two-clip ad should get that photo behind clip 1 and a generated
 * — but real-looking — zone of the same business behind clip 2. Showing the same photograph twice
 * reads as a stalled ad, and it also puts the member in the impossible position of attaching one
 * file to two different prompts and wondering whether they got it wrong.
 */
export function assignPhotosToClips(clipCount: number, photos: LocationPhoto[]): ClipLocation[] {
  if (clipCount <= 0) return [];
  const usable = photos.filter((p) => p.usable);

  return Array.from({ length: clipCount }, (_, clip) => ({
    clip,
    photoIndex: clip < usable.length ? usable[clip].index : null,
  }));
}

/**
 * The one line a member has to read before they can act: attach photo N, or attach nothing.
 *
 * This is written by code rather than left to the model because it is the instruction the whole
 * hand-off depends on — the member is holding several photos from the client and has to know which
 * one belongs to the prompt in front of them. `photoNumber` is 1-based to match the order the files
 * appear in the Store / Office Image list.
 */
export function attachmentDirective(
  location: ClipLocation,
  photos: LocationPhoto[] = [],
): string {
  if (location.photoIndex === null) {
    return "🎨 ATTACH NOTHING — no client photo for this clip. The location below is generated.";
  }
  const zone = photos.find((p) => p.index === location.photoIndex)?.zone;
  return `📎 ATTACH STORE/OFFICE IMAGE #${location.photoIndex + 1}${zone ? ` — the ${zone}` : ""}`;
}

/**
 * Splits a stamped prompt back into its directive and its body — the inverse of the above, kept
 * beside it so the two can never disagree about the shape.
 *
 * The directive is an instruction to the MEMBER, so the UI shows it as a banner and hands the image
 * generator the body alone; a stray "ATTACH IMAGE #2" in the prompt is noise the generator may try
 * to render as text.
 */
export function splitAttachmentDirective(text: string): { directive: string | null; body: string } {
  const match = text.match(/^\s*((?:📎|🎨)[^\n]*)\n+([\s\S]*)$/);
  return match ? { directive: match[1].trim(), body: match[2] } : { directive: null, body: text };
}

/**
 * The per-clip location briefing appended to the art-director prompt: which photo to build from,
 * what it shows, and how it is lit — so each clip's frame is anchored to a real place.
 */
export function describeClipLocations(
  assignments: ClipLocation[],
  photos: LocationPhoto[],
): string {
  const byIndex = new Map(photos.map((p) => [p.index, p]));

  const lines = assignments.map(({ clip, photoIndex }) => {
    if (photoIndex === null) {
      return `  Clip ${clip + 1}: NO PHOTOGRAPH — the client sent none for this clip. Build a real-looking `
        + `zone of this same business, chosen to match this clip's line, matching the lighting and `
        + `finish of the photographs above so it belongs to the same premises.`;
    }
    const photo = byIndex.get(photoIndex);
    const bits = [
      `zone: ${photo?.zone || "business interior"}`,
      photo?.shows ? `shows: ${photo.shows}` : null,
      photo?.lighting ? `lighting: ${photo.lighting}` : null,
      photo?.bestFor ? `best for: ${photo.bestFor}` : null,
    ].filter(Boolean).join(" · ");
    return `  Clip ${clip + 1}: PHOTOGRAPH #${photoIndex + 1} — ${bits}`;
  });

  return `===== PHOTOGRAPH ASSIGNED TO EACH CLIP =====

${lines.join("\n")}

This assignment is FIXED — the member attaches exactly this photograph to this clip's prompt, so do
not tell a clip to use a different photograph, and never put the same photograph behind two clips.
Each prompt must open by naming its own photograph exactly as listed above.`;
}

/**
 * Reads the location-index model response into photos, tolerating the usual JSON wrapping.
 * Anything unparseable yields [] so the caller falls back to generating the location instead of
 * failing the whole run.
 */
export function parseLocationIndex(raw: string, photoCount: number): LocationPhoto[] {
  if (!raw?.trim()) return [];
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((row: any, position: number) => ({
        index: Number.isInteger(row?.index) ? row.index : position,
        zone: String(row?.zone || "").trim() || "business interior",
        shows: row?.shows ? String(row.shows).trim() : undefined,
        lighting: row?.lighting ? String(row.lighting).trim() : undefined,
        cameraHeight: row?.cameraHeight ? String(row.cameraHeight).trim() : undefined,
        bestFor: row?.bestFor ? String(row.bestFor).trim() : undefined,
        // Absent `usable` means the scout had no objection — treat it as usable.
        usable: row?.usable !== false,
      }))
      // Guard against a hallucinated index pointing at a file that was never uploaded.
      .filter((p) => p.index >= 0 && p.index < photoCount);
  } catch {
    return [];
  }
}
