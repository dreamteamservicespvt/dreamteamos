import { describe, it, expect } from "vitest";
import { CHARACTER_CATALOGUE } from "@/services/characterCatalogue";
import {
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT,
  CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT,
  CHARACTER_VOICEOVER_REFINE_SYSTEM_PROMPT,
  CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT,
  CHARACTER_VOICEOVER_SYSTEM_PROMPT,
} from "@/services/prompts/characterAd";

/**
 * Every prompt builder, against every catalogue entry.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────────────────────
 * The catalogue grew from one two-speaker pack to thirty-two entries, twenty-three of which have a
 * SINGLE speaker. Five separate builders in characterAd.ts destructure `[first, second]` and then
 * read `second.name`. Only the first of them was made cast-aware, and the test written at the time
 * covered only that one — so the other four still threw
 *
 *     Cannot read properties of undefined (reading 'name')
 *
 * for every deity, every solo cartoon and every Real Owner Face job. It reached a member as
 * "Ad Generation Failed", with their work dead and no way past it.
 *
 * A per-builder test would have missed it exactly the same way. What catches this class of bug is
 * the cross product: thirty-two entries times five builders is cheap, and it is the only thing that
 * proves adding a catalogue entry cannot take the generator down.
 */

const CLIPS = 4;
const SUMMARIES = ["clip one", "clip two", "clip three", "clip four"];

/** Every builder, called the way geminiService calls it. */
const BUILDERS: [string, (p: typeof CHARACTER_CATALOGUE[number]) => string][] = [
  ["voiceover", (p) => CHARACTER_VOICEOVER_SYSTEM_PROMPT(p, 32, CLIPS, "commercial", "", "Telugu", "Bodhan")],
  ["refine", (p) => CHARACTER_VOICEOVER_REFINE_SYSTEM_PROMPT(p, CLIPS, "Telugu")],
  ["repair", (p) => CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(p, 32, CLIPS, "Telugu", "Bodhan")],
  ["veo", (p) => CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(p, CLIPS, "9:16")],
  ["multiFrame", (p) => CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(p, {
    segmentCount: CLIPS,
    clipSummaries: SUMMARIES,
    locationMode: "ai_generated",
    locationPlan: "",
    aspectRatio: "9:16",
    adType: "commercial",
    festivalName: "",
    businessContext: "{}",
  })],
];

/**
 * An unresolved CODE template means a branch never closed.
 *
 * Matched against the variable names rather than a bare "${", because the Veo prompt deliberately
 * prints a placeholder of that shape as the thing it wants the model to fill in.
 */
const LEAKS = ["${first", "${second", "${pack", "${solo", "${cast"];

describe("every prompt builder, for every entry in the catalogue", () => {
  for (const [name, build] of BUILDERS) {
    it(`${name} never throws`, () => {
      for (const pack of CHARACTER_CATALOGUE) {
        // The regression this pins: an unguarded `pack.characters[1]` on a one-speaker entry.
        expect(() => build(pack), `${name} threw for ${pack.id}`).not.toThrow();
      }
    });

    it(`${name} renders a usable prompt for every entry`, () => {
      for (const pack of CHARACTER_CATALOGUE) {
        const out = build(pack);
        const where = `${name}/${pack.id}`;
        expect(out, where).toBeTruthy();
        // A template that silently renders "undefined" still produces a prompt, still reaches a
        // member and still generates a video — it just quietly drops what should have been there.
        expect(out, where).not.toContain("undefined");
        expect(out, where).not.toContain("[object Object]");
        for (const leak of LEAKS) expect(out, `${where} leaked ${leak}`).not.toContain(leak);
        expect(out, where).toContain(pack.characters[0].name);
      }
    });
  }

  it("never asks a single character to reply to themselves", () => {
    // The solo fallback makes `second` the same person as `first`, which stops the crash but would
    // otherwise render "X says … then X replies" — an instruction with no possible correct output.
    for (const pack of CHARACTER_CATALOGUE.filter((p) => p.characters.length === 1)) {
      const name = pack.characters[0].name;
      const veo = CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, CLIPS, "9:16");
      expect(veo, pack.id).not.toContain(`Then ${name} replies`);
    }
  });

  it("covers a one-speaker entry in every family that has one", () => {
    // Guards the guard: if the catalogue ever lost its solo entries this suite would still pass
    // while proving nothing about the crash it exists for.
    const solo = CHARACTER_CATALOGUE.filter((p) => p.characters.length === 1);
    expect(solo.length).toBeGreaterThan(20);
    for (const family of ["god", "solo", "human", "custom"]) {
      expect(solo.some((p) => p.family === family), family).toBe(true);
    }
  });
});
