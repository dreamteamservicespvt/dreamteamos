import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { festivalLook, festivalLookLine, festivalThemeFor } from "@/services/prompts";
import { FESTIVAL_DRESSING_HEADING, withFestivalDressing } from "@/utils/festivalDressing";
import { BACKGROUND_PLATE_HEADING, backgroundPlateRule } from "@/utils/locationAssignment";
import { LOWER_THIRD_SYSTEM_PROMPT } from "@/services/prompts/lowerThird";
import {
  POSTER_PROMPT_CLOSE, conceptPosterPrompt, isConceptPosterPrompt, posterFestivalLine, readConceptPosterPrompt,
} from "@/utils/posterAdType";
import { SCENE_PLAN_SYSTEM_PROMPT, scenePlanUserPrompt } from "@/services/prompts/scenePlan";
import {
  SALE_NAME_LABEL, finalBusinessName, readNameSource, saleBusinessNameIn, saleNameLine, withFinalBusinessName, withoutSaleNameLine,
} from "@/utils/businessName";
import { briefAsInstructions } from "@/utils/adRequirement";
import { EXTRACTION_SYSTEM_PROMPT } from "@/services/prompts";

/**
 * The owner's items 5 and 6 of 2026-10-22.
 *
 *   5. "For the festival videos the bottom label, frame background and the poster are not getting the related
 *      festival theme." The label told the brand colours to "always lead" and capped the festival at "one or two,
 *      small, at the edges"; the frames got the festival's name only (and a client photo was told to add nothing);
 *      the poster got "Occasion: Diwali". Now one look per festival (prompts.festivalLook) leads the label, is
 *      stamped onto every frame (utils/festivalDressing — the plate rule allows exactly those decorations), feeds the
 *      scene plan, and is a "Festival:" line on the poster.
 *   6. "The sales person will add the business name just for reference — it is not the final name. From the user's
 *      attached assets we need to take the final business name." The brief marks the sale's name as a reference, the
 *      extraction reads the name printed on the logo / card / flyer / shop board and says where, and code decides
 *      (utils/businessName) and writes one name into the profile every prompt reads.
 */

const FULL_LOOK = { name: "Diwali", known: true, decorations: "hundreds of lit diyas, marigold garlands", colours: "Deep maroon with gold", floor: "A grand rangoli", light: "Rich warm golden glow" };

