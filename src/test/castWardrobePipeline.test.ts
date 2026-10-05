import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

/**
 * 2026-10-05 — "the girl and the boy always get the same outfit; we need them related to the video
 * context, the business context and the logo." The wardrobe stylist (prompts/castWardrobe) runs inside
 * the real pipeline (generateAdAssets) against a fake Gemini: it sees the logo, its checked answer is the
 * cast sheet on every frame, the frame writer's WARDROBE line says the same thing, the video names each
 * speaker by it — and when it cannot be used the run carries on with the cast sheet's own outfits.
 */

type Call = { sys: string; user: string; json: boolean; images: number };
const calls: Call[] = [];

/** What the fake stylist answers, call by call (the last one repeats). */
let stylist: string[] = [];
let dialogue = "";

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
        if (/wardrobe stylist/i.test(sys)) {
          const n = calls.filter((c) => /wardrobe stylist/i.test(c.sys)).length;
          return { text: stylist[Math.min(n, stylist.length) - 1] ?? "{}" };
        }
        if (/extract the following business information/i.test(sys)) {
          return { text: JSON.stringify({ businessName: "IconoIQ", businessType: "iconography learning kits", brandColorPalette: "Black, white and copper" }) };
        }
        const clips = Number((user.match(/Generate (\d+)(?: unique)? Main Frame image prompts/) || [])[1] || 0);
        if (clips > 0) return { text: FRAME_REPLY(clips) };
        if (/^Write the \d+-clip .*script for:/m.test(user)) return { text: dialogue };
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
beforeEach(() => { calls.length = 0; stylist = []; dialogue = ""; });

const logo = () => new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
const files = (withLogo = true): any => ({
  logo: withLogo ? logo() : null, visitingCard: [], storeImage: [], productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: [],
});
const form = (over: Record<string, unknown> = {}): any => ({
  adType: "commercial", festivalName: "", attireType: "traditional", gender: "female", duration: 16, durationMode: "preset",
  textInstructions: "IconoIQ sells Indian iconography learning kits that teach children temple art and the stories of the gods.",
  aspectRatio: "9:16", language: "English", ...over,
});
const run = (formData: any, f: any = files()) => gemini.generateAdAssets(formData, f, () => {}, {});
const stylistCalls = () => calls.filter((c) => /wardrobe stylist/i.test(c.sys));

const MIXED_DIALOGUE = [
  "0-8|girl: Have you seen these temple art kits for children?",
  "0-8|boy: IconoIQ kits teach the stories of our gods by building them.",
  "8-16|girl: Can children really make these temples on their own?",
  "8-16|boy: Yes, every kit comes with simple steps for every age.",
].join("\n");

const SAREE = "a deep teal Kanchipuram silk saree with a thin copper zari border, an elbow-length copper silk blouse, small gold jhumkas and a small bindi";
const KURTA = "an ivory raw-silk kurta with a mandarin collar, a deep teal churidar and a short copper Nehru jacket with antique buttons";
const GOOD = JSON.stringify({
  palette: "copper and ivory from the logo, with deep teal beside them",
  people: [
    { position: "LEFT", colour: "deep teal", garment: "saree", outfit: SAREE },
    { position: "RIGHT", colour: "ivory", garment: "kurta", outfit: KURTA },
  ],
});

