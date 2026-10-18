/**
 * The question bank: choosing a fresh item for a session slot and serving it (FR-006 – FR-012, MSRS §12.1).
 *
 * ── The order of things ───────────────────────────────────────────────────────────────────────────
 * 1. Read the learner's seen index (every fingerprint they were ever served — `devos_users/{uid}/seen/s*`).
 * 2. Find a candidate: a validated AI item from the pool for the slot's track / dimension / difficulty / kind, or a
 *    template item generated now (answer computed in code). Either must pass `similarityDecision` against the seen
 *    index: exact, normalized, solution-signature, wording (MinHash) and meaning (embedding SimHash, when present).
 * 3. In ONE transaction: re-check the slot is still empty, write the question (template) or claim the pool item (AI),
 *    write the exposure, append the fingerprint to the seen index, put the item in the session slot.
 * 4. Only then return the learner-safe item — the exposure is recorded BEFORE the content is revealed (MSRS §12.1).
 * Nothing found → the slot is marked `skipped_system` with a reason; it is never filled with a known item (FR-011)
 * and never counted against the learner (FR-030).
 */
import { open, seal, type DevSecrets } from "../core/crypto.js";
import { makeRng } from "../core/rng.js";
import { fingerprintOf, hashHex, similarityDecision, seenEntryOf } from "../core/similarity.js";
import type { DevPolicy } from "../core/policy.js";
import type {
  DevProfile, DevSession, Exposure, Fingerprint, ItemKey, PublicItem, QuestionDoc, SeenEntry, SessionSlot, SimilarityDecision, TrackId,
} from "../core/types.js";
import { NAME_WORDS, timeLimitFor, type Generated } from "../content/kit.js";
import { generateTemplate, signatureOf } from "../content/catalogue.js";
import { patternKeyOf } from "../core/calibration.js";
import { flaggedPatterns } from "./calibration.js";
import { DevError, PATH, type Deps } from "./context.js";
import { closeSession } from "./progress.js";
import type { Doc } from "./store.js";

/** Entries per seen-index shard: ≤ 325 bytes each in Firestore (measured 2026-10-18) → ≤ 0.78 MiB of the 1 MiB limit. */
export const SEEN_SHARD_LIMIT = 2500;

export async function readSeen(deps: Deps, uid: string, shards: number): Promise<SeenEntry[]> {
  const n = Math.max(1, shards || 1);
  const docs = await Promise.all([...Array(n).keys()].map((i) => deps.store.get(PATH.seen(uid, i))));
  return docs.flatMap((d) => (Array.isArray(d?.e) ? (d!.e as SeenEntry[]) : []));
}

export const kindOf = (type: string): "open" | "objective" => (type === "open" ? "open" : "objective");

export const poolStateOf = (track: TrackId, dim: string, difficulty: number, kind: "open" | "objective", status: string) =>
  `${track}|${dim}|${difficulty}|${kind}|${status}`;

/** The text a fingerprint is taken over — everything the learner reads, options included. */
export const fingerprintText = (p: { scenario: string; question: string; options?: string[] }) =>
  [p.scenario, p.question, ...(p.options ?? [])].join("\n");

export interface Candidate {
  source: "template" | "ai";
  qid: string;
  /** For a template: the doc to write. For a pool item: the doc as read. */
  doc: QuestionDoc;
  similarity: SimilarityDecision;
}

/** Build the stored question for a generated template item. */
export async function templateQuestionDoc(
  secrets: DevSecrets, g: Generated, meta: { family: string; familyVersion: string; form: string; setting: string; track: TrackId; dim: QuestionDoc["dim"]; difficulty: QuestionDoc["difficulty"]; seed: string; uid: string; now: number },
): Promise<QuestionDoc> {
  const fp = fingerprintOf({ text: fingerprintText(g), signature: signatureOf(meta.family, meta.form, meta.setting), names: NAME_WORDS });
  const qid = `t_${hashHex(`${meta.seed}|${meta.uid}`)}`;
  const key: ItemKey = g.key;
  return {
    id: qid,
    version: 1,
    source: "template",
    family: meta.family,
    form: meta.form,
    setting: meta.setting,
    track: meta.track,
    dim: meta.dim,
    difficulty: meta.difficulty,
    type: g.type,
    poolState: poolStateOf(meta.track, meta.dim, meta.difficulty, kindOf(g.type), "served"),
    status: "served",
    public: {
      type: g.type, dim: meta.dim, difficulty: meta.difficulty, track: meta.track, scenario: g.scenario, question: g.question,
      options: g.options, unit: g.unit,
      rubric: key.rubric ? { criteria: key.rubric.criteria, passMark: key.rubric.passMark, maxWords: key.rubric.maxWords } : undefined,
      timeLimitSec: timeLimitFor(g.type === "open", meta.difficulty), fictional: true, teaches: g.teaches || undefined,
    },
    key: await seal(secrets, key),
    fp,
    objective: g.objective,
    gap: g.gap,
    validation: { status: "valid", checks: [{ id: "computed_key", passed: true, note: "answer computed by the template" }], at: meta.now },
    provenance: { generator: `template:${meta.family}`, version: `${meta.family}@${meta.familyVersion}#${meta.seed}`, at: meta.now },
    serves: 0,
    servedTo: [],
    createdAt: meta.now,
    updatedAt: meta.now,
  };
}

