/**
 * The invoice calculation engine (utils/invoiceMath) — the one formula behind the editor, the
 * preview, the PDF and the list. The owner's own invoice (Inv. 4232, 31-08-2025) is the anchor:
 * ₹17,400 with 18% GST inside it → 14,745.76 + 1,327.12 + 1,327.12.
 */
import { describe, expect, it } from "vitest";
import { computeInvoice, formatPaise, formatQuantity, roundHalfUp, toPaise } from "@/utils/invoiceMath";
import type { InvoiceContent, InvoiceItem } from "@/types/invoice";

let n = 0;
const item = (over: Partial<InvoiceItem> = {}): InvoiceItem => ({
  id: `i${++n}`, name: "Social Media Management", description: "", sac: "", quantity: 1, rate: 0,
  discountKind: "percent", discountValue: 0, taxRate: 18, ...over,
});

type Input = Pick<InvoiceContent, "items" | "tax" | "roundOff"> & { seller: { gstin: string } };
const invoice = (items: InvoiceItem[], tax: Partial<InvoiceContent["tax"]> = {}, roundOff = false): Input => ({
  items,
  roundOff,
  seller: { gstin: "37FWQPR6939Q1ZY" },
  tax: { mode: "gst", pricesIncludeTax: false, placeOfSupply: "37", defaultRate: 18, ...tax },
});

describe("the owner's invoice, Inv. 4232", () => {
  it("₹17,400 inclusive of 18% splits exactly as it was printed", () => {
    const t = computeInvoice(invoice([item({ rate: 17400 })], { pricesIncludeTax: true }));
    expect(t.taxable).toBe(1474576);
    expect(t.cgst).toBe(132712);
    expect(t.sgst).toBe(132712);
    expect(t.igst).toBe(0);
    expect(t.grandTotal).toBe(1740000);
    expect(t.subtotal).toBe(1474576);
    // A one-unit line reads Rate = Amount, as on the printed invoice.
    expect(t.lines[0].displayRate).toBe(1474576);
    expect(t.lines[0].amount).toBe(1474576);
  });

  it("typing the pre-tax rate gives the same invoice", () => {
    const t = computeInvoice(invoice([item({ rate: 14745.76 })]));
    expect([t.taxable, t.cgst, t.sgst, t.grandTotal]).toEqual([1474576, 132712, 132712, 1740000]);
  });
});

describe("CGST + SGST or IGST", () => {
  it("another state's place of supply is IGST at the full rate", () => {
    const t = computeInvoice(invoice([item({ rate: 14745.76 })], { placeOfSupply: "29" }));
    expect(t.supply).toBe("inter");
    expect(t.igst).toBe(265424);
    expect(t.cgst + t.sgst).toBe(0);
    expect(t.grandTotal).toBe(1740000);
  });

  it("IGST inside an inclusive price leaves the price untouched", () => {
    const t = computeInvoice(invoice([item({ rate: 17400 })], { placeOfSupply: "27", pricesIncludeTax: true }));
    expect(t.igst).toBe(265424);
    expect(t.taxable).toBe(1474576);
    expect(t.grandTotal).toBe(1740000);
  });

  it("an empty place of supply means the seller's own state", () => {
    expect(computeInvoice(invoice([item({ rate: 100 })], { placeOfSupply: "" })).supply).toBe("intra");
  });

  it("No GST prints no tax at all, whatever the lines say", () => {
    const t = computeInvoice(invoice([item({ rate: 1000, taxRate: 18 })], { mode: "none", pricesIncludeTax: true }));
    expect(t.supply).toBe("none");
    expect(t.tax).toBe(0);
    expect(t.buckets.every((b) => b.tax === 0)).toBe(true);
    expect(t.grandTotal).toBe(100000);
  });
});

