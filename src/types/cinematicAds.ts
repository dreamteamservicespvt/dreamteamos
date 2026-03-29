// ── Cinematic Ads Pipeline Types ──

export const PIPELINE_STEPS = [
  { number: 0, label: "Client Onboarding", shortLabel: "Brief" },
  { number: 1, label: "Story Generation", shortLabel: "Story" },
  { number: 2, label: "Casting", shortLabel: "Cast" },
  { number: 3, label: "Frame Generation", shortLabel: "Frames" },
  { number: 4, label: "Animation Prompts", shortLabel: "Animate" },
  { number: 5, label: "Editing Guide", shortLabel: "Edit" },
  { number: 6, label: "Review & Delivery", shortLabel: "Deliver" },
] as const;

export type PipelineStepNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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
  file: File;
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
}

// ── Step 1: Story Generation ──

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

export interface Story {
  id: string;
  title: string;
  conceptSummary: string;
  emotionalArc: string;
  totalDuration: string;
  numberOfScenes: number;
  scenes: Scene[];
}

export type StoryTone = "emotional" | "humorous" | "corporate" | "inspirational" | "dramatic";

export const STORY_TONES: { value: StoryTone; label: string }[] = [
  { value: "emotional", label: "Emotional" },
  { value: "humorous", label: "Humorous" },
  { value: "corporate", label: "Corporate" },
  { value: "inspirational", label: "Inspirational" },
  { value: "dramatic", label: "Dramatic" },
];

// ── Step 2: Casting ──

export type CharacterImageType = "front_portrait" | "three_quarter" | "full_body" | "expression";

export interface CharacterImage {
  id: string;
  type: CharacterImageType;
  label: string;
  file?: File;
  url?: string;
  approved: boolean;
  versions: { url?: string; file?: File; timestamp: number }[];
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

// ── Step 3: Frame Generation ──

export type FrameType = "single_start" | "start_end" | "ingredients" | "poster_end";

export interface FrameImage {
  id: string;
  label: string;
  file?: File;
  url?: string;
  approved: boolean;
}

export const QC_CHECKLIST_ITEMS = [
  "Character faces match the approved cast from Step 2",
  "Character clothing is consistent with the Character Sheet",
  "No AI artifacts (extra fingers, warped text, melted features, extra limbs)",
  "Brand colors are present and accurate",
  "Logo/text (if present in poster frame) is legible and not distorted",
  "Composition matches the camera direction from the story",
  "Lighting is consistent with scene requirements",
  "Aspect ratio is correct for target platform",
] as const;

export interface SceneFrame {
  sceneNumber: number;
  frameType: FrameType;
  prompt: string;
  characterRefs: string[];
  images: FrameImage[];
  qcChecklist: Record<string, boolean>;
}

// ── Step 4: Animation Prompts ──

export type AnimationPlatform = "veo" | "grok";
export type VeoMode = "text_to_video" | "image_to_video" | "first_last_frame" | "ingredients" | "scene_extension";
export type GrokMode = "text_to_video" | "image_to_video" | "multi_image" | "extend_from_frame";

export interface AnimationPrompt {
  sceneNumber: number;
  platform: AnimationPlatform;
  mode: string;
  attachInstructions: string;
  prompt: string;
  duration: string;
  aspectRatio: string;
  audioCues: string;
  negativePrompt: string;
  clipFile?: File;
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
  file?: File;
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
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  currentStep: PipelineStepNumber;
  stepsCompleted: StepCompletionStatus;

  // Step 0
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
  characters: CastCharacter[];
  castConfirmed: boolean;

  // Step 3
  sceneFrames: SceneFrame[];
  framesConfirmed: boolean;

  // Step 4
  animationPrompts: AnimationPrompt[];
  animationConfirmed: boolean;

  // Step 5
  editingGuide: EditingGuide | null;
  editingGuideConfirmed: boolean;

  // Step 6
  finalVideo?: File;
  finalVideoUrl?: string;
  feedbackRounds: ReviewFeedback[];
  deliverables: Deliverable[];
  delivered: boolean;
}
