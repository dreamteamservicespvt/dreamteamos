import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  POSTER_AD_TYPES, POSTER_PROMPT_CLOSE, POSTER_PROMPT_LEAD, assembleConceptPoster, cleanPosterSummary, conceptFromPoster,
  conceptPosterPrompt, fallbackPosterAdType, fallbackPosterSummary, instructionAsksForTypeChange, isConceptPosterPrompt,
  parsePosterAnalysis, posterBusinessInformation, posterFormatLine, posterPromptProblems, readConceptPosterPrompt,
  refineAnalysis, resolvePosterAdTypeId,
} from "@/utils/posterAdType";
import { POSTER_STYLES } from "@/services/posterStyles";
import { POSTER_ANALYSIS_SYSTEM_PROMPT, POSTER_REFINE_ANALYSIS_SYSTEM_PROMPT } from "@/services/prompts/posterConcept";

/**
 * The poster prompt, rebuilt on the owner's brief (2026-10-12): analyse the business, choose ONE of eight
 * conceptual ad types (never at random, never two), and write "a very short, clean, creative prompt in this
 * exact structure": "Create a minimalist and creative ad in [SELECTED AD TYPE]. Business Information:
 * [RELEVANT BUSINESS INFORMATION]. Create one strong visual concept/metaphor that communicates the main
 * product/service benefit." — plus one Format line (size · logo · text language), 9:16 by default.
 *
 * Pinned here: the eight names and the exact structure for each; the Format line; the business information
 * (the model's numbers out, the verified ones in); the deterministic fallback; and Poster Creation, the video
 * kit's poster row and both refines, end to end on a fake Gemini.
 */

const OWNER_NAMES = [
  "Material-based Metaphor Ads", "Shadow Metaphor Ads", "Contrast-based Conceptual Ads", "Proportion-based Conceptual Ads",
  "Visual Exaggeration Ads", "Product Benefit Conceptual Ads", "Shape-based Conceptual Ads", "Animal-based Visual Metaphor Ads",
];
const FORMAT_LOGO = "9:16 vertical poster. Use the attached logo exactly as given. Words on the poster in English.";
/** A whole prompt's Format line also counts the verified numbers — the fake profile below has one (2026-10-13). */
const FORMAT_LOGO_ONE_NUMBER = `${FORMAT_LOGO} Print only the one contact number given above, once, digit for digit.`;
/** The video kit's poster below is given the extraction's profile, which carries no verified number. */
const FORMAT_LOGO_NO_NUMBER = `${FORMAT_LOGO} No phone number on the poster.`;

