import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { VEO_FRAME_LOCK } from "@/services/prompts/motion";

/**
 * The whole ad pipeline (services/geminiService generateAdAssets) against a fake Gemini that answers
 * each call by what it is — extraction, script, repair, frames, video director — so the 2026-10-01
 * and 2026-10-05 fixes are checked where they actually live: in the run, not only in the prompt builders.
 *
 *   • the last clip says the VERIFIED address, and no clip invents one when there is none;
 *   • a client's store photo is attached to the frame writer and stamped as a background plate, and its
 *     video never shows more than the photo (a push-in, or a still camera while she walks);
 *   • a human duo's frames carry one cast sheet and its video names each speaker by how they look;
 *   • Motu and Patlu walk together and carry the same scale anchor in the frame and the video, filmed from
 *     the side at one distance;
 *   • every video prompt directs motion only, and every clip moves the way its frame was composed for.
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
    // The video never shows more of a client's photo than was photographed: the camera pushes in, or holds
    // still while she walks — never a side track, a glide or an arc — from a frame composed with her mid-step.
    expect(out.mainFramePrompts[1]).toContain("COMPOSITION FOR MOTION: Walk along the display (");
    expect(out.mainFramePrompts[1]).toContain("the subject placed into it caught mid-step on open, clear floor, with room to walk");
    expect(out.veoPrompts[0]).toContain("Smooth, steady push-in as she comes closer, ending in a medium shot: she walks slowly toward the camera");
    expect(out.veoPrompts[1]).toContain("Steady medium-wide shot from a still camera as she walks along: she walks slowly along the counter, display or shelves beside her");
    for (const prompt of out.veoPrompts) {
      expect(prompt).toContain(`this real place exactly ${VEO_FRAME_LOCK} shows it — the same layout, fixtures, products, signage, logo, colours and light`);
      expect(prompt).not.toMatch(/tracking|lateral dolly|arc shot/i);
      expect(prompt).toMatch(/push-in|still camera/i);
    }
  });
});

describe("every video prompt starts from its frame and moves inside it (problem 5)", () => {
  it("directs the motion only — never describes the frame — and moves every clip the way its frame was composed", async () => {
    script = { writer: `clip-1[0-8sec]: ${CLIP1}\nclip-2[8-16sec]: ${CLIP2_PLAIN}\nclip-3[16-24sec]: ${CLIP2_PLAIN.replace("Every", "Each")}` };
    const out = await run(form({ duration: 24 }));
    expect(out.veoPrompts).toHaveLength(3);
    out.veoPrompts.forEach((prompt) => {
      expect(prompt).toContain("one continuous 8-second shot that starts from the attached frame");
      expect(prompt).toContain(VEO_FRAME_LOCK);
      // The frame prompt said "beside the real counter, shelves of stock behind" — the video never repeats it.
      expect(prompt).not.toContain("shelves of stock behind");
      expect(prompt).not.toMatch(/Pull Back|Orbit|Crane|walk-?back|street|road|FRAME BOUNDARY/i);
      expect(prompt.split(/\s+/).length).toBeLessThanOrEqual(210);
    });
    // The same plan on both sides: each frame is composed for the action its video performs.
    expect(out.mainFramePrompts[0]).toContain("COMPOSITION FOR MOTION: this pose opens the clip (Walk toward the camera,");
    expect(out.veoPrompts[0]).toContain("she walks slowly toward the camera across the open floor");
    expect(out.mainFramePrompts[1]).toContain("COMPOSITION FOR MOTION: Walk along the display (");
    expect(out.veoPrompts[1]).toContain("Smooth side-tracking shot from a three-quarter front angle, the camera travelling sideways alongside her");
    expect(out.veoPrompts[1]).toContain("she walks slowly along the counter, display or shelves beside her");
    expect(out.mainFramePrompts[2]).toContain("COMPOSITION FOR MOTION: Walk in and invite (");
    expect(out.veoPrompts[2]).toContain("she walks the last few steps toward the camera and invites the viewer in");
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
      expect(prompt).toContain(`0–4s — ${left} (on the LEFT of the frame), with `);
      expect(prompt).not.toMatch(/\b(?:Friend|Host)\b/);
      expect(prompt).toContain(`— ${left} on the left and `);
      expect(prompt).toContain("Heights never change: Two adult women of normal height for the room");
    }
  });

  /**
   * The video side once read the line WITH the speaker's name — "the woman in the teal saree: …" — and
   * took "saree" for a product, planning a product shot for a clip whose frame was composed for
   * something else. Both sides now plan from the spoken words alone.
   */
  it("plans the same move for the frame and the video, whatever the speakers are called", async () => {
    script = {
      dialogue: [
        "0-8|friend: Have you seen how many washing machines are here?",
        "0-8|host: Sharma Electronics keeps every brand under one roof.",
        "8-16|friend: Can we really trust them with such big machines?",
        "8-16|host: Yes, they have served this town for twenty years.",
        "16-24|friend: Do they really deliver all of this home?",
        "16-24|host: Yes, free home delivery comes with every purchase.",
      ].join("\n"),
    };
    const out = await run(form({ characterPack: "human_duo_female", duration: 24 }));
    expect(out.veoPrompts).toHaveLength(3);
    // Planned from the spoken words alone: the promise ("trust", "twenty years") is walked up to and said. Read
    // with the names, "the woman in the … saree" would have made it a product shot instead.
    expect(out.mainFramePrompts[1]).toContain("COMPOSITION FOR MOTION: Walk, stop and explain (");
    expect(out.veoPrompts[1]).toContain("both take a few unhurried steps side by side across the floor and stop together");
    expect(out.veoPrompts[1]).toContain("Slow lateral dolly two-shot at eye level, the camera gliding sideways past them at one distance");
  });
});

describe("Motu and Patlu keep their heights (problem 3)", () => {
  it("carries the same scale anchor in every frame and every video — walking together, filmed from the side", async () => {
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
      expect(prompt).toContain("Heights never change: Motu and Patlu at their real heights");
      expect(prompt).toContain("— Motu on the left and Patlu on the right —");
      // Filmed only from the side, at one distance — never a move toward either of them.
      expect(prompt).toMatch(/(?:Smooth side-tracking|Slow lateral dolly) two-shot at eye level, the camera (?:travelling|gliding) sideways (?:with|past) them at one distance/);
      // What they DO: they walk together, side by side — and nobody comes nearer the lens.
      const action = prompt.split("\n\n")[1];
      expect(action).toContain("side by side");
      expect(action).not.toMatch(/steps? forward|half step|rocks forward|leans? (?:in|forward)|\bwalks? (?:\w+ ){0,3}toward the camera/);
    }
  });
});
