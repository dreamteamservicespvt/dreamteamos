/**
 * When each word of a clip is spoken — so an overlay or a B-roll image can be placed against the
 * words, not guessed at.
 *
 * The platform knew which CLIP an overlay belonged to and nothing finer, so an editor with a 4-word
 * overlay and an 8-second clip still had to find the moment by ear. A clip's seconds are known, and
 * the words inside it are known; spreading the seconds across the words by how long each one takes to
 * say gives every word a start and an end, and any phrase in the line a cue an editor can cut to.
 *
 * It is an estimate, not a transcript — the voice-over is recorded later, from this script — so cues
 * are rounded to a tenth of a second and always name the words as well as the time. The words are what
 * an editor matches by ear; the time is where to start looking.
 */

/** A word of the script with the seconds it is spoken in. */
export interface WordTime {
  word: string;
  /** 0-based position among the clip's spoken words. */
  index: number;
  start: number;
  end: number;
}

/** A span of a clip an overlay or image covers. */
export interface Cue {
  start: number;
  end: number;
  /** The first and last spoken word the cue covers, as written in the script. */
  fromWord: string;
  toWord: string;
  /** False when the words asked for were not in the line, and the whole clip was used instead. */
  matched: boolean;
}

/** Speaker labels are structure, not speech: `[Motu]:` is never spoken. */
const withoutSpeakers = (line: string) => (line || "").replace(/\[[^\]]*\]:/g, " ");

/** A word stripped to its letters and digits, for matching what a model echoed back. */
export const bareWord = (word: string) => (word || "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

/** The spoken words of a clip line, in order. */
export function spokenWords(line: string): string[] {
  return withoutSpeakers(line).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

/**
 * How long a word takes to say, relative to the others.
 *
 * Length is the best proxy available without audio: a Telugu word of eight letters takes about twice
 * as long as one of four. The floor stops one-letter words from collapsing to nothing.
 */
const weightOf = (word: string) => Math.max(2, bareWord(word).length);

/** Every word of a clip with the seconds it falls in, spread across the clip by word length. */
export function wordTimings(line: string, start: number, end: number): WordTime[] {
  const words = spokenWords(line);
  const span = Math.max(0, end - start);
  if (words.length === 0 || span === 0) return [];
  const total = words.reduce((sum, w) => sum + weightOf(w), 0);
  let at = start;
  return words.map((word, index) => {
    const length = (weightOf(word) / total) * span;
    const wordStart = at;
    at += length;
    return { word, index, start: round(wordStart), end: round(Math.min(at, end)) };
  });
}

const round = (seconds: number) => Math.round(seconds * 10) / 10;
/** Rounded UP to a tenth, so a held cue is never a hair shorter than the minimum it was given. */
const roundUp = (seconds: number) => Math.ceil(seconds * 10) / 10;

/**
 * Where a phrase sits inside the clip's words. Returns the first match, or null.
 *
 * A model asked for "the first word" answers with whatever it copied — one word, a phrase, sometimes
 * with the punctuation attached — so matching is done on letters and digits alone, and a phrase is
 * matched word by word.
 */
export function findPhrase(words: string[], phrase: string): { from: number; to: number } | null {
  const needle = spokenWords(phrase).map(bareWord).filter(Boolean);
  if (needle.length === 0) return null;
  const haystack = words.map(bareWord);
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    const hit = needle.every((part, k) => haystack[i + k] === part
      || haystack[i + k].startsWith(part)
      || part.startsWith(haystack[i + k]));
    if (hit) return { from: i, to: i + needle.length - 1 };
  }
  // A phrase the model paraphrased: fall back to any single word of it that is in the line.
  for (const part of needle) {
    const at = haystack.findIndex((w) => w === part || w.startsWith(part) || part.startsWith(w));
    if (at >= 0) return { from: at, to: at };
  }
  return null;
}

/** An overlay or image is never worth cutting for less than this. */
const MIN_CUE_SECONDS = 1.2;

/**
 * The cue for "from this word to that word" inside a clip.
 *
 * Unmatched words fall back to the whole clip, which is always a usable instruction — never a wrong
 * time dressed up as a precise one.
 */
export function cueForWords(
  line: string,
  fromWord: string,
  toWord: string,
  clipStart: number,
  clipEnd: number,
): Cue {
  const timings = wordTimings(line, clipStart, clipEnd);
  const words = timings.map((t) => t.word);
  const from = findPhrase(words, fromWord || "");
  const to = findPhrase(words, toWord || fromWord || "");

  if (!from || timings.length === 0) {
    return { start: clipStart, end: clipEnd, fromWord: words[0] || "", toWord: words[words.length - 1] || "", matched: false };
  }

  const firstIndex = from.from;
  const lastIndex = Math.max(to ? to.to : from.to, from.to);
  let start = timings[firstIndex].start;
  let end = timings[Math.min(lastIndex, timings.length - 1)].end;
  // A one-word cue would flash: hold it to a readable length. It is held later where there is room,
  // and brought up earlier when the word is at the very end of the clip — a closing "Call now!" had
  // seven tenths of a second to be read in.
  if (end - start < MIN_CUE_SECONDS) {
    end = Math.min(round(clipEnd), roundUp(start + MIN_CUE_SECONDS));
    if (end - start < MIN_CUE_SECONDS) start = Math.max(round(clipStart), round(end - MIN_CUE_SECONDS));
  }
  return {
    start,
    end,
    fromWord: timings[firstIndex].word,
    toWord: timings[Math.min(lastIndex, timings.length - 1)].word,
    matched: true,
  };
}

/** Seconds as an editor reads them on a timeline: 0:09.2. */
export function timecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest < 10 ? "0" : ""}${rest.toFixed(1)}`;
}

/** The whole instruction in one line: when to cut, and which words to listen for. */
export function cueLabel(cue: Cue): string {
  const when = `${timecode(cue.start)} → ${timecode(cue.end)}`;
  return cue.matched
    ? `${when} · from “${cue.fromWord}” to “${cue.toWord}”`
    : `${when} · across the whole clip`;
}
