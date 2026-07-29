import { describe, it, expect } from "vitest";
import {
  SALE_CATEGORIES, PACKAGES, categoryLabel, isAdCategory, categoryBilling, gapCategories, GAP_ELIGIBLE_CATEGORIES,
  isBulkCategory, needsDescription, packageOptionLabel,
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
    expect(PACKAGES["social_media_management"].map((p) => p.amount)).toEqual([10000, 15000, 20000, 25000, 30000]);
  });

  it("every social media package carries its monthly quota", () => {
    // The quota IS the definition of "delivered" for a month — a package without one would leave
    // the tech side with nothing to count down.
    const quotas = PACKAGES["social_media_management"].map((p) => p.deliverables?.ads);
    expect(quotas).toEqual([4, 6, 8, 10, 12]);
    for (const p of PACKAGES["social_media_management"]) {
      const d = p.deliverables!;
      expect([d.posters, d.posted, d.campaigns]).toEqual([d.ads, d.ads, d.ads]);
    }
  });

  it("bulk ads only offers promotional packages of ₹999 and above", () => {
    expect(PACKAGES["bulk_ads"].map((p) => p.amount)).toEqual([999, 1499, 1999]);
    expect(isBulkCategory("bulk_ads")).toBe(true);
    expect(isBulkCategory("promotional")).toBe(false);
  });

  it("needsDescription only where there is no package list to say what was sold", () => {
    expect(needsDescription("custom")).toBe(true);
    expect(needsDescription("software")).toBe(true);
    expect(needsDescription("promotional")).toBe(false);
    for (const k of SALE_CATEGORIES) {
      if (needsDescription(k)) expect(PACKAGES[k]).toEqual([]);
    }
  });

  it("packageOptionLabel quotes the price and, for a month, the quota", () => {
    expect(packageOptionLabel({ label: "Basic", amount: 99 })).toBe("Basic — ₹99");
    expect(packageOptionLabel(PACKAGES["social_media_management"][2]))
      .toBe("Pro Package — ₹20,000 (8 ads · 8 posters · 8 posted · 8 run)");
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
