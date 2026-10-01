import { describe, it, expect } from "vitest";
import {
  CAMERA_MOVES, SHOT_ANGLES, STAGINGS, assembleVeoPrompt, cameraLabel, clipRoles, compositionFor, fillCast, framingForMotion,
  parseVeoDirections, planClipMotion, resolveDirection, spokenLinesIn, stagingForLine, stagingPath, withoutQuotedSpeech,
  withoutStillness, withoutTravel, VEO_DIRECTION_SYSTEM_PROMPT, MOTION_COMPOSITION_HEADING, withMotionComposition,
  DUO_SAFE_MOVES, COLOUR_LOCK, QUALITY_RULES, speechAccentFor,
} from "@/services/prompts/motion";
import { MULTI_FRAME_SYSTEM_PROMPT, VEO_SEGMENT_SYSTEM_PROMPT, modelVeoSubject } from "@/services/prompts";
import {
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT, characterDirectionBlock, packPerformer,
  packVeoSubject,
} from "@/services/prompts/characterAd";
import { getCharacterPack, packSpeakers } from "@/services/characterPacks";
import { formatDialogueScript, parseDialogueClips } from "@/utils/dialogueFormat";

/**
 * FRAME-BOUNDED MOTION. Every clip does what its line and its scene need — stand and tell, show the
 * product, present the space, invite the viewer in — filmed with a move that only ever moves closer,
 * drifts a little or pulls focus. Nobody walks, nothing beyond the still is ever shown, the people and
 * the place never change, and nobody waves goodbye. The frame is the whole world of its clip.
 */

