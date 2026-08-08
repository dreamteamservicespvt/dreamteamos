import { describe, it, expect } from "vitest";
import { productionCategory, customSaleLabel, CUSTOM_BASE_CATEGORIES } from "@/utils/serviceCatalog";
import { clipsForSeconds, durationFromSeconds, getClipCount, hasPoster, priceForClips } from "@/utils/assignmentDuration";
import { durationForSale, assignmentFormFromOrder } from "@/utils/adRequirement";
import type { Order } from "@/types";

/**
 * A two-minute promotional ad — the sale the price list has no row for.
 *
 * Before this, it went through as category "custom" with "2 minutes add, Telugu language" typed
 * into a note, and the tech team received an order with no duration, no clip count, no per-clip
 * price and no deadline. Somebody read the note and re-entered all of it by hand, which is where
 * a 2-minute sale quietly becomes a 1-minute build.
 *
 * What these pin is that naming the base service and the length is enough for every existing rule
 * — clips, poster, price, the assignment form — to work on it unchanged.
 */

describe("what a custom sale really is", () => {
  it("resolves to the service it is a longer version of", () => {
    expect(productionCategory({ category: "custom", customBaseCategory: "promotional" })).toBe("promotional");
    expect(productionCategory({ category: "custom", customBaseCategory: "cinematic" })).toBe("cinematic");
  });

  it("stays custom when no base was named, exactly as it behaved before", () => {
    expect(productionCategory({ category: "custom" })).toBe("custom");
    expect(productionCategory({ category: "custom", customBaseCategory: "  " })).toBe("custom");
  });

  it("ignores a base that is not a real service", () => {
    expect(productionCategory({ category: "custom", customBaseCategory: "nonsense" })).toBe("custom");
  });

  it("still resolves a bulk order to its video kind", () => {
    // One function now answers "what is this really", for both of the sales-side conveniences.
    expect(productionCategory({ category: "bulk_ads", bulkAdType: "cinematic" })).toBe("cinematic");
    expect(productionCategory({ category: "promotional" })).toBe("promotional");
  });

  it("offers only the services that have a length to vary", () => {
    // "Custom → Logo Design, 2 minutes" would be nonsense.
    expect(CUSTOM_BASE_CATEGORIES).toEqual(["promotional", "cinematic", "wishes"]);
  });

  it("says what it is on a card, length included", () => {
    expect(customSaleLabel({ category: "custom", customBaseCategory: "promotional", customDurationSeconds: 120 }))
      .toBe("Custom — Promotional Ad · 2:00");
    expect(customSaleLabel({ category: "custom" })).toBe("Custom");
  });
});

describe("turning a typed length into work", () => {
  it("counts 2 minutes as fifteen 8-second clips", () => {
    expect(clipsForSeconds(120)).toBe(15);
    expect(durationFromSeconds(120)).toBe("120s");
  });

  it("rounds up, so a client who bought a length gets it", () => {
    // 100s is 12.5 clips. Rounding down would deliver 96s — the company short-changing somebody
    // by four seconds to save one clip.
    expect(clipsForSeconds(100)).toBe(13);
    expect(durationFromSeconds(100)).toBe("104s");
  });

  it("never produces a zero-clip video", () => {
    expect(clipsForSeconds(0)).toBe(1);
    expect(clipsForSeconds(-5)).toBe(1);
    expect(clipsForSeconds(3)).toBe(1);
  });

  it("keeps the standard packages exactly as they were", () => {
    expect(durationFromSeconds(16)).toBe("16s");
    expect(durationFromSeconds(64)).toBe("64s");
  });
});

describe("what the tech team receives", () => {
  it("prices a 2-minute promotional ad off the per-clip rate", () => {
    // 16s = 2 clips = ₹499, so ₹249.50/clip; 15 clips ≈ ₹3,743.
    expect(priceForClips("promotional", clipsForSeconds(120))).toBe(3743);
  });

  it("prices the same length as cinematic when that is what was sold", () => {
    expect(priceForClips("cinematic", clipsForSeconds(120))).toBe(7493);
  });

  it("ships a poster, because anything past four clips does", () => {
    expect(hasPoster(durationFromSeconds(120))).toBe(true);
    expect(getClipCount(durationFromSeconds(120))).toBe(15);
  });

  it("hands the assignment form a real category, duration and price", () => {
    const order = {
      category: "custom",
      customBaseCategory: "promotional",
      customDurationSeconds: 120,
      packageKey: "custom",
      amount: 4000,
      requirement: { businessName: "Ahmed Tech", language: "Telugu" },
    } as unknown as Order;

    const form = assignmentFormFromOrder(order, ["Telugu", "Hindi"]);
    expect(form.category).toBe("promotional");
    expect(form.duration).toBe("120s");
    expect(form.pricePerUnit).toBe(3743);
    expect(form.businessName).toBe("Ahmed Tech");
  });

  it("leaves an ordinary sale's duration coming from its package, as before", () => {
    expect(durationForSale("promotional", "30 Seconds + Poster")).toBe("32s");
    expect(durationForSale("promotional", "30 Seconds + Poster", 999, null)).toBe("32s");
  });

  it("lets the typed length win over the package lookup, because there is no package", () => {
    expect(durationForSale("promotional", "custom", 4000, 120)).toBe("120s");
  });
});

/**
 * Picking the length as a time instead of as clips.
 *
 * Clips are the stored unit — they are what gets built and what gets priced — but a client on the
 * phone asks for "one and a half minutes", and a member should never have to divide by eight.
 * What matters is that the conversion is shown rather than applied silently: 45 seconds is not a
 * whole number of 8-second clips, and a member who quotes 45 while the company builds 48 has been
 * let down by the form.
 */
describe("entering a length as minutes and seconds", () => {
  const clipsFromMinSec = (min: number, sec: number) => clipsForSeconds(min * 60 + sec);

  it("converts the times the team actually sells", () => {
    expect(clipsFromMinSec(0, 32)).toBe(4);
    expect(clipsFromMinSec(1, 4)).toBe(8);
    expect(clipsFromMinSec(2, 0)).toBe(15);
  });

  it("rounds UP, so a client is never short-changed to save a clip", () => {
    // 45s is 5.6 clips. Rounding down would deliver 40 seconds against a 45-second promise.
    expect(clipsFromMinSec(0, 45)).toBe(6);
    expect(clipsFromMinSec(1, 30)).toBe(12);
  });

  it("is detectable when it rounded, so the member can be told before they quote", () => {
    const typed = 45;
    const built = clipsForSeconds(typed) * 8;
    expect(built).toBe(48);
    expect(built === typed).toBe(false);
    // …and not flagged when the time is already a whole number of clips.
    expect(clipsForSeconds(64) * 8).toBe(64);
  });

  it("never produces a zero-clip ad from a stray keystroke", () => {
    expect(clipsFromMinSec(0, 1)).toBe(1);
  });

  it("prices off the converted clip count, not the typed seconds", () => {
    expect(priceForClips("promotional", clipsFromMinSec(0, 45)))
      .toBe(priceForClips("promotional", 6));
  });
});
