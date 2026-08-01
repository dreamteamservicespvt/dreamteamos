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

  it("counts a bulk order as the kind of video it is made of", () => {
    // Someone filtering for Cinematic to plan the week's shoots needs the bulk cinematic job in
    // the list; a separate "Bulk" bucket would hide it from exactly the person looking for it.
    expect(orderCategoryKey(o("bulk_ads", "cinematic"))).toBe("cinematic");
    expect(orderCategoryKey(o("bulk_ads", "wishes"))).toBe("wishes");
    // A bulk order sold before the kind was captured was promotional.
    expect(orderCategoryKey(o("bulk_ads"))).toBe("promotional");
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

  it("matches a bulk order under the kind it is made of", () => {
    expect(matchesOrderCategory(o("bulk_ads", "cinematic"), "cinematic")).toBe(true);
    expect(matchesOrderCategory(o("bulk_ads", "cinematic"), "promotional")).toBe(false);
  });
});

describe("orderCategoryOptions", () => {
  const queue = [
    o("promotional"), o("promotional"), o("promotional"),
    o("cinematic"), o("bulk_ads", "cinematic"),
    o("social_media_management"),
  ];

  it("offers only what is actually in the queue", () => {
    const keys = orderCategoryOptions(queue).map((x) => x.key);
    expect(keys).toEqual([ALL_ORDER_CATEGORIES, "promotional", "cinematic", "social_media_management"]);
    // Never a fixed catalog: nothing was sold as a website, so it is not offered.
    expect(keys).not.toContain("website");
  });

  it("counts each kind, with bulk folded into its own", () => {
    const byKey = Object.fromEntries(orderCategoryOptions(queue).map((x) => [x.key, x.count]));
    expect(byKey[ALL_ORDER_CATEGORIES]).toBe(6);
    expect(byKey.promotional).toBe(3);
    expect(byKey.cinematic).toBe(2); // one single + one bulk
    expect(byKey.social_media_management).toBe(1);
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

  it("survives an empty queue", () => {
    expect(orderCategoryOptions([])).toEqual([
      { key: ALL_ORDER_CATEGORIES, label: "All services", count: 0 },
    ]);
  });

  it("labels an option with its count", () => {
    expect(orderCategoryOptionLabel({ key: "cinematic", label: "Cinematic Ad", count: 7 }))
      .toBe("Cinematic Ad (7)");
  });
});
