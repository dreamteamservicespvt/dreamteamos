import { describe, it, expect } from "vitest";
import {
  CAMERA_MOVES, SHOT_ANGLES, STAGINGS, PAIR_MOVES, VEO_FRAME_LOCK, LEGACY_VEO_FRAME_LOCK, MOTION_COMPOSITION_HEADING,
  SCALE_ANCHOR_HEADING, VEO_DIRECTION_SYSTEM_PROMPT, assembleVeoPrompt, cameraLabel, cameraShot, castKindOf, clipRoles,
  compositionFor, fillCast, framingForMotion, lineNeedsWalk, pairNamesOf, parseVeoDirections, planClipMotion, resolveDirection,
  speechAccentFor, spokenLinesIn, stagingForLine, stagingKeyOf, stagingPath, walkHint, withMotionComposition,
  withScaleAnchor, withoutApproach, withoutQuotedSpeech, withoutStillness, withoutTravel,
  type ClipMotionPlan, type MotionChoice, type Performer,
} from "@/services/prompts/motion";
import { SCENE_PLAN_SYSTEM_PROMPT } from "@/services/prompts/scenePlan";
import { HERO_FRAME_POSE, MULTI_FRAME_SYSTEM_PROMPT, VEO_SEGMENT_SYSTEM_PROMPT, modelVeoSubject } from "@/services/prompts";
import {
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT, characterDirectionBlock, packPerformer,
  packVeoSubject,
} from "@/services/prompts/characterAd";
import { getCharacterPack, packSpeakers } from "@/services/characterPacks";
import { formatDialogueScript, parseDialogueClips } from "@/utils/dialogueFormat";
import { motionChoicesOf, parseScenePlan } from "@/utils/scenePlan";
import { veoEditProblems } from "@/utils/veoRefine";

/**
 * Every clip is a real commercial shot (2026-10-05, the dynamic pass): a physical action that travels or
 * turns, and ONE camera move that follows it — never a talking portrait. One presenter walks toward the
 * camera, along the display, to the product; a pair (people, children or Motu and Patlu) walks only
 * together, side by side, along or across the floor, filmed only from the side at one distance; a deity
 * never walks; a client's photo is never shown beyond its edges. The camera NEVER moves backward (the
 * owner: "no walk-back, never do it"). The prompt is five short parts, never describes the frame and never
 * names a place it must not show. Nobody waves goodbye. (That morning's prompts were static: one tiny walk
 * per ad, a locked camera for every pair, and a keep sentence that froze the picture.)
 *
 * The one exception (2026-10-10): Motu and Patlu walk only in a clip whose words take them somewhere — walking
 * redrew them, and their heights and clothes drifted. See "Motu and Patlu walk only where a clip's words need it".
 *
 * 2026-10-22 (the owner: "unwanted, irrelevant movements and turning or rotating"; prompts/motion history 8): the
 * Motu and Patlu rule is now EVERY cast's — a clip walks only where its own words take the cast somewhere, and every
 * other clip is its beat performed where they stand, facing the camera, each gesture on its words. The arc shot is
 * retired, nobody turns round, and the festival namaskaram is placed by code ON the wish words (wishCue,
 * utils/wishGesture). The tests that asserted "most clips walk" now assert that rule; the walking cases use lines
 * that do take the cast somewhere (WALK_LINES).
 */

/** A move that shows MORE than the still, or moves the camera backward — what built the invented shops (history 2 and 4), and what the owner banned. */
const NEVER_MOVES = /\b(?:walk[- ]?back|pull(?:s|ed|ing)?[- ]?(?:back|out)|dolly(?:ing)?[- ]out|zoom(?:s|ing)? out|crane|pedestal|orbit|pans?|panning|tilts?|drone|360|backwards?|moving back|moves back|retreat(?:s|ing)?)\b/i;

/** The words that held the morning's videos still (history 6). */
const STILL_WORDS = /animates the attached frame|camera fixed|\bLocked\b|same positions|for the whole clip|two or three (?:relaxed )?steps|rack focus|gentle float|handheld float/i;

/** Walking words. */
const WALK_WORDS = /\b(?:walks?|walking|steps? (?:toward|forward|closer)|approach(?:es|ing)?)\b/i;

const GOODBYE = /\b(?:wav(?:e|es|ing) (?:goodbye|bye)|bye-bye|farewell wave)\b/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

const PERFORMERS: Performer[] = ["person", "cartoon", "deity"];

/**
 * The moves that move the camera — everything but the still camera of a client's photo. 2026-10-22: the arc is
 * retired (it read as the presenter rotating) — no plan picks it, so it is no longer one of them.
 */
const MOVING = ["push_in", "side_track", "lateral_dolly"];

/**
 * Lines whose words take one presenter somewhere (lineNeedsWalk) — since 2026-10-22 the only clips that walk.
 * Clip 3's ("Trusted for years.") does not, so it stays where she stands.
 */
const WALK_LINES = ["Come with me, let's go inside!", "Follow me to the counter.", "Trusted for years.", "Let's go in — come this way, please."];
/** The same for a pair: clip 1 and the last clip walk them, clips 2–3 do not. */
const PAIR_WALK_LINES = ["Come with me, let's go along the racks!", "b", "c", "Let's go inside, come this way!"];

/** A body turn — round, to or away from the lens; a turn of the palm, head or hand is a gesture (motion TURNS). */
const BODY_TURN = /\bturn(?:s|ed|ing)?\b(?!\s+(?:the|her|his|their|its)\s+(?:palm|palms|head|hand|hands)\b)/i;

describe("what each clip is for", () => {
  it("opens with the message and closes with the call to action", () => {
    expect(clipRoles(4, "commercial")).toEqual(["message", "proof", "trust", "cta"]);
    expect(clipRoles(3, "commercial")).toEqual(["message", "proof", "cta"]);
    expect(clipRoles(2, "commercial")).toEqual(["message", "cta"]);
    expect(clipRoles(1, "commercial")).toEqual(["message_cta"]);
  });

  it("gives a festival ad its wish first and its message second", () => {
    expect(clipRoles(4, "festival")).toEqual(["wish", "message", "proof", "cta"]);
    expect(clipRoles(2, "festival")).toEqual(["wish", "message_cta"]);
  });
});

describe("every clip moves — the anti-static rule", () => {
  it("sorts the cast: one presenter, a deity, a real pair, a drawn pair", () => {
    expect(castKindOf("person")).toBe("single");
    expect(castKindOf("cartoon")).toBe("single");
    expect(castKindOf("deity")).toBe("deity");
    expect(castKindOf("person", true)).toBe("pair");
    expect(castKindOf("cartoon", true)).toBe("drawn_pair");
    expect(castKindOf("deity", true)).toBe("drawn_pair");
  });

  // 2026-10-22: no "most clips walk" any more — none of these plans has a line that takes anyone anywhere, so every
  // clip is its beat performed where they stand, still a filmed shot: a camera that moves, or (only in the client's
  // own photo) a still camera on a pair performing where it stands. The arc is never planned.
  it("gives every clip a real action and a camera that follows it — every cast, length, ad type and photo mix", () => {
    for (const performer of PERFORMERS) for (const twoHander of [false, true]) for (const adType of ["commercial", "festival"]) {
      for (let n = 1; n <= 8; n++) {
        for (const photos of ["none", "all", "mixed"] as const) {
          const plates = Array.from({ length: n }, (_, i) => photos === "all" || (photos === "mixed" && i % 2 === 1));
          const plan = planClipMotion(n, adType, performer, { twoHander, plates });
          const kind = castKindOf(performer, twoHander);
          const pair = kind === "pair" || kind === "drawn_pair";
          const label = `${performer}${twoHander ? " pair" : ""} ${adType} ${n} ${photos}`;
          expect(plan, label).toHaveLength(n);
          for (const clip of plan) {
            const at = `${label}, clip ${clip.clip + 1}`;
            // Never a talking portrait: the camera moves — or, only in the client's own photograph, a still camera
            // films a walk or a pair performing where it stands (their own performance carries the shot).
            expect(MOVING.includes(clip.camera.key) || (clip.plate && clip.camera.key === "static_locked"), at).toBe(true);
            if (clip.camera.key === "static_locked") expect(clip.walks || pair, at).toBe(true);
            expect(clip.camera.key, at).not.toBe("arc");
            // The camera never moves backward and never shows more than the still.
            expect(cameraShot(clip, "She"), at).not.toMatch(NEVER_MOVES);
            expect(clip.camera.action, at).not.toMatch(NEVER_MOVES);
            // No line takes them anywhere, so nobody walks — every cast, the deity and the greeting included.
            expect(clip.walks, at).toBe(false);
            expect(clip.staging.walks, at).toBe(false);
            expect(clip.walksWhenNeeded, at).toBe(true);
            if (pair) {
              expect(PAIR_MOVES, at).toContain(clip.camera.key);
              expect(clip.angle.key, at).toBe("eye_level");
              expect(clip.staging.key, at).not.toBe("walk_toward");
            }
            if (clip.plate) expect(["push_in", "static_locked"], at).toContain(clip.camera.key);
          }
        }
      }
    }
  });

  // 2026-10-22: the same beats — each performed where they stand unless its words walk them.
  it("opens the ad speaking to the camera and closes inviting the viewer in — on a walk only when the words walk — never a goodbye", () => {
    expect(planClipMotion(4, "commercial")[0].staging.key).toBe("walk_toward");
    expect(planClipMotion(4, "commercial", "cartoon")[0].staging.key).toBe("walk_toward");
    expect(planClipMotion(4, "commercial", "person", { twoHander: true })[0].staging.key).toBe("walk_across");
    expect(planClipMotion(4, "commercial", "cartoon", { twoHander: true })[0].staging.key).toBe("walk_across");
    expect(planClipMotion(4, "commercial", "deity")[0].staging.key).toBe("turn_present");
    expect(planClipMotion(4, "commercial")[0].staging.name).toBe("Speak to the camera");
    expect(planClipMotion(4, "commercial").at(-1)!.staging.name).toBe("Invite where they stand");
    const walking = planClipMotion(4, "commercial", "person", { lines: WALK_LINES });
    expect(walking[0].staging.name).toBe("Walk toward the camera");
    expect(walking.at(-1)!.staging.name).toBe("Walk in and invite");
    for (const performer of PERFORMERS) for (const twoHander of [false, true]) {
      const plan = planClipMotion(4, "commercial", performer, { twoHander });
      expect(plan.at(-1)!.staging.key).toBe("walk_invite");
      expect(stagingPath(plan.at(-1)!, "She", twoHander, { a: "A", b: "B" })).toMatch(/never a (?:goodbye )?wave/);
    }
  });

  // 2026-10-22 (the owner: "when she is saying the wishes, the cast need to do the namaskaram … exactly when she is
  // saying"): the greeting faces the camera with the hands relaxed — no namaste in the action, no turn, no walk — and
  // the namaskaram is added by code ON the wish words (wishCue). It used to open the clip, seconds before the wish.
  it("greets a festival facing the camera, the hands relaxed until the wish — the namaskaram comes on the wish words", () => {
    const single = planClipMotion(4, "festival");
    expect(single[0].staging.key).toBe("turn_present");
    expect(single[0].staging.name).toBe("Greet the viewer");
    expect(single[0].walks).toBe(false);
    expect(MOVING).toContain(single[0].camera.key);
    const greeting = stagingPath(single[0], "She");
    expect(greeting).toBe("She faces the camera with a warm, festive smile and greets the viewer, the hands relaxed until the wish");
    expect(greeting).not.toMatch(/namaste|namaskar|\bbow|\bturns?\b/i);
    const pair = planClipMotion(4, "festival", "person", { twoHander: true });
    expect(pair[0].walks).toBe(false);
    expect(pair[0].staging.name).toBe("Greet the viewer");
    // Even words that would walk them leave the greeting where they stand.
    expect(planClipMotion(4, "festival", "person", { twoHander: true, lines: ["Come, let's go inside!", "b", "c", "d"] })[0].walks).toBe(false);
    expect(stagingPath(pair[0], "x", true, { a: "Priya", b: "Kavya" })).toBe("both stand side by side facing the camera with festive smiles; Priya greets the viewer while Kavya listens and smiles, the hands relaxed until the wish");
    // The greeting's still: the hands relaxed, NOT yet joined — a still in namaskaram makes Veo hold it all clip.
    expect(compositionFor(single[0])).toContain("standing facing the camera with a warm, festive smile, the hands relaxed at the waist — not yet joined");
    expect(compositionFor(pair[0])).toContain("facing it with festive smiles, the hands relaxed — not yet joined");
    // The one-clip ad speaks where it stands — and walks only when its words take him somewhere.
    expect(stagingPath(planClipMotion(1, "commercial")[0], "He")).toBe("He faces the camera and speaks warmly, an open palm on the business name, and ends by opening both palms toward the viewer in an invitation and a nod — never a goodbye wave");
    expect(stagingPath(planClipMotion(1, "commercial", "person", { lines: ["Come with me, let's go inside!"] })[0], "He")).toContain("He walks slowly toward the camera talking warmly, with an open palm on the business name");
  });
});

