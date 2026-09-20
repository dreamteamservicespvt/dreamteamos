// ── Cinematic Ads Pipeline Types ──

export const PIPELINE_STEPS = [
  { number: 0, label: "Client Onboarding", shortLabel: "Brief" },
  { number: 1, label: "Story & Voice Over", shortLabel: "Story" },
  { number: 2, label: "Storyboard Preview", shortLabel: "Board" },
  { number: 3, label: "Casting", shortLabel: "Cast" },
  { number: 4, label: "Clips", shortLabel: "Clips" },
  { number: 5, label: "Editing Guide", shortLabel: "Edit" },
  { number: 6, label: "Review & Delivery", shortLabel: "Deliver" },
] as const;

export type PipelineStepNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ── Ad Format ──
//
// The single most important input. It decides whether characters speak on camera (which
// forces lip-sync and therefore Veo), whether casting is needed at all, what shape the
// voice over takes, and how the ad gets cut into clips. Everything downstream reads the
// preset table below instead of re-deciding these rules inside prompt strings.

export type AdFormatId =
  | "ai_decides"
  // Dialogue-led — characters speak on camera, lip-sync required
  | "two_person_conversation"
  | "one_person_to_camera"
  | "multi_character_dialogue"
  | "interview_vox_pop"
  // Voice-over led — no lip-sync
  | "one_person_action_vo"
  | "multi_character_action_vo"
  | "pure_cinematic_no_people"
  | "slice_of_life"
  // Structure-led — the shape drives the ad
  | "problem_solution"
  | "transformation"
  | "offer_launch"
  | "fast_cut_montage";

export type AdFormatFamily = "ai" | "dialogue" | "voiceover" | "structure";

export const AD_FORMAT_FAMILIES: { family: AdFormatFamily; label: string; hint: string }[] = [
  { family: "ai", label: "Let AI decide", hint: "Reads the brief, picks a format, and tells you why" },
  { family: "dialogue", label: "Dialogue-led", hint: "Characters speak on camera — lip-sync, Veo only, casting required" },
  { family: "voiceover", label: "Voice-over led", hint: "No lip-sync — the safest route to a cinematic look" },
  { family: "structure", label: "Structure-led", hint: "The shape of the ad drives it; voice or dialogue rides on top" },
];

/** How much casting work a format needs. `none` skips the Casting step entirely. */
export type CastingRequirement = "required" | "optional" | "none";

/** `dialogue` scripts are speaker-labelled; `narration` is a single voice over picture. */
export type VoForm = "dialogue" | "narration";

/** Lip-sync needs Veo's synchronised dialogue; everything else can use cheaper Grok. */
export type AnimationPlatformPolicy = "veo_only" | "either";

export type ClipType = "single" | "start_end" | "storyboard";

export interface AdFormatPreset {
  id: AdFormatId;
  family: AdFormatFamily;
  label: string;
  description: string;
  /** Shown under the format so the operator knows what they are committing to. */
  bestFor: string;
  castingRequirement: CastingRequirement;
  defaultClipType: ClipType;
  voForm: VoForm;
  animationPlatform: AnimationPlatformPolicy;
  /** Target seconds per clip — the clip count is the duration divided by this. */
  secondsPerClip: number;
  supportsPairing?: boolean;
  supportsSpeakerRole?: boolean;
  supportsCharacterCount?: boolean;
}

