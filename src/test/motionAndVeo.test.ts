import { describe, it, expect } from "vitest";
import {
  CAMERA_MOVES, SHOT_ANGLES, STAGINGS, assembleVeoPrompt, cameraLabel, clipRoles, compositionFor, fillCast, framingForMotion,
  parseVeoDirections, planClipMotion, resolveDirection, spokenLinesIn, stagingForLine, stagingPath, withoutQuotedSpeech,
  withoutStillness, withoutTravel, VEO_DIRECTION_SYSTEM_PROMPT, MOTION_COMPOSITION_HEADING, withMotionComposition,
  DUO_SAFE_MOVES, CARTOON_PAIR_MOVES, COLOUR_LOCK, speechAccentFor, frameSummaryOf, withoutApproach, withScaleAnchor,
  SCALE_ANCHOR_HEADING,
} from "@/services/prompts/motion";
import { MULTI_FRAME_SYSTEM_PROMPT, VEO_SEGMENT_SYSTEM_PROMPT, modelVeoSubject } from "@/services/prompts";
import {
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT, characterDirectionBlock, packPerformer,
  packVeoSubject,
} from "@/services/prompts/characterAd";
import { getCharacterPack, packSpeakers } from "@/services/characterPacks";
import { formatDialogueScript, parseDialogueClips } from "@/utils/dialogueFormat";

/**
 * Every clip ANIMATES ITS OWN FRAME and nothing beyond it (2026-10-01): stand and tell, show the
 * product, present the space or invite the viewer in — always in place, nobody walks — filmed with a
 * camera that only tightens on or breathes around what the still shows. The people and the place
 * never change, the frame's edges are never crossed, and nobody waves goodbye.
 */

/** Words that would send the camera or a body somewhere the still does not show. */
const TRAVELS = /\b(?:walks?|walking|steps? (?:toward|forward|closer)|follow tracking|steadicam|pulls? back|dolly out|crane|orbit|arcs? |pans? |tilts? |trucks? )\b/i;

const GOODBYE = /\b(?:wav(?:e|es|ing) (?:goodbye|bye)|bye-bye|farewell wave)\b/i;

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

