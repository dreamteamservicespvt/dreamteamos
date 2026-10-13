import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  MAX_CONTACT_NUMBERS, contactNumberProblems, contactNumbersOf, factsFromProfile, findPhoneNumbers, sanitizeBusinessProfile,
  stripUnverifiedNumbers, verifyBusinessFacts, type PhoneFact,
} from "@/utils/businessFacts";
import { posterFormatLine, posterPhoneRule, uniquePosterContacts } from "@/utils/posterAdType";
import { LOWER_THIRD_SYSTEM_PROMPT, labelContactLines, withLabelContacts } from "@/services/prompts/lowerThird";
import { VOICE_NOTE_SYSTEM_PROMPT } from "@/services/prompts/voiceNote";
import type { AdFormData, FileStore } from "@/types/aiPlatform";

/**
 * Contact numbers on the poster and the footer (the Video Bottom Label) — the owner, 2026-10-13: "Only use
 * contact numbers explicitly present in the provided business information … 1 unique number, exactly that 1;
 * 2, exactly those 2; 3, exactly those 3. Never duplicate a number or create extra numbers … the exact same
 * validated contact-number list used by Poster generation, Footer generation, and every related prompt."
 *
 * Pinned here, for 0, 1, 2 and 3 numbers, duplicates written many ways, a fourth number and every kind of
 * number that is not a phone number: the one list (`contactNumbersOf`), and every deliverable that prints it —
 * the label, the video kit's poster, Poster Creation end to end, the label's refine, the overlays and the
 * frames — on a fake Gemini that keeps trying to add, repeat and drop numbers. `contactNumberProblems` is the
 * check: every number of the list exactly once, and no other.
 */

// ── the scenarios ──────────────────────────────────────────────────────────────────────────────

interface Scenario {
  name: string;
  /** BUSINESS CONTENT, as the member typed it. */
  typed: string;
  /** What the extraction model says it read (it invents and repeats on purpose). */
  profile?: Record<string, unknown>;
  /** A visiting card / flyer / premises photo is attached. */
  card?: boolean;
  /** THE list, as printed: display, and "(WhatsApp)" where it is one. */
  expected: string[];
}

