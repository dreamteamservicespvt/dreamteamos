/**
 * Filling the AI question pool (FR-006, FR-007, FR-009, FR-012, MSRS §13.1) — run by the tick, never while a learner
 * waits. A batch is:
 *   generate (role, dimension, objective, difficulty, things to avoid)
 *   → validate in code (shape, 4 distinct options, one key, no "all of the above", no answer leakage, no coding for
 *     a non-coding role, difficulty within one level, a 4–5 criterion rubric totalling 100 with anchors)
 *   → an independent SOLVER must reach the same key with confidence (mcq) — or the model answer must score ≥ 75 on its
 *     own rubric (open: the rubric can actually grade)
 *   → embed and reject near-duplicates of anything in the bank for that track and dimension (global dedupe)
 *   → store, key sealed, with every check and the model / prompt version (provenance).
 * Bounded by the policy's per-run and per-day budgets (FR-027, NFR-018); every batch leaves a job record.
 */
import { seal } from "../core/crypto.js";
import { DIMENSION_BY_ID } from "../core/dimensions.js";
import { TRACK_OBJECTIVES } from "../core/dimensions.js";
import { fingerprintOf, hashHex, similarityDecision, seenEntryOf } from "../core/similarity.js";
import { checkJudgeOutput } from "../core/scoring.js";
import type { DevPolicy } from "../core/policy.js";
import type { AiCallLog, Difficulty, DimensionId, ItemKey, QuestionDoc, Rubric, SeenEntry, TrackId, ValidationCheck } from "../core/types.js";
import { timeLimitFor } from "../content/kit.js";
import { fingerprintText, poolStateOf } from "./bank.js";
import { PATH, shortId, type AiItemDraft, type Deps } from "./context.js";
import { META_SENTENCE, PROMPT_VERSION } from "./prompts.js";
import type { Doc } from "./store.js";

export interface PoolTarget {
  track: TrackId;
  dim: DimensionId;
  difficulty: Difficulty;
  kind: "objective" | "open";
}