describe("the motion plan", () => {
  it("introduces the business standing, eased in on, and ends inviting the viewer in", () => {
    const plan = planClipMotion(4, "commercial");
    expect(plan[0].staging.key).toBe("stand_present");
    expect(plan[0].camera.key).toBe("push_in");
    expect(plan[0].angle.key).toBe("eye_level");
    expect(plan.at(-1)!.staging.key).toBe("welcome_invite");
    expect(stagingPath(plan.at(-1)!, "She")).toContain("never a goodbye: no waving, no bye-bye hand");
  });

  // Still varied — stand and tell, show the product, present the space — but always in place.
  it("mixes stand, show and present across an ad — never all the same, and never a walk", () => {
    const plan = planClipMotion(6, "commercial");
    const kinds = new Set(plan.map((p) => p.staging.key));
    expect(kinds.has("stand_present")).toBe(true);
    expect(kinds.has("show_product")).toBe(true);
    expect(kinds.has("present_space")).toBe(true);
    expect(Object.keys(STAGINGS)).toEqual(["stand_present", "show_product", "present_space", "welcome_invite"]);
  });

  it("reads each line for what it asks: a product to show, the place to present, a promise to stand behind", () => {
    expect(stagingForLine("See our new silk saree collection.", "proof", "person")).toBe("show_product");
    expect(stagingForLine("మా కొత్త కలెక్షన్ చూడండి.", "proof", "person")).toBe("show_product");
    expect(stagingForLine("Come inside our big showroom.", "proof", "person")).toBe("present_space");
    expect(stagingForLine("Trusted by families for twenty years.", "proof", "person")).toBe("stand_present");
    expect(stagingForLine("anything", "trust", "person")).toBe("stand_present");
    expect(stagingForLine("Come inside our big showroom.", "proof", "deity")).toBe("present_space");
    const plan = planClipMotion(3, "commercial", "person", { lines: ["Namaste.", "See our gold jewellery designs.", "Visit us."] });
    expect(plan[1].staging.key).toBe("show_product");
    expect(plan[1].camera.key).toBe("rack_focus");
    expect(plan[1].lens).toBe("85mm");
  });

  it("takes the scene plan's choices where they are usable, and reads a saved walk as presenting the space", () => {
    const plan = planClipMotion(4, "commercial", "person", {
      choices: [{ staging: "walk_and_talk", camera: "follow_tracking", angle: "eye_level" }, { staging: "show_product", camera: "rack_focus", angle: "high_angle" }, { staging: "nonsense", camera: "crane_down", angle: "worms_eye" }, { staging: "stand_present" }],
    });
    expect(plan[0].staging.key).toBe("present_space");
    // A retired move is never used: the staging's own in-frame move instead.
    expect(plan[0].camera.key).toBe("handheld");
    expect(plan[1].camera.key).toBe("rack_focus");
    expect(plan[1].angle.key).toBe("high_angle");
    expect(Object.keys(CAMERA_MOVES)).toContain(plan[2].camera.key);
    expect(plan[2].angle.key).toBe("eye_level");
    // An unusable choice falls back to the code plan; the last clip is always the invitation.
    expect(Object.keys(STAGINGS)).toContain(plan[2].staging.key);
    expect(plan[3].staging.key).toBe("welcome_invite");
  });

  /**
   * Walking toward the camera sent people onto the road and over the furniture, and in a pair it is
   * one character nearer the lens than the other — the excuse the model takes to re-proportion them.
   */
  it("never walks anyone — a person, a pair, a cartoon or a deity — whatever the lines or the plan ask", () => {
    for (const performer of ["person", "cartoon", "deity"] as const) {
      for (const twoHander of [false, true]) {
        for (const n of [2, 3, 4, 6, 8]) {
          const plan = planClipMotion(n, "commercial", performer, {
            twoHander,
            lines: Array.from({ length: n }, () => "Come inside our big showroom."),
            choices: Array.from({ length: n }, () => ({ staging: "walk_and_talk", camera: "follow_tracking" })),
          });
          for (const clip of plan) {
            expect(Object.keys(STAGINGS), `${performer} ${n}`).toContain(clip.staging.key);
            expect(stagingPath(clip, "She"), `${performer} ${n}`).not.toMatch(TRAVELS);
            expect(clip.camera.action, `${performer} ${n}`).not.toMatch(TRAVELS);
          }
        }
      }
    }
  });

  it("never stages or films two neighbouring clips the same way", () => {
    for (const n of [2, 3, 4, 6, 8, 15]) {
      const plan = planClipMotion(n, "commercial");
      for (let i = 1; i < plan.length; i++) {
        expect(plan[i].staging.key, `${n} clips, clip ${i + 1}`).not.toBe(plan[i - 1].staging.key);
        expect(plan[i].camera.key, `${n} clips, clip ${i + 1}`).not.toBe(plan[i - 1].camera.key);
      }
    }
  });

  it("is the same every time, so a regenerated clip keeps its shot", () => {
    const lines = ["a", "our collection", "years of trust", "d", "e"];
    expect(planClipMotion(5, "commercial", "person", { lines })).toEqual(planClipMotion(5, "commercial", "person", { lines }));
  });

  it("follows the speaker in a two-hander with the focus only, on some clips, not all", () => {
    const plan = planClipMotion(6, "commercial", "cartoon", { twoHander: true });
    const focus = plan.map((p) => p.focus);
    expect(focus).toContain("speaker");
    expect(focus).toContain("both");
    for (const clip of plan) expect(clip.focus === "speaker").toBe(clip.camera.key === "rack_focus");
    expect(planClipMotion(4, "commercial").every((p) => p.focus === "both")).toBe(true);
  });

  it("keeps every fallback beat alive and never a goodbye", () => {
    for (const performer of ["person", "cartoon", "deity"] as const) {
      for (const p of [...planClipMotion(8, "festival", performer), ...planClipMotion(1, "commercial", performer)]) {
        expect(p.fallbackBeats).toHaveLength(3);
        const beats = p.fallbackBeats.join(" ");
        expect(beats, `${performer} ${p.role}`).toMatch(/palm|hand|gesture|turns|nod|namaste|bow/);
        expect(beats, `${performer} ${p.role}`).not.toMatch(GOODBYE);
        expect(beats, `${performer} ${p.role}`).not.toMatch(/\bwalk|\bsteps?\b|\blean/);
      }
    }
  });

  it("keeps every staging in place — nobody walks, steps or travels", () => {
    for (const staging of Object.values(STAGINGS)) {
      expect(fillCast(staging.path, "She"), staging.key).not.toMatch(TRAVELS);
      expect(staging.start, staging.key).not.toMatch(/open stretch of floor|running toward the camera|about to step/);
    }
    expect(fillCast(STAGINGS.stand_present.path, "She")).toContain("feet planted where they are");
  });

  // Every move that showed MORE than the still made the video model invent the rest of the shop.
  it("films only with moves that stay inside the frame, in natural angles, and a deity blessings only", () => {
    expect(Object.keys(CAMERA_MOVES)).toEqual(["push_in", "rack_focus", "handheld", "static_locked"]);
    for (const move of Object.values(CAMERA_MOVES)) {
      expect(move.lens, move.key).toMatch(/^\d+mm$/);
      expect(move.speed, move.key).toBeTruthy();
      expect(move.action, move.key).not.toMatch(/\b(?:crash zoom|whip|360)\b/i);
      expect(move.action, move.key).not.toMatch(TRAVELS);
    }
    expect(CAMERA_MOVES.push_in.action).toContain("never reveals anything beyond its edges");
    expect(Object.keys(SHOT_ANGLES)).toEqual(["eye_level", "low_angle", "high_angle"]);
    const deity = planClipMotion(4, "commercial", "deity");
    expect(deity[1].gesture).toContain("never touching, holding or presenting it");
  });

  it("writes the staging for whoever performs, with the right pronouns", () => {
    const plan = planClipMotion(4, "commercial");
    expect(stagingPath(plan[0], "She")).toMatch(/^She stands where the frame has her, facing the camera/);
    expect(stagingPath(plan[0], "Both characters", true)).toMatch(/^Both characters stand where the frame has them/);
    expect(fillCast(STAGINGS.present_space.path, "She")).toContain("She opens one arm to present the real space behind her");
    expect(fillCast(STAGINGS.present_space.path, "Both characters", true)).toContain("Both characters open one arm to present the real space behind them");
  });
});

