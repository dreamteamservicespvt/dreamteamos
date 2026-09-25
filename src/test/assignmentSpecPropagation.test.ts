import { describe, expect, it } from "vitest";
import { assignmentFormSpec, jobKitSpec, kitSpec, staleKitChanges } from "@/utils/assignmentFormSpec";
import { briefEditFieldsOf, briefPatch, categoryDependentPatch, posterEditFieldsOf } from "@/utils/assignmentEdit";
import { briefAsInstructions, mergeBriefIntoInstructions } from "@/utils/adRequirement";
import { describeSpecChanges, specOf, specSignature } from "@/utils/assignmentSpecDiff";
import { AdType, AttireType, ModelGender } from "@/types/aiPlatform";
import type { WorkAssignment } from "@/types";

const job = (patch: Partial<WorkAssignment> = {}): WorkAssignment => ({
  id: "a1", assignedTo: "m1", assignedBy: "admin", category: "promotional", clipCount: 4, includesEndCredits: true,
  duration: "32s", pricePerUnit: 0, totalPrice: 0, uniqueId: "P12", accessCode: "1234", displayTitle: "Sri Sai",
  status: "in_progress", sessions: [], totalDurationSeconds: 0, date: "2026-09-25",
  modelGender: "female", attireType: "traditional", aspectRatio: "9:16", language: "Telugu",
  ...patch,
} as WorkAssignment);

describe("the job decides the generator's form", () => {
  it("puts every field the job states on the form", () => {
    const { form, festivalPicker } = assignmentFormSpec(job({
      category: "wishes", festival: "Diwali", attireType: "professional", aspectRatio: "16:9", language: "Hindi",
      characterPack: "normal_female", realLocationProvided: true,
    }));
    expect(form).toMatchObject({
      duration: 32, adType: AdType.FESTIVAL, gender: ModelGender.FEMALE, attireType: AttireType.PROFESSIONAL,
      aspectRatio: "16:9", language: "Hindi", festivalName: "Diwali", characterPack: "normal_female", locationMode: "real_provided",
    });
    expect(festivalPicker).toEqual({ option: "Diwali", custom: "" });
  });

  /**
   * The fault: a kit restored from when the job was a Motu & Patlu ad brought the duo back after the
   * admin had changed it to a normal ad. The job's "no special category" is a value, and it is applied.
   */
  it("clears a special category the job no longer has", () => {
    expect(assignmentFormSpec(job({ characterPack: "" })).form.characterPack).toBeUndefined();
    expect("characterPack" in assignmentFormSpec(job()).form).toBe(true);
  });

  it("leaves the fields an older job never stated to the member", () => {
    const { form } = assignmentFormSpec(job({ modelGender: undefined, attireType: undefined, aspectRatio: undefined, language: undefined }));
    expect(form).not.toHaveProperty("gender");
    expect(form).not.toHaveProperty("attireType");
    expect(form).not.toHaveProperty("aspectRatio");
    expect(form).not.toHaveProperty("language");
  });
});

describe("a kit made for an older version of the job", () => {
  const settingsFor = (a: WorkAssignment) => ({
    adType: a.category === "wishes" ? AdType.FESTIVAL : AdType.COMMERCIAL, festivalName: a.festival || "",
    gender: a.modelGender, attireType: a.attireType, aspectRatio: a.aspectRatio, language: a.language,
    characterPack: a.characterPack || "", locationMode: a.realLocationProvided ? "real_provided" : "ai_generated",
  });

  it("matches the job it was made for", () => {
    const a = job({ realLocationProvided: false });
    expect(staleKitChanges(kitSpec(settingsFor(a), 4), jobKitSpec(a))).toEqual([]);
  });

  it("says exactly what the admin changed since", () => {
    const before = job({ realLocationProvided: false });
    const after = job({ realLocationProvided: false, attireType: "professional", aspectRatio: "16:9" });
    const changes = staleKitChanges(kitSpec(settingsFor(before), 4), jobKitSpec(after));
    expect(changes.map((c) => c.label)).toEqual(["Attire", "Aspect ratio"]);
    expect(changes[0].to).toMatch(/Suit|Professional/i);
  });

  it("never compares a field the job leaves open or an old save never stored", () => {
    const a = job({ attireType: undefined });
    expect(staleKitChanges(kitSpec({ ...settingsFor(a), attireType: AttireType.CUSTOM, aspectRatio: undefined }, 4), jobKitSpec(a))).toEqual([]);
  });

  it("notices a change of clip count and of occasion", () => {
    const before = job({ category: "wishes", festival: "Diwali" });
    const after = job({ category: "wishes", festival: "Ugadi", clipCount: 6, duration: "48s" });
    const labels = staleKitChanges(kitSpec(settingsFor(before), 4), jobKitSpec(after)).map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["Duration", "Occasion"]));
  });
});