describe("item 5 — one festival look, from the catalogue", () => {
  it("names a known festival's own decorations, colours, floor and light — and nothing generic", () => {
    const diwali = festivalLook("Diwali")!;
    expect(diwali.known).toBe(true);
    expect(diwali.decorations).toMatch(/diyas/i);
    expect(diwali.colours).toMatch(/maroon/i);
    expect(diwali.floor).toMatch(/rangoli/i);
    expect(festivalLookLine(diwali)).toMatch(/^Diwali's look — decorations: .*diyas.*; colours: .*; floor: .*; light: /);
    // The colours keep their actual colours (they used to be cut at the first dash: "Warm festive gradient").
    expect(festivalLook("Sankranthi")!.colours).toMatch(/orange|golden|maroon/i);
  });

  it("gives Bakrid the Eid look and the newly sold festivals their own", () => {
    expect(festivalLook("Bakrid")!.decorations).toMatch(/crescent/i);
    expect(festivalLook("Krishna Janmashtami")!.decorations).toMatch(/cradle|peacock/i);
    expect(festivalLook("Sri Rama Navami")!.decorations).toMatch(/thoranam|Rama/i);
    expect(festivalLook("Karthika Pournami")!.decorations).toMatch(/deepams/i);
    expect(festivalLook("Akshaya Tritiya")!.decorations).toMatch(/kalash/i);
  });

  it("names an occasion it has no look for, with its own traditions — never another festival's", () => {
    const birthday = festivalLook("Birthday")!;
    expect(birthday.known).toBe(false);
    expect(festivalThemeFor("Birthday")).toBeNull();
    expect(birthday.decorations).toBe("Birthday's own traditional decorations, flowers and lights");
    expect(JSON.stringify(birthday)).not.toMatch(/mango|deepam|diya/i);
    expect(festivalLook("")).toBeNull();
  });
});

describe("item 5 — every frame dressed for its festival", () => {
  const base = "A photoreal frame: the presenter stands beside the counter.";

  it("stamps the decorations, floor, light and colours — the greeting clip the most festive", () => {
    const wish = withFestivalDressing(base, festivalLook("Diwali"), { wish: true });
    expect(wish).toContain(`${FESTIVAL_DRESSING_HEADING} — DIWALI:`);
    expect(wish).toMatch(/diyas/i);
    expect(wish).toContain("This is the greeting clip");
    expect(wish).toContain("No written words of the festival anywhere");
    const later = withFestivalDressing(base, festivalLook("Diwali"));
    expect(later).toContain("The business stays recognisable");
    expect(later).not.toContain("greeting clip");
  });

  it("adds the decorations ONTO a client's photograph — nothing in it removed or moved", () => {
    const plate = withFestivalDressing(base, FULL_LOOK, { plate: true });
    expect(plate).toContain("ADDED onto its real walls, counters, entrance and floor — nothing in the photograph is removed, moved, hidden or rebuilt");
    // Never the plate's own heading — the video side reads that heading to find a plate clip.
    expect(plate.replace(base, "")).not.toContain(BACKGROUND_PLATE_HEADING);
  });

  it("is stamped once, and never on a commercial ad or an empty prompt", () => {
    const once = withFestivalDressing(base, FULL_LOOK);
    expect(withFestivalDressing(once, FULL_LOOK)).toBe(once);
    expect(withFestivalDressing(base, null)).toBe(base);
    expect(withFestivalDressing("  ", FULL_LOOK)).toBe("  ");
  });

  it("lets the photo rule allow exactly the festival's decorations — and keeps it word for word otherwise", () => {
    const plain = backgroundPlateRule("the attached Store/Office Image #1");
    expect(plain).toContain("Do NOT redesign, rebuild, redraw");
    expect(plain).not.toMatch(/festival/i);
    const festive = backgroundPlateRule("the attached Store/Office Image #1", "Diwali");
    expect(festive.startsWith(plain)).toBe(true);
    expect(festive).toContain("for this Diwali ad, the festival decorations its FESTIVAL DRESSING names");
  });

  it("tells the scene planner the festival's look and to dress every clip's background for it", () => {
    const line = festivalLookLine(festivalLook("Diwali"));
    const sys = SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 3, adType: "festival", festivalName: "Diwali", subject: "the presenter", festivalLook: line });
    expect(sys).toContain("THIS IS A DIWALI AD: EVERY clip's background is that part of the place DRESSED FOR Diwali");
    expect(sys).toMatch(/diyas/i);
    const user = scenePlanUserPrompt({ businessContent: "", frameInstructions: "", businessInfo: {}, clipLines: ["a", "b"], adType: "festival", festivalName: "Diwali", festivalLook: line });
    expect(user).toContain(`FESTIVAL LOOK: ${line}`);
    expect(SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 3, adType: "commercial", subject: "the presenter" })).not.toContain("DRESSED FOR");
  });
});

