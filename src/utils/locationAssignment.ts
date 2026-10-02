/**
 * Deciding which of the client's photographs backs which clip — and making sure it is USED, not
 * redrawn.
 *
 * The client sends several photos of their business and every one of them should be used — a
 * different real place behind every clip is what makes the ad feel like it was shot there.
 *
 * ── Division of labour (deliberate) ───────────────────────────────────────────────────────────
 * The mechanical rule is guaranteed HERE, in code: every usable photo is used before any is used
 * again, never an unusable one, and every clip of a real-location ad stands in one of the client's
 * photographs. The *judgement* — which backdrop best proves this particular line of dialogue — is left
 * to the model, which can read the Telugu dialogue and look at the attached images at the same time.
 *
 * ── The photograph is the background plate (2026-10-01) ─────────────────────────────────────
 * Members reported the client's real shop coming back CHANGED in the frames: redesigned, tidied,
 * widened, a different shop. The prompts told the image generator to "build", "reproduce" and
 * "rebuild" the space from the photo — words an image model reads as "draw a new one like it" — and
 * the clips the photos did not cover were given an invented zone. Now each photo clip carries the
 * BACKGROUND PLATE directive (withBackgroundPlate): the attached photograph IS the background, kept
 * exactly, only enhanced to 8K, with the cast placed into it.
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
 * Assigns one photo to each clip: every usable photo is used once before any is used again, and when
 * there are fewer photos than clips they are used again in turn — never an invented place.
 *
 * It used to give the clips left over a GENERATED zone of "the same business". On a real-location ad
 * that is exactly the fault the team reported: the client recognises their shop in two clips and a
 * shop they do not own in the third. A real-location ad now stands in the client's real place in
 * every clip; a reused photo is staged differently (another pose, another gesture, another line) and
 * the attach line names the photo, so the member knows exactly which file goes with which prompt.
 * `null` is left only for the case with no usable photo at all.
 */
export function assignPhotosToClips(clipCount: number, photos: LocationPhoto[]): ClipLocation[] {
  if (clipCount <= 0) return [];
  const usable = photos.filter((p) => p.usable);

  return Array.from({ length: clipCount }, (_, clip) => ({
    clip,
    photoIndex: usable.length > 0 ? usable[clip % usable.length].index : null,
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
  // The scout sometimes returns "entrance" and sometimes "the entrance"; strip its article so the
  // directive never reads "the the entrance".
  const zone = photos.find((p) => p.index === location.photoIndex)?.zone?.replace(/^the\s+/i, "").trim();
  return `📎 ATTACH STORE/OFFICE IMAGE #${location.photoIndex + 1}${zone ? ` — the ${zone}` : ""}`;
}

/** The heading of the plate line code stamps onto a photo clip's frame prompt — see withBackgroundPlate. */
export const BACKGROUND_PLATE_HEADING = "BACKGROUND PLATE";

/**
 * What an image generator must do with an attached store photo: USE it — not redraw a shop like it.
 * Shared by the stamp below and the location formula (prompts/realLocation), so the system prompt and
 * every finished frame say the same thing in the same words.
 */
export function backgroundPlateRule(photo = "the attached store/office photograph"): string {
  return `Use ${photo} AS the background, exactly as it is: the same room, the same layout, walls, floor, ceiling, `
    + `counters, shelves, racks, stock, products, signage, colours and light, seen from the same camera angle, `
    + `perspective and framing. Only ENHANCE it — upscale it to 8K, sharpen it, remove noise, blur and compression `
    + `artefacts, and correct exposure and white balance — so it reads as a crisp, premium 8K photograph of the very `
    + `same place. Do NOT redesign, rebuild, redraw, tidy, modernise, widen, extend, crop into or re-imagine it, and do `
    + `NOT add, remove, move or restyle a single object. The only things added are the cast of this frame — standing on `
    + `its real floor at true real-world scale against its real objects, lit by its own light (same direction, softness `
    + `and colour temperature) and casting soft contact shadows, so they look photographed in that room, not pasted `
    + `onto it — and the logo or name board, on a surface the photograph already has`;
}

/**
 * A finished frame prompt for a photo clip, guaranteed to carry the background-plate rule — stamped in
 * code, the same way the attach line is, because a frame model asked to keep a photo "as photographed"
 * still wrote a fresh description of a shop, and the image generator drew that description instead of
 * the photo. Idempotent; a clip with no photo is returned unchanged.
 */
export function withBackgroundPlate(prompt: string, location: ClipLocation | undefined): string {
  if (!prompt.trim() || !location || location.photoIndex === null || prompt.includes(BACKGROUND_PLATE_HEADING)) return prompt;
  return `${prompt.trimEnd()}\n\n${BACKGROUND_PLATE_HEADING} (STRICT): ${backgroundPlateRule(`the attached Store/Office Image #${location.photoIndex + 1}`)}.`;
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
      return `  Clip ${clip + 1}: NO USABLE PHOTOGRAPH — build a real-looking zone of this same business, chosen `
        + `to match this clip's line.`;
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
not tell a clip to use a different photograph. Where the list gives one photograph to more than one
clip, that real place appears again — staged differently, with a new pose and gesture for its own line —
and is never swapped for an invented place. Each prompt must open by naming its own photograph exactly
as listed above, and each photograph is the clip's BACKGROUND PLATE: used as it is, only enhanced to 8K.`;
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
