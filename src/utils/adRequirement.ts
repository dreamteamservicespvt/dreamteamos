/**
 * The ad brief, as one shared vocabulary.
 *
 * Model / attire / ratio / language used to be re-typed by the tech admin at assignment time,
 * with the labels and defaults copy-pasted into three pages. They are now captured once by the
 * sales member (who is the only person who actually spoke to the client) and travel
 * sale → order → work assignment. Everything about that spec — the options, the defaults, the
 * labels, and how a sold package becomes a video duration — lives here so the sales form and
 * the tech form can never drift apart.
 */
import { AttireType, ModelGender, ATTIRE_OPTIONS_BY_GENDER } from "@/types/aiPlatform";
import { DURATIONS, END_CREDITS_SECONDS, durationFromSeconds, getClipCount, hasPoster, priceForClips } from "./assignmentDuration";
import { PACKAGES, isAdCategory, categoryLabel, effectiveAdCategory, productionCategory } from "./serviceCatalog";
import { PRICING } from "./pricing";
import { getCharacterPack, isCustomPack, isHumanPack, packCastGender, packHighlight, packModelGender } from "@/services/characterPacks";
import { posterStyleLabel, AUTO_POSTER_STYLE } from "@/services/posterStyles";
import {
  DEFAULT_POSTER_SIZE, DEFAULT_POSTER_PRICE, POSTER_DURATION, isPosterCategory, posterSizeLabel,
} from "./posterSpec";
import type { AdRequirement, Order } from "@/types";

/** Human-readable label for each attire option — the one copy used everywhere. */
export const ATTIRE_LABELS: Record<AttireType, string> = {
  [AttireType.PROFESSIONAL]: "Professional (Formal Suit)",
  [AttireType.TRADITIONAL]: "Traditional (Designer Saree)",
  [AttireType.SHIRT_PANT]: "Professional (In-shirt & Pant)",
  [AttireType.CUSTOM]: "Custom",
};

/**
 * The languages the team sells in — always offered, always first. Lives here rather than in the
 * service so the pure helpers below can fall back to it without reaching for Firestore; the
 * service adds whatever customs have been saved on top (see services/adLanguages).
 */
export const BASE_AD_LANGUAGES = ["Telugu", "Hindi", "English", "Kannada", "Tamil", "Malayalam"] as const;

/** What the tech team gets when nobody says otherwise — mirrored by the sales-side form. */
export const DEFAULT_REQUIREMENT = {
  language: "Telugu",
  modelGender: ModelGender.FEMALE,
  attireType: AttireType.TRADITIONAL,
  customAttire: "",
  aspectRatio: "9:16" as const,
  notes: "",
};

/** The attire actually asked for, as text: the custom description when there is one. */
export function attireLabel(attire?: string | null, custom?: string | null): string {
  if (attire === AttireType.CUSTOM && custom?.trim()) return custom.trim();
  return ATTIRE_LABELS[(attire || AttireType.TRADITIONAL) as AttireType] || String(attire || "");
}

/** Keeps attire valid for the chosen model — a saree is not an option for a male model. */
export function attireForGender(gender: ModelGender, current: AttireType): AttireType {
  const allowed = ATTIRE_OPTIONS_BY_GENDER[gender];
  return allowed.includes(current) ? current : AttireType.PROFESSIONAL;
}

/**
 * The attire a male & female duo can be ordered in — one choice, dressed per person.
 *
 * Traditional reads as a designer saree on her and a kurta with a Nehru jacket on him; Professional
 * as a formal suit on each; Custom as the team's own words for both outfits. "Shirt & pant" is left
 * out because it only describes the man.
 */
export const MIXED_DUO_ATTIRE: AttireType[] = [AttireType.PROFESSIONAL, AttireType.TRADITIONAL, AttireType.CUSTOM];

/**
 * The attire options a form should offer, given the special category and the Model buttons.
 *
 * One rule for every form (the sale form, Work Assign, the assignment editors, the generator): no
 * pack → by the chosen model; a human entry → by the gender it casts; the male & female duo → the
 * options that dress both of them.
 */
