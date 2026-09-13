/**
 * How long is left on a generation — as a real, ticking number, never "2–3 minutes".
 *
 * ── What there is to go on ──────────────────────────────────────────────────────────────────────
 * The generator reports progress only at a handful of fixed checkpoints (services/geminiService
 * onProgress): video goes 0 → 10 → 20 → (40) → 45 → 100, poster goes 0 → 13.5 → 45 → 55 → (80) → 100.
 * Between 45 and 100 of a video run there is one long silence while three model calls run at once.
 * Nothing anywhere recorded how long a generation took, so there was no history to average either.
 *
 * So this is built in three layers, each honest about what it knows:
 *   1. A PLAN — each stretch between two checkpoints, with a baseline duration worked out from the
 *      run's own inputs (clip count, attached files, location photos, poster concepts).
 *   2. CALIBRATION — every finished run records how long each stretch really took against its
 *      baseline, in this browser. The next estimate multiplies the baseline by the recent median of
 *      that ratio, so it is a guess the first time and close after a handful of runs.
 *   3. RE-ANCHORING — each checkpoint that arrives resets the clock to what is actually known: the
 *      time since the current stretch began, and the calibrated length of every stretch still ahead.
 *
 * The display side (DisplayClock below) keeps the number moving smoothly between those resets: it
 * counts down, runs a little faster when it was pessimistic and a little slower when it was not,
 * never counts UP, and once the estimate is spent says exactly how far over it the run has gone.
 */

export type GenerationMode = "video" | "poster";

/** The inputs that decide how long a run takes, snapshotted when Start is pressed. */
export interface RunProfile {
  mode: GenerationMode;
  /** Video: number of 8-second clips (1-15). Ignored for posters. */
  clipCount: number;
  /** Files the extraction pass reads — logo, visiting cards, store/product images, flyers, notes. */
  fileCount: number;
  /** Location photographs the scouting pass reads, or 0 when the ad is not shot on location. */
  locationPhotos: number;
  /** A special-category (character pack) ad writes dialogue and validates it, which takes longer. */
  characterPack: boolean;
  /** A pasted script is used verbatim, so there is almost no voice-over step. */
  customScript: boolean;
  /** Poster: how many concepts are written. Ignored for video. */
  conceptCount: number;
}

/** One stretch between two checkpoints. */
export interface Segment {
  /** Stable name, used to calibrate this stretch against past runs. */
  key: string;
  /** The progress percent that starts this stretch. */
  from: number;
  /** Baseline duration before calibration, in milliseconds. */
  baselineMs: number;
  /**
   * Only runs sometimes, and the plan cannot know in advance — the poster "fill in the missing
   * concepts" pass. It adds nothing to the estimate until its checkpoint actually arrives.
   */
  optional?: boolean;
}

