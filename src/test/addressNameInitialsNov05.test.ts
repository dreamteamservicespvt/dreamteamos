/**
 * The owner, 2026-11-05: (1) "in script no need to come pincodes or door numbers, just need to cover the main address
 * clearly"; (2) "if the business name is A S aqua solutions it was giving like ఎస్ for some businesses".
 */
import { describe, expect, it } from "vitest";
import { spokenAddressOf } from "@/utils/spokenAddress";
import { speakableLine } from "@/utils/spokenNumbers";
import { withoutUnspokenNumbers } from "@/utils/unspokenNumbers";
import {
  hasInitials, nameWithTeluguInitials, teluguInitialRuns, titleCaseName, withNameInitialsInLine, withSpokenInitials,
} from "@/utils/nameInitials";

describe("the spoken address: the main address, never a door number, pincode, district or state", () => {
  it.each([
    ["Sy.No.123/4, Bypass Road, Kakinada", "Bypass Road, Kakinada"],
    ["Ward No 5, Gandhi Nagar, Kakinada", "Gandhi Nagar, Kakinada"],
    ["No 12, Temple Street, Kakinada", "Temple Street, Kakinada"],
    ["D No 2 45 Main Road Kakinada", "Main Road Kakinada"],
    ["Gr Floor, Shop 3, Sai Plaza, Kakinada", "Sai Plaza, Kakinada"],
    ["Main Road, Jagannaickpur, Kakinada, East Godavari, Andhra Pradesh - 533 002", "Main Road, Jagannaickpur, Kakinada"],
    ["Door No. 4-12 Near Bus Stand Kakinada Andhra Pradesh 533001", "Near Bus Stand Kakinada"],
    ["D.No: 2-45, Main Road, Kakinada - 533001", "Main Road, Kakinada"],
    ["4-12-7, Opposite SBI, Sarpavaram Junction, Kakinada 533005", "Opposite SBI, Sarpavaram Junction, Kakinada"],
  ])("%s → %s", (address, spoken) => {
    expect(spokenAddressOf(address)).toBe(spoken);
  });

  it("keeps a town that is also a district, and a road's own number", () => {
    expect(spokenAddressOf("Main Road, Kakinada")).toBe("Main Road, Kakinada");
    expect(spokenAddressOf("100 Feet Road, Krishna Nagar, Vijayawada")).toBe("100 Feet Road, Krishna Nagar, Vijayawada");
  });
});

describe("a door number or pincode the writer said in WORDS is taken out of the line", () => {
  it.each([
    ["మా షాప్ డోర్ నంబర్ రెండు నలభై ఐదు, మెయిన్ రోడ్, కాకినాడ, పిన్ కోడ్ ఐదు లక్షల ముప్పై మూడు వేల ఒకటి.", "మా షాప్, మెయిన్ రోడ్, కాకినాడ."],
    ["మెయిన్ రోడ్, కాకినాడ, పిన్ కోడ్ ఐదు మూడు మూడు సున్నా సున్నా ఒకటి కి రండి.", "మెయిన్ రోడ్, కాకినాడకి రండి."],
    ["డోర్ నెంబర్ నాలుగు పన్నెండు, మెయిన్ రోడ్ కాకినాడ కి రండి.", "మెయిన్ రోడ్ కాకినాడ కి రండి."],
    ["ప్లాట్ నంబర్ నలభై ఐదు, సాయి నగర్.", "సాయి నగర్."],
    ["Come to Door No. 12, Main Road, Kakinada 533001.", "Come to Main Road, Kakinada."],
    ["Visit us, pincode five three three zero zero one.", "Visit us."],
  ])("%s", (line, want) => {
    expect(withoutUnspokenNumbers(line)).toBe(want);
  });

  it("leaves prices, offers and other numbers alone", () => {
    const line = "ఇప్పుడే రండి, ఇరవై శాతం ఆఫర్, రెండు వందల రూపాయలకే.";
    expect(withoutUnspokenNumbers(line)).toBe(line);
    expect(withoutUnspokenNumbers("Only 499 rupees, 3rd Cross, Main Road.")).toBe("Only 499 rupees, 3rd Cross, Main Road.");
  });

  it("runs on every shipped line (speakableLine)", () => {
    expect(speakableLine("డోర్ నంబర్ రెండు నలభై ఐదు, మెయిన్ రోడ్ కాకినాడలో రండి.", "Telugu")).not.toMatch(/డోర్|నలభై/);
  });
});

