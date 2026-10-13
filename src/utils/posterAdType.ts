/**
 * The poster prompt — ONE conceptual ad type, chosen for the business, in the owner's three sentences.
 *
 * ── Why (the owner, 2026-10-12) ──────────────────────────────────────────────────────────────────
 * "Update the complete Poster Prompt generation system. First analyze all available business
 * information, product/service, ad type, campaign purpose, and requirements, then intelligently select
 * the ONE most suitable conceptual ad style … Generate a very short, clean, creative prompt in this exact
 * structure … Do not randomly select the type, do not use multiple types, do not generate long technical
 * prompts, and do not lose important business context." And, mid-task: "poster ratio 9:16".
 *
 * What it replaced. Poster Creation asked a model for one to six concepts at temperature 0.95, each a
 * 140–230-word art-directed image prompt, and "best fit" told it to use at least two different styles
 * across the set — several types, with a lot of chance in the pick. The video kit's "3. Poster Design"
 * was a second system again: a 150–220-word "premium designed poster" with no conceptual idea at all.
 * Both now work ONE way:
 *
 *  1. A model ANALYSES the business — who it is, what it sells, the main benefit, the kind of ad, the
 *     campaign purpose, the client's must-haves — and names ONE of the eight types below by its id, with
 *     a short summary of the business (services/prompts/posterConcept). A type fixed by the job, or picked
 *     by the member instead of "Best fit", is kept as it is; only "Best fit" lets the analysis choose.
 *  2. This file ASSEMBLES the prompt, in code, so its shape can never drift: the owner's three sentences
 *     word for word, then ONE short Format line (size · logo · text language).
 *  3. The truth is the code's, not the model's: every phone number, labelled address, email and website
 *     the model wrote is taken out of its summary, and the VERIFIED contact facts (utils/businessFacts) are
 *     put back — one to three numbers exactly as the member gave them, the address only when there is one.
 *  4. When the analysis gives nothing usable — no reply, broken JSON, an id outside the eight — the type
 *     comes from a keyword rubric over the business (fallbackPosterAdType): deterministic, never random.
 *
 * Pure: no React, no Firestore, no model. Every rule here is unit-tested (src/test/posterAdTypeOct12).
 */
import type { PosterConcept } from "@/types/aiPlatform";
import { parsePosterSize } from "./posterSpec";
import { digitsOf, MAX_CONTACT_NUMBERS, phoneKey, stripUnverifiedNumbers } from "./businessFacts";
import { themeTextOf } from "./castSheet";

export interface PosterAdType {
  /** The services/posterStyles id — what a job stores as `posterStyle` and the WhatsApp brief shows. */
  id: string;
  /** The owner's own name for the type, verbatim — the [SELECTED AD TYPE] the prompt carries. */
  name: string;
  /** The business and the message this type serves best — the analysis's rubric, one line. */
  fitsWhen: string;
  /**
   * The fallback rubric's words: lower case, whole words (a plural "s" / "es" also counts), a phrase
   * written with single spaces. A phrase scores one point per word, so "hair transplant" outweighs "hair".
   */
  keywords: string[];
}