describe("the eight ad types", () => {
  it("are the owner's eight, by name, in the owner's order — under the ids a job already stores", () => {
    expect(POSTER_AD_TYPES.map((t) => t.name)).toEqual(OWNER_NAMES);
    expect(POSTER_AD_TYPES.map((t) => t.id)).toEqual([
      "material_metaphor", "shadow_metaphor", "contrast_concept", "proportion_concept",
      "visual_exaggeration", "product_benefit", "shape_concept", "animal_metaphor",
    ]);
    expect(new Set(POSTER_STYLES.map((s) => s.id))).toEqual(new Set(POSTER_AD_TYPES.map((t) => t.id)));
  });

  it("each makes a prompt in exactly the owner's structure, naming exactly one type", () => {
    for (const type of POSTER_AD_TYPES) {
      const prompt = conceptPosterPrompt({ adTypeName: type.name, businessInformation: "Sai Mobiles — smartphones and accessories in Kakinada", format: FORMAT_LOGO });
      expect(prompt).toBe(`Create a minimalist and creative ad in ${type.name}. Business Information: Sai Mobiles — smartphones and accessories in Kakinada. Create one strong visual concept/metaphor that communicates the main product/service benefit.\n\nFormat: ${FORMAT_LOGO}`);
      expect(posterPromptProblems(prompt)).toEqual([]);
      expect(readConceptPosterPrompt(prompt)).toMatchObject({ adTypeId: type.id, adTypeName: type.name, format: FORMAT_LOGO });
    }
    expect(POSTER_PROMPT_LEAD).toBe("Create a minimalist and creative ad in");
    expect(POSTER_PROMPT_CLOSE).toBe("Create one strong visual concept/metaphor that communicates the main product/service benefit.");
  });

  it("refuses a prompt with two types, no type, a double full stop or a long art-directed body", () => {
    const two = `Create a minimalist and creative ad in Shadow Metaphor Ads. Business Information: Sai Mobiles, also Animal-based Visual Metaphor Ads. ${POSTER_PROMPT_CLOSE}\n\nFormat: ${FORMAT_LOGO}`;
    expect(posterPromptProblems(two).join(" ")).toMatch(/names 2 ad types/);
    expect(isConceptPosterPrompt("Create a premium 9:16 vertical poster with a smiling model...")).toBe(false);
    const long = conceptPosterPrompt({ adTypeName: OWNER_NAMES[0], businessInformation: Array(210).fill("word").join(" "), format: FORMAT_LOGO });
    expect(posterPromptProblems(long).join(" ")).toMatch(/words long/);
    // The assembly never writes ".." even when its parts end in full stops.
    expect(conceptPosterPrompt({ adTypeName: "Shadow Metaphor Ads.", businessInformation: "Sai Mobiles.", format: `${FORMAT_LOGO}.` })).not.toMatch(/\.\s*\./);
  });

  it("reads the analysis's type by id, by name or by an unmistakable start — never a guess", () => {
    expect(resolvePosterAdTypeId("shadow_metaphor")).toBe("shadow_metaphor");
    expect(resolvePosterAdTypeId("Shadow Metaphor Ads")).toBe("shadow_metaphor");
    expect(resolvePosterAdTypeId("visual exaggeration")).toBe("visual_exaggeration");
    expect(resolvePosterAdTypeId("Animal-based visual metaphor")).toBe("animal_metaphor");
    expect(resolvePosterAdTypeId("best fit")).toBeNull();
    expect(resolvePosterAdTypeId("ad")).toBeNull();
    expect(resolvePosterAdTypeId(42)).toBeNull();
  });
});

describe("the Format line", () => {
  it("says the size, the logo and the language in one short line — 9:16 by default", () => {
    expect(posterFormatLine({ hasLogo: true })).toBe(FORMAT_LOGO);
    expect(posterFormatLine({ posterSize: "1:1", hasLogo: true, textLanguage: "Telugu" }))
      .toBe("1:1 square poster. Use the attached logo exactly as given. Words on the poster in Telugu.");
    expect(posterFormatLine({ posterSize: "1080x1920", hasLogo: true })).toBe("9:16 vertical poster, 1080 × 1920 pixels. Use the attached logo exactly as given. Words on the poster in English.");
  });

  it("without a logo, sets the business name as the wordmark and never mentions a logo", () => {
    const line = posterFormatLine({ posterSize: "9:16", hasLogo: false, nameBoardText: "Sri Lakshmi Silks." });
    expect(line).toBe('9:16 vertical poster. Show the business name "Sri Lakshmi Silks" as a clean wordmark, exactly as spelled. Words on the poster in English.');
    expect(line).not.toMatch(/logo/i);
  });
});

