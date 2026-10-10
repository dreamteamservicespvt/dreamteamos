import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The Gemini call layer (services/geminiService callWithFallback) against a fake Google that answers the way the
 * real one did on 2026-10-10: retired models (404 "is no longer available"), keys that are invalid or "reported as
 * leaked", a free tier used up for the day (429), models "experiencing high demand" (503), and thinking settings a
 * model refuses (400). Every error body is Google's own, thrown the way @google/genai throws it (an ApiError whose
 * message is the JSON body).
 *
 * The owner's report: "sometimes prompts are not generating", showing
 * {"error":{"code":404,"message":"This model models/gemini-2.0-flash-lite is no longer available. …"}}.
 * On the old call layer the first six tests here failed: one of eight parallel calls gave up on a busy day while
 * live models were left, the retired models were in the list and asked on every page load, a 429 containing
 * "404" retired a healthy model, one busy answer moved the session off its primary model, and the member saw JSON.
 */

type Sent = { key: string; model: string; config: any };
const sent: Sent[] = [];

/** What fake Google is like right now — set per test. */
const world = {
  retired: new Set<string>(),
  invalidKeys: new Set<string>(),
  leakedKeys: new Set<string>(),
  /** "key|model" (or "*|model") out of its free requests for the day. */
  exhausted: new Set<string>(),
  /** models answering 503 "high demand" — for the next n requests to them (-1: always). */
  busy: new Map<string, number>(),
  /** "key|model" not offered to this key's (new) project. */
  newUsers: new Set<string>(),
  /** models whose NEXT request (on any key) gets one 429. */
  quotaOnce: new Set<string>(),
  /** models that refuse every thinking setting (400). */
  noThinking: new Set<string>(),
  /** every request fails before reaching Google. */
  offline: false,
  /** a retry delay Google puts in its 429 text. */
  retryText: "Please retry in 41.252946367s.",
};

const apiError = (status: number, body: object) =>
  Object.assign(new Error(JSON.stringify(body)), { name: "ApiError", status });

const realSetTimeout = globalThis.setTimeout;
const tick = () => new Promise((r) => realSetTimeout(r, 1 + Math.floor(Math.random() * 4)));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models: { generateContent: (req: any) => Promise<any> };
    constructor({ apiKey }: { apiKey: string }) {
      this.models = {
        generateContent: async (req: any) => {
          sent.push({ key: apiKey, model: req.model, config: req.config });
          await tick();
          const m = req.model as string;
          if (world.offline) throw new TypeError("Failed to fetch");
          if (world.invalidKeys.has(apiKey)) {
            throw apiError(400, { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } });
          }
          if (world.leakedKeys.has(apiKey)) {
            throw apiError(403, { error: { code: 403, message: "Your API key was reported as leaked. Please use another API key.", status: "PERMISSION_DENIED" } });
          }
          if (world.retired.has(m)) {
            throw apiError(404, { error: { code: 404, message: `This model models/${m} is no longer available. Please update your code to use models/gemini-3.5-flash-lite for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).`, status: "NOT_FOUND" } });
          }
          if (world.newUsers.has(`${apiKey}|${m}`)) {
            throw apiError(404, { error: { code: 404, message: `This model models/${m} is no longer available to new users. Please update your code to use a newer model for the latest features and improvements.`, status: "NOT_FOUND" } });
          }
          if (world.noThinking.has(m) && req.config?.thinkingConfig) {
            throw apiError(400, { error: { code: 400, message: "Thinking level is not supported for this model.", status: "INVALID_ARGUMENT" } });
          }
          if (world.quotaOnce.delete(m) || world.exhausted.has(`${apiKey}|${m}`) || world.exhausted.has(`*|${m}`)) {
            throw apiError(429, { error: { code: 429, message: `You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/usage?tab=rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: ${m}\n${world.retryText}`, status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaDimensions: { model: m, location: "global" }, quotaValue: "20" }] }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "41s" }] } });
          }
          const busyLeft = world.busy.get(m);
          if (busyLeft !== undefined && busyLeft !== 0) {
            world.busy.set(m, busyLeft - 1);
            throw apiError(503, { error: { code: 503, message: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.", status: "UNAVAILABLE" } });
          }
          return { text: `answered by ${m}` };
        },
      };
    }
  },
  Type: {}, Modality: {},
}));