export const AD_FORMAT_PRESETS: AdFormatPreset[] = [
  {
    id: "ai_decides",
    family: "ai",
    label: "Let AI decide",
    description: "The brief, business type and your note decide the format.",
    bestFor: "When you want a recommendation before committing",
    castingRequirement: "optional",
    defaultClipType: "single",
    voForm: "narration",
    animationPlatform: "either",
    secondsPerClip: 6,
  },

  // ── Dialogue-led ──
  {
    id: "two_person_conversation",
    family: "dialogue",
    label: "Two-person conversation",
    description: "Two characters talk to each other on camera. Their exchange carries the ad.",
    bestFor: "Explaining a service through a natural back-and-forth",
    castingRequirement: "required",
    defaultClipType: "single",
    voForm: "dialogue",
    animationPlatform: "veo_only",
    secondsPerClip: 6,
    supportsPairing: true,
  },
  {
    id: "one_person_to_camera",
    family: "dialogue",
    label: "One person to camera",
    description: "A single person speaks straight to the viewer — the owner, or a customer.",
    bestFor: "Trust: a founder's promise, or a customer's testimonial",
    castingRequirement: "required",
    defaultClipType: "single",
    voForm: "dialogue",
    animationPlatform: "veo_only",
    secondsPerClip: 6,
    supportsSpeakerRole: true,
  },
  {
    id: "multi_character_dialogue",
    family: "dialogue",
    label: "Multi-character mini-film",
    description: "Three or more speaking characters in a short narrative with a turn.",
    bestFor: "Emotional storytelling with a cast",
    castingRequirement: "required",
    defaultClipType: "single",
    voForm: "dialogue",
    animationPlatform: "veo_only",
    secondsPerClip: 6,
    supportsCharacterCount: true,
  },
  {
    id: "interview_vox_pop",
    family: "dialogue",
    label: "Interview / vox pop",
    description: "Several people answer the same question, cut together.",
    bestFor: "Documentary-style authenticity and social proof",
    castingRequirement: "required",
    defaultClipType: "single",
    voForm: "dialogue",
    animationPlatform: "veo_only",
    secondsPerClip: 5,
    supportsCharacterCount: true,
  },

  // ── Voice-over led ──
  {
    id: "one_person_action_vo",
    family: "voiceover",
    label: "One person in action + voice over",
    description: "One person is seen doing things while a voice carries the message.",
    bestFor: "The best quality per rupee — no lip-sync to go wrong",
    castingRequirement: "required",
    defaultClipType: "start_end",
    voForm: "narration",
    animationPlatform: "either",
    secondsPerClip: 6,
  },
  {
    id: "multi_character_action_vo",
    family: "voiceover",
    label: "Multiple characters in action + voice over",
    description: "An ensemble is seen in motion; narration ties the moments together.",
    bestFor: "Showing a team, a family, or a busy place",
    castingRequirement: "required",
    defaultClipType: "start_end",
    voForm: "narration",
    animationPlatform: "either",
    secondsPerClip: 6,
    supportsCharacterCount: true,
  },
  {
    id: "pure_cinematic_no_people",
    family: "voiceover",
    label: "Pure cinematic — no people",
    description: "Product, place, food or craft shot beautifully, with narration over it.",
    bestFor: "Jewellery, food, interiors, real estate — no face consistency risk",
    castingRequirement: "none",
    defaultClipType: "start_end",
    voForm: "narration",
    animationPlatform: "either",
    secondsPerClip: 5,
  },
  {
    id: "slice_of_life",
    family: "voiceover",
    label: "Slice of life",
    description: "Follow one person through their day; the brand appears where it belongs.",
    bestFor: "Making an everyday need feel personal",
    castingRequirement: "required",
    defaultClipType: "storyboard",
    voForm: "narration",
    animationPlatform: "either",
    secondsPerClip: 6,
  },

  // ── Structure-led ──
  {
    id: "problem_solution",
    family: "structure",
    label: "Problem to Solution",
    description: "The first half hurts, the second half fixes it.",
    bestFor: "Services people only buy once something goes wrong",
    castingRequirement: "optional",
    defaultClipType: "start_end",
    voForm: "narration",
    animationPlatform: "either",
    secondsPerClip: 6,
  },
  {
    id: "transformation",
    family: "structure",
    label: "Transformation — before to after",
    description: "One subject visibly changes across the ad.",
    bestFor: "Salon, dental, fitness, interiors, construction",
    castingRequirement: "optional",
    defaultClipType: "start_end",
    voForm: "narration",
    animationPlatform: "either",
    secondsPerClip: 5,
  },
  {
    id: "offer_launch",
    family: "structure",
    label: "Offer / launch / festival",
    description: "One urgent message, said fast, with the offer on screen.",
    bestFor: "Festival offers, openings, limited sales",
    castingRequirement: "optional",
    defaultClipType: "storyboard",
    voForm: "narration",
    animationPlatform: "either",
    secondsPerClip: 4,
  },
  {
    id: "fast_cut_montage",
    family: "structure",
    label: "Fast-cut montage",
    description: "Music-led rapid cuts with text punches and little narration.",
    bestFor: "Gyms, events, showrooms, anything with energy",
    castingRequirement: "optional",
    defaultClipType: "storyboard",
    voForm: "narration",
    animationPlatform: "either",
    secondsPerClip: 4,
  },
];

export function adFormatPreset(id: AdFormatId): AdFormatPreset {
  return AD_FORMAT_PRESETS.find((p) => p.id === id) || AD_FORMAT_PRESETS[0];
}

export type GenderPairing = "female_female" | "male_female" | "male_male";

export const GENDER_PAIRINGS: { value: GenderPairing; label: string }[] = [
  { value: "female_female", label: "Both female" },
  { value: "male_female", label: "Male and female" },
  { value: "male_male", label: "Both male" },
];

