/**
 * English words a Telugu voice-over writes in ENGLISH letters (owner, 2026-10-22).
 *
 * ── Why ───────────────────────────────────────────────────────────────────────────────────────────
 * The owner: "in the voice over script for words ఫ్లాట్స్ — flats, ఫ్లాట్ — flat, స్లాట్స్ — slots … write
 * this English words", and "don't add complex words in the script like ఏర్పాట్లు — for words like them add
 * Arrangements". Two faults with one fix:
 *   • an English word in Telugu letters is read with Telugu sounds — Telugu has no short "a" of "flat" or
 *     short "o" of "slot", and ఫ is "pha" — so ఫ్లాట్స్ came out "phlaats" in the voice and on the page the
 *     team reads aloud;
 *   • a formal Telugu noun (ఏర్పాట్లు, సదుపాయాలు) is a word nobody says to a customer — they say the English
 *     word: "arrangements", "facilities".
 * So these words are written in English letters INSIDE the Telugu line, the way `mariyu` is
 * (utils/spokenNumbers FIXED_WORDS): the prompts ask for it (`englishWordsRule`, through
 * prompts/everydaySpeech), and every final line is corrected in code (`withEnglishWords`, run by
 * `speakableLine`), so a writer, a repair, a refine or a pasted script that still writes ఫ్లాట్స్ or
 * ఏర్పాట్లు ships "flats" / "arrangements". A Telugu case ending stays joined to the word — ఫ్లాట్స్‌లో →
 * "flatsలో", ఏర్పాట్లతో → "arrangementsతో" — so the spoken word count never changes (utils/scriptContract
 * counts "flatsలో" as one word, as it counted ఫ్లాట్స్‌లో). The validator's "no Latin letters" check and
 * the quality judge skip these words exactly as they skip `mariyu` (`withoutFixedWords`).
 *
 * The owner chose "your words + similar ones" (2026-10-22): the four named, plus the same kind — the
 * property and booking nouns an ad says, and the formal Telugu nouns for "facilities". Everyday English
 * words people already say in Telugu letters (ఆఫర్, ఫ్రీ, సర్వీస్, షాప్) stay in Telugu letters.
 *
 * Telugu only; every other language is returned as it is. Pure; tested in `src/test/adGenOct22.test.ts`.
 */

export interface EnglishWord {
  /** The singular, as the script writes it. */
  one: string;
  /** The plural, as the script writes it. */
  many: string;
  /** Telugu-letter spellings of the singular — a case ending after them is kept ("ఫ్లాట్లో" → "flatలో"). */
  te: string[];
  /** Telugu-letter spellings that are already plural: the English "-s" (ఫ్లాట్స్) or the Telugu "-లు / -ల" (ఫ్లాట్లు). */
  tePlural: string[];
  /** The verb people say before "do" (చేశాం, చేస్తాం…): "ఏర్పాటు చేశాం" → "arrange చేశాం", never "arrangement చేశాం". */
  verb?: string;
  /** The Telugu word it replaces, for the prompt's "never …" note. */
  never?: string;
}

export const ENGLISH_WORDS: EnglishWord[] = [
  { one: "flat", many: "flats", te: ["ఫ్లాట్"], tePlural: ["ఫ్లాట్స్", "ఫ్లాట్లు", "ఫ్లాట్ల"] },
  { one: "slot", many: "slots", te: ["స్లాట్"], tePlural: ["స్లాట్స్", "స్లాట్లు", "స్లాట్ల"] },
  { one: "plot", many: "plots", te: ["ప్లాట్"], tePlural: ["ప్లాట్స్", "ప్లాట్లు", "ప్లాట్ల"] },
  { one: "villa", many: "villas", te: ["విల్లా"], tePlural: ["విల్లాస్", "విల్లాలు", "విల్లాల"] },
  { one: "apartment", many: "apartments", te: ["అపార్ట్మెంట్"], tePlural: ["అపార్ట్మెంట్స్", "అపార్ట్మెంట్లు", "అపార్ట్మెంట్ల"] },
  { one: "booking", many: "bookings", te: ["బుకింగ్"], tePlural: ["బుకింగ్స్", "బుకింగ్లు", "బుకింగ్ల"] },
  {
    one: "arrangement", many: "arrangements", te: ["ఏర్పాటు"], tePlural: ["ఏర్పాట్లు", "ఏర్పాట్ల"],
    verb: "arrange", never: "ఏర్పాట్లు",
  },
  {
    // సౌకర్యం alone also means comfort ("మీ సౌకర్యం కోసం") and వసతి a place to stay, so only their plurals
    // — the "facilities" of an ad — are replaced.
    one: "facility", many: "facilities", te: ["సదుపాయం"],
    tePlural: ["సదుపాయాలు", "సదుపాయాల", "సౌకర్యాలు", "సౌకర్యాల", "వసతులు", "వసతుల"],
    never: "సౌకర్యాలు / సదుపాయాలు / వసతులు",
  },
];

