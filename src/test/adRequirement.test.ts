import { describe, it, expect } from "vitest";
import { AttireType, ModelGender } from "@/types/aiPlatform";
import {
  attireForGender, attireLabel, cleanRequirement, durationForSale,
  assignmentFormFromOrder, requirementSummary, withRequirementDefaults,
} from "@/utils/adRequirement";
import type { Order } from "@/types";

/**
 * The brief captured at sale time has to survive the trip to the tech team unchanged. These lock
 * down the two places it could quietly go wrong: turning a sold package into a video duration,
 * and turning an order into a filled-in assignment form.
 */

const order = (fields: Partial<Order> = {}): Order => ({
  id: "o1",
  clientPhone: "+919876543210",
  clientPhoneId: "919876543210",
  businessName: "Sharma Electronics",
  category: "promotional",
  packageKey: "30 Seconds + Poster",
  amount: 999,
  leadId: "l1",
  saleItemIndex: 0,
  saleItemKey: "l1__0",
  saleSubmittedAtMs: 0,
  soldBy: "s1",
  soldByName: "Anita",
  fromAd: true,
  salesAdminId: "sa1",
  promise: null,
  status: "unassigned",
  createdAt: null,
  updatedAt: null,
  ...fields,
} as Order);

describe("durationForSale", () => {
  it("maps each promotional package to its production duration by position", () => {
    expect(durationForSale("promotional", "15 Seconds + Poster")).toBe("16s");
    expect(durationForSale("promotional", "30 Seconds + Poster")).toBe("32s");
    expect(durationForSale("promotional", "45 Seconds + Poster")).toBe("48s");
    expect(durationForSale("promotional", "1 Minute + Poster")).toBe("64s");
  });

  it("maps cinematic and wishes packages too", () => {
    expect(durationForSale("cinematic", "45 Seconds + Poster")).toBe("48s");
    expect(durationForSale("wishes", "20 Seconds")).toBe("20s");
    expect(durationForSale("wishes", "40 Seconds")).toBe("40s");
  });

  it("falls back to the amount when the package label no longer matches", () => {
    expect(durationForSale("promotional", "Renamed package", 1999)).toBe("64s");
    expect(durationForSale("cinematic", "Renamed package", 1999)).toBe("32s");
  });

  it("falls back to the shortest package when nothing matches at all", () => {
    expect(durationForSale("promotional", "unknown", 12345)).toBe("16s");
    expect(durationForSale("promotional", null)).toBe("16s");
  });

  it("has no duration for a service that isn't a video", () => {
    expect(durationForSale("website", "Website (Starting From)")).toBe("");
  });
});

