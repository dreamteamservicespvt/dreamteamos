import { GoogleGenAI } from "@google/genai";
import { AdFormData, FileStore, GeneratedOutputs, PosterConcept, type OverlayTextItem, type SceneContext, type VoiceBrief } from "@/types/aiPlatform";
import { 
  MAIN_FRAME_SYSTEM_PROMPT,
  MULTI_FRAME_SYSTEM_PROMPT,

  POSTER_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
  VOICEOVER_REPAIR_SYSTEM_PROMPT,
  SCRIPT_TO_VOICEOVER_SYSTEM_PROMPT,
  VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT,
  VEO_SEGMENT_SYSTEM_PROMPT,
  modelVeoSubject,
  STOCK_IMAGE_SYSTEM_PROMPT,
  OVERLAY_TEXT_SYSTEM_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
  detectBusinessType,
  detectEducationEnvironmentMode,
  getCommercialLocationPlanForBusiness,
  getEnvironmentForBusiness,
  getEnvironmentNegativeRules,
  getProfessionalSuitPaletteForBusiness,
  getRealisticLogoPlacementGuidance,
  getModelProfile,
  buildBrandMarkDirective,
  getBrandMark,
  getFestivalTheme,
  type BrandSurface
} from "./prompts";
import { SCENE_PLAN_SYSTEM_PROMPT, scenePlanUserPrompt } from "./prompts/scenePlan";
import { motionChoicesOf, parseScenePlan, repeatedBackgrounds, sceneLineFor, scenePlanBlock, withSceneBackground } from "@/utils/scenePlan";
import { elsewhereIssue } from "@/utils/speakingPosition";
import { VOICE_NOTE_SYSTEM_PROMPT, voiceNoteUserPrompt } from "./prompts/voiceNote";
import { parseVoiceBrief, voiceBriefAsText, voiceBriefForProfile } from "@/utils/voiceBrief";
import { audioMimeTypeOf } from "@/utils/fileHelpers";
import { sameWords, splitScriptVerbatim, verbatimScriptText } from "@/utils/customScript";
import { nameBoardInPlaceOfLogo, withOwnerImageDirective } from "@/utils/frameBrand";
import { parseClipPromptEdits, sameVeoPrompt, veoEditProblems } from "@/utils/veoRefine";
import { cleanOverlayDesign, overlayDesignOf, overlayImagePrompt } from "@/utils/overlayImage";
import { speakableLine, withoutFixedWords } from "@/utils/spokenNumbers";
import {
  CHARACTER_VOICEOVER_SYSTEM_PROMPT,
  CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT,
  CHARACTER_VOICEOVER_REFINE_SYSTEM_PROMPT,
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT,
  CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT,
  LOCATION_INDEX_SYSTEM_PROMPT,
  packPerformer,
  packVeoSubject,
  wardrobeDirective,
} from "./prompts/characterAd";
import {
  CORE_MESSAGE_SYSTEM_PROMPT, fallbackCoreMessageBrief, parseCoreMessageBrief, type CoreMessageBrief,
} from "./prompts/coreMessage";
import {
  dialogueHardWordIssues, hardWordIssues, isHardWordIssue, toSpokenEndings,
} from "./prompts/everydaySpeech";
import { WISH_AUDIENCE_TELUGU, wishAudienceIssues } from "./prompts/festivalWish";
import { clipPlacements, spokenOnly, withCues, withPlacements } from "@/utils/clipPlacement";
import { LOWER_THIRD_SYSTEM_PROMPT } from "./prompts/lowerThird";

/** Three numbers still read as pills at video size; a fourth does not. */
const MAX_LABEL_CONTACTS = 3;
/**
 * A number the client gave as their WhatsApp gets its own green pill on the label — a VERIFIED one.
 * It used to test the whole profile for the word, so a "whatsapp": "Not provided" key drew a pill.
 */
const hasWhatsAppNumber = (businessInfo: any): boolean => factsFromProfile(businessInfo).phones.some(p => p.whatsapp);
import {
  factsFromProfile, sanitizeBusinessProfile, stripUnverifiedNumbers, verifiedKeys, verifyBusinessFacts, type BusinessFacts,
} from "@/utils/businessFacts";
import { SCRIPT_QA_SYSTEM_PROMPT } from "./prompts/scriptQa";
import {
  isBetterDraft, parseScriptQa, qaDecision, qaInstructions, qaSummary, type ScriptQaReport, type ScriptQaSummary,
} from "@/utils/scriptQa";
import {
  assembleVeoPrompt, cameraLabel, fillCast, parseVeoDirections, planClipMotion, spokenLinesIn, stagingPath,
  withMotionComposition, type ClipMotionPlan, type VeoSpeech,
} from "./prompts/motion";
import {
  VEO_REFINE_PLAN_SYSTEM_PROMPT, VEO_REFINE_SYSTEM_PROMPT, VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT, VOICEOVER_REFINE_PLAN_SYSTEM_PROMPT,
} from "./prompts/refine";
import {
  changedClipIndexes, clipIndexesFromIssues, introducedIssues, isBetterRepair, issuesForClip, mergeClipEdits,
  numberedWords, parseClipDialogueEdits, parseClipTextEdits, parseRefinePlan, repairDirection, wordBandDistance,
} from "@/utils/voiceOverRefine";
import {
  getCharacterPack, packSpeakers, packNameSpellings, isHumanPack, packCastGender,
  withCustomCharacter, type CharacterPack,
} from "./characterPacks";
import {
  POSTER_CONCEPT_SYSTEM_PROMPT, POSTER_CONCEPT_USER_PROMPT, POSTER_CONCEPT_REFINE_SYSTEM_PROMPT,
} from "./prompts/posterConcept";
import { getPosterStyle, AUTO_POSTER_STYLE } from "./posterStyles";
import { DEFAULT_POSTER_SIZE } from "@/utils/posterSpec";
import { finalizePosterConcepts, normalizePosterConcept, parsePosterConcepts } from "@/utils/posterConcepts";
import {
  parseDialogueClips, validateDialogueClips, formatDialogueScript, applyNameSpellings,
  type DialogueClip, wordBudgetFor, countSpokenWords, MIN_WORDS_PER_CLIP, MAX_WORDS_PER_CLIP, TARGET_WORDS_PER_CLIP,
} from "@/utils/dialogueFormat";
import {
  assignPhotosToClips, describeClipLocations, attachmentDirective, parseLocationIndex, splitAttachmentDirective,
  type LocationPhoto,
} from "@/utils/locationAssignment";
import { MODEL_LOCATION_SUBJECT, clipLocationLabel, realLocationFormula } from "./prompts/realLocation";
import { resolvePlaceName } from "@/utils/businessPlace";
import { fileToBase64, readFileAsText } from "@/utils/fileHelpers";
import { CLIP_SECONDS, clipLabel, formatClipScript, parseLabeledClips } from "@/utils/voiceOverFormat";

// Multi-API Key Fallback System
// Checks both VITE_API_KEY_* and API_KEY_* (for Vercel deployments)
const API_KEYS: string[] = [
  import.meta.env.VITE_API_KEY_1 || import.meta.env.API_KEY_1 || '',
  import.meta.env.VITE_API_KEY_2 || import.meta.env.API_KEY_2 || '',
  import.meta.env.VITE_API_KEY_3 || import.meta.env.API_KEY_3 || '',
  import.meta.env.VITE_API_KEY_4 || import.meta.env.API_KEY_4 || '',
  import.meta.env.VITE_API_KEY_5 || import.meta.env.API_KEY_5 || '',
  import.meta.env.VITE_API_KEY_6 || import.meta.env.API_KEY_6 || '',
  import.meta.env.VITE_API_KEY_7 || import.meta.env.API_KEY_7 || '',
  import.meta.env.VITE_API_KEY_8 || import.meta.env.API_KEY_8 || '',
  import.meta.env.VITE_API_KEY_9 || import.meta.env.API_KEY_9 || '',
  import.meta.env.VITE_API_KEY_10 || import.meta.env.API_KEY_10 || '',
  import.meta.env.VITE_API_KEY_11 || import.meta.env.API_KEY_11 || '',
  import.meta.env.VITE_API_KEY_12 || import.meta.env.API_KEY_12 || '',
  import.meta.env.VITE_API_KEY_13 || import.meta.env.API_KEY_13 || '',
  import.meta.env.VITE_API_KEY_14 || import.meta.env.API_KEY_14 || '',
  import.meta.env.VITE_API_KEY_15 || import.meta.env.API_KEY_15 || '',
  import.meta.env.VITE_API_KEY_16 || import.meta.env.API_KEY_16 || '',
  import.meta.env.VITE_API_KEY_17 || import.meta.env.API_KEY_17 || '',
  import.meta.env.VITE_API_KEY_18 || import.meta.env.API_KEY_18 || '',
  import.meta.env.VITE_API_KEY_19 || import.meta.env.API_KEY_19 || '',
  import.meta.env.VITE_API_KEY_20 || import.meta.env.API_KEY_20 || '',
  import.meta.env.VITE_API_KEY_21 || import.meta.env.API_KEY_21 || '',
  import.meta.env.VITE_API_KEY_22 || import.meta.env.API_KEY_22 || '',
  import.meta.env.VITE_API_KEY_23 || import.meta.env.API_KEY_23 || '',
  import.meta.env.VITE_API_KEY_24 || import.meta.env.API_KEY_24 || '',
  import.meta.env.VITE_API_KEY_25 || import.meta.env.API_KEY_25 || '',
  import.meta.env.VITE_API_KEY_26 || import.meta.env.API_KEY_26 || '',
  import.meta.env.VITE_API_KEY_27 || import.meta.env.API_KEY_27 || '',
  import.meta.env.VITE_API_KEY_28 || import.meta.env.API_KEY_28 || '',
  import.meta.env.VITE_API_KEY_29 || import.meta.env.API_KEY_29 || '',
  import.meta.env.VITE_API_KEY_30 || import.meta.env.API_KEY_30 || '',
].filter(key => key.length > 0); // Remove empty keys

// DEBUG: Log how many keys were found (remove after verification)
console.log(`[API Key Debug] Total valid API keys loaded: ${API_KEYS.length}`);
if (API_KEYS.length > 0) {
  API_KEYS.forEach((k, i) => console.log(`  Key ${i + 1}: ${k.slice(0, 6)}...${k.slice(-4)}`));
} else {
  console.warn('[API Key Debug] NO API keys found! Check env var names in Vercel.');
  console.log('[API Key Debug] import.meta.env keys:', Object.keys(import.meta.env).filter(k => k.includes('KEY') || k.includes('API')));
}

// Fallback to single API_KEY if no numbered keys are set
if (API_KEYS.length === 0 && (import.meta.env.VITE_API_KEY || import.meta.env.API_KEY || import.meta.env.GEMINI_API_KEY)) {
  API_KEYS.push(import.meta.env.VITE_API_KEY || import.meta.env.API_KEY || import.meta.env.GEMINI_API_KEY);
}

// Track which API key is currently active
let currentKeyIndex = 0;

// Get the current API key
const getCurrentApiKey = (): string => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }
  return API_KEYS[currentKeyIndex];
};

// Rotate to next API key (called when current key fails)
const rotateToNextKey = (): boolean => {
  const nextIndex = (currentKeyIndex + 1) % API_KEYS.length;
  if (nextIndex === 0 && currentKeyIndex !== 0) {
    // We've cycled through all keys
    console.warn("All API keys have been tried. Starting over from the first key.");
  }
  currentKeyIndex = nextIndex;
  console.log(`Rotated to API key ${currentKeyIndex + 1} of ${API_KEYS.length}`);
  return true;
};

// Create a new AI instance with the current key
const getAiInstance = (): GoogleGenAI => {
  return new GoogleGenAI({ apiKey: getCurrentApiKey() });
};

// Multi-Model Fallback System
// Models listed in priority order — if one fails, the next is tried automatically.
// Models that return 404/not-found are permanently removed from the list for this session.
const MODEL_LIST: string[] = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite-preview',
];

// Track permanently dead models (404 / not found) — removed for this session
const deadModels = new Set<string>();

/**
 * Models unavailable on ONE key, as "keyIndex|model".
 *
 * A 404 used to kill the model for the whole session and every key. But a 404 is often about the key,
 * not the model: Google stopped offering gemini-2.5-flash "to new users", so a key from a newer project
 * gets 404 while every older key still serves it. In live testing key 2 was one of those — its single
 * 404 removed gemini-2.5-flash for all 30 keys, and every generation, script, frame and video prompt
 * then ran on the lite models instead. A "not available to new users" 404 now retires the model for that
 * key only; any other 404 ("is no longer available", "not found") means Google retired the model itself,
 * and it is dropped for every key at once — trying a retired model on each of 30 keys first used up the
 * whole retry budget in live testing.
 */
const deadModelKeys = new Set<string>();
const modelKeyId = (keyIndex: number, model: string) => `${keyIndex}|${model}`;

let currentModelIndex = 0;

const getCurrentModel = (): string => {
  // Skip dead models
  while (currentModelIndex < MODEL_LIST.length && deadModels.has(MODEL_LIST[currentModelIndex])) {
    currentModelIndex++;
  }
  if (currentModelIndex >= MODEL_LIST.length) {
    // Reset index and find first alive model
    currentModelIndex = 0;
    while (currentModelIndex < MODEL_LIST.length && deadModels.has(MODEL_LIST[currentModelIndex])) {
      currentModelIndex++;
    }
  }
  const aliveModels = MODEL_LIST.filter(m => !deadModels.has(m));
  if (aliveModels.length === 0) {
    throw new Error("All models are permanently dead (404). No working models available.");
  }
  return MODEL_LIST[currentModelIndex];
};

const rotateToNextModel = (): boolean => {
  const startIndex = currentModelIndex;
  currentModelIndex = (currentModelIndex + 1) % MODEL_LIST.length;
  // Skip dead models
  let looped = false;
  while (deadModels.has(MODEL_LIST[currentModelIndex])) {
    currentModelIndex = (currentModelIndex + 1) % MODEL_LIST.length;
    if (currentModelIndex === startIndex) {
      looped = true;
      break;
    }
  }
  const aliveModels = MODEL_LIST.filter(m => !deadModels.has(m));
  if (aliveModels.length === 0 || looped) {
    console.error("All models exhausted.");
    return false;
  }
  console.log(`Rotated to model: ${MODEL_LIST[currentModelIndex]} (${aliveModels.length} alive models remaining)`);
  return true;
};

// Helper function to make API calls with automatic key + model rotation on failure
const callWithFallback = async <T>(
  apiCall: (ai: GoogleGenAI, model: string) => Promise<T>,
  maxRetries: number = API_KEYS.length * MODEL_LIST.length
): Promise<T> => {
  let lastError: any = null;
  const triedKeys = new Set<number>();
  const triedModels = new Set<string>();
  
  const aliveModelCount = () => MODEL_LIST.filter(m => !deadModels.has(m)).length;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const model = getCurrentModel();
    try {
      const ai = getAiInstance();
      const result = await apiCall(ai, model);
      return result;
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      const statusCode = error?.status || error?.statusCode;
      
      // Check if model is permanently dead (404 Not Found)
      const isModelNotFound =
        statusCode === 404 ||
        errorMessage.includes('404') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('is not found') ||
        errorMessage.includes('models/') && errorMessage.includes('not');
      
      if (isModelNotFound) {
        // Only "no longer available to new users" is about the key; older keys still serve the model.
        const keySpecific = /new users/i.test(errorMessage);
        deadModelKeys.add(modelKeyId(currentKeyIndex, model));
        const keysWithModel = keySpecific
          ? API_KEYS.map((_, k) => k).filter(k => !deadModelKeys.has(modelKeyId(k, model)))
          : [];
        if (keysWithModel.length > 0) {
          const next = keysWithModel.find(k => k > currentKeyIndex) ?? keysWithModel[0];
          console.warn(`Model "${model}" is not available on API key ${currentKeyIndex + 1}; trying it on key ${next + 1}.`);
          currentKeyIndex = next;
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        console.error(`Model "${model}" is not available (404)${keySpecific ? " on any API key" : ""}. Removing from rotation.`);
        deadModels.add(model);
        if (aliveModelCount() === 0) {
          throw new Error(`All models are dead. Last error: ${errorMessage}`);
        }
        rotateToNextModel();
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      
      // Check if error is related to API key issues (rate limit, invalid key, quota exceeded)
      const isKeyRelatedError = 
        errorMessage.includes('quota') ||
        errorMessage.includes('rate') ||
        errorMessage.includes('limit') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('API key') ||
        errorMessage.includes('401') ||
        errorMessage.includes('403') ||
        errorMessage.includes('429') ||
        statusCode === 401 ||
        statusCode === 403 ||
        statusCode === 429;

      // Check if error is model-related (overloaded, unavailable, etc.)
      const isModelRelatedError =
        errorMessage.includes('overloaded') ||
        errorMessage.includes('unavailable') ||
        errorMessage.includes('capacity') ||
        errorMessage.includes('500') ||
        errorMessage.includes('503') ||
        statusCode === 500 ||
        statusCode === 503;
      
      if (isKeyRelatedError && API_KEYS.length > 1) {
        console.warn(`API key ${currentKeyIndex + 1} failed with model "${model}": ${errorMessage}. Trying next key...`);
        triedKeys.add(currentKeyIndex);
        rotateToNextKey();
        
        // If we've tried all keys with this model, try next model
        if (triedKeys.size >= API_KEYS.length) {
          console.warn(`All API keys exhausted for model "${model}". Trying next model...`);
          triedKeys.clear();
          triedModels.add(model);
          if (!rotateToNextModel() || triedModels.size >= aliveModelCount()) {
            throw new Error(`All ${API_KEYS.length} API keys and ${aliveModelCount()} models failed. Last error: ${errorMessage}`);
          }
        }
        
        await new Promise(r => setTimeout(r, 500));
      } else if (isModelRelatedError) {
        console.warn(`Model "${model}" error: ${errorMessage}. Trying next model...`);
        triedModels.add(model);
        if (!rotateToNextModel() || triedModels.size >= aliveModelCount()) {
          throw new Error(`All ${aliveModelCount()} models failed. Last error: ${errorMessage}`);
        }
        await new Promise(r => setTimeout(r, 500));
      } else {
        // Non-recoverable error, throw immediately
        throw error;
      }
    }
  }
  
  throw lastError || new Error("API call failed after all retries");
};

/**
 * The key + model rotation used by every Gemini call in the app.
 *
 * Exported so other services share this rotation instead of reimplementing it. The
 * cinematic ads service used to pin `gemini-2.5-flash` with key rotation but no model
 * fallback, which meant every one of its steps failed outright on an API key whose
 * project cannot serve that model — the exact case the notes above describe.
 */
export const callGeminiWithFallback = callWithFallback;

// Section refinement types
export type SectionType = 'mainFrame' | 'header' | 'poster' | 'voiceOver' | 'veo';

// ── Output directives threaded into prompts from the user's configuration ──
const usesLatinScript = (language?: string) => ['english'].includes((language || '').trim().toLowerCase());
/** Telugu is the default and the only language whose closing CTA wording is fixed verbatim. */
const isTeluguScript = (language?: string) => {
  const lang = (language || '').trim().toLowerCase();
  return lang === '' || lang === 'telugu';
};

const buildRatioDirective = (formData: AdFormData): string => {
  const ratio = formData.aspectRatio === '16:9' ? '16:9' : '9:16';
  const orient = ratio === '16:9' ? 'horizontal (landscape)' : 'vertical (portrait)';
  return `OUTPUT ASPECT RATIO (MANDATORY): The final image/design MUST be ${ratio} ${orient}. Wherever any other aspect ratio (such as "9:16" or "1:1") appears below, OVERRIDE it to ${ratio} and compose / frame everything for a ${orient} ${ratio} canvas.\n\n`;
};

/**
 * The ordered outfit for a human-model special category ("Normal Ad (Female)" and friends), or
 * undefined for every other pack. The pack decides the gender; the form decides the clothes.
 */
const packWardrobe = (pack: CharacterPack | null, formData: AdFormData): string | undefined => {
  if (!pack || !isHumanPack(pack) || !formData.attireType) return undefined;
  // The male & female duo is dressed per person from one choice — see wardrobeDirective.
  return wardrobeDirective(formData.attireType, formData.customAttire, packCastGender(pack)) || undefined;
};

/**
 * The special category for a run, with a Custom Character's description written into it.
 *
 * One resolver for every call in this file, so the script, the frames, the refines and the video
 * director all see the same character — see characterPacks.withCustomCharacter.
 */
const packFor = (formData: AdFormData): CharacterPack | null =>
  withCustomCharacter(getCharacterPack(formData.characterPack), formData.customCharacter);

/**
 * Resolves the name-board text: the explicit "logoNameText" if the user typed one, else a
 * fallback to the business name extracted from the business info (task 3 — the name board must
 * still render even when the user did not type a custom name).
 */
const resolveNameBoardText = (formData: AdFormData, businessInfo?: Record<string, unknown>): string => {
  const typed = (formData.logoNameText || '').trim();
  const fallback = businessInfo ? (extractBusinessNameFromInfo(businessInfo) || '').trim() : '';
  return (typed || fallback).toUpperCase();
};

/**
 * The "there is no logo" preamble for this generation, if it needs one.
 *
 * The copy lives in services/prompts (with the rest of the prompt text); this only resolves WHICH
 * name to put in it and which surface it is going on — a photographed scene gets a wall board, a
 * designed header or poster gets a wordmark.
 */
const buildNameBoardDirective = (
  formData: AdFormData,
  businessInfo?: Record<string, unknown>,
  surface: BrandSurface = 'scene',
): string =>
  buildBrandMarkDirective(!!formData.noLogo, resolveNameBoardText(formData, businessInfo), surface);

/**
 * What the VIDEO BOTTOM LABEL is designed from beyond the trade: the festival's own theme, and what
 * this video is about — see prompts/lowerThird.
 */
const labelDesignInputs = (formData: AdFormData, sceneContext: SceneContext | null, coreMessage: CoreMessageBrief | null) => {
  const festival = formData.adType === 'festival' && formData.festivalName?.trim() ? getFestivalTheme(formData.festivalName) : null;
  return {
    festivalTheme: festival
      ? { colors: festival.headerColors, patterns: festival.headerPatterns, elements: festival.culturalElements }
      : undefined,
    context: sceneContext || coreMessage
      ? {
          motive: sceneContext?.motive,
          mood: sceneContext?.mood,
          coreMessage: coreMessage?.corePromise ? `${coreMessage.whatTheyDo ? `${coreMessage.whatTheyDo} — ` : ''}${coreMessage.corePromise}` : undefined,
        }
      : undefined,
  };
};

/**
 * How the contact numbers go on a poster — every verified one (up to three), laid out for its count,
 * or none at all. The poster used to show "at most two", so a client with three numbers lost one.
 */
const posterContactRule = (contacts: { display: string; whatsapp: boolean }[]): string => {
  const list = contacts.map(c => `${c.display}${c.whatsapp ? ' (WhatsApp — give it a WhatsApp icon)' : ''}`).join('  |  ');
  switch (contacts.length) {
    case 0:
      return 'NO CONTACT NUMBER was given — the poster has NO contact line, NO phone icon and NO label for one. Never write, invent or suggest a number.';
    case 1:
      return `CONTACT NUMBER — exactly ONE, shown once as a single prominent contact line with a phone icon: ${list}. Digit for digit; never alter, complete or add a number.`;
    case 2:
      return `CONTACT NUMBERS — exactly TWO, both shown, evenly balanced side by side (or stacked) in ONE contact block: ${list}. Digit for digit; never alter, complete, merge or add a number.`;
    default:
      return `CONTACT NUMBERS — exactly THREE, all shown, as three compact, equally sized numbers in ONE tidy row or stack: ${list}. Digit for digit; never alter, complete, merge or add a number.`;
  }
};

/**
 * The VIDEO BOTTOM LABEL prompt — assembled in code, with no model call (prompts/lowerThird).
 *
 * Its numbers and address are the VERIFIED ones (utils/businessFacts): the pills are drawn for exactly
 * as many numbers as the business gave — one, two or three — and a missing address is no strip at all.
 * Exported so a label missing from a kit can be rebuilt on its own from what is on screen.
 */
export const buildVideoBottomLabel = (params: {
  formData: AdFormData;
  businessInfo: any;
  hasLogoFile: boolean;
  hasPremisesPhoto: boolean;
  sceneContext?: SceneContext | null;
  coreMessage?: CoreMessageBrief | null;
}): string => {
  const { formData, businessInfo } = params;
  // No logo FILE is no logo, ticked or not — the label never asks for a file that does not exist.
  const noLogo = !!formData.noLogo || !params.hasLogoFile;
  const nameBoard = resolveNameBoardText(formData, businessInfo);
  // Extract ONLY logo/name/contacts/address — never dump the full business JSON or any other data.
  const name = extractBusinessNameFromInfo(businessInfo);
  const facts = factsFromProfile(businessInfo);
  const contacts = facts.phones.slice(0, MAX_LABEL_CONTACTS);
  const address = facts.address;
  // No ratio directive here: a label is a tightly cropped strip laid over a video, not a video frame.
  const systemPrompt = buildBrandMarkDirective(noLogo, nameBoard, 'header')
    + LOWER_THIRD_SYSTEM_PROMPT({
      businessType: detectBusinessType(JSON.stringify(businessInfo ?? {})),
      adType: formData.adType,
      festivalName: formData.festivalName,
      noLogo,
      contactCount: contacts.length,
      hasAddress: !!address,
      hasWhatsApp: contacts.some(c => c.whatsapp),
      // The client's own photographs may sit at the right edge; with none, the label stays graphic.
      hasPremisesPhoto: params.hasPremisesPhoto,
      ...labelDesignInputs(formData, params.sceneContext ?? null, params.coreMessage ?? null),
    });
  const valueLines = [
    // This block is the literal text the member copies into the image generator, so a "LOGO =" line
    // here asked for a logo file that was never uploaded however the rules above were worded. In
    // no-logo mode there is no brand line AT ALL: a "BRAND MARK = <name>" line above "NAME = <name>"
    // is what put the same name in two boxes in the finished label.
    noLogo
      ? 'NO BRAND IMAGE — this label has no logo circle and no brand tile; the NAME below is the only branding, and it appears exactly once'
      : 'LOGO = use the attached logo image exactly as provided, unchanged',
    name ? `NAME = ${name}` : '',
    ...contacts.map((c, i) => `CONTACT ${i + 1} = ${c.display}${c.whatsapp ? ' (WhatsApp)' : ''}`),
    contacts.length > 0 ? `EXACTLY ${contacts.length} NUMBER${contacts.length === 1 ? '' : 'S'} — draw ${contacts.length} contact pill${contacts.length === 1 ? '' : 's'}, no more and no fewer.` : '',
    address ? `ADDRESS = ${address}` : '',
  ].filter(Boolean);
  // Explicit negatives for missing fields, so the image generator never fabricates them.
  const missing: string[] = [];
  if (contacts.length === 0) missing.push('NO CONTACT NUMBER provided — do NOT show any contact pill and do NOT invent, guess, autocomplete, or fabricate any phone number. The raised right module stays, because it must still cover the watermark.');
  if (!address) missing.push('NO ADDRESS provided — do NOT show any address strip and do NOT invent, guess, autocomplete, or fabricate any address, street, area, city, pincode, or location. Close that space cleanly.');
  return [
    systemPrompt,
    '',
    'REAL CONTENT TO PLACE (use ONLY these EXACT values — do not add anything else, and do not write or invent any field that is not listed here):',
    ...valueLines,
    ...(missing.length ? ['', 'MISSING FIELDS (STRICT — NEVER FABRICATE THESE):', ...missing] : []),
  ].join('\n');
};

/**
 * The video kit's poster prompt (deliverable 3), from the verified facts.
 *
 * One model call, asked again once if it comes back empty — an empty poster row used to vanish from
 * the kit while the status said Completed. Whatever comes back is scrubbed of any number the business
 * never gave. Exported so a missing poster can be written on its own.
 */
export const writeVideoPosterPrompt = async (formData: AdFormData, businessInfo: any): Promise<string> => {
  const systemInstruction = buildRatioDirective(formData)
    + buildNameBoardDirective(formData, businessInfo, 'layout')
    + POSTER_SYSTEM_PROMPT(formData.adType, formData.festivalName, formData.noLogo || false, resolveNameBoardText(formData, businessInfo));
  const facts = factsFromProfile(businessInfo);
  const contacts = facts.phones.slice(0, MAX_LABEL_CONTACTS);
  const addressRule = facts.address
    ? `ADDRESS — an address IS provided, so it MUST appear in the poster, on ONE clean line, exactly as given: ${facts.address}`
    : `NO ADDRESS was given — the poster has NO address line, NO location pin and NO label for one. Never write or invent an address, street, area or city.`;
  const userPrompt = `Write the poster design prompt for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName}` : ''}
  ${posterContactRule(contacts)}
  ${addressRule}
  Write the short, clean, plain-English poster prompt now.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: { systemInstruction },
    }));
    const text = stripUnverifiedNumbers((response.text || '').trim(), verifiedKeys(facts));
    if (text.length > 40) return text;
  }
  throw new Error('The poster prompt came back empty. Press Generate on the poster row to write it again.');
};