type Gemini = typeof import("@/services/geminiService");
let gemini: Gemini;

const KEYS = Array.from({ length: 30 }, (_, i) => `key-${i + 1}`);
/** The key health measured live on 2026-10-10: 3 invalid, 8 leaked, 19 working. */
const liveKeyHealth = () => {
  for (const n of [1, 12, 18]) world.invalidKeys.add(`key-${n}`);
  for (const n of [13, 16, 23, 24, 25, 26, 27, 28]) world.leakedKeys.add(`key-${n}`);
};
const EVERY_MODEL = [
  "gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.0-flash", "gemini-2.0-flash-lite",
  "gemini-3.1-flash-lite-preview",
];
const RETIRED_JUNE_2026 = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];

/** A fresh page load: the module (and its memory) is new; localStorage is whatever the browser kept. */
const loadPage = async (): Promise<Gemini> => {
  vi.resetModules();
  gemini = await import("@/services/geminiService");
  return gemini;
};

const call = (effort?: "fast" | "standard" | "deep", maxRetries?: number) =>
  gemini.callGeminiWithFallback(
    (ai, model) => ai.models.generateContent({ model, contents: "x", config: { systemInstruction: "s" } }),
    { ...(effort ? { effort } : {}), ...(maxRetries ? { maxRetries } : {}) },
  ) as Promise<{ text: string }>;
const failureOf = (p: Promise<unknown>) => p.then(() => null, (e) => e as Error & { reason?: string });

/** Virtual time: the call layer's pauses move it on at once, so a 30-second wait costs no real time. */
let clock = 0;

beforeEach(async () => {
  sent.length = 0;
  world.retired.clear(); world.invalidKeys.clear(); world.leakedKeys.clear(); world.exhausted.clear();
  world.busy.clear(); world.newUsers.clear(); world.quotaOnce.clear(); world.noThinking.clear();
  world.offline = false; world.retryText = "Please retry in 41.252946367s.";
  localStorage.clear();
  vi.unstubAllEnvs();
  KEYS.forEach((k, i) => vi.stubEnv(`VITE_API_KEY_${i + 1}`, k));
  for (const level of ["log", "warn", "info", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  clock = Date.UTC(2026, 9, 10, 6, 0, 0); // 2026-10-10, 11:30 in India
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: any, ms?: number, ...args: any[]) => {
    clock += Math.max(0, Number(ms) || 0);
    return realSetTimeout(fn, 0, ...args);
  }) as any);
  await loadPage();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("a model Google has retired", () => {
  it("never reaches the member: a busy day's parallel calls all finish on a live model", async () => {
    liveKeyHealth();
    RETIRED_JUNE_2026.forEach((m) => world.retired.add(m));
    // The free tier's 20 requests a day are gone on the two 2.5 models, on every key.
    world.exhausted.add("*|gemini-2.5-flash");
    world.exhausted.add("*|gemini-2.5-flash-lite");
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => call("standard")));
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => String(r.reason?.message));
    expect(failures).toEqual([]);
    for (const r of results) expect((r as PromiseFulfilledResult<{ text: string }>).value.text).toMatch(/^answered by /);
  });

  it("is never asked again on the next page load", async () => {
    RETIRED_JUNE_2026.forEach((m) => world.retired.add(m));
    world.exhausted.add("*|gemini-2.5-flash");
    world.exhausted.add("*|gemini-2.5-flash-lite");
    await call("fast");
    await loadPage();
    sent.length = 0;
    await call("fast");
    expect(sent.filter((s) => RETIRED_JUNE_2026.includes(s.model))).toEqual([]);
  });

  it("is not in the list the app starts with", async () => {
    RETIRED_JUNE_2026.forEach((m) => world.retired.add(m));
    world.exhausted.add("*|gemini-2.5-flash");
    await call("fast");
    expect(sent.filter((s) => RETIRED_JUNE_2026.includes(s.model))).toEqual([]);
  });

  it("is put away the moment Google says so, and the call goes on to the next model", async () => {
    world.retired.add("gemini-2.5-flash");
    expect((await call("fast")).text).toBe("answered by gemini-3.8-flash");
    sent.length = 0;
    await call("fast");
    await loadPage();
    await call("fast");
    expect(sent.map((s) => s.model)).toEqual(["gemini-3.8-flash", "gemini-3.8-flash"]);
  });
});