export type Gender = "male" | "female";
export type ToCameraSpeaker = "owner" | "customer";

export const TO_CAMERA_SPEAKERS: { value: ToCameraSpeaker; label: string }[] = [
  { value: "owner", label: "Owner / founder" },
  { value: "customer", label: "Customer testimonial" },
];

export interface AdFormatSelection {
  formatId: AdFormatId;
  /** Two-person conversation only. */
  pairing?: GenderPairing;
  /** One person to camera only. */
  speakerRole?: ToCameraSpeaker;
  speakerGender?: Gender;
  /** Formats with a cast of unspecified size. */
  characterCount?: number;
  /** Filled in by the AI when `formatId` is `ai_decides`. */
  aiChosenFormatId?: AdFormatId;
  aiChoiceReason?: string;
}

export function emptyAdFormatSelection(): AdFormatSelection {
  return { formatId: "ai_decides" };
}

/**
 * The preset that actually governs the pipeline.
 *
 * "Let AI decide" is a request, not an answer — once the AI names a format we must follow
 * THAT format's rules. Otherwise an AI-chosen two-person conversation would quietly skip
 * casting and get animated on Grok, which has no lip-sync at all.
 */
export function effectiveAdFormatPreset(selection: AdFormatSelection | null | undefined): AdFormatPreset {
  if (!selection) return AD_FORMAT_PRESETS[0];
  if (selection.formatId === "ai_decides" && selection.aiChosenFormatId) {
    return adFormatPreset(selection.aiChosenFormatId);
  }
  return adFormatPreset(selection.formatId);
}

/** A human sentence describing the selection, for prompts and for the brief summary. */
export function describeAdFormat(selection: AdFormatSelection | null | undefined): string {
  if (!selection) return AD_FORMAT_PRESETS[0].label;
  const preset = effectiveAdFormatPreset(selection);
  const bits: string[] = [preset.label];

  if (preset.supportsPairing && selection.pairing) {
    bits.push(GENDER_PAIRINGS.find((p) => p.value === selection.pairing)?.label || "");
  }
  if (preset.supportsSpeakerRole && selection.speakerRole) {
    const role = TO_CAMERA_SPEAKERS.find((s) => s.value === selection.speakerRole)?.label;
    bits.push([role, selection.speakerGender].filter(Boolean).join(", "));
  }
  if (preset.supportsCharacterCount && selection.characterCount) {
    bits.push(`${selection.characterCount} characters`);
  }
  if (selection.formatId === "ai_decides" && selection.aiChosenFormatId) {
    bits.push("chosen by AI");
  }

  return bits.filter(Boolean).join(" — ");
}

/** How many clips a duration should be cut into under this format. */
export function suggestedClipCount(preset: AdFormatPreset, durationSeconds: number): number {
  return Math.max(2, Math.round(durationSeconds / preset.secondsPerClip));
}

// ── Step 0: Client Onboarding ──

export type FileCategory =
  | "logo"
  | "visiting_card"
  | "voice_recording"
  | "script"
  | "business_doc"
  | "reference"
  | "brand_guidelines";

export interface UploadedFile {
  id: string;
  /** Absent once a project has been reloaded from storage — `url` is then the truth. */
  file?: File;
  name: string;
  type: string;
  url?: string;
  category: FileCategory;
}

export type TargetPlatform =
  | "youtube"
  | "instagram_reels"
  | "instagram_feed"
  | "tv_broadcast"
  | "whatsapp_status"
  | "facebook";

export const TARGET_PLATFORMS: { value: TargetPlatform; label: string }[] = [
  { value: "youtube", label: "YouTube" },
  { value: "instagram_reels", label: "Instagram Reels" },
  { value: "instagram_feed", label: "Instagram Feed" },
  { value: "tv_broadcast", label: "TV / Broadcast" },
  { value: "whatsapp_status", label: "WhatsApp Status" },
  { value: "facebook", label: "Facebook" },
];

export const DURATION_OPTIONS = [30, 45, 60, 90] as const;

export const LANGUAGES = [
  "Telugu",
  "Hindi",
  "English",
  "Tamil",
  "Kannada",
  "Malayalam",
  "Marathi",
  "Bengali",
  "Gujarati",
  "Punjabi",
  "Urdu",
] as const;

