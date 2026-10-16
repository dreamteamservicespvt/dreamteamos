import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { CHARACTER_CATALOGUE } from "@/services/characterCatalogue";
import { getCharacterPack, isHumanPack, packSpeakers } from "@/services/characterPacks";
import { readDialogueScript } from "@/utils/dialogueFormat";
import { countSpokenWords, inWordBand } from "@/utils/scriptContract";
import { parseLabeledClips } from "@/utils/voiceOverFormat";
import { SCRIPT_IMPROVEMENT_PASSES } from "@/utils/scriptQa";
import { TELUGU_SCREEN_CTA } from "@/services/prompts/wordContract";
import type { AdFormData, FileStore } from "@/types/aiPlatform";

/**
 * 2026-10-15 — the whole voice-over loop, end to end, on a fake Gemini that answers each call by what it is:
 * generate → validate (in code, on the exact text) → repair the failing clips → judge (eight-dimension rubric)
 * → improve the best draft → judge again → the final acceptance gate. Every assertion below reads the ACTUAL
 * shipped text and counts it with the one counter; none of them only checks that a prompt says "17–20".
 */

// ── The fake Gemini ────────────────────────────────────────────────────────────────────────────────
type Call = { sys: string; user: string; json: boolean };
type FakeRequest = { config?: { systemInstruction?: unknown; responseMimeType?: string }; contents?: { parts?: { text?: string }[] }[] };
const calls: Call[] = [];
/** Replies, in order (the last one repeats). */
let writer: string[] = [];
let dialogue: string[] = [];
let wholeRepair: string[] = [];
let converter: string[] = [];
/** A clip-level edit (the repair, a polish, the refine editor): the user prompt in, the JSON out. */
let edit: (user: string, n: number) => string = () => "{}";
let judge: (user: string, n: number) => string = () => verdict(10);
let review: (user: string) => string = () => "{}";
let plan: string = "{}";
let extracted: Record<string, unknown> = {};
const SHARMA = { businessName: "Sharma Electronics", businessType: "electronics store", services: ["TVs", "washing machines"] };
const next = (queue: string[]) => (queue.length > 1 ? queue.shift()! : queue[0] ?? "");
let edits = 0;
let judgements = 0;

