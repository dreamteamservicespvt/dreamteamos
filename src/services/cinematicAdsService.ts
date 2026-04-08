import { GoogleGenAI } from "@google/genai";
import type {
  ClientBrief,
  Story,
  Scene,
  CastCharacter,
  SceneFrame,
  AnimationPrompt,
  EditingGuide,
  UploadedFile,
  TargetPlatform,
} from "@/types/cinematicAds";
import { fileToBase64, readFileAsText } from "@/utils/fileHelpers";

// Reuse the same multi-key rotation system
const API_KEYS: string[] = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1;
  return (
    (import.meta.env as Record<string, string>)[`VITE_API_KEY_${n}`] ||
    (import.meta.env as Record<string, string>)[`API_KEY_${n}`] ||
    ""
  );
}).filter((k) => k.length > 0);

if (
  API_KEYS.length === 0 &&
  (import.meta.env.VITE_API_KEY || import.meta.env.API_KEY || import.meta.env.GEMINI_API_KEY)
) {
  API_KEYS.push(import.meta.env.VITE_API_KEY || import.meta.env.API_KEY || import.meta.env.GEMINI_API_KEY);
}

let currentKeyIndex = 0;
const getAi = () => new GoogleGenAI({ apiKey: API_KEYS[currentKeyIndex] || "" });
const rotateKey = () => {
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
};

async function callWithFallback<T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  const tried = new Set<number>();
  let lastErr: unknown;
  for (let i = 0; i < API_KEYS.length; i++) {
    try {
      return await fn(getAi());
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || String(err);
      const isKeyErr =
        /quota|rate|limit|invalid|api.key|401|403|429/i.test(msg) ||
        [401, 403, 429].includes(err?.status);
      if (isKeyErr && API_KEYS.length > 1) {
        tried.add(currentKeyIndex);
        rotateKey();
        if (tried.size >= API_KEYS.length) break;
        await new Promise((r) => setTimeout(r, 500));
      } else {
        throw err;
      }
    }
  }
  throw lastErr || new Error("All API keys failed");
}

const MODEL = "gemini-2.5-flash";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Step 0: Generate Client Brief ──

export async function generateClientBrief(
  files: UploadedFile[],
  platforms: TargetPlatform[],
  duration: number,
  language: string,
  dialect: string,
): Promise<ClientBrief> {
  const parts: any[] = [];

  // Attach image/document files
  for (const f of files) {
    if (f.file.type.startsWith("image/") || f.file.type === "application/pdf") {
      try {
        const b64 = await fileToBase64(f.file);
        parts.push({
          inlineData: {
            mimeType: f.file.type,
            data: b64,
          },
        });
      } catch { /* skip unreadable */ }
    } else if (f.file.type.startsWith("text/") || f.file.name.endsWith(".txt") || f.file.name.endsWith(".docx")) {
      try {
        const text = await readFileAsText(f.file);
        parts.push({ text: `[File: ${f.name} (${f.category})]\n${text}` });
      } catch { /* skip */ }
    } else if (f.file.type.startsWith("audio/")) {
      parts.push({ text: `[Audio file provided: ${f.name} (${f.category}) — please note the client has provided a voice recording]` });
    }
  }

  const fileList = files.map((f) => `- ${f.name} (${f.category})`).join("\n");

  parts.push({
    text: `You are a world-class advertising creative director. Analyze all the uploaded client materials and generate a structured Client Brief Summary.

Uploaded files:
${fileList}

Target Platforms: ${platforms.join(", ")}
Ad Duration: ${duration} seconds
Language: ${language}
Dialect Notes: ${dialect || "None"}

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "businessName": "string",
  "businessType": "string",
  "coreServices": "string — comma-separated list",
  "targetAudience": "string",
  "keyMessage": "string — the USP or core message",
  "toneAndStyle": "string",
  "brandColors": ["#hex1", "#hex2", "#hex3"] — extract from logo/visiting card, at least 3 colors,
  "duration": ${duration},
  "platforms": ${JSON.stringify(platforms)},
  "language": "${language}",
  "dialect": "${dialect || ""}"
}

Be specific, not generic. Extract real business details from the materials.`,
  });

  return callWithFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
    });
    const text = resp.text?.trim() || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as ClientBrief;
  });
}

