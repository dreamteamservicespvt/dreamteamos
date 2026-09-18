import { describe, it, expect } from "vitest";
import {
  CAMERA_MOVES, WALKS, assembleVeoPrompt, clipRoles, compositionFor, framingForMotion, parseVeoDirections,
  planClipMotion, resolveDirection, spokenLinesIn, walkPath, withoutQuotedSpeech, withoutStillness, VEO_DIRECTION_SYSTEM_PROMPT,
  MOTION_COMPOSITION_HEADING, withMotionComposition,
} from "@/services/prompts/motion";
import { MULTI_FRAME_SYSTEM_PROMPT, VEO_SEGMENT_SYSTEM_PROMPT, modelVeoSubject } from "@/services/prompts";
import {
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT, characterDirectionBlock, packPerformer,
  packVeoSubject,
} from "@/services/prompts/characterAd";
import { getCharacterPack } from "@/services/characterPacks";

/**
 * Dynamic video starts in the frame. These pin the motion plan both prompts share — a WALK through
 * the business and a camera that moves with it, in every clip — that every frame is composed as the
 * first moment of that walk, and that every Veo prompt carries the walk, a visible camera move, three
 * timed beats and the exact spoken line, whether or not the director call answered.
 */

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
  // The team's call: no clip is someone standing in one position, explaining.
  it("walks in toward the camera on clip 1, with a welcoming gesture on the business name", () => {
    const [first] = planClipMotion(4, "commercial");
    expect(first.walk.key).toBe("walk_in");
    expect(first.camera.key).toBe("leading_dolly");
    expect(first.gesture).toMatch(/^walks in toward the camera; on the business name, a warm welcoming open-palm gesture/);
  });

  it("walks out to invite on the last clip, the camera pulling back to the storefront", () => {
    const last = planClipMotion(4, "commercial").at(-1)!;
    expect(last.walk.key).toBe("walk_invite");
    expect(last.camera.key).toBe("pull_back_reveal");
  });

  it("never walks or moves two neighbouring clips the same way", () => {
    for (const n of [2, 3, 4, 6, 8, 15]) {
      const plan = planClipMotion(n, "commercial");
      for (let i = 1; i < plan.length; i++) {
        expect(plan[i].walk.key, `${n} clips, clip ${i + 1}`).not.toBe(plan[i - 1].walk.key);
        expect(plan[i].camera.key, `${n} clips, clip ${i + 1}`).not.toBe(plan[i - 1].camera.key);
      }
    }
  });

  it("is the same every time, so a regenerated clip keeps its shot", () => {
    expect(planClipMotion(6, "commercial")).toEqual(planClipMotion(6, "commercial"));
  });

  it("walks in every fallback beat set, for every role and performer", () => {
    for (const performer of ["person", "cartoon", "deity"] as const) {
      for (const p of [...planClipMotion(8, "festival", performer), ...planClipMotion(1, "commercial", performer)]) {
        expect(p.fallbackBeats).toHaveLength(3);
        expect(p.fallbackBeats.join(" "), `${performer} ${p.role}`).toMatch(/\b(walks|walking|steps|stepping|stride)\b/);
      }
    }
  });

  // Timid moves were half of why the last videos came back static.
  it("uses camera moves big enough to see", () => {
    expect(CAMERA_MOVES.side_track.action).toContain("two to three metres");
    expect(CAMERA_MOVES.arc.action).toContain("45 to 60 degrees");
    for (const move of Object.values(CAMERA_MOVES)) {
      expect(move.action).not.toMatch(/about a metre|15 to 20 degree|one easy step/);
    }
  });

  it("gives a deity blessings, never hands on the products", () => {
    const plan = planClipMotion(4, "commercial", "deity");
    const proof = plan[1];
    expect(proof.gesture).toContain("never touching, holding or presenting it");
    expect(proof.fallbackBeats.join(" ")).not.toMatch(/picks it up|holds it up/);
    expect(walkPath(plan[2], "Ganesha")).not.toMatch(/show(s)? it to the camera/);
  });

  it("writes the path for whoever walks", () => {
    const plan = planClipMotion(4, "commercial");
    expect(walkPath(plan[0], "She")).toMatch(/^She walks three or four unhurried steps toward the camera .* and arrives in a medium shot/);
    expect(walkPath(plan[0], "Both characters", true)).toMatch(/^Both characters walk three or four unhurried steps .* and arrive in a medium shot/);
  });
});