/** The eight types, in the owner's order. A tie in the fallback rubric goes to the one listed first. */
export const POSTER_AD_TYPES: PosterAdType[] = [
  {
    id: "material_metaphor",
    name: "Material-based Metaphor Ads",
    fitsWhen: "the business has a signature material, ingredient or craft people can almost touch — sarees and textiles, jewellery, furniture and woodwork, building materials, bakeries and sweets, handicrafts, décor",
    keywords: [
      "saree", "sari", "silk", "pattu", "textile", "fabric", "cloth", "clothing", "garment", "boutique", "handloom",
      "tailor", "tailoring", "jewel", "jewellery", "jewelry", "jeweller", "jeweler", "gold", "silver", "diamond",
      "furniture", "wood", "woodwork", "carpentry", "timber", "plywood", "cement", "steel", "tile", "granite",
      "marble", "brick", "paint", "hardware", "handicraft", "pottery", "bakery", "cake", "sweet", "decor",
      "decoration", "florist", "flower",
    ],
  },
  {
    id: "shadow_metaphor",
    name: "Shadow Metaphor Ads",
    fitsWhen: "the business sells an aspiration or a future — schools, colleges and coaching, careers and loans, gyms and sports, events and staging, vehicles, causes",
    keywords: [
      "school", "college", "academy", "coaching", "tuition", "institute", "education", "educational", "training",
      "course", "career", "admission", "abroad", "loan", "gym", "fitness", "yoga", "sport", "event",
      "wedding planner", "driving school",
    ],
  },
  {
    id: "contrast_concept",
    name: "Contrast-based Conceptual Ads",
    fitsWhen: "the business moves people from a problem to a better state — cleaning and laundry, repairs and servicing, renovation and interiors, insurance, treatments with a visible before and after",
    keywords: [
      "laundry", "dry clean", "dry cleaning", "cleaning service", "deep cleaning", "repair", "servicing",
      "service centre", "service center", "renovation", "interior", "waterproofing", "car wash", "detailing",
      "pest control", "insurance", "plumbing", "plumber", "electrician", "weight loss", "slimming",
      "hair transplant", "dermatology", "dermatologist", "physiotherapy", "rehab", "rehabilitation", "de addiction",
    ],
  },
  {
    id: "proportion_concept",
    name: "Proportion-based Conceptual Ads",
    fitsWhen: "the business is about abundance, scale or a landmark experience — restaurants and food, real estate and construction, supermarkets and wholesale, travel and resorts, big celebrations",
    keywords: [
      "restaurant", "hotel", "cafe", "biryani", "dhaba", "catering", "caterer", "tiffin", "food court",
      "real estate", "villa", "plot", "apartment", "venture", "construction", "builder", "developer",
      "supermarket", "mall", "mart", "wholesale", "hypermarket", "travel", "tour", "holiday", "resort", "toy",
    ],
  },
  {
    id: "visual_exaggeration",
    name: "Visual Exaggeration Ads",
    fitsWhen: "the customer has a pain or a craving the business ends — security and CCTV, snacks and fast food, cooling and power backup, internet, relief from a daily nuisance",
    keywords: [
      "cctv", "security", "surveillance", "snack", "chips", "fast food", "pizza", "burger", "ice cream", "juice",
      "air conditioner", "ac", "cooler", "inverter", "ups", "battery", "solar", "generator", "broadband", "internet",
      "wifi", "mosquito",
    ],
  },
  {
    id: "product_benefit",
    name: "Product Benefit Conceptual Ads",
    fitsWhen: "the product's result can be seen — salons and cosmetics, clinics, hospitals and pharmacies, food and drinks, dairy and groceries, cleaning products, opticals",
    keywords: [
      "salon", "beauty", "parlour", "parlor", "spa", "skin", "skincare", "hair", "cosmetic", "makeup", "pharmacy",
      "medical", "medicine", "clinic", "dental", "dentist", "hospital", "doctor", "health", "healthcare", "ayurveda",
      "ayurvedic", "homeopathy", "optical", "optician", "eye", "spectacle", "supplement", "nutrition", "organic",
      "dairy", "milk", "ghee", "oil", "spice", "masala", "pickle", "grocery", "kirana", "detergent", "soap",
      "water purifier", "tea", "coffee",
    ],
  },
  {
    id: "shape_concept",
    name: "Shape-based Conceptual Ads",
    fitsWhen: "the message can live in a shape or symbol everyone reads at a glance — agencies and consultancies, accountants and lawyers, IT, printing and packaging, products with a distinctive form, spare parts and tools",
    keywords: [
      "agency", "marketing", "advertising", "branding", "digital marketing", "consultancy", "consultant",
      "chartered accountant", "auditor", "tax", "gst", "legal", "advocate", "lawyer", "architect", "architecture",
      "software", "it services", "web design", "app development", "printing", "printer", "packaging",
      "auto parts", "spare parts", "tool",
    ],
  },
  {
    id: "animal_metaphor",
    name: "Animal-based Visual Metaphor Ads",
    fitsWhen: "the business wants to own ONE quality an animal is famous for — strength, speed, vigilance, durability, loyalty: phones and electronics, bags and luggage, water and drinks, vehicles and transport, finance, causes",
    keywords: [
      "mobile", "smartphone", "phone", "electronics", "laptop", "computer", "bag", "luggage", "mineral water",
      "drinking water", "water", "transport", "logistics", "courier", "packers", "movers", "tyre", "tire", "bike",
      "two wheeler", "motor", "car", "automobile", "vehicle", "tractor", "finance", "bank", "chit", "investment",
      "ngo", "charity",
    ],
  },
];

/**
 * The type for a business nothing points anywhere: the benefit, shown happening — which is what the
 * owner's third sentence asks of every poster anyway.
 */
export const DEFAULT_POSTER_AD_TYPE = "product_benefit";

const TYPE_BY_ID = new Map(POSTER_AD_TYPES.map((t) => [t.id, t]));

export const posterAdTypeById = (id?: string | null): PosterAdType | null => (id ? TYPE_BY_ID.get(id) ?? null : null);
export const isPosterAdTypeId = (id?: string | null): boolean => posterAdTypeById(id) !== null;
/** "Shadow Metaphor Ads" for "shadow_metaphor"; "" for "auto" or anything unknown. */
export const posterAdTypeName = (id?: string | null): string => posterAdTypeById(id)?.name ?? "";

/** "Shadow Metaphor Ads", "shadow metaphor", "shadow_metaphor" all read as one key: "shadowmetaphor". */
const typeKey = (value: string) => value.toLowerCase().replace(/[^a-z]+/g, "").replace(/ads?$/, "");

/**
 * The id the analysis meant: its id as asked, or the type's name, or an unmistakable start of it
 * ("shadow", "visual exaggeration conceptual"). Anything that matches no type — or more than one — is
 * null, and the type then comes from the fixed choice, the current prompt or the rubric.
 */
