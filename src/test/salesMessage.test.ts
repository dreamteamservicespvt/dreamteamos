import { describe, it, expect } from "vitest";
import { buildClientSaleMessage } from "@/utils/salesMessage";
import type { Lead, SaleDetail } from "@/types";

/**
 * The client confirmation the sales member sends on WhatsApp. It must carry the client's own
 * order back to them accurately — business, service, delivery promise, and (for ads) the brief —
 * without leaking anything internal.
 */

const lead = { id: "l1", phone: "+919876543210", displayName: "Ramesh", realName: "Sharma Electronics" } as Lead;

describe("buildClientSaleMessage", () => {
  it("confirms the core order facts", () => {
    const item = {
      category: "promotional", packageKey: "30 Seconds + Poster", amount: 999,
      promise: { label: "24 hours" },
    } as SaleDetail;
    const msg = buildClientSaleMessage(lead, item);
    expect(msg).toContain("Sharma Electronics");
    expect(msg).toContain("Promotional Ad");
    expect(msg).toContain("30 Seconds + Poster");
    expect(msg).toContain("₹999");
    expect(msg).toContain("within 24 hours");
  });

  it("spells out the ad brief in client-friendly terms", () => {
    const item = {
      category: "cinematic", packageKey: "custom", amount: 1999,
      requirement: { modelGender: "female", attireType: "traditional", aspectRatio: "9:16", language: "Telugu", notes: "Diwali offer" },
    } as SaleDetail;
    const msg = buildClientSaleMessage(lead, item);
    expect(msg).toContain("Female");
    expect(msg).toContain("Traditional (Designer Saree)");
    expect(msg).toContain("Reel / Story (9:16)");
    expect(msg).toContain("Telugu");
    expect(msg).toContain("Diwali offer");
  });

  it("omits the ad section for a non-ad service", () => {
    const item = { category: "website", packageKey: "Website (Starting From)", amount: 4999 } as SaleDetail;
    const msg = buildClientSaleMessage(lead, item);
    expect(msg).toContain("Website Development");
    expect(msg).not.toContain("Model:");
    expect(msg).not.toContain("Attire:");
  });

  it("never leaks a custom package label or a zero amount", () => {
    const item = { category: "promotional", packageKey: "custom", amount: 0 } as SaleDetail;
    const msg = buildClientSaleMessage(lead, item);
    expect(msg).not.toContain("custom");
    expect(msg).not.toContain("₹0");
  });

  /**
   * A special-category sale was confirming "Model: Female — Attire: Designer Saree" back to a
   * client who had bought a cartoon-duo ad: a description of someone who never appears, in the
   * client's own receipt.
   */
  describe("special-category sale", () => {
    const packSale = (realLocationProvided: boolean) => ({
      category: "promotional", packageKey: "30 Seconds", amount: 999,
      requirement: {
        specialCategory: "motu_patlu", realLocationProvided,
        modelGender: "female", attireType: "traditional",
        aspectRatio: "9:16", language: "Telugu",
      },
    } as unknown as SaleDetail);

    // Colour-marked and bold: on a phone this is the line the client is excited about, and the
    // one the member wants to be sure landed.
    it("tells the client who is actually in their ad, highlighted", () => {
      const msg = buildClientSaleMessage(lead, packSale(true));
      expect(msg).toContain("🟠 *MOTU* & 🔵 *PATLU*");
      expect(msg).toMatch(/Both characters speak in every clip/i);
    });

    it("never describes a human model that will not appear", () => {
      const msg = buildClientSaleMessage(lead, packSale(true));
      expect(msg).not.toContain("*Model:*");
      expect(msg).not.toContain("*Attire:*");
      expect(msg).not.toContain("Designer Saree");
    });

    it("confirms their own background when they are sending photos, and asks for them", () => {
      const msg = buildClientSaleMessage(lead, packSale(true));
      expect(msg).toContain("your own business background");
      expect(msg).toMatch(/please send us photos of your shop \/ office/i);
    });

    it("confirms an AI background when they are not, and does not ask for photos", () => {
      const msg = buildClientSaleMessage(lead, packSale(false));
      expect(msg).toContain("a custom AI background built for your business");
      expect(msg).not.toMatch(/please send us photos/i);
    });

    it("still carries the shared details a pack ad does have", () => {
      const msg = buildClientSaleMessage(lead, packSale(false));
      expect(msg).toContain("Reel / Story (9:16)");
      expect(msg).toContain("Telugu");
    });

    // The canary: an ordinary ad's confirmation must read exactly as it always did.
    it("leaves a normal ad's confirmation untouched", () => {
      const item = {
        category: "promotional", packageKey: "30 Seconds", amount: 999,
        requirement: { modelGender: "female", attireType: "traditional", aspectRatio: "9:16", language: "Telugu" },
      } as SaleDetail;
      const msg = buildClientSaleMessage(lead, item);
      expect(msg).toContain("*Model:* Female");
      expect(msg).toContain("Traditional (Designer Saree)");
      expect(msg).not.toMatch(/motu|patlu|starring/i);
    });
  });
});
