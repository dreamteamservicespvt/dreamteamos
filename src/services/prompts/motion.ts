/**
 * How every clip MOVES — decided once, in code, and shared by the frame prompt and the video prompt.
 *
 * ── Why the videos came out static, the first time ──────────────────────────────────────────────
 * The video prompt for a model ad said "same location", "direct eye contact at all times", offered the
 * same four gestures for every ad, and never mentioned the camera. The special-category prompt said
 * "Camera holds steady, single continuous shot". And the video prompts were written in parallel with
 * the frame prompts, so they never knew which frame they were animating.
 *
 * ── Why they were still close to static, the second time ────────────────────────────────────────
 * Every clip then got a camera move and mandatory gestures, and the videos still came back as a
 * presenter standing in one spot, explaining. Four reasons:
 *   1. Nobody walked. The most any clip asked of the body was "a small step or half-turn". Someone
 *      planted in one position is a talking head, however well the hands move.
 *   2. The camera moves were timid — "about a metre", "15 to 20 degrees", "one easy step" — and Veo
 *      renders a move that small as a shot that barely moves.
 *   3. The frames were portraits: a centred close mid-shot, "holding this pose", nothing to walk into.
 *   4. The character catalogue told the director the opposite: "Patlu stays planted and completely
 *      still", Shiva "a still frame with a moving mouth is correct here", "tripod-locked with
 *      absolutely no movement" — and the director was told to follow it.
 *
 * ── What every clip has now ──────────────────────────────────────────────────────────────────────
 * A WALK: a path through the business — walking in toward the camera, along the counter, to the
 * product to show it, leading the viewer in, stepping out into a reveal, walking out to invite. The
 * camera move is chosen to travel WITH that walk and is big enough to see: a leading dolly, a side
 * track of metres, a 45–60° arc, a gimbal follow, a crane-up, a pull-back reveal. The frame is composed
 * as the first moment of the walk; the director writes the walk against the real things in the frame;
 * and code throws away any direction that comes back standing still (resolveDirection).
 *
 * The plan is deterministic on purpose: code guarantees no two neighbouring clips walk or move alike,
 * and a regenerated clip gets the same walk it had, so a refine never changes the shot under a frame.
 *
 * One continuous shot per clip, always. A cut inside an 8-second clip made from a single still is
 * where face identity breaks, so "dynamic" means a walking cast and a moving camera, not editing.
 */

export type ClipRole = "message" | "proof" | "trust" | "cta" | "wish" | "message_cta";

/** Who performs, because a deity walks and gestures differently from a person or a cartoon. */
export type Performer = "person" | "cartoon" | "deity";

export type CameraMoveKey =
  | "leading_dolly"
  | "side_track"
  | "arc"
  | "gimbal_follow"
  | "crane_reveal"
  | "pull_back_reveal";

export interface CameraMove {
  key: CameraMoveKey;
  /** Short name a member reads, e.g. "Leading dolly (walk-and-talk)". */
  name: string;
  /** What the camera does across the 8 seconds, in director's words for the video prompt. */
  action: string;
  /** What the still needs so this move has something to travel through, for the frame prompt. */
  framing: string;
}

export const CAMERA_MOVES: Record<CameraMoveKey, CameraMove> = {
  leading_dolly: {
    key: "leading_dolly",
    name: "Leading dolly (walk-and-talk)",
    action: "the camera dollies backward ahead of the walk at EXACTLY the walking pace, holding the same distance "
      + "and the same framing for the whole clip — the cast stay the SAME SIZE in frame from the first second to the "
      + "last, never growing as they come forward — while the premises flow past behind them",
    framing: "a clear, open path of floor between the subject and the camera for the walk toward it, with real depth "
      + "behind — counters, stock, the logo — so the premises flow past as they come",
  },
  side_track: {
    key: "side_track",
    name: "Side tracking shot",
    action: "the camera tracks sideways alongside the walk at the same pace for two to three metres, parallel to the "
      + "counter or display and always the same distance from the cast, so they stay the SAME SIZE in frame while "
      + "foreground objects slide past the lens and the products pass behind",
    framing: "the counter or display running across the frame in the direction of the walk, lead room ahead of the "
      + "subject along it, and a real foreground edge at the near side of the frame for parallax",
  },
  arc: {
    key: "arc",
    name: "Arc around the reveal",
    action: "the camera arcs 45 to 60 degrees around the cast at a FIXED radius — exactly the same distance all the "
      + "way round, so they stay the SAME SIZE in frame and never come nearer or further — ending on a hero angle "
      + "that shows them and the product together",
    framing: "the product or feature they will show clearly visible and well lit, a step or two from the subject, with "
      + "real depth behind so the arc reveals parallax",
  },
  gimbal_follow: {
    key: "gimbal_follow",
    name: "Gimbal follow",
    action: "a smooth gimbal follow a step behind and to the side at shoulder height, holding exactly that distance "
      + "as the cast lead the way into the premises so they stay the SAME SIZE in frame, then they turn back to the "
      + "lens and the camera settles facing them at that same distance",
    framing: "the premises opening up ahead of the subject with a clear walkway into them, the camera at shoulder height",
  },
  crane_reveal: {
    key: "crane_reveal",
    name: "Crane-up reveal",
    action: "the camera rises from waist height to eye level while keeping exactly its distance from the cast — the "
      + "angle changes, their size in frame does not — as they step forward into the open and the premises open up "
      + "behind them",
    framing: "a low camera at waist height, a real foreground element beside the subject, and the upper premises and the "
      + "logo in frame above them for the crane to reveal",
  },
  pull_back_reveal: {
    key: "pull_back_reveal",
    name: "Pull-back reveal",
    action: "the camera eases back at the same pace as the cast walk toward it, so they stay the SAME SIZE in frame "
      + "while more and more of the shop comes into view around them, ending with the inside of the business and the "
      + "logo open around them",
    framing: "the inside of the business open around the subject with the logo readable, and room around them for the "
      + "camera to widen into",
  },
};

