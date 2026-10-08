import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

/**
 * Real Owner Face — the client's own face (owner, 2026-10-08):
 *   "for real face ads it was changing the face sometime, i mean adding bindhi to the face. check male and
 *    female both … correct frame generation prompt and the video generation prompt also"
 *   "For all the real person videos we need only this prompt based on gender of the video specification:
 *    With a very sweet voice she needs to say :- {Your Voice} with appropriate gestures
 *    Negative prompt :- No text on the screen"
 *
 * Checked in the prompt builders AND in a full run of the real pipeline against a fake Gemini.
 */

type Call = { sys: string; user: string };
const calls: Call[] = [];
let dialogue = "";

const FRAME_REPLY = (n: number) => Array.from({ length: n }, (_, i) =>
  `A photoreal frame for clip ${i + 1}: the business owner stands inside the shop beside the real counter, soft daylight.`).join("\n###CLIP###\n");

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (req: any) => {
        const sys = String(req.config?.systemInstruction || "");
        const user = (req.contents?.[0]?.parts || []).map((p: any) => p.text || "").join("\n");
        calls.push({ sys, user });
        const clips = Number((user.match(/Generate (\d+)(?: unique)? Main Frame image prompts/) || [])[1] || 0);
        if (/extract the following business information/i.test(sys)) {
          return { text: JSON.stringify({ businessName: "Sri Lakshmi Silks", businessType: "saree shop" }) };
        }
        if (clips > 0) return { text: FRAME_REPLY(clips) };
        // "Write the 2-clip presenter script spoken by the business owner for:"
        if (/^Write the \d+-clip [^\n]*\bfor:/m.test(user)) return { text: dialogue };
        if (/Direct these \d+ clips?/.test(user)) return { text: "[]" };
        return { text: req.config?.responseMimeType === "application/json" ? "{}" : "x".repeat(80) };
      },
    };
    constructor(_: any) {}
  },
  Type: {}, Modality: {},
}));

const motion = await import("@/services/prompts/motion");
const { withOwnerFaceLock, withOwnerImageDirective, OWNER_FACE_LOCK_HEADING } = await import("@/utils/frameBrand");
const { splitAttachmentDirective } = await import("@/utils/locationAssignment");
const { ownerWardrobeDirective, characterCastBlock, CHARACTER_MULTI_FRAME_SYSTEM_PROMPT } = await import("@/services/prompts/characterAd");
const { getCharacterPack } = await import("@/services/characterPacks");
const { veoEditProblems } = await import("@/utils/veoRefine");
let gemini: typeof import("@/services/geminiService");

