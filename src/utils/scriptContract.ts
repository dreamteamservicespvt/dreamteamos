/**
 * THE voice-over word contract — how many words an 8-second clip may hold, and how they are counted.
 *
 * ── The rule (owner, 2026-10-15) ────────────────────────────────────────────────────────────────────
 * Every clip of every script the platform WRITES holds 17–20 spoken words: 18–19 preferred, 20 the hard
 * ceiling (21 is never allowed), 17 the floor. It is the same for every cast — one presenter, a human
 * pair, the two real owners, two children, a cartoon solo or duo, a deity — for a commercial and a
 * festival ad, in every language. In a two-person clip the two lines TOGETHER make the 17–20 (about 8–10
 * each); a single speaker's one line is the whole 17–20.
 *
 * ── Why one module ───────────────────────────────────────────────────────────────────────────────────
 * Until 2026-10-15 three bands lived side by side — 18–20 for one voice, 15–17 for a pair, an unused
 * 13–15 for two children — and two different counters disagreed about the same line: one counted a dash
 * or an ellipsis standing between two words as a word, the other split "don't" into two. A clip could
 * pass one check and fail the other, and a script was asked for one number by the writer and judged by
 * another. Every prompt, validator, repair, the quality gate, the refine editor, the Script Duration
 * Checker and the studio's counters now read THIS file; nothing else defines a band or counts words.
 *
 * A member's OWN script (Configuration → custom script, Input Final Script) is used word for word and is
 * never held to the band — it is only counted and shown (utils/customScript).
 */

/** The floor: fewer leaves dead air in an 8-second clip. */
export const MIN_WORDS_PER_CLIP = 17;
/** The hard ceiling: exactly 20 is allowed, 21 never is. */
export const MAX_WORDS_PER_CLIP = 20;
/** Where a writer should aim — the comfortable middle of the band. */
export const PREFERRED_WORDS_PER_CLIP = { min: 18, max: 19 } as const;
/** The pace a clip is planned at, for estimating clips from raw text (the middle of the preferred range). */
export const TARGET_WORDS_PER_CLIP = 18.5;

/**
 * One speaker's share of a two-person clip. The CLIP total is the rule (17–20); this only keeps the split
 * fair, so neither speaker is left a two-word reply nor given the whole eight seconds. Aim for 8–10 each.
 */
export const MIN_WORDS_PER_LINE = 7;
export const MAX_WORDS_PER_LINE = 12;
export const PREFERRED_WORDS_PER_LINE = { min: 8, max: 10 } as const;

export interface WordBudget {
  minClip: number;
  maxClip: number;
  minLine: number;
  maxLine: number;
}

/**
 * The budget for a clip, given how many people speak in it. The CLIP band is the same for every cast;
 * only the line band differs — with one speaker the line IS the clip.
 *
 * `options.children` is accepted for old callers and changes nothing: the children's 13–15 band (2026-10-01)
 * and the pair's 15–17 band (2026-09-22) were replaced by the one contract on 2026-10-15. Children are kept
 * natural by simple words and short sentences in their prompt, not by a smaller budget.
 */
export function wordBudgetFor(speakerCount: number, _options: { children?: boolean } = {}): WordBudget {
  const solo = speakerCount <= 1;
  return {
    minClip: MIN_WORDS_PER_CLIP,
    maxClip: MAX_WORDS_PER_CLIP,
    minLine: solo ? MIN_WORDS_PER_CLIP : MIN_WORDS_PER_LINE,
    maxLine: solo ? MAX_WORDS_PER_CLIP : MAX_WORDS_PER_LINE,
  };
}

// ── Counting ──────────────────────────────────────────────────────────────────────────────────────

/** Stands in for an apostrophe inside a word while the line is split (a private-use character). */
const IN_WORD_APOSTROPHE = "\u{E000}";