describe("item 5 — the bottom label leads with the festival", () => {
  const label = (over: Record<string, unknown> = {}) => LOWER_THIRD_SYSTEM_PROMPT({
    businessType: "electronics", adType: "festival", festivalName: "Diwali", contactCount: 1, hasAddress: false,
    festivalTheme: { colors: "maroon and gold", patterns: "diya motifs", elements: "diyas, rangoli, lanterns", accents: "gold glow", mood: "luminous" },
    ...over,
  } as any);

  it("gives the festival its own section BEFORE the trade's, with its colours leading and the brand as the accent", () => {
    const p = label();
    const festival = p.indexOf("===== FESTIVAL THEME (VISUAL ONLY) — DIWALI");
    const trade = p.indexOf("===== THEME — ELECTRONICS");
    expect(festival).toBeGreaterThan(0);
    expect(festival).toBeLessThan(trade);
    expect(p).toContain("must read as Diwali at first glance");
    expect(p).toContain("Diwali's colours lead (see FESTIVAL THEME above)");
    expect(p).not.toContain("always lead");
    expect(p).not.toContain("(one or two, small, at the edges)");
    expect(p).toContain("Finish: gold glow. Mood: luminous.");
    expect(p).toMatch(/8\. Does it read as Diwali at first glance/);
    expect(p).toContain("Do NOT write the festival's name, a greeting, wishes or a date anywhere on the label");
    expect(p).toContain("laid over the BOTTOM of a finished Diwali festival advertisement video");
  });

  it("leaves a commercial label exactly as before", () => {
    const p = label({ adType: "commercial", festivalName: "", festivalTheme: undefined });
    expect(p).toContain("the brand's OWN colours, taken from the logo, always lead");
    expect(p).not.toContain("FESTIVAL THEME");
    expect(p).not.toMatch(/\n8\. /);
  });
});

describe("item 5 — the poster carries the festival's look", () => {
  const FORMAT = "9:16 vertical poster. Use the attached logo exactly as given. Words on the poster in English. No phone number on the poster.";

  it("adds one Festival line after the owner's three sentences, which never change, and reads it back", () => {
    const festival = posterFestivalLine(festivalLook("Diwali"));
    expect(festival).toMatch(/^a Diwali poster in Diwali's own look — .*diyas.* worked into the one visual concept; colours .*; Diwali's usual greeting may be the headline$/i);
    const p = conceptPosterPrompt({ adTypeName: "Shadow Metaphor Ads", businessInformation: "Sai Mobiles — smartphones", format: FORMAT, festival, changes: "Use red and gold" });
    expect(p.startsWith(`Create a minimalist and creative ad in Shadow Metaphor Ads. Business Information: Sai Mobiles — smartphones. ${POSTER_PROMPT_CLOSE}\n\nFestival: `)).toBe(true);
    expect(p).toMatch(/\n\nFestival: .+\.\n\nChanges: Use red and gold\.\n\nFormat: /);
    expect(isConceptPosterPrompt(p)).toBe(true);
    expect(readConceptPosterPrompt(p)).toMatchObject({ festival: festival, changes: "Use red and gold", format: FORMAT });
  });

  it("says 'an' before a vowel, names an unknown occasion with its own traditions, and is empty without one", () => {
    expect(posterFestivalLine(festivalLook("Eid ul-Fitr"))).toMatch(/^an Eid ul-Fitr poster/);
    expect(posterFestivalLine(festivalLook("Birthday"))).toBe("a Birthday poster in Birthday's own traditional look and colours, worked into the one visual concept; its usual greeting may be the headline");
    expect(posterFestivalLine(null)).toBe("");
  });
});