/** Code checks on one draft (empty = passes). */
export function draftProblems(d: AiItemDraft, want: { difficulty: number; codingAllowed: boolean }): string[] {
  const p: string[] = [];
  if (d.scenario.length < 40) p.push("scenario too short");
  if (d.question.length < 10) p.push("question too short");
  if (!d.explanation || d.explanation.length < 20) p.push("no explanation");
  if (!d.hints.length) p.push("no hints");
  if (!d.solutionLogic) p.push("no solution logic");
  if (d.requiresCode && !want.codingAllowed) p.push("requires coding");
  if (/\b(python|javascript|sql|function\s*\(|<script|def |console\.log)\b/i.test(`${d.scenario} ${d.question}`) && !want.codingAllowed) p.push("mentions code");
  if (Math.abs((d.difficulty || want.difficulty) - want.difficulty) > 1) p.push("difficulty off");
  if (/https?:\/\/|www\.|@[a-z0-9-]+\.(com|in|org)/i.test(`${d.scenario} ${d.question} ${(d.options ?? []).join(" ")}`)) p.push("contains a link or email");
  // The scenario's design notes are stripped when parsed (prompts.cleanScenario); in the question or an option they spoil it.
  if (META_SENTENCE.test(`${d.question} ${(d.options ?? []).join(" ")}`)) p.push("says what the item tests");
  if (d.type === "mcq") {
    const opts = d.options ?? [];
    if (opts.length !== 4) p.push("needs exactly 4 options");
    if (new Set(opts.map((o) => o.toLowerCase().trim())).size !== opts.length || opts.some((o) => !o)) p.push("options not distinct");
    if (!(Number.isInteger(d.correct) && (d.correct as number) >= 0 && (d.correct as number) < opts.length)) p.push("no valid key");
    if (opts.some((o) => /\b(all|none|both) of (the )?(above|these)\b/i.test(o))) p.push("all/none of the above");
    const right = opts[d.correct ?? -1];
    if (right && right.split(/\s+/).length >= 4 && d.scenario.toLowerCase().includes(right.toLowerCase())) p.push("answer leaked in the scenario");
    const lens = opts.map((o) => o.length);
    if (right && lens.length === 4 && right.length > 2.2 * Math.max(...lens.filter((_, i) => i !== d.correct))) p.push("the key is conspicuously longer");
  } else {
    const c = d.rubric?.criteria ?? [];
    if (c.length < 3 || c.length > 6) p.push("rubric needs 3–6 criteria");
    if (c.reduce((s, x) => s + (x.weight || 0), 0) !== 100) p.push("rubric weights do not total 100");
    if (c.some((x) => !x.id || !x.label || !x.anchors[0] || !x.anchors[2] || !x.anchors[4])) p.push("rubric anchors missing");
    if (new Set(c.map((x) => x.id)).size !== c.length) p.push("duplicate criterion ids");
    if (!d.exemplar || d.exemplar.length < 40) p.push("no model answer");
  }
  return p;
}

interface BankIndexDoc { e: SeenEntry[] }

/**
 * The newest AI items one track + dimension's global dedupe index keeps. Measured 2026-10-18: an entry is ≤ 325 bytes
 * in Firestore, so 2,000 = 0.62 MiB — 3,000 (0.93 MiB) sat within 7% of the 1 MiB document limit, past which every
 * write of the index (and so every accepted AI question) would fail. Older items still never reach a person twice:
 * the per-person seen index (`bank.SEEN_SHARD_LIMIT` per shard, ≤ 0.78 MiB, then a new shard) is the guarantee.
 */
export const BANK_INDEX_LIMIT = 2000;

const bankIndexPath = (track: TrackId, dim: DimensionId) => `devos_bank/idx_${track}_${dim}`;

export interface ReplenishResult {
  targets: number;
  generated: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  reasons: string[];
  calls: AiCallLog[];
}

/** Fill up to `maxBatches` pool keys that are below the policy's target. */
export async function replenishPool(deps: Deps, policy: DevPolicy, targets: PoolTarget[], maxBatches: number): Promise<ReplenishResult> {
  const out: ReplenishResult = { targets: 0, generated: 0, accepted: 0, rejected: 0, duplicates: 0, reasons: [], calls: [] };
  if (!deps.ai || !policy.ai.enabled) return out;
  for (const t of targets) {
    if (out.targets >= maxBatches) break;
    const have = await deps.store.query(PATH.questions, [["poolState", "==", poolStateOf(t.track, t.dim, t.difficulty, t.kind, "pool")]], { limit: policy.ai.poolTarget });
    if (have.length >= policy.ai.poolTarget) continue;
    out.targets++;
    const r = await generateBatch(deps, policy, t, Math.min(policy.ai.generateBatch, policy.ai.poolTarget - have.length + 1));
    out.generated += r.generated;
    out.accepted += r.accepted;
    out.rejected += r.rejected;
    out.duplicates += r.duplicates;
    out.reasons.push(...r.reasons);
    out.calls.push(...r.calls);
  }
  return out;
}

export async function generateBatch(deps: Deps, policy: DevPolicy, t: PoolTarget, count: number): Promise<Omit<ReplenishResult, "targets">> {
  const ai = deps.ai!;
  const now = deps.now();
  const jobId = shortId("gen_");
  const res: Omit<ReplenishResult, "targets"> = { generated: 0, accepted: 0, rejected: 0, duplicates: 0, reasons: [], calls: [] };
  const index = ((await deps.store.get(bankIndexPath(t.track, t.dim))) as unknown as BankIndexDoc | null)?.e ?? [];
  const recent = await deps.store.query(PATH.questions, [["poolState", "==", poolStateOf(t.track, t.dim, t.difficulty, t.kind, "served")]], { limit: 15 });
  const avoid = recent.map((r) => String((r.data as unknown as QuestionDoc).objective ?? "")).filter(Boolean);
  const type = t.kind === "open" ? "open" : "mcq";
  const gen = await ai.generateItems({
    track: t.track, dim: t.dim, dimName: DIMENSION_BY_ID[t.dim].name, objective: TRACK_OBJECTIVES[t.track][t.dim], difficulty: t.difficulty, type,
    count, avoid, codingAllowed: false, language: policy.languages[0] ?? "en",
  });
  res.calls.push(...gen.calls);
  const drafts = gen.value ?? [];
  res.generated = drafts.length;
  const checksOf = new Map<AiItemDraft, ValidationCheck[]>();
  let valid = drafts.filter((d) => {
    const problems = draftProblems(d, { difficulty: t.difficulty, codingAllowed: false });
    checksOf.set(d, [{ id: "schema", passed: !problems.length, note: problems.join("; ") || undefined }, { id: "requires_code", passed: !d.requiresCode }]);
    if (problems.length) { res.rejected++; res.reasons.push(`rejected: ${problems.join(", ")}`); }
    return !problems.length;
  });
  if (type === "mcq" && valid.length) {
    const solved = await ai.solveItems(valid.map((d) => ({ scenario: d.scenario, question: d.question, options: d.options! })));
    res.calls.push(...solved.calls);
    if (!solved.value) {
      res.rejected += valid.length;
      res.reasons.push("solver unavailable — batch not used");
      valid = [];
    } else {
      valid = valid.filter((d, i) => {
        const a = solved.value![i];
        const agree = a.index === d.correct && !a.ambiguous && a.confidence >= 0.6;
        checksOf.get(d)!.push({ id: "independent_solver", passed: agree, note: agree ? undefined : `solver chose ${a.index} (key ${d.correct})${a.ambiguous ? ", ambiguous" : ""}${a.issues.length ? `: ${a.issues.join("; ")}` : ""}` });
        if (!agree) { res.rejected++; res.reasons.push("rejected: the independent solver did not reach the key"); }
        return agree;
      });
    }
  } else if (type === "open") {
    const kept: AiItemDraft[] = [];
    for (const d of valid) {
      const rubric: Rubric = { version: `ai-${hashHex(JSON.stringify(d.rubric))}`, criteria: d.rubric!.criteria, passMark: d.rubric!.passMark || 60, maxWords: 150 };
      const j = await ai.judge({ scenario: d.scenario, question: d.question, rubric, answer: d.exemplar!, judge: 1 });
      res.calls.push(...j.calls);
      const v = j.value ? checkJudgeOutput(j.value, rubric, d.exemplar!, j.model, now).verdict : null;
      const passes = !!v && v.score >= 75;
      checksOf.get(d)!.push({ id: "rubric_grades_model_answer", passed: passes, note: v ? `model answer scored ${v.score}` : "could not grade the model answer" });
      if (passes) kept.push(d);
      else { res.rejected++; res.reasons.push("rejected: the rubric did not grade its own model answer well"); }
    }
    valid = kept;
  }
  if (!valid.length) {
    await recordJob(deps, jobId, t, res, now);
    return res;
  }
  let vectors: number[][] | null = null;
  if (policy.ai.embeddings) {
    const e = await ai.embed(valid.map((d) => fingerprintText(d)));
    res.calls.push(...e.calls);
    vectors = e.value;
  }
  const thresholds = { lexicalJaccard: policy.dedupe.lexicalJaccard, simhashMaxHamming: policy.dedupe.simhashMaxHamming };
  const accepted: { doc: QuestionDoc; entry: SeenEntry }[] = [];
  for (const [i, d] of valid.entries()) {
    const fp = fingerprintOf({ text: fingerprintText(d), signature: `ai:${hashHex(d.solutionLogic.toLowerCase())}`, embedding: vectors?.[i] ?? null });
    const decision = similarityDecision(fp, [...index, ...accepted.map((a) => a.entry)], thresholds);
    if (decision.duplicate) { res.duplicates++; res.reasons.push(`duplicate (${decision.reason}) of ${decision.nearest}`); continue; }
    const qid = `a_${hashHex(`${jobId}:${i}:${fp.x}`)}`;
    const rubric: Rubric | undefined = d.type === "open" ? { version: `ai-${hashHex(JSON.stringify(d.rubric))}`, criteria: d.rubric!.criteria, passMark: d.rubric!.passMark || 60, maxWords: 150 } : undefined;
    const key: ItemKey = { correct: d.type === "mcq" ? [d.correct!] : undefined, rubric, explanation: d.explanation, hints: d.hints.slice(0, 3), exemplar: d.exemplar };
    const setting = `ai-${hashHex(d.solutionLogic.toLowerCase()).slice(0, 8)}`;
    const doc: QuestionDoc = {
      id: qid, version: 1, source: "ai", family: "ai", form: d.type, setting, track: t.track, dim: t.dim, difficulty: t.difficulty, type: d.type,
      poolState: poolStateOf(t.track, t.dim, t.difficulty, t.kind, "pool"), status: "pool",
      public: {
        type: d.type, dim: t.dim, difficulty: t.difficulty, track: t.track, scenario: d.scenario, question: d.question, options: d.options,
        rubric: rubric ? { criteria: rubric.criteria, passMark: rubric.passMark, maxWords: rubric.maxWords } : undefined,
        timeLimitSec: timeLimitFor(d.type === "open", t.difficulty), fictional: true,
      },
      key: await seal(deps.secrets, key), fp, objective: d.objective || TRACK_OBJECTIVES[t.track][t.dim], gap: d.type === "open" ? "communication" : "reading",
      validation: { status: "valid", checks: [...checksOf.get(d)!, { id: "dedupe", passed: true, note: `${decision.method}; nearest ${decision.score ?? 0}` }], solverAgreed: d.type === "mcq" ? true : undefined, at: now },
      provenance: { generator: "ai", version: PROMPT_VERSION, model: gen.model, jobId, at: now },
      serves: 0, servedTo: [], createdAt: now, updatedAt: now,
    };
    accepted.push({ doc, entry: seenEntryOf(qid, fp, t.dim, now) });
  }
  if (accepted.length) {
    await deps.store.batch(accepted.map((a) => ({ path: PATH.question(a.doc.id), data: a.doc as unknown as Doc })));
    await deps.store.set(bankIndexPath(t.track, t.dim), { e: [...index, ...accepted.map((a) => a.entry)].slice(-BANK_INDEX_LIMIT) });
  }
  res.accepted = accepted.length;
  await recordJob(deps, jobId, t, res, now);
  return res;
}

async function recordJob(deps: Deps, jobId: string, t: PoolTarget, r: Omit<ReplenishResult, "targets">, now: number) {
  await deps.store.set(PATH.job(jobId), {
    id: jobId, type: "generate_items", status: r.accepted ? "done" : "failed", tries: 1, input: { ...t },
    result: { generated: r.generated, accepted: r.accepted, rejected: r.rejected, duplicates: r.duplicates, reasons: r.reasons.slice(0, 12) },
    calls: r.calls.slice(0, 20), createdAt: now, updatedAt: deps.now(),
  }).catch(() => undefined);
}