export const FILE_CATEGORIES_INFO: {
  category: FileCategory;
  label: string;
  required: boolean;
  accept: string;
  description: string;
}[] = [
  { category: "logo", label: "Business Logo", required: true, accept: ".png,.svg,.jpg,.jpeg,.ai", description: "PNG, SVG, JPG, AI" },
  { category: "visiting_card", label: "Visiting Card", required: true, accept: ".png,.jpg,.jpeg,.pdf", description: "PNG, JPG, PDF" },
  { category: "voice_recording", label: "Client Voice Recording", required: false, accept: ".mp3,.wav,.m4a,.ogg", description: "MP3, WAV, M4A, OGG — Highly Recommended" },
  { category: "script", label: "Desired Story / Script", required: false, accept: ".txt,.docx", description: "TXT, DOCX" },
  { category: "business_doc", label: "Business Details Document", required: false, accept: ".pdf,.docx,.txt", description: "PDF, DOCX, TXT" },
  { category: "reference", label: "Reference Ads / Inspiration", required: false, accept: ".mp4,.jpg,.jpeg,.png", description: "MP4, JPG, PNG or URLs" },
  { category: "brand_guidelines", label: "Brand Guidelines", required: false, accept: ".pdf", description: "PDF" },
];

export interface ClientBrief {
  businessName: string;
  businessType: string;
  coreServices: string;
  targetAudience: string;
  keyMessage: string;
  toneAndStyle: string;
  brandColors: string[];
  duration: number;
  platforms: TargetPlatform[];
  language: string;
  dialect: string;
  /** Carried through from the operator's typed input so later prompts still see it. */
  clientRequirement?: string;
  ourNote?: string;
}

// ── Step 1: Story & Voice Over ──

export interface Scene {
  sceneNumber: number;
  duration: string;
  visualDescription: string;
  cameraDirection: string;
  voiceoverText: string;
  voiceoverTone: string;
  emotionalBeat: string;
  soundDesignNotes: string;
}

/** One spoken line. `speaker` is set for dialogue formats and absent for narration. */
export interface VoLine {
  sceneNumber: number;
  speaker?: string;
  text: string;
  tone: string;
}

export interface Story {
  id: string;
  title: string;
  conceptSummary: string;
  emotionalArc: string;
  /** Why a viewer feels this — what separates a real ad from a showcase reel. */
  whyItLands?: string;
  totalDuration: string;
  numberOfScenes: number;
  scenes: Scene[];
  /** The whole ad's voice over as one copyable script. */
  voScript?: string;
  voLines?: VoLine[];
}

export type StoryTone = "emotional" | "humorous" | "corporate" | "inspirational" | "dramatic";

export const STORY_TONES: { value: StoryTone; label: string }[] = [
  { value: "emotional", label: "Emotional" },
  { value: "humorous", label: "Humorous" },
  { value: "corporate", label: "Corporate" },
  { value: "inspirational", label: "Inspirational" },
  { value: "dramatic", label: "Dramatic" },
];

// ── Step 2: Storyboard Preview ──

/**
 * Nine is a hard ceiling, not a preference: past nine panels an image model stops
 * honouring the panel layout and the board becomes useless as a reference.
 */
export const MAX_STORYBOARD_PANELS = 9;
export const MIN_STORYBOARD_PANELS = 3;

export interface StoryboardBoard {
  id: string;
  label: string;
  panelCount: number;
  firstScene: number;
  lastScene: number;
  prompt: string;
  imageUrl?: string;
}

export interface StoryboardPreview {
  boards: StoryboardBoard[];
  approved: boolean;
  /** What the operator wants changed, carried back to the story step. */
  changeNote: string;
}

// ── Step 3: Casting ──

export type CharacterImageType = "front_portrait" | "three_quarter" | "full_body" | "expression";

export interface CharacterImage {
  id: string;
  type: CharacterImageType;
  label: string;
  url?: string;
  approved: boolean;
  versions: { url?: string; timestamp: number }[];
}

export interface CastCharacter {
  id: string;
  role: string;
  physicalDescription: string;
  clothingDescription: string;
  hairstyle: string;
  accessories: string;
  personalityNotes: string;
  nanoBananaPrompt: string;
  images: CharacterImage[];
}

// ── Step 4: Clips ──

export const CLIP_TYPES: { value: ClipType; label: string; hint: string; imageCount: string }[] = [
  {
    value: "single",
    label: "Single frame",
    hint: "One composed frame, animated. Best for conversation and dialogue.",
    imageCount: "1 image prompt",
  },
  {
    value: "start_end",
    label: "Start to End",
    hint: "The scene begins in one place and ends in another.",
    imageCount: "2 image prompts",
  },
  {
    value: "storyboard",
    label: "Storyboard panels",
    hint: "Several beats drawn as panels inside one image, then animated.",
    imageCount: "1 image prompt, 3-9 panels",
  },
];

