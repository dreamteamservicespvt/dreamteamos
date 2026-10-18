/**
 * A deterministic stand-in for Gemini — for the unit tests and the browser harness (MSRS §17: "deterministic AI
 * mocks/fixtures where appropriate"). It behaves like a careful model: generated items come from the template
 * families (so their keys are right), the solver knows those keys, the judge scores by how much of each criterion's
 * top anchor the answer covers and quotes the answer word for word, and embeddings are a hashed bag of words (similar
 * texts → similar vectors). Switches make it misbehave on purpose: a wrong key, judges that disagree, an outage.
 */
import { makeRng } from "../core/rng.js";
import { cyrb53 } from "../core/similarity.js";
import type { Difficulty, DimensionId, TrackId } from "../core/types.js";
import { generateTemplate } from "../content/catalogue.js";
import type { AiItemDraft, AiPort, AiResult, PracticalDraft } from "./context.js";

export interface FakeAiOptions {
  /** Every n-th generated mcq gets a wrong key (the solver catches it). 0 = never. */
  wrongKeyEvery?: number;
  /** The second judge scores far from the first (forces adjudication). */
  disagree?: boolean;
  /** Every call fails (an outage). */
  down?: boolean;
  /** The judge returns a quote that is not in the answer (hallucinated evidence). */
  fabricate?: boolean;
}

const ok = <T,>(value: T, purpose: string): AiResult<T> => ({ value, model: "fake-model", calls: [{ purpose, model: "fake-model", ms: 5, ok: true }] });
const fail = <T,>(purpose: string): AiResult<T> => ({ value: null, model: "", calls: [{ purpose, model: "fake-model", ms: 5, ok: false, error: "down" }], error: "down" });

const words = (s: string) => s.toLowerCase().match(/[a-zఀ-౿]{4,}/g) ?? [];

