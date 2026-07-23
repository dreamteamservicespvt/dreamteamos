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
import { DURATIONS, getClipCount, priceForClips } from "./assignmentDuration";
import { PACKAGES, isAdCategory } from "./serviceCatalog";
import { PRICING } from "./pricing";
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
  };
}

/** One-line summary of a brief, for the Orders queue. */
export function requirementSummary(requirement?: AdRequirement | null): string[] {
  const r = requirement;
  if (!r) return [];
  return [
    r.language,
    r.modelGender === "male" ? "👨 Male" : r.modelGender === "female" ? "👩 Female" : null,
    r.attireType ? attireLabel(r.attireType, r.customAttire) : null,
    r.aspectRatio,
  ].filter((v): v is string => !!v);
}
