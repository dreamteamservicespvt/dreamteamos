import { describe, it, expect } from "vitest";
import {
  DAY_OPTIONS, DEFAULT_PROBATION_MONTHS, EMPLOYMENT_DEFAULTS, TIME_OPTIONS, applyEmploymentDefaults,
  formatDays, formatHours, matchDayOption, matchTimeOption, splitRange,
} from "@/utils/employmentDefaults";
import type { EmployeeProfile } from "@/types/hr";

/**
 * The terms a new hire starts with.
 *
 * Two guarantees pull against each other and both matter: an empty form should arrive already
 * filled with the arrangement almost everyone here works under, and a field somebody has already
 * decided must never be quietly rewritten by that convenience.
 */

describe("filling the blanks", () => {
  it("fills an empty record with the standard arrangement", () => {
    const filled = applyEmploymentDefaults({}, "full_time");
    expect(filled.designation).toBe("AI Software Engineer");
    // A full postal address, not a city — this is printed as the place of work on every letter.
    expect(filled.workLocation).toContain("Vishnalayam Street");
    expect(filled.workLocation).toContain("533002");
    expect(filled.reportingToName).toBe("Senior AI Software Engineer");
    expect(filled.workingHours).toBe("10:00 AM – 7:00 PM");
    expect(filled.workingDays).toBe("Monday – Saturday");
  });

  it("upgrades a record still carrying the old city-only default", () => {
    // Not an overwrite of somebody's decision: this string WAS the default, so every record made
    // before the full address existed carries it. Left alone, those letters would print a city
    // forever while new hires got a postal address.
    for (const stale of ["Kakinada, Andhra Pradesh", "Kakinada , Andhra Pradesh", "kakinada,andhra pradesh"]) {
      expect(applyEmploymentDefaults({ workLocation: stale }, "full_time").workLocation, stale)
        .toBe(EMPLOYMENT_DEFAULTS.workLocation);
    }
  });

  it("leaves a location an admin actually chose alone", () => {
    // A second office is a decision. Guessing that any short location is stale would move this
    // person to the wrong address.
    for (const chosen of ["Visakhapatnam", "Hyderabad, Telangana", "Client site — Rajahmundry"]) {
      expect(applyEmploymentDefaults({ workLocation: chosen }, "full_time").workLocation, chosen)
        .toBe(chosen);
    }
  });

  it("does not touch the new address once it is in place", () => {
    const current = EMPLOYMENT_DEFAULTS.workLocation;
    expect(applyEmploymentDefaults({ workLocation: current }, "full_time").workLocation).toBe(current);
  });

  it("never overwrites something already decided", () => {
    const existing = {
      designation: "Video Editor",
      workLocation: "Visakhapatnam",
      reportingToName: "Asha Rao",
      workingHours: "9:00 AM – 6:00 PM",
      workingDays: "Monday – Friday",
      probationMonths: 6,
    } as Partial<EmployeeProfile>;
    expect(applyEmploymentDefaults(existing, "full_time")).toEqual(existing);
  });

  it("puts a permanent hire on the standard probation rather than none", () => {
    // Left unset, the letter printed "Full-Time (Permanent)" — the job confirmed from day one,
    // which is the opposite of what was agreed. Seventeen of twenty live records were in that state.
    expect(applyEmploymentDefaults({}, "full_time").probationMonths).toBe(DEFAULT_PROBATION_MONTHS);
    expect(applyEmploymentDefaults({}, "part_time").probationMonths).toBe(DEFAULT_PROBATION_MONTHS);
  });

  it("gives an intern or a contractor no probation — a fixed term is not an evaluation", () => {
    expect(applyEmploymentDefaults({}, "intern").probationMonths).toBe(0);
    expect(applyEmploymentDefaults({}, "contract").probationMonths).toBe(0);
  });

  it("respects a deliberate zero", () => {
    // `??` and not `||`: somebody hired with no probation has decided something, and a default
    // that overrules an explicit 0 would put a probation on their letter nobody agreed to.
    expect(applyEmploymentDefaults({ probationMonths: 0 }, "full_time").probationMonths).toBe(0);
  });

  it("starts a sales hire on a sales title reporting to a sales officer", () => {
    // The single global default made every sales employee a "Senior AI Software Engineer"'s report,
    // which is nonsense on a letter and is exactly what went out before this existed.
    const sales = applyEmploymentDefaults({}, "full_time", "sales");
    expect(sales.designation).toBe("Business Development Associate");
    expect(sales.reportingToName).toBe("Chief Business Officer (CBO)");

    const tech = applyEmploymentDefaults({}, "full_time", "tech");
    expect(tech.designation).toBe(EMPLOYMENT_DEFAULTS.designation);
    expect(tech.reportingToName).toBe(EMPLOYMENT_DEFAULTS.reportingToName);
  });

  it("treats whitespace as empty, so a stray space does not defeat the default", () => {
    expect(applyEmploymentDefaults({ designation: "   " }, "full_time").designation)
      .toBe(EMPLOYMENT_DEFAULTS.designation);
  });

  it("leaves a part-timer's hours and days blank — theirs are allocated, not standard", () => {
    const filled = applyEmploymentDefaults({}, "part_time");
    expect(filled.workingHours).toBeUndefined();
    expect(filled.workingDays).toBeUndefined();
    // The rest still applies: the title and the place are the same whoever they are.
    expect(filled.designation).toBe(EMPLOYMENT_DEFAULTS.designation);
    expect(filled.workLocation).toBe(EMPLOYMENT_DEFAULTS.workLocation);
  });

  it("still keeps a part-timer's hours when they have been set deliberately", () => {
    expect(applyEmploymentDefaults({ workingHours: "2:00 PM – 6:00 PM" }, "part_time").workingHours)
      .toBe("2:00 PM – 6:00 PM");
  });

  it("gives an intern the standard shift, like anyone else full-time on site", () => {
    expect(applyEmploymentDefaults({}, "intern").workingHours).toBe("10:00 AM – 7:00 PM");
  });
});