const GOODBYE = /\b(?:wav(?:e|es|ing) (?:goodbye|bye)|bye-bye|farewell wave)\b/i;
/** Moves that show space the still never had — the cause of stretched shops and roads. */
const REVEALING = /\b(?:pull(?:s|ing)? back|pulls? out|dolly(?:ing|ies)? out|crane|pedestal|pans? (?:across|slowly)|orbit|tracking|follows?|grand reveal)\b/i;

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
  it("introduces the business standing, eases in slowly, and ends inviting the viewer in", () => {
    const plan = planClipMotion(4, "commercial");
    expect(plan[0].staging.key).toBe("stand_present");
    expect(plan[0].camera.key).toBe("dolly_in");
    expect(plan[0].angle.key).toBe("eye_level");
    expect(plan.at(-1)!.staging.key).toBe("welcome_invite");
    expect(stagingPath(plan.at(-1)!, "She")).toContain("never a goodbye: no waving, no bye-bye hand");
  });

  /** Walking was where presenters stepped over tables, walked toward the lens and out onto the road. */
  it("never walks — there is no walking staging at all, whatever the lines or the scene plan ask", () => {
    expect(Object.keys(STAGINGS)).toEqual(["stand_present", "show_product", "present_space", "welcome_invite"]);
    for (const performer of ["person", "cartoon", "deity"] as const) {
      for (const twoHander of [false, true]) {
        const plan = planClipMotion(6, "commercial", performer, {
          twoHander,
          lines: Array.from({ length: 6 }, () => "Come inside our big showroom."),
          choices: Array.from({ length: 6 }, () => ({ staging: "walk_and_talk", camera: "follow_tracking" })),
        });
        for (const clip of plan) {
          expect(Object.keys(STAGINGS)).toContain(clip.staging.key);
          expect(stagingPath(clip, "She")).not.toMatch(/\bwalks?\b/);
        }
      }
    }
  });

  it("mixes stand, show and present across an ad — never all the same", () => {
    const kinds = new Set(planClipMotion(6, "commercial").map((p) => p.staging.key));
    expect(kinds.has("stand_present")).toBe(true);
    expect(kinds.has("show_product")).toBe(true);
    expect(kinds.has("present_space")).toBe(true);
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
    expect(plan[1].camera.key).toBe("push_in");
    expect(plan[1].lens).toBe("85mm");
  });

  it("takes the scene plan's choices only where they are frame-safe", () => {
    const plan = planClipMotion(4, "commercial", "person", {
      choices: [
        { staging: "present_space", camera: "truck", angle: "low_angle" },
        { staging: "walk_and_talk", camera: "pull_back" },
        { staging: "nonsense", camera: "crane_up", angle: "worms_eye" },
        { staging: "stand_present" },
      ],
    });
    expect(plan[0].staging.key).toBe("present_space");
    expect(plan[0].camera.key).toBe("truck");
    expect(plan[0].angle.key).toBe("low_angle");
    // An old plan's walking, pull-back, crane and worm's-eye are simply not in the vocabulary any more.
    for (const clip of plan) {
      expect(Object.keys(CAMERA_MOVES)).toContain(clip.camera.key);
      expect(Object.keys(SHOT_ANGLES)).toContain(clip.angle.key);
    }
    expect(plan[3].staging.key).toBe("welcome_invite");
  });

  it("films with moves that only move closer, drift a little or pull focus — never one that reveals more", () => {
    expect(Object.keys(CAMERA_MOVES).sort()).toEqual(["arc", "dolly_in", "handheld", "push_in", "rack_focus", "static_locked", "truck"]);
    for (const move of Object.values(CAMERA_MOVES)) {
      expect(move.lens, move.key).toMatch(/^\d+mm$/);
      expect(move.speed, move.key).toBeTruthy();
      expect(move.action, move.key).not.toMatch(REVEALING);
      expect(move.action, move.key).not.toMatch(/\b(?:crash zoom|whip|360)\b/i);
    }
    expect(Object.keys(SHOT_ANGLES)).toEqual(["eye_level", "low_angle", "high_angle"]);
    const deity = planClipMotion(4, "commercial", "deity");
    expect(deity[1].gesture).toContain("never touching, holding or presenting it");
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

  it("follows the speaker in a two-hander with the focus, on some clips, not all", () => {
    const focus = planClipMotion(6, "commercial", "cartoon", { twoHander: true }).map((p) => p.focus);
    expect(focus).toContain("speaker");
    expect(focus).toContain("both");
    expect(planClipMotion(4, "commercial").every((p) => p.focus === "both")).toBe(true);
  });

  it("keeps every fallback beat alive, travelling nowhere, and never a goodbye", () => {
    for (const performer of ["person", "cartoon", "deity"] as const) {
      for (const twoHander of [false, true]) {
        for (const p of [...planClipMotion(8, "festival", performer, { twoHander }), ...planClipMotion(1, "commercial", performer, { twoHander })]) {
          expect(p.fallbackBeats).toHaveLength(3);
          const beats = p.fallbackBeats.join(" ");
          expect(beats, `${performer} ${p.role}`).toMatch(/palm|hand|gesture|turns|nod|namaste|bow|smile/);
          expect(beats, `${performer} ${p.role}`).not.toMatch(GOODBYE);
          expect(beats, `${performer} ${p.role}`).not.toMatch(/\bwalk/);
          // A pair never leans in or steps toward the lens — that is one of them growing.
          if (twoHander) expect(beats, `${performer} ${p.role}`).not.toMatch(/\blean|\bstep|toward the camera|toward the lens/);
        }
      }
    }
  });

  it("writes the staging for whoever performs, with the right pronouns", () => {
    const plan = planClipMotion(4, "commercial");
    expect(stagingPath(plan[0], "She")).toMatch(/^She stands where the frame has her, facing the camera/);
    expect(stagingPath(plan[0], "Both characters", true)).toMatch(/^Both characters stand where the frame has them/);
    expect(fillCast(STAGINGS.show_product.path, "She")).toContain("then turns back to the lens, without taking a step");
    expect(fillCast(STAGINGS.show_product.path, "Both characters", true)).toContain("then turn back to the lens");
  });
});

