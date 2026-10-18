/**
 * The no-repeat guarantee's measuring tools (FR-008, FR-009, AC-005, AC-006).
 *
 * A question is a repeat for a learner when ANY of these says so against an item they have seen:
 *   1. exact      — the same text (hash `x`);
 *   2. normalized — the same text once names, numbers, amounts and punctuation are stripped (hash `n`): a variant
 *                   with "changed names/numbers" (AC-006) is caught here;
 *   3. signature  — the same solution path in the same scenario (`s`: a template's `family:form:setting`, an AI item's
 *                   canonical answer logic) — "superficial word changes do not make a question new" (FR-009);
 *   4. lexical    — word-shingle MinHash Jaccard ≥ the policy threshold (paraphrases that keep the wording);
 *   5. semantic   — the embeddings' SimHash Hamming distance ≤ the policy threshold (paraphrases that change the
 *                   wording), when an embedding exists for both.
 * The underlying learning objective MAY recur in a meaningfully different scenario or form (MSRS §5.2) — that is what
 * the signature allows and the other checks police.
 *
 * Pure: no I/O. Hashes are cyrb53 (53-bit, public domain) — fingerprints, not security.
 */
import type { Fingerprint, SeenEntry, SimilarityDecision } from "./types.js";

export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export const hashHex = (s: string, seed = 0): string => cyrb53(s, seed).toString(16).padStart(14, "0");

const STOP = new Set(
  ("a an the of to in on for and or is are was were be been being with at by from this that these those it its as " +
    "which what who whom whose when where why how do does did has have had will would should can could may might " +
    "must shall not no yes than then so such into onto about over under after before between each every any all " +
    "you your he she they them their his her we our us i me my").split(" "),
);

const NUMBER_WORDS = new Set(
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen twenty thirty hundred thousand first second third fourth fifth sixth seventh eighth".split(" "),
);

/**
 * Text with the parts a superficial rewrite changes taken out: amounts, numbers and number words → "#", names → "@"
 * (a capitalised word that does not start a sentence, or any word in `names` — the content library passes its pools of
 * people and businesses, so a name that opens a sentence is caught too), punctuation dropped, lower case.
 */