const buildLanguageDirective = (formData: AdFormData): string => {
  const lang = (formData.language || 'Telugu').trim();
  if (!lang || lang.toLowerCase() === 'telugu') return '';
  return `LANGUAGE OVERRIDE (MANDATORY): Write the ENTIRE voice-over in ${lang}${usesLatinScript(lang) ? ' (clean conversational English)' : ` using natural ${lang} script`}. Do NOT use Telugu anywhere. Every spoken line AND the closing call-to-action must be in ${lang}. Ignore any instruction below that says to write in Telugu — use ${lang} instead.\n\n`;
};

// Pixel-perfect refine: change ONLY what the user asked, keep everything else identical.
const REFINE_EDIT_DIRECTIVE = `You are a precise prompt EDITOR (not a re-generator). Apply ONLY the user's requested change to the given content and keep EVERYTHING else exactly the same, word-for-word. Do NOT rewrite, restructure, reorder, shorten, expand, or "improve" any part the user did not ask about. Make the smallest possible edit that fully satisfies the request, and preserve all existing separators, structure, and formatting.\n\n`;

/**
 * Decides the ad's core message before a line is written — see prompts/coreMessage.
 *
 * Built from everything the member gave the platform: the business information extracted from the
 * Assets & Files, the member's written brief, and the Configuration. A failed or unreadable call
 * never stops a generation; it falls back to a brief assembled from the extracted profile.
 */
export const deriveCoreMessage = async (businessInfo: any, formData: AdFormData): Promise<CoreMessageBrief> => {
  const pack = packFor(formData);
  const configuration = [
    `Ad type: ${formData.adType}${formData.adType === 'festival' && formData.festivalName ? ` — ${formData.festivalName}` : ''}`,
    `Spoken language: ${formData.language || 'Telugu'}`,
    `Length: ${Math.max(1, Math.round((formData.duration || 32) / CLIP_SECONDS))} clips of ${CLIP_SECONDS} seconds`,
    `Special category: ${pack ? pack.label : 'none — a model presents the business'}`,
    `Background: ${formData.locationMode === 'real_provided' ? "the client's own premises, from their photographs" : 'built for the business'}`,
  ].join('\n');
  const brief = formData.textInstructions?.trim();

  if (API_KEYS.length > 0) {
    try {
      const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text:
`BUSINESS INFORMATION (extracted from the client's Assets & Files):
${JSON.stringify(businessInfo, null, 2)}
${brief ? `\nTHE MEMBER'S WRITTEN BRIEF (the client's own instructions — these come first):\n${brief}\n` : ''}
AD CONFIGURATION:
${configuration}

Decide the core message now and return the JSON.` }] }],
        config: { systemInstruction: CORE_MESSAGE_SYSTEM_PROMPT, responseMimeType: 'application/json' },
      }));
      const parsed = parseCoreMessageBrief(response.text || '');
      if (parsed) return parsed;
    } catch (err) {
      console.warn('Core message step failed; building the brief from the extracted profile.', err);
    }
  }
  return fallbackCoreMessageBrief(businessInfo);
};

// Function to refine a specific section
export const refineSection = async (
  sectionType: SectionType,
  currentContent: string,
  additionalInstructions: string,
  formData: AdFormData,
  businessInfo: any
): Promise<string> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }

  let systemPrompt: string;
  let userPrompt: string;

  /**
   * Refining a special-category ad used to hand the content to the HUMAN-MODEL prompts, which
   * describe a single presenter in a saree. The editor was therefore being told the script it was
   * looking at should be one voice — so it dutifully flattened the `[Motu]:` / `[Patlu]:` exchange
   * into a normal voice-over, and the frame and video prompts lost the characters the same way.
   *
   * Every branch below now picks the pack's own prompt when there is one, so an edit can only ever
   * change what was asked for and never the format underneath it.
   */
  const pack = packFor(formData);
  const packSpeakerList = pack ? packSpeakers(pack) : [];

  /**
   * The voice-over and the video prompts have their own refine flows, which understand the request
   * and change only what it touches (refineVoiceOver, refineVeoPrompts). This whole-section entry
   * point is kept for callers that still pass a section as one string.
   */
  if (sectionType === 'voiceOver') {
    return (await refineVoiceOver({ script: currentContent, instruction: additionalInstructions, formData, businessInfo })).script;
  }
  if (sectionType === 'veo') {
    const prompts = currentContent.split(/###\s*SEGMENT\s*###/i).map(p => p.trim()).filter(Boolean);
    return (await refineVeoPrompts({ prompts, instruction: additionalInstructions })).prompts.join('\n###SEGMENT###\n');
  }

  switch (sectionType) {
    case 'mainFrame':
      systemPrompt = REFINE_EDIT_DIRECTIVE + (pack
        ? CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, {
            segmentCount: Math.ceil(formData.duration / 8),
            clipSummaries: [],
            locationMode: formData.locationMode === 'real_provided' ? 'real_provided' : 'ai_generated',
            locationPlan: '',
            aspectRatio: formData.aspectRatio === '16:9' ? '16:9' : '9:16',
            adType: formData.adType,
            festivalName: formData.festivalName,
            businessContext: JSON.stringify(businessInfo),
            wardrobe: packWardrobe(pack, formData),
          })
        : buildRatioDirective(formData) + buildNameBoardDirective(formData, businessInfo) + MAIN_FRAME_SYSTEM_PROMPT(
            formData.attireType,
            formData.adType,
            formData.festivalName,
            formData.aspectRatio,
            JSON.stringify(businessInfo),
            formData.gender || 'female',
            formData.customAttire || '',
            formData.noLogo || false,
            resolveNameBoardText(formData, businessInfo)
          ));
      userPrompt = `You previously generated these Main Frame prompts (one per clip, separated by ###CLIP###):

---CURRENT PROMPTS---
${currentContent}
---END CURRENT PROMPTS---

The user wants the following changes/additions applied to ALL clips:
"${additionalInstructions}"

IMPORTANT: 
- Apply ONLY the requested changes to ALL existing clip prompts
- Maintain the ###CLIP### separator between each clip's prompt
- Keep visual continuity between clips (same character, environment, lighting)
${pack
  ? `- These are ${pack.label} frames. Keep both characters named and never describe how they look; keep each clip's "ATTACH"/photograph reference and its business zone exactly as they are.`
  : `- Clips after the first must still start with "Continuing from the previous frame…"`}
- Keep all other aspects exactly the same
- Output ONLY the refined prompts separated by ###CLIP###, no explanations
- Do NOT wrap in markdown code blocks
- Make sure each prompt is clean and copy-paste ready`;
      break;

    case 'header':
      systemPrompt = REFINE_EDIT_DIRECTIVE
        + buildNameBoardDirective(formData, businessInfo, 'header')
        + LOWER_THIRD_SYSTEM_PROMPT({
          businessType: detectBusinessType(JSON.stringify(businessInfo ?? {})),
          adType: formData.adType,
          festivalName: formData.festivalName,
          noLogo: formData.noLogo || false,
          contactCount: factsFromProfile(businessInfo).phones.slice(0, MAX_LABEL_CONTACTS).length,
          hasAddress: !!factsFromProfile(businessInfo).address,
          hasWhatsApp: hasWhatsAppNumber(businessInfo),
          ...labelDesignInputs(formData, null, null),
        });
      userPrompt = `You previously generated this brand label prompt:

---CURRENT PROMPT---
${currentContent}
---END CURRENT PROMPT---

The user wants the following changes/additions:
"${additionalInstructions}"

IMPORTANT:
- Apply ONLY the requested changes to the existing prompt
- Keep all other aspects exactly the same
- Output ONLY the refined prompt, no explanations
- Do NOT wrap in markdown code blocks
- Make sure the output is a clean, copy-paste ready prompt`;
      break;

    case 'poster':
      systemPrompt = REFINE_EDIT_DIRECTIVE + buildRatioDirective(formData)
        + buildNameBoardDirective(formData, businessInfo, 'layout')
        + POSTER_SYSTEM_PROMPT(formData.adType, formData.festivalName, formData.noLogo || false, resolveNameBoardText(formData, businessInfo));
      userPrompt = `You previously generated this Poster design prompt:

---CURRENT PROMPT---
${currentContent}
---END CURRENT PROMPT---

The user wants the following changes/additions:
"${additionalInstructions}"

IMPORTANT:
- Apply ONLY the requested changes
- Keep it a SHORT, clean, plain-English poster prompt (NOT JSON, no code block)
- Keep only real business details, no fake data, minimal poster text, no technical units like px/pt/hex
- Output ONLY the refined plain-text prompt, no explanations`;
      break;

    default:
      throw new Error(`Unknown section type: ${sectionType}`);
  }

  const response = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] }
      ],
      config: {
        systemInstruction: systemPrompt,
      }
    });
  });

  const refined = response.text || currentContent;

  // A refine is a model rewrite like any other: a number it adds that the business never gave goes.
  if (sectionType === 'header' || sectionType === 'poster') {
    return stripUnverifiedNumbers(refined, verifiedKeys(factsFromProfile(businessInfo)));
  }
  return refined;
};

// ── Voice-over refine: understand, edit only what was asked, prove nothing else broke ─────────────

/**
 * The editor handed the planned clip back unchanged, twice.
 *
 * This used to say "the script already says this" — but a script that already says it is caught by
 * the plan (alreadyDone) before any edit. What reaches here is an edit the rules would not allow: a
 * live "make the closing line warmer" was planned as a rewrite of the fixed call line.
 */
const NO_CHANGE_MADE = 'The editor could not make that change without breaking one of the script\'s fixed rules, so the script is as it was. Try describing the change another way.';

/** The corrective message when an edit hands the planned clips back word for word. */
const unchangedCorrection = (clips: number[], changes: Record<number, string>) =>
  `- You handed clip${clips.length === 1 ? '' : 's'} ${clips.map(i => i + 1).join(', ')} back word for word as ${clips.length === 1 ? 'it was' : 'they were'}. `
  + `The member must be able to hear the change the plan asks for: ${clips.map(i => `clip ${i + 1} — ${changes[i] || 'apply the request'}`).join('; ')}. Make it now, within the rules.`;

export interface VoiceOverRefineResult {
  /** The script after the refine — the original, untouched, when nothing was applied. */
  script: string;
  /** 0-based clips whose words changed. */
  changed: number[];
  /** What the member asked for, as the editor understood it. */
  understood: string;
  /** Set when nothing was applied, with a reason the member can act on. */
  notApplied?: string;
}

/**
 * Refines a voice-over script — the whole script, or one clip from its own Refine button.
 *
 * 1. PLAN: the request is read against the numbered script and resolved to the clips it touches
 *    (VOICEOVER_REFINE_PLAN_SYSTEM_PROMPT). A clip's own button fixes the plan to that clip.
 * 2. EDIT: only those clips are rewritten, returned as JSON by clip number.
 * 3. MERGE: edited clips go back into the untouched script in code — every other clip is exactly what
 *    it was, because it never went through a model.
 * 4. CHECK: the result is validated, and only problems the edit CREATED count (utils/voiceOverRefine).
 *    One corrective attempt is made with those problems named; if it still breaks the script, nothing
 *    is saved and the member is told why.
 */
export const refineVoiceOver = async (params: {
  script: string;
  instruction: string;
  /** 0-based clip, when refining one clip. */
  clip?: number | null;
  formData: AdFormData;
  businessInfo: any;
  coreMessage?: CoreMessageBrief | null;
}): Promise<VoiceOverRefineResult> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }
  const { script, instruction, formData, businessInfo } = params;
  const forced = typeof params.clip === 'number' ? params.clip : null;
  const language = formData.language || 'Telugu';
  const pack = packFor(formData);
  const speakers = pack ? packSpeakers(pack) : [];
  const nameOf = new Map(speakers.map(s => [s.key, s.name]));
  const unchanged = (notApplied: string, understood = ''): VoiceOverRefineResult => ({ script, changed: [], understood, notApplied });

  // ── The script as clips ──
  const dialogue: DialogueClip[] = pack ? parseDialogueClips(script, speakers) : [];
  const labelled = pack ? [] : parseLabeledClips(script).map(cleanScriptText);
  const lines: string[] = pack
    ? []
    : labelled.length > 0 ? labelled : normalizeAndFormatVoiceOver(script, Math.max(1, Math.round(formData.duration / CLIP_SECONDS))).segments;
  const texts = pack
    ? dialogue.map(c => c.map(l => `[${nameOf.get(l.speaker) ?? l.speaker}]: ${l.text}`).join('\n'))
    : lines;
  const count = texts.length;
  if (count === 0) return unchanged('The script could not be read into clips, so there was nothing to refine.');
  if (forced !== null && (forced < 0 || forced >= count)) return unchanged(`This script has no clip ${forced + 1}.`);

  const numbered = texts.map((t, i) => `Clip ${i + 1} (${i * CLIP_SECONDS}-${(i + 1) * CLIP_SECONDS}s):\n${t}`).join('\n\n');

  // ── 1. Plan ──
  const planResponse = await callWithFallback(async (ai, model) => ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: `SCRIPT:\n${numbered}\n\nREQUEST:\n"${instruction}"\n\nReturn the JSON plan.` }] }],
    config: {
      systemInstruction: VOICEOVER_REFINE_PLAN_SYSTEM_PROMPT({
        language,
        clipCount: count,
        forcedClip: forced === null ? null : forced + 1,
        closingLine: !pack && isTeluguScript(language) ? `"${FINAL_SCREEN_CTA}"` : undefined,
      }),
      responseMimeType: 'application/json',
    },
  }));
  const plan = parseRefinePlan(planResponse.text || '', count, forced);
  if (plan.notPossible) return unchanged(plan.notPossible, plan.understood);
  if (plan.alreadyDone) return unchanged(`Nothing needed changing — ${plan.alreadyDone}.`, plan.understood);
  if (plan.clips.length === 0) {
    return unchanged('The request did not point to anything in the script to change. Say which clip, or what should be different.', plan.understood);
  }

  // ── 2. Edit ──
  const editSystem = buildLanguageDirective(formData) + VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({
    language,
    clipCount: count,
    adType: formData.adType,
    festivalName: formData.festivalName,
    brief: params.coreMessage ?? null,
    speakers: pack ? speakers : undefined,
  });
  const editPrompt = (correction = '') => `SCRIPT (the whole script, for context):
${numbered}

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

REQUEST (the member's own words):
"${instruction}"

EDIT PLAN — change these clips only:
${plan.clips.map(i => `- Clip ${i + 1}: ${plan.changes[i] || 'apply the request to this clip'}`).join('\n')}
${correction ? `\n⚠️ YOUR PREVIOUS EDIT WAS REJECTED:\n${correction}\nDo the same edit again and fix exactly those problems.\n` : ''}
Return ONLY the JSON for clip${plan.clips.length === 1 ? '' : 's'} ${plan.clips.map(i => i + 1).join(', ')}.`;
  const edit = async (correction = '') => (await callWithFallback(async (ai, model) => ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: editPrompt(correction) }] }],
    config: { systemInstruction: editSystem, responseMimeType: 'application/json' },
  }))).text || '';

  // ── 3 & 4. Merge and check, with one corrective attempt ──
  // The business's own names are never "hard words", whatever they contain.
  const ownBrief = params.coreMessage ?? fallbackCoreMessageBrief(businessInfo);
  const ownNames = [ownBrief.businessName, ownBrief.place].filter(Boolean);
  /**
   * A hard word the edit brought in earns the corrective attempt, but never refuses the member's
   * change: losing what they asked for over one formal word is worse than the word.
   */
  const blocking = (problems: string[]) => problems.filter(p => !isHardWordIssue(p));
  const isBetterAttempt = (was: { problems: string[] }, now: { problems: string[] }) =>
    blocking(now.problems).length < blocking(was.problems).length
    || (blocking(now.problems).length === blocking(was.problems).length && now.problems.length < was.problems.length);

  if (!pack) {
    const everyday = { names: ownNames };
    const wishClip = formData.adType === 'festival' ? 1 : undefined;
    const before = validateVoiceOverSegments(formatVoiceOverScript(lines), lines, count, language, everyday, wishClip);
    const attempt = (raw: string) => {
      // A refined line is spoken like every other: numbers as words, మరియు exactly (utils/spokenNumbers).
      const edits = new Map([...parseClipTextEdits(raw, plan.clips)].map(([i, t]) => [i, speakableLine(cleanScriptText(toSpokenEndings(t, language)), language)] as [number, string]));
      const merged = mergeClipEdits(lines, edits);
      const formatted = formatVoiceOverScript(merged);
      const problems = edits.size === 0
        ? ['Your reply contained no usable clips in the required JSON.']
        : introducedIssues(before, validateVoiceOverSegments(formatted, merged, count, language, everyday, wishClip));
      return { merged, formatted, problems };
    };
    let result = attempt(await edit());
    if (result.problems.length > 0) {
      // Name each problem with its fix, and show the clip's words counted, so the retry can see the number.
      const correction = plan.clips.map(i => {
        const clipProblems = issuesForClip(result.problems, i, count);
        return clipProblems.length
          ? `- Clip ${i + 1}: ${repairDirection(clipProblems, MIN_WORDS_PER_CLIP, MAX_WORDS_PER_CLIP)}\n  As you wrote it — ${numberedWords(tokenizeWords(result.merged[i]))}`
          : '';
      }).filter(Boolean).concat(result.problems.filter(p => clipIndexesFromIssues([p], count).length === 0).map(p => `- ${p}`));
      const retry = attempt(await edit(correction.join('\n')));
      if (isBetterAttempt(result, retry)) result = retry;
    }
    if (blocking(result.problems).length > 0) {
      return unchanged(`The change could not be made without breaking the script: ${blocking(result.problems).join(' ')}`, plan.understood);
    }
    let changed = changedClipIndexes(lines, result.merged);
    if (changed.length === 0) {
      // The plan asked for a change and the edit handed the clip back as it was — once more, saying so.
      const again = attempt(await edit(unchangedCorrection(plan.clips, plan.changes)));
      if (blocking(again.problems).length === 0 && changedClipIndexes(lines, again.merged).length > 0) {
        result = again;
        changed = changedClipIndexes(lines, again.merged);
      }
    }
    if (changed.length === 0) return unchanged(NO_CHANGE_MADE, plan.understood);
    return { script: result.formatted, changed, understood: plan.understood };
  }

  const budget = wordBudgetFor(speakers.length);
  const spellings = packNameSpellings(pack, language);
  const characterNames = speakers.map(s => ({
    name: s.name,
    tokens: [s.name, ...spellings.filter(sp => sp.name === s.name).map(sp => sp.spelling)],
  }));
  const check = (clips: DialogueClip[]) => validateDialogueClips(clips, count, speakers, {
    characterNames,
    minWordsPerClip: budget.minClip,
    maxWordsPerClip: budget.maxClip,
    minWordsPerLine: budget.minLine,
    maxWordsPerLine: budget.maxLine,
  }).concat(dialogueHardWordIssues(clips, language, ownNames, k => nameOf.get(k) ?? k));
  /** A speaker as the model wrote it — key, name, or position — resolved to the pack's own key. */
  const speakerKey = (raw: string, position: number) => {
    const t = raw.trim().toLowerCase();
    return speakers.find(s => s.key === t || s.name.toLowerCase() === t)?.key ?? speakers[position]?.key ?? t;
  };
  const before = check(dialogue);
  const attempt = (raw: string) => {
    const edits = new Map([...parseClipDialogueEdits(raw, plan.clips)].map(([i, ls]) =>
      [i, ls.map((l, p) => ({ speaker: speakerKey(l.speaker, p), text: speakableLine(toSpokenEndings(l.text, language), language) }))] as [number, DialogueClip]));
    const merged = applyNameSpellings(mergeClipEdits(dialogue, edits), spellings);
    const problems = edits.size === 0
      ? ['Your reply contained no usable clips in the required JSON.']
      : introducedIssues(before, check(merged));
    return { merged, problems };
  };
  let result = attempt(await edit());
  if (result.problems.length > 0) {
    const retry = attempt(await edit(result.problems.map(p => `- ${p}`).join('\n')));
    if (isBetterAttempt(result, retry)) result = retry;
  }
  if (blocking(result.problems).length > 0) {
    return unchanged(`The change could not be made without breaking the ${pack.label} script: ${blocking(result.problems).join(' ')}`, plan.understood);
  }
  const sameClip = (a: DialogueClip, b: DialogueClip) => JSON.stringify(a) === JSON.stringify(b);
  let changed = changedClipIndexes(dialogue, result.merged, sameClip);
  if (changed.length === 0) {
    const again = attempt(await edit(unchangedCorrection(plan.clips, plan.changes)));
    if (blocking(again.problems).length === 0 && changedClipIndexes(dialogue, again.merged, sameClip).length > 0) {
      result = again;
      changed = changedClipIndexes(dialogue, again.merged, sameClip);
    }
  }
  if (changed.length === 0) return unchanged(NO_CHANGE_MADE, plan.understood);
  return { script: formatDialogueScript(result.merged, speakers), changed, understood: plan.understood };
};

/**
 * Refines Veo prompts — one clip or all of them — by understanding the request first.
 *
 * 1. PLAN: what the member wants, compared with what each prompt says now, as a concrete change per
 *    section per clip (prompts/refine VEO_REFINE_PLAN_SYSTEM_PROMPT).
 * 2. EDIT: only the planned clips, as JSON keyed by clip, so a missing separator can no longer shift
 *    every prompt by one.
 * 3. CHECK in code (utils/veoRefine): the spoken dialogue is untouched and no section went missing.
 *    A clip that fails, or comes back unchanged, is asked once more with the problem named; after
 *    that it keeps its original prompt.
 *
 * The spoken line inside each prompt is the recorded dialogue; a refine that changed it would put
 * words in the video the voice-over never says.
 */
export const refineVeoPrompts = async (params: {
  prompts: string[];
  instruction: string;
  /** 0-based clip to refine; omit to apply the request to every clip. */
  clip?: number | null;
}): Promise<{ prompts: string[]; changed: number[]; rejected: number[]; understood: string; notApplied: string }> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }
  const { prompts, instruction } = params;
  const forced = typeof params.clip === 'number' && params.clip >= 0 && params.clip < prompts.length ? params.clip : null;
  const shown = forced !== null ? [forced] : prompts.map((_, i) => i);
  if (shown.length === 0) return { prompts, changed: [], rejected: [], understood: '', notApplied: '' };
  const labelled = (indexes: number[]) => indexes.map(i => `=== CLIP ${i + 1} ===\n${prompts[i]}`).join('\n\n');

  // 1. Understand and compare.
  let plan = parseRefinePlan('', prompts.length, forced);
  try {
    const planResponse = await callWithFallback(async (ai, model) => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: `CURRENT PROMPTS:

${labelled(shown)}

REQUEST FROM THE MEMBER:
"${instruction}"
${forced !== null ? `\nThis request is for clip ${forced + 1} only.\n` : ''}
Plan the edit now.` }] }],
      config: { systemInstruction: VEO_REFINE_PLAN_SYSTEM_PROMPT, responseMimeType: 'application/json' },
    }));
    plan = parseRefinePlan(planResponse.text || '', prompts.length, forced);
  } catch (err) {
    console.warn('Veo refine planning failed; editing straight from the request.', err);
  }
  if (plan.notPossible || plan.alreadyDone) {
    return { prompts, changed: [], rejected: [], understood: plan.understood, notApplied: plan.notPossible || plan.alreadyDone };
  }
  // No usable plan: the request itself is the change, for the clips it was asked for.
  const targets = plan.clips.length > 0 ? plan.clips : shown;
  const changeFor = (i: number) => plan.changes[i] || instruction;

  // 2. Edit — and 3. check.
  const edit = async (indexes: number[], corrections: Record<number, string> = {}) => {
    const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: `${indexes.map(i => `=== CLIP ${i + 1} ===
PLANNED CHANGE: ${changeFor(i)}${corrections[i] ? `\nYOUR LAST EDIT OF THIS CLIP WAS NOT USABLE: ${corrections[i]}` : ''}
CURRENT PROMPT:
${prompts[i]}`).join('\n\n')}

THE MEMBER'S REQUEST, for context: "${instruction}"

Return the JSON with the complete edited prompt for clip${indexes.length === 1 ? '' : 's'} ${indexes.map(i => i + 1).join(', ')}.` }] }],
      config: { systemInstruction: VEO_REFINE_SYSTEM_PROMPT, responseMimeType: 'application/json' },
    }));
    return parseClipPromptEdits(response.text || '', indexes);
  };

  const next = [...prompts];
  const changed: number[] = [];
  const problemsOf: Record<number, string> = {};
  const judge = (edits: Map<number, string>, indexes: number[]) => {
    for (const i of indexes) {
      const candidate = edits.get(i) || '';
      const problems = candidate ? veoEditProblems(prompts[i], candidate) : ['No edited prompt came back for this clip.'];
      if (problems.length === 0 && sameVeoPrompt(candidate, prompts[i])) {
        problems.push(`It came back unchanged. Make the planned change: ${changeFor(i)}`);
      }
      if (problems.length === 0) {
        next[i] = candidate;
        changed.push(i);
        delete problemsOf[i];
      } else {
        problemsOf[i] = problems.join(' ');
      }
    }
  };
  judge(await edit(targets), targets);
  const retry = targets.filter(i => problemsOf[i]);
  if (retry.length > 0) {
    try {
      judge(await edit(retry, problemsOf), retry);
    } catch (err) {
      console.warn('Veo refine retry failed; those clips keep their prompts.', err);
    }
  }
  const rejected = targets.filter(i => problemsOf[i]).sort((a, b) => a - b);
  return {
    prompts: next,
    changed: changed.sort((a, b) => a - b),
    rejected,
    understood: plan.understood,
    notApplied: rejected.length > 0
      ? rejected.map(i => `Clip ${i + 1}: ${problemsOf[i]}`).join(' ')
      : '',
  };
};

const HOME_INTERIOR_MARKERS = [
  'living room',
  'home interior',
  'bedroom',
  'apartment',
  'residential',
  'sofa',
  'couch',
  'villa',
  'drawing room',
  'hotel lobby',
  'generic office corner'
];

const REALISTIC_LOGO_SURFACE_MARKERS = [
  'reception panel',
  'acrylic sign',
  'wall signage',
  'mounted',
  'mounted sign',
  'feature wall',
  'fascia',
  'branding wall',
  'achievement wall',
  'board',
  'signage'
];

const INSTITUTION_ENVIRONMENT_MARKERS = [
  'campus',
  'admissions',
  'classroom',
  'lecture hall',
  'lecture',
  'library',
  'lab',
  'seminar',
  'student',
  'corridor',
  'notice board',
  'academic reception'
];

const CONSULTANCY_ENVIRONMENT_MARKERS = [
  'counseling',
  'counselling',
  'consultation',
  'application',
  'brochure',
  'university partnership',
  'success story',
  'document',
  'visa',
  'destination wall'
];

const LOCATION_ANCHOR_MARKERS = [
  'campus',
  'admissions',
  'reception',
  'front desk',
  'classroom',
  'lecture hall',
  'lecture',
  'library',
  'lab',
  'seminar',
  'corridor',
  'notice board',
  'student help desk',
  'student interaction',
  'counseling',
  'counselling',
  'consultation',
  'brochure',
  'document',
  'application',
  'achievement wall',
  'certification wall',
  'logo wall',
  'product display',
  'showcase',
  'workstation',
  'meeting room',
  'entrance'
];

const containsAnyMarker = (text: string, markers: string[]): boolean => (
  markers.some((marker) => text.includes(marker))
);

const normalizePromptForComparison = (prompt: string): string => (
  prompt
    .toLowerCase()
    .replace(/clip\s+\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
);

const getLocationAnchorSignature = (prompt: string): string => {
  const loweredPrompt = prompt.toLowerCase();
  const matches = LOCATION_ANCHOR_MARKERS.filter((marker) => loweredPrompt.includes(marker));

  return Array.from(new Set(matches)).slice(0, 3).sort().join('|');
};

const collectParsedMainFramePrompts = (responseText: string, segmentCount: number): string[] => {
  const cleanedResponse = responseText
    .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```$/gim, '');

  let rawClipPrompts: string[] = [];
  const separatorPatterns = [
    /###\s*CLIP\s*###/gi,
    /---\s*CLIP\s*---/gi,
    /\n={3,}\s*\n/g,
  ];

  for (const pattern of separatorPatterns) {
    const splits = cleanedResponse.split(pattern)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (splits.length >= segmentCount) {
      rawClipPrompts = splits;
      break;
    }

    if (splits.length > rawClipPrompts.length) {
      rawClipPrompts = splits;
    }
  }

  if (rawClipPrompts.length < segmentCount) {
    const clipHeaderSplit = cleanedResponse.split(/\n(?=Clip\s+\d+\s*[\u2013\u2014–—-])/gi)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (clipHeaderSplit.length > rawClipPrompts.length) {
      rawClipPrompts = clipHeaderSplit;
    }
  }

  return rawClipPrompts;
};

