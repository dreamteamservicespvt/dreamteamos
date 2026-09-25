import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Wand2, Sparkles, Layout, Type, Rocket, AlertCircle,
  Loader2, Save, Check, Camera, Video, PenTool, ChevronDown, Copy,
  ExternalLink, StopCircle, ArrowLeft, CheckCircle2, Home, Ratio, Languages, Type as TypeIcon, Music,
  History, Image as ImageIcon, FileText, Mic, Package, Store, CreditCard, Files, Upload, Settings2, Download, Clock,
  type LucideIcon
} from 'lucide-react';
import { cueRange, cueWords } from '@/utils/wordTiming';
import { cn } from '@/lib/utils';
import { getRoleLabel } from '@/utils/roleHelpers';
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
import { briefAsInstructions, mergeBriefIntoInstructions } from '@/utils/adRequirement';
import { assignmentFormSpec, jobClipCount, jobKitSpec, kitSpec, staleKitChanges } from '@/utils/assignmentFormSpec';
import { CHATGPT_URL, GEMINI_URL } from './generation/mission';
import { characterPackGroups, getCharacterPack, isCustomPack, isHumanPack, packModelGender, packSpeakers, withCustomCharacter } from '@/services/characterPacks';
import { attireOptionsFor, castLabelFor } from '@/utils/adRequirement';
import { DOCUMENT_ROUTE_HINT } from './FileUpload';
import { generateAdAssets, generatePosterConcepts, refinePosterConcept, DEFAULT_POSTER_CONCEPT_COUNT, generateStockImagePrompts, refineStockImagePrompt, generateOverlayTexts, refineOverlayImagePrompt, refineSection, refineVoiceOver, refineVeoPrompts, regenerateVeoForClips, SectionType, extractBusinessNameFromInfo, buildVideoBottomLabel, writeVideoPosterPrompt } from '@/services/geminiService';
import FinalScriptInput, { type FinalScriptProgress, type FinalScriptSection } from './FinalScriptPanel';
import { finalScriptTemplate } from '@/utils/finalScript';
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
import { MissionStepper, MissionWorkspace, RunCountdown, missionMotion } from './generation/MissionWorkspace';
import { AIGuideSheet } from './generation/AIGuideSheet';
import { RefineRevisionBanner, type VoiceOverRevision } from './RefineRevisionBanner';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
// DTS brand system (violet → blue → cyan, from "JUST DREAM BIG, WE BUILD IT").
import { BRAND_GRADIENT, BRAND_GRADIENT_HOVER, BRAND_TEXT, STUDIO_IS_DARK } from './brand';
import './adgen.css';

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

/**
 * What the member pastes into Gemini alongside a client's PDF or document.
 *
 * Documents are not uploaded here (see FileUpload), because the generator cannot read them — but
 * Gemini can. This asks for exactly the business facts the pipeline reads, in plain text, so the
 * answer can be pasted straight into BUSINESS CONTENT.
 */
