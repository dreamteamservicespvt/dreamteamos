import type { GoogleGenAI } from "@google/genai";
import { callGeminiWithFallback } from "./geminiService";
import type {
  AdFormatId,
  AdFormatSelection,
  ClientBrief,
  Clip,
  ClipType,
  Story,
  CastCharacter,
  StoryboardBoard,
  EditingGuide,
  UploadedFile,
  TargetPlatform,
} from "@/types/cinematicAds";
import {
  AD_FORMAT_PRESETS,
  MAX_STORYBOARD_PANELS,
  describeAdFormat,
  effectiveAdFormatPreset,
  suggestedClipCount,
} from "@/types/cinematicAds";
import { clampPanelCount, imagePromptCountFor, splitScenesIntoBoards } from "@/utils/cinematicAds";
import { fileToBase64, readFileAsText } from "@/utils/fileHelpers";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** Ask for JSON, strip whatever fencing the model adds anyway, and parse. */
async function generateJson<T>(prompt: string, extraParts: any[] = []): Promise<T> {
  return callGeminiWithFallback(async (ai: GoogleGenAI, model: string) => {
    const resp = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [...extraParts, { text: prompt }] }],
    });
    const text = resp.text?.trim() || "";
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Models sometimes wrap the payload in prose; salvage the outermost JSON value.
      const first = cleaned.search(/[[{]/);
      const last = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
      if (first >= 0 && last > first) {
        return JSON.parse(cleaned.slice(first, last + 1)) as T;
      }
      throw new Error("The AI returned a response that could not be read. Try again.");
    }
  });
}

function aspectRatioFor(platforms: TargetPlatform[]): string {
  if (platforms.includes("youtube") || platforms.includes("tv_broadcast")) return "16:9";
  if (platforms.includes("instagram_feed")) return "1:1";
  return "9:16";
}

/** The block of format rules every creative prompt starts from. */
function formatDirective(selection: AdFormatSelection): string {
  const preset = effectiveAdFormatPreset(selection);
  const lines = [
    `AD FORMAT (this decides the whole ad): ${describeAdFormat(selection)}`,
    `Format meaning: ${preset.description}`,
    preset.voForm === "dialogue"
      ? "The words are DIALOGUE spoken on camera by named characters. Every line must be attributed to a speaker, must be lip-syncable, and must sound like a real person talking — not narration read aloud."
      : "The words are a VOICE OVER laid over picture. No character speaks on camera. The narration must work against what is shown, never merely describe it.",
  ];

  if (preset.supportsPairing && selection.pairing) {
    const pairing = {
      female_female: "Both speakers are female.",
      male_female: "One speaker is male and one is female.",
      male_male: "Both speakers are male.",
    }[selection.pairing];
    lines.push(`Cast pairing: ${pairing}`);
  }
  if (preset.supportsSpeakerRole && selection.speakerRole) {
    lines.push(
      selection.speakerRole === "owner"
        ? `The single speaker is the business owner/founder${selection.speakerGender ? ` (${selection.speakerGender})` : ""}, speaking in first person about their own business.`
        : `The single speaker is a real customer${selection.speakerGender ? ` (${selection.speakerGender})` : ""} giving an unscripted-sounding testimonial. Never let them sound like an announcer.`,
    );
  }
  if (preset.supportsCharacterCount && selection.characterCount) {
    lines.push(`Use exactly ${selection.characterCount} distinct characters.`);
  }
  if (preset.castingRequirement === "none") {
    lines.push("NO human characters appear in this ad at all. Carry it on product, place, texture, craft and light.");
  }

  return lines.join("\n");
}

/** The quality bar, repeated because it is the whole point of the product. */
const QUALITY_BAR = `QUALITY BAR — non-negotiable:
- This is a commercial, world-class production. Someone watching must FEEL something, not just be informed.
- Emotion first: every beat has a human stake. No generic "we deliver quality service" copy.
- The ad must be DIRECTED. Every shot names a real camera movement (dolly, push in, crane, orbit, handheld follow, rack focus). A locked-off static shot is a failure unless stillness is a deliberate beat.
- Specific beats specific-sounding. Real details, real places, real behaviour — never stock-photo abstraction.`;

