import { describe, it, expect } from "vitest";
import {
  LABEL_FRAME_HEIGHT_PERCENT, LABEL_HEIGHT, LABEL_THEMES, LABEL_WIDTH, LOWER_THIRD_SYSTEM_PROMPT,
  WATERMARK, festivalAccentFor, labelThemeFor,
} from "@/services/prompts/lowerThird";
import { detectBusinessType } from "@/services/prompts";

/**
 * The brand label that replaced the top-strip header.
 *
 * It exists to do two jobs at once — brand the business, and cover the watermark burned into the
 * bottom-right corner of every finished video — so the two things pinned hardest here are the
 * geometry that hides that mark and the content rule that keeps a label a label: a logo, a name,
 * the numbers, one address line, and nothing else.
 */

const label = (over: Partial<Parameters<typeof LOWER_THIRD_SYSTEM_PROMPT>[0]> = {}) =>
  LOWER_THIRD_SYSTEM_PROMPT({
    businessType: "realestate", adType: "commercial", contactCount: 2, hasAddress: true, ...over,
  });

describe("what the label is", () => {
  it("is a transparent, tightly cropped strip — not a poster and not a video frame", () => {
    const p = label();
    expect(p).toContain("TRANSPARENT PNG with a real alpha channel");
    expect(p).toContain("TIGHT CROP");
    expect(p).toContain(`${LABEL_WIDTH} x ${LABEL_HEIGHT} px`);
    expect(p).toContain("NOT a poster, NOT a 9:16 image, NOT a top header");
  });

  it("gives a fallback for generators that cannot do alpha", () => {
    expect(label()).toContain("FLAT PURE MAGENTA (#FF00FF)");
  });

  it("no longer carries anything from the old top strip", () => {
    const p = label();
    expect(p).not.toMatch(/TOP \d+% OF THE FRAME/);
    expect(p).not.toContain("FULL-BLEED");
    expect(p).not.toMatch(/top of the frame/i);
  });
});

describe("covering the watermark", () => {
  it("states where the mark is and makes the right module the tallest part", () => {
    const p = label();
    expect(p).toContain(`about ${WATERMARK.widthPercent}% of the frame's width and ${WATERMARK.heightPercent}% of its height`);
    expect(p).toContain("rises to the FULL height of the label and occupies roughly the right 22% of its width");
    expect(p).toContain("never a patch, a sticker or a plain rectangle pasted on top");
  });

  it("knows how tall the label stands on a 9:16 frame", () => {
    // 3:1 laid across the full width of a 9:16 frame.
    expect(LABEL_FRAME_HEIGHT_PERCENT).toBeCloseTo(18.8, 1);
    expect(label()).toContain(`about ${LABEL_FRAME_HEIGHT_PERCENT}% of the frame tall`);
  });

  it("keeps the raised module even when the business gave no number", () => {
    const p = label({ contactCount: 0 });
    expect(p).toContain("Keep the module itself — it still has to cover the watermark");
    expect(p).toContain("Never invent a number.");
  });

  it("asks for an asymmetric silhouette, not an even bar", () => {
    expect(label()).toContain("low on the left, rising on the right");
  });
});

describe("the contact module, by how many numbers there are", () => {
  it("shapes itself to one, two or three", () => {
    expect(label({ contactCount: 1 })).toContain("ONE premium pill");
    expect(label({ contactCount: 2 })).toContain("TWO evenly stacked pills");
    expect(label({ contactCount: 3 })).toContain("THREE compact stacked pills");
  });

  it("adds a WhatsApp pill only when there is a WhatsApp number", () => {
    expect(label({ hasWhatsApp: true })).toContain("WhatsApp pill of its own, in WhatsApp green");
    expect(label()).not.toContain("WhatsApp");
  });
});

describe("the address strip", () => {
  it("is one line when there is an address", () => {
    const p = label({ hasAddress: true });
    expect(p).toContain("carrying the address on ONE single line");
    expect(p).toContain("never break it onto a second line");
  });

  it("does not exist at all when there is none", () => {
    const p = label({ hasAddress: false });
    expect(p).toContain("NO address strip at all");
    expect(p).toContain("Never draw an empty bar");
    expect(p).toContain("absent entirely, with no empty bar");
  });
});

