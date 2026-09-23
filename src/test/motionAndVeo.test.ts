import { describe, it, expect } from "vitest";
import {
  CAMERA_MOVES, SHOT_ANGLES, STAGINGS, assembleVeoPrompt, cameraLabel, clipRoles, compositionFor, fillCast, framingForMotion,
  parseVeoDirections, planClipMotion, resolveDirection, spokenLinesIn, stagingForLine, stagingPath, withoutQuotedSpeech,
  withoutStillness, withoutTravel, VEO_DIRECTION_SYSTEM_PROMPT, MOTION_COMPOSITION_HEADING, withMotionComposition,
} from "@/services/prompts/motion";
import { MULTI_FRAME_SYSTEM_PROMPT, VEO_SEGMENT_SYSTEM_PROMPT, modelVeoSubject } from "@/services/prompts";
import {
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT, characterDirectionBlock, packPerformer,
  packVeoSubject,
} from "@/services/prompts/characterAd";
import { getCharacterPack, packSpeakers } from "@/services/characterPacks";
import { formatDialogueScript, parseDialogueClips } from "@/utils/dialogueFormat";

/**
 * Every clip does what its LINE, its SCENE and the kind of video need — stand and tell, walk and talk,
 * show the product, present the space, invite the viewer in — filmed with a named camera angle, lens,
 * move and speed. A walk is only ever a few steps along floor the frame already shows; the people and
 * the place never change; and nobody waves goodbye.
 */

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
  it("introduces the business standing, filmed as a hero, and ends inviting the viewer in", () => {
    const plan = planClipMotion(4, "commercial");
    expect(plan[0].staging.key).toBe("stand_present");
    expect(plan[0].camera.key).toBe("orbit");
    expect(plan[0].angle.key).toBe("low_angle");
    expect(plan.at(-1)!.staging.key).toBe("welcome_invite");
    expect(stagingPath(plan.at(-1)!, "She")).toContain("never a goodbye: no waving, no bye-bye hand");
  });

  // The team's rule: sometimes stand and tell, sometimes walk and talk, sometimes show the product.
  it("mixes stand, walk and show across an ad — never all the same", () => {
    const plan = planClipMotion(6, "commercial");
    const kinds = new Set(plan.map((p) => p.staging.key));
    expect(kinds.has("stand_present")).toBe(true);
    expect(kinds.has("walk_and_talk")).toBe(true);
    expect(kinds.has("show_product")).toBe(true);
  });

  it("reads each line for what it asks: a product to show, the place to walk, a promise to stand behind", () => {
    expect(stagingForLine("See our new silk saree collection.", "proof", "person")).toBe("show_product");
    expect(stagingForLine("మా కొత్త కలెక్షన్ చూడండి.", "proof", "person")).toBe("show_product");
    expect(stagingForLine("Come inside our big showroom.", "proof", "person")).toBe("walk_and_talk");
    expect(stagingForLine("Trusted by families for twenty years.", "proof", "person")).toBe("stand_present");
    expect(stagingForLine("anything", "trust", "person")).toBe("stand_present");
    expect(stagingForLine("Come inside our big showroom.", "proof", "deity")).toBe("present_space");
    const plan = planClipMotion(3, "commercial", "person", { lines: ["Namaste.", "See our gold jewellery designs.", "Visit us."] });
    expect(plan[1].staging.key).toBe("show_product");
    expect(plan[1].camera.key).toBe("push_in");
    expect(plan[1].lens).toBe("85mm");
  });

  it("takes the scene plan's choices where they are usable", () => {
    const plan = planClipMotion(4, "commercial", "person", {
      choices: [{ staging: "walk_and_talk", camera: "truck", angle: "eye_level" }, { staging: "present_space", camera: "crane_down" }, { staging: "nonsense", camera: "zoom" }, { staging: "stand_present" }],
    });
    expect(plan[0].staging.key).toBe("walk_and_talk");
    expect(plan[0].camera.key).toBe("truck");
    expect(plan[1].camera.key).toBe("crane_down");
    expect(plan[1].angle.key).toBe("high_angle");
    // An unusable choice falls back to the code plan; the last clip is always the invitation.
    expect(Object.keys(STAGINGS)).toContain(plan[2].staging.key);
    expect(plan[3].staging.key).toBe("welcome_invite");
  });

  /**
   * The worst fault reported from finished duo ads: the two characters come out of the video model
   * at different heights from the still. A walk is a few steps toward the LENS — one character
   * nearer the camera than the other is the excuse the model takes to re-proportion them.
   */
  it("never walks a two-hander toward the camera", () => {
    for (const n of [2, 3, 4, 6, 8]) {
      const plan = planClipMotion(n, "commercial", "cartoon", {
        twoHander: true,
        lines: Array.from({ length: n }, () => "Come inside our big showroom."),
        choices: Array.from({ length: n }, () => ({ staging: "walk_and_talk" as const })),
      });
      expect(plan.some((p) => p.staging.walks), `${n} clips`).toBe(false);
    }
    // A single presenter still walks — there is no relationship to break.
    expect(planClipMotion(6, "commercial", "person").some((p) => p.staging.walks)).toBe(true);
  });

  it("never lets a deity walk", () => {
    const plan = planClipMotion(6, "commercial", "deity", { choices: [{ staging: "walk_and_talk" }] });
    expect(plan.some((p) => p.staging.walks)).toBe(false);
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

  it("follows the speaker in a two-hander on some clips, not all", () => {
    const plan = planClipMotion(6, "commercial", "cartoon", { twoHander: true });
    const focus = plan.map((p) => p.focus);
    expect(focus).toContain("speaker");
    expect(focus).toContain("both");
    expect(planClipMotion(4, "commercial").every((p) => p.focus === "both")).toBe(true);
  });

  it("keeps every fallback beat alive and never a goodbye", () => {
    for (const performer of ["person", "cartoon", "deity"] as const) {
      for (const p of [...planClipMotion(8, "festival", performer), ...planClipMotion(1, "commercial", performer)]) {
        expect(p.fallbackBeats).toHaveLength(3);
        const beats = p.fallbackBeats.join(" ");
        expect(beats, `${performer} ${p.role}`).toMatch(/palm|hand|gesture|turns|nod|lean|namaste|bow|walking/);
        expect(beats, `${performer} ${p.role}`).not.toMatch(GOODBYE);
        if (!p.staging.walks) expect(beats, `${performer} ${p.role}`).not.toMatch(/\bwalk/);
      }
    }
  });

  it("walks only a few steps along clear floor, never toward furniture or a door", () => {
    const walk = STAGINGS.walk_and_talk;
    expect(walk.walks).toBe(true);
    expect(walk.path).toContain("a few natural, unhurried steps toward the camera along the clear, open floor the frame shows");
    expect(walk.path).toContain("never toward a table, a counter, a shelf or a door");
    expect(walk.start).toContain("a clear, open stretch of floor INSIDE the business");
    for (const staging of Object.values(STAGINGS).filter((s) => !s.walks)) {
      expect(fillCast(staging.path, "She")).not.toMatch(/\bwalks? (?:to|through|across|along|in|out|toward)\b/i);
    }
  });

  it("gives every move a lens and speed from the standard vocabulary, and a deity blessings only", () => {
    for (const move of Object.values(CAMERA_MOVES)) {
      expect(move.lens, move.key).toMatch(/^\d+mm$/);
      expect(move.speed, move.key).toBeTruthy();
      expect(move.action, move.key).not.toMatch(/\b(?:crash zoom|whip|360)\b/i);
    }
    expect(Object.keys(SHOT_ANGLES)).toEqual(["eye_level", "low_angle", "high_angle", "birds_eye", "worms_eye", "over_the_shoulder", "pov", "dutch_tilt"]);
    const deity = planClipMotion(4, "commercial", "deity");
    expect(deity[1].gesture).toContain("never touching, holding or presenting it");
  });

  it("writes the staging for whoever performs, with the right pronouns", () => {
    const plan = planClipMotion(4, "commercial");
    expect(stagingPath(plan[0], "She")).toMatch(/^She stands where the frame has her, facing the camera/);
    expect(stagingPath(plan[0], "Both characters", true)).toMatch(/^Both characters stand where the frame has them/);
    expect(fillCast(STAGINGS.walk_and_talk.path, "She")).toContain("talking as she walks");
    expect(fillCast(STAGINGS.walk_and_talk.path, "Both characters", true)).toContain("talking as they walk");
  });
});

