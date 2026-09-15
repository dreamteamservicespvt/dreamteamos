import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Wand2, Sparkles, Layout, Type, Rocket, AlertCircle,
  Loader2, Save, Check, Camera, Video, PenTool, ChevronDown, Copy,
  ExternalLink, StopCircle, ArrowLeft, CheckCircle2, Home, Ratio, Languages, Type as TypeIcon, Music
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { FileUpload } from './FileUpload';
import { GeneratedCard, parseVoiceOverClips, stripAttachmentDirective } from './GeneratedCard';
import { buildPromptAttachments, type PromptAttachment } from '@/utils/promptAttachments';
import { SavedItems, SavedGeneration } from './SavedItems';
import { AdFormData, AdType, AttireType, ModelGender, ATTIRE_OPTIONS_BY_GENDER, FileStore, GeneratedOutputs, GenerationStatus, LocationMode } from '@/types/aiPlatform';
import PosterSpecFields from '@/components/work/PosterSpecFields';
import PosterConceptsPanel from './PosterConceptsPanel';
import { DEFAULT_POSTER_SIZE, isPosterCategory, isValidPosterSize, posterSizeLabel } from '@/utils/posterSpec';
import { AUTO_POSTER_STYLE } from '@/services/posterStyles';
import { useAssignmentBrief } from '@/hooks/useAssignmentBrief';
import { briefAsInstructions } from '@/utils/adRequirement';
import { characterPackGroups, getCharacterPack, isHumanPack, packModelGender } from '@/services/characterPacks';
import { generateAdAssets, generatePosterConcepts, refinePosterConcept, DEFAULT_POSTER_CONCEPT_COUNT, generateStockImagePrompts, refineStockImagePrompt, generateOverlayTexts, refineSection, refineVoiceOver, refineVeoPrompts, regenerateVeoForClips, SectionType, extractBusinessNameFromInfo } from '@/services/geminiService';
import { collection, addDoc, getDocs, getDoc, query, where, serverTimestamp, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import type { WorkAssignment } from '@/types';
import { useConfirm } from '@/hooks/useConfirm';
import { holdUpdates } from '@/services/appUpdate';
import SpecUpdateDialog from './SpecUpdateDialog';
import {
  describeSpecChanges, specOf, specSignature, type AssignmentSpec, type SpecChange,
} from '@/utils/assignmentSpecDiff';
import { useToast } from '@/hooks/use-toast';
import BrandLogo from '@/components/common/BrandLogo';
import { clipLabel, clipRange, formatClipLine, formatClipScript, parseLabeledClips } from '@/utils/voiceOverFormat';
import { CUSTOM_FESTIVAL_OPTION, WISHES_FESTIVALS } from '@/utils/festivals';
import { measureRun, saveRunTiming, type Checkpoint, type RunProfile } from '@/utils/generationEta';
import { hasGeneratedAsset, type GenerationRun, type RunFacts } from './generation/run';
import { MissionWorkspace, RunCountdown, missionMotion } from './generation/MissionWorkspace';
import { AIGuideSheet } from './generation/AIGuideSheet';
import { RefineRevisionBanner, type VoiceOverRevision } from './RefineRevisionBanner';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
// DTS brand system (violet → blue → cyan, from "JUST DREAM BIG, WE BUILD IT").
import { BRAND_GRADIENT, BRAND_GRADIENT_HOVER, BRAND_TEXT } from './brand';

interface AIPlatformAppProps {
  assignment?: WorkAssignment;
  assignmentId?: string;
  onBusinessNameExtracted?: (name: string) => void;
  onClose: () => void;
  onComplete?: () => void;
  /** True while the completion is being written — disables the button and shows progress. */
  completing?: boolean;
}

// Human-readable labels for each attire option (shown in the attire dropdown, filtered by gender).
const ATTIRE_LABELS: Record<AttireType, string> = {
  [AttireType.PROFESSIONAL]: 'Professional (Formal Suit)',
  [AttireType.TRADITIONAL]: 'Traditional (Designer Saree)',
  [AttireType.SHIRT_PANT]: 'Professional (In-shirt & Pant)',
  [AttireType.CUSTOM]: 'Custom (describe below)',
};

const cleanPromptForClipboard = (content: string) => {
  return content
    .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```$/gim, '')
    .trim();
};

const AIPlatformApp: React.FC<AIPlatformAppProps> = ({
  assignment, assignmentId, onBusinessNameExtracted, onClose, onComplete, completing = false
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const user = useAuthStore((s) => s.user);
  const { confirm: showAlert, ConfirmDialog } = useConfirm();

  /**
   * No automatic reload while this screen is open.
   *
   * Everything here — the uploads, the generated prompts, the refinements — lives in React state,
   * so a reload loses it silently and there is nothing to recover it from. The app may take a new
   * version by itself once a member has plainly moved on (see components/layout/AppUpdateBanner);
   * this is how the one screen that can't afford it says so. The banner still appears, so the
   * member can take the update themselves whenever they are ready.
   */
  useEffect(() => holdUpdates(), []);

  const [formData, setFormData] = useState<AdFormData>({
    adType: AdType.COMMERCIAL,
    festivalName: '',
    gender: ModelGender.FEMALE,
    attireType: AttireType.TRADITIONAL,
    customAttire: '',
    duration: 16,
    durationMode: 'preset',
    textInstructions: '',
    aspectRatio: '9:16',
    language: 'Telugu',
    noLogo: false,
    logoNameText: '',
    // Poster Creation — read only in poster mode. 4:5 because that is how Instagram shows a
    // poster uncropped, and English because image generators spell it most reliably.
    posterSize: DEFAULT_POSTER_SIZE,
    posterStyle: AUTO_POSTER_STYLE,
    posterOccasion: '',
    posterConceptCount: DEFAULT_POSTER_CONCEPT_COUNT,
    posterTextLanguage: 'English',
  });

  const [files, setFiles] = useState<FileStore>({
    logo: null, visitingCard: [], storeImage: [],
    productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: []
  });

  const [status, setStatus] = useState<GenerationStatus>({ step: '', isProcessing: false, error: null, progress: 0 });
  const [errorModalDismissed, setErrorModalDismissed] = useState(false);
  const [outputs, setOutputs] = useState<GeneratedOutputs | null>(null);
  /**
   * The run the waiting workspace describes. Updated only when Start is pressed and at each progress
   * checkpoint — a handful of times per run. The one-second countdown tick lives inside the
   * workspace's own leaf component so it never re-renders this screen.
   */
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  /** The member's side of the run — tabs opened, logo attached — shared by the workspace and the guide. */
  const [missionDone, setMissionDone] = useState<Record<string, boolean>>({});
  const [guideOpen, setGuideOpen] = useState(false);
  const toggleMission = useCallback((key: string, value: boolean) => {
    setMissionDone(prev => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);
  const reduceMotion = useReducedMotion();
  /**
   * Whether anything usable has arrived. Not `!!outputs`: the first snapshot the generator emits
   * holds only the extracted business info, a few seconds in, before any asset exists.
   */
  const firstAssetIn = hasGeneratedAsset(outputs);
  const showMission = status.isProcessing && !!activeRun && !firstAssetIn;
  const showAssets = firstAssetIn;
  const [refiningSection, setRefiningSection] = useState<SectionType | null>(null);
  /** The single clip being refined, when a refine was started from a clip's own button. */
  const [refiningClip, setRefiningClip] = useState<number | null>(null);
  /** What the last voice-over refine changed, with what Undo restores. */
  const [voiceOverRevision, setVoiceOverRevision] = useState<VoiceOverRevision | null>(null);
  const [collapsedSections, setCollapsedSections] = useState({
    storeOffice: true, productImages: true, flyersPosters: true, voiceInstructions: true
  });
  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  const [includeProductsInHeader, setIncludeProductsInHeader] = useState(false);
  const [showSavedItems, setShowSavedItems] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedGeneration[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [viewingSavedItem, setViewingSavedItem] = useState<SavedGeneration | null>(null);
  const [isGeneratingStock, setIsGeneratingStock] = useState(false);
  const [stockImageError, setStockImageError] = useState<string | null>(null);
  const [stockImageTheme, setStockImageTheme] = useState<string>('indian');
  const [copiedStockIdx, setCopiedStockIdx] = useState<number | null>(null);
  const [stockRefineIdx, setStockRefineIdx] = useState<number | null>(null);
  const [stockRefineText, setStockRefineText] = useState('');
  const [refiningStockIdx, setRefiningStockIdx] = useState<number | null>(null);
  const [isGeneratingOverlay, setIsGeneratingOverlay] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const outputPanelRef = useRef<HTMLDivElement>(null);
  const [collapsedOutputs, setCollapsedOutputs] = useState<Record<string, boolean>>({});
  const toggleOutputSection = (section: string) => {
    setCollapsedOutputs(prev => ({ ...prev, [section]: !prev[section] }));
  };
  /** A poster job opens in Poster Creation and stays there — the client bought a poster. */
  const posterJob = isPosterCategory(assignment?.category);
  const [creationMode, setCreationMode] = useState<'video' | 'poster'>(() => (posterJob ? 'poster' : 'video'));
  /** Which concept is being refined. */
  const [refiningConcept, setRefiningConcept] = useState<number | null>(null);
  /**
   * The saved generation this screen is showing, so pressing Save updates it instead of writing a
   * second copy. Generate → auto-save → Save used to leave two identical documents behind (three
   * with a regenerate), and the team's history listed every one of them.
   */
  const generationDocIdRef = useRef<string | null>(null);
  const [selectedFestivalOption, setSelectedFestivalOption] = useState<string>('');
  const [customFestivalName, setCustomFestivalName] = useState<string>('');
  const [customScript, setCustomScript] = useState<string>('');
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState('');

  const LANGUAGE_OPTIONS = [
    'Telugu', 'English', 'Hindi', 'Kannada', 'Tamil', 'Malayalam',
    'Marathi', 'Bengali', 'Gujarati', 'Punjabi', 'Urdu', 'Odia', 'Assamese',
  ];

  // #2 — Video Duration is fixed by the assignment's clip count when launched from an assignment
  const durationLocked = !!assignment;

  // The occasion list is shared with the sales side (utils/festivals): the member who SELLS a
  // wishes video and the member who GENERATES it have to be naming the same festival, or the sale
  // says one thing and the generator themes another.
  const upcomingFestivals = WISHES_FESTIVALS;

  useEffect(() => {
    if (user) loadSavedItems();
  }, [user]);

  /**
   * Applies the whole assignment spec to the form: duration, ad type, model, attire, ratio,
   * language and the special category. One function so a live update can never refresh some fields
   * and leave others on the old job.
   */
  const applyAssignmentSpec = useCallback((a: WorkAssignment) => {
    // The festival picker is two pieces of state (the dropdown and the "other" box), so it is set
    // here alongside the form rather than left on whatever the member last looked at.
    if (a.festival) {
      const listed = WISHES_FESTIVALS.includes(a.festival);
      setSelectedFestivalOption(listed ? a.festival : CUSTOM_FESTIVAL_OPTION);
      setCustomFestivalName(listed ? '' : a.festival);
    }
    const poster = isPosterCategory(a.category);
    if (poster) setCreationMode('poster');
    const clips = a.clipCount || Math.max(1, Math.floor((parseInt(a.duration) || 16) / 8));
    const seconds = Math.min(120, Math.max(8, clips * 8));
    const isPreset = [16, 32, 48, 64].includes(seconds);

    setFormData(prev => ({
      ...prev,
      duration: seconds,
      durationMode: isPreset ? 'preset' : 'custom',
      // Ad type is always implied by the category — the admin already decided Wishes vs Promotional.
      adType: a.category === 'wishes' ? AdType.FESTIVAL : AdType.COMMERCIAL,
      // Each of these applies only when the assignment actually specifies it, so an older
      // assignment created before these fields existed stays fully editable exactly as before.
      ...(a.modelGender ? { gender: a.modelGender as ModelGender } : {}),
      ...(a.attireType ? { attireType: a.attireType as AttireType } : {}),
      ...(a.attireType === AttireType.CUSTOM && a.customAttire ? { customAttire: a.customAttire } : {}),
      ...(a.aspectRatio ? { aspectRatio: a.aspectRatio } : {}),
      // On a poster job the language is the language of the words ON the poster.
      ...(a.language ? (poster ? { posterTextLanguage: a.language } : { language: a.language }) : {}),
      ...(poster ? {
        posterSize: a.posterSize || DEFAULT_POSTER_SIZE,
        posterStyle: a.posterStyle || AUTO_POSTER_STYLE,
        posterOccasion: a.festival || '',
      } : {}),
      // The occasion was agreed with the client at sale time and themes the entire ad, so the
      // member opens on it rather than choosing a festival nobody bought.
      ...(a.festival ? { festivalName: a.festival } : {}),
      // A special category was sold, not chosen here — the member opens straight on the right
      // treatment rather than having to know that this particular job is a cartoon-duo ad.
      ...(a.characterPack ? { characterPack: a.characterPack } : { characterPack: undefined }),
      /*
        Where the ad is set — carried on EVERY ad job now, not only a pack one.

        This used to be applied only alongside a character pack, so a normal ad opened with no
        location mode at all and the generator built the location from the business profile
        regardless of what the client had been asked to send. A member with a chat full of shop
        photographs had no way to tell the pipeline to use them.

        An assignment made before this existed carries no flag; `realLocationProvided` reads as
        false there, which is a built location — which is what those ads in fact got.
      */
      ...(a.realLocationProvided === undefined
        ? {}
        : { locationMode: (a.realLocationProvided ? 'real_provided' : 'ai_generated') as LocationMode }),
    }));
  }, []);

  /**
   * Keeping the member on the CURRENT spec, not the one they were handed when they opened it.
   *
   * These effects used to key on the assignment's id alone, so an admin correcting a job that was
   * already out — wrong attire, the client wanted 16:9, the duration was sold short — changed
   * nothing on the member's screen. They carried on to the generator with the original spec and
   * produced the wrong ad, and it was only caught on delivery.
   *
   * Now the SPEC is watched. The first one seen is applied silently, because that is simply the
   * job opening. Any later change raises a dialog the member has to read and accept — fields that
   * rearrange themselves under someone's cursor are worse than no update at all, and this is the
   * moment they need to know their half-finished work is now against the wrong brief.
   */
  /** The spec currently reflected in the form, so a change can be described against it. */
  const appliedSpecRef = useRef<{ id: string; spec: AssignmentSpec } | null>(null);
  const [pendingSpec, setPendingSpec] = useState<{ assignment: WorkAssignment; changes: SpecChange[] } | null>(null);
  // Derived from the spec fields only: every Firestore snapshot replaces the assignment object,
  // and a moving session timer or a status flip must never interrupt anyone.
  const assignmentSpecKey = assignment ? specSignature(specOf(assignment)) : null;

  useEffect(() => {
    if (!assignment) return;
    const spec = specOf(assignment);
    const applied = appliedSpecRef.current;

    // First sight of this job — or a different job entirely. Nothing to announce.
    if (!applied || applied.id !== assignment.id) {
      appliedSpecRef.current = { id: assignment.id, spec };
      applyAssignmentSpec(assignment);
      return;
    }

    if (specSignature(applied.spec) === specSignature(spec)) return;

    const changes = describeSpecChanges(applied.spec, spec);
    if (changes.length === 0) {
      // Something moved that the member does not need to be stopped for — apply it and move on.
      appliedSpecRef.current = { id: assignment.id, spec };
      applyAssignmentSpec(assignment);
      return;
    }
    setPendingSpec({ assignment, changes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentSpecKey, assignment?.id, applyAssignmentSpec]);

  /** The member has read the change — put the form on the new spec and carry on. */
  const acknowledgeSpecUpdate = () => {
    if (!pendingSpec) return;
    appliedSpecRef.current = { id: pendingSpec.assignment.id, spec: specOf(pendingSpec.assignment) };
    applyAssignmentSpec(pendingSpec.assignment);
    setPendingSpec(null);
  };

  const genderLocked = !!assignment?.modelGender;
  const attireLocked = !!assignment?.attireType;
  const aspectRatioLocked = !!assignment?.aspectRatio;
  const languageLocked = !!assignment?.language;
  const adTypeLocked = !!assignment;
  /** Poster fields the job specifies are fixed, exactly like the ad spec. */
  const posterLocks = {
    size: posterJob && !!assignment?.posterSize,
    style: posterJob && !!assignment?.posterStyle,
    occasion: posterJob && !!assignment?.festival,
  };

  /**
   * The sale's business info, in the generator's text box when the job opens.
   *
   * The sales member wrote down what the business does and what the ad must carry; the member used
   * to find it (if at all) in a WhatsApp message and retype it here. Read off the job, or its order
   * for work assigned before the job carried it, and put in only when the box is empty — whatever a
   * member has typed is never replaced.
   */
  const assignmentBrief = useAssignmentBrief(assignment);
  const briefAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!assignment || assignmentBrief.loading) return;
    if (briefAppliedFor.current === assignment.id) return;
    briefAppliedFor.current = assignment.id;
    const text = briefAsInstructions(assignmentBrief.businessInfo, assignmentBrief.businessAddress);
    if (!text) return;
    setFormData(prev => (prev.textInstructions.trim() ? prev : { ...prev, textInstructions: text }));
    // Keyed on the job and on the brief arriving; the assignment object itself changes every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.id, assignmentBrief.loading, assignmentBrief.businessInfo, assignmentBrief.businessAddress]);
  /** The selected cartoon duo, or null for a normal human-model ad. */
  const activePack = getCharacterPack(formData.characterPack);

  /**
   * Previews of the client's uploaded location photos, so the "attach this one" instruction can
   * show the actual picture instead of a number the member has to count out against their files.
   * Revoked when the file list changes so the blobs do not accumulate across generations.
   */
  const storeImageUrls = useMemo(
    () => files.storeImage.map(file => URL.createObjectURL(file)),
    [files.storeImage],
  );
  useEffect(() => () => { storeImageUrls.forEach(URL.revokeObjectURL); }, [storeImageUrls]);

  /** Each main-frame prompt's attachment, resolved to the real photo it points at. */
  const mainFrameAttachments = useMemo(
    () => buildPromptAttachments(
      outputs?.mainFramePrompts || [],
      storeImageUrls,
      files.storeImage.map(f => f.name),
    ),
    [outputs?.mainFramePrompts, storeImageUrls, files.storeImage],
  );
  /**
   * The special category was sold, not chosen here — a member cannot turn a Motu & Patlu ad into
   * an ordinary one, because that is what the client paid for.
   */
  const packLocked = !!assignment?.characterPack && !!activePack;

  /**
   * The background was sold too, and it is fixed for whoever is making the ad.
   *
   * ── Why the member no longer answers this ────────────────────────────────────────────────────
   * They used to, on the reasoning that photographs can arrive — or fail to arrive — after the
   * sale. In practice that made the answer the member's, and it is not theirs to give: a client
   * who paid for their own showroom and got a generated interior has been sold one thing and
   * delivered another, and nobody upstream ever learned it had happened. It is also the single
   * fact that decides which prompt the generator writes, so a member flipping it mid-job quietly
   * rebuilds the ad against a brief nobody agreed.
   *
   * So it is read-only here, and changed by the two people who can answer for it: the tech team
   * leader (through Work Assign / the assignment editor) or the sales member who sold it (through
   * their own sale). Either change re-raises the spec-changed dialog on this screen, so a member
   * half-way through hears about it rather than finding out on delivery.
   *
   * Unlocked for work created outside an assignment — the ad-creation tool used directly, and every
   * assignment made before the background was carried, both of which have nobody to defer to.
   */
  const backgroundLocked = assignment?.realLocationProvided !== undefined;

  // Extract business name whenever outputs change
  useEffect(() => {
    if (outputs?.businessInfo && onBusinessNameExtracted) {
      const name = extractBusinessNameFromInfo(outputs.businessInfo);
      if (name) {
        onBusinessNameExtracted(name);
      }
    }
  }, [outputs?.businessInfo]);

  // Auto-load the last saved generation when opening from an assignment
  useEffect(() => {
    if (!assignment?.savedGenerationId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'ai_generations', assignment.savedGenerationId!));
        if (!snap.exists()) return;
        const item = { id: snap.id, ...snap.data() } as SavedGeneration;
        restoreGeneration(item, true);
      } catch (e) {
        console.error('Failed to auto-load saved generation:', e);
      }
    })();
  }, [assignment?.savedGenerationId]);

  const loadSavedItems = async () => {
    if (!user) return;
    setLoadingSaved(true);
    try {
      const q = query(collection(db, 'ai_generations'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const items: SavedGeneration[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedGeneration));
      items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setSavedItems(items);
    } catch (error) {
      console.error('Failed to load saved items:', error);
    } finally {
      setLoadingSaved(false);
    }
  };

  /** Everything a saved generation stores, for both the auto-save and the Save button. */
  const generationPayload = (o: GeneratedOutputs) => ({
    userId: user?.uid,
    userName: user?.name || user?.email,
    ...(assignmentId ? { workAssignmentId: assignmentId } : {}),
    businessName: extractBusinessNameFromInfo(o.businessInfo) || 'Untitled',
    businessType: o.businessInfo?.businessType || o.businessInfo?.type || 'Business',
    businessInfo: o.businessInfo,
    mainFramePrompts: o.mainFramePrompts,
    headerPrompt: o.headerPrompt,
    posterPrompt: o.posterPrompt,
    voiceOverScript: o.voiceOverScript,
    veoPrompts: o.veoPrompts,
    stockImagePrompts: o.stockImagePrompts,
    overlayTexts: o.overlayTexts || null,
    posterConcepts: o.posterConcepts || null,
    // Saved with the script so a refine on a reopened generation holds to the same message.
    coreMessage: o.coreMessage || null,
    adType: formData.adType,
    festivalName: formData.festivalName,
    characterPack: formData.characterPack || null,
    locationMode: formData.locationMode || null,
    gender: formData.gender || ModelGender.FEMALE,
    attireType: formData.attireType,
    customAttire: formData.customAttire || '',
    duration: formData.duration,
    creationMode: creationMode,
    aspectRatio: formData.aspectRatio,
    language: formData.language,
    noLogo: formData.noLogo || false,
    logoNameText: formData.logoNameText || '',
    posterSize: formData.posterSize || DEFAULT_POSTER_SIZE,
    posterStyle: formData.posterStyle || AUTO_POSTER_STYLE,
    posterOccasion: formData.posterOccasion || '',
    posterTextLanguage: formData.posterTextLanguage || 'English',
  });

  /**
   * Writes the generation on screen: a new document the first time, the same document after that.
   * Returns its id. The job is pointed at it so reopening the job reopens this work.
   */
  const persistGeneration = async (o: GeneratedOutputs, forceNew = false): Promise<string> => {
    const payload = generationPayload(o);
    let id = forceNew ? null : generationDocIdRef.current;
    if (id) {
      await setDoc(doc(db, 'ai_generations', id), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      const ref = await addDoc(collection(db, 'ai_generations'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      id = ref.id;
      generationDocIdRef.current = id;
    }
    if (assignmentId) {
      await updateDoc(doc(db, 'work_assignments', assignmentId), { savedGenerationId: id });
    }
    return id;
  };

  const handleSave = async () => {
    if (!user || !outputs) return;
    setIsSaving(true);
    try {
      await persistGeneration(outputs);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      loadSavedItems();
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Puts a saved generation back on screen — its outputs, its settings, and its document id, so a
   * later Save updates it rather than writing a copy. Used by the auto-load when a job opens and by
   * the Saved Items list. `keepDuration` holds the length an assignment fixed.
   */
  const restoreGeneration = (item: SavedGeneration, keepDuration: boolean) => {
    const savedFestivalName = item.festivalName || '';
    const isKnownFestival = savedFestivalName ? upcomingFestivals.includes(savedFestivalName) : false;
    setSelectedFestivalOption(savedFestivalName ? (isKnownFestival ? savedFestivalName : CUSTOM_FESTIVAL_OPTION) : '');
    setCustomFestivalName(savedFestivalName && !isKnownFestival ? savedFestivalName : '');
    generationDocIdRef.current = item.id || null;
    setViewingSavedItem(item);
    setVoiceOverRevision(null);
    setOutputs({
      businessInfo: item.businessInfo,
      mainFramePrompts: item.mainFramePrompts || [],
      headerPrompt: item.headerPrompt,
      posterPrompt: item.posterPrompt || '',
      voiceOverScript: item.voiceOverScript,
      veoPrompts: item.veoPrompts,
      hasProductImages: false,
      productImageCount: 0,
      stockImagePrompts: item.stockImagePrompts || null,
      overlayTexts: item.overlayTexts || null,
      posterConcepts: item.posterConcepts || null,
      coreMessage: item.coreMessage || null,
    });
    setFormData(prev => ({
      ...prev,
      adType: item.adType as AdType,
      festivalName: item.festivalName || '',
      characterPack: item.characterPack || undefined,
      locationMode: item.locationMode === 'real_provided' || item.locationMode === 'ai_generated' ? item.locationMode : undefined,
      attireType: item.attireType as AttireType,
      ...(item.gender ? { gender: item.gender as ModelGender } : {}),
      ...(item.customAttire !== undefined ? { customAttire: item.customAttire } : {}),
      // Only restore duration when not locked by an assignment
      ...(keepDuration ? {} : { duration: item.duration || 16, durationMode: 'preset' as const }),
      ...(item.aspectRatio ? { aspectRatio: item.aspectRatio as any } : {}),
      ...(item.language ? { language: item.language } : {}),
      ...(item.noLogo !== undefined ? { noLogo: item.noLogo } : {}),
      ...(item.logoNameText !== undefined ? { logoNameText: item.logoNameText } : {}),
      // A poster job's canvas, style and occasion come from the job, not from an older save.
      ...(item.posterSize && !posterLocks.size ? { posterSize: item.posterSize } : {}),
      ...(item.posterStyle && !posterLocks.style ? { posterStyle: item.posterStyle } : {}),
      ...(item.posterOccasion !== undefined && !posterLocks.occasion ? { posterOccasion: item.posterOccasion || '' } : {}),
      ...(item.posterTextLanguage ? { posterTextLanguage: item.posterTextLanguage } : {}),
    }));
    // A poster job never switches to video, whatever an older save says.
    if (!posterJob && (item.creationMode === 'video' || item.creationMode === 'poster')) {
      setCreationMode(item.creationMode);
    }
  };

  const handleSelectSavedItem = (item: SavedGeneration) => {
    restoreGeneration(item, durationLocked);
    setShowSavedItems(false);
  };

  const handleDeleteSavedItem = (id: string) => {
    setSavedItems(prev => prev.filter(item => item.id !== id));
  };

  const handleRefineSection = async (section: SectionType, additionalInstructions: string) => {
    if (!outputs) return;
    setRefiningSection(section);
    try {
      let currentContent = '';
      switch (section) {
        case 'mainFrame': currentContent = outputs.mainFramePrompts.join('\n###CLIP###\n'); break;
        case 'header': currentContent = outputs.headerPrompt; break;
        case 'poster': currentContent = outputs.posterPrompt; break;
        case 'voiceOver': currentContent = outputs.voiceOverScript; break;
        case 'veo': currentContent = outputs.veoPrompts.join('\n###SEGMENT###\n'); break;
      }
      const refinedContent = await refineSection(section, currentContent, additionalInstructions, formData, outputs.businessInfo);
      /**
       * A refine that could not be applied hands back exactly what it was given (see
       * refineSection: a special-category reply that has lost its two-character format is
       * rejected rather than allowed to overwrite the ad). Saying so beats redrawing the same
       * script and leaving the member to wonder whether their instruction was too vague.
       */
      if (refinedContent.trim() === currentContent.trim()) {
        await showAlert({
          title: "Nothing changed",
          description: "That refinement could not be applied without breaking the script's format, so the original has been kept. Try wording the change more specifically and refine again.",
          confirmText: "OK",
        });
        return;
      }
      setOutputs(prev => {
        if (!prev) return prev;
        switch (section) {
          case 'mainFrame': {
            const clips = refinedContent.split('###CLIP###').map(p => p.trim()).filter(p => p.length > 0);
            return { ...prev, mainFramePrompts: clips.length > 0 ? clips : [refinedContent] };
          }
          case 'header': return { ...prev, headerPrompt: refinedContent };
          case 'poster': return { ...prev, posterPrompt: refinedContent };
          case 'voiceOver': return { ...prev, voiceOverScript: refinedContent };
          case 'veo': {
            const segs = refinedContent.split("###SEGMENT###").map(p => p.trim()).filter(p => p.length > 0);
            return { ...prev, veoPrompts: segs.length > 0 ? segs : [refinedContent] };
          }
          default: return prev;
        }
      });

    } catch (error: any) {
      // Silently swallowed until now: the spinner stopped, the content did not move, and nobody
      // was told why. A refine is a paid model call — its failure has to be visible.
      console.error('Refinement error:', error);
      await showAlert({
        title: "Refinement failed",
        description: error?.message || "The refinement could not be completed. Your existing content is unchanged — please try again.",
        confirmText: "OK",
      });
    } finally {
      setRefiningSection(null);
    }
  };

  /**
   * Refines the voice-over — the whole script, or one clip from its own card (`clip`, 0-based).
   *
   * Only the clips the request touches change (services/geminiService refineVoiceOver), the member
   * sees exactly what changed with an Undo, and only those clips' video prompts are re-directed, from
   * their existing frames.
   */
  const handleRefineVoiceOver = async (instruction: string, clip: number | null = null) => {
    if (!outputs) return;
    setRefiningSection('voiceOver');
    setRefiningClip(clip);
    const before = outputs.voiceOverScript;
    const previousVeo = outputs.veoPrompts || [];
    try {
      const result = await refineVoiceOver({
        script: before,
        instruction,
        clip,
        formData,
        businessInfo: outputs.businessInfo,
        coreMessage: outputs.coreMessage,
      });
      if (result.notApplied) {
        await showAlert({
          title: "Nothing changed",
          description: `${result.understood ? `Understood: ${result.understood}\n\n` : ''}${result.notApplied}`,
          confirmText: "OK",
        });
        return;
      }
      setOutputs(prev => (prev ? { ...prev, voiceOverScript: result.script } : prev));
      setVoiceOverRevision({ instruction, understood: result.understood, before, after: result.script, changed: result.changed, previousVeo });

      if (creationMode === 'video' && previousVeo.length > 0) {
        try {
          const fresh = await regenerateVeoForClips(result.script, formData, outputs.mainFramePrompts || [], result.changed);
          setOutputs(prev => {
            // The member may have undone or refined again while these were being written.
            if (!prev || prev.voiceOverScript !== result.script) return prev;
            const veoPrompts = [...prev.veoPrompts];
            fresh.forEach(({ index, prompt }) => { veoPrompts[index] = prompt; });
            return { ...prev, veoPrompts };
          });
        } catch (e) {
          console.error('Re-directing the video prompts after a voice-over refine failed:', e);
        }
      }
    } catch (error: any) {
      console.error('Voice-over refinement error:', error);
      await showAlert({
        title: "Refinement failed",
        description: error?.message || "The refinement could not be completed. Your existing script is unchanged — please try again.",
        confirmText: "OK",
      });
    } finally {
      setRefiningSection(null);
      setRefiningClip(null);
    }
  };

  /** Puts the script and the video prompts back exactly as they were before the last refine. */
  const handleUndoVoiceOverRevision = () => {
    if (!voiceOverRevision) return;
    const { before, previousVeo } = voiceOverRevision;
    setOutputs(prev => (prev ? { ...prev, voiceOverScript: before, veoPrompts: previousVeo } : prev));
    setVoiceOverRevision(null);
  };

  /**
   * Refines Veo prompts — one clip or all. A prompt whose spoken dialogue the edit altered is kept as
   * it was, because the video must say what the voice-over says.
   */
  const handleRefineVeo = async (instruction: string, clip: number | null = null) => {
    if (!outputs?.veoPrompts?.length) return;
    setRefiningSection('veo');
    setRefiningClip(clip);
    try {
      const result = await refineVeoPrompts({ prompts: outputs.veoPrompts, instruction, clip });
      if (result.changed.length > 0) {
        setOutputs(prev => (prev ? { ...prev, veoPrompts: result.prompts } : prev));
      }
      if (result.changed.length === 0 || result.rejected.length > 0) {
        const kept = result.rejected.map(i => `Clip ${i + 1}`).join(', ');
        await showAlert({
          title: result.changed.length === 0 ? "Nothing changed" : "Partly applied",
          description: result.rejected.length > 0
            ? `${kept} kept ${result.rejected.length === 1 ? 'its' : 'their'} original prompt, because the edit changed the spoken dialogue — the video has to say exactly what the voice-over says. Refine the Voice Over Script to change the words.`
            : "The prompt came back the same. Try describing the change more specifically.",
          confirmText: "OK",
        });
      }
    } catch (error: any) {
      console.error('Veo refinement error:', error);
      await showAlert({
        title: "Refinement failed",
        description: error?.message || "The refinement could not be completed. Your existing prompts are unchanged — please try again.",
        confirmText: "OK",
      });
    } finally {
      setRefiningSection(null);
      setRefiningClip(null);
    }
  };

  /** How many clips this run will produce — the pasted script's own count when it has one. */
  const runClipCount = () => {
    const pasted = useCustomScript && customScript.trim() ? parseLabeledClips(customScript).length : 0;
    return pasted > 0 ? pasted : Math.max(1, Math.round((formData.duration || 32) / 8));
  };

  /** The inputs that decide how long this run takes, frozen at Start. See utils/generationEta. */
  const currentRunProfile = (): RunProfile => ({
    mode: creationMode === 'poster' ? 'poster' : 'video',
    clipCount: runClipCount(),
    fileCount: (files.logo ? 1 : 0) + files.visitingCard.length + files.storeImage.length
      + files.productImages.length + files.flyersPosters.length + files.voiceRecording.length
      + files.textInstructionsFile.length,
    locationPhotos: creationMode === 'video' && formData.locationMode === 'real_provided' ? files.storeImage.length : 0,
    characterPack: creationMode === 'video' && !!activePack,
    customScript: creationMode === 'video' && useCustomScript && !!customScript.trim(),
    conceptCount: formData.posterConceptCount || DEFAULT_POSTER_CONCEPT_COUNT,
  });

  /** What the member is preparing for while this run goes, frozen at Start. */
  const currentRunFacts = (): RunFacts => {
    const onLocation = creationMode === 'video' && formData.locationMode === 'real_provided' && files.storeImage.length > 0;
    return {
      mode: creationMode === 'poster' ? 'poster' : 'video',
      clipCount: runClipCount(),
      aspectRatio: formData.aspectRatio === '16:9' ? '16:9' : '9:16',
      hasLogo: !!files.logo,
      nameBoard: !files.logo && !!(formData.noLogo && formData.logoNameText?.trim()),
      onLocation,
      locationPhotos: onLocation ? files.storeImage.length : 0,
      castLabel: creationMode === 'video' && activePack ? activePack.label : '',
      conceptCount: formData.posterConceptCount || DEFAULT_POSTER_CONCEPT_COUNT,
    };
  };

  const handleGenerate = async () => {
    const hasNameBoard = !!(formData.noLogo && formData.logoNameText?.trim());
    if (!files.logo && !hasNameBoard) {
      await showAlert({ title: "Missing Logo", description: "Upload a logo image, OR tick 'No logo' and enter the business name to use as a name board.", confirmText: "OK" });
      return;
    }
    if (creationMode === 'poster' && !isValidPosterSize(formData.posterSize)) {
      await showAlert({ title: "Poster size", description: "Enter a valid custom size — a ratio like 5 : 7, or pixels like 1080 × 1350.", confirmText: "OK" });
      return;
    }
    if (creationMode === 'video' && formData.adType === AdType.FESTIVAL && !formData.festivalName.trim()) {
      await showAlert({ title: "Missing Festival", description: "Please select a festival or enter a custom festival name.", confirmText: "OK" });
      return;
    }
    // "Use their photos" with no photos attached would silently fall back to an invented
    // location — the opposite of what was promised to the client, so stop and say so. Every video
    // ad, not only a special-category one: the human-model ad is shot in the same photographs now.
    if (creationMode === 'video' && formData.locationMode === 'real_provided' && files.storeImage.length === 0) {
      await showAlert({
        title: "Location photos missing",
        description: `You chose to use the client's real location for this ${activePack ? `${activePack.label} ` : ''}ad, but no photos are attached. Upload them into "Store / Office Image", or switch the Background to "AI — build the location".`,
        confirmText: "OK",
      });
      return;
    }
    /**
     * This run's own controller, held in a local as well as the shared ref.
     *
     * The callbacks used to read `abortControllerRef.current`, which after Stop-then-Start points at
     * the NEW run's controller — so the stopped run saw an un-aborted signal, kept writing its step
     * text and partial outputs over the new run, and on finishing cleared the ref and disabled the
     * new run's Stop button. Every check below asks about THIS run and nothing else.
     */
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const stopped = () => controller.signal.aborted;
    const runStartedAt = Date.now();
    const runProfile = currentRunProfile();
    setErrorModalDismissed(false);
    setStatus({ step: 'Initializing...', isProcessing: true, error: null, progress: 0 });
    setOutputs(null);
    setActiveRun({ id: runStartedAt, profile: runProfile, checkpoints: [{ percent: 0, at: runStartedAt }], facts: currentRunFacts() });
    setMissionDone({});
    setGuideOpen(false);
    setVoiceOverRevision(null);
    setTimeout(() => outputPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    /** Each reported percent is a checkpoint the countdown re-anchors on. */
    const checkpoints: Checkpoint[] = [{ percent: 0, at: runStartedAt }];
    const onRunProgress = (step: string, progress: number) => {
      if (stopped()) throw new Error('Generation stopped by user');
      setStatus(prev => ({ ...prev, step, progress }));
      if (progress !== checkpoints[checkpoints.length - 1].percent) {
        checkpoints.push({ percent: progress, at: Date.now() });
        const snapshot = [...checkpoints];
        setActiveRun(prev => (prev && prev.id === runStartedAt ? { ...prev, checkpoints: snapshot } : prev));
      }
    };
    try {
      let generatedResult: GeneratedOutputs;
      if (creationMode === 'poster') {
        generatedResult = await generatePosterConcepts(formData, files, onRunProgress);
      } else {
        generatedResult = await generateAdAssets(formData, files, onRunProgress, {
          includeProductsInHeader,
          customScript: useCustomScript ? customScript : undefined,
          // A partial that lands after Stop belongs to a run the member has already abandoned.
          onPartialResult: (partial) => { if (!stopped()) setOutputs(partial); }
        });
      }
      // The model calls cannot be cancelled mid-flight, so a stopped run can still finish. Its result
      // is not what the member is looking at any more.
      if (stopped()) throw new Error('Generation stopped by user');
      setOutputs(generatedResult);
      setStatus(prev => ({ ...prev, isProcessing: false, step: 'Completed', progress: 100 }));
      // Teach the countdown how long this browser's runs really take. See utils/generationEta.
      const timing = measureRun(runProfile, checkpoints, Date.now());
      if (timing) saveRunTiming(timing);

      // Auto-save to history. A new generation is a new version, so it always starts a new document;
      // Save after this updates that same document rather than duplicating it.
      if (user) {
        try {
          await persistGeneration(generatedResult, true);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
          loadSavedItems();
        } catch (e) {
          console.error('Auto-save failed:', e);
        }
      }
    } catch (error: any) {
      const isStopped = error.message?.includes('stopped by user') || stopped();
      // A run the member stopped and then replaced must not write its error over the new one.
      if (abortControllerRef.current === controller || !isStopped) {
        setStatus(prev => ({ ...prev, isProcessing: false, error: isStopped ? 'Generation stopped.' : (error.message || "An unexpected error occurred.") }));
      }
    } finally {
      // Only this run's own controller — clearing a newer run's would disable its Stop button.
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStatus(prev => ({ ...prev, step: 'Stopping...', isProcessing: false }));
    }
  };

  const handleRefineConcept = async (index: number, instruction: string) => {
    const concept = outputs?.posterConcepts?.[index];
    if (!outputs || !concept || !instruction.trim()) return;
    setRefiningConcept(index);
    try {
      const next = await refinePosterConcept(concept, instruction, formData, outputs.businessInfo, !!files.logo);
      setOutputs(prev => {
        if (!prev?.posterConcepts) return prev;
        const list = [...prev.posterConcepts];
        list[index] = next;
        return { ...prev, posterConcepts: list };
      });
    } catch (error: any) {
      await showAlert({
        title: "Refinement failed",
        description: error?.message || "The concept could not be refined. It is unchanged — please try again.",
        confirmText: "OK",
      });
    } finally {
      setRefiningConcept(null);
    }
  };

  const handleGenerateStockImages = async () => {
    if (!outputs || !outputs.voiceOverScript) return;
    setIsGeneratingStock(true);
    setStockImageError(null);
    try {
      const clipCount = outputs.veoPrompts?.length || outputs.mainFramePrompts?.length || Math.round(formData.duration / 8);
      const stockPrompts = await generateStockImagePrompts(outputs.voiceOverScript, outputs.businessInfo, formData.adType, formData.festivalName, stockImageTheme, formData.aspectRatio, clipCount);
      setOutputs(prev => prev ? { ...prev, stockImagePrompts: stockPrompts } : prev);
    } catch (error: any) {
      setStockImageError(error.message || 'Failed to generate stock image prompts.');
    } finally {
      setIsGeneratingStock(false);
    }
  };

  // #10 — refine a single B-roll image prompt
  const handleRefineStockImage = async (idx: number) => {
    if (!outputs?.stockImagePrompts || !stockRefineText.trim()) return;
    setRefiningStockIdx(idx);
    try {
      const current = outputs.stockImagePrompts[idx];
      const refined = await refineStockImagePrompt(current.prompt, stockRefineText.trim(), formData.aspectRatio);
      setOutputs(prev => {
        if (!prev?.stockImagePrompts) return prev;
        const next = [...prev.stockImagePrompts];
        next[idx] = { ...next[idx], prompt: refined };
        return { ...prev, stockImagePrompts: next };
      });
      setStockRefineIdx(null);
      setStockRefineText('');
    } catch (error: any) {
      setStockImageError(error.message || 'Failed to refine image prompt.');
    } finally {
      setRefiningStockIdx(null);
    }
  };

  // #14 — generate per-clip on-screen overlay texts + CapCut SFX suggestions
  const handleGenerateOverlayTexts = async () => {
    if (!outputs || !outputs.voiceOverScript) return;
    setIsGeneratingOverlay(true);
    setOverlayError(null);
    try {
      const items = await generateOverlayTexts(outputs.voiceOverScript, outputs.businessInfo, formData.language);
      setOutputs(prev => prev ? { ...prev, overlayTexts: items } : prev);
    } catch (error: any) {
      setOverlayError(error.message || 'Failed to generate overlay texts.');
    } finally {
      setIsGeneratingOverlay(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">
      {ConfirmDialog}

      {/* The admin changed this job while the member is holding it. Must be read before they
          carry on — otherwise the next half hour produces an ad to the previous brief. */}
      {pendingSpec && (
        <SpecUpdateDialog
          changes={pendingSpec.changes}
          hasExistingOutputs={!!outputs}
          isDark={isDark}
          onAcknowledge={acknowledgeSpecUpdate}
        />
      )}

      {/* Generation-failed popup — centered so the user can't miss it */}
      {status.error && status.error !== 'Generation stopped.' && !errorModalDismissed && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={cn("w-full max-w-md rounded-xl border shadow-2xl p-6", isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200")}>
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className={cn("text-lg font-bold text-center mb-2", isDark ? "text-white" : "text-slate-800")}>Ad Generation Failed</h3>
            <p className={cn("text-sm text-center rounded-lg border px-3 py-2 mb-4 break-words", isDark ? "bg-red-900/20 border-red-800/50 text-red-300" : "bg-red-50 border-red-200 text-red-700")}>
              {status.error}
            </p>
            <div className={cn("text-sm space-y-2 mb-5", isDark ? "text-slate-300" : "text-slate-600")}>
              <p className="font-semibold">What to do:</p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>Close this website (tab) completely, open it again, and retry the generation.</li>
                <li>If it fails again, wait <strong>5–10 minutes</strong> and then try once more.</li>
                <li>If the same problem still continues after that, <strong>contact your admin</strong>.</li>
              </ol>
            </div>
            <button onClick={() => setErrorModalDismissed(true)}
              className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {showSavedItems && (
        <SavedItems items={savedItems} onSelect={handleSelectSavedItem} onDelete={handleDeleteSavedItem}
          onClose={() => setShowSavedItems(false)} isLoading={loadingSaved} userRole={user?.role} />
      )}

      {/* Top Bar — DTS branded */}
      <div className={cn("relative border-b px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2 shrink-0 backdrop-blur-xl",
        isDark ? "bg-slate-900/90 border-slate-800" : "bg-white/90 border-slate-200"
      )}>
        {/* brand hairline */}
        <div className={cn("absolute bottom-0 inset-x-0 h-[2px] opacity-80", BRAND_GRADIENT)} />

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={onClose} aria-label="Back"
            className={cn("flex items-center gap-1 text-sm px-2 sm:px-3 py-1.5 rounded-xl transition-colors shrink-0",
              isDark ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"
            )}>
            <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo variant="mark" on={isDark ? "dark" : "auto"} alt="DTS — Dream Team Services"
              className="h-6 sm:h-7 w-auto shrink-0" />
            <div className="min-w-0 leading-tight">
              <h1 className={cn("text-base sm:text-lg font-extrabold tracking-tight", BRAND_TEXT)}>AdGen.ai</h1>
              <p className={cn("hidden sm:block text-[9px] font-semibold tracking-[0.18em] uppercase", isDark ? "text-slate-500" : "text-slate-400")}>
                Dream Team Services
              </p>
            </div>
          </div>
        </div>

        {/* Assignment Info Banner */}
        {assignment && (
          <div className={cn("hidden lg:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-xs border",
            isDark ? "bg-slate-800/80 text-slate-300 border-slate-700" : "bg-slate-50 text-slate-600 border-slate-200"
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", BRAND_GRADIENT)} />
            <span className="font-semibold truncate max-w-[200px]">{assignment.businessName || assignment.displayTitle}</span>
            <span className="opacity-40">·</span>
            <span className="capitalize">{assignment.category}</span>
            <span className="opacity-40">·</span>
            <span>{isPosterCategory(assignment.category) ? posterSizeLabel(assignment.posterSize) : `${assignment.clipCount} clips + EC`}</span>
            <span className="font-mono text-[10px] opacity-50">{assignment.uniqueId}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onComplete && (
            // Disabled and visibly busy while submitting. Submitting does several writes and can
            // take seconds on mobile data; a button that looked unchanged the whole time is what
            // led members to tap it repeatedly and fire a round of notifications each time.
            <button
              onClick={onComplete}
              disabled={completing}
              data-test="mark-complete"
              className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100">
              {completing
                ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Submitting…</span></>
                : <><CheckCircle2 className="w-4 h-4" /><span className="hidden sm:inline">Mark Complete</span><span className="sm:hidden">Done</span></>}
            </button>
          )}
          <button onClick={onClose}
            className={cn("flex items-center gap-1.5 text-xs sm:text-sm font-medium px-3 sm:px-4 py-2 rounded-xl border transition-colors",
              isDark ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
            )}>
            <Home className="w-4 h-4" /><span className="hidden md:inline">Close &amp; back to home</span><span className="md:hidden">Home</span>
          </button>
        </div>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto relative">
        {/* ambient brand glows */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 rounded-full bg-blue-600/10 blur-3xl" />
        </div>
        <main className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* LEFT: INPUTS */}
            <div className="lg:col-span-5 space-y-5 sm:space-y-6">
              {/* File Upload */}
              <div className={cn("rounded-2xl border p-4 sm:p-6 shadow-xl",
                isDark ? "bg-slate-900/70 border-slate-800 shadow-black/20 backdrop-blur" : "bg-white/90 border-slate-200 shadow-slate-200/60 backdrop-blur")}>
                <div className="flex items-center gap-3 mb-5 sm:mb-6">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/25", BRAND_GRADIENT)}>
                    <Layout className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className={cn("text-base sm:text-lg font-bold leading-tight", isDark ? "text-white" : "text-slate-800")}>Assets &amp; Files</h2>
                    <p className={cn("text-[11px]", isDark ? "text-slate-500" : "text-slate-400")}>Step 1 · Upload the business material</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {!formData.noLogo && (
                    <FileUpload label="Business Logo" accept="image/png, image/jpeg" required value={files.logo} onChange={(f) => setFiles(prev => ({ ...prev, logo: f as File }))} helperText="High resolution PNG/JPG" />
                  )}
                  {/* #5 — No-logo option: use business name as a physical name board behind the model */}
                  <div className={cn("rounded-lg border p-3", isDark ? "border-slate-600 bg-slate-700/30" : "border-slate-200 bg-slate-50")}>
                    <label className={cn("flex items-center gap-2 text-sm font-medium cursor-pointer", isDark ? "text-slate-300" : "text-slate-700")}>
                      <input type="checkbox" checked={!!formData.noLogo}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormData(prev => ({ ...prev, noLogo: checked }));
                          if (checked) setFiles(prev => ({ ...prev, logo: null }));
                        }}
                        className="rounded border-slate-300" />
                      NO LOGO — use business name as a name board
                    </label>
                    {formData.noLogo && (
                      <input
                        type="text"
                        value={formData.logoNameText || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, logoNameText: e.target.value.toUpperCase() }))}
                        placeholder="BUSINESS NAME"
                        className={cn("mt-2 w-full border rounded-lg px-3 py-2 text-sm uppercase tracking-wide focus:ring-2 outline-none",
                          isDark ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 placeholder-slate-400 focus:ring-blue-200"
                        )}
                      />
                    )}
                  </div>
                  <FileUpload label="Visiting Card" accept="image/*" multiple maxFiles={2} value={files.visitingCard} onChange={(f) => setFiles(prev => ({ ...prev, visitingCard: (f ? (Array.isArray(f) ? f : [f]) : []) as File[] }))} helperText="Front & back (max 2)" />
                  
                  {/* Collapsible sections */}
                  {[
                    { key: 'storeOffice' as const, label: 'Store/Office Images', content: <FileUpload label="" accept="image/*" multiple value={files.storeImage} onChange={(f) => setFiles(prev => ({ ...prev, storeImage: f as File[] }))} helperText="Upload one or more store/office images" /> },
                    { key: 'productImages' as const, label: 'Product Images', content: (
                      <FileUpload label="" accept="image/*" multiple value={files.productImages} onChange={(f) => setFiles(prev => ({ ...prev, productImages: f as File[] }))} helperText="Will appear in main frame & footer" />
                    )},
                    { key: 'flyersPosters' as const, label: 'Flyers / Offer Posters', content: <FileUpload label="" accept="image/*" multiple value={files.flyersPosters} onChange={(f) => setFiles(prev => ({ ...prev, flyersPosters: f as File[] }))} helperText="Images only — screenshot a PDF flyer instead" /> },
                    { key: 'voiceInstructions' as const, label: 'Voice Instructions', content: <FileUpload label="" accept="audio/*" multiple value={files.voiceRecording} onChange={(f) => setFiles(prev => ({ ...prev, voiceRecording: (f ? (Array.isArray(f) ? f : [f]) : []) as File[] }))} helperText="Record your requirements" /> },
                  ].map(({ key, label, content: sectionContent }) => (
                    <div key={key} className={cn("border rounded-lg overflow-hidden", isDark ? "border-slate-600" : "border-slate-200")}>
                      <button onClick={() => toggleSection(key)}
                        className={cn("w-full flex items-center justify-between px-3 py-2 text-sm font-semibold transition-colors",
                          isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                        )}>
                        <span>{label}</span>
                        <ChevronDown className={cn("w-4 h-4 transition-transform", !collapsedSections[key] && "rotate-180")} />
                      </button>
                      {!collapsedSections[key] && <div className="p-3 pt-0">{sectionContent}</div>}
                    </div>
                  ))}

                  {/* Product images header checkbox - always visible */}
                  {files.productImages.length > 0 && (
                    <label className={cn("flex items-center gap-2 text-xs cursor-pointer", isDark ? "text-slate-400" : "text-slate-600")}>
                      <input type="checkbox" checked={includeProductsInHeader} onChange={(e) => setIncludeProductsInHeader(e.target.checked)} className="rounded border-slate-300" />
                      Include products in header design
                    </label>
                  )}

                  {/* Text Instructions */}
                  <div>
                    <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Business Messages / Text Instructions</label>
                    <textarea className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none mb-2",
                        isDark ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                      )} rows={4} placeholder="Paste business messages, requirements, offers..."
                      value={formData.textInstructions} onChange={(e) => setFormData(prev => ({ ...prev, textInstructions: e.target.value }))} />
                    <FileUpload label="" accept=".txt,.doc,.docx" multiple value={files.textInstructionsFile} onChange={(f) => setFiles(prev => ({ ...prev, textInstructionsFile: (f ? (Array.isArray(f) ? f : [f]) : []) as File[] }))} helperText="Or upload a text file — for a PDF, paste its text above" />
                  </div>
                </div>
              </div>

              {/* Configuration */}
              <div className={cn("rounded-2xl border p-4 sm:p-6 shadow-xl",
                isDark ? "bg-slate-900/70 border-slate-800 shadow-black/20 backdrop-blur" : "bg-white/90 border-slate-200 shadow-slate-200/60 backdrop-blur")}>
                <div className="flex items-center gap-3 mb-5 sm:mb-6">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg shadow-violet-600/25", BRAND_GRADIENT)}>
                    <Type className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className={cn("text-base sm:text-lg font-bold leading-tight", isDark ? "text-white" : "text-slate-800")}>Configuration</h2>
                    <p className={cn("text-[11px]", isDark ? "text-slate-500" : "text-slate-400")}>Step 2 · Choose how the ad is made</p>
                  </div>
                </div>
                <div className="space-y-5">
                  {/* Creation Mode */}
                  <div>
                    <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Creation Mode</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ mode: 'video' as const, icon: Video, label: 'Video Ad' }, { mode: 'poster' as const, icon: PenTool, label: 'Poster Creation' }].map(({ mode, icon: Icon, label }) => (
                        <button key={mode} onClick={() => setCreationMode(mode)}
                          disabled={posterJob && mode === 'video'}
                          data-test={`creation-mode-${mode}`}
                          className={cn("flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                            creationMode === mode
                              ? cn("border-transparent text-white shadow-lg shadow-blue-600/25", BRAND_GRADIENT)
                              : (isDark ? "border-slate-700 hover:border-slate-600 text-slate-400 bg-slate-800/40" : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white")
                            , posterJob && mode === 'video' && "opacity-40 cursor-not-allowed"
                          )}>
                          <Icon className="w-4 h-4" /><span>{label}</span>
                        </button>
                      ))}
                    </div>
                    {posterJob && (
                      <p className={cn("mt-1.5 text-[11px]", isDark ? "text-slate-400" : "text-slate-500")}>🔒 This job is a poster — fixed by the assignment.</p>
                    )}
                  </div>

                  {/* Poster Creation — the canvas, the style from the team's library, the occasion. */}
                  {creationMode === 'poster' && (
                    <div className={cn("rounded-xl border p-3 sm:p-4", isDark ? "border-slate-700 bg-slate-800/40" : "border-slate-200 bg-slate-50/60")}>
                      <PosterSpecFields
                        posterSize={formData.posterSize || DEFAULT_POSTER_SIZE}
                        posterStyle={formData.posterStyle || AUTO_POSTER_STYLE}
                        occasion={formData.posterOccasion || ''}
                        locked={posterLocks}
                        onChange={({ posterSize, posterStyle, occasion }) => setFormData(prev => ({
                          ...prev,
                          ...(posterSize !== undefined ? { posterSize } : {}),
                          ...(posterStyle !== undefined ? { posterStyle } : {}),
                          ...(occasion !== undefined ? { posterOccasion: occasion } : {}),
                        }))}
                      />
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                          <label className={cn("block text-sm font-medium mb-1", isDark ? "text-slate-300" : "text-muted-foreground")}>Concepts to write</label>
                          <select
                            data-test="poster-concept-count"
                            value={formData.posterConceptCount || DEFAULT_POSTER_CONCEPT_COUNT}
                            onChange={(e) => setFormData(prev => ({ ...prev, posterConceptCount: parseInt(e.target.value, 10) }))}
                            className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                              isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200")}
                          >
                            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} concept{n === 1 ? '' : 's'}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={cn("block text-sm font-medium mb-1", isDark ? "text-slate-300" : "text-muted-foreground")}>Text on the poster</label>
                          <select
                            data-test="poster-text-language"
                            // A poster job that names its text language keeps it, like every other field it fixes.
                            disabled={posterJob && !!assignment?.language}
                            value={formData.posterTextLanguage || 'English'}
                            onChange={(e) => setFormData(prev => ({ ...prev, posterTextLanguage: e.target.value }))}
                            className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                              isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200")}
                          >
                            {Array.from(new Set(['English', ...LANGUAGE_OPTIONS, formData.posterTextLanguage || 'English'])).map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className={cn("mt-2 text-[11px] leading-relaxed", isDark ? "text-slate-400" : "text-slate-500")}>
                        Each concept is a different idea with its own copy-paste image prompt. Upload the logo and any product or shop photos above — the concepts are built from what the business really sells.
                      </p>
                    </div>
                  )}

                  {/* #4a — Aspect Ratio (video — a poster's canvas is chosen above) */}
                  {creationMode === 'video' && (
                  <div>
                    <label className={cn("flex items-center gap-1.5 text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>
                      <Ratio className="w-4 h-4 text-blue-500" /> Aspect Ratio
                    </label>
                    {aspectRatioLocked ? (
                      <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm",
                        isDark ? "bg-slate-700/60 border-slate-600 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                        <span className="font-mono font-semibold">{formData.aspectRatio}</span>
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Fixed by assignment</span>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {([['9:16', 'Vertical'], ['16:9', 'Horizontal']] as const).map(([r, label]) => (
                        <button key={r} type="button" onClick={() => setFormData(prev => ({ ...prev, aspectRatio: r }))}
                          className={cn("flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all",
                            formData.aspectRatio === r
                              ? (isDark ? "border-blue-500 bg-blue-900/30 text-blue-400" : "border-blue-500 bg-blue-50 text-blue-700")
                              : (isDark ? "border-slate-600 hover:border-slate-500 text-slate-400" : "border-slate-200 hover:border-slate-300 text-slate-600")
                          )}>
                          <span className="font-mono">{r}</span><span className="text-xs opacity-70">{label}</span>
                        </button>
                      ))}
                    </div>
                    )}
                  </div>

                  )}

                  {/* #4b — Language (searchable) */}
                  {creationMode === 'video' && (
                  <div>
                    <label className={cn("flex items-center gap-1.5 text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>
                      <Languages className="w-4 h-4 text-purple-500" /> Language
                    </label>
                    {languageLocked ? (
                      <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm",
                        isDark ? "bg-slate-700/60 border-slate-600 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                        <span className="font-semibold">{formData.language}</span>
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Fixed by assignment</span>
                      </div>
                    ) : (
                    <div className="relative">
                      <button type="button" onClick={() => { setLanguageOpen(o => !o); setLanguageSearch(''); }}
                        className={cn("w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm outline-none",
                          isDark ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-white border-slate-300 text-slate-700"
                        )}>
                        <span>{formData.language}</span>
                        <ChevronDown className={cn("w-4 h-4 transition-transform", languageOpen && "rotate-180")} />
                      </button>
                      {languageOpen && (
                        <div className={cn("absolute z-30 mt-1 w-full rounded-lg border shadow-lg overflow-hidden",
                          isDark ? "bg-slate-800 border-slate-600" : "bg-white border-slate-200")}>
                          <input autoFocus value={languageSearch} onChange={(e) => setLanguageSearch(e.target.value)}
                            placeholder="Search language..."
                            className={cn("w-full px-3 py-2 text-sm border-b outline-none",
                              isDark ? "bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500" : "bg-white border-slate-200 text-slate-700 placeholder-slate-400")} />
                          <div className="max-h-48 overflow-y-auto">
                            {LANGUAGE_OPTIONS.filter(l => l.toLowerCase().includes(languageSearch.toLowerCase())).map(l => (
                              <button key={l} type="button"
                                onClick={() => { setFormData(prev => ({ ...prev, language: l })); setLanguageOpen(false); setLanguageSearch(''); }}
                                className={cn("w-full text-left px-3 py-2 text-sm transition-colors",
                                  formData.language === l
                                    ? (isDark ? "bg-purple-900/30 text-purple-300" : "bg-purple-50 text-purple-700")
                                    : (isDark ? "text-slate-300 hover:bg-slate-700" : "text-slate-700 hover:bg-slate-100"))}>
                                {l}
                              </button>
                            ))}
                            {LANGUAGE_OPTIONS.filter(l => l.toLowerCase().includes(languageSearch.toLowerCase())).length === 0 && (
                              <p className={cn("px-3 py-2 text-xs", isDark ? "text-slate-500" : "text-slate-400")}>No language found</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>

                  )}

                  {/* Ad Type */}
                  {creationMode === 'video' && (
                  <div>
                    <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Ad Type</label>
                    {adTypeLocked ? (
                      <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm",
                        isDark ? "bg-slate-700/60 border-slate-600 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                        <span className="font-semibold">{formData.adType === AdType.FESTIVAL ? "Festival Wishes" : "Commercial"}</span>
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Fixed by assignment</span>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setFormData(prev => ({ ...prev, adType: AdType.COMMERCIAL }))}
                        className={cn("px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                          formData.adType === AdType.COMMERCIAL
                            ? (isDark ? "border-blue-500 bg-blue-900/30 text-blue-400" : "border-blue-500 bg-blue-50 text-blue-700")
                            : (isDark ? "border-slate-600 hover:border-slate-500 text-slate-400" : "border-slate-200 hover:border-slate-300 text-slate-600")
                        )}>Commercial</button>
                      <button onClick={() => setFormData(prev => ({ ...prev, adType: AdType.FESTIVAL }))}
                        className={cn("px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                          formData.adType === AdType.FESTIVAL
                            ? (isDark ? "border-purple-500 bg-purple-900/30 text-purple-400" : "border-purple-500 bg-purple-50 text-purple-700")
                            : (isDark ? "border-slate-600 hover:border-slate-500 text-slate-400" : "border-slate-200 hover:border-slate-300 text-slate-600")
                        )}>Festival Wishes</button>
                    </div>
                    )}
                  </div>

                  )}

                  {/* Special Category — cartoon duo instead of a human model.
                      Off by default, so a normal ad is completely unaffected. */}
                  {creationMode === 'video' && (
                  <div>
                    <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>
                      Special Category Ad
                    </label>
                    {packLocked ? (
                      <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm",
                        isDark ? "bg-slate-700/60 border-slate-600 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                        <span className="font-semibold truncate">🎭 {activePack?.label}</span>
                        <span className={cn("shrink-0 ml-2 text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Sold as this</span>
                      </div>
                    ) : (
                    <select
                      value={getCharacterPack(formData.characterPack)?.id ?? (formData.characterPack || '')}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        characterPack: e.target.value || undefined,
                        // Default to using the client's photos — that is the whole point of the format.
                        locationMode: e.target.value ? (prev.locationMode || 'real_provided') : undefined,
                      }))}
                      className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                        isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-amber-800" : "bg-white border-slate-300 text-slate-700 focus:ring-amber-200")}
                    >
                      <option value="">No — normal ad with a model</option>
                      {/* Grouped: thirty-two entries in one flat list is a search, not a choice. */}
                      {characterPackGroups().map(group => (
                        <optgroup key={group.family} label={group.label}>
                          {group.options.map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    )}

                    {activePack && (
                      <div className={cn("mt-3 rounded-lg border p-3",
                        isDark ? "border-amber-700/50 bg-amber-950/20" : "border-amber-300 bg-amber-50")}>
                        <p className={cn("text-xs", isDark ? "text-amber-200" : "text-amber-800")}>
                          <b>{activePack.label}</b> — {activePack.tagline}.{activePack.characters.length > 1 ? ' Both characters speak in every clip.' : ` ${activePack.characters[0].name} presents throughout.`}
                        </p>
                      </div>
                    )}
                  </div>

                  )}

                  {/*
                    Background — on EVERY ad, and read-only when it came with the job.

                    It lived inside the character-pack block, so a normal ad had no background
                    question at all and the generator built the location from the business profile
                    whatever the client had been asked to send. It is its own field now, because it
                    is its own decision: the same ad at the same price is a different product shot
                    in the client's showroom than it is on a built set, and the pipeline writes a
                    different prompt for each. See `backgroundLocked` for why the member reads this
                    rather than answers it.
                  */}
                  {creationMode === 'video' && (
                  <div>
                    <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>
                      Background
                    </label>
                    {backgroundLocked ? (
                      <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm",
                        isDark ? "bg-slate-700/60 border-slate-600 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                        <span className="font-semibold truncate">
                          {formData.locationMode === 'real_provided'
                            ? "📷 Real — the client's own premises"
                            : '🏙️ AI — location built for the business'}
                        </span>
                        <span className={cn("shrink-0 ml-2 text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Sold as this</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { key: 'real_provided' as const, label: "📷 Real — client's own premises" },
                          { key: 'ai_generated' as const, label: '🏙️ AI — build the location' },
                        ]).map(({ key, label }) => (
                          <button key={key} type="button"
                            onClick={() => setFormData(prev => ({ ...prev, locationMode: key }))}
                            className={cn("px-3 py-2 rounded-lg text-xs font-medium border transition-all",
                              formData.locationMode === key
                                ? (isDark ? "border-amber-500 bg-amber-900/40 text-amber-300" : "border-amber-500 bg-amber-100 text-amber-800")
                                : (isDark ? "border-slate-600 text-slate-400 hover:border-slate-500" : "border-slate-300 text-slate-600 hover:border-slate-400"))}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    {formData.locationMode === 'real_provided' && (
                      <p className={cn("mt-2 text-[11px] leading-relaxed",
                        files.storeImage.length > 0
                          ? (isDark ? "text-emerald-300" : "text-emerald-700")
                          : (isDark ? "text-amber-300" : "text-amber-700"))}>
                        {files.storeImage.length > 0
                          ? `✓ ${files.storeImage.length} location photo${files.storeImage.length === 1 ? '' : 's'} attached — each clip will use a different one.`
                          : "Upload the client's photos into “Store / Office Image” below. Send every angle they gave you — each clip uses a different one."}
                      </p>
                    )}
                    {backgroundLocked && (
                      <p className={cn("mt-1.5 text-[10px] leading-relaxed", isDark ? "text-slate-400" : "text-slate-500")}>
                        This is what the client bought. If it is wrong, ask your team leader or the sales
                        member who sold it to change it — the correction reaches you here.
                      </p>
                    )}
                  </div>

                  )}

                  {/* Festival Name */}
                  {creationMode === 'video' && formData.adType === AdType.FESTIVAL && (
                    <div>
                      <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Festival Name</label>
                      <select className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                          isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-purple-800" : "bg-white border-slate-300 text-slate-700 focus:ring-purple-200"
                        )} value={selectedFestivalOption} onChange={(e) => {
                          const selectedFestival = e.target.value;
                          setSelectedFestivalOption(selectedFestival);
                          setCustomFestivalName('');
                          setFormData(prev => ({ ...prev, festivalName: selectedFestival }));
                        }}>
                        <option value="">-- Select Festival --</option>
                        {upcomingFestivals.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={cn("text-xs font-medium whitespace-nowrap", isDark ? "text-slate-400" : "text-slate-500")}>Or type custom:</span>
                        <input
                          type="text"
                          value={customFestivalName}
                          onChange={(e) => {
                            const customValue = e.target.value;
                            setCustomFestivalName(customValue);
                            if (customValue.trim()) {
                              setSelectedFestivalOption(CUSTOM_FESTIVAL_OPTION);
                              setFormData(prev => ({ ...prev, festivalName: customValue.trim() }));
                            } else {
                              setSelectedFestivalOption('');
                              setFormData(prev => ({ ...prev, festivalName: '' }));
                            }
                          }}
                          placeholder="Custom festival"
                          className={cn(
                            "flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 outline-none",
                            isDark
                              ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-purple-800"
                              : "bg-white border-slate-300 text-slate-700 placeholder-slate-400 focus:ring-purple-200"
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {/* Model Gender — Video only, and only when a human is on screen: a character
                      pack IS the cast, so dressing a model that never appears is meaningless. */}
                  {creationMode === 'video' && !activePack && (
                    <div>
                      <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Model Gender</label>
                      {genderLocked ? (
                        <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm capitalize",
                          isDark ? "bg-slate-700/60 border-slate-600 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                          <span className="font-semibold">{formData.gender === ModelGender.MALE ? '👨 Male' : '👩 Female'}</span>
                          <span className={cn("text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Fixed by assignment</span>
                        </div>
                      ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {[ModelGender.FEMALE, ModelGender.MALE].map((g) => (
                          <button key={g} type="button"
                            onClick={() => setFormData(prev => {
                              const allowed = ATTIRE_OPTIONS_BY_GENDER[g];
                              // Keep the current attire if it's valid for the new gender, else default to Professional
                              const nextAttire = allowed.includes(prev.attireType) ? prev.attireType : AttireType.PROFESSIONAL;
                              return { ...prev, gender: g, attireType: nextAttire };
                            })}
                            className={cn("px-3 py-2 rounded-lg text-sm font-medium border transition-all capitalize",
                              (formData.gender || ModelGender.FEMALE) === g
                                ? (isDark ? "border-blue-500 bg-blue-900/30 text-blue-400" : "border-blue-500 bg-blue-50 text-blue-700")
                                : (isDark ? "border-slate-600 text-slate-400" : "border-slate-200 text-slate-600")
                            )}>
                            {g === ModelGender.FEMALE ? '👩 Female' : '👨 Male'}
                          </button>
                        ))}
                      </div>
                      )}
                    </div>
                  )}

                  {/* Attire — Video only (adapts to gender). Hidden for a deity or cartoon, kept for a
                      human-model special category ("Normal Ad (Female)"…), whose gender it follows. */}
                  {creationMode === 'video' && (!activePack || isHumanPack(activePack)) && (
                    <div>
                      <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Model Attire</label>
                      {attireLocked ? (
                        <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm",
                          isDark ? "bg-slate-700/60 border-slate-600 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                          <span className="font-semibold truncate">{formData.attireType === AttireType.CUSTOM && formData.customAttire ? formData.customAttire : ATTIRE_LABELS[formData.attireType]}</span>
                          <span className={cn("shrink-0 ml-2 text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Fixed</span>
                        </div>
                      ) : (
                      <>
                      <select className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                          isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                        )} value={formData.attireType} onChange={(e) => setFormData(prev => ({ ...prev, attireType: e.target.value as AttireType }))}>
                        {ATTIRE_OPTIONS_BY_GENDER[(packModelGender(activePack) as ModelGender | null) || formData.gender || ModelGender.FEMALE].map((a) => (
                          <option key={a} value={a}>{ATTIRE_LABELS[a]}</option>
                        ))}
                      </select>
                      {formData.attireType === AttireType.CUSTOM && (
                        <textarea
                          className={cn("w-full mt-2 border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none resize-y",
                            isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                          )}
                          rows={2}
                          placeholder="Describe the exact attire (e.g. white chef coat with black apron, blue mechanic jumpsuit, cream kurta with Nehru jacket)…"
                          value={formData.customAttire || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, customAttire: e.target.value }))}
                        />
                      )}
                      </>
                      )}
                    </div>
                  )}

                  {/* Duration — Video only */}
                  {creationMode === 'video' && (
                    <div>
                      <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Video Duration</label>
                      {durationLocked ? (
                        <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm",
                          isDark ? "bg-slate-700/60 border-slate-600 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                          <span className="font-mono font-semibold">{formData.duration}s · {Math.round(formData.duration / 8)} clips</span>
                          <span className={cn("text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>
                            🔒 Fixed by assignment{assignment?.category ? ` · ${assignment.category}` : ''}
                          </span>
                        </div>
                      ) : (
                      <>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <button onClick={() => setFormData(prev => ({ ...prev, durationMode: 'preset', duration: 16 }))}
                          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                            formData.durationMode === 'preset' ? (isDark ? "border-blue-500 bg-blue-900/30 text-blue-400" : "border-blue-500 bg-blue-50 text-blue-700")
                              : (isDark ? "border-slate-600 text-slate-400" : "border-slate-200 text-slate-600")
                          )}>Preset</button>
                        <button onClick={() => setFormData(prev => ({ ...prev, durationMode: 'custom', duration: 24 }))}
                          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                            formData.durationMode === 'custom' ? (isDark ? "border-violet-500 bg-violet-900/30 text-violet-400" : "border-violet-500 bg-violet-50 text-violet-700")
                              : (isDark ? "border-slate-600 text-slate-400" : "border-slate-200 text-slate-600")
                          )}>Custom</button>
                      </div>
                      {formData.durationMode === 'preset' ? (
                        <select className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                            isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                          )} value={formData.duration} onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) }))}>
                          <option value={16}>16 Seconds (2 Clips)</option>
                          <option value={32}>32 Seconds (4 Clips)</option>
                          <option value={48}>48 Seconds (6 Clips)</option>
                          <option value={64}>64 Seconds (8 Clips)</option>
                        </select>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <input type="number" min={8} max={120} step={8}
                            className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                              isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-violet-800" : "bg-white border-slate-300 text-slate-700 focus:ring-violet-200"
                            )} value={formData.duration}
                            onChange={(e) => {
                              let val = Math.round((parseInt(e.target.value) || 8) / 8) * 8;
                              setFormData(prev => ({ ...prev, duration: Math.max(8, Math.min(120, val)) }));
                            }} />
                          <span className={cn("text-sm whitespace-nowrap", isDark ? "text-slate-400" : "text-slate-500")}>sec</span>
                        </div>
                      )}
                      </>
                      )}
                    </div>
                  )}

                  {/* Custom Script Option — Video only */}
                  {creationMode === 'video' && (
                    <div>
                      <label className={cn("flex items-center gap-2 text-sm font-semibold cursor-pointer", isDark ? "text-slate-300" : "text-slate-700")}>
                        <input type="checkbox" checked={useCustomScript} onChange={(e) => setUseCustomScript(e.target.checked)} className="rounded border-slate-300" />
                        Use Custom Script (Business-Provided)
                      </label>
                      {useCustomScript && (
                        <div className="mt-2">
                          <div className={cn("mb-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
                            isDark ? "bg-amber-900/20 border-amber-800/50 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-800")}>
                            <span className="font-semibold">Required format — one clip per line:</span>
                            <pre className="mt-1 font-mono text-[11px] whitespace-pre-wrap">{`clip-1[0-8sec]: first spoken line
clip-2[8-16sec]: second spoken line`}</pre>
                            <span>Pasted this way, your script is used <b>word-for-word</b> in the Voice Over Script and Veo 3 prompts, and its clip count sets the ad length. Unlabelled text is auto-split instead.</span>
                          </div>
                          <textarea
                            className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                              isDark ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                            )} rows={6} placeholder={"clip-1[0-8sec]: \nclip-2[8-16sec]: "}
                            value={customScript} onChange={(e) => setCustomScript(e.target.value)} />
                          {(() => {
                            const labeledClips = parseLabeledClips(customScript);
                            const isLabeled = labeledClips.length > 0;
                            const wordCount = customScript.trim().split(/\s+/).filter(Boolean).length;
                            const estSeconds = wordCount > 0 ? Math.round(wordCount / 2.3) : 0;
                            const estClips = wordCount > 0 ? Math.max(1, Math.ceil(estSeconds / 8)) : 0;
                            return (
                              <div className={cn("mt-2 p-2.5 rounded-lg border text-xs space-y-1",
                                isLabeled
                                  ? (isDark ? "bg-emerald-900/20 border-emerald-800/50" : "bg-emerald-50 border-emerald-200")
                                  : (isDark ? "bg-slate-600/50 border-slate-500" : "bg-blue-50 border-blue-200"))}>
                                {isLabeled ? (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <span className={isDark ? "text-emerald-300" : "text-emerald-700"}>✓ Clip format detected — used exactly as written</span>
                                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                        {labeledClips.length} clips ({labeledClips.length * 8}s)
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 pt-1">
                                      {labeledClips.map((_, i) => (
                                        <span key={i} className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono",
                                          isDark ? "bg-emerald-900/40 text-emerald-300" : "bg-emerald-100 text-emerald-700")}>
                                          {clipLabel(i)}
                                        </span>
                                      ))}
                                    </div>
                                  </>
                                ) : wordCount > 0 ? (
                                  <>
                                    <div className={cn("font-medium", isDark ? "text-amber-300" : "text-amber-700")}>
                                      No clip labels found — this text will be auto-split into clips.
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className={isDark ? "text-slate-300" : "text-slate-600"}>Estimated Duration:</span>
                                      <span className="font-bold text-primary">{estSeconds}s ({estClips} clips × 8s)</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className={isDark ? "text-slate-300" : "text-slate-600"}>Word Count:</span>
                                      <span className="font-medium">{wordCount} words</span>
                                    </div>
                                    <div className="flex gap-1.5 mt-1">
                                      {[16, 32, 48, 64].map(p => (
                                        <span key={p} className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
                                          estSeconds <= p
                                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                            : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                        )}>
                                          {p}s {estSeconds <= p ? '✓' : '✗'}
                                        </span>
                                      ))}
                                    </div>
                                  </>
                                ) : (
                                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>Paste a script in the clip-1[0-8sec] format above</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Generate Button */}
                  <div className="flex space-x-2">
                    <button onClick={handleGenerate} disabled={status.isProcessing}
                      className={cn("flex-1 py-3.5 px-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center space-x-2 transition-all",
                        status.isProcessing
                          ? "bg-slate-500/70 cursor-not-allowed"
                          : cn(BRAND_GRADIENT, BRAND_GRADIENT_HOVER, "shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40 active:scale-[0.99]")
                      )}>
                      {status.isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Rocket className="w-5 h-5" />}
                      <span>{status.isProcessing ? 'Processing...' : creationMode === 'poster' ? 'Generate Poster Concepts' : 'Start Generation'}</span>
                    </button>
                    {status.isProcessing && (
                      <button onClick={handleStopGeneration}
                        className="py-3.5 px-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm flex items-center space-x-2 active:scale-[0.98] transition-all">
                        <StopCircle className="w-5 h-5" /><span>Stop</span>
                      </button>
                    )}
                  </div>
                  {status.error && (
                    <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" /><span>{status.error}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: OUTPUTS */}
            <div className="lg:col-span-7" ref={outputPanelRef}>
              {(status.isProcessing || status.step) && (
                <div className={cn("rounded-2xl border px-4 py-3.5 mb-4 shadow-xl",
                  isDark ? "bg-slate-900/70 border-slate-800 shadow-black/20 backdrop-blur" : "bg-white/90 border-slate-200 shadow-slate-200/60 backdrop-blur")}>
                  <div className="flex items-center justify-between mb-2.5">
                    <h2 className={cn("text-sm font-bold", isDark ? "text-white" : "text-slate-800")}>Generation Status</h2>
                    <div className="flex items-center gap-2 text-xs">
                      <Wand2 className={cn("w-3.5 h-3.5 text-blue-500", status.isProcessing && "animate-pulse")} />
                      <span className={cn(status.isProcessing && "animate-pulse", isDark ? "text-slate-400" : "text-slate-600")}>{status.step}</span>
                      {/* The workspace leaves at the first asset, but the run goes on — so the countdown stays here. */}
                      {status.isProcessing && activeRun && !showMission && (
                        <RunCountdown run={activeRun} active isDark={isDark} variant="inline" />
                      )}
                      <span className={cn("font-mono font-bold text-[11px] px-1.5 py-0.5 rounded-md",
                        isDark ? "bg-slate-800 text-cyan-400" : "bg-slate-100 text-blue-600")}>{Math.round(status.progress)}%</span>
                    </div>
                  </div>
                  <div className={cn("w-full rounded-full h-2 overflow-hidden", isDark ? "bg-slate-800" : "bg-slate-100")}>
                    <div className={cn("h-2 rounded-full transition-all duration-500", BRAND_GRADIENT)} style={{ width: `${status.progress}%` }} />
                  </div>
                </div>
              )}

              {/*
                One space, three occupants: the Mission Workspace while nothing usable has arrived, the
                assets from the first one onward, and the welcome card before any run. `mode="wait"` lets
                the workspace finish dissolving before the assets rise into the same place, so the two
                never stack and nothing jumps.
              */}
              <AnimatePresence mode="wait" initial={false}>
              {outputs && showAssets ? (
                <motion.div
                  key="assets"
                  className="space-y-6"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: reduceMotion ? 0.2 : 0.45, ease: [0.22, 1, 0.36, 1] } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h2 className={cn("text-lg sm:text-xl font-extrabold tracking-tight", BRAND_TEXT)}>
                      Generated Assets
                      {viewingSavedItem && <span className="ml-2 text-sm font-normal text-slate-500">(Viewing Saved)</span>}
                    </h2>
                    <div className="flex items-center space-x-2">
                      {/* Where the workspace went. It pulses while the run is still going, just after the
                          workspace has stepped aside, so the member sees where to find it again. */}
                      <button type="button" onClick={() => setGuideOpen(true)} data-test="ai-guide-button"
                        className={cn("relative flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-[0.98]",
                          isDark ? "bg-violet-900/30 text-violet-300 hover:bg-violet-900/50" : "bg-violet-50 text-violet-700 hover:bg-violet-100",
                          status.isProcessing && "ring-2 ring-violet-400/60")}>
                        {status.isProcessing && !reduceMotion && (
                          <span aria-hidden className="absolute inset-0 rounded-lg ring-2 ring-violet-400/50 animate-ping" />
                        )}
                        <Sparkles className="w-4 h-4" /><span>AI Guide</span>
                      </button>
                      <button onClick={handleSave} disabled={isSaving || saveSuccess}
                        className={cn("flex items-center space-x-1 text-sm font-medium px-3 py-1.5 rounded-lg transition-all",
                          saveSuccess ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : isSaving ? "bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-700"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                        )}>
                        {saveSuccess ? <><Check className="w-4 h-4" /><span>Saved!</span></> : isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving...</span></> : <><Save className="w-4 h-4" /><span>Save</span></>}
                      </button>
                    </div>
                  </div>

                  {/* Business Intelligence extracted silently - not shown */}

                  {/* Video Generation Platform Link - at top */}
                  {creationMode === 'video' && (
                    <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer"
                      className={cn("flex items-center justify-center space-x-3 w-full py-3.5 px-6 rounded-2xl font-semibold text-sm text-white shadow-xl shadow-blue-600/25 hover:shadow-blue-500/35 transition-all active:scale-[0.99]",
                        BRAND_GRADIENT, BRAND_GRADIENT_HOVER)}>
                      <Video className="w-5 h-5" /><span>Open Video Generation Platform</span><ExternalLink className="w-4 h-4 opacity-70" />
                    </a>
                  )}

                  {/* Poster outputs */}
                  {creationMode === 'poster' && (outputs.posterConcepts?.length ?? 0) > 0 && (
                    <PosterConceptsPanel
                      concepts={outputs.posterConcepts!}
                      posterSize={formData.posterSize || DEFAULT_POSTER_SIZE}
                      occasion={formData.posterOccasion}
                      hasLogo={!!files.logo}
                      isDark={isDark}
                      refiningIndex={refiningConcept}
                      onRefine={handleRefineConcept}
                    />
                  )}
                  {creationMode === 'poster' && !(outputs.posterConcepts?.length) && (
                    <p className={cn("rounded-xl border px-4 py-3 text-sm", isDark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500")}>
                      This saved work has no poster concepts yet — press <b>Generate Poster Concepts</b> to write them.
                    </p>
                  )}

                  {/* Video outputs */}
                  {creationMode === 'video' && outputs.mainFramePrompts?.length > 0 && (
                      <OutputSection title={`1. Main Frame Prompts (${outputs.mainFramePrompts.length} Clips)`} sectionKey="mainFrame"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark}
                        quickCopyItems={outputs.mainFramePrompts.map(p => stripAttachmentDirective(p).body)}
                        quickCopyAttachments={mainFrameAttachments}>
                        <GeneratedCard title="Main Frame" content={outputs.mainFramePrompts} variant="dropdown" sectionType="mainFrame"
                          attachments={mainFrameAttachments}
                          showRefinement={true} onRefine={(i) => handleRefineSection('mainFrame', i)} isRefining={refiningSection === 'mainFrame'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && outputs.headerPrompt && (
                      <OutputSection title="2. Header Prompt" sectionKey="header"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark} copyContent={outputs.headerPrompt}>
                        <GeneratedCard title="Header" content={outputs.headerPrompt} sectionType="header"
                          showRefinement={true} onRefine={(i) => handleRefineSection('header', i)} isRefining={refiningSection === 'header'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && outputs.posterPrompt && (
                      <OutputSection title="3. Poster Design" sectionKey="poster"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark} copyContent={outputs.posterPrompt}>
                        <GeneratedCard title="Poster" content={outputs.posterPrompt} isJson sectionType="poster"
                          showRefinement={true} onRefine={(i) => handleRefineSection('poster', i)} isRefining={refiningSection === 'poster'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && outputs.voiceOverScript && (() => {
                      const voiceClips = parseVoiceOverClips(cleanPromptForClipboard(outputs.voiceOverScript));
                      const hasClips = voiceClips.length > 0;
                      // Business-facing labels: `clip-1[0-8sec]`. The script is stored canonically
                      // as `0-8: …` (see utils/voiceOverFormat) and relabelled only here, so both
                      // the whole-script copy and the per-clip copies read the same way.
                      return (
                      <OutputSection title={`4. Voice Over Script (${formData.language || 'Telugu'})`} sectionKey="voiceOver"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark}
                        copyContent={hasClips ? formatClipScript(voiceClips.map(c => c.text)) : outputs.voiceOverScript}
                        copyLabel="Copy Full Script"
                        quickCopyItems={hasClips ? voiceClips.map((c, i) => formatClipLine(i, c.text)) : undefined}
                        quickCopyLabel="clip-" quickCopyNamespace="voice-over"
                        quickCopyRanges={hasClips ? voiceClips.map((_, i) => `[${clipRange(i)}sec]`) : undefined}>
                        {/* The message the script was built on, so the member can hold clip 1 to it. */}
                        {outputs.coreMessage && (outputs.coreMessage.messageLine || outputs.coreMessage.corePromise) && (
                          <div data-test="core-message" className={cn("mx-4 mt-4 rounded-xl border px-4 py-2.5 text-xs leading-relaxed",
                            isDark ? "border-violet-500/30 bg-violet-500/[0.06] text-slate-300" : "border-violet-200 bg-violet-50/70 text-slate-600")}>
                            <span className={cn("mr-1.5 font-bold uppercase tracking-wider text-[10px]", isDark ? "text-violet-300" : "text-violet-700")}>Core message</span>
                            {outputs.coreMessage.messageLine || `${outputs.coreMessage.businessName} — ${outputs.coreMessage.corePromise}`}
                          </div>
                        )}
                        {voiceOverRevision && voiceOverRevision.after === outputs.voiceOverScript && (
                          <RefineRevisionBanner revision={voiceOverRevision} isDark={isDark}
                            onUndo={handleUndoVoiceOverRevision} onDismiss={() => setVoiceOverRevision(null)} />
                        )}
                        <GeneratedCard title="Voice Over" content={outputs.voiceOverScript} sectionType="voiceOver"
                          showTransliteration showRefinement={true}
                          onRefine={(i) => handleRefineVoiceOver(i)}
                          onRefineClip={(index, i) => handleRefineVoiceOver(i, index)}
                          refiningClip={refiningSection === 'voiceOver' ? refiningClip : null}
                          highlightClips={voiceOverRevision && voiceOverRevision.after === outputs.voiceOverScript ? voiceOverRevision.changed : []}
                          isRefining={refiningSection === 'voiceOver'} hideTitle />
                      </OutputSection>
                      );
                  })()}

                  {creationMode === 'video' && outputs.veoPrompts?.length > 0 && (
                      <OutputSection title="5. Veo 3 Video Prompts" sectionKey="veo"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark} quickCopyItems={outputs.veoPrompts} quickCopyLabel="clip-" quickCopyNamespace="veo"
                        quickCopyRanges={outputs.veoPrompts.map((_, i) => `[${clipRange(i)}sec]`)}>
                        <GeneratedCard title="Veo" content={outputs.veoPrompts} variant="dropdown" sectionType="veo"
                          showRefinement={true} onRefine={(i) => handleRefineVeo(i)}
                          onRefineItem={(index, i) => handleRefineVeo(i, index)}
                          isRefining={refiningSection === 'veo'} hideTitle />
                      </OutputSection>
                  )}

                  {/* Stock Image Prompts */}
                  {creationMode === 'video' && outputs.voiceOverScript && (
                        <div className={cn("rounded-2xl border overflow-hidden shadow-lg", isDark ? "bg-slate-900/70 border-slate-800 shadow-black/10" : "bg-white border-slate-200 shadow-slate-200/50")}>
                          <div className={cn("relative px-4 py-3 border-b flex justify-between items-center", isDark ? "bg-slate-900/80 border-slate-800" : "bg-slate-50 border-slate-200")}>
                            <div className={cn("absolute left-0 top-0 bottom-0 w-1", BRAND_GRADIENT)} />
                            <div className="flex items-center space-x-2 pl-1.5">
                              <Camera className="w-4 h-4 text-teal-500" />
                              <h3 className={cn("font-semibold text-sm uppercase tracking-wide", isDark ? "text-slate-200" : "text-slate-800")}>6. Stock Image Prompts (B-Roll)</h3>
                            </div>
                            {!outputs.stockImagePrompts && (
                              <div className="flex items-center space-x-2">
                                <select value={stockImageTheme} onChange={(e) => setStockImageTheme(e.target.value)}
                                  className={cn("text-xs font-medium py-1.5 px-2 rounded-lg border", isDark ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-white border-slate-300 text-slate-700")}>
                                  <option value="indian">🇮🇳 Indian</option><option value="american">🇺🇸 American</option>
                                  <option value="middle-eastern">🇦🇪 Middle Eastern</option><option value="european">🇪🇺 European</option>
                                  <option value="east-asian">🇯🇵 East Asian</option><option value="african">🇿🇦 African</option><option value="universal">🌍 Universal</option>
                                </select>
                                <button onClick={handleGenerateStockImages} disabled={isGeneratingStock}
                                  className={cn("flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all",
                                    isGeneratingStock ? (isDark ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-slate-100 text-slate-400")
                                      : (isDark ? "bg-teal-900/40 text-teal-400 hover:bg-teal-900/60 border border-teal-700/50" : "bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200")
                                  )}>
                                  {isGeneratingStock ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Generating...</span></> : <><Sparkles className="w-3 h-3" /><span>Generate</span></>}
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            {!outputs.stockImagePrompts && !isGeneratingStock && (
                              <div className={cn("text-center py-6", isDark ? "text-slate-500" : "text-slate-400")}>
                                <Camera className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm font-medium">Stock image prompts for editing B-roll</p>
                              </div>
                            )}
                            {stockImageError && (
                              <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{stockImageError}</span>
                              </div>
                            )}
                            {isGeneratingStock && (
                              <div className="flex items-center justify-center py-8 space-x-2">
                                <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                                <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Generating stock image prompts...</span>
                              </div>
                            )}
                            {outputs.stockImagePrompts?.map((item: any, idx: number) => (
                              <div key={idx} className={cn("rounded-lg border p-4 mb-3", isDark ? "bg-slate-700/50 border-slate-600" : "bg-slate-50 border-slate-200")}>
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold", isDark ? "bg-teal-900/50 text-teal-400" : "bg-teal-100 text-teal-700")}>{item.id || idx + 1}</span>
                                    <span className={cn("font-semibold text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{item.concept}</span>
                                  </div>
                                  <button onClick={() => { navigator.clipboard.writeText(item.prompt); setCopiedStockIdx(idx); setTimeout(() => setCopiedStockIdx(null), 2000); }}
                                    className={cn("flex items-center space-x-1 text-xs px-2 py-1 rounded transition-colors",
                                      copiedStockIdx === idx ? (isDark ? "text-green-400 bg-green-900/30" : "text-green-600 bg-green-50")
                                        : (isDark ? "text-slate-400 hover:text-teal-400" : "text-slate-500 hover:text-teal-600")
                                    )}>
                                    {copiedStockIdx === idx ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    <span>{copiedStockIdx === idx ? 'Copied' : 'Copy'}</span>
                                  </button>
                                </div>
                                <p className={cn("text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-600")}>{item.prompt}</p>
                                {/* #10 — per-image refine */}
                                {stockRefineIdx === idx ? (
                                  <div className="mt-2 flex items-center gap-2">
                                    <input autoFocus value={stockRefineText} onChange={(e) => setStockRefineText(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') handleRefineStockImage(idx); }}
                                      placeholder="Describe the change for this image..."
                                      className={cn("flex-1 border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2",
                                        isDark ? "bg-slate-800 border-slate-600 text-slate-200 focus:ring-teal-800" : "bg-white border-slate-300 text-slate-700 focus:ring-teal-200")} />
                                    <button onClick={() => handleRefineStockImage(idx)} disabled={refiningStockIdx === idx || !stockRefineText.trim()}
                                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-1">
                                      {refiningStockIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Apply
                                    </button>
                                    <button onClick={() => { setStockRefineIdx(null); setStockRefineText(''); }}
                                      className={cn("text-xs px-2 py-1.5 rounded-lg", isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-100")}>Cancel</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setStockRefineIdx(idx); setStockRefineText(''); }}
                                    className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors",
                                      isDark ? "text-teal-400 hover:bg-teal-900/30" : "text-teal-600 hover:bg-teal-50")}>
                                    <Wand2 className="w-3 h-3" /> Refine this image
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                  )}

                  {/* 7. Overlay Texts (#14) */}
                  {creationMode === 'video' && outputs.voiceOverScript && (
                    <div className={cn("rounded-2xl border overflow-hidden shadow-lg", isDark ? "bg-slate-900/70 border-slate-800 shadow-black/10" : "bg-white border-slate-200 shadow-slate-200/50")}>
                      <div className={cn("relative px-4 py-3 border-b flex justify-between items-center", isDark ? "bg-slate-900/80 border-slate-800" : "bg-slate-50 border-slate-200")}>
                        <div className={cn("absolute left-0 top-0 bottom-0 w-1", BRAND_GRADIENT)} />
                        <div className="flex items-center space-x-2 pl-1.5">
                          <TypeIcon className="w-4 h-4 text-amber-500" />
                          <h3 className={cn("font-semibold text-sm uppercase tracking-wide", isDark ? "text-slate-200" : "text-slate-800")}>7. Overlay Texts</h3>
                        </div>
                        {!outputs.overlayTexts && (
                          <button onClick={handleGenerateOverlayTexts} disabled={isGeneratingOverlay}
                            className={cn("flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all",
                              isGeneratingOverlay ? (isDark ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-slate-100 text-slate-400")
                                : (isDark ? "bg-amber-900/40 text-amber-400 hover:bg-amber-900/60 border border-amber-700/50" : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"))}>
                            {isGeneratingOverlay ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Generating...</span></> : <><Sparkles className="w-3 h-3" /><span>Generate</span></>}
                          </button>
                        )}
                      </div>
                      <div className="p-4">
                        {!outputs.overlayTexts && !isGeneratingOverlay && (
                          <div className={cn("text-center py-6", isDark ? "text-slate-500" : "text-slate-400")}>
                            <TypeIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm font-medium">On-screen overlay texts (1–3 per clip) with a CapCut sound-effect for each — for editing</p>
                          </div>
                        )}
                        {overlayError && (
                          <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{overlayError}</span>
                          </div>
                        )}
                        {isGeneratingOverlay && (
                          <div className="flex items-center justify-center py-8 space-x-2">
                            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                            <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Generating overlay texts...</span>
                          </div>
                        )}
                        {outputs.overlayTexts && outputs.overlayTexts.length > 0 && (
                          Array.from(new Set(outputs.overlayTexts.map((o: any) => Number(o.clip) || 0))).sort((a: number, b: number) => a - b).map((clip: number) => (
                            <div key={clip} className="mb-3 last:mb-0">
                              <p className={cn("text-[11px] font-semibold uppercase tracking-wide mb-1.5", isDark ? "text-slate-400" : "text-slate-500")}>Clip {clip}</p>
                              {outputs.overlayTexts!.filter((o: any) => (Number(o.clip) || 0) === clip).map((o: any, i: number) => (
                                <div key={i} className={cn("flex items-center justify-between gap-2 rounded-lg border p-2.5 mb-1.5", isDark ? "bg-slate-700/50 border-slate-600" : "bg-slate-50 border-slate-200")}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <TypeIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                    <span className={cn("font-medium text-sm truncate", isDark ? "text-slate-200" : "text-slate-700")}>{o.text}</span>
                                  </div>
                                  <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full flex-shrink-0", isDark ? "bg-slate-800 text-amber-300 border border-amber-700/40" : "bg-amber-100 text-amber-700")}>
                                    <Music className="w-3 h-3" /> {o.soundEffect}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))
                        )}
                        {outputs.overlayTexts && outputs.overlayTexts.length === 0 && (
                          <p className={cn("text-sm text-center py-4", isDark ? "text-slate-500" : "text-slate-400")}>No overlay texts needed for this script.</p>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : showMission && activeRun ? (
                <motion.div key={`mission-${activeRun.id}`} {...missionMotion(reduceMotion)} className="space-y-3">
                  <h2 className={cn("text-lg sm:text-xl font-extrabold tracking-tight", BRAND_TEXT)}>Generated Assets</h2>
                  <MissionWorkspace run={activeRun} done={missionDone} onToggle={toggleMission} isDark={isDark} />
                </motion.div>
              ) : !status.isProcessing ? (
                <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.25 } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                <div className={cn("rounded-2xl border p-8 sm:p-12 text-center shadow-xl",
                  isDark ? "bg-slate-900/70 border-slate-800 shadow-black/20 backdrop-blur" : "bg-white/90 border-slate-200 shadow-slate-200/60 backdrop-blur")}>
                  <div className={cn("w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-600/25", BRAND_GRADIENT)}>
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className={cn("text-xl font-extrabold mb-1.5 tracking-tight", BRAND_TEXT)}>Just dream big, we build it</h3>
                  <p className={cn("text-sm mb-7", isDark ? "text-slate-400" : "text-slate-500")}>Your complete ad kit — frames, poster, voice-over, Veo prompts, B-roll &amp; overlays.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
                    {[
                      { n: '1', t: 'Upload assets', d: 'Logo or name board, cards & store photos' },
                      { n: '2', t: 'Configure', d: 'Mode, ratio, language, attire & duration' },
                      { n: '3', t: 'Generate', d: 'Copy each prompt into the video platform' },
                    ].map(s => (
                      <div key={s.n} className={cn("rounded-xl border p-3.5", isDark ? "bg-slate-800/60 border-slate-700/60" : "bg-slate-50 border-slate-200")}>
                        <span className={cn("inline-flex w-6 h-6 mb-2 rounded-lg text-[11px] font-bold text-white items-center justify-center", BRAND_GRADIENT)}>{s.n}</span>
                        <p className={cn("text-xs font-bold mb-0.5", isDark ? "text-slate-200" : "text-slate-700")}>{s.t}</p>
                        <p className={cn("text-[11px] leading-relaxed", isDark ? "text-slate-500" : "text-slate-400")}>{s.d}</p>
                      </div>
                    ))}
                  </div>
                </div>
                </motion.div>
              ) : null}
              </AnimatePresence>

              <AIGuideSheet
                open={guideOpen}
                onOpenChange={setGuideOpen}
                run={activeRun}
                processing={status.isProcessing}
                facts={activeRun && !viewingSavedItem ? activeRun.facts : currentRunFacts()}
                outputs={outputs}
                done={missionDone}
                onToggle={toggleMission}
                isDark={isDark}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

// Collapsible Output Section wrapper
const OutputSection: React.FC<{
  title: string; sectionKey: string; children: React.ReactNode;
  collapsedOutputs: Record<string, boolean>; toggleOutputSection: (s: string) => void;
  isDark: boolean;
  copyContent?: string;
  /** Text on the whole-section copy button. Defaults to "Copy". */
  copyLabel?: string;
  quickCopyItems?: string[];
  quickCopyLabel?: string;
  quickCopyNamespace?: string;
  quickCopyRanges?: string[];
  /** Per-item "attach this photo", surfaced on the quick-copy chips as the photo itself. */
  quickCopyAttachments?: (PromptAttachment | null)[];
}> = ({ title, sectionKey, children, collapsedOutputs, toggleOutputSection, isDark, copyContent, copyLabel, quickCopyItems, quickCopyLabel, quickCopyNamespace, quickCopyRanges, quickCopyAttachments }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!copyContent) return;
    const cleaned = cleanPromptForClipboard(copyContent);
    navigator.clipboard.writeText(cleaned);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={cn("rounded-2xl border overflow-hidden shadow-lg",
      isDark ? "border-slate-800 shadow-black/10" : "border-slate-200 shadow-slate-200/50")}>
      <div className={cn("relative w-full flex items-center justify-between gap-3 px-4 py-3",
        isDark ? "bg-slate-900/80 text-slate-200" : "bg-slate-50 text-slate-800"
      )}>
        <div className={cn("absolute left-0 top-0 bottom-0 w-1", BRAND_GRADIENT)} />
        <div className="min-w-0 flex-1 pl-1.5">
          <span className="font-semibold text-sm uppercase tracking-wide text-left">{title}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {quickCopyItems && quickCopyItems.length > 0 && (
            <QuickCopyActions prompts={quickCopyItems} isDark={isDark}
              labelPrefix={quickCopyLabel ?? 'F'} namespace={quickCopyNamespace ?? 'main-frame'}
              ranges={quickCopyRanges} attachments={quickCopyAttachments} />
          )}
          {copyContent && (
            <span
              onClick={handleCopy}
              className={cn(
                "flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
                copied
                  ? isDark ? "text-green-400 bg-green-900/30" : "text-green-600 bg-green-50"
                  : isDark ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30" : "text-slate-500 hover:text-blue-600 hover:bg-blue-50"
              )}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : (copyLabel ?? 'Copy')}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => toggleOutputSection(sectionKey)}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              isDark ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            )}
            aria-label={collapsedOutputs[sectionKey] ? `Collapse ${title}` : `Expand ${title}`}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", collapsedOutputs[sectionKey] && "rotate-180")} />
          </button>
        </div>
      </div>
      {collapsedOutputs[sectionKey] && children}
    </div>
  );
};

const QuickCopyActions: React.FC<{
  prompts: string[];
  isDark: boolean;
  labelPrefix?: string;
  namespace?: string;
  ranges?: string[];
  /**
   * Per-prompt attachment, when the prompt carries one. These chips are the ONLY thing most
   * members touch — they copy from the collapsed header and go straight to the generator without
   * ever expanding the section — so the photo to attach is shown ON the chip, as a thumbnail of
   * the real image rather than a number they would have to count out.
   */
  attachments?: (PromptAttachment | null)[];
}> = ({ prompts, isDark, labelPrefix = 'F', namespace = 'main-frame', ranges, attachments }) => {
  const { toast } = useToast();
  const promptFingerprint = prompts
    .map((prompt) => cleanPromptForClipboard(prompt))
    .join('||');
  const storageKey = `ai-platform-${namespace}-last-copied-${promptFingerprint}`;
  const [copiedKey, setCopiedKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(storageKey);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCopiedKey(window.localStorage.getItem(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (copiedKey) {
      window.localStorage.setItem(storageKey, copiedKey);
      return;
    }
    window.localStorage.removeItem(storageKey);
  }, [copiedKey, storageKey]);

  const copyText = (event: React.MouseEvent, key: string, content: string, index: number) => {
    event.stopPropagation();
    navigator.clipboard.writeText(cleanPromptForClipboard(content));
    setCopiedKey(key);
    // Second line of defence behind the chip badge: the member has just copied and is about to
    // leave the page, so the attachment instruction follows them out.
    const attachment = attachments?.[index];
    if (attachment) {
      toast({
        title: attachment.photoNumber === null
          ? `${labelPrefix}${index + 1} copied — nothing to attach`
          : `${labelPrefix}${index + 1} copied — now attach photo ${attachment.photoNumber}`,
        description: attachment.photoNumber === null
          ? "This clip's location is generated from the prompt."
          : `Store/Office Image #${attachment.photoNumber}${attachment.zone ? ` — ${attachment.zone}` : ''}${attachment.fileName ? ` (${attachment.fileName})` : ''}`,
      });
    }
  };

  const copiedIndex = copiedKey?.startsWith('clip-') ? Number(copiedKey.replace('clip-', '')) : null;
  const copiedFrameLabel = copiedIndex !== null && !Number.isNaN(copiedIndex) ? `${labelPrefix}${copiedIndex + 1}` : null;

  const clearCopiedState = (event: React.MouseEvent) => {
    event.stopPropagation();
    setCopiedKey(null);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {copiedFrameLabel && (
        <button
          type="button"
          onClick={clearCopiedState}
          title={`Last copied ${copiedFrameLabel}. Click to clear this marker.`}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all",
            isDark
              ? "border-emerald-500/40 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/30"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          )}
        >
          <Check className="w-3 h-3" />
          <span>Last: {copiedFrameLabel}</span>
        </button>
      )}
      {prompts.map((prompt, index) => {
        const key = `clip-${index}`;
        const isCopied = copiedKey === key;
        const frameLabel = `${labelPrefix}${index + 1}`;
        const range = ranges?.[index];
        const attachment = attachments?.[index];
        const photoNumber = attachment?.photoNumber ?? null;

        return (
          <button
            key={key}
            type="button"
            onClick={(event) => copyText(event, key, prompt, index)}
            title={attachment
              ? (photoNumber === null
                ? `Copy ${frameLabel} — nothing to attach, the location is generated`
                : `Copy ${frameLabel} — then attach Store/Office Image #${photoNumber}${attachment.zone ? ` (${attachment.zone})` : ''}`)
              : range ? `Copy ${frameLabel}${range}` : `Copy ${frameLabel} prompt`}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-all",
              isCopied
                ? isDark ? "border-emerald-500/50 bg-emerald-900/30 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                : isDark ? "border-slate-500 bg-white text-slate-900 shadow-sm hover:border-blue-500 hover:text-blue-700" : "border-slate-300 bg-white text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            )}
          >
            {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-70" />}
            <span>{frameLabel}</span>
            {range && <span className="font-normal opacity-60">{range}</span>}
            {/* The photo itself, right on the chip — no number to decode, no list to count. */}
            {attachment && (photoNumber === null ? (
              <span
                data-test={`attach-badge-${index}`}
                className={cn("ml-0.5 rounded px-1 py-0.5 text-[10px] font-bold leading-none",
                  isDark ? "bg-slate-600 text-slate-200" : "bg-slate-200 text-slate-600")}
              >
                no photo
              </span>
            ) : attachment.url ? (
              <img
                src={attachment.url}
                alt={`Attach image ${photoNumber}`}
                data-test={`attach-badge-${index}`}
                className="ml-0.5 h-5 w-5 rounded object-cover ring-2 ring-amber-400"
              />
            ) : (
              <span
                data-test={`attach-badge-${index}`}
                className="ml-0.5 rounded bg-amber-400 px-1 py-0.5 text-[10px] font-bold leading-none text-amber-950"
              >
                📎 {photoNumber}
              </span>
            ))}
          </button>
        );
      })}
    </div>
  );
};

export default AIPlatformApp;