describe("frames built for motion", () => {
  const plan = planClipMotion(4, "commercial");

  it("composes every frame after the hero as the first moment of its walk", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, ["a", "b", "c", "d"], "", "female", "", false, "", undefined, plan);
    expect(p).toContain("FRAMES BUILT FOR MOTION (EVERY FRAME BECOMES A WALKING, MOVING VIDEO)");
    for (const clip of plan.slice(1)) {
      expect(p).toContain(framingForMotion(clip));
      expect(p).toContain(`🧍 POSE: ${clip.walk.start}`);
    }
    expect(p).toContain("Clip 1 keeps its hero framing and pose, with an open path of floor toward the camera");
    expect(p).toContain("caught in natural motion, like a candid frame from a walking shot");
  });

  // Clip 1's image is the face every later frame is matched to.
  it("keeps the hero pose on clip 1 and asks only for the path", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, ["a", "b", "c", "d"], "", "female", "", false, "", undefined, plan);
    expect(p).toContain(`🎬 THIS FRAME STARTS A WALK — ${plan[0].walk.name}, filmed with a ${plan[0].camera.name}. Keep the hero framing and pose exactly`);
    expect(p).toContain("formal front-clasp");
  });

  it("leaves a frame prompt without a plan exactly as before", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, ["a", "b", "c", "d"], "", "female", "", false, "");
    expect(p).not.toContain("FRAMES BUILT FOR MOTION");
    expect(p).not.toContain("🎬");
    expect(p).toContain("Mandatory direct eye contact to the camera while holding this new pose");
  });

  it("does the same for a character pack, and lets the walk win over a planted stance", () => {
    const pack = getCharacterPack("god_ganesha")!;
    const p = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, {
      segmentCount: 4, clipSummaries: [], locationMode: "ai_generated", locationPlan: "",
      aspectRatio: "9:16", adType: "commercial", motionPlan: plan,
    });
    expect(p).toContain(`🎬 THIS FRAME STARTS A WALK — ${WALKS.walk_in.name}`);
    expect(p).toContain(compositionFor(plan[1]));
    expect(p).toContain("this ad's walk wins");
  });
});

// The frame model dropped the composition note on most continuation frames when merely asked.
describe("the composition stamped onto every frame", () => {
  const plan = planClipMotion(4, "commercial");

  it("adds the first moment of the clip's walk", () => {
    const stamped = withMotionComposition("A woman at the counter.", plan[1]);
    expect(stamped).toBe(`A woman at the counter.\n\n${MOTION_COMPOSITION_HEADING}: the first moment of a walk (${plan[1].walk.name}) — ${compositionFor(plan[1])}. Caught in natural motion, like a candid frame from a walking shot, hands relaxed and natural.`);
  });

  it("keeps a hero pose and adds only the path", () => {
    const stamped = withMotionComposition("The hero frame.", plan[0], { keepPose: true });
    expect(stamped).toBe(`The hero frame.\n\n${MOTION_COMPOSITION_HEADING}: this pose starts a walk (${plan[0].walk.name}) — ${plan[0].camera.framing}.`);
  });

  it("never stamps twice, and leaves an empty prompt alone", () => {
    const once = withMotionComposition("A frame.", plan[0]);
    expect(withMotionComposition(once, plan[0])).toBe(once);
    expect(withMotionComposition("", plan[0])).toBe("");
    expect(withMotionComposition("A frame.", undefined)).toBe("A frame.");
  });
});

