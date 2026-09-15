/**
 * How every clip MOVES — decided once, in code, and shared by the frame prompt and the video prompt.
 *
 * ── Why the videos came out static ──────────────────────────────────────────────────────────────
 * Three things made it close to impossible to get anything else. The video prompt for a model ad
 * said "same location", "direct eye contact at all times", and offered the same four gestures for
 * every ad, and never mentioned the camera. The special-category video prompt went further and said
 * "Camera holds steady, single continuous shot". And the video prompts were written in parallel with
 * the frame prompts, so they never knew which frame they were animating — what was in it, where the
 * model stood, what there was to gesture at.
 *
 * ── What changes ─────────────────────────────────────────────────────────────────────────────────
 * Each clip gets ONE motivated camera move and a gesture intent, chosen from what the clip is FOR
 * (the core message, a proof, trust, the call to action). The frame prompt is told the move so the
 * still is composed to be moved through — lead room for a track, headroom for a rise, a foreground
 * edge for parallax. The video prompt is then written from that exact frame, with the move and the
 * gestures timed against the spoken line.
 *
 * The plan is deterministic on purpose. A model asked to "vary the camera" chooses a push-in for
 * every clip; code guarantees no two neighbouring clips move the same way, and a regenerated clip
 * gets the same move it had, so a refine never changes the shot out from under a finished frame.
 *
 * One continuous shot per clip, always. A cut inside an 8-second clip made from a single still is
 * where face identity breaks, so "dynamic" here means a moving camera and a living performance, not
 * editing.
 */

export type ClipRole = "message" | "proof" | "trust" | "cta" | "wish" | "message_cta";

export type CameraMoveKey =
  | "push_in"
  | "lateral_track"
  | "arc"
  | "pedestal_rise"
  | "handheld_follow"
  | "pull_back";

export interface CameraMove {
  key: CameraMoveKey;
  /** Short name a member reads, e.g. "Slow push-in". */
  name: string;
  /** What the camera does across the 8 seconds, in director's words for the video prompt. */
  action: string;
  /** How the still must be composed so this move works, for the frame prompt. */
  framing: string;
}

export const CAMERA_MOVES: Record<CameraMoveKey, CameraMove> = {
  push_in: {
    key: "push_in",
    name: "Slow push-in",
    action: "a slow, steady dolly push-in across the full 8 seconds, from a medium shot to a medium close-up, "
      + "ending close enough to feel personal",
    framing: "a medium shot with the subject centred and clear breathing room on every side, so the camera can "
      + "move in without ever cropping the head, the hands or the logo",
  },
  lateral_track: {
    key: "lateral_track",
    name: "Lateral tracking shot",
    action: "a smooth sideways dolly track of about a metre, parallel to the subject, the real zone behind and "
      + "beside them sliding into view while a foreground edge passes the lens",
    framing: "the subject on the third opposite the direction the camera will travel, with lead room ahead of them, "
      + "and a real foreground element — a counter edge, a shelf end, a display — at the near edge of the frame for parallax",
  },
  arc: {
    key: "arc",
    name: "Slow arc",
    action: "a gentle 15 to 20 degree arc around the subject at eye level, the background shifting behind them "
      + "while their face stays to camera",
    framing: "the subject slightly off-centre with real depth behind them — fixtures at two or three different "
      + "distances — so the arc reveals parallax",
  },
  pedestal_rise: {
    key: "pedestal_rise",
    name: "Pedestal rise",
    action: "the camera rises smoothly from chest height to eye level as the line builds, revealing more of the "
      + "premises behind the subject",
    framing: "the camera just below chest height, with headroom above the subject and the upper part of the "
      + "premises and the logo in view, so the rise has something real to reveal",
  },
  handheld_follow: {
    key: "handheld_follow",
    name: "Handheld follow",
    action: "a smooth stabilised handheld follow as the subject takes one easy step and turns back to camera — "
      + "alive and close, never shaky",
    framing: "a clear stretch of real floor beside the subject so they can take a step, with the camera at eye level",
  },
  pull_back: {
    key: "pull_back",
    name: "Gentle pull-back",
    action: "a slow pull-back from a medium close-up to a medium-wide shot, ending on the subject framed by the "
      + "real premises and the logo",
    framing: "a medium close-up with the logo and a readable slice of the real premises already in frame around the "
      + "subject, so pulling back reveals the real place rather than inventing one",
  },
};

/** Middle clips rotate through these, never repeating a neighbour. */
const MIDDLE_MOVES: CameraMoveKey[] = ["lateral_track", "arc", "pedestal_rise", "handheld_follow"];

