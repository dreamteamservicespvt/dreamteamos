import { describe, it, expect } from "vitest";
import {
  CHARACTER_VOICEOVER_SYSTEM_PROMPT, CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT,
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT,
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
   * The guard that protects the member's edit: if the reply cannot be parsed as a two-hander we
   * keep the model's text rather than discarding what they asked for. An odd-reading script is
   * recoverable; a lost edit is not.
   */
  it("declines to normalise a reply that is no longer a two-hander", () => {
    expect(canonicalise("clip-1[0-8sec]: One single narrator line with no speakers.")).toBeNull();
    expect(canonicalise("")).toBeNull();
  });
});
