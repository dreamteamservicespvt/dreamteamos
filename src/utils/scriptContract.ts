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
 * clip that repeats another word for word, or the wrong number of clips. (Who speaks is checked by
 * utils/dialogueFormat castIntegrityIssues for a cast.) Returns [] when the script may ship.
 */
export function contractViolations(clipTexts: string[], expectedClips: number, cast = false): string[] {
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
    const key = words.join(" ").toLowerCase();
    const first = seen.get(key);
    if (typeof first === "number") issues.push(`Clip ${n} duplicates clip ${first}.`);
    else seen.set(key, n);
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
