import { describe, expect, it } from "vitest";

import {
  MAIN_FRAME_SYSTEM_PROMPT,
  MULTI_FRAME_SYSTEM_PROMPT,
  VOICEOVER_REPAIR_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
  getAttireMode,
} from "../services/prompts";

describe("professional main-frame prompts", () => {
  it("includes the strengthened premium suit markers", () => {
    const prompt = MAIN_FRAME_SYSTEM_PROMPT("professional", "commercial", "");

    expect(prompt).toContain("BLAZER: premium well-tailored blazer");
    expect(prompt).toContain("BLOUSE: crisp white fitted blouse or shirt");
    expect(prompt).toContain("TROUSERS: slim formal trousers");
    expect(prompt).toContain("Canon EOS R5 realism");
    expect(prompt).toContain("PROFESSIONAL SUIT NEGATIVE RULES");
    expect(prompt).toContain("POSE ANCHOR FOR THE HERO MAIN FRAME");
    expect(prompt).toContain("The hero or anchor image must be EXACTLY centered");
  });

  it("keeps the exported attire helper aligned with the strengthened suit direction", () => {
    const attire = getAttireMode("professional");

    expect(attire).toContain("premium beige/pastel luxury campaign suit");
    expect(attire).toContain("crisp white fitted blouse");
    expect(attire).toContain("slim formal trousers");
  });

  it("keeps traditional prompts free of professional-only suit markers", () => {
    const prompt = MAIN_FRAME_SYSTEM_PROMPT("traditional", "commercial", "");

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
  });
});

describe("voice-over prompt hardening", () => {
  it("forces exact 18-word clips and transliterated English digit names", () => {
    const prompt = VOICEOVER_SYSTEM_PROMPT(32, 4, "commercial", "");

    expect(prompt).toContain("Every clip must contain EXACTLY 18 spoken words");
    expect(prompt).toContain("జీరో, వన్, టూ, త్రీ, ఫోర్, ఫైవ్, సిక్స్, సెవెన్, ఎయిట్, నైన్");
    expect(prompt).toContain("group the digit names with commas for clean pauses");
    expect(prompt).toContain("No duplicate clips");
  });

  it("keeps the repair prompt aligned with exact clip and phone rules", () => {
    const prompt = VOICEOVER_REPAIR_SYSTEM_PROMPT(32, 4, "commercial", "");

    expect(prompt).toContain("Every clip must contain EXACTLY 18 spoken words");
    expect(prompt).toContain("Never speak a phone number using native counting words");
    expect(prompt).toContain("Remove duplicated clips and repeated closings");
  });
});