/**
 * The words a listener hears, in order — the ONE tokenizer.
 *
 * • Punctuation and symbols never make a word: a dash or an ellipsis between two words, quotes, brackets,
 *   the Hindi danda (।), emoji — all separate words and are never counted.
 * • An apostrophe INSIDE a word keeps it one word ("don't", "Lakshmi's"); one at an edge is a quote mark.
 * • "&" is said aloud ("Tea & Coffee" is three spoken words), so it counts as the word "and".
 * • Any script counts: Telugu vowel signs, the virama and the zero-width joiners inside a word stay in it
 *   (స్క్రీన్‌పై is one word), and a Latin word inside a Telugu line ("mariyu", a brand) is one word.
 * • A zero-width space between two words separates them, like any space.
 * A token is a word only when it carries a letter or a digit.
 */
export function spokenWordsOf(text: string): string[] {
  return (text || "")
    .replace(/&/g, " and ")
    .replace(/(?<=[\p{L}\p{M}])['’ʼ‘](?=\p{L})/gu, IN_WORD_APOSTROPHE)
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .split(/[\s\u{200B}\u{FEFF}]+/u)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .map((w) => w.split(IN_WORD_APOSTROPHE).join("'"));
}

/** How many words a listener hears in this text. Punctuation never counts — see spokenWordsOf. */
export function countSpokenWords(text: string): number {
  return spokenWordsOf(text).length;
}

/**
 * The spoken text of ONE raw clip line as a person may paste or display it: the clip header
 * (`0-8:`, `clip-1[0-8sec]:`, `Clip 1 (0-8 sec) -`, `Scene 1:`), a canonical dialogue prefix
 * (`0-8|motu:`) and a speaker label at the start of a line (`[Motu]:`, `Motu:` when it is a known
 * speaker) are structure, not speech. Everything else is kept.
 */
export function spokenTextOf(raw: string, speakerNames: string[] = []): string {
  const known = new Set(speakerNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  return (raw || "")
    .split(/\r?\n/)
    .map((line) => {
      let rest = line
        // clip-1[0-8sec]: / clip 1 (0-8 sec) - / Clip 1:
        .replace(/^\s*\**\s*clip[\s_-]*\d+\s*(?:[[(]\s*\d+\s*[-–]\s*\d+\s*(?:sec|s)?\s*[\])])?\s*\**\s*[:：\-–]?\s*/i, "")
        // Scene 1: / Segment 1:
        .replace(/^\s*(?:scene|segment)\s*\d+\s*[:：\-–]\s*/i, "")
        // [0-8sec]: / 0-8: / 0-8sec: / 0-8|motu:
        .replace(/^\s*\[?\s*\d{1,3}\s*[-–]\s*\d{1,3}\s*(?:sec|s)?\s*\]?\s*(?:\|\s*[^:：\n]{1,40}?)?\s*[:：]\s*/i, "");
      // [Motu]: — any bracketed label at the start of a line is a speaker label.
      rest = rest.replace(/^\s*\[\s*[^\]\n]{1,40}\]\s*[:：]\s*/, "");
      // Motu: — only a speaker this ad has; "Offer: 20% off" is speech.
      const plain = rest.match(/^\s*([^:：\n]{1,40}?)\s*[:：]\s*/);
      if (plain && known.has(plain[1].trim().toLowerCase())) rest = rest.slice(plain[0].length);
      return rest;
    })
    .join("\n")
    .trim();
}

// ── Checking ──────────────────────────────────────────────────────────────────────────────────────

/** True when a clip of `count` spoken words obeys the contract. */
export function inWordBand(count: number): boolean {
  return count >= MIN_WORDS_PER_CLIP && count <= MAX_WORDS_PER_CLIP;
}

/**
 * The one wording of a clip's word-count failure. Both validators (one voice and a cast) use it, the
 * repair reads it (utils/voiceOverRefine repairDirection parses "has N"), and the gate recognises it
 * (isWordCountIssue) — so a count is never reported two ways.
 */
export function clipWordCountIssue(clipNumber: number, count: number, cast = false): string | null {
  if (inWordBand(count)) return null;
  return `Clip ${clipNumber} must contain ${MIN_WORDS_PER_CLIP}–${MAX_WORDS_PER_CLIP} spoken words${cast ? " across both lines together" : ""}, but it has ${count}.`;
}

/** Recognises a clip word-count failure in an issue list (see clipWordCountIssue). */
export function isWordCountIssue(issue: string): boolean {
  return /^Clip \d+ must contain \d+[–-]\d+ spoken words\b/.test(issue);
}

/** How far a set of clip counts sits outside the band, in words, summed — 0 when every clip is inside. */
export function bandDistance(counts: number[]): number {
  return counts.reduce((sum, n) => sum + (n < MIN_WORDS_PER_CLIP ? MIN_WORDS_PER_CLIP - n : n > MAX_WORDS_PER_CLIP ? n - MAX_WORDS_PER_CLIP : 0), 0);
}

/**
 * What may never ship in a script the platform wrote — checked in code on the EXACT final text, after
 * every rewrite, repair, spelling pass and formatting step. A clip outside 17–20 words, an empty clip, a
 * clip that repeats another word for word, or the wrong number of clips — and, in a Telugu script (pass its
 * `language`), a clip over the syllable CEILING, which Flow cannot say in eight seconds (2026-10-22). (Who
 * speaks is checked by utils/dialogueFormat castIntegrityIssues for a cast.) Returns [] when the script may ship.
 */
export function contractViolations(clipTexts: string[], expectedClips: number, cast = false, language?: string | null): string[] {
  const issues: string[] = [];
  if (clipTexts.length !== expectedClips) issues.push(`Expected exactly ${expectedClips} clips but got ${clipTexts.length}.`);
  const seen = new Map<string, number>();
  clipTexts.forEach((text, i) => {
    const n = i + 1;
    const words = spokenWordsOf(text);
    if (words.length === 0) {
      issues.push(`Clip ${n} is empty.`);
      return;
    }
    const countIssue = clipWordCountIssue(n, words.length, cast);
    if (countIssue) issues.push(countIssue);
    if (language !== undefined && measuresSyllables(language)) {
      const tooLong = clipSyllableIssue(n, spokenSyllables(text), cast, syllableLimitsFor(cast).ceiling);
      if (tooLong) issues.push(tooLong);
    }
    const key = words.join(" ").toLowerCase();
    const first = seen.get(key);
    if (typeof first === "number") issues.push(`Clip ${n} duplicates clip ${first}.`);
    else seen.set(key, n);
  });
  return issues;
}

/*
  ── A pair's line over 12 words is a hard rule (2026-10-23 — the owner's decision) ───────────────────
  The live Male & Female duo of 2026-10-23 morning: the boy's 13-word / 31-syllable second line was CUT at 8 s,
  mid-price, though the clip (both lines) was inside 17–20 words and its syllable ceiling. The 7–12 line split was
  only a repair aim (dialogueFormat validateDialogueClips) and never reached the final gate. Since then a line
  over MAX_WORDS_PER_LINE in a two-person clip is a violation like a clip outside 17–20: the quality loop repairs
  it and a script that still has one stops the run. The 7-word floor stays an aim (a short reply is not cut off).
*/
/** "Clip 2: Boy's line is 13 words …" for every line of a two-person clip over MAX_WORDS_PER_LINE. */
export function pairLineIssues(clipLines: { name: string; text: string }[][]): string[] {
  const issues: string[] = [];
  clipLines.forEach((lines, i) => {
    if (lines.length < 2) return;
    for (const line of lines) {
      const words = countSpokenWords(line.text);
      // Never "has N" — the word-count repair reads that phrase as the CLIP's count (voiceOverRefine repairDirection).
      if (words > MAX_WORDS_PER_LINE) {
        issues.push(`Clip ${i + 1}: ${line.name}'s line is ${words} words — at most ${MAX_WORDS_PER_LINE} fit in one speaker's half of the 8 seconds. `
          + `Move words to the other line or say it with fewer words, keeping the clip at ${MIN_WORDS_PER_CLIP}–${MAX_WORDS_PER_CLIP} words.`);
      }
    }
  });
  return issues;
}

/** Recognises a pair-line failure in an issue list (see pairLineIssues). */
export function isPairLineIssue(issue: string): boolean {
  return /^Clip \d+: .+'s line is \d+ words — at most \d+ fit in one speaker's half\b/.test(issue);
}

// ── How long a clip takes to SAY (2026-10-22, measured in Flow) ───────────────────────────────────

/*
  ── Why words alone were not enough ──────────────────────────────────────────────────────────────
  The owner's real-ad check (2026-10-22, a Telugu Diwali ad on the JPN Flow account): a greeting clip of
  19 words / 58 syllables was CUT at 8 s — the wish word itself never said — and after it was shortened, a
  clip of 18 words / 54 syllables was said whole but ran to 7.86 s, its last syllable clipped. Flow said 53
  syllables in 7.98 s on the first clip. A Telugu word runs from one syllable (మా) to seven (కస్టమర్లందరికీ),
  so 17–20 WORDS can be 45 syllables or 62. The word contract stays the owner's rule; this adds the second
  half of "fits its clip": the line can be SAID in eight seconds.
  Telugu only — the one language measured (English runs ~1.4 syllables a word, 20 words ≈ 28: never the
  problem). The numbers are from those two clips, not a study: one voice aims at ≤ 50 (comfortable — about
  6.5 a second with a breath), and a clip over 54 is refused (54 was the most Flow said in time). A
  two-person clip loses about half a second to the hand-over: ≤ 47, refused over 51.
*/
/** One voice: the most syllables a Telugu clip should carry (the repairs aim under it). */
export const MAX_SYLLABLES_PER_CLIP = 50;
/** One voice: over this, a Telugu clip cannot be said in eight seconds and never ships. */
export const SYLLABLE_CEILING_PER_CLIP = 54;
/** A two-person clip, both lines together (the hand-over costs about half a second). */
export const MAX_SYLLABLES_PER_PAIR_CLIP = 47;
export const SYLLABLE_CEILING_PER_PAIR_CLIP = 51;

const TELUGU_INDEPENDENT_VOWEL = /[\u{0C05}-\u{0C14}\u{0C60}\u{0C61}]/u;
const TELUGU_CONSONANT = /[\u{0C15}-\u{0C39}\u{0C58}-\u{0C5A}]/u;
const TELUGU_VIRAMA = "\u{0C4D}";

/** True for the languages whose clips are held to a syllable limit (Telugu). */
export function measuresSyllables(language?: string | null): boolean {
  const l = (language || "Telugu").trim().toLowerCase();
  return l === "telugu" || l === "te" || l === "";
}

/**
 * Spoken syllables in a line: in Telugu letters, one per vowel and per consonant that is not joined to the
 * next by a virama (an akshara — "కస్టమర్లందరికీ" is క-స్ట-మ-ర్లం-ద-రి-కీ … counted by its sounding consonants);
 * in English letters ("mariyu", "flats"), one per vowel group. Labels and punctuation never count (the
 * same words as the word counter).
 */
export function spokenSyllables(text: string): number {
  let total = 0;
  for (const word of spokenWordsOf(text)) {
    const chars = [...word];
    chars.forEach((c, i) => {
      if (TELUGU_INDEPENDENT_VOWEL.test(c)) total += 1;
      else if (TELUGU_CONSONANT.test(c) && chars[i + 1] !== TELUGU_VIRAMA) total += 1;
    });
    for (const latin of word.match(/[A-Za-z]+/g) ?? []) total += Math.max(1, (latin.toLowerCase().match(/[aeiouy]+/g) ?? []).length);
  }
  return total;
}

/** The syllable limits for a clip: `aim` (what the writer and the repairs aim under) and `ceiling` (never shipped). */
export function syllableLimitsFor(cast = false): { aim: number; ceiling: number } {
  return cast
    ? { aim: MAX_SYLLABLES_PER_PAIR_CLIP, ceiling: SYLLABLE_CEILING_PER_PAIR_CLIP }
    : { aim: MAX_SYLLABLES_PER_CLIP, ceiling: SYLLABLE_CEILING_PER_CLIP };
}

/**
 * The one wording of "this clip is too long to say". It never says "has N" — the word-count repair reads
 * that phrase (utils/voiceOverRefine repairDirection) — and it keeps the word band, so a repair shortens the
 * WORDS it says, not their number.
 */
export function clipSyllableIssue(clipNumber: number, syllables: number, cast = false, limit?: number): string | null {
  const max = limit ?? syllableLimitsFor(cast).aim;
  if (syllables <= max) return null;
  return `Clip ${clipNumber} is too long to say in 8 seconds: ${syllables} syllables${cast ? " across both lines together" : ""}, `
    + `at most ${max} fit. Keep ${MIN_WORDS_PER_CLIP}–${MAX_WORDS_PER_CLIP} words, but say it with shorter everyday words — `
    + `swap a long word for a short one, or leave out a secondary detail; never cut the business name, the wish or the closing call line.`;
}

/** Recognises a syllable failure in an issue list (see clipSyllableIssue). */
export function isSyllableIssue(issue: string): boolean {
  return /^Clip \d+ is too long to say in 8 seconds\b/.test(issue);
}

/** Every clip of a script over its syllable aim (Telugu only; [] for other languages). */
export function clipSyllableIssues(clipTexts: string[], language?: string | null, cast = false): string[] {
  if (!measuresSyllables(language)) return [];
  return clipTexts.map((text, i) => clipSyllableIssue(i + 1, spokenSyllables(text), cast)).filter((x): x is string => !!x);
}

/*
  ── A phrase said twice (2026-10-22, night — the live promotional run) ─────────────────────────────
  Clip 1 "… టూ బీహెచ్‌కే mariyu త్రీ బీహెచ్‌కే flats, plots దొరుకుతాయి" and clip 2 "… టూ బీహెచ్‌కే mariyu త్రీ బీహెచ్‌కే
  flats …" — eight of a 32-second ad's seconds spent saying the same thing twice. Only a word-for-word duplicate CLIP
  was caught, and the judge scored originality 9. Five words in a row said in two clips is a repeat; the business's
  name and other fixed phrases (the closing line, the address) are allowed to come back.
*/
export const REPEATED_PHRASE_WORDS = 5;

const normalWord = (w: string) => w.toLowerCase().replace(/[\u{200C}\u{200D}]/gu, "");

/** "Clip 2 repeats clip 1's words "…" — say something new in it." for every later clip that repeats an earlier one. */
export function repeatedPhraseIssues(clipTexts: string[], allowed: string[] = []): string[] {
  const allowedSeqs = allowed.filter(Boolean).map((a) => spokenWordsOf(a).map(normalWord).join(" "));
  const isAllowed = (seq: string) => allowedSeqs.some((a) => a.includes(seq));
  const issues: string[] = [];
  const seen = new Map<string, number>();
  clipTexts.forEach((text, i) => {
    const words = spokenWordsOf(text).map(normalWord);
    const own = new Set<string>();
    let reported = false;
    for (let k = 0; k + REPEATED_PHRASE_WORDS <= words.length; k++) {
      const seq = words.slice(k, k + REPEATED_PHRASE_WORDS).join(" ");
      if (own.has(seq)) continue;
      own.add(seq);
      const first = seen.get(seq);
      if (!reported && first !== undefined && first !== i + 1 && !isAllowed(seq)) {
        issues.push(`Clip ${i + 1} repeats clip ${first}'s words "${spokenWordsOf(text).slice(k, k + REPEATED_PHRASE_WORDS).join(" ")}" — say something new in it.`);
        reported = true;
      }
    }
    for (const seq of own) if (!seen.has(seq)) seen.set(seq, i + 1);
  });
  return issues;
}

/** Spoken words per clip — for a summary, a badge, or a test. */
export function clipWordCounts(clipTexts: string[]): number[] {
  return clipTexts.map(countSpokenWords);
}

/** How many 8-second clips raw text needs so that no clip has to carry more than the ceiling. */
export function clipsNeededFor(words: number): number {
  return words <= 0 ? 0 : Math.max(1, Math.ceil(words / MAX_WORDS_PER_CLIP));
}

/** How many 8-second clips raw text naturally fills at the planned pace (the Script Duration Checker's "Auto"). */
export function clipsAtPace(words: number): number {
  return words <= 0 ? 0 : Math.max(1, Math.round(words / TARGET_WORDS_PER_CLIP));
}