const finalizeMainFramePrompts = (rawClipPrompts: string[], segmentCount: number, fallbackPrompt: string): string[] => {
  if (rawClipPrompts.length >= segmentCount) {
    return rawClipPrompts.slice(0, segmentCount);
  }

  if (rawClipPrompts.length > 0) {
    const paddedPrompts = [...rawClipPrompts];

    while (paddedPrompts.length < segmentCount) {
      paddedPrompts.push(rawClipPrompts[rawClipPrompts.length - 1]);
    }

    return paddedPrompts;
  }

  return Array.from({ length: segmentCount }, () => fallbackPrompt);
};

// Robustly split a Veo response into individual segment prompts. The model is
// asked to use ###SEGMENT### separators but sometimes drops one (yielding N-1
// blocks) or uses "Segment N:" headers instead. We try both, then enforce the
// exact requested count so a 6-clip job never silently becomes 5.
const parseVeoSegmentPrompts = (text: string, segmentCount: number): string[] => {
  const cleaned = text
    .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();

  let parts = cleaned
    .split(/###\s*SEGMENT\s*###/gi)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length < segmentCount) {
    const byHeader = cleaned
      .split(/\n(?=(?:Segment|Clip)\s*\d+\s*[:.)–—-])/gi)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (byHeader.length > parts.length) {
      parts = byHeader;
    }
  }

  return finalizeMainFramePrompts(parts, segmentCount, cleaned);
};

const getMainFramePromptValidationIssues = (
  prompts: string[],
  businessType: string,
  educationEnvironmentMode: 'institution' | 'consultancy' | null
): string[] => {
  const issues: string[] = [];

  if (prompts.length <= 1) {
    return issues;
  }

  const normalizedPrompts = prompts.map(normalizePromptForComparison);
  if (new Set(normalizedPrompts).size < normalizedPrompts.length) {
    issues.push('Two or more clip prompts are nearly identical instead of using distinct real locations.');
  }

  const locationSignatures = prompts
    .map(getLocationAnchorSignature)
    .filter((signature) => signature.length > 0);

  if (locationSignatures.length >= 2 && new Set(locationSignatures).size < Math.max(2, Math.ceil(prompts.length / 2))) {
    issues.push('Too many clips appear to reuse the same location anchor instead of switching to a new real zone for each voice-over line.');
  }

  const combinedPrompts = prompts.join(' ').toLowerCase();
  if (containsAnyMarker(combinedPrompts, HOME_INTERIOR_MARKERS)) {
    issues.push('Some clip prompts drift into home-like, residential, lounge, or generic interior wording.');
  }

  if (businessType === 'education') {
    const expectedMarkers = educationEnvironmentMode === 'consultancy'
      ? CONSULTANCY_ENVIRONMENT_MARKERS
      : INSTITUTION_ENVIRONMENT_MARKERS;

    if (!containsAnyMarker(combinedPrompts, expectedMarkers)) {
      issues.push(
        educationEnvironmentMode === 'consultancy'
          ? 'Education consultancy prompts are missing counseling-office proof surfaces.'
          : 'Education institution prompts are missing campus or institute proof surfaces.'
      );
    }
  }

  if (!containsAnyMarker(combinedPrompts, REALISTIC_LOGO_SURFACE_MARKERS)) {
    issues.push('Logo placement language is missing believable installed signage surfaces.');
  }

  return issues;
};

// --- Poster-Only Mode: Extract business info only ---
/**
 * Hears the client's voice note(s) on their own — transcribed, understood, compared with the written
 * material — before any other step reads them. See prompts/voiceNote for why. Null when there is no
 * recording or it could not be understood; the caller then falls back to attaching the audio as before.
 */
export const understandVoiceInstructions = async (
  recordings: File[],
  context: { businessContent?: string; frameInstructions?: string },
): Promise<VoiceBrief | null> => {
  if (!recordings?.length || API_KEYS.length === 0) return null;
  try {
    const parts: any[] = [];
    for (let i = 0; i < recordings.length; i++) {
      parts.push({ inlineData: { mimeType: audioMimeTypeOf(recordings[i]), data: await fileToBase64(recordings[i]) } });
      parts.push({ text: `Voice note ${i + 1} of ${recordings.length}.` });
    }
    parts.push({ text: voiceNoteUserPrompt({ ...context, fileCount: recordings.length }) });
    const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: { systemInstruction: VOICE_NOTE_SYSTEM_PROMPT, responseMimeType: 'application/json' },
    }));
    return parseVoiceBrief(response.text || '');
  } catch (err) {
    console.warn('Voice-note understanding failed; attaching the recordings to extraction instead.', err);
    return null;
  }
};

/**
 * The voice note's part of an extraction request: the understood text when there is one, else the
 * recordings themselves with a MIME type the model accepts (see fileHelpers.audioMimeTypeOf).
 */
const voiceInstructionParts = async (recordings: File[], brief: VoiceBrief | null): Promise<any[]> => {
  if (!recordings?.length) return [];
  if (brief) {
    return [{ text: `CLIENT VOICE INSTRUCTIONS — heard and understood from the client's voice note (these are the client's own words; use every requirement):\n${voiceBriefAsText(brief)}` }];
  }
  const parts: any[] = [];
  for (let i = 0; i < recordings.length; i++) {
    parts.push({ inlineData: { mimeType: audioMimeTypeOf(recordings[i]), data: await fileToBase64(recordings[i]) } });
    parts.push({ text: `This is the Client's Voice Instructions (${i + 1} of ${recordings.length}). Listen to all of it, understand what the client is asking for, and capture every requirement, offer, name and instruction in Special Requirements.` });
  }
  return parts;
};

/**
 * The extraction, checked against what the member actually gave — see utils/businessFacts.
 *
 * Every contact number and address in the kit comes from the business profile, and the profile is a
 * model's reading of the member's text and files. It is rewritten here to carry only the numbers the
 * member typed (or that a card, flyer or premises photo could show) and only a real address, so no
 * later prompt ever sees an invented one to copy. The contact documents are the card, the flyers and
 * the premises photos — a number on a product packet is the manufacturer's, not the shop's.
 */
const verifyExtraction = (businessInfo: any, typedText: string, files: FileStore): { businessInfo: Record<string, unknown>; facts: BusinessFacts } => {
  const input = {
    typedText,
    hasContactDocuments: (files.visitingCard?.length || 0) + (files.flyersPosters?.length || 0) + (files.storeImage?.length || 0) > 0,
  };
  const facts = verifyBusinessFacts({ ...input, profile: businessInfo });
  if (facts.rejected.length > 0) console.info('Contact details the extraction reported that are NOT used (not verified):', facts.rejected);
  return { businessInfo: sanitizeBusinessProfile(businessInfo, facts, input), facts };
};

/** How the team's typed BUSINESS CONTENT is labelled for the model — the authoritative facts. */
const businessContentPart = (text: string) =>
  ({ text: `BUSINESS CONTENT typed by the team (authoritative — business details, offers, the call to action, contact information): ${text}` });

export const extractBusinessOnly = async (
  formData: AdFormData,
  files: FileStore,
  onProgress: (status: string, progress: number) => void
): Promise<GeneratedOutputs> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }

  const parts: any[] = [];
  /** Everything the member typed or said — what the extraction is checked against. */
  const typedChunks: string[] = [];

  if (formData.textInstructions) {
    parts.push(businessContentPart(formData.textInstructions));
    typedChunks.push(formData.textInstructions);
  }
  if (files.textInstructionsFile && files.textInstructionsFile.length > 0) {
    for (const textFile of files.textInstructionsFile) {
      const textContent = await readFileAsText(textFile);
      parts.push({ text: `Client Text File Content: ${textContent}` });
      typedChunks.push(textContent);
    }
  }
  if (files.logo) {
    parts.push({ inlineData: { mimeType: files.logo.type, data: await fileToBase64(files.logo) } });
    parts.push({ text: "This is the Business Logo. CRITICAL: Place this EXACT logo image as-is in the scene. Do NOT recreate, redesign, redraw, recolor, simplify, or modify this logo in ANY way. Use the attached image pixel-for-pixel." });
  }
  if (files.visitingCard && files.visitingCard.length > 0) {
    for (let i = 0; i < files.visitingCard.length; i++) {
      parts.push({ inlineData: { mimeType: files.visitingCard[i].type, data: await fileToBase64(files.visitingCard[i]) } });
      parts.push({ text: `This is the Visiting Card (${i === 0 ? 'Front' : 'Back'}).` });
    }
  }
  if (files.storeImage && files.storeImage.length > 0) {
    for (let i = 0; i < files.storeImage.length; i++) {
      parts.push({ inlineData: { mimeType: files.storeImage[i].type, data: await fileToBase64(files.storeImage[i]) } });
      parts.push({ text: `This is a Store/Office Image (${i + 1} of ${files.storeImage.length}).` });
    }
  }
  if (files.productImages && files.productImages.length > 0) {
    for (let i = 0; i < files.productImages.length; i++) {
      parts.push({ inlineData: { mimeType: files.productImages[i].type, data: await fileToBase64(files.productImages[i]) } });
      parts.push({ text: `This is a Product Image (${i + 1} of ${files.productImages.length}). Extract product categories, hero products, packaging cues, and the exact products that should influence the advertisement.` });
    }
  }
  if (files.voiceRecording && files.voiceRecording.length > 0) {
    const brief = await understandVoiceInstructions(files.voiceRecording, {
      businessContent: formData.textInstructions, frameInstructions: formData.frameInstructions,
    });
    if (brief?.transcript) typedChunks.push(brief.transcript);
    parts.push(...await voiceInstructionParts(files.voiceRecording, brief));
  }
  if (files.flyersPosters && files.flyersPosters.length > 0) {
    for (let i = 0; i < files.flyersPosters.length; i++) {
      parts.push({ inlineData: { mimeType: files.flyersPosters[i].type, data: await fileToBase64(files.flyersPosters[i]) } });
      parts.push({ text: `This is a Flyer/Offer Poster/Brochure (${i + 1} of ${files.flyersPosters.length}). Extract ALL business information, offers, services, contact details, and branding from this material.` });
    }
  }

  onProgress("Extracting business intelligence...", 30);

  const extractionResponse = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [...parts, { text: "Extract business info." }] }],
      config: { systemInstruction: EXTRACTION_SYSTEM_PROMPT, responseMimeType: "application/json" }
    });
  });

  const businessInfoText = extractionResponse.text || "{}";
  let businessInfo;
  try {
    businessInfo = JSON.parse(businessInfoText);
  } catch (e) {
    console.warn("Failed to parse JSON directly, using raw text", e);
    businessInfo = { raw: businessInfoText };
  }
  businessInfo = verifyExtraction(businessInfo, typedChunks.join('\n'), files).businessInfo;

  onProgress("Business info extracted. Ready for poster creation.", 100);

  return {
    businessInfo,
    mainFramePrompts: [],
    headerPrompt: '',
    posterPrompt: '',
    voiceOverScript: '',
    veoPrompts: [],
    hasProductImages: Boolean(files.productImages && files.productImages.length > 0),
    productImageCount: files.productImages ? files.productImages.length : 0,
    stockImagePrompts: null
  };
};

// --- Poster Creation: concept posters from the team's style library ---

/** How many concepts a poster run writes when nobody says otherwise. */
export const DEFAULT_POSTER_CONCEPT_COUNT = 3;

/**
 * Concept posters for a business: extract who they are, then write N distinct concepts in the
 * chosen style (or the best-fitting styles), each with a copy-paste image prompt.
 *
 * The logo and the product/premises photos are attached to the concept call as well as the
 * extraction: the art director can only build a metaphor out of "the client's real product" if it
 * can see the product. The logo is attached so it can judge the palette, and the prompt forbids it
 * from describing the logo — see services/prompts/posterConcept.
 */
export const generatePosterConcepts = async (
  formData: AdFormData,
  files: FileStore,
  onProgress: (status: string, progress: number) => void,
): Promise<GeneratedOutputs> => {
  const extracted = await extractBusinessOnly(formData, files, (step, progress) => onProgress(step, Math.min(45, progress * 0.45)));
  const businessInfo = extracted.businessInfo;

  const posterSize = formData.posterSize || DEFAULT_POSTER_SIZE;
  const styleId = formData.posterStyle || AUTO_POSTER_STYLE;
  const style = getPosterStyle(styleId);
  const occasion = (formData.posterOccasion || '').trim();
  const conceptCount = Math.max(1, Math.min(6, formData.posterConceptCount || DEFAULT_POSTER_CONCEPT_COUNT));
  const businessName = (formData.noLogo && formData.logoNameText?.trim()) || extractBusinessNameFromInfo(businessInfo);
  // Verified numbers only (utils/businessFacts) — one, two or three, exactly as the member gave them.
  const verified = factsFromProfile(businessInfo);
  const contacts = verified.phones.slice(0, MAX_LABEL_CONTACTS).map(p => p.display);
  const address = verified.address;

  onProgress(`Designing ${conceptCount} poster concept${conceptCount === 1 ? '' : 's'}${style ? ` — ${style.label}` : ''}...`, 55);

  const imageParts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
  if (files.logo) {
    imageParts.push({ inlineData: { mimeType: files.logo.type, data: await fileToBase64(files.logo) } });
    imageParts.push({ text: `This is the client's logo — for your eyes only. In the prompts call it "the attached logo" and never describe it.` });
  }
  for (const [i, f] of (files.productImages || []).slice(0, 4).entries()) {
    imageParts.push({ inlineData: { mimeType: f.type, data: await fileToBase64(f) } });
    imageParts.push({ text: `Product photo ${i + 1} — a real product this business sells. Build metaphors from what you see.` });
  }
  for (const [i, f] of (files.storeImage || []).slice(0, 3).entries()) {
    imageParts.push({ inlineData: { mimeType: f.type, data: await fileToBase64(f) } });
    imageParts.push({ text: `Premises photo ${i + 1} — the client's real shop/office.` });
  }

  const systemInstruction = POSTER_CONCEPT_SYSTEM_PROMPT({
    posterSize,
    style,
    occasion,
    conceptCount,
    textLanguage: formData.posterTextLanguage || 'English',
    hasLogo: !!files.logo,
    nameBoardText: formData.noLogo ? (formData.logoNameText || businessName) : undefined,
  });
  const userPrompt = POSTER_CONCEPT_USER_PROMPT({
    businessInfo,
    businessName,
    contacts,
    address,
    clientBrief: formData.textInstructions,
    occasion,
    conceptCount,
  });

  const runOnce = async (extraNote = '') => {
    const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [...imageParts, { text: userPrompt + extraNote }] }],
      config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.95 },
    }));
    return parsePosterConcepts(response.text || '', styleId);
  };

  let concepts = await runOnce();
  // A short reply is retried once, asking for exactly the missing number rather than starting over.
  if (concepts.length < conceptCount) {
    onProgress('Filling in the remaining concepts...', 80);
    const more = await runOnce(`\n\nYou returned ${concepts.length}. Return ${conceptCount} complete, different concepts this time.`).catch(() => []);
    if (more.length > concepts.length) concepts = more;
  }
  if (concepts.length === 0) {
    throw new Error('The poster concepts could not be read. Please try again.');
  }

  onProgress('Poster concepts ready.', 100);
  return {
    ...extracted,
    posterConcepts: finalizePosterConcepts(concepts, { posterSize, contacts, maxCount: conceptCount }),
  };
};

/** Rewrites one concept to the team's request, keeping the canvas, style and truth rules. */
export const refinePosterConcept = async (
  concept: PosterConcept,
  instruction: string,
  formData: AdFormData,
  businessInfo: unknown,
  hasLogo: boolean,
): Promise<PosterConcept> => {
  const posterSize = formData.posterSize || DEFAULT_POSTER_SIZE;
  const style = getPosterStyle(formData.posterStyle);
  const contacts = factsFromProfile(businessInfo).phones.slice(0, MAX_LABEL_CONTACTS).map(p => p.display);
  const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: [
      `CURRENT CONCEPT:\n${JSON.stringify(concept, null, 2)}`,
      `REQUESTED CHANGE:\n${instruction}`,
      `REAL PHONE NUMBERS (the only ones allowed): ${contacts.join(' , ') || 'none'}`,
      `BUSINESS INFORMATION:\n${JSON.stringify(businessInfo ?? {}, null, 2)}`,
    ].join('\n\n') }] }],
    config: {
      systemInstruction: POSTER_CONCEPT_REFINE_SYSTEM_PROMPT({
        posterSize, style, occasion: formData.posterOccasion, textLanguage: formData.posterTextLanguage, hasLogo,
      }),
      responseMimeType: 'application/json',
    },
  }));
  const [parsed] = parsePosterConcepts(response.text || '', concept.style);
  const next = parsed ?? normalizePosterConcept(concept, concept.style);
  if (!next) return concept;
  const [final] = finalizePosterConcepts([next], { posterSize, contacts });
  return final;
};

export interface GenerationOptions {
  includeProductsInHeader?: boolean;
  customScript?: string;
  onPartialResult?: (partial: GeneratedOutputs) => void;
}

