import { describe, it, expect } from "vitest";
import {
  backgroundSimilarity, parseScenePlan, repeatedBackgrounds, sceneLineFor, scenePlanBlock, withSceneBackground,
  SCENE_BACKGROUND_HEADING,
} from "@/utils/scenePlan";
import { SCENE_PLAN_SYSTEM_PROMPT, scenePlanUserPrompt } from "@/services/prompts/scenePlan";
import { parseVoiceBrief, voiceBriefAsText, voiceBriefForProfile } from "@/utils/voiceBrief";
import { elsewhereIssue, elsewherePhrase } from "@/utils/speakingPosition";
import { nameBoardInPlaceOfLogo, withOwnerImageDirective, OWNER_IMAGE_ATTACHMENT } from "@/utils/frameBrand";
import { splitAttachmentDirective } from "@/utils/locationAssignment";
import { cleanOverlayDesign, overlayDesignOf, overlayImagePrompt, OVERLAY_IMAGE_RULES } from "@/utils/overlayImage";
import { parseClipPromptEdits, promptHeadings, sameVeoPrompt, veoEditProblems } from "@/utils/veoRefine";
import { VEO_REFINE_PLAN_SYSTEM_PROMPT, VEO_REFINE_SYSTEM_PROMPT } from "@/services/prompts/refine";
import { assembleVeoPrompt, planClipMotion } from "@/services/prompts/motion";
import { modelVeoSubject, STOCK_IMAGE_SYSTEM_PROMPT, OVERLAY_TEXT_SYSTEM_PROMPT } from "@/services/prompts";
import { LOWER_THIRD_SYSTEM_PROMPT } from "@/services/prompts/lowerThird";

/**
 * The AdGen.ai changes of 2026-09-22 — backgrounds that follow the line and the video's motive, the
 * name board when there is no logo, the owner's photo, the client's voice note, scripts spoken from
 * inside the business, a Veo refine that understands the request, B-roll of the subject, overlay
 * images and the video bottom label. Each rule that lives in code is pinned here.
 */

const plan = (clips: { clip?: number; background: string; elements?: string[] }[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ motive: "an annadanam at the temple", category: "food donation", setting: "the temple dining hall", mood: "devotional", avoid: ["billing counter"], clips, ...extra });

describe("the scene plan", () => {
  it("reads one background per clip, in clip order", () => {
    const ctx = parseScenePlan(plan([
      { clip: 2, background: "the serving line with big vessels", elements: ["brass vessels", "ladles"] },
      { clip: 1, background: "devotees seated in rows on banana leaves" },
    ]), 2)!;
    expect(ctx.motive).toBe("an annadanam at the temple");
    expect(ctx.clips.map((c) => c.background)).toEqual(["devotees seated in rows on banana leaves", "the serving line with big vessels"]);
    expect(sceneLineFor(ctx, 1)).toBe("the serving line with big vessels (with brass vessels, ladles)");
  });

  // A padded clip is exactly a repeated background, so a plan with a hole is refused, not filled.
  it("refuses a plan that misses a clip, or has no motive", () => {
    expect(parseScenePlan(plan([{ clip: 1, background: "the hall" }]), 2)).toBeNull();
    expect(parseScenePlan(JSON.stringify({ clips: [{ clip: 1, background: "the hall" }] }), 1)).toBeNull();
    expect(parseScenePlan("not json", 1)).toBeNull();
  });

  it("spots a background that repeats an earlier clip's, even reworded", () => {
    expect(backgroundSimilarity("the gold necklace display counter", "the necklace display counter in gold")).toBeGreaterThanOrEqual(0.8);
    const ctx = parseScenePlan(plan([
      { clip: 1, background: "the main billing counter with the logo wall" },
      { clip: 2, background: "the saree shelves stacked with silk" },
      { clip: 3, background: "the billing counter and logo wall, main" },
    ]), 3)!;
    expect(repeatedBackgrounds(ctx)).toEqual([3]);
  });

  it("stamps each frame with its own background, once", () => {
    const ctx = parseScenePlan(plan([{ clip: 1, background: "the dining hall" }, { clip: 2, background: "the kitchen pass" }]), 2)!;
    const stamped = withSceneBackground("A frame.", ctx, 1);
    expect(stamped).toContain(`${SCENE_BACKGROUND_HEADING}: the kitchen pass.`);
    expect(stamped).toContain("the temple dining hall");
    expect(withSceneBackground(stamped, ctx, 1)).toBe(stamped);
    expect(withSceneBackground("A frame.", null, 0)).toBe("A frame.");
    expect(scenePlanBlock(ctx)).toContain("NEVER SHOW (contradicts the motive): billing counter");
  });

  it("asks for the motive first, with the team's frame instructions as the highest priority", () => {
    const system = SCENE_PLAN_SYSTEM_PROMPT({ clipCount: 3, adType: "commercial", subject: "the female brand ambassador" });
    expect(system).toContain("STEP 1 — THE MOTIVE");
    expect(system).toContain("annadanam");
    expect(system).toContain("birthday wishes");
    expect(system).toContain("EVERY clip's background is DIFFERENT from every other clip's");
    expect(system).toContain("exactly 3 objects");
    const user = scenePlanUserPrompt({ businessContent: "", frameInstructions: "Show the temple gopuram", businessInfo: {}, clipLines: ["a"], adType: "commercial" });
    expect(user).toContain("FRAME / BACKGROUND INSTRUCTIONS (HIGHEST PRIORITY):\nShow the temple gopuram");
  });
});