// ── Step 1: Generate 5 Stories ──

export async function generateStories(
  brief: ClientBrief,
  tone?: string,
): Promise<Story[]> {
  const prompt = `You are a world-class cinematic advertising storyteller — the kind who creates billion-dollar Super Bowl ads, award-winning brand films, and emotionally gripping short-form content.

CLIENT BRIEF:
${JSON.stringify(brief, null, 2)}

${tone ? `CREATIVE TONE DIRECTION: ${tone}` : ""}

Generate exactly 5 COMPLETELY DIFFERENT story variations for a ${brief.duration}-second cinematic video advertisement. Each story must be production-ready, not a generic template.

Return ONLY valid JSON (no markdown fences) as an array of 5 story objects:
[
  {
    "id": "unique-id",
    "title": "Creative Story Title",
    "conceptSummary": "2-3 sentence elevator pitch",
    "emotionalArc": "Curiosity → Surprise → Warmth → Pride → Call to Action",
    "totalDuration": "${brief.duration} seconds",
    "numberOfScenes": number,
    "scenes": [
      {
        "sceneNumber": 1,
        "duration": "6 sec",
        "visualDescription": "What the viewer SEES — setting, characters, actions, objects, lighting in vivid detail",
        "cameraDirection": "Shot type + camera movement (e.g., Close-up, dolly-in, slight left pan)",
        "voiceoverText": "Exact words spoken in ${brief.language}",
        "voiceoverTone": "Warm / authoritative / whispering / energetic",
        "emotionalBeat": "What the viewer should FEEL",
        "soundDesignNotes": "Background sounds: music, ambient, SFX"
      }
    ]
  }
]

RULES:
- Total scene durations must add up to approximately ${brief.duration} seconds
- Each story must have a unique creative angle
- Voiceover text must be in ${brief.language}
- Include the business name "${brief.businessName}" naturally
- Brand colors ${brief.brandColors.join(", ")} should be referenced in visual descriptions
- Each scene must have ALL fields filled with specific, actionable content`;

  return callWithFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const text = resp.text?.trim() || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const stories = JSON.parse(cleaned) as Story[];
    return stories.map((s) => ({ ...s, id: s.id || uid() }));
  });
}

export async function refineStory(
  story: Story,
  brief: ClientBrief,
  feedback: string,
): Promise<Story> {
  const prompt = `You are a world-class cinematic ad storyteller. Refine this story based on feedback.

CURRENT STORY:
${JSON.stringify(story, null, 2)}

CLIENT BRIEF:
${JSON.stringify(brief, null, 2)}

USER FEEDBACK: "${feedback}"

Return ONLY valid JSON (no markdown fences) with the refined story in the same structure. Keep the same id. Apply ONLY the requested changes.`;

  return callWithFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const text = resp.text?.trim() || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as Story;
  });
}

// ── Step 2: Casting — Character Extraction ──

