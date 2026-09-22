import { describe, it, expect } from "vitest";
import { clipPlacements, spokenOnly, withPlacements } from "@/utils/clipPlacement";
import { MULTI_FRAME_SYSTEM_PROMPT } from "@/services/prompts";
import { CHARACTER_MULTI_FRAME_SYSTEM_PROMPT } from "@/services/prompts/characterAd";
import { getCharacterPack } from "@/services/characterPacks";
import { planClipMotion } from "@/services/prompts/motion";

/**
 * A B-roll image and an overlay were both generated per clip, and neither said WHERE it goes: the
 * editor had to hold the script in their head. The placement is computed from the script itself, so
 * what the member reads on screen can never drift from the clip the image was written for.
 */

const script = [
  "0-8: మీ బైక్ సర్వీస్ సాయంత్రానికే రెడీ.",
  "8-16: మా దగ్గర ఒరిజినల్ పార్ట్స్ మాత్రమే వాడతాం.",
  "16-24: ఈ నెలలో ఫ్రీ ఇంజిన్ ఆయిల్ చెక్.",
  "24-32: ఇప్పుడే కాల్ చేయండి.",
].join("\n");

describe("where each clip sits in the edit", () => {
  it("gives every clip its number, its seconds and its spoken line", () => {
    const placements = clipPlacements(script);
    expect(placements).toHaveLength(4);
    expect(placements[1]).toMatchObject({ clip: 2, start: 8, end: 16, timing: "Clip 2 · 8–16s" });
    expect(placements[1].line).toContain("ఒరిజినల్ పార్ట్స్");
    expect(placements[3].timing).toBe("Clip 4 · 24–32s");
  });

  it("still gives the timing when the script cannot be read into clips", () => {
    expect(clipPlacements("just some loose text", 2).map((p) => p.timing))
      .toEqual(["Clip 1 · 0–8s", "Clip 2 · 8–16s"]);
    expect(clipPlacements("", 0)).toEqual([]);
  });

  it("reads a two-character clip, labels and all", () => {
    const dialogue = "clip-1[0-8sec]:\n  [Motu]:  ఎంత బాగున్నాయి!\n  [Patlu]: ఇది లక్ష్మీ స్వీట్స్.";
    const [placement] = clipPlacements(dialogue);
    expect(placement.line).toContain("[Motu]");
    expect(spokenOnly(placement.line)).toBe("ఎంత బాగున్నాయి! ఇది లక్ష్మీ స్వీట్స్.");
  });
});

describe("stamping the placement onto what the model returned", () => {
  const placements = clipPlacements(script);

  it("matches a B-roll image to its own clip", () => {
    const stamped = withPlacements(
      [{ id: 1, concept: "Bike ready" }, { id: 2, concept: "Genuine parts" }],
      placements,
    );
    expect(stamped[1]).toMatchObject({ concept: "Genuine parts", clip: 2, timing: "Clip 2 · 8–16s" });
    expect(stamped[1].line).toContain("ఒరిజినల్ పార్ట్స్");
  });

  it("matches overlays by their clip, several to one clip", () => {
    const stamped = withPlacements(
      [{ clip: 3, text: "Free oil check" }, { clip: 3, text: "This month" }],
      placements,
      (item) => item.clip,
    );
    expect(stamped.map((o) => o.timing)).toEqual(["Clip 3 · 16–24s", "Clip 3 · 16–24s"]);
  });

  // A model that answers with a clip number nobody asked for still has to land somewhere sensible.
  it("falls back to the item's own position when the clip is unusable", () => {
    const stamped = withPlacements([{ concept: "a" }, { id: "nine", concept: "b" }], placements);
    expect(stamped[0].clip).toBe(1);
    expect(stamped[1].clip).toBe(2);
  });
});

/**
 * The background used to jump to an unrelated zone every clip, which broke the flow of the video.
 * All the clips are one walk through one space now.
 */
