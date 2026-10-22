import { describe, expect, it } from "vitest";
import { withoutUnspokenNumbers } from "@/utils/unspokenNumbers";
import { spokenAddressOf } from "@/utils/spokenAddress";
import { findHardWords, hardWordIssue, hardWordIssues } from "@/services/prompts/everydaySpeech";
import { planClipMotion, resolveDirection } from "@/services/prompts/motion";

/*
  The live check of 2026-10-22 (a Telugu Diwali ad, a logo attached, the six fixes) shipped this last clip:
  "శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రాను ఇప్పుడే రండి మెయిన్ రోడ్, సర్పవరం, కాకినాడ ఫోన్." Two causes:
  1. the typed address line "…, Kakinada-533005. Phone 9876543210." lost its number but kept "Phone" — an English
     label was taken only with a colon or "No." after it — and the spoken address said it ("కాకినాడ ఫోన్");
  2. the everyday-word swap సందర్శించండి → రండి left the place in the object case ("ఇన్‌ఫ్రాను … రండి"), which is
     not Telugu: with రండి the place takes కి ("ఇన్‌ఫ్రాకి రండి").
*/
describe("a bare English phone label goes with its number", () => {
  it("takes 'Phone' / 'Mobile' / 'Cell' written without a colon", () => {
    expect(withoutUnspokenNumbers("Kakinada-533005. Phone 9876543210.")).toBe("Kakinada.");
    expect(withoutUnspokenNumbers("Mobile 98480 12345, open every day.")).toBe("open every day.");
    expect(withoutUnspokenNumbers("Visit us. Cell 9848012345.")).toBe("Visit us.");
    expect(withoutUnspokenNumbers("Ph. 0884-2345678 for orders.")).toBe("for orders.");
  });

  it("keeps the actions and a label with no number", () => {
    expect(withoutUnspokenNumbers("Call 98480 12345 now.")).toBe("Call now.");
    expect(withoutUnspokenNumbers("Phone us today for a free visit.")).toBe("Phone us today for a free visit.");
  });

  it("the spoken address of a typed line with a phone at its end is only the place", () => {
    expect(spokenAddressOf("Door No 5-87/1, Main Road, Sarpavaram, Kakinada-533005. Phone 9876543210.")).toBe(
      "Main Road, Sarpavaram, Kakinada",
    );
    expect(spokenAddressOf("Main Road, Kakinada. Mobile 98480 12345")).toBe("Main Road, Kakinada");
  });
});

describe("a place before రండి takes కి, never ను", () => {
  it("flags the object case before రండి, with an adverb between or not", () => {
    expect(findHardWords("శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రాను ఇప్పుడే రండి.", "Telugu")).toEqual([
      { found: "ఇన్‌ఫ్రాను", say: "ఇన్‌ఫ్రాకి" },
    ]);
    expect(findHardWords("మా షాప్‌ను రండి", "Telugu")).toEqual([{ found: "షాప్‌ను", say: "షాప్‌కి" }]);
  });

  it("leaves correct Telugu alone", () => {
    expect(findHardWords("మా షాప్‌కి ఈరోజే రండి.", "Telugu")).toEqual([]);
    expect(findHardWords("అందరూ రండి, మా ఆఫర్ చూడండి.", "Telugu")).toEqual([]);
    // "come to see the flats" — ను belongs to చూడటానికి, not to రండి.
    expect(findHardWords("మా flatsను చూడటానికి రండి.", "Telugu")).toEqual([]);
  });

  it("the message for సందర్శించండి says which case the place takes", () => {
    const issue = hardWordIssues(["మా షాప్‌ను సందర్శించండి, ఈ దీపావళి ఆఫర్ మీ కోసం."], "Telugu")[0];
    expect(issue).toContain('"సందర్శించండి" → say "రండి"');
    expect(issue).toMatch(/కి రండి/);
    expect(issue).toMatch(/never .*ను/);
    // A swap that has nothing to do with రండి gets no such note.
    expect(hardWordIssue(1, [{ found: "అత్యంత", say: "చాలా" }])).not.toMatch(/కి రండి/);
  });
});