describe("the motion plan", () => {
  // 2026-10-22: the beat is still read from the line; it is performed where she stands unless the words walk her.
  it("reads each line for what it asks: a product to show, the place to present, a promise to explain", () => {
    expect(stagingForLine("See our new silk saree collection.", "proof", "person")).toBe("approach_show");
    expect(stagingForLine("మా కొత్త కలెక్షన్ చూడండి.", "proof", "person")).toBe("approach_show");
    expect(stagingForLine("Come inside our big showroom.", "proof", "person")).toBe("walk_across");
    expect(stagingForLine("Come inside our big showroom.", "proof", "deity")).toBe("turn_present");
    expect(stagingForLine("Trusted by families for twenty years.", "proof", "person")).toBe("walk_stop_present");
    expect(stagingForLine("anything", "trust", "person")).toBe("walk_stop_present");
    expect(stagingForLine("anything", "wish", "person")).toBe("turn_present");
    // Clip 1 takes the short glide it was given, so the product clip takes the push-in to a close-up of the product
    // — where she stands, and she looks (never turns) back to the lens (2026-10-22).
    const product = planClipMotion(3, "commercial", "person", {
      lines: ["Namaste.", "See our gold jewellery designs.", "Visit us."], choices: [{ camera: "lateral_dolly" }, { camera: "push_in" }],
    });
    expect(product[1].staging.key).toBe("approach_show");
    expect(product[1].staging.name).toBe("Show it where they stand");
    expect(product[1].walks).toBe(false);
    expect(cameraShot(product[1], "She")).toBe("Smooth, steady push-in from a three-quarter shot to a close-up of the product, the focus settling on her face as she looks back to the lens");
    expect(product[1].lens).toBe("50mm");
    expect(stagingPath(product[1], "She")).toBe("She stands right beside the product or display, facing the camera, and shows it with an open hand — or lifts it a little toward the camera — on the words about it, keeping her face to the viewer");
    // A scene plan's "arc" is never planned (retired 2026-10-22).
    expect(planClipMotion(3, "commercial", "person", { choices: [{ camera: "arc" }, { camera: "arc" }, { camera: "arc" }] }).some((c) => c.camera.key === "arc")).toBe(false);
  });

  it("takes the scene plan's choices where this cast may use them — and reads a plan saved before the dynamic pass", () => {
    const plan = planClipMotion(5, "commercial", "person", {
      choices: [
        { staging: "approach_show", camera: "arc", angle: "low_angle" },
        { staging: "walk_and_talk", camera: "tracking" },
        { staging: "show_product", camera: "rack_focus", angle: "high_angle" },
        { staging: "nonsense", camera: "crane_down", angle: "worms_eye" },
        { staging: "stand_present" },
      ],
    });
    expect(plan[0].staging.key).toBe("approach_show");
    // 2026-10-22: the arc is retired — no table offers it, so the scene plan's "arc" gives way to the first move this
    // clip may take where she stands; a SAVED plan's arc is filmed as the short glide (cameraShot).
    expect(plan[0].camera.key).toBe("push_in");
    expect(plan.some((c) => c.camera.key === "arc")).toBe(false);
    expect(cameraShot({ ...plan[0], camera: CAMERA_MOVES.arc }, "She")).toBe(cameraShot({ ...plan[0], camera: CAMERA_MOVES.lateral_dolly }, "She"));
    expect(cameraShot({ ...plan[0], camera: CAMERA_MOVES.arc }, "She")).toContain("the camera gliding a short way sideways at one distance, her seen from the same angle throughout");
    expect(plan[0].angle.key).toBe("low_angle");
    // A saved walk is today's walk toward the camera — and the saved walk-back camera is never used.
    expect(plan[1].staging.key).toBe("walk_toward");
    expect(MOVING).toContain(plan[1].camera.key);
    expect(plan[2].staging.key).toBe("approach_show");
    expect(plan[2].angle.key).toBe("high_angle");
    expect(Object.keys(STAGINGS)).toContain(plan[3].staging.key);
    expect(plan[3].angle.key).toBe("eye_level");
    expect(plan[4].staging.key).toBe("walk_invite");
    expect(stagingKeyOf("present_space")).toBe("walk_across");
    expect(stagingKeyOf("welcome_invite")).toBe("walk_invite");
    expect(stagingKeyOf("stand_present")).toBe("walk_stop_present");
    expect(stagingKeyOf(" turn_present ")).toBe("turn_present");
    expect(stagingKeyOf("tracking")).toBeNull();
    expect(stagingKeyOf(undefined)).toBeNull();
  });

  // 2026-10-22: a cast filmed where it stands has fewer moves. One presenter and a deity alternate a push-in with a
  // short glide; a pair standing in AI scenes has ONE move — the short glide that keeps both at one angle — so it
  // repeats (the rule: avoid the neighbour's move wherever another is available).
  it("never stages two neighbouring clips the same way, and never films them the same way where the cast has another move", () => {
    for (const performer of PERFORMERS) for (const twoHander of [false, true]) for (const n of [2, 3, 4, 6, 8, 15]) {
      const plan = planClipMotion(n, "commercial", performer, { twoHander });
      for (let i = 1; i < plan.length; i++) {
        const label = `${performer}${twoHander ? " pair" : ""} ${n}, clip ${i + 1}`;
        expect(plan[i].staging.key, label).not.toBe(plan[i - 1].staging.key);
        if (twoHander) expect(plan[i].camera.key, label).toBe("lateral_dolly");
        else expect(plan[i].camera.key, label).not.toBe(plan[i - 1].camera.key);
      }
    }
    // A pair whose words walk them is filmed travelling with them on those clips, gliding past them on the others.
    expect(planClipMotion(4, "commercial", "person", { twoHander: true, lines: PAIR_WALK_LINES }).map((c) => c.camera.key))
      .toEqual(["side_track", "lateral_dolly", "lateral_dolly", "side_track"]);
    // One presenter in the client's photo: a push-in where she stands (the only move there) — and a still camera only
    // on the clips her words walk, so those still alternate.
    const photo = planClipMotion(6, "commercial", "person", { plates: [true, true, true, true, true, true] });
    expect(photo.every((c) => c.camera.key === "push_in" && !c.walks)).toBe(true);
    const walkingPhoto = planClipMotion(4, "commercial", "person", { lines: WALK_LINES, plates: [true, true, true, true] });
    expect(walkingPhoto.map((c) => c.camera.key)).toEqual(["push_in", "static_locked", "push_in", "static_locked"]);
    for (let i = 1; i < walkingPhoto.length; i++) expect(walkingPhoto[i].camera.key, `photo clip ${i + 1}`).not.toBe(walkingPhoto[i - 1].camera.key);
  });

  it("is the same every time, so a regenerated clip keeps its shot", () => {
    const lines = ["a", "our collection", "years of trust", "d", "e"];
    const plates = [false, true, false, true, false];
    expect(planClipMotion(5, "commercial", "person", { lines, plates })).toEqual(planClipMotion(5, "commercial", "person", { lines, plates }));
  });

  it("follows the speaker in a pair — the framing drifts toward them, never closer; a still camera cannot", () => {
    expect(planClipMotion(4, "commercial", "cartoon", { twoHander: true }).every((c) => c.focus === "speaker")).toBe(true);
    expect(planClipMotion(4, "commercial", "cartoon", { twoHander: true, plates: [true, true, true, true] }).every((c) => c.focus === "both")).toBe(true);
    expect(planClipMotion(4, "commercial").every((c) => c.focus === "both")).toBe(true);
  });

  /**
   * Motu and Patlu grew in the finished videos because the pair was filmed with dolly-ins, push-ins,
   * cranes, a low-angle orbit and a camera easing in on the speaker — every one of them changes the
   * pair's size on screen, and a video model re-draws a cartoon body as the view changes. Sideways moves
   * at one distance keep both the size the frame has them.
   */
  it("films a pair only from the side at one distance, at eye level — whatever the scene plan asks", () => {
    const choices = [
      { camera: "orbit", angle: "low_angle" }, { camera: "push_in" }, { camera: "arc", angle: "worms_eye" },
      { camera: "tracking" }, { staging: "walk_toward" }, null,
    ];
    for (const performer of ["cartoon", "person"] as Performer[]) {
      for (const clip of planClipMotion(6, "commercial", performer, { twoHander: true, choices: choices as never })) {
        expect(["side_track", "lateral_dolly"]).toContain(clip.camera.key);
        expect(clip.angle.key).toBe("eye_level");
        expect(clip.staging.key).not.toBe("walk_toward");
        expect(clip.twoHander).toBe(true);
      }
    }
    expect(PAIR_MOVES).toEqual(["side_track", "lateral_dolly", "static_locked"]);
  });

  it("keeps every move and action inside what the frame shows — and nothing ever moves backward", () => {
    expect(Object.keys(CAMERA_MOVES)).toEqual(["push_in", "side_track", "lateral_dolly", "arc", "static_locked"]);
    expect(Object.keys(STAGINGS)).toEqual(["walk_toward", "walk_across", "approach_show", "walk_stop_present", "turn_present", "walk_invite"]);
    for (const move of Object.values(CAMERA_MOVES)) {
      expect(move.lens, move.key).toMatch(/^\d+mm$/);
      expect(move.speed, move.key).toBeTruthy();
      expect(move.action, move.key).not.toMatch(NEVER_MOVES);
    }
    for (const staging of Object.values(STAGINGS)) {
      for (const template of [staging.path, staging.pairPath, staging.deityPath ?? "", staging.start, staging.pairStart]) {
        const text = fillCast(template, "She");
        expect(text, staging.key).not.toMatch(/\b(?:door|entrance|outside|street|road|around the)\b/i);
        expect(text, staging.key).not.toMatch(NEVER_MOVES);
      }
      // A walking action walks; one performed in place — and every deity's — never does.
      expect(WALK_WORDS.test(fillCast(staging.path, "She")), staging.key).toBe(staging.walks);
      expect(fillCast(staging.deityPath ?? "", "Ganesha"), staging.key).not.toMatch(WALK_WORDS);
      // A pair always moves together, never toward the camera.
      if (staging.walks) expect(staging.pairPath, staging.key).toMatch(/\bboth\b[^;]*\bside by side\b/);
      expect(staging.pairPath, staging.key).not.toMatch(/\b(?:walks?|steps?) (?:\w+ ){0,3}toward the camera\b/);
      // 2026-10-22: the same beat performed where they stand never walks, and no action turns the body — a turn of
      // the palm or the head is a gesture (history 8: "turning or rotating").
      for (const template of [staging.inPlace?.path, staging.inPlace?.start, staging.pairInPlace?.pairPath, staging.pairInPlace?.pairStart]) {
        if (template) expect(fillCast(template, "She"), staging.key).not.toMatch(WALK_WORDS);
      }
      for (const template of [staging.path, staging.pairPath, staging.deityPath ?? "", staging.inPlace?.path ?? "", staging.pairInPlace?.pairPath ?? ""]) {
        expect(fillCast(template, "She"), staging.key).not.toMatch(BODY_TURN);
      }
      // Every beat but turn_present (already in place) has its in-place form for one performer.
      if (staging.key !== "turn_present") expect(staging.inPlace?.name, staging.key).toBeTruthy();
    }
    expect(Object.keys(SHOT_ANGLES)).toEqual(["eye_level", "low_angle", "high_angle"]);
    expect(planClipMotion(4, "commercial", "deity")[1].gesture).toContain("never touching, holding or presenting it");
  });

  it("writes the action for whoever performs, with the right pronouns, names and the clip's own role", () => {
    const plan = planClipMotion(4, "commercial");
    // 2026-10-22: no line walks her, so clip 1 is spoken where she stands; words that take her somewhere walk her.
    expect(stagingPath(plan[0], "She")).toBe("She stands facing the camera and speaks straight to the viewer — an open palm on the business name, then the hand settles, with a warm smile and eye contact");
    expect(stagingPath(planClipMotion(4, "commercial", "person", { lines: WALK_LINES })[0], "She")).toMatch(/^She walks slowly toward the camera across the open floor, facing the lens and talking naturally/);
    expect(fillCast(STAGINGS.walk_across.path, "He")).toContain("He walks slowly along the counter, display or shelves beside him");
    // turn_present keeps its key (a saved plan carries it) but no longer turns: "Present where they stand".
    expect(STAGINGS.turn_present.name).toBe("Present where they stand");
    expect(fillCast(STAGINGS.turn_present.path, "Both characters", true)).toBe("Both characters stand facing the camera and present the business's real counter, shelves or work area beside them with one open hand as they speak about it, then bring the hand to the chest and open the palm toward the viewer");
    const pair = planClipMotion(4, "commercial", "person", { twoHander: true });
    expect(stagingPath(pair[0], "x", true, { a: "Priya", b: "Kavya" })).toBe("both stand side by side beside the counter, display or shelves, bodies angled toward the camera — Priya sweeps a whole open hand along what is beside them and talks while Kavya reacts; then Kavya answers with one calm open palm toward it while Priya reacts");
    // Walking, the pair faces the camera — no more "gestures toward what they pass" (2026-10-22).
    const walkingPair = planClipMotion(4, "commercial", "person", { twoHander: true, lines: PAIR_WALK_LINES });
    expect(stagingPath(walkingPair[0], "x", true, { a: "Priya", b: "Kavya" })).toBe("both walk slowly side by side along the counter, display or open floor beside them, facing the camera — Priya talks while Kavya listens and reacts; then Kavya answers with an open palm toward what the line is about while Priya reacts");
    const deity = planClipMotion(4, "commercial", "deity");
    expect(stagingPath(deity[0], "Ganesha")).toBe("Ganesha sweeps the blessing palm slowly over the place, then turns the palm toward the viewer");
    // A deity's clips are named as blessings — the 🎬 note on its frame never asks it to walk.
    expect(deity.map((c) => c.staging.name)).toEqual(["Bless the place", "Bless what it offers", "Bless the place", "Bless and welcome"]);
    expect(deity.every((c) => !c.staging.walks && !c.walks)).toBe(true);
  });
});

