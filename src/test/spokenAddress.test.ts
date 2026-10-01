import { describe, it, expect } from "vitest";
import {
  MAX_SPOKEN_ADDRESS_WORDS, inventedAddressIssue, missingAddressIssue, saysAddress, spokenAddressOf,
} from "@/utils/spokenAddress";
import { addressRuleBlock } from "@/services/prompts/address";

/**
 * The verified address, said in the last clip — and never an invented one (2026-10-01). A door
 * number, a pincode, a district and a state are printed on screen, not spoken.
 */

describe("the spoken form of an address", () => {
  it("says the landmark and the town, not the door number, district, state or pincode", () => {
    expect(spokenAddressOf("D.No 12-3-45, Main Road, Opp. RTC Bus Stand, Kakinada, East Godavari Dist, Andhra Pradesh - 533001"))
      .toBe("opposite RTC Bus Stand, Kakinada");
    expect(spokenAddressOf("Plot 7, Sri Sai Complex, Beside SBI, Ramaraopet, Kakinada, AP 533004")).toBe("Beside SBI, Ramaraopet, Kakinada");
    expect(spokenAddressOf("Shop No 5, Gandhi Nagar, Vijayawada 520003")).toBe("Gandhi Nagar, Vijayawada");
    expect(spokenAddressOf("#45/2B, 2nd Floor, MG Rd, Near Clock Tower, Secunderabad, Telangana")).toBe("MG Road, Near Clock Tower, Secunderabad");
  });

  it("keeps a lone town, and gives nothing for no address", () => {
    expect(spokenAddressOf("Bodhan")).toBe("Bodhan");
    for (const none of ["", "  ", "Not provided", "N/A", "-", null, undefined]) expect(spokenAddressOf(none as string)).toBe("");
  });

  it("always fits beside a call to action", () => {
    const long = "Flat 3, Sri Venkateswara Residency Apartments, Behind Old Government Hospital, Ganesh Nagar Colony, Tirupati";
    const spoken = spokenAddressOf(long);
    expect(spoken.split(/\s+/).length).toBeLessThanOrEqual(MAX_SPOKEN_ADDRESS_WORDS);
    expect(spoken.endsWith("Tirupati")).toBe(true);
  });
});

describe("the check on the closing line", () => {
  it("finds the address with a case ending on it", () => {
    expect(saysAddress("రామారావుపేట, కాకినాడలో ఉన్న మా షాప్‌కి ఈరోజే రండి!", "రామారావుపేట, కాకినాడ")).toBe(true);
    expect(saysAddress("Visit us at opposite RTC Bus Stand, Kakinada today.", "opposite RTC Bus Stand, Kakinada")).toBe(true);
    expect(saysAddress("Visit us today for free delivery.", "opposite RTC Bus Stand, Kakinada")).toBe(false);
  });

  it("names the clip and the exact words when the address is missing", () => {
    expect(missingAddressIssue(4, "Visit us today.", "Gandhi Nagar, Vijayawada"))
      .toMatch(/^Clip 4 must say the business address "Gandhi Nagar, Vijayawada"/);
    expect(missingAddressIssue(4, "Come to Gandhi Nagar, Vijayawada today.", "Gandhi Nagar, Vijayawada")).toBeNull();
    expect(missingAddressIssue(4, "anything", "")).toBeNull();
  });

  it("flags an invented address — but never the business's own town", () => {
    expect(inventedAddressIssue(2, "Our showroom on the main road has it all.")).toMatch(/^Clip 2 speaks an address \("road"\)/);
    expect(inventedAddressIssue(3, "మెయిన్ రోడ్డు ఎదురుగా మా షాప్ ఉంది.")).toContain('("రోడ్డు")');
    expect(inventedAddressIssue(1, "Welcome to Sharma Electronics, the best in Kakinada.")).toBeNull();
    expect(inventedAddressIssue(1, "Cross Roads Electronics has it all.", ["Cross Roads Electronics"])).toBeNull();
  });
});

describe("the rule every script writer is given", () => {
  it("demands the address in the last clip, word for word, when there is one", () => {
    const p = addressRuleBlock({ given: true, spoken: "opposite RTC Bus Stand, Kakinada", finalClip: 4 });
    expect(p).toContain("THE ADDRESS — MANDATORY IN THE LAST CLIP (STRICT)");
    expect(p).toContain("Clip 4 — the closing clip — says it out loud, once");
    expect(p).toContain("    opposite RTC Bus Stand, Kakinada");
    expect(p).toContain("Never a door number, pincode, district or state");
  });

  it("asks for the native spelling when it could not be fixed in code", () => {
    const p = addressRuleBlock({ given: true, spoken: "", latin: "Gandhi Nagar, Vijayawada", language: "Telugu", finalClip: 3 });
    expect(p).toContain("written in Telugu the way a local person says it");
    expect(p).toContain("Gandhi Nagar, Vijayawada");
  });

  it("forbids any address at all when there is none", () => {
    const p = addressRuleBlock({ given: false, spoken: "", finalClip: 2 });
    expect(p).toContain("NO ADDRESS WAS GIVEN — NEVER INVENT ONE (STRICT)");
    expect(p).toContain("no road, street, colony, layout");
  });
});
