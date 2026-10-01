/**
 * The real-premises formula — one block, used by EVERY ad that is shot in the client's own photos.
 *
 * It was written for the character-pack frame prompt, and it is why those ads look shot on location:
 * each clip is built from one named photograph, the place is reproduced rather than redesigned, and
 * whoever is on screen is lit and placed to match that photo. The human-model prompt never had it.
 * It received the same photos and the same per-clip plan, but only as a note in the user message,
 * under a system prompt that ordered an invented tour of the business — reception, then the product
 * wall, then the logo wall — and a new zone for every line of the voice-over. The system prompt won,
 * so a client who sent every angle of their showroom got an ad set in a showroom that was not theirs.
 *
 * So the formula lives here, and every frame prompt reads it. What differs between ads is only WHO
 * is being lit and placed, which is the one thing the caller passes in.
 */
import type { CharacterPack } from "../characterPacks";
import type { ClipLocation, LocationPhoto } from "@/utils/locationAssignment";

/** Who the photograph has to be matched around, as the formula will say it. */
export interface RealLocationSubject {
  /** A noun phrase: "the two characters", "Ganesha", "the model". */
  who: string;
  /** True when `who` takes a plural verb ("they look", not "it looks"). */
  plural: boolean;
}

/**
 * The subject of a character-pack ad, from its cast and its shelf of the catalogue.
 *
 * The formula used to say "the two characters" whatever the pack. On a deity or a Real Owner Face
 * ad that is an instruction to put a second figure in the frame, which the generator obeys.
 */
export function packLocationSubject(pack: CharacterPack): RealLocationSubject {
  if (pack.family === "human_duo") return { who: "the two people", plural: true };
  if (pack.family === "kids_duo") return { who: "the two children", plural: true };
  if (pack.characters.length > 1) return { who: "the two characters", plural: true };
  const name = pack.characters[0]?.name || "character";
  // A deity or a cartoon is a proper name ("Ganesha"). A human entry's name is a role — "Presenter",
  // "Business Owner" — and "when lighting Presenter" reads as a typo, so it takes an article.
  if (pack.family === "human") return { who: `the ${name.toLowerCase()}`, plural: false };
  return { who: name, plural: false };
}

/** The human-model ad's subject — one person, whatever the attire or gender. */
export const MODEL_LOCATION_SUBJECT: RealLocationSubject = { who: "the model", plural: false };

/**
 * How a pack's frame prompt introduces the art director, by what is actually on screen.
 *
 * "Stages CARTOON CHARACTERS" was hard-coded, so a Lakshmi ad and a Business Owner ad were both
 * briefed as cartoon work. The staging rules below it were already cast-aware; the opener was not.
 */
export function packStagingRole(pack: CharacterPack): string {
  switch (pack.family) {
    case "god": return "a DEITY";
    case "human": return "a REAL PERSON";
    case "human_duo": return "TWO REAL PEOPLE";
    case "kids_duo": return "TWO REAL CHILDREN";
    case "solo": return "a CARTOON CHARACTER";
    case "duo": return "CARTOON CHARACTERS";
    default: return pack.characters.length > 1 ? "CHARACTERS" : "a CHARACTER";
  }
}

/**
 * The formula itself. `locationPlan` is the per-clip photograph assignment
 * (utils/locationAssignment.describeClipLocations), appended as the ground truth it refers to.
 *
 * ── Why it says USE, not REPRODUCE ──────────────────────────────────────────────────────────
 * It used to tell the art director to "REPRODUCE the real place … build that clip's frame from THAT
 * photo", and the frame prompts it produced described the shop in words. An image generator handed a
 * description and a photo GENERATES a new room that matches the words — the client's real shop came
 * back as a different shop: other shelves, other colours, a bigger floor. The photograph is not a
 * reference to redraw; it IS the background. The frame is an edit of it: enhanced, upscaled to 8K,
 * and the cast placed into it — nothing else (see realLocationLock, stamped on every such frame).
 */
