import type { CoreMessageBrief } from '@/services/prompts/coreMessage';

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
  textInstructions: string;
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
}

export interface GenerationStatus {
  step: string;
  isProcessing: boolean;
  error: string | null;
  progress: number;
}
