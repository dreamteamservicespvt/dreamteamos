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
 *  5. A REFINE (owner, 2026-10-13: "poster refine prompt is not working") may also add a "Changes:" line —
 *     the team's design requests — leave out (or bring back) a verified number or the address, and change
 *     the language of the words. See refineConceptPoster.
 *
 * Pure: no React, no Firestore, no model. Every rule here is unit-tested (src/test/posterAdTypeOct12,
 * src/test/posterRefineOct13).
 */
import type { PosterConcept } from "@/types/aiPlatform";
import { parsePosterSize } from "./posterSpec";
import { digitsOf, findPhoneNumbers, MAX_CONTACT_NUMBERS, phoneKey, stripUnverifiedNumbers } from "./businessFacts";
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
  return withoutEnding(capWords(tidyPunctuation(withoutTypeNames(t)), MAX_SUMMARY_WORDS));
}

/** Every ad-type name taken out ("in a Shadow Metaphor Ads style") — the prompt names its one type once, in its first sentence. */
function withoutTypeNames(text: string): string {
  let t = text;
  for (const type of POSTER_AD_TYPES) {
    const core = escapeRegExp(type.name.replace(/\s+Ads$/i, "")).replace(/[-\s]+/g, "[\\s-]+");
    t = t.replace(new RegExp(`\\b(?:(?:in|as|using)\\s+(?:an?|the)\\s+)?${core}(?:\\s+ads?)?(?:\\s+style)?\\b`, "gi"), "");
  }
  return t;
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
 * order, with two types or with a double full stop. A refined poster may carry one "Changes:" line between
 * them (refineConceptPoster); a poster nobody refined has none, so it reads exactly as the owner wrote it.
 * A FESTIVAL poster (2026-10-22 — the owner: "the poster is not getting the related festival theme") carries one
 * "Festival:" line right after the three sentences (posterFestivalLine): the festival's own look, worked into the
 * one concept. The three sentences never change.
 */
export function conceptPosterPrompt(input: { adTypeName: string; businessInformation: string; format: string; changes?: string; festival?: string }): string {
  const type = withoutEnding(input.adTypeName);
  const info = withoutEnding(input.businessInformation.replace(/\s+/g, " "));
  const festival = withoutEnding((input.festival || "").replace(/\s+/g, " "));
  const changes = withoutEnding((input.changes || "").replace(/\s+/g, " "));
  const format = `${input.format.replace(/\s+/g, " ").trim().replace(/[\s.]+$/, "")}.`;
  return `${POSTER_PROMPT_LEAD} ${type}. Business Information: ${info}. ${POSTER_PROMPT_CLOSE}${festival ? `\n\nFestival: ${festival}.` : ""}${changes ? `\n\nChanges: ${changes}.` : ""}\n\nFormat: ${format}`;
}

/** What the Festival line needs of a festival's look (prompts.FestivalLook) — utils never reads the catalogue. */
export interface PosterFestivalLook {
  name: string;
  known: boolean;
  decorations: string;
  colours: string;
}

/**
 * The poster's Festival line (2026-10-22): the festival's decorations and colours worked into the ONE visual concept,
 * with its usual greeting allowed as the headline. An occasion the catalogue has no look for is named with its own
 * traditions. "" when there is no festival.
 */
export function posterFestivalLine(look: PosterFestivalLook | null | undefined): string {
  if (!look?.name?.trim()) return "";
  const name = look.name.trim();
  const unend = (t: string) => t.trim().replace(/[\s.;,]+$/, "");
  const a = /^[aeiou]/i.test(name) ? "an" : "a";
  return look.known
    ? `${a} ${name} poster in ${name}'s own look — ${unend(look.decorations)} worked into the one visual concept; colours ${unend(look.colours).replace(/^./, (c) => c.toLowerCase())}; ${name}'s usual greeting may be the headline`
    : `${a} ${name} poster in ${name}'s own traditional look and colours, worked into the one visual concept; its usual greeting may be the headline`;
}

const PROMPT_SHAPE = /^Create a minimalist and creative ad in (.+?)\. Business Information: ([\s\S]+?)\. Create one strong visual concept\/metaphor that communicates the main product\/service benefit\.(?:\n\nFestival: (.+))?(?:\n\nChanges: (.+))?\n\nFormat: (.+)$/;

export interface ConceptPosterParts {
  adTypeId: string;
  adTypeName: string;
  businessInformation: string;
  /** The Changes line without its closing full stop; "" when the poster carries none. */
  changes: string;
  /** The Festival line without its closing full stop; "" when the poster carries none (2026-10-22). */
  festival: string;
  format: string;
}

/** A prompt this system wrote, read back into its parts — null for anything else (an older long prompt). */
export function readConceptPosterPrompt(text: string): ConceptPosterParts | null {
  const m = PROMPT_SHAPE.exec((text || "").trim());
  if (!m) return null;
  const type = POSTER_AD_TYPES.find((t) => t.name === m[1]);
  if (!type) return null;
  return { adTypeId: type.id, adTypeName: type.name, businessInformation: m[2], festival: withoutEnding(m[3] || ""), changes: withoutEnding(m[4] || ""), format: m[5] };
}

/**
 * Longer than this is no longer "very short". A summary at its cap plus the name, the occasion, three
 * numbers and a long address stays under it; it is a guard against a broken assembly, not a style rule.
 * A refined poster may add its Changes line (at most MAX_CHANGES_WORDS, plus its label) on top.
 */
const MAX_PROMPT_WORDS = 200;
/** The Festival line's own allowance on top (posterFestivalLine is about 30–50 words). */
const MAX_FESTIVAL_WORDS = 70;

/** What is wrong with a poster prompt, in words — [] when it follows the owner's structure exactly. */
export function posterPromptProblems(text: string): string[] {
  const t = text ?? "";
  const problems: string[] = [];
  const m = PROMPT_SHAPE.exec(t);
  if (!m) problems.push("it does not follow the three sentences and the Format line");
  else {
    if (!POSTER_AD_TYPES.some((type) => type.name === m[1])) problems.push(`"${m[1]}" is not one of the eight ad types`);
    if (!withoutEnding(m[2])) problems.push("the business information is empty");
    if (m[3] !== undefined && !(withoutEnding(m[3]) && /\.$/.test(m[3].trim()))) problems.push("the Festival line is not one finished line");
    if (m[4] !== undefined && !(withoutEnding(m[4]) && /\.$/.test(m[4].trim()))) problems.push("the Changes line is not one finished line");
    if (!/\.$/.test(m[5].trim()) || m[5].includes("\n")) problems.push("the Format line is not one finished line");
  }
  const named = POSTER_AD_TYPES.reduce((n, type) => n + (t.split(type.name).length - 1), 0);
  if (named !== 1) problems.push(`it names ${named} ad types — exactly one is allowed`);
  if (/\.\s*\./.test(t)) problems.push("it has a double full stop");
  if (/[ \t]+$/m.test(t)) problems.push("a line ends in spaces");
  const words = t.split(/\s+/).filter(Boolean).length;
  const limit = MAX_PROMPT_WORDS + (m?.[3] ? MAX_FESTIVAL_WORDS + 1 : 0) + (m?.[4] ? MAX_CHANGES_WORDS + 1 : 0);
  if (words > limit) problems.push(`it is ${words} words long — at most ${limit}`);
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

/** A JSON object in a code fence, with a sentence around it, or bare — null when there is none. */
function readJsonObject(text: string): Record<string, unknown> | null {
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
  return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
}

const analysisOf = (r: Record<string, unknown>): PosterAnalysis => ({
  adType: resolvePosterAdTypeId(r.adType ?? r.ad_type ?? r.type ?? r.style ?? r.adTypeName),
  reason: str(r.reason) || str(r.why),
  benefit: str(r.benefit) || str(r.mainBenefit) || str(r.main_benefit),
  businessInformation: str(r.businessInformation) || str(r.business_information) || str(r.businessInfo) || str(r.summary),
});

/** The analysis's JSON — in a code fence, with a sentence around it, or as a bare object. Null when unreadable. */
export function parsePosterAnalysis(text: string): PosterAnalysis | null {
  const r = readJsonObject(text);
  return r ? analysisOf(r) : null;
}

/**
 * A refine's answer (2026-10-13): the analysis's four fields, plus what the refine may change besides them.
 * A field the answer leaves out is null / "" and means "as the poster has it now".
 */
export interface PosterRefineAnswer extends PosterAnalysis {
  /** The whole Changes line as it should now read ("" = no design requests); null = the line stays as it is. */
  changes: string | null;
  /** The verified numbers to print after the change, as the model copied them; null = as now. */
  numbers: string[] | null;
  /** Print the verified address (true) or leave it out (false); null = as now. */
  address: boolean | null;
  /** The language of the words on the poster, only when the request asks for another; "" = as now. */
  textLanguage: string;
  /** What part of the request could not be applied, in a sentence; "" when everything was. */
  notApplied: string;
}

const boolOf = (v: unknown): boolean | null => {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return null;
  if (/^\s*(?:true|yes)\s*$/i.test(v)) return true;
  return /^\s*(?:false|no)\s*$/i.test(v) ? false : null;
};

/** A refine's JSON — read like the analysis's. Null when unreadable. */
export function parsePosterRefineAnswer(text: string): PosterRefineAnswer | null {
  const r = readJsonObject(text);
  if (!r) return null;
  const changes = typeof r.changes === "string"
    ? r.changes.trim()
    : Array.isArray(r.changes) ? r.changes.filter((c): c is string => typeof c === "string").join(". ") : null;
  const rawNumbers = r.numbers ?? r.contactNumbers ?? r.phones;
  const numbers = Array.isArray(rawNumbers)
    ? rawNumbers.map((n) => (typeof n === "number" ? String(n) : typeof n === "string" ? n.trim() : "")).filter(Boolean)
    : null;
  return {
    ...analysisOf(r),
    changes,
    numbers,
    address: boolOf(r.address ?? r.printAddress),
    textLanguage: str(r.textLanguage) || str(r.language),
    notApplied: str(r.notApplied) || str(r.not_applied),
  };
}

/**
 * An answer worth using: it gave at least one field a refine reads. "{}" or broken JSON is not. A note alone
 * ({"notApplied": "The size comes from the Poster Size setting"}) is: the prompt stays and the member is told
 * why — it used to read as "Refinement failed" (the browser check, 2026-10-13).
 */
export const usablePosterRefine = (a: PosterRefineAnswer | null): a is PosterRefineAnswer =>
  !!a && (!!a.adType || !!a.businessInformation || a.changes !== null || a.numbers !== null || a.address !== null
    || !!a.textLanguage || !!a.notApplied);

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
  /** The Changes line a refine wrote (2026-10-13); "" for a poster nobody refined. */
  changes: string;
  /** The Festival line (2026-10-22); "" for a poster that is not for a festival. */
  festival: string;
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
  /** A refine's Changes line (cleanPosterChanges); absent or "" for a new poster. */
  changes?: string;
  /** The Festival line (posterFestivalLine) — a festival poster's own look (2026-10-22); absent or "" otherwise. */
  festival?: string;
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
  // The Contact segment is the one place a number is printed: a Changes line carries none, verified or not
  // (a number written twice is how an image tool draws it twice — the 2026-10-13 footer bug).
  const changes = withoutFormatRepeats(
    withoutEnding(tidyPunctuation(stripUnverifiedNumbers((input.changes || "").replace(/\s+/g, " ").trim(), []))),
    format,
  );
  // The Festival line carries no number either (it is code's, from the catalogue — the check is the last defence).
  const festival = withoutEnding(stripUnverifiedNumbers((input.festival || "").replace(/\s+/g, " ").trim(), allowed));
  return {
    adType: type.id,
    adTypeName: type.name,
    reason,
    benefit,
    businessInformation,
    changes,
    festival,
    format,
    prompt: conceptPosterPrompt({ adTypeName: type.name, businessInformation, format, changes, festival }),
    chosenBy,
  };
}

// ── a refine (2026-10-13) ──────────────────────────────────────────────────────────────────────

/*
  ── Why (the owner, 2026-10-13: "poster refine prompt is not working") ──
  Until then a refine could change two things only: the ad type, and the business summary — which may not
  describe a picture. Everything else was put back by code: the verified numbers and the address, the
  language from the form. So "use red and gold colours", "add the headline …", "make the logo bigger",
  "leave out the address" (the Refine box's own example) and "words in Telugu" all came back as the same
  prompt — silently in Poster Creation, and in the video row as "could not be applied without breaking the
  script's format". The owner's answers: the design requests go in ONE short "Changes:" line between the
  three sentences and the Format line (the three sentences stay word for word); a refine may leave out — or
  bring back — a verified number or the address, but never add one the business did not give.
*/

/** The longest a Changes line may be: short instructions to the designer, not a second art-directed prompt. */
export const MAX_CHANGES_WORDS = 50;

/** "the logo", "our brand logo", "logos" — said of a poster that has no logo file. */
const LOGO_WORD = /\b(?:(?:the|a|an|our|your|their|its)\s+)?(?:brand\s+|company\s+|business\s+)?logos?\b/gi;

/**
 * The model's Changes line, made safe to print: one line, no phone number (the Contact segment is the only
 * place one is printed), no labelled contact, email, website or the address, no ad-type name, at most
 * MAX_CHANGES_WORDS words, no sentence end of its own. Without a logo file the business name is the
 * wordmark, so "the logo" becomes "the business name" — naming a logo is how an image tool invents one.
 */
export function cleanPosterChanges(text: string, opts: { hasLogo: boolean; address?: string }): string {
  let t = (text || "")
    .replace(/```[a-z]*|```/gi, "")
    .replace(/^\s*changes?\s*[:\u{FF1A}]\s*/iu, "")
    // A list the model wrote ("- Use red\n- Add …", "1. …") becomes sentences.
    .replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "")
    .replace(/\s*[\r\n]+\s*(?:[-•*]|\d+[.)])?\s*/g, ". ");
  t = stripUnverifiedNumbers(t, []);
  t = t.replace(LABELLED_CONTACT, "$1").replace(EMAIL, "").replace(WEB_ADDRESS, "");
  const address = (opts.address || "").trim();
  if (address.length >= 6) t = t.replace(new RegExp(escapeRegExp(address), "gi"), "");
  t = withoutTypeNames(t);
  if (!opts.hasLogo) t = t.replace(LOGO_WORD, "the business name");
  const line = withoutEnding(capWords(tidyPunctuation(t), MAX_CHANGES_WORDS));
  // An instruction, as a sentence: the model wrote "deep blue background …" live.
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * The Changes line without a sentence the Format line already says. Live (2026-10-13) the model added 'Show the
 * business name "Sri Sai Mobiles" as a clean wordmark.' to the line on a colour request — the same instruction
 * twice. A sentence goes when every telling word of it is in the Format line; a real change always adds a word
 * of its own ("red", "headline", "Telugu").
 */
