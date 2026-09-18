import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { cueForWords, cueRange, cueWords } from "@/utils/wordTiming";

/**
 * What sections 6 and 7 show.
 *
 * They had grown into walls of text: every B-roll card and every overlay group repeated the clip's
 * whole spoken line, and the card's own placement was buried under it. An editor needs three things —
 * which clip, which words to put it between, and the prompt or the overlay text itself.
 */
const source = readFileSync("src/components/ai-platform/AIPlatformApp.tsx", "utf8");
const section = (from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to));

describe("the B-roll card", () => {
  const card = section("Where it goes, in one line", "{/* #10 — per-image refine */}");

  it("shows the clip, the words to show it between, and the prompt", () => {
    expect(card).toContain("{cueWords(item.cue)}");
    expect(card).toContain("{cueRange(item.cue)}");
    expect(card).toContain("{item.prompt}");
  });

  it("no longer repeats the voice-over line or the reasoning under every image", () => {
    expect(card).not.toContain("Cut over");
    expect(card).not.toContain("spokenOnly");
    expect(card).not.toContain("whyItFits");
  });
});

describe("the overlay row", () => {
  const rows = section("Array.from(new Set(outputs.overlayTexts", "{outputs.overlayTexts && outputs.overlayTexts.length === 0");

  it("shows the clip, the text, the sound effect and the words", () => {
    expect(rows).toContain("?.timing || `Clip ${clip}`");
    expect(rows).toContain("{o.text}");
    expect(rows).toContain("{o.soundEffect}");
    expect(rows).toContain("{o.cue ? cueWords(o.cue) : o.cueLabel}");
  });

  it("no longer prints the clip's spoken line above the overlays", () => {
    expect(rows).not.toContain("spokenOnly");
    expect(rows).not.toContain("?.line &&");
  });
});

describe("what a member reads on the card", () => {
  const line = "నిజామాబాద్‌లోని శ్రీ సాయి టూ వీలర్ సెంటర్‌లో సర్వీస్ చేస్తాం.";

  it("is the two words and the seconds, nothing else", () => {
    const cue = cueForWords(line, "శ్రీ", "సెంటర్‌లో", 0, 8);
    expect(cueWords(cue)).toBe("from “శ్రీ” to “సెంటర్‌లో”");
    expect(cueRange(cue)).toMatch(/^0:\d\d\.\d → 0:\d\d\.\d$/);
  });

  it("says plainly when it spans the clip instead of inventing a precise time", () => {
    expect(cueWords(cueForWords(line, "not in the line", "", 0, 8))).toBe("across the whole clip");
  });
});