describe("the client's voice note", () => {
  it("reads a transcript, a summary, requirements and conflicts", () => {
    const brief = parseVoiceBrief("```json\n" + JSON.stringify({
      transcript: "మా షాప్ ఉదయం ఆరు గంటలకే తెరుస్తాం", summary: "Mention the 6 am opening.",
      requirements: ["Say we open at 6 am"], conflicts: ["Card says 9 am"],
    }) + "\n```")!;
    expect(brief.summary).toBe("Mention the 6 am opening.");
    const text = voiceBriefAsText(brief);
    expect(text).toContain("• Say we open at 6 am");
    expect(text).toContain("the written BUSINESS CONTENT wins unless the voice note is clearly newer");
    expect(text).toContain('Word for word: "మా షాప్ ఉదయం ఆరు గంటలకే తెరుస్తాం"');
    expect(voiceBriefForProfile(brief)).toMatchObject({ requirements: ["Say we open at 6 am"], conflictsWithWrittenMaterial: ["Card says 9 am"] });
  });

  it("treats a reply that heard nothing as no brief at all", () => {
    expect(parseVoiceBrief(JSON.stringify({ transcript: "", summary: "", requirements: ["x"] }))).toBeNull();
    expect(parseVoiceBrief("")).toBeNull();
  });
});

describe("speaking from inside the business", () => {
  it("catches a line that sends the viewer somewhere else", () => {
    expect(elsewherePhrase("Let's go to Sharma Electronics today!")).toBeTruthy();
    expect(elsewherePhrase("మనం అక్కడికి వెళ్దాం")).toBeTruthy();
    expect(elsewhereIssue(3, "Go to Sharma Electronics now.")).toMatch(/^Clip 3 sends the viewer somewhere else/);
  });

  it("lets a line that speaks from here through", () => {
    expect(elsewherePhrase("Come to us — here at Sharma Electronics everything is ready.")).toBeNull();
    expect(elsewherePhrase("Visit us today and go to our website for more.")).toBeNull();
    expect(elsewhereIssue(1, "Here at our shop, every brand is in stock.")).toBeNull();
  });
});

