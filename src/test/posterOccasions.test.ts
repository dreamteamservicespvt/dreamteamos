import { describe, it, expect } from "vitest";
import {
  daysAwayLabel, posterOccasionCalendar, upcomingOccasionLabel, upcomingPosterOccasions, withRegionalAlias,
} from "@/utils/posterOccasions";

/**
 * The poster occasion picker offers what is coming UP. These pin the dates it is built from and
 * the order it offers them in — the member picking one on the 11th of September must see
 * Vinayaka Chavithi and Engineers' Day at the top, not Republic Day.
 */

const at = (iso: string) => new Date(`${iso}T10:00:00`);

describe("upcomingPosterOccasions", () => {
  it("offers the next festivals and days, soonest first", () => {
    const list = upcomingPosterOccasions(at("2026-09-11"), 30);
    const names = list.map((o) => o.name);
    expect(names[0]).toBe("Ganesh Chaturthi (Vinayaka Chavithi)");
    expect(list[0]).toMatchObject({ date: "2026-09-14", daysAway: 3 });
    expect(names).toContain("Engineers' Day");
    expect(names.indexOf("Engineers' Day")).toBeGreaterThan(names.indexOf("Ganesh Chaturthi (Vinayaka Chavithi)"));
    // Sorted by date throughout.
    const dates = list.map((o) => o.date);
    expect([...dates].sort()).toEqual(dates);
    // Nothing already past.
    expect(list.every((o) => o.daysAway >= 0)).toBe(true);
  });

  it("includes today", () => {
    const list = upcomingPosterOccasions(at("2026-09-15"), 5);
    expect(list[0]).toMatchObject({ name: "Engineers' Day", daysAway: 0 });
    expect(daysAwayLabel(0)).toBe("today");
    expect(daysAwayLabel(1)).toBe("tomorrow");
    expect(daysAwayLabel(9)).toBe("in 9 days");
  });

  it("carries on across the new year with the dates that are fixed", () => {
    const names = upcomingPosterOccasions(at("2026-12-20"), 40).map((o) => o.name);
    expect(names).toEqual(expect.arrayContaining(["Christmas", "New Year's Eve", "New Year", "Republic Day"]));
    expect(names.indexOf("New Year")).toBeGreaterThan(names.indexOf("New Year's Eve"));
  });

  it("dates Bathukamma from the calendar's own Navratri, not by guessing", () => {
    const cal = posterOccasionCalendar(2026);
    expect(cal.find((o) => o.name.startsWith("Bathukamma"))?.date).toBe("2026-10-10");
    expect(cal.find((o) => o.name === "Saddula Bathukamma")?.date).toBe("2026-10-19");
  });

  it("never lists the same occasion twice on one day", () => {
    const cal = posterOccasionCalendar(2026);
    const keys = cal.map((o) => `${o.date}|${o.name.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Republic Day is in both the company calendar and the fixed days — once only.
    expect(cal.filter((o) => o.name === "Republic Day")).toHaveLength(1);
  });

  it("computes the relative days for any year", () => {
    const cal2027 = posterOccasionCalendar(2027);
    expect(cal2027.find((o) => o.name === "Mother's Day")?.date).toBe("2027-05-09");
    expect(cal2027.find((o) => o.name === "Engineers' Day")?.date).toBe("2027-09-15");
  });

  it("labels an option with its date and how far away it is", () => {
    const [first] = upcomingPosterOccasions(at("2026-09-11"), 10);
    expect(upcomingOccasionLabel(first)).toBe("Ganesh Chaturthi (Vinayaka Chavithi) — Sep 14 (Mon) · in 3 days");
    expect(withRegionalAlias("Makar Sankranti")).toBe("Makar Sankranti (Sankranthi)");
    expect(withRegionalAlias("Holi")).toBe("Holi");
  });
});
