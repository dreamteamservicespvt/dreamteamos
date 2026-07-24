import { describe, it, expect } from "vitest";
import {
  CHARACTER_VOICEOVER_SYSTEM_PROMPT,
  CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT,
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT,
  CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT,
  LOCATION_INDEX_SYSTEM_PROMPT,
  characterCastBlock,
} from "@/services/prompts/characterAd";
import { getCharacterPack } from "@/services/characterPacks";
import { WORDS_PER_CLIP, MIN_WORDS_PER_LINE, MAX_WORDS_PER_LINE } from "@/utils/dialogueFormat";
import {
  assignPhotosToClips, describeClipLocations, attachmentDirective, splitAttachmentDirective,
  parseLocationIndex, type LocationPhoto,
} from "@/utils/locationAssignment";

const pack = getCharacterPack("motu_patlu")!;

/**
 * Prompts are the product here, so these assert the clauses the format cannot work without —
 * the ones a careless edit would quietly drop.
 */

/**
 * These characters are famous, and the models know them. Describing their build and clothing
 * competes with that knowledge and yields a generic cartoon that merely matches the words, so the
 * prompts name them and stop. Real generations proved this; the assertions below are the guard.
 */
describe("character cast block", () => {
  it("names both characters", () => {
    const block = characterCastBlock(pack);
    expect(block).toContain("Motu and Patlu");
  });

  // Naming them is the whole identity anchor, so it has to reach for the ACTUAL characters —
  // "two Indian cartoon men" is what a weaker instruction produces.
  it("demands the real characters from the real show, not a look-alike", () => {
    const block = characterCastBlock(pack);
    expect(block).toContain('the Indian animated television series "Motu Patlu"');
    expect(block).toContain("REAL, ORIGINAL characters");
    expect(block).toMatch(/NOT look-alikes/);
    expect(block).toMatch(/would not instantly recognise them as Motu and Patlu, the frame is WRONG/);
  });

  it("never describes how they look", () => {
    const block = characterCastBlock(pack).toLowerCase();
    for (const banned of ["kurta", "dhoti", "trousers", "spectacles", "moustache", "belly", "bald", "orange", "yellow", "blue"]) {
      expect(block).not.toContain(banned);
    }
  });

  it("tells the model not to describe them either", () => {
    expect(characterCastBlock(pack).toLowerCase()).toContain("do not describe their appearance");
  });

  it("keeps the world photoreal while the characters stay drawn", () => {
    const block = characterCastBlock(pack).toLowerCase();
    expect(block).toContain("photoreal");
    expect(block).toContain("contact shadows");
  });

  // The version that carried both characters' full physical descriptions ran past 1500 characters,
  // and it was pasted into every clip prompt. This guards the order of magnitude, not the wording.
  it("stays short — length here is what bloated every downstream prompt", () => {
    expect(characterCastBlock(pack).length).toBeLessThan(1000);
  });
});