// ── Step 0: Client Brief ──

export interface GeneratedBriefResult {
  brief: ClientBrief;
  /** Set only when the operator asked the AI to choose the format. */
  chosenFormatId?: AdFormatId;
  choiceReason?: string;
}

export async function generateClientBrief(args: {
  files: UploadedFile[];
  businessInformation: string;
  clientRequirement: string;
  ourNote: string;
  adFormat: AdFormatSelection;
  platforms: TargetPlatform[];
  duration: number;
  language: string;
  dialect: string;
}): Promise<GeneratedBriefResult> {
  const { files, businessInformation, clientRequirement, ourNote, adFormat, platforms, duration, language, dialect } = args;
  const parts: any[] = [];

  for (const f of files) {
    if (!f.file) continue;
    if (f.file.type.startsWith("image/") || f.file.type === "application/pdf") {
      try {
        parts.push({ inlineData: { mimeType: f.file.type, data: await fileToBase64(f.file) } });
      } catch { /* skip unreadable */ }
    } else if (f.file.type.startsWith("text/") || f.name.endsWith(".txt") || f.name.endsWith(".docx")) {
      try {
        parts.push({ text: `[File: ${f.name} (${f.category})]\n${await readFileAsText(f.file)}` });
      } catch { /* skip */ }
    } else if (f.file.type.startsWith("audio/")) {
      parts.push({ text: `[Audio provided: ${f.name} (${f.category}) — the client recorded their own voice]` });
    }
  }

  const needsFormatChoice = adFormat.formatId === "ai_decides";
  const formatMenu = AD_FORMAT_PRESETS.filter((p) => p.id !== "ai_decides")
    .map((p) => `- ${p.id}: ${p.label} — ${p.description} (best for: ${p.bestFor})`)
    .join("\n");

  const prompt = `You are a world-class advertising creative director. Build a structured Client Brief.

The operator has TYPED the following. This is the source of truth. The uploaded files are only supporting evidence — where they disagree with the typed text, the typed text wins.

── CLIENT: BUSINESS INFORMATION ──
${businessInformation || "(not provided — infer from the uploaded files)"}

── CLIENT REQUIREMENT (how the client expects the output) ──
${clientRequirement || "(not provided)"}

── OUR NOTE (internal creative direction — treat as a direct instruction, not a suggestion) ──
${ourNote || "(none)"}

Uploaded files:
${files.map((f) => `- ${f.name} (${f.category})`).join("\n") || "(none)"}

Target platforms: ${platforms.join(", ") || "not set"}
Duration: ${duration} seconds
Language: ${language}
Dialect notes: ${dialect || "none"}
${needsFormatChoice ? "" : `Chosen ad format: ${describeAdFormat(adFormat)}`}

Return ONLY valid JSON, no markdown fences:
{
  "brief": {
    "businessName": "string",
    "businessType": "string",
    "coreServices": "comma-separated",
    "targetAudience": "who this ad must move, specifically",
    "keyMessage": "the one thing the viewer must walk away with",
    "toneAndStyle": "string",
    "brandColors": ["#hex", "#hex", "#hex"],
    "duration": ${duration},
    "platforms": ${JSON.stringify(platforms)},
    "language": "${language}",
    "dialect": "${dialect || ""}"
  }${
    needsFormatChoice
      ? `,
  "chosenFormatId": "one id from the list below",
  "choiceReason": "one or two sentences on why this format suits THIS business and requirement"`
      : ""
  }
}
${
  needsFormatChoice
    ? `\nChoose the ad format from exactly these ids:\n${formatMenu}\n\nPick the format that will actually move this audience, not the most elaborate one. A format needing lip-sync only wins if the words genuinely need a face.`
    : ""
}

Extract real details. Brand colors must come from the logo or visiting card, not invented. Never return placeholder text.`;

  const raw = await generateJson<GeneratedBriefResult>(prompt, parts);
  const brief: ClientBrief = {
    ...raw.brief,
    duration,
    platforms,
    language,
    dialect,
    clientRequirement,
    ourNote,
  };
  return { brief, chosenFormatId: raw.chosenFormatId, choiceReason: raw.choiceReason };
}