export type WalkKey = "walk_in" | "walk_along" | "walk_to_show" | "lead_the_way" | "step_out_reveal" | "walk_invite";

export interface Walk {
  key: WalkKey;
  /** Short name a member reads, e.g. "Walk-in toward the camera". */
  name: string;
  /**
   * The path through the clip, for the video prompt — a template: {Cast} is who walks, {s} and {es}
   * the verb endings that agree with them ("She walks", "Both characters walk").
   */
  path: string;
  /** The same path for a deity, who blesses what a person would show. */
  deityPath?: string;
  /** The first moment of the walk, for the frame prompt: where the cast is and how the body is caught. */
  start: string;
  /** The camera move that travels with this walk. */
  camera: CameraMoveKey;
}

export const WALKS: Record<WalkKey, Walk> = {
  walk_in: {
    key: "walk_in",
    name: "Walk-in toward the camera",
    path: "{Cast} walk{s} two or three unhurried steps toward the camera from deeper inside the shop floor, talking "
      + "while walking — a natural walk-and-talk — and arrive{s} in a medium shot on the promise, still inside the business",
    start: "three-quarter body (head to knees), facing the camera with the weight moving onto the front foot as the "
      + "first step begins, hands relaxed and natural",
    camera: "leading_dolly",
  },
  walk_along: {
    key: "walk_along",
    name: "Walk along the counter",
    path: "{Cast} walk{s} along the counter or display for three or four steps, talking while walking and showing the "
      + "products along the way, then turn{s} to the camera",
    deityPath: "{Cast} walk{s} slowly along the counter or display for three or four steps, blessing the counter and "
      + "the stock along the way, then turn{s} to the camera",
    start: "three-quarter body at one end of the counter or display, turned a quarter toward the direction of the "
      + "walk and caught mid-step, one hand relaxed toward the display",
    camera: "side_track",
  },
  walk_to_show: {
    key: "walk_to_show",
    name: "Walk to the product and show it",
    path: "{Cast} walk{s} two or three steps to the real product or feature the line is about, show{s} it to the "
      + "camera on arrival, then turn{s} back to the lens",
    deityPath: "{Cast} walk{s} slowly to the heart of the business the line is about and raise{s} the blessing palm "
      + "over it, then turn{s} back to the lens",
    start: "three-quarter body a step away from the real product or feature, turning toward it, one hand lifting "
      + "toward it",
    camera: "arc",
  },
  lead_the_way: {
    key: "lead_the_way",
    name: "Lead the viewer in",
    path: "{Cast} lead{s} the way three or four steps deeper into the premises, glancing back to beckon the viewer "
      + "along, then turn{s} back to face the camera",
    start: "three-quarter body walking into the premises at a three-quarter back angle, looking back over the "
      + "shoulder to the camera with the face clearly visible, one hand lifting to beckon",
    camera: "gimbal_follow",
  },
  step_out_reveal: {
    key: "step_out_reveal",
    name: "Step out into the reveal",
    path: "{Cast} step{s} out from beside the foreground into the open and keep{s} walking forward two or three steps "
      + "as the premises open up behind",
    start: "three-quarter body stepping forward out from beside a real foreground element, caught mid-stride, eyes "
      + "to the camera",
    camera: "crane_reveal",
  },
  walk_invite: {
    key: "walk_invite",
    name: "Walk out to invite",
    path: "{Cast} walk{s} two or three steps toward the camera across the shop floor with an inviting wave, and "
      + "stop{s} close for the invitation, still inside the business",
    start: "three-quarter body on the shop floor inside the business, walking toward the camera and caught "
      + "mid-stride, one hand lifting in an inviting wave",
    camera: "pull_back_reveal",
  },
};

/** Middle clips rotate through these walks, never repeating a neighbour. */
const MIDDLE_WALKS: WalkKey[] = ["walk_along", "walk_to_show", "lead_the_way", "step_out_reveal"];

export interface ClipMotionPlan {
  /** 0-based clip index. */
  clip: number;
  role: ClipRole;
  walk: Walk;
  camera: CameraMove;
  /** What the hands and body do, and on which words. */
  gesture: string;
  /** Timed beats used when the video direction call fails — always walking, always usable on their own. */
  fallbackBeats: [string, string, string];
  performer: Performer;
}

