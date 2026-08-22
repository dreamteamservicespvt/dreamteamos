/**
 * The video-requirement catalogue — who or what fronts an ad.
 *
 * A “special category” is a creative treatment, deliberately orthogonal to the two axes that
 * already exist:
 *
 *   AdType        commercial | festival        — the TONE of the ad (unchanged by these)
 *   CharacterPack none | duo_motu_patlu | …    — WHO is on screen
 *   LocationMode  real_provided | ai_generated — WHERE they are
 *
 * This file is the TYPE and the lookups; the entries themselves live in ./characterCatalogue, so
 * adding a character is a data edit in one place and the pipeline never changes.
 *
 * ── Why the prompts name characters instead of describing them ─────────────────────────
 * This was originally built the other way round: every image and video prompt restated the exact
 * build, colours and clothing, on the theory that a description gives the model more to hold onto
 * than a name. Generating real ads proved the opposite. These are famous characters the models
 * already know, and a long physical description competes with that knowledge — it yields a generic
 * round cartoon man in an orange kurta rather than Motu, and it bloats every prompt. So `franchise`
 * says where the character comes from and stops.
 *
 * What a name CANNOT carry is how someone moves, sounds and is shot — and that is the difference
 * between a deity and a cartoon. Those are the direction fields on CharacterPack below.
 */
import { CHARACTER_CATALOGUE } from "./characterCatalogue";

/**
 * How a character's name is written when it is SPOKEN, in one language.
 *
 * A model asked to write Telugu will transliterate "Patlu" a different way almost every run —
 * పట్లూ, పట్లు, పత్లూ — so the character's own name drifts between clips of the same ad. The
 * spelling is therefore fixed here rather than left to the model: the prompt states it, and
 * `variants` rewrites whatever the model produced anyway (see applyNameSpellings).
 */
export interface NativeName {
  /** The one correct spelling. Nothing else may appear in a spoken line. */
  spelling: string;
  /** Spellings seen in practice, rewritten to `spelling` after generation. */
  variants: string[];
}

export interface PackCharacter {
  /** Stable id used in the canonical script format (`0-8|motu: …`). Lowercase, no spaces. */
  key: string;
  /**
   * Human-facing name — what a member reads, what appears in `[Motu]:` labels, and the ONLY
   * character identity the image and video prompts carry. See the note at the top of this file.
   */
  name: string;
  /** Fixed spoken spellings, keyed by lower-case language name. Languages absent here are free. */
  nativeNames?: Record<string, NativeName>;
  /**
   * A single emoji that stands for this character in WhatsApp messages.
   *
   * Purely for legibility: a member skimming a wall of assignment messages on their phone needs
   * the special ones to jump out, and a coloured marker does that where bold text alone does not.
   */
  emoji?: string;
  /** How the voice-over should sound for this character. */
  voice: string;
  /** Personality, for writing dialogue that sounds like them. */
  persona: string;
  /** What this character always does in a script — the reliable comic beat. */
  scriptRole: string;
}

/**
 * Which shelf of the catalogue an entry sits on. Purely for grouping the picker — the generation
 * pipeline never branches on it, because every entry already carries its own direction.
 */
export type CharacterFamily = "human" | "god" | "duo" | "solo" | "custom";

export const CHARACTER_FAMILY_LABELS: Record<CharacterFamily, string> = {
  human: "Human Model",
  god: "God Promotion",
  duo: "Cartoon Duo",
  solo: "Single Cartoon",
  custom: "Custom",
};

/** The order the families are offered in — commonest first, escape hatch last. */
export const CHARACTER_FAMILY_ORDER: CharacterFamily[] = ["human", "god", "duo", "solo", "custom"];

export interface CharacterPack {
  id: string;
  /** Which shelf this sits on in the picker. Absent on packs written before families existed. */
  family?: CharacterFamily;
  /**
   * Where these characters come from, named so the model reaches for the REAL ones rather than
   * inventing a look-alike. This is the entire identity anchor now that nothing describes them.
   */
  franchise: string;
  /** Shown in the sales and tech dropdowns. */
  label: string;
  /** One-line description for the picker. */
  tagline: string;
  /** Order is meaningful: `characters[0]` always speaks first in every clip. */
  characters: PackCharacter[];
  /** How the characters sit inside the scene — cartoon subjects, photoreal world. */
  styleDirective: string;
  /** The beat every clip must follow. */
  dialogueRhythm: string;
  /**
   * ── The production direction ─────────────────────────────────────────────
   * Every field below is OPTIONAL, which is what makes this a strict superset: the pack that
   * existed before these were added still satisfies the type, and every order already referencing
   * it keeps generating exactly as it did.
   *
   * They exist because a name alone cannot tell a model how a character MOVES. “Lord Shiva” and
   * “Shinchan” are both one identity anchor, and without direction both come out as a generic
   * figure reciting an advertisement. These say how each one sounds, looks, gestures and is shot
   * — the whole difference between thirty-two options and one option worn thirty-two ways.
   */
  /** Tone and modulation for the voice-over. */
  voiceDirection?: string;
  /** What the face does, and on which word it changes. */
  expressionDirection?: string;
  /** Where the eyes go, and when they come back to the lens. */
  eyeDirection?: string;
  /** One clear hand gesture per line, and which vocabulary it is drawn from. */
  gestureDirection?: string;
  bodyLanguage?: string;
  /** Shot sizes, lens, movement and framing, clip by clip. */
  cameraDirection?: string;
  /** How the location is built when the client sent no photographs. */
  backgroundDirection?: string;
  /** How the promotional script should read in this character’s register. */
  scriptStyle?: string;
  /**
   * The subject IS the client, built from a photograph they supplied.
   *
   * Only the Real Owner Face entries. It changes what the uploaded images MEAN: on every other
   * entry a client photo is a location reference, and here it is the face that must be reproduced
   * identically in every single clip.
   */
  usesClientFace?: boolean;
  /** Hard negatives repeated verbatim in every frame and video prompt. */
  negatives: string[];
}

