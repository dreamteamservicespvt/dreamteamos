import { describe, expect, it } from "vitest";
import { finalScriptAiInstruction, finalScriptFromKit, finalScriptTemplate, readFinalScript } from "@/utils/finalScript";
import {
  QA_DIMENSIONS, SCRIPT_GATE_DEADLINE_MS, SCRIPT_IMPROVEMENT_PASSES, SCRIPT_IMPROVEMENT_STALLS, isBetterDraft, isPerfect,
  isReady, mechanicalCaps, nextImprovement, overallScore, parseScriptQa, qaDecision, qaInstructions, qaSummary, unscoredSummary,
  withMechanicalChecks, type ScriptQaReport,
} from "@/utils/scriptQa";
import { SCRIPT_QA_SYSTEM_PROMPT } from "@/services/prompts/scriptQa";
import { TELUGU_SCREEN_CTA } from "@/services/prompts/wordContract";
import { castNoteFor } from "@/services/prompts/characterAd";
import { CHARACTER_CATALOGUE } from "@/services/characterCatalogue";
import { getCharacterPack, packSpeakers } from "@/services/characterPacks";
import { parseDialogueClips } from "@/utils/dialogueFormat";

const motuPatlu = packSpeakers(getCharacterPack("duo_motu_patlu")!);
const owner = [{ key: "owner", name: "Business Owner" }];

describe("the final voice-over script format", () => {
  it("is shown for this ad's cast and clip count", () => {
    expect(finalScriptTemplate([], 2)).toBe("clip-1[0-8sec]: …\nclip-2[8-16sec]: …");
    expect(finalScriptTemplate(owner, 2)).toBe("clip-1[0-8sec]:\n  [Business Owner]: …\nclip-2[8-16sec]:\n  [Business Owner]: …");
    const duo = finalScriptTemplate(motuPatlu, 3);
    expect(duo.split("\n")).toHaveLength(9);
    expect(duo).toContain("clip-3[16-24sec]:");
    expect(duo).toContain(`[${motuPatlu[0].name}]: …`);
    expect(duo).toContain(`[${motuPatlu[1].name}]: …`);
  });
});

