import { describe, it, expect } from "vitest";
import {
  DisplayClock, calibrationFactors, estimateRemainingMs, formatClock, loadRunHistory, measureRun,
  planFor, plannedTotalMs, saveRunTiming, segmentAt, ETA_HISTORY_KEY, type RunProfile,
} from "@/utils/generationEta";

/**
 * The countdown on the generation workspace. It is shown to a member as an exact number, so the
 * things that make an exact number trustworthy are pinned: it re-anchors on real checkpoints, it
 * learns from real runs, it never counts up, and when it is wrong it says by how much.
 */

const VIDEO: RunProfile = {
  mode: "video", clipCount: 4, fileCount: 3, locationPhotos: 0,
  characterPack: false, customScript: false, conceptCount: 0,
};
const POSTER: RunProfile = { ...VIDEO, mode: "poster", conceptCount: 3 };

describe("the plan", () => {
  it("follows the video checkpoints the generator actually reports", () => {
    expect(planFor(VIDEO).map((s) => s.from)).toEqual([0, 10, 20, 45]);
  });

  it("adds the location-scouting stretch only when the ad is shot on location", () => {
    expect(planFor({ ...VIDEO, locationPhotos: 5 }).map((s) => s.from)).toEqual([0, 10, 20, 40, 45]);
  });

  it("follows the poster checkpoints, with the fill-in pass optional", () => {
    const plan = planFor(POSTER);
    expect(plan.map((s) => s.from)).toEqual([0, 13.5, 45, 55, 80]);
    expect(plan.find((s) => s.from === 80)?.optional).toBe(true);
  });

  it("grows with the work: more clips, more files, a character pack", () => {
    const base = plannedTotalMs(planFor(VIDEO));
    expect(plannedTotalMs(planFor({ ...VIDEO, clipCount: 8 }))).toBeGreaterThan(base);
    expect(plannedTotalMs(planFor({ ...VIDEO, fileCount: 10 }))).toBeGreaterThan(base);
    expect(plannedTotalMs(planFor({ ...VIDEO, characterPack: true }))).toBeGreaterThan(base);
  });

  it("barely waits on the voice-over when the script was pasted in", () => {
    const pasted = planFor({ ...VIDEO, customScript: true }).find((s) => s.key === "video.script")!;
    const written = planFor(VIDEO).find((s) => s.key === "video.script")!;
    expect(pasted.baselineMs).toBeLessThan(written.baselineMs / 4);
  });

  it("places a percent in the stretch it belongs to", () => {
    const plan = planFor(VIDEO);
    expect(segmentAt(plan, 0).key).toBe("video.prep");
    expect(segmentAt(plan, 20).key).toBe("video.script");
    expect(segmentAt(plan, 44).key).toBe("video.script");
    expect(segmentAt(plan, 45).key).toBe("video.assets");
  });
});

describe("the estimate", () => {
  const plan = planFor(VIDEO);
  const total = plannedTotalMs(plan);

  it("starts at the whole planned run", () => {
    expect(estimateRemainingMs(plan, [{ percent: 0, at: 1000 }], 1000)).toBe(total);
  });

  it("counts down in real time inside a stretch", () => {
    const at20 = estimateRemainingMs(plan, [{ percent: 20, at: 0 }], 0);
    expect(estimateRemainingMs(plan, [{ percent: 20, at: 0 }], 4000)).toBe(at20 - 4000);
  });

  // A stretch that overran is still running; the signals cannot say for how much longer.
  it("floors an overrun stretch at zero rather than going negative", () => {
    const assetsOnly = plan.find((s) => s.key === "video.assets")!.baselineMs;
    const late = estimateRemainingMs(plan, [{ percent: 20, at: 0 }], 10 * 60_000);
    expect(late).toBe(assetsOnly);
  });

  it("re-anchors on each checkpoint, from what is actually known", () => {
    const assets = plan.find((s) => s.key === "video.assets")!.baselineMs;
    expect(estimateRemainingMs(plan, [{ percent: 20, at: 0 }, { percent: 45, at: 90_000 }], 90_000)).toBe(assets);
  });

  it("is zero once the run reports 100", () => {
    expect(estimateRemainingMs(plan, [{ percent: 100, at: 0 }], 0)).toBe(0);
  });

  it("ignores the optional poster pass until it actually starts", () => {
    const poster = planFor(POSTER);
    const fill = poster.find((s) => s.optional)!.baselineMs;
    const concepts = poster.find((s) => s.key === "poster.concepts")!.baselineMs;
    expect(estimateRemainingMs(poster, [{ percent: 55, at: 0 }], 0)).toBe(concepts);
    expect(estimateRemainingMs(poster, [{ percent: 80, at: 0 }], 0)).toBe(fill);
  });

  it("applies this browser's calibrated speed", () => {
    const slow = estimateRemainingMs(plan, [{ percent: 45, at: 0 }], 0, { "video.assets": 2 });
    const normal = estimateRemainingMs(plan, [{ percent: 45, at: 0 }], 0);
    expect(slow).toBe(normal * 2);
  });
});

