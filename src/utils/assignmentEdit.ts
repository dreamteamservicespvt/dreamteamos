/**
 * What an assignment editor writes back — the part that depends on what KIND of job it is.
 *
 * Three dialogs edit an assignment (the tech admin's and the team leader's member pages, and Work
 * Reports). Each builds its own patch for the fields it alone shows — the price, the member — and
 * takes this for the rest, so a poster edited on any of them stores a poster and an ad stores an ad.
 *
 *  - A poster job writes its canvas, style, count and occasion, and 0 clips. It clears the special
 *    category, because a poster has no one on screen.
 *  - An ad job writes its length, clip count and the ad spec — the model and attire run through
 *    `resolveModelSpec`, so a human-model special category keeps its own gender and a suitable
 *    attire.
 */
import type { WorkAssignment } from "@/types";
import type { AttireType, ModelGender } from "@/types/aiPlatform";
import { getClipCount } from "./assignmentDuration";
import { resolveModelSpec } from "./adRequirement";
import { DEFAULT_POSTER_SIZE, POSTER_DURATION, isPosterCategory } from "./posterSpec";
import { AUTO_POSTER_STYLE } from "@/services/posterStyles";
import { getCharacterPack, isCustomPack } from "@/services/characterPacks";

/** The poster half of an edit form. Carried on every form so switching category keeps it. */
export interface PosterEditFields {
  posterSize: string;
  posterStyle: string;
  posterCount: number;
  /** The occasion — the same field a wishes video uses. */
  festival: string;
}

export function posterEditFieldsOf(a: Pick<WorkAssignment, "posterSize" | "posterStyle" | "posterCount" | "festival">): PosterEditFields {
  return {
    posterSize: a.posterSize || DEFAULT_POSTER_SIZE,
    posterStyle: a.posterStyle || AUTO_POSTER_STYLE,
    posterCount: a.posterCount && a.posterCount > 0 ? a.posterCount : 1,
    festival: a.festival || "",
  };
}

export interface CategoryEditForm extends PosterEditFields {
  category: string;
  duration: string;
  modelGender: ModelGender;
  attireType: AttireType;
  customAttire: string;
  aspectRatio: "9:16" | "16:9";
  characterPack: string;
  realLocationProvided: boolean;
  /** Custom Character only: who the character is. Optional so older forms compile unchanged. */
  customCharacter?: string;
}

/** The kind-dependent fields to write. Never contains `undefined` — Firestore rejects it. */
export function categoryDependentPatch(form: CategoryEditForm): Record<string, unknown> {
  if (isPosterCategory(form.category)) {
    return {
      duration: POSTER_DURATION,
      clipCount: 0,
      posterSize: form.posterSize || DEFAULT_POSTER_SIZE,
      posterStyle: form.posterStyle || AUTO_POSTER_STYLE,
      posterCount: Math.max(1, Math.floor(form.posterCount) || 1),
      festival: form.festival.trim(),
      // Written unconditionally so a job turned into a poster sheds any duo it carried.
      characterPack: "",
    };
  }
  const model = resolveModelSpec(form);
  return {
    duration: form.duration,
    clipCount: getClipCount(form.duration),
    modelGender: model.modelGender,
    attireType: model.attireType,
    customAttire: model.customAttire,
    aspectRatio: form.aspectRatio,
    // Written unconditionally so clearing the special category actually clears it — a spread that
    // omits the field would leave the old duo on the job while the form showed none.
    characterPack: form.characterPack,
    // The description belongs to the custom entry alone; any other entry clears it, so a job moved
    // off "Custom Character" does not keep a description nobody will read.
    customCharacter: isCustomPack(getCharacterPack(form.characterPack)) ? (form.customCharacter || "").trim() : "",
    // Written on every ad, not only a pack one — a normal ad's background is a real field, and
    // gating it on the pack would reset it to "AI" on every unrelated edit.
    realLocationProvided: form.realLocationProvided === true,
  };
}
