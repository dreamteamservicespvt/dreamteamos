import { describe, it, expect } from "vitest";
import { AttireType, ModelGender } from "@/types/aiPlatform";
import {
  assignmentFormFromOrder, blankAssignmentForm, briefAsInstructions, buildAssignmentRequirementsMessage,
  categorySwitch, requirementSummary, resolveModelSpec,
} from "@/utils/adRequirement";
import { categoryDependentPatch, posterEditFieldsOf } from "@/utils/assignmentEdit";
import { describeSpecChanges, specOf, specSignature } from "@/utils/assignmentSpecDiff";
import { nextWorkUniqueId } from "@/services/orders";
import { hasDressableModel, isHumanPack, packModelGender, getCharacterPack } from "@/services/characterPacks";
import { CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, wardrobeDirective } from "@/services/prompts/characterAd";
import type { AdRequirement, Order, WorkAssignment } from "@/types";

/**
 * The four fixes and the poster job, at the seams where each one used to break:
 *  - the sale's business info reaching the member's requirements message;
 *  - attire surviving on a human-model special category ("Normal Ad (Female)");
 *  - a poster being assignable, editable and briefed as a poster.
 */

const order = (fields: Partial<Order> = {}, requirement: AdRequirement | null = null): Order => ({
  id: "o1", clientPhone: "+919876543210", clientPhoneId: "919876543210",
  businessName: "PVRR SEAFOODS", category: "promotional", packageKey: "30 Seconds + Poster",
  amount: 999, leadId: "l1", saleItemIndex: 0, saleItemKey: "l1__0", saleSubmittedAtMs: 1,
  soldBy: "u1", soldByName: "Kusuma", fromAd: true, salesAdminId: "a1", promise: null,
  requirement, status: "unassigned", createdAt: null,
  ...fields,
} as unknown as Order);

const BRIEF = "Seafood exporter since 2010. Mention fresh catch daily and free home delivery.";

describe("fix 1 — the sale's business info reaches the requirements message", () => {
  it("is carried from the order into the New Assignment form", () => {
    const f = assignmentFormFromOrder(order({}, { businessInfo: BRIEF, businessAddress: "Main Road, Kakinada" }));
    expect(f.businessInfo).toBe(BRIEF);
    expect(f.businessAddress).toBe("Main Road, Kakinada");
  });

  it("is printed in the message, above the internal notes", () => {
    const msg = buildAssignmentRequirementsMessage({
      businessName: "PVRR SEAFOODS", category: "wishes", duration: "20s", clipCount: 2,
      language: "Telugu", requirementNotes: "Client is fussy about the logo",
      businessInfo: BRIEF, businessAddress: "Main Road, Kakinada", accessCode: "1234",
    });
    expect(msg).toContain("🏢 *Business info & what to include:*");
    expect(msg).toContain(BRIEF);
    expect(msg).toContain("📍 *Address:* Main Road, Kakinada");
    expect(msg.indexOf(BRIEF)).toBeLessThan(msg.indexOf("Client notes"));
    expect(msg).toContain("🔑 *Access Code:* 1234");
  });

  it("adds nothing when the sale had no business info — an old message reads as it did", () => {
    const msg = buildAssignmentRequirementsMessage({ category: "promotional", duration: "16s", clipCount: 2 });
    expect(msg).not.toContain("Business info");
    expect(msg).not.toContain("Address");
  });

  it("fills the generator's text box from the brief", () => {
    expect(briefAsInstructions(BRIEF, "Main Road")).toBe(`Business info & what to include (from the sale):\n${BRIEF}\n\nAddress: Main Road`);
    expect(briefAsInstructions("", "  ")).toBe("");
  });
});