describe("no logo: the name board, never an attached logo", () => {
  it("turns every reference to a logo file into the name board", () => {
    const out = nameBoardInPlaceOfLogo(
      "The attached logo is mounted on the wall. Place the uploaded brand logo on the counter. Attach the logo with this prompt.",
      "Sharma Electronics",
    );
    expect(out).toContain('The business name board reading "SHARMA ELECTRONICS" is mounted on the wall.');
    expect(out).toContain('Place the business name board reading "SHARMA ELECTRONICS" on the counter.');
    expect(out).not.toMatch(/attach/i);
    expect(out).not.toMatch(/logo/i);
  });

  it("leaves a prompt that never mentions a logo file alone", () => {
    expect(nameBoardInPlaceOfLogo("A bright jewellery counter.", "X")).toBe("A bright jewellery counter.");
  });
});

describe("the owner's photo on a Real Owner Face frame", () => {
  it("tells the member to attach it, on the line they read first", () => {
    const out = withOwnerImageDirective("A frame.");
    expect(out.startsWith(`📎 ATTACH ${OWNER_IMAGE_ATTACHMENT}`)).toBe(true);
    expect(splitAttachmentDirective(out).body).toBe("A frame.");
    expect(withOwnerImageDirective(out)).toBe(out);
  });

  it("joins an existing photo directive, so there is still one directive line", () => {
    const out = withOwnerImageDirective("📎 ATTACH STORE/OFFICE IMAGE #2 — the counter\n\nA frame.");
    const { directive, body } = splitAttachmentDirective(out);
    expect(directive).toBe(`📎 ATTACH STORE/OFFICE IMAGE #2 — the counter  +  ${OWNER_IMAGE_ATTACHMENT}`);
    expect(body).toBe("A frame.");
    expect(withOwnerImageDirective("🎨 ATTACH NOTHING — no client photo for this clip.\n\nA frame.")).toMatch(/^📎 ATTACH the OWNER IMAGE/);
  });
});

describe("the Overlay Text Image Generator", () => {
  it("assembles a short prompt with the exact text, a real transparent background and a tight crop", () => {
    const p = overlayImagePrompt("FREE DELIVERY", "polished gold letters with a fine sparkle");
    expect(p).toBe(`Premium 3D text "FREE DELIVERY" — polished gold letters with a fine sparkle. Bold embossed 3D typography with real depth, a crisp bevel and soft studio lighting, sharp clean edges, readable at a glance on a phone. ${OVERLAY_IMAGE_RULES}`);
    expect(OVERLAY_IMAGE_RULES).toContain("real alpha-channel PNG");
    expect(OVERLAY_IMAGE_RULES).toContain("Tightly cropped");
    expect(overlayDesignOf(p)).toBe("polished gold letters with a fine sparkle");
  });

  it("drops any background the design tried to add, and falls back when it is empty", () => {
    expect(cleanOverlayDesign("glossy red letters. Set on a marble background with flowers.")).toBe("glossy red letters");
    expect(overlayImagePrompt("OFFER", "", "saffron lettering")).toContain('"OFFER" — saffron lettering.');
  });

  it("asks the model for the look, themed to the festival or the business", () => {
    const p = OVERLAY_TEXT_SYSTEM_PROMPT("Telugu");
    expect(p).toContain('"design"');
    expect(p).toContain("A FESTIVAL ad: the design follows THAT festival's own colours and symbols exactly");
    expect(p).toContain("Never describe a background");
  });
});

describe("B-roll shows the subject of the line, not a presenter", () => {
  it("bans posing people and text, and ties each image to its clip", () => {
    expect(STOCK_IMAGE_SYSTEM_PROMPT).toContain("THE SUBJECT OF THE LINE — NOT A PERSON");
    expect(STOCK_IMAGE_SYSTEM_PROMPT).toContain("NO PRESENTER, NO MODEL, NO POSING PERSON");
    expect(STOCK_IMAGE_SYSTEM_PROMPT).toContain("A festival ad: THAT festival's own imagery");
    expect(STOCK_IMAGE_SYSTEM_PROMPT).toContain("NO TEXT ANYWHERE IN THE IMAGE");
    expect(STOCK_IMAGE_SYSTEM_PROMPT).toContain('"fromWord"');
  });
});

