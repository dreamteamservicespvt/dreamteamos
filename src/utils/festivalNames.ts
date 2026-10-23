/**
 * A festival's name as a Telugu script must spell it (2026-10-08).
 *
 * ── Why ───────────────────────────────────────────────────────────────────────────────────────────
 * The owner: "Dusshera spelling is coming incorrect in the voice over script … the correct spelling is
 * దసరా." The occasion is picked from an English list ("Dasara", "Dussehra" — utils/festivals) and went
 * into the Telugu writer's prompts as that Latin word — inside the Telugu greeting template too ("… మా
 * మిత్రులు … Dussehra హృదయపూర్వక శుభాకాంక్షలు") — so the writer transliterated it, differently from run
 * to run: దుస్సెహ్రా, దుస్సేరా, దసర… The Telugu festival is దసరా, and the team reads the script aloud.
 *
 * Two halves, like `mariyu` (utils/spokenNumbers): the prompts give the writer the Telugu name
 * (`festivalNameIn`, `festivalSpellingRule` — through prompts/festivalWish), and every final script line
 * is corrected in code (`withFestivalSpellings`, run by `speakableLine`), so a writer, a repair, a refine
 * or a pasted script that still spells it another way is written దసరా.
 *
 * Telugu only: an English script may say "Dussehra" or "Dasara" as it likes. Pure; tested in
 * `src/test/festivalNames.test.ts`.
 */

const isTelugu = (language?: string | null) => {
  const l = (language || "Telugu").trim().toLowerCase();
  return l === "telugu" || l === "";
};

/** Every Latin spelling of the festival the lists, the team and the models use. */
const DUSSEHRA_LATIN = /\b(?:dussehra|dusshera|dussehara|dushera|dussera|dusehra|dusera|dasara|dasera|dashara|dasarah)\b/i;

/**
 * Vinayaka Chavithi / Ganesh Chaturthi (2026-10-23): the live Ganesha ad's final clip said "Vinayaka Chavithi
 * శుభాకాంక్షలు" in Latin letters — the deity's wish line (prompts/festivalWish deityWishLine) printed the Latin
 * name and the writer copied it. Its Telugu name is fixed like దసరా's.
 */
const VINAYAKA_LATIN = /\b(?:vinayaka?|ganesh(?:a)?|ganesa)\s*(?:chavithi|chavith|chaviti|chathurthi|chaturthi|chaturthy)\b/i;

/** The festival's Telugu name, when the occasion is one with a fixed Telugu spelling — else null. */
export function teluguFestivalName(festival?: string | null): string | null {
  if (!festival) return null;
  if (DUSSEHRA_LATIN.test(festival)) return "దసరా";
  if (VINAYAKA_LATIN.test(festival)) return "వినాయక చవితి";
  return null;
}

/** The occasion as a script in this language names it: "దసరా" in Telugu for Dussehra, else as given. */
export function festivalNameIn(festival: string, language?: string | null): string {
  return (isTelugu(language) && teluguFestivalName(festival)) || festival;
}

/** The one-sentence rule for a prompt, or "" when the festival has no fixed Telugu spelling. */
export function festivalSpellingRule(festival: string, language?: string | null): string {
  const telugu = isTelugu(language) ? teluguFestivalName(festival) : null;
  return telugu
    ? `Write the festival's name in Telugu exactly as ${telugu} — every time, never a transliteration of "${festival.trim()}".`
    : "";
}

/** A letter or sign of the Telugu script — what decides where a Telugu word starts and ends. */
const TE = "[\\u{0C00}-\\u{0C7F}]";

/**
 * Every misspelling of దసరా the writer has a reason to produce, as whole words (a suffix after it is
 * kept: "దుస్సెహ్రాకు" → "దసరాకు"). Built from parts so no bare "దసర" inside another word is touched.
 */
const DUSSEHRA_TELUGU = new RegExp(
  [
    // Dussehra / Dussera transliterated: దుస్సెహ్రా, దుస్సేహ్రా, దుస్సెహరా, దుసెరా, దుస్సేరా …
    `(?<!${TE})దు(?:స్స|స|ష)[ెే](?:హ్ర|హర|ర)ా`,
    // Dasera / Dassera: దసెరా, దసేరా, దస్సెరా, దస్సేరా
    `(?<!${TE})ద(?:స్స|స)[ెే]రా`,
    // Doubled letters and the long vowel twice: దస్సరా, దసర్రా, దసరాా
    `(?<!${TE})దస్సరా`,
    `(?<!${TE})దసర్రా`,
    `(?<!${TE})దసరాా+`,
    // Dashara with ష / శ: దశరా, దషరా — never దశరథ (Dasharatha), which has no ా after ర.
    `(?<!${TE})ద[శష]రా`,
    // The long vowel dropped, as a whole word: "దసర పండుగ" → "దసరా పండుగ".
    `(?<!${TE})దసర(?!${TE})`,
  ].join("|"),
  "gu",
);

/** The Latin spellings, inside a Telugu line (the validator objects to Latin letters anyway). */
const DUSSEHRA_LATIN_ALL = new RegExp(DUSSEHRA_LATIN.source, "gi");
const VINAYAKA_LATIN_ALL = new RegExp(VINAYAKA_LATIN.source, "gi");

/** A Telugu script line with the festival spelled the one way the team wants. Other languages: unchanged. */
export function withFestivalSpellings(text: string, language?: string | null): string {
  if (!text || !isTelugu(language)) return text;
  return text.replace(DUSSEHRA_TELUGU, "దసరా").replace(DUSSEHRA_LATIN_ALL, "దసరా")
    .replace(VINAYAKA_LATIN_ALL, "వినాయక చవితి");
}