describe("the Veo prompt", () => {
  const plan = planClipMotion(4, "commercial");
  const model = modelVeoSubject("female");
  const line = "శ్రీ సాయి మోటార్స్ లో మీ బైక్ సర్వీస్ అదే రోజు.";
  const build = (direction?: any, clip = 0) => assembleVeoPrompt({
    aspectRatio: "9:16", plan: plan[clip], direction, identityLock: model.identityLock, language: "Telugu",
    speech: [{ voice: model.voice, line }], cast: model.cast, castPlural: model.castPlural,
  });

  it("walks, moves the camera, times the performance and keeps the line exact — with no direction at all", () => {
    const p = build(null);
    expect(p).toContain("one continuous 8-second shot");
    expect(p).toContain(`ACTION — WALK, SHOW AND PRESENT (${WALKS.walk_in.name}):\nShe walks three or four unhurried steps toward the camera`);
    expect(p).toContain(`CAMERA — ${CAMERA_MOVES.leading_dolly.name}: ${CAMERA_MOVES.leading_dolly.action}. The camera moves with the walk from the first second to the last`);
    expect(p).toMatch(/• 0–2s: .+\n• 2–5s: .+\n• 5–8s: .+/);
    expect(spokenLinesIn(p)).toEqual([line]);
    expect(p).toContain("No static or locked-off camera, no frozen pose, no cuts or scene change");
  });

  // Veo weighs the start of a prompt most; the start used to be the rules, not the action.
  it("puts the walk before the camera, the rules and the speech", () => {
    const p = build(null);
    const at = (s: string) => p.indexOf(s);
    expect(at("ACTION — WALK")).toBeLessThan(at("CAMERA —"));
    expect(at("CAMERA —")).toBeLessThan(at("MOVEMENT — MANDATORY"));
    expect(at("MOVEMENT — MANDATORY")).toBeLessThan(at("SPEECH:"));
  });

  it("uses the director's path, camera and beats when they move", () => {
    const p = build({
      path: "she walks from the billing counter past the spare-parts rack toward the camera",
      camera: "the camera dollies back ahead of her from the counter to the rack",
      beats: ["walks toward the lens smiling", "points to the rack", "turns and opens a palm"],
      sceneLife: "a fan turns",
    });
    expect(p).toContain("She walks from the billing counter past the spare-parts rack toward the camera.");
    expect(p).toContain(`CAMERA — ${CAMERA_MOVES.leading_dolly.name}: the camera dollies back ahead of her from the counter to the rack`);
    expect(p).toContain("• 2–5s: points to the rack");
    expect(p).toContain("SCENE LIFE: a fan turns.");
  });

  // The character catalogue pulled the director toward exactly this.
  it("throws away a direction that stands still, field by field", () => {
    const d = resolveDirection(plan[1], {
      path: "stays planted beside the counter",
      camera: "a locked-off medium shot on sticks",
      beats: ["walks to the shelf", "stands still and talks", "nods"],
    }, "She");
    expect(d.path).toBe(walkPath(plan[1], "She"));
    expect(d.camera).toBe(CAMERA_MOVES[plan[1].walk.camera].action);
    expect(d.beats).toEqual(plan[1].fallbackBeats);
  });

  // Every one of these is a beat the director wrote in a live run.
  it("takes the quoted dialogue out of the actions, and the lead-in it leaves hanging", () => {
    const cases: [string, string][] = [
      ["Steps forward from the display counters with a calm smile, gazing warmly into the lens while starting the line 'అరే గణేశ, బోధన్ లోపల...'",
        "Steps forward from the display counters with a calm smile, gazing warmly into the lens"],
      ["Continues walking past the stacked golden sweets, turning his head slightly as he speaks '...ఈ లక్ష్మి స్వీట్స్ అండ్ బేకరీ షాప్...'",
        "Continues walking past the stacked golden sweets, turning his head slightly"],
      ["Glides past the stacked dry fruit laddus with a gentle, serene expression, delivering the line '...చాలా రుచిగా తయారు చేసే స్వీట్స్ ఇంకా...'",
        "Glides past the stacked dry fruit laddus with a gentle, serene expression"],
      ["Reaches the end of the counter span, raising the blessing palm slightly toward the display and turning his head to the lens for '...స్పెషల్ కాజు కట్లీ.'",
        "Reaches the end of the counter span, raising the blessing palm slightly toward the display and turning his head to the lens"],
      ["Lifts the right hand smoothly toward the background hydraulic lifts on the words 'ఫ్రీ బైక్ వాష్', showing the maintenance area",
        "Lifts the right hand smoothly toward the background hydraulic lifts, showing the maintenance area"],
      ["Steps forward toward the open doorway with a welcoming smile, starting 'నలభై ఏళ్ల నమ్మకమైన లక్ష్మి స్వీట్స్...'",
        "Steps forward toward the open doorway with a welcoming smile"],
    ];
    for (const [beat, expected] of cases) expect(withoutQuotedSpeech(beat)).toBe(expected);
  });

  it("leaves a beat without quoted dialogue exactly as it was", () => {
    const beat = "walks to the counter, says hello with an open palm on the line about free delivery";
    expect(withoutQuotedSpeech(beat)).toBe(beat);
    expect(withoutQuotedSpeech("beckons with a 'come in' wave")).toBe("beckons with a 'come in' wave");
  });

  it("throws away beats in which nobody walks", () => {
    const d = resolveDirection(plan[1], { beats: ["smiles at the lens", "an open palm", "a nod"] });
    expect(d.beats).toEqual(plan[1].fallbackBeats);
  });

  // Both seen on nearly every clip of the first live run: "counter.. Smooth" and "• 0–2s: 0–2s: …".
  it("never doubles the full stop or the time label the prompt supplies", () => {
    const p = build({
      camera: "dolly back toward the counter.",
      beats: ["0–2s: walks in.", "2-5s - open palm on the name", "(5–8 sec) steps closer."],
      sceneLife: "a fan turns..",
    });
    expect(p).not.toMatch(/\.\./);
    expect(p).toContain(`CAMERA — ${CAMERA_MOVES.leading_dolly.name}: dolly back toward the counter. The camera moves`);
    expect(p).toContain("• 0–2s: walks in\n");
    expect(p).toContain("• 2–5s: open palm on the name\n");
    expect(p).toContain("• 5–8s: steps closer\n");
    expect(p).toContain("SCENE LIFE: a fan turns.");
  });

  it("falls back beat by beat when the director's beats are incomplete", () => {
    const d = resolveDirection(plan[1], { camera: "track past the shelf", beats: ["only one"] });
    expect(d.camera).toBe("track past the shelf");
    expect(d.beats).toEqual(plan[1].fallbackBeats);
  });

  it("locks the face and speaks in the ad's language", () => {
    const p = build(null);
    expect(p).toContain("Keep her face (100% face match), her hair, her outfit, the logo and the location exactly as they are in it");
    expect(p).toContain("a very sweet, warm, confident female voice, speaking Telugu, perfectly lip-synced");
  });

  /**
   * Live videos came back with the cast's height changing mid-clip and an outfit changing colour:
   * one clause at the top was not enough for image-to-video.
   */
  it("locks height, build and clothes, and says what may change", () => {
    const p = build(null);
    expect(p).toContain("LOCKED — THE LOOK COMES ENTIRELY FROM THE ATTACHED FRAME:");
    expect(p).toContain("The attached frame is the first frame of this video");
    expect(p).toContain("the same height, build and body proportions");
    expect(p).toContain("Walking changes how near She is to the camera, never the size of anyone: nobody grows taller or shorter, thinner or heavier");
    expect(p).toContain("No change of height, build or body proportions — nobody taller, shorter, slimmer or heavier than in the frame");
    expect(p).toContain("No costume change — no different clothes, colours, patterns, footwear or accessories, nothing added or taken away");
    expect(p).toContain("No redrawn, restyled or different-looking cast, no face morphing, no swapped or extra characters");
  });

  it("locks the size difference between two characters", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    const s = packVeoSubject(pack);
    const p = assembleVeoPrompt({
      aspectRatio: "9:16", plan: plan[1], identityLock: s.identityLock, language: "Telugu",
      speech: s.speech([{ name: "Motu", text: "a" }, { name: "Patlu", text: "b" }]),
      cast: s.cast, castPlural: s.castPlural, twoHander: s.twoHander,
    });
    expect(p).toContain("including the size and height difference between the two characters");
    expect(p).toContain("Walking changes how near Both characters are to the camera");
  });

  // The ad is shot inside the client's shop; walking in off the street is a different business.
  it("keeps every step inside the business", () => {
    for (const p of plan.map((clip) => build(null, clip.clip))) {
      expect(p).toContain("Every step stays INSIDE the business, in the same space the attached frame shows");
      expect(p).toContain("never walks out of the shop, never walks in from the street");
      expect(p).toContain("No walking out of the business, no street, footpath, car park or outside shot");
    }
    expect(walkPath(plan[3], "She")).toContain("still inside the business");
    expect(CAMERA_MOVES.pull_back_reveal.action).toContain("the whole inside of the business");
    expect(JSON.stringify(WALKS)).not.toMatch(/the entrance|storefront/);
  });

  it("gives a two-hander each speaker their half of the clip", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    const subject = packVeoSubject(pack);
    const p = assembleVeoPrompt({
      aspectRatio: "16:9", plan: plan[2], identityLock: subject.identityLock, language: "Telugu",
      speech: subject.speech([{ name: "Motu", text: "one" }, { name: "Patlu", text: "two" }]),
      performanceNotes: subject.performanceNotes,
    });
    expect(p).toContain("16:9 horizontal video");
    expect(spokenLinesIn(p)).toEqual(["one", "two"]);
    expect(p).toMatch(/0–4s — Motu/);
    expect(p).toMatch(/4–8s — Patlu/);
  });

  it("gives a deity the catalogue voice, not a cartoon's", () => {
    const pack = getCharacterPack("god_ganesha")!;
    const [speech] = packVeoSubject(pack).speech([{ name: "Ganesha", text: "x" }]);
    expect(speech.voice).not.toContain("from the show");
    expect(speech.at).toBeUndefined();
  });
});