// ── Step 1: Stories + voice over ──

export async function generateStories(brief: ClientBrief, adFormat: AdFormatSelection, tone?: string): Promise<Story[]> {
  const preset = effectiveAdFormatPreset(adFormat);
  const clipCount = suggestedClipCount(preset, brief.duration);

  const prompt = `You are a world-class cinematic advertising storyteller — the kind who writes Super Bowl spots and award-winning brand films.

${formatDirective(adFormat)}

CLIENT BRIEF:
${JSON.stringify({ ...brief, clientRequirement: undefined, ourNote: undefined }, null, 2)}

CLIENT REQUIREMENT (how the client expects the output):
${brief.clientRequirement || "(none given)"}

OUR NOTE (internal direction — obey it):
${brief.ourNote || "(none)"}

${tone ? `CREATIVE TONE: ${tone}` : ""}

${QUALITY_BAR}

Write exactly 5 COMPLETELY DIFFERENT stories for a ${brief.duration}-second cinematic ad. Aim for about ${clipCount} scenes each, and never more than ${MAX_STORYBOARD_PANELS * 2} scenes.

Return ONLY valid JSON, no markdown fences, an array of 5 objects:
[
  {
    "id": "unique-id",
    "title": "Story title",
    "conceptSummary": "2-3 sentence pitch",
    "emotionalArc": "Curiosity -> Recognition -> Warmth -> Pride -> Action",
    "whyItLands": "One honest sentence: why a real viewer feels this, and what the turn is",
    "totalDuration": "${brief.duration} seconds",
    "numberOfScenes": number,
    "scenes": [
      {
        "sceneNumber": 1,
        "duration": "6 sec",
        "visualDescription": "What the viewer SEES — setting, people, action, objects, light, in vivid specific detail",
        "cameraDirection": "Shot size + a REAL camera movement, e.g. 'Medium close-up, slow dolly in with a slight left drift'",
        "voiceoverText": "${preset.voForm === "dialogue" ? "The spoken line, in " + brief.language + ", prefixed with the speaker, e.g. 'MOTHER: ...'" : "The narration for this scene, in " + brief.language}",
        "voiceoverTone": "Warm / wry / hushed / driving",
        "emotionalBeat": "What the viewer FEELS here",
        "soundDesignNotes": "Music, ambience, specific SFX"
      }
    ],
    "voScript": "The COMPLETE ${preset.voForm === "dialogue" ? "dialogue script with speaker names" : "voice over script"} for the whole ad in ${brief.language}, as one clean block ready to hand to a voice artist. Plain text with line breaks.",
    "voLines": [
      { "sceneNumber": 1, ${preset.voForm === "dialogue" ? '"speaker": "MOTHER", ' : ""}"text": "the line in ${brief.language}", "tone": "delivery note" }
    ]
  }
]

RULES:
- Scene durations must add up to roughly ${brief.duration} seconds.
- Every story is a genuinely different angle — not five dressings of one idea.
- All spoken words are in ${brief.language}${brief.dialect ? ` (${brief.dialect})` : ""}.
- "${brief.businessName}" appears naturally, never shoehorned.
- Brand colors ${brief.brandColors.join(", ")} appear in the visual descriptions.
- Every cameraDirection names an actual movement. No "static shot" unless the stillness is the point.
- Every field filled with specific, shootable content.`;

  const stories = await generateJson<Story[]>(prompt);
  return stories.map((s) => ({ ...s, id: s.id || uid() }));
}

