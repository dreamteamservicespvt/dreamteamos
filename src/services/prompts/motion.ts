/**
 * How every clip MOVES — decided once, in code, and shared by the frame prompt and the video prompt.
 *
 * ── The history, because it explains the rules ──────────────────────────────────────────────────
 * 1. The first videos came out static: the prompt said "same location", "camera holds steady", and
 *    never mentioned the camera.
 * 2. The fix went to the other extreme: every clip WALKED — toward the camera, along the counter,
 *    deeper into the premises, out to the storefront. Image-to-video cannot see past the still, so
 *    every step beyond the frame made the model INVENT the room: presenters walked into tables and
 *    doors, out of the shop onto the road or into the shop next door, and products vanished.
 * 3. Then every clip was animated strictly in place. Safe, but every ad looked the same.
 * 4. Then (2026-09-22) walking came back as "a few steps along the clear floor the frame shows", with
 *    the whole commercial camera vocabulary — pull-backs, pans, cranes, orbits, a tracking shot that
 *    backs away from a walking presenter, and a "grand reveal" pull-back on EVERY closing clip. The
 *    finished videos showed exactly what history step 2 had: characters walking over tables and
 *    cupboards, a clothing store stretching into a corridor that does not exist, presenters walking
 *    toward the lens and out onto the road. Every one of those moves asks the video model to draw
 *    something the still does not contain, and it invents it.
 *
 * ── What a clip does now: FRAME-BOUNDED MOTION ───────────────────────────────────────────────────
 * The attached frame is the whole world of its clip. The frame was generated from that clip's frame
 * prompt, so the video prompt is written from the same picture: what it shows, where the people
 * stand, what is within their reach. Nobody walks — a turn, a half step in place, a lean is the most a
 * body travels — and the camera only ever moves in ways that reveal nothing beyond the frame's edges:
 * a slow dolly-in, a push-in on the product, a rack focus, a few-degree arc, a short slide, a gentle
 * float, or a locked frame. The life comes from the performance (gestures, expressions, showing the
 * real product within reach) and from the scene's own small movement. The ad still visits different
 * parts of the place — that is what the FRAMES do, one zone per clip — but within a clip, nobody goes
 * anywhere.
 *
 * The plan is deterministic for the same inputs, so a regenerated clip keeps its shot. One continuous
 * shot per clip, always: a cut inside an 8-second clip made from one still is where identity breaks.
 */

export type ClipRole = "message" | "proof" | "trust" | "cta" | "wish" | "message_cta";

/** Who performs, because a deity moves and gestures differently from a person or a cartoon. */
export type Performer = "person" | "cartoon" | "deity";

// ── The camera vocabulary ─────────────────────────────────────────────────────────────────────────

/**
 * The angles a frame may be composed at. The ANGLE belongs to the still — the video keeps whatever
 * the frame was shot from — so only angles a premium commercial frame actually uses are offered.
 * Bird's eye, worm's eye, POV and dutch tilt asked the video model to re-draw the room from a new
 * point of view, which is the same invention a pull-back is.
 */
export type ShotAngleKey = "eye_level" | "low_angle" | "high_angle";

export interface ShotAngle { key: ShotAngleKey; name: string; use: string }

export const SHOT_ANGLES: Record<ShotAngleKey, ShotAngle> = {
  eye_level: { key: "eye_level", name: "Eye level", use: "natural, realistic" },
  low_angle: { key: "low_angle", name: "Slightly low", use: "confident, premium" },
  high_angle: { key: "high_angle", name: "Slightly high", use: "elegant overview of the counter" },
};

/**
 * The moves a clip may be filmed with — every one of them FRAME-SAFE: it moves closer, drifts a
 * little, or moves only the focus. None pulls back, pans away, rises, circles or follows anyone,
 * because each of those shows space the still never had.
 */
export type CameraMoveKey = "static_locked" | "dolly_in" | "push_in" | "rack_focus" | "arc" | "truck" | "handheld";

export interface CameraMove {
  key: CameraMoveKey;
  /** The standard name a member and the video model both know, e.g. "Slow Dolly In". */
  name: string;
  /** What it does for the ad. */
  effect: string;
  /** What the camera does across the 8 seconds — a template ({them}, {they}, {s}) for the video prompt. */
  action: string;
  /** What the still needs so this move has something to show, for the frame prompt. */
  framing: string;
  /** The lens that suits it. */
  lens: string;
  /** Its motion-speed keywords. */
  speed: string;
}

export const CAMERA_MOVES: Record<CameraMoveKey, CameraMove> = {
  static_locked: {
    key: "static_locked", name: "Locked Frame", effect: "clean commercial look", lens: "50mm", speed: "locked, clean",
    action: "the camera holds the frame's own composition, perfectly steady, while {they} perform{s}",
    framing: "a balanced, clean composition with everything the clip needs already in view",
  },
  dolly_in: {
    key: "dolly_in", name: "Slow Dolly In", effect: "builds focus on the words", lens: "50mm", speed: "slow, ultra smooth",
    action: "the camera dollies in very slowly toward {them} — only ever closer, so nothing beyond the frame is ever shown",
    framing: "a medium shot with room to move in, the face clear and evenly lit",
  },
  push_in: {
    key: "push_in", name: "Push In on the Product", effect: "product emphasis", lens: "85mm", speed: "slow, ultra smooth",
    action: "the camera pushes in slowly toward the product {they} show{s}, ending on a rich, premium view of it with {them} still in frame",
    framing: "the product the clip talks about within arm's reach and fully in view, well lit, between the subject and the camera",
  },
  rack_focus: {
    key: "rack_focus", name: "Rack Focus", effect: "draws the eye without moving", lens: "85mm", speed: "smooth focus pull",
    action: "the camera holds its position while the focus pulls smoothly from {them} to the real product or stock beside {them} and back",
    framing: "the product or stock close beside the subject at a slightly different depth, both fully in view",
  },
  arc: {
    key: "arc", name: "Slight Arc", effect: "gentle premium parallax", lens: "50mm", speed: "floating gimbal, very slow",
    action: "the camera arcs only a few degrees around {them} at the same distance — a small, slow parallax that never swings around to show more of the room",
    framing: "real depth behind the subject — counters, stock, the logo — so a small arc shows gentle parallax",
  },
  truck: {
    key: "truck", name: "Short Slide", effect: "gentle side parallax", lens: "35mm", speed: "precision slider, very slow",
    action: "the camera slides a short distance sideways, parallel to {them}, the stock behind shifting with soft parallax — only a few centimetres, never past the edge of the frame",
    framing: "a counter, shelf or display running across the frame behind the subject, and a real foreground edge for parallax",
  },
  handheld: {
    key: "handheld", name: "Handheld Float", effect: "natural, alive", lens: "35mm", speed: "gentle, natural",
    action: "a gentle handheld float at the same distance from {them}, alive but never shaky",
    framing: "a natural, candid composition",
  },
};

// ── The stagings ──────────────────────────────────────────────────────────────────────────────────

/** What a clip's cast does. Nobody walks in any of them — see the header. */
export type StagingKey = "stand_present" | "show_product" | "present_space" | "welcome_invite";

export interface Staging {
  key: StagingKey;
  /** Short name a member reads, e.g. "Stand and tell". */
  name: string;
  /**
   * What the cast does across the clip, for the video prompt — a template: {Cast} is who performs,
   * {s} the verb ending that agrees with them ("She turns", "Both characters turn"), {them} the object.
   */
  path: string;
  /** The same staging for a deity, who blesses what a person would show. */
  deityPath?: string;
  /** How the still is composed so the staging has room: where the cast is and how the body is caught. */
  start: string;
}

