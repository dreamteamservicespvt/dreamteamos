import { describe, expect, it } from "vitest";
import { buildVideoBottomLabel } from "@/services/geminiService";
import { sanitizeBusinessProfile, verifyBusinessFacts } from "@/utils/businessFacts";
import { AdType, AttireType, type AdFormData } from "@/types/aiPlatform";

/**
 * The Video Bottom Label as the pipeline builds it — from the VERIFIED profile. It draws a pill for
 * every real number (one, two or three) and nothing for a number or an address nobody gave.
 */
const form: AdFormData = {
  adType: AdType.COMMERCIAL, festivalName: "", attireType: AttireType.TRADITIONAL, duration: 16, durationMode: "preset",
  textInstructions: "", aspectRatio: "9:16", language: "Telugu", noLogo: true, logoNameText: "SRI SAI MOTORS",
} as AdFormData;

const labelFor = (typedText: string, profile: Record<string, unknown>, hasContactDocuments = false) => {
  const input = { typedText, hasContactDocuments };
  const facts = verifyBusinessFacts({ ...input, profile });
  return buildVideoBottomLabel({
    formData: form, businessInfo: sanitizeBusinessProfile(profile, facts, input), hasLogoFile: false, hasPremisesPhoto: false,
  });
};

describe("the Video Bottom Label's contact facts", () => {
  it("draws exactly as many pills as the business has numbers", () => {
    for (const [typed, count] of [
      ["Call 9848012345", 1],
      ["Call 9848012345 / 9160345678", 2],
      ["Call 9848012345, 9160345678, 0884-2345678", 3],
    ] as const) {
      const label = labelFor(typed, { businessName: "Sri Sai Motors" });
      expect(label).toContain(`EXACTLY ${count} NUMBER${count === 1 ? "" : "S"}`);
      expect(label.match(/^CONTACT \d = /gm)).toHaveLength(count);
    }
  });

  it("puts no number and no address on the label when none was given — and never the invented ones", () => {
    const label = labelFor("Sri Sai Motors, bike service.", {
      businessName: "Sri Sai Motors", phone: "+91 98765 43210", whatsapp: "9000011111", address: "Plot 4, Jubilee Hills, Hyderabad",
    });
    expect(label).not.toMatch(/^CONTACT \d/m);
    expect(label).not.toMatch(/^ADDRESS =/m);
    expect(label).toContain("NO CONTACT NUMBER provided");
    expect(label).toContain("NO ADDRESS provided");
    expect(label).not.toMatch(/43210|9000011111|Jubilee/);
  });

  it("uses the typed address word for word, and a WhatsApp pill only for a real WhatsApp number", () => {
    const label = labelFor("WhatsApp: 9160345678\nAddress: D.No 12-4, Main Road, Kakinada", { whatsapp: "Not provided" });
    expect(label).toContain("CONTACT 1 = 9160345678 (WhatsApp)");
    expect(label).toContain("ADDRESS = D.No 12-4, Main Road, Kakinada");
    const noWhatsApp = labelFor("Call 9848012345", { whatsapp: "Not provided" });
    expect(noWhatsApp).not.toContain("(WhatsApp)");
    expect(noWhatsApp).not.toContain("give it a WhatsApp pill of its own");
  });
});