export async function refineStory(story: Story, brief: ClientBrief, adFormat: AdFormatSelection, feedback: string): Promise<Story> {
  const prompt = `You are a world-class cinematic ad storyteller. Refine this story against the feedback.

${formatDirective(adFormat)}

CURRENT STORY:
${JSON.stringify(story, null, 2)}

CLIENT BRIEF:
${JSON.stringify(brief, null, 2)}

FEEDBACK: "${feedback}"

Apply ONLY what the feedback asks. Keep everything else intact, keep the same id, and keep voScript and voLines in step with any changed lines.

Return ONLY valid JSON, no markdown fences, in the same structure.`;

  return generateJson<Story>(prompt);
}

// ── Step 2: Storyboard preview ──

/**
 * Prompts for boards that show the whole ad at a glance.
 *
 * Capped at nine panels per image: past that an image model stops honouring the panel
 * layout, so a long ad becomes two boards rather than one unusable one.
 */
export async function generateStoryboardPrompts(
  story: Story,
  brief: ClientBrief,
  adFormat: AdFormatSelection,
): Promise<StoryboardBoard[]> {
  const aspectRatio = aspectRatioFor(brief.platforms);
  const ranges = splitScenesIntoBoards(story.scenes.length);

  const prompt = `You are a storyboard artist. Produce ONE image-generation prompt per board below, each rendering the ad's scenes as labelled panels inside a SINGLE image.

${formatDirective(adFormat)}

STORY:
${JSON.stringify(story, null, 2)}

Brand colors: ${brief.brandColors.join(", ")}
Business: ${brief.businessName}
Aspect ratio of the final ad: ${aspectRatio}

BOARDS TO WRITE (never merge them, never exceed ${MAX_STORYBOARD_PANELS} panels in one image):
${ranges.map((r, i) => `Board ${i + 1}: scenes ${r.firstScene} to ${r.lastScene} (${r.lastScene - r.firstScene + 1} panels)`).join("\n")}

Return ONLY valid JSON, no markdown fences:
[
  {
    "label": "Board 1 — Scenes 1-${ranges[0]?.lastScene ?? 1}",
    "panelCount": number,
    "firstScene": number,
    "lastScene": number,
    "prompt": "A complete image prompt describing a storyboard contact sheet: state the grid (e.g. '3x3 grid of 9 panels, thin white gutters, numbered 1-9 in the corner of each panel'), then describe EACH panel in order with its setting, characters, action and camera framing. Specify a consistent cinematic look, the brand palette, and ${aspectRatio} panels. End with: 'Consistent characters and lighting across all panels. Clean, legible panel numbers. No text or captions inside the panels.'"
  }
]

The prompt must be self-contained — someone pasting it into an image model with no other context must get a usable board.`;

  const boards = await generateJson<StoryboardBoard[]>(prompt);
  return boards.slice(0, ranges.length).map((b, i) => ({
    ...b,
    id: uid(),
    firstScene: b.firstScene ?? ranges[i].firstScene,
    lastScene: b.lastScene ?? ranges[i].lastScene,
    panelCount: Math.min(MAX_STORYBOARD_PANELS, b.panelCount || ranges[i].lastScene - ranges[i].firstScene + 1),
  }));
}

// ── Step 3: Casting ──