describe("item 6 — the sale's business name is only a reference", () => {
  it("writes the sale's name as a reference in the brief, and reads it back — the old line too", () => {
    expect(saleNameLine("Sri Sai")).toBe(`${SALE_NAME_LABEL}: Sri Sai`);
    const brief = briefAsInstructions("Mobiles and accessories", "", { businessName: "Sri Sai" });
    expect(saleBusinessNameIn(brief)).toBe("Sri Sai");
    expect(saleBusinessNameIn("Business name: Sharma TVs\n\nOther text")).toBe("Sharma TVs");
    expect(saleBusinessNameIn("We sell business names on boards")).toBe("");
    expect(withoutSaleNameLine(brief)).toBe("Business info & what to include (from the sale):\nMobiles and accessories");
  });

  it("reads where the extraction found the name, however it phrases it", () => {
    expect(readNameSource("logo")).toBe("logo");
    expect(readNameSource("Visiting card (front)")).toBe("visiting card");
    expect(readNameSource("the shop's name board")).toBe("store photo");
    expect(readNameSource("Flyer")).toBe("flyer");
    expect(readNameSource("typed reference")).toBe("typed");
    expect(readNameSource("Not provided")).toBe("none");
    expect(readNameSource(undefined)).toBeNull();
  });

  const none = { logo: false, visitingCard: false, flyer: false, storePhoto: false, voiceNote: false };

  it("takes the name printed on the client's own material over the sale's", () => {
    expect(finalBusinessName({ extracted: "Sri Sai Mobiles & Accessories", source: "logo", typed: "Sri Sai", assets: { ...none, logo: true } }))
      .toEqual({ name: "Sri Sai Mobiles & Accessories", from: "asset" });
    expect(finalBusinessName({ extracted: "Lakshmi Silks", source: "visiting card", typed: "Lakshmi", assets: { ...none, visitingCard: true } }).name).toBe("Lakshmi Silks");
    expect(finalBusinessName({ extracted: "Ravi Hardware", source: "store photo", typed: "Ravi", assets: { ...none, storePhoto: true } }).name).toBe("Ravi Hardware");
  });

  it("never trusts a source that was not attached, and falls back to the sale's name when no file shows one", () => {
    // "Read from the logo" with no logo attached — the sale's reference wins.
    expect(finalBusinessName({ extracted: "Invented Name", source: "logo", typed: "Sri Sai", assets: none })).toEqual({ name: "Sri Sai", from: "typed" });
    expect(finalBusinessName({ extracted: "Sri Sai", source: "typed reference", typed: "Sri Sai", assets: { ...none, logo: true } })).toEqual({ name: "Sri Sai", from: "typed" });
    expect(finalBusinessName({ extracted: "Not provided", source: "Not provided", typed: "Sri Sai", assets: none })).toEqual({ name: "Sri Sai", from: "typed" });
    // An older reply with no source: the files' reading when files were attached.
    expect(finalBusinessName({ extracted: "Sri Sai Mobiles", typed: "Sri Sai", assets: { ...none, logo: true } })).toEqual({ name: "Sri Sai Mobiles", from: "extracted" });
    expect(finalBusinessName({ extracted: "", typed: "", assets: none })).toEqual({ name: "", from: "none" });
  });

  it("writes ONE name into the profile — first, everywhere it appears — and keeps the sale's as a reference", () => {
    const profile = {
      businessNameSource: "logo",
      "BUSINESS IDENTITY": { "Business Name": "Sri Sai", "Owner / Proprietor Name": "Ravi" },
      services: ["phones"],
    };
    const out = withFinalBusinessName(profile, { name: "Sri Sai Mobiles & Accessories", from: "asset" }, "Sri Sai");
    expect(Object.keys(out)[0]).toBe("businessName");
    expect(out.businessName).toBe("Sri Sai Mobiles & Accessories");
    expect((out["BUSINESS IDENTITY"] as any)["Business Name"]).toBe("Sri Sai Mobiles & Accessories");
    expect((out["BUSINESS IDENTITY"] as any)["Owner / Proprietor Name"]).toBe("Ravi");
    expect(out).not.toHaveProperty("businessNameSource");
    expect(out.nameSource).toBe("asset");
    expect(out.saleReference).toBe("Sri Sai");
  });

  it("tells the extraction where the name comes from, and lets it read the logo's name", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("THE BUSINESS NAME — WHERE IT COMES FROM (MANDATORY)");
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("is only a REFERENCE");
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('"businessNameSource"');
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("The business NAME written in the logo is the one exception");
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/extract the following business information/i);
  });
});

// ── The whole run, on a fake Gemini ───────────────────────────────────────────────────────────────