export const STAGINGS: Record<StagingKey, Staging> = {
  stand_present: {
    key: "stand_present", name: "Stand and tell",
    path: "{Cast} stand{s} where the frame has {them}, facing the camera, and tell{s} the viewer about the business with real "
      + "presenter energy — a warm open-palm gesture on the business name, the weight shifting naturally, a nod on the promise",
    deityPath: "{Cast} stand{s} where the frame has {them}, facing the viewer, serene and radiant, and raise{s} the "
      + "blessing palm toward the viewer and then over the business",
    start: "three-quarter body (head to knees), standing well inside the business and facing the camera, relaxed and "
      + "natural, with clear space around the arms for gestures and nothing touching the body",
  },
  show_product: {
    key: "show_product", name: "Show the product",
    path: "{Cast} turn{s} to the real product or feature the line is about — one that is ALREADY within arm's reach in the "
      + "frame — and show{s} it with an open hand, a light touch or by lifting it a little so the camera sees it, then turn{s} "
      + "back to the lens, without taking a step",
    deityPath: "{Cast} turn{s} gracefully toward what the line is about, raise{s} the blessing palm over it without touching "
      + "it, then turn{s} back to the viewer",
    start: "three-quarter body standing beside the real product, counter or display the clip talks about, which sits within "
      + "arm's reach and fully in view, the body angled slightly toward it with the face to the camera",
  },
  present_space: {
    key: "present_space", name: "Present the space",
    path: "{Cast} open{s} one arm to present the real space the frame shows behind {them} — the counter, the stock, the work "
      + "area — without moving from the spot, then bring{s} the hand to the chest or an open palm on the promise",
    deityPath: "{Cast} sweep{s} the blessing palm slowly over the space behind {them}, then turn{s} the palm toward the viewer",
    start: "three-quarter body standing a comfortable distance in front of the business's real counter, shelves or work "
      + "area, all of it fully visible behind the subject, facing the camera",
  },
  welcome_invite: {
    key: "welcome_invite", name: "Invite the viewer in",
    path: "{Cast} stand{s} INSIDE the business facing the camera and invite{s} the viewer in — both palms opening toward the "
      + "viewer, a warm come-in gesture and a nod. This is an invitation to come, never a goodbye: no waving, no bye-bye hand",
    deityPath: "{Cast} stand{s} inside the business and open{s} both palms toward the viewer in blessing and welcome, with a "
      + "gentle nod — never a wave",
    start: "three-quarter body standing inside the business at its most inviting spot, facing into the premises and toward "
      + "the camera — never in a doorway and never with the exit behind the subject",
  },
};

export interface ClipMotionPlan {
  /** 0-based clip index. */
  clip: number;
  role: ClipRole;
  staging: Staging;
  camera: CameraMove;
  angle: ShotAngle;
  /** "35mm" — the lens the move is filmed on. */
  lens: string;
  /** Motion-speed keywords, e.g. "slow, ultra smooth". */
  speed: string;
  /**
   * In a two-hander: "speaker" pulls the focus to whoever is talking, "both" keeps the two-shot.
   * Always "both" for a single performer.
   */
  focus: "speaker" | "both";
  /** What the hands and body do, and on which words. */
  gesture: string;
  /**
   * Two characters share the frame. Their clips are filmed from a FIXED DISTANCE (DUO_SAFE_MOVES) —
   * see planClipMotion — and everything that reads the plan keeps them the same size.
   */
  twoHander?: boolean;
  /** Timed beats used when the video direction call fails — alive, usable on their own. */
  fallbackBeats: [string, string, string];
  performer: Performer;
}

/** What the scene plan may choose for a clip (services/prompts/scenePlan). Anything unusable is ignored. */
export interface MotionChoice {
  staging?: string;
  camera?: string;
  angle?: string;
  focus?: string;
}

/** What the body and hands achieve in each kind of clip. None of them is a goodbye. */
const GESTURE: Record<ClipRole, string> = {
  message: "a warm welcoming open-palm gesture on the business name, then the arm presents the premises as the "
    + "promise is spoken",
  wish: "hands come together in a namaste with a small bow on the greeting, then open outward in a warm, celebratory "
    + "gesture",
  proof: "shows what is being spoken about — presents, points to or lightly touches the real product, counter or work "
    + "within reach — then an emphatic hand on the benefit",
  trust: "a hand to the chest on the promise, then an open, reassuring palm with a confident nod",
  cta: "both palms open toward the viewer in invitation, then a warm come-in gesture — never a wave goodbye",
  message_cta: "a welcoming open-palm gesture on the business name, then both palms open toward the viewer in an "
    + "invitation on the call to action — never a wave goodbye",
};

/** A deity blesses — it never handles or presents what the business sells. */
const DEITY_GESTURE: Record<ClipRole, string> = {
  message: "the blessing palm rises toward the viewer on the business name, then turns to bless the premises as the "
    + "promise is spoken",
  wish: "the blessing palm rises on the greeting, then both hands open outward in a festive blessing",
  proof: "the blessing palm is raised over what is being spoken about — never touching, holding or presenting it — then "
    + "turns to the viewer",
  trust: "the blessing palm toward the viewer on the promise, with a gentle nod",
  cta: "both palms open in blessing and welcome toward the viewer",
  message_cta: "the blessing palm rises on the business name, then both palms open toward the viewer in welcome on the "
    + "call to action",
};

/** Fallback beats for each staging. Every beat is alive, with a hand or body action, and travels nowhere. */
const STAGING_BEATS: Record<StagingKey, [string, string, string]> = {
  stand_present: [
    "stands with a warm smile, eyes to the lens, the weight settling onto one foot as the line begins",
    "a welcoming open-palm gesture toward the camera on the business name, the shoulders turning slightly with it",
    "a confident nod and an emphatic hand on the promise",
  ],
  show_product: [
    "turns the shoulders toward the real product within reach, one hand already lifting toward it",
    "shows it — an open hand presenting it, a light touch, or lifting it a little so the camera sees it — as it is named",
    "turns back to the lens, an emphatic gesture on the benefit and a smile",
  ],
  present_space: [
    "eyes to the lens, one arm beginning to open toward the space behind",
    "the arm sweeps to present the real counter, stock or work area behind as it is named, the head following it",
    "the hand comes to the chest on the promise, then an open, reassuring palm toward the viewer",
  ],
  welcome_invite: [
    "faces the camera with a bright smile, both hands beginning to open",
    "both palms open outward toward the viewer on the invitation, a warm nod",
    "a warm come-in gesture and a nod as the line ends — an invitation, never a goodbye wave",
  ],
};

/**
 * Fallback beats for a PAIR. Written for two people, and without the lean-in, the step or the
 * lifting-toward-the-lens a single presenter may have: in a two-hander each of those is one character
 * coming nearer the camera than the other — the very moment the video model re-proportions them.
 */
const PAIR_STAGING_BEATS: Record<StagingKey, [string, string, string]> = {
  stand_present: [
    "the one speaking turns from the other to the lens with a bright, open expression as the line begins, the other listening",
    "a clear open-palm gesture on the key words from whoever is speaking, the other nodding",
    "both share a smile and a small confirming nod as the line lands",
  ],
  show_product: [
    "the one speaking turns the shoulders toward the real product beside them, a hand already rising toward it",
    "an open hand presents it, or a light touch on it, as it is named, the other looking at it too",
    "both turn back to the lens, a nod and a smile on the benefit",
  ],
  present_space: [
    "eyes to the lens as the line begins, one arm starting to open toward the space behind them",
    "an arm opens to present the real stock or counter behind them as it is named, the other following the gesture with their eyes",
    "the hand settles on the promise and both smile toward the viewer",
  ],
  welcome_invite: [
    "both face the camera with warm smiles, hands beginning to open",
    "both open their palms toward the viewer on the invitation",
    "a warm come-in gesture and a nod together as the line ends — an invitation, never a goodbye",
  ],
};

const DEITY_STAGING_BEATS: Record<StagingKey, [string, string, string]> = {
  stand_present: [
    "stands serene and radiant, a gentle smile, eyes to the viewer as the line begins",
    "the blessing palm rises slowly toward the viewer on the business name",
    "the palm turns to bless the premises, a gentle nod",
  ],
  show_product: [
    "turns gracefully toward the heart of the business the line is about",
    "raises the blessing palm over it — never touching it — as it is named",
    "turns back to the viewer with the palm open and a serene nod",
  ],
  present_space: [
    "serene, eyes to the viewer",
    "the blessing palm sweeps slowly over the counter and the stock as they are named",
    "the palm turns toward the viewer in blessing, a gentle nod",
  ],
  welcome_invite: [
    "a serene smile inside the business, the blessing palm raised",
    "both palms open outward toward the viewer in blessing and welcome",
    "a gentle nod of welcome as the line ends",
  ],
};

