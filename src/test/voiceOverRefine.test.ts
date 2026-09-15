import { describe, it, expect } from "vitest";
import {
  changedClipIndexes, clipIndexesFromIssues, introducedIssues, isBetterRepair, issuesForClip, mergeClipEdits,
  numberedWords, parseClipDialogueEdits, parseClipTextEdits, parseRefinePlan, repairDirection, wordBandDistance,
} from "@/utils/voiceOverRefine";
import {
  VEO_REFINE_SYSTEM_PROMPT, VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT, VOICEOVER_REFINE_PLAN_SYSTEM_PROMPT,
} from "@/services/prompts/refine";

/**
 * A refine must change what the member asked for and nothing else. The mechanical guarantees live in
 * code and are pinned here: a clip's own button can only change that clip, untouched clips are never
 * rewritten, and only problems the edit created can reject it.
 */

describe("the plan", () => {
  it("resolves a whole-script request to the clips it touches", () => {
    const plan = parseRefinePlan(JSON.stringify({
      understood: "Mention free delivery",
      clips: [{ clip: 3, change: "add free delivery" }, { clip: 1, change: "x" }, { clip: 9, change: "out of range" }],
      notPossible: "",
    }), 4);
    expect(plan.clips).toEqual([0, 2]);
    expect(plan.changes[2]).toBe("add free delivery");
    expect(plan.understood).toBe("Mention free delivery");
  });

  // The whole point of a clip's own Refine button.
  it("pins a clip's own refine to that clip, whatever the model decided", () => {
    const plan = parseRefinePlan(JSON.stringify({ understood: "u", clips: [{ clip: 1, change: "c" }, { clip: 4, change: "d" }] }), 4, 2);
    expect(plan.clips).toEqual([2]);
    expect(plan.changes).toEqual({ 2: "c" });
  });

  it("changes nothing when the request cannot be done", () => {
    const plan = parseRefinePlan(JSON.stringify({ understood: "speak the number", clips: [{ clip: 4 }], notPossible: "Phone numbers are never spoken." }), 4, 3);
    expect(plan.clips).toEqual([]);
    expect(plan.notPossible).toBe("Phone numbers are never spoken.");
  });

  // Live run: clip 2 already said "only genuine spare parts", and the member was told to be more specific.
  it("says the script already does it, instead of inventing a change", () => {
    const plan = parseRefinePlan(JSON.stringify({ understood: "u", clips: [], alreadyDone: "Clip 2 already says only genuine spare parts are used" }), 4, 1);
    expect(plan.clips).toEqual([]);
    expect(plan.alreadyDone).toBe("Clip 2 already says only genuine spare parts are used");
  });

  it("ignores 'already done' when the plan still lists a change", () => {
    const plan = parseRefinePlan(JSON.stringify({ understood: "u", clips: [{ clip: 2, change: "c" }], alreadyDone: "partly" }), 4);
    expect(plan.clips).toEqual([1]);
    expect(plan.alreadyDone).toBe("");
  });

  it("reads an unusable reply as an empty plan", () => {
    expect(parseRefinePlan("garbage", 4).clips).toEqual([]);
  });

  it("tells the planner a clip's own refine is locked to that clip", () => {
    expect(VOICEOVER_REFINE_PLAN_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4, forcedClip: 2 })).toContain("the change is to clip 2 ONLY");
    expect(VOICEOVER_REFINE_PLAN_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4 })).toMatch(/A request about content/);
  });
});

describe("the edit", () => {
  it("keeps only edits for planned clips", () => {
    const edits = parseClipTextEdits(JSON.stringify({ clips: [{ clip: 2, text: "new two" }, { clip: 3, text: "sneaky" }] }), [1]);
    expect([...edits]).toEqual([[1, "new two"]]);
  });

  it("reads dialogue edits the same way", () => {
    const edits = parseClipDialogueEdits(JSON.stringify({ clips: [{ clip: 1, lines: [{ speaker: "motu", text: "a" }, { speaker: "patlu", text: "b" }] }] }), [0]);
    expect(edits.get(0)).toEqual([{ speaker: "motu", text: "a" }, { speaker: "patlu", text: "b" }]);
  });

  it("is told it is an editor, and what it must still obey", () => {
    const p = VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4, adType: "commercial" });
    expect(p).toContain("You are NOT writing a new script");
    expect(p).toContain("Every clip not in the plan is not yours to touch");
    expect(p).toContain("Between 18 and 20 spoken words per clip");
    expect(p).toContain("Clip 1 must still carry the core message");
    expect(p).not.toMatch(/write the \d+ clips now/i);
  });

  it("keeps a two-hander's shape in the edit contract", () => {
    const p = VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({
      language: "Telugu", clipCount: 4, adType: "commercial",
      speakers: [{ key: "motu", name: "Motu" }, { key: "patlu", name: "Patlu" }],
    });
    expect(p).toContain("exactly 2 lines, Motu then Patlu, in that order");
    expect(p).toContain('"speaker": "motu"');
  });
});

