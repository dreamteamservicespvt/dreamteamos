import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  SLA_PRESETS, presetsForCategory, formatHoursLabel, buildPromise, promiseDueMs, deadlineState, formatRemaining,
} from "@/utils/promiseSla";

describe("formatHoursLabel", () => {
  it("renders whole days and hours sensibly", () => {
    expect(formatHoursLabel(24)).toBe("1 day");
    expect(formatHoursLabel(48)).toBe("2 days");
    expect(formatHoursLabel(72)).toBe("3 days");
    expect(formatHoursLabel(1)).toBe("1 hour");
    expect(formatHoursLabel(5)).toBe("5 hours");
    expect(formatHoursLabel(12)).toBe("12 hours");
  });
});

describe("presetsForCategory", () => {
  it("offers the right presets per category", () => {
    expect(presetsForCategory("promotional").map((p) => p.key)).toEqual(["promotional_24h"]);
    expect(presetsForCategory("cinematic").map((p) => p.key)).toEqual(["cinematic_3d", "cinematic_5d"]);
    expect(presetsForCategory("website").map((p) => p.key)).toEqual(["website_5d", "website_10d", "website_15d"]);
    expect(presetsForCategory("logo")).toEqual([]); // no preset -> custom only
  });
  it("every preset has a positive hour value", () => {
    for (const p of SLA_PRESETS) expect(p.hours).toBeGreaterThan(0);
  });
});

describe("buildPromise", () => {
  const T = Date.UTC(2026, 5, 16, 9, 0, 0); // fixed start

  it("builds a preset promise with the right hours, label and dueAt", () => {
    const p = buildPromise({ presetKey: "promotional_24h", startMs: T });
    expect(p.hours).toBe(24);
    expect(p.label).toBe("24 hours");
    expect(p.source).toBe("preset");
    expect(p.startAt.toMillis()).toBe(T);
    expect(p.dueAt.toMillis()).toBe(T + 24 * 3600_000);
  });

  it("builds a custom promise from days→hours", () => {
    const p = buildPromise({ presetKey: "custom", customHours: 48, startMs: T });
    expect(p.hours).toBe(48);
    expect(p.label).toBe("2 days");
    expect(p.source).toBe("custom");
    expect(p.dueAt.toMillis()).toBe(T + 48 * 3600_000);
  });

  it("uses the cinematic 3-day preset", () => {
    const p = buildPromise({ presetKey: "cinematic_3d", startMs: T });
    expect(p.hours).toBe(72);
    expect(p.dueAt.toMillis()).toBe(T + 72 * 3600_000);
  });
});

describe("promiseDueMs", () => {
  it("reads a Firestore Timestamp", () => {
    expect(promiseDueMs({ dueAt: Timestamp.fromMillis(5000) } as any)).toBe(5000);
  });
  it("reads a {seconds} shape", () => {
    expect(promiseDueMs({ dueAt: { seconds: 7 } } as any)).toBe(7000);
  });
  it("returns 0 when missing", () => {
    expect(promiseDueMs(null)).toBe(0);
    expect(promiseDueMs({} as any)).toBe(0);
  });
});

describe("deadlineState", () => {
  const now = 1_000_000_000_000;
  it("flags overdue, near (<=6h) and ok", () => {
    expect(deadlineState(now - 1000, now)).toBe("overdue");
    expect(deadlineState(now + 3 * 3600_000, now)).toBe("near");
    expect(deadlineState(now + 10 * 3600_000, now)).toBe("ok");
    expect(deadlineState(now + 6 * 3600_000, now)).toBe("near"); // boundary
    expect(deadlineState(0, now)).toBe("ok"); // no due time
  });
});

describe("formatRemaining", () => {
  const now = 1_000_000_000_000;
  it("renders days/hours/minutes and overdue", () => {
    expect(formatRemaining(now + (2 * 24 + 4) * 3600_000, now)).toBe("2d 4h left");
    expect(formatRemaining(now + 5 * 3600_000 + 12 * 60_000, now)).toBe("5h 12m left");
    expect(formatRemaining(now - (3 * 3600_000 + 30 * 60_000), now)).toBe("3h 30m overdue");
    expect(formatRemaining(now + 40 * 60_000, now)).toBe("40m left");
  });
});