export interface ClipMotionPlan {
  /** 0-based clip index. */
  clip: number;
  role: ClipRole;
  camera: CameraMove;
  /** What the hands and body do, and on which words. */
  gesture: string;
  /** Timed beats used when the video direction call fails — always usable on their own. */
  fallbackBeats: [string, string, string];
}

/**
 * What the body and hands do in each kind of clip. Every one moves — the team's rule is that nobody
 * stands like a statue — so each gesture flows into the next movement instead of "returning to rest".
 */
const GESTURE: Record<ClipRole, string> = {
  message: "opens in a composed, confident stance that is alive, never frozen — a slight lean toward the camera and an "
    + "easy weight shift; on the business name, a warm welcoming open-palm gesture toward the camera, then the hand "
    + "presents the premises behind as the promise is spoken",
  wish: "steps in warmly, hands come together in a namaste on the greeting with a small bow of the head, then open "
    + "outward in a warm, celebratory gesture",
  proof: "turns the shoulders toward the real product, counter or zone being spoken about, presents it with an open "
    + "hand or points to it on its name, then turns back to camera with an emphatic hand on the benefit",
  trust: "leans in slightly, a hand to the chest on the promise, then an open, reassuring palm toward the viewer with "
    + "a confident nod",
  cta: "takes a small step toward the camera, both palms open outward in an invitation, then an inviting wave toward "
    + "the viewer with a warm nod and smile",
  message_cta: "a welcoming open-palm gesture on the business name while leaning in, then both palms open toward the "
    + "viewer in an invitation on the call to action",
};

/** Fallback beats. Each one has a body movement AND a hand action — never a beat of standing still. */
const BEATS: Record<ClipRole, [string, string, string]> = {
  message: [
    "composed but alive: a slight lean toward the camera and a weight shift, warm smile, eyes to the lens as the line begins",
    "a welcoming open-palm gesture toward the camera on the business name, shoulders opening",
    "the hand sweeps gently to present the premises behind on the promise, with a confident nod",
  ],
  wish: [
    "a warm step forward with a bright smile, eyes to the lens as the greeting begins",
    "hands come together in a namaste with a small bow of the head",
    "hands open outward in a warm, celebratory gesture, body turning slightly with joy",
  ],
  proof: [
    "an easy half-turn of the shoulders toward what is being shown, one hand lifting toward it",
    "an open hand presents the real product or zone as it is named, body leaning slightly toward it",
    "turns back to camera with an emphatic hand gesture on the benefit and a small nod",
  ],
  trust: [
    "leans in slightly with a sincere expression, eyes to the lens",
    "a hand to the chest on the promise, shoulders relaxed and open",
    "an open, reassuring palm toward the viewer with a confident nod",
  ],
  cta: [
    "a small step toward the camera with a bright smile, eyes to the lens",
    "both palms open outward toward the viewer in an invitation",
    "an inviting wave toward the viewer, a warm nod and smile as the line ends",
  ],
  message_cta: [
    "a slight lean toward the camera with a warm smile, eyes to the lens",
    "a welcoming open-palm gesture on the business name",
    "both palms open toward the viewer on the invitation, with a small step forward and a warm nod",
  ],
};

/** What each clip is for, from where it sits in the ad. */
export function clipRoles(segmentCount: number, adType: string): ClipRole[] {
  const n = Math.max(1, Math.floor(segmentCount) || 1);
  if (n === 1) return ["message_cta"];
  if (adType === "festival") {
    if (n === 2) return ["wish", "message_cta"];
    return Array.from({ length: n }, (_, i) =>
      i === 0 ? "wish" : i === 1 ? "message" : i === n - 1 ? "cta" : "proof");
  }
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return "message";
    if (i === n - 1) return "cta";
    // In a longer ad the clip before the close earns trust rather than listing another fact.
    return n >= 4 && i === n - 2 ? "trust" : "proof";
  });
}

/**
 * The camera move and gesture for every clip.
 *
 * Clip 1 always pushes in — the team's call: the composed opening, moving closer as the business
 * introduces itself. The last clip pulls back to the premises for the invitation. The middle clips
 * rotate through the rest so no two neighbours move alike.
 */