/** What the body and hands achieve in each kind of clip — every one of them on the move. */
const GESTURE: Record<ClipRole, string> = {
  message: "walks in toward the camera; on the business name, a warm welcoming open-palm gesture, then the arm "
    + "presents the premises as the promise is spoken",
  wish: "walks in warmly; hands come together in a namaste with a small bow on the greeting, then open outward in a "
    + "warm, celebratory gesture",
  proof: "walks to what is being spoken about and shows it — presents, points to, picks up, holds up or touches the "
    + "real product, counter or work — then turns to camera with an emphatic hand on the benefit",
  trust: "walks toward the viewer with sincerity; a hand to the chest on the promise, then an open, reassuring palm "
    + "with a confident nod",
  cta: "walks toward the camera and the entrance; both palms open in invitation, then a beckoning come-in gesture "
    + "toward the viewer",
  message_cta: "walks in; a welcoming open-palm gesture on the business name, then both palms open toward the viewer "
    + "in an invitation on the call to action",
};

/** A deity walks slowly and blesses — it never handles or presents what the business sells. */
const DEITY_GESTURE: Record<ClipRole, string> = {
  message: "walks in toward the camera with slow, majestic steps; the blessing palm rises toward the viewer on the "
    + "business name, then turns to bless the premises as the promise is spoken",
  wish: "walks in with slow, graceful steps; the blessing palm rises on the greeting, then both hands open outward in "
    + "a festive blessing",
  proof: "walks slowly to what is being spoken about and blesses it — the blessing palm raised over it, never "
    + "touching, holding or presenting it — then turns to the viewer",
  trust: "walks toward the viewer with serene steps; the blessing palm toward the viewer on the promise, with a "
    + "gentle nod",
  cta: "walks toward the camera and the entrance; both palms open in blessing and welcome, then a gentle beckoning "
    + "gesture toward the viewer",
  message_cta: "walks in with slow, majestic steps; the blessing palm rises on the business name, then both palms "
    + "open toward the viewer in welcome on the call to action",
};

/** Fallback beats for each walk. Every beat travels or turns AND has a hand action. */
const WALK_BEATS: Record<WalkKey, [string, string, string]> = {
  walk_in: [
    "walks toward the camera with a confident, easy stride, a warm smile, eyes to the lens as the line begins",
    "still walking, a welcoming open-palm gesture toward the camera on the business name, then the arm sweeps back to "
      + "present the premises",
    "arrives in a medium shot and stops with a small lean in, an emphatic hand on the promise and a confident nod",
  ],
  walk_along: [
    "walks along the counter or display with an easy stride, glancing at what is passing and gesturing toward it with "
      + "an open hand",
    "keeps walking and presents the real products or work area with a sweeping open-hand gesture as they are named",
    "turns the shoulders to the lens mid-step, an emphatic hand gesture on the benefit and a smile",
  ],
  walk_to_show: [
    "walks two or three steps to the real product or feature, one hand already reaching toward it",
    "arrives and shows it — picks it up, holds it up or touches it — presenting it toward the camera as it is named",
    "turns back to the lens, still presenting it, with an emphatic gesture on the benefit and a confident nod",
  ],
  lead_the_way: [
    "walks deeper into the premises, looking back over the shoulder with a beckoning hand — come with me",
    "keeps walking and points out the real work area or stock with an open hand as it is named",
    "turns fully back to the lens and opens both arms to present the space, with a warm smile",
  ],
  step_out_reveal: [
    "steps out from beside the foreground into the open with a confident stride, eyes to the lens",
    "keeps walking forward, one arm sweeping wide to present the premises opening up behind",
    "stops, a hand to the chest on the promise, then an open, reassuring palm toward the viewer",
  ],
  walk_invite: [
    "walks toward the camera with a bright smile and an inviting wave",
    "keeps coming forward, both palms opening outward on the invitation",
    "stops close, a beckoning come-in gesture toward the viewer and a warm nod as the line ends",
  ],
};

const DEITY_WALK_BEATS: Record<WalkKey, [string, string, string]> = {
  walk_in: [
    "walks toward the camera with slow, graceful, majestic steps, a serene smile, eyes to the lens as the line begins",
    "still walking, the blessing palm rises toward the viewer on the business name",
    "arrives in a medium shot and turns a quarter toward the premises, the blessing palm extended over the business, "
      + "a gentle nod",
  ],
  walk_along: [
    "walks slowly along the counter with graceful steps, gazing over the business with a serene smile",
    "the blessing palm passes over the counter and the stock as they are named, blessing them",
    "turns to the lens mid-step, the blessing palm toward the viewer, a gentle nod",
  ],
  walk_to_show: [
    "walks slowly toward the heart of the business, the blessing hand beginning to rise",
    "arrives beside it and raises the blessing palm over it — never touching it — as it is named",
    "turns back to the lens with the palm open toward the viewer and a serene nod",
  ],
  lead_the_way: [
    "walks gracefully deeper into the premises, glancing back to the lens with a gentle beckoning hand",
    "keeps walking, the blessing palm sweeping over the work area as it is named",
    "turns fully back to the lens, both hands opening in blessing over the whole space",
  ],
  step_out_reveal: [
    "steps forward from beside the foreground into the open with a slow, majestic stride, eyes to the lens",
    "keeps walking forward as the premises open up behind, one arm lifting in blessing over them",
    "stops, the blessing palm toward the viewer on the promise, a serene nod",
  ],
  walk_invite: [
    "walks slowly toward the camera with a serene smile, the blessing palm raised",
    "keeps coming forward, both palms opening outward in blessing and welcome",
    "stops close, a gentle beckoning gesture of welcome toward the viewer and a serene nod as the line ends",
  ],
};

