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
 * 3. Then every clip was animated strictly in place. Safe, but every ad looked the same — nobody
 *    ever walked, and the camera only drifted.
 *
 * ── What a clip does now: WHAT ITS LINE AND ITS SCENE NEED ──────────────────────────────────────
 * Each clip is one of five stagings — stand and tell, walk and talk, show the product, present the
 * space, invite the viewer in — chosen from what is said, the kind of video and the background (the
 * scene plan chooses, and code falls back to reading the line). A walk is a few natural steps along
 * clear floor that the FRAME ALREADY SHOWS, so nothing has to be invented, and the frame is composed
 * for it. Each clip is filmed with a named camera angle, lens, move and speed from the standard
 * commercial vocabulary (below), so the video is dynamic; in a two-hander the camera can follow the
 * conversation, easing in on whoever is speaking. What never changes: the people, and the place — no
 * object vanishes, nobody walks into furniture, through a door or out of the business, and the
 * closing clip invites the viewer IN (never a goodbye wave).
 *
 * The plan is deterministic for the same inputs, so a regenerated clip keeps its shot. One continuous
 * shot per clip, always: a cut inside an 8-second clip made from one still is where identity breaks.
 */

export type ClipRole = "message" | "proof" | "trust" | "cta" | "wish" | "message_cta";

/** Who performs, because a deity moves and gestures differently from a person or a cartoon. */
export type Performer = "person" | "cartoon" | "deity";

// ── The camera vocabulary ─────────────────────────────────────────────────────────────────────────

export type ShotAngleKey =
  | "eye_level" | "low_angle" | "high_angle" | "birds_eye" | "worms_eye" | "over_the_shoulder" | "pov" | "dutch_tilt";

export interface ShotAngle { key: ShotAngleKey; name: string; use: string }

export const SHOT_ANGLES: Record<ShotAngleKey, ShotAngle> = {
  eye_level: { key: "eye_level", name: "Eye level", use: "natural, realistic" },
  low_angle: { key: "low_angle", name: "Low angle", use: "powerful, premium" },
  high_angle: { key: "high_angle", name: "High angle", use: "elegant overview" },
  birds_eye: { key: "birds_eye", name: "Bird's eye", use: "top-down cinematic" },
  worms_eye: { key: "worms_eye", name: "Worm's eye", use: "dramatic hero shot" },
  over_the_shoulder: { key: "over_the_shoulder", name: "Over-the-shoulder", use: "conversation / product reveal" },
  pov: { key: "pov", name: "POV", use: "first-person experience" },
  dutch_tilt: { key: "dutch_tilt", name: "Dutch tilt", use: "dynamic tension" },
};

export type CameraMoveKey =
  | "dolly_in" | "dolly_out" | "truck" | "push_in" | "pull_back" | "pan" | "tilt_up" | "tilt_down" | "pedestal"
  | "orbit" | "crane_up" | "crane_down" | "arc" | "follow_tracking" | "handheld" | "static_locked";

export interface CameraMove {
  key: CameraMoveKey;
  /** The standard name a member and the video model both know, e.g. "Dolly In". */
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
  dolly_in: {
    key: "dolly_in", name: "Dolly In", effect: "builds emotion and focus", lens: "50mm", speed: "slow cinematic, ultra smooth",
    action: "the camera dollies slowly in toward {them}, building emotion and focus as the key words land",
    framing: "a medium shot with room to move in, the face clear and evenly lit",
  },
  dolly_out: {
    key: "dolly_out", name: "Dolly Out", effect: "reveals the surroundings", lens: "24mm", speed: "slow cinematic, ultra smooth",
    action: "the camera dollies slowly back from {them}, revealing more of the real premises the frame already shows",
    framing: "the subject in a medium shot with the real premises visible around them to be revealed",
  },
  truck: {
    key: "truck", name: "Truck Left / Right", effect: "side tracking", lens: "35mm", speed: "precision robotic, ultra smooth",
    action: "the camera trucks slowly sideways alongside {them}, the counter and stock gliding past behind with soft parallax",
    framing: "a counter, shelf or display running across the frame behind the subject, and a real foreground edge for parallax",
  },
  push_in: {
    key: "push_in", name: "Push In", effect: "luxury product emphasis", lens: "85mm", speed: "slow cinematic, ultra smooth",
    action: "the camera pushes in slowly toward the product {they} show{s}, ending on a rich, premium view of it with {them} still in frame",
    framing: "the product the clip talks about clearly visible and within reach, well lit, between the subject and the camera",
  },
  pull_back: {
    key: "pull_back", name: "Pull Back", effect: "grand reveal", lens: "24mm", speed: "slow cinematic, ultra smooth",
    action: "the camera pulls back slowly for a grand reveal of the premises around {them}, everything already in the frame opening up",
    framing: "the subject well inside the business with the premises and the logo around them",
  },
  pan: {
    key: "pan", name: "Pan Left / Right", effect: "environment showcase", lens: "24mm", speed: "slow cinematic",
    action: "the camera pans slowly across the real premises the frame shows and settles on {them}",
    framing: "a wide view of the real premises with the subject at one side of the frame",
  },
  tilt_up: {
    key: "tilt_up", name: "Tilt Up", effect: "height and architecture", lens: "24mm", speed: "slow cinematic",
    action: "the camera tilts up slowly from the counter or the product to {them} and the business above",
    framing: "the counter or product in the lower frame and the subject and upper premises above",
  },
  tilt_down: {
    key: "tilt_down", name: "Tilt Down", effect: "product and body reveal", lens: "50mm", speed: "slow cinematic",
    action: "the camera tilts down slowly from {their} face to the product in {their} hands or on the counter",
    framing: "the product held or on the counter directly below the subject's face, both in view",
  },
  pedestal: {
    key: "pedestal", name: "Pedestal Up / Down", effect: "vertical movement", lens: "35mm", speed: "ultra smooth",
    action: "the camera rises slowly on a pedestal move, keeping {them} framed as the premises open up behind",
    framing: "the camera at chest height with the upper premises and the logo above the subject",
  },
  orbit: {
    key: "orbit", name: "Orbit (partial)", effect: "premium cinematic hero", lens: "35mm", speed: "floating gimbal, ultra smooth",
    action: "the camera orbits slowly part of the way around {them} — a smooth partial orbit that never swings round to what is behind the camera",
    framing: "real depth behind the subject — counters, stock, the logo — so the orbit shows parallax",
  },
  crane_up: {
    key: "crane_up", name: "Crane Up", effect: "massive ending reveal", lens: "24mm", speed: "slow cinematic",
    action: "the camera cranes up slowly for an ending reveal of the premises, {them} still in frame",
    framing: "the subject well inside the business with open space above for the rise",
  },
  crane_down: {
    key: "crane_down", name: "Crane Down", effect: "enters the scene", lens: "24mm", speed: "slow cinematic",
    action: "the camera cranes down slowly into the scene and settles at eye level on {them}",
    framing: "a slightly high view of the premises with the subject clearly placed in it",
  },
  arc: {
    key: "arc", name: "Arc Shot", effect: "stylish subject movement", lens: "50mm", speed: "floating gimbal",
    action: "the camera arcs slowly around {them}, a few degrees at a time, revealing a little more of the premises behind",
    framing: "real depth behind the subject so the arc shows gentle parallax",
  },
  follow_tracking: {
    key: "follow_tracking", name: "Follow Tracking", effect: "walking sequence", lens: "35mm", speed: "steadicam tracking, ultra smooth",
    action: "a steadicam leads {them}, moving back smoothly as {they} walk{s} toward the camera, keeping {them} framed",
    framing: "a clear, open stretch of floor between the subject and the camera for the walk",
  },
  handheld: {
    key: "handheld", name: "Handheld", effect: "realistic documentary feel", lens: "35mm", speed: "gentle, natural",
    action: "a gentle, natural handheld feel follows {them}, alive but never shaky",
    framing: "a natural, candid composition",
  },
  static_locked: {
    key: "static_locked", name: "Static Locked", effect: "clean commercial look", lens: "50mm", speed: "locked, clean",
    action: "the camera holds a clean, locked composition while {they} present{s}",
    framing: "a balanced, clean composition",
  },
};