/**
 * Find a fresh item for a slot, or null. Tries the AI pool for open answers first (templates hold only a few open
 * scenarios per track) and for one objective slot in three (variety); otherwise the templates first.
 */
export async function findCandidate(
  deps: Deps, policy: DevPolicy, p: { uid: string; profile: DevProfile; slot: SessionSlot; seen: SeenEntry[]; seed: string },
): Promise<Candidate | null> {
  const { slot, seen, profile } = p;
  const contentTrack: TrackId = slot.trackOverride ?? profile.track;
  const used = new Set(seen.map((e) => e.s));
  const thresholds = { lexicalJaccard: policy.dedupe.lexicalJaccard, simhashMaxHamming: policy.dedupe.simhashMaxHamming };
  const kind = slot.type === "open" ? "open" : slot.type ? "objective" : undefined;
  const now = deps.now();
  // Patterns calibration has withdrawn for now (FR-013) — neither the pool nor the templates serve them.
  const withdrawn = await flaggedPatterns(deps);

  const fromPool = async (): Promise<Candidate | null> => {
    if (slot.family) return null; // a remediation / league slot asks for a template family
    const kinds: ("open" | "objective")[] = kind ? [kind] : ["objective", "open"];
    for (const k of kinds) {
      const rows = await deps.store.query(PATH.questions, [["poolState", "==", poolStateOf(contentTrack, slot.dim, slot.difficulty, k, "pool")]], { limit: 12 });
      for (const r of rows) {
        const q = r.data as unknown as QuestionDoc;
        if (q.servedTo?.includes(p.uid)) continue;
        if (withdrawn.size && withdrawn.has(patternKeyOf(q))) continue;
        if (!profile.codingRequired && q.validation?.checks?.some((c) => c.id === "requires_code" && !c.passed)) continue;
        const decision = similarityDecision(q.fp, seen, thresholds);
        if (decision.duplicate) continue;
        if (slot.avoidSettings?.includes(q.setting)) continue;
        // A key sealed by another (rotated) server key cannot be scored — retire it from the pool instead of serving it.
        if (!(await open(deps.secrets, q.key))) {
          await deps.store.set(PATH.question(r.id), { status: "quarantined", poolState: poolStateOf(q.track, q.dim, q.difficulty, k, "quarantined"), updatedAt: now }, true);
          continue;
        }
        return { source: "ai", qid: r.id, doc: { ...q, id: r.id }, similarity: decision };
      }
    }
    return null;
  };

  const fromTemplate = async (): Promise<Candidate | null> => {
    const exclude = new Set<string>();
    for (let round = 0; round < 4; round++) {
      const c = generateTemplate({
        dim: slot.dim, difficulty: slot.difficulty, track: profile.track, trackOverride: slot.trackOverride, kind,
        family: slot.family, form: slot.form, avoidSettings: slot.avoidSettings, usedSignatures: used, exclude, excludePatterns: withdrawn, seed: `${p.seed}:${round}`,
      });
      if (!c) {
        // A requested family / kind may be used up — widen once before giving up.
        if (slot.family || kind === "objective") {
          const wider = generateTemplate({ dim: slot.dim, difficulty: slot.difficulty, track: profile.track, trackOverride: slot.trackOverride, kind: kind === "open" ? "open" : undefined, avoidSettings: slot.avoidSettings, usedSignatures: used, exclude, excludePatterns: withdrawn, seed: `${p.seed}:w${round}` });
          if (!wider) return null;
          const doc = await templateQuestionDoc(deps.secrets, wider.generated, { family: wider.family.id, familyVersion: wider.family.version, form: wider.form, setting: wider.setting, track: wider.settingTrack, dim: slot.dim, difficulty: wider.difficulty, seed: wider.seed, uid: p.uid, now });
          const decision = similarityDecision(doc.fp, seen, thresholds);
          if (!decision.duplicate) return { source: "template", qid: doc.id, doc, similarity: decision };
          exclude.add(wider.signature);
          continue;
        }
        return null;
      }
      const doc = await templateQuestionDoc(deps.secrets, c.generated, { family: c.family.id, familyVersion: c.family.version, form: c.form, setting: c.setting, track: c.settingTrack, dim: slot.dim, difficulty: c.difficulty, seed: c.seed, uid: p.uid, now });
      const decision = similarityDecision(doc.fp, seen, thresholds);
      if (!decision.duplicate) return { source: "template", qid: doc.id, doc, similarity: decision };
      exclude.add(c.signature);
    }
    return null;
  };

  const preferPool = kind === "open" || (Number.parseInt(hashHex(p.seed).slice(-2), 16) % 3 === 0);
  if (preferPool) return (await fromPool()) ?? (await fromTemplate());
  return (await fromTemplate()) ?? (await fromPool());
}