// Clean script text: remove emojis, special decorative characters, normalize whitespace
const cleanScriptText = (text: string): string => {
  return text
    // Remove emoji sequences (Unicode emoji ranges)
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
    // Remove decorative special characters (★, •, ═, ║, ●, ◆, ▶, ◀, ♦, etc.)
    .replace(/[★☆●◆◇■□▪▫▶◀►◄♦♣♠♥♡✦✧✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋═║╔╗╚╝╠╣╩╦╬─│┌┐└┘├┤┬┴┼━┃┏┓┗┛┣┫┻┳╋▬▭▮▯△▽◁▷※¤§†‡‖‗‾⁂⁎⁑⁕⁖⁘⁙⁚⁛⁜⁝⁞]/g, '')
    // Remove multiple consecutive special punctuation (but keep basic . , ! ? : ;)
    .replace(/[~`@#$^&{}|<>\\]+/g, ' ')
    // Normalize multiple spaces/newlines
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const tokenizeWords = (text: string): string[] => {
  return text
    .replace(/[\[\]{}()<>:;,.!?"'`~@#$%^&*+=_|\\/\-]+/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean);
};

const isLongWordClip = (words: string[]): boolean => {
  if (words.length === 0) return false;
  const longWords = words.filter(w => w.length >= 9).length;
  const avgLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  return longWords >= 4 || avgLength >= 7;
};

const splitWordsEvenly = (words: string[], segmentCount: number): string[] => {
  if (segmentCount <= 0) return [];
  if (words.length === 0) return Array(segmentCount).fill('');

  const chunks: string[] = [];
  let cursor = 0;

  for (let i = 0; i < segmentCount; i++) {
    const remainingWords = words.length - cursor;
    const remainingSegments = segmentCount - i;
    const take = Math.max(1, Math.ceil(remainingWords / remainingSegments));
    chunks.push(words.slice(cursor, cursor + take).join(' ').trim());
    cursor += take;
  }

  return chunks;
};

const parseVoiceOverSegments = (script: string, segmentCount: number): string[] => {
  const normalized = cleanScriptText(script || '');
  if (!normalized) return Array(segmentCount).fill('');

  const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
  const timestampHeader = /^(\d+\s*-\s*\d+)\s*:\s*(.*)$/i;
  const segmentHeader = /^segment\s*\d+\s*:\s*(.*)$/i;
  const parsed: string[] = [];
  let current = '';
  let detectedStructuredLines = false;

  for (const line of lines) {
    const timeMatch = line.match(timestampHeader);
    const segmentMatch = line.match(segmentHeader);

    if (timeMatch || segmentMatch) {
      detectedStructuredLines = true;
      if (current.trim()) parsed.push(current.trim());
      current = (timeMatch ? timeMatch[2] : segmentMatch?.[1])?.trim() || '';
      continue;
    }

    if (/^full\s*script\s*:?$/i.test(line)) {
      continue;
    }

    if (detectedStructuredLines) {
      current = current ? `${current} ${line}` : line;
    }
  }

  if (current.trim()) parsed.push(current.trim());

  if (parsed.length > 0) {
    return parsed.slice(0, segmentCount);
  }

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  if (paragraphs.length >= segmentCount) {
    return paragraphs.slice(0, segmentCount);
  }

  const words = tokenizeWords(normalized);
  return splitWordsEvenly(words, segmentCount);
};

const enforceClipWordCount = (clipText: string): string => {
  let result = cleanScriptText(clipText)
    .replace(/\s+([,!?])/g, '$1')
    .trim();

  if (result && !/[.!?]$/.test(result)) {
    result += '.';
  }

  return result;
};

const normalizeVoiceOverSegments = (segments: string[], segmentCount: number): string[] => {
  const normalized = segments
    .map(s => cleanScriptText(s))
    .filter(Boolean)
    .slice(0, segmentCount);

  if (normalized.length === 0) {
    return Array(segmentCount).fill('');
  }

  while (normalized.length < segmentCount) {
    normalized.push(normalized[normalized.length - 1]);
  }

  return normalized.map(enforceClipWordCount);
};

const formatVoiceOverScript = (segments: string[]): string => {
  const clipLines = segments.map((segment, idx) => {
    const start = idx * 8;
    const end = start + 8;
    return `${start}-${end}: ${segment}`;
  });

  return clipLines.join('\n').trim();
};

const CTA_OR_CONTACT_PATTERN = /(కాల్|సంప్రదించ|నంబర్|ఫోన్|వాట్సాప్|సంప్రదింపు|కాంటాక్ట్|విజిట్)/;
const LATIN_OR_DIGIT_PATTERN = /[A-Za-z0-9]/;
const FINAL_SCREEN_CTA = "మరిన్ని వివరాల కోసం స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి.";
const STRUCTURED_SEGMENT_PATTERN = /^(\d+\s*-\s*\d+)\s*:|^segment\s*\d+\s*:/i;
const PHONE_DIGIT_WORD_PATTERN = /\b(జీరో|వన్|టూ|త్రీ|ఫోర్|ఫైవ్|సిక్స్|సెవెన్|ఎయిట్|నైన్)\b/g;
const NATIVE_DIGIT_WORD_PATTERN = /\b(సున్నా|ఒకటి|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|ఎనిమిది|తొమ్మిది)\b/g;
const MAX_VOICEOVER_REPAIR_PASSES = 2;

const getStructuredSegmentLineCount = (script: string): number => {
  return cleanScriptText(script)
    .split('\n')
    .map(line => line.trim())
    .filter(line => STRUCTURED_SEGMENT_PATTERN.test(line))
    .length;
};

const countPatternMatches = (text: string, pattern: RegExp): number => {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
};

const hasOverSeparatedDigitSpeech = (text: string): boolean => {
  const groups = text
    .split(',')
    .map(group => group.trim())
    .filter(Boolean);

  if (groups.length < 2) {
    return false;
  }

  const singleDigitGroups = groups.filter(group => countPatternMatches(group, PHONE_DIGIT_WORD_PATTERN) === 1).length;
  return singleDigitGroups >= groups.length - 1;
};

const hasAdjacentRepeatedWords = (text: string): boolean => {
  const words = tokenizeWords(text).map(word => word.toLowerCase());

  for (let index = 1; index < words.length; index++) {
    if (words[index] === words[index - 1]) {
      return true;
    }
  }

  return false;
};

/**
 * `everyday` turns on the hard-word check (see prompts/everydaySpeech) with the business's own names,
 * which are never flagged. Only for scripts the platform writes — a member's own pasted script, and
 * the Tools page's conversion loop, which rewrites the whole script per issue, are left without it.
 */
const validateVoiceOverSegments = (
  rawScript: string,
  segments: string[],
  segmentCount: number,
  language?: string,
  everyday?: { names: string[] },
  /** 1-based clip carrying the festival wish, when this ad has one — see prompts/festivalWish. */
  wishClip?: number,
): string[] => {
  const issues: string[] = [];
  const structuredSegmentCount = getStructuredSegmentLineCount(rawScript);
  const seenSegments = new Map<string, number>();

  if (structuredSegmentCount > 0 && structuredSegmentCount !== segmentCount) {
    issues.push(`Structured output contains ${structuredSegmentCount} clips instead of the required ${segmentCount}.`);
  }

  if (segments.length !== segmentCount) {
    issues.push(`Expected exactly ${segmentCount} clips but got ${segments.length}.`);
  }

  segments.forEach((segment, index) => {
    const clipNumber = index + 1;
    const words = tokenizeWords(segment);
    const isFinalClip = index === segmentCount - 1;

    if (!segment.trim()) {
      issues.push(`Clip ${clipNumber} is empty.`);
      return;
    }

    // The fixed words are Latin on purpose (utils/spokenNumbers) — they are not a script fault.
    if (!usesLatinScript(language) && LATIN_OR_DIGIT_PATTERN.test(withoutFixedWords(segment))) {
      issues.push(`Clip ${clipNumber} contains Latin letters or digits in spoken content.`);
    } else if (usesLatinScript(language) && /\d/.test(segment)) {
      issues.push(`Clip ${clipNumber} contains digits in spoken content.`);
    }

    if (!/[.!?]$/.test(segment.trim())) {
      issues.push(`Clip ${clipNumber} must end with spoken punctuation.`);
    }

    if (hasAdjacentRepeatedWords(segment)) {
      issues.push(`Clip ${clipNumber} contains repeated adjacent words.`);
    }

    // The band, not a single number — see utils/dialogueFormat.
    if (words.length < MIN_WORDS_PER_CLIP || words.length > MAX_WORDS_PER_CLIP) {
      issues.push(`Clip ${clipNumber} must contain ${MIN_WORDS_PER_CLIP}–${MAX_WORDS_PER_CLIP} spoken words, but it has ${words.length}.`);
    }

    if (!isFinalClip && CTA_OR_CONTACT_PATTERN.test(segment)) {
      issues.push(`Clip ${clipNumber} leaks CTA or contact language before the final clip.`);
    }

    // No spoken phone/contact numbers anywhere — the on-screen call CTA is used instead
    if (countPatternMatches(segment, PHONE_DIGIT_WORD_PATTERN) >= 2 || countPatternMatches(segment, NATIVE_DIGIT_WORD_PATTERN) >= 3) {
      issues.push(`Clip ${clipNumber} appears to speak a phone/contact number — remove all spoken numbers and use the on-screen call CTA instead.`);
    }

    // The presenter is on screen INSIDE the business, so no line may send the viewer elsewhere.
    const elsewhere = elsewhereIssue(clipNumber, segment);
    if (elsewhere) issues.push(elsewhere);

    const normalizedSegmentKey = cleanScriptText(segment).toLowerCase();
    const firstSeenClip = seenSegments.get(normalizedSegmentKey);
    if (typeof firstSeenClip === 'number') {
      issues.push(`Clip ${clipNumber} duplicates clip ${firstSeenClip}.`);
    } else {
      seenSegments.set(normalizedSegmentKey, clipNumber);
    }
  });

  if (everyday) issues.push(...hardWordIssues(segments, language, everyday.names));
  if (wishClip) issues.push(...wishAudienceIssues(segments[wishClip - 1] || '', wishClip, language));

  // Every ad must close with the on-screen call CTA (no spoken phone number). The exact wording
  // is only pinned for Telugu — every other language is told to write its own native equivalent
  // (see VOICEOVER_SYSTEM_PROMPT), so matching Telugu keywords there would fail permanently and
  // send every non-Telugu script through pointless repair passes.
  if (isTeluguScript(language)) {
    const finalClip = segments[segmentCount - 1] || '';
    if (!(finalClip.includes('స్క్రీన్') && finalClip.includes('కాల్'))) {
      issues.push(`Final clip must include the on-screen call CTA: ${FINAL_SCREEN_CTA}`);
    }
  }

  return issues;
};

const normalizeAndFormatVoiceOver = (script: string, segmentCount: number) => {
  const parsed = parseVoiceOverSegments(script, segmentCount);
  const segments = normalizeVoiceOverSegments(parsed, segmentCount);

  return {
    rawScript: script,
    parsed,
    segments,
    formatted: formatVoiceOverScript(segments)
  };
};

export const generateAdAssets = async (
  formData: AdFormData,
  files: FileStore,
  onProgress: (status: string, progress: number) => void,
  options: GenerationOptions = {}
): Promise<GeneratedOutputs> => {
  
  const { includeProductsInHeader = false, customScript, onPartialResult } = options;
  
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }

  /**
   * The client's voice note, heard first and on its own — see understandVoiceInstructions. Its text
   * goes into extraction and is merged into the business profile, so every later prompt hears it.
   */
  const voiceBrief = files.voiceRecording?.length
    ? (onProgress("Listening to the client's voice note...", 5), await understandVoiceInstructions(files.voiceRecording, {
        businessContent: formData.textInstructions, frameInstructions: formData.frameInstructions,
      }))
    : null;

  /** Everything the member typed or said — what the extraction is checked against (verifyExtraction). */
  const typedChunks: string[] = voiceBrief?.transcript ? [voiceBrief.transcript] : [];

  // Helper to prepare parts
  const prepareParts = async () => {
    const parts: any[] = [];
    
    // The team's BUSINESS CONTENT box — the facts the ad must carry.
    if (formData.textInstructions) {
      parts.push(businessContentPart(formData.textInstructions));
      typedChunks.push(formData.textInstructions);
    }

    // Add text file content
    if (files.textInstructionsFile && files.textInstructionsFile.length > 0) {
      for (const textFile of files.textInstructionsFile) {
        const textContent = await readFileAsText(textFile);
        parts.push({ text: `Client Text File Content: ${textContent}` });
        typedChunks.push(textContent);
      }
    }

    // Process Logo
    if (files.logo) {
      parts.push({
        inlineData: {
          mimeType: files.logo.type,
          data: await fileToBase64(files.logo)
        }
      });
      parts.push({ text: "This is the Business Logo. CRITICAL: Place this EXACT logo image as-is in the scene. Do NOT recreate, redesign, redraw, recolor, simplify, or modify this logo in ANY way. Use the attached image pixel-for-pixel." });
    }

    // Process Visiting Card
    if (files.visitingCard && files.visitingCard.length > 0) {
      for (let i = 0; i < files.visitingCard.length; i++) {
        parts.push({
          inlineData: {
            mimeType: files.visitingCard[i].type,
            data: await fileToBase64(files.visitingCard[i])
          }
        });
        parts.push({ text: `This is the Visiting Card (${i === 0 ? 'Front' : 'Back'}).` });
      }
    }

    // Process Store Images
    if (files.storeImage && files.storeImage.length > 0) {
      for (let i = 0; i < files.storeImage.length; i++) {
        parts.push({
          inlineData: {
            mimeType: files.storeImage[i].type,
            data: await fileToBase64(files.storeImage[i])
          }
        });
        parts.push({ text: `This is a Store/Office Image (${i + 1} of ${files.storeImage.length}).` });
      }
    }

    // Process Product Images
    if (files.productImages && files.productImages.length > 0) {
      for (let i = 0; i < files.productImages.length; i++) {
        parts.push({
          inlineData: {
            mimeType: files.productImages[i].type,
            data: await fileToBase64(files.productImages[i])
          }
        });
        parts.push({ text: `This is a Product Image (${i + 1} of ${files.productImages.length}). Extract product categories, hero products, packaging cues, and the exact products that should influence the advertisement.` });
      }
    }

    // The voice note — its understood text, or the recordings when understanding failed.
    parts.push(...await voiceInstructionParts(files.voiceRecording || [], voiceBrief));

    // Process Flyers / Offer Posters / Brochures
    if (files.flyersPosters && files.flyersPosters.length > 0) {
      for (let i = 0; i < files.flyersPosters.length; i++) {
        parts.push({
          inlineData: {
            mimeType: files.flyersPosters[i].type,
            data: await fileToBase64(files.flyersPosters[i])
          }
        });
        parts.push({ text: `This is a Flyer/Offer Poster/Brochure (${i + 1} of ${files.flyersPosters.length}). Extract ALL business information, offers, services, contact details, and branding from this material.` });
      }
    }

    return parts;
  };

  // Retry helper for critical sections (with API fallback)
  const generateWithRetry = async (
    parts: any[], 
    systemPrompt: string, 
    sectionName: string,
    maxRetries: number = 2,
    config?: any
  ): Promise<string> => {
    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await callWithFallback(async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts }],
            config: { systemInstruction: systemPrompt, ...config }
          });
        });
        const text = response.text;
        if (text && text.trim().length > 50) {
          return text;
        }
        // If response is too short/empty, retry
        console.warn(`${sectionName} attempt ${attempt + 1}: Response too short (${text?.length || 0} chars), retrying...`);
        lastError = new Error(`Empty or too-short response for ${sectionName}`);
      } catch (err) {
        console.warn(`${sectionName} attempt ${attempt + 1} failed:`, err);
        lastError = err;
        if (attempt < maxRetries) {
          // Brief pause before retry
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw lastError || new Error(`Failed to generate ${sectionName} after ${maxRetries + 1} attempts`);
  };

  const fileParts = await prepareParts();

  // --- Step 1: Business Info Extraction ---
  onProgress("Extracting business intelligence...", 10);
  
  // We use generateContent with the system prompt and all files
  const extractionResponse = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [
          { role: 'user', parts: [ ...fileParts, { text: "Extract business info." } ] }
      ],
      config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          responseMimeType: "application/json"
      }
    });
  });

  const businessInfoText = extractionResponse.text || "{}";
  let businessInfo;
  try {
    businessInfo = JSON.parse(businessInfoText);
  } catch (e) {
    console.warn("Failed to parse JSON directly, using raw text", e);
    businessInfo = { raw: businessInfoText };
  }
  // The client's own words travel with the profile, so the script, frames and label read them too.
  if (voiceBrief && businessInfo && typeof businessInfo === 'object') {
    businessInfo = { ...businessInfo, clientVoiceInstructions: voiceBriefForProfile(voiceBrief) };
  }
  // Only verified contact numbers and a real address from here on — every later prompt reads this.
  businessInfo = verifyExtraction(businessInfo, typedChunks.join('\n'), files).businessInfo;

  const hasProductImages = files.productImages && files.productImages.length > 0;
  const productImageCount = hasProductImages ? files.productImages.length : 0;

  // Shared snapshot for progressive partial results. Merging patches keeps emissions
  // correct even when later steps (main frame, poster, veo) finish concurrently.
  const partial: any = {
    businessInfo,
    mainFramePrompts: [],
    headerPrompt: '',
    posterPrompt: '',
    voiceOverScript: '',
    veoPrompts: [],
    hasProductImages,
    productImageCount,
    stockImagePrompts: null
  };
  const emitPartial = (patch: Record<string, any>) => {
    Object.assign(partial, patch);
    if (onPartialResult) onPartialResult({ ...partial });
  };

  // Emit partial result: businessInfo extracted
  emitPartial({});

  // --- Step 2: Voice Over Script ---
  // --- Step 1b: the core message, decided before the script is written (prompts/coreMessage) ---
  onProgress("Finding the client's core message...", 15);
  const coreMessage = await deriveCoreMessage(businessInfo, formData);
  emitPartial({ coreMessage });

  onProgress(customScript ? "Processing custom script..." : "Writing Voice Over script...", 20);

  // ── Special-category (cartoon duo) ad ───────────────────────────────────────────────────────
  // A pack swaps in the two-character script/frame/video prompts. When no pack is selected this
  // is null and every line below behaves exactly as it always has.
  const pack = packFor(formData);
  const packSpeakerList = pack ? packSpeakers(pack) : [];
  let dialogueClips: DialogueClip[] = [];

  // A business-provided script pasted in the `clip-1[0-8sec]: …` format is authoritative: its
  // clips are used verbatim (never re-segmented or re-worded), and its clip count — not the
  // Video Duration dropdown — decides how many main-frame and Veo prompts get generated, so the
  // attached script lands in the Generated Assets exactly as the business wrote it. A special-category
  // script with its `[Speaker]:` lines is read the same way, so its clip count wins too.
  const preSplitCustomClips = customScript?.trim() ? parseLabeledClips(customScript) : [];
  const pastedDialogue = pack && customScript?.trim() ? parseDialogueClips(customScript, packSpeakerList) : [];
  const segmentCount = pastedDialogue.length > 0
    ? pastedDialogue.length
    : preSplitCustomClips.length > 0
      ? preSplitCustomClips.length
      : Math.round(formData.duration / 8);
  const effectiveDuration = segmentCount * CLIP_SECONDS;

  /**
   * Everyday words (prompts/everydaySpeech): hard words are checked and repaired, and written verb
   * endings are made spoken, in every script the platform writes. A member's own script keeps the
   * member's own words.
   */
  const everyday = customScript?.trim()
    ? undefined
    : { names: [coreMessage?.businessName, coreMessage?.place].filter(Boolean) as string[] };
  const spoken = (script: string) => (everyday ? toSpokenEndings(script, formData.language) : script);
  let voiceOverScript: string;
  let parsedSegments: string[];

  /**
   * The town this business is in — the one thing that makes a local ad feel local.
   *
   * Resolved once, from the profile the extractor already produced, and threaded through the script
   * prompt, its repair pass and its validation. Empty when the profile genuinely doesn't say where
   * the business is, in which case no place is mentioned anywhere rather than invented.
   */
  const placeName = pack ? resolvePlaceName(businessInfo) : "";

  /**
   * That town written the way it will actually be SPOKEN.
   *
   * The script is in Telugu script and the profile holds "Bodhan" in Latin, so neither the prompt
   * nor a validity check can work from the Latin form alone: the model transliterates it a
   * different way each run (బోధన్ / బోదన్ / బోధన), which is the same drift that made the characters'
   * own names unstable. Fixing the spelling up front makes the instruction exact and the check
   * possible. A failure here is not fatal — the Latin form still goes into the prompt.
   */
  const resolveSpokenPlace = async (): Promise<string> => {
    const lang = (formData.language || "Telugu").trim();
    if (!placeName || !lang || lang.toLowerCase() === "english") return "";
    try {
      const res = await callWithFallback(async (ai, model) => ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text:
          `Write the Indian place name "${placeName}" in ${lang} script, exactly as a local person `
          + `pronounces it. Reply with the name only — no explanation, no punctuation, no Latin letters.` }] }],
      }));
      const first = (res.text || "").trim().split(/\r?\n/)[0] || "";
      const cleaned = first.replace(/["'`.,:;!?()\[\]]/g, "").trim();
      // A reply that came back in Latin letters is the model refusing to transliterate, not a
      // spelling — using it would put English letters into a Telugu script.
      return cleaned && !/[A-Za-z]/.test(cleaned) ? cleaned : "";
    } catch {
      return "";
    }
  };

  /**
   * Generate → validate → repair, for the two-character script. Mirrors the standard loop.
   * `feedback` is the quality gate's report on an earlier draft, when this is a second draft.
   */
  const generateCharacterDialogue = async (feedback = ''): Promise<DialogueClip[]> => {
    if (!pack) return [];
    /** Key AND display name, so a script that labels lines `[Chhota Bheem]:` still resolves. */
    const speakerVocabulary = packSpeakerList;
    /**
     * The characters' names have one fixed spelling in the spoken language. Applied to every
     * script that enters here — generated, repaired, or pasted — because the point is that the
     * same character is never called two different things, whatever the source.
     */
    const fixNames = (clips: DialogueClip[]) => applyNameSpellings(clips, packNameSpellings(pack, formData.language));
    /**
     * Each character's name and every spelling of it, so "both names, each exactly once" is
     * enforced per character rather than merely requested. A single total would let a script say
     * one name twice and the other never and still look compliant.
     */
    const spellings = packNameSpellings(pack, formData.language);
    /**
     * Human casts have role labels, not names — "Friend" and "Host" are how the script tells the two
     * people apart, and requiring either to be said out loud made the two women call each other
     * "Friend". Only a named character (Motu, Hanuman) has a name the audience must hear.
     */
    const characterNames = isHumanPack(pack) ? [] : packSpeakerList.map(speaker => ({
      name: speaker.name,
      tokens: [
        speaker.name,
        ...spellings.filter(s => s.name === speaker.name).map(s => s.spelling),
      ],
    }));
    /**
     * A member's own script is used word for word — see utils/customScript.
     *
     * Already in speaker form: exactly as written (the characters' names are not even respelt; the
     * member chose them). A single-speaker category needs no speaker lines, so its clips — or its
     * unlabelled text, cut at sentence boundaries — become that character's lines unchanged. A
     * two-speaker category cannot guess who says which sentence, and guessing is how lines landed in
     * the wrong character's mouth; it used to throw the script away and write a new one, so now it
     * asks for the speaker lines instead.
     */
    if (customScript?.trim()) {
      if (pastedDialogue.length > 0) {
        return pastedDialogue.map(clip => clip.map(line => ({ ...line, text: verbatimScriptText(line.text) })));
      }
      if (packSpeakerList.length === 1) {
        const texts = preSplitCustomClips.length > 0
          ? preSplitCustomClips.map(verbatimScriptText)
          : splitScriptVerbatim(customScript, segmentCount);
        return texts.map(text => [{ speaker: packSpeakerList[0].key, text }]);
      }
      const [a, b] = packSpeakerList;
      throw new Error(
        `Your script is used word for word, so a two-person ad needs to know who says each line. `
        + `Write every clip like this and paste it again:\n\nclip-1[0-8sec]:\n[${a.name}]: …\n[${b.name}]: …\nclip-2[8-16sec]:\n[${a.name}]: …\n[${b.name}]: …`,
      );
    }

    const spokenPlace = await resolveSpokenPlace();
    /**
     * Which clip has to carry the town.
     *
     * Clip 1 in a normal ad, where the hook names the business. A Festival Wishes ad spends clip 1
     * on the greeting alone — no product, no offer and no address — so the town moves down to the
     * clip where the ad turns into a promotion. Validating clip 1 for it would have failed every
     * correct festival script and sent it into the repair loop to have the wish written out again.
     */
    const townClip = formData.adType === 'festival' && segmentCount > 1 ? 2 : 1;
    /**
     * The town has to be SAID, so it is validated rather than merely asked for. Both spellings
     * count: the native one is what the script should contain, and the Latin one catches a script
     * that named the place but ignored the transliteration.
     */
    const requiredPhrases = placeName
      ? [{
          label: `The town "${placeName}"`,
          tokens: [placeName, spokenPlace].filter(Boolean),
          clip: townClip,
          hint: `Put it in ${packSpeakerList[1]?.name ?? "the second character"}'s line, beside the `
            + `business's name${spokenPlace ? `, spelled exactly "${spokenPlace}"` : ""}, and nowhere else.`,
        }]
      : [];
    /**
     * A festival ad greets the business's own people by name — మిత్రులు, శ్రేయోభిలాషులు, కస్టమర్లు —
     * so each group is required in the wish clip, the same way the town is required in its own.
     */
    if (formData.adType === 'festival' && isTeluguScript(formData.language)) {
      for (const group of WISH_AUDIENCE_TELUGU) {
        requiredPhrases.push({
          label: `The ${group.english} in the wish ("${group.spoken}")`,
          tokens: [group.stem],
          clip: 1,
          hint: `The wish greets all three: "${WISH_AUDIENCE_TELUGU.map((g) => g.spoken).join(", ")}".`,
        });
      }
    }
    /**
     * Validated against the budget for THIS cast.
     *
     * The default bands assume two speakers: 18-20 words a clip, 8-12 a line. On a single-speaker
     * entry — a deity, a solo cartoon, the owner's own face — the one line has to satisfy both,
     * which nothing can. Every clip failed, every script fell into the repair loop, and the repair
     * prompt re-imposed the same impossible pair. See wordBudgetFor.
     */
    const budget = wordBudgetFor(packSpeakerList.length);
    const speakerName = (key: string) => packSpeakerList.find(s => s.key === key)?.name ?? key;
    // The town, in both spellings, joins the business's names: a name is never a hard word.
    const ownNames = [...(everyday?.names ?? []), placeName, spokenPlace].filter(Boolean) as string[];
    /*
     * A human cast has role labels, not names — Girl, Boy, Friend, Host. Scripts came back with the
     * two of them addressing each other by the label, in Telugu, which reads to a client like a
     * template nobody finished. The pack text asked for it not to happen; this is what checks it, so
     * the repair pass rewrites the line instead of it being delivered.
     */
    const forbiddenNames = isHumanPack(pack)
      ? packSpeakerList.map(speaker => ({
          name: speaker.name,
          tokens: [
            speaker.name,
            ...(pack.characters.find(c => c.key === speaker.key)?.labelSpellings ?? []),
          ],
        }))
      : [];
    const checkDialogue = (clips: DialogueClip[]) =>
      validateDialogueClips(clips, segmentCount, packSpeakerList, {
        characterNames,
        forbiddenNames,
        requiredPhrases,
        minWordsPerClip: budget.minClip,
        maxWordsPerClip: budget.maxClip,
        minWordsPerLine: budget.minLine,
        maxWordsPerLine: budget.maxLine,
      }).concat(dialogueHardWordIssues(clips, formData.language, ownNames, speakerName))
        // The characters are standing inside the business in every frame — see utils/speakingPosition.
        .concat(clips.flatMap((clip, i) => clip
          .map(line => elsewhereIssue(i + 1, line.text, speakerName(line.speaker)))
          .filter((issue): issue is string => !!issue)));
    /** Written verb endings made spoken, in code — see toSpokenEndings. */
    const spokenLines = (clips: DialogueClip[]): DialogueClip[] =>
      clips.map(clip => clip.map(line => ({ ...line, text: toSpokenEndings(line.text, formData.language) })));

    // The spelling the script must use: the native form when we could get one, else the Latin name.
    const promptPlace = spokenPlace || placeName;

    const systemPrompt = CHARACTER_VOICEOVER_SYSTEM_PROMPT(
      pack, effectiveDuration, segmentCount, formData.adType, formData.festivalName, formData.language, promptPlace,
      coreMessage,
    );
    const userPrompt = `Write the ${segmentCount}-clip cartoon dialogue script for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName} (clip 1 is the wishes on behalf of the business and sells nothing)` : ''}
  ${placeName ? `TOWN / VILLAGE (must be spoken once, in clip ${townClip}): ${placeName}` : ''}
  DURATION: ${effectiveDuration} seconds (${segmentCount} clips of ${CLIP_SECONDS} seconds)`;

    const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userPrompt + feedback }] }],
      config: { systemInstruction: systemPrompt },
    }));

    let clips = spokenLines(fixNames(parseDialogueClips(response.text || '', speakerVocabulary)));
    let issues = checkDialogue(clips);

    for (let pass = 0; pass < MAX_VOICEOVER_REPAIR_PASSES && issues.length > 0; pass++) {
      const repairPrompt = `Repair this cartoon dialogue script using only verified business facts.

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

CURRENT SCRIPT:
${formatDialogueScript(clips, packSpeakerList)}

VALIDATION ISSUES:
${issues.map(issue => `- ${issue}`).join('\n')}

Return only the repaired ${segmentCount} clips.`;

      const repaired = await callWithFallback(async (ai, model) => ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: repairPrompt }] }],
        config: {
          systemInstruction: CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(
            pack, effectiveDuration, segmentCount, formData.language, promptPlace,
            formData.adType, formData.festivalName,
          ),
        },
      }));

      const next = spokenLines(fixNames(parseDialogueClips(repaired.text || '', speakerVocabulary)));
      // Only accept a repair that genuinely improves things — a worse rewrite is discarded.
      const nextIssues = checkDialogue(next);
      if (next.length > 0 && nextIssues.length < issues.length) {
        clips = next;
        issues = nextIssues;
      } else break;
    }

    /**
     * Whatever is still wrong inside individual clips — a clip under the 18-word floor, one line too
     * short — is fixed clip by clip, the same way a normal ad's script is (repairFailingClips). The
     * whole-script repair above gave up on a 16-word closing clip in live testing; this edits only that
     * clip, shows the model its lines counted, and keeps any fix that gets closer to the band.
     */
    const nameOfKey = new Map(packSpeakerList.map(s => [s.key, s.name]));
    const distanceOf = (list: DialogueClip[]) => wordBandDistance(
      list.map(c => c.reduce((sum, l) => sum + countSpokenWords(l.text), 0)), budget.minClip, budget.maxClip,
    );
    const speakerKeyOf = (raw: string, position: number) => {
      const t = raw.trim().toLowerCase();
      return packSpeakerList.find(s => s.key === t || s.name.toLowerCase() === t)?.key ?? packSpeakerList[position]?.key ?? t;
    };
    /**
     * One wasted pass is not a reason to give up.
     *
     * A live run finished with two clips at 17 words because the first pass came back no better and
     * the loop stopped there. Counting words in Telugu script is exactly what these models are worst
     * at, and asking the same clip again usually lands it — so a pass that improves nothing costs a
     * strike, and only the second strike in a row ends the repair.
     */
    let barren = 0;
    for (let pass = 0; pass < MAX_VOICEOVER_REPAIR_PASSES + 2 && issues.length > 0 && barren < 2; pass++) {
      const targets = clipIndexesFromIssues(issues, segmentCount);
      if (targets.length === 0 || clips.length !== segmentCount) break;
      const userPrompt = `SCRIPT (the whole script, for context):
