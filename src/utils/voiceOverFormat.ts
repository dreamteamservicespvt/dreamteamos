/**
 * Canonical voice-over clip labelling.
 *
 * Internally (Firestore, Gemini prompts, repair/validation passes) a voice-over script is stored
 * in the model's own contract form — one line per clip, prefixed with its second range:
 *
 *   0-8: <spoken line>
 *   8-16: <spoken line>
 *
 * Everywhere a human reads or copies a script (AI Platform "Voice Over Script" section, the
 * Script Duration Checker tool, custom-script input) we present it in the business-facing form:
 *
 *   clip-1[0-8sec]: <spoken line>
 *   clip-2[8-16sec]: <spoken line>
 *
 * Keeping storage canonical and converting only at the edges means the existing parsing,
 * validation, and Veo-regeneration code paths keep working untouched.
 */

export const CLIP_SECONDS = 8;

/** `clip-1[0-8sec]` for index 0, `clip-2[8-16sec]` for index 1, … */
export function clipLabel(index: number, clipSeconds: number = CLIP_SECONDS): string {
  const start = index * clipSeconds;
  const end = start + clipSeconds;
  return `clip-${index + 1}[${start}-${end}sec]`;
}

/** The bare second range for a clip index, e.g. `0-8`. */
export function clipRange(index: number, clipSeconds: number = CLIP_SECONDS): string {
  const start = index * clipSeconds;
  return `${start}-${start + clipSeconds}`;
}

/** One clip rendered for copy/paste: `clip-1[0-8sec]: <text>`. */
export function formatClipLine(index: number, text: string, clipSeconds: number = CLIP_SECONDS): string {
  return `${clipLabel(index, clipSeconds)}: ${text.trim()}`;
}

/** A full script rendered for copy/paste, one labelled clip per line. */
export function formatClipScript(texts: string[], clipSeconds: number = CLIP_SECONDS): string {
  return texts.map((text, index) => formatClipLine(index, text, clipSeconds)).join('\n');
}

/**
 * Every clip header shape a member realistically pastes, and the text that follows it:
 *
 *   `clip-1[0-8sec]:`  `Clip 1 [0-8 sec]:`  `clip1:`  `CLIP-1 (0-8 sec) -`  `**clip-1[0-8sec]:**`
 *   `clip-1[0-8sec] text` (no colon after a bracketed range)  `Clip 1 – 0-8 sec: text`  `Scene 2:`
 *   `0-8:`  `0–8 sec:`  `[8-16sec]:`  `Segment 1:`  and a full-width `：`
 *
 * ── Why this got wider ────────────────────────────────────────────────────────────────────────
 * A pasted script is used WORD FOR WORD only when its clips are recognised. A header the old pattern
 * missed — round brackets instead of square ones, a bold label copied out of WhatsApp, no colon after
 * the range — made the whole script look unlabelled, and unlabelled text went to the model to be split,
 * which is exactly where the business's own words were changed. A line is only a header when it carries
 * a clip word or a second range AND a separator or a bracketed range, so ordinary prose ("Clip 1 is the
 * best") is never taken for one. Ranges are at most three digits a side so a phone number at the start
 * of a line ("98480-12345: call now") stays text.
 */
const LEAD = /^\s*(?:[>•*_]+\s*|[-–]\s+)*/.source;
const DECORATION = /(?:\*\*|__|\*|_)?/.source;
const CLIP_WORD_HEADER = new RegExp(
  `${LEAD}(?:clip|scene)\\s*(?:no\\.?\\s*)?[-–]?\\s*#?\\s*\\d{1,3}\\s*${DECORATION}\\s*` +
    `([\\[({][^\\])}]*[\\])}])?\\s*${DECORATION}\\s*([:：\\-–—.)])?\\s*${DECORATION}\\s*(.*)$`,
  "i",
);
const RANGE_HEADER = new RegExp(
  `${LEAD}[\\[(]?\\d{1,3}\\s*[-–]\\s*\\d{1,3}\\s*(?:sec(?:onds?)?|s)?[\\])]?\\s*${DECORATION}\\s*[:：\\-–—]\\s*${DECORATION}\\s*(.*)$`,
  "i",
);
const SEGMENT_HEADER = new RegExp(`${LEAD}segment\\s*\\d{1,3}\\s*${DECORATION}\\s*[:：\\-–—]\\s*${DECORATION}\\s*(.*)$`, "i");
/** A range repeated after the clip label — "Clip 1 – 0-8 sec: text" — belongs to the header, not the words. */
const LEADING_RANGE = /^[[(]?\d{1,3}\s*[-–]\s*\d{1,3}\s*(?:sec(?:onds?)?|s)?[\])]?\s*[:：\-–—]?\s*/i;

/** The spoken text after a clip header on this line, or null when the line is not a header. */
function headerText(line: string): string | null {
  const word = line.match(CLIP_WORD_HEADER);
  if (word && (word[1] || word[2])) return (word[3] || "").replace(LEADING_RANGE, "").trim();
  const range = line.match(RANGE_HEADER);
  if (range) return (range[1] || "").trim();
  const segment = line.match(SEGMENT_HEADER);
  if (segment) return (segment[1] || "").trim();
  return null;
}

/**
 * `[Motu]: …` — a labelled speaker turn.
 *
 * A clip used to be a single spoken line, so any line under a header was a wrap of the one above
 * and joining with a space was right. A character-pack clip is a two-speaker exchange, and its
 * second line is a new turn — flattening it would run both characters together on one line.
 */
const SPEAKER_TURN_PATTERN = /^\[[^\]]+\]\s*:/;

/** True when a line opens a clip (any accepted header shape). */
export function isClipHeaderLine(line: string): boolean {
  return headerText(line.trim()) !== null;
}

/**
 * Splits a pasted script into its clips when it is already clip-labelled.
 * Returns [] when the text carries no clip headers, so callers can fall back to
 * AI segmentation for free-form text.
 */
export function parseLabeledClips(text: string): string[] {
  if (!text?.trim()) return [];

  const clips: string[] = [];
  let current: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^full\s*script\s*:?/i.test(line)) break;

    const header = headerText(line);
    if (header !== null) {
      if (current !== null && current.trim()) clips.push(current.trim());
      current = header;
      continue;
    }

    if (!line || current === null) continue;
    if (!current) { current = line; continue; }
    current = `${current}${SPEAKER_TURN_PATTERN.test(line) ? "\n" : " "}${line}`;
  }

  if (current !== null && current.trim()) clips.push(current.trim());
  return clips;
}
