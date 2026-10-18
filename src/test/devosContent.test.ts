/**
 * The Development OS content library (2026-10-18): every template family, track, setting, form and difficulty must
 * produce a well-formed item with a valid, computed answer key — the "question-generation contract" layer of MSRS §18.1.
 */
import { describe, expect, it } from "vitest";
import { FAMILIES, combosFor, coverage, generateTemplate, signatureOf } from "@/devos/content/catalogue";
import { makeRng } from "@/devos/core/rng";
import { DIMENSION_IDS } from "@/devos/core/dimensions";
import { fingerprintOf, jaccardEstimate, normalizeText, similarityDecision, seenEntryOf } from "@/devos/core/similarity";
import type { Difficulty, TrackId } from "@/devos/core/types";
import { NAME_WORDS } from "@/devos/content/kit";

const TRACKS: TrackId[] = ["sales", "technical", "admin"];
const BAD_TEXT = /undefined|NaN|\[object Object\]|Infinity/;

function textOf(g: { scenario: string; question: string; options?: string[]; key: { explanation: string; hints: string[] } }) {
  return [g.scenario, g.question, ...(g.options ?? []), g.key.explanation, ...g.key.hints].join("\n");
}

describe("devos content — every family generates valid items", () => {
  for (const f of FAMILIES) {
    it(`${f.id}: all tracks × settings × forms × difficulties`, () => {
      let made = 0;
      for (const t of TRACKS) {
        for (const setting of f.settings[t]) {
          for (const form of f.forms) {
            for (let d = f.minDifficulty; d <= f.maxDifficulty; d++) {
              let ok = 0;
              for (let s = 0; s < 5; s++) {
                let g;
                try {
                  g = f.generate({ track: t, difficulty: d as Difficulty, form, setting, rng: makeRng(`${f.id}:${t}:${setting}:${form}:${d}:${s}`) });
                } catch {
                  continue;
                }
                ok++;
                made++;
                expect(g.scenario.trim().length, `${f.id} ${setting} ${form} d${d}: scenario`).toBeGreaterThan(10);
                expect(g.question.trim().length).toBeGreaterThan(5);
                expect(g.key.explanation.trim().length).toBeGreaterThan(10);
                expect(g.key.hints.length).toBeGreaterThan(0);
                expect(BAD_TEXT.test(textOf(g)), `${f.id} ${setting} ${form} d${d}: ${textOf(g).match(BAD_TEXT)?.[0]}`).toBe(false);
                if (g.type === "mcq" || g.type === "multi") {
                  expect(g.options!.length).toBeGreaterThanOrEqual(3);
                  expect(new Set(g.options!.map((o) => o.trim().toLowerCase())).size, `${f.id} ${setting} ${form} d${d}: distinct options ${JSON.stringify(g.options)}`).toBe(g.options!.length);
                  expect(g.key.correct!.length).toBe(1);
                  expect(g.key.correct![0]).toBeGreaterThanOrEqual(0);
                  expect(g.key.correct![0]).toBeLessThan(g.options!.length);
                } else if (g.type === "numeric") {
                  expect(Number.isFinite(g.key.value)).toBe(true);
                } else if (g.type === "order") {
                  expect([...g.key.order!].sort((a, b) => a - b)).toEqual(g.options!.map((_, i) => i));
                } else if (g.type === "open") {
                  const r = g.key.rubric!;
                  expect(r.criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
                  expect(r.criteria.every((c) => c.anchors[0] && c.anchors[2] && c.anchors[4])).toBe(true);
                  expect(g.key.exemplar!.length).toBeGreaterThan(40);
                }
              }
              expect(ok, `${f.id} ${t}/${setting}/${form} d${d}: no seed of 5 produced an item`).toBeGreaterThan(0);
            }
          }
        }
      }
      expect(made).toBeGreaterThan(0);
    });
  }
});

describe("devos content — catalogue", () => {
  it("covers every dimension in every track", () => {
    const cov = coverage();
    for (const t of TRACKS) for (const d of DIMENSION_IDS) {
      const c = cov[t][d];
      expect(c.objective + c.open, `${t}/${d}`).toBeGreaterThan(0);
    }
  });

  it("never offers a used signature and honours avoidSettings", () => {
    const used = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const c = generateTemplate({ dim: "logical", difficulty: 3, track: "sales", usedSignatures: used, seed: `s${i}` });
      if (!c) break;
      expect(used.has(c.signature)).toBe(false);
      used.add(c.signature);
    }
    const avoid = combosFor({ dim: "decision", difficulty: 2, track: "technical", usedSignatures: new Set(), seed: "a", avoidSettings: ["fixes"] });
    expect(avoid.some((c) => c.setting === "fixes")).toBe(false);
  });

  it("prefers the learner's own track", () => {
    const c = generateTemplate({ dim: "critical", difficulty: 2, track: "admin", usedSignatures: new Set(), seed: "own" });
    expect(c?.settingTrack).toBe("admin");
    const x = generateTemplate({ dim: "critical", difficulty: 2, track: "admin", trackOverride: "sales", usedSignatures: new Set(), seed: "x" });
    expect(x?.settingTrack).toBe("sales");
  });

  it("an open slot gets an open item with a rubric", () => {
    const c = generateTemplate({ dim: "communication", difficulty: 2, track: "sales", kind: "open", usedSignatures: new Set(), seed: "o" });
    expect(c?.generated.type).toBe("open");
    // Versioned per family (explain_open is v2 since 2026-10-18 — its "Within the limit" anchors changed).
    expect(c?.generated.key.rubric?.version).toMatch(/^[a-z_]+-v\d+$/);
  });

  it("signature format", () => {
    expect(signatureOf("a", "b", "c")).toBe("a:b:c");
  });
});