describe("initials in a business name are said letter by letter", () => {
  it("finds initials — single capitals, dotted, capitals without a vowel — and not words", () => {
    expect(hasInitials("A S Aqua Solutions")).toBe(true);
    expect(hasInitials("K.V.R. Jewellers")).toBe(true);
    expect(hasInitials("SVR TRADERS")).toBe(true);
    expect(hasInitials("AS Aqua Solutions")).toBe(true);
    expect(hasInitials("SRI SAI KRISHNA INFRA")).toBe(false);
    expect(hasInitials("Sri Balaji Bangles")).toBe(false);
  });

  it("spells the initials in Telugu letters in code", () => {
    expect(teluguInitialRuns("A S Aqua Solutions")).toEqual(["ఏ ఎస్"]);
    expect(teluguInitialRuns("K.V.R. Jewellers")).toEqual(["కే వీ ఆర్"]);
    expect(nameWithTeluguInitials("A S Aqua Solutions", "Telugu")).toBe("ఏ ఎస్ Aqua Solutions");
    expect(nameWithTeluguInitials("A S Aqua Solutions", "Hindi")).toBe("A S Aqua Solutions");
  });

  it("puts the initials right in the model's spelling — dropped, joined or dotted", () => {
    const want = "ఏ ఎస్ ఆక్వా సొల్యూషన్స్";
    expect(withSpokenInitials("ఎస్ ఆక్వా సొల్యూషన్స్", "A S Aqua Solutions", "Telugu")).toBe(want);
    expect(withSpokenInitials("ఏఎస్ ఆక్వా సొల్యూషన్స్", "A S Aqua Solutions", "Telugu")).toBe(want);
    expect(withSpokenInitials("ఏ.ఎస్. ఆక్వా సొల్యూషన్స్", "A S Aqua Solutions", "Telugu")).toBe(want);
    expect(withSpokenInitials("ఆక్వా సొల్యూషన్స్", "A S Aqua Solutions", "Telugu")).toBe(want);
    expect(withSpokenInitials(want, "A S Aqua Solutions", "Telugu")).toBe(want);
    expect(withSpokenInitials("బాలాజీ ఎస్", "Balaji A S", "Telugu")).toBe("బాలాజీ ఏ ఎస్");
    // No initials: the model's spelling as it is.
    expect(withSpokenInitials("శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రా", "SRI SAI KRISHNA INFRA", "Telugu")).toBe("శ్రీ సాయి కృష్ణ ఇన్‌ఫ్రా");
  });

  it("fixes a spoken line that wrote the initials wrong, and never adds them to the words alone", () => {
    const native = "ఏ ఎస్ ఆక్వా సొల్యూషన్స్";
    expect(withNameInitialsInLine("ఎస్ ఆక్వా సొల్యూషన్స్‌లో నీళ్లు శుద్ధం.", native, "A S Aqua Solutions")).toBe("ఏ ఎస్ ఆక్వా సొల్యూషన్స్‌లో నీళ్లు శుద్ధం.");
    expect(withNameInitialsInLine("ఏ ఎస్ ఆక్వా సొల్యూషన్స్‌కి రండి.", native, "A S Aqua Solutions")).toBe("ఏ ఎస్ ఆక్వా సొల్యూషన్స్‌కి రండి.");
    expect(withNameInitialsInLine("మంచి ఆక్వా సొల్యూషన్స్ కావాలా?", native, "A S Aqua Solutions")).toBe("మంచి ఆక్వా సొల్యూషన్స్ కావాలా?");
  });

  it("an English ad keeps the initials as capitals", () => {
    expect(titleCaseName("A S AQUA SOLUTIONS")).toBe("A S Aqua Solutions");
    expect(titleCaseName("SVR JEWELLERS")).toBe("SVR Jewellers");
    expect(titleCaseName("SRI SAI KRISHNA INFRA")).toBe("Sri Sai Krishna Infra");
  });
});