/**
 * The team's standing rule: the cast walks through the business while talking — showing and
 * presenting it with appropriate hand gestures and body language — and never stands in one position
 * explaining. It is written into every assembled prompt by code, so it cannot be lost.
 */
describe("walking and movement are mandatory in every Veo prompt", () => {
  const plan = planClipMotion(4, "commercial");
  const model = modelVeoSubject("female");
  const prompts = plan.map((p) => assembleVeoPrompt({
    aspectRatio: "9:16", plan: p, identityLock: model.identityLock, language: "Telugu",
    speech: [{ voice: model.voice, line: "line" }], cast: model.cast, castPlural: model.castPlural,
  }));

  it("says the cast walks and never stands in one position, in every clip", () => {
    for (const p of prompts) {
      expect(p).toContain("ACTION — WALK, SHOW AND PRESENT");
      expect(p).toContain("MOVEMENT — MANDATORY, NEVER LIKE A STATUE:");
      expect(p).toContain("She is walking and in motion for the whole 8 seconds — walking through the business, turning, showing and presenting it — never standing in one single position while explaining");
      expect(p).toContain("She walks with a confident, easy, natural stride, talking while walking like a real walk-and-talk reel");
      expect(p).toContain("There is never a moment when only the mouth moves");
    }
  });

  it("demands appropriate hand gestures and body language that show the business, in every clip", () => {
    for (const p of prompts) {
      expect(p).toContain("HAND GESTURES AND BODY LANGUAGE — MANDATORY IN THIS CLIP:");
      expect(p).toMatch(/Appropriate, clearly visible hand gestures on the key words of the line — showing and presenting the business with an open hand/);
      expect(p).toMatch(/Body language is open, warm and confident, and matches the meaning of every word/);
    }
  });

  it("backs it with negatives", () => {
    expect(prompts[0]).toContain("No standing in one spot for the whole clip, no feet planted in place, no presenter frozen in position while explaining");
    expect(prompts[0]).toContain("No standing still like a statue, no stiff or mannequin body, no hands hanging lifeless, no talking head where only the mouth moves");
  });

  it("walks both characters together in a two-hander, the listener too", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    const s = packVeoSubject(pack);
    const p = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial", s.performer)[1], identityLock: s.identityLock, language: "Telugu",
      speech: s.speech([{ name: "Motu", text: "a" }, { name: "Patlu", text: "b" }]),
      cast: s.cast, castPlural: s.castPlural, twoHander: s.twoHander, walkManner: s.walkManner, handGestures: s.handGestures,
    });
    expect(p).toContain("Both characters are walking and in motion");
    expect(p).toContain("Both characters walk in their own signature way from the show");
    expect(p).toContain("Both characters walk together, side by side, through the business");
    expect(p).toContain("The character who is listening keeps moving too — walking along");
  });

  it("walks a deity slowly, and keeps every gesture a blessing", () => {
    const s = packVeoSubject(getCharacterPack("god_ganesha")!);
    expect(s.cast).toBe("Ganesha");
    expect(s.twoHander).toBe(false);
    expect(s.performer).toBe("deity");
    const p = assembleVeoPrompt({
      aspectRatio: "9:16", plan: planClipMotion(4, "commercial", "deity")[1], identityLock: s.identityLock, language: "Telugu",
      speech: s.speech([{ name: "Ganesha", text: "x" }]), cast: s.cast, walkManner: s.walkManner, handGestures: s.handGestures,
    });
    expect(p).toContain("Ganesha walks with slow, graceful, majestic steps");
    expect(p).toContain("never touching, holding, pointing at or presenting products, money or a phone");
    expect(p).not.toContain("picking up, holding up or touching the product");
  });
});