describe("devos similarity — a changed name or number is not a new question (AC-006)", () => {
  const T = { lexicalJaccard: 0.62, simhashMaxHamming: 9 };
  it("normalizes names and numbers away", () => {
    const a = "Ravi called Sri Lakshmi Jewellers 3 times and sold a ₹4,999 video.";
    const b = "Divya called Annapurna Sweets seven times and sold a ₹2,999 video.";
    expect(normalizeText(a, NAME_WORDS)).toBe(normalizeText(b, NAME_WORDS));
  });
  it("blocks exact, normalized, signature and lexical repeats", () => {
    const fpA = fingerprintOf({ names: NAME_WORDS, text: "Kiran must call five leads in order. Annapurna Sweets is called before Raja Sarees. Who is the third call?", signature: "order_puzzle:kth:call_list" });
    const seen = [seenEntryOf("q1", fpA, "logical", 1)];
    const exact = fingerprintOf({ names: NAME_WORDS, text: "Kiran must call five leads in order. Annapurna Sweets is called before Raja Sarees. Who is the third call?", signature: "x" });
    expect(similarityDecision(exact, seen, T).reason).toBe("exact");
    const renamed = fingerprintOf({ names: NAME_WORDS, text: "Swathi must call 6 leads in order. Vasavi Textiles is called before Sai Dental Clinic. Who is the third call?", signature: "y" });
    expect(similarityDecision(renamed, seen, T).duplicate).toBe(true);
    const sameSig = fingerprintOf({ text: "Completely different words about meetings and slots for the manager today.", signature: "order_puzzle:kth:call_list" });
    expect(similarityDecision(sameSig, seen, T).reason).toBe("signature");
    const fresh = fingerprintOf({ text: "A table shows clips made and rejected per Flow account last month. Which account has the lowest rejection rate?", signature: "data_table:best_rate:model_quality" });
    expect(similarityDecision(fresh, seen, T).duplicate).toBe(false);
  });
  it("minhash estimates similarity", () => {
    const x = fingerprintOf({ text: "the quick brown fox jumps over the lazy dog near the river bank today", signature: "a" });
    const y = fingerprintOf({ text: "the quick brown fox jumps over the lazy dog near the river bank today", signature: "b" });
    expect(jaccardEstimate(x.m, y.m)).toBe(1);
  });
});
