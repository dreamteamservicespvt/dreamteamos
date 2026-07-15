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
}

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
}

export interface GenerationStatus {
  step: string;
  isProcessing: boolean;
  error: string | null;
  progress: number;
}