export async function extractCharacters(story: Story, brief: ClientBrief): Promise<CastCharacter[]> {
  const prompt = `You are a cinematic casting director. Analyze this story and identify ALL characters needed.

STORY:
${JSON.stringify(story, null, 2)}

CLIENT BRIEF (for ethnicity/cultural context):
Business: ${brief.businessName} (${brief.businessType})
Language: ${brief.language}
Tone: ${brief.toneAndStyle}

For each character, generate a detailed Nano Banana (Gemini image generation) prompt.

Return ONLY valid JSON (no markdown fences) as an array:
[
  {
    "id": "unique-id",
    "role": "Father / Main character",
    "physicalDescription": "Age, gender, ethnicity, build, skin tone, height",
    "clothingDescription": "Exact outfit with colors and style",
    "hairstyle": "Detailed hairstyle description",
    "accessories": "Watches, jewelry, glasses, etc.",
    "personalityNotes": "Character personality for expression guidance",
    "nanoBananaPrompt": "A hyper-detailed prompt for Nano Banana to generate this character: 'Photorealistic portrait of a [age] [gender] [ethnicity] person, [build], wearing [exact clothing], [hairstyle], [expression], [skin tone], clean white background, studio lighting, high detail, 8K quality, consistent character design'",
    "images": [
      { "id": "img1", "type": "front_portrait", "label": "Front-Facing Portrait", "approved": false, "versions": [] },
      { "id": "img2", "type": "three_quarter", "label": "3/4 Profile", "approved": false, "versions": [] },
      { "id": "img3", "type": "full_body", "label": "Full Body Standing", "approved": false, "versions": [] }
    ]
  }
]

Make the Nano Banana prompts extremely specific — skin tone, exact clothing colors, fabric textures, lighting style. The goal is character consistency across all images.`;

  return callWithFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const text = resp.text?.trim() || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const chars = JSON.parse(cleaned) as CastCharacter[];
    return chars.map((c) => ({
      ...c,
      id: c.id || uid(),
      images: (c.images || []).map((img) => ({ ...img, id: img.id || uid() })),
    }));
  });
}

// ── Step 3: Frame Generation Prompts ──

export async function generateFramePrompts(
  story: Story,
  characters: CastCharacter[],
  brief: ClientBrief,
): Promise<SceneFrame[]> {
  const aspectRatio = brief.platforms.includes("youtube") || brief.platforms.includes("tv_broadcast") ? "16:9" : "9:16";

  const prompt = `You are a cinematic frame composition director. Generate Nano Banana image generation prompts for each scene.

APPROVED STORY:
${JSON.stringify(story, null, 2)}

CAST CHARACTERS:
${JSON.stringify(characters.map((c) => ({ role: c.role, id: c.id, physicalDescription: c.physicalDescription, clothingDescription: c.clothingDescription })), null, 2)}

CLIENT BRIEF:
Brand Colors: ${brief.brandColors.join(", ")}
Business: ${brief.businessName}
Target Platform Aspect Ratio: ${aspectRatio}

For each scene, determine the frame type and generate the Nano Banana prompt.

Frame types:
- "single_start": Most scenes — one composed frame (for Image-to-Video animation)
- "start_end": Transition scenes with camera movement (for Veo First+Last Frame mode) — generate 2 prompts
- "ingredients": Complex scenes with multiple separate elements (2-4 ingredient images)
- "poster_end": Final scene — logo reveal, business name, tagline, contact info (uses brand assets, NOT cast images)

Return ONLY valid JSON (no markdown fences) as an array:
[
  {
    "sceneNumber": 1,
    "frameType": "single_start",
    "prompt": "Detailed Nano Banana prompt including: scene description, character placement (referencing cast by role), camera angle, lighting (direction, quality, color temperature), color palette (brand colors), mood/atmosphere, aspect ratio ${aspectRatio}. Include instruction: 'Attach [Character Role] Front Portrait as reference for face consistency.'",
    "characterRefs": ["character-id-1", "character-id-2"],
    "images": [{ "id": "unique", "label": "Scene 1 Start Frame", "approved": false }],
    "qcChecklist": {}
  }
]

RULES:
- Every prompt must include lighting, color palette, and mood
- characterRefs should list IDs of characters in the scene
- The last scene MUST be "poster_end" type with logo/business info
- For "start_end" type, include TWO images (start frame + end frame) in the images array
- For "ingredients" type, include 2-4 separate ingredient images
- Include specific instructions about which cast images to attach as references`;

  return callWithFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const text = resp.text?.trim() || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const frames = JSON.parse(cleaned) as SceneFrame[];
    return frames.map((f) => ({
      ...f,
      images: (f.images || []).map((img) => ({ ...img, id: img.id || uid() })),
      qcChecklist: f.qcChecklist || {},
    }));
  });
}