export interface ClipImagePrompt {
  id: string;
  /** "Start Frame", "End Frame", or "Storyboard — 5 panels". */
  label: string;
  prompt: string;
  attachInstructions: string;
  imageUrl?: string;
  approved: boolean;
}

export type AnimationPlatform = "veo" | "grok";

export const QC_CHECKLIST_ITEMS = [
  "Character faces match the approved cast",
  "Character clothing is consistent with the Character Sheet",
  "No AI artifacts (extra fingers, warped text, melted features, extra limbs)",
  "Brand colors are present and accurate",
  "Logo/text (if present) is legible and not distorted",
  "Composition matches the camera direction from the story",
  "Lighting is consistent with scene requirements",
  "Aspect ratio is correct for target platform",
] as const;

export interface Clip {
  id: string;
  clipNumber: number;
  /** A storyboard clip can cover several story scenes. */
  sceneNumbers: number[];
  title: string;
  clipType: ClipType;
  /** Storyboard clips only. Clamped to MIN/MAX_STORYBOARD_PANELS. */
  panelCount?: number;
  imagePrompts: ClipImagePrompt[];
  animationPrompt: string;
  /** Kept separate so a missing camera move is visible instead of buried in prose. */
  cameraMove: string;
  voScript: string;
  voTone: string;
  duration: string;
  aspectRatio: string;
  negativePrompt: string;
  platform: AnimationPlatform;
  mode: string;
  qcChecklist: Record<string, boolean>;
  clipUrl?: string;
  approved: boolean;
}

// ── Step 5: Editing Guide ──

export interface AssemblyItem {
  clipLabel: string;
  duration: string;
  transition: string;
  notes: string;
}

export interface AudioLayer {
  type: string;
  description: string;
  startTime: string;
  endTime: string;
  volume: string;
  fadeIn?: string;
  fadeOut?: string;
  notes?: string;
}

export interface TextOverlay {
  text: string;
  timing: string;
  font: string;
  size: string;
  position: string;
  color: string;
  animation?: string;
}

export interface ExportSetting {
  platform: string;
  resolution: string;
  frameRate: string;
  codec: string;
  bitrate: string;
  format: string;
}

export interface ColorGrading {
  overallLook: string;
  temperature: string;
  contrast: string;
  saturation: string;
  highlights?: string;
  shadows?: string;
  notes?: string;
}

export interface EditingGuide {
  assembly: AssemblyItem[];
  audioLayers: AudioLayer[];
  textOverlays: TextOverlay[];
  colorGrading: ColorGrading;
  exportSettings: ExportSetting[];
}

// ── Step 6: Review & Delivery ──

export interface ReviewFeedback {
  id: string;
  round: number;
  timestamp?: string;
  comment: string;
  status: "pending" | "in_progress" | "resolved";
  createdAt: string;
}

export interface Deliverable {
  id: string;
  label: string;
  ready: boolean;
  format?: string;
  url?: string;
}

// ── Pipeline State ──

export interface StepCompletionStatus {
  0: boolean;
  1: boolean;
  2: boolean;
  3: boolean;
  4: boolean;
  5: boolean;
  6: boolean;
}

export interface CinematicAdsProject {
  id?: string;
  name: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  currentStep: PipelineStepNumber;
  stepsCompleted: StepCompletionStatus;

  // Step 0
  adFormat: AdFormatSelection;
  businessInformation: string;
  clientRequirement: string;
  ourNote: string;
  uploadedFiles: UploadedFile[];
  selectedPlatforms: TargetPlatform[];
  selectedDuration: number | "custom";
  customDuration: number;
  selectedLanguage: string;
  dialectNotes: string;
  clientBrief: ClientBrief | null;
  briefConfirmed: boolean;

  // Step 1
  stories: Story[];
  storyVersionHistory: Story[][];
  selectedStoryId: string | null;
  storyConfirmed: boolean;

  // Step 2
  storyboard: StoryboardPreview | null;
  storyboardConfirmed: boolean;

  // Step 3
  characters: CastCharacter[];
  castConfirmed: boolean;

  // Step 4
  clips: Clip[];
  clipsConfirmed: boolean;

  // Step 5
  editingGuide: EditingGuide | null;
  editingGuideConfirmed: boolean;

  // Step 6
  finalVideoUrl?: string;
  feedbackRounds: ReviewFeedback[];
  deliverables: Deliverable[];
  delivered: boolean;
}

/** A project summary for the project list, so the list never loads whole projects. */
export interface CinematicProjectSummary {
  id: string;
  name: string;
  businessName: string;
  duration: number;
  language: string;
  currentStep: PipelineStepNumber;
  stepsCompleted: StepCompletionStatus;
  delivered: boolean;
  updatedAt: number;
}
