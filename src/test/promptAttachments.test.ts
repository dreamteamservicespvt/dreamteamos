import { describe, it, expect } from "vitest";
import { buildPromptAttachments } from "@/utils/promptAttachments";
import { assignPhotosToClips, attachmentDirective } from "@/utils/locationAssignment";

/**
 * The member is holding a folder of photos the client sent and a prompt that says "#2". Resolving
 * that number back to the actual photograph is what lets the UI show the picture instead, which is
 * the whole point — there is nothing left to count out or misremember.
 */

const photos = [
  { index: 0, zone: "shopfront", usable: true },
  { index: 1, zone: "billing counter", usable: true },
];
const urls = ["blob:one", "blob:two"];
const names = ["front.jpg", "counter.jpg"];

/** Prompts exactly as geminiService stamps them. */
const stamped = (clipCount: number, available = photos) =>
  assignPhotosToClips(clipCount, available)
    .map((plan, i) => `${attachmentDirective(plan, available)}\n\nPrompt body ${i + 1}.`);

describe("buildPromptAttachments", () => {
  it("resolves each prompt to the photo it names", () => {
    const out = buildPromptAttachments(stamped(2), urls, names);
    expect(out[0]).toMatchObject({ photoNumber: 1, url: "blob:one", fileName: "front.jpg", zone: "the shopfront" });
    expect(out[1]).toMatchObject({ photoNumber: 2, url: "blob:two", fileName: "counter.jpg", zone: "the billing counter" });
  });

  it("marks a generated clip as having nothing to attach", () => {
    const out = buildPromptAttachments(stamped(2, [photos[0]]), urls, names);
    expect(out[0]?.photoNumber).toBe(1);
    expect(out[1]?.photoNumber).toBeNull();
    expect(out[1]?.url).toBeNull();
  });

  // Every normal human-model ad, which carries no directive at all.
  it("returns nothing for an unstamped prompt", () => {
    expect(buildPromptAttachments(["A premium portrait of the ambassador."], urls, names)).toEqual([null]);
  });

  /**
   * The directive is the instruction; the thumbnail is a convenience. If the member removed the
   * file after generating, showing no preview is right — showing the next file along would point
   * them at the wrong photograph, which is the exact failure this feature exists to prevent.
   */
  it("keeps the instruction but drops the preview when the file is gone", () => {
    const out = buildPromptAttachments(stamped(2), [], []);
    expect(out[0]?.photoNumber).toBe(1);
    expect(out[0]?.directive).toContain("ATTACH STORE/OFFICE IMAGE #1");
    expect(out[0]?.url).toBeNull();
    expect(out[0]?.fileName).toBeNull();
  });

  it("never resolves a photo number to the wrong file", () => {
    const out = buildPromptAttachments(stamped(2), urls, names);
    expect(out[0]?.url).toBe(urls[out[0]!.photoNumber! - 1]);
    expect(out[1]?.url).toBe(urls[out[1]!.photoNumber! - 1]);
  });

  it("carries the whole directive through for anything that wants the words", () => {
    const out = buildPromptAttachments(stamped(1), urls, names);
    expect(out[0]?.directive).toBe("📎 ATTACH STORE/OFFICE IMAGE #1 — the shopfront");
  });
});