export function realLocationFormula(subject: RealLocationSubject, locationPlan: string): string {
  const Who = subject.who.charAt(0).toUpperCase() + subject.who.slice(1);
  const looks = subject.plural ? "they look" : `${subject.who} looks`;
  return `===== LOCATION: THE CLIENT'S REAL PHOTOGRAPHS — USED AS THEY ARE =====

Real photographs of this business are attached. Each clip's frame is an EDIT of its own photograph, not a new
picture of a similar place.

• Each clip has been assigned ONE specific photograph. That photograph IS the background of that clip's frame —
  the same room, the same layout, the same camera angle and perspective, the same counters, shelves, stock,
  signage, floor, walls, colours and light. Nothing is redesigned, tidied, upgraded, re-imagined, moved, added
  or removed.
• The ONLY change to the photograph is its quality: enhance and upscale it to a sharp, clean 8K image — more
  detail, no noise or blur, balanced exposure and white balance, its own natural colours.
• Then place ${subject.who} INTO it: standing on its real floor, at true scale against its real counters and
  shelves, lit by the photo's own light (direction, softness and colour temperature) with matching contact
  shadows, so ${looks} photographed in that room rather than pasted onto it.
• If the photograph's shape differs from the ad's aspect ratio, CROP it to fit — never extend or outpaint it
  with invented room.
• Write each prompt as that edit: "Use the attached photograph #N as the exact background…". Do not describe
  the room in your own words — every word of description is something the generator will redraw.
• Keep the business's real signage and branding exactly as photographed; add no new signs, boards or
  decorations to the real premises. ${Who} must not hide the business's own signage.

${locationPlan}`;
}

/** The heading code stamps on a photo-backed frame — see realLocationLock. */
export const REAL_LOCATION_LOCK_HEADING = "REAL LOCATION — USE THE ATTACHED PHOTOGRAPH AS IT IS";

/**
 * The real-premises instruction, stamped in code on every frame built on a client's photograph.
 *
 * The art director is told to write each prompt as an edit of its photograph; this makes sure every
 * prompt the member pastes actually SAYS it, the same way the "attach this photo" line and the motion
 * composition are stamped rather than requested — a frame model drops what it is merely asked to keep.
 * `photoLabel` names the photograph ("STORE/OFFICE IMAGE #2 — the entrance"); `who` is who goes in it.
 * Idempotent.
 */
export function realLocationLock(prompt: string, photoLabel: string, who: string): string {
  if (!prompt.trim() || prompt.includes(REAL_LOCATION_LOCK_HEADING)) return prompt;
  return `${prompt.trimEnd()}

${REAL_LOCATION_LOCK_HEADING}:
Use the attached ${photoLabel} as the EXACT background of this image. Do not redraw, regenerate, redesign or
re-imagine it: keep its layout, camera angle and perspective, every counter, shelf, product, sign, wall, floor,
colour and light exactly as photographed — nothing added, removed or moved. The only change to the photograph is
quality: enhance and upscale it to a sharp, clean 8K image — more detail, no noise or blur, balanced exposure and
white balance, its own natural colours. Place ${who} into this exact scene on its real floor, at true scale against
its real fixtures, lit by its own light with matching shadows. If the shape differs from the ad's aspect ratio, crop
the photograph — never extend it with invented space.`;
}

/**
 * One clip's location, in the words a per-clip instruction needs: which photograph and what it is.
 * Used where a prompt would otherwise name an invented zone for that clip.
 */
export function clipLocationLabel(location: ClipLocation | undefined, photos: LocationPhoto[] = []): string {
  if (!location || location.photoIndex === null) {
    return "NO CLIENT PHOTOGRAPH for this clip — build a real-looking zone of this same business, "
      + "matched to the light and finish of the client's photographs so it belongs to the same premises";
  }
  const photo = photos.find((p) => p.index === location.photoIndex);
  const zone = photo?.zone?.replace(/^the\s+/i, "").trim();
  return `the client's PHOTOGRAPH #${location.photoIndex + 1}${zone ? ` (the ${zone})` : ""}, `
    + "used exactly as photographed — only enhanced and upscaled to 8K";
}
