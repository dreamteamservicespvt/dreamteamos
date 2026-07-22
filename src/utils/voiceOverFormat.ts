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
 * Matches every clip header shape we accept as input:
 *   `clip-1[0-8sec]:`  `Clip 1 [0-8 sec]:`  `clip1:`  `0-8:`  `Segment 1:`
 * Capture group 1 holds the spoken text that followed the header on the same line.
 */
const CLIP_HEADER_PATTERN =
  /^\s*(?:clip\s*-?\s*\d+\s*(?:\[[^\]]*\])?|\d+\s*-\s*\d+\s*(?:sec|s)?|segment\s*\d+)\s*[:\-–]\s*(.*)$/i;

/** True when a line opens a clip (any accepted header shape). */
export function isClipHeaderLine(line: string): boolean {
  return CLIP_HEADER_PATTERN.test(line.trim());
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

    const match = line.match(CLIP_HEADER_PATTERN);
    if (match) {
      if (current !== null && current.trim()) clips.push(current.trim());
      current = match[1].trim();
      continue;
    }

    if (!line || current === null) continue;
    current = current ? `${current} ${line}` : line;
  }

  if (current !== null && current.trim()) clips.push(current.trim());
  return clips;
}
