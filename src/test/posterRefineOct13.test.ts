import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  MAX_CHANGES_WORDS, POSTER_PROMPT_CLOSE, cleanPosterChanges, conceptPosterPrompt, isConceptPosterPrompt, parsePosterRefineAnswer,
  posterPromptProblems, printedPosterContacts, readConceptPosterPrompt, refineConceptPoster, refinedPosterContacts,
  refinedTextLanguage, usablePosterRefine, type PosterRefineAnswer,
} from "@/utils/posterAdType";
import { contactNumberProblems, contactNumbersOf, digitsOf, phoneKey } from "@/utils/businessFacts";

/**
 * The poster refine, rebuilt on the owner's report (2026-10-13): "poster refine prompt is not working".
 *
 * A refine could change only the ad type and the business summary — which may not describe a picture — and
 * code put everything else back (the verified numbers and address, the language from the form). So a design
 * request ("red and gold colours", a headline, a bigger logo), "leave out the address" (the Refine box's own
 * example) and "words in Telugu" came back as the same prompt. The owner's answers: design requests go in ONE
 * "Changes:" line between the three sentences and the Format line; a refine may leave out or bring back a
 * verified number or the address, never add one. And the member is told when nothing, or not all, was applied.
 */

const FORMAT = "9:16 vertical poster. Use the attached logo exactly as given. Words on the poster in English.";
const TWO_NUMBERS = "Print only the two contact numbers given above, each once, digit for digit.";
const ADDRESS = "Main Road, Kakinada";
const verified = [{ display: "9160345678" }, { display: "98480 12345", whatsapp: true }];
const BI_ALL = `Sai Mobiles — every smartphone brand. Contact: 9160345678, 98480 12345 (WhatsApp). Address: ${ADDRESS}`;
const answer = (over: Partial<PosterRefineAnswer> = {}): PosterRefineAnswer => ({
  adType: null, reason: "", benefit: "", businessInformation: "", changes: null, numbers: null, address: null,
  textLanguage: "", notApplied: "", ...over,
});
const withKeys = (list: { display: string }[]) => list.map((p) => ({ display: p.display, key: phoneKey(digitsOf(p.display)) }));

describe("the Changes line in the prompt", () => {
  it("sits between the owner's three sentences and the Format line, and reads back", () => {
    const p = conceptPosterPrompt({
      adTypeName: "Shadow Metaphor Ads", businessInformation: "Sri Sai Academy — EAMCET coaching", format: FORMAT,
      changes: 'Use red and gold colours. Add the headline "Admissions Open 2026"',
    });
    expect(p).toBe(`Create a minimalist and creative ad in Shadow Metaphor Ads. Business Information: Sri Sai Academy — EAMCET coaching. ${POSTER_PROMPT_CLOSE}\n\nChanges: Use red and gold colours. Add the headline "Admissions Open 2026".\n\nFormat: ${FORMAT}`);
    expect(posterPromptProblems(p)).toEqual([]);
    // 2026-10-22: the parts also carry the Festival line — "" for a poster that is not for a festival.
    expect(readConceptPosterPrompt(p)).toEqual({
      adTypeId: "shadow_metaphor", adTypeName: "Shadow Metaphor Ads", businessInformation: "Sri Sai Academy — EAMCET coaching",
      festival: "", changes: 'Use red and gold colours. Add the headline "Admissions Open 2026"', format: FORMAT,
    });
  });

  it("a poster nobody refined is exactly as before — no Changes line", () => {
    const p = conceptPosterPrompt({ adTypeName: "Shadow Metaphor Ads", businessInformation: "Sri Sai Academy", format: FORMAT, changes: "" });
    expect(p).toBe(`Create a minimalist and creative ad in Shadow Metaphor Ads. Business Information: Sri Sai Academy. ${POSTER_PROMPT_CLOSE}\n\nFormat: ${FORMAT}`);
    expect(readConceptPosterPrompt(p)?.changes).toBe("");
  });
});

