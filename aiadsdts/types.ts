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
  LONG = 64,
  CUSTOM = 0
}

export interface AdFormData {
  adType: AdType;
  festivalName: string;
  attireType: AttireType;
  duration: number; // Duration in seconds (must be multiple of 8)
  durationMode: 'preset' | 'custom'; // Whether using preset or custom duration
  textInstructions: string;
}

export interface FileStore {
  logo: File | null;
  visitingCard: File | null;
  storeImage: File | null;
  productImages: File[];
  flyersPosters: File[];
  voiceRecording: File | null;
  textInstructionsFile: File | null;
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
  stockImagePrompts: string[] | null;
}

export interface GenerationStatus {
  step: string;
  isProcessing: boolean;
  error: string | null;
  progress: number;
}
