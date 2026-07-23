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

  it("still labels by month name, and is the default", () => {
    expect(periodLabel(calendar("2026-07"))).toBe("July 2026");
    expect(defaultPeriodFilter().monthBasis).toBe("calendar");
    expect(periodBounds({ mode: "month", month: "2026-07", day: "2026-07-23" })).toEqual({
      from: "2026-07-01", to: "2026-07-31",
    });
  });
});
