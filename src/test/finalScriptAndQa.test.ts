import { describe, expect, it } from "vitest";
import { finalScriptAiInstruction, finalScriptFromKit, finalScriptTemplate, readFinalScript } from "@/utils/finalScript";
import {
  QA_PASS, isBetterDraft, overallScore, parseScriptQa, qaDecision, qaInstructions, qaSummary, type ScriptQaReport,
} from "@/utils/scriptQa";
import { SCRIPT_QA_SYSTEM_PROMPT } from "@/services/prompts/scriptQa";
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

const report = (scores: Partial<ScriptQaReport["scores"]>, extra: Partial<ScriptQaReport> = {}): ScriptQaReport => {
  const full = { facts: 9, language: 8, persuasion: 8, clarity: 8, relevance: 8, speakability: 8, ...scores };
  return { scores: full, overall: overallScore(full), unsupportedClaims: [], problems: [], rewriteBrief: "", ...extra };
};

describe("the voice-over quality gate", () => {
  it("reads the judge's JSON and weighs it in code", () => {
    const r = parseScriptQa("```json\n" + JSON.stringify({
      scores: { facts: 10, language: 8, persuasion: 7, clarity: 9, relevance: 9, speakability: "8" },
      unsupportedClaims: [], problems: [{ clip: 2, issue: "flat", fix: "add the benefit" }], rewriteBrief: "",
    }) + "\n```");
    expect(r?.scores.speakability).toBe(8);
    expect(r?.overall).toBeCloseTo(overallScore(r!.scores));
    expect(r?.problems).toEqual([{ clip: 2, issue: "flat", fix: "add the benefit" }]);
    expect(parseScriptQa("not json")).toBeNull();
    expect(parseScriptQa(JSON.stringify({ scores: { facts: 9 } }))).toBeNull();
  });

  it("caps facts when the judge lists an invented claim, whatever it scored", () => {
    const r = parseScriptQa(JSON.stringify({
      scores: { facts: 9, language: 9, persuasion: 9, clarity: 9, relevance: 9, speakability: 9 },
      unsupportedClaims: ["clip 2: free home delivery — not in the business information"],
    }))!;
    expect(r.scores.facts).toBe(4);
    expect(qaDecision(r)).toBe("rewrite");
    expect(qaInstructions(r)[0]).toMatch(/free home delivery .* remove it, or replace it with a fact/);
  });

  it("ships only a script that clears every bar", () => {
    expect(qaDecision(report({ facts: 10, language: 9, persuasion: 8, clarity: 8, relevance: 8, speakability: 8 }))).toBe("pass");
    // One weak dimension is a polish, never a pass.
    expect(qaDecision(report({ facts: 10, language: 9, persuasion: 9, clarity: 9, relevance: 9, speakability: 6.5 }))).toBe("polish");
    // Weak at its core — the language or the selling — is written again.
    expect(qaDecision(report({ language: 5 }))).toBe("rewrite");
    expect(qaDecision(report({ persuasion: 5 }))).toBe("rewrite");
    expect(QA_PASS.overall).toBe(8);
  });

  it("keeps the better of two drafts — a draft with no invented facts always wins", () => {
    const invented = { report: report({ facts: 4 }, { unsupportedClaims: ["x"] }), mechanicalIssues: 0 };
    const honest = { report: report({ persuasion: 6 }), mechanicalIssues: 2 };
    expect(isBetterDraft(invented, honest)).toBe(true);
    expect(isBetterDraft(honest, invented)).toBe(false);
    expect(isBetterDraft(honest, { report: null, mechanicalIssues: 0 })).toBe(false);
    const better = { report: report({ persuasion: 9 }), mechanicalIssues: 5 };
    expect(isBetterDraft(honest, better)).toBe(true);
  });

  it("summarises the draft that shipped for the kit", () => {
    const s = qaSummary(report({ speakability: 6 }, { problems: [{ clip: 3, issue: "too long to say", fix: "cut the adjective" }] }), 3);
    expect(s).toMatchObject({ passed: false, drafts: 3 });
    expect(s.notes[0]).toBe("Clip 3: too long to say — cut the adjective");
  });

  it("is told the team's fixed rules, so it never marks them as mistakes, and the register to hold", () => {
    const p = SCRIPT_QA_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4, speakers: ["Motu", "Patlu"] });
    expect(p).toContain('"mariyu" written in Latin letters inside a Telugu line is REQUIRED');
    expect(p).toContain("మరిన్ని వివరాల కోసం స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి.");
    expect(p).toContain("EDUCATED, WELL-SPOKEN Telugu person");
    expect(p).toContain("conversation between Motu and Patlu");
    expect(p).toContain("You do NOT rewrite. You JUDGE");
    expect(p).not.toMatch(/polished/i);
  });

  it("judges an English script as Indian English", () => {
    const p = SCRIPT_QA_SYSTEM_PROMPT({ language: "English", clipCount: 4 });
    expect(p).toContain("INDIAN English — the way an educated, well-spoken person from Andhra Pradesh");
    expect(p).toContain("NOT American or British slang");
  });
});