export async function extractCharacters(story: Story, brief: ClientBrief, adFormat: AdFormatSelection): Promise<CastCharacter[]> {
  const preset = effectiveAdFormatPreset(adFormat);
  if (preset.castingRequirement === "none") return [];

  const prompt = `You are a cinematic casting director. Identify every character this story needs.

${formatDirective(adFormat)}

STORY:
${JSON.stringify(story, null, 2)}

CONTEXT: ${brief.businessName} (${brief.businessType}). Language ${brief.language}, so cast and wardrobe must read as culturally correct for that audience. Tone: ${brief.toneAndStyle}.

Return ONLY valid JSON, no markdown fences:
[
  {
    "id": "unique-id",
    "role": "Father / Shop owner / Bride",
    "physicalDescription": "Age, gender, ethnicity, build, skin tone, height",
    "clothingDescription": "Exact outfit with colors, fabrics and condition",
    "hairstyle": "Detailed",
    "accessories": "Watch, bangles, glasses, bindi, etc.",
    "personalityNotes": "How they carry themselves, for expression guidance",
    "nanoBananaPrompt": "A hyper-specific image prompt for a character reference sheet: 'Photorealistic portrait of a [age] [gender] [ethnicity] person, [build], wearing [exact clothing with colors and fabric], [hairstyle], [accessories], [expression], [skin tone], plain neutral background, soft studio key light with gentle fill, 85mm lens, shallow depth of field, high detail, consistent character design'",
    "images": [
      { "id": "img1", "type": "front_portrait", "label": "Front-Facing Portrait", "approved": false, "versions": [] },
      { "id": "img2", "type": "three_quarter", "label": "3/4 Profile", "approved": false, "versions": [] },
      { "id": "img3", "type": "full_body", "label": "Full Body Standing", "approved": false, "versions": [] }
    ]
  }
]

The prompts decide whether the same face survives every clip, so be exhaustive about skin tone, exact garment colors, fabric texture and lighting.${
    preset.voForm === "dialogue" ? " These characters speak on camera, so note anything that affects the mouth and jaw: beard, moustache, veil, mask." : ""
  }`;

  const chars = await generateJson<CastCharacter[]>(prompt);
  return chars.map((c) => ({
    ...c,
    id: c.id || uid(),
    images: (c.images || []).map((img) => ({ ...img, id: img.id || uid(), versions: img.versions || [] })),
  }));
}

// ── Step 4: Clips ──

/** The shared instruction block describing what a single clip object must contain. */
function clipSchemaBlock(aspectRatio: string, language: string, platformRule: string): string {
  return `{
  "clipNumber": number,
  "sceneNumbers": [which story scene numbers this clip covers],
  "title": "Short label, e.g. 'The shop at dawn'",
  "clipType": "single" | "start_end" | "storyboard",
  "panelCount": number (ONLY for clipType "storyboard", between 3 and ${MAX_STORYBOARD_PANELS}),
  "imagePrompts": [
    {
      "label": "Single Frame" | "Start Frame" | "End Frame" | "Storyboard — N panels",
      "prompt": "A complete image-generation prompt: subject and action, character placement by role, shot size, lens, lighting (direction, quality, color temperature), color palette including the brand colors, mood, background detail, and ${aspectRatio} aspect ratio.",
      "attachInstructions": "Which reference images to attach, e.g. 'Attach Father — Front Portrait for face consistency, and the logo PNG.'",
      "approved": false
    }
  ],
  "animationPrompt": "How this frame comes alive: what moves, in what order, at what speed, plus the performance and the emotional register. Written for a video model.",
  "cameraMove": "The camera movement on its own, naming a real move: 'Slow dolly in, 12% push over 6s, slight handheld float'",
  "voScript": "The exact words heard over or in this clip, in ${language}. Empty string if this clip is silent.",
  "voTone": "Delivery note for those words",
  "duration": "6s",
  "aspectRatio": "${aspectRatio}",
  "negativePrompt": "no face morphing, no warped hands, no jittery motion, no text artifacts, no sudden cuts, maintain character consistency",
  "platform": "veo" | "grok",
  "mode": "image_to_video" | "first_last_frame" | "ingredients" | "scene_extension" | "multi_image" | "extend_from_frame",
  "qcChecklist": {},
  "approved": false
}`
    .concat(`

CLIP TYPE RULES:
- "single" — ONE image prompt. Use for conversation, dialogue and any clip where a person speaks.
- "start_end" — EXACTLY TWO image prompts, labelled "Start Frame" and "End Frame". Use when the scene travels: a different place, time, framing or state at the end. Animate with Veo first_last_frame; Grok cannot interpolate between two frames.
- "storyboard" — ONE image prompt producing "panelCount" panels inside a single image, 3 to ${MAX_STORYBOARD_PANELS}. Never more than ${MAX_STORYBOARD_PANELS}: past that the model stops following the layout. Use for multi-beat montage clips.

PLATFORM RULES:
${platformRule}
- Veo clips are 4, 6 or 8 seconds. Grok clips are up to 10 seconds.
- Poster, logo and any on-screen text goes to Veo for legibility.

CAMERA RULE (this is the difference between a commercial and AI slop):
- "cameraMove" must name a real movement — dolly, truck, crane, jib, push in, pull out, orbit, arc, handheld follow, rack focus, drone. Never "static", never "cinematic camera", never left blank.`);
}