describe("frames built for each clip's staging", () => {
  const lines = ["Namaste.", "Come inside our showroom.", "Trusted for years.", "Visit us."];
  const plan = planClipMotion(4, "commercial", "person", { lines });
  const modelFrame = () =>
    MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, lines, "", "female", "", false, "", undefined, plan);

  it("composes each frame for its own clip — a walk gets its floor, a product its reach", () => {
    const p = modelFrame();
    expect(p).toContain("FRAMES BUILT FOR MOTION (EACH FRAME IS THE FIRST MOMENT OF ITS CLIP)");
    expect(p).toContain("A WALK NEEDS ITS FLOOR");
    expect(p).toContain("THE THING TO SHOW WITHIN REACH");
    expect(p).toContain("INSIDE THE BUSINESS, ALWAYS");
    for (const clip of plan.slice(1)) {
      expect(p).toContain(framingForMotion(clip));
      expect(p).toContain(`🧍 POSE: ${clip.staging.start}`);
    }
    expect(plan[1].staging.key).toBe("walk_and_talk");
    expect(framingForMotion(plan[1])).toContain("a clear, open stretch of floor INSIDE the business");
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
    expect(p).toContain("Each clip's video follows its own 🎬 note");
    expect(p).toContain("for a walk, a clear, open, empty stretch of floor inside the business");
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
    expect(p).toContain(`ACTION — STAND AND TELL:\nShe stands where the frame has her`);
    expect(p).toContain(`CAMERA — ${cameraLabel(plan[0])}: ${fillCast(plan[0].camera.action, "She")}`);
    expect(p).toMatch(/• 0–2s: .+\n• 2–5s: .+\n• 5–8s: .+/);
    expect(spokenLinesIn(p)).toEqual([line]);
  });

  it("walks and talks on a walk clip — only along the floor the frame shows", () => {
    const p = build(null, 1);
    expect(p).toContain("ACTION — WALK AND TALK:");
    expect(p).toContain(`CAMERA — Eye level · 35mm · Follow Tracking · steadicam tracking, ultra smooth`);
    expect(p).toContain("She walks only a few steps along the clear, open floor the frame shows ahead");
    expect(p).toContain("walks and talks at the same time");
    expect(p).toContain("No walking across the whole room or around the shop — only a few steps along the clear floor in the frame");
  });

  it("stands on every other clip", () => {
    const p = build(null, 2);
    expect(p).toContain("She is already in place, in the spot the frame shows");
    expect(p).toContain("No walking across the room, no walking around, no walking toward or through the door");
  });

  // The place is what the walking prompts broke: vanishing furniture, walking into tables, onto the road.
  it("locks the place and everything in it, in every clip", () => {
    for (const p of plan.map((clip) => build(null, clip.clip))) {
      expect(p).toContain("WORLD LOCK — THE PLACE AND EVERYTHING IN IT STAY EXACTLY AS THE FRAME SHOWS:");
      expect(p).toContain("Nothing disappears, appears, melts, morphs, slides, floats or moves by itself");
      expect(p).toContain("nobody walks into a table, a counter, a door or a wall");
      expect(p).toContain("Nobody walks out of the shop, onto the road or the street, into another shop, or through a door");
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

  it("lets the camera move closer or further, and locks the people instead", () => {
    const p = build(null, 2);
    expect(p).toContain(`CAMERA — ${cameraLabel(plan[2])}`);
    expect(plan[2].camera.key).toBe("dolly_in");
    expect(p).toContain("THE PEOPLE NEVER CHANGE — ONLY THE CAMERA MOVES:");
    expect(p).toContain("but She keeps exactly the height, build and proportions the frame shows");
    expect(p).toContain("No change of height, build or body proportions — nobody grows or shrinks relative to the room");
    expect(p).toContain("No costume change");
    expect(p).toContain("No static or locked-off camera");
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
    expect(build(null, 0, "బట్టలు మరియు నగలు.")).toContain('PRONUNCIATION (say these words exactly like this): మరియు = "mariyu"');
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

  it("accepts a walk on a walk clip, and refuses it anywhere else", () => {
    const walking = { path: "she walks toward the camera along the aisle between the saree racks, presenting them" };
    expect(resolveDirection(plan[1], walking, "She").path).toBe(walking.path);
    expect(resolveDirection(plan[2], walking, "She").path).toBe(stagingPath(plan[2], "She"));
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
      camera: "a slow arc around her.",
      beats: ["0–2s: smiles to the lens.", "2-5s - open palm on the name", "(5–8 sec) a warm nod."],
      sceneLife: "a fan turns..",
    });
    expect(p).not.toMatch(/\.\./);
    expect(p).toContain("a slow arc around her. A clearly visible");
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
    expect(focused).toContain("SPEAKER FOCUS — THE CAMERA FOLLOWS THE CONVERSATION:");
    expect(focused).toContain("0–4s: the camera eases in toward Motu (on the LEFT of the frame) and pulls focus to Motu while Motu speaks");
    expect(focused).toContain("4–8s: the camera glides smoothly across toward Patlu (on the RIGHT of the frame)");
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
    expect(prompt).toContain("BOTH change size together");
    expect(prompt).toContain("No character moving nearer the lens than the other");
    // A single presenter has no pair to hold, so it is not given the block.
    const solo = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial")[1], identityLock: "her face",
      language: "Telugu", speech: [{ voice: "a warm voice", line: "one" }],
    });
    expect(solo).not.toContain("SCALE LOCK");
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
    expect(p).toContain("FRAME — the prompt the still was generated from");
    expect(p).toContain("PLANNED STAGING — stand and tell / walk and talk / show the product / present the space / invite the viewer in");
    expect(p).toContain("PLANNED CAMERA — the angle, lens, move and speed");
    expect(p).toContain("THE CAMERA VOCABULARY");
    for (const term of ["Eye level", "Worm's eye", "Over-the-shoulder", "Dutch tilt", "Dolly In", "Truck Left / Right", "Push In", "Crane Up", "Follow Tracking", "85mm + slow Dolly → premium product", "steadicam tracking"]) {
      expect(p, term).toContain(term);
    }
    expect(p).toContain("Only a walk-and-talk clip walks");
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
    const out = parseVeoDirections(JSON.stringify([{ clip: 2, path: "p", camera: "b", beats: ["1", "2", "3"], sceneLife: "s" }]), 3);
    expect(out[0]).toBeNull();
    expect(out[1]?.camera).toBe("b");
    expect(parseVeoDirections("nonsense", 2)).toEqual([null, null]);
  });

  it("gives a pack its characters' own direction, with the plan winning", () => {
    const p = VEO_DIRECTION_SYSTEM_PROMPT({ clipCount: 2, aspectRatio: "9:16", subject: "Motu and Patlu", characterDirection: "HOW THIS CHARACTER PERFORMS" });
    expect(p).toContain("the planned staging, the world lock and the planned camera always win");
    expect(p).toContain("When the plan says SPEAKER FOCUS, the camera eases in on whoever is speaking");
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

  it("keeps what a deity must never touch", () => {
    const video = characterDirectionBlock(getCharacterPack("god_ganesha")!, "video");
    expect(video).toContain("never points at, touches, holds or presents the client's products");
  });
});
