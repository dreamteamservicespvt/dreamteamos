import { describe, it, expect } from "vitest";
import {
  assignmentFormFromOrder, buildAssignmentRequirementsMessage, cleanRequirement,
  withRequirementDefaults,
} from "@/utils/adRequirement";
import type { Order } from "@/types";

/**
 * The client's note, from the sale to the person building the ad.
 *
 * ── Why it went missing "sometimes" ───────────────────────────────────────────────────────────
 * Three independent leaks, and which one bit you depended on what was sold and how it was assigned:
 *
 *  1. The sale only built a `requirement` object for AD categories. A Custom sale — which is how a
 *     two-minute promotional ad is recorded, and which reaches the tech team AS a promotional ad —
 *     dropped the note at source. Plain promotional/wishes/cinematic kept it. That alone makes the
 *     bug look random from the outside.
 *  2. The note was displayed nowhere in the app. It existed only inside the WhatsApp requirements
 *     message the tech admin copies out by hand, so it survived only if somebody pressed send.
 *  3. The split-assign dialog (a social-media month, a bulk batch) builds no such message at all,
 *     so for those jobs there was nothing to send in the first place.
 *
 * These pin the data path. The two display fixes are in MyWork and services/workAssign.
 */

const NOTE = "Client wants the shop front in the first clip and the offer said twice.";

const order = (patch: Partial<Order> = {}): Order => ({
  id: "o1",
  category: "promotional",
  packageKey: "32s",
  amount: 4999,
  businessName: "Sharma Electronics",
  clientPhone: "+919876543210",
  requirement: { notes: NOTE, businessName: "Sharma Electronics", language: "Telugu" },
  ...patch,
} as unknown as Order);

describe("the note surviving the sale", () => {
  it("is kept by cleanRequirement when the member typed one", () => {
    const r = cleanRequirement({ businessName: "Sharma", notes: NOTE });
    expect(r?.notes).toBe(NOTE);
  });

  it("is stored for a NON-ad sale too, which is where it used to vanish", () => {
    // A Google Business Profile, a website, a Custom sale. `requirement` used to be null for all
    // of these — and a Custom sale is how a two-minute promotional ad gets recorded, so the note
    // was lost on a job that reaches the tech team as an ordinary ad.
    const r = cleanRequirement({ businessName: "Sharma", notes: NOTE });
    expect(r).not.toBeNull();
    expect(r?.notes).toBe(NOTE);
  });

  it("stores nothing at all when the member typed nothing", () => {
    // The other half of the contract: an untouched brief must stay null, not become a bag of "".
    expect(cleanRequirement({ businessName: "", notes: "" })).toBeNull();
  });

  it("survives a round trip through the defaults", () => {
    expect(withRequirementDefaults({ notes: NOTE }).notes).toBe(NOTE);
    expect(withRequirementDefaults(null).notes).toBe("");
  });
});

describe("the note reaching the assignment form", () => {
  it("pre-fills the tech admin's form from the order", () => {
    expect(assignmentFormFromOrder(order()).requirementNotes).toBe(NOTE);
  });

  it("survives a Custom sale that resolves to a real ad category", () => {
    const custom = order({ category: "custom", customBaseCategory: "promotional" });
    const form = assignmentFormFromOrder(custom);
    expect(form.requirementNotes).toBe(NOTE);
    // …and it really is being assigned as an ad, which is why losing the note mattered.
    expect(form.category).toBe("promotional");
  });

  it("survives a bulk order", () => {
    const bulk = order({ category: "bulk_ads", bulkAdType: "cinematic", quantity: 10 });
    expect(assignmentFormFromOrder(bulk).requirementNotes).toBe(NOTE);
  });

  it("is empty rather than undefined when the sale carried no note", () => {
    expect(assignmentFormFromOrder(order({ requirement: null })).requirementNotes).toBe("");
  });
});

describe("the note in the message the member is sent", () => {
  const base = { category: "promotional", duration: "32s", clipCount: 4 };

  it("appears under a heading the member can find", () => {
    const msg = buildAssignmentRequirementsMessage({ ...base, requirementNotes: NOTE });
    expect(msg).toContain("Client notes");
    expect(msg).toContain(NOTE);
  });

  it("is carried whatever else the job is — pack, occasion or plain", () => {
    for (const extra of [
      {},
      { characterPack: "motu_patlu", realLocationProvided: true },
      { festival: "Diwali" },
      { modelGender: "female", attireType: "traditional" },
    ]) {
      const msg = buildAssignmentRequirementsMessage({ ...base, ...extra, requirementNotes: NOTE });
      expect(msg).toContain(NOTE);
    }
  });

  it("leaves the heading out entirely when there is no note", () => {
    const msg = buildAssignmentRequirementsMessage({ ...base, requirementNotes: "" });
    expect(msg).not.toContain("Client notes");
  });

  it("does not lose a multi-line note", () => {
    const multi = "Line one\nLine two\nLine three";
    expect(buildAssignmentRequirementsMessage({ ...base, requirementNotes: multi })).toContain(multi);
  });
});
