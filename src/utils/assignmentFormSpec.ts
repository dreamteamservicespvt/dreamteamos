/**
 * What a job decides on the generator's form — ONE list, read by every path that puts values there.
 *
 * ── The bug this exists for ──────────────────────────────────────────────────────────────────────
 * An admin corrected the attire (or the ratio, the language, the special category…) of a job that was
 * already out, and the member's generator kept showing the old value. The live update itself worked:
 * the form was set to the new spec. But reopening a job also re-loads the kit it last generated, and
 * that restore wrote back EVERY setting the old kit was made with — attire, gender, ratio, language,
 * the pack, the festival, the background — a moment after the job's spec had been applied. The
 * fields then sat there "🔒 Fixed by assignment" showing a value the assignment no longer had, and
 * the member could not change them.
 *
 * So the job's spec is computed in one place, applied when the job opens or changes, and applied
 * AGAIN on top of anything restored. A saved kit decides only what the job leaves open.
 *
 * Kept pure so it can be tested field by field — a field missing here is a field that silently
 * reverts, which is exactly the fault being fixed.
 */
import type { WorkAssignment } from "@/types";
import { AdType, AttireType, type AdFormData, type LocationMode, type ModelGender } from "@/types/aiPlatform";
import { DEFAULT_POSTER_SIZE, isPosterCategory } from "./posterSpec";
import { AUTO_POSTER_STYLE } from "@/services/posterStyles";
import { CUSTOM_FESTIVAL_OPTION, WISHES_FESTIVALS } from "./festivals";
import { getClipCount } from "./assignmentDuration";
import { getCharacterPack, isCustomPack } from "@/services/characterPacks";
import type { AssignmentSpec, SpecChange } from "./assignmentSpecDiff";
import { describeSpecChanges } from "./assignmentSpecDiff";

/** The job's spec as the generator's form holds it. */
export interface AssignmentFormSpec {
  /** Only the fields this job actually specifies — an older job leaves the rest to the member. */
  form: Partial<AdFormData>;
  /** The festival picker's two pieces of state (the dropdown and the "other" box), when there is an occasion. */
  festivalPicker: { option: string; custom: string } | null;
  /** A poster job opens in Poster Creation and stays there. */
  poster: boolean;
}

/** How many clips a job buys — its own count, else its duration. */
export function jobClipCount(a: Pick<WorkAssignment, "clipCount" | "duration">): number {
  return a.clipCount || Math.max(1, getClipCount(a.duration || "16s"));
}

export function assignmentFormSpec(a: WorkAssignment): AssignmentFormSpec {
  const poster = isPosterCategory(a.category);
  const clips = jobClipCount(a);
  const seconds = Math.min(120, Math.max(8, clips * 8));
  const isPreset = [16, 32, 48, 64].includes(seconds);
  const festival = a.festival?.trim() || "";

  const form: Partial<AdFormData> = {
    duration: seconds,
    durationMode: isPreset ? "preset" : "custom",
    // Ad type is always implied by the category — the admin already decided Wishes vs Promotional.
    adType: a.category === "wishes" ? AdType.FESTIVAL : AdType.COMMERCIAL,
    // Each of these applies only when the job actually specifies it, so an assignment created before
    // these fields existed stays fully editable exactly as before.
    ...(a.modelGender ? { gender: a.modelGender as ModelGender } : {}),
    ...(a.attireType ? { attireType: a.attireType as AttireType } : {}),
    ...(a.attireType === AttireType.CUSTOM && a.customAttire ? { customAttire: a.customAttire } : {}),
    ...(a.aspectRatio ? { aspectRatio: a.aspectRatio } : {}),
    // On a poster job the language is the language of the words ON the poster.
    ...(a.language ? (poster ? { posterTextLanguage: a.language } : { language: a.language }) : {}),
    ...(poster ? {
      posterSize: a.posterSize || DEFAULT_POSTER_SIZE,
      posterStyle: a.posterStyle || AUTO_POSTER_STYLE,
      posterOccasion: festival,
    } : {}),
    // The occasion was agreed with the client at sale time and themes the entire ad.
    ...(festival ? { festivalName: festival } : {}),
    /*
      The special category is written EITHER WAY. A job with none is a normal ad, and a kit restored
      from when the job was a Motu & Patlu ad must not bring the duo back.
    */
    characterPack: a.characterPack || undefined,
    // Who a custom character is was said on the sale call; the member builds exactly that one.
    ...(isCustomPack(getCharacterPack(a.characterPack)) && a.customCharacter ? { customCharacter: a.customCharacter } : {}),
    /*
      Where the ad is set — carried on every ad job. An assignment made before this existed carries no
      flag, and the member chooses.
    */
    ...(a.realLocationProvided === undefined
      ? {}
      : { locationMode: (a.realLocationProvided ? "real_provided" : "ai_generated") as LocationMode }),
  };

  const festivalPicker = festival
    ? WISHES_FESTIVALS.includes(festival)
      ? { option: festival, custom: "" }
      : { option: CUSTOM_FESTIVAL_OPTION, custom: festival }
    : null;

  return { form, festivalPicker, poster };
}