const SCENARIOS: Scenario[] = [
  { name: "0 numbers", typed: "Sri Sai Sweets, Main Road, Kakinada. Fresh sweets daily since 1998.", expected: [] },
  {
    name: "0 numbers — the model invents some",
    typed: "Sri Sai Sweets, Main Road, Kakinada. Fresh sweets daily.",
    profile: { contact: { phone: "+91 98765 43210", whatsapp: "9000011111", landline: "Not provided" } },
    expected: [],
  },
  { name: "1 number", typed: "Sri Sai Sweets. Call 98480 12345.", expected: ["98480 12345"] },
  { name: "1 number, called and WhatsApp", typed: "Call: 98480 12345, WhatsApp: 98480 12345", expected: ["98480 12345 (WhatsApp)"] },
  { name: "2 numbers", typed: "Call: 98480 12345, WhatsApp: 91603 45678", expected: ["98480 12345", "91603 45678 (WhatsApp)"] },
  { name: "2 numbers, WhatsApp first", typed: "WhatsApp: 91603 45678, Call: 98480 12345", expected: ["91603 45678 (WhatsApp)", "98480 12345"] },
  { name: "2 numbers, (WhatsApp) written after", typed: "Call 98480 12345 (WhatsApp), 91603 45678", expected: ["98480 12345 (WhatsApp)", "91603 45678"] },
  { name: "3 numbers", typed: "Ph: 0884-2345678, Cell: 98480 12345 / 91603 45678", expected: ["0884-2345678", "98480 12345", "91603 45678"] },
  { name: "1 number written three ways", typed: "Call 98480 12345 / +91 98480 12345 / 9848012345", expected: ["98480 12345"] },
  {
    name: "2 numbers, each written twice",
    typed: "Call: 98480 12345, WhatsApp: 98480 12345, Office: 91603 45678, 91603-45678",
    expected: ["98480 12345 (WhatsApp)", "91603 45678"],
  },
  {
    name: "3 numbers among six copies",
    typed: "9848012345, 9160345678, 9848012345, 0884-2345678, 9160345678, +91 98480 12345",
    expected: ["9848012345", "9160345678", "0884-2345678"],
  },
  {
    name: "3 numbers, the model repeats them in another spelling",
    typed: "Call 98480 12345, 91603 45678 or 0884 2345678",
    profile: { phone: "+91-98480-12345", mobile: ["9160345678", "919160345678"], landline: "08842345678" },
    card: true,
    expected: ["98480 12345", "91603 45678", "0884 2345678"],
  },
  {
    name: "4 numbers — the first three are the list",
    typed: "Call 98480 12345, 91603 45678, 77020 12345 or 81430 12345",
    expected: ["98480 12345", "91603 45678", "77020 12345"],
  },
  {
    name: "numbers that are not phone numbers",
    typed: "Order ID 4521789632. Bank A/c No: 50100234567812. GSTIN 37ABCDE1234F1Z5. Price Rs. 35800000. UPI 9866012345@ybl. Call 98480 12345",
    profile: { phone: "9876543210", orderNumber: "4521789632" },
    expected: ["98480 12345"],
  },
  {
    name: "an id shaped like a mobile, which the model then calls a phone",
    typed: "Order ID: 9866012345. Call 98480 12345",
    profile: { phone: "9866012345", mobile: "98480 12345" },
    card: true,
    expected: ["98480 12345"],
  },
  { name: "the member's own format kept", typed: "Call (+91) 98480 12345 or 0884-2345678", expected: ["(+91) 98480 12345", "0884-2345678"] },
  {
    name: "read from a visiting card — no typed number",
    typed: "Sri Sai Sweets, Kakinada.",
    profile: { contact: { phone: "98480 12345", mobile: "91603 45678", whatsapp: "91603 45678" } },
    card: true,
    expected: ["98480 12345", "91603 45678 (WhatsApp)"],
  },
  {
    name: "a card misread one digit of the typed number",
    typed: "Call 98480 12345",
    profile: { phone: "98480 12346" },
    card: true,
    expected: ["98480 12345"],
  },
];

const shown = (p: Pick<PhoneFact, "display" | "whatsapp">) => `${p.display}${p.whatsapp ? " (WhatsApp)" : ""}`;

/** The pipeline's own step: the extraction verified and the profile rewritten (geminiService.verifyExtraction). */
const verifiedProfile = (s: Scenario) => {
  const input = { typedText: s.typed, hasContactDocuments: !!s.card };
  const facts = verifyBusinessFacts({ ...input, profile: s.profile ?? {} });
  return sanitizeBusinessProfile({ businessName: "Sri Sai Sweets", ...(s.profile ?? {}) }, facts, input);
};