export function resolvePosterAdTypeId(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (TYPE_BY_ID.has(raw)) return raw;
  const key = typeKey(raw);
  if (key.length < 5) return null;
  const exact = POSTER_AD_TYPES.find((t) => typeKey(t.id) === key || typeKey(t.name) === key);
  if (exact) return exact.id;
  const partial = POSTER_AD_TYPES.filter((t) => {
    const name = typeKey(t.name);
    return name.startsWith(key) || key.startsWith(name);
  });
  return partial.length === 1 ? partial[0].id : null;
}

/**
 * Words that name one of the eight types, or ask for "another style". A refine may change the type only when
 * the request says something like this — "make it a shadow ad", "try a different concept type", "use an
 * animal" — because the analysis, asked to "make the logo bigger", has been known to pick a new type too.
 */
const TYPE_CHANGE_WORDS = /\b(?:styles?|types?|kinds?|metaphors?|concepts?|conceptual|material|shadows?|contrast|proportions?|scale|exaggerat\w*|benefit|shapes?|animals?)\b/i;

/** True when a refine request asks for a different ad type (see TYPE_CHANGE_WORDS). */
export const instructionAsksForTypeChange = (instruction: string): boolean => TYPE_CHANGE_WORDS.test(instruction || "");

// ── small text helpers ─────────────────────────────────────────────────────────────────────────

/** Lower-case words, letters and digits only (any script); accents on Latin letters dropped. */
const wordsOf = (text: string): string[] =>
  (text || "")
    .normalize("NFD")
    .replace(/[\u{0300}-\u{036F}]/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);

/** Words that say nothing about WHICH business or occasion it is. */
const GENERIC_WORDS = new Set([
  "the", "and", "for", "with", "sri", "shri", "sree", "shree", "new", "national", "international", "world", "day",
  "festival", "puja", "pvt", "ltd", "private", "limited", "company", "wishes", "greetings", "happy",
]);

const significantWords = (text: string, min = 3) => wordsOf(text).filter((w) => w.length >= min && !GENERIC_WORDS.has(w));

/** True when `text` names `phrase`: the whole phrase, or at least `share` of its telling words. */
function mentions(text: string, phrase: string, share: number): boolean {
  const hay = ` ${wordsOf(text).join(" ")} `;
  const whole = wordsOf(phrase).join(" ");
  if (!whole) return true;
  if (hay.includes(` ${whole} `)) return true;
  const telling = significantWords(phrase);
  if (telling.length === 0) return false;
  return telling.filter((w) => hay.includes(` ${w} `)).length / telling.length >= share;
}

/**
 * True when the summary already names the occasion — by a word of the occasion's own name that is not
 * also a word of the business's name: "Sri Lakshmi Silks" must not count as having said "Diwali / Lakshmi
 * Puja". When every telling word is the business's own, the occasion is written in (a repeat is harmless,
 * a missing occasion is not).
 */
function mentionsOccasion(summary: string, occasion: string, businessName: string): boolean {
  const own = new Set(wordsOf(businessName));
  const telling = significantWords(occasion, 4).filter((w) => !own.has(w));
  if (telling.length === 0) return false;
  const hay = ` ${wordsOf(summary).join(" ")} `;
  return telling.some((w) => hay.includes(` ${w} `));
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words a sentence must not end on once it has been cut short. */
const DANGLING_WORDS = /\s+(?:and|or|the|a|an|of|for|with|to|in|on|at|by|from|its|their|our|your|plus)$/i;

/** Cut to at most `max` words — at a sentence end in the second half when there is one. */
function capWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return text.trim();
  let cut = words.slice(0, max).join(" ");
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (stop > cut.length / 2) cut = cut.slice(0, stop);
  let previous = "";
  while (previous !== cut) {
    previous = cut;
    cut = cut.replace(/[\s,;:\u{2013}\u{2014}-]+$/u, "").replace(DANGLING_WORDS, "");
  }
  return cut;
}

/** No sentence end of its own: the template puts the full stop after it, so ".." can never happen. */
const withoutEnding = (text: string) => text.replace(/[\s.;,:!?\u{2013}\u{2014}-]+$/u, "").trim();