/** Roles whose beats are their own rather than their staging's — the greeting, and the one-clip ad. */
const ROLE_BEATS: Partial<Record<ClipRole, Record<"person" | "pair" | "deity", [string, string, string]>>> = {
  wish: {
    person: [
      "a bright, festive smile, eyes to the lens as the greeting begins",
      "hands come together in a namaste with a small bow of the head",
      "hands open outward in a warm, celebratory gesture with a joyful smile",
    ],
    pair: [
      "both turn to the lens with bright, festive smiles as the greeting begins",
      "both bring their hands together in a namaste with a small bow of the head",
      "both open their hands outward in a warm, celebratory gesture",
    ],
    deity: [
      "serene, with a gentle smile as the greeting begins",
      "the blessing palm rises toward the viewer on the wish",
      "both hands open outward in a festive blessing over the viewer, a gentle nod",
    ],
  },
  message_cta: {
    person: [
      "a warm smile, eyes to the lens",
      "a welcoming open-palm gesture on the business name",
      "both palms opening toward the viewer in an invitation, a warm nod — never a goodbye wave",
    ],
    pair: [
      "both smile to the lens as the line begins",
      "the one speaking opens a palm on the business name, the other nodding",
      "both open their palms toward the viewer in an invitation — never a goodbye wave",
    ],
    deity: [
      "serene, eyes to the viewer",
      "the blessing palm rises on the business name",
      "both palms opening toward the viewer in blessing and welcome, a gentle nod",
    ],
  },
};