/** A checkpoint the run has passed: the percent reported, and when it arrived (epoch ms). */
export interface Checkpoint {
  percent: number;
  at: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const s = (seconds: number) => Math.round(seconds * 1000);

/**
 * The stretches this run will go through, with a baseline for each.
 *
 * The baselines are deliberately plain arithmetic on the inputs rather than tuned magic: they only
 * have to be in the right neighbourhood on a browser's first run, because calibration takes over
 * from the second.
 */
export function planFor(profile: RunProfile): Segment[] {
  const files = Math.max(0, profile.fileCount);
  if (profile.mode === "poster") {
    const concepts = clamp(profile.conceptCount || 3, 1, 6);
    return [
      { key: "poster.prep", from: 0, baselineMs: s(1) },
      { key: "poster.extract", from: 13.5, baselineMs: s(7 + 1.2 * files) },
      { key: "poster.handoff", from: 45, baselineMs: s(0.5) },
      { key: "poster.concepts", from: 55, baselineMs: s(10 + 5 * concepts) },
      { key: "poster.fill", from: 80, baselineMs: s(6 + 3 * concepts), optional: true },
    ];
  }

  const clips = clamp(profile.clipCount || 4, 1, 15);
  const scouting = profile.locationPhotos > 0;
  const script = profile.customScript
    ? 2
    : 10 + 1.4 * clips + (profile.characterPack ? 8 : 0);
  return [
    { key: "video.prep", from: 0, baselineMs: s(1) },
    { key: "video.extract", from: 10, baselineMs: s(7 + 1.2 * files) },
    { key: "video.script", from: 20, baselineMs: s(script) },
    ...(scouting ? [{ key: "video.scout", from: 40, baselineMs: s(5 + 1.5 * profile.locationPhotos) }] : []),
    { key: "video.assets", from: 45, baselineMs: s(24 + 3.5 * clips + (profile.characterPack ? 6 : 0)) },
  ];
}

/** The stretch a run is in, given the last percent it reported. */
export function segmentAt(plan: Segment[], percent: number): Segment {
  let current = plan[0];
  for (const seg of plan) if (seg.from <= percent + 1e-9) current = seg;
  return current;
}

/** A stretch's calibrated length: its baseline times this browser's recent speed for it. */
export function segmentMs(seg: Segment, factors: Record<string, number> = {}): number {
  return seg.baselineMs * clamp(factors[seg.key] ?? 1, 0.25, 4);
}

/** The whole run's calibrated length, before it starts. Optional stretches are not counted. */
export function plannedTotalMs(plan: Segment[], factors: Record<string, number> = {}): number {
  return plan.filter((seg) => !seg.optional).reduce((sum, seg) => sum + segmentMs(seg, factors), 0);
}

/**
 * The best estimate of the time left, right now.
 *
 * The current stretch contributes whatever of its calibrated length has not yet elapsed — floored at
 * zero, because a stretch that has overrun is still running, and guessing how much longer it will
 * overrun is not something the signals can support. Every later mandatory stretch adds its full
 * calibrated length. An optional stretch counts only once the run has actually entered it.
 */
export function estimateRemainingMs(
  plan: Segment[],
  checkpoints: Checkpoint[],
  now: number,
  factors: Record<string, number> = {},
): number {
  if (plan.length === 0) return 0;
  const last = checkpoints[checkpoints.length - 1] ?? { percent: 0, at: now };
  if (last.percent >= 100) return 0;

  const current = segmentAt(plan, last.percent);
  const index = plan.indexOf(current);
  const spent = Math.max(0, now - last.at);
  const currentLeft = Math.max(0, segmentMs(current, factors) - spent);
  const ahead = plan
    .slice(index + 1)
    .filter((seg) => !seg.optional)
    .reduce((sum, seg) => sum + segmentMs(seg, factors), 0);
  return currentLeft + ahead;
}

// ── Calibration history ─────────────────────────────────────────────────────────────────────────

/** One finished run, as the ratio of real time to baseline for each stretch it went through. */
export interface RunTiming {
  mode: GenerationMode;
  /** segment key → actual ÷ baseline. */
  ratios: Record<string, number>;
  totalMs: number;
  finishedAt: number;
}

export const ETA_HISTORY_KEY = "dts.adgen.runTimings.v1";
const HISTORY_LIMIT = 24;
/** How many recent runs a stretch's speed is taken from — recent enough to follow a slow API day. */
const CALIBRATION_WINDOW = 8;

/**
 * What a finished run teaches: how long each stretch really took against its baseline.
 *
 * A stretch is measured from its checkpoint to the next one the run reported. Stretches with a
 * baseline under a second are skipped — those are hand-offs, a few milliseconds of bookkeeping, and
 * a ratio on a number that small is noise that would only destabilise the real stretches.
 */
export function measureRun(
  profile: RunProfile,
  checkpoints: Checkpoint[],
  finishedAt: number,
): RunTiming | null {
  if (checkpoints.length < 2) return null;
  const plan = planFor(profile);
  const ratios: Record<string, number> = {};
  const points = [...checkpoints].sort((a, b) => a.at - b.at);
  const end = [...points, { percent: 100, at: finishedAt }];
  for (let i = 0; i < end.length - 1; i++) {
    const seg = segmentAt(plan, end[i].percent);
    const actual = end[i + 1].at - end[i].at;
    if (seg.baselineMs < 1000 || actual <= 0) continue;
    // Two checkpoints inside one stretch add up rather than overwrite.
    const prior = (ratios[seg.key] ?? 0) * seg.baselineMs;
    ratios[seg.key] = (prior + actual) / seg.baselineMs;
  }
  return {
    mode: profile.mode,
    ratios,
    totalMs: finishedAt - points[0].at,
    finishedAt,
  };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** This browser's recent speed for each stretch of this mode — 1 wherever there is no history. */
export function calibrationFactors(history: RunTiming[], mode: GenerationMode): Record<string, number> {
  const recent = history.filter((run) => run.mode === mode).slice(-CALIBRATION_WINDOW);
  const byKey: Record<string, number[]> = {};
  for (const run of recent) {
    for (const [key, ratio] of Object.entries(run.ratios)) {
      if (Number.isFinite(ratio) && ratio > 0) (byKey[key] ??= []).push(ratio);
    }
  }
  const factors: Record<string, number> = {};
  for (const [key, ratios] of Object.entries(byKey)) factors[key] = clamp(median(ratios), 0.25, 4);
  return factors;
}

/**
 * The stored history. Browser storage can be missing, full, blocked or corrupt — every one of those
 * reads as "no history", which only means the first estimate is uncalibrated.
 */
export function loadRunHistory(storage: Pick<Storage, "getItem"> | null = safeStorage()): RunTiming[] {
  try {
    const raw = storage?.getItem(ETA_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.ratios === "object") : [];
  } catch {
    return [];
  }
}

export function saveRunTiming(
  timing: RunTiming,
  storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage(),
): void {
  try {
    const next = [...loadRunHistory(storage), timing].slice(-HISTORY_LIMIT);
    storage?.setItem(ETA_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // A full or blocked store costs calibration, never the generation.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

// ── The number on screen ────────────────────────────────────────────────────────────────────────

/**
 * Smooths the estimate into a clock a person can trust.
 *
 * Re-anchoring at each checkpoint makes the raw estimate jump, and inside a stretch that has
 * overrun it stops moving altogether. Shown raw, that reads as a broken timer. So the displayed
 * value only ever counts DOWN, at a speed set by how far it is from the estimate: up to 2.5× when it
 * was too pessimistic, as slow as 0.3× when it was too optimistic, 1× when they agree. When the
 * displayed time reaches zero and the run is still going, the clock turns over and counts the time
 * past the estimate instead — an exact number, not a shrug.
 */
/** A target this far above zero after the clock has run out is new work, not noise. */
const REVIVE_MS = 5000;

export class DisplayClock {
  private displayedMs: number;
  private lastTick: number;
  private overrunSince: number | null = null;

  constructor(initialMs: number, now: number) {
    this.displayedMs = Math.max(0, initialMs);
    this.lastTick = now;
  }

  /** Advance to `now` toward `targetMs`, and report what to show. */
  tick(targetMs: number, now: number): { remainingMs: number; overrunMs: number } {
    const dt = Math.max(0, now - this.lastTick);
    this.lastTick = now;

    // Work the estimate did not know about — the poster pass that fills in missing concepts starts
    // only after the first pass comes back short. That is a new countdown, not more overrun.
    if (this.displayedMs === 0 && targetMs > REVIVE_MS) {
      this.displayedMs = targetMs;
      this.overrunSince = null;
      return { remainingMs: this.displayedMs, overrunMs: 0 };
    }

    if (this.displayedMs > 0) {
      const rate = targetMs <= 0
        ? 2.5
        : clamp(this.displayedMs / Math.max(targetMs, 1), 0.3, 2.5);
      this.displayedMs = Math.max(0, this.displayedMs - dt * rate);
      if (this.displayedMs === 0) this.overrunSince = now;
    }

    if (this.displayedMs > 0) return { remainingMs: this.displayedMs, overrunMs: 0 };
    return { remainingMs: 0, overrunMs: this.overrunSince === null ? 0 : now - this.overrunSince };
  }
}

/**
 * `83_000` → `"1:23"`, `3_725_000` → `"1:02:05"`.
 *
 * A countdown rounds UP, so it never shows 0:00 while there is still a second to go. Time past the
 * estimate rounds DOWN, so it never claims a second that has not happened yet.
 */
export function formatClock(ms: number, round: "up" | "down" = "up"): string {
  const seconds = Math.max(0, ms / 1000);
  const total = round === "up" ? Math.ceil(seconds) : Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
