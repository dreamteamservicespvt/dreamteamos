import { describe, it, expect } from "vitest";
import { buildGenerationHistory, normalizeBusinessName, toMillis } from "@/utils/generationHistory";

/**
 * Tools → Ad Generation History used to list one row per SAVE: an ad generated, saved and
 * regenerated appeared three times, under whichever name the AI read off the logo each time.
 * These pin one row per ad, under the job's own name.
 */

const ts = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

describe("buildGenerationHistory", () => {
  it("shows a job generated three times as ONE row, under the job's name, with the newest version", () => {
    const gens = [
      { id: "g1", userId: "m1", businessName: "WOOD CRAFT DECOR", workAssignmentId: "a1", createdAt: ts("2026-09-11T11:58:00") },
      { id: "g2", userId: "m1", businessName: "Wood Craft Decor", workAssignmentId: "a1", createdAt: ts("2026-09-11T12:45:00") },
      { id: "g3", userId: "m1", businessName: "WOOD CRAFT DECOR", workAssignmentId: "a1", createdAt: ts("2026-09-11T12:47:00") },
    ];
    const rows = buildGenerationHistory(gens, [
      { id: "a1", assignedTo: "m1", status: "in_progress", businessName: "Wood Craft Décor", uniqueId: "P101" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessName: "Wood Craft Décor", versions: 3, status: "in_progress", uniqueId: "P101", userId: "m1",
    });
    expect(rows[0].generation?.id).toBe("g3");
  });

  it("treats a later in-place save as the newest moment", () => {
    const gens = [
      { id: "old", workAssignmentId: "a1", createdAt: ts("2026-09-10T10:00:00"), updatedAt: ts("2026-09-11T18:00:00") },
      { id: "new", workAssignmentId: "a1", createdAt: ts("2026-09-11T09:00:00") },
    ];
    const [row] = buildGenerationHistory(gens, [{ id: "a1", businessName: "Shop" }]);
    expect(row.generation?.id).toBe("old");
    expect(row.timestampMs).toBe(Date.parse("2026-09-11T18:00:00"));
  });

  it("links a generation to its job through savedGenerationId when it carries no job id", () => {
    const rows = buildGenerationHistory(
      [{ id: "g9", userId: "m2", businessName: "AI name", createdAt: ts("2026-09-01T10:00:00") }],
      [{ id: "a9", businessName: "Sree Akshara BIG PRINT", savedGenerationId: "g9", status: "verified" }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ businessName: "Sree Akshara BIG PRINT", status: "verified" });
  });

  it("still lists a delivered job that has nothing saved, and not an undelivered one", () => {
    const rows = buildGenerationHistory([], [
      { id: "d1", status: "completed", businessName: "Done Shop", assignedTo: "m1", completedAt: ts("2026-09-05T10:00:00") },
      { id: "d2", status: "in_progress", businessName: "Busy Shop" },
    ]);
    expect(rows.map((r) => r.businessName)).toEqual(["Done Shop"]);
    expect(rows[0].generation).toBeNull();
    expect(rows[0].versions).toBe(0);
  });

  it("collapses a generate-then-save pair made outside a job, but keeps different businesses and days apart", () => {
    const gens = [
      { id: "s1", userId: "admin", businessName: "Udaan Events", createdAt: ts("2026-09-11T10:00:00") },
      { id: "s2", userId: "admin", businessName: "UDAAN EVENTS ", createdAt: ts("2026-09-11T10:03:00") },
      { id: "s3", userId: "admin", businessName: "Dhanalakshmi Mall", createdAt: ts("2026-09-11T10:05:00") },
      { id: "s4", userId: "admin", businessName: "Udaan Events", createdAt: ts("2026-09-12T10:00:00") },
      { id: "s5", userId: "admin", businessName: "Udaan Events", creationMode: "poster", createdAt: ts("2026-09-11T11:00:00") },
    ];
    const rows = buildGenerationHistory(gens, []);
    expect(rows).toHaveLength(4);
    const udaanSameDay = rows.find((r) => r.generation?.id === "s2");
    expect(udaanSameDay?.versions).toBe(2);
    // Newest first.
    expect(rows[0].generation?.id).toBe("s4");
  });

  it("uses the resolver for a name the generation did not store", () => {
    const rows = buildGenerationHistory([{ id: "x", businessName: "Untitled" }], [], () => "From the card");
    expect(rows[0].businessName).toBe("From the card");
  });
});

describe("helpers", () => {
  it("normalises names so case, spacing, accents and punctuation do not split one business", () => {
    expect(normalizeBusinessName(" Wood-Craft  Décor ")).toBe(normalizeBusinessName("WOOD CRAFT DECOR"));
    expect(normalizeBusinessName("శ్రీ అక్షర")).not.toBe("");
  });

  it("reads every timestamp shape", () => {
    expect(toMillis({ seconds: 10 })).toBe(10000);
    expect(toMillis({ toMillis: () => 5 })).toBe(5);
    expect(toMillis(new Date(7))).toBe(7);
    expect(toMillis("2026-09-11T00:00:00Z")).toBe(Date.parse("2026-09-11T00:00:00Z"));
    expect(toMillis(null)).toBe(0);
  });
});