export async function generateClips(
  story: Story,
  characters: CastCharacter[],
  brief: ClientBrief,
  adFormat: AdFormatSelection,
): Promise<Clip[]> {
  const preset = effectiveAdFormatPreset(adFormat);
  const aspectRatio = aspectRatioFor(brief.platforms);
  const platformRule =
    preset.animationPlatform === "veo_only"
      ? '- This format needs lip-synced dialogue, so EVERY clip with a speaking character uses "veo". Grok has no lip-sync.'
      : '- No lip-sync is needed, so cheaper "grok" is fine for simple motion. Use "veo" for start_end interpolation, on-screen text, and anything needing 1080p or above.';

  const prompt = `You are an AI video director. Cut this ad into clips and write a complete production packet for each one.

${formatDirective(adFormat)}

STORY:
${JSON.stringify(story, null, 2)}

CAST (reference by role):
${JSON.stringify(characters.map((c) => ({ id: c.id, role: c.role, physicalDescription: c.physicalDescription, clothingDescription: c.clothingDescription })), null, 2) || "[] — no human characters in this ad"}

BRIEF: ${brief.businessName}, ${brief.duration}s, ${brief.language}, platforms ${brief.platforms.join(", ")}, brand colors ${brief.brandColors.join(", ")}.
Default clip type for this format: "${preset.defaultClipType}".

${QUALITY_BAR}

Return ONLY valid JSON, no markdown fences: an array of clip objects shaped exactly like this:
${clipSchemaBlock(aspectRatio, brief.language, platformRule)}

ADDITIONAL RULES:
- Clip durations must add up to roughly ${brief.duration} seconds.
- Cover every scene in the story. A storyboard clip may cover several scenes at once.
- The LAST clip is the brand resolve: logo, business name, tagline and contact, built from the brand assets rather than cast images. Put its on-screen text in the image prompt and keep it on Veo.
- Every spoken word appears in "voScript" in ${brief.language}. Do not paraphrase the story's lines — carry them across exactly.`;

  const clips = await generateJson<Clip[]>(prompt);
  return clips.map((c, i) => normalizeClip(c, i));
}

