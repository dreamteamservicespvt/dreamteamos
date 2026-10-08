import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { CHARACTER_CATALOGUE } from "@/services/characterCatalogue";
import { getCharacterPack, packSpeakers } from "@/services/characterPacks";
import {
  castIntegrityIssues, castScriptProblems, dialogueLabelsIn, formatDialogueScript, readDialogueScript, type DialogueClip,
} from "@/utils/dialogueFormat";
import { isBetterDraft, type ScriptQaReport } from "@/utils/scriptQa";
import { adSpecFromSaved, adSpecOf, formForKit, savedSettingsOf } from "@/utils/adSpec";
import { readFinalScript } from "@/utils/finalScript";
import type { AdFormData, FileStore } from "@/types/aiPlatform";
import type { GenerationOptions } from "@/services/geminiService";

/**
 * 2026-10-08 — the ad's CAST is one source of truth, from the configuration to the last video prompt.
 *
 * The owner's report: a Male & Female Duo ad came back with frames that showed the woman and the man, a
 * voice-over written for ONE person, and Veo prompts for one speaker — so the video behaved like a
 * one-person ad. Intermittently. The causes, each pinned below:
 *
 *   1. The dialogue reader folded a turn it did not recognise (`0-8|Man:`, `[అబ్బాయి]:`, the man's line on
 *      the woman's line) into the previous speaker's line, and the run shipped it with a console warning.
 *   2. The quality gate ranked drafts by the judge's score alone, so a draft that LOST the man could win.
 *   3. Everything done to a kit after the run read the cast from the live form, and a form without the
 *      special category had the duo's script spoken by one presenter, labels and all.
 *   4. A member's custom script was read leniently (an unknown label merged; a header-only script empty).
 *
 * And for every configuration in the catalogue, the frames, the voice-over and the video prompts agree.
 */

// ── The fake Gemini — answers each call by what it is (see adPipelineEndToEnd) ─────────────────────
type Call = { sys: string; user: string; json: boolean };
/** The slice of a generateContent request the fake reads. */
type FakeRequest = {
  config?: { systemInstruction?: unknown; responseMimeType?: string };
  contents?: { parts?: { text?: string }[] }[];
};
const calls: Call[] = [];
/** The script writer's replies, in order (the last one repeats). */
let dialogue: string[] = [];
let singleVoice = "";
/** The judge's overall scores, in order (each dimension gets it); "none" = a reply that cannot be read. */
let judge: (number | "none")[] = [];
const SHARMA = { businessName: "Sharma Electronics", businessType: "electronics store", services: ["TVs", "washing machines"] };

const frameReply = (n: number) => Array.from({ length: n }, (_, i) =>
  `A photoreal frame for clip ${i + 1}: the cast stands inside the shop beside the real counter, soft daylight.`).join("\n###CLIP###\n");

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (req: FakeRequest) => {
        const sys = String(req.config?.systemInstruction || "");
        const parts = req.contents?.[0]?.parts || [];
        const user = parts.map((p) => p.text || "").join("\n");
        const json = req.config?.responseMimeType === "application/json";
        calls.push({ sys, user, json });
        const clips = Number((user.match(/Generate (\d+)(?: unique)? Main Frame image prompts/) || [])[1] || 0);
        if (/extract the following business information/i.test(sys)) return { text: JSON.stringify(SHARMA) };
        if (clips > 0) return { text: frameReply(clips) };
        const current = user.match(/---CURRENT PROMPTS---([\s\S]*?)(?:---|$)/);
        if (current) return { text: frameReply(current[1].split("###CLIP###").length) };
        if (/FINAL QUALITY GATE/.test(sys)) {
          const s = judge.length > 1 ? judge.shift()! : judge[0] ?? 9.5;
          if (s === "none") return { text: "the judge is unavailable" };
          return { text: JSON.stringify({ scores: { facts: 10, language: s, persuasion: s, clarity: s, relevance: s, speakability: s }, unsupportedClaims: [], problems: [], rewriteBrief: "" }) };
        }
        if (/^Write the \d+-clip .* for:/m.test(user)) return { text: dialogue.length > 1 ? dialogue.shift()! : dialogue[0] ?? "" };
        if (/^Generate a \d+-second .*voice-over script for:/m.test(user)) return { text: singleVoice };
        if (/Direct these \d+ clips?/.test(user)) return { text: "[]" };
        return { text: json ? "{}" : "x".repeat(80) };
      },
    };
    constructor(_: unknown) {}
  },
  Type: {}, Modality: {},
}));

