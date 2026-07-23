import { describe, it, expect } from "vitest";
import { getNavItems, defaultRouteForUser, EXTERNAL_CREATOR_ROUTES } from "@/utils/roleHelpers";
import type { AppUser } from "@/types";

/**
 * External creators are outside people given ad-only access: their whole app is the Create Ad tool
 * plus their profile, and they land there by default. These lock that navigation contract.
 */

const member = (f: Partial<AppUser>): AppUser => ({ uid: "u", role: "tech_member", ...f } as AppUser);

describe("external creator navigation", () => {
  it("shows a normal tech member their full nav", () => {
    const nav = getNavItems("tech_member", member({}));
    const titles = nav.map((i) => i.title);
    expect(titles).toContain("Dashboard");
    expect(titles).toContain("My Work");
    expect(titles.length).toBeGreaterThan(2);
  });

  it("shows an external creator only Create Ad + My Profile", () => {
    const nav = getNavItems("tech_member", member({ externalCreator: true }));
    expect(nav.map((i) => i.title)).toEqual(["Create Ad", "My Profile"]);
    expect(nav.map((i) => i.path)).toEqual(["/tech/create", "/tech/profile"]);
  });

  it("lands a normal member on their dashboard, an external creator on Create Ad", () => {
    expect(defaultRouteForUser(member({}))).toBe("/tech/dashboard");
    expect(defaultRouteForUser(member({ externalCreator: true }))).toBe("/tech/create");
  });

  it("confines external creators to exactly the ad tool and their profile", () => {
    expect(EXTERNAL_CREATOR_ROUTES).toEqual(["/tech/create", "/tech/profile"]);
    expect(EXTERNAL_CREATOR_ROUTES).not.toContain("/tech/dashboard");
    expect(EXTERNAL_CREATOR_ROUTES).not.toContain("/tech/my-work");
  });

  it("passing no user (or a non-flagged one) keeps the standard nav", () => {
    expect(getNavItems("tech_member").length).toBeGreaterThan(2);
    expect(getNavItems("tech_member", null).length).toBeGreaterThan(2);
  });
});