/** Rewrite one clip, usually because the operator changed its type. */
export async function regenerateClip(
  clip: Clip,
  clipType: ClipType,
  panelCount: number | undefined,
  story: Story,
  characters: CastCharacter[],
  brief: ClientBrief,
  adFormat: AdFormatSelection,
): Promise<Clip> {
  const preset = effectiveAdFormatPreset(adFormat);
  const aspectRatio = aspectRatioFor(brief.platforms);
  const platformRule =
    preset.animationPlatform === "veo_only"
      ? '- This format needs lip-synced dialogue, so a speaking clip uses "veo".'
      : '- "grok" is acceptable for simple motion; "veo" for start_end, on-screen text and higher resolution.';

  const scenes = story.scenes.filter((s) => clip.sceneNumbers.includes(s.sceneNumber));

  const prompt = `You are an AI video director. Rewrite ONE clip of an ad as a "${clipType}" clip.

${formatDirective(adFormat)}

THE SCENES THIS CLIP COVERS:
${JSON.stringify(scenes.length ? scenes : story.scenes, null, 2)}

THE CLIP AS IT STANDS (keep its intent, its words and its place in the ad):
${JSON.stringify({ clipNumber: clip.clipNumber, title: clip.title, voScript: clip.voScript, voTone: clip.voTone, duration: clip.duration }, null, 2)}

CAST (reference by role):
${JSON.stringify(characters.map((c) => ({ id: c.id, role: c.role, physicalDescription: c.physicalDescription, clothingDescription: c.clothingDescription })), null, 2) || "[] — no human characters"}

BRIEF: ${brief.businessName}, ${brief.language}, brand colors ${brief.brandColors.join(", ")}.

REQUIRED clipType: "${clipType}"${
    clipType === "storyboard" ? `, with exactly ${clampPanelCount(panelCount)} panels in ONE image.` : "."
  }
${clipType === "start_end" ? 'Produce EXACTLY TWO image prompts, labelled "Start Frame" and "End Frame", and make the end genuinely different from the start.' : ""}
${clipType === "single" ? "Produce EXACTLY ONE image prompt." : ""}

${QUALITY_BAR}

Return ONLY valid JSON, no markdown fences: a SINGLE clip object shaped exactly like this:
${clipSchemaBlock(aspectRatio, brief.language, platformRule)}

Keep the voice over words identical unless the new clip type genuinely requires a change.`;

  const fresh = await generateJson<Clip>(prompt);
  return normalizeClip(
    {
      ...fresh,
      clipNumber: clip.clipNumber,
      sceneNumbers: clip.sceneNumbers,
      clipType,
      panelCount: clipType === "storyboard" ? clampPanelCount(panelCount ?? fresh.panelCount) : undefined,
    },
    clip.clipNumber - 1,
    clip.id,
  );
}

/**
 * Force a clip from the model into the shape the UI relies on.
 *
 * The model is asked for the right number of image prompts but does not always comply,
 * and a start_end clip arriving with one prompt would silently lose the end frame — so
 * the count is corrected here rather than trusted.
 */
function normalizeClip(c: Clip, index: number, keepId?: string): Clip {
  const clipType: ClipType = c.clipType || "single";
  const wanted = imagePromptCountFor(clipType);
  const prompts = (c.imagePrompts || []).map((p) => ({
    ...p,
    id: p.id || uid(),
    approved: false,
    prompt: p.prompt || "",
    attachInstructions: p.attachInstructions || "",
    label: p.label || "Frame",
  }));

  while (prompts.length < wanted) {
    prompts.push({
      id: uid(),
      label: clipType === "start_end" ? (prompts.length === 0 ? "Start Frame" : "End Frame") : "Single Frame",
      prompt: "",
      attachInstructions: "",
      approved: false,
    });
  }

  const panelCount = clipType === "storyboard" ? clampPanelCount(c.panelCount) : undefined;
  if (clipType === "storyboard" && prompts[0]) {
    prompts[0].label = `Storyboard — ${panelCount} panels`;
  }

  return {
    ...c,
    id: keepId || c.id || uid(),
    clipNumber: c.clipNumber || index + 1,
    sceneNumbers: c.sceneNumbers?.length ? c.sceneNumbers : [index + 1],
    title: c.title || `Clip ${index + 1}`,
    clipType,
    panelCount,
    imagePrompts: prompts.slice(0, wanted),
    animationPrompt: c.animationPrompt || "",
    cameraMove: c.cameraMove || "",
    voScript: c.voScript || "",
    voTone: c.voTone || "",
    duration: c.duration || "6s",
    negativePrompt: c.negativePrompt || "no face morphing, no warped hands, no jittery motion, no text artifacts",
    platform: c.platform === "grok" ? "grok" : "veo",
    mode: c.mode || (clipType === "start_end" ? "first_last_frame" : "image_to_video"),
    qcChecklist: c.qcChecklist || {},
    approved: false,
  };
}

