/**
 * The Development OS's Gemini port (2026-10-18): plain REST `fetch`, so it runs on the server (production) and in the
 * browser (DEV fallback, live tests). The key is sent in the `x-goog-api-key` header, never in a URL.
 *
 * Models come from the app's ONE list (`utils/geminiModels.GEMINI_MODELS`) and Google's errors are read by the app's
 * ONE reader (`readGeminiError`) — a dead key is skipped for the rest of the run, a used-up or refused key moves to the
 * next key, a retired / unsuitable / overloaded model to the next model. Every call is bounded (FR-027): a maximum
 * number of requests per port, a timeout per request, and a budget callback the caller uses for the daily cap.
 * The second and third judges start from different models than the first, so their verdicts are independent.
 */
import { GEMINI_MODELS, readGeminiError, thinkingFor, type Effort } from "../../utils/geminiModels.js";
import type { AiCallLog } from "../core/types.js";
import type { AiItemDraft, AiPort, AiResult, CoachRequest, GenerateRequest, JudgeRequest, PracticalDraft, PracticalRequest, ReportRequest, SolveAnswer, SolveRequest } from "./context.js";
import { coachPrompt, generatePrompt, judgePrompt, parseDrafts, parsePractical, parseSolve, practicalPrompt, reportPrompt, solvePrompt } from "./prompts.js";

