import { describe, expect, it } from "vitest";
import { ASSUMED_CONFIDENCE, checkJudgeOutput, quoteInAnswer, readConfidence } from "@/devos/core/scoring";
import type { Rubric } from "@/devos/core/types";

/**
 * The judge's verdict, as real Gemini writes it (2026-10-18 live run). Every verdict of gemini-2.5-flash said
 * `"confidence": 5` — a five-point scale — and the strict 0–1 check refused them all, so no open answer could be
 * graded and every AI-written open question was rejected. Another judge shortened its quotes with "...", which the
 * quote check counted as invented evidence.
 */

const rubric: Rubric = {
  version: "t1", passMark: 60,
  criteria: [
    { id: "accurate", label: "Accurate", weight: 50, anchors: { 0: "wrong", 2: "partly", 4: "right" } },
    { id: "next_step", label: "Next step", weight: 50, anchors: { 0: "none", 2: "vague", 4: "specific" } },
  ],
};
const answer = "Each month we plan your posts — for example two a week — and send them to you on WhatsApp before anything goes live. Nothing is posted until you approve it. Shall I send this month's first two posts for approval on Thursday?";
const verdict = (confidence: unknown, evidence = "Nothing is posted until you approve it.") => ({
  criteria: [
    { id: "accurate", score: 4, evidence, note: "" },
    { id: "next_step", score: 4, evidence: "Shall I send this month's first two posts for approval on Thursday?", note: "" },
  ],
  ...(confidence === undefined ? {} : { confidence }), summary: "Good.", gaps: [],
});

describe("a judge's confidence, whatever scale it answers on", () => {
  it("reads 0–1, five- and ten-point scales, percentages and words", () => {
    expect(readConfidence(0.85)).toBe(0.85);
    expect(readConfidence(1)).toBe(1);
    expect(readConfidence(5)).toBe(1); // what gemini-2.5-flash answered
    expect(readConfidence(4)).toBeCloseTo(0.8);
    expect(readConfidence(8)).toBeCloseTo(0.8);
    expect(readConfidence(85)).toBeCloseTo(0.85);
    expect(readConfidence("85%")).toBeCloseTo(0.85);
    expect(readConfidence("0.9")).toBeCloseTo(0.9);
    expect(readConfidence("High")).toBe(0.9);
    expect(readConfidence("low")).toBe(0.3);
  });

  it("gives up on nonsense rather than guessing", () => {
    for (const v of [undefined, null, -1, 250, "very", "", {}, Number.NaN]) expect(readConfidence(v)).toBeNull();
  });

  it("accepts a sound verdict with confidence 5 (it was refused before)", () => {
    const c = checkJudgeOutput(verdict(5), rubric, answer, "gemini-2.5-flash", 1);
    expect(c.problems).toEqual([]);
    expect(c.verdict?.score).toBe(100);
    expect(c.verdict?.confidence).toBe(1);
    expect(c.assumedConfidence).toBe(false);
  });

  it("keeps a verdict with no confidence, at a low assumed one (so a second judge checks it)", () => {
    const c = checkJudgeOutput(verdict(undefined), rubric, answer, "m", 1);
    expect(c.problems).toEqual([]);
    expect(c.assumedConfidence).toBe(true);
    expect(c.verdict?.confidence).toBe(ASSUMED_CONFIDENCE);
    expect(ASSUMED_CONFIDENCE).toBeLessThan(0.6); // the default policy's low-confidence line
  });
});

describe("quoted evidence must really be in the answer", () => {
  it("accepts a quote shortened with ... when every part is there, in order", () => {
    expect(quoteInAnswer("Each month we plan your posts... Nothing is posted until you approve it", answer)).toBe(true);
    expect(quoteInAnswer("send them to you on WhatsApp … approval on Thursday", answer)).toBe(true);
  });

  it("refuses parts that are not there, or are out of order", () => {
    expect(quoteInAnswer("Each month we plan your posts... we refund every rupee", answer)).toBe(false);
    expect(quoteInAnswer("approval on Thursday... Each month we plan", answer)).toBe(false);
    expect(quoteInAnswer("...", answer)).toBe(false);
  });

  it("is not fooled or tripped by dashes and quotes copied differently", () => {
    expect(quoteInAnswer("posts - for example two a week - and send", answer)).toBe(true);
    expect(quoteInAnswer("Shall I send this month’s first two posts", answer)).toBe(true);
  });

  it("an elided but genuine quote is not counted as invented; an invented one still is", () => {
    const ok = checkJudgeOutput(verdict(0.9, "Each month we plan your posts... Nothing is posted"), rubric, answer, "m", 1);
    expect(ok.fabricated).toBe(0);
    expect(ok.verdict?.criteria[0].evidence).toBeTruthy();
    const bad = checkJudgeOutput(verdict(0.9, "We guarantee 10,000 new patients"), rubric, answer, "m", 1);
    expect(bad.fabricated).toBe(1);
    expect(bad.verdict?.criteria[0].evidence).toBeUndefined();
  });

  it("a quote that is only dots is no quote at all (a positive score with it counts as unquoted)", () => {
    const c = checkJudgeOutput(verdict(0.9, "..."), rubric, answer, "m", 1);
    expect(c.fabricated).toBe(0);
    expect(c.unquoted).toBe(1);
  });
});