describe("reading a pasted final script", () => {
  const duoScript = [
    "clip-1[0-8sec]:",
    `  [${motuPatlu[0].name}]: మొదటి మాట.`,
    `  [${motuPatlu[1].name}]: రెండవ మాట.`,
    "clip-2[8-16sec]:",
    `  [${motuPatlu[0].name}]: మూడవ మాట.`,
    `  [${motuPatlu[1].name}]: 2 రోజుల్లో డెలివరీ మరియు సర్వీస్.`,
  ].join("\n");

  it("reads a two-character script word for word, in the stored form the video prompts read back", () => {
    const r = readFinalScript(duoScript, motuPatlu, { expectedClips: 2, language: "Telugu" });
    expect(r.ok).toBe(true);
    expect(r.clips).toBe(2);
    const clips = parseDialogueClips(r.script, motuPatlu);
    expect(clips).toHaveLength(2);
    expect(clips[0].map((l) => l.speaker)).toEqual(motuPatlu.map((s) => s.key));
    // Spoken the way every script is: numbers as words, "and" as mariyu.
    expect(clips[1][1].text).toContain("రెండు");
    expect(clips[1][1].text).toContain("mariyu");
    expect(clips[1][1].text).not.toMatch(/\d/);
  });

  it("refuses a script whose clip count does not match the kit's frames, and says what to do", () => {
    const r = readFinalScript(duoScript, motuPatlu, { expectedClips: 4 });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/has 2 clips; this kit has 4 frames/);
  });

  it("names a speaker label that is not in this ad", () => {
    const r = readFinalScript(duoScript.replace(`[${motuPatlu[1].name}]: రెండవ`, "[Chutki]: రెండవ"), motuPatlu, { expectedClips: 2 });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/\[Chutki\] is not a speaker in this ad/);
  });

  it("notes a clip where only one of the pair speaks, without refusing it", () => {
    const lonely = duoScript.split("\n").filter((l) => !l.includes("రెండవ")).join("\n");
    const r = readFinalScript(lonely, motuPatlu, { expectedClips: 2 });
    expect(r.ok).toBe(true);
    expect(r.notes[0]).toMatch(/Clip 1 has only one speaker/);
  });

  it("takes a one-character script with or without its label", () => {
    const labelled = readFinalScript("clip-1[0-8sec]:\n  [Business Owner]: నమస్కారం.\nclip-2[8-16sec]:\n  [Business Owner]: రండి.", owner, { expectedClips: 2 });
    const plain = readFinalScript("clip-1[0-8sec]: నమస్కారం.\nclip-2[8-16sec]: రండి.", owner, { expectedClips: 2 });
    expect(labelled.ok && plain.ok).toBe(true);
    expect(parseDialogueClips(plain.script, owner).map((c) => c[0].text)).toEqual(["నమస్కారం.", "రండి."]);
  });

  it("stores a presenter's script in the canonical clip form", () => {
    const r = readFinalScript("clip-1[0-8sec]: మొదటి లైన్.\nclip-2[8-16sec]: 50% ఆఫర్!", [], { expectedClips: 2, language: "Telugu" });
    expect(r.ok).toBe(true);
    expect(r.script.split("\n")[0]).toBe("0-8: మొదటి లైన్.");
    expect(r.script).toContain("8-16: ");
    expect(r.script).not.toMatch(/50|%/);
  });

  it("loads the kit's current script in the paste format, and reads it back unchanged", () => {
    const presenter = finalScriptFromKit("0-8: మొదటి లైన్.\n8-16: రెండవ లైన్.", []);
    expect(presenter).toBe("clip-1[0-8sec]: మొదటి లైన్.\nclip-2[8-16sec]: రెండవ లైన్.");
    expect(readFinalScript(presenter, [], { expectedClips: 2 }).script).toBe("0-8: మొదటి లైన్.\n8-16: రెండవ లైన్.");

    const stored = readFinalScript(duoScript.replace(/2 రోజుల్లో డెలివరీ మరియు సర్వీస్\./, "సర్వీస్."), motuPatlu, { expectedClips: 2 }).script;
    const loaded = finalScriptFromKit(stored, motuPatlu);
    expect(loaded).toContain(`[${motuPatlu[0].name}]:`);
    expect(readFinalScript(loaded, motuPatlu, { expectedClips: 2 }).script).toBe(stored);
  });

  it("gives ChatGPT / Gemini an instruction that keeps every word and returns this exact format", () => {
    const text = finalScriptAiInstruction(motuPatlu, 3);
    expect(text).toContain("3 clips of 8 seconds");
    expect(text).toContain(`[${motuPatlu[0].name}]: and [${motuPatlu[1].name}]:`);
    expect(text).toContain("Do NOT change, add, translate or remove a single word");
    expect(text).toContain(finalScriptTemplate(motuPatlu, 3));
  });

  it("says what is wrong with an empty or shapeless paste", () => {
    expect(readFinalScript("  ", [], { expectedClips: 2 }).problems[0]).toMatch(/Paste the final script/);
    expect(readFinalScript("just some words", [], { expectedClips: 2 }).problems[0]).toMatch(/No clips could be read/);
  });
});

const ALL = (n: number) => Object.fromEntries(QA_DIMENSIONS.map((d) => [d, n])) as ScriptQaReport["scores"];
const report = (scores: Partial<ScriptQaReport["scores"]>, extra: Partial<ScriptQaReport> = {}): ScriptQaReport => {
  const full = { ...ALL(8), facts: 9, ...scores };
  return { scores: full, judgeScores: full, overall: overallScore(full), unsupportedClaims: [], problems: [], rewriteBrief: "", mechanical: [], ...extra };
};
/** The judge's JSON as it arrives. */
const judged = (scores: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ scores, unsupportedClaims: [], problems: [], rewriteBrief: "", ...extra });