describe("frames built for each clip's action — caught mid-gesture, mid-step only where the words walk", () => {
  const lines = ["Namaste.", "Come inside our showroom.", "Trusted for years.", "Visit us."];
  const plan = planClipMotion(4, "commercial", "person", { lines });
  const modelFrame = (p: ClipMotionPlan[] = plan) =>
    MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, lines, "", "female", "", false, "", undefined, p);

  // 2026-10-22: none of these lines walks her ("Come inside our showroom" is an invitation to the viewer), so every
  // frame stands her facing the camera, mid-gesture; a clip whose words take her somewhere is caught mid-step.
  it("composes each frame for its own clip — standing facing the camera mid-gesture, the product in view, mid-step only where the words walk", () => {
    expect(plan.map((c) => c.staging.key)).toEqual(["walk_toward", "walk_across", "walk_stop_present", "walk_invite"]);
    expect(plan.map((c) => c.staging.name)).toEqual(["Speak to the camera", "Present the display", "Explain to the camera", "Invite where they stand"]);
    const p = modelFrame();
    expect(p).toContain("FRAMES BUILT FOR MOTION (EACH FRAME IS THE FIRST MOMENT OF ITS CLIP)");
    expect(p).toContain("every clip is a filmed shot from a real commercial: the ambassador PERFORMS the line where she stands, facing the camera");
    expect(p).toContain("never turning round");
    expect(p).toContain("caught MID-GESTURE, never a stiff, posed stance");
    expect(p).not.toContain("A WALK NEEDS ITS FLOOR");
    expect(p).toContain("THE THING TO SHOW IN VIEW");
    expect(p).toContain("INSIDE THE BUSINESS, ALWAYS");
    expect(p).not.toMatch(/nobody walks|always in place|two or three steps|rack focus|gentle float|front-clasp|every clip MOVES|a short arc|or an arc/i);
    for (const clip of plan.slice(1)) {
      expect(p).toContain(framingForMotion(clip));
      expect(p).toContain(`🧍 POSE: ${clip.staging.start}`);
    }
    expect(framingForMotion(plan[1])).toContain("three-quarter body (head to knees) standing facing the camera right beside the real counter, display or shelves");
    expect(framingForMotion(plan[1])).toContain("never a stiff, posed stance");
    expect(framingForMotion(plan[1])).not.toMatch(/mid-step/);
    // Words that take her somewhere: those clips walk, caught mid-step, and the frame asks for their floor.
    const walking = planClipMotion(4, "commercial", "person", { lines: WALK_LINES });
    const w = modelFrame(walking);
    expect(w).toContain("WALKS only in a clip whose 🎬 note walks (her words take her somewhere)");
    expect(w).toContain("A WALK NEEDS ITS FLOOR");
    expect(framingForMotion(walking[1])).toContain("the full figure caught mid-step from a three-quarter front angle");
  });

  it("asks for no floor when no clip walks", () => {
    expect(modelFrame(planClipMotion(4, "commercial", "deity", { lines }))).not.toContain("A WALK NEEDS ITS FLOOR");
  });

  // Clip 1's image is the face every later frame is matched to — an open pose. 2026-10-22: facing the camera, the
  // weight relaxed — no longer "caught as if about to step forward", which starts a walk the line may not call for.
  it("keeps the hero framing on clip 1 in an open pose facing the camera, never the front-clasp", () => {
    const p = modelFrame();
    expect(p).toContain(`🎬 THIS CLIP: ${plan[0].staging.name} — filmed ${cameraLabel(plan[0])}. Keep the hero framing and pose exactly`);
    expect(p).toContain(HERO_FRAME_POSE);
    expect(p).not.toContain("front-clasp");
    expect(HERO_FRAME_POSE).toContain("a natural, open welcoming pose facing the camera");
    expect(HERO_FRAME_POSE).not.toMatch(/step forward|weight on one foot/);
  });

  it("leaves a frame prompt without a plan exactly as before", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, ["a", "b", "c", "d"], "", "female", "", false, "");
    expect(p).not.toContain("FRAMES BUILT FOR MOTION");
    expect(p).not.toContain("🎬");
    expect(p).toContain("Mandatory direct eye contact to the camera while holding this new pose");
  });

  // 2026-10-22: every pack — not only Motu and Patlu — performs WHERE it stands, facing the camera, caught mid-gesture,
  // and walks only in a clip whose 🎬 note walks; no pack is told any more that "every clip MOVES" or to TURN.
  it("does the same for a character pack — every cast stands facing the camera mid-gesture, mid-step only where a clip walks; a deity blesses in place", () => {
    const options = { segmentCount: 4, clipSummaries: lines, locationMode: "ai_generated", locationPlan: "", aspectRatio: "9:16", adType: "commercial" } as const;
    const motu = planClipMotion(4, "commercial", "cartoon", { twoHander: true, lines });
    const drawn = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack("duo_motu_patlu")!, { ...options, motionPlan: motu });
    expect(drawn).toContain("Motu and Patlu perform each\nclip WHERE they stand, side by side, beside what its line is about, facing the camera");
    expect(drawn).toContain("caught MID-GESTURE");
    expect(drawn).toContain("standing side by side as each clip's 🎬 note says");
    expect(drawn).not.toMatch(/every clip MOVES|caught MID-MOVEMENT|caught mid-step side by side as each|TURN to present/);
    expect(drawn).toContain(compositionFor(motu[1]));
    expect(compositionFor(motu[1])).toContain("both standing side by side at the same distance from the camera");
    // Their words walk them in clip 2 only: that frame is caught mid-step.
    const motuWalks = planClipMotion(4, "commercial", "cartoon", { twoHander: true, lines: ["a", "Let's go inside!", "c", "d"] });
    expect(compositionFor(motuWalks[1])).toContain("both caught mid-step side by side at the same distance from the camera");
    const solo = planClipMotion(4, "commercial", "cartoon", { lines });
    const single = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack("solo_motu")!, { ...options, motionPlan: solo });
    expect(single).toContain("clip IN PLACE, standing beside what its line is about, facing the camera");
    expect(single).not.toMatch(/WALK through the place|every clip MOVES/);
    const ganesha = planClipMotion(4, "commercial", "deity", { lines });
    const deity = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack("god_ganesha")!, { ...options, motionPlan: ganesha });
    expect(deity).not.toContain("WALK through the place");
    expect(deity).not.toContain("TURN to present the place");
    expect(deity).toContain("clip IN PLACE, standing beside what its line is about, facing the camera");
    expect(compositionFor(ganesha[0])).toContain("a graceful blessing pose caught mid-gesture");
  });
});

// The frame model dropped the composition note on most continuation frames when merely asked.
describe("the composition stamped onto every frame", () => {
  const plan = planClipMotion(4, "commercial");

  it("adds the clip's action, camera and a mid-movement composition", () => {
    const stamped = withMotionComposition("A woman at the counter.", plan[1]);
    expect(stamped).toBe(`A woman at the counter.\n\n${MOTION_COMPOSITION_HEADING}: ${plan[1].staging.name} (${cameraLabel(plan[1])}) — ${compositionFor(plan[1])}. Caught mid-movement, like a candid frame from a premium commercial — never a stiff, posed stance.`);
  });

  it("keeps a hero pose and adds only what the camera move needs", () => {
    const stamped = withMotionComposition("The hero frame.", plan[0], { keepPose: true });
    expect(stamped).toBe(`The hero frame.\n\n${MOTION_COMPOSITION_HEADING}: this pose opens the clip (${plan[0].staging.name}, ${cameraLabel(plan[0])}) — ${plan[0].camera.framing}; every object fully inside the frame and clear of the body.`);
  });

  // 2026-10-22: placed into the photo standing, facing the camera — mid-step only on a clip whose words walk them.
  it("keeps a client photo's own framing — the cast placed into it facing the camera, mid-step only where the clip walks", () => {
    const photo = planClipMotion(4, "commercial", "person", { plates: [true, true, true, true] });
    expect(withMotionComposition("A frame.", photo[0], { plate: true })).toContain("the photograph's own framing and camera angle, unchanged; the subject placed into it on the real floor, facing the camera beside what they present");
    const walkingPhoto = planClipMotion(4, "commercial", "person", { lines: WALK_LINES, plates: [true, true, true, true] });
    expect(withMotionComposition("A frame.", walkingPhoto[0], { plate: true })).toContain("the photograph's own framing and camera angle, unchanged; the subject placed into it caught mid-step on open, clear floor, with room to walk and nothing between them and the camera");
    const pairPhoto = planClipMotion(4, "commercial", "cartoon", { twoHander: true, plates: [true, true, true, true] });
    expect(withMotionComposition("A frame.", pairPhoto[0], { plate: true })).toContain("both placed into it side by side at the same distance from the camera, standing on the real floor right beside what the line is about, one hand caught mid-gesture");
    const pairWalks = planClipMotion(4, "commercial", "cartoon", { twoHander: true, lines: PAIR_WALK_LINES, plates: [true, true, true, true] });
    expect(withMotionComposition("A frame.", pairWalks[0], { plate: true })).toContain("both placed into it side by side, caught mid-step on the real floor, with room to walk a few steps across it");
    const deityPhoto = planClipMotion(4, "commercial", "deity", { plates: [true, true, true, true] });
    expect(withMotionComposition("A frame.", deityPhoto[0], { plate: true })).toContain("the subject placed into it on the real floor, facing the camera beside what they present");
  });

  it("never stamps twice, and leaves an empty prompt alone", () => {
    const once = withMotionComposition("A frame.", plan[0]);
    expect(withMotionComposition(once, plan[0])).toBe(once);
    expect(withMotionComposition("", plan[0])).toBe("");
    expect(withMotionComposition("A frame.", undefined)).toBe("A frame.");
  });

  // 2026-10-22: standing, facing the camera, in every clip whose words do not walk them; mid-step only on a walk.
  it("frames a drawn character head to feet, a real person three-quarter, a pair side by side, a deity in place — mid-step only on a walk", () => {
    const cartoon = planClipMotion(4, "commercial", "cartoon");
    expect(compositionFor(cartoon[2])).toContain("the full figure from head to feet standing facing the camera on the real floor");
    expect(compositionFor(plan[2])).toContain("three-quarter body (head to knees) standing facing the camera on the real floor");
    expect(compositionFor(plan[2])).toContain(`shot ${plan[2].angle.name.toLowerCase()} on a ${plan[2].lens} lens`);
    expect(compositionFor(plan[0])).toContain("three-quarter body (head to knees) standing facing the camera on the real floor inside the business, weight relaxed, one hand caught mid-gesture at waist height");
    expect(compositionFor(planClipMotion(4, "commercial", "person", { twoHander: true })[0])).toContain("both standing side by side at the same distance from the camera");
    for (const clip of [...plan, ...cartoon]) expect(compositionFor(clip), clip.staging.key).not.toMatch(/mid-step/);
    // Where the words walk them.
    expect(compositionFor(planClipMotion(4, "commercial", "person", { lines: WALK_LINES })[0])).toContain("the full figure from head to feet, caught mid-step a few steps back from the camera");
    expect(compositionFor(planClipMotion(4, "commercial", "cartoon", { lines: WALK_LINES })[1])).toContain("the full figure caught mid-step");
    expect(compositionFor(planClipMotion(4, "commercial", "person", { twoHander: true, lines: PAIR_WALK_LINES })[0])).toContain("both caught mid-step side by side");
    expect(compositionFor(planClipMotion(4, "commercial", "deity")[0])).toContain("in a graceful blessing pose caught mid-gesture");
  });
});