/** Roles whose beats are their own rather than their walk's — the greeting, and the one-clip ad. */
const ROLE_BEATS: Partial<Record<ClipRole, Record<"person" | "deity", [string, string, string]>>> = {
  wish: {
    person: [
      "walks toward the camera with a bright, festive smile, eyes to the lens as the greeting begins",
      "stops, hands come together in a namaste with a small bow of the head",
      "hands open outward in a warm, celebratory gesture, stepping forward with joy",
    ],
    deity: [
      "walks toward the camera with slow, graceful steps and a serene smile as the greeting begins",
      "the blessing palm rises toward the viewer on the wish",
      "both hands open outward in a festive blessing over the viewer, a gentle nod",
    ],
  },
  message_cta: {
    person: [
      "walks toward the camera with a confident stride and a warm smile, eyes to the lens",
      "still walking, a welcoming open-palm gesture on the business name",
      "stops close, both palms opening toward the viewer in an invitation, a warm nod",
    ],
    deity: [
      "walks toward the camera with slow, majestic steps and a serene smile, eyes to the lens",
      "still walking, the blessing palm rises on the business name",
      "stops close, both palms opening toward the viewer in blessing and welcome, a gentle nod",
    ],
  },
};

/** The trust clip's last beat, whatever its walk — the promise lands on the chest, or in the blessing. */
const TRUST_LAST_BEAT = {
  person: "stops and turns to the lens, a hand to the chest on the promise, then an open, reassuring palm toward the viewer",
  deity: "stops and turns to the lens, the blessing palm toward the viewer on the promise, a serene nod",
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

function beatsFor(role: ClipRole, walk: WalkKey, performer: Performer): [string, string, string] {
  const kind = performer === "deity" ? "deity" : "person";
  const own = ROLE_BEATS[role]?.[kind];
  if (own) return [...own];
  const beats: [string, string, string] = [...(kind === "deity" ? DEITY_WALK_BEATS : WALK_BEATS)[walk]];
  if (role === "trust") beats[2] = TRUST_LAST_BEAT[kind];
  return beats;
}

/**
 * The walk, camera move and gesture for every clip.
 *
 * Clip 1 walks in toward the camera — the business introducing itself, coming to meet the viewer.
 * The last clip walks out to invite, the camera pulling back to the storefront. The middle clips
 * rotate through the other walks so no two neighbours move alike.
 */
export function planClipMotion(segmentCount: number, adType: string, performer: Performer = "person"): ClipMotionPlan[] {
  const roles = clipRoles(segmentCount, adType);
  const n = roles.length;
  let previous: WalkKey | null = null;
  let rotation = 0;
  return roles.map((role, i) => {
    let key: WalkKey;
    if (i === 0) key = "walk_in";
    else if (i === n - 1) key = "walk_invite";
    else {
      key = MIDDLE_WALKS[rotation % MIDDLE_WALKS.length];
      rotation += 1;
      if (key === previous) {
        key = MIDDLE_WALKS[rotation % MIDDLE_WALKS.length];
        rotation += 1;
      }
    }
    previous = key;
    const walk = WALKS[key];
    return {
      clip: i,
      role,
      walk,
      camera: CAMERA_MOVES[walk.camera],
      gesture: (performer === "deity" ? DEITY_GESTURE : GESTURE)[role],
      fallbackBeats: beatsFor(role, key, performer),
      performer,
    };
  });
}

/** A walk template with its performer filled in: "She walks…", "Both characters walk…". */
export function fillCast(template: string, cast = "The cast", plural = false): string {
  return template
    .replace(/\{Cast\}/g, cast)
    .replace(/\{es\}/g, plural ? "" : "es")
    .replace(/\{s\}/g, plural ? "" : "s");
}

/** The path this clip's cast walks, in words for the video prompt. */
export function walkPath(plan: ClipMotionPlan, cast = "The cast", plural = false): string {
  const template = plan.performer === "deity" && plan.walk.deityPath ? plan.walk.deityPath : plan.walk.path;
  return fillCast(template, cast, plural);
}

/**
 * How the still must be composed for this clip's walk and camera move.
 *
 * Drawn characters and deities are framed head to FEET: their height and build are the identity, and a
 * frame that crops the legs leaves the video to invent them, which is where a short character starts
 * growing. A real person keeps the three-quarter framing — their face has to stay big enough to match.
 */
export function compositionFor(plan: ClipMotionPlan): string {
  const start = plan.performer === "person"
    ? plan.walk.start
    : plan.walk.start.replace(/three-quarter body( (head to knees))?/, "the full figure from head to feet");
  return `${start}; ${plan.camera.framing}; and a fixed vertical reference behind them — a counter edge, a door `
    + `frame or a shelf line — that their height can be read against, with their feet and the floor visible`;
}

/** The line a frame prompt carries so the still is the first moment of the clip's walk. */
export function framingForMotion(plan: ClipMotionPlan | undefined): string {
  if (!plan) return "";
  return `🎬 THIS FRAME STARTS A WALK — ${plan.walk.name}, filmed with a ${plan.camera.name}. Compose the still as `
    + `the first moment of it: ${compositionFor(plan)}. The body is caught in natural motion, like a candid frame from a walking shot.`;
}

/** The heading of the composition line code adds to a finished frame prompt. */
export const MOTION_COMPOSITION_HEADING = "COMPOSITION FOR MOTION";

/**
 * A finished frame prompt, guaranteed to carry its clip's composition for the walk.
 *
 * Asking was not enough. In live runs the short continuation frames — capped at 100–200 words and
 * given a fixed list of sections — dropped the composition note on most clips. Stamped in code it is
 * always there, the same way the "attach this photo" directive is. Idempotent: a prompt that already
 * carries it is returned unchanged.
 *
 * `keepPose` is for a model ad's hero frame: its pose is the identity anchor every later frame copies,
 * so it keeps it, and only the open path for the walk its video starts is added.
 */
export function withMotionComposition(
  prompt: string,
  plan: ClipMotionPlan | undefined,
  options: { keepPose?: boolean } = {},
): string {
  if (!plan || !prompt.trim() || prompt.includes(MOTION_COMPOSITION_HEADING)) return prompt;
  if (options.keepPose) {
    return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: this pose starts a walk (${plan.walk.name}) — `
      + `${plan.camera.framing}.`;
  }
  return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: the first moment of a walk (${plan.walk.name}) — `
    + `${compositionFor(plan)}. Caught in natural motion, like a candid frame from a walking shot, hands relaxed and natural.`;
}

/**
 * Character direction with the stillness taken out.
 *
 * The catalogue was written for held frames — "Patlu stays planted and completely still", "the body
 * barely moves", "tripod-locked with absolutely no movement" — and the director followed it, which is
 * how the special-category videos stayed static. Every clause that orders stillness is dropped; the
 * rest — the character's manner, gestures, expressions, what a deity must never touch — is kept.
 */
const STILLNESS = /\b(?:still(?:ness)?|planted|rooted|motionless|unmoving|at rest|returns? to rest|locked(?:[- ]off)?|tripod|on sticks|never walks?|walks? within|no step|no sway|no weight shift|no shoulder movement|no pacing|does not move|do not move|doesn't move|has not moved|barely moves|without moving|no movement|stays put|stationary|held frame|use none|any motion at all|absence of gesture|do not punctuate)\b/i;

export function withoutStillness(text: string): string {
  if (!text) return "";
  return text
    .split(/(?<=[.;!?])\s+/)
    .map((sentence) => {
      const kept = sentence.split(/\s+—\s+/).filter((part) => !STILLNESS.test(part));
      if (kept.length === 0) return "";
      const joined = kept.join(" — ");
      return /[.;!?]$/.test(joined) ? joined : `${joined}.`;
    })
    .filter(Boolean)
    .join(" ");
}

// ── The video prompt ───────────────────────────────────────────────────────────────────────────

/** What the director call writes for one clip. Everything else in the prompt is assembled in code. */
export interface VeoDirection {
  /** The walk, specific to this frame: from where to where, past what, what is shown. */
  path: string;
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
  /** A two-hander: both walk together, and the character who is listening moves too. */
  twoHander?: boolean;
  /** How they walk — "with a confident, easy, natural stride". Defaults by performer. */
  walkManner?: string;
  /** Which hand gestures fit this performer. Defaults by performer. */
  handGestures?: string;
}

/** How each kind of performer walks, unless the subject says otherwise. */
export const WALK_MANNER: Record<Performer, string> = {
  person: "with a confident, easy, natural stride",
  cartoon: "in their own signature way from the show — the walk the audience knows them by",
  deity: "with slow, graceful, majestic steps — serene and unhurried, never rushed",
};

/** The gestures that fit each kind of performer, unless the subject says otherwise. */
export const HAND_GESTURES: Record<Performer, string> = {
  person: "showing and presenting the business with an open hand, pointing to what is being spoken about, picking up, "
    + "holding up or touching the product, open palms on a promise, counting on the fingers, a hand to the chest for "
    + "trust, beckoning the viewer to come along, an inviting wave toward the viewer",
  cartoon: "showing and presenting the business with an open hand, pointing to what is being spoken about, picking up, "
    + "holding up or touching the product, open palms on a promise, counting on the fingers, a hand to the chest for "
    + "trust, beckoning the viewer to come along, an inviting wave toward the viewer",
  deity: "blessing gestures — the blessing palm (abhaya mudra) raised toward the business and the viewer, a slow open "
    + "palm passing over the counter and the stock in blessing, both hands opening in welcome — never touching, "
    + "holding, pointing at or presenting products, money or a phone",
};

/**
 * What the video may NEVER change — written into every Veo prompt, in code, word for word.
 *
 * Live videos came back with the cast's height changing mid-clip, a character's build drifting, and
 * an outfit changing colour between one second and the next. One clause at the top of the prompt
 * ("keeping X exactly as they are") was not enough: image-to-video re-imagines anything the prompt
 * does not pin. So the whole look — face, hair, clothes and their colours, footwear, accessories,
 * height, build, proportions, the size difference between two characters, the logo, the place — is
 * stated as locked, with the one thing that DOES change (distance from the camera) named so it is not
 * confused with getting bigger or smaller.
 */
export function identityRules(identityLock: string, cast = "The cast", twoHander = false): string {
  return `LOCKED — THE LOOK COMES ENTIRELY FROM THE ATTACHED FRAME:
The attached frame is the first frame of this video. Keep ${identityLock} exactly as they are in it, in every frame: the same face, the same hair, the same clothes in the same colours, patterns and details, the same footwear, accessories and props, and the same height, build and body proportions${twoHander ? ", including the size and height difference between the two characters" : ""}. Only the movement is new — nothing about how anyone LOOKS may change.
Walking changes where ${cast} ${twoHander ? "are" : "is"} in the room, never the size of anyone: nobody grows taller or shorter, thinner or heavier, no outfit changes colour, shape or style, nothing is added or taken away, and the logo stays the same logo, in the same place, unchanged.

SIZE ON SCREEN — LOCKED, THE THING THAT KEEPS SLIPPING:
${cast} stay the SAME SIZE in the frame from the first second to the last. The camera travels with the walk and holds its distance, so nobody gets bigger walking toward it or smaller walking away, and each head stays at the same height against the counter, shelf or door frame behind them. Heights and builds are measured off the attached frame and never re-imagined between one second and the next${twoHander ? ", and the height and build difference between the two characters is exactly what the frame shows — one never catches up with the other" : ""}. Feet stay on the floor, posture and stride stay the same, and nobody crouches, stretches or is re-proportioned to fit the shot.`;
}

/**
 * The movement the video must have — written into EVERY Veo prompt, in code, word for word.
 *
 * The team's standing instruction: the cast walks through the business while talking, showing and
 * presenting it, with appropriate hand gestures and body language — never standing in one position
 * explaining. Left to the direction call it came through as tidy beats Veo could still perform with
 * a planted body, so it is not left to anyone: this block is assembled into the prompt itself, stated
 * as mandatory, and backed by the matching negatives.
 */
export function movementRules(
  cast = "The cast",
  plural = false,
  twoHander = false,
  manner: string = WALK_MANNER.person,
  gestures: string = HAND_GESTURES.person,
): string {
  const is = plural ? "are" : "is";
  const s = plural ? "" : "s";
  return `MOVEMENT — MANDATORY, NEVER LIKE A STATUE:
${cast} ${is} walking and in motion for the whole 8 seconds — walking through the business, turning, showing and presenting it — never standing in one single position while explaining, never still like a statue, a mannequin or a cardboard cut-out. ${cast} walk${s} ${manner}, talking while walking like a real walk-and-talk reel, and the body moves with the words: the weight shifts, the shoulders turn, a lean in on the important words, the head and face react. There is never a moment when only the mouth moves.
Every step stays INSIDE the business, in the same space the attached frame shows — ${cast} never walk${s} out of the shop, never walk${s} in from the street, and never leave${s} that space or its location.${twoHander ? `
Both characters walk together, side by side, through the business. The character who is listening keeps moving too — walking along, nodding, reacting, gesturing, turning toward the speaker — never frozen while the other one talks.` : ""}

HAND GESTURES AND BODY LANGUAGE — MANDATORY IN THIS CLIP:
Appropriate, clearly visible hand gestures on the key words of the line — ${gestures}. Each gesture is smooth and natural and flows into the next movement. Body language is open, warm and confident, and matches the meaning of every word, so the body tells the same story as the voice.`;
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
 * A direction with the spoken words taken out of it.
 *
 * In live runs the director quoted the dialogue inside the actions — "lifting a palm on the words
 * 'శ్రీ సాయి టూ వీలర్ సర్వీస్ సెంటర్'", "while starting the line 'అరే గణేశ…'". The line is already
 * in the SPEECH block, once; a second copy in the action invites Veo to say it twice or put it on
 * screen as text. A quoted run of non-Latin script is removed, with the "as he speaks" / "on the words"
 * lead-in it leaves hanging.
 */
export function withoutQuotedSpeech(value: string): string {
  if (!value) return value;
  const quoted = /\s*['"‘“][^'"‘“’”]*[^\x00-ɏ -⁯\s][^'"‘“’”]*['"’”]/g;
  if (!quoted.test(value)) return value;
  const leadIn = "(?:(?:while|as|and|when)\\s+)?(?:(?:he|she|they|it)\\s+)?"
    + "(?:starting|beginning|delivering|speaking|speaks|speak|says|saying|finishes|finishing|concludes|concluding|completes)?"
    + "\\s*(?:on\\s+|for\\s+|with\\s+)?(?:the\\s+)?(?:words|line|phrase)?";
  return value
    .replace(quoted, "")
    // A lead-in left in the middle of the sentence: "lifts on the words, showing…"
    .replace(/\s+(?:on|with|at|for)\s+the\s+(?:words|line|phrase)(?=\s*[,;])/gi, "")
    // …or at its end: "gazing into the lens while starting the line", "toward the display for".
    .replace(new RegExp(`\\s*,?\\s*${leadIn}\\s*(?:for)?\\s*$`, "i"), "")
    .replace(/\s+,/g, ",")
    .trim();
}

/** A direction that walks: some travelling verb is in it. */
const TRAVELS = /\b(?:walk|walks|walking|stride|strides|striding|step|steps|stepping|stroll|strolls|strolling|leads?|leading|glides?|gliding|bounces?|bouncing|waddles?|waddling|scampers?|scampering|marches|marching|approach(?:es)?|approaching|comes? toward|moves? (?:toward|along|through|into))\b/i;

/** A direction that stands still — what the catalogue kept pulling the director toward. */
const STANDS_STILL = /\b(?:stands? still|standing still|remains? (?:still|standing|in place)|stays? (?:still|planted|put|in place|rooted)|planted|rooted|motionless|stationary|locked[- ]off|locks? there|tripod|on sticks|holds? (?:absolutely )?still|does not move|doesn't move|without moving|no movement|barely perceptible|frozen|freezes)\b/i;

/**
 * A usable direction for one clip: the model's where it is usable, the plan's where it is not.
 * Field by field, so one bad beat does not throw away a good camera sentence.
 *
 * "Usable" now means MOVING. A path that does not travel, a camera that locks off, or beats that
 * stand still are replaced by the plan's — whatever a character's catalogue entry said.
 */
export function resolveDirection(plan: ClipMotionPlan, direction?: Partial<VeoDirection> | null, cast = "The cast", plural = false): VeoDirection {
  const planPath = walkPath(plan, cast, plural);
  const modelPath = unterminated(withoutQuotedSpeech(clean(direction?.path, 400)));
  const path = modelPath && TRAVELS.test(modelPath) && !STANDS_STILL.test(modelPath) ? modelPath : planPath;

  const modelCamera = unterminated(clean(direction?.camera));
  const camera = modelCamera && !STANDS_STILL.test(modelCamera) ? modelCamera : unterminated(plan.camera.action);

  const modelBeats = Array.isArray(direction?.beats)
    ? direction!.beats.map((b) => unterminated(withoutQuotedSpeech(unlabelled(clean(b, 300))))).filter(Boolean)
    : [];
  const beatsMove = modelBeats.length === 3
    && !modelBeats.some((b) => STANDS_STILL.test(b))
    && modelBeats.some((b) => TRAVELS.test(b));
  const beats = beatsMove ? modelBeats : [...plan.fallbackBeats];

  const sceneLife = unterminated(clean(direction?.sceneLife, 300))
    || "subtle, natural life in the real premises — soft light shifts and gentle background movement true to this place";
  return { path, camera, beats, sceneLife };
}

const capitalised = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * The finished Veo 3 prompt for one clip.
 *
 * Assembled in code rather than written by the model, so the parts that must never drift — the walk,
 * the exact spoken line, the continuous shot, the identity lock, the negatives — are guaranteed, and
 * the model's contribution is limited to the direction it is actually good at. The walk comes first:
 * Veo weighs the start of a prompt most, and the start used to be the rules, not the action.
 */
export function assembleVeoPrompt(input: VeoPromptInput): string {
  const { aspectRatio, plan, identityLock, language, speech, performanceNotes, cast, castPlural, twoHander } = input;
  const who = cast || "The cast";
  const plural = !!castPlural;
  const d = resolveDirection(plan, input.direction, who, plural);
  const orientation = aspectRatio === "16:9" ? "horizontal" : "vertical";
  const manner = input.walkManner || WALK_MANNER[plan.performer];
  const gestures = input.handGestures || HAND_GESTURES[plan.performer];

  const speechLines = speech.map((s) => {
    const speaker = s.speaker ? `${s.speaker}, ` : "";
    const at = s.at ? `${s.at} — ` : "";
    return `${at}${speaker}${s.voice}, speaking ${language}, perfectly lip-synced:\n"${s.line}"`;
  }).join("\n\n");

  return `${aspectRatio} ${orientation} video, one continuous 8-second shot, animated from the attached frame.

${identityRules(identityLock, who, !!twoHander)}

ACTION — WALK, SHOW AND PRESENT (${plan.walk.name}):
${capitalised(d.path)}.
• ${BEAT_TIMES[0]}: ${d.beats[0]}
• ${BEAT_TIMES[1]}: ${d.beats[1]}
• ${BEAT_TIMES[2]}: ${d.beats[2]}
Through all three beats nothing about them changes — the same faces, the same clothes in the same colours, the same heights and builds, the same size in frame. Only their position in the room changes.
Eye contact with the lens on the key phrases, with brief natural glances toward what is being shown. Natural blinks and breathing, hands anatomically natural.${performanceNotes ? `\n${performanceNotes}` : ""}

CAMERA — ${plan.camera.name}: ${d.camera}. The camera moves with the walk from the first second to the last — a clearly visible, smooth, cinematic move like a premium commercial reel. No cuts.

${movementRules(who, plural, twoHander, manner, gestures)}

SPEECH:
${speechLines}

SCENE LIFE: ${d.sceneLife}.

Negative prompt:
No text on screen, no subtitles, no watermark
No background music, pure studio voice-over, crystal clear voice, no echo
No static or locked-off camera, no frozen pose, no cuts or scene change
No standing in one spot for the whole clip, no feet planted in place, no presenter frozen in position while explaining
No standing still like a statue, no stiff or mannequin body, no hands hanging lifeless, no talking head where only the mouth moves
No walking out of the business, no street, footpath, car park or outside shot, no entering or leaving through the door, no change of location
No change in size on screen — nobody grows or shrinks as they walk, no zoom or lens change that resizes them
No change of height, build or body proportions — nobody taller, shorter, slimmer or heavier than in the frame, no change to the height difference between characters
No costume change — no different clothes, colours, patterns, footwear or accessories, nothing added or taken away
No redrawn, restyled or different-looking cast, no face morphing, no swapped or extra characters
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
  /** A character's own performance direction, when there is one — already stripped of stillness. */
  characterDirection?: string;
  /** A deity walks slowly and blesses rather than presenting. */
  performer?: Performer;
}) => `You are a world-class commercial director and the cinematographer behind India's best-performing ad reels. You direct image-to-video: each clip is an 8-second Veo 3 video animated from ONE attached still frame.

YOUR TASK: for each of the ${options.clipCount} clips, write the direction that turns its still frame into a purely dynamic shot — ${options.subject} WALKING through the business while talking, showing and presenting it, with a camera that moves with the walk — without breaking what the frame already fixed.

THE STANDARD: a real walk-and-talk commercial reel. A presenter standing in one position and explaining is a failed clip, however good the hands are.

FOR EACH CLIP YOU RECEIVE:
• FRAME — the prompt the still was generated from: where ${options.subject} is, the real zone, the objects in view, the framing.
• LINE — exactly what is spoken in this clip.
• PLANNED WALK — the path through this clip. Use it; make it specific to this frame.
• PLANNED MOVE — the camera move that travels with the walk. Use it; make it specific to this frame.
• GESTURE INTENT — what the hands and body must achieve, and on which words.

WRITE, PER CLIP:
1. path — ONE sentence: the planned walk made specific to THIS frame. From where to where, past which real things, and what is shown on arrival — every place and object named from the FRAME. At least three steps, starting in the first second from exactly where the frame has them.
2. camera — ONE sentence: the planned move made specific to THIS frame and tied to the walk — the direction it travels with them, what it reveals, and the fixed real thing behind them (a counter edge, a door frame, a shelf line) their height stays measured against. The camera holds its DISTANCE for the whole clip so the cast stay the same size in frame: it travels WITH the walk, never toward or away from it, and never zooms. A clearly visible move, never a barely perceptible drift.
3. beats — exactly THREE short actions timed 0–2s, 2–5s and 5–8s. EVERY beat has the body travelling or turning (walking, stepping, turning toward what is shown or back to the lens) AND a hand action — showing, presenting, pointing to, picking up, holding up or touching a REAL object named in the FRAME, beckoning, an open palm on a promise. Place each gesture on the words it belongs to: work out roughly which part of the LINE falls in each window, and name that moment in plain English ("on the business name", "on the free delivery", "as the line ends") — NEVER quote the spoken words in path or beats. The line is spoken once, from its own block; a quoted copy inside an action gets said twice or written on screen. Include expression and eye-line.
4. sceneLife — one short phrase of subtle, real VISUAL movement in that location: steam, a ceiling fan, a customer walking past in the background, light shifting through a window. Movement only — never a sound, because the audio is the voice alone. Nothing that speaks, nothing with text, nothing that is not plausible in that frame.

RULES:
• WALK IN EVERY CLIP — NEVER LIKE A STATUE. ${options.subject} never stays in one position for the whole clip: never planted, never a talking head. Talking while walking is the look.
• SHOW THE BUSINESS. The walk passes, reaches and presents the real things the line is about — the products, the counter, the work, the premises.
• INSIDE THE BUSINESS ONLY. Every step happens inside the premises the FRAME shows, between its real fixtures. Never outside on the street or the footpath, never walking in through the door from outside, never leaving that space.
• YOU DIRECT MOVEMENT ONLY. Never change how anyone looks: no wardrobe change, no different clothes or colours, no change of height, build or proportions. Those come from the frame and are locked.
• SAME SIZE IN FRAME, ALWAYS. Never direct a move that makes the cast bigger or smaller — no walking into a close-up, no pulling out to a wide shot around them, no zoom. Changing their size on screen is what makes heights and clothes drift, so the camera keeps its distance and the walk happens inside a steady frame.
• One continuous shot. Never a cut, a zoom-crash, a whip pan or a scene change.
• Never describe the face, hair, skin, outfit or jewellery — they are locked by the attached frame.
• Never invent objects, signage or people that are not plausible in the FRAME.
• The logo must stay visible and unchanged; never move the camera so the logo leaves the frame for good.
• Movement is premium and controlled — confident and natural, never shaky, never exaggerated or theatrical.
• Clip 1 walks in: from the pose in the frame, ${options.subject} walks toward the camera, and the welcoming gesture lands on the business name.
• Hands stay anatomically natural; each gesture is one clear movement that flows into the next — hands never hang lifeless.
• Frame for ${options.aspectRatio}.${options.performer === "deity" ? `
• A deity walks slowly and majestically, and every gesture is a blessing — never touching, holding, pointing at or presenting products, money or a phone.` : ""}${options.characterDirection ? `

${options.characterDirection}

Use that direction for HOW the characters move — their manner, pace, gestures, expressions and look. It never makes them stand still or the camera hold still: the planned walk and camera move always win. The speaking character performs the line; the other listens and reacts in their own way while walking along.` : ""}

Return ONLY a JSON array, one object per clip, in clip order, no markdown:
[
  { "clip": 1, "path": "", "camera": "", "beats": ["", "", ""], "sceneLife": "" }
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
        out[index] = { path: row.path, camera: row.camera, beats: row.beats, sceneLife: row.sceneLife };
      }
    });
  } catch {
    // Unusable reply: every clip falls back to its plan, which is still a walking, moving shot.
  }
  return out;
}