describe("frames built for each clip's staging", () => {
  const lines = ["Namaste.", "Come inside our showroom.", "Trusted for years.", "Visit us."];
  const plan = planClipMotion(4, "commercial", "person", { lines });
  const modelFrame = () =>
    MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, lines, "", "female", "", false, "", undefined, plan);

  it("composes each frame for its own clip — a product within reach, every clip in place", () => {
    const p = modelFrame();
    expect(p).toContain("FRAMES BUILT FOR MOTION (EACH FRAME IS THE FIRST MOMENT OF ITS CLIP)");
    expect(p).toContain("animates THAT frame and nothing beyond it");
    expect(p).toContain("the variety of the ad comes from YOUR frames");
    expect(p).not.toMatch(/WALK NEEDS ITS FLOOR|WALKS AND TALKS/);
    expect(p).toContain("THE THING TO SHOW WITHIN REACH");
    expect(p).toContain("INSIDE THE BUSINESS, ALWAYS");
    for (const clip of plan.slice(1)) {
      expect(p).toContain(framingForMotion(clip));
      expect(p).toContain(`🧍 POSE: ${clip.staging.start}`);
    }
    expect(plan[1].staging.key).toBe("present_space");
    expect(framingForMotion(plan[1])).not.toMatch(/open stretch of floor|toward the camera/);
  });

  // Clip 1's image is the face every later frame is matched to.
  it("keeps the hero pose on clip 1, named with its camera", () => {
    const p = modelFrame();
    expect(p).toContain(`🎬 THIS CLIP: ${plan[0].staging.name} — filmed ${cameraLabel(plan[0])}. Keep the hero framing and pose exactly`);
    expect(p).toContain("formal front-clasp");
  });

  it("leaves a frame prompt without a plan exactly as before", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, ["a", "b", "c", "d"], "", "female", "", false, "");
    expect(p).not.toContain("FRAMES BUILT FOR MOTION");
    expect(p).not.toContain("🎬");
    expect(p).toContain("Mandatory direct eye contact to the camera while holding this new pose");
  });

  it("does the same for a character pack, and lets each clip's note decide where they go", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    const packPlan = planClipMotion(4, "commercial", "cartoon", { twoHander: true, lines });
    const p = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, {
      segmentCount: 4, clipSummaries: lines, locationMode: "ai_generated", locationPlan: "",
      aspectRatio: "9:16", adType: "commercial", motionPlan: packPlan,
    });
    expect(p).toContain("Each clip's video animates THIS still and nothing beyond it");
    expect(p).toContain("Nobody walks in the video, so the variety of the ad comes from YOUR frames");
    expect(p).not.toContain("for a walk");
    expect(p).toContain(compositionFor(packPlan[1]));
  });
});

// The frame model dropped the composition note on most continuation frames when merely asked.
describe("the composition stamped onto every frame", () => {
  const plan = planClipMotion(4, "commercial");

  it("adds the clip's staging, camera and composition", () => {
    const stamped = withMotionComposition("A woman at the counter.", plan[1]);
    expect(stamped).toBe(`A woman at the counter.\n\n${MOTION_COMPOSITION_HEADING}: ${plan[1].staging.name} (${cameraLabel(plan[1])}) — ${compositionFor(plan[1])}. Natural and relaxed, hands at rest.`);
  });

  it("keeps a hero pose and adds only what the camera move needs", () => {
    const stamped = withMotionComposition("The hero frame.", plan[0], { keepPose: true });
    expect(stamped).toBe(`The hero frame.\n\n${MOTION_COMPOSITION_HEADING}: this pose opens the clip (${plan[0].staging.name}, ${cameraLabel(plan[0])}) — ${plan[0].camera.framing}; every object fully inside the frame and clear of the body.`);
  });

  it("never stamps twice, and leaves an empty prompt alone", () => {
    const once = withMotionComposition("A frame.", plan[0]);
    expect(withMotionComposition(once, plan[0])).toBe(once);
    expect(withMotionComposition("", plan[0])).toBe("");
    expect(withMotionComposition("A frame.", undefined)).toBe("A frame.");
  });

  it("frames a drawn character head to feet, and a real person three-quarter", () => {
    const cartoon = planClipMotion(4, "commercial", "cartoon")[0];
    expect(compositionFor(cartoon)).toContain("the full figure from head to feet");
    expect(compositionFor(plan[0])).toContain("three-quarter body (head to knees)");
    expect(compositionFor(plan[0])).toContain(`shot ${plan[0].angle.name.toLowerCase()} on a ${plan[0].lens} lens`);
  });
});

