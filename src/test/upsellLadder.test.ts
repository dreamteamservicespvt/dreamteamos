import { describe, it, expect } from "vitest";
import { nextUpsellCategory, UPSELL_LADDER } from "@/utils/upsellLadder";

/**
 * ad → social media month → website → software.
 *
 * The order the business climbs, each rung a bigger commitment than the one below. This only
 * decides which service the sale form OPENS on; the member can sell anything from there.
 */
describe("nextUpsellCategory", () => {
  it("starts a client with nothing on record at the bottom", () => {
    expect(nextUpsellCategory([])).toBe("promotional");
  });

  it("moves a client who has bought an ad up to a social media month", () => {
    expect(nextUpsellCategory(["promotional"])).toBe("social_media_management");
  });

  /** Every kind of ad is the same rung. Four wishes videos is not "has bought nothing". */
  it("counts wishes, cinematic and bulk as the ad rung", () => {
    for (const ad of ["wishes", "cinematic", "bulk_ads"]) {
      expect(nextUpsellCategory([ad])).toBe("social_media_management");
    }
  });

  it("does not keep suggesting more of what they already buy", () => {
    expect(nextUpsellCategory(["wishes", "wishes", "promotional"])).toBe("social_media_management");
    expect(nextUpsellCategory(["promotional", "social_media_management"])).toBe("website");
  });

  /**
   * A client with a website but no ad is FURTHER up than one with three ads — suggesting them a
   * promotional video walks them back down the ladder.
   */
  it("goes up from the highest rung they own, not the first one they are missing", () => {
    expect(nextUpsellCategory(["website"])).toBe("software");
    expect(nextUpsellCategory(["logo", "website"])).toBe("software");
  });

  it("stays at the top for a client who has everything", () => {
    expect(nextUpsellCategory([...UPSELL_LADDER])).toBe("software");
  });

  it("ignores services that are not on the ladder at all", () => {
    expect(nextUpsellCategory(["logo", "visiting_card", "poster"])).toBe("promotional");
  });
});