type Call = { sys: string; user: string };
const calls: Call[] = [];
let extracted: Record<string, unknown> = {};
let writer = "";

const FRAME_REPLY = (n: number) => Array.from({ length: n }, (_, i) =>
  `A photoreal frame for clip ${i + 1}: the cast stands inside the business beside the real counter, shelves of stock behind, soft daylight.`).join("\n###CLIP###\n");

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (req: any) => {
        const sys = String(req.config?.systemInstruction || "");
        const user = (req.contents?.[0]?.parts || []).map((p: any) => p.text || "").join("\n");
        const json = req.config?.responseMimeType === "application/json";
        calls.push({ sys, user });
        const clips = Number((user.match(/Generate (\d+)(?: unique)? Main Frame image prompts/) || [])[1] || 0);
        if (/extract the following business information/i.test(sys)) return { text: JSON.stringify(extracted) };
        if (/location scout/i.test(sys)) {
          return { text: JSON.stringify([{ index: 0, zone: "billing counter", shows: "glass counter and phones", lighting: "tube light", usable: true }]) };
        }
        if (clips > 0) return { text: FRAME_REPLY(clips) };
        const current = user.match(/---CURRENT PROMPTS---([\s\S]*?)(?:---|$)/);
        if (current) return { text: FRAME_REPLY(current[1].split("###CLIP###").length) };
        if (/^Generate a \d+-second .*voice-over script for:/m.test(user)) return { text: writer };
        if (/Direct these \d+ clips?/.test(user)) return { text: "[]" };
        return { text: json ? "{}" : "x".repeat(80) };
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
  extracted = { businessName: "Sai Mobiles", businessType: "mobile store" };
  writer = "";
});

const noFiles = (): any => ({ logo: null, visitingCard: [], storeImage: [], productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: [] });
const image = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const form = (over: Record<string, unknown> = {}): any => ({
  adType: "commercial", festivalName: "", attireType: "traditional", gender: "female", duration: 16, durationMode: "preset",
  textInstructions: "Sai Mobiles sells every brand of smartphone with easy EMI and free screen guards.", aspectRatio: "9:16",
  language: "English", ...over,
});

// Eighteen-to-twenty-word English clips: the Diwali greeting, then the message.
const WISH = "Warm Diwali wishes from Sai Mobiles to all our friends, well-wishers and customers — may your home shine bright.";
const MESSAGE = "Every smartphone comes with easy EMI and free screen guards, so choose Sai Mobiles with complete confidence this season.";
const COMMERCIAL_1 = "Sai Mobiles keeps every brand of smartphone under one roof with easy EMI for your whole family today.";

