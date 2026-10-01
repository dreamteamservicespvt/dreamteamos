import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

/**
 * The whole ad pipeline (services/geminiService generateAdAssets) against a fake Gemini that answers
 * each call by what it is — extraction, script, repair, frames, video director — so the 2026-10-01
 * fixes are checked where they actually live: in the run, not only in the prompt builders.
 *
 *   • the last clip says the VERIFIED address, and no clip invents one when there is none;
 *   • a client's store photo is attached to the frame writer and stamped as a background plate;
 *   • a human duo's frames carry one cast sheet and its video names each speaker by how they look;
 *   • Motu and Patlu carry the same scale anchor in the frame and the video;
 *   • every video prompt is bounded by its frame — nobody walks.
 */

type Call = { sys: string; user: string; json: boolean; images: number };
const calls: Call[] = [];
/** How the fake answers the script writer and the clip-level repair, per test. */
let script: { writer?: string; edit?: (user: string) => string; dialogue?: string } = { writer: "" };

const FRAME_REPLY = (n: number) => Array.from({ length: n }, (_, i) =>
  `A photoreal frame for clip ${i + 1}: the cast stands inside the business beside the real counter, shelves of stock behind, soft daylight.`).join("\n###CLIP###\n");

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (req: any) => {
        const sys = String(req.config?.systemInstruction || "");
        const parts = req.contents?.[0]?.parts || [];
        const user = parts.map((p: any) => p.text || "").join("\n");
        const images = parts.filter((p: any) => p.inlineData && /^image\//.test(p.inlineData.mimeType)).length;
        const json = req.config?.responseMimeType === "application/json";
        calls.push({ sys, user, json, images });
        const clips = Number((user.match(/Generate (\d+)(?: unique)? Main Frame image prompts/) || [])[1] || 0);
        if (/extract the following business information/i.test(sys)) {
          return { text: JSON.stringify({ businessName: "Sharma Electronics", businessType: "electronics store", services: ["TVs", "washing machines"] }) };
        }
        if (/location scout/i.test(sys)) {
          return { text: JSON.stringify([{ index: 0, zone: "billing counter", shows: "glass counter and TVs", lighting: "tube light", usable: true }]) };
        }
        if (clips > 0) return { text: FRAME_REPLY(clips) };
        // The human-model frame repair pass: hand the same frames back.
        const current = user.match(/---CURRENT PROMPTS---([\s\S]*?)(?:---|$)/);
        if (current) return { text: FRAME_REPLY(current[1].split("###CLIP###").length) };
        if (/^Write the \d+-clip .*script for:/m.test(user)) return { text: script.dialogue || "" };
        if (/^Generate a \d+-second .*voice-over script for:/m.test(user)) return { text: script.writer || "" };
        if (/^SCRIPT \(the whole script, for context\):/m.test(user) && script.edit) return { text: script.edit(user) };
        if (/Direct these \d+ clips?/.test(user)) return { text: "[]" };
        return { text: json ? "{}" : "x".repeat(80) };
      },
    };
    constructor(_: any) {}
  },
  Type: {}, Modality: {},
}));

let gemini: typeof import("@/services/geminiService");