describe("fix 2 — attire on a human-model special category", () => {
  it("knows which entries still put a person on screen", () => {
    expect(isHumanPack(getCharacterPack("normal_female"))).toBe(true);
    expect(packModelGender(getCharacterPack("normal_female"))).toBe("female");
    expect(packModelGender(getCharacterPack("normal_male"))).toBe("male");
    expect(packModelGender(getCharacterPack("owner_face_male"))).toBe("male");
    expect(packModelGender(getCharacterPack("god_ganesha"))).toBeNull();
    expect(hasDressableModel("")).toBe(true);
    expect(hasDressableModel("normal_female")).toBe(true);
    expect(hasDressableModel("duo_motu_patlu")).toBe(false);
  });

  it("stores the entry's gender and an attire that suits it", () => {
    expect(resolveModelSpec({ characterPack: "normal_female", modelGender: ModelGender.MALE, attireType: AttireType.SHIRT_PANT }))
      .toEqual({ modelGender: ModelGender.FEMALE, attireType: AttireType.PROFESSIONAL, customAttire: "" });
    expect(resolveModelSpec({ characterPack: "normal_female", modelGender: ModelGender.FEMALE, attireType: AttireType.TRADITIONAL }))
      .toMatchObject({ attireType: AttireType.TRADITIONAL });
    expect(resolveModelSpec({ characterPack: "", modelGender: ModelGender.MALE, attireType: AttireType.CUSTOM, customAttire: " chef coat " }))
      .toEqual({ modelGender: ModelGender.MALE, attireType: AttireType.CUSTOM, customAttire: "chef coat" });
  });

  it("briefs the attire for a human-model entry, and still not for a deity", () => {
    const human = buildAssignmentRequirementsMessage({
      category: "promotional", duration: "16s", clipCount: 2, characterPack: "normal_female",
      modelGender: "female", attireType: "traditional",
    });
    expect(human).toContain("👔 *Attire:* Traditional (Designer Saree)");
    expect(human).not.toContain("👤 *Model:*");

    const deity = buildAssignmentRequirementsMessage({
      category: "promotional", duration: "16s", clipCount: 2, characterPack: "god_ganesha",
      modelGender: "female", attireType: "traditional",
    });
    expect(deity).not.toContain("Attire");
  });

  it("shows the attire in the Orders queue summary for a human-model entry", () => {
    expect(requirementSummary({ specialCategory: "normal_female", attireType: AttireType.TRADITIONAL })).toContain("Traditional (Designer Saree)");
  });

  it("interrupts the member when a human-model job's attire changes", () => {
    const base = { characterPack: "normal_female", attireType: "professional" };
    const changes = describeSpecChanges(base, { ...base, attireType: "traditional" });
    expect(changes).toEqual([{ label: "Attire", from: "Professional (Formal Suit)", to: "Traditional (Designer Saree)" }]);
    // A cartoon has no attire to report.
    expect(describeSpecChanges({ characterPack: "duo_motu_patlu", attireType: "professional" }, { characterPack: "duo_motu_patlu", attireType: "traditional" })).toEqual([]);
  });

  it("puts the ordered outfit into the frame prompt, overriding the entry's either/or", () => {
    const pack = getCharacterPack("normal_female")!;
    const input = {
      segmentCount: 2, clipSummaries: ["a", "b"], locationMode: "ai_generated" as const, locationPlan: "",
      aspectRatio: "9:16" as const, adType: "commercial",
    };
    const saree = wardrobeDirective("traditional", "", "female");
    const withWardrobe = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, { ...input, wardrobe: saree });
    expect(withWardrobe).toContain(`WARDROBE (as ordered — this overrides any outfit STAGING offers): ${saree}`);
    expect(CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, input)).not.toContain("WARDROBE (as ordered");
    // A deity comes dressed — the wardrobe is ignored.
    expect(CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack("god_ganesha")!, { ...input, wardrobe: saree })).not.toContain("WARDROBE (as ordered");
    expect(wardrobeDirective("custom", "white chef coat", "male")).toBe("exactly this outfit: white chef coat");
    expect(wardrobeDirective(undefined, "", "female")).toBe("");
  });
});