describe("cleanPosterChanges", () => {
  it("takes out every phone number (verified or not), email, website and ad-type name — prices, years and quotes stay", () => {
    const t = cleanPosterChanges(
      'Changes: Use red and gold colours. Add "20% off this Diwali 2026". Show the WhatsApp number 98480 12345 in a green pill. Email sai@x.com, www.sai.in. In a Shadow Metaphor Ads style',
      { hasLogo: true },
    );
    expect(t).not.toMatch(/98480|12345|sai@|www\.|Shadow|^Changes/);
    expect(t).toMatch(/^Use red and gold colours\. Add "20% off this Diwali 2026"/);
  });

  it("starts with a capital, as the instruction it is", () => {
    expect(cleanPosterChanges("deep blue background with a glowing phone", { hasLogo: true })).toBe("Deep blue background with a glowing phone");
  });

  it("makes a list into sentences and caps the line", () => {
    expect(cleanPosterChanges("- Use red\n- Add a diya beside the product\n- Larger logo", { hasLogo: true }))
      .toBe("Use red. Add a diya beside the product. Larger logo");
    const long = cleanPosterChanges(Array(80).fill("gold").join(" "), { hasLogo: true });
    expect(long.split(/\s+/).length).toBeLessThanOrEqual(MAX_CHANGES_WORDS);
  });

  it("without a logo file never names a logo — the business name is the wordmark", () => {
    const t = cleanPosterChanges("Make the logo bigger and place our brand logo top left", { hasLogo: false });
    expect(t).toBe("Make the business name bigger and place the business name top left");
    expect(t).not.toMatch(/logo/i);
  });
});

