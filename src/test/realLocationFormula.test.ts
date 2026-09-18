import { describe, it, expect } from "vitest";
import { MULTI_FRAME_SYSTEM_PROMPT } from "@/services/prompts";
import { CHARACTER_MULTI_FRAME_SYSTEM_PROMPT } from "@/services/prompts/characterAd";
import {
  MODEL_LOCATION_SUBJECT, clipLocationLabel, packLocationSubject, packStagingRole, realLocationFormula,
} from "@/services/prompts/realLocation";
import { getCharacterPack } from "@/services/characterPacks";
import { assignPhotosToClips, describeClipLocations, type LocationPhoto } from "@/utils/locationAssignment";

/**
 * One real-premises formula, for every ad shot in the client's own photographs.
 *
 * The character packs had it and their ads looked shot on location. The human-model ad received the
 * same photos and the same per-clip plan, but under a system prompt that planned its own tour of the
 * business — reception, product wall, logo wall — so the photographs lost. And the pack formula
 * itself said "the two characters" for a lone deity or the client's own face.
 */

const PHOTOS: LocationPhoto[] = [
  { index: 0, zone: "billing counter", shows: "glass counter, TVs on the wall", lighting: "cool tube light", usable: true },
  { index: 1, zone: "washing machine aisle", shows: "rows of machines", lighting: "daylight from the door", usable: true },
  { index: 2, zone: "entrance", shows: "shutter and signboard", lighting: "bright daylight", usable: true },
];
const PLAN = assignPhotosToClips(4, PHOTOS);
const OVERVIEW = describeClipLocations(PLAN, PHOTOS);
const BIZ = JSON.stringify({ businessName: "Sharma Electronics", businessType: "electronics store" });

const humanModel = (withPhotos: boolean, adType = "commercial", festival = "") =>
  MULTI_FRAME_SYSTEM_PROMPT(
    "professional", adType, festival, 4, ["one", "two", "three", "four"], BIZ, "female", "", false, "",
    withPhotos
      ? {
          formula: realLocationFormula(MODEL_LOCATION_SUBJECT, OVERVIEW),
          clips: PLAN.map((p) => clipLocationLabel(p, PHOTOS)),
        }
      : undefined,
  );

const packFrame = (id: string, locationMode: "real_provided" | "ai_generated" = "real_provided") =>
  CHARACTER_MULTI_FRAME_SYSTEM_PROMPT(getCharacterPack(id)!, {
    segmentCount: 4,
    clipSummaries: ["one", "two", "three", "four"],
    locationMode,
    locationPlan: OVERVIEW,
    aspectRatio: "9:16",
    adType: "commercial",
    festivalName: "",
    businessContext: BIZ,
  });

describe("the shared formula", () => {
  it("is the exact block a character pack uses", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    expect(packFrame("duo_motu_patlu")).toContain(realLocationFormula(packLocationSubject(pack), OVERVIEW));
  });

  it("is the exact block a human-model ad uses", () => {
    expect(humanModel(true)).toContain(realLocationFormula(MODEL_LOCATION_SUBJECT, OVERVIEW));
  });

  it("names a clip's photograph, or says plainly there is none", () => {
    expect(clipLocationLabel(PLAN[1], PHOTOS)).toBe(
      "the client's PHOTOGRAPH #2 (the washing machine aisle), reproduced exactly as photographed",
    );
    expect(clipLocationLabel(PLAN[3], PHOTOS)).toMatch(/^NO CLIENT PHOTOGRAPH for this clip/);
  });
});

/**
 * "The two characters" is an instruction. On a single-figure pack the generator obeys it and adds
 * somebody — which on a Real Owner Face ad means an invented stranger beside the client.
 */
