/**
 * The namaskaram on the festival wish, timed to the words (owner, 2026-10-22).
 *
 * ── Why ───────────────────────────────────────────────────────────────────────────────────────────
 * The owner: "when she is saying the wishes, the cast need to do the namaskaram hand gesture exactly when
 * she is saying." The video prompt used to put the namaste at the START of the greeting clip ("turns to the
 * camera … greets the viewer with a namaste and a small bow, then opens both hands"), but a Telugu greeting
 * says its wish LAST — "{business} తరఫున మా మిత్రులు, శ్రేయోభిలాషులు, కస్టమర్లందరికీ దసరా హృదయపూర్వక
 * శుభాకాంక్షలు" — so the hands joined five seconds before the words, and a wish said in any other clip got no
 * namaskaram at all.
 *
 * So the moment is found in code, from the exact line the video speaks: the wish words (శుభాకాంక్షలు,
 * "wishes", "Happy Diwali", शुभकामनाएं …) and the two words before them ("దసరా హృదయపూర్వక శుభాకాంక్షలు"),
 * placed on the clip's timeline by their position among its spoken words — Veo spreads a line evenly over the
 * time it is given (8 seconds, or a pair speaker's half). The prompt names the moment twice, by meaning ("exactly
 * as she says the festival wish") and by time ("about 5–7s"), and asks that the hands stay relaxed before it.
 *
 * Pure; the one word counter (utils/scriptContract.spokenWordsOf). Tested in `src/test/adGenOct22.test.ts`.
 */
import { spokenWordsOf } from "./scriptContract";

/** A word that IS the wish, in every ad language (matched at the start of a word, so case endings stay). */
const WISH_STEM = /^(?:శుభాకాంక్ష|శుభాభినందన|శుభకామన|శుభాశీస్సు|शुभकामना|बधाई|मुबारक|வாழ்த்து|நல்வாழ்த்து|ಶುಭಾಶಯ|ಶುಭಕಾಮನೆ|ആശംസ)/u;
/** English: "wishes", "wishing", "greetings", "Mubarak" — the word itself. */
const WISH_ENGLISH = /^(?:wish|wishes|wishing|greetings|mubarak)$/i;
/** English: "Happy Diwali", "Merry Christmas" — only before a capitalised name, never "happy customers". */
const WISH_LEAD = /^(?:happy|merry)$/i;

/** The seconds of a clip in which a line is spoken, with a breath at each end. */
const LEAD_IN = 0.5;
const TAIL = 0.5;
/** The shortest window worth naming: a namaskaram needs about two seconds to join, hold and open. */
const MIN_WINDOW = 2;

export interface WishMoment {
  /** First second of the namaskaram, from the start of the clip. */
  from: number;
  /** Last second. */
  to: number;
  /** "5–7s" — as the prompt writes it. */
  label: string;
}

/** Which spoken words of a line are the wish, as [first, last] word indexes — or null when it has none. */
export function wishWordSpan(line: string): [number, number] | null {
  const words = spokenWordsOf(line);
  const hits: number[] = [];
  words.forEach((w, i) => {
    if (WISH_STEM.test(w) || WISH_ENGLISH.test(w)) hits.push(i);
    else if (WISH_LEAD.test(w) && /^\p{Lu}/u.test(words[i + 1] || "")) hits.push(i, i + 1);
  });
  if (!hits.length) return null;
  const first = Math.min(...hits);
  const last = Math.max(...hits);
  // "దసరా హృదయపూర్వక శుభాకాంక్షలు", "warm Diwali wishes": the words that lead into a wish are part of it. A wish
  // that already opens with its own words ("Happy Diwali", "Wishing you…") starts where it starts.
  const leadIn = WISH_LEAD.test(words[first]) || /^wishing$/i.test(words[first]) ? 0 : 2;
  return [Math.max(0, first - leadIn), last];
}

/**
 * When in the clip the wish is said: `window` is the speaker's time in the clip — [0, 8] for one voice, a pair
 * speaker's half ("0–4s" → [0, 4]). null when the line has no wish.
 */
export function wishMoment(line: string, window: [number, number] = [0, 8]): WishMoment | null {
  const span = wishWordSpan(line);
  if (!span) return null;
  const total = spokenWordsOf(line).length;
  const [start, end] = window;
  const speakFrom = start + (end - start > 2 * MIN_WINDOW ? LEAD_IN : 0);
  const speakTo = end - (end - start > 2 * MIN_WINDOW ? TAIL : 0);
  const per = (speakTo - speakFrom) / Math.max(1, total);
  let from = Math.max(start, Math.floor(speakFrom + per * span[0]));
  let to = Math.min(end, Math.ceil(speakFrom + per * (span[1] + 1)));
  if (to - from < MIN_WINDOW) to = Math.min(end, from + MIN_WINDOW);
  if (to - from < MIN_WINDOW) from = Math.max(start, to - MIN_WINDOW);
  return { from, to, label: `${from}–${to}s` };
}

/** "0–4s" / "4–8s" (a pair line's `at`) → [0, 4]; anything else → the whole clip. */
export function speakingWindow(at?: string): [number, number] {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*s?\s*$/.exec(at || "");
  if (!m) return [0, 8];
  const a = Number(m[1]);
  const b = Number(m[2]);
  return b > a ? [a, b] : [0, 8];
}
