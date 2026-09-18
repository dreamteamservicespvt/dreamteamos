/**
 * Where a B-roll image or an on-screen overlay belongs in the edit.
 *
 * Both were already generated per clip, and neither told the editor WHERE: the B-roll list showed a
 * concept and a prompt, the overlay list a "Clip 2" heading, and the person cutting the video had to
 * hold the script in their head to know which spoken line each one plays over.
 *
 * So the placement is computed here, in code, from the script itself — the clip, its second range and
 * the exact line spoken in it — rather than asked of a model that can miscount. Pure, so the timing on
 * screen can never drift from the timing in the prompt.
 */
import { CLIP_SECONDS, parseLabeledClips } from "./voiceOverFormat";
import { cueForWords, cueLabel, type Cue } from "./wordTiming";

export interface ClipPlacement {
  /** 1-based clip number. */
  clip: number;
  /** Seconds from the start of the ad. */
  start: number;
  end: number;
  /** "Clip 2 · 8–16s" — what a member reads. */
  timing: string;
  /** The line spoken in that clip, as the script has it (speaker labels and all). */
  line: string;
}

/** A clip's spoken text with the `[Motu]:` labels taken off, for a one-line preview. */
export const spokenOnly = (line: string): string =>
  (line || "").replace(/\[[^\]]*\]:/g, " ").replace(/\s+/g, " ").trim();

/**
 * One placement per clip of a script. `clipCount` fills in when the script cannot be read into
 * labelled clips, so an editor still gets the timing even for an unusual script.
 */
export function clipPlacements(voiceOverScript: string, clipCount?: number): ClipPlacement[] {
  const lines = parseLabeledClips(voiceOverScript || "").map((l) => l.trim()).filter(Boolean);
  const count = lines.length || Math.max(0, Math.floor(clipCount || 0));
  return Array.from({ length: count }, (_, i) => {
    const start = i * CLIP_SECONDS;
    const end = start + CLIP_SECONDS;
    return {
      clip: i + 1,
      start,
      end,
      timing: `Clip ${i + 1} · ${start}–${end}s`,
      line: lines[i] || "",
    };
  });
}

/**
 * The same items back, each carrying the clip it plays over, its seconds and that clip's line.
 *
 * `clipOf` reads whichever field the generator used (a B-roll's `id`, an overlay's `clip`); anything
 * unreadable falls back to the item's position, which is the order both generators write in.
 */
/**
 * The same items, each also carrying WHEN it belongs on the timeline.
 *
 * The model says which words an overlay or image is anchored to; the seconds are worked out here from
 * the clip's own line, so the timecode an editor reads can never disagree with the script. Words that
 * are not in the line fall back to the whole clip, and the cue says so.
 */
export function withCues<T extends Record<string, any>>(
  items: (T & Partial<ClipPlacement>)[],
): (T & Partial<ClipPlacement> & { cue?: Cue; cueLabel?: string })[] {
  return items.map((item) => {
    if (typeof item.line !== "string" || typeof item.start !== "number" || typeof item.end !== "number") return item;
    const cue = cueForWords(item.line, String(item.fromWord ?? ""), String(item.toWord ?? ""), item.start, item.end);
    return { ...item, cue, cueLabel: cueLabel(cue), fromWord: cue.fromWord, toWord: cue.toWord };
  });
}

export function withPlacements<T extends Record<string, any>>(
  items: T[],
  placements: ClipPlacement[],
  clipOf: (item: T, index: number) => unknown = (item, index) => item.clip ?? item.id ?? index + 1,
): (T & Partial<ClipPlacement>)[] {
  return items.map((item, index) => {
    const raw = String(clipOf(item, index) ?? "").match(/\d+/);
    const asked = raw ? Number(raw[0]) : index + 1;
    const placement = placements.find((p) => p.clip === asked)
      ?? placements[Math.min(index, placements.length - 1)];
    return placement ? { ...item, ...placement } : item;
  });
}
