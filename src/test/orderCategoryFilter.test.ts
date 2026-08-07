import { describe, it, expect } from "vitest";
import {
  ALL_ORDER_CATEGORIES, matchesOrderCategory, orderCategoryKey, orderCategoryOptionLabel,
  orderCategoryOptions,
} from "@/utils/orderCategoryFilter";

const o = (category: string, bulkAdType?: string) => ({ category, bulkAdType });

describe("orderCategoryKey", () => {
  it("is the order's own category for ordinary work", () => {
    expect(orderCategoryKey(o("cinematic"))).toBe("cinematic");
    expect(orderCategoryKey(o("social_media_management"))).toBe("social_media_management");
    expect(orderCategoryKey(o("website"))).toBe("website");
  });

  it("gives a bulk order its own bucket, whatever kind of video is inside it", () => {
    // It used to resolve to the video kind, which meant a member who sold "Bulk Videos" could not
    // find "Bulk Videos" in the filter — and bulk work is managed on its own board, not alongside
    // single ads. Every option is now the service that was actually sold.
    expect(orderCategoryKey(o("bulk_ads", "cinematic"))).toBe("bulk_ads");
    expect(orderCategoryKey(o("bulk_ads", "wishes"))).toBe("bulk_ads");
    expect(orderCategoryKey(o("bulk_ads"))).toBe("bulk_ads");
  });
});

describe("matchesOrderCategory", () => {
  it("lets everything through when nothing is selected", () => {
    expect(matchesOrderCategory(o("website"), ALL_ORDER_CATEGORIES)).toBe(true);
    expect(matchesOrderCategory(o("cinematic"), ALL_ORDER_CATEGORIES)).toBe(true);
  });

  it("keeps only the chosen kind", () => {
    expect(matchesOrderCategory(o("cinematic"), "cinematic")).toBe(true);
    expect(matchesOrderCategory(o("promotional"), "cinematic")).toBe(false);
  });

  it("matches a bulk order under Bulk Videos, not under the kind inside it", () => {
    expect(matchesOrderCategory(o("bulk_ads", "cinematic"), "bulk_ads")).toBe(true);
    expect(matchesOrderCategory(o("bulk_ads", "cinematic"), "cinematic")).toBe(false);
  });

  it("leaves single ads completely unaffected", () => {
    // The change is scoped to bulk: for everything else the key resolves exactly as before.
    expect(matchesOrderCategory(o("cinematic"), "cinematic")).toBe(true);
    expect(matchesOrderCategory(o("wishes"), "wishes")).toBe(true);
  });
});

describe("orderCategoryOptions", () => {
  const queue = [
    o("promotional"), o("promotional"), o("promotional"),
    o("cinematic"), o("bulk_ads", "cinematic"),
    o("social_media_management"),
  ];

  it("offers what is in the queue, plus the three kinds the team always produces", () => {
    const keys = orderCategoryOptions(queue).map((x) => x.key);
    // Bulk Videos appears as itself — it is a service the sales team sells and a board the tech
    // team works from, so it has to be reachable by name.
    expect(keys).toEqual([
      ALL_ORDER_CATEGORIES, "promotional", "bulk_ads", "cinematic", "social_media_management", "wishes",
    ]);
    // Never the whole catalog: nothing was sold as a website, so it is not offered.
    expect(keys).not.toContain("website");
  });

  it("always offers Wishes, so the filter can be relied on outside festival season", () => {
    const wishes = orderCategoryOptions(queue).find((x) => x.key === "wishes");
    expect(wishes).toEqual({ key: "wishes", label: "Wishes", count: 0 });
  });

  it("counts each service under its own name", () => {
    const byKey = Object.fromEntries(orderCategoryOptions(queue).map((x) => [x.key, x.count]));
    expect(byKey[ALL_ORDER_CATEGORIES]).toBe(6);
    expect(byKey.promotional).toBe(3);
    // The bulk cinematic order counts as Bulk Videos, not as a second cinematic ad.
    expect(byKey.cinematic).toBe(1);
    expect(byKey.bulk_ads).toBe(1);
    expect(byKey.social_media_management).toBe(1);
  });

  it("still adds up to the total, whatever is in the queue", () => {
    // The counts on the options must reconcile with "All services", or the dropdown is lying.
    const options = orderCategoryOptions(queue);
    const all = options.find((x) => x.key === ALL_ORDER_CATEGORIES)!.count;
    const rest = options.filter((x) => x.key !== ALL_ORDER_CATEGORIES).reduce((s, x) => s + x.count, 0);
    expect(rest).toBe(all);
  });

  it("puts the busiest kind first — the filter is for reaching the big pile", () => {
    expect(orderCategoryOptions(queue)[1].key).toBe("promotional");
  });

  it("keeps the selected kind listed even when this tab has none of it", () => {
    // Switching to a tab with no cinematic work must leave the filter visible and reading (0),
    // not silently drop it and show a list the user did not ask for.
    const options = orderCategoryOptions([o("promotional")], "cinematic");
    const cinematic = options.find((x) => x.key === "cinematic");
    expect(cinematic).toBeDefined();
    expect(cinematic!.count).toBe(0);
  });

  it("survives an empty queue, still offering the three video kinds", () => {
    expect(orderCategoryOptions([])).toEqual([
      { key: ALL_ORDER_CATEGORIES, label: "All services", count: 0 },
      { key: "cinematic", label: "Cinematic Ad", count: 0 },
      { key: "promotional", label: "Promotional Ad", count: 0 },
      { key: "wishes", label: "Wishes", count: 0 },
    ]);
  });

  it("labels an option with its count", () => {
    expect(orderCategoryOptionLabel({ key: "cinematic", label: "Cinematic Ad", count: 7 }))
      .toBe("Cinematic Ad (7)");
  });
});