describe("the pickers", () => {
  it("offers every half hour of the day, starting at midnight", () => {
    expect(TIME_OPTIONS).toHaveLength(48);
    expect(TIME_OPTIONS[0]).toBe("12:00 AM");
    expect(TIME_OPTIONS).toContain("10:00 AM");
    expect(TIME_OPTIONS).toContain("7:00 PM");
    expect(TIME_OPTIONS).toContain("9:30 AM");
  });

  it("offers the week starting on Monday", () => {
    expect(DAY_OPTIONS[0]).toBe("Monday");
    expect(DAY_OPTIONS).toHaveLength(7);
  });

  it("joins a range the way a letter should print it", () => {
    expect(formatHours("10:00 AM", "7:00 PM")).toBe("10:00 AM – 7:00 PM");
    expect(formatDays("Monday", "Saturday")).toBe("Monday – Saturday");
  });

  it("prints a single day as itself rather than 'Sunday – Sunday'", () => {
    expect(formatDays("Sunday", "Sunday")).toBe("Sunday");
  });

  it("returns nothing when half a range is missing, so the field stays empty", () => {
    expect(formatHours("10:00 AM", "")).toBeNull();
    expect(formatDays("", "Saturday")).toBeNull();
  });
});

describe("reading back what is already stored", () => {
  /**
   * These fields were free text before the pickers existed, so the database holds every shape
   * somebody typed. Each one has to open in the form — a record that renders blank is one an admin
   * will overwrite without realising it had anything in it.
   */
  it.each([
    ["10:00 AM – 7:00 PM", "10:00 AM", "7:00 PM"],
    ["10:00 AM - 7:00 PM", "10:00 AM", "7:00 PM"],
    ["10:00 AM to 7:00 PM", "10:00 AM", "7:00 PM"],
    ["10:00AM-7:00PM", "10:00 AM", "7:00 PM"],
  ])("splits %s", (stored, from, to) => {
    const parts = splitRange(stored);
    expect(matchTimeOption(parts.from)).toBe(from);
    expect(matchTimeOption(parts.to)).toBe(to);
  });

  it("understands a time written without minutes", () => {
    expect(matchTimeOption("10 AM")).toBe("10:00 AM");
  });

  it("reads day ranges however they were written", () => {
    for (const stored of ["Monday to Saturday", "Monday – Saturday", "Mon-Sat", "monday to saturday"]) {
      const { from, to } = splitRange(stored);
      expect(matchDayOption(from), stored).toBe("Monday");
      expect(matchDayOption(to), stored).toBe("Saturday");
    }
  });

  it("gives back an empty selection rather than a wrong one for something unreadable", () => {
    expect(matchTimeOption("whenever")).toBe("");
    expect(matchDayOption("")).toBe("");
    expect(splitRange(null)).toEqual({ from: "", to: "" });
  });

  it("round-trips the default through split and format unchanged", () => {
    const stored = formatHours(EMPLOYMENT_DEFAULTS.startTime, EMPLOYMENT_DEFAULTS.endTime)!;
    const { from, to } = splitRange(stored);
    expect(formatHours(matchTimeOption(from), matchTimeOption(to))).toBe(stored);
  });
});
