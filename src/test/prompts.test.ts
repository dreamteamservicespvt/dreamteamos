import { describe, expect, it } from "vitest";

import {
  MAIN_FRAME_SYSTEM_PROMPT,
  MULTI_FRAME_SYSTEM_PROMPT,
  VOICEOVER_REPAIR_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
  detectEducationEnvironmentMode,
  getCommercialLocationPlanForBusiness,
  getAttireMode,
  getEnvironmentForBusiness,
  getEnvironmentNegativeRules,
  getProfessionalSuitPaletteForBusiness,
  getRealisticLogoPlacementGuidance,
} from "../services/prompts";

const institutionBusinessContext = JSON.stringify({
  businessName: "Sri Venkateswara Engineering College",
  description: "College campus with admissions office, lecture halls, labs, library and student counseling desk",
  services: ["BTech admissions", "Campus placements", "Engineering labs"],
  brandColors: ["blue", "gold"],
});

const consultancyBusinessContext = JSON.stringify({
  businessName: "Global Wings Study Abroad",
  description: "Premium education consultancy for overseas admissions, visa guidance and counseling",
  services: ["Study abroad counseling", "Visa assistance", "Application support"],
  brandColors: ["green", "white"],
});

describe("professional main-frame prompts", () => {
  it("uses the compact example-format first-frame prompt", () => {
    const prompt = MAIN_FRAME_SYSTEM_PROMPT("professional", "commercial", "");

    expect(prompt).toContain("Main Character:");
    expect(prompt).toContain("Pose:");
    expect(prompt).toContain("Background:");
    expect(prompt).toContain("Composition:");
    expect(prompt).toContain("formal front-clasp corporate pose");
    expect(prompt).toContain("fill about 70% of the frame height");
    expect(prompt).toContain("(not saree)");
    expect(prompt).toContain("avoid a repetitive plain blue corporate suit");
    expect(prompt).toContain("never reuse the same recurring face");
    expect(prompt).toContain("reception");
    expect(prompt).toContain("Three-quarter shot");
    expect(prompt).toContain("finger ring");
    expect(prompt).toContain("the attached logo is the ONLY text or branding anywhere");
    expect(prompt).toContain("SMALL-to-medium wall sign");
    expect(prompt).toContain("NEVER enlarge the logo at the cost of the girl");
    expect(prompt).toContain("a small bindi on the forehead");
    expect(prompt).toContain("crisp and clearly readable");
    expect(prompt).toContain("NO EMPTY PLACEHOLDERS");
    expect(prompt).not.toContain("must be blank / textless");
    // negative-prompt block and verbose meta-sections must be gone
    expect(prompt).not.toContain("PROFESSIONAL SUIT NEGATIVE RULES");
    expect(prompt).not.toContain("CASTING OVERRIDE");
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

    expect(palette).toContain("rich maroon");
    expect(palette).toContain("logo colors");
  });

  it("keeps education suit palettes mode-aware instead of collapsing to one beige", () => {
    const institutionPalette = getProfessionalSuitPaletteForBusiness("education", institutionBusinessContext);
    const consultancyPalette = getProfessionalSuitPaletteForBusiness("education", consultancyBusinessContext);

    expect(institutionPalette).toContain("campus polish");
    expect(consultancyPalette).toContain("counseling-office polish");
    expect(institutionPalette).toContain("approved palette family");
    expect(consultancyPalette).toContain("approved palette family");
    expect(institutionPalette).not.toBe(consultancyPalette);
  });

  it("uses the compact example-format first-frame prompt for commercial saree", () => {
    const prompt = MAIN_FRAME_SYSTEM_PROMPT("traditional", "commercial", "");

    expect(prompt).toContain("Main Character:");
    expect(prompt).toContain("elegant premium designer saree");
    expect(prompt).toContain("Wearing elegant traditional semi-jewellery (MANDATORY)");
    expect(prompt).toContain("formal front-clasp corporate pose");
    expect(prompt).toContain("fill about 70% of the frame height");
    expect(prompt).toContain("NO EMPTY PLACEHOLDERS");
    expect(prompt).toContain("the attached logo is the ONLY text or branding anywhere");
    // saree compact must NOT fall back to the suit branch or the old verbose template
    expect(prompt).not.toContain("Wearing a premium tailored formal suit");
    expect(prompt).not.toContain("ATTIRE (COMMERCIAL DESIGNER SAREE — BUSINESS-SPECIFIC LUXURY — MANDATORY)");
    expect(prompt).not.toContain("PROFESSIONAL SUIT NEGATIVE RULES");
  });
});

