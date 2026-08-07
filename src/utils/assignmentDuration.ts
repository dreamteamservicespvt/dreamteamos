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

/** Seconds of finished video for a clip count. */
export function secondsForClips(clips: number): number {
  return Math.max(0, Math.floor(clips) || 0) * CLIP_SECONDS;
}

/**
 * A length said the way a person says it.
 *
 * "64s" is not a length anybody uses out loud, and it is actively confusing next to "2 min" —
 * a member comparing 64s with 120s has to do arithmetic to tell which is longer. Under a minute
 * reads in seconds; above it reads in minutes, with the remainder only when there is one.
 */
export function humanDuration(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} sec`;
  const mins = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${mins} min ${rest} sec` : `${mins} min`;
}

/**
 * How a length is written EVERYWHERE a person picks or reads one: clips first.
 *
 * ── Why clips lead ────────────────────────────────────────────────────────────────────────────
 * The whole production side counts in clips — a clip is one generated shot, and eight seconds is
 * simply how long one lasts. Sales was picking a length in minutes and seconds, which meant the
 * two halves of the company described the same ad in units neither could convert on sight: a
 * member sold "1 minute" and the tech team had to work out that this is 8 clips, sometimes
 * getting 7 and building an ad eight seconds short of what was sold.
 *
 * Putting the clip count first and the seconds after it means nobody has to convert anything.
 * The seconds stay because that is what the CLIENT was promised, and a member on the phone needs
 * to be able to say it.
 *
 * e.g. 4 → "4 clips · 32 sec", 15 → "15 clips · 2 min".
 */
export function clipChoiceLabel(clips: number): string {
  const n = Math.max(0, Math.floor(clips) || 0);
  return `${n} ${n === 1 ? "clip" : "clips"} · ${humanDuration(secondsForClips(n))}`;
}

/** The same, from a stored duration string: `"64s"` → `"8 clips · 1 min 4 sec"`. */
export function durationChoiceLabel(duration: string): string {
  return clipChoiceLabel(getClipCount(duration));
}

/**
 * The lengths offered first when somebody is picking one.
 *
 * Deliberately the sizes the team actually sells rather than every multiple of eight: a list of
 * thirty options is not a choice, it is a search. Anything else is still reachable through the
 * custom box, which is what the last entry of every picker opens.
 */
export const CLIP_PRESETS: number[] = [2, 4, 6, 8, 15];

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
 * A length a sales member typed, as a duration the production side can build.
 *
 * Everything downstream counts in whole 8-second clips, so "2 minutes" has to become a number of
 * clips before it means anything. Rounded UP rather than down: a client who bought two minutes
 * gets 120 seconds of video, and a rounding rule that quietly delivers 112 is the company short-
 * changing somebody by eight seconds to save a clip.
 *
 * Returns both halves because the caller needs both — the clip count drives the work and the price,
 * and the duration string is what every existing dropdown and label speaks.
 */
export function clipsForSeconds(seconds: number): number {
  const s = Math.max(CLIP_SECONDS, Math.round(Number(seconds) || 0));
  return Math.max(1, Math.ceil(s / CLIP_SECONDS));
}

/** `120` → `"120s"`, snapped up to a whole clip so the label and the work agree. */
export function durationFromSeconds(seconds: number): string {
  return durationForClips(clipsForSeconds(seconds));
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
