import { describe, expect, it } from "vitest";
import {
  AD_FORMAT_PRESETS,
  MAX_STORYBOARD_PANELS,
  MIN_STORYBOARD_PANELS,
  adFormatPreset,
  describeAdFormat,
  effectiveAdFormatPreset,
  suggestedClipCount,
  type Clip,
} from "@/types/cinematicAds";
import {
  clampPanelCount,
  clipIsMissingCameraMove,
  formatClipPacket,
  hasCameraMove,
  imagePromptCountFor,
  splitScenesIntoBoards,
} from "@/utils/cinematicAds";

describe("ad format presets", () => {
  it("gives every dialogue format lip-sync rules", () => {
    // A format where people speak on camera cannot be animated on a model with no
    // lip-sync, and cannot be shot without deciding who the faces belong to.
    for (const preset of AD_FORMAT_PRESETS.filter((p) => p.family === "dialogue")) {
      expect(preset.voForm, preset.id).toBe("dialogue");
      expect(preset.animationPlatform, preset.id).toBe("veo_only");
      expect(preset.castingRequirement, preset.id).toBe("required");
    }
  });

  it("keeps voice-over formats off the lip-sync-only path", () => {
    for (const preset of AD_FORMAT_PRESETS.filter((p) => p.family === "voiceover")) {
      expect(preset.voForm, preset.id).toBe("narration");
      expect(preset.animationPlatform, preset.id).toBe("either");
    }
  });

  it("only skips casting where nobody appears", () => {
    const skipped = AD_FORMAT_PRESETS.filter((p) => p.castingRequirement === "none");
    expect(skipped.map((p) => p.id)).toEqual(["pure_cinematic_no_people"]);
  });

  it("falls back to a real preset for an unknown id", () => {
    expect(adFormatPreset("nonsense" as never).id).toBe("ai_decides");
  });

  it("follows the AI's chosen format, not the neutral default", () => {
    // The bug this guards: an AI-chosen two-person conversation inheriting
    // "ai_decides" defaults would skip casting and lose lip-sync.
    const preset = effectiveAdFormatPreset({
      formatId: "ai_decides",
      aiChosenFormatId: "two_person_conversation",
    });
    expect(preset.id).toBe("two_person_conversation");
    expect(preset.castingRequirement).toBe("required");
    expect(preset.animationPlatform).toBe("veo_only");
  });

  it("describes the pairing that was chosen", () => {
    expect(
      describeAdFormat({ formatId: "two_person_conversation", pairing: "female_female" }),
    ).toContain("Both female");
  });

  it("ignores sub-options a format does not use", () => {
    const described = describeAdFormat({ formatId: "pure_cinematic_no_people", pairing: "male_male" });
    expect(described).not.toContain("Both male");
  });

  it("cuts a duration into a sensible number of clips", () => {
    const montage = adFormatPreset("fast_cut_montage");
    expect(suggestedClipCount(montage, 60)).toBe(15);
    // Never fewer than two clips, however short the ad.
    expect(suggestedClipCount(montage, 3)).toBe(2);
  });
});

describe("storyboard panel ceiling", () => {
  it("clamps a panel count into the range an image model honours", () => {
    expect(clampPanelCount(12)).toBe(MAX_STORYBOARD_PANELS);
    expect(clampPanelCount(1)).toBe(MIN_STORYBOARD_PANELS);
    expect(clampPanelCount(undefined)).toBe(MIN_STORYBOARD_PANELS);
    expect(clampPanelCount(Number.NaN)).toBe(MIN_STORYBOARD_PANELS);
    expect(clampPanelCount(5)).toBe(5);
  });

  it("splits a long ad into boards of at most nine panels", () => {
    expect(splitScenesIntoBoards(6)).toEqual([{ firstScene: 1, lastScene: 6 }]);
    expect(splitScenesIntoBoards(9)).toEqual([{ firstScene: 1, lastScene: 9 }]);
    expect(splitScenesIntoBoards(14)).toEqual([
      { firstScene: 1, lastScene: 9 },
      { firstScene: 10, lastScene: 14 },
    ]);
    expect(splitScenesIntoBoards(0)).toEqual([]);
  });

  it("never puts more than nine panels on one board", () => {
    for (const count of [1, 9, 10, 18, 23]) {
      for (const board of splitScenesIntoBoards(count)) {
        expect(board.lastScene - board.firstScene + 1).toBeLessThanOrEqual(MAX_STORYBOARD_PANELS);
      }
    }
  });
});

