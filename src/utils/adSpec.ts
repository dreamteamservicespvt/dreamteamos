/**
 * The ad a kit was made for — its configuration, recorded ON the kit and read by every step that
 * touches the kit afterwards (2026-10-08).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 * A kit's frames, voice-over and video prompts are made for ONE configuration. A Male & Female Duo
 * kit's frames show the woman and the man, its script gives each their own lines, and its video
 * prompts voice each one from their side of the frame. Everything done to a kit after the run — a
 * voice-over refine, a pasted final script, the missing video prompts written again, a frame refine,
 * the B-roll and overlays — used to take the configuration from the FORM as it stood at that moment,
 * which is a different thing: a member changes the special category or the language, a job's spec is
 * corrected by an admin after the kit was made, a saved kit is reopened under another job's form.
 * Read with a form that had no special category, the duo's script was handed to ONE presenter, labels
 * and all ("[Girl]: … [Boy]: …" in a single woman's voice), while the frames still showed the pair.
 * And every auto-save wrote the form's settings over the kit's, so the saved kit forgot what it was.
 *
 * Now the run writes the spec it actually used onto the kit (GeneratedOutputs.spec, saved with it as
 * `ai_generations.spec`), and every later step takes its configuration from `formForKit`. The form is
 * for the NEXT run; a kit is only ever worked on as what it is. A change to the job still shows as the
 * "made for … / the job now says …" banner, and Generate makes a new kit for it.
 *
 * Kept pure so the fields are tested one by one — a field missing here silently reverts to the form.
 */
import { AdType, AttireType, ModelGender, type AdFormData, type AspectRatio, type LocationMode } from "@/types/aiPlatform";

/** One 8-second clip — the unit every kit is counted in. */
const CLIP_SECONDS = 8;

export interface AdSpec {
  adType: string;
  festivalName: string;
  language: string;
  aspectRatio: AspectRatio;
  /** The presenter's gender for an ordinary ad; a human special category's own gender decides otherwise. */
  gender: ModelGender;
  attireType: string;
  customAttire: string;
  /** The special category (services/characterPacks id); "" for an ordinary ad with one model. */
  characterPack: string;
  /** Custom Character only: who the character is. */
  customCharacter: string;
  locationMode: LocationMode | "";
  noLogo: boolean;
  logoNameText: string;
  /** How many 8-second clips the kit has — its frames, script and video prompts. */
  clipCount: number;
}

const ratioOf = (value: unknown): AspectRatio => (value === "16:9" ? "16:9" : "9:16");
const genderOf = (value: unknown): ModelGender => (value === ModelGender.MALE ? ModelGender.MALE : ModelGender.FEMALE);
const locationOf = (value: unknown): LocationMode | "" =>
  value === "real_provided" || value === "ai_generated" ? value : "";

/** The spec a run is made with — the form at Start, with the clip count the run actually produced. */
export function adSpecOf(form: AdFormData, clipCount: number): AdSpec {
  return {
    adType: form.adType || AdType.COMMERCIAL,
    festivalName: form.festivalName || "",
    language: (form.language || "Telugu").trim() || "Telugu",
    aspectRatio: ratioOf(form.aspectRatio),
    gender: genderOf(form.gender),
    attireType: form.attireType || AttireType.TRADITIONAL,
    customAttire: form.customAttire || "",
    characterPack: form.characterPack || "",
    customCharacter: form.customCharacter || "",
    locationMode: locationOf(form.locationMode),
    noLogo: !!form.noLogo,
    logoNameText: form.logoNameText || "",
    clipCount: Math.max(1, Math.round(clipCount) || Math.round((form.duration || 16) / CLIP_SECONDS)),
  };
}

/** What a saved generation stored about itself — the fields adSpecFromSaved reads. */
export interface SavedSpecFields {
  spec?: AdSpec | null;
  adType?: string;
  festivalName?: string;
  language?: string;
  aspectRatio?: string;
  gender?: string;
  attireType?: string;
  customAttire?: string;
  characterPack?: string | null;
  customCharacter?: string;
  locationMode?: string | null;
  noLogo?: boolean;
  logoNameText?: string;
  duration?: number;
  mainFramePrompts?: string[];
  veoPrompts?: string[];
}

/**
 * The spec of a saved kit: the one it was saved with, or — for a kit saved before specs existed — the
 * settings stored beside it. Those were written from the form at each save, which is the best record an
 * older kit has; the cast check on its script (utils/dialogueFormat castScriptProblems) still refuses to
 * rewrite one whose script is not that cast's.
 */
export function adSpecFromSaved(item: SavedSpecFields): AdSpec {
  if (item.spec && typeof item.spec === "object" && typeof item.spec.clipCount === "number") return { ...item.spec };
  const clips = item.veoPrompts?.length || item.mainFramePrompts?.length || Math.max(1, Math.round((item.duration || 16) / CLIP_SECONDS));
  return {
    adType: item.adType || AdType.COMMERCIAL,
    festivalName: item.festivalName || "",
    language: (item.language || "Telugu").trim() || "Telugu",
    aspectRatio: ratioOf(item.aspectRatio),
    gender: genderOf(item.gender),
    attireType: item.attireType || AttireType.TRADITIONAL,
    customAttire: item.customAttire || "",
    characterPack: item.characterPack || "",
    customCharacter: item.customCharacter || "",
    locationMode: locationOf(item.locationMode),
    noLogo: !!item.noLogo,
    logoNameText: item.logoNameText || "",
    clipCount: clips,
  };
}

/**
 * The configuration a step working on THIS kit must use: the form, with every field that defines the ad
 * replaced by the kit's own. The brief (BUSINESS CONTENT, FRAME instructions) stays the form's — no step
 * after the run reads it. Without a spec (a poster, or nothing generated yet) the form is used as it is.
 */
export function formForKit(form: AdFormData, spec: AdSpec | null | undefined): AdFormData {
  if (!spec) return form;
  return {
    ...form,
    adType: spec.adType as AdType,
    festivalName: spec.festivalName,
    language: spec.language,
    aspectRatio: spec.aspectRatio,
    gender: spec.gender,
    attireType: spec.attireType as AttireType,
    customAttire: spec.customAttire,
    characterPack: spec.characterPack || undefined,
    customCharacter: spec.customCharacter,
    locationMode: spec.locationMode || undefined,
    noLogo: spec.noLogo,
    logoNameText: spec.logoNameText,
    duration: spec.clipCount * CLIP_SECONDS,
  };
}

/**
 * The settings a saved generation stores beside its outputs: the kit's own (its spec) when it has one —
 * never the form's, which may already describe the next ad — else the form's, as before.
 */
export function savedSettingsOf(form: AdFormData, spec: AdSpec | null | undefined) {
  const s = spec ?? adSpecOf(form, Math.max(1, Math.round((form.duration || 16) / CLIP_SECONDS)));
  return {
    adType: s.adType,
    festivalName: s.festivalName,
    characterPack: s.characterPack || null,
    customCharacter: s.customCharacter,
    locationMode: s.locationMode || null,
    gender: s.gender,
    attireType: s.attireType,
    customAttire: s.customAttire,
    duration: spec ? spec.clipCount * CLIP_SECONDS : form.duration,
    aspectRatio: s.aspectRatio,
    language: s.language,
    noLogo: s.noLogo,
    logoNameText: s.logoNameText,
  };
}
