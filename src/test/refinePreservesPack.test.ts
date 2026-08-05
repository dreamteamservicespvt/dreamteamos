import { describe, it, expect } from "vitest";
import {
  CHARACTER_VOICEOVER_SYSTEM_PROMPT, CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT,
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, CHARACTER_VOICEOVER_REFINE_SYSTEM_PROMPT,
} from "@/services/prompts/characterAd";
import { VOICEOVER_SYSTEM_PROMPT, VEO_SEGMENT_SYSTEM_PROMPT } from "@/services/prompts";
import { getCharacterPack, packSpeakers, packSpeakerAliases, packNameSpellings } from "@/services/characterPacks";
import { parseDialogueClips, formatDialogueScript, applyNameSpellings } from "@/utils/dialogueFormat";

/**
 * Refining a special-category ad used to hand the content to the HUMAN-MODEL prompts, so the editor
 * was told the script it was looking at should be one voice — and it dutifully flattened the
 * two-character exchange into an ordinary voice-over. These pin the two halves of the fix: the
 * right prompt is chosen, and whatever comes back is put into canonical shape.
 */

const pack = getCharacterPack("motu_patlu")!;
const speakers = packSpeakers(pack);

describe("the prompt a refine is given", () => {
  it("differs between a pack ad and a normal one — voice-over", () => {
    const packPrompt = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 16, 2, "commercial", "", "Telugu");
    const normal = VOICEOVER_SYSTEM_PROMPT(16, 2, "commercial", "", "Telugu", "female");
    expect(packPrompt).toContain("Motu");
    expect(normal).not.toMatch(/motu|patlu/i);
  });

  /**
   * The generator prompt ends by asking for a script to be written, and a model handed a script
   * plus "write the clips now" writes a new one — which is where the two-hander was being lost.
   * A refine gets a prompt that asks for an EDIT and nothing else.
   */
  describe("a pack voice-over refine gets an edit prompt, not the generator", () => {
    const refine = CHARACTER_VOICEOVER_REFINE_SYSTEM_PROMPT(pack, 2, "Telugu");

    it("names both characters and the two-line contract", () => {
      expect(refine).toContain("Motu");
      expect(refine).toContain("Patlu");
      expect(refine).toContain("EXACTLY 2 lines in every clip");
      expect(refine).toContain("EXACTLY 2 clips");
    });

    it("forbids the flattening that caused the bug", () => {
      expect(refine).toContain("NEVER collapse the two into one voice");
      expect(refine).toContain("NEVER convert this into a narrator's voice-over");
    });

    it("never tells the model to write a script", () => {
      // The exact instruction that turned an edit into a regeneration.
      expect(refine).not.toMatch(/write the \d+ clips now/i);
      expect(refine).toContain("You are NOT writing a new script");
    });
  });

  it("differs between a pack ad and a normal one — Veo", () => {
    const packPrompt = CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, 2, "9:16");
    const normal = VEO_SEGMENT_SYSTEM_PROMPT(2, "female");
    expect(packPrompt).toContain("Animate the attached frame");
    expect(normal).not.toMatch(/motu|patlu/i);
  });

  /**
   * The frame branch mattered most: the human-model prompt would have rewritten a cartoon ad as a
   * woman in a designer saree.
   */
  it("keeps a pack's frame refine away from the human-model rules", () => {
    const framePrompt = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, {
      segmentCount: 2, clipSummaries: [], locationMode: "ai_generated", locationPlan: "",
      aspectRatio: "9:16", adType: "commercial",
    });
    expect(framePrompt).toContain("Motu and Patlu");
    expect(framePrompt.toLowerCase()).not.toContain("saree");
    expect(framePrompt.toLowerCase()).not.toContain("attire");
  });
});

/**
 * The editor is ASKED to preserve the layout, which is not the same as guaranteed. Whatever it
 * returns is re-parsed and re-formatted, so the clip header keeps the colon the AI Platform's
 * splitter needs and the names keep their fixed spellings.
 */
describe("normalising what a refine returns", () => {
  const aliases = packSpeakerAliases(pack);
  const canonicalise = (raw: string) => {
    const clips = parseDialogueClips(raw, aliases);
    if (clips.length === 0 || !clips.every(c => c.length === speakers.length)) return null;
    return formatDialogueScript(applyNameSpellings(clips, packNameSpellings(pack, "Telugu")), speakers);
  };

  it("restores the clip header the splitter needs, however it was written back", () => {
    const sloppy = "clip-1 [0-8 sec]\nMotu: పట్లు ఇది బాగుంది.\nPatlu: అవును మంచిది.";
    const out = canonicalise(sloppy)!;
    expect(out).toContain("clip-1[0-8sec]:");
    expect(out).toContain("[Motu]:");
    expect(out).toContain("[Patlu]:");
  });

  it("re-applies the fixed Telugu spellings the editor may have changed", () => {
    const drifted = "clip-1[0-8sec]:\n  [Motu]: పతలూ ఇది బాగుంది.\n  [Patlu]: అవును మంచిది.";
    const out = canonicalise(drifted)!;
    expect(out).toContain("పట్లు");
    expect(out).not.toContain("పతలూ");
  });

  it("keeps both speakers and their order across the round trip", () => {
    const out = canonicalise("clip-1[0-8sec]:\n  [Motu]: A line here.\n  [Patlu]: Another line.")!;
    // The clip header also ends in "]:", so match the speaker labels themselves.
    const lines = out.split("\n").filter(l => /\[(Motu|Patlu)\]:/.test(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("[Motu]:");
    expect(lines[1]).toContain("[Patlu]:");
  });

  /**
   * The guard that decides whether a reply may replace the member's ad at all.
   *
   * A reply that has lost the two-hander is rejected — the caller retries once and then keeps the
   * ORIGINAL script. Accepting it, which is what used to happen, meant a Motu & Patlu ad silently
   * becoming an ordinary single-voice promotional script: the thing the client paid for, gone.
   */
  it("declines to normalise a reply that is no longer a two-hander", () => {
    expect(canonicalise("clip-1[0-8sec]: One single narrator line with no speakers.")).toBeNull();
    expect(canonicalise("")).toBeNull();
  });

  it("rejects a reply that dropped one of the two characters", () => {
    expect(canonicalise("clip-1[0-8sec]:\n  [Motu]: Only one of them speaks here.")).toBeNull();
  });
});