describe("the director call", () => {
  it("directs a walk from the frame, never re-describes the person, and never cuts", () => {
    const p = VEO_SEGMENT_SYSTEM_PROMPT(4, "female");
    expect(p).toContain("FRAME — the prompt the still was generated from");
    expect(p).toContain("PLANNED WALK — the path through this clip");
    expect(p).toContain("A presenter standing in one position and explaining is a failed clip");
    expect(p).toContain("One continuous shot. Never a cut");
    expect(p).toContain("Never describe the face, hair, skin, outfit or jewellery");
    expect(p).toContain("Clip 1 walks in");
    expect(p).toContain("EVERY beat has the body travelling or turning");
    expect(p).toContain("WALK IN EVERY CLIP — NEVER LIKE A STATUE");
    expect(p).toContain("INSIDE THE BUSINESS ONLY");
    expect(p).toContain("YOU DIRECT MOVEMENT ONLY. Never change how anyone looks");
    expect(p).toContain("NEVER quote the spoken words in path or beats");
    expect(p).toContain('"path": ""');
  });

  it("reads its JSON reply by clip number, and survives a broken one", () => {
    const out = parseVeoDirections(JSON.stringify([{ clip: 2, path: "p", camera: "b", beats: ["1", "2", "3"], sceneLife: "s" }]), 3);
    expect(out[0]).toBeNull();
    expect(out[1]?.camera).toBe("b");
    expect(out[1]?.path).toBe("p");
    expect(parseVeoDirections("nonsense", 2)).toEqual([null, null]);
  });

  it("gives a pack its characters' own direction, with the walk winning", () => {
    const p = VEO_DIRECTION_SYSTEM_PROMPT({ clipCount: 2, aspectRatio: "9:16", subject: "Motu and Patlu", characterDirection: "HOW THIS CHARACTER PERFORMS" });
    expect(p).toContain("The speaking character performs the line; the other listens and reacts");
    expect(p).toContain("the planned walk and camera move always win");
  });
});