const DIMS = ["facts", "language", "persuasion", "clarity", "relevance", "speakability", "cast", "originality"];
/** The judge's reply: every dimension at `s` unless overridden. */
const verdict = (s: number, extra: Record<string, unknown> = {}, over: Record<string, number> = {}) =>
  JSON.stringify({ scores: { ...Object.fromEntries(DIMS.map((d) => [d, s])), ...over }, unsupportedClaims: [], problems: [], rewriteBrief: "", ...extra });

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (req: FakeRequest) => {
        const sys = String(req.config?.systemInstruction || "");
        const user = (req.contents?.[0]?.parts || []).map((p) => p.text || "").join("\n");
        const json = req.config?.responseMimeType === "application/json";
        calls.push({ sys, user, json });
        const frames = Number((user.match(/Generate (\d+)(?: unique)? Main Frame image prompts/) || [])[1] || 0);
        if (/extract the following business information/i.test(sys)) return { text: JSON.stringify(extracted) };
        if (frames > 0) return { text: Array.from({ length: frames }, (_, i) => `A photoreal frame for clip ${i + 1} inside the shop, soft daylight, the counter behind.`).join("\n###CLIP###\n") };
        const current = user.match(/---CURRENT PROMPTS---([\s\S]*?)(?:---|$)/);
        if (current) return { text: Array.from({ length: current[1].split("###CLIP###").length }, () => "A photoreal frame inside the shop.").join("\n###CLIP###\n") };
        if (/FINAL QUALITY GATE/.test(sys)) return { text: judge(user, ++judgements) };
        if (/LINGUISTIC QUALITY-ASSURANCE EDITOR/.test(sys)) return { text: review(user) };
        if (/senior script editor/.test(sys)) return { text: plan };
        if (/^Write the \d+-clip .* for:/m.test(user)) return { text: next(dialogue) };
        if (/^Generate a \d+-second .*voice-over script for:/m.test(user)) return { text: next(writer) };
        if (/^RAW TEXT PROVIDED BY THE BUSINESS:/m.test(user)) return { text: next(converter) };
        if (/^Repair this .*voice-over script/m.test(user)) return { text: next(wholeRepair) };
        if (/^SCRIPT \(the whole script, for context\):/m.test(user)) return { text: edit(user, ++edits) };
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
beforeEach(() => {
  calls.length = 0; writer = []; dialogue = []; wholeRepair = []; converter = [];
  edit = () => "{}"; judge = () => verdict(10); review = () => "{}"; plan = "{}";
  edits = 0; judgements = 0; extracted = SHARMA;
});

const noFiles = (): FileStore => ({ logo: null, visitingCard: [], storeImage: [], productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: [] });
const form = (over: Record<string, unknown> = {}): AdFormData => ({
  adType: "commercial", festivalName: "", attireType: "traditional", gender: "female", duration: 16, durationMode: "preset",
  textInstructions: "Sharma Electronics sells every brand of TV and washing machine with free home delivery.", aspectRatio: "9:16",
  language: "English", ...over,
} as AdFormData);
const run = (formData: AdFormData, files: FileStore = noFiles(), customScript?: string) =>
  gemini.generateAdAssets(formData, files, () => {}, customScript ? { customScript } : {});
const madeFrames = () => calls.some((c) => /Main Frame image prompts/.test(c.user));
const editCalls = () => calls.filter((c) => /^SCRIPT \(the whole script, for context\):/m.test(c.user));
const judgeCalls = () => calls.filter((c) => /FINAL QUALITY GATE/.test(c.sys));
/** The shipped single-voice clips and their spoken words, counted by the one counter. */
const shippedClips = (voiceOver: string) => parseLabeledClips(voiceOver);
const shippedWords = (voiceOver: string) => shippedClips(voiceOver).map(countSpokenWords);

// ── English clips of known length (counted again in the tests — never trusted) ──
const CLIP_A = "Sharma Electronics keeps every brand of television and washing machine under one roof for your whole family today."; // 18
const CLIP_B = "Every purchase comes with free home delivery and expert advice, so call the number on the screen today."; // 18
const CLIP_A_LONG = `${CLIP_A.replace(/\.$/, "")} with the best prices in this town.`; // 25
const CLIP_A_SHORT = "Sharma Electronics keeps every brand of television and washing machine for you."; // 12
const script = (...clips: string[]) => clips.map((c, i) => `${i * 8}-${i * 8 + 8}: ${c}`).join("\n");
/** A clip-level edit reply for one clip. */
const editReply = (clip: number, text: string) => JSON.stringify({ clips: [{ clip, text }] });

describe("the fixtures are what they claim", () => {
  it("counts the clips the tests are built on", () => {
    expect([CLIP_A, CLIP_B, CLIP_A_LONG, CLIP_A_SHORT].map(countSpokenWords)).toEqual([18, 18, 25, 12]);
  });
});

describe("a single voice — generate, validate, repair, judge, ship", () => {
  it("stops at once on a genuine 10/10 — the shipped text is exactly the checked text", async () => {
    writer = [script(CLIP_A, CLIP_B)];
    const out = await run(form());
    expect(shippedWords(out.voiceOverScript)).toEqual([18, 18]);
    expect(out.scriptQa).toMatchObject({ passed: true, score: 10, drafts: 1, passes: 0, stopReason: "perfect", clipWords: [18, 18] });
    expect(out.scriptQa!.checkedScript).toBe(out.voiceOverScript);
    expect(judgeCalls()).toHaveLength(1);
    expect(editCalls()).toHaveLength(0);
    // The judge was given the counts code measured.
    expect(judgeCalls()[0].sys).toContain("clip 1: 18, clip 2: 18");
  });

  it("cuts a 25-word first draft to the band by editing only that clip — with the exact size of the cut", async () => {
    writer = [script(CLIP_A_LONG, CLIP_B)];
    edit = () => editReply(1, CLIP_A);
    const out = await run(form());
    const [first] = editCalls();
    expect(first.user).toContain("- Clip 1: It has 25 spoken words — 5 words over the 20-word ceiling. REMOVE at least 5 words (removing 6 to 7 lands it at the preferred 18–19)");
    expect(first.user).toContain("25 words: 1·Sharma 2·Electronics");
    expect(first.user).not.toMatch(/- Clip 2:/);
    expect(first.sys).toContain("THE WORD BUDGET — 17–20 SPOKEN WORDS IN EVERY CLIP");
    expect(shippedClips(out.voiceOverScript)).toEqual([CLIP_A, CLIP_B]);
    expect(out.scriptQa).toMatchObject({ passed: true, clipWords: [18, 18] });
  });

  it("lengthens a 12-word first draft with real detail, never padding", async () => {
    writer = [script(CLIP_A_SHORT, CLIP_B)];
    edit = () => editReply(1, CLIP_A);
    const out = await run(form());
    expect(editCalls()[0].user).toContain("It has only 12 spoken words — 5 words under the 17-word floor. ADD at least 5 words (adding 6 to 7 lands it at the preferred 18–19), never more than 8 words");
    expect(editCalls()[0].user).toContain("never filler, a repeated adjective, empty praise or a greeting");
    expect(shippedWords(out.voiceOverScript)).toEqual([18, 18]);
  });

  it("tries again when a repair fails — and keeps only the edit that lands in the band", async () => {
    writer = [script(CLIP_A_LONG, CLIP_B)];
    const stillLong = `${CLIP_A.replace(/\.$/, "")} with the lowest prices in town.`; // 24
    edit = (_, n) => editReply(1, n === 1 ? stillLong : CLIP_A);
    const out = await run(form());
    expect(countSpokenWords(stillLong)).toBe(24);
    expect(editCalls().length).toBeGreaterThanOrEqual(2);
    expect(shippedClips(out.voiceOverScript)[0]).toBe(CLIP_A);
  });

  it("rejects a rewrite that fixes the language but breaks the word limit — the valid clip ships", async () => {
    writer = [script(CLIP_A, CLIP_B)];
    const betterButLong = "Every purchase comes with free home delivery and patient expert advice, so please call the number shown on the screen today."; // 21 — one over
    // Below "ready" (utils/scriptQa isReady, 2026-10-16), so the loop does try to improve it.
    judge = () => verdict(8.8, { problems: [{ clip: 2, dimension: "language", issue: "the ending is flat", fix: "warmer close" }] }, { language: 8.8 });
    edit = () => editReply(2, betterButLong);
    const out = await run(form());
    expect(countSpokenWords(betterButLong)).toBe(21);
    expect(out.voiceOverScript).not.toContain("patient expert advice");
    expect(shippedClips(out.voiceOverScript)).toEqual([CLIP_A, CLIP_B]);
    expect(out.scriptQa).toMatchObject({ passed: false, stopReason: "stalled" });
    expect(out.scriptQa!.score).toBeLessThan(10);
  });

  it("never ships a word-count fix that invented a fact — the judge catches it and a new draft wins", async () => {
    writer = [script(CLIP_A_LONG, CLIP_B), script(CLIP_A, CLIP_B)];
    const invented = "Sharma Electronics gives free installation for every television and washing machine you buy from us here this month."; // 18
    edit = () => editReply(1, invented);
    judge = (user) => /installation/.test(user)
      ? verdict(9, { unsupportedClaims: ["clip 1: free installation — not in the business information"] })
      : verdict(10);
    const out = await run(form());
    expect(countSpokenWords(invented)).toBe(18);
    expect(out.voiceOverScript).not.toMatch(/installation/);
    expect(out.scriptQa).toMatchObject({ passed: true, score: 10 });
    // The new draft was told why.
    const redraft = calls.filter((c) => /^Generate a \d+-second/m.test(c.user))[1];
    expect(redraft.user).toContain("A PREVIOUS DRAFT OF THIS SCRIPT FAILED THE QUALITY CHECK");
    expect(redraft.user).toContain("free installation");
  });

  it("asks a malformed judge once more, then ships unscored — never calling it 10/10", async () => {
    writer = [script(CLIP_A, CLIP_B)];
    judge = () => "the judge is unavailable today";
    const out = await run(form());
    expect(judgeCalls()).toHaveLength(2);
    expect(out.scriptQa).toMatchObject({ unscored: true, passed: false, score: 0, stopReason: "unscored", clipWords: [18, 18] });
    expect(shippedWords(out.voiceOverScript)).toEqual([18, 18]);
  });

  it("treats a report missing a dimension as no report at all", async () => {
    writer = [script(CLIP_A, CLIP_B)];
    judge = () => JSON.stringify({ scores: { facts: 10, language: 10, persuasion: 10, clarity: 10, relevance: 10, speakability: 10 } });
    const out = await run(form());
    expect(out.scriptQa).toMatchObject({ unscored: true, passed: false });
  });

  it("spends at most the improvement budget, then ships the best draft with its REAL score", async () => {
    writer = [script(CLIP_A, CLIP_B)];
    // Each judgement a little higher, always with one problem left in clip 1: every pass improves, none is ready.
    judge = (_, n) => verdict(Math.min(8.7, 8.2 + n * 0.1), { problems: [{ clip: 1, dimension: "persuasion", issue: "the hook is soft", fix: "sharper hook" }] }, { persuasion: 9.4 });
    const adverbs = ["gladly", "proudly", "warmly", "happily", "always", "simply", "truly"];
    edit = (_, n) => editReply(1, `${CLIP_A.replace(/ today\.$/, "")} ${adverbs[n % adverbs.length]}.`);
    const out = await run(form());
    expect(out.scriptQa).toMatchObject({ passes: SCRIPT_IMPROVEMENT_PASSES, stopReason: "passes", drafts: SCRIPT_IMPROVEMENT_PASSES + 1, passed: false });
    expect(judgeCalls()).toHaveLength(SCRIPT_IMPROVEMENT_PASSES + 1);
    // The best judgement gave persuasion 9.4 — but the judge listed a problem against persuasion, so code holds
    // it at 9 and the REAL overall is 8.7 (8.6 elsewhere), never the judge's rounder number.
    expect(out.scriptQa!.scores.persuasion).toBe(9);
    expect(out.scriptQa!.score).toBe(8.7);
    expect(shippedWords(out.voiceOverScript).every(inWordBand)).toBe(true);
  });

  it("stops the run — before any frame — when no repair or new draft can fit a clip to 17–20 words", async () => {
    writer = [script(CLIP_A_LONG, CLIP_B)];
    edit = (_, n) => editReply(1, `${CLIP_A_LONG.replace(/\.$/, "")} again ${["now", "here", "today"][n % 3]}.`);
    await expect(run(form())).rejects.toThrow(/could not be fitted to 17–20 spoken words in every clip[\s\S]*Clip 1 must contain 17–20 spoken words, but it has \d+[\s\S]*Press Generate/);
    expect(madeFrames()).toBe(false);
  });

  it("repairs a duplicated clip and a missing one", async () => {
    writer = [script(CLIP_A, CLIP_A)];
    edit = () => editReply(2, CLIP_B);
    const out = await run(form());
    expect(editCalls()[0].user).toContain("Clip 2 duplicates clip 1.");
    expect(shippedClips(out.voiceOverScript)).toEqual([CLIP_A, CLIP_B]);

    calls.length = 0;
    writer = [script(CLIP_A)];
    wholeRepair = [script(CLIP_A, CLIP_B)];
    const out2 = await run(form());
    expect(calls.some((c) => /^Repair this English voice-over script/m.test(c.user) && /Structured output contains 1 clips instead of the required 2/.test(c.user))).toBe(true);
    expect(shippedClips(out2.voiceOverScript)).toEqual([CLIP_A, CLIP_B]);
  });

  it("counts a price as it is SPOKEN — the checked text is the shipped text", async () => {
    // 16 tokens on the page; "₹999" is said as five words, so the clip is 20 spoken words — exactly the ceiling, allowed.
    const priced = "Every washing machine at Sharma Electronics starts at just ₹999 this week with free home delivery.";
    expect(countSpokenWords(priced)).toBe(16);
    writer = [script(priced, CLIP_B)];
    const out = await run(form());
    const [first] = shippedClips(out.voiceOverScript);
    expect(first).toContain("nine hundred ninety-nine rupees");
    expect(first).not.toMatch(/\d/);
    expect(countSpokenWords(first)).toBe(20);
    expect(out.scriptQa!.clipWords).toEqual([20, 18]);
    expect(out.scriptQa!.checkedScript).toBe(out.voiceOverScript);
    expect(editCalls()).toHaveLength(0);
  });

  it("never rewrites a member's own script — even a 25-word clip ships word for word", async () => {
    const own = `clip-1[0-8sec]: ${CLIP_A_LONG}\nclip-2[8-16sec]: Call us today.`;
    const out = await run(form(), noFiles(), own);
    expect(shippedClips(out.voiceOverScript)).toEqual([CLIP_A_LONG, "Call us today."]);
    expect(out.scriptQa ?? null).toBeNull();
    expect(judgeCalls()).toHaveLength(0);
    expect(editCalls()).toHaveLength(0);
  });

  it("keeps commercial and festival structure apart — and both under the same contract", async () => {
    writer = [script(CLIP_A, CLIP_B)];
    await run(form({ adType: "festival", festivalName: "Diwali" }));
    const festivalWriter = calls.find((c) => /^Generate a \d+-second/m.test(c.user))!;
    expect(festivalWriter.sys).toContain("FESTIVAL MODE");
    expect(festivalWriter.sys).toContain("THE WORD BUDGET — 17–20 SPOKEN WORDS IN EVERY CLIP");
    calls.length = 0;
    await run(form());
    const commercialWriter = calls.find((c) => /^Generate a \d+-second/m.test(c.user))!;
    expect(commercialWriter.sys).toContain("COMMERCIAL MODE");
    expect(commercialWriter.sys).toContain("THE WORD BUDGET — 17–20 SPOKEN WORDS IN EVERY CLIP");
  });
});

// ── Telugu: the fixed closing sentence counts inside its clip; a spoken phone number is caught ──
const TE = ["మా", "షాప్", "లో", "ప్రతి", "కుటుంబం", "కోసం", "మంచి", "బట్టలు", "ఉన్నాయి", "ఈరోజే", "కొత్త", "డిజైన్లు",
  "చూడండి", "ధరలు", "తక్కువ", "సేవ", "బాగుంటుంది", "మీకు", "నచ్చుతుంది", "అందరికీ", "పెద్ద", "కలెక్షన్", "రంగులు", "చీరలు"];
const te = (from: number, n: number) => `${TE.slice(from, from + n).join(" ")}.`;
const closing = (n: number) => `${TE.slice(10, 10 + n).join(" ")}, ${TELUGU_SCREEN_CTA}`;

describe("Telugu — the closing call line is counted inside the final clip", () => {
  it("accepts a final clip of 10 words + the 9-word call line (19), and cuts one of 12 + 9 (21)", async () => {
    expect(countSpokenWords(closing(10))).toBe(19);
    expect(countSpokenWords(closing(12))).toBe(21);
    writer = [script(te(0, 18), closing(12))];
    edit = () => editReply(2, closing(10));
    const out = await run(form({ language: "Telugu" }));
    expect(editCalls()[0].user).toContain("- Clip 2: It has 21 spoken words — 1 word over the 20-word ceiling");
    // The repair is told the exact room the fixed call line leaves — and to drop any other offer (found live).
    expect(editCalls()[0].user).toContain(`This final clip must keep "${TELUGU_SCREEN_CTA}" word for word (9 words), which leaves room for 8–11 other words: a short invitation only — leave out any other offer or detail.`);
    expect(editCalls()[0].user).toContain("if it still does not fit, leave out a secondary offer or detail");
    expect(editCalls()[0].sys).toContain(`is 9 words and counts INSIDE that clip's 17–20, so the rest of the final clip has 8–11 words`);
    const clips = shippedClips(out.voiceOverScript);
    expect(clips.map(countSpokenWords)).toEqual([18, 19]);
    expect(clips[1]).toContain(TELUGU_SCREEN_CTA);
  });

  it("catches a phone number spoken as Telugu digits — the check never matched Telugu before", async () => {
    writer = [script(`${TE.slice(0, 15).join(" ")} తొమ్మిది ఎనిమిది నాలుగు.`, closing(10))];
    edit = () => editReply(1, te(0, 18));
    const out = await run(form({ language: "Telugu" }));
    expect(editCalls()[0].user).toContain("Clip 1 appears to speak a phone/contact number");
    expect(shippedClips(out.voiceOverScript)[0]).toBe(te(0, 18));
  });
});

// ── A cast: the two lines of a clip together ──
const DUO = getCharacterPack("human_duo_mixed")!;
const DUO_SPEAKERS = packSpeakers(DUO);
const duoScript = (clips: [string, string][]) => clips.map(([a, b], i) => `${i * 8}-${i * 8 + 8}|girl: ${a}\n${i * 8}-${i * 8 + 8}|boy: ${b}`).join("\n");
const Q1 = "Have you seen the new washing machines here today?"; // 9
const A1 = "Every brand is right here with free home delivery."; // 9
const Q2 = "Is every television here sold with a long warranty?"; // 9
const A2 = "Yes, the service team visits your home within a day."; // 10
const dialogueEdit = (clip: number, a: string, b: string) => JSON.stringify({ clips: [{ clip, lines: [{ speaker: "girl", text: a }, { speaker: "boy", text: b }] }] });
const castClips = (voiceOver: string, speakers = DUO_SPEAKERS) => readDialogueScript(voiceOver, speakers).clips;

describe("a two-person cast — 17–20 words across both lines together", () => {
  it("counts the clip, not each line — and fixes a 23-word clip without losing either speaker", async () => {
    const longA = `${A1.replace(/\.$/, "")} and the best prices too.`; // 14
    dialogue = [duoScript([[Q1, longA], [Q2, A2]])];
    edit = () => dialogueEdit(1, Q1, A1);
    const out = await run(form({ characterPack: "human_duo_mixed" }));
    expect(editCalls()[0].user).toContain("Its two lines together have 23 spoken words — 3 words over the 20-word ceiling. REMOVE at least 3 words");
    expect(editCalls()[0].user).toContain("Boy's line has 14 spoken words — 2 words over the 12-word ceiling");
    expect(editCalls()[0].sys).toContain("A clip's TWO lines TOGETHER make the 17–20 — never 17–20 each");
    const clips = castClips(out.voiceOverScript);
    expect(clips.map((c) => c.map((l) => l.speaker))).toEqual([["girl", "boy"], ["girl", "boy"]]);
    expect(clips.map((c) => c.reduce((s, l) => s + countSpokenWords(l.text), 0))).toEqual([18, 19]);
    expect(out.scriptQa).toMatchObject({ passed: true, clipWords: [18, 19] });
  });

  it("puts the speakers back in order when a draft swaps them", async () => {
    dialogue = [[`0-8|boy: ${A1}`, `0-8|girl: ${Q1}`, `8-16|girl: ${Q2}`, `8-16|boy: ${A2}`].join("\n")];
    edit = () => dialogueEdit(1, Q1, A1);
    const out = await run(form({ characterPack: "human_duo_mixed" }));
    expect(editCalls()[0].user).toContain("Girl must speak in position 1");
    expect(castClips(out.voiceOverScript).map((c) => c.map((l) => l.speaker))).toEqual([["girl", "boy"], ["girl", "boy"]]);
  });
});

// ── Every entry of the catalogue, both ad types, through the real pipeline ──
describe("every catalogue entry — writer, repair, judge and the final gate agree on one contract", () => {
  /** A valid script for this cast, with clip 1 over-long so the repair has to work. */
  const linesFor = (pack: (typeof CHARACTER_CATALOGUE)[number]) => {
    const cast = packSpeakers(pack);
    const named = !isHumanPack(pack) && cast.length > 1;
    if (cast.length === 1) {
      return {
        clips: [
          ["Have you seen the new washing machines here today, with every brand and free home delivery for you?"],
          ["Every television here comes with a long warranty, and our service team visits your home within a day."],
        ],
        long: ["Have you seen the new washing machines here today, with every brand and free home delivery for you and the whole family?"],
      };
    }
    const [a, b] = cast.map((s) => s.name);
    const first = named
      ? [`${b}, have you seen the new washing machines here today?`, `${a}, every brand is here with free delivery.`]
      : [Q1, A1];
    return { clips: [first, [Q2, A2]], long: [first[0], `${first[1].replace(/\.$/, "")} and the best prices too.`] };
  };

  for (const adType of ["commercial", "festival"] as const) {
    it(`${adType}: all ${CHARACTER_CATALOGUE.length} entries ship 17–20 words a clip, checked and judged as their own cast`, async () => {
      for (const pack of CHARACTER_CATALOGUE) {
        calls.length = 0; edits = 0; judgements = 0;
        const cast = packSpeakers(pack);
        const { clips, long } = linesFor(pack);
        const canonical = (rows: string[][]) => rows.map((lines, c) => lines.map((t, i) => `${c * 8}-${c * 8 + 8}|${cast[i].key}: ${t}`).join("\n")).join("\n");
        dialogue = [canonical([long, clips[1]])];
        edit = () => JSON.stringify({ clips: [{ clip: 1, lines: clips[0].map((text, i) => ({ speaker: cast[i].key, text })) }] });
        judge = () => verdict(10);
        const photo = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
        const files = pack.family === "owner_duo" ? { ...noFiles(), ownerImage: photo("o1.jpg"), secondOwnerImage: photo("o2.jpg") } : noFiles();
        const out = await run(form({
          characterPack: pack.id, adType, festivalName: adType === "festival" ? "Diwali" : "",
          customCharacter: pack.family === "custom" ? "a cheerful talking washing machine" : undefined,
        }), files);
        const where = `${adType}/${pack.id}`;
        const pair = cast.length > 1;
        // The writer and the clip repair stated the contract for THIS cast.
        const writerCall = calls.find((c) => /^Write the \d+-clip .* for:/m.test(c.user))!;
        expect(writerCall.sys, where).toContain(pair ? "A clip's TWO lines TOGETHER make the 17–20" : "The one speaker's line IS the clip");
        const [repair] = editCalls();
        expect(repair, where).toBeTruthy();
        expect(repair.sys, where).toContain("THE WORD BUDGET — 17–20 SPOKEN WORDS IN EVERY CLIP");
        expect(repair.sys, where).toContain(pair ? `exactly 2 lines, ${cast[0].name} then ${cast[1].name}, in that order` : `ONE line from ${cast[0].name}`);
        expect(repair.user, where).toMatch(/- Clip 1: [^\n]*(?:Its two lines together have|It has) 2[1-9] spoken words — \d words? over the 20-word ceiling/);
        // The judge was told who the cast is and what code counted.
        const judgeCall = judgeCalls()[0];
        expect(judgeCall.sys, where).toContain(pack.label);
        expect(judgeCall.sys, where).toMatch(/clip 1: \d+, clip 2: \d+/);
        // What shipped: this cast in every clip, every clip 17–20, and exactly the checked text.
        const shipped = castClips(out.voiceOverScript, cast);
        expect(shipped.map((c) => c.map((l) => l.speaker)), where).toEqual([cast.map((s) => s.key), cast.map((s) => s.key)]);
        const totals = shipped.map((c) => c.reduce((s, l) => s + countSpokenWords(l.text), 0));
        expect(totals.every(inWordBand), `${where}: ${totals}`).toBe(true);
        expect(out.scriptQa?.clipWords, where).toEqual(totals);
        expect(out.scriptQa?.checkedScript, where).toBe(out.voiceOverScript);
        expect(out.scriptQa?.passed, where).toBe(true);
      }
    });
  }
});

// ── The refine editor and the Script Duration Checker obey the same contract ──
describe("after the run — refine and the Script Duration Checker", () => {
  it("refuses a refine whose edited clip comes back 21 words, and applies one inside the band", async () => {
    const kit = script(CLIP_A, CLIP_B);
    plan = JSON.stringify({ understood: "Warmer close", clips: [{ clip: 2, change: "make the close warmer" }], notPossible: "", alreadyDone: "" });
    const twentyOne = "Every purchase comes with free home delivery and warm expert advice, so call the number shown on the screen today."; // 20? counted below
    const tooLong = `${twentyOne.replace(/ today\.$/, "")} right now.`;
    edit = () => editReply(2, tooLong);
    const refused = await gemini.refineVoiceOver({ script: kit, instruction: "make the close warmer", formData: form(), businessInfo: SHARMA });
    expect(countSpokenWords(tooLong)).toBe(21);
    expect(refused.changed).toEqual([]);
    expect(refused.notApplied).toContain("Clip 2 must contain 17–20 spoken words, but it has 21.");
    expect(refused.script).toBe(kit);

    edit = () => editReply(2, twentyOne);
    const applied = await gemini.refineVoiceOver({ script: kit, instruction: "make the close warmer", formData: form(), businessInfo: SHARMA });
    expect(countSpokenWords(twentyOne)).toBe(20);
    expect(applied.changed).toEqual([1]);
    expect(shippedWords(applied.script)).toEqual([18, 20]);
  });

  it("converts raw text into clips that all hold 17–20 spoken words, repairing the one that does not", async () => {
    converter = [script(CLIP_A_LONG, CLIP_B)];
    edit = () => editReply(1, CLIP_A);
    const conversion = await gemini.convertToVoiceOverScript("Sharma Electronics: every TV and washing machine brand, free home delivery, expert advice.", { clipCount: 2, language: "English" });
    expect(conversion.clips.map((c) => c.wordCount)).toEqual([18, 18]);
    expect(editCalls()[0].user).toContain("SOURCE TEXT (the only allowed source of facts)");
    expect(gemini.WORD_BAND).toEqual({ min: 17, max: 20 });
    expect(gemini.suggestClipCount(`${CLIP_A} ${CLIP_B}`)).toBe(2);
  });
});