describe("a model that is only busy or rate-limited", () => {
  it("is not retired because its 429 happens to contain the digits 404", async () => {
    world.retryText = "Please retry in 14.404553s.";
    world.quotaOnce.add("gemini-2.5-flash");
    await call("fast");
    sent.length = 0;
    for (let i = 0; i < 5; i++) await call("fast");
    expect(sent.map((s) => s.model)).toEqual(Array(5).fill("gemini-2.5-flash"));
  });

  it("is only skipped for a moment: one 'high demand' answer does not move the whole session to a lite model", async () => {
    world.busy.set("gemini-2.5-flash", 1);
    expect((await call("standard")).text).toBe("answered by gemini-3.8-flash");
    sent.length = 0;
    clock += 2 * 60 * 1000; // two minutes later
    for (let i = 0; i < 4; i++) await call("standard");
    expect(sent.map((s) => s.model)).toEqual(Array(4).fill("gemini-2.5-flash"));
  });

  it("rests only that key from that model: the key still serves the other models", async () => {
    world.exhausted.add("key-2|gemini-2.5-flash");
    await call("fast"); // starts on key 2 (the key after key 1): its 2.5 Flash is used up
    world.exhausted.add("*|gemini-2.5-flash");
    sent.length = 0;
    const keysOn38 = new Set<string>();
    for (let i = 0; i < 30; i++) { await call("fast"); keysOn38.add(sent[sent.length - 1].key); }
    expect(keysOn38.has("key-2")).toBe(true);
  });

  it("used up for the day on every key, costs a few failed requests — not one per key — before the next model answers", async () => {
    liveKeyHealth();
    world.exhausted.add("*|gemini-2.5-flash");
    await call("fast");
    expect(sent.filter((s) => s.model === "gemini-2.5-flash").length).toBeLessThanOrEqual(3);
    sent.length = 0;
    await call("fast");
    expect(sent.map((s) => s.model)).toEqual(["gemini-3.8-flash"]);
  });

  it("is remembered as used up after a reload, until Google's daily reset — then asked again", async () => {
    world.exhausted.add("*|gemini-2.5-flash");
    await call("fast");
    await loadPage();
    sent.length = 0;
    await call("fast");
    expect(sent.filter((s) => s.model === "gemini-2.5-flash").length).toBeLessThanOrEqual(1);
    // Midnight in California: the day's requests are back.
    world.exhausted.clear();
    clock = Date.UTC(2026, 9, 11, 7, 1, 0);
    await loadPage();
    sent.length = 0;
    await call("fast");
    expect(sent.map((s) => s.model)).toEqual(["gemini-2.5-flash"]);
  });

  it("waits out a short spell when every model is busy, instead of failing", async () => {
    for (const m of EVERY_MODEL) world.busy.set(m, 1);
    expect((await call("fast")).text).toMatch(/^answered by /);
  });
});

describe("thinking settings", () => {
  it("each model gets the setting it takes: a budget on 2.5 Flash, a level on the Gemini 3 Flash models, none on lite", async () => {
    const lastOn = (m: string) => sent.filter((s) => s.model === m).pop()!;
    expect((await call("fast")).text).toBe("answered by gemini-2.5-flash");
    expect(lastOn("gemini-2.5-flash").config.thinkingConfig).toEqual({ thinkingBudget: 0 });
    world.exhausted.add("*|gemini-2.5-flash");
    expect((await call("fast")).text).toBe("answered by gemini-3.8-flash");
    expect(lastOn("gemini-3.8-flash").config.thinkingConfig).toEqual({ thinkingLevel: "LOW" }); // 3.8 has no MINIMAL
    world.exhausted.add("*|gemini-3.8-flash");
    expect((await call("fast")).text).toBe("answered by gemini-3.6-flash");
    expect(lastOn("gemini-3.6-flash").config.thinkingConfig).toEqual({ thinkingLevel: "MINIMAL" });
    world.exhausted.add("*|gemini-3.6-flash");
    expect((await call("deep")).text).toBe("answered by gemini-3.5-flash-lite");
    expect(lastOn("gemini-3.5-flash-lite").config.thinkingConfig).toBeUndefined();
    expect(sent.every((s) => s.config.systemInstruction === "s")).toBe(true);
  });

  it("a model that refuses the setting is asked again without it — the call still answers", async () => {
    world.exhausted.add("*|gemini-2.5-flash");
    world.noThinking.add("gemini-3.8-flash");
    expect((await call("deep")).text).toBe("answered by gemini-3.8-flash");
    const on38 = sent.filter((s) => s.model === "gemini-3.8-flash");
    expect(on38.map((s) => s.config.thinkingConfig)).toEqual([{ thinkingLevel: "MEDIUM" }, undefined]);
  });
});

