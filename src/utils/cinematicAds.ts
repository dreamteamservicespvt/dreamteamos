import {
  MAX_STORYBOARD_PANELS,
  MIN_STORYBOARD_PANELS,
  type Clip,
  type ClipType,
} from "@/types/cinematicAds";

/**
 * Camera vocabulary that counts as a real, directed move.
 *
 * A static frame with a person talking is what makes an AI ad look cheap, so every clip
 * has to name a move. "Cinematic", "beautiful" and "dynamic" are not moves — they are
 * adjectives, and a model will happily give you a locked-off tripod shot for all three.
 */
const CAMERA_MOVE_PATTERNS: RegExp[] = [
  // Each verb allows its conjugations. Without them "the camera pushes in" reads as a
  // static shot and a properly directed clip gets flagged, which trains the operator to
  // ignore the warning entirely.
  /\bdoll(?:y|ies|ying)[\s-]?(?:in|out|back|forward|left|right)?\b/i,
  /\btruck(?:s|ing)?[\s-]?(?:left|right)\b/i,
  /\btrack(?:s|ing)?[\s-]?(?:shot|in|out|left|right|forward|back)?\b/i,
  /\bpan(?:s|ning)?[\s-]?(?:left|right|across|up|down)?\b/i,
  /\btilt(?:s|ing)?[\s-]?(?:up|down)?\b/i,
  /\bcran(?:e|es|ing)[\s-]?(?:up|down|shot)?\b/i,
  /\bjib[\s-]?(?:up|down)?\b/i,
  /\bboom[\s-]?(?:up|down)\b/i,
  /\bpush(?:es|ing|ed)?[\s-]?in\b/i,
  /\bpull(?:s|ing|ed)?[\s-]?(?:out|back|away)\b/i,
  /\bzoom(?:s|ing|ed)?[\s-]?(?:in|out|slow)?\b/i,
  /\borbit(?:s|ing|ed)?\b/i,
  /\barc(?:s|ing)?[\s-]?(?:shot|around|left|right)\b/i,
  /\bhandheld\b/i,
  /\bsteadicam\b/i,
  /\bgimbal\b/i,
  /\bslider\b/i,
  /\bparallax\b/i,
  /\bdrone\b/i,
  /\baerial\b/i,
  /\bfl(?:y|ies|ying)[\s-]?(?:over|through|by|in)\b/i,
  /\bwhip[\s-]?pan\b/i,
  /\bcircl(?:e|es|ing)[\s-]?(?:around|the)\b/i,
  /\bsweep(?:s|ing)?\b/i,
  /\bfollow(?:s|ing)?[\s-]?(?:shot|the|behind)\b/i,
  /\brack[\s-]?focus\b/i,
  /\bcamera\s+(?:\w+\s+)?(?:move|moves|moving|glide|glides|drift|drifts|rise|rises|descend|descends|sweep|sweeps|travel|travels|float|floats|creep|creeps|push|pushes|pull|pulls|circle|circles|follow|follows|swing|swings|climb|climbs|lower|lowers)\b/i,
  /\b(?:slow|fast|gentle)[\s-]?(?:push|pull|creep|drift|glide)\b/i,
];

/** True when the text names an actual camera movement, not just a mood word. */
export function hasCameraMove(text: string | undefined | null): boolean {
  if (!text) return false;
  return CAMERA_MOVE_PATTERNS.some((re) => re.test(text));
}

/**
 * Whether this clip would animate as a static shot.
 *
 * Checks the dedicated `cameraMove` field first, then falls back to the body of the
 * animation prompt — the model sometimes writes the move into the prose instead of the
 * field, and flagging a clip that is actually fine would train the operator to ignore
 * the warning.
 */
export function clipIsMissingCameraMove(clip: Pick<Clip, "cameraMove" | "animationPrompt">): boolean {
  return !hasCameraMove(clip.cameraMove) && !hasCameraMove(clip.animationPrompt);
}

/** Panel counts outside 3-9 either are not a storyboard or will not be honoured. */
export function clampPanelCount(count: number | undefined): number {
  if (!count || Number.isNaN(count)) return MIN_STORYBOARD_PANELS;
  return Math.min(MAX_STORYBOARD_PANELS, Math.max(MIN_STORYBOARD_PANELS, Math.round(count)));
}

/** How many image prompts a clip type needs. */
export function imagePromptCountFor(clipType: ClipType): number {
  return clipType === "start_end" ? 2 : 1;
}

/**
 * Split an ad into boards of at most nine panels.
 *
 * Returns the scene ranges, e.g. 14 scenes becomes [[1,9],[10,14]].
 */
export function splitScenesIntoBoards(sceneCount: number): { firstScene: number; lastScene: number }[] {
  if (sceneCount <= 0) return [];
  const boards: { firstScene: number; lastScene: number }[] = [];
  for (let start = 1; start <= sceneCount; start += MAX_STORYBOARD_PANELS) {
    boards.push({
      firstScene: start,
      lastScene: Math.min(start + MAX_STORYBOARD_PANELS - 1, sceneCount),
    });
  }
  return boards;
}

/** The whole clip as one block of text, for pasting into a generation tool. */
export function formatClipPacket(clip: Clip): string {
  const lines: string[] = [];

  lines.push(`CLIP ${clip.clipNumber} — ${clip.title}`);
  lines.push(`Type: ${clip.clipType} · ${clip.duration} · ${clip.aspectRatio} · ${clip.platform.toUpperCase()} (${clip.mode})`);
  lines.push("");

  clip.imagePrompts.forEach((ip, i) => {
    lines.push(`── IMAGE PROMPT ${clip.imagePrompts.length > 1 ? i + 1 : ""} — ${ip.label} ──`.replace(/\s+—/, " —"));
    lines.push(ip.prompt);
    if (ip.attachInstructions) {
      lines.push(`Attach: ${ip.attachInstructions}`);
    }
    lines.push("");
  });

  lines.push("── ANIMATION PROMPT ──");
  lines.push(clip.animationPrompt);
  if (clip.cameraMove) lines.push(`Camera: ${clip.cameraMove}`);
  if (clip.negativePrompt) lines.push(`Negative: ${clip.negativePrompt}`);
  lines.push("");

  lines.push("── VOICE OVER ──");
  lines.push(clip.voScript || "(no voice over in this clip)");
  if (clip.voTone) lines.push(`Tone: ${clip.voTone}`);

  return lines.join("\n");
}