function withoutFormatRepeats(changes: string, format: string): string {
  if (!changes) return changes;
  // Marks kept inside a word: a Telugu headline ("దీపావళి ఆఫర్") is whole words, never fragments, so it always counts.
  const tokens = (text: string) => text.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  const formatWords = new Set(tokens(format));
  const kept = changes
    .split(/(?<=[.!?])\s+(?=["\u{201C}\p{Lu}])/u)
    .filter((s) => {
      const telling = tokens(s).filter((w) => w.length >= 3 || /[^\u{0}-\u{7F}]/u.test(w));
      return telling.length === 0 || !telling.every((w) => formatWords.has(w));
    });
  return withoutEnding(kept.join(" "));
}

/**
 * Words that ask about the poster's contact details. Only such a request may leave a number or the address
 * out, or bring one back: a model asked to "make the colours warmer" has been known to drop facts too.
 */
const CONTACT_CHANGE_WORDS = /\b(?:numbers?|phones?|mobiles?|contacts?|whats\s*app|calls?|landlines?|address(?:es)?|location)\b|నంబర్|నెంబర్|ఫోన్|అడ్రస్|చిరునామా|नंबर|फ़ोन|फोन/iu;

/** True when a refine request is about the poster's numbers or address (see CONTACT_CHANGE_WORDS). */
export const instructionTouchesContacts = (instruction: string): boolean => CONTACT_CHANGE_WORDS.test(instruction || "");

const keyOfNumber = (display: string) => phoneKey(digitsOf(display));

/** The contact details a poster prints as it stands — read from the Business Information it carries. */
export function printedPosterContacts(input: {
  /** The business's verified numbers (one to three) and address. */
  verified: PosterContact[];
  address: string;
  /** The prompt's Business Information now; null when the prompt is not one this system wrote (everything is printed). */
  currentBusinessInformation: string | null;
}): { phones: PosterContact[]; address: string } {
  const verified = uniquePosterContacts(input.verified);
  const address = (input.address || "").trim();
  if (input.currentBusinessInformation == null) return { phones: verified, address };
  const printed = new Set(findPhoneNumbers(input.currentBusinessInformation).map((n) => n.key));
  return {
    phones: verified.filter((p) => printed.has(keyOfNumber(p.display))),
    address: address && /(?:^|[.;]\s+)Address:\s/.test(input.currentBusinessInformation) ? address : "",
  };
}

/**
 * The contact details after a refine: as the prompt prints them now, unless the request is about them —
 * then the model's choice, taken only from the verified list (a number or address the business never gave
 * is never added; the member is told where to add it).
 */
export function refinedPosterContacts(input: {
  verified: PosterContact[];
  address: string;
  currentBusinessInformation: string | null;
  answer: Pick<PosterRefineAnswer, "numbers" | "address"> | null;
  instruction: string;
}): { phones: PosterContact[]; address: string; notes: string[] } {
  const verified = uniquePosterContacts(input.verified);
  const address = (input.address || "").trim();
  let { phones, address: printedAddress } = printedPosterContacts(input);
  const notes: string[] = [];
  if (input.answer && instructionTouchesContacts(input.instruction)) {
    if (input.answer.numbers) {
      const wanted = new Set(input.answer.numbers.map(keyOfNumber));
      phones = verified.filter((p) => wanted.has(keyOfNumber(p.display)));
    }
    if (input.answer.address !== null) printedAddress = input.answer.address ? address : "";
    if (input.answer.address === true && !address) {
      notes.push('This business has no verified address to print — type it as "Address: …" in BUSINESS CONTENT and press Generate.');
    }
  }
  const known = new Set(verified.map((p) => keyOfNumber(p.display)));
  const unknown = findPhoneNumbers(input.instruction || "").filter((n) => !known.has(n.key)).map((n) => n.display);
  if (unknown.length) {
    const one = unknown.length === 1;
    notes.push(`${unknown.join(", ")} ${one ? "is" : "are"} not one of this business's verified numbers, so the poster does not print ${one ? "it" : "them"} — add ${one ? "it" : "them"} to BUSINESS CONTENT and press Generate.`);
  }
  return { phones, address: printedAddress, notes };
}

/** "Words on the poster in Telugu." → "Telugu"; "" when the line says no language. */
export const formatLanguageOf = (format?: string | null): string => /Words on the poster in ([^.]+)\./.exec(format || "")?.[1]?.trim() || "";

/** A language name as the model wrote it, kept only when it reads as one ("Telugu", "English and Telugu"). */
function cleanLanguageName(value: string): string {
  // \p{M} too: a Telugu or Hindi name's vowel signs are marks, not letters.
  const t = (value || "").replace(/[^\p{L}\p{M}\s,&/+-]/gu, " ").replace(/\s+/g, " ").trim();
  return t && t.split(" ").length <= 5 ? t : "";
}

/** The request names that language, or asks about the language / script of the words. */
function instructionAsksForLanguage(instruction: string, language: string): boolean {
  const i = instruction || "";
  if (/\b(?:languages?|script|lipi)\b/i.test(i) || /తెలుగు|हिंदी|हिन्दी|தமிழ்|ಕನ್ನಡ|മലയാളം/u.test(i)) return true;
  return language.split(/[\s,&/+-]+/).filter((w) => w.length >= 4).some((w) => new RegExp(`\\b${escapeRegExp(w)}`, "i").test(i));
}

/**
 * The language of the words after a refine: the request's, when it asks for another; else the one the prompt
 * already says (a later refine about colours keeps it); else the form's.
 */
export function refinedTextLanguage(input: { currentFormat: string | null; asked: string; instruction: string; fallback: string }): string {
  const current = formatLanguageOf(input.currentFormat) || (input.fallback || "").trim() || "English";
  const asked = cleanLanguageName(input.asked);
  if (!asked || asked.toLowerCase() === current.toLowerCase()) return current;
  return instructionAsksForLanguage(input.instruction, asked) ? asked : current;
}

/** A note from the model that says nothing ("None", "All applied") is no note. */
const NOTHING_TO_REPORT = /^(?:not\s*applicable|n\/?a|none|nil|null|nothing\b.*|everything\b.*applied.*|all\b.*applied.*|-+)$/i;

export interface PosterRefineInput extends PosterFormatInput {
  answer: PosterRefineAnswer;
  instruction: string;
  /** The prompt as it stands, read back (readConceptPosterPrompt) — null for an older prompt. */
  current: ConceptPosterParts | null;
  /** Its Business Information when the prompt cannot be read back (a stored concept carries it). */
  currentBusinessInformation?: string;
  currentTypeId?: string | null;
  currentReason?: string;
  /** The main benefit the card shows now — kept when the answer names none (a refine often answers one field). */
  currentBenefit?: string;
  fixedTypeId?: string | null;
  /** The business's VERIFIED numbers and address — what a poster may print, at most. */
  verifiedPhones?: PosterContact[];
  verifiedAddress?: string;
  businessInfo?: unknown;
  businessName?: string;
  brief?: string;
  occasion?: string;
  occasionLine?: string;
  /** The Festival line a festival poster carries (posterFestivalLine) — used when the prompt has none yet. */
  festival?: string;
}

/**
 * A refine, decided and assembled: the type (changed only when asked, never a fixed one), the business
 * information (the answer's, else the current one), the Changes line (the answer's whole line, else the
 * current one), the contact details (as printed now, unless the request is about them) and the language of
 * the words (the request's, else the prompt's) — then the same assembly as a new poster. `notApplied` is
 * what the member is told could not be done.
 */
export function refineConceptPoster(input: PosterRefineInput): { poster: ConceptPoster; notApplied: string[] } {
  const { answer, instruction, current } = input;
  const kept = refineAnalysis(answer, { instruction, currentTypeId: input.currentTypeId, fixedTypeId: input.fixedTypeId });
  const currentInfo = current?.businessInformation ?? input.currentBusinessInformation ?? "";
  // A refine usually answers only what changed: what it leaves out is the card's as it was — the type's reason
  // (the same type named again without one is the type kept) and the main benefit.
  const sameTypeNoReason = !!kept?.adType && kept.adType === input.currentTypeId && !kept.reason;
  const analysis = kept && {
    ...kept,
    adType: sameTypeNoReason ? null : kept.adType,
    benefit: kept.benefit || input.currentBenefit || "",
    businessInformation: kept.businessInformation || currentInfo,
  };
  const contacts = refinedPosterContacts({
    verified: input.verifiedPhones || [],
    address: input.verifiedAddress || "",
    currentBusinessInformation: current ? current.businessInformation : null,
    answer,
    instruction,
  });
  const textLanguage = refinedTextLanguage({
    currentFormat: current?.format ?? null, asked: answer.textLanguage, instruction, fallback: input.textLanguage || "English",
  });
  const changes = cleanPosterChanges(answer.changes ?? current?.changes ?? "", { hasLogo: input.hasLogo, address: input.verifiedAddress });
  const poster = assembleConceptPoster({
    analysis,
    fixedTypeId: input.fixedTypeId,
    currentTypeId: input.currentTypeId,
    currentReason: input.currentReason,
    businessInfo: input.businessInfo,
    businessName: input.businessName,
    brief: input.brief,
    occasion: input.occasion,
    occasionLine: input.occasionLine,
    phones: contacts.phones,
    address: contacts.address,
    posterSize: input.posterSize,
    hasLogo: input.hasLogo,
    nameBoardText: input.nameBoardText,
    textLanguage,
    changes,
    festival: current?.festival || input.festival || "",
  });
  const modelNote = modelLine(answer.notApplied, 45);
  // The app's own contact note is exact (which number, where to add it); a model note about the same thing
  // only repeats it — seen live on "add 94401 23456 as another contact number".
  const repeatsContactNote = contacts.notes.length > 0 && instructionTouchesContacts(modelNote);
  const notApplied = [NOTHING_TO_REPORT.test(modelNote) || repeatsContactNote ? "" : sentence(modelNote), ...contacts.notes].filter(Boolean);
  return { poster, notApplied };
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
    changes: poster.changes,
    format: poster.format,
    chosenBy: poster.chosenBy,
  };
}
