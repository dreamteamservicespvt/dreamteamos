import { describe, it, expect } from "vitest";
import { EXTERNAL_CREATOR_ROUTES, getProfileRoute } from "@/utils/roleHelpers";

/**
 * Where clicking your own name and face takes you.
 *
 * It is the same target from the topbar and the foot of the sidebar, which is the point of having
 * one function for it: those two used to be plain text, and a member's own profile was reachable
 * only by knowing which nav item it hid behind.
 */

describe("my profile", () => {
  it("takes each kind of employee to their own profile page", () => {
    expect(getProfileRoute("sales_member")).toBe("/sales/profile");
    expect(getProfileRoute("tech_member")).toBe("/tech/profile");
    expect(getProfileRoute("tech_team_leader")).toBe("/team-leader/profile");
  });

  it("takes an admin to Settings, which is their account page under another name", () => {
    expect(getProfileRoute("main_admin")).toBe("/main-admin/settings");
    expect(getProfileRoute("tech_admin")).toBe("/tech-admin/settings");
    expect(getProfileRoute("sales_admin")).toBe("/sales-admin/settings");
  });

  it("gives nothing for an accounts admin, who has no such page yet", () => {
    // Callers render plain text rather than a link that leads nowhere.
    expect(getProfileRoute("accounts_admin")).toBe("");
    expect(getProfileRoute(undefined)).toBe("");
    expect(getProfileRoute(null)).toBe("");
  });

  it("sends an external creator somewhere they are actually allowed to be", () => {
    // AppLayout bounces them off any route outside this list; a profile link that got bounced
    // straight back to Create Ad would look broken.
    expect(EXTERNAL_CREATOR_ROUTES).toContain(getProfileRoute("tech_member"));
  });
});