describe("merging", () => {
  // The guarantee a clip refine depends on: untouched clips never go through a model.
  it("replaces only the edited clips", () => {
    const original = ["one", "two", "three", "four"];
    const merged = mergeClipEdits(original, new Map([[2, "THREE"]]));
    expect(merged).toEqual(["one", "two", "THREE", "four"]);
    expect(merged[0]).toBe(original[0]);
  });

  it("reports exactly which clips changed", () => {
    expect(changedClipIndexes(["a", "b", "c"], ["a", "B", "c"])).toEqual([1]);
    expect(changedClipIndexes(["a"], ["a"])).toEqual([]);
  });

  it("rejects an edit only for problems it created", () => {
    const before = ["Clip 4 must contain 18–20 spoken words, but it has 23."];
    expect(introducedIssues(before, [...before])).toEqual([]);
    expect(introducedIssues(before, [...before, "Clip 2 leaks CTA or contact language before the final clip."]))
      .toEqual(["Clip 2 leaks CTA or contact language before the final clip."]);
  });
});

/**
 * The generator's repair fixes only failing clips. The first live run left clips at 16 and 17 words
 * after two whole-script repairs were told only "must contain 18–20, but it has 16".
 */
describe("repairing only the clips that failed", () => {
  const issues = [
    "Clip 2 must contain 18–20 spoken words, but it has 17.",
    "Clip 4 must contain 18–20 spoken words, but it has 16.",
    "Final clip must include the on-screen call CTA: x",
  ];

  it("finds the clips the problems belong to", () => {
    expect(clipIndexesFromIssues(issues, 4)).toEqual([1, 3]);
    expect(clipIndexesFromIssues(["Expected exactly 4 clips but got 3."], 4)).toEqual([]);
  });

  it("gives each clip its own problems, the call to action to the last clip", () => {
    expect(issuesForClip(issues, 3, 4)).toEqual([issues[1], issues[2]]);
    expect(issuesForClip(issues, 0, 4)).toEqual([]);
  });

  it("says which way to fix a word count, by how much, and with what", () => {
    expect(repairDirection([issues[1]], 18, 20)).toMatch(/It has 16 spoken words; it needs 18–20\. ADD 2 to 4 words by carrying one more real/);
    expect(repairDirection(["Clip 1 must contain 18–20 spoken words, but it has 25."], 18, 20)).toMatch(/CUT 5 to 7 words .* keep the business name, the promise/);
    expect(repairDirection(["Clip 2 leaks CTA or contact language before the final clip."], 18, 22)).toBe("Clip 2 leaks CTA or contact language before the final clip.");
  });
});

// The character validator words it "…but has 16." and gives a line its own band.
describe("repairing a two-character clip", () => {
  it("reads the dialogue validator's clip wording", () => {
    expect(repairDirection(["Clip 4 must contain 18-20 spoken words across both characters, but has 16."], 18, 20))
      .toMatch(/^It has 16 spoken words; it needs 18–20\. ADD 2 to 4 words/);
  });

  it("uses a line's own band, and names whose line it is", () => {
    expect(repairDirection(["Clip 2: Motu's line must be 8-12 words but has 6."], 18, 20))
      .toMatch(/^Motu's line has 6 spoken words; it needs 8–12\. ADD 2 to 6 words/);
  });
});

describe("judging a repair", () => {
  it("measures how far clips sit outside the band", () => {
    expect(wordBandDistance([21, 14, 18, 25], 18, 22)).toBe(4 + 3);
  });

  // A 14-word clip taken to 17 is progress even though the issue is still there.
  it("keeps a repair that gets closer without clearing the issue", () => {
    expect(isBetterRepair({ issues: ["x"], distance: 4 }, { issues: ["x"], distance: 1 })).toBe(true);
    expect(isBetterRepair({ issues: ["x"], distance: 1 }, { issues: ["x"], distance: 1 })).toBe(false);
    expect(isBetterRepair({ issues: ["x"], distance: 1 }, { issues: [], distance: 0 })).toBe(true);
    expect(isBetterRepair({ issues: [], distance: 0 }, { issues: ["x"], distance: 0 })).toBe(false);
  });

  it("numbers a clip's words so the count can be seen, not guessed", () => {
    expect(numberedWords(["మీ", "బైక్", "సర్వీస్"])).toBe("3 words: 1·మీ 2·బైక్ 3·సర్వీస్");
  });

  it("tells the planner a fact is not a call to action", () => {
    const p = VOICEOVER_REFINE_PLAN_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4, forcedClip: 2 });
    expect(p).toContain("A FACT IS NOT A CALL TO ACTION");
    expect(p).toContain("The member chose clip 2 on purpose");
  });
});

describe("refining a Veo prompt", () => {
  it("never lets the edit touch the recorded dialogue or freeze the camera", () => {
    expect(VEO_REFINE_SYSTEM_PROMPT).toContain("Never change, translate or re-punctuate anything inside the quotation marks");
    expect(VEO_REFINE_SYSTEM_PROMPT).toContain("never make the camera static unless the member explicitly asks");
  });
});
