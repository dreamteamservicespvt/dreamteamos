/**
 * Owner, 2026-10-10: "except in the My Team sections, in all the remaining sections don't show the
 * inactive persons — only show the active persons." One rule decides who is shown.
 */
import { describe, it, expect } from "vitest";
import { isActiveUser } from "@/utils/roleHelpers";

describe("isActiveUser — who the app shows outside My Team / Team Management", () => {
  it("shows an active person, and a person written before the field existed", () => {
    expect(isActiveUser({ isActive: true })).toBe(true);
    expect(isActiveUser({})).toBe(true);
  });

  it("hides a person marked inactive, and nobody at all", () => {
    expect(isActiveUser({ isActive: false })).toBe(false);
    expect(isActiveUser(null)).toBe(false);
    expect(isActiveUser(undefined)).toBe(false);
  });
});