// ── Step 5: Editing Guide ──

export async function generateEditingGuide(story: Story, clips: Clip[], brief: ClientBrief): Promise<EditingGuide> {
  const prompt = `You are a professional video editor writing a complete CapCut editing guide for a cinematic ad.

STORY:
${JSON.stringify(story, null, 2)}

CLIPS:
${JSON.stringify(clips.map((c) => ({ clip: c.clipNumber, title: c.title, duration: c.duration, platform: c.platform, type: c.clipType })), null, 2)}

BRIEF: ${brief.businessName}, ${brief.duration}s, ${brief.language}, platforms ${brief.platforms.join(", ")}, brand colors ${brief.brandColors.join(", ")}.

Be exact — real timestamps, real font names, real BGM search terms. No vague advice.

Return ONLY valid JSON, no markdown fences:
{
  "assembly": [
    { "clipLabel": "Clip 1 — Opening", "duration": "0:00 - 0:06", "transition": "Hard Cut / Dissolve / Whip Pan / Match Cut", "notes": "Why this transition, and the pacing" }
  ],
  "audioLayers": [
    { "type": "BGM", "description": "Specific track mood, genre and search keywords for CapCut / Epidemic Sound / Artlist", "startTime": "0:00", "endTime": "${brief.duration}s", "volume": "60%", "fadeIn": "0-2s", "fadeOut": "last 3s", "notes": "Swell at the turn, drop at the logo" },
    { "type": "Voiceover", "description": "Per-clip voice timing markers", "startTime": "0:00", "endTime": "${brief.duration}s", "volume": "100%" },
    { "type": "SFX", "description": "Per-clip effects with exact timestamps", "startTime": "0:00", "endTime": "${brief.duration}s", "volume": "40%", "notes": "Clip 1 at 0.5s: ..., at 2s: ..." },
    { "type": "Stinger", "description": "Logo reveal stinger — deep bass plus shimmer", "startTime": "Xs", "endTime": "Xs", "volume": "80%" }
  ],
  "textOverlays": [
    { "text": "Exact text", "timing": "12s - 17s", "font": "Specific font (Telugu: Mandali / Ramabhadra / Noto Sans Telugu; English headline: Bebas Neue / Montserrat Bold / Oswald; English body: Inter / Poppins)", "size": "48px", "position": "Lower third / Center / Top bar", "color": "#FFFFFF with dark shadow, or brand color on a solid bar", "animation": "Fade Up / Scale In / Tracking In / Typewriter" }
  ],
  "colorGrading": {
    "overallLook": "string", "temperature": "Warm (+10)", "contrast": "Medium-high", "saturation": "Slightly boosted",
    "highlights": "Soft warm roll-off", "shadows": "Deep but not crushed", "notes": "Named CapCut filter or LUT plus brand color enhancement"
  },
  "exportSettings": [
    { "platform": "YouTube", "resolution": "1920x1080", "frameRate": "24fps", "codec": "H.264", "bitrate": "10 Mbps", "format": "MP4" },
    { "platform": "Instagram Reels", "resolution": "1080x1920", "frameRate": "30fps", "codec": "H.264", "bitrate": "8 Mbps", "format": "MP4" },
    { "platform": "Instagram Feed", "resolution": "1080x1080", "frameRate": "30fps", "codec": "H.264", "bitrate": "8 Mbps", "format": "MP4" },
    { "platform": "TV / Broadcast", "resolution": "1920x1080", "frameRate": "25fps (PAL)", "codec": "H.264 High Profile", "bitrate": "15 Mbps", "format": "MP4" },
    { "platform": "WhatsApp Status", "resolution": "1080x1920", "frameRate": "30fps", "codec": "H.264", "bitrate": "5 Mbps", "format": "MP4 (max 30 sec)" }
  ]
}`;

  return generateJson<EditingGuide>(prompt);
}