describe("the theme, by trade", () => {
  it("uses the accents of the category the platform detected", () => {
    expect(label({ businessType: "education" })).toContain(LABEL_THEMES.education.motifs);
    expect(label({ businessType: "jewellery" })).toContain(LABEL_THEMES.jewellery.palette);
    expect(label({ businessType: "construction" })).toContain("a blueprint grid, a hard hat, a steel edge");
  });

  it("falls back to plain geometry for a trade with no theme", () => {
    expect(labelThemeFor("something-unheard-of")).toEqual(LABEL_THEMES.default);
    expect(label({ businessType: "default" })).toContain("clean abstract geometry");
  });

  it("covers every category the detector can return", () => {
    const samples = [
      "college of engineering", "city hospital", "real estate builders", "fashion boutique",
      "restaurant and catering", "software company", "solar power", "laundry and dry clean",
      "mattress and furniture", "electrical hardware", "tea and coffee", "gold and diamond jewellers",
      "security guard services", "car and bike motors", "pharma chemist", "transport and logistics",
      "gym and fitness", "beauty salon and spa",
    ];
    for (const sample of samples) {
      const type = detectBusinessType(sample);
      expect(LABEL_THEMES[type], `${sample} → ${type}`).toBeDefined();
    }
  });

  it("always lets the brand's own colours lead", () => {
    expect(label({ businessType: "fitness" })).toContain("the brand's OWN colours, taken from the logo, always lead");
  });
});

describe("the ad it belongs to", () => {
  it("adds a festival's accents as pictures only, never as a greeting", () => {
    const p = label({ adType: "festival", festivalName: "Diwali" });
    expect(p).toContain("a warm diya glow and fine rangoli sparkle");
    expect(p).toContain("Do NOT write the festival's name, a greeting, wishes or a date anywhere on the label");
  });

  it("knows the festivals the team actually runs, and has a fallback", () => {
    expect(festivalAccentFor("Sankranti")).toContain("kite");
    expect(festivalAccentFor("Ugadi")).toContain("mango leaves");
    expect(festivalAccentFor("Ramzan")).toContain("crescent");
    expect(festivalAccentFor("Bathukamma")).toContain("festive glow");
    expect(festivalAccentFor("")).toBe("");
  });

  it("carries no festival accent on a commercial ad", () => {
    expect(label({ adType: "commercial", festivalName: "Diwali" })).not.toContain("FESTIVAL ACCENT");
  });
});

describe("the premises photograph", () => {
  it("is allowed at the right edge only when the client sent photos", () => {
    expect(label({ hasPremisesPhoto: true })).toContain("premises photograph may sit as a soft, cleanly masked cut-out");
    const none = label({ hasPremisesPhoto: false });
    expect(none).toContain("NO photographs");
    expect(none).toContain("Never invent a building");
  });
});

/**
 * The labels the team made by hand carried feature icons ("PRIVACY / PEACE / COMMUNITY"), slogans
 * ("Just Live Better") and campaign flags ("ADMISSIONS OPEN 2026-2027"). The video is the
 * advertisement; the label is only the brand.
 */
describe("the content rule", () => {
  it("lists the four things a label may carry", () => {
    const p = label();
    expect(p).toContain("The label carries FOUR things and nothing else");
    expect(p).toContain("the business name");
    expect(p).toContain("the address, on one line");
    // …and when there is none, it says so plainly instead of leaving a maybe.
    expect(label({ hasAddress: false })).toContain("(no address — this business gave none, so there is no address strip)");
  });

  it("names the things that crept into the hand-made ones", () => {
    const p = label();
    for (const banned of ["a slogan", "a tagline", "feature icons", "an offer", "an academic year", "admissions open", "a QR code"]) {
      expect(p, banned).toContain(banned);
    }
  });

  it("never invents a value, and never draws a placeholder", () => {
    const p = label();
    expect(p).toContain("NEVER invent, guess or complete a value");
    expect(p).toContain('never write "N/A" or "not provided"');
    expect(p).toContain("digit for digit");
  });

  it("ends on a checklist that asks for the things that go wrong", () => {
    const p = label();
    expect(p).toContain("FINAL CHECK BEFORE YOU RENDER");
    expect(p).toContain("Is the RIGHT contact module the tallest part");
    expect(p).toContain("Is there any slogan, feature word, service, offer or extra sentence anywhere?");
  });
});
