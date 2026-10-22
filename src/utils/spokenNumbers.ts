/**
 * Numbers in a voice-over are SPOKEN, so they are written as words — never as digits.
 *
 * ── Why this is done in code ─────────────────────────────────────────────────────────────────────
 * Every script prompt says "never use digits", and scripts still came back with "₹999", "20%" or
 * "2026" — and a member's pasted script often has them. A voice actor or Veo reading "999" in a
 * Telugu line guesses: sometimes English digits, sometimes nothing at all. So every number is turned
 * into the words a person says, in the script's own language (Telugu words in a Telugu script,
 * English words in an English one), with the Indian lakh / crore grouping people use for prices.
 *
 * Pure — unit-tested. Languages other than Telugu and English are left to the prompt and the
 * validator, which already refuse digits.
 */
import { withEnglishWords, withoutEnglishWords, withTeluguLetters } from "./englishWords";
import { withFestivalSpellings } from "./festivalNames";
import { withoutUnspokenNumbers } from "./unspokenNumbers";

// ── Telugu ────────────────────────────────────────────────────────────────────────────────────────

const TE_UNITS = ["సున్నా", "ఒకటి", "రెండు", "మూడు", "నాలుగు", "ఐదు", "ఆరు", "ఏడు", "ఎనిమిది", "తొమ్మిది"];
const TE_TEENS = ["పది", "పదకొండు", "పన్నెండు", "పదమూడు", "పద్నాలుగు", "పదిహేను", "పదహారు", "పదిహేడు", "పద్దెనిమిది", "పందొమ్మిది"];
const TE_TENS = ["", "", "ఇరవై", "ముప్పై", "నలభై", "యాభై", "అరవై", "డెబ్బై", "ఎనభై", "తొంభై"];

/** 0–99. `asMultiplier` gives "ఒక" for a trailing one, as in "ఇరవై ఒక వేలు". */
function teBelow100(n: number, asMultiplier = false): string {
  if (n < 10) return asMultiplier && n === 1 ? "ఒక" : TE_UNITS[n];
  if (n < 20) return TE_TEENS[n - 10];
  const t = Math.floor(n / 10), u = n % 10;
  if (!u) return TE_TENS[t];
  return `${TE_TENS[t]} ${asMultiplier && u === 1 ? "ఒక" : TE_UNITS[u]}`;
}

function teBelow1000(n: number): string {
  if (n < 100) return teBelow100(n);
  const h = Math.floor(n / 100), r = n % 100;
  if (!r) return h === 1 ? "వంద" : `${TE_UNITS[h]} వందలు`;
  return h === 1 ? `నూట ${teBelow100(r)}` : `${TE_UNITS[h]} వందల ${teBelow100(r)}`;
}

/** A place value with its plural, its compound form, and how "one" of it is said. */
function teGroup(count: number, one: string, plural: string, compound: string, rest: string): string {
  const head = count === 1 ? one : `${teBelow100(count, true)} ${rest ? compound : plural}`;
  return rest ? `${head} ${rest}` : head;
}

export function teluguNumberWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  n = Math.floor(n);
  if (n < 1000) return teBelow1000(n);
  if (n < 100000) {
    const t = Math.floor(n / 1000), r = n % 1000;
    return teGroup(t, "వెయ్యి", "వేలు", "వేల", r ? teBelow1000(r) : "");
  }
  if (n < 10000000) {
    const l = Math.floor(n / 100000), r = n % 100000;
    return teGroup(l, "ఒక లక్ష", "లక్షలు", "లక్షల", r ? teluguNumberWords(r) : "");
  }
  const c = Math.floor(n / 10000000), r = n % 10000000;
  const head = c === 1 ? "ఒక కోటి" : `${c < 100 ? teBelow100(c, true) : teluguNumberWords(c)} ${r ? "కోట్ల" : "కోట్లు"}`;
  return r ? `${head} ${teluguNumberWords(r)}` : head;
}

// ── English (Indian grouping) ─────────────────────────────────────────────────────────────────────

const EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
  "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enBelow1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${EN_UNITS[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) parts.push(n % 10 ? `${EN_TENS[Math.floor(n / 10)]}-${EN_UNITS[n % 10]}` : EN_TENS[n / 10]);
  else if (n > 0 || parts.length === 0) parts.push(EN_UNITS[n]);
  return parts.join(" ");
}