export function attireOptionsFor(characterPack: string | null | undefined, modelGender: ModelGender): AttireType[] {
  const cast = packCastGender(getCharacterPack(characterPack));
  if (cast === "mixed") return MIXED_DUO_ATTIRE;
  return ATTIRE_OPTIONS_BY_GENDER[(cast as ModelGender | null) ?? modelGender];
}

/** How a form labels who the attire is for — "👩 female", "👨 male", "👩👨 woman & man". */
export function castLabelFor(characterPack: string | null | undefined, modelGender?: ModelGender | null): string {
  const pack = getCharacterPack(characterPack);
  const cast = pack ? packCastGender(pack) : (modelGender || ModelGender.FEMALE);
  const duo = !!pack && pack.characters.length > 1;
  if (cast === "mixed") return "👩👨 woman & man";
  if (cast === "male") return duo ? "👨👨 both men" : "👨 male";
  return duo ? "👩👩 both women" : "👩 female";
}

/** True for the entries whose cast the sales member describes in their own words. */
export function needsCharacterDescription(characterPack?: string | null): boolean {
  return isCustomPack(getCharacterPack(characterPack));
}

/** True when a job puts a real person (or two) on screen who can be dressed. */
export function isDressableSpec(characterPack?: string | null): boolean {
  const pack = getCharacterPack(characterPack);
  return !pack || isHumanPack(pack);
}

/**
 * The model and attire a job actually stores.
 *
 * A human-model special category ("Normal Ad (Female)", "Real Owner Face (Male)"…) decides the
 * gender by itself, so whatever the Model buttons last said is overridden by the entry — and the
 * attire is kept only if it suits that gender. Every form runs its values through this on save, so
 * a female entry can never be stored with "shirt & pant" left over from an earlier male choice.
 */
export function resolveModelSpec(spec: {
  characterPack?: string | null;
  modelGender: ModelGender;
  attireType: AttireType;
  customAttire?: string | null;
}): { modelGender: ModelGender; attireType: AttireType; customAttire: string } {
  const packGender = packModelGender(getCharacterPack(spec.characterPack));
  const modelGender = (packGender as ModelGender | null) ?? spec.modelGender;
  // A male & female duo has no single gender, so its attire is kept to the options that dress both.
  const options = attireOptionsFor(spec.characterPack, modelGender);
  const attireType = options.includes(spec.attireType) ? spec.attireType : (options[0] ?? AttireType.PROFESSIONAL);
  return {
    modelGender,
    attireType,
    customAttire: attireType === AttireType.CUSTOM ? (spec.customAttire || "").trim() : "",
  };
}

/**
 * Package labels that have left the price list, and the duration each one actually sold.
 *
 * Checked before the position and price lookups, because both of those would now answer wrongly.
 * A "40 Seconds" Wishes sale is ₹999, and ₹999 on today's Wishes list is "30 Seconds + Poster" —
 * so the price fallback would turn a 4-clip greeting with no poster into a 32-second job that owes
 * the client a poster nobody sold them.
 */
export const LEGACY_PACKAGE_DURATIONS: Record<string, Record<string, string>> = {
  wishes: { "20 Seconds": "20s", "40 Seconds": "40s" },
};

/**
 * The video duration a sold package buys.
 *
 * The sales catalog speaks in marketing terms ("30 Seconds + Poster") and the production side in
 * clip terms ("32s" = 4 clips). The catalog lists packages shortest-first in the same order as
 * DURATIONS, so position is the reliable mapping; price is the fallback when a package label has
 * been edited, and the shortest package the fallback of last resort.
 */