describe("the Veo prompt", () => {
  const lines = ["Namaste.", "Come inside our showroom.", "Trusted for years.", "Visit us."];
  // 2026-10-22: no line here walks her — every clip is performed where she stands.
  const plan = planClipMotion(4, "commercial", "person", { lines });
  /** The same ad with words that take her somewhere: clips 1, 2 and 4 walk; clip 3 ("Trusted for years.") does not. */
  const walking = planClipMotion(4, "commercial", "person", { lines: WALK_LINES });
  const model = modelVeoSubject("female");
  const line = "శ్రీ సాయి మోటార్స్ లో మీ బైక్ సర్వీస్ అదే రోజు.";
  const build = (direction?: any, clip = 0, spoken = line, p: ClipMotionPlan = plan[clip], language = "Telugu") => assembleVeoPrompt({
    aspectRatio: "9:16", plan: p, direction, identityLock: model.identityLock, language,
    speech: [{ voice: model.voice, line: spoken }], cast: model.cast, castPlural: model.castPlural,
  });
  const motu = packVeoSubject(getCharacterPack("duo_motu_patlu")!);
  // Motu and Patlu walk only where a clip's words take them somewhere (2026-10-10): clip 1's line does, so it walks
  // together along the floor; clips 2–4 are performed where they stand.
  const motuPlan = planClipMotion(4, "commercial", "cartoon", {
    twoHander: true, walksWhenNeeded: true, lines: ["Patlu, let's go inside and see!", "b", "c", "d"],
  });
  const buildMotu = (i: number, direction?: any, language = "Telugu", speech = motu.speech([{ name: "Motu", text: "one" }, { name: "Patlu", text: "two" }])) => assembleVeoPrompt({
    aspectRatio: "9:16", plan: motuPlan[i], direction, identityLock: motu.identityLock, language, speech,
    cast: motu.cast, castPlural: motu.castPlural, twoHander: motu.twoHander, scaleAnchor: motu.scaleAnchor,
    sides: motu.sides, pairNames: motu.pairNames, eyeLevel: motu.eyeLevel,
  });
  /** A clip performed in place — the scene plan chose to turn and present. */
  const turn = planClipMotion(4, "commercial", "person", { choices: [null, { staging: "turn_present" }] })[1];

  // 2026-10-22 (history 8): the life line is gestures on their words with the body facing the camera — "natural body
  // movement throughout" read as licence to move; the keep sentence says where she stands unless the clip walks; the
  // negative adds no turning around or rotating, no turning away, no random or repeated gestures and no morphing.
  it("is five short parts in order — what it is, the camera and the action, the voice, the keep sentence, the negative", () => {
    for (const clip of [...plan, ...walking]) {
      const p = build(null, clip.clip, line, clip);
      const parts = p.split("\n\n");
      const at = `${clip.walks ? "walking" : "in place"} clip ${clip.clip + 1}`;
      expect(parts, at).toHaveLength(5);
      expect(parts[0]).toBe("9:16 vertical video, one continuous 8-second shot that starts from the attached frame.");
      expect(parts[1].startsWith(`${cameraShot(clip, "She")}: she `), parts[1]).toBe(true);
      expect(parts[1], at).toContain(`Calm, purposeful movement: each gesture lands on the words it belongs to, then the hands settle; the body stays facing the camera, with eye contact on the key words — clothes and hair move ${clip.walks ? "with every step" : "naturally"}; anyone already in the background stays in place with only small, natural movements.`);
      expect(parts[1], at).not.toContain("Natural body movement throughout");
      expect(parts[2]).toBe(`With a very sweet, warm, confident female voice, she says in Telugu:\n"${line}"`);
      expect(parts[3], at).toBe(`Keep her exact face, hair, outfit and height, and the same place, logo, colours and light ${VEO_FRAME_LOCK}; ${clip.walks ? "she moves within that place" : "she performs where she stands, facing the camera"}, and nothing new is added to it.`);
      expect(parts[4], at).toBe(`Negative prompt: No text or subtitles on screen, no background music or echo, no cuts, no camera shake, ${clip.walks ? "no frozen or static pose" : "no frozen pose"}, no change of location or background, no unnatural movement, no turning around or rotating, no turning away from the camera, no random or repeated gestures, no morphing, no extra people, no goodbye wave.`);
      expect(spokenLinesIn(p)).toEqual([line]);
    }
  });

  it("never holds the picture still — none of the words that kept the morning's videos static", () => {
    for (const p of [...plan.map((c) => build(null, c.clip)), ...[0, 1, 2, 3].map((i) => buildMotu(i))]) expect(p).not.toMatch(STILL_WORDS);
    expect(build(null, turn.clip, line, turn)).toContain("no frozen pose,");
    expect(build(null, turn.clip, line, turn)).toContain("clothes and hair move naturally");
  });

  it("never moves the camera backward or shows more than the still — every cast, every clip, photo or not", () => {
    for (const performer of PERFORMERS) for (const twoHander of [false, true]) for (const plates of [[], [true, true, true, true]]) {
      for (const clip of planClipMotion(4, "commercial", performer, { twoHander, plates })) {
        const prompt = assembleVeoPrompt({
          aspectRatio: "9:16", plan: clip, identityLock: "their exact look", language: "Telugu",
          speech: twoHander
            ? [{ speaker: "Asha", voice: "a warm voice", line: "one" }, { speaker: "Ravi", voice: "a calm voice", line: "two" }]
            : [{ voice: "a warm voice", line: "one" }],
          cast: twoHander ? "Both people" : "She", castPlural: twoHander, twoHander,
        });
        const label = `${performer}${twoHander ? " pair" : ""}${plates.length ? " photo" : ""} clip ${clip.clip + 1}`;
        expect(prompt, label).not.toMatch(NEVER_MOVES);
        expect(prompt, label).not.toMatch(/\b(?:street|road|footpath|car park|outside|another shop|doorway|ceiling|walls?)\b/i);
        expect(prompt, label).not.toMatch(/THE ATTACHED FRAME —|Background:|SCENE LIFE|FRAME BOUNDARY|WORLD LOCK|\bNo walking\b/);
      }
    }
  });

  /** On 2026-10-05 the prompt was 1,568 words for one presenter and 2,297 for Motu and Patlu. */
  // 2026-10-22: ≤ 190 / ≤ 360 before; the gesture-on-the-words life line and the four new negatives add about twenty
  // words (one presenter 204–228, Motu and Patlu 372–387 measured), and a festival greeting carries its timed
  // namaskaram on top (one presenter about 240 with a one-word line).
  it("is short — every category, every clip", () => {
    for (const n of [2, 4, 6, 8]) {
      for (const p of planClipMotion(n, "commercial")) expect(words(build(null, 0, "x", p)), `model ${n}`).toBeLessThanOrEqual(230);
      for (const p of planClipMotion(n, "commercial", "person", { lines: WALK_LINES })) expect(words(build(null, 0, "x", p)), `model walking ${n}`).toBeLessThanOrEqual(230);
      for (const p of planClipMotion(n, "festival")) expect(words(build(null, 0, "x", p)), `model festival ${n}`).toBeLessThanOrEqual(245);
    }
    for (const i of [0, 1, 2, 3]) expect(words(buildMotu(i)), `motu ${i}`).toBeLessThanOrEqual(390);
  });

  // 2026-10-22: these walk because their words take her somewhere (WALK_LINES); the same beats without such words are
  // performed where she stands.
  it("walks only where the words take her: toward the camera on a push-in, along the display on a side track, the last steps in to invite", () => {
    expect(build(null, 0, line, walking[0])).toContain("Smooth, steady push-in as she comes closer, ending in a medium shot: she walks slowly toward the camera across the open floor");
    expect(build(null, 1, line, walking[1])).toContain("Smooth side-tracking shot from a three-quarter front angle, the camera travelling sideways alongside her, the background sliding past with parallax: she walks slowly along the counter, display or shelves beside her");
    expect(build(null, 3, line, walking[3])).toContain("Smooth, steady push-in as she comes closer, ending in a medium close-up: she walks the last few steps toward the camera and invites the viewer in");
    expect(walking.map((c) => c.walks)).toEqual([true, true, false, true]);
    // Without such words: the same beats where she stands — a push-in or a short glide, no steps.
    expect(build(null, 0)).toContain("Smooth, steady push-in from a three-quarter shot to a medium close-up: she stands facing the camera and speaks straight to the viewer — an open palm on the business name");
    expect(build(null, 1)).toContain("Slow lateral dolly, the camera gliding a short way sideways at one distance, her seen from the same angle throughout, foreground and background sliding gently with parallax: she stands beside the counter, display or shelves, facing the camera, and presents it with one open hand on the words about it");
    for (const clip of plan) expect(build(null, clip.clip).split("\n\n")[1], `clip ${clip.clip + 1}`).not.toMatch(WALK_WORDS);
  });

  it("films a client's photo without showing more of it — a push-in where she stands, a still camera only while she walks — and keeps it as photographed", () => {
    const photo = planClipMotion(4, "commercial", "person", { lines, plates: [true, true, true, true] });
    // 2026-10-22: no line walks her, so every clip is a push-in where she stands.
    for (const c of photo) {
      expect(c.camera.key, `clip ${c.clip + 1}`).toBe("push_in");
      expect(build(null, c.clip, line, c)).toContain(`this real place exactly ${VEO_FRAME_LOCK} shows it — the same layout, fixtures, products, signage, logo, colours and light; she performs where she stands, facing the camera, and nothing new is added to it`);
    }
    expect(build(null, 0, line, photo[0])).toContain("Smooth, steady push-in from a three-quarter shot to a medium close-up: she stands facing the camera and speaks straight to the viewer");
    // Words that walk her: a push-in as she comes closer, or a still camera while she walks.
    const walkingPhoto = planClipMotion(4, "commercial", "person", { lines: WALK_LINES, plates: [true, true, true, true] });
    const first = build(null, 0, line, walkingPhoto[0]);
    expect(first).toContain("Smooth, steady push-in as she comes closer, ending in a medium shot: she walks slowly toward the camera");
    expect(first).toContain(`this real place exactly ${VEO_FRAME_LOCK} shows it — the same layout, fixtures, products, signage, logo, colours and light; she moves within it, and nothing new is added to it`);
    const stills = walkingPhoto.filter((c) => c.camera.key === "static_locked");
    expect(stills.length).toBeGreaterThan(0);
    for (const still of stills) {
      expect(still.walks).toBe(true);
      expect(build(null, still.clip, line, still)).toMatch(/\n\n(?:Steady medium-wide shot from a still camera as she walks along|Still camera, full shot to medium shot as she comes closer): she walks/);
    }
    for (const c of [...photo, ...walkingPhoto]) expect(build(null, c.clip, line, c)).not.toMatch(/side-tracking|lateral dolly|arc shot/i);
  });

  // 2026-10-22: a walk is the director's only on a clip whose words walk her, and no action may turn her body — the
  // "then turns to the lens with a smile" ending this test used to accept is refused now (TURNS).
  it("uses the director's action when it is safe and true to the plan — a longer walk is fine on a walking clip", () => {
    const walk = "She walks slowly toward the camera across the open boutique floor, glancing at the dress rail as she passes, then opens her palm toward the new dresses";
    expect(build({ action: walk }, 0, line, walking[0])).toContain(": she walks slowly toward the camera across the open boutique floor, glancing at the dress rail as she passes");
    const along = "She walks five unhurried steps along the glass counter, her hand gliding over the gold necklaces, then smiles at the lens.";
    expect(build({ action: along }, 1, line, walking[1])).toContain(": she walks five unhurried steps along the glass counter, her hand gliding over the gold necklaces, then smiles at the lens. Calm");
    expect(build({ action: along }, 1, line, walking[1])).not.toMatch(/\.\./);
    const turning = along.replace("then smiles at the lens", "then turns to the lens with a smile");
    expect(resolveDirection(walking[1], { action: turning }, "She").action).toBe(stagingPath(walking[1], "She"));
    // The same walk on a clip performed where she stands is refused.
    expect(resolveDirection(plan[0], { action: walk }, "She").action).toBe(stagingPath(plan[0], "She"));
  });

  it("refuses an action that leaves, climbs, tours the whole place, freezes, runs, backs away, waves, turns round, does a namaste, names a camera move or changes the light", () => {
    const refused = [
      "she walks out of the shop and onto the road",
      "she walks to the entrance and opens the door",
      "she walks across the whole showroom to the back counter",
      "she takes eight quick steps toward the camera",
      "she climbs onto the table to point at the shelf",
      "she stands perfectly still and smiles",
      "she waves goodbye to the camera",
      "the camera pans across the store as she speaks",
      "she turns as a slow pull back reveals the showroom",
      "soft light shifts across the counter as she smiles",
      "she smiles in slow motion",
      "she runs toward the camera with excitement",
      "she walks backward away from the counter",
      "she steps back and smiles at the lens",
      // 2026-10-22 (history 8): the body never turns round, spins or rotates, and the namaskaram is the code's (wishCue).
      "she turns around to show the shelves behind her",
      "she spins slowly with a smile",
      "she rotates to face the display",
      "she twirls in her saree as she speaks",
      "she pivots toward the counter and presents it",
      "she sways from side to side as she talks",
      "she joins her palms in a namaste and smiles",
      "she folds her hands and bows to the viewer",
    ];
    for (const clip of [...plan, ...walking, turn]) {
      for (const action of refused) {
        expect(resolveDirection(clip, { action }, "She").action, `${clip.staging.key}: ${action}`).toBe(stagingPath(clip, "She"));
      }
    }
  });

  // A live run (2026-10-05) refused "her hand toward the bridal saree on the mannequin" as a frozen pose.
  it("keeps an in-place action that only names a thing in the frame — a mannequin, a statue, a saree's length — or a gesture", () => {
    expect(turn.staging.key).toBe("turn_present");
    expect(turn.staging.name).toBe("Present where they stand");
    expect(turn.walks).toBe(false);
    for (const action of [
      "She turns her head and upper body toward the ornate mannequin, her hand gesturing toward the bridal saree displayed.",
      "She raises her palm toward the temple statue behind her with a gentle smile.",
      "She points to the frozen desserts in the glass counter and smiles at the lens.",
      // 2026-10-22: "…, then turns back to the lens" is a body turn now (refused below) — she smiles back at it instead.
      "She unfolds the silk saree to show its full length, then smiles back at the lens.",
      "She crosses her arms with a confident smile, then opens one palm toward the viewer.",
      "She lifts the necklace from on top of the glass counter toward the lens.",
      "She unfolds the pallu to reveal its zari border, then smiles at the lens.",
      "She runs her hand along the silk saree on the counter, then smiles at the lens.",
      // A turn of the head or the palm is a gesture, not the body turning (motion TURNS).
      "She turns her head toward the shelf and presents it with an open palm.",
      "She turns her palm toward the viewer on the promise.",
    ]) expect(resolveDirection(turn, { action }, "She").action, action).toBe(action.replace(/\.$/, ""));
    expect(resolveDirection(turn, { action: "She unfolds the silk saree to show its full length, then turns back to the lens." }, "She").action)
      .toBe(stagingPath(turn, "She"));
  });

  it("names a single presenter as the prompt does, and takes any quoted words out of the action", () => {
    // 2026-10-22: "The model turns toward the sign" turned the body — the action now points.
    expect(resolveDirection(turn, { action: 'The model points toward the "SRI LAKSHMI SILKS" sign, then the model smiles at the lens.' }, "She").action)
      .toBe("She points toward the sign, then she smiles at the lens");
    expect(resolveDirection(turn, { action: "The model nods." }, "He").action).toBe("He nods");
  });

  // 2026-10-22: plan[1] is performed where she stands now (no line walks her); walking[1]'s words walk her.
  it("walks on a walking clip, and only there", () => {
    expect(resolveDirection(turn, { action: "she walks two steps toward the camera" }, "She").action).toBe(stagingPath(turn, "She"));
    expect(resolveDirection(plan[1], { action: "she walks slowly along the shelves" }, "She").action).toBe(stagingPath(plan[1], "She"));
    expect(resolveDirection(plan[1], { action: "she smiles and points at the shelf beside her" }, "She").action).toBe("she smiles and points at the shelf beside her");
    expect(resolveDirection(walking[1], { action: "she smiles and points at the shelf behind her" }, "She").action).toBe(stagingPath(walking[1], "She"));
    const deity = planClipMotion(4, "commercial", "deity")[0];
    expect(resolveDirection(deity, { action: "Ganesha walks slowly toward the viewer" }, "Ganesha").action).toBe(stagingPath(deity, "Ganesha"));
  });

  it("walks a pair only together, side by side — never one alone, never toward the lens, never growing", () => {
    // 2026-10-22: a pair walks only where its words take it somewhere (PAIR_WALK_LINES: clip 1 does).
    const pair = planClipMotion(4, "commercial", "person", { twoHander: true, lines: PAIR_WALK_LINES });
    const names = { a: "Priya", b: "Kavya" };
    const walk = pair[0];
    expect(walk.walks).toBe(true);
    // Standing, the same walk is refused.
    const standing = planClipMotion(4, "commercial", "person", { twoHander: true })[0];
    expect(resolveDirection(standing, { action: "Both walk side by side along the saree racks, Priya pointing at the silk sarees" }, "x", true, names).action)
      .toBe(stagingPath(standing, "x", true, names));
    expect(resolveDirection(walk, { action: "Priya walks along the counter while Kavya waits" }, "x", true, names).action).toBe(stagingPath(walk, "x", true, names));
    expect(resolveDirection(walk, { action: "Both walk together toward the camera, then Kavya points to the sarees" }, "x", true, names).action).toBe(stagingPath(walk, "x", true, names));
    const along = "Both walk side by side along the saree racks, Priya pointing at the silk sarees while Kavya smiles; then Kavya opens a palm toward the counter";
    expect(resolveDirection(walk, { action: along }, "x", true, names).action).toBe(along);
    for (const action of [
      "Both walk side by side as Motu rises onto his toes with excitement",
      "Both walk together while Motu leans toward the camera on his question",
      "Both walk side by side and Motu steps forward proudly toward the camera",
    ]) {
      expect(resolveDirection(motuPlan[0], { action }, "x", true).action, action).toBe(stagingPath(motuPlan[0], "x", true));
    }
    // The pair's camera is the plan's, whatever the director wrote.
    const p = buildMotu(0, { action: "Both walk side by side and Motu steps forward proudly toward the camera" });
    expect(p).not.toContain("steps forward proudly");
    expect(p).toContain("Smooth side-tracking two-shot at eye level, the camera travelling sideways with them at one distance, the background sliding past with parallax: both walk slowly side by side");
  });

  // Every one of these is a beat the director wrote in a live run.
  it("takes the quoted dialogue out of the actions, and the lead-in it leaves hanging", () => {
    const cases: [string, string][] = [
      ["Steps forward from the display counters with a calm smile, gazing warmly into the lens while starting the line 'అరే గణేశ, బోధన్ లోపల...'",
        "Steps forward from the display counters with a calm smile, gazing warmly into the lens"],
      ["Reaches the end of the counter span, raising the blessing palm slightly toward the display and turning his head to the lens for '...స్పెషల్ కాజు కట్లీ.'",
        "Reaches the end of the counter span, raising the blessing palm slightly toward the display and turning his head to the lens"],
      ["Lifts the right hand smoothly toward the background hydraulic lifts on the words 'ఫ్రీ బైక్ వాష్', showing the maintenance area",
        "Lifts the right hand smoothly toward the background hydraulic lifts, showing the maintenance area"],
    ];
    for (const [beat, expected] of cases) expect(withoutQuotedSpeech(beat)).toBe(expected);
  });

  it("leaves an action without quoted dialogue exactly as it was", () => {
    const beat = "an open palm on the line about free delivery";
    expect(withoutQuotedSpeech(beat)).toBe(beat);
    expect(withoutQuotedSpeech("beckons with a 'come in' wave")).toBe("beckons with a 'come in' wave");
  });

  /** English ads came out in a British or American voice — the prompt said only "speaking English". */
  it("speaks an English ad in Indian English with an Andhra Pradesh accent, and leaves other languages native", () => {
    const english = build(null, 1, "Come to Sri Sai Motors today.", plan[1], "English");
    expect(english).toContain("she says in Indian English with a natural Andhra Pradesh accent:\n\"Come to Sri Sai Motors today.\"");
    expect(english).toContain("no foreign accent.");
    expect(spokenLinesIn(english)).toEqual(["Come to Sri Sai Motors today."]);
    const telugu = build(null, 1);
    expect(telugu).toContain("she says in Telugu:");
    expect(telugu).not.toMatch(/accent/);
    expect(speechAccentFor("english")).not.toBeNull();
    expect(speechAccentFor("English (India)")).not.toBeNull();
    expect(speechAccentFor("Hindi")).toBeNull();
    // A cartoon pair speaking English carries it on both lines.
    expect(buildMotu(1, null, "English").match(/says in Indian English with a natural Andhra Pradesh accent/g)).toHaveLength(2);
  });

  it("ties each of a pair's lines to a time, a name, a side and a voice — the speaker leads and the framing follows", () => {
    const p = buildMotu(0);
    expect(p).toContain("0–4s — Motu (on the LEFT of the frame), with the original Motu voice from the show (");
    expect(p).toContain("4–8s — Patlu (on the RIGHT of the frame), with the original Patlu voice from the show (");
    expect(p).toContain("Only the one speaking moves their lips; the other listens with the mouth closed and reacts.");
    // 2026-10-22: facing the camera as they walk — no more "gestures toward what they pass".
    expect(p).toContain("facing the camera — Motu talks while Patlu listens and reacts; then Patlu answers with an open palm toward what the line is about while Motu reacts. The framing drifts a little toward whoever is speaking, never closer.");
    expect(p).not.toContain("toward what they pass");
    expect(p).toContain("no narrator or new voices, no two voices at once.");
    expect(spokenLinesIn(p)).toEqual(["one", "two"]);
  });

  it("lets the one speaker lead a one-line pair clip, and keeps the other's mouth closed", () => {
    const one = buildMotu(3, null, "Telugu", motu.speech([{ name: "Patlu", text: "Come today." }]));
    expect(one).toContain("Only Patlu speaks; the other keeps the mouth closed and reacts.");
    expect(one).toContain("The framing favours Patlu, never closer.");
    expect(one).toContain("Patlu invites the viewer with an open palm, then Motu invites them in with both palms open");
    expect(pairNamesOf([{ speaker: "Patlu" }], ["Motu", "Patlu"])).toEqual({ a: "Patlu", b: "Motu" });
    expect(pairNamesOf([{ speaker: "Motu" }, { speaker: "Patlu" }])).toEqual({ a: "Motu", b: "Patlu" });
    expect(pairNamesOf([{}])).toBeUndefined();
  });

  it("keeps a pair's sides and heights while it moves — the scale anchor word for word, the same words the frame carried", () => {
    const anchor = getCharacterPack("duo_motu_patlu")!.scaleAnchor!;
    for (const i of [0, 1, 2, 3]) {
      const p = buildMotu(i);
      // Clip 1 walks; the rest are performed where they stand — and their outfits are named (2026-10-10).
      const within = motuPlan[i].walks ? "they move within that place" : "they perform side by side where they stand";
      expect(p).toContain(`Keep both characters exactly as drawn, with the same designs, outfits, colours, builds and heights — Motu on the left and Patlu on the right — and the same place, logo, colours and light ${VEO_FRAME_LOCK}; ${within}, and nothing new is added to it.`);
      expect(p).toContain(`Heights never change: ${anchor}`);
      expect(p).not.toMatch(/\b(?:push-in|dolly in|zoom|arc shot)\b|\bwalks? (?:\w+ ){0,3}toward the camera\b/i);
    }
    expect(build(null, 1)).not.toContain("Heights never change");
  });

  it("films two children at their own eye level", () => {
    const kids = packVeoSubject(getCharacterPack("kids_duo_girls")!);
    expect(kids.eyeLevel).toBe("at the children's eye level");
    const kidsPlan = planClipMotion(2, "commercial", "person", { twoHander: true });
    const p = assembleVeoPrompt({
      aspectRatio: "9:16", plan: kidsPlan[0], identityLock: kids.identityLock, language: "Telugu",
      speech: kids.speech([{ name: kids.pairNames![0], text: "a" }, { name: kids.pairNames![1], text: "b" }]),
      cast: kids.cast, castPlural: kids.castPlural, twoHander: true, eyeLevel: kids.eyeLevel, sides: kids.sides,
    });
    expect(p).toContain("two-shot at the children's eye level");
    expect(packVeoSubject(getCharacterPack("duo_motu_patlu")!).eyeLevel).toBeUndefined();
  });

  /**
   * The whole path a real run takes for a two-hander: the script is STORED in the display form
   * (`[Chhota Bheem]: …`), and the Veo prompts are built by reading it back. When the parser could
   * only see one-word labels, Bheem's half of every clip vanished on the way here and the video
   * prompt carried a single voice — see utils/dialogueFormat.
   */
  it("carries BOTH voices when a character's name is two words", () => {
    const pack = getCharacterPack("duo_bheem_chutki")!;
    const cast = packSpeakers(pack);
    const s = packVeoSubject(pack);
    const script = formatDialogueScript([cast.map((c, i) => ({ speaker: c.key, text: `Line ${i + 1}.` }))], cast);
    const nameOf = new Map(cast.map(c => [c.key, c.name]));
    const clip = parseDialogueClips(script, cast)[0];
    const prompt = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(2, "commercial", packPerformer(pack), { twoHander: true })[0],
      identityLock: s.identityLock, language: "Telugu", speech: s.speech(clip.map(l => ({ name: nameOf.get(l.speaker) ?? l.speaker, text: l.text }))),
      cast: s.cast, castPlural: s.castPlural, twoHander: s.twoHander, sides: s.sides, pairNames: s.pairNames,
    });
    expect(spokenLinesIn(prompt)).toEqual(["Line 1.", "Line 2."]);
    expect(prompt).toContain("Chhota Bheem (on the LEFT of the frame)");
    expect(prompt).toContain("Chutki (on the RIGHT of the frame)");
    expect(prompt).toContain("— Chhota Bheem on the left and Chutki on the right —");
  });

  it("keeps every video's colour and light as the frame's", () => {
    for (const p of [build(null, 0), buildMotu(0)]) expect(p).toContain(`colours and light ${VEO_FRAME_LOCK}`);
    expect(build({ action: "she walks along the counter as soft light shifts across it" }, 1)).not.toContain("soft light shifts");
  });

  it("gives a deity the catalogue voice and blessings only, a moving camera, and never a walk", () => {
    const s = packVeoSubject(getCharacterPack("god_ganesha")!);
    const [speech] = s.speech([{ name: "Ganesha", text: "x" }]);
    expect(speech.voice).not.toContain("from the show");
    for (const clip of planClipMotion(4, "commercial", "deity")) {
      const p = assembleVeoPrompt({
        aspectRatio: "9:16", plan: clip, identityLock: s.identityLock, language: "Telugu",
        speech: s.speech([{ name: "Ganesha", text: "x" }]), cast: s.cast, castPlural: s.castPlural,
      });
      expect(p).toContain("Slow, graceful, majestic movement throughout; every gesture is a blessing, never touching or holding products, money or a phone");
      expect(p).toContain("With a voice that is deep, warm and unhurried, with a gentle smile inside it, Ganesha says in Telugu:");
      // 2026-10-22: a deity never walks, so its keep sentence says it performs in place, facing the camera.
      expect(p).toContain("Ganesha performs in place, facing the camera");
      expect(p).toContain("no turning around or rotating");
      expect(MOVING).toContain(clip.camera.key);
      expect(p).not.toMatch(WALK_WORDS);
      expect(p).not.toContain("their face");
      expect(p).toContain("no frozen pose,");
      expect(p).not.toContain("static pose");
    }
  });

  it("closes on an invitation in — never a goodbye", () => {
    for (const p of plan.map((c) => build(null, c.clip))) expect(p).toContain("no goodbye wave");
    // 2026-10-22: where she stands — or, when her words walk her, the last steps in.
    expect(build(null, 3)).toContain("she stands facing the camera and invites the viewer in on the invitation — both palms opening toward the lens in a warm come-in gesture with a nod");
    expect(build(null, 3, line, walking[3])).toContain("she walks the last few steps toward the camera and invites the viewer in, both palms opening toward the lens in a warm come-in gesture");
    expect(build(null, 3)).not.toMatch(GOODBYE);
    expect(build({ action: "she walks toward the camera and waves at it with a smile" }, 3)).not.toContain("waves at it");
  });

  it("reads the spoken lines of a saved older prompt and of a new one", () => {
    expect(spokenLinesIn("SPEECH:\na very sweet, warm, confident female voice, speaking Telugu, perfectly lip-synced:\n\"పాత లైన్.\"\n\nSCENE LIFE: x")).toEqual(["పాత లైన్."]);
    expect(spokenLinesIn(build(null, 0))).toEqual([line]);
  });

  it("carries no PRONUNCIATION line — the word is written the way it is said", () => {
    expect(build(null, 0, "బట్టలు mariyu నగలు.")).not.toContain("PRONUNCIATION");
  });
});

