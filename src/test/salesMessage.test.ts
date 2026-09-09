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
      requirement: {
        modelGender: "female", attireType: "traditional", aspectRatio: "9:16", language: "Telugu",
        businessInfo: "Diwali offer — flat 20% on all paints",
      },
    } as SaleDetail;
    const msg = buildClientSaleMessage(lead, item);
    expect(msg).toContain("Female");
    expect(msg).toContain("Traditional (Designer Saree)");
    expect(msg).toContain("Reel / Story (9:16)");
    expect(msg).toContain("Telugu");
    expect(msg).toContain("Diwali offer — flat 20% on all paints");
  });

  /**
   * The three facts the confirmation used to leave out, which is how a member ended up ringing a
   * client back to ask where their shop was after the ad was already sold.
   */
  it("carries the contact number, the address and what the ad must include", () => {
    const item = {
      category: "wishes", packageKey: "20 Seconds", amount: 499,
      requirement: {
        businessName: "Sri Sairam Paints",
        businessWhatsapp: "+919000011111",
        businessAddress: "12-3-45, MG Road, Kurnool",
        businessInfo: "Paint shop, 18 years old. Please mention the festive 20% offer.",
        modelGender: "female", attireType: "traditional", aspectRatio: "9:16", language: "Telugu",
      },
    } as SaleDetail;
    const msg = buildClientSaleMessage(lead, item);
    expect(msg).toContain("12-3-45, MG Road, Kurnool");
    expect(msg).toContain("Please mention the festive 20% offer.");
    expect(msg).toMatch(/\*Contact:\*/);
    expect(msg).toContain("90000 11111");
  });

  it("falls back to the lead's own number when no business number was typed", () => {
    const item = { category: "promotional", packageKey: "30 Seconds", amount: 999 } as SaleDetail;
    expect(buildClientSaleMessage(lead, item)).toMatch(/\*Contact:\*/);
  });

  /**
   * `notes` is the aside to the tech team — "client is difficult about the logo". It used to be
   * printed to the customer as "Your notes", which is how a production note reached the person it
   * was about. The client-facing box is `businessInfo`; this one goes no further than the queue.
   */
  it("never sends the internal tech note to the client", () => {
    const item = {
      category: "promotional", packageKey: "30 Seconds", amount: 999,
      requirement: { notes: "client is difficult, get the logo signed off first", language: "Telugu" },
    } as SaleDetail;
    const msg = buildClientSaleMessage(lead, item);
    expect(msg).not.toContain("client is difficult");
    expect(msg).not.toContain("Your notes");
  });

  it("states the condition the delivery promise is actually given under", () => {
    const item = {
      category: "promotional", packageKey: "30 Seconds", amount: 999,
      promise: { label: "24 hours" },
    } as SaleDetail;
    const msg = buildClientSaleMessage(lead, item);
    expect(msg).toContain("within 24 hours");
    expect(msg).toContain("confirm your business details before the work begin");
    expect(msg).toContain("we are not responsible");
  });

  it("names the networks a social media month actually covers", () => {
    const starter = {
      category: "social_media_management", packageKey: "Starter Package", amount: 10000,
    } as SaleDetail;
    const pro = { ...starter, packageKey: "Pro Package", amount: 20000 } as SaleDetail;
    expect(buildClientSaleMessage(lead, starter)).toContain("Instagram + Facebook");
    expect(buildClientSaleMessage(lead, starter)).not.toContain("YouTube");
    expect(buildClientSaleMessage(lead, pro)).toContain("Instagram + Facebook + YouTube + LinkedIn");
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

    // The canary: an ordinary ad's confirmation still names the model and the attire.
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

  /**
   * The background used to be a cartoon-only question, so an ordinary ad's confirmation never said
   * where it was set — and the client's photographs, when they sent any, went unused because
   * nobody had told them to send any.
   */
  describe("background, on every ad", () => {
    const adWith = (realLocationProvided?: boolean) => ({
      category: "promotional", packageKey: "30 Seconds", amount: 999,
      requirement: { modelGender: "female", attireType: "traditional", language: "Telugu", realLocationProvided },
    } as unknown as SaleDetail);

    it("confirms their own premises, and asks for the photos", () => {
      const msg = buildClientSaleMessage(lead, adWith(true));
      expect(msg).toContain("your own business background");
      expect(msg).toMatch(/please send us photos of your shop \/ office/i);
    });

    it("confirms a built background when they are not sending photos", () => {
      const msg = buildClientSaleMessage(lead, adWith(false));
      expect(msg).toContain("a custom AI background built for your business");
      expect(msg).not.toMatch(/please send us photos/i);
    });

    it("reads an unanswered background as a built one — which is what those ads got", () => {
      expect(buildClientSaleMessage(lead, adWith(undefined)))
        .toContain("a custom AI background built for your business");
    });

    it("says nothing about a background on a service that has none", () => {
      const site = { category: "website", packageKey: "Website (Starting From)", amount: 4999 } as SaleDetail;
      expect(buildClientSaleMessage(lead, site)).not.toContain("Background:");
    });
  });
});