describe("THE contact list — what the business gave, each once", () => {
  for (const s of SCENARIOS) {
    it(s.name, () => {
      const list = contactNumbersOf(verifiedProfile(s));
      expect(list.map(shown)).toEqual(s.expected);
      // Never more than three, never one number twice.
      expect(list.length).toBeLessThanOrEqual(MAX_CONTACT_NUMBERS);
      expect(new Set(list.map((p) => p.key)).size).toBe(list.length);
    });
  }

  it("says why every number it did not use was left out", () => {
    const facts = verifyBusinessFacts({
      typedText: "Order ID 4521789632. Call 98480 12345, 91603 45678, 77020 12345 or 81430 12345. Since 2001, 35800000 customers",
      profile: { phone: "9876543210" }, hasContactDocuments: false,
    });
    const why = Object.fromEntries(facts.rejected.map((r) => [r.value, r.reason]));
    expect(why["4521789632"]).toMatch(/account, id, registration number or price/);
    expect(why["81430 12345"]).toMatch(/more than 3 numbers/);
    expect(why["35800000"]).toMatch(/not shaped like a phone number, and not labelled as one/);
    expect(why["9876543210"]).toMatch(/placeholder/);
  });

  it("takes a short landline only when it is called a phone, on its line or the line above", () => {
    expect(contactNumbersOf(verifiedProfile({ name: "", typed: "Ph. No. 27654321", expected: [] })).map(shown)).toEqual(["27654321"]);
    expect(contactNumbersOf(verifiedProfile({ name: "", typed: "Contact:\n27654321", expected: [] })).map(shown)).toEqual(["27654321"]);
    expect(contactNumbersOf(verifiedProfile({ name: "", typed: "Turnover 27654321 last year", expected: [] }))).toEqual([]);
  });

  it("gives a WhatsApp label to the number it labels — not to the next one", () => {
    const [a, b] = findPhoneNumbers("Call 98480 12345 WhatsApp: 91603 45678");
    expect([a.whatsapp, b.whatsapp]).toEqual([false, true]);
    const [c, d] = findPhoneNumbers("WhatsApp us today. Call 98480 12345, 91603 45678");
    expect([c.whatsapp, d.whatsapp]).toEqual([false, false]);
  });

  it("reads a profile saved before the verification (no contactNumbers) without its invented numbers", () => {
    const legacy = { businessName: "Sai", phone: "98480 12345", mobile: "4521789632", whatsapp: "9876543210", landline: "Not provided" };
    expect(factsFromProfile(legacy).phones.map(shown)).toEqual(["98480 12345"]);
  });
});

// ── the check itself ───────────────────────────────────────────────────────────────────────────

describe("contactNumberProblems — the check every printed copy is held to", () => {
  const list = contactNumbersOf(verifiedProfile(SCENARIOS.find((s) => s.name === "2 numbers")!));
  it("passes every number exactly once, in any spelling", () => {
    expect(contactNumberProblems("Call 98480 12345 or +91 91603-45678", list)).toEqual([]);
  });
  it("names an invented number, a repeat and a missing one", () => {
    expect(contactNumberProblems("Call 98480 12345, 98765 43210", list)).toEqual([
      "98765 43210 is not one of the business's numbers", "91603 45678 is missing",
    ]);
    expect(contactNumberProblems("98480 12345 · 91603 45678 · 9848012345", list)).toEqual(["98480 12345 is printed 2 times"]);
  });
  it("is not fooled by pincodes, prices, years or dates", () => {
    expect(contactNumberProblems("PIN 533001, Rs 1,20,000, 2025-2026, 12-06-2025", [])).toEqual([]);
  });
});

// ── the pieces that print it ───────────────────────────────────────────────────────────────────