describe("the director call", () => {
  // 2026-10-22 (history 8): every director — not only Motu and Patlu's — is told they walk only where the planned
  // action walks, always face the camera, put each gesture on its words, and never do a namaste (the code does).
  it("directs only the ACTION of each clip — a walk only where the plan walks, always facing the camera, never the camera, never the look", () => {
    const p = VEO_SEGMENT_SYSTEM_PROMPT(4, "female");
    expect(p).toContain("You direct the ACTION of short image-to-video clips");
    expect(p).toContain("starts from ONE attached still");
    expect(p).toContain("never a frozen portrait, and never movement the line does not call for");
    expect(p).toContain("EVERY GESTURE BELONGS TO THE WORDS IT IS SAID WITH");
    expect(p).toContain("ALWAYS FACING THE CAMERA: the body never turns round, turns away, spins or rotates; only the head or a hand may turn a little toward what is shown.");
    expect(p).toContain("THEY WALK ONLY WHERE THE PLANNED ACTION WALKS — in a clip whose words take them somewhere.");
    expect(p).toContain("NEVER A NAMASTE, FOLDED HANDS OR A BOW: on a festival wish the code adds the namaskaram itself, timed to the exact words of the wish.");
    // Asked or not, the old switch changes nothing (@deprecated).
    expect(VEO_DIRECTION_SYSTEM_PROMPT({ clipCount: 2, aspectRatio: "9:16", subject: "she", walksWhenNeeded: true }))
      .toBe(VEO_DIRECTION_SYSTEM_PROMPT({ clipCount: 2, aspectRatio: "9:16", subject: "she" }));
    expect(p).toContain("PLANNED ACTION — what the model (a woman) does in this clip, and whether and where they walk. Keep it; make it specific to THIS frame.");
    expect(p).toContain("CAMERA — the camera move, already decided. You never change it");
    expect(p).toContain("A WALK (when the PLANNED ACTION walks): a slow, natural walk on the floor the frame shows");
    expect(p).toContain("never away from the camera, never running, never walking backward.");
    expect(p).toContain('IN PLACE (when the PLANNED ACTION says "no steps" — most clips)');
    expect(p).toContain("They may greet or gesture to people the FRAME already shows; never add anyone.");
    expect(p).toContain("Never describe a face, hair, clothes, the room or the light");
    expect(p).toContain("Never name a camera move or a shot. Never quote anything — not the spoken words, not a sign or a label.");
    expect(p).toContain('never "the model"');
    expect(p).toContain("No wave of any kind, in any clip.");
    expect(p).toContain("at most 45 words");
    expect(p).toContain('"action": ""');
    expect(p).not.toMatch(/two or three relaxed steps|"frame"|"beats"|sceneLife/);
    expect(p).not.toContain("A pair walks only together");
  });

  it("reads its JSON reply by clip number, accepts the old field name, and survives a broken reply", () => {
    const out = parseVeoDirections(JSON.stringify([{ clip: 2, action: "a" }, { clip: 3, path: "p" }]), 3);
    expect(out[0]).toBeNull();
    expect(out[1]?.action).toBe("a");
    expect(out[2]?.action).toBe("p");
    expect(parseVeoDirections("nonsense", 2)).toEqual([null, null]);
  });

  it("gives a pack its characters' own direction, with the plan deciding where they move", () => {
    const p = VEO_DIRECTION_SYSTEM_PROMPT({ clipCount: 2, aspectRatio: "9:16", subject: "Motu and Patlu", characterDirection: "HOW THIS CHARACTER PERFORMS" });
    expect(p).toContain("HOW THIS CHARACTER PERFORMS");
    expect(p).toContain("The PLANNED ACTION always decides whether and where they move.");
    expect(p).toContain("what Motu and Patlu do in this clip");
  });

  it("tells a pair's director they walk only together, along the floor — never toward the lens", () => {
    const pair = CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(getCharacterPack("duo_motu_patlu")!, 4);
    expect(pair).toContain("A pair walks only together, side by side at the same pace");
    expect(pair).toContain("along or across the floor; never toward the camera, never one of them alone, never one ahead.");
    expect(pair).toContain("Neither leans or moves toward the camera, rises onto the toes, jumps or stretches.");
    expect(pair).toContain("at most 60 words");
  });

  it("tells a deity's director it never walks, and to move slowly and bless", () => {
    const pack = getCharacterPack("god_shiva")!;
    expect(packPerformer(pack)).toBe("deity");
    expect(CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, 4)).toContain("A deity never walks. A deity moves slowly and majestically, and every gesture is a blessing");
  });

  // 2026-10-22: only a clip whose words take them somewhere walks — every other hint is "no steps".
  it("tells the director where each clip walks — or that it does not", () => {
    for (const clip of planClipMotion(4, "commercial")) expect(walkHint(clip)).toBe("performed where they stand, no steps");
    const single = planClipMotion(4, "commercial", "person", { lines: WALK_LINES });
    expect(walkHint(single[0])).toBe("a slow walk toward the camera on the open floor the frame shows");
    expect(walkHint(single[1])).toBe("a slow walk along the counter, display or open floor the frame shows beside them");
    expect(walkHint(single[2])).toBe("performed where they stand, no steps");
    expect(walkHint(single[3])).toBe("the last few steps toward the camera on the open floor the frame shows");
    const pair = planClipMotion(4, "commercial", "person", { twoHander: true, lines: PAIR_WALK_LINES });
    expect(walkHint(pair[0])).toBe("both together, side by side, a slow walk along the counter, display or open floor the frame shows beside them");
    expect(walkHint(pair[1])).toBe("performed where they stand, no steps");
    expect(walkHint(pair[3])).toMatch(/^both together, side by side, a few steps across the floor the frame shows/);
    const photo = planClipMotion(4, "commercial", "person", { twoHander: true, lines: PAIR_WALK_LINES, plates: [true, true, true, true] });
    expect(walkHint(photo[0])).toContain("(the camera stays still — only a few steps)");
    for (const clip of planClipMotion(4, "commercial", "deity", { lines: WALK_LINES })) expect(walkHint(clip)).toBe("performed where they stand, no steps");
  });

  /**
   * 2026-10-22 — the body never turns (history 8: "turning or rotating"), and actionUsable refuses "both turn to the
   * camera" (TURNS). Fixed 2026-10-22: the hint a walking pair's
   * LAST clip gives the director now ends "…, then both stop, facing the camera" (walkHint, walk_invite) — before, a director that
   * followed it had its action thrown away for the plan's.
   */
  it("never asks the director for a body turn in a walk hint", () => {
    for (const twoHander of [false, true]) {
      for (const clip of planClipMotion(4, "commercial", "person", { twoHander, lines: twoHander ? PAIR_WALK_LINES : WALK_LINES })) {
        expect(walkHint(clip), `${twoHander ? "pair " : ""}clip ${clip.clip + 1}`).not.toMatch(BODY_TURN);
      }
    }
  });
});

