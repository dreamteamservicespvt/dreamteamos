import { describe, it, expect } from "vitest";
import { describeSpecChanges, specOf, specSignature } from "@/utils/assignmentSpecDiff";
import type { WorkAssignment } from "@/types";

/**
 * When an admin corrects a job that is already out, the member holding it used to carry on with
 * the brief they were handed and produce the wrong ad — nobody found out until delivery.
 *
 * This comparison decides whether someone gets interrupted mid-work, so it has to fire on every
 * change that alters what they must produce, and on nothing else.
 */

const assignment = (over: Partial<WorkAssignment> = {}): WorkAssignment => ({
  id: "w1", category: "promotional", duration: "32s", clipCount: 4,
  businessName: "Sharma Electronics", modelGender: "female", attireType: "traditional",
  aspectRatio: "9:16", language: "Telugu", status: "assigned", assignedTo: "m1",
  ...over,
} as unknown as WorkAssignment);

const changesBetween = (a: Partial<WorkAssignment>, b: Partial<WorkAssignment>) =>
  describeSpecChanges(specOf(assignment(a)), specOf(assignment(b)));

describe("describeSpecChanges", () => {
  it("says nothing when the spec has not moved", () => {
    expect(changesBetween({}, {})).toEqual([]);
  });

  it("reports a change as a change, in the member's own words", () => {
    const [change] = changesBetween({ attireType: "traditional" }, { attireType: "professional" });
    expect(change).toEqual({
      label: "Attire",
      from: "Traditional (Designer Saree)",
      to: "Professional (Formal Suit)",
    });
  });

  it("catches every field that alters what must be produced", () => {
    const labels = changesBetween(
      {},
      {
        businessName: "New Business", category: "cinematic", duration: "16s", clipCount: 2,
        modelGender: "male", attireType: "professional", aspectRatio: "16:9",
        language: "Hindi", requirementNotes: "Mention the Diwali offer",
      },
    ).map(c => c.label);

    expect(labels).toEqual([
      "Business", "Category", "Duration", "Model", "Attire", "Aspect ratio", "Language", "Client notes",
    ]);
  });

  it("spells out the duration as the length and the clips it buys", () => {
    const [change] = changesBetween({ duration: "32s", clipCount: 4 }, { duration: "16s", clipCount: 2 });
    expect(change).toEqual({ label: "Duration", from: "32s (4 clips)", to: "16s (2 clips)" });
  });

  it("names the special category being switched on or off", () => {
    const on = changesBetween({}, { characterPack: "motu_patlu" });
    expect(on.find(c => c.label === "Special category")).toEqual({
      label: "Special category", from: "Normal ad (with a model)", to: "Motu & Patlu",
    });
  });

  it("reports the background switching on a pack ad", () => {
    const [change] = changesBetween(
      { characterPack: "motu_patlu", realLocationProvided: true },
      { characterPack: "motu_patlu", realLocationProvided: false },
    );
    expect(change).toEqual({
      label: "Background",
      from: "Client's own business background",
      to: "AI-created background",
    });
  });

  /**
   * A pack ad has no human model, so reporting "Attire: Saree → Suit" would describe someone who
   * never appears in the ad — and send the member looking for a wardrobe field that is not there.
   */
  it("never reports model or attire on a pack ad", () => {
    const labels = changesBetween(
      { characterPack: "motu_patlu", modelGender: "female", attireType: "traditional" },
      { characterPack: "motu_patlu", modelGender: "male", attireType: "professional" },
    ).map(c => c.label);
    expect(labels).not.toContain("Model");
    expect(labels).not.toContain("Attire");
  });

  it("still reports the model when a pack ad is switched back to a normal one", () => {
    const labels = changesBetween({ characterPack: "motu_patlu" }, { characterPack: "", modelGender: "male" })
      .map(c => c.label);
    expect(labels).toContain("Special category");
    expect(labels).toContain("Model");
  });

  it("treats two different custom attire descriptions as a change", () => {
    const [change] = changesBetween(
      { attireType: "custom", customAttire: "White lab coat" },
      { attireType: "custom", customAttire: "Chef whites" },
    );
    expect(change).toMatchObject({ label: "Attire", from: "White lab coat", to: "Chef whites" });
  });
});

/**
 * Every Firestore snapshot replaces the assignment object. Without a signature over the spec
 * fields alone, a ticking session timer would raise a "your spec changed" dialog every few seconds.
 */
describe("specSignature", () => {
  it("is unchanged by the things that move constantly while someone works", () => {
    const before = specSignature(specOf(assignment({ status: "assigned", totalDurationSeconds: 0 } as Partial<WorkAssignment>)));
    const after = specSignature(specOf(assignment({
      status: "in_progress", totalDurationSeconds: 900, sessions: [{}],
    } as unknown as Partial<WorkAssignment>)));
    expect(before).toBe(after);
  });

  it("changes the moment a spec field does", () => {
    const before = specSignature(specOf(assignment()));
    expect(specSignature(specOf(assignment({ aspectRatio: "16:9" })))).not.toBe(before);
    expect(specSignature(specOf(assignment({ requirementNotes: "new note" })))).not.toBe(before);
    expect(specSignature(specOf(assignment({ clipCount: 8 })))).not.toBe(before);
  });

  it("is stable for an absent assignment", () => {
    expect(specSignature(specOf(null))).toBe(specSignature(specOf(undefined)));
  });
});