beforeAll(async () => {
  vi.stubEnv("VITE_API_KEY_1", "k1");
  for (const level of ["log", "warn", "info", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  gemini = await import("@/services/geminiService");
});
beforeEach(() => { calls.length = 0; script = { writer: "" }; });

const noFiles = (): any => ({ logo: null, visitingCard: [], storeImage: [], productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: [] });
const form = (over: Record<string, unknown> = {}): any => ({
  adType: "commercial", festivalName: "", attireType: "traditional", gender: "female", duration: 16, durationMode: "preset",
  textInstructions: "Sharma Electronics sells every brand of TV and washing machine with free home delivery.", aspectRatio: "9:16",
  language: "English", ...over,
});
const run = (formData: any, files: any = noFiles()) => gemini.generateAdAssets(formData, files, () => {}, {});
const lastClipOf = (voiceOver: string) => voiceOver.trim().split(/\n/).filter(Boolean).at(-1) || "";

// Eighteen-word English clips, the second without and with the address.
const CLIP1 = "Sharma Electronics keeps every brand of television and washing machine under one roof for your whole family today.";
const CLIP2_PLAIN = "Every purchase comes with free home delivery and friendly expert advice, so choose Sharma Electronics with complete confidence today.";
const CLIP2_ROAD = "Visit our big showroom on the main road today, where every purchase comes with free delivery and friendly advice.";
const CLIP2_ADDRESS = "Visit Sharma Electronics at opposite RTC Bus Stand, Kakinada today for free delivery and friendly expert advice always.";

describe("the address in the last clip (problem 4)", () => {
  it("makes the last clip say the verified address — and repairs a script that left it out", async () => {
    script = {
      writer: `clip-1[0-8sec]: ${CLIP1}\nclip-2[8-16sec]: ${CLIP2_PLAIN}`,
      edit: () => JSON.stringify({ clips: [{ clip: 2, text: CLIP2_ADDRESS }] }),
    };
    const out = await run(form({
      textInstructions: "Sharma Electronics sells every brand of TV and washing machine.\nAddress: D.No 12-3-45, Main Road, Opp. RTC Bus Stand, Kakinada, Andhra Pradesh - 533001",
    }));
    const writer = calls.find((c) => /^Generate a \d+-second/m.test(c.user))!;
    expect(writer.sys).toContain("THE ADDRESS — MANDATORY IN THE LAST CLIP (STRICT)");
    expect(writer.sys).toContain("opposite RTC Bus Stand, Kakinada");
    // Door number, state and pincode are never spoken.
    expect(writer.sys).not.toMatch(/12-3-45|533001|Andhra Pradesh\s*$/m);
    const repair = calls.find((c) => /^SCRIPT \(the whole script/m.test(c.user))!;
    expect(repair.user).toContain('must say the business address "opposite RTC Bus Stand, Kakinada"');
    expect(lastClipOf(out.voiceOverScript)).toContain("opposite RTC Bus Stand, Kakinada");
  });

  it("never lets a clip invent an address when the client gave none", async () => {
    script = {
      writer: `clip-1[0-8sec]: ${CLIP1}\nclip-2[8-16sec]: ${CLIP2_ROAD}`,
      edit: () => JSON.stringify({ clips: [{ clip: 2, text: CLIP2_PLAIN }] }),
    };
    const out = await run(form());
    const writer = calls.find((c) => /^Generate a \d+-second/m.test(c.user))!;
    expect(writer.sys).toContain("NO ADDRESS WAS GIVEN — NEVER INVENT ONE (STRICT)");
    const repair = calls.find((c) => /^SCRIPT \(the whole script/m.test(c.user))!;
    expect(repair.user).toContain('speaks an address ("road") but the client gave none');
    expect(out.voiceOverScript).not.toMatch(/\broad\b/i);
  });

  it("leaves a member's own script word for word", async () => {
    const out = await gemini.generateAdAssets(form(), noFiles(), () => {}, {
      customScript: `clip-1[0-8sec]: ${CLIP1}\nclip-2[8-16sec]: ${CLIP2_PLAIN}`,
    });
    expect(out.voiceOverScript).toContain(CLIP2_PLAIN);
    expect(calls.some((c) => /THE ADDRESS — MANDATORY|NO ADDRESS WAS GIVEN/.test(c.sys))).toBe(false);
  });
});

describe("a client's store photo is the background plate (problem 6)", () => {
  it("attaches the photo to the frame writer, uses it in every clip, and stamps the plate", async () => {
    script = { writer: `clip-1[0-8sec]: ${CLIP1}\nclip-2[8-16sec]: ${CLIP2_PLAIN}\nclip-3[16-24sec]: ${CLIP2_PLAIN.replace("Every", "Each")}` };
    const files = noFiles();
    files.storeImage = [new File([new Uint8Array([1, 2, 3])], "shop.jpg", { type: "image/jpeg" })];
    const out = await run(form({ duration: 24, locationMode: "real_provided" }), files);
    const frameCall = calls.find((c) => /Generate \d+ unique Main Frame image prompts/.test(c.user))!;
    expect(frameCall.images).toBeGreaterThanOrEqual(1);
    expect(frameCall.user).toContain("Store/Office Image #1 — the background plate for clips 1, 2, 3");
    expect(frameCall.user).toContain("EACH PHOTOGRAPH A BACKGROUND PLATE");
    expect(out.mainFramePrompts).toHaveLength(3);
    for (const prompt of out.mainFramePrompts) {
      expect(prompt.startsWith("📎 ATTACH STORE/OFFICE IMAGE #1")).toBe(true);
      expect(prompt).toContain("BACKGROUND PLATE (STRICT): Use the attached Store/Office Image #1 AS the background, exactly as it is");
      expect(prompt).toContain("upscale it to 8K");
      expect(prompt).not.toMatch(/open stretch of floor|ATTACH NOTHING/);
    }
  });
});

describe("every video prompt animates its frame and nothing beyond it (problem 5)", () => {
  it("bounds each clip to its frame, describes the frame, and never walks", async () => {
    script = { writer: `clip-1[0-8sec]: ${CLIP1}\nclip-2[8-16sec]: ${CLIP2_PLAIN}` };
    const out = await run(form());
    expect(out.veoPrompts).toHaveLength(2);
    for (const prompt of out.veoPrompts) {
      expect(prompt).toContain("FRAME BOUNDARY — THIS VIDEO SHOWS ONLY WHAT THE ATTACHED FRAME SHOWS");
      expect(prompt).toContain("THE ATTACHED FRAME — WHAT THIS VIDEO ANIMATES, AND ALL IT MAY SHOW:");
      expect(prompt).toContain("beside the real counter, shelves of stock behind");
      expect(prompt).not.toMatch(/Walk and talk|walks a few|Follow Tracking|Pull Back|Orbit|Crane/);
    }
  });
});

describe("a human duo is one fixed pair of people (problem 1)", () => {
  it("stamps one cast sheet on every frame and names each speaker by how they look", async () => {
    script = {
      dialogue: [
        "0-8|friend: Have you seen how many washing machines are here?",
        "0-8|host: Sharma Electronics keeps every brand under one roof.",
        "8-16|friend: Do they really deliver all of this home?",
        "8-16|host: Yes, free home delivery comes with every purchase.",
      ].join("\n"),
    };
    const out = await run(form({ characterPack: "human_duo_female" }));
    const dialogueCall = calls.find((c) => /^Write the \d+-clip .*script for:/m.test(c.user))!;
    expect(dialogueCall.user).toMatch(/^Write the 2-clip two-person conversation script for:/m);
    expect(dialogueCall.sys).not.toContain("addresses Host BY NAME");
    const frameCall = calls.find((c) => /Generate \d+ Main Frame image prompts/.test(c.user))!;
    expect(frameCall.user).toContain("photoreal two-person ad with two real people");
    expect(frameCall.user).not.toContain("cartoon ad");
    const sheets = out.mainFramePrompts.map((p) => p.slice(p.indexOf("CAST SHEET")));
    expect(sheets[0]).toContain("CAST SHEET — THE SAME TWO PEOPLE IN EVERY CLIP");
    expect(new Set(sheets).size).toBe(1);
    const left = (sheets[0].match(/• LEFT — ([^:]+):/) || [])[1];
    expect(left).toMatch(/^the woman in the .+ saree$/);
    for (const prompt of out.veoPrompts) {
      expect(prompt).toContain(`ONLY ${left} (on the LEFT of the frame) speaks this line`);
      expect(prompt).not.toMatch(/ONLY (?:Friend|Host)\b/);
      expect(prompt).toContain("SCALE ANCHOR — EXACTLY AS IN THE ATTACHED FRAME");
    }
  });
});

describe("Motu and Patlu keep their heights (problem 3)", () => {
  it("carries the same scale anchor in every frame and every video, on a locked or focus-only camera", async () => {
    script = {
      dialogue: [
        "0-8|motu: Patlu, why is this shop always so very full?",
        "0-8|patlu: Motu, Sharma Electronics keeps every brand right here.",
        "8-16|motu: Do they deliver all these machines home too?",
        "8-16|patlu: Yes, free home delivery comes with every purchase.",
      ].join("\n"),
    };
    const out = await run(form({ characterPack: "duo_motu_patlu" }));
    for (const prompt of out.mainFramePrompts) {
      expect(prompt).toContain("SCALE ANCHOR: Motu and Patlu at their real heights from the show");
    }
    for (const prompt of out.veoPrompts) {
      expect(prompt).toContain("SCALE ANCHOR — EXACTLY AS IN THE ATTACHED FRAME, FOR ALL 8 SECONDS: Motu and Patlu at their real heights");
      expect(prompt).toMatch(/CAMERA — Eye level · \d+mm · (?:Static Locked|Rack Focus)/);
      // What they DO in the clip — the rules around it name these moves only to forbid them.
      const action = prompt.slice(prompt.indexOf("ACTION —"), prompt.indexOf("CAMERA —"));
      expect(action).not.toMatch(/steps? forward|half step|rocks forward|leans? (?:in|forward)/);
    }
  });
});
