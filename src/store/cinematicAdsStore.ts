import { create } from "zustand";
import type {
  AdFormatSelection,
  CastCharacter,
  CinematicAdsProject,
  CinematicProjectSummary,
  Clip,
  ClipType,
  ClientBrief,
  Deliverable,
  EditingGuide,
  PipelineStepNumber,
  ReviewFeedback,
  Story,
  StoryboardBoard,
  TargetPlatform,
  UploadedFile,
} from "@/types/cinematicAds";
import { effectiveAdFormatPreset, emptyAdFormatSelection } from "@/types/cinematicAds";
import { clampPanelCount } from "@/utils/cinematicAds";
import { deleteProject, listProjects, loadProject, saveProject } from "@/services/cinematicProjects";

function createEmptyProject(userId?: string, name?: string): CinematicAdsProject {
  return {
    name: name || "Untitled project",
    createdBy: userId || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentStep: 0,
    stepsCompleted: { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false },
    adFormat: emptyAdFormatSelection(),
    businessInformation: "",
    clientRequirement: "",
    ourNote: "",
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
    storyboard: null,
    storyboardConfirmed: false,
    characters: [],
    castConfirmed: false,
    clips: [],
    clipsConfirmed: false,
    editingGuide: null,
    editingGuideConfirmed: false,
    feedbackRounds: [],
    deliverables: [
      { id: "d-1", label: "Final ad in all required platform formats", ready: false },
      { id: "d-2", label: "Thumbnail image (from the best frame)", ready: false },
      { id: "d-3", label: "Project assets package (all frames, cast images, story doc)", ready: false },
      { id: "d-4", label: "Social media caption suggestions", ready: false },
    ],
    delivered: false,
  };
}

/**
 * The step after the storyboard gate.
 *
 * A no-people format has nothing to cast, and parking the operator on an empty Casting
 * screen reads as a broken pipeline, so that step is skipped outright.
 */
export function stepAfterStoryboard(project: CinematicAdsProject): PipelineStepNumber {
  return effectiveAdFormatPreset(project.adFormat).castingRequirement === "none" ? 4 : 3;
}

export function castingIsSkipped(project: CinematicAdsProject | null): boolean {
  if (!project) return false;
  return effectiveAdFormatPreset(project.adFormat).castingRequirement === "none";
}

interface CinematicAdsState {
  project: CinematicAdsProject | null;
  projects: CinematicProjectSummary[];
  projectsLoading: boolean;
  assetsOpen: boolean;
  processing: boolean;
  processingMessage: string;
  saving: boolean;
  saveError: string | null;

