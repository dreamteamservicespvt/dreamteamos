import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

/**
 * 2026-11-05 — the owner: "after generating the 1 to 5 deliverables then automatically generate the remaining 6, 7".
 * The two writers behind rows 6 (B-roll) and 7 (overlays) used to swallow an unreadable answer — overlays as an empty
 * list, B-roll as one "Parse Error" image — so the kit counted as having them and nothing asked again. Now an empty or
 * unreadable answer is asked once more, and still nothing is an error (which the studio retries and shows).
 */

/** Gemini's answers, in order; the last one repeats. */
let replies: string[] = [];
let calls = 0;

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async () => {
        const text = replies[Math.min(calls, replies.length - 1)];
        calls += 1;
        return { text };
      },
    };
    constructor(_: unknown) {}
  },
  Type: {}, Modality: {},
}));

let gemini: typeof import("@/services/geminiService");
beforeAll(async () => {
  vi.stubEnv("VITE_API_KEY_1", "k1");
  for (const level of ["log", "warn", "info", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  gemini = await import("@/services/geminiService");
});
beforeEach(() => { calls = 0; });

const script = "0-8: Fresh sweets every day at Sri Sai Sweets.\n8-16: Visit us on Main Road today.";
const profile = { name: "Sri Sai Sweets" };

describe("overlay texts (row 7)", () => {
  it("asks again after an unreadable answer and keeps the second one", async () => {
    replies = ["not json", JSON.stringify([{ clip: 1, text: "FRESH DAILY" }])];
    const items = await gemini.generateOverlayTexts(script, profile, "Telugu");
    expect(calls).toBe(2);
    expect(items.map((o: any) => o.text)).toEqual(["FRESH DAILY"]);
  });

  it("throws after two empty answers instead of returning an empty list", async () => {
    replies = ["[]"];
    await expect(gemini.generateOverlayTexts(script, profile, "Telugu")).rejects.toThrow(/came back empty/);
    expect(calls).toBe(2);
  });

  it("asks once when the first answer is good", async () => {
    replies = [JSON.stringify([{ clip: 2, text: "MAIN ROAD" }])];
    await gemini.generateOverlayTexts(script, profile, "Telugu");
    expect(calls).toBe(1);
  });
});

describe("B-roll prompts (row 6)", () => {
  it("asks again after an unreadable answer and keeps the second one", async () => {
    replies = ["oops", JSON.stringify([{ id: 1, concept: "Sweets tray", prompt: "A tray of sweets." }])];
    const items = await gemini.generateStockImagePrompts(script, profile, "commercial", "", "indian", "9:16", 2);
    expect(calls).toBe(2);
    expect(items[0].concept).toBe("Sweets tray");
  });

  it("throws after two unreadable answers — never a 'Parse Error' image", async () => {
    replies = ["oops"];
    await expect(gemini.generateStockImagePrompts(script, profile, "commercial", "", "indian", "9:16", 2))
      .rejects.toThrow(/came back empty/);
    expect(calls).toBe(2);
  });
});