export function durationForSale(
  category: string,
  packageKey?: string | null,
  amount?: number,
  /**
   * A length typed on the sale, for a Custom order built on this category — a two-minute
   * promotional ad. It wins over the package lookup because there is no package: the whole point
   * of a Custom sale is that the client asked for a length the price list does not carry.
   */
  customDurationSeconds?: number | null,
): string {
  if (customDurationSeconds && customDurationSeconds > 0) return durationFromSeconds(customDurationSeconds);

  const durations = DURATIONS[category] || [];
  if (durations.length === 0) return "";

  const retired = packageKey ? LEGACY_PACKAGE_DURATIONS[category]?.[packageKey] : undefined;
  if (retired) return retired;

  const packages = PACKAGES[category] || [];
  const index = packageKey ? packages.findIndex((p) => p.label === packageKey) : -1;
  if (index >= 0 && durations[index]) return durations[index];

  if (amount && amount > 0) {
    const table = PRICING[category] || {};
    const byPrice = durations.find((d) => table[d] === amount);
    if (byPrice) return byPrice;
  }

  return durations[0];
}

/** A requirement with every blank filled in by the default — safe to render straight into a form. */
export function withRequirementDefaults(requirement?: AdRequirement | null) {
  return {
    businessName: requirement?.businessName?.trim() || "",
    businessWhatsapp: requirement?.businessWhatsapp?.trim() || "",
    businessAddress: requirement?.businessAddress?.trim() || "",
    businessInfo: requirement?.businessInfo?.trim() || "",
    language: requirement?.language?.trim() || DEFAULT_REQUIREMENT.language,
    modelGender: (requirement?.modelGender as ModelGender) || DEFAULT_REQUIREMENT.modelGender,
    attireType: (requirement?.attireType as AttireType) || DEFAULT_REQUIREMENT.attireType,
    customAttire: requirement?.customAttire?.trim() || "",
    aspectRatio: (requirement?.aspectRatio || DEFAULT_REQUIREMENT.aspectRatio) as "9:16" | "16:9",
    notes: requirement?.notes?.trim() || "",
    // Blank unless a wishes video was sold; there is deliberately no default occasion, because a
    // greeting video themed for the wrong festival is worse than one nobody has themed yet.
    festival: requirement?.festival?.trim() || "",
    specialCategory: requirement?.specialCategory?.trim() || "",
    customCharacter: requirement?.customCharacter?.trim() || "",
    // Asked on every ad now, not only a special-category one. An unanswered flag means "no photos
    // coming", which is the safe assumption to build on and what every ad sold before this in fact
    // got — a location built from the business profile.
    realLocationProvided: requirement?.realLocationProvided === true,
  };
}

/** Strips blanks so an untouched brief is stored as `null` rather than a bag of empty strings. */
export function cleanRequirement(requirement: AdRequirement): AdRequirement | null {
  const entries = Object.entries(requirement).filter(([, v]) => typeof v === "string" ? v.trim() !== "" : v != null);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries.map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])) as AdRequirement;
}

/** Categories the Work Assign form can hand out — the three ad kinds, and posters. */
export type AssignableCategory = "wishes" | "promotional" | "cinematic" | "poster";

/** The shape the Work Assign "Create New Assignment" form holds. */
export interface AssignmentFormSpec {
  category: AssignableCategory;
  duration: string;
  pricePerUnit: number;
  businessName: string;
  businessWhatsapp: string;
  modelGender: ModelGender;
  attireType: AttireType;
  customAttire: string;
  aspectRatio: "9:16" | "16:9";
  language: string;
  customLanguage: string;
  requirementNotes: string;
  /** The occasion a wishes video is for, as sold ("" for the other categories). */
  festival: string;
  /** Special-category cartoon duo sold for this job ("" for a normal human-model ad). */
  characterPack: string;
  /** For the Custom Character category: who the character is, in the sales member's words. */
  customCharacter: string;
  /** For a pack ad: whether the client is sending photos of their own premises. */
  realLocationProvided: boolean;
  /**
   * The sale's "Business info & what to include" — the client-facing brief the sales member wrote
   * (what the business does, the offer, the line the owner insists on). It used to stop at the
   * order: nothing copied it onto the assignment, so the requirements message the member receives
   * never carried it. See `buildAssignmentRequirementsMessage`.
   */
  businessInfo: string;
  /** Where the business is, from the sale. */
  businessAddress: string;
  /** Poster jobs only: canvas ("4:5", "5:7", "1080x1350"). */
  posterSize: string;
  /** Poster jobs only: services/posterStyles id, or "auto". */
  posterStyle: string;
  /** Poster jobs only: how many posters this job owes. */
  posterCount: number;
}