${clips.map((c, i) => `Clip ${i + 1}:\n${c.map(l => `  [${nameOfKey.get(l.speaker) ?? l.speaker}]: ${l.text}`).join('\n')}`).join('\n\n')}

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

EDIT PLAN — fix these clips only, keeping their meaning and both speakers:
${targets.map(i => `- Clip ${i + 1}: ${repairDirection(issuesForClip(issues, i, segmentCount), budget.minClip, budget.maxClip)}
  Its lines as they stand — ${clips[i].map(l => `${nameOfKey.get(l.speaker) ?? l.speaker}: ${numberedWords(l.text.split(/\s+/).filter(Boolean))}`).join('  |  ')}
  The clip must total ${budget.minClip}–${budget.maxClip} words. Count your rewritten lines the same way before you return them.`).join('\n')}

Return ONLY the JSON for clip${targets.length === 1 ? '' : 's'} ${targets.map(i => i + 1).join(', ')}.`;
      try {
        const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction: buildLanguageDirective(formData) + VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({
              language: formData.language || 'Telugu',
              clipCount: segmentCount,
              adType: formData.adType,
              festivalName: formData.festivalName,
              brief: coreMessage,
              speakers: packSpeakerList,
            }),
            responseMimeType: 'application/json',
          },
        }));
        const edits = new Map([...parseClipDialogueEdits(response.text || '', targets)].map(([i, ls]) =>
          [i, ls.map((l, p) => ({ speaker: speakerKeyOf(l.speaker, p), text: l.text }))] as [number, DialogueClip]));
        if (edits.size === 0) break;
        const candidate = spokenLines(fixNames(mergeClipEdits(clips, edits)));
        const candidateIssues = checkDialogue(candidate);
        if (!isBetterRepair({ issues, distance: distanceOf(clips) }, { issues: candidateIssues, distance: distanceOf(candidate) })) {
          barren += 1;
          continue;
        }
        barren = 0;
        clips = candidate;
        issues = candidateIssues;
      } catch (err) {
        console.warn('Clip-level dialogue repair failed; keeping the script as it was.', err);
        break;
      }
    }

    if (issues.length > 0) console.warn('Character dialogue issues remain after repair:', issues);
    return clips;
  };

  /**
   * Fixes ONLY the clips that failed validation, and keeps a fix only if it leaves fewer problems.
   *
   * The whole-script repair below rewrites every clip to fix one, which is how a script with a
   * perfect clip 1 and one short closing line could come back with clip 1's message gone. And it
   * accepted whatever it got back, better or worse. Clip-scoped problems — word counts, a leaked call
   * to action, spoken digits — are now repaired clip by clip with the same edit contract a member's
   * refine uses, with the direction and size of each word-count fix spelled out.
   */
  const repairFailingClips = async (current: ReturnType<typeof normalizeAndFormatVoiceOver>, issues: string[]) => {
    let best = current;
    let bestIssues = issues;
    const distanceOf = (segments: string[]) =>
      wordBandDistance(segments.map(s => tokenizeWords(s).length), MIN_WORDS_PER_CLIP, MAX_WORDS_PER_CLIP);
    let bestDistance = distanceOf(best.segments);
    let barren = 0;
    for (let pass = 0; pass < MAX_VOICEOVER_REPAIR_PASSES + 2 && bestIssues.length > 0 && barren < 2; pass++) {
      const targets = clipIndexesFromIssues(bestIssues, segmentCount);
      if (targets.length === 0 || best.segments.length !== segmentCount) break;
      const systemInstruction = buildLanguageDirective(formData) + VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({
        language: formData.language || 'Telugu',
        clipCount: segmentCount,
        adType: formData.adType,
        festivalName: formData.festivalName,
        brief: coreMessage,
      });
      const userPrompt = `SCRIPT (the whole script, for context):
${best.segments.map((s, i) => `Clip ${i + 1}: ${s}`).join('\n')}

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

EDIT PLAN — fix these clips only, keeping their meaning:
${targets.map(i => `- Clip ${i + 1}: ${repairDirection(issuesForClip(bestIssues, i, segmentCount), MIN_WORDS_PER_CLIP, MAX_WORDS_PER_CLIP)}
  Its words as they stand — ${numberedWords(tokenizeWords(best.segments[i]))}
  Count your rewritten clip the same way before you return it.`).join('\n')}

Return ONLY the JSON for clip${targets.length === 1 ? '' : 's'} ${targets.map(i => i + 1).join(', ')}.`;
      try {
        const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: { systemInstruction, responseMimeType: 'application/json' },
        }));
        const edits = new Map([...parseClipTextEdits(response.text || '', targets)].map(([i, t]) => [i, cleanScriptText(t)] as [number, string]));
        if (edits.size === 0) break;
        const merged = mergeClipEdits(best.segments, edits);
        const candidate = normalizeAndFormatVoiceOver(spoken(formatVoiceOverScript(merged)), segmentCount);
        const candidateIssues = validateVoiceOverSegments(candidate.rawScript, candidate.segments, segmentCount, formData.language, everyday, formData.adType === 'festival' ? 1 : undefined);
        const candidateDistance = distanceOf(candidate.segments);
        // Keep a fix that gets closer even when it does not clear the issue outright; stop only when a
        // pass makes nothing better.
        if (!isBetterRepair({ issues: bestIssues, distance: bestDistance }, { issues: candidateIssues, distance: candidateDistance })) {
          barren += 1;
          continue;
        }
        barren = 0;
        best = candidate;
        bestIssues = candidateIssues;
        bestDistance = candidateDistance;
      } catch (err) {
        console.warn('Clip-level voice-over repair failed; keeping the script as it was.', err);
        break;
      }
    }
    return { normalized: best, issues: bestIssues };
  };

  const applyVoiceOverRepairIfNeeded = async (candidateScript: string) => {
    let normalizedVoiceOver = normalizeAndFormatVoiceOver(spoken(candidateScript), segmentCount);
    let voiceOverIssues = validateVoiceOverSegments(normalizedVoiceOver.rawScript, normalizedVoiceOver.segments, segmentCount, formData.language, everyday, formData.adType === 'festival' ? 1 : undefined);

    // Problems inside clips are fixed clip by clip; only a script-level problem (a wrong clip count)
    // still needs the whole script rewritten.
    const scriptLevel = (issues: string[]) => issues.some(i => !/^(Clip \d+|Final clip)\b/.test(i));
    if (voiceOverIssues.length > 0 && !scriptLevel(voiceOverIssues)) {
      const fixed = await repairFailingClips(normalizedVoiceOver, voiceOverIssues);
      normalizedVoiceOver = fixed.normalized;
      voiceOverIssues = fixed.issues;
    }

    for (let pass = 0; pass < MAX_VOICEOVER_REPAIR_PASSES && voiceOverIssues.length > 0 && scriptLevel(voiceOverIssues); pass++) {
      const repairSystemPrompt = buildLanguageDirective(formData) + VOICEOVER_REPAIR_SYSTEM_PROMPT(effectiveDuration, segmentCount, formData.adType, formData.festivalName, formData.language, coreMessage);
      const repairUserPrompt = `Repair this ${formData.language || 'Telugu'} voice-over script using only verified business facts.

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

CURRENT SCRIPT:
${normalizedVoiceOver.formatted}

VALIDATION ISSUES:
${voiceOverIssues.map(issue => `- ${issue}`).join('\n')}

Return only the repaired ${segmentCount} clip lines.`;

      const repairResponse = await callWithFallback(async (ai, model) => {
        return await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: repairUserPrompt }] }],
          config: { systemInstruction: repairSystemPrompt }
        });
      });

      normalizedVoiceOver = normalizeAndFormatVoiceOver(spoken(repairResponse.text || normalizedVoiceOver.formatted), segmentCount);
      voiceOverIssues = validateVoiceOverSegments(normalizedVoiceOver.rawScript, normalizedVoiceOver.segments, segmentCount, formData.language, everyday, formData.adType === 'festival' ? 1 : undefined);
    }

    // Whatever the whole-script repair left inside individual clips gets the clip-level fix too.
    if (voiceOverIssues.length > 0 && !scriptLevel(voiceOverIssues)) {
      const fixed = await repairFailingClips(normalizedVoiceOver, voiceOverIssues);
      normalizedVoiceOver = fixed.normalized;
      voiceOverIssues = fixed.issues;
    }

    if (voiceOverIssues.length > 0) {
      console.warn('Voice-over validation issues remain after repair:', voiceOverIssues);
    }

    return normalizedVoiceOver;
  };

  // Native-speaker linguistic QA / self-refine pass (see VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT
  // in prompts.ts for the full rationale). applyVoiceOverRepairIfNeeded only enforces MECHANICAL
  // rules (word count, CTA placement, forbidden characters) — it cannot judge whether the script
  // actually sounds native, modern, and persuasive rather than translated or literary. This runs
  // a second model call acting as a strict native-speaker copy editor that rewrites the script if
  // needed, then hands it back through the mechanical repair pass again in case the rewrite
  // drifted from the word-count/format contract the rest of the app depends on. Only applied to
  // AI-generated scripts — never to a user's own pasted custom script, which must keep the user's
  // original wording untouched.
  /**
   * A second pass runs only when the first one's own clip-1 test still failed on its corrected
   * script — the case this review now exists for. A clean first pass costs one call, as before.
   */
  const MAX_QUALITY_REVIEW_PASSES = 2;
  const messageClip = formData.adType === 'festival' && segmentCount > 1 ? 2 : 1;
  const runVoiceOverQualityReview = async (candidateFormatted: string, mustFix: string[] = []): Promise<string> => {
    let reviewed = candidateFormatted;
    for (let pass = 0; pass < MAX_QUALITY_REVIEW_PASSES; pass++) {
      try {
        const reviewResponse = await callWithFallback(async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text:
`CANDIDATE SCRIPT (already mechanically checked — ${segmentCount} clips, ${MIN_WORDS_PER_CLIP}–${MAX_WORDS_PER_CLIP} words each):
${reviewed}

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}
${mustFix.length ? `
A STRICT QUALITY CHECK FOUND THESE PROBLEMS — FIX EVERY ONE, and keep everything that already works:
${mustFix.map(m => `- ${m}`).join('\n')}
` : ''}
Review it now and return the JSON verdict.` }] }],
            config: { systemInstruction: VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT(formData.language, coreMessage, messageClip), responseMimeType: "application/json" }
          });
        });
        const parsed = JSON.parse(reviewResponse.text || '{}');
        if (parsed && typeof parsed.correctedScript === 'string' && parsed.correctedScript.trim()) {
          reviewed = parsed.correctedScript;
          if (Array.isArray(parsed.issues) && parsed.issues.length > 0) {
            console.info(`Voice-over quality review (pass ${pass + 1}) — score ${parsed.score ?? '?'}, fixed:`, parsed.issues);
          }
          // Done when the corrected script lands the message. An explicit failed clip test earns one
          // more pass on the corrected script; a review that does not report the test is trusted.
          if (parsed.messageClipTest?.pass !== false) break;
        } else {
          break; // malformed response — keep the mechanically-repaired script rather than risk corrupting it
        }
      } catch (err) {
        console.warn('Voice-over quality review failed; keeping the mechanically-repaired script.', err);
        break;
      }
    }
    return reviewed;
  };

  /*
    ── The QUALITY GATE (services/prompts/scriptQa, utils/scriptQa) ────────────────────────────────
    Every script the platform writes — single voice or a cast — is judged by a separate model that
    never rewrites: it checks every claim against the business facts and scores language, persuasion,
    clarity, relevance and how it speaks. Code decides from the scores: ship it, polish it with the
    judge's exact problems, or write a NEW draft told what the last one got wrong. Each new draft is
    judged again, and the best of up to three ships. A member's own script is never judged or touched.
    A judge that cannot run (quota, a broken reply) never blocks the ad — the draft ships as it is.
  */
  const MAX_SCRIPT_DRAFTS = 3;
  let scriptQa: ScriptQaSummary | null = null;
  const judgeScript = async (script: string): Promise<ScriptQaReport | null> => {
    try {
      const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `SCRIPT TO JUDGE:
${script}

BUSINESS INFORMATION (the only facts the script may state):
${JSON.stringify(businessInfo, null, 2)}

Judge it now and return the JSON.` }] }],
        config: {
          systemInstruction: SCRIPT_QA_SYSTEM_PROMPT({
            language: formData.language,
            adType: formData.adType,
            festivalName: formData.festivalName,
            clipCount: segmentCount,
            speakers: packSpeakerList.map(sp => sp.name),
            brief: coreMessage,
            messageClip,
          }),
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }));
      return parseScriptQa(response.text || '');
    } catch (err) {
      console.warn('The script quality check could not run; the script ships as it is.', err);
      return null;
    }
  };
  /** What a new draft is told about the one that failed. */
  const rewriteFeedback = (report: ScriptQaReport): string => `

A PREVIOUS DRAFT OF THIS SCRIPT FAILED THE QUALITY CHECK (${report.overall}/10). Write a completely NEW script — do not reuse its sentences.
WHAT THE NEW SCRIPT MUST DO DIFFERENTLY: ${report.rewriteBrief || 'Deliver the core message more clearly, naturally and persuasively, using only the real facts.'}
WHAT THE CHECK FOUND:
${qaInstructions(report).map(line => `- ${line}`).join('\n')}`;
  /** Judge → polish or rewrite → judge again, keeping the best draft. */
  const withScriptQa = async <T,>(
    first: T,
    textOf: (draft: T) => string,
    nextDraft: (draft: T, report: ScriptQaReport) => Promise<T>,
    mechanicalIssues: (draft: T) => number,
  ): Promise<T> => {
    onProgress("Checking the script — facts, language and selling power...", 30);
    let best = { draft: first, report: await judgeScript(textOf(first)), mechanicalIssues: mechanicalIssues(first) };
    let drafts = 1;
    while (best.report && qaDecision(best.report) !== 'pass' && drafts < MAX_SCRIPT_DRAFTS) {
      const rewrite = qaDecision(best.report) === 'rewrite';
      onProgress(rewrite
        ? `The script scored ${best.report.overall}/10 — writing a stronger draft...`
        : `The script scored ${best.report.overall}/10 — polishing what the check found...`, 31 + drafts);
      let candidate: T;
      try {
        candidate = await nextDraft(best.draft, best.report);
      } catch (err) {
        if ((err as Error)?.message?.includes('stopped by user')) throw err;
        console.warn('Writing another script draft failed; keeping the best so far.', err);
        break;
      }
      drafts += 1;
      const entry = { draft: candidate, report: await judgeScript(textOf(candidate)), mechanicalIssues: mechanicalIssues(candidate) };
      if (isBetterDraft(best, entry)) best = entry;
    }
    if (best.report) {
      scriptQa = qaSummary(best.report, drafts);
      console.info(`Script quality check: ${best.report.overall}/10 after ${drafts} draft${drafts === 1 ? '' : 's'}`, best.report);
    }
    return best.draft;
  };

  if (pack) {
    // Two characters share every 8-second clip, so the script is an exchange rather than a line.
    // Every line as it is spoken — numbers as words, మరియు exactly — whoever wrote it.
    const speakableDialogue = (clips: DialogueClip[]) =>
      clips.map(clip => clip.map(line => ({ ...line, text: speakableLine(line.text, formData.language) })));
    dialogueClips = speakableDialogue(await generateCharacterDialogue());
    if (!customScript?.trim()) {
      dialogueClips = await withScriptQa(
        dialogueClips,
        clips => formatDialogueScript(clips, packSpeakerList),
        async (_draft, report) => speakableDialogue(await generateCharacterDialogue(
          qaDecision(report) === 'rewrite'
            ? rewriteFeedback(report)
            : `\n\nA QUALITY CHECK OF AN EARLIER DRAFT (${report.overall}/10) FOUND THESE PROBLEMS — write the script so that none of them happens:\n${qaInstructions(report).map(line => `- ${line}`).join('\n')}`,
        )),
        clips => clips.length === segmentCount ? 0 : 1,
      );
    }
    voiceOverScript = formatDialogueScript(dialogueClips, packSpeakerList);
    // Downstream (main frame, Veo, stock images) consumes one string per clip — give it the whole
    // exchange, speaker-labelled, so every later prompt knows who says what.
    const nameOf = new Map(packSpeakerList.map(s => [s.key, s.name]));
    parsedSegments = dialogueClips.map(clip =>
      clip.map(line => `${nameOf.get(line.speaker) ?? line.speaker}: ${line.text}`).join(' ')
    );
  } else if (preSplitCustomClips.length > 0) {
    // The business already split the script into `clip-N[…sec]:` lines — honour it exactly.
    // No AI re-segmentation, no word-count repair, no quality rewrite: the wording the business
    // supplied is what ships, so it appears unchanged in both the Voice Over Script and the
    // Veo 3 prompts built from these segments.
    parsedSegments = preSplitCustomClips.map(clip => verbatimScriptText(clip));
    voiceOverScript = formatVoiceOverScript(parsedSegments);
  } else if (customScript && customScript.trim()) {
    /**
     * Unlabelled text: only WHERE each clip starts is decided — never what it says.
     *
     * The model picks the cut points (it reads Telugu sentence ends better than a regex), but its
     * answer is kept only if it says exactly the member's words in the member's order; anything else —
     * a word changed, dropped, "cleaned" or added — is discarded for the code split at sentence
     * boundaries. There is no repair or quality pass after this: a member's script is not ours to
     * rewrite, even when a clip runs long or short.
     */
    const cleanedScript = verbatimScriptText(customScript.trim());
    const segmentSystemPrompt = `You split a voice-over script into EXACTLY ${segmentCount} clips of about 8 seconds each, for a ${effectiveDuration}-second video.

THE ONE RULE: you only decide where each clip starts. Every word of the script must appear exactly once, unchanged and in its original order — never rewrite, shorten, lengthen, translate, correct, reorder or "clean" anything, and never add a word of your own.