export function englishNumberWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  n = Math.floor(n);
  if (n < 1000) return enBelow1000(n);
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${englishNumberWords(crore)} crore`);
  if (lakh) parts.push(`${enBelow1000(lakh)} lakh`);
  if (thousand) parts.push(`${enBelow1000(thousand)} thousand`);
  if (n) parts.push(enBelow1000(n));
  return parts.join(" ");
}

// ── Spelling out a whole line ─────────────────────────────────────────────────────────────────────

type Lang = "telugu" | "english";

const langOf = (language?: string): Lang | null => {
  const l = (language || "Telugu").trim().toLowerCase();
  if (l === "english") return "english";
  if (l === "telugu" || l === "") return "telugu";
  return null;
};

const words = (n: number, lang: Lang) => (lang === "telugu" ? teluguNumberWords(n) : englishNumberWords(n));
const digitWords = (digits: string, lang: Lang) =>
  digits.split("").map((d) => (lang === "telugu" ? TE_UNITS[+d] : EN_UNITS[+d])).join(" ");
const rupees = (n: number, lang: Lang) =>
  lang === "telugu" ? `${words(n, lang)} ${n === 1 ? "రూపాయి" : "రూపాయలు"}` : `${words(n, lang)} ${n === 1 ? "rupee" : "rupees"}`;
const toInt = (raw: string) => Number(raw.replace(/,/g, ""));

/*
  ── A price with its scale (2026-10-22, the audit after the real-ad check) ─────────────────────────
  "₹25 లక్షల నుండి flats" was read "ఇరవై ఐదు రూపాయలు లక్షల నుండి" — twenty-five RUPEES lakhs — because the
  price rule turned "₹25" into rupees before it saw the scale after it; and "₹1.5 కోట్లు" lost its ".5" (the
  price rule dropped decimals) and became "ఒక రూపాయి కోట్లు". A builder's ad says its price in lakhs and crores,
  so the scale belongs to the amount and the rupees are understood: "ఇరవై ఐదు లక్షల నుండి", "ఒకటిన్నర కోట్లు",
  "twenty-five lakhs". A Telugu scale word keeps its case ending ("లక్షలకే"); a Latin one in a Telugu line is
  said in Telugu ("₹30L" → "ముప్పై లక్షలు"). Single letters (L, K, Cr) count only after ₹ / Rs — "4K video".
*/
const TE_SCALE = String.raw`లక్షలు|లక్షల|లక్ష|కోట్లు|కోట్ల|కోటి|వేలు|వేల|వెయ్యి`;
const LATIN_SCALE_WORD = String.raw`lakhs|lakh|lacs|lac|crores|crore|thousand`;
const SCALED_PRICE = new RegExp(
  String.raw`(?:(?:₹|\bRs\.?|\bINR)\s*(\d[\d,]*(?:\.\d+)?)\s*(${TE_SCALE}|${LATIN_SCALE_WORD}|cr\.?|L|K)|(\d[\d,]*(?:\.\d+)?)\s*(${TE_SCALE}|${LATIN_SCALE_WORD}))(?![A-Za-z])`,
  "gi",
);

/** An amount said before its scale: 25 → ఇరవై ఐదు, 1.5 → ఒకటిన్నర / one point five. */
function amountWords(raw: string, lang: Lang): string {
  const [whole, fraction] = raw.replace(/,/g, "").split(".");
  const n = Number(whole);
  // Before a scale Telugu counts with "ఒక": ఒక లక్ష, ఇరవై ఒక లక్షలు — never "ఒకటి లక్ష".
  const head = lang === "telugu" && n < 100 && !(fraction && !/^0+$/.test(fraction)) ? teBelow100(n, true) : words(n, lang);
  if (!fraction || /^0+$/.test(fraction)) return head;
  // "and a half" is how Telugu says .5 after a number ending in ు or ి: రెండున్నర, ఒకటిన్నర, పదిన్నర.
  if (lang === "telugu" && fraction === "5" && /[ుి]$/.test(head)) return `${head}న్నర`;
  return `${head} ${lang === "telugu" ? "పాయింట్" : "point"} ${digitWords(fraction, lang)}`;
}

/** The scale as the line's language says it: a Telugu scale word as written; a Latin one in Telugu or English words. */
function scaleWords(scale: string, amount: number, lang: Lang): string {
  if (/[\u{0C00}-\u{0C7F}]/u.test(scale)) return scale;
  const s = scale.toLowerCase().replace(/\.$/, "");
  const one = amount <= 1;
  const kind = /^(?:l|lakhs?|lacs?)$/.test(s) ? "lakh" : /^(?:cr|crores?)$/.test(s) ? "crore" : "thousand";
  if (lang === "telugu") {
    return kind === "lakh" ? (one ? "లక్ష" : "లక్షలు") : kind === "crore" ? (one ? "కోటి" : "కోట్లు") : (one ? "వెయ్యి" : "వేలు");
  }
  return kind === "lakh" ? (one ? "lakh" : "lakhs") : kind === "crore" ? "crore" : "thousand";
}

/**
 * A line with every number written as the words that are spoken, in that line's language.
 * Returns the line unchanged for a language this has no words for.
 *
 * Handled: prices (₹999, Rs. 1,500, 999/-), percentages (20%), decimals (2.5), plain and
 * comma-grouped numbers (1,00,000), and long digit runs such as phone numbers, which are read digit
 * by digit the way people say them.
 */
export function spellOutNumbers(text: string, language?: string): string {
  const lang = langOf(language);
  if (!text || !lang || !/\d/.test(text)) return text;
  const point = lang === "telugu" ? "పాయింట్" : "point";
  const percent = lang === "telugu" ? "శాతం" : "percent";
  return text
    // A price with its scale first — ₹25 లక్షల, ₹1.5 crore, Rs 30L (see SCALED_PRICE).
    .replace(SCALED_PRICE, (_m, n1, s1, n2, s2) => {
      const n = n1 ?? n2, scale = s1 ?? s2;
      return `${amountWords(n, lang)} ${scaleWords(scale, Number(n.replace(/,/g, "")), lang)}`;
    })
    // Prices: ₹ / Rs / INR before, or /- after.
    .replace(/(?:₹|\bRs\.?|\bINR)\s*(\d[\d,]*)(?:\.\d+)?(?:\s*\/-)?/gi, (_, n) => rupees(toInt(n), lang))
    .replace(/(\d[\d,]*)\s*\/-/g, (_, n) => rupees(toInt(n), lang))
    // Phone numbers, read digit by digit: a mobile (98480 12345, +91-9848012345), a landline
    // (0870 2345678) or any run of ten or more digits. Shorter runs are amounts, not phone numbers.
    .replace(/(?:\+?91[\s-]?)?(?:\d{5}[\s-]\d{5}|0\d{2,4}[\s-]\d{6,8}|\d{10,12})(?!\d)/g,
      (m) => digitWords(m.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""), lang))
    // A time of day: 9:30 → "nine thirty".
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => `${words(+h, lang)}${+m ? ` ${words(+m, lang)}` : ""}`)
    // Percentages and decimals.
    .replace(/(\d[\d,]*)(?:\.(\d+))?\s*%/g, (_, n, d) => `${words(toInt(n), lang)}${d ? ` ${point} ${digitWords(d, lang)}` : ""} ${percent}`)
    .replace(/(\d+)\.(\d+)/g, (_, n, d) => `${words(toInt(n), lang)} ${point} ${digitWords(d, lang)}`)
    // English ordinals: 1st → first. (A Telugu line reads the number itself.)
    .replace(/(\d+)(st|nd|rd|th)\b/gi, (_, n) => (lang === "english" ? englishOrdinal(+n) : words(+n, lang)))
    // Everything else, including Indian comma grouping (1,00,000).
    .replace(/\d(?:[\d,]*\d)?/g, (m) => words(toInt(m), lang))
    // "999 కే" was written with a space; the spoken price takes the case ending: రూపాయలకే, రూపాయలకి.
    // The same for a scale (2026-10-22): "₹30L కే" → ముప్పై లక్షలకే, never "లక్షలు కే".
    .replace(/(రూపాయ|లక్ష|కోట్|వే)లు\s+(కే|కి|కు)(?=[\s.,!?]|$)/g, "$1ల$2")
    .replace(/[ \t]{2,}/g, " ");
}

/** 1 → first, 22 → twenty-second, 40 → fortieth. */
export function englishOrdinal(n: number): string {
  const w = englishNumberWords(n);
  const irregular: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
  return w.replace(/([a-z]+)$/, (last) => irregular[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`));
}