describe("the duo is dressed for the business, the video and the logo", () => {
  it("asks the stylist once, with the logo, and dresses every frame, the WARDROBE line and the video by its answer", async () => {
    stylist = [GOOD];
    dialogue = MIXED_DIALOGUE;
    const out = await run(form({ characterPack: "human_duo_mixed" }));

    const asked = stylistCalls();
    expect(asked).toHaveLength(1);
    expect(asked[0].images).toBe(1);
    expect(asked[0].json).toBe(true);
    expect(asked[0].user).toMatch(/LEFT — a woman of about \d+\. Ordered style: a saree/);
    expect(asked[0].user).toMatch(/RIGHT — a man of about \d+\. Ordered style: Indian ethnic wear/);
    expect(asked[0].user).toContain("Name: IconoIQ");
    expect(asked[0].user).toContain("Brand palette (from the extraction): Black, white and copper");
    expect(asked[0].user).toContain("LOGO is attached");

    for (const frame of out.mainFramePrompts) {
      expect(frame).toContain(`• LEFT — the woman in the deep teal saree: an Indian woman of about 25 with `);
      expect(frame).toContain(`, wearing ${SAREE}`);
      expect(frame).toContain(`• RIGHT — the man in the ivory kurta: an Indian man of about 30 with `);
      expect(frame).toContain(`, wearing ${KURTA}`);
    }
    // The frame writer is told the same outfits — never a second, generic description beside the sheet.
    const frameCall = calls.find((c) => /Generate \d+ Main Frame image prompts/.test(c.user))!;
    const wardrobe = `${frameCall.sys}\n${frameCall.user}`.match(/WARDROBE \(as ordered[^\n]*/)![0];
    expect(wardrobe).toContain(SAREE);
    expect(wardrobe).toContain(KURTA);
    expect(wardrobe).not.toMatch(/drawn from the client's brand palette/);

    for (const prompt of out.veoPrompts) {
      expect(prompt).toContain("the woman in the deep teal saree");
      expect(prompt).toContain("the man in the ivory kurta");
    }
  });

  it("sends back what was wrong once, and uses the corrected answer", async () => {
    const sameColour = JSON.stringify({ people: [
      { position: "LEFT", colour: "ivory", garment: "saree", outfit: "an ivory Mangalagiri cotton-silk saree with a copper border, a copper blouse and gold studs" },
      { position: "RIGHT", colour: "ivory", garment: "kurta", outfit: KURTA },
    ] });
    stylist = [sameColour, GOOD];
    dialogue = MIXED_DIALOGUE;
    const out = await run(form({ characterPack: "human_duo_mixed" }));
    const asked = stylistCalls();
    expect(asked).toHaveLength(2);
    expect(asked[1].user).toMatch(/YOUR LAST ANSWER COULD NOT BE USED[\s\S]*both wear ivory/);
    expect(out.mainFramePrompts[0]).toContain(`, wearing ${SAREE}`);
  });

  it("carries on with the cast sheet's own outfits when the stylist cannot be used", async () => {
    stylist = ["{}", "not json"];
    dialogue = MIXED_DIALOGUE;
    const out = await run(form({ characterPack: "human_duo_mixed" }));
    expect(stylistCalls()).toHaveLength(2);
    const sheet = out.mainFramePrompts[0].slice(out.mainFramePrompts[0].indexOf("CAST SHEET"));
    expect(sheet).toMatch(/• LEFT — the woman in the .+ saree: /);
    expect(sheet).toMatch(/• RIGHT — the man in the .+ kurta: /);
    expect(sheet).not.toContain(SAREE);
  });
});

describe("who the stylist dresses", () => {
  it("never overrides a Custom order, and never dresses a cast whose look comes from elsewhere", async () => {
    dialogue = MIXED_DIALOGUE;
    stylist = [GOOD];
    const custom = await run(form({ characterPack: "human_duo_mixed", attireType: "custom", customAttire: "white kurta and white saree with copper borders" }));
    expect(stylistCalls()).toHaveLength(0);
    expect(custom.mainFramePrompts[0]).toContain("wearing exactly this outfit: white kurta and white saree with copper borders");
    const frameCall = calls.find((c) => /Generate \d+ Main Frame image prompts/.test(c.user))!;
    expect(`${frameCall.sys}\n${frameCall.user}`).toContain("exactly this, for the two of them: white kurta and white saree with copper borders");

    calls.length = 0;
    dialogue = [
      "0-8|motu: These kits teach the stories of our gods!",
      "0-8|patlu: IconoIQ makes temple art simple for every child.",
      "8-16|motu: Can I build a temple too?",
      "8-16|patlu: Yes, every kit comes with simple steps for every age.",
    ].join("\n");
    await run(form({ characterPack: "duo_motu_patlu" }));
    expect(stylistCalls()).toHaveLength(0);
  });

  it("dresses the single Normal Ad presenter, and without a logo says so", async () => {
    stylist = [JSON.stringify({ people: [{ position: "CENTRE", colour: "copper", garment: "blazer", outfit: "a tailored copper blazer over an ivory silk shell top with slim black formal trousers, small gold studs and a slim watch" }] })];
    await gemini.generateAdAssets(form({ characterPack: "normal_female", attireType: "professional" }), files(false), () => {}, {
      customScript: "clip-1[0-8sec]: IconoIQ kits teach children the stories of our gods by building beautiful temples at home.\nclip-2[8-16sec]: Every kit comes with simple steps for every age, so order your IconoIQ kit today.",
    });
    const asked = stylistCalls();
    expect(asked).toHaveLength(1);
    expect(asked[0].images).toBe(0);
    expect(asked[0].user).toMatch(/CENTRE — a woman of about 23\. Ordered style: formal business wear/);
    expect(asked[0].user).toContain("No logo is attached");
  });
});