describe("the voice-over quality gate — scores are decided in code (2026-10-15)", () => {
  it("reads the judge's eight rubric scores and computes the overall itself", () => {
    const r = parseScriptQa("```json\n" + judged(
      { facts: 10, language: 8, persuasion: 7, clarity: 9, relevance: 9, speakability: "8", cast: 10, originality: 9 },
      { overall: 10, problems: [{ clip: 2, dimension: "persuasion", issue: "flat", fix: "add the benefit" }] },
    ) + "\n```")!;
    expect(r.scores.speakability).toBe(8);
    // The judge's own "overall: 10" is ignored — the weighted score is computed from the dimensions.
    expect(r.overall).toBe(overallScore(r.scores));
    expect(r.overall).toBeLessThan(10);
    expect(r.problems).toEqual([{ clip: 2, dimension: "persuasion", issue: "flat", fix: "add the benefit" }]);
  });

  it("refuses a malformed report — not JSON, or a missing score — instead of guessing a 10", () => {
    expect(parseScriptQa("not json")).toBeNull();
    expect(parseScriptQa("")).toBeNull();
    expect(parseScriptQa(JSON.stringify({ scores: { facts: 9 } }))).toBeNull();
    // The six scores of the old rubric are no longer a whole report: cast and originality are missing.
    expect(parseScriptQa(judged({ facts: 10, language: 10, persuasion: 10, clarity: 10, relevance: 10, speakability: 10 }))).toBeNull();
    expect(parseScriptQa(judged({ ...ALL(10), cast: "ten" }))).toBeNull();
  });

  it("holds a score to the problems the judge itself listed", () => {
    const r = parseScriptQa(judged(ALL(10), { problems: [{ clip: 3, dimension: "language", issue: "bookish word", fix: "say it plainly" }] }))!;
    expect(r.judgeScores.language).toBe(10);
    expect(r.scores.language).toBe(9);
    expect(isPerfect(r)).toBe(false);
  });

  it("caps facts when the judge lists an invented claim, whatever it scored", () => {
    const r = parseScriptQa(judged({ ...ALL(9) }, { unsupportedClaims: ["clip 2: free home delivery — not in the business information"] }))!;
    expect(r.scores.facts).toBe(4);
    expect(qaDecision(r)).toBe("rewrite");
    expect(qaInstructions(r)[0]).toMatch(/free home delivery .* remove it, or replace it with a fact/);
  });

  it("never lets a perfect rating cover a mechanical failure found in code", () => {
    const perfect = parseScriptQa(judged(ALL(10)))!;
    expect(isPerfect(perfect)).toBe(true);
    const tooLong = withMechanicalChecks(perfect, ["Clip 2 must contain 17–20 spoken words, but it has 21."]);
    expect(tooLong.scores.speakability).toBe(5);
    expect(tooLong.overall).toBeLessThan(10);
    expect(isPerfect(tooLong)).toBe(false);
    const lostSpeaker = withMechanicalChecks(perfect, ["Clip 3 is missing Patlu's line — both characters must speak in every clip."]);
    expect(lostSpeaker.scores.cast).toBe(5);
    const wrongScript = withMechanicalChecks(perfect, ["Clip 1 contains Latin letters or digits in spoken content."]);
    expect(wrongScript.scores.language).toBe(6);
    const brokenCta = withMechanicalChecks(perfect, ["Final clip must include the on-screen call CTA: …"]);
    expect(brokenCta.scores.persuasion).toBe(8);
    // An issue no rule knows still keeps it from 10/10.
    expect(isPerfect(withMechanicalChecks(perfect, ["Something new code found."]))).toBe(false);
    expect(mechanicalCaps(["Clip 1 duplicates clip 2."])).toEqual({ originality: 5 });
  });

  it("calls a script 10/10 only when every dimension is 10 and nothing is left to fix", () => {
    expect(qaDecision(report(ALL(10)))).toBe("pass");
    // 9.9 is not 10: polished, never passed.
    expect(qaDecision(report({ ...ALL(10), originality: 9 }))).toBe("polish");
    expect(qaDecision(report(ALL(10), { problems: [{ clip: 1, issue: "x", fix: "y" }] }))).toBe("polish");
    // Weak at its core — the language, the selling or the cast — is written again.
    expect(qaDecision(report({ language: 5 }))).toBe("rewrite");
    expect(qaDecision(report({ persuasion: 5 }))).toBe("rewrite");
    expect(qaDecision(report({ cast: 4 }))).toBe("rewrite");
  });

  it("keeps the better draft — the cast first, then the word contract, then no invented facts, then the score", () => {
    const valid = { report: report({ persuasion: 6 }), mechanicalIssues: 2, contract: { violations: 0, distance: 0 } };
    const tooLong = { report: report(ALL(10)), mechanicalIssues: 1, contract: { violations: 1, distance: 3 } };
    // A higher-scoring draft with a 23-word clip never beats a valid one.
    expect(isBetterDraft(valid, tooLong)).toBe(false);
    expect(isBetterDraft(tooLong, valid)).toBe(true);
    // Nearer the band wins between two that both break it.
    expect(isBetterDraft(tooLong, { ...tooLong, contract: { violations: 1, distance: 1 } })).toBe(true);
    const invented = { report: report({ facts: 4 }, { unsupportedClaims: ["x"] }), mechanicalIssues: 0 };
    const honest = { report: report({ persuasion: 6 }), mechanicalIssues: 2 };
    expect(isBetterDraft(invented, honest)).toBe(true);
    expect(isBetterDraft(honest, invented)).toBe(false);
    expect(isBetterDraft(honest, { report: null, mechanicalIssues: 0 })).toBe(false);
    expect(isBetterDraft(honest, { report: report({ persuasion: 9 }), mechanicalIssues: 5 })).toBe(true);
    // A draft that lost a speaker never wins, whatever it scored.
    expect(isBetterDraft(honest, { report: report(ALL(10)), mechanicalIssues: 0, broken: 1 })).toBe(false);
  });

  it("summarises the draft that shipped — its real score, its passes, its words and why the loop stopped", () => {
    const s = qaSummary(report({ speakability: 6 }, { problems: [{ clip: 3, issue: "too long to say", fix: "cut the adjective" }] }), 3,
      { passes: 2, stopReason: "stalled", clipWords: [18, 19, 20], checkedScript: "0-8: …" });
    expect(s).toMatchObject({ passed: false, drafts: 3, passes: 2, stopReason: "stalled", clipWords: [18, 19, 20], checkedScript: "0-8: …" });
    expect(s.notes[0]).toBe("Clip 3: too long to say — cut the adjective");
    expect(qaSummary(report(ALL(10)), 1)).toMatchObject({ passed: true, score: 10, notes: [] });
    const unscored = unscoredSummary(2, ["Clip 1 must contain 17–20 spoken words, but it has 16."], { passes: 1 });
    expect(unscored).toMatchObject({ unscored: true, passed: false, score: 0, drafts: 2 });
    expect(unscored.notes[0]).toMatch(/could not score/);
  });
});

