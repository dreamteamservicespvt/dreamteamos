/**
 * The owner's four AdGen fixes of 2026-11-05: the aspect ratio in frame / B-roll / poster prompts, the cast close to
 * the camera, overlay text that stands out from the B-roll, and B-roll on a different idea and different words.
 */
import { describe, expect, it } from "vitest";
import { ASPECT_RATIO_HEADING, SUBJECT_SIZE_HEADING, frameCastOf, withAspectRatio, withRatioMentionsFixed, withSubjectSize } from "@/utils/frameFormat";
import { brollAwayFromText, brollRepeatingText, freeImageCue, onScreenTextBlock, repeatsText } from "@/utils/brollTextPlan";
import { cueForWords } from "@/utils/wordTiming";
import { OVERLAY_LEGIBILITY, overlayDesignOf, overlayImagePrompt } from "@/utils/overlayImage";
import { compositionFor, planClipMotion } from "@/services/prompts/motion";
import { posterSizePhrase } from "@/utils/posterAdType";
import { videoPosterSizeOf } from "@/services/geminiService";
import { MEMBER_CHANGES_HEADING, applyPromptChangePlan, applyPromptEdits, memberChangesOf, parsePromptChangePlan } from "@/utils/promptChanges";

describe("aspect ratio in the copied prompt", () => {
  it("puts the ad's ratio on the first line and corrects a template's 9:16 in a 16:9 ad", () => {
    const out = withAspectRatio("Create a Ultra-realistic DSLR photograph, single image, 9:16 vertical — a jeweller.", "16:9");
    expect(out.split("\n")[0]).toBe(`${ASPECT_RATIO_HEADING}: 16:9 horizontal (landscape) — compose the whole image for this canvas.`);
    expect(out).not.toMatch(/9:16/);
    expect(out).toContain("single image, 16:9 horizontal (landscape)");
  });
  it("keeps a leading 📎 attach line first", () => {
    const out = withAspectRatio("📎 ATTACH STORE/OFFICE IMAGE #2 — the counter\n\nThe frame.", "9:16");
    expect(out.split("\n")[0]).toMatch(/^📎 ATTACH/);
    expect(out).toContain(`${ASPECT_RATIO_HEADING}: 9:16 vertical (portrait)`);
  });
  it("is idempotent and re-stamps a changed ratio", () => {
    const once = withAspectRatio("A frame.", "9:16");
    expect(withAspectRatio(once, "9:16")).toBe(once);
    const flipped = withAspectRatio(once, "16:9");
    expect(flipped.match(new RegExp(ASPECT_RATIO_HEADING, "g"))).toHaveLength(1);
    expect(flipped).toContain("16:9 horizontal");
  });
  it("leaves a vertical reference line and a landscape view alone", () => {
    const text = "a fixed vertical reference behind them, a hill landscape through the window, portrait format";
    expect(withRatioMentionsFixed(text, "16:9")).toBe("a fixed vertical reference behind them, a hill landscape through the window, horizontal format");
  });
  it("the video kit's poster takes the ad's ratio", () => {
    expect(posterSizePhrase(videoPosterSizeOf({ aspectRatio: "16:9" }))).toBe("16:9 horizontal poster");
    expect(posterSizePhrase(videoPosterSizeOf({ aspectRatio: "9:16" }))).toBe("9:16 vertical poster");
  });
});

