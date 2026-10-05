import { describe, it, expect } from "vitest";
import {
  CAMERA_MOVES, SHOT_ANGLES, STAGINGS, PAIR_MOVES, VEO_FRAME_LOCK, LEGACY_VEO_FRAME_LOCK, MOTION_COMPOSITION_HEADING,
  SCALE_ANCHOR_HEADING, VEO_DIRECTION_SYSTEM_PROMPT, assembleVeoPrompt, cameraLabel, cameraShot, castKindOf, clipRoles,
  compositionFor, fillCast, framingForMotion, pairNamesOf, parseVeoDirections, planClipMotion, resolveDirection,
  speechAccentFor, spokenLinesIn, stagingForLine, stagingKeyOf, stagingPath, walkHint, withMotionComposition,
  withScaleAnchor, withoutApproach, withoutQuotedSpeech, withoutStillness, withoutTravel,
  type ClipMotionPlan, type Performer,
} from "@/services/prompts/motion";
import { HERO_FRAME_POSE, MULTI_FRAME_SYSTEM_PROMPT, VEO_SEGMENT_SYSTEM_PROMPT, modelVeoSubject } from "@/services/prompts";
import {
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT, characterDirectionBlock, packPerformer,
  packVeoSubject,
} from "@/services/prompts/characterAd";
import { getCharacterPack, packSpeakers } from "@/services/characterPacks";
import { formatDialogueScript, parseDialogueClips } from "@/utils/dialogueFormat";
import { parseScenePlan } from "@/utils/scenePlan";
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

/** The moves that move the camera — everything but the still camera of a client's photo. */
const MOVING = ["push_in", "side_track", "lateral_dolly", "arc"];

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

  it("gives every clip a real action and a camera that follows it — every cast, length, ad type and photo mix", () => {
    for (const performer of PERFORMERS) for (const twoHander of [false, true]) for (const adType of ["commercial", "festival"]) {
      for (let n = 1; n <= 8; n++) {
        for (const photos of ["none", "all", "mixed"] as const) {
          const plates = Array.from({ length: n }, (_, i) => photos === "all" || (photos === "mixed" && i % 2 === 1));
          const plan = planClipMotion(n, adType, performer, { twoHander, plates });
          const kind = castKindOf(performer, twoHander);
          const label = `${performer}${twoHander ? " pair" : ""} ${adType} ${n} ${photos}`;
          expect(plan, label).toHaveLength(n);
          for (const clip of plan) {
            const at = `${label}, clip ${clip.clip + 1}`;
            // Never a talking portrait: the cast walks, or the camera moves — and a still camera only ever films
            // a walk in the client's own photograph.
            expect(clip.walks || MOVING.includes(clip.camera.key), at).toBe(true);
            if (clip.camera.key === "static_locked") {
              expect(clip.walks, at).toBe(true);
              expect(clip.plate, at).toBe(true);
            }
            // The camera never moves backward and never shows more than the still.
            expect(cameraShot(clip, "She"), at).not.toMatch(NEVER_MOVES);
            expect(clip.camera.action, at).not.toMatch(NEVER_MOVES);
            if (kind === "deity") expect(clip.walks, at).toBe(false);
            if (kind === "pair" || kind === "drawn_pair") {
              expect(PAIR_MOVES, at).toContain(clip.camera.key);
              expect(clip.angle.key, at).toBe("eye_level");
              expect(clip.staging.key, at).not.toBe("walk_toward");
            }
            if (clip.plate) expect(["push_in", "static_locked"], at).toContain(clip.camera.key);
          }
          // Most clips of a cast that may walk do walk — the movement the videos lacked.
          if (kind !== "deity") expect(plan.filter((c) => c.walks).length, label).toBeGreaterThanOrEqual(Math.ceil(n / 2));
        }
      }
    }
  });

  it("opens the ad on the move and closes walking in to invite — never a goodbye", () => {
    expect(planClipMotion(4, "commercial")[0].staging.key).toBe("walk_toward");
    expect(planClipMotion(4, "commercial", "cartoon")[0].staging.key).toBe("walk_toward");
    expect(planClipMotion(4, "commercial", "person", { twoHander: true })[0].staging.key).toBe("walk_across");
    expect(planClipMotion(4, "commercial", "cartoon", { twoHander: true })[0].staging.key).toBe("walk_across");
    expect(planClipMotion(4, "commercial", "deity")[0].staging.key).toBe("turn_present");
    for (const performer of PERFORMERS) for (const twoHander of [false, true]) {
      const plan = planClipMotion(4, "commercial", performer, { twoHander });
      expect(plan.at(-1)!.staging.key).toBe("walk_invite");
      expect(stagingPath(plan.at(-1)!, "She", twoHander, { a: "A", b: "B" })).toMatch(/never a (?:goodbye )?wave/);
    }
  });

  it("greets a festival with a namaste — turning to the camera, or for a pair after a few steps together", () => {
    const single = planClipMotion(4, "festival");
    expect(single[0].staging.key).toBe("turn_present");
    expect(MOVING).toContain(single[0].camera.key);
    expect(stagingPath(single[0], "She")).toContain("She turns to the camera with a festive smile, greets the viewer with a namaste and a small bow");
    const pair = planClipMotion(4, "festival", "person", { twoHander: true });
    expect(pair[0].walks).toBe(true);
    expect(stagingPath(pair[0], "x", true, { a: "Priya", b: "Kavya" })).toContain("Priya greets the viewer with a namaste and a festive smile");
    expect(stagingPath(planClipMotion(1, "commercial")[0], "He")).toContain("He walks slowly toward the camera talking warmly, with an open palm on the business name");
  });
});

