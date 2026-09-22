/**
 * A member's own pasted script — used word for word.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────────────────────────
 * The business writes the script, the member pastes it, and the ad has to say exactly that. Three
 * things used to change it on the way through:
 *
 *   1. The cleaner built for MODEL output also ran on the member's text, and it deletes `& @ # $` —
 *      so "Sri Lakshmi Silks & Sarees" became "Sri Lakshmi Silks Sarees".
 *   2. Text without clip headers was handed to the model to "split" with the licence to "REWRITE it as
 *      two shorter complete sentences", and then through the word-count repair that rewrites any clip
 *      outside the band. The member's words came back as the model's words.
 *   3. In a special-category ad a script without `[Speaker]:` lines was silently discarded and a new one
 *      written from the business profile.
 *
 * Everything here is pure, so what "verbatim" means is pinned by tests rather than by a prompt.
 */

/**
 * Only what can never be spoken is removed: emoji and box-drawing / decorative symbols a script copied
 * out of WhatsApp or a document carries. Every letter, number and ordinary symbol stays — `&`, `@`,
 * `#`, `₹`, `%`, `/` and the member's own punctuation are part of what they wrote.
 */
export function verbatimScriptText(text: string): string {
  return (text || "")
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, "")
    .replace(/[★☆●◆◇■□▪▫▶◀►◄♦♣♠♥♡✦✧✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋═║╔╗╚╝╠╣╩╦╬─│┌┐└┘├┤┬┴┼━┃┏┓┗┛┣┫┻┳╋▬▭▮▯△▽◁▷※¤†‡‖‗‾⁂⁎⁑⁕⁖⁘⁙⁚⁛⁜⁝⁞]/g, "")
    // Bold / italic markers from a chat app are formatting, not words.
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The words of a script, for comparing two versions of it — punctuation, case and spacing ignored. */
export function scriptWords(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** True when `candidate` says exactly the words of `original`, in the same order — nothing added or lost. */
export function sameWords(original: string, candidate: string): boolean {
  const a = scriptWords(original);
  const b = scriptWords(candidate);
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

/** Sentence-ish pieces: split after . ! ? । ॥ and at line breaks, never inside a word. */
function sentencesOf(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?।॥])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Splits the longest piece at its middle comma (or its middle word) until there are enough pieces. */
function splitToAtLeast(pieces: string[], count: number): string[] {
  const out = [...pieces];
  while (out.length < count) {
    let longest = 0;
    out.forEach((p, i) => { if (countWords(p) > countWords(out[longest])) longest = i; });
    const words = out[longest].split(/\s+/).filter(Boolean);
    if (words.length < 2) break;
    const mid = words.length / 2;
    // Prefer a comma nearest the middle; a mid-word cut only when the sentence has no comma at all.
    let cut = -1;
    words.forEach((w, i) => {
      if (i < words.length - 1 && /[,،;:]$/.test(w) && (cut < 0 || Math.abs(i + 1 - mid) < Math.abs(cut - mid))) cut = i + 1;
    });
    if (cut < 0) cut = Math.round(mid);
    out.splice(longest, 1, words.slice(0, cut).join(" "), words.slice(cut).join(" "));
  }
  return out;
}

/**
 * The script cut into `count` clips at sentence boundaries, as evenly by words as the sentences allow,
 * without changing, adding or dropping a single word.
 *
 * A linear partition: each clip takes consecutive sentences, and the cut points minimise how far the
 * busiest clip is over an even share. Sentences are only broken (at a comma first) when there are fewer
 * sentences than clips.
 */
export function splitScriptVerbatim(text: string, count: number): string[] {
  const clean = verbatimScriptText(text);
  if (count <= 0) return [];
  if (!clean) return Array(count).fill("");
  const pieces = splitToAtLeast(sentencesOf(clean), count);
  if (pieces.length <= count) return [...pieces, ...Array(count - pieces.length).fill("")];

  const sizes = pieces.map(countWords);
  const n = sizes.length;
  const prefix = [0];
  sizes.forEach((s) => prefix.push(prefix[prefix.length - 1] + s));
  const target = prefix[n] / count;
  const cost = (from: number, to: number) => (prefix[to] - prefix[from] - target) ** 2;
  // best[k][i] = least cost of putting the first i pieces into k clips.
  const best: number[][] = Array.from({ length: count + 1 }, () => Array(n + 1).fill(Infinity));
  const cutAt: number[][] = Array.from({ length: count + 1 }, () => Array(n + 1).fill(0));
  best[0][0] = 0;
  for (let k = 1; k <= count; k++) {
    for (let i = k; i <= n - (count - k); i++) {
      for (let j = k - 1; j < i; j++) {
        const c = best[k - 1][j] + cost(j, i);
        if (c < best[k][i]) { best[k][i] = c; cutAt[k][i] = j; }
      }
    }
  }
  const clips: string[] = [];
  let end = n;
  for (let k = count; k >= 1; k--) {
    const start = cutAt[k][end];
    clips.unshift(pieces.slice(start, end).join(" "));
    end = start;
  }
  return clips;
}
