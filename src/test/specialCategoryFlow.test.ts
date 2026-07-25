import { describe, it, expect } from "vitest";
import {
  assignmentFormFromOrder,
  buildAssignmentRequirementsMessage,
  cleanRequirement,
  requirementSummary,
  withRequirementDefaults,
} from "@/utils/adRequirement";
import type { AdRequirement, Order } from "@/types";

/**
 * The special category, from the sales member's mouth to the member's generator.
 *
 * The whole value of the feature is that the person who spoke to the client records "Motu & Patlu,
 * and yes they're sending photos" once, and nobody downstream has to know or re-decide it. These
 * lock each hand-off in that chain, and — just as importantly — pin that an ordinary ad still
 * travels exactly as it always did.
 */

const order = (requirement: AdRequirement | null): Order => ({
  id: "o1", clientPhone: "+919876543210", clientPhoneId: "919876543210",
  businessName: "Sharma Electronics", category: "promotional", packageKey: "30 Seconds",
  amount: 999, leadId: "l1", saleItemIndex: 0, saleItemKey: "l1__0", saleSubmittedAtMs: 1,
  soldBy: "u1", soldByName: "Kusuma", fromAd: true, salesAdminId: "a1", promise: null,
  requirement, status: "unassigned", createdAt: null,
} as unknown as Order);

describe("withRequirementDefaults — special category", () => {
  it("carries the pack and the location answer through", () => {
    const r = withRequirementDefaults({ specialCategory: "motu_patlu", realLocationProvided: true });
    expect(r.specialCategory).toBe("motu_patlu");
    expect(r.realLocationProvided).toBe(true);
  });

  it("leaves an ordinary brief with no pack", () => {
    expect(withRequirementDefaults({ language: "Telugu" }).specialCategory).toBe("");
  });

  // An unanswered flag must not read as "photos are coming" — that would leave the member waiting
  // for images that never arrive, while the opposite mistake merely generates the location.
  it("treats an unanswered location question as 'no photos'", () => {
    expect(withRequirementDefaults({ specialCategory: "motu_patlu" }).realLocationProvided).toBe(false);
    expect(withRequirementDefaults(null).realLocationProvided).toBe(false);
  });
});

describe("cleanRequirement — special category", () => {
  it("stores the pack and an explicit 'no photos' answer together", () => {
    const saved = cleanRequirement({ specialCategory: "motu_patlu", realLocationProvided: false });
    expect(saved).toEqual({ specialCategory: "motu_patlu", realLocationProvided: false });
  });

  it("keeps an ordinary brief free of special-category noise", () => {
    const saved = cleanRequirement({ language: "Telugu", specialCategory: "", realLocationProvided: undefined });
    expect(saved).toEqual({ language: "Telugu" });
  });

  it("still collapses a completely untouched brief to null", () => {
    expect(cleanRequirement({ specialCategory: "", notes: "" })).toBeNull();
  });
});

describe("assignmentFormFromOrder — special category", () => {
  it("opens the New Assignment form on the treatment that was sold", () => {
    const form = assignmentFormFromOrder(order({ specialCategory: "motu_patlu", realLocationProvided: true }));
    expect(form.characterPack).toBe("motu_patlu");
    expect(form.realLocationProvided).toBe(true);
  });

  it("opens an ordinary sale on a normal ad", () => {
    const form = assignmentFormFromOrder(order({ language: "Telugu", modelGender: "female" }));
    expect(form.characterPack).toBe("");
    expect(form.realLocationProvided).toBe(false);
  });

  // A duo removed from the registry would otherwise reach the generator as an id it cannot resolve.
  it("degrades a retired pack id to a normal ad instead of an unknown treatment", () => {
    const form = assignmentFormFromOrder(order({ specialCategory: "chhota_bheem_retired" }));
    expect(form.characterPack).toBe("");
  });

  it("leaves every other field of the brief exactly as it was", () => {
    const form = assignmentFormFromOrder(order({ specialCategory: "motu_patlu", language: "Telugu", notes: "Diwali offer" }));
    expect(form.category).toBe("promotional");
    expect(form.language).toBe("Telugu");
    expect(form.requirementNotes).toBe("Diwali offer");
    expect(form.businessName).toBe("Sharma Electronics");
  });
});

