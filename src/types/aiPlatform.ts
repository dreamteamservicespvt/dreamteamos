export enum AdType {
  COMMERCIAL = 'commercial',
  FESTIVAL = 'festival'
}

export enum AttireType {
  PROFESSIONAL = 'professional',
  TRADITIONAL = 'traditional'
}

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
