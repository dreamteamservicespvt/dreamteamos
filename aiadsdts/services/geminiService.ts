import { GoogleGenAI } from "@google/genai";
import { AdFormData, FileStore, GeneratedOutputs } from "../types";
import { 
  MAIN_FRAME_SYSTEM_PROMPT,
  MULTI_FRAME_SYSTEM_PROMPT,
  HEADER_SYSTEM_PROMPT, 
  POSTER_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT, 
  VEO_SEGMENT_SYSTEM_PROMPT,
  STOCK_IMAGE_SYSTEM_PROMPT,
  EXTRACTION_SYSTEM_PROMPT
} from "./prompts";
import { fileToBase64, readFileAsText } from "../utils/fileHelpers";

// Multi-API Key Fallback System
// Keys are stored in environment variables for security
const API_KEYS: string[] = [
  process.env.API_KEY_1 || '',
  process.env.API_KEY_2 || '',
  process.env.API_KEY_3 || '',
  process.env.API_KEY_4 || '',
  process.env.API_KEY_5 || '',
  process.env.API_KEY_6 || '',
  process.env.API_KEY_7 || '',
  process.env.API_KEY_8 || '',
  process.env.API_KEY_9 || '',
  process.env.API_KEY_10 || '',
  process.env.API_KEY_11 || '',
  process.env.API_KEY_12 || '',
  process.env.API_KEY_13 || '',
  process.env.API_KEY_14 || '',
  process.env.API_KEY_15 || '',
  process.env.API_KEY_16 || '',
  process.env.API_KEY_17 || '',
  process.env.API_KEY_18 || '',
  process.env.API_KEY_19 || '',
  process.env.API_KEY_20 || '',
  process.env.API_KEY_21 || '',
  process.env.API_KEY_22 || '',
].filter(key => key.length > 0); // Remove empty keys

// Fallback to single API_KEY if no numbered keys are set
if (API_KEYS.length === 0 && process.env.API_KEY) {
  API_KEYS.push(process.env.API_KEY);
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

// We use the pro model for complex reasoning and extraction
const MODEL_NAME = 'gemini-2.5-flash';

// Helper function to make API calls with automatic key rotation on failure
const callWithFallback = async <T>(
  apiCall: (ai: GoogleGenAI) => Promise<T>,
  maxRetries: number = API_KEYS.length
): Promise<T> => {
  let lastError: any = null;
  const triedKeys = new Set<number>();
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ai = getAiInstance();
      const result = await apiCall(ai);
      return result;
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      
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
        error?.status === 401 ||
        error?.status === 403 ||
        error?.status === 429;
      
      if (isKeyRelatedError && API_KEYS.length > 1) {
        console.warn(`API key ${currentKeyIndex + 1} failed: ${errorMessage}. Trying next key...`);
        triedKeys.add(currentKeyIndex);
        rotateToNextKey();
        
        // If we've tried all keys, throw the error
        if (triedKeys.size >= API_KEYS.length) {
          console.error("All API keys exhausted.");
          throw new Error(`All ${API_KEYS.length} API keys failed. Last error: ${errorMessage}`);
        }
        
        // Brief pause before retry with new key
        await new Promise(r => setTimeout(r, 500));
      } else {
        // Non-key-related error, throw immediately
        throw error;
      }
    }
  }
  
  throw lastError || new Error("API call failed after all retries");
};

