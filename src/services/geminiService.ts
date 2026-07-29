import { GoogleGenAI } from "@google/genai";
import { AdFormData, FileStore, GeneratedOutputs } from "@/types/aiPlatform";
import { 
  MAIN_FRAME_SYSTEM_PROMPT,
  MULTI_FRAME_SYSTEM_PROMPT,
  HEADER_SYSTEM_PROMPT, 
  POSTER_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
  VOICEOVER_REPAIR_SYSTEM_PROMPT,
  SCRIPT_TO_VOICEOVER_SYSTEM_PROMPT,
  VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT,
  VEO_SEGMENT_SYSTEM_PROMPT,
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
  type BrandSurface
} from "./prompts";
import {
  CHARACTER_VOICEOVER_SYSTEM_PROMPT,
  CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT,
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT,
  CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT,
  LOCATION_INDEX_SYSTEM_PROMPT,
} from "./prompts/characterAd";
import { getCharacterPack, packSpeakers, packSpeakerAliases, packNameSpellings } from "./characterPacks";
import {
  parseDialogueClips, validateDialogueClips, formatDialogueScript, applyNameSpellings,
  type DialogueClip,
} from "@/utils/dialogueFormat";
import {
  assignPhotosToClips, describeClipLocations, attachmentDirective, parseLocationIndex,
  type LocationPhoto,
} from "@/utils/locationAssignment";
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
        console.error(`Model "${model}" is permanently dead (404). Removing from rotation.`);
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

const buildLanguageDirective = (formData: AdFormData): string => {
  const lang = (formData.language || 'Telugu').trim();
  if (!lang || lang.toLowerCase() === 'telugu') return '';
  return `LANGUAGE OVERRIDE (MANDATORY): Write the ENTIRE voice-over in ${lang}${usesLatinScript(lang) ? ' (clean conversational English)' : ` using natural ${lang} script`}. Do NOT use Telugu anywhere. Every spoken line AND the closing call-to-action must be in ${lang}. Ignore any instruction below that says to write in Telugu — use ${lang} instead.\n\n`;
};

// Pixel-perfect refine: change ONLY what the user asked, keep everything else identical.
const REFINE_EDIT_DIRECTIVE = `You are a precise prompt EDITOR (not a re-generator). Apply ONLY the user's requested change to the given content and keep EVERYTHING else exactly the same, word-for-word. Do NOT rewrite, restructure, reorder, shorten, expand, or "improve" any part the user did not ask about. Make the smallest possible edit that fully satisfies the request, and preserve all existing separators, structure, and formatting.\n\n`;

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
  const pack = getCharacterPack(formData.characterPack);
  const packSpeakerList = pack ? packSpeakers(pack) : [];

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
      systemPrompt = REFINE_EDIT_DIRECTIVE + buildRatioDirective(formData)
        + buildNameBoardDirective(formData, businessInfo, 'layout')
        + HEADER_SYSTEM_PROMPT(formData.adType, formData.festivalName, formData.noLogo || false, resolveNameBoardText(formData, businessInfo));
      userPrompt = `You previously generated this Header prompt:

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

    case 'voiceOver': {
      const segmentCount = Math.ceil(formData.duration / 8);
      systemPrompt = REFINE_EDIT_DIRECTIVE + buildLanguageDirective(formData) + (pack
        ? CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, formData.duration, segmentCount, formData.adType, formData.festivalName, formData.language, resolvePlaceName(businessInfo))
        : VOICEOVER_SYSTEM_PROMPT(formData.duration, segmentCount, formData.adType, formData.festivalName, formData.language, formData.gender || 'female'));
      userPrompt = `You previously generated this Voice Over script:

---CURRENT SCRIPT---
${currentContent}
---END CURRENT SCRIPT---

The user wants the following changes/additions:
"${additionalInstructions}"

IMPORTANT:
- Apply ONLY the requested changes to the existing script
- Keep the same structure and duration
- Maintain the ${formData.language || 'Telugu'} language
${pack ? `- This is a ${pack.label} two-character script. KEEP the exchange exactly as it is built:
  every clip has ${packSpeakerList.length} lines, ${packSpeakerList[0]?.name} first and ${packSpeakerList[1]?.name} second,
  each line labelled. NEVER merge them into one voice, never drop a character, never reorder them.
- Return it in the SAME shape you were given: a "clip-N[start-endsec]:" header, then one labelled
  line per character underneath it.` : ''}
- Output ONLY the refined script, no explanations`;
      break;
    }

    case 'veo': {
      const segCount = Math.ceil(formData.duration / 8);
      systemPrompt = REFINE_EDIT_DIRECTIVE + (pack
        ? CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, segCount, formData.aspectRatio === '16:9' ? '16:9' : '9:16')
        : VEO_SEGMENT_SYSTEM_PROMPT(segCount, formData.gender || 'female'));
      userPrompt = `You previously generated these Veo prompts:

---CURRENT PROMPTS---
${currentContent}
---END CURRENT PROMPTS---

The user wants the following changes/additions:
"${additionalInstructions}"

