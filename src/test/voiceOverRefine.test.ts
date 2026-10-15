import { describe, it, expect } from "vitest";
import {
  changedClipIndexes, clipIndexesFromIssues, editProblems, introducedIssues, isBetterRepair, issuesForClip, mergeClipEdits,
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

  // Live: "make the closing line warmer" was planned as a rewrite of the fixed call line, the editor
  // could not touch it, and the member was told nothing needed doing.
  it("tells the planner the closing call line is fixed and the ending changes before it", () => {
    const line = '"మరిన్ని వివరాల కోసం స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి."';
    const p = VOICEOVER_REFINE_PLAN_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4, closingLine: line });
    expect(p).toContain(`THE CLOSING CALL LINE IS FIXED. Clip 4 always ends with ${line}`);
    expect(p).toContain("changes the words BEFORE that sentence in clip 4");
    expect(p).toContain("7. Any wording you suggest in \"change\" is everyday spoken Telugu");
    // A character ad has no fixed line.
    expect(VOICEOVER_REFINE_PLAN_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4 })).not.toContain("THE CLOSING CALL LINE IS FIXED");
  });

  it("tells the editor to change the ending before the fixed line, never to hand a clip back", () => {
    const p = VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4, adType: "commercial" });
    expect(p).toContain("A change to the ending or its tone goes into the words before that sentence");
    expect(p).toContain("Never hand a planned clip back unchanged.");
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
    // The one word contract, in the shared words every script prompt uses (prompts/wordContract).
    expect(p).toContain("THE WORD BUDGET — 17–20 SPOKEN WORDS IN EVERY CLIP");
    expect(p).toContain("aim for 18–19. 20 is the hard ceiling");
    expect(p).toContain("A clip you return outside the budget is rejected by code");
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
    // Two speakers share the clip's 17–20 — never 17–20 each.
    expect(p).toContain("A clip's TWO lines TOGETHER make the 17–20 — never 17–20 each");
    expect(p).not.toMatch(/15[–-]17|7[–-]9 words/);
  });
});

describe("an edited clip obeys the contract (2026-10-15)", () => {
    const before = ["Clip 2 must contain 17–20 spoken words, but it has 21.", "Clip 3 must contain 17–20 spoken words, but it has 25."];
    it("counts a word-count problem left in a clip the edit rewrote, even if it was there before", () => {
      // Clip 2 was edited and is still 21 words: rejected. Clip 3 was not touched: its old fault is not the edit's.
      expect(editProblems(before, before, [1])).toEqual(["Clip 2 must contain 17–20 spoken words, but it has 21."]);
      expect(editProblems(before, ["Clip 3 must contain 17–20 spoken words, but it has 25."], [1])).toEqual([]);
    });
    it("still counts every problem the edit created", () => {
      expect(editProblems([], ["Clip 1 leaks CTA or contact language before the final clip."], [0])).toEqual(["Clip 1 leaks CTA or contact language before the final clip."]);
    });
    it("counts a speaker's line length in an edited two-person clip", () => {
      const line = "Clip 2: Motu's line must be 7-12 words but has 14.";
      expect(editProblems([line], [line], [1])).toEqual([line]);
      expect(editProblems([line], [line], [0])).toEqual([]);
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
    "Clip 2 must contain 17–20 spoken words, but it has 23.",
    "Clip 4 must contain 17–20 spoken words, but it has 16.",
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

  it("says which way to fix a word count, by exactly how much, and with what", () => {
    expect(repairDirection([issues[1]])).toBe(
      "It has only 16 spoken words — 1 word under the 17-word floor. ADD at least 1 word (adding 2 to 3 lands it at the preferred 18–19), "
      + "never more than 4 words, by carrying one more real, specific detail from the business information inside the same sentence — "
      + "never filler, a repeated adjective, empty praise or a greeting.");
    expect(repairDirection([issues[0]])).toBe(
      "It has 23 spoken words — 3 words over the 20-word ceiling. REMOVE at least 3 words (removing 4 to 5 lands it at the preferred 18–19) "
      + "by tightening the sentence — keep what this clip must say (its hook or core message, the business name, and the address and closing call line where they belong); "
      + "drop the words that carry nothing first, and if it still does not fit, leave out a secondary offer or detail — never squeeze it in.");
    expect(repairDirection(["Clip 2 leaks CTA or contact language before the final clip."])).toBe("Clip 2 leaks CTA or contact language before the final clip.");
  });
});

// The character validator words it "…but has 16." and gives a line its own band.
describe("repairing a two-character clip", () => {
  it("reads the dialogue validator's clip wording — the clip's lines together", () => {
    expect(repairDirection(["Clip 4 must contain 17–20 spoken words across both lines together, but it has 22."]))
      .toMatch(/^Its two lines together have 22 spoken words — 2 words over the 20-word ceiling\. REMOVE at least 2 words .* mostly from the longer line, keeping both lines whole and in their own speakers' mouths/);
    expect(repairDirection(["Clip 4 must contain 17–20 spoken words across both lines together, but it has 15."]))
      .toMatch(/^Its two lines together have only 15 spoken words — 2 words under the 17-word floor\. ADD at least 2 words .* in whichever line is shorter/);
  });

  it("uses a line's own band, and names whose line it is", () => {
    expect(repairDirection(["Clip 2: Motu's line must be 7-12 words but has 5."]))
      .toMatch(/^Motu's line has only 5 spoken words — 2 words under the 7-word floor\. ADD at least 2 words, never more than 7 words/);
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

  /*
    2026-10-15: "fewer problems wins" kept a rewrite that fixed a hard word and a leaked call to action
    while pushing a clip from 20 to 22 words. Nearer the word band always comes first.
  */
  it("never keeps a repair that moves a clip further from 17–20 words, whatever else it fixed", () => {
    const before = { issues: ["Clip 2 uses words people do not say in everyday Telugu", "Clip 2 leaks CTA or contact language before the final clip."], distance: 0 };
    const after = { issues: ["Clip 2 must contain 17–20 spoken words, but it has 22."], distance: 2 };
    expect(isBetterRepair(before, after)).toBe(false);
    // Equally near the band (both inside it): fewer problems wins.
    expect(isBetterRepair(before, { issues: [], distance: 0 })).toBe(true);
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