describe("the formula places whoever is actually on screen", () => {
  it("lights two characters for a duo", () => {
    const p = packFrame("duo_motu_patlu");
    expect(p).toMatch(/when lighting\s+the two characters, so they look photographed/);
    expect(p).toContain("stages CARTOON CHARACTERS inside REAL");
  });

  it("lights the deity alone for a god pack", () => {
    const p = packFrame("god_ganesha");
    expect(p).toMatch(/when lighting\s+Ganesha, so Ganesha looks photographed/);
    expect(p).not.toContain("the two characters");
    expect(p).toContain("stages a DEITY inside REAL");
    expect(p).not.toContain("CARTOON CHARACTERS");
  });

  it("stages a real person for a human pack", () => {
    const p = packFrame("owner_face_female");
    expect(p).toContain("stages a REAL PERSON inside REAL");
    expect(p).not.toContain("the two characters");
    // A role, not a proper name — it takes an article.
    expect(p).toMatch(/when lighting\s+the business owner, so the business owner looks photographed/);
  });

  it("stages one cartoon for a solo pack", () => {
    expect(packFrame("solo_doraemon")).toContain("stages a CARTOON CHARACTER inside REAL");
  });

  it("names every family's role", () => {
    for (const id of ["duo_motu_patlu", "solo_doraemon", "god_ganesha", "normal_female", "owner_face_male"]) {
      expect(packStagingRole(getCharacterPack(id)!), id).toBeTruthy();
    }
  });
});

describe("a human-model ad shot in the client's photographs", () => {
  it("carries the formula in the SYSTEM prompt, where the location rules live", () => {
    const p = humanModel(true);
    expect(p).toContain("LOCATION: THE CLIENT'S REAL PHOTOGRAPHS (AUTHORITATIVE)");
    expect(p).toContain("THIS OVERRIDES EVERY LOCATION INSTRUCTION IN THIS PROMPT");
  });

  // These are the lines that used to beat the photographs.
  it("drops the invented tour of the business", () => {
    const p = humanModel(true);
    expect(p).not.toContain("The model must appear at a DIFFERENT physical location");
    expect(p).not.toContain("From the reception → to the product display");
    expect(p).not.toContain("**Medical/Healthcare:**");
    expect(p).not.toContain("MANDATORY DRIVER OF LOCATION");
    expect(p).toContain("GOLDEN RULE (ON LOCATION)");
  });

  it("sets each clip in its own photograph", () => {
    const p = humanModel(true);
    expect(p).toContain("📍 LOCATION: the client's PHOTOGRAPH #1 (the billing counter)");
    expect(p).toContain("📍 LOCATION: the client's PHOTOGRAPH #2 (the washing machine aisle)");
    expect(p).toContain("📍 LOCATION: the client's PHOTOGRAPH #3 (the entrance)");
    expect(p).toMatch(/📍 LOCATION: NO CLIENT PHOTOGRAPH for this clip/);
  });

  it("builds clip 1 in the photograph instead of an invented reception", () => {
    const p = humanModel(true);
    expect(p).not.toContain("reception background built from the business details");
    expect(p).toContain("the space in the client's photograph assigned to Clip 1");
    expect(p).not.toContain("with the business reception clearly visible behind her");
  });

  it("puts the logo on a surface the photograph actually has", () => {
    const p = humanModel(true);
    expect(p).toContain("🪧 LOGO SURFACE: a real surface visible in this clip's own photograph");
  });

  it("tells continuation clips not to wander off to another zone", () => {
    expect(humanModel(true)).toMatch(/Do NOT choose, invent or move to a different zone/);
  });

  it("keeps festival cues layered on the photograph, not replacing it", () => {
    expect(humanModel(true, "festival", "Diwali")).toMatch(/festival cues layered onto it rather than replacing it/);
  });
});

/** The AI-built location is the path every ad without photos takes — it must not move at all. */
describe("a human-model ad with no client photographs", () => {
  it("keeps its own shot plan exactly as before", () => {
    const p = humanModel(false);
    expect(p).toContain("All 4 clips happen in ONE CONTINUOUS SPACE");
    expect(p).toContain("CONTINUITY BETWEEN CLIPS");
    expect(p).toContain("**Medical/Healthcare:**");
    expect(p).toContain("MANDATORY DRIVER OF LOCATION");
    expect(p).not.toContain("THE CLIENT'S REAL PHOTOGRAPHS");
    expect(p).not.toContain("GOLDEN RULE (ON LOCATION)");
  });

  it("gives a pack with an AI-built location no photograph block either", () => {
    const p = packFrame("god_ganesha", "ai_generated");
    expect(p).toContain("LOCATION: GENERATED FROM THE BUSINESS PROFILE");
    expect(p).not.toContain("THE CLIENT'S REAL PHOTOGRAPHS");
  });
});
