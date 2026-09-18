import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * B-roll prompts and overlay texts kept vanishing when an ad was reopened.
 *
 * The cause was not the payload or the loader — both carried the fields all along — but WHEN the
 * document was written: only the first generation and the Save button ever wrote, and both of those
 * happen before a member presses Generate on section 6 or 7. Everything made after that lived in React
 * state alone.
 *
 * These read the component source, because the rule worth protecting is structural: the sections are
 * stored, restored, and written again whenever they change.
 */
const source = readFileSync("src/components/ai-platform/AIPlatformApp.tsx", "utf8");

describe("what a saved generation carries", () => {
  it("stores the B-roll prompts and the overlay texts", () => {
    const payload = source.slice(source.indexOf("const generationPayload"), source.indexOf("const persistGeneration"));
    expect(payload).toContain("stockImagePrompts: o.stockImagePrompts");
    expect(payload).toContain("overlayTexts: o.overlayTexts");
  });

  it("puts them back on screen when the ad is reopened", () => {
    expect(source).toContain("stockImagePrompts: item.stockImagePrompts || null");
    expect(source).toContain("overlayTexts: item.overlayTexts || null");
  });
});

describe("saving what is generated after the first save", () => {
  const effect = source.slice(source.indexOf("Everything generated AFTER the first save"), source.indexOf("const handleSave"));

  it("writes the generation again whenever it changes", () => {
    expect(effect).toContain("await persistGeneration(outputs)");
    expect(effect).toMatch(/\}, \[outputs, user, status\.isProcessing\]\);/);
  });

  it("waits for the change to settle instead of writing on every keystroke", () => {
    expect(effect).toMatch(/setTimeout\(async \(\) => \{[\s\S]*\}, 1000\)/);
    expect(effect).toContain("clearTimeout(timer)");
  });

  it("never writes a half-finished generation, or one with no document yet", () => {
    expect(effect).toContain("if (!user || !outputs || !generationDocIdRef.current || status.isProcessing) return;");
  });

  it("writes nothing when nothing actually changed", () => {
    expect(effect).toContain("if (fingerprint === savedFingerprintRef.current) return;");
    // Reopening an ad is not a change: the first fingerprint is adopted, not written.
    expect(effect).toContain("savedFingerprintRef.current = fingerprint;");
  });

  it("treats a reopened ad as already saved until something is generated", () => {
    expect(source).toContain("savedFingerprintRef.current = '';");
    expect(source).toContain("savedFingerprintRef.current = JSON.stringify(payload);");
  });
});