/** An empty New Assignment form — what the page opens on and resets to after creating a job. */
export function blankAssignmentForm(): AssignmentFormSpec & { assignedTo: string; clientName: string } {
  return {
    assignedTo: "",
    category: "promotional",
    duration: "16s",
    pricePerUnit: 499,
    clientName: "",
    businessName: "",
    businessWhatsapp: "",
    modelGender: ModelGender.FEMALE,
    attireType: AttireType.TRADITIONAL,
    customAttire: "",
    aspectRatio: "9:16",
    language: "Telugu",
    customLanguage: "",
    requirementNotes: "",
    festival: "",
    characterPack: "",
    customCharacter: "",
    realLocationProvided: false,
    businessInfo: "",
    businessAddress: "",
    posterSize: DEFAULT_POSTER_SIZE,
    posterStyle: AUTO_POSTER_STYLE,
    posterCount: 1,
  };
}

/**
 * What switching the form's category does to the length and the price.
 *
 * A poster has no length, so it stores POSTER_DURATION and is valued at the Standard poster price;
 * coming back from a poster opens on the category's first package. A custom clip count survives a
 * switch between two ad categories — only the price is re-derived.
 */
export function categorySwitch(
  prev: { category: string; duration: string },
  nextCategory: string,
): { duration: string; pricePerUnit: number } {
  if (isPosterCategory(nextCategory)) {
    return { duration: POSTER_DURATION, pricePerUnit: DEFAULT_POSTER_PRICE };
  }
  const nextDurations = DURATIONS[nextCategory] || [];
  const wasStandard = (DURATIONS[prev.category] || []).includes(prev.duration);
  const cameFromPoster = isPosterCategory(prev.category) || prev.duration === POSTER_DURATION;
  const duration = wasStandard || cameFromPoster || !prev.duration
    ? (nextDurations[0] || prev.duration)
    : prev.duration;
  return { duration, pricePerUnit: priceForClips(nextCategory, getClipCount(duration)) };
}

/**
 * A verified order, as a filled-in New Assignment form.
 *
 * Category and duration come from what was sold — never re-picked — and everything else from the
 * brief the sales member captured. The admin still sees the whole form and can change anything
 * before assigning; this only removes the re-typing.
 *
 * A non-ad order (website, logo…) has no ad category to map to, so it opens on `promotional` for
 * the admin to correct — the page shows the original service alongside it so nothing is hidden.
 *
 * A BULK order resolves to the kind of video it is made of. Passing `bulk_ads` through unchanged
 * (which it used to, since it counts as an ad category) left the form with no duration and a ₹0
 * unit price, because production speaks in the three real ad categories and knows no fourth.
 */