export function normalizeText(text: string, names?: ReadonlySet<string>): string {
  const withNums = text
    .replace(/[₹$€£]\s?\d[\d,]*(?:\.\d+)?/g, " # ")
    .replace(/\d+(?:[.,:/-]\d+)*\s?%?/g, " # ");
  const tokens = withNums.split(/(\s+)/);
  let sentenceStart = true;
  const out: string[] = [];
  for (const tok of tokens) {
    if (!tok.trim()) continue;
    const word = tok.replace(/^[^\p{L}\p{N}#@]+|[^\p{L}\p{N}#@]+$/gu, "");
    const endsSentence = /[.!?:]["')\]]*$/.test(tok);
    if (word) {
      const lower = word.toLowerCase();
      const capital = /^\p{Lu}[\p{L}'’-]*$/u.test(word) && word.length > 1;
      const isName = (capital && !sentenceStart) || (capital && !!names?.has(word.replace(/['’]s$/u, "")));
      out.push(isName ? "@" : NUMBER_WORDS.has(lower) ? "#" : lower);
    }
    sentenceStart = endsSentence;
  }
  // Consecutive placeholders are one entity ("Sri Lakshmi Jewellers" → "@").
  return out.join(" ").replace(/(@\s?)+/g, "@ ").replace(/(#\s?)+/g, "# ").replace(/\s+/g, " ").trim();
}

/** Word k-grams of the normalized text without stopwords (k = 3, or 2 / 1 for very short texts). */
export function shingles(normalized: string): string[] {
  const words = normalized.split(" ").filter((w) => w && !STOP.has(w));
  const k = words.length >= 12 ? 3 : words.length >= 5 ? 2 : 1;
  const set = new Set<string>();
  for (let i = 0; i + k <= words.length; i++) set.add(words.slice(i, i + k).join(" "));
  return [...set];
}

export const MINHASH_SIZE = 24;

/** MinHash signature: MINHASH_SIZE values of 24 bits, as one hex string (6 characters each). */
export function minhash(sh: readonly string[]): string {
  const mins: number[] = new Array(MINHASH_SIZE).fill(0xffffff);
  for (const s of sh) {
    for (let i = 0; i < MINHASH_SIZE; i++) {
      const h = cyrb53(s, i + 101) & 0xffffff;
      if (h < mins[i]) mins[i] = h;
    }
  }
  return mins.map((v) => v.toString(16).padStart(6, "0")).join("");
}

/** Estimated Jaccard similarity of two MinHash signatures (0–1). Empty signatures compare as 0. */
export function jaccardEstimate(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 0;
  const n = a.length / 6;
  let same = 0;
  for (let i = 0; i < n; i++) if (a.slice(i * 6, i * 6 + 6) === b.slice(i * 6, i * 6 + 6) && a.slice(i * 6, i * 6 + 6) !== "ffffff") same++;
  return same / n;
}

// ── Embeddings ────────────────────────────────────────────────────────────────────────────────────

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const planesCache = new Map<number, Float64Array[]>();

/** 64 fixed random hyperplanes for a dimension (seeded — the same on every server and browser). */
function planesFor(dim: number): Float64Array[] {
  const cached = planesCache.get(dim);
  if (cached) return cached;
  const planes: Float64Array[] = [];
  let state = 0x9e3779b9 ^ dim;
  const rand = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let p = 0; p < 64; p++) {
    const v = new Float64Array(dim);
    for (let i = 0; i < dim; i++) {
      // Box–Muller: Gaussian planes make the Hamming distance track the angle between vectors.
      const u1 = Math.max(rand(), 1e-12);
      const u2 = rand();
      v[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
    planes.push(v);
  }
  planesCache.set(dim, planes);
  return planes;
}

/** 64-bit SimHash of an embedding (16 hex characters): one bit per hyperplane side. */
export function simhash(vec: readonly number[]): string {
  if (!vec.length) return "";
  const planes = planesFor(vec.length);
  let hex = "";
  for (let block = 0; block < 16; block++) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) {
      const plane = planes[block * 4 + b];
      let dot = 0;
      for (let i = 0; i < vec.length; i++) dot += plane[i] * vec[i];
      nibble = (nibble << 1) | (dot >= 0 ? 1 : 0);
    }
    hex += nibble.toString(16);
  }
  return hex;
}

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

export function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

/** cosine ≈ cos(π · hamming / 64) for random-hyperplane SimHash. */
export const cosineFromHamming = (h: number): number => Math.cos((Math.PI * h) / 64);

// ── Fingerprints and the decision ─────────────────────────────────────────────────────────────────

export interface FingerprintInput {
  /** Everything a learner reads: scenario + question + options. */
  text: string;
  /** The solution signature (template family:form:setting, or "ai:<hash of the answer logic>"). */
  signature: string;
  embedding?: number[] | null;
  /** Known proper nouns (the content library's name pools). */
  names?: ReadonlySet<string>;
}

export function fingerprintOf(input: FingerprintInput): Fingerprint {
  const norm = normalizeText(input.text, input.names);
  return {
    x: hashHex(input.text.trim()),
    n: hashHex(norm),
    m: minhash(shingles(norm)),
    e: input.embedding && input.embedding.length ? simhash(input.embedding) : undefined,
    s: input.signature,
  };
}

export interface SimilarityThresholds {
  lexicalJaccard: number;
  simhashMaxHamming: number;
}

/**
 * Is `fp` a repeat of anything in `seen`? The first rule that matches decides (exact → normalized → signature →
 * lexical → semantic); otherwise the closest lexical neighbour is reported for the audit trail.
 */
export function similarityDecision(fp: Fingerprint, seen: readonly SeenEntry[], t: SimilarityThresholds): SimilarityDecision {
  const method = fp.e ? "exact+normalized+signature+minhash+simhash" : "exact+normalized+signature+minhash";
  let nearest: string | undefined;
  let best = 0;
  for (const e of seen) {
    if (e.x === fp.x) return { duplicate: true, reason: "exact", nearest: e.q, score: 1, checked: seen.length, method };
    if (e.n === fp.n) return { duplicate: true, reason: "normalized", nearest: e.q, score: 1, checked: seen.length, method };
    if (e.s && e.s === fp.s) return { duplicate: true, reason: "signature", nearest: e.q, score: 1, checked: seen.length, method };
    const j = jaccardEstimate(fp.m, e.m);
    if (j >= t.lexicalJaccard) return { duplicate: true, reason: "lexical", nearest: e.q, score: round(j), checked: seen.length, method };
    if (fp.e && e.e) {
      const h = hamming(fp.e, e.e);
      if (h <= t.simhashMaxHamming) {
        return { duplicate: true, reason: "semantic", nearest: e.q, score: round(cosineFromHamming(h)), checked: seen.length, method };
      }
    }
    if (j > best) {
      best = j;
      nearest = e.q;
    }
  }
  return { duplicate: false, reason: "none", nearest, score: round(best), checked: seen.length, method };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** The seen-index entry for a served question. */
export function seenEntryOf(qid: string, fp: Fingerprint, dim: SeenEntry["d"], at: number): SeenEntry {
  const e: SeenEntry = { q: qid, x: fp.x, n: fp.n, m: fp.m, s: fp.s, d: dim, t: at };
  if (fp.e) e.e = fp.e;
  return e;
}
