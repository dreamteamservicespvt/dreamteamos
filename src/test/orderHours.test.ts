import { describe, it, expect } from "vitest";
import { hourBucketKey, hourBucketLabel } from "@/utils/orderHours";

/**
 * The unassigned queue, divided by the hour a sale arrived.
 *
 * Sales come in bursts — ten in one evening hour, none for the rest of the day — and the queue
 * flattened all of that into one column. These labels are what let whoever is assigning say "these
 * eight are from last night's six o'clock" instead of scrolling a wall of identical cards.
 */

/** A local Date, deliberately: the labels are read by people sitting in one timezone. */
const at = (iso: string) => new Date(iso);

const NOW = at("2026-08-08T14:30:00");

describe("which hour an order landed in", () => {
  it("keys by the hour it started, not the minute", () => {
    expect(hourBucketKey(at("2026-08-08T18:05:00"))).toBe("2026-08-08-18");
    expect(hourBucketKey(at("2026-08-08T18:59:59"))).toBe("2026-08-08-18");
  });

  it("puts the next hour in a different bucket", () => {
    expect(hourBucketKey(at("2026-08-08T18:59:59")))
      .not.toBe(hourBucketKey(at("2026-08-08T19:00:00")));
  });

  it("reads a Firestore timestamp, a Date and epoch millis the same way", () => {
    const d = at("2026-08-08T18:20:00");
    const seconds = Math.floor(d.getTime() / 1000);
    expect(hourBucketKey({ seconds })).toBe(hourBucketKey(d));
    expect(hourBucketKey(d.getTime())).toBe(hourBucketKey(d));
    expect(hourBucketKey({ toMillis: () => d.getTime() })).toBe(hourBucketKey(d));
  });

  /**
   * One bucket for everything undated, not one bucket each.
   *
   * A heading per undated card would be noise standing in for information, and there are older
   * orders in this database with no usable stamp at all.
   */
  it("collects everything with no usable date into one bucket", () => {
    expect(hourBucketKey(null)).toBe("unknown");
    expect(hourBucketKey(undefined)).toBe("unknown");
    expect(hourBucketKey({})).toBe("unknown");
    expect(hourBucketKey(new Date("nonsense"))).toBe("unknown");
  });
});

describe("what the heading says", () => {
  it("names today and yesterday rather than dating them", () => {
    expect(hourBucketLabel(at("2026-08-08T18:00:00"), NOW)).toBe("Today (6 PM – 7 PM)");
    expect(hourBucketLabel(at("2026-08-07T18:00:00"), NOW)).toBe("Yesterday (6 PM – 7 PM)");
  });

  /** Older than yesterday, a weekday name stops being unambiguous — so it gets the full date. */
  it("dates anything older, day/month/year with the hour span", () => {
    expect(hourBucketLabel(at("2026-07-12T09:00:00"), NOW)).toBe("12 Jul 2026 (9 AM – 10 AM)");
  });

  it("spans the hour rather than naming an instant", () => {
    // An order is FROM an hour, not AT one — "6 PM" alone reads as a deadline.
    expect(hourBucketLabel(at("2026-08-08T18:45:00"), NOW)).toBe("Today (6 PM – 7 PM)");
  });

  it("rolls the span over midnight without saying '11 PM – 0 AM'", () => {
    expect(hourBucketLabel(at("2026-08-08T23:10:00"), NOW)).toBe("Today (11 PM – 12 AM)");
  });

  it("says so plainly when there is no date, instead of inventing one", () => {
    expect(hourBucketLabel(null, NOW)).toBe("No date recorded");
  });
});
