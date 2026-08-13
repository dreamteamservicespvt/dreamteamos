import { describe, it, expect } from "vitest";
import { phoneMatchesQuery } from "@/utils/phone";

/**
 * Searching for a number the way people actually write one.
 *
 * Numbers are stored normalised — `+919849834102`, no spaces — but nobody searches that way. A
 * member pastes what the client sent them, and the raw substring test the search used missed every
 * spaced form: searching for a number they had literally just copied said "no such lead".
 */

const STORED = "+919849834102";

describe("finding a lead by phone number", () => {
  /** The three forms in the report, verbatim. */
  it.each([
    "+91 98498 34102",
    "+91 984 98 34 102",
    "984 98 34 102",
  ])("matches %s", (typed) => {
    expect(phoneMatchesQuery(STORED, typed)).toBe(true);
  });

  it.each([
    ["the stored form itself", "+919849834102"],
    ["digits only, with the country code", "919849834102"],
    ["the ten-digit local number", "9849834102"],
    ["a trunk-prefixed number", "09849834102"],
    ["dashes", "98498-34102"],
    ["brackets and dots", "(984) 983.4102"],
    ["a partial number, as you type", "98498"],
    ["the tail of the number", "34102"],
  ])("matches %s", (_label, typed) => {
    expect(phoneMatchesQuery(STORED, typed)).toBe(true);
  });

  it("does not match a different number", () => {
    expect(phoneMatchesQuery(STORED, "9876543210")).toBe(false);
    expect(phoneMatchesQuery(STORED, "+91 98765 43210")).toBe(false);
  });

  /**
   * A name search must not be answered by the phone field. Returning true for a query with no
   * digits would make every lead match the moment somebody typed a letter.
   */
  it("ignores a query with no digits in it", () => {
    expect(phoneMatchesQuery(STORED, "Sharma")).toBe(false);
    expect(phoneMatchesQuery(STORED, "")).toBe(false);
    expect(phoneMatchesQuery(STORED, "   ")).toBe(false);
  });

  it("does not fall over on a missing number", () => {
    expect(phoneMatchesQuery(undefined, "9849834102")).toBe(false);
    expect(phoneMatchesQuery(null, "9849834102")).toBe(false);
    expect(phoneMatchesQuery("", "9849834102")).toBe(false);
  });

  it("works against a number stored without the country code", () => {
    expect(phoneMatchesQuery("9849834102", "+91 98498 34102")).toBe(false); // no 91 stored to find
    expect(phoneMatchesQuery("9849834102", "98498 34102")).toBe(true);
  });
});