describe("the motion plan", () => {
  it("reads each line for what it asks: a product to walk to, the place to walk along, a promise to walk up and say", () => {
    expect(stagingForLine("See our new silk saree collection.", "proof", "person")).toBe("approach_show");
    expect(stagingForLine("మా కొత్త కలెక్షన్ చూడండి.", "proof", "person")).toBe("approach_show");
    expect(stagingForLine("Come inside our big showroom.", "proof", "person")).toBe("walk_across");
    expect(stagingForLine("Come inside our big showroom.", "proof", "deity")).toBe("turn_present");
    expect(stagingForLine("Trusted by families for twenty years.", "proof", "person")).toBe("walk_stop_present");
    expect(stagingForLine("anything", "trust", "person")).toBe("walk_stop_present");
    expect(stagingForLine("anything", "wish", "person")).toBe("turn_present");
    const product = planClipMotion(3, "commercial", "person", {
      lines: ["Namaste.", "See our gold jewellery designs.", "Visit us."], choices: [{ camera: "arc" }, { camera: "push_in" }],
    });
    expect(product[1].staging.key).toBe("approach_show");
    expect(cameraShot(product[1], "She")).toBe("Smooth, steady push-in from a three-quarter shot to a close-up of the product, the focus settling on her face as she turns back to the lens");
    expect(product[1].lens).toBe("50mm");
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
    expect(plan[0].camera.key).toBe("arc");
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

  it("never stages or films two neighbouring clips the same way, for any cast", () => {
    for (const performer of PERFORMERS) for (const twoHander of [false, true]) for (const n of [2, 3, 4, 6, 8, 15]) {
      const plan = planClipMotion(n, "commercial", performer, { twoHander });
      for (let i = 1; i < plan.length; i++) {
        const label = `${performer}${twoHander ? " pair" : ""} ${n}, clip ${i + 1}`;
        expect(plan[i].staging.key, label).not.toBe(plan[i - 1].staging.key);
        expect(plan[i].camera.key, label).not.toBe(plan[i - 1].camera.key);
      }
    }
    // One presenter in the client's photo still alternates a push-in with a still camera.
    const photo = planClipMotion(6, "commercial", "person", { plates: [true, true, true, true, true, true] });
    for (let i = 1; i < photo.length; i++) expect(photo[i].camera.key, `photo clip ${i + 1}`).not.toBe(photo[i - 1].camera.key);
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
    }
    expect(Object.keys(SHOT_ANGLES)).toEqual(["eye_level", "low_angle", "high_angle"]);
    expect(planClipMotion(4, "commercial", "deity")[1].gesture).toContain("never touching, holding or presenting it");
  });

  it("writes the action for whoever performs, with the right pronouns, names and the clip's own role", () => {
    const plan = planClipMotion(4, "commercial");
    expect(stagingPath(plan[0], "She")).toMatch(/^She walks slowly toward the camera across the open floor, talking naturally/);
    expect(fillCast(STAGINGS.walk_across.path, "He")).toContain("He walks slowly along the counter, display or shelves beside him");
    expect(fillCast(STAGINGS.turn_present.path, "Both characters", true)).toContain("Both characters turn from the place behind them to the camera");
    const pair = planClipMotion(4, "commercial", "person", { twoHander: true });
    expect(stagingPath(pair[0], "x", true, { a: "Priya", b: "Kavya" })).toBe("both walk slowly side by side along the counter, display or open floor beside them, bodies angled toward the camera — Priya talks and gestures toward what they pass while Kavya reacts; then Kavya answers with an open palm while Priya reacts");
    const deity = planClipMotion(4, "commercial", "deity");
    expect(stagingPath(deity[0], "Ganesha")).toBe("Ganesha sweeps the blessing palm slowly over the place, then turns the palm toward the viewer");
    // A deity's clips are named as blessings — the 🎬 note on its frame never asks it to walk.
    expect(deity.map((c) => c.staging.name)).toEqual(["Bless the place", "Bless what it offers", "Bless the place", "Bless and welcome"]);
    expect(deity.every((c) => !c.staging.walks && !c.walks)).toBe(true);
  });
});

describe("frames built for each clip's action — caught mid-movement", () => {
  const lines = ["Namaste.", "Come inside our showroom.", "Trusted for years.", "Visit us."];
  const plan = planClipMotion(4, "commercial", "person", { lines });
  const modelFrame = (p: ClipMotionPlan[] = plan) =>
    MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, lines, "", "female", "", false, "", undefined, p);

  it("composes each frame for its own clip — mid-step, the floor for a walk, the product in view", () => {
    expect(plan.map((c) => c.staging.key)).toEqual(["walk_toward", "walk_across", "walk_stop_present", "walk_invite"]);
    const p = modelFrame();
    expect(p).toContain("FRAMES BUILT FOR MOTION (EACH FRAME IS THE FIRST MOMENT OF ITS CLIP)");
    expect(p).toContain("every clip MOVES like a shot from a real commercial");
    expect(p).toContain("caught MID-MOVEMENT, never a stiff, posed stance");
    expect(p).toContain("A WALK NEEDS ITS FLOOR");
    expect(p).toContain("THE THING TO SHOW IN VIEW");
    expect(p).toContain("INSIDE THE BUSINESS, ALWAYS");
    expect(p).not.toMatch(/nobody walks|always in place|two or three steps|rack focus|gentle float|front-clasp/i);
    for (const clip of plan.slice(1)) {
      expect(p).toContain(framingForMotion(clip));
      expect(p).toContain(`🧍 POSE: ${clip.staging.start}`);
    }
    expect(framingForMotion(plan[1])).toContain("the full figure caught mid-step from a three-quarter front angle");
    expect(framingForMotion(plan[1])).toContain("never a stiff, posed stance");
  });

  it("asks for no floor when no clip walks", () => {
    expect(modelFrame(planClipMotion(4, "commercial", "deity", { lines }))).not.toContain("A WALK NEEDS ITS FLOOR");
  });

  // Clip 1's image is the face every later frame is matched to — now caught as she is about to step forward.
  it("keeps the hero framing on clip 1 in an open pose, never the front-clasp", () => {
    const p = modelFrame();
    expect(p).toContain(`🎬 THIS CLIP: ${plan[0].staging.name} — filmed ${cameraLabel(plan[0])}. Keep the hero framing and pose exactly`);
    expect(p).toContain(HERO_FRAME_POSE);
    expect(p).not.toContain("front-clasp");
  });

  it("leaves a frame prompt without a plan exactly as before", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, ["a", "b", "c", "d"], "", "female", "", false, "");
    expect(p).not.toContain("FRAMES BUILT FOR MOTION");
    expect(p).not.toContain("🎬");
    expect(p).toContain("Mandatory direct eye contact to the camera while holding this new pose");
  });

  it("does the same for a character pack — a pair walks together, side by side, mid-step; a deity blesses in place", () => {
    const options = { segmentCount: 4, clipSummaries: lines, locationMode: "ai_generated", locationPlan: "", aspectRatio: "9:16", adType: "commercial" } as const;
    const motu = planClipMotion(4, "commercial", "cartoon", { twoHander: true, lines });
    const drawn = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack("duo_motu_patlu")!, { ...options, motionPlan: motu });
    expect(drawn).toContain("every clip MOVES");
    expect(drawn).toContain("the characters WALK together, side by side, through the place — along the counter or display, or to the product");
    expect(drawn).toContain("caught MID-MOVEMENT");
    expect(drawn).toContain("caught mid-step side by side as each clip's 🎬 note says");
    expect(drawn).toContain(compositionFor(motu[1]));
    expect(compositionFor(motu[1])).toContain("both caught mid-step side by side at the same distance from the camera");
    const solo = planClipMotion(4, "commercial", "cartoon", { lines });
    const single = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack("solo_motu")!, { ...options, motionPlan: solo });
    expect(single).toContain("WALK through the place — toward the camera, along the counter or display, or to the product");
    const ganesha = planClipMotion(4, "commercial", "deity", { lines });
    const deity = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack("god_ganesha")!, { ...options, motionPlan: ganesha });
    expect(deity).not.toContain("WALK through the place");
    expect(deity).toContain("PRESENT\nwhat the line is about or TURN to present the place");
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

  it("keeps a client photo's own framing, and places the cast mid-step on open floor", () => {
    const photo = planClipMotion(4, "commercial", "person", { plates: [true, true, true, true] });
    expect(withMotionComposition("A frame.", photo[0], { plate: true })).toContain("the photograph's own framing and camera angle, unchanged; the subject placed into it caught mid-step on open, clear floor, with room to walk and nothing between them and the camera");
    const pairPhoto = planClipMotion(4, "commercial", "cartoon", { twoHander: true, plates: [true, true, true, true] });
    expect(withMotionComposition("A frame.", pairPhoto[0], { plate: true })).toContain("both placed into it side by side, caught mid-step on the real floor, with room to walk a few steps across it");
    const deityPhoto = planClipMotion(4, "commercial", "deity", { plates: [true, true, true, true] });
    expect(withMotionComposition("A frame.", deityPhoto[0], { plate: true })).toContain("the subject placed into it on the real floor, turned slightly toward what they present");
  });

  it("never stamps twice, and leaves an empty prompt alone", () => {
    const once = withMotionComposition("A frame.", plan[0]);
    expect(withMotionComposition(once, plan[0])).toBe(once);
    expect(withMotionComposition("", plan[0])).toBe("");
    expect(withMotionComposition("A frame.", undefined)).toBe("A frame.");
  });

  it("frames a drawn character head to feet, a real person three-quarter, a pair side by side, a deity in place", () => {
    const cartoon = planClipMotion(4, "commercial", "cartoon");
    expect(compositionFor(cartoon[2])).toContain("the full figure from head to feet caught mid-step");
    expect(compositionFor(plan[2])).toContain("three-quarter body caught mid-step");
    expect(compositionFor(plan[2])).toContain(`shot ${plan[2].angle.name.toLowerCase()} on a ${plan[2].lens} lens`);
    expect(compositionFor(plan[0])).toContain("the full figure from head to feet, caught mid-step a few steps back from the camera");
    expect(compositionFor(planClipMotion(4, "commercial", "person", { twoHander: true })[0])).toContain("both caught mid-step side by side");
    expect(compositionFor(planClipMotion(4, "commercial", "deity")[0])).toContain("in a graceful blessing pose caught mid-gesture");
  });
});

