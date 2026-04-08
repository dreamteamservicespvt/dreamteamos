import { create } from "zustand";
import type {
  PipelineStepNumber,
  StepCompletionStatus,
  UploadedFile,
  TargetPlatform,
  ClientBrief,
  Story,
  CastCharacter,
  SceneFrame,
  AnimationPrompt,
  EditingGuide,
  ReviewFeedback,
  Deliverable,
  CinematicAdsProject,
} from "@/types/cinematicAds";

function createEmptyProject(userId?: string): CinematicAdsProject {
  return {
    createdBy: userId || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentStep: 0,
    stepsCompleted: { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false },
    uploadedFiles: [],
    selectedPlatforms: [],
    selectedDuration: 30,
    customDuration: 30,
    selectedLanguage: "Telugu",
    dialectNotes: "",
    clientBrief: null,
    briefConfirmed: false,
    stories: [],
    storyVersionHistory: [],
    selectedStoryId: null,
    storyConfirmed: false,
    characters: [],
    castConfirmed: false,
    sceneFrames: [],
    framesConfirmed: false,
    animationPrompts: [],
    animationConfirmed: false,
    editingGuide: null,
    editingGuideConfirmed: false,
    feedbackRounds: [],
    deliverables: [
      { id: "d-1", label: "Final ad in all required platform formats", ready: false },
      { id: "d-2", label: "Thumbnail image (from best frame)", ready: false },
      { id: "d-3", label: "Project assets package (all frames, cast images, story doc)", ready: false },
      { id: "d-4", label: "Social media caption suggestions", ready: false },
    ],
    delivered: false,
  };
}

interface CinematicAdsState {
  project: CinematicAdsProject | null;
  assetsOpen: boolean;
  processing: boolean;
  processingMessage: string;

  // Actions
  initProject: (userId?: string) => void;
  setAssetsOpen: (open: boolean) => void;
  setProcessing: (processing: boolean, message?: string) => void;
  goToStep: (step: PipelineStepNumber) => void;
  confirmStep: (step: PipelineStepNumber) => void;

  // Step 0
  addFiles: (files: UploadedFile[]) => void;
  removeFile: (fileId: string) => void;
  setPlatforms: (platforms: TargetPlatform[]) => void;
  setDuration: (duration: number | "custom") => void;
  setCustomDuration: (duration: number) => void;
  setLanguage: (language: string) => void;
  setDialectNotes: (notes: string) => void;
  setBrief: (brief: ClientBrief) => void;
  updateBrief: (partial: Partial<ClientBrief>) => void;
  confirmBrief: () => void;

  // Step 1
  setStories: (stories: Story[]) => void;
  updateStory: (storyId: string, story: Story) => void;
  selectStory: (storyId: string) => void;
  confirmStory: () => void;
  pushStoryVersionHistory: (stories: Story[]) => void;

  // Step 2
  setCharacters: (characters: CastCharacter[]) => void;
  updateCharacter: (characterId: string, character: Partial<CastCharacter>) => void;
  confirmCast: () => void;

  // Step 3
  setSceneFrames: (frames: SceneFrame[]) => void;
  updateSceneFrame: (sceneNumber: number, frame: Partial<SceneFrame>) => void;
  confirmFrames: () => void;

  // Step 4
  setAnimationPrompts: (prompts: AnimationPrompt[]) => void;
  updateAnimationPrompt: (sceneNumber: number, prompt: Partial<AnimationPrompt>) => void;
  confirmAnimation: () => void;

  // Step 5
  setEditingGuide: (guide: EditingGuide) => void;
  confirmEditingGuide: () => void;

  // Step 6
  setFinalVideo: (url: string, file?: File) => void;
  addFeedbackRound: (feedback: ReviewFeedback) => void;
  toggleDeliverable: (id: string) => void;
  markDelivered: () => void;

  resetProject: () => void;
}

