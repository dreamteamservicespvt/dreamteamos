import { describe, it, expect } from "vitest";
import {
  SALES_ROLE_LADDER, TECH_ROLE_LADDER, departmentForTitle, ladderFor, nextRole, roleByTitle,
  roleByTitleAnyLadder, termsForRole,
} from "@/utils/roleLadder";

/**
 * The technical career ladder.
 *
 * Three facts belong to each rung — the title, what it pays and what notice it carries — and the
 * reason they live together is that typed separately they drift: two Associates on different money,
 * a Senior on a fortnight's notice. Everything here is a starting point an admin can override; what
 * must not vary is where a rung sits and what comes after it.
 */

describe("the rungs", () => {
  it("runs Associate → Engineer → Senior, in that order", () => {
    expect(TECH_ROLE_LADDER.map((r) => r.title)).toEqual([
      "Associate AI Software Engineer",
      "AI Software Engineer",
      "Senior AI Software Engineer",
    ]);
  });

  it("pays each rung what the company set", () => {
    expect(TECH_ROLE_LADDER.map((r) => r.monthlySalary)).toEqual([5000, 10000, 15000]);
  });

  it("raises the notice period as the rung rises", () => {
    const days = TECH_ROLE_LADDER.map((r) => r.noticeDays);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(days[days.length - 1]).toBeGreaterThan(days[0]);
  });

  it("treats only the top rung as a critical senior role", () => {
    expect(TECH_ROLE_LADDER.filter((r) => r.senior).map((r) => r.title))
      .toEqual(["Senior AI Software Engineer"]);
  });

  it("has a ladder per department, and none for a record without one", () => {
    expect(ladderFor("tech")).toHaveLength(3);
    expect(ladderFor("sales")).toHaveLength(7);
    expect(ladderFor(null)).toEqual([]);
  });

  it("pays the sales rungs what the company actually pays them", () => {
    expect(SALES_ROLE_LADDER.map((r) => [r.title, r.monthlySalary])).toEqual([
      ["Business Development Associate", 10000],
      ["Business Development Executive", 15000],
      ["Senior Business Development Executive", 20000],
      ["Business Development Manager", 25000],
      ["Senior Business Development Manager", 30000],
      ["Regional Sales Manager", 40000],
      ["Head of Business Development", 50000],
    ]);
  });

  it("keeps the pay out of the title", () => {
    // The picker used to render "AI Software Engineer — ₹10,000/mo", and that string is a label for
    // choosing between rungs, not anybody's designation. A title carrying a salary would print the
    // salary in the one place on a letter it must never appear.
    for (const role of [...SALES_ROLE_LADDER, ...TECH_ROLE_LADDER]) {
      expect(role.title).not.toMatch(/[₹\d]/);
    }
  });

  it("scales notice with seniority, and flags the senior rungs", () => {
    const bySales = Object.fromEntries(SALES_ROLE_LADDER.map((r) => [r.title, r]));
    expect(bySales["Business Development Associate"].noticeDays).toBe(15);
    expect(bySales["Head of Business Development"].noticeDays).toBe(60);
    expect(bySales["Business Development Executive"].senior).toBe(false);
    expect(bySales["Business Development Manager"].senior).toBe(true);
  });

  it("places a title on the right ladder even when the record has no department", () => {
    // Every profile written before `department` existed has none, and the letters have to know
    // which side somebody is on to print the right reporting line and incentive clause.
    expect(departmentForTitle("Regional Sales Manager")).toBe("sales");
    expect(departmentForTitle("Senior AI Software Engineer")).toBe("tech");
    expect(departmentForTitle("Video Editor")).toBeNull();
    expect(departmentForTitle(null)).toBeNull();
  });

  it("finds a rung without being told which ladder to look on", () => {
    expect(roleByTitleAnyLadder("Business Development Manager")?.monthlySalary).toBe(25000);
    expect(roleByTitleAnyLadder("AI Software Engineer")?.monthlySalary).toBe(10000);
    expect(roleByTitleAnyLadder("Chief Vibes Officer")).toBeNull();
  });
});

describe("picking a rung", () => {
  it("brings its salary, notice period and seniority with it", () => {
    expect(termsForRole(TECH_ROLE_LADDER[2])).toEqual({
      designation: "Senior AI Software Engineer",
      ctcMonthly: 15000,
      noticeDaysOverride: 45,
      seniorRole: true,
    });
  });

  it("finds a rung by title, whatever the casing", () => {
    expect(roleByTitle("ai software engineer")?.monthlySalary).toBe(10000);
    expect(roleByTitle("  Senior AI Software Engineer  ")?.senior).toBe(true);
  });

  it("returns nothing for a title that is not on the ladder", () => {
    expect(roleByTitle("Video Editor")).toBeNull();
    expect(roleByTitle("")).toBeNull();
    expect(roleByTitle("AI Software Engineer", "sales")).toBeNull();
  });
});

describe("promotion", () => {
  it("steps one rung at a time, in order", () => {
    expect(nextRole("Associate AI Software Engineer")?.title).toBe("AI Software Engineer");
    expect(nextRole("AI Software Engineer")?.title).toBe("Senior AI Software Engineer");
  });

  it("carries the new salary, so nobody is promoted onto the wrong money", () => {
    expect(nextRole("Associate AI Software Engineer")?.monthlySalary).toBe(10000);
  });

  it("stops at the top rather than wrapping round to the bottom", () => {
    expect(nextRole("Senior AI Software Engineer")).toBeNull();
  });

  it("has no answer for a title nobody placed on the ladder, and says so", () => {
    // Guessing here would promote a Video Editor into an engineering role.
    expect(nextRole("Video Editor")).toBeNull();
    expect(nextRole(null)).toBeNull();
  });
});