// ── Words with one fixed spelling ─────────────────────────────────────────────────────────────────

/**
 * Words the team wants written exactly one way, with how Veo should say them.
 * మరియు ("and") is written exactly మరియు and pronounced "mariyu" — never a variant spelling, and
 * never swapped for another word.
 */
export const FIXED_WORDS: { word: string; say: string; variants: RegExp }[] = [
  {
    // The team hands the script to whoever records it, and they want this word ON THE PAGE as
    // "mariyu" — the Latin spelling, not the Telugu one. A reader who sees మరియు says it several
    // different ways; one fixed Latin spelling is read the same way every time. So the written
    // form IS "mariyu", in the voice-over script and in the video prompt's spoken line alike, and
    // nothing anywhere explains it — there is nothing left to explain.
    word: "mariyu",
    say: "mariyu",
    variants: new RegExp(
      [
        // The Telugu spelling itself, and every wrong vowel length the writer has produced,
        // with or without a space in the middle.
        "మరియు", "మరీయు", "మరియూ", "మరీయూ", "మరియుు", "మర్యు",
        // The English "and" in Telugu letters (2026-10-22, night — a live duo line "స్కూల్స్ అండ్ బస్ స్టాండ్"): a word
        // of its own only, never the letters inside another word.
        "(?<![\\u0C00-\\u0C7F])అండ్(?![\\u0C00-\\u0C7F])",
        "మరి\\s+యు", "మరి\\s+యూ", "మరీ\\s+యు", "మరీ\\s+యూ",
        // Latin misspellings of the same word.
        "\\bmariyoo\\b", "\\bmariu\\b", "\\bmariyu\\b",
      ].join("|"),
      "gi",
    ),
  },
];