export function planClipMotion(segmentCount: number, adType: string): ClipMotionPlan[] {
  const roles = clipRoles(segmentCount, adType);
  const n = roles.length;
  let previous: CameraMoveKey | null = null;
  let rotation = 0;
  return roles.map((role, i) => {
    let key: CameraMoveKey;
    if (i === 0) key = "push_in";
    else if (i === n - 1) key = "pull_back";
    else {
      key = MIDDLE_MOVES[rotation % MIDDLE_MOVES.length];
      rotation += 1;
      if (key === previous) {
        key = MIDDLE_MOVES[rotation % MIDDLE_MOVES.length];
        rotation += 1;
      }
    }
    previous = key;
    return {
      clip: i,
      role,
      camera: CAMERA_MOVES[key],
      gesture: GESTURE[role],
      fallbackBeats: BEATS[role],
    };
  });
}

/** The line a frame prompt carries so the still is composed for the move it will be animated with. */
export function framingForMotion(plan: ClipMotionPlan | undefined): string {
  if (!plan) return "";
  return `🎬 CAMERA MOVE THIS FRAME WILL BE ANIMATED WITH: ${plan.camera.name}. Compose the still for it — `
    + `${plan.camera.framing}. Hands relaxed and natural, ready to move — never frozen or rigid.`;
}

/** The heading of the composition line code adds to a finished frame prompt. */
export const MOTION_COMPOSITION_HEADING = "COMPOSITION FOR MOTION";

/**
 * A finished frame prompt, guaranteed to carry its clip's composition for the camera move.
 *
 * Asking was not enough. In live runs the short continuation frames — capped at 100–200 words and
 * given a fixed list of sections — dropped the composition note on most clips, so the still the video
 * was animated from had no lead room for a track and no foreground edge for parallax. Stamped in code
 * it is always there, the same way the "attach this photo" directive is. Idempotent: a prompt that
 * already carries it is returned unchanged.
 */