describe("what an edit dialog writes back", () => {
  it("writes the occasion of a wishes ad — it used to be saved only for posters", () => {
    const patch = categoryDependentPatch({
      category: "wishes", duration: "32s", modelGender: ModelGender.FEMALE, attireType: AttireType.TRADITIONAL,
      customAttire: "", aspectRatio: "9:16", characterPack: "", realLocationProvided: false,
      ...posterEditFieldsOf({ festival: " Ugadi " }),
    });
    expect(patch.festival).toBe("Ugadi");
  });

  it("writes the brief whole, so a cleared address is really cleared", () => {
    const form = briefEditFieldsOf({ businessInfo: "Two-wheeler service", businessAddress: "Main Road", requirementNotes: "" });
    expect(briefPatch({ ...form, businessAddress: "  " })).toEqual({
      businessInfo: "Two-wheeler service", businessAddress: "", requirementNotes: "",
    });
  });

  it("tells the member when the business info or the address changed", () => {
    const before = specOf(job({ businessInfo: "Bike service", businessAddress: "Main Road" }));
    const after = specOf(job({ businessInfo: "Bike service", businessAddress: "RTC Complex, Kakinada" }));
    expect(specSignature(before)).not.toBe(specSignature(after));
    expect(describeSpecChanges(before, after)).toEqual([{ label: "Address", from: "Main Road", to: "RTC Complex, Kakinada" }]);
    // A job with no brief signs exactly as before the brief was compared.
    expect(specSignature(specOf(job()))).not.toContain("brief");
  });
});

describe("the job's brief in BUSINESS CONTENT", () => {
  it("carries the business name and the client's notes too", () => {
    expect(briefAsInstructions("Bike service", "Main Road", { businessName: "Sri Sai", notes: "Mention the free wash" })).toBe(
      "Business name: Sri Sai\n\nBusiness info & what to include (from the sale):\nBike service\n\nAddress: Main Road\n\nClient's notes (from the sale):\nMention the free wash",
    );
    // …and, with nothing but a name, says nothing — a name alone is not a brief.
    expect(briefAsInstructions("", "", { businessName: "Sri Sai" })).toBe("");
  });

  it("reaches a member who has already written in the box", () => {
    const old = briefAsInstructions("Bike service", "Main Road");
    const next = briefAsInstructions("Bike service", "RTC Complex");
    expect(mergeBriefIntoInstructions("", old, next)).toBe(next);
    expect(mergeBriefIntoInstructions(old, old, next)).toBe(next);
    // The member's own line stays, the brief inside it is replaced where it stands.
    expect(mergeBriefIntoInstructions(`${old}\n\nOffer: 20% off`, old, next)).toBe(`${next}\n\nOffer: 20% off`);
    // Rewritten beyond recognition: the corrected brief goes on top, their text below.
    expect(mergeBriefIntoInstructions("My own notes", old, next)).toBe(`${next}\n\nMy own notes`);
    // Nothing new: nothing changes.
    expect(mergeBriefIntoInstructions(`${next}\n\nx`, next, next)).toBe(`${next}\n\nx`);
  });
});