export const useCinematicAdsStore = create<CinematicAdsState>((set, get) => ({
  project: null,
  assetsOpen: false,
  processing: false,
  processingMessage: "",

  initProject: (userId) => set({ project: createEmptyProject(userId) }),

  setAssetsOpen: (open) => set({ assetsOpen: open }),

  setProcessing: (processing, message = "") => set({ processing, processingMessage: message }),

  goToStep: (step) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, currentStep: step, updatedAt: Date.now() } };
    }),

  confirmStep: (step) =>
    set((s) => {
      if (!s.project) return s;
      const next = Math.min(step + 1, 6) as PipelineStepNumber;
      return {
        project: {
          ...s.project,
          stepsCompleted: { ...s.project.stepsCompleted, [step]: true },
          currentStep: next,
          updatedAt: Date.now(),
        },
      };
    }),

  // Step 0
  addFiles: (files) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, uploadedFiles: [...s.project.uploadedFiles, ...files], updatedAt: Date.now() } };
    }),

  removeFile: (fileId) =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          uploadedFiles: s.project.uploadedFiles.filter((f) => f.id !== fileId),
          updatedAt: Date.now(),
        },
      };
    }),

  setPlatforms: (platforms) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, selectedPlatforms: platforms, updatedAt: Date.now() } };
    }),

  setDuration: (duration) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, selectedDuration: duration, updatedAt: Date.now() } };
    }),

  setCustomDuration: (duration) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, customDuration: duration, updatedAt: Date.now() } };
    }),

  setLanguage: (language) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, selectedLanguage: language, updatedAt: Date.now() } };
    }),

  setDialectNotes: (notes) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, dialectNotes: notes, updatedAt: Date.now() } };
    }),

  setBrief: (brief) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, clientBrief: brief, updatedAt: Date.now() } };
    }),

  updateBrief: (partial) =>
    set((s) => {
      if (!s.project || !s.project.clientBrief) return s;
      return {
        project: { ...s.project, clientBrief: { ...s.project.clientBrief, ...partial }, updatedAt: Date.now() },
      };
    }),

  confirmBrief: () =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          briefConfirmed: true,
          stepsCompleted: { ...s.project.stepsCompleted, 0: true },
          currentStep: 1,
          updatedAt: Date.now(),
        },
      };
    }),

  // Step 1
  setStories: (stories) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, stories, updatedAt: Date.now() } };
    }),

  updateStory: (storyId, story) =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          stories: s.project.stories.map((st) => (st.id === storyId ? story : st)),
          updatedAt: Date.now(),
        },
      };
    }),

  selectStory: (storyId) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, selectedStoryId: storyId, updatedAt: Date.now() } };
    }),

  confirmStory: () =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          storyConfirmed: true,
          stepsCompleted: { ...s.project.stepsCompleted, 1: true },
          currentStep: 2,
          updatedAt: Date.now(),
        },
      };
    }),

  pushStoryVersionHistory: (stories) =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          storyVersionHistory: [...s.project.storyVersionHistory, stories],
          updatedAt: Date.now(),
        },
      };
    }),

  // Step 2
  setCharacters: (characters) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, characters, updatedAt: Date.now() } };
    }),

  updateCharacter: (characterId, character) =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          characters: s.project.characters.map((c) => (c.id === characterId ? { ...c, ...character } : c)),
          updatedAt: Date.now(),
        },
      };
    }),

  confirmCast: () =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          castConfirmed: true,
          stepsCompleted: { ...s.project.stepsCompleted, 2: true },
          currentStep: 3,
          updatedAt: Date.now(),
        },
      };
    }),

  // Step 3
  setSceneFrames: (frames) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, sceneFrames: frames, updatedAt: Date.now() } };
    }),

  updateSceneFrame: (sceneNumber, frame) =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          sceneFrames: s.project.sceneFrames.map((f) =>
            f.sceneNumber === sceneNumber ? { ...f, ...frame } : f,
          ),
          updatedAt: Date.now(),
        },
      };
    }),

  confirmFrames: () =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          framesConfirmed: true,
          stepsCompleted: { ...s.project.stepsCompleted, 3: true },
          currentStep: 4,
          updatedAt: Date.now(),
        },
      };
    }),

  // Step 4
  setAnimationPrompts: (prompts) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, animationPrompts: prompts, updatedAt: Date.now() } };
    }),

  updateAnimationPrompt: (sceneNumber, prompt) =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          animationPrompts: s.project.animationPrompts.map((p) =>
            p.sceneNumber === sceneNumber ? { ...p, ...prompt } : p,
          ),
          updatedAt: Date.now(),
        },
      };
    }),

  confirmAnimation: () =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          animationConfirmed: true,
          stepsCompleted: { ...s.project.stepsCompleted, 4: true },
          currentStep: 5,
          updatedAt: Date.now(),
        },
      };
    }),

  // Step 5
  setEditingGuide: (guide) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, editingGuide: guide, updatedAt: Date.now() } };
    }),

  confirmEditingGuide: () =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          editingGuideConfirmed: true,
          stepsCompleted: { ...s.project.stepsCompleted, 5: true },
          currentStep: 6,
          updatedAt: Date.now(),
        },
      };
    }),

  // Step 6
  setFinalVideo: (url, file) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, finalVideo: file, finalVideoUrl: url, updatedAt: Date.now() } };
    }),

  addFeedbackRound: (feedback) =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          feedbackRounds: [...s.project.feedbackRounds, feedback],
          updatedAt: Date.now(),
        },
      };
    }),

  toggleDeliverable: (id) =>
    set((s) => {
      if (!s.project) return s;
      const deliverables = s.project.deliverables.map((d) =>
        d.id === id ? { ...d, ready: !d.ready } : d,
      );
      return { project: { ...s.project, deliverables, updatedAt: Date.now() } };
    }),

  markDelivered: () =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: {
          ...s.project,
          delivered: true,
          stepsCompleted: { ...s.project.stepsCompleted, 6: true },
          updatedAt: Date.now(),
        },
      };
    }),

  resetProject: () => set({ project: null }),
}));