/**
 * The catalogue was written for held frames and, in places, for walking tours. What reaches the video
 * director has both taken out — and no camera direction at all, because the plan owns the camera and
 * decides who walks.
 */
describe("character direction without the stillness or the travel", () => {
  it("drops the clauses that order stillness and keeps the character", () => {
    const out = withoutStillness(
      "Motu leans in and rocks forward on his question; Patlu stays planted and completely still, which is the whole joke — one of them is bouncing and the other has not moved. In the closing frame both turn front-on together.",
    );
    expect(out).toContain("Motu leans in and rocks forward on his question;");
    expect(out).toContain("In the closing frame both turn front-on together.");
    expect(out).not.toMatch(/planted|still|has not moved/);
  });

  it("drops the planted feet too — and keeps what only looks like them", () => {
    const out = withoutStillness("Motu reacts with his whole upper body — both hands fly up — while his feet stay exactly where they are; Minnie holds her ground. His eyes go wide.");
    expect(out).toBe("Motu reacts with his whole upper body — both hands fly up. His eyes go wide.");
    // A face's "crow's feet stay exactly as the reference shows" is identity, not stillness.
    const face = "Crow's feet stay exactly as the reference shows. He holds his own true scale beside real counters, matching the light exactly where he is standing.";
    expect(withoutStillness(face)).toBe(face);
    for (const id of ["duo_motu_patlu", "duo_mickey_minnie", "owner_face_male", "owner_face_female"]) {
      expect(characterDirectionBlock(getCharacterPack(id)!, "video"), id).not.toMatch(/\b(?:his|her|their) feet stay|holds? (?:his|her|their) ground|held frame|never chased/i);
    }
  });

  it("drops the clauses that walk and keeps the rest", () => {
    const out = withoutTravel("Motu bounces on his heels with excitement. He walks the length of the counter pointing at everything. His eyes go wide on the price.");
    expect(out).toContain("Motu bounces on his heels with excitement.");
    expect(out).toContain("His eyes go wide on the price.");
    expect(out).not.toMatch(/walks/);
  });

  it("sends the video director no camera direction, no stillness, no walking and no goodbye wave, for every pack", () => {
    for (const id of ["duo_motu_patlu", "god_shiva", "god_lakshmi", "solo_patlu", "normal_male", "owner_face_female", "human_duo_female", "human_duo_mixed"]) {
      const video = characterDirectionBlock(getCharacterPack(id)!, "video");
      expect(video, id).not.toContain("CAMERA & CINEMATIC DIRECTION");
      expect(video, id).not.toMatch(/\b(planted|motionless|tripod|locked-off|stillness|never walks)\b/i);
      expect(video, id).not.toMatch(/\bwalk(s|ing)?\b/i);
      expect(video, id).not.toMatch(GOODBYE);
    }
    expect(characterDirectionBlock(getCharacterPack("duo_motu_patlu")!, "frame")).toContain("CAMERA & CINEMATIC DIRECTION");
  });

  /** "Motu leans in and rocks forward … a half step towards the thing" — a body nearer the lens is a body growing. */
  it("takes every move toward the camera out of a pair's video direction, and keeps the rest", () => {
    const out = withoutApproach("Mickey takes the half step forward when he asks; Minnie holds her ground. His eyes go wide on the price. Chutki steps a half pace forward on her fact.");
    expect(out).toContain("His eyes go wide on the price.");
    expect(out).not.toMatch(/half step|half pace|forward/);
    for (const id of ["duo_motu_patlu", "duo_mickey_minnie", "duo_bheem_chutki", "duo_oggy_jack", "duo_spongebob_patrick", "human_duo_male"]) {
      const video = characterDirectionBlock(getCharacterPack(id)!, "video");
      expect(video, id).not.toMatch(/\b(?:leans? (?:in|forward|towards?)|rocks? forward|half[- ](?:step|pace)|steps? forward|stepping in|popping up)\b/i);
    }
    // A single character keeps its own body language untouched by this rule.
    expect(characterDirectionBlock(getCharacterPack("solo_motu")!, "video")).toBeTruthy();
  });

  it("stamps a pair's scale anchor onto a frame prompt once, word for word", () => {
    const anchor = getCharacterPack("duo_motu_patlu")!.scaleAnchor!;
    const stamped = withScaleAnchor("Motu and Patlu at the counter.", anchor);
    expect(stamped).toContain(`${SCALE_ANCHOR_HEADING}: ${anchor.replace(/\.$/, "")}. Both stand on the floor at the same distance from the camera`);
    expect(withScaleAnchor(stamped, anchor)).toBe(stamped);
    expect(withScaleAnchor("A frame.", "")).toBe("A frame.");
  });

  it("keeps what a deity must never touch", () => {
    const video = characterDirectionBlock(getCharacterPack("god_ganesha")!, "video");
    expect(video).toContain("never points at, touches, holds or presents the client's products");
  });
});