describe("the footer (Video Bottom Label) and the poster's Format line, by count", () => {
  it("draws a WhatsApp number in its own green pill — one of the N, never an extra", () => {
    const one = LOWER_THIRD_SYSTEM_PROMPT({ businessType: "food", adType: "commercial", contactCount: 1, hasAddress: false, hasWhatsApp: true });
    expect(one).toContain("It is one of the ONE pill, not an extra one: never draw that number twice.");
    expect(one).not.toContain("beside the call pill");
    expect(one).toContain("Are there exactly ONE contact pill, each number written once");
    const none = LOWER_THIRD_SYSTEM_PROMPT({ businessType: "food", adType: "commercial", contactCount: 0, hasAddress: false });
    expect(none).toContain("Is there no phone number anywhere on the label?");
  });

  it("lists each number once, however often it arrives", () => {
    expect(labelContactLines([{ display: "98480 12345" }, { display: "+91 98480 12345", whatsapp: true }, { display: "91603 45678" }])).toEqual([
      "CONTACT 1 = 98480 12345 (WhatsApp)",
      "CONTACT 2 = 91603 45678",
      "EXACTLY 2 NUMBERS — draw 2 contact pills, each number written once, no more and no fewer.",
    ]);
    expect(labelContactLines([])).toEqual([]);
  });

  it("says on the poster how many numbers to print — or none", () => {
    expect(posterPhoneRule(0)).toBe("No phone number on the poster.");
    expect(posterPhoneRule(1)).toBe("Print only the one contact number given above, once, digit for digit.");
    expect(posterPhoneRule(3)).toBe("Print only the three contact numbers given above, each once, digit for digit.");
    expect(posterFormatLine({ posterSize: "9:16", hasLogo: true, contactCount: 2 }))
      .toBe("9:16 vertical poster. Use the attached logo exactly as given. Words on the poster in English. Print only the two contact numbers given above, each once, digit for digit.");
    expect(uniquePosterContacts([{ display: "98480 12345" }, { display: "9848012345", whatsapp: true }])).toEqual([{ display: "98480 12345", whatsapp: true }]);
  });

  it("puts a refined label's contact lines back from the list, and updates a saved label's WhatsApp sentence", () => {
    const list = [{ display: "98480 12345", whatsapp: true }, { display: "91603 45678" }];
    const refined = [
      "  - One of the numbers is a WhatsApp number: give it a WhatsApp pill of its own, in WhatsApp green, beside the call pill(s).",
      "REAL CONTENT TO PLACE (use ONLY these EXACT values):",
      "NAME = Sri Sai Sweets",
      "CONTACT 1 = 98480 12345",
      "CONTACT 2 = 98480 12345 (WhatsApp)",
      "EXACTLY 3 NUMBERS — draw 3 contact pills",
      "ADDRESS = Main Road, Kakinada",
    ].join("\n");
    const out = withLabelContacts(refined, list);
    expect(out).toContain("NAME = Sri Sai Sweets\nCONTACT 1 = 98480 12345 (WhatsApp)\nCONTACT 2 = 91603 45678\nEXACTLY 2 NUMBERS");
    expect(out).toContain("ADDRESS = Main Road, Kakinada");
    expect(out).not.toContain("beside the call pill");
    expect(out).toContain("It is one of the TWO pills, not an extra one");
    expect(contactNumberProblems(out, contactNumbersOf({ contactNumbers: ["98480 12345", "91603 45678"] }))).toEqual([]);
  });

  it("scrubs a number out of a run without leaving it behind or changing the kept one", () => {
    expect(stripUnverifiedNumbers("Call 98480  12345   99887-76655 now", ["9848012345"])).toBe("Call 98480 12345 now");
    expect(stripUnverifiedNumbers("Ph: 0884-2345678-9866012345", ["8842345678"])).toBe("Ph: 0884-2345678");
  });

  it("has the voice note write a spoken number in digits — only the digits said", () => {
    expect(VOICE_NOTE_SYSTEM_PROMPT).toContain("A PHONE NUMBER said aloud is written in digits");
    expect(VOICE_NOTE_SYSTEM_PROMPT).toContain("never complete, correct or invent one");
  });
});

// ── end to end, on a fake Gemini that keeps adding, repeating and dropping numbers ─────────────

let extracted: Record<string, unknown> = {};
/** The poster analysis's summary: a number of its own, and the business's first number again. */
let analysisReply = "{}";
let editorReply = "";
let overlayReply = "[]";

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (req: { config?: { systemInstruction?: unknown } }) => {
        const sys = String(req.config?.systemInstruction || "");
        if (/extract the following business information/i.test(sys)) return { text: JSON.stringify(extracted) };
        if (/senior creative strategist/.test(sys)) return { text: analysisReply };
        if (/precise prompt EDITOR/.test(sys)) return { text: editorReply };
        if (/senior short-form video editor/.test(sys)) return { text: overlayReply };
        return { text: "{}" };
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
  analysisReply = JSON.stringify({
    adType: "product_benefit", reason: "r", benefit: "b",
    businessInformation: "Sri Sai Sweets, Kakinada — pure ghee sweets. Call 98765 43210 or 98480 12345, WhatsApp 9000011111.",
  });
});

