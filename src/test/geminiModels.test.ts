import { describe, it, expect } from "vitest";
import {
  GEMINI_MODELS, describeRest, geminiUnavailable, nextQuotaReset, readGeminiError, restAfter, thinkingFor,
  type GeminiErrorInfo,
} from "@/utils/geminiModels";

/**
 * utils/geminiModels — the model list, the thinking setting per model, and the reading of Google's errors.
 * The error bodies are the ones Google sent in the live probe of 2026-10-10.
 */

const apiError = (status: number, body: object) =>
  Object.assign(new Error(JSON.stringify(body)), { name: "ApiError", status });
const google = (code: number, status: string, message: string, extra: object = {}) =>
  apiError(code, { error: { code, message, status, ...extra } });

const RETIRED_404 = google(404, "NOT_FOUND",
  "This model models/gemini-2.0-flash-lite is no longer available. Please update your code to use models/gemini-3.5-flash-lite for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).");
const quota429 = (retry: string, quotaId = "GenerateRequestsPerDayPerProjectPerModel-FreeTier", limit = 20) => google(429, "RESOURCE_EXHAUSTED",
  `You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: ${limit}, model: gemini-2.5-flash\nPlease retry in ${retry}.`,
  { details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId }] }] });

describe("GEMINI_MODELS", () => {
  it("leads with the model the pipeline was tuned on", () => {
    expect(GEMINI_MODELS[0]).toBe("gemini-2.5-flash");
  });

  it("holds no model Google has shut down, and no preview that can vanish without notice", () => {
    for (const gone of ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash-lite-preview-09-2025"]) {
      expect(GEMINI_MODELS).not.toContain(gone);
    }
    expect(GEMINI_MODELS.filter((m) => /preview|exp/.test(m))).toEqual([]);
    expect(new Set(GEMINI_MODELS).size).toBe(GEMINI_MODELS.length);
  });

  it("ends on the two aliases Google never retires, so something is always alive", () => {
    expect(GEMINI_MODELS.slice(-2)).toEqual(["gemini-flash-latest", "gemini-flash-lite-latest"]);
  });

  it("asks every Flash model before any lite one", () => {
    const firstLite = GEMINI_MODELS.findIndex((m) => /lite/.test(m));
    expect(GEMINI_MODELS.slice(firstLite).filter((m) => !/lite|latest/.test(m))).toEqual([]);
  });
});

describe("thinkingFor", () => {
  it("leaves a call that names no effort to the model's default", () => {
    for (const m of GEMINI_MODELS) expect(thinkingFor(m)).toBeUndefined();
  });

  it("gives gemini-2.5-flash a token budget per effort", () => {
    expect((["fast", "standard", "deep"] as const).map((e) => thinkingFor("gemini-2.5-flash", e))).toEqual([
      { thinkingBudget: 0 }, { thinkingBudget: 768 }, { thinkingBudget: 1536 },
    ]);
  });

  it("gives the Gemini 3 Flash models a level — never MINIMAL where Google refuses it", () => {
    expect(thinkingFor("gemini-3.6-flash", "fast")).toEqual({ thinkingLevel: "MINIMAL" });
    expect(thinkingFor("gemini-3.8-flash", "fast")).toEqual({ thinkingLevel: "LOW" });
    expect(thinkingFor("gemini-flash-latest", "fast")).toEqual({ thinkingLevel: "LOW" });
    expect(thinkingFor("gemini-3.8-flash", "standard")).toEqual({ thinkingLevel: "LOW" });
    expect(thinkingFor("gemini-3.8-flash", "deep")).toEqual({ thinkingLevel: "MEDIUM" });
  });

  it("gives the lite models none", () => {
    for (const m of ["gemini-2.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"]) {
      expect(thinkingFor(m, "deep")).toBeUndefined();
    }
  });
});