describe("voice-over prompt — the two-hander contract", () => {
  const prompt = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "commercial", "", "Telugu");

  it("demands both characters in every clip, Motu first", () => {
    expect(prompt).toContain("EXACTLY 2 lines");
    expect(prompt).toContain("Motu ALWAYS speaks first");
  });

  it("spells out the exact per-clip format for every clip", () => {
    expect(prompt).toContain("0-8|motu:");
    expect(prompt).toContain("0-8|patlu:");
    expect(prompt).toContain("24-32|motu:");
    expect(prompt).toContain("24-32|patlu:");
  });

  it("states the word budget the validator will enforce", () => {
    expect(prompt).toContain(`EXACTLY ${WORDS_PER_CLIP} spoken words`);
    expect(prompt).toContain(`between ${MIN_WORDS_PER_LINE} and ${MAX_WORDS_PER_LINE} words`);
  });

  it("keeps the CTA on the last clip only, spoken by Patlu", () => {
    expect(prompt).toContain("Only the FINAL clip carries the call to action, and Patlu delivers it");
    expect(prompt).toContain("Do not leak CTA");
  });

  it("bans spoken digits and phone numbers, as the standard pipeline does", () => {
    expect(prompt).toContain("Never use digits");
    expect(prompt).toContain("NEVER speak a phone number");
  });

  it("switches language rules between Telugu and English", () => {
    expect(prompt).toContain("pixel-perfect Telugu script");
    const english = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "commercial", "", "English");
    expect(english).toContain("conversational English");
    expect(english).not.toContain("pixel-perfect English script");
  });

  it("carries the festival tone only for festival ads", () => {
    const festival = CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "festival", "Diwali", "Telugu");
    expect(festival).toContain("Diwali");
    expect(prompt).toContain("COMMERCIAL ad");
  });

  it("repair prompt restates the same contract so a fix cannot drift", () => {
    const repair = CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(pack, 32, 4, "Telugu");
    expect(repair).toContain("EXACTLY 4 clips");
    expect(repair).toContain(`EXACTLY ${WORDS_PER_CLIP} spoken words per clip`);
    expect(repair).toContain("Motu speaks first");
    expect(repair).toContain("never add or remove clips");
  });
});