let gemini: typeof import("@/services/geminiService");
beforeAll(async () => {
  vi.stubEnv("VITE_API_KEY_1", "k1");
  for (const level of ["log", "warn", "info", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  gemini = await import("@/services/geminiService");
});
beforeEach(() => { calls.length = 0; dialogue = []; singleVoice = ""; judge = []; });

const noFiles = (): FileStore => ({ logo: null, visitingCard: [], storeImage: [], productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: [] });
const form = (over: Record<string, unknown> = {}): AdFormData => ({
  adType: "commercial", festivalName: "", attireType: "traditional", gender: "female", duration: 16, durationMode: "preset",
  textInstructions: "Sharma Electronics sells every brand of TV and washing machine with free home delivery.", aspectRatio: "9:16",
  language: "English", ...over,
} as AdFormData);
const run = (formData: AdFormData, options: GenerationOptions = {}) => gemini.generateAdAssets(formData, noFiles(), () => {}, options);
const madeFrames = () => calls.some((c) => /Main Frame image prompts/.test(c.user));

const DUO = getCharacterPack("human_duo_mixed")!;
const DUO_SPEAKERS = packSpeakers(DUO);
const MOTU = getCharacterPack("duo_motu_patlu")!;
const MOTU_SPEAKERS = packSpeakers(MOTU);

/** The duo's script exactly to contract — the woman asks, the man answers — and the shapes it really came back in. */
const GOOD = [
  "0-8|girl: Have you seen how many washing machines are here?",
  "0-8|boy: Sharma Electronics keeps every single brand under one roof.",
  "8-16|girl: Do they really deliver all of these home?",
  "8-16|boy: Yes, free home delivery comes with every single purchase.",
].join("\n");
const COLLAPSED = GOOD.split("\n").filter((l) => /\|girl:/.test(l)).join("\n");
const SHAPES: [string, string][] = [
  ["the man's lines labelled Man", GOOD.replace(/\|boy:/g, "|Man:")],
  ["the man's lines labelled in Telugu", GOOD.replace(/\|boy:/g, "|అబ్బాయి:")],
  ["both lines on one physical line", GOOD.replace(/\n(0-8|8-16)\|boy/g, " $1|boy")],
  ["bracketed display form with a kind label", GOOD.replace(/^(\d+-\d+)\|girl:/gm, "$1|[Woman]:").replace(/^(\d+-\d+)\|boy:/gm, "$1|[Man]:")],
  ["a name in brackets after the label", GOOD.replace(/\|girl:/g, "|Girl (Priya):").replace(/\|boy:/g, "|Boy (Ravi):")],
  ["the display form, both turns on the header line", "clip-1[0-8sec]: [Girl]: Have you seen how many washing machines are here? [Boy]: Sharma Electronics keeps every single brand under one roof.\nclip-2[8-16sec]: [Girl]: Do they really deliver all of these home? [Boy]: Yes, free home delivery comes with every single purchase."],
];

/** Every clip of a stored script, read as the duo: who speaks, in order. */
const speakersOf = (script: string, speakers = DUO_SPEAKERS) => readDialogueScript(script, speakers).clips.map((c) => c.map((l) => l.speaker));

// ── 1 · The reader never folds a turn into another speaker's line ─────────────────────────────────
describe("the dialogue reader keeps every turn its own", () => {
  it("reads every shape the duo's script came back in as two speakers per clip", () => {
    for (const [name, text] of SHAPES) {
      expect(speakersOf(text), name).toEqual([["girl", "boy"], ["girl", "boy"]]);
      const clips = readDialogueScript(text, DUO_SPEAKERS).clips;
      // Each line keeps ONLY its own words — the man's never end up in the woman's line.
      expect(clips[0][0].text, name).toBe("Have you seen how many washing machines are here?");
      expect(clips[0][1].text, name).toBe("Sharma Electronics keeps every single brand under one roof.");
    }
  });

  it("matches a label against the role label's spellings, the spoken names and — for a woman and a man — the kind", () => {
    expect(speakersOf("0-8|అమ్మాయి: A?\n0-8|అబ్బాయి: B.")).toEqual([["girl", "boy"]]);
    expect(speakersOf("clip-1[0-8sec]:\nWoman: A?\nMan: B.")).toEqual([["girl", "boy"]]);
    expect(speakersOf("0-8|[మోటూ]: A?\n0-8|[పట్లు]: B.", MOTU_SPEAKERS)).toEqual([["motu", "patlu"]]);
    // Two women: "Woman" could be either, so it is not an alias — the line is placed by its position instead.
    const women = packSpeakers(getCharacterPack("human_duo_female")!);
    const reading = readDialogueScript("0-8|Woman: A?\n0-8|Woman: B.", women);
    expect(reading.clips[0].map((l) => l.speaker)).toEqual(["friend", "host"]);
    expect(reading.unknownLabels).toHaveLength(2);
  });

  it("gives a turn with an unknown label to the first speaker who has not spoken in that clip, and reports it", () => {
    const reading = readDialogueScript("0-8|girl: A?\n0-8|Narrator: B.\n8-16|Narrator: C?\n8-16|boy: D.", DUO_SPEAKERS);
    expect(reading.clips.map((c) => c.map((l) => l.speaker))).toEqual([["girl", "boy"], ["girl", "boy"]]);
    expect(reading.unknownLabels).toEqual([{ clip: 1, label: "Narrator" }, { clip: 2, label: "Narrator" }]);
  });

  /** A live gemini-3.1-flash-lite-preview reply (2026-10-08) — the fallback model the free tier rotates to. */
  it("keeps a line whose range is a typo in the clip being written — the live reply's '24-24|boy:'", () => {
    const live = [
      "0-8|girl: ఈ పట్టుచీరల షాప్ అంతా ఇంత మెరిసిపోతోంది ఏంటి?",
      "0-8|boy: ఇది కాకినాడ లోని శ్రీ లక్ష్మీ సిల్క్స్, ఇక్కడ చాలా వెరైటీలు ఉన్నాయి.",
      "8-16|girl: అసలు ఈ కాంచీపురం పట్టుచీరల కలెక్షన్ చూస్తుంటే చాలా బాగుంది!",
      "8-16|boy: అవును, ఇక్కడ క్వాలిటీ పట్టుచీరలు అన్నీ చాలా ప్రత్యేకంగా దొరుకుతాయి.",
      "16-24|girl: పెళ్లిళ్ల కోసం ఏదైనా స్పెషల్ కలెక్షన్ ఇక్కడ దొరుకుతుందా అండి?",
      "24-24|boy: పెళ్లి కోసం కొత్తగా వచ్చిన బ్రైడల్ కలెక్షన్ ఇక్కడ చాలా బాగుంటుంది.",
      "24-32|girl: పట్టుచీరలు కొంటే బ్లౌజ్ కుట్టించుకోవడం ఒక పెద్ద పనే కదా!",
      "24-32|boy: ఇక్కడ పట్టుచీరలపై బ్లౌజ్ స్టిచ్చింగ్ ఫ్రీ, శ్రీ లక్ష్మీ సిల్క్స్ రండి.",
    ].join("\n");
    const clips = readDialogueScript(live, DUO_SPEAKERS).clips;
    expect(clips.map((c) => c.map((l) => l.speaker))).toEqual([["girl", "boy"], ["girl", "boy"], ["girl", "boy"], ["girl", "boy"]]);
    expect(clips[2][1].text).toContain("బ్రైడల్ కలెక్షన్");
    expect(castIntegrityIssues(clips, 4, DUO_SPEAKERS)).toEqual([]);
  });

  it("keeps a stranger's label when the clip already has everyone — validation names it", () => {
    const reading = readDialogueScript("0-8|girl: A?\n0-8|boy: B.\n0-8|Shopkeeper: C.", DUO_SPEAKERS);
    expect(reading.clips[0].map((l) => l.speaker)).toEqual(["girl", "boy", "shopkeeper"]);
    expect(castIntegrityIssues(reading.clips, 1, DUO_SPEAKERS).join(" ")).toContain('a line from "shopkeeper", who is not in this ad');
  });

  it("still reads an UNBRACKETED unknown label as prose that continues the line", () => {
    const clips = readDialogueScript("[Girl]: the offer is\nthis week only: everything half price.\n[Boy]: B.", DUO_SPEAKERS).clips;
    expect(clips[0][0].text).toBe("the offer is this week only: everything half price.");
    expect(clips[0]).toHaveLength(2);
  });

  it("reads a one-character script written as plain clip lines — it used to come back EMPTY", () => {
    const owner = packSpeakers(getCharacterPack("normal_female")!);
    for (const text of [
      "clip-1[0-8sec]:\nSharma keeps every brand here.\nclip-2[8-16sec]:\nVisit Sharma today.",
      "clip-1[0-8sec]: Sharma keeps every brand here.\nclip-2[8-16sec]: Visit Sharma today.",
      "0-8: Sharma keeps every brand here.\n8-16: Visit Sharma today.",
      "Scene 1:\nSharma keeps every brand here.\nScene 2:\nVisit Sharma today.",
      "Clip 1 (0-8 sec):\nSharma keeps every brand here.\n[8-16sec]: Visit Sharma today.",
    ]) {
      expect(readDialogueScript(text, owner).clips.map((c) => c.map((l) => `${l.speaker}:${l.text}`)), text)
        .toEqual([["presenter:Sharma keeps every brand here."], ["presenter:Visit Sharma today."]]);
    }
  });

  it("reports unlabelled words in a two-person script instead of dropping them", () => {
    const reading = readDialogueScript("clip-1[0-8sec]:\nHave you seen this?\nclip-2[8-16sec]:\n[Girl]: A?\n[Boy]: B.", DUO_SPEAKERS);
    expect(reading.unattributed).toEqual([{ clip: 1, text: "Have you seen this?" }]);
    expect(reading.clips[0][0]).toEqual({ speaker: "girl", text: "Have you seen this?" });
  });

  it("writes back and reads every catalogue cast the same way", () => {
    for (const pack of CHARACTER_CATALOGUE) {
      const cast = packSpeakers(pack);
      const clips: DialogueClip[] = [0, 1, 2].map((c) => cast.map((s, i) => ({ speaker: s.key, text: `Clip ${c + 1} line ${i + 1}.` })));
      expect(readDialogueScript(formatDialogueScript(clips, cast), cast).clips, pack.id).toEqual(clips);
    }
  });
});

// ── 2 · What may never ship, and what a person's script must say ─────────────────────────────────
describe("cast integrity", () => {
  it("names a clip with one of the two missing, an empty line, and the wrong clip count", () => {
    const clips = readDialogueScript(COLLAPSED, DUO_SPEAKERS).clips;
    expect(castIntegrityIssues(clips, 2, DUO_SPEAKERS)).toEqual([
      "Clip 1 is missing Boy's line — both characters must speak in every clip.",
      "Clip 2 is missing Boy's line — both characters must speak in every clip.",
    ]);
    expect(castIntegrityIssues(readDialogueScript(GOOD, DUO_SPEAKERS).clips, 3, DUO_SPEAKERS)).toEqual(["Expected exactly 3 clips but got 2."]);
    expect(castIntegrityIssues([[{ speaker: "girl", text: "A?" }, { speaker: "boy", text: " " }]], 1, DUO_SPEAKERS)).toEqual(["Clip 1: Boy's line is empty."]);
    expect(castIntegrityIssues(readDialogueScript(GOOD, DUO_SPEAKERS).clips, 2, DUO_SPEAKERS)).toEqual([]);
    const presenter = packSpeakers(getCharacterPack("normal_male")!);
    expect(castIntegrityIssues([[]], 1, presenter)).toEqual(["Clip 1 has no line from Presenter."]);
  });

  it("refuses a person's script that names a stranger, leaves a line unlabelled or silences one of the two", () => {
    const problems = (text: string) => castScriptProblems(readDialogueScript(text, DUO_SPEAKERS), DUO_SPEAKERS);
    expect(problems(GOOD)).toEqual([]);
    expect(problems("clip-1[0-8sec]:\n[Girl]: A?\n[Ravi]: B.")[0]).toMatch(/^\[Ravi\] is not a speaker in this ad — use exactly \[Girl\] and \[Boy\]\./);
    expect(problems("clip-1[0-8sec]:\nA?\n[Boy]: B.")[0]).toMatch(/^Clip 1 has a line with no speaker/);
    expect(problems(COLLAPSED)[0]).toMatch(/^Boy never speaks in this script/);
    // One clip given to one of them is the writer's choice — the video has the other one listen.
    expect(problems("clip-1[0-8sec]:\n[Girl]: A?\nclip-2[8-16sec]:\n[Girl]: C?\n[Boy]: D.")).toEqual([]);
  });

  it("knows a dialogue when it sees one — display or canonical — and leaves one label alone", () => {
    expect(dialogueLabelsIn(formatDialogueScript(readDialogueScript(GOOD, DUO_SPEAKERS).clips, DUO_SPEAKERS))).toEqual(["Girl", "Boy"]);
    expect(dialogueLabelsIn(GOOD)).toEqual(["girl", "boy"]);
    expect(dialogueLabelsIn("clip-1[0-8sec]: [Narrator]: Welcome to Sharma.\nclip-2[8-16sec]: Visit today.")).toEqual([]);
    expect(dialogueLabelsIn("0-8: Welcome to Sharma.\n8-16: Visit today.")).toEqual([]);
  });

  it("never lets a draft that broke the cast beat one that kept it, whatever the judge scored", () => {
    const report = (overall: number): ScriptQaReport => ({
      scores: { facts: 10, language: overall, persuasion: overall, clarity: overall, relevance: overall, speakability: overall },
      overall, unsupportedClaims: [], problems: [], rewriteBrief: "",
    });
    expect(isBetterDraft({ report: report(6), mechanicalIssues: 3, broken: 0 }, { report: report(9.9), mechanicalIssues: 0, broken: 2 })).toBe(false);
    expect(isBetterDraft({ report: report(9.9), mechanicalIssues: 0, broken: 2 }, { report: null, mechanicalIssues: 0, broken: 0 })).toBe(true);
    // Without `broken` (a single voice) the ranking is exactly as before.
    expect(isBetterDraft({ report: report(7), mechanicalIssues: 0 }, { report: report(8), mechanicalIssues: 0 })).toBe(true);
    expect(isBetterDraft({ report: report(8), mechanicalIssues: 0 }, { report: null, mechanicalIssues: 0 })).toBe(false);
  });
});

// ── 3 · The reported failure, every way the model produced it, run after run ─────────────────────
describe("a Male & Female Duo is a Male & Female Duo from the script to the last video prompt", () => {
  const expectDuoKit = async (out: Awaited<ReturnType<typeof run>>, where: string) => {
    // The voice-over: both people in every clip, each line in its own speaker's mouth.
    expect(speakersOf(out.voiceOverScript), where).toEqual([["girl", "boy"], ["girl", "boy"]]);
    expect(out.voiceOverScript, where).not.toMatch(/Sharma Electronics keeps[^\n]*\n?[^\n]*Have you seen/);
    // The frames: the same two people.
    for (const frame of out.mainFramePrompts) expect(frame, where).toContain("CAST SHEET — THE SAME TWO PEOPLE IN EVERY CLIP");
    const left = (out.mainFramePrompts[0].match(/• LEFT — ([^:]+):/) || [])[1];
    const right = (out.mainFramePrompts[0].match(/• RIGHT — ([^:]+):/) || [])[1];
    expect(left, where).toMatch(/^the woman in the /);
    expect(right, where).toMatch(/^the man in the /);
    // The video: two voices, each from their own side, the other reacting — never one presenter.
    expect(out.veoPrompts, where).toHaveLength(2);
    out.veoPrompts.forEach((prompt, i) => {
      expect(prompt, `${where} clip ${i + 1}`).toContain(`0–4s — ${left} (on the LEFT of the frame), with a bright, warm young woman's voice`);
      expect(prompt, `${where} clip ${i + 1}`).toContain(`4–8s — ${right} (on the RIGHT of the frame), with a calm, confident man's voice`);
      expect(prompt, `${where} clip ${i + 1}`).toContain("Only the one speaking moves their lips; the other listens with the mouth closed and reacts.");
      expect(prompt, `${where} clip ${i + 1}`).not.toMatch(/\[(?:Girl|Boy)\]|\bshe says in\b|Keep her exact face/);
    });
    expect(out.veoPrompts[0]).toContain('"Have you seen how many washing machines are here?"');
    expect(out.veoPrompts[0]).toContain('"Sharma Electronics keeps every single brand under one roof."');
    // The kit says what it is.
    expect(out.spec, where).toMatchObject({ characterPack: "human_duo_mixed", clipCount: 2, language: "English" });
  };

  it("survives every shape the script came back in — five runs of each", async () => {
    for (const [name, text] of SHAPES) {
      for (let n = 0; n < 5; n++) {
        calls.length = 0;
        dialogue = [text];
        await expectDuoKit(await run(form({ characterPack: "human_duo_mixed" })), `${name} #${n + 1}`);
      }
    }
  });

  it("never ships the draft that lost the man, even when the judge likes it more", async () => {
    dialogue = [GOOD, COLLAPSED, COLLAPSED];
    judge = [6.6, 9.8]; // the correct first draft is only polished; the collapsed one would have scored higher
    await expectDuoKit(await run(form({ characterPack: "human_duo_mixed" })), "gate");
  });

  it("writes the script again when the FIRST draft lost a speaker, though the judge would pass it — or cannot run", async () => {
    for (const verdict of [9.8, "none"] as const) {
      calls.length = 0;
      dialogue = [COLLAPSED, GOOD];
      judge = [verdict];
      const out = await run(form({ characterPack: "human_duo_mixed" }));
      await expectDuoKit(out, `judge ${verdict}`);
      // The broken draft was never judged; the new drafts were told what went wrong.
      const redraft = calls.filter((c) => /^Write the \d+-clip .* for:/m.test(c.user))[1];
      expect(redraft.user).toContain("THE PREVIOUS DRAFT DID NOT GIVE EVERY CHARACTER THEIR OWN LINES");
      expect(redraft.user).toContain("Clip 1 is missing Boy's line");
    }
  });

  it("stops the run — before any frame is made — when no draft gives both people their lines", async () => {
    dialogue = [COLLAPSED];
    await expect(run(form({ characterPack: "human_duo_mixed" }))).rejects.toThrow(
      /two-person conversation script for this Male & Female Duo ad came back without every speaker's own lines[\s\S]*Clip 1 is missing Boy's line[\s\S]*Press Generate/,
    );
    expect(madeFrames()).toBe(false);
    // It tried: the first draft and every redraft the gate allows.
    expect(calls.filter((c) => /^Write the \d+-clip .* for:/m.test(c.user)).length).toBe(3);
  });
});

// ── 4 · Every configuration in the catalogue, both ad types ────────────────────────────────────────
describe("every configuration keeps its cast from the script to the video prompts", () => {
  /** A script to contract for any cast — every speaker one line a clip, in order. */
  const scriptFor = (keys: string[], clips: number) => Array.from({ length: clips }, (_, c) =>
    keys.map((k, i) => `${c * 8}-${c * 8 + 8}|${k}: ${i === 0 ? "Have you seen the new washing machines at Sharma today?" : "Every brand is here with free home delivery for you."}`).join("\n"),
  ).join("\n");

  for (const adType of ["commercial", "festival"] as const) {
    it(`${adType}: frames, voice-over and Veo agree for all ${CHARACTER_CATALOGUE.length} entries`, async () => {
      for (const pack of CHARACTER_CATALOGUE) {
        calls.length = 0;
        const cast = packSpeakers(pack);
        dialogue = [scriptFor(cast.map((s) => s.key), 2)];
        const out = await run(form({
          characterPack: pack.id, adType, festivalName: adType === "festival" ? "Diwali" : "",
          customCharacter: pack.family === "custom" ? "a cheerful talking washing machine" : undefined,
        }));
        const where = `${adType}/${pack.id}`;
        // The script: exactly this cast in every clip, in order.
        expect(speakersOf(out.voiceOverScript, cast), where).toEqual([cast.map((s) => s.key), cast.map((s) => s.key)]);
        expect(out.spec?.characterPack, where).toBe(pack.id);
        // The video prompts: one per clip, voicing exactly this cast.
        expect(out.veoPrompts, where).toHaveLength(2);
        for (const prompt of out.veoPrompts) {
          if (pack.usesClientFace) {
            expect(prompt, where).toMatch(/^With a very sweet voice (?:she|he) needs to say :-/);
            continue;
          }
          const voices = prompt.match(/\bsays in English\b|\bsays in Indian English\b/g) || [];
          expect(voices.length, where).toBe(cast.length);
          if (cast.length > 1) {
            expect(prompt, where).toContain("(on the LEFT of the frame)");
            expect(prompt, where).toContain("(on the RIGHT of the frame)");
            expect(prompt, where).toContain("Only the one speaking moves their lips");
          } else {
            expect(prompt, where).not.toContain("(on the LEFT of the frame)");
          }
        }
        // The frames are written for the same cast: both on screen with their sides locked, or one alone —
        // invented people word for word on a cast sheet, a drawn pair at its scale anchor.
        const frameWriter = calls.find((c) => /Main Frame image prompts/.test(c.user))!;
        if (cast.length > 1) {
          expect(frameWriter.sys, where).toContain("BOTH characters together");
          expect(frameWriter.sys, where).toMatch(/ALWAYS stands on the LEFT of the frame and .* ALWAYS on the\s+RIGHT/);
          for (const frame of out.mainFramePrompts) {
            if (pack.family === "human_duo" || pack.family === "kids") expect(frame, where).toMatch(/CAST SHEET — THE SAME TWO (?:PEOPLE|CHILDREN) IN EVERY CLIP/);
            if (pack.scaleAnchor) expect(frame, where).toContain("SCALE ANCHOR");
          }
        } else {
          expect(frameWriter.sys, where).toContain(`${pack.characters[0].name} alone`);
          expect(frameWriter.sys, where).not.toContain("BOTH characters together");
        }
      }
    });
  }

  it("an ordinary ad stays one presenter of the ordered gender", async () => {
    for (const gender of ["female", "male"] as const) {
      calls.length = 0;
      singleVoice = "clip-1[0-8sec]: Sharma Electronics keeps every brand of television and washing machine under one roof for your whole family today.\nclip-2[8-16sec]: Every purchase comes with free home delivery and friendly expert advice, so choose Sharma Electronics with complete confidence today.";
      const out = await run(form({ gender }));
      expect(dialogueLabelsIn(out.voiceOverScript)).toEqual([]);
      // The writer answered with `clip-1[0-8sec]:` headers — read as headers, never spoken ("clip one zero eight sec").
      expect(out.voiceOverScript.split("\n")[0]).toBe("0-8: Sharma Electronics keeps every brand of television and washing machine under one roof for your whole family today.");
      expect(out.voiceOverScript).not.toMatch(/clip|sec\b/i);
      expect(out.spec).toMatchObject({ characterPack: "", gender });
      for (const prompt of out.veoPrompts) {
        expect(prompt).toContain(gender === "female" ? "she says in Indian English" : "he says in Indian English");
        expect(prompt).not.toContain("(on the LEFT of the frame)");
      }
    }
  });
});

// ── 5 · After the run: the kit's own cast, never the form's ───────────────────────────────────────
describe("every step after the run works on the kit as what it is", () => {
  it("records the configuration on the kit and puts it back over the form", () => {
    const spec = adSpecOf(form({ characterPack: "human_duo_mixed", language: "Telugu", aspectRatio: "16:9" }), 4);
    expect(spec).toMatchObject({ characterPack: "human_duo_mixed", language: "Telugu", aspectRatio: "16:9", clipCount: 4 });
    const later = form({ characterPack: undefined, language: "Hindi", aspectRatio: "9:16", duration: 64, textInstructions: "new brief" });
    const kitForm = formForKit(later, spec);
    expect(kitForm).toMatchObject({ characterPack: "human_duo_mixed", language: "Telugu", aspectRatio: "16:9", duration: 32, textInstructions: "new brief" });
    expect(formForKit(later, null)).toBe(later);
    // What a saved kit stores is the kit's spec — not the form's.
    expect(savedSettingsOf(later, spec)).toMatchObject({ characterPack: "human_duo_mixed", language: "Telugu", duration: 32 });
    // An older saved kit: its spec, else its stored settings.
    expect(adSpecFromSaved({ spec })).toEqual(spec);
    expect(adSpecFromSaved({ characterPack: "duo_motu_patlu", language: "Telugu", veoPrompts: ["a", "b", "c"], adType: "festival", festivalName: "Diwali" }))
      .toMatchObject({ characterPack: "duo_motu_patlu", clipCount: 3, adType: "festival", festivalName: "Diwali" });
  });

  it("rewrites a duo kit's video prompts as the duo, with the form changed underneath it", async () => {
    dialogue = [GOOD];
    const out = await run(form({ characterPack: "human_duo_mixed" }));
    const moved = form({ characterPack: undefined, gender: "male" });
    const fresh = await gemini.regenerateVeoForClips(out.voiceOverScript, formForKit(moved, out.spec), out.mainFramePrompts);
    expect(fresh.map((f) => f.prompt)).toEqual(out.veoPrompts);
  });

  it("refuses — and never voices one presenter — when the kit's script is not the cast it is given", async () => {
    dialogue = [GOOD];
    const out = await run(form({ characterPack: "human_duo_mixed" }));
    await expect(gemini.regenerateVeoForClips(out.voiceOverScript, form({ characterPack: undefined }), out.mainFramePrompts))
      .rejects.toThrow(/an ad with one presenter, but its voice-over script is a dialogue between \[Girl\] and \[Boy\]/);
    await expect(gemini.regenerateVeoForClips(out.voiceOverScript, form({ characterPack: "duo_motu_patlu" }), out.mainFramePrompts))
      .rejects.toThrow(/Motu & Patlu[\s\S]*\[Girl\], \[Boy\] are not speakers in this ad/);
    const legacy = formatDialogueScript(readDialogueScript(COLLAPSED, DUO_SPEAKERS).clips, DUO_SPEAKERS);
    await expect(gemini.regenerateVeoForClips(legacy, form({ characterPack: "human_duo_mixed" }), out.mainFramePrompts))
      .rejects.toThrow(/Boy never speaks in this script/);
    const refine = await gemini.refineVoiceOver({ script: out.voiceOverScript, instruction: "warmer", formData: form({ characterPack: undefined }), businessInfo: SHARMA });
    expect(refine.script).toBe(out.voiceOverScript);
    expect(refine.notApplied).toMatch(/one presenter, but its voice-over script is a dialogue/);
  });
});

// ── 6 · A member's own script says who speaks — checked before a single call ────────────────────
describe("a custom script is read as the cast before the run starts", () => {
  it("refuses a duo script with a label nobody in the ad has, with the format to use — and makes no call", async () => {
    await expect(run(form({ characterPack: "human_duo_mixed" }), { customScript: "clip-1[0-8sec]:\n[Girl]: A?\n[Ravi]: B." }))
      .rejects.toThrow(/\[Ravi\] is not a speaker in this ad[\s\S]*clip-1\[0-8sec\]:\n\[Girl\]: …\n\[Boy\]: …/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a duo script where one of the two never speaks, or lines have no speaker", async () => {
    await expect(run(form({ characterPack: "human_duo_mixed" }), { customScript: COLLAPSED })).rejects.toThrow(/Boy never speaks in this script/);
    await expect(run(form({ characterPack: "human_duo_mixed" }), { customScript: "clip-1[0-8sec]:\nA?\nB.\nclip-2[8-16sec]:\nC?\nD." }))
      .rejects.toThrow(/has a line with no speaker|a two-person ad needs to know who says each line/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a dialogue pasted into a one-presenter ad", async () => {
    await expect(run(form(), { customScript: "clip-1[0-8sec]:\n[Girl]: A?\n[Boy]: B." }))
      .rejects.toThrow(/conversation between \[Girl\] and \[Boy\], but this ad has one presenter/);
  });

  it("uses a one-character script written as plain clip lines word for word — it used to come back empty", async () => {
    const out = await run(form({ characterPack: "normal_female" }), {
      customScript: "clip-1[0-8sec]:\nSharma Electronics keeps every brand of television here for your family.\nclip-2[8-16sec]:\nVisit Sharma Electronics today for free home delivery on every purchase.",
    });
    expect(out.voiceOverScript).toContain("Sharma Electronics keeps every brand of television here for your family.");
    expect(out.voiceOverScript).toContain("Visit Sharma Electronics today for free home delivery on every purchase.");
    expect(out.veoPrompts).toHaveLength(2);
  });

  it("keeps a correctly labelled duo script word for word", async () => {
    const out = await run(form({ characterPack: "human_duo_mixed" }), { customScript: GOOD.replace(/\|boy:/g, "|[Boy]:") });
    expect(speakersOf(out.voiceOverScript)).toEqual([["girl", "boy"], ["girl", "boy"]]);
    expect(out.veoPrompts[1]).toContain('"Yes, free home delivery comes with every single purchase."');
  });

  it("holds a pasted final script to the same rules", () => {
    expect(readFinalScript(formatDialogueScript(readDialogueScript(COLLAPSED, DUO_SPEAKERS).clips, DUO_SPEAKERS), DUO_SPEAKERS, { expectedClips: 2 }).problems[0])
      .toMatch(/Boy never speaks in this script/);
    expect(readFinalScript("clip-1[0-8sec]:\n[Girl]: A?\n[Boy]: B.\nclip-2[8-16sec]:\n[Girl]: C?\n[Boy]: D.", [], { expectedClips: 2 }).problems[0])
      .toMatch(/one presenter, but this script is a conversation between \[Girl\] and \[Boy\]/);
  });
});