/** The learner-safe item: options in this learner's order, no key. */
export function publicItemOf(q: QuestionDoc, optionOrder: number[] | undefined, hintCount: number): PublicItem {
  const pub = q.public;
  const options = pub.options && optionOrder ? optionOrder.map((i) => pub.options![i]) : pub.options;
  return {
    qid: q.id, version: q.version, type: q.type, dim: q.dim, difficulty: q.difficulty, track: q.track,
    scenario: pub.scenario, question: pub.question, options, unit: pub.unit, rubric: pub.rubric,
    hintCount, timeLimitSec: pub.timeLimitSec, fictional: pub.fictional, teaches: pub.teaches,
  };
}

export interface ServeOutcome {
  session: DevSession;
  item: PublicItem | null;
  /** Why no item could be served (shown to the learner as a system status, never as a failure). */
  reason?: string;
}

/**
 * Serve the next unfilled slot of a session (or return the one already served and unanswered). Idempotent: two calls
 * racing for the same slot get the same item.
 */
export async function serveNext(deps: Deps, policy: DevPolicy, uid: string, sessionId: string, hintsAllowed: boolean): Promise<ServeOutcome> {
  const session = (await deps.store.get(PATH.session(uid, sessionId))) as unknown as DevSession | null;
  if (!session) throw new DevError(404, "no_session", "That session does not exist.");
  if (session.state !== "open") return { session, item: null, reason: session.state };
  const index = session.slots.findIndex((s) => s.state === "pending" || s.state === "served");
  if (index < 0) return { session, item: null, reason: "complete" };
  const slot = session.slots[index];
  const timed = slot.purpose === "rank" || slot.purpose === "league";
  if (slot.state === "served" && slot.item && timed && slot.servedAt) {
    // A timed question (rank assessment, league) whose clock ran out — its own limit or the assessment's total time,
    // whichever came first — with nothing sent closes as expired (it counts as 0; no attempt, like the tick's deadline
    // sweep) and the next one is served: at 0:00 the person can move on instead of having to send something just to
    // leave it (found in the browser test). No grace here: the grace is for an ANSWER that arrives a little late; moving
    // on needs none. An answer sent late is still recorded as expired.
    const limitMs = (slot.item.timeLimitSec ?? 0) * 1000;
    const end = Math.min(limitMs > 0 ? slot.servedAt + limitMs : Infinity, session.dueAt);
    if (deps.now() > end) {
      const now = deps.now();
      await deps.store.tx(async (t) => {
        const fresh = (await t.get(PATH.session(uid, sessionId))) as unknown as DevSession | null;
        const s = fresh?.slots[index];
        if (!fresh || !s || s.state !== "served") return;
        fresh.slots[index] = { ...s, state: "expired", reason: `${s.reason ?? ""} — time ran out before an answer was sent.`.trim() };
        if (fresh.slots.every((x) => x.state === "answered" || x.state === "expired" || x.state === "skipped_system")) {
          fresh.state = "complete";
          fresh.completedAt = now;
        }
        t.set(PATH.session(uid, sessionId), fresh as unknown as Doc);
        if (s.qid) t.set(PATH.exposure(uid, s.qid), { state: "expired" }, true);
      });
      return serveNext(deps, policy, uid, sessionId, hintsAllowed);
    }
  }
  // ── The session's own deadline (a quest's 23:00, an assessment's total time) ── No new question is served after it,
  // and the one on screen closes once its answer could no longer arrive in time (the grace is for an answer in flight):
  // the rest is closed as not answered (0) and the caller settles the task — before, a question kept being served that
  // could only ever be recorded as "expired". The baseline has no deadline: it stays open, a week at a time.
  const overdue = session.purpose !== "baseline"
    && deps.now() > session.dueAt + (slot.state === "served" ? policy.scoring.timeGraceSec * 1000 : 0);
  if (overdue) {
    const closed = await closeSession(deps, uid, sessionId, "the time for this ran out before it was answered");
    return { session: closed ?? session, item: null, reason: "expired" };
  }
  if (slot.state === "served" && slot.item) return { session, item: slot.item };

  const profile = (await deps.store.get(PATH.user(uid))) as unknown as DevProfile | null;
  if (!profile) throw new DevError(404, "no_profile", "Start the Development OS first.");
  const shards = (profile as DevProfile & { seenShards?: number }).seenShards ?? 1;
  const seen = await readSeen(deps, uid, shards);
  const seed = `${uid}:${sessionId}:${index}:${deps.now()}`;
  const cand = await findCandidate(deps, policy, { uid, profile, slot, seen, seed });
  const now = deps.now();

  return deps.store.tx(async (t) => {
    const fresh = (await t.get(PATH.session(uid, sessionId))) as unknown as DevSession | null;
    if (!fresh || fresh.state !== "open") return { session: fresh ?? session, item: null, reason: "closed" };
    const s = fresh.slots[index];
    if (s.state === "served" && s.item) return { session: fresh, item: s.item };
    if (s.state !== "pending") return { session: fresh, item: null, reason: s.state };
    if (!cand) {
      fresh.slots[index] = { ...s, state: "skipped_system", reason: `${s.reason ?? ""} — no fresh question was available; this does not count against you.`.trim() };
      if (fresh.slots.every((x) => x.state === "answered" || x.state === "expired" || x.state === "skipped_system")) {
        fresh.state = "complete";
        fresh.completedAt = now;
      }
      t.set(PATH.session(uid, sessionId), fresh as unknown as Doc);
      return { session: fresh, item: null, reason: "no_fresh_item" };
    }
    const shardIndex = Math.max(0, shards - 1);
    const shard = await t.get(PATH.seen(uid, shardIndex));
    let pool: QuestionDoc | null = null;
    if (cand.source === "ai") {
      pool = (await t.get(PATH.question(cand.qid))) as unknown as QuestionDoc | null;
      if (!pool || pool.status !== "pool") throw new DevError(409, "pool_taken", "That question was just taken — please try again.");
    }
    const q = cand.source === "ai" ? { ...pool!, id: cand.qid } : cand.doc;
    const order = q.public.options ? makeRng(`${uid}:${q.id}:order`).shuffle([...q.public.options.keys()]) : undefined;
    const key = await open<ItemKey>(deps.secrets, q.key);
    if (!key) throw new DevError(500, "key_unreadable", "This question's answer key cannot be read; it was skipped.");
    const hintCount = hintsAllowed ? Math.min(3, key.hints?.length ?? 0) : 0;
    const item = publicItemOf(q, order, hintCount);
    // Question: a template item is stored now; a pool item is claimed (one person by default).
    const serves = (q.serves ?? 0) + 1;
    const servedTo = [...new Set([...(q.servedTo ?? []), uid])];
    const exhausted = q.source === "template" || serves >= policy.dedupe.aiItemMaxServes;
    t.set(PATH.question(q.id), {
      ...q, serves, servedTo, status: exhausted ? "served" : "pool",
      poolState: poolStateOf(q.track, q.dim, q.difficulty, kindOf(q.type), exhausted ? "served" : "pool"), updatedAt: now,
    } as unknown as Doc);
    const exposure: Exposure = {
      qid: q.id, version: q.version, sessionId, taskId: fresh.taskId, purpose: s.purpose, dim: s.dim, difficulty: q.difficulty,
      servedAt: now, state: "served", similarity: cand.similarity, optionOrder: order, hintsShown: 0,
    };
    t.set(PATH.exposure(uid, q.id), exposure as unknown as Doc);
    const entries = Array.isArray(shard?.e) ? (shard!.e as SeenEntry[]) : [];
    const entry = seenEntryOf(q.id, q.fp as Fingerprint, s.dim, now);
    if (entries.length >= SEEN_SHARD_LIMIT) {
      t.set(PATH.seen(uid, shardIndex + 1), { e: [entry] });
      t.set(PATH.user(uid), { seenShards: shardIndex + 2, lastActiveAt: now, updatedAt: now }, true);
    } else {
      t.set(PATH.seen(uid, shardIndex), { e: [...entries, entry] });
      t.set(PATH.user(uid), { lastActiveAt: now, updatedAt: now }, true);
    }
    fresh.slots[index] = { ...s, qid: q.id, item, servedAt: now, state: "served" };
    fresh.startedAt = fresh.startedAt ?? now;
    t.set(PATH.session(uid, sessionId), fresh as unknown as Doc);
    return { session: fresh, item };
  });
}
