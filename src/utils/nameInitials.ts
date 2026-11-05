/**
 * The initials in a business name ("A S Aqua Solutions", "K.V.R. Jewellers", "SVR Traders") — said letter by letter.
 *
 * ── Why this exists (2026-11-05) ─────────────────────────────────────────────────────────────────
 * The owner: "if the business name is A S Aqua Solutions it was giving like ఎస్ for some businesses". A Telugu
 * script says the name in Telugu letters (the run asks for its spelling once — geminiService nativeNamePromise), and
 * the initials came back wrong in two ways: the model dropped the "A" (an English article to it) or wrote them
 * "ఏ.ఎస్." and the clean-up took the dots out with nothing in their place, so a voice read "ఏఎస్" as one word —
 * "ఎస్". Nothing checked them. Now the initials are spelt in CODE, each letter by its English name in Telugu letters
 * (A → ఏ, S → ఎస్), handed to the model as fixed, and put back in the answer and in every spoken line when they were
 * lost or changed. Only the initials are touched; the rest of the name keeps the model's spelling.
 *
 * Pure — no React, no Firestore, no model call — so it is unit-tested.
 */

/** Each English letter's name as Telugu says it. */
export const TELUGU_LETTER_NAMES: Record<string, string> = {
  A: "ఏ", B: "బీ", C: "సీ", D: "డీ", E: "ఈ", F: "ఎఫ్", G: "జీ", H: "హెచ్", I: "ఐ", J: "జే", K: "కే", L: "ఎల్", M: "ఎం",
  N: "ఎన్", O: "ఓ", P: "పీ", Q: "క్యూ", R: "ఆర్", S: "ఎస్", T: "టీ", U: "యూ", V: "వీ", W: "డబ్ల్యూ", X: "ఎక్స్", Y: "వై",
  Z: "జెడ్",
};

/** Short capital words that are words, not initials ("SRI Sai Traders", "OM Sakthi"). */
const CAPITAL_WORDS = new Set(["SRI", "SREE", "SHRI", "SAI", "OM", "NEW", "BIG", "TOP", "ONE", "ALL", "OUR", "THE", "AND", "RAM", "RAJ", "SUN", "GOLD", "ART", "ARTS", "ICE", "FUN", "JOY", "AQUA", "INFRA"]);

const isTelugu = (language?: string | null) => (language || "telugu").trim().toLowerCase() === "telugu";

/**
 * The letters a token stands for when it is initials, else null: "A" / "S" (one capital), "A.S." / "K.V.R" (dotted),
 * "SVR" (capitals with no vowel), and in a name that is not all capitals a short capital word that is not a word
 * ("AS Aqua Solutions"). A lower-case "a" is a word.
 */
export function initialsOf(token: string, nameIsAllCaps: boolean): string[] | null {
  const t = token.trim();
  if (/^[A-Z]$/.test(t)) return [t];
  if (/^(?:[A-Za-z]\.){1,5}[A-Za-z]?\.?$/.test(t)) return t.replace(/\./g, "").toUpperCase().split("");
  if (/^[A-Z]{2,4}$/.test(t) && !CAPITAL_WORDS.has(t)) {
    if (!/[AEIOU]/.test(t)) return t.split("");
    if (!nameIsAllCaps && t.length <= 3) return t.split("");
  }
  return null;
}

interface NamePart { text: string; letters: string[] | null }

/** The name in parts, each one initials or a word. */
function partsOf(name: string): NamePart[] {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const allCaps = !/[a-z]/.test(name);
  return tokens.map((text) => ({ text, letters: initialsOf(text.replace(/[,]+$/, ""), allCaps) }));
}

/** True when the name has initials. */
export function hasInitials(name?: string | null): boolean {
  return !!name && partsOf(name).some((p) => p.letters);
}

/** The initials as Telugu says them, in order: "A S Aqua Solutions" → ["ఏ ఎస్"]. */
export function teluguInitialRuns(name: string): string[] {
  const runs: string[][] = [];
  let current: string[] = [];
  for (const p of partsOf(name)) {
    if (p.letters) current.push(...p.letters.map((l) => TELUGU_LETTER_NAMES[l]));
    else if (current.length) { runs.push(current); current = []; }
  }
  if (current.length) runs.push(current);
  return runs.map((r) => r.join(" "));
}

/**
 * The name with its initials already in Telugu letters and its words still English — what the spelling request is
 * given, so the model only spells the words: "A S Aqua Solutions" → "ఏ ఎస్ Aqua Solutions". Other languages and a
 * name without initials: unchanged.
 */