export function assignmentFormFromOrder(order: Order, knownLanguages?: string[]): AssignmentFormSpec {
  // `productionCategory` resolves BOTH of the sales-side conveniences: a bulk order to the kind of
  // video it is made of, and a Custom order to the real service it is a longer version of.
  const resolved = productionCategory(order);
  const r = withRequirementDefaults(order.requirement);

  /*
    A poster sale is a poster job. It used to open on "promotional" like every other non-ad order,
    which handed the member a two-clip video brief for a client who had paid for a poster.
  */
  if (isPosterCategory(resolved)) {
    const count = Math.max(1, order.quantity || 1);
    return {
      ...blankAssignmentForm(),
      category: "poster",
      duration: POSTER_DURATION,
      pricePerUnit: order.amount > 0 ? Math.round(order.amount / count) : DEFAULT_POSTER_PRICE,
      businessName: r.businessName || order.businessName || "",
      businessWhatsapp: r.businessWhatsapp || order.clientPhone || "",
      language: "English",
      customLanguage: "",
      requirementNotes: r.notes,
      festival: r.festival,
      businessInfo: r.businessInfo,
      businessAddress: r.businessAddress,
      posterCount: count,
    };
  }

  const category = (isAdCategory(resolved) ? resolved : "promotional") as AssignmentFormSpec["category"];
  const duration = durationForSale(category, order.packageKey, order.amount, order.customDurationSeconds);

  // A language the sales member typed is normally already in the shared list; if it somehow
  // isn't, it goes in through the form's own "Custom" slot rather than being dropped. Defaulting
  // to the base list matters: with an empty list even "Telugu" would look unknown.
  const list = knownLanguages?.length ? knownLanguages : [...BASE_AD_LANGUAGES];
  const known = list.some((l) => l.toLowerCase() === r.language.toLowerCase());

  return {
    category,
    duration,
    pricePerUnit: priceForClips(category, getClipCount(duration)),
    businessName: r.businessName || order.businessName || "",
    businessWhatsapp: r.businessWhatsapp || order.clientPhone || "",
    modelGender: r.modelGender,
    attireType: resolveModelSpec({ characterPack: r.specialCategory, modelGender: r.modelGender, attireType: r.attireType }).attireType,
    customAttire: r.customAttire,
    aspectRatio: r.aspectRatio,
    language: known ? r.language : "Custom",
    customLanguage: known ? "" : r.language,
    requirementNotes: r.notes,
    // Only a wishes video has an occasion. Carrying one onto a promotional ad would theme it for a
    // festival nobody bought, so a category change at assignment time drops it.
    festival: category === "wishes" ? r.festival : "",
    // A pack id sold before that duo was retired would otherwise open the form on a treatment the
    // generator no longer knows; resolving it here degrades to a normal ad instead of failing later.
    characterPack: getCharacterPack(r.specialCategory) ? r.specialCategory : "",
    customCharacter: needsCharacterDescription(r.specialCategory) ? r.customCharacter : "",
    realLocationProvided: r.realLocationProvided,
    businessInfo: r.businessInfo,
    businessAddress: r.businessAddress,
    posterSize: DEFAULT_POSTER_SIZE,
    posterStyle: AUTO_POSTER_STYLE,
    posterCount: 1,
  };
}

/**
 * The WhatsApp-ready requirements message for an assignment that already exists.
 *
 * The same block shown right after Create Assignment, but rebuilt from the saved assignment — so
 * it can be re-shared at any time from the member's assignment list, long after that popup was
 * dismissed. No price and no internal id: the member needs the spec and the access code.
 */