describe("clip types", () => {
  it("asks for two frames only when the scene travels", () => {
    expect(imagePromptCountFor("single")).toBe(1);
    expect(imagePromptCountFor("start_end")).toBe(2);
    expect(imagePromptCountFor("storyboard")).toBe(1);
  });
});

describe("camera movement detection", () => {
  it("recognises real camera moves", () => {
    const moves = [
      "Slow dolly in over 6 seconds",
      "Crane down to reveal the shop",
      "handheld follow behind the boy",
      "Orbiting the necklace",
      "whip pan to the counter",
      "The camera drifts left as she turns",
      "Rack focus from the diya to her face",
      "aerial sweep across the site",
      "gentle push in, 10%",
      "tilt up the temple gopuram",
    ];
    for (const move of moves) {
      expect(hasCameraMove(move), move).toBe(true);
    }
  });

  it("rejects mood words pretending to be direction", () => {
    // These are the phrases a model returns when it has not been told to move the
    // camera, and each one animates as a locked-off tripod shot.
    const notMoves = [
      "Static shot of the shop",
      "Cinematic and beautiful lighting",
      "Dynamic energetic composition",
      "A warm emotional moment",
      "",
    ];
    for (const text of notMoves) {
      expect(hasCameraMove(text), text).toBe(false);
    }
    expect(hasCameraMove(undefined)).toBe(false);
  });

  it("accepts a move written into the prose instead of the field", () => {
    // Flagging a clip that is in fact directed would teach the operator to ignore
    // the warning, so both places are checked.
    const clip = { cameraMove: "", animationPrompt: "The camera pushes in as he smiles." };
    expect(clipIsMissingCameraMove(clip)).toBe(false);
  });

  it("flags a clip with no move anywhere", () => {
    expect(
      clipIsMissingCameraMove({ cameraMove: "", animationPrompt: "She holds up the saree, smiling warmly." }),
    ).toBe(true);
  });
});

describe("clip packet", () => {
  const clip: Clip = {
    id: "c1",
    clipNumber: 2,
    sceneNumbers: [2],
    title: "The shop at dawn",
    clipType: "start_end",
    imagePrompts: [
      { id: "i1", label: "Start Frame", prompt: "Closed shutter at first light", attachInstructions: "Logo PNG", approved: false },
      { id: "i2", label: "End Frame", prompt: "Shutter open, lamps lit", attachInstructions: "", approved: false },
    ],
    animationPrompt: "The shutter rises as the street wakes.",
    cameraMove: "Slow dolly in, 12% over 6s",
    voScript: "కొత్త రోజు మొదలైంది.",
    voTone: "warm, unhurried",
    duration: "6s",
    aspectRatio: "9:16",
    negativePrompt: "no warped text",
    platform: "veo",
    mode: "first_last_frame",
    qcChecklist: {},
    approved: false,
  };

  it("carries both frames, the animation, the camera and the words", () => {
    const packet = formatClipPacket(clip);
    expect(packet).toContain("CLIP 2 — The shop at dawn");
    expect(packet).toContain("Start Frame");
    expect(packet).toContain("End Frame");
    expect(packet).toContain("Attach: Logo PNG");
    expect(packet).toContain("Camera: Slow dolly in, 12% over 6s");
    expect(packet).toContain("Negative: no warped text");
    expect(packet).toContain("కొత్త రోజు మొదలైంది.");
    expect(packet).toContain("Tone: warm, unhurried");
  });

  it("says a silent clip is silent rather than leaving a blank", () => {
    const packet = formatClipPacket({ ...clip, voScript: "", voTone: "" });
    expect(packet).toContain("(no voice over in this clip)");
  });
});