describe("frames built for each clip's staging", () => {
  const lines = ["Namaste.", "See our new collection.", "Trusted for years.", "Visit us."];
  const plan = planClipMotion(4, "commercial", "person", { lines });
  const modelFrame = () =>
    MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, lines, "", "female", "", false, "", undefined, plan);

  it("composes each frame as the whole world of its clip — clear floor, the product within reach, inside", () => {
    const p = modelFrame();
    expect(p).toContain("FRAMES BUILT FOR MOTION (EACH FRAME IS THE FIRST MOMENT OF ITS CLIP)");
    expect(p).toContain("Nobody walks in these videos: each FRAME is the whole world of its clip");
    expect(p).toContain("CLEAR FLOOR, NO FURNITURE IN FRONT");
    expect(p).toContain("THE THING TO SHOW WITHIN REACH");
    expect(p).toContain("INSIDE THE BUSINESS, ALWAYS");
    expect(p).not.toContain("A WALK NEEDS ITS FLOOR");
    for (const clip of plan.slice(1)) {
      expect(p).toContain(framingForMotion(clip));
      expect(p).toContain(`🧍 POSE: ${clip.staging.start}`);
    }
    expect(framingForMotion(plan[1])).toContain("the clip is animated inside exactly this view");
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

  it("does the same for a character pack, and lets each clip's note decide where they stand", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    const packPlan = planClipMotion(4, "commercial", "cartoon", { twoHander: true, lines });
    const p = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, {
      segmentCount: 4, clipSummaries: lines, locationMode: "ai_generated", locationPlan: "",
      aspectRatio: "9:16", adType: "commercial", motionPlan: packPlan,
    });
    expect(p).toContain("Each clip's video follows its own 🎬 note");
    expect(p).toContain("Each frame IS the whole world of its 8-second video");
    expect(p).toContain("nobody is placed in a doorway, half out of the shop or on the road");
    expect(p).not.toContain("WALK AND TALK");
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

  it("frames a drawn character head to feet, and a real person three-quarter, with clear floor in front", () => {
    const cartoon = planClipMotion(4, "commercial", "cartoon")[0];
    expect(compositionFor(cartoon)).toContain("the full figure from head to feet");
    expect(compositionFor(plan[0])).toContain("three-quarter body (head to knees)");
    expect(compositionFor(plan[0])).toContain(`shot ${plan[0].angle.name.toLowerCase()} on a ${plan[0].lens} lens`);
    expect(compositionFor(plan[0])).toContain("the floor in front of them clear");
  });
});

describe("the Veo prompt", () => {
  const lines = ["Namaste.", "See our new collection.", "Trusted for years.", "Visit us."];
  const plan = planClipMotion(4, "commercial", "person", { lines });
  const model = modelVeoSubject("female");
  const line = "శ్రీ సాయి మోటార్స్ లో మీ బైక్ సర్వీస్ అదే రోజు.";
  const build = (direction?: any, clip = 0, spoken = line, extra: Record<string, unknown> = {}) => assembleVeoPrompt({
    aspectRatio: "9:16", plan: plan[clip], direction, identityLock: model.identityLock, language: "Telugu",
    speech: [{ voice: model.voice, line: spoken }], cast: model.cast, castPlural: model.castPlural, ...extra,
  });

  it("opens by bounding the clip to the attached frame — nobody walks, nothing beyond its edges", () => {
    const p = build(null);
    expect(p.split("\n")[0]).toContain("one continuous 8-second shot that brings the attached frame to life");
    expect(p).toContain("THE ATTACHED FRAME — THE WHOLE WORLD OF THIS CLIP:");
    expect(p).toContain("Nobody walks toward the camera, across the room or out of it");
    expect(p).toContain("nobody steps onto, over or through a table, counter, cupboard, rack or any furniture");
    expect(p).toContain("The camera never shows anything beyond the frame's edges: no new rooms, no stretched, extended or rebuilt shop, no street or road");
    // First, because a video model weighs the opening of a prompt most.
    expect(p.indexOf("THE ATTACHED FRAME")).toBeLessThan(p.indexOf("ACTION —"));
  });

  it("says what the frame shows — the director's reading of it, else the frame's own background or photo", () => {
    // The director writes a sentence; the code's fallback is a place, which gets a verb in front of it.
    expect(build({ frame: "the presenter stands in the saree section, a rack of silk sarees within reach" }))
      .toContain("The presenter stands in the saree section, a rack of silk sarees within reach. The whole video");
    expect(build(null, 0, line, { frameScene: "the billing counter with the spare-parts rack behind" }))
      .toContain("It shows the billing counter with the spare-parts rack behind.");
    const real = build(null, 0, line, { frameScene: "the client's own photograph #2 of their entrance", realPhoto: true });
    expect(real).toContain("It shows the client's own photograph #2 of their entrance.");
    expect(real).toContain("This place is the client's own business, from their real photograph — it stays exactly as photographed.");
    // A description that moves is not a picture.
    expect(build({ frame: "she walks toward the camera from the entrance" })).not.toContain("It shows she walks");
  });

  it("stages, films in the standard terms, times the performance and keeps the line exact — with no direction at all", () => {
    const p = build(null);
    expect(p).toContain(`ACTION — STAND AND TELL:\nShe stands where the frame has her`);
    expect(p).toContain(`CAMERA — ${cameraLabel(plan[0])}: ${fillCast(plan[0].camera.action, "She")}`);
    expect(p).toMatch(/• 0–2s: .+\n• 2–5s: .+\n• 5–8s: .+/);
    expect(spokenLinesIn(p)).toEqual([line]);
  });

  it("refuses walking, the furniture, a revealing camera and leaving the place in its negatives — on every clip", () => {
    for (const p of plan.map((clip) => build(null, clip.clip))) {
      expect(p).toContain("No walking — not toward the camera, across the room, around the shop, through a door or out of the business");
      expect(p).toContain("No stepping, standing, sitting or climbing on tables, counters, cupboards, racks, shelves or any furniture");
      expect(p).toContain("No camera pull-back, pan, crane, pedestal, orbit or tracking shot; no wide reveal; nothing shown beyond the frame's edges");
      expect(p).toContain("No new rooms, no stretched, extended or rebuilt shop, no street, road or outdoor scene, no change of location");
      expect(p).toContain("THE PLACE: every object stays exactly where it is, whole");
      expect(p).not.toMatch(/WALK AND TALK|walks only a few steps/);
    }
  });

  it("never waves goodbye — the ending is an invitation in", () => {
    for (const p of plan.map((clip) => build(null, clip.clip))) {
      expect(p).toContain("No frozen pose or statue stiffness; no waving goodbye or bye-bye hand");
      expect(p).toContain("No waving goodbye at any point; an ending is an invitation in");
    }
    expect(build(null, 3)).toContain("This is an invitation to come, never a goodbye");
  });

  it("lets a single presenter's camera move closer or drift, never back or around, and locks the person", () => {
    const p = build(null, 2);
    expect(plan[2].camera.key).toBe("dolly_in");
    expect(p).toContain("only ever moves closer or drifts a little — it never pulls back, pans away, rises or circles around");
    expect(p).toContain("THE PERSON: keep her face (100% face match), her hair, her outfit, the logo and the location exactly as in the frame");
    expect(p).toContain("No change of face, hair, outfit, colours, height, build or body proportions — nobody grows, shrinks or stretches");
    expect(p).toContain("no slow motion, hyperlapse or time-lapse while anyone speaks");
  });

  it("puts the frame, the locks and the action before the camera, the performance and the speech", () => {
    const p = build(null);
    const at = (s: string) => p.indexOf(s);
    expect(at("THE ATTACHED FRAME")).toBeLessThan(at("LOCKED — "));
    expect(at("LOCKED — ")).toBeLessThan(at("ACTION — "));
    expect(at("ACTION — ")).toBeLessThan(at("CAMERA —"));
    expect(at("CAMERA —")).toBeLessThan(at("PERFORMANCE — ALIVE, NATURAL, IN PLACE"));
    expect(at("PERFORMANCE — ")).toBeLessThan(at("SPEECH:"));
  });

  it("stays short — one lock block, one negative list, no repetition", () => {
    // It had grown to ~1,200 words with five overlapping lock blocks; a rule stated three ways is averaged.
    expect(build(null).split(/\s+/).length).toBeLessThan(950);
  });

  it("uses the director's direction when it stays inside the frame", () => {
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

  it("refuses walking, the furniture, a revealing camera, leaving, freezing or a broken shot — on every clip", () => {
    for (const clip of [plan[1], plan[2]]) {
      for (const bad of [
        { path: "she walks toward the camera along the aisle, presenting the racks" },
        { path: "she steps onto the low display table to point at the top shelf" },
        { path: "she walks out of the shop and onto the road" },
      ]) {
        expect(resolveDirection(clip, bad, "She").path).toBe(stagingPath(clip, "She"));
      }
      for (const camera of ["the camera pulls back for a grand reveal of the whole store", "a slow pan across the showroom", "the camera cranes up over the counters", "a crash zoom and a whip pan in slow motion"]) {
        expect(resolveDirection(clip, { camera }, "She").camera).toBe(fillCast(clip.camera.action, "She"));
      }
      const d = resolveDirection(clip, { beats: ["walks into the table", "stands perfectly still", "nods"], sceneLife: "a customer walks in" }, "She");
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
      camera: "a slow arc of a few degrees around her.",
      beats: ["0–2s: smiles to the lens.", "2-5s - open palm on the name", "(5–8 sec) a warm nod."],
      sceneLife: "a fan turns..",
    });
    expect(p).not.toMatch(/\.\./);
    expect(p).toContain("a slow arc of a few degrees around her. A slow, ultra smooth move");
    expect(p).toContain("• 0–2s: smiles to the lens\n");
    expect(p).toContain("• 2–5s: open palm on the name\n");
    expect(p).toContain("• 5–8s: a warm nod\n");
    expect(p).toContain("SCENE LIFE: a fan turns.");
  });

  it("locks the face and speaks in the ad's language", () => {
    const p = build(null);
    expect(p).toContain("keep her face (100% face match), her hair, her outfit, the logo and the location exactly as in the frame");
    expect(p).toContain("a very sweet, warm, confident female voice, speaking Telugu, perfectly lip-synced");
    expect(p).toContain(QUALITY_RULES);
  });

  const duo = (packId: string, clip = 1, extra: Record<string, unknown> = {}) => {
    const pack = getCharacterPack(packId)!;
    const s = packVeoSubject(pack);
    const [a, b] = pack.characters;
    return assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial", packPerformer(pack), { twoHander: true })[clip],
      identityLock: s.identityLock, language: "Telugu",
      speech: s.speech([{ name: a.name, text: "one" }, { name: b.name, text: "two" }]),
      performanceNotes: s.performanceNotes, cast: s.cast, castPlural: s.castPlural, twoHander: s.twoHander,
      manner: s.manner, handGestures: s.handGestures, scaleNote: s.scaleNote, drawnCast: s.drawnCast, ...extra,
    });
  };

  it("follows the conversation in a two-hander with the focus only, when the plan says so", () => {
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
    expect(focused).toContain("SPEAKER FOCUS — ONLY THE FOCUS MOVES:");
    expect(focused).toContain("0–4s: the focus rests on Motu (on the LEFT of the frame) while they speak");
    expect(focused).toContain("4–8s: the focus rests on Patlu (on the RIGHT of the frame)");
    expect(focused).toContain("The camera itself does not move toward either of them");
    expect(focused).toContain("WHO SPEAKS — STRICT, NEVER SWAPPED:");
    expect(spokenLinesIn(focused)).toEqual(["one", "two"]);
    expect(build2(2)).not.toContain("SPEAKER FOCUS");
  });

  /**
   * The whole path a real run takes for a two-hander: the script is STORED in the display form
   * (`[Chhota Bheem]: …`), and the Veo prompts are built by reading it back — see utils/dialogueFormat.
   */
  it("carries BOTH voices when a character's name is two words", () => {
    const pack = getCharacterPack("duo_bheem_chutki")!;
    const cast = packSpeakers(pack);
    const s = packVeoSubject(pack);
    const script = formatDialogueScript([cast.map((c, i) => ({ speaker: c.key, text: `Line ${i + 1}.` }))], cast);
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
    expect(prompt).toContain("no line spoken by the wrong speaker");
  });

  it("opens a two-hander's prompt with the scale lock — and Motu & Patlu's with their own heights", () => {
    const prompt = duo("duo_motu_patlu");
    expect(prompt.indexOf("SCALE LOCK")).toBeLessThan(prompt.indexOf("LOCKED — "));
    expect(prompt).toContain("Motu and Patlu keep EXACTLY the heights, builds and body proportions of the attached frame");
    expect(prompt).toContain("Motu's head stays level with Patlu's shoulder for the whole clip");
    expect(prompt).toContain("their feet stay on the same line of floor");
    expect(prompt).toContain("no character moving nearer the lens than the other");
    // A single presenter has no pair to hold, so it is not given the block.
    expect(build(null, 1)).not.toContain("SCALE LOCK");
  });

  /**
   * Motu and Patlu grew because the video prompt asked for "Photoreal … natural skin … natural joints"
   * and "a real presenter" — for two drawn men. The drawn characters stay drawn; the shop stays real.
   */
  it("keeps cartoon characters drawn — no photoreal finish, no human anatomy, no longer legs", () => {
    const prompt = duo("duo_motu_patlu");
    expect(prompt).toContain("LOOK: Motu and Patlu stay 2D cartoon characters drawn exactly as in the attached frame");
    expect(prompt).toContain("never given real human anatomy, longer legs or a longer body");
    expect(prompt).toContain("No realistic, live-action, 3D or human-anatomy version of the cartoon characters");
    expect(prompt).not.toContain(QUALITY_RULES);
    expect(prompt).not.toMatch(/like a real presenter|a lean in on the important words/);
  });

  it("films a pair only from a fixed distance, at eye level — whatever the scene plan or the director asks", () => {
    const choices = [
      { camera: "orbit", angle: "low_angle" }, { camera: "dolly_in" }, { camera: "crane_up", angle: "worms_eye" },
      { camera: "push_in" }, { camera: "pedestal" }, null,
    ];
    const pairPlan = planClipMotion(6, "commercial", "cartoon", { twoHander: true, choices: choices as never });
    for (const clip of pairPlan) {
      expect(DUO_SAFE_MOVES).toContain(clip.camera.key);
      expect(clip.angle.key).toBe("eye_level");
      expect(clip.twoHander).toBe(true);
    }
    const s = packVeoSubject(getCharacterPack("duo_motu_patlu")!);
    const prompt = assembleVeoPrompt({
      aspectRatio: "9:16", plan: pairPlan[1], identityLock: s.identityLock, language: "Telugu",
      speech: s.speech([{ name: "Motu", text: "one" }, { name: "Patlu", text: "two" }]),
      cast: s.cast, castPlural: s.castPlural, twoHander: true, manner: s.manner, handGestures: s.handGestures,
      direction: {
        path: "Motu steps forward proudly toward the camera", camera: "Low angle, the camera dollies in on Motu",
        beats: ["Patlu rises onto his toes", "b", "c"], sceneLife: "sunlight streams through the window",
      },
    });
    expect(prompt).not.toMatch(/dollies in|Low angle, the camera|steps forward proudly|rises onto his toes|sunlight streams/);
    expect(prompt).toContain("The camera keeps the SAME distance and the SAME height from both for all 8 seconds");
    expect(prompt).toContain("No zoom, no dolly, no push-in, no low or high angle");
  });

  /**
   * A cast of invented people is pointed at, not named: "Girl" names nobody a video model can see,
   * and an image or video model reads "Girl and Boy" as two children.
   */
  it("points at real people by what the picture shows — never by their script labels", () => {
    const mixed = duo("human_duo_mixed");
    expect(mixed).toContain("ONLY the woman (on the LEFT of the frame) speaks this line");
    expect(mixed).toContain("0–4s — the woman (on the LEFT of the frame), a bright, warm young woman's voice");
    expect(mixed).toContain("4–8s — the man (on the RIGHT of the frame), a calm, confident man's voice");
    expect(mixed).not.toMatch(/\b(?:Girl|Boy)\b/);
    expect(mixed).toContain("The man stays about half a head taller than the woman");

    const female = duo("human_duo_female");
    expect(female).toContain("ONLY the woman on the LEFT speaks this line");
    expect(female).toContain("The woman on the RIGHT keeps the mouth closed");
    expect(female).not.toMatch(/\b(?:Friend|Host)\b/);

    const kids = duo("kids_duo_mixed");
    expect(kids).toContain("ONLY the boy (on the LEFT of the frame) speaks this line");
    expect(kids).toContain("4–8s — the girl (on the RIGHT of the frame), a clear, sweet girl's voice of about nine");
    expect(kids).toContain("Both children are alive for the whole 8 seconds, with the natural, playful, joyful energy of real children");
    expect(kids).toContain("they never grow taller or older");
    // Real children are photographed, not drawn.
    expect(kids).toContain(QUALITY_RULES);
  });

  /** English ads came out in a British or American voice — the prompt said only "speaking English". */
  it("speaks an English ad in Indian English with an Andhra Pradesh accent, and leaves other languages native", () => {
    const english = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial")[1], identityLock: "her face",
      language: "English", speech: [{ voice: "a very sweet, warm, confident female voice", line: "Come to Sri Sai Motors today." }],
    });
    expect(english.split("\n")[0]).toContain("spoken in Indian English with a natural Andhra Pradesh accent");
    expect(english).toContain("VOICE AND ACCENT — INDIAN ENGLISH ONLY:");
    expect(english.indexOf("VOICE AND ACCENT")).toBeLessThan(english.indexOf("SPEECH:"));
    expect(english).toContain("speaking Indian English with a natural Andhra Pradesh accent, perfectly lip-synced");
    expect(english).toContain("No British, American, Australian or any other foreign accent");
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
    expect(solo.indexOf("THE PICTURE:")).toBeLessThan(solo.indexOf("ACTION —"));
    expect(solo).toContain("No washed-out, pale, hazy or overexposed colour");
    expect(solo).not.toContain("soft light shifts");
    expect(solo).toContain("with the light exactly as the frame has it");
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
  it("reads each clip's frame, directs inside it, never walks, never reveals, never cuts", () => {
    const p = VEO_SEGMENT_SYSTEM_PROMPT(4, "female");
    expect(p).toContain("THE FRAME IS THE WHOLE WORLD OF ITS CLIP");
    expect(p).toContain("FRAME — the prompt the still was generated from");
    expect(p).toContain("PLANNED STAGING — stand and tell / show the product / present the space / invite the viewer in");
    expect(p).toContain("PLANNED CAMERA — the angle, lens, move and speed");
    for (const move of ["Locked Frame", "Slow Dolly In", "Push In on the Product", "Rack Focus", "Slight Arc", "Short Slide", "Handheld Float"]) {
      expect(p, move).toContain(move);
    }
    expect(p).not.toMatch(/Crane Up|Follow Tracking|Pull Back|Worm's eye|Dutch tilt/);
    expect(p).toContain("NOBODY WALKS");
    expect(p).toContain("NOTHING BEYOND THE FRAME");
    expect(p).toContain("THE WORLD IS LOCKED");
    expect(p).toContain("One continuous shot. Never a cut");
    expect(p).toContain("Never slow motion, hyperlapse or time-lapse while anyone speaks");
    expect(p).toContain("NEVER a goodbye wave");
    expect(p).toContain("Never describe the face, hair, skin, outfit or jewellery");
    expect(p).toContain("NEVER quote the spoken words in path or beats");
    expect(p).toContain('"frame": ""');
  });

  it("reads its JSON reply by clip number, frame description included, and survives a broken one", () => {
    const out = parseVeoDirections(JSON.stringify([{ clip: 2, frame: "f", path: "p", camera: "b", beats: ["1", "2", "3"], sceneLife: "s" }]), 3);
    expect(out[0]).toBeNull();
    expect(out[1]?.camera).toBe("b");
    expect(out[1]?.frame).toBe("f");
    expect(parseVeoDirections("nonsense", 2)).toEqual([null, null]);
  });

  it("gives a pack its characters' own direction, with the plan and the frame winning", () => {
    const p = VEO_DIRECTION_SYSTEM_PROMPT({ clipCount: 2, aspectRatio: "9:16", subject: "Motu and Patlu", characterDirection: "HOW THIS CHARACTER PERFORMS" });
    expect(p).toContain("the planned staging, the frame and the planned camera always win");
    expect(p).toContain("When the plan says SPEAKER FOCUS, only the focus moves to whoever is speaking");
  });

  it("tells a pair's director the camera keeps its distance, and a single presenter's that it may only move closer", () => {
    const pair = CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(getCharacterPack("duo_motu_patlu")!, 4);
    expect(pair).toContain("For this PAIR the camera NEVER changes its distance or height to them");
    expect(pair).toContain("A PAIR NEVER CHANGES SIZE");
    const solo = VEO_DIRECTION_SYSTEM_PROMPT({ clipCount: 2, aspectRatio: "9:16", subject: "the model" });
    expect(solo).toContain("It may move closer (dolly in, push in) or drift a little; it never pulls back, pans away, rises, cranes, orbits or follows anyone");
    for (const prompt of [pair, solo]) {
      expect(prompt).toContain("THE LIGHT AND COLOUR ARE LOCKED");
      expect(prompt).not.toContain("light shifting through a window");
    }
  });

  it("tells a deity's director to move slowly and bless", () => {
    const pack = getCharacterPack("god_shiva")!;
    expect(packPerformer(pack)).toBe("deity");
    expect(CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, 4)).toContain("A deity moves slowly and majestically, and every gesture is a blessing");
  });
});