describe("the VIDEO BOTTOM LABEL", () => {
  const label = (over: Record<string, unknown> = {}) => LOWER_THIRD_SYSTEM_PROMPT({
    businessType: "food", adType: "commercial", contactCount: 1, hasAddress: true, ...over,
  } as any);

  it("is named for what it is", () => {
    expect(label()).toMatch(/^VIDEO BOTTOM LABEL — design a PREMIUM label/);
  });

  it("takes a festival's own palette and symbols, and never writes the greeting", () => {
    const p = label({ adType: "festival", festivalName: "Diwali", festivalTheme: { colors: "saffron and gold", patterns: "rangoli dots", elements: "diyas, marigolds" } });
    expect(p).toContain("FESTIVAL THEME (VISUAL ONLY)");
    expect(p).toContain("colours saffron and gold; patterns rangoli dots; symbols diyas, marigolds");
    expect(p).toContain("Do NOT write the festival's name, a greeting, wishes or a date anywhere on the label");
  });

  it("matches its mood to what the video is about, without writing any of it", () => {
    const p = label({ context: { motive: "an annadanam at the temple", mood: "devotional" } });
    expect(p).toContain("THIS VIDEO: this video is about an annadanam at the temple; its mood is devotional");
    expect(p).toContain("Never write any of it on the label");
    // The content rule does not move.
    expect(p).toContain("The label carries FOUR things and nothing else");
  });
});

describe("refining a Veo prompt", () => {
  const model = modelVeoSubject("female");
  const original = assembleVeoPrompt({
    aspectRatio: "9:16", plan: planClipMotion(2, "commercial")[0], identityLock: model.identityLock, language: "Telugu",
    speech: [{ voice: model.voice, line: "మా షాప్ కి రండి." }], cast: model.cast, castPlural: model.castPlural,
  });

  it("understands and compares before it edits, and never keeps the cast walking", () => {
    expect(VEO_REFINE_PLAN_SYSTEM_PROMPT).toContain("UNDERSTAND the request");
    expect(VEO_REFINE_PLAN_SYSTEM_PROMPT).toContain("COMPARE it with each prompt");
    expect(VEO_REFINE_PLAN_SYSTEM_PROMPT).toContain('"understood"');
    expect(VEO_REFINE_SYSTEM_PROMPT).toContain("Never change, translate or re-punctuate anything inside the quotation marks");
    expect(VEO_REFINE_SYSTEM_PROMPT).toContain("never make the camera static unless the member explicitly asks");
    expect(VEO_REFINE_SYSTEM_PROMPT).not.toContain("WALKS in every clip");
  });

  it("reads the edit as JSON keyed by clip", () => {
    const edits = parseClipPromptEdits(JSON.stringify({ clips: [{ clip: 2, prompt: "new" }, { clip: 5, prompt: "out of range" }] }), [1]);
    expect([...edits.entries()]).toEqual([[1, "new"]]);
    expect(parseClipPromptEdits("garbage", [0]).size).toBe(0);
  });

  it("accepts an edit that keeps the dialogue and every section", () => {
    const edited = original.replace(/SCENE LIFE: [^\n]*/, "SCENE LIFE: steam rising from the tea glasses on the counter.");
    expect(veoEditProblems(original, edited)).toEqual([]);
    expect(sameVeoPrompt(original, `${original}  `)).toBe(true);
    expect(promptHeadings(original)).toEqual(expect.arrayContaining(["ACTION", "CAMERA", "SPEECH", "SCENE LIFE", "NEGATIVE PROMPT", "WORLD LOCK"]));
  });

  it("refuses an edit that changes the spoken line or drops a section", () => {
    const reworded = original.replace("మా షాప్ కి రండి.", "మా షాప్ కి రండి ఇప్పుడే.");
    expect(veoEditProblems(original, reworded)[0]).toMatch(/spoken line/);
    const dropped = original.replace(/\nNegative prompt:[\s\S]*$/, "");
    expect(veoEditProblems(original, dropped).join(" ")).toMatch(/NEGATIVE PROMPT/);
  });
});
