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
 * 5. So on 2026-10-01 nobody walked and the camera only crept "a few percent", held there by five
 *    layers of rules — and by a prompt of 1,568 words (2,297 for Motu and Patlu) whose spoken line began
 *    after word 1,000 and which named the street, the road and the door 15–18 times inside "No …" lines.
 *    Flow has one prompt box, so those lines were read as more prompt. The videos were static again
 *    and still drifted to new places (the owner's report, 2026-10-05).
 * 6. The morning of 2026-10-05 brought back one bounded walk — "two or three relaxed steps, then stops",
 *    on one middle clip — in a short prompt. Veo followed it exactly, and the owner's Flow clips were
 *    STILL static the same day: clip 1 and the last clip never walked, Motu and Patlu and every drawn
 *    pair never walked, three of the five camera moves did not move the camera (a focus pull, a locked
 *    frame, a float), the keep sentence asked for the place "exactly as in the attached frame for the
 *    whole clip" and for a pair "side by side in the same positions", and the frames were posed
 *    portraits — hands clasped, facing the camera — which Veo simply continued.
 * 7. The dynamic pass below walked Motu and Patlu in nearly every clip — and in EVERY clip shot in the
 *    client's photos, where a pair had no action performed in place — and their heights and clothes drifted
 *    (the owner, 2026-10-10): a video model cannot keep a drawn body through a walk; it redraws both
 *    characters on every frame from its own idea of them. So a cast whose entry carries
 *    `walksOnlyWhenNeeded` (Motu and Patlu) walks only in a clip whose own words take them somewhere, and
 *    performs every other clip where it stands (planClipMotion, Staging.pairInPlace).
 *
 * ── What a clip does now (2026-10-05, the dynamic pass): A REAL COMMERCIAL SHOT INSIDE THE FRAME ──
 * Every clip is a physical action that travels or turns and ONE camera move that follows it — never a
 * talking portrait. The attached frame is the video's first frame and its only picture of the place, so
 * the prompt directs MOTION, never describes the picture again, and keeps every move inside it:
 *   • the cast walks on the floor the frame shows — toward the camera, along the counter or display beside
 *     them, or to the product beside them — never to a door, outside, behind or over furniture, or away
 *     from the camera. Most clips of a cast that may walk do walk, and the frames are composed caught
 *     mid-step (compositionFor), because Veo continues the pose a frame starts from;
 *   • the camera pushes in, travels sideways with a walk (side tracking), glides sideways past the cast (a
 *     lateral dolly) or curves a short way round one presenter (an arc). It NEVER moves backward — no
 *     walk-back tracking shot, no pull-out (the owner, 2026-10-05: "no walk-back, never do it") — and never
 *     shows what is behind or above the frame (no crane, orbit, pan, tilt or reveal);
 *   • who may do what depends on the cast (castKindOf): one presenter walks and takes every move; a human
 *     pair, two children and a drawn pair (Motu and Patlu) walk only TOGETHER, side by side, along or
 *     across the floor — never toward the camera — and are filmed only from the side at one distance, so
 *     neither one's size changes; a deity never walks and is filmed with a slow push-in, arc or glide; a
 *     clip shot in the client's own photograph never shows more than the photo — a push-in, or a still
 *     camera while the cast walks;
 *   • in a pair the one speaking leads the action, and the framing drifts a little toward them.
 * The finished prompt is five short parts (assembleVeoPrompt): the opening line; the camera and the
 * action, with the life around them; the voice and the exact words; one sentence keeping the people, the
 * place and the colours as the frame has them while they move through it; and a one-line negative. The
 * plan is deterministic for the same inputs, so a regenerated clip keeps its shot. One continuous shot per
 * clip, always: a cut inside an 8-second clip made from one still is where identity breaks.
 */

export type ClipRole = "message" | "proof" | "trust" | "cta" | "wish" | "message_cta";

/** Who performs, because a deity moves and gestures differently from a person or a cartoon. */
export type Performer = "person" | "cartoon" | "deity";

// ── The camera vocabulary ─────────────────────────────────────────────────────────────────────────

/**
 * The angle the STILL is taken from. A video animated from one still cannot change its angle without
 * moving the camera round the room, so the angle is a property of the frame, chosen once and kept.
 * Only natural, photographable angles: a bird's-eye, a worm's-eye, a dutch tilt or a POV are what make
 * a shop ad look staged and unreal.
 */
export type ShotAngleKey = "eye_level" | "low_angle" | "high_angle";

export interface ShotAngle { key: ShotAngleKey; name: string; use: string }

export const SHOT_ANGLES: Record<ShotAngleKey, ShotAngle> = {
  eye_level: { key: "eye_level", name: "Eye level", use: "natural, realistic" },
  low_angle: { key: "low_angle", name: "Slightly low angle", use: "confident, premium — a few degrees below the eyes" },
  high_angle: { key: "high_angle", name: "Slightly high angle", use: "elegant overview — a few degrees above the eyes" },
};

/**
 * What the camera may do inside one clip — ONE move, and only moves that show nothing the frame does not.
 *
 * A push-in only tightens on what the still shows. A side-tracking shot travels sideways WITH a walk at
 * the same distance, so the cast keeps one size while the background slides past — the parallax that
 * makes a shot look filmed rather than animated. A lateral dolly glides sideways past a cast that turns or
 * presents, at the same distance. An arc curves a short way round one presenter. A still camera is used
 * only in the client's own photograph, and only while the cast walks — their walk carries the shot.
 *
 * Never a move BACKWARD — no walk-back tracking shot, no pull-out, no dolly out: the owner banned it
 * (2026-10-05), and it shows what is behind the camera, which the frame does not have. Never a crane, a
 * pedestal, an orbit, a pan or a tilt either: every move that showed more than the still made the video
 * model invent the rest of the room (history 2 and 4). A focus pull, a locked frame or a float is no
 * longer a clip's move — three of the five moves of the morning of 2026-10-05 were exactly those, and the
 * videos were static (history 6).
 */
export type CameraMoveKey = "push_in" | "side_track" | "lateral_dolly" | "arc" | "static_locked";

export interface CameraMove {
  key: CameraMoveKey;
  /** The standard name a member and the video model both know, e.g. "Slow Dolly In". */
  name: string;
  /** What it does for the ad. */
  effect: string;
  /** What the camera does across the 8 seconds — a template ({them}, {they}, {s}) for the planner. */
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
    key: "push_in", name: "Push In", effect: "builds focus and emotion, closer on the face or the product", lens: "50mm", speed: "smooth, steady",
    action: "a smooth, steady push-in that tightens on what the frame already shows — the face, or the product being shown",
    framing: "a full or three-quarter shot with clear room in front of the subject and the face evenly lit, so the camera can move in",
  },
  side_track: {
    key: "side_track", name: "Side Tracking Shot", effect: "travels with the walk, the background sliding past with parallax", lens: "35mm", speed: "smooth, steady",
    action: "the camera travels sideways alongside {them} at the same distance as {they} walk{s}, the background sliding past with natural parallax",
    framing: "a shot from a three-quarter front angle with the counter, display or open floor they walk along fully in view beside them and clear floor ahead",
  },
  lateral_dolly: {
    key: "lateral_dolly", name: "Lateral Dolly", effect: "depth and parallax without changing anyone's size", lens: "35mm", speed: "slow, smooth",
    action: "the camera glides slowly sideways past {them} at the same distance, foreground and background sliding with natural parallax",
    framing: "real objects at two or three depths — something near the camera, the subject, the premises behind — so a sideways glide shows depth",
  },
  arc: {
    key: "arc", name: "Arc Shot", effect: "a premium, cinematic turn around the presenter", lens: "35mm", speed: "slow, smooth",
    action: "the camera curves slowly a short way around {them}, from the front to a three-quarter view",
    framing: "clear space around the subject on both sides, with the place visible behind them",
  },
  static_locked: {
    key: "static_locked", name: "Still Camera", effect: "a steady frame that the cast's own walk carries — only in the client's photograph", lens: "35mm", speed: "steady",
    action: "a steady, still camera while {they} walk{s} — {their} own movement carries the shot",
    framing: "the photograph's own framing, with the floor they walk on in view",
  },
};

// ── The actions ───────────────────────────────────────────────────────────────────────────────────

/**
 * What the cast does in one clip — the real action of a commercial shot.
 *
 * Five of the six travel: the cast walks toward the camera, along the counter or display, to the product,
 * a few steps before the promise, or the last steps to invite the viewer in. "Turn and present" is
 * performed where they stand, always with a camera that moves (an arc, a glide, a push-in). Who may
 * perform which, and with which camera, is decided per cast (planClipMotion); a deity performs each of its
 * actions in place, as a blessing (deityPath).
 */
export type StagingKey = "walk_toward" | "walk_across" | "approach_show" | "walk_stop_present" | "turn_present" | "walk_invite";

export interface Staging {
  key: StagingKey;
  /** Short name a member reads, e.g. "Walk along the display". */
  name: string;
  /** Whether a person or a cartoon walks in it. A deity never walks, whatever the action (ClipMotionPlan.walks). */
  walks: boolean;
  /**
   * What one performer does across the clip — a template: {Cast} is who performs, {s} the verb ending
   * that agrees with them ("She turns", "Ganesha turns"), {them} / {their} / {they} the pronouns.
   */
  path: string;
  /**
   * What a PAIR does across the clip — {A} speaks first (0–4s), {B} answers (4–8s). The one talking leads
   * the action and the other reacts, so the picture follows the conversation. A pair always moves
   * together, side by side, along or across the floor — never toward the camera, where one would grow.
   */
  pairPath: string;
  /** The same action for a deity, who blesses in place what a person would walk to and show. */
  deityPath?: string;
  /** Its name for a deity — the 🎬 note a frame carries must never ask a deity to walk. */
  deityName?: string;
  /** How the still is composed so the action is already under way: where the cast is and how the body is caught. */
  start: string;
  /** The same for a pair: both caught side by side, at one distance from the camera. */
  pairStart: string;
  /**
   * The same beat performed WHERE THEY STAND, by a pair that walks only when a clip needs it (Motu and
   * Patlu — planClipMotion `walksWhenNeeded`): its 🎬 name, what the two do ({A} speaks first, {B} answers)
   * and how the still is composed. What the line is about is put within reach in the frame, so nothing
   * needs a step; the life is in their upper bodies, hands and faces. Absent on an action that is already
   * performed in place (turn_present) and on one a pair never performs (walk_toward).
   */
  pairInPlace?: { name: string; pairPath: string; pairStart: string };
}