/**
 * A line with the fixed words taken out — for checks that would otherwise object to them.
 *
 * "mariyu" is deliberately Latin inside a Telugu line, and the script validator refuses Latin
 * letters in spoken content. Without this the one spelling the team asked for would be reported as
 * a fault on every script that contains it. The same for the English words a Telugu script writes in
 * English letters (utils/englishWords, 2026-10-22: flats, slots, arrangements …).
 */
export function withoutFixedWords(text: string): string {
  if (!text) return text;
  return withoutEnglishWords(FIXED_WORDS.reduce((out, f) => out.split(f.word).join(" "), text));
}

/** A line with every variant of a fixed word written the one way the team wants. */
export function withFixedWords(text: string): string {
  if (!text) return text;
  return FIXED_WORDS.reduce((out, f) => out.replace(f.variants, f.word), text);
}

/**
 * Kept for the one thing it is still good for: proving in a test that a set of lines carries a
 * fixed word. Nothing is added to a prompt from it any more — the written word IS the spelling to
 * say, so a prompt that explained it would only be another place for the wrong spelling to appear.
 */
export function fixedWordsIn(lines: string[]): string[] {
  const all = lines.join(" ");
  return FIXED_WORDS.filter((f) => all.includes(f.word)).map((f) => f.word);
}

/**
 * All of it at once — what every spoken line goes through before it is used: no phone number, pincode
 * or door number at all (utils/unspokenNumbers, 2026-10-22 — they are printed on screen, never spoken;
 * taken out BEFORE the rest become words, or a mobile would be read digit by digit), numbers as words,
 * the fixed words, and (Telugu) the festival's fixed spelling — దసరా, never a transliteration of
 * "Dussehra" (utils/festivalNames, 2026-10-08) — and the English words a Telugu script writes in English
 * letters: ఫ్లాట్స్ → flats, ఏర్పాట్లు → arrangements (utils/englishWords, 2026-10-22) — while every OTHER
 * English word a Telugu writer put in English letters on that list goes back to Telugu letters ("2BHK" → "టూ
 * బీహెచ్‌కే", "open" → ఓపెన్), before the numbers become words so "2BHK" is never read "రెండుBHK".
 */
export function speakableLine(text: string, language?: string): string {
  return withEnglishWords(
    withFestivalSpellings(
      withFixedWords(spellOutNumbers(withTeluguLetters(withoutUnspokenNumbers(text), language), language)),
      language,
    ),
    language,
  );
}
