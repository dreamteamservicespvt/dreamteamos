import { describe, expect, it } from "vitest";
import {
  addressInText, factsFromProfile, findPhoneNumbers, isMisreadOf, isPlaceholderNumber, isWellFormedNumber,
  sanitizeBusinessProfile, stripUnverifiedNumbers, verifyBusinessFacts, verifiedKeys,
} from "@/utils/businessFacts";

describe("finding the numbers a member typed", () => {
  it("reads each number as written, once, in order", () => {
    const found = findPhoneNumbers("Call 98480 12345 or +91 91603-45678. Office: 0884-2345678");
    expect(found.map((p) => p.display)).toEqual(["98480 12345", "+91 91603-45678", "0884-2345678"]);
  });

  it("never joins a number to the next line", () => {
    const found = findPhoneNumbers("Phone: 9848012345\n2024 established");
    expect(found.map((p) => p.display)).toEqual(["9848012345"]);
  });

  it("splits two mobiles separated only by a space", () => {
    expect(findPhoneNumbers("Contact 9848012345 9160345678").map((p) => p.display)).toEqual(["9848012345", "9160345678"]);
  });

  it("is not fooled by dates, year ranges, pincodes or prices", () => {
    expect(findPhoneNumbers("Admissions 2025-2026, from 12-06-2025, PIN 533001, fee Rs 1,20,000")).toEqual([]);
  });

  it("knows a WhatsApp number when it is called one", () => {
    const [call, wa] = findPhoneNumbers("Call: 9848012345, WhatsApp: 9160345678");
    expect(call.whatsapp).toBe(false);
    expect(wa.whatsapp).toBe(true);
  });
});

describe("what counts as a real number", () => {
  it("recognises placeholders", () => {
    for (const fake of ["9876543210", "98765 43210", "1234567890", "9999999999", "0000000000"]) {
      expect(isPlaceholderNumber(fake)).toBe(true);
    }
    expect(isPlaceholderNumber("9848012345")).toBe(false);
  });

  it("accepts mobiles, landlines with STD code, toll-free and numbers abroad", () => {
    for (const ok of ["9848012345", "+91 98480 12345", "0884-2345678", "1800 123 4567", "+1 415 555 0133"]) {
      expect(isWellFormedNumber(ok)).toBe(true);
    }
    expect(isWellFormedNumber("5848012345")).toBe(false);
  });

  it("spots a misreading", () => {
    expect(isMisreadOf("9848012345", "9848012346")).toBe(true);
    expect(isMisreadOf("9848012345", "9848021345")).toBe(true);
    expect(isMisreadOf("9848012345", "9160345678")).toBe(false);
  });
});