export function nameWithTeluguInitials(name: string, language?: string | null): string {
  if (!name || !isTelugu(language) || !hasInitials(name)) return name;
  return partsOf(name).map((p) => (p.letters ? p.letters.map((l) => TELUGU_LETTER_NAMES[l]).join(" ") : p.text)).join(" ");
}

/**
 * An English ad's all-capitals name said as words, its initials kept as capitals: "A S AQUA SOLUTIONS" →
 * "A S Aqua Solutions", "SVR JEWELLERS" → "SVR Jewellers" (was "Svr Jewellers", read as one word).
 */
export function titleCaseName(name: string): string {
  return partsOf(name)
    .map((p) => (p.letters ? p.text.toUpperCase() : p.text.toLowerCase().replace(/(^|[-'.])([a-z])/g, (_m, b: string, c: string) => b + c.toUpperCase())))
    .join(" ");
}

/** Any letter name, or a short Telugu "letter" the model wrote for one (ఎ, ఎస్, ఏఎస్ …), with dots between. */
const LETTERISH = String.raw`(?:${[...new Set([...Object.values(TELUGU_LETTER_NAMES), "ఎ", "ఎయ్", "యే", "ఎఫ్", "ఎచ్", "జె", "కె", "పి", "టి", "వి", "బి", "సి", "డి", "జి"])].sort((a, b) => b.length - a.length).join("|")})`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NOT_AFTER_TE = String.raw`(?<![\u{0C00}-\u{0C7F}A-Za-z])`;

/**
 * The Telugu spelling the model gave, with the initials put right: the dots it wrote become spaces, and when the
 * initials are missing or changed ("ఎస్ ఆక్వా సొల్యూషన్స్", "ఏఎస్ ఆక్వా …") the code's own are put in front of (or
 * after) the words. A name without initials, another language, or "" — unchanged.
 */
export function withSpokenInitials(native: string, latinName: string, language?: string | null): string {
  const text = (native || "").replace(/\s*\.\s*/g, " ").replace(/\s+/g, " ").trim();
  if (!text || !isTelugu(language) || !hasInitials(latinName)) return text;
  const parts = partsOf(latinName);
  const runs = teluguInitialRuns(latinName);
  if (runs.every((r) => new RegExp(`${NOT_AFTER_TE}${escape(r)}(?![\\u{0C00}-\\u{0C7F}])`, "u").test(text))) return text;
  const wordCount = parts.filter((p) => !p.letters).length;
  const leading = parts.findIndex((p) => !p.letters);
  // Initials only at the front ("A S Aqua Solutions") or only at the end ("Balaji A S"): the words are the native's
  // last / first words, the letters the code's.
  const front = parts.slice(0, leading === -1 ? parts.length : leading).every((p) => p.letters) && parts.slice(leading).every((p) => !p.letters);
  const lastWordAt = parts.length - 1 - [...parts].reverse().findIndex((p) => !p.letters);
  const back = parts.slice(0, lastWordAt + 1).every((p) => !p.letters) && parts.slice(lastWordAt + 1).every((p) => p.letters);
  if (wordCount === 0) return runs.join(" ");
  const words = text.split(" ");
  // Fewer words than the name has: the model merged or dropped one — its spelling cannot be lined up, so the run
  // keeps it as it is rather than guess.
  if (words.length < wordCount) return text;
  if (front && leading > 0) return `${runs[0]} ${words.slice(-wordCount).join(" ")}`;
  if (back) return `${words.slice(0, wordCount).join(" ")} ${runs[runs.length - 1]}`;
  return text;
}

/**
 * A spoken line with the name's initials put right where the writer wrote them wrong: "ఎస్ ఆక్వా సొల్యూషన్స్‌లో" →
 * "ఏ ఎస్ ఆక్వా సొల్యూషన్స్‌లో". Only where letter-like words stand right before the rest of the name — the words alone
 * ("ఆక్వా సొల్యూషన్స్") are never given initials, since they may not be the name.
 */
export function withNameInitialsInLine(text: string, native: string, latinName?: string | null): string {
  if (!text || !native || !latinName || !hasInitials(latinName)) return text;
  const runs = teluguInitialRuns(latinName);
  const initials = runs[0];
  if (!initials || !native.startsWith(initials + " ")) return text;
  const rest = native.slice(initials.length + 1).trim();
  if (!rest) return text;
  const wrong = new RegExp(String.raw`${NOT_AFTER_TE}(?:${LETTERISH}[\s.]*){1,6}${escape(rest)}`, "gu");
  return text.replace(wrong, (m) => (m.startsWith(initials + " ") && m.slice(initials.length + 1).trim() === rest ? m : native));
}