/**
 * The catalogue was written for held frames, and the director followed it. What reaches the video
 * director now has the stillness taken out, and no camera direction at all — the plan owns the camera.
 */
describe("character direction without the stillness", () => {
  it("drops the clauses that order stillness and keeps the character", () => {
    const out = withoutStillness(
      "Motu leans in and rocks forward on his question; Patlu stays planted and completely still, which is the whole joke — one of them is bouncing and the other has not moved. In the closing frame both turn front-on together.",
    );
    expect(out).toContain("Motu leans in and rocks forward on his question;");
    expect(out).toContain("In the closing frame both turn front-on together.");
    expect(out).not.toMatch(/planted|still|has not moved/);
  });

  it("keeps a clause's own point when only its tail was stillness", () => {
    expect(withoutStillness("Patlu gestures once per clip — a calm open palm towards the shelf — then lets the hand drop and stay still."))
      .toBe("Patlu gestures once per clip — a calm open palm towards the shelf.");
  });

  it("sends the video director no camera direction and no stillness, for every pack", () => {
    for (const id of ["duo_motu_patlu", "god_shiva", "god_lakshmi", "solo_patlu", "normal_male", "owner_face_female"]) {
      const pack = getCharacterPack(id)!;
      const video = characterDirectionBlock(pack, "video");
      expect(video, id).not.toContain("CAMERA & CINEMATIC DIRECTION");
      expect(video, id).not.toMatch(/\b(planted|motionless|tripod|locked-off|stillness|never walks)\b/i);
    }
    // The frame still gets the character's camera direction.
    expect(characterDirectionBlock(getCharacterPack("duo_motu_patlu")!, "frame")).toContain("CAMERA & CINEMATIC DIRECTION");
  });

  it("keeps what a deity must never touch", () => {
    const video = characterDirectionBlock(getCharacterPack("god_ganesha")!, "video");
    expect(video).toContain("never points at, touches, holds or presents the client's products");
  });

  it("tells a deity's director to walk slowly and bless", () => {
    const pack = getCharacterPack("god_shiva")!;
    expect(packPerformer(pack)).toBe("deity");
    const p = CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, 4);
    expect(p).toContain("A deity walks slowly and majestically, and every gesture is a blessing");
    expect(p).not.toContain("a still frame with a moving mouth is correct here");
  });
});
