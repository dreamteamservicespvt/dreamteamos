import { describe, it, expect } from "vitest";
import { getNavItems, type NavItem } from "@/utils/roleHelpers";

/**
 * The sales member's sidebar.
 *
 * It had grown to eleven flat links, most of them opened once a month, with the Leaderboard — the
 * one a member checks between calls — sitting seventh. Related pages are grouped now and the order
 * follows how often somebody actually needs them.
 *
 * What these tests are really guarding is the regrouping itself: moving a page into a dropdown is
 * one keystroke away from dropping it, and a page nobody can navigate to is indistinguishable from
 * a deleted one until someone asks where their settlements went.
 */

const nav = () => getNavItems("sales_member");
const titles = (items: NavItem[]) => items.map((i) => i.title);
const allPaths = (items: NavItem[]): string[] =>
  items.flatMap((i) => (i.children ? i.children.map((c) => c.path!) : i.path ? [i.path] : []));

describe("what a sales member sees, in order", () => {
  it("opens on the work, with the leaderboard third", () => {
    expect(titles(nav()).slice(0, 5)).toEqual([
      "Dashboard", "My Leads", "Leaderboard", "Clients", "Salary",
    ]);
  });

  it("keeps the rest in the agreed order", () => {
    const t = titles(nav());
    expect(t.indexOf("Communication")).toBeLessThan(t.indexOf("Training & Scripts"));
    expect(t[t.length - 1]).toBe("My Profile");
  });
});

describe("the two new groups", () => {
  const groupNamed = (name: string) => nav().find((i) => i.title === name);

  it("puts everything about a client who has already bought under Clients", () => {
    expect(groupNamed("Clients")?.children?.map((c) => c.path)).toEqual([
      "/sales/client-chats", "/sales/clients", "/sales/reviews",
    ]);
  });

  it("puts everything about money under Salary", () => {
    expect(groupNamed("Salary")?.children?.map((c) => c.path)).toEqual([
      "/sales/performance", "/sales/salary", "/sales/settlements",
    ]);
  });

  /** A group header is not a destination — it opens the list. A path on it would swallow the click. */
  it("gives the group headers no route of their own", () => {
    expect(groupNamed("Clients")?.path).toBeUndefined();
    expect(groupNamed("Salary")?.path).toBeUndefined();
  });
});

describe("nothing was lost in the regrouping", () => {
  /** Every page that was reachable before the restructure must still be reachable. */
  it("still reaches every page", () => {
    const paths = allPaths(nav());
    for (const p of [
      "/sales/dashboard", "/sales/leads", "/sales/leaderboard", "/sales/client-chats",
      "/sales/clients", "/sales/reviews", "/sales/performance", "/sales/salary",
      "/sales/settlements", "/sales/history", "/sales/chat", "/sales/meeting",
      "/sales/training", "/sales/scripts", "/sales/profile",
    ]) {
      expect(paths, `${p} is no longer in the sidebar`).toContain(p);
    }
  });

  it("reaches each one exactly once", () => {
    const paths = allPaths(nav());
    expect(new Set(paths).size).toBe(paths.length);
  });

  /** Every leaf needs somewhere to go, or the sidebar renders a link to nothing. */
  it("has no leaf without a route", () => {
    for (const item of nav()) {
      if (item.children) expect(item.children.every((c) => !!c.path)).toBe(true);
      else expect(item.path, `${item.title} has no path`).toBeTruthy();
    }
  });
});
