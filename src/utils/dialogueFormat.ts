import { CLIP_SECONDS, clipLabel } from "./voiceOverFormat";

/**
 * Two-speaker clip scripting for character-pack ads.
 *
 * A normal ad has one voice per clip (see utils/voiceOverFormat). A character-pack ad puts TWO
 * cartoon characters in the same 8-second clip and both must speak, so a clip is no longer a line
 * — it is an ordered exchange.
 *
 * ── The 8-second budget ───────────────────────────────────────────────────────────────────────
 * The single-speaker pipeline is calibrated at exactly 18 spoken words per 8-second clip
 * (≈2.25 words/sec). A two-hander loses roughly half a second to the hand-off beat between
 * speakers, so the same 8 seconds carries ~16 words. Splitting that gives 7–9 words per character.
 * The clip total is exact — that is what keeps every clip landing on 8 seconds — while the split
 * between the two characters is allowed to breathe.
 *
 * ── Two representations, one source of truth ──────────────────────────────────────────────────
 * Same split-brain approach voiceOverFormat already uses, for the same reason: parsing, validation
 * and repair stay mechanical while humans read something pleasant.
 *
 *   canonical (storage, model contract):   0-8|motu: <line>
 *                                          0-8|patlu: <line>
 *
 *   display (what a member copies):        clip-1[0-8sec]:
 *                                            [Motu]:  <line>
 *                                            [Patlu]: <line>
 *
 * The colon on the header is load-bearing, not decoration: utils/voiceOverFormat's clip-header
 * pattern requires a separator, and without it the whole script parsed as one clip and the AI
 * Platform showed every clip crammed into clip-1's card.
 */

/** Exact spoken words per clip, shared across both characters. See the budget note above. */
export const WORDS_PER_CLIP = 16;
/** A single character's share of the clip. The two must still total WORDS_PER_CLIP. */
export const MIN_WORDS_PER_LINE = 7;
export const MAX_WORDS_PER_LINE = 9;

export interface DialogueLine {
  /** Character key, e.g. `motu`. */
  speaker: string;
  text: string;
}

/** One clip: an ordered exchange, one line per character. */
export type DialogueClip = DialogueLine[];

export interface Speaker {
  key: string;
  name: string;
}

// ── Formatting ────────────────────────────────────────────────────────────────────────────────

/** Canonical form — what is stored and what the model is asked to produce. */
export function formatCanonicalDialogue(clips: DialogueClip[], clipSeconds: number = CLIP_SECONDS): string {
  return clips
    .map((clip, index) => {
      const start = index * clipSeconds;
      const range = `${start}-${start + clipSeconds}`;
      return clip.map((line) => `${range}|${line.speaker}: ${line.text.trim()}`).join("\n");
    })
    .join("\n");
}

/** Display form — the labelled block a member reads and pastes. */
export function formatDialogueScript(
  clips: DialogueClip[],
  speakers: Speaker[],
  clipSeconds: number = CLIP_SECONDS,
): string {
  const nameOf = new Map(speakers.map((s) => [s.key, s.name]));
  // Pad the labels so the dialogue text lines up under each other and stays easy to scan.
  const width = Math.max(...speakers.map((s) => s.name.length), 0);
  return clips
    .map((clip, index) => {
      const lines = clip.map((line) => {
        const label = `[${nameOf.get(line.speaker) ?? line.speaker}]:`.padEnd(width + 3);
        return `  ${label} ${line.text.trim()}`;
      });
      // The trailing colon is what makes this a clip header to parseLabeledClips — see the note
      // at the top of this file.
      return [`${clipLabel(index, clipSeconds)}:`, ...lines].join("\n");
    })
    .join("\n\n");
}

// ── Parsing ───────────────────────────────────────────────────────────────────────────────────

/** `0-8|motu: text` — the canonical line, carrying its own clip position. */
const RANGED_SPEAKER = /^(\d+)\s*-\s*\d+\s*(?:sec|s)?\s*[|/]\s*\[?\s*([\p{L}\w]+)\s*\]?\s*[:\-–]\s*(.+)$/iu;
/** `clip-1[0-8sec]`, `Clip 1:`, `Segment 2`, or a bare `0-8:` on its own line. */
const CLIP_HEADER = /^\s*(?:clip\s*-?\s*(\d+)|segment\s*(\d+))\s*(?:\[[^\]]*\])?\s*[:\-–]?\s*$/i;
const BARE_RANGE_HEADER = /^\s*(\d+)\s*-\s*\d+\s*(?:sec|s)?\s*[:\-–]?\s*$/i;
/** `[Motu]: text`, `Motu: text`, `Motu - text`. */
const SPEAKER_LINE = /^\[?\s*([\p{L}\w]+)\s*\]?\s*[:\-–]\s*(.+)$/u;