export const STAGINGS: Record<StagingKey, Staging> = {
  walk_toward: {
    key: "walk_toward", name: "Walk toward the camera", walks: true,
    path: "{Cast} walk{s} slowly toward the camera across the open floor, talking naturally, glancing at and gesturing "
      + "toward what {they} pass{es}, and settle{s} on the last words with an open palm and a warm smile",
    pairPath: "both walk slowly side by side across the floor, bodies angled toward the camera — {A} talks and gestures "
      + "toward what they pass while {B} reacts; then {B} answers with an open palm while {A} reacts",
    deityPath: "{Cast} turn{s} gracefully toward the viewer and raise{s} the blessing palm, then open{s} both palms over the place",
    start: "the full figure from head to feet, caught mid-step a few steps back from the camera on open, clear floor inside "
      + "the business — one foot forward, the arms in a natural swing, facing the camera — with nothing between them and "
      + "the camera and the floor in front of them fully in view",
    pairStart: "both caught mid-step side by side at the same distance from the camera, seen from a three-quarter front "
      + "angle, walking across the open floor of the business with clear floor ahead of them",
  },
  walk_across: {
    key: "walk_across", name: "Walk along the display", walks: true,
    path: "{Cast} walk{s} slowly along the counter, display or shelves beside {them}, body angled toward the camera, one "
      + "hand gliding toward what {they} pass{es} as {they} talk{s}, and turn{s} to the lens on the key words",
    pairPath: "both walk slowly side by side along the counter, display or open floor beside them, bodies angled toward "
      + "the camera — {A} talks and gestures toward what they pass while {B} reacts; then {B} answers with an open palm "
      + "while {A} reacts",
    deityPath: "{Cast} sweep{s} the blessing palm slowly along the place beside {them}, then turn{s} the palm toward the viewer",
    start: "the full figure caught mid-step from a three-quarter front angle, walking along the real counter, display or "
      + "shelves the clip talks about, which run beside them across the frame, fully in view, with clear floor ahead in "
      + "the direction of the walk",
    pairStart: "both caught mid-step side by side at the same distance from the camera, seen from a three-quarter front "
      + "angle, walking along the real counter, display or open floor of the business with clear floor ahead of them",
    pairInPlace: {
      name: "Present the display",
      pairPath: "both stand side by side beside the counter, display or shelves, bodies angled toward the camera — {A} sweeps "
        + "a whole open hand along what is beside them and talks while {B} reacts; then {B} answers with one calm open palm "
        + "toward it while {A} reacts",
      pairStart: "both standing side by side at the same distance from the camera in front of the real counter, display or "
        + "shelves the clip talks about, which run beside them fully in view, angled slightly toward each other and open to "
        + "the camera, one hand caught mid-gesture",
    },
  },
  approach_show: {
    key: "approach_show", name: "Approach and show", walks: true,
    path: "{Cast} walk{s} a few steps to the product or display beside {them}, show{s} it with an open hand or lift{s} it "
      + "toward the camera, then turn{s} back to the lens with a smile",
    pairPath: "both walk a few steps side by side to the product or counter beside them; {A} points to it and talks while "
      + "{B} looks and reacts, then {B} presents it with an open hand",
    deityPath: "{Cast} turn{s} gracefully toward what the line is about and raise{s} the blessing palm over it without "
      + "touching it, then turn{s} back to the viewer",
    deityName: "Bless what it offers",
    start: "three-quarter body caught mid-step toward the real product, counter or display the clip talks about, which is a "
      + "few steps away beside them and fully in view, the body angled toward it with the face to the camera",
    pairStart: "both caught mid-step side by side at the same distance from the camera, angled toward the real product, "
      + "counter or display a few steps beside them, which is fully in view",
    pairInPlace: {
      name: "Show it where they stand",
      pairPath: "both stand side by side right beside the product or counter; {A} points to it with a whole open hand and "
        + "talks while {B} looks and reacts, then {B} presents it with one calm open palm",
      pairStart: "both standing side by side at the same distance from the camera right beside the real product, counter or "
        + "display the clip talks about — within arm's reach and fully in view — angled toward it with the faces to the "
        + "camera, one hand caught mid-gesture",
    },
  },
  walk_stop_present: {
    key: "walk_stop_present", name: "Walk, stop and explain", walks: true,
    path: "{Cast} take{s} a few unhurried steps forward, stop{s}, and deliver{s} the key line straight to the camera — a "
      + "hand on the chest on the promise, then an open, reassuring palm and a confident nod",
    pairPath: "both take a few unhurried steps side by side across the floor and stop together; {A} speaks with an open, "
      + "sincere gesture while {B} listens, then {B} answers with a hand on the chest on the promise and a confident nod",
    deityPath: "{Cast} raise{s} the blessing palm toward the viewer on the promise, with a serene nod",
    start: "three-quarter body caught mid-step on clear, open floor inside the business, facing the camera at a slight "
      + "angle, with room in front of and around them",
    pairStart: "both caught mid-step side by side at the same distance from the camera, on clear, open floor inside the "
      + "business, with room to walk a few steps across it",
    pairInPlace: {
      name: "Explain where they stand",
      pairPath: "both stand side by side facing the camera at a slight angle; {A} speaks with an open, sincere gesture while "
        + "{B} listens, then {B} answers with a hand on the chest on the promise and a confident nod",
      pairStart: "both standing side by side at the same distance from the camera on the real floor inside the business, "
        + "facing the camera at a slight angle and a little toward each other, one hand caught mid-gesture",
    },
  },
  turn_present: {
    key: "turn_present", name: "Turn and present", walks: false,
    path: "{Cast} turn{s} from the place behind {them} to the camera, sweeping one arm across it as {they} speak{s}, then "
      + "bring{s} the hand to the chest and open{s} the palm toward the viewer",
    pairPath: "{A} turns from the place behind them to the camera, sweeping an arm across it while speaking, as {B} turns "
      + "with them and reacts; then {B} answers with a warm, confident open palm",
    deityPath: "{Cast} sweep{s} the blessing palm slowly over the place, then turn{s} the palm toward the viewer",
    deityName: "Bless the place",
    start: "three-quarter body turned slightly toward the business's real counter, shelves or work area behind them, one "
      + "arm beginning to open toward it, all of it fully visible, the face toward the camera",
    pairStart: "both side by side at the same distance from the camera, turned slightly toward the business's real counter, "
      + "shelves or work area behind them, which is fully visible",
  },
  walk_invite: {
    key: "walk_invite", name: "Walk in and invite", walks: true,
    path: "{Cast} walk{s} the last few steps toward the camera and invite{s} the viewer in, both palms opening toward the "
      + "lens in a warm come-in gesture with a nod — an invitation to come, never a goodbye wave",
    pairPath: "both walk a few steps side by side across the floor and turn to the camera together; {A} invites the viewer "
      + "with an open palm, then {B} invites them in with both palms open — an invitation, never a goodbye wave",
    deityPath: "{Cast} open{s} both palms toward the viewer in blessing and welcome, with a gentle nod — never a wave",
    deityName: "Bless and welcome",
    start: "three-quarter body caught mid-step a few steps back from the camera at the business's most inviting spot, "
      + "facing the camera with clear floor in front of them — never in a doorway and never with the exit behind them",
    pairStart: "both caught mid-step side by side at the same distance from the camera at the business's most inviting "
      + "spot, with clear floor beside them — never in a doorway and never with the exit behind them",
    pairInPlace: {
      name: "Invite where they stand",
      pairPath: "both turn to the camera together where they stand; {A} invites the viewer with an open palm, then {B} "
        + "invites them in with both palms open — an invitation, never a goodbye wave",
      pairStart: "both standing side by side at the same distance from the camera at the business's most inviting spot, "
        + "turning front-on to the camera with the hands beginning to open — never in a doorway and never with the exit "
        + "behind them",
    },
  },
};

/**
 * The actions of a plan saved before the dynamic pass (a kit's scene plan, `sceneContext`), read as the
 * action that now does the same job — so a kit regenerated today still follows its plan.
 */
const LEGACY_STAGINGS: Record<string, StagingKey> = {
  stand_present: "walk_stop_present",
  show_product: "approach_show",
  present_space: "walk_across",
  walk_and_talk: "walk_toward",
  welcome_invite: "walk_invite",
};

/** An action key — today's, or one a saved plan still carries (LEGACY_STAGINGS) — or null. */
export function stagingKeyOf(value: unknown): StagingKey | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (Object.prototype.hasOwnProperty.call(STAGINGS, key)) return key as StagingKey;
  return Object.prototype.hasOwnProperty.call(LEGACY_STAGINGS, key) ? LEGACY_STAGINGS[key] : null;
}

export interface ClipMotionPlan {
  /** 0-based clip index. */
  clip: number;
  role: ClipRole;
  staging: Staging;
  camera: CameraMove;
  angle: ShotAngle;
  /** "35mm" — the lens the move is filmed on. */
  lens: string;
  /** Motion-speed keywords, e.g. "smooth, steady". */
  speed: string;
  /**
   * In a two-hander on a moving camera: "speaker" — the one talking leads the action and the framing
   * drifts a little toward them, never closer. "both" for a single performer, and for a pair in the
   * client's photograph, where the camera holds still.
   */
  focus: "speaker" | "both";
  /** What the hands and body do, and on which words. */
  gesture: string;
  /**
   * Two characters share the frame. They move only together and are filmed only from the side, at ONE
   * distance (PAIR_MOVES) — see planClipMotion — so everything that reads the plan keeps them the same size.
   */
  twoHander?: boolean;
  performer: Performer;
  /**
   * The clip is shot in the client's own photograph (a background plate, utils/locationAssignment): the
   * camera only pushes in, or holds while the cast walks — nothing the photo lacks is shown.
   */
  plate: boolean;
  /** Whether the cast walks in this clip — the action travels, and its frame is composed mid-step. */
  walks: boolean;
  /**
   * This cast walks only where a clip needs it (Motu and Patlu, `CharacterPack.walksOnlyWhenNeeded`): a clip
   * that does not walk is performed where they stand — its staging is the in-place one (Staging.pairInPlace),
   * the camera glides a short way at one angle or holds still in a client photo, and the video prompt says
   * they perform where they stand. Absent for every other cast.
   */
  walksWhenNeeded?: boolean;
}

