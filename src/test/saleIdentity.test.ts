/**
 * Every sale's one permanent id (2026-10-08) — utils/saleIdentity. The id must be the one every
 * existing order already carries (no migration), must not move when an earlier sale is deleted, and
 * must not depend on how a timestamp came back from the database.
 */
import { describe, it, expect } from "vitest";
import {
  timestampMs, newSaleId, saleIdOf, orderIdOfSale, orderIdOfSaleId, saleIdOfOrderId, findSaleIndex,
  withSaleIds, leadHoldsSaleOf, leadSaleItems,
} from "@/utils/saleIdentity";
import type { SaleDetail } from "@/types";

const ts = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6, toMillis: () => ms });
const item = (over: Partial<SaleDetail> = {}) => ({ category: "promotional", amount: 999, ...over }) as SaleDetail;

describe("timestampMs", () => {
  it("reads a Firestore Timestamp, and a plain {seconds, nanoseconds} exactly — milliseconds included", () => {
    expect(timestampMs(ts(1_790_000_000_123))).toBe(1_790_000_000_123);
    // A timestamp that went through JSON: it used to lose its milliseconds (a different order id).
    expect(timestampMs({ seconds: 1_790_000_000, nanoseconds: 123_000_000 })).toBe(1_790_000_000_123);
    expect(timestampMs({ seconds: 1_700_000_000 })).toBe(1_700_000_000_000);
    expect(timestampMs(null)).toBe(0);
  });
});

describe("saleIdOf / orderIdOfSale — the id orders already have", () => {
  it("is the stored saleId when there is one", () => {
    expect(saleIdOf("lead1", item({ saleId: "lead1_42", submittedAt: ts(99) }), 3)).toBe("lead1_42");
    expect(orderIdOfSale("lead1", item({ saleId: "lead1_42" }), 3)).toBe("o_lead1_42");
  });

  it("is orders.orderDocId's old id for a sale recorded before saleId existed", () => {
    const old = item({ submittedAt: ts(1_700_000_000_000) });
    expect(orderIdOfSale("lead1", old, 0)).toBe("o_lead1_1700000000000");
    expect(orderIdOfSale("lead1", old, 5)).toBe("o_lead1_1700000000000"); // the position does not matter
    expect(orderIdOfSale("lead1", item(), 2)).toBe("o_lead1__2"); // the oldest sales: their position
  });

  it("reads back from an order id", () => {
    expect(orderIdOfSaleId(newSaleId("lead1", 5))).toBe("o_lead1_5");
    expect(saleIdOfOrderId("o_lead1_5")).toBe("lead1_5");
    expect(saleIdOfOrderId("o_lead1__2")).toBe("lead1__2");
    expect(saleIdOfOrderId("something")).toBe("");
  });
});

describe("finding a sale by its id, not its position", () => {
  const items = [item({ submittedAt: ts(1000) }), item({ saleId: "lead1_2000" }), item()];

  it("finds each sale wherever it sits", () => {
    expect(findSaleIndex("lead1", items, "lead1_1000")).toBe(0);
    expect(findSaleIndex("lead1", items, "lead1_2000")).toBe(1);
    expect(findSaleIndex("lead1", items, "lead1__2")).toBe(2);
    expect(findSaleIndex("lead1", items, "lead1_3000")).toBe(-1);
  });

  it("stamps every sale with the id it has now, so a later delete cannot move it", () => {
    const stamped = withSaleIds("lead1", items);
    expect(stamped.map((s) => s.saleId)).toEqual(["lead1_1000", "lead1_2000", "lead1__2"]);
    // Delete the first: the undated one keeps the id its order was made under.
    const after = stamped.slice(1);
    expect(findSaleIndex("lead1", after, "lead1__2")).toBe(1);
    expect(stamped[1]).toBe(items[1]); // an entry that had its id is left as it was
  });

  it("reads a lead's legacy single sale too", () => {
    expect(leadSaleItems({ saleDetails: item() } as never)).toHaveLength(1);
    expect(leadSaleItems(null)).toEqual([]);
  });
});

describe("leadHoldsSaleOf — is an order's sale still on its lead?", () => {
  const lead = (items: SaleDetail[]) => ({ saleItems: items });

  it("by id, by the recorded millisecond, or by the second a timestamp was read without its milliseconds", () => {
    expect(leadHoldsSaleOf({ id: "o_lead1_1000", leadId: "lead1" }, lead([item({ submittedAt: ts(1000) })]))).toBe(true);
    expect(leadHoldsSaleOf({ id: "o_lead1_x", leadId: "lead1", saleSubmittedAtMs: 1500 }, lead([item({ submittedAt: ts(1500) })]))).toBe(true);
    expect(leadHoldsSaleOf({ id: "o_lead1_x", leadId: "lead1", saleSubmittedAtMs: 1000 }, lead([item({ submittedAt: ts(1999) })]))).toBe(true);
  });

  it("is false when the lead is gone, has no sales, or no longer has that sale", () => {
    expect(leadHoldsSaleOf({ id: "o_lead1_1000", leadId: "lead1" }, null)).toBe(false);
    expect(leadHoldsSaleOf({ id: "o_lead1_1000", leadId: "lead1" }, lead([]))).toBe(false);
    expect(leadHoldsSaleOf({ id: "o_lead1_1000", leadId: "lead1", saleSubmittedAtMs: 1000 }, lead([item({ submittedAt: ts(5000) })]))).toBe(false);
  });

  it("never calls an order from the oldest sales (keyed on a position) orphaned while an undated sale is left", () => {
    expect(leadHoldsSaleOf({ id: "o_lead1__3", leadId: "lead1", saleSubmittedAtMs: 0 }, lead([item()]))).toBe(true);
    expect(leadHoldsSaleOf({ id: "o_lead1__3", leadId: "lead1", saleSubmittedAtMs: 0 }, lead([item({ submittedAt: ts(5000) })]))).toBe(false);
  });
});