const DOCUMENT_EXTRACTION_PROMPT = `Read the attached document carefully and extract ALL of the business information in it, as plain text I can paste into another tool. Include, exactly as written: business name, owner name, what the business does, every product and service, offers / discounts / prices, timings, full address, every phone and WhatsApp number, email, website and social handles, taglines, and any instruction about what the advertisement should say or show. Do not summarise away details, do not invent anything, and write "Not provided" for anything missing. Keep the original language of names and addresses.`;

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
  /**
   * The studio is DARK ONLY (adgen.css). Its palette — deep navy, glass, one violet→cyan accent — is
   * the product's identity and the prompts, frames and posters are read against it all day; the light
   * theme washed the glass out and the member lost the depth that separates a panel from the canvas.
   * Every `isDark` branch below therefore takes the dark side, whatever the app theme is set to.
   */
  const isDark = STUDIO_IS_DARK;
  const user = useAuthStore((s) => s.user);
  const { confirm: showAlert, ConfirmDialog } = useConfirm();
  const { toast } = useToast();

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
    frameInstructions: '',
    customCharacter: '',
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
    logo: null, ownerImage: null, visitingCard: [], storeImage: [],
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
  /**
   * Which of the two left-hand sections is open — they share one space.
   *
   * Assets and Configuration used to be stacked, so reaching the duration meant scrolling past every
   * upload slot. Now the one that opens takes the room the other gives back (see .ag-morph in
   * adgen.css), and during a run both shut so the panel reads as the finished brief it is.
   */
  const [leftPanel, setLeftPanel] = useState<'assets' | 'config' | null>('assets');
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
  /**
   * The spec the kit on screen was generated FOR — set at Start and when a saved kit is restored.
   * Compared with the job as it stands, it says when the kit is out of date (utils/assignmentFormSpec).
   */
  const [kitSpecOnScreen, setKitSpecOnScreen] = useState<AssignmentSpec | null>(null);
  const [isGeneratingStock, setIsGeneratingStock] = useState(false);
  const [stockImageError, setStockImageError] = useState<string | null>(null);
  const [stockImageTheme, setStockImageTheme] = useState<string>('indian');
  const [copiedStockIdx, setCopiedStockIdx] = useState<number | null>(null);
  const [stockRefineIdx, setStockRefineIdx] = useState<number | null>(null);
  const [stockRefineText, setStockRefineText] = useState('');
  const [refiningStockIdx, setRefiningStockIdx] = useState<number | null>(null);
  const [isGeneratingOverlay, setIsGeneratingOverlay] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  /** The Final voice-over script panel, and the progress of the sections it rewrites. */
  const [finalScriptOpen, setFinalScriptOpen] = useState(false);
  const [finalScriptProgress, setFinalScriptProgress] = useState<FinalScriptProgress | null>(null);
  /**
   * A single deliverable being written on its own — a label, poster or set of video prompts that a
   * run left missing. Keyed by section; the value is the error when it failed.
   */
  const [sectionRegen, setSectionRegen] = useState<Partial<Record<'header' | 'poster' | 'veo', 'run' | string>>>({});
  /** Overlay Text Image Generator — which overlay's prompt was copied / is being refined (index in overlayTexts). */
  const [copiedOverlayIdx, setCopiedOverlayIdx] = useState<number | null>(null);
  const [overlayRefineIdx, setOverlayRefineIdx] = useState<number | null>(null);
  const [overlayRefineText, setOverlayRefineText] = useState('');
  const [refiningOverlayIdx, setRefiningOverlayIdx] = useState<number | null>(null);
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
  /** A fingerprint of what the open document already holds — see the autosave effect below. */
  const savedFingerprintRef = useRef<string>('');
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
    // One list of what a job decides — utils/assignmentFormSpec. The restore of a saved kit applies
    // the same list on top of what it restores, so the two can never disagree about a field.
    const spec = assignmentFormSpec(a);
    // The festival picker is two pieces of state (the dropdown and the "other" box), so it is set
    // here alongside the form rather than left on whatever the member last looked at.
    if (spec.festivalPicker) {
      setSelectedFestivalOption(spec.festivalPicker.option);
      setCustomFestivalName(spec.festivalPicker.custom);
    }
    if (spec.poster) setCreationMode('poster');
    setFormData(prev => ({ ...prev, ...spec.form }));
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
  /** Exactly the brief text this component last wrote into BUSINESS CONTENT. */
  const appliedBriefText = useRef<string>('');
  const briefBusinessName = assignment?.businessName || assignment?.clientName || '';
  useEffect(() => {
    if (!assignment || assignmentBrief.loading) return;
    const text = briefAsInstructions(assignmentBrief.businessInfo, assignmentBrief.businessAddress, {
      businessName: briefBusinessName, notes: assignmentBrief.notes,
    });
    if (!text || text === appliedBriefText.current) return;
    const previous = appliedBriefText.current;
    appliedBriefText.current = text;
    /*
      A corrected brief reaches the member even when they have written in the box: the old brief is
      replaced where it stands, or the new one goes on top (utils/adRequirement mergeBriefIntoInstructions).
      It used to be applied only to an empty or untouched box, so one added line meant the admin's
      corrected address never arrived.
    */
    setFormData(prev => {
      const merged = mergeBriefIntoInstructions(prev.textInstructions, previous, text);
      return merged === prev.textInstructions ? prev : { ...prev, textInstructions: merged };
    });
    // Keyed on the job and on the brief arriving; the assignment object itself changes every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.id, assignmentBrief.loading, assignmentBrief.businessInfo, assignmentBrief.businessAddress, assignmentBrief.notes, briefBusinessName]);
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
  /** A custom character described on the sale is part of what was sold — fixed for the member. */
  const characterLocked = !!assignment?.customCharacter?.trim() && isCustomPack(activePack);

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

  /**
   * Auto-load the last saved generation when a job OPENS — and only then.
   *
   * ── The "completed, but some deliverables are missing" glitch ─────────────────────────────────
   * This used to run whenever the job's `savedGenerationId` changed. Every finished run changes it:
   * the run saves a new document and points the job at it. So a moment after each run, this effect
   * read that document back and replaced everything on screen with it — while the B-roll and overlay
   * prompts were still being written. Whichever of the two landed last won. On a fast connection the
   * read-back usually came first and nothing was lost; on mobile data the B-roll or the overlays
   * arrived first and were wiped, and the status still said Completed.
   *
   * It now restores only a document this screen is not already showing, and only when nothing is on
   * screen yet — which is exactly "reopening the job".
   */
  const outputsOnScreen = !!outputs;
  useEffect(() => {
    const id = assignment?.savedGenerationId;
    if (!id || id === generationDocIdRef.current || outputsOnScreen || status.isProcessing) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'ai_generations', id));
        if (cancelled || !snap.exists()) return;
        // Something may have been generated while the read was in flight — that work wins.
        if (generationDocIdRef.current && generationDocIdRef.current !== id) return;
        const item = { id: snap.id, ...snap.data() } as SavedGeneration;
        restoreGeneration(item, true);
      } catch (e) {
        console.error('Failed to auto-load saved generation:', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    customCharacter: formData.customCharacter || '',
    frameInstructions: formData.frameInstructions || '',
    sceneContext: o.sceneContext || null,
    voiceBrief: o.voiceBrief || null,
    scriptQa: o.scriptQa || null,
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
    savedFingerprintRef.current = JSON.stringify(payload);
    if (assignmentId) {
      await updateDoc(doc(db, 'work_assignments', assignmentId), { savedGenerationId: id });
    }
    return id;
  };

  /**
   * Everything generated AFTER the first save, saved by itself.
   *
   * Only the initial generation and the Save button ever wrote to Firestore, and B-roll prompts,
   * overlay texts, poster concepts and refines are all made later, on demand — they lived in React
   * state and were gone the next time the ad was opened. This writes the whole generation whenever it
   * changes, a second after the change settles, to the SAME document. It never fires while a
   * generation is running (the outputs are still partial), never before the first save has given us a
   * document, and never when nothing actually differs from what is already stored.
   */
  useEffect(() => {
    if (!user || !outputs || !generationDocIdRef.current || status.isProcessing) return;
    const fingerprint = JSON.stringify(generationPayload(outputs));
    if (!savedFingerprintRef.current) {
      // First sight of a reopened document: treat what is on screen as what is stored.
      savedFingerprintRef.current = fingerprint;
      return;
    }
    if (fingerprint === savedFingerprintRef.current) return;
    const timer = setTimeout(async () => {
      try {
        await persistGeneration(outputs);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } catch (e) {
        console.error('Auto-save of the generated sections failed:', e);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [outputs, user, status.isProcessing]);

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
    savedFingerprintRef.current = '';
    setViewingSavedItem(item);
    setVoiceOverRevision(null);
    // A different kit: nothing on it was updated from a final script, and no section is being rewritten.
    setFinalScriptProgress(null);
    setSectionRegen({});
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
      sceneContext: item.sceneContext || null,
      voiceBrief: item.voiceBrief || null,
      scriptQa: item.scriptQa || null,
    });
    setFormData(prev => ({
      ...prev,
      adType: item.adType as AdType,
      festivalName: item.festivalName || '',
      characterPack: item.characterPack || undefined,
      ...(item.customCharacter !== undefined && !characterLocked ? { customCharacter: item.customCharacter || '' } : {}),
      ...(item.frameInstructions !== undefined ? { frameInstructions: item.frameInstructions || '' } : {}),
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
    /*
      The JOB decides every field it specifies — applied after the saved settings, so a kit made
      before an admin changed the attire can no longer put the old attire back into a locked field.
      The kit itself is kept (it is the member's work), and the banner above the deliverables says
      what it was made for, if that is no longer the job.
    */
    if (assignment) applyAssignmentSpec(assignment);
    const savedClips = item.veoPrompts?.length || item.mainFramePrompts?.length || Math.round((item.duration || 16) / 8);
    setKitSpecOnScreen(kitSpec({
      adType: item.adType, festivalName: item.festivalName, gender: item.gender, attireType: item.attireType,
      customAttire: item.customAttire, aspectRatio: item.aspectRatio, language: item.language,
      characterPack: item.characterPack ?? undefined, customCharacter: item.customCharacter,
      locationMode: item.locationMode ?? undefined, posterSize: item.posterSize, posterStyle: item.posterStyle,
      posterOccasion: item.posterOccasion, posterTextLanguage: item.posterTextLanguage,
    }, savedClips, item.creationMode === 'poster'));
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
          const fresh = await regenerateVeoForClips(result.script, formData, outputs.mainFramePrompts || [], result.changed, outputs.sceneContext);
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
      // Say what the request was understood as — the member can tell at once whether it was heard right.
      const understood = result.understood ? `Understood: ${result.understood}` : '';
      if (result.changed.length === 0 || result.rejected.length > 0) {
        const kept = result.rejected.map(i => `Clip ${i + 1}`).join(', ');
        await showAlert({
          title: result.changed.length === 0 ? "Nothing changed" : "Partly applied",
          description: [
            understood,
            result.changed.length > 0 ? `Updated: ${result.changed.map(i => `Clip ${i + 1}`).join(', ')}.` : '',
            result.rejected.length > 0
              ? `${kept} kept ${result.rejected.length === 1 ? 'its' : 'their'} original prompt. ${result.notApplied}`
              : result.notApplied || "The prompt came back the same. Try describing the change more specifically.",
          ].filter(Boolean).join('\n\n'),
          confirmText: "OK",
        });
      } else if (understood) {
        toast({ title: `Veo prompt${result.changed.length === 1 ? '' : 's'} updated — ${result.changed.map(i => `Clip ${i + 1}`).join(', ')}`, description: understood });
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
    fileCount: (files.logo ? 1 : 0) + (files.ownerImage ? 1 : 0) + files.visitingCard.length + files.storeImage.length
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
      ownerFace: creationMode === 'video' && !!activePack?.usesClientFace,
    };
  };

  const handleGenerate = async () => {
    // 1 · The client's brief is still being read — a run started now would not contain it.
    if (assignment && assignmentBrief.loading) {
      await showAlert({
        title: "One moment — loading the brief",
        description: "The client's business details for this job are still being read. They fill BUSINESS CONTENT, and a run started without them writes an ad for the wrong business. Try again in a second.",
        confirmText: "OK",
      });
      return;
    }
    // 2 · Nothing at all says who the business is.
    const tellsUsAboutTheBusiness = !!formData.textInstructions.trim()
      || files.visitingCard.length > 0 || files.storeImage.length > 0
      || files.productImages.length > 0 || files.flyersPosters.length > 0
      || files.voiceRecording.length > 0;
    if (!tellsUsAboutTheBusiness) {
      await showAlert({
        title: "Tell us about the business first",
        description: "There is nothing for DTS to read: BUSINESS CONTENT is empty and no visiting card, store photo, product photo, flyer or voice note is attached. Without them the ad is written for an invented business. Paste the client's details into BUSINESS CONTENT, or attach their visiting card.",
        confirmText: "OK",
      });
      return;
    }
    const hasNameBoard = !!(formData.noLogo && formData.logoNameText?.trim());
    if (!files.logo && !hasNameBoard) {
      await showAlert({ title: "Missing Logo", description: "Upload a logo image, OR tick 'No logo' and enter the business name to use as a name board.", confirmText: "OK" });
      return;
    }
    if (creationMode === 'poster' && !isValidPosterSize(formData.posterSize)) {
      await showAlert({ title: "Poster size", description: "Enter a valid custom size — a ratio like 5 : 7, or pixels like 1080 × 1350.", confirmText: "OK" });
      return;
    }
    // The owner's face IS the ad on a Real Owner Face job — without the photo there is nothing to copy.
    if (creationMode === 'video' && activePack?.usesClientFace && !files.ownerImage) {
      await showAlert({ title: "Owner image missing", description: "This is a Real Owner Face ad. Upload a clear, front-facing photo of the owner into UPLOAD OWNER IMAGE — every clip reproduces that exact face.", confirmText: "OK" });
      return;
    }
    // A custom character is built entirely from its description.
    if (creationMode === 'video' && isCustomPack(activePack) && !formData.customCharacter?.trim()) {
      await showAlert({ title: "Describe the character", description: "Type who or what the custom character is — the whole character, its look, voice and personality, is built from that description.", confirmText: "OK" });
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
    // What this kit is being made for — so a later change to the job can be shown against it.
    const runSpec = kitSpec({
      adType: formData.adType, festivalName: formData.festivalName, gender: formData.gender,
      attireType: formData.attireType, customAttire: formData.customAttire, aspectRatio: formData.aspectRatio,
      language: formData.language, characterPack: formData.characterPack || '', customCharacter: formData.customCharacter,
      locationMode: formData.locationMode ?? null, posterSize: formData.posterSize, posterStyle: formData.posterStyle,
      posterOccasion: formData.posterOccasion, posterTextLanguage: formData.posterTextLanguage,
    }, runProfile.clipCount, creationMode === 'poster');
    setErrorModalDismissed(false);
    setStatus({ step: 'Initializing...', isProcessing: true, error: null, progress: 0 });
    setOutputs(null);
    setActiveRun({ id: runStartedAt, profile: runProfile, checkpoints: [{ percent: 0, at: runStartedAt }], facts: currentRunFacts() });
    setLeftPanel(null);
    setMissionDone({});
    setGuideOpen(false);
    setVoiceOverRevision(null);
    setFinalScriptProgress(null);
    setFinalScriptOpen(false);
    setSectionRegen({});
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
      setKitSpecOnScreen(runSpec);
      setStatus(prev => ({ ...prev, isProcessing: false, step: 'Completed', progress: 100 }));
      // Part of the kit, not an afterthought — and they read this run's result, not state.
      if (creationMode === 'video' && generatedResult.voiceOverScript) {
        void Promise.all([
          handleGenerateStockImages(generatedResult),
          handleGenerateOverlayTexts(generatedResult),
        ]).catch(() => { /* each one already surfaces its own error in its section */ });
      }
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

  /** Writes the B-roll prompts from a kit (this run's, before state has it, or the one on screen). True when they arrived. */
  const handleGenerateStockImages = async (source?: GeneratedOutputs): Promise<boolean> => {
    const from = source ?? outputs;
    if (!from || !from.voiceOverScript) return false;
    setIsGeneratingStock(true);
    setStockImageError(null);
    try {
      const clipCount = from.veoPrompts?.length || from.mainFramePrompts?.length || Math.round(formData.duration / 8);
      const stockPrompts = await generateStockImagePrompts(from.voiceOverScript, from.businessInfo, formData.adType, formData.festivalName, stockImageTheme, formData.aspectRatio, clipCount,
        { sceneContext: from.sceneContext, coreMessage: from.coreMessage });
      // Only onto the script they were written for — a newer final script may have replaced it meanwhile.
      setOutputs(prev => prev && prev.voiceOverScript === from.voiceOverScript ? { ...prev, stockImagePrompts: stockPrompts } : prev);
      return true;
    } catch (error: any) {
      setStockImageError(error.message || 'Failed to generate stock image prompts.');
      return false;
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
  const handleGenerateOverlayTexts = async (source?: GeneratedOutputs): Promise<boolean> => {
    const from = source ?? outputs;
    if (!from || !from.voiceOverScript) return false;
    setIsGeneratingOverlay(true);
    setOverlayError(null);
    try {
      const items = await generateOverlayTexts(from.voiceOverScript, from.businessInfo, formData.language, overlayDesignContext(from));
      setOutputs(prev => prev && prev.voiceOverScript === from.voiceOverScript ? { ...prev, overlayTexts: items } : prev);
      return true;
    } catch (error: any) {
      setOverlayError(error.message || 'Failed to generate overlay texts.');
      return false;
    } finally {
      setIsGeneratingOverlay(false);
    }
  };

  /** The clips the kit on screen was built for — the frames it has, else the job's own count. */
  const kitClipCount = () => outputs?.mainFramePrompts?.length || outputs?.veoPrompts?.length
    || (assignment && !isPosterCategory(assignment.category) ? jobClipCount(assignment) : Math.max(1, Math.round((formData.duration || 16) / 8)));

  /**
   * One section rewritten from a final script — the video prompts, the B-roll or the overlays — with
   * its progress recorded against this apply only, so a later apply is never marked by an earlier one.
   */
  const runFinalScriptSection = async (section: FinalScriptSection, kit: GeneratedOutputs, appliedAt: number) => {
    const mark = (state: 'run' | 'done' | 'error') => setFinalScriptProgress(prev => (
      prev && prev.appliedAt === appliedAt ? { ...prev, sections: { ...prev.sections, [section]: state } } : prev
    ));
    mark('run');
    let ok = false;
    try {
      if (section === 'veo') {
        // Every clip, from the frames already made — only the words changed, not the pictures.
        const fresh = await regenerateVeoForClips(kit.voiceOverScript, formData, kit.mainFramePrompts || [], undefined, kit.sceneContext);
        setOutputs(prev => {
          if (!prev || prev.voiceOverScript !== kit.voiceOverScript) return prev;
          const veoPrompts = [...(prev.veoPrompts || [])];
          fresh.forEach(({ index, prompt }) => { veoPrompts[index] = prompt; });
          return { ...prev, veoPrompts: veoPrompts.slice(0, Math.max(fresh.length, 1)) };
        });
        ok = fresh.length > 0;
      } else if (section === 'stock') {
        ok = await handleGenerateStockImages(kit);
      } else {
        ok = await handleGenerateOverlayTexts(kit);
      }
    } catch (e) {
      console.error(`Rewriting ${section} from the final script failed:`, e);
      ok = false;
    }
    mark(ok ? 'done' : 'error');
  };

  /** The member's final script becomes the voice-over, and 5 · 6 · 7 are rewritten from it. */
  const handleApplyFinalScript = (script: string) => {
    if (!outputs) return;
    const appliedAt = Date.now();
    const kit: GeneratedOutputs = { ...outputs, voiceOverScript: script };
    setOutputs(prev => (prev ? { ...prev, voiceOverScript: script } : prev));
    setVoiceOverRevision(null);
    setFinalScriptProgress({ appliedAt, sections: { veo: 'run', stock: 'run', overlay: 'run' } });
    (['veo', 'stock', 'overlay'] as FinalScriptSection[]).forEach(section => { void runFinalScriptSection(section, kit, appliedAt); });
  };

  const handleRetryFinalScriptSection = (section: FinalScriptSection) => {
    if (!outputs || !finalScriptProgress) return;
    void runFinalScriptSection(section, outputs, finalScriptProgress.appliedAt);
  };

  /** A label missing from a kit, rebuilt on its own — it is assembled in code, so it is instant. */
  const handleRegenerateHeader = () => {
    if (!outputs) return;
    const headerPrompt = buildVideoBottomLabel({
      formData, businessInfo: outputs.businessInfo, hasLogoFile: !!files.logo,
      hasPremisesPhoto: files.storeImage.length > 0, sceneContext: outputs.sceneContext, coreMessage: outputs.coreMessage,
    });
    setOutputs(prev => (prev ? { ...prev, headerPrompt } : prev));
  };

  const clearSectionRegen = (key: 'header' | 'poster' | 'veo') => setSectionRegen(prev => {
    const next = { ...prev };
    delete next[key];
    return next;
  });

  /** A poster missing from a kit, written on its own from the same verified facts. */
  const handleRegeneratePoster = async () => {
    if (!outputs) return;
    setSectionRegen(prev => ({ ...prev, poster: 'run' }));
    try {
      const posterPrompt = await writeVideoPosterPrompt(formData, outputs.businessInfo);
      setOutputs(prev => (prev ? { ...prev, posterPrompt } : prev));
      clearSectionRegen('poster');
    } catch (e: any) {
      setSectionRegen(prev => ({ ...prev, poster: e?.message || 'The poster prompt could not be written. Try again.' }));
    }
  };

  /** Video prompts missing from a kit — only the clips that have none, from their own frames. */
  const handleRegenerateVeo = async () => {
    if (!outputs?.voiceOverScript) return;
    const frames = outputs.mainFramePrompts || [];
    const have = outputs.veoPrompts || [];
    const missing = frames.map((_, i) => i).filter(i => !have[i]?.trim());
    setSectionRegen(prev => ({ ...prev, veo: 'run' }));
    try {
      const fresh = await regenerateVeoForClips(outputs.voiceOverScript, formData, frames, missing.length > 0 ? missing : undefined, outputs.sceneContext);
      setOutputs(prev => {
        if (!prev) return prev;
        const veoPrompts = [...(prev.veoPrompts || [])];
        fresh.forEach(({ index, prompt }) => { veoPrompts[index] = prompt; });
        return { ...prev, veoPrompts };
      });
      clearSectionRegen('veo');
    } catch (e: any) {
      setSectionRegen(prev => ({ ...prev, veo: e?.message || 'The video prompts could not be written. Try again.' }));
    }
  };

  /** What the overlays' 3D look is themed to: the festival's own palette, or the business. */
  const overlayDesignContext = (source?: GeneratedOutputs) => ({
    adType: formData.adType,
    festivalName: formData.festivalName,
    sceneContext: (source ?? outputs)?.sceneContext,
    coreMessage: (source ?? outputs)?.coreMessage,
  });

  /** Refine Prompt — changes only the look of one overlay's image; its text and transparency are fixed. */
  const handleRefineOverlayImage = async (idx: number) => {
    const item = outputs?.overlayTexts?.[idx];
    if (!item || !overlayRefineText.trim()) return;
    setRefiningOverlayIdx(idx);
    try {
      const refined = await refineOverlayImagePrompt({
        text: item.text,
        currentPrompt: item.imagePrompt || '',
        currentDesign: item.imageDesign,
        instruction: overlayRefineText.trim(),
        businessInfo: outputs?.businessInfo,
        context: overlayDesignContext(),
      });
      setOutputs(prev => {
        if (!prev?.overlayTexts) return prev;
        const next = [...prev.overlayTexts];
        next[idx] = { ...next[idx], ...refined };
        return { ...prev, overlayTexts: next };
      });
      setOverlayRefineIdx(null);
      setOverlayRefineText('');
    } catch (error: any) {
      setOverlayError(error.message || 'Failed to refine the overlay prompt.');
    } finally {
      setRefiningOverlayIdx(null);
    }
  };

  /** What the shut Assets panel shows: every slot, and what has actually been given to it. */
  const assetTiles = [
    { label: 'Business Logo', icon: ImageIcon, hint: 'PNG / JPG', count: files.logo ? 1 : 0 },
    { label: 'Visiting Card', icon: CreditCard, hint: 'Front & back', count: files.visitingCard.length },
    { label: 'Store / Office', icon: Store, hint: 'Inside, outside', count: files.storeImage.length },
    { label: 'Product Images', icon: Package, hint: 'Your products', count: files.productImages.length },
    { label: 'Flyers / Posters', icon: Files, hint: 'Offers, brochures', count: files.flyersPosters.length },
    { label: 'Voice Instructions', icon: Mic, hint: 'Audio note', count: files.voiceRecording.length },
  ];

  /**
   * The shape a pasted final script must take for THIS job — the same shape the script is written
   * in wherever it is written, and the same one utils/dialogueFormat reads back.
   */
  /** Who speaks in this ad, as a script labels them — the same list the generator reads (packFor). */
  const scriptSpeakers = (() => {
    const pack = withCustomCharacter(getCharacterPack(formData.characterPack), formData.customCharacter);
    return pack ? packSpeakers(pack) : [];
  })();
  const customScriptTemplate = finalScriptTemplate(scriptSpeakers, kitClipCount());

  /**
   * Where each deliverable stands. A row used to be drawn only when it had content, so a section that
   * failed or came back empty simply was not there while the status said Completed — nobody could
   * tell a missing poster from a kit that never had one. Every row is drawn now, and says so.
   */
  const rowState = (key: 'mainFrame' | 'header' | 'poster' | 'voiceOver' | 'veo' | 'stock' | 'overlay', has: boolean): RowState => {
    const regen = key === 'header' || key === 'poster' || key === 'veo' ? sectionRegen[key] : undefined;
    if ((key === 'stock' && isGeneratingStock) || (key === 'overlay' && isGeneratingOverlay) || regen === 'run') {
      return { tone: 'run', label: finalScriptProgress?.sections[key as FinalScriptSection] === 'run' ? 'Regenerating…' : 'Writing…' };
    }
    const fromScript = key === 'veo' || key === 'stock' || key === 'overlay' ? finalScriptProgress?.sections[key] : undefined;
    if (fromScript === 'run') return { tone: 'run', label: 'Regenerating…' };
    if (fromScript === 'error') return { tone: 'bad', label: 'Update failed' };
    if (typeof regen === 'string') return { tone: 'bad', label: 'Failed' };
    if ((key === 'stock' && stockImageError) || (key === 'overlay' && overlayError)) return { tone: 'bad', label: 'Failed' };
    if (!has) return status.isProcessing ? { tone: 'run', label: 'Writing…' } : { tone: 'wait', label: 'Missing' };
    if (fromScript === 'done') return { tone: 'ok', label: 'Updated from final script' };
    if (key === 'voiceOver' && finalScriptProgress) return { tone: 'ok', label: 'Final script applied' };
    if (key === 'voiceOver' && outputs?.scriptQa) {
      return { tone: outputs.scriptQa.passed ? 'ok' : 'wait', label: `Script QA ${outputs.scriptQa.score}/10` };
    }
    return null;
  };
  /** Clips that have a frame but no video prompt — a partial row says how many, and writes only those. */
  const veoGaps = outputs
    ? Math.max(0, (outputs.mainFramePrompts?.length || 0) - (outputs.veoPrompts || []).filter(p => p?.trim()).length)
    : 0;

  /** The shut Configuration panel says what the run is set to, not what the panel contains. */
  const configSummary = creationMode === 'poster'
    ? `Poster · ${posterSizeLabel(formData.posterSize || DEFAULT_POSTER_SIZE)} · ${formData.posterTextLanguage || 'English'}`
    : `${formData.adType === AdType.FESTIVAL ? 'Festival wishes' : 'Commercial'} · ${formData.aspectRatio} · ${formData.duration}s · ${formData.language || 'Telugu'}`;

  /** The job strip under the header: whose ad this is, what kind, and how many clips. */
  const jobStrip = (() => {
    const name = assignment?.businessName?.trim() || assignment?.clientName?.trim()
      || extractBusinessNameFromInfo(outputs?.businessInfo) || assignment?.displayTitle?.trim() || 'New ad';
    const facts: string[] = [];
    if (creationMode === 'poster') {
      facts.push('Poster');
      facts.push(posterSizeLabel(formData.posterSize || DEFAULT_POSTER_SIZE));
      if (formData.posterOccasion?.trim()) facts.push(formData.posterOccasion.trim());
      facts.push(formData.posterTextLanguage || 'English');
    } else {
      const category = assignment?.category
        ? assignment.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : formData.adType === AdType.FESTIVAL ? 'Wishes' : 'Promotional';
      facts.push(formData.adType === AdType.FESTIVAL && formData.festivalName.trim()
        ? `${category} · ${formData.festivalName.trim()}` : category);
      facts.push(activePack ? activePack.label : 'Normal ad');
      const clips = assignment && !isPosterCategory(assignment.category) ? jobClipCount(assignment) : runClipCount();
      facts.push(`${clips} clip${clips === 1 ? '' : 's'} + EC · ${clips * 8}s`);
      facts.push(formData.aspectRatio);
      facts.push(formData.language || 'Telugu');
    }
    return { name, facts };
  })();

  /** What the job says now that the kit on screen was not made for — empty when they still match. */
  const staleChanges = assignment && outputs && !status.isProcessing
    ? staleKitChanges(kitSpecOnScreen, jobKitSpec(assignment))
    : [];

  return (
    <div className="adgen fixed inset-0 z-50 flex flex-col overflow-hidden">
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
          <div className="ag-card w-full max-w-md p-6">
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

      {/* Top navigation — 72px glass, gradient hairline, the run's state always in sight */}
      <div className="ag-nav relative px-3 sm:px-5 h-14 sm:h-[72px] flex flex-nowrap items-center gap-2 sm:gap-3 shrink-0 overflow-hidden">
        <button onClick={onClose} aria-label="Back" className="ag-btn ag-btn--icon ag-btn--sm sm:h-11 sm:w-11 shrink-0">
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>

        <div className="flex items-center gap-2.5 shrink-0">
          <BrandLogo variant="mark" on="dark" alt="DTS — Dream Team Services" className="h-7 sm:h-8 w-auto shrink-0" />
          {/* the company mark and the product name are two marks — a hairline keeps them from reading as one */}
          <span className="hidden sm:block w-px h-6 sm:h-7 bg-white/10 shrink-0" />
          <div className="leading-tight hidden sm:block shrink-0 whitespace-nowrap">
            <h1 className="ag-h2 text-[15px] sm:text-base whitespace-nowrap">DTS AdGen<span style={{ color: '#67E8F9' }}>.ai</span></h1>
            <p className="hidden lg:block text-[11px] ag-muted whitespace-nowrap">Just dream big, we build it.</p>
          </div>
        </div>

        <div className="flex-1 min-w-[8px]" />

        {status.isProcessing ? (
          <span className="ag-chip ag-badge--run hidden sm:inline-flex shrink-0 whitespace-nowrap">
            <span className="ag-halo w-1.5 h-1.5 rounded-full bg-violet-300 inline-block" />
            Generating · {Math.round(status.progress)}%
          </span>
        ) : (
          <span className="ag-chip ag-badge--ok hidden sm:inline-flex shrink-0 whitespace-nowrap">
            {outputs ? <Check className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 inline-block" />}
            {saveSuccess ? 'Saved' : 'Ready'}
          </span>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Every generation this member has run, same list as before — it just lives up here now,
              where it is reachable at any stage instead of only once assets exist. */}
          <button type="button" onClick={() => setShowSavedItems(true)} data-test="project-history"
            className="ag-btn ag-btn--secondary ag-btn--sm sm:h-11 sm:px-[18px] sm:text-sm whitespace-nowrap">
            <History className="w-4 h-4" /><span className="hidden xl:inline">Project History</span>
          </button>
          {onComplete && (
            // Disabled and visibly busy while submitting. Submitting does several writes and can
            // take seconds on mobile data; a button that looked unchanged the whole time is what
            // led members to tap it repeatedly and fire a round of notifications each time.
            <button
              onClick={onComplete}
              disabled={completing}
              data-test="mark-complete"
              className="ag-btn ag-btn--primary ag-btn--sm sm:h-11 sm:px-[18px] sm:text-sm whitespace-nowrap">
              {completing
                ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Submitting…</span></>
                : <><CheckCircle2 className="w-4 h-4" /><span className="hidden lg:inline">Mark Complete</span><span className="lg:hidden">Done</span></>}
            </button>
          )}
          {user?.name && (
            <div className="hidden 2xl:flex items-center gap-2.5 pl-2.5 ml-0.5 border-l border-white/10 shrink-0">
              <span className={cn("w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white", BRAND_GRADIENT)}>
                {user.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
              </span>
              <span className="leading-tight min-w-0">
                <span className="block text-[13px] font-semibold text-slate-100 truncate max-w-[110px]">{user.name}</span>
                <span className="block text-[11px] ag-muted truncate max-w-[110px]">{user.role ? getRoleLabel(user.role) : 'Team'}</span>
              </span>
            </div>
          )}
          <button onClick={onClose} className="ag-btn ag-btn--secondary ag-btn--sm sm:h-11 sm:px-[18px] sm:text-sm whitespace-nowrap">
            <Home className="w-4 h-4" /><span className="hidden lg:inline">Close project</span><span className="lg:hidden">Home</span>
          </button>
        </div>
        <div className="ag-hairline absolute inset-x-0 -bottom-px" />
      </div>

      {/*
        WHICH AD THIS IS — at every width.

        The business, the kind of ad, the special category and the number of clips used to sit in the
        header, and the one-row header hid them below 2xl to stay on one line — so on an ordinary
        laptop a member with three jobs open could not tell which one they were in. They live on their
        own slim line now, which nothing else competes for.
      */}
      <div data-test="job-strip" className="ag-jobstrip shrink-0">
        <div className="max-w-[1520px] mx-auto px-3 sm:px-6 lg:px-10 h-9 flex items-center gap-2 min-w-0">
          <span data-test="job-strip-name" className="text-[13px] sm:text-sm font-semibold text-white truncate min-w-0 max-w-[48%] sm:max-w-[40%]"
            title={jobStrip.name}>
            {jobStrip.name}
          </span>
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto ag-noscroll">
            {jobStrip.facts.map(fact => (
              <span key={fact} className="ag-chip h-6 px-2 text-[11px] shrink-0 whitespace-nowrap">{fact}</span>
            ))}
          </div>
          {assignment?.uniqueId && (
            <span className="ag-mono text-[10px] ag-muted shrink-0 ml-auto hidden sm:block">{assignment.uniqueId}</span>
          )}
        </div>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto relative">
        {/* ambient brand glows */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />
        </div>
        <main className="relative max-w-[1520px] mx-auto px-3 sm:px-6 lg:px-10 py-6 sm:py-10">

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-[18px] lg:gap-6 items-start">

            {/* LEFT: INPUTS — one section open at a time */}
            <div className="lg:col-span-4 space-y-[18px]">
              {/* 1 · Assets & Files */}
              <section className={cn("ag-sec", leftPanel === 'assets' && "ag-sec--open")}>
                <button type="button" data-test="section-assets"
                  onClick={() => setLeftPanel(leftPanel === 'assets' ? null : 'assets')}
                  aria-expanded={leftPanel === 'assets'}
                  className="ag-sec__head">
                  <span className="ag-ico"><ImageIcon className="w-5 h-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="ag-h2 block text-[17px] text-white">1. Assets &amp; Files</span>
                    <span className="ag-muted block text-[12px] mt-0.5 truncate">Upload your business material (max 2 images per section)</span>
                  </span>
                  <ChevronDown className={cn("w-4 h-4 shrink-0 ag-acc__chev", leftPanel === 'assets' && "rotate-180")} />
                </button>

                {/* Shut, the panel still says what has been given to the run — and each tile opens it. */}
                {leftPanel !== 'assets' && (
                  <div className="grid grid-cols-3 gap-2.5 px-5 pb-5">
                    {assetTiles.map(tile => (
                      <button key={tile.label} type="button" onClick={() => setLeftPanel('assets')}
                        className="ag-tile-up">
                        <tile.icon className={cn("w-[18px] h-[18px]", tile.count > 0 ? "text-emerald-300" : "text-slate-400")} />
                        <span className="text-[11px] font-semibold text-slate-200 leading-tight">{tile.label}</span>
                        <span className={cn("text-[10px]", tile.count > 0 ? "text-emerald-300" : "ag-muted")}>
                          {tile.count > 0 ? `${tile.count} added` : tile.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className={cn("ag-morph", leftPanel === 'assets' && "ag-morph--open")}>
                <div><div className="ag-sec__body">
                <div className="space-y-4">
                  {/* A Real Owner Face ad is built from ONE photo — the owner's face. It gets its own
                      box, first and unmissable, because on every other ad a client photo means a
                      LOCATION and here it means the identity. */}
                  {creationMode === 'video' && activePack?.usesClientFace && (
                    <div data-test="owner-image-slot">
                      <FileUpload
                        label="Upload Owner Image"
                        emphasis="owner"
                        accept="image/png, image/jpeg, image/webp"
                        required
                        value={files.ownerImage || null}
                        onChange={(f) => setFiles(prev => ({ ...prev, ownerImage: (f as File) || null }))}
                        helperText="One clear, front-facing, well-lit photo of the owner's face — this exact face appears in every clip"
                      />
                    </div>
                  )}
                  {!formData.noLogo && (
                    <FileUpload label="Business Logo" accept="image/png, image/jpeg" required value={files.logo} onChange={(f) => setFiles(prev => ({ ...prev, logo: f as File }))} helperText="High resolution PNG/JPG" />
                  )}
                  {/* #5 — No-logo option: use business name as a physical name board behind the model */}
                  <div className={cn("rounded-lg border p-3", isDark ? "border-white/[0.14] bg-white/[0.04]" : "border-slate-200 bg-slate-50")}>
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
                          isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 placeholder-slate-500 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 placeholder-slate-400 focus:ring-blue-200"
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
                    <div key={key} className={cn("border rounded-lg overflow-hidden", isDark ? "border-white/[0.14]" : "border-slate-200")}>
                      <button onClick={() => toggleSection(key)}
                        className={cn("w-full flex items-center justify-between px-3 py-2 text-sm font-semibold transition-colors",
                          isDark ? "bg-white/[0.08] text-slate-300 hover:bg-slate-600" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
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

                  {/*
                    Two boxes, because the two kinds of instruction go to two different places.

                    BUSINESS CONTENT is what the ad SAYS — facts, offers, the call to action, the
                    numbers. FRAME / BACKGROUND INSTRUCTIONS is how the frames LOOK — the scene, the
                    style, the light. One box for both meant a sentence about a gold backdrop was read
                    as a business fact and a sentence about an offer was read as set dressing. Each box
                    now feeds its own stage (the script / the scene plan and every frame prompt).
                  */}
                  <div>
                    <label className={cn("block text-sm font-semibold mb-1", isDark ? "text-slate-300" : "text-slate-700")}>
                      [ BUSINESS CONTENT ]
                    </label>
                    <p className={cn("text-[11px] mb-2", isDark ? "text-slate-500" : "text-slate-500")}>Business details, text, offers, CTA, contact info — what the ad must say.</p>
                    <textarea data-test="business-content" className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                        isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 placeholder-slate-500 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                      )} rows={4} placeholder="e.g. Sri Sai Bakery, Kakinada — fresh cakes daily, custom birthday cakes, free home delivery above ₹500. Call / WhatsApp 98xxxxxxx."
                      value={formData.textInstructions} onChange={(e) => setFormData(prev => ({ ...prev, textInstructions: e.target.value }))} />
                  </div>
                  <div>
                    <label className={cn("block text-sm font-semibold mb-1", isDark ? "text-slate-300" : "text-slate-700")}>
                      [ FRAME / BACKGROUND INSTRUCTIONS ]
                    </label>
                    <p className={cn("text-[11px] mb-2", isDark ? "text-slate-500" : "text-slate-500")}>
                      Describe the frame, background, style, lighting, colours and scene. Leave it empty and the scenes are worked out from the visiting card, the business content and the script.
                    </p>
                    <textarea data-test="frame-instructions" className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                        isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 placeholder-slate-500 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                      )} rows={3} placeholder="e.g. Temple courtyard with devotees being served food on banana leaves, warm morning light, marigold decorations, saffron and gold colours."
                      value={formData.frameInstructions || ''} onChange={(e) => setFormData(prev => ({ ...prev, frameInstructions: e.target.value }))} />
                  </div>
                  {/* Documents are never uploaded — Gemini reads them and the text goes in the box above. */}
                  <div data-test="document-guidance" className={cn("rounded-xl border-2 px-3.5 py-3 text-xs leading-relaxed",
                    isDark ? "border-amber-500/60 bg-amber-950/30 text-amber-100" : "border-amber-400 bg-amber-50 text-amber-900")}>
                    <p className="font-bold uppercase tracking-wide text-[11px] mb-1">📄 Client sent a PDF or any document?</p>
                    <p>
                      Do <b>not</b> upload it here — files like PDFs, Word, Excel and text documents are not accepted.
                      {' '}{DOCUMENT_ROUTE_HINT}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <a href={GEMINI_URL} target="_blank" rel="noopener noreferrer"
                        className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold",
                          isDark ? "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30" : "bg-amber-200/70 text-amber-900 hover:bg-amber-200")}>
                        Open Gemini <ExternalLink className="w-3 h-3" />
                      </a>
                      <button type="button" data-test="copy-extraction-prompt"
                        onClick={() => {
                          void navigator.clipboard.writeText(DOCUMENT_EXTRACTION_PROMPT);
                          toast({ title: 'Extraction prompt copied', description: 'Paste it into Gemini with the client’s PDF attached, then paste Gemini’s answer into BUSINESS CONTENT.' });
                        }}
                        className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold border",
                          isDark ? "border-amber-500/50 text-amber-200 hover:bg-amber-500/10" : "border-amber-400 text-amber-900 hover:bg-amber-100")}>
                        <Copy className="w-3 h-3" /> Copy extraction prompt
                      </button>
                    </div>
                  </div>
                </div>
                </div></div>
                </div>
              </section>

              {/* 2 · Configuration */}
              <section className={cn("ag-sec", leftPanel === 'config' && "ag-sec--open")}>
                <button type="button" data-test="section-configuration"
                  onClick={() => setLeftPanel(leftPanel === 'config' ? null : 'config')}
                  aria-expanded={leftPanel === 'config'}
                  className="ag-sec__head">
                  <span className="ag-ico"><Settings2 className="w-5 h-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="ag-h2 block text-[17px] text-white">2. Configuration</span>
                    <span className="ag-muted block text-[12px] mt-0.5 truncate">{configSummary}</span>
                  </span>
                  <ChevronDown className={cn("w-4 h-4 shrink-0 ag-acc__chev", leftPanel === 'config' && "rotate-180")} />
                </button>
                <div className={cn("ag-morph", leftPanel === 'config' && "ag-morph--open")}>
                <div><div className="ag-sec__body">
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
                              : (isDark ? "border-white/10 hover:border-white/[0.14] text-slate-400 bg-white/[0.03]" : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white")
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
                    <div className={cn("rounded-xl border p-3 sm:p-4", isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50/60")}>
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
                              isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200")}
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
                              isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200")}
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
                        isDark ? "bg-white/[0.06] border-white/[0.14] text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
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
                              : (isDark ? "border-white/[0.14] hover:border-violet-400/60 text-slate-400" : "border-slate-200 hover:border-slate-300 text-slate-600")
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
                        isDark ? "bg-white/[0.06] border-white/[0.14] text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                        <span className="font-semibold">{formData.language}</span>
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Fixed by assignment</span>
                      </div>
                    ) : (
                    <div className="relative">
                      <button type="button" onClick={() => { setLanguageOpen(o => !o); setLanguageSearch(''); }}
                        className={cn("w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm outline-none",
                          isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200" : "bg-white border-slate-300 text-slate-700"
                        )}>
                        <span>{formData.language}</span>
                        <ChevronDown className={cn("w-4 h-4 transition-transform", languageOpen && "rotate-180")} />
                      </button>
                      {languageOpen && (
                        <div className={cn("absolute z-30 mt-1 w-full rounded-lg border shadow-lg overflow-hidden",
                          isDark ? "bg-[#0B1020] border-white/[0.14]" : "bg-white border-slate-200")}>
                          <input autoFocus value={languageSearch} onChange={(e) => setLanguageSearch(e.target.value)}
                            placeholder="Search language..."
                            className={cn("w-full px-3 py-2 text-sm border-b outline-none",
                              isDark ? "bg-[#0B1020] border-white/[0.14] text-slate-200 placeholder-slate-500" : "bg-white border-slate-200 text-slate-700 placeholder-slate-400")} />
                          <div className="max-h-48 overflow-y-auto">
                            {LANGUAGE_OPTIONS.filter(l => l.toLowerCase().includes(languageSearch.toLowerCase())).map(l => (
                              <button key={l} type="button"
                                onClick={() => { setFormData(prev => ({ ...prev, language: l })); setLanguageOpen(false); setLanguageSearch(''); }}
                                className={cn("w-full text-left px-3 py-2 text-sm transition-colors",
                                  formData.language === l
                                    ? (isDark ? "bg-purple-900/30 text-purple-300" : "bg-purple-50 text-purple-700")
                                    : (isDark ? "text-slate-300 hover:bg-white/[0.08]" : "text-slate-700 hover:bg-slate-100"))}>
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
                        isDark ? "bg-white/[0.06] border-white/[0.14] text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                        <span className="font-semibold">{formData.adType === AdType.FESTIVAL ? "Festival Wishes" : "Commercial"}</span>
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Fixed by assignment</span>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setFormData(prev => ({ ...prev, adType: AdType.COMMERCIAL }))}
                        className={cn("px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                          formData.adType === AdType.COMMERCIAL
                            ? (isDark ? "border-blue-500 bg-blue-900/30 text-blue-400" : "border-blue-500 bg-blue-50 text-blue-700")
                            : (isDark ? "border-white/[0.14] hover:border-violet-400/60 text-slate-400" : "border-slate-200 hover:border-slate-300 text-slate-600")
                        )}>Commercial</button>
                      <button onClick={() => setFormData(prev => ({ ...prev, adType: AdType.FESTIVAL }))}
                        className={cn("px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                          formData.adType === AdType.FESTIVAL
                            ? (isDark ? "border-purple-500 bg-purple-900/30 text-purple-400" : "border-purple-500 bg-purple-50 text-purple-700")
                            : (isDark ? "border-white/[0.14] hover:border-violet-400/60 text-slate-400" : "border-slate-200 hover:border-slate-300 text-slate-600")
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
                        isDark ? "bg-white/[0.06] border-white/[0.14] text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
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
                        isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 focus:ring-amber-800" : "bg-white border-slate-300 text-slate-700 focus:ring-amber-200")}
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
                        {activePack.usesClientFace && (
                          <p className={cn("mt-1.5 text-[11px] font-semibold", isDark ? "text-amber-300" : "text-amber-800")}>
                            ↑ Upload the owner's face photo in UPLOAD OWNER IMAGE (Assets &amp; Files) — it is required.
                          </p>
                        )}
                      </div>
                    )}
                    {/* The custom entry is built from this description — see characterPacks.withCustomCharacter. */}
                    {isCustomPack(activePack) && (
                      <div className="mt-3">
                        <label className={cn("block text-sm font-semibold mb-1.5", isDark ? "text-slate-300" : "text-slate-700")}>
                          Describe the character <span className="text-red-500">*</span>
                        </label>
                        {characterLocked ? (
                          <div className={cn("flex items-start justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm",
                            isDark ? "bg-white/[0.06] border-white/[0.14] text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                            <span>{formData.customCharacter}</span>
                            <span className={cn("shrink-0 text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Sold as this</span>
                          </div>
                        ) : (
                          <textarea
                            data-test="platform-custom-character"
                            rows={3}
                            value={formData.customCharacter || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, customCharacter: e.target.value }))}
                            placeholder="Who or what is the character? e.g. Lord Hanuman carrying a sack of our rice; a cheerful talking mango in a chef's cap"
                            className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none resize-y",
                              isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 placeholder-slate-500 focus:ring-amber-800" : "bg-white border-slate-300 text-slate-700 focus:ring-amber-200")}
                          />
                        )}
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
                        isDark ? "bg-white/[0.06] border-white/[0.14] text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
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
                                : (isDark ? "border-white/[0.14] text-slate-400 hover:border-violet-400/60" : "border-slate-300 text-slate-600 hover:border-slate-400"))}>
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
                          isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 focus:ring-purple-800" : "bg-white border-slate-300 text-slate-700 focus:ring-purple-200"
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
                              ? "bg-white/[0.08] border-white/[0.14] text-slate-200 placeholder-slate-500 focus:ring-purple-800"
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
                          isDark ? "bg-white/[0.06] border-white/[0.14] text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
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
                                : (isDark ? "border-white/[0.14] text-slate-400" : "border-slate-200 text-slate-600")
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
                      <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>
                        Model Attire{activePack ? <span className="ml-1 font-normal text-xs opacity-70">({castLabelFor(formData.characterPack)})</span> : null}
                      </label>
                      {attireLocked ? (
                        <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm",
                          isDark ? "bg-white/[0.06] border-white/[0.14] text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                          <span className="font-semibold truncate">{formData.attireType === AttireType.CUSTOM && formData.customAttire ? formData.customAttire : ATTIRE_LABELS[formData.attireType]}</span>
                          <span className={cn("shrink-0 ml-2 text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>🔒 Fixed</span>
                        </div>
                      ) : (
                      <>
                      <select className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                          isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                        )} value={formData.attireType} onChange={(e) => setFormData(prev => ({ ...prev, attireType: e.target.value as AttireType }))}>
                        {attireOptionsFor(formData.characterPack, (packModelGender(activePack) as ModelGender | null) || formData.gender || ModelGender.FEMALE).map((a) => (
                          <option key={a} value={a}>{ATTIRE_LABELS[a]}</option>
                        ))}
                      </select>
                      {formData.attireType === AttireType.CUSTOM && (
                        <textarea
                          className={cn("w-full mt-2 border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none resize-y",
                            isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
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
                          isDark ? "bg-white/[0.06] border-white/[0.14] text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
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
                              : (isDark ? "border-white/[0.14] text-slate-400" : "border-slate-200 text-slate-600")
                          )}>Preset</button>
                        <button onClick={() => setFormData(prev => ({ ...prev, durationMode: 'custom', duration: 24 }))}
                          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                            formData.durationMode === 'custom' ? (isDark ? "border-violet-500 bg-violet-900/30 text-violet-400" : "border-violet-500 bg-violet-50 text-violet-700")
                              : (isDark ? "border-white/[0.14] text-slate-400" : "border-slate-200 text-slate-600")
                          )}>Custom</button>
                      </div>
                      {formData.durationMode === 'preset' ? (
                        <select className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                            isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
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
                              isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 focus:ring-violet-800" : "bg-white border-slate-300 text-slate-700 focus:ring-violet-200"
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
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold">
                                {activePack && activePack.characters.length > 1
                                  ? 'Required format — each clip, then who says each line:'
                                  : activePack
                                    ? `Required format — each clip, spoken by ${activePack.characters[0].name}:`
                                    : 'Required format — one clip per line:'}
                              </span>
                              {/* The script is written in ChatGPT or Gemini — the format has to travel there. */}
                              <button type="button" data-test="copy-script-format"
                                onClick={() => {
                                  void navigator.clipboard.writeText(customScriptTemplate);
                                  toast({ title: 'Format copied', description: 'Paste it where you are writing the script, then paste the finished script back here.' });
                                }}
                                className="ag-btn ag-btn--secondary ag-btn--sm h-7 px-2 text-[11px] shrink-0">
                                <Copy className="w-3 h-3" /> Copy format
                              </button>
                            </div>
                            <pre
                              data-test={activePack && activePack.characters.length > 1 ? 'custom-script-duo-format' : 'custom-script-format'}
                              className="mt-1 font-mono text-[11px] whitespace-pre-wrap">{customScriptTemplate}</pre>
                            <span>
                              {activePack && activePack.characters.length > 1
                                ? <>Your script is used <b>word-for-word</b>, and each person says only their own lines. Without the speaker labels the ad cannot be made, so it will ask you for them.</>
                                : activePack
                                  ? <>Your script is used <b>word-for-word</b>. The <b>[{activePack.characters[0].name}]</b> label is optional on a single-character ad — plain clip lines work too — and its clip count sets the ad length.</>
                                  : <>Your script is used <b>word-for-word</b> in the Voice Over Script and Veo 3 prompts, and its clip count sets the ad length. Unlabelled text is only cut into clips at sentence ends; no word is changed.</>}
                            </span>
                          </div>
                          <textarea
                            className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                              isDark ? "bg-white/[0.08] border-white/[0.14] text-slate-200 placeholder-slate-500 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
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
                                      No clip labels found — this text will be cut into clips at sentence ends, word for word.
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

                </div>
                </div></div>
                </div>
              </section>

              {/*
                The one action, in the one place — below both sections, whichever is open. Stop stays
                beside it while a run is going: it is the only way to call a run off.
              */}
              <div className="flex gap-2.5">
                <button onClick={handleGenerate} disabled={status.isProcessing || (!!assignment && assignmentBrief.loading)}
                  className="ag-btn ag-btn--primary ag-btn--lg flex-1 h-[56px] text-[15px]">
                  {status.isProcessing || (assignment && assignmentBrief.loading)
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Rocket className="w-5 h-5" />}
                  <span>
                    {status.isProcessing ? 'Processing...'
                      : assignment && assignmentBrief.loading ? 'Loading the brief…'
                      : creationMode === 'poster' ? 'Generate Poster Concepts' : 'Start Generation'}
                  </span>
                </button>
                {status.isProcessing && (
                  <button onClick={handleStopGeneration} className="ag-btn ag-btn--danger ag-btn--lg h-[56px]">
                    <StopCircle className="w-5 h-5" /><span>Stop</span>
                  </button>
                )}
              </div>
              {status.error && (
                <div className="ag-chip ag-badge--bad w-full h-auto justify-start rounded-2xl px-4 py-3 text-left text-[13px] leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0" /><span>{status.error}</span>
                </div>
              )}

              {/* What a good brief looks like — read once, then ignored; it never blocks the form. */}
              {!outputs && !status.isProcessing && (
                <div className="ag-sec flex items-start gap-3 p-4">
                  <span className="ag-row__num ag-row__num--quiet shrink-0"><Sparkles className="w-4 h-4 text-amber-300" /></span>
                  <p className="text-[12px] leading-relaxed">
                    <span className="block font-semibold text-slate-200 mb-0.5">Tip</span>
                    <span className="ag-muted">Better assets = better ad kit. Upload clear, high-quality images and write the business details in full.</span>
                  </p>
                </div>
              )}
            </div>

            {/* RIGHT: OUTPUTS */}
            <div className="lg:col-span-8" ref={outputPanelRef}>
              {(status.isProcessing || status.step || outputs) && (
                <div className={cn("ag-card mb-3", status.isProcessing || !outputs ? "px-4 py-3.5 sm:px-5 sm:py-4" : "px-3.5 py-2 sm:px-4")}>
                  <div className="flex items-center gap-3">
                    <span className={cn("ag-ico ag-ico--sm", !status.isProcessing && outputs && "ag-btn--ok w-8 h-8 flex-[0_0_32px] rounded-[10px]")}>
                      {status.isProcessing
                        ? <Loader2 className="w-[18px] h-[18px] animate-spin" />
                        : outputs ? <Check className="w-4 h-4" strokeWidth={3} /> : <Wand2 className="w-[18px] h-[18px]" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* Finished, the title and the sentence share one line — there is nothing to watch. */}
                      {!status.isProcessing && outputs ? (
                        <p className="flex items-baseline gap-2 min-w-0">
                          <span className="ag-h2 text-[14px] text-white shrink-0">Generation Status</span>
                          <span className="ag-muted text-[12px] truncate">Your ad kit has been successfully generated.</span>
                        </p>
                      ) : (
                        <>
                          <h2 className="ag-h2 text-[16px] sm:text-[17px] text-white leading-tight">Generation Status</h2>
                          {/* One line, not two: while it runs, the stage IS the status. */}
                          <p className={cn("text-[12px] mt-0.5 truncate flex items-center gap-1.5",
                            status.isProcessing ? "text-violet-200" : "ag-muted")}>
                            {status.isProcessing && <Wand2 className="w-3 h-3 animate-pulse shrink-0" />}
                            {status.isProcessing ? (status.step || 'Preparing your ad kit…') : status.step}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="hidden sm:flex items-center gap-2.5 shrink-0">
                      {/* The workspace leaves at the first asset, but the run goes on — so the countdown stays here. */}
                      {status.isProcessing && activeRun && !showMission && (
                        <RunCountdown run={activeRun} active isDark={isDark} variant="inline" />
                      )}
                      {!status.isProcessing && outputs && (
                        <span className="ag-chip ag-badge--ok h-6 px-2.5 text-[11px]"><Check className="w-3 h-3" />Completed</span>
                      )}
                      <span className={cn("ag-num text-white leading-none", !status.isProcessing && outputs ? "text-[15px]" : "text-[20px]")}>
                        {Math.round(status.progress)}%
                      </span>
                    </div>
                  </div>

                  {/* At 100% the bar says nothing the ticks do not — so it goes. */}
                  {status.progress < 100 && (
                    <div className="ag-progress mt-3">
                      <div className="ag-progress__fill" style={{ width: `${status.progress}%` }} />
                    </div>
                  )}

                  {/* The same five milestones the guide talks in, read from the same missionStages().
                      Only while there is something to watch — finished, they are five identical ticks. */}
                  {(status.isProcessing || !outputs) && (
                    <div className="mt-3">
                      <MissionStepper
                        profile={activeRun?.profile ?? currentRunProfile()}
                        checkpoints={activeRun?.checkpoints ?? (outputs ? [{ percent: 100, at: Date.now() }] : [])}
                      />
                    </div>
                  )}
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
                  className="space-y-3"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: reduceMotion ? 0.2 : 0.45, ease: [0.22, 1, 0.36, 1] } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                >
                  {/*
                    The guide does not leave when the first asset lands — it folds into one strip and
                    stays put, so the steps are still one click away while the member works down the
                    deliverables. It pulses while the run is still going.
                  */}
                  <div className={cn("ag-bar", status.isProcessing && "border-violet-500/40")}>
                    <button type="button" onClick={() => setGuideOpen(true)} data-test="ai-guide-button"
                      className="ag-btn ag-btn--secondary ag-btn--sm h-8 px-2.5 text-[12px] relative shrink-0">
                      {status.isProcessing && !reduceMotion && (
                        <span aria-hidden className="absolute inset-0 rounded-[11px] ring-2 ring-violet-400/50 animate-ping" />
                      )}
                      <Sparkles className="w-3.5 h-3.5" />AI Guide
                    </button>
                    <a href={creationMode === 'poster' ? GEMINI_URL : CHATGPT_URL} target="_blank" rel="noopener noreferrer"
                      className="ag-btn ag-btn--secondary ag-btn--sm h-8 px-2.5 text-[12px] hidden sm:inline-flex shrink-0">
                      {creationMode === 'poster' ? 'Gemini' : 'ChatGPT'} <ExternalLink className="w-3 h-3 opacity-70" />
                    </a>
                    {creationMode === 'video' && (
                      <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer"
                        className="ag-btn ag-btn--primary ag-btn--sm h-8 px-2.5 text-[12px] shrink-0">
                        <Video className="w-3.5 h-3.5" />Video platform <ExternalLink className="w-3 h-3 opacity-70" />
                      </a>
                    )}
                    {/* What the run heard and planned — one button here, its detail below the band. */}
                    {creationMode === 'video' && (outputs.voiceBrief || outputs.sceneContext) && (
                      <button type="button" data-test="run-understanding-toggle"
                        onClick={() => toggleOutputSection('brief')}
                        aria-label={collapsedOutputs.brief ? 'Collapse what we understood' : 'Expand what we understood'}
                        className={cn("ag-btn ag-btn--sm h-8 px-2.5 text-[12px] shrink-0",
                          collapsedOutputs.brief ? "ag-btn--primary" : "ag-btn--secondary")}>
                        <Wand2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">What we understood</span><span className="sm:hidden">Brief</span>
                        <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", collapsedOutputs.brief && "rotate-180")} />
                      </button>
                    )}
                    <span className="ag-muted text-[11px] ml-auto hidden lg:block truncate">
                      {status.isProcessing ? 'The kit is still being written — the steps are in the guide.' : 'Copy each prompt into the platform it belongs to.'}
                    </span>
                  </div>

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
                    <p className={cn("rounded-xl border px-4 py-3 text-sm", isDark ? "border-white/10 text-slate-400" : "border-slate-200 text-slate-500")}>
                      This saved work has no poster concepts yet — press <b>Generate Poster Concepts</b> to write them.
                    </p>
                  )}

                  {/* Opened from the band above; it is a reference, so it is never in the way. */}
                  {creationMode === 'video' && (outputs.voiceBrief || outputs.sceneContext) && collapsedOutputs.brief && (
                    <div data-test="run-understanding" className="ag-row flex-col items-stretch !p-0 px-4 sm:px-5 py-3 space-y-3 text-sm text-slate-300">
                      {outputs.voiceBrief && (
                        <div data-test="voice-brief">
                          <p className={cn("text-xs font-bold uppercase tracking-wide mb-1", isDark ? "text-violet-300" : "text-violet-700")}>Client voice note — what we understood</p>
                          {outputs.voiceBrief.summary && <p className="font-medium">{outputs.voiceBrief.summary}</p>}
                          {outputs.voiceBrief.requirements.length > 0 && (
                            <ul className="mt-1 list-disc pl-5 space-y-0.5 text-xs">
                              {outputs.voiceBrief.requirements.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                          )}
                          {outputs.voiceBrief.conflicts.length > 0 && (
                            <p className={cn("mt-1.5 text-xs rounded-md px-2 py-1", isDark ? "bg-amber-900/30 text-amber-200" : "bg-amber-50 text-amber-800")}>
                              ⚠ Differs from the typed content: {outputs.voiceBrief.conflicts.join(' · ')}
                            </p>
                          )}
                          {outputs.voiceBrief.transcript && (
                            <details className="mt-1.5 text-xs">
                              <summary className="cursor-pointer select-none">Word-for-word transcript</summary>
                              <p className="mt-1 whitespace-pre-wrap break-words">{outputs.voiceBrief.transcript}</p>
                            </details>
                          )}
                        </div>
                      )}
                      {outputs.sceneContext && (
                        <div data-test="scene-plan">
                          <p className={cn("text-xs font-bold uppercase tracking-wide mb-1", isDark ? "text-teal-300" : "text-teal-700")}>Background plan — one per clip</p>
                          <p className="text-xs"><b>About:</b> {outputs.sceneContext.motive}{outputs.sceneContext.setting ? <> · <b>Set in:</b> {outputs.sceneContext.setting}</> : null}</p>
                          <ol className="mt-1 list-decimal pl-5 space-y-0.5 text-xs">
                            {outputs.sceneContext.clips.map(c => <li key={c.clip} className="break-words">{c.background}</li>)}
                          </ol>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Video outputs — one card, one row per deliverable, in the order they are used */}
                  <div className="ag-card p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3 mb-4 px-1">
                    <h2 className="ag-h2 text-[20px] sm:text-[22px] text-white">
                      Deliverables
                      {viewingSavedItem && <span className="ml-2 text-sm font-normal ag-muted">(viewing saved)</span>}
                    </h2>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setShowSavedItems(true)} className="ag-btn ag-btn--secondary ag-btn--sm">
                        <Clock className="w-4 h-4" /><span className="hidden sm:inline">View History</span>
                      </button>
                      <button onClick={handleSave} disabled={isSaving || saveSuccess}
                        className={cn("ag-btn ag-btn--sm", saveSuccess ? "ag-btn--ok" : "ag-btn--secondary")}>
                        {saveSuccess ? <><Check className="w-4 h-4" /><span>Saved!</span></> : isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving...</span></> : <><Save className="w-4 h-4" /><span>Save</span></>}
                      </button>
                    </div>
                  </div>
                  {/* The job changed after this kit was made — say exactly what, so nobody delivers the old spec. */}
                  {staleChanges.length > 0 && (
                    <div data-test="stale-kit" role="status"
                      className="mb-3 rounded-[14px] border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" />
                      <div className="min-w-0 flex-1 text-[13px] text-amber-100">
                        <p className="font-semibold">This kit was made for an earlier version of the job.</p>
                        <p className="text-[12px] text-amber-200/90 mt-0.5 break-words">
                          {staleChanges.map(c => `${c.label}: ${c.from} → ${c.to}`).join(' · ')}
                        </p>
                      </div>
                      <button type="button" onClick={handleGenerate} disabled={status.isProcessing}
                        className="ag-btn ag-btn--primary ag-btn--sm shrink-0">
                        <Rocket className="w-3.5 h-3.5" />Generate again
                      </button>
                    </div>
                  )}
                  <div className="space-y-2.5">
                  {creationMode === 'video' && outputs.mainFramePrompts?.length > 0 && (
                      <OutputSection title={`1. Main Frame Prompts (${outputs.mainFramePrompts.length} Clips)`} sectionKey="mainFrame"
                        icon={ImageIcon} state={rowState('mainFrame', true)}
                        subtitle="One tab per clip, in order. Main Frame prompt 1 goes into tab 1, prompt 2 into tab 2, and so on."
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark}
                        quickCopyItems={outputs.mainFramePrompts.map(p => stripAttachmentDirective(p).body)}
                        quickCopyLabel="Tab " quickCopyAttachments={mainFrameAttachments}>
                        <GeneratedCard title="Main Frame" content={outputs.mainFramePrompts} variant="dropdown" sectionType="mainFrame"
                          attachments={mainFrameAttachments}
                          showRefinement={true} onRefine={(i) => handleRefineSection('mainFrame', i)} isRefining={refiningSection === 'mainFrame'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && !(outputs.mainFramePrompts?.length > 0) && (
                      <OutputSection title="1. Main Frame Prompts" sectionKey="mainFrame" icon={ImageIcon} empty
                        subtitle="One tab per clip, in order."
                        state={rowState('mainFrame', false)}
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection} isDark={isDark}
                        actions={!status.isProcessing ? (
                          <button type="button" onClick={handleGenerate} className="ag-btn ag-btn--secondary ag-btn--sm h-9"><Rocket className="w-3.5 h-3.5" />Generate again</button>
                        ) : undefined} />
                  )}

                  {creationMode === 'video' && outputs.headerPrompt && (
                      <OutputSection title="2. Video Bottom Label" sectionKey="header"
                        icon={TypeIcon} state={rowState('header', true)}
                        subtitle="Text for the bottom label to be added in the video."
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark} copyContent={outputs.headerPrompt}>
                        <GeneratedCard title="Video Bottom Label" content={outputs.headerPrompt} sectionType="header"
                          showRefinement={true} onRefine={(i) => handleRefineSection('header', i)} isRefining={refiningSection === 'header'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && !outputs.headerPrompt && (
                      <OutputSection title="2. Video Bottom Label" sectionKey="header" icon={TypeIcon} empty
                        subtitle="Text for the bottom label to be added in the video."
                        state={rowState('header', false)}
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection} isDark={isDark}
                        actions={!status.isProcessing ? (
                          <button type="button" onClick={handleRegenerateHeader} className="ag-btn ag-btn--secondary ag-btn--sm h-9"><Sparkles className="w-3.5 h-3.5" />Generate</button>
                        ) : undefined} />
                  )}

                  {creationMode === 'video' && outputs.posterPrompt && (
                      <OutputSection title="3. Poster Design" sectionKey="poster"
                        icon={PenTool} state={rowState('poster', true)}
                        subtitle="Poster design prompt for the promotional poster."
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark} copyContent={outputs.posterPrompt}>
                        <GeneratedCard title="Poster" content={outputs.posterPrompt} isJson sectionType="poster"
                          showRefinement={true} onRefine={(i) => handleRefineSection('poster', i)} isRefining={refiningSection === 'poster'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && !outputs.posterPrompt && (
                      <OutputSection title="3. Poster Design" sectionKey="poster" icon={PenTool} empty
                        subtitle="Poster design prompt for the promotional poster."
                        state={rowState('poster', false)}
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection} isDark={isDark}
                        actions={!status.isProcessing ? (
                          <button type="button" onClick={() => void handleRegeneratePoster()} disabled={sectionRegen.poster === 'run'} className="ag-btn ag-btn--secondary ag-btn--sm h-9">{sectionRegen.poster === 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}Generate</button>
                        ) : undefined} />
                  )}

                  {creationMode === 'video' && outputs.voiceOverScript && (() => {
                      const voiceClips = parseVoiceOverClips(cleanPromptForClipboard(outputs.voiceOverScript));
                      const hasClips = voiceClips.length > 0;
                      // Business-facing labels: `clip-1[0-8sec]`. The script is stored canonically
                      // as `0-8: …` (see utils/voiceOverFormat) and relabelled only here, so both
                      // the whole-script copy and the per-clip copies read the same way.
                      return (
                      <OutputSection title={`4. Voice Over Script (${formData.language || 'Telugu'})`} sectionKey="voiceOver"
                        icon={Mic} state={rowState('voiceOver', true)}
                        footer={
                          /* A script finished elsewhere — the client's, or corrected in ChatGPT / Gemini — goes in here. */
                          <FinalScriptInput
                            speakers={scriptSpeakers}
                            clipCount={kitClipCount()}
                            language={formData.language}
                            currentScript={outputs.voiceOverScript}
                            open={finalScriptOpen}
                            onToggle={() => setFinalScriptOpen(open => !open)}
                            progress={finalScriptProgress}
                            onApply={handleApplyFinalScript}
                            onRetry={handleRetryFinalScriptSection}
                          />
                        }
                        subtitle={`Complete voice-over script with timing for ${voiceClips.length || 'all'} clip${voiceClips.length === 1 ? '' : 's'}.`}
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
                        {outputs.scriptQa && !finalScriptProgress && (
                          <div data-test="script-qa" className="mx-4 mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-slate-300">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className={cn("font-bold uppercase tracking-wider text-[10px]", outputs.scriptQa.passed ? "text-emerald-300" : "text-amber-300")}>
                                Quality check {outputs.scriptQa.passed ? 'passed' : 'best draft'}
                              </span>
                              <span className="ag-num text-white">{outputs.scriptQa.score}/10</span>
                              <span className="ag-muted">· {outputs.scriptQa.drafts} draft{outputs.scriptQa.drafts === 1 ? '' : 's'} checked</span>
                              <span className="ag-muted">· {Object.entries(outputs.scriptQa.scores).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
                            </p>
                            {outputs.scriptQa.notes.length > 0 && (
                              <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-amber-100/90">
                                {outputs.scriptQa.notes.map(n => <li key={n}>{n}</li>)}
                              </ul>
                            )}
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

                  {creationMode === 'video' && !outputs.voiceOverScript && (
                      <OutputSection title="4. Voice Over Script" sectionKey="voiceOver" icon={Mic} empty
                        subtitle="Complete voice-over script with timing for every clip."
                        state={rowState('voiceOver', false)}
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection} isDark={isDark}
                        actions={!status.isProcessing ? (
                          <button type="button" onClick={handleGenerate} className="ag-btn ag-btn--secondary ag-btn--sm h-9"><Rocket className="w-3.5 h-3.5" />Generate again</button>
                        ) : undefined} />
                  )}

                  {creationMode === 'video' && outputs.veoPrompts?.length > 0 && (
                      <OutputSection title="5. Veo 3 Video Prompts" sectionKey="veo"
                        icon={Video}
                        state={veoGaps > 0 && sectionRegen.veo !== 'run' ? { tone: 'wait', label: `${veoGaps} missing` } : rowState('veo', true)}
                        actions={veoGaps > 0 && !status.isProcessing ? (
                          <button type="button" onClick={() => void handleRegenerateVeo()} disabled={sectionRegen.veo === 'run'} className="ag-btn ag-btn--secondary ag-btn--sm h-8 px-2.5 text-xs">
                            {sectionRegen.veo === 'run' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}Write missing
                          </button>
                        ) : undefined}
                        subtitle={`Cinematic video generation prompts for ${outputs.veoPrompts.length} clip${outputs.veoPrompts.length === 1 ? '' : 's'}.`}
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark} quickCopyItems={outputs.veoPrompts} quickCopyLabel="clip-" quickCopyNamespace="veo"
                        quickCopyRanges={outputs.veoPrompts.map((_, i) => `[${clipRange(i)}sec]`)}>
                        <GeneratedCard title="Veo" content={outputs.veoPrompts} variant="dropdown" sectionType="veo"
                          showRefinement={true} onRefine={(i) => handleRefineVeo(i)}
                          onRefineItem={(index, i) => handleRefineVeo(i, index)}
                          isRefining={refiningSection === 'veo'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && !(outputs.veoPrompts?.length > 0) && (
                      <OutputSection title="5. Veo 3 Video Prompts" sectionKey="veo" icon={Video} empty
                        subtitle="Cinematic video generation prompts for every clip."
                        state={rowState('veo', false)}
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection} isDark={isDark}
                        actions={!status.isProcessing ? (
                          <button type="button" onClick={() => void handleRegenerateVeo()} disabled={sectionRegen.veo === 'run' || !outputs.voiceOverScript} className="ag-btn ag-btn--secondary ag-btn--sm h-9">{sectionRegen.veo === 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}Generate</button>
                        ) : undefined} />
                  )}

                  {/* Stock Image Prompts */}
                  {creationMode === 'video' && (
                        <OutputSection title="6. Stock Image Prompts (B-Roll)" sectionKey="stock"
                          icon={Camera} state={rowState('stock', !!outputs.stockImagePrompts?.length)}
                          subtitle="Additional stock image prompts for editing B-roll and overlays."
                          collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                          isDark={isDark}
                          actions={
                            <>
                              <select value={stockImageTheme} onChange={(e) => setStockImageTheme(e.target.value)}
                                aria-label="Stock image theme"
                                className="text-xs font-medium h-9 px-2 rounded-xl border bg-white/[0.06] border-white/[0.14] text-slate-200">
                                <option value="indian">🇮🇳 Indian</option><option value="american">🇺🇸 American</option>
                                <option value="middle-eastern">🇦🇪 Middle Eastern</option><option value="european">🇪🇺 European</option>
                                <option value="east-asian">🇯🇵 East Asian</option><option value="african">🇿🇦 African</option><option value="universal">🌍 Universal</option>
                              </select>
                              <button onClick={() => void handleGenerateStockImages()} disabled={isGeneratingStock || !outputs.voiceOverScript}
                                className="ag-btn ag-btn--secondary ag-btn--sm h-9">
                                {isGeneratingStock
                                  ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Generating...</span></>
                                  : <><Sparkles className="w-3 h-3" /><span>{outputs.stockImagePrompts ? 'Regenerate' : 'Generate'}</span></>}
                              </button>
                            </>
                          }>
                          <div className="p-2">
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
                              <div key={idx} className={cn("rounded-lg border p-4 mb-3", isDark ? "bg-white/[0.05] border-white/[0.14]" : "bg-slate-50 border-slate-200")}>
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
                                {/* Where it goes, in one line: the clip, and the words to show the image between. */}
                                <div className={cn("mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2.5 py-1.5", isDark ? "bg-teal-900/20" : "bg-teal-50")}>
                                  <span className={cn("text-[11px] font-bold uppercase tracking-wide", isDark ? "text-teal-300" : "text-teal-700")}>
                                    {item.timing || `Clip ${item.clip || item.id || idx + 1}`}
                                  </span>
                                  {item.cue ? (
                                    <>
                                      <span className={cn("text-xs font-medium", isDark ? "text-teal-100" : "text-teal-900")}>{cueWords(item.cue)}</span>
                                      <span className={cn("text-[11px] tabular-nums", isDark ? "text-teal-400/80" : "text-teal-600")}>{cueRange(item.cue)}</span>
                                    </>
                                  ) : item.cueLabel ? (
                                    <span className={cn("text-xs font-medium", isDark ? "text-teal-100" : "text-teal-900")}>{item.cueLabel}</span>
                                  ) : null}
                                </div>
                                <p className={cn("text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-600")}>{item.prompt}</p>
                                {/* #10 — per-image refine */}
                                {stockRefineIdx === idx ? (
                                  <div className="mt-2 flex items-center gap-2">
                                    <input autoFocus value={stockRefineText} onChange={(e) => setStockRefineText(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') handleRefineStockImage(idx); }}
                                      placeholder="Describe the change for this image..."
                                      className={cn("flex-1 border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2",
                                        isDark ? "bg-[#0B1020] border-white/[0.14] text-slate-200 focus:ring-teal-800" : "bg-white border-slate-300 text-slate-700 focus:ring-teal-200")} />
                                    <button onClick={() => handleRefineStockImage(idx)} disabled={refiningStockIdx === idx || !stockRefineText.trim()}
                                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-1">
                                      {refiningStockIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Apply
                                    </button>
                                    <button onClick={() => { setStockRefineIdx(null); setStockRefineText(''); }}
                                      className={cn("text-xs px-2 py-1.5 rounded-lg", isDark ? "text-slate-400 hover:bg-white/[0.08]" : "text-slate-500 hover:bg-slate-100")}>Cancel</button>
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
                        </OutputSection>
                  )}

                  {/* 7. Overlay Text Image Generator — each overlay as a premium 3D transparent PNG prompt */}
                  {creationMode === 'video' && (
                    <div data-test="overlay-image-generator">
                      <OutputSection title="7. Overlay Text Image Generator" sectionKey="overlay"
                        icon={TypeIcon} state={rowState('overlay', !!outputs.overlayTexts)}
                        subtitle="Key text overlays as ready image prompts."
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark}
                        actions={
                          <button onClick={() => void handleGenerateOverlayTexts()} disabled={isGeneratingOverlay || !outputs.voiceOverScript}
                            className="ag-btn ag-btn--secondary ag-btn--sm h-9 shrink-0">
                            {isGeneratingOverlay
                              ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Generating...</span></>
                              : <><Sparkles className="w-3 h-3" /><span>{outputs.overlayTexts ? 'Regenerate' : 'Generate'}</span></>}
                          </button>
                        }>
                      <div className="p-2">
                        {overlayError && (
                          <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{overlayError}</span>
                          </div>
                        )}
                        {isGeneratingOverlay && (
                          <div className="flex items-center justify-center py-8 space-x-2">
                            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                            <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Designing the overlay images...</span>
                          </div>
                        )}
                        {outputs.overlayTexts && outputs.overlayTexts.length > 0 && (
                          Array.from(new Set(outputs.overlayTexts.map((o: any) => Number(o.clip) || 0))).sort((a: number, b: number) => a - b).map((clip: number) => (
                            <div key={clip} className="mb-3 last:mb-0">
                              {/* The clip only — the editor places it by the words, not by a timecode. */}
                              <p className={cn("text-[11px] font-semibold uppercase tracking-wide mb-1.5", isDark ? "text-slate-400" : "text-slate-500")}>
                                Clip {clip}
                              </p>
                              {outputs.overlayTexts!.map((o: any, idx: number) => ({ o, idx })).filter(({ o }) => (Number(o.clip) || 0) === clip).map(({ o, idx }) => (
                                <div key={idx} data-test="overlay-item" className={cn("rounded-lg border p-2.5 mb-1.5", isDark ? "bg-white/[0.05] border-white/[0.14]" : "bg-slate-50 border-slate-200")}>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <TypeIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                      <span className={cn("font-semibold text-sm truncate", isDark ? "text-slate-200" : "text-slate-700")}>{o.text}</span>
                                    </div>
                                    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full flex-shrink-0", isDark ? "bg-[#0B1020] text-amber-300 border border-amber-700/40" : "bg-amber-100 text-amber-700")}>
                                      <Music className="w-3 h-3" /> {o.soundEffect}
                                    </span>
                                  </div>
                                  {/* The words it comes in and goes out on — From → To. */}
                                  {(o.cue || o.cueLabel || o.fromWord) && (
                                    <p data-test="overlay-cue" className={cn("mt-1 pl-5 text-xs font-medium", isDark ? "text-amber-200" : "text-amber-800")}>
                                      {o.cue?.matched
                                        ? <>From “{o.cue.fromWord}” → To “{o.cue.toWord}”</>
                                        : o.fromWord && o.toWord ? <>From “{o.fromWord}” → To “{o.toWord}”</> : o.cue ? cueWords(o.cue) : o.cueLabel}
                                    </p>
                                  )}
                                  {o.imagePrompt ? (
                                    <div className={cn("mt-2 rounded-md border p-2", isDark ? "bg-white/[0.05] border-white/[0.14]" : "bg-white border-slate-200")}>
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className={cn("text-[10px] font-bold uppercase tracking-wide", isDark ? "text-slate-400" : "text-slate-500")}>Generated prompt · 3D transparent PNG</span>
                                        <button onClick={() => { navigator.clipboard.writeText(o.imagePrompt); setCopiedOverlayIdx(idx); setTimeout(() => setCopiedOverlayIdx(null), 2000); }}
                                          className={cn("flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors min-h-[24px]",
                                            copiedOverlayIdx === idx ? (isDark ? "text-green-400 bg-green-900/30" : "text-green-600 bg-green-50")
                                              : (isDark ? "text-slate-400 hover:text-amber-400" : "text-slate-500 hover:text-amber-600"))}>
                                          {copiedOverlayIdx === idx ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                          <span>{copiedOverlayIdx === idx ? 'Copied' : 'Copy'}</span>
                                        </button>
                                      </div>
                                      <p data-test="overlay-image-prompt" className={cn("text-xs leading-relaxed break-words", isDark ? "text-slate-300" : "text-slate-600")}>{o.imagePrompt}</p>
                                      {overlayRefineIdx === idx ? (
                                        <div className="mt-2 flex items-center gap-2">
                                          <input autoFocus value={overlayRefineText} onChange={(e) => setOverlayRefineText(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleRefineOverlayImage(idx); }}
                                            placeholder="e.g. make it silver with a blue glow"
                                            className={cn("flex-1 min-w-0 border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2",
                                              isDark ? "bg-[#0B1020] border-white/[0.14] text-slate-200 focus:ring-amber-800" : "bg-white border-slate-300 text-slate-700 focus:ring-amber-200")} />
                                          <button onClick={() => handleRefineOverlayImage(idx)} disabled={refiningOverlayIdx === idx || !overlayRefineText.trim()}
                                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1">
                                            {refiningOverlayIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Apply
                                          </button>
                                          <button onClick={() => { setOverlayRefineIdx(null); setOverlayRefineText(''); }}
                                            className={cn("text-xs px-2 py-1.5 rounded-lg", isDark ? "text-slate-400 hover:bg-white/[0.08]" : "text-slate-500 hover:bg-slate-100")}>Cancel</button>
                                        </div>
                                      ) : (
                                        <button data-test="overlay-refine" onClick={() => { setOverlayRefineIdx(idx); setOverlayRefineText(''); }}
                                          className={cn("mt-1.5 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors min-h-[24px]",
                                            isDark ? "text-amber-400 hover:bg-amber-900/30" : "text-amber-700 hover:bg-amber-50")}>
                                          <Wand2 className="w-3 h-3" /> Refine Prompt
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <p className={cn("mt-1.5 pl-5 text-[11px]", isDark ? "text-slate-500" : "text-slate-400")}>Made before the image generator — press Regenerate for its image prompt.</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))
                        )}
                        {outputs.overlayTexts && outputs.overlayTexts.length === 0 && (
                          <p className={cn("text-sm text-center py-4", isDark ? "text-slate-500" : "text-slate-400")}>No overlay texts needed for this script.</p>
                        )}
                      </div>
                      </OutputSection>
                    </div>
                  )}
                  </div>
                  </div>
                </motion.div>
              ) : showMission && activeRun ? (
                <motion.div key={`mission-${activeRun.id}`} {...missionMotion(reduceMotion)}>
                  <MissionWorkspace run={activeRun} done={missionDone} onToggle={toggleMission} isDark={isDark} />
                </motion.div>
              ) : !status.isProcessing ? (
                <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.25 } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                {/* Nothing has been generated yet, so this side is short while the form is long —
                    sticky keeps it beside the fields instead of stranded at the top. */}
                <div className="ag-card p-8 sm:p-12 text-center lg:sticky lg:top-2">
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
                      <div key={s.n} className={cn("rounded-xl border p-3.5", isDark ? "bg-white/[0.04] border-white/10" : "bg-slate-50 border-slate-200")}>
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
/** A deliverable row's own state — writing, updated, failed, missing — shown beside its name. */
type RowState = { tone: 'run' | 'ok' | 'bad' | 'wait'; label: string } | null;

const OutputSection: React.FC<{
  title: string; sectionKey: string; children?: React.ReactNode;
  /** Writing / Updated / Failed / Missing — every row says where it stands, instead of vanishing when empty. */
  state?: RowState;
  /** Nothing to open yet: the row shows its name, its state and its controls, and no chevron. */
  empty?: boolean;
  /**
   * Shown under the row's header whether the row is open or shut — for something a member must see
   * without opening the section (the "Input Final Script" strip on the voice-over).
   */
  footer?: React.ReactNode;
  /** What this deliverable is for, in one line — read far more often than the section is opened. */
  subtitle?: string;
  icon?: LucideIcon;
  /**
   * The section's own controls, shown in the row beside Copy — a theme picker, a Generate button.
   * Sections 6 and 7 had hand-built headers for exactly this; one row implementation instead.
   */
  actions?: React.ReactNode;
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
}> = ({ title, sectionKey, children, state, empty = false, footer, subtitle, icon: Icon = FileText, actions, collapsedOutputs, toggleOutputSection, isDark, copyContent, copyLabel, quickCopyItems, quickCopyLabel, quickCopyNamespace, quickCopyRanges, quickCopyAttachments }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!copyContent) return;
    const cleaned = cleanPromptForClipboard(copyContent);
    navigator.clipboard.writeText(cleaned);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  // The number is part of the deliverable's name ("4. Voice Over Script"); on screen it is the badge.
  const numbered = /^(\d+)\.\s*(.*)$/.exec(title);
  const [, ordinal, name] = numbered ?? [undefined, undefined, title];
  const open = !empty && !!collapsedOutputs[sectionKey];
  return (
    <div className={cn("ag-row flex-col items-stretch !p-0", open && "ag-row--open")}>
      <div className="relative w-full flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4 px-4 py-3 sm:px-5 min-h-[72px]">
        {ordinal && <span className="ag-row__num shrink-0">{ordinal}</span>}
        <span className="ag-tile shrink-0 w-10 h-10 flex-[0_0_40px]"><Icon className="w-[18px] h-[18px] text-violet-200" /></span>
        <div className="min-w-0 flex-1 basis-[min(100%,180px)]">
          <span className="flex items-center gap-2 min-w-0">
            <span className="ag-h2 text-[15px] sm:text-[16px] text-white text-left block truncate">{name}</span>
            {state && (
              <span data-test={`row-state-${sectionKey}`} className={cn('ag-state shrink-0', `ag-state--${state.tone}`)}>
                {state.tone === 'run' ? <Loader2 className="w-3 h-3 animate-spin" /> : state.tone === 'ok' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {state.label}
              </span>
            )}
          </span>
          {subtitle && <span className="ag-muted text-[12px] hidden sm:block truncate">{subtitle}</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end ml-auto">
          {actions}
          {quickCopyItems && quickCopyItems.length > 0 && (
            <QuickCopyActions prompts={quickCopyItems} isDark={isDark}
              labelPrefix={quickCopyLabel ?? 'F'} namespace={quickCopyNamespace ?? 'main-frame'}
              ranges={quickCopyRanges} attachments={quickCopyAttachments} />
          )}
          {copyContent && (
            <span
              onClick={handleCopy}
              className={cn("ag-btn ag-btn--sm h-8 px-2.5 text-xs", copied ? "ag-btn--ok" : "ag-btn--secondary")}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : (copyLabel ?? 'Copy')}</span>
            </span>
          )}
          {!empty && (
            <button
              type="button"
              onClick={() => toggleOutputSection(sectionKey)}
              className="ag-btn ag-btn--icon ag-btn--sm h-9 w-9"
              aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            >
              <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", open && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
      {footer}
      {open && <div className="px-2 pb-2 sm:px-3 sm:pb-3">{children}</div>}
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
