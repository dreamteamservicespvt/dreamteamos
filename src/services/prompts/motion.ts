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
 * 4. Walking came back as "a few steps toward the camera", with the full commercial camera vocabulary
 *    — pull-backs, dolly-outs, cranes, orbits, arcs, pans, tilts, follow-tracking. Live videos broke
 *    exactly as in (2): presenters walked toward the lens and out onto the road, characters walked
 *    over tables and cupboards, and every move that showed MORE than the still (a pull-back "grand
 *    reveal", an orbit, a pan) made the video model build the rest of the shop itself — an extended,
 *    stretched, invented shop the client does not own. (2026-10-01)
 *
 * ── What a clip does now: IT ANIMATES ITS FRAME, AND NOTHING BEYOND IT ──────────────────────────
 * The member generates each clip's still from its Main Frame prompt, then attaches that still to its
 * Veo prompt. The video can only be as true as what the still contains, so a clip animates THAT
 * picture: the variety an ad needs — the entrance, the counter, the racks, the trial room — comes from
 * a DIFFERENT FRAME per clip (the scene plan gives every clip its own zone), never from walking or
 * flying the camera from one zone to another inside 8 seconds.
 *
 * Inside the frame a clip is alive: one of four in-place stagings — stand and tell, show the product,
 * present the space, invite the viewer in — chosen from the line, with real gestures, turns and
 * expressions; and a camera that only ever TIGHTENS ON or BREATHES AROUND what the still shows (a slow
 * push-in, a gentle float, a rack focus, or a locked frame). No walking, no stepping forward, and no
 * move that would reveal anything outside the frame's four edges. What never changes: the people, the
 * place and the light — and the closing clip invites the viewer IN (never a goodbye wave).
 *
 * The plan is deterministic for the same inputs, so a regenerated clip keeps its shot. One continuous
 * shot per clip, always: a cut inside an 8-second clip made from one still is where identity breaks.
 */

export type ClipRole = "message" | "proof" | "trust" | "cta" | "wish" | "message_cta";

/** Who performs, because a deity moves and gestures differently from a person or a cartoon. */
export type Performer = "person" | "cartoon" | "deity";

// ── The camera vocabulary ─────────────────────────────────────────────────────────────────────────

/**
 * The angle the STILL is taken from. A video animated from one still cannot change its angle without
 * moving the camera round the room — which is the move this file no longer makes — so the angle is a
 * property of the frame, chosen once and kept. Only natural, photographable angles: a bird's-eye, a
 * worm's-eye, a dutch tilt or a POV are what make a shop ad look staged and unreal.
 */
export type ShotAngleKey = "eye_level" | "low_angle" | "high_angle";

export interface ShotAngle { key: ShotAngleKey; name: string; use: string }

export const SHOT_ANGLES: Record<ShotAngleKey, ShotAngle> = {
  eye_level: { key: "eye_level", name: "Eye level", use: "natural, realistic" },
  low_angle: { key: "low_angle", name: "Slightly low angle", use: "confident, premium — a few degrees below the eyes" },
  high_angle: { key: "high_angle", name: "Slightly high angle", use: "elegant overview — a few degrees above the eyes" },
};

/**
 * What the camera may do inside one clip — only moves that stay INSIDE the attached frame.
 *
 * A push-in only tightens on what the still shows; a float breathes around it at the same distance;
 * a rack focus moves only the focus; a locked frame does nothing at all. Every move that showed MORE
 * than the still — pull back, dolly out, crane, pedestal, orbit, arc, pan, tilt, truck, follow
 * tracking — made the video model invent the rest of the room, and is gone (see the history above).
 */
export type CameraMoveKey = "push_in" | "rack_focus" | "handheld" | "static_locked";

export interface CameraMove {
  key: CameraMoveKey;
  /** The standard name a member and the video model both know, e.g. "Slow Push In". */
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
  push_in: {
    key: "push_in", name: "Slow Push In", effect: "builds focus and emotion", lens: "50mm", speed: "slow cinematic, ultra smooth",
    action: "the camera pushes in very slowly toward {them}, only a few percent across the 8 seconds, so the picture tightens on what the frame already shows and never reveals anything beyond its edges",
    framing: "a medium shot with comfortable breathing room around the subject, the face clear and evenly lit",
  },
  rack_focus: {
    key: "rack_focus", name: "Rack Focus", effect: "guides the eye without moving the camera", lens: "85mm", speed: "smooth focus pull",
    action: "the camera holds its position while the focus travels smoothly between what {they} show{s} and {their} face, guiding the eye inside the frame",
    framing: "the product or detail the clip talks about within arm's reach and fully in view, with the face also in the frame",
  },
  handheld: {
    key: "handheld", name: "Gentle Float", effect: "alive, natural documentary feel", lens: "35mm", speed: "gentle, natural",
    action: "a gentle, breathing handheld float at the same distance from {them} — alive and natural, never shaky, never travelling anywhere",
    framing: "a natural, candid composition with everything important fully inside the frame",
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
  "50mm + Slow Push In → presenter, emotion and focus",
  "85mm + Rack Focus → product to face, premium detail",
  "35mm + Gentle Float → natural, documentary life",
  "50mm + Static Locked → clean two-shot, conversation",
];
export const SPEED_KEYWORDS = [
  "slow cinematic", "ultra smooth", "gentle, natural", "smooth focus pull", "locked, clean",
];

// ── The stagings ──────────────────────────────────────────────────────────────────────────────────

/**
 * What the cast does in one clip — always IN PLACE, feet where the frame has them.
 *
 * "Walk and talk" was removed on 2026-10-01: a walk toward the camera is the movement that sent people
 * out onto the road and over the furniture (see the history at the top). A scene plan or saved kit that
 * still names it is read as "present the space", the same intent without the steps.
 */
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
      + "presenter energy — a warm open-palm gesture on the business name, the shoulders turning with it, an emphatic "
      + "hand on the promise — feet planted where they are",
    deityPath: "{Cast} stand{s} where the frame has {them}, facing the viewer, serene and radiant, and raise{s} the "
      + "blessing palm toward the viewer and then over the business",
    start: "three-quarter body (head to knees), standing well inside the business and facing the camera, relaxed and "
      + "natural, with clear space around the arms for gestures and nothing touching the body",
  },
  show_product: {
    key: "show_product", name: "Show the product",
    path: "{Cast} turn{s} to the real product or feature the line is about — one that is ALREADY within arm's reach in the "
      + "frame — show{s} it with an open hand, a light touch or by lifting it toward the camera, then turn{s} back to the lens",
    deityPath: "{Cast} turn{s} gracefully toward what the line is about, raise{s} the blessing palm over it without touching "
      + "it, then turn{s} back to the viewer",
    start: "three-quarter body standing beside the real product, counter or display the clip talks about, which sits within "
      + "arm's reach and fully in view, the body angled slightly toward it with the face to the camera",
  },
  present_space: {
    key: "present_space", name: "Present the space",
    path: "{Cast} open{s} one arm to present the real space behind {them} — the counter, the stock, the work area — "
      + "then bring{s} the hand to the chest or an open palm on the promise",
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
  /** Motion-speed keywords, e.g. "steadicam tracking, ultra smooth". */
  speed: string;
  /**
   * In a two-hander: "speaker" moves the FOCUS to whoever is talking (a rack focus — the camera stays
   * where it is), "both" keeps the two-shot. Always "both" for a single performer.
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

/** Fallback beats for each staging. Every beat is alive, with a hand or body action. */
const STAGING_BEATS: Record<StagingKey, [string, string, string]> = {
  stand_present: [
    "stands with a warm smile, eyes to the lens, the shoulders settling as the line begins",
    "a welcoming open-palm gesture toward the camera on the business name, the shoulders turning slightly with it",
    "an emphatic hand on the promise and a confident nod",
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
    "both palms open outward toward the viewer on the invitation, a small welcoming nod",
    "a warm come-in gesture and a nod as the line ends — an invitation, never a goodbye wave",
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
const ROLE_BEATS: Partial<Record<ClipRole, Record<"person" | "deity", [string, string, string]>>> = {
  wish: {
    person: [
      "a bright, festive smile, eyes to the lens as the greeting begins",
      "hands come together in a namaste with a small bow of the head",
      "hands open outward in a warm, celebratory gesture with a joyful smile",
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
  if (SPACE_WORDS.test(text)) return "present_space";
  if (TRUST_WORDS.test(text)) return "stand_present";
  return null;
}

/** Middle clips with no clear cue rotate through these, never repeating a neighbour. */
const MIDDLE_STAGINGS: StagingKey[] = ["show_product", "present_space", "stand_present"];

/**
 * Each staging's camera: its first choice and the one it takes when a neighbour already used that.
 * A single presenter always has a gentle move — never a frozen picture — and every move stays inside
 * the frame (see CAMERA_MOVES).
 */
const STAGING_CAMERA: Record<StagingKey, [CameraMoveKey, CameraMoveKey]> = {
  stand_present: ["push_in", "handheld"],
  show_product: ["rack_focus", "push_in"],
  present_space: ["handheld", "push_in"],
  welcome_invite: ["push_in", "handheld"],
};

/**
 * The ONLY moves a two-hander is filmed with: the camera never changes its distance or its height to
 * the pair.
 *
 * ── The fault this is ──────────────────────────────────────────────────────────────────────────
 * Motu and Patlu (and every other pair) came out of the video model taller than in the still they were
 * animated from — clip after clip, even with the SCALE LOCK written at the top of the prompt. The
 * prompt was fighting itself: the same pair was being filmed with a dolly-in, a push-in, a crane, a
 * pedestal, a partial orbit from a LOW ANGLE, a pull-back, and on "speaker focus" clips a camera that
 * eased in on whichever of them was talking. Every one of those moves changes how big the pair is on
 * screen or how their bodies are drawn in perspective — and a video model re-draws cartoon bodies
 * from scratch as the view changes, so "bigger on screen" became "taller", and "nearer to Patlu"
 * became "Patlu grew". The sideways truck and pan kept after that still re-drew the bodies against
 * new background (2026-10-01), so they are gone too.
 *
 * So a pair is filmed the way a two-hander sitcom is: a locked frame, a focus that moves to whoever
 * speaks, or a barely-there float at the same distance — always at eye level. The life comes from the
 * performance, which is untouched. A drawn pair (CARTOON_PAIR_MOVES) does not even float.
 */
export const DUO_SAFE_MOVES: CameraMoveKey[] = ["static_locked", "rack_focus", "handheld"];

/**
 * A pair of DRAWN characters — Motu and Patlu above all — is filmed only on a locked frame or a rack
 * focus. Any camera movement at all is a change of view, and a change of view is what makes the video
 * model re-draw a cartoon body; a real person's body survives a float, a drawn one does not.
 */
export const CARTOON_PAIR_MOVES: CameraMoveKey[] = ["static_locked", "rack_focus"];

const DUO_STAGING_CAMERA: Record<StagingKey, [CameraMoveKey, CameraMoveKey]> = {
  stand_present: ["static_locked", "handheld"],
  show_product: ["rack_focus", "static_locked"],
  present_space: ["handheld", "static_locked"],
  welcome_invite: ["static_locked", "handheld"],
};

const isKey = <T extends string>(value: unknown, keys: Record<T, unknown>): value is T =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(keys, value);

/**
 * The staging, camera angle, lens, move, speed and gesture for every clip.
 *
 * Clip 1 introduces the business standing; the last clip invites the viewer in. Every clip in between
 * takes what its line asks for — a product to show, the place to present, a promise to stand behind —
 * and otherwise rotates, so no two neighbours are staged or shot alike. The scene plan's choices
 * (options.choices) win where they are usable; only the last clip is the invitation. Nobody walks, and
 * the camera never leaves the frame (see the history at the top of this file).
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
  /** Two drawn characters: a locked frame or a rack focus only — see CARTOON_PAIR_MOVES. */
  const cartoonPair = twoHander && performer === "cartoon";
  const allowed: CameraMoveKey[] = cartoonPair ? CARTOON_PAIR_MOVES : twoHander ? DUO_SAFE_MOVES : Object.keys(CAMERA_MOVES) as CameraMoveKey[];
  let previousStaging: StagingKey | null = null;
  let previousCamera: CameraMoveKey | null = null;
  let rotation = 0;

  return roles.map((role, i) => {
    const choice = choices[i] || {};
    const last = i === n - 1 && n > 1;

    // The staging. A legacy "walk_and_talk" (a saved scene plan) is the same intent without the steps.
    let key: StagingKey;
    const asStaging = choice.staging === "walk_and_talk" ? "present_space" : choice.staging;
    const chosen = isKey(asStaging, STAGINGS) ? asStaging : null;
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

    // The camera move: the scene plan's, else the staging's own, never the neighbour's — and only ever
    // one this cast may be filmed with (a pair: DUO_SAFE_MOVES; a drawn pair: CARTOON_PAIR_MOVES).
    const usable = (k: CameraMoveKey) => allowed.includes(k);
    const [tableFirst, tableSecond] = (twoHander ? DUO_STAGING_CAMERA : STAGING_CAMERA)[key];
    const first: CameraMoveKey = usable(tableFirst) ? tableFirst : allowed[0];
    const second: CameraMoveKey = usable(tableSecond) && tableSecond !== first ? tableSecond : allowed.find((k) => k !== first) ?? first;
    const wantsSpeakerFocus = twoHander && choice.focus === "speaker";
    const chosenCamera = isKey(choice.camera, CAMERA_MOVES) && usable(choice.camera)
      ? choice.camera
      : wantsSpeakerFocus ? "rack_focus" : null;
    let camera: CameraMoveKey = chosenCamera ?? (i === 0 && !twoHander && role === "wish" ? "handheld" : first);
    if (camera === previousCamera) camera = camera === first ? second : first;
    previousCamera = camera;
    const move = CAMERA_MOVES[camera];

    // A pair is always at eye level: a low angle stretches the one nearer the lens, a high one squashes.
    const angleKey: ShotAngleKey = twoHander
      ? "eye_level"
      : isKey(choice.angle, SHOT_ANGLES) ? choice.angle : "eye_level";

    // In a two-hander the focus follows the conversation on the rack-focus clips — the camera never does.
    const focus: "speaker" | "both" = twoHander && camera === "rack_focus" ? "speaker" : "both";

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
      twoHander,
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
 * Everything the video will need is IN the still: the product they turn to, the space they present,
 * the room around them. What is not in the frame is what the video would have to invent, and invented
 * space is where furniture vanished and people walked into walls.
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
 * so it keeps it, and only what the camera move needs is added. `plate` is for a clip shot in a client
 * photograph: the photograph's own framing is kept, so no composition is asked for.
 */
export function withMotionComposition(
  prompt: string,
  plan: ClipMotionPlan | undefined,
  options: { keepPose?: boolean; plate?: boolean } = {},
): string {
  if (!plan || !prompt.trim() || prompt.includes(MOTION_COMPOSITION_HEADING)) return prompt;
  // A client photograph is the frame (utils/locationAssignment backgroundPlateRule): its own framing and
  // angle are kept, so nothing here may ask for a different composition — only room for the gestures.
  if (options.plate) {
    return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: ${plan.staging.name} (${cameraLabel(plan)}) — the photograph's own `
      + `framing and camera angle, unchanged; the subject placed into it on the real floor, with clear space around the `
      + `arms for gestures and every object fully in view.`;
  }
  if (options.keepPose) {
    return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: this pose opens the clip (${plan.staging.name}, `
      + `${cameraLabel(plan)}) — ${plan.camera.framing}; every object fully inside the frame and clear of the body.`;
  }
  return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: ${plan.staging.name} (${cameraLabel(plan)}) — `
    + `${compositionFor(plan)}. Natural and relaxed, hands at rest.`;
}

/** The heading of the scale line code adds to a pair's frame prompt — see withScaleAnchor. */
export const SCALE_ANCHOR_HEADING = "SCALE ANCHOR";

/**
 * A finished frame prompt, guaranteed to carry the cast's size against the room (CharacterPack.
 * scaleAnchor) — the same words the video prompt's scale lock carries, so the still and the video
 * measure the characters by the same counter. Stamped in code because a frame model asked to repeat a
 * sentence in every prompt drops it on the short continuation frames. Idempotent.
 */
export function withScaleAnchor(prompt: string, anchor?: string): string {
  const text = (anchor || "").trim();
  if (!text || !prompt.trim() || prompt.includes(SCALE_ANCHOR_HEADING)) return prompt;
  return `${prompt.trimEnd()}\n\n${SCALE_ANCHOR_HEADING}: ${unterminatedText(text)}. Both stand on the floor at the same distance from the camera, beside the real counter, shelf or door frame that shows it.`;
}

/** A sentence without its trailing full stop, so a stamped line never reads "door frame.. Both". */
const unterminatedText = (value: string) => value.replace(/[\s.;,]+$/, "");

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

/**
 * Character direction with every move toward the camera taken out — for a PAIR's video.
 *
 * The catalogue's body language was written to make the comedy read: "Motu leans in and rocks forward
 * … taking a half step towards the thing", "Mickey takes the half step forward", "Chutki steps a half
 * pace forward on her fact". To a video model a body coming nearer the lens is a body getting bigger,
 * and in a two-shot that is one character growing next to the other — the Motu and Patlu fault. The
 * manner, the gestures and the expressions are kept; only the approach goes (2026-10-01).
 */
const APPROACH = /\b(?:leans? (?:in|forward|into|towards?)|leaning (?:in|forward|towards?)|rocks? forward|forward-leaning|weight forward|(?:a |one |the )?half[- ](?:step|pace)|steps? (?:a )?(?:half )?(?:pace )?(?:forward|in|towards?|closer)|stepping (?:in|forward)|takes? (?:a |one |the )?(?:small |single )?step|popping up|pops? up|springs? (?:up|forward)|springing|up on (?:his|her|their|the) toes|on the balls of (?:his|her|their) feet|bouncy|bounc(?:es|ing))\b/i;

export function withoutApproach(text: string): string {
  return dropClauses(text, APPROACH);
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
   * What the attached still SHOWS, read from its frame prompt: where they stand, the zone, the main
   * real objects around them, the framing. The video is told what it is animating, so it has no reason
   * to invent anything around it.
   */
  frame: string;
  /** The staging, specific to this frame: what they show or present — all of it IN the frame. */
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
  /**
   * The prompt the attached still was generated from. Read for the FRAME line when the director's own
   * description of the frame is missing or unusable (frameSummaryOf).
   */
  framePrompt?: string;
  /**
   * The pair's size against a real object in the room — "the counter top reaches Motu's chest and
   * Patlu's waist" — the same words the frame prompt carried (CharacterPack.scaleAnchor).
   */
  scaleAnchor?: string;
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
 * an outfit changing colour between one second and the next. A single presenter's camera may still ease
 * slightly closer (a slow push-in), so what is locked is the PEOPLE, measured against the room, not
 * their size on screen.
 */
export function identityRules(identityLock: string, cast = "The cast", twoHander = false): string {
  return `LOCKED — THE LOOK COMES ENTIRELY FROM THE ATTACHED FRAME:
The attached frame is the first frame of this video. Keep ${identityLock} exactly as they are in it, in every frame: the same face, the same hair, the same clothes in the same colours, patterns and details, the same footwear, accessories and props, and the same height, build and body proportions${twoHander ? ", including the size and height difference between the two characters" : ""}. Only the performance and the camera are new — nothing about how anyone LOOKS may change.
No outfit changes colour, shape or style, nothing is added or taken away, and the logo stays the same logo, in the same place, unchanged.

${twoHander
    ? `THE PAIR NEVER CHANGES SIZE — THE CAMERA KEEPS ITS DISTANCE:
The camera stays at the same distance and height from ${cast} for all 8 seconds, so both keep exactly the height, build and proportions the frame shows, measured against the counter, shelf or door frame beside them, and the height and build difference between the two characters is exactly what the frame shows. Nobody grows taller or shorter, thinner or heavier, and nobody is re-proportioned to fit the shot.`
    : `THE PEOPLE NEVER CHANGE — ONLY THE CAMERA MOVES:
The camera may ease slightly closer, but ${cast} keeps exactly the height, build and proportions the frame shows, measured against the counter, shelf or door frame beside them. Nobody grows taller or shorter, thinner or heavier, and nobody is re-proportioned to fit the shot.`}`;
}

/**
 * What the video may NEVER change about the PLACE — the rule the walking prompts broke.
 *
 * Every object in the still is real to the viewer the moment the clip starts. When the camera or the
 * cast moved past what the still showed, the model re-imagined the room: tables and products vanished,
 * doors appeared, the shop stretched into one the client does not own, people walked into furniture,
 * over tables and cupboards, and out onto the road. So the video is bounded by the frame: nothing
 * beyond its edges is ever shown, and nobody leaves the spot the frame puts them in.
 */
/** "her", "him" or "them" for a cast as the rules address it — "She", "He", "Both characters". */
const objectOf = (cast: string, plural: boolean) => (plural ? "them" : cast === "She" ? "her" : cast === "He" ? "him" : "them");

export function worldRules(cast = "The cast", twoHander = false): string {
  const are = twoHander ? "are" : "is";
  const stand = twoHander ? "stand" : "stands";
  const them = objectOf(cast, twoHander);
  return `FRAME BOUNDARY — THIS VIDEO SHOWS ONLY WHAT THE ATTACHED FRAME SHOWS:
Everything in this clip happens inside the attached picture. The camera never reveals anything beyond the frame's four edges — no new walls, rooms, doorways, shelves, ceiling, floor area, street or sky appear, and the place never extends, widens, stretches, grows or rebuilds itself. It is the same real place, the same size, seen the same way for all 8 seconds.

WORLD LOCK — THE PLACE AND EVERYTHING IN IT STAY EXACTLY AS THE FRAME SHOWS:
Every object in the attached frame stays exactly where it is, whole and unchanged, for all 8 seconds — tables, chairs, counters, shelves, cupboards, products, stock, displays, doors, walls, windows, plants, signs and the logo. Nothing disappears, appears, melts, morphs, slides, floats or moves by itself, and the room does not rearrange. Hands never pass through objects, bodies never pass through or into furniture, and nobody climbs onto, stands on or walks over a table, a counter, a shelf or a cupboard.

PLACE LOCK — IN THE SPOT THE FRAME SHOWS, FEET ON THE FLOOR:
${cast} ${are} already in place, exactly where the frame has ${them}, and ${stand} there for the whole clip with both feet on the real floor. Nobody walks, steps forward or comes toward the camera, nobody walks out of the shop, onto the road or the street, into another shop, or through a door, and no door opens onto somewhere else. If the frame shows them near the entrance, they stay inside and face into the premises.`;
}

/**
 * The performance the video must have — alive — written into EVERY Veo prompt, in code.
 *
 * The team's standing instruction: nobody stands like a statue; the cast presents the business with
 * appropriate hand gestures and body language — standing and telling, showing a product, presenting
 * the space — all of it from where the frame has them. A pair never leans toward the lens: to a video
 * model a body coming nearer the camera is a body growing, and that is how Motu and Patlu grew.
 */
export function performanceRules(
  cast = "The cast",
  plural = false,
  twoHander = false,
  manner: string = PRESENCE.person,
  gestures: string = HAND_GESTURES.person,
  positions?: { left: string; right: string },
): string {
  const is = plural ? "are" : "is";
  const s = plural ? "" : "s";
  return `PERFORMANCE — ALIVE AND NATURAL, IN PLACE:
${cast} ${is} alive for the whole 8 seconds, ${manner}, like a real presenter in a premium commercial: natural breathing and blinks, the shoulders and head turning, ${twoHander ? "a nod or a turn toward each other on the important words" : "a slight lean on the important words"}, an expressive face that reacts to the words. ${cast} present${s} from where the frame has ${objectOf(cast, plural)} — the life is in the hands, the arms, the shoulders, the head and the face, with the feet staying where they are. Never frozen like a statue or a cardboard cut-out, and never a moment when only the mouth moves.${twoHander ? `
Both characters stay side by side${positions ? ` — ${positions.left} on the LEFT of the frame and ${positions.right} on the RIGHT, never swapping sides` : ""}, at the same distance from the camera as in the frame. The character who is listening keeps reacting — nodding, smiling, looking at the speaker or at what is being shown — with the mouth closed, never frozen while the other one talks.` : ""}

HAND GESTURES AND BODY LANGUAGE — MANDATORY IN THIS CLIP:
Appropriate, clearly visible hand gestures on the key words of the line — ${gestures}. Each gesture is smooth and natural, reaches only what is within arm's reach in the frame, and flows into the next movement. Body language is open, warm and confident, and matches the meaning of every word, so the body tells the same story as the voice. No waving goodbye and no bye-bye hand at any point — an ending is an invitation to come in.`;
}

/**
 * The picture keeps the attached frame's exact colour and exposure — written into EVERY Veo prompt.
 *
 * Finished videos came back lighter and paler than the frame they were animated from: the reds went
 * pink, the blacks went grey, the whole clip looked washed. The prompt said only "lighting and colour
 * that stay consistent with the frame", deep in its quality line, while the scene-life line invited
 * "soft light shifts" and the director was shown "light shifting through a window" as an example. A
 * video model drifts toward a bright, flat, low-contrast look unless it is held to the frame, so it is
 * held here, near the top, in the words that describe exactly that drift.
 */
export const COLOUR_LOCK = `COLOUR AND LIGHT LOCK — THE VIDEO LOOKS EXACTLY LIKE THE ATTACHED FRAME:
Keep the frame's exact colour grade and exposure from the first frame to the last: the same saturation, the same contrast, the same white balance and colour temperature, the same skin tones, the same deep blacks and the same highlights, the same brightness. The picture never fades, washes out, turns pale, pastel, milky, hazy, grey or overexposed, and never brightens, softens or loses contrast as the clip goes on. No added glow, bloom, haze, light leaks, flares or sun rays, and the light in the room does not change. Rich, vivid, true-to-frame colour for all 8 seconds.`;

/** The quality bar every clip is held to — stated, because an unstated standard is not one. */
export const QUALITY_RULES = `QUALITY — PREMIUM COMMERCIAL FINISH:
Photoreal, premium television-commercial quality: sharp focus on faces and hands, clean detail, stable anatomy (five fingers on every hand, natural joints), natural skin, hair and fabric movement, the frame's exact colour grade and exposure held for the whole clip, and smooth, steady motion with no flicker, warping, jitter or melting.`;

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

/**
 * Walking or stepping — never allowed (2026-10-01). Every walk the director wrote, however short, was
 * a body travelling into space the still does not contain: toward the lens, out of the door, over the
 * furniture. A turn of the body, a reach or a lean is not matched.
 */
const WALKS = /\b(?:walk(?:s|ing|ed)?(?! in place)|stroll(?:s|ing)?|strides?|striding|marches|marching|wanders?|wandering|leads? the (?:way|viewer)|leading the way|(?:one|two|three|four|several|a few|a small|a half|a single) steps?|half[- ]steps?|takes? a (?:small |half |single )?step|steps? (?:forward|closer|toward|towards|through|across|out|into|up|onto|on to|back)|goes (?:to|into|out)|heads? (?:to|toward|towards|out)|crosses|crossing|enters|entering|approach(?:es|ing)?|comes? (?:forward|closer|toward|towards))\b/i;

/** Climbing on or walking over furniture — the most unrealistic thing the videos did. */
const CLIMBS = /\b(?:climbs?|climbing|clambers?|on top of|onto the (?:table|counter|shelf|shelves|cupboard|desk|rack|showcase)|(?:stands?|standing|jumps?|jumping|sits?|sitting) on (?:the |a )?(?:table|counter|shelf|cupboard|desk|rack|showcase)|over the (?:table|counter|shelf|cupboard|desk))\b/i;

/** A direction that freezes the body — the failure the first videos had. */
const FROZEN = /\b(?:stands? (?:perfectly |completely )?still|standing still|holds? (?:absolutely )?still|motionless|stationary|frozen|freezes|statue|mannequin|locked[- ]off|tripod|on sticks|does not move|doesn't move|without moving|no movement|barely perceptible)\b/i;

/**
 * A camera sentence that would break the shot or the lip-sync: a cut, a whip or crash zoom, following
 * someone out, or a speed effect that cannot carry a spoken line.
 */
const CAMERA_BREAKS = /\b(?:crash[- ]zoom|snap[- ]zoom|whip|cut(?:s)? to|jump cut|follows? (?:them|him|her) (?:out|through|into)|slow[- ]?motion|slow-mo|hyper-?lapse|time-?lapse|360)\b/i;

/**
 * A camera sentence that shows MORE than the still: any move that travels, widens or swings round.
 * These are the moves that made the video model build the rest of the shop (see the history at the top
 * of this file); a camera sentence carrying one falls back to the plan's own.
 */
const REVEALS = /\b(?:pull(?:s|ed|ing)? (?:back|out|away)|dolly(?:ing)? (?:out|back)|dollies (?:out|back)|crane[sd]?|craning|pedestal|orbit(?:s|ing)?|arc(?:s|ing)?|pans?|panning|tilt(?:s|ing)?|truck(?:s|ing)?|tracking|tracks|follows?|following|sweeps?|sweeping|reveal(?:s|ing)?|widen(?:s|ing)?|zoom(?:s|ing)? out|grand|drone|fly(?:ing|-through)?|glides? (?:past|along|through|around))\b/i;

/**
 * An action that changes how big one of a PAIR is: moving toward the lens, rising, stretching. The
 * director writes these as life ("Motu steps forward proudly", "Patlu rises onto his toes") and the
 * video model draws them as a character growing. A beat like this falls back to the plan's.
 */
const SCALE_CHANGING = /\b(?:toward(?:s)? the (?:camera|lens|viewer)|closer to the (?:camera|lens)|steps? (?:forward|closer|up)|leans? (?:in|forward|into|toward(?:s)?)|leaning (?:in|forward)|rocks? forward|stands? (?:up|taller)|straightens? up|rises?|rising|on (?:his|her|their) toes|tip-?toes?|jumps?|jumping|hops?|bounc(?:es|ing) up|stretch(?:es|ing)?|grows?|growing|puffs? (?:up|out)|swells?|bigger|larger)\b/i;

/** Scene life that changes the light — the drift that left videos pale. Falls back to still air. */
const LIGHT_CHANGE = /\b(?:light (?:shifts?|shifting|changes?|flickers?|flickering|brightens?|dims?|streams?|streaming|pours?|floods?|plays?)|sun ?(?:light|beams?|rays?|shine)|shafts? of light|glow(?:s|ing)?|flares?|bloom|haze|hazy|brighten(?:s|ing)?|golden hour|dappled|god ?rays|sparkl(?:e|es|ing) of light)\b/i;

/** Headings code stamps onto a finished frame prompt — not part of what the still SHOWS. */
const FRAME_STAMP = /^(?:COMPOSITION FOR MOTION|BACKGROUND FOR THIS CLIP|SCALE ANCHOR|BACKGROUND PLATE|CAST SHEET|OWNER IMAGE|📎|⚠️|🎬)/;

/**
 * What the attached still shows, in two or three sentences, read from the prompt it was made from.
 *
 * The fallback for the director's own FRAME line. The video model is told what it is animating —
 * the place, who is where, the objects around them — so it has nothing to invent. Code stamps (the
 * composition note, the attach line) are left out; the planned background, when there is one, is kept,
 * because it is the shortest true description of the place.
 */
export function frameSummaryOf(framePrompt?: string, max = 420): string {
  if (!framePrompt?.trim()) return "";
  const lines = framePrompt.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const background = (lines.find((l) => l.startsWith("BACKGROUND FOR THIS CLIP:")) || "")
    .replace(/^BACKGROUND FOR THIS CLIP:\s*/, "")
    .replace(/\s*This background is different[\s\S]*$/, "")
    .trim();
  const body = lines
    .filter((l) => !FRAME_STAMP.test(l))
    .join(" ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let summary = "";
  for (const sentence of body.split(/(?<=[.!?])\s+/)) {
    const next = summary ? `${summary} ${sentence}` : sentence;
    if (next.length > max) break;
    summary = next;
  }
  if (!summary) summary = body.slice(0, max).replace(/\s+\S*$/, "");
  return [summary, background ? `Background: ${unterminated(background)}.` : ""].filter(Boolean).join(" ").trim();
}

/**
 * A usable direction for one clip: the model's where it is usable, the plan's where it is not.
 * Field by field, so one bad beat does not throw away a good camera sentence.
 *
 * "Usable" means ALIVE, SAFE and INSIDE THE FRAME: nothing walks, steps, climbs or leaves the business;
 * nobody freezes; a pair never comes nearer the lens or grows; and the camera never travels, widens or
 * swings round to show what the still does not contain, never cuts, crash-zooms or slows the speech.
 */
export function resolveDirection(plan: ClipMotionPlan, direction?: Partial<VeoDirection> | null, cast = "The cast", plural = false, framePrompt = ""): VeoDirection {
  const pair = !!plan.twoHander;
  const unsafe = (text: string) => LEAVES.test(text) || FROZEN.test(text) || WALKS.test(text) || CLIMBS.test(text)
    || (pair && SCALE_CHANGING.test(text));

  const modelFrame = unterminated(withoutQuotedSpeech(clean(direction?.frame, 420)));
  const frame = modelFrame && !LEAVES.test(modelFrame) && !WALKS.test(modelFrame) && !CLIMBS.test(modelFrame)
    ? modelFrame
    : unterminated(frameSummaryOf(framePrompt));

  const planPath = stagingPath(plan, cast, plural);
  const modelPath = unterminated(withoutQuotedSpeech(clean(direction?.path, 400)));
  const path = modelPath && !unsafe(modelPath) ? modelPath : planPath;

  const modelCamera = unterminated(clean(direction?.camera));
  // A pair's camera is the plan's, word for word: the director's own sentence is where the dolly-ins
  // and "moves closer to Motu" came from (see DUO_SAFE_MOVES). Anyone's camera that would travel or
  // widen beyond the still falls back to the plan's too.
  const camera = !pair && modelCamera && !FROZEN.test(modelCamera) && !CAMERA_BREAKS.test(modelCamera)
    && !LEAVES.test(modelCamera) && !REVEALS.test(modelCamera)
    ? modelCamera
    : unterminated(fillCast(plan.camera.action, cast, plural));

  const modelBeats = Array.isArray(direction?.beats)
    ? direction!.beats.map((b) => unterminated(withoutQuotedSpeech(unlabelled(clean(b, 300))))).filter(Boolean)
    : [];
  const beatsUsable = modelBeats.length === 3 && !modelBeats.some(unsafe);
  const beats = beatsUsable ? modelBeats : [...plan.fallbackBeats];

  const modelLife = unterminated(clean(direction?.sceneLife, 300));
  const sceneLife = modelLife && !WALKS.test(modelLife) && !LEAVES.test(modelLife) && !LIGHT_CHANGE.test(modelLife)
    ? modelLife
    : "subtle, natural life in the real premises — gentle background movement true to this place, with the light exactly as the frame has it";
  return { frame, path, camera, beats, sceneLife };
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
    // "the woman in the teal saree's own voice" does not read; a described person has "their own voice".
    const own = /^the /i.test(s.speaker!) ? "their" : `${s.speaker}'s`;
    return `• ${s.at ? `${s.at}: ` : ""}ONLY ${s.speaker}${s.position ? ` (${s.position})` : ""} speaks this line, in ${own} own voice. ${capitalised(others)} keep${speech.length > 2 ? "" : "s"} the mouth closed and listen${speech.length > 2 ? "" : "s"}.`;
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
    return `• ${s.at ? `${s.at}: ` : ""}the focus rests on ${s.speaker}${s.position ? ` (${s.position})` : ""} while ${s.speaker} speaks; ${others} stay${speech.length > 2 ? "" : "s"} in frame, a touch softer, reacting.`;
  }).join("\n");
  return `SPEAKER FOCUS — ONLY THE FOCUS MOVES:
${rows}
A smooth rack focus between them. The camera itself does not move toward either of them, both stay exactly where and exactly the size they are, and nobody is enlarged to show who is talking. No cuts.

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
/**
 * How the words are SPOKEN — the accent, stated.
 *
 * ── The fault this is ──────────────────────────────────────────────────────────────────────────
 * English ads came out of the video model in a British or American voice. The prompt said only
 * "speaking English", and the voices it described ("a very sweet, warm, confident female voice") had
 * no nationality — so the model used its default English voice, which is not an Indian one. These ads
 * are made for Indian customers, mostly in Andhra Pradesh, by an Indian business, with an Indian
 * presenter on screen; a foreign accent coming out of her mouth is the first thing a viewer notices.
 *
 * So an English ad names its accent in three places a video model reads: the opening line, a VOICE AND
 * ACCENT block right above the spoken lines, and the negative prompt. Other languages are spoken
 * natively already and get nothing extra.
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

export function scaleLock(speech: VeoSpeech[], anchor = ""): string {
  const [a, b] = speech.map((s) => s.speaker).filter(Boolean) as string[];
  const pair = a && b ? `${a} and ${b}` : "the two characters";
  return `SCALE LOCK — THE MOST IMPORTANT RULE IN THIS PROMPT:
${pair} keep EXACTLY the heights, builds and body proportions of the attached frame, in every single frame of the video. The height difference between them is fixed: whoever is taller in the frame stays taller by exactly the same amount, measured against the counter, shelf or door frame beside them.${anchor ? `
SCALE ANCHOR — EXACTLY AS IN THE ATTACHED FRAME, FOR ALL 8 SECONDS: ${unterminated(anchor)}. That relation to the room never changes, whatever they do.` : ""}
Neither one grows, shrinks, stretches, gets rounder or gets thinner at any moment. Nobody is re-proportioned to fill the shot, to match the other character, or to fit a camera move.
The camera keeps ONE fixed distance and height for the whole clip, so both stay exactly the size they are in the frame: each character's head stays at the same height against the wall, shelf or door behind them, and their feet stay on the same line of floor. Neither steps or leans toward the lens, rises, stretches or stands up taller at any moment.`;
}

export function assembleVeoPrompt(input: VeoPromptInput): string {
  const { aspectRatio, plan, identityLock, language, speech, performanceNotes, cast, castPlural, twoHander } = input;
  const who = cast || "The cast";
  const plural = !!castPlural;
  const d = resolveDirection(plan, input.direction, who, plural, input.framePrompt || "");
  const orientation = aspectRatio === "16:9" ? "horizontal" : "vertical";
  const manner = input.manner || PRESENCE[plan.performer];
  const gestures = input.handGestures || HAND_GESTURES[plan.performer];
  const positions = twoHander && speech.length >= 2 && speech[0].speaker && speech[1].speaker
    ? { left: speech[0].speaker!, right: speech[1].speaker! }
    : undefined;

  // An English ad is spoken with an Indian accent — see speechAccentFor.
  const accent = speechAccentFor(language);
  const speechLines = speech.map((s) => {
    const speaker = s.speaker ? `${s.speaker}${s.position ? ` (${s.position})` : ""}, ` : "";
    const at = s.at ? `${s.at} — ` : "";
    return `${at}${speaker}${s.voice}, speaking ${accent ? accent.spoken : language}, perfectly lip-synced:\n"${s.line}"`;
  }).join("\n\n");

  const cameraNote = twoHander
    ? `${plan.camera.key === "rack_focus" ? "The camera itself does not move; only the focus travels." : plan.camera.key === "static_locked" ? "A steady, composed frame — the life comes from the two of them." : "A barely-there float at the same distance — never travelling."} The camera keeps the SAME distance and the SAME height from both characters for all 8 seconds — it never moves toward or away from them, never rises or lowers, never zooms — so both stay exactly the size they are in the frame.`
    : plan.camera.key === "rack_focus"
      ? "The camera holds its position; only the focus travels."
      : `A gentle, ${plan.speed} move that stays inside the frame — it only tightens on, or breathes around, what the frame already shows.`;

  return `${aspectRatio} ${orientation} video, one continuous 8-second shot, animated from the attached frame — the frame comes to life, filmed like a premium commercial${accent ? `, spoken in ${accent.spoken}` : ""}.
${twoHander ? `
${scaleLock(speech, input.scaleAnchor)}
` : ""}${d.frame ? `
THE ATTACHED FRAME — WHAT THIS VIDEO ANIMATES, AND ALL IT MAY SHOW:
${capitalised(d.frame)}.
` : ""}
${COLOUR_LOCK}

${identityRules(identityLock, who, !!twoHander)}

${worldRules(who, !!twoHander)}

ACTION — ${plan.staging.name.toUpperCase()}, IN PLACE:
${capitalised(d.path)}.
• ${BEAT_TIMES[0]}: ${d.beats[0]}
• ${BEAT_TIMES[1]}: ${d.beats[1]}
• ${BEAT_TIMES[2]}: ${d.beats[2]}
Through all three beats nothing about them changes — the same faces, the same clothes in the same colours, the same heights and builds, the same spot on the floor.
Eye contact with the lens on the key phrases, with brief natural glances toward what is being shown. Natural blinks and breathing, hands anatomically natural.${performanceNotes ? `\n${performanceNotes}` : ""}

CAMERA — ${cameraLabel(plan)}: ${d.camera}. ${cameraNote} One continuous shot, no cuts.

${twoHander && plan.focus === "speaker" ? speakerFocusBlock(speech) : ""}${performanceRules(who, plural, twoHander, manner, gestures, positions)}

${accent ? `${accent.block}

` : ""}${speakerBlock(speech)}SPEECH:
${speechLines}

SCENE LIFE: ${d.sceneLife}.

${QUALITY_RULES}

Negative prompt:
No text on screen, no subtitles, no watermark
No background music, pure studio voice-over, crystal clear voice, no echo
No walking, no steps, no stepping forward or toward the camera, no coming closer to the lens, no walking around the shop, no walking toward or through the door, no walking out of the business
No climbing onto, standing on or walking over tables, counters, shelves, cupboards or any furniture
No street, road, footpath, car park or outside shot, no entering another shop, no change of location, no door opening onto somewhere else
No camera move that shows anything beyond the attached frame — no pull-back, dolly-out, zoom-out, crane, pedestal, orbit, arc, pan, tilt, truck or tracking shot; no new walls, rooms, doors, shelves, ceiling or floor appearing at the edges; no extended, enlarged, stretched or rebuilt shop
No object disappearing, appearing, moving by itself or changing shape — tables, chairs, counters, shelves, products and signs stay exactly as in the frame
No walking into or through furniture, no collisions, no hands passing through objects, no body clipping into the counter
No waving goodbye, no bye-bye or farewell wave, no waving at the camera — the closing gesture is an invitation in
No frozen pose, no statue or mannequin stiffness, no talking head where only the mouth moves, no hands hanging lifeless
${twoHander
    ? "No zoom, no dolly, no push-in or pull-back, no crane or pedestal, no orbit or arc, no low or high angle — the camera never changes its distance or its height to the characters"
    : "No fast or shaky camera, no handheld shake — every move is slow, smooth and small"}
No cuts or scene change, no crash zoom or whip pan, no slow motion, hyperlapse or time-lapse while anyone speaks
No change of height, build or body proportions — nobody grows or shrinks relative to the room, no change to the height difference between characters
No character moving nearer the lens than the other, no one character growing while the other stays, no re-proportioning to match or fill the shot${twoHander ? "\nNo character growing taller, stretching, leaning toward the camera, rising onto the toes, standing up taller, jumping or stepping toward the camera" : ""}
No washed-out, faded, pale, pastel or desaturated colour; no overexposure, no lifted or milky blacks, no haze, bloom, glow, flares or light leaks; no colour shift and no brightness change from the attached frame
No costume change — no different clothes, colours, patterns, footwear or accessories, nothing added or taken away
No redrawn, restyled or different-looking cast, no face morphing, no swapped or extra characters, no extra people
No warped anatomy, no extra or missing fingers, no flicker, no jitter, no melting textures
No change to the face, hair, outfit, logo or location from the attached frame
No extra people speaking, no new voices${twoHander ? ", no line spoken by the wrong character, no two characters speaking at once" : ""}${accent ? `
${accent.negative}` : ""}`;
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

HOW THE TEAM WORKS — READ THIS FIRST:
1. A still frame is generated for each clip from its FRAME prompt (given to you below).
2. That still is attached to the Veo prompt you are directing, and the video animates it.
So you know exactly what each still looks like: read its FRAME prompt. Your direction brings THAT picture to life and nothing else. The video model cannot see beyond the still; whatever a direction sends someone toward or points the camera at that the still does not show, the model INVENTS — that is how presenters walked onto the road, characters walked over tables and cupboards, and the shop stretched into an extended, rebuilt place the client does not own.

YOUR TASK: for each of the ${options.clipCount} clips, write the direction that brings its still frame to life — ${options.subject} standing in place and telling, showing a product within reach, presenting the space behind them, or inviting the viewer in, exactly as that clip's PLANNED STAGING says, with natural gestures and body language, filmed with the planned camera — without showing or changing anything the frame does not already contain.

THE STANDARD: a real, premium, dynamic commercial reel. The variety across the ad comes from a DIFFERENT FRAME per clip (another part of the premises), and inside each clip from the performance — gestures, turns, expressions, showing the product — and a subtle camera. Never from walking or from moving the camera somewhere new.

FOR EACH CLIP YOU RECEIVE:
• FRAME — the prompt the still was generated from: where ${options.subject} ${options.twoHander || /\band\b/.test(options.subject) ? "are" : "is"}, the real zone, the objects in view, the framing.
• LINE — exactly what is spoken in this clip.
• PLANNED STAGING — stand and tell / show the product / present the space / invite the viewer in. Always in place. Use it; make it specific to this frame.
• PLANNED CAMERA — the angle, lens, move and speed. Use it; make it specific to this frame.
• GESTURE INTENT — what the hands and body must achieve, and on which words.

THE CAMERA VOCABULARY — ONLY MOVES THAT STAY INSIDE THE FRAME:
• Slow Push In — the camera eases a few percent closer, so the picture only tightens on what the frame shows.
• Rack Focus — the camera holds; only the focus travels between what is shown and the face (or between two speakers).
• Gentle Float — a breathing handheld float at the same distance; never travelling, never shaky.
• Static Locked — a clean, locked frame.
Never a pull-back, dolly-out, zoom-out, crane, pedestal, orbit, arc, pan, tilt, truck or tracking shot — each one shows space beyond the still, which the model then invents.
• Lens + motion — ${LENS_COMBOS.join(" · ")}.
• Speed — ${SPEED_KEYWORDS.join(" · ")}.

WRITE, PER CLIP:
1. frame — ONE sentence describing what the still shows, read ONLY from its FRAME prompt: who stands where, the real zone of the premises, the main real objects around them, and the framing. Nothing the FRAME prompt does not say.
2. path — ONE sentence: the planned staging made specific to THIS frame — what they show, touch or present, naming only real objects the FRAME already has within arm's reach. They stay in their spot for the whole clip, feet where they are: no walking, no steps, no coming toward the camera.
3. camera — ONE sentence: the planned move in the vocabulary above, made specific to THIS frame. ${options.twoHander
    ? "For this PAIR the camera NEVER changes its distance or height to them: only a locked frame, a rack focus between them, or a barely-there float at the same distance — always at eye level. Never a dolly, push, pull, zoom, crane, pedestal, orbit, arc, pan, tilt or truck, and never toward one of them."
    : "It may ease slightly closer (a slow push-in) or float gently; it never travels, widens or swings round, so nothing outside the still is ever shown. The people never change size relative to the room."}
4. beats — exactly THREE short actions timed 0–2s, 2–5s and 5–8s. EVERY beat is alive — a hand action (showing, presenting, pointing to, lightly touching a REAL object within reach, an open palm on a promise, an inviting gesture), a turn of the shoulders or head, an expression. Place each gesture on the words it belongs to: work out roughly which part of the LINE falls in each window, and name that moment in plain English ("on the business name", "on the free delivery", "as the line ends") — NEVER quote the spoken words in path or beats. Include expression and eye-line.
5. sceneLife — one short phrase of subtle, real VISUAL movement in that location that moves nothing in the frame and changes no light: steam from a cup, a ceiling fan turning, a plant's leaves stirring. Never a person walking through, never an object moving, never a change of light, never a sound, never text.

RULES:
• IN PLACE, ALWAYS. Nobody walks, steps, comes toward the camera, goes to something out of view, through a door or out of the business — and nobody climbs onto, stands on or walks over a table, counter, shelf or cupboard. Never frozen either: there is always a gesture, a turn or an expression.
• THE FRAME IS THE WHOLE WORLD. Never show or mention anything outside it: no new walls, rooms, doors, shelves, ceiling, floor area or street, and the place never extends, widens or rebuilds itself.
• THE WORLD IS LOCKED. Every table, chair, counter, shelf, cupboard, product, door, wall and sign in the FRAME stays exactly where it is and whole. Never direct a hand or a body through or into an object. Never direct anything to appear, disappear or move by itself.
• INSIDE THE BUSINESS ONLY. Never the street, the road, the footpath, another shop, or a door opening onto somewhere else.
• YOU DIRECT PERFORMANCE AND CAMERA ONLY. Never change how anyone looks: no wardrobe change, no different clothes or colours, no change of height, build or proportions.
• THE LIGHT AND COLOUR ARE LOCKED. Never direct a change of light, brightness or colour — no light shifts, sun rays, glows, flares, haze or brightening. The frame's light stays exactly as it is.${options.twoHander ? `
• A PAIR NEVER CHANGES SIZE. Neither character steps or leans toward the camera, rises, stands up taller, goes onto the toes, jumps or stretches — each stays in their spot at their own height, the same distance from the lens as in the frame.` : ""}
• One continuous shot. Never a cut, a whip pan, a crash zoom or a scene change. Never slow motion, hyperlapse or time-lapse while anyone speaks — it breaks the lip-sync.
• Never describe the face, hair, skin, outfit or jewellery in path, camera or beats — they are locked by the attached frame.
• Never invent objects, signage or people that are not in the FRAME.
• The logo must stay visible and unchanged; never move the camera so the logo leaves the frame.
• Movement is premium and controlled — confident and natural, never shaky, never exaggerated or theatrical.
• The last clip invites the viewer IN — open palms, a come-in gesture, a nod. NEVER a goodbye wave or a bye-bye hand in any clip.
• Hands stay anatomically natural; each gesture is one clear movement that flows into the next — hands never hang lifeless.
• Frame for ${options.aspectRatio}.${options.performer === "deity" ? `
• A deity moves slowly and majestically, and every gesture is a blessing — never touching, holding, pointing at or presenting products, money or a phone.` : ""}${options.characterDirection ? `

${options.characterDirection}

Use that direction for HOW the characters perform — their manner, gestures, expressions and look. It never decides where they go and never freezes them: the planned staging, the frame boundary, the world lock and the planned camera always win. The speaking character performs the line; the other listens with the mouth closed and reacts in their own way. When the plan says SPEAKER FOCUS, only the focus moves to whoever is speaking — the camera itself never moves toward either of them.` : ""}

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