export function fakeAi(opts: FakeAiOptions = {}): AiPort & { keys: Map<string, number>; calls: number } {
  const keys = new Map<string, number>();
  let n = 0;
  const port = {
    name: "fake",
    keys,
    calls: 0,
    async generateItems(req: { track: TrackId; dim: string; difficulty: number; type: "mcq" | "open"; count: number }) {
      port.calls++;
      if (opts.down) return fail<AiItemDraft[]>("generate");
      const drafts: AiItemDraft[] = [];
      const used = new Set<string>();
      for (let i = 0; i < req.count; i++) {
        const c = generateTemplate({ dim: req.dim as DimensionId, difficulty: req.difficulty as Difficulty, track: req.track, kind: req.type === "open" ? "open" : "objective", usedSignatures: used, seed: `fake:${req.track}:${req.dim}:${req.difficulty}:${n}:${i}` });
        if (!c) break;
        used.add(c.signature);
        const g = c.generated;
        if (req.type === "mcq" && g.type !== "mcq") continue;
        n++;
        const correct = g.key.correct?.[0] ?? 0;
        const wrong = opts.wrongKeyEvery && n % opts.wrongKeyEvery === 0;
        const shownCorrect = wrong ? (correct + 1) % (g.options?.length ?? 4) : correct;
        if (g.type === "mcq") keys.set(g.question + "|" + g.scenario.slice(0, 80), correct);
        drafts.push({
          type: g.type === "open" ? "open" : "mcq", scenario: `[AI] ${g.scenario}`, question: g.question, options: g.options, correct: g.type === "mcq" ? shownCorrect : undefined,
          explanation: g.key.explanation, hints: g.key.hints, rubric: g.key.rubric ? { criteria: g.key.rubric.criteria, passMark: g.key.rubric.passMark } : undefined,
          exemplar: g.key.exemplar, solutionLogic: `fake ${c.signature} ${n}`, objective: g.objective, difficulty: req.difficulty, requiresCode: false,
        });
      }
      return ok(drafts, "generate");
    },
    async solveItems(items: { scenario: string; question: string; options: string[] }[]) {
      port.calls++;
      if (opts.down) return fail<{ index: number | null; confidence: number; ambiguous: boolean; issues: string[] }[]>("solve");
      return ok(items.map((q) => {
        const k = keys.get(q.question + "|" + q.scenario.replace(/^\[AI\] /, "").slice(0, 80));
        return { index: k ?? 0, confidence: k === undefined ? 0.3 : 0.92, ambiguous: false, issues: [] };
      }), "solve");
    },
    async judge(req: { rubric: { criteria: { id: string; anchors: { 4: string } }[] }; answer: string; judge: 1 | 2 | 3 }) {
      port.calls++;
      if (opts.down) return fail<unknown>("judge");
      const answerWords = new Set(words(req.answer));
      const sentences = req.answer.split(/(?<=[.!?])\s+/).filter(Boolean);
      const criteria = req.rubric.criteria.map((c, i) => {
        const want = words(c.anchors[4]);
        const hit = want.filter((w) => answerWords.has(w)).length;
        const ratio = want.length ? hit / want.length : 0;
        const length = Math.min(1, answerWords.size / 25);
        let score = Math.max(0, Math.min(4, Math.round((ratio * 2.5 + length * 1.5) * (4 / 4))));
        if (opts.disagree && req.judge === 2) score = score >= 2 ? 0 : 4;
        if (req.judge === 3) score = Math.max(0, Math.min(4, score));
        const quote = opts.fabricate ? "this sentence was never written by the candidate" : (sentences.find((s) => want.some((w) => s.toLowerCase().includes(w))) ?? sentences[i % Math.max(1, sentences.length)] ?? "").trim();
        return { id: c.id, score, evidence: score > 0 ? quote : "", note: score >= 3 ? "covers it" : "partly" };
      });
      return ok({ criteria, confidence: 0.85, summary: "Graded against the rubric.", gaps: criteria.filter((c) => c.score < 3).map((c) => `More on ${c.id}`) }, `judge${req.judge}`);
    },
    async embed(texts: string[]) {
      port.calls++;
      if (opts.down) return fail<number[][]>("embed");
      return ok(texts.map((t) => {
        const v = new Array(64).fill(0);
        for (const w of words(t)) v[cyrb53(w) % 64] += 1;
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
        return v.map((x) => x / norm);
      }), "embed");
    },
    async coach(req: { explanation: string; ask: string }) {
      port.calls++;
      if (opts.down) return fail<string>("coach");
      return ok(`Good question. ${req.explanation} Next time, check each step against the rule before you choose.`, "coach");
    },
    async report(req: { facts: { id: string; text: string }[] }) {
      port.calls++;
      if (opts.down) return fail<{ claims: { text: string; facts: string[] }[]; nextActions: string[] }>("report");
      return ok({
        claims: req.facts.slice(0, 4).map((f) => ({ text: f.text, facts: [f.id] })),
        nextActions: ["Encourage people who have not started to take their baseline.", "Review the weakest dimension with each team leader."],
      }, "report");
    },
    async practical(req: { track: TrackId; difficulty: number }) {
      port.calls++;
      if (opts.down) return fail<PracticalDraft>("practical");
      const r = makeRng(`practical:${req.track}:${n++}`);
      return ok<PracticalDraft>({
        title: `Improve one step of your ${req.track} work`, brief: "Pick one step of your daily work that often goes wrong, measure it for three days, change one thing, and measure again. Report the numbers and what you learned.",
        evidence: [{ id: "before", label: "What you measured before", kind: "text", required: true }, { id: "after", label: "What changed and the new numbers", kind: "text", required: true }],
        rubric: { criteria: [
          { id: "evidence", label: "Real numbers", weight: 40, anchors: { 0: "none", 2: "some", 4: "before and after numbers" }, critical: true },
          { id: "change", label: "One clear change", weight: 30, anchors: { 0: "none", 2: "vague", 4: "one specific change" } },
          { id: "lesson", label: "Lesson", weight: 30, anchors: { 0: "none", 2: "generic", 4: "a reusable lesson" } },
        ], passMark: 60 },
        exemplar: `Before: ${r.int(5, 9)} re-renders a week. Changed: a checklist before rendering. After: 2 a week.`,
      }, "practical");
    },
  };
  return port as unknown as AiPort & { keys: Map<string, number>; calls: number };
}