// The Motu & Patlu pack now lives in the catalogue as `duo_motu_patlu`, reproduced there
// verbatim — same speaking order, same fixed Telugu spellings, same negatives. The old id still
// resolves through LEGACY_PACK_ALIASES below.

/**
 * Every entry, keyed by id.
 *
 * Built from the catalogue rather than written out here, so adding a character is a data edit in
 * one file and nothing else in the codebase has to know.
 */
export const CHARACTER_PACKS: Record<string, CharacterPack> = Object.fromEntries(
  CHARACTER_CATALOGUE.map((pack) => [pack.id, pack]),
);

/**
 * Ids that used to mean something else.
 *
 * ── Why an alias and not a migration ─────────────────────────────────────────────
 * The only pack that ever existed was `motu_patlu`, and that string is written onto every sale,
 * order and work assignment made since. Grouping the catalogue into families renamed it to
 * `duo_motu_patlu` for consistency with the other eight duos.
 *
 * Rewriting live data to change a key nobody outside this file ever sees is risk with no benefit:
 * a sweep over orders, assignments and saved generations, any one of which could be missed, in
 * exchange for tidiness. One line of indirection resolves the old id for ever, costs nothing, and
 * cannot half-succeed.
 */
const LEGACY_PACK_ALIASES: Record<string, string> = {
  motu_patlu: "duo_motu_patlu",
};

/** The pack for an id, or null for a normal (human-model) ad. */
export function getCharacterPack(id?: string | null): CharacterPack | null {
  if (!id) return null;
  return CHARACTER_PACKS[id] ?? CHARACTER_PACKS[LEGACY_PACK_ALIASES[id]] ?? null;
}

/** Options for a flat dropdown, in catalogue order. */
export function characterPackOptions(): { id: string; label: string; tagline: string }[] {
  return CHARACTER_CATALOGUE.map(({ id, label, tagline }) => ({ id, label, tagline }));
}

/**
 * The same options, grouped for an `<optgroup>` picker.
 *
 * Thirty-two entries in one flat list is a search, not a choice — a member looking for Shinchan
 * should not have to read past six deities to find him. Empty families are dropped so the picker
 * only ever offers shelves that have something on them.
 */
export function characterPackGroups(): {
  family: CharacterFamily;
  label: string;
  options: { id: string; label: string; tagline: string }[];
}[] {
  return CHARACTER_FAMILY_ORDER
    .map((family) => ({
      family,
      label: CHARACTER_FAMILY_LABELS[family],
      options: CHARACTER_CATALOGUE
        .filter((p) => p.family === family)
        .map(({ id, label, tagline }) => ({ id, label, tagline })),
    }))
    .filter((g) => g.options.length > 0);
}

/** The speaker list a script must follow, in speaking order. */
export function packSpeakers(pack: CharacterPack): { key: string; name: string }[] {
  return pack.characters.map(({ key, name }) => ({ key, name }));
}

/**
 * The pack's cast, written to stand out in a WhatsApp message: `🟠 *MOTU* & 🔵 *PATLU*`.
 *
 * A special-category job is worked differently from an ordinary one, so the member has to notice
 * it in a thread of near-identical assignment messages. Bold alone doesn't survive that skim;
 * colour does. `*…*` is WhatsApp's bold, which is what these messages are written for.
 */
export function packHighlight(pack: CharacterPack): string {
  return pack.characters
    .map((c) => `${c.emoji ? `${c.emoji} ` : ""}*${c.name.toUpperCase()}*`)
    .join(" & ");
}

/** Every name/key a parser should recognise for this pack (case-insensitive matching). */
export function packSpeakerAliases(pack: CharacterPack): string[] {
  return pack.characters.flatMap((c) => [c.key, c.name.toLowerCase()]);
}

/**
 * The fixed spoken spellings for this pack in one language, or [] when that language has none
 * (in which case the model writes the names however it likes, as it always did).
 */
export function packNameSpellings(
  pack: CharacterPack,
  language: string,
): { name: string; spelling: string; variants: string[] }[] {
  const key = (language || "").trim().toLowerCase();
  if (!key) return [];
  return pack.characters
    .map((c) => {
      const native = c.nativeNames?.[key];
      return native ? { name: c.name, spelling: native.spelling, variants: native.variants } : null;
    })
    .filter((v): v is { name: string; spelling: string; variants: string[] } => v !== null);
}