export function buildAssignmentRequirementsMessage(a: {
  businessName?: string;
  clientName?: string;
  category: string;
  duration: string;
  clipCount: number;
  modelGender?: string;
  attireType?: string;
  customAttire?: string;
  aspectRatio?: string;
  language?: string;
  requirementNotes?: string;
  accessCode?: string;
  characterPack?: string;
  /** Custom Character only: who the character is. */
  customCharacter?: string;
  realLocationProvided?: boolean;
  festival?: string;
  /** The sale's client-facing brief — "Business info & what to include". */
  businessInfo?: string;
  businessAddress?: string;
  posterSize?: string;
  posterStyle?: string;
  posterCount?: number;
}): string {
  const business = (a.businessName || a.clientName || "").trim();
  const notes = a.requirementNotes?.trim();
  const pack = getCharacterPack(a.characterPack);
  const festival = a.festival?.trim();
  const info = a.businessInfo?.trim();
  const address = a.businessAddress?.trim();

  /*
    What the business is and what the ad must carry — the sales member's own words from the call.

    This is the block that was missing. The sale captured it, the order kept it, and then the
    assignment dropped it, so every requirements message went out without the one paragraph that
    says what the client actually wants on screen. It sits above the internal notes because it is
    the brief; the notes are the asides.
  */
  const brief = [
    info ? `` : null,
    info ? `🏢 *Business info & what to include:*` : null,
    info ? info : null,
    address ? `📍 *Address:* ${address}` : null,
  ];
  const tail = [
    notes ? `` : null,
    notes ? `📝 *Client notes:* ${notes}` : null,
    ``,
    a.accessCode ? `🔑 *Access Code:* ${a.accessCode}` : null,
    a.accessCode ? `` : null,
    `🚀 Let's create something amazing — good luck! 🔥`,
  ];

  // A poster is briefed on its canvas, its style and its occasion — there is no clip, model or
  // voice-over to describe, and a video brief on a poster job is a brief the member cannot use.
  if (isPosterCategory(a.category)) {
    const count = a.posterCount && a.posterCount > 1 ? a.posterCount : 0;
    return [
      `🖼️✨ *NEW POSTER ASSIGNMENT* ✨🖼️`,
      ``,
      business ? `🏢 *Business:* ${business}` : null,
      `🎯 *Category:* ${categoryLabel(a.category)}`,
      festival ? `🎊 *Occasion:* ${festival}` : null,
      ``,
      `📋 *POSTER SPECIFICATION*`,
      `📐 *Size:* ${posterSizeLabel(a.posterSize)}`,
      `🎨 *Style:* ${posterStyleLabel(a.posterStyle)}`,
      count ? `🔢 *Posters:* ${count}` : null,
      a.language ? `🗣️ *Text language:* ${a.language}` : null,
      ...brief,
      ...tail,
    ].filter((l): l is string => l !== null).join("\n");
  }

  // A human-model entry ("Normal Ad (Female)"…) still has a person to dress, so its attire is
  // briefed like an ordinary ad's. Deities and cartoons come dressed.
  const dressable = !pack || isHumanPack(pack);
  const packGender = packModelGender(pack);
  const character = isCustomPack(pack) ? a.customCharacter?.trim() : "";
  return [
    `🎬✨ *NEW AD ASSIGNMENT* ✨🎬`,
    ``,
    business ? `🏢 *Business:* ${business}` : null,
    `🎯 *Category:* ${categoryLabel(a.category)}`,
    // The occasion decides the entire look of a greeting video, so it sits with the category
    // rather than down in the spec — it is what this job IS, not a detail of how to make it.
    festival ? `🎊 *Occasion:* ${festival}` : null,
    `⏱️ *Duration:* ${a.duration} (${a.clipCount} clips${hasPoster(a.duration) ? " + Poster" : ""} + ${END_CREDITS_SECONDS}s EC)`,
    ``,
    `📋 *AD SPECIFICATION*`,
    // A pack ad has no model and no attire to brief — what the member needs instead is who is on
    // screen and whether they must chase the client's location photos before they can start.
    // Given its own highlighted block: this job is made differently, and that has to be the first
    // thing the member notices in a thread of near-identical assignment messages.
    pack ? `🎭✨ *SPECIAL CATEGORY* ✨🎭` : null,
    pack ? `${packHighlight(pack)}` : null,
    // True of a duo and false of the other twenty-three entries — a brief that tells a member two
    // characters speak in an ad with one deity in it is a brief they stop trusting.
    // The custom entry has no cast of its own — the description IS the character, so it is the
    // first thing the member must read about this job.
    character ? `🎭 *Character:* ${character}` : null,
    pack ? (pack.characters.length > 1
      ? `💬 Both characters speak in every clip`
      : `💬 ${pack.characters[0].name} carries every clip alone`) : null,
    pack ? (a.realLocationProvided
      ? `📷 *Location:* the client's own photos — upload every photo they sent`
      : `🏙️ *Location:* build it from the business (client sent no photos)`) : null,
    !pack && a.modelGender ? `👤 *Model:* ${a.modelGender === "male" ? "Male" : "Female"}` : null,
    dressable && a.attireType
      // Only a duo names its cast here ("both women") — a single person's attire line reads as before.
      ? `👔 *Attire${pack && pack.characters.length > 1 ? ` (${castLabelFor(a.characterPack)})` : ""}:* ${attireLabel(resolveModelSpec({
          characterPack: a.characterPack,
          modelGender: (packGender as ModelGender | null) ?? ((a.modelGender as ModelGender) || ModelGender.FEMALE),
          attireType: a.attireType as AttireType,
        }).attireType, a.customAttire)}`
      : null,
    a.aspectRatio ? `📐 *Ratio:* ${a.aspectRatio}` : null,
    a.language ? `🗣️ *Language:* ${a.language}` : null,
    ...brief,
    ...tail,
  ].filter((l): l is string => l !== null).join("\n");
}

