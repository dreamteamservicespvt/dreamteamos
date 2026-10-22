import { describe, expect, it } from "vitest";
import { hasUnspokenNumbers, withoutUnspokenNumbers } from "@/utils/unspokenNumbers";
import { speakableLine } from "@/utils/spokenNumbers";
import { spokenAddressOf } from "@/utils/spokenAddress";

// The owner (2026-10-22): no pincode, door number or phone number is ever spoken in a voice-over.
describe("withoutUnspokenNumbers — phone numbers", () => {
  it("removes a mobile with the words that introduced it, keeping the action", () => {
    expect(withoutUnspokenNumbers("Call us on 98480 12345 today.")).toBe("Call us today.");
    expect(withoutUnspokenNumbers("Visit us today. Call us on +91-98480-12345.")).toBe("Visit us today. Call us.");
    expect(withoutUnspokenNumbers("Phone: 9848012345, we are open all day.")).toBe("we are open all day.");
  });

  it("removes two numbers joined by 'or' as one gap", () => {
    expect(withoutUnspokenNumbers("Call 98480 12345 or 0884-2345678 now.")).toBe("Call now.");
    expect(withoutUnspokenNumbers("Book now, call 98480 12345 / 99887 76655.")).toBe("Book now, call.");
  });

  it("removes a Telugu phone label and the case ending glued to the number", () => {
    expect(withoutUnspokenNumbers("ఫోన్ నంబర్ 98480 12345కి ఇప్పుడే కాల్ చేయండి.")).toBe("ఇప్పుడే కాల్ చేయండి.");
  });

  it("removes a number already read out digit by digit, in Telugu or English", () => {
    expect(withoutUnspokenNumbers("call nine eight four eight zero one two three four five now")).toBe("call now");
    expect(withoutUnspokenNumbers("తొమ్మిది ఎనిమిది నాలుగు ఎనిమిది సున్నా ఒకటి రెండు మూడు నాలుగు ఐదు కి కాల్ చేయండి"))
      .toBe("కాల్ చేయండి");
  });

  it("removes a short landline only when a phone label says so", () => {
    expect(withoutUnspokenNumbers("Ph: 2345678. Come soon.")).toBe("Come soon.");
    expect(withoutUnspokenNumbers("Over 2345678 happy customers.")).toBe("Over 2345678 happy customers.");
  });
});

describe("withoutUnspokenNumbers — pincodes and door numbers", () => {
  it("removes a pincode, written whole, split 3 + 3 or labelled", () => {
    expect(withoutUnspokenNumbers("Come to Main Road, Kakinada 533001.")).toBe("Come to Main Road, Kakinada.");
    expect(withoutUnspokenNumbers("Come to Kakinada-533 001 today.")).toBe("Come to Kakinada today.");
    expect(withoutUnspokenNumbers("Kakinada, PIN: 533 001.")).toBe("Kakinada.");
    expect(withoutUnspokenNumbers("కాకినాడ పిన్ కోడ్ 533001 లో మా షాప్.")).toBe("కాకినాడలో మా షాప్."); // the ending stays the town's (2026-10-22, night — was "కాకినాడ లో")
  });

  it("removes a door number, labelled or by its shape, and keeps the street", () => {
    expect(withoutUnspokenNumbers("Visit us at D.No 5-87/1, Main Road, Kakinada.")).toBe("Visit us at Main Road, Kakinada.");
    expect(withoutUnspokenNumbers("Visit us at 12-3-45, Gandhi Nagar.")).toBe("Visit us at Gandhi Nagar.");
    expect(withoutUnspokenNumbers("Door No: 4-12A Temple Street.")).toBe("Temple Street.");
    expect(withoutUnspokenNumbers("డోర్ నంబర్ 5-87, మెయిన్ రోడ్, కాకినాడ.")).toBe("మెయిన్ రోడ్, కాకినాడ.");
  });

  it("keeps prices, offers, years, times, ranges, rankings and road names", () => {
    const kept = [
      "Only ₹999, 20% off, since 1998, open 9:30 to 9:00, 10-20 designs, 24/7 service.",
      "No.1 showroom in town, #1 choice, our 1st branch.",
      "On 100 Feet Road, 3rd Cross, near 12th Main.",
      "Rs. 1,50,000 plots and 100000 rupees cash back.",
      "Offer till 31-10-2026 only.",
      "one two three — easy steps.",
    ];
    for (const line of kept) {
      expect(withoutUnspokenNumbers(line)).toBe(line);
      expect(hasUnspokenNumbers(line)).toBe(false);
    }
  });

  it("is idempotent", () => {
    const once = withoutUnspokenNumbers("Visit us at D.No 5-87, Main Road, Kakinada 533001. Call 98480 12345.");
    expect(once).toBe("Visit us at Main Road, Kakinada. Call.");
    expect(withoutUnspokenNumbers(once)).toBe(once);
  });
});

describe("every spoken line goes through it", () => {
  it("speakableLine never reads a phone number, pincode or door number", () => {
    expect(speakableLine("Call 98480 12345 today, only Rs. 999.", "English")).toBe("Call today, only nine hundred ninety-nine rupees.");
    const te = speakableLine("కాకినాడ 533001 లో మా షాప్ కి రండి, ఫోన్ 9848012345 కి కాల్ చేయండి.", "Telugu");
    expect(te).not.toMatch(/\d/);
    expect(te).not.toContain("లక్షల");
    expect(te).not.toContain("తొమ్మిది ఎనిమిది");
  });

  it("the spoken address drops an unlabelled door number and a spaced pincode", () => {
    expect(spokenAddressOf("5-87/1 Main Road, Kakinada-533 001")).toBe("Main Road, Kakinada");
    expect(spokenAddressOf("5-87 Gandhi Road, Opp. Bus Stand, Kakinada, Pin: 533 001")).toBe("Gandhi Road, opposite Bus Stand, Kakinada");
    expect(spokenAddressOf("100 Feet Road, Kakinada")).toBe("100 Feet Road, Kakinada");
  });
});