// ── Step 4: Animation Prompts ──

export async function generateAnimationPrompts(
  story: Story,
  sceneFrames: SceneFrame[],
  brief: ClientBrief,
): Promise<AnimationPrompt[]> {
  const aspectRatio = brief.platforms.includes("youtube") || brief.platforms.includes("tv_broadcast") ? "16:9" : "9:16";

  const prompt = `You are an AI video animation director with expert knowledge of Veo 3.1 and Grok Imagine 1.0 (March 2026).

STORY SCENES:
${JSON.stringify(story.scenes, null, 2)}

FRAME TYPES:
${JSON.stringify(sceneFrames.map((f) => ({ scene: f.sceneNumber, frameType: f.frameType, imageCount: f.images.length })), null, 2)}

CLIENT BRIEF:
Duration: ${brief.duration}s, Language: ${brief.language}, Platforms: ${brief.platforms.join(", ")}

PLATFORM CAPABILITIES:
Veo 3.1: Text-to-Video, Image-to-Video, First+Last Frame, Ingredients (up to 3-4 refs), Scene Extension. Durations: 4/6/8s. Resolutions: 720p/1080p/4K. Native audio (dialogue, SFX, ambient). Pricing: $0.15-$0.40/sec.
Grok Imagine 1.0: Text-to-Video, Image-to-Video, Multi-Image (up to 7 refs), Extend from Frame. Duration: up to 10s. Resolution: 720p only. Native audio. Pricing: $0.05/sec.

CRITICAL: Grok does NOT have First+Last Frame interpolation. For start-to-end transitions, ALWAYS use Veo.

SELECTION MATRIX:
- Defined start+end composition → Veo First+Last Frame
- Single frame with motion → Veo or Grok Image-to-Video
- Scene needing dialogue → Veo (synchronized dialogue)
- 4+ visual elements → Grok Multi-Image (up to 7)
- 2-3 reference elements → Veo Ingredients
- Continue from previous clip → Veo Scene Extension
- Continue from final frame → Grok Extend from Frame
- Cost-sensitive → Grok (cheaper)
- Need 1080p/4K → Veo only
- Poster/logo reveal → Veo (text legibility)

For each scene, generate an animation prompt with platform and mode recommendation.

Return ONLY valid JSON (no markdown fences) as an array:
[
  {
    "sceneNumber": 1,
    "platform": "veo" or "grok",
    "mode": "image_to_video" / "first_last_frame" / "ingredients" / "scene_extension" / "multi_image" / "extend_from_frame",
    "attachInstructions": "Upload Scene 1 Start Frame. Attach Father Front Portrait for face reference.",
    "prompt": "Detailed animation prompt: motion description, camera movement, what happens, emotion, continuity notes",
    "duration": "6s",
    "aspectRatio": "${aspectRatio}",
    "audioCues": "Voiceover: '[exact text in ${brief.language}]'. Background: [ambient sounds]. Music: [mood description]",
    "negativePrompt": "No face morphing, no jittery movement, no sudden cuts, maintain character consistency",
    "approved": false
  }
]

RULES:
- Duration per clip: 4, 6, or 8 for Veo; up to 10 for Grok
- Total durations should approximately match ${brief.duration}s
- Include voiceover text in ${brief.language} in audioCues
- Negative prompt should prevent common AI video artifacts`;

  return callWithFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const text = resp.text?.trim() || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as AnimationPrompt[];
  });
}

// ── Step 5: Editing Guide ──

