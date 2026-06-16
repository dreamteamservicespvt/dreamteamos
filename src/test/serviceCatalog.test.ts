import { describe, it, expect } from "vitest";
import {
  SALE_CATEGORIES, PACKAGES, categoryLabel, isAdCategory, categoryBilling, gapCategories, GAP_ELIGIBLE_CATEGORIES,
} from "@/utils/serviceCatalog";

describe("service catalog integrity", () => {
  it("includes the newly added categories", () => {
    for (const k of ["social_media_management", "visiting_card", "poster", "google_listing", "website"]) {
      expect(SALE_CATEGORIES).toContain(k);
    }
  });

  it("PACKAGES has a key for every category", () => {
    for (const k of SALE_CATEGORIES) expect(PACKAGES[k]).toBeDefined();
  });

  it("logo, GBP and visiting card each have 3 tiers", () => {
    expect(PACKAGES["logo"].map((p) => p.amount)).toEqual([499, 999, 1499]);
    expect(PACKAGES["google_listing"].map((p) => p.amount)).toEqual([499, 999, 1499]);
    expect(PACKAGES["visiting_card"].map((p) => p.amount)).toEqual([499, 999, 1499]);
  });

  it("promotional and cinematic match the price sheet", () => {
    expect(PACKAGES["promotional"].map((p) => p.amount)).toEqual([499, 999, 1499, 1999]);
    expect(PACKAGES["cinematic"].map((p) => p.amount)).toEqual([999, 1999, 2999, 3999]);
  });

  it("monthly packages are present and priced", () => {
    expect(PACKAGES["social_media_management"].map((p) => p.amount)).toEqual([10000, 15000, 20000, 30000]);
  });
});

describe("category helpers", () => {
  it("isAdCategory only for video ad categories", () => {
    expect(isAdCategory("promotional")).toBe(true);
    expect(isAdCategory("cinematic")).toBe(true);
    expect(isAdCategory("wishes")).toBe(true);
    expect(isAdCategory("website")).toBe(false);
    expect(isAdCategory("logo")).toBe(false);
    expect(isAdCategory("social_media_management")).toBe(false);
  });

  it("categoryBilling flags monthly packages", () => {
    expect(categoryBilling("social_media_management")).toBe("monthly");
    expect(categoryBilling("website")).toBe("one_time");
    expect(categoryBilling("promotional")).toBe("one_time");
  });

  it("categoryLabel maps google_listing to the friendly name", () => {
    expect(categoryLabel("google_listing")).toBe("Google Business Profile");
    expect(categoryLabel("website")).toBe("Website Development");
  });
});

describe("gapCategories (upsell)", () => {
  it("returns all gap-eligible services when nothing is owned", () => {
    expect(gapCategories([]).map((c) => c.key)).toEqual(GAP_ELIGIBLE_CATEGORIES);
  });

  it("removes owned services", () => {
    expect(gapCategories(["website", "logo"]).map((c) => c.key)).toEqual(["google_listing", "visiting_card", "social_media_management"]);
  });

  it("ignores ownership of non-gap (repeatable) services like ads", () => {
    expect(gapCategories(["promotional", "cinematic"]).map((c) => c.key)).toEqual(GAP_ELIGIBLE_CATEGORIES);
  });
});