/** What the scene plan may choose for a clip (services/prompts/scenePlan). Anything unusable is ignored. */
export interface MotionChoice {
  staging?: string;
  camera?: string;
  angle?: string;
  focus?: string;
  /**
   * Whether the clip's words take the cast somewhere, so it needs a walk — the scene plan's judgment, asked
   * only for a cast that walks only when needed (it read the line and planned the background). Absent: the
   * line is read in code (lineNeedsWalk).
   */
  walk?: boolean;
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

/**
 * The roles with their own action — the festival greeting, and the one-clip ad that introduces and
 * invites at once. Every other clip takes its staging's action (the promise is "Walk, stop and explain").
 */
const ROLE_ACTION: Partial<Record<ClipRole, { person: string; deity: string; pair: string; pairInPlace: string }>> = {
  wish: {
    person: "{Cast} turn{s} to the camera with a festive smile, greet{s} the viewer with a namaste and a small bow, then "
      + "open{s} both hands outward in a warm, festive gesture",
    deity: "{Cast} raise{s} the blessing palm on the greeting, then open{s} both hands outward in a festive blessing",
    pair: "both walk a few steps side by side across the floor and turn to the camera together; {A} greets the viewer "
      + "with a namaste and a festive smile, then {B} answers with both hands opening in a warm, festive gesture",
    // A pair that walks only when needed greets where it stands (Staging.pairInPlace).
    pairInPlace: "both turn to the camera together where they stand; {A} greets the viewer with a namaste and a festive "
      + "smile, then {B} answers with both hands opening in a warm, festive gesture",
  },
  message_cta: {
    person: "{Cast} walk{s} slowly toward the camera talking warmly, with an open palm on the business name, and end{s} "
      + "by opening both palms toward the viewer in an invitation and a nod — never a goodbye wave",
    deity: "{Cast} raise{s} the blessing palm on the business name, then open{s} both palms toward the viewer in welcome",
    pair: "both walk slowly side by side across the floor as {A} speaks with an open palm on the business name; then they "
      + "turn to the camera and {B} invites the viewer in with both palms open — an invitation, never a goodbye wave",
    pairInPlace: "{A} speaks with an open palm on the business name as {B} reacts; then both turn to the camera where they "
      + "stand and {B} invites the viewer in with both palms open — an invitation, never a goodbye wave",
  },
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

// ── Reading a line for its staging ────────────────────────────────────────────────────────────────

/** A line that names something that can be SHOWN. English and Telugu. */
const PRODUCT_WORDS = /\b(?:products?|collections?|range|designs?|models?|brands?|variet(?:y|ies)|stock|sarees?|jewell?ery|gold|diamonds?|dress(?:es)?|menu|dish(?:es)?|sweets?|items?|these)\b|కలెక్షన్|డిజైన్|ప్రోడక్ట్|వెరైటీ|మోడల్|బ్రాండ్|చీర|నగల|బంగారు|స్వీట్|ఐటమ్|ఇవి/i;
/** A line about the place itself — a tour, the size, "come inside". */
const SPACE_WORDS = /\b(?:inside|showroom|branch|floor|sections?|space|whole (?:shop|store)|every corner|come in|walk in)\b|లోపల|షోరూమ్|సెక్షన్|మొత్తం|బ్రాంచ్/i;
/** A line that asks for trust — years, a guarantee, a promise. */
const TRUST_WORDS = /\b(?:years?|trust(?:ed)?|guarantee|warranty|promise|experience|family|since)\b|నమ్మకం|గ్యారంటీ|వారంటీ|సంవత్సరాల|ఏళ్ల|అనుభవం/i;

/**
 * The action a line asks for, or null when it asks for nothing in particular: a product is walked to and
 * shown, the place is walked along, a promise is walked up to and said to the camera. A deity, who never
 * walks, blesses the place instead.
 */
export function stagingForLine(line: string, role: ClipRole, performer: Performer): StagingKey | null {
  const text = line || "";
  const deity = performer === "deity";
  if (role === "wish") return "turn_present";
  if (role === "trust") return deity ? "turn_present" : "walk_stop_present";
  if (PRODUCT_WORDS.test(text)) return "approach_show";
  if (SPACE_WORDS.test(text)) return deity ? "turn_present" : "walk_across";
  if (TRUST_WORDS.test(text)) return deity ? "turn_present" : "walk_stop_present";
  return null;
}

/**
 * Words that take the cast SOMEWHERE — "let's go inside", "follow me", "come this way", "రా, లోపలికి వెళ్దాం", "పదండి",
 * "లోపలికి వెళ్లి చూద్దాం", "चलो" — in the languages the ads are made in. An invitation to the VIEWER ("visit us today",
 * "ఈరోజే రండి", "వెళ్లి చూడండి", "come inside our showroom") is not one: it is said where they stand, with open palms —
 * so Telugu "వెళ్లి" (having gone) counts only with a "let's" verb after it (-దాం: చూద్దాం, కొందాం). "పద" counts only as a
 * word of its own (not inside పదం or పదార్థం). Read only for a cast that walks only when needed (planClipMotion).
 */
const MOVE_WORDS = /\b(?:let[\u{2019}']?s (?:go|walk|look around)|let us go|look around (?:the|our|this|here)|come with (?:me|us)|walk with (?:me|us)|follow (?:me|us)|come this way|this way,? please|(?:show|take) you (?:around|inside))\b/iu;
const MOVE_WORDS_INDIAN = /వెళ్దా|వెళదా|వెళ్ళదా|వెళ్లదా|పోదా|(?:వెళ్లి|వెళ్ళి)[^.!?।\n]*దా(?:ం|మా|ము)|(?<![\u{0C00}-\u{0C7F}])పద(?:ండి|ా)?(?![\u{0C00}-\u{0C7F}])|నడుద్దా|నడవండి|నడుస్తూ|చలో|చుట్టూ చూద్దా|తిరిగి చూద్దా|(?:నాతో|మాతో|నా వెంట|మా వెంట|ఇటు)\s*(?:రా|రండి)(?![\u{0C00}-\u{0C7F}])|चलो|चलिए|चलें|चलते हैं|चलकर|(?:मेरे|हमारे) साथ (?:आओ|आइए)|போலாம்|போவோம்|ಹೋಗೋಣ|പോകാം|പോവാം/u;

/** Whether a clip's spoken words take the cast somewhere, so the clip needs a walk (see MOVE_WORDS). */
export function lineNeedsWalk(line: string): boolean {
  const text = line || "";
  return MOVE_WORDS.test(text) || MOVE_WORDS_INDIAN.test(text);
}

// ── Who may do what ───────────────────────────────────────────────────────────────────────────────

/**
 * Who performs, as far as movement is concerned:
 *   single     — one presenter or one character: walks in most clips, and takes every camera move;
 *   deity      — never walks; moves slowly, and the camera pushes in, arcs or glides sideways;
 *   pair       — two real people or two children: walk only TOGETHER, side by side, along or across the
 *                floor, filmed only from the side at one distance;
 *   drawn_pair — two drawn characters (Motu and Patlu): exactly like a pair. They never walked before
 *                2026-10-05 (any change of view re-drew a cartoon body — how Patlu grew); a sideways move
 *                at one distance keeps their size, and the owner asked for them to walk.
 */
export type CastKind = "single" | "deity" | "pair" | "drawn_pair";

export function castKindOf(performer: Performer, twoHander = false): CastKind {
  if (twoHander) return performer === "person" ? "pair" : "drawn_pair";
  return performer === "deity" ? "deity" : "single";
}

/** The table a cast reads: a drawn pair moves and is filmed exactly like a real pair. */
type CastTable = "single" | "pair" | "deity";

const tableOf = (kind: CastKind): CastTable => (kind === "pair" || kind === "drawn_pair" ? "pair" : kind === "deity" ? "deity" : "single");

/**
 * The ONLY moves a two-hander is filmed with: sideways — travelling with their walk or gliding past them —
 * at one distance and always at eye level; and, in the client's photograph, a still camera while they walk.
 *
 * ── The fault this is ──────────────────────────────────────────────────────────────────────────
 * Motu and Patlu (and every other pair) came out of the video model taller than in the still they were
 * animated from — clip after clip, even with the scale lock written at the top of the prompt. The same
 * pair was being filmed with a dolly-in, a push-in, a crane, a pedestal, a partial orbit from a LOW
 * ANGLE, a pull-back, and a camera that eased in on whichever of them was talking. Every one of those
 * moves changes how big the pair is on screen, and a video model re-draws bodies as the view changes,
 * so "bigger on screen" became "taller", and "nearer to Patlu" became "Patlu grew". A sideways move keeps
 * the distance — both stay the size the frame has them — while the background slides past, which is what
 * makes the shot move. And a pair walks only side by side, along or across the floor, never toward the
 * camera, where one of them would grow.
 */
export const PAIR_MOVES: CameraMoveKey[] = ["side_track", "lateral_dolly", "static_locked"];

/**
 * The camera moves that may film each action, in order of preference — per cast, outside the client's
 * photograph. An action a cast may not perform has no entry. Every list for an action performed in place
 * holds only moves that move, so no clip can be planned as a talking portrait.
 */
const CAMERAS: Record<CastTable, Partial<Record<StagingKey, CameraMoveKey[]>>> = {
  single: {
    walk_toward: ["push_in", "arc"],
    walk_across: ["side_track", "lateral_dolly"],
    approach_show: ["push_in", "arc"],
    walk_stop_present: ["push_in", "arc"],
    turn_present: ["arc", "lateral_dolly", "push_in"],
    walk_invite: ["push_in", "arc"],
  },
  pair: {
    walk_across: ["side_track", "lateral_dolly"],
    approach_show: ["side_track", "lateral_dolly"],
    walk_stop_present: ["side_track", "lateral_dolly"],
    turn_present: ["lateral_dolly"],
    walk_invite: ["side_track", "lateral_dolly"],
  },
  deity: {
    turn_present: ["push_in", "arc", "lateral_dolly"],
    approach_show: ["arc", "push_in", "lateral_dolly"],
    walk_invite: ["push_in", "arc", "lateral_dolly"],
  },
};

/**
 * The same in the client's own photograph, which must not change: the camera never shows more than the
 * photo — it pushes in, or holds still while the cast walks (their walk carries the shot). A pair is never
 * pushed in on, so in a photo a pair always walks.
 */
const PHOTO_CAMERAS: Record<CastTable, Partial<Record<StagingKey, CameraMoveKey[]>>> = {
  single: {
    walk_toward: ["push_in", "static_locked"],
    walk_across: ["static_locked"],
    approach_show: ["push_in", "static_locked"],
    walk_stop_present: ["push_in", "static_locked"],
    turn_present: ["push_in"],
    walk_invite: ["push_in", "static_locked"],
  },
  pair: {
    walk_across: ["static_locked"],
    approach_show: ["static_locked"],
    walk_stop_present: ["static_locked"],
    walk_invite: ["static_locked"],
  },
  deity: {
    turn_present: ["push_in"],
    approach_show: ["push_in"],
    walk_invite: ["push_in"],
  },
};

/** The cameras that may film this action for this cast in this clip — empty when the cast may not perform it. */
const camerasFor = (key: StagingKey, kind: CastKind, plate: boolean): CameraMoveKey[] =>
  (plate ? PHOTO_CAMERAS : CAMERAS)[tableOf(kind)][key] ?? [];

/**
 * How a pair that walks only when needed is filmed where it stands: a short sideways glide at one distance, so
 * both are seen from ONE angle the whole clip and the video model has no new view of them to draw — or, in the
 * client's photograph (never shown beyond its edges, never pushed in on for a pair), a still camera, their own
 * performance carrying the shot.
 */
const IN_PLACE_PAIR_CAMERAS: { scene: CameraMoveKey[]; photo: CameraMoveKey[] } = { scene: ["lateral_dolly"], photo: ["static_locked"] };

/** How each cast opens the ad (and plays a one-clip ad) — on the move — and how it greets in a festival ad. */
const OPENING: Record<CastTable, StagingKey> = { single: "walk_toward", pair: "walk_across", deity: "turn_present" };
const GREETING: Record<CastTable, StagingKey> = { single: "turn_present", pair: "walk_across", deity: "turn_present" };

/** Middle clips with no clear cue rotate through these, never repeating a neighbour. */
const MIDDLE: Record<CastTable, StagingKey[]> = {
  single: ["walk_across", "approach_show", "walk_stop_present", "turn_present"],
  pair: ["approach_show", "walk_stop_present", "walk_across", "turn_present"],
  deity: ["approach_show", "turn_present"],
};

const ALL_STAGINGS = Object.keys(STAGINGS) as StagingKey[];

const isKey = <T extends string>(value: unknown, keys: Record<T, unknown>): value is T =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(keys, value);

/**
 * The action, camera angle, lens, move, speed and gesture for every clip.
 *
 * Clip 1 opens the ad on the move (walking toward the camera — or, for a pair, along the floor); the last
 * clip walks in and invites the viewer. Every clip in between takes the scene plan's choice where this
 * cast may do it, else what its line asks for — a product to walk to and show, the place to walk along, a
 * promise to walk up and say — and otherwise rotates, so no two neighbours are staged alike. Most clips of
 * a cast that may walk do walk. The camera follows from the action (a walk along the floor is tracked from
 * the side; an approach, a product or a promise gets a push-in or an arc; a turn gets an arc or a sideways
 * glide), from the moves this cast may be filmed with (CAMERAS / PHOTO_CAMERAS), and never repeats the
 * neighbour's. No camera ever moves backward.
 *
 * `plates[i]` marks a clip shot in the client's own photograph. The frame side and the video side must
 * pass the SAME lines, choices and plates, so a frame is composed for exactly the move its video makes.
 *
 * `walksWhenNeeded` (a pair whose entry carries `walksOnlyWhenNeeded` — Motu and Patlu, 2026-10-10): each clip's
 * beat is chosen exactly as above, but the pair walks ONLY in a clip whose words take them somewhere — the scene
 * plan's judgment where it gave one (it read the line and planned that clip's background), else the line read in
 * code (lineNeedsWalk) — and never in the festival greeting. Every other clip is the same beat performed where they
 * stand (Staging.pairInPlace), filmed with IN_PLACE_PAIR_CAMERAS. There is no "most clips walk" rule and no cap:
 * a walk is planned exactly where the words need one.
 */
export function planClipMotion(
  segmentCount: number,
  adType: string,
  performer: Performer = "person",
  options: {
    lines?: string[]; choices?: (MotionChoice | null | undefined)[]; twoHander?: boolean; plates?: boolean[];
    walksWhenNeeded?: boolean;
  } = {},
): ClipMotionPlan[] {
  const roles = clipRoles(segmentCount, adType);
  const n = roles.length;
  const { lines = [], choices = [], twoHander = false, plates = [] } = options;
  const kind = castKindOf(performer, twoHander);
  const table = tableOf(kind);
  const pair = table === "pair";
  // Only a pair has its beats written to be performed where it stands (Staging.pairInPlace).
  const whenNeeded = !!options.walksWhenNeeded && pair;
  // A pair that walks only when needed may take every beat a pair has, photo or not: in place, the camera is its own.
  const may = (key: StagingKey, i: number) => whenNeeded
    ? (CAMERAS.pair[key]?.length ?? 0) > 0
    : camerasFor(key, kind, !!plates[i]).length > 0;
  /** The first of `keys` this clip may perform and that is not in `avoid`; else the first it may perform at all. */
  const pick = (keys: StagingKey[], i: number, avoid: (StagingKey | null)[] = []) =>
    keys.find((k) => may(k, i) && !avoid.includes(k))
    ?? keys.find((k) => may(k, i))
    ?? ALL_STAGINGS.find((k) => may(k, i))!;

  // The actions.
  const keys: StagingKey[] = [];
  let rotation = 0;
  roles.forEach((role, i) => {
    const previous = keys[i - 1] ?? null;
    const chosen = stagingKeyOf(choices[i]?.staging);
    let key: StagingKey;
    if (role === "wish") key = pick([GREETING[table]], i);
    else if (i === n - 1 && n > 1) key = pick(["walk_invite"], i);
    else if (role === "message_cta") key = pick([OPENING[table]], i);
    else if (chosen && chosen !== "walk_invite" && may(chosen, i)) key = chosen;
    else if (i === 0) key = pick([OPENING[table]], i);
    else {
      const read = stagingForLine(lines[i] || "", role, performer);
      if (read && may(read, i) && read !== previous) key = read;
      else {
        key = pick(MIDDLE[table], i, [previous]);
        for (let tries = 0; tries < MIDDLE[table].length; tries++) {
          const next = MIDDLE[table][rotation++ % MIDDLE[table].length];
          if (may(next, i) && next !== previous) { key = next; break; }
        }
      }
    }
    keys.push(key);
  });

  // Most clips of a cast that may walk do walk — the movement the videos lacked (history 6). A clip turned
  // in place walks instead where it may — never the festival greeting, never next to the same action. Not for
  // a cast that walks only when needed: there, walking is what redrew them (history 7).
  if (table !== "deity" && !whenNeeded) {
    const needed = Math.ceil(n / 2);
    const walking = () => keys.filter((k) => STAGINGS[k].walks).length;
    for (let i = 0; i < n && walking() < needed; i++) {
      if (STAGINGS[keys[i]].walks || roles[i] === "wish") continue;
      const swap = MIDDLE[table].find((k) => STAGINGS[k].walks && may(k, i) && k !== keys[i - 1] && k !== keys[i + 1]);
      if (swap) keys[i] = swap;
    }
  }

  // Who walks. A deity never; a pair that walks only when needed, only where the clip's words take them somewhere —
  // and a beat planned in place becomes a walk along the floor there; everyone else, as the action goes.
  const walks = keys.map((key, i) => {
    if (table === "deity") return false;
    if (!whenNeeded) return STAGINGS[key].walks;
    if (roles[i] === "wish") return false;
    const judged = choices[i]?.walk;
    return typeof judged === "boolean" ? judged : lineNeedsWalk(lines[i] || "");
  });
  if (whenNeeded) keys.forEach((key, i) => { if (walks[i] && !STAGINGS[key].walks) keys[i] = "walk_across"; });
  /** The cameras that may film clip i: a pair performing where it stands has its own (IN_PLACE_PAIR_CAMERAS). */
  const usableFor = (key: StagingKey, i: number): CameraMoveKey[] => whenNeeded && !walks[i]
    ? IN_PLACE_PAIR_CAMERAS[plates[i] ? "photo" : "scene"]
    : camerasFor(key, kind, !!plates[i]);

  // The cameras: each clip's moves in order of preference — the scene plan's first where it fits — and never
  // the neighbour's move. Picking clip by clip can leave a clip with nothing (a pair's turn in place has one
  // move), so `open[i]` first marks, from the last clip back, the moves clip i may take that still leave every
  // later clip a move. Where no ad-long answer exists (a pair in the client's photos only ever holds still),
  // the neighbour's move is avoided wherever it can be.
  const ordered = keys.map((key, i) => {
    const usable = usableFor(key, i);
    const choice = choices[i] || {};
    const chosen = isKey(choice.camera, CAMERA_MOVES) && usable.includes(choice.camera) ? choice.camera : null;
    return chosen ? [chosen, ...usable.filter((k) => k !== chosen)] : usable;
  });
  const open: Set<CameraMoveKey>[] = [];
  for (let i = ordered.length - 1; i >= 0; i--) {
    const later = open[i + 1];
    open[i] = new Set(ordered[i].filter((k) => !later || [...later].some((next) => next !== k)));
  }
  const cameras: CameraMoveKey[] = [];
  ordered.forEach((options, i) => {
    const previous = cameras[i - 1];
    const nextOnly = ordered[i + 1]?.length === 1 ? ordered[i + 1][0] : null;
    cameras.push(
      options.find((k) => k !== previous && open[i].has(k))
      ?? options.find((k) => k !== previous && k !== nextOnly)
      ?? options.find((k) => k !== previous)
      ?? options[0],
    );
  });

  return roles.map((role, i) => {
    const key = keys[i];
    const plate = !!plates[i];
    const choice = choices[i] || {};
    const camera = cameras[i];
    const move = CAMERA_MOVES[camera];

    // A pair is always at eye level: a low angle stretches the one nearer the lens, a high one squashes.
    const angleKey: ShotAngleKey = pair
      ? "eye_level"
      : isKey(choice.angle, SHOT_ANGLES) ? choice.angle : "eye_level";

    // A pair that walks only when needed performs a clip it does not walk where it stands, under the in-place name.
    const inPlace = whenNeeded && !walks[i] ? STAGINGS[key].pairInPlace : undefined;

    return {
      clip: i,
      role,
      // A deity performs every action in place, under its blessing name (deityName).
      staging: table === "deity" ? { ...STAGINGS[key], name: STAGINGS[key].deityName ?? STAGINGS[key].name, walks: false }
        : inPlace ? { ...STAGINGS[key], name: inPlace.name, pairPath: inPlace.pairPath, pairStart: inPlace.pairStart, walks: false }
        : STAGINGS[key],
      camera: move,
      angle: SHOT_ANGLES[angleKey],
      lens: move.lens,
      speed: move.speed,
      // In a pair the one talking leads and the framing drifts toward them — a still camera cannot.
      focus: pair && camera !== "static_locked" ? "speaker" : "both",
      gesture: (performer === "deity" ? DEITY_GESTURE : GESTURE)[role],
      performer,
      twoHander: pair,
      plate,
      walks: walks[i],
      ...(whenNeeded ? { walksWhenNeeded: true } : {}),
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

/** The two speakers of a pair's clip, in speaking order: {A} speaks first, {B} answers. */
export interface PairNames { a: string; b: string }

/**
 * A pair clip's two names in speaking order, from its lines: the first speaker leads ({A}). A clip with one
 * line is led by its speaker, and the other one of the pair (`cast`: left, right) only reacts.
 */
export function pairNamesOf(speech: { speaker?: string }[], cast?: [string, string]): PairNames | undefined {
  const speakers = speech.map((s) => s.speaker).filter((s): s is string => !!s);
  if (speakers.length >= 2) return { a: speakers[0], b: speakers[1] };
  if (speakers.length === 1 && cast) return { a: speakers[0], b: cast[0] === speakers[0] ? cast[1] : cast[0] };
  return undefined;
}

const NO_NAMES: PairNames = { a: "the one on the left", b: "the one on the right" };

const fillPair = (template: string, names: PairNames = NO_NAMES) =>
  template.replace(/\{A\}/g, names.a).replace(/\{B\}/g, names.b);

/** What this clip's cast does, in words for the video prompt — the plan's action, before any direction. */
export function stagingPath(plan: ClipMotionPlan, cast = "The cast", plural = false, names?: PairNames): string {
  // The festival greeting and the one-clip ad have their own action, whatever the staging — where they stand for a
  // pair that walks only when needed and does not walk in this clip.
  const own = ROLE_ACTION[plan.role];
  const inPlace = !!plan.walksWhenNeeded && !plan.walks;
  if (plan.twoHander) return fillPair(own ? (inPlace ? own.pairInPlace : own.pair) : plan.staging.pairPath, names);
  const deity = plan.performer === "deity";
  const template = own ? (deity ? own.deity : own.person) : deity && plan.staging.deityPath ? plan.staging.deityPath : plan.staging.path;
  return fillCast(template, cast, plural);
}

/**
 * The camera sentence of the video prompt — the move and the shot, in the terms Veo responds to. Written
 * here, from the plan, every time: the director never writes the camera (it is where the dolly-ins on
 * Motu and the pull-back "reveals" came from). No sentence ever moves the camera backward. `eyeLevel` is a
 * pair's camera height — "at the children's eye level" for two children.
 */
export function cameraShot(plan: ClipMotionPlan, cast = "The cast", plural = false, _names?: PairNames, eyeLevel = "at eye level"): string {
  if (plan.twoHander) {
    switch (plan.camera.key) {
      case "side_track":
        return `Smooth side-tracking two-shot ${eyeLevel}, the camera travelling sideways with them at one distance, the background sliding past with parallax`;
      case "lateral_dolly":
        // A pair that walks only when needed, where it stands: a SHORT glide, so both are seen from one angle the
        // whole clip (IN_PLACE_PAIR_CAMERAS) — a glide past them turns them, and a drawn body turned is redrawn.
        return plan.walksWhenNeeded && !plan.walks
          ? `Slow lateral dolly two-shot ${eyeLevel}, the camera gliding a short way sideways at one distance, both seen from the same angle throughout, the background sliding gently with parallax`
          : `Slow lateral dolly two-shot ${eyeLevel}, the camera gliding sideways past them at one distance, the background sliding with parallax`;
      default:
        // A still camera: only in the client's own photograph — while the pair walks across it, or while a pair
        // that walks only when needed performs where it stands.
        return plan.walks
          ? `Steady two-shot ${eyeLevel} from a still camera as they walk a few steps across the frame`
          : `Steady two-shot ${eyeLevel} from a still camera, their own performance carrying the shot`;
    }
  }
  // "filmed from a slightly low angle" — a presenter's hero line; eye level goes unsaid.
  const angle = plan.angle.key === "eye_level" ? "" : `, filmed from a ${plan.angle.name.toLowerCase()}`;
  // "her face", "his face" — and for a named character, whose pronoun the code does not know, "the face".
  const face = plural ? "their faces" : cast === "She" ? "her face" : cast === "He" ? "his face" : "the face";
  const product = plan.staging.key === "approach_show" && plan.performer !== "deity";
  const approaching = plan.walks && (plan.staging.key === "walk_toward" || plan.staging.key === "walk_invite");
  switch (plan.camera.key) {
    case "push_in":
      if (product) {
        return fillCast(`Smooth, steady push-in from a three-quarter shot to a close-up of the product${angle}, the focus `
          + `settling on ${face} as {they} turn{s} back to the lens`, cast, plural);
      }
      if (approaching) {
        return fillCast(`Smooth, steady push-in${angle} as {they} come{s} closer, ending in a `
          + `${plan.staging.key === "walk_invite" ? "medium close-up" : "medium shot"}`, cast, plural);
      }
      return `Smooth, steady push-in from a three-quarter shot to a medium close-up${angle}`;
    case "side_track":
      return fillCast("Smooth side-tracking shot from a three-quarter front angle, the camera travelling sideways "
        + "alongside {them}, the background sliding past with parallax", cast, plural);
    case "lateral_dolly":
      return fillCast(`Slow lateral dolly${angle}, the camera gliding sideways past {them}, foreground and background `
        + "sliding with parallax", cast, plural);
    case "arc":
      return fillCast(`Slow arc shot${angle}, the camera curving a short way around {them} from the front to a `
        + "three-quarter view", cast, plural);
    default:
      // A still camera: only in the client's own photograph, while the presenter walks.
      return plan.staging.key === "walk_across"
        ? fillCast("Steady medium-wide shot from a still camera as {they} walk{s} along", cast, plural)
        : fillCast("Still camera, full shot to medium shot as {they} come{s} closer", cast, plural);
  }
}

/** The camera for this clip in the standard terms: "Eye level · 35mm · Tracking Shot · smooth, steady". */
export function cameraLabel(plan: ClipMotionPlan): string {
  return `${plan.angle.name} · ${plan.lens} · ${plan.camera.name} · ${plan.speed}`;
}

/** A deity's still, whatever the action: in place, mid-blessing — a deity never walks. */
const DEITY_START = "the full figure from head to feet inside the place, in a graceful blessing pose caught mid-gesture, "
  + "facing the viewer, with clear space around the arms";

/** How a composition note ends: life, not a pose. */
const MID_MOVEMENT = "Caught mid-movement, like a candid frame from a premium commercial — never a stiff, posed stance";

/**
 * How the still must be composed for this clip's action and camera move — already under way.
 *
 * Veo continues the pose a frame starts from: a presenter posed with clasped hands, facing the lens, stays
 * that way for eight seconds (the owner's clips, 2026-10-05). So a walking clip's still is caught MID-STEP,
 * one foot forward, and a turn is caught as the arm begins to open.
 *
 * Drawn characters and deities are framed head to FEET: their height and build are the identity, and a
 * frame that crops the legs leaves the video to invent them, which is where a short character starts
 * growing. A real person keeps the three-quarter framing — their face has to stay big enough to match —
 * except where the walk needs the full figure and the floor they walk on. A pair is caught side by side at
 * one distance from the camera; a deity blesses in place.
 *
 * Everything the video will need is IN the still: the product they walk to, the counter they walk along,
 * the floor they walk on. What is not in the frame is what the video would have to invent, and invented
 * space is where furniture vanished and people walked into walls.
 */
export function compositionFor(plan: ClipMotionPlan): string {
  const start = plan.performer === "deity" ? DEITY_START
    : plan.twoHander ? plan.staging.pairStart
    : plan.performer === "person" ? plan.staging.start
    : plan.staging.start.replace(/three-quarter body( \(head to knees\))?/, "the full figure from head to feet");
  // A still camera films a walk — or a pair performing where it stands, on the floor it stands on.
  const framing = plan.camera.key === "static_locked" && !plan.walks
    ? "the photograph's own framing, with the real floor they stand on in view"
    : plan.camera.framing;
  return `${start}; ${framing}; shot ${plan.angle.name.toLowerCase()} on a ${plan.lens} lens; every object around `
    + `them fully inside the frame and clear of their body, and a fixed vertical reference behind them — a counter edge, `
    + `a door frame or a shelf line — that their height can be read against, with their feet and the floor visible`;
}

/** The line a frame prompt carries so the still is ready for its clip. */
export function framingForMotion(plan: ClipMotionPlan | undefined): string {
  if (!plan) return "";
  return `🎬 THIS CLIP: ${plan.staging.name} — filmed ${cameraLabel(plan)}. Compose the still for it: `
    + `${compositionFor(plan)}. ${MID_MOVEMENT}.`;
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
 * photograph: the photograph's own framing is kept, so no composition is asked for — only where the
 * subject stands in it (on a walk, caught mid-step on open floor).
 */
export function withMotionComposition(
  prompt: string,
  plan: ClipMotionPlan | undefined,
  options: { keepPose?: boolean; plate?: boolean } = {},
): string {
  if (!plan || !prompt.trim() || prompt.includes(MOTION_COMPOSITION_HEADING)) return prompt;
  // A client photograph is the frame (utils/locationAssignment backgroundPlateRule): its own framing and
  // angle are kept, so nothing here may ask for a different composition — only room for the action.
  if (options.plate) {
    const spot = !plan.walks
      ? plan.twoHander
        // A pair that walks only when needed, performing where it stands.
        ? "both placed into it side by side at the same distance from the camera, standing on the real floor right beside what the line is about, one hand caught mid-gesture"
        : "the subject placed into it on the real floor, turned slightly toward what they present"
      : plan.twoHander
        ? "both placed into it side by side, caught mid-step on the real floor, with room to walk a few steps across it"
        : "the subject placed into it caught mid-step on open, clear floor, with room to walk and nothing between them and the camera";
    return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: ${plan.staging.name} (${cameraLabel(plan)}) — the photograph's own `
      + `framing and camera angle, unchanged; ${spot}, with clear space around the arms for gestures and every object fully in view.`;
  }
  if (options.keepPose) {
    return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: this pose opens the clip (${plan.staging.name}, `
      + `${cameraLabel(plan)}) — ${plan.camera.framing}; every object fully inside the frame and clear of the body.`;
  }
  return `${prompt.trimEnd()}\n\n${MOTION_COMPOSITION_HEADING}: ${plan.staging.name} (${cameraLabel(plan)}) — `
    + `${compositionFor(plan)}. ${MID_MOVEMENT}.`;
}

/** The heading of the scale line code adds to a pair's frame prompt — see withScaleAnchor. */
export const SCALE_ANCHOR_HEADING = "SCALE ANCHOR";

/**
 * A finished frame prompt, guaranteed to carry the cast's size against the room (CharacterPack.
 * scaleAnchor) — the same words the video prompt carries, so the still and the video measure the
 * characters by the same counter. Stamped in code because a frame model asked to repeat a sentence in
 * every prompt drops it on the short continuation frames. Idempotent.
 */
export function withScaleAnchor(prompt: string, anchor?: string): string {
  const text = (anchor || "").trim();
  if (!text || !prompt.trim() || prompt.includes(SCALE_ANCHOR_HEADING)) return prompt;
  return `${prompt.trimEnd()}\n\n${SCALE_ANCHOR_HEADING}: ${unterminated(text)}. Both stand on the floor at the same distance from the camera, beside the real counter, shelf or door frame that shows it.`;
}

/**
 * Character direction with the stillness taken out.
 *
 * The catalogue was written for held frames — "Patlu stays planted and completely still", "the body
 * barely moves", "tripod-locked with absolutely no movement", "his feet stay exactly where they are",
 * "Minnie holds her ground" — and a character told that comes out frozen. Every clause that orders a
 * frozen body is dropped; the rest — the character's manner, gestures, expressions, what a deity must
 * never touch — is kept.
 */
const STILLNESS = /\b(?:still(?:ness)?|planted|rooted|motionless|unmoving|at rest|returns? to rest|locked(?:[- ]off)?|tripod|on sticks|never walks?|walks? within|no step|no sway|no weight shift|no shoulder movement|no pacing|does not move|do not move|doesn't move|has not moved|barely moves|without moving|no movement|stays put|stationary|held frame|use none|any motion at all|absence of gesture|do not punctuate|(?:his|her|their|its) feet stay|holds? (?:his|her|their|its) ground|never chased)\b/i;

export function withoutStillness(text: string): string {
  return dropClauses(text, STILLNESS);
}

/**
 * Character direction with the travelling taken out.
 *
 * Some entries were written as walking tours — "a light bouncing walk", "a smooth lateral steadicam
 * that walks with him", "he walks the counter" — the movement that made the video model invent rooms
 * and push people into furniture. The PLAN decides who walks and how far (planClipMotion), so those
 * clauses are dropped from what the video director reads; the manner, voice and gestures are kept.
 */
const TRAVEL = /\b(?:walk(?:s|ing|ed)?|stroll(?:s|ing)?|strides?|striding|paces?|pacing|wanders?|wandering|leads? the (?:way|viewer)|walking tour|arrives? at|cross(?:es|ing) (?:the|to|over|into|toward|towards)|enters|entering|exits|exiting|steadicam that walks)\b/i;

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

/**
 * What the director call writes for one clip — the planned action made specific to its frame (the
 * product she lifts, the counter she gestures at). Everything else in the prompt is assembled in code.
 */
export interface VeoDirection {
  action: string;
}

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
  /** Who must look exactly as the frame has them, e.g. "her exact face, hair, outfit and height". */
  identityLock: string;
  /** The spoken language, so the voice carries the right accent. */
  language: string;
  speech: VeoSpeech[];
  /**
   * Who performs, as the action addresses them: "She", "He", "The presenter", "Ganesha". Defaults to
   * "The cast". A pair is addressed by its speakers' names (VeoSpeech.speaker).
   */
  cast?: string;
  /** True when `cast` takes a plural verb ("Both characters are"). */
  castPlural?: boolean;
  /** A two-hander: both stay side by side, filmed at one distance, and the one listening reacts. */
  twoHander?: boolean;
  /**
   * The pair's size against a real object in the room — "the counter top reaches Motu's chest and
   * Patlu's waist" — the same words the frame prompt carried (CharacterPack.scaleAnchor).
   */
  scaleAnchor?: string;
  /** Which side each of a pair keeps while they move: "Motu on the left and Patlu on the right". */
  sides?: string;
  /** A pair's two names, left then right — so a clip with ONE speaker still names who leads (pairNamesOf). */
  pairNames?: [string, string];
  /** A pair's camera height, e.g. "at the children's eye level" (cameraShot). Default: "at eye level". */
  eyeLevel?: string;
}

const clean = (value: unknown, max = 600): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * A sentence the prompt will punctuate itself: no trailing full stop, so the assembled line never
 * reads "counter.. Smooth". Seen in the first live runs, on nearly every clip.
 */
const unterminated = (value: string) => value.replace(/[\s.;,]+$/, "");

const capitalised = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** An action that follows the camera sentence's colon: "…medium close-up: she turns…", not "…: She turns". */
const afterColon = (s: string) => (/^(?:She|He|They|Both|The|Each|It|Its|Their|His|Her)\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * A direction with the spoken words taken out of it.
 *
 * In live runs the director quoted the dialogue inside the actions — "lifting a palm on the words
 * 'శ్రీ సాయి టూ వీలర్ సర్వీస్ సెంటర్'", "while starting the line 'అరే గణేశ…'". The line is already
 * in the voice part of the prompt, once; a second copy in the action invites Veo to say it twice or put
 * it on screen as text. A quoted run of non-Latin script is removed, with the "as he speaks" / "on the
 * words" lead-in it leaves hanging.
 */
export function withoutQuotedSpeech(value: string): string {
  if (!value) return value;
  const quoted = /\s*['"‘“][^'"‘“’”]*[^\x00-\u{024F}\u{2000}-\u{206F}\s][^'"‘“’”]*['"’”]/gu;
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

// ── What a director's action may never do ─────────────────────────────────────────────────────────

/** Leaving the place — out of a door, onto the road, into another shop, to the entrance. */
const LEAVES = /\b(?:outside|through (?:the|a) door|out of the (?:shop|store|business|door|showroom)|onto the (?:road|street|footpath)|into (?:another|the next|a different) (?:shop|store|building)|(?:leaves?|leaving|exits?|exiting) the (?:shop|store|business|showroom|room)|enters? the (?:shop|store|business) from|around the (?:shop|store|room)|walk(?:s|ing)? into (?:the |a )?(?:table|counter|wall|shelf|door)|(?:to|toward|towards|through) the (?:entrance|exit|doorway|door|front door|gate|shutter))\b/i;

/**
 * Walking or stepping of any kind. Required on a walk clip; refused on every other clip, which is
 * performed where the frame has them. A turn of the body or the head, a reach, a lean or crossed arms is
 * not matched — "turns her head toward the shelf" and "crosses his arms" are gestures, not travel.
 */
const WALKS = /\b(?:walk(?:s|ing|ed)?(?! in place)|stroll(?:s|ing)?|strides?|striding|marches|marching|wanders?|wandering|leads? the (?:way|viewer)|leading the way|(?:one|two|three|four|several|a few|a small|a half|a single) (?:\w+ )?steps?|half[- ]steps?|takes? a (?:small |half |single )?step|steps? (?:forward|closer|toward|towards|through|across|out|into|up|onto|on to|back)|goes (?:to|into|out)|heads (?:off|out|over|back) to|makes? (?:her|his|their) way|cross(?:es|ing) (?:the|to|over|into)|enters|entering|approach(?:es|ing)?|comes? (?:forward|closer|toward|towards))\b/i;

/**
 * A walk that goes beyond the floor the frame shows — a tour of the whole place, to the back of it, deeper
 * in, or away from the camera. "The full length of" is matched only after a walk — unfolding a saree to its
 * full length is a product shot. Across or through the room is a walk (2026-10-05); across the WHOLE room,
 * or seven steps and more, is a tour.
 */
const LONG_WALK = /\b(?:(?:across|through) the (?:whole|entire) (?:room|shop|store|showroom|hall|office|place|premises|space)|(?:around|round) the (?:whole |entire )?(?:room|shop|store|showroom|hall|office|place|premises|space)|to the (?:back|far end|other side|other end|rear)|deeper into|walk(?:s|ing)? (?:the )?(?:full |whole |entire )?length of|walk(?:s|ing)? (?:behind|around|round|over|away|off)|(?:seven|eight|nine|ten|eleven|twelve|a dozen|dozens of|many) (?:\w+ )?steps?|away from the camera)\b/i;

/**
 * Climbing on or walking over furniture — the most unrealistic thing the videos did. A product "on top
 * of the counter" is where it sits, not a climb.
 */
const CLIMBS = /\b(?:climbs?|climbing|clambers?|(?:stands?|standing|climbs?|jumps?|sits?|sitting|steps?|walks?) on top of|onto the (?:table|counter|shelf|shelves|cupboard|desk|rack|showcase)|(?:stands?|standing|jumps?|jumping|sits?|sitting) on (?:the |a )?(?:table|counter|shelf|cupboard|desk|rack|showcase)|over the (?:table|counter|shelf|cupboard|desk))\b/i;

/**
 * A direction that freezes the body — the failure the first videos had. A mannequin in a saree shop, a
 * statue in a temple and frozen desserts are things in the frame, so only a PERSON held like one is
 * matched (a live run refused "her hand toward the bridal saree on the mannequin", 2026-10-05).
 */
const FROZEN = /\b(?:stands? (?:perfectly |completely )?still|standing still|(?:holds?|stays?|remains?) (?:absolutely |perfectly |completely )?still|(?:stands?|stays?|remains?|is|are) (?:frozen|stationary)|motionless|freezes|(?:like|as) (?:a |an )?(?:statue|mannequin|cardboard cut-?out)|statue-like|mannequin-like|locked[- ]off|tripod|on sticks|does not move|doesn't move|without moving|no movement|barely perceptible)\b/i;

/** Something that would break the one continuous shot or the lip-sync. */
const CAMERA_BREAKS = /\b(?:crash[- ]zoom|snap[- ]zoom|whip|cut(?:s)? to|jump cut|slow[- ]?motion|slow-mo|hyper-?lapse|time-?lapse|360)\b/i;

/**
 * A camera move named inside the action. The camera sentence is written in code from the plan; a second
 * move in the action is two moves in one clip, and is where the reveals and the dolly-ins on one of a
 * pair came from. "Turns toward the camera" or "tilts her head" are not matched.
 */
const CAMERA_TALK = /\bcamera (?:pans?|tilts?|zooms?|dolly|dollies|pushes|pulls|tracks?|follows?|moves?|glides?|cranes?|orbits?|circles?|arcs?|swings?|rises?|lowers?|cuts?|reveals?)\b|\b(?:pan|pans|panning|tilt|tilts|tilting|zoom|zooms|zooming|dolly|dollies|crane|cranes|orbit|orbits|tracking|truck|trucks)\s+(?:shot|in|out|up|down|across|around|over|along|left|right|to|toward|towards|back)\b|\bclose-?up\b|\bwide shot\b|\brack focus\b|\bfocus (?:shifts?|pulls?|moves?|racks?)\b|\bpull(?:s|ing)? back\b|\breveals? (?:the|more of the) (?:room|shop|store|showroom|place|space|premises|whole)\b/i;

/** A wave — any wave reads as goodbye at the end of an ad line. The invitation is open palms. */
const GOODBYE = /\b(?:wav(?:e|es|ed|ing)|bye[- ]?bye|farewell|goodbye)\b/i;

/** A change of light — the drift that left videos pale. */
const LIGHT_CHANGE = /\b(?:light (?:shifts?|shifting|changes?|flickers?|flickering|brightens?|dims?|streams?|streaming|pours?|floods?|plays?)|sun ?(?:light|beams?|rays?|shine)|shafts? of light|glow(?:s|ing)?|flares?|bloom|haze|hazy|brighten(?:s|ing)?|golden hour|dappled|god ?rays|sparkl(?:e|es|ing) of light)\b/i;

/**
 * An action that changes how big one of a PAIR is: leaning toward the lens, rising, stretching. The
 * director writes these as life ("Motu rocks forward", "Patlu rises onto his toes") and the video model
 * draws them as a character growing.
 *
 * A HAND rising is a gesture, not the body: Motu's own catalogue direction is "both hands rise near his chest in
 * disbelief", and the director copies it — in the first live run of the 2026-10-10 in-place clips, two of eight
 * otherwise good actions ("his hands rising near his chest") were thrown away for it. So "rise" counts only when
 * it is not the hands, arms, palms, fingers or brows that rise.
 */
const PAIR_SCALE = /\b(?:leans? (?:in|forward|into|toward(?:s)?)|leaning (?:in|forward|toward(?:s)?)|rocks? forward|stands? (?:up|taller)|straightens? up|(?<!\b(?:hands?|arms?|palms?|fingers?|brows?|eyebrows?) )(?:rises?|rising)|on (?:his|her|their) toes|tip-?toes?|jumps?|jumping|hops?|bounc(?:es|ing) up|stretch(?:es|ing)?|grows?|growing|puffs? (?:up|out)|swells?|bigger|larger)\b/i;

/**
 * Running — where faces and limbs break. Matched as a way of moving only: "runs her hand along the silk"
 * is a gesture.
 */
const RUNS = /\b(?:running|jogging|sprinting|dashing|rushing|(?:runs?|ran|jogs?|sprints?|dash(?:es)?|rush(?:es)?) (?:toward|towards|to|across|along|into|through|over|up|down|around|off|ahead|back))\b/i;

/** Moving backward — the camera never does (the owner, 2026-10-05), and a cast stepping back reads as a retreat. */
const BACKWARD = /\b(?:walk(?:s|ing)? backwards?|steps? back(?:wards?)?|stepping back|backs? (?:away|up|off)|moves? (?:back|away) from the (?:camera|lens))\b/i;

/**
 * One of a pair walking toward the lens — a body nearer the lens is a body growing (the Motu and Patlu
 * fault). A pair walks along or across the floor; turning toward the camera is not matched.
 */
const PAIR_TOWARD = /\b(?:walk(?:s|ing)?|step(?:s|ping)?|comes?|coming|heads?|heading|mov(?:e|es|ing))\b(?:\s+[\w-]+){0,4}?\s+(?:toward|towards|to) the (?:camera|lens|viewer)\b|\bapproach(?:es|ing)? the (?:camera|lens|viewer)\b|\bcloser to the (?:camera|lens)\b/i;

/** At most this many words of action — the prompt stays short, and a long action is several actions. A pair's has two halves. */
const ACTION_MAX_WORDS = 60;
const PAIR_ACTION_MAX_WORDS = 80;

/** Whether the director's action may replace the plan's for this clip. */
function actionUsable(plan: ClipMotionPlan, text: string): boolean {
  if (!text || text.split(/\s+/).length > (plan.twoHander ? PAIR_ACTION_MAX_WORDS : ACTION_MAX_WORDS)) return false;
  if ([LEAVES, LONG_WALK, CLIMBS, FROZEN, CAMERA_BREAKS, CAMERA_TALK, GOODBYE, LIGHT_CHANGE, RUNS, BACKWARD].some((r) => r.test(text))) return false;
  const walking = WALKS.test(text);
  if (plan.walks) {
    if (!walking) return false;
    // A pair walks only together — never one of them alone.
    if (plan.twoHander && !/\b(?:both|together|side by side)\b/i.test(text)) return false;
  } else if (walking) return false;
  // A pair never grows: no lean, rise or jump, and no walk toward the lens.
  return !(plan.twoHander && (PAIR_SCALE.test(text) || PAIR_TOWARD.test(text)));
}

/**
 * A usable direction for one clip: the director's action where it is alive, safe and true to the plan,
 * the plan's own action where it is not. The camera is never the director's (cameraShot).
 */
export function resolveDirection(
  plan: ClipMotionPlan,
  direction?: Partial<VeoDirection> | null,
  cast = "The cast",
  plural = false,
  names?: PairNames,
): VeoDirection {
  const modelAction = unterminated(asSpokenOf(withoutQuotedText(withoutQuotedSpeech(clean(direction?.action, 420))), cast));
  return { action: actionUsable(plan, modelAction) ? modelAction : stagingPath(plan, cast, plural, names) };
}

/**
 * An action with any quoted words taken out — a sign's text (toward the "SRI LAKSHMI SILKS" sign), a
 * label. Quoted words in a video prompt are words the model may put on screen (2026-10-05 live run).
 */
const withoutQuotedText = (value: string) => value.replace(/\s*["“][^"”]{1,80}["”]/g, "").replace(/\s+,/g, ",");

/**
 * "The model turns…" — the director's name for a single presenter — read as the prompt names her
 * everywhere else ("she"), so the action does not introduce a "model" the frame does not have.
 */
const asSpokenOf = (value: string, cast: string) => {
  const pronoun = cast === "She" ? "she" : cast === "He" ? "he" : "";
  if (!pronoun) return value;
  return value.replace(/\b[Tt]he (?:model|presenter|brand ambassador|ambassador)\b/g, (m) => (m.startsWith("T") ? capitalised(pronoun) : pronoun));
};

/**
 * How the words are SPOKEN — the accent, stated.
 *
 * English ads came out of the video model in a British or American voice: the prompt said only
 * "speaking English", so the model used its default English voice. These ads are made for Indian
 * customers, mostly in Andhra Pradesh, with an Indian presenter on screen, so an English ad names its
 * accent on every spoken line and in the negative. Other languages are spoken natively already.
 */
export interface SpeechAccent {
  /** What each line is "said in", e.g. "Indian English with a natural Andhra Pradesh accent". */
  spoken: string;
  /** The negative-prompt phrase. */
  negative: string;
}

export function speechAccentFor(language: string): SpeechAccent | null {
  const lang = (language || "").trim().toLowerCase();
  if (lang !== "en" && !/^english\b/.test(lang)) return null;
  return { spoken: "Indian English with a natural Andhra Pradesh accent", negative: "no foreign accent" };
}

/**
 * How the body moves through the whole clip, and the life around it — the "natural body movement, clothing
 * and hair movement, background activity" of the brief, by performer. Only people the frame already shows
 * carry on; the negative still forbids anyone new.
 */
function movementNote(plan: ClipMotionPlan): string {
  if (plan.performer === "deity") {
    return "Slow, graceful, majestic movement throughout; every gesture is a blessing, never touching or holding products, money or a phone";
  }
  const around = "anyone already in the background carries on naturally";
  if (plan.performer === "cartoon") return `Their own signature mannerisms from the show throughout; ${around}`;
  const clothes = plan.walks ? "clothes and hair move with every step" : "clothes and hair move naturally";
  // A pair looks at each other as much as at the lens; the one listening reacting is in the voice part.
  return plan.twoHander
    ? `Natural body movement throughout — ${clothes}; ${around}`
    : `Natural body movement throughout, with eye contact on the key words — ${clothes}; ${around}`;
}

/**
 * Who leads a pair's shot: the framing drifts a little toward whoever is speaking — sideways, never closer,
 * so neither one grows. A still camera (the client's photograph) cannot drift, so it says nothing.
 */
function speakerFraming(plan: ClipMotionPlan, speech: VeoSpeech[]): string {
  if (!plan.twoHander || plan.focus !== "speaker") return "";
  const speakers = speech.filter((s) => s.speaker);
  return speakers.length === 1
    ? ` The framing favours ${speakers[0].speaker}, never closer.`
    : " The framing drifts a little toward whoever is speaking, never closer.";
}

/**
 * "with a very sweet, warm, confident female voice". A catalogue voice may be a bare description, and
 * may end with who the character is ("…, the friend who asks what the viewer is wondering") — a voice
 * model needs the sound, not the role, so the role is left out.
 */
const withVoice = (voice: string) => {
  const v = unterminated(voice.trim().replace(/,\s+the (?:one|friend|voice|person)\b.*$/i, ""));
  return /^(?:a|an|the|his|her|their|its)\b/i.test(v) ? `with ${v}` : `with a voice that is ${v}`;
};

/** Who speaks, as the subject of "says": "She" → "she", "The presenter" → "the presenter", "Ganesha". */
const speakerSubject = (cast: string) => (/^(?:She|He|They|The)\b/.test(cast) ? cast.charAt(0).toLowerCase() + cast.slice(1) : cast);

/**
 * The voice part: who says what, in which voice and language — the exact words in quotes, never
 * rewritten. A pair's lines are tied to a time window, a name and a side of the frame, and the one not
 * speaking is told to keep the mouth closed: a voice named once, far from its words, is how lines came
 * out of the wrong mouth.
 */
function speechPart(speech: VeoSpeech[], cast: string, spokenIn: string, twoHander = false): string {
  const pair = speech.length > 1 && speech.every((s) => s.speaker);
  const rows = speech.map((s) => {
    if (s.speaker) {
      const where = s.position ? ` (${s.position})` : "";
      return `${s.at ? `${s.at} — ` : ""}${s.speaker}${where}, ${withVoice(s.voice)}, says in ${spokenIn}:\n"${s.line}"`;
    }
    return `${capitalised(withVoice(s.voice))}, ${speakerSubject(cast)} says in ${spokenIn}:\n"${s.line}"`;
  });
  if (pair) rows.push("Only the one speaking moves their lips; the other listens with the mouth closed and reacts.");
  // One line in a two-hander: the other one is on screen too, and must not take it.
  else if (twoHander && speech.length === 1 && speech[0].speaker) {
    rows.push(`Only ${speech[0].speaker} speaks; the other keeps the mouth closed and reacts.`);
  }
  return rows.join("\n");
}

/**
 * The words that mark the keep-it-as-the-frame sentence — utils/veoRefine refuses an edit that drops it.
 * "the same place … as the attached frame; she moves within that place": the place is kept and the people
 * move through it. The older "keep the place … exactly as in the attached frame for the whole clip" read to
 * Veo as "keep the picture still" (history 6); a saved kit may still carry it (LEGACY_VEO_FRAME_LOCK).
 */
export const VEO_FRAME_LOCK = "as the attached frame";
export const LEGACY_VEO_FRAME_LOCK = "exactly as in the attached frame";

/**
 * The finished Veo 3 prompt for one clip — five short parts, assembled in code.
 *
 * 1. What it is: one continuous 8-second shot that STARTS from the attached frame — not one that
 *    "animates" it: a frame to animate read as a picture to keep still (history 6).
 * 2. The camera and the action — ONE move (cameraShot) and ONE action with gestures (the director's,
 *    checked, or the plan's), so the start of the prompt, which Veo weighs most, is the motion; then the
 *    life around them, and in a pair who the framing follows.
 * 3. The voice and the exact words.
 * 4. One sentence keeping the people (and a pair's sides and heights), the place and the colours as the
 *    frame has them while they move through it — never a description of them: the frame IS the
 *    description.
 * 5. A one-line negative that names only what must not happen — text, music, cuts, shake, a frozen pose,
 *    a new location, new people, a wave — and never a place or an object: a "No street, no door" line is,
 *    to a video model, a street and a door.
 */
export function assembleVeoPrompt(input: VeoPromptInput): string {
  const { aspectRatio, plan, identityLock, language, speech, twoHander } = input;
  const who = input.cast || "The cast";
  const plural = !!input.castPlural;
  const names: PairNames | undefined = speech.length >= 2 && speech[0].speaker && speech[1].speaker
    ? { a: speech[0].speaker, b: speech[1].speaker }
    : undefined;
  const pair = !!twoHander;
  const { action } = resolveDirection(plan, input.direction, who, plural, names ?? pairNamesOf(speech, input.pairNames));
  const orientation = aspectRatio === "16:9" ? "horizontal" : "vertical";
  // An English ad is spoken with an Indian accent — see speechAccentFor.
  const accent = speechAccentFor(language);

  // Who moves through the place, as the keep sentence names them: "she", "he", "they", "Ganesha". A pair that walks
  // only when needed and does not walk in this clip performs where it stands — said in words that still move them.
  const mover = pair || plural ? "they move" : `${speakerSubject(who)} moves`;
  const stays = pair && !!plan.walksWhenNeeded && !plan.walks;
  const within = (where: string) => (stays ? "they perform side by side where they stand" : `${mover} within ${where}`);
  const place = plan.plate
    ? `this real place exactly ${VEO_FRAME_LOCK} shows it — the same layout, fixtures, products, signage, logo, colours and light; ${within("it")}, and nothing new is added to it`
    : `the same place, logo, colours and light ${VEO_FRAME_LOCK}; ${within("that place")}, and nothing new is added to it`;
  // A pair keeps its sides while it moves — the video tells who is talking by where they stand.
  const sides = pair && input.sides?.trim() ? ` — ${input.sides.trim()} —` : ",";
  // The pair's height against the room — the same words the frame carried (withScaleAnchor).
  const anchor = pair && input.scaleAnchor?.trim() ? `\nHeights never change: ${unterminated(input.scaleAnchor.trim())}.` : "";
  const keep = `Keep ${identityLock}${sides} and ${place}.${anchor}`;

  const negatives = [
    "No text or subtitles on screen",
    "no background music or echo",
    "no cuts",
    "no camera shake",
    plan.walks ? "no frozen or static pose" : "no frozen pose",
    "no change of location or background",
    "no unnatural movement",
    // Their heights and clothes drifted (history 7) — the redraw is named for the cast it happened to.
    ...(plan.walksWhenNeeded ? ["no morphing"] : []),
    "no extra people",
    "no goodbye wave",
    ...(plan.performer === "cartoon" ? ["no narrator or new voices"] : []),
    ...(pair ? ["no two voices at once"] : []),
    ...(accent ? [accent.negative] : []),
  ].join(", ");

  return `${aspectRatio} ${orientation} video, one continuous 8-second shot that starts from the attached frame.

${cameraShot(plan, who, plural, names, input.eyeLevel)}: ${afterColon(action)}.${speakerFraming(plan, speech)} ${movementNote(plan)}.

${speechPart(speech, who, accent ? accent.spoken : language, pair)}

${keep}

Negative prompt: ${negatives}.`;
}

/**
 * The Veo 3 prompt for a REAL person — the Real Owner Face ads (2026-10-08, the owner's own words).
 *
 * The owner: "For all the real person videos we need only this prompt based on gender of the video
 * specification":
 *
 *     With a very sweet voice she needs to say :-
 *
 *     {Your Voice}
 *
 *     with appropriate gestures
 *
 *     Negative prompt :-
 *     No text on the screen
 *
 * — "he" for a man. Nothing else: no camera move, no action, no keep sentence. A real person's face is
 * the client's own photograph; every extra instruction about the person is one more thing the video
 * model may "improve", and in their ads the face was changing (a bindi appeared that the owner does not
 * wear). The frame (`withRealPersonComposition` + utils/frameBrand.withOwnerFaceLock) carries the person
 * exactly as photographed, and this prompt only gives the words and the gestures. The line is the clip's
 * spoken words, exactly — `spokenLinesIn` reads it back so a refine can never change it.
 */
export function assembleRealPersonVeoPrompt(input: { gender: "male" | "female"; line: string }): string {
  const pronoun = input.gender === "male" ? "he" : "she";
  return `With a very sweet voice ${pronoun} needs to say :-

${input.line.replace(/\s+/g, " ").trim()}

with appropriate gestures

Negative prompt :-
No text on the screen`;
}

/** The heading of the composition line code adds to a real person's frame prompt. */
export const REAL_PERSON_COMPOSITION_HEADING = "COMPOSITION FOR THE VIDEO";

/**
 * A real person's frame, composed for the video it starts (2026-10-08).
 *
 * Their clip is the owner's prompt above — the line, said "with appropriate gestures" — not a walk. A
 * frame caught mid-step (the composition every other cast gets) would start a walk the prompt never asks
 * for, so the person is caught where they stand, mid-gesture, ready to speak. In the client's own photo
 * (a background plate) the photograph's framing is kept. Idempotent.
 */
export function withRealPersonComposition(prompt: string, options: { plate?: boolean } = {}): string {
  if (!prompt.trim() || prompt.includes(REAL_PERSON_COMPOSITION_HEADING)) return prompt;
  const framing = options.plate
    ? "the photograph's own framing and camera angle, unchanged; the person placed into it on the real floor"
    : "three-quarter body (head to knees) at eye level, the face large and clear";
  return `${prompt.trimEnd()}\n\n${REAL_PERSON_COMPOSITION_HEADING}: the person speaks this clip's line to the camera with `
    + `natural, appropriate gestures — ${framing}; standing in place facing the camera (or turned slightly toward what the line is `
    + `about), relaxed, one hand caught mid-gesture at chest height as if speaking, feet planted; clear space around the arms; every `
    + `object fully in view; never mid-step and never a stiff, posed stance.`;
}

/**
 * The spoken lines inside a prompt — used to check a refined prompt kept them word for word. Reads the
 * 2026-10-05 form ("… says in Telugu:\n"…"") and the older one ("… perfectly lip-synced:\n"…"") a saved
 * kit may still hold.
 */
export function spokenLinesIn(prompt: string): string[] {
  const quoted = [...prompt.matchAll(/(?:lip-synced|\bsays\b[^\n"]*):\n"([^"]*)"/g)].map((m) => m[1]);
  // A real person's prompt (assembleRealPersonVeoPrompt): the line is the paragraph after "needs to say :-".
  const realPerson = [...prompt.matchAll(/needs to say\s*:-[ \t]*\r?\n\s*\n([\s\S]*?)(?=\r?\n[ \t]*\r?\n|$)/g)].map((m) => m[1].trim());
  return [...quoted, ...realPerson];
}

/**
 * Where this clip's cast walks, in the words the director call reads after the PLANNED ACTION's name — so
 * the action it writes walks the way the plan (and the frame composed for it) expects, or does not walk.
 */
export function walkHint(plan: ClipMotionPlan): string {
  if (!plan.walks) return "performed where they stand, no steps";
  const both = plan.twoHander ? "both together, side by side, " : "";
  const still = plan.camera.key === "static_locked" ? " (the camera stays still — only a few steps)" : "";
  switch (plan.staging.key) {
    case "walk_toward":
      return `${both}a slow walk toward the camera on the open floor the frame shows${still}`;
    case "walk_across":
      return `${both}a slow walk along the counter, display or open floor the frame shows beside them${still}`;
    case "approach_show":
      return `${both}a few steps to the product or display the frame shows beside them${still}`;
    case "walk_stop_present":
      return `${both}a few unhurried steps on the open floor the frame shows, then a stop${still}`;
    case "walk_invite":
      return plan.twoHander
        ? `${both}a few steps across the floor the frame shows, then both turn to the camera${still}`
        : `the last few steps toward the camera on the open floor the frame shows${still}`;
    default:
      return "performed where they stand, no steps";
  }
}

export const VEO_DIRECTION_SYSTEM_PROMPT = (options: {
  clipCount: number;
  aspectRatio: "9:16" | "16:9";
  /** "the model (a woman)" or the cast, e.g. "Motu and Patlu". */
  subject: string;
  /** A character's own performance direction, when there is one — already stripped of stillness and travel. */
  characterDirection?: string;
  /** A deity moves slowly and blesses rather than presenting. */
  performer?: Performer;
  /** Two characters share the frame: they walk only together, and never toward the lens alone. */
  twoHander?: boolean;
  /** The cast walks only where a clip needs it (Motu and Patlu) — the director is told why (planClipMotion). */
  walksWhenNeeded?: boolean;
}) => {
  const plural = !!options.twoHander || /\band\b/.test(options.subject);
  const does = plural ? "do" : "does";
  return `You direct the ACTION of short image-to-video clips for premium Indian television commercials. Each clip is 8 seconds of Veo 3 video that starts from ONE attached still: that frame is the first moment of the video and its only picture of the place. Every clip must feel like a shot from a real commercial — the cast moves through the place the frame shows and does something real — never a talking portrait. But whatever you send someone toward that the frame does not show, the video model INVENTS — that is how presenters once walked onto the road, characters walked over tables and cupboards, and shops grew into places the client does not own.

FOR EACH OF THE ${options.clipCount} CLIPS YOU RECEIVE:
• FRAME — the prompt the still was made from: who is where, and what is around them.
• LINE — what is spoken in the clip.
• PLANNED ACTION — what ${options.subject} ${does} in this clip, and whether and where they walk. Keep it; make it specific to THIS frame.
• CAMERA — the camera move, already decided. You never change it, and your action must suit it.

WRITE, PER CLIP, ONE "action": one or two sentences, at most ${options.twoHander ? 60 : 45} words, present tense — what ${options.subject} physically ${does} across the 8 seconds, with natural gestures and body language matched to the line.
• SPECIFIC TO THE FRAME: the real floor they walk on, the counter or display they pass, the product they lift or the place they present — naming an object only when the FRAME puts it in view; otherwise "the counter beside her", "the shelves they pass".
• A WALK (when the PLANNED ACTION walks): a slow, natural walk on the floor the frame shows, the way the PLANNED ACTION says — toward the camera, along the counter, display or shelves beside them, or a few steps to the product beside them — talking as they go, glancing at and gesturing toward what they pass. Never to a door, an entrance or an exit, never outside, never behind, around, over or onto furniture, never across the whole place, never away from the camera, never running, never walking backward.${options.twoHander ? " A pair walks only together, side by side at the same pace — say \"both\", \"together\" or \"side by side\" — along or across the floor; never toward the camera, never one of them alone, never one ahead." : ""}
• IN PLACE (when the PLANNED ACTION says "no steps"): turns of the body and head, a sweeping arm, the hands presenting, lifting or pointing to what is within reach, an expressive face. No steps.${options.twoHander ? `
• A PAIR: the one who speaks first leads the action while speaking and the other reacts; then the other answers with their own gesture while the first reacts. Neither leans or moves toward the camera, rises onto the toes, jumps or stretches.` : ""}${options.walksWhenNeeded ? `
• THEY WALK ONLY WHERE THE PLANNED ACTION WALKS — in a clip whose words take them somewhere. Every step makes the video model redraw their bodies, which is how their heights and outfits changed. In every other clip they perform where they stand, and the life is in their upper bodies, hands and faces: the one speaking reacts or explains with the whole upper body and both hands, the other answers calmly; they turn to each other and to the camera, and point to or present what is within reach.` : ""}
• They may greet or gesture to people the FRAME already shows; never add anyone.
• Refer to them exactly as the PLANNED ACTION does — "she", "he" or their names — never "the model".
• Never describe a face, hair, clothes, the room or the light — they come from the frame. Never name a camera move or a shot. Never quote anything — not the spoken words, not a sign or a label.
• Nothing appears, vanishes or moves by itself, and no hand or body passes through an object.
• The last clip invites the viewer in — open palms, a come-in gesture, a nod. No wave of any kind, in any clip.${options.performer === "deity" ? `
• A deity never walks. A deity moves slowly and majestically, and every gesture is a blessing — never touching, holding, pointing at or presenting products, money or a phone.` : ""}${options.characterDirection ? `

${options.characterDirection}

Use that direction for HOW they perform — their manner, gestures and expressions. The PLANNED ACTION always decides whether and where they move.` : ""}

Return ONLY a JSON array, one object per clip, in clip order, no markdown:
[
  { "clip": 1, "action": "" }
]`;
};

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
        // "path" is the field's old name; a model that still writes it is read the same way.
        const action = typeof row.action === "string" ? row.action : typeof row.path === "string" ? row.path : undefined;
        out[index] = { action };
      }
    });
  } catch {
    // Unusable reply: every clip falls back to its plan, which is still an alive, directed shot.
  }
  return out;
}