describe("assignmentFormFromOrder", () => {
  it("derives category and duration from what was actually sold", () => {
    const form = assignmentFormFromOrder(order({ category: "cinematic", packageKey: "1 Minute + Poster", amount: 3999 }));
    expect(form.category).toBe("cinematic");
    expect(form.duration).toBe("64s");
    // Tech price comes from the production table, not the sale price.
    expect(form.pricePerUnit).toBe(3999);
  });

  it("assigns a bulk order as the kind of video it is made of", () => {
    // Without this the form opened on the "bulk_ads" category, which production knows nothing
    // about: no duration, and a ₹0 unit price for whoever had to assign the job.
    const form = assignmentFormFromOrder(order({
      category: "bulk_ads", bulkAdType: "cinematic", packageKey: "45 Seconds + Poster",
      quantity: 10, amount: 26991,
    }));
    expect(form.category).toBe("cinematic");
    expect(form.duration).toBe("48s");
    expect(form.pricePerUnit).toBe(2999);
  });

  it("assigns a bulk order recorded before the kind existed as promotional", () => {
    const form = assignmentFormFromOrder(order({
      category: "bulk_ads", packageKey: "30 Seconds + Poster", quantity: 8, amount: 7592,
    }));
    expect(form.category).toBe("promotional");
    expect(form.duration).toBe("32s");
    expect(form.pricePerUnit).toBe(999);
  });

  it("carries the sales member's brief through untouched", () => {
    const form = assignmentFormFromOrder(order({
      requirement: {
        businessName: "Sharma Mobiles",
        businessWhatsapp: "+919000000000",
        language: "Tamil",
        modelGender: "male",
        attireType: "shirt_pant",
        aspectRatio: "16:9",
        notes: "Mention the Diwali offer",
      },
    }), ["Telugu", "Tamil"]);

    expect(form.businessName).toBe("Sharma Mobiles");
    expect(form.businessWhatsapp).toBe("+919000000000");
    expect(form.language).toBe("Tamil");
    expect(form.modelGender).toBe(ModelGender.MALE);
    expect(form.attireType).toBe(AttireType.SHIRT_PANT);
    expect(form.aspectRatio).toBe("16:9");
    expect(form.requirementNotes).toBe("Mention the Diwali offer");
  });

  it("falls back to the order's own client details when there is no brief", () => {
    const form = assignmentFormFromOrder(order({ requirement: null }));
    expect(form.businessName).toBe("Sharma Electronics");
    expect(form.businessWhatsapp).toBe("+919876543210");
    // The team's defaults, so an untouched sale still produces a complete spec.
    expect(form.language).toBe("Telugu");
    expect(form.modelGender).toBe(ModelGender.FEMALE);
    expect(form.attireType).toBe(AttireType.TRADITIONAL);
    expect(form.aspectRatio).toBe("9:16");
  });

  it("routes a language the dropdown doesn't know into the custom slot rather than dropping it", () => {
    const form = assignmentFormFromOrder(order({ requirement: { language: "Marathi" } }), ["Telugu", "Hindi"]);
    expect(form.language).toBe("Custom");
    expect(form.customLanguage).toBe("Marathi");
  });

  it("keeps attire valid for the model — a saree is not an option for a male model", () => {
    const form = assignmentFormFromOrder(order({
      requirement: { modelGender: "male", attireType: "traditional" },
    }));
    expect(form.attireType).toBe(AttireType.PROFESSIONAL);
  });

  it("opens a non-ad order on an ad category for the admin to correct", () => {
    const form = assignmentFormFromOrder(order({ category: "website", packageKey: "Website (Starting From)", amount: 4999 }));
    expect(form.category).toBe("promotional");
    expect(form.duration).toBe("16s");
  });
});

describe("requirement helpers", () => {
  it("stores nothing rather than a bag of empty strings", () => {
    expect(cleanRequirement({ businessName: "", notes: "  " })).toBeNull();
    expect(cleanRequirement({ businessName: " Sharma ", notes: "" })).toEqual({ businessName: "Sharma" });
  });

  it("shows the custom attire text when there is one, the label otherwise", () => {
    expect(attireLabel("custom", "Red kurta")).toBe("Red kurta");
    expect(attireLabel("custom", "  ")).toBe("Custom");
    expect(attireLabel("traditional")).toBe("Traditional (Designer Saree)");
  });

  it("only offers attire the chosen model can wear", () => {
    expect(attireForGender(ModelGender.MALE, AttireType.TRADITIONAL)).toBe(AttireType.PROFESSIONAL);
    expect(attireForGender(ModelGender.MALE, AttireType.SHIRT_PANT)).toBe(AttireType.SHIRT_PANT);
    expect(attireForGender(ModelGender.FEMALE, AttireType.TRADITIONAL)).toBe(AttireType.TRADITIONAL);
  });

  it("summarises a brief for the Orders queue, skipping what wasn't specified", () => {
    expect(requirementSummary(null)).toEqual([]);
    expect(requirementSummary({ language: "Hindi", aspectRatio: "9:16" })).toEqual(["Hindi", "9:16"]);
  });

  it("fills every blank with the team default", () => {
    const r = withRequirementDefaults(undefined);
    expect(r.language).toBe("Telugu");
    expect(r.aspectRatio).toBe("9:16");
    expect(r.modelGender).toBe(ModelGender.FEMALE);
  });
});
