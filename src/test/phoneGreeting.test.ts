import { describe, it, expect } from "vitest";
import { buildLeadGreeting, normalizePhone, phoneLockId, getWhatsAppUrl } from "@/utils/phone";

describe("buildLeadGreeting", () => {
  it("greets the client by name and signs with the member's name", () => {
    const g = buildLeadGreeting("Ramesh", "Govardhan");
    expect(g).toContain("Hi Ramesh,");
    expect(g).toContain("I'm Govardhan from DREAM TEAM SERVICES");
    expect(g).toContain("Please check our sample works once");
  });

  it("falls back to 'Sir' when no client name", () => {
    expect(buildLeadGreeting(null, "Govardhan")).toContain("Hi Sir,");
    expect(buildLeadGreeting("", "Govardhan")).toContain("Hi Sir,");
  });

  it("omits the personal name cleanly when sender is missing", () => {
    expect(buildLeadGreeting("Ramesh", "")).toContain("I'm from DREAM TEAM SERVICES");
  });
});

describe("phone helpers used by orders/clients", () => {
  it("normalizes a 10-digit Indian number", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
  });
  it("derives a stable digits-only lock id (also the client doc id)", () => {
    expect(phoneLockId("9876543210")).toBe("919876543210");
    expect(phoneLockId("+91 98765 43210")).toBe("919876543210");
  });
  it("builds a WhatsApp url with a prefilled greeting", () => {
    expect(getWhatsAppUrl("9876543210")).toBe("https://wa.me/919876543210");
    expect(getWhatsAppUrl("9876543210", "Hi")).toBe("https://wa.me/919876543210?text=Hi");
  });
});
