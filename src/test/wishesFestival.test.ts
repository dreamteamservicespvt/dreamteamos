import { describe, it, expect } from "vitest";
import {
  CUSTOM_FESTIVAL_OPTION, WISHES_FESTIVALS, isListedFestival,
} from "@/utils/festivals";
import {
  assignmentFormFromOrder, buildAssignmentRequirementsMessage, cleanRequirement,
  requirementSummary, withRequirementDefaults,
} from "@/utils/adRequirement";
import { describeSpecChanges, specOf, specSignature } from "@/utils/assignmentSpecDiff";
import type { Order, WorkAssignment } from "@/types";

/**
 * The occasion a greeting video is for.
 *
 * It decides the wardrobe, the decorations, the colours and the script — the generator themes the
 * entire ad from it — so it is captured on the call and has to survive the whole trip to the member
 * who builds the video. These pin each hop of that trip.
 */

const order = (requirement: Record<string, unknown> | null, over: Partial<Order> = {}): Order => ({
  id: "o1", clientPhone: "+919876543210", clientPhoneId: "919876543210",
  businessName: "Sharma Sweets", category: "wishes", packageKey: "20 Seconds", amount: 499,
  leadId: "l1", saleItemIndex: 0, saleItemKey: "l1__0", saleSubmittedAtMs: 0,
  soldBy: "s1", soldByName: "Asha", fromAd: true, salesAdminId: "sa1", promise: null,
  requirement: requirement as Order["requirement"],
  status: "unassigned", createdAt: null, updatedAt: null,
  ...over,
});

describe("the occasion list", () => {
  it("is shared, so a sale and the generator name the same festival", () => {
    // The generator has hand-written treatments keyed by these exact names
    // (services/prompts.getFestivalTheme); a second list would drift and theme the wrong ad.
    for (const f of ["Diwali", "Ganesh Chaturthi", "Bathukamma", "Ugadi", "Sankranthi"]) {
      expect(WISHES_FESTIVALS).toContain(f);
    }
  });

  it("knows what it offers, so a typed occasion can be told from a picked one", () => {
    expect(isListedFestival("Diwali")).toBe(true);
    expect(isListedFestival("diwali")).toBe(true); // case is the member's, not ours
    expect(isListedFestival("Shop 5th anniversary")).toBe(false);
    expect(isListedFestival("")).toBe(false);
    expect(isListedFestival(undefined)).toBe(false);
  });

  it("keeps the custom sentinel out of the real options", () => {
    expect(WISHES_FESTIVALS).not.toContain(CUSTOM_FESTIVAL_OPTION);
  });
});

describe("the occasion on a sale", () => {
  it("is stored when given and absent when not", () => {
    expect(cleanRequirement({ language: "Telugu", festival: "Diwali" })?.festival).toBe("Diwali");
    // A promotional sale writes it blank; a blank must not become a field on the order.
    expect(cleanRequirement({ language: "Telugu", festival: "" })?.festival).toBeUndefined();
  });

  it("has no default — a wrongly themed greeting is worse than an unthemed one", () => {
    expect(withRequirementDefaults(null).festival).toBe("");
    expect(withRequirementDefaults({ festival: "  Onam  " }).festival).toBe("Onam");
  });

  it("leads the brief summary on the Orders card", () => {
    const chips = requirementSummary({ language: "Telugu", festival: "Diwali", aspectRatio: "9:16" });
    expect(chips[0]).toBe("🎊 Diwali");
  });

  it("says nothing on an ad that has no occasion", () => {
    expect(requirementSummary({ language: "Telugu", aspectRatio: "9:16" }).join()).not.toContain("🎊");
  });
});

describe("the occasion reaching the tech team", () => {
  it("pre-fills the assignment form from the sale", () => {
    const form = assignmentFormFromOrder(order({ language: "Telugu", festival: "Ganesh Chaturthi" }));
    expect(form.category).toBe("wishes");
    expect(form.festival).toBe("Ganesh Chaturthi");
  });

  it("survives a bulk wishes order — ten Diwali videos are still Diwali videos", () => {
    const form = assignmentFormFromOrder(order(
      { language: "Telugu", festival: "Diwali" },
      { category: "bulk_ads", bulkAdType: "wishes", quantity: 10, packageKey: "20 Seconds" },
    ));
    expect(form.category).toBe("wishes");
    expect(form.festival).toBe("Diwali");
  });

  it("is dropped when the job is not a greeting video", () => {
    // Someone changing the sale's category must not leave a festival themed onto a promotional ad.
    const form = assignmentFormFromOrder(order(
      { language: "Telugu", festival: "Diwali" },
      { category: "promotional", packageKey: "30 Seconds + Poster" },
    ));
    expect(form.category).toBe("promotional");
    expect(form.festival).toBe("");
  });

  it("is in the WhatsApp brief the member is sent", () => {
    const msg = buildAssignmentRequirementsMessage({
      businessName: "Sharma Sweets", category: "wishes", duration: "20s", clipCount: 2,
      language: "Telugu", festival: "Diwali", accessCode: "1234",
    });
    expect(msg).toContain("🎊 *Occasion:* Diwali");
  });

  it("is left out of a brief that has no occasion", () => {
    const msg = buildAssignmentRequirementsMessage({
      businessName: "Sharma Sweets", category: "promotional", duration: "32s", clipCount: 4,
      language: "Telugu",
    });
    expect(msg).not.toContain("Occasion:");
  });
});

describe("the occasion changing under a member mid-job", () => {
  const assignment = (festival?: string) => specOf({ category: "wishes", festival } as WorkAssignment);

  it("counts as a spec change worth interrupting for", () => {
    const changes = describeSpecChanges(assignment("Diwali"), assignment("Ugadi"));
    expect(changes).toContainEqual({ label: "Occasion", from: "Diwali", to: "Ugadi" });
  });

  it("moves the signature, so the change is actually noticed", () => {
    expect(specSignature(assignment("Diwali"))).not.toBe(specSignature(assignment("Ugadi")));
  });

  it("does not fire when nothing about the occasion moved", () => {
    expect(describeSpecChanges(assignment("Diwali"), assignment("Diwali"))).toEqual([]);
  });
});
