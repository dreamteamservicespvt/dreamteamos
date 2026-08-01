import { describe, it, expect } from "vitest";
import {
  birthdayGreeting, birthdayNoticeMessage, birthdaySeenKey, birthdaysOn, isBirthdayOn, isoDay,
  monthDay, namesSentence, turningAge,
} from "@/utils/birthdays";

const on = (iso: string) => new Date(`${iso}T09:00:00`);

describe("whose birthday it is", () => {
  it("matches the day and month, whatever the year", () => {
    expect(isBirthdayOn("1998-08-02", on("2026-08-02"))).toBe(true);
    expect(isBirthdayOn("1998-08-03", on("2026-08-02"))).toBe(false);
  });

  it("celebrates a 29 February birthday on the 28th in common years", () => {
    // Skipping it three years in four is the kind of small unkindness software does by accident,
    // and the person it happens to notices every time.
    expect(isBirthdayOn("2000-02-29", on("2026-02-28"))).toBe(true);
    expect(isBirthdayOn("2000-02-29", on("2026-03-01"))).toBe(false);
    // In a leap year it falls on its own day and NOT on the 28th.
    expect(isBirthdayOn("2000-02-29", on("2028-02-29"))).toBe(true);
    expect(isBirthdayOn("2000-02-29", on("2028-02-28"))).toBe(false);
  });

  it("handles the century rule, which is not a leap year despite dividing by four", () => {
    expect(isBirthdayOn("2000-02-29", on("2100-02-28"))).toBe(true);
  });

  it("says no for anyone who has not filled their date in", () => {
    expect(isBirthdayOn(undefined, on("2026-08-02"))).toBe(false);
    expect(isBirthdayOn(null, on("2026-08-02"))).toBe(false);
    expect(isBirthdayOn("", on("2026-08-02"))).toBe(false);
    expect(isBirthdayOn("not-a-date", on("2026-08-02"))).toBe(false);
  });

  it("reads the month and day off a stored date", () => {
    expect(monthDay("1998-08-02")).toBe("08-02");
    expect(monthDay("1998-08")).toBe("");
  });

  it("uses the reader's own day, not UTC", () => {
    // Late on the 2nd in India is still the 2nd — a UTC-based day would have called it the 1st.
    expect(isoDay(new Date(2026, 7, 2, 23, 45))).toBe("2026-08-02");
  });
});

describe("the list of people celebrating", () => {
  const team = [
    { uid: "u1", name: "Ravi", dob: "1995-08-02" },
    { uid: "u2", name: "Asha", dob: "1990-08-02" },
    { uid: "u3", name: "Kiran", dob: "1992-12-25" },
    { uid: "u4", name: "Nobody", dob: null },
  ];

  it("finds everyone whose day it is, in name order", () => {
    expect(birthdaysOn(team, on("2026-08-02")).map((p) => p.name)).toEqual(["Asha", "Ravi"]);
  });

  it("is empty on an ordinary day", () => {
    expect(birthdaysOn(team, on("2026-08-03"))).toEqual([]);
  });
});

describe("what people are told", () => {
  it("reads as a sentence, not a list to parse", () => {
    expect(namesSentence(["Asha"])).toBe("Asha");
    expect(namesSentence(["Asha", "Ravi"])).toBe("Asha and Ravi");
    expect(namesSentence(["Asha", "Ravi", "Kiran"])).toBe("Asha, Ravi and Kiran");
    expect(namesSentence([])).toBe("");
  });

  it("names who to wish", () => {
    expect(birthdayNoticeMessage([{ uid: "u1", name: "Asha" }]))
      .toBe("It's Asha's birthday today 🎂 — send them your wishes!");
    expect(birthdayNoticeMessage([{ uid: "u1", name: "Asha" }, { uid: "u2", name: "Ravi" }]))
      .toContain("Asha and Ravi");
  });
});

describe("the greeting the birthday person sees", () => {
  it("greets them by first name and signs off from the company", () => {
    const g = birthdayGreeting("Asha Devi", on("2026-08-02"), "1996-08-02");
    expect(g.title).toBe("Happy Birthday, Asha! 🎉");
    expect(g.age).toBe(30);
    expect(g.message).toContain("30th year");
  });

  it("still greets someone whose year of birth is unknown or nonsense", () => {
    expect(birthdayGreeting("Ravi", on("2026-08-02"), null).age).toBeNull();
    expect(birthdayGreeting("Ravi", on("2026-08-02"), "1000-08-02").age).toBeNull();
    expect(birthdayGreeting("Ravi", on("2026-08-02"), null).message).toContain("wonderful year");
  });

  it("copes with a blank name rather than greeting nobody", () => {
    expect(birthdayGreeting("", on("2026-08-02")).title).toBe("Happy Birthday, there! 🎉");
  });

  it("works out the age only when it is plausible", () => {
    expect(turningAge("1996-08-02", on("2026-08-02"))).toBe(30);
    expect(turningAge("2026-08-02", on("2026-08-02"))).toBeNull(); // 0
    expect(turningAge(undefined, on("2026-08-02"))).toBeNull();
  });

  it("is shown once a year, not once ever", () => {
    // A plain "seen" flag would silently retire the feature for everyone who has used it once.
    expect(birthdaySeenKey("u1", on("2026-08-02"))).not.toBe(birthdaySeenKey("u1", on("2027-08-02")));
    expect(birthdaySeenKey("u1", on("2026-08-02"))).toBe(birthdaySeenKey("u1", on("2026-08-02")));
  });
});