/** The trust clip's last beat, whatever its staging — the promise lands on the chest, or in the blessing. */
const TRUST_LAST_BEAT = {
  person: "a hand to the chest on the promise, then an open, reassuring palm toward the viewer",
  pair: "the one speaking puts a hand to the chest on the promise, the other nodding in agreement",
  deity: "the blessing palm toward the viewer on the promise, a serene nod",
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

function beatsFor(role: ClipRole, staging: StagingKey, performer: Performer, pair: boolean): [string, string, string] {
  const kind = performer === "deity" ? "deity" : pair ? "pair" : "person";
  const own = ROLE_BEATS[role]?.[kind];
  if (own) return [...own];
  const table = kind === "deity" ? DEITY_STAGING_BEATS : kind === "pair" ? PAIR_STAGING_BEATS : STAGING_BEATS;
  const beats: [string, string, string] = [...table[staging]];
  if (role === "trust") beats[2] = TRUST_LAST_BEAT[kind];
  return beats;
}

// ── Reading a line for its staging ────────────────────────────────────────────────────────────────

/** A line that names something that can be SHOWN. English and Telugu. */
const PRODUCT_WORDS = /\b(?:products?|collections?|range|designs?|models?|brands?|variet(?:y|ies)|stock|sarees?|jewell?ery|gold|diamonds?|dress(?:es)?|menu|dish(?:es)?|sweets?|items?|these)\b|కలెక్షన్|డిజైన్|ప్రోడక్ట్|వెరైటీ|మోడల్|బ్రాండ్|చీర|నగల|బంగారు|స్వీట్|ఐటమ్|ఇవి/i;
/** A line about the place itself — its size, its sections, "come inside". */
const SPACE_WORDS = /\b(?:inside|showroom|branch|floor|sections?|space|whole (?:shop|store)|every corner|come in|walk in)\b|లోపల|షోరూమ్|సెక్షన్|మొత్తం|బ్రాంచ్/i;
/** A line that asks for trust — years, a guarantee, a promise. */
const TRUST_WORDS = /\b(?:years?|trust(?:ed)?|guarantee|warranty|promise|experience|family|since)\b|నమ్మకం|గ్యారంటీ|వారంటీ|సంవత్సరాల|ఏళ్ల|అనుభవం/i;

/**
 * The staging a line asks for, or null when it asks for nothing in particular.
 *
 * A line about the PLACE is presented from where the cast stands — the frame for that clip already
 * shows the part of the place the line is about. It used to be a walk through it.
 */
export function stagingForLine(line: string, role: ClipRole, _performer: Performer): StagingKey | null {
  const text = line || "";
  if (role === "wish" || role === "trust") return "stand_present";
  if (PRODUCT_WORDS.test(text)) return "show_product";
  if (SPACE_WORDS.test(text)) return "present_space";
  if (TRUST_WORDS.test(text)) return "stand_present";
  return null;
}

/** Middle clips with no clear cue alternate between these, never repeating a neighbour. */
const MIDDLE_STAGINGS: StagingKey[] = ["show_product", "present_space", "stand_present"];

/** Each staging's camera: its first choice and the one it takes when a neighbour already used that. */
const STAGING_CAMERA: Record<StagingKey, [CameraMoveKey, CameraMoveKey]> = {
  stand_present: ["dolly_in", "arc"],
  show_product: ["push_in", "rack_focus"],
  present_space: ["truck", "arc"],
  welcome_invite: ["dolly_in", "handheld"],
};

/**
 * The ONLY moves a two-hander is filmed with: the camera never changes its distance or its height to
 * the pair.
 *
 * ── The fault this is ──────────────────────────────────────────────────────────────────────────
 * Motu and Patlu (and every other pair) came out of the video model taller than in the still they were
 * animated from. A camera that eases in on a pair, or on whichever of them is talking, changes how big
 * they are on screen — and a video model re-draws a cartoon body from scratch as the view changes, so
 * "bigger on screen" became "taller". A pair is filmed the way a two-hander sitcom is: a steady frame,
 * a short sideways slide parallel to them, a gentle float at the same distance, or a focus pull
 * between them — always at eye level. The life comes from the performance, which is untouched.
 */
export const DUO_SAFE_MOVES: CameraMoveKey[] = ["static_locked", "truck", "handheld", "rack_focus"];

const DUO_STAGING_CAMERA: Record<StagingKey, [CameraMoveKey, CameraMoveKey]> = {
  stand_present: ["static_locked", "truck"],
  show_product: ["rack_focus", "truck"],
  present_space: ["truck", "static_locked"],
  welcome_invite: ["static_locked", "handheld"],
};

const isKey = <T extends string>(value: unknown, keys: Record<T, unknown>): value is T =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(keys, value);

/**
 * The staging, camera angle, lens, move, speed and gesture for every clip.
 *
 * Clip 1 introduces the business standing; the last clip invites the viewer in. Every clip in between
 * takes what its line asks for — a product to show, the place to present, a promise to stand behind —
 * and otherwise alternates, so no two neighbours are staged or shot alike. The scene plan's choices
 * (options.choices) win where they are usable; anything that is not in today's frame-safe vocabulary
 * (an old plan's "walk_and_talk", "pull_back", "orbit"…) is simply not usable, and the code plan stands.
 */
export function planClipMotion(
  segmentCount: number,
  adType: string,
  performer: Performer = "person",
  options: { lines?: string[]; choices?: (MotionChoice | null | undefined)[]; twoHander?: boolean } = {},
): ClipMotionPlan[] {
  const roles = clipRoles(segmentCount, adType);
  const n = roles.length;
  const { lines = [], choices = [], twoHander = false } = options;
  let previousStaging: StagingKey | null = null;
  let previousCamera: CameraMoveKey | null = null;
  let rotation = 0;
  let focusToggle = 0;

  return roles.map((role, i) => {
    const choice = choices[i] || {};
    const last = i === n - 1 && n > 1;

    // The staging.
    let key: StagingKey;
    const chosen = isKey(choice.staging, STAGINGS) ? choice.staging : null;
    if (last) key = "welcome_invite";
    else if (chosen && chosen !== "welcome_invite") key = chosen;
    else if (i === 0) key = "stand_present";
    else {
      const asked = stagingForLine(lines[i] || "", role, performer);
      if (asked && asked !== previousStaging) key = asked;
      else {
        key = MIDDLE_STAGINGS[rotation++ % MIDDLE_STAGINGS.length];
        if (key === previousStaging) key = MIDDLE_STAGINGS[rotation++ % MIDDLE_STAGINGS.length];
      }
    }
    previousStaging = key;
    const staging = STAGINGS[key];

    // The camera move: the scene plan's, else the staging's own, never the neighbour's. A pair is
    // only ever filmed from a fixed distance — see DUO_SAFE_MOVES.
    const [first, second] = (twoHander ? DUO_STAGING_CAMERA : STAGING_CAMERA)[key];
    const chosenCamera = isKey(choice.camera, CAMERA_MOVES) && (!twoHander || DUO_SAFE_MOVES.includes(choice.camera))
      ? choice.camera
      : null;
    let camera: CameraMoveKey = chosenCamera ?? (i === 0 && role === "wish" && !twoHander ? "arc" : first);
    if (camera === previousCamera) camera = camera === first ? second : first;
    previousCamera = camera;
    const move = CAMERA_MOVES[camera];

    // A pair is always at eye level: a low angle stretches the one nearer the lens, a high one squashes.
    const angleKey: ShotAngleKey = twoHander
      ? "eye_level"
      : isKey(choice.angle, SHOT_ANGLES) ? choice.angle : "eye_level";

    // In a two-hander the focus follows the conversation on some clips, not all.
    let focus: "speaker" | "both" = "both";
    if (twoHander) {
      if (choice.focus === "speaker" || choice.focus === "both") focus = choice.focus;
      else if (i > 0 && !last) focus = focusToggle++ % 2 === 0 ? "speaker" : "both";
    }

    return {
      clip: i,
      role,
      staging,
      camera: move,
      angle: SHOT_ANGLES[angleKey],
      lens: move.lens,
      speed: move.speed,
      focus,
      gesture: (performer === "deity" ? DEITY_GESTURE : GESTURE)[role],
      fallbackBeats: beatsFor(role, key, performer, twoHander),
      performer,
      twoHander,
    };
  });
}

/** A template with its performer filled in: "She turns…", "Both characters turn…". */
export function fillCast(template: string, cast = "The cast", plural = false): string {
  // The subject pronoun has to agree with the verb ending {s} adds: "she shows", "they show",
  // and for a named singular cast, the name itself — "as Ganesha turns", "as the model shows".
  const they = plural ? "they" : cast === "She" ? "she" : cast === "He" ? "he" : cast.replace(/^The /, "the ");
  const their = plural ? "their" : cast === "She" ? "her" : cast === "He" ? "his" : "their";
  const them = plural ? "them" : cast === "She" ? "her" : cast === "He" ? "him" : "them";
  return template
    .replace(/\{Cast\}/g, cast)
    .replace(/\{them\}/g, them)
    .replace(/\{their\}/g, their)
    .replace(/\{they\}/g, they)
    .replace(/\{es\}/g, plural ? "" : "es")
    .replace(/\{s\}/g, plural ? "" : "s");
}

/** What this clip's cast does, in words for the video prompt. */
export function stagingPath(plan: ClipMotionPlan, cast = "The cast", plural = false): string {
  const template = plan.performer === "deity" && plan.staging.deityPath ? plan.staging.deityPath : plan.staging.path;
  return fillCast(template, cast, plural);
}

/** The camera for this clip in the standard terms: "Eye level · 50mm · Slow Dolly In · slow, ultra smooth". */
export function cameraLabel(plan: ClipMotionPlan): string {
  return `${plan.angle.name} · ${plan.lens} · ${plan.camera.name} · ${plan.speed}`;
}

/**
 * How the still must be composed for this clip's staging and camera move.
 *
 * Drawn characters and deities are framed head to FEET: their height and build are the identity, and a
 * frame that crops the legs leaves the video to invent them, which is where a short character starts
 * growing. A real person keeps the three-quarter framing — their face has to stay big enough to match.
 *
 * Everything the video will need is IN the still: the product they turn to, the space they present.
 * What is not in the frame is what the video would have to invent, and invented space is where shops
 * stretched, furniture vanished and people walked into walls.
 */
export function compositionFor(plan: ClipMotionPlan): string {
  const start = plan.performer === "person"
    ? plan.staging.start
    : plan.staging.start.replace(/three-quarter body( \(head to knees\))?/, "the full figure from head to feet");
  return `${start}; ${plan.camera.framing}; shot ${plan.angle.name.toLowerCase()} on a ${plan.lens} lens; every object around `
    + `them fully inside the frame and clear of their body, the floor in front of them clear, and a fixed vertical reference `
    + `behind them — a counter edge, a door frame or a shelf line — that their height can be read against, with their feet and `
    + `the floor visible; the clip is animated inside exactly this view, so everything it needs is already in it`;
}

/** The line a frame prompt carries so the still is ready for its clip. */
export function framingForMotion(plan: ClipMotionPlan | undefined): string {
  if (!plan) return "";
  return `🎬 THIS CLIP: ${plan.staging.name} — filmed ${cameraLabel(plan)}. Compose the still for it: `
    + `${compositionFor(plan)}. Natural and relaxed, like a candid frame from a premium commercial.`;
}

/** The heading of the composition line code adds to a finished frame prompt. */
export const MOTION_COMPOSITION_HEADING = "COMPOSITION FOR MOTION";

/**
 * A finished frame prompt, guaranteed to carry its clip's composition for the video.
 *
 * Asking was not enough. In live runs the short continuation frames — capped at 100–200 words and
 * given a fixed list of sections — dropped the composition note on most clips. Stamped in code it is
 * always there, the same way the "attach this photo" directive is. Idempotent: a prompt that already
 * carries it is returned unchanged.
 *
 * `keepPose` is for a model ad's hero frame: its pose is the identity anchor every later frame copies,
 * so it keeps it, and only what the camera move needs is added.
 */
export function withMotionComposition(
  prompt: string,
  plan: ClipMotionPlan | undefined,
  options: { keepPose?: boolean } = {},
): string {
  if (!plan || !prompt.trim() || prompt.includes(MOTION_COMPOSITION_HEADING)) return prompt;
  if (options.keepPose) {
    return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: this pose opens the clip (${plan.staging.name}, `
      + `${cameraLabel(plan)}) — ${plan.camera.framing}; every object fully inside the frame and clear of the body.`;
  }
  return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: ${plan.staging.name} (${cameraLabel(plan)}) — `
    + `${compositionFor(plan)}. Natural and relaxed, hands at rest.`;
}

/**
 * Character direction with the stillness taken out.
 *
 * The catalogue was written for held frames — "Patlu stays planted and completely still", "the body
 * barely moves", "tripod-locked with absolutely no movement" — and a character told that comes out
 * frozen. Every clause that orders a frozen body is dropped; the rest — the character's manner,
 * gestures, expressions, what a deity must never touch — is kept.
 */
const STILLNESS = /\b(?:still(?:ness)?|planted|rooted|motionless|unmoving|at rest|returns? to rest|locked(?:[- ]off)?|tripod|on sticks|never walks?|walks? within|no step|no sway|no weight shift|no shoulder movement|no pacing|does not move|do not move|doesn't move|has not moved|barely moves|without moving|no movement|stays put|stationary|held frame|use none|any motion at all|absence of gesture|do not punctuate)\b/i;

export function withoutStillness(text: string): string {
  return dropClauses(text, STILLNESS);
}

/**
 * Character direction with the travelling taken out.
 *
 * Some entries were written as walking tours — "a light bouncing walk", "a smooth lateral steadicam
 * that walks with him", "he walks the counter" — and some send a character toward the lens: "takes a
 * half step towards the thing exciting him", "steps a half pace forward on her fact". Those are exactly
 * the movements that made the video model invent rooms, push people into furniture and grow one of a
 * pair. They are dropped from what the video director reads; the character's manner, voice and
 * gestures are kept.
 */
const TRAVEL = /\b(?:walk(?:s|ing|ed)?|stroll(?:s|ing)?|strides?|striding|paces?|pacing|wanders?|wandering|leads? the (?:way|viewer)|walking tour|arrives? at|crosses|crossing|enters|entering|exits|exiting|steadicam that walks|(?:half )?steps? (?:forward|towards?|closer)|takes? (?:a|the|one) (?:half )?(?:step|pace)|half (?:step|pace) forward|rocks? forward)\b/i;

export function withoutTravel(text: string): string {
  return dropClauses(text, TRAVEL);
}

function dropClauses(text: string, pattern: RegExp): string {
  if (!text) return "";
  return text
    .split(/(?<=[.;!?])\s+/)
    .map((sentence) => {
      const kept = sentence.split(/\s+—\s+/).filter((part) => !pattern.test(part));
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
  /**
   * What the attached frame SHOWS, read from the frame prompt it was generated from: the place, where
   * each person stands, what is within their reach. The video prompt opens with it, so the words agree
   * with the picture — a prompt that disagrees with its still is a prompt the video model "fixes" by
   * changing the picture.
   */
  frame?: string;
  /** The staging, specific to this frame: what they show — all of it IN the frame. */
  path: string;
  /** The move, specific to this frame, in the standard terms. */
  camera: string;
  /** Three beats: 0–2s, 2–5s, 5–8s. */
  beats: string[];
  /** Real, subtle life in the location — nothing that talks, nothing with text. */
  sceneLife: string;
}

export const BEAT_TIMES = ["0–2s", "2–5s", "5–8s"] as const;

export interface VeoSpeech {
  /**
   * Who speaks, for a two-hander — the name the video model can SEE: "Motu" for a famous character,
   * "the woman" or "the younger girl" for a cast of real people. Omitted for a single voice-over.
   */
  speaker?: string;
  /** The voice, e.g. "a warm, sweet, confident female voice". */
  voice: string;
  /** The exact spoken line. Never rewritten. */
  line: string;
  /** When in the clip, for a two-hander ("0–4s"). */
  at?: string;
  /** Where the speaker stands in the frame, for a two-hander ("on the LEFT of the frame"). */
  position?: string;
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
  /** A two-hander: both stay side by side, and the character who is listening reacts too. */
  twoHander?: boolean;
  /** How they carry themselves — "with a confident, easy, natural presence". Defaults by performer. */
  manner?: string;
  /** Which hand gestures fit this performer. Defaults by performer. */
  handGestures?: string;
  /**
   * What the frame shows, from code, used when the director did not describe it: the scene plan's
   * background for the clip, or "the client's own photograph of their entrance".
   */
  frameScene?: string;
  /** The frame is the client's own photograph of their premises — the place is real and stays as photographed. */
  realPhoto?: boolean;
  /**
   * A pair's height relationship in words a video model can hold — "Motu's head stays level with
   * Patlu's shoulder" (characterPacks `scale`). Generic when absent.
   */
  scaleNote?: string;
  /** The drawn characters' names, for the cartoon look lock: "Motu and Patlu". */
  drawnCast?: string;
}

/** How each kind of performer carries themselves, unless the subject says otherwise. */
export const PRESENCE: Record<Performer, string> = {
  person: "with a confident, easy, natural presenter's presence",
  cartoon: "in their own signature way from the show — the expressions and gestures the audience knows them by",
  deity: "with slow, graceful, majestic presence — serene and unhurried, never rushed",
};

/** The gestures that fit each kind of performer. An invitation in, never a goodbye wave. */
export const HAND_GESTURES: Record<Performer, string> = {
  person: "showing and presenting the business with an open hand, pointing to what is being spoken about, lightly "
    + "touching or holding up a product that is within reach, open palms on a promise, counting on the fingers, a hand "
    + "to the chest for trust, both palms opening to invite the viewer in",
  cartoon: "showing and presenting the business with an open hand, pointing to what is being spoken about, lightly "
    + "touching a product that is within reach, open palms on a promise, counting on the fingers, a hand "
    + "to the chest for trust, both palms opening to invite the viewer in",
  deity: "blessing gestures — the blessing palm (abhaya mudra) raised toward the business and the viewer, a slow open "
    + "palm passing over the counter and the stock in blessing, both hands opening in welcome — never touching, "
    + "holding, pointing at or presenting products, money or a phone",
};

/**
 * The picture keeps the attached frame's exact colour and exposure — written into EVERY Veo prompt.
 *
 * Finished videos came back lighter and paler than the frame they were animated from. A video model
 * drifts toward a bright, flat, low-contrast look unless it is held to the frame, so it is held here,
 * in the words that describe exactly that drift.
 */
export const COLOUR_LOCK = `• THE PICTURE: the frame's exact colour grade and exposure from the first frame to the last — the same saturation, contrast, white balance, skin tones, deep blacks, highlights and brightness. It never fades, washes out, turns pale, milky, hazy or overexposed, and the light in the room never changes. No glow, bloom, haze, light leaks, flares or sun rays.`;

/** The finish every clip is held to — per performer, because "photoreal" is wrong for a drawing. */
export const QUALITY_RULES = `LOOK: photoreal, premium television-commercial finish — sharp focus on faces and hands, stable anatomy (five fingers on every hand, natural joints), natural skin, hair and fabric movement, and smooth, steady motion with no flicker, warping, jitter or melting.`;

/**
 * The finish for drawn characters.
 *
 * ── The fault this is ──────────────────────────────────────────────────────────────────────────
 * Every clip used to be held to the same quality line — "Photoreal… natural skin… stable anatomy…
 * natural joints" — and every performance to "like a real presenter in a premium commercial". For a
 * person that is right. For Motu and Patlu it is an instruction to turn two drawn men into real ones,
 * and the video model obeyed it gradually across the eight seconds: a realistic human body has longer
 * legs and a longer torso than a cartoon's, so the characters got TALLER as the clip played. That is
 * why it was Motu and Patlu above all — cartoon ADULTS, whose drawn proportions are furthest from a
 * real man's. The shop stays photographic; the characters stay drawings.
 */
export function cartoonLook(names: string): string {
  return `LOOK: ${names} stay 2D cartoon characters drawn exactly as in the attached frame and in their show — the same flat cartoon colours, clean outlines and cartoon proportions (the same head size, the same short or long limbs, the same build) for all 8 seconds — inside a photoreal place. They are never turned into realistic people or 3D renders, and never given real human anatomy, longer legs or a longer body. Smooth, steady motion with no flicker, warping, jitter or melting.`;
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
  const quoted = /\s*['"‘“][^'"‘“’”]*[^\x00-\u{24F}\u{2000}-\u{206F}\s][^'"‘“’”]*['"’”]/gu;
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

/**
 * Movement that is NEVER allowed: leaving the business, going through a door, into another shop or
 * onto the road, or a crossing of the room — each asks the model to animate space the still does not
 * contain.
 */
const LEAVES = /\b(?:outside|through (?:the|a) door|out of the (?:shop|store|business|door|showroom)|onto the (?:road|street|footpath)|into (?:another|the next|a different) (?:shop|store|building|room)|(?:leaves?|leaving|exits?|exiting) the (?:shop|store|business|showroom|room)|enters? the (?:shop|store|business) from|across the (?:whole )?(?:room|shop|store)|around the (?:shop|store|room)|walk(?:s|ing)? into (?:the |a )?(?:table|counter|wall|shelf|door))\b/i;

/** Travel of any kind — nobody walks in a clip now. "A small half-step in place" is not matched. */
const WALKS = /\b(?:walk(?:s|ing|ed)?(?! in place)|stroll(?:s|ing)?|strides?|striding|marches|marching|wanders?|wandering|leads? the (?:way|viewer)|leading the way|(?:two|three|four|several|a few) steps|steps? (?:toward|towards|through|across|out|into|forward)|(?:moves?|comes?|approaches|advances?|heads?)\s+(?:forward|closer|toward(?:s)? the (?:camera|lens|viewer))|approach(?:es|ing)? the (?:camera|lens)|goes (?:to|into|out)|heads? (?:to|toward|towards|out)|crosses|crossing|enters|entering)\b/i;

/** A body on the furniture — the "walking over the tables and cupboards" the team saw. */
const ON_FURNITURE = /\b(?:onto|on top of|climb(?:s|ing)?|step(?:s|ping)? (?:on|onto|up on)|stand(?:s|ing)? on|sit(?:s|ting)? on|jump(?:s|ing)? (?:on|onto|over)|leap(?:s|ing)?|over the|across the)\b[^.;]{0,30}\b(?:tables?|counters?|desks?|cupboards?|almirah|shelf|shelves|racks?|cabinets?|display (?:case|unit|table)s?|chairs?|benches|bench|stools?|furniture|boxes|crates?)\b/i;

/** A camera that shows more than the still: a pull-back, a pan away, a crane, an orbit, a reveal. */
const REVEALS = /\b(?:pull(?:s|ing)? (?:back|out)|pullback|dolly(?:ing|ies)? (?:out|back)|zoom(?:s|ing)? out|widen(?:s|ing)?|cran(?:e|es|ed|ing)|pedestal(?:s|ing)?|tilts? up|pans?|panning|orbit(?:s|ing)?|360|tracking shot|follows?|following|reveal(?:s|ing)? (?:more|the (?:whole|entire|rest|wider|full)|(?:the )?(?:surroundings|room|shop|store|premises|space|showroom|street|road))|wide reveal|grand reveal)\b/i;

/** A direction that freezes the body — the failure the first videos had. */
const FROZEN = /\b(?:stands? (?:perfectly |completely )?still|standing still|holds? (?:absolutely )?still|motionless|stationary|frozen|freezes|statue|mannequin|locked[- ]off|tripod|on sticks|does not move|doesn't move|without moving|no movement|barely perceptible)\b/i;

/**
 * A camera sentence that would break the shot or the lip-sync: a cut, a whip or crash zoom, or a speed
 * effect that cannot carry a spoken line.
 */
const CAMERA_BREAKS = /\b(?:crash[- ]zoom|snap[- ]zoom|whip|cut(?:s)? to|jump cut|slow[- ]?motion|slow-mo|hyper-?lapse|time-?lapse)\b/i;

/**
 * An action that changes how big one of a PAIR is: moving toward the lens, rising, stretching, leaning
 * in. The director writes these as life ("Motu steps forward proudly", "Patlu rises onto his toes",
 * "leans in toward the camera") and the video model draws them as a character growing.
 */
const SCALE_CHANGING = /\b(?:toward(?:s)? the (?:camera|lens|viewer)|closer to the (?:camera|lens)|steps? (?:forward|closer|up)|leans? (?:in|into|forward|toward(?:s)?)|leaning (?:in|forward)|stands? (?:up|taller)|straightens? up|rises?|rising|on (?:his|her|their) toes|tip-?toes?|jumps?|jumping|hops?|bounc(?:e|es|ing)|stretch(?:es|ing)?|grows?|growing|puffs? (?:up|out)|lift(?:s|ing)? (?:it|them|the \w+) (?:up )?toward)\b/i;

/** Scene life that changes the light — the drift that left videos pale. Falls back to still air. */
const LIGHT_CHANGE = /\b(?:light (?:shifts?|shifting|changes?|flickers?|flickering|brightens?|dims?|streams?|streaming|pours?|floods?|plays?)|sun ?(?:light|beams?|rays?|shine)|shafts? of light|glow(?:s|ing)?|flares?|bloom|haze|hazy|brighten(?:s|ing)?|golden hour|dappled|god ?rays|sparkl(?:e|es|ing) of light|dust motes?)\b/i;

/**
 * A usable direction for one clip: the model's where it is usable, the plan's where it is not.
 * Field by field, so one bad beat does not throw away a good camera sentence.
 *
 * "Usable" means ALIVE, SAFE and INSIDE THE FRAME: nobody walks, steps toward the lens, gets onto the
 * furniture or leaves; nobody freezes; the camera never shows more than the still or breaks the shot;
 * and in a pair, nobody moves in a way that changes their size.
 */
export function resolveDirection(plan: ClipMotionPlan, direction?: Partial<VeoDirection> | null, cast = "The cast", plural = false): VeoDirection {
  const pair = !!plan.twoHander;
  const unsafe = (text: string) => LEAVES.test(text) || FROZEN.test(text) || WALKS.test(text) || ON_FURNITURE.test(text)
    || REVEALS.test(text) || (pair && SCALE_CHANGING.test(text));
  const planPath = stagingPath(plan, cast, plural);
  const modelPath = unterminated(withoutQuotedSpeech(clean(direction?.path, 400)));
  const path = modelPath && !unsafe(modelPath) ? modelPath : planPath;

  const modelCamera = unterminated(clean(direction?.camera));
  // A pair's camera is the plan's, word for word: the director's own sentence is where the dolly-ins
  // and "moves closer to Motu" came from (see DUO_SAFE_MOVES).
  const camera = !pair && modelCamera && !FROZEN.test(modelCamera) && !CAMERA_BREAKS.test(modelCamera)
    && !LEAVES.test(modelCamera) && !REVEALS.test(modelCamera) && !WALKS.test(modelCamera)
    ? modelCamera
    : unterminated(fillCast(plan.camera.action, cast, plural));

  const modelBeats = Array.isArray(direction?.beats)
    ? direction!.beats.map((b) => unterminated(withoutQuotedSpeech(unlabelled(clean(b, 300))))).filter(Boolean)
    : [];
  const beatsUsable = modelBeats.length === 3 && !modelBeats.some(unsafe);
  const beats = beatsUsable ? modelBeats : [...plan.fallbackBeats];

  const modelLife = unterminated(clean(direction?.sceneLife, 300));
  const sceneLife = modelLife && !WALKS.test(modelLife) && !LEAVES.test(modelLife) && !LIGHT_CHANGE.test(modelLife)
    && !REVEALS.test(modelLife)
    ? modelLife
    : "subtle, natural life in the real premises — gentle background movement true to this place, with the light exactly as the frame has it";

  // The frame description is a picture, not an action: anything in it that moves is dropped.
  const modelFrame = unterminated(withoutQuotedSpeech(clean(direction?.frame, 420)));
  const frame = modelFrame && !WALKS.test(modelFrame) && !REVEALS.test(modelFrame) ? modelFrame : "";
  return { frame, path, camera, beats, sceneLife };
}

const capitalised = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "Motu (on the LEFT of the frame)" — a speaker as the video model can find them in the picture. */
const speakerLabel = (s: VeoSpeech) => `${s.speaker}${s.position ? ` (${s.position})` : ""}`;

/**
 * The strict speaker block for a two-hander.
 *
 * Two characters sharing an 8-second clip is where the lines came out of the wrong mouth. A voice
 * named once, far from where it speaks, is not an attribution Veo holds on to. So every line is tied
 * to a time window, a speaker the model can SEE, a position in the frame and a voice, and the other
 * character is told in as many words to keep their mouth shut.
 */
function speakerBlock(speech: VeoSpeech[]): string {
  if (speech.length < 2 || !speech.every((s) => s.speaker)) return "";
  const rows = speech.map((s, i) => {
    const others = speech.filter((_, j) => j !== i).map(speakerLabel).join(" and ");
    return `• ${s.at ? `${s.at}: ` : ""}ONLY ${speakerLabel(s)} speaks this line, in their own voice. ${capitalised(others)} keep${speech.length > 2 ? "" : "s"} the mouth closed and listen${speech.length > 2 ? "" : "s"}.`;
  }).join("\n");
  return `WHO SPEAKS — STRICT, NEVER SWAPPED:
${rows}
Each line is spoken by that one speaker alone. Never give one speaker's line to the other, never let both speak at once, never repeat a line, and never let a line run on into the other's turn.

`;
}

/**
 * The focus following the conversation in a two-hander — only the FOCUS. A camera easing in on one of
 * them was one of the moves that grew the pair.
 */
function speakerFocusBlock(speech: VeoSpeech[]): string {
  if (speech.length < 2 || !speech.every((s) => s.speaker)) return "";
  const rows = speech.map((s, i) => {
    const others = speech.filter((_, j) => j !== i).map((o) => o.speaker).join(" and ");
    return `• ${s.at ? `${s.at}: ` : ""}the focus rests on ${speakerLabel(s)} while they speak; ${others} stay${speech.length > 2 ? "" : "s"} in frame, a touch softer, reacting.`;
  }).join("\n");
  return `SPEAKER FOCUS — ONLY THE FOCUS MOVES:
${rows}
A smooth rack focus between them. The camera itself does not move toward either of them, both stay exactly where and exactly the size they are, and nobody is enlarged to show who is talking. No cuts.

`;
}

/**
 * How the words are SPOKEN — the accent, stated.
 *
 * ── The fault this is ──────────────────────────────────────────────────────────────────────────
 * English ads came out of the video model in a British or American voice. The prompt said only
 * "speaking English", and the voices it described had no nationality — so the model used its default
 * English voice, which is not an Indian one. So an English ad names its accent in three places a video
 * model reads: the opening line, a VOICE AND ACCENT block right above the spoken lines, and the
 * negative prompt. Other languages are spoken natively already and get nothing extra.
 */
export interface SpeechAccent {
  /** What each line is "spoken in", e.g. "Indian English with a natural Andhra Pradesh accent". */
  spoken: string;
  /** The block above SPEECH. */
  block: string;
  /** The negative-prompt line. */
  negative: string;
}

export function speechAccentFor(language: string): SpeechAccent | null {
  const lang = (language || "").trim().toLowerCase();
  if (lang !== "en" && !/^english\b/.test(lang)) return null;
  return {
    spoken: "Indian English with a natural Andhra Pradesh accent",
    block: `VOICE AND ACCENT — INDIAN ENGLISH ONLY:
Every word is spoken in Indian English, with the warm, natural accent of an educated Telugu speaker from Andhra Pradesh — the way a friendly, well-spoken professional in Vijayawada, Visakhapatnam or Kakinada speaks English to a customer: clear and confident, with an Indian rhythm and intonation and the Indian pronunciation of the business's name, the town and every Indian word. These are Indian voices speaking to Indian customers. Never a British, American, Australian or any other foreign accent, and never an imitation of one.`,
    negative: "No British, American, Australian or any other foreign accent, no foreign-sounding voice — Indian English with an Andhra Pradesh accent only",
  };
}

/**
 * The two characters' sizes, stated before anything else in the prompt.
 *
 * Video models weigh the opening of a prompt most, so it goes first, it names the two speakers, and it
 * says what "the same height" means in terms the model can measure in the picture: each head against
 * the same line behind it, the feet on the same line of floor — and, where the pack knows it, the
 * pair's own relationship (characterPacks `scale`), e.g. "Motu's head stays level with Patlu's
 * shoulder".
 */
export function scaleLock(speech: VeoSpeech[], note?: string): string {
  const [a, b] = speech.map((s) => s.speaker).filter(Boolean) as string[];
  const pair = a && b ? `${a} and ${b}` : "the two characters";
  return `SCALE LOCK — THE MOST IMPORTANT RULE IN THIS PROMPT:
${capitalised(pair)} keep EXACTLY the heights, builds and body proportions of the attached frame in every frame of the video.${note ? ` ${note}` : ""} Each one's head stays at the same height against the wall, shelf or door behind them for all 8 seconds, and their feet stay on the same line of floor. Neither grows, shrinks, stretches, leans toward the lens, rises or gets thinner or rounder; nobody is re-proportioned to fill the shot or to match the other.`;
}

/**
 * The finished Veo 3 prompt for one clip.
 *
 * Assembled in code rather than written by the model, so the parts that must never drift — the frame
 * the clip is bounded by, the staging, the exact spoken line, the continuous shot, the locks, the
 * negatives — are guaranteed, and the model's contribution is limited to the direction it is actually
 * good at. It opens with THE FRAME because a video model weighs the start of a prompt most, and the
 * one thing it most needs to know is that the still IS the whole world of the clip.
 *
 * Kept short on purpose. It had grown to five overlapping lock blocks and twenty negatives — around
 * 1,200 words — and a rule that is stated three times in three wordings is a rule a video model
 * averages, not one it obeys.
 */
export function assembleVeoPrompt(input: VeoPromptInput): string {
  const { aspectRatio, plan, identityLock, language, speech, performanceNotes, cast, castPlural, twoHander } = input;
  const who = cast || "The cast";
  const plural = !!castPlural;
  const s = plural ? "" : "s";
  const is = plural ? "are" : "is";
  const d = resolveDirection(plan, input.direction, who, plural);
  const orientation = aspectRatio === "16:9" ? "horizontal" : "vertical";
  const manner = input.manner || PRESENCE[plan.performer];
  const gestures = input.handGestures || HAND_GESTURES[plan.performer];
  const cartoon = plan.performer === "cartoon";
  const positions = twoHander && speech.length >= 2 && speech[0].speaker && speech[1].speaker
    ? { left: speech[0].speaker!, right: speech[1].speaker! }
    : undefined;
  // The director's reading of the frame is a sentence ("The woman stands at…"); the code's fallback is a
  // place ("the saree section…"), which needs a verb in front of it.
  const frameSentence = d.frame
    ? `${capitalised(d.frame)}. `
    : clean(input.frameScene, 420) ? `It shows ${unterminated(clean(input.frameScene, 420))}. ` : "";

  // An English ad is spoken with an Indian accent — see speechAccentFor.
  const accent = speechAccentFor(language);
  const speechLines = speech.map((line) => {
    const speaker = line.speaker ? `${speakerLabel(line)}, ` : "";
    const at = line.at ? `${line.at} — ` : "";
    return `${at}${speaker}${line.voice}, speaking ${accent ? accent.spoken : language}, perfectly lip-synced:\n"${line.line}"`;
  }).join("\n\n");

  const frameBlock = `THE ATTACHED FRAME — THE WHOLE WORLD OF THIS CLIP:
${frameSentence}${input.realPhoto ? "This place is the client's own business, from their real photograph — it stays exactly as photographed. " : ""}The whole video happens inside this one view. ${who} stay${s} at the spot the frame shows, feet on the same floor — a turn, a gesture or a small half-step in place is the most anyone moves. Nobody walks toward the camera, across the room or out of it, and nobody steps onto, over or through a table, counter, cupboard, rack or any furniture. The camera never shows anything beyond the frame's edges: no new rooms, no stretched, extended or rebuilt shop, no street or road, no different place.`;

  const lockBlock = `LOCKED — ONLY THE PERFORMANCE AND THE CAMERA ARE NEW:
• THE ${cartoon ? "CHARACTERS" : twoHander ? "PEOPLE" : "PERSON"}: keep ${identityLock} exactly as in the frame — clothes in the same colours and details, and the same height, build and body proportions${twoHander ? ", including the height difference between the two" : ""}. Nothing about how anyone looks changes.
• THE PLACE: every object stays exactly where it is, whole — tables, counters, shelves, racks, products, stock, signs and the logo. Nothing appears, disappears, moves by itself or morphs; the room never stretches, extends or rearranges; hands never pass through objects and bodies never pass into furniture.
${COLOUR_LOCK}`;

  const cameraLine = `CAMERA — ${cameraLabel(plan)}: ${d.camera}. ${twoHander
    ? `${plan.camera.key === "static_locked" ? "A steady, composed frame — the life comes from the two of them. " : ""}The camera keeps the SAME distance and the SAME height from both for all 8 seconds — it never moves toward or away from them, never rises or lowers, never zooms — so both stay exactly the size they are in the frame.`
    : plan.camera.key === "static_locked"
      ? "A steady, composed frame — the life comes from the performance."
      // A rack focus is a still camera: calling it "a move that only ever moves closer" (the
      // sentence every other move gets) told Veo to move a camera the director had just held still.
      : plan.camera.key === "rack_focus"
        ? "The camera itself stays still — only the focus travels; it never pulls back, pans away, rises or circles around to show more than the frame."
        : `A ${plan.speed} move that only ever moves closer or drifts a little — it never pulls back, pans away, rises or circles around to show more than the frame.`} The frame's own angle is kept. One continuous shot, no cuts.`;

  const performance = `PERFORMANCE — ALIVE, NATURAL, IN PLACE:
${who} ${is} alive for the whole 8 seconds, ${manner}: natural breathing and blinks, the head and shoulders turning, an expressive face that reacts to the words${twoHander ? "" : ", a slight lean on the key words"} — never frozen like a statue or a cut-out, and never a moment when only the mouth moves. Clear, natural hand gestures on the key words — ${gestures} — reaching only what is within arm's reach in the frame, each flowing into the next. No waving goodbye at any point; an ending is an invitation in.${twoHander ? `
Both stay side by side${positions ? ` — ${positions.left} on the LEFT of the frame and ${positions.right} on the RIGHT, never swapping sides` : ""}. The one who is listening keeps reacting — nodding, smiling, looking at the speaker or at what is being shown — with the mouth closed.` : ""}`;

  const negatives = [
    "No text on screen, no subtitles, no watermark",
    "No background music — clean studio voice only, no echo",
    "No walking — not toward the camera, across the room, around the shop, through a door or out of the business",
    "No stepping, standing, sitting or climbing on tables, counters, cupboards, racks, shelves or any furniture; no body passing through furniture",
    "No camera pull-back, pan, crane, pedestal, orbit or tracking shot; no wide reveal; nothing shown beyond the frame's edges",
    "No new rooms, no stretched, extended or rebuilt shop, no street, road or outdoor scene, no change of location",
    "No object appearing, disappearing, moving by itself or changing shape",
    "No change of face, hair, outfit, colours, height, build or body proportions — nobody grows, shrinks or stretches",
    ...(twoHander
      ? ["No zoom, no dolly, no push-in, no low or high angle; no character moving nearer the lens than the other; no change to the height difference between them"]
      : []),
    ...(cartoon
      ? ["No realistic, live-action, 3D or human-anatomy version of the cartoon characters; no longer legs or longer bodies; no redrawn or restyled characters"]
      : []),
    "No washed-out, pale, hazy or overexposed colour; no colour or brightness change from the frame",
    "No frozen pose or statue stiffness; no waving goodbye or bye-bye hand",
    "No cuts, no crash zoom or whip pan, no slow motion, hyperlapse or time-lapse while anyone speaks",
    `No extra people, no new voices${twoHander ? ", no line spoken by the wrong speaker, no two speaking at once" : ""}`,
    "No warped anatomy, no extra or missing fingers, no flicker, no jitter, no melting textures",
    ...(accent ? [accent.negative] : []),
  ];

  return [
    `${aspectRatio} ${orientation} video, one continuous 8-second shot that brings the attached frame to life, filmed like a premium commercial${accent ? `, spoken in ${accent.spoken}` : ""}.`,
    frameBlock,
    twoHander ? scaleLock(speech, input.scaleNote) : "",
    lockBlock,
    `ACTION — ${plan.staging.name.toUpperCase()}:
${capitalised(d.path)}.
• ${BEAT_TIMES[0]}: ${d.beats[0]}
• ${BEAT_TIMES[1]}: ${d.beats[1]}
• ${BEAT_TIMES[2]}: ${d.beats[2]}
Eye contact with the lens on the key phrases, with brief natural glances toward what is being shown.${performanceNotes ? `\n${performanceNotes}` : ""}`,
    cameraLine,
    `${twoHander && plan.focus === "speaker" ? speakerFocusBlock(speech) : ""}${performance}`,
    `${accent ? `${accent.block}\n\n` : ""}${speakerBlock(speech)}SPEECH:\n${speechLines}`,
    `SCENE LIFE: ${d.sceneLife}.`,
    cartoon ? cartoonLook(input.drawnCast || "The characters") : QUALITY_RULES,
    `Negative prompt:\n${negatives.join("\n")}`,
  ].filter(Boolean).join("\n\n");
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
  /** A character's own performance direction, when there is one — already stripped of stillness and travel. */
  characterDirection?: string;
  /** A deity moves slowly and blesses rather than presenting. */
  performer?: Performer;
  /** Two characters share the frame: the camera keeps its distance (DUO_SAFE_MOVES). */
  twoHander?: boolean;
}) => `You are a world-class commercial director and the cinematographer behind India's best-performing ad reels. You direct image-to-video: each clip is an 8-second Veo 3 video animated from ONE attached still frame.

YOUR TASK: for each of the ${options.clipCount} clips, write the direction that brings its still frame to life — ${options.subject} performing the line with natural gestures, expressions and body language, filmed with the planned camera move — without the video ever needing anything the frame does not already show.

THE ONE IDEA EVERYTHING FOLLOWS FROM: THE FRAME IS THE WHOLE WORLD OF ITS CLIP.
The video model cannot see beyond the still. Whatever a direction asks for that is not in the frame, it INVENTS — and that is exactly how finished videos went wrong: a presenter walking toward the camera and out onto the road, characters walking over tables and cupboards, a clothing store stretching into a corridor that does not exist, a "reveal" that rebuilt the whole shop. You cannot see the frame either, but you can READ it: each clip comes with the FRAME prompt the still was generated from. Read it to learn exactly what the picture holds — the place, where each person stands, what is within their reach, what is behind them — and direct ONLY with that.

FOR EACH CLIP YOU RECEIVE:
• FRAME — the prompt the still was generated from.
• LINE — exactly what is spoken in this clip.
• PLANNED STAGING — stand and tell / show the product / present the space / invite the viewer in. Use it; make it specific to this frame.
• PLANNED CAMERA — the angle, lens, move and speed. Use it; make it specific to this frame.
• GESTURE INTENT — what the hands and body must achieve, and on which words.

THE CAMERA MOVES (all of them stay inside the frame — use the one planned):
• Locked Frame — steady; the life comes from the performance.
• Slow Dolly In — slowly closer to the subject; only ever closer.
• Push In on the Product — slowly closer to the product being shown.
• Rack Focus — the camera holds; the focus pulls between the subject and the product or stock beside them.
• Slight Arc — a few degrees around the subject at the same distance; never swinging around to show more of the room.
• Short Slide — a few centimetres sideways, parallel to the subject, for soft parallax.
• Handheld Float — a gentle, alive float at the same distance.
The angle is the FRAME's own; the camera keeps it.

WRITE, PER CLIP:
1. frame — ONE sentence, read from the FRAME prompt only: what the still shows — the place and the zone of it, where ${options.twoHander ? "each of the two stands (who is on the LEFT, who is on the RIGHT)" : options.subject + " stands"}, and the real objects within their reach and behind them. Plain description, no action, no camera. Never invent anything the FRAME prompt does not say.
2. path — ONE sentence: the planned staging made specific to THIS frame — what they show, touch or present, naming only real objects the frame has within arm's reach. Nobody goes anywhere: a turn, a gesture, a small half-step in place at most.
3. camera — ONE sentence: the planned move made specific to THIS frame — which way it drifts and what it settles on, all of it already in the frame. ${options.twoHander
    ? "For this PAIR the camera NEVER changes its distance or height to them: a steady frame, a short slide parallel to them, a gentle float at the same distance, or a rack focus — always at eye level. Never closer to them, never toward one of them."
    : "It may move closer (dolly in, push in) or drift a little; it never pulls back, pans away, rises, cranes, orbits or follows anyone."}
4. beats — exactly THREE short actions timed 0–2s, 2–5s and 5–8s. EVERY beat is alive — a hand action (showing, presenting, pointing to, lightly touching a REAL object within reach, an open palm on a promise, an inviting gesture), a turn of the shoulders or head, an expression, a nod. Place each gesture on the words it belongs to: work out roughly which part of the LINE falls in each window, and name that moment in plain English ("on the business name", "on the free delivery", "as the line ends") — NEVER quote the spoken words in path or beats. Include expression and eye-line.
5. sceneLife — one short phrase of subtle, real VISUAL movement already in that place that moves nothing in the frame and changes no light: a ceiling fan turning, fabric on a rack stirring, steam from a cup, a plant's leaves moving. Never a person walking through, never an object moving, never a change of light, never a sound, never text.

RULES:
• NOBODY WALKS. Not toward the camera, not across the room, not to something out of view, not through a door, not out of the business. Feet stay on the floor where the frame shows them. Never onto, over or through a table, counter, cupboard, rack, shelf or chair. Never frozen either: there is always a gesture, a turn or an expression.
• NOTHING BEYOND THE FRAME. Never a pull-back, a pan, a crane, a pedestal, an orbit, a tracking shot or a "reveal". Never a new room, a longer shop, the street or the road.
• THE WORLD IS LOCKED. Every table, chair, counter, shelf, product, door, wall and sign in the FRAME stays exactly where it is and whole. Never direct a hand or a body through or into an object. Never direct anything to appear, disappear or move by itself.
• YOU DIRECT PERFORMANCE AND CAMERA ONLY. Never change how anyone looks: no wardrobe change, no different clothes or colours, no change of height, build or proportions.
• THE LIGHT AND COLOUR ARE LOCKED. Never direct a change of light, brightness or colour — no light shifts, sun rays, glows, flares, haze or brightening.${options.twoHander ? `
• A PAIR NEVER CHANGES SIZE. Neither one steps toward the camera, leans in toward the lens, rises, stands up taller, goes onto the toes, jumps, bounces up or stretches — each stays in their spot at their own height.` : ""}
• One continuous shot. Never a cut, a whip pan, a crash zoom or a scene change. Never slow motion, hyperlapse or time-lapse while anyone speaks.
• Never describe the face, hair, skin, outfit or jewellery in path, camera or beats — they are locked by the attached frame.
• Never invent objects, signage or people that are not in the FRAME.
• The last clip invites the viewer IN — open palms, a come-in gesture, a nod. NEVER a goodbye wave or a bye-bye hand in any clip.
• Hands stay anatomically natural; each gesture is one clear movement that flows into the next — hands never hang lifeless.
• Frame for ${options.aspectRatio}.${options.performer === "deity" ? `
• A deity moves slowly and majestically, and every gesture is a blessing — never touching, holding, pointing at or presenting products, money or a phone.` : ""}${options.characterDirection ? `

${options.characterDirection}

Use that direction for HOW the characters perform — their manner, gestures and expressions. It never decides where they go and never freezes them: the planned staging, the frame and the planned camera always win. The speaking character performs the line; the other listens with the mouth closed and reacts in their own way. When the plan says SPEAKER FOCUS, only the focus moves to whoever is speaking — the camera itself never moves toward either of them.` : ""}

Return ONLY a JSON array, one object per clip, in clip order, no markdown:
[
  { "clip": 1, "frame": "", "path": "", "camera": "", "beats": ["", "", ""], "sceneLife": "" }
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
        out[index] = { frame: row.frame, path: row.path, camera: row.camera, beats: row.beats, sceneLife: row.sceneLife };
      }
    });
  } catch {
    // Unusable reply: every clip falls back to its plan, which is still an alive, directed shot.
  }
  return out;
}