/**
 * The sale's business info, written as the generator's "Business Messages / Text Instructions".
 *
 * That box is what the generator reads to learn what the business does and what the ad must carry,
 * and the member used to retype the sales member's brief into it by hand — when they had it at all.
 * The AI Platform now opens a job with this already in the box (only when the box is empty, so
 * nothing a member typed is ever replaced). Empty when there is nothing to say.
 */
export function briefAsInstructions(
  businessInfo?: string | null,
  businessAddress?: string | null,
  /**
   * The rest of what the job says about the client. The business NAME is the one fact the model must
   * never guess — a run that read only a logo named the business after whatever the logo looked like.
   * The client's notes were shown on the member's job card and never reached the generator at all.
   * Both are optional, and absent they leave the text exactly as it always was.
   */
  extras: { businessName?: string | null; notes?: string | null } = {},
): string {
  const info = businessInfo?.trim();
  const address = businessAddress?.trim();
  const name = extras.businessName?.trim();
  const notes = extras.notes?.trim();
  if (!info && !address && !notes) return "";
  return [
    name ? `Business name: ${name}` : null,
    info ? `Business info & what to include (from the sale):\n${info}` : null,
    address ? `Address: ${address}` : null,
    notes ? `Client's notes (from the sale):\n${notes}` : null,
  ].filter(Boolean).join("\n\n");
}

/**
 * The job's brief, put into a BUSINESS CONTENT box the member may already have written in.
 *
 * The brief used to be re-applied only when the box was empty or still held exactly the old brief, so
 * a member who had added one line never received the admin's correction to the address — and nobody
 * told them. The old brief is now replaced where it stands inside their text; when it cannot be found
 * (they rewrote it), the corrected brief goes on top and their own writing stays below it.
 */
export function mergeBriefIntoInstructions(current: string, previousBrief: string, nextBrief: string): string {
  const text = current.trim();
  const before = previousBrief.trim();
  const next = nextBrief.trim();
  if (!next) return current;
  if (!text || text === before) return next;
  if (before && current.includes(before)) return current.replace(before, next);
  if (current.includes(next)) return current;
  return `${next}\n\n${current.trim()}`;
}

/**
 * One-line summary of a brief, for the Orders queue.
 *
 * A special-category ad has no human model, so the two slots that would describe one are reused to
 * say who IS on screen and where the location comes from — showing "👩 Female · Designer Saree"
 * beside a cartoon duo would describe a person who never appears.
 */
export function requirementSummary(requirement?: AdRequirement | null): string[] {
  const r = requirement;
  if (!r) return [];
  const pack = getCharacterPack(r.specialCategory);
  return [
    // First, because on a wishes order it is the thing the tech team needs to see at a glance.
    r.festival?.trim() ? `🎊 ${r.festival.trim()}` : null,
    r.language,
    pack ? `🎭 ${pack.label}`
      : r.modelGender === "male" ? "👨 Male" : r.modelGender === "female" ? "👩 Female" : null,
    pack ? (r.realLocationProvided ? "📷 Client's photos" : "🏙️ Location created")
      : r.attireType ? attireLabel(r.attireType, r.customAttire) : null,
    // A human-model entry is still a person in clothes — say which clothes.
    pack?.family === "human" && r.attireType ? attireLabel(r.attireType, r.customAttire) : null,
    r.aspectRatio,
  ].filter((v): v is string => !!v);
}