describe("the business information", () => {
  it("takes out every number, labelled contact, email, website and ad-type name the model wrote", () => {
    const clean = cleanPosterSummary("Sai Mobiles, Kakinada — smartphones. Call us: 98765 43210. Email: sai@x.com, www.sai.in. In a Shadow Metaphor Ads style, fast service");
    expect(clean).not.toMatch(/98765|sai@|www\.|Shadow/);
    expect(clean).toMatch(/Sai Mobiles, Kakinada — smartphones/);
    expect(clean).toMatch(/fast service$/);
  });

  it("adds the VERIFIED contacts (one to three, as given) and the address, by code — and nothing that is missing", () => {
    const info = posterBusinessInformation({
      summary: "Smartphones and accessories with same-day repair. Contact: 90000 11111",
      businessName: "Sai Mobiles",
      phones: [{ display: "+91 91603 45678", whatsapp: true }, { display: "0884 2345678" }, { display: "9000000003" }, { display: "9000000004" }],
      address: "Main Road, Kakinada.",
    });
    expect(info).toBe("Sai Mobiles — Smartphones and accessories with same-day repair. Contact: +91 91603 45678 (WhatsApp), 0884 2345678, 9000000003. Address: Main Road, Kakinada");
    const bare = posterBusinessInformation({ summary: "Sai Mobiles sells smartphones", businessName: "Sai Mobiles" });
    expect(bare).toBe("Sai Mobiles sells smartphones");
  });

  it("keeps the occasion when the model left it out", () => {
    const info = posterBusinessInformation({ summary: "Sri Lakshmi Silks — pattu sarees", businessName: "Sri Lakshmi Silks", occasion: "Diwali" });
    expect(info).toBe("Sri Lakshmi Silks — pattu sarees. Occasion: Diwali");
  });

  it("caps the model's summary at 60 words", () => {
    const words = cleanPosterSummary(Array(90).fill("silk").join(" ")).split(/\s+/);
    expect(words.length).toBeLessThanOrEqual(60);
  });
});