describe("education environment routing", () => {
  it("routes institution inputs to campus mode with academic surfaces", () => {
    const environment = getEnvironmentForBusiness("education", institutionBusinessContext);
    const prompt = MAIN_FRAME_SYSTEM_PROMPT("professional", "commercial", "", "1:1", institutionBusinessContext);

    expect(detectEducationEnvironmentMode(institutionBusinessContext)).toBe("institution");
    expect(environment).toContain("Campus entrance branding");
    expect(environment).toContain("admissions desk");
    expect(environment).toContain("library");
    expect(prompt).toContain("Campus entrance branding");
    expect(prompt).toContain("admissions desk");
    expect(prompt).toContain("100% relatable to the provided business");
  });

  it("routes consultancy inputs to counseling-office mode", () => {
    const environment = getEnvironmentForBusiness("education", consultancyBusinessContext);
    const locationPlan = getCommercialLocationPlanForBusiness("education", consultancyBusinessContext);

    expect(detectEducationEnvironmentMode(consultancyBusinessContext)).toBe("consultancy");
    expect(environment).toContain("education consultancy office");
    expect(environment).toContain("Counseling desks");
    expect(locationPlan).toContain("University partnership or destination wall");
    expect(locationPlan).toContain("Application review desk");
  });

  it("adds hard negatives so education prompts do not drift into home-like interiors", () => {
    const institutionNegatives = getEnvironmentNegativeRules("education", institutionBusinessContext);
    const consultancyNegatives = getEnvironmentNegativeRules("education", consultancyBusinessContext);

    expect(institutionNegatives).toContain("home interior");
    expect(institutionNegatives).toContain("living room");
    expect(institutionNegatives).toContain("college");
    expect(consultancyNegatives).toContain("home interior");
    expect(consultancyNegatives).toContain("counseling desks");
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
    expect(prompt).toContain("formal front-clasp corporate pose");
    // continuation clips must forbid invented background text
    expect(prompt).toContain("the attached logo is the ONLY text anywhere in the frame");
    expect(prompt).toContain("course / curriculum lists");
    expect(prompt).toContain("Main Character");
    expect(prompt).toContain("the exact same natural rich black hair from the first frame onward");
    expect(prompt).toContain("Hair color baseline");
    expect(prompt).toContain("COMMERCIAL LOCATION DENSITY RULE");
    expect(prompt).toContain("approved business-specific palette");
    expect(prompt).toContain("may shift the suit tone within that same palette family");
    expect(prompt).not.toContain("Festival decorations from the office are still visible");
  });

  it("uses campus-specific location ladders and shot-aware logo surfaces for institution campaigns", () => {
    const prompt = MULTI_FRAME_SYSTEM_PROMPT(
      "professional",
      "commercial",
      "",
      3,
      [
        "Admissions open now for future engineers",
        "Show our lecture halls and laboratories",
        "Invite students to visit campus today"
      ],
      institutionBusinessContext
    );

    expect(prompt).toContain("FOR THIS CLIENT'S COMMERCIAL CAMPAIGN");
    expect(prompt).toContain("Campus entrance or branded reception");
    expect(prompt).toContain("Admissions desk");
    expect(prompt).toContain("LOGO SURFACE");
    expect(prompt).toContain("academic reception board");
    expect(prompt).toContain("Logo installation surface");
  });

  it("keeps consultancy campaigns on consultancy-specific location ladders", () => {
    const prompt = MULTI_FRAME_SYSTEM_PROMPT(
      "professional",
      "commercial",
      "",
      3,
      [
        "Start your overseas study journey with confidence",
        "See our application guidance and university options",
        "Visit our counseling center today"
      ],
      consultancyBusinessContext
    );

    expect(prompt).toContain("education consultancy mode");
    expect(prompt).toContain("University partnership or destination wall");
    expect(prompt).toContain("Visa or document consultation zone");
    expect(prompt).toContain("counseling-office reception board");
  });
});

describe("logo placement realism", () => {
  it("returns realistic logo installation guidance for education modes", () => {
    const institutionGuidance = getRealisticLogoPlacementGuidance("education", institutionBusinessContext);
    const consultancyGuidance = getRealisticLogoPlacementGuidance("education", consultancyBusinessContext);

    expect(institutionGuidance).toContain("admissions wall panel");
    expect(institutionGuidance).toContain("not pasted as an overlay");
    expect(consultancyGuidance).toContain("counseling desk backdrop");
    expect(consultancyGuidance).toContain("not pasted as an overlay");
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
  it("forces exact 18-word clips, no spoken numbers, and the on-screen call CTA", () => {
    const prompt = VOICEOVER_SYSTEM_PROMPT(32, 4, "commercial", "");

    expect(prompt).toContain("Every clip must contain EXACTLY 18 spoken words");
    expect(prompt).toContain("NEVER speak, read, or include any phone number or contact number");
    expect(prompt).toContain("PROFESSIONAL TRANSLITERATION RULE");
    expect(prompt).toContain("No duplicate clips");
  });

  it("keeps the repair prompt aligned with no-number and CTA rules", () => {
    const prompt = VOICEOVER_REPAIR_SYSTEM_PROMPT(32, 4, "commercial", "");

    expect(prompt).toContain("Every clip must contain EXACTLY 18 spoken words");
    expect(prompt).toContain("NEVER speak or include any phone number or contact number");
    expect(prompt).toContain("Remove duplicated clips and repeated closings");
  });
});