  // Project lifecycle
  initProject: (userId?: string, name?: string) => void;
  newProject: (userId: string, name: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  closeProject: () => void;
  refreshProjects: (userId: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  renameProject: (name: string) => void;
  saveNow: () => Promise<void>;

  setAssetsOpen: (open: boolean) => void;
  setProcessing: (processing: boolean, message?: string) => void;
  goToStep: (step: PipelineStepNumber) => void;
  confirmStep: (step: PipelineStepNumber) => void;

  // Step 0
  setAdFormat: (selection: AdFormatSelection) => void;
  setBusinessInformation: (text: string) => void;
  setClientRequirement: (text: string) => void;
  setOurNote: (text: string) => void;
  addFiles: (files: UploadedFile[]) => void;
  removeFile: (fileId: string) => void;
  setFileUrl: (fileId: string, url: string) => void;
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
  setStoryboardBoards: (boards: StoryboardBoard[]) => void;
  setBoardImage: (boardId: string, url: string) => void;
  setStoryboardChangeNote: (note: string) => void;
  approveStoryboard: () => void;
  sendStoryboardBack: () => void;

  // Step 3
  setCharacters: (characters: CastCharacter[]) => void;
  updateCharacter: (characterId: string, character: Partial<CastCharacter>) => void;
  setCharacterImage: (characterId: string, imageId: string, url: string) => void;
  toggleCharacterImageApproval: (characterId: string, imageId: string) => void;
  confirmCast: () => void;

  // Step 4
  setClips: (clips: Clip[]) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  setClipType: (clipId: string, clipType: ClipType, panelCount?: number) => void;
  setClipImage: (clipId: string, imagePromptId: string, url: string) => void;
  toggleClipImageApproval: (clipId: string, imagePromptId: string) => void;
  setClipVideo: (clipId: string, url: string) => void;
  toggleClipQc: (clipId: string, item: string) => void;
  confirmClips: () => void;

  // Step 5
  setEditingGuide: (guide: EditingGuide) => void;
  confirmEditingGuide: () => void;

  // Step 6
  setFinalVideo: (url: string) => void;
  addFeedbackRound: (feedback: ReviewFeedback) => void;
  toggleDeliverable: (id: string) => void;
  setDeliverableUrl: (id: string, url: string) => void;
  markDelivered: () => void;

  resetProject: () => void;
}

/**
 * Autosave.
 *
 * Every mutation goes through `patch`, which schedules one write a couple of seconds
 * later. Typing in a textarea fires a mutation per keystroke, so writing on each one
 * would spend the day's Firestore quota on a single brief.
 */
const SAVE_DEBOUNCE_MS = 2000;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useCinematicAdsStore = create<CinematicAdsState>((set, get) => {
  /** Apply a change to the project and schedule a save. */
  const patch = (fn: (p: CinematicAdsProject) => CinematicAdsProject, { save = true } = {}) => {
    const current = get().project;
    if (!current) return;
    set({ project: { ...fn(current), updatedAt: Date.now() } });
    if (save) scheduleSave();
  };

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void get().saveNow();
    }, SAVE_DEBOUNCE_MS);
  };

  return {
    project: null,
    projects: [],
    projectsLoading: false,
    assetsOpen: false,
    processing: false,
    processingMessage: "",
    saving: false,
    saveError: null,

    initProject: (userId, name) => set({ project: createEmptyProject(userId, name) }),

    newProject: async (userId, name) => {
      const project = createEmptyProject(userId, name);
      set({ project, saveError: null });
      try {
        const id = await saveProject(project);
        set((s) => (s.project ? { project: { ...s.project, id } } : s));
      } catch (err: any) {
        set({ saveError: err?.message || "Could not create the project" });
      }
    },

    openProject: async (id) => {
      set({ projectsLoading: true });
      try {
        const project = await loadProject(id);
        if (project) set({ project, saveError: null });
      } finally {
        set({ projectsLoading: false });
      }
    },

    closeProject: () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      set({ project: null });
    },

    refreshProjects: async (userId) => {
      set({ projectsLoading: true });
      try {
        set({ projects: await listProjects(userId) });
      } catch (err: any) {
        set({ saveError: err?.message || "Could not load projects" });
      } finally {
        set({ projectsLoading: false });
      }
    },