describe("when the analysis does not answer", () => {
  it("chooses the type by a fixed rubric over what the business is — same input, same type", () => {
    const jeweller = { businessName: "Lakshmi Jewellers", businessType: "gold and diamond jewellery showroom" };
    expect(fallbackPosterAdType({ businessInfo: jeweller }).id).toBe("material_metaphor");
    expect(fallbackPosterAdType({ businessInfo: jeweller }).id).toBe("material_metaphor");
    expect(fallbackPosterAdType({ businessInfo: { businessName: "Udaan Academy", businessType: "coaching institute" } }).id).toBe("shadow_metaphor");
    expect(fallbackPosterAdType({ businessInfo: { businessName: "Sparkle", businessType: "laundry and dry cleaning" } }).id).toBe("contrast_concept");
    expect(fallbackPosterAdType({ businessInfo: { businessName: "Sharma Electronics", businessType: "electronics store" } }).id).toBe("animal_metaphor");
    expect(fallbackPosterAdType({ businessInfo: {} }).id).toBe("product_benefit");
  });

  it("writes the summary from the profile — never more than it says", () => {
    const s = fallbackPosterSummary({ businessInfo: { businessName: "Sai Mobiles", businessType: "mobile store", services: "smartphones, accessories, repairs" } });
    expect(s).toBe("Sai Mobiles, mobile store — smartphones, accessories, repairs");
  });

  it("reads JSON in a fence, around a sentence, by name — and nothing from garbage", () => {
    expect(parsePosterAnalysis('```json\n{"adType":"Shadow Metaphor Ads","reason":"r","benefit":"b","businessInformation":"i"}\n```'))
      .toEqual({ adType: "shadow_metaphor", reason: "r", benefit: "b", businessInformation: "i" });
    expect(parsePosterAnalysis('Here: {"adType":"shape_concept"} done')?.adType).toBe("shape_concept");
    expect(parsePosterAnalysis("{}")).toEqual({ adType: null, reason: "", benefit: "", businessInformation: "" });
    expect(parsePosterAnalysis("no json")).toBeNull();
  });

  it("still makes a valid prompt, saying the app chose the type", () => {
    const poster = assembleConceptPoster({
      analysis: null, businessInfo: { businessName: "Lakshmi Jewellers", businessType: "jewellery showroom" },
      businessName: "Lakshmi Jewellers", hasLogo: true,
    });
    expect(poster).toMatchObject({ adType: "material_metaphor", chosenBy: "rule" });
    expect(isConceptPosterPrompt(poster.prompt)).toBe(true);
    expect(poster.reason).toMatch(/app's rule chose it — the business mentions jewellery/);
  });
});

describe("who decides the type", () => {
  const analysis = { adType: "animal_metaphor", reason: "Strength sells phones.", benefit: "Phones that last", businessInformation: "Sai Mobiles sells smartphones" };

  it("a fixed style is used as it is; Best fit takes the analysis's one choice", () => {
    expect(assembleConceptPoster({ analysis, fixedTypeId: "shape_concept", hasLogo: true, businessName: "Sai Mobiles" }))
      .toMatchObject({ adType: "shape_concept", chosenBy: "fixed" });
    expect(assembleConceptPoster({ analysis, fixedTypeId: "auto", hasLogo: true, businessName: "Sai Mobiles" }))
      .toMatchObject({ adType: "animal_metaphor", chosenBy: "analysis", reason: "Strength sells phones." });
  });

  it("a refine changes the type only when asked, and never a fixed one", () => {
    const other = { ...analysis, adType: "shadow_metaphor" };
    expect(refineAnalysis(other, { instruction: "make the logo bigger", currentTypeId: "animal_metaphor" })?.adType).toBeNull();
    expect(refineAnalysis(other, { instruction: "try a shadow ad instead", currentTypeId: "animal_metaphor" })?.adType).toBe("shadow_metaphor");
    expect(refineAnalysis(other, { instruction: "try a shadow ad instead", currentTypeId: "animal_metaphor", fixedTypeId: "animal_metaphor" })?.adType).toBeNull();
    expect(instructionAsksForTypeChange("use a different style")).toBe(true);
    expect(instructionAsksForTypeChange("add the Diwali offer")).toBe(false);
  });

  it("the analysis prompt lists the eight for Best fit, and only the fixed one when fixed", () => {
    const best = POSTER_ANALYSIS_SYSTEM_PROMPT({ fixedType: null });
    for (const name of OWNER_NAMES) expect(best).toContain(name);
    expect(best).toMatch(/never at random, and exactly one/);
    const fixed = POSTER_ANALYSIS_SYSTEM_PROMPT({ fixedType: POSTER_AD_TYPES[1] });
    expect(fixed).toContain('THE AD STYLE IS FIXED: "Shadow Metaphor Ads"');
    expect(fixed).not.toContain("Animal-based Visual Metaphor Ads");
    expect(POSTER_REFINE_ANALYSIS_SYSTEM_PROMPT({ currentType: POSTER_AD_TYPES[7], fixedType: null }))
      .toMatch(/Change it ONLY when the request asks for a\s+different style/);
  });

  it("the stored concept carries the new fields, and the old ones filled from them", () => {
    const poster = assembleConceptPoster({ analysis, hasLogo: false, businessName: "Sai Mobiles", nameBoardText: "Sai Mobiles" });
    expect(conceptFromPoster(poster)).toMatchObject({
      title: "Animal-based Visual Metaphor Ads", style: "animal_metaphor", idea: "Strength sells phones.", whyItWorks: "Phones that last",
      headline: "", imagePrompt: poster.prompt, adTypeName: "Animal-based Visual Metaphor Ads", chosenBy: "analysis",
    });
    expect(Object.values(conceptFromPoster(poster)).every((v) => v !== undefined)).toBe(true);
  });
});

// ── end to end, on a fake Gemini ───────────────────────────────────────────────────────────────

type Call = { sys: string; user: string; json: boolean; temperature?: number };
const calls: Call[] = [];
let analysisReply = "{}";
let refineReply = "{}";
let extracted: Record<string, unknown> = {};

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (req: any) => {
        const sys = String(req.config?.systemInstruction || "");
        const user = (req.contents?.[0]?.parts || []).map((p: any) => p.text || "").join("\n");
        calls.push({ sys, user, json: req.config?.responseMimeType === "application/json", temperature: req.config?.temperature });
        if (/extract the following business information/i.test(sys)) return { text: JSON.stringify(extracted) };
        if (/senior creative strategist/.test(sys)) return { text: analysisReply };
        if (/The team\s+wants a change/.test(sys)) return { text: refineReply };
        return { text: "{}" };
      },
    };
    constructor(_: any) {}
  },
  Type: {}, Modality: {},
}));