/**
 * Reads a script into clips, tolerating every shape the model realistically emits — canonical
 * lines, display blocks, or plain `Motu:` / `Patlu:` pairs under a clip header.
 *
 * Unknown speaker names are ignored rather than guessed at: a line that doesn't name a known
 * character is treated as a continuation of the previous line, which is what wrapped output
 * actually is. Returns [] when nothing parseable is found so callers can fall back.
 */
export function parseDialogueClips(
  raw: string,
  speakerAliases: string[],
  clipSeconds: number = CLIP_SECONDS,
): DialogueClip[] {
  if (!raw?.trim()) return [];

  const aliasToKey = new Map<string, string>();
  for (const alias of speakerAliases) aliasToKey.set(alias.toLowerCase(), alias.toLowerCase());

  const byIndex = new Map<number, DialogueClip>();
  let current = -1;

  const ensure = (index: number): DialogueClip => {
    const existing = byIndex.get(index);
    if (existing) return existing;
    const created: DialogueClip = [];
    byIndex.set(index, created);
    return created;
  };

  const resolveSpeaker = (token: string): string | null => aliasToKey.get(token.toLowerCase()) ?? null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^full\s*script\s*:?/i.test(line)) break;

    // 1 · Canonical `0-8|motu: text` — position is explicit, so trust it.
    const ranged = line.match(RANGED_SPEAKER);
    if (ranged) {
      const speaker = resolveSpeaker(ranged[2]);
      if (speaker) {
        const index = Math.floor(Number(ranged[1]) / clipSeconds);
        ensure(index).push({ speaker, text: ranged[3].trim() });
        current = index;
        continue;
      }
    }

    // 2 · A header on its own line moves the cursor to that clip.
    const header = line.match(CLIP_HEADER);
    if (header) {
      const n = Number(header[1] ?? header[2]);
      if (Number.isFinite(n) && n > 0) { current = n - 1; ensure(current); continue; }
    }
    const bare = line.match(BARE_RANGE_HEADER);
    if (bare) {
      current = Math.floor(Number(bare[1]) / clipSeconds);
      ensure(current);
      continue;
    }

    // 3 · `[Motu]: text` under the current clip.
    const spoken = line.match(SPEAKER_LINE);
    if (spoken) {
      const speaker = resolveSpeaker(spoken[1]);
      if (speaker) {
        if (current < 0) current = 0;
        ensure(current).push({ speaker, text: spoken[2].trim() });
        continue;
      }
    }

    // 4 · Anything else continues the line above — wrapped output, not a new turn.
    const clip = current >= 0 ? byIndex.get(current) : undefined;
    const last = clip?.[clip.length - 1];
    if (last) last.text = `${last.text} ${line}`.trim();
  }

  if (byIndex.size === 0) return [];

  const highest = Math.max(...byIndex.keys());
  return Array.from({ length: highest + 1 }, (_, i) => byIndex.get(i) ?? []);
}

// ── Name spelling ─────────────────────────────────────────────────────────────────────────────

/** One character's fixed spoken spelling, plus the spellings to rewrite into it. */
export interface NameSpelling {
  spelling: string;
  variants: string[];
}

/**
 * Forces every spoken mention of a character's name to its one fixed spelling.
 *
 * The prompt already asks for this, but a model transliterating a name into a non-Latin script
 * drifts between runs and even between clips of the same ad — so the ad ends up calling the same
 * character two different things. Asking is not enough; this rewrites it.
 *
 * Only the spoken text is touched. The `[Motu]:` labels stay in Latin script because the parser
 * and the whole two-speaker contract are keyed on them.
 */
export function applyNameSpellings(clips: DialogueClip[], spellings: NameSpelling[]): DialogueClip[] {
  const rewrites = spellings
    .flatMap(({ spelling, variants }) => variants.filter((v) => v && v !== spelling).map((v) => ({ from: v, to: spelling })))
    // Longest first, so a variant that contains a shorter one is matched whole rather than in parts.
    .sort((a, b) => b.from.length - a.from.length);
  if (rewrites.length === 0) return clips;

  return clips.map((clip) =>
    clip.map((line) => {
      let text = line.text;
      for (const { from, to } of rewrites) text = text.split(from).join(to);
      return text === line.text ? line : { ...line, text };
    }),
  );
}