describe("readGeminiError", () => {
  it("a retired model (the owner's error): retired, with Google's suggested successor", () => {
    expect(readGeminiError(RETIRED_404, "gemini-2.0-flash-lite")).toMatchObject({
      kind: "retired", status: 404, successor: "gemini-3.5-flash-lite",
      message: expect.stringMatching(/^This model models\/gemini-2\.0-flash-lite is no longer available/),
    });
  });

  it("retires only the model Google names — never a neighbour, never on a 404 about something else", () => {
    expect(readGeminiError(RETIRED_404, "gemini-2.0-flash").kind).toBe("model_cannot");
    expect(readGeminiError(google(404, "NOT_FOUND", "Requested entity was not found."), "gemini-2.5-flash").kind).toBe("model_cannot");
  });

  it("'no longer available to new users' is about the key's project, not the model", () => {
    const e = google(404, "NOT_FOUND", "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use a newer model for the latest features and improvements.");
    expect(readGeminiError(e, "gemini-2.5-flash").kind).toBe("not_for_key");
  });

  it("invalid, leaked and disabled keys are dead", () => {
    expect(readGeminiError(google(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", { details: [{ reason: "API_KEY_INVALID" }] })).kind).toBe("dead_key");
    expect(readGeminiError(google(403, "PERMISSION_DENIED", "Your API key was reported as leaked. Please use another API key.")).kind).toBe("dead_key");
    expect(readGeminiError(google(403, "PERMISSION_DENIED", "Generative Language API has not been used in project 123 before or it is disabled.", { details: [{ reason: "SERVICE_DISABLED" }] })).kind).toBe("dead_key");
  });

  it("a 429 is a rate limit — even when its retry delay contains the digits 404", () => {
    expect(readGeminiError(quota429("14.404553s"), "gemini-2.5-flash")).toMatchObject({ kind: "rate_limited", daily: true, retryMs: 14405 });
  });

  it("tells the day's limit from the minute's", () => {
    expect(readGeminiError(quota429("7.5s", "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", 5))).toMatchObject({ daily: false, retryMs: 7500 });
    expect(readGeminiError(quota429("3s", "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", 0)).daily).toBe(true);
  });

  it("reads the body when an older SDK put words before it", () => {
    const e = new Error(`got status: 429 Too Many Requests. ${JSON.stringify({ error: { code: 429, message: "Quota exceeded. Please retry in 30s.", status: "RESOURCE_EXHAUSTED" } })}`);
    expect(readGeminiError(e)).toMatchObject({ kind: "rate_limited", status: 429, retryMs: 30000 });
  });

  it("'high demand' and server errors are busy", () => {
    expect(readGeminiError(google(503, "UNAVAILABLE", "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.")).kind).toBe("busy");
    expect(readGeminiError(google(500, "INTERNAL", "An internal error has occurred.")).kind).toBe("busy");
  });

  it("a refused thinking setting is its own case (both of Google's wordings)", () => {
    expect(readGeminiError(google(400, "INVALID_ARGUMENT", "Thinking level MINIMAL is not supported for this model. Please retry with other thinking level.")).kind).toBe("thinking_unsupported");
    expect(readGeminiError(google(400, "INVALID_ARGUMENT", "Thinking level is not supported for this model.")).kind).toBe("thinking_unsupported");
  });

  it("a request one model cannot take moves on; a wrong request is fatal — never sent round every key", () => {
    expect(readGeminiError(google(400, "INVALID_ARGUMENT", "JSON mode is not enabled for this model.")).kind).toBe("model_cannot");
    expect(readGeminiError(google(400, "INVALID_ARGUMENT", "Request contains an invalid argument.")).kind).toBe("fatal");
    expect(readGeminiError(google(400, "INVALID_ARGUMENT", "Unsupported MIME type: image/heic")).kind).toBe("fatal");
  });

  it("an offline request is a network error; the caller's own error is fatal with no status", () => {
    expect(readGeminiError(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(readGeminiError(new Error("The AI returned a response that could not be read. Try again."))).toMatchObject({ kind: "fatal", status: undefined });
  });
});

describe("rests", () => {
  const at = (iso: string) => Date.parse(iso);

  it("the daily reset is the next midnight in California — summer and winter time", () => {
    expect(nextQuotaReset(at("2026-10-10T06:00:00Z"))).toBe(at("2026-10-10T07:00:00Z")); // 11:30 PM PDT → midnight
    expect(nextQuotaReset(at("2026-10-10T10:00:00Z"))).toBe(at("2026-10-11T07:00:00Z"));
    expect(nextQuotaReset(at("2026-12-10T10:00:00Z"))).toBe(at("2026-12-11T08:00:00Z")); // PST
  });

  it("a key rests until the reset for a day's limit, else for Google's delay within 2 s – 2 min", () => {
    const now = at("2026-10-10T10:00:00Z");
    const info = (extra: Partial<GeminiErrorInfo>): GeminiErrorInfo => ({ kind: "rate_limited", message: "", ...extra });
    expect(restAfter(info({ daily: true }), now)).toBe(at("2026-10-11T07:00:00Z") - now);
    expect(restAfter(info({ retryMs: 41253 }), now)).toBe(41253);
    expect(restAfter(info({}), now)).toBe(60000);
    expect(restAfter(info({ retryMs: 500 }), now)).toBe(2000);
    expect(restAfter(info({ retryMs: 500000 }), now)).toBe(120000);
  });

  it("describes a rest for the console", () => {
    const now = at("2026-10-10T10:00:00Z");
    expect(describeRest(41000, now)).toBe("41s");
    expect(describeRest(12 * 60000, now)).toBe("12 min");
    expect(describeRest(5 * 3600000, now, () => "8:30 PM")).toBe("until 8:30 PM");
  });
});

describe("geminiUnavailable — what a member reads when nothing can answer", () => {
  const base = { workingKeys: 19, totalKeys: 30, liveModels: 8, models: GEMINI_MODELS, now: Date.parse("2026-10-10T06:00:00Z") };
  const err = (kind: GeminiErrorInfo["kind"], extra: Partial<GeminiErrorInfo> = {}): GeminiErrorInfo => ({ kind, message: "Google's words", ...extra });
  const say = (f: Partial<typeof base> & { errors: GeminiErrorInfo[] }) => geminiUnavailable({ ...base, ...f }, () => "12:30 PM");

  it("the daily limit, with the time it comes back", () => {
    const e = say({ errors: [err("rate_limited", { daily: true }), err("busy")] });
    expect(e.reason).toBe("daily_limit");
    expect(e.message).toBe("Gemini's free daily limit is used up on all 19 working API keys, for every model the app can use. It resets at 12:30 PM (Google resets it at midnight Pacific time). Try again then, or add more API keys.");
  });

  it("keys to replace, models to update, a busy Google, a lost connection", () => {
    expect(say({ errors: [err("dead_key")], workingKeys: 0 }).reason).toBe("no_keys");
    expect(say({ errors: [err("retired")], liveModels: 0 }).message).toMatch(/needs updating/);
    expect(say({ errors: [err("rate_limited")] }).reason).toBe("rate_limit");
    expect(say({ errors: [err("busy")] }).message).toMatch(/overloaded right now/);
    expect(say({ errors: [err("network")] }).reason).toBe("network");
  });

  it("anything else in Google's own words — never its JSON", () => {
    const e = say({ errors: [err("model_cannot", { message: "JSON mode is not enabled for this model." })] });
    expect(e.message).toBe("Gemini could not answer: JSON mode is not enabled for this model.");
    expect(e.name).toBe("GeminiUnavailableError");
  });
});