describe("requirementSummary — the Orders queue chips", () => {
  it("names the duo and where the location comes from", () => {
    const chips = requirementSummary({ specialCategory: "motu_patlu", realLocationProvided: true, language: "Telugu", aspectRatio: "9:16" });
    expect(chips).toEqual(["Telugu", "🎭 Motu & Patlu", "📷 Client's photos", "9:16"]);
  });

  it("says the location is being created when the client sent nothing", () => {
    const chips = requirementSummary({ specialCategory: "motu_patlu", realLocationProvided: false });
    expect(chips).toContain("🏙️ Location created");
  });

  // The model and attire describe a person who is never on screen in a pack ad.
  it("never describes a human model on a pack ad", () => {
    const chips = requirementSummary({ specialCategory: "motu_patlu", modelGender: "female", attireType: "traditional" });
    expect(chips.join(" ")).not.toMatch(/Female|Saree/i);
  });

  it("is unchanged for an ordinary ad", () => {
    const chips = requirementSummary({ language: "Telugu", modelGender: "female", attireType: "traditional", aspectRatio: "9:16" });
    expect(chips).toEqual(["Telugu", "👩 Female", "Traditional (Designer Saree)", "9:16"]);
  });
});

describe("buildAssignmentRequirementsMessage — special category", () => {
  const base = { category: "promotional", duration: "32s", clipCount: 4, businessName: "Sharma Electronics" };

  /**
   * A special-category job is worked differently from an ordinary one, so it has to be the first
   * thing the member notices in a thread of near-identical assignment messages — hence the
   * colour markers, which survive a phone skim where bold text alone does not.
   */
  it("tells the member which duo and that both characters speak, highlighted", () => {
    const msg = buildAssignmentRequirementsMessage({ ...base, characterPack: "motu_patlu", realLocationProvided: true });
    expect(msg).toContain("*SPECIAL CATEGORY*");
    expect(msg).toContain("🟠 *MOTU* & 🔵 *PATLU*");
    expect(msg).toMatch(/Both characters speak in every clip/i);
  });

  it("tells the member to upload the photos the client sent", () => {
    const msg = buildAssignmentRequirementsMessage({ ...base, characterPack: "motu_patlu", realLocationProvided: true });
    expect(msg).toMatch(/upload every photo they sent/i);
  });

  it("says the location must be built when the client sent none", () => {
    const msg = buildAssignmentRequirementsMessage({ ...base, characterPack: "motu_patlu", realLocationProvided: false });
    expect(msg).toMatch(/client sent no photos/i);
    expect(msg).not.toMatch(/upload every photo/i);
  });

  it("drops the model and attire lines a pack ad has no use for", () => {
    const msg = buildAssignmentRequirementsMessage({
      ...base, characterPack: "motu_patlu", modelGender: "female", attireType: "traditional",
    });
    expect(msg).not.toContain("*Model:*");
    expect(msg).not.toContain("*Attire:*");
  });

  it("still carries the shared fields a pack ad does use", () => {
    const msg = buildAssignmentRequirementsMessage({
      ...base, characterPack: "motu_patlu", aspectRatio: "9:16", language: "Telugu",
      requirementNotes: "Mention the Diwali offer", accessCode: "4821",
    });
    expect(msg).toContain("9:16");
    expect(msg).toContain("Telugu");
    expect(msg).toContain("Mention the Diwali offer");
    expect(msg).toContain("4821");
  });

  // The canary: every ordinary assignment message must read exactly as it did before packs existed.
  it("is byte-identical to the old brief for an ordinary ad", () => {
    const msg = buildAssignmentRequirementsMessage({
      ...base, modelGender: "female", attireType: "traditional", aspectRatio: "9:16",
      language: "Telugu", accessCode: "4821",
    });
    expect(msg).toBe(
      [
        "🎬✨ *NEW AD ASSIGNMENT* ✨🎬",
        "",
        "🏢 *Business:* Sharma Electronics",
        "🎯 *Category:* Promotional Ad",
        "⏱️ *Duration:* 32s (4 clips + Poster + 5s EC)",
        "",
        "📋 *AD SPECIFICATION*",
        "👤 *Model:* Female",
        "👔 *Attire:* Traditional (Designer Saree)",
        "📐 *Ratio:* 9:16",
        "🗣️ *Language:* Telugu",
        "",
        "🔑 *Access Code:* 4821",
        "",
        "🚀 Let's create something amazing — good luck! 🔥",
      ].join("\n")
    );
    expect(msg).not.toMatch(/motu|patlu|cartoon|special category/i);
  });
});