/** Runs of punctuation collapsed to one mark — a full stop when the run held one; no leading separator. */
function tidyPunctuation(text: string): string {
  return text
    .replace(/\u{2026}/gu, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[,.;:]{2,}|[,.;:](?:\s+[,.;:])+/g, (run) => (run.includes(".") ? "." : run.trim()[0]))
    .replace(/^[\s.;,:|\u{2013}\u{2014}-]+/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── the format line ────────────────────────────────────────────────────────────────────────────

/**
 * The canvas in plain words — "9:16 vertical poster", "1:1 square poster", "16:9 horizontal poster". No
 * pixel count unless the size itself was typed in pixels ("9:16 vertical poster, 1080 × 1920 pixels");
 * an odd pixel size is named by its pixels alone.
 */
export function posterSizePhrase(posterSize?: string | null): string {
  const s = parsePosterSize(posterSize);
  const shape = s.orientation === "square" ? "square" : s.orientation === "portrait" ? "vertical" : "horizontal";
  if (s.kind === "pixels") {
    return `${s.ratioExact ? `${s.ratio} ` : ""}${shape} poster, ${s.width} × ${s.height} pixels`;
  }
  return `${s.ratio} ${shape} poster`;
}

export interface PosterFormatInput {
  /** The stored size string; empty or unreadable is the 9:16 default (utils/posterSpec). */
  posterSize?: string | null;
  /** A logo FILE goes into the image generator with the prompt. */
  hasLogo: boolean;
  /** No logo: the business name, set as a wordmark exactly as spelled. */
  nameBoardText?: string;
  /** The language of the words printed on the poster (English by default). */
  textLanguage?: string;
  /**
   * How many verified numbers the Business Information carries (0–3) — the Format line then says to print
   * exactly those, each once, or no phone number at all. Absent: the line says nothing about numbers.
   */
  contactCount?: number;
}

const NUMBER_WORDS = ["", "one", "two", "three"];

/**
 * The Format line's phone rule (owner, 2026-10-13: "1 number → exactly that 1; none → none"). The image
 * generator is the last step and code cannot check its picture, so the prompt names the count: with no
 * number it says so — a poster left silent about phones is where an image tool "completes" the ad with a
 * "Call: 98765 43210" strip of its own.
 */
export function posterPhoneRule(count: number): string {
  if (count <= 0) return "No phone number on the poster.";
  return count === 1
    ? "Print only the one contact number given above, once, digit for digit."
    : `Print only the ${NUMBER_WORDS[count] ?? count} contact numbers given above, each once, digit for digit.`;
}

/**
 * The closing line after "Format: " — size, logo, text language, one short sentence each:
 * "9:16 vertical poster. Use the attached logo exactly as given. Words on the poster in English."
 *
 * With no logo the line never mentions a logo at all — not even "no logo file": naming the thing being
 * ruled out is how an image generator ends up drawing one (the rule every no-logo surface follows,
 * noLogoPrompts.test.ts). The business name is set as the wordmark instead.
 */
export function posterFormatLine(input: PosterFormatInput): string {
  const name = tidyPunctuation((input.nameBoardText || "").replace(/["\u{201C}\u{201D}]/gu, ""));
  const brand = input.hasLogo
    ? "Use the attached logo exactly as given."
    : `Show the business name${name ? ` "${withoutEnding(name)}"` : ""} as a clean wordmark, exactly as spelled.`;
  const language = (input.textLanguage || "").trim() || "English";
  const phones = input.contactCount === undefined ? "" : ` ${posterPhoneRule(input.contactCount)}`;
  return `${posterSizePhrase(input.posterSize)}. ${brand} Words on the poster in ${language}.${phones}`;
}

// ── the business information ───────────────────────────────────────────────────────────────────

/** The model's summary is cut to this many words; the code's verified facts come on top of it. */
export const MAX_SUMMARY_WORDS = 60;
/** The main benefit, as the analysis names it. */
export const MAX_BENEFIT_WORDS = 12;
const MAX_REASON_WORDS = 35;

/**
 * A labelled contact or address fragment the model wrote — "Contact: …", "Call us: …", "Address: …",
 * "Email: …" — up to the end of its sentence. The verified facts are added back by code; a model's copy
 * can only be a duplicate or an invention. Only a COLON makes a label: "Sai Mobile — smartphones" is the
 * business talking, and unlabelled prose ("near the bus stand") is left alone rather than cut at a guess.
 */
const LABELLED_CONTACT = /(^|[\s.;,|(\u{2013}\u{2014}-])(?:full\s+)?(?:contact(?:\s+(?:no\.?|number|numbers|details|us))?|call(?:\s+(?:us|now))?|phone|ph|mobile|mob|cell|whats\s*app|tel|e-?mail|website|web|address|addr|location)\s*[:\u{FF1A}][^.;|\n]*/giu;
/** What a removed number leaves behind: "Call us on .", "WhatsApp —". */
const DANGLING_CALL = /\b(?:call(?:\s+(?:us|now|today))?|contact(?:\s+us)?|reach(?:\s+us)?|dial|whats\s*app(?:\s+us)?)(?:\s+(?:on|at))?\s*[:\u{2013}\u{2014}-]?\s*(?=[.;,|]|$)/giu;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const WEB_ADDRESS = /\b(?:https?:\/\/|www\.)\S+/gi;
const EDGE_QUOTES = /^["'\u{201C}\u{201D}\s]+|["'\u{201C}\u{201D}\s]+$/gu;

/**
 * The model's summary, made safe to print: one paragraph, no phone number, no labelled contact or
 * address, no email or website, no ad-type name (the prompt names the type once, in its first sentence),
 * at most MAX_SUMMARY_WORDS words and no sentence end of its own.
 */
export function cleanPosterSummary(text: string, opts: { address?: string } = {}): string {
  let t = (text || "")
    .replace(/```[a-z]*|```/gi, "")
    .replace(/[\r\n]+/g, ". ")
    .replace(EDGE_QUOTES, "");
  // Every phone number, verified or not: the verified ones are added back after it, once, in their place.
  t = stripUnverifiedNumbers(t, []);
  t = t.replace(LABELLED_CONTACT, "$1").replace(EMAIL, "").replace(WEB_ADDRESS, "").replace(DANGLING_CALL, "");
  const address = (opts.address || "").trim();
  if (address.length >= 6) t = t.replace(new RegExp(escapeRegExp(address), "gi"), "");
  for (const type of POSTER_AD_TYPES) {
    const core = escapeRegExp(type.name.replace(/\s+Ads$/i, "")).replace(/[-\s]+/g, "[\\s-]+");
    t = t.replace(new RegExp(`\\b(?:(?:in|as|using)\\s+(?:an?|the)\\s+)?${core}(?:\\s+ads?)?(?:\\s+style)?\\b`, "gi"), "");
  }
  return withoutEnding(capWords(tidyPunctuation(t), MAX_SUMMARY_WORDS));
}

export interface PosterContact {
  display: string;
  whatsapp?: boolean;
}

/**
 * The numbers a poster prints: each once (two spellings of one number are one — a WhatsApp mark on either
 * stays), in the order given, at most MAX_CONTACT_NUMBERS. The list arrives verified and unique; this is the
 * guard at the point of printing.
 */
export function uniquePosterContacts(phones: PosterContact[] | undefined): PosterContact[] {
  const out: (PosterContact & { key: string })[] = [];
  for (const p of phones || []) {
    const display = p.display?.trim();
    if (!display) continue;
    const key = phoneKey(digitsOf(display));
    const same = out.find((o) => o.key === key);
    if (same) { same.whatsapp ||= !!p.whatsapp; continue; }
    out.push({ display, whatsapp: !!p.whatsapp, key });
  }
  return out.slice(0, MAX_CONTACT_NUMBERS).map(({ display, whatsapp }) => ({ display, whatsapp }));
}

export interface PosterBusinessInput {
  /** The analysis's summary — or the profile's, built in code, when the analysis gave none. */
  summary: string;
  /** Put in front when the summary leaves the name out — the poster is for THIS business. */
  businessName?: string;
  /** The occasion's name — checked against the summary — and the line written when it is missing. */
  occasion?: string;
  occasionLine?: string;
  /** The VERIFIED numbers, up to three, as the member gave them. */
  phones?: PosterContact[];
  /** The VERIFIED address, or "". */
  address?: string;
}

/**
 * The Business Information slot: the summary, then — by code — the occasion when the summary left it out,
 * "Contact: …" (one to three verified numbers) and "Address: …" (only when there is one), in the order the
 * owner's example gave them. A missing fact is simply absent: no empty label, ever.
 */
export function posterBusinessInformation(input: PosterBusinessInput): string {
  const rawAddress = (input.address || "").trim();
  let summary = cleanPosterSummary(input.summary, { address: rawAddress });
  const name = withoutEnding(tidyPunctuation(input.businessName || ""));
  if (name && !mentions(summary, name, 0.6)) summary = summary ? `${name} — ${summary}` : name;
  const parts = [summary];
  const occasion = tidyPunctuation(input.occasion || "");
  if (occasion && !mentionsOccasion(summary, occasion, name)) {
    parts.push(tidyPunctuation(input.occasionLine || "") || `Occasion: ${occasion}`);
  }
  const phones = uniquePosterContacts(input.phones);
  if (phones.length) parts.push(`Contact: ${phones.map((p) => `${p.display}${p.whatsapp ? " (WhatsApp)" : ""}`).join(", ")}`);
  // As typed, apart from a stray double full stop or a trailing one — the template ends the sentence.
  const address = tidyPunctuation(rawAddress);
  if (address) parts.push(`Address: ${address}`);
  return parts.map(withoutEnding).filter(Boolean).join(". ");
}

// ── the prompt ─────────────────────────────────────────────────────────────────────────────────

/** The owner's first and third sentences, word for word. */
export const POSTER_PROMPT_LEAD = "Create a minimalist and creative ad in";
export const POSTER_PROMPT_CLOSE = "Create one strong visual concept/metaphor that communicates the main product/service benefit.";

/**
 * The prompt the member copies: the owner's three sentences exactly, a blank line, then the Format line.
 * Assembled here and only here — a model never writes it, so it can never come back longer, in another
 * order, with two types or with a double full stop.
 */
export function conceptPosterPrompt(input: { adTypeName: string; businessInformation: string; format: string }): string {
  const type = withoutEnding(input.adTypeName);
  const info = withoutEnding(input.businessInformation.replace(/\s+/g, " "));
  const format = `${input.format.replace(/\s+/g, " ").trim().replace(/[\s.]+$/, "")}.`;
  return `${POSTER_PROMPT_LEAD} ${type}. Business Information: ${info}. ${POSTER_PROMPT_CLOSE}\n\nFormat: ${format}`;
}

const PROMPT_SHAPE = /^Create a minimalist and creative ad in (.+?)\. Business Information: ([\s\S]+?)\. Create one strong visual concept\/metaphor that communicates the main product\/service benefit\.\n\nFormat: (.+)$/;

/** A prompt this system wrote, read back into its parts — null for anything else (an older long prompt). */
export function readConceptPosterPrompt(text: string): { adTypeId: string; adTypeName: string; businessInformation: string; format: string } | null {
  const m = PROMPT_SHAPE.exec((text || "").trim());
  if (!m) return null;
  const type = POSTER_AD_TYPES.find((t) => t.name === m[1]);
  if (!type) return null;
  return { adTypeId: type.id, adTypeName: type.name, businessInformation: m[2], format: m[3] };
}

/**
 * Longer than this is no longer "very short". A summary at its cap plus the name, the occasion, three
 * numbers and a long address stays under it; it is a guard against a broken assembly, not a style rule.
 */
const MAX_PROMPT_WORDS = 200;

/** What is wrong with a poster prompt, in words — [] when it follows the owner's structure exactly. */
export function posterPromptProblems(text: string): string[] {
  const t = text ?? "";
  const problems: string[] = [];
  const m = PROMPT_SHAPE.exec(t);
  if (!m) problems.push("it does not follow the three sentences and the Format line");
  else {
    if (!POSTER_AD_TYPES.some((type) => type.name === m[1])) problems.push(`"${m[1]}" is not one of the eight ad types`);
    if (!withoutEnding(m[2])) problems.push("the business information is empty");
    if (!/\.$/.test(m[3].trim()) || m[3].includes("\n")) problems.push("the Format line is not one finished line");
  }
  const named = POSTER_AD_TYPES.reduce((n, type) => n + (t.split(type.name).length - 1), 0);
  if (named !== 1) problems.push(`it names ${named} ad types — exactly one is allowed`);
  if (/\.\s*\./.test(t)) problems.push("it has a double full stop");
  if (/[ \t]+$/m.test(t)) problems.push("a line ends in spaces");
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words > MAX_PROMPT_WORDS) problems.push(`it is ${words} words long — at most ${MAX_PROMPT_WORDS}`);
  return problems;
}

export const isConceptPosterPrompt = (text: string): boolean => posterPromptProblems(text).length === 0;

// ── the analysis's answer ──────────────────────────────────────────────────────────────────────

export interface PosterAnalysis {
  /** A type id when the answer named one of the eight; null otherwise. */
  adType: string | null;
  reason: string;
  benefit: string;
  businessInformation: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The analysis's JSON — in a code fence, with a sentence around it, or as a bare object. Null when unreadable. */
export function parsePosterAnalysis(text: string): PosterAnalysis | null {
  const cleaned = (text || "").replace(/^```(?:json)?\s*/gim, "").replace(/```\s*$/gim, "").trim();
  let json: unknown = null;
  try {
    json = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { json = JSON.parse(cleaned.slice(start, end + 1)); } catch { json = null; }
    }
  }
  if (Array.isArray(json)) json = json[0];
  if (!json || typeof json !== "object") return null;
  const r = json as Record<string, unknown>;
  return {
    adType: resolvePosterAdTypeId(r.adType ?? r.ad_type ?? r.type ?? r.style ?? r.adTypeName),
    reason: str(r.reason) || str(r.why),
    benefit: str(r.benefit) || str(r.mainBenefit) || str(r.main_benefit),
    businessInformation: str(r.businessInformation) || str(r.business_information) || str(r.businessInfo) || str(r.summary),
  };
}

// ── when the analysis does not answer ──────────────────────────────────────────────────────────

/** A value that says nothing — what an extraction writes for a field it did not find. */
const EMPTY_VALUE = /^(?:not\s*(?:provided|available|mentioned|given|specified)|n\/?a|none|nil|null|unknown|-+)$/i;

/** Every non-empty string under a key that matches, at any depth. */
function valuesUnder(node: unknown, key: RegExp, depth = 0, under = false): string[] {
  if (node == null || depth > 6) return [];
  if (typeof node === "string") return under && node.trim() && !EMPTY_VALUE.test(node.trim()) ? [node.trim()] : [];
  if (Array.isArray(node)) return node.flatMap((n) => valuesUnder(n, key, depth + 1, under));
  if (typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => valuesUnder(v, key, depth + 1, under || key.test(k)));
  }
  return [];
}

const BUSINESS_TYPE_KEY = /business\s*type|industry|category|nature\s+of\s+business|type\s+of\s+business/i;

/** One point per word of each keyword found, each keyword counted once however often it appears. */
function scoreText(text: string, keywords: string[]): { score: number; matched: string[] } {
  const hay = ` ${wordsOf(text).join(" ")} `;
  let score = 0;
  const matched: string[] = [];
  for (const keyword of keywords) {
    if ([keyword, `${keyword}s`, `${keyword}es`].some((form) => hay.includes(` ${form} `))) {
      score += keyword.split(" ").length;
      matched.push(keyword);
    }
  }
  return { score, matched };
}

/**
 * The type when the analysis gives nothing usable: a keyword rubric over what the business IS.
 *
 * The business's name and stated type count three times (they say what it is); every other word of its
 * details and of the team's brief once (castSheet.themeTextOf: never its address, contacts, colours or
 * logo). The highest score wins; a tie goes to the type listed first in POSTER_AD_TYPES (the owner's
 * order); a business no word points anywhere gets DEFAULT_POSTER_AD_TYPE. Same input, same type.
 */
export function fallbackPosterAdType(input: { businessInfo?: unknown; businessName?: string; brief?: string; category?: string }): { id: string; matched: string[] } {
  const primary = [input.businessName || "", input.category || "", ...valuesUnder(input.businessInfo, BUSINESS_TYPE_KEY)].join("\n");
  const secondary = themeTextOf(input.businessInfo ?? {}, input.brief || "");
  let best = { id: DEFAULT_POSTER_AD_TYPE, score: 0, matched: [] as string[] };
  for (const type of POSTER_AD_TYPES) {
    const a = scoreText(primary, type.keywords);
    const b = scoreText(secondary, type.keywords);
    const score = a.score * 3 + b.score;
    if (score > best.score) best = { id: type.id, score, matched: Array.from(new Set([...a.matched, ...b.matched])) };
  }
  return { id: best.id, matched: best.matched };
}

/** A line of the brief that is about reaching the business, not about the business. */
const CONTACT_LINE = /^\s*[-•*]?\s*(?:address|addr|landmark|location|near|opp(?:osite)?\.?|contact|call|phone|mobile|cell|whats\s*app|e-?mail|website|instagram|facebook|brand\s+colou?rs?|colou?rs?|logo)\b/i;

/**
 * A summary built from the profile in code — for when the analysis wrote none. The name, what the business
 * is, what it offers, its own promise and a current offer, each only when the details carry it; else the
 * first lines of the team's brief. Never more than the details say. (posterBusinessInformation puts the
 * name in front when a summary leaves it out.)
 */
export function fallbackPosterSummary(input: { businessInfo?: unknown; businessName?: string; brief?: string }): string {
  const profile = input.businessInfo ?? {};
  const first = (key: RegExp, maxWords: number) => {
    const value = valuesUnder(profile, key).find((v) => /\p{L}/u.test(v));
    return value ? capWords(withoutEnding(value), maxWords) : "";
  };
  const name = withoutEnding((input.businessName || "").trim()) || first(/business\s*name|^name$/i, 10);
  const kind = first(BUSINESS_TYPE_KEY, 8);
  const offerings = Array.from(new Set(
    valuesUnder(profile, /services|products|offerings|product\s+categor|speciali[sz]|treatments|courses|menu|collections?/i)
      .flatMap((v) => v.split(/\s*[,;\n]\s*/))
      .map((v) => capWords(withoutEnding(v), 6))
      .filter((v) => v && /\p{L}/u.test(v) && !EMPTY_VALUE.test(v)),
  )).slice(0, 4);
  const promise = first(/tagline|slogan|\busp\b|unique|promise|motto/i, 14);
  const offer = first(/\boffers?\b|discount|promotion/i, 14);

  if (offerings.length || promise || offer || kind) {
    const head = [name, kind && !mentions(name, kind, 0.6) ? kind : ""].filter(Boolean).join(", ");
    let summary = [
      [head, offerings.join(", ")].filter(Boolean).join(" — "),
      promise ? `the promise: ${promise}` : "",
    ].filter(Boolean).join("; ");
    if (offer) summary = `${summary}${summary ? ". " : ""}Offer: ${offer}`;
    return summary;
  }
  const briefLines = (input.brief || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !CONTACT_LINE.test(l));
  return capWords(withoutEnding(briefLines.join(". ")), 40) || name;
}

// ── the whole decision ─────────────────────────────────────────────────────────────────────────

/**
 * How the type was chosen: fixed by the job or the member, chosen by the analysis, kept from the prompt a
 * refine started from, or — the analysis gave none — by the rubric.
 */
export type PosterTypeChoice = "fixed" | "analysis" | "kept" | "rule";

export interface ConceptPoster {
  adType: string;
  adTypeName: string;
  reason: string;
  benefit: string;
  businessInformation: string;
  format: string;
  prompt: string;
  chosenBy: PosterTypeChoice;
}

export interface ConceptPosterInput extends PosterFormatInput {
  /** The analysis's answer, possibly partial; null when it gave none. */
  analysis: PosterAnalysis | null;
  /** A type the job or the member fixed — never changed by anything. */
  fixedTypeId?: string | null;
  /** A refine: the type the prompt already has — kept unless the analysis names another. */
  currentTypeId?: string | null;
  /** A refine: the reason the prompt already gives — shown again when its type is kept. */
  currentReason?: string;
  /** The sanitized business profile (utils/businessFacts) — for the rubric and the code summary. */
  businessInfo?: unknown;
  businessName?: string;
  /** The team's BUSINESS CONTENT. */
  brief?: string;
  occasion?: string;
  occasionLine?: string;
  phones?: PosterContact[];
  address?: string;
}

const sentence = (text: string) => {
  const t = text.trim();
  return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : "";
};
/** A model's line made printable: one line, no phone number, capped. */
const modelLine = (text: string, maxWords: number) =>
  capWords(tidyPunctuation(stripUnverifiedNumbers((text || "").replace(/\s+/g, " ").trim(), [])), maxWords);

/**
 * A refine's answer, made safe: the type changes only when the request asked for another one, and a fixed type
 * never changes. Otherwise the analysis's type is dropped (its reason with it, since it argued for that type),
 * so the assembly keeps the current type.
 */
export function refineAnalysis(analysis: PosterAnalysis | null, opts: { instruction: string; currentTypeId?: string | null; fixedTypeId?: string | null }): PosterAnalysis | null {
  if (!analysis) return null;
  const keepId = posterAdTypeById(opts.fixedTypeId)?.id ?? posterAdTypeById(opts.currentTypeId)?.id ?? null;
  if (!analysis.adType || !keepId || analysis.adType === keepId) return analysis;
  if (!posterAdTypeById(opts.fixedTypeId) && instructionAsksForTypeChange(opts.instruction)) return analysis;
  return { ...analysis, adType: null, reason: "" };
}

/**
 * The poster, decided and assembled: which type (fixed → the analysis → the current one → the rubric),
 * why, the business information (the analysis's summary, else the code's) with the verified facts, the
 * Format line, and the prompt in the owner's structure.
 */
export function assembleConceptPoster(input: ConceptPosterInput): ConceptPoster {
  const analysis = input.analysis;
  const fixed = posterAdTypeById(input.fixedTypeId);
  const chosen = posterAdTypeById(analysis?.adType);
  const current = posterAdTypeById(input.currentTypeId);
  let type: PosterAdType;
  let chosenBy: PosterTypeChoice;
  let matched: string[] = [];
  if (fixed) { type = fixed; chosenBy = "fixed"; }
  else if (chosen) { type = chosen; chosenBy = "analysis"; }
  else if (current) { type = current; chosenBy = "kept"; }
  else {
    const rule = fallbackPosterAdType({ businessInfo: input.businessInfo, businessName: input.businessName, brief: input.brief });
    type = posterAdTypeById(rule.id) as PosterAdType;
    chosenBy = "rule";
    matched = rule.matched;
  }

  // The analysis's reason speaks for the type IT named: when that is not the type used, it is not shown.
  const ownReason = chosen && chosen.id === type.id ? modelLine(analysis?.reason || "", MAX_REASON_WORDS) : "";
  const reason = sentence(ownReason || (
    chosenBy === "rule"
      ? matched.length
        ? `The AI analysis did not answer, so the app's rule chose it — the business mentions ${matched.slice(0, 3).join(", ")}`
        : "The AI analysis did not answer, so the app's rule chose the benefit-led type that suits any business"
      : chosenBy === "fixed"
        ? "The style set for this poster, kept as chosen"
        : chosenBy === "kept"
          ? (input.currentReason || "").trim() || "The poster's current ad type, kept"
          : `It fits when ${type.fitsWhen}`
  ));
  const benefit = withoutEnding(modelLine(analysis?.benefit || "", MAX_BENEFIT_WORDS));

  const summary = analysis?.businessInformation?.trim()
    || fallbackPosterSummary({ businessInfo: input.businessInfo, businessName: input.businessName, brief: input.brief });
  // The verified numbers, each once — the Contact line prints them and the Format line counts them.
  const phones = uniquePosterContacts(input.phones);
  const allowed = phones.map((p) => phoneKey(digitsOf(p.display)));
  // The last line of defence, in the one assembly both poster systems use: a number in the business
  // name, the occasion or the wordmark that is not one of the verified ones does not reach the prompt.
  const businessInformation = stripUnverifiedNumbers(posterBusinessInformation({
    summary,
    businessName: input.businessName,
    occasion: input.occasion,
    occasionLine: input.occasionLine,
    phones,
    address: input.address,
  }), allowed);
  const format = stripUnverifiedNumbers(posterFormatLine({ ...input, contactCount: phones.length }), allowed);
  return {
    adType: type.id,
    adTypeName: type.name,
    reason,
    benefit,
    businessInformation,
    format,
    prompt: conceptPosterPrompt({ adTypeName: type.name, businessInformation, format }),
    chosenBy,
  };
}

/**
 * The stored shape (`PosterConcept`, saved in `ai_generations.posterConcepts`): the new fields, and the old
 * ones filled from them — title = the type's name, idea = the reason, whyItWorks = the benefit, imagePrompt =
 * the prompt — so anything that reads a concept the old way still shows something true. Every field is a
 * string: Firestore refuses `undefined`.
 */
export function conceptFromPoster(poster: ConceptPoster): PosterConcept {
  return {
    title: poster.adTypeName,
    style: poster.adType,
    idea: poster.reason,
    whyItWorks: poster.benefit,
    headline: "",
    imagePrompt: poster.prompt,
    adTypeName: poster.adTypeName,
    reason: poster.reason,
    benefit: poster.benefit,
    businessInformation: poster.businessInformation,
    format: poster.format,
    chosenBy: poster.chosenBy,
  };
}
