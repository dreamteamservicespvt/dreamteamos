/**
 * Character packs — cartoon duos that front a "special category" ad.
 *
 * A pack is a *creative treatment*, deliberately orthogonal to the two axes that already exist:
 *
 *   AdType        commercial | festival        — the TONE of the ad (unchanged by packs)
 *   CharacterPack none | motu_patlu | …        — WHO is on screen
 *   LocationMode  real_provided | ai_generated — WHERE they are
 *
 * Adding another duo later is a data entry here, not a change to the generation pipeline.
 *
 * ── Why the prompts name the characters instead of describing them ───────────────────────────
 * This was originally built the other way round: every image and video prompt restated the exact
 * build, colours and clothing, on the theory that a description gives the model more to hold onto
 * than a name. Generating real ads proved the opposite. These are famous characters the models
 * already know, and a long physical description competes with that knowledge — it yields a generic
 * round cartoon man in an orange kurta rather than Motu, and it bloats every prompt. So the prompts
 * now say "Motu and Patlu" and stop, and nothing here describes how they look.
 */

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
  /** How the voice-over should sound for this character. */
  voice: string;
  /** Personality, for writing dialogue that sounds like them. */
  persona: string;
  /** What this character always does in a script — the reliable comic beat. */
  scriptRole: string;
}

export interface CharacterPack {
  id: string;
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
  /** Hard negatives repeated verbatim in every frame and video prompt. */
  negatives: string[];
}

const MOTU_PATLU: CharacterPack = {
  id: "motu_patlu",
  franchise: 'the Indian animated television series "Motu Patlu"',
  label: "Motu & Patlu",
  tagline: "Cartoon duo placed inside the client's real business location",
  characters: [
    {
      key: "motu",
      name: "Motu",
      nativeNames: {
        telugu: { spelling: "మోటూ", variants: ["మోటు", "మొటూ", "మొటు", "మోతూ", "మోతు"] },
      },
      // Reads inside "…says, in a <voice> voice", so it must stay a clean adjectival phrase.
      voice: "high-pitched, bubbly and excitable",
      persona: "warm-hearted, impulsive, food-loving, easily amazed, asks what everyone is thinking; speaks quickly",
      scriptRole:
        "Opens every clip. He asks the customer's real question, reacts with excitement or friendly "
        + "doubt, and sets up the line that follows. He never delivers the offer or the call to action.",
    },
    {
      key: "patlu",
      name: "Patlu",
      nativeNames: {
        telugu: { spelling: "పట్లు", variants: ["పతలూ", "పట్లూ", "పత్లూ", "పత్లు", "పాట్లూ", "పాట్లు", "పతలు"] },
      },
      voice: "calm, measured, clear and unhurried",
      persona: "logical, well-informed, patient, quietly witty, the one who always has the answer; speaks slower than Motu",
      scriptRole:
        "Answers Motu in every clip. He carries the business value — the service, the offer, the proof — "
        + "and delivers the closing call to action in the final clip.",
    },
  ],
  // Describes the COMPOSITE, not the characters — how the cartoon sits inside the photograph.
  // Says nothing about their build or relative size: that is part of who they already are, and
  // stating it invites the generator to redraw them to the words instead of using the real pair.
  styleDirective:
    "2D cartoon characters composited into a PHOTOREAL live-action environment. The characters stay "
    + "cartoon; the location stays photographic and is never restyled. They stand on the actual floor in "
    + "correct perspective, casting soft contact shadows that match the scene's light.",
  dialogueRhythm:
    "Motu speaks first and sets up the question or reaction; Patlu answers with the business value. "
    + "This order never reverses. Both characters speak in every single clip.",
  negatives: [
    "Do NOT restyle the environment into a cartoon — the location must stay photoreal",
    // Says "the real ones" rather than naming proportions or heights: describing their build is
    // what let the generator draw two same-sized men who merely resembled them.
    "Do NOT redraw, restyle or re-proportion the characters — use the real ones, identical in every clip",
    "No additional cartoon characters anywhere in frame",
    "No on-screen text, captions, subtitles, logos-as-text, or watermarks",
    "No floating characters — both must contact the ground with matching shadows",
    "No morphing, no extra or missing limbs, no distorted faces",
    "No background music — clean studio voice only",
  ],
};

/** Every pack, keyed by id. Add a new duo here and it appears everywhere automatically. */
export const CHARACTER_PACKS: Record<string, CharacterPack> = {
  [MOTU_PATLU.id]: MOTU_PATLU,
};

/** The pack for an id, or null for a normal (human-model) ad. */
export function getCharacterPack(id?: string | null): CharacterPack | null {
  if (!id) return null;
  return CHARACTER_PACKS[id] ?? null;
}

/** Options for a dropdown, in display order. */
export function characterPackOptions(): { id: string; label: string; tagline: string }[] {
  return Object.values(CHARACTER_PACKS).map(({ id, label, tagline }) => ({ id, label, tagline }));
}

/** The speaker list a script must follow, in speaking order. */
export function packSpeakers(pack: CharacterPack): { key: string; name: string }[] {
  return pack.characters.map(({ key, name }) => ({ key, name }));
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