- Cut at sentence or phrase boundaries, never in the middle of a word.
- Keep the clips as even in length as the sentences allow.
- Output ONLY the clips, one per line:
Segment 1: <text>
Segment 2: <text>`;

    const segmentResponse = await callWithFallback(async (ai, model) => {
      return await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `Split this script into ${segmentCount} segments:\n\n${cleanedScript}` }] }],
        config: { systemInstruction: segmentSystemPrompt }
      });
    });

    const proposed = parseLabeledClips(segmentResponse.text || '').map(verbatimScriptText);
    const faithful = proposed.length === segmentCount && proposed.every(Boolean) && sameWords(cleanedScript, proposed.join(' '));
    if (!faithful) console.info('Custom script: the model changed the wording while splitting — cutting it at sentence boundaries instead.');
    parsedSegments = faithful ? proposed : splitScriptVerbatim(cleanedScript, segmentCount);
    voiceOverScript = formatVoiceOverScript(parsedSegments);
  } else {
    // Auto-generate voice-over script
    const scriptSystemPrompt = buildLanguageDirective(formData) + VOICEOVER_SYSTEM_PROMPT(effectiveDuration, segmentCount, formData.adType, formData.festivalName, formData.language, formData.gender || 'female', coreMessage);
    const scriptUserPrompt = `Generate a ${effectiveDuration}-second ${formData.language || 'Telugu'} voice-over script for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName}` : ''}
  DURATION: ${effectiveDuration} seconds (${segmentCount} segments)`;

    /** One complete draft: written, mechanically repaired, native-speaker polished, repaired again. */
    const writeDraft = async (feedback = '') => {
      const scriptResponse = await callWithFallback(async (ai, model) => {
        return await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: scriptUserPrompt + feedback }] }],
          config: { systemInstruction: scriptSystemPrompt }
        });
      });

      const repairedVoiceOver = await applyVoiceOverRepairIfNeeded(scriptResponse.text || "Failed to generate Script.");

      // Native-speaker QA pass, then re-run mechanical repair only if the rewrite actually
      // changed something (keeps the common case — review confirms the script is already
      // clean — to a single extra API call).
      const qualityReviewed = await runVoiceOverQualityReview(repairedVoiceOver.formatted);
      return qualityReviewed === repairedVoiceOver.formatted
        ? repairedVoiceOver
        : await applyVoiceOverRepairIfNeeded(qualityReviewed);
    };
    type Draft = Awaited<ReturnType<typeof writeDraft>>;
    /** The same draft, polished by the native-speaker editor told exactly what the gate found. */
    const polishDraft = async (draft: Draft, report: ScriptQaReport): Promise<Draft> => {
      const reviewed = await runVoiceOverQualityReview(draft.formatted, qaInstructions(report));
      return reviewed === draft.formatted ? draft : await applyVoiceOverRepairIfNeeded(reviewed);
    };
    const finalVoiceOver = await withScriptQa<Draft>(
      await writeDraft(),
      draft => draft.formatted,
      (draft, report) => (qaDecision(report) === 'rewrite' ? writeDraft(rewriteFeedback(report)) : polishDraft(draft, report)),
      draft => validateVoiceOverSegments(draft.rawScript, draft.segments, segmentCount, formData.language, everyday,
        formData.adType === 'festival' ? 1 : undefined).length,
    );

    parsedSegments = finalVoiceOver.segments;
    voiceOverScript = finalVoiceOver.formatted;
  }

  /**
   * The last word on a single-voice script, whatever produced it — the writer, the repair, the
   * review or the member's own paste: every number is written as the words that are spoken, and
   * మరియు is spelled exactly (utils/spokenNumbers). The prompts ask for both; this guarantees them.
   */
  if (!pack) {
    parsedSegments = parsedSegments.map(segment => speakableLine(segment, formData.language));
    voiceOverScript = formatVoiceOverScript(parsedSegments);
  }

  // Emit partial result: voiceOver ready (with its quality check, when it had one)
  emitPartial({ voiceOverScript, scriptQa });

  /**
   * Location scouting for an ad built on the client's own photographs.
   *
   * Reading the photos once, up front, is what lets each clip be matched to the RIGHT backdrop
   * instead of simply taking them in upload order. If the scout call fails we fall back to a
   * plain positional assignment rather than losing the photos altogether.
   *
   * ── Why this is no longer pack-only ──────────────────────────────────────────────────────────
   * It was gated on a character pack, from when staging two cartoons in a real shop was the only
   * reason anyone uploaded premises photos. A human-model ad shot in the client's own showroom
   * needs exactly the same thing and was getting none of it: the photos sat in the Store/Office
   * slot as generic "business context" while the frame prompts described an invented interior. A
   * client who was asked for every angle of their shop got an ad set somewhere else.
   */
  const scoutClientLocations = async (): Promise<LocationPhoto[]> => {
    const photos = files.storeImage || [];
    if (formData.locationMode !== 'real_provided' || photos.length === 0) return [];
    try {
      onProgress("Reviewing the client's location photos...", 40);
      const parts: any[] = [];
      for (let i = 0; i < photos.length; i++) {
        parts.push({ inlineData: { mimeType: photos[i].type, data: await fileToBase64(photos[i]) } });
        parts.push({ text: `Photograph index ${i}.` });
      }
      const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { systemInstruction: LOCATION_INDEX_SYSTEM_PROMPT, responseMimeType: "application/json" },
      }));
      const indexed = parseLocationIndex(response.text || '', photos.length);
      if (indexed.length > 0) return indexed;
    } catch (err) {
      console.warn('Location scouting failed; falling back to positional photo assignment.', err);
    }
    // Unscouted but still usable — better a plain assignment than ignoring the client's photos.
    return photos.map((_, index) => ({ index, zone: `photograph ${index + 1}`, usable: true }));
  };

  const clientLocations = await scoutClientLocations();

  /**
   * Which uploaded photo backs which clip — decided ONCE, here, and reused by the art-direction
   * prompt and by the directive stamped onto each finished prompt.
   *
   * Deciding it in one place is the point. The member is holding a handful of photos the client
   * sent and has to attach the right one to the right prompt; if the plan were derived twice, the
   * prompt could describe photo 2 while the instruction said attach photo 3.
   */
  const usingClientPhotos = formData.locationMode === 'real_provided' && clientLocations.length > 0;
  const clipPhotoPlan = usingClientPhotos ? assignPhotosToClips(segmentCount, clientLocations) : [];


  /**
   * Frames with no logo FILE show the business's NAME BOARD — whether "No logo" was ticked or there is
   * simply no logo to attach. A frame prompt that says "the attached logo" with nothing attached sends
   * the member looking for a file that does not exist (utils/frameBrand).
   */
  const frameNoLogo = !!formData.noLogo || !files.logo;
  const frameNameBoard = resolveNameBoardText(formData, businessInfo);
  const frameBrand = getBrandMark(frameNoLogo, frameNameBoard);
  /** A Real Owner Face ad is built from the owner's own photo, uploaded in its own slot. */
  const ownerFace = !!pack?.usesClientFace && !!files.ownerImage;
  /** The team's FRAME / BACKGROUND INSTRUCTIONS box — the highest-priority direction for every frame. */
  const frameInstructionsBlock = formData.frameInstructions?.trim()
    ? `
  FRAME / BACKGROUND INSTRUCTIONS FROM THE TEAM (HIGHEST PRIORITY — follow them exactly in every clip they apply to; they override any location rule here):
  ${formData.frameInstructions.trim()}
`
    : '';

  /**
   * The scene plan (prompts/scenePlan): what this video is ABOUT and one DIFFERENT background per
   * clip, chosen by that clip's line. Skipped when the client's photographs already set every
   * background. A plan that repeats a background is asked for once more with the repeats named; if
   * the call fails the frames fall back to their own location rules, as before.
   */
  const planScenes = async (): Promise<SceneContext | null> => {
    if (usingClientPhotos || API_KEYS.length === 0) return null;
    onProgress("Planning a different background for every clip...", 42);
    const subject = pack
      ? (isHumanPack(pack)
          ? (pack.characters.length > 1 ? 'the two presenters' : 'the presenter')
          : pack.characters.map(c => c.name).join(' and '))
      : `the ${formData.gender === 'male' ? 'male' : 'female'} brand ambassador`;
    const systemInstruction = SCENE_PLAN_SYSTEM_PROMPT({
      clipCount: segmentCount, adType: formData.adType, festivalName: formData.festivalName, subject,
      twoHander: !!pack && pack.characters.length > 1, deity: packPerformer(pack) === 'deity',
    });
    const userPrompt = scenePlanUserPrompt({
      businessContent: formData.textInstructions || '',
      frameInstructions: formData.frameInstructions || '',
      businessInfo,
      clipLines: parsedSegments,
      adType: formData.adType,
      festivalName: formData.festivalName,
    });
    let best: SceneContext | null = null;
    let repeats: number[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = attempt === 0 || repeats.length === 0
          ? userPrompt
          : `${userPrompt}\n\nYOUR LAST PLAN REPEATED A BACKGROUND in clip${repeats.length === 1 ? '' : 's'} ${repeats.join(', ')}. Give every clip a genuinely different part of the place, with different real things in it.`;
        const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text }] }],
          config: { systemInstruction, responseMimeType: 'application/json' },
        }));
        const plan = parseScenePlan(response.text || '', segmentCount);
        if (!plan) continue;
        const planRepeats = repeatedBackgrounds(plan);
        if (!best || planRepeats.length < repeats.length) { best = plan; repeats = planRepeats; }
        if (repeats.length === 0) break;
      } catch (err) {
        console.warn('Scene planning failed; the frames choose their own backgrounds.', err);
        break;
      }
    }
    if (best && repeats.length > 0) console.warn(`Scene plan still repeats clip(s) ${repeats.join(', ')}.`);
    return best;
  };
  const sceneContext = await planScenes();
  const sceneLines = sceneContext ? sceneContext.clips.map((_, i) => sceneLineFor(sceneContext, i)) : [];
  if (sceneContext) emitPartial({ sceneContext });

  /**
   * How every clip is staged and filmed — decided once, here, AFTER the scene plan (prompts/motion):
   * stand and tell, walk and talk, show the product or present the space, each with its camera angle,
   * lens, move and speed, from the scene plan's choices or, failing those, from reading each line. The
   * frames are composed for it first; the video prompts are then written to perform it.
   */
  const motionPlan = planClipMotion(segmentCount, formData.adType, packPerformer(pack),
    motionOptionsFor(pack, parsedSegments, sceneContext));

  // --- Steps 3-6 run CONCURRENTLY: Main Frame, Header (local), Poster, Veo ---
  onProgress("Generating Main Frame, Poster & Video prompts...", 45);

  const serializedBusinessInfo = JSON.stringify(businessInfo);
  const detectedBusinessType = detectBusinessType(serializedBusinessInfo);
  const educationEnvironmentMode = detectedBusinessType === 'education'
    ? detectEducationEnvironmentMode(serializedBusinessInfo)
    : null;
  const professionalSuitPalette = getProfessionalSuitPaletteForBusiness(detectedBusinessType, serializedBusinessInfo);
  const resolvedEnvironmentGuidance = getEnvironmentForBusiness(detectedBusinessType, serializedBusinessInfo);
  const resolvedLocationPlan = getCommercialLocationPlanForBusiness(detectedBusinessType, serializedBusinessInfo);
  const environmentNegativeRules = getEnvironmentNegativeRules(detectedBusinessType, serializedBusinessInfo);
  const realisticLogoPlacementGuidance = getRealisticLogoPlacementGuidance(detectedBusinessType, serializedBusinessInfo);
  
  const mainFramePromise = (async (): Promise<string[]> => {
  const p = getModelProfile(formData.gender || 'female');
  const isCustomAttireMainFrame = formData.attireType === 'custom';
  const maleCastingOverride = p.isMale
    ? `  MODEL GENDER OVERRIDE (ABSOLUTE — HIGHEST PRIORITY): The brand ambassador for THIS campaign is a MALE — a handsome, premium, believable, mature Indian MAN (age 30–35). Wherever ANY rule below says "woman", "girl", "she", "her", "female", "saree", "blouse", "bindi", "bangles", or any female jewellery/makeup, IGNORE the female specifics and render THIS MALE model instead — with sharp masculine grooming (clean-shaven or a neatly trimmed beard), a neat men's haircut, and NO bindi, NO saree, NO blouse, NO necklace/earrings/bangles, NO feminine makeup. Male accessories are limited to a wristwatch and an optional slim ring. Keep the same man consistent across all clips.\n`
    : '';
  // A character-pack ad stages two cartoon characters in the client's real premises, so it uses
  // an entirely different art-direction prompt — the human-model rules below never apply to it.
  // No buildRatioDirective for a pack: the ratio is part of its AD CONFIGURATION block, stated
  // once as a positive instruction rather than bolted on as an override of rules it never carries.
  const multiFrameSystemPrompt = pack
    ? CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, {
        segmentCount,
        clipSummaries: parsedSegments,
        locationMode: formData.locationMode === 'real_provided' ? 'real_provided' : 'ai_generated',
        locationPlan: usingClientPhotos
          ? describeClipLocations(clipPhotoPlan, clientLocations)
          : resolvedLocationPlan,
        aspectRatio: formData.aspectRatio === '16:9' ? '16:9' : '9:16',
        adType: formData.adType,
        festivalName: formData.festivalName,
        hasLogo: !frameNoLogo,
        businessContext: serializedBusinessInfo,
        wardrobe: packWardrobe(pack, formData),
        motionPlan,
        nameBoard: frameNoLogo ? frameNameBoard : '',
        sceneBackgrounds: sceneLines,
        sceneMotive: sceneContext
          ? [sceneContext.motive, sceneContext.setting ? `set in ${sceneContext.setting}` : ''].filter(Boolean).join(', ')
          : '',
      })
    : buildRatioDirective(formData) + buildBrandMarkDirective(frameNoLogo, frameNameBoard, 'scene') + MULTI_FRAME_SYSTEM_PROMPT(
    formData.attireType,
    formData.adType,
    formData.festivalName,
    segmentCount,
    parsedSegments,
    serializedBusinessInfo,
    formData.gender || 'female',
    formData.customAttire || '',
    frameNoLogo,
    frameNameBoard,
    // The same real-premises formula the character packs use, in the SYSTEM prompt where the
    // location rules it replaces actually live. See prompts/realLocation.
    usingClientPhotos
      ? {
          formula: realLocationFormula(MODEL_LOCATION_SUBJECT, describeClipLocations(clipPhotoPlan, clientLocations)),
          clips: clipPhotoPlan.map((plan) => clipLocationLabel(plan, clientLocations)),
        }
      : undefined,
    motionPlan,
    sceneContext ? { block: scenePlanBlock(sceneContext), lines: sceneLines } : undefined,
  );

  const isCommercialMainFrame = formData.adType !== 'festival';

  /**
   * The real-premises override for a human-model ad.
   *
   * Everything below this in the main-frame prompt describes how to INVENT a believable location
   * for the business — the environment anchor, the location ladder, the "rebuild the real premises"
   * rule. All of it is the right instruction when we are building the set and the wrong one when
   * the client has sent photographs of the actual shop, because the model will happily produce a
   * beautiful generic interior that the client does not recognise as theirs.
   *
   * So when photos are in hand the ladder is replaced rather than supplemented: the scouted zones
   * ARE the location plan, one per clip, and the prompt is told in as many words that invention is
   * off. Stated before the routing note so it reads as the governing rule, and repeated as a
   * negative because "use the attached photo" alone is routinely interpreted as "use it as
   * inspiration".
   */
  const realPremisesDirective = usingClientPhotos
    ? `
  LOCATION SOURCE — THE CLIENT'S OWN PREMISES (ABSOLUTE, OVERRIDES EVERY ENVIRONMENT RULE BELOW):
  The client has supplied ${clientLocations.length} photograph${clientLocations.length === 1 ? '' : 's'} of their actual business. Every clip is set in one of those real photographed spaces — the attached reference for that clip — and NOT in an invented, generic, or "typical for this business type" interior.
  • Rebuild the exact space in the attached photograph: its real walls, floor, ceiling, fixtures, counters, shelving, stock, signage, colours and daylight direction. Keep what is actually there.
  • Do NOT redesign, upgrade, tidy, modernise, or "premiumise" the premises. A modest real shop must stay a modest real shop; making it look like a showroom is the failure this override exists to prevent.
  • Do NOT substitute a stock interior, a studio backdrop, or a location invented from the business profile. Do NOT merge several of their spaces into one composite room.
  • The model is placed INTO that photographed space with matching perspective, matching light direction and matching colour temperature, so the frame reads as a photograph taken on location that day.
  • Where any rule below says "reception", "front desk", "logo wall", "business zone" or "a different area", read it as that clip's photograph. The attire, pose and framing rules still apply; the place they happen in is the photograph.
  CLIP-BY-CLIP LOCATION PLAN (each clip uses its own photograph — never the same one twice unless the plan says so):
  ${describeClipLocations(clipPhotoPlan, clientLocations)}
`
    : '';

  const mainFrameEnvironmentRoutingNote = isCommercialMainFrame
    ? `
  CLIENT BUSINESS TYPE: ${detectedBusinessType}
  ${educationEnvironmentMode ? `EDUCATION ENVIRONMENT MODE: ${educationEnvironmentMode === 'institution' ? 'college / school / institute campus mode' : 'education consultancy mode'}
  ` : ''}CLIENT ENVIRONMENT ANCHOR: ${usingClientPhotos ? "the client's own photographed premises, attached — see the LOCATION SOURCE block above" : sceneContext?.setting ? `${sceneContext.setting} — see the SCENE PLAN below` : resolvedEnvironmentGuidance}
  CLIENT LOCATION LADDER: ${usingClientPhotos ? 'the clip-by-clip photograph plan above. Do not invent zones that are not in their photographs.' : sceneContext ? 'the SCENE PLAN below — one planned, different background per clip.' : resolvedLocationPlan}
  BACKGROUND NEGATIVE RULES: ${environmentNegativeRules}
  LOGO INSTALLATION SURFACES: ${usingClientPhotos ? 'a real surface visible in that clip\'s own photograph — an existing board, counter fascia, wall panel or door. Never invent a surface the photograph does not show.' : realisticLogoPlacementGuidance}
  LOCATION VARIATION RULE: ${usingClientPhotos ? "Every clip uses the photograph assigned to it above." : sceneContext ? 'Every clip uses its own background from the SCENE PLAN below — never the same background twice.' : 'Every clip must choose a different real business zone from the client location ladder unless the script absolutely demands a return to the same spot.'}`
    : '';
  const commercialMainFramePriorityNote = isCommercialMainFrame
    ? `
  COMMERCIAL PRIORITY: Beauty tier comes first. The subject/model descriptor must establish an exceptionally beautiful cinema-heroine-tier national luxury brand ambassador before realism, environment, logo, or product detail.
  COMMERCIAL CASTING DENIAL: Never allow an average-looking woman, plain office worker, generic model, safe face, stock-photo feel, ethnically ambiguous look, or any non-Indian casting drift.
  COMMERCIAL BEAUTY FAILURE CHECK: The woman must feel like a luxury-brand creative director selected her after rejecting 500 candidates. She must be top 0.1% beautiful, stop-scrolling, star-quality, and memorable. If she looks like she could simply work in that office, the image has failed.
  COMMERCIAL REALISM FORMULA: FACE ANCHOR = Bollywood-heroine-tier premium Indian brand ambassador face with photogenic sharp attractive features. LIGHT SOURCE = natural daylight from the left window or believable left-side daylight with soft cinematic fill. SKIN TRUTH = visible real pores, natural skin texture, dewy complexion, soft tonal variation, no filter, no smoothing, no waxy highlights. SCENE DEPTH = real architectural client-business interior with softly blurred natural depth of field, never a studio backdrop. CAMERA PHYSICS = Canon EOS R5 realism, 85mm f/1.8 portrait look, shallow depth of field, natural color science.
  COMMERCIAL PROFESSIONAL RULE: When Model Attire = Professional (Premium Beige/Pastel Suit), treat the output as a premium corporate commercial hero shot only — never festival-themed, never celebratory, never saree-led, and never decorated with cultural props. In this suit branch the woman must still look like a Vogue India / Tanishq / Lakme campaign-tier Indian beauty with a real warm smile, alive direct eyes, visible skin truth, and semi-jewellery only. Ban plain receptionist look, HR portrait look, employee ID-photo look, LinkedIn headshot energy, and generic office-worker prettiness. Use executive-facing, consultation-facing, showcase, or trust-building zones with the strongest business-proof surfaces in frame.
  COMMERCIAL TRADITIONAL RULE: When Model Attire = Traditional (Designer Saree), keep the saree commercial, business-specific, premium, and believable — never bridal, never wedding-stage, never festival-styled. The business premises must still dominate the frame as a real operating location.
  COMMERCIAL ENVIRONMENT DENSITY RULE: Rebuild the real premises first, then the strongest business-proof layer for that exact script line, then premium atmosphere from real materials, real light, and real fixtures. Never settle for a generic office corner, empty luxury hall, or stock-photo background.`
    : '';
  const mainFrameProductLine = hasProductImages
    ? isCommercialMainFrame
      ? `\nPRODUCT IMAGES: ${productImageCount} attached. Use them unchanged as business-proof elements on real shelves, display racks, tables, counters, or display cases behind the model.`
      : `\nPRODUCT IMAGES: ${productImageCount} product image(s) are being attached. You MUST include product placement instructions in the prompt. Products should appear IN THE STORE BACKGROUND (on shelves, display racks, tables) — NOT at the bottom of the frame. Products must remain EXACTLY as provided — no modifications.`
    : '';
  
  // Build product image instruction for the prompt
  const productImageMainFrameNote = hasProductImages 
    ? isCommercialMainFrame
      ? `\n\nPRODUCT IMAGES ATTACHED: ${productImageCount} product image(s) are attached with this prompt.
CRITICAL PRODUCT IMAGE INSTRUCTIONS FOR MAIN FRAME:
- Treat products as part of the business-proof layer, not as floating props
- Place exact uploaded products unchanged on real shelves, display racks, tables, counters, or display cases behind the model
- Never place products at the bottom of the frame
- Keep them clearly visible enough to prove the business offering, but secondary to the model
- Match the premises lighting so the display feels like actual business inventory inside the real location`
      : `\n\nPRODUCT IMAGES ATTACHED: ${productImageCount} product image(s) are attached with this prompt.
CRITICAL PRODUCT IMAGE INSTRUCTIONS FOR MAIN FRAME:
- The attached product images MUST be incorporated into the generated image
- **PLACEMENT: Place products IN THE STORE BACKGROUND — on shelves, display racks, tables, or counters BEHIND the model**
- DO NOT place products at the bottom of the frame (they get covered by footer in editing)
- Products should appear as ACTUAL MERCHANDISE displayed in the real store/office background
- Position products on: wall shelves, display cases, reception counter, product stands, or wall-mounted racks
- **PRODUCT CONSISTENCY IS CRITICAL**: Use the EXACT product images provided — do NOT redesign, alter, modify, recolor, or stylize the products in ANY way
- Products must appear EXACTLY as they look in the uploaded images — same colors, packaging, labels, appearance
- Products must be clearly visible in the background but secondary to the model's presence
- The scene should look like a REAL photo taken at the ACTUAL business with their products on display`
      
    : '';
  
  /**
   * A character-pack ad has no model, no attire and no casting — so it gets its own user prompt
   * rather than the human-model one below.
   *
   * Sharing that prompt was a real bug: a Motu & Patlu request was also being told "MODEL GENDER:
   * Female", the designer-saree rule, the beauty-casting rules, and "you MUST describe this logo
   * placement in every clip prompt" — instructions that contradict the character system prompt and
   * that produced the logo descriptions in the generated frames.
   */
  const packMainFrameUserPrompt = pack ? `Generate ${segmentCount} Main Frame image prompts (one per ${CLIP_SECONDS}-second clip) for this two-character cartoon ad.

  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}

  AD CONFIGURATION (as ordered by the client):
  • Aspect ratio: ${formData.aspectRatio === '16:9' ? '16:9 horizontal (landscape)' : '9:16 vertical (portrait)'}
  • Clips: ${segmentCount} × ${CLIP_SECONDS} seconds (${effectiveDuration}s total)
  • Ad type: ${formData.adType}${formData.adType === 'festival' ? ` — festival: ${formData.festivalName}` : ''}
  • Spoken language: ${formData.language || 'Telugu'}
  • Location: ${formData.locationMode === 'real_provided' ? "the client's own photographs, attached" : 'built from the business profile'}
  • Logo: ${!frameNoLogo ? 'attached — place it as-is, never describe it' : `none — show ${frameBrand.ref} instead; there is nothing to attach`}${ownerFace ? `
  • Owner image: attached — the person on screen IS this person, in every clip` : ''}
  ${hasProductImages ? `• Product images: ${productImageCount} attached — show them unchanged on real shelves, counters or display cases behind the characters.` : ''}
  SPECIAL CLIENT INSTRUCTIONS: ${businessInfo.specialRequirements?.customInstructions || 'None'}

  WHAT IS SAID IN EACH CLIP (the backdrop must prove that clip's line):
  ${parsedSegments.map((s, i) => `Clip ${i + 1}: ${s}`).join('\n  ')}
${sceneContext ? `
  SCENE PLAN (decided from what this video is about — build each clip's background exactly as planned):
  ${scenePlanBlock(sceneContext).split('\n').join('\n  ')}
` : ''}${frameInstructionsBlock}
  Generate ${segmentCount} complete, unique prompts now, separated by ###CLIP### on its own line.
  You MUST output EXACTLY ${segmentCount} prompts. Do NOT combine clips into one block.` : '';

  const humanModelMainFrameUserPrompt = `Generate ${segmentCount} unique Main Frame image prompts (one per 8-second clip) for:
${realPremisesDirective}${maleCastingOverride}${commercialMainFramePriorityNote}
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName}` : ''}
  MODEL GENDER: ${p.isMale ? 'Male' : 'Female'}
  ATTIRE: ${formData.attireType === 'traditional' ? 'Traditional (designer saree)' : formData.attireType === 'shirt_pant' ? 'Professional (formal shirt tucked into trousers)' : formData.attireType === 'custom' ? `Custom — ${(formData.customAttire || '').trim() || 'as specified by the user'}` : `Professional (${p.isMale ? "men's formal suit" : 'formal suit'})`}
  TOTAL DURATION: ${effectiveDuration} seconds (${segmentCount} clips of 8 seconds each)
  SPECIAL CLIENT INSTRUCTIONS: ${businessInfo.specialRequirements?.customInstructions || 'None'}
  ${mainFrameEnvironmentRoutingNote}
  CAMPAIGN CASTING RULE: Choose one distinct premium ${p.gender} ambassador identity for THIS business and keep ${p.object} consistent across all clips. Different businesses should not fall back to the same default face. In commercial mode ${p.pronoun} must stay Indian-only in every clip with no ethnic drift.
  HAIR COLOR LOCK RULE: The ${p.person} must have strictly natural rich black hair in Clip 1 and that exact black hair color must stay locked for the full campaign. Reject brown, auburn, burgundy, copper, highlighted, sun-browned, or lighting-shifted hair. If any prompt drifts away from natural rich black hair, rewrite it before output.
  REALISM RULE: The environment must look like the actual business premises using extracted business/store context. In festival mode, keep the real business location dominant and layer festival cues naturally on top. In commercial mode, every clip must rebuild the real premises as the dominant base layer, then use the strongest business-proof surface for that exact voice-over segment, then premium atmosphere from real materials, real light, and real fixtures.
  COMMERCIAL QUALITY RULE: For commercial ads, strictly follow the realism formula: Face Anchor + Light Source + Skin Truth + Scene Depth + Camera Physics. If any one is missing, the frame is not acceptable.
  ${formData.attireType === 'traditional' ? `TRADITIONAL ATTIRE RULE: When ATTIRE = Traditional, keep the saree business-specific, commercial, premium, and realistic — never bridal, never wedding-stage, never festival-styled. Use polished real business zones, premium counters, refined décor, believable glass/reflection behavior, and strong category proof instead of decorative clutter. Every business should get a NEW, different girl in an elegant designer saree (brand-derived colour) with elegant traditional jewellery — a necklace/chain, earrings, bangles, a finger ring, and a small bindi. For Clip 1 the girl stands centered in front of the business's own reception with both hands at the lower waist, the right hand lightly resting over the left in a formal front-clasp corporate pose; frame her as a three-quarter shot from head to thighs/knees clearly filling about 70% of the frame, never a small full head-to-feet shot. The background must be 100% relatable to THIS exact business. The attached logo must be the ONLY text in the frame (kept small-to-medium, sharp, in focus and clearly readable, never large enough to shrink the girl); do NOT invent any other text, and do NOT add empty/blank boards, picture frames, certificates, brochures, posters, standees, or blank screens — keep walls and surfaces clean.` : ''}
  ${(formData.attireType === 'professional' || formData.attireType === 'shirt_pant') ? `PROFESSIONAL ATTIRE RULE: When ATTIRE = Professional, build the frame in a bright contemporary corporate-facing or consultation-facing business zone with a business-specific premium suit palette. For this business, the preferred suit palette is ${professionalSuitPalette}. Do NOT reuse the same beige/pastel suit family across unrelated businesses unless the brand cues clearly justify it. Also do NOT force one identical suit tone into every clip: keep the same premium wardrobe family, but allow clip-to-clip shade shifts inside this approved business palette when the exact location, script beat, or brand materials support it. Keep semi-jewellery only, zero festival cues, and the strongest business-proof surfaces in frame. The suit ${p.person} must be strictly ${p.ageYearsWords} years old, distinctly Indian, ${p.isMale ? 'leading-man-level handsome' : 'actress-level beautiful'}, smiling warmly, and impossible to confuse with a generic employee portrait. Every business should get a NEW, different ${p.personYoung} — never reuse the same recurring face. ${p.Pronoun === 'He' ? 'His' : 'Her'} hair in Clip 1 must read as unmistakably natural rich black only, never soft brown or highlighted under warm light. For Clip 1, the girl stands in the exact center of the frame as a medium full / three-quarter standing shot occupying roughly 70% of the frame, directly in front of the business's own reception, with both hands at the lower waist and the right hand lightly resting over the left in a formal front-clasp corporate pose (no crossed arms, no pockets, no gestures). From Clip 2 onward, the hand position and pose must change according to that clip's exact voice-over script and location. The attached logo must be the ONLY text anywhere in the frame — do NOT invent any other wall text, signage, banners, posters, taglines, mission lines, service lists, certificate text, dates, or academic years. ${p.isMale ? 'The man must wear only minimal masculine accessories: a wristwatch and an optional slim ring — NO necklace, NO earrings, NO bangles, and NO bindi.' : 'The girl must wear simple jewellery: a finger ring, a thin necklace or chain, earrings, a wristwatch, and a small bindi on the forehead.'} Frame ${p.object} as a three-quarter shot from head to thighs/knees so ${p.pronoun} clearly fills about 70% of the frame, never a small full head-to-feet shot. Keep the attached logo small-to-medium and clearly secondary — dynamically sized to the free wall space and never large enough to shrink the girl or steal her 70% dominance. Keep the logo perfectly sharp and in focus (not blurred by depth of field) so every letter and all text on it is crisp and clearly readable. The background must be 100% relatable to THIS exact business — fill the reception with the real equipment, products, displays, and service cues of this specific business (from the provided business details) so a viewer instantly recognises what it does; never a generic or unrelated office. Keep walls and surfaces clean — do NOT add empty/blank boards, picture frames, certificates, brochures, posters, standees, or blank screens (empty placeholders look like cardboard); the only branding is the attached logo.` : ''}
  ${isCustomAttireMainFrame ? `CUSTOM ATTIRE RULE: Dress the ${p.person} in the EXACT custom attire specified in the MODEL SPEC / ATTIRE above — same outfit, same colours, same details in every clip. Do NOT substitute a suit, saree, or any default wardrobe. Keep ${p.isMale ? 'clean masculine grooming with only a wristwatch and an optional slim ring' : 'tasteful, minimal, premium styling'}, direct eye contact, ~70% frame height, and no invented background text.` : ''}
  MAIN FRAME FRAMING RULE: In EVERY clip, the subject must be centered, occupy roughly 70% of the frame, and maintain direct eye contact with the camera.
  LOGO RULE: Use only the attached logo exactly as provided, installed on the most believable physical surface for that clip's zone, kept small-to-medium, sharp and clearly readable, fully visible and never cropped, blocked, blurred, stretched, tilted, redesigned, or pasted like an overlay. Prioritize these surface types: ${realisticLogoPlacementGuidance}
  NO BACKGROUND TEXT RULE (ALL CLIPS — STRICT): In EVERY clip (Clip 1 and all continuation clips), the attached logo is the ONLY text anywhere in the image. NEVER invent or render any other text on walls, desks, screens, boards, or props — no signage, banners, posters, notice boards, brochures, application forms, department lists, course / curriculum lists, certificates, taglines, slogans, dates, or years. The image generator mis-spells such text, so it must not appear. Also do NOT add blank/empty boards, frames, or screens. Each continuation clip's background must be a REAL location/zone of the same business that matches that clip's voice-over line, built only from real physical objects (equipment, products, counters, furniture, fixtures, plants).
  CONTINUATION FRAME RULE: For every clip after Clip 1, write the prompt as if the image generator is also receiving the attached Clip 1 reference frame image.
  ${mainFrameProductLine}
  
  VOICE-OVER SCRIPT SEGMENTS (each segment must directly drive that frame's location, background proof, pose energy, and emotional tone):
  ${parsedSegments.map((s, i) => `Clip ${i+1}: ${s}`).join('\n  ')}
${sceneContext ? `
  SCENE PLAN (decided from what this video is about — build each clip's background exactly as planned; it replaces the location ladder):
  ${scenePlanBlock(sceneContext).split('\n').join('\n  ')}
` : ''}${frameInstructionsBlock}
  
  Generate ${segmentCount} complete, unique Main Frame image prompts now. Separate each with ###CLIP### on its own line.
  You MUST output EXACTLY ${segmentCount} prompts. Each prompt must be separated by ###CLIP### (on its own line, nothing else on that line).
  Do NOT combine multiple clips into one block. Each clip gets its own complete prompt.${productImageMainFrameNote}`;

  // The human prompt's rules name "the attached logo" throughout; with no logo they name the board.
  const mainFrameUserPrompt = pack
    ? packMainFrameUserPrompt
    : frameNoLogo ? nameBoardInPlaceOfLogo(humanModelMainFrameUserPrompt, frameNameBoard) : humanModelMainFrameUserPrompt;

  // Build main frame parts including product images and logo
  const mainFrameParts: any[] = [{ text: mainFrameUserPrompt }];

  // Pass the actual logo image so the AI can reproduce it pixel-perfect in the background
  if (files.logo && !frameNoLogo) {
    mainFrameParts.push({
      inlineData: {
        mimeType: files.logo.type,
        data: await fileToBase64(files.logo)
      }
    });
    mainFrameParts.push({
      text: pack
        // The logo is right here as an image. Asking for it to be DESCRIBED makes the generator
        // redraw an approximation of the words instead of reproducing the file.
        ? `This is the client's business logo. Place it in every clip as real signage already installed in that zone, reproduced from this attached image pixel-for-pixel — never redesigned, recoloured, cropped, blurred, tilted or pasted like a floating overlay. Refer to it in your prompts only as "the attached logo": do NOT describe its text, colours, shape or icon. It is the only text anywhere in the frame.`
        : `This is the EXACT BUSINESS LOGO. You MUST describe this logo placement in every clip prompt so it appears as REAL PHYSICAL SIGNAGE installed on believable architectural surfaces for that zone. Prioritize these surface types: ${realisticLogoPlacementGuidance}. The logo must be reproduced PIXEL-PERFECT — do NOT redesign, reimagine, alter, crop, block, blur, tilt, stretch, partially hide, or paste it like a floating overlay in any way. The full logo must remain completely visible in one piece in every clip. Even though it sits in the background, keep the logo perfectly SHARP and in focus — never softened by depth-of-field blur — so every letter and all text on the logo is crisp and clearly readable.`
    });
  }

  // The owner's own face — the only source of the person on screen in a Real Owner Face ad.
  if (ownerFace && files.ownerImage) {
    mainFrameParts.push({ inlineData: { mimeType: files.ownerImage.type, data: await fileToBase64(files.ownerImage) } });
    mainFrameParts.push({ text: `This is the OWNER IMAGE — a photograph of the business owner. The person in EVERY clip IS this person: the same face, bone structure, age, skin tone, hair and build, never beautified, de-aged or replaced by a look-alike. Refer to it in your prompts only as "the attached owner image"; do not describe their face in words.` });
  }

  if (hasProductImages) {
    for (let i = 0; i < files.productImages.length; i++) {
      mainFrameParts.push({
        inlineData: {
          mimeType: files.productImages[i].type,
          data: await fileToBase64(files.productImages[i])
        }
      });
      mainFrameParts.push({ text: `Product Image ${i + 1} of ${productImageCount} — this EXACT product (unchanged, unmodified) MUST appear in the store background (on shelves, display racks, or counters) in the generated main frame image. DO NOT alter the product appearance in any way.` });
    }
  }

  const mainFrameRawResponse = await generateWithRetry(
    mainFrameParts,
    multiFrameSystemPrompt,
    'Main Frame (Multi-Clip)'
  );

  let rawClipPrompts = collectParsedMainFramePrompts(mainFrameRawResponse, segmentCount);

  // If we still got fewer clips than needed, retry generation once
  if (rawClipPrompts.length < segmentCount && rawClipPrompts.length <= 2) {
    console.warn(`Parsed only ${rawClipPrompts.length} clips, expected ${segmentCount}. Retrying generation...`);
    // With the same logo, photos and product images as the first call — a retry that sends only the
    // text asks for frames of a business the model can no longer see.
    const retryResponse = await generateWithRetry(
      [...mainFrameParts, { text: `IMPORTANT: You MUST generate EXACTLY ${segmentCount} separate prompts. Separate each one clearly with ###CLIP### on its own line. Do not combine clips. Output ${segmentCount} distinct prompts.` }],
      multiFrameSystemPrompt,
      'Main Frame (Multi-Clip Retry)'
    );
    const retryClips = collectParsedMainFramePrompts(retryResponse, segmentCount);
    
    if (retryClips.length > rawClipPrompts.length) {
      rawClipPrompts = retryClips;
    }
  }

  /*
    Still short: the MISSING clips are written, not copied.

    The last frame used to be duplicated into every clip the model left out, so a 6-clip ad could reach
    the member with clips 5 and 6 carrying clip 4's frame — the kit said Completed, and two of its clips
    showed the wrong line's scene. The model is now asked for exactly the clips it skipped, each for its
    own line; only if that also fails is anything padded, and it is said so in the console.
  */
  if (rawClipPrompts.length > 0 && rawClipPrompts.length < segmentCount) {
    const missing = Array.from({ length: segmentCount - rawClipPrompts.length }, (_, k) => rawClipPrompts.length + k + 1);
    try {
      const fillResponse = await generateWithRetry(
        [...mainFrameParts, { text: `You returned ${rawClipPrompts.length} of the ${segmentCount} Main Frame prompts. Write ONLY the prompt${missing.length === 1 ? '' : 's'} for clip ${missing.join(', ')} now — each one complete, for its own clip line above, following every rule — separated by ###CLIP### on its own line, in clip order. Do not repeat the earlier clips.` }],
        multiFrameSystemPrompt,
        'Main Frame (missing clips)',
        1,
      );
      const extra = collectParsedMainFramePrompts(fillResponse, missing.length).slice(0, missing.length);
      rawClipPrompts = [...rawClipPrompts, ...extra];
    } catch (err) {
      console.warn('Writing the missing main-frame clips failed.', err);
    }
  }

  let mainFramePrompts = finalizeMainFramePrompts(rawClipPrompts, segmentCount, mainFrameRawResponse);

  if (rawClipPrompts.length > 0 && rawClipPrompts.length < segmentCount) {
    console.warn(`Final clip count: ${rawClipPrompts.length}/${segmentCount}. Padding remaining clips.`);
  }

  // Skipped for character packs: this repair pass polices human-model art direction (casting,
  // attire, model beauty tier) which has no meaning when the subjects are two cartoon characters.
  if (isCommercialMainFrame && !pack) {
    let mainFrameValidationIssues = getMainFramePromptValidationIssues(
      mainFramePrompts,
      detectedBusinessType,
      educationEnvironmentMode
    );

    if (mainFrameValidationIssues.length > 0) {
      console.warn(`Main frame prompts need focused repair: ${mainFrameValidationIssues.join(' | ')}`);

      const repairInstructions = [
        'You previously generated these Main Frame prompts (one per clip, separated by ###CLIP###):',
        '',
        '---CURRENT PROMPTS---',
        mainFramePrompts.join('\n###CLIP###\n'),
        '---END CURRENT PROMPTS---',
        '',
        'Fix ONLY the following issues:',
        ...mainFrameValidationIssues.map((issue) => `- ${issue}`),
        '',
        'MANDATORY REPAIR RULES:',
        `- Keep EXACTLY ${segmentCount} clips separated by ###CLIP###`,
        `- Keep the same ${p.person}, continuity, and styling anchor`,
        sceneContext
          ? `- Each clip keeps its planned background: ${sceneLines.map((l, i) => `Clip ${i + 1}: ${l}`).join(' | ')}`
          : '- Each clip must use a different real business zone that best proves that clip\'s exact voice-over line',
        `- Client environment anchor: ${sceneContext?.setting || resolvedEnvironmentGuidance}`,
        `- Client location ladder: ${sceneContext ? 'the planned backgrounds above' : resolvedLocationPlan}`,
        `- Hard negatives: ${environmentNegativeRules}`,
        `- Keep professional suit styling inside this approved palette family: ${professionalSuitPalette}`,
        frameNoLogo
          ? `- There is NO logo file: show only ${frameBrand.ref} on a realistic surface, and never mention an attached logo`
          : `- Keep the logo pixel-perfect but physically installed on realistic surfaces: ${realisticLogoPlacementGuidance}`,
        detectedBusinessType === 'education'
          ? `- This education campaign is ${educationEnvironmentMode === 'consultancy' ? 'education consultancy mode' : 'college / school / institute campus mode'} and must not drift out of that mode.`
          : '- Do not drift into a generic office corner, home-like interior, or stock-photo background.',
        '- Output ONLY the repaired prompts separated by ###CLIP### with no explanations'
      ].join('\n');

      const repairResponse = await generateWithRetry(
        [{ text: repairInstructions }],
        multiFrameSystemPrompt,
        'Main Frame (Location Repair)'
      );

      const repairedRawClipPrompts = collectParsedMainFramePrompts(repairResponse, segmentCount);
      const repairedMainFramePrompts = finalizeMainFramePrompts(repairedRawClipPrompts, segmentCount, repairResponse);
      const repairedValidationIssues = getMainFramePromptValidationIssues(
        repairedMainFramePrompts,
        detectedBusinessType,
        educationEnvironmentMode
      );

      if (repairedMainFramePrompts.length > 0 && repairedValidationIssues.length <= mainFrameValidationIssues.length) {
        mainFramePrompts = repairedMainFramePrompts;
        mainFrameValidationIssues = repairedValidationIssues;
      }

      if (mainFrameValidationIssues.length > 0) {
        console.warn(`Main frame prompts still have residual validation issues after repair: ${mainFrameValidationIssues.join(' | ')}`);
      }
    }
  }

    /**
     * Stamp each prompt with the one thing the member cannot work out for themselves: WHICH of the
     * client's photos to attach to this particular prompt.
     *
     * They are holding several photos and a list of near-identical prompts, and until now nothing
     * connected the two — so the natural move was to attach whatever seemed closest, or the same
     * photo to everything. The mapping is already decided in `clipPhotoPlan`, so this just says it
     * out loud, in code rather than trusting the model to have repeated it.
     */
    // Every frame carries the composition for the camera move its video will perform — stamped in
    // code, because the frame model drops it when asked (prompts/motion withMotionComposition).
    // A model ad's clip 1 keeps its hero pose — the face every later frame is matched to.
    mainFramePrompts = mainFramePrompts.map((prompt, i) =>
      withMotionComposition(prompt, motionPlan[i], { keepPose: !pack && i === 0 }));
    // Each frame carries its planned background — the model drifts back to one corner when merely told.
    if (sceneContext) mainFramePrompts = mainFramePrompts.map((prompt, i) => withSceneBackground(prompt, sceneContext, i));
    // No logo file: anything the model still wrote about "the attached logo" becomes the name board.
    if (frameNoLogo) mainFramePrompts = mainFramePrompts.map(prompt => nameBoardInPlaceOfLogo(prompt, frameNameBoard));

    if (clipPhotoPlan.length > 0) {
      mainFramePrompts = mainFramePrompts.map((prompt, i) => {
        const plan = clipPhotoPlan[i];
        return plan ? `${attachmentDirective(plan, clientLocations)}\n\n${prompt}` : prompt;
      });
    }
    // Last, so it joins the photo line: the member attaches the owner's face to every frame.
    if (ownerFace) mainFramePrompts = mainFramePrompts.map(withOwnerImageDirective);

    emitPartial({ mainFramePrompts });
    return mainFramePrompts;
  })();

  // --- Step 4: VIDEO BOTTOM LABEL (local — no API call; see buildVideoBottomLabel) ---
  const headerPrompt = buildVideoBottomLabel({
    formData,
    businessInfo,
    hasLogoFile: !!files.logo,
    hasPremisesPhoto: (files.storeImage?.length || 0) > 0,
    sceneContext,
    coreMessage,
  });

  // Emit partial result: the brand label is ready
  emitPartial({ headerPrompt });

  // --- Step 5: Poster Design Prompt — runs concurrently (see writeVideoPosterPrompt) ---
  /*
    A poster that fails is ONE missing row, not a failed kit. It used to reject the whole run — every
    frame, script and video prompt thrown away for the sake of the poster — and when the model came back
    empty the row simply vanished while the status said Completed. It is now asked twice, and if it
    still fails the kit arrives without it and the poster row says so, with its own Generate button.
  */
  const posterPromise = (async (): Promise<string> => {
    try {
      const posterPrompt = await writeVideoPosterPrompt(formData, businessInfo);
      emitPartial({ posterPrompt });
      return posterPrompt;
    } catch (err) {
      console.warn('The poster prompt could not be written; the kit continues without it.', err);
      return '';
    }
  })();

  // --- Step 6: Veo 3 Segment Prompts — runs concurrently ---
  /**
   * The video prompts are written AFTER the frames, from them.
   *
   * They used to run in parallel with the frame prompts and never saw them — so a video prompt could
   * not know where the model stood, what was in reach to gesture at, or how the still was composed
   * for its camera move. Each clip is now directed from its own finished frame prompt, its line and
   * its planned move (writeVeoPrompts). It costs the frames' duration in waiting; the poster still
   * runs alongside.
   */
  const veoPromise = mainFramePromise.then(async (frames): Promise<string[]> => {
    onProgress("Directing camera moves and performance for each clip...", 85);
    const { count, clips, lines } = veoClipsFromScript(voiceOverScript, formData, frames);
    const prompts = await writeVeoPrompts(formData, count, clips, lines, sceneContext);
    emitPartial({ veoPrompts: prompts });
    return prompts;
  });

  // Frames and poster run concurrently; the video prompts follow the frames (see veoPromise).
  const [mainFramePromptsResult, posterPromptResult, veoPromptsResult] = await Promise.all([
    mainFramePromise,
    posterPromise,
    veoPromise,
  ]);

  onProgress("Finalizing...", 100);

  return {
    businessInfo,
    mainFramePrompts: mainFramePromptsResult,
    headerPrompt,
    posterPrompt: posterPromptResult,
    voiceOverScript,
    veoPrompts: veoPromptsResult,
    hasProductImages,
    productImageCount,
    stockImagePrompts: null, // Generated on-demand by user after main process
    coreMessage,
    // What the video is about and where each clip is set; and what the client's voice note said.
    sceneContext,
    voiceBrief,
    scriptQa,
  };
};