export interface GeminiPortConfig {
  keys: string[];
  fetch?: typeof fetch;
  models?: readonly string[];
  timeoutMs?: number;
  /** Requests this port may make in total (one request = one call to Google). */
  maxCalls?: number;
  /** Asked before every request: false = the daily budget is spent (the call fails as "budget"). */
  allow?: () => boolean;
  onDeadKey?: (fingerprint: string, why: string) => void;
  /**
   * Fingerprints of keys an earlier request found dead (invalid / reported leaked), skipped without a request. Live on
   * 2026-10-18, 11 of 30 keys were dead and a first judge spent 8 requests on them — the whole of an answer's budget —
   * before reaching a live one; the server keeps the list in `devos_health/current.deadKeys`.
   */
  skip?: readonly string[];
}

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** A short, one-way fingerprint of a key (for logs and the dead-key list — never the key). */
export function keyFingerprint(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return `k${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1] : t;
}

export function geminiPort(cfg: GeminiPortConfig): AiPort {
  const doFetch = cfg.fetch ?? globalThis.fetch.bind(globalThis);
  const models = [...(cfg.models ?? GEMINI_MODELS)];
  const timeoutMs = cfg.timeoutMs ?? 25_000;
  let callsLeft = cfg.maxCalls ?? 12;
  const skip = new Set(cfg.skip ?? []);
  const all = [...new Set(cfg.keys.filter((k) => typeof k === "string" && k.trim().length > 20).map((k) => k.trim()))];
  // Known-dead keys go; if that would leave none, keep them all (a stale list must never switch the AI off).
  const live = all.filter((k) => !skip.has(keyFingerprint(k)));
  const keys = live.length ? live : all;
  const dead = new Set<string>();
  let keyCursor = keys.length ? Math.floor(Math.random() * keys.length) : 0;

  async function request(model: string, key: string, path: string, body: unknown): Promise<{ ok: boolean; status: number; json?: any; text: string; ms: number }> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await doFetch(`${BASE}/${model}:${path}`, {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: ctl.signal,
      });
      const text = await res.text();
      let json: unknown;
      try { json = JSON.parse(text); } catch { json = undefined; }
      return { ok: res.ok, status: res.status, json, text, ms: Date.now() - started };
    } catch (e) {
      return { ok: false, status: 0, text: e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : String(e), ms: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }

  /** One JSON answer: models in order (from `startAt`), keys in rotation within each model. */
  async function generateJson(purpose: string, system: string, user: string, opts: { effort: Effort; temperature: number; startAt?: number; maxTokens?: number }): Promise<AiResult<unknown>> {
    const calls: AiCallLog[] = [];
    if (!keys.length) return { value: null, model: "", calls, error: "no_keys" };
    const order = [...models.slice(opts.startAt ?? 0), ...models.slice(0, opts.startAt ?? 0)];
    let lastError = "no_models";
    for (const model of order) {
      let thinking = thinkingFor(model, opts.effort);
      let tried = 0;
      while (tried < keys.length) {
        if (callsLeft <= 0) return { value: null, model, calls, error: "call_limit" };
        if (cfg.allow && !cfg.allow()) return { value: null, model, calls, error: "budget" };
        const key = keys[keyCursor % keys.length];
        keyCursor++;
        tried++;
        if (dead.has(key)) continue;
        callsLeft--;
        const body = {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: opts.temperature, maxOutputTokens: opts.maxTokens ?? 4096, ...(thinking ? { thinkingConfig: thinking } : {}) },
        };
        const r = await request(model, key, "generateContent", body);
        const usage = r.json?.usageMetadata ?? {};
        const log: AiCallLog = { purpose, model, ms: r.ms, ok: r.ok, tokensIn: usage.promptTokenCount, tokensOut: usage.candidatesTokenCount };
        if (r.ok) {
          const text = (r.json?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
          try {
            const value = JSON.parse(stripFences(text));
            calls.push(log);
            return { value, model, calls };
          } catch {
            calls.push({ ...log, ok: false, error: "unparseable" });
            lastError = "unparseable";
            break; // the same model would likely do it again — try the next model
          }
        }
        const info = readGeminiError({ message: r.text, status: r.status || undefined }, model);
        calls.push({ ...log, error: `${info.kind}${r.status ? ` ${r.status}` : ""}` });
        lastError = info.kind;
        if (info.kind === "dead_key") { dead.add(key); cfg.onDeadKey?.(keyFingerprint(key), info.message.slice(0, 120)); continue; }
        if (info.kind === "thinking_unsupported" && thinking) { thinking = undefined; tried--; continue; }
        if (info.kind === "rate_limited" || info.kind === "refused" || info.kind === "not_for_key") continue;
        if (info.kind === "network" && tried < 2) continue;
        break; // retired, model_cannot, busy, fatal, network → next model
      }
      if (lastError === "fatal") break;
    }
    return { value: null, model: "", calls, error: lastError };
  }

  return {
    name: "gemini",
    async generateItems(req: GenerateRequest): Promise<AiResult<AiItemDraft[]>> {
      const p = generatePrompt(req);
      const r = await generateJson("generate", p.system, p.user, { effort: "standard", temperature: 0.9, maxTokens: 6000 });
      if (r.value === null) return { value: null, model: r.model, calls: r.calls, error: r.error };
      return { value: parseDrafts(r.value, req.type).drafts, model: r.model, calls: r.calls };
    },
    async solveItems(items: SolveRequest[]): Promise<AiResult<SolveAnswer[]>> {
      const p = solvePrompt(items);
      const r = await generateJson("solve", p.system, p.user, { effort: "standard", temperature: 0, startAt: 1 });
      if (r.value === null) return { value: null, model: r.model, calls: r.calls, error: r.error };
      return { value: parseSolve(r.value, items.length), model: r.model, calls: r.calls };
    },
    async judge(req: JudgeRequest): Promise<AiResult<unknown>> {
      const p = judgePrompt(req, req.judge * 7);
      return generateJson(`judge${req.judge}`, p.system, p.user, { effort: "standard", temperature: 0, startAt: req.judge - 1 });
    },
    async embed(texts: string[]): Promise<AiResult<number[][]>> {
      const calls: AiCallLog[] = [];
      if (!keys.length || !texts.length) return { value: null, model: "", calls, error: keys.length ? "empty" : "no_keys" };
      const attempts: { model: string; build: (t: string) => unknown }[] = [
        { model: "gemini-embedding-2", build: (t) => ({ model: "models/gemini-embedding-2", content: { parts: [{ text: `task: sentence similarity | query: ${t.slice(0, 6000)}` }] }, output_dimensionality: 256 }) },
        { model: "gemini-embedding-001", build: (t) => ({ model: "models/gemini-embedding-001", content: { parts: [{ text: t.slice(0, 6000) }] }, taskType: "SEMANTIC_SIMILARITY", outputDimensionality: 256 }) },
      ];
      for (const a of attempts) {
        for (let k = 0; k < Math.min(3, keys.length); k++) {
          if (callsLeft <= 0 || (cfg.allow && !cfg.allow())) return { value: null, model: a.model, calls, error: "budget" };
          const key = keys[keyCursor++ % keys.length];
          if (dead.has(key)) continue;
          callsLeft--;
          const r = await request(a.model, key, "batchEmbedContents", { requests: texts.map(a.build) });
          calls.push({ purpose: "embed", model: a.model, ms: r.ms, ok: r.ok, error: r.ok ? undefined : String(r.status) });
          if (r.ok && Array.isArray(r.json?.embeddings) && r.json.embeddings.length === texts.length) {
            const vectors = (r.json.embeddings as { values: number[] }[]).map((e) => {
              const v = e.values ?? [];
              const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
              return v.map((x) => x / n);
            });
            return { value: vectors, model: a.model, calls };
          }
          const info = readGeminiError({ message: r.text, status: r.status || undefined }, a.model);
          if (info.kind === "dead_key") { dead.add(key); cfg.onDeadKey?.(keyFingerprint(key), info.message.slice(0, 120)); continue; }
          if (info.kind === "rate_limited" || info.kind === "refused") continue;
          break;
        }
      }
      return { value: null, model: "", calls, error: "embed_failed" };
    },
    async coach(req: CoachRequest): Promise<AiResult<string>> {
      const p = coachPrompt(req);
      const r = await generateJson("coach", p.system, p.user, { effort: "fast", temperature: 0.4, maxTokens: 800 });
      const reply = r.value && typeof (r.value as { reply?: unknown }).reply === "string" ? ((r.value as { reply: string }).reply).trim() : null;
      return { value: reply || null, model: r.model, calls: r.calls, error: reply ? undefined : r.error ?? "empty" };
    },
    async report(req: ReportRequest) {
      const p = reportPrompt(req.facts, req.scope);
      const r = await generateJson("report", p.system, p.user, { effort: "standard", temperature: 0.3, maxTokens: 2500 });
      const v = r.value as { claims?: unknown; nextActions?: unknown } | null;
      if (!v || !Array.isArray(v.claims)) return { value: null, model: r.model, calls: r.calls, error: r.error ?? "shape" };
      const claims = (v.claims as Record<string, unknown>[]).map((c) => ({ text: String(c.text ?? "").slice(0, 400), facts: Array.isArray(c.facts) ? (c.facts as unknown[]).map(String).slice(0, 8) : [] })).filter((c) => c.text);
      const nextActions = Array.isArray(v.nextActions) ? (v.nextActions as unknown[]).map((x) => String(x).slice(0, 300)).filter(Boolean).slice(0, 5) : [];
      return { value: { claims, nextActions }, model: r.model, calls: r.calls };
    },
    async practical(req: PracticalRequest): Promise<AiResult<PracticalDraft>> {
      const p = practicalPrompt(req);
      const r = await generateJson("practical", p.system, p.user, { effort: "standard", temperature: 0.8, maxTokens: 3000 });
      const d = parsePractical(r.value);
      return { value: d, model: r.model, calls: r.calls, error: d ? undefined : r.error ?? "invalid_practical" };
    },
  };
}
