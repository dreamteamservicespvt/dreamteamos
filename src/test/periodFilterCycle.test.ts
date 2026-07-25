import { describe, it, expect } from "vitest";
import { periodBounds, periodLabel, shiftMonth, defaultPeriodFilter, type PeriodFilter } from "@/utils/periodFilter";

/**
 * "This month" means two different things in this company: the sales side runs on calendar
 * months, the tech side on a 10th → 9th performance cycle. These lock in that a filter carrying
 * `monthBasis: "cycle"` measures, labels and steps by the cycle — and that the calendar basis is
 * completely untouched by its existence.
 */

const cycle = (month: string): PeriodFilter => ({ mode: "month", month, day: "2026-07-23", monthBasis: "cycle" });
const calendar = (month: string): PeriodFilter => ({ mode: "month", month, day: "2026-07-23" });

describe("cycle month basis", () => {
  it("runs from the 10th to the 9th of the next month", () => {
    expect(periodBounds(cycle("2026-07"))).toEqual({ from: "2026-07-10", to: "2026-08-09" });
  });

  it("handles a February cycle and a year boundary", () => {
    expect(periodBounds(cycle("2026-02"))).toEqual({ from: "2026-02-10", to: "2026-03-09" });
    expect(periodBounds(cycle("2026-12"))).toEqual({ from: "2026-12-10", to: "2027-01-09" });
  });

  it("spells the span out rather than calling 10 Jul – 09 Aug 'July'", () => {
    expect(periodLabel(cycle("2026-07"))).toBe("10 Jul – 09 Aug 2026");
  });

  it("steps a whole cycle at a time, keeping the basis", () => {
    const prev = shiftMonth(cycle("2026-07"), -1);
    expect(prev.monthBasis).toBe("cycle");
    expect(periodBounds(prev)).toEqual({ from: "2026-06-10", to: "2026-07-09" });
  });

  it("defaults to the cycle containing today when asked for one", () => {
    const filter = defaultPeriodFilter("cycle");
    expect(filter.monthBasis).toBe("cycle");
    const bounds = periodBounds(filter)!;
    const today = new Date().toISOString().slice(0, 10);
    expect(bounds.from <= today && today <= bounds.to).toBe(true);
  });
});

describe("calendar month basis is unchanged", () => {
  it("still spans the whole calendar month", () => {
    expect(periodBounds(calendar("2026-07"))).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(periodBounds(calendar("2026-02"))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("still labels by month name when a screen asks for it", () => {
    expect(periodLabel(calendar("2026-07"))).toBe("July 2026");
  });

  /**
   * A filter built by hand with no basis is still read as a calendar month, so nothing that
   * constructs one literally changed meaning underneath itself.
   */
  it("is what an explicitly basis-less filter still means", () => {
    expect(periodBounds({ mode: "month", month: "2026-07", day: "2026-07-23" })).toEqual({
      from: "2026-07-01", to: "2026-07-31",
    });
  });
});

/**
 * The business runs 10th → 9th — output, salary and targets are all measured on it — so "This
 * Month" has to mean the same thing on every screen and for every role. It used to default to the
 * calendar with only two screens opting in, so the same question asked on two pages gave two
 * different answers and nobody could tell which was right.
 */
describe("the 10–9 cycle is what every screen gets by default", () => {
  it("defaults to the cycle, not the calendar", () => {
    expect(defaultPeriodFilter().monthBasis).toBe("cycle");
  });

  it("still lets a screen ask for calendar months deliberately", () => {
    expect(defaultPeriodFilter("calendar").monthBasis).toBe("calendar");
  });

  it("starts on the cycle containing today, so its bounds are a real 10→9 span", () => {
    const bounds = periodBounds(defaultPeriodFilter())!;
    expect(bounds.from.endsWith("-10")).toBe(true);
    expect(bounds.to.endsWith("-09")).toBe(true);
  });

  // React calls a lazy `useState(defaultPeriodFilter)` initialiser with no arguments — several
  // screens pass it that way, and it must still land on the cycle.
  it("survives being used as a bare useState initialiser", () => {
    const asInitialiser: () => ReturnType<typeof defaultPeriodFilter> = defaultPeriodFilter;
    expect(asInitialiser().monthBasis).toBe("cycle");
  });
});