export function withMotionComposition(prompt: string, plan: ClipMotionPlan | undefined): string {
  if (!plan || !prompt.trim() || prompt.includes(MOTION_COMPOSITION_HEADING)) return prompt;
  return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: ${plan.camera.framing}. Hands relaxed and natural, ready to move — never frozen or rigid.`;
}

// ── The video prompt ───────────────────────────────────────────────────────────────────────────

/** What the director call writes for one clip. Everything else in the prompt is assembled in code. */
export interface VeoDirection {
  /** The move, specific to this frame: start framing, end framing, what is revealed. */
  camera: string;
  /** Three beats: 0–2s, 2–5s, 5–8s. */
  beats: string[];
  /** Real, subtle life in the location — nothing that talks, nothing with text. */
  sceneLife: string;
}

export const BEAT_TIMES = ["0–2s", "2–5s", "5–8s"] as const;

export interface VeoSpeech {
  /** Who speaks, for a character ad. Omitted for a single voice-over. */
  speaker?: string;
  /** The voice, e.g. "a warm, sweet, confident female voice". */
  voice: string;
  /** The exact spoken line. Never rewritten. */
  line: string;
  /** When in the clip, for a two-hander ("0–4s"). */
  at?: string;
}

export interface VeoPromptInput {
  aspectRatio: "9:16" | "16:9";
  plan: ClipMotionPlan;
  direction?: Partial<VeoDirection> | null;
  /** What must not change from the frame, e.g. "her face (100% face match), hair and outfit". */
  identityLock: string;
  /** The spoken language, so the voice carries the right accent. */
  language: string;
  speech: VeoSpeech[];
  /** Extra performance notes that always apply — a character's own direction. */
  performanceNotes?: string;
  /**
   * Who performs, as the movement rules address them: "She", "He", "Both characters", "Ganesha".
   * Defaults to "The cast".
   */
  cast?: string;
  /** True when `cast` takes a plural verb ("Both characters are"). */
  castPlural?: boolean;
  /** A two-hander: the character who is listening must move too. */
  twoHander?: boolean;
}

/**
 * The movement the video must have — written into EVERY Veo prompt, in code, word for word.
 *
 * The team's standing instruction: the cast never stands like a statue, and every clip carries
 * appropriate hand gestures and body language. Left to the direction call it came through as three
 * tidy beats that Veo could still perform with a planted, stiff body and only the mouth moving. So
 * it is not left to anyone: this block is assembled into the prompt itself, stated as mandatory, and
 * backed by the matching negatives.
 */
export function movementRules(cast = "The cast", plural = false, twoHander = false): string {
  const is = plural ? "are" : "is";
  return `MOVEMENT — MANDATORY, NEVER LIKE A STATUE:
${cast} ${is} alive and in motion for the whole 8 seconds, performing actions — never standing still like a statue, a mannequin or a cardboard cut-out. The body moves with the words: shift the weight, turn the shoulders, lean in on the important words, take a small natural step or half-turn, and react with the head and face. There is never a moment when only the mouth moves.${twoHander ? `
The character who is listening keeps moving too — nodding, reacting, gesturing, turning toward the speaker — never frozen while the other one talks.` : ""}

HAND GESTURES AND BODY LANGUAGE — MANDATORY IN THIS CLIP:
Appropriate, clearly visible hand gestures on the key words of the line — presenting the product or place with an open hand, pointing to what is being spoken about, open palms on a promise, counting on the fingers, a hand to the chest for trust, an inviting wave toward the viewer. Each gesture is smooth and natural and flows into the next movement. Body language is open, warm and confident, and matches the meaning of every word, so the body tells the same story as the voice.`;
}

const clean = (value: unknown, max = 600): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * A sentence the prompt will punctuate itself: no trailing full stop, so the assembled line never
 * reads "counter.. Smooth". Seen in the first live runs, on nearly every clip.
 */
const unterminated = (value: string) => value.replace(/[\s.;,]+$/, "");

/**
 * A beat without a time label the model added itself — the prompt supplies "0–2s:", and a beat that
 * also starts "0–2s:" rendered as "• 0–2s: 0–2s: …".
 */
const unlabelled = (value: string) => value.replace(/^\s*(?:beat\s*\d+\s*[:.-]\s*)?\(?\d+\s*[–-]\s*\d+\s*s(?:ec(?:onds?)?)?\)?\s*[:.–-]?\s*/i, "");

/**
 * A usable direction for one clip: the model's where it is usable, the plan's where it is not.
 * Field by field, so one missing beat does not throw away a good camera sentence.
 */
export function resolveDirection(plan: ClipMotionPlan, direction?: Partial<VeoDirection> | null): VeoDirection {
  const camera = unterminated(clean(direction?.camera)) || unterminated(plan.camera.action);
  const modelBeats = Array.isArray(direction?.beats)
    ? direction!.beats.map((b) => unterminated(unlabelled(clean(b, 300)))).filter(Boolean)
    : [];
  const beats = modelBeats.length === 3 ? modelBeats : [...plan.fallbackBeats];
  const sceneLife = unterminated(clean(direction?.sceneLife, 300))
    || "subtle, natural life in the real premises — soft light shifts and gentle background movement true to this place";
  return { camera, beats, sceneLife };
}

/**
 * The finished Veo 3 prompt for one clip.
 *
 * Assembled in code rather than written by the model, so the parts that must never drift — the exact
 * spoken line, the continuous shot, the identity lock, the negatives — are guaranteed, and the model's
 * contribution is limited to the direction it is actually good at.
 */
export function assembleVeoPrompt(input: VeoPromptInput): string {
  const { aspectRatio, plan, identityLock, language, speech, performanceNotes, cast, castPlural, twoHander } = input;
  const d = resolveDirection(plan, input.direction);
  const orientation = aspectRatio === "16:9" ? "horizontal" : "vertical";

  const speechLines = speech.map((s) => {
    const who = s.speaker ? `${s.speaker}, ` : "";
    const at = s.at ? `${s.at} — ` : "";
    return `${at}${who}${s.voice}, speaking ${language}, perfectly lip-synced:\n"${s.line}"`;
  }).join("\n\n");

  return `${aspectRatio} ${orientation} video, one continuous 8-second shot. Animate the attached frame, keeping ${identityLock} exactly as they are.

CAMERA — ${plan.camera.name}: ${d.camera}. Smooth, motivated and cinematic, like a premium commercial reel. No cuts.

${movementRules(cast, castPlural, twoHander)}

PERFORMANCE (the actions, timed to the words):
• ${BEAT_TIMES[0]}: ${d.beats[0]}
• ${BEAT_TIMES[1]}: ${d.beats[1]}
• ${BEAT_TIMES[2]}: ${d.beats[2]}
Eye contact with the lens on the key phrases, with brief natural glances toward what is being shown. Natural blinks and breathing, hands anatomically natural.${performanceNotes ? `\n${performanceNotes}` : ""}

SPEECH:
${speechLines}

SCENE LIFE: ${d.sceneLife}.

Negative prompt:
No text on screen, no subtitles, no watermark
No background music, pure studio voice-over, crystal clear voice, no echo
No static or locked-off camera, no frozen pose, no cuts or scene change
No standing still like a statue, no stiff or mannequin body, no hands hanging lifeless, no talking head where only the mouth moves
No change to the face, hair, outfit, logo or location from the attached frame
No extra people speaking, no new voices`;
}

/** The spoken line inside an assembled prompt — used to check a refined prompt kept it word for word. */
export function spokenLinesIn(prompt: string): string[] {
  return [...prompt.matchAll(/lip-synced:\n"([^"]*)"/g)].map((m) => m[1]);
}

export const VEO_DIRECTION_SYSTEM_PROMPT = (options: {
  clipCount: number;
  aspectRatio: "9:16" | "16:9";
  /** "the model" or the cast, e.g. "Motu and Patlu". */
  subject: string;
  /** A character's own performance and camera direction, when there is one. */
  characterDirection?: string;
}) => `You are a world-class commercial director and the cinematographer behind India's best-performing ad reels. You direct image-to-video: each clip is an 8-second Veo 3 video animated from ONE attached still frame.

YOUR TASK: for each of the ${options.clipCount} clips, write the direction that turns its still frame into a dynamic, premium shot — a moving camera and a living performance — without breaking what the frame already fixed.

FOR EACH CLIP YOU RECEIVE:
• FRAME — the prompt the still was generated from: where ${options.subject} stands, the real zone, the objects in view, the framing.
• LINE — exactly what is spoken in this clip.
• PLANNED MOVE — the camera move decided for this clip. Use it; make it specific to this frame.
• GESTURE INTENT — what the performance must achieve, and on which words.

WRITE, PER CLIP:
1. camera — ONE sentence: the planned move made specific to THIS frame. Say the starting framing, the ending framing, the pace, and what the move reveals or tightens on — named from real objects in the FRAME. The move must be motivated by the line (move closer on the promise, reveal the zone as it is named).
2. beats — exactly THREE short actions timed 0–2s, 2–5s and 5–8s. EVERY beat must contain BOTH a body movement (a lean, a weight shift, a shoulder turn, a small step, a head movement) AND a hand gesture or hand action — never a beat where the subject only stands or only talks. Place each gesture on the words it belongs to: work out roughly which part of the LINE falls in each window and act on it. Gestures point at, present or touch REAL objects named in the FRAME. Include expression and eye-line in each beat.
3. sceneLife — one short phrase of subtle, real VISUAL movement in that location: steam, a ceiling fan, a customer walking past in the background, light shifting through a window. Movement only — never a sound, because the audio is the voice alone. Nothing that speaks, nothing with text, nothing that is not plausible in that frame.

RULES:
• One continuous shot. Never a cut, a zoom-crash, a whip pan or a scene change.
• Never describe the face, hair, skin, outfit or jewellery — they are locked by the attached frame.
• Never invent objects, signage or people that are not plausible in the FRAME.
• The logo must stay visible and unchanged; never move the camera so the logo leaves the frame for good.
• NEVER LIKE A STATUE. The cast performs actions for the whole 8 seconds: the body is always in motion with the words, with appropriate hand gestures and open body language. A subject who stands planted and only moves the mouth is a failed direction.
• Movement is premium and controlled — confident and natural, never shaky, never exaggerated or theatrical.
• Clip 1 opens composed but alive, never statue-still: a slight lean and weight shift, and the welcoming gesture lands on the business name.
• Hands stay anatomically natural; each gesture is one clear movement that flows into the next — hands never hang lifeless.
• Frame for ${options.aspectRatio}.${options.characterDirection ? `

${options.characterDirection}

Use that direction for how the characters move, react and look. The speaking character performs the line; the other listens and reacts in their own way.` : ""}

Return ONLY a JSON array, one object per clip, in clip order, no markdown:
[
  { "clip": 1, "camera": "", "beats": ["", "", ""], "sceneLife": "" }
]`;

/** Reads the director call's reply into one direction per clip, by clip number. Unusable → empty. */
export function parseVeoDirections(raw: string, clipCount: number): (Partial<VeoDirection> | null)[] {
  const out: (Partial<VeoDirection> | null)[] = Array.from({ length: clipCount }, () => null);
  if (!raw?.trim()) return out;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const data = JSON.parse(cleaned);
    const rows = Array.isArray(data) ? data : Array.isArray(data?.clips) ? data.clips : [];
    rows.forEach((row: any, position: number) => {
      const index = Number.isInteger(row?.clip) ? row.clip - 1 : position;
      if (index >= 0 && index < clipCount && row && typeof row === "object") {
        out[index] = { camera: row.camera, beats: row.beats, sceneLife: row.sceneLife };
      }
    });
  } catch {
    // Unusable reply: every clip falls back to its plan, which is still a moving, directed shot.
  }
  return out;
}
