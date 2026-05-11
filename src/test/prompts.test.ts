import { describe, expect, it } from "vitest";

import {
  MAIN_FRAME_SYSTEM_PROMPT,
  MULTI_FRAME_SYSTEM_PROMPT,
  VOICEOVER_REPAIR_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
  getAttireMode,
  getProfessionalSuitPaletteForBusiness,
} from "../services/prompts";

describe("professional main-frame prompts", () => {
  it("includes the strengthened premium suit markers", () => {
    const prompt = MAIN_FRAME_SYSTEM_PROMPT("professional", "commercial", "");

    expect(prompt).toContain("BLAZER: premium well-tailored blazer");
    expect(prompt).toContain("BLOUSE: crisp white fitted blouse or shirt");
    expect(prompt).toContain("TROUSERS: slim formal trousers");
    expect(prompt).toContain("Strictly natural rich black hair ONLY from the very first frame onward");
    expect(prompt).toContain("Canon EOS R5 realism");
    expect(prompt).toContain("PROFESSIONAL SUIT NEGATIVE RULES");
    expect(prompt).toContain("POSE ANCHOR FOR THE HERO MAIN FRAME");
    expect(prompt).toContain("The hero or anchor image must be EXACTLY centered");
    expect(prompt).toContain("ENVIRONMENT (REAL BUSINESS PREMISES — MOST CRITICAL SECTION)");
    expect(prompt).toContain("STEP 2 — ADD BUSINESS-PROOF LAYER");
  });

  it("keeps the exported attire helper aligned with the strengthened suit direction", () => {
    const attire = getAttireMode("professional", "tech");

    expect(attire).toContain("premium business-specific luxury campaign suit");
    expect(attire).toContain("soft steel greige");
    expect(attire).toContain("crisp white fitted blouse");
    expect(attire).toContain("slim formal trousers");
    expect(attire).toContain("chosen for this exact business");
  });

  it("derives a more client-specific suit palette from business context", () => {
    const palette = getProfessionalSuitPaletteForBusiness(
      "default",
      JSON.stringify({
        businessName: "Ruby Smile Dental Studio",
        brandColors: ["maroon", "gold"],
        description: "Premium dental clinic with maroon and gold logo walls"
      })
    );

    expect(palette).toContain("rich maroon-taupe");
    expect(palette).toContain("logo colors");
  });

  it("keeps traditional prompts free of professional-only suit markers", () => {
    const prompt = MAIN_FRAME_SYSTEM_PROMPT("traditional", "commercial", "");

    expect(prompt).toContain("ATTIRE (COMMERCIAL DESIGNER SAREE — BUSINESS-SPECIFIC LUXURY — MANDATORY)");
    expect(prompt).toContain("ENVIRONMENT (REAL BUSINESS PREMISES — MOST CRITICAL SECTION)");
    expect(prompt).not.toContain("BLAZER: premium well-tailored blazer");
    expect(prompt).not.toContain("PROFESSIONAL SUIT NEGATIVE RULES");
  });
});

describe("multi-frame hero shot guidance", () => {
  it("preserves the centered folded-hands hero shot for professional mode", () => {
    const prompt = MULTI_FRAME_SYSTEM_PROMPT(
      "professional",
      "commercial",
      "",
      2,
      ["Launch the brand with confidence", "Show the office setting clearly"]
    );

    expect(prompt).toContain("subject perfectly centered");
    expect(prompt).toContain("Hands gently folded at waist, one hand resting over the other");
    expect(prompt).toContain("explicit natural rich black hair only rule");
    expect(prompt).toContain("the exact same natural rich black hair from the first frame onward");
    expect(prompt).toContain("Hair color baseline");
    expect(prompt).toContain("COMMERCIAL LOCATION DENSITY RULE");
    expect(prompt).toContain("approved business-specific palette");
    expect(prompt).toContain("may shift the suit tone within that same palette family");
    expect(prompt).not.toContain("Festival decorations from the office are still visible");
  });
});

describe("commercial and festival separation", () => {
  it("keeps commercial prompts free of festival carryover", () => {
    const mainFramePrompt = MAIN_FRAME_SYSTEM_PROMPT("professional", "commercial", "");
    const multiFramePrompt = MULTI_FRAME_SYSTEM_PROMPT(
      "professional",
      "commercial",
      "",
      2,
      ["Launch the brand with confidence", "Show the office setting clearly"]
    );

    expect(mainFramePrompt).not.toContain("if applicable the festival theme");
    expect(mainFramePrompt).not.toContain("Festival mode professional suits must still respect");
    expect(mainFramePrompt).not.toContain("ENVIRONMENT (REAL BUSINESS PREMISES — KEEP IT CONCISE)");
    expect(multiFramePrompt).not.toContain("Festival decorations from the office are still visible");
  });

  it("keeps festival prompts on the richer festival branch", () => {
    const mainFramePrompt = MAIN_FRAME_SYSTEM_PROMPT("traditional", "festival", "Diwali");
    const multiFramePrompt = MULTI_FRAME_SYSTEM_PROMPT(
      "traditional",
      "festival",
      "Diwali",
      2,
      ["Share festive wishes warmly", "Show the decorated premises clearly"]
    );

    expect(mainFramePrompt).toContain("ENVIRONMENT (REAL [BUSINESS TYPE] OFFICE/STORE WITH DIWALI DECORATIONS — MOST CRITICAL SECTION)");
    expect(mainFramePrompt).toContain("STEP 2 — ADD CONTROLLED DIWALI CUES");
    expect(multiFramePrompt).toContain("Festival decorations from the office are still visible");
    expect(multiFramePrompt).toContain("celebrating Diwali");
  });
});

describe("voice-over prompt hardening", () => {
  it("forces exact 18-word clips and transliterated English digit names", () => {
    const prompt = VOICEOVER_SYSTEM_PROMPT(32, 4, "commercial", "");

    expect(prompt).toContain("Every clip must contain EXACTLY 18 spoken words");
    expect(prompt).toContain("జీరో, వన్, టూ, త్రీ, ఫోర్, ఫైవ్, సిక్స్, సెవెన్, ఎయిట్, నైన్");
    expect(prompt).toContain("group the digit names mainly in pairs");
    expect(prompt).toContain("No duplicate clips");
  });

  it("keeps the repair prompt aligned with exact clip and phone rules", () => {
    const prompt = VOICEOVER_REPAIR_SYSTEM_PROMPT(32, 4, "commercial", "");

    expect(prompt).toContain("Every clip must contain EXACTLY 18 spoken words");
    expect(prompt).toContain("Never speak a phone number using native counting words");
    expect(prompt).toContain("Remove duplicated clips and repeated closings");
  });
});