describe("the contact details on a refine", () => {
  const base = { verified, address: ADDRESS, currentBusinessInformation: BI_ALL };

  it("reads what the prompt prints now — everything when the prompt is an older one", () => {
    expect(printedPosterContacts({ ...base, currentBusinessInformation: "Sai Mobiles. Contact: 98480 12345 (WhatsApp)" }))
      .toEqual({ phones: [{ display: "98480 12345", whatsapp: true }], address: "" });
    expect(printedPosterContacts({ ...base, currentBusinessInformation: null }).phones).toHaveLength(2);
  });

  it("a request that is not about them keeps them, whatever the model answers", () => {
    const r = refinedPosterContacts({ ...base, answer: { numbers: [], address: false }, instruction: "use warmer colours" });
    expect(r.phones).toHaveLength(2);
    expect(r.address).toBe(ADDRESS);
  });

  it("leaves out the address, one number or every number when asked", () => {
    expect(refinedPosterContacts({ ...base, answer: { numbers: null, address: false }, instruction: "leave out the address" }).address).toBe("");
    expect(refinedPosterContacts({ ...base, answer: { numbers: ["9160345678"], address: null }, instruction: "remove the WhatsApp number" }).phones)
      .toEqual([{ display: "9160345678", whatsapp: false }]);
    expect(refinedPosterContacts({ ...base, answer: { numbers: [], address: null }, instruction: "no phone numbers on the poster" }).phones).toEqual([]);
  });

  it("brings one back from the verified list — never adds one the business did not give", () => {
    const back = refinedPosterContacts({
      ...base, currentBusinessInformation: "Sai Mobiles", answer: { numbers: ["+91 91603 45678", "9848012345", "94401 23456"], address: true },
      instruction: "put the phone numbers and the address back, and add 94401 23456",
    });
    expect(back.phones.map((p) => p.display)).toEqual(["9160345678", "98480 12345"]);
    expect(back.address).toBe(ADDRESS);
    expect(back.notes.join(" ")).toMatch(/94401 23456 is not one of this business's verified numbers.*BUSINESS CONTENT/);
    const noAddress = refinedPosterContacts({ ...base, address: "", answer: { numbers: null, address: true }, instruction: "add the address" });
    expect(noAddress.address).toBe("");
    expect(noAddress.notes.join(" ")).toMatch(/no verified address/);
  });
});

describe("the language of the words", () => {
  it("changes only when the request asks, and a later refine keeps it", () => {
    expect(refinedTextLanguage({ currentFormat: FORMAT, asked: "Telugu", instruction: "make the words Telugu", fallback: "English" })).toBe("Telugu");
    expect(refinedTextLanguage({ currentFormat: FORMAT, asked: "Telugu", instruction: "use warmer colours", fallback: "English" })).toBe("English");
    expect(refinedTextLanguage({ currentFormat: "9:16 vertical poster. Words on the poster in Telugu.", asked: "", instruction: "red colours", fallback: "English" })).toBe("Telugu");
    expect(refinedTextLanguage({ currentFormat: FORMAT, asked: "Telugu", instruction: "తెలుగులో రాయండి", fallback: "English" })).toBe("Telugu");
    expect(refinedTextLanguage({ currentFormat: null, asked: "", instruction: "x", fallback: "Hindi" })).toBe("Hindi");
  });
});

describe("the refine's answer", () => {
  it("reads every field; a field left out means 'as now'", () => {
    const a = parsePosterRefineAnswer('```json\n{"adType":"shadow_metaphor","changes":"Use red","numbers":[9160345678],"address":"no","textLanguage":"Telugu","notApplied":"Size is set on the form."}\n```');
    expect(a).toMatchObject({ adType: "shadow_metaphor", changes: "Use red", numbers: ["9160345678"], address: false, textLanguage: "Telugu", notApplied: "Size is set on the form." });
    expect(parsePosterRefineAnswer('{"businessInformation":"x"}')).toMatchObject({ changes: null, numbers: null, address: null, textLanguage: "" });
    expect(usablePosterRefine(parsePosterRefineAnswer("{}"))).toBe(false);
    expect(usablePosterRefine(parsePosterRefineAnswer('{"changes":""}'))).toBe(true);
    expect(parsePosterRefineAnswer("no json")).toBeNull();
  });
});

describe("refineConceptPoster", () => {
  const current = readConceptPosterPrompt(conceptPosterPrompt({
    adTypeName: "Animal-based Visual Metaphor Ads", businessInformation: BI_ALL, format: `${FORMAT} ${TWO_NUMBERS}`,
  }));
  const run = (a: PosterRefineAnswer, instruction: string, cur = current) => refineConceptPoster({
    answer: a, instruction, current: cur, currentTypeId: "animal_metaphor", verifiedPhones: verified, verifiedAddress: ADDRESS,
    businessName: "Sai Mobiles", hasLogo: true, textLanguage: "English",
  });

  it("keeps the three sentences, adds the Changes line and leaves the address out — each number once", () => {
    const { poster, notApplied } = run(answer({ changes: "Use red and gold colours", address: false, notApplied: "None" }), "use red and gold colours and leave out the address");
    expect(poster.prompt).toBe(`Create a minimalist and creative ad in Animal-based Visual Metaphor Ads. Business Information: Sai Mobiles — every smartphone brand. Contact: 9160345678, 98480 12345 (WhatsApp). ${POSTER_PROMPT_CLOSE}\n\nChanges: Use red and gold colours.\n\nFormat: ${FORMAT} ${TWO_NUMBERS}`);
    expect(isConceptPosterPrompt(poster.prompt)).toBe(true);
    expect(contactNumberProblems(poster.prompt, withKeys(verified))).toEqual([]);
    expect(poster).toMatchObject({ adType: "animal_metaphor", chosenBy: "kept", changes: "Use red and gold colours" });
    expect(notApplied).toEqual([]);
  });

  it("a left-out number is left out of the Contact line AND the Format line's count", () => {
    const { poster } = run(answer({ numbers: ["98480 12345"] }), "remove the first phone number");
    expect(poster.businessInformation).toContain("Contact: 98480 12345 (WhatsApp)");
    expect(poster.businessInformation).not.toContain("9160345678");
    expect(poster.format).toMatch(/Print only the one contact number given above/);
    const none = run(answer({ numbers: [] }), "no phone numbers").poster;
    expect(none.prompt).not.toContain("Contact:");
    expect(none.format).toMatch(/No phone number on the poster\.$/);
  });

  it("a Changes line left out of the answer stays; an empty one clears it", () => {
    const refined = readConceptPosterPrompt(run(answer({ changes: "Use red and gold colours" }), "use red and gold").poster.prompt);
    expect(run(answer({ businessInformation: "Sai Mobiles — phones and repairs" }), "mention repairs", refined).poster.changes).toBe("Use red and gold colours");
    expect(run(answer({ changes: "" }), "remove the colour change", refined).poster.prompt).not.toContain("Changes:");
  });

  it("drops a Changes sentence that only repeats the Format line (seen live) — a Telugu headline stays", () => {
    const noLogo = refineConceptPoster({
      answer: answer({ changes: 'Use red and gold colours. Print the headline "Diwali Dhamaka Offer". Show the business name "Sri Sai Mobiles" as a clean wordmark. Print "దీపావళి ఆఫర్"' }),
      instruction: "red and gold, headline", current: null, verifiedPhones: verified, verifiedAddress: ADDRESS,
      businessName: "Sri Sai Mobiles", nameBoardText: "Sri Sai Mobiles", hasLogo: false, textLanguage: "English",
    }).poster;
    expect(noLogo.changes).toBe('Use red and gold colours. Print the headline "Diwali Dhamaka Offer". Print "దీపావళి ఆఫర్"');
    expect(noLogo.format).toContain('Show the business name "Sri Sai Mobiles" as a clean wordmark');
  });

  it("one note per problem: the app's exact contact note replaces the model's repeat of it", () => {
    const { notApplied } = run(answer({ numbers: ["9160345678", "98480 12345"], notApplied: "The number could not be added as it is not in the verified contact list." }), "add 94401 23456 as another contact number");
    expect(notApplied).toHaveLength(1);
    expect(notApplied[0]).toMatch(/^94401 23456 is not one of this business's verified numbers/);
  });

  it("a note alone is an answer: the prompt stays and the member is told why (the browser check)", () => {
    const only = parsePosterRefineAnswer('{"notApplied":"The size comes from the Poster Size setting — change it there."}');
    expect(usablePosterRefine(only)).toBe(true);
    const { poster, notApplied } = run(only!, "make it square");
    expect(poster.prompt).toBe(conceptPosterPrompt({ adTypeName: "Animal-based Visual Metaphor Ads", businessInformation: BI_ALL, format: `${FORMAT} ${TWO_NUMBERS}` }));
    expect(notApplied).toEqual(["The size comes from the Poster Size setting — change it there."]);
  });

  it("keeps the card's reason and main benefit when the answer leaves them out", () => {
    const keep = (a: PosterRefineAnswer) => refineConceptPoster({
      answer: a, instruction: "use red", current, currentTypeId: "animal_metaphor", currentReason: "Tough as a rhino.",
      currentBenefit: "Phones that last", verifiedPhones: verified, verifiedAddress: ADDRESS, businessName: "Sai Mobiles",
      hasLogo: true, textLanguage: "English",
    }).poster;
    expect(keep(answer({ changes: "Use red" }))).toMatchObject({ reason: "Tough as a rhino.", benefit: "Phones that last", chosenBy: "kept" });
    expect(keep(answer({ adType: "animal_metaphor", changes: "Use red" }))).toMatchObject({ reason: "Tough as a rhino.", chosenBy: "kept" });
    expect(keep(answer({ adType: "animal_metaphor", reason: "A rhino-tough phone.", benefit: "Lasts years" })))
      .toMatchObject({ reason: "A rhino-tough phone.", benefit: "Lasts years", chosenBy: "analysis" });
  });

  it("tells the member what the model could not apply", () => {
    const { poster, notApplied } = run(answer({ changes: "", notApplied: "The size comes from the Poster Size setting — change it there" }), "make it square");
    expect(notApplied).toEqual(["The size comes from the Poster Size setting — change it there."]);
    expect(poster.prompt).toBe(conceptPosterPrompt({ adTypeName: "Animal-based Visual Metaphor Ads", businessInformation: BI_ALL, format: `${FORMAT} ${TWO_NUMBERS}` }));
  });
});

// ── end to end, on a fake Gemini ───────────────────────────────────────────────────────────────

type Call = { sys: string; user: string };
const calls: Call[] = [];
let analysisReply = "{}";
let refineReply = "{}";

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (req: any) => {
        const sys = String(req.config?.systemInstruction || "");
        const user = (req.contents?.[0]?.parts || []).map((p: any) => p.text || "").join("\n");
        calls.push({ sys, user });
        if (/extract the following business information/i.test(sys)) {
          return { text: JSON.stringify({ businessName: "Sai Mobiles", businessType: "mobile phone store", services: "smartphones, accessories" }) };
        }
        if (/senior creative strategist/.test(sys)) return { text: analysisReply };
        if (/The team\s+wants a change/.test(sys)) return { text: refineReply };
        return { text: "{}" };
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
beforeEach(() => {
  calls.length = 0;
  analysisReply = JSON.stringify({ adType: "animal_metaphor", reason: "Tough as a rhino.", benefit: "Phones that last", businessInformation: "Sai Mobiles — every smartphone brand and same-day screen repair" });
  refineReply = "{}";
});

const logo = () => new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
const files = (withLogo = true): any => ({ logo: withLogo ? logo() : null, visitingCard: [], storeImage: [], productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: [] });
const form = (over: Record<string, unknown> = {}): any => ({
  adType: "commercial", festivalName: "", attireType: "traditional", gender: "female", duration: 16, durationMode: "preset",
  textInstructions: "Sai Mobiles, Kakinada. Every smartphone brand, same-day screen repair.\nCall: 9160345678\nWhatsApp: 98480 12345\nAddress: Main Road, Kakinada",
  aspectRatio: "9:16", language: "Telugu", posterStyle: "auto", posterTextLanguage: "English", ...over,
});
const refineCalls = () => calls.filter((c) => /The team\s+wants a change/.test(c.sys));

describe("Poster Creation's refine, end to end", () => {
  it("applies a design request, then 'leave out the address', then Telugu words — each kept by the next", async () => {
    const out = await gemini.generatePosterConcepts(form(), files(), () => {});
    const profile = out.businessInfo;
    expect(contactNumbersOf(profile).map((p) => p.display)).toEqual(["9160345678", "98480 12345"]);
    const [first] = out.posterConcepts!;
    expect(first.imagePrompt).toContain(`Address: ${ADDRESS}`);
    expect(first.imagePrompt).not.toContain("Changes:");

    // 1. A design request — before 2026-10-13 it came back as the same prompt.
    refineReply = JSON.stringify({ adType: "animal_metaphor", changes: 'Use red and gold colours. Add the headline "Diwali Offer"', textLanguage: "", notApplied: "" });
    const one = await gemini.refinePosterConcept(first, 'use red and gold colours and add the headline "Diwali Offer"', form(), profile, true);
    expect(one.notApplied).toEqual([]);
    expect(one.concept.imagePrompt).not.toBe(first.imagePrompt);
    expect(one.concept.imagePrompt).toContain(`${POSTER_PROMPT_CLOSE}\n\nChanges: Use red and gold colours. Add the headline "Diwali Offer".\n\nFormat: `);
    expect(one.concept.imagePrompt.startsWith("Create a minimalist and creative ad in Animal-based Visual Metaphor Ads. Business Information: Sai Mobiles — every smartphone brand and same-day screen repair.")).toBe(true);
    expect(isConceptPosterPrompt(one.concept.imagePrompt)).toBe(true);
    expect(one.concept.changes).toBe('Use red and gold colours. Add the headline "Diwali Offer"');

    // 2. The Refine box's own example — the address used to be put straight back.
    refineReply = JSON.stringify({ address: false });
    const two = await gemini.refinePosterConcept(one.concept, "leave out the address", form(), profile, true);
    expect(two.concept.imagePrompt).not.toContain("Address:");
    expect(two.concept.imagePrompt).toContain("Changes: Use red and gold colours.");
    expect(refineCalls().at(-1)!.user).toContain('ITS CHANGES LINE NOW: Use red and gold colours. Add the headline "Diwali Offer"');
    expect(refineCalls().at(-1)!.user).toContain(`Address: ${ADDRESS} — printed now`);

    // 3. The words in Telugu — the Format line said the form's language whatever was asked.
    refineReply = JSON.stringify({ textLanguage: "Telugu" });
    const three = await gemini.refinePosterConcept(two.concept, "make the words on the poster Telugu", form(), profile, true);
    expect(three.concept.format).toMatch(/Words on the poster in Telugu\./);
    expect(three.concept.imagePrompt).not.toContain("Address:");
    expect(three.concept.imagePrompt).toContain("Changes: Use red and gold colours.");
    expect(refineCalls().at(-1)!.user).toContain(`Address: ${ADDRESS} — left out`);
    expect(contactNumberProblems(three.concept.imagePrompt, contactNumbersOf(profile))).toEqual([]);
  });

  it("a kit reopened from Saved (no logo file in the form) keeps 'Use the attached logo'; 'No logo' still wins", async () => {
    const out = await gemini.generatePosterConcepts(form(), files(), () => {});
    refineReply = JSON.stringify({ changes: "Make the logo larger" });
    const reopened = await gemini.refinePosterConcept(out.posterConcepts![0], "make the logo larger", form(), out.businessInfo, false);
    expect(reopened.concept.format).toContain("Use the attached logo exactly as given.");
    expect(reopened.concept.changes).toBe("Make the logo larger");
    const ticked = await gemini.refinePosterConcept(out.posterConcepts![0], "make the logo larger", form({ noLogo: true, logoNameText: "Sai Mobiles" }), out.businessInfo, false);
    expect(ticked.concept.imagePrompt).not.toMatch(/logo/i);
    expect(ticked.concept.changes).toBe("Make the business name larger");
  });

  it("a colour request cannot drop a number, and an empty answer leaves the prompt unchanged", async () => {
    const out = await gemini.generatePosterConcepts(form(), files(), () => {});
    refineReply = JSON.stringify({ changes: "Warmer colours", numbers: [], address: false });
    const warm = await gemini.refinePosterConcept(out.posterConcepts![0], "warmer colours", form(), out.businessInfo, true);
    expect(contactNumberProblems(warm.concept.imagePrompt, contactNumbersOf(out.businessInfo))).toEqual([]);
    expect(warm.concept.imagePrompt).toContain(`Address: ${ADDRESS}`);
    refineReply = "{}";
    await expect(gemini.refinePosterConcept(out.posterConcepts![0], "anything", form(), out.businessInfo, true)).rejects.toThrow(/unchanged/);
  });
});

describe("the video kit's poster row refine", () => {
  it("applies the design request and says what it could not apply; refineSection gives the same text", async () => {
    const profile = (await gemini.generatePosterConcepts(form(), files(), () => {})).businessInfo;
    const current = await gemini.writeVideoPosterPrompt(form(), profile, { hasLogoFile: true });
    refineReply = JSON.stringify({ changes: "Use a deep blue background", notApplied: "The video kit's poster is always 9:16 vertical." });
    const r = await gemini.refineVideoPoster(current, "deep blue background and make it square", form(), profile);
    expect(r.prompt).toContain("Changes: Use a deep blue background.");
    expect(r.prompt).toContain("Format: 9:16 vertical poster. Use the attached logo exactly as given.");
    expect(r.notApplied).toEqual(["The video kit's poster is always 9:16 vertical."]);
    expect(isConceptPosterPrompt(r.prompt)).toBe(true);
    expect(await gemini.refineSection("poster", current, "deep blue background and make it square", form(), profile)).toBe(r.prompt);
  });
});
