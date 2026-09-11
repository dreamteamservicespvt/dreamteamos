/**
 * How big a poster is — one string that travels assignment → AI Platform → prompt unchanged.
 *
 * Three shapes are stored, and every one of them is a plain string so it can sit on a work
 * assignment, a saved generation and a WhatsApp brief without a schema of its own:
 *
 *   "4:5"         a preset ratio (the four the team actually posts at)
 *   "5:7"         a custom ratio, typed as width : height
 *   "1080x1350"   exact pixels, typed as width × height
 *
 * ── Why 4:5 is the default ────────────────────────────────────────────────────────────────────
 * It is the tallest shape Instagram shows uncropped in the feed, which is where nearly every
 * poster the team makes ends up. Square and story sizes are one tap away; anything else is typed.
 *
 * ── Why the shorter side is 1080 ──────────────────────────────────────────────────────────────
 * Every platform the posters go to renders 1080 wide, so a ratio is turned into pixels by holding
 * the shorter side at 1080 and scaling the other. A member who needs a print size types pixels
 * and gets exactly those.
 */

export interface PosterRatioPreset {
  value: string;
  label: string;
  /** Where this shape is used, in the words a member would use. */
  hint: string;
}

export const POSTER_RATIO_PRESETS: PosterRatioPreset[] = [
  { value: "4:5", label: "4:5", hint: "Instagram portrait" },
  { value: "3:4", label: "3:4", hint: "Classic portrait" },
  { value: "1:1", label: "1:1", hint: "Square post" },
  { value: "9:16", label: "9:16", hint: "Story / WhatsApp status" },
];

export const DEFAULT_POSTER_SIZE = "4:5";

/** The shorter side of a ratio-sized poster, in pixels. */
export const POSTER_BASE_PIXELS = 1080;

/** Sensible bounds, so a typo cannot ask an image model for a 3-pixel or 90,000-pixel canvas. */
export const POSTER_MIN_PIXELS = 200;
export const POSTER_MAX_PIXELS = 10000;
export const POSTER_MAX_RATIO_PART = 100;

export type PosterSizeKind = "preset" | "ratio" | "pixels";