// ── Veo 3 prompts: directed from each clip's frame ──────────────────────────────────────────────

/** One clip to direct: what is spoken, and the frame prompt its still was generated from. */
interface VeoClipInput {
  /** 0-based clip index in the ad. */
  index: number;
  framePrompt: string;
  speech: VeoSpeech[];
  /** The line as the director call reads it, speaker-labelled in a character ad. */
  lineForDirector: string;
}

/** Long frame prompts are cut for the director call; what matters — place, pose, props — comes first. */
const FRAME_CONTEXT_LIMIT = 2600;

/**
 * The clips of a script, ready to direct.
 *
 * Reads the script itself — a single-voice script by its clip labels, a character script as dialogue
 * — so a refined or pasted script is directed exactly as it now reads. `indexes` limits it to the
 * clips that need new prompts.
 */
const veoClipsFromScript = (
  script: string,
  formData: AdFormData,
  mainFramePrompts: string[] = [],
  indexes?: number[],
): { count: number; clips: VeoClipInput[]; lines: string[] } => {
  const pack = packFor(formData);
  const frameFor = (i: number) => splitAttachmentDirective(mainFramePrompts[i] || '').body.trim();
  let all: VeoClipInput[];

  if (pack) {
    const nameOf = new Map(packSpeakers(pack).map(s => [s.key, s.name]));
    const subject = packVeoSubject(pack);
    all = parseDialogueClips(script, packSpeakers(pack)).map((clip, i) => {
      const lines = clip.map(l => ({ name: nameOf.get(l.speaker) ?? l.speaker, text: l.text }));
      return {
        index: i,
        framePrompt: frameFor(i),
        speech: subject.speech(lines),
        lineForDirector: lines.map(l => `${l.name}: "${l.text}"`).join('  /  '),
      };
    });
  } else {
    const labelled = parseLabeledClips(script);
    // The gentle cleaner: a member's "&" or "@" is spoken as written, not deleted on the way to Veo.
    const segments = labelled.length > 0
      ? labelled.map(verbatimScriptText)
      : normalizeAndFormatVoiceOver(script, Math.max(1, Math.round(formData.duration / CLIP_SECONDS))).segments;
    const { voice } = modelVeoSubject(formData.gender || 'female');
    all = segments.map((line, i) => ({
      index: i,
      framePrompt: frameFor(i),
      speech: [{ voice, line }],
      lineForDirector: `"${line}"`,
    }));
  }

  return {
    count: all.length,
    clips: indexes ? all.filter(c => indexes.includes(c.index)) : all,
    // Every clip's line, so the motion plan is the same whichever clips are being regenerated.
    lines: all.map(c => c.lineForDirector),
  };
};

/** The motion plan's inputs for a run: each clip's line, the scene plan's choices, and the cast size. */
const motionOptionsFor = (pack: CharacterPack | null, lines: string[], sceneContext?: SceneContext | null) => ({
  lines,
  choices: motionChoicesOf(sceneContext),
  twoHander: !!pack && pack.characters.length > 1,
});

/**
 * Writes the finished Veo 3 prompt for each clip.
 *
 * One director call returns, per clip, the planned camera move made specific to that frame, three
 * beats timed to the line, and the life in the scene (prompts/motion VEO_DIRECTION_SYSTEM_PROMPT).
 * The prompt itself is assembled in code around that direction, so the exact spoken line, the
 * continuous shot, the identity lock and the negatives cannot drift. If the call fails or a clip's
 * direction is unusable, that clip is assembled from its motion plan — still a moving, directed shot.
 */
const writeVeoPrompts = async (
  formData: AdFormData,
  clipCount: number,
  clips: VeoClipInput[],
  lines: string[] = [],
  sceneContext?: SceneContext | null,
): Promise<string[]> => {
  if (clips.length === 0) return [];
  const pack = packFor(formData);
  const aspectRatio = formData.aspectRatio === '16:9' ? '16:9' : '9:16';
  const language = formData.language || 'Telugu';
  // The same plan the frames were composed for — same lines, same scene-plan choices.
  const plan: ClipMotionPlan[] = planClipMotion(Math.max(clipCount, ...clips.map(c => c.index + 1)), formData.adType,
    packPerformer(pack), motionOptionsFor(pack, lines, sceneContext));
  const packSubject = pack ? packVeoSubject(pack) : null;
  const modelSubject = modelVeoSubject(formData.gender || 'female');
  /** Who performs, as the director reads the planned staging: "Motu and Patlu turn…", "The model leans…". */
  const director = pack
    ? { who: pack.characters.map(c => c.name).join(' and '), plural: pack.characters.length > 1 }
    : { who: 'The model', plural: false };

  let directions: ReturnType<typeof parseVeoDirections> = clips.map(() => null);
  if (API_KEYS.length > 0) {
    const systemInstruction = pack
      ? CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, clips.length, aspectRatio)
      : VEO_SEGMENT_SYSTEM_PROMPT(clips.length, formData.gender || 'female', aspectRatio);
    const userPrompt = `Direct these ${clips.length} clip${clips.length === 1 ? '' : 's'}.

${clips.map((c, k) => {
  const p = plan[c.index];
  const frame = c.framePrompt.length > FRAME_CONTEXT_LIMIT ? `${c.framePrompt.slice(0, FRAME_CONTEXT_LIMIT)}…` : c.framePrompt;
  return `CLIP ${k + 1} (clip ${c.index + 1} of the ad, ${c.index * CLIP_SECONDS}-${(c.index + 1) * CLIP_SECONDS}s)
FRAME:
${frame || '(no frame prompt available — direct from the line and the planned move)'}
LINE: ${c.lineForDirector}
PLANNED STAGING: ${p.staging.name}${p.staging.walks ? ' (a few steps along the clear floor the frame shows)' : ' (stays in their spot)'} — ${stagingPath(p, director.who, director.plural)}
PLANNED CAMERA: ${cameraLabel(p)} — ${fillCast(p.camera.action, director.who, director.plural)}${p.focus === 'speaker' ? `
SPEAKER FOCUS: the camera eases in on whoever is speaking and pulls focus between them` : ''}
GESTURE INTENT: ${p.gesture}`;
}).join('\n\n')}

Return the JSON array for all ${clips.length} clips, numbered 1 to ${clips.length} in the order above.`;
    try {
      const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: { systemInstruction, responseMimeType: 'application/json' },
      }));
      directions = parseVeoDirections(response.text || '', clips.length);
    } catch (err) {
      console.warn('Veo direction call failed; assembling each clip from its motion plan.', err);
    }
  }

  return clips.map((c, k) => assembleVeoPrompt({
    aspectRatio,
    plan: plan[c.index],
    direction: directions[k],
    identityLock: packSubject ? packSubject.identityLock : modelSubject.identityLock,
    language,
    speech: c.speech,
    performanceNotes: packSubject?.performanceNotes,
    cast: packSubject ? packSubject.cast : modelSubject.cast,
    castPlural: packSubject ? packSubject.castPlural : modelSubject.castPlural,
    twoHander: packSubject?.twoHander ?? false,
    manner: packSubject?.manner,
    handGestures: packSubject?.handGestures,
  }));
};

/**
 * New Veo prompts for some or all clips of a script — after a voice-over refine, only the clips whose
 * line changed. Each is directed from that clip's existing frame prompt, so the move still suits the
 * still it will animate.
 */
export const regenerateVeoForClips = async (
  voiceOverScript: string,
  formData: AdFormData,
  mainFramePrompts: string[],
  indexes?: number[],
  /** The run's scene plan, so a regenerated clip keeps the staging and camera it was planned with. */
  sceneContext?: SceneContext | null,
): Promise<{ index: number; prompt: string }[]> => {
  const { count, clips, lines } = veoClipsFromScript(voiceOverScript, formData, mainFramePrompts, indexes);
  const prompts = await writeVeoPrompts(formData, count, clips, lines, sceneContext);
  return clips.map((c, k) => ({ index: c.index, prompt: prompts[k] }));
};

// --- Poster Design Prompt (On-Demand, User-Triggered, Separate Section) ---
export const generatePosterPrompt = async (
  businessInfo: any,
  adType: string,
  festivalName: string,
  posterInstructions: string
): Promise<string> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }

  const posterSystemPrompt = POSTER_SYSTEM_PROMPT(adType, festivalName);
  // The verified facts only — see utils/businessFacts and writeVideoPosterPrompt.
  const posterFacts = factsFromProfile(businessInfo);
  const contactRuleText = posterContactRule(posterFacts.phones.slice(0, MAX_LABEL_CONTACTS));
  const posterAddress = posterFacts.address;
  const posterAddressRule = posterAddress
    ? `ADDRESS — an address IS provided, so it MUST appear in the poster, on ONE clean line, exactly as given: ${posterAddress}`
    : `NO ADDRESS provided — do NOT show or invent any address.`;
  const posterUserPrompt = `Write the poster design prompt for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${adType}
  ${adType === 'festival' ? `FESTIVAL: ${festivalName}` : ''}
  ${posterInstructions ? `\nUSER POSTER INSTRUCTIONS (IMPORTANT — follow these closely):\n${posterInstructions}` : ''}
  ${contactRuleText}
  ${posterAddressRule}
  Write the short, clean, plain-English poster prompt now.`;

  const posterResponse = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [
        { role: 'user', parts: [{ text: posterUserPrompt }] }
      ],
      config: {
        systemInstruction: posterSystemPrompt
      }
    });
  });

  return stripUnverifiedNumbers((posterResponse.text || "").trim(), verifiedKeys(posterFacts));
};

// --- Stock Image Prompts (On-Demand, User-Triggered) ---
export const generateStockImagePrompts = async (
  voiceOverScript: string,
  businessInfo: any,
  adType: string,
  festivalName: string,
  theme: string = 'indian',
  aspectRatio: string = '9:16',
  clipCount?: number,
  /**
   * What the video is about, from the same run: the scene plan's motive and world, and the core
   * message. With them, B-roll for an annadanam video shows the food being served rather than a shop.
   */
  context: { sceneContext?: SceneContext | null; coreMessage?: CoreMessageBrief | null } = {},
): Promise<any[]> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }

  const themeDescriptions: Record<string, string> = {
    'indian': 'INDIAN — Use Indian people, Indian skin tones, Indian clothing (sarees, kurtas, sherwanis, salwar kameez), Indian jewelry, Indian urban/rural settings, Indian architecture, Indian festivals, rangoli, diyas, Indian street scenes, Indian homes and offices. Models should look authentically Indian.',
    'american': 'AMERICAN — Use diverse American people, Western clothing, American urban/suburban settings, American architecture, American lifestyle scenes.',
    'middle-eastern': 'MIDDLE EASTERN — Use Middle Eastern people, traditional and modern Middle Eastern attire, Middle Eastern architecture, bazaars, ornate interiors.',
    'european': 'EUROPEAN — Use European people, European fashion, European cityscapes, cafés, cobblestone streets, classical and modern architecture.',
    'east-asian': 'EAST ASIAN — Use East Asian people, East Asian fashion and aesthetics, East Asian cityscapes, minimalist interiors, East Asian cultural elements.',
    'african': 'AFRICAN — Use African people, vibrant African textiles and patterns, African landscapes, dynamic urban scenes, African cultural elements.',
    'universal': 'UNIVERSAL/GLOBAL — Use a diverse mix of ethnicities and cultures. No specific regional focus. Modern, cosmopolitan settings.'
  };

  const themeInstruction = themeDescriptions[theme] || themeDescriptions['indian'];
  const ratio = aspectRatio === '16:9' ? '16:9' : '9:16';
  const orient = ratio === '16:9' ? 'horizontal (landscape)' : 'vertical (portrait)';

  // One B-roll image per clip (segment), matched to that clip's voice-over line.
  const countInstruction = clipCount && clipCount > 0
    ? `The voice-over has ${clipCount} clips (each ~8 seconds). Generate EXACTLY ${clipCount} B-roll image prompts — ONE per clip, in clip order. Each image MUST visually match the meaning of THAT clip's spoken line and be a hyper-realistic, highly relatable real-world shot for editing over that clip.`
    : `Generate ONLY the stock image prompts that this specific script needs (1-5 maximum). Do NOT always give 5 — analyze the script and provide only what's genuinely needed for editing.`;

  const placements = clipPlacements(voiceOverScript, clipCount);
  const clipLines = placements.map((p) => `${p.timing}: "${spokenOnly(p.line)}"`).join(String.fromCharCode(10));

  /** The ad's own world — the festival's exact imagery, or the business's, or the event the video is about. */
  const festivalTheme = adType === 'festival' && festivalName?.trim() ? getFestivalTheme(festivalName) : null;
  const { sceneContext, coreMessage } = context;
  const worldBlock = [
    festivalTheme ? `FESTIVAL: ${festivalName}
FESTIVAL IMAGERY (use these exact symbols and colours): ${festivalTheme.culturalElements}
FESTIVAL COLOURS: ${festivalTheme.headerColors}
FESTIVAL MOOD: ${festivalTheme.mood}` : '',
    sceneContext ? `WHAT THIS VIDEO IS ABOUT: ${sceneContext.motive}${sceneContext.setting ? `
THE WORLD OF THIS AD: ${sceneContext.setting}` : ''}${sceneContext.avoid.length ? `
NEVER SHOW: ${sceneContext.avoid.join('; ')}` : ''}` : '',
    coreMessage?.whatTheyDo ? `WHAT THE BUSINESS DOES: ${coreMessage.whatTheyDo}${coreMessage.corePromise ? ` — ${coreMessage.corePromise}` : ''}` : '',
  ].filter(Boolean).join('\n');

  const userPrompt = `Analyze this voice-over script and generate stock image prompts for B-roll / cutaway shots to use during video editing.

VOICE-OVER SCRIPT, CLIP BY CLIP (each image is cut over ONE of these clips, in this order):
${clipLines || voiceOverScript}

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

AD TYPE: ${adType === 'festival' ? 'festival greeting' : 'promotional'}
${worldBlock}

CULTURAL THEME: ${themeInstruction}
Every setting and object — and any incidental hands or background figures — MUST match this theme. There is no presenter or model in any B-roll image.

OUTPUT ASPECT RATIO (MANDATORY): Every B-roll image MUST be ${ratio} ${orient}. Begin each "prompt" with "Create a hyper-realistic ${ratio} ${orient} image of". Override any other ratio mentioned.

${countInstruction}

EVERY IMAGE MUST BELONG TO ITS CLIP:
• Image N is cut over clip N and must show exactly what clip N's line says — the product, the work, the offer or the moment named in THOSE words. If the line is about same-day service, the image is that service happening; if it is about free delivery, it is that delivery.
• It shows the THING, not a person: no presenter, no model, no one posing or smiling at the camera — hands at work at most, faces out of frame.
• Keep it in the same world as the ad (above). Never a stock cliché that could sit in any other ad — no boardroom handshakes, no skyscrapers, no foreign offices, no unrelated lifestyle shots — and no text in the image.
• Say in "whyItFits" which words of that clip's line the image is showing.

For each item return an object with: "id" (clip number), "concept" (short label), "prompt" (the full image prompt), "usage" (how the editor uses it, e.g. "full-screen B-roll for 2 seconds"), "whyItFits" (the words of that clip's line this image shows).`;

  const response = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] }
      ],
      config: {
        systemInstruction: `OUTPUT ASPECT RATIO OVERRIDE: every image MUST be ${ratio} ${orient}; ignore any "9:16" mention and use ${ratio}.\n\n` + STOCK_IMAGE_SYSTEM_PROMPT,
        responseMimeType: "application/json"
      }
    });
  });

  const text = response.text || "[]";
  try {
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    // Which clip each image plays over, the line it plays under, and the exact seconds its words fall
    // in — all stamped from the script itself (utils/clipPlacement, utils/wordTiming).
    return withCues(withPlacements(items, placements));
  } catch {
    return [{ id: 1, concept: "Parse Error", prompt: text, usage: "Manual review needed", ...(placements[0] || {}) }];
  }
};