IMPORTANT:
- Apply ONLY the requested changes to the existing prompts
- Keep the same structure and segment count
${pack ? `- These are ${pack.label} clips. Keep both characters and their attributed lines exactly as they are, and keep every prompt animating its attached frame — do NOT turn them into descriptions of a scene or a human presenter.` : ''}
- Output ONLY the refined prompts, no explanations
- Use ###SEGMENT### separator between segments`;
      break;
    }

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

  /**
   * Put a refined pack script back into the exact shape the rest of the app reads.
   *
   * The editor is asked to preserve the two-speaker layout, but "asked" is not "guaranteed" — it
   * may come back with the labels spaced differently or the clip header missing its colon, and that
   * colon is what the AI Platform's clip splitter needs to break the script into cards at all.
   * Re-parsing and re-formatting makes the output canonical no matter how it was written, and
   * re-applies the fixed name spellings while we are at it.
   *
   * If it comes back unparseable we keep the model's text rather than throwing away the member's
   * edit — a script that reads oddly is recoverable; a lost edit is not.
   */
  if (sectionType === 'voiceOver' && pack) {
    const clips = parseDialogueClips(refined, packSpeakerAliases(pack));
    if (clips.length > 0 && clips.every(c => c.length === packSpeakerList.length)) {
      return formatDialogueScript(
        applyNameSpellings(clips, packNameSpellings(pack, formData.language)),
        packSpeakerList,
      );
    }
  }

  return refined;
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
export const extractBusinessOnly = async (
  formData: AdFormData,
  files: FileStore,
  onProgress: (status: string, progress: number) => void
): Promise<GeneratedOutputs> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }

  const parts: any[] = [];

  if (formData.textInstructions) {
    parts.push({ text: `Client Text Instructions: ${formData.textInstructions}` });
  }
  if (files.textInstructionsFile && files.textInstructionsFile.length > 0) {
    for (const textFile of files.textInstructionsFile) {
      const textContent = await readFileAsText(textFile);
      parts.push({ text: `Client Text File Content: ${textContent}` });
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
    for (let i = 0; i < files.voiceRecording.length; i++) {
      parts.push({ inlineData: { mimeType: files.voiceRecording[i].type, data: await fileToBase64(files.voiceRecording[i]) } });
      parts.push({ text: `This is the Client's Voice Instructions (${i + 1} of ${files.voiceRecording.length}). Listen carefully.` });
    }
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

const validateVoiceOverSegments = (rawScript: string, segments: string[], segmentCount: number, language?: string): string[] => {
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

    if (!usesLatinScript(language) && LATIN_OR_DIGIT_PATTERN.test(segment)) {
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

    if (words.length !== 18) {
      issues.push(`Clip ${clipNumber} must contain exactly 18 spoken words, but it has ${words.length}.`);
    }

    if (!isFinalClip && CTA_OR_CONTACT_PATTERN.test(segment)) {
      issues.push(`Clip ${clipNumber} leaks CTA or contact language before the final clip.`);
    }

    // No spoken phone/contact numbers anywhere — the on-screen call CTA is used instead
    if (countPatternMatches(segment, PHONE_DIGIT_WORD_PATTERN) >= 2 || countPatternMatches(segment, NATIVE_DIGIT_WORD_PATTERN) >= 3) {
      issues.push(`Clip ${clipNumber} appears to speak a phone/contact number — remove all spoken numbers and use the on-screen call CTA instead.`);
    }

    const normalizedSegmentKey = cleanScriptText(segment).toLowerCase();
    const firstSeenClip = seenSegments.get(normalizedSegmentKey);
    if (typeof firstSeenClip === 'number') {
      issues.push(`Clip ${clipNumber} duplicates clip ${firstSeenClip}.`);
    } else {
      seenSegments.set(normalizedSegmentKey, clipNumber);
    }
  });

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

  // Helper to prepare parts
  const prepareParts = async () => {
    const parts: any[] = [];
    
    // Add text instructions from form
    if (formData.textInstructions) {
      parts.push({ text: `Client Text Instructions: ${formData.textInstructions}` });
    }

    // Add text file content
    if (files.textInstructionsFile && files.textInstructionsFile.length > 0) {
      for (const textFile of files.textInstructionsFile) {
        const textContent = await readFileAsText(textFile);
        parts.push({ text: `Client Text File Content: ${textContent}` });
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

    // Process Voice Recording
    if (files.voiceRecording && files.voiceRecording.length > 0) {
      for (let i = 0; i < files.voiceRecording.length; i++) {
        parts.push({
          inlineData: {
            mimeType: files.voiceRecording[i].type,
            data: await fileToBase64(files.voiceRecording[i])
          }
        });
        parts.push({ text: `This is the Client's Voice Instructions (${i + 1} of ${files.voiceRecording.length}). Listen carefully.` });
      }
    }

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
  onProgress(customScript ? "Processing custom script..." : "Writing Voice Over script...", 20);

  // A business-provided script pasted in the `clip-1[0-8sec]: …` format is authoritative: its
  // clips are used verbatim (never re-segmented or re-worded), and its clip count — not the
  // Video Duration dropdown — decides how many main-frame and Veo prompts get generated, so the
  // attached script lands in the Generated Assets exactly as the business wrote it.
  const preSplitCustomClips = customScript?.trim() ? parseLabeledClips(customScript) : [];
  const segmentCount = preSplitCustomClips.length > 0
    ? preSplitCustomClips.length
    : Math.round(formData.duration / 8);
  const effectiveDuration = segmentCount * CLIP_SECONDS;
  let voiceOverScript: string;
  let parsedSegments: string[];

  // ── Special-category (cartoon duo) ad ───────────────────────────────────────────────────────
  // A pack swaps in the two-character script/frame/video prompts. When no pack is selected this
  // is null and every line below behaves exactly as it always has.
  const pack = getCharacterPack(formData.characterPack);
  const packSpeakerList = pack ? packSpeakers(pack) : [];
  let dialogueClips: DialogueClip[] = [];

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

  /** Generate → validate → repair, for the two-character script. Mirrors the standard loop. */
  const generateCharacterDialogue = async (): Promise<DialogueClip[]> => {
    if (!pack) return [];
    const aliases = packSpeakerAliases(pack);
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
    const characterNames = packSpeakerList.map(speaker => ({
      name: speaker.name,
      tokens: [
        speaker.name,
        ...spellings.filter(s => s.name === speaker.name).map(s => s.spelling),
      ],
    }));
    // A pasted script already in two-speaker form is authoritative — honour it verbatim. Checked
    // before the town is resolved so a member's own words never pay for a model call.
    const pasted = customScript?.trim() ? parseDialogueClips(customScript, aliases) : [];
    if (pasted.length === segmentCount) return fixNames(pasted);

    const spokenPlace = await resolveSpokenPlace();
    /**
     * The town has to be SAID, so it is validated rather than merely asked for. Both spellings
     * count: the native one is what the script should contain, and the Latin one catches a script
     * that named the place but ignored the transliteration.
     */
    const requiredPhrases = placeName
      ? [{
          label: `The town "${placeName}"`,
          tokens: [placeName, spokenPlace].filter(Boolean),
          clip: 1,
          hint: `Put it in ${packSpeakerList[1]?.name ?? "the second character"}'s line, beside the `
            + `business's name${spokenPlace ? `, spelled exactly "${spokenPlace}"` : ""}, and nowhere else.`,
        }]
      : [];
    const checkDialogue = (clips: DialogueClip[]) =>
      validateDialogueClips(clips, segmentCount, packSpeakerList, { characterNames, requiredPhrases });

    // The spelling the script must use: the native form when we could get one, else the Latin name.
    const promptPlace = spokenPlace || placeName;

    const systemPrompt = CHARACTER_VOICEOVER_SYSTEM_PROMPT(
      pack, effectiveDuration, segmentCount, formData.adType, formData.festivalName, formData.language, promptPlace,
    );
    const userPrompt = `Write the ${segmentCount}-clip cartoon dialogue script for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName}` : ''}
  ${placeName ? `TOWN / VILLAGE (must be spoken once, in clip 1): ${placeName}` : ''}
  DURATION: ${effectiveDuration} seconds (${segmentCount} clips of ${CLIP_SECONDS} seconds)`;

    const response = await callWithFallback(async (ai, model) => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: { systemInstruction: systemPrompt },
    }));

    let clips = fixNames(parseDialogueClips(response.text || '', aliases));
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
          systemInstruction: CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(pack, effectiveDuration, segmentCount, formData.language, promptPlace),
        },
      }));

      const next = fixNames(parseDialogueClips(repaired.text || '', aliases));
      // Only accept a repair that genuinely improves things — a worse rewrite is discarded.
      const nextIssues = checkDialogue(next);
      if (next.length > 0 && nextIssues.length < issues.length) {
        clips = next;
        issues = nextIssues;
      } else break;
    }

    if (issues.length > 0) console.warn('Character dialogue issues remain after repair:', issues);
    return clips;
  };

  const applyVoiceOverRepairIfNeeded = async (candidateScript: string) => {
    let normalizedVoiceOver = normalizeAndFormatVoiceOver(candidateScript, segmentCount);
    let voiceOverIssues = validateVoiceOverSegments(normalizedVoiceOver.rawScript, normalizedVoiceOver.segments, segmentCount, formData.language);

    for (let pass = 0; pass < MAX_VOICEOVER_REPAIR_PASSES && voiceOverIssues.length > 0; pass++) {
      const repairSystemPrompt = buildLanguageDirective(formData) + VOICEOVER_REPAIR_SYSTEM_PROMPT(effectiveDuration, segmentCount, formData.adType, formData.festivalName, formData.language);
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

      normalizedVoiceOver = normalizeAndFormatVoiceOver(repairResponse.text || normalizedVoiceOver.formatted, segmentCount);
      voiceOverIssues = validateVoiceOverSegments(normalizedVoiceOver.rawScript, normalizedVoiceOver.segments, segmentCount, formData.language);
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
  const MAX_QUALITY_REVIEW_PASSES = 1;
  const runVoiceOverQualityReview = async (candidateFormatted: string): Promise<string> => {
    let reviewed = candidateFormatted;
    for (let pass = 0; pass < MAX_QUALITY_REVIEW_PASSES; pass++) {
      try {
        const reviewResponse = await callWithFallback(async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text:
`CANDIDATE SCRIPT (already mechanically valid — ${segmentCount} clips, 18 words each):
${reviewed}

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

Review it now and return the JSON verdict.` }] }],
            config: { systemInstruction: VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT(formData.language), responseMimeType: "application/json" }
          });
        });
        const parsed = JSON.parse(reviewResponse.text || '{}');
        if (parsed && typeof parsed.correctedScript === 'string' && parsed.correctedScript.trim()) {
          reviewed = parsed.correctedScript;
          if (Array.isArray(parsed.issues) && parsed.issues.length > 0) {
            console.info(`Voice-over quality review (pass ${pass + 1}) — score ${parsed.score ?? '?'}, fixed:`, parsed.issues);
          }
          if (parsed.pass === true) break;
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

  if (pack) {
    // Two characters share every 8-second clip, so the script is an exchange rather than a line.
    dialogueClips = await generateCharacterDialogue();
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
    parsedSegments = preSplitCustomClips.map(clip => cleanScriptText(clip));
    voiceOverScript = formatVoiceOverScript(parsedSegments);
  } else if (customScript && customScript.trim()) {
    // Clean the script: remove emojis, special characters, normalize
    const cleanedScript = cleanScriptText(customScript.trim());

    // Use Gemini to intelligently segment the custom script into equal clips
    const segmentSystemPrompt = `You are an expert script editor. Split the given script into EXACTLY ${segmentCount} roughly equal segments for a ${effectiveDuration}-second video (each segment ~8 seconds of speaking time).

RULES:
- Split at natural sentence/phrase boundaries — NEVER split mid-sentence
- Each segment MUST be a COMPLETE, SELF-CONTAINED thought with a proper conclusion
- Each segment should make FULL SENSE on its own — no hanging or incomplete thoughts
- Each segment should be roughly equal in word count (16-22 words each)
- If a sentence is too long for one segment, REWRITE it as two shorter complete sentences
- Maintain the original language and wording — do NOT rewrite or translate
- Remove any remaining emojis, hashtags, or decorative symbols
- Make the text clean and suitable for professional voice-over
- Format output as:
Segment 1: <text>
Segment 2: <text>
... etc.
- Output ONLY the numbered segments, nothing else`;

    const segmentResponse = await callWithFallback(async (ai, model) => {
      return await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `Split this script into ${segmentCount} segments:\n\n${cleanedScript}` }] }],
        config: { systemInstruction: segmentSystemPrompt }
      });
    });

    const repairedVoiceOver = await applyVoiceOverRepairIfNeeded(segmentResponse.text || cleanedScript);
    parsedSegments = repairedVoiceOver.segments;
    voiceOverScript = repairedVoiceOver.formatted;
  } else {
    // Auto-generate voice-over script
    const scriptSystemPrompt = buildLanguageDirective(formData) + VOICEOVER_SYSTEM_PROMPT(effectiveDuration, segmentCount, formData.adType, formData.festivalName, formData.language, formData.gender || 'female');
    const scriptUserPrompt = `Generate a ${effectiveDuration}-second ${formData.language || 'Telugu'} voice-over script for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName}` : ''}
  DURATION: ${effectiveDuration} seconds (${segmentCount} segments)`;

    const scriptResponse = await callWithFallback(async (ai, model) => {
      return await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: scriptUserPrompt }] }],
        config: { systemInstruction: scriptSystemPrompt }
      });
    });

    const repairedVoiceOver = await applyVoiceOverRepairIfNeeded(scriptResponse.text || "Failed to generate Script.");

    // Native-speaker QA pass, then re-run mechanical repair only if the rewrite actually
    // changed something (keeps the common case — review confirms the script is already
    // clean — to a single extra API call).
    const qualityReviewed = await runVoiceOverQualityReview(repairedVoiceOver.formatted);
    const finalVoiceOver = qualityReviewed === repairedVoiceOver.formatted
      ? repairedVoiceOver
      : await applyVoiceOverRepairIfNeeded(qualityReviewed);

    parsedSegments = finalVoiceOver.segments;
    voiceOverScript = finalVoiceOver.formatted;
  }

  // Emit partial result: voiceOver ready
  emitPartial({ voiceOverScript });

  /**
   * Location scouting for a character-pack ad built on the client's own photographs.
   *
   * Reading the photos once, up front, is what lets each clip be matched to the RIGHT backdrop
   * instead of simply taking them in upload order. If the scout call fails we fall back to a
   * plain positional assignment rather than losing the photos altogether.
   */
  const scoutClientLocations = async (): Promise<LocationPhoto[]> => {
    const photos = files.storeImage || [];
    if (!pack || formData.locationMode !== 'real_provided' || photos.length === 0) return [];
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
  const usingClientPhotos = !!pack && formData.locationMode === 'real_provided' && clientLocations.length > 0;
  const clipPhotoPlan = usingClientPhotos ? assignPhotosToClips(segmentCount, clientLocations) : [];

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
        hasLogo: !!files.logo,
        businessContext: serializedBusinessInfo,
      })
    : buildRatioDirective(formData) + buildNameBoardDirective(formData, businessInfo) + MULTI_FRAME_SYSTEM_PROMPT(
    formData.attireType,
    formData.adType,
    formData.festivalName,
    segmentCount,
    parsedSegments,
    serializedBusinessInfo,
    formData.gender || 'female',
    formData.customAttire || '',
    formData.noLogo || false,
    resolveNameBoardText(formData, businessInfo)
  );

  const isCommercialMainFrame = formData.adType !== 'festival';
  const mainFrameEnvironmentRoutingNote = isCommercialMainFrame
    ? `
  CLIENT BUSINESS TYPE: ${detectedBusinessType}
  ${educationEnvironmentMode ? `EDUCATION ENVIRONMENT MODE: ${educationEnvironmentMode === 'institution' ? 'college / school / institute campus mode' : 'education consultancy mode'}
  ` : ''}CLIENT ENVIRONMENT ANCHOR: ${resolvedEnvironmentGuidance}
  CLIENT LOCATION LADDER: ${resolvedLocationPlan}
  BACKGROUND NEGATIVE RULES: ${environmentNegativeRules}
  LOGO INSTALLATION SURFACES: ${realisticLogoPlacementGuidance}
  LOCATION VARIATION RULE: Every clip must choose a different real business zone from the client location ladder unless the script absolutely demands a return to the same spot.`
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
  • Logo: ${files.logo ? 'attached — place it as-is, never describe it' : 'none provided'}
  ${hasProductImages ? `• Product images: ${productImageCount} attached — show them unchanged on real shelves, counters or display cases behind the characters.` : ''}
  SPECIAL CLIENT INSTRUCTIONS: ${businessInfo.specialRequirements?.customInstructions || 'None'}

  WHAT IS SAID IN EACH CLIP (the backdrop must prove that clip's line):
  ${parsedSegments.map((s, i) => `Clip ${i + 1}: ${s}`).join('\n  ')}

  Generate ${segmentCount} complete, unique prompts now, separated by ###CLIP### on its own line.
  You MUST output EXACTLY ${segmentCount} prompts. Do NOT combine clips into one block.` : '';

  const humanModelMainFrameUserPrompt = `Generate ${segmentCount} unique Main Frame image prompts (one per 8-second clip) for:
${maleCastingOverride}${commercialMainFramePriorityNote}
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
  
  Generate ${segmentCount} complete, unique Main Frame image prompts now. Separate each with ###CLIP### on its own line.
  You MUST output EXACTLY ${segmentCount} prompts. Each prompt must be separated by ###CLIP### (on its own line, nothing else on that line).
  Do NOT combine multiple clips into one block. Each clip gets its own complete prompt.${productImageMainFrameNote}`;

  const mainFrameUserPrompt = pack ? packMainFrameUserPrompt : humanModelMainFrameUserPrompt;

  // Build main frame parts including product images and logo
  const mainFrameParts: any[] = [{ text: mainFrameUserPrompt }];

  // Pass the actual logo image so the AI can reproduce it pixel-perfect in the background
  if (files.logo) {
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
    const retryResponse = await generateWithRetry(
      [{ text: mainFrameUserPrompt + `\n\nIMPORTANT: You MUST generate EXACTLY ${segmentCount} separate prompts. Separate each one clearly with ###CLIP### on its own line. Do not combine clips. Output ${segmentCount} distinct prompts.` }],
      multiFrameSystemPrompt,
      'Main Frame (Multi-Clip Retry)'
    );
    const retryClips = collectParsedMainFramePrompts(retryResponse, segmentCount);
    
    if (retryClips.length > rawClipPrompts.length) {
      rawClipPrompts = retryClips;
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
        '- Each clip must use a different real business zone that best proves that clip\'s exact voice-over line',
        `- Client environment anchor: ${resolvedEnvironmentGuidance}`,
        `- Client location ladder: ${resolvedLocationPlan}`,
        `- Hard negatives: ${environmentNegativeRules}`,
        `- Keep professional suit styling inside this approved palette family: ${professionalSuitPalette}`,
        `- Keep the logo pixel-perfect but physically installed on realistic surfaces: ${realisticLogoPlacementGuidance}`,
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
    if (pack && clipPhotoPlan.length > 0) {
      mainFramePrompts = mainFramePrompts.map((prompt, i) => {
        const plan = clipPhotoPlan[i];
        return plan ? `${attachmentDirective(plan, clientLocations)}\n\n${prompt}` : prompt;
      });
    }

    emitPartial({ mainFramePrompts });
    return mainFramePrompts;
  })();

  // --- Step 4: Header Prompt (local — no API call) ---

  const headerNameBoardText = resolveNameBoardText(formData, businessInfo);
  const headerSystemPrompt = buildRatioDirective(formData)
    + buildNameBoardDirective(formData, businessInfo, 'layout')
    + HEADER_SYSTEM_PROMPT(formData.adType, formData.festivalName, formData.noLogo || false, headerNameBoardText);
  // Extract ONLY logo/name/contacts/address — never dump the full business JSON or any other data.
  const headerBusinessName = extractBusinessNameFromInfo(businessInfo);
  const headerContacts = extractContactsFromInfo(businessInfo).slice(0, 2);
  const headerAddress = resolveRealAddress(businessInfo, headerBusinessName);
  const headerValueLines = [
    // This block is the literal text the member copies into the image generator, so a "LOGO ="
    // line here asked for a logo file that was never uploaded however the rules above were worded.
    formData.noLogo
      ? `BRAND MARK = the business name set as a typographic wordmark${headerNameBoardText ? `, reading exactly "${headerNameBoardText}"` : ''} — nothing is attached, and nothing needs to be`
      : 'LOGO = use the attached logo image exactly as provided, unchanged',
    headerBusinessName ? `NAME = ${headerBusinessName}` : '',
    headerContacts[0] ? `CONTACT 1 = ${headerContacts[0]}` : '',
    headerContacts[1] ? `CONTACT 2 = ${headerContacts[1]}` : '',
    headerAddress ? `ADDRESS = ${headerAddress}` : '',
  ].filter(Boolean);
  // Explicit negatives for missing fields, so the image generator never fabricates them.
  const headerMissingLines: string[] = [];
  if (headerContacts.length === 0) headerMissingLines.push('NO CONTACT NUMBER provided — do NOT show any contact pill and do NOT invent, guess, autocomplete, or fabricate any phone number.');
  if (!headerAddress) headerMissingLines.push('NO ADDRESS provided — do NOT show any address bar and do NOT invent, guess, autocomplete, or fabricate any address, street, area, city, pincode, or location. Close that space cleanly.');
  const headerPrompt = [
    headerSystemPrompt,
    "",
    "REAL CONTENT TO PLACE (use ONLY these EXACT values — do not add anything else, and do not write or invent any field that is not listed here):",
    ...headerValueLines,
    ...(headerMissingLines.length ? ["", "MISSING FIELDS (STRICT — NEVER FABRICATE THESE):", ...headerMissingLines] : []),
  ].join('\n');

  // Emit partial result: header ready
  emitPartial({ headerPrompt });

  // --- Step 5: Poster Design Prompt (JSON) — runs concurrently ---
  const posterPromise = (async (): Promise<string> => {
  const posterSystemPrompt = buildRatioDirective(formData)
    + buildNameBoardDirective(formData, businessInfo, 'layout')
    + POSTER_SYSTEM_PROMPT(formData.adType, formData.festivalName, formData.noLogo || false, resolveNameBoardText(formData, businessInfo));
  const posterContacts = extractContactsFromInfo(businessInfo).slice(0, 2);
  const posterContactRule = posterContacts.length
    ? `CONTACT NUMBER(S) — use ONLY these exact number(s), at most two, digit-for-digit; NEVER alter, complete, reorder, merge, or invent any number: ${posterContacts.join('  |  ')}`
    : `NO CONTACT NUMBER provided — do NOT show or invent any phone number on the poster.`;
  const posterAddress = resolveRealAddress(businessInfo, extractBusinessNameFromInfo(businessInfo));
  const posterAddressRule = posterAddress
    ? `ADDRESS — an address IS provided, so it MUST appear in the poster, on ONE clean line, exactly as given: ${posterAddress}`
    : `NO ADDRESS provided — do NOT show or invent any address.`;
  const posterUserPrompt = `Write the poster design prompt for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName}` : ''}
  ${posterContactRule}
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

  const posterPrompt = (posterResponse.text || "").trim();

    emitPartial({ posterPrompt });
    return posterPrompt;
  })();

  // --- Step 6: Veo 3 Segment Prompts — runs concurrently ---
  const veoPromise = (async (): Promise<string[]> => {
  const veoSystemPrompt = pack
    ? CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, segmentCount, formData.aspectRatio === '16:9' ? '16:9' : '9:16')
    : VEO_SEGMENT_SYSTEM_PROMPT(segmentCount, formData.gender || 'female');

  /**
   * A pack clip is animated FROM its main-frame image, which the member attaches alongside the
   * prompt — so the scene is already fixed and visible. The model is given the dialogue and
   * nothing else: describing the location here only produced a paragraph re-stating the picture,
   * which the member had to read past and Veo had to reconcile against the real frame.
   */
  const veoUserPrompt = pack
    ? `Generate Veo 3 prompts for all ${segmentCount} clips of this two-character cartoon ad.
Each clip's frame image is attached separately by the member, so write motion and speech only.

${dialogueClips.map((clip, i) => {
      const nameOf = new Map(packSpeakerList.map(s => [s.key, s.name]));
      const lines = clip.map(l => `  ${nameOf.get(l.speaker) ?? l.speaker}: "${l.text}"`).join('\n');
      return `CLIP ${i + 1} (${i * CLIP_SECONDS}-${(i + 1) * CLIP_SECONDS}s)\n${lines}`;
    }).join('\n\n')}

Generate ${segmentCount} complete Veo 3 prompts now.`
    : `Generate Veo 3 prompts for all segments.
  VOICE-OVER SEGMENTS: ${parsedSegments.map((s, i) => `Segment ${i+1}: ${s}`).join('\n')}
  Generate ${segmentCount} complete Veo 3 prompts now.`;

  const veoResponse = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [
          { role: 'user', parts: [{ text: veoUserPrompt }] }
      ],
      config: {
          systemInstruction: veoSystemPrompt,
      }
    });
  });

  const veoPromptsText = veoResponse.text || "";

  // Always return EXACTLY segmentCount prompts (parser pads/truncates to match).
  const finalVeoPrompts = parseVeoSegmentPrompts(veoPromptsText, segmentCount);
  emitPartial({ veoPrompts: finalVeoPrompts });
  return finalVeoPrompts;
  })();

  // Run Main Frame, Poster, and Veo prompt generation concurrently (independent steps)
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
    stockImagePrompts: null // Generated on-demand by user after main process
  };
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
  const posterContacts = extractContactsFromInfo(businessInfo).slice(0, 2);
  const posterContactRule = posterContacts.length
    ? `CONTACT NUMBER(S) — use ONLY these exact number(s), at most two, digit-for-digit; NEVER alter, complete, reorder, merge, or invent any number: ${posterContacts.join('  |  ')}`
    : `NO CONTACT NUMBER provided — do NOT show or invent any phone number on the poster.`;
  const posterAddress = resolveRealAddress(businessInfo, extractBusinessNameFromInfo(businessInfo));
  const posterAddressRule = posterAddress
    ? `ADDRESS — an address IS provided, so it MUST appear in the poster, on ONE clean line, exactly as given: ${posterAddress}`
    : `NO ADDRESS provided — do NOT show or invent any address.`;
  const posterUserPrompt = `Write the poster design prompt for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${adType}
  ${adType === 'festival' ? `FESTIVAL: ${festivalName}` : ''}
  ${posterInstructions ? `\nUSER POSTER INSTRUCTIONS (IMPORTANT — follow these closely):\n${posterInstructions}` : ''}
  ${posterContactRule}
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

  return (posterResponse.text || "").trim();
};

// --- Regenerate Veo prompts from a (refined) voice-over script ---
// Used so that refining the Voice Over script also updates the Veo 3 segment prompts.
export const regenerateVeoFromVoiceOver = async (
  voiceOverScript: string,
  formData: AdFormData
): Promise<string[]> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }

  // The script is the authority on clip count — a business-supplied custom script can be longer
  // or shorter than the Video Duration setting, and the Veo prompts must match it 1:1.
  const scriptClips = parseLabeledClips(voiceOverScript).length;
  const segmentCount = scriptClips > 0 ? scriptClips : Math.round(formData.duration / 8);
  const { segments } = normalizeAndFormatVoiceOver(voiceOverScript, segmentCount);
  const veoSystemPrompt = VEO_SEGMENT_SYSTEM_PROMPT(segmentCount, formData.gender || 'female');
  const veoUserPrompt = `Generate Veo 3 prompts for all segments.
  VOICE-OVER SEGMENTS: ${segments.map((s, i) => `Segment ${i + 1}: ${s}`).join('\n')}
  Generate ${segmentCount} complete Veo 3 prompts now.`;

  const veoResponse = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: veoUserPrompt }] }],
      config: { systemInstruction: veoSystemPrompt }
    });
  });

  const veoPromptsText = veoResponse.text || "";
  return parseVeoSegmentPrompts(veoPromptsText, segmentCount);
};

// --- Stock Image Prompts (On-Demand, User-Triggered) ---
export const generateStockImagePrompts = async (
  voiceOverScript: string,
  businessInfo: any,
  adType: string,
  festivalName: string,
  theme: string = 'indian',
  aspectRatio: string = '9:16',
  clipCount?: number
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

  const userPrompt = `Analyze this voice-over script and generate stock image prompts for B-roll / cutaway shots to use during video editing.