describe("poster jobs", () => {
  it("a poster sale opens the form as a poster, priced per poster", () => {
    const f = assignmentFormFromOrder(order({ category: "poster", packageKey: "Standard", amount: 398, quantity: 2 }, {
      businessInfo: BRIEF, festival: "Diwali",
    }));
    expect(f).toMatchObject({ category: "poster", duration: "poster", pricePerUnit: 199, posterCount: 2, festival: "Diwali", businessInfo: BRIEF });
    expect(f.posterSize).toBe("4:5");
    expect(f.posterStyle).toBe("auto");
  });

  it("switching the form to a poster and back re-derives length and price", () => {
    const toPoster = categorySwitch({ category: "promotional", duration: "32s" }, "poster");
    expect(toPoster).toEqual({ duration: "poster", pricePerUnit: 199 });
    const back = categorySwitch({ category: "poster", duration: "poster" }, "cinematic");
    expect(back).toEqual({ duration: "16s", pricePerUnit: 999 });
    // A custom clip count still survives a switch between two ad kinds.
    expect(categorySwitch({ category: "promotional", duration: "120s" }, "cinematic").duration).toBe("120s");
    expect(blankAssignmentForm().category).toBe("promotional");
  });

  it("gets its own id sequence without disturbing promotional", () => {
    const existing = [{ uniqueId: "P007" }, { uniqueId: "PS002" }, { uniqueId: "W001" }] as WorkAssignment[];
    expect(nextWorkUniqueId("poster", existing)).toBe("PS003");
    expect(nextWorkUniqueId("promotional", existing)).toBe("P008");
    expect(nextWorkUniqueId("poster", [])).toBe("PS001");
  });

  it("is briefed as a poster, not a video", () => {
    const msg = buildAssignmentRequirementsMessage({
      businessName: "Udaan Events", category: "poster", duration: "poster", clipCount: 0,
      posterSize: "4:5", posterStyle: "shadow_metaphor", posterCount: 2, festival: "Engineers' Day",
      language: "English", businessInfo: "Event staging and lighting", accessCode: "4321",
      // Ad fields that must NOT appear on a poster brief:
      modelGender: "female", attireType: "traditional", aspectRatio: "9:16",
    });
    expect(msg).toContain("*NEW POSTER ASSIGNMENT*");
    expect(msg).toContain("📐 *Size:* 4:5 · 1080×1350 px");
    expect(msg).toContain("🎨 *Style:* 🌓 Shadow metaphor");
    expect(msg).toContain("🔢 *Posters:* 2");
    expect(msg).toContain("🎊 *Occasion:* Engineers' Day");
    expect(msg).toContain("Event staging and lighting");
    expect(msg).not.toMatch(/Duration|Model|Attire|Ratio|clips/);
  });

  it("an edit writes a poster as a poster, with nothing undefined", () => {
    const form = {
      category: "poster", duration: "16s", modelGender: ModelGender.FEMALE, attireType: AttireType.TRADITIONAL,
      customAttire: "", aspectRatio: "9:16" as const, characterPack: "duo_motu_patlu", realLocationProvided: false,
      ...posterEditFieldsOf({ posterSize: "1:1", posterStyle: "shape_concept", posterCount: 3, festival: " Diwali " }),
    };
    const patch = categoryDependentPatch(form);
    expect(patch).toEqual({
      duration: "poster", clipCount: 0, posterSize: "1:1", posterStyle: "shape_concept", posterCount: 3,
      festival: "Diwali", characterPack: "",
    });
    expect(Object.values(patch).every((v) => v !== undefined)).toBe(true);
  });

  it("an edit writes an ad as an ad, with the model resolved", () => {
    const patch = categoryDependentPatch({
      category: "promotional", duration: "32s", modelGender: ModelGender.MALE, attireType: AttireType.SHIRT_PANT,
      customAttire: "", aspectRatio: "16:9", characterPack: "normal_female", realLocationProvided: true,
      ...posterEditFieldsOf({}),
    });
    expect(patch).toMatchObject({
      duration: "32s", clipCount: 4, modelGender: "female", attireType: "professional", aspectRatio: "16:9",
      characterPack: "normal_female", realLocationProvided: true,
    });
    expect(patch).not.toHaveProperty("posterSize");
  });

  it("tells the member when the poster brief changes, and leaves an ad's signature untouched", () => {
    const a = { category: "poster", posterSize: "4:5", posterStyle: "auto" } as WorkAssignment;
    const b = { ...a, posterSize: "9:16", posterStyle: "shadow_metaphor" } as WorkAssignment;
    const labels = describeSpecChanges(specOf(a), specOf(b)).map((c) => c.label);
    expect(labels).toEqual(["Poster size", "Poster style"]);

    // An ordinary ad signs exactly as it did before poster fields existed.
    const ad = specOf({ category: "promotional", duration: "16s", clipCount: 2 } as WorkAssignment);
    expect(JSON.parse(specSignature(ad))).toHaveLength(13);
  });
});