export interface PosterSize {
  kind: PosterSizeKind;
  /** Width : height, reduced ("4:5"), or the nearest simple ratio for odd pixel sizes ("≈2:3"). */
  ratio: string;
  /** True when `ratio` is exact; false when it is the nearest simple approximation. */
  ratioExact: boolean;
  width: number;
  height: number;
  orientation: "portrait" | "landscape" | "square";
  /** The canonical stored string. */
  value: string;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The nearest width:height using whole numbers up to 32 — for describing an odd pixel size. */
function nearestSimpleRatio(width: number, height: number): string {
  const target = width / height;
  let best = { a: 1, b: 1, err: Infinity };
  for (let b = 1; b <= 32; b++) {
    const a = Math.max(1, Math.round(target * b));
    const err = Math.abs(a / b - target);
    if (err < best.err - 1e-9) best = { a, b, err };
  }
  return `${best.a}:${best.b}`;
}

function orientationOf(width: number, height: number): PosterSize["orientation"] {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

/** Pixels for a ratio: shorter side held at 1080, the other scaled and rounded to an even number. */
export function pixelsForRatio(w: number, h: number): { width: number; height: number } {
  if (w === h) return { width: POSTER_BASE_PIXELS, height: POSTER_BASE_PIXELS };
  const even = (n: number) => Math.round(n / 2) * 2;
  return w < h
    ? { width: POSTER_BASE_PIXELS, height: even((POSTER_BASE_PIXELS * h) / w) }
    : { width: even((POSTER_BASE_PIXELS * w) / h), height: POSTER_BASE_PIXELS };
}

const RATIO_RE = /^\s*(\d{1,3})\s*[:∶/]\s*(\d{1,3})\s*$/;
const PIXELS_RE = /^\s*(\d{2,5})\s*[x×*]\s*(\d{2,5})\s*(px)?\s*$/i;

/** Parses a stored or typed size. Anything unreadable resolves to null rather than throwing. */
export function tryParsePosterSize(value?: string | null): PosterSize | null {
  const raw = (value || "").trim();
  if (!raw) return null;

  const px = raw.match(PIXELS_RE);
  if (px) {
    const width = parseInt(px[1], 10);
    const height = parseInt(px[2], 10);
    const inRange = (n: number) => n >= POSTER_MIN_PIXELS && n <= POSTER_MAX_PIXELS;
    if (!inRange(width) || !inRange(height)) return null;
    const d = gcd(width, height);
    const reducedW = width / d;
    const reducedH = height / d;
    const exact = reducedW <= 32 && reducedH <= 32;
    return {
      kind: "pixels",
      ratio: exact ? `${reducedW}:${reducedH}` : nearestSimpleRatio(width, height),
      ratioExact: exact,
      width,
      height,
      orientation: orientationOf(width, height),
      value: `${width}x${height}`,
    };
  }

  const r = raw.match(RATIO_RE);
  if (r) {
    const w = parseInt(r[1], 10);
    const h = parseInt(r[2], 10);
    if (w < 1 || h < 1 || w > POSTER_MAX_RATIO_PART || h > POSTER_MAX_RATIO_PART) return null;
    const d = gcd(w, h);
    const rw = w / d;
    const rh = h / d;
    const value = `${rw}:${rh}`;
    const { width, height } = pixelsForRatio(rw, rh);
    return {
      kind: POSTER_RATIO_PRESETS.some((p) => p.value === value) ? "preset" : "ratio",
      ratio: value,
      ratioExact: true,
      width,
      height,
      orientation: orientationOf(rw, rh),
      value,
    };
  }

  return null;
}

/** Like `tryParsePosterSize`, but an empty or unreadable value falls back to the 4:5 default. */
export function parsePosterSize(value?: string | null): PosterSize {
  return tryParsePosterSize(value) ?? (tryParsePosterSize(DEFAULT_POSTER_SIZE) as PosterSize);
}

export function isValidPosterSize(value?: string | null): boolean {
  return tryParsePosterSize(value) !== null;
}

/** "4:5 · 1080×1350 px" — how a size reads on a card, a chip or a brief. */
export function posterSizeLabel(value?: string | null): string {
  const s = parsePosterSize(value);
  if (s.kind === "pixels") {
    return `${s.width}×${s.height} px (${s.ratioExact ? "" : "≈"}${s.ratio})`;
  }
  return `${s.ratio} · ${s.width}×${s.height} px`;
}

/**
 * The canvas, stated for an image model: exact shape, exact pixels, which way up.
 *
 * Written once here so the concept prompt, its repair pass and the refine prompt all say the same
 * sentence — a model told "4:5" in one place and "vertical" in another will pick one.
 */
export function posterCanvasSentence(value?: string | null): string {
  const s = parsePosterSize(value);
  const shape = s.orientation === "square" ? "square" : `${s.orientation} (${s.orientation === "portrait" ? "taller than wide" : "wider than tall"})`;
  const ratio = `${s.ratioExact ? "" : "approximately "}${s.ratio}`;
  return `a ${ratio} ${shape} poster, exactly ${s.width} × ${s.height} pixels`;
}

// ── Assignment helpers ──────────────────────────────────────────────────────────────────────

/** The one category key a poster job carries on a work assignment. */
export const POSTER_CATEGORY = "poster";

/** What a poster job stores in the `duration` slot every assignment has. */
export const POSTER_DURATION = "poster";

/** Price a poster job is valued at when nothing sold says otherwise — the Standard package. */
export const DEFAULT_POSTER_PRICE = 199;

export function isPosterCategory(category?: string | null): boolean {
  return category === POSTER_CATEGORY;
}

/**
 * How much work a job is, as one short phrase — for every card that used to print "N clips + EC".
 *
 * A poster is not measured in clips, and "0 clips + EC" on a poster card reads as a job with
 * nothing in it. A social-media month is measured in the jobs a member holds.
 */
export function assignmentSizeLabel(a: {
  category?: string;
  clipCount?: number;
  posterSize?: string;
  posterCount?: number;
}): string {
  if (isPosterCategory(a.category)) {
    const count = a.posterCount && a.posterCount > 1 ? ` × ${a.posterCount}` : "";
    return `Poster ${parsePosterSize(a.posterSize).ratio}${count}`;
  }
  return `${a.clipCount ?? 0} clips + EC`;
}