VOICE-OVER SCRIPT:
${voiceOverScript}

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

AD TYPE: ${adType}
${adType === 'festival' ? `FESTIVAL: ${festivalName}` : ''}

CULTURAL THEME: ${themeInstruction}
ALL people, clothing, settings, and cultural elements in every image MUST match this theme. This is NON-NEGOTIABLE.

OUTPUT ASPECT RATIO (MANDATORY): Every B-roll image MUST be ${ratio} ${orient}. Begin each "prompt" with "Create a hyper-realistic ${ratio} ${orient} image of". Override any other ratio mentioned.

${countInstruction}

For each item return an object with: "id" (clip number), "concept" (short label), "timing" (which clip / second range), "prompt" (the full image prompt), "usage" (how the editor uses it).`;

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
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [{ id: 1, concept: "Parse Error", timing: "N/A", prompt: text, usage: "Manual review needed" }];
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
    const whole = (script || '').trim();
    return { numberedScript: whole ? `Clip 1: ${whole}` : '', clipCount: whole ? 1 : 0 };
  }

  return {
    numberedScript: clips.map((text, i) => `Clip ${i + 1}: ${text}`).join('\n'),
    clipCount: clips.length,
  };
};

// Generate per-clip on-screen OVERLAY TEXTS with CapCut-searchable sound-effect suggestions.
export const generateOverlayTexts = async (
  voiceOverScript: string,
  businessInfo: any,
  language: string = 'Telugu'
): Promise<any[]> => {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment.");
  }
  const { numberedScript, clipCount } = toNumberedClipScript(voiceOverScript);

  const response = await callWithFallback(async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text:
`VOICE-OVER SCRIPT — already split into ${clipCount || 'its'} numbered clips, in order. Use these EXACT clip numbers ("clip": 1, 2, 3, ...) — never a time range, never invented:
${numberedScript || voiceOverScript}

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