/**
 * The lens + motion combinations of a premium commercial, and the motion-speed keywords — shown to
 * the director so the camera sentence is written in the terms Veo responds to.
 */
export const LENS_COMBOS = [
  "24mm + Dolly In → architectural luxury",
  "35mm + Orbit → hero / business owner",
  "50mm + Push In → emotional portrait",
  "85mm + slow Dolly → premium product",
  "100mm macro + slider (Truck) → jewellery and fine details",
];
export const SPEED_KEYWORDS = [
  "slow cinematic", "ultra smooth", "floating gimbal", "precision robotic", "steadicam tracking",
  "slow motion (40–60%) — B-roll only, never while someone speaks", "hyperlapse / time-lapse — never while someone speaks",
];

// ── The stagings ──────────────────────────────────────────────────────────────────────────────────

export type StagingKey = "stand_present" | "walk_and_talk" | "show_product" | "present_space" | "welcome_invite";

export interface Staging {
  key: StagingKey;
  /** Short name a member reads, e.g. "Stand and tell". */
  name: string;
  /** True for the one staging that walks — decides which safety rules the video prompt carries. */
  walks: boolean;
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
    key: "stand_present", name: "Stand and tell", walks: false,
    path: "{Cast} stand{s} where the frame has {them}, facing the camera, and tell{s} the viewer about the business with real "
      + "presenter energy — a warm open-palm gesture on the business name, the weight shifting naturally, a small lean in "
      + "on the promise",
    deityPath: "{Cast} stand{s} where the frame has {them}, facing the viewer, serene and radiant, and raise{s} the "
      + "blessing palm toward the viewer and then over the business",
    start: "three-quarter body (head to knees), standing well inside the business and facing the camera, relaxed and "
      + "natural, with clear space around the arms for gestures and nothing touching the body",
  },
  walk_and_talk: {
    key: "walk_and_talk", name: "Walk and talk", walks: true,
    path: "{Cast} walk{s} a few natural, unhurried steps toward the camera along the clear, open floor the frame shows in "
      + "front of {them}, talking as {they} walk{s}, arms moving naturally with a presenting gesture toward the business, "
      + "and settle{s} before reaching anything — never toward a table, a counter, a shelf or a door",
    deityPath: "{Cast} glide{s} a few slow, majestic steps forward along the clear floor in front of {them}, and raise{s} "
      + "the blessing palm on the benefit",
    start: "standing a few metres back on a clear, open stretch of floor INSIDE the business — an aisle or open floor running "
      + "toward the camera, fully visible and empty, with nothing between the subject and the camera — facing the camera, "
      + "one foot slightly forward as if about to step",
  },
  show_product: {
    key: "show_product", name: "Show the product", walks: false,
    path: "{Cast} turn{s} to the real product or feature the line is about — one that is ALREADY within arm's reach in the "
      + "frame — show{s} it with an open hand, a light touch or by lifting it toward the camera, then turn{s} back to the lens",
    deityPath: "{Cast} turn{s} gracefully toward what the line is about, raise{s} the blessing palm over it without touching "
      + "it, then turn{s} back to the viewer",
    start: "three-quarter body standing beside the real product, counter or display the clip talks about, which sits within "
      + "arm's reach and fully in view, the body angled slightly toward it with the face to the camera",
  },
  present_space: {
    key: "present_space", name: "Present the space", walks: false,
    path: "{Cast} open{s} one arm to present the real space behind {them} — the counter, the stock, the work area — "
      + "then bring{s} the hand to the chest or an open palm on the promise",
    deityPath: "{Cast} sweep{s} the blessing palm slowly over the space behind {them}, then turn{s} the palm toward the viewer",
    start: "three-quarter body standing a comfortable distance in front of the business's real counter, shelves or work "
      + "area, all of it fully visible behind the subject, facing the camera",
  },
  welcome_invite: {
    key: "welcome_invite", name: "Invite the viewer in", walks: false,
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
  /** Motion-speed keywords, e.g. "steadicam tracking, ultra smooth". */
  speed: string;
  /**
   * In a two-hander: "speaker" eases the camera in on whoever is talking, "both" keeps the two-shot.
   * Always "both" for a single performer.
   */
  focus: "speaker" | "both";
  /** What the hands and body do, and on which words. */
  gesture: string;
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

/** Fallback beats for each staging. Every beat is alive, with a hand or body action. */
const STAGING_BEATS: Record<StagingKey, [string, string, string]> = {
  stand_present: [
    "stands with a warm smile, eyes to the lens, the weight settling onto one foot as the line begins",
    "a welcoming open-palm gesture toward the camera on the business name, the shoulders turning slightly with it",
    "a small lean in on the promise, an emphatic hand and a confident nod",
  ],
  walk_and_talk: [
    "starts walking toward the camera along the clear floor with a bright smile, eyes to the lens",
    "a presenting open hand toward the business while still walking, on the key words",
    "settles into place with a confident nod and an emphatic hand as the line lands",
  ],
  show_product: [
    "turns the shoulders toward the real product within reach, one hand already lifting toward it",
    "shows it — an open hand presenting it, a light touch or lifting it toward the camera — as it is named",
    "turns back to the lens, an emphatic gesture on the benefit and a smile",
  ],
  present_space: [
    "eyes to the lens, one arm beginning to open toward the space behind",
    "the arm sweeps to present the real counter, stock or work area behind as it is named, the head following it",
    "the hand comes to the chest on the promise, then an open, reassuring palm toward the viewer",
  ],
  welcome_invite: [
    "faces the camera with a bright smile, both hands beginning to open",
    "both palms open outward toward the viewer on the invitation, a small welcoming lean",
    "a warm come-in gesture and a nod as the line ends — an invitation, never a goodbye wave",
  ],
};

const DEITY_STAGING_BEATS: Record<StagingKey, [string, string, string]> = {
  stand_present: [
    "stands serene and radiant, a gentle smile, eyes to the viewer as the line begins",
    "the blessing palm rises slowly toward the viewer on the business name",
    "the palm turns to bless the premises, a gentle nod",
  ],
  walk_and_talk: [
    "glides forward slowly and majestically, eyes to the viewer",
    "the blessing palm rises on the benefit",
    "settles serenely, the palm held toward the viewer",
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
const ROLE_BEATS: Partial<Record<ClipRole, Record<"person" | "deity", [string, string, string]>>> = {
  wish: {
    person: [
      "a bright, festive smile, eyes to the lens as the greeting begins",
      "hands come together in a namaste with a small bow of the head",
      "hands open outward in a warm, celebratory gesture with a joyful lean",
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

function beatsFor(role: ClipRole, staging: StagingKey, performer: Performer): [string, string, string] {
  const kind = performer === "deity" ? "deity" : "person";
  const own = ROLE_BEATS[role]?.[kind];
  if (own) return [...own];
  const beats: [string, string, string] = [...(kind === "deity" ? DEITY_STAGING_BEATS : STAGING_BEATS)[staging]];
  if (role === "trust") beats[2] = TRUST_LAST_BEAT[kind];
  return beats;
}

// ── Reading a line for its staging ────────────────────────────────────────────────────────────────

/** A line that names something that can be SHOWN. English and Telugu. */
const PRODUCT_WORDS = /\b(?:products?|collections?|range|designs?|models?|brands?|variet(?:y|ies)|stock|sarees?|jewell?ery|gold|diamonds?|dress(?:es)?|menu|dish(?:es)?|sweets?|items?|these)\b|కలెక్షన్|డిజైన్|ప్రోడక్ట్|వెరైటీ|మోడల్|బ్రాండ్|చీర|నగల|బంగారు|స్వీట్|ఐటమ్|ఇవి/i;
/** A line about the place itself — a tour, the size, "come inside". */
const SPACE_WORDS = /\b(?:inside|showroom|branch|floor|sections?|space|whole (?:shop|store)|every corner|come in|walk in)\b|లోపల|షోరూమ్|సెక్షన్|మొత్తం|బ్రాంచ్/i;
/** A line that asks for trust — years, a guarantee, a promise. */
const TRUST_WORDS = /\b(?:years?|trust(?:ed)?|guarantee|warranty|promise|experience|family|since)\b|నమ్మకం|గ్యారంటీ|వారంటీ|సంవత్సరాల|ఏళ్ల|అనుభవం/i;

/** The staging a line asks for, or null when it asks for nothing in particular. */
export function stagingForLine(line: string, role: ClipRole, performer: Performer): StagingKey | null {
  const text = line || "";
  if (role === "wish" || role === "trust") return "stand_present";
  if (PRODUCT_WORDS.test(text)) return "show_product";
  if (SPACE_WORDS.test(text)) return performer === "deity" ? "present_space" : "walk_and_talk";
  if (TRUST_WORDS.test(text)) return "stand_present";
  return null;
}

/** Middle clips with no clear cue rotate through these, never repeating a neighbour. */
const MIDDLE_STAGINGS: StagingKey[] = ["walk_and_talk", "show_product", "present_space"];

/** Each staging's camera: its first choice and the one it takes when a neighbour already used that. */
const STAGING_CAMERA: Record<StagingKey, [CameraMoveKey, CameraMoveKey]> = {
  stand_present: ["dolly_in", "arc"],
  walk_and_talk: ["follow_tracking", "truck"],
  show_product: ["push_in", "tilt_down"],
  present_space: ["pan", "dolly_out"],
  welcome_invite: ["pull_back", "crane_up"],
};

/** The angle each move is usually filmed from. */
const CAMERA_ANGLE: Partial<Record<CameraMoveKey, ShotAngleKey>> = {
  orbit: "low_angle", pan: "high_angle", crane_down: "high_angle", crane_up: "eye_level",
};

const isKey = <T extends string>(value: unknown, keys: Record<T, unknown>): value is T =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(keys, value);

/**
 * The staging, camera angle, lens, move, speed and gesture for every clip.
 *
 * Clip 1 introduces the business standing (a hero orbit for the message, a gentle arc for a wish);
 * the last clip invites the viewer in. Every clip in between takes what its line asks for — a product
 * to show, the place to walk through, a promise to stand behind — and otherwise rotates, so no two
 * neighbours are staged or shot alike. The scene plan's choices (options.choices) win where they are
 * usable: a deity never walks, and only the last clip is the invitation.
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
  const noWalking = performer === "deity" || twoHander;
  const middle = noWalking ? MIDDLE_STAGINGS.filter((k) => k !== "walk_and_talk") : MIDDLE_STAGINGS;

  return roles.map((role, i) => {
    const choice = choices[i] || {};
    const last = i === n - 1 && n > 1;

    // The staging.
    let key: StagingKey;
    const chosen = isKey(choice.staging, STAGINGS) ? choice.staging : null;
    if (last) key = "welcome_invite";
    else if (chosen && chosen !== "welcome_invite") key = chosen;
    else if (i === 0) key = SPACE_WORDS.test(lines[0] || "") && !noWalking && role !== "wish" ? "walk_and_talk" : "stand_present";
    else {
      const asked = stagingForLine(lines[i] || "", role, performer);
      if (asked && asked !== previousStaging) key = asked;
      else {
        key = middle[rotation++ % middle.length];
        if (key === previousStaging) key = middle[rotation++ % middle.length];
      }
    }
    // A deity never walks; it presents the space it blesses. Neither does a pair — see above.
    if (noWalking && key === "walk_and_talk") key = "present_space";
    previousStaging = key;
    const staging = STAGINGS[key];

    // The camera move: the scene plan's, else the staging's own, never the neighbour's.
    const [first, second] = STAGING_CAMERA[key];
    const chosenCamera = isKey(choice.camera, CAMERA_MOVES) ? choice.camera : null;
    let camera: CameraMoveKey = chosenCamera
      ?? (i === 0 && key === "stand_present" ? (role === "wish" ? "arc" : "orbit") : first);
    if (camera === previousCamera) camera = camera === first ? second : first;
    // A walk is filmed moving with it; a still camera would undo the point of walking.
    if (staging.walks && (camera === "static_locked")) camera = "follow_tracking";
    previousCamera = camera;
    const move = CAMERA_MOVES[camera];

    const angleKey: ShotAngleKey = isKey(choice.angle, SHOT_ANGLES)
      ? choice.angle
      : twoHander && key === "show_product" ? "over_the_shoulder" : CAMERA_ANGLE[camera] ?? "eye_level";

    // In a two-hander the camera follows the conversation on some clips, not all.
    let focus: "speaker" | "both" = "both";
    if (twoHander) {
      if (choice.focus === "speaker" || choice.focus === "both") focus = choice.focus;
      else if (i > 0 && !last && !staging.walks) focus = focusToggle++ % 2 === 0 ? "speaker" : "both";
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
      fallbackBeats: beatsFor(role, key, performer),
      performer,
    };
  });
}

/** A template with its performer filled in: "She walks…", "Both characters walk…". */
export function fillCast(template: string, cast = "The cast", plural = false): string {
  // The subject pronoun has to agree with the verb ending {s} adds: "she walks", "they walk",
  // and for a named singular cast, the name itself — "as Ganesha glides", "as the model walks".
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

/** The camera for this clip in the standard terms: "Eye level · 35mm · Follow Tracking · steadicam tracking". */
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
 * Everything the video will need is IN the still: the product they turn to, the floor they walk on,
 * the space they present. What is not in the frame is what the video would have to invent, and
 * invented space is where furniture vanished and people walked into walls.
 */
export function compositionFor(plan: ClipMotionPlan): string {
  const start = plan.performer === "person"
    ? plan.staging.start
    : plan.staging.start.replace(/three-quarter body( \(head to knees\))?/, "the full figure from head to feet");
  return `${start}; ${plan.camera.framing}; shot ${plan.angle.name.toLowerCase()} on a ${plan.lens} lens; every object around `
    + `them fully inside the frame and clear of their body, and a fixed vertical reference behind them — a counter edge, `
    + `a door frame or a shelf line — that their height can be read against, with their feet and the floor visible`;
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
      + `${cameraLabel(plan)}) — ${plan.camera.framing}${plan.staging.walks ? `; ${STAGINGS.walk_and_talk.start}` : ""}; every `
      + `object fully inside the frame and clear of the body.`;
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
 * that walks with him", "he walks the counter" — which is exactly the movement that made the video
 * model invent rooms and push people into furniture. Those clauses are dropped from what the video
 * director reads; the character's manner, voice and gestures are kept.
 */
const TRAVEL = /\b(?:walk(?:s|ing|ed)?|stroll(?:s|ing)?|strides?|striding|paces?|pacing|wanders?|wandering|leads? the (?:way|viewer)|walking tour|arrives? at|crosses|crossing|enters|entering|exits|exiting|steadicam that walks)\b/i;

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
  /** The staging, specific to this frame: what they show, where they walk — all of it IN the frame. */
  path: string;
  /** The move, specific to this frame, in the standard terms: angle, lens, move, speed, what it reveals. */
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
}

/** How each kind of performer carries themselves, unless the subject says otherwise. */
export const PRESENCE: Record<Performer, string> = {
  person: "with a confident, easy, natural presenter's presence",
  cartoon: "in their own signature way from the show — the mannerisms the audience knows them by",
  deity: "with slow, graceful, majestic presence — serene and unhurried, never rushed",
};

/** The gestures that fit each kind of performer. An invitation in, never a goodbye wave. */
export const HAND_GESTURES: Record<Performer, string> = {
  person: "showing and presenting the business with an open hand, pointing to what is being spoken about, lightly "
    + "touching or holding up a product that is within reach, open palms on a promise, counting on the fingers, a hand "
    + "to the chest for trust, both palms opening to invite the viewer in",
  cartoon: "showing and presenting the business with an open hand, pointing to what is being spoken about, lightly "
    + "touching or holding up a product that is within reach, open palms on a promise, counting on the fingers, a hand "
    + "to the chest for trust, both palms opening to invite the viewer in",
  deity: "blessing gestures — the blessing palm (abhaya mudra) raised toward the business and the viewer, a slow open "
    + "palm passing over the counter and the stock in blessing, both hands opening in welcome — never touching, "
    + "holding, pointing at or presenting products, money or a phone",
};

/**
 * What the video may NEVER change about the people — written into every Veo prompt, in code.
 *
 * Live videos came back with the cast's height changing mid-clip, a character's build drifting, and
 * an outfit changing colour between one second and the next. The camera is now free to move closer
 * or further — the team wants dolly-ins and push-ins — so what is locked is the PEOPLE, measured
 * against the room, not their size on screen.
 */
export function identityRules(identityLock: string, cast = "The cast", twoHander = false): string {
  return `LOCKED — THE LOOK COMES ENTIRELY FROM THE ATTACHED FRAME:
The attached frame is the first frame of this video. Keep ${identityLock} exactly as they are in it, in every frame: the same face, the same hair, the same clothes in the same colours, patterns and details, the same footwear, accessories and props, and the same height, build and body proportions${twoHander ? ", including the size and height difference between the two characters" : ""}. Only the performance and the camera are new — nothing about how anyone LOOKS may change.
No outfit changes colour, shape or style, nothing is added or taken away, and the logo stays the same logo, in the same place, unchanged.

THE PEOPLE NEVER CHANGE — ONLY THE CAMERA MOVES:
The camera may move closer, further or around, but ${cast} ${twoHander ? "keep" : "keeps"} exactly the height, build and proportions the frame shows, measured against the counter, shelf or door frame beside them${twoHander ? ", and the height and build difference between the two characters is exactly what the frame shows" : ""}. Nobody grows taller or shorter, thinner or heavier, and nobody is re-proportioned to fit the shot.`;
}

/**
 * What the video may NEVER change about the PLACE — the rule the walking prompts broke.
 *
 * Every object in the still is real to the viewer the moment the clip starts. When the camera or the
 * cast moved past what the still showed, the model re-imagined the room: tables and products vanished,
 * doors appeared, people walked into furniture and out onto the road. A walk is allowed again, but
 * only along the clear floor the frame shows.
 */
export function worldRules(cast = "The cast", twoHander = false, walks = false): string {
  const are = twoHander ? "are" : "is";
  return `WORLD LOCK — THE PLACE AND EVERYTHING IN IT STAY EXACTLY AS THE FRAME SHOWS:
Every object in the attached frame stays exactly where it is, whole and unchanged, for all 8 seconds — tables, chairs, counters, shelves, products, stock, displays, doors, walls, windows, plants, signs and the logo. Nothing disappears, appears, melts, morphs, slides, floats or moves by itself, and the room does not rearrange as the camera moves. Hands never pass through objects, bodies never pass through or into furniture, and nobody walks into a table, a counter, a door or a wall.

PLACE LOCK — INSIDE THE BUSINESS, IN THE SPACE THE FRAME SHOWS:
${walks
    ? `${cast} walk${twoHander ? "" : "s"} only a few steps along the clear, open floor the frame shows ahead, and stop${twoHander ? "" : "s"} well before any table, counter, shelf or door.`
    : `${cast} ${are} already in place, in the spot the frame shows.`} Nobody walks out of the shop, onto the road or the street, into another shop, or through a door, and no door opens onto somewhere else. If the frame shows them near the entrance, they stay inside and face into the premises.`;
}

/**
 * The performance the video must have — alive — written into EVERY Veo prompt, in code.
 *
 * The team's standing instruction: nobody stands like a statue; the cast presents the business with
 * appropriate hand gestures and body language — standing and telling, walking and talking, or
 * showing a product, as the clip's staging says.
 */
export function performanceRules(
  cast = "The cast",
  plural = false,
  twoHander = false,
  manner: string = PRESENCE.person,
  gestures: string = HAND_GESTURES.person,
  positions?: { left: string; right: string },
  walks = false,
): string {
  const is = plural ? "are" : "is";
  const s = plural ? "" : "s";
  return `PERFORMANCE — ALIVE AND NATURAL:
${cast} ${is} alive for the whole 8 seconds, ${manner}, like a real presenter in a premium commercial: natural breathing and blinks, the shoulders and head turning, a lean in on the important words, an expressive face that reacts to the words. ${walks
    ? `${cast} walk${s} and talk${s} at the same time — a relaxed, natural walk of a few steps, arms moving naturally, presenting as ${plural ? "they" : "the walk"} goes, then settle${s} into place.`
    : `${cast} present${s} from where the frame has them — the weight shifting naturally, at most one small step.`} Never frozen like a statue or a cardboard cut-out, and never a moment when only the mouth moves.${twoHander ? `
Both characters stay side by side${positions ? ` — ${positions.left} on the LEFT of the frame and ${positions.right} on the RIGHT, never swapping sides` : ""}${walks ? ", walking together at the same pace" : ""}. The character who is listening keeps reacting — nodding, smiling, looking at the speaker or at what is being shown — with the mouth closed, never frozen while the other one talks.` : ""}

HAND GESTURES AND BODY LANGUAGE — MANDATORY IN THIS CLIP:
Appropriate, clearly visible hand gestures on the key words of the line — ${gestures}. Each gesture is smooth and natural, reaches only what is within arm's reach in the frame, and flows into the next movement. Body language is open, warm and confident, and matches the meaning of every word, so the body tells the same story as the voice. No waving goodbye and no bye-bye hand at any point — an ending is an invitation to come in.`;
}

/** The quality bar every clip is held to — stated, because an unstated standard is not one. */
export const QUALITY_RULES = `QUALITY — PREMIUM COMMERCIAL FINISH:
Photoreal, premium television-commercial quality: sharp focus on faces and hands, clean detail, stable anatomy (five fingers on every hand, natural joints), natural skin, hair and fabric movement, lighting and colour that stay consistent with the frame, and smooth, steady motion with no flicker, warping, jitter or melting.`;

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
  const quoted = /\s*['"‘“][^'"‘“’”]*[^\x00-\u024F\u2000-\u206F\s][^'"‘“’”]*['"’”]/g;
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
 * Movement that is NEVER allowed, whatever the staging: leaving the business, going through a door,
 * into another shop or onto the road, or a walk across the whole room — each asks the model to
 * animate space the still does not contain.
 */
const LEAVES = /\b(?:outside|through (?:the|a) door|out of the (?:shop|store|business|door|showroom)|onto the (?:road|street|footpath)|into (?:another|the next|a different) (?:shop|store|building)|(?:leaves?|leaving|exits?|exiting) the (?:shop|store|business|showroom|room)|enters? the (?:shop|store|business) from|across the (?:whole )?(?:room|shop|store)|around the (?:shop|store|room)|walk(?:s|ing)? into (?:the |a )?(?:table|counter|wall|shelf|door))\b/i;

/** Walking — allowed only in a walk-and-talk clip. "One step" / "a small step" is not matched. */
const WALKS = /\b(?:walk(?:s|ing|ed)?(?! in place)|stroll(?:s|ing)?|strides?|striding|marches|marching|wanders?|wandering|leads? the (?:way|viewer)|leading the way|(?:two|three|four|several|a few) steps|steps? (?:toward|towards|through|across|out|into)|goes (?:to|into|out)|heads? (?:to|toward|towards|out)|crosses|crossing|enters|entering)\b/i;

/** A direction that freezes the body — the failure the first videos had. */
const FROZEN = /\b(?:stands? (?:perfectly |completely )?still|standing still|holds? (?:absolutely )?still|motionless|stationary|frozen|freezes|statue|mannequin|locked[- ]off|tripod|on sticks|does not move|doesn't move|without moving|no movement|barely perceptible)\b/i;

/**
 * A camera sentence that would break the shot or the lip-sync: a cut, a whip or crash zoom, following
 * someone out, or a speed effect that cannot carry a spoken line. Dolly-ins and push-ins are welcome.
 */
const CAMERA_BREAKS = /\b(?:crash[- ]zoom|snap[- ]zoom|whip|cut(?:s)? to|jump cut|follows? (?:them|him|her) (?:out|through|into)|slow[- ]?motion|slow-mo|hyper-?lapse|time-?lapse|360)\b/i;

/**
 * A usable direction for one clip: the model's where it is usable, the plan's where it is not.
 * Field by field, so one bad beat does not throw away a good camera sentence.
 *
 * "Usable" means ALIVE, SAFE and TRUE TO THE STAGING: nothing leaves the business or walks across the
 * room; only a walk-and-talk clip walks; nobody freezes; and the camera never cuts, crash-zooms or
 * slows the speech down.
 */
export function resolveDirection(plan: ClipMotionPlan, direction?: Partial<VeoDirection> | null, cast = "The cast", plural = false): VeoDirection {
  const walks = plan.staging.walks;
  const unsafe = (text: string) => LEAVES.test(text) || FROZEN.test(text) || (!walks && WALKS.test(text));
  const planPath = stagingPath(plan, cast, plural);
  const modelPath = unterminated(withoutQuotedSpeech(clean(direction?.path, 400)));
  const path = modelPath && !unsafe(modelPath) ? modelPath : planPath;

  const modelCamera = unterminated(clean(direction?.camera));
  const camera = modelCamera && !FROZEN.test(modelCamera) && !CAMERA_BREAKS.test(modelCamera) && !LEAVES.test(modelCamera)
    ? modelCamera
    : unterminated(fillCast(plan.camera.action, cast, plural));

  const modelBeats = Array.isArray(direction?.beats)
    ? direction!.beats.map((b) => unterminated(withoutQuotedSpeech(unlabelled(clean(b, 300))))).filter(Boolean)
    : [];
  const beatsUsable = modelBeats.length === 3 && !modelBeats.some(unsafe);
  const beats = beatsUsable ? modelBeats : [...plan.fallbackBeats];

  const modelLife = unterminated(clean(direction?.sceneLife, 300));
  const sceneLife = modelLife && !WALKS.test(modelLife) && !LEAVES.test(modelLife)
    ? modelLife
    : "subtle, natural life in the real premises — soft light shifts and gentle background movement true to this place";
  return { path, camera, beats, sceneLife };
}

const capitalised = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * The strict speaker block for a two-hander.
 *
 * Two characters sharing an 8-second clip is where the lines came out of the wrong mouth — Motu's
 * closing line in Patlu's voice and the reverse. A voice named once, far from where it speaks, is not
 * an attribution Veo holds on to. So every line is tied to a time window, a name, a position in the
 * frame and a voice, and the other character is told in as many words to keep their mouth shut.
 */
function speakerBlock(speech: VeoSpeech[]): string {
  if (speech.length < 2 || !speech.every((s) => s.speaker)) return "";
  const rows = speech.map((s, i) => {
    const others = speech.filter((_, j) => j !== i).map((o) => o.speaker).join(" and ");
    return `• ${s.at ? `${s.at}: ` : ""}ONLY ${s.speaker}${s.position ? ` (${s.position})` : ""} speaks this line, in ${s.speaker}'s own voice. ${others} keep${speech.length > 2 ? "" : "s"} the mouth closed and listen${speech.length > 2 ? "" : "s"}.`;
  }).join("\n");
  return `WHO SPEAKS — STRICT, NEVER SWAPPED:
${rows}
Each line is spoken by the named character alone. Never give one character's line to the other, never let both speak at once, never repeat a line, and never let a line run on into the other character's turn.

`;
}

/**
 * The camera following the conversation in a two-hander — the team's "zoom in on Motu while Motu
 * talks, then on Patlu". Only on the clips the plan marks, so the ad is not the same shot every time.
 */
function speakerFocusBlock(speech: VeoSpeech[]): string {
  if (speech.length < 2 || !speech.every((s) => s.speaker)) return "";
  const rows = speech.map((s, i) => {
    const others = speech.filter((_, j) => j !== i).map((o) => o.speaker).join(" and ");
    const move = i === 0 ? "eases in toward" : "glides smoothly across toward";
    return `• ${s.at ? `${s.at}: ` : ""}the camera ${move} ${s.speaker}${s.position ? ` (${s.position})` : ""} and pulls focus to ${s.speaker} while ${s.speaker} speaks; ${others} stay${speech.length > 2 ? "" : "s"} in frame, softly out of focus, reacting.`;
  }).join("\n");
  return `SPEAKER FOCUS — THE CAMERA FOLLOWS THE CONVERSATION:
${rows}
Both stay in their places the whole time — only the camera and the focus move, with a smooth rack focus between them. No cuts.

`;
}

/**
 * The finished Veo 3 prompt for one clip.
 *
 * Assembled in code rather than written by the model, so the parts that must never drift — the
 * staging, the exact spoken line, the continuous shot, the identity, place and world locks, the
 * negatives — are guaranteed, and the model's contribution is limited to the direction it is actually
 * good at. The action comes first: Veo weighs the start of a prompt most.
 */
/**
 * The two characters' sizes, stated before anything else in the prompt.
 *
 * This is the fault that ruined most finished duo ads: the pair come out of the video model at
 * different heights from the still they were animated from — usually the shorter one grown. The
 * lock existed, but it sat in the middle of the prompt among a dozen other rules, and video models
 * weigh the opening of a prompt most. So it goes first, it names the two characters, and it says
 * what "the same height" means in a shot where the camera moves: they scale TOGETHER or not at all.
 *
 * The staging does its half of the job — a pair no longer walks toward the lens (planClipMotion),
 * because one of them arriving nearer the camera is what gave the model the excuse to re-proportion.
 */
export function scaleLock(speech: VeoSpeech[]): string {
  const [a, b] = speech.map((s) => s.speaker).filter(Boolean) as string[];
  const pair = a && b ? `${a} and ${b}` : "the two characters";
  return `SCALE LOCK — THE MOST IMPORTANT RULE IN THIS PROMPT:
${pair} keep EXACTLY the heights, builds and body proportions of the attached frame, in every single frame of the video. The height difference between them is fixed: whoever is taller in the frame stays taller by exactly the same amount, measured against the counter, shelf or door frame behind them.
Neither one grows, shrinks, stretches, gets rounder or gets thinner at any moment. Nobody is re-proportioned to fill the shot, to match the other character, or to fit a camera move.
If the camera moves closer or further, BOTH change size together by the same amount and stay at the same distance from the lens as each other — never one nearer than the other, never one bigger relative to the other than the frame shows.`;
}

export function assembleVeoPrompt(input: VeoPromptInput): string {
  const { aspectRatio, plan, identityLock, language, speech, performanceNotes, cast, castPlural, twoHander } = input;
  const who = cast || "The cast";
  const plural = !!castPlural;
  const walks = plan.staging.walks;
  const d = resolveDirection(plan, input.direction, who, plural);
  const orientation = aspectRatio === "16:9" ? "horizontal" : "vertical";
  const manner = input.manner || PRESENCE[plan.performer];
  const gestures = input.handGestures || HAND_GESTURES[plan.performer];
  const positions = twoHander && speech.length >= 2 && speech[0].speaker && speech[1].speaker
    ? { left: speech[0].speaker!, right: speech[1].speaker! }
    : undefined;

  const speechLines = speech.map((s) => {
    const speaker = s.speaker ? `${s.speaker}${s.position ? ` (${s.position})` : ""}, ` : "";
    const at = s.at ? `${s.at} — ` : "";
    return `${at}${speaker}${s.voice}, speaking ${language}, perfectly lip-synced:\n"${s.line}"`;
  }).join("\n\n");

  return `${aspectRatio} ${orientation} video, one continuous 8-second shot, animated from the attached frame — the frame comes to life, filmed like a premium commercial.
${twoHander ? `
${scaleLock(speech)}
` : ""}
${identityRules(identityLock, who, !!twoHander)}

${worldRules(who, !!twoHander, walks)}

ACTION — ${plan.staging.name.toUpperCase()}:
${capitalised(d.path)}.
• ${BEAT_TIMES[0]}: ${d.beats[0]}
• ${BEAT_TIMES[1]}: ${d.beats[1]}
• ${BEAT_TIMES[2]}: ${d.beats[2]}
Through all three beats nothing about them changes — the same faces, the same clothes in the same colours, the same heights and builds.
Eye contact with the lens on the key phrases, with brief natural glances toward what is being shown. Natural blinks and breathing, hands anatomically natural.${performanceNotes ? `\n${performanceNotes}` : ""}

CAMERA — ${cameraLabel(plan)}: ${d.camera}. A clearly visible, ${plan.speed} cinematic move from the first second to the last. One continuous shot, no cuts.

${twoHander && plan.focus === "speaker" ? speakerFocusBlock(speech) : ""}${performanceRules(who, plural, twoHander, manner, gestures, positions, walks)}

${speakerBlock(speech)}SPEECH:
${speechLines}

SCENE LIFE: ${d.sceneLife}.

${QUALITY_RULES}

Negative prompt:
No text on screen, no subtitles, no watermark
No background music, pure studio voice-over, crystal clear voice, no echo
${walks
    ? "No walking across the whole room or around the shop — only a few steps along the clear floor in the frame; no walking toward or through the door, no walking out of the business"
    : "No walking across the room, no walking around, no walking toward or through the door, no walking out of the business"}
No street, road, footpath, car park or outside shot, no entering another shop, no change of location, no door opening onto somewhere else
No object disappearing, appearing, moving by itself or changing shape — tables, chairs, counters, shelves, products and signs stay exactly as in the frame
No walking into or through furniture, no collisions, no hands passing through objects, no body clipping into the counter
No waving goodbye, no bye-bye or farewell wave, no waving at the camera — the closing gesture is an invitation in
No frozen pose, no statue or mannequin stiffness, no talking head where only the mouth moves, no hands hanging lifeless
No static or locked-off camera — the camera move runs for all 8 seconds
No cuts or scene change, no crash zoom or whip pan, no slow motion, hyperlapse or time-lapse while anyone speaks
No change of height, build or body proportions — nobody grows or shrinks relative to the room, no change to the height difference between characters
No character moving nearer the lens than the other, no one character growing while the other stays, no re-proportioning to match or fill the shot
No costume change — no different clothes, colours, patterns, footwear or accessories, nothing added or taken away
No redrawn, restyled or different-looking cast, no face morphing, no swapped or extra characters, no extra people
No warped anatomy, no extra or missing fingers, no flicker, no jitter, no melting textures
No change to the face, hair, outfit, logo or location from the attached frame
No extra people speaking, no new voices${twoHander ? ", no line spoken by the wrong character, no two characters speaking at once" : ""}`;
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
}) => `You are a world-class commercial director and the cinematographer behind India's best-performing ad reels. You direct image-to-video: each clip is an 8-second Veo 3 video animated from ONE attached still frame.

YOUR TASK: for each of the ${options.clipCount} clips, write the direction that brings its still frame to life — ${options.subject} standing and telling, walking and talking, or showing a product, exactly as that clip's PLANNED STAGING says, with natural gestures and body language, filmed with a clearly visible, premium camera move — without breaking anything the frame already fixed.

THE STANDARD: a real, premium, dynamic commercial reel. Not every clip the same: the staging and the camera change from clip to clip with the line, the scene and the kind of video.

WHY THE FRAME MATTERS: the video model cannot see beyond the still. When a direction sends someone somewhere the frame does not show — across the room, to a counter out of view, through a door or outside — the model invents that space, and people walk into tables and walls, leave the shop onto the road, and products vanish. So a walk is only ever a few steps along the clear floor the FRAME shows.

FOR EACH CLIP YOU RECEIVE:
• FRAME — the prompt the still was generated from: where ${options.subject} is, the real zone, the objects in view, the floor, the framing.
• LINE — exactly what is spoken in this clip.
• PLANNED STAGING — stand and tell / walk and talk / show the product / present the space / invite the viewer in. Use it; make it specific to this frame.
• PLANNED CAMERA — the angle, lens, move and speed. Use it; make it specific to this frame.
• GESTURE INTENT — what the hands and body must achieve, and on which words.

THE CAMERA VOCABULARY (write the camera sentence in these standard terms):
• Shot angles — Eye level (natural, realistic) · Low angle (powerful, premium) · High angle (elegant overview) · Bird's eye (top-down cinematic) · Worm's eye (dramatic hero) · Over-the-shoulder (conversation / product reveal) · POV (first-person experience) · Dutch tilt (dynamic tension).
• Movements — Dolly In (emotion & focus) · Dolly Out (reveal surroundings) · Truck Left / Right (side tracking) · Push In (luxury product emphasis) · Pull Back (grand reveal) · Pan Left / Right (environment showcase) · Tilt Up (height & architecture) · Tilt Down (product / body reveal) · Pedestal Up / Down · partial Orbit (premium hero) · Crane Up (ending reveal) · Crane Down (enter the scene) · Arc Shot (stylish) · Follow Tracking (walking) · Handheld (documentary) · Static Locked (clean commercial).
• Lens + motion — ${LENS_COMBOS.join(" · ")}.
• Speed — ${SPEED_KEYWORDS.join(" · ")}.

WRITE, PER CLIP:
1. path — ONE sentence: the planned staging made specific to THIS frame — what they show, touch or present, naming only real objects the FRAME already has within arm's reach. In a walk-and-talk clip: a few natural steps toward the camera along the clear floor the frame shows, talking and presenting as they walk, stopping well before anything. In every other clip they stay in their spot (at most one small step).
2. camera — ONE sentence in the vocabulary above: the planned angle, lens, move and speed made specific to THIS frame — which way it moves and what it reveals of what the frame already shows. The camera may move closer (dolly in, push in) or further (dolly out, pull back); the people never change size relative to the room.
3. beats — exactly THREE short actions timed 0–2s, 2–5s and 5–8s. EVERY beat is alive — a hand action (showing, presenting, pointing to, lightly touching a REAL object within reach, an open palm on a promise, an inviting gesture), a turn of the shoulders or head, a lean, an expression, or (in a walk clip) the walk itself. Place each gesture on the words it belongs to: work out roughly which part of the LINE falls in each window, and name that moment in plain English ("on the business name", "on the free delivery", "as the line ends") — NEVER quote the spoken words in path or beats. Include expression and eye-line.
4. sceneLife — one short phrase of subtle, real VISUAL movement in that location that moves nothing in the frame: steam from a cup, a ceiling fan turning, light shifting through a window, a flame flickering. Never a person walking through, never an object moving, never a sound, never text.

RULES:
• FOLLOW THE STAGING. Only a walk-and-talk clip walks. Nobody ever walks across the whole room, around the shop, to something out of view, through a door or out of the business. Never frozen either: there is always a gesture, a turn, a lean or an expression.
• THE WORLD IS LOCKED. Every table, chair, counter, shelf, product, door, wall and sign in the FRAME stays exactly where it is and whole. Never direct a hand or a body through or into an object. Never direct anything to appear, disappear or move by itself.
• INSIDE THE BUSINESS ONLY. Never the street, the road, the footpath, another shop, or a door opening onto somewhere else.
• YOU DIRECT PERFORMANCE AND CAMERA ONLY. Never change how anyone looks: no wardrobe change, no different clothes or colours, no change of height, build or proportions.
• One continuous shot. Never a cut, a whip pan, a crash zoom or a scene change. Never slow motion, hyperlapse or time-lapse while anyone speaks — it breaks the lip-sync. Never an orbit that swings round to what is behind the camera.
• Never describe the face, hair, skin, outfit or jewellery — they are locked by the attached frame.
• Never invent objects, signage or people that are not in the FRAME.
• The logo must stay visible and unchanged; never move the camera so the logo leaves the frame.
• Movement is premium and controlled — confident and natural, never shaky, never exaggerated or theatrical.
• The last clip invites the viewer IN — open palms, a come-in gesture, a nod. NEVER a goodbye wave or a bye-bye hand in any clip.
• Hands stay anatomically natural; each gesture is one clear movement that flows into the next — hands never hang lifeless.
• Frame for ${options.aspectRatio}.${options.performer === "deity" ? `
• A deity moves slowly and majestically, and every gesture is a blessing — never touching, holding, pointing at or presenting products, money or a phone.` : ""}${options.characterDirection ? `

${options.characterDirection}

Use that direction for HOW the characters perform — their manner, gestures, expressions and look. It never decides where they go and never freezes them: the planned staging, the world lock and the planned camera always win. The speaking character performs the line; the other listens with the mouth closed and reacts in their own way. When the plan says SPEAKER FOCUS, the camera eases in on whoever is speaking and pulls focus between them.` : ""}

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
    // Unusable reply: every clip falls back to its plan, which is still an alive, directed shot.
  }
  return out;
}