describe("item 5, the whole run — a festival ad carries its festival everywhere", () => {
  it("dresses every frame, leads the label and themes the poster — in AI scenes", async () => {
    writer = `clip-1[0-8sec]: ${WISH}\nclip-2[8-16sec]: ${MESSAGE}`;
    const out = await gemini.generateAdAssets(form({ adType: "festival", festivalName: "Diwali" }), noFiles(), () => {}, {});
    expect(out.mainFramePrompts).toHaveLength(2);
    out.mainFramePrompts.forEach((prompt: string, i: number) => {
      expect(prompt).toContain("FESTIVAL DRESSING — DIWALI");
      expect(prompt).toMatch(/diyas/i);
      expect(prompt.includes("This is the greeting clip")).toBe(i === 0);
    });
    expect(out.headerPrompt).toContain("FESTIVAL THEME (VISUAL ONLY) — DIWALI");
    expect(out.headerPrompt).not.toContain("(one or two, small, at the edges)");
    expect(out.posterPrompt).toMatch(/\n\nFestival: a Diwali poster in Diwali's own look/);
    expect(isConceptPosterPrompt(out.posterPrompt)).toBe(true);
    // The scene planner was given the look, not only the name.
    const plan = calls.find((c) => /production designer/.test(c.sys));
    expect(plan?.user).toMatch(/FESTIVAL LOOK: Diwali's look — decorations: .*diyas/i);
  });

  it("adds the decorations onto the client's own photograph — and the photo rule allows exactly those", async () => {
    writer = `clip-1[0-8sec]: ${WISH}\nclip-2[8-16sec]: ${MESSAGE}`;
    const files = noFiles();
    files.storeImage = [image("shop.png")];
    const out = await gemini.generateAdAssets(form({ adType: "festival", festivalName: "Diwali", locationMode: "real_provided" }), files, () => {}, {});
    for (const prompt of out.mainFramePrompts) {
      expect(prompt.startsWith("📎 ATTACH STORE/OFFICE IMAGE #1")).toBe(true);
      expect(prompt).toContain("FESTIVAL DRESSING — DIWALI");
      expect(prompt).toContain("ADDED onto its real walls, counters, entrance and floor");
      expect(prompt).toContain("for this Diwali ad, the festival decorations its FESTIVAL DRESSING names");
    }
  });

  it("leaves a commercial ad without any festival", async () => {
    writer = `clip-1[0-8sec]: ${COMMERCIAL_1}\nclip-2[8-16sec]: ${MESSAGE}`;
    const out = await gemini.generateAdAssets(form(), noFiles(), () => {}, {});
    for (const prompt of out.mainFramePrompts) expect(prompt).not.toContain(FESTIVAL_DRESSING_HEADING);
    expect(out.headerPrompt).not.toContain("FESTIVAL THEME");
    expect(out.posterPrompt).not.toContain("\n\nFestival:");
  });
});

describe("item 6, the whole run — the name on the client's logo is the business's name", () => {
  const brief = `${saleNameLine("Sai")}\n\nBusiness info & what to include (from the sale):\nSmartphones with easy EMI and free screen guards.`;

  it("uses the logo's name everywhere the name is printed or said — never the sale's reference", async () => {
    extracted = { businessName: "Sai Mobiles & Accessories", businessNameSource: "logo", businessType: "mobile store" };
    writer = `clip-1[0-8sec]: ${COMMERCIAL_1}\nclip-2[8-16sec]: ${MESSAGE}`;
    const files = noFiles();
    files.logo = image("logo.png");
    const out = await gemini.generateAdAssets(form({ textInstructions: brief }), files, () => {}, {});
    expect(out.headerPrompt).toContain("NAME = Sai Mobiles & Accessories");
    expect(out.posterPrompt).toContain("Sai Mobiles & Accessories");
    const core = calls.find((c) => /BUSINESS INFORMATION \(extracted from the client's Assets & Files\)/.test(c.user));
    expect(core?.user).toContain("THE BUSINESS'S NAME (final — as printed on its own logo, card, flyer or board): Sai Mobiles & Accessories");
    // The core message never sees the sale's reference line.
    expect(core?.user).not.toContain(SALE_NAME_LABEL);
    // The extraction was told the typed name is a reference.
    const extraction = calls.find((c) => /extract the following business information/i.test(c.sys))!;
    expect(extraction.user).toContain("its business name from the sale is only a REFERENCE");
    expect(extraction.user).toContain("Read the business name written in it (its wordmark)");
  });

  it("falls back to the sale's name when no attached file shows one", async () => {
    extracted = { businessName: "Not provided", businessNameSource: "Not provided", businessType: "mobile store" };
    writer = `clip-1[0-8sec]: ${COMMERCIAL_1}\nclip-2[8-16sec]: ${MESSAGE}`;
    const out = await gemini.generateAdAssets(form({ textInstructions: brief, noLogo: true, logoNameText: "" }), noFiles(), () => {}, {});
    expect(out.headerPrompt).toContain("NAME = Sai");
    expect(out.headerPrompt).not.toContain("NAME = Not provided");
  });
});