// ── Validation ────────────────────────────────────────────────────────────────────────────────

/** Words as a listener hears them — punctuation stripped, script-agnostic so Telugu counts too. */
export function countSpokenWords(text: string): number {
  return text
    .replace(/[.,!?;:"'“”‘’()\[\]—–-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export interface DialogueValidationOptions {
  wordsPerClip?: number;
  minWordsPerLine?: number;
  maxWordsPerLine?: number;
}

/**
 * Structural problems with a parsed script, phrased as instructions the repair pass can act on.
 * Returns [] when the script is sound.
 *
 * Scope is deliberately structural — speaker presence, order, counts, length, punctuation. The
 * language-level checks the standard pipeline already owns (native script, spoken phone numbers,
 * CTA placement) are applied per line by the caller, so there is one implementation of each rule.
 */
export function validateDialogueClips(
  clips: DialogueClip[],
  expectedClipCount: number,
  speakers: Speaker[],
  options: DialogueValidationOptions = {},
): string[] {
  const {
    wordsPerClip = WORDS_PER_CLIP,
    minWordsPerLine = MIN_WORDS_PER_LINE,
    maxWordsPerLine = MAX_WORDS_PER_LINE,
  } = options;

  const issues: string[] = [];
  const nameOf = new Map(speakers.map((s) => [s.key, s.name]));
  const label = (key: string) => nameOf.get(key) ?? key;
  const seenClips = new Map<string, number>();

  if (clips.length !== expectedClipCount) {
    issues.push(`Expected exactly ${expectedClipCount} clips but got ${clips.length}.`);
  }

  clips.forEach((clip, index) => {
    const n = index + 1;

    if (clip.length !== speakers.length) {
      const names = speakers.map((s) => s.name).join(" and ");
      issues.push(`Clip ${n} must contain exactly ${speakers.length} spoken lines — one for ${names} — but has ${clip.length}.`);
    }

    // Every character speaks in every clip, in the pack's fixed order.
    speakers.forEach((speaker, position) => {
      const actual = clip[position];
      if (!actual) return;
      if (actual.speaker !== speaker.key) {
        issues.push(`Clip ${n}: ${speaker.name} must speak in position ${position + 1}, but ${label(actual.speaker)} does.`);
      }
    });
    for (const speaker of speakers) {
      if (!clip.some((l) => l.speaker === speaker.key)) {
        issues.push(`Clip ${n} is missing ${speaker.name}'s line — both characters must speak in every clip.`);
      }
    }
    const speakerCounts = new Map<string, number>();
    for (const line of clip) speakerCounts.set(line.speaker, (speakerCounts.get(line.speaker) ?? 0) + 1);
    for (const [key, count] of speakerCounts) {
      if (count > 1) issues.push(`Clip ${n}: ${label(key)} speaks ${count} times — each character speaks exactly once per clip.`);
    }

    let total = 0;
    for (const line of clip) {
      const words = countSpokenWords(line.text);
      total += words;

      if (!line.text.trim()) {
        issues.push(`Clip ${n}: ${label(line.speaker)}'s line is empty.`);
        continue;
      }
      if (words < minWordsPerLine || words > maxWordsPerLine) {
        issues.push(`Clip ${n}: ${label(line.speaker)}'s line must be ${minWordsPerLine}-${maxWordsPerLine} words but has ${words}.`);
      }
      if (!/[.!?]$/.test(line.text.trim())) {
        issues.push(`Clip ${n}: ${label(line.speaker)}'s line must end with spoken punctuation.`);
      }
    }

    if (clip.length > 0 && total !== wordsPerClip) {
      issues.push(`Clip ${n} must contain exactly ${wordsPerClip} spoken words across both characters, but has ${total}.`);
    }

    // Two characters saying the same thing reads as a generation fault, not dialogue.
    const texts = clip.map((l) => l.text.trim().toLowerCase());
    if (texts.length === 2 && texts[0] && texts[0] === texts[1]) {
      issues.push(`Clip ${n}: both characters say the same line.`);
    }

    const key = texts.join(" | ");
    if (key.trim()) {
      const firstSeen = seenClips.get(key);
      if (typeof firstSeen === "number") issues.push(`Clip ${n} duplicates clip ${firstSeen}.`);
      else seenClips.set(key, n);
    }
  });

  return issues;
}