describe("the improvement loop — bounded, and never fooled (utils/scriptQa nextImprovement)", () => {
  const standing = (r: ScriptQaReport | null, over: Record<string, unknown> = {}) =>
    ({ report: r, mechanicalIssues: 0, broken: 0, contract: { violations: 0, distance: 0 }, ...over });

  it("stops at a genuine 10/10", () => {
    expect(nextImprovement({ best: standing(report(ALL(10))), passesUsed: 0, stalls: 0, elapsedMs: 0 })).toEqual({ stop: "perfect" });
  });

  it("does not stop at a judge's 10/10 when a clip breaks the word contract", () => {
    const step = nextImprovement({ best: standing(report(ALL(10)), { contract: { violations: 1, distance: 2 } }), passesUsed: 0, stalls: 0, elapsedMs: 0 });
    expect(step).toEqual({ mode: "polish", drafts: 1 });
  });

  it("spends at most SCRIPT_IMPROVEMENT_PASSES passes, then ships the best with its real score", () => {
    expect(SCRIPT_IMPROVEMENT_PASSES).toBe(3);
    const good = standing(report({ ...ALL(8.8) }));
    expect(nextImprovement({ best: good, passesUsed: 2, stalls: 0, elapsedMs: 0 })).toEqual({ mode: "polish", drafts: 1 });
    expect(nextImprovement({ best: good, passesUsed: 3, stalls: 0, elapsedMs: 0 })).toEqual({ stop: "passes" });
  });

  it("ships a READY draft at once — ≥ 9/10, no area below 8.5, nothing invented, nothing code found (2026-10-16)", () => {
    expect(nextImprovement({ best: standing(report(ALL(9))), passesUsed: 0, stalls: 0, elapsedMs: 0 })).toEqual({ stop: "ready" });
    // A problem the judge listed does not block it (it already caps its dimension at 9).
    const listed = report(ALL(9.5), { problems: [{ clip: 1, issue: "soft hook", fix: "sharper", dimension: "persuasion" }] });
    expect(isReady(listed)).toBe(true);
    // Every hard rule still blocks it.
    expect(isReady(report(ALL(9.5), { unsupportedClaims: ["clip 1: free installation"] }))).toBe(false);
    expect(isReady(withMechanicalChecks(report(ALL(9.5)), ["Clip 2 must contain 17–20 spoken words, but it has 22."]))).toBe(false);
    expect(isReady(report({ ...ALL(9.6), language: 8 }))).toBe(false);
    expect(isReady(report(ALL(8.9)))).toBe(false);
    expect(nextImprovement({ best: standing(report(ALL(9.5)), { contract: { violations: 1, distance: 2 } }), passesUsed: 0, stalls: 0, elapsedMs: 0 })).toEqual({ mode: "polish", drafts: 1 });
    expect(nextImprovement({ best: standing(report(ALL(9.5)), { broken: 1 }), passesUsed: 0, stalls: 0, elapsedMs: 0 })).toEqual({ mode: "rewrite", drafts: 2 });
  });

  it("stops after a round that found nothing better, and at the deadline", () => {
    expect(SCRIPT_IMPROVEMENT_STALLS).toBe(1);
    expect(SCRIPT_GATE_DEADLINE_MS).toBe(45_000);
    const good = standing(report(ALL(8.8)));
    expect(nextImprovement({ best: good, passesUsed: 2, stalls: SCRIPT_IMPROVEMENT_STALLS, elapsedMs: 0 })).toEqual({ stop: "stalled" });
    expect(nextImprovement({ best: good, passesUsed: 1, stalls: 0, elapsedMs: SCRIPT_GATE_DEADLINE_MS })).toEqual({ stop: "deadline" });
  });

  it("writes two drafts side by side for a broken cast or a weak script on the first round, one after that", () => {
    expect(nextImprovement({ best: standing(null, { broken: 2 }), passesUsed: 0, stalls: 0, elapsedMs: 0 })).toEqual({ mode: "rewrite", drafts: 2 });
    expect(nextImprovement({ best: standing(report({ language: 4 })), passesUsed: 0, stalls: 0, elapsedMs: 0 })).toEqual({ mode: "rewrite", drafts: 2 });
    expect(nextImprovement({ best: standing(report({ language: 4 })), passesUsed: 2, stalls: 0, elapsedMs: 0 })).toEqual({ mode: "rewrite", drafts: 1 });
    // Never more drafts than the budget has left.
    expect(nextImprovement({ best: standing(report({ language: 4 })), passesUsed: 0, stalls: 0, elapsedMs: 0, limits: { passes: 1 } })).toEqual({ mode: "rewrite", drafts: 1 });
  });

  it("when the judge cannot run, fixes only what code found — and stops when code found nothing", () => {
    expect(nextImprovement({ best: standing(null, { mechanicalIssues: 2 }), passesUsed: 0, stalls: 0, elapsedMs: 0 })).toEqual({ mode: "polish", drafts: 1 });
    expect(nextImprovement({ best: standing(null), passesUsed: 0, stalls: 0, elapsedMs: 0 })).toEqual({ stop: "unscored" });
  });
});