const image = (name: string) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });
const files = (card: boolean) => ({
  logo: image("logo.png"), visitingCard: card ? [image("card.png")] : [], storeImage: [], productImages: [], flyersPosters: [],
  voiceRecording: [], textInstructionsFile: [],
}) as unknown as FileStore;
const form = (typed: string, over: Record<string, unknown> = {}) => ({
  adType: "commercial", festivalName: "", attireType: "traditional", gender: "female", duration: 16, durationMode: "preset",
  textInstructions: typed, aspectRatio: "9:16", language: "Telugu", posterStyle: "auto", posterTextLanguage: "English",
  noLogo: false, logoNameText: "", ...over,
}) as unknown as AdFormData;
const expectedCount = (s: Scenario) => s.expected.length;

describe("every deliverable prints exactly the list", () => {
  for (const s of SCENARIOS) {
    it(s.name, async () => {
      const profile = verifiedProfile(s);
      const list = contactNumbersOf(profile);
      const n = expectedCount(s);

      // The footer — the Video Bottom Label, built in code.
      const label = gemini.buildVideoBottomLabel({ formData: form(s.typed), businessInfo: profile, hasLogoFile: true, hasPremisesPhoto: false });
      expect(contactNumberProblems(label, list)).toEqual([]);
      expect(label.match(/^CONTACT \d = /gm) ?? []).toHaveLength(n);
      if (n) expect(label).toContain(`EXACTLY ${n} NUMBER${n === 1 ? "" : "S"} — draw ${n} contact pill`);
      else expect(label).toContain("NO CONTACT NUMBER provided");

      // The video kit's poster (the analysis wrote an invented number and repeated a real one).
      const videoPoster = await gemini.writeVideoPosterPrompt(form(s.typed), profile, { hasLogoFile: true });
      expect(contactNumberProblems(videoPoster, list)).toEqual([]);
      expect(videoPoster).toContain(posterPhoneRule(n));
      if (n) expect(videoPoster).toContain(`Contact: ${s.expected.join(", ")}`);
      else expect(videoPoster).not.toContain("Contact:");

      // Poster Creation, from the member's text and the model's extraction, end to end.
      extracted = { businessName: "Sri Sai Sweets", businessType: "sweet shop", ...(s.profile ?? {}) };
      const created = await gemini.generatePosterConcepts(form(s.typed), files(!!s.card), () => {});
      const posterPrompt = created.posterConcepts![0].imagePrompt;
      expect(contactNumberProblems(posterPrompt, list)).toEqual([]);
      expect(posterPrompt).toContain(posterPhoneRule(n));
      // …and it was made from the same list the label printed.
      expect(contactNumbersOf(created.businessInfo).map(shown)).toEqual(s.expected);

      // A refine of the label that repeats the first number, invents a fourth and drops one.
      editorReply = label
        .replace(/^CONTACT 1 = .*$/m, (line) => `${line}\nCONTACT 2 = ${list[0]?.display ?? "98480 12345"}\nCONTACT 4 = 90000 11111`)
        .replace(/^CONTACT 3 = .*\n?/m, "");
      const refinedLabel = await gemini.refineSection("header", label, "make the pills larger", form(s.typed), profile);
      expect(contactNumberProblems(refinedLabel, list)).toEqual([]);
      expect(refinedLabel.match(/^CONTACT \d = /gm) ?? []).toHaveLength(n);

      // A frame refine that writes a number of its own on the shop board.
      editorReply = "A sweet shop counter. A board reads: SRI SAI SWEETS · Call 98765 43210";
      const frame = await gemini.refineSection("mainFrame", "A sweet shop counter.", "add a board", form(s.typed), profile);
      expect(frame).not.toContain("98765 43210");

      // Overlays: a number nobody gave goes, and so does a fourth one the list does not carry.
      overlayReply = JSON.stringify([{ clip: 1, text: "Call 90000 11111" }, { clip: 2, text: "Order now · 81430 12345" }]);
      const overlays = await gemini.generateOverlayTexts("Clip 1: Welcome.\nClip 2: Visit us.", profile, "Telugu");
      for (const o of overlays) expect(contactNumberProblems(String(o.text), [])).toEqual([]);
    });
  }
});