let gemini: typeof import("@/services/geminiService");
beforeAll(async () => {
  vi.stubEnv("VITE_API_KEY_1", "k1");
  for (const level of ["log", "warn", "info", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  gemini = await import("@/services/geminiService");
});
beforeEach(() => {
  calls.length = 0;
  analysisReply = "{}";
  refineReply = "{}";
  extracted = { businessName: "Sai Mobiles", businessType: "mobile phone store", services: "smartphones, accessories" };
});

const logo = () => new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
const files = (withLogo = true): any => ({ logo: withLogo ? logo() : null, visitingCard: [], storeImage: [], productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: [] });
const form = (over: Record<string, unknown> = {}): any => ({
  adType: "commercial", festivalName: "", attireType: "traditional", gender: "female", duration: 16, durationMode: "preset",
  textInstructions: "Sai Mobiles, Main Road, Kakinada. Call 9160345678. Every smartphone brand, same-day screen repair.",
  aspectRatio: "9:16", language: "Telugu", posterStyle: "auto", posterTextLanguage: "English", ...over,
});
const analysisCalls = () => calls.filter((c) => /senior creative strategist/.test(c.sys));

describe("Poster Creation, end to end", () => {
  it("makes ONE prompt in the type the analysis chose, at 9:16, with the verified number", async () => {
    analysisReply = JSON.stringify({
      adType: "animal_metaphor", reason: "A phone as tough as a rhino says it lasts.", benefit: "Phones that last, repaired the same day",
      businessInformation: "Sai Mobiles, Kakinada — every smartphone brand and same-day screen repair. Call 98765 43210.",
    });
    const out = await gemini.generatePosterConcepts(form(), files(), () => {});
    expect(out.posterConcepts).toHaveLength(1);
    const [c] = out.posterConcepts!;
    expect(c).toMatchObject({ style: "animal_metaphor", adTypeName: "Animal-based Visual Metaphor Ads", chosenBy: "analysis" });
    expect(isConceptPosterPrompt(c.imagePrompt)).toBe(true);
    expect(c.imagePrompt).toContain("Create a minimalist and creative ad in Animal-based Visual Metaphor Ads. Business Information: Sai Mobiles, Kakinada — every smartphone brand and same-day screen repair");
    expect(c.imagePrompt).toContain("Contact: 9160345678");
    expect(c.imagePrompt).not.toContain("98765 43210");
    expect(c.imagePrompt.endsWith(`Format: ${FORMAT_LOGO_ONE_NUMBER}`)).toBe(true);
    // One analysis call — JSON, low temperature, never random.
    expect(analysisCalls()).toHaveLength(1);
    expect(analysisCalls()[0]).toMatchObject({ json: true, temperature: 0.2 });
  });

  it("keeps a style the job fixed, whatever the analysis prefers", async () => {
    analysisReply = JSON.stringify({ adType: "animal_metaphor", businessInformation: "Sai Mobiles sells smartphones" });
    const out = await gemini.generatePosterConcepts(form({ posterStyle: "shadow_metaphor", posterSize: "4:5" }), files(), () => {});
    expect(out.posterConcepts![0]).toMatchObject({ style: "shadow_metaphor", chosenBy: "fixed" });
    expect(out.posterConcepts![0].imagePrompt).toContain("Format: 4:5 vertical poster.");
    expect(analysisCalls()[0].sys).toContain('THE AD STYLE IS FIXED: "Shadow Metaphor Ads"');
  });

  it("with no logo, the name is the wordmark — and an empty answer still gives a valid prompt", async () => {
    const out = await gemini.generatePosterConcepts(form({ noLogo: true, logoNameText: "Sai Mobiles" }), files(false), () => {});
    const [c] = out.posterConcepts!;
    expect(c.chosenBy).toBe("rule");
    expect(isConceptPosterPrompt(c.imagePrompt)).toBe(true);
    expect(c.imagePrompt).toContain('Show the business name "Sai Mobiles" as a clean wordmark');
    expect(c.imagePrompt).not.toMatch(/logo/i);
    expect(analysisCalls()).toHaveLength(2); // "{}" twice, then the app's rule
  });

  it("a refine changes only what was asked and keeps the type unless asked", async () => {
    analysisReply = JSON.stringify({ adType: "animal_metaphor", reason: "Tough as a rhino.", businessInformation: "Sai Mobiles sells smartphones" });
    const [first] = (await gemini.generatePosterConcepts(form(), files(), () => {})).posterConcepts!;
    refineReply = JSON.stringify({ adType: "shadow_metaphor", reason: "Shadows.", businessInformation: "Sai Mobiles sells smartphones, with a Diwali exchange offer" });
    const kept = await gemini.refinePosterConcept(first, "add the Diwali exchange offer", form(), extracted, true);
    expect(kept).toMatchObject({ style: "animal_metaphor", chosenBy: "kept", reason: "Tough as a rhino." });
    expect(kept.imagePrompt).toContain("with a Diwali exchange offer");
    const changed = await gemini.refinePosterConcept(first, "make it a shadow ad", form(), extracted, true);
    expect(changed).toMatchObject({ style: "shadow_metaphor", chosenBy: "analysis" });
    refineReply = "not json";
    await expect(gemini.refinePosterConcept(first, "anything", form(), extracted, true)).rejects.toThrow(/unchanged/);
  });
});

describe("the video kit's poster row", () => {
  it("is the same system: one type, the festival as the purpose, always 9:16, plain text", async () => {
    analysisReply = JSON.stringify({ adType: "Shadow Metaphor Ads", reason: "r", businessInformation: "Sai Mobiles — smartphones for every family" });
    const prompt = await gemini.writeVideoPosterPrompt(form({ adType: "festival", festivalName: "Diwali", aspectRatio: "16:9" }), extracted, { hasLogoFile: true });
    expect(isConceptPosterPrompt(prompt)).toBe(true);
    expect(prompt).toContain("in Shadow Metaphor Ads.");
    expect(prompt).toContain("Occasion: Diwali");
    expect(prompt.endsWith(`Format: ${FORMAT_LOGO_NO_NUMBER}`)).toBe(true);
    expect(analysisCalls()[0].user).toContain("A Diwali poster for this business");
  });

  it("without a logo file uses the wordmark, and an unusable answer never loses the row", async () => {
    analysisReply = "garbage";
    const prompt = await gemini.writeVideoPosterPrompt(form(), extracted, { hasLogoFile: false });
    expect(isConceptPosterPrompt(prompt)).toBe(true);
    expect(prompt).not.toMatch(/logo/i);
  });

  it("its refine goes through the analysis, keeps the type and the logo choice", async () => {
    analysisReply = JSON.stringify({ adType: "animal_metaphor", businessInformation: "Sai Mobiles sells smartphones" });
    const current = await gemini.writeVideoPosterPrompt(form(), extracted, { hasLogoFile: true });
    refineReply = JSON.stringify({ adType: "contrast_concept", businessInformation: "Sai Mobiles sells smartphones and repairs screens the same day" });
    const refined = await gemini.refineSection("poster", current, "mention same-day screen repair", form(), extracted);
    expect(readConceptPosterPrompt(refined)).toMatchObject({ adTypeId: "animal_metaphor", format: FORMAT_LOGO_NO_NUMBER });
    expect(refined).toContain("repairs screens the same day");
  });
});
