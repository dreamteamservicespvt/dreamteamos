/**
 * B-roll images and on-screen text overlays, planned TOGETHER (2026-11-05).
 *
 * ── Why (the owner, 2026-11-05) ─────────────────────────────────────────────────────────────────
 * "The overlay images and the overlay text images are coming for the same concept and at the same time … different
 * overlay images and different overlay text images with different concepts and different timings." The two were
 * written by two separate calls, at the same moment, each told to anchor itself on the line's strongest words — so the
 * price text and a picture of the price came up on the same word, and the text sank into an image graded in its own
 * colours ("they are coming in the same colour … the text images are mixed with the overlay images").
 *
 * Now the text overlays are written first (they belong on the words they print: the price on the price word), and
 * the B-roll is written knowing them: a different idea of the line, on other words. Code then guarantees the timing —
 * a B-roll cue that still overlaps a text cue in its clip is moved to the free words nearest to where it was asked
 * for — and finds a B-roll whose idea repeats a text overlay, so it can be asked again once. Pure and unit-tested.
 */
import { cueLabel, wordTimings, type Cue } from "./wordTiming";

/** What this module reads of an overlay or a B-roll item (both carry it after utils/clipPlacement). */
export interface PlacedItem {
  clip?: number;
  id?: number;
  start?: number;
  end?: number;
  line?: string;
  cue?: Cue;
  text?: string;
  concept?: string;
}

/** A B-roll image shorter than this is not worth cutting to (the same floor as a cue, utils/wordTiming). */
const MIN_IMAGE_SECONDS = 1.2;
/** A small gap kept between the text going off and the picture coming up. */
const GAP = 0.1;

const clipOf = (item: PlacedItem): number => Number(item.clip ?? item.id) || 0;

/** The text cues of each clip. */
export function textCuesByClip(overlays: PlacedItem[] | null | undefined): Map<number, Cue[]> {
  const byClip = new Map<number, Cue[]>();
  for (const o of overlays || []) {
    if (!o?.cue) continue;
    const clip = clipOf(o);
    byClip.set(clip, [...(byClip.get(clip) || []), o.cue]);
  }
  return byClip;
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end + GAP && a.end > b.start - GAP;

/**
 * The span of a clip's words that no text cue covers, as close as possible to where the image was asked for and at
 * most as long — or null when the text leaves no free run of words long enough for a picture.
 */
export function freeImageCue(line: string, clipStart: number, clipEnd: number, busy: Cue[], wanted: Cue): Cue | null {
  const words = wordTimings(line, clipStart, clipEnd);
  if (words.length === 0) return null;
  const free = words.map((w) => !busy.some((b) => overlaps(w, b)));
  // Runs of free words.
  const runs: { from: number; to: number }[] = [];
  free.forEach((isFree, i) => {
    if (!isFree) return;
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1) last.to = i; else runs.push({ from: i, to: i });
  });
  const usable = runs.filter((r) => words[r.to].end - words[r.from].start >= MIN_IMAGE_SECONDS);
  if (usable.length === 0) return null;
  const want = Math.max(MIN_IMAGE_SECONDS, wanted.end - wanted.start);
  const centre = (wanted.start + wanted.end) / 2;
  const distance = (r: { from: number; to: number }) => {
    const s = words[r.from].start; const e = words[r.to].end;
    return centre < s ? s - centre : centre > e ? centre - e : 0;
  };
  const run = usable.slice().sort((a, b) => distance(a) - distance(b))[0];
  // Inside the run: start at the free word nearest the wanted start, grow forward, then backward, to the wanted length.
  let from = run.from;
  for (let i = run.from; i <= run.to; i++) if (Math.abs(words[i].start - wanted.start) < Math.abs(words[from].start - wanted.start)) from = i;
  let to = from;
  while (to < run.to && words[to].end - words[from].start < want) to++;
  while (from > run.from && words[to].end - words[from].start < want) from--;
  if (words[to].end - words[from].start < MIN_IMAGE_SECONDS) return null;
  return { start: words[from].start, end: words[to].end, fromWord: words[from].word, toWord: words[to].word, matched: true };
}

/**
 * The B-roll items, each kept off its clip's text overlays: a cue that overlaps one is moved to the nearest free words.
 * `movedOffText` says code moved it; `sharesTimeWithText` marks the rare clip the text fills end to end (the editor
 * then cuts the picture in around the text — said on the card).
 */
export function brollAwayFromText<T extends PlacedItem>(
  broll: T[],
  overlays: PlacedItem[] | null | undefined,
): (T & { cueLabel?: string; fromWord?: string; toWord?: string; movedOffText?: boolean; sharesTimeWithText?: boolean })[] {
  const byClip = textCuesByClip(overlays);
  if (byClip.size === 0) return broll;
  return broll.map((item) => {
    const busy = byClip.get(clipOf(item)) || [];
    if (!item.cue || busy.length === 0 || !busy.some((b) => overlaps(item.cue!, b))) {
      return { ...item, movedOffText: false, sharesTimeWithText: false };
    }
    if (typeof item.line !== "string" || typeof item.start !== "number" || typeof item.end !== "number") return item;
    const moved = freeImageCue(item.line, item.start, item.end, busy, item.cue);
    if (!moved) return { ...item, movedOffText: false, sharesTimeWithText: true };
    return { ...item, cue: moved, cueLabel: cueLabel(moved), fromWord: moved.fromWord, toWord: moved.toWord, movedOffText: true, sharesTimeWithText: false };
  });
}

// ── the same idea twice ──────────────────────────────────────────────────────────────────────────

const STOP = new Set(["the", "and", "for", "with", "our", "your", "you", "now", "all", "of", "a", "an", "in", "on", "at", "to", "is", "are", "its", "it's", "from", "this", "that"]);
const contentWords = (text: string) =>
  (text || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
    .map((w) => w.replace(/(?:ies)$/, "y").replace(/(?<=\w{3})s$/, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w));

/**
 * True when an image's idea is the text's idea: at least half of the text's own words (and at least one) are in the
 * image's concept — "FREE DELIVERY" and "Free Home Delivery", "Call Now" and "Phone Call".
 */
export function repeatsText(concept: string, text: string): boolean {
  const said = new Set(contentWords(text));
  if (said.size === 0) return false;
  const shown = new Set(contentWords(concept));
  const shared = [...said].filter((w) => shown.has(w)).length;
  return shared >= 1 && shared * 2 >= said.size;
}

/** The clips whose B-roll repeats one of that clip's text overlays, with the text it repeats. */
export function brollRepeatingText(broll: PlacedItem[], overlays: PlacedItem[] | null | undefined): { clip: number; concept: string; text: string }[] {
  const out: { clip: number; concept: string; text: string }[] = [];
  for (const b of broll) {
    const clip = clipOf(b);
    const same = (overlays || []).find((o) => clipOf(o) === clip && repeatsText(String(b.concept || ""), String(o.text || "")));
    if (same) out.push({ clip, concept: String(b.concept || ""), text: String(same.text || "") });
  }
  return out;
}

/** The text overlays as the B-roll writer reads them: what each says and on which words it is on screen. */
export function onScreenTextBlock(overlays: PlacedItem[] | null | undefined): string {
  const lines = (overlays || [])
    .filter((o) => String(o?.text || "").trim())
    .map((o) => {
      const when = o.cue?.matched ? `from "${o.cue.fromWord}" to "${o.cue.toWord}"` : "across the clip";
      return `• Clip ${clipOf(o)}: "${String(o.text).trim()}" — on screen ${when}`;
    });
  return lines.join("\n");
}