/**
 * 2026-10-10, the owner: "in all the clips they are walking, because of it the AI sometimes changes their heights and
 * their attire — make them walk only where it is necessary, based on the frame and the voice-over script". A video
 * model cannot keep a drawn body through a walk: it redraws both characters on every frame. Motu and Patlu
 * (CharacterPack.walksOnlyWhenNeeded) now walk only in a clip whose words take them somewhere, and perform every other
 * clip where they stand, beside what its line is about — in the frame, the scene plan, the director and the prompt.
 *
 * 2026-10-22 — the owner chose this rule for EVERY cast ("move only when the words need it", prompts/motion history 8):
 * the pack flag no longer changes anything, and every other pair, solo, real person and the scene planner now behave as
 * Motu and Patlu do here. The tests below keep Motu and Patlu as the worked example and check the others too.
 */
describe("every cast walks only where a clip's words need it — the Motu and Patlu rule (2026-10-10), for every cast since 2026-10-22", () => {
  const pack = getCharacterPack("duo_motu_patlu")!;
  const motuPlan = (n: number, adType = "commercial", extra: { lines?: string[]; plates?: boolean[]; choices?: (MotionChoice | null)[] } = {}) =>
    planClipMotion(n, adType, packPerformer(pack), { twoHander: true, walksWhenNeeded: true, ...extra });
  /** Lines that take them nowhere: a question, a fact, a promise, an invitation to the viewer. */
  const still = ["Patlu, why is this shop always so full?", "మా కొత్త కలెక్షన్ చూడండి.", "Trusted for twenty years.", "ఈరోజే రండి."];
  const subject = packVeoSubject(pack);
  const build = (plan: ClipMotionPlan) => assembleVeoPrompt({
    aspectRatio: "9:16", plan, identityLock: subject.identityLock, language: "Telugu",
    speech: subject.speech([{ name: "Motu", text: "ఒకటి" }, { name: "Patlu", text: "రెండు" }]),
    cast: subject.cast, castPlural: subject.castPlural, twoHander: true, scaleAnchor: subject.scaleAnchor,
    sides: subject.sides, pairNames: subject.pairNames,
  });

  // Was "is switched on for Motu and Patlu only — the owner's choice" (2026-10-10). 2026-10-22: the owner chose it for
  // every cast, so the flag the catalogue still carries on Motu and Patlu (@deprecated) no longer changes the plan.
  it("applies to every cast now — the pack flag that switched it on for Motu and Patlu no longer changes anything", () => {
    expect(pack.walksOnlyWhenNeeded).toBe(true);
    // Every sale since the start carries the old id; it resolves to the same entry.
    expect(getCharacterPack("motu_patlu")!.walksOnlyWhenNeeded).toBe(true);
    for (const id of ["duo_doraemon_nobita", "duo_bheem_chutki", "duo_tom_jerry", "solo_motu", "solo_patlu", "human_duo_mixed", "kids_duo_girls", "god_ganesha", "normal_female"]) {
      expect(getCharacterPack(id)?.walksOnlyWhenNeeded, id).toBeFalsy();
    }
    // Without the flag, any cast stands where no line takes it anywhere — and the old switch is accepted and ignored.
    for (const [performer, twoHander] of [["cartoon", true], ["person", true], ["cartoon", false], ["person", false], ["deity", false]] as [Performer, boolean][]) {
      const label = `${performer}${twoHander ? " pair" : ""}`;
      const plan = planClipMotion(4, "commercial", performer, { twoHander, lines: still });
      expect(plan.filter((c) => c.walks).length, label).toBe(0);
      expect(plan.every((c) => c.walksWhenNeeded), label).toBe(true);
      expect(planClipMotion(4, "commercial", performer, { twoHander, lines: still, walksWhenNeeded: false }), label).toEqual(plan);
      expect(planClipMotion(4, "commercial", performer, { twoHander, lines: still, walksWhenNeeded: true }), label).toEqual(plan);
    }
  });

  it("performs every clip where they stand when no line takes them anywhere — every length, ad type and photo mix", () => {
    for (const adType of ["commercial", "festival"]) for (let n = 1; n <= 8; n++) for (const photos of ["none", "all", "mixed"] as const) {
      const plates = Array.from({ length: n }, (_, i) => photos === "all" || (photos === "mixed" && i % 2 === 1));
      const plan = motuPlan(n, adType, { plates, lines: Array.from({ length: n }, (_, i) => still[i % still.length]) });
      for (const clip of plan) {
        const at = `${adType} ${n} ${photos}, clip ${clip.clip + 1}`;
        expect(clip.walks, at).toBe(false);
        expect(clip.walksWhenNeeded, at).toBe(true);
        expect(clip.staging.walks, at).toBe(false);
        expect(clip.twoHander, at).toBe(true);
        expect(clip.angle.key, at).toBe("eye_level");
        // A short glide at one angle — or, in their own photo, a still camera. Never toward them, never past them.
        expect(clip.camera.key, at).toBe(clip.plate ? "static_locked" : "lateral_dolly");
        expect(walkHint(clip), at).toBe("performed where they stand, no steps");
        const action = stagingPath(clip, "Both characters", true, { a: "Motu", b: "Patlu" });
        expect(action, at).not.toMatch(WALK_WORDS);
        expect(action, at).not.toMatch(GOODBYE);
        expect(compositionFor(clip), at).not.toMatch(/mid-step|walking/);
        expect(framingForMotion(clip), at).not.toMatch(/\bWalk\b/);
        const prompt = build(clip);
        expect(prompt, at).not.toMatch(NEVER_MOVES);
        expect(prompt, at).toContain("they perform side by side where they stand, and nothing new is added to it.");
        expect(prompt, at).toContain("no morphing");
        expect(prompt, at).toContain("no frozen pose,");
      }
    }
  });

  it("walks a clip whose words take them somewhere — and only that clip, in a scene or in their own photo", () => {
    const lines = ["Patlu, why is this shop always so full?", "రా పట్లు, లోపలికి వెళ్దాం!", "Is the price really that low?", "ఈరోజే రండి."];
    const plan = motuPlan(4, "commercial", { lines });
    expect(plan.map((c) => c.walks)).toEqual([false, true, false, false]);
    // Its beat is the rotation's (clip 1 already presents the display) — now performed as a walk.
    expect(plan[1].staging.key).toBe("approach_show");
    expect(plan[1].staging.walks).toBe(true);
    expect(["side_track", "lateral_dolly"]).toContain(plan[1].camera.key);
    expect(stagingPath(plan[1], "x", true, { a: "Motu", b: "Patlu" })).toMatch(/^both walk a few steps side by side to the product/);
    expect(compositionFor(plan[1])).toContain("both caught mid-step side by side at the same distance from the camera");
    const walking = build(plan[1]);
    expect(walking).toContain("they move within that place, and nothing new is added to it.");
    expect(walking).toContain("no frozen or static pose");
    expect(walking).toContain("no morphing");
    // In their own photo the walk is filmed from a still camera, and every other clip holds still too.
    const photo = motuPlan(4, "commercial", { lines, plates: [true, true, true, true] });
    expect(photo.map((c) => c.walks)).toEqual([false, true, false, false]);
    expect(photo.every((c) => c.camera.key === "static_locked")).toBe(true);
    expect(cameraShot(photo[1], "x", true)).toBe("Steady two-shot at eye level from a still camera as they walk a few steps across the frame");
    expect(cameraShot(photo[0], "x", true)).toBe("Steady two-shot at eye level from a still camera, their own performance carrying the shot");
    // No cap — the owner's choice: every clip whose words move them walks.
    expect(motuPlan(4, "commercial", { lines: ["Let's go!", "Follow me, Motu.", "పదండి!", "Come this way, please."] }).every((c) => c.walks)).toBe(true);
  });

  it("reads the words that move them in every ad language — and never an invitation to the viewer", () => {
    for (const line of [
      "Let's go inside and see the new models.", "Let’s walk to the counter.", "Come with me, Motu!", "Follow me to the counter.",
      "Come this way, please.", "రా పట్లు, లోపలికి వెళ్దాం!", "పదండి, కొత్త కలెక్షన్ చూద్దాం.", "పద మోటూ, చూద్దాం.", "చలో, షోరూమ్ చూద్దాం!",
      "నాతో రా, చూపిస్తా.", "చుట్టూ చూద్దాం.", "అవునా పట్లు? లోపలికి వెళ్లి బ్రైడల్ సెక్షన్ చూద్దాం!", "పదా, పోదాం!",
      "चलो, अंदर देखते हैं।", "வாங்க போலாம்.", "ಬನ್ನಿ ಹೋಗೋಣ.", "നമുക്ക് പോകാം.",
    ]) expect(lineNeedsWalk(line), line).toBe(true);
    for (const line of [
      "Visit us today.", "Come inside our showroom.", "ఈరోజే రండి.", "లోపలికి రండి, ఆఫర్లు చూడండి.", "ఈ పదం చాలా బాగుంది.",
      "ఈరోజే షాప్ కి వెళ్లి చూడండి. మేము ఎదురుచూస్తాం.",
      "పదార్థాలు అన్నీ తాజావి.", "In this way you save money.", "Look at these new designs.", "మా కొత్త కలెక్షన్ చూడండి.", "",
    ]) expect(lineNeedsWalk(line), line).toBe(false);
  });

  it("takes the scene plan's judgment over the code's reading, walks a beat planned in place, and greets in place", () => {
    const lines = ["Let's go inside!", "a", "b", "c"];
    expect(motuPlan(4, "commercial", { lines, choices: [{ walk: false }, { walk: true }] }).map((c) => c.walks)).toEqual([false, true, false, false]);
    const turned = motuPlan(4, "commercial", { choices: [null, { staging: "turn_present", walk: true }] });
    expect(turned[1].staging.key).toBe("walk_across");
    expect(turned[1].walks).toBe(true);
    const festival = motuPlan(4, "festival", { lines: ["Let's go and wish everyone!", "a", "b", "c"], choices: [{ walk: true }] });
    expect(festival[0].walks).toBe(false);
    // 2026-10-22: facing the camera, no turn and no namaste in the action — the namaskaram is timed to the wish (wishCue).
    expect(stagingPath(festival[0], "x", true, { a: "Motu", b: "Patlu" })).toBe("both stand side by side facing the camera with festive smiles; Motu greets the viewer while Patlu listens and smiles, the hands relaxed until the wish");
    expect(stagingPath(motuPlan(1)[0], "x", true, { a: "Motu", b: "Patlu" })).toBe("Motu speaks with an open palm on the business name as Patlu reacts; then Patlu invites the viewer in with both palms open — an invitation, never a goodbye wave");
    // The same plan every time — the frame side and the video side build it alike.
    expect(motuPlan(4, "commercial", { lines })).toEqual(motuPlan(4, "commercial", { lines }));
  });

  it("composes each frame for it — standing side by side beside what the line is about, mid-step only where it walks", () => {
    const options = { segmentCount: 4, clipSummaries: still, locationMode: "ai_generated", locationPlan: "", aspectRatio: "9:16", adType: "commercial" } as const;
    const stands = motuPlan(4, "commercial", { lines: still });
    expect(compositionFor(stands[0])).toContain("both standing side by side at the same distance from the camera in front of the real counter, display or shelves");
    expect(compositionFor(stands[1])).toContain("right beside the real product, counter or display the clip talks about — within arm's reach and fully in view");
    expect(framingForMotion(stands[1])).toContain("🎬 THIS CLIP: Show it where they stand — filmed Eye level · 35mm · Lateral Dolly");
    expect(withMotionComposition("A frame.", motuPlan(4, "commercial", { plates: [true, true, true, true] })[1], { plate: true }))
      .toContain("both placed into it side by side at the same distance from the camera, standing on the real floor right beside what the line is about");
    const frame = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, { ...options, motionPlan: stands });
    // 2026-10-22: the same words for every pack — where they stand, facing the camera, each gesture on its words.
    expect(frame).toContain("Motu and Patlu perform each\nclip WHERE they stand, side by side, beside what its line is about, facing the camera");
    expect(frame).toContain("every step and every turn is one more thing the video model can get wrong");
    expect(frame).toContain("caught MID-GESTURE");
    expect(frame).toContain("standing side by side as each clip's 🎬 note says");
    expect(frame).not.toMatch(/every clip MOVES|caught mid-step side by side as each|for a walking clip only|They walk together/);
    const oneWalk = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, { ...options, motionPlan: motuPlan(4, "commercial", { lines: ["a", "Let's go inside!", "c", "d"] }) });
    expect(oneWalk).toContain("They walk together, side by side, only in a clip whose 🎬 note walks.");
    expect(oneWalk).toContain("for a walking clip only, both caught mid-step with clear open floor ahead of them");
    // 2026-10-22: another cartoon pair no longer keeps the dynamic pass's walking frames — it stands like Motu and Patlu.
    const doraemon = getCharacterPack("duo_doraemon_nobita")!;
    const other = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(doraemon, { ...options, motionPlan: planClipMotion(4, "commercial", "cartoon", { twoHander: true, lines: still }) });
    expect(other).toContain("perform each\nclip WHERE they stand, side by side, beside what its line is about, facing the camera");
    expect(other).toContain("standing side by side as each clip's 🎬 note says");
    expect(other).not.toMatch(/every clip MOVES|caught mid-step side by side as each/);
  });

  // Was "… — Motu and Patlu only" (2026-10-10). 2026-10-22: every drawn pair's outfits are named, and "no morphing" is
  // in every cast's negative.
  it("names every drawn pair's outfits, films a standing clip with a short glide at one angle, and forbids morphing — every cast", () => {
    expect(subject.identityLock).toBe("both characters exactly as drawn, with the same designs, outfits, colours, builds and heights");
    expect(packVeoSubject(getCharacterPack("duo_doraemon_nobita")!).identityLock).toBe("both characters exactly as drawn, with the same designs, outfits, colours, builds and heights");
    const [first] = motuPlan(4, "commercial", { lines: still });
    const p = build(first);
    expect(p).toContain("Slow lateral dolly two-shot at eye level, the camera gliding a short way sideways at one distance, both seen from the same angle throughout, the background sliding gently with parallax: both stand side by side beside the counter, display or shelves");
    expect(p).toContain("The framing drifts a little toward whoever is speaking, never closer.");
    expect(p).not.toMatch(STILL_WORDS);
    expect(p.split("\n\n")).toHaveLength(5);
    expect(spokenLinesIn(p)).toEqual(["ఒకటి", "రెండు"]);
    // 2026-10-22: ≤ 360 before — the life line and the four new negatives add about twenty words (387 measured).
    expect(words(p)).toBeLessThanOrEqual(390);
    const photo = build(motuPlan(4, "commercial", { lines: still, plates: [true, true, true, true] })[0]);
    expect(photo).toContain("Steady two-shot at eye level from a still camera, their own performance carrying the shot: both stand side by side");
    expect(photo).toContain(`this real place exactly ${VEO_FRAME_LOCK} shows it — the same layout, fixtures, products, signage, logo, colours and light; they perform side by side where they stand, and nothing new is added to it.`);
    // A refine that keeps the line and the keep sentence is still accepted.
    expect(veoEditProblems(p, p.replace("Slow lateral dolly", "Gentle lateral dolly"))).toEqual([]);
    // 2026-10-22: another drawn pair now stands too, and morphing is forbidden for every cast.
    const other = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial", "cartoon", { twoHander: true })[0], identityLock: "x", language: "Telugu",
      speech: [{ speaker: "A", voice: "v", line: "one" }, { speaker: "B", voice: "v", line: "two" }], cast: "Both characters", castPlural: true, twoHander: true,
    });
    expect(other).toContain("no morphing");
    expect(other).toContain("they perform side by side where they stand");
    expect(other).not.toContain("they move within that place");
  });

  it("refuses a director's walk in a standing clip, keeps a performance in place, and tells the director why", () => {
    const [first] = motuPlan(4, "commercial", { lines: still });
    const names = { a: "Motu", b: "Patlu" };
    for (const action of [
      "Both walk side by side along the counter, Motu pointing at the necklaces while Patlu nods",
      "Motu takes a few steps to the glass counter as Patlu follows",
    ]) expect(resolveDirection(first, { action }, "x", true, names).action, action).toBe(stagingPath(first, "x", true, names));
    const inPlace = "Motu points at the gold necklaces in the glass counter beside him with a whole open hand, eyes wide, as Patlu smiles; then Patlu answers with one calm palm toward them";
    expect(resolveDirection(first, { action: inPlace }, "x", true, names).action).toBe(inPlace);
    // The first live run (2026-10-10) threw this away for "rise" — a hand rising is Motu's own gesture, not him growing.
    const live = "Motu's hands rise near his chest in disbelief, his wide-eyed gaze bouncing from the BIS hallmark gold items in the display to Patlu as he asks. Patlu, maintaining his small, certain smile, looks at Motu and places a hand on his chest, then nods confidently as he speaks";
    expect(resolveDirection(first, { action: live }, "x", true, names).action).toBe(live);
    // 2026-10-22: the other live action of that run turns both bodies "front-on to the camera" — a body turn, refused
    // now (motion TURNS; the owner's "turning or rotating"). It passed until then.
    const turning = "Motu turns front-on to the camera, his hands rising near his chest in disbelief at the low wastage. Patlu then turns front-on with a warm smile, opening both palms toward the viewer in a direct invitation to the main road showroom";
    expect(resolveDirection(first, { action: turning }, "x", true, names).action).toBe(stagingPath(first, "x", true, names));
    // The body rising still never passes.
    for (const grows of ["Motu rises onto his toes with excitement as Patlu nods", "Patlu rising slowly as he answers Motu"]) {
      expect(resolveDirection(first, { action: grows }, "x", true, names).action, grows).toBe(stagingPath(first, "x", true, names));
    }
    expect(CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, 4)).toContain("THEY WALK ONLY WHERE THE PLANNED ACTION WALKS — in a clip whose words take them somewhere.");
    // 2026-10-22: every pack's director is told the same.
    for (const id of ["duo_doraemon_nobita", "solo_motu", "human_duo_mixed", "god_ganesha"]) {
      expect(CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(getCharacterPack(id)!, 4), id).toContain("THEY WALK ONLY WHERE THE PLANNED ACTION WALKS");
    }
  });

  // Was "— for Motu and Patlu only —" (2026-10-10). 2026-10-22: the planner judges every cast's walk but a deity's,
  // offers the stagings by their in-place names, and the old switch no longer changes the prompt.
  it("asks the scene plan to judge each clip's walk — every cast but a deity — and reads it back", () => {
    const base = { clipCount: 4, adType: "commercial", subject: "Motu and Patlu", twoHander: true, cartoon: true };
    const p = SCENE_PLAN_SYSTEM_PROMPT({ ...base, walksWhenNeeded: true });
    expect(p).toContain("\"walk\" — true ONLY for a clip whose own words take them somewhere");
    expect(p).toContain("\"walk\": <true or false>");
    expect(p).toContain("approach_show (Show it where they stand)");
    expect(p).toContain("Motu and Patlu is IN that background, standing beside what that clip's line is about, facing the camera");
    expect(SCENE_PLAN_SYSTEM_PROMPT(base)).toBe(p);
    const solo = SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 4, adType: "commercial", subject: "the model" });
    expect(solo).toContain("\"walk\": <true or false>");
    expect(solo).toContain("walk_toward (Speak to the camera)");
    expect(solo).toContain("approach_show (Show it where they stand)");
    expect(solo).not.toContain("approach_show (Approach and show)");
    const deity = SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 4, adType: "commercial", subject: "Ganesha", deity: true });
    expect(deity).not.toContain("\"walk\"");
    expect(deity).toContain("A deity never walks");
    const raw = JSON.stringify({
      motive: "a jewellery shop promotion",
      clips: [
        { clip: 1, background: "the necklace counter", walk: false },
        { clip: 2, background: "the bridal section", walk: true },
        { clip: 3, background: "the billing desk", walk: "yes" },
      ],
    });
    const context = parseScenePlan(raw, 3)!;
    expect(context.clips.map((c) => c.walk)).toEqual([false, true, undefined]);
    expect(motionChoicesOf(context).map((c) => c.walk)).toEqual([false, true, undefined]);
  });
});