describe("the judge's prompt", () => {
  it("is told the team's fixed rules, so it never marks them as mistakes, and the register to hold", () => {
    const p = SCRIPT_QA_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4, speakers: ["Motu", "Patlu"], closingLine: `"${TELUGU_SCREEN_CTA}"` });
    expect(p).toContain('"mariyu" written in Latin letters inside a Telugu line is REQUIRED');
    expect(p).toContain(`The closing sentence "${TELUGU_SCREEN_CTA}" is fixed`);
    expect(p).toContain("EDUCATED, WELL-SPOKEN Telugu person");
    expect(p).toContain("conversation between Motu and Patlu");
    expect(p).toContain("You do NOT rewrite. You JUDGE");
    expect(p).not.toMatch(/polished/i);
  });

  it("scores eight dimensions against written anchors — and is never told to give a 10", () => {
    const p = SCRIPT_QA_SYSTEM_PROMPT({ language: "Telugu", clipCount: 3 });
    for (const d of QA_DIMENSIONS) expect(p).toContain(`"${d}": 0`);
    expect(p).toContain("10 = nothing on this dimension would make the script better");
    expect(p).toContain("Award a 10 when it is TRUE and only then");
    expect(p).toContain("If you list a problem against a dimension, that dimension is not a 10");
    expect(p).not.toMatch(/always (award|give) (a )?10/i);
  });

  it("is given the word counts code measured, so it never miscounts Telugu", () => {
    const p = SCRIPT_QA_SYSTEM_PROMPT({ language: "Telugu", clipCount: 3, clipWords: [18, 19, 20] });
    expect(p).toContain("THE WORD COUNT IS MEASURED BY CODE, NOT BY YOU");
    expect(p).toContain("clip 1: 18, clip 2: 19, clip 3: 20");
    expect(p).toContain("17–20 spoken words");
  });

  it("knows the verified address the last clip must say — it is never an invented claim", () => {
    const p = SCRIPT_QA_SYSTEM_PROMPT({ language: "English", clipCount: 2, address: "opposite RTC Bus Stand, Kakinada" });
    expect(p).toContain('the final clip must tell the viewer where to come — "opposite RTC Bus Stand, Kakinada"');
    expect(p).toContain("Saying it is NEVER an unsupported claim");
    expect(SCRIPT_QA_SYSTEM_PROMPT({ language: "English", clipCount: 2 })).toContain("No verified address was given");
  });

  it("holds the script to its cast — a deity's blessing, two children, the owners' 'we'", () => {
    const pack = getCharacterPack("god_ganesha") ?? CHARACTER_CATALOGUE.find((p) => p.family === "god")!;
    const p = SCRIPT_QA_SYSTEM_PROMPT({ language: "Telugu", clipCount: 3, speakers: pack.characters.map((c) => c.name), castNote: castNoteFor(pack) });
    expect(p).toContain("THE CAST AND HOW IT MUST SOUND:");
    expect(p).toContain(pack.label);
    expect(p).toContain("no imagined second speaker");
    const duo = SCRIPT_QA_SYSTEM_PROMPT({ language: "Telugu", clipCount: 3, speakers: ["Girl", "Boy"] });
    expect(duo).toContain("both speakers have meaningful lines in every clip");
    expect(duo).toContain("across both lines together");
  });

  it("never marks a festival ad's clip 1 down for following the wish instead of the cast's own clip-1 direction", () => {
    const pack = getCharacterPack("god_ganesha")!;
    const festival = SCRIPT_QA_SYSTEM_PROMPT({ language: "Telugu", adType: "festival", festivalName: "Vinayaka Chavithi", clipCount: 2, speakers: ["Ganesha"], castNote: castNoteFor(pack) });
    expect(festival).toContain("IN THIS FESTIVAL AD CLIP 1 IS THE WISH AND NOTHING ELSE");
    expect(festival).toContain("never mark clip 1 down for following it; judge the hook from clip 2");
    expect(SCRIPT_QA_SYSTEM_PROMPT({ language: "Telugu", adType: "commercial", clipCount: 2 })).not.toContain("CLIP 1 IS THE WISH");
  });

  it("judges an English script as Indian English", () => {
    const p = SCRIPT_QA_SYSTEM_PROMPT({ language: "English", clipCount: 4 });
    expect(p).toContain("INDIAN English — the way an educated, well-spoken person from Andhra Pradesh");
    expect(p).toContain("NOT American or British slang");
  });
});

