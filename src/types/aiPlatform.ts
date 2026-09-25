import type { CoreMessageBrief } from '@/services/prompts/coreMessage';
import type { ScriptQaSummary } from '@/utils/scriptQa';

export enum AdType {
  COMMERCIAL = 'commercial',
  FESTIVAL = 'festival'
}

export enum AttireType {
  /** Female: premium designer saree. */
  TRADITIONAL = 'traditional',
  /** Female & Male: premium tailored formal suit. */
  PROFESSIONAL = 'professional',
  /** Male: crisp formal shirt tucked into tailored formal trousers. */
  SHIRT_PANT = 'shirt_pant',
  /** Any gender: free-text attire described by the user. */
  CUSTOM = 'custom'
}

export enum ModelGender {
  FEMALE = 'female',
  MALE = 'male'
}

/** Attire options offered for each gender (drives the UI dropdown and validation). */
export const ATTIRE_OPTIONS_BY_GENDER: Record<ModelGender, AttireType[]> = {
  [ModelGender.FEMALE]: [AttireType.PROFESSIONAL, AttireType.TRADITIONAL, AttireType.CUSTOM],
  [ModelGender.MALE]: [AttireType.PROFESSIONAL, AttireType.SHIRT_PANT, AttireType.CUSTOM],
};

export enum DurationPackage {
  SHORT = 16,
  MEDIUM = 32,
  MEDIUM_LONG = 45,
  LONG = 64,
  CUSTOM = 0
}

export type AspectRatio = '9:16' | '16:9';

export interface AdFormData {
  adType: AdType;
  festivalName: string;
  attireType: AttireType;
  /** Model gender. Default "female" for backward compatibility. */
  gender?: ModelGender;
  /** Free-text attire description, used only when attireType === CUSTOM. */
  customAttire?: string;
  duration: number;
  durationMode: 'preset' | 'custom';
  /**
   * BUSINESS CONTENT — business details, the words the ad must carry, the call to action, contact
   * information. What the client sent, typed or pasted (including text Gemini extracted from a PDF).
   */
  textInstructions: string;
  /**
   * FRAME / BACKGROUND INSTRUCTIONS — how the frames should look: the background, the scene, the
   * style, the lighting and the colours. Kept apart from the business content because the two go to
   * different places: this steers every frame's background and the scene plan, and when it is empty
   * the scenes are worked out from the visiting card, the business content and the voice-over.
   */
  frameInstructions?: string;
  /**
   * What a "Custom Character" special category looks like and who it is, in the sales member's
   * words. The catalogue entry is written to derive everything from a description; this is it.
   */
  customCharacter?: string;
  /** Output aspect ratio for poster / header / main-frame prompts. Default 9:16. */
  aspectRatio: AspectRatio;
  /** Voice-over + on-screen language. Default "Telugu". */
  language: string;
  /** When true, no logo is provided — the business name is used as a name board instead. */
  noLogo?: boolean;
  /** Business name (forced UPPERCASE) used as a physical name board when noLogo is true. */
  logoNameText?: string;
  /**
   * Special-category treatment: the id of a cartoon duo from services/characterPacks (e.g.
   * `motu_patlu`). Undefined/empty means a normal human-model ad and the standard pipeline runs
   * completely untouched.
   */
  characterPack?: string;
  /**
   * Where a character-pack ad is set. `real_provided` builds every clip from the client's own
   * photographs (uploaded into the Store/Office Image slot); `ai_generated` builds the location
   * from the business profile. Ignored when no pack is selected.
   */
  locationMode?: LocationMode;
  /**
   * ── Poster Creation ──────────────────────────────────────────────────────────────────────
   * Only read when the creation mode is "poster". See utils/posterSpec and services/posterStyles.
   */
  /** Canvas as a stored string: "4:5" (default), a custom ratio "5:7", or pixels "1080x1350". */
  posterSize?: string;
  /** A services/posterStyles id, or "auto" for best fit. */
  posterStyle?: string;
  /** The occasion the poster is themed for — "" for a plain commercial poster. */
  posterOccasion?: string;
  /** How many distinct concepts to write (1–6, default 3). */
  posterConceptCount?: number;
  /** Language of the words printed on the poster (default English). */
  posterTextLanguage?: string;
}

/**
 * One poster idea, ready to run: the metaphor, the words, and a copy-paste image prompt.
 * Produced by geminiService.generatePosterConcepts and finalised by utils/posterConcepts.
 */
export interface PosterConcept {
  title: string;
  /** services/posterStyles id actually used. */
  style: string;
  /** The metaphor in one sentence. */
  idea: string;
  whyItWorks?: string;
  headline: string;
  subline?: string;
  /** The full image-generation prompt, opening with the canvas sentence. */
  imagePrompt: string;
  negativePrompt?: string;
}