/*
  Run 2 of the same check: the director wrote "gesturing toward the model flat and brochures" (a show flat — the
  everyday word in Indian real estate), and the swap of "the model" (the director's name for the presenter) for
  "she" printed "gesturing toward she flat". A model flat / house / villa is a thing, not the presenter.
*/
describe("'the model' is the presenter only when it is not a show flat", () => {
  const inPlace = planClipMotion(2, "festival")[1];

  it("keeps a model flat, house or villa as it is", () => {
    const action = "she faces the camera and gestures toward the model flat and brochures on the desk beside her";
    expect(resolveDirection(inPlace, { action }, "She").action).toBe(action);
    const house = "she points to the model house plan on the desk beside her";
    expect(resolveDirection(inPlace, { action: house }, "She").action).toBe(house);
  });

  it("still reads the presenter as she", () => {
    const action = "the model faces the camera and presents the brochure on the desk beside her";
    expect(resolveDirection(inPlace, { action }, "She").action).toBe(
      "she faces the camera and presents the brochure on the desk beside her",
    );
  });
});

/*
  The same typed line, "Address: Door No 5-87/1, Main Road, Sarpavaram, Kakinada-533005. Phone 98480 12345.", was
  the verified address word for word — phone included — so the label printed the number inside its address strip
  as well as in its pill. The address ends where a phone label begins.
*/
describe("a phone written on the Address line is not part of the address", () => {
  it("cuts the address at a phone label, keeping the number as a contact", async () => {
    const { addressInText, verifyBusinessFacts } = await import("@/utils/businessFacts");
    const typed = "Diwali ad.\nAddress: Door No 5-87/1, Main Road, Sarpavaram, Kakinada-533005. Phone 98480 12345.";
    expect(addressInText(typed)).toBe("Door No 5-87/1, Main Road, Sarpavaram, Kakinada-533005");
    expect(addressInText("Address: 12 Gandhi Road, Kakinada, Ph: 0884-2345678")).toBe("12 Gandhi Road, Kakinada");
    expect(addressInText("Address: Main Road, Kakinada | WhatsApp 98480 12345")).toBe("Main Road, Kakinada");
    // A door number or a pincode is part of the address.
    expect(addressInText("Address: D.No 5-87/1, Main Road, Kakinada - 533005")).toBe("D.No 5-87/1, Main Road, Kakinada - 533005");
    const facts = verifyBusinessFacts({ typedText: typed, profile: {}, hasContactDocuments: false } as any);
    expect(facts.address).toBe("Door No 5-87/1, Main Road, Sarpavaram, Kakinada-533005");
    expect(facts.phones.map((p) => p.display)).toEqual(["98480 12345"]);
  });
});

/*
  The Flow clip of the live check (Whisper): "…కస్టమర్లందరికీ, ఈ పండుగ వేళ హృదయపూర్వక దీపావళి" at 7.98 s — the wish word
  శుభాకాంక్షలు never said. The greeting alone was 12 words / ~43 syllables, and the 17–20-word contract added five
  more. The owner (2026-10-22): keep the contract, drop శ్రేయోభిలాషులు and హృదయపూర్వక from the Telugu greeting.
*/
describe("the Telugu greeting fits its 8 seconds", () => {
  it("is '{business} తరఫున మా మిత్రులు, కస్టమర్లందరికీ {festival} శుభాకాంక్షలు'", async () => {
    const { wishOpeningLine, wishAudienceRule } = await import("@/services/prompts/festivalWish");
    // Only దసరా has a fixed Telugu spelling (utils/festivalNames); other festivals keep their name as given.
    expect(wishOpeningLine("Diwali", "Telugu")).toBe('"{Business Name} తరఫున మా మిత్రులు, కస్టమర్లందరికీ Diwali శుభాకాంక్షలు"');
    const rule = wishAudienceRule("Diwali", "Telugu");
    expect(rule).toContain("Never add శ్రేయోభిలాషులు or హృదయపూర్వక");
    expect(rule).not.toMatch(/All three/);
    // English and the other languages keep their own greeting.
    expect(wishOpeningLine("Diwali", "English")).toContain("friends, well-wishers and customers");
  });

  it("asks a repair when the greeting still says a dropped word, and passes the short one", async () => {
    const { wishAudienceIssues } = await import("@/services/prompts/festivalWish");
    const long = "శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రా తరఫున మా మిత్రులు, శ్రేయోభిలాషులు, కస్టమర్లందరికీ దీపావళి హృదయపూర్వక శుభాకాంక్షలు!";
    const issues = wishAudienceIssues(long, 1, "Telugu");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"శ్రేయోభిలాషులు" and "హృదయపూర్వక"');
    expect(issues[0]).toMatch(/^Clip 1/);
    expect(wishAudienceIssues("శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రా తరఫున మా మిత్రులు, కస్టమర్లందరికీ దీపావళి శుభాకాంక్షలు!", 1, "Telugu")).toEqual([]);
  });
});
