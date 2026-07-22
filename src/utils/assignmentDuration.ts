import { PRICING } from './pricing';

/** Every ad clip is 8 seconds long — the unit the whole generation pipeline is built on. */
export const CLIP_SECONDS = 8;

/** Standard packages offered per category. */
export const DURATIONS: Record<string, string[]> = {
  wishes: ['20s', '40s'],
  promotional: ['16s', '32s', '48s', '64s'],
  cinematic: ['16s', '32s', '48s', '64s'],
};

/** Clip count for the standard packages (wishes clips run longer than 8s, hence the lookup). */
export const CLIP_COUNTS: Record<string, number> = {
  '16s': 2, '32s': 4, '48s': 6, '64s': 8,
  '20s': 2, '40s': 4,
};

/** Which standard packages ship with a poster. */
export const HAS_POSTER: Record<string, boolean> = {
  '16s': false, '32s': true, '48s': true, '64s': true,
  '20s': false, '40s': false,
};

/** `"24s"` → 3. Falls back to seconds ÷ 8 for custom durations outside the lookup. */
export function getClipCount(duration: string): number {
  return CLIP_COUNTS[duration] || Math.max(1, Math.floor(parseInt(duration) / CLIP_SECONDS));
}

/** Every ad closes with 5s of end credits. */
export const END_CREDITS_SECONDS = 5;

/** Posters ship from 4 clips (32s) up — custom durations follow the same threshold. */
export function hasPoster(duration: string): boolean {
  const known = HAS_POSTER[duration];
  return known !== undefined ? known : getClipCount(duration) >= 4;
}

/** A custom clip count expressed as a duration string, e.g. 3 → `"24s"`. */
export function durationForClips(clips: number): string {
  return `${clips * CLIP_SECONDS}s`;
}

/**
 * Normalises a typed clip count. There is deliberately no upper bound — the team assigns ads of
 * whatever length the client bought — only a floor of 1, since a zero-clip ad is not a thing.
 */
export function normalizeClipCount(clips: number): number {
  return Math.max(1, Math.floor(clips) || 1);
}

/**
 * Duration choices for an edit dropdown: the category's standard packages plus, when the
 * assignment was created with a custom clip count, its own duration — so editing an existing
 * custom-length assignment never silently snaps it back to a standard package.
 */
export function durationOptionsFor(category: string, current?: string): string[] {
  const options = DURATIONS[category] || [];
  return current && !options.includes(current) ? [...options, current] : options;
}

/**
 * Price for a non-standard clip count. The published packages are effectively linear per clip
 * (promotional ≈ ₹250/clip, cinematic ≈ ₹500/clip), so a custom length is priced off the
 * category's own base package rather than with a separate hand-maintained table.
 */
export function priceForClips(category: string, clips: number): number {
  const table = PRICING[category];
  const basePackage = DURATIONS[category]?.[0];
  if (!table || !basePackage) return 0;

  const exact = table[durationForClips(clips)];
  if (exact !== undefined) return exact;

  const perClip = table[basePackage] / getClipCount(basePackage);
  return Math.round(perClip * clips);
}