/**
 * One place, a different background in every clip.
 *
 * The frames used to be told "ONE CONTINUOUS WALK — only the angle changes", which is exactly why the
 * backgrounds repeated clip after clip. Now every clip is a different part of the same place, chosen by
 * its own line, and nobody walks between them.
 */
describe("one place, a different background per clip", () => {
  it("tells a model ad every clip has its own background, in the same place", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, ["a", "b", "c", "d"], "", "female", "", false, "", undefined, planClipMotion(4, "commercial"));
    expect(p).toContain("EVERY CLIP HAS ITS OWN BACKGROUND, CHOSEN BY ITS LINE");
    expect(p).toContain("No two clips may show the same corner, the same wall or the same set-up");
    expect(p).toContain("4 DIFFERENT set-ups inside the SAME place");
    expect(p).not.toContain("ONE CONTINUOUS SPACE");
    expect(p).not.toContain("HOW FAR ALONG THE WALK");
  });

  it("builds each clip on its planned background when there is a scene plan", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 2, ["a", "b"], "", "female", "", false, "", undefined,
      planClipMotion(2, "commercial"), { block: "WHAT THIS VIDEO IS ABOUT: an annadanam", lines: ["the dining hall, devotees in rows", "the serving vessels at the kitchen pass"] });
    expect(p).toContain("WHAT THIS VIDEO IS ABOUT: an annadanam");
    expect(p).toContain("the dining hall, devotees in rows");
    expect(p).toContain("the serving vessels at the kitchen pass");
  });

  it("keeps the client's own photographs one shop", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 2, ["a", "b"], "", "female", "", false, "",
      { formula: "FORMULA", clips: ["photo 1", "photo 2"] });
    expect(p).toContain("Treat the photographs as ONE shop seen from different spots");
  });

  it("tells a character ad the same, and keeps the line proving the background", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    const p = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, {
      segmentCount: 4, clipSummaries: ["a", "b", "c", "d"], locationMode: "ai_generated", locationPlan: "",
      aspectRatio: "9:16", adType: "commercial",
    });
    expect(p).toContain("A DIFFERENT BACKGROUND FOR EVERY CLIP, CHOSEN BY ITS LINE");
    expect(p).toContain("It is always the SAME business");
    expect(p).toContain("so the background proves\nthe line");
    expect(p).not.toContain("ONE CONTINUOUS WALK");
  });
});

/**
 * A two-character script labels its clips "clip-1[0-8sec]:" with the speakers below. The overlay
 * numbering only understood the single-voice "0-8:" shape, so a live Motu-and-Patlu ad came back with
 * all seven overlays pinned to clip 1 — every one of them stacked on the first eight seconds.
 */
describe("a two-character script's clips are found too", () => {
  const dialogue = [
    "clip-1[0-8sec]:", "  [Motu]:  ఎంత బాగున్నాయి!", "  [Patlu]: ఇది లక్ష్మీ స్వీట్స్.", "",
    "clip-2[8-16sec]:", "  [Motu]:  కేకులు కూడా ఉన్నాయా?", "  [Patlu]: అవును, ఫ్రెష్ కేకులు.", "",
    "clip-3[16-24sec]:", "  [Motu]:  మరి ఆలస్యం ఎందుకు?", "  [Patlu]: ఇప్పుడే రండి.",
  ].join("\n");

  it("reads every clip, not one", () => {
    const placements = clipPlacements(dialogue);
    expect(placements.map((p) => p.timing)).toEqual(["Clip 1 · 0–8s", "Clip 2 · 8–16s", "Clip 3 · 16–24s"]);
  });

  it("spreads overlays across the clips they belong to", () => {
    const overlays = [{ clip: 1, text: "A" }, { clip: 2, text: "B" }, { clip: 3, text: "C" }];
    expect(withPlacements(overlays, clipPlacements(dialogue), (o) => o.clip).map((o) => o.timing))
      .toEqual(["Clip 1 · 0–8s", "Clip 2 · 8–16s", "Clip 3 · 16–24s"]);
  });
});
