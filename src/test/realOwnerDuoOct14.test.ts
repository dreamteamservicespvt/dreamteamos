import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

/**
 * The Real Owner Duo — Real Owner Face for TWO owners (owner, 2026-10-14): Male + Male, Female + Female,
 * Male + Female. The configuration is the one source of truth: Owner 1 is owner photo 1, stands on the LEFT
 * and speaks first (on Male + Female the man); Owner 2 is owner photo 2, on the RIGHT. Both in every clip,
 * never swapped, blended, duplicated, invented or lost. The video prompt is the owner's real-person template,
 * for two (the owner's answer).
 *
 * Checked in the prompt builders AND in a full run of the real pipeline against a fake Gemini, for all three.
 */

type Call = { sys: string; user: string; images: number };
const calls: Call[] = [];
let dialogue = "";

const FRAME_REPLY = (n: number) => Array.from({ length: n }, (_, i) =>
  `A photoreal frame for clip ${i + 1}: the two owners stand side by side inside their shop beside the real counter, soft daylight.`).join("\n###CLIP###\n");

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (req: any) => {
        const sys = String(req.config?.systemInstruction || "");
        const parts = req.contents?.[0]?.parts || [];
        const user = parts.map((p: any) => p.text || "").join("\n");
        calls.push({ sys, user, images: parts.filter((p: any) => p.inlineData).length });
        const clips = Number((user.match(/Generate (\d+)(?: unique)? Main Frame image prompts/) || [])[1] || 0);
        if (/extract the following business information/i.test(sys)) {
          return { text: JSON.stringify({ businessName: "Sharma Electronics", businessType: "electronics shop" }) };
        }
        if (clips > 0) return { text: FRAME_REPLY(clips) };
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
const { withOwnerDuoFaceLock, withOwnerImageDirective, OWNER_FACE_LOCK_HEADING } = await import("@/utils/frameBrand");
const { splitAttachmentDirective } = await import("@/utils/locationAssignment");
const {
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, CHARACTER_VOICEOVER_SYSTEM_PROMPT, ownerDuoWardrobeDirective, packVeoSubject,
} = await import("@/services/prompts/characterAd");
const { packLocationSubject } = await import("@/services/prompts/realLocation");
const {
  getCharacterPack, isOwnerDuoPack, ownerPhotoFile, ownerPhotoSlots, ownerSlotLabel, packSpeakers,
} = await import("@/services/characterPacks");
const { castLabelFor, attireOptionsFor } = await import("@/utils/adRequirement");
const { veoEditProblems } = await import("@/utils/veoRefine");
const { buildMissionTasks } = await import("@/components/ai-platform/generation/mission");
let gemini: typeof import("@/services/geminiService");

beforeAll(async () => {
  vi.stubEnv("VITE_API_KEY_1", "k1");
  for (const level of ["log", "warn", "info", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  gemini = await import("@/services/geminiService");
});
beforeEach(() => { calls.length = 0; });

/** The three configurations, with who stands where. */
const CONFIGS = [
  { id: "owner_duo_male", left: "man", right: "man", label: "Real Owner Duo (Male + Male)" },
  { id: "owner_duo_female", left: "woman", right: "woman", label: "Real Owner Duo (Female + Female)" },
  { id: "owner_duo_mixed", left: "man", right: "woman", label: "Real Owner Duo (Male + Female)" },
] as const;

const photo = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
const files = (over: Record<string, unknown> = {}): any => ({
  logo: null, visitingCard: [], storeImage: [], productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: [],
  ownerImage: photo("owner1.jpg"), secondOwnerImage: photo("owner2.jpg"), ...over,
});
const form = (over: Record<string, unknown> = {}): any => ({
  adType: "commercial", festivalName: "", attireType: "professional", gender: "female", duration: 16, durationMode: "preset",
  textInstructions: "Sharma Electronics in Kakinada sells every brand of TV and washing machine with free home delivery.",
  aspectRatio: "9:16", language: "English", ...over,
});
const TWO_CLIPS = [
  "0-8|owner1: Why is our shop always so full?",
  "0-8|owner2: We are Sharma Electronics in Kakinada, and everyone shops here.",
  "8-16|owner1: We stock every brand of washing machine for you.",
  "8-16|owner2: Come to Sharma Electronics today and see for yourself.",
].join("\n");

describe("the configuration — two owners, two photographs, two fixed sides", () => {
  for (const c of CONFIGS) {
    it(`${c.id}: Owner 1 is owner photo 1, the ${c.left} on the LEFT; Owner 2 is owner photo 2, the ${c.right} on the RIGHT`, () => {
      const pack = getCharacterPack(c.id)!;
      expect(pack.label).toBe(c.label);
      expect(pack.usesClientFace).toBe(true);
      expect(isOwnerDuoPack(pack)).toBe(true);
      const slots = ownerPhotoSlots(pack);
      expect(slots).toEqual([
        { index: 0, name: "Owner 1", gender: c.left === "man" ? "male" : "female", kind: c.left, side: "LEFT", photo: "owner photo 1" },
        { index: 1, name: "Owner 2", gender: c.right === "man" ? "male" : "female", kind: c.right, side: "RIGHT", photo: "owner photo 2" },
      ]);
      expect(slots.map(ownerSlotLabel)).toEqual([
        `Owner 1 photo — ${c.left === "man" ? "Man" : "Woman"} · LEFT`,
        `Owner 2 photo — ${c.right === "man" ? "Man" : "Woman"} · RIGHT`,
      ]);
      // Each slot reads its own file — never by position in some list.
      const a = photo("a.jpg"); const b = photo("b.jpg");
      expect(ownerPhotoFile({ ownerImage: a, secondOwnerImage: b }, slots[0])).toBe(a);
      expect(ownerPhotoFile({ ownerImage: a, secondOwnerImage: b }, slots[1])).toBe(b);
      expect(ownerPhotoFile({ ownerImage: a }, slots[1])).toBeNull();
      // Two speakers in speaking order; their labels are roles, never spoken.
      expect(packSpeakers(pack).map((s) => s.key)).toEqual(["owner1", "owner2"]);
      expect(packLocationSubject(pack)).toEqual({ who: "the two owners", plural: true });
    });
  }

  it("leaves the single owner, the human duos and every other entry as they were", () => {
    expect(ownerPhotoSlots(getCharacterPack("owner_face_female"))).toEqual([
      { index: 0, name: "Owner", gender: "female", kind: "woman", side: "CENTRE", photo: "the owner image" },
    ]);
    expect(ownerPhotoSlots(getCharacterPack("owner_face_male"))[0].kind).toBe("man");
    for (const id of ["human_duo_mixed", "human_duo_male", "kids_duo_mixed", "duo_motu_patlu", "normal_female"]) {
      expect(ownerPhotoSlots(getCharacterPack(id)), id).toEqual([]);
      expect(isOwnerDuoPack(getCharacterPack(id)), id).toBe(false);
    }
  });

  it("labels the cast man-first for the mixed owners, and dresses both from one attire choice", () => {
    expect(castLabelFor("owner_duo_mixed")).toBe("👨👩 man & woman");
    expect(castLabelFor("owner_duo_male")).toBe("👨👨 both men");
    expect(castLabelFor("owner_duo_female")).toBe("👩👩 both women");
    expect(castLabelFor("human_duo_mixed")).toBe("👩👨 woman & man"); // unchanged
    expect(attireOptionsFor("owner_duo_mixed", "female" as never)).toEqual(attireOptionsFor("human_duo_mixed", "female" as never));
    const slots = ownerPhotoSlots(getCharacterPack("owner_duo_mixed"));
    const dress = ownerDuoWardrobeDirective("traditional", "", slots);
    expect(dress).toMatch(/^the man on the LEFT wears .+; the woman on the RIGHT wears /);
    expect(dress).toMatch(/never the same colour/);
    expect(dress).toMatch(/the clothes only: both faces, foreheads, hair and any jewellery stay exactly as in their own photographs/);
    expect(dress).not.toMatch(/tasteful traditional jewellery/);
  });
});

describe("the frame — each side is the person in its own photograph", () => {
  for (const c of CONFIGS) {
    it(`${c.id}: stamps the duo face lock and asks for both photos, in order`, () => {
      const slots = ownerPhotoSlots(getCharacterPack(c.id));
      const frame = withOwnerImageDirective(withOwnerDuoFaceLock("A photoreal frame of the two owners.", slots), slots);
      expect(frame.startsWith(`📎 ATTACH OWNER PHOTO 1 (the ${c.left}, LEFT) and OWNER PHOTO 2 (the ${c.right}, RIGHT), in that order`)).toBe(true);
      // The lock is in the BODY — what Copy hands the image tool.
      const body = splitAttachmentDirective(frame).body;
      expect(body).toContain(`${OWNER_FACE_LOCK_HEADING}: the ${c.left} on the LEFT is the person in the attached owner photo 1, exactly, `
        + `and the ${c.right} on the RIGHT is the person in the attached owner photo 2, exactly`);
      expect(body).toMatch(/never blend their faces, never swap them between the sides, and never give both the same face/);
      expect(body).toMatch(/no bindi, tilak, kumkum, sindoor, vibhuti or any mark on the forehead/);
      // Once only.
      expect(withOwnerImageDirective(withOwnerDuoFaceLock(frame, slots), slots)).toBe(frame);
    });
  }

  it("composes a two-shot where they stand — never mid-step", () => {
    const framed = motion.withRealPersonComposition("A frame.", { pair: [{ kind: "man", side: "LEFT" }, { kind: "woman", side: "RIGHT" }] });
    expect(framed).toContain(`${motion.REAL_PERSON_COMPOSITION_HEADING}: the two owners say this clip's lines to the camera in turn`);
    expect(framed).toMatch(/the man standing on the LEFT and the woman on the RIGHT/);
    expect(framed).toMatch(/at the SAME distance from the camera/);
    expect(framed).toMatch(/never mid-step/);
  });

  it("names each owner by photograph in the frame writer's prompt — never by a label the image tool cannot see", () => {
    const pack = getCharacterPack("owner_duo_mixed")!;
    const sys = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, {
      segmentCount: 2, clipSummaries: ["one", "two"], locationMode: "ai_generated", locationPlan: "", aspectRatio: "9:16",
      adType: "commercial", festivalName: "", businessContext: "{}", motionPlan: [],
    } as never);
    expect(sys).toContain("BOTH owners together");
    expect(sys).toMatch(/POSITION LOCK: the man from owner photo 1 ALWAYS stands on the LEFT of the frame and the woman from owner photo 2 ALWAYS on the\s+RIGHT/);
    expect(sys).toContain("↔️ POSITIONS: the man from owner photo 1 on the LEFT of the frame, the woman from owner photo 2 on the RIGHT.");
    expect(sys).toMatch(/the same two owners exactly as in the attached reference\s+frame and their own photographs/);
    expect(sys).toMatch(/the two owners say the clip's lines to the camera in turn/);
    expect(sys).not.toMatch(/Owner 1 on the LEFT|Owner 1 and Owner 2 says|every clip MOVES|🎬 THIS CLIP/);
    expect(sys).toMatch(/THE CLIENT'S TWO REAL OWNERS/);
  });
});

describe("the video prompt — the owner's template, for two", () => {
  const MIXED: [import("@/services/prompts/motion").RealOwnerSeat, import("@/services/prompts/motion").RealOwnerSeat] =
    [{ kind: "man", side: "LEFT" }, { kind: "woman", side: "RIGHT" }];

  it("is exactly the approved words for a man and a woman", () => {
    expect(motion.assembleRealPersonDuoVeoPrompt({
      seats: MIXED, lines: [{ seat: 0, line: "Why is our shop always so full?" }, { seat: 1, line: "  We are Sharma   Electronics. " }],
    })).toBe(
      "Two people stand side by side: the man on the LEFT and the woman on the RIGHT. Both stay in frame, in their places, for the whole clip.\n\n"
      + "With a very sweet voice the man on the LEFT needs to say :-\n\nWhy is our shop always so full?\n\n"
      + "Then, with a very sweet voice the woman on the RIGHT needs to say :-\n\nWe are Sharma Electronics.\n\n"
      + "with appropriate gestures — only the one speaking moves their lips; the other listens and reacts.\n\n"
      + "Negative prompt :-\nNo text on the screen, no third person, the two never swap places or voices",
    );
  });

  it("says two men / two women for a same-gender pair", () => {
    expect(motion.assembleRealPersonDuoVeoPrompt({ seats: [{ kind: "man", side: "LEFT" }, { kind: "man", side: "RIGHT" }], lines: [{ seat: 0, line: "A." }] }))
      .toMatch(/^Two men stand side by side: one on the LEFT and one on the RIGHT\./);
    expect(motion.assembleRealPersonDuoVeoPrompt({ seats: [{ kind: "woman", side: "LEFT" }, { kind: "woman", side: "RIGHT" }], lines: [{ seat: 0, line: "A." }] }))
      .toMatch(/^Two women stand side by side/);
  });

  it("keeps the listener's mouth closed in a clip given to one owner", () => {
    const one = motion.assembleRealPersonDuoVeoPrompt({ seats: MIXED, lines: [{ seat: 1, line: "Come and see us today." }] });
    expect(one).toMatch(/^Two people stand/);
    expect(one).toContain("With a very sweet voice the woman on the RIGHT needs to say :-\n\nCome and see us today.");
    expect(one).toContain("only the woman on the RIGHT speaks; the man on the LEFT keeps his mouth closed, listens and reacts.");
  });

  it("keeps BOTH spoken lines safe through a refine", () => {
    const original = motion.assembleRealPersonDuoVeoPrompt({
      seats: MIXED, lines: [{ seat: 0, line: "Why is our shop always so full?" }, { seat: 1, line: "We are Sharma Electronics." }],
    });
    expect(motion.spokenLinesIn(original)).toEqual(["Why is our shop always so full?", "We are Sharma Electronics."]);
    expect(veoEditProblems(original, original.replace("We are Sharma Electronics.", "We are the best.")).join(" ")).toMatch(/spoken line/);
    expect(veoEditProblems(original, original.replace("Why is our shop always so full?", "Why is it full?")).join(" ")).toMatch(/spoken line/);
  });

  it("voices each line from its speaker's own side — the order of the lines never decides it", () => {
    const pack = getCharacterPack("owner_duo_mixed")!;
    const speech = packVeoSubject(pack).speech([{ name: "Owner 2", text: "We open at nine." }]);
    expect(speech[0].position).toBe("on the RIGHT of the frame");
  });
});

describe("the script — the two owners ARE the business", () => {
  it("writes them as the owners speaking for their own shop, not visitors", () => {
    for (const c of CONFIGS) {
      const sys = CHARACTER_VOICEOVER_SYSTEM_PROMPT(getCharacterPack(c.id)!, 32, 4, "commercial", "", "Telugu", "Kakinada");
      expect(sys, c.id).toMatch(/the business's two real owners stand in their own business and talk about it/);
      expect(sys, c.id).toMatch(/are the TWO REAL OWNERS of this business/);
      expect(sys, c.id).toMatch(/"we", "our shop", "come to us"/);
      expect(sys, c.id).toMatch(/Do you know why our shop is always so full\?/);
      expect(sys, c.id).not.toMatch(/two real people visit a real business/);
      // 2026-10-15: every clip of their worked example totals 17–20 spoken words, both lines together.
      const totals = [...sys.matchAll(/— clip total (\d+) words/g)].map((m) => Number(m[1]));
      expect(totals.length, c.id).toBe(4);
      for (const t of totals) expect(t, c.id).toBeGreaterThanOrEqual(17);
      for (const t of totals) expect(t, c.id).toBeLessThanOrEqual(20);
    }
  });
});

describe("the studio's attach line — what the member attaches with each frame", () => {
  /*
    Found by the browser check (2026-10-15): the attach reader knew only "IMAGE #n", so every owner frame — the
    single owner's too — was shown as "Nothing to attach" / "no photo" while its prompt asked for the face(s).
  */
  const slots = () => ownerPhotoSlots(getCharacterPack("owner_duo_mixed"));

  it("reads both owner photos, in order, from a duo frame — and the one owner image from a single one", async () => {
    const { buildPromptAttachments, ownerPhotosInWords } = await import("@/utils/promptAttachments");
    const duo = withOwnerImageDirective("A frame.", slots());
    const [a] = buildPromptAttachments([duo]);
    expect(a?.photoNumber).toBeNull();
    expect(a?.ownerPhotos).toEqual(["Owner photo 1 — the man, LEFT", "Owner photo 2 — the woman, RIGHT"]);
    expect(ownerPhotosInWords(a!.ownerPhotos)).toBe("owner photo 1, then owner photo 2");

    const [single] = buildPromptAttachments([withOwnerImageDirective("A frame.")]);
    expect(single?.ownerPhotos).toEqual(["Owner image — the client's face photo"]);
    expect(ownerPhotosInWords(single!.ownerPhotos)).toBe("the owner image");

    // On the client's own premises: the store photo AND both owners.
    const onLocation = withOwnerImageDirective("📎 ATTACH STORE/OFFICE IMAGE #2 — the billing counter\n\nA frame.", slots());
    const [both] = buildPromptAttachments([onLocation], [null, "blob:two"], [null, "counter.jpg"]);
    expect(both).toMatchObject({
      photoNumber: 2, url: "blob:two", zone: "the billing counter", // the owners are not part of the zone
      ownerPhotos: ["Owner photo 1 — the man, LEFT", "Owner photo 2 — the woman, RIGHT"],
    });

    // Every other ad: nothing about owners.
    const [store] = buildPromptAttachments(["📎 ATTACH STORE/OFFICE IMAGE #1 — the shopfront\n\nA frame."], ["blob:one"], ["front.jpg"]);
    expect(store?.ownerPhotos).toEqual([]);
  });

  it("shows the banner as 'attach both owner photos, in this order' — never 'Nothing to attach'", async () => {
    const { render, screen, cleanup, configure } = await import("@testing-library/react");
    const React = await import("react");
    const { default: AttachmentBanner } = await import("@/components/ai-platform/AttachmentBanner");
    const { buildPromptAttachments } = await import("@/utils/promptAttachments");
    configure({ testIdAttribute: "data-test" });

    const [duo] = buildPromptAttachments([withOwnerImageDirective("A frame.", slots())]);
    render(React.createElement(AttachmentBanner, { attachment: duo!, isDark: true }));
    const owners = screen.getByTestId("attach-owners").textContent || "";
    expect(owners).toContain("📎 Attach both owner photos, in this order");
    expect(owners).toContain("1. Owner photo 1 — the man, LEFT");
    expect(owners).toContain("2. Owner photo 2 — the woman, RIGHT");
    expect(document.body.textContent).not.toContain("Nothing to attach");
    cleanup();

    const [both] = buildPromptAttachments([withOwnerImageDirective("📎 ATTACH STORE/OFFICE IMAGE #2 — the billing counter\n\nA frame.", slots())]);
    render(React.createElement(AttachmentBanner, { attachment: both!, isDark: false }));
    expect(screen.getByTestId("attach-banner").textContent).toContain("Store/Office Image #2");
    expect(screen.getByTestId("attach-owners").textContent).toContain("1. Owner photo 1 — the man, LEFT");
    cleanup();

    // A generated clip with no owners still says there is nothing to attach.
    const [none] = buildPromptAttachments(["🎨 ATTACH NOTHING — no client photo for this clip.\n\nA frame."]);
    render(React.createElement(AttachmentBanner, { attachment: none!, isDark: false }));
    expect(screen.getByTestId("attach-banner").textContent).toContain("Nothing to attach.");
    expect(screen.queryByTestId("attach-owners")).toBeNull();
    cleanup();
  });
});

describe("the sales side — a clear photo of EACH owner", () => {
  const sale = (specialCategory: string): any => ({
    category: "promotional", packageKey: "30 Seconds + Poster", amount: 999,
    requirement: { specialCategory, attireType: "professional", aspectRatio: "9:16", language: "Telugu" },
  });
  const lead: any = { id: "l1", phone: "+919876543210", displayName: "Ramesh", realName: "Sharma Electronics" };

  it("asks the client for two photos, one per owner — never one group photo — for all three", async () => {
    const { buildClientSaleMessage } = await import("@/utils/salesMessage");
    const who = { owner_duo_male: "both gentlemen", owner_duo_female: "both ladies", owner_duo_mixed: "the gentleman and the lady" } as const;
    for (const c of CONFIGS) {
      const msg = buildClientSaleMessage(lead, sale(c.id));
      expect(msg, c.id).toContain(`*And a clear photo of EACH owner's face* — two photos, one of ${who[c.id]}, each person on their own`);
      expect(msg, c.id).toContain("✨ Both owners speak in every clip");
      expect(msg, c.id).not.toContain("one clear photo of the owner's face");
    }
    // The single owner keeps its own line.
    expect(buildClientSaleMessage(lead, sale("owner_face_male"))).toContain("*And one clear photo of the owner's face*");
    expect(buildClientSaleMessage(lead, sale("human_duo_mixed"))).toContain("✨ Both characters speak in every clip");
  });

  it("tells the tech member who is who in the requirements message — the Human Duo's line unchanged", async () => {
    const { buildAssignmentRequirementsMessage } = await import("@/utils/adRequirement");
    const job = (characterPack: string) => buildAssignmentRequirementsMessage({
      category: "promotional", duration: "32 Seconds", clipCount: 4, characterPack, attireType: "professional", aspectRatio: "9:16", language: "Telugu",
    });
    expect(job("owner_duo_mixed")).toContain(
      "💬 Both owners speak in every clip — Owner 1 = the man (LEFT), Owner 2 = the woman (RIGHT); upload one clear photo of EACH owner");
    expect(job("owner_duo_female")).toContain("Owner 1 = the woman (LEFT), Owner 2 = the woman (RIGHT)");
    expect(job("human_duo_mixed")).toContain("💬 Both characters speak in every clip");
    expect(job("human_duo_mixed")).not.toContain("Both owners");
  });

  it("shows the job's Special Category note for each owner by side", async () => {
    const { render, screen, cleanup, configure } = await import("@testing-library/react");
    const React = await import("react");
    const { default: SpecialCategoryFields } = await import("@/components/work/SpecialCategoryFields");
    configure({ testIdAttribute: "data-test" });
    render(React.createElement(SpecialCategoryFields as any, { characterPack: "owner_duo_mixed", realLocationProvided: false, onChange: () => {} }));
    const note = screen.getByTestId("job-owner-duo-note").textContent || "";
    expect(note).toMatch(/Both owners’ photos are required — one clear, front-facing photo of EACH owner/);
    expect(note).toContain("Owner 1 = the man on the LEFT · Owner 2 = the woman on the RIGHT");
    expect(document.body.textContent).toContain("Both owners speak in every clip.");
    expect(document.body.textContent).not.toContain("Both characters speak");
    cleanup();
  });
});

describe("a full Real Owner Duo run (the real pipeline, a fake Gemini) — all three", () => {
  for (const c of CONFIGS) {
    it(`${c.id}: both photos to the frame writer, the duo lock on every frame, the two-person template on every clip`, async () => {
      dialogue = TWO_CLIPS;
      const out = await gemini.generateAdAssets(form({ characterPack: c.id }), files(), () => {}, {});

      // The script: both owners, in order, in every clip.
      expect(out.voiceOverScript).toMatch(/\[Owner 1\]: Why is our shop always so full\?/);
      expect(out.voiceOverScript).toMatch(/\[Owner 2\]: Come to Sharma Electronics today and see for yourself\./);
      expect(out.spec?.characterPack).toBe(c.id);

      // The frame writer SAW both photographs, each tied to one side.
      const frameCall = calls.find((x) => /Generate \d+ Main Frame image prompts/.test(x.user))!;
      expect(frameCall.images).toBe(2);
      expect(frameCall.user).toContain(`This is OWNER PHOTO 1 — a photograph of Owner 1, the ${c.left} who stands on the LEFT of the frame in EVERY clip.`);
      expect(frameCall.user).toContain(`This is OWNER PHOTO 2 — a photograph of Owner 2, the ${c.right} who stands on the RIGHT of the frame in EVERY clip.`);
      expect(frameCall.user.indexOf("OWNER PHOTO 1")).toBeLessThan(frameCall.user.indexOf("OWNER PHOTO 2"));
      expect(frameCall.user).toContain(`• Owner photos: 2 attached, one per owner — owner photo 1 is the ${c.left} who stands on the LEFT; owner photo 2 is the ${c.right} who stands on the RIGHT`);
      expect(frameCall.sys).toMatch(/stages TWO REAL PEOPLE — the business's own two owners/);
      expect(frameCall.sys).toMatch(/WARDROBE \(as ordered[^\n]*the (?:man|woman) on the LEFT wears .+; the (?:man|woman) on the RIGHT wears/);

      // Every frame: composed in place for two, the duo lock in the body, both photos asked for in order.
      expect(out.mainFramePrompts).toHaveLength(2);
      for (const frame of out.mainFramePrompts) {
        expect(frame.startsWith(`📎 ATTACH OWNER PHOTO 1 (the ${c.left}, LEFT) and OWNER PHOTO 2 (the ${c.right}, RIGHT), in that order`)).toBe(true);
        const body = splitAttachmentDirective(frame).body;
        expect(body).toContain(`${OWNER_FACE_LOCK_HEADING}: the ${c.left} on the LEFT is the person in the attached owner photo 1`);
        expect(body).toContain(`${motion.REAL_PERSON_COMPOSITION_HEADING}: the two owners say this clip's lines to the camera in turn`);
        expect(body).toContain(`the ${c.left} standing on the LEFT and the ${c.right} on the RIGHT`);
        expect(body).not.toContain(motion.MOTION_COMPOSITION_HEADING);
        expect(body).not.toMatch(/the woman is the person in the attached owner image|the man is the person in the attached owner image/);
      }

      // Every video prompt: the owner's template, each line in its own owner's mouth, by side.
      expect(out.veoPrompts).toHaveLength(2);
      out.veoPrompts.forEach((prompt, i) => {
        expect(prompt).toContain(`With a very sweet voice the ${c.left} on the LEFT needs to say :-`);
        expect(prompt).toContain(`Then, with a very sweet voice the ${c.right} on the RIGHT needs to say :-`);
        expect(motion.spokenLinesIn(prompt)).toEqual(i === 0
          ? ["Why is our shop always so full?", "We are Sharma Electronics in Kakinada, and everyone shops here."]
          : ["We stock every brand of washing machine for you.", "Come to Sharma Electronics today and see for yourself."]);
        expect(prompt.endsWith("Negative prompt :-\nNo text on the screen, no third person, the two never swap places or voices")).toBe(true);
      });
      // No director call: nothing about camera moves or walking reaches a real person's video.
      expect(calls.some((x) => /Direct these \d+ clips?/.test(x.user))).toBe(false);
    });
  }

  it("refuses a run missing either photo — before a single call — and names the one to add", async () => {
    await expect(gemini.generateAdAssets(form({ characterPack: "owner_duo_mixed" }), files({ secondOwnerImage: null }), () => {}, {}))
      .rejects.toThrow(/Upload Owner 2's photo \(the woman who stands on the RIGHT\), then press Generate again/);
    await expect(gemini.generateAdAssets(form({ characterPack: "owner_duo_male" }), files({ ownerImage: null }), () => {}, {}))
      .rejects.toThrow(/Upload Owner 1's photo \(the man who stands on the LEFT\)/);
    await expect(gemini.generateAdAssets(form({ characterPack: "owner_duo_female" }), files({ ownerImage: null, secondOwnerImage: null }), () => {}, {}))
      .rejects.toThrow(/Upload Owner 1's photo \(the woman who stands on the LEFT\) and Owner 2's photo \(the woman who stands on the RIGHT\)/);
    expect(calls).toHaveLength(0);
  });

  it("voices a clip a member's own script gave to one owner from that owner's side", async () => {
    const customScript = [
      "clip-1[0-8sec]:", "[Owner 1]: Why is our shop always so full?", "[Owner 2]: We are Sharma Electronics in Kakinada.",
      "clip-2[8-16sec]:", "[Owner 2]: Come to Sharma Electronics today and see for yourself.",
    ].join("\n");
    const out = await gemini.generateAdAssets(form({ characterPack: "owner_duo_mixed" }), files(), () => {}, { customScript });
    expect(out.veoPrompts[1]).toContain("With a very sweet voice the woman on the RIGHT needs to say :-\n\nCome to Sharma Electronics today and see for yourself.");
    expect(out.veoPrompts[1]).toContain("only the woman on the RIGHT speaks; the man on the LEFT keeps his mouth closed");
    expect(out.veoPrompts[1]).not.toMatch(/the man on the LEFT needs to say/);
  });

  it("re-stamps the duo lock and the two-photo line on a main-frame refine", async () => {
    const refined = await gemini.refineSection("mainFrame", "A frame.\n###CLIP###\nAnother frame.", "warmer light",
      form({ characterPack: "owner_duo_mixed" }), {});
    const parts = refined.split(/\s*###\s*CLIP\s*###\s*/i).filter((p) => p.trim());
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part).toMatch(/^📎 ATTACH OWNER PHOTO 1 \(the man, LEFT\) and OWNER PHOTO 2 \(the woman, RIGHT\), in that order/);
      expect(part).toContain(`${OWNER_FACE_LOCK_HEADING}: the man on the LEFT is the person in the attached owner photo 1`);
    }
  });

  it("tells the member to attach both photos, in order, in every tab", () => {
    const owner = buildMissionTasks({
      mode: "video", clipCount: 4, aspectRatio: "9:16", hasLogo: true, nameBoard: false, onLocation: false, locationPhotos: 0,
      castLabel: "Real Owner Duo (Male + Female)", ownerFace: true,
      ownerPhotos: ["Owner 1 photo — Man · LEFT", "Owner 2 photo — Woman · RIGHT"],
    }).find((t) => t.id === "owner")!;
    expect(owner.title).toBe("Attach BOTH owner photos in every tab");
    expect(owner.detail).toContain("1: Owner 1 photo — Man · LEFT, then 2: Owner 2 photo — Woman · RIGHT");
    // The single owner keeps its own guide.
    const single = buildMissionTasks({
      mode: "video", clipCount: 1, aspectRatio: "9:16", hasLogo: true, nameBoard: false, onLocation: false, locationPhotos: 0,
      castLabel: "Real Owner Face (Male)", ownerFace: true,
    }).find((t) => t.id === "owner")!;
    expect(single.title).toBe("Attach the OWNER IMAGE in the tab");
  });
});
