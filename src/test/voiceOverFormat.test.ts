import { describe, it, expect } from "vitest";
import {
  clipLabel, clipRange, formatClipLine, formatClipScript, isClipHeaderLine, parseLabeledClips,
} from "@/utils/voiceOverFormat";

describe("clip labelling", () => {
  it("uses the business-facing clip-N[start-endsec] shape", () => {
    expect(clipLabel(0)).toBe("clip-1[0-8sec]");
    expect(clipLabel(1)).toBe("clip-2[8-16sec]");
    expect(clipLabel(7)).toBe("clip-8[56-64sec]");
  });

  it("exposes the bare second range for compact UI chips", () => {
    expect(clipRange(0)).toBe("0-8");
    expect(clipRange(3)).toBe("24-32");
  });

  it("formats single lines and whole scripts for copy/paste", () => {
    expect(formatClipLine(0, "  hello  ")).toBe("clip-1[0-8sec]: hello");
    expect(formatClipScript(["one", "two"])).toBe(
      "clip-1[0-8sec]: one\nclip-2[8-16sec]: two"
    );
  });
});

describe("parseLabeledClips", () => {
  it("parses the business-facing clip format", () => {
    const script = `clip-1[0-8sec]: First spoken line.
clip-2[8-16sec]: Second spoken line.`;
    expect(parseLabeledClips(script)).toEqual(["First spoken line.", "Second spoken line."]);
  });

  it("parses the canonical storage format the model emits", () => {
    expect(parseLabeledClips("0-8: One.\n8-16: Two.")).toEqual(["One.", "Two."]);
  });

  it("tolerates spacing, casing, and `Segment N:` variants", () => {
    expect(parseLabeledClips("Clip 1 [0-8 sec]: One.\nCLIP-2[8-16sec]: Two.")).toEqual(["One.", "Two."]);
    expect(parseLabeledClips("Segment 1: One.\nSegment 2: Two.")).toEqual(["One.", "Two."]);
  });

  it("joins wrapped continuation lines into their clip", () => {
    expect(parseLabeledClips("clip-1[0-8sec]: First part\nsecond part.")).toEqual(["First part second part."]);
  });

  it("stops at a FULL SCRIPT section", () => {
    const script = "clip-1[0-8sec]: One.\nFULL SCRIPT:\nOne. Two.";
    expect(parseLabeledClips(script)).toEqual(["One."]);
  });

  it("returns nothing for free-form text so callers fall back to AI segmentation", () => {
    expect(parseLabeledClips("Just some raw notes about the business.")).toEqual([]);
    expect(parseLabeledClips("")).toEqual([]);
  });

  it("preserves Telugu spoken content untouched", () => {
    const script = "clip-1[0-8sec]: మీ వ్యాపారం కోసం.\nclip-2[8-16sec]: ఇప్పుడే కాల్ చేయండి.";
    expect(parseLabeledClips(script)).toEqual(["మీ వ్యాపారం కోసం.", "ఇప్పుడే కాల్ చేయండి."]);
  });
});

describe("isClipHeaderLine", () => {
  it("recognises every accepted header, and nothing else", () => {
    expect(isClipHeaderLine("clip-1[0-8sec]: text")).toBe(true);
    expect(isClipHeaderLine("0-8: text")).toBe(true);
    expect(isClipHeaderLine("Segment 3: text")).toBe(true);
    expect(isClipHeaderLine("This is a normal sentence.")).toBe(false);
  });
});
