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
import { DURATIONS, END_CREDITS_SECONDS, getClipCount, hasPoster, priceForClips } from "./assignmentDuration";
import { PACKAGES, isAdCategory, categoryLabel } from "./serviceCatalog";
import { PRICING } from "./pricing";
import { getCharacterPack, packHighlight } from "@/services/characterPacks";
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
 * The video duration a sold package buys.
 *
 * The sales catalog speaks in marketing terms ("30 Seconds + Poster") and the production side in
 * clip terms ("32s" = 4 clips). The catalog lists packages shortest-first in the same order as
 * DURATIONS, so position is the reliable mapping; price is the fallback when a package label has
 * been edited, and the shortest package the fallback of last resort.
 */
export function durationForSale(category: string, packageKey?: string | null, amount?: number): string {
  const durations = DURATIONS[category] || [];
  if (durations.length === 0) return "";

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
    language: requirement?.language?.trim() || DEFAULT_REQUIREMENT.language,
    modelGender: (requirement?.modelGender as ModelGender) || DEFAULT_REQUIREMENT.modelGender,
    attireType: (requirement?.attireType as AttireType) || DEFAULT_REQUIREMENT.attireType,
    customAttire: requirement?.customAttire?.trim() || "",
    aspectRatio: (requirement?.aspectRatio || DEFAULT_REQUIREMENT.aspectRatio) as "9:16" | "16:9",
    notes: requirement?.notes?.trim() || "",
    specialCategory: requirement?.specialCategory?.trim() || "",
    // Only meaningful for a special-category sale, and there the sales member always answers it —
    // so an unanswered flag means "no photos coming", which is the safe assumption to build on.
    realLocationProvided: requirement?.realLocationProvided === true,
  };
}

/** Strips blanks so an untouched brief is stored as `null` rather than a bag of empty strings. */
export function cleanRequirement(requirement: AdRequirement): AdRequirement | null {
  const entries = Object.entries(requirement).filter(([, v]) => typeof v === "string" ? v.trim() !== "" : v != null);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries.map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])) as AdRequirement;
}

/** The shape the Work Assign "Create New Assignment" form holds. */
export interface AssignmentFormSpec {
  category: "wishes" | "promotional" | "cinematic";
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
  /** Special-category cartoon duo sold for this job ("" for a normal human-model ad). */
  characterPack: string;
  /** For a pack ad: whether the client is sending photos of their own premises. */
  realLocationProvided: boolean;
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
 */
export function assignmentFormFromOrder(order: Order, knownLanguages?: string[]): AssignmentFormSpec {
  const category = (isAdCategory(order.category) ? order.category : "promotional") as AssignmentFormSpec["category"];
  const duration = durationForSale(category, order.packageKey, order.amount);
  const r = withRequirementDefaults(order.requirement);

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
    attireType: attireForGender(r.modelGender, r.attireType),
    customAttire: r.customAttire,
    aspectRatio: r.aspectRatio,
    language: known ? r.language : "Custom",
    customLanguage: known ? "" : r.language,
    requirementNotes: r.notes,
    // A pack id sold before that duo was retired would otherwise open the form on a treatment the
    // generator no longer knows; resolving it here degrades to a normal ad instead of failing later.
    characterPack: getCharacterPack(r.specialCategory) ? r.specialCategory : "",
    realLocationProvided: r.realLocationProvided,
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
  realLocationProvided?: boolean;
}): string {
  const business = (a.businessName || a.clientName || "").trim();
  const notes = a.requirementNotes?.trim();
  const pack = getCharacterPack(a.characterPack);
  return [
    `🎬✨ *NEW AD ASSIGNMENT* ✨🎬`,
    ``,
    business ? `🏢 *Business:* ${business}` : null,
    `🎯 *Category:* ${categoryLabel(a.category)}`,
    `⏱️ *Duration:* ${a.duration} (${a.clipCount} clips${hasPoster(a.duration) ? " + Poster" : ""} + ${END_CREDITS_SECONDS}s EC)`,
    ``,
    `📋 *AD SPECIFICATION*`,
    // A pack ad has no model and no attire to brief — what the member needs instead is who is on
    // screen and whether they must chase the client's location photos before they can start.
    // Given its own highlighted block: this job is made differently, and that has to be the first
    // thing the member notices in a thread of near-identical assignment messages.
    pack ? `🎭✨ *SPECIAL CATEGORY* ✨🎭` : null,
    pack ? `${packHighlight(pack)}` : null,
    pack ? `💬 Both characters speak in every clip` : null,
    pack ? (a.realLocationProvided
      ? `📷 *Location:* the client's own photos — upload every photo they sent`
      : `🏙️ *Location:* build it from the business (client sent no photos)`) : null,
    !pack && a.modelGender ? `👤 *Model:* ${a.modelGender === "male" ? "Male" : "Female"}` : null,
    !pack && a.attireType ? `👔 *Attire:* ${attireLabel(a.attireType, a.customAttire)}` : null,
    a.aspectRatio ? `📐 *Ratio:* ${a.aspectRatio}` : null,
    a.language ? `🗣️ *Language:* ${a.language}` : null,
    notes ? `` : null,
    notes ? `📝 *Client notes:* ${notes}` : null,
    ``,
    a.accessCode ? `🔑 *Access Code:* ${a.accessCode}` : null,
    a.accessCode ? `` : null,
    `🚀 Let's create something amazing — good luck! 🔥`,
  ].filter((l): l is string => l !== null).join("\n");
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
    r.language,
    pack ? `🎭 ${pack.label}`
      : r.modelGender === "male" ? "👨 Male" : r.modelGender === "female" ? "👩 Female" : null,
    pack ? (r.realLocationProvided ? "📷 Client's photos" : "🏙️ Location created")
      : r.attireType ? attireLabel(r.attireType, r.customAttire) : null,
    r.aspectRatio,
  ].filter((v): v is string => !!v);
}
