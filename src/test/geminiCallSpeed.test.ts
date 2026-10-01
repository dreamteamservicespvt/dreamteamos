import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

/**
 * The call layer's speed rules (services/geminiService callWithFallback), against a fake SDK:
 * each call's thinking budget, dead keys skipped, resting keys left alone, and calls spread across keys.
 */

type Sent = { apiKey: string; model: string; config: any };
const sent: Sent[] = [];
/** What the fake answers, per key: "ok", or an error message to throw. */
const answers = new Map<string, string>();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    apiKey: string;
    models: { generateContent: (req: any) => Promise<any> };
    constructor({ apiKey }: { apiKey: string }) {
      this.apiKey = apiKey;
      this.models = {
        generateContent: async (req: any) => {
          sent.push({ apiKey, model: req.model, config: req.config });
          const answer = answers.get(apiKey) ?? "ok";
          if (answer !== "ok") {
            const err: any = new Error(answer);
            err.status = /429/.test(answer) ? 429 : /403/.test(answer) ? 403 : 400;
            throw err;
          }
          return { text: "[]" };
        },
      };
    }
  },
  Type: {}, Modality: {},
}));

let gemini: typeof import("@/services/geminiService");

beforeAll(async () => {
  for (let i = 1; i <= 5; i++) vi.stubEnv(`VITE_API_KEY_${i}`, `key-${i}`);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  gemini = await import("@/services/geminiService");
});
beforeEach(() => { sent.length = 0; answers.clear(); });

const call = (effort?: "fast" | "standard" | "deep") =>
  gemini.callGeminiWithFallback((ai, model) => ai.models.generateContent({ model, contents: "x", config: { systemInstruction: "s" } }),
    effort ? { effort } : {});

describe("how long each call may think", () => {
  it("sets the budget for the call's effort on gemini-2.5-flash, and keeps the request's own config", async () => {
    await call("fast");
    await call("standard");
    await call("deep");
    expect(sent.map((s) => s.config.thinkingConfig?.thinkingBudget)).toEqual([0, 768, 1536]);
    expect(sent.every((s) => s.model === "gemini-2.5-flash" && s.config.systemInstruction === "s")).toBe(true);
  });

  it("leaves a call that names no effort to the model's own default", async () => {
    await call();
    expect(sent[0].config.thinkingConfig).toBeUndefined();
  });
});

describe("which key a call uses", () => {
  it("spreads consecutive calls across the keys", async () => {
    await call("fast");
    await call("fast");
    await call("fast");
    expect(new Set(sent.map((s) => s.apiKey)).size).toBe(3);
  });

  it("never asks a dead key again — invalid or reported as leaked", async () => {
    answers.set("key-2", "API key not valid. Please pass a valid API key. API_KEY_INVALID");
    answers.set("key-3", '{"error":{"code":403,"message":"Your API key was reported as leaked.","status":"PERMISSION_DENIED"}}');
    for (let i = 0; i < 8; i++) await call("fast");
    const hits = (k: string) => sent.filter((s) => s.apiKey === k).length;
    expect(hits("key-2")).toBeLessThanOrEqual(1);
    expect(hits("key-3")).toBeLessThanOrEqual(1);
    expect(sent.filter((s) => s.apiKey !== "key-2" && s.apiKey !== "key-3").length).toBeGreaterThanOrEqual(8);
  });

  it("rests a key that hit its limit instead of asking it again on the next call", async () => {
    answers.set("key-4", "429 RESOURCE_EXHAUSTED quota. Please retry in 40s.");
    for (let i = 0; i < 6; i++) await call("fast");
    expect(sent.filter((s) => s.apiKey === "key-4").length).toBeLessThanOrEqual(1);
  });
});