beforeAll(async () => {
  vi.stubEnv("VITE_API_KEY_1", "k1");
  for (const level of ["log", "warn", "info", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  gemini = await import("@/services/geminiService");
});
beforeEach(() => { calls.length = 0; });

const OWNER_F = getCharacterPack("owner_face_female")!;
const OWNER_M = getCharacterPack("owner_face_male")!;

describe("the video prompt — only the owner's template, by gender", () => {
  it("is exactly the owner's words for a woman and for a man", () => {
    expect(motion.assembleRealPersonVeoPrompt({ gender: "female", line: "మా షాపులో కొత్త పట్టు చీరలు వచ్చాయి." })).toBe(
      "With a very sweet voice she needs to say :-\n\nమా షాపులో కొత్త పట్టు చీరలు వచ్చాయి.\n\nwith appropriate gestures\n\nNegative prompt :-\nNo text on the screen",
    );
    expect(motion.assembleRealPersonVeoPrompt({ gender: "male", line: "  Come and see   us today. " })).toBe(
      "With a very sweet voice he needs to say :-\n\nCome and see us today.\n\nwith appropriate gestures\n\nNegative prompt :-\nNo text on the screen",
    );
  });

  it("keeps the spoken line safe through a refine", () => {
    const original = motion.assembleRealPersonVeoPrompt({ gender: "female", line: "Visit us today." });
    expect(motion.spokenLinesIn(original)).toEqual(["Visit us today."]);
    const changed = original.replace("Visit us today.", "Visit us tomorrow.");
    expect(veoEditProblems(original, changed).join(" ")).toMatch(/spoken line/);
    expect(veoEditProblems(original, original.replace("with appropriate gestures", "with warm, appropriate gestures"))).toEqual([]);
  });
});

describe("the frame — the face is the photograph's, forehead included", () => {
  it("stamps a face lock into the text the member pastes — woman and man — and it survives Copy", () => {
    const woman = withOwnerImageDirective(withOwnerFaceLock("A photoreal frame of the owner at the counter.", "female"));
    const body = splitAttachmentDirective(woman).body;
    expect(body).toContain(`${OWNER_FACE_LOCK_HEADING}: the woman is the person in the attached owner image`);
    expect(body).toMatch(/a bare forehead in the photograph stays bare/);
    expect(body).toMatch(/no bindi, kumkum, sindoor, tilak or any mark on the forehead/);
    const man = withOwnerFaceLock("A photoreal frame of the owner.", "male");
    expect(man).toMatch(/the man is the person in the attached owner image/);
    expect(man).toMatch(/no tilak, bindi, kumkum, vibhuti or any mark on the forehead/);
    expect(withOwnerFaceLock(man, "male")).toBe(man); // once
  });

  it("composes the frame where the owner stands, mid-gesture — never mid-step", () => {
    const framed = motion.withRealPersonComposition("A frame.");
    expect(framed).toContain(`${motion.REAL_PERSON_COMPOSITION_HEADING}: the person speaks this clip's line to the camera`);
    expect(framed).toMatch(/never mid-step/);
    expect(motion.withRealPersonComposition(framed)).toBe(framed);
    expect(motion.withRealPersonComposition("A frame.", { plate: true })).toMatch(/the photograph's own framing/);
  });

  it("dresses the owner without a 'traditional look' on the face", () => {
    const saree = ownerWardrobeDirective("traditional", "", "female");
    expect(saree).toMatch(/designer silk saree/);
    expect(saree).not.toMatch(/jewellery,|tasteful traditional jewellery/);
    expect(saree).toMatch(/the clothes only: her face, forehead, hair and any jewellery stay exactly as in the owner's photograph/);
    expect(ownerWardrobeDirective("professional", "", "male")).toMatch(/the clothes only: his face/);
  });

  it("tells the frame writer — both genders — that nothing is added to the face", () => {
    for (const pack of [OWNER_F, OWNER_M]) {
      const block = characterCastBlock(pack, ownerWardrobeDirective("traditional", "", pack === OWNER_M ? "male" : "female"));
      expect(block).toMatch(/no bindi, tilak, kumkum, sindoor or\s+vibhuti mark/);
      expect(block).toMatch(/A bare forehead\s+in the photograph stays bare/);
    }
    // The male entry's own negatives now say it too (the female one always did).
    expect(OWNER_M.negatives.join(" ")).toMatch(/No bindi, tilak, kumkum, vibhuti or any other forehead mark added if the photograph has none/);
  });

  it("asks for a speaking pose, not walks, in the frame writer's prompt", () => {
    const sys = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(OWNER_F, {
      segmentCount: 2, clipSummaries: ["one", "two"], locationMode: "ai_generated", locationPlan: "", aspectRatio: "9:16",
      adType: "commercial", festivalName: "", businessContext: "{}", motionPlan: [],
    } as never);
    expect(sys).toMatch(/says the clip's line to the camera with natural, appropriate\s+gestures/);
    expect(sys).not.toMatch(/every clip MOVES/);
    expect(sys).not.toMatch(/🎬 THIS CLIP/);
  });
});

describe("a full Real Owner Face run (the real pipeline, a fake Gemini)", () => {
  const files = (): any => ({
    logo: null, visitingCard: [], storeImage: [], productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: [],
    ownerImage: new File([new Uint8Array([1, 2, 3])], "owner.jpg", { type: "image/jpeg" }),
  });
  const form = (over: Record<string, unknown> = {}): any => ({
    adType: "commercial", festivalName: "", attireType: "traditional", gender: "female", duration: 16, durationMode: "preset",
    textInstructions: "Sri Lakshmi Silks sells pure pattu sarees in Kakinada.", aspectRatio: "9:16", language: "English",
    characterPack: "owner_face_female", ...over,
  });

  for (const [pack, gender, pronoun] of [["owner_face_female", "female", "she"], ["owner_face_male", "male", "he"]] as const) {
    it(`gives a ${gender} owner the template, a face lock on every frame and no director call`, async () => {
      dialogue = [
        "0-8|owner: Welcome to Sri Lakshmi Silks, where every pure pattu saree is woven for your family's special days.",
        "8-16|owner: Come to Sri Lakshmi Silks in Kakinada today and choose your favourite saree from our new collection.",
      ].join("\n");
      const out = await gemini.generateAdAssets(form({ characterPack: pack, gender, attireType: gender === "male" ? "professional" : "traditional" }), files(), () => {}, {});
      expect(out.veoPrompts).toHaveLength(2);
      out.veoPrompts.forEach((prompt, i) => {
        expect(prompt.startsWith(`With a very sweet voice ${pronoun} needs to say :-\n\n`)).toBe(true);
        expect(prompt.endsWith("\n\nwith appropriate gestures\n\nNegative prompt :-\nNo text on the screen")).toBe(true);
        expect(motion.spokenLinesIn(prompt)[0]).toMatch(i === 0 ? /^Welcome to Sri Lakshmi Silks/ : /^Come to Sri Lakshmi Silks/);
      });
      // No director call: nothing about camera moves or walking can reach a real person's video.
      expect(calls.some((c) => /Direct these \d+ clips?/.test(c.user))).toBe(false);
      for (const frame of out.mainFramePrompts) {
        const body = splitAttachmentDirective(frame).body;
        expect(body).toContain(`${OWNER_FACE_LOCK_HEADING}: the ${gender === "male" ? "man" : "woman"} is the person in the attached owner image`);
        expect(body).toContain(motion.REAL_PERSON_COMPOSITION_HEADING);
        expect(body).not.toContain(motion.MOTION_COMPOSITION_HEADING);
        expect(frame).toContain("the OWNER IMAGE"); // the attach line is still there for the member
      }
      const frameCall = calls.find((c) => /Generate \d+ Main Frame image prompts/.test(c.user))!;
      expect(frameCall.sys).not.toMatch(/tasteful traditional jewellery/);
      expect(frameCall.sys).toMatch(/Add NOTHING to the face or forehead that the photograph does not show/);
    });
  }

  it("dresses a male owner as the picker shows — the form's leftover Traditional is not a kurta", async () => {
    dialogue = "0-8|owner: Welcome to Sri Lakshmi Silks.\n8-16|owner: Visit us in Kakinada today.";
    await gemini.generateAdAssets(form({ characterPack: "owner_face_male", gender: "female", attireType: "traditional" }), files(), () => {}, {});
    const frameCall = calls.find((c) => /Generate \d+ Main Frame image prompts/.test(c.user))!;
    expect(frameCall.sys).not.toMatch(/kurta with a Nehru jacket/);
    expect(frameCall.sys).toMatch(/premium tailored men's formal suit/);
  });
});