describe("keys", () => {
  it("a key whose project is not offered 2.5 Flash ('new users') skips it; the other keys still use it", async () => {
    world.newUsers.add("key-2|gemini-2.5-flash");
    for (let i = 0; i < 4; i++) await call("fast");
    expect(sent.filter((s) => s.key === "key-2" && s.model === "gemini-2.5-flash").length).toBe(1);
    expect(sent.filter((s) => s.model === "gemini-2.5-flash").length).toBe(5);
    expect(sent.some((s) => s.model !== "gemini-2.5-flash")).toBe(false);
  });

  it("an invalid or leaked key is never asked again — not even after a reload", async () => {
    liveKeyHealth();
    for (let i = 0; i < 25; i++) await call("fast");
    await loadPage();
    sent.length = 0;
    for (let i = 0; i < 25; i++) await call("fast");
    const dead = new Set([...world.invalidKeys, ...world.leakedKeys]);
    expect(sent.filter((s) => dead.has(s.key))).toEqual([]);
  });
});

describe("when nothing can answer", () => {
  it("says so in plain words — the daily free limit and when it resets — never Google's raw JSON", async () => {
    liveKeyHealth();
    for (const m of EVERY_MODEL) world.exhausted.add(`*|${m}`);
    const error = await failureOf(call("fast"));
    expect(error?.name).toBe("GeminiUnavailableError");
    expect(error!.message).not.toMatch(/^\{|"error"|"code"/);
    expect(error!.message).toMatch(/free daily limit is used up on all 19 working API keys/);
    expect(error!.message).toMatch(/resets at .+ \(Google resets it at midnight Pacific time\)/);
  });

  it("asks Google at least once even when this browser remembers every route as used up", async () => {
    for (const m of EVERY_MODEL) world.exhausted.add(`*|${m}`);
    await failureOf(call("fast"));
    // Google lifts the limit early (a paid tier, say): the remembered rests must not fail the next call unasked.
    world.exhausted.clear();
    await loadPage();
    expect((await call("fast")).text).toBe("answered by gemini-2.5-flash");
  });

  it("every key dead: says to replace the keys", async () => {
    for (const k of KEYS) world.leakedKeys.add(k);
    const error = await failureOf(call("fast"));
    expect(error?.message).toMatch(/None of the 30 Gemini API keys work any more/);
  });

  it("offline: says the servers could not be reached, after one more try", async () => {
    world.offline = true;
    const error = await failureOf(call("fast"));
    expect(error?.message).toMatch(/Could not reach Google's Gemini servers/);
    expect(sent.length).toBe(2);
  });

  it("a request Google refuses as wrong is not sent round every key: one request, Google's words, no JSON", async () => {
    const error = await failureOf(gemini.callGeminiWithFallback(async () => {
      sent.push({ key: "?", model: "?", config: {} });
      throw apiError(400, { error: { code: 400, message: "Request contains an invalid argument.", status: "INVALID_ARGUMENT" } });
    }));
    expect(sent.length).toBe(1);
    expect(error?.message).toBe("Gemini could not process this request: Request contains an invalid argument.");
  });

  it("an error the caller's own code throws passes through unchanged", async () => {
    const own = new Error("The AI returned a response that could not be read. Try again.");
    const error = await failureOf(gemini.callGeminiWithFallback(async () => { throw own; }));
    expect(error).toBe(own);
  });

  it("keeps a caller's numeric cap on attempts", async () => {
    for (const m of EVERY_MODEL) world.exhausted.add(`*|${m}`);
    await failureOf(call("fast", 2));
    expect(sent.length).toBe(2);
  });
});