LANGUAGE: ${language}

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
  return parsed
    .map((item) => {
      const digits = String(item?.clip ?? '').match(/\d+/);
      const candidate = digits ? parseInt(digits[0], 10) : NaN;
      const clip = Number.isFinite(candidate) && candidate >= 1 && (clipCount === 0 || candidate <= clipCount)
        ? candidate
        : lastClip;
      lastClip = clip;
      return { ...item, clip };
    })
    .sort((a, b) => a.clip - b.clip);
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
export const WORDS_PER_CLIP = 18;

/** Word count of raw pasted text, ignoring punctuation and decorative characters. */
export const countScriptWords = (scriptText: string): number =>
  tokenizeWords(cleanScriptText(scriptText || '')).length;

/**
 * How many 8-second clips the pasted text naturally fills, at the platform's 18-words-per-clip
 * pace. Used to pre-select "Auto" in the tool before any API call is made.
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
Output exactly ${segmentCount} clip lines, exactly ${WORDS_PER_CLIP} spoken words each, using only the facts above.`;

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

// Extract phone/contact numbers (deep search). Returns display strings in the order found.
function extractContactsFromInfo(info: any): string[] {
  if (!info || typeof info !== 'object') return [];
  const found: string[] = [];
  const addFromString = (raw: string) => {
    if (!raw || /^not\s*provided$/i.test(raw.trim())) return;
    const matches = raw.match(/\+?\d[\d\s\-()]{6,}\d/g) || [];
    for (const m of matches) {
      const digitCount = m.replace(/\D/g, '').length;
      if (digitCount >= 7 && digitCount <= 15) {
        const display = m.trim().replace(/\s{2,}/g, ' ');
        if (!found.some(f => f.replace(/\D/g, '') === display.replace(/\D/g, ''))) {
          found.push(display);
        }
      }
    }
  };
  const isContactKey = (key: string) => {
    const lk = key.toLowerCase();
    return (lk.includes('phone') || lk.includes('contact') || lk.includes('mobile') || lk.includes('whatsapp') || lk.includes('number') || lk.includes('cell') || lk.includes('tel')) && !lk.includes('email');
  };
  const visit = (obj: any, depth: number, underContactKey: boolean) => {
    if (obj == null || depth > 6) return;
    if (typeof obj === 'string') {
      if (underContactKey) addFromString(obj);
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach(v => visit(v, depth + 1, underContactKey));
      return;
    }
    if (typeof obj === 'object') {
      for (const [key, val] of Object.entries(obj)) {
        visit(val, depth + 1, underContactKey || isContactKey(key));
      }
    }
  };
  visit(info, 0, false);
  return found;
}

// Extract the address string (deep search for an "address" key).
function extractAddressFromInfo(info: any): string {
  if (!info || typeof info !== 'object') return '';
  const invalid = (v: any) => typeof v !== 'string' || !v.trim() || /^not\s*provided$/i.test(v.trim());
  let result = '';
  const visit = (obj: any, depth: number) => {
    if (result || obj == null || depth > 6 || typeof obj !== 'object') return;
    for (const [key, val] of Object.entries(obj)) {
      if (key.toLowerCase().includes('address') && !invalid(val)) { result = String(val).trim(); return; }
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        visit(val, depth + 1);
        if (result) return;
      }
    }
  };
  visit(info, 0);
  return result;
}

// Resolve a REAL address (drops values that are just the business name / a vague label with no street or pincode).
function resolveRealAddress(info: any, businessName: string): string {
  const addr = extractAddressFromInfo(info);
  if (!addr) return '';
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nName = norm(businessName);
  const nAddr = norm(addr);
  const hasRealAddressSignal = /\d/.test(addr) || /\b(road|rd|street|st|nagar|colony|lane|cross|main|opp|near|beside|floor|plot|door|pin|pincode|dist|district|mandal|village|town|city|state|highway|circle|sector|block|phase|market|complex|building)\b/i.test(addr);
  if (nName && nAddr && !hasRealAddressSignal && (nAddr === nName || nName.includes(nAddr) || nAddr.includes(nName))) {
    return '';
  }
  return addr;
}
