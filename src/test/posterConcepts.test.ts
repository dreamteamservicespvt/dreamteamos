import { describe, it, expect } from "vitest";
import {
  enforceCanvas, finalizePosterConcepts, normalizePosterConcept, parsePosterConcepts, posterConceptAsText,
  stripInventedNumbers,
} from "@/utils/posterConcepts";
import {
  POSTER_CONCEPT_REFINE_SYSTEM_PROMPT, POSTER_CONCEPT_SYSTEM_PROMPT, POSTER_CONCEPT_USER_PROMPT,
} from "@/services/prompts/posterConcept";
import { POSTER_STYLES, FESTIVAL_REFERENCES, getPosterStyle, posterStyleOptions, AUTO_POSTER_STYLE } from "@/services/posterStyles";

/**
 * Poster Creation, from the style library to the concepts a member copies.
 *
 * The library is what the model is "trained" on, so its shape is pinned; the prompt is pinned to
 * carry the chosen style, the canvas and the truth rules; and the reply is pinned to be read in
 * whatever shape the model returns and cleaned of anything the client never said.
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

describe("POSTER_CONCEPT_SYSTEM_PROMPT", () => {
  const style = getPosterStyle("shadow_metaphor");

  it("states the canvas and the chosen style's mechanism and references", () => {
    const p = POSTER_CONCEPT_SYSTEM_PROMPT({ posterSize: "4:5", style, conceptCount: 3, hasLogo: true });
    expect(p).toContain("a 4:5 portrait (taller than wide) poster, exactly 1080 × 1350 pixels");
    expect(p).toContain("SHADOW METAPHOR");
    expect(p).toContain(style!.mechanism);
    expect(p).toContain("POTENTIAL in every bottle");
    expect(p).toContain('"the attached logo"');
    expect(p).toMatch(/Return exactly 3 concepts/);
    // A chosen style is not diluted with the whole library.
    expect(p).not.toContain("THE STYLE LIBRARY");
  });

  it("gives the whole library for best fit", () => {
    const p = POSTER_CONCEPT_SYSTEM_PROMPT({ posterSize: "1:1", style: null, conceptCount: 2, hasLogo: false, nameBoardText: "UDAAN" });
    expect(p).toContain("THE STYLE LIBRARY");
    for (const s of POSTER_STYLES) expect(p).toContain(s.id);
    expect(p).toContain('"UDAAN"');
    expect(p).not.toContain("attached to the image generator");
  });

  it("fuses an occasion only when there is one", () => {
    const withFestival = POSTER_CONCEPT_SYSTEM_PROMPT({ posterSize: "4:5", style, occasion: "Vinayaka Chavithi", conceptCount: 3, hasLogo: true });
    expect(withFestival).toContain("THE OCCASION: VINAYAKA CHAVITHI");
    expect(withFestival).toContain("CONSTRUCTED FROM THE TRADE");
    expect(withFestival).toContain(style!.festivalFusion);
    expect(withFestival).toMatch(/respectful/i);

    const plain = POSTER_CONCEPT_SYSTEM_PROMPT({ posterSize: "4:5", style, conceptCount: 3, hasLogo: true });
    expect(plain).toContain("NO OCCASION");
    expect(plain).not.toContain("THE OCCASION:");
  });

  it("keeps the truth rules and asks for short non-English text", () => {
    const p = POSTER_CONCEPT_SYSTEM_PROMPT({ posterSize: "9:16", style, conceptCount: 1, hasLogo: true, textLanguage: "Telugu" });
    // Every verified number, one to three, laid out for its count — never a two-number cap.
    expect(p).toMatch(/EVERY phone number listed in REAL CONTACT DETAILS below — one, two or three/);
    expect(p).toMatch(/A field that was not given does not exist/);
    expect(p).toMatch(/Never invent offers/);
    expect(p).toContain("Poster text language: Telugu");
    expect(p).toMatch(/Telugu script/);
    expect(p).toMatch(/Return exactly 1 concept\b/);
  });

  it("the user turn lists only the real details", () => {
    const u = POSTER_CONCEPT_USER_PROMPT({
      businessInfo: { name: "Udaan" }, businessName: "Udaan Events", contacts: ["9000000001", "9000000002", "9000000003", "9000000004"],
      address: "", clientBrief: "Mention 10 years of events", occasion: "Engineers' Day", conceptCount: 3,
    });
    expect(u).toContain("9000000001 , 9000000002 , 9000000003 (exactly 3)");
    expect(u).not.toContain("9000000004");
    expect(u).toContain("NONE — print no address");
    expect(u).toContain("Mention 10 years of events");

    const none = POSTER_CONCEPT_USER_PROMPT({ businessInfo: {}, businessName: "", contacts: [], address: "", conceptCount: 1 });
    expect(none).toContain("NONE — print no phone number");
  });

  it("the refine prompt holds the canvas and style", () => {
    const r = POSTER_CONCEPT_REFINE_SYSTEM_PROMPT({ posterSize: "3:4", style, hasLogo: true });
    expect(r).toContain("exactly 1080 × 1440 pixels");
    expect(r).toContain("Shadow metaphor");
  });
});

describe("reading the reply", () => {
  it("reads {concepts:[…]}, a bare array, a single object, and fenced JSON", () => {
    expect(parsePosterConcepts(JSON.stringify({ concepts: [concept(), concept({ title: "Two" })] }))).toHaveLength(2);
    expect(parsePosterConcepts(JSON.stringify([concept()]))).toHaveLength(1);
    expect(parsePosterConcepts(JSON.stringify(concept()))).toHaveLength(1);
    expect(parsePosterConcepts("```json\n" + JSON.stringify({ concepts: [concept()] }) + "\n```")).toHaveLength(1);
    expect(parsePosterConcepts("Here you go: " + JSON.stringify({ concepts: [concept()] }) + " Enjoy!")).toHaveLength(1);
    expect(parsePosterConcepts("not json at all")).toEqual([]);
  });

  it("drops a concept with no prompt, and records an unknown style as the requested one", () => {
    expect(normalizePosterConcept({ title: "x" })).toBeNull();
    expect(normalizePosterConcept(concept({ style: "made_up" }), "shape_concept")?.style).toBe("shape_concept");
    expect(normalizePosterConcept({ prompt: "use this" })?.imagePrompt).toBe("use this");
  });

  it("puts the canvas back when a prompt forgot it", () => {
    expect(enforceCanvas("A lion on a sofa.", "4:5")).toBe("Create a 4:5 portrait (taller than wide) poster, exactly 1080 × 1350 pixels. A lion on a sofa.");
    const stated = "Create a 4:5 poster of a lion.";
    expect(enforceCanvas(stated, "4:5")).toBe(stated);
    expect(enforceCanvas("A 1080×1350 layout of a lion.", "1080x1350")).toBe("A 1080×1350 layout of a lion.");
  });

  it("removes any phone number the business never gave, and nothing else", () => {
    const text = "Call +91 91603 45678 or 9876543210. Plot 14-285, PIN 533001, since 2008, 1080 × 1350.";
    const out = stripInventedNumbers(text, ["9160345678"]);
    expect(out).toContain("+91 91603 45678");
    expect(out).not.toContain("9876543210");
    expect(out).toContain("14-285");
    expect(out).toContain("533001");
    expect(out).toContain("2008");
    expect(out).toContain("1080 × 1350");
  });

  it("finalises: canvas stated, numbers cleaned, count capped", () => {
    const out = finalizePosterConcepts(
      [concept({ imagePrompt: "Contact strip: 9999988888." }), concept(), concept()],
      { posterSize: "1:1", contacts: [], maxCount: 2 },
    );
    expect(out).toHaveLength(2);
    expect(out[0].imagePrompt.startsWith("Create a 1:1 square poster")).toBe(true);
    expect(out[0].imagePrompt).not.toContain("9999988888");
  });

  it("copies a concept as readable text", () => {
    const t = posterConceptAsText(concept(), 0);
    expect(t.startsWith("Concept 1: Crowned by the lamp")).toBe(true);
    expect(t).toContain("Headline: Happy Dasara");
    expect(t).toContain("Avoid: no clutter");
  });
});