describe("the cast close to the camera", () => {
  it("a person is a close medium shot, a drawn cast the full figure, both ~85–90% of the frame", () => {
    const person = withSubjectSize("Frame.", { cast: "person" });
    expect(person).toContain(SUBJECT_SIZE_HEADING);
    expect(person).toMatch(/head to mid-thigh/);
    expect(person).toMatch(/85–90% of the frame height/);
    expect(person).toMatch(/Never a wide shot/);
    const figure = withSubjectSize("Frame.", { cast: "figure" });
    expect(figure).toMatch(/full figure from head to feet, close to the camera/);
    expect(withSubjectSize(person, { cast: "person" })).toBe(person);
  });
  it("goes before a closing 📎 line", () => {
    const out = withSubjectSize("Frame.\n\n📎 ATTACH THE OWNER IMAGE", { cast: "person" });
    expect(out.indexOf(SUBJECT_SIZE_HEADING)).toBeLessThan(out.indexOf("📎"));
  });
  it("reads the cast kind from the motion plan", () => {
    expect(frameCastOf({ performer: "cartoon" })).toBe("figure");
    expect(frameCastOf({ performer: "person", twoHander: true })).toBe("pair");
    expect(frameCastOf(undefined, { realPerson: true, ownerPair: true })).toBe("pair");
    expect(frameCastOf({ performer: "person" })).toBe("person");
  });
  it("a person in place is no longer asked for the feet; a drawn character still is", () => {
    const [personClip] = planClipMotion(2, "commercial", "person");
    const person = compositionFor(personClip);
    expect(person).toMatch(/medium shot \(head to mid-thigh\)/);
    expect(person).not.toMatch(/feet and the floor visible/);
    expect(person).not.toMatch(/head to knees/);
    const [cartoonClip] = planClipMotion(2, "commercial", "cartoon");
    expect(compositionFor(cartoonClip)).toMatch(/full figure from head to feet[\s\S]*feet and the floor visible/);
  });
});

describe("overlay text stands out from the B-roll", () => {
  it("every overlay prompt carries the contrast rule and its design still reads back", () => {
    const prompt = overlayImagePrompt("FREE DELIVERY", "saffron and gold letters with a diya");
    expect(prompt).toContain(OVERLAY_LEGIBILITY);
    expect(overlayDesignOf(prompt)).toBe("saffron and gold letters with a diya");
  });
});

describe("B-roll on another idea and other words", () => {
  const line = "ఈ దీపావళికి మా షాప్‌లో ఉచిత హోమ్ డెలివరీ మరియు ప్రతి కొనుగోలుపై ప్రత్యేక బహుమతి ఇస్తున్నాం";
  const textCue = cueForWords(line, "ఉచిత", "డెలివరీ", 0, 8);
  const overlays = [{ clip: 1, text: "FREE DELIVERY", cue: textCue, start: 0, end: 8, line }];

  it("moves an image off the seconds its clip's text is on screen", () => {
    const broll = [{ id: 1, concept: "Festive Gift Box", start: 0, end: 8, line, cue: cueForWords(line, "ఉచిత", "డెలివరీ", 0, 8) }];
    const [moved] = brollAwayFromText(broll, overlays);
    expect(moved.movedOffText).toBe(true);
    expect(moved.cue!.start >= textCue.end || moved.cue!.end <= textCue.start).toBe(true);
    expect(moved.cue!.end - moved.cue!.start).toBeGreaterThanOrEqual(1.2);
    expect(moved.cueLabel).toContain(moved.cue!.fromWord);
  });
  it("leaves an image that is already clear of the text", () => {
    const broll = [{ id: 1, concept: "Gift", start: 0, end: 8, line, cue: cueForWords(line, "ప్రత్యేక", "బహుమతి", 0, 8) }];
    expect(brollAwayFromText(broll, overlays)[0].movedOffText).toBe(false);
  });
  it("flags a clip the text fills end to end", () => {
    const full = { start: 0, end: 8, fromWord: "ఈ", toWord: "ఇస్తున్నాం", matched: true };
    expect(freeImageCue(line, 0, 8, [full], textCue)).toBeNull();
    const [item] = brollAwayFromText([{ id: 1, start: 0, end: 8, line, cue: textCue }], [{ clip: 1, cue: full }]);
    expect(item.sharesTimeWithText).toBe(true);
  });
  it("finds an image whose idea is its text's", () => {
    expect(repeatsText("Free Home Delivery", "FREE DELIVERY")).toBe(true);
    expect(repeatsText("Phone Call to the Shop", "Call Now")).toBe(true);
    expect(repeatsText("Festive Gift Box", "FREE DELIVERY")).toBe(false);
    expect(brollRepeatingText([{ id: 1, concept: "Fresh Sweets Counter" }], overlays)).toEqual([]);
    expect(brollRepeatingText([{ id: 1, concept: "Doorstep Delivery Scooter" }], overlays)).toHaveLength(1);
    expect(brollRepeatingText([{ id: 1, concept: "Free Delivery Van" }], overlays)).toEqual([{ clip: 1, concept: "Free Delivery Van", text: "FREE DELIVERY" }]);
  });
  it("tells the B-roll writer what each text says and when", () => {
    expect(onScreenTextBlock(overlays)).toBe(`• Clip 1: "FREE DELIVERY" — on screen from "ఉచిత" to "డెలివరీ"`);
  });
});

