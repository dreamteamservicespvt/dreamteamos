import { describe, it, expect } from "vitest";
import {
  CAMERA_MOVES, assembleVeoPrompt, clipRoles, framingForMotion, parseVeoDirections, planClipMotion, resolveDirection,
  spokenLinesIn, VEO_DIRECTION_SYSTEM_PROMPT, MOTION_COMPOSITION_HEADING, withMotionComposition,
} from "@/services/prompts/motion";
import { MULTI_FRAME_SYSTEM_PROMPT, VEO_SEGMENT_SYSTEM_PROMPT, modelVeoSubject } from "@/services/prompts";
import { CHARACTER_MULTI_FRAME_SYSTEM_PROMPT, packVeoSubject } from "@/services/prompts/characterAd";
import { getCharacterPack } from "@/services/characterPacks";

/**
 * Dynamic video starts in the frame. These pin the motion plan both prompts share, that every frame
 * is composed for its move, and that every Veo prompt carries a moving camera, three timed beats and
 * the exact spoken line — whether or not the director call answered.
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
  // The team's call: the composed opening, pushing in as the business introduces itself.
  it("pushes in on clip 1 with a welcoming gesture on the business name", () => {
    const [first] = planClipMotion(4, "commercial");
    expect(first.camera.key).toBe("push_in");
    expect(first.gesture).toMatch(/composed front stance/);
    expect(first.gesture).toMatch(/on the business name, one warm welcoming open-palm gesture/);
  });

  it("pulls back to the premises for the call to action", () => {
    expect(planClipMotion(4, "commercial").at(-1)!.camera.key).toBe("pull_back");
  });

  it("never moves two neighbouring clips the same way", () => {
    for (const n of [2, 3, 4, 6, 8, 15]) {
      const plan = planClipMotion(n, "commercial");
      for (let i = 1; i < plan.length; i++) {
        expect(plan[i].camera.key, `${n} clips, clip ${i + 1}`).not.toBe(plan[i - 1].camera.key);
      }
    }
  });

  it("is the same every time, so a regenerated clip keeps its shot", () => {
    expect(planClipMotion(6, "commercial")).toEqual(planClipMotion(6, "commercial"));
  });

  it("always has three fallback beats", () => {
    for (const p of planClipMotion(8, "festival")) expect(p.fallbackBeats).toHaveLength(3);
  });
});

describe("frames built for motion", () => {
  const plan = planClipMotion(4, "commercial");

  it("tells each frame the move it will be animated with", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, ["a", "b", "c", "d"], "", "female", "", false, "", undefined, plan);
    expect(p).toContain("FRAMES BUILT FOR MOTION");
    for (const clip of plan) expect(p).toContain(framingForMotion(clip));
    expect(p).toMatch(/Clip 1 keeps its composed front stance; composed is not frozen/);
  });

  it("leaves a frame prompt without a plan exactly as before", () => {
    const p = MULTI_FRAME_SYSTEM_PROMPT("professional", "commercial", "", 4, ["a", "b", "c", "d"], "", "female", "", false, "");
    expect(p).not.toContain("FRAMES BUILT FOR MOTION");
    expect(p).not.toContain("🎬 CAMERA MOVE");
  });

  it("does the same for a character pack", () => {
    const pack = getCharacterPack("god_ganesha")!;
    const p = CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, {
      segmentCount: 4, clipSummaries: [], locationMode: "ai_generated", locationPlan: "",
      aspectRatio: "9:16", adType: "commercial", motionPlan: plan,
    });
    expect(p).toContain(`🎬 CAMERA MOVE THIS FRAME WILL BE ANIMATED WITH: ${CAMERA_MOVES.push_in.name}`);
  });
});

// The frame model dropped the composition note on most continuation frames when merely asked.
describe("the composition stamped onto every frame", () => {
  const plan = planClipMotion(4, "commercial");

  it("adds the clip's framing for its move", () => {
    const stamped = withMotionComposition("A woman at the counter.", plan[1]);
    expect(stamped).toBe(`A woman at the counter.\n\n${MOTION_COMPOSITION_HEADING}: ${plan[1].camera.framing}. Hands relaxed and natural, ready to move — never frozen or rigid.`);
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
  const build = (direction?: any) => assembleVeoPrompt({
    aspectRatio: "9:16", plan: plan[0], direction, identityLock: model.identityLock, language: "Telugu",
    speech: [{ voice: model.voice, line }],
  });

  it("moves the camera, times the performance and keeps the line exact — with no direction at all", () => {
    const p = build(null);
    expect(p).toContain("one continuous 8-second shot");
    expect(p).toContain(`CAMERA — Slow push-in: ${CAMERA_MOVES.push_in.action}`);
    expect(p).toMatch(/• 0–2s: .+\n• 2–5s: .+\n• 5–8s: .+/);
    expect(spokenLinesIn(p)).toEqual([line]);
    expect(p).toContain("No static or locked-off camera, no frozen pose, no cuts or scene change");
  });

  it("uses the director's camera and beats when they are usable", () => {
    const p = build({ camera: "from a medium shot at the billing counter to a close-up", beats: ["a", "b", "c"], sceneLife: "a fan turns" });
    expect(p).toContain("CAMERA — Slow push-in: from a medium shot at the billing counter to a close-up");
    expect(p).toContain("• 2–5s: b");
    expect(p).toContain("SCENE LIFE: a fan turns.");
  });

  // Both seen on nearly every clip of the first live run: "counter.. Smooth" and "• 0–2s: 0–2s: …".
  it("never doubles the full stop or the time label the prompt supplies", () => {
    const p = build({
      camera: "push in toward the counter.",
      beats: ["0–2s: composed stance.", "2-5s - open palm on the name", "(5–8 sec) settles."],
      sceneLife: "a fan turns..",
    });
    expect(p).not.toMatch(/\.\./);
    expect(p).toContain("CAMERA — Slow push-in: push in toward the counter. Smooth");
    expect(p).toContain("• 0–2s: composed stance\n");
    expect(p).toContain("• 2–5s: open palm on the name\n");
    expect(p).toContain("• 5–8s: settles\n");
    expect(p).toContain("SCENE LIFE: a fan turns.");
  });

  it("falls back beat by beat when the director's beats are incomplete", () => {
    const d = resolveDirection(plan[1], { camera: "track past the shelf", beats: ["only one"] });
    expect(d.camera).toBe("track past the shelf");
    expect(d.beats).toEqual(plan[1].fallbackBeats);
  });

  it("locks the face and speaks in the ad's language", () => {
    const p = build(null);
    expect(p).toContain("keeping her face (100% face match), her hair, her outfit, the logo and the location exactly as they are");
    expect(p).toContain("a very sweet, warm, confident female voice, speaking Telugu, perfectly lip-synced");
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

describe("the director call", () => {
  it("directs from the frame, never re-describes the person, and never cuts", () => {
    const p = VEO_SEGMENT_SYSTEM_PROMPT(4, "female");
    expect(p).toContain("FRAME — the prompt the still was generated from");
    expect(p).toContain("One continuous shot. Never a cut");
    expect(p).toContain("Never describe the face, hair, skin, outfit or jewellery");
    expect(p).toContain("Clip 1 opens composed: the stance stays composed, the welcoming gesture lands on the business name");
  });

  it("reads its JSON reply by clip number, and survives a broken one", () => {
    const out = parseVeoDirections(JSON.stringify([{ clip: 2, camera: "b", beats: ["1", "2", "3"], sceneLife: "s" }]), 3);
    expect(out[0]).toBeNull();
    expect(out[1]?.camera).toBe("b");
    expect(parseVeoDirections("nonsense", 2)).toEqual([null, null]);
  });

  it("gives a pack its characters' own direction", () => {
    const p = VEO_DIRECTION_SYSTEM_PROMPT({ clipCount: 2, aspectRatio: "9:16", subject: "Motu and Patlu", characterDirection: "HOW THIS CHARACTER PERFORMS" });
    expect(p).toContain("The speaking character performs the line; the other listens and reacts");
  });
});