    removeProject: async (id) => {
      await deleteProject(id);
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        project: s.project?.id === id ? null : s.project,
      }));
    },

    renameProject: (name) => patch((p) => ({ ...p, name })),

    saveNow: async () => {
      const project = get().project;
      if (!project) return;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      set({ saving: true });
      try {
        const id = await saveProject(project);
        set((s) => ({
          saving: false,
          saveError: null,
          project: s.project && !s.project.id ? { ...s.project, id } : s.project,
        }));
      } catch (err: any) {
        set({ saving: false, saveError: err?.message || "Could not save" });
      }
    },

    setAssetsOpen: (open) => set({ assetsOpen: open }),
    setProcessing: (processing, message = "") => set({ processing, processingMessage: message }),

    goToStep: (step) => patch((p) => ({ ...p, currentStep: step }), { save: false }),

    confirmStep: (step) =>
      patch((p) => ({
        ...p,
        stepsCompleted: { ...p.stepsCompleted, [step]: true },
        currentStep: Math.min(step + 1, 6) as PipelineStepNumber,
      })),

    // ── Step 0 ──
    setAdFormat: (selection) => patch((p) => ({ ...p, adFormat: selection })),
    setBusinessInformation: (text) => patch((p) => ({ ...p, businessInformation: text })),
    setClientRequirement: (text) => patch((p) => ({ ...p, clientRequirement: text })),
    setOurNote: (text) => patch((p) => ({ ...p, ourNote: text })),

    addFiles: (files) => patch((p) => ({ ...p, uploadedFiles: [...p.uploadedFiles, ...files] })),
    removeFile: (fileId) => patch((p) => ({ ...p, uploadedFiles: p.uploadedFiles.filter((f) => f.id !== fileId) })),
    setFileUrl: (fileId, url) =>
      patch((p) => ({
        ...p,
        uploadedFiles: p.uploadedFiles.map((f) => (f.id === fileId ? { ...f, url } : f)),
      })),

    setPlatforms: (platforms) => patch((p) => ({ ...p, selectedPlatforms: platforms })),
    setDuration: (duration) => patch((p) => ({ ...p, selectedDuration: duration })),
    setCustomDuration: (duration) => patch((p) => ({ ...p, customDuration: duration })),
    setLanguage: (language) => patch((p) => ({ ...p, selectedLanguage: language })),
    setDialectNotes: (notes) => patch((p) => ({ ...p, dialectNotes: notes })),
    setBrief: (brief) => patch((p) => ({ ...p, clientBrief: brief })),
    updateBrief: (partial) =>
      patch((p) => (p.clientBrief ? { ...p, clientBrief: { ...p.clientBrief, ...partial } } : p)),

    confirmBrief: () =>
      patch((p) => ({
        ...p,
        briefConfirmed: true,
        // A project named by hand keeps its name; an untitled one takes the business name.
        name: p.name === "Untitled project" && p.clientBrief?.businessName ? p.clientBrief.businessName : p.name,
        stepsCompleted: { ...p.stepsCompleted, 0: true },
        currentStep: 1,
      })),

    // ── Step 1 ──
    setStories: (stories) => patch((p) => ({ ...p, stories })),
    updateStory: (storyId, story) =>
      patch((p) => ({ ...p, stories: p.stories.map((s) => (s.id === storyId ? story : s)) })),
    selectStory: (storyId) => patch((p) => ({ ...p, selectedStoryId: storyId })),
    pushStoryVersionHistory: (stories) =>
      patch((p) => ({ ...p, storyVersionHistory: [...p.storyVersionHistory, stories] })),

    confirmStory: () =>
      patch((p) => ({
        ...p,
        storyConfirmed: true,
        stepsCompleted: { ...p.stepsCompleted, 1: true },
        currentStep: 2,
        // A changed story invalidates the board that was drawn from the old one.
        storyboard: null,
        storyboardConfirmed: false,
      })),

    // ── Step 2 ──
    setStoryboardBoards: (boards) =>
      patch((p) => ({ ...p, storyboard: { boards, approved: false, changeNote: p.storyboard?.changeNote || "" } })),

    setBoardImage: (boardId, url) =>
      patch((p) =>
        p.storyboard
          ? {
              ...p,
              storyboard: {
                ...p.storyboard,
                boards: p.storyboard.boards.map((b) => (b.id === boardId ? { ...b, imageUrl: url } : b)),
              },
            }
          : p,
      ),

    setStoryboardChangeNote: (note) =>
      patch((p) => (p.storyboard ? { ...p, storyboard: { ...p.storyboard, changeNote: note } } : p)),

    approveStoryboard: () =>
      patch((p) => ({
        ...p,
        storyboard: p.storyboard ? { ...p.storyboard, approved: true } : p.storyboard,
        storyboardConfirmed: true,
        stepsCompleted: { ...p.stepsCompleted, 2: true },
        currentStep: stepAfterStoryboard(p),
      })),

    sendStoryboardBack: () =>
      patch((p) => ({
        ...p,
        storyboardConfirmed: false,
        storyConfirmed: false,
        stepsCompleted: { ...p.stepsCompleted, 1: false, 2: false },
        currentStep: 1,
      })),

    // ── Step 3 ──
    setCharacters: (characters) => patch((p) => ({ ...p, characters })),
    updateCharacter: (characterId, character) =>
      patch((p) => ({
        ...p,
        characters: p.characters.map((c) => (c.id === characterId ? { ...c, ...character } : c)),
      })),

    setCharacterImage: (characterId, imageId, url) =>
      patch((p) => ({
        ...p,
        characters: p.characters.map((c) =>
          c.id === characterId
            ? {
                ...c,
                images: c.images.map((img) =>
                  img.id === imageId
                    ? { ...img, url, versions: [...(img.versions || []), { url, timestamp: Date.now() }] }
                    : img,
                ),
              }
            : c,
        ),
      })),

    toggleCharacterImageApproval: (characterId, imageId) =>
      patch((p) => ({
        ...p,
        characters: p.characters.map((c) =>
          c.id === characterId
            ? { ...c, images: c.images.map((img) => (img.id === imageId ? { ...img, approved: !img.approved } : img)) }
            : c,
        ),
      })),

    confirmCast: () =>
      patch((p) => ({
        ...p,
        castConfirmed: true,
        stepsCompleted: { ...p.stepsCompleted, 3: true },
        currentStep: 4,
      })),

    // ── Step 4 ──
    setClips: (clips) => patch((p) => ({ ...p, clips })),
    updateClip: (clipId, clipPatch) =>
      patch((p) => ({ ...p, clips: p.clips.map((c) => (c.id === clipId ? { ...c, ...clipPatch } : c)) })),

    setClipType: (clipId, clipType, panelCount) =>
      patch((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === clipId
            ? { ...c, clipType, panelCount: clipType === "storyboard" ? clampPanelCount(panelCount ?? c.panelCount) : undefined }
            : c,
        ),
      })),

    setClipImage: (clipId, imagePromptId, url) =>
      patch((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === clipId
            ? { ...c, imagePrompts: c.imagePrompts.map((ip) => (ip.id === imagePromptId ? { ...ip, imageUrl: url } : ip)) }
            : c,
        ),
      })),

    toggleClipImageApproval: (clipId, imagePromptId) =>
      patch((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                imagePrompts: c.imagePrompts.map((ip) =>
                  ip.id === imagePromptId ? { ...ip, approved: !ip.approved } : ip,
                ),
              }
            : c,
        ),
      })),

    setClipVideo: (clipId, url) =>
      patch((p) => ({ ...p, clips: p.clips.map((c) => (c.id === clipId ? { ...c, clipUrl: url } : c)) })),

    toggleClipQc: (clipId, item) =>
      patch((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === clipId ? { ...c, qcChecklist: { ...c.qcChecklist, [item]: !c.qcChecklist[item] } } : c,
        ),
      })),

    confirmClips: () =>
      patch((p) => ({
        ...p,
        clipsConfirmed: true,
        stepsCompleted: { ...p.stepsCompleted, 4: true },
        currentStep: 5,
      })),

    // ── Step 5 ──
    setEditingGuide: (guide) => patch((p) => ({ ...p, editingGuide: guide })),
    confirmEditingGuide: () =>
      patch((p) => ({
        ...p,
        editingGuideConfirmed: true,
        stepsCompleted: { ...p.stepsCompleted, 5: true },
        currentStep: 6,
      })),

    // ── Step 6 ──
    setFinalVideo: (url) => patch((p) => ({ ...p, finalVideoUrl: url })),
    addFeedbackRound: (feedback) => patch((p) => ({ ...p, feedbackRounds: [...p.feedbackRounds, feedback] })),
    toggleDeliverable: (id) =>
      patch((p) => ({
        ...p,
        deliverables: p.deliverables.map((d: Deliverable) => (d.id === id ? { ...d, ready: !d.ready } : d)),
      })),
    setDeliverableUrl: (id, url) =>
      patch((p) => ({ ...p, deliverables: p.deliverables.map((d) => (d.id === id ? { ...d, url, ready: true } : d)) })),
    markDelivered: () =>
      patch((p) => ({ ...p, delivered: true, stepsCompleted: { ...p.stepsCompleted, 6: true } })),

    resetProject: () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      set((s) => ({ project: createEmptyProject(s.project?.createdBy) }));
    },
  };
});