// Refine a SINGLE B-roll stock image prompt (per-image refine) — applies only the requested change.
export const refineStockImagePrompt = async (
  currentPrompt: string,
  instruction: string,
  aspectRatio: string = '9:16'
): Promise<string> => {
  const ratio = aspectRatio === '16:9' ? '16:9' : '9:16';
  const orient = ratio === '16:9' ? 'horizontal (landscape)' : 'vertical (portrait)';
  const response = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text:
`Refine this single B-roll stock image prompt.

CURRENT PROMPT:
${currentPrompt}

REQUESTED CHANGE:
"${instruction}"

The image MUST stay ${ratio} ${orient} and hyper-realistic / highly relatable. Output ONLY the refined image prompt text — no explanations, no code block.` }] }],
      config: { systemInstruction: REFINE_EDIT_DIRECTIVE + `You refine single hyper-realistic ${ratio} ${orient} B-roll image prompts.` }
    });
  });
  return (response.text || currentPrompt)
    .replace(/^```(?:json|text|plaintext)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
};

// The canonical voice-over format (see formatVoiceOverScript) labels each clip with its
// TIME RANGE — "0-8: text", "8-16: text" — never a plain clip number. Handing that straight
// to the overlay model forced it to GUESS which integer clip each line was, and it would
// sometimes echo the time range itself (or invent a number), scrambling the on-screen
// "Clip N" grouping and order. Fix: re-number the script into unambiguous "Clip 1:",
// "Clip 2:", ... labels ourselves before the model ever sees it, so it only has to COPY a
// number that's already right there — never infer one.
const toNumberedClipScript = (script: string): { numberedScript: string; clipCount: number } => {
  const headerPattern = /^\s*(?:\d+\s*-\s*\d+|segment\s*\d+)\s*:\s*(.*)$/i;
  const lines = (script || '').split(/\r?\n/);
  const clips: string[] = [];
  let current: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^full\s*script\s*:?$/i.test(line)) break;
    const match = line.match(headerPattern);
    if (match) {
      if (current !== null) clips.push(current.trim());
      current = match[1] || '';
    } else if (current !== null) {
      current += ` ${line}`;
    }
  }
  if (current !== null) clips.push(current.trim());

  if (clips.length === 0) {
    /**
     * A two-character script is labelled "clip-1[0-8sec]:" with the speakers on the lines below, which
     * the time-range pattern above never matches. Everything then arrived as ONE clip, so every overlay
     * in a character ad was pinned to clip 1 and would have been stacked on the first eight seconds.
     * parseLabeledClips reads both shapes.
     */
    const oneLine = (text: string) => text.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean).join(' ');
    const labelled = parseLabeledClips(script || '').map(oneLine).filter(Boolean);
    if (labelled.length > 0) {
      return {
        numberedScript: labelled.map((text, i) => `Clip ${i + 1}: ${text}`).join(String.fromCharCode(10)),
        clipCount: labelled.length,
      };
    }
    const whole = (script || '').trim();
    return { numberedScript: whole ? `Clip 1: ${whole}` : '', clipCount: whole ? 1 : 0 };
  }

  return {
    numberedScript: clips.map((text, i) => `Clip ${i + 1}: ${text}`).join('\n'),
    clipCount: clips.length,
  };
};

// Generate per-clip on-screen OVERLAY TEXTS with CapCut-searchable sound-effect suggestions.
/** What an overlay's 3D look is themed to — the festival's own palette, or the business. */
export interface OverlayDesignContext {
  adType?: string;
  festivalName?: string;
  sceneContext?: SceneContext | null;
  coreMessage?: CoreMessageBrief | null;
}

/** The theme block the overlay designer reads, and the look used when it returns none. */
const overlayTheme = (context: OverlayDesignContext, businessInfo: any): { block: string; fallback: string } => {
  const festival = context.adType === 'festival' && context.festivalName?.trim() ? getFestivalTheme(context.festivalName) : null;
  if (festival) {
    return {
      block: `AD TYPE: festival greeting — ${context.festivalName}
FESTIVAL COLOURS (the lettering uses exactly these): ${festival.headerColors}
FESTIVAL SYMBOLS (one small accent may come from these): ${festival.culturalElements}
FESTIVAL ACCENTS: ${festival.headerAccents}
FESTIVAL MOOD: ${festival.mood}`,
      fallback: `premium lettering in ${festival.headerColors.split(/[—,]/)[0].trim()} with a soft festive glow`,
    };
  }
  // The extractor names its keys freely ("Brand Color Palette", "brandColorPalette", nested or not).
  const findColours = (node: any, depth = 0): string | undefined => {
    if (!node || typeof node !== 'object' || depth > 3) return undefined;
    for (const [key, value] of Object.entries(node)) {
      if (/brand.?colou?r|colou?r.?palette/i.test(key) && typeof value === 'string' && value.trim() && !/not provided/i.test(value)) {
        return value.trim().slice(0, 120);
      }
      const nested = findColours(value, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  };
  const brandColours = findColours(businessInfo);
  return {
    block: [
      'AD TYPE: promotional',
      context.coreMessage?.whatTheyDo ? `THE BUSINESS: ${context.coreMessage.whatTheyDo}` : '',
      brandColours ? `BRAND COLOURS: ${brandColours}` : '',
      context.sceneContext?.mood ? `MOOD OF THE AD: ${context.sceneContext.mood}` : '',
    ].filter(Boolean).join('\n'),
    fallback: brandColours ? `glossy premium lettering in ${brandColours}` : "glossy premium metallic lettering in the brand's colours",
  };
};

export const generateOverlayTexts = async (
  voiceOverScript: string,
  businessInfo: any,
  language: string = 'Telugu',
  /** What each overlay's 3D look is themed to (Overlay Text Image Generator). */
  context: OverlayDesignContext = {},
): Promise<any[]> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }
  const { numberedScript, clipCount } = toNumberedClipScript(voiceOverScript);
  const theme = overlayTheme(context, businessInfo);
  const allowedNumbers = verifiedKeys(factsFromProfile(businessInfo));

  const response = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text:
`VOICE-OVER SCRIPT — already split into ${clipCount || 'its'} numbered clips, in order. Use these EXACT clip numbers ("clip": 1, 2, 3, ...) — never a time range, never invented:
${numberedScript || voiceOverScript}

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

LANGUAGE: ${language}

THE LOOK OF THE OVERLAYS:
${theme.block}

Generate the on-screen overlay texts now.` }] }],
      config: { systemInstruction: OVERLAY_TEXT_SYSTEM_PROMPT(language), responseMimeType: "application/json" }
    });
  });
  const text = response.text || "[]";
  let parsed: any[];
  try {
    const raw = JSON.parse(text);
    parsed = Array.isArray(raw) ? raw : [];
  } catch {
    parsed = [];
  }

  // Self-healing pass: guarantee every item carries a real integer clip number within
  // range, regardless of what the model actually returned. If an item's clip is missing,
  // non-numeric, or out of range, it inherits the previous (valid) item's clip number —
  // items arrive in script order, so this keeps overlays grouped with their real clip
  // instead of vanishing or rendering a garbled "Clip name".
  let lastClip = 1;
  const healed = parsed
    .map((item) => {
      const digits = String(item?.clip ?? '').match(/\d+/);
      const candidate = digits ? parseInt(digits[0], 10) : NaN;
      const clip = Number.isFinite(candidate) && candidate >= 1 && (clipCount === 0 || candidate <= clipCount)
        ? candidate
        : lastClip;
      lastClip = clip;
      // The image prompt is assembled in code around the model's design note (utils/overlayImage).
      const imageDesign = cleanOverlayDesign(typeof item?.design === 'string' ? item.design : '') || theme.fallback;
      const { design: _design, ...rest } = item || {};
      // An overlay is printed on the ad: a number on it that the business never gave does not survive.
      const overlayText = stripUnverifiedNumbers(String(item?.text || ''), allowedNumbers);
      return { ...rest, text: overlayText, clip, imageDesign, imagePrompt: overlayImagePrompt(overlayText, imageDesign, theme.fallback) };
    })
    // An overlay that was nothing but an unverified number has nothing left to show.
    .filter((item) => String(item.text || '').trim())
    .sort((a, b) => a.clip - b.clip);

  // The seconds and the spoken line each overlay sits over, so the editor is not holding the script
  // in their head while placing it (see utils/clipPlacement).
  return withCues(withPlacements(healed, clipPlacements(voiceOverScript, clipCount), (item) => item.clip));
};

/**
 * Refines ONE overlay's image prompt — only its look changes. The text, the transparent background
 * and the tight crop are re-assembled in code, so a refine can never lose them (utils/overlayImage).
 */
export const refineOverlayImagePrompt = async (params: {
  text: string;
  currentPrompt: string;
  currentDesign?: string;
  instruction: string;
  businessInfo?: any;
  context?: OverlayDesignContext;
}): Promise<{ imagePrompt: string; imageDesign: string }> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }
  const theme = overlayTheme(params.context || {}, params.businessInfo);
  const current = params.currentDesign || overlayDesignOf(params.currentPrompt) || theme.fallback;
  const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: `OVERLAY TEXT: "${params.text}"
CURRENT LOOK: ${current}

${theme.block}

THE MEMBER'S REQUEST: "${params.instruction}"

Return the JSON now.` }] }],
    config: {
      systemInstruction: `You refine the LOOK of one premium 3D text overlay — its material, colours, finish and at most one small accent — for an Indian video ad. Apply the member's request to the current look and keep whatever they did not ask to change. One short phrase. Never describe a background, a scene or a panel (the text is a transparent cut-out), never change or add words to the text, and for a festival ad keep that festival's own colours and symbols unless the member asks otherwise.

Return ONLY this JSON: { "design": "<the new look, one short phrase>" }`,
      responseMimeType: 'application/json',
    },
  }));
  let design = '';
  try {
    design = cleanOverlayDesign(String(JSON.parse(response.text || '{}')?.design || ''));
  } catch {
    design = '';
  }
  const imageDesign = design || current;
  return { imageDesign, imagePrompt: overlayImagePrompt(params.text, imageDesign, theme.fallback) };
};

// Transliterate Telugu voice-over script to English using Gemini AI
export const transliterateToEnglish = async (teluguText: string): Promise<string> => {
  const response = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{
            text: `Transliterate the following Telugu voice-over script into English (Roman script). 

Rules:
- Convert Telugu script words into their English phonetic spelling (e.g., మీ → mee, కోసం → kosam)
- Keep any English words/brand names that are already in English as-is
- Keep numbers as-is
- Preserve all line breaks, segment headers, timestamps, and formatting exactly
- Do NOT translate — only transliterate (write how it sounds in English letters)
- Output ONLY the transliterated text, nothing else

Telugu script:
${teluguText}`
          }]
        }
      ],
      config: {
        systemInstruction: 'You are an expert Telugu-to-English transliterator. You convert Telugu script into readable English phonetic spelling while preserving formatting. You never translate meaning — you only transliterate sounds.'
      }
    });
  });

  return response.text || teluguText;
};

// Extract text/script from an image using Gemini vision
export const extractScriptFromImage = async (imageFile: File): Promise<string> => {
  const base64 = await fileToBase64(imageFile);
  
  const response = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: imageFile.type, data: base64 } },
          { text: 'Extract ALL text/script content from this image. Output ONLY the extracted text exactly as written, preserving the original language, line breaks, and formatting. Do not add any commentary or explanation.' }
        ]
      }],
      config: {
        systemInstruction: 'You are an expert OCR system. Extract all visible text from images accurately. Preserve original language (Telugu, Hindi, English, etc). Output only the extracted text.'
      }
    });
  });

  return response.text || '';
};

// --- Plain text → professional commercial voice-over script ---
// Powers the "Script Duration Checker" tool. Takes whatever raw text a business sends us
// (WhatsApp notes, a rough script, a service list) and rewrites it into a broadcast-ready
// voice-over script using the SAME formula as the AI Ads Platform — see
// SCRIPT_TO_VOICEOVER_SYSTEM_PROMPT, which composes VOICEOVER_SYSTEM_PROMPT so the tone,
// clip arc, and exactly-18-words-per-clip contract stay identical across both surfaces.

export interface VoiceOverClip {
  /** 1-based clip number. */
  index: number;
  /** Business-facing label, e.g. `clip-1[0-8sec]`. */
  label: string;
  startSec: number;
  endSec: number;
  text: string;
  wordCount: number;
}

export interface ScriptConversion {
  clips: VoiceOverClip[];
  clipCount: number;
  totalDuration: number;
  language: string;
  /** Copy-ready script: `clip-1[0-8sec]: …` one clip per line. */
  formattedScript: string;
  /** Canonical `0-8: …` form used everywhere else in the app. */
  canonicalScript: string;
  sourceWordCount: number;
  originalText: string;
}

/** Words per clip in the ads-platform voice-over formula (see VOICEOVER_SYSTEM_PROMPT). */
export const WORDS_PER_CLIP = TARGET_WORDS_PER_CLIP;
/** The spoken-word band a clip must land in. */
export const WORD_BAND = { min: MIN_WORDS_PER_CLIP, max: MAX_WORDS_PER_CLIP } as const;

/** Word count of raw pasted text, ignoring punctuation and decorative characters. */
export const countScriptWords = (scriptText: string): number =>
  tokenizeWords(cleanScriptText(scriptText || '')).length;

/**
 * How many 8-second clips the pasted text naturally fills, at the platform's planned pace — the
 * middle of the 18–20 word band. Used to pre-select "Auto" in the tool before any API call is made.
 */
export const suggestClipCount = (scriptText: string): number => {
  const words = countScriptWords(scriptText);
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_CLIP));
};

/** Detects the script's language from its Unicode block so "Auto" keeps the business's language. */
export const detectScriptLanguage = (scriptText: string): string => {
  if (/[ఀ-౿]/.test(scriptText)) return 'Telugu';
  if (/[ಀ-೿]/.test(scriptText)) return 'Kannada';
  if (/[஀-௿]/.test(scriptText)) return 'Tamil';
  if (/[ഀ-ൿ]/.test(scriptText)) return 'Malayalam';
  if (/[ऀ-ॿ]/.test(scriptText)) return 'Hindi';
  return 'English';
};

const buildScriptConversion = (
  segments: string[],
  language: string,
  originalText: string
): ScriptConversion => {
  const clips: VoiceOverClip[] = segments.map((text, index) => ({
    index: index + 1,
    label: clipLabel(index),
    startSec: index * CLIP_SECONDS,
    endSec: (index + 1) * CLIP_SECONDS,
    text,
    wordCount: tokenizeWords(text).length,
  }));

  return {
    clips,
    clipCount: clips.length,
    totalDuration: clips.length * CLIP_SECONDS,
    language,
    formattedScript: formatClipScript(segments),
    canonicalScript: formatVoiceOverScript(segments),
    sourceWordCount: countScriptWords(originalText),
    originalText,
  };
};

export const convertToVoiceOverScript = async (
  scriptText: string,
  options: {
    /** Fixed clip count, or omit / 'auto' to let the pasted text decide. */
    clipCount?: number | 'auto';
    /** Output language, or 'auto' to keep the pasted text's own language. */
    language?: string;
    adType?: string;
    festivalName?: string;
    gender?: string;
  } = {}
): Promise<ScriptConversion> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }

  const source = scriptText.trim();
  if (!source) throw new Error("Paste a script first.");

  const requested = options.clipCount;
  const segmentCount = typeof requested === 'number' && requested > 0
    ? Math.round(requested)
    : Math.max(1, suggestClipCount(source));

  const language = !options.language || options.language === 'auto'
    ? detectScriptLanguage(source)
    : options.language;

  const adType = options.adType || 'commercial';
  const festivalName = options.festivalName || '';
  const systemInstruction = SCRIPT_TO_VOICEOVER_SYSTEM_PROMPT(
    segmentCount, language, adType, festivalName, options.gender || 'female'
  );

  const userPrompt = `RAW TEXT PROVIDED BY THE BUSINESS:

${cleanScriptText(source)}

Rewrite it as a ${segmentCount * CLIP_SECONDS}-second ${language} commercial voice-over script.
Output exactly ${segmentCount} clip lines, ${MIN_WORDS_PER_CLIP}–${MAX_WORDS_PER_CLIP} spoken words each, using only the facts above.`;

  const response = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: { systemInstruction }
    });
  });

  let normalized = normalizeAndFormatVoiceOver(response.text || '', segmentCount);
  let issues = validateVoiceOverSegments(normalized.rawScript, normalized.segments, segmentCount, language);

  // Same mechanical repair loop the platform runs — the pasted text stands in for the extracted
  // business info, so the repair pass can only re-word using facts the business actually gave us.
  for (let pass = 0; pass < MAX_VOICEOVER_REPAIR_PASSES && issues.length > 0; pass++) {
    const repairResponse = await callWithFallback(async (ai, model) => {
      return await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `Repair this ${language} voice-over script using ONLY the facts in the source text below.

SOURCE TEXT (the only allowed source of facts):
${cleanScriptText(source)}

CURRENT SCRIPT:
${normalized.formatted}

VALIDATION ISSUES:
${issues.map(issue => `- ${issue}`).join('\n')}

Return only the repaired ${segmentCount} clip lines.` }] }],
        config: {
          systemInstruction: VOICEOVER_REPAIR_SYSTEM_PROMPT(
            segmentCount * CLIP_SECONDS, segmentCount, adType, festivalName, language
          )
        }
      });
    });

    normalized = normalizeAndFormatVoiceOver(repairResponse.text || normalized.formatted, segmentCount);
    issues = validateVoiceOverSegments(normalized.rawScript, normalized.segments, segmentCount, language);
  }

  if (issues.length > 0) {
    console.warn('Script conversion validation issues remain after repair:', issues);
  }

  return buildScriptConversion(normalized.segments, language, source);
};

/**
 * Formats raw pasted agreement text into a clean, professionally structured document.
 * Content is preserved — only structure, numbering, spacing, and placeholder normalization
 * change, so the auto-fill markers ("Employee Name: ____" etc.) keep working downstream.
 */
export const formatAgreementWithAI = async (rawText: string): Promise<string> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }
  const systemInstruction = `You are an expert legal-document formatter. You will receive raw, possibly messy, pasted employment-agreement text. Reformat it into a clean, professional, well-structured plain-text agreement.

STRICT RULES:
1. PRESERVE the meaning and all real content — do NOT invent new clauses, change amounts, names, numbers, or terms, and do NOT drop any clause.
2. Structure: company/title lines at the top in ALL CAPS, then company contact block, then an "Employee Details" block, then numbered sections ("1. Appointment", "2. Roles & Responsibilities", …), each section title on its own line followed by its paragraph.
3. NORMALIZE fill-in placeholders to exactly this shape so software can auto-fill them: "Employee Name: ____________________", "Mobile Number: ____________________", "Date: ____________________", "Employee Signature: ____________________". Keep them on their own lines. If the pasted text asks for name/number/date/signature in any other wording, convert it to these exact labels.
4. End with the acceptance section followed by the Employee Name / Employee Signature / Date placeholder lines.
5. Plain text ONLY — no markdown, no asterisks, no code fences, no commentary. Output ONLY the formatted agreement text.
6. Fix obvious typos, broken line-wraps, duplicated words, and inconsistent numbering. Keep language professional and concise.`;
  const response = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: `RAW AGREEMENT TEXT:\n\n${rawText}\n\nFormat it now.` }] }],
      config: { systemInstruction }
    });
  });
  const out = (response.text || '').replace(/```[a-z]*\n?/gi, '').trim();
  return out || rawText;
};

// Robustly extract business name from AI-generated businessInfo object
// Gemini returns inconsistent JSON key names depending on prompt phrasing
export function extractBusinessNameFromInfo(info: any): string {
  if (!info || typeof info !== 'object') return '';
  const invalid = (v: any) => !v || typeof v !== 'string' || v.trim() === '' || /^not\s*provided$/i.test(v.trim());

  // Direct top-level keys
  for (const key of ['businessName', 'name', 'Business Name', 'business_name', 'BusinessName']) {
    if (!invalid(info[key])) return info[key].trim();
  }

  // Nested under identity/business sections
  for (const section of ['businessIdentity', 'business_identity', 'BUSINESS IDENTITY', 'identity']) {
    const sub = info[section];
    if (sub && typeof sub === 'object') {
      for (const key of ['businessName', 'name', 'Business Name', 'business_name', 'BusinessName']) {
        if (!invalid(sub[key])) return sub[key].trim();
      }
    }
  }

  // Recursive deep search: any key containing 'business' and 'name' at any depth
  const deepSearch = (obj: any, depth: number): string => {
    if (!obj || typeof obj !== 'object' || depth > 6) return '';
    for (const [key, val] of Object.entries(obj)) {
      const lk = key.toLowerCase();
      if (lk.includes('business') && lk.includes('name') && !invalid(val)) return String(val).trim();
      // Also check for just 'name' at deeper levels within business sections
      if (depth > 0 && (lk === 'name' || lk === 'businessname') && !invalid(val)) return String(val).trim();
    }
    // Recurse into nested objects
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const found = deepSearch(val, depth + 1);
        if (found) return found;
      }
    }
    return '';
  };

  return deepSearch(info, 0);
}

/* ── Meta ads dashboard → the three numbers a client is told ───────────────────────────────── */

/** What one day of a Meta campaign is worth reading off a dashboard screenshot. */
export interface MetaAdsReading {
  leads: number | null;
  spend: number | null;
  costPerResult: number | null;
  reach: number | null;
  /** The date on the screenshot, `yyyy-MM-dd`, when the dashboard showed one. */
  date: string | null;
}

/**
 * Read a Meta Ads Manager screenshot.
 *
 * ── Why this is a convenience and never a dependency ──────────────────────────────────────────
 * The daily ad report is three numbers a member copies off a phone screenshot into three boxes,
 * and copying three numbers thirty times a month is exactly the kind of task people start skipping
 * around the tenth. So the screenshot is read and the boxes are pre-filled — but the boxes are
 * always there, always editable, and a failed read is a shrug rather than an error: the member
 * types what they can see, which is what they were doing before.
 *
 * The screenshot itself is uploaded and kept either way. It is the proof behind numbers that end up
 * in a client's own report, and a number with no source is a number somebody will eventually argue
 * about.
 */
export const readMetaAdsReport = async (imageFile: File): Promise<MetaAdsReading> => {
  const base64 = await fileToBase64(imageFile);

  const response = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: imageFile.type, data: base64 } },
          {
            text:
              'This is a screenshot of a Meta (Facebook/Instagram) Ads Manager report. Read it and return JSON with:\n' +
              '"leads" — the number of results / leads / messaging conversations started (a whole number),\n' +
              '"spend" — the amount spent, as a plain number in rupees with no symbol or commas,\n' +
              '"costPerResult" — the cost per result, as a plain number in rupees,\n' +
              '"reach" — the reach or impressions if shown, as a whole number,\n' +
              '"date" — the date the figures are for in yyyy-MM-dd form, if the screenshot shows one.\n\n' +
              'Use null for anything the screenshot does not show. Never guess a figure that is not visible.'
          }
        ]
      }],
      config: {
        systemInstruction:
          'You read advertising dashboards precisely. You report only figures that are actually visible in the image, ' +
          'and you use null for anything that is not. You never estimate, infer or average.',
        responseMimeType: 'application/json'
      }
    });
  });

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  try {
    const raw = JSON.parse(response.text || '{}');
    const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
    return {
      leads: num(raw.leads),
      spend: num(raw.spend),
      costPerResult: num(raw.costPerResult),
      reach: num(raw.reach),
      date,
    };
  } catch {
    // Nothing readable. The member types the three numbers, exactly as they did before this existed.
    return { leads: null, spend: null, costPerResult: null, reach: null, date: null };
  }
};