/** A kit saved before the dynamic pass — its scene plan and its prompts — still regenerates and refines. */
describe("kits saved before the dynamic pass", () => {
  it("reads a saved scene plan's old action keys as today's, and drops its retired cameras", () => {
    const raw = JSON.stringify({
      motive: "a maternity hospital promotion",
      clips: [
        { clip: 1, background: "the reception", staging: "stand_present", camera: "rack_focus" },
        { clip: 2, background: "the consultation room", staging: "approach_show", camera: "arc", angle: "low_angle" },
      ],
    });
    const context = parseScenePlan(raw, 2)!;
    expect(context.clips[0].staging).toBe("walk_stop_present");
    expect(context.clips[0].camera).toBeUndefined();
    expect(context.clips[1].staging).toBe("approach_show");
    expect(context.clips[1].camera).toBe("arc");
  });

  it("refuses a refine that drops the keep sentence — today's and the one an earlier prompt carries", () => {
    const model = modelVeoSubject("female");
    const fresh = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial")[1], identityLock: model.identityLock, language: "Telugu",
      speech: [{ voice: model.voice, line: "ఒకటి." }], cast: model.cast, castPlural: false,
    });
    expect(fresh).toContain(VEO_FRAME_LOCK);
    expect(fresh).not.toContain(LEGACY_VEO_FRAME_LOCK);
    expect(veoEditProblems(fresh, fresh.replace(/Keep [^\n]*\n?/, "")).join(" ")).toContain(`"${VEO_FRAME_LOCK}" went missing`);
    // A refine that only changes the camera words is accepted. (2026-10-22: clip 2 stands now, filmed with the short
    // glide — the side-tracking words this used to replace are no longer there.)
    const swapped = fresh.replace(/Slow lateral dolly|Smooth, steady push-in|Smooth side-tracking shot/, "Slow arc shot");
    expect(swapped).not.toBe(fresh);
    expect(veoEditProblems(fresh, swapped)).toEqual([]);
    const old = "Slow dolly in: she speaks.\n\nWith a voice, she says in Telugu:\n\"ఒకటి.\"\n\nPreserve her exact face, and keep the place, its objects, logo, colours and light exactly as in the attached frame for the whole clip.\n\nNegative prompt: No text.";
    expect(veoEditProblems(old, old.replace(" exactly as in the attached frame", "")).join(" ")).toContain(`"${LEGACY_VEO_FRAME_LOCK}" went missing`);
  });
});