export type LocationMode = 'real_provided' | 'ai_generated';

export interface FileStore {
  logo: File | null;
  /**
   * The business owner's own face, for a Real Owner Face special category. Its own slot rather than
   * a store photo: on every other ad a client photo is a LOCATION reference, and here this one photo
   * is the identity the whole ad is built from. Optional so older callers compile unchanged.
   */
  ownerImage?: File | null;
  visitingCard: File[];
  storeImage: File[];
  productImages: File[];
  flyersPosters: File[];
  voiceRecording: File[];
  textInstructionsFile: File[];
}

export interface OverlayTextItem {
  /** 1-based clip / segment number this overlay belongs to */
  clip: number;
  /** The short on-screen text (key point) */
  text: string;
  /** Suggested CapCut-searchable sound effect name */
  soundEffect: string;
  /** "Clip 2 · 8–16s" — where it goes, stamped from the script (utils/clipPlacement) */
  timing?: string;
  /** The spoken line this overlay sits over */
  line?: string;
  start?: number;
  end?: number;
  /** The words it comes up on and comes off on, quoted from that line (utils/wordTiming) */
  fromWord?: string;
  toWord?: string;
  /** "0:09.2 → 0:11.0 · from “X” to “Y”" — the whole instruction an editor reads */
  cueLabel?: string;
  cue?: { start: number; end: number; fromWord: string; toWord: string; matched: boolean };
  /**
   * The Overlay Text Image Generator's prompt: a short, clean image prompt for a premium 3D
   * transparent PNG of this overlay's text, themed to the business (or the festival). Absent on
   * overlays generated before the generator existed, which still show their text.
   */
  imagePrompt?: string;
  /** The look half of imagePrompt — what a Refine Prompt changes; the rest is fixed (utils/overlayImage). */
  imageDesign?: string;
}

/**
 * What the video is really about, and where each clip is set — decided once from the business
 * content, the frame instructions, the voice-over and the ad type, before any frame is written.
 * See services/prompts/scenePlan.
 */
export interface SceneContext {
  /** The motive in one line: "Annadanam — free food donation at the temple", "Birthday wishes". */
  motive: string;
  /** The kind of video: "business promotion", "temple introduction", "wedding invitation", … */
  category: string;
  /** The world the frames belong to: "inside a working bakery", "a decorated temple courtyard". */
  setting: string;
  /** The mood the frames and designs carry. */
  mood: string;
  /** Things that must never appear because they contradict the motive. */
  avoid: string[];
  /**
   * One background per clip, in clip order — each different, each proving that clip's line — and how
   * that clip is filmed: its staging (stand and tell, walk and talk, show the product…), camera move,
   * shot angle and, in a two-hander, whether the camera follows the speaker. The how-to-film fields are
   * validated against prompts/motion and fall back to the code plan when absent.
   */
  clips: {
    clip: number; background: string; elements: string[];
    staging?: string; camera?: string; angle?: string; focus?: string;
  }[];
}

/**
 * What the client's voice note says, heard and understood before anything is written.
 * See geminiService.understandVoiceInstructions.
 */
export interface VoiceBrief {
  /** Word for word, in the language spoken. */
  transcript: string;
  /** Plain-English summary of what the client wants. */
  summary: string;
  /** Specific requirements the client stated — offers, lines to say, things to show, tone. */
  requirements: string[];
  /** Where the voice note and the other material disagree, so nobody silently picks one. */
  conflicts: string[];
}

export interface GeneratedOutputs {
  businessInfo: any;
  mainFramePrompts: string[];
  headerPrompt: string;
  posterPrompt: string;
  voiceOverScript: string;
  veoPrompts: string[];
  hasProductImages: boolean;
  productImageCount: number;
  stockImagePrompts: any[] | null;
  /** Per-clip on-screen overlay texts with CapCut SFX suggestions (generated on demand). */
  overlayTexts?: OverlayTextItem[] | null;
  /** Poster Creation output — absent on video generations. */
  posterConcepts?: PosterConcept[] | null;
  /**
   * The core message the script was built on, decided from the client information, the Assets &
   * Files and the Configuration before writing. Kept so a refine holds to the same message.
   */
  coreMessage?: CoreMessageBrief | null;
  /** The video's context and the per-clip background plan the frames were written against. */
  sceneContext?: SceneContext | null;
  /** The client's voice note, transcribed and understood. Absent when none was attached. */
  voiceBrief?: VoiceBrief | null;
  /**
   * The voice-over's quality check: its score, whether it passed, and how many drafts it took (utils/
   * scriptQa). Absent for a member's own script — that is used word for word and never judged.
   */
  scriptQa?: ScriptQaSummary | null;
}

export interface GenerationStatus {
  step: string;
  isProcessing: boolean;
  error: string | null;
  progress: number;
}
