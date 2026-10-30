import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { REQUEST_LIMIT_TIMER, memberErrorText, readGeminiError } from "@/utils/geminiModels";
import { keyCheckFrom } from "@/utils/geminiKeys";

/**
 * A key whose Google Cloud PROJECT has been blocked (2026-10-30 — the owner's screenshot on a 6-clip run, at
 * "Extracting business intelligence…"):
 *   {"error":{"code":403,"message":"Your project has been denied access. Please contact support.","status":"PERMISSION_DENIED"}}
 *
 * That answer is about the key's whole project, for every model — like "reported as leaked". It used to be read as a
 * 403 for ONE model ('refused'), so the call asked the same blocked key again on each of the eight models, every call
 * of the run and every page load did the same, and the member saw Google's JSON. Each blocked key must now be asked
 * once, never again (this browser remembers it), the run must finish on the keys that work, and when no key works the
 * member must read a sentence that says what to do.
 */

type Sent = { key: string; model: string };
const sent: Sent[] = [];
const denied = new Set<string>();
/** "key|model": a 403 that IS about one model only — the key itself still works. */
const refusedPair = new Set<string>();

const apiError = (status: number, body: object) =>
  Object.assign(new Error(JSON.stringify(body)), { name: "ApiError", status });
const DENIED_BODY = { error: { code: 403, message: "Your project has been denied access. Please contact support.", status: "PERMISSION_DENIED" } };

const realSetTimeout = globalThis.setTimeout;

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models: { generateContent: (req: any) => Promise<any> };
    constructor({ apiKey }: { apiKey: string }) {
      this.models = {
        generateContent: async (req: any) => {
          sent.push({ key: apiKey, model: req.model });
          await new Promise((r) => realSetTimeout(r, 1));
          if (denied.has(apiKey)) throw apiError(403, DENIED_BODY);
          if (refusedPair.has(`${apiKey}|${req.model}`)) {
            throw apiError(403, { error: { code: 403, message: `Permission denied on resource ${req.model}.`, status: "PERMISSION_DENIED" } });
          }
          return { text: `answered by ${req.model} on ${apiKey}` };
        },
      };
    }
  },
  Type: {}, Modality: {},
}));

type Gemini = typeof import("@/services/geminiService");
let gemini: Gemini;
const KEYS = Array.from({ length: 30 }, (_, i) => `key-${i + 1}`);
const loadPage = async () => { vi.resetModules(); gemini = await import("@/services/geminiService"); };
const call = () => gemini.callGeminiWithFallback(
  (ai, model) => ai.models.generateContent({ model, contents: "x" }), { effort: "fast" },
) as Promise<{ text: string }>;
let clock = 0;

beforeEach(async () => {
  sent.length = 0; denied.clear(); refusedPair.clear();
  localStorage.clear();
  vi.unstubAllEnvs();
  KEYS.forEach((k, i) => vi.stubEnv(`VITE_API_KEY_${i + 1}`, k));
  for (const level of ["log", "warn", "info", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  clock = Date.UTC(2026, 9, 30, 6, 0, 0);
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: any, ms?: number, ...args: any[]) => {
    if (args[0] === REQUEST_LIMIT_TIMER) return realSetTimeout(fn, Number(ms), ...args);
    clock += Math.max(0, Number(ms) || 0);
    return realSetTimeout(fn, 0, ...args);
  }) as any);
  await loadPage();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("a key whose project Google has denied access", () => {
  it("is read as a dead key, not as a refusal for one model", () => {
    expect(readGeminiError(apiError(403, DENIED_BODY), "gemini-2.5-flash").kind).toBe("dead_key");
    // A 403 that names nothing about the project stays a refusal of that one pair.
    expect(readGeminiError(apiError(403, { error: { code: 403, message: "Permission denied on resource gemini-2.5-flash.", status: "PERMISSION_DENIED" } }), "gemini-2.5-flash").kind).toBe("refused");
  });

  it("is asked once and never again — the run finishes on the keys that work", async () => {
    for (let n = 1; n <= 20; n++) denied.add(`key-${n}`);
    const results = await Promise.all(Array.from({ length: 6 }, () => call()));
    for (const r of results) expect(r.text).toMatch(/^answered by gemini-2\.5-flash on key-(2[1-9]|30)$/);
    const deniedAsks = sent.filter((s) => denied.has(s.key));
    // Each blocked key at most once (parallel calls may meet the same key before it is known) — never once per model.
    expect(new Set(deniedAsks.map((s) => s.model))).toEqual(new Set(["gemini-2.5-flash"]));
    expect(deniedAsks.length).toBeLessThanOrEqual(20 + 6);

    // The next page load remembers them: no request goes to a blocked key.
    await loadPage();
    sent.length = 0;
    await call();
    expect(sent.filter((s) => denied.has(s.key))).toEqual([]);
  });

  it("when every key is denied, the member reads what to do — never Google's JSON", async () => {
    KEYS.forEach((k) => denied.add(k));
    const error = await call().then(() => null, (e) => e as Error & { reason?: string });
    expect(error).not.toBeNull();
    expect(error!.message.trim().startsWith("{")).toBe(false);
    expect(error!.message).not.toContain("PERMISSION_DENIED");
    expect(error!.reason).toBe("no_keys");
    expect(error!.message).toMatch(/blocked|denied/i);
    // Thirty keys, one request each — not thirty keys × eight models.
    expect(sent.length).toBe(KEYS.length);
  });

  it("the AI Accounts key check marks such a key failed, in words", () => {
    const check = keyCheckFrom(403, JSON.stringify(DENIED_BODY));
    expect(check.status).toBe("failed");
    expect(check.message).toMatch(/blocked this key's project/);
  });

  it("the failed-run popup never shows Google's JSON, whatever path it came by", () => {
    const shown = memberErrorText(apiError(403, DENIED_BODY));
    expect(shown.startsWith("{")).toBe(false);
    expect(shown).toContain("Your project has been denied access");
    expect(shown).toMatch(/new keys in Vercel/);
    // A sentence passes through untouched.
    expect(memberErrorText(new Error("The voice-over could not be fitted."))).toBe("The voice-over could not be fitted.");
  });

  it("a 403 for one model only still rests just that key and model", async () => {
    refusedPair.add("key-1|gemini-2.5-flash");
    // Two rounds of the thirty keys: key-1 meets gemini-2.5-flash once, then rests from it (30 minutes).
    for (let i = 0; i < 60; i++) expect((await call()).text).toMatch(/^answered by /);
    expect(sent.filter((s) => s.key === "key-1" && s.model === "gemini-2.5-flash")).toHaveLength(1);
  });
});
