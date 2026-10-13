import { describe, it, expect } from "vitest";
import { posterConceptAsText } from "@/utils/posterConcepts";
import { POSTER_STYLES, FESTIVAL_REFERENCES, getPosterStyle, posterStyleOptions, AUTO_POSTER_STYLE } from "@/services/posterStyles";
import { POSTER_AD_TYPES } from "@/utils/posterAdType";

/**
 * Poster Creation's style library and the copied text of a poster.
 *
 * Since 2026-10-12 a run makes ONE prompt in ONE of the eight ad types, chosen and assembled by
 * utils/posterAdType (tested in posterAdTypeOct12.test.ts). The library still names the styles the picker
 * offers and a job stores, so its ids must stay the ad types' ids; a generation saved before then holds old
 * concepts, which still copy as they did.
 */

const concept = (over: Record<string, unknown> = {}) => ({
  title: "Crowned by the lamp",
  style: "shadow_metaphor",
  idea: "A diya from the shop casts Lord Rama's silhouette",
  whyItWorks: "The shop's own lamp carries the festival",
  headline: "Happy Dasara",
  subline: "Light from our home to yours",
  imagePrompt: "Create a 4:5 portrait poster, exactly 1080 × 1350 pixels. A brass diya on a dark wall...",
  negativePrompt: "no clutter, no extra text",
  ...over,
});

describe("the style library", () => {
  it("carries the eight families from the team's boards, each with its mechanism and references", () => {
    expect(POSTER_STYLES.map((s) => s.id)).toEqual([
      "animal_metaphor", "shape_concept", "product_benefit", "contrast_concept",
      "proportion_concept", "visual_exaggeration", "shadow_metaphor", "material_metaphor",
    ]);
    for (const s of POSTER_STYLES) {
      expect(s.mechanism.length).toBeGreaterThan(80);
      expect(s.recipe.length).toBeGreaterThanOrEqual(4);
      expect(s.references.length).toBeGreaterThanOrEqual(5);
      expect(s.festivalFusion.length).toBeGreaterThan(60);
    }
  });

  it("offers best fit first, then every style", () => {
    const options = posterStyleOptions();
    expect(options[0].id).toBe(AUTO_POSTER_STYLE);
    expect(options).toHaveLength(POSTER_STYLES.length + 1);
    expect(getPosterStyle("auto")).toBeNull();
    expect(getPosterStyle("nope")).toBeNull();
  });

  it("carries the three festival fusion patterns from the team's own posters", () => {
    expect(FESTIVAL_REFERENCES).toHaveLength(3);
    expect(FESTIVAL_REFERENCES.map((r) => r.pattern).join(" ")).toMatch(/CONSTRUCTED FROM THE TRADE.*AS YOUR CUSTOMER.*IN SHADOW/);
  });

  it("never carries a real client's phone number into every prompt", () => {
    const everything = JSON.stringify({ POSTER_STYLES, FESTIVAL_REFERENCES });
    expect(everything).not.toMatch(/\d{10}/);
  });
});

describe("the style library and the eight ad types", () => {
  it("offers exactly the eight ad types, under the same ids a job stores", () => {
    expect([...POSTER_STYLES.map((s) => s.id)].sort()).toEqual([...POSTER_AD_TYPES.map((t) => t.id)].sort());
  });

  it("says Best fit picks ONE style", () => {
    expect(posterStyleOptions()[0].short).toMatch(/\bONE\b/);
  });
});

describe("copying a poster as text", () => {
  it("copies an older concept as it always did", () => {
    const t = posterConceptAsText(concept(), 0);
    expect(t.startsWith("Concept 1: Crowned by the lamp")).toBe(true);
    expect(t).toContain("Headline: Happy Dasara");
    expect(t).toContain("Avoid: no clutter");
  });

  it("copies a 2026-10-12 poster as its ad type, why, and the prompt", () => {
    const t = posterConceptAsText({
      ...concept(), headline: "", subline: "", negativePrompt: undefined,
      adTypeName: "Shadow Metaphor Ads", reason: "The lamp's shadow carries the festival.",
      imagePrompt: "Create a minimalist and creative ad in Shadow Metaphor Ads. Business Information: Sri Lakshmi Silks. Create one strong visual concept/metaphor that communicates the main product/service benefit.\n\nFormat: 9:16 vertical poster. Use the attached logo exactly as given. Words on the poster in English.",
    }, 0);
    expect(t).toBe("Ad type: Shadow Metaphor Ads\nWhy: The lamp's shadow carries the festival.\n\nCreate a minimalist and creative ad in Shadow Metaphor Ads. Business Information: Sri Lakshmi Silks. Create one strong visual concept/metaphor that communicates the main product/service benefit.\n\nFormat: 9:16 vertical poster. Use the attached logo exactly as given. Words on the poster in English.");
  });
});