describe("main-frame prompt", () => {
  const clips = ["Motu asks about prices. Patlu explains the offer.", "Motu asks about range. Patlu names the stock."];
  /** The defaults every case starts from; each test overrides only what it is about. */
  const frame = (over: Partial<Parameters<typeof CHARACTER_MULTI_FRAME_SYSTEM_PROMPT>[1]> = {}) =>
    CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(pack, {
      segmentCount: 2, clipSummaries: clips, locationMode: "ai_generated", locationPlan: "ladder",
      aspectRatio: "9:16", adType: "commercial", businessContext: "ctx", ...over,
    });

  it("uses the client's photographs as ground truth when provided", () => {
    const p = frame({ locationMode: "real_provided" });
    expect(p).toContain("THE CLIENT'S REAL PHOTOGRAPHS (AUTHORITATIVE)");
    expect(p).toContain("Do not redesign, tidy, upgrade, or re-imagine it");
    expect(p).toContain("MATCH that photo's own lighting");
    expect(p).toContain("MATCH the camera perspective");
  });

  it("generates the location when no photographs were sent", () => {
    const p = frame();
    expect(p).toContain("GENERATED FROM THE BUSINESS PROFILE");
    expect(p).not.toContain("AUTHORITATIVE");
  });

  it("ties each clip's background to what is being said in it", () => {
    const p = frame();
    expect(p).toContain("A DIFFERENT PLACE EVERY CLIP");
    expect(p).toContain("the background must prove the line");
    expect(p).toContain("Clip 1: Motu asks about prices");
    expect(p).toContain("Clip 2: Motu asks about range");
  });

  it("stages both characters, visible and separated, every frame", () => {
    const p = frame();
    expect(p).toContain("BOTH characters visible in every frame");
    expect(p).toContain("the classic");
  });

  it("emits one prompt per clip with the expected separator", () => {
    expect(frame({ segmentCount: 5, clipSummaries: ["a", "b", "c", "d", "e"] }))
      .toContain("Write 5 prompts separated by ###CLIP###");
  });

  /**
   * The frames were flat and interchangeable because every clip got the same instruction. The
   * standard human-model pipeline has always shipped a per-clip shot design; this is that.
   */
  describe("director's shot plan", () => {
    it("designs each clip with a zone, camera, staging and purpose", () => {
      const p = frame({ segmentCount: 4, clipSummaries: ["a", "b", "c", "d"] });
      expect(p).toContain("THE SHOT PLAN");
      for (const n of [1, 2, 3, 4]) expect(p).toContain(`**CLIP ${n} —`);
      expect(p).toContain("📍 ZONE:");
      expect(p).toContain("🎥 CAMERA:");
      expect(p).toContain("🎭 STAGING:");
      expect(p).toContain("🎯 PURPOSE:");
    });

    it("always opens on the arrival and closes on the invitation", () => {
      const p = frame({ segmentCount: 4, clipSummaries: ["a", "b", "c", "d"] });
      expect(p).toContain("CLIP 1 — ARRIVAL / ESTABLISHING SHOT");
      expect(p).toContain("CLIP 4 — THE CLOSING INVITATION");
    });

    it("collapses a two-clip ad to arrival then close", () => {
      const p = frame({ segmentCount: 2 });
      expect(p).toContain("CLIP 1 — ARRIVAL / ESTABLISHING SHOT");
      expect(p).toContain("CLIP 2 — THE CLOSING INVITATION");
      expect(p).not.toContain("CLIP 3");
    });

    it("gives every clip its own line to build the frame around", () => {
      const p = frame();
      expect(p).toContain("🗣️ THIS CLIP'S LINE: Motu asks about prices");
    });

    it("writes clip 1 in full and every later clip as a continuation", () => {
      const p = frame({ segmentCount: 3, clipSummaries: ["a", "b", "c"] });
      expect(p).toContain("COMPLETE standalone prompt");
      expect(p).toContain("90–120 words");
      expect(p).toMatch(/CONTINUATION FRAME/);
      expect(p).toContain("clip 1's frame is attached as the reference");
      expect(p).toContain("60–90 words");
    });

    it("stops a continuation frame from re-describing what is already locked", () => {
      const p = frame({ segmentCount: 2 });
      expect(p).toMatch(/Do NOT re-describe the\s*\n?\s*characters/);
      expect(p).toMatch(/Anything you re-describe is something the generator is free to/);
    });
  });

  // Their build comes with them; writing it down invites the generator to redraw them, which is
  // how two same-sized cartoon men kept coming back instead of the real pair.
  it("never mentions height or relative size", () => {
    const p = frame().toLowerCase();
    for (const banned of ["height", "taller", "shorter", "height difference"]) {
      expect(p).not.toContain(banned);
    }
    expect(frame()).toContain("Say nothing about their build, size or how tall either one is");
  });

  /**
   * The ratio used to reach this path only as a generic "override anything below" header, so the
   * generated prompts never stated the canvas they were composed for.
   */
  describe("carries the ad configuration that was ordered", () => {
    it("states a vertical canvas and demands every prompt repeat it", () => {
      const p = frame({ aspectRatio: "9:16" });
      expect(p).toContain("Aspect ratio: 9:16 vertical (portrait)");
      expect(p).toContain("must state the 9:16 vertical (portrait) framing explicitly");
      expect(p).not.toContain("16:9");
    });

    it("states a horizontal canvas instead when that was ordered", () => {
      const p = frame({ aspectRatio: "16:9" });
      expect(p).toContain("Aspect ratio: 16:9 horizontal (landscape)");
      expect(p).toContain("the 16:9 horizontal (landscape) framing");
      expect(p).not.toContain("9:16");
    });

    it("names the clip count and the ad type", () => {
      expect(frame({ segmentCount: 4, clipSummaries: ["a", "b", "c", "d"] })).toContain("Clips: 4, 8 seconds each");
      expect(frame()).toContain("commercial — the business and what it sells must be unmistakable");
    });

    it("carries the festival through when it is a greeting ad", () => {
      const p = frame({ adType: "festival", festivalName: "Diwali" });
      expect(p).toContain("festival greeting for Diwali");
      expect(p).toContain("never replace them");
    });
  });

  /**
   * The logo is ATTACHED — the generator can see it. Asking for it to be described makes the
   * generator redraw an approximation of the words instead of reproducing the file.
   */
  describe("logo", () => {
    it("says use it, never describe it", () => {
      const p = frame({ hasLogo: true });
      expect(p).toContain('refer to it only as "the attached logo"');
      expect(p).toContain("Do NOT describe the logo");
      expect(p).toContain("never describe the attached logo");
    });

    it("forbids inventing one when none was sent", () => {
      const p = frame({ hasLogo: false });
      expect(p).toContain("No logo was provided");
      expect(p).toContain("do not put any text, signage or lettering in the frame");
    });
  });
});