/**
 * The spec a kit was generated FOR, in the same shape as the job's — from the form at Start, or from a
 * saved generation's stored settings. Anything unknown stays undefined and is never compared.
 */
export interface KitSettings {
  adType?: string;
  festivalName?: string;
  gender?: string;
  attireType?: string;
  customAttire?: string;
  aspectRatio?: string;
  language?: string;
  characterPack?: string | null;
  customCharacter?: string;
  locationMode?: string | null;
  posterSize?: string;
  posterStyle?: string;
  posterOccasion?: string;
  posterTextLanguage?: string;
}

export function kitSpec(settings: KitSettings, clipCount: number, poster = false): AssignmentSpec {
  const pack = getCharacterPack(settings.characterPack || undefined);
  if (poster) {
    return {
      category: "poster",
      posterSize: settings.posterSize,
      posterStyle: settings.posterStyle,
      festival: settings.posterOccasion ?? undefined,
      language: settings.posterTextLanguage,
    };
  }
  return {
    duration: clipCount > 0 ? `${clipCount * 8}s` : undefined,
    clipCount: clipCount > 0 ? clipCount : undefined,
    modelGender: settings.gender,
    attireType: settings.attireType,
    customAttire: settings.attireType === AttireType.CUSTOM ? settings.customAttire : undefined,
    aspectRatio: settings.aspectRatio,
    language: settings.language,
    festival: settings.adType === undefined ? undefined : settings.adType === AdType.FESTIVAL ? (settings.festivalName || "") : "",
    characterPack: settings.characterPack === undefined ? undefined : (settings.characterPack || ""),
    customCharacter: isCustomPack(pack) ? (settings.customCharacter || "") : undefined,
    realLocationProvided: settings.locationMode === undefined || settings.locationMode === null
      ? undefined
      : settings.locationMode === "real_provided",
  };
}

/** The job's own spec, on the same fields and scale as a kit's. */
export function jobKitSpec(a: WorkAssignment): AssignmentSpec {
  const poster = isPosterCategory(a.category);
  if (poster) {
    return {
      category: "poster",
      posterSize: a.posterSize || DEFAULT_POSTER_SIZE,
      posterStyle: a.posterStyle || AUTO_POSTER_STYLE,
      festival: a.festival?.trim() || "",
      language: a.language,
    };
  }
  const clips = jobClipCount(a);
  const pack = getCharacterPack(a.characterPack);
  return {
    duration: `${clips * 8}s`,
    clipCount: clips,
    modelGender: a.modelGender,
    attireType: a.attireType,
    customAttire: a.attireType === AttireType.CUSTOM ? a.customAttire : undefined,
    aspectRatio: a.aspectRatio,
    language: a.language,
    festival: a.category === "wishes" ? (a.festival?.trim() || "") : "",
    characterPack: a.characterPack || "",
    customCharacter: isCustomPack(pack) ? (a.customCharacter || "") : undefined,
    realLocationProvided: a.realLocationProvided,
  };
}

const COMPARED: (keyof AssignmentSpec)[] = [
  "duration", "clipCount", "modelGender", "attireType", "customAttire", "aspectRatio", "language", "festival",
  "characterPack", "customCharacter", "realLocationProvided", "category", "posterSize", "posterStyle",
];

const known = (v: unknown) => v !== undefined && v !== null;

/**
 * What differs between the kit on screen and the job as it stands — "Attire: Saree → Suit".
 *
 * Only fields BOTH sides state are compared: an older job with no attire leaves the attire to the
 * member, and an older saved kit with no stored ratio says nothing about the ratio. Empty when the kit
 * still matches.
 */
export function staleKitChanges(kit: AssignmentSpec | null | undefined, job: AssignmentSpec | null | undefined): SpecChange[] {
  if (!kit || !job) return [];
  const a: AssignmentSpec = {};
  const b: AssignmentSpec = {};
  for (const key of COMPARED) {
    const k = kit[key];
    const j = job[key];
    if (!known(k) || !known(j)) continue;
    // A job that states no attire (an empty string from an older form) leaves it open.
    if (typeof j === "string" && !j.trim() && key !== "festival" && key !== "characterPack") continue;
    (a as Record<string, unknown>)[key] = k;
    (b as Record<string, unknown>)[key] = j;
  }
  return describeSpecChanges(a, b);
}