/**
 * The catalogue was written for held frames and, in places, for walking tours and steps toward the
 * lens. What reaches the video director has all of it taken out — and no camera direction, because the
 * plan owns the camera.
 */
describe("character direction without the stillness or the travel", () => {
  it("drops the clauses that order stillness and keeps the character", () => {
    const out = withoutStillness(
      "Motu leans in on his question; Patlu stays planted and completely still, which is the whole joke — one of them is bouncing and the other has not moved. In the closing frame both turn front-on together.",
    );
    expect(out).toContain("Motu leans in on his question;");
    expect(out).toContain("In the closing frame both turn front-on together.");
    expect(out).not.toMatch(/planted|still|has not moved/);
  });

  it("drops the clauses that walk or step toward the lens, and keeps the rest", () => {
    const out = withoutTravel("Motu bounces on his heels with excitement. He walks the length of the counter pointing at everything. Motu rocks forward on his question, sometimes taking a half step towards the thing exciting him. His eyes go wide on the price.");
    expect(out).toContain("Motu bounces on his heels with excitement.");
    expect(out).toContain("His eyes go wide on the price.");
    expect(out).not.toMatch(/walks|half step|rocks forward/);
  });

  it("sends the video director no camera direction, no stillness, no walking and no goodbye wave, for every pack", () => {
    for (const id of ["duo_motu_patlu", "god_shiva", "god_lakshmi", "solo_patlu", "normal_male", "owner_face_female", "human_duo_female", "human_duo_mixed", "kids_duo_female", "kids_duo_mixed"]) {
      const video = characterDirectionBlock(getCharacterPack(id)!, "video");
      expect(video, id).not.toContain("CAMERA & CINEMATIC DIRECTION");
      expect(video, id).not.toMatch(/\b(planted|motionless|tripod|locked-off|stillness|never walks)\b/i);
      expect(video, id).not.toMatch(/\bwalk(s|ing)?\b|half step|rocks forward/i);
      expect(video, id).not.toMatch(GOODBYE);
    }
    expect(characterDirectionBlock(getCharacterPack("duo_motu_patlu")!, "frame")).toContain("CAMERA & CINEMATIC DIRECTION");
  });

  it("keeps what a deity must never touch", () => {
    const video = characterDirectionBlock(getCharacterPack("god_ganesha")!, "video");
    expect(video).toContain("never points at, touches, holds or presents the client's products");
  });
});