export async function generateEditingGuide(
  story: Story,
  animationPrompts: AnimationPrompt[],
  brief: ClientBrief,
): Promise<EditingGuide> {
  const prompt = `You are a professional video editor creating a complete CapCut editing guide for a cinematic ad.

STORY:
${JSON.stringify(story, null, 2)}

ANIMATED CLIPS:
${JSON.stringify(animationPrompts.map((a) => ({ scene: a.sceneNumber, duration: a.duration, platform: a.platform })), null, 2)}

CLIENT BRIEF:
Business: ${brief.businessName}, Duration: ${brief.duration}s, Language: ${brief.language}, Platforms: ${brief.platforms.join(", ")}, Brand Colors: ${brief.brandColors.join(", ")}

Generate a COMPLETE, SPECIFIC editing guide — not vague suggestions. Include exact timing, font names, BGM recommendations.

Return ONLY valid JSON (no markdown fences):
{
  "assembly": [
    {
      "clipLabel": "Scene 1 — Opening",
      "duration": "0:00 - 0:06",
      "transition": "Hard Cut / Dissolve / Whip Pan / Match Cut",
      "notes": "Why this transition fits and pacing notes"
    }
  ],
  "audioLayers": [
    {
      "type": "BGM",
      "description": "Specific BGM recommendation with mood/genre and search keywords for CapCut/Epidemic Sound/Artlist",
      "startTime": "0:00",
      "endTime": "${brief.duration}s",
      "volume": "60%",
      "fadeIn": "0-2s",
      "fadeOut": "last 3s",
      "notes": "Swell at midpoint, drop at logo reveal"
    },
    {
      "type": "Voiceover",
      "description": "Voice timing markers per scene",
      "startTime": "0:00",
      "endTime": "${brief.duration}s",
      "volume": "100%"
    },
    {
      "type": "SFX",
      "description": "Per-scene sound effects with exact timestamps",
      "startTime": "0:00",
      "endTime": "${brief.duration}s",
      "volume": "40%",
      "notes": "Scene 1 at 0.5s: [sound], at 2s: [sound], etc."
    },
    {
      "type": "Stinger",
      "description": "Logo reveal stinger — deep bass + shimmer",
      "startTime": "Xs",
      "endTime": "Xs",
      "volume": "80%"
    }
  ],
  "textOverlays": [
    {
      "text": "Exact text to display",
      "timing": "12s - 17s",
      "font": "Specific font name (Telugu: Mandali/Ramabhadra/NTR/Noto Sans Telugu, English Headlines: Bebas Neue/Montserrat Bold/Oswald, English Body: Inter/Open Sans/Poppins)",
      "size": "48px / 32px / 24px",
      "position": "Lower third / Center / Top bar",
      "color": "#FFFFFF with dark shadow / brand color on solid bar",
      "animation": "Fade Up / Scale In / Tracking In / Typewriter"
    }
  ],
  "colorGrading": {
    "overallLook": "Cinematic warm tones / Cool corporate / etc.",
    "temperature": "Warm (+10) / Neutral / Cool (-5)",
    "contrast": "Medium-high / Low / etc.",
    "saturation": "Slightly boosted / Natural / etc.",
    "highlights": "Soft warm highlights",
    "shadows": "Deep but not crushed",
    "notes": "Specific CapCut LUT filter recommendation + brand color enhancement notes"
  },
  "exportSettings": [
    { "platform": "YouTube", "resolution": "1920x1080", "frameRate": "24fps", "codec": "H.264", "bitrate": "10 Mbps", "format": "MP4" },
    { "platform": "Instagram Reels", "resolution": "1080x1920", "frameRate": "30fps", "codec": "H.264", "bitrate": "8 Mbps", "format": "MP4" },
    { "platform": "Instagram Feed", "resolution": "1080x1080", "frameRate": "30fps", "codec": "H.264", "bitrate": "8 Mbps", "format": "MP4" },
    { "platform": "TV / Broadcast", "resolution": "1920x1080", "frameRate": "25fps (PAL)", "codec": "H.264 High Profile", "bitrate": "15 Mbps", "format": "MP4" },
    { "platform": "WhatsApp Status", "resolution": "1080x1920", "frameRate": "30fps", "codec": "H.264", "bitrate": "5 Mbps", "format": "MP4 (max 30 sec)" }
  ]
}

Be extremely specific — exact timestamps, exact fonts, exact BGM search terms.`;

  return callWithFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const text = resp.text?.trim() || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as EditingGuide;
  });
}