describe("verifying the extraction", () => {
  it("keeps the typed number and drops one the model invented from nothing", () => {
    const facts = verifyBusinessFacts({
      typedText: "Sri Sai Traders. Call 98480 12345.",
      profile: { contact: { phone: "98480 12345", whatsapp: "+91 90000 11111" } },
      hasContactDocuments: false,
    });
    expect(facts.phones.map((p) => p.display)).toEqual(["98480 12345"]);
    expect(facts.rejected[0].reason).toMatch(/no card, flyer or premises photo/);
  });

  it("uses the typed spelling when the model changed a digit", () => {
    const facts = verifyBusinessFacts({
      typedText: "Phone 9848012345",
      profile: { phone: "9848012346" },
      hasContactDocuments: true,
    });
    expect(facts.phones.map((p) => p.display)).toEqual(["9848012345"]);
    expect(facts.rejected[0].reason).toMatch(/misreading/);
  });

  it("takes a number read from a visiting card, unless it is a stand-in", () => {
    const facts = verifyBusinessFacts({
      typedText: "",
      profile: { contactInformation: { phoneNumbers: ["91603 45678", "98765 43210"], whatsapp: "Not provided" } },
      hasContactDocuments: true,
    });
    expect(facts.phones.map((p) => p.display)).toEqual(["91603 45678"]);
    expect(facts.phones[0].whatsapp).toBe(false);
  });

  it("keeps up to three in order, typed first", () => {
    const facts = verifyBusinessFacts({
      typedText: "Call 9848012345",
      profile: { phones: "9160345678, 0884 2345678" },
      hasContactDocuments: true,
    });
    expect(facts.phones.map((p) => [p.display, p.source])).toEqual([
      ["9848012345", "typed"], ["9160345678", "document"], ["0884 2345678", "document"],
    ]);
  });

  it("uses a typed address word for word, and drops one the model made up", () => {
    const typed = verifyBusinessFacts({
      typedText: "Address: D.No 12-4, Main Road, Kakinada",
      profile: { fullAddress: "12-4 Main Rd, Kakinada, Andhra Pradesh 533001" },
      hasContactDocuments: false,
    });
    expect(typed.address).toBe("D.No 12-4, Main Road, Kakinada");

    const invented = verifyBusinessFacts({
      typedText: "Best biryani in town. Call 9848012345.",
      profile: { address: "Plot 45, Jubilee Hills, Hyderabad" },
      hasContactDocuments: false,
    });
    expect(invented.address).toBe("");
    expect(invented.rejected.some((r) => r.value.includes("Jubilee"))).toBe(true);
  });

  it("never treats 'Not provided' or a stand-in as an address", () => {
    for (const address of ["Not provided", "N/A", "Your shop address here", "123 Main Street"]) {
      expect(verifyBusinessFacts({ typedText: "", profile: { address }, hasContactDocuments: true }).address).toBe("");
    }
  });

  it("reads an address typed on the line after its label", () => {
    expect(addressInText("Address:\nNear RTC Complex, Rajahmundry")).toBe("Near RTC Complex, Rajahmundry");
  });
});

describe("the profile every later prompt reads", () => {
  it("carries only the verified numbers and address, and no 'Not provided'", () => {
    const profile = {
      businessName: "Sri Sai Traders",
      contact: { phone: "9848012345", whatsapp: "Not provided", email: "Not provided" },
      fullAddress: "Plot 45, Jubilee Hills, Hyderabad",
      city: "Hyderabad",
      tagline: "Call 90000 11111 for offers",
      yearsInBusiness: "20",
    };
    const input = { typedText: "Sri Sai Traders, Call 9848012345", hasContactDocuments: false };
    const facts = verifyBusinessFacts({ ...input, profile });
    const clean = sanitizeBusinessProfile(profile, facts, input);
    expect(clean.contactNumbers).toEqual(["9848012345"]);
    expect(clean).not.toHaveProperty("whatsappNumber");
    expect(clean).not.toHaveProperty("address");
    expect(clean).not.toHaveProperty("fullAddress");
    expect(clean).not.toHaveProperty("city");
    expect(clean.yearsInBusiness).toBe("20");
    expect(JSON.stringify(clean)).not.toMatch(/Not provided|90000/);
    // …and it reads back as the same facts.
    expect(factsFromProfile(clean).phones.map((p) => p.display)).toEqual(["9848012345"]);
  });
});

describe("scrubbing a model's output", () => {
  it("removes a number that is not verified, with its label, and leaves everything else", () => {
    const facts = verifyBusinessFacts({ typedText: "Call 9848012345", profile: {}, hasContactDocuments: false });
    const out = stripUnverifiedNumbers("Bottom line: 📞 9848012345 | 📞 98765 43210\nPIN 533001, 1080x1350, Rs 12500", verifiedKeys(facts));
    expect(out).toContain("9848012345");
    expect(out).not.toContain("43210");
    expect(out).toContain("533001");
    expect(out).toContain("1080x1350");
  });

  it("does not delete an ordinary word that happens to end a line", () => {
    const out = stripUnverifiedNumbers("Show the contact\nCall: 9000011111", []);
    expect(out).toContain("Show the contact");
    expect(out).not.toMatch(/9000011111/);
  });
});
