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
import { backgroundPlateRule, type ClipLocation, type LocationPhoto } from "@/utils/locationAssignment";

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
  if (pack.family === "kids") return { who: "the two children", plural: true };
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
    case "kids": return "TWO REAL CHILDREN";
    case "solo": return "a CARTOON CHARACTER";
    case "duo": return "CARTOON CHARACTERS";
    default: return pack.characters.length > 1 ? "CHARACTERS" : "a CHARACTER";
  }
}

/**
 * The formula itself. `locationPlan` is the per-clip photograph assignment
 * (utils/locationAssignment.describeClipLocations), appended as the ground truth it refers to.
 */
export function realLocationFormula(subject: RealLocationSubject, locationPlan: string): string {
  const Who = subject.who.charAt(0).toUpperCase() + subject.who.slice(1);
  return `===== LOCATION: THE CLIENT'S REAL PHOTOGRAPHS — EACH ONE IS A BACKGROUND PLATE (STRICT) =====

Real photographs of this business are attached. Every clip stands in one of them, and that photograph
IS the clip's background — the image generator receives it with the prompt and must USE it, not redraw a
shop like it.

• Each clip has been assigned ONE specific photograph (below). That clip's frame is THAT photograph.
• ${backgroundPlateRule("the clip's attached photograph")}.
• ${Who} ${subject.plural ? "are" : "is"} placed INTO the photograph: on its actual floor, at believable real-world scale
  against its real counters, shelves and door frames, matching its eye level and perspective.
• Write each prompt as instructions to keep the photograph and place ${subject.who} into it. Do NOT describe the
  shop as if inventing it, and never ask for a different angle, a wider view or a new layout — the
  photograph's own framing is the frame.
• Keep the business's real signage and branding legible exactly as photographed.

${locationPlan}`;
}

export function clipLocationLabel(location: ClipLocation | undefined, photos: LocationPhoto[] = []): string {
  if (!location || location.photoIndex === null) {
    return "NO CLIENT PHOTOGRAPH for this clip — build a real-looking zone of this same business, "
      + "matched to the light and finish of the client's photographs so it belongs to the same premises";
  }
  const photo = photos.find((p) => p.index === location.photoIndex);
  const zone = photo?.zone?.replace(/^the\s+/i, "").trim();
  return `the client's PHOTOGRAPH #${location.photoIndex + 1}${zone ? ` (the ${zone})` : ""}, `
    + "used as this clip's background plate exactly as photographed — only enhanced to 8K";
}
