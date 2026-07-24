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
  /** Position in the uploaded file list, or null when there are no usable photos at all. */
  photoIndex: number | null;
  /** True when every photo was already used and this one had to come round again. */
  reused: boolean;
}

/**
 * Assigns a photo to each clip: every usable photo is used once before any is used twice.
 *
 * With more photos than clips the extras simply go unused — better an unused photo than a
 * repeated backdrop. With fewer photos than clips the list cycles, and the reused flag lets the
 * prompt ask for a different camera angle so the repeat doesn't read as the same shot twice.
 */
export function assignPhotosToClips(clipCount: number, photos: LocationPhoto[]): ClipLocation[] {
  const usable = photos.filter((p) => p.usable);

  if (clipCount <= 0) return [];
  if (usable.length === 0) {
    return Array.from({ length: clipCount }, (_, clip) => ({ clip, photoIndex: null, reused: false }));
  }

  return Array.from({ length: clipCount }, (_, clip) => {
    const pass = Math.floor(clip / usable.length);
    return {
      clip,
      photoIndex: usable[clip % usable.length].index,
      reused: pass > 0,
    };
  });
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

  const lines = assignments.map(({ clip, photoIndex, reused }) => {
    if (photoIndex === null) return `  Clip ${clip + 1}: no client photograph — build this location from the business profile.`;
    const photo = byIndex.get(photoIndex);
    const bits = [
      `zone: ${photo?.zone || "business interior"}`,
      photo?.shows ? `shows: ${photo.shows}` : null,
      photo?.lighting ? `lighting: ${photo.lighting}` : null,
      photo?.bestFor ? `best for: ${photo.bestFor}` : null,
    ].filter(Boolean).join(" · ");
    const repeat = reused
      ? " (this photograph is used again — frame it from a clearly different angle and distance so it does not read as the same shot)"
      : "";
    return `  Clip ${clip + 1}: PHOTOGRAPH #${photoIndex + 1} — ${bits}${repeat}`;
  });

  return `===== PHOTOGRAPH ASSIGNED TO EACH CLIP =====

${lines.join("\n")}

You may swap a clip to a DIFFERENT attached photograph if that one clearly proves that clip's line
better. You may NOT put the same photograph behind two clips while any other photograph is unused.`;
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