describe("a frame / label refine is a plan applied by code (the owner: \"refine was not working\")", () => {
  const frame = (n: number) => [
    `Clip ${n}: she wears a luxurious deep maroon silk saree with gold zari work. The room glows in deep maroon and gold Diwali light.`,
    "OUTFIT (AS ORDERED): an elegant designer silk saree in a colour drawn from the client's brand palette — this overrides any other outfit named in this prompt.",
    "FACE LOCK: her face exactly as in the photograph, deep maroon bindi none.",
    "📎 ATTACH THE OWNER IMAGE",
  ].join("\n\n");
  const plan = parsePromptChangePlan(JSON.stringify({
    understood: "royal blue saree", clips: [],
    changes: "Her saree is royal blue silk with a gold zari border in every clip",
    edits: [
      { clip: 0, find: "a luxurious deep maroon silk saree with gold zari work", replace: "a luxurious royal blue silk saree with a gold zari border" },
      { clip: 0, find: "in a colour drawn from the client's brand palette", replace: "in royal blue with a gold zari border" },
      { clip: 0, find: "deep maroon bindi none", replace: "royal blue" },
      { clip: 2, find: "a sentence that is not there", replace: "x" },
    ],
  }))!;

  it("changes only what was asked, overrides the outfit stamp, and stamps the change last", () => {
    const { prompts, changed, skipped } = applyPromptChangePlan([frame(1), frame(2)], plan);
    expect(changed).toEqual([0, 1]);
    for (const p of prompts) {
      expect(p).toContain("royal blue silk saree with a gold zari border");
      expect(p).toContain("OUTFIT (AS ORDERED): an elegant designer silk saree in royal blue with a gold zari border");
      expect(p).toContain("The room glows in deep maroon and gold Diwali light."); // the scene was not asked about
      expect(p).toContain("FACE LOCK: her face exactly as in the photograph, deep maroon bindi none."); // protected
      expect(p).toMatch(new RegExp(`${MEMBER_CHANGES_HEADING.replace(/[()]/g, "\\$&")}: Her saree is royal blue[^\\n]*\\.\\n\\n📎 ATTACH THE OWNER IMAGE$`));
    }
    expect(skipped).toBeGreaterThan(0);
  });
  it("a later refine keeps one change line, and an undo removes it", () => {
    const once = applyPromptChangePlan([frame(1)], plan).prompts[0];
    const twice = applyPromptChangePlan([once], { ...plan, edits: [], changes: "Her saree is royal blue silk. Warmer light." }).prompts[0];
    expect(twice.match(/MEMBER'S CHANGES/g)).toHaveLength(1);
    expect(memberChangesOf(twice)).toBe("Her saree is royal blue silk. Warmer light.");
    const undone = applyPromptChangePlan([twice], { ...plan, edits: [], changes: "", clearChanges: true }).prompts[0];
    expect(memberChangesOf(undone)).toBe("");
  });
  it("a request for one clip changes only that clip", () => {
    const { changed } = applyPromptChangePlan([frame(1), frame(2)], { ...plan, clips: [2] });
    expect(changed).toEqual([1]);
  });
  it("an edit that would touch a protected line is refused", () => {
    expect(applyPromptEdits("TEXT IN THE IMAGE: only the logo.", [{ find: "only the logo", replace: "a banner too" }]).applied).toBe(0);
    expect(parsePromptChangePlan("not json")).toBeNull();
  });
});