describe("the Veo prompt", () => {
  const lines = ["Namaste.", "Come inside our showroom.", "Trusted for years.", "Visit us."];
  const plan = planClipMotion(4, "commercial", "person", { lines });
  const model = modelVeoSubject("female");
  const line = "శ్రీ సాయి మోటార్స్ లో మీ బైక్ సర్వీస్ అదే రోజు.";
  const build = (direction?: any, clip = 0, spoken = line) => assembleVeoPrompt({
    aspectRatio: "9:16", plan: plan[clip], direction, identityLock: model.identityLock, language: "Telugu",
    speech: [{ voice: model.voice, line: spoken }], cast: model.cast, castPlural: model.castPlural,
  });

  it("stages, films in the standard terms, times the performance and keeps the line exact — with no direction at all", () => {
    const p = build(null);
    expect(p).toContain("one continuous 8-second shot, animated from the attached frame");
    expect(p).toContain(`ACTION — STAND AND TELL, IN PLACE:\nShe stands where the frame has her`);
    expect(p).toContain(`CAMERA — ${cameraLabel(plan[0])}: ${fillCast(plan[0].camera.action, "She")}`);
    expect(p).toMatch(/• 0–2s: .+\n• 2–5s: .+\n• 5–8s: .+/);
    expect(spokenLinesIn(p)).toEqual([line]);
  });

  /**
   * The user's report: presenters walked toward the camera and out onto the road, characters walked over
   * tables and cupboards, and the shop stretched into one the client does not own. Every clip is now
   * bounded by its frame — on a "showroom" line too, which used to be a walk.
   */
  it("never walks on any clip, and bounds every clip to its frame", () => {
    expect(plan[1].staging.key).toBe("present_space");
    for (const clip of plan) {
      const p = build(null, clip.clip);
      expect(p).toContain("FRAME BOUNDARY — THIS VIDEO SHOWS ONLY WHAT THE ATTACHED FRAME SHOWS:");
      expect(p).toContain("The camera never reveals anything beyond the frame's four edges");
      expect(p).toContain("the place never extends, widens, stretches, grows or rebuilds itself");
      expect(p).toContain("She is already in place, exactly where the frame has her, and stands there for the whole clip with both feet on the real floor");
      expect(p).toContain("No walking, no steps, no stepping forward or toward the camera");
      expect(p).toContain("No climbing onto, standing on or walking over tables, counters, shelves, cupboards or any furniture");
      expect(p).toContain("no pull-back, dolly-out, zoom-out, crane, pedestal, orbit, arc, pan, tilt, truck or tracking shot");
      expect(p).toContain("no extended, enlarged, stretched or rebuilt shop");
      expect(p).not.toMatch(/walks and talks|a few steps along/);
    }
  });

  // The video is told what it is animating, read from the prompt the still was made from.
  it("describes the attached frame from its own prompt when the director gives no description", () => {
    const framePrompt = "A woman in a maroon silk saree stands at the billing counter of a clothing store, folded shirts on the shelves behind her. Soft daylight.\n\nCOMPOSITION FOR MOTION: Stand and tell (Eye level · 50mm) — three-quarter body.\n\nBACKGROUND FOR THIS CLIP: the billing counter with folded shirts. This background is different from every other clip's, and it belongs to the store.";
    const p = assembleVeoPrompt({
      aspectRatio: "9:16", plan: plan[0], identityLock: model.identityLock, language: "Telugu",
      speech: [{ voice: model.voice, line }], cast: model.cast, castPlural: model.castPlural, framePrompt,
    });
    expect(p).toContain("THE ATTACHED FRAME — WHAT THIS VIDEO ANIMATES, AND ALL IT MAY SHOW:\nA woman in a maroon silk saree stands at the billing counter of a clothing store");
    expect(p).toContain("Background: the billing counter with folded shirts.");
    expect(p).not.toContain("COMPOSITION FOR MOTION: Stand");
    // Near the top, before the locks.
    expect(p.indexOf("THE ATTACHED FRAME")).toBeLessThan(p.indexOf("COLOUR AND LIGHT LOCK"));
    // The director's own description wins when it is usable, and a walking one is refused.
    expect(resolveDirection(plan[0], { frame: "she stands by the counter, shirts behind her" }, "She", false, framePrompt).frame)
      .toBe("she stands by the counter, shirts behind her");
    expect(resolveDirection(plan[0], { frame: "she walks out onto the road" }, "She", false, framePrompt).frame)
      .toContain("A woman in a maroon silk saree stands at the billing counter");
    expect(frameSummaryOf("")).toBe("");
  });

  // The place is what the walking prompts broke: vanishing furniture, walking into tables, onto the road.
  it("locks the place and everything in it, in every clip", () => {
    for (const p of plan.map((clip) => build(null, clip.clip))) {
      expect(p).toContain("WORLD LOCK — THE PLACE AND EVERYTHING IN IT STAY EXACTLY AS THE FRAME SHOWS:");
      expect(p).toContain("Nothing disappears, appears, melts, morphs, slides, floats or moves by itself");
      expect(p).toContain("nobody climbs onto, stands on or walks over a table, a counter, a shelf or a cupboard");
      expect(p).toContain("nobody walks out of the shop, onto the road or the street, into another shop, or through a door");
      expect(p).toContain("No object disappearing, appearing, moving by itself or changing shape");
    }
  });

  it("never waves goodbye — the ending is an invitation in", () => {
    for (const p of plan.map((clip) => build(null, clip.clip))) {
      expect(p).toContain("No waving goodbye, no bye-bye or farewell wave, no waving at the camera");
      expect(p).toContain("No waving goodbye and no bye-bye hand at any point");
    }
    expect(build(null, 3)).toContain("This is an invitation to come, never a goodbye");
  });

  it("lets a single presenter's camera ease slightly closer, and locks the people instead", () => {
    const p = build(null, 2);
    expect(p).toContain(`CAMERA — ${cameraLabel(plan[2])}`);
    expect(plan[2].camera.key).toBe("push_in");
    expect(p).toContain("A gentle, slow cinematic, ultra smooth move that stays inside the frame");
    expect(p).toContain("THE PEOPLE NEVER CHANGE — ONLY THE CAMERA MOVES:");
    expect(p).toContain("The camera may ease slightly closer, but She keeps exactly the height, build and proportions the frame shows");
    expect(p).toContain("No change of height, build or body proportions — nobody grows or shrinks relative to the room");
    expect(p).toContain("No costume change");
    expect(p).toContain("No fast or shaky camera");
    expect(p).toContain("no slow motion, hyperlapse or time-lapse while anyone speaks");
  });

  it("puts the locks and the action before the camera, the rules and the speech", () => {
    const p = build(null);
    const at = (s: string) => p.indexOf(s);
    expect(at("WORLD LOCK")).toBeLessThan(at("ACTION — "));
    expect(at("ACTION — ")).toBeLessThan(at("CAMERA —"));
    expect(at("CAMERA —")).toBeLessThan(at("PERFORMANCE — ALIVE AND NATURAL"));
    expect(at("PERFORMANCE — ALIVE")).toBeLessThan(at("SPEECH:"));
  });

  it("gives Veo the fixed pronunciation of మరియు when a line has it", () => {
    // The word is written the way it is said, so nothing explains it any more — see utils/spokenNumbers.
    expect(build(null, 0, "బట్టలు mariyu నగలు.")).not.toContain("PRONUNCIATION");
    expect(build(null, 0)).not.toContain("PRONUNCIATION");
  });

  it("uses the director's direction when it is safe for the staging", () => {
    const p = build({
      path: "she stays by the billing counter and presents the spare-parts rack within reach with an open hand",
      camera: "eye level, 50mm, a slow dolly in toward her as she names the service",
      beats: ["smiles to the lens", "an open hand toward the rack on the service", "a nod and a palm on the promise"],
      sceneLife: "a fan turns",
    });
    expect(p).toContain("She stays by the billing counter and presents the spare-parts rack within reach with an open hand.");
    expect(p).toContain("eye level, 50mm, a slow dolly in toward her as she names the service");
    expect(p).toContain("• 2–5s: an open hand toward the rack on the service");
    expect(p).toContain("SCENE LIFE: a fan turns.");
  });

  it("refuses a walk, a step toward the camera, climbing on furniture or a camera that leaves the frame — on every clip", () => {
    for (const clip of plan) {
      for (const path of [
        "she walks toward the camera along the aisle between the saree racks, presenting them",
        "she takes a half step forward and presents the counter",
        "she climbs onto the table to point at the shelf",
      ]) expect(resolveDirection(clip, { path }, "She").path, path).toBe(stagingPath(clip, "She"));
      for (const camera of ["a slow pull back reveals the whole showroom", "the camera orbits around her", "a pan across the store", "a tracking shot follows her"]) {
        expect(resolveDirection(clip, { camera }, "She").camera, camera).toBe(fillCast(clip.camera.action, "She"));
      }
    }
  });

  it("refuses leaving the business, walking into things, freezing or a broken camera — on every clip", () => {
    for (const clip of [plan[1], plan[2]]) {
      const d = resolveDirection(clip, {
        path: "she walks out of the shop and onto the road",
        camera: "a crash zoom and a whip pan in slow motion",
        beats: ["walks into the table", "stands perfectly still", "nods"],
        sceneLife: "a customer walks in",
      }, "She");
      expect(d.path).toBe(stagingPath(clip, "She"));
      expect(d.camera).toBe(fillCast(clip.camera.action, "She"));
      expect(d.beats).toEqual(clip.fallbackBeats);
      expect(d.sceneLife).not.toMatch(/walks/);
    }
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

  it("leaves a beat without quoted dialogue exactly as it was", () => {
    const beat = "an open palm on the line about free delivery";
    expect(withoutQuotedSpeech(beat)).toBe(beat);
    expect(withoutQuotedSpeech("beckons with a 'come in' wave")).toBe("beckons with a 'come in' wave");
  });

  // Both seen on nearly every clip of the first live run: "counter.. Smooth" and "• 0–2s: 0–2s: …".
  it("never doubles the full stop or the time label the prompt supplies", () => {
    const p = build({
      camera: "a slow push-in toward her.",
      beats: ["0–2s: smiles to the lens.", "2-5s - open palm on the name", "(5–8 sec) a warm nod."],
      sceneLife: "a fan turns..",
    });
    expect(p).not.toMatch(/\.\./);
    expect(p).toContain("a slow push-in toward her. A gentle");
    expect(p).toContain("• 0–2s: smiles to the lens\n");
    expect(p).toContain("• 2–5s: open palm on the name\n");
    expect(p).toContain("• 5–8s: a warm nod\n");
    expect(p).toContain("SCENE LIFE: a fan turns.");
  });

  it("locks the face and speaks in the ad's language", () => {
    const p = build(null);
    expect(p).toContain("Keep her face (100% face match), her hair, her outfit, the logo and the location exactly as they are in it");
    expect(p).toContain("a very sweet, warm, confident female voice, speaking Telugu, perfectly lip-synced");
  });

  it("follows the conversation in a two-hander when the plan says so", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    const s = packVeoSubject(pack);
    const duoPlan = planClipMotion(4, "commercial", "cartoon", { twoHander: true, choices: [null, { staging: "show_product", focus: "speaker" }, { focus: "both" }] });
    const build2 = (i: number) => assembleVeoPrompt({
      aspectRatio: "9:16", plan: duoPlan[i], identityLock: s.identityLock, language: "Telugu",
      speech: s.speech([{ name: "Motu", text: "one" }, { name: "Patlu", text: "two" }]),
      performanceNotes: s.performanceNotes, cast: s.cast, castPlural: s.castPlural, twoHander: s.twoHander,
      manner: s.manner, handGestures: s.handGestures,
    });
    const focused = build2(1);
    // Only the focus follows the conversation: a camera easing in on one of them is what grew them.
    expect(focused).toContain("SPEAKER FOCUS — ONLY THE FOCUS MOVES:");
    expect(focused).toContain("0–4s: the focus rests on Motu (on the LEFT of the frame) while Motu speaks");
    expect(focused).toContain("4–8s: the focus rests on Patlu (on the RIGHT of the frame)");
    expect(focused).toContain("The camera itself does not move toward either of them");
    expect(focused).not.toMatch(/eases in toward|glides smoothly across toward/);
    expect(focused).toContain("WHO SPEAKS — STRICT, NEVER SWAPPED:");
    expect(spokenLinesIn(focused)).toEqual(["one", "two"]);
    expect(build2(2)).not.toContain("SPEAKER FOCUS");
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
    const script = formatDialogueScript(
      [cast.map((c, i) => ({ speaker: c.key, text: `Line ${i + 1}.` }))],
      cast,
    );

    // …exactly as geminiService's veoClipsFromScript composes it.
    const nameOf = new Map(cast.map(c => [c.key, c.name]));
    const clip = parseDialogueClips(script, cast)[0];
    const lines = clip.map(l => ({ name: nameOf.get(l.speaker) ?? l.speaker, text: l.text }));
    const prompt = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(2, "commercial", packPerformer(pack), { twoHander: true })[0],
      identityLock: s.identityLock, language: "Telugu", speech: s.speech(lines),
      performanceNotes: s.performanceNotes, cast: s.cast, castPlural: s.castPlural, twoHander: s.twoHander,
      manner: s.manner, handGestures: s.handGestures,
    });

    expect(spokenLinesIn(prompt)).toEqual(["Line 1.", "Line 2."]);
    expect(prompt).toContain("Chhota Bheem (on the LEFT of the frame)");
    expect(prompt).toContain("Chutki (on the RIGHT of the frame)");
    expect(prompt).toContain("no line spoken by the wrong character");
  });

  it("opens a two-hander's prompt with the scale lock, naming both characters", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    const s = packVeoSubject(pack);
    const speech = s.speech([{ name: "Motu", text: "one" }, { name: "Patlu", text: "two" }]);
    const prompt = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial", "cartoon", { twoHander: true })[1],
      identityLock: s.identityLock, language: "Telugu", speech,
      cast: s.cast, castPlural: s.castPlural, twoHander: s.twoHander, manner: s.manner, handGestures: s.handGestures,
    });
    // First, because a video model weighs the opening of a prompt most.
    expect(prompt.indexOf("SCALE LOCK")).toBeLessThan(prompt.indexOf("LOCKED — THE LOOK"));
    expect(prompt).toContain("Motu and Patlu keep EXACTLY the heights");
    expect(prompt).toContain("The camera keeps ONE fixed distance and height for the whole clip");
    expect(prompt).toContain("their feet stay on the same line of floor");
    expect(prompt).toContain("No character moving nearer the lens than the other");
    expect(prompt).toContain("No character growing taller, stretching, leaning toward the camera, rising onto the toes");
    expect(prompt).not.toContain("SCALE ANCHOR — EXACTLY");
    // A pack's scale anchor goes into the lock, word for word — the same words the frame carried.
    const anchored = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial", "cartoon", { twoHander: true })[1],
      identityLock: s.identityLock, language: "Telugu", speech, scaleAnchor: s.scaleAnchor,
      cast: s.cast, castPlural: s.castPlural, twoHander: s.twoHander, manner: s.manner, handGestures: s.handGestures,
    });
    expect(s.scaleAnchor).toBe(pack.scaleAnchor);
    expect(anchored).toContain(`SCALE ANCHOR — EXACTLY AS IN THE ATTACHED FRAME, FOR ALL 8 SECONDS: ${pack.scaleAnchor!.replace(/\.$/, "")}.`);
    expect(anchored.indexOf("SCALE ANCHOR")).toBeLessThan(anchored.indexOf("COLOUR AND LIGHT LOCK"));
    // A single presenter has no pair to hold, so it is not given the block.
    const solo = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial")[1], identityLock: "her face",
      language: "Telugu", speech: [{ voice: "a warm voice", line: "one" }],
    });
    expect(solo).not.toContain("SCALE LOCK");
  });

  /**
   * Motu and Patlu grew in the finished videos because the pair was filmed with dolly-ins, push-ins,
   * cranes, a low-angle orbit and a camera easing in on the speaker — every one of them changes the
   * pair's size on screen, and a video model re-draws a cartoon body from scratch as the view changes.
   */
  it("films a pair only from a fixed distance, at eye level — whatever the scene plan or the director asks", () => {
    const choices = [
      { camera: "orbit", angle: "low_angle" }, { camera: "dolly_in" }, { camera: "crane_up", angle: "worms_eye" },
      { camera: "push_in" }, { camera: "pedestal" }, null,
    ];
    const duo = planClipMotion(6, "commercial", "cartoon", { twoHander: true, choices: choices as never });
    for (const clip of duo) {
      // A DRAWN pair — Motu and Patlu — is never filmed with any camera movement at all.
      expect(CARTOON_PAIR_MOVES).toContain(clip.camera.key);
      expect(clip.angle.key).toBe("eye_level");
      expect(clip.twoHander).toBe(true);
    }
    // Real people as a pair may also have a barely-there float, never a push-in.
    const people = planClipMotion(6, "commercial", "person", { twoHander: true, choices: choices as never });
    for (const clip of people) expect(DUO_SAFE_MOVES).toContain(clip.camera.key);
    expect(people.some((c) => c.camera.key === "handheld")).toBe(true);
    // A single presenter keeps its own in-frame moves, and may be eased in on.
    expect(planClipMotion(6, "commercial", "person", { choices: choices as never })[3].camera.key).toBe("push_in");

    const s = packVeoSubject(getCharacterPack("duo_motu_patlu")!);
    const prompt = assembleVeoPrompt({
      aspectRatio: "9:16", plan: duo[1], identityLock: s.identityLock, language: "Telugu",
      speech: s.speech([{ name: "Motu", text: "one" }, { name: "Patlu", text: "two" }]),
      cast: s.cast, castPlural: s.castPlural, twoHander: true, manner: s.manner, handGestures: s.handGestures,
      direction: {
        path: "Motu steps forward proudly toward the camera", camera: "Low angle, the camera dollies in on Motu",
        beats: ["Patlu rises onto his toes", "b", "c"], sceneLife: "sunlight streams through the window",
      },
    });
    expect(prompt).not.toMatch(/dollies in|Low angle, the camera|steps forward proudly|rises onto his toes|sunlight streams/);
    expect(prompt).toContain("The camera keeps the SAME distance and the SAME height from both characters for all 8 seconds");
    expect(prompt).toContain("No zoom, no dolly, no push-in or pull-back, no crane or pedestal, no orbit or arc");
    expect(prompt).not.toContain("No static or locked-off camera");
    expect(prompt).toContain("THE PAIR NEVER CHANGES SIZE — THE CAMERA KEEPS ITS DISTANCE");
  });

  /** English ads came out in a British or American voice — the prompt said only "speaking English". */
  it("speaks an English ad in Indian English with an Andhra Pradesh accent, and leaves other languages native", () => {
    const english = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial")[1], identityLock: "her face",
      language: "English", speech: [{ voice: "a very sweet, warm, confident female voice", line: "Come to Sri Sai Motors today." }],
    });
    // The opening line, the block above the words, each spoken line and the negatives all say it.
    expect(english.split("\n")[0]).toContain("spoken in Indian English with a natural Andhra Pradesh accent");
    expect(english).toContain("VOICE AND ACCENT — INDIAN ENGLISH ONLY:");
    expect(english.indexOf("VOICE AND ACCENT")).toBeLessThan(english.indexOf("SPEECH:"));
    expect(english).toContain("speaking Indian English with a natural Andhra Pradesh accent, perfectly lip-synced");
    expect(english).toContain("No British, American, Australian or any other foreign accent");
    // The spoken line itself is untouched.
    expect(spokenLinesIn(english)).toEqual(["Come to Sri Sai Motors today."]);

    const telugu = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial")[1], identityLock: "her face",
      language: "Telugu", speech: [{ voice: "a warm voice", line: "రండి." }],
    });
    expect(telugu).not.toContain("VOICE AND ACCENT");
    expect(telugu).toContain("speaking Telugu, perfectly lip-synced");

    expect(speechAccentFor("english")).not.toBeNull();
    expect(speechAccentFor("English (India)")).not.toBeNull();
    expect(speechAccentFor("Hindi")).toBeNull();
  });

  it("gives a cartoon pair speaking English the same Indian accent", () => {
    const s = packVeoSubject(getCharacterPack("duo_motu_patlu")!);
    const prompt = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial", "cartoon", { twoHander: true })[1],
      identityLock: s.identityLock, language: "English",
      speech: s.speech([{ name: "Motu", text: "one" }, { name: "Patlu", text: "two" }]),
      cast: s.cast, castPlural: s.castPlural, twoHander: true, manner: s.manner, handGestures: s.handGestures,
    });
    expect(prompt.match(/speaking Indian English with a natural Andhra Pradesh accent/g)).toHaveLength(2);
    expect(prompt).toContain("VOICE AND ACCENT — INDIAN ENGLISH ONLY:");
  });

  /** Finished videos came back paler and lighter than the frame they were animated from. */
  it("holds every video to the frame's exact colour and exposure", () => {
    const solo = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial")[1], identityLock: "her face",
      language: "Telugu", speech: [{ voice: "a warm voice", line: "one" }],
      direction: { path: "", camera: "", beats: [], sceneLife: "soft light shifts across the counter" },
    });
    expect(solo).toContain(COLOUR_LOCK);
    // Near the top — a video model weighs the opening of a prompt most.
    expect(solo.indexOf("COLOUR AND LIGHT LOCK")).toBeLessThan(solo.indexOf("ACTION —"));
    expect(solo).toContain("No washed-out, faded, pale, pastel or desaturated colour");
    expect(solo).not.toContain("soft light shifts");
    expect(solo).toContain("with the light exactly as the frame has it");
    // A single presenter's camera never leaves the frame either.
    expect(solo).toContain("No camera move that shows anything beyond the attached frame");
  });

  it("gives a deity the catalogue voice and blessings only", () => {
    const s = packVeoSubject(getCharacterPack("god_ganesha")!);
    const [speech] = s.speech([{ name: "Ganesha", text: "x" }]);
    expect(speech.voice).not.toContain("from the show");
    const p = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial", "deity")[1], identityLock: s.identityLock, language: "Telugu",
      speech: s.speech([{ name: "Ganesha", text: "x" }]), cast: s.cast, manner: s.manner, handGestures: s.handGestures,
    });
    expect(p).toContain("with slow, graceful, majestic presence");
    expect(p).toContain("never touching, holding, pointing at or presenting products, money or a phone");
  });
});