describe("the Veo prompt", () => {
  const lines = ["Namaste.", "Come inside our showroom.", "Trusted for years.", "Visit us."];
  const plan = planClipMotion(4, "commercial", "person", { lines });
  const model = modelVeoSubject("female");
  const line = "శ్రీ సాయి మోటార్స్ లో మీ బైక్ సర్వీస్ అదే రోజు.";
  const build = (direction?: any, clip = 0, spoken = line, p: ClipMotionPlan = plan[clip], language = "Telugu") => assembleVeoPrompt({
    aspectRatio: "9:16", plan: p, direction, identityLock: model.identityLock, language,
    speech: [{ voice: model.voice, line: spoken }], cast: model.cast, castPlural: model.castPlural,
  });
  const motu = packVeoSubject(getCharacterPack("duo_motu_patlu")!);
  const motuPlan = planClipMotion(4, "commercial", "cartoon", { twoHander: true });
  const buildMotu = (i: number, direction?: any, language = "Telugu", speech = motu.speech([{ name: "Motu", text: "one" }, { name: "Patlu", text: "two" }])) => assembleVeoPrompt({
    aspectRatio: "9:16", plan: motuPlan[i], direction, identityLock: motu.identityLock, language, speech,
    cast: motu.cast, castPlural: motu.castPlural, twoHander: motu.twoHander, scaleAnchor: motu.scaleAnchor,
    sides: motu.sides, pairNames: motu.pairNames, eyeLevel: motu.eyeLevel,
  });
  /** A clip performed in place — the scene plan chose to turn and present. */
  const turn = planClipMotion(4, "commercial", "person", { choices: [null, { staging: "turn_present" }] })[1];

  it("is five short parts in order — what it is, the camera and the action, the voice, the keep sentence, the negative", () => {
    for (const clip of plan) {
      const p = build(null, clip.clip);
      const parts = p.split("\n\n");
      expect(parts, `clip ${clip.clip + 1}`).toHaveLength(5);
      expect(parts[0]).toBe("9:16 vertical video, one continuous 8-second shot that starts from the attached frame.");
      expect(parts[1].startsWith(`${cameraShot(clip, "She")}: she `), parts[1]).toBe(true);
      expect(parts[1]).toContain("Natural body movement throughout, with eye contact on the key words — clothes and hair move with every step; anyone already in the background carries on naturally.");
      expect(parts[2]).toBe(`With a very sweet, warm, confident female voice, she says in Telugu:\n"${line}"`);
      expect(parts[3]).toBe(`Keep her exact face, hair, outfit and height, and the same place, logo, colours and light ${VEO_FRAME_LOCK}; she moves within that place, and nothing new is added to it.`);
      expect(parts[4]).toBe("Negative prompt: No text or subtitles on screen, no background music or echo, no cuts, no camera shake, no frozen or static pose, no change of location or background, no unnatural movement, no extra people, no goodbye wave.");
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
  it("is short — every category, every clip", () => {
    for (const n of [2, 4, 6, 8]) {
      for (const p of planClipMotion(n, "commercial")) expect(words(build(null, 0, "x", p)), `model ${n}`).toBeLessThanOrEqual(190);
    }
    for (const i of [0, 1, 2, 3]) expect(words(buildMotu(i)), `motu ${i}`).toBeLessThanOrEqual(360);
  });

  it("walks: toward the camera on a push-in, along the display on a side track, the last steps in to invite", () => {
    expect(build(null, 0)).toContain("Smooth, steady push-in as she comes closer, ending in a medium shot: she walks slowly toward the camera across the open floor");
    expect(build(null, 1)).toContain("Smooth side-tracking shot from a three-quarter front angle, the camera travelling sideways alongside her, the background sliding past with parallax: she walks slowly along the counter, display or shelves beside her");
    expect(build(null, 3)).toContain("she walks the last few steps toward the camera and invites the viewer in");
  });

  it("films a client's photo without showing more of it — a push-in, or a still camera while she walks — and keeps it as photographed", () => {
    const photo = planClipMotion(4, "commercial", "person", { lines, plates: [true, true, true, true] });
    const first = build(null, 0, line, photo[0]);
    expect(first).toContain("Smooth, steady push-in as she comes closer, ending in a medium shot: she walks slowly toward the camera");
    expect(first).toContain(`this real place exactly ${VEO_FRAME_LOCK} shows it — the same layout, fixtures, products, signage, logo, colours and light; she moves within it, and nothing new is added to it`);
    const still = photo.find((c) => c.camera.key === "static_locked")!;
    expect(still.walks).toBe(true);
    expect(build(null, still.clip, line, still)).toMatch(/\n\n(?:Steady medium-wide shot from a still camera as she walks along|Still camera, full shot to medium shot as she comes closer): she walks/);
    for (const c of photo) expect(build(null, c.clip, line, c)).not.toMatch(/side-tracking|lateral dolly|arc shot/i);
  });

  it("uses the director's action when it is safe and true to the plan — a longer walk is fine now", () => {
    const walk = "She walks slowly toward the camera across the open boutique floor, glancing at the dress rail as she passes, then opens her palm toward the new dresses";
    expect(build({ action: walk }, 0)).toContain(": she walks slowly toward the camera across the open boutique floor, glancing at the dress rail as she passes");
    const along = "She walks five unhurried steps along the glass counter, her hand gliding over the gold necklaces, then turns to the lens with a smile.";
    expect(build({ action: along }, 1)).toContain(": she walks five unhurried steps along the glass counter, her hand gliding over the gold necklaces, then turns to the lens with a smile. Natural");
    expect(build({ action: along }, 1)).not.toMatch(/\.\./);
  });

  it("refuses an action that leaves, climbs, tours the whole place, freezes, runs, backs away, waves, names a camera move or changes the light", () => {
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
    ];
    for (const clip of [...plan, turn]) {
      for (const action of refused) {
        expect(resolveDirection(clip, { action }, "She").action, `${clip.staging.key}: ${action}`).toBe(stagingPath(clip, "She"));
      }
    }
  });

  // A live run (2026-10-05) refused "her hand toward the bridal saree on the mannequin" as a frozen pose.
  it("keeps an in-place action that only names a thing in the frame — a mannequin, a statue, a saree's length — or a gesture", () => {
    expect(turn.staging.key).toBe("turn_present");
    expect(turn.walks).toBe(false);
    for (const action of [
      "She turns her head and upper body toward the ornate mannequin, her hand gesturing toward the bridal saree displayed.",
      "She raises her palm toward the temple statue behind her with a gentle smile.",
      "She points to the frozen desserts in the glass counter and smiles at the lens.",
      "She unfolds the silk saree to show its full length, then turns back to the lens.",
      "She crosses her arms with a confident smile, then opens one palm toward the viewer.",
      "She lifts the necklace from on top of the glass counter toward the lens.",
      "She unfolds the pallu to reveal its zari border, then smiles at the lens.",
      "She runs her hand along the silk saree on the counter, then smiles at the lens.",
    ]) expect(resolveDirection(turn, { action }, "She").action, action).toBe(action.replace(/\.$/, ""));
  });

  it("names a single presenter as the prompt does, and takes any quoted words out of the action", () => {
    expect(resolveDirection(turn, { action: 'The model turns toward the "SRI LAKSHMI SILKS" sign, then the model smiles at the lens.' }, "She").action)
      .toBe("She turns toward the sign, then she smiles at the lens");
    expect(resolveDirection(turn, { action: "The model nods." }, "He").action).toBe("He nods");
  });

  it("walks on a walking clip, and only there", () => {
    expect(resolveDirection(turn, { action: "she walks two steps toward the camera" }, "She").action).toBe(stagingPath(turn, "She"));
    expect(resolveDirection(plan[1], { action: "she smiles and points at the shelf behind her" }, "She").action).toBe(stagingPath(plan[1], "She"));
    const deity = planClipMotion(4, "commercial", "deity")[0];
    expect(resolveDirection(deity, { action: "Ganesha walks slowly toward the viewer" }, "Ganesha").action).toBe(stagingPath(deity, "Ganesha"));
  });

  it("walks a pair only together, side by side — never one alone, never toward the lens, never growing", () => {
    const pair = planClipMotion(4, "commercial", "person", { twoHander: true });
    const names = { a: "Priya", b: "Kavya" };
    const walk = pair[0];
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
    expect(p).toContain("— Motu talks and gestures toward what they pass while Patlu reacts; then Patlu answers with an open palm while Motu reacts. The framing drifts a little toward whoever is speaking, never closer.");
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
      expect(p).toContain(`Keep both characters exactly as drawn, with the same designs, colours, builds and heights — Motu on the left and Patlu on the right — and the same place, logo, colours and light ${VEO_FRAME_LOCK}; they move within that place, and nothing new is added to it.`);
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
      expect(p).toContain("Ganesha moves within that place");
      expect(MOVING).toContain(clip.camera.key);
      expect(p).not.toMatch(WALK_WORDS);
      expect(p).not.toContain("their face");
      expect(p).toContain("no frozen pose,");
      expect(p).not.toContain("static pose");
    }
  });

  it("closes on an invitation in — never a goodbye", () => {
    for (const p of plan.map((c) => build(null, c.clip))) expect(p).toContain("no goodbye wave");
    expect(build(null, 3)).toContain("invites the viewer in, both palms opening toward the lens in a warm come-in gesture");
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
  it("directs only the ACTION of each clip — a real walk where the plan walks, never the camera, never the look", () => {
    const p = VEO_SEGMENT_SYSTEM_PROMPT(4, "female");
    expect(p).toContain("You direct the ACTION of short image-to-video clips");
    expect(p).toContain("starts from ONE attached still");
    expect(p).toContain("never a talking portrait");
    expect(p).toContain("PLANNED ACTION — what the model (a woman) does in this clip, and whether and where they walk. Keep it; make it specific to THIS frame.");
    expect(p).toContain("CAMERA — the camera move, already decided. You never change it");
    expect(p).toContain("A WALK (when the PLANNED ACTION walks): a slow, natural walk on the floor the frame shows");
    expect(p).toContain("never away from the camera, never running, never walking backward.");
    expect(p).toContain('IN PLACE (when the PLANNED ACTION says "no steps")');
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

  it("tells the director where each clip walks — or that it does not", () => {
    const single = planClipMotion(4, "commercial");
    expect(walkHint(single[0])).toBe("a slow walk toward the camera on the open floor the frame shows");
    expect(walkHint(single[1])).toBe("a slow walk along the counter, display or open floor the frame shows beside them");
    expect(walkHint(single[3])).toBe("the last few steps toward the camera on the open floor the frame shows");
    const pair = planClipMotion(4, "commercial", "person", { twoHander: true });
    expect(walkHint(pair[0])).toBe("both together, side by side, a slow walk along the counter, display or open floor the frame shows beside them");
    expect(walkHint(pair[3])).toBe("both together, side by side, a few steps across the floor the frame shows, then both turn to the camera");
    const photo = planClipMotion(4, "commercial", "person", { twoHander: true, plates: [true, true, true, true] });
    expect(walkHint(photo[0])).toContain("(the camera stays still — only a few steps)");
    for (const clip of planClipMotion(4, "commercial", "deity")) expect(walkHint(clip)).toBe("performed where they stand, no steps");
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
    expect(veoEditProblems(fresh, fresh.replace("Smooth side-tracking shot", "Slow arc shot"))).toEqual([]);
    const old = "Slow dolly in: she speaks.\n\nWith a voice, she says in Telugu:\n\"ఒకటి.\"\n\nPreserve her exact face, and keep the place, its objects, logo, colours and light exactly as in the attached frame for the whole clip.\n\nNegative prompt: No text.";
    expect(veoEditProblems(old, old.replace(" exactly as in the attached frame", "")).join(" ")).toContain(`"${LEGACY_VEO_FRAME_LOCK}" went missing`);
  });
});