// Section refinement types
export type SectionType = 'mainFrame' | 'header' | 'poster' | 'voiceOver' | 'veo';

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

  switch (sectionType) {
    case 'mainFrame':
      systemPrompt = MAIN_FRAME_SYSTEM_PROMPT(formData.attireType, formData.adType, formData.festivalName);
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
- Clips after the first must still start with "Continuing from the previous frame…"
- Keep all other aspects exactly the same
- Output ONLY the refined prompts separated by ###CLIP###, no explanations
- Do NOT wrap in markdown code blocks
- Make sure each prompt is clean and copy-paste ready`;
      break;

    case 'header':
      systemPrompt = HEADER_SYSTEM_PROMPT(formData.adType, formData.festivalName);
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
      systemPrompt = POSTER_SYSTEM_PROMPT(formData.adType, formData.festivalName);
      userPrompt = `You previously generated this Poster design prompt (JSON):

---CURRENT PROMPT---
${currentContent}
---END CURRENT PROMPT---

The user wants the following changes/additions:
"${additionalInstructions}"

IMPORTANT:
- Apply ONLY the requested changes to the existing JSON prompt
- Keep all other fields exactly the same
- Output ONLY the refined JSON, no explanations
- The output must be a valid JSON object
- Do NOT wrap in markdown code blocks`;
      break;

    case 'voiceOver':
      const segmentCount = formData.duration / 8;
      systemPrompt = VOICEOVER_SYSTEM_PROMPT(formData.duration, segmentCount, formData.adType, formData.festivalName);
      userPrompt = `You previously generated this Voice Over script:

---CURRENT SCRIPT---
${currentContent}
---END CURRENT SCRIPT---

The user wants the following changes/additions:
"${additionalInstructions}"

IMPORTANT:
- Apply ONLY the requested changes to the existing script
- Keep the same structure and duration
- Maintain Telugu language
- Output ONLY the refined script, no explanations`;
      break;

    case 'veo':
      const segCount = formData.duration / 8;
      systemPrompt = VEO_SEGMENT_SYSTEM_PROMPT(segCount);
      userPrompt = `You previously generated these Veo prompts:

---CURRENT PROMPTS---
${currentContent}
---END CURRENT PROMPTS---

The user wants the following changes/additions:
"${additionalInstructions}"

IMPORTANT:
- Apply ONLY the requested changes to the existing prompts
- Keep the same structure and segment count
- Output ONLY the refined prompts, no explanations
- Use ###SEGMENT### separator between segments`;
      break;

    default:
      throw new Error(`Unknown section type: ${sectionType}`);
  }

  const response = await callWithFallback(async (ai) => {
    return await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] }
      ],
      config: {
        systemInstruction: systemPrompt,
      }
    });
  });

  return response.text || currentContent;
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
  if (files.textInstructionsFile) {
    const textContent = await readFileAsText(files.textInstructionsFile);
    parts.push({ text: `Client Text File Content: ${textContent}` });
  }
  if (files.logo) {
    parts.push({ inlineData: { mimeType: files.logo.type, data: await fileToBase64(files.logo) } });
    parts.push({ text: "This is the Business Logo." });
  }
  if (files.visitingCard) {
    parts.push({ inlineData: { mimeType: files.visitingCard.type, data: await fileToBase64(files.visitingCard) } });
    parts.push({ text: "This is the Visiting Card." });
  }
  if (files.storeImage) {
    parts.push({ inlineData: { mimeType: files.storeImage.type, data: await fileToBase64(files.storeImage) } });
    parts.push({ text: "This is the Store/Office Image." });
  }
  if (files.voiceRecording) {
    parts.push({ inlineData: { mimeType: files.voiceRecording.type, data: await fileToBase64(files.voiceRecording) } });
    parts.push({ text: "This is the Client's Voice Instructions. Listen carefully." });
  }
  if (files.flyersPosters && files.flyersPosters.length > 0) {
    for (let i = 0; i < files.flyersPosters.length; i++) {
      parts.push({ inlineData: { mimeType: files.flyersPosters[i].type, data: await fileToBase64(files.flyersPosters[i]) } });
      parts.push({ text: `This is a Flyer/Offer Poster/Brochure (${i + 1} of ${files.flyersPosters.length}). Extract ALL business information, offers, services, contact details, and branding from this material.` });
    }
  }

  onProgress("Extracting business intelligence...", 30);

  const extractionResponse = await callWithFallback(async (ai) => {
    return await ai.models.generateContent({
      model: MODEL_NAME,
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
    hasProductImages: false,
    productImageCount: 0,
    stockImagePrompts: null
  };
};

export interface GenerationOptions {
  includeProductsInHeader?: boolean;
}

export const generateAdAssets = async (
  formData: AdFormData,
  files: FileStore,
  onProgress: (status: string, progress: number) => void,
  options: GenerationOptions = {}
): Promise<GeneratedOutputs> => {
  
  const { includeProductsInHeader = false } = options;
  
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
    if (files.textInstructionsFile) {
      const textContent = await readFileAsText(files.textInstructionsFile);
      parts.push({ text: `Client Text File Content: ${textContent}` });
    }

    // Process Logo
    if (files.logo) {
      parts.push({
        inlineData: {
          mimeType: files.logo.type,
          data: await fileToBase64(files.logo)
        }
      });
      parts.push({ text: "This is the Business Logo." });
    }

    // Process Visiting Card
    if (files.visitingCard) {
      parts.push({
        inlineData: {
          mimeType: files.visitingCard.type,
          data: await fileToBase64(files.visitingCard)
        }
      });
      parts.push({ text: "This is the Visiting Card." });
    }

    // Process Store Image
    if (files.storeImage) {
      parts.push({
        inlineData: {
          mimeType: files.storeImage.type,
          data: await fileToBase64(files.storeImage)
        }
      });
      parts.push({ text: "This is the Store/Office Image." });
    }

    // Process Voice Recording
    if (files.voiceRecording) {
      parts.push({
        inlineData: {
          mimeType: files.voiceRecording.type,
          data: await fileToBase64(files.voiceRecording)
        }
      });
      parts.push({ text: "This is the Client's Voice Instructions. Listen carefully." });
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
        const response = await callWithFallback(async (ai) => {
          return await ai.models.generateContent({
            model: MODEL_NAME,
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
  const extractionResponse = await callWithFallback(async (ai) => {
    return await ai.models.generateContent({
      model: MODEL_NAME,
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

  // --- Step 2: Voice Over Script (MOVED EARLIER — needed for per-clip Main Frame prompts) ---
  onProgress("Writing Voice Over script...", 20);

  const hasProductImages = files.productImages && files.productImages.length > 0;
  const productImageCount = hasProductImages ? files.productImages.length : 0;

  const segmentCount = formData.duration / 8;
  const scriptSystemPrompt = VOICEOVER_SYSTEM_PROMPT(formData.duration, segmentCount, formData.adType, formData.festivalName);
  const scriptUserPrompt = `Generate a ${formData.duration}-second Telugu voice-over script for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName}` : ''}
  DURATION: ${formData.duration} seconds (${segmentCount} segments)`;

  const scriptResponse = await callWithFallback(async (ai) => {
    return await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
          { role: 'user', parts: [{ text: scriptUserPrompt }] }
      ],
      config: {
          systemInstruction: scriptSystemPrompt,
      }
    });
  });

  const voiceOverScript = scriptResponse.text || "Failed to generate Script.";

  // Parse voice-over segments for use in multi-frame and Veo generation
  const segments: string[] = [];
  const lines = voiceOverScript.split('\n');
  let currentSegmentText = "";
  for (const line of lines) {
    if (line.trim().toLowerCase().startsWith("segment")) {
      if (currentSegmentText) segments.push(currentSegmentText.trim());
      currentSegmentText = line.split(':')[1] || "";
    } else {
      currentSegmentText += " " + line;
    }
  }
  if (currentSegmentText) segments.push(currentSegmentText.trim());
  // Fallback if parsing fails
  const parsedSegments = segments.length > 0 ? segments : Array(segmentCount).fill("Script content placeholder");

  // --- Step 3: Multi-Frame Main Frame Prompts (Per-Clip) ---
  onProgress("Generating per-clip Main Frame prompts...", 35);
  
  const multiFrameSystemPrompt = MULTI_FRAME_SYSTEM_PROMPT(
    formData.attireType, 
    formData.adType, 
    formData.festivalName,
    segmentCount,
    parsedSegments
  );
  
  // Build product image instruction for the prompt
  const productImageMainFrameNote = hasProductImages 
    ? `\n\nPRODUCT IMAGES ATTACHED: ${productImageCount} product image(s) are attached with this prompt.
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
  
  const mainFrameUserPrompt = `Generate ${segmentCount} unique Main Frame image prompts (one per 8-second clip) for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName}` : ''}
  ATTIRE: ${formData.attireType}
  TOTAL DURATION: ${formData.duration} seconds (${segmentCount} clips of 8 seconds each)
  SPECIAL CLIENT INSTRUCTIONS: ${businessInfo.specialRequirements?.customInstructions || 'None'}
  ${hasProductImages ? `\nPRODUCT IMAGES: ${productImageCount} product image(s) are being attached. You MUST include product placement instructions in the prompt. Products should appear IN THE STORE BACKGROUND (on shelves, display racks, tables) — NOT at the bottom of the frame. Products must remain EXACTLY as provided — no modifications.` : ''}
  
  VOICE-OVER SCRIPT SEGMENTS (use these to guide each frame's mood and action):
  ${parsedSegments.map((s, i) => `Clip ${i+1}: ${s}`).join('\n  ')}
  
  Generate ${segmentCount} complete, unique Main Frame image prompts now. Separate each with ###CLIP### on its own line.
  You MUST output EXACTLY ${segmentCount} prompts. Each prompt must be separated by ###CLIP### (on its own line, nothing else on that line).
  Do NOT combine multiple clips into one block. Each clip gets its own complete prompt.${productImageMainFrameNote}`;

  // Build main frame parts including product images
  const mainFrameParts: any[] = [{ text: mainFrameUserPrompt }];
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

  // Parse multi-frame response into individual clip prompts
  // First clean any code block wrappers the AI might have added
  const cleanedResponse = mainFrameRawResponse
    .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```$/gim, '');

  // Try multiple separator patterns — AI sometimes uses variations
  let rawClipPrompts: string[] = [];
  const separatorPatterns = [
    /###\s*CLIP\s*###/gi,          // ###CLIP###, ### CLIP ###, etc.
    /---\s*CLIP\s*---/gi,          // ---CLIP---
    /\n={3,}\s*\n/g,               // === separator lines
  ];

  for (const pattern of separatorPatterns) {
    const splits = cleanedResponse.split(pattern)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    if (splits.length >= segmentCount) {
      rawClipPrompts = splits;
      break;
    }
    if (splits.length > rawClipPrompts.length) {
      rawClipPrompts = splits;
    }
  }

  // If separator splitting didn't work well, try splitting by "Clip N" headers
  if (rawClipPrompts.length < segmentCount) {
    const clipHeaderSplit = cleanedResponse.split(/\n(?=Clip\s+\d+\s*[\u2013\u2014–—-])/gi)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    if (clipHeaderSplit.length > rawClipPrompts.length) {
      rawClipPrompts = clipHeaderSplit;
    }
  }

  // If we still got fewer clips than needed, retry generation once
  let mainFramePrompts: string[];
  if (rawClipPrompts.length < segmentCount && rawClipPrompts.length <= 2) {
    console.warn(`Parsed only ${rawClipPrompts.length} clips, expected ${segmentCount}. Retrying generation...`);
    const retryResponse = await generateWithRetry(
      [{ text: mainFrameUserPrompt + `\n\nIMPORTANT: You MUST generate EXACTLY ${segmentCount} separate prompts. Separate each one clearly with ###CLIP### on its own line. Do not combine clips. Output ${segmentCount} distinct prompts.` }],
      multiFrameSystemPrompt,
      'Main Frame (Multi-Clip Retry)'
    );
    const retryClean = retryResponse
      .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
      .replace(/\n?```\s*$/gim, '');
    
    let retryClips = retryClean.split(/###\s*CLIP\s*###/gi)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    if (retryClips.length < segmentCount) {
      const retryHeaderSplit = retryClean.split(/\n(?=Clip\s+\d+\s*[\u2013\u2014–—-])/gi)
        .map(p => p.trim())
        .filter(p => p.length > 0);
      if (retryHeaderSplit.length > retryClips.length) {
        retryClips = retryHeaderSplit;
      }
    }
    
    if (retryClips.length > rawClipPrompts.length) {
      rawClipPrompts = retryClips;
    }
  }

  // Final assignment
  if (rawClipPrompts.length >= segmentCount) {
    mainFramePrompts = rawClipPrompts.slice(0, segmentCount);
  } else if (rawClipPrompts.length > 0) {
    // Pad — but log a warning
    console.warn(`Final clip count: ${rawClipPrompts.length}/${segmentCount}. Padding remaining clips.`);
    mainFramePrompts = [...rawClipPrompts];
    while (mainFramePrompts.length < segmentCount) {
      mainFramePrompts.push(rawClipPrompts[rawClipPrompts.length - 1]);
    }
  } else {
    mainFramePrompts = [mainFrameRawResponse];
    while (mainFramePrompts.length < segmentCount) {
      mainFramePrompts.push(mainFrameRawResponse);
    }
  }

  // --- Step 4: Header Prompt ---
  onProgress("Generating Header prompt...", 55);

  const headerSystemPrompt = HEADER_SYSTEM_PROMPT(formData.adType, formData.festivalName);
  
  // Only include product note if products should be in header
  const productImageHeaderNote = (hasProductImages && includeProductsInHeader)
    ? `\n\nPRODUCT IMAGES ATTACHED: ${productImageCount} product image(s) are attached with this prompt.
CRITICAL PRODUCT IMAGE INSTRUCTIONS FOR HEADER:
- The attached product images MUST be incorporated into the header design
- Add a slim PRODUCT BANNER / FOOTER STRIP at the bottom of the header (within the top 8% area)
- Products should appear as small, clean thumbnail-style images in a horizontal row
- Products must be clearly visible but compact — fitting within the header's slim design
- Use the EXACT product images provided — do NOT redesign or alter the products
- This creates a "product showcase strip" that reinforces what the business sells`
    : '';
  
  const headerUserPrompt = `Generate a Header image prompt for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName}` : ''}
  
  CRITICAL INSTRUCTION: Extract ONLY essential contact details from the visiting card: Business Name, 1-2 Primary Phone Numbers, Email, Website, and Address (city/area only). Do NOT include: taglines, services list, proprietor names, or multiple addresses. Keep the header ULTRA-SLIM (5-8% max height).
  ${(hasProductImages && includeProductsInHeader) ? `\nPRODUCT IMAGES: ${productImageCount} product image(s) are being attached. Include a product banner strip in the header design.` : ''}${productImageHeaderNote}`;

  // Build header parts — include visiting card (primary source for header info), logo, and product images
  const headerParts: any[] = [{ text: headerUserPrompt }];
  
  // Attach visiting card directly to header generation — extract only essential info
  if (files.visitingCard) {
    headerParts.push({
      inlineData: {
        mimeType: files.visitingCard.type,
        data: await fileToBase64(files.visitingCard)
      }
    });
    headerParts.push({ text: `This is the VISITING CARD — extract ONLY ESSENTIAL contact information for a SLIM header:
- Business Name (EXACT as printed) — MOST PROMINENT
- 1-2 PRIMARY Phone Numbers (choose mobile/WhatsApp, skip landlines if too many)
- Email Address (single, primary one)
- Website URL
- Address (SHORT — city/locality ONLY, not full address)

DO NOT EXTRACT for the header:
- Owner/Proprietor names or designations
- Taglines or slogans
- Services list
- Multiple addresses
- Social media handles

Keep it MINIMAL — the header is a thin contact strip (5-8% height), NOT a visiting card replica.` });
  }
  
  // Attach logo directly to header generation
  if (files.logo) {
    headerParts.push({
      inlineData: {
        mimeType: files.logo.type,
        data: await fileToBase64(files.logo)
      }
    });
    headerParts.push({ text: "This is the LOGO — place this exact image as-is in the header. Do NOT recreate or redesign it." });
  }
  
  // Only include product images in header if the option is enabled
  if (hasProductImages && includeProductsInHeader) {
    for (let i = 0; i < files.productImages.length; i++) {
      headerParts.push({
        inlineData: {
          mimeType: files.productImages[i].type,
          data: await fileToBase64(files.productImages[i])
        }
      });
      headerParts.push({ text: `Product Image ${i + 1} of ${productImageCount} — include this product in the header's product banner strip.` });
    }
  }

  const headerPrompt = await generateWithRetry(
    headerParts,
    headerSystemPrompt,
    'Header'
  );

  // --- Step 5: Poster Design Prompt (JSON) ---
  onProgress("Designing Poster prompt...", 65);

  const posterSystemPrompt = POSTER_SYSTEM_PROMPT(formData.adType, formData.festivalName);
  const posterUserPrompt = `Generate an atomic-level detailed poster design prompt in JSON format for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${formData.adType}
  ${formData.adType === 'festival' ? `FESTIVAL: ${formData.festivalName}` : ''}
  Generate the complete poster design JSON now.`;

  const posterResponse = await callWithFallback(async (ai) => {
    return await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
          { role: 'user', parts: [{ text: posterUserPrompt }] }
      ],
      config: {
          systemInstruction: posterSystemPrompt,
          responseMimeType: "application/json"
      }
    });
  });

  const posterPromptRaw = posterResponse.text || "{}";
  let posterPrompt: string;
  try {
    const parsed = JSON.parse(posterPromptRaw);
    posterPrompt = JSON.stringify(parsed, null, 2);
  } catch {
    posterPrompt = posterPromptRaw;
  }

  // --- Step 6: Veo 3 Segment Prompts ---
  onProgress("Creating Veo 3 video segment prompts...", 85);

  const veoSystemPrompt = VEO_SEGMENT_SYSTEM_PROMPT(segmentCount);
  const veoUserPrompt = `Generate Veo 3 prompts for all segments.
  VOICE-OVER SEGMENTS: ${parsedSegments.map((s, i) => `Segment ${i+1}: ${s}`).join('\n')}
  Generate ${segmentCount} complete Veo 3 prompts now.`;

  const veoResponse = await callWithFallback(async (ai) => {
    return await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
          { role: 'user', parts: [{ text: veoUserPrompt }] }
      ],
      config: {
          systemInstruction: veoSystemPrompt,
      }
    });
  });

  const veoPromptsText = veoResponse.text || "";
  
  // Parse using the requested separator
  const veoPrompts = veoPromptsText.split("###SEGMENT###")
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // If separator strategy fails, fallback to whole text or newline split (simple fallback)
  const finalVeoPrompts = veoPrompts.length > 0 ? veoPrompts : [veoPromptsText];

  onProgress("Finalizing...", 100);

  return {
    businessInfo,
    mainFramePrompts,
    headerPrompt,
    posterPrompt,
    voiceOverScript,
    veoPrompts: finalVeoPrompts,
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
  const posterUserPrompt = `Generate an atomic-level detailed poster design prompt in JSON format for:
  BUSINESS INFORMATION: ${JSON.stringify(businessInfo, null, 2)}
  AD TYPE: ${adType}
  ${adType === 'festival' ? `FESTIVAL: ${festivalName}` : ''}
  ${posterInstructions ? `\nUSER POSTER INSTRUCTIONS (IMPORTANT — follow these closely):\n${posterInstructions}` : ''}
  Generate the complete poster design JSON now.`;

  const posterResponse = await callWithFallback(async (ai) => {
    return await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        { role: 'user', parts: [{ text: posterUserPrompt }] }
      ],
      config: {
        systemInstruction: posterSystemPrompt,
        responseMimeType: "application/json"
      }
    });
  });

  const posterPromptRaw = posterResponse.text || "{}";
  try {
    const parsed = JSON.parse(posterPromptRaw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return posterPromptRaw;
  }
};

// --- Stock Image Prompts (On-Demand, User-Triggered) ---
export const generateStockImagePrompts = async (
  voiceOverScript: string,
  businessInfo: any,
  adType: string,
  festivalName: string,
  theme: string = 'indian'
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

  const userPrompt = `Analyze this voice-over script and generate stock image prompts for B-roll / cutaway shots to use during video editing.

VOICE-OVER SCRIPT:
${voiceOverScript}

BUSINESS INFORMATION:
${JSON.stringify(businessInfo, null, 2)}

AD TYPE: ${adType}
${adType === 'festival' ? `FESTIVAL: ${festivalName}` : ''}

CULTURAL THEME: ${themeInstruction}
ALL people, clothing, settings, and cultural elements in every image MUST match this theme. This is NON-NEGOTIABLE.

Generate ONLY the stock image prompts that this specific script needs (1-5 maximum). Do NOT always give 5 — analyze the script and provide only what's genuinely needed for editing.`;

  const response = await callWithFallback(async (ai) => {
    return await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] }
      ],
      config: {
        systemInstruction: STOCK_IMAGE_SYSTEM_PROMPT,
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

// Transliterate Telugu voice-over script to English using Gemini AI
export const transliterateToEnglish = async (teluguText: string): Promise<string> => {
  const response = await callWithFallback(async (ai) => {
    return await ai.models.generateContent({
      model: MODEL_NAME,
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