describe("the director call", () => {
  it("directs each clip's staging in the standard camera vocabulary, never re-describes the person, and never cuts", () => {
    const p = VEO_SEGMENT_SYSTEM_PROMPT(4, "female");
    expect(p).toContain("HOW THE TEAM WORKS — READ THIS FIRST");
    expect(p).toContain("FRAME — the prompt the still was generated from");
    expect(p).toContain("PLANNED STAGING — stand and tell / show the product / present the space / invite the viewer in. Always in place");
    expect(p).toContain("PLANNED CAMERA — the angle, lens, move and speed");
    expect(p).toContain("THE CAMERA VOCABULARY — ONLY MOVES THAT STAY INSIDE THE FRAME");
    for (const term of ["Slow Push In", "Rack Focus", "Gentle Float", "Static Locked", "85mm + Rack Focus → product to face, premium detail"]) {
      expect(p, term).toContain(term);
    }
    expect(p).not.toMatch(/Follow Tracking|Crane Up|Worm's eye|Dutch tilt|steadicam/);
    expect(p).toContain("IN PLACE, ALWAYS. Nobody walks, steps, comes toward the camera");
    expect(p).toContain("THE FRAME IS THE WHOLE WORLD");
    expect(p).toContain('"frame": ""');
    expect(p).toContain("THE WORLD IS LOCKED");
    expect(p).toContain("INSIDE THE BUSINESS ONLY");
    expect(p).toContain("One continuous shot. Never a cut");
    expect(p).toContain("Never slow motion, hyperlapse or time-lapse while anyone speaks");
    expect(p).toContain("NEVER a goodbye wave");
    expect(p).toContain("Never describe the face, hair, skin, outfit or jewellery");
    expect(p).toContain("NEVER quote the spoken words in path or beats");
    expect(p).toContain('"path": ""');
  });

  it("reads its JSON reply by clip number, and survives a broken one", () => {
    const out = parseVeoDirections(JSON.stringify([{ clip: 2, frame: "f", path: "p", camera: "b", beats: ["1", "2", "3"], sceneLife: "s" }]), 3);
    expect(out[0]).toBeNull();
    expect(out[1]?.camera).toBe("b");
    expect(out[1]?.frame).toBe("f");
    expect(parseVeoDirections("nonsense", 2)).toEqual([null, null]);
  });

  it("gives a pack its characters' own direction, with the plan winning", () => {
    const p = VEO_DIRECTION_SYSTEM_PROMPT({ clipCount: 2, aspectRatio: "9:16", subject: "Motu and Patlu", characterDirection: "HOW THIS CHARACTER PERFORMS" });
    expect(p).toContain("the planned staging, the frame boundary, the world lock and the planned camera always win");
    expect(p).toContain("When the plan says SPEAKER FOCUS, only the focus moves to whoever is speaking");
  });

  it("tells a pair's director the camera keeps its distance, and a single presenter's that it may move in", () => {
    const pair = CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(getCharacterPack("duo_motu_patlu")!, 4);
    expect(pair).toContain("For this PAIR the camera NEVER changes its distance or height to them");
    expect(pair).toContain("A PAIR NEVER CHANGES SIZE");
    const solo = VEO_DIRECTION_SYSTEM_PROMPT({ clipCount: 2, aspectRatio: "9:16", subject: "the model" });
    expect(solo).toContain("It may ease slightly closer (a slow push-in) or float gently; it never travels, widens or swings round");
    // Neither is shown a change of light as an example of scene life any more.
    for (const prompt of [pair, solo]) {
      expect(prompt).toContain("THE LIGHT AND COLOUR ARE LOCKED");
      expect(prompt).not.toContain("light shifting through a window");
    }
  });

  it("tells a deity's director to move slowly and bless", () => {
    const pack = getCharacterPack("god_shiva")!;
    expect(packPerformer(pack)).toBe("deity");
    const p = CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, 4);
    expect(p).toContain("A deity moves slowly and majestically, and every gesture is a blessing");
  });
});

/**
 * The catalogue was written for held frames and, in places, for walking tours. What reaches the video
 * director has both taken out — and no camera direction at all, because the plan owns the camera.
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