describe("inclusive prices keep CGST equal to SGST and the total exact", () => {
  it("₹10 at 18%: 8.48 + 0.76 + 0.76", () => {
    const t = computeInvoice(invoice([item({ rate: 10 })], { pricesIncludeTax: true }));
    expect(t.cgst).toBe(76);
    expect(t.sgst).toBe(76);
    expect(t.taxable).toBe(848);
    expect(t.grandTotal).toBe(1000);
    expect(t.lines[0].displayRate).toBe(848);
  });

  it("holds for any mix of lines, quantities, discounts and rates (random check)", () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let run = 0; run < 300; run++) {
      const rates = [0, 5, 12, 18, 28];
      const items = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => item({
        quantity: Math.round(rnd() * 500) / 100 || 1,
        rate: Math.round(rnd() * 5000000) / 100,
        discountKind: rnd() < 0.5 ? "percent" : "amount",
        discountValue: rnd() < 0.4 ? Math.round(rnd() * 3000) / 100 : 0,
        taxRate: rates[Math.floor(rnd() * rates.length)],
      }));
      const inclusive = rnd() < 0.5;
      const inter = rnd() < 0.3;
      const t = computeInvoice(invoice(items, { pricesIncludeTax: inclusive, placeOfSupply: inter ? "29" : "37" }));
      const sumNet = t.lines.reduce((s, l) => s + l.net, 0);
      const sumAmount = t.lines.reduce((s, l) => s + l.amount, 0);
      const sumLineTax = t.lines.reduce((s, l) => s + l.tax, 0);
      expect(sumAmount).toBe(t.taxable);
      expect(t.subtotal - t.discount).toBe(t.taxable);
      expect(sumLineTax).toBe(t.tax);
      expect(t.grandTotal).toBe(t.taxable + t.tax);
      if (inclusive) expect(t.grandTotal).toBe(sumNet);
      else expect(t.taxable).toBe(sumNet);
      for (const b of t.buckets) {
        if (inter) expect(b.cgst + b.sgst).toBe(0);
        else expect(b.cgst).toBe(b.sgst);
      }
      for (const v of [t.taxable, t.tax, t.grandTotal, t.cgst, t.sgst, t.igst]) expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("discounts", () => {
  it("a percentage comes off the line before GST", () => {
    const t = computeInvoice(invoice([item({ quantity: 2, rate: 1000, discountValue: 10 })]));
    expect(t.lines[0].discount).toBe(20000);
    expect(t.subtotal).toBe(200000);
    expect(t.discount).toBe(20000);
    expect(t.taxable).toBe(180000);
    expect(t.cgst).toBe(16200);
    expect(t.grandTotal).toBe(212400);
    expect(t.hasDiscount).toBe(true);
  });

  it("a rupee discount never takes a line below zero, nor a percentage above 100", () => {
    const flat = computeInvoice(invoice([item({ rate: 500, discountKind: "amount", discountValue: 900 })]));
    expect(flat.lines[0].net).toBe(0);
    const pct = computeInvoice(invoice([item({ rate: 500, discountValue: 250 })]));
    expect(pct.lines[0].net).toBe(0);
  });

  it("an inclusive discount is shown before GST and still adds up", () => {
    const t = computeInvoice(invoice([item({ rate: 11800, discountKind: "amount", discountValue: 1180 })], { pricesIncludeTax: true }));
    expect(t.grandTotal).toBe(1062000);
    expect(t.discount).toBe(100000);
    expect(t.subtotal - t.discount).toBe(t.taxable);
  });
});

describe("rates, rounding and the lines that print", () => {
  it("groups the tax by rate and flags mixed rates for a GST column", () => {
    const t = computeInvoice(invoice([item({ rate: 1000, taxRate: 18 }), item({ rate: 1000, taxRate: 5 })]));
    expect(t.buckets.map((b) => b.rate)).toEqual([5, 18]);
    expect(t.mixedRates).toBe(true);
    expect(t.cgst).toBe(2500 + 9000);
  });

  it("rounds the total to the rupee only when asked, and says by how much", () => {
    const off = computeInvoice(invoice([item({ rate: 100.4, taxRate: 0 })], {}, true));
    expect(off.roundOff).toBe(-40);
    expect(off.grandTotal).toBe(10000);
    const up = computeInvoice(invoice([item({ rate: 100.5, taxRate: 0 })], {}, true));
    expect(up.roundOff).toBe(50);
    expect(computeInvoice(invoice([item({ rate: 100.4, taxRate: 0 })])).roundOff).toBe(0);
  });

  it("never prints a blank line, and numbers the rest without gaps", () => {
    const t = computeInvoice(invoice([item({ rate: 10 }), item({ name: "", rate: 0 }), item({ rate: 20, sac: "998361" })]));
    expect(t.lines.map((l) => l.number)).toEqual([1, 0, 2]);
    expect(t.printedCount).toBe(2);
    expect(t.hasSac).toBe(true);
  });

  it("is immune to float noise: 3 × 333.33 is 999.99", () => {
    expect(computeInvoice(invoice([item({ quantity: 3, rate: 333.33, taxRate: 0 })])).grandTotal).toBe(99999);
    // 132711.49999999998 is how a float spells 132711.5 after a multiplication — it must round up.
    expect(roundHalfUp(132711.49999999998)).toBe(132712);
    expect(roundHalfUp(132711.5)).toBe(132712);
    expect(roundHalfUp(132711.4999)).toBe(132711);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });

  it("treats rubbish as zero rather than NaN", () => {
    const t = computeInvoice(invoice([item({ quantity: NaN, rate: -5 }), item({ quantity: "2" as unknown as number, rate: "abc" as unknown as number })]));
    expect(t.grandTotal).toBe(0);
    expect(computeInvoice({ items: undefined as unknown as InvoiceItem[], tax: undefined as never, roundOff: false }).grandTotal).toBe(0);
  });
});

describe("printing money", () => {
  it("uses Indian grouping, two decimals and a real minus", () => {
    expect(formatPaise(1740000)).toBe("17,400.00");
    expect(formatPaise(12345678)).toBe("1,23,456.78");
    expect(formatPaise(1740000, { symbol: true })).toBe("₹17,400.00");
    expect(formatPaise(-40)).toBe("−0.40");
    expect(formatPaise(NaN)).toBe("0.00");
  });
  it("writes quantities as people do", () => {
    expect(formatQuantity(1)).toBe("1");
    expect(formatQuantity(2.5)).toBe("2.5");
    expect(formatQuantity(1.2346)).toBe("1.235");
  });
});