/** The Telugu endings that may stay joined to one of these words: in / to / with / of / only / even… */
const ENDINGS = new Set([
  "", "లో", "లోని", "లోనే", "లోకి", "కి", "కు", "కే", "కైనా", "ను", "ని", "నే", "నూ", "తో", "తోనే", "దే", "కోసం",
]);

/** A Telugu word: its letters and signs, with the zero-width joiners a writer puts between a word and its ending. */
const TELUGU_WORD = /[\u{0C00}-\u{0C7F}\u{200C}\u{200D}]+/gu;
const JOINERS = /[\u{200C}\u{200D}]/gu;
const TE = "[\\u{0C00}-\\u{0C7F}]";

/** Every form, longest first, so ఫ్లాట్స్ is tried before ఫ్లాట్ and ఫ్లాట్లు before ఫ్లాట్ల. */
const FORMS: { form: string; english: string }[] = ENGLISH_WORDS
  .flatMap((w) => [
    ...w.tePlural.map((form) => ({ form, english: w.many })),
    ...w.te.map((form) => ({ form, english: w.one })),
  ])
  .sort((a, b) => b.form.length - a.form.length);

/** "ఏర్పాటు చేశాం / చేస్తాం / చేసి / చెయ్యండి …" — the noun before a "do" verb is the English verb. */
const VERB_FORMS = ENGLISH_WORDS.filter((w) => w.verb).map((w) => ({
  pattern: new RegExp(`(?<!${TE})(?:${w.te.join("|")})\\u{200C}?(?=\\s+(?:చే|చెయ్య|చెయ|చేయ))`, "gu"),
  verb: w.verb!,
}));

/** These words already written in Latin letters, in any case — what the "no Latin letters" checks skip. */
const LATIN_FORMS = new RegExp(
  `(?<![A-Za-z])(?:${[...new Set(ENGLISH_WORDS.flatMap((w) => [w.many, w.one, ...(w.verb ? [w.verb] : [])]))]
    .sort((a, b) => b.length - a.length).join("|")})(?![A-Za-z])`,
  "gi",
);

const isTelugu = (language?: string | null) => {
  const l = (language || "Telugu").trim().toLowerCase();
  return l === "telugu" || l === "";
};

/** One Telugu word as the script must write it: an English word (with its Telugu ending kept), or itself. */
function englishFor(word: string): string {
  const bare = word.replace(JOINERS, "");
  for (const { form, english } of FORMS) {
    if (!bare.startsWith(form)) continue;
    const ending = bare.slice(form.length);
    if (ENDINGS.has(ending)) return `${english}${ending}`;
  }
  return word;
}

/**
 * A Telugu script line with these words in English letters: ఫ్లాట్స్ → flats, స్లాట్స్‌లో → slotsలో, ఏర్పాట్లు
 * → arrangements, ఏర్పాటు చేశాం → arrange చేశాం. Other languages, and a line without them: unchanged.
 */
export function withEnglishWords(text: string, language?: string | null): string {
  if (!text || !isTelugu(language)) return text;
  return VERB_FORMS
    .reduce((acc, v) => acc.replace(v.pattern, v.verb), text)
    .replace(TELUGU_WORD, (word) => englishFor(word));
}

/**
 * A line with these English words taken out — for the checks that refuse Latin letters in a Telugu line
 * (they are deliberately Latin, like `mariyu`; see utils/spokenNumbers withoutFixedWords).
 */
export function withoutEnglishWords(text: string): string {
  return text ? text.replace(LATIN_FORMS, " ") : text;
}

/** The English words, as a prompt lists them: "flats / flat, slots / slot, …". */
export function englishWordList(): string {
  return ENGLISH_WORDS.map((w) => `${w.many} / ${w.one}`).join(", ");
}

/**
 * What a "no Latin letters in spoken content" rule must leave out, for a prompt that states one — "" for
 * every other language. Without it a writer told "no Latin letters" would undo what the code writes.
 */
export function latinLettersException(language?: string | null): string {
  return isTelugu(language)
    ? ` (except mariyu and ONLY these English words in English letters: ${englishWordList()} — every other English word stays in Telugu letters)`
    : "";
}

/** "BHK" as a Telugu script writes it (the joiner keeps చ్ and కే apart). */
const BHK = "బీహెచ్\u{200C}కే";

/**
 * The English words that must STAY in Telugu letters — named in the prompt beside the list AND written back in code.
 * The first live run (2026-10-22, a flats builder's Diwali ad on gemini-2.5-flash) took "these words in English
 * letters" as licence for every English word — "2BHK", "open plots", "bank loan", "booking open" came back in Latin,
 * the validator refused each, and the repairs never settled (the run stopped on the word contract). Naming them in
 * the prompt was not enough either: the next full run shipped "రెండుBHK, మూడుBHK flats mariyu open plots" at 7/10
 * (stalled), every repair putting the Latin back. So, like `withEnglishWords` the other way round, `withTeluguLetters`
 * writes these in Telugu letters on every final line (run by `speakableLine`, before numbers become words).
 * `shown: false` keeps a plural out of the prompt's list.
 */