/**
 * The characters are the delivery, not the subject. The first real generations produced two
 * cartoons chatting pleasantly *about advertising* and never sold the client's business at all.
 */
describe("voice-over prompt — promotional grounding", () => {
  const p = (n: number) => CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, n * 8, n, "commercial", "", "Telugu");

  it("states plainly that this sells one specific business", () => {
    expect(p(4)).toContain("THIS IS A PROMOTIONAL AD FOR ONE SPECIFIC BUSINESS");
    expect(p(4)).toMatch(/never as a comedy sketch/i);
    expect(p(4)).toMatch(/not a general chat about advertising/i);
  });

  it("lays out hook → proof → close beats across the clips", () => {
    const four = p(4);
    expect(four).toContain("Clip 1 — ARRIVAL / HOOK");
    expect(four).toContain("Clip 2 — PROOF");
    expect(four).toContain("Clip 3 — PROOF");
    expect(four).toContain("Clip 4 — CLOSE");
  });

  it("scales the beats to the package that was sold", () => {
    expect(p(2)).toContain("Clip 2 — CLOSE");
    expect(p(2)).not.toContain("PROOF");
    expect(p(8)).toContain("Clip 8 — CLOSE");
  });

  it("makes the business name and its real services mandatory", () => {
    expect(p(4)).toMatch(/Say the business's REAL NAME out loud/);
    expect(p(4)).toMatch(/REAL services, products, specialities/);
  });

  it("carries the generic test that catches an any-business line", () => {
    expect(p(4)).toContain("THE GENERIC TEST");
    expect(p(4)).toMatch(/if the line would fit any other business/);
  });

  it("blocks the failure that actually happened — an ad about advertising", () => {
    expect(p(4)).toMatch(/Never talk about advertising, videos, promotion or marketing unless that IS/);
  });

  // They are not presenting from a studio: they walked into the client's premises and are showing
  // it to the viewer. That framing is what makes the dialogue sound natural instead of read out.
  it("frames the ad as the two of them visiting the business", () => {
    const four = p(4);
    expect(four).toMatch(/have come to this client's\s*\n?business/);
    expect(four).toContain("standing in the real premises");
    expect(four).toContain("two friends who turned up at");
    expect(four).toContain("Clip 1 — ARRIVAL / HOOK");
  });

  /**
   * Every second spent saying the characters' names is a second not spent on the client. The
   * prompt asks for at most one mention in the whole ad; the validator enforces it.
   */
  it("allows the characters' names to be spoken only once in the whole ad", () => {
    const four = p(4);
    expect(four).toContain("THE NAMES ARE NOT THE PRODUCT");
    expect(four).toMatch(/AT MOST ONCE, in total/);
    expect(four).toMatch(/Not once per clip: once in the whole ad/);
    expect(four).toContain("We are promoting the business, not the characters");
  });

  it("restates the one-name limit in the repair contract so a fix cannot undo it", () => {
    const repair = CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(pack, 32, 4, "Telugu");
    expect(repair).toMatch(/name may be spoken AT MOST ONCE in total/);
  });
});

describe("veo prompt", () => {
  const p = CHARACTER_VEO_SEGMENT_SYSTEM_PROMPT(pack, 4);

  it("attributes each line to the right character for lip-sync", () => {
    expect(p).toContain("Motu says, in his own original Motu voice from the show");
    expect(p).toContain("Then Patlu replies, in his own original Patlu voice from the show");
    expect(p).toContain("Only the speaking character's mouth moves");
  });

  // A generic narrator or a fresh voice actor breaks the whole premise — these are characters the
  // audience already knows by ear as much as by sight.
  it("demands the original voices and bans substitutes", () => {
    expect(p).toContain("VOICES ARE STRICT");
    expect(p).toMatch(/only the original Motu and Patlu voices from the show/);
    expect(p).toContain("Never a narrator, a new voice actor, or a different accent");
    expect(p).toContain("No new or different voices, no narrator, no dubbing accent");
  });

  it("keeps the listener alive in frame", () => {
    expect(p).toContain("the other listens and reacts");
  });

  it("locks continuity across independently generated clips", () => {
    expect(p).toContain("Only the location and the dialogue change between clips");
  });

  it("carries the negatives that stop the usual failures", () => {
    expect(p).toContain("###SEGMENT###");
    expect(p).toContain("Do not restyle the location into a cartoon");
    expect(p).toContain("no character morphing");
  });

  it("passes the dialogue through untouched", () => {
    expect(p).toMatch(/do not rewrite, translate or shorten/i);
  });

  /**
   * The first version asked for scene, both characters in full, exchange, performance direction and
   * camera work, and produced prompts too long for a member to read. These two hold the shape.
   */
  it("forbids describing the characters, including how tall they are", () => {
    expect(p.toLowerCase()).toContain("never describe how they look or how tall they are");
    for (const banned of ["kurta", "dhoti", "spectacles", "moustache"]) {
      expect(p.toLowerCase()).not.toContain(banned);
    }
  });

  // The standard ad's Veo prompt is ~1500 characters; the version this replaced ran past 2400.
  // Staying in the standard's neighbourhood is the bar — the two-hander needs a little more room.
  it("stays as compact as the standard ad's veo prompt", () => {
    expect(p.length).toBeLessThan(1800);
  });
});

describe("location index + photo assignment", () => {
  const photo = (index: number, zone: string, usable = true): LocationPhoto => ({ index, zone, usable });

  it("uses every photo once", () => {
    const out = assignPhotosToClips(3, [photo(0, "entrance"), photo(1, "counter"), photo(2, "shelves")]);
    expect(out.map(a => a.photoIndex)).toEqual([0, 1, 2]);
  });

  /**
   * A client who sends one photo for a two-clip ad gets that photo behind clip 1 and a generated
   * zone behind clip 2. Cycling back would show the same photograph twice AND leave the member
   * attaching one file to two prompts, unsure whether they had misread the instruction.
   */
  it("generates the extra clips instead of showing a photo twice", () => {
    const out = assignPhotosToClips(4, [photo(0, "entrance"), photo(1, "counter")]);
    expect(out.map(a => a.photoIndex)).toEqual([0, 1, null, null]);
  });

  it("gives the one-photo two-clip case a photo then a generated zone", () => {
    expect(assignPhotosToClips(2, [photo(0, "shopfront")]).map(a => a.photoIndex)).toEqual([0, null]);
  });

  it("leaves spare photos unused rather than repeating one", () => {
    const out = assignPhotosToClips(2, [photo(0, "a"), photo(1, "b"), photo(2, "c"), photo(3, "d")]);
    expect(out.map(a => a.photoIndex)).toEqual([0, 1]);
  });

  it("skips photos the scout marked unusable", () => {
    const out = assignPhotosToClips(2, [photo(0, "dark", false), photo(1, "counter"), photo(2, "shelves")]);
    expect(out.map(a => a.photoIndex)).toEqual([1, 2]);
  });

  it("returns null assignments when nothing usable was sent", () => {
    const out = assignPhotosToClips(2, [photo(0, "blurry", false)]);
    expect(out.map(a => a.photoIndex)).toEqual([null, null]);
  });

  it("briefs each clip with its photo, and asks for a built zone where there is none", () => {
    const photos = [{ index: 0, zone: "entrance", lighting: "warm", bestFor: "welcome", usable: true }];
    const text = describeClipLocations(assignPhotosToClips(2, photos), photos);
    expect(text).toContain("Clip 1: PHOTOGRAPH #1");
    expect(text).toContain("zone: entrance");
    expect(text).toContain("Clip 2: NO PHOTOGRAPH");
    expect(text).toContain("never put the same photograph behind two clips");
  });

  it("tells the model to build the location when a clip has no photo", () => {
    const text = describeClipLocations(assignPhotosToClips(1, []), []);
    expect(text).toContain("NO PHOTOGRAPH");
  });

  /**
   * The member is holding several photos from the client and a list of near-identical prompts.
   * This line is the only thing that tells them which goes with which.
   */
  describe("attachment directive", () => {
    const photos = [photo(0, "shopfront"), photo(1, "billing counter")];

    it("names the exact upload slot, 1-based, with the zone", () => {
      const plan = assignPhotosToClips(2, photos);
      expect(attachmentDirective(plan[0], photos)).toBe("📎 ATTACH STORE/OFFICE IMAGE #1 — the shopfront");
      expect(attachmentDirective(plan[1], photos)).toBe("📎 ATTACH STORE/OFFICE IMAGE #2 — the billing counter");
    });

    it("says to attach nothing when the clip's location is generated", () => {
      const plan = assignPhotosToClips(2, [photo(0, "shopfront")]);
      expect(attachmentDirective(plan[1], photos)).toMatch(/^🎨 ATTACH NOTHING/);
      expect(attachmentDirective(plan[1], photos)).toContain("generated");
    });

    it("still names the slot when the scout gave no zone", () => {
      expect(attachmentDirective({ clip: 0, photoIndex: 2 }, [])).toBe("📎 ATTACH STORE/OFFICE IMAGE #3");
    });

    /**
     * The directive is for the member, not the image generator — the card shows it as a banner and
     * copies only the body, so an "ATTACH IMAGE #2" line never reaches the generator to be rendered
     * as on-screen text.
     */
    describe("splitting it back off for the UI", () => {
      const prompt = "📎 ATTACH STORE/OFFICE IMAGE #1 — the shopfront\n\nMotu and Patlu at the entrance.";

      it("round-trips: what is stamped on is what comes back off", () => {
        const plan = assignPhotosToClips(1, photos);
        const directive = attachmentDirective(plan[0], photos);
        const split = splitAttachmentDirective(`${directive}\n\nBody text here.`);
        expect(split.directive).toBe(directive);
        expect(split.body).toBe("Body text here.");
      });

      it("keeps the directive out of the copied prompt", () => {
        expect(splitAttachmentDirective(prompt).body).toBe("Motu and Patlu at the entrance.");
        expect(splitAttachmentDirective(prompt).body).not.toContain("ATTACH");
      });

      it("handles the attach-nothing form too", () => {
        const split = splitAttachmentDirective("🎨 ATTACH NOTHING — generated.\n\nBody.");
        expect(split.directive).toBe("🎨 ATTACH NOTHING — generated.");
        expect(split.body).toBe("Body.");
      });

      // A normal human-model ad carries no directive and must pass through untouched.
      it("leaves an unstamped prompt exactly as it is", () => {
        const plain = "A premium portrait of the brand ambassador.";
        expect(splitAttachmentDirective(plain)).toEqual({ directive: null, body: plain });
      });
    });
  });

  it("parses the scout's JSON, including fenced output", () => {
    const raw = '```json\n[{"index":0,"zone":"counter","usable":true},{"index":1,"zone":"dark","usable":false}]\n```';
    const parsed = parseLocationIndex(raw, 2);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].zone).toBe("counter");
    expect(parsed[1].usable).toBe(false);
  });

  it("treats a missing usable flag as usable, and drops hallucinated indexes", () => {
    const parsed = parseLocationIndex('[{"index":0,"zone":"a"},{"index":9,"zone":"ghost"}]', 1);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].usable).toBe(true);
  });

  it("returns nothing for unparseable output so the caller falls back", () => {
    expect(parseLocationIndex("not json", 2)).toEqual([]);
    expect(parseLocationIndex("", 2)).toEqual([]);
  });

  it("asks the scout for what an art director actually needs", () => {
    expect(LOCATION_INDEX_SYSTEM_PROMPT).toContain("zone");
    expect(LOCATION_INDEX_SYSTEM_PROMPT).toContain("lighting");
    expect(LOCATION_INDEX_SYSTEM_PROMPT).toContain("bestFor");
    expect(LOCATION_INDEX_SYSTEM_PROMPT).toContain("usable");
  });
});