describe("calibration", () => {
  it("measures each stretch against its baseline", () => {
    const plan = planFor(VIDEO);
    const assets = plan.find((s) => s.key === "video.assets")!.baselineMs;
    const run = measureRun(VIDEO, [
      { percent: 0, at: 0 }, { percent: 10, at: 100 }, { percent: 20, at: 20_000 }, { percent: 45, at: 40_000 },
    ], 40_000 + assets * 1.5)!;
    expect(run.ratios["video.assets"]).toBeCloseTo(1.5, 5);
    expect(run.totalMs).toBe(40_000 + assets * 1.5);
  });

  it("takes the recent median, so one freak run does not skew it", () => {
    const runs = [1, 1.2, 1.1, 9, 1.3].map((r, i) => ({
      mode: "video" as const, ratios: { "video.assets": r }, totalMs: 1, finishedAt: i,
    }));
    expect(calibrationFactors(runs, "video")["video.assets"]).toBeCloseTo(1.2, 5);
  });

  it("keeps video and poster history apart", () => {
    const runs = [{ mode: "poster" as const, ratios: { "video.assets": 3 }, totalMs: 1, finishedAt: 0 }];
    expect(calibrationFactors(runs, "video")).toEqual({});
  });

  it("clamps an absurd ratio so a stalled run cannot wreck the next estimate", () => {
    const runs = [{ mode: "video" as const, ratios: { "video.assets": 50 }, totalMs: 1, finishedAt: 0 }];
    expect(calibrationFactors(runs, "video")["video.assets"]).toBe(4);
  });

  it("survives storage that is missing, corrupt or full", () => {
    expect(loadRunHistory(null)).toEqual([]);
    expect(loadRunHistory({ getItem: () => "not json" })).toEqual([]);
    const full = { getItem: () => "[]", setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(() => saveRunTiming({ mode: "video", ratios: {}, totalMs: 1, finishedAt: 0 }, full)).not.toThrow();
  });

  it("round-trips through storage and keeps only the most recent runs", () => {
    const store: Record<string, string> = {};
    const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    for (let i = 0; i < 30; i++) {
      saveRunTiming({ mode: "video", ratios: { "video.assets": 1 }, totalMs: i, finishedAt: i }, storage);
    }
    const history = loadRunHistory(storage);
    expect(history).toHaveLength(24);
    expect(history.at(-1)!.finishedAt).toBe(29);
    expect(Object.keys(store)).toEqual([ETA_HISTORY_KEY]);
  });
});

describe("the clock on screen", () => {
  it("counts down one second per second when the estimate agrees", () => {
    const clock = new DisplayClock(60_000, 0);
    // Within a few tens of milliseconds of exactly one second — the display started one second
    // ahead of the estimate, so it closes that gap by a hair.
    expect(Math.abs(clock.tick(59_000, 1000).remainingMs - 59_000)).toBeLessThan(50);
  });

  // The one thing a countdown must never do.
  it("never counts up, even when the estimate rises", () => {
    const clock = new DisplayClock(30_000, 0);
    let last = 30_000;
    for (let t = 1000; t <= 20_000; t += 1000) {
      const { remainingMs } = clock.tick(90_000, t);
      expect(remainingMs).toBeLessThanOrEqual(last);
      last = remainingMs;
    }
  });

  it("slows when it was optimistic and speeds up when it was pessimistic", () => {
    const optimistic = new DisplayClock(10_000, 0).tick(40_000, 1000).remainingMs;
    const pessimistic = new DisplayClock(40_000, 0).tick(10_000, 1000).remainingMs;
    expect(10_000 - optimistic).toBeLessThan(1000);
    expect(40_000 - pessimistic).toBeGreaterThan(1000);
  });

  it("turns over and counts the time past the estimate, exactly", () => {
    const clock = new DisplayClock(1000, 0);
    clock.tick(0, 1000);
    expect(clock.tick(0, 8000)).toEqual({ remainingMs: 0, overrunMs: 7000 });
  });

  it("starts a new countdown when work the estimate never knew about begins", () => {
    const clock = new DisplayClock(1000, 0);
    clock.tick(0, 2000);
    expect(clock.tick(20_000, 3000)).toEqual({ remainingMs: 20_000, overrunMs: 0 });
  });

  it("formats minutes and seconds, rounding a countdown up and overrun down", () => {
    expect(formatClock(83_000)).toBe("1:23");
    expect(formatClock(82_100)).toBe("1:23");
    expect(formatClock(82_900, "down")).toBe("1:22");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });
});