const TELUGU_LETTER_WORDS: { latin: string; te: string; shown?: false }[] = [
  { latin: "open", te: "ఓపెన్" },
  { latin: "bank", te: "బ్యాంక్" },
  { latin: "loan", te: "లోన్" },
  { latin: "loans", te: "లోన్స్", shown: false },
  { latin: "parking", te: "పార్కింగ్" },
  { latin: "car", te: "కార్" },
  { latin: "security", te: "సెక్యూరిటీ" },
  { latin: "offer", te: "ఆఫర్" },
  { latin: "offers", te: "ఆఫర్స్", shown: false },
  { latin: "free", te: "ఫ్రీ" },
  { latin: "service", te: "సర్వీస్" },
  { latin: "services", te: "సర్వీసెస్", shown: false },
  { latin: "shop", te: "షాప్" },
  { latin: "BHK", te: BHK, shown: false },
];

/** "2BHK" / "3 BHK" / "2-BHK" is said in English: "టూ బీహెచ్‌కే". */
const BHK_NUMBER: Record<string, string> = { "1": "వన్", "2": "టూ", "3": "త్రీ", "4": "ఫోర్", "5": "ఫైవ్" };
const NUMBERED_BHK = /(?<![\d.,])([1-5])\s*-?\s*BHK(?![A-Za-z])/gi;
const LATIN_TELUGU_WORD = new RegExp(
  `(?<![A-Za-z])(${TELUGU_LETTER_WORDS.map((w) => w.latin).sort((a, b) => b.length - a.length).join("|")})(?![A-Za-z])`,
  "gi",
);
const TELUGU_LETTER_OF = new Map(TELUGU_LETTER_WORDS.map((w) => [w.latin.toLowerCase(), w.te]));
const IS_TELUGU_LETTER = /[\u{0C00}-\u{0C7F}]/u;
const VIRAMA = "\u{0C4D}";

/**
 * A Telugu script line with these English words back in Telugu letters: "2BHK" → "టూ బీహెచ్‌కే", "open plots" →
 * "ఓపెన్ plots", "bank loanతో" → "బ్యాంక్ లోన్‌తో", "రెండుBHK" → "రెండు బీహెచ్‌కే". A Telugu ending stays joined (with a
 * joiner after a final virama, as Telugu writes "లోన్‌తో"); a Telugu word glued in front gets its space back. Other
 * languages, and a line without them: unchanged.
 */
export function withTeluguLetters(text: string, language?: string | null): string {
  if (!text || !isTelugu(language)) return text;
  return text
    .replace(NUMBERED_BHK, (_m, n: string) => `${BHK_NUMBER[n]} ${BHK}`)
    .replace(LATIN_TELUGU_WORD, (word: string, _w: string, at: number, whole: string) => {
      const te = TELUGU_LETTER_OF.get(word.toLowerCase()) ?? word;
      const before = at > 0 && IS_TELUGU_LETTER.test(whole[at - 1]) ? " " : "";
      const next = whole[at + word.length] ?? "";
      const joiner = IS_TELUGU_LETTER.test(next) && te.endsWith(VIRAMA) ? "\u{200C}" : "";
      return `${before}${te}${joiner}`;
    });
}

/** The words that stay in Telugu letters, as the prompt lists them. */
const STAYS_TELUGU = `${TELUGU_LETTER_WORDS.filter((w) => w.shown !== false).map((w) => w.te).join(", ")}, `
  + `టూ ${BHK} (never 2BHK), త్రీ ${BHK}`;

/**
 * The rule as every Telugu writer, repairer, reviewer, editor and judge reads it (prompts/everydaySpeech,
 * prompts/scriptQa, prompts/characterAd). "" for every other language.
 */
export function englishWordsRule(language?: string | null): string {
  if (!isTelugu(language)) return "";
  const never = ENGLISH_WORDS.filter((w) => w.never).map((w) => `${w.many} (never ${w.never})`).join("; ");
  return `ONLY these words are written in ENGLISH letters inside the Telugu line, exactly as here — never in Telugu letters: `
    + `${englishWordList()}${never ? `; ${never}` : ""}; "arrange చేశాం" for ఏర్పాటు చేశాం. A Telugu case ending stays `
    + `joined to the word: flatsలో, plotsకి, arrangementsతో. They are not "Latin letters in spoken content" — like mariyu, `
    + `they are the required spelling. EVERY OTHER English word stays in Telugu letters, exactly as before — ${STAYS_TELUGU}; `
    + `never a business name, a number, an abbreviation or any other word in English letters.`;
